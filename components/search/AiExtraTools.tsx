"use client";
// 사용 예: <AiExtraTools channelId={선택한채널id} />. AiToolsBar 안에 포함된다.
// 현재 채널만 검색한다. DB 업무 저장·자동 배정은 하지 않는다.
// onSelectMessage 를 받으면 결과 메시지·할 일 근거 번호를 눌러 그 메시지로 이동을 요청한다 (실제 스크롤은 B·팀장).
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useCancelOnSignOut } from "./useCancelOnSignOut";
import { AiExtraRequestError, requestExtractTasks, requestNaturalSearch, type AiSearchResult, type AiTaskResult } from "./extraClient";
import { createAiRequestGate, type AiRequest, type AiRequestGate } from "./aiRequestGate";
import AiRequestProgress, { useAiRequest } from "./AiRequestProgress";
import { canRetryAfterTruncation, DEFAULT_TASK_LIMIT, TASK_LIMIT_OPTIONS } from "./taskLimits";
import { aiPrimaryButton, aiSecondaryButton } from "./aiButtonStyles";
import { aiTargetText, useAiProviderLabel } from "./useAiProviderLabel";

type Props = {
  channelId: string | null;
  requestGate?: AiRequestGate;
  /** 결과 메시지를 누르면 호출. 없으면 결과는 눌러지지 않는다 (CONTRACTS.md 3번). */
  onSelectMessage?: (channelId: string, messageId: number) => void;
};
type Kind = "search" | "tasks";
type State = { status: "idle" } | { status: "loading"; kind: Kind }
  | { status: "search"; result: AiSearchResult } | { status: "tasks"; result: AiTaskResult }
  | { status: "error"; message: string; code?: string; kind: Kind };

export default function AiExtraTools({ channelId, requestGate, onSelectMessage }: Props) {
  return <ChannelExtraTools key={channelId ?? "no-channel"} channelId={channelId} requestGate={requestGate} onSelectMessage={onSelectMessage} />;
}

function ChannelExtraTools({ channelId, requestGate, onSelectMessage }: Props) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState<number>(DEFAULT_TASK_LIMIT);
  const [state, setState] = useState<State>({ status: "idle" });
  const [localGate] = useState(createAiRequestGate);
  const gate = requestGate ?? localGate;
  const active = useAiRequest(gate);
  const requestRef = useRef<AiRequest | null>(null);
  const inputId = useId();
  const busy = active !== null;
  const target = aiTargetText(useAiProviderLabel()); // 실제 업체 이름(EXAONE · Gemini)
  const cancel = useCallback(() => {
    if (requestRef.current) gate.cancel(requestRef.current);
    requestRef.current = null;
    setState({ status: "idle" });
  }, [gate]);

  // 로그아웃·계정 변경 때만 취소한다. 탭 복귀 때 오는 같은 계정 신호로는 끊지 않는다.
  useCancelOnSignOut(cancel);

  useEffect(() => () => {
    if (requestRef.current) gate.cancel(requestRef.current);
    requestRef.current = null;
    if (!requestGate) localGate.dispose();
  }, [gate, localGate, requestGate]);

  async function run(kind: Kind) {
    if (!channelId || requestRef.current || (kind === "search" && !query.trim())) return;
    const request = gate.start(kind, () => {
      requestRef.current = null;
      setState({ status: "idle" });
    });
    if (!request) return;
    const controller = request.controller;
    requestRef.current = request;
    setState({ status: "loading", kind });
    try {
      const next: State = kind === "search"
        ? { status: "search", result: await requestNaturalSearch(channelId, query, controller.signal) }
        : { status: "tasks", result: await requestExtractTasks(channelId, limit, controller.signal) };
      if (!controller.signal.aborted && requestRef.current === request) setState(next);
    } catch (error) {
      if (!controller.signal.aborted && requestRef.current === request) {
        setState({ status: "error", kind, code: error instanceof AiExtraRequestError ? error.code : undefined,
          message: error instanceof AiExtraRequestError
            ? error.message : "연결 상태를 확인하고 다시 시도해 주세요." });
      }
    } finally {
      if (requestRef.current === request) requestRef.current = null;
      gate.finish(request);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void run("search"); }

  return (
    <section aria-label="AI 자연어 검색과 할 일 추출" className="space-y-4 border-t border-gray-200 pt-3 text-sm text-gray-900">
      <div className="space-y-2">
        <h3 className="font-semibold">자연어 검색</h3>
        <form onSubmit={submit} className="flex items-center gap-2">
          <label htmlFor={inputId} className="sr-only">자연어 검색 질문</label>
          <input id={inputId} value={query} maxLength={500} disabled={!channelId || busy}
            onChange={(event) => { cancel(); setQuery(event.target.value); }}
            onKeyDown={(event) => { if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault(); }}
            placeholder="예: 지난주 배포 얘기 찾아줘"
            className="h-9 min-w-0 flex-1 rounded-md border border-gray-300 bg-white px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e325c] disabled:opacity-50" />
          <button type="submit" disabled={!channelId || !query.trim() || busy} className={aiPrimaryButton}>AI 검색</button>
        </form>
        <p className="text-xs leading-5 text-gray-600">
          질문이 {target}로 전송됩니다. 허용된 데이터에만 사용해 주세요.
          {!channelId && " 먼저 채널을 선택해 주세요."}
        </p>
      </div>
      <div className="space-y-2 border-t border-gray-200 pt-3">
        <h3 className="font-semibold">할 일 추출</h3>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-gray-600">추출 범위
            <select value={limit} disabled={busy} onChange={(event) => { cancel(); setLimit(Number(event.target.value)); }}
              className="h-9 rounded-md border border-gray-300 bg-white px-2 text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e325c]">
              {TASK_LIMIT_OPTIONS.map((count) => <option key={count} value={count}>최근 {count}개</option>)}
            </select>
          </label>
          <div className="flex items-center gap-2">
            {(state.status === "search" || state.status === "tasks" || state.status === "error") && (
              <button type="button" onClick={cancel} className={aiSecondaryButton}>결과 지우기</button>
            )}
            <button type="button" disabled={!channelId || busy} onClick={() => void run("tasks")} className={aiPrimaryButton}>할 일 추출</button>
          </div>
        </div>
        <p className="text-xs leading-5 text-gray-600">선택한 범위의 대화가 {target}로 전송됩니다. 대화가 길면 AI 응답이 중간에 끝날 수 있어 10개 이하를 권장합니다.</p>
        {!requestGate && active && <AiRequestProgress request={active} onCancel={cancel} />}
      </div>
      {state.status === "loading" && <p role="status" className="text-gray-600">{state.kind === "search" ? "질문을 해석하고 현재 채널에서 검색하고 있습니다." : "대화에서 할 일과 원문 근거를 확인하고 있습니다."} AI 응답은 최대 4분 정도 기다립니다. 취소할 수 있습니다.</p>}
      {state.status === "error" && (() => {
        // 응답이 중간에 끝난 할 일 추출은 AI가 생각에 쓰는 양이 매번 달라서 다시 시도하면 될 수 있다.
        // 자동 재시도는 하지 않고, 누를 때만 같은 범위로 다시 호출한다.
        return <div role="alert" className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3 leading-6">
          <p>{state.message}</p>
          {canRetryAfterTruncation(state) && <>
            <p className="text-xs text-gray-600">결과는 매번 달라서 다시 시도하면 될 수 있습니다.</p>
            <button type="button" disabled={busy} onClick={() => void run("tasks")}
              className={aiSecondaryButton}>
              다시 시도 (AI를 다시 호출합니다)</button>
          </>}
        </div>;
      })()}
      {state.status === "search" && (
        <div className="space-y-2">
          <p role="status">검색 결과 {state.result.messages.length}건 · 최신순{state.result.hasMore && " · 최근 20건만 표시합니다."}</p>
          <p className="break-words text-xs leading-5 text-gray-600">
            해석한 키워드(모두 포함): {state.result.interpretation.keywords.join(", ") || "없음"}
            {" · 기간: "}{state.result.interpretation.from ? new Date(state.result.interpretation.from).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "시작 제한 없음"}
            {" ~ "}{state.result.interpretation.to ? `${new Date(state.result.interpretation.to).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} 미만` : "종료 제한 없음"}{" (서울 시간)"}
          </p>
          {!state.result.messages.length && <p className="text-gray-600">조건에 맞는 대화가 없습니다. 해석된 조건을 확인하거나 질문을 바꿔 주세요.</p>}
          <ul className="max-h-80 space-y-2 overflow-y-auto">
            {state.result.messages.map((message) => {
              const body = <>
                <span className="line-clamp-4 block whitespace-pre-wrap break-words leading-6">{message.content}</span>
                <span className="mt-1 block text-xs text-gray-600">메시지 #{message.id}{message.parent_id !== null && " · 스레드 답글"}{" · "}
                  <time dateTime={message.created_at}>{new Date(message.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</time>
                  {onSelectMessage && " · 눌러서 채팅에서 보기"}
                </span>
              </>;
              return <li key={message.id}>
                {onSelectMessage && channelId
                  ? <button type="button" onClick={() => onSelectMessage(channelId, message.id)}
                    aria-label={`메시지 #${message.id} 위치로 이동`}
                    className="block w-full rounded-md border border-gray-200 p-3 text-left hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e325c]">{body}</button>
                  : <div className="rounded-md border border-gray-200 p-3">{body}</div>}
              </li>;
            })}
          </ul>
        </div>
      )}
      {state.status === "tasks" && (
        <div className="space-y-2">
          <p role="status">최근 대화 {state.result.messageCount}개에서 할 일 {state.result.tasks.length}개를 추출했습니다.</p>
          <p className="text-xs text-gray-600">AI가 제안한 결과입니다. 업무 저장·자동 배정은 하지 않습니다. 원문과 담당자·기한을 확인해 주세요.</p>
          {!state.result.tasks.length && <p className="text-gray-600">이 범위에서 명확한 할 일을 찾지 못했습니다.</p>}
          <ul className="max-h-80 space-y-2 overflow-y-auto">
            {state.result.tasks.map((task, index) => <li key={index} className="space-y-1 rounded-md border border-gray-200 p-3">
              <p className="whitespace-pre-wrap break-words font-medium">{task.content}</p>
              <p className="break-words text-gray-600">담당자: {task.assignee ?? "미정"}{" · 기한: "}{task.dueDate ?? "미정"}</p>
              <p className="text-xs text-gray-600">근거 메시지:{" "}
                {task.messageIds.map((id, i) => <span key={id}>{i > 0 && ", "}
                  {onSelectMessage && channelId
                    ? <button type="button" onClick={() => onSelectMessage(channelId, id)}
                      aria-label={`근거 메시지 #${id} 위치로 이동`}
                      className="rounded px-1 text-[#1e325c] underline hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e325c]">#{id}</button>
                    : `#${id}`}
                </span>)}
              </p>
            </li>)}
          </ul>
        </div>
      )}
    </section>
  );
}
