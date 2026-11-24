import assert from "node:assert/strict";
import test from "node:test";
import { createAiRequestGate, formatAiElapsed } from "./aiRequestGate.ts";

test("같은 이벤트 안에서도 요약·검색·추출·연결 테스트는 하나만 시작", () => {
  const gate = createAiRequestGate(() => 1000);
  for (const kind of ["summary", "search", "tasks", "probe"]) {
    const request = gate.start(kind);
    assert.equal(request.kind, kind);
    assert.equal(request.startedAt, 1000);
    assert.equal(request.controller.signal.aborted, false);
    for (const other of ["summary", "search", "tasks", "probe"]) assert.equal(gate.start(other), null);
    gate.finish(request);
    assert.equal(gate.getSnapshot(), null);
  }
});

test("취소는 신호·소유자 상태를 정리하고 즉시 다음 요청을 허용", () => {
  const gate = createAiRequestGate();
  let reset = 0;
  const old = gate.start("summary", () => reset++);
  gate.cancel();
  assert.equal(old.controller.signal.aborted, true);
  assert.equal(reset, 1);
  const current = gate.start("search");
  gate.finish(old);
  gate.cancel(old);
  assert.equal(gate.getSnapshot(), current);
  assert.equal(current.controller.signal.aborted, false);
  gate.cancel();
  gate.cancel();
  assert.equal(reset, 1);
});

test("완료는 취소 신호를 보내지 않고 구독/안정된 snapshot을 갱신", () => {
  const gate = createAiRequestGate();
  let updates = 0;
  const unsubscribe = gate.subscribe(() => updates++);
  const request = gate.start("tasks");
  assert.equal(gate.getSnapshot(), request);
  assert.equal(gate.getSnapshot(), gate.getSnapshot());
  gate.finish(request);
  gate.finish(request);
  assert.equal(request.controller.signal.aborted, false);
  assert.equal(updates, 2);
  unsubscribe();
  gate.start("probe");
  assert.equal(updates, 2);
});

test("채널/화면 해제 정리는 요청만 중단하고 해제된 소유자의 setState는 호출하지 않음", () => {
  const gate = createAiRequestGate();
  let reset = 0;
  const request = gate.start("summary", () => reset++);
  gate.dispose();
  assert.equal(request.controller.signal.aborted, true);
  assert.equal(gate.getSnapshot(), null);
  assert.equal(reset, 0);
  // React StrictMode의 effect 정리/재연결 뒤에도 재사용 가능.
  assert.ok(gate.start("tasks"));
});

test("경과 시간은 시계 역행·분 경계·4분 초과에도 가짜 퍼센트 없이 표시", () => {
  for (const [ms, expected] of [[-1000, "0:00"], [0, "0:00"], [59000, "0:59"], [60000, "1:00"], [240000, "4:00"], [301000, "5:01"]]) {
    assert.equal(formatAiElapsed(1000, 1000 + ms), expected);
  }
});
