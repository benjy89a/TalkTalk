"use client";
// [B] 채널 메시지 목록 (B-1 목록 · B-3 실시간 · B-5 답글 버튼 · B-6 무한스크롤)
// 사용 예: <MessageList channelId={채널id} />
//         <MessageList channelId={채널id} renderAttachments={(m) => <AttachmentList messageId={m.id} />} />
// props (CONTRACTS.md)
//   renderAttachments?(message) — 말풍선 아래 첨부 칸 (D). 저장된 메시지에만 불린다
//   onOpenThread?(message)      — "답글"을 눌렀을 때 추가로 알려 받고 싶을 때. 스레드 패널은 이것 없이도 열린다
import { useEffect, useMemo, type ReactNode } from "react";
import { useMarkAsRead } from "@/components/notifications/useMarkAsRead";
import { CenterText, InfoBanner, LostBanner, NewMessagesButton, RetryButton } from "./ChatBits";
import MessageRows from "./MessageRows";
import { mergeWithOutbox, useOutbox, type DisplayMessage } from "./outbox";
import { closeThreadIfNotIn, openThread, useOpenThread } from "./threads";
import { MAX_RENDERED } from "./types";
import { useChannelMessages } from "./useChannelMessages";
import { useCurrentUserId } from "./useCurrentUserId";
import { toggleReaction, useReactions } from "./useReactions";
import { useStickToBottom } from "./useStickToBottom";

type Props = {
  channelId: string;
  renderAttachments?: (message: DisplayMessage) => ReactNode;
  onOpenThread?: (message: DisplayMessage) => void;
};

export default function MessageList({ channelId, renderAttachments, onOpenThread }: Props) {
  const {
    messages: loaded,
    replyStats,
    status,
    live,
    reload,
    hasMore,
    loadingOlder,
    loadOlder,
    capped,
    trimOld,
    notice,
  } = useChannelMessages(channelId);
  const outbox = useOutbox();
  const myId = useCurrentUserId();
  const openedThread = useOpenThread();
  // 불러온 메시지 + 실시간 수신 + 내가 방금 보낸 메시지(보내는 중 포함)
  const messages = useMemo(
    () => mergeWithOutbox(loaded, outbox, channelId, null),
    [loaded, outbox, channelId],
  );

  // 읽음 처리 (D-1 문수정님 훅) — DB 에 저장된 마지막 메시지 id 를 넘긴다
  // (보내는 중 메시지는 임시 id -1 이라 제외)
  const lastSavedId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (!messages[i].status) return messages[i].id;
    }
    return null;
  }, [messages]);
  useMarkAsRead(channelId, lastSavedId);

  // 이모지 반응 (저장된 메시지만)
  const savedIds = useMemo(() => messages.filter((m) => !m.status).map((m) => m.id), [messages]);
  const reactions = useReactions(channelId, savedIds);
  const onReact = (messageId: number, emoji: string, alreadyMine: boolean) => {
    if (myId) toggleReaction(messageId, emoji, myId, alreadyMine);
  };

  // 다른 채널로 옮기면 열려 있던 (이전 채널의) 스레드는 닫는다
  useEffect(() => {
    closeThreadIfNotIn(channelId);
  }, [channelId]);

  // (B-6) 맨 위 근처에 오면 이전 50개 불러오기
  // 대량 메시지: 최대 개수(500)까지 쌓였으면 더 불러오지 않는다
  const canLoadOlder = status === "ready" && hasMore && !loadingOlder && !capped;
  const { scrollRef, contentRef, onScroll, scrollToBottom, unseen, atBottom } = useStickToBottom(
    messages,
    status === "ready",
    channelId,
    canLoadOlder ? loadOlder : undefined,
  );

  // (B-6) 메시지가 적어서 스크롤이 생기지 않으면 위로 올릴 수가 없으므로 바로 더 불러온다
  useEffect(() => {
    const el = scrollRef.current;
    if (canLoadOlder && el && el.scrollHeight <= el.clientHeight) loadOlder();
  }, [canLoadOlder, loaded.length, loadOlder, scrollRef]);

  // 대량 메시지: 새 메시지가 계속 와서 500개를 넘으면, 맨 아래를 보고 있을 때 오래된 것부터 정리
  // (위쪽을 읽는 중엔 빼지 않는다 — 빼면 읽던 화면이 튀므로)
  useEffect(() => {
    if (atBottom && loaded.length > MAX_RENDERED) trimOld();
  }, [atBottom, loaded.length, trimOld]);

  if (status === "loading") {
    return <CenterText>메시지를 불러오는 중…</CenterText>;
  }

  if (status === "error") {
    return (
      <CenterText>
        메시지를 불러오지 못했어요.
        <RetryButton onClick={reload} />
      </CenterText>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {live === "lost" && <LostBanner />}
      {notice && <InfoBanner>{notice}</InfoBanner>}

      {messages.length === 0 ? (
        <CenterText>아직 메시지가 없어요. 첫 메시지를 보내보세요!</CenterText>
      ) : (
        <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto p-4">
          <div ref={contentRef}>
            {/* (B-6) 맨 위: 불러오는 중 / 더 없으면 채널 시작 안내 */}
            <div className="py-2 text-center text-xs leading-5 text-gray-500">
              {loadingOlder
                ? "이전 메시지를 불러오는 중…"
                : capped
                  ? `최근 ${MAX_RENDERED}개까지 보여드려요. 더 이전 메시지는 검색으로 찾아보세요 🔍`
                  : hasMore
                    ? " "
                    : "이 채널의 첫 메시지예요 👋"}
            </div>
            <MessageRows
              messages={messages}
              myId={myId}
              replyStats={replyStats}
              onOpenThread={(rootId) => {
                openThread(channelId, rootId);
                const m = messages.find((x) => x.id === rootId);
                if (m && onOpenThread) onOpenThread(m);
              }}
              activeRootId={openedThread?.channelId === channelId ? openedThread.rootId : null}
              renderAttachments={renderAttachments}
              reactions={reactions}
              onReact={onReact}
            />
          </div>
        </div>
      )}

      <NewMessagesButton count={unseen} onClick={scrollToBottom} />
    </div>
  );
}
