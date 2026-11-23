"use client";

// [C] 사이드바 맨 아래: 내 이름 + 로그아웃 버튼
// 사용 예: <MyProfile />  (Sidebar 의 "내 프로필 · 로그아웃" Placeholder 자리)
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import LogoutButton from "./LogoutButton";

export default function MyProfile() {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from("profiles")
          .select("name")
          .eq("id", user.id)
          .maybeSingle();
        if (!cancelled) setName(data?.name || user.email || "나");
      } catch {
        // 접속 정보가 없으면 이름 없이 버튼만 보여준다
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-white/20 text-xs font-bold">
          {name ? name.slice(0, 1) : "?"}
        </span>
        <span className="truncate text-sm">{name ?? "불러오는 중…"}</span>
      </div>
      <LogoutButton />
    </div>
  );
}
