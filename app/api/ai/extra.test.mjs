import assert from "node:assert/strict";
import test from "node:test";
import { createExaoneExtra, handleNaturalSearch, handleExtractTasks, EXTRA_MAX_BODY_BYTES } from "./extra.ts";

const channelId = "11111111-1111-4111-8111-111111111111";
const handlers = [
  ["자연어 검색", handleNaturalSearch, { query: "지난주 배포 얘기" }],
  ["할 일 추출", handleExtractTasks, { channelId }],
];
const plan = { keywords: ["배포"], from: null, to: null };
const source = [
  { id: 11, content: "검토 의견", created_at: "2026-11-23T02:00:00Z", parent_id: 10 },
  { id: 10, content: "재문: 배포 점검을 2026-11-30까지 진행", created_at: "2026-11-23T01:00:00Z", parent_id: null },
];
const task = { content: "배포 점검", assignee: "재문", dueDate: "2026-11-30", messageIds: [10] };
const TEST_CREDENTIAL = "unit-test-only";

function request(body, options = {}) {
  return new Request("http://localhost/api/ai/test", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), ...options,
  });
}

// 모든 계정·DB·AI 해석/추출 결과는 테스트용이다. 실제 외부 API를 호출하지 않는다.
function mockClient({ user = { id: "test-user" }, authError = null, member = { channel_id: channelId },
  memberError = null, rows = source, dbError = null } = {}) {
  const calls = [];
  const client = {
    auth: { async getUser() { calls.push(["getUser"]); return { data: { user }, error: authError }; } },
    from(table) {
      calls.push(["from", table]);
      const query = {};
      for (const method of ["select", "eq", "is", "order", "limit", "abortSignal", "ilike", "gte", "lt"]) {
        query[method] = (...args) => { calls.push([table, method, ...args]); return query; };
      }
      query.maybeSingle = async () => ({ data: member, error: memberError });
      query.then = (resolve, reject) => Promise.resolve({ data: rows, error: dbError }).then(resolve, reject);
      return query;
    },
  };
  return { calls, createClient: async () => client };
}

async function expectError(response, status, code) {
  assert.equal(response.status, status);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const body = await response.json();
  assert.equal(body.error.code, code);
  assert.equal("tasks" in body || "messages" in body, false);
  return body;
}

for (const [label, handle, input] of handlers) {
  test(`${label}: 기본 연결은 가짜 성공 대신 503`, async () => {
    const { createClient } = mockClient();
    await expectError(await handle(request(input), createClient), 503, "AI_NOT_CONNECTED");
  });

  test(`${label}: 비로그인·인증 오류는 조회·AI 호출 전 401`, async () => {
    for (const options of [{ user: null }, { authError: { message: "private auth" } }]) {
      const { createClient, calls } = mockClient(options);
      let called = false;
      await expectError(await handle(request(input), createClient, async () => { called = true; }), 401, "UNAUTHORIZED");
      assert.equal(called, false);
      assert.deepEqual(calls, [["getUser"]]);
    }
  });

  test(`${label}: 설정 실패는 내부 정보 없는 503`, async () => {
    const body = await expectError(await handle(request(input), async () => { throw new Error("private configuration"); }), 503, "SERVICE_NOT_CONFIGURED");
    assert.doesNotMatch(JSON.stringify(body), /private configuration/);
  });

  test(`${label}: 잘못된 JSON·Content-Type·객체 입력 거절`, async () => {
    const { createClient } = mockClient();
    await expectError(await handle(request(null, { body: "{" }), createClient), 400, "INVALID_JSON");
    await expectError(await handle(request(input, { headers: { "Content-Type": "text/plain" } }), createClient), 415, "JSON_REQUIRED");
    await expectError(await handle(request([]), createClient), 400, "INVALID_INPUT");
  });

  test(`${label}: 헤더와 실제 본문 크기 제한`, async () => {
    const { createClient } = mockClient();
    await expectError(await handle(request(input, {
      headers: { "Content-Type": "application/json", "Content-Length": String(EXTRA_MAX_BODY_BYTES + 1) },
    }), createClient), 413, "INPUT_TOO_LARGE");
    await expectError(await handle(request(null, { body: " ".repeat(EXTRA_MAX_BODY_BYTES + 1) }), createClient), 413, "INPUT_TOO_LARGE");
  });

  test(`${label}: 채널 비회원은 AI·메시지 조회 전 거절`, async () => {
    const { createClient, calls } = mockClient({ member: null });
    let called = false;
    await expectError(await handle(request({ ...input, channelId }), createClient, async () => { called = true; }), 403, "FORBIDDEN");
    assert.equal(called, false);
    assert.equal(calls.some((call) => call[0] === "from" && call[1] === "messages"), false);
    assert.ok(calls.some((call) => call[0] === "channel_members" && call[1] === "eq" && call[2] === "user_id" && call[3] === "test-user"));
  });

  test(`${label}: 멤버 조회 내부 오류를 일반화`, async () => {
    const { createClient } = mockClient({ memberError: { message: "private DB detail" } });
    const body = await expectError(await handle(request({ ...input, channelId }), createClient), 500, "DATABASE_ERROR");
    assert.doesNotMatch(JSON.stringify(body), /private DB detail/);
  });

  test(`${label}: 사전 취소 시 연결·조회 안 함`, async () => {
    const controller = new AbortController();
    controller.abort();
    let called = false;
    await expectError(await handle(request(input, { signal: controller.signal }), async () => { called = true; }), 408, "REQUEST_ABORTED");
    assert.equal(called, false);
  });
}

test("입력 스키마·질문 길이·limit 범위·혼합 필드 검사", async (t) => {
  const cases = [
    [handleNaturalSearch, {}, "INVALID_QUERY"],
    [handleNaturalSearch, { query: " " }, "INVALID_QUERY"],
    [handleNaturalSearch, { query: 123 }, "INVALID_QUERY"],
    [handleNaturalSearch, { query: "가".repeat(501) }, "INVALID_QUERY"],
    [handleNaturalSearch, { query: "배포", channelId: "invalid" }, "INVALID_CHANNEL"],
    [handleNaturalSearch, { query: "배포", channelId: null }, "INVALID_CHANNEL"],
    [handleNaturalSearch, { query: "배포", limit: 0 }, "INVALID_LIMIT"],
    [handleNaturalSearch, { query: "배포", limit: 51 }, "INVALID_LIMIT"],
    [handleNaturalSearch, { query: "배포", limit: "20" }, "INVALID_LIMIT"],
    [handleNaturalSearch, { query: "배포", limit: null }, "INVALID_LIMIT"],
    [handleNaturalSearch, { query: "배포", messages: ["혼합"] }, "INVALID_INPUT"],
    [handleExtractTasks, {}, "INVALID_CHANNEL"],
    [handleExtractTasks, { channelId: "invalid" }, "INVALID_CHANNEL"],
    [handleExtractTasks, { channelId, limit: 101 }, "INVALID_LIMIT"],
    [handleExtractTasks, { channelId, limit: 1.5 }, "INVALID_LIMIT"],
    [handleExtractTasks, { channelId, limit: null }, "INVALID_LIMIT"],
    [handleExtractTasks, { channelId, messages: ["혼합"] }, "INVALID_INPUT"],
  ];
  for (const [index, [handle, input, code]] of cases.entries()) {
    await t.test(`입력 ${index + 1}`, async () => {
      let called = false;
      await expectError(await handle(request(input), async () => { called = true; }), 400, code);
      assert.equal(called, false);
    });
  }
});

test("검색: 미연결이면 광범위한 메시지 조회도 하지 않는다", async () => {
  const { createClient, calls } = mockClient();
  await expectError(await handleNaturalSearch(request({ query: "지난주 배포 얘기" }), createClient), 503, "AI_NOT_CONNECTED");
  assert.deepEqual(calls, [["getUser"]]);
});

test("검색: 테스트 해석 조건만 검증·컴파일, 사용자 채널·최신순·개수 유지", async () => {
  const { createClient, calls } = mockClient({ rows: [{ id: 3 }, { id: 2 }, { id: 1 }] });
  const controller = new AbortController();
  const response = await handleNaturalSearch(request({ query: " 지난주 배포 얘기 ", channelId, limit: 2 }, { signal: controller.signal }), createClient,
    async (question, context, signal) => {
      assert.equal(question, "지난주 배포 얘기");
      assert.equal(context.timeZone, "Asia/Seoul");
      assert.ok(Number.isFinite(Date.parse(context.referenceTime)));
      assert.equal(signal.aborted, false);
      // AI 해석이 아닌 고정 테스트 조건이다.
      return { keywords: ["배포"], from: "2026-11-16T00:00:00+09:00", to: "2026-11-23T00:00:00+09:00" };
    });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body.messages, [{ id: 3 }, { id: 2 }]);
  assert.equal(body.hasMore, true);
  assert.deepEqual(body.interpretation, { keywords: ["배포"], from: "2026-11-15T15:00:00.000Z", to: "2026-11-22T15:00:00.000Z" });
  for (const expected of [
    ["messages", "eq", "channel_id", channelId],
    ["messages", "ilike", "content", "%배포%"],
    ["messages", "gte", "created_at", "2026-11-15T15:00:00.000Z"],
    ["messages", "lt", "created_at", "2026-11-22T15:00:00.000Z"],
    ["messages", "limit", 3],
    ["messages", "order", "created_at", { ascending: false }],
    ["messages", "order", "id", { ascending: false }],
  ]) assert.ok(calls.some((call) => JSON.stringify(call) === JSON.stringify(expected)));
});

test("검색: 전역 검색은 로그인 RLS에 맡기고 빈 결과·기본 20건을 지원", async () => {
  const { createClient, calls } = mockClient({ rows: [] });
  const response = await handleNaturalSearch(request({ query: "배포" }), createClient, async () => plan);
  assert.deepEqual((await response.json()).messages, []);
  assert.equal(calls.some((call) => call[0] === "from" && call[1] === "channel_members"), false);
  assert.ok(calls.some((call) => call[0] === "messages" && call[1] === "limit" && call[2] === 21));
});

test("검색: SQL·범위 확장·빈 조건·와일드카드·잘못된 날짜의 AI 응답 거절", async (t) => {
  const cases = [
    null, { ...plan, sql: "SELECT * FROM messages" }, { ...plan, channelId },
    { keywords: [], from: null, to: null }, { ...plan, keywords: ["*"] },
    { ...plan, keywords: Array(6).fill("배포") }, { ...plan, keywords: [" "] },
    { ...plan, from: "지난주" }, { ...plan, from: "2026-02-30T00:00:00Z" },
    { ...plan, from: "2026-11-23T00:00:00Z", to: "2026-11-16T00:00:00Z" },
    { ...plan, from: "2026-11-23T00:00:00" },
  ];
  for (const [index, value] of cases.entries()) {
    await t.test(`해석 ${index + 1}`, async () => {
      const { createClient, calls } = mockClient();
      await expectError(await handleNaturalSearch(request({ query: "배포" }), createClient, async () => value), 502, "INVALID_AI_RESPONSE");
      assert.equal(calls.some((call) => call[0] === "from" && call[1] === "messages"), false);
    });
  }
});

test("검색: %·_·역슬래시 이스케이프와 AND 조건", async () => {
  const { createClient, calls } = mockClient();
  await handleNaturalSearch(request({ query: "테스트 질문" }), createClient, async () => ({ keywords: ["50%_\\완료", "배포"], from: null, to: null }));
  assert.deepEqual(calls.filter((call) => call[0] === "messages" && call[1] === "ilike"), [
    ["messages", "ilike", "content", "%50\\%\\_\\\\완료%"], ["messages", "ilike", "content", "%배포%"],
  ]);
});

test("검색: 조회 오류·해석 함수 오류를 원문 없이 처리", async () => {
  const { createClient } = mockClient({ dbError: { message: "private DB detail" } });
  const response = await handleNaturalSearch(request({ query: "배포" }), createClient, async () => plan);
  const body = await expectError(response, 500, "DATABASE_ERROR");
  assert.doesNotMatch(JSON.stringify(body), /private DB detail/);
  const generic = await expectError(await handleNaturalSearch(request({ query: "배포" }), createClient, async () => { throw new Error("private model detail"); }), 500, "INTERNAL_ERROR");
  assert.doesNotMatch(JSON.stringify(generic), /private model detail/);
});

test("검색: 해석 도중 취소되면 메시지 조회를 시작하지 않음", async () => {
  const controller = new AbortController();
  const { createClient, calls } = mockClient();
  await expectError(await handleNaturalSearch(request({ query: "배포" }, { signal: controller.signal }), createClient,
    async () => { controller.abort(); return plan; }), 408, "REQUEST_ABORTED");
  assert.equal(calls.some((call) => call[0] === "from" && call[1] === "messages"), false);
});

test("할 일: 원본·답글을 시간순으로 전달하고 내용·담당자·기한·근거 JSON 검증", async () => {
  const { createClient, calls } = mockClient();
  const response = await handleExtractTasks(request({ channelId, limit: 10 }), createClient, async (messages, context) => {
    assert.deepEqual(messages, [...source].reverse());
    assert.equal(context.timeZone, "Asia/Seoul");
    return { tasks: [{ ...task, messageIds: [10, 10] }] };
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { tasks: [task], messageCount: 2 });
  assert.ok(calls.some((call) => call[0] === "messages" && call[1] === "eq" && call[2] === "channel_id" && call[3] === channelId));
  assert.ok(calls.some((call) => call[0] === "messages" && call[1] === "limit" && call[2] === 10));
  assert.equal(calls.some((call) => call[0] === "messages" && call[1] === "is"), false);
});

test("할 일: 담당자·기한 미정은 null, 결과 없음은 연결 함수가 반환한 빈 배열", async () => {
  const { createClient } = mockClient();
  const unknown = { ...task, assignee: null, dueDate: null };
  const response = await handleExtractTasks(request({ channelId }), createClient, async () => ({ tasks: [unknown] }));
  assert.deepEqual((await response.json()).tasks, [unknown]);
  const empty = await handleExtractTasks(request({ channelId }), createClient, async () => ({ tasks: [] }));
  assert.deepEqual((await empty.json()).tasks, []);
});

test("할 일: 근거 없는 ID·이름·잘못된 기한·형식·결과 수 거절", async (t) => {
  const cases = [
    null, { tasks: "invalid" }, { tasks: Array(21).fill(task) },
    { tasks: [{ ...task, content: " " }] }, { tasks: [{ ...task, content: "가".repeat(1001) }] },
    { tasks: [{ ...task, messageIds: [] }] }, { tasks: [{ ...task, messageIds: [999] }] },
    { tasks: [{ ...task, messageIds: ["10"] }] }, { tasks: [{ ...task, messageIds: Array(11).fill(10) }] },
    { tasks: [{ ...task, assignee: "원문에없는사람" }] },
    { tasks: [{ ...task, messageIds: [11] }] },
    { tasks: [{ ...task, dueDate: "내일" }] }, { tasks: [{ ...task, dueDate: "2026-02-30" }] },
    { tasks: [{ ...task, dueDate: "2026-11-31" }] },
    { tasks: [{ ...task, extra: true }] }, { tasks: [task], extra: true },
  ];
  for (const [index, value] of cases.entries()) {
    await t.test(`추출 ${index + 1}`, async () => {
      const { createClient } = mockClient();
      await expectError(await handleExtractTasks(request({ channelId }), createClient, async () => value), 502, "INVALID_AI_RESPONSE");
    });
  }
});

test("할 일: 빈 대화·너무 긴 대화는 추출 함수 호출 전에 안내", async () => {
  const cases = [
    [[], 422, "NO_MESSAGES"], [[{ ...source[0], content: " " }], 422, "NO_MESSAGES"],
    [[{ ...source[0], content: "가".repeat(4001) }], 413, "INPUT_TOO_LARGE"],
    [Array.from({ length: 6 }, (_, id) => ({ ...source[0], id: id + 1, content: "가".repeat(4000) })), 413, "INPUT_TOO_LARGE"],
  ];
  for (const [rows, status, code] of cases) {
    const { createClient } = mockClient({ rows });
    let called = false;
    await expectError(await handleExtractTasks(request({ channelId }), createClient, async () => { called = true; }), status, code);
    assert.equal(called, false);
  }
});

test("할 일: 기본 조회 50개 및 DB·추출 함수 오류 일반화", async () => {
  const { createClient, calls } = mockClient({ dbError: { message: "private DB detail" } });
  const body = await expectError(await handleExtractTasks(request({ channelId }), createClient), 500, "DATABASE_ERROR");
  assert.doesNotMatch(JSON.stringify(body), /private DB detail/);
  assert.ok(calls.some((call) => call[0] === "messages" && call[1] === "limit" && call[2] === 50));
  const good = mockClient();
  const generic = await expectError(await handleExtractTasks(request({ channelId }), good.createClient, async () => { throw new Error("private model detail"); }), 500, "INTERNAL_ERROR");
  assert.doesNotMatch(JSON.stringify(generic), /private model detail/);
});

test("EXAONE 주입 후에도 로그인·채널 권한·빈 대화 실패에는 외부 호출하지 않음", async () => {
  let calls = 0;
  const adapter = createExaoneExtra({ apiKey: TEST_CREDENTIAL, fetcher: async () => { calls += 1; throw new Error("must not fetch"); } });
  for (const [handle, input, generate] of [
    [handleNaturalSearch, { query: "배포", channelId }, adapter.interpret],
    [handleExtractTasks, { channelId }, adapter.extract],
  ]) {
    await expectError(await handle(request(input), mockClient({ user: null }).createClient, generate), 401, "UNAUTHORIZED");
    await expectError(await handle(request(input), mockClient({ member: null }).createClient, generate), 403, "FORBIDDEN");
  }
  await expectError(await handleExtractTasks(request({ channelId }), mockClient({ rows: [] }).createClient, adapter.extract), 422, "NO_MESSAGES");
  assert.equal(calls, 0);
});

test("EXAONE 조건 해석/추출의 가짜 응답을 실제 handler 경계로 전달", async () => {
  let calls = 0;
  const adapter = createExaoneExtra({ apiKey: TEST_CREDENTIAL, fetcher: async () => Response.json({ choices: [{
    finish_reason: "stop", message: { content: JSON.stringify(calls++ === 0 ? plan : { tasks: [task] }) },
  }] }) });
  const search = await handleNaturalSearch(request({ query: "배포", channelId }), mockClient().createClient, adapter.interpret);
  assert.equal(search.status, 200);
  assert.deepEqual((await search.json()).interpretation, plan);
  const extracted = await handleExtractTasks(request({ channelId }), mockClient().createClient, adapter.extract);
  assert.equal(extracted.status, 200);
  assert.deepEqual(await extracted.json(), { tasks: [task], messageCount: 2 });
  assert.equal(calls, 2);
});

test("EXAONE 인증 오류는 정제한 JSON·no-store로 전달하고 DB 검색 미실행", async () => {
  const adapter = createExaoneExtra({ apiKey: TEST_CREDENTIAL, fetcher: async () => new Response("private diagnostic", { status: 401 }) });
  const { createClient, calls } = mockClient();
  const body = await expectError(await handleNaturalSearch(request({ query: "배포" }), createClient, adapter.interpret), 502, "AI_AUTH_FAILED");
  assert.doesNotMatch(JSON.stringify(body), /private|unit-test-only/);
  assert.equal(calls.some((call) => call[0] === "from" && call[1] === "messages"), false);
});
