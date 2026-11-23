"use client";
// [B] 메시지 한 줄 — 카톡처럼 상대방은 왼쪽, 나는 오른쪽 말풍선
// mine  : 내 메시지면 오른쪽(남색), 아니면 왼쪽(회색)
// first : 같은 사람이 5분 안에 연달아 보낸 묶음의 첫 메시지 → 상대방은 아바타·이름 표시
// last  : 묶음의 마지막 메시지 → 말풍선 옆에 시간 표시
// status: "sending"(보내는 중, 흐리게) / "failed"(실패, 재전송·삭제) / 없음(저장됨)
// thread: 답글 수·마지막 답글 시간 (B-5). 답글이 있으면 말풍선 아래 "답글 n개 · 시간",
//         없으면 마우스를 올렸을 때만 말풍선 옆에 "답글" 버튼
// renderAttachments: 말풍선 아래에 첨부를 그릴 칸 (D 첨부 기능이 채움, CONTRACTS.md)
//                    보내는 중/실패 메시지는 아직 DB id 가 없으므로 그리지 않는다
import type { ReactNode } from "react";
import { discardMessage, retryMessage, type DisplayMessage } from "./outbox";
import { formatTime } from "./format";

type Props = {
  message: DisplayMessage;
  mine: boolean;
  first: boolean;
  last: boolean;
  thread?: { count: number; lastAt: string };
  onOpenThread?: () => void;
  active?: boolean; // 지금 스레드 패널에 열린 메시지
  renderAttachments?: (message: DisplayMessage) => ReactNode;
};

const BUBBLE = "min-w-0 rounded-2xl px-3 py-1.5 text-sm leading-6 whitespace-pre-wrap break-words";

export default function MessageItem({
  message,
  mine,
  first,
  last,
  thread,
  onOpenThread,
  active,
  renderAttachments,
}: Props) {
  const name = message.profiles?.name || "알 수 없음";
  const { status } = message;

  // 말풍선 옆 작은 글씨: 실패면 재전송·삭제, 묶음의 마지막이면 시간
  const side =
    status === "failed" ? (
      <span className="flex shrink-0 flex-col items-end text-[11px] leading-4 text-red-600" role="alert">
        전송 실패
        <span className="flex gap-1">
          <button type="button" onClick={() => retryMessage(message.client_id)} className="font-medium underline hover:text-red-700">
            재전송
          </button>
          <button type="button" onClick={() => discardMessage(message.client_id)} className="font-medium underline hover:text-red-700">
            삭제
          </button>
        </span>
      </span>
    ) : last && status !== "sending" ? (
      <time dateTime={message.created_at} className="shrink-0 text-[11px] leading-4 whitespace-nowrap text-gray-500">
        {formatTime(message.created_at)}
      </time>
    ) : null;

  const hasReplies = !!thread && thread.count > 0;
  // 답글이 없을 때: 마우스를 올리면 말풍선 옆에 나타나는 버튼 (가로 공간만 써서 줄 간격이 안 벌어짐)
  const replyButton =
    onOpenThread && !hasReplies ? (
      <button
        type="button"
        onClick={onOpenThread}
        data-thread-trigger
        className="invisible shrink-0 rounded px-1 text-[11px] leading-4 font-medium text-gray-500 group-hover:visible hover:text-[#1e325c] focus-visible:visible"
      >
        답글
      </button>
    ) : null;
  // 답글이 있을 때: 말풍선 아래 "답글 n개 · 마지막 답글 시간"
  const replyLink =
    onOpenThread && hasReplies ? (
      <button
        type="button"
        onClick={onOpenThread}
        data-thread-trigger
        className="mt-0.5 text-xs leading-5 font-medium text-blue-700 hover:underline"
      >
        답글 {thread.count}개 · {formatTime(thread.lastAt)}
      </button>
    ) : null;
  const rowBg = active ? "bg-blue-50" : "";
  // 첨부 칸 (D) — 저장된 메시지에만
  const attachments = renderAttachments && !status ? renderAttachments(message) : null;

  if (mine) {
    return (
      <div className={`group flex flex-col items-end rounded-md px-2 ${rowBg} ${first ? "mt-3" : "mt-1"}`}>
        <div className="flex max-w-[75%] items-end gap-1.5">
          {replyButton}
          {side}
          <p
            className={`${BUBBLE} bg-[#1e325c] text-white ${status ? "opacity-60" : ""}`}
            aria-busy={status === "sending" || undefined}
          >
            {message.content}
          </p>
        </div>
        {attachments && <div className="mt-1 max-w-[75%]">{attachments}</div>}
        {replyLink}
      </div>
    );
  }

  return (
    <div className={`group flex gap-2 rounded-md px-2 ${rowBg} ${first ? "mt-3" : "mt-1"}`}>
      {/* 왼쪽: 묶음 첫 메시지에만 아바타, 나머지는 같은 너비의 빈칸 */}
      <div className="w-9 shrink-0">
        {first && (
          <div
            aria-hidden
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-300 text-sm font-semibold text-gray-700"
          >
            {name.slice(0, 1)}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {first && <p className="mb-1 text-xs leading-5 font-semibold text-gray-700">{name}</p>}
        <div className="flex max-w-[75%] items-end gap-1.5">
          <p className={`${BUBBLE} bg-gray-100 text-gray-900`}>{message.content}</p>
          {side}
          {replyButton}
        </div>
        {attachments && <div className="mt-1 max-w-[75%]">{attachments}</div>}
        {replyLink}
      </div>
    </div>
  );
}
