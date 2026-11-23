"use client";
// [B] 채널 메시지 목록 (B-1 목록 · B-3 실시간)
// 사용 예: <MessageList channelId={채널id} />
import { Fragment, useLayoutEffect, useMemo, useRef, useState } from "react";
import MessageItem from "./MessageItem";
import { formatDateDivider, isGroupedWith, isSameDay } from "./format";
import { mergeWithOutbox, useOutbox } from "./outbox";
import { useChannelMessages } from "./useChannelMessages";
import { useCurrentUserId } from "./useCurrentUserId";

type Props = {
  channelId: string;
};

// 맨 아래에서 이 정도(px) 안쪽이면 "맨 아래를 보고 있다"고 본다
const BOTTOM_THRESHOLD = 80;

export default function MessageList({ channelId }: Props) {
  const { messages: loaded, status, live, reload } = useChannelMessages(channelId);
  const outbox = useOutbox();
  const myId = useCurrentUserId();
  // 불러온 메시지 + 실시간 수신 + 내가 방금 보낸 메시지(보내는 중 포함)
  const messages = useMemo(
    () => mergeWithOutbox(loaded, outbox, channelId, null),
    [loaded, outbox, channelId],
  );

  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  // 사용자가 마지막으로 본(맨 아래였을 때의) 메시지 → 그 뒤에 온 것이 "새 메시지"
  const [seenKey, setSeenKey] = useState<string>();
  const prevLastRef = useRef<{ channelId: string; key?: string }>(undefined);

  const last = messages.at(-1);
  const lastKey = last?.client_id;

  // 새 메시지가 맨 아래에 붙었을 때 스크롤 여부 결정
  //  - 처음 불러왔을 때 / 내가 보낸 메시지 / 맨 아래를 보고 있었을 때 → 맨 아래로
  //  - 위쪽 예전 메시지를 읽는 중 → 그대로 두고 "새 메시지 n개" 버튼
  useLayoutEffect(() => {
    if (status !== "ready") return;
    const prev = prevLastRef.current;
    const first = !prev || prev.channelId !== channelId;
    if (!first && prev.key === lastKey) return;
    prevLastRef.current = { channelId, key: lastKey };

    const mine = !!last?.status; // 보내는 중 표시가 있으면 내가 방금 보낸 것
    const el = scrollRef.current;
    if (el && (first || mine || atBottomRef.current)) {
      el.scrollTop = el.scrollHeight; // → onScroll 이 불려서 seenKey 갱신
    }
  }, [status, channelId, lastKey, last?.status]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD;
    atBottomRef.current = near;
    setAtBottom(near);
    if (near) setSeenKey(lastKey);
  }

  function scrollToBottom() {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }

  // 아직 안 본 새 메시지 수
  const seenIndex = seenKey ? messages.findIndex((m) => m.client_id === seenKey) : -1;
  const unseen = atBottom || seenIndex < 0 ? 0 : messages.length - 1 - seenIndex;

  if (status === "loading") {
    return <CenterText>메시지를 불러오는 중…</CenterText>;
  }

  if (status === "error") {
    return (
      <CenterText>
        메시지를 불러오지 못했어요.
        <button
          type="button"
          onClick={reload}
          className="mt-3 inline-flex min-h-9 items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-[#1e325c] focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          다시 시도
        </button>
      </CenterText>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {live === "lost" && (
        <div role="status" className="shrink-0 bg-amber-50 px-4 py-1.5 text-center text-xs leading-5 text-amber-800">
          연결이 끊겼어요. 다시 연결하는 중…
        </div>
      )}

      {messages.length === 0 ? (
        <CenterText>아직 메시지가 없어요. 첫 메시지를 보내보세요!</CenterText>
      ) : (
        <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto p-4">
          {messages.map((m, i) => {
            const prev = messages[i - 1];
            const next = messages[i + 1];
            const newDay = !prev || !isSameDay(prev.created_at, m.created_at);
            return (
              <Fragment key={m.client_id}>
                {newDay && <DateDivider iso={m.created_at} />}
                <MessageItem
                  message={m}
                  // 보내는 중/실패 표시가 있는 건 방금 내가 보낸 것
                  mine={!!m.status || m.user_id === myId}
                  first={!isGroupedWith(prev, m)}
                  last={!isGroupedWith(m, next)}
                />
              </Fragment>
            );
          })}
        </div>
      )}

      {unseen > 0 && (
        <button
          type="button"
          onClick={scrollToBottom}
          className="absolute bottom-4 left-1/2 inline-flex min-h-9 -translate-x-1/2 items-center gap-1 rounded-full bg-[#1e325c] px-4 py-2 text-sm font-medium text-white shadow-md transition-colors hover:bg-[#172746] focus-visible:ring-2 focus-visible:ring-[#1e325c] focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          새 메시지 {unseen}개 ↓
        </button>
      )}
    </div>
  );
}

function DateDivider({ iso }: { iso: string }) {
  return (
    <div className="my-4 flex items-center gap-3" role="separator">
      <div className="h-px flex-1 bg-gray-200" />
      <span className="text-xs leading-5 font-medium text-gray-600">{formatDateDivider(iso)}</span>
      <div className="h-px flex-1 bg-gray-200" />
    </div>
  );
}

function CenterText({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-4 text-center text-sm leading-6 text-gray-600">
      {children}
    </div>
  );
}
