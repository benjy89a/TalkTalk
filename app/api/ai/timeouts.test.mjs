// 외부 AI/DB 호출 없이 모든 AI 경로의 대기 예산·배포 한도 배선을 고정한다.
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { SUMMARY_TIMEOUT_MS } from "./summarize/handler.ts";
import { SEARCH_TIMEOUT_MS, EXTRACT_TIMEOUT_MS } from "./extra.ts";

test("모든 AI 생성 기본 대기는 240초", () => {
  assert.deepEqual([SUMMARY_TIMEOUT_MS, SEARCH_TIMEOUT_MS, EXTRACT_TIMEOUT_MS], [240000, 240000, 240000]);
});

test("4개 route는 300초 실행 한도·기본 AI 대기 사용 (실제 route import/호출 없음)", async () => {
  for (const name of ["summarize", "search", "tasks", "status"]) {
    const source = await readFile(new URL(`./${name}/route.ts`, import.meta.url), "utf8");
    assert.match(source, /export const maxDuration = 300\s*;/, name);
    assert.doesNotMatch(source, /timeoutMs\s*:/, `${name}: 기본값보다 짧은 개별 설정 금지`);
  }
  const status = await readFile(new URL("./status/route.ts", import.meta.url), "utf8");
  assert.match(status, /createExaoneSummary\(/, "관리자 probe도 요약 기본 대기 240초 사용");
});
