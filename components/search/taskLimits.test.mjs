import assert from "node:assert/strict";
import test from "node:test";
import { canRetryAfterTruncation, DEFAULT_TASK_LIMIT, TASK_LIMIT_OPTIONS } from "./taskLimits.ts";

test("범위 선택지는 5·10·25개이고 기본은 10개, 서버 최대(25)를 넘지 않음", () => {
  assert.deepEqual([...TASK_LIMIT_OPTIONS], [5, 10, 25]);
  assert.equal(DEFAULT_TASK_LIMIT, 10);
  assert.ok(Math.max(...TASK_LIMIT_OPTIONS) <= 25);
  assert.ok(TASK_LIMIT_OPTIONS.includes(DEFAULT_TASK_LIMIT));
});

test("다시 시도 버튼은 할 일 추출이 잘림 오류로 실패했을 때만 보임", () => {
  assert.equal(canRetryAfterTruncation({ kind: "tasks", code: "AI_OUTPUT_TRUNCATED" }), true);
  assert.equal(canRetryAfterTruncation({ kind: "search", code: "AI_OUTPUT_TRUNCATED" }), false);
  assert.equal(canRetryAfterTruncation({ kind: "tasks", code: "AI_TIMEOUT" }), false);
  assert.equal(canRetryAfterTruncation({ kind: "tasks" }), false);
});
