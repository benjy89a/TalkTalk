"use client";
// 가운데 메시지 영역: 채널 헤더 / 메시지 목록 / 입력창
// 보여줄 채널은 사이드바에서 고른 채널(ChannelContext)이다. 칸 안의 내용은 slots.tsx 에서 끼운다.
import MessageList from "@/components/chat/MessageList";
import MessageInput from "@/components/chat/MessageInput";
// [D] 파일 첨부: 입력창 extras 칸에 첨부 버튼, 메시지 아래 renderAttachments 칸에 첨부 미리보기
import AttachButton from "@/components/attachments/AttachButton";
import { renderMessageAttachments } from "@/components/attachments/AttachmentList";
import { useSelectedChannel } from "./ChannelContext";
import { AiToolsSlot, HeaderSearchSlot } from "./slots";

export default function MessageArea() {
  const { channelId, channelName, channelType, ready } = useSelectedChannel();

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-gray-200 px-4">
        <span className="truncate font-semibold">
          {channelName ? `${channelType === "dm" ? "@" : "#"} ${channelName}` : ""}
        </span>
        <div className="w-64">
          <HeaderSearchSlot />
        </div>
      </header>

      {channelId ? (
        // key: 채널을 바꾸면 이전 채널의 화면 상태가 남지 않도록 새로 그린다
        <MessageList
          key={channelId}
          channelId={channelId}
          renderAttachments={renderMessageAttachments}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center p-4 text-sm text-gray-600">
          {ready ? "참여한 채널이 없어요. 왼쪽에서 채널을 둘러보고 참여해 보세요." : "채널을 불러오는 중…"}
        </div>
      )}
      <div className="shrink-0 space-y-2 px-4 pb-2">
        <AiToolsSlot />
      </div>

      <footer className="shrink-0 border-t border-gray-200 p-4">
        {channelId && (
          <MessageInput
            key={channelId}
            channelId={channelId}
            extras={<AttachButton channelId={channelId} />}
          />
        )}
      </footer>
    </main>
  );
}
