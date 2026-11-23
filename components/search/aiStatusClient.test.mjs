import assert from "node:assert/strict";
import test from "node:test";
import { fetchAiStatus, requestAiProbe } from "./aiStatusClient.ts";

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
