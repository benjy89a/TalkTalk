"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { formatAiElapsed, type AiRequest, type AiRequestGate } from "./aiRequestGate";

const emptySnapshot = () => null;
export function useAiRequest(gate: AiRequestGate) {
  return useSyncExternalStore(gate.subscribe, gate.getSnapshot, emptySnapshot);
}

const labels = { summary: "대화 요약", search: "AI 검색", tasks: "할 일 추출", probe: "연결 테스트" };

// 사용 예: <AiRequestProgress request={진행중요청} onCancel={() => gate.cancel()} background={!open} />
export default function AiRequestProgress({ request, onCancel, background = false }: {
  request: AiRequest;
  onCancel: () => void;
  background?: boolean;
}) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [request]);
  const label = labels[request.kind];
  return (
    <div aria-label="AI 실행 상태" className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-600">
      <span role="status">{label} 진행 중{background ? " · 패널 닫힘" : ""}</span>
      <span role="timer" aria-live="off">{formatAiElapsed(request.startedAt, now)} 경과 · AI 대기 최대 4분</span>
      <button type="button" onClick={onCancel} aria-label={`${label} 취소`}
        className="min-h-9 rounded-md border border-gray-300 bg-white px-2 hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-[#1e325c]">취소</button>
    </div>
  );
}
