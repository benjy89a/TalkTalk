import assert from "node:assert/strict";
import test from "node:test";
import { aiTargetText, fetchAiProviderInfo, fetchAiStatus, requestAiProbe } from "./aiStatusClient.ts";

const reply = (status, body) => async () => new Response(JSON.stringify(body), { status });
const signal = () => new AbortController().signal;

test("상태: 정상 응답 파싱, 403·401·형식 오류는 오류", async () => {
  assert.deepEqual(await fetchAiStatus(signal(), reply(200, { provider: "EXAONE", keyConfigured: true })),
    { provider: "EXAONE", model: undefined, keyConfigured: true });
  await assert.rejects(fetchAiStatus(signal(), reply(403, { error: {} })), { code: "FORBIDDEN" });
  await assert.rejects(fetchAiStatus(signal(), reply(401, { error: {} })), { code: "UNAUTHORIZED" });
  await assert.rejects(fetchAiStatus(signal(), reply(200, { provider: "X" })), { code: "INVALID_RESPONSE" });
});

test("연결 테스트: POST 한 번, 성공·실패 결과 정리", async () => {
  const methods = [];
  const f = async (_url, init) => { methods.push(init.method); return new Response(JSON.stringify({ ok: true, ms: 820 })); };
  assert.deepEqual(await requestAiProbe(signal(), f), { ok: true, ms: 820 });
  assert.deepEqual(methods, ["POST"]);
  assert.deepEqual(await requestAiProbe(signal(), reply(200, { ok: false, message: "vendor detail" })),
    { ok: false, message: "연결에 실패했어요." });
  await assert.rejects(requestAiProbe(signal(), reply(200, { foo: 1 })), { code: "INVALID_RESPONSE" });
});

// ───────── 업체 선택(AI_PROVIDER) ─────────

test("상태: 업체 ID·키 환경변수 이름이 있으면 함께 받고, 문자열이 아니면 형식 오류", async () => {
  assert.deepEqual(
    await fetchAiStatus(signal(), reply(200, { provider: "Gemini", providerId: "gemini", model: "gemini-3.5-flash-lite", keyEnvName: "GEMINI_API_KEY", keyConfigured: false })),
    { provider: "Gemini", providerId: "gemini", model: "gemini-3.5-flash-lite", keyEnvName: "GEMINI_API_KEY", keyConfigured: false },
  );
  await assert.rejects(fetchAiStatus(signal(), reply(200, { provider: "X", keyConfigured: true, providerId: 1 })), { code: "INVALID_RESPONSE" });
  await assert.rejects(fetchAiStatus(signal(), reply(200, { provider: "X", keyConfigured: true, keyEnvName: {} })), { code: "INVALID_RESPONSE" });
});

test("안내문용 업체 정보: ?view=public 으로 GET 하고 이름만 받음", async () => {
  const urls = [];
  const fetcher = async (url, options) => { urls.push([url, options.method]); return Response.json({ provider: " Gemini ", providerId: "gemini", model: "gemini-3.5-flash-lite" }); };
  assert.deepEqual(await fetchAiProviderInfo(signal(), fetcher), { provider: "Gemini", providerId: "gemini", model: "gemini-3.5-flash-lite" });
  assert.deepEqual(urls, [["/api/ai/status?view=public", "GET"]]);
  // 키 설정 여부가 없어도 정상(일반 계정 응답)
  assert.deepEqual(await fetchAiProviderInfo(signal(), reply(200, { provider: "EXAONE" })), { provider: "EXAONE", model: undefined });
});

test("안내문용 업체 정보: 401·형식 오류·빈 이름·너무 긴 이름은 오류", async () => {
  await assert.rejects(fetchAiProviderInfo(signal(), reply(401, { error: {} })), { code: "UNAUTHORIZED" });
  await assert.rejects(fetchAiProviderInfo(signal(), reply(200, {})), { code: "INVALID_RESPONSE" });
  await assert.rejects(fetchAiProviderInfo(signal(), reply(200, { provider: "  " })), { code: "INVALID_RESPONSE" });
  await assert.rejects(fetchAiProviderInfo(signal(), reply(200, { provider: "가".repeat(41) })), { code: "INVALID_RESPONSE" });
  await assert.rejects(fetchAiProviderInfo(signal(), reply(200, { provider: "X", model: 5 })), { code: "INVALID_RESPONSE" });
});

test("안내문 전송 대상 문구: 업체 이름을 알면 괄호로 넣고, 모르면 이름 없이", () => {
  assert.equal(aiTargetText("Gemini"), "외부 AI 서비스(Gemini)");
  assert.equal(aiTargetText("EXAONE"), "외부 AI 서비스(EXAONE)");
  assert.equal(aiTargetText(null), "외부 AI 서비스");
  assert.equal(aiTargetText(""), "외부 AI 서비스");
});
