"use client";
// [B] 채널 메시지를 불러오고 상태로 들고 있는 훅
// B-1: 최근 50개 불러오기
// B-3: Realtime 으로 새 메시지(INSERT) 실시간 수신, 채널이 바뀌면 이전 구독 해제
// B-4: 델타 동기화 — 다시 연결되면 "마지막으로 받은 id 이후" 메시지만 받아와 이어 붙인다
//      (실시간 재연결 / 탭으로 돌아옴 / 와이파이 다시 켜짐)
// B-5: 원본 메시지마다 답글 수 · 마지막 답글 시간 (답글 자체는 본문에 안 보여준다)
// B-6: 무한스크롤 — 맨 위로 올리면 "가장 오래된 id 보다 작은" 메시지 50개를 더 불러온다
// 메시지로 이동: 화면에 없는 메시지는 그 앞뒤 25개씩을 새로 불러온다(jumpTo). 그 뒤에 더 최신 메시지가 있으면
//      detached = true → 실시간 새 메시지를 끝에 붙이지 않고(중간이 비므로) "최신 메시지로" 버튼을 보여준다
// 대량 메시지: 화면에는 최대 500개(MAX_RENDERED)만 쌓고, 재연결 때 놓친 게 200개(CATCH_UP_LIMIT) 넘으면 최신 50개로 새로 불러온다
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Message } from "@/types/database";
import {
  getProfile,
  mergeById,
  useOnline,
  type LiveStatus,
  type LoadStatus,
} from "./chatData";
import {
  UPDATED_EVENT,
  type UpdatedDetail,
} from "./messageActions";
import { retryAllFailed } from "./outbox";
import {
  CATCH_UP_LIMIT,
  MAX_RENDERED,
  MESSAGE_SELECT,
  PAGE_SIZE,
  type ChatMessage,
  type MessagePatch,
} from "./types";

export type { LiveStatus, LoadStatus } from "./chatData";

// 원본 메시지 id → 답글 수 · 마지막 답글 시간
export type ReplyStats = Record<number, { count: number; lastAt: string }>;
type ReplyRow = Pick<Message, "id" | "parent_id" | "created_at">;

// 채널별 "마지막으로 받은 메시지 id"(본문 + 답글) — 채널을 옮겨 다녀도 기억한다
const lastIdByChannel = new Map<string, number>();
function rememberLastId(channelId: string, list: { id: number }[]) {
  const max = list.reduce((m, x) => (x.id > m ? x.id : m), lastIdByChannel.get(channelId) ?? 0);
  lastIdByChannel.set(channelId, max);
}

export function useChannelMessages(channelId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [replyStats, setReplyStats] = useState<ReplyStats>({});
  // 같은 답글을 두 번 세지 않게 + 답글이 지워지면 어느 원본의 숫자를 줄일지 알기 위해 (답글 id → 원본 id)
  const seenReplyIds = useRef(new Map<number, number>());
  const [status, setStatus] = useState<LoadStatus>("loading");
  // 어느 채널의 연결 상태인지 같이 기억 → 채널이 바뀌면 새 채널은 자동으로 "connecting"
  const [liveState, setLiveState] = useState<{ channelId: string; status: LiveStatus }>();
  const online = useOnline();
  const subscribed: LiveStatus = liveState?.channelId === channelId ? liveState.status : "connecting";
  // 인터넷이 끊기면 실시간 연결 상태와 상관없이 "끊김"
  const live: LiveStatus = online ? subscribed : "lost";
  // 다시 시도 버튼을 누르면 이 숫자를 올려서 아래 useEffect 를 다시 실행시킨다
  const [reloadKey, setReloadKey] = useState(0);
  // 무한스크롤 (B-6): 더 오래된 메시지가 남아 있는지 / 지금 불러오는 중인지
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  // 잠깐 보여줄 안내 (예: 놓친 메시지가 많아 최신부터 보여줄 때). 채널별로 기억 → 다른 채널에선 안 보임
  const [noticeState, setNoticeState] = useState<{ channelId: string; text: string } | null>(null);
  const notice = noticeState?.channelId === channelId ? noticeState.text : null;
  // 몇 초 뒤 자동으로 사라지게
  useEffect(() => {
    if (!noticeState) return;
    const t = setTimeout(() => setNoticeState(null), 5000);
    return () => clearTimeout(t);
  }, [noticeState]);
  // 메시지로 이동해서 예전 메시지 구간을 보는 중 (그 뒤 최신 메시지는 안 불러온 상태)
  const [detached, setDetached] = useState(false);
  const detachedRef = useRef(false);
  const loadingOlderRef = useRef(false);
  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // 답글을 원본 메시지별로 센다 (이미 센 답글은 건너뜀)
  const addReplies = useCallback((rows: ReplyRow[]) => {
    const fresh = rows.filter((r) => r.parent_id !== null && !seenReplyIds.current.has(r.id));
    if (fresh.length === 0) return;
    for (const r of fresh) seenReplyIds.current.set(r.id, r.parent_id as number);
    setReplyStats((prev) => {
      const next = { ...prev };
      for (const r of fresh) {
        const root = r.parent_id as number;
        const cur = next[root];
        next[root] = {
          count: (cur?.count ?? 0) + 1,
          lastAt: !cur || r.created_at > cur.lastAt ? r.created_at : cur.lastAt,
        };
      }
      return next;
    });
  }, []);

  // 원본 메시지들에 달린 답글을 세기 (처음 불러올 때 · 이전 메시지 불러올 때)
  const loadReplyStats = useCallback(
    async (roots: ChatMessage[], isCancelled: () => boolean) => {
      if (roots.length === 0) return;
      const { data: replies, error } = await createClient()
        .from("messages")
        .select("id, parent_id, created_at")
        .eq("channel_id", channelId)
        .in("parent_id", roots.map((m) => m.id));
      if (isCancelled()) return;
      if (error) console.error("[chat] 답글 수 불러오기 실패", error);
      else {
        rememberLastId(channelId, replies);
        addReplies(replies);
      }
    },
    [channelId, addReplies],
  );

  // ---- 처음 불러오기 (최근 50개 + 그 메시지들의 답글 수) ----
  useEffect(() => {
    let cancelled = false; // 채널이 바뀌면 이전 요청의 결과는 버린다
    const supabase = createClient();

    async function load() {
      setStatus("loading");
      setMessages([]);
      setReplyStats({});
      setHasMore(false);
      setDetached(false);
      detachedRef.current = false;
      seenReplyIds.current = new Map();

      // 최근 50개 = id 큰 순으로 50개 → 화면에는 오래된 순으로 보여준다
      const { data, error } = await supabase
        .from("messages")
        .select(MESSAGE_SELECT)
        .eq("channel_id", channelId)
        .is("parent_id", null) // 스레드 답글은 본문에 안 보여준다
        .order("id", { ascending: false })
        .limit(PAGE_SIZE);

      if (cancelled) return;
      if (error) {
        console.error("[chat] 메시지 불러오기 실패", error);
        setStatus("error");
        return;
      }
      const roots = data as ChatMessage[];
      // 불러오는 동안 실시간으로 먼저 도착한 메시지가 있을 수 있으니 덮어쓰지 않고 합친다
      rememberLastId(channelId, roots);
      setMessages((prev) => mergeById(prev, roots));
      setHasMore(roots.length === PAGE_SIZE); // 50개를 꽉 채워 받았으면 더 있을 수 있음
      setStatus("ready");

      // 답글 수 (B-5): 화면에 있는 원본 메시지들의 답글만 id·시간만 가볍게 가져와 센다
      await loadReplyStats(roots, () => cancelled);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [channelId, reloadKey, loadReplyStats]);

  // ---- 이전 메시지 50개 더 불러오기 (B-6 무한스크롤) ----
  const loadOlder = useCallback(async () => {
    const oldest = messagesRef.current[0];
    if (!oldest || loadingOlderRef.current) return;
    // 대량 메시지: 이미 최대 개수만큼 쌓였으면 더 불러오지 않는다
    const room = MAX_RENDERED - messagesRef.current.length;
    if (room <= 0) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      // TECH_SPEC 2-2: .lt("id", oldestId).order("id", { ascending: false }).limit(50)
      const { data, error } = await createClient()
        .from("messages")
        .select(MESSAGE_SELECT)
        .eq("channel_id", channelId)
        .is("parent_id", null)
        .lt("id", oldest.id)
        .order("id", { ascending: false })
        .limit(Math.min(PAGE_SIZE, room));
      if (error) throw error;
      const rows = data as ChatMessage[];
      setMessages((prev) => mergeById(prev, rows));
      setHasMore(rows.length === Math.min(PAGE_SIZE, room));
      await loadReplyStats(rows, () => false);
    } catch (err) {
      console.error("[chat] 이전 메시지 불러오기 실패", err);
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [channelId, loadReplyStats]);

  // ---- 메시지로 이동: 화면에 없는 메시지면 그 앞뒤를 새로 불러온다 ----
  // 성공하면 true (그 메시지가 목록에 들어옴), 없거나 실패하면 false
  const jumpTo = useCallback(
    async (targetId: number) => {
      const half = PAGE_SIZE / 2;
      const supabase = createClient();
      try {
        const [beforeRes, afterRes] = await Promise.all([
          // 그 메시지 포함 이전 25개
          supabase
            .from("messages")
            .select(MESSAGE_SELECT)
            .eq("channel_id", channelId)
            .is("parent_id", null)
            .lte("id", targetId)
            .order("id", { ascending: false })
            .limit(half),
          // 이후 25개 (+1 로 더 최신 메시지가 남았는지 확인)
          supabase
            .from("messages")
            .select(MESSAGE_SELECT)
            .eq("channel_id", channelId)
            .is("parent_id", null)
            .gt("id", targetId)
            .order("id")
            .limit(half + 1),
        ]);
        if (beforeRes.error) throw beforeRes.error;
        if (afterRes.error) throw afterRes.error;
        const before = beforeRes.data as ChatMessage[];
        const afterAll = afterRes.data as ChatMessage[];
        if (!before.some((m) => m.id === targetId)) return false; // 지워졌거나 볼 권한 없음
        const newer = afterAll.length > half;
        const rows = [...before, ...afterAll.slice(0, half)];
        detachedRef.current = newer;
        setDetached(newer);
        seenReplyIds.current = new Map();
        setReplyStats({});
        setMessages(mergeById([], rows));
        setHasMore(before.length === half);
        await loadReplyStats(rows, () => false);
        return true;
      } catch (err) {
        console.error("[chat] 메시지로 이동 실패", err);
        return false;
      }
    },
    [channelId, loadReplyStats],
  );

  // 대량 메시지: 최대 개수를 넘으면 가장 오래된 것부터 뺀다
  // (위쪽을 읽는 중에 빼면 화면이 튀므로, 맨 아래를 보고 있을 때 MessageList 가 부른다)
  const trimOld = useCallback(() => {
    setMessages((prev) => (prev.length > MAX_RENDERED ? prev.slice(prev.length - MAX_RENDERED) : prev));
    setHasMore(true); // 뺀 메시지가 있으니 더 오래된 게 남아 있다
  }, []);

  // 받은 행을 본문 메시지 / 답글로 나눠 반영
  const applyRows = useCallback(
    (rows: ChatMessage[]) => {
      rememberLastId(channelId, rows);
      const roots = rows.filter((r) => r.parent_id === null);
      // 예전 구간을 보는 중이면 새 메시지를 끝에 붙이지 않는다 (사이에 안 불러온 메시지가 있어 순서가 끊겨 보임)
      if (roots.length && !detachedRef.current) setMessages((prev) => mergeById(prev, roots));
      addReplies(rows);
    },
    [channelId, addReplies],
  );

  // 실시간 구독(아래)이 델타 동기화(catchUp, 더 아래)를 부를 수 있게 미리 자리를 만들어 둔다
  const catchUpRef = useRef<() => void>(() => {});

  // ---- 수정 · 삭제 반영 (내가 한 것: 브라우저 신호 / 남이 한 것: Realtime) ----
  // 수정·소프트 삭제: 바뀐 칸만 덮어쓴다 (삭제돼도 줄은 남아 "삭제된 메시지입니다", 답글 수도 그대로)
  const applyEdit = useCallback((id: number, patch: MessagePatch) => {
    setMessages((prev) => (prev.some((m) => m.id === id) ? prev.map((m) => (m.id === id ? { ...m, ...patch } : m)) : prev));
  }, []);

  // 실제 삭제(DELETE) — 첨부 업로드 실패 되돌리기, 관리자 정리 등 아직 실제로 지우는 경우
  const applyDelete = useCallback((id: number) => {
    setMessages((prev) => (prev.some((m) => m.id === id) ? prev.filter((m) => m.id !== id) : prev));
    // 답글이 지워졌으면 원본의 "답글 n개" 를 하나 줄인다
    const root = seenReplyIds.current.get(id);
    if (root !== undefined) {
      seenReplyIds.current.delete(id);
      setReplyStats((prev) => {
        const cur = prev[root];
        if (!cur) return prev;
        const next = { ...prev };
        if (cur.count <= 1) delete next[root];
        else next[root] = { ...cur, count: cur.count - 1 };
        return next;
      });
    }
    // 원본이 지워졌으면 그 원본의 답글 수도 지운다 (답글은 DB 가 같이 지움)
    setReplyStats((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  useEffect(() => {
    const onEdited = (e: Event) => {
      // 이 화면에서 수정·삭제(소프트 삭제)한 것 → 바뀐 칸만 반영
      const { id, patch } = (e as CustomEvent<UpdatedDetail>).detail;
      applyEdit(id, patch);
    };
    window.addEventListener(UPDATED_EVENT, onEdited);
    return () => window.removeEventListener(UPDATED_EVENT, onEdited);
  }, [applyEdit]);

  // ---- 실시간 수신 (B-3) ----
  useEffect(() => {
    const supabase = createClient();
    let active = true;

    const channel = supabase
      .channel(`chat-messages:${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `channel_id=eq.${channelId}`, // 이 채널 메시지만 (답글 포함)
        },
        async (payload) => {
          const row = payload.new as Message;
          // 답글은 이름이 필요 없으므로 바로 센다
          const profiles = row.parent_id === null ? await getProfile(row.user_id) : null;
          if (!active) return;
          applyRows([{ ...row, profiles }]);
        },
      )
      // 누군가 메시지를 수정 → 내용만 바꾼다
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` },
        (payload) => {
          // 수정도 삭제(소프트 삭제)도 UPDATE 로 온다
          const row = payload.new as ChatMessage;
          if (active) applyEdit(row.id, { content: row.content, edited_at: row.edited_at, deleted_at: row.deleted_at });
        },
      )
      // 누군가 메시지를 삭제 → 삭제 알림에는 id 만 온다 (Supabase 는 삭제 알림을 채널로 거를 수 없음)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (payload) => {
        const id = (payload.old as { id?: number }).id;
        if (active && id !== undefined) applyDelete(id);
      })
      .subscribe((s, err) => {
        if (!active) return;
        if (s === "SUBSCRIBED") {
          setLiveState({ channelId, status: "live" });
          // (다시) 연결됨 → 끊긴 사이 놓친 메시지 받아오기 + 실패한 내 메시지 자동 재전송
          catchUpRef.current();
          retryAllFailed();
        } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
          console.warn("[chat] 실시간 연결 끊김", s, err);
          setLiveState({ channelId, status: "lost" }); // supabase 가 자동으로 다시 연결을 시도한다
        }
      });

    // 채널이 바뀌거나 화면에서 사라지면 이전 구독 해제
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [channelId, applyRows, applyEdit, applyDelete]);

  // ---- 델타 동기화 (B-4) ----
  const catchingUp = useRef(false);
  const catchUp = useCallback(async () => {
    const lastId = lastIdByChannel.get(channelId);
    // 아직 처음 불러오기가 안 끝났으면 건너뜀 (처음 불러오기가 최신을 가져온다)
    if (lastId === undefined || catchingUp.current) return;
    catchingUp.current = true;
    const supabase = createClient();
    try {
      // 놓친 메시지(본문 + 답글)를 200개 + 1 까지만 물어본다
      const { data, error } = await supabase
        .from("messages")
        .select(MESSAGE_SELECT)
        .eq("channel_id", channelId)
        .gt("id", lastId) // 마지막으로 받은 id 이후만
        .order("id")
        .limit(CATCH_UP_LIMIT + 1);
      if (error) throw error;
      const rows = data as ChatMessage[];
      if (rows.length > CATCH_UP_LIMIT) {
        // 너무 많이 놓침 → 하나씩 이어 붙이면 화면이 멈추므로 최신 50개로 새로 불러온다
        // (그 이전 메시지는 위로 올려서 볼 수 있다)
        lastIdByChannel.delete(channelId);
        setReloadKey((k) => k + 1);
        setNoticeState({ channelId, text: "놓친 메시지가 많아 최신 메시지부터 보여드려요. 이전 메시지는 위로 올려서 볼 수 있어요." });
      } else if (rows.length > 0) {
        applyRows(rows);
      }
    } catch (err) {
      console.error("[chat] 놓친 메시지 받아오기 실패", err);
    } finally {
      catchingUp.current = false;
    }
  }, [channelId, applyRows]);

  // 실시간 구독 콜백에서 항상 최신 catchUp 을 부르기 위해 ref 에 담아둔다 (ref 는 위쪽에서 미리 만듦)
  useEffect(() => {
    catchUpRef.current = catchUp;
  }, [catchUp]);

  // 탭으로 돌아왔을 때 / 와이파이가 다시 켜졌을 때도 받아오기
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") catchUp();
    }
    function onOnline() {
      catchUp();
      retryAllFailed();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
    };
  }, [catchUp]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  // 최대 개수까지 쌓였는지 (위로 더 불러오지 않음 → "검색으로 찾아보세요" 안내)
  const capped = messages.length >= MAX_RENDERED;

  return {
    messages,
    replyStats,
    status,
    live,
    reload,
    hasMore,
    loadingOlder,
    loadOlder,
    capped,
    trimOld,
    notice,
    jumpTo,
    detached,
  };
}
