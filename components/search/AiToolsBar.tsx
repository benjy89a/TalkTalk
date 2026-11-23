"use client";
// 사용 예: <AiToolsBar channelId={선택한채널id} />
// 팀장이 slots.tsx의 AiToolsSlot에서 연결한다. 현재 실제 AI 요약은 미연결이다.
import { useEffect, useRef, useState } from "react";
import { requestChannelSummary, SummaryRequestError } from "./summaryClient";

type Props = { channelId: string | null };
type SummaryState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; summary: string }
  | { status: "error"; code: string; message: string };

export default function AiToolsBar({ channelId }: Props) {
  // 채널 변경 시 이전 채널의 결과·요청 상태를 함께 초기화한다.
  return <ChannelSummary key={channelId ?? "no-channel"} channelId={channelId} />;
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
    if (!channelId) return;
    requestRef.current?.abort();
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
        AI 연결 준비 단계입니다. 현재 실제 요약은 제공하지 않으며 외부 AI 호출은 하지 않습니다.
        {!channelId && " 먼저 채널을 선택해 주세요."}
      </p>
      {state.status === "loading" && <p role="status" className="text-gray-600">로그인과 채널 대화를 확인하고 있습니다.</p>}
      {state.status === "error" && (
        <p
          role={state.code === "AI_NOT_CONNECTED" ? "status" : "alert"}
          className="rounded-md border border-gray-200 bg-gray-50 p-3 leading-6"
        >
          {state.message}
        </p>
      )}
      {state.status === "success" && (
        <div role="status" className="rounded-md border border-gray-200 bg-gray-50 p-4">
          <h3 className="font-semibold">대화 요약</h3>
          <p className="mt-2 whitespace-pre-wrap break-words leading-6">{state.summary}</p>
          <p className="mt-2 text-xs text-gray-600">AI 결과는 틀릴 수 있습니다. 원문 대화를 함께 확인해 주세요.</p>
        </div>
      )}
    </section>
  );
}
