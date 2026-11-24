// AI 요청을 로그인 상태 변화 때 취소할지 판단하는 규칙 (React·Supabase 없이 테스트할 수 있게 분리).
//
// Supabase는 다른 탭에 갔다가 돌아오면 로그인 상태를 다시 확인하면서 **같은 계정**인데도
// SIGNED_IN 신호를 다시 보낸다. 이 신호로 취소하면 탭만 바꿔도 AI 요약·검색·할 일 추출이 끊긴다.
// 그래서 로그아웃(SIGNED_OUT)과, 다른 계정으로 바뀐 경우(= 이전 계정이 로그아웃된 것)에만 취소한다.

/**
 * @param event          Supabase onAuthStateChange 의 신호 이름
 * @param previousUserId 직전까지 로그인해 있던 사용자 id (아직 모르면 undefined, 로그아웃 상태면 null)
 * @param nextUserId     이번 신호의 사용자 id (로그아웃이면 null)
 */
export function shouldCancelOnAuthChange(
  event: string,
  previousUserId: string | null | undefined,
  nextUserId: string | null,
): boolean {
  if (event === "SIGNED_OUT") return true;
  if (event !== "SIGNED_IN") return false; // TOKEN_REFRESHED·USER_UPDATED·INITIAL_SESSION 등은 유지
  // 같은 계정의 SIGNED_IN(탭 복귀)은 유지하고, 다른 계정으로 바뀐 경우만 취소한다.
  return Boolean(previousUserId && nextUserId && previousUserId !== nextUserId);
}
