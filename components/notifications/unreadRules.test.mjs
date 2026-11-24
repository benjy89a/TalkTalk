// 미읽음·멘션 계산 규칙 테스트. Node 24의 TypeScript 지원으로 실행한다 (DB·계정 필요 없음).
// 실행: node --test components/notifications/unreadRules.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { applyInsert, applyRead, applyUpdate, isUnreadState } from "./unreadRules.ts";

const base = { lastReadId: 10, latestId: 10, mentionIds: [] };
const msg = (id, extra = {}) => ({ id, user_id: "other", parent_id: null, deleted_at: null, ...extra });

test("새 메시지: 다른 사람 글이면 미읽음, 멘션이면 +1", () => {
  const s = applyInsert(base, msg(11), false, true);
  assert.equal(isUnreadState(s), true);
  assert.deepEqual(s.mentionIds, [11]);
});

test("새 메시지: 내 글이면 읽은 것으로", () => {
  const s = applyInsert({ ...base, latestId: 11, mentionIds: [11] }, msg(12, { user_id: "me" }), true, false);
  assert.equal(isUnreadState(s), false);
  assert.deepEqual(s.mentionIds, []);
});

test("수정: 안 읽은 메시지에 @내이름 추가 → +1, 빼면 -1", () => {
  const unread = { ...base, latestId: 12 };
  const added = applyUpdate(unread, msg(12), false, true).next;
  assert.deepEqual(added.mentionIds, [12]);
  const removed = applyUpdate(added, msg(12), false, false).next;
  assert.deepEqual(removed.mentionIds, []);
  assert.equal(isUnreadState(removed), true); // 굵게는 그대로
});

test("수정: 이미 읽은 메시지·내 메시지는 건드리지 않음", () => {
  assert.equal(applyUpdate(base, msg(9), false, true).next, base);
  const unread = { ...base, latestId: 12 };
  assert.equal(applyUpdate(unread, msg(12, { user_id: "me" }), true, true).next, unread);
});

test("삭제: 멘션에서 빠지고, 가장 최근 메시지면 다시 확인 필요", () => {
  const s = { lastReadId: 10, latestId: 12, mentionIds: [11, 12] };
  const r = applyUpdate(s, msg(12, { deleted_at: "2026-11-24T00:00:00Z" }), false, false);
  assert.deepEqual(r.next.mentionIds, [11]);
  assert.equal(r.needLatest, true);
  const older = applyUpdate(s, msg(11, { deleted_at: "2026-11-24T00:00:00Z" }), false, false);
  assert.deepEqual(older.next.mentionIds, [12]);
  assert.equal(older.needLatest, false);
});

test("스레드 답글은 무시", () => {
  assert.equal(applyUpdate(base, msg(20, { parent_id: 5 }), false, true).next, base);
  assert.equal(applyInsert(base, msg(20, { parent_id: 5 }), false, true), base);
});

test("읽음 처리: 그 앞의 멘션은 사라짐", () => {
  const s = applyRead({ lastReadId: 10, latestId: 15, mentionIds: [12, 15] }, 12);
  assert.deepEqual(s.mentionIds, [15]);
  assert.equal(applyRead(s, 11), s); // 뒤로 가지 않음
});
