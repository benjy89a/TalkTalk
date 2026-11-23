// [B] 메시지 텍스트 강조 (패키지 없이 직접 해석)
//
//   **굵게**            → 굵게
//   *기울임* / _기울임_  → 기울임
//   ***굵고 기울임***    → 굵고 기울임
//   ~~취소선~~          → 취소선
//   {빨강:글자}         → 색 글자 (빨강·파랑·초록·주황·보라 / red·blue·green·orange·purple)
//   `코드`              → 코드 모양
//   https://...         → 자동 링크 (새 탭)
//
// HTML 을 문자열로 넣지 않고 React 요소로만 만든다 → 메시지에 <script> 같은 글을 써도 그대로 글자로 보인다.
import type { ReactNode } from "react";

type Rule = { name: string; re: RegExp };

// 먼저 나온 것부터 적용, 같은 위치면 위에 있는 규칙이 우선
const RULES: Rule[] = [
  { name: "code", re: /`([^`\n]+)`/ },
  { name: "boldItalic", re: /\*\*\*([^*\n]+?)\*\*\*/ },
  { name: "bold", re: /\*\*([^*\n]+?)\*\*/ },
  { name: "strike", re: /~~([^~\n]+?)~~/ },
  { name: "italic", re: /\*([^*\s][^*\n]*?)\*/ },
  // 밑줄 기울임은 단어 중간(예: snake_case)에서는 적용하지 않는다
  { name: "italic", re: /(?<![\p{L}\p{N}_])_([^_\n]+?)_(?![\p{L}\p{N}_])/u },
  { name: "color", re: /\{(빨강|파랑|초록|주황|보라|red|blue|green|orange|purple):([^}\n]+)\}/ },
  { name: "url", re: /https?:\/\/[^\s<>()]*[^\s<>().,!?'"]/ },
];

const COLOR_KEY: Record<string, string> = {
  빨강: "red", 파랑: "blue", 초록: "green", 주황: "orange", 보라: "purple",
  red: "red", blue: "blue", green: "green", orange: "orange", purple: "purple",
};

// 내 말풍선(남색 배경)에서는 밝은 색, 상대 말풍선(회색 배경)에서는 진한 색 → 둘 다 잘 읽히게
const COLOR_CLASS: Record<string, { mine: string; other: string }> = {
  red: { mine: "text-red-300", other: "text-red-600" },
  blue: { mine: "text-sky-300", other: "text-blue-700" },
  green: { mine: "text-green-300", other: "text-green-700" },
  orange: { mine: "text-orange-300", other: "text-orange-600" },
  purple: { mine: "text-purple-300", other: "text-purple-700" },
};

const MAX_DEPTH = 4; // 서식 안의 서식은 4단계까지만

export function formatText(text: string, mine: boolean, depth = 0, keyPrefix = "f"): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let n = 0;

  while (rest.length > 0) {
    // 가장 먼저 나오는 서식 찾기
    let best: { rule: Rule; m: RegExpExecArray } | null = null;
    if (depth < MAX_DEPTH) {
      for (const rule of RULES) {
        const m = rule.re.exec(rest);
        if (m && (!best || m.index < best.m.index)) best = { rule, m };
      }
    }
    if (!best) {
      out.push(rest);
      break;
    }

    const { rule, m } = best;
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const key = `${keyPrefix}-${depth}-${n++}`;
    const inner = (s: string) => formatText(s, mine, depth + 1, key);

    switch (rule.name) {
      case "code":
        out.push(
          <code key={key} className={`rounded px-1 font-mono text-[0.9em] ${mine ? "bg-white/15" : "bg-black/5"}`}>
            {m[1]}
          </code>,
        );
        break;
      case "boldItalic":
        out.push(<strong key={key} className="font-bold italic">{inner(m[1])}</strong>);
        break;
      case "bold":
        out.push(<strong key={key} className="font-bold">{inner(m[1])}</strong>);
        break;
      case "italic":
        out.push(<em key={key} className="italic">{inner(m[1])}</em>);
        break;
      case "strike":
        out.push(<s key={key} className="line-through">{inner(m[1])}</s>);
        break;
      case "color": {
        const c = COLOR_CLASS[COLOR_KEY[m[1]]];
        out.push(<span key={key} className={`font-medium ${mine ? c.mine : c.other}`}>{inner(m[2])}</span>);
        break;
      }
      case "url":
        out.push(
          <a
            key={key}
            href={m[0]}
            target="_blank"
            rel="noopener noreferrer"
            className={`break-all underline underline-offset-2 ${mine ? "text-white" : "text-blue-700"}`}
          >
            {m[0]}
          </a>,
        );
        break;
    }
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

// 입력창 단축키: 선택한 글자를 기호로 감싸기 (Cmd/Ctrl+B 굵게, +I 기울임, +Shift+X 취소선)
export function wrapSelection(
  text: string,
  start: number,
  end: number,
  mark: string,
): { text: string; start: number; end: number } {
  const selected = text.slice(start, end);
  // 이미 감싸져 있으면 풀기
  if (text.slice(start - mark.length, start) === mark && text.slice(end, end + mark.length) === mark) {
    return {
      text: text.slice(0, start - mark.length) + selected + text.slice(end + mark.length),
      start: start - mark.length,
      end: end - mark.length,
    };
  }
  return {
    text: text.slice(0, start) + mark + selected + mark + text.slice(end),
    start: start + mark.length,
    end: end + mark.length,
  };
}
