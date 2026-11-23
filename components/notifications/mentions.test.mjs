// @멘션 글자 처리 테스트. Node 24의 TypeScript 지원으로 실행한다 (DB·계정 필요 없음).
// 실행: node --test components/notifications/mentions.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { escapeLike, findMentionQuery, insertMention, mentionsName } from "./mentions.ts";

test("본문에 @이름 이 있으면 멘션", () => {
  assert.equal(mentionsName("@문수정님 확인 부탁해요", "문수정"), true); // 호칭이 붙어도 멘션
  assert.equal(mentionsName("hi @Alice", "alice"), true); // 대소문자 무시
  assert.equal(mentionsName("문수정 확인", "문수정"), false); // @ 없으면 아님
  assert.equal(mentionsName("@ 누구", "  "), false); // 빈 이름은 아님
});

test("커서 앞의 @글자 찾기", () => {
  assert.deepEqual(findMentionQuery("안녕 @수", 6), { start: 3, query: "수" });
  assert.deepEqual(findMentionQuery("@", 1), { start: 0, query: "" });
  assert.equal(findMentionQuery("a@b.com", 3), null); // 이메일은 아님
  assert.equal(findMentionQuery("@수정 ", 4), null); // 띄어쓰기 뒤면 입력 끝
  assert.equal(findMentionQuery("안녕", 2), null);
});

test("@글자 를 @이름 으로 바꾸기", () => {
  assert.deepEqual(insertMention("안녕 @수 뒤", 3, 5, "문수정"), {
    text: "안녕 @문수정  뒤",
    caret: 8,
  });
});

test("DB 검색용 특수문자 처리", () => {
  assert.equal(escapeLike("50%_a\\"), "50\\%\\_a\\\\");
});
