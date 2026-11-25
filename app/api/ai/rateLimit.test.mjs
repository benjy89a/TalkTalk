import assert from "node:assert/strict";
import test from "node:test";
import { AI_LIMIT_PER_MINUTE, AI_LIMIT_WINDOW_MS, createAiRateLimiter } from "./rateLimit.ts";
import { handleSummarize } from "./summarize/handler.ts";
import { handleExtractTasks, handleNaturalSearch } from "./extra.ts";

const channelId = "11111111-1111-4111-8111-111111111111";

// ───────── 제한기 자체 ─────────

function clock(start = 1_000_000) {
  let time = start;
  return { now: () => time, advance: (ms) => { time += ms; } };
}

test("기본 한도는 분당 5회", () => {
  assert.equal(AI_LIMIT_PER_MINUTE, 5);
  assert.equal(AI_LIMIT_WINDOW_MS, 60_000);
});

test("1분에 5회까지 허용하고 6번째는 거절, 안내에 남은 초가 있다", () => {
  const time = clock();
  const limiter = createAiRateLimiter({ now: time.now });
  for (let i = 0; i < 5; i += 1) {
    const slot = limiter.acquire("u1");
    assert.equal(slot.ok, true, `${i + 1}번째`);
    slot.release();
    time.advance(1000);
  }
  const denied = limiter.acquire("u1");
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, "rate_limited");
  // 첫 호출이 55초 전이므로 5초 뒤에 풀린다.
  assert.equal(denied.retryAfterSec, 55);
  assert.match(denied.message, /1분에 5회/);
});

test("60초가 지나면 다시 허용한다", () => {
  const time = clock();
  const limiter = createAiRateLimiter({ now: time.now });
  for (let i = 0; i < 5; i += 1) limiter.acquire("u1").release();
  assert.equal(limiter.acquire("u1").ok, false);
  time.advance(60_000);
  assert.equal(limiter.acquire("u1").ok, true);
});

test("동시 호출은 사용자당 1건: 끝나기 전에는 busy, release 후 허용", () => {
  const limiter = createAiRateLimiter({ now: clock().now });
  const first = limiter.acquire("u1");
  assert.equal(first.ok, true);
  const second = limiter.acquire("u1");
  assert.equal(second.ok, false);
  assert.equal(second.reason, "busy");
  first.release();
  assert.equal(limiter.acquire("u1").ok, true);
});

test("release 를 여러 번 불러도 다른 요청의 자리를 지우지 않는다", () => {
  const limiter = createAiRateLimiter({ now: clock().now });
  const first = limiter.acquire("u1");
  first.release();
  const second = limiter.acquire("u1");
  assert.equal(second.ok, true);
  first.release(); // 이미 반납한 자리: 아무 일도 없어야 한다
  assert.equal(limiter.acquire("u1").ok, false, "두 번째 요청은 아직 진행 중");
  second.release();
});

test("사용자마다 따로 센다", () => {
  const limiter = createAiRateLimiter({ now: clock().now });
  const a = limiter.acquire("a");
  assert.equal(a.ok, true);
  assert.equal(limiter.acquire("b").ok, true);
  assert.equal(limiter.acquire("a").ok, false);
});

test("한도 값은 바꿔 줄 수 있다", () => {
  const limiter = createAiRateLimiter({ perMinute: 2, now: clock().now });
  limiter.acquire("u").release();
  limiter.acquire("u").release();
  assert.equal(limiter.acquire("u").ok, false);
});

// ───────── 핸들러 연결 (가짜 계정·DB·AI, 외부 호출 없음) ─────────

function request(body) {
  return new Request("http://localhost/api/ai/test", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

function mockClient({ userId = "test-user" } = {}) {
  const rows = [{ id: 1, content: "테스트 대화", created_at: "2026-11-23T01:00:00Z", parent_id: null }];
  const client = {
    auth: { async getUser() { return { data: { user: { id: userId } }, error: null }; } },
    from() {
      const query = {};
      for (const method of ["select", "eq", "is", "order", "limit", "abortSignal", "ilike", "gte", "lt"]) {
        query[method] = () => query;
      }
      query.maybeSingle = async () => ({ data: { channel_id: channelId }, error: null });
      query.then = (resolve, reject) => Promise.resolve({ data: rows, error: null }).then(resolve, reject);
      return query;
    },
  };
  return async () => client;
}

async function errorCode(response, status) {
  assert.equal(response.status, status);
  return (await response.json()).error.code;
}

test("요약: 분당 한도를 넘으면 AI 호출 없이 429(USER_RATE_LIMITED)", async () => {
  const limiter = createAiRateLimiter({ perMinute: 2, now: clock().now });
  let aiCalls = 0;
  const generate = async () => { aiCalls += 1; return "요약"; };
  const createClient = mockClient();
  for (let i = 0; i < 2; i += 1) {
    assert.equal((await handleSummarize(request({ messages: ["안녕"] }), createClient, generate, limiter)).status, 200);
  }
  const denied = await handleSummarize(request({ messages: ["안녕"] }), createClient, generate, limiter);
  assert.equal(await errorCode(denied, 429), "USER_RATE_LIMITED");
  assert.equal(aiCalls, 2, "한도를 넘은 요청은 AI 를 부르지 않는다");
});

test("요약: AI 가 실패해도 자리를 반납한다(실패 뒤 곧바로 다시 가능, USER_BUSY 로 막히지 않음)", async () => {
  const limiter = createAiRateLimiter({ perMinute: 5, now: clock().now });
  const createClient = mockClient();
  const failing = async () => { throw new Error("boom"); };
  assert.equal((await handleSummarize(request({ messages: ["안녕"] }), createClient, failing, limiter)).status, 500);
  assert.equal((await handleSummarize(request({ messages: ["안녕"] }), createClient, async () => "요약", limiter)).status, 200);
});

test("요약: 같은 사용자의 동시 요청은 두 번째가 429(USER_BUSY)", async () => {
  const limiter = createAiRateLimiter({ now: clock().now });
  const createClient = mockClient();
  let finish;
  const slow = () => new Promise((resolve) => { finish = () => resolve("요약"); });
  const first = handleSummarize(request({ messages: ["안녕"] }), createClient, slow, limiter);
  await new Promise((resolve) => setTimeout(resolve, 20));
  const second = await handleSummarize(request({ messages: ["안녕"] }), createClient, async () => "요약", limiter);
  assert.equal(await errorCode(second, 429), "USER_BUSY");
  finish();
  assert.equal((await first).status, 200);
});

test("요약: 잘못된 입력이나 로그인 없음은 횟수에 세지 않는다", async () => {
  const limiter = createAiRateLimiter({ perMinute: 1, now: clock().now });
  const createClient = mockClient();
  assert.equal((await handleSummarize(request({ messages: [] }), createClient, async () => "요약", limiter)).status, 400);
  assert.equal((await handleSummarize(request({ messages: ["안녕"] }), createClient, async () => "요약", limiter)).status, 200);
});

test("검색·할 일 추출·요약은 한 사용자의 한도를 함께 쓴다", async () => {
  const limiter = createAiRateLimiter({ perMinute: 2, now: clock().now });
  const createClient = mockClient();
  const plan = { keywords: ["배포"], from: null, to: null };
  const search = await handleNaturalSearch(request({ query: "배포 얘기" }), createClient, async () => plan, limiter);
  assert.equal(search.status, 200);
  const tasks = await handleExtractTasks(request({ channelId }), createClient, async () => ({ tasks: [] }), limiter);
  assert.equal(tasks.status, 200);
  const summary = await handleSummarize(request({ messages: ["안녕"] }), createClient, async () => "요약", limiter);
  assert.equal(await errorCode(summary, 429), "USER_RATE_LIMITED");
});

test("검색: 한도 초과 시 해석 함수(AI)를 부르지 않는다", async () => {
  const limiter = createAiRateLimiter({ perMinute: 1, now: clock().now });
  const createClient = mockClient();
  let aiCalls = 0;
  const interpret = async () => { aiCalls += 1; return { keywords: ["배포"], from: null, to: null }; };
  assert.equal((await handleNaturalSearch(request({ query: "배포" }), createClient, interpret, limiter)).status, 200);
  const denied = await handleNaturalSearch(request({ query: "배포" }), createClient, interpret, limiter);
  assert.equal(await errorCode(denied, 429), "USER_RATE_LIMITED");
  assert.equal(aiCalls, 1);
});

test("limiter 를 안 넘기면 기존처럼 제한이 없다", async () => {
  const createClient = mockClient();
  for (let i = 0; i < 8; i += 1) {
    assert.equal((await handleSummarize(request({ messages: ["안녕"] }), createClient, async () => "요약")).status, 200);
  }
});
