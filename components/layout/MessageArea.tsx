"use client";
// 가운데 메시지 영역: 채널 헤더 / 메시지 목록 / 입력창
// 보여줄 채널은 사이드바에서 고른 채널(ChannelContext)이다. 칸 안의 내용은 slots.tsx 에서 끼운다.
import MessageList from "@/components/chat/MessageList";
import MessageInput from "@/components/chat/MessageInput";
import { useSelectedChannel } from "./ChannelContext";
import {
  AiToolsSlot,
  AttachmentPreviewSlot,
  ComposerExtrasSlot,
  HeaderSearchSlot,
} from "./slots";

export default function MessageArea() {
  const { channelId, channelName } = useSelectedChannel();

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-gray-200 px-4">
        <span className="font-semibold"># {channelName ?? ""}</span>
        <div className="w-64">
          <HeaderSearchSlot />
        </div>
      </header>

      {channelId ? (
        // key: 채널을 바꾸면 이전 채널의 화면 상태가 남지 않도록 새로 그린다
        <MessageList key={channelId} channelId={channelId} />
      ) : (
        <div className="flex flex-1 items-center justify-center p-4 text-sm text-gray-600">
          채널을 찾는 중… (로그인이 필요할 수 있어요)
        </div>
      )}
      <div className="shrink-0 space-y-2 px-4 pb-2">
        <AttachmentPreviewSlot />
        <AiToolsSlot />
      </div>

      <footer className="shrink-0 border-t border-gray-200 p-4">
        {channelId && <MessageInput key={channelId} channelId={channelId} />}
        <div className="mt-2">
          <ComposerExtrasSlot />
        </div>
      </footer>
    </main>
  );
}
