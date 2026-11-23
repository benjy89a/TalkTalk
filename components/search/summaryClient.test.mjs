import assert from "node:assert/strict";
import test from "node:test";
import { requestChannelSummary, SummaryRequestError } from "./summaryClient.ts";

test("채널 ID와 개수만 내부 API에 전달하고 쿠키·취소 신호를 사용", async () => {
  const controller = new AbortController();
  const summary = await requestChannelSummary("test-channel", 25, controller.signal, async (url, options) => {
    assert.equal(url, "/api/ai/summarize");
    assert.equal(options.method, "POST");
    assert.equal(options.cache, "no-store");
    assert.equal(options.credentials, "same-origin");
    assert.equal(options.signal, controller.signal);
    assert.deepEqual(JSON.parse(options.body), { channelId: "test-channel", limit: 25 });
    return Response.json({ summary: " 테스트용 응답이며 실제 AI 생성 아님 " });
  });
  assert.equal(summary, "테스트용 응답이며 실제 AI 생성 아님");
});

test("AI 미연결·로그인·권한 오류 코드를 UI에 전달", async () => {
  for (const [status, code] of [[503, "AI_NOT_CONNECTED"], [401, "UNAUTHORIZED"], [403, "FORBIDDEN"], [422, "NO_MESSAGES"]]) {
    await assert.rejects(requestChannelSummary("test-channel", 50, new AbortController().signal,
      async () => Response.json({ error: { code, message: "테스트 안내" } }, { status })), (error) => {
      assert.ok(error instanceof SummaryRequestError);
      assert.equal(error.code, code);
      return true;
    });
  }
});

test("성공 상태라도 summary가 없거나 비면 오류", async () => {
  for (const body of [{}, { summary: " " }, { summary: 123 }]) {
    await assert.rejects(requestChannelSummary("test-channel", 50, new AbortController().signal,
      async () => Response.json(body)), (error) => error.code === "INVALID_RESPONSE");
  }
});

test("알 수 없는 서버 오류는 일반 안내", async () => {
  await assert.rejects(requestChannelSummary("test-channel", 50, new AbortController().signal,
    async () => Response.json({}, { status: 500 })), (error) => error.code === "REQUEST_FAILED");
});

test("응답 도착 전에 취소되면 결과를 사용하지 않음", async () => {
  const controller = new AbortController();
  await assert.rejects(requestChannelSummary("test-channel", 50, controller.signal, async () => {
    controller.abort();
    return Response.json({ summary: "표시하면 안 되는 테스트 응답" });
  }), { name: "AbortError" });
});
