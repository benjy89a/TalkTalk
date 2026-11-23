"use client";
// [B] 말풍선 이모지 반응 (추가 기능 ③) — DB 는 팀장님 004_reactions.sql
//
// 규칙(DB): 한 사람이 한 메시지에 같은 이모지는 한 번만(기본 키), 달기 = insert, 취소 = delete(본인 것만),
//          channel_id 는 트리거가 채워 줌, 메시지가 지워지면 반응도 같이 지워짐.
// 화면에 보이는 메시지들의 반응을 불러오고, Realtime 으로 다른 사람 반응도 바로 반영한다.
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"] as const;
const REACTION_EVENT = "talktalk:reaction";

type Row = { message_id: number; user_id: string; emoji: string };
type ReactionEvent = Row & { add: boolean };
// 메시지 id → 반응 목록
export type ReactionMap = Record<number, Row[]>;
// 화면용 요약: 이모지별 개수 + 내가 눌렀는지
export type ReactionSummary = { emoji: string; count: number; mine: boolean }[];

function same(a: Row, b: Row) {
  return a.message_id === b.message_id && a.user_id === b.user_id && a.emoji === b.emoji;
}

function applyRow(map: ReactionMap, row: Row, add: boolean): ReactionMap {
  const list = map[row.message_id] ?? [];
  const has = list.some((r) => same(r, row));
  if (add === has) return map; // 이미 반영됨 (내가 누른 것 + 실시간으로 또 옴)
  return {
    ...map,
    [row.message_id]: add ? [...list, row] : list.filter((r) => !same(r, row)),
  };
}

export function summarize(rows: Row[] | undefined, myId: string | null): ReactionSummary {
  if (!rows?.length) return [];
  const order: string[] = [];
  const by: Record<string, { count: number; mine: boolean }> = {};
  for (const r of rows) {
    if (!by[r.emoji]) {
      by[r.emoji] = { count: 0, mine: false };
      order.push(r.emoji);
    }
    by[r.emoji].count++;
    if (r.user_id === myId) by[r.emoji].mine = true;
  }
  return order.map((emoji) => ({ emoji, ...by[emoji] }));
}

// 반응 달기/취소. 화면은 먼저 바꾸고(신호), 실패하면 되돌린다.
export async function toggleReaction(messageId: number, emoji: string, myId: string, alreadyMine: boolean) {
  const row: Row = { message_id: messageId, user_id: myId, emoji };
  const emit = (add: boolean) =>
    window.dispatchEvent(new CustomEvent<ReactionEvent>(REACTION_EVENT, { detail: { ...row, add } }));
  emit(!alreadyMine);
  const supabase = createClient();
  const { error } = alreadyMine
    ? await supabase.from("reactions").delete().eq("message_id", messageId).eq("user_id", myId).eq("emoji", emoji)
    : await supabase.from("reactions").insert({ message_id: messageId, emoji });
  // 23505 = 이미 같은 반응이 있음 (다른 탭에서 먼저 누름) → 성공으로 본다
  if (error && error.code !== "23505") {
    console.error("[chat] 반응 실패", error);
    emit(alreadyMine); // 되돌리기
  }
}

// channelId 의 메시지 ids 에 달린 반응
export function useReactions(channelId: string, ids: number[]) {
  // 채널이 바뀌면 자동으로 비워지도록 채널과 같이 들고 있는다
  const [state, setState] = useState<{ channelId: string; map: ReactionMap }>({ channelId, map: {} });
  const map = useMemo(() => (state.channelId === channelId ? state.map : {}), [state, channelId]);
  const loaded = useRef<{ channelId: string; ids: Set<number> }>({ channelId, ids: new Set() });

  const update = (fn: (m: ReactionMap) => ReactionMap) =>
    setState((s) => (s.channelId === channelId ? { channelId, map: fn(s.map) } : { channelId, map: fn({}) }));
  const updateRef = useRef(update);
  useEffect(() => {
    updateRef.current = update;
  });

  // 아직 안 불러온 메시지의 반응만 불러오기 (처음 · 이전 메시지 더 불러올 때 · 새 메시지)
  const idsKey = ids.filter((id) => id > 0).join(",");
  useEffect(() => {
    if (loaded.current.channelId !== channelId) loaded.current = { channelId, ids: new Set() };
    const need = idsKey ? idsKey.split(",").map(Number).filter((id) => !loaded.current.ids.has(id)) : [];
    if (need.length === 0) return;
    need.forEach((id) => loaded.current.ids.add(id));
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      for (let i = 0; i < need.length; i += 200) {
        const chunk = need.slice(i, i + 200);
        const { data, error } = await supabase
          .from("reactions")
          .select("message_id, user_id, emoji")
          .in("message_id", chunk);
        if (cancelled) return;
        if (error) {
          console.error("[chat] 반응 불러오기 실패", error);
          return;
        }
        updateRef.current((m) => (data as Row[]).reduce((acc, r) => applyRow(acc, r, true), m));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [channelId, idsKey]);

  // 실시간 + 내가 누른 것(신호)
  useEffect(() => {
    const supabase = createClient();
    let active = true;
    const channel = supabase
      .channel(`chat-reactions:${channelId}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "reactions", filter: `channel_id=eq.${channelId}` },
        (payload) => {
          const r = payload.new as Row;
          if (active) updateRef.current((m) => applyRow(m, r, true));
        },
      )
      // 삭제 알림은 거를 수 없고 기본 키(message_id, user_id, emoji)만 온다 → 목록에 있으면 제거
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "reactions" }, (payload) => {
        const r = payload.old as Partial<Row>;
        if (active && r.message_id !== undefined && r.user_id && r.emoji) {
          updateRef.current((m) => applyRow(m, r as Row, false));
        }
      })
      .subscribe();
    const onLocal = (e: Event) => {
      const { add, ...row } = (e as CustomEvent<ReactionEvent>).detail;
      updateRef.current((m) => applyRow(m, row, add));
    };
    window.addEventListener(REACTION_EVENT, onLocal);
    return () => {
      active = false;
      window.removeEventListener(REACTION_EVENT, onLocal);
      supabase.removeChannel(channel);
    };
  }, [channelId]);

  return map;
}
