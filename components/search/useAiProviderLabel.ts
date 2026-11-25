"use client";
// 안내 문구("외부 AI 서비스(Gemini)로 전송됩니다")와 "✨ AI 도구 (모델명)" 버튼에 실제 업체·모델 이름을 넣기 위한 훅.
// 서버 환경변수 AI_PROVIDER 로 업체를 고르므로 화면은 /api/ai/status?view=public 에서 이름만 받아 온다(키 정보 없음).
// 한 번만 받아 모든 안내문이 같이 쓴다. 받기 전이거나 실패하면 이름 없이 "외부 AI 서비스" / "AI 도구"로 보여 준다.
import { useEffect, useState } from "react";
import { fetchAiProviderInfo, type AiProviderInfo } from "./aiStatusClient";
export { aiTargetText } from "./aiStatusClient";

let cached: Promise<AiProviderInfo | null> | null = null;

function loadInfo(): Promise<AiProviderInfo | null> {
  // 실패해도 다음 화면 로드에서 다시 시도할 수 있게 캐시를 비운다(자동 재시도는 하지 않는다).
  cached ??= fetchAiProviderInfo(new AbortController().signal)
    .catch(() => { cached = null; return null; });
  return cached;
}

/**
 * 받아 둔 업체·모델 이름을 버린다. 관리자가 설정을 저장한 뒤 부르면,
 * 채팅 화면으로 돌아왔을 때(페이지 새로고침 없이 화면만 바뀌어도) 새 이름을 다시 받아 온다.
 */
export function resetAiProviderInfo() {
  cached = null;
}

/** 지금 서버가 쓰는 AI 업체·모델 (받기 전·실패 시 null) */
export function useAiProviderInfo(): AiProviderInfo | null {
  const [info, setInfo] = useState<AiProviderInfo | null>(null);
  useEffect(() => {
    let alive = true;
    void loadInfo().then((value) => { if (alive) setInfo(value); });
    return () => { alive = false; };
  }, []);
  return info;
}

/** 업체 이름만 (EXAONE · Gemini) */
export function useAiProviderLabel(): string | null {
  return useAiProviderInfo()?.provider ?? null;
}
