"use client";

// @멘션 자동완성 훅 (D-3)
//
// 입력창(B 담당 MessageInput)에서 "@" 를 치면 채널 멤버 이름 목록을 띄우고,
// 고르면 "@이름 " 을 입력창에 넣어 준다.
//
// 사용 예 (MessageInput 안에서 세 군데만):
//   import { useMentionAutocomplete } from "@/components/notifications/useMentionAutocomplete";
//
//   const mention = useMentionAutocomplete({ channelId, textareaRef: ref, text, setText });
//
//   return (
//     <div>
//       {mention.popup}            ← 입력창 줄 바로 위에 한 줄 (목록이 입력창 위로 뜬다)
//       <div className="flex items-end gap-2"> <textarea ref={ref} ... /> ... </div>
//     </div>
//   );
//
// 키보드: ↑↓ 이동 / Enter·Tab 선택 / Esc 닫기.
// 목록이 열려 있을 때의 Enter 는 이 훅이 먼저 가로채므로, 메시지가 전송되지 않고 이름만 들어간다.
// (MessageInput 의 onKeyDown 코드는 고치지 않아도 된다)
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { createClient } from "@/lib/supabase/client";
import { findMentionQuery, insertMention } from "./mentions";

type Member = { id: string; name: string };

type Options = {
  channelId: string;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  text: string;
  setText: (text: string) => void;
};

const MAX_SUGGESTIONS = 8;

// 채널 멤버 이름 불러오기 (나는 빼고)
async function loadMembers(channelId: string): Promise<Member[]> {
  const supabase = createClient();
  const [{ data: sessionData }, { data, error }] = await Promise.all([
    supabase.auth.getSession(),
    supabase.from("channel_members").select("user_id, profiles(name)").eq("channel_id", channelId),
  ]);
  if (error) {
    console.error("[mention] 멤버 불러오기 실패:", error.message);
    return [];
  }
  const myId = sessionData.session?.user.id;
  return (data ?? [])
    .filter((r) => r.user_id !== myId && r.profiles?.name)
    .map((r) => ({ id: r.user_id, name: r.profiles!.name }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));
}

export function useMentionAutocomplete({ channelId, textareaRef, text, setText }: Options) {
  const [membersState, setMembersState] = useState<{ channelId: string; list: Member[] }>();
  const [caret, setCaret] = useState(0);
  const [selected, setSelected] = useState({ key: "", index: 0 });
  const [dismissedAt, setDismissedAt] = useState<number | null>(null); // Esc 로 닫은 "@" 위치

  // 채널이 바뀌면 그 채널 멤버를 불러온다
  useEffect(() => {
    let cancelled = false;
    loadMembers(channelId).then((list) => {
      if (!cancelled) setMembersState({ channelId, list });
    });
    return () => {
      cancelled = true;
    };
  }, [channelId]);
  const members = useMemo(
    () => (membersState?.channelId === channelId ? membersState.list : []),
    [membersState, channelId],
  );

  // 지금 "@글자" 를 치는 중인지
  const match = findMentionQuery(text, Math.min(caret, text.length));
  const query = match?.query.toLowerCase() ?? "";
  const hasMatch = match !== null;

  // 이름에 친 글자가 들어 있는 멤버 (앞부분이 같은 사람이 먼저)
  const suggestions = useMemo(() => {
    if (!hasMatch) return [];
    const hit = members.filter((m) => m.name.toLowerCase().includes(query));
    hit.sort(
      (a, b) =>
        Number(!a.name.toLowerCase().startsWith(query)) -
        Number(!b.name.toLowerCase().startsWith(query)),
    );
    return hit.slice(0, MAX_SUGGESTIONS);
  }, [members, query, hasMatch]);

  const open = match !== null && match.start !== dismissedAt && suggestions.length > 0;
  const key = `${match?.start}:${query}`;
  const index = selected.key === key ? Math.min(selected.index, suggestions.length - 1) : 0;

  function choose(name: string) {
    if (!match) return;
    const next = insertMention(text, match.start, Math.min(caret, text.length), name);
    setText(next.text);
    setCaret(next.caret);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
    });
  }

  // 키보드 처리에서 최신 값을 쓰기 위해 ref 에 담아 둔다
  const latest = useRef({ open, suggestions, index, key, match, choose });
  useEffect(() => {
    latest.current = { open, suggestions, index, key, match, choose };
  });

  // 입력창에 직접 귀를 붙인다: 커서 위치 추적 + 목록이 열렸을 때 키보드 가로채기
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    // 커서 위치는 "다음 화면 그리기 직전"에 기억한다.
    // 입력(input) 이벤트 도중에 바로 상태를 바꾸면, 입력창 쪽(MessageInput)이 새 글자를 기억하기 전에
    // 화면이 다시 그려져서 입력창이 이전 값으로 되돌아가는 문제가 있었다 ("글자가 안 써짐").
    // requestAnimationFrame 으로 미루면 입력창이 새 글자를 먼저 기억한 뒤에 커서 위치를 읽는다.
    let frame = 0;
    const updateCaret = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        setCaret(el.selectionStart ?? 0);
        setDismissedAt((d) => (d !== null && !el.value.includes("@") ? null : d));
      });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const l = latest.current;
      if (!l.open || e.isComposing) return; // 한글 조합 중에는 건드리지 않음
      const n = l.suggestions.length;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : -1;
        setSelected({ key: l.key, index: (l.index + step + n) % n });
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation(); // MessageInput 의 Enter(전송)까지 가지 않게
        l.choose(l.suggestions[l.index].name);
      } else if (e.key === "Escape") {
        e.preventDefault();
        if (l.match) setDismissedAt(l.match.start);
      }
    };

    el.addEventListener("keydown", onKeyDown);
    el.addEventListener("keyup", updateCaret);
    el.addEventListener("input", updateCaret);
    el.addEventListener("click", updateCaret);
    el.addEventListener("focus", updateCaret);
    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("keydown", onKeyDown);
      el.removeEventListener("keyup", updateCaret);
      el.removeEventListener("input", updateCaret);
      el.removeEventListener("click", updateCaret);
      el.removeEventListener("focus", updateCaret);
    };
  }, [textareaRef]);

  const popup = open ? (
    <div className="relative">
      <ul
        role="listbox"
        aria-label="멘션할 사람"
        className="absolute bottom-full left-0 z-20 mb-2 max-h-60 w-64 overflow-y-auto rounded-md border border-gray-200 bg-white py-1 text-sm text-gray-900 shadow-lg"
      >
        {suggestions.map((m, i) => (
          <li
            key={m.id}
            role="option"
            aria-selected={i === index}
            // mousedown 에서 처리해야 입력창 포커스가 빠지지 않는다
            onMouseDown={(e) => {
              e.preventDefault();
              choose(m.name);
            }}
            onMouseEnter={() => setSelected({ key, index: i })}
            className={`cursor-pointer truncate px-3 py-2 ${i === index ? "bg-[#1e325c] text-white" : ""}`}
          >
            @{m.name}
          </li>
        ))}
      </ul>
    </div>
  ) : null;

  return { popup, isOpen: open };
}
