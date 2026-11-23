// 관리자 페이지 규칙 모음 (D) — DB·화면 없이 글자만 다루는 함수들 (테스트: adminRules.test.mjs)

/** 채널 이름 최대 길이 (채널 만들기 화면과 같게) */
export const MAX_CHANNEL_NAME = 30;

/** 기본 채널: 이름 변경·삭제 불가 (DB 도 막음) */
export const GENERAL_CHANNEL = "general";

/** 채널 이름 검사. 문제가 있으면 안내 문장, 없으면 null */
export function validateChannelName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === "") return "채널 이름을 입력해 주세요.";
  if (trimmed.length > MAX_CHANNEL_NAME) return `채널 이름은 ${MAX_CHANNEL_NAME}자 이하로 정해 주세요.`;
  if (trimmed.toLowerCase() === GENERAL_CHANNEL) return "general 은 기본 채널 이름이라 쓸 수 없어요.";
  return null;
}

/** 이름·이메일 검색 (대소문자·앞뒤 공백 무시) */
export function filterUsers<T extends { name: string; email: string }>(users: T[], query: string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return users;
  return users.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
}

/** 가입일·생성일 표시: "2026. 11. 23." */
export function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "-" : d.toLocaleDateString("ko-KR");
}

/** 화면에 보여줄 오류 문장 (DB 오류 원문은 보여주지 않는다) */
export function friendlyError(error: { code?: string } | null | undefined, fallback: string): string {
  if (error?.code === "23505") return "이미 있는 채널 이름이에요.";
  return fallback;
}
