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
// 쓰던 글 임시 저장 (drafts.ts): 채널을 옮기거나 새로고침해도 쓰던 글이 남아 있음
// 답장 (composer.ts): 말풍선 "답장" → 입력창 위 "○○님에게 답장" 줄 (✕ · Esc 로 취소). 보내면 맨 앞에 인용 줄
// ↑ 키: 입력창이 비어 있으면 내 마지막 메시지 수정
// 이모지 단축 입력 (emojiShortcode.ts): ":웃음" → 후보 목록. ↑↓ 이동 · Enter/Tab 넣기 · Esc 닫기
// 캡쳐 이미지 붙여넣기 (pasteImage.ts): 채널 입력창에서 Ctrl+V(⌘+V) 하면 클립보드 이미지를 바로 첨부로 보냄
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { composerScope, requestEditLast, setQuote, useQuote, withQuote } from "./composer";
import { draftKey, readDraft, writeDraft } from "./drafts";
import EmojiPicker, { useDismiss } from "./EmojiPicker";
import { findShortcode, matchEmojis } from "./emojiShortcode";
import { useMentionAutocomplete } from "@/components/notifications/useMentionAutocomplete";
import { wrapSelection } from "./formatText";
import { MAX_LENGTH, sendMessage } from "./outbox";
import { usePasteImage } from "./pasteImage";
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
  // 쓰던 글이 있으면 불러온다 (입력창은 채널·스레드가 바뀔 때마다 새로 만들어짐 — key)
  const storeKey = draftKey(channelId, parentId);
  const [text, setText] = useState(() => readDraft(storeKey));
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    writeDraft(storeKey, text);
  }, [storeKey, text]);
  const [caret, setCaret] = useState(0); // 커서 위치 (이모지 단축 입력용)
  // 입력한 글자를 "멘션 훅보다 먼저" 기억한다.
  // 멘션 훅은 입력창에 직접 input 리스너를 붙여 커서 위치를 상태로 바꾸는데, 그 순간 화면이 다시 그려지면서
  // 아직 새 글자를 모르는 입력창이 이전 값(빈 칸)으로 되돌아가 "글자가 안 써지는" 문제가 있었다.
  // useLayoutEffect 는 훅의 useEffect 보다 먼저 실행되므로, 여기서 붙인 리스너가 먼저 불린다.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const sync = () => {
      setText(el.value);
      setCaret(el.selectionStart);
    };
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
    setCaret(start + emoji.length);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + emoji.length, start + emoji.length);
    });
  }

  // 입력 중 신호: 글자가 있으면 "입력 중"(2초에 한 번), 비우면 바로 멈춤
  const { typingText, notifyTyping, notifyStopped } = useTyping(channelId, parentId);
  // 캡쳐 이미지 붙여넣기 — 스레드엔 첨부 미리보기가 아직 없어서 채널 입력창에서만
  const paste = usePasteImage(channelId, parentId);
  const canPasteImage = parentId === null;
  useEffect(() => {
    if (text.trim()) notifyTyping();
    else notifyStopped();
  }, [text, notifyTyping, notifyStopped]);

  // 답장 인용
  const scope = composerScope(channelId, parentId);
  const quote = useQuote(scope);
  useEffect(() => {
    if (quote) ref.current?.focus(); // "답장"을 누르면 바로 칠 수 있게
  }, [quote]);
  const clearQuote = () => setQuote(scope, null);

  // 이모지 단축 입력 ":웃음"
  const shortcode = findShortcode(text, caret);
  const [closedAt, setClosedAt] = useState<number | null>(null); // Esc 로 닫은 자리 (같은 자리에선 다시 안 뜸)
  const suggestions = shortcode && shortcode.start !== closedAt ? matchEmojis(shortcode.query) : [];
  const [pickIndex, setPickIndex] = useState(0);
  const [indexFor, setIndexFor] = useState("");
  const sugKey = shortcode ? `${shortcode.start}:${shortcode.query}` : "";
  if (indexFor !== sugKey) {
    // 검색어가 바뀌면 첫 후보부터
    setIndexFor(sugKey);
    setPickIndex(0);
  }
  function pickShortcode(emoji: string) {
    if (!shortcode) return;
    const next = text.slice(0, shortcode.start) + emoji + text.slice(caret);
    const pos = shortcode.start + emoji.length;
    setText(next);
    setCaret(pos);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(pos, pos);
    });
  }

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
    // 답장이면 맨 앞에 "> 이름: 원문" 줄을 붙여 보낸다
    sendMessage({ channelId, parentId, content: withQuote(quote, text) });
    notifyStopped();
    clearQuote();
    setText("");
    ref.current?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // 멘션 목록(D 훅)이 이미 처리한 키는 건드리지 않음
    if (e.defaultPrevented) return;
    // 이모지 단축 입력 목록이 열려 있으면 ↑↓ · Enter/Tab · Esc 는 목록용
    if (suggestions.length > 0 && !e.nativeEvent.isComposing) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : -1;
        setPickIndex((i) => (i + step + suggestions.length) % suggestions.length);
        return;
      }
      if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
        e.preventDefault();
        pickShortcode(suggestions[Math.min(pickIndex, suggestions.length - 1)].emoji);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault(); // 스레드 패널 닫기(Esc)와 겹치지 않게
        setClosedAt(shortcode!.start);
        return;
      }
    }
    // 답장 취소
    if (e.key === "Escape" && quote) {
      e.preventDefault();
      clearQuote();
      return;
    }
    // 입력창이 비어 있을 때 ↑ → 내 마지막 메시지 수정 (없으면 원래 ↑)
    if (e.key === "ArrowUp" && !text && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
      if (requestEditLast(scope)) e.preventDefault();
      return;
    }
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
        {/* 이모지 단축 입력 후보 */}
        {suggestions.length > 0 && (
          <ul
            role="listbox"
            aria-label="이모지 후보"
            className="absolute bottom-full left-0 z-30 mb-1 max-w-full overflow-hidden rounded-md border border-gray-200 bg-white py-1 text-sm shadow-lg"
          >
            {suggestions.map((s, i) => (
              <li key={s.emoji} role="option" aria-selected={i === pickIndex}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()} // 입력창 초점을 뺏지 않게
                  onClick={() => pickShortcode(s.emoji)}
                  onMouseEnter={() => setPickIndex(i)}
                  className={`flex w-full items-center gap-2 px-3 py-1 text-left ${i === pickIndex ? "bg-blue-50 text-[#1e325c]" : "text-gray-700"}`}
                >
                  <span className="text-lg leading-6">{s.emoji}</span>
                  <span className="text-xs text-gray-500">:{s.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {typingText && (
          <p role="status" className="absolute bottom-full left-1 mb-0.5 text-xs leading-4 text-gray-500 italic">
            {typingText}
          </p>
        )}
      </div>
      {/* 답장 중: 누구의 어떤 글에 답하는지 */}
      {quote && (
        // 카톡처럼: 입력창 바로 위에 "○○에게 답장" + 원문 한 줄, 오른쪽 ✕
        <div className="mb-2 flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50 py-2 pr-2 pl-3">
          <span aria-hidden className="text-lg leading-none font-semibold text-[#1e325c]">↳</span>
          <div className="min-w-0 flex-1">
            <p className="text-xs leading-5 font-semibold text-gray-900">{quote.name}에게 답장</p>
            <p className="truncate text-xs leading-5 text-gray-500">{quote.text}</p>
          </div>
          <button
            type="button"
            onClick={clearQuote}
            aria-label="답장 취소"
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-800"
          >
            ✕
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={ref}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onKeyDown={onKeyDown}
          onPaste={canPasteImage ? paste.onPaste : undefined}
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
      {/* 캡쳐 이미지 보내는 중 · 실패 이유 */}
      {paste.status && (
        <p
          role={paste.status.kind === "error" ? "alert" : "status"}
          className={`mt-1 flex items-center gap-2 text-xs leading-5 ${paste.status.kind === "error" ? "text-red-700" : "text-gray-600"}`}
        >
          <span className="min-w-0 truncate">{paste.status.text}</span>
          {paste.status.kind === "error" && (
            <button type="button" onClick={paste.clearStatus} aria-label="알림 닫기" className="shrink-0 text-gray-500 hover:text-gray-800">
              ✕
            </button>
          )}
        </p>
      )}
      {/* 입력창 아래 칸: 첨부 버튼 · @멘션 (D) */}
      {extras && <div className="mt-2 flex items-center gap-2">{extras}</div>}
    </div>
  );
}
