import assert from "node:assert/strict";
import test from "node:test";
import { handleStatusGet, handleStatusPost } from "./handler.ts";

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
