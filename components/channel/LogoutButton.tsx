"use client";

// [C] 로그아웃 버튼
// 사용 예: <LogoutButton />  (사이드바 아래 "내 프로필 · 로그아웃" 칸에 넣기)
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LogoutButton({ className = "" }: { className?: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      await createClient().auth.signOut();
    } catch {
      // 접속 정보가 없거나 네트워크 문제여도 로그인 화면으로는 보낸다
    }
    router.replace("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className={`rounded px-2 py-1 text-xs text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-50 ${className}`}
    >
      {loading ? "나가는 중…" : "로그아웃"}
    </button>
  );
}
