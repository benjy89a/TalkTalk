// DB·로그인은 모두 가짜다. 실제 Supabase·외부 호출·키는 없다.
import assert from "node:assert/strict";
import test from "node:test";
import { AI_SETTINGS_CACHE_MS, invalidateAiSettingsCache, loadAiSettings, overrideOf } from "./aiSettings.ts";

/** ai_settings 한 줄을 돌려주는 가짜 클라이언트 공장. 호출 횟수를 센다. */
function factory(result, counter = { reads: 0, tables: [] }) {
  const create = async () => ({
    from(table) {
      counter.tables.push(table);
      const query = { select: () => query, maybeSingle: async () => { counter.reads += 1; return typeof result === "function" ? result() : result; } };
      return query;
    },
  });
  return { create, counter };
}
const row = (provider, model = null, at = "2026-11-24T05:00:00Z") => ({ data: { ai_provider: provider, gemini_model: model, updated_at: at }, error: null });

test.beforeEach(() => invalidateAiSettingsCache());

test("설정 한 줄을 읽어 업체·모델·시각으로 돌려주고 ai_settings 테이블만 읽음", async () => {
  const { create, counter } = factory(row("gemini", "gemini-3.8-flash"));
  const state = await loadAiSettings(create);
  assert.deepEqual(state, { ok: true, override: { provider: "gemini", geminiModel: "gemini-3.8-flash" }, updatedAt: "2026-11-24T05:00:00Z" });
  assert.deepEqual(counter.tables, ["ai_settings"]);
  assert.deepEqual(overrideOf(state), { provider: "gemini", geminiModel: "gemini-3.8-flash" });
});

test("업체가 null 이면 환경변수 따르기(provider null), 모델이 비어 있으면 null", async () => {
  const { create } = factory(row(null, "  "));
  const state = await loadAiSettings(create);
  assert.deepEqual(overrideOf(state), { provider: null, geminiModel: null });
});

test("알 수 없는 업체 값은 환경변수 따르기로 거른다(DB 제약 밖의 값이 와도 안전)", async () => {
  for (const bad of ["openai", "", "GEMINI", 5, {}]) {
    invalidateAiSettingsCache();
    const { create } = factory(row(bad));
    assert.equal(overrideOf(await loadAiSettings(create)).provider, null, String(bad));
  }
});

test("읽은 값은 10초 동안 캐시하고 그 뒤에는 다시 읽음", async () => {
  const { create, counter } = factory(row("exaone"));
  let clock = 1_000;
  const now = () => clock;
  await loadAiSettings(create, { now });
  await loadAiSettings(create, { now });
  assert.equal(counter.reads, 1);
  clock += AI_SETTINGS_CACHE_MS - 1;
  await loadAiSettings(create, { now });
  assert.equal(counter.reads, 1);
  clock += 1;
  await loadAiSettings(create, { now });
  assert.equal(counter.reads, 2);
});

test("fresh 이면 캐시를 쓰지 않고 바로 읽고, 저장 뒤 캐시 비우기(invalidate)도 동작", async () => {
  const { create, counter } = factory(row("gemini"));
  await loadAiSettings(create);
  await loadAiSettings(create, { fresh: true });
  assert.equal(counter.reads, 2);
  await loadAiSettings(create); // fresh 로 읽은 값이 캐시됨
  assert.equal(counter.reads, 2);
  invalidateAiSettingsCache();
  await loadAiSettings(create);
  assert.equal(counter.reads, 3);
});

test("못 읽으면(오류·빈 결과·예외) ok:false 로 환경변수 사용, 실패는 캐시하지 않음(로그인 전 요청이 다음 사용자를 오염시키지 않음)", async () => {
  for (const result of [
    { data: null, error: { message: "relation does not exist" } },
    { data: null, error: null }, // RLS 로 로그인 전 요청은 빈 결과
    () => { throw new Error("network down"); },
  ]) {
    invalidateAiSettingsCache();
    const { create, counter } = factory(result);
    const first = await loadAiSettings(create);
    assert.deepEqual(first, { ok: false });
    assert.equal(overrideOf(first), null);
    await loadAiSettings(create);
    assert.equal(counter.reads, 2, "실패는 다시 읽는다");
  }
  // 클라이언트 생성 자체가 실패해도 예외를 밖으로 내지 않는다
  assert.deepEqual(await loadAiSettings(async () => { throw new Error("no cookies"); }), { ok: false });
  // 실패 다음에 성공하면 그 값을 쓴다
  const { create } = factory(row("gemini"));
  assert.equal(overrideOf(await loadAiSettings(create)).provider, "gemini");
});

test("오류 원문·키 같은 값은 상태에 담기지 않음", async () => {
  const { create } = factory({ data: { ai_provider: "gemini", gemini_model: null, updated_at: "2026-11-24T05:00:00Z", secret_extra: "should-not-appear" }, error: null });
  const state = await loadAiSettings(create);
  assert.doesNotMatch(JSON.stringify(state), /should-not-appear|secret_extra/);
});
