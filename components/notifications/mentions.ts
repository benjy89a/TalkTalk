// @멘션 글자 처리 도우미 (D-3)
//
// 멘션은 별도 테이블 없이 메시지 본문의 "@이름" 글자로 판단한다.
// - "@수정님 확인 부탁해요" 처럼 이름 뒤에 글자가 붙어도 멘션으로 본다 (한국어 호칭 때문)
// - 영문 대소문자는 구분하지 않는다

/** 본문에 "@이름" 이 들어 있으면 true */
export function mentionsName(content: string, name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return false;
  return content.toLowerCase().includes(`@${n}`);
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
