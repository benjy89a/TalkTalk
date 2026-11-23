"use client";
// [B] 스레드 패널 내용 (B-5) — 원본 메시지 + 답글 목록 + 답글 입력창
// 사용 예 (오른쪽 스레드 패널 칸에): <ThreadView />
//   → 메시지 목록에서 "답글"을 누르면 그 메시지의 스레드가 여기에 열린다 (threads.ts 공유 저장소)
//   → 스레드 패널 바깥을 클릭하거나 Esc 를 누르면 닫힌다 (멘션 목록이 열려 있으면 Esc 는 목록만 닫음)
//     (다른 메시지의 "답글" 버튼[data-thread-trigger]을 누르면 닫지 않고 그 스레드로 바뀐다)
import { useEffect, useMemo, useRef } from "react";
import { CenterText, LostBanner, NewMessagesButton, RetryButton } from "./ChatBits";
import MessageInput from "./MessageInput";
import MessageItem from "./MessageItem";
import MessageRows from "./MessageRows";
import { mergeWithOutbox, useOutbox } from "./outbox";
import { closeThread, useOpenThread } from "./threads";
import { MAX_RENDERED } from "./types";
import { useCurrentUserId } from "./useCurrentUserId";
import { useStickToBottom } from "./useStickToBottom";
import { useThreadMessages } from "./useThreadMessages";
import { summarize, toggleReaction, useReactions } from "./useReactions";

export default function ThreadView() {
  const opened = useOpenThread();
  if (!opened) {
    return <CenterText>메시지의 &quot;답글&quot;을 누르면 여기에서 스레드를 볼 수 있어요.</CenterText>;
  }
  // 다른 스레드를 열면 key 가 바뀌어 처음부터 다시 불러온다
  return <OpenedThread key={opened.rootId} channelId={opened.channelId} rootId={opened.rootId} />;
}

function OpenedThread({ channelId, rootId }: { channelId: string; rootId: number }) {
  const { root, replies: loaded, omitted, rootDeleted, status, live } = useThreadMessages(rootId);
  // 원본 메시지가 삭제되면 스레드를 닫는다 (답글도 DB 에서 같이 지워짐)
  useEffect(() => {
    if (rootDeleted) closeThread();
  }, [rootDeleted]);
  const outbox = useOutbox();
  const myId = useCurrentUserId();
  // 불러온 답글 + 실시간 수신 + 내가 방금 보낸 답글(보내는 중 포함)
  const replies = useMemo(
    () => mergeWithOutbox(loaded, outbox, channelId, rootId),
    [loaded, outbox, channelId, rootId],
  );
  // 바깥 클릭 · Esc 로 닫기
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Element | null;
      if (!target || !target.isConnected) return;
      // 스레드 패널 안(패널 제목 포함)을 누른 건 무시
      const panel = rootRef.current?.closest("aside") ?? rootRef.current;
      if (panel?.contains(target)) return;
      // 다른 메시지의 "답글" 버튼 → 그 스레드로 바뀌므로 닫지 않음
      if (target.closest("[data-thread-trigger]")) return;
      closeThread();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // 멘션 목록(D 훅)이 이 Esc 로 목록을 닫았으면(preventDefault) 스레드는 닫지 않는다
      // 훅은 입력창에 직접 붙어 있어서 이 문서 단계 리스너보다 먼저 실행된다
      if (e.defaultPrevented) return;
      closeThread();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  // 이모지 반응 (원본 + 저장된 답글)
  const reactionIds = useMemo(
    () => [...(root ? [root.id] : []), ...replies.filter((m) => !m.status).map((m) => m.id)],
    [root, replies],
  );
  const reactions = useReactions(channelId, reactionIds);
  const onReact = (messageId: number, emoji: string, alreadyMine: boolean) => {
    if (myId) toggleReaction(messageId, emoji, myId, alreadyMine);
  };

  const { scrollRef, contentRef, onScroll, scrollToBottom, unseen } = useStickToBottom(
    replies,
    status === "ready",
    String(rootId),
  );

  return (
    // h-full: 바깥 패널 칸(팀장님 ThreadPanel 의 overflow-y-auto 칸) 높이에 딱 맞춘다.
    // 없으면 스레드 전체가 바깥 칸에서 한 덩어리로 스크롤돼서, 답글이 많을 때 입력창이 한참 아래로 밀려나고
    // "맨 아래로 가기"도 동작하지 않았다.
    <div ref={rootRef} className="flex h-full min-h-0 flex-1 flex-col">
      {/* 닫기 */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-4 py-2">
        <span className="text-xs leading-5 font-medium text-gray-600">답글 {replies.length + omitted}개</span>
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
            <div ref={contentRef}>
              {/* 원본 메시지 */}
              <MessageItem
                message={root}
                mine={root.user_id === myId}
                first
                last
                wide
                reactions={summarize(reactions[root.id], myId)}
                onReact={(emoji, mine) => onReact(root.id, emoji, mine)}
              />

              {/* 구분선 */}
              <div className="my-3 flex items-center gap-3" role="separator">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-xs leading-5 font-medium text-gray-600">
                  {replies.length + omitted > 0 ? `답글 ${replies.length + omitted}개` : "아직 답글이 없어요"}
                </span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>

              {/* 답글이 500개를 넘으면 최신 500개만 보여준다 */}
              {omitted > 0 && (
                <p className="mb-2 rounded-md bg-gray-50 px-3 py-2 text-center text-xs leading-5 text-gray-600">
                  이전 답글 {omitted.toLocaleString("ko-KR")}개는 생략했어요 · 최신 {MAX_RENDERED}개만 보여드려요
                </p>
              )}

              {/* 답글 목록 */}
              <MessageRows messages={replies} myId={myId} wide reactions={reactions} onReact={onReact} />
            </div>
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
