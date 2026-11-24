// AI 도구 패널의 버튼 모양. DevelopDoc/DESIGN_GUIDE.md 6절(기본·보조 버튼)과 같은 남색(#1e325c)을 쓴다.
// 실행 버튼(대화 요약·AI 검색·할 일 추출)은 모두 같은 너비로 맞춰 줄마다 오른쪽 끝에 나란히 놓는다.

const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e325c] focus-visible:ring-offset-2";

/** 주요 동작: 대화 요약·AI 검색·할 일 추출 (앱의 전송·검색 버튼과 같은 남색 채움) */
export const aiPrimaryButton =
  `inline-flex min-h-9 w-28 shrink-0 items-center justify-center rounded-md bg-[#1e325c] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#172746] ${focusRing} disabled:pointer-events-none disabled:opacity-50`;

/** 보조 동작: 결과 지우기·다시 시도 등 */
export const aiSecondaryButton =
  `inline-flex min-h-9 items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 ${focusRing} disabled:pointer-events-none disabled:opacity-50`;

/** 패널을 여는 "AI 도구" 버튼: 닫혀 있으면 남색 테두리, 열려 있으면 남색 채움 */
export function aiTriggerButton(open: boolean): string {
  const base = `inline-flex min-h-9 items-center gap-1 rounded-md border border-[#1e325c] px-3 py-1 text-sm font-medium transition-colors ${focusRing}`;
  return open
    ? `${base} bg-[#1e325c] text-white hover:bg-[#172746]`
    : `${base} bg-white text-[#1e325c] hover:bg-[#1e325c]/10`;
}
