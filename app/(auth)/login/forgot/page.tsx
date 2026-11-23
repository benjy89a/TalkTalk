// [C] 비밀번호 찾기 페이지 (/login/forgot)
// /login/ 아래에 두어서, 로그인 안 한 사람도 들어올 수 있다 (proxy 규칙)
import ForgotPasswordForm from "./ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <div className="flex h-dvh items-center justify-center bg-gray-100 px-4">
      <ForgotPasswordForm />
    </div>
  );
}
