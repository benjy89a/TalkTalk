"use client";
// [B] "○○님이 입력 중…" 표시 (Supabase Realtime broadcast — DB 테이블·새 패키지 없음)
//
// 사용 (MessageInput 안에서): const { typingText, notifyTyping, notifyStopped } = useTyping(channelId, parentId);
// - 글자를 치면 notifyTyping() → 같은 채널(스레드면 같은 스레드)을 보고 있는 사람들에게 "입력 중" 신호 (2초에 한 번만)
// - 입력창에 안 보낸 글이 있으면 손을 멈추거나 다른 창을 눌러도 2초마다 "아직 입력 중"을 다시 보냄
//   (마지막으로 친 뒤 30초가 지나면 그만 보냄 — 글을 써 두고 자리를 비운 경우)
// - 보내거나 입력창을 비우면 notifyStopped() → 바로 사라짐. 채널을 옮기거나 화면이 닫혀도 멈춤 신호
// - 신호가 5초 동안 안 오면(창을 닫았거나 인터넷이 끊김) 저절로 사라짐
// 방송은 DB 에 저장되지 않는 일회성 신호라, 메시지 내용은 보내지 않고 "누가 치는 중인지"만 보낸다.
import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { getProfile } from "./chatData";

const SEND_EVERY_MS = 2000; // 입력 중 신호를 다시 보내는 간격
const EXPIRE_MS = 5000; // 이 시간 동안 신호가 없으면 "입력 중"을 지운다
const IDLE_MS = 30000; // 마지막으로 친 뒤 이 시간이 지나면 "아직 입력 중" 신호를 그만 보낸다

type Signal = { userId: string; name: string; typing: boolean };

// "계섭님이 입력 중…" / "계섭님, 수정님이 입력 중…" / "계섭님 외 2명이 입력 중…"
export function typingLabel(names: string[]): string | null {
  if (names.length === 0) return null;
  if (names.length <= 2) return `${names.map((n) => `${n}님`).join(", ")}이 입력 중…`;
  return `${names[0]}님 외 ${names.length - 1}명이 입력 중…`;
}

export function useTyping(channelId: string, parentId: number | null) {
  const [typers, setTypers] = useState<Record<string, { name: string; at: number }>>({});
  const channelRef = useRef<RealtimeChannel | null>(null);
  const meRef = useRef<{ userId: string; name: string } | null>(null);
  const lastSentRef = useRef(0); // 마지막으로 "입력 중"을 보낸 시각 (0 = 지금 입력 중 아님)
  const lastKeyRef = useRef(0); // 마지막으로 글자가 바뀐 시각

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    // 채널 본문과 스레드는 서로 다른 방송 채널 (같은 화면에 둘 다 열려 있어도 섞이지 않게)
    const topic = `typing:${channelId}:${parentId ?? "root"}`;
    const channel = supabase
      .channel(topic, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        const s = payload as Signal;
        if (!active || !s?.userId || s.userId === meRef.current?.userId) return;
        setTypers((prev) => {
          const next = { ...prev };
          if (s.typing) next[s.userId] = { name: s.name || "누군가", at: Date.now() };
          else delete next[s.userId];
          return next;
        });
      })
      .subscribe();
    channelRef.current = channel;

    // 내 이름 (보낼 신호에 넣음)
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const user = session?.user;
      if (!user || !active) return;
      const profile = await getProfile(user.id);
      meRef.current = { userId: user.id, name: profile?.name || user.email?.split("@")[0] || "" };
    });

    return () => {
      active = false;
      // 채널을 옮기거나 화면이 닫히면 "멈춤"을 남기고 나간다
      if (lastSentRef.current && meRef.current) {
        channel.send({ type: "broadcast", event: "typing", payload: { ...meRef.current, typing: false } satisfies Signal });
      }
      channelRef.current = null;
      lastSentRef.current = 0;
      supabase.removeChannel(channel);
      setTypers({});
    };
  }, [channelId, parentId]);

  // 오래된 "입력 중"은 1초마다 정리
  const hasTypers = Object.keys(typers).length > 0;
  useEffect(() => {
    if (!hasTypers) return;
    const t = setInterval(() => {
      const now = Date.now();
      setTypers((prev) => {
        const keep = Object.entries(prev).filter(([, v]) => now - v.at < EXPIRE_MS);
        return keep.length === Object.keys(prev).length ? prev : Object.fromEntries(keep);
      });
    }, 1000);
    return () => clearInterval(t);
  }, [hasTypers]);

  const send = useCallback((typing: boolean) => {
    const me = meRef.current;
    const channel = channelRef.current;
    if (!me || !channel) return;
    channel.send({ type: "broadcast", event: "typing", payload: { ...me, typing } satisfies Signal });
  }, []);

  const notifyTyping = useCallback(() => {
    const now = Date.now();
    lastKeyRef.current = now;
    if (now - lastSentRef.current < SEND_EVERY_MS) return;
    lastSentRef.current = now;
    send(true);
  }, [send]);

  // 안 보낸 글이 있는 동안은 손을 멈춰도 2초마다 "아직 입력 중" (다른 창을 눌러도 상대 화면에서 안 사라지게)
  useEffect(() => {
    const t = setInterval(() => {
      const now = Date.now();
      if (!lastSentRef.current) return; // 입력 중 아님 (안 보냈거나 멈춤)
      if (now - lastKeyRef.current > IDLE_MS) return; // 써 두고 자리를 비움 → 상대 화면에선 5초 뒤 사라짐
      if (now - lastSentRef.current < SEND_EVERY_MS) return;
      lastSentRef.current = now;
      send(true);
    }, 1000);
    return () => clearInterval(t);
  }, [send]);

  const notifyStopped = useCallback(() => {
    if (lastSentRef.current === 0) return; // 보낸 적 없으면 멈춤 신호도 필요 없음
    lastSentRef.current = 0;
    send(false);
  }, [send]);

  const typingText = typingLabel(Object.values(typers).map((t) => t.name));
  return { typingText, notifyTyping, notifyStopped };
}
