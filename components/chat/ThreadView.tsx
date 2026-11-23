"use client";
// [B] 스레드 패널 내용 (B-5) — 원본 메시지 + 답글 목록 + 답글 입력창
// 사용 예 (오른쪽 스레드 패널 칸에): <ThreadView />
//   → 메시지 목록에서 "답글"을 누르면 그 메시지의 스레드가 여기에 열린다 (threads.ts 공유 저장소)
import { useMemo } from "react";
import { CenterText, LostBanner, NewMessagesButton, RetryButton } from "./ChatBits";
import MessageInput from "./MessageInput";
import MessageItem from "./MessageItem";
import MessageRows from "./MessageRows";
import { mergeWithOutbox, useOutbox } from "./outbox";
import { closeThread, useOpenThread } from "./threads";
import { useCurrentUserId } from "./useCurrentUserId";
import { useStickToBottom } from "./useStickToBottom";
import { useThreadMessages } from "./useThreadMessages";

export default function ThreadView() {
  const opened = useOpenThread();
  if (!opened) {
    return <CenterText>메시지의 &quot;답글&quot;을 누르면 여기에서 스레드를 볼 수 있어요.</CenterText>;
  }
  // 다른 스레드를 열면 key 가 바뀌어 처음부터 다시 불러온다
  return <OpenedThread key={opened.rootId} channelId={opened.channelId} rootId={opened.rootId} />;
}

function OpenedThread({ channelId, rootId }: { channelId: string; rootId: number }) {
  const { root, replies: loaded, status, live } = useThreadMessages(rootId);
  const outbox = useOutbox();
  const myId = useCurrentUserId();
  // 불러온 답글 + 실시간 수신 + 내가 방금 보낸 답글(보내는 중 포함)
  const replies = useMemo(
    () => mergeWithOutbox(loaded, outbox, channelId, rootId),
    [loaded, outbox, channelId, rootId],
  );
  const { scrollRef, onScroll, scrollToBottom, unseen } = useStickToBottom(
    replies,
    status === "ready",
    String(rootId),
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* 닫기 */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-2">
        <span className="text-xs leading-5 font-medium text-gray-600">답글 {replies.length}개</span>
        <button
          type="button"
          onClick={closeThread}
          aria-label="스레드 닫기"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:ring-2 focus-visible:ring-[#1e325c] focus-visible:outline-none"
        >
          ✕
        </button>
      </div>

      {live === "lost" && <LostBanner />}

      {status === "loading" && <CenterText>스레드를 불러오는 중…</CenterText>}
      {status === "error" && (
        <CenterText>
          스레드를 불러오지 못했어요.
          <RetryButton onClick={closeThread} />
        </CenterText>
      )}

      {status === "ready" && root && (
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto p-3">
            {/* 원본 메시지 */}
            <MessageItem message={root} mine={root.user_id === myId} first last />

            {/* 구분선 */}
            <div className="my-3 flex items-center gap-3" role="separator">
              <div className="h-px flex-1 bg-gray-200" />
              <span className="text-xs leading-5 font-medium text-gray-600">
                {replies.length > 0 ? `답글 ${replies.length}개` : "아직 답글이 없어요"}
              </span>
              <div className="h-px flex-1 bg-gray-200" />
            </div>

            {/* 답글 목록 */}
            <MessageRows messages={replies} myId={myId} />
          </div>
          <NewMessagesButton count={unseen} onClick={scrollToBottom} />
        </div>
      )}

      {/* 답글 입력창 (parent_id = 원본 메시지 id) */}
      <div className="shrink-0 border-t border-gray-200 p-3">
        <MessageInput key={rootId} channelId={channelId} parentId={rootId} placeholder="답글 보내기" />
      </div>
    </div>
  );
}
