"use client";
// [B] 메시지 입력창 (B-2)
// 사용 예: <MessageInput channelId={채널id} />            ← 채널 본문
//          <MessageInput channelId={채널id} parentId={원본id} /> ← 스레드 답글
//          <MessageInput channelId={채널id} extras={<AttachButton channelId={채널id} />} />
// extras: 입력창 아래에 놓일 칸 — 첨부 버튼 · @멘션 (D, CONTRACTS.md)
// @멘션 자동완성 (D-3 useMentionAutocomplete): "@" 를 치면 입력창 위에 이름 목록. ↑↓ 이동 · Enter/Tab 선택 · Esc 닫기
//   목록이 열려 있을 때 Enter 는 훅이 먼저 가로채므로(stopPropagation) 메시지가 전송되지 않는다
// Enter: 전송 / Shift+Enter: 줄바꿈 / 최대 6줄까지 늘어나고 그 이상은 입력창 안에서 스크롤
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useMentionAutocomplete } from "@/components/notifications/useMentionAutocomplete";
import { MAX_LENGTH, sendMessage } from "./outbox";

type Props = {
  channelId: string;
  parentId?: number | null;
  placeholder?: string;
  extras?: ReactNode;
};

const MAX_HEIGHT = 6 * 24 + 16; // 6줄(줄 높이 24px) + 위아래 여백

export default function MessageInput({
  channelId,
  parentId = null,
  placeholder = "메시지 보내기",
  extras,
}: Props) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);
  // 입력한 글자를 "멘션 훅보다 먼저" 기억한다.
  // 멘션 훅은 입력창에 직접 input 리스너를 붙여 커서 위치를 상태로 바꾸는데, 그 순간 화면이 다시 그려지면서
  // 아직 새 글자를 모르는 입력창이 이전 값(빈 칸)으로 되돌아가 "글자가 안 써지는" 문제가 있었다.
  // useLayoutEffect 는 훅의 useEffect 보다 먼저 실행되므로, 여기서 붙인 리스너가 먼저 불린다.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sync = () => setText(el.value);
    el.addEventListener("input", sync);
    return () => el.removeEventListener("input", sync);
  }, []);
  // @멘션 자동완성 (D) — 스레드 답글 입력창에도 자동 적용
  const mention = useMentionAutocomplete({ channelId, textareaRef: ref, text, setText });

  const remaining = MAX_LENGTH - text.length;
  const tooLong = remaining < 0;
  const canSend = text.trim().length > 0 && !tooLong;

  // 글 줄 수에 맞춰 높이 조절
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    // scrollHeight 에는 테두리(위아래 1px)가 빠져 있으므로 더해 준다 (안 그러면 2px 모자라 스크롤바가 생김)
    const border = el.offsetHeight - el.clientHeight;
    const wanted = el.scrollHeight + border;
    el.style.height = `${Math.min(wanted, MAX_HEIGHT)}px`;
    // 6줄 이하일 땐 스크롤바를 숨기고, 넘으면 입력창 안에서 스크롤
    el.style.overflowY = wanted > MAX_HEIGHT ? "auto" : "hidden";
  }, [text]);

  function submit() {
    if (!canSend) return;
    // 입력창은 바로 비우고, 저장은 뒤에서 진행 (화면에는 즉시 흐리게 나타남)
    sendMessage({ channelId, parentId, content: text });
    setText("");
    ref.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key !== "Enter" || e.shiftKey) return;
    // 한글 조합 중 Enter 는 무시 (안 그러면 같은 메시지가 두 번 전송됨)
    if (e.nativeEvent.isComposing) return;
    e.preventDefault();
    submit();
  }

  return (
    <div>
      {mention.popup}
      <div className="flex items-end gap-2">
        <textarea
          ref={ref}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          aria-label={placeholder}
          className={`min-w-0 flex-1 resize-none rounded-md border bg-white px-3 py-2 text-sm leading-6 text-gray-900 placeholder:text-gray-500 focus-visible:ring-2 focus-visible:outline-none ${
            tooLong
              ? "border-red-500 focus-visible:ring-red-500"
              : "border-gray-300 focus-visible:border-[#1e325c] focus-visible:ring-[#1e325c]"
          }`}
        />
        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          className="inline-flex min-h-10 items-center justify-center rounded-md bg-[#1e325c] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#172746] focus-visible:ring-2 focus-visible:ring-[#1e325c] focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
        >
          전송
        </button>
      </div>
      {/* 길이 제한에 가까워지면 남은 글자 수 표시 */}
      {remaining <= 500 && (
        <p className={`mt-1 text-right text-xs leading-5 ${tooLong ? "text-red-600" : "text-gray-600"}`}>
          {tooLong ? `${-remaining}자 초과 (최대 ${MAX_LENGTH}자)` : `${remaining}자 남음`}
        </p>
      )}
      {/* 입력창 아래 칸: 첨부 버튼 · @멘션 (D) */}
      {extras && <div className="mt-2 flex items-center gap-2">{extras}</div>}
    </div>
  );
}
