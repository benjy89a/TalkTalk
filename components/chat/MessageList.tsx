"use client";
// [B] 채널 메시지 목록 (B-1 목록 · B-3 실시간 · B-5 답글 버튼 · B-6 무한스크롤)
// 사용 예: <MessageList channelId={채널id} />
//         <MessageList channelId={채널id} renderAttachments={(m) => <AttachmentList messageId={m.id} />} />
// props (CONTRACTS.md)
//   renderAttachments?(message) — 말풍선 아래 첨부 칸 (D). 저장된 메시지에만 불린다
//   onOpenThread?(message)      — "답글"을 눌렀을 때 추가로 알려 받고 싶을 때. 스레드 패널은 이것 없이도 열린다
//   focusMessageId?             — 이 메시지로 스크롤 + 잠깐 강조 (E 검색 연동). focus.ts 의 focusMessage() 로 불러도 같음
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMarkAsRead } from "@/components/notifications/useMarkAsRead";
import { CenterText, InfoBanner, JumpToLatestButton, LostBanner, NewMessagesButton, RetryButton } from "./ChatBits";
import { clearListFocus, focusMessage, useListFocus } from "./focus";
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
  focusMessageId?: number;
};

export default function MessageList({ channelId, renderAttachments, onOpenThread, focusMessageId }: Props) {
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
    jumpTo,
    detached,
  } = useChannelMessages(channelId);
  const outbox = useOutbox();
  const myId = useCurrentUserId();
  const openedThread = useOpenThread();
  // 불러온 메시지 + 실시간 수신 + 내가 방금 보낸 메시지(보내는 중 포함)
  // (메시지로 이동해서 예전 구간을 보는 중이면 그보다 최신인 내 메시지는 붙이지 않는다)
  const messages = useMemo(
    () => mergeWithOutbox(loaded, outbox, channelId, null, detached),
    [loaded, outbox, channelId, detached],
  );

  // 예전 구간을 보다가 내가 메시지를 보내면 → 최신 메시지로 돌아간다 (카톡처럼)
  const pendingHere = outbox.pending.filter((m) => m.channel_id === channelId && m.parent_id === null);
  const lastPendingKey = pendingHere.at(-1)?.client_id;
  const seenPendingRef = useRef(lastPendingKey);
  useEffect(() => {
    if (lastPendingKey === seenPendingRef.current) return;
    seenPendingRef.current = lastPendingKey;
    if (detached && lastPendingKey) reload();
  }, [lastPendingKey, detached, reload]);

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
  const { scrollRef, contentRef, onScroll, scrollToBottom, scrollToMessage, unseen, atBottom } = useStickToBottom(
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

  // ---- 메시지로 이동 + 강조 (검색 결과 클릭) ----
  // props 로 받은 경우도 공유 저장소(focus.ts)로 넘겨서 한 길로 처리한다
  useEffect(() => {
    if (focusMessageId !== undefined) focusMessage(channelId, focusMessageId);
  }, [channelId, focusMessageId]);

  const focus = useListFocus();
  const pendingRef = useRef<number | null>(null); // 화면에 그려지면 스크롤할 메시지
  const [focusError, setFocusError] = useState<string | null>(null);
  useEffect(() => {
    if (!focus || focus.channelId !== channelId || status !== "ready") return;
    clearListFocus(focus);
    const id = focus.messageId;
    if (scrollToMessage(id)) return; // 이미 화면에 있음
    // 화면에 없는 (오래된) 메시지 → 그 앞뒤를 불러오면 아래 효과가 스크롤
    pendingRef.current = id;
    jumpTo(id).then((ok) => {
      if (ok) return;
      pendingRef.current = null;
      setFocusError("메시지를 찾을 수 없어요. 삭제됐거나 볼 수 없는 메시지예요.");
    });
  }, [focus, channelId, status, jumpTo, scrollToMessage]);

  // 불러온 메시지가 그려진 뒤 스크롤 (못 찾으면 다음에 그려질 때 다시)
  useEffect(() => {
    if (pendingRef.current !== null && scrollToMessage(pendingRef.current)) pendingRef.current = null;
  }, [messages, scrollToMessage]);

  useEffect(() => {
    if (!focusError) return;
    const t = setTimeout(() => setFocusError(null), 4000);
    return () => clearTimeout(t);
  }, [focusError]);

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
      {focusError && <InfoBanner>{focusError}</InfoBanner>}

      {messages.length === 0 ? (
        <CenterText>아직 메시지가 없어요. 첫 메시지를 보내보세요!</CenterText>
      ) : (
        <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto px-2 py-4 sm:p-4">
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

      {/* 예전 구간을 보는 중이면 "최신 메시지로" (최신 50개를 다시 불러옴), 아니면 "새 메시지 n개" */}
      {detached ? <JumpToLatestButton onClick={reload} /> : <NewMessagesButton count={unseen} onClick={scrollToBottom} />}
    </div>
  );
}
