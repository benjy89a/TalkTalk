"use client";

// [C] 비밀번호 찾기: 이메일로 "비밀번호 재설정 링크"를 보낸다
// - 보안: 가입된 이메일인지 아닌지 화면에 드러내지 않는다 (항상 같은 안내 문구)
// - 메일의 링크를 누르면 /login/reset 으로 돌아와서 새 비밀번호를 정한다
// - 링크는 메일을 요청한 "같은 브라우저"에서 열어야 한다 (보안 확인용 값이 이 브라우저에 저장됨)
import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error } = await createClient().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/login/reset`,
      });
      if (error) {
        if (error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit") {
          setError("요청이 너무 많아요. 잠시 후 다시 시도해 주세요.");
          return;
        }
        if (error.code === "email_address_invalid" || error.code === "validation_failed") {
          setError("이메일 주소 형식을 확인해 주세요.");
          return;
        }
        // 그 밖의 에러는 가입 여부를 드러낼 수 있으므로, 성공과 같은 안내를 보여 준다
      }
      setSent(true);
    } catch {
      setError("서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-lg">
      <h1 className="mb-1 text-center text-2xl font-bold text-[#1e325c]">비밀번호 찾기</h1>
      <p className="mb-6 text-center text-sm text-gray-500">
        가입한 이메일로 비밀번호 재설정 링크를 보내 드려요
      </p>

      {sent ? (
        <div className="space-y-4">
          <p role="status" className="rounded-md bg-blue-50 px-3 py-3 text-sm text-blue-700">
            가입된 이메일이라면 재설정 링크를 보냈어요. 메일함(스팸함도)을 확인해 주세요.
            <span className="mt-1 block text-xs text-blue-600">
              링크는 지금 이 브라우저에서 열어 주세요.
            </span>
          </p>
          <button
            type="button"
            onClick={() => setSent(false)}
            className="w-full rounded-md border border-gray-300 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            다른 이메일로 다시 보내기
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">이메일</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              autoComplete="email"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#1e325c] focus:ring-2 focus:ring-[#1e325c]/20"
            />
          </label>

          {error && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-[#1e325c] py-2 text-sm font-semibold text-white hover:bg-[#2a4478] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "보내는 중…" : "재설정 링크 보내기"}
          </button>
        </form>
      )}

      <p className="mt-6 text-center text-sm text-gray-500">
        <Link href="/login" className="font-semibold text-[#1e325c] hover:underline">
          ← 로그인으로 돌아가기
        </Link>
      </p>
    </div>
  );
}
