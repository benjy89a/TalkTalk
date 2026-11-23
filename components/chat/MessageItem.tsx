// [B] 메시지 한 줄
// grouped=true 면 바로 위 메시지와 같은 사람이 5분 안에 보낸 것 → 이름·아바타 생략
// status: "sending"(보내는 중, 흐리게) / "failed"(실패, 재전송·삭제 버튼) / 없음(저장됨)
import { discardMessage, retryMessage, type DisplayMessage } from "./outbox";
import { formatShortTime, formatTime } from "./format";

type Props = {
  message: DisplayMessage;
  grouped?: boolean;
};

export default function MessageItem({ message, grouped = false }: Props) {
  const name = message.profiles?.name || "알 수 없음";
  const time = formatTime(message.created_at);
  const { status } = message;

  return (
    <div className={`group flex gap-3 rounded-md px-2 hover:bg-gray-50 ${grouped ? "py-0.5" : "pt-2 pb-0.5"}`}>
      {/* 왼쪽: 아바타 자리 (묶인 메시지는 마우스를 올리면 시간만 보여줌) */}
      <div className="w-9 shrink-0">
        {grouped ? (
          // whitespace-nowrap: 좁은 칸에서 시간이 두 줄로 접혀 줄 간격이 벌어지는 것 방지
          <span className="invisible block text-right text-[10px] leading-6 whitespace-nowrap text-gray-500 group-hover:visible">
            {formatShortTime(message.created_at)}
          </span>
        ) : (
          <div
            aria-hidden
            className="flex h-9 w-9 items-center justify-center rounded-md bg-[#1e325c] text-sm font-semibold text-white"
          >
            {name.slice(0, 1)}
          </div>
        )}
      </div>

      {/* 오른쪽: 이름·시간 + 본문 */}
      <div className="min-w-0 flex-1">
        {!grouped && (
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold text-gray-900">{name}</span>
            <time dateTime={message.created_at} className="text-xs leading-5 text-gray-600">
              {time}
            </time>
          </div>
        )}
        <p
          className={`text-sm leading-6 whitespace-pre-wrap break-words ${
            status ? "text-gray-400" : "text-gray-900"
          }`}
          aria-busy={status === "sending" || undefined}
        >
          {message.content}
        </p>
        {status === "failed" && (
          <p className="flex items-center gap-2 text-xs leading-5 text-red-600" role="alert">
            전송 실패
            <button
              type="button"
              onClick={() => retryMessage(message.client_id)}
              className="font-medium underline hover:text-red-700"
            >
              재전송
            </button>
            <button
              type="button"
              onClick={() => discardMessage(message.client_id)}
              className="font-medium underline hover:text-red-700"
            >
              삭제
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
