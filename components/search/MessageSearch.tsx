"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { consumeSearchEscape } from "./searchKeyboard";
import {
  MessageSearchError,
  SEARCH_KEYWORD_MAX_LENGTH,
  SEARCH_RESULT_LIMIT,
  searchMessages,
  type MessageSearchResult,
} from "./searchMessages";

export type MessageSearchProps = {
  onSelect: (channelId: string, messageId: number) => void;
};

type SearchState =
  | { status: "idle" }
  | { status: "loading"; keyword: string }
  | { status: "success"; keyword: string; results: MessageSearchResult[]; hasMore: boolean }
  | { status: "error"; message: string };

export default function MessageSearch({ onSelect }: MessageSearchProps) {
  const [keyword, setKeyword] = useState("");
  const [state, setState] = useState<SearchState>({ status: "idle" });
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const searchId = useId();
  const resultsId = `${searchId}-results`;

  const closeResults = useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    setState({ status: "idle" });
  }, []);

  useEffect(() => {
    function handleOutsideClick(event: PointerEvent) {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) {
        closeResults();
      }
    }

    document.addEventListener("pointerdown", handleOutsideClick);
    return () => {
      document.removeEventListener("pointerdown", handleOutsideClick);
      requestRef.current?.abort();
      requestRef.current = null;
    };
  }, [closeResults]);

  useEffect(() => {
    // 계정이 바뀌거나 로그아웃하면 이전 계정의 검색 결과를 지운다.
    // 환경변수가 없을 때는 화면을 유지하고 검색 시 설정 안내를 표시한다.
    try {
      const supabase = createClient();
      const { data } = supabase.auth.onAuthStateChange((event) => {
        if (event === "SIGNED_OUT" || event === "SIGNED_IN") closeResults();
      });
      return () => data.subscription.unsubscribe();
    } catch {
      // 실제 조회를 시작할 때 연결 설정 오류를 처리한다.
    }
  }, [closeResults]);

  async function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    closeResults();
    const searchKeyword = keyword.trim();
    if (!searchKeyword) return;

    let supabase: ReturnType<typeof createClient>;
    try {
      supabase = createClient();
    } catch {
      setState({ status: "error", message: "검색 연결 설정이 없습니다. 팀장에게 Supabase 설정을 확인해 주세요." });
      return;
    }

    const controller = new AbortController();
    requestRef.current = controller;
    setState({ status: "loading", keyword: searchKeyword });

    try {
      const response = await searchMessages(supabase, searchKeyword, controller.signal);
      // 입력 변경·닫기·다음 검색 이후 도착한 오래된 응답은 표시하지 않는다.
      if (requestRef.current !== controller || controller.signal.aborted) return;
      setState({ status: "success", keyword: searchKeyword, ...response });
    } catch (error) {
      if (requestRef.current !== controller || controller.signal.aborted) return;
      setState({
        status: "error",
        message: error instanceof MessageSearchError
          ? error.message
          : "검색하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.",
      });
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full min-w-0 text-gray-900"
      onKeyDown={(event) => {
        if (consumeSearchEscape(event, state.status !== "idle")) {
          closeResults();
          inputRef.current?.focus();
        }
      }}
    >
      <form role="search" aria-label="메시지 검색" onSubmit={handleSearch} className="flex min-w-0 items-center gap-2">
        <label htmlFor={searchId} className="sr-only">메시지 검색어</label>
        <input
          ref={inputRef}
          id={searchId}
          type="search"
          value={keyword}
          onChange={(event) => {
            closeResults();
            setKeyword(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault();
          }}
          maxLength={SEARCH_KEYWORD_MAX_LENGTH}
          autoComplete="off"
          placeholder="메시지 검색"
          aria-controls={state.status !== "idle" ? resultsId : undefined}
          className="h-9 w-full min-w-0 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e325c]"
        />
        <button
          type="submit"
          disabled={!keyword.trim() || state.status === "loading"}
          className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-md bg-[#1e325c] px-3 py-2 text-sm font-medium text-white hover:bg-[#172746] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e325c] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
        >
          검색
        </button>
      </form>

      {state.status !== "idle" && (
        <section
          id={resultsId}
          aria-label="메시지 검색 결과"
          aria-busy={state.status === "loading"}
          className="absolute right-0 top-full z-30 mt-2 w-[min(32rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] rounded-md border border-gray-200 bg-white text-sm shadow-lg"
        >
          <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-3 py-2">
            <h2 className="font-semibold">메시지 검색 결과</h2>
            <button
              type="button"
              onClick={() => {
                closeResults();
                inputRef.current?.focus();
              }}
              className="rounded-md px-2 py-1 text-gray-600 hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e325c]"
            >
              닫기
            </button>
          </div>

          {state.status === "loading" && (
            <p role="status" className="p-4 text-gray-600">“{state.keyword}” 검색 중입니다.</p>
          )}
          {state.status === "error" && (
            <p role="alert" className="m-3 rounded-md border border-red-200 bg-red-50 p-3 text-red-700">{state.message}</p>
          )}
          {state.status === "success" && (
            <>
              <p role="status" className="break-words px-3 py-2 text-gray-600">
                {state.results.length === 0
                  ? `“${state.keyword}” 검색 결과가 없습니다.`
                  : `“${state.keyword}” 검색 결과 ${state.results.length}건 · 최신순`}
                {state.hasMore && ` · 최근 ${SEARCH_RESULT_LIMIT}건만 표시합니다. 검색어를 더 구체적으로 입력해 주세요.`}
              </p>
              {state.results.length > 0 && (
                <ul className="max-h-[min(28rem,60dvh)] space-y-2 overflow-y-auto p-3 pt-0">
                  {state.results.map((message) => (
                    <li key={message.id}>
                      <button
                        type="button"
                        onClick={() => {
                          closeResults();
                          onSelect(message.channel_id, message.id);
                        }}
                        className="w-full rounded-md border border-gray-200 bg-white p-3 text-left hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e325c]"
                      >
                        <span className="block break-words font-semibold">
                          {message.channels?.type === "dm"
                            ? "다이렉트 메시지"
                            : message.channels ? `# ${message.channels.name}` : "채널"}
                          {message.channels?.type === "private" && " · 비공개"}
                          {message.parent_id !== null && " · 스레드 답글"}
                        </span>
                        <span className="mt-1 line-clamp-3 block whitespace-pre-wrap break-words leading-6">{message.content}</span>
                        <span className="mt-2 block text-xs leading-5 text-gray-600">
                          {message.profiles?.name || "알 수 없는 사용자"}
                          {" · "}
                          <time dateTime={message.created_at}>
                            {new Date(message.created_at).toLocaleString("ko-KR")}
                          </time>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
