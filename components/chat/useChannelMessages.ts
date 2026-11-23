"use client";
// [B] 채널 메시지를 불러오고 상태로 들고 있는 훅
// B-1: 최근 50개 불러오기
// B-3: Realtime 으로 새 메시지(INSERT) 실시간 수신, 채널이 바뀌면 이전 구독 해제
// B-4: 델타 동기화 — 다시 연결되면 "마지막으로 받은 id 이후" 메시지만 받아와 이어 붙인다
//      (실시간 재연결 / 탭으로 돌아옴 / 와이파이 다시 켜짐)
// (B-6 무한스크롤은 이 파일에 이어서 붙인다)
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Message } from "@/types/database";
import { retryAllFailed } from "./outbox";
import { MESSAGE_SELECT, PAGE_SIZE, type ChatMessage } from "./types";

// 델타 동기화 때 한 번에 받는 개수 (놓친 게 더 많으면 나눠서 끝까지 받는다)
const CATCH_UP_BATCH = 500;

// 채널별 "마지막으로 받은 메시지 id" — 채널을 옮겨 다녀도 기억한다
const lastIdByChannel = new Map<string, number>();
function rememberLastId(channelId: string, list: ChatMessage[]) {
  const max = list.reduce((m, x) => (x.id > m ? x.id : m), lastIdByChannel.get(channelId) ?? 0);
  lastIdByChannel.set(channelId, max);
}

// 브라우저가 인터넷에 연결돼 있는지 (와이파이를 끄면 false)
function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}
function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}

export type LoadStatus = "loading" | "ready" | "error";
// connecting: 연결 중 / live: 실시간 수신 중 / lost: 끊김(자동으로 다시 연결 시도)
export type LiveStatus = "connecting" | "live" | "lost";

// 같은 메시지(id)는 한 번만, id 순서대로
function mergeById(prev: ChatMessage[], incoming: ChatMessage[]) {
  if (incoming.length === 0) return prev;
  const map = new Map(prev.map((m) => [m.id, m]));
  for (const m of incoming) map.set(m.id, m);
  return [...map.values()].sort((a, b) => a.id - b.id);
}

// 실시간으로 오는 행에는 보낸 사람 이름이 없으므로 프로필을 따로 불러와 기억해 둔다
const profileCache = new Map<string, Promise<ChatMessage["profiles"]>>();
function getProfile(userId: string) {
  let p = profileCache.get(userId);
  if (!p) {
    p = Promise.resolve(
      createClient().from("profiles").select("name, avatar_url").eq("id", userId).maybeSingle(),
    ).then(({ data }) => data);
    profileCache.set(userId, p);
  }
  return p;
}

export function useChannelMessages(channelId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");
  // 어느 채널의 연결 상태인지 같이 기억 → 채널이 바뀌면 새 채널은 자동으로 "connecting"
  const [liveState, setLiveState] = useState<{ channelId: string; status: LiveStatus }>();
  const online = useOnline();
  const subscribed: LiveStatus = liveState?.channelId === channelId ? liveState.status : "connecting";
  // 인터넷이 끊기면 실시간 연결 상태와 상관없이 "끊김"
  const live: LiveStatus = online ? subscribed : "lost";
  // 다시 시도 버튼을 누르면 이 숫자를 올려서 아래 useEffect 를 다시 실행시킨다
  const [reloadKey, setReloadKey] = useState(0);

  // ---- 처음 불러오기 (최근 50개) ----
  useEffect(() => {
    let cancelled = false; // 채널이 바뀌면 이전 요청의 결과는 버린다
    const supabase = createClient();

    async function load() {
      setStatus("loading");
      setMessages([]);

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
      // 불러오는 동안 실시간으로 먼저 도착한 메시지가 있을 수 있으니 덮어쓰지 않고 합친다
      rememberLastId(channelId, data as ChatMessage[]);
      setMessages((prev) => mergeById(prev, data as ChatMessage[]));
      setStatus("ready");
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [channelId, reloadKey]);

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
          filter: `channel_id=eq.${channelId}`, // 이 채널 메시지만
        },
        async (payload) => {
          const row = payload.new as Message;
          if (row.parent_id !== null) return; // 스레드 답글은 본문에 안 보여준다 (B-5 에서 처리)
          const profiles = await getProfile(row.user_id);
          if (!active) return;
          const msg = { ...row, profiles };
          rememberLastId(channelId, [msg]);
          setMessages((prev) => mergeById(prev, [msg]));
        },
      )
      .subscribe((s, err) => {
        if (!active) return;
        if (s === "SUBSCRIBED") {
          setLiveState({ channelId, status: "live" });
          // (다시) 연결됨 → 끊긴 사이 놓친 메시지 받아오기 + 실패한 내 메시지 자동 재전송
          catchUpRef.current();
          retryAllFailed();
        }
        else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
          console.warn("[chat] 실시간 연결 끊김", s, err);
          setLiveState({ channelId, status: "lost" }); // supabase 가 자동으로 다시 연결을 시도한다
        }
      });

    // 채널이 바뀌거나 화면에서 사라지면 이전 구독 해제
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [channelId]);

  // ---- 델타 동기화 (B-4) ----
  const catchingUp = useRef(false);
  const catchUp = useCallback(async () => {
    const lastId = lastIdByChannel.get(channelId);
    // 아직 처음 불러오기가 안 끝났으면 건너뜀 (처음 불러오기가 최신을 가져온다)
    if (lastId === undefined || catchingUp.current) return;
    catchingUp.current = true;
    const supabase = createClient();
    try {
      let after = lastId;
      // 놓친 메시지가 많으면 500개씩 끝까지 받는다
      for (;;) {
        const { data, error } = await supabase
          .from("messages")
          .select(MESSAGE_SELECT)
          .eq("channel_id", channelId)
          .is("parent_id", null)
          .gt("id", after) // 마지막으로 받은 id 이후만
          .order("id")
          .limit(CATCH_UP_BATCH);
        if (error) throw error;
        const rows = data as ChatMessage[];
        if (rows.length > 0) {
          rememberLastId(channelId, rows);
          setMessages((prev) => mergeById(prev, rows));
          after = rows[rows.length - 1].id;
        }
        if (rows.length < CATCH_UP_BATCH) break;
      }
    } catch (err) {
      console.error("[chat] 놓친 메시지 받아오기 실패", err);
    } finally {
      catchingUp.current = false;
    }
  }, [channelId]);

  // 실시간 구독 콜백에서 항상 최신 catchUp 을 부르기 위해 ref 에 담아둔다
  const catchUpRef = useRef(catchUp);
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

  return { messages, status, live, reload };
}
