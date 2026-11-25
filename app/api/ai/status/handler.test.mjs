import assert from "node:assert/strict";
import test from "node:test";
import { classifySettingsError, handleStatusGet, handleStatusPost, handleStatusPut, SettingsSaveError } from "./handler.ts";

// 가짜 DB·가짜 연결 함수만 사용한다. 실제 EXAONE 호출·키 없음.
function factory({ user = { id: "u" }, isAdmin = true, rpcError = null } = {}) {
  return async () => ({
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    rpc: async (name) => { assert.equal(name, "is_app_admin"); return { data: isAdmin, error: rpcError }; },
  });
}
const req = () => new Request("http://x/api/ai/status", { method: "POST" });
const cfg = { provider: "EXAONE", model: "m", keyConfigured: true };

test("GET: 비로그인 401, 일반 계정 403, 권한 확인 오류 500", async () => {
  assert.equal((await handleStatusGet(req(), factory({ user: null }), cfg)).status, 401);
  assert.equal((await handleStatusGet(req(), factory({ isAdmin: false }), cfg)).status, 403);
  assert.equal((await handleStatusGet(req(), factory({ rpcError: { message: "x" } }), cfg)).status, 500);
});

test("GET: 관리자는 제공자·모델·설정 여부만 받고 no-store", async () => {
  const res = await handleStatusGet(req(), factory(), { ...cfg, leaked: "fake-should-not-appear" });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const body = await res.json();
  assert.deepEqual(body, { provider: "EXAONE", model: "m", keyConfigured: true });
  assert.doesNotMatch(JSON.stringify(body), /fake-should-not-appear/);
});

test("POST: 비관리자는 연결 함수를 부르지 않는다", async () => {
  let called = 0;
  const probe = async () => { called++; };
  assert.equal((await handleStatusPost(req(), factory({ user: null }), cfg, probe)).status, 401);
  assert.equal((await handleStatusPost(req(), factory({ isAdmin: false }), cfg, probe)).status, 403);
  assert.equal(called, 0);
});

test("POST: 키가 없으면 호출 없이 실패", async () => {
  let called = 0;
  const res = await handleStatusPost(req(), factory(), { ...cfg, keyConfigured: false }, async () => { called++; });
  assert.deepEqual(await res.json(), { ok: false, message: "연결에 실패했어요." });
  assert.equal(called, 0);
});

test("POST: 성공은 ok·ms, 한 번만 호출", async () => {
  let called = 0;
  const times = [1000, 1820];
  const res = await handleStatusPost(req(), factory(), cfg, async () => { called++; }, () => times.shift());
  assert.deepEqual(await res.json(), { ok: true, ms: 820 });
  assert.equal(called, 1);
});

test("POST: 실패는 업체 오류 원문 없이 고정 문구, 재시도 없음", async () => {
  let called = 0;
  const res = await handleStatusPost(req(), factory(), cfg, async () => { called++; throw new Error("vendor secret detail"); });
  const body = await res.json();
  assert.deepEqual(body, { ok: false, message: "연결에 실패했어요." });
  assert.equal(called, 1);
  assert.doesNotMatch(JSON.stringify(body), /vendor|secret/);
});

// ───────── 업체 선택(AI_PROVIDER)에 따른 상태 응답 ─────────
const LEAK_MARKER = "fake-should-not-appear";
const geminiCfg = { provider: "Gemini", providerId: "gemini", model: "gemini-3.5-flash-lite", keyEnvName: "GEMINI_API_KEY", keyConfigured: true };
const publicReq = () => new Request("http://x/api/ai/status?view=public", { method: "GET" });

test("GET(관리자): 업체 ID·키 환경변수 이름을 함께 주되 키 값·알 수 없는 필드는 담지 않음", async () => {
  const res = await handleStatusGet(req(), factory(), { ...geminiCfg, apiKey: LEAK_MARKER });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.deepEqual(body, { provider: "Gemini", providerId: "gemini", model: "gemini-3.5-flash-lite", keyEnvName: "GEMINI_API_KEY", keyConfigured: true });
  assert.doesNotMatch(JSON.stringify(body), /fake-should-not-appear/);
  // 키가 없을 때도 어떤 환경변수를 넣어야 하는지(이름)만 알려 준다
  const missing = await (await handleStatusGet(req(), factory(), { ...geminiCfg, keyConfigured: false })).json();
  assert.deepEqual(missing, { provider: "Gemini", providerId: "gemini", model: "gemini-3.5-flash-lite", keyEnvName: "GEMINI_API_KEY", keyConfigured: false });
});

test("GET ?view=public: 로그인한 일반 계정도 업체·모델 이름만 받고 키 설정 여부·키 이름은 못 봄", async () => {
  const res = await handleStatusGet(publicReq(), factory({ isAdmin: false }), { ...geminiCfg, apiKey: LEAK_MARKER });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("cache-control"), "no-store");
  const body = await res.json();
  assert.deepEqual(body, { provider: "Gemini", providerId: "gemini", model: "gemini-3.5-flash-lite" });
  assert.doesNotMatch(JSON.stringify(body), /keyConfigured|keyEnvName|GEMINI_API_KEY|fake-should-not-appear/);
});

test("GET ?view=public: 비로그인은 401, 관리자 확인(rpc)을 하지 않음", async () => {
  let rpcCalls = 0;
  const noUser = async () => ({
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
    rpc: async () => { rpcCalls += 1; return { data: true, error: null }; },
  });
  assert.equal((await handleStatusGet(publicReq(), noUser, geminiCfg)).status, 401);
  const loggedIn = async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u" } }, error: null }) },
    rpc: async () => { rpcCalls += 1; return { data: false, error: null }; },
  });
  assert.equal((await handleStatusGet(publicReq(), loggedIn, geminiCfg)).status, 200);
  assert.equal(rpcCalls, 0);
});

test("GET: view 값이 public 이 아니면(다른 값·없음) 기존처럼 관리자 전용", async () => {
  for (const url of ["http://x/api/ai/status?view=admin", "http://x/api/ai/status?view=", "http://x/api/ai/status?VIEW=public"]) {
    const res = await handleStatusGet(new Request(url), factory({ isAdmin: false }), geminiCfg);
    assert.equal(res.status, 403, url);
  }
});

test("POST: Gemini 설정도 키가 없으면 호출 없이 실패, 있으면 한 번만 호출", async () => {
  let called = 0;
  const probe = async () => { called += 1; };
  const noKey = await handleStatusPost(req(), factory(), { ...geminiCfg, keyConfigured: false }, probe);
  assert.deepEqual(await noKey.json(), { ok: false, message: "연결에 실패했어요." });
  assert.equal(called, 0);
  const ok = await handleStatusPost(req(), factory(), geminiCfg, probe, () => 100);
  assert.equal((await ok.json()).ok, true);
  assert.equal(called, 1);
});

// ───────── 관리자 업체 선택: GET 선택 상태 + PUT 저장 ─────────
const providersBoth = [
  { id: "exaone", displayName: "EXAONE", keyEnvName: "EXAONE_API_KEY", keyConfigured: true, defaultModel: "k-exaone_v2.5" },
  { id: "gemini", displayName: "Gemini", keyEnvName: "GEMINI_API_KEY", keyConfigured: true, defaultModel: "gemini-3.5-flash-lite" },
];
const selectionCfg = {
  ...geminiCfg,
  selection: { source: "settings", provider: "gemini", geminiModel: null, updatedAt: "2026-11-24T05:00:00Z", envProviderId: "exaone", settingsAvailable: true },
  providers: providersBoth,
};
const putReq = (body, raw) => new Request("http://x/api/ai/status", { method: "PUT", body: raw ?? JSON.stringify(body) });
function saveCtx(overrides = {}) {
  const calls = { save: [], invalidate: 0 };
  return {
    calls,
    ctx: {
      envProviderId: "exaone",
      providers: providersBoth,
      save: async (provider, model) => { calls.save.push([provider, model]); return { updatedAt: "2026-11-24T06:00:00Z" }; },
      invalidate: () => { calls.invalidate += 1; },
      ...overrides,
    },
  };
}

test("GET(관리자): 선택 상태(출처·DB 값·환경변수 업체)와 업체별 키 설정 여부를 주되 키 값은 없음, 공개 보기에는 없음", async () => {
  const admin = await (await handleStatusGet(req(), factory(), { ...selectionCfg, apiKey: LEAK_MARKER })).json();
  assert.deepEqual(admin.selection, selectionCfg.selection);
  assert.deepEqual(admin.providers, providersBoth);
  assert.doesNotMatch(JSON.stringify(admin), /fake-should-not-appear/);
  const publicBody = await (await handleStatusGet(publicReq(), factory({ isAdmin: false }), selectionCfg)).json();
  assert.deepEqual(publicBody, { provider: "Gemini", providerId: "gemini", model: "gemini-3.5-flash-lite" });
  assert.doesNotMatch(JSON.stringify(publicBody), /selection|providers|keyConfigured/);
});

test("PUT: 비로그인 401, 일반 계정 403이고 저장 함수를 부르지 않음", async () => {
  for (const [options, status] of [[{ user: null }, 401], [{ isAdmin: false }, 403]]) {
    const { ctx, calls } = saveCtx();
    assert.equal((await handleStatusPut(putReq({ provider: "gemini" }), factory(options), ctx)).status, status);
    assert.equal(calls.save.length, 0);
    assert.equal(calls.invalidate, 0);
  }
});

test("PUT: 잘못된 입력(JSON 아님·배열·provider 없음·모르는 필드·잘못된 업체·모델 형식)은 400, 너무 길면 413", async () => {
  const bad = [
    putReq(null, "not json"), putReq(null, "[]"), putReq(null, "null"), putReq({}), putReq({ model: "gemini-3.5-flash-lite" }),
    putReq({ provider: "openai" }), putReq({ provider: "Gemini" }), putReq({ provider: "gemini", extra: 1 }),
    putReq({ provider: "gemini", model: "a b" }), putReq({ provider: "gemini", model: "../x" }), putReq({ provider: "gemini", model: 7 }),
    putReq({ provider: "gemini", model: "x".repeat(65) }),
  ];
  for (const request of bad) {
    const { ctx, calls } = saveCtx();
    const response = await handleStatusPut(request, factory(), ctx);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "INVALID_INPUT");
    assert.equal(calls.save.length, 0);
  }
  const { ctx } = saveCtx();
  assert.equal((await handleStatusPut(putReq(null, JSON.stringify({ provider: "gemini", model: "x".repeat(2000) })), factory(), ctx)).status, 413);
});

test("PUT: 고른 업체의 키가 서버에 없으면 409로 막고 저장하지 않음(키 이름만 안내)", async () => {
  for (const [missing, provider, expected] of [["gemini", "gemini", /Gemini 키\(GEMINI_API_KEY\)/], ["exaone", "exaone", /EXAONE 키\(EXAONE_API_KEY\)/]]) {
    const { ctx, calls } = saveCtx({ providers: providersBoth.map((item) => item.id === missing ? { ...item, keyConfigured: false } : item) });
    const response = await handleStatusPut(putReq({ provider }), factory(), ctx);
    assert.equal(response.status, 409);
    const body = await response.json();
    assert.equal(body.error.code, "KEY_NOT_CONFIGURED");
    assert.match(body.error.message, expected);
    assert.match(body.error.message, /Vercel/);
    assert.equal(calls.save.length, 0);
    assert.equal(calls.invalidate, 0);
  }
  // 다른 업체의 키가 없는 것은 상관없다
  const { ctx, calls } = saveCtx({ providers: providersBoth.map((item) => item.id === "exaone" ? { ...item, keyConfigured: false } : item) });
  assert.equal((await handleStatusPut(putReq({ provider: "gemini" }), factory(), ctx)).status, 200);
  assert.deepEqual(calls.save, [["gemini", null]]);
});

test("PUT: '환경변수 따르기'(provider null)는 환경변수가 가리키는 업체의 키가 있어야 함", async () => {
  const blocked = saveCtx({ envProviderId: "gemini", providers: providersBoth.map((item) => item.id === "gemini" ? { ...item, keyConfigured: false } : item) });
  const response = await handleStatusPut(putReq({ provider: null }), factory(), blocked.ctx);
  assert.equal(response.status, 409);
  assert.match((await response.json()).error.message, /환경변수 따르기.*바꿀 수 없습니다|AI_PROVIDER.*Gemini/);
  assert.equal(blocked.calls.save.length, 0);
  const allowed = saveCtx({ envProviderId: "exaone" });
  assert.equal((await handleStatusPut(putReq({ provider: null, model: "gemini-3.8-flash" }), factory(), allowed.ctx)).status, 200);
  assert.deepEqual(allowed.calls.save, [[null, "gemini-3.8-flash"]]);
});

test("PUT 성공: 저장 함수에 업체·모델(다듬어서, 빈 값은 null)을 넘기고 캐시를 비우며 저장 결과를 돌려줌", async () => {
  const { ctx, calls } = saveCtx();
  const response = await handleStatusPut(putReq({ provider: "gemini", model: " gemini-3.8-flash " }), factory(), ctx);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { ok: true, provider: "gemini", model: "gemini-3.8-flash", updatedAt: "2026-11-24T06:00:00Z" });
  assert.deepEqual(calls.save, [["gemini", "gemini-3.8-flash"]]);
  assert.equal(calls.invalidate, 1);
  // 업체만 바꿔도 모델을 함께 보내 모델 칸이 지워지지 않게 한다(빈 문자열·공백은 null)
  for (const model of [undefined, null, "", "   "]) {
    const next = saveCtx();
    await handleStatusPut(putReq(model === undefined ? { provider: "exaone" } : { provider: "exaone", model }), factory(), next.ctx);
    assert.deepEqual(next.calls.save, [["exaone", null]], String(model));
  }
});

test("PUT: 저장 실패는 종류별 안내(007 미적용 503·권한 403·형식 400·그 밖 500)이고 DB 오류 원문·캐시 비우기 없음", async () => {
  for (const [kind, status, code] of [["not_ready", 503, "SETTINGS_NOT_READY"], ["forbidden", 403, "FORBIDDEN"], ["invalid", 400, "INVALID_INPUT"], ["failed", 500, "DATABASE_ERROR"]]) {
    const { ctx, calls } = saveCtx({ save: async () => { throw new SettingsSaveError(kind); } });
    const response = await handleStatusPut(putReq({ provider: "gemini" }), factory(), ctx);
    assert.equal(response.status, status, kind);
    assert.equal((await response.json()).error.code, code, kind);
    assert.equal(calls.invalidate, 0);
  }
  const { ctx } = saveCtx({ save: async () => { throw new Error("private DB detail"); } });
  const response = await handleStatusPut(putReq({ provider: "gemini" }), factory(), ctx);
  assert.equal(response.status, 500);
  assert.doesNotMatch(JSON.stringify(await response.json()), /private DB detail/);
  const notReady = await (await handleStatusPut(putReq({ provider: "gemini" }), factory(), saveCtx({ save: async () => { throw new SettingsSaveError("not_ready"); } }).ctx)).json();
  assert.match(notReady.error.message, /007/);
});

test("rpc 오류 분류: 함수·테이블 없음=007 미적용, 관리자 아님=권한, 형식 오류=입력, 나머지=실패(원문 버림)", () => {
  assert.equal(classifySettingsError({ code: "PGRST202", message: "Could not find the function" }).kind, "not_ready");
  assert.equal(classifySettingsError({ code: "42883", message: "function does not exist" }).kind, "not_ready");
  assert.equal(classifySettingsError({ code: "42P01", message: "relation does not exist" }).kind, "not_ready");
  assert.equal(classifySettingsError({ code: "PGRST205", message: "table not found" }).kind, "not_ready");
  assert.equal(classifySettingsError({ code: "P0001", message: "서비스 관리자만 바꿀 수 있습니다" }).kind, "forbidden");
  assert.equal(classifySettingsError({ code: "42501", message: "permission denied" }).kind, "forbidden");
  assert.equal(classifySettingsError({ code: "P0001", message: "AI 업체는 exaone 또는 gemini 만 고를 수 있습니다" }).kind, "invalid");
  assert.equal(classifySettingsError({ code: "P0001", message: "모델 이름 형식이 올바르지 않습니다" }).kind, "invalid");
  assert.equal(classifySettingsError({ code: "XX000", message: "private DB detail" }).kind, "failed");
  assert.equal(classifySettingsError(null).kind, "failed");
  assert.doesNotMatch(classifySettingsError({ code: "XX000", message: "private DB detail" }).message, /private DB detail/);
});

test("GET: 설정을 함수로 주면 권한 확인을 통과한 뒤에만 읽는다", async () => {
  let reads = 0;
  const source = async () => { reads++; return cfg; };
  assert.equal((await handleStatusGet(req(), factory({ user: null }), source)).status, 401);
  assert.equal((await handleStatusGet(req(), factory({ isAdmin: false }), source)).status, 403);
  assert.equal(reads, 0, "거절된 요청은 설정(DB)을 읽지 않는다");
  const res = await handleStatusGet(req(), factory(), source);
  assert.equal(res.status, 200);
  assert.equal(reads, 1);
  assert.deepEqual(await res.json(), { provider: "EXAONE", model: "m", keyConfigured: true });
});
