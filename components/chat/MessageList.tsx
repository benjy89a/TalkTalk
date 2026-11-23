"use client";
// [B] 채널 메시지 목록 (B-1 목록 · B-3 실시간 · B-5 답글 버튼)
// 사용 예: <MessageList channelId={채널id} />
import { useEffect, useMemo } from "react";
import { useMarkAsRead } from "@/components/notifications/useMarkAsRead";
import { CenterText, LostBanner, NewMessagesButton, RetryButton } from "./ChatBits";
import MessageRows from "./MessageRows";
import { mergeWithOutbox, useOutbox } from "./outbox";
import { closeThreadIfNotIn, openThread, useOpenThread } from "./threads";
import { useChannelMessages } from "./useChannelMessages";
import { useCurrentUserId } from "./useCurrentUserId";
import { useStickToBottom } from "./useStickToBottom";

type Props = {
  channelId: string;
};

export default function MessageList({ channelId }: Props) {
  const { messages: loaded, replyStats, status, live, reload } = useChannelMessages(channelId);
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

  // 다른 채널로 옮기면 열려 있던 (이전 채널의) 스레드는 닫는다
  useEffect(() => {
    closeThreadIfNotIn(channelId);
  }, [channelId]);

  const { scrollRef, onScroll, scrollToBottom, unseen } = useStickToBottom(
    messages,
    status === "ready",
    channelId,
  );

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

      {messages.length === 0 ? (
        <CenterText>아직 메시지가 없어요. 첫 메시지를 보내보세요!</CenterText>
      ) : (
        <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto p-4">
          <MessageRows
            messages={messages}
            myId={myId}
            replyStats={replyStats}
            onOpenThread={(rootId) => openThread(channelId, rootId)}
            activeRootId={openedThread?.channelId === channelId ? openedThread.rootId : null}
          />
        </div>
      )}

      <NewMessagesButton count={unseen} onClick={scrollToBottom} />
    </div>
  );
}
