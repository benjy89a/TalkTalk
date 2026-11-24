// 할 일 추출 범위(최근 N개 메시지)와 "응답이 중간에 끝났을 때" 다시 시도 규칙.
// 실측(2026-11-24): 입력이 작아도 AI가 생각에 쓰는 토큰이 매번 달라 3회 중 2회가 잘렸다. 대화 길이가 주원인이 아니므로
// 잘렸을 때는 범위를 줄이라고 안내하지 않고 같은 범위로 다시 시도할 수 있게 한다(결과가 매번 다르다).
// 서버 한도(app/api/ai/extra.ts 의 EXTRACT_MAX_MESSAGES = 25)를 넘지 않게 25개까지만 둔다.

export const TASK_LIMIT_OPTIONS = [5, 10, 25] as const;
export const DEFAULT_TASK_LIMIT = 10;
export const TRUNCATED_CODE = "AI_OUTPUT_TRUNCATED";

/** "다시 시도" 버튼을 보일지: 할 일 추출이 응답 잘림으로 실패했을 때만. */
export function canRetryAfterTruncation(error: { kind: string; code?: string }): boolean {
  return error.kind === "tasks" && error.code === TRUNCATED_CODE;
}
