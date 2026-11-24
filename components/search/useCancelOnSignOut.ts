"use client";
// 로그아웃(또는 다른 계정으로 바뀜)일 때만 onSignOut 을 부른다.
// 탭 복귀 때 오는 같은 계정의 SIGNED_IN 은 무시하므로, 실행 중인 AI 요청이 끊기지 않는다.
import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { shouldCancelOnAuthChange } from "./authCancel";

export function useCancelOnSignOut(onSignOut: () => void) {
  // 구독을 다시 만들지 않도록 최신 함수만 ref 로 들고 있는다.
  const callbackRef = useRef(onSignOut);
  useEffect(() => {
    callbackRef.current = onSignOut;
  });

  useEffect(() => {
    let userId: string | null | undefined; // 첫 신호(INITIAL_SESSION) 전에는 모름
    try {
      const { data } = createClient().auth.onAuthStateChange((event, session) => {
        const nextUserId = session?.user?.id ?? null;
        if (shouldCancelOnAuthChange(event, userId, nextUserId)) callbackRef.current();
        userId = nextUserId;
      });
      return () => data.subscription.unsubscribe();
    } catch {
      // 환경변수가 없으면 구독하지 않는다. 실제 요청에서 서버 설정 오류를 안내한다.
    }
  }, []);
}
