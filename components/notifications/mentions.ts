// @멘션 글자 처리 도우미 (D-3)
//
// 멘션은 별도 테이블 없이 메시지 본문의 "@이름" 글자로 판단한다.
// - "@수정님 확인 부탁해요" 처럼 이름 뒤에 글자가 붙어도 멘션으로 본다 (한국어 호칭 때문)
// - 영문 대소문자는 구분하지 않는다
// - 이름이 다른 이름의 앞부분이면("문수정Test" / "문수정Test2") **가장 길게 맞는 이름**의 사람만 멘션
// - "@all" 은 채널 멤버 전원 멘션 (뒤에 영문·숫자가 이어지면 아님: "@allen")
// - 이메일처럼 "@" 앞에 글자가 붙어 있으면 멘션이 아님 (a@b.com) — 말풍선 강조(B formatText)와 같은 규칙

/** 전체 멘션 단어 */
export const ALL_MENTION = "all";

export type MentionCheck = {
  me: boolean; // "@내이름" 으로 나를 불렀는지
  all: boolean; // "@all" 로 전체를 불렀는지
};

const BEFORE_AT_BLOCK = /[\p{L}\p{N}_.@]/u; // "@" 바로 앞에 이 글자가 있으면 멘션 아님
const AFTER_ALL_BLOCK = /^[a-z0-9_]/i; // "@all" 바로 뒤에 이 글자가 이어지면 전체 멘션 아님

/**
 * 본문이 나를 멘션했는지 / 전체 멘션인지.
 * knownNames: 가입한 사람들의 이름 목록 (가장 길게 맞는 이름을 고르기 위해). 내 이름은 없어도 자동으로 포함.
 */
export function checkMention(content: string, myName: string, knownNames: readonly string[] = []): MentionCheck {
  const result: MentionCheck = { me: false, all: false };
  const me = myName.trim().toLowerCase();
  const names = [...new Set([...knownNames, myName].map((n) => n.trim().toLowerCase()).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
  const lower = content.toLowerCase();

  for (let i = lower.indexOf("@"); i !== -1; i = lower.indexOf("@", i + 1)) {
    if (i > 0 && BEFORE_AT_BLOCK.test(lower[i - 1])) continue;
    const rest = lower.slice(i + 1);

    // "@all" 인지 (뒤에 영문·숫자가 이어지면 아님)
    const isAll = rest.startsWith(ALL_MENTION) && !AFTER_ALL_BLOCK.test(rest.slice(ALL_MENTION.length));
    // 가장 길게 맞는 사람 이름 (예: "@문수정test2" → "문수정test2", "@문수정test님" → "문수정test")
    const longest = names.find((n) => rest.startsWith(n));

    // "@all" 보다 더 길게 맞는 이름(예: "allen")이 있을 때만 사람 이름으로 본다.
    // 이름이 "a"·"al"·"all" 처럼 "all" 의 앞부분이어도 "@all" 은 전체 멘션
    if (isAll && (!longest || longest.length <= ALL_MENTION.length)) {
      result.all = true;
    } else if (longest === me) {
      result.me = true;
    }
  }
  return result;
}

/** 나를 불렀거나 전체 멘션이면 true */
export function isMentioned(content: string, myName: string, knownNames: readonly string[] = []): boolean {
  if (!myName.trim()) return false;
  const c = checkMention(content, myName, knownNames);
  return c.me || c.all;
}

/** DB 검색(ilike)용: % _ \ 를 글자 그대로 찾도록 바꾼다 */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, "\\$&");
}

/**
 * 커서 바로 앞이 "@글자" 를 치는 중이면 그 위치와 글자를 돌려준다. 아니면 null.
 * 예) "안녕 @수|" → { start: 3, query: "수" }
 * - @ 앞이 글자이면(예: 이메일 a@b) 멘션으로 보지 않는다
 * - @ 뒤에 띄어쓰기가 나오면 멘션 입력이 끝난 것으로 본다
 */
export function findMentionQuery(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(before[at - 1])) return null;
  const query = before.slice(at + 1);
  if (/\s/.test(query) || query.length > 30) return null;
  return { start: at, query };
}

/** "@글자" 부분을 "@이름 " 으로 바꾼 새 글과 커서 위치 */
export function insertMention(
  text: string,
  start: number,
  caret: number,
  name: string,
): { text: string; caret: number } {
  const insert = `@${name} `;
  return {
    text: text.slice(0, start) + insert + text.slice(caret),
    caret: start + insert.length,
  };
}
