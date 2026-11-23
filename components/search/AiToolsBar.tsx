"use client";
// 사용 예: <AiToolsBar channelId={선택한채널id} />
// 팀장이 slots.tsx의 AiToolsSlot에서 연결한다. 실제 사용에는 서버의 EXAONE 키가 필요하다.
import { useEffect, useRef, useState } from "react";
import { requestChannelSummary, SummaryRequestError } from "./summaryClient";
import AiExtraTools from "./AiExtraTools";

type Props = { channelId: string | null };
type SummaryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; summary: string }
  | { status: "error"; code: string; message: string };

export default function AiToolsBar({ channelId }: Props) {
  // 채널 변경 시 이전 채널의 결과·요청 상태를 함께 초기화한다.
  // 채팅 영역을 밀어내지 않도록 평소에는 버튼 한 줄만 보이고,
  // 열면 입력창 위에 떠 있는 패널(최대 높이 제한·스크롤)로 보여 준다. 닫아도 결과는 유지된다.
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" onKeyDown={(event) => { if (event.key === "Escape" && open) { event.stopPropagation(); setOpen(false); } }}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}
        className="min-h-9 rounded-md border border-gray-300 bg-white px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e325c]">
        ✨ AI 도구 {open ? "▾" : "▴"}
      </button>
      <div role="region" aria-label="AI 도구" hidden={!open}
        className="absolute bottom-full left-0 right-0 z-20 mb-2 max-h-[55vh] space-y-4 overflow-y-auto rounded-md border border-gray-200 bg-white p-4 shadow-lg">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">AI 도구</h2>
          <button type="button" onClick={() => setOpen(false)} aria-label="AI 도구 닫기"
            className="rounded-md px-2 py-1 text-gray-600 hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-[#1e325c]">✕ 닫기</button>
        </div>
        <ChannelSummary key={channelId ?? "no-channel"} channelId={channelId} />
        <AiExtraTools channelId={channelId} />
      </div>
    </div>
  );
}

function ChannelSummary({ channelId }: Props) {
  const [limit, setLimit] = useState(50);
  const [state, setState] = useState<SummaryState>({ status: "idle" });
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    requestRef.current?.abort();
    requestRef.current = null;
  }, []);

  function cancel() {
    requestRef.current?.abort();
    requestRef.current = null;
    setState({ status: "idle" });
  }

  async function summarize() {
    if (!channelId || requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setState({ status: "loading" });
    try {
      const summary = await requestChannelSummary(channelId, limit, controller.signal);
      if (controller.signal.aborted || requestRef.current !== controller) return;
      setState({ status: "success", summary });
    } catch (error) {
      if (controller.signal.aborted || requestRef.current !== controller) return;
      setState({
        status: "error",
        code: error instanceof SummaryRequestError ? error.code : "NETWORK_ERROR",
        message: error instanceof SummaryRequestError
          ? error.message : "연결 상태를 확인하고 다시 시도해 주세요.",
      });
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }

  return (
    <section aria-label="AI 대화 요약" className="space-y-2 text-sm text-gray-900">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-gray-600">
          요약 범위
          <select
            value={limit}
            disabled={state.status === "loading"}
            onChange={(event) => {
              cancel();
              setLimit(Number(event.target.value));
            }}
            className="h-9 rounded-md border border-gray-300 bg-white px-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e325c]"
          >
            {[10, 25, 50].map((count) => <option key={count} value={count}>최근 {count}개</option>)}
          </select>
        </label>
        <button
          type="button"
          onClick={summarize}
          disabled={!channelId || state.status === "loading"}
          className="inline-flex min-h-9 items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-2 font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e325c] disabled:pointer-events-none disabled:opacity-50"
        >
          {state.status === "loading" ? "요약 준비 중…" : "대화 요약"}
        </button>
        {state.status === "loading" && (
          <button type="button" onClick={cancel} className="rounded-md px-3 py-2 text-gray-600 focus-visible:ring-2 focus-visible:ring-[#1e325c]">취소</button>
        )}
      </div>
      <p className="text-xs leading-5 text-gray-600">
        선택한 범위의 대화가 외부 EXAONE으로 전송됩니다. 허용된 대화에만 사용해 주세요. 서버 설정과 API 한도에 따라 이용이 제한될 수 있습니다.
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
          <h3 className="font-semibold">대화 요약</h3>
          <p className="mt-2 whitespace-pre-wrap break-words leading-6">{state.summary}</p>
          <p className="mt-2 text-xs text-gray-600">AI 결과는 틀릴 수 있습니다. 원문 대화를 함께 확인해 주세요.</p>
        </div>
      )}
    </section>
  );
}
