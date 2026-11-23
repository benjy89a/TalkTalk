"use client";
// [B] 지금 로그인한 사람의 id (내 메시지를 오른쪽에 보여주기 위해)
// getSession 은 브라우저에 저장된 로그인 정보를 읽으므로 서버 왕복이 없다
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function useCurrentUserId() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
    // 로그아웃·다른 계정 로그인 시 바로 반영
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return userId;
}
