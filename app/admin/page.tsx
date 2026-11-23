// [A] 관리자 페이지 (/admin) — 서비스 관리자(app_admins)만 들어올 수 있다.
// 로그인 안 했으면 proxy.ts 가 /login 으로, 관리자가 아니면 여기서 / 로 돌려보낸다.
// 각 탭 안의 내용은 slots.tsx 에서 담당자 컴포넌트를 끼운다.
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import AdminTabs from "./AdminTabs";

export default function AdminPage() {
  return (
    <div className="flex min-h-dvh flex-col bg-gray-50">
      <header className="flex h-12 items-center justify-between bg-[#1e325c] px-4 text-white">
        <h1 className="font-bold">TalkTalk 관리자</h1>
        <Link href="/" className="text-sm text-white/80 hover:text-white">
          ← 채팅으로 돌아가기
        </Link>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 p-4">
        <Suspense fallback={<p className="text-sm text-gray-500">권한 확인 중…</p>}>
          <AdminGate />
        </Suspense>
      </main>
    </div>
  );
}

// 로그인 정보(cookies)를 읽으므로 Suspense 안에서만 쓴다.
async function AdminGate() {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_app_admin");
  if (!isAdmin) redirect("/");

  return <AdminTabs />;
}
