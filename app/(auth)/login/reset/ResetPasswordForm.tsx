"use client";

// [C] 새 비밀번호 정하기
// 1) 메일 링크로 들어오면 주소에 일회용 코드가 붙어 있다 → Supabase 가 확인하고 잠깐 로그인시켜 준다
// 2) 확인이 되면 새 비밀번호(두 번 입력)를 받아 바꾼다 → 첫 화면으로 이동
// 링크가 만료됐거나, 다른 브라우저에서 열었거나, 이미 쓴 링크면 "다시 요청" 안내를 보여 준다
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Status = "checking" | "ready" | "invalid";

export default function ResetPasswordForm() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function verifyLink() {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      // 만료 등으로 Supabase 가 에러를 붙여 돌려보낸 경우
      if (params.get("error") || window.location.hash.includes("error")) {
        if (!cancelled) setStatus("invalid");
        return;
      }

      try {
        const supabase = createClient();
        // 브라우저 클라이언트가 주소의 코드를 자동으로 확인한다. getSession 은 그 확인이 끝날 때까지 기다린다.
        let {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session && code) {
          const res = await supabase.auth.exchangeCodeForSession(code);
          session = res.data.session;
        }
        if (cancelled) return;
        if (session) {
          // 주소창에서 일회용 코드를 지운다 (새로고침·공유 시 노출 방지)
          window.history.replaceState(null, "", "/login/reset");
          setStatus("ready");
        } else {
          setStatus("invalid");
        }
      } catch {
        if (!cancelled) setStatus("invalid");
      }
    }

    void verifyLink();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("비밀번호는 6자 이상으로 입력해 주세요.");
      return;
    }
    if (password !== confirm) {
      setError("두 비밀번호가 서로 달라요. 다시 확인해 주세요.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await createClient().auth.updateUser({ password });
      if (error) {
        if (error.code === "same_password") {
          setError("지금 쓰는 비밀번호와 다른 비밀번호로 정해 주세요.");
        } else if (error.code === "weak_password") {
          setError("비밀번호가 너무 쉬워요. 더 길고 어렵게 정해 주세요.");
        } else if (error.code === "session_expired" || error.code === "session_not_found") {
          setStatus("invalid");
        } else {
          setError(`문제가 생겼어요: ${error.message}`);
        }
        return;
      }
      // 성공 → 새 비밀번호로 로그인된 상태로 첫 화면으로
      router.replace("/");
      router.refresh();
    } catch {
      setError("서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#1e325c] focus:ring-2 focus:ring-[#1e325c]/20";

  return (
    <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-lg">
      <h1 className="mb-1 text-center text-2xl font-bold text-[#1e325c]">새 비밀번호 정하기</h1>

      {status === "checking" && (
        <p role="status" className="mt-6 text-center text-sm text-gray-600">
          링크를 확인하는 중이에요…
        </p>
      )}

      {status === "invalid" && (
        <div className="mt-6 space-y-4">
          <p role="alert" className="rounded-md bg-red-50 px-3 py-3 text-sm text-red-600">
            링크가 만료됐거나 올바르지 않아요. 비밀번호 찾기를 다시 요청해 주세요.
            <span className="mt-1 block text-xs">
              (메일을 요청한 브라우저와 같은 브라우저에서 링크를 열어야 해요.)
            </span>
          </p>
          <Link
            href="/login/forgot"
            className="block w-full rounded-md bg-[#1e325c] py-2 text-center text-sm font-semibold text-white hover:bg-[#2a4478]"
          >
            다시 요청하기
          </Link>
        </div>
      )}

      {status === "ready" && (
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">새 비밀번호</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="6자 이상"
              autoComplete="new-password"
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">새 비밀번호 확인</span>
            <input
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="한 번 더 입력"
              autoComplete="new-password"
              className={inputClass}
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
            {loading ? "바꾸는 중…" : "비밀번호 바꾸기"}
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
