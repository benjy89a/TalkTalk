import assert from "node:assert/strict";
import test from "node:test";
import { resolveDueDate } from "./extra.ts";

// 기준: 2026-11-24(화) 오전 10시 서울 = 2026-11-24T01:00:00Z
const TUE = "2026-11-24T01:00:00.000Z";

test("연도가 있는 날짜는 그대로 쓰고, 존재하지 않는 날짜는 null", () => {
  assert.equal(resolveDueDate("2026-11-25", TUE), "2026-11-25");
  assert.equal(resolveDueDate("2026.12.01까지", TUE), "2026-12-01");
  assert.equal(resolveDueDate("2026년 11월 30일", TUE), "2026-11-30");
  assert.equal(resolveDueDate("2026-02-30", TUE), null);
  assert.equal(resolveDueDate("2026-13-01", TUE), null);
});

test("오늘·내일·모레·글피", () => {
  assert.equal(resolveDueDate("오늘 중으로", TUE), "2026-11-24");
  assert.equal(resolveDueDate("내일 오후 3시까지", TUE), "2026-11-25");
  assert.equal(resolveDueDate("모레까지", TUE), "2026-11-26");
  assert.equal(resolveDueDate("내일모레", TUE), "2026-11-26");
  assert.equal(resolveDueDate("글피", TUE), "2026-11-27");
});

test("요일만 있으면 앞으로 오는 가장 가까운 그 요일, 같은 요일은 모호해서 null", () => {
  assert.equal(resolveDueDate("금요일까지", TUE), "2026-11-27");
  assert.equal(resolveDueDate("수요일 오전 10시까지", TUE), "2026-11-25");
  assert.equal(resolveDueDate("월요일 오전까지", TUE), "2026-11-30");
  assert.equal(resolveDueDate("화요일", TUE), null);
});

test("이번 주·다음 주·다다음 주 X요일은 월요일 시작 주 기준", () => {
  assert.equal(resolveDueDate("이번 주 금요일", TUE), "2026-11-27");
  assert.equal(resolveDueDate("다음 주 수요일", TUE), "2026-12-02");
  assert.equal(resolveDueDate("다음주 목요일 오후 2시", TUE), "2026-12-03");
  assert.equal(resolveDueDate("다다음 주 월요일", TUE), "2026-12-07");
  assert.equal(resolveDueDate("이번 주 월요일", TUE), "2026-11-23"); // 이미 지난 날짜여도 문자 그대로
  // 일요일 작성: 월요일 시작 주이므로 "이번 주 금요일"은 그 주의 금요일(11-27)
  assert.equal(resolveDueDate("이번 주 금요일", "2026-11-29T03:00:00.000Z"), "2026-11-27");
});

test("N일·N주 후", () => {
  assert.equal(resolveDueDate("3일 후", TUE), "2026-11-27");
  assert.equal(resolveDueDate("2주 뒤", TUE), "2026-12-08");
});

test("N월 N일은 올해 기준이고 지난 날짜는 모호해서 null, 다음 달 N일", () => {
  assert.equal(resolveDueDate("12월 5일까지", TUE), "2026-12-05");
  assert.equal(resolveDueDate("11월 24일", TUE), "2026-11-24");
  assert.equal(resolveDueDate("11월 3일", TUE), null);
  assert.equal(resolveDueDate("다음 달 5일", TUE), "2026-12-05");
  assert.equal(resolveDueDate("이번 달 30일", TUE), "2026-11-30");
  assert.equal(resolveDueDate("다음 달 31일", TUE), "2026-12-31");
  assert.equal(resolveDueDate("이번 달 31일", TUE), null); // 11월은 30일까지
});

test("연말 경계: 12월에 다음 달 N일은 다음 해 1월", () => {
  assert.equal(resolveDueDate("다음 달 10일", "2026-12-20T01:00:00.000Z"), "2027-01-10");
});

test("기준일은 서울 시간: UTC로는 전날 늦은 밤이어도 서울 날짜로 계산", () => {
  // 2026-11-24T16:00:00Z = 서울 2026-11-25(수) 01:00
  assert.equal(resolveDueDate("내일", "2026-11-24T16:00:00.000Z"), "2026-11-26");
  assert.equal(resolveDueDate("금요일", "2026-11-24T16:00:00.000Z"), "2026-11-27");
});

test("날짜를 정할 수 없는 표현·빈 값·잘못된 기준은 null", () => {
  for (const text of ["조만간", "이번 주 안에", "월말", "ASAP", "", "   "]) {
    assert.equal(resolveDueDate(text, TUE), null, text);
  }
  assert.equal(resolveDueDate("내일", "invalid"), null);
  assert.equal(resolveDueDate("가".repeat(101), TUE), null);
});
