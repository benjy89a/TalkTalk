// 미읽음·멘션 상태 저장소 (D-2, D-3)
//
// 사이드바에서 useUnread / UnreadBadge 를 여러 군데 써도
// DB 요청과 Realtime 구독은 이 파일 하나에서만 한 번 일어나도록 모아 두었다.
// 화면 코드는 이 파일을 직접 쓰지 말고 useUnread / UnreadBadge 를 쓴다.
import { createClient } from "@/lib/supabase/client";
import type { Message } from "@/types/database";
import { markAsRead, READ_EVENT, type ReadEventDetail } from "./markAsRead";
import { escapeLike, mentionsName } from "./mentions";
import { MENTION_EVENT, type MentionEventDetail } from "./notifyRules";
import {
  applyInsert,
  applyRead,
  applyUpdate,
  MAX_MENTIONS,
  type ChannelReadState,
} from "./unreadRules";

export type { ChannelReadState };

export type UnreadSnapshot = {
  myId: string | null;
  myName: string | null;
  channels: Record<string, ChannelReadState>;
};

const EMPTY: UnreadSnapshot = { myId: null, myName: null, channels: {} };

let state: UnreadSnapshot = EMPTY;
const listeners = new Set<() => void>();
let stop: (() => void) | null = null;
let refreshSeq = 0; // 늦게 도착한 예전 요청 결과가 최신 결과를 덮지 않게

function setState(next: UnreadSnapshot) {
  if (next === state) return;
  state = next;
  listeners.forEach((l) => l());
}

function updateChannel(channelId: string, fn: (cur: ChannelReadState) => ChannelReadState) {
  const cur = state.channels[channelId];
  if (!cur) return;
  const next = fn(cur);
  if (next === cur) return;
  setState({ ...state, channels: { ...state.channels, [channelId]: next } });
}

export function getUnreadSnapshot() {
  return state;
}

export function getServerUnreadSnapshot() {
  return EMPTY;
}

// ---- DB 에서 한 번에 다시 읽기 ----
export async function refreshUnread() {
  const seq = ++refreshSeq;
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const uid = session?.user.id ?? null;
  if (!uid) {
    if (seq === refreshSeq) setState(EMPTY);
    return;
  }

  const [{ data: me }, { data: members, error }] = await Promise.all([
    supabase.from("profiles").select("name").eq("id", uid).maybeSingle(),
    supabase.from("channel_members").select("channel_id, last_read_message_id").eq("user_id", uid),
  ]);
  if (error || !members) {
    console.error("[unread] 채널 목록 불러오기 실패:", error?.message);
    return;
  }
  const myName = me?.name?.trim() || null;

  // 채널 수만큼 작은 요청을 동시에 보낸다
  const latestId = fetchLatestId;

  async function mentionIds(channelId: string, lastReadId: number) {
    if (!myName) return [];
    const { data } = await supabase
      .from("messages")
      .select("id")
      .eq("channel_id", channelId)
      .is("parent_id", null)
      .is("deleted_at", null) // 삭제된 메시지는 세지 않음
      .gt("id", lastReadId)
      .neq("user_id", uid!)
      .ilike("content", `%@${escapeLike(myName)}%`)
      .order("id")
      .limit(MAX_MENTIONS);
    return (data ?? []).map((r) => r.id);
  }

  const rows = await Promise.all(
    members.map(async (m) => {
      const lastReadId = m.last_read_message_id ?? 0;
      const [latest, mentions] = await Promise.all([
        latestId(m.channel_id),
        mentionIds(m.channel_id, lastReadId),
      ]);
      const row: ChannelReadState = { lastReadId, latestId: latest, mentionIds: mentions };
      return [m.channel_id, row] as const;
    }),
  );

  if (seq !== refreshSeq) return;
  setState({ myId: uid, myName, channels: Object.fromEntries(rows) });
}

// 삭제되지 않은 가장 최근 본문 메시지 id
async function fetchLatestId(channelId: string) {
  const { data } = await createClient()
    .from("messages")
    .select("id")
    .eq("channel_id", channelId)
    .is("parent_id", null)
    .is("deleted_at", null)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? 0;
}

function isMine(row: Message) {
  return row.user_id === state.myId;
}

function mentionsMe(row: Message) {
  return !isMine(row) && !!state.myName && mentionsName(row.content, state.myName);
}

// ---- 새 메시지 (Realtime INSERT) ----
function onNewMessage(row: Message) {
  if (row.parent_id !== null) return; // 스레드 답글은 세지 않음

  const mine = isMine(row);
  const mentioned = mentionsMe(row);

  // 나를 멘션한 새 메시지 → 알림(NotificationToasts)에 신호 (방금 참여한 채널이어도 알림은 보낸다)
  if (mentioned) {
    window.dispatchEvent(
      new CustomEvent<MentionEventDetail>(MENTION_EVENT, {
        detail: { channelId: row.channel_id, messageId: row.id, authorId: row.user_id, content: row.content },
      }),
    );
  }

  // 모르는 채널(방금 참여한 채널 등)이면 DB 에서 다시 읽어 온다
  if (!state.channels[row.channel_id]) {
    void refreshUnread();
    return;
  }

  updateChannel(row.channel_id, (cur) => applyInsert(cur, row, mine, mentioned));

  // 내가 보낸 메시지까지는 DB 에도 읽음으로 저장 (새로고침·다른 기기에서도 굵게 안 보이게)
  if (mine) void markAsRead(row.channel_id, row.id);
}

// ---- 메시지 수정·삭제 (Realtime UPDATE — 삭제도 deleted_at 이 채워진 UPDATE 로 온다) ----
function onMessageUpdated(row: Message) {
  const cur = state.channels[row.channel_id];
  if (!cur) return;

  const { next, needLatest } = applyUpdate(cur, row, isMine(row), mentionsMe(row));
  updateChannel(row.channel_id, () => next);

  // 가장 최근 메시지가 지워졌으면, 남은 메시지 중 가장 최근 것을 DB 에서 다시 읽어 굵게 여부를 정한다
  if (needLatest) {
    void fetchLatestId(row.channel_id).then((latest) => {
      updateChannel(row.channel_id, (c) =>
        // 그사이 새 메시지가 왔으면 그 값을 지킨다
        c.latestId > row.id || c.latestId === latest ? c : { ...c, latestId: latest },
      );
    });
  }
}

// ---- 읽음 처리 신호 (markAsRead 가 보냄) ----
function onRead(e: Event) {
  const { channelId, lastReadMessageId } = (e as CustomEvent<ReadEventDetail>).detail;
  updateChannel(channelId, (cur) => applyRead(cur, lastReadMessageId));
}

// ---- 화면에서 처음 쓰기 시작할 때 켜고, 아무도 안 쓰면 끈다 ----
function start() {
  const supabase = createClient();
  void refreshUnread();

  // 권한(RLS) 때문에 내가 멤버인 채널의 메시지만 들어온다 → 채널 필터 없이 한 번에 구독
  const channel = supabase
    .channel(`unread:${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) =>
      onNewMessage(payload.new as Message),
    )
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, (payload) =>
      onMessageUpdated(payload.new as Message),
    )
    .subscribe();

  // 로그인·로그아웃·다른 계정으로 바뀌면 다시 읽기
  const { data: auth } = supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
      void refreshUnread();
    }
  });

  // 탭으로 돌아오면 다시 읽기 (끊겨 있는 동안 놓친 메시지 보충)
  const onVisible = () => {
    if (document.visibilityState === "visible") void refreshUnread();
  };
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener(READ_EVENT, onRead);

  return () => {
    void supabase.removeChannel(channel);
    auth.subscription.unsubscribe();
    document.removeEventListener("visibilitychange", onVisible);
    window.removeEventListener(READ_EVENT, onRead);
  };
}

export function subscribeUnread(listener: () => void) {
  listeners.add(listener);
  if (!stop) stop = start();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && stop) {
      stop();
      stop = null;
    }
  };
}
