"use client";

// 읽음 처리 훅 (D-1)
//
// 메시지 목록 컴포넌트(B 담당)에서 한 줄만 넣으면,
// "지금 보고 있는 채널의 마지막 메시지"까지 자동으로 읽음 처리된다.
//
// 사용 예:
//   import { useMarkAsRead } from "@/components/notifications/useMarkAsRead";
//
//   // messages: 화면에 보이는 채널 본문 메시지 배열 (id 오름차순)
//   const lastId = messages.at(-1)?.id ?? null;
//   useMarkAsRead(channelId, lastId);
//
// 동작:
// - 채널을 열거나 새 메시지가 와서 lastId 가 커지면 DB에 읽음 위치를 저장한다.
// - 브라우저 탭이 숨겨져 있으면(다른 탭을 보고 있으면) 읽지 않은 것으로 두고,
//   탭으로 돌아오는 순간 읽음 처리한다.
// - 같은 값을 여러 번 보내지 않는다.
import { useEffect, useRef } from "react";
import { markAsRead } from "./markAsRead";

export function useMarkAsRead(
  channelId: string | null | undefined,
  lastMessageId: number | null | undefined,
) {
  // 채널별로 "마지막으로 보낸 읽음 위치"를 기억해 같은 요청을 반복하지 않는다.
  const sentRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!channelId || lastMessageId == null) return;

    const trySend = () => {
      if (document.visibilityState !== "visible") return;
      const sent = sentRef.current.get(channelId) ?? 0;
      if (lastMessageId <= sent) return;
      sentRef.current.set(channelId, lastMessageId);
      void markAsRead(channelId, lastMessageId);
    };

    trySend();
    document.addEventListener("visibilitychange", trySend);
    return () => document.removeEventListener("visibilitychange", trySend);
  }, [channelId, lastMessageId]);
}
