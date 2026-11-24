// 환경변수는 가짜 객체로 넘긴다. 실제 키·외부 호출·process.env 변경은 없다.
import assert from "node:assert/strict";
import test from "node:test";
import {
  EXAONE_CONFIG, GEMINI_DEFAULT_MODEL, GEMINI_URL, geminiConfig, parseProviderId, resolveAiProvider, stripCodeFence,
} from "./provider.ts";

// 실제 발급 키가 아닌 가짜 값이다.
const FAKE_KEY = "unit-test-only";
const OTHER_FAKE_KEY = "other-test-key";

test("AI_PROVIDER 가 없거나 exaone·알 수 없는 값이면 지금과 똑같이 EXAONE", () => {
  for (const value of [undefined, "", "  ", "exaone", "EXAONE", "unknown", "gemini2"]) {
    assert.equal(parseProviderId(value), "exaone", String(value));
    const provider = resolveAiProvider({ AI_PROVIDER: value, EXAONE_API_KEY: FAKE_KEY });
    assert.equal(provider.id, "exaone");
    assert.equal(provider.url, "https://api.exaone.ai/v1/chat/completions");
    assert.equal(provider.model, "k-exaone_v2.5");
    assert.equal(provider.apiKey, FAKE_KEY);
    assert.equal(provider.envKeyName, "EXAONE_API_KEY");
    assert.equal(provider.reasoningEffort, "low");
  }
  assert.deepEqual({ ...resolveAiProvider({}), apiKey: undefined }, { ...EXAONE_CONFIG, apiKey: undefined });
});

test("AI_PROVIDER=gemini 이면 Gemini 주소·모델·키(GEMINI_API_KEY)를 고르고 EXAONE 키는 쓰지 않음", () => {
  for (const value of ["gemini", "Gemini", " GEMINI "]) {
    const provider = resolveAiProvider({ AI_PROVIDER: value, GEMINI_API_KEY: FAKE_KEY, EXAONE_API_KEY: OTHER_FAKE_KEY });
    assert.equal(provider.id, "gemini");
    assert.equal(provider.displayName, "Gemini");
    assert.equal(provider.url, GEMINI_URL);
    assert.equal(provider.url, "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    assert.equal(provider.model, GEMINI_DEFAULT_MODEL);
    assert.equal(provider.apiKey, FAKE_KEY);
    assert.equal(provider.envKeyName, "GEMINI_API_KEY");
  }
  // Gemini 로 골랐는데 Gemini 키가 없으면 EXAONE 키로 대신 호출하지 않는다.
  assert.equal(resolveAiProvider({ AI_PROVIDER: "gemini", EXAONE_API_KEY: OTHER_FAKE_KEY }).apiKey, undefined);
});

test("EXAONE 으로 두면 Gemini 키·모델 설정은 무시", () => {
  const provider = resolveAiProvider({ GEMINI_API_KEY: FAKE_KEY, GEMINI_MODEL: "gemini-x" });
  assert.equal(provider.id, "exaone");
  assert.equal(provider.apiKey, undefined);
});

test("GEMINI_MODEL: 지정하면 그 모델, 없거나 형식이 이상하면 기본 모델", () => {
  assert.equal(geminiConfig({ GEMINI_MODEL: "gemini-3.8-flash" }).model, "gemini-3.8-flash");
  assert.equal(geminiConfig({ GEMINI_MODEL: "  gemini-3.6-flash  " }).model, "gemini-3.6-flash");
  assert.equal(geminiConfig({ GEMINI_MODEL: "gemini-x" + String.fromCharCode(10) }).model, "gemini-x"); // 앞뒤 공백·줄바꿈은 제거
  for (const bad of [undefined, "", "   ", "a b", "../x", "a" + String.fromCharCode(10) + "b", "x".repeat(65), "-start", "한글모델"]) {
    assert.equal(geminiConfig({ GEMINI_MODEL: bad }).model, GEMINI_DEFAULT_MODEL, String(bad));
  }
  assert.equal(GEMINI_DEFAULT_MODEL, "gemini-3.5-flash-lite");
});

test("Gemini 는 EXAONE 옵션(reasoning_effort)을 보내지 않고 JSON 코드블록을 받아 줌", () => {
  const gemini = geminiConfig({});
  assert.equal(gemini.reasoningEffort, null);
  assert.equal(gemini.acceptCodeFence, true);
  assert.equal(EXAONE_CONFIG.acceptCodeFence, false);
});

test("설정 객체에는 키 값이 들어가지 않고 키 이름만 있음", () => {
  assert.doesNotMatch(JSON.stringify(geminiConfig({ GEMINI_API_KEY: FAKE_KEY })), /unit-test-only/);
  assert.doesNotMatch(JSON.stringify(EXAONE_CONFIG), /unit-test-only/);
});

test("코드블록 벗기기: ```json 블록 하나만 안쪽을 꺼내고 그 밖은 그대로", () => {
  const json = '{"tasks":[]}';
  const fence = String.fromCharCode(96).repeat(3);
  const nl = String.fromCharCode(10);
  assert.equal(stripCodeFence(fence + "json" + nl + json + nl + fence), json);
  assert.equal(stripCodeFence(fence + nl + json + nl + fence), json);
  assert.equal(stripCodeFence("  " + fence + "JSON" + nl + json + fence + nl), json);
  assert.equal(stripCodeFence(fence + "json" + String.fromCharCode(13, 10) + json + String.fromCharCode(13, 10) + fence), json);
  // 그대로 두는 경우
  assert.equal(stripCodeFence(json), json);
  assert.equal(stripCodeFence("설명입니다 " + fence + "json" + nl + json + nl + fence), "설명입니다 " + fence + "json" + nl + json + nl + fence);
  assert.equal(stripCodeFence(fence + "json" + nl + json), fence + "json" + nl + json);
});
