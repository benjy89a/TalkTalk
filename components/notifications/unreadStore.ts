// 미읽음·멘션 상태 저장소 (D-2, D-3)
//
// 사이드바에서 useUnread / UnreadBadge 를 여러 군데 써도
// DB 요청과 Realtime 구독은 이 파일 하나에서만 한 번 일어나도록 모아 두었다.
// 화면 코드는 이 파일을 직접 쓰지 말고 useUnread / UnreadBadge 를 쓴다.
import { createClient } from "@/lib/supabase/client";
import type { Message } from "@/types/database";
import { markAsRead, READ_EVENT, type ReadEventDetail } from "./markAsRead";
import { ALL_MENTION, checkMention, escapeLike, isMentioned } from "./mentions";
import {
  INVITE_EVENT,
  inviteNotice,
  MENTION_EVENT,
  type InviteEventDetail,
  type MentionEventDetail,
} from "./notifyRules";
import {
  applyInsert,
  applyRead,
  applyUpdate,
  findMissedMentions,
  findNewChannels,
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
let knownNames: string[] = []; // 가입한 사람 이름 목록 (멘션 판단에서 가장 길게 맞는 이름을 고르기 위해)

/** PostgREST or() 필터 값: 이름에 쉼표·괄호가 있어도 깨지지 않게 큰따옴표로 감싼다 */
function quoteFilter(value: string) {
  return `"${value.replace(/["\\]/g, "\\$&")}"`;
}

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

  const [{ data: me }, { data: members, error }, { data: people }] = await Promise.all([
    supabase.from("profiles").select("name").eq("id", uid).maybeSingle(),
    supabase.from("channel_members").select("channel_id, last_read_message_id").eq("user_id", uid),
    // 이름이 겹칠 때 "가장 길게 맞는 이름"을 고르기 위한 이름 목록 (이름은 로그인한 사람 누구나 볼 수 있음)
    supabase.from("profiles").select("name"),
  ]);
  if (error || !members) {
    console.error("[unread] 채널 목록 불러오기 실패:", error?.message);
    return;
  }
  const myName = me?.name?.trim() || null;
  if (people) knownNames = people.map((p) => p.name).filter(Boolean);

  // 채널 수만큼 작은 요청을 동시에 보낸다
  const latestId = fetchLatestId;

  async function mentionIds(channelId: string, lastReadId: number) {
    if (!myName) return [];
    // DB 에서는 "@내이름" 또는 "@all" 이 들어간 메시지를 넓게 찾고, 정확한 판단(가장 긴 이름·@allen 제외)은 아래에서
    const { data } = await supabase
      .from("messages")
      .select("id, content")
      .eq("channel_id", channelId)
      .is("parent_id", null)
      .is("deleted_at", null) // 삭제된 메시지는 세지 않음
      .gt("id", lastReadId)
      .neq("user_id", uid!)
      .or(`content.ilike.${quoteFilter(`*@${escapeLike(myName)}*`)},content.ilike.*@${ALL_MENTION}*`)
      .order("id")
      .limit(MAX_MENTIONS);
    return (data ?? []).filter((r) => isMentioned(r.content, myName, knownNames)).map((r) => r.id);
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
  // 같은 사람이 다시 읽은 경우에만 "놓친 멘션"을 찾는다 (처음 로그인 때의 예전 멘션은 배지로만)
  const prevChannels = state.myId === uid ? state.channels : null;
  const nextChannels = Object.fromEntries(rows);
  setState({ myId: uid, myName, channels: nextChannels });

  const missed = findMissedMentions(prevChannels, nextChannels, notifiedIds);
  if (missed.length > 0) void notifyMissed(missed.map((m) => m.messageId));

  // 놓친 초대 (화면이 숨겨져 실시간 신호를 못 받은 사이 새로 생긴 채널)
  for (const channelId of findNewChannels(prevChannels, nextChannels)) void notifyNewChannel(channelId);
}

// ---- 초대 알림 (비공개 채널 초대 · 새 DM) ----
// channel_members 에 "내 줄"이 새로 생기면 = 내가 그 채널 멤버가 됨 (006 에서 Realtime 켜짐)
const notifiedChannels = new Set<string>(); // 이미 알린 채널 (실시간 + 다시 읽기 중복 방지)

async function notifyNewChannel(channelId: string) {
  const me = state.myId;
  if (!me || notifiedChannels.has(channelId)) return;
  notifiedChannels.add(channelId);

  const supabase = createClient();
  const { data: channel } = await supabase
    .from("channels")
    .select("name, type, created_by")
    .eq("id", channelId)
    .maybeSingle();
  if (!channel) return;

  // DM 이면 상대 이름
  let partnerName: string | null = null;
  if (channel.type === "dm") {
    const { data: partner } = await supabase
      .from("channel_members")
      .select("profiles(name)")
      .eq("channel_id", channelId)
      .neq("user_id", me)
      .limit(1)
      .maybeSingle();
    partnerName = partner?.profiles?.name ?? null;
  }

  const notice = inviteNotice({
    type: channel.type,
    createdBy: channel.created_by,
    me,
    channelName: channel.name,
    partnerName,
  });
  if (!notice) return;
  window.dispatchEvent(
    new CustomEvent<InviteEventDetail>(INVITE_EVENT, { detail: { channelId, ...notice } }),
  );
}

// channel_members INSERT (Realtime). 권한 규칙상 내 줄 + 내가 속한 채널의 줄이 오므로 내 줄만 본다
function onMemberInserted(row: { channel_id: string; user_id: string }) {
  if (!state.myId || row.user_id !== state.myId) return;
  if (state.channels[row.channel_id]) return; // 이미 아는 채널
  void notifyNewChannel(row.channel_id);
  void refreshUnread(); // 새 채널의 미읽음·멘션도 바로 계산
}

// ---- 놓친 멘션 알림 ----
// 화면이 숨겨져 있거나 연결이 잠시 끊긴 동안 온 멘션은 실시간 신호로 못 받는다.
// 돌아와서 DB 를 다시 읽을 때 새로 찾은 멘션도 알림 카드로 보여 준다.
const notifiedIds = new Set<number>(); // 이미 알림을 띄운 메시지 (같은 알림 두 번 방지)

function emitMention(row: Pick<Message, "id" | "channel_id" | "user_id" | "content" | "parent_id">) {
  if (notifiedIds.has(row.id)) return;
  notifiedIds.add(row.id);
  const check = checkMention(row.content, state.myName ?? "", knownNames);
  window.dispatchEvent(
    new CustomEvent<MentionEventDetail>(MENTION_EVENT, {
      detail: {
        channelId: row.channel_id,
        messageId: row.id,
        authorId: row.user_id,
        content: row.content,
        parentId: row.parent_id,
        all: check.all && !check.me, // 내 이름으로도 불렀으면 "나를 언급"으로 보여 줌
      },
    }),
  );
}

async function notifyMissed(ids: number[]) {
  const { data, error } = await createClient()
    .from("messages")
    .select("id, channel_id, user_id, content, parent_id")
    .in("id", ids)
    .order("id");
  if (error) {
    console.error("[unread] 놓친 멘션 불러오기 실패:", error.message);
    return;
  }
  (data ?? []).forEach(emitMention);
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

// 나를 불렀거나(@내이름, 가장 길게 맞는 이름 기준) 전체 멘션(@all)이면 true. 내가 쓴 글은 아님
function mentionsMe(row: Message) {
  return !isMine(row) && !!state.myName && isMentioned(row.content, state.myName, knownNames);
}

// ---- 새 메시지 (Realtime INSERT) ----
function onNewMessage(row: Message) {
  const mine = isMine(row);
  const mentioned = mentionsMe(row);

  // 나를 멘션한 새 메시지 → 알림(NotificationToasts)에 신호
  // - 스레드 댓글 속 멘션도 알린다 (팀장님 요청). 누르면 스레드를 열고 그 댓글을 강조
  // - 방금 참여한 채널이어도 알린다
  if (mentioned) emitMention(row);

  // 미읽음·배지 계산은 채널 본문 메시지만 (읽음 위치가 본문 기준이라서)
  if (row.parent_id !== null) return;

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
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "channel_members" }, (payload) =>
      onMemberInserted(payload.new as { channel_id: string; user_id: string }),
    )
    .subscribe();

  // 로그인·로그아웃·다른 계정으로 바뀌면 다시 읽기
  const { data: auth } = supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
      void refreshUnread();
    }
  });

  // 실시간 신호를 놓쳤을 때를 위한 안전장치 — DB 에서 다시 읽기 (놓친 멘션은 알림 카드로 보여 줌)
  //  - 탭으로 돌아올 때 (다른 탭에 있다 돌아옴)
  //  - 창으로 돌아올 때 (창을 나란히 두고 다른 프로그램을 쓰다 돌아옴 — 탭 전환이 아니라서 위 신호가 안 옴)
  //  - 화면을 보고 있는 동안 1분마다
  // 너무 자주 읽지 않도록 5초 안에 다시 부르면 건너뛴다
  let lastRefresh = 0;
  const refreshSoon = () => {
    if (document.visibilityState !== "visible") return;
    if (Date.now() - lastRefresh < 5000) return;
    lastRefresh = Date.now();
    void refreshUnread();
  };
  document.addEventListener("visibilitychange", refreshSoon);
  window.addEventListener("focus", refreshSoon);
  const interval = setInterval(refreshSoon, 60_000);
  window.addEventListener(READ_EVENT, onRead);

  return () => {
    void supabase.removeChannel(channel);
    auth.subscription.unsubscribe();
    document.removeEventListener("visibilitychange", refreshSoon);
    window.removeEventListener("focus", refreshSoon);
    clearInterval(interval);
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
