import assert from "node:assert/strict";
import test from "node:test";
import { AiExtraRequestError, requestExtractTasks, requestNaturalSearch } from "./extraClient.ts";

const channelId = "11111111-1111-4111-8111-111111111111";
const search = {
  messages: [{ id: 11, channel_id: channelId, content: "합성 테스트 메시지", created_at: "2026-11-23T01:00:00Z", parent_id: null }],
  hasMore: false, interpretation: { keywords: ["테스트"], from: null, to: null },
  referenceTime: "2026-11-23T01:00:00Z", timeZone: "Asia/Seoul",
};
const tasks = { tasks: [{ content: "합성 점검", assignee: null, dueDate: null, messageIds: [11] }], messageCount: 1 };
const signal = () => new AbortController().signal;
const operations = [
  ["검색", (s, f) => requestNaturalSearch(channelId, " 테스트 ", s, f), "/api/ai/search", { channelId, query: "테스트", limit: 20 }, search],
  ["추출", (s, f) => requestExtractTasks(channelId, 25, s, f), "/api/ai/tasks", { channelId, limit: 25 }, tasks],
];

for (const [label, run, path, input, output] of operations) {
  test(`${label}: 동일 출처 쿠키·입력·취소·캐시 금지, 원문/키 미전달`, async () => {
    const s = signal();
    const result = await run(s, async (url, options) => {
      assert.equal(url, path);
      assert.equal(options.method, "POST");
      assert.equal(options.credentials, "same-origin");
      assert.equal(options.cache, "no-store");
      assert.equal(options.signal, s);
      assert.deepEqual(JSON.parse(options.body), input);
      assert.equal(options.headers.Authorization, undefined);
      return Response.json(output);
    });
    assert.deepEqual(result, output);
  });
  test(`${label}: 설정·로그인·권한·업체 한도/시간 오류를 UI로 전달`, async () => {
    for (const [status, code] of [[401, "UNAUTHORIZED"], [403, "FORBIDDEN"], [503, "AI_NOT_CONFIGURED"], [429, "AI_RATE_LIMITED"], [504, "AI_TIMEOUT"]]) {
      await assert.rejects(run(signal(), async () => Response.json({ error: { code, message: "합성 오류 안내" } }, { status })),
        (error) => error instanceof AiExtraRequestError && error.code === code && error.message === "합성 오류 안내");
    }
  });
  test(`${label}: 비JSON·알 수 없는 실패는 내부 원문 없는 일반 안내`, async () => {
    for (const response of [new Response("private server diagnostic", { status: 500 }), Response.json({ diagnostic: "private" }, { status: 502 })]) {
      await assert.rejects(run(signal(), async () => response), (error) => {
        assert.equal(error.code, "REQUEST_FAILED");
        assert.doesNotMatch(error.message, /private/);
        return true;
      });
    }
  });
  test(`${label}: 사전 취소·늦게 도착한 응답·본문 파싱 중 취소 결과 미사용`, async () => {
    const before = new AbortController(); before.abort();
    let called = false;
    await assert.rejects(run(before.signal, async () => { called = true; return Response.json(output); }), { name: "AbortError" });
    assert.equal(called, false);
    for (const duringBody of [false, true]) {
      const controller = new AbortController();
      await assert.rejects(run(controller.signal, async () => {
        if (!duringBody) controller.abort();
        return { ok: true, async json() { if (duringBody) controller.abort(); return output; } };
      }), { name: "AbortError" });
    }
  });
}

test("검색: 빈 결과 허용, 잘못된 메시지·다른 채널·기간·배열 거절", async () => {
  assert.deepEqual((await requestNaturalSearch(channelId, "테스트", signal(), async () => Response.json({ ...search, messages: [] }))).messages, []);
  for (const body of [null, {}, { ...search, messages: [null] },
    { ...search, messages: [{ ...search.messages[0], channel_id: "other-channel" }] },
    { ...search, messages: [{ ...search.messages[0], id: "11" }] },
    { ...search, messages: Array(21).fill(search.messages[0]) },
    { ...search, interpretation: { ...search.interpretation, from: "invalid" } },
    { ...search, interpretation: { ...search.interpretation, keywords: [null] } },
  ]) {
    await assert.rejects(requestNaturalSearch(channelId, "테스트", signal(), async () => Response.json(body)), { code: "INVALID_RESPONSE" });
  }
});

test("추출: 빈 할 일 허용, 잘못된 내용·담당자·날짜·근거·메시지 개수 거절", async () => {
  assert.deepEqual((await requestExtractTasks(channelId, 25, signal(), async () => Response.json({ ...tasks, tasks: [] }))).tasks, []);
  for (const body of [null, {}, { ...tasks, messageCount: 26 }, { ...tasks, messageCount: 0 },
    ...[{ content: " " }, { assignee: " " }, { dueDate: "2026-02-30" }, { messageIds: [] }, { messageIds: ["11"] }]
      .map(change => ({ ...tasks, tasks: [{ ...tasks.tasks[0], ...change }] })),
  ]) {
    await assert.rejects(requestExtractTasks(channelId, 25, signal(), async () => Response.json(body)), { code: "INVALID_RESPONSE" });
  }
});
