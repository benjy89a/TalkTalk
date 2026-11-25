// @멘션 글자 처리 테스트. Node 24의 TypeScript 지원으로 실행한다 (DB·계정 필요 없음).
// 실행: node --test components/notifications/mentions.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { checkMention, escapeLike, findMentionQuery, insertMention, isMentioned } from "./mentions.ts";

test("본문에 @이름 이 있으면 멘션", () => {
  assert.equal(isMentioned("@문수정님 확인 부탁해요", "문수정"), true); // 호칭이 붙어도 멘션
  assert.equal(isMentioned("hi @Alice", "alice"), true); // 대소문자 무시
  assert.equal(isMentioned("문수정 확인", "문수정"), false); // @ 없으면 아님
  assert.equal(isMentioned("@ 누구", "  "), false); // 빈 이름은 아님
  assert.equal(isMentioned("메일은 a@문수정.com", "문수정"), false); // @ 앞에 글자가 붙으면 아님
});

test("이름 앞부분이 겹치면 가장 길게 맞는 사람만", () => {
  const names = ["문수정Test", "문수정Test2", "계섭"];
  // "@문수정Test2" → Test2 만
  assert.deepEqual(checkMention("@문수정Test2 확인", "문수정Test", names), { me: false, all: false });
  assert.deepEqual(checkMention("@문수정Test2 확인", "문수정Test2", names), { me: true, all: false });
  // "@문수정Test님" → Test (호칭 허용 유지)
  assert.equal(isMentioned("@문수정Test님 확인", "문수정Test", names), true);
  assert.equal(isMentioned("@문수정Test님 확인", "문수정Test2", names), false);
  // 이름 목록을 못 불러온 경우에도 내 이름은 찾음
  assert.equal(isMentioned("@문수정Test 확인", "문수정Test"), true);
  // 한 메시지에 여러 명
  assert.equal(isMentioned("@계섭 @문수정Test 둘 다 봐 주세요", "문수정Test", names), true);
});

test("@all 은 전체 멘션", () => {
  const names = ["문수정Test", "allen"];
  assert.deepEqual(checkMention("@all 회의 10분 전", "문수정Test", names), { me: false, all: true });
  assert.equal(isMentioned("@ALL 공지", "문수정Test", names), true); // 대소문자 무시
  assert.equal(isMentioned("@all님 확인", "문수정Test", names), true); // 한국어 호칭은 허용
  assert.equal(isMentioned("@allen 확인", "문수정Test", names), false); // allen 은 다른 사람
  assert.equal(isMentioned("@alldone", "문수정Test", []), false); // 영문이 이어지면 아님
  assert.equal(isMentioned("x@all.com", "문수정Test", names), false); // 이메일 아님
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

test("@all 은 'all' 의 앞부분 이름이 있어도 전체 멘션", () => {
  // "a" "al" "all" 이라는 이름의 사람이 있어도 "@all" 은 전체 멘션
  assert.deepEqual(checkMention("@all 공지", "문수정Test", ["a", "al", "all", "문수정Test"]), { me: false, all: true });
  // 그 사람 본인에게도 전체 멘션으로 (me 가 아니라 all)
  assert.deepEqual(checkMention("@all 공지", "al", ["a", "al", "문수정Test"]), { me: false, all: true });
  // "allen" 처럼 더 길게 맞는 이름은 그 사람
  assert.deepEqual(checkMention("@allen 확인", "allen", ["allen"]), { me: true, all: false });
  // "@a 확인" 은 여전히 a 라는 사람
  assert.deepEqual(checkMention("@a 확인", "a", ["a", "al"]), { me: true, all: false });
});
