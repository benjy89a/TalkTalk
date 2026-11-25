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

test("놓친 멘션: 다시 읽었을 때 새로 생긴 것만, 처음 로그인 때는 없음", async () => {
  const { findMissedMentions } = await import("./unreadRules.ts");
  const prev = { a: { lastReadId: 10, latestId: 12, mentionIds: [11] } };
  const next = {
    a: { lastReadId: 10, latestId: 15, mentionIds: [11, 13, 15] },
    b: { lastReadId: 0, latestId: 20, mentionIds: [20] }, // 새로 참여한 채널
  };
  assert.deepEqual(findMissedMentions(null, next, new Set()), []); // 처음 로그인
  assert.deepEqual(findMissedMentions(prev, next, new Set()), [
    { channelId: "b", messageId: 20 },
    { channelId: "a", messageId: 15 },
    { channelId: "a", messageId: 13 },
  ]);
  assert.deepEqual(findMissedMentions(prev, next, new Set([15, 20])), [{ channelId: "a", messageId: 13 }]); // 이미 알림 띄운 건 제외
  assert.equal(findMissedMentions(prev, next, new Set(), 1).length, 1); // 최대 개수
});

test("새로 생긴 채널 찾기 (놓친 초대)", async () => {
  const { findNewChannels } = await import("./unreadRules.ts");
  const s = { lastReadId: 0, latestId: 0, mentionIds: [] };
  assert.deepEqual(findNewChannels(null, { a: s }), []); // 처음 로그인
  assert.deepEqual(findNewChannels({ a: s }, { a: s, b: s }), ["b"]);
  assert.deepEqual(findNewChannels({ a: s, b: s }, { a: s }), []); // 나간 채널은 아님
});

test("스레드 댓글 멘션 배지: 추가·스레드 열면 지움·삭제", async () => {
  const { addThreadMention, clearThread, removeThreadMention, threadMentionCounts } = await import("./unreadRules.ts");
  let list = [];
  list = addThreadMention(list, { id: 101, channelId: "a", parentId: 1 });
  list = addThreadMention(list, { id: 102, channelId: "a", parentId: 2 });
  list = addThreadMention(list, { id: 103, channelId: "b", parentId: 5 });
  list = addThreadMention(list, { id: 101, channelId: "a", parentId: 1 }); // 같은 댓글은 한 번만
  assert.deepEqual(threadMentionCounts(list), { a: 2, b: 1 });

  list = clearThread(list, "a", 1); // 스레드 1 을 열면 그 스레드 멘션만 사라짐
  assert.deepEqual(threadMentionCounts(list), { a: 1, b: 1 });
  assert.equal(clearThread(list, "a", 99), list); // 상관없는 스레드는 그대로

  list = removeThreadMention(list, 103); // 댓글 삭제
  assert.deepEqual(threadMentionCounts(list), { a: 1 });
});
