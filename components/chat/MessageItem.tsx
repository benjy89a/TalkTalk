"use client";
// [B] 메시지 한 줄 — 카톡처럼 상대방은 왼쪽, 나는 오른쪽 말풍선
// mine  : 내 메시지면 오른쪽(남색), 아니면 왼쪽(회색)
// first : 같은 사람이 5분 안에 연달아 보낸 묶음의 첫 메시지 → 상대방은 아바타·이름 표시
// last  : 묶음의 마지막 메시지 → 말풍선 옆에 시간 표시
// status: "sending"(보내는 중, 흐리게) / "failed"(실패, 재전송·삭제) / 없음(저장됨)
import { discardMessage, retryMessage, type DisplayMessage } from "./outbox";
import { formatTime } from "./format";

type Props = {
  message: DisplayMessage;
  mine: boolean;
  first: boolean;
  last: boolean;
};

const BUBBLE = "min-w-0 rounded-2xl px-3 py-1.5 text-sm leading-6 whitespace-pre-wrap break-words";

export default function MessageItem({ message, mine, first, last }: Props) {
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

  if (mine) {
    return (
      <div className={`flex justify-end px-2 ${first ? "mt-3" : "mt-1"}`}>
        <div className="flex max-w-[75%] items-end gap-1.5">
          {side}
          <p
            className={`${BUBBLE} bg-[#1e325c] text-white ${status ? "opacity-60" : ""}`}
            aria-busy={status === "sending" || undefined}
          >
            {message.content}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex gap-2 px-2 ${first ? "mt-3" : "mt-1"}`}>
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
        </div>
      </div>
    </div>
  );
}
