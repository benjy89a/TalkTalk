"use client";
// 관리자 "AI 설정" 탭: 키 설정 여부와 (선택) 연결 테스트. 키 값은 서버도 화면도 다루지 않는다.
// 사용 예: <AiKeyStatus />  (app/admin/slots.tsx 의 AdminAiSlot 에서 팀장이 연결)
import { useEffect, useRef, useState } from "react";
import { AiStatusError, aiTargetText, fetchAiStatus, requestAiProbe, type AiProbeResult, type AiStatus } from "./aiStatusClient";
import { createAiRequestGate, type AiRequest } from "./aiRequestGate";
import AiRequestProgress, { useAiRequest } from "./AiRequestProgress";

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ready"; value: AiStatus };
type Probe = { status: "idle" } | { status: "running" } | { status: "done"; result: AiProbeResult } | { status: "error"; message: string };

export default function AiKeyStatus() {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [probe, setProbe] = useState<Probe>({ status: "idle" });
  const probeRef = useRef<AiRequest | null>(null);
  const [gate] = useState(createAiRequestGate);
  const active = useAiRequest(gate);

  useEffect(() => {
    const controller = new AbortController();
    fetchAiStatus(controller.signal)
      .then((value) => { if (!controller.signal.aborted) setLoad({ status: "ready", value }); })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setLoad({ status: "error", message: error instanceof AiStatusError ? error.message : "상태를 불러오지 못했어요." });
      });
    return () => { controller.abort(); gate.dispose(); probeRef.current = null; };
  }, [gate]);

  async function runProbe() {
    if (probeRef.current) return;
    const target = aiTargetText(load.status === "ready" ? load.value.provider : null); // 실제 업체 이름(EXAONE · Gemini)
    if (!window.confirm(`${target}를 한 번 호출해 연결을 확인합니다. 호출 비용이 생길 수 있어요. 계속할까요?`)) return;
    const request = gate.start("probe", () => {
      probeRef.current = null;
      setProbe({ status: "idle" });
    });
    if (!request) return;
    const controller = request.controller;
    probeRef.current = request;
    setProbe({ status: "running" });
    try {
      const result = await requestAiProbe(controller.signal);
      if (!controller.signal.aborted && probeRef.current === request) setProbe({ status: "done", result });
    } catch (error) {
      if (!controller.signal.aborted && probeRef.current === request) {
        setProbe({ status: "error", message: error instanceof AiStatusError ? error.message : "연결에 실패했어요." });
      }
    } finally {
      if (probeRef.current === request) probeRef.current = null;
      gate.finish(request);
    }
  }

  if (load.status === "loading") return <p role="status" className="text-sm text-gray-600">AI 설정 상태를 불러오는 중…</p>;
  if (load.status === "error") return <p role="alert" className="rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">{load.message}</p>;

  const { provider, model, keyConfigured, keyEnvName } = load.value;
  return (
    <section aria-label="AI 설정 상태" className="space-y-4 text-sm text-gray-900">
      <dl className="space-y-2 rounded-md border border-gray-200 bg-white p-4">
        <div className="flex gap-2"><dt className="w-24 text-gray-600">AI 제공자</dt><dd>{provider}</dd></div>
        {model && <div className="flex gap-2"><dt className="w-24 text-gray-600">모델</dt><dd>{model}</dd></div>}
        <div className="flex gap-2"><dt className="w-24 text-gray-600">API 키</dt><dd>{keyConfigured ? "✅ 설정됨" : "❌ 설정 안 됨"}</dd></div>
      </dl>
      <p className="text-xs leading-5 text-gray-600">
        AI 제공자는 서버 환경변수 <code>AI_PROVIDER</code> 로 고릅니다. 비워 두거나 <code>exaone</code> 이면 EXAONE, <code>gemini</code> 이면 Gemini(키 <code>GEMINI_API_KEY</code>, 모델은 선택 <code>GEMINI_MODEL</code>)를 씁니다. 바꾼 뒤에는 다시 배포해야 적용됩니다.
      </p>
      {!keyConfigured && (
        <p className="rounded-md border border-gray-200 bg-gray-50 p-3 leading-6">
          Vercel 프로젝트 → Settings → Environment Variables 에서 <code>{keyEnvName ?? "AI API 키 환경변수"}</code> 를 넣고 다시 배포하세요.
        </p>
      )}
      <div className="space-y-2">
        <button type="button" onClick={() => void runProbe()} disabled={!keyConfigured || probe.status === "running"}
          className="min-h-9 rounded-md border border-gray-300 bg-white px-3 py-2 hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-[#1e325c] disabled:opacity-50">
          연결 테스트
        </button>
        <p className="text-xs text-gray-600">버튼을 누를 때만 한 번 호출합니다. 자동 호출·재시도는 없습니다.</p>
        {active && <AiRequestProgress request={active} onCancel={() => gate.cancel()} />}
        {active && <p className="text-xs text-gray-600">취소해도 업체에서 이미 처리한 사용량은 되돌릴 수 없습니다.</p>}
        {probe.status === "done" && (probe.result.ok
          ? <p role="status">✅ 연결 성공 · {probe.result.ms}ms</p>
          : <p role="alert">❌ {probe.result.message}</p>)}
        {probe.status === "error" && <p role="alert">❌ {probe.message}</p>}
      </div>
    </section>
  );
}
