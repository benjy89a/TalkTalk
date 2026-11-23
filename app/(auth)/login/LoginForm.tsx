"use client";

// [C] 이메일 로그인 / 회원가입 폼
// - 로그인: 이메일 + 비밀번호
// - 회원가입: 이름 + 이메일 + 비밀번호 → DB 트리거가 profiles 를 만들고 #general 에 자동 참여시킨다
// - 성공하면 첫 화면(/)으로 이동
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Mode = "login" | "signup";

// Supabase 가 돌려주는 영어 에러를 쉬운 한국어로 바꿔준다
function toKoreanError(code: string | undefined, message: string): string {
  switch (code) {
    case "invalid_credentials":
      return "이메일 또는 비밀번호가 맞지 않아요.";
    case "user_already_exists":
    case "email_exists":
      return "이미 가입된 이메일이에요. 로그인해 주세요.";
    case "weak_password":
      return "비밀번호가 너무 짧거나 쉬워요. 6자 이상으로 정해 주세요.";
    case "email_address_invalid":
    case "validation_failed":
      return "이메일 주소 형식을 확인해 주세요.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.";
    case "email_not_confirmed":
      return "이메일 인증이 아직 안 됐어요. 팀장에게 문의해 주세요.";
  }
  if (/fetch|network/i.test(message)) {
    return "서버에 연결하지 못했어요. 인터넷 연결이나 .env.local 설정을 확인해 주세요.";
  }
  return `문제가 생겼어요: ${message}`;
}

export default function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const isSignup = mode === "signup";

  function switchMode() {
    setMode(isSignup ? "login" : "signup");
    setError(null);
    setInfo(null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (isSignup && name.trim() === "") {
      setError("이름을 입력해 주세요.");
      return;
    }
    if (password.length < 6) {
      setError("비밀번호는 6자 이상으로 입력해 주세요.");
      return;
    }

    let supabase;
    try {
      supabase = createClient();
    } catch {
      setError(".env.local 에 Supabase 접속 정보가 없어요. 팀장에게 받은 값을 넣고 서버를 다시 켜 주세요.");
      return;
    }

    setLoading(true);
    try {
      if (isSignup) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { name: name.trim() } },
        });
        if (error) {
          setError(toKoreanError(error.code, error.message));
          return;
        }
        if (!data.session) {
          // 이메일 인증이 켜져 있으면 바로 로그인되지 않는다
          setInfo("가입 신청이 완료됐어요. 이메일 인증 후 로그인해 주세요.");
          setMode("login");
          return;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) {
          setError(toKoreanError(error.code, error.message));
          return;
        }
      }

      // 로그인 성공 → 첫 화면으로 이동하고, 서버 화면도 로그인 상태로 새로 그린다
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(toKoreanError(undefined, err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:border-[#1e325c] focus:ring-2 focus:ring-[#1e325c]/20";

  return (
    <div className="w-full max-w-sm rounded-xl bg-white p-8 shadow-lg">
      <h1 className="mb-1 text-center text-2xl font-bold text-[#1e325c]">TalkTalk</h1>
      <p className="mb-6 text-center text-sm text-gray-500">
        {isSignup ? "새 계정을 만들어요" : "사내 채팅에 로그인하세요"}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {isSignup && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-gray-700">이름</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="홍길동"
              autoComplete="name"
              maxLength={30}
              className={inputClass}
            />
          </label>
        )}

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">이메일</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@company.com"
            autoComplete="email"
            className={inputClass}
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-gray-700">비밀번호</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="6자 이상"
            autoComplete={isSignup ? "new-password" : "current-password"}
            className={inputClass}
          />
        </label>

        {error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}
        {info && (
          <p role="status" className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700">
            {info}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-md bg-[#1e325c] py-2 text-sm font-semibold text-white hover:bg-[#2a4478] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "잠시만요…" : isSignup ? "회원가입" : "로그인"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        {isSignup ? "이미 계정이 있나요?" : "처음 오셨나요?"}{" "}
        <button
          type="button"
          onClick={switchMode}
          className="font-semibold text-[#1e325c] hover:underline"
        >
          {isSignup ? "로그인" : "회원가입"}
        </button>
      </p>
      {!isSignup && (
        <p className="mt-2 text-center text-sm">
          {/* 비밀번호 찾기 (/login/forgot) — 로그인 전에도 열 수 있는 주소 */}
          <a href="/login/forgot" className="text-gray-500 hover:text-[#1e325c] hover:underline">
            비밀번호를 잊으셨나요?
          </a>
        </p>
      )}
    </div>
  );
}
