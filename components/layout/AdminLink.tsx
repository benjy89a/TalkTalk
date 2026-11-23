"use client";
// 서비스 관리자에게만 사이드바 위쪽에 "관리자" 링크를 보여준다.
// 숨기는 건 편의일 뿐, 실제로 막는 건 /admin 페이지와 DB 함수다.
import Link from "next/link";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function AdminLink() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let alive = true;
    createClient()
      .rpc("is_app_admin")
      .then(({ data }) => {
        if (alive) setIsAdmin(data === true);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (!isAdmin) return null;
  return (
    <Link
      href="/admin"
      className="rounded px-2 py-0.5 text-xs font-normal text-white/70 hover:bg-white/10 hover:text-white"
    >
      ⚙ 관리자
    </Link>
  );
}
