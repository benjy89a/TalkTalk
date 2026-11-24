"use client";
// 안내 문구("외부 AI 서비스(Gemini)로 전송됩니다")에 실제 업체 이름을 넣기 위한 훅.
// 서버 환경변수 AI_PROVIDER 로 업체를 고르므로 화면은 /api/ai/status?view=public 에서 이름만 받아 온다(키 정보 없음).
// 한 번만 받아 모든 안내문이 같이 쓴다. 받기 전이거나 실패하면 업체 이름 없이 "외부 AI 서비스"로 보여 준다.
import { useEffect, useState } from "react";
import { fetchAiProviderInfo } from "./aiStatusClient";
export { aiTargetText } from "./aiStatusClient";

let cached: Promise<string | null> | null = null;

function loadLabel(): Promise<string | null> {
  // 실패해도 다음 화면 로드에서 다시 시도할 수 있게 캐시를 비운다(자동 재시도는 하지 않는다).
  cached ??= fetchAiProviderInfo(new AbortController().signal)
    .then((info) => info.provider)
    .catch(() => { cached = null; return null; });
  return cached;
}

export function useAiProviderLabel(): string | null {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void loadLabel().then((value) => { if (alive) setLabel(value); });
    return () => { alive = false; };
  }, []);
  return label;
}
