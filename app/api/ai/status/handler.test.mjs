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
