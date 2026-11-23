import assert from "node:assert/strict";
import test from "node:test";
import { createExaoneSummary, handleSummarize, MAX_BODY_BYTES } from "./handler.ts";

const channelId = "11111111-1111-4111-8111-111111111111";
// 실제 발급 키가 아닌 가짜 HTTP 테스트 전용 값이다.
const TEST_CREDENTIAL = "unit-test-only";
function request(body, options = {}) {
  return new Request("http://localhost/api/ai/summarize", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body), ...options,
  });
}

// 모든 계정·DB·요약 응답은 테스트용이다. 실제 외부 서비스는 호출하지 않는다.
function mockClient({ user = { id: "test-user" }, authError = null,
  membership = { channel_id: channelId }, memberError = null, rows = [{ content: "테스트 대화" }], dbError = null } = {}) {
  const calls = [];
  const client = {
    auth: { async getUser() { calls.push(["getUser"]); return { data: { user }, error: authError }; } },
    from(table) {
      calls.push(["from", table]);
      const query = {};
      for (const method of ["select", "eq", "is", "order", "limit", "abortSignal"]) {
        query[method] = (...args) => { calls.push([table, method, ...args]); return query; };
      }
      query.maybeSingle = async () => ({ data: membership, error: memberError });
      query.then = (resolve, reject) => Promise.resolve({ data: rows, error: dbError }).then(resolve, reject);
      return query;
    },
  };
  return { client, calls, createClient: async () => client };
}

async function expectError(response, status, code) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(body.error.code, code);
  assert.equal("summary" in body, false);
  return body;
}

test("텍스트 배열: 로그인 후 실제 요약 대신 미연결 503, 원문 미반환", async () => {
  const { createClient, calls } = mockClient();
  const body = await expectError(await handleSummarize(request({ messages: ["원문을 되돌려주지 마세요"] }), createClient), 503, "AI_NOT_CONNECTED");
  assert.doesNotMatch(JSON.stringify(body), /원문을 되돌려/);
  assert.deepEqual(calls, [["getUser"]]);
});

test("로그인 없거나 확인 실패 시 401", async (t) => {
  for (const options of [{ user: null }, { authError: { message: "internal auth detail" } }]) {
    await t.test(JSON.stringify(Object.keys(options)), async () => {
      const { createClient, calls } = mockClient(options);
      await expectError(await handleSummarize(request({ channelId }), createClient), 401, "UNAUTHORIZED");
      assert.deepEqual(calls, [["getUser"]]);
    });
  }
});

test("서버 연결 설정 실패는 비밀값을 노출하지 않는 503", async () => {
  const response = await handleSummarize(request({ channelId }), async () => { throw new Error("private configuration"); });
  const body = await expectError(response, 503, "SERVICE_NOT_CONFIGURED");
  assert.doesNotMatch(JSON.stringify(body), /private configuration/);
});

test("JSON 형식과 Content-Type 검사", async () => {
  const unavailable = async () => { throw new Error("must not be called"); };
  await expectError(await handleSummarize(request(null, { body: "{" }), unavailable), 400, "INVALID_JSON");
  await expectError(await handleSummarize(request({}, { headers: {} }), unavailable), 415, "JSON_REQUIRED");
});

test("메시지 배열·채널 ID·개수·혼합 입력 검증", async (t) => {
  const cases = [
    [null, "INVALID_INPUT"], [[], "INVALID_INPUT"], [{}, "INVALID_CHANNEL"],
    [{ channelId: "invalid" }, "INVALID_CHANNEL"],
    [{ messages: [] }, "INVALID_MESSAGES"], [{ messages: "문자열" }, "INVALID_MESSAGES"],
    [{ messages: [123] }, "INVALID_MESSAGES"], [{ messages: ["  "] }, "INVALID_MESSAGES"],
    [{ messages: Array(101).fill("대화") }, "INVALID_MESSAGES"],
    [{ channelId, messages: ["혼합"] }, "INVALID_INPUT"],
    [{ messages: ["대화"], limit: 10 }, "INVALID_INPUT"],
    [{ channelId, limit: 0 }, "INVALID_LIMIT"], [{ channelId, limit: 101 }, "INVALID_LIMIT"],
    [{ channelId, limit: 1.5 }, "INVALID_LIMIT"], [{ channelId, limit: "10" }, "INVALID_LIMIT"],
    [{ channelId, limit: null }, "INVALID_LIMIT"],
    [{ channelId, extra: true }, "INVALID_CHANNEL"],
  ];
  for (const [index, [body, code]] of cases.entries()) {
    await t.test(`입력 ${index + 1}`, async () => {
      let called = false;
      await expectError(await handleSummarize(request(body), async () => { called = true; }), 400, code);
      assert.equal(called, false);
    });
  }
});

test("메시지당·전체 문자 수 제한", async () => {
  const { createClient } = mockClient();
  for (const messages of [["가".repeat(4001)], Array(6).fill("가".repeat(4000))]) {
    await expectError(await handleSummarize(request({ messages }), createClient), 413, "INPUT_TOO_LARGE");
  }
});

test("헤더와 실제 본문 크기를 각각 제한", async () => {
  const { createClient } = mockClient();
  await expectError(await handleSummarize(request({ channelId }, {
    headers: { "Content-Type": "application/json", "Content-Length": String(MAX_BODY_BYTES + 1) },
  }), createClient), 413, "INPUT_TOO_LARGE");
  await expectError(await handleSummarize(request(null, { body: " ".repeat(MAX_BODY_BYTES + 1) }), createClient), 413, "INPUT_TOO_LARGE");
});

test("채널 비회원은 메시지 조회 전에 403", async () => {
  const { createClient, calls } = mockClient({ membership: null });
  await expectError(await handleSummarize(request({ channelId }), createClient), 403, "FORBIDDEN");
  assert.equal(calls.some((call) => call[0] === "from" && call[1] === "messages"), false);
  assert.ok(calls.some((call) => call[0] === "channel_members" && call[1] === "eq" && call[2] === "user_id" && call[3] === "test-user"));
});

test("권한 조회·메시지 조회 오류를 일반화", async () => {
  for (const options of [{ memberError: { message: "private DB detail" } }, { dbError: { message: "private DB detail" } }]) {
    const { createClient } = mockClient(options);
    const body = await expectError(await handleSummarize(request({ channelId }), createClient), 500, "DATABASE_ERROR");
    assert.doesNotMatch(JSON.stringify(body), /private DB detail/);
  }
});

test("빈 대화는 요약 함수를 부르지 않는 422", async () => {
  const { createClient } = mockClient({ rows: [{ content: "   " }] });
  let called = false;
  await expectError(await handleSummarize(request({ channelId }), createClient, async () => { called = true; return "가짜"; }), 422, "NO_MESSAGES");
  assert.equal(called, false);
});

test("채널 최근 원본 메시지 조회 후 시간순 배열을 요약 연결 경계로 전달", async () => {
  const { createClient, calls } = mockClient({ rows: [{ content: " 최신 " }, { content: "과거" }] });
  let received;
  const response = await handleSummarize(request({ channelId, limit: 10 }), createClient, async (messages) => {
    received = messages;
    return " 테스트용 요약이며 실제 AI 응답 아님 ";
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { summary: "테스트용 요약이며 실제 AI 응답 아님" });
  assert.deepEqual(received, ["과거", "최신"]);
  assert.ok(calls.some((call) => call[0] === "messages" && call[1] === "eq" && call[2] === "channel_id" && call[3] === channelId));
  assert.ok(calls.some((call) => call[0] === "messages" && call[1] === "is" && call[2] === "parent_id" && call[3] === null));
  assert.ok(calls.some((call) => call[0] === "messages" && call[1] === "is" && call[2] === "deleted_at" && call[3] === null));
  assert.ok(calls.some((call) => call[0] === "messages" && call[1] === "order" && call[2] === "id" && call[3].ascending === false));
  assert.ok(calls.some((call) => call[0] === "messages" && call[1] === "limit" && call[2] === 10));
});

test("채널 요청 기본 개수는 50, 독립 handler 기본값은 외부 호출 없는 미연결", async () => {
  const { createClient, calls } = mockClient();
  await expectError(await handleSummarize(request({ channelId }), createClient), 503, "AI_NOT_CONNECTED");
  assert.ok(calls.some((call) => call[0] === "messages" && call[1] === "limit" && call[2] === 50));
});

test("연결 함수 오류·잘못된 결과는 원문 없이 처리", async () => {
  const { createClient } = mockClient();
  const body = await expectError(await handleSummarize(request({ messages: ["테스트"] }), createClient, async () => { throw new Error("private provider detail"); }), 500, "INTERNAL_ERROR");
  assert.doesNotMatch(JSON.stringify(body), /private provider detail/);
  await expectError(await handleSummarize(request({ messages: ["테스트"] }), createClient, async () => " "), 502, "INVALID_AI_RESPONSE");
});

test("취소된 요청은 연결이나 DB 조회 전에 중단", async () => {
  const controller = new AbortController();
  controller.abort();
  let called = false;
  await expectError(await handleSummarize(request({ channelId }, { signal: controller.signal }), async () => { called = true; }), 408, "REQUEST_ABORTED");
  assert.equal(called, false);
});

test("EXAONE 연결을 주입해도 미로그인·비회원·빈 대화·DB 오류에는 외부 요청하지 않음", async () => {
  let calls = 0;
  const generate = createExaoneSummary({ apiKey: TEST_CREDENTIAL, fetcher: async () => {
    calls += 1;
    throw new Error("must not fetch");
  } });
  for (const [options, status, code] of [
    [{ user: null }, 401, "UNAUTHORIZED"],
    [{ membership: null }, 403, "FORBIDDEN"],
    [{ rows: [] }, 422, "NO_MESSAGES"],
    [{ dbError: {} }, 500, "DATABASE_ERROR"],
  ]) {
    await expectError(await handleSummarize(request({ channelId }), mockClient(options).createClient, generate), status, code);
  }
  assert.equal(calls, 0);
});

test("EXAONE 오류는 handler에서도 정제한 JSON·no-store로 전달", async () => {
  const generate = createExaoneSummary({ apiKey: TEST_CREDENTIAL, fetcher: async () => new Response("private provider detail", { status: 401 }) });
  const body = await expectError(await handleSummarize(request({ messages: ["합성 문장"] }), mockClient().createClient, generate), 502, "AI_AUTH_FAILED");
  assert.doesNotMatch(JSON.stringify(body), /unit-test-only|private provider detail/);
});
