"use client";
// 가운데 메시지 영역: 채널 헤더 / 메시지 목록 / 입력창
// 채널 목록(C)이 아직 없어서 임시로 #general 채널을 찾아 보여준다. 채널 목록이 생기면 선택한 채널로 바꾼다.
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import MessageList from "@/components/chat/MessageList";
import MessageInput from "@/components/chat/MessageInput";
import Placeholder from "./Placeholder";

export default function MessageArea() {
  const [channelId, setChannelId] = useState<string | null>(null);

  useEffect(() => {
    createClient()
      .from("channels")
      .select("id")
      .eq("name", "general")
      .eq("type", "public")
      .maybeSingle()
      .then(({ data }) => setChannelId(data?.id ?? null));
  }, []);

  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-gray-200 px-4">
        <span className="font-semibold"># general</span>
        <div className="w-64">
          <Placeholder owner="E">검색창 (components/layout · app/api/ai)</Placeholder>
        </div>
      </header>

      {channelId ? (
        <MessageList channelId={channelId} />
      ) : (
        <div className="flex flex-1 items-center justify-center p-4 text-sm text-gray-600">
          채널을 찾는 중… (로그인이 필요할 수 있어요)
        </div>
      )}
      <div className="shrink-0 space-y-2 px-4 pb-2">
        <Placeholder owner="D">메시지 안 첨부파일 미리보기 (components/attachments)</Placeholder>
        <Placeholder owner="E">AI 요약 · 할 일 추출 버튼 (app/api/ai)</Placeholder>
      </div>

      <footer className="shrink-0 border-t border-gray-200 p-4">
        {channelId && <MessageInput channelId={channelId} />}
        <div className="mt-2">
          <Placeholder owner="D">첨부 버튼 · @멘션 (components/attachments, notifications)</Placeholder>
        </div>
      </footer>
    </main>
  );
}
