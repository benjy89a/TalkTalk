// 실제 환경변수·DB·EXAONE을 사용하지 않는 가짜 HTTP 검사다.
import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createExaoneExtra, EXTRACT_TIMEOUT_MS, SEARCH_TIMEOUT_MS, seoulCalendar } from "./extra.ts";
import { SUMMARY_TIMEOUT_MS } from "./summarize/handler.ts";

const TEST_CREDENTIAL = "unit-test-only";
const context = { referenceTime: "2026-11-23T01:00:00Z", timeZone: "Asia/Seoul" };
const plan = { keywords: ["배포"], from: "2026-11-16T00:00:00+09:00", to: "2026-11-23T00:00:00+09:00" };
const source = [{ id: 10, content: "테스트 담당 가: 내일까지 배포 점검을 하겠습니다.", created_at: "2026-11-22T16:00:00Z", parent_id: null }];
const tasks = { tasks: [{ content: "배포 점검", assignee: "테스트 담당 가", dueDate: "2026-11-24", messageIds: [10] }] };
const signal = () => new AbortController().signal;
const completion = (value, finish_reason = "stop") => Response.json({ choices: [{ finish_reason,
  message: { content: JSON.stringify(value), reasoning_content: "private reasoning marker" } }] });
const errorIs = (status, code) => (error) => {
  assert.equal(error.status, status);
  assert.equal(error.code, code);
  assert.doesNotMatch(error.message, /private|unit-test-only/);
  return true;
};

test("서울 날짜·월요일 주간 범위는 자정·일요일·연도 경계에서 일정", () => {
  const calendar = seoulCalendar(context.referenceTime);
  assert.deepEqual(calendar.lastWeek, { from: "2026-11-15T15:00:00.000Z", to: "2026-11-22T15:00:00.000Z" });
  assert.deepEqual(calendar.today, { from: "2026-11-22T15:00:00.000Z", to: "2026-11-23T15:00:00.000Z" });
  assert.deepEqual(seoulCalendar("2026-11-22T14:59:59Z").thisWeek, calendar.lastWeek);
  assert.deepEqual(seoulCalendar("2026-11-22T15:00:00Z").thisWeek, calendar.thisWeek);
  assert.deepEqual(seoulCalendar("2026-01-01T00:00:00Z").thisWeek, { from: "2025-12-28T15:00:00.000Z", to: "2026-01-04T15:00:00.000Z" });
  assert.throws(() => seoulCalendar("invalid"), errorIs(400, "INVALID_INPUT"));
});

test("생성만으로 미호출, 검색 조건 JSON·날짜 기준·고정 endpoint/모델·안전한 요청", async () => {
  let calls = 0;
  const adapter = createExaoneExtra({ apiKey: ` ${TEST_CREDENTIAL} `, fetcher: async (url, options) => {
    calls += 1;
    assert.equal(url, "https://api.exaone.ai/v1/chat/completions");
    assert.equal(options.method, "POST");
    assert.equal(options.headers.Authorization, `Bearer ${TEST_CREDENTIAL}`);
    assert.equal(options.cache, "no-store");
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    const body = JSON.parse(options.body);
    assert.equal(body.model, "k-exaone_v2.5");
    assert.equal(body.reasoning_effort, "low");
    assert.equal(body.stream, false);
    assert.equal(body.max_tokens, 4096);
    assert.deepEqual(body.messages.map((message) => message.role), ["system", "user"]);
    const data = JSON.parse(body.messages[1].content);
    assert.equal(data.question, "지난주 배포 얘기 찾아줘");
    assert.deepEqual(data.calendar, seoulCalendar(context.referenceTime));
    assert.equal(data.timeZone, "Asia/Seoul");
    assert.doesNotMatch(options.body, /unit-test-only/);
    return completion(plan);
  } });
  assert.equal(calls, 0);
  assert.deepEqual(await adapter.interpret(" 지난주 배포 얘기 찾아줘 ", context, signal()), {
    keywords: ["배포"], ...seoulCalendar(context.referenceTime).lastWeek,
  });
  assert.equal(calls, 1);
});

test("할 일은 작성 시각의 서울 날짜·근거 ID를 전송하고 추론 아닌 최종 JSON만 사용", async () => {
  const adapter = createExaoneExtra({ apiKey: TEST_CREDENTIAL, fetcher: async (_url, options) => {
    const body = JSON.parse(options.body);
    const data = JSON.parse(body.messages[1].content);
    assert.equal(data.messages[0].dateInSeoul, "2026-11-23");
    assert.equal(data.messages[0].id, 10);
    assert.match(body.messages[0].content, /created_at/);
    return completion(tasks);
  } });
  assert.deepEqual(await adapter.extract(source, context, signal()), tasks);
});

test("기본 대기 제한은 검색·추출 모두 4분, 테스트 주입값이 있으면 우선", async (t) => {
  const limits = [];
  t.mock.method(AbortSignal, "timeout", (ms) => { limits.push(ms); return signal(); });
  let calls = 0;
  const adapter = createExaoneExtra({ apiKey: TEST_CREDENTIAL, fetcher: async () => completion(calls++ === 0 ? plan : tasks) });
  await adapter.interpret("배포", context, signal());
  await adapter.extract(source, context, signal());
  const custom = createExaoneExtra({ apiKey: TEST_CREDENTIAL, timeoutMs: 17, fetcher: async () => completion(tasks) });
  await custom.extract(source, context, signal());
  assert.deepEqual(limits, [SEARCH_TIMEOUT_MS, EXTRACT_TIMEOUT_MS, 17]);
  // 무료 API의 느린 생성 속도와 배포 함수 한도(300초) 사이에 두고, 예전 45초보다 늘렸는지 고정한다.
  assert.equal(SEARCH_TIMEOUT_MS, 240000);
  assert.equal(EXTRACT_TIMEOUT_MS, 240000);
  assert.equal(SUMMARY_TIMEOUT_MS, SEARCH_TIMEOUT_MS);
  assert.equal(SUMMARY_TIMEOUT_MS, EXTRACT_TIMEOUT_MS);
  assert.ok(EXTRACT_TIMEOUT_MS < 300000);
});

test("잘못된 키·입력은 실제 요청 전 거절", async () => {
  let calls = 0;
  const fetcher = async () => { calls += 1; return completion(plan); };
  for (const apiKey of [undefined, "", "  ", `${TEST_CREDENTIAL}\ninvalid`]) {
    await assert.rejects(createExaoneExtra({ apiKey, fetcher }).interpret("배포", context, signal()), errorIs(503, "AI_NOT_CONFIGURED"));
  }
  const adapter = createExaoneExtra({ apiKey: TEST_CREDENTIAL, fetcher });
  await assert.rejects(adapter.interpret(" ", context, signal()), errorIs(400, "INVALID_QUERY"));
  await assert.rejects(adapter.extract([], context, signal()), errorIs(400, "INVALID_INPUT"));
  await assert.rejects(adapter.extract([{ ...source[0], created_at: "invalid" }], context, signal()), errorIs(400, "INVALID_INPUT"));
  assert.equal(calls, 0);
});

test("인증·한도·서비스·시간 오류는 업체 본문/키 노출이나 자동 재시도 없이 정제", async (t) => {
  for (const [upstream, status, code] of [
    [401, 502, "AI_AUTH_FAILED"], [403, 502, "AI_AUTH_FAILED"], [429, 429, "AI_RATE_LIMITED"],
    [408, 504, "AI_TIMEOUT"], [504, 504, "AI_TIMEOUT"], [400, 502, "AI_SERVICE_ERROR"], [500, 502, "AI_SERVICE_ERROR"],
  ]) {
    await t.test(String(upstream), async () => {
      let calls = 0;
      let cancelled = false;
      const adapter = createExaoneExtra({ apiKey: TEST_CREDENTIAL, fetcher: async () => {
        calls += 1;
        return { ok: false, status: upstream, body: { async cancel() { cancelled = true; } }, json() { assert.fail("업체 오류 본문 읽기 금지"); } };
      } });
      await assert.rejects(adapter.interpret("배포", context, signal()), errorIs(status, code));
      assert.equal(calls, 1);
      assert.equal(cancelled, true);
    });
  }
});

test("비JSON·추론만 있는 응답·코드 블록·잘림·잘못된 스키마/근거는 성공 아님", async () => {
  for (const response of [
    new Response("not JSON"), Response.json(null), Response.json({ choices: [] }),
    Response.json({ choices: [{ finish_reason: "stop", message: { reasoning_content: JSON.stringify(plan) } }] }),
    Response.json({ choices: [{ finish_reason: "stop", message: { content: `\u0060\u0060\u0060json\n${JSON.stringify(plan)}\n\u0060\u0060\u0060` } }] }),
    completion({ ...plan, sql: "SELECT *" }),
    completion(plan, "content_filter"),
  ]) {
    const adapter = createExaoneExtra({ apiKey: TEST_CREDENTIAL, fetcher: async () => response });
    await assert.rejects(adapter.interpret("배포", context, signal()), errorIs(502, "INVALID_AI_RESPONSE"));
  }
  // 형식은 정상인데 키워드·기간이 모두 없는 응답(모호한 질문)은 502가 아니라 400 입력 안내
  await assert.rejects(
    createExaoneExtra({ apiKey: TEST_CREDENTIAL, fetcher: async () => completion({ keywords: [], from: null, to: null }) })
      .interpret("이제", context, signal()),
    errorIs(400, "INVALID_QUERY"),
  );
  await assert.rejects(createExaoneExtra({ apiKey: TEST_CREDENTIAL, fetcher: async () => completion(plan, "length") })
    .interpret("배포", context, signal()), errorIs(502, "AI_OUTPUT_TRUNCATED"));
  for (const task of [{ ...tasks.tasks[0], messageIds: [999] }, { ...tasks.tasks[0], assignee: "없는 이름" }, { ...tasks.tasks[0], dueDate: "2026-02-30" }]) {
    await assert.rejects(createExaoneExtra({ apiKey: TEST_CREDENTIAL, fetcher: async () => completion({ tasks: [task] }) })
      .extract(source, context, signal()), errorIs(502, "INVALID_AI_RESPONSE"));
  }
});

test("요청·본문 읽기 시간 초과와 연결 실패를 정제", async () => {
  for (const duringBody of [false, true]) {
    const adapter = createExaoneExtra({ apiKey: TEST_CREDENTIAL, timeoutMs: 5, fetcher: async (_url, options) => {
      const wait = () => delay(1000, undefined, { signal: options.signal });
      if (!duringBody) await wait();
      return { ok: true, async json() { await wait(); return {}; } };
    } });
    await assert.rejects(adapter.interpret("배포", context, signal()), errorIs(504, "AI_TIMEOUT"));
  }
  const broken = createExaoneExtra({ apiKey: TEST_CREDENTIAL, fetcher: async () => { throw new Error("private unit-test-only diagnostic"); } });
  await assert.rejects(broken.interpret("배포", context, signal()), errorIs(502, "AI_CONNECTION_FAILED"));
});

test("시작 전·요청 중·본문 중 취소를 전파하고 취소 후 결과를 쓰지 않음", async () => {
  const before = new AbortController();
  before.abort();
  let called = false;
  const adapter = createExaoneExtra({ apiKey: TEST_CREDENTIAL, fetcher: async () => { called = true; return completion(plan); } });
  await assert.rejects(adapter.interpret("배포", context, before.signal), { name: "AbortError" });
  assert.equal(called, false);
  for (const duringBody of [false, true]) {
    const controller = new AbortController();
    const cancelled = createExaoneExtra({ apiKey: TEST_CREDENTIAL, fetcher: async (_url, options) => {
      if (!duringBody) { controller.abort(); options.signal.throwIfAborted(); }
      return { ok: true, async json() { controller.abort(); options.signal.throwIfAborted(); } };
    } });
    await assert.rejects(cancelled.interpret("배포", context, controller.signal), { name: "AbortError" });
  }
});
