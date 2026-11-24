"use client";
// [B] 메시지 말풍선 목록 그리기 (채널 본문 MessageList 와 스레드 ThreadView 가 같이 씀)
// 날짜 구분선, 5분 안 연속 메시지 묶기, 내 메시지 오른쪽 정렬, 답글 링크
import { Fragment, useEffect, type ReactNode } from "react";
import { quoteSnippet, setLastMine, setQuote } from "./composer";
import MessageItem from "./MessageItem";
import { formatDateDivider, isGroupedWith, isSameDay } from "./format";
import type { DisplayMessage } from "./outbox";
import type { ReplyStats } from "./useChannelMessages";
import { summarize, type ReactionMap } from "./useReactions";

type Props = {
  messages: DisplayMessage[];
  myId: string | null;
  scope?: string; // 입력창과 짝이 되는 칸 이름 (composer.ts) — 답장 인용 · ↑ 키 수정에 씀
  replyStats?: ReplyStats; // 있으면 "답글 n개" / "답글 달기" 를 보여줌 (채널 본문용)
  onOpenThread?: (rootId: number) => void;
  activeRootId?: number | null; // 지금 스레드 패널에 열린 원본 메시지 (살짝 강조)
  renderAttachments?: (message: DisplayMessage) => ReactNode; // 말풍선 아래 첨부 칸 (D)
  wide?: boolean; // 좁은 스레드 패널용 넓은 말풍선
  reactions?: ReactionMap; // 이모지 반응 (메시지 id → 반응들)
  onReact?: (messageId: number, emoji: string, alreadyMine: boolean) => void;
  unreadOf?: (message: DisplayMessage) => number; // 안 읽은 사람 수 (채널 본문만, readCounts.ts)
};

export default function MessageRows({
  messages,
  myId,
  scope,
  replyStats,
  onOpenThread,
  activeRootId,
  renderAttachments,
  wide,
  reactions,
  onReact,
  unreadOf,
}: Props) {
  // ↑ 키로 고칠 "내 마지막 메시지" (저장됐고 지워지지 않은 것)를 입력창에 알려 둔다
  let lastMineId: number | undefined;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m.status && !m.deleted_at && myId && m.user_id === myId) {
      lastMineId = m.id;
      break;
    }
  }
  useEffect(() => {
    if (!scope) return;
    setLastMine(scope, lastMineId);
    return () => setLastMine(scope, undefined);
  }, [scope, lastMineId]);

  return (
    <>
      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const next = messages[i + 1];
        const newDay = !prev || !isSameDay(prev.created_at, m.created_at);
        return (
          <Fragment key={m.client_id}>
            {newDay && <DateDivider iso={m.created_at} />}
            {/* data-message-id: 메시지로 이동할 때 이 말풍선을 찾는 표시 (저장된 메시지만). 강조색은 useStickToBottom 이 잠깐 붙임 */}
            <div data-message-id={m.status ? undefined : m.id} className="rounded-md transition-colors duration-700">
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
              wide={wide}
              reactions={reactions ? summarize(reactions[m.id], myId) : undefined}
              onReact={onReact && !m.status ? (emoji, mine) => onReact(m.id, emoji, mine) : undefined}
              unread={unreadOf?.(m)}
              onQuote={
                scope && !m.status && !m.deleted_at
                  ? () => setQuote(scope, { name: m.profiles?.name || "알 수 없음", text: quoteSnippet(m.content) })
                  : undefined
              }
            />
            </div>
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
