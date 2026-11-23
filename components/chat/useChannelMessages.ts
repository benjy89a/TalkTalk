"use client";
// [B] 채널 메시지를 불러오고 상태로 들고 있는 훅
// B-1: 최근 50개 불러오기
// (B-3 실시간 · B-4 델타 동기화 · B-6 무한스크롤은 이 파일에 이어서 붙인다)
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MESSAGE_SELECT, PAGE_SIZE, type ChatMessage } from "./types";

export type LoadStatus = "loading" | "ready" | "error";

export function useChannelMessages(channelId: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState<LoadStatus>("loading");
  // 다시 시도 버튼을 누르면 이 숫자를 올려서 아래 useEffect 를 다시 실행시킨다
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false; // 채널이 바뀌면 이전 요청의 결과는 버린다
    const supabase = createClient();

    async function load() {
      setStatus("loading");
      setMessages([]);

      // 최근 50개 = id 큰 순으로 50개 → 화면에는 오래된 순으로 뒤집어서 보여준다
      const { data, error } = await supabase
        .from("messages")
        .select(MESSAGE_SELECT)
        .eq("channel_id", channelId)
        .is("parent_id", null) // 스레드 답글은 본문에 안 보여준다
        .order("id", { ascending: false })
        .limit(PAGE_SIZE);

      if (cancelled) return;
      if (error) {
        console.error("[chat] 메시지 불러오기 실패", error);
        setStatus("error");
        return;
      }
      setMessages((data as ChatMessage[]).reverse());
      setStatus("ready");
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [channelId, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return { messages, status, reload };
}
