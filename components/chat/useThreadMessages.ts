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
import {
  UPDATED_EVENT,
  type UpdatedDetail,
} from "./messageActions";
import { retryAllFailed } from "./outbox";
import { MAX_RENDERED, MESSAGE_SELECT, type ChatMessage, type MessagePatch } from "./types";

// 스레드 답글은 채널 본문과 같은 기준으로 최대 500개(MAX_RENDERED)까지 보여준다.
// 답글이 그보다 많으면 "최신" 500개를 보여주고, 생략된 개수는 omitted 로 알려 준다.
// (예전에는 오래된 순 500개를 불러와서, 501번째 이후 최신 답글이 안 보이는 문제가 있었다)
const THREAD_LIMIT = MAX_RENDERED;

export function useThreadMessages(rootId: number) {
  const [root, setRoot] = useState<ChatMessage | null>(null);
  const [replies, setReplies] = useState<ChatMessage[]>([]);
  const [omitted, setOmitted] = useState(0); // 화면에 안 보여준 오래된 답글 수
  const [rootDeleted, setRootDeleted] = useState(false); // 원본이 삭제됨 → 스레드를 닫는다
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
      setOmitted(0);
      setRootDeleted(false);
      lastIdRef.current = undefined;

      const [rootRes, repliesRes, countRes] = await Promise.all([
        supabase.from("messages").select(MESSAGE_SELECT).eq("id", rootId).single(),
        // 최신 500개 (큰 id 부터) → 화면에는 오래된 순으로 뒤집어서
        supabase
          .from("messages")
          .select(MESSAGE_SELECT)
          .eq("parent_id", rootId)
          .order("id", { ascending: false })
          .limit(THREAD_LIMIT),
        // 전체 답글 수 (개수만 — 행은 안 가져옴)
        supabase.from("messages").select("id", { count: "exact", head: true }).eq("parent_id", rootId),
      ]);
      if (cancelled) return;
      if (rootRes.error || repliesRes.error) {
        console.error("[chat] 스레드 불러오기 실패", rootRes.error ?? repliesRes.error);
        setStatus("error");
        return;
      }
      const rows = (repliesRes.data as ChatMessage[]).reverse();
      setOmitted(Math.max(0, (countRes.count ?? rows.length) - rows.length));
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

  // ---- 수정 · 삭제 반영 ----
  const applyEdit = useCallback(
    // 수정·소프트 삭제: 바뀐 칸만 덮어쓴다 (원본이 삭제돼도 스레드는 열어 두고 "삭제된 메시지입니다"로 보여 줌)
    (id: number, patch: MessagePatch) => {
      if (id === rootId) setRoot((r) => (r ? { ...r, ...patch } : r));
      else setReplies((prev) => (prev.some((m) => m.id === id) ? prev.map((m) => (m.id === id ? { ...m, ...patch } : m)) : prev));
    },
    [rootId],
  );
  // 실제 삭제(DELETE) — 첨부 업로드 실패 되돌리기 등. 원본이 실제로 지워지면 스레드를 닫는다
  const applyDelete = useCallback(
    (id: number) => {
      if (id === rootId) setRootDeleted(true);
      else setReplies((prev) => (prev.some((m) => m.id === id) ? prev.filter((m) => m.id !== id) : prev));
    },
    [rootId],
  );
  useEffect(() => {
    const onEdited = (e: Event) => {
      // 이 화면에서 수정·삭제(소프트 삭제)한 것 → 바뀐 칸만 반영
      const { id, patch } = (e as CustomEvent<UpdatedDetail>).detail;
      applyEdit(id, patch);
    };
    window.addEventListener(UPDATED_EVENT, onEdited);
    return () => window.removeEventListener(UPDATED_EVENT, onEdited);
  }, [applyEdit]);

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
      // 답글 수정
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `parent_id=eq.${rootId}` },
        (payload) => {
          // 수정도 삭제(소프트 삭제)도 UPDATE 로 온다
          const row = payload.new as ChatMessage;
          if (active) applyEdit(row.id, { content: row.content, edited_at: row.edited_at, deleted_at: row.deleted_at });
        },
      )
      // 원본 수정
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `id=eq.${rootId}` },
        (payload) => {
          // 수정도 삭제(소프트 삭제)도 UPDATE 로 온다
          const row = payload.new as ChatMessage;
          if (active) applyEdit(row.id, { content: row.content, edited_at: row.edited_at, deleted_at: row.deleted_at });
        },
      )
      // 삭제 (알림에는 id 만 온다)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (payload) => {
        const id = (payload.old as { id?: number }).id;
        if (active && id !== undefined) applyDelete(id);
      })
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
  }, [rootId, applyEdit, applyDelete]);

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

  return { root, replies, omitted, rootDeleted, status, live };
}
