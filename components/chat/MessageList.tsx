"use client";
// [B] 채널 메시지 목록 (B-1)
// 사용 예: <MessageList channelId={채널id} />
import { Fragment, useEffect, useRef } from "react";
import MessageItem from "./MessageItem";
import { formatDateDivider, isGroupedWith, isSameDay } from "./format";
import { useChannelMessages } from "./useChannelMessages";

type Props = {
  channelId: string;
};

export default function MessageList({ channelId }: Props) {
  const { messages, status, reload } = useChannelMessages(channelId);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 처음 불러오면 맨 아래(가장 최근 메시지)로 스크롤
  useEffect(() => {
    if (status !== "ready") return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [status, messages.length]);

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

  if (messages.length === 0) {
    return <CenterText>아직 메시지가 없어요. 첫 메시지를 보내보세요!</CenterText>;
  }

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4">
      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const newDay = !prev || !isSameDay(prev.created_at, m.created_at);
        return (
          <Fragment key={m.id}>
            {newDay && <DateDivider iso={m.created_at} />}
            <MessageItem message={m} grouped={isGroupedWith(prev, m)} />
          </Fragment>
        );
      })}
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
