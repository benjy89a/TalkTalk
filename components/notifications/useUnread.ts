"use client";

// 미읽음 표시 훅 (D-2)
//
// 내가 속한 채널마다 "아직 안 읽은 메시지가 있는지"를 알려준다.
// 채널 목록(C 담당)에서 이 결과를 보고 채널 이름을 굵게 표시하면 된다.
//
// 사용 예:
//   import { useUnread } from "@/components/notifications/useUnread";
//
//   const { isUnread } = useUnread(activeChannelId); // 지금 열어 둔 채널 id (없으면 생략)
//   <span className={isUnread(channel.id) ? "font-bold text-white" : "text-white/70"}>
//     # {channel.name}
//   </span>
//
// 판단 기준:
// - 미읽음 = 채널 본문 메시지(스레드 답글 제외) 중 id 가 내 last_read_message_id 보다 큰 것이 있음
//   (본문 목록과 읽음 처리가 모두 "본문 메시지 id" 기준이라 기준을 맞췄다)
// - 내가 보낸 메시지는 미읽음으로 치지 않는다.
// - 지금 열어 둔 채널(activeChannelId)은 굵게 하지 않는다.
//
// 언제 다시 계산하나:
// - 새 메시지가 오면 Realtime 으로 바로 (messages INSERT 구독)
// - 읽음 처리(markAsRead)가 되면 바로 (talktalk:read 신호)
// - 브라우저 탭으로 돌아오면 DB에서 다시 읽어 옴 (끊겨 있는 동안 놓친 것 보충)
// - 채널에 새로 참여했을 때 등은 refresh() 를 부르면 다시 읽어 옴
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Message } from "@/types/database";
import { markAsRead, READ_EVENT, type ReadEventDetail } from "./markAsRead";

// 채널 하나의 상태: 내가 어디까지 읽었는지 / 그 채널의 가장 최근 본문 메시지 id
type ChannelReadState = {
  lastReadId: number; // 읽은 기록이 없으면 0
  latestId: number; // 메시지가 하나도 없으면 0
};

export function useUnread(activeChannelId?: string | null) {
  const [states, setStates] = useState<Record<string, ChannelReadState>>({});
  const [myId, setMyId] = useState<string | null>(null);
  // Realtime 콜백 안에서 최신 값을 보기 위해 ref 에도 담아 둔다
  const statesRef = useRef(states);
  useEffect(() => {
    statesRef.current = states;
  }, [states]);

  // ---- DB 에서 한 번에 읽어 오기 ----
  const refresh = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const uid = session?.user.id ?? null;
    setMyId(uid);
    if (!uid) {
      setStates({});
      return;
    }

    // 1) 내가 속한 채널과 읽은 위치
    const { data: members, error } = await supabase
      .from("channel_members")
      .select("channel_id, last_read_message_id")
      .eq("user_id", uid);
    if (error || !members) {
      console.error("[useUnread] 채널 목록 불러오기 실패:", error?.message);
      return;
    }

    // 2) 채널마다 가장 최근 본문 메시지 id (채널 수만큼 작은 요청, 동시에 보냄)
    const latest = await Promise.all(
      members.map(async (m) => {
        const { data } = await supabase
          .from("messages")
          .select("id")
          .eq("channel_id", m.channel_id)
          .is("parent_id", null)
          .order("id", { ascending: false })
          .limit(1)
          .maybeSingle();
        return data?.id ?? 0;
      }),
    );

    const next: Record<string, ChannelReadState> = {};
    members.forEach((m, i) => {
      next[m.channel_id] = {
        lastReadId: m.last_read_message_id ?? 0,
        latestId: latest[i],
      };
    });
    setStates(next);
  }, []);

  // 처음 한 번 + 탭으로 돌아올 때마다 다시 읽기
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- DB 에서 읽어 와 화면 상태를 맞추는 동기화 작업 (setState 는 await 뒤에 일어남)
    void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  // ---- 읽음 처리 신호 받기 (useMarkAsRead / markAsRead 가 보냄) ----
  useEffect(() => {
    const onRead = (e: Event) => {
      const { channelId, lastReadMessageId } = (e as CustomEvent<ReadEventDetail>).detail;
      setStates((prev) => {
        const cur = prev[channelId];
        if (!cur || cur.lastReadId >= lastReadMessageId) return prev;
        return { ...prev, [channelId]: { ...cur, lastReadId: lastReadMessageId } };
      });
    };
    window.addEventListener(READ_EVENT, onRead);
    return () => window.removeEventListener(READ_EVENT, onRead);
  }, []);

  // ---- 새 메시지 실시간 구독 ----
  useEffect(() => {
    if (!myId) return;
    const supabase = createClient();
    // 권한(RLS) 때문에 내가 멤버인 채널의 메시지만 들어온다 → 채널 필터 없이 한 번에 구독
    // 같은 화면에서 훅을 여러 번 써도 겹치지 않게 이름 뒤에 임의의 값을 붙인다
    const channel = supabase
      .channel(`unread:${myId}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const row = payload.new as Message;
          if (row.parent_id !== null) return; // 스레드 답글은 세지 않음

          // 모르는 채널(방금 참여한 채널 등)이면 DB 에서 다시 읽어 온다
          if (!statesRef.current[row.channel_id]) {
            void refresh();
            return;
          }

          const mine = row.user_id === myId;
          setStates((prev) => {
            const cur = prev[row.channel_id];
            if (!cur) return prev;
            return {
              ...prev,
              [row.channel_id]: {
                latestId: Math.max(cur.latestId, row.id),
                // 내가 보낸 메시지는 읽은 것으로 본다
                lastReadId: mine ? Math.max(cur.lastReadId, row.id) : cur.lastReadId,
              },
            };
          });
          // 내가 보낸 메시지까지는 DB 에도 읽음으로 저장 (다른 기기·새로고침에서도 굵게 안 보이게)
          if (mine) void markAsRead(row.channel_id, row.id);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [myId, refresh]);

  // ---- 결과 ----
  const unread = useMemo(() => {
    const result: Record<string, boolean> = {};
    for (const [id, s] of Object.entries(states)) {
      result[id] = id !== activeChannelId && s.latestId > s.lastReadId;
    }
    return result;
  }, [states, activeChannelId]);

  const isUnread = useCallback((channelId: string) => unread[channelId] ?? false, [unread]);

  return { unread, isUnread, refresh };
}
