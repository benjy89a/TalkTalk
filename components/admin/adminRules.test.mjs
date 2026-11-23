// 관리자 페이지 규칙 테스트. Node 24의 TypeScript 지원으로 실행한다 (DB·계정 필요 없음).
// 실행: node --test components/admin/adminRules.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { filterUsers, formatDate, friendlyError, validateChannelName } from "./adminRules.ts";

test("채널 이름 검사", () => {
  assert.equal(validateChannelName("공지사항"), null);
  assert.match(validateChannelName("   "), /입력/);
  assert.match(validateChannelName("가".repeat(31)), /30자/);
  assert.match(validateChannelName(" General "), /기본 채널/);
});

test("사용자 검색: 이름·이메일, 대소문자 무시", () => {
  const users = [
    { name: "문수정", email: "sujeong@company.com" },
    { name: "Admin", email: "admin@talktalk.com" },
  ];
  assert.equal(filterUsers(users, "").length, 2);
  assert.deepEqual(filterUsers(users, "수정").map((u) => u.name), ["문수정"]);
  assert.deepEqual(filterUsers(users, " ADMIN ").map((u) => u.name), ["Admin"]);
  assert.equal(filterUsers(users, "없는사람").length, 0);
});

test("날짜 표시", () => {
  assert.match(formatDate("2026-11-23T03:00:00Z"), /2026/);
  assert.equal(formatDate("잘못된 날짜"), "-");
});

test("오류 문장: 이름 중복만 따로 안내", () => {
  assert.equal(friendlyError({ code: "23505" }, "기본"), "이미 있는 채널 이름이에요.");
  assert.equal(friendlyError({ code: "42501" }, "기본"), "기본");
  assert.equal(friendlyError(null, "기본"), "기본");
});
