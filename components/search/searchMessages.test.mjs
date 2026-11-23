import assert from "node:assert/strict";
import test from "node:test";
import {
  MessageSearchError,
  SEARCH_KEYWORD_MAX_LENGTH,
  SEARCH_RESULT_LIMIT,
  searchMessages,
} from "./searchMessages.ts";

// Node 24의 TypeScript 지원으로 실행한다. 실제 DB·계정·API 키를 사용하지 않는다.
function mockClient({ user = { id: "test-user" }, authError = null, rows = [], queryError = null } = {}) {
  const calls = [];
  const query = {
    select(...args) { calls.push(["select", ...args]); return query; },
    ilike(...args) { calls.push(["ilike", ...args]); return query; },
    order(...args) { calls.push(["order", ...args]); return query; },
    limit(...args) { calls.push(["limit", ...args]); return query; },
    abortSignal(...args) { calls.push(["abortSignal", ...args]); return query; },
    then(resolve, reject) { return Promise.resolve({ data: rows, error: queryError }).then(resolve, reject); },
  };
  const client = {
    auth: {
      async getUser() {
        calls.push(["getUser"]);
        return { data: { user }, error: authError };
      },
    },
    from(...args) { calls.push(["from", ...args]); return query; },
  };
  return { client, calls };
}

test("공백 검색어는 로그인 확인이나 DB 조회를 하지 않는다", async () => {
  const { client, calls } = mockClient();
  assert.deepEqual(await searchMessages(client, "   "), { results: [], hasMore: false });
  assert.deepEqual(calls, []);
});

test("검색어 길이를 제한하고 초과 입력은 조회하지 않는다", async () => {
  const { client, calls } = mockClient();
  await assert.rejects(searchMessages(client, "가".repeat(SEARCH_KEYWORD_MAX_LENGTH + 1)), MessageSearchError);
  assert.deepEqual(calls, []);
});

test("비로그인 사용자는 메시지를 조회하지 않는다", async () => {
  const { client, calls } = mockClient({ user: null });
  await assert.rejects(searchMessages(client, "배포"), /로그인/);
  assert.deepEqual(calls, [["getUser"]]);
});

test("로그인 확인 오류가 있으면 메시지를 조회하지 않는다", async () => {
  const { client, calls } = mockClient({ authError: { message: "auth failed" } });
  await assert.rejects(searchMessages(client, "배포"), MessageSearchError);
  assert.deepEqual(calls, [["getUser"]]);
});

test("입력을 다듬어 content ilike와 최신순 정렬을 요청한다", async () => {
  const row = { id: 7, channel_id: "allowed-channel", content: "배포 완료", parent_id: null };
  const { client, calls } = mockClient({ rows: [row] });
  assert.deepEqual(await searchMessages(client, "  배포  "), { results: [row], hasMore: false });
  assert.equal(calls[0][0], "getUser");
  assert.deepEqual(calls.find(([name]) => name === "from"), ["from", "messages"]);
  assert.deepEqual(calls.find(([name]) => name === "ilike"), ["ilike", "content", "%배포%"]);
  assert.deepEqual(calls.filter(([name]) => name === "order"), [
    ["order", "created_at", { ascending: false }],
    ["order", "id", { ascending: false }],
  ]);
  assert.deepEqual(calls.find(([name]) => name === "limit"), ["limit", SEARCH_RESULT_LIMIT + 1]);
});

test("%, _, 역슬래시를 문자 검색용으로 이스케이프한다", async () => {
  const { client, calls } = mockClient();
  await searchMessages(client, "50%_\\완료");
  assert.deepEqual(calls.find(([name]) => name === "ilike"), ["ilike", "content", "%50\\%\\_\\\\완료%"]);
});

test("빈 응답은 결과 없음으로 반환한다", async () => {
  const { client } = mockClient({ rows: null });
  assert.deepEqual(await searchMessages(client, "없음"), { results: [], hasMore: false });
});

test("최대 50건만 반환하고 나머지가 있음을 알린다", async () => {
  const rows = Array.from({ length: SEARCH_RESULT_LIMIT + 1 }, (_, index) => ({ id: index + 1 }));
  const { client } = mockClient({ rows });
  const response = await searchMessages(client, "배포");
  assert.equal(response.results.length, SEARCH_RESULT_LIMIT);
  assert.equal(response.hasMore, true);
  assert.deepEqual(response.results, rows.slice(0, SEARCH_RESULT_LIMIT));
});

test("스레드 답글도 검색 결과에 포함한다", async () => {
  const reply = { id: 8, channel_id: "allowed-channel", content: "답글 배포", parent_id: 7 };
  const { client } = mockClient({ rows: [reply] });
  assert.deepEqual((await searchMessages(client, "배포")).results, [reply]);
});

test("DB 오류의 내부 내용을 사용자용 오류에 노출하지 않는다", async () => {
  const { client } = mockClient({ queryError: { message: "internal sensitive diagnostic" } });
  await assert.rejects(searchMessages(client, "배포"), (error) => {
    assert.ok(error instanceof MessageSearchError);
    assert.doesNotMatch(error.message, /internal sensitive diagnostic/);
    return true;
  });
});

test("취소 신호를 DB 요청에 전달한다", async () => {
  const { client, calls } = mockClient();
  const controller = new AbortController();
  await searchMessages(client, "배포", controller.signal);
  assert.deepEqual(calls.find(([name]) => name === "abortSignal"), ["abortSignal", controller.signal]);
});

test("이미 취소된 검색은 로그인 확인이나 DB 조회를 하지 않는다", async () => {
  const { client, calls } = mockClient();
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(searchMessages(client, "배포", controller.signal), { name: "AbortError" });
  assert.deepEqual(calls, []);
});
