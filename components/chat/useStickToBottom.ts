"use client";
// [B] 새 메시지가 붙을 때 스크롤 처리 (채널 본문 · 스레드 공용)
//  - 처음 불러왔을 때 / 내가 보낸 메시지 / 맨 아래를 보고 있었을 때 → 맨 아래로
//  - 위쪽 예전 메시지를 읽는 중 → 그대로 두고 "새 메시지 n개" 개수를 알려줌
import { useLayoutEffect, useRef, useState } from "react";
import type { DisplayMessage } from "./outbox";

// 맨 아래에서 이 정도(px) 안쪽이면 "맨 아래를 보고 있다"고 본다
const BOTTOM_THRESHOLD = 80;

export function useStickToBottom(messages: DisplayMessage[], ready: boolean, scope: string) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  // 사용자가 마지막으로 본(맨 아래였을 때의) 메시지 → 그 뒤에 온 것이 "새 메시지"
  const [seenKey, setSeenKey] = useState<string>();
  const prevLastRef = useRef<{ scope: string; key?: string }>(undefined);

  const last = messages.at(-1);
  const lastKey = last?.client_id;

  useLayoutEffect(() => {
    if (!ready) return;
    const prev = prevLastRef.current;
    const first = !prev || prev.scope !== scope; // 처음이거나 채널·스레드가 바뀜
    if (!first && prev.key === lastKey) return;
    prevLastRef.current = { scope, key: lastKey };

    const mine = !!last?.status; // 보내는 중 표시가 있으면 내가 방금 보낸 것
    const el = scrollRef.current;
    if (el && (first || mine || atBottomRef.current)) {
      el.scrollTop = el.scrollHeight; // → onScroll 이 불려서 seenKey 갱신
    }
  }, [ready, scope, lastKey, last?.status]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD;
    atBottomRef.current = near;
    setAtBottom(near);
    if (near) setSeenKey(lastKey);
  }

  function scrollToBottom() {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }

  // 아직 안 본 새 메시지 수
  const seenIndex = seenKey ? messages.findIndex((m) => m.client_id === seenKey) : -1;
  const unseen = atBottom || seenIndex < 0 ? 0 : messages.length - 1 - seenIndex;

  return { scrollRef, onScroll, scrollToBottom, unseen };
}
