// [C] 60일마다 비밀번호 변경 안내 — 날짜 계산 공통 함수
// 날짜는 Supabase 계정의 user_metadata 에 저장한다 (다른 컴퓨터에서 로그인해도 같게 적용)
//   password_changed_at : 마지막으로 비밀번호를 바꾼 날
//   password_remind_at  : 다음에 안내 팝업을 띄울 날 ("60일 뒤에 바꾸기"를 누르면 미뤄짐)
// 안내는 편의 기능일 뿐 보안 검사가 아니다 (사용자가 날짜를 바꿔도 위험하지 않음)
import type { User } from "@supabase/supabase-js";

export const PASSWORD_REMIND_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(from: Date, days: number): string {
  return new Date(from.getTime() + days * DAY_MS).toISOString();
}

// 다음 안내 날짜 (지금부터 60일 뒤)
export function nextRemindAt(from = new Date()): string {
  return addDays(from, PASSWORD_REMIND_DAYS);
}

// 비밀번호를 바꿨을 때 함께 저장할 값: updateUser({ password, data: passwordChangedMeta() })
export function passwordChangedMeta(now = new Date()) {
  return { password_changed_at: now.toISOString(), password_remind_at: nextRemindAt(now) };
}

// 지금 안내 팝업을 띄워야 하는가?
// 저장된 안내 날짜가 없으면 "가입한 날 + 60일"을 기준으로 한다
export function shouldRemindPassword(user: Pick<User, "created_at" | "user_metadata">, now = new Date()): boolean {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const remindAt =
    typeof meta.password_remind_at === "string"
      ? meta.password_remind_at
      : addDays(
          new Date(typeof meta.password_changed_at === "string" ? meta.password_changed_at : user.created_at),
          PASSWORD_REMIND_DAYS,
        );
  const t = Date.parse(remindAt);
  return Number.isFinite(t) && now.getTime() >= t;
}
