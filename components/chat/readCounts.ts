"use client";
// [B] 카톡처럼 말풍선 옆 "안 읽은 사람 수" (1, 2 …)
//
// 사용 (MessageList 안에서): const unreadOf = useReadCounts(channelId);  →  unreadOf(message) = 숫자 (0 이면 안 보임)
// - 채널 멤버들의 읽음 위치(channel_members.last_read_message_id)를 한 번 불러오고
// - 누가 읽을 때마다 오는 실시간 변경(팀장님 006)으로 그 사람 값만 고친다 (DB 를 다시 읽지 않음)
// - 메시지 id 가 그 사람의 읽음 위치보다 크면 "아직 안 읽음". 보낸 사람 본인은 세지 않는다.
// 읽음 위치는 수정님(D) useMarkAsRead 가 저장한다 (채널을 열고 탭이 보일 때 마지막 본문 메시지까지).
// 그래서 채널 본문 메시지에만 쓴다 — 스레드 답글은 읽음 위치가 따로 없어 숫자가 맞지 않음.
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Reads = Record<string, number>; // user_id → 마지막으로 읽은 메시지 id (안 읽었으면 0)
type MemberRow = { channel_id: string; user_id: string; last_read_message_id: number | null };

export function useReadCounts(channelId: string) {
  const [reads, setReads] = useState<{ channelId: string; reads: Reads; ready: boolean } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    let active = true;

    const apply = (row: Partial<MemberRow>, removed = false) => {
      if (!row.user_id || row.channel_id !== channelId) return;
      const userId = row.user_id;
      setReads((prev) => {
        // 처음 불러오기 전에 온 변경도 모아 둔다 (불러온 값과 합칠 때 큰 쪽을 씀)
        const base = prev?.channelId === channelId ? prev : { channelId, reads: {}, ready: false };
        const next: Reads = { ...base.reads };
        if (removed) delete next[userId];
        else next[userId] = Math.max(next[userId] ?? 0, row.last_read_message_id ?? 0); // 읽음 위치는 뒤로 가지 않음
        return { ...base, reads: next };
      });
    };

    // 실시간 먼저 구독하고 그다음 불러온다 (그 사이 읽은 것을 놓치지 않게)
    const channel = supabase
      .channel(`reads:${channelId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "channel_members", filter: `channel_id=eq.${channelId}` },
        (p) => apply(p.new as MemberRow),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "channel_members", filter: `channel_id=eq.${channelId}` },
        (p) => apply(p.new as MemberRow),
      )
      // 나가기: 삭제 이벤트엔 필터가 안 걸려 모든 채널 것이 온다 → apply 가 채널을 비교해 거름
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "channel_members" }, (p) =>
        apply(p.old as MemberRow, true),
      )
      .subscribe();

    supabase
      .from("channel_members")
      .select("user_id, last_read_message_id")
      .eq("channel_id", channelId)
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data) {
          console.error("[chat] 읽음 위치를 불러오지 못함", error);
          return;
        }
        const loaded: Reads = {};
        for (const m of data) loaded[m.user_id] = m.last_read_message_id ?? 0;
        // 불러오는 사이 실시간으로 받은 값이 더 크면 그것을 쓴다
        setReads((prev) => {
          if (prev?.channelId === channelId) {
            for (const [id, v] of Object.entries(prev.reads)) loaded[id] = Math.max(loaded[id] ?? 0, v);
          }
          return { channelId, reads: loaded, ready: true };
        });
      });

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [channelId]);

  const current = reads?.channelId === channelId && reads.ready ? reads.reads : null;
  return useCallback(
    (m: { id: number; user_id: string; status?: unknown }) => {
      if (!current || m.status || m.id < 0) return 0; // 아직 못 불러옴 · 보내는 중
      let n = 0;
      for (const [userId, lastRead] of Object.entries(current)) {
        if (userId !== m.user_id && lastRead < m.id) n++;
      }
      return n;
    },
    [current],
  );
}
