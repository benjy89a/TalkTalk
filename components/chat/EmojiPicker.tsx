"use client";
// [B] 이모지 고르는 창 (작업 2) — 입력창 😊 버튼과 말풍선 반응 "＋" 가 같이 쓴다
// 새 패키지 없이 자주 쓰는 이모지만 직접 모아 둠 (패키지 추가는 팀장 협의 사항)
// 닫기: 바깥 클릭 · Esc (마우스가 잠깐 벗어나는 것으로는 닫지 않음 — 예전 반응 창은 이것 때문에 누르러 가면 사라졌다)
import { useEffect, useRef, useState, type RefObject } from "react";

export const EMOJI_GROUPS: { name: string; emojis: string[] }[] = [
  {
    name: "자주 쓰는",
    emojis: ["👍", "❤️", "😂", "😮", "😢", "🙏", "🎉", "👏", "🔥", "✅", "👀", "💯", "🙌", "😊", "🤔", "😅"],
  },
  {
    name: "표정",
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘",
      "😋", "😜", "🤪", "😎", "🤓", "🧐", "🤔", "🤫", "😐", "😑", "😶", "🙄", "😏", "😬", "😌", "😴",
      "😷", "🤒", "🥵", "🥶", "🤯", "😵", "🥳", "😕", "😟", "🙁", "😮", "😲", "😳", "🥺", "😢", "😭",
      "😱", "😖", "😣", "😞", "😓", "😩", "😫", "😤", "😡", "🤬",
    ],
  },
  {
    name: "손·사람",
    emojis: [
      "👍", "👎", "👌", "✌️", "🤞", "🤟", "🤙", "👋", "🙌", "👏", "🙏", "🤝", "💪", "👊", "✊", "👉",
      "👈", "👆", "👇", "☝️", "✋", "🤚", "🖐️", "👀", "🧠", "🙋", "🙆", "🙅", "🤷", "🤦", "💁", "🙇",
    ],
  },
  {
    name: "하트·기호",
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💔", "💕", "💖", "✨", "⭐", "🌟", "🔥", "💯",
      "✅", "❌", "⭕", "❗", "❓", "⚠️", "🚫", "💤", "💬", "📌", "🔔", "⏰", "🆗", "🆕", "➕", "🎯",
    ],
  },
  {
    name: "사물·음식",
    emojis: [
      "🎉", "🎊", "🎁", "🏆", "🎂", "☕", "🍵", "🍺", "🍻", "🍕", "🍔", "🍜", "🍱", "🍰", "🍎", "🍓",
      "💻", "📱", "📎", "📝", "📅", "📊", "📈", "💡", "🔑", "🚀", "✈️", "🚗", "🏠", "🌈", "☀️", "🌧️",
    ],
  },
];

// 열려 있는 창을 바깥 클릭 · Esc 로 닫는다
// Esc 는 문서 "캡처" 단계에서 먼저 받아 preventDefault → 스레드 패널의 "Esc 로 닫기"가 같이 실행되지 않음
export function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, onClose: () => void) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node | null;
      if (target && ref.current?.contains(target)) return;
      closeRef.current();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      closeRef.current();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, ref]);
}

type Props = {
  onPick: (emoji: string) => void;
  // 반응용: 내가 이미 단 이모지는 파랗게
  selected?: (emoji: string) => boolean;
  className?: string; // 위치 (absolute ... ) — 부르는 쪽에서 정함
};

export default function EmojiPicker({ onPick, selected, className = "" }: Props) {
  const [group, setGroup] = useState(0);
  return (
    <div
      role="dialog"
      aria-label="이모지 고르기"
      className={`z-30 w-72 rounded-xl border border-gray-200 bg-white p-2 shadow-lg ${className}`}
    >
      {/* 분류 탭 */}
      {/* 좁은 칸(w-72)에 다 안 들어가면 두 줄로 (가로 스크롤바가 생기면 마지막 탭이 잘려 보였다) */}
      <div className="mb-1 flex flex-wrap gap-1 border-b border-gray-100 pb-1">
        {EMOJI_GROUPS.map((g, i) => (
          <button
            key={g.name}
            type="button"
            onClick={() => setGroup(i)}
            aria-pressed={group === i}
            className={`shrink-0 rounded-md px-2 py-0.5 text-xs leading-5 font-medium whitespace-nowrap ${
              group === i ? "bg-[#1e325c] text-white" : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {g.name}
          </button>
        ))}
      </div>
      {/* 이모지 칸 */}
      <div className="grid max-h-48 grid-cols-8 gap-0.5 overflow-y-auto">
        {EMOJI_GROUPS[group].emojis.map((emoji, i) => (
          <button
            key={`${emoji}-${i}`}
            type="button"
            onClick={() => onPick(emoji)}
            aria-label={emoji}
            className={`flex h-8 w-8 items-center justify-center rounded-md text-xl leading-none transition-transform hover:scale-125 hover:bg-gray-100 ${
              selected?.(emoji) ? "bg-blue-50" : ""
            }`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
