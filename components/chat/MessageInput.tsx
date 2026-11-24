"use client";
// [B] 메시지 입력창 (B-2)
// 사용 예: <MessageInput channelId={채널id} />            ← 채널 본문
//          <MessageInput channelId={채널id} parentId={원본id} /> ← 스레드 답글
//          <MessageInput channelId={채널id} extras={<AttachButton channelId={채널id} />} />
// extras: 입력창 아래에 놓일 칸 — 첨부 버튼 · @멘션 (D, CONTRACTS.md)
// @멘션 자동완성 (D-3 useMentionAutocomplete): "@" 를 치면 입력창 위에 이름 목록. ↑↓ 이동 · Enter/Tab 선택 · Esc 닫기
//   목록이 열려 있을 때 Enter 는 훅이 먼저 가로채므로(stopPropagation) 메시지가 전송되지 않는다
// Enter: 전송 / Shift+Enter: 줄바꿈 / 최대 6줄까지 늘어나고 그 이상은 입력창 안에서 스크롤
// 😊 버튼 (작업 2): 이모지를 골라 커서 자리에 넣는다. 창은 여러 개 연달아 고를 수 있게 열린 채로 둠 (바깥 클릭 · Esc 로 닫힘)
// "○○님이 입력 중…" (typing.ts): 같은 채널(스레드면 같은 스레드)에서 다른 사람이 글을 치면 입력창 바로 위에 표시
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import EmojiPicker, { useDismiss } from "./EmojiPicker";
import { useMentionAutocomplete } from "@/components/notifications/useMentionAutocomplete";
import { wrapSelection } from "./formatText";
import { MAX_LENGTH, sendMessage } from "./outbox";
import { useTyping } from "./typing";

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

  // 이모지 고르기
  const [emojiOpen, setEmojiOpen] = useState(false);
  const emojiRef = useRef<HTMLDivElement>(null);
  const closeEmoji = useCallback(() => setEmojiOpen(false), []);
  useDismiss(emojiRef, emojiOpen, closeEmoji);
  function insertEmoji(emoji: string) {
    const el = ref.current;
    // 커서(또는 선택한 글자) 자리에 넣고, 커서를 이모지 뒤로
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    setText(text.slice(0, start) + emoji + text.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  // 입력 중 신호: 글자가 있으면 "입력 중"(2초에 한 번), 비우면 바로 멈춤
  const { typingText, notifyTyping, notifyStopped } = useTyping(channelId, parentId);
  useEffect(() => {
    if (text.trim()) notifyTyping();
    else notifyStopped();
  }, [text, notifyTyping, notifyStopped]);

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
    notifyStopped();
    setText("");
    ref.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // 서식 단축키: 글자를 선택하고 Cmd/Ctrl+B 굵게, +I 기울임, +Shift+X 취소선
    if ((e.metaKey || e.ctrlKey) && !e.altKey) {
      const k = e.key.toLowerCase();
      const mark = k === "b" && !e.shiftKey ? "**" : k === "i" && !e.shiftKey ? "*" : k === "x" && e.shiftKey ? "~~" : null;
      if (mark) {
        e.preventDefault();
        const el = e.currentTarget;
        const next = wrapSelection(text, el.selectionStart, el.selectionEnd, mark);
        setText(next.text);
        requestAnimationFrame(() => el.setSelectionRange(next.start, next.end));
        return;
      }
    }
    if (e.key !== "Enter" || e.shiftKey) return;
    // 한글 조합 중 Enter 는 무시 (안 그러면 같은 메시지가 두 번 전송됨)
    if (e.nativeEvent.isComposing) return;
    e.preventDefault();
    submit();
  }

  return (
    <div>
      {mention.popup}
      {/* 다른 사람이 입력 중 — 입력창 바로 위에 띄워서 입력창 위치가 들썩이지 않게 */}
      <div className="relative">
        {typingText && (
          <p role="status" className="absolute bottom-full left-1 mb-0.5 text-xs leading-4 text-gray-500 italic">
            {typingText}
          </p>
        )}
      </div>
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
        <div ref={emojiRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setEmojiOpen((v) => !v)}
            aria-label="이모지 넣기"
            aria-expanded={emojiOpen}
            className="inline-flex h-10 w-10 items-center justify-center rounded-md text-xl text-gray-500 transition-colors hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-[#1e325c] focus-visible:outline-none"
          >
            😊
          </button>
          {emojiOpen && <EmojiPicker onPick={insertEmoji} className="absolute right-0 bottom-full mb-2" />}
        </div>
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
