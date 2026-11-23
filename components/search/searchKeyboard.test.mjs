import assert from "node:assert/strict";
import test from "node:test";
import { consumeSearchEscape } from "./searchKeyboard.ts";

function event(options = {}) {
  const calls = [];
  return { calls, key: "Escape", defaultPrevented: false, nativeEvent: { isComposing: false },
    preventDefault() { calls.push("preventDefault"); this.defaultPrevented = true; },
    stopPropagation() { calls.push("stopPropagation"); }, ...options };
}
test("열린 검색 패널의 Escape만 소비하고 문서 리스너 전파 차단", () => {
  const e = event();
  assert.equal(consumeSearchEscape(e, true), true);
  assert.deepEqual(e.calls, ["preventDefault", "stopPropagation"]);
  assert.equal(e.defaultPrevented, true);
});
test("패널 닫힘·다른 키·한글 조합·이미 처리한 키는 건드리지 않음", () => {
  for (const [e, open] of [[event(), false], [event({ key: "Enter" }), true],
    [event({ nativeEvent: { isComposing: true } }), true], [event({ defaultPrevented: true }), true]]) {
    assert.equal(consumeSearchEscape(e, open), false);
    assert.deepEqual(e.calls, []);
  }
});
