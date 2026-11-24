"use client";
// 사용 예: <AiToolsBar channelId={선택한채널id} />
// 팀장이 slots.tsx의 AiToolsSlot에서 연결한다. 실제 사용에는 서버의 AI 키(AI_PROVIDER 로 고른 EXAONE 또는 Gemini)가 필요하다.
import { useEffect, useRef, useState } from "react";
import { requestChannelSummary, SummaryRequestError } from "./summaryClient";
import AiExtraTools from "./AiExtraTools";
import { createAiRequestGate, type AiRequest, type AiRequestGate } from "./aiRequestGate";
import AiRequestProgress, { useAiRequest } from "./AiRequestProgress";
import { useCancelOnSignOut } from "./useCancelOnSignOut";
import { aiPrimaryButton, aiTriggerButton } from "./aiButtonStyles";
import { aiTargetText, useAiProviderInfo, useAiProviderLabel } from "./useAiProviderLabel";

type Props = { channelId: string | null };
/** 결과의 메시지를 눌렀을 때 호출된다 (CONTRACTS.md 3번 "메시지로 이동 규격"). 없으면 결과는 눌러지지 않는다. */
type JumpProps = { onSelectMessage?: (channelId: string, messageId: number) => void };
type SummaryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; summary: string }
  | { status: "error"; code: string; message: string };

export default function AiToolsBar({ channelId, onSelectMessage }: Props & JumpProps) {
  // 채널 변경 시 이전 채널의 결과·요청 상태를 함께 초기화한다.
  return <ChannelAiTools key={channelId ?? "no-channel"} channelId={channelId} onSelectMessage={onSelectMessage} />;
}

function ChannelAiTools({ channelId, onSelectMessage }: Props & JumpProps) {
  // 채팅 영역을 밀어내지 않도록 평소에는 버튼 한 줄만 보이고,
  // 열면 입력창 위에 떠 있는 패널(최대 높이 제한·스크롤)로 보여 준다. 닫아도 결과는 유지된다.
  const [open, setOpen] = useState(false);
  const [gate] = useState(createAiRequestGate);
  const active = useAiRequest(gate);
  useEffect(() => () => gate.dispose(), [gate]);
  // 지금 쓰는 모델을 버튼에 표시 (확인용 · 서버 AI_PROVIDER/GEMINI_MODEL 설정 그대로)
  const info = useAiProviderInfo();
  const modelName = info?.model || info?.provider;
  return (
    <div className="relative" onKeyDown={(event) => { if (event.key === "Escape" && open) { event.stopPropagation(); setOpen(false); } }}>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}
          className={aiTriggerButton(open)} title={info ? `AI: ${info.provider}${info.model ? ` · ${info.model}` : ""}` : undefined}>
          ✨ AI 도구{modelName && <span className="font-normal opacity-80"> ({modelName})</span>} {open ? "▾" : "▴"}{active ? " · 실행 중" : ""}
        </button>
        {active && <AiRequestProgress request={active} onCancel={() => gate.cancel()} background={!open} />}
      </div>
      <div role="region" aria-label="AI 도구" hidden={!open}
        className="absolute bottom-full left-0 right-0 z-20 mb-2 max-h-[55vh] space-y-4 overflow-y-auto rounded-md border border-gray-200 bg-white p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">AI 도구</h2>
          <button type="button" onClick={() => setOpen(false)} aria-label="AI 도구 닫기"
            className="rounded-md px-2 py-1 text-gray-600 hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-[#1e325c]">✕ 닫기</button>
        </div>
        {active && <p className="text-xs leading-5 text-gray-600">다른 AI 작업은 완료·취소 후 사용할 수 있습니다. 패널을 닫아도 계속 처리됩니다. 취소해도 업체에서 이미 처리한 사용량은 되돌릴 수 없습니다.</p>}
        <ChannelSummary channelId={channelId} gate={gate} />
        <AiExtraTools channelId={channelId} requestGate={gate}
          onSelectMessage={onSelectMessage && ((id, messageId) => {
            setOpen(false); // 채팅이 보이도록 패널을 닫는다 (결과는 유지된다)
            onSelectMessage(id, messageId);
          })} />
      </div>
    </div>
  );
}

function ChannelSummary({ channelId, gate }: Props & { gate: AiRequestGate }) {
  const [limit, setLimit] = useState(50);
  const [state, setState] = useState<SummaryState>({ status: "idle" });
  const requestRef = useRef<AiRequest | null>(null);
  const busy = useAiRequest(gate) !== null;
  const target = aiTargetText(useAiProviderLabel()); // 실제 업체 이름(EXAONE · Gemini)

  useEffect(() => () => {
    if (requestRef.current) gate.cancel(requestRef.current);
    requestRef.current = null;
  }, [gate]);

  function cancel() {
    if (requestRef.current) gate.cancel(requestRef.current);
    else setState({ status: "idle" });
  }

  // 로그아웃·계정 변경 때만 요약을 취소하고 이전 계정의 결과를 지운다. 탭 복귀로는 끊지 않는다.
  useCancelOnSignOut(cancel);

  async function summarize() {
    if (!channelId || requestRef.current) return;
    const request = gate.start("summary", () => {
      requestRef.current = null;
      setState({ status: "idle" });
    });
    if (!request) return;
    const controller = request.controller;
    requestRef.current = request;
    setState({ status: "loading" });
    try {
      const summary = await requestChannelSummary(channelId, limit, controller.signal);
      if (controller.signal.aborted || requestRef.current !== request) return;
      setState({ status: "success", summary });
    } catch (error) {
      if (controller.signal.aborted || requestRef.current !== request) return;
      setState({
        status: "error",
        code: error instanceof SummaryRequestError ? error.code : "NETWORK_ERROR",
        message: error instanceof SummaryRequestError
          ? error.message : "연결 상태를 확인하고 다시 시도해 주세요.",
      });
    } finally {
      if (requestRef.current === request) requestRef.current = null;
      gate.finish(request);
    }
  }

  return (
    <section aria-label="AI 대화 요약" className="space-y-2 text-sm text-gray-900">
      <h3 className="font-semibold">대화 요약</h3>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-gray-600">
          요약 범위
          <select
            value={limit}
            disabled={busy}
            onChange={(event) => {
              cancel();
              setLimit(Number(event.target.value));
            }}
            className="h-9 rounded-md border border-gray-300 bg-white px-2 text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e325c]"
          >
            {[10, 25, 50].map((count) => <option key={count} value={count}>최근 {count}개</option>)}
          </select>
        </label>
        <button
          type="button"
          onClick={summarize}
          disabled={!channelId || busy}
          className={aiPrimaryButton}
        >
          {state.status === "loading" ? "요약 준비 중…" : "대화 요약"}
        </button>
      </div>
      <p className="text-xs leading-5 text-gray-600">
        선택한 범위의 대화와 작성자 이름이 {target}로 전송됩니다. 허용된 대화에만 사용해 주세요. 서버 설정과 API 한도에 따라 이용이 제한될 수 있습니다.
        {!channelId && " 먼저 채널을 선택해 주세요."}
      </p>
      {state.status === "loading" && <p role="status" className="text-gray-600">로그인·채널 권한을 확인하고 대화를 요약하고 있습니다. AI 응답은 최대 4분 정도 기다립니다. 취소할 수 있습니다.</p>}
      {state.status === "error" && (
        <p
          role={state.code === "AI_NOT_CONNECTED" ? "status" : "alert"}
          className="rounded-md border border-gray-200 bg-gray-50 p-3 leading-6"
        >
          {state.message}
        </p>
      )}
      {state.status === "success" && (
        <div role="status" className="max-h-60 overflow-y-auto rounded-md border border-gray-200 bg-gray-50 p-4">
          <h3 className="font-semibold">요약 결과</h3>
          <p className="mt-2 whitespace-pre-wrap break-words leading-6">{state.summary}</p>
          <p className="mt-2 text-xs text-gray-600">AI 결과는 틀릴 수 있습니다. 원문 대화를 함께 확인해 주세요.</p>
        </div>
      )}
    </section>
  );
}
