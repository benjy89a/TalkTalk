"use client";
// [B] 스레드(원본 메시지 + 답글) 불러오기 · 실시간 · 델타 동기화 (B-5)
// 구조는 채널 본문의 useChannelMessages 와 같고, parent_id = rootId 인 답글만 다룬다
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Message } from "@/types/database";
import {
  CATCH_UP_BATCH,
  getProfile,
  mergeById,
  useOnline,
  type LiveStatus,
  type LoadStatus,
} from "./chatData";
import { retryAllFailed } from "./outbox";
import { MESSAGE_SELECT, type ChatMessage } from "./types";

// 스레드 답글은 보통 많지 않으므로 한 번에 넉넉히 불러온다
const THREAD_LIMIT = 500;

export function useThreadMessages(rootId: number) {
  const [root, setRoot] = useState<ChatMessage | null>(null);
  const [replies, setReplies] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [liveState, setLiveState] = useState<{ rootId: number; status: LiveStatus }>();
  const online = useOnline();
  const subscribed: LiveStatus = liveState?.rootId === rootId ? liveState.status : "connecting";
  const live: LiveStatus = online ? subscribed : "lost";
  const lastIdRef = useRef<number | undefined>(undefined); // 마지막으로 받은 답글 id

  const remember = (rows: ChatMessage[]) => {
    for (const r of rows) if (r.id > (lastIdRef.current ?? 0)) lastIdRef.current = r.id;
  };

  // ---- 처음 불러오기: 원본 메시지 + 답글 ----
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    async function load() {
      setStatus("loading");
      setRoot(null);
      setReplies([]);
      lastIdRef.current = undefined;

      const [rootRes, repliesRes] = await Promise.all([
        supabase.from("messages").select(MESSAGE_SELECT).eq("id", rootId).single(),
        supabase
          .from("messages")
          .select(MESSAGE_SELECT)
          .eq("parent_id", rootId)
          .order("id")
          .limit(THREAD_LIMIT),
      ]);
      if (cancelled) return;
      if (rootRes.error || repliesRes.error) {
        console.error("[chat] 스레드 불러오기 실패", rootRes.error ?? repliesRes.error);
        setStatus("error");
        return;
      }
      const rows = repliesRes.data as ChatMessage[];
      lastIdRef.current = rows.at(-1)?.id ?? rootId;
      setRoot(rootRes.data as ChatMessage);
      setReplies((prev) => mergeById(prev, rows));
      setStatus("ready");
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [rootId]);

  // ---- 델타 동기화: 다시 연결되면 마지막 답글 id 이후만 ----
  const catchingUp = useRef(false);
  const catchUp = useCallback(async () => {
    const after0 = lastIdRef.current;
    if (after0 === undefined || catchingUp.current) return;
    catchingUp.current = true;
    const supabase = createClient();
    try {
      let after = after0;
      for (;;) {
        const { data, error } = await supabase
          .from("messages")
          .select(MESSAGE_SELECT)
          .eq("parent_id", rootId)
          .gt("id", after)
          .order("id")
          .limit(CATCH_UP_BATCH);
        if (error) throw error;
        const rows = data as ChatMessage[];
        if (rows.length > 0) {
          remember(rows);
          setReplies((prev) => mergeById(prev, rows));
          after = rows[rows.length - 1].id;
        }
        if (rows.length < CATCH_UP_BATCH) break;
      }
    } catch (err) {
      console.error("[chat] 놓친 답글 받아오기 실패", err);
    } finally {
      catchingUp.current = false;
    }
  }, [rootId]);

  const catchUpRef = useRef(catchUp);
  useEffect(() => {
    catchUpRef.current = catchUp;
  }, [catchUp]);

  // ---- 실시간: 이 스레드의 새 답글 ----
  useEffect(() => {
    const supabase = createClient();
    let active = true;
    const channel = supabase
      .channel(`chat-thread:${rootId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `parent_id=eq.${rootId}` },
        async (payload) => {
          const row = payload.new as Message;
          const profiles = await getProfile(row.user_id);
          if (!active) return;
          const msg = { ...row, profiles };
          remember([msg]);
          setReplies((prev) => mergeById(prev, [msg]));
        },
      )
      .subscribe((s) => {
        if (!active) return;
        if (s === "SUBSCRIBED") {
          setLiveState({ rootId, status: "live" });
          catchUpRef.current();
          retryAllFailed();
        } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
          setLiveState({ rootId, status: "lost" });
        }
      });
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [rootId]);

  // 탭으로 돌아왔을 때 / 와이파이가 다시 켜졌을 때도 받아오기
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") catchUp();
    }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", catchUp);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", catchUp);
    };
  }, [catchUp]);

  return { root, replies, status, live };
}
