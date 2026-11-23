// [C] 새 비밀번호 정하기 페이지 (/login/reset)
// 비밀번호 재설정 메일의 링크를 누르면 여기로 온다. /login/ 아래라 로그인 전에도 들어올 수 있다.
import ResetPasswordForm from "./ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <div className="flex h-dvh items-center justify-center bg-gray-100 px-4">
      <ResetPasswordForm />
    </div>
  );
}
