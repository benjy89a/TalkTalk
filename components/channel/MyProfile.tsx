"use client";

// [C] 사이드바 맨 아래: 내 이름 + ⚙️ 내 정보 변경 + 로그아웃 버튼
// 사용 예: <MyProfile />  (Sidebar 의 "내 프로필 · 로그아웃" Placeholder 자리)
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import AccountSettings, { AccountDialog } from "./AccountSettings";
import LogoutButton from "./LogoutButton";
import PasswordReminder from "./PasswordReminder";

// 로그인 화면 "이메일 기억하기"가 쓰는 저장 이름 (LoginForm 과 같은 값)
const REMEMBER_EMAIL_KEY = "talktalk:remembered-email";

// 이메일을 바꾼 뒤(확인 메일 링크까지 누른 뒤) 기억해 둔 옛 이메일을 새 이메일로 맞춘다
function syncRememberedEmail(email: string | undefined) {
  if (!email) return;
  try {
    const saved = localStorage.getItem(REMEMBER_EMAIL_KEY);
    if (saved && saved !== email) localStorage.setItem(REMEMBER_EMAIL_KEY, email);
  } catch {
    // 저장소를 못 쓰면 그냥 넘어간다
  }
}

export default function MyProfile() {
  const [name, setName] = useState<string | null>(null);
  // 60일 안내에서 "지금 바꾸기"를 누르면 비밀번호 칸을 펼친 내 정보 창을 연다
  const [pwDialogOpen, setPwDialogOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        syncRememberedEmail(user.email);
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
      <div className="flex shrink-0 items-center gap-1">
        <AccountSettings onNameChanged={setName} />
        <LogoutButton />
      </div>
      <PasswordReminder onChangeNow={() => setPwDialogOpen(true)} />
      {pwDialogOpen && (
        <AccountDialog
          initialSection="password"
          onNameChanged={setName}
          onClose={() => setPwDialogOpen(false)}
        />
      )}
    </div>
  );
}
