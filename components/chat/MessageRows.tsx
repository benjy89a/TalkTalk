"use client";
// [B] 메시지 말풍선 목록 그리기 (채널 본문 MessageList 와 스레드 ThreadView 가 같이 씀)
// 날짜 구분선, 5분 안 연속 메시지 묶기, 내 메시지 오른쪽 정렬, 답글 링크
import { Fragment, type ReactNode } from "react";
import MessageItem from "./MessageItem";
import { formatDateDivider, isGroupedWith, isSameDay } from "./format";
import type { DisplayMessage } from "./outbox";
import type { ReplyStats } from "./useChannelMessages";

type Props = {
  messages: DisplayMessage[];
  myId: string | null;
  replyStats?: ReplyStats; // 있으면 "답글 n개" / "답글 달기" 를 보여줌 (채널 본문용)
  onOpenThread?: (rootId: number) => void;
  activeRootId?: number | null; // 지금 스레드 패널에 열린 원본 메시지 (살짝 강조)
  renderAttachments?: (message: DisplayMessage) => ReactNode; // 말풍선 아래 첨부 칸 (D)
};

export default function MessageRows({
  messages,
  myId,
  replyStats,
  onOpenThread,
  activeRootId,
  renderAttachments,
}: Props) {
  return (
    <>
      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const next = messages[i + 1];
        const newDay = !prev || !isSameDay(prev.created_at, m.created_at);
        return (
          <Fragment key={m.client_id}>
            {newDay && <DateDivider iso={m.created_at} />}
            <MessageItem
              message={m}
              // 보내는 중/실패 표시가 있는 건 방금 내가 보낸 것
              mine={!!m.status || m.user_id === myId}
              first={!isGroupedWith(prev, m)}
              last={!isGroupedWith(m, next)}
              thread={replyStats ? (replyStats[m.id] ?? { count: 0, lastAt: "" }) : undefined}
              onOpenThread={onOpenThread && !m.status ? () => onOpenThread(m.id) : undefined}
              active={activeRootId === m.id}
              renderAttachments={renderAttachments}
            />
          </Fragment>
        );
      })}
    </>
  );
}

export function DateDivider({ iso }: { iso: string }) {
  return (
    <div className="my-4 flex items-center gap-3" role="separator">
      <div className="h-px flex-1 bg-gray-200" />
      <span className="text-xs leading-5 font-medium text-gray-600">{formatDateDivider(iso)}</span>
      <div className="h-px flex-1 bg-gray-200" />
    </div>
  );
}
