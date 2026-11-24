// 모든 HTTP 는 가짜 fetch 다. 실제 서버·키·AI 호출은 없다.
import assert from "node:assert/strict";
import test from "node:test";
import { AiSettingsError, isSelectionChanged, isValidModelInput, saveAiSettings, selectionSourceText } from "./aiSettingsClient.ts";
import { fetchAiStatus } from "./aiStatusClient.ts";

const signal = () => new AbortController().signal;
const reply = (status, body) => async () => Response.json(body, { status });

test("모델 입력: 비어 있으면 괜찮고(기본 모델), 형식이 맞는 ID 만 허용", () => {
  for (const ok of ["", "   ", "gemini-3.5-flash-lite", " gemini-3.8-flash ", "a", "A1._-b"]) assert.equal(isValidModelInput(ok), true, JSON.stringify(ok));
  for (const bad of ["a b", "-x", "../x", "한글", "x".repeat(65), "a\nb", "model!"]) assert.equal(isValidModelInput(bad), false, JSON.stringify(bad));
});

test("저장된 값과 같은 선택이면 바뀌지 않음으로 봄(모델 공백 무시)", () => {
  const current = { provider: "gemini", geminiModel: "gemini-3.8-flash" };
  assert.equal(isSelectionChanged(current, { provider: "gemini", model: "gemini-3.8-flash" }), false);
  assert.equal(isSelectionChanged(current, { provider: "gemini", model: " gemini-3.8-flash " }), false);
  assert.equal(isSelectionChanged(current, { provider: "exaone", model: "gemini-3.8-flash" }), true);
  assert.equal(isSelectionChanged(current, { provider: "gemini", model: "" }), true);
  assert.equal(isSelectionChanged({ provider: null, geminiModel: null }, { provider: null, model: "" }), false);
  assert.equal(isSelectionChanged({ provider: null, geminiModel: null }, { provider: null, model: "gemini-3.8-flash" }), true);
});

test("출처 문구", () => {
  assert.equal(selectionSourceText("settings"), "관리자 설정");
  assert.equal(selectionSourceText("env"), "환경변수(AI_PROVIDER)");
});

test("저장 요청: PUT /api/ai/status 에 업체·모델만 JSON 으로 보내고(빈 모델은 null) 결과를 받음", async () => {
  const seen = [];
  const fetcher = async (url, options) => {
    seen.push([url, options.method, JSON.parse(options.body), options.credentials, options.headers["Content-Type"]]);
    return Response.json({ ok: true, provider: "gemini", model: "gemini-3.8-flash", updatedAt: "2026-11-24T06:00:00Z" });
  };
  assert.deepEqual(await saveAiSettings({ provider: "gemini", model: " gemini-3.8-flash " }, signal(), fetcher),
    { provider: "gemini", model: "gemini-3.8-flash", updatedAt: "2026-11-24T06:00:00Z" });
  await saveAiSettings({ provider: null, model: "  " }, signal(), fetcher);
  assert.deepEqual(seen[0], ["/api/ai/status", "PUT", { provider: "gemini", model: "gemini-3.8-flash" }, "same-origin", "application/json"]);
  assert.deepEqual(seen[1][2], { provider: null, model: null });
  assert.deepEqual(Object.keys(seen[0][2]).sort(), ["model", "provider"]); // 키 같은 다른 값은 보내지 않는다
});

test("저장 실패: 서버의 한국어 안내(키 없음 409·007 미적용 503·권한 403)를 그대로 보여 주고 401·형식 오류는 일반 문구", async () => {
  await assert.rejects(saveAiSettings({ provider: "gemini", model: "" }, signal(), reply(409, { error: { code: "KEY_NOT_CONFIGURED", message: "Gemini 키(GEMINI_API_KEY)가 서버에 없어 전환할 수 없습니다." } })),
    (error) => error instanceof AiSettingsError && error.code === "KEY_NOT_CONFIGURED" && /GEMINI_API_KEY/.test(error.message));
  await assert.rejects(saveAiSettings({ provider: "gemini", model: "" }, signal(), reply(503, { error: { code: "SETTINGS_NOT_READY", message: "AI 설정 테이블(007)이 아직 적용되지 않았습니다." } })), { code: "SETTINGS_NOT_READY" });
  await assert.rejects(saveAiSettings({ provider: "gemini", model: "" }, signal(), reply(403, { error: { code: "FORBIDDEN", message: "서비스 관리자만 바꿀 수 있습니다." } })), { code: "FORBIDDEN" });
  await assert.rejects(saveAiSettings({ provider: "gemini", model: "" }, signal(), reply(401, { error: {} })), { code: "UNAUTHORIZED" });
  await assert.rejects(saveAiSettings({ provider: "gemini", model: "" }, signal(), reply(500, { weird: true })), { code: "REQUEST_FAILED" });
  await assert.rejects(saveAiSettings({ provider: "gemini", model: "" }, signal(), async () => new Response("not json", { status: 502 })), { code: "REQUEST_FAILED" });
  // 너무 긴 서버 문구는 믿지 않고 일반 문구로
  await assert.rejects(saveAiSettings({ provider: "gemini", model: "" }, signal(), reply(409, { error: { code: "X", message: "가".repeat(301) } })), { code: "REQUEST_FAILED" });
});

test("저장 응답 형식이 이상하면 오류, 취소 신호면 요청하지 않음", async () => {
  for (const body of [{ ok: false }, { ok: true, provider: "openai", model: null, updatedAt: null }, { ok: true, provider: "gemini", model: 5, updatedAt: null }, null]) {
    await assert.rejects(saveAiSettings({ provider: "gemini", model: "" }, signal(), reply(200, body)), { code: "INVALID_RESPONSE" });
  }
  const controller = new AbortController();
  controller.abort();
  let called = 0;
  await assert.rejects(saveAiSettings({ provider: "gemini", model: "" }, controller.signal, async () => { called += 1; return Response.json({}); }));
  assert.equal(called, 0);
});

// ───────── 관리자 상태 응답의 선택 정보 파싱 ─────────
const selection = { source: "settings", provider: "gemini", geminiModel: null, updatedAt: "2026-11-24T05:00:00Z", envProviderId: "exaone", settingsAvailable: true };
const providers = [
  { id: "exaone", displayName: "EXAONE", keyEnvName: "EXAONE_API_KEY", keyConfigured: true, defaultModel: "k-exaone_v2.5" },
  { id: "gemini", displayName: "Gemini", keyEnvName: "GEMINI_API_KEY", keyConfigured: false, defaultModel: "gemini-3.5-flash-lite" },
];

test("상태: 선택 상태와 업체별 키 설정 여부를 함께 받고, 없으면 이전 응답 모양 그대로", async () => {
  const full = await fetchAiStatus(signal(), reply(200, { provider: "Gemini", providerId: "gemini", model: "gemini-3.5-flash-lite", keyEnvName: "GEMINI_API_KEY", keyConfigured: true, selection, providers }));
  assert.deepEqual(full.selection, selection);
  assert.deepEqual(full.providers, providers);
  const plain = await fetchAiStatus(signal(), reply(200, { provider: "EXAONE", keyConfigured: true }));
  assert.equal("selection" in plain, false);
  assert.equal("providers" in plain, false);
});

test("상태: 선택 상태·업체 목록의 모양이 이상하면 형식 오류", async () => {
  const base = { provider: "Gemini", keyConfigured: true };
  for (const bad of [
    { selection: { ...selection, source: "db" } }, { selection: { ...selection, provider: "openai" } }, { selection: { ...selection, envProviderId: null } },
    { selection: { ...selection, geminiModel: 3 } }, { selection: { ...selection, settingsAvailable: "yes" } }, { selection: "x" }, { selection: null },
    { providers: "x" }, { providers: [{ ...providers[0], keyConfigured: "yes" }] }, { providers: [{ ...providers[0], id: "other" }] }, { providers: Array(5).fill(providers[0]) },
  ]) {
    await assert.rejects(fetchAiStatus(signal(), reply(200, { ...base, ...bad })), { code: "INVALID_RESPONSE" }, JSON.stringify(bad).slice(0, 40));
  }
});
