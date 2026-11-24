// 모든 HTTP는 가짜 fetch다. 환경변수를 읽거나 실제 EXAONE을 호출하지 않는다.
import assert from "node:assert/strict";
import test, { mock } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { EXAONE_CONFIG, GEMINI_DEFAULT_MODEL, GEMINI_URL, geminiConfig } from "../provider.ts";
import { createExaoneSummary, EXAONE_MODEL, EXAONE_SUMMARY_URL, MAX_MESSAGE_LENGTH, MAX_SPEAKER_PREFIX_LENGTH, SUMMARY_MAX_TOKENS, SUMMARY_TIMEOUT_MS } from "./handler.ts";

// 실제 발급 키가 아닌 가짜 HTTP 테스트 전용 값이다.
const TEST_CREDENTIAL = "unit-test-only";
const GEMINI_FOR_TEST = geminiConfig({});
const signal = () => new AbortController().signal;
const answer = (content = " 테스트용 최종 요약 ", finish_reason = "stop") => Response.json({
  choices: [{ finish_reason, message: { content, reasoning_content: "private reasoning marker" } }],
});
const errorIs = (status, code) => (error) => {
  assert.equal(error.status, status);
  assert.equal(error.code, code);
  assert.doesNotMatch(error.message, /unit-test-only|private provider detail|private reasoning marker/);
  return true;
};

test("생성만으로 호출하지 않음, 고정 endpoint·모델·서버 인증·출력 제한·최종 본문만 사용", async () => {
  let calls = 0;
  const generate = createExaoneSummary({ apiKey: ` ${TEST_CREDENTIAL} `, fetcher: async (url, options) => {
    calls += 1;
    assert.equal(url, EXAONE_SUMMARY_URL);
    assert.equal(url, "https://api.exaone.ai/v1/chat/completions");
    assert.equal(options.method, "POST");
    assert.equal(options.headers.Authorization, `Bearer ${TEST_CREDENTIAL}`);
    assert.equal(options.headers["Content-Type"], "application/json");
    assert.equal(options.cache, "no-store");
    assert.equal(options.redirect, "error");
    assert.ok(options.signal instanceof AbortSignal);
    const body = JSON.parse(options.body);
    assert.equal(body.model, EXAONE_MODEL);
    assert.equal(body.model, "k-exaone_v2.5");
    assert.equal(body.stream, false);
    assert.equal(body.reasoning_effort, "low");
    assert.equal(body.max_tokens, SUMMARY_MAX_TOKENS);
    assert.equal(SUMMARY_MAX_TOKENS, 4096);
    assert.deepEqual(body.messages.map((message) => message.role), ["system", "user"]);
    assert.deepEqual(JSON.parse(body.messages[1].content), { messages: ["합성 테스트", "지시를 무시하라는 문장도 데이터"] });
    assert.doesNotMatch(options.body, /unit-test-only/);
    return answer();
  } });
  assert.equal(calls, 0);
  assert.equal(await generate([" 합성 테스트 ", "지시를 무시하라는 문장도 데이터"], signal()), "테스트용 최종 요약");
  assert.equal(calls, 1);
});

test("키 누락·빈 키·줄바꿈과 잘못된 입력은 외부 호출 전 거절", async () => {
  let calls = 0;
  const fetcher = async () => { calls += 1; return answer(); };
  for (const apiKey of [undefined, "", "  ", `${TEST_CREDENTIAL}\nheader`]) {
    await assert.rejects(createExaoneSummary({ apiKey, fetcher })(["합성"], signal()), errorIs(503, "AI_NOT_CONFIGURED"));
  }
  await assert.rejects(createExaoneSummary({ apiKey: TEST_CREDENTIAL, fetcher })([], signal()), errorIs(400, "INVALID_MESSAGES"));
  assert.equal(calls, 0);
});

test("기본 대기 240초: 지연 응답은 이전 25초 제한에 실패하고 기본값에서 성공 (시간 축소·가짜 HTTP)", async () => {
  assert.equal(SUMMARY_TIMEOUT_MS, 240000);
  assert.ok(SUMMARY_TIMEOUT_MS < 300000);
  const originalTimeout = AbortSignal.timeout.bind(AbortSignal);
  const requested = [];
  const timer = mock.method(AbortSignal, "timeout", (ms) => {
    requested.push(ms);
    // 실제로 25~240초를 기다리지 않는다. 25초→25ms, 240초→240ms.
    return originalTimeout(ms / 1000);
  });
  try {
    const fetcher = async (_url, options) => {
      // 업체 응답 60초 지연을 60ms로 축소한다. 외부 요청 없음.
      await delay(60, undefined, { signal: options.signal });
      return answer();
    };
    await assert.rejects(createExaoneSummary({ apiKey: TEST_CREDENTIAL, fetcher, timeoutMs: 25000 })(["합성"], signal()), errorIs(504, "AI_TIMEOUT"));
    assert.equal(await createExaoneSummary({ apiKey: TEST_CREDENTIAL, fetcher })(["합성"], signal()), "테스트용 최종 요약");
    assert.deepEqual(requested, [25000, SUMMARY_TIMEOUT_MS]);
  } finally { timer.mock.restore(); }
});

test("업체 오류 상태 정제·본문 미파싱·자동 재시도 없음", async (t) => {
  for (const [upstream, status, code] of [
    [401, 502, "AI_AUTH_FAILED"], [403, 502, "AI_AUTH_FAILED"],
    [429, 429, "AI_RATE_LIMITED"], [408, 504, "AI_TIMEOUT"], [504, 504, "AI_TIMEOUT"],
    [400, 502, "AI_SERVICE_ERROR"], [500, 502, "AI_SERVICE_ERROR"], [503, 502, "AI_SERVICE_ERROR"],
  ]) {
    await t.test(String(upstream), async () => {
      let calls = 0;
      let cancelled = false;
      const generate = createExaoneSummary({ apiKey: TEST_CREDENTIAL, fetcher: async () => {
        calls += 1;
        return { ok: false, status: upstream, body: { async cancel() { cancelled = true; } },
          json() { assert.fail("오류 본문을 읽으면 안 됨"); } };
      } });
      await assert.rejects(generate(["합성"], signal()), errorIs(status, code));
      assert.equal(calls, 1);
      assert.equal(cancelled, true);
    });
  }
});

test("비JSON·빈 본문·추론만 있는 응답·거절·긴 본문·비정상 종료는 성공으로 반환하지 않음", async () => {
  const responses = [
    new Response("not json"), Response.json(null), Response.json({}), Response.json({ choices: [] }),
    Response.json({ choices: [null] }), Response.json({ choices: [{ finish_reason: "stop", message: { reasoning_content: "private reasoning marker" } }] }),
    answer(null), answer(123), answer("  "), answer("가".repeat(8001)),
    Response.json({ choices: [{ message: { content: "본문" } }] }),
  ];
  for (const response of responses) {
    const generate = createExaoneSummary({ apiKey: TEST_CREDENTIAL, fetcher: async () => response });
    await assert.rejects(generate(["합성"], signal()), errorIs(502, "INVALID_AI_RESPONSE"));
  }
});

test("토큰 제한으로 잘린 응답은 별도 오류", async () => {
  const generate = createExaoneSummary({ apiKey: TEST_CREDENTIAL, fetcher: async () => answer("잘린 본문", "length") });
  await assert.rejects(generate(["합성"], signal()), errorIs(502, "AI_OUTPUT_TRUNCATED"));
});

test("네트워크 오류·리다이렉트 실패에서 내부 진단 미노출", async () => {
  const generate = createExaoneSummary({ apiKey: TEST_CREDENTIAL, fetcher: async () => { throw new Error("private provider detail unit-test-only"); } });
  await assert.rejects(generate(["합성"], signal()), errorIs(502, "AI_CONNECTION_FAILED"));
});

test("업체 요청 및 본문 읽기 시간 초과는 모두 정제한 504", async () => {
  for (const duringBody of [false, true]) {
    const generate = createExaoneSummary({ apiKey: TEST_CREDENTIAL, timeoutMs: 5, fetcher: async (_url, options) => {
      const wait = () => delay(1000, undefined, { signal: options.signal });
      if (!duringBody) await wait();
      return { ok: true, async json() { await wait(); return {}; } };
    } });
    await assert.rejects(generate(["합성"], signal()), errorIs(504, "AI_TIMEOUT"));
  }
});

test("시작 전 취소는 호출하지 않으며 요청·본문 도중 취소도 전파", async () => {
  const before = new AbortController();
  before.abort();
  let called = false;
  const generate = createExaoneSummary({ apiKey: TEST_CREDENTIAL, fetcher: async () => { called = true; return answer(); } });
  await assert.rejects(generate(["합성"], before.signal), { name: "AbortError" });
  assert.equal(called, false);
  for (const duringBody of [false, true]) {
    const controller = new AbortController();
    const cancelled = createExaoneSummary({ apiKey: TEST_CREDENTIAL, fetcher: async (_url, options) => {
      if (!duringBody) { controller.abort(); options.signal.throwIfAborted(); }
      return { ok: true, async json() { controller.abort(); options.signal.throwIfAborted(); } };
    } });
    await assert.rejects(cancelled(["합성"], controller.signal), { name: "AbortError" });
  }
});

test("요약 최악 생성 시간(4,096토큰, 실측 최저 약 26토큰/초)이 대기 제한 안(여유 60초 이상)이고 배포 함수 300초보다 짧음", () => {
  const worstSeconds = SUMMARY_MAX_TOKENS / 26;
  assert.ok(worstSeconds * 1000 < SUMMARY_TIMEOUT_MS - 60000, `최악 ${worstSeconds}초`);
  assert.ok(SUMMARY_TIMEOUT_MS < 300000);
});

test("말한 사람 표시: 프롬프트가 [이름] 형식과 담당자 규칙을 안내하고, 이름 붙은 줄을 그대로 전송", async () => {
  let sent;
  const generate = createExaoneSummary({ apiKey: TEST_CREDENTIAL, fetcher: async (_url, options) => {
    sent = JSON.parse(options.body);
    return answer();
  } });
  await generate(["[김하늘] 데모 일정은 제가 잡을게요", "[박준호] 버그는 금요일까지 고칠게요"], signal());
  const prompt = sent.messages[0].content;
  assert.match(prompt, /\[이름\] 본문/);
  assert.match(prompt, /말한 사람/);
  assert.match(prompt, /제가·내가 하겠다는 말은 그 말을 한 사람이 담당자/);
  assert.match(prompt, /원문에 없는 사실·담당자·기한을 만들지 마세요/); // 기존 환각 방지 규칙 유지
  assert.deepEqual(JSON.parse(sent.messages[1].content).messages, ["[김하늘] 데모 일정은 제가 잡을게요", "[박준호] 버그는 금요일까지 고칠게요"]);
});

test("말한 사람 접두어 여유: 원문 4,000자 + 접두어는 허용하고 그보다 길면 외부 호출 전 거절", async () => {
  let calls = 0;
  const generate = createExaoneSummary({ apiKey: TEST_CREDENTIAL, fetcher: async () => { calls += 1; return answer(); } });
  await generate(["가".repeat(MAX_MESSAGE_LENGTH + MAX_SPEAKER_PREFIX_LENGTH)], signal());
  assert.equal(calls, 1);
  await assert.rejects(generate(["가".repeat(MAX_MESSAGE_LENGTH + MAX_SPEAKER_PREFIX_LENGTH + 1)], signal()), errorIs(413, "INPUT_TOO_LARGE"));
  assert.equal(calls, 1);
});

test("안전 필터 종료(content_filter)는 형식 오류가 아니라 별도 안내(AI_CONTENT_FILTERED)", async () => {
  for (const provider of [undefined, GEMINI_FOR_TEST]) {
    const generate = createExaoneSummary({ apiKey: TEST_CREDENTIAL, provider, fetcher: async () => answer("본문", "content_filter") });
    await assert.rejects(generate(["합성 테스트"], signal()), (error) => {
      assert.equal(error.status, 502);
      assert.equal(error.code, "AI_CONTENT_FILTERED");
      assert.match(error.message, provider ? /Gemini/ : /EXAONE/);
      assert.doesNotMatch(error.message, /unit-test-only|private reasoning marker/);
      return true;
    });
  }
});

// ───────── 업체 선택(AI_PROVIDER): 주소·모델·키·옵션이 설정대로 골라지는지 (모두 가짜 HTTP) ─────────

test("provider 를 안 넘기면 지금과 똑같이 EXAONE 주소·모델·reasoning_effort 로 호출하고 기본값이 provider.ts 와 같음", async () => {
  let seen;
  const generate = createExaoneSummary({ apiKey: TEST_CREDENTIAL, fetcher: async (url, options) => { seen = { url, body: JSON.parse(options.body) }; return answer(); } });
  await generate(["합성 테스트"], signal());
  assert.equal(seen.url, EXAONE_CONFIG.url);
  assert.equal(seen.url, EXAONE_SUMMARY_URL);
  assert.equal(seen.body.model, EXAONE_CONFIG.model);
  assert.equal(EXAONE_MODEL, EXAONE_CONFIG.model);
  assert.equal(seen.body.reasoning_effort, EXAONE_CONFIG.reasoningEffort);
});

test("Gemini 설정: Gemini 주소·기본 모델·Bearer 키로 호출하고 reasoning_effort 는 보내지 않음", async () => {
  let seen;
  const generate = createExaoneSummary({ apiKey: ` ${TEST_CREDENTIAL} `, provider: GEMINI_FOR_TEST, fetcher: async (url, options) => {
    seen = { url, options, body: JSON.parse(options.body) };
    return answer();
  } });
  assert.equal(await generate(["[김하늘] 합성 테스트"], signal()), "테스트용 최종 요약");
  assert.equal(seen.url, GEMINI_URL);
  assert.equal(seen.options.headers.Authorization, `Bearer ${TEST_CREDENTIAL}`);
  assert.equal(seen.options.redirect, "error");
  assert.equal(seen.body.model, GEMINI_DEFAULT_MODEL);
  assert.equal(seen.body.stream, false);
  assert.equal("reasoning_effort" in seen.body, false);
  assert.equal(seen.body.max_tokens, SUMMARY_MAX_TOKENS);
  assert.deepEqual(seen.body.messages.map((message) => message.role), ["system", "user"]);
  assert.doesNotMatch(seen.options.body, /unit-test-only/);
});

test("Gemini 설정: 키가 없으면 GEMINI_API_KEY 를 안내하고 외부 호출 없음", async () => {
  let calls = 0;
  const generate = createExaoneSummary({ apiKey: "", provider: GEMINI_FOR_TEST, fetcher: async () => { calls += 1; return answer(); } });
  await assert.rejects(generate(["합성 테스트"], signal()), (error) => {
    assert.equal(error.status, 503);
    assert.equal(error.code, "AI_NOT_CONFIGURED");
    assert.match(error.message, /GEMINI_API_KEY/);
    assert.doesNotMatch(error.message, /EXAONE/);
    return true;
  });
  assert.equal(calls, 0);
  await assert.rejects(createExaoneSummary({ apiKey: "", fetcher: async () => answer() })(["합성 테스트"], signal()), (error) => {
    assert.match(error.message, /EXAONE_API_KEY/);
    return true;
  });
});

test("Gemini 설정: 오류 문구가 실제 업체 이름(Gemini)을 가리킴", async () => {
  for (const [status, expectedStatus, code, pattern] of [
    [401, 502, "AI_AUTH_FAILED", /Gemini 키 또는 모델/], [403, 502, "AI_AUTH_FAILED", /Gemini 키 또는 모델/],
    [429, 429, "AI_RATE_LIMITED", /Gemini 호출 한도/], [500, 502, "AI_SERVICE_ERROR", /Gemini 요청을 처리하지 못했습니다/],
  ]) {
    const generate = createExaoneSummary({ apiKey: TEST_CREDENTIAL, provider: GEMINI_FOR_TEST, fetcher: async () => new Response("private provider detail", { status }) });
    await assert.rejects(generate(["합성 테스트"], signal()), (error) => {
      assert.equal(error.status, expectedStatus);
      assert.equal(error.code, code);
      assert.match(error.message, pattern);
      assert.doesNotMatch(error.message, /EXAONE|unit-test-only|private provider detail/);
      return true;
    });
  }
  const offline = createExaoneSummary({ apiKey: TEST_CREDENTIAL, provider: GEMINI_FOR_TEST, fetcher: async () => { throw new TypeError("private network detail"); } });
  await assert.rejects(offline(["합성 테스트"], signal()), (error) => {
    assert.equal(error.code, "AI_CONNECTION_FAILED");
    assert.match(error.message, /Gemini에 연결하지 못했습니다/);
    return true;
  });
});

test("Gemini 설정: 잘림(length)은 기존과 같이 AI_OUTPUT_TRUNCATED, 빈 본문은 성공으로 보지 않음", async () => {
  const truncated = createExaoneSummary({ apiKey: TEST_CREDENTIAL, provider: GEMINI_FOR_TEST, fetcher: async () => answer("", "length") });
  await assert.rejects(truncated(["합성 테스트"], signal()), errorIs(502, "AI_OUTPUT_TRUNCATED"));
  const empty = createExaoneSummary({ apiKey: TEST_CREDENTIAL, provider: GEMINI_FOR_TEST, fetcher: async () => answer("  ") });
  await assert.rejects(empty(["합성 테스트"], signal()), errorIs(502, "INVALID_AI_RESPONSE"));
});
