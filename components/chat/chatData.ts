"use client";
// [B] 채널 본문(useChannelMessages)과 스레드(useThreadMessages)가 같이 쓰는 도우미
import { useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ChatMessage } from "./types";

// 델타 동기화 때 한 번에 받는 개수 (놓친 게 더 많으면 나눠서 끝까지 받는다)
export const CATCH_UP_BATCH = 500;

export type LoadStatus = "loading" | "ready" | "error";
// connecting: 연결 중 / live: 실시간 수신 중 / lost: 끊김(자동으로 다시 연결 시도)
export type LiveStatus = "connecting" | "live" | "lost";

// 같은 메시지(id)는 한 번만, id 순서대로
export function mergeById(prev: ChatMessage[], incoming: ChatMessage[]) {
  if (incoming.length === 0) return prev;
  const map = new Map(prev.map((m) => [m.id, m]));
  for (const m of incoming) map.set(m.id, m);
  return [...map.values()].sort((a, b) => a.id - b.id);
}

// 실시간으로 오는 행에는 보낸 사람 이름이 없으므로 프로필을 따로 불러와 기억해 둔다
const profileCache = new Map<string, Promise<ChatMessage["profiles"]>>();
export function getProfile(userId: string) {
  let p = profileCache.get(userId);
  if (!p) {
    p = Promise.resolve(
      createClient().from("profiles").select("name, avatar_url").eq("id", userId).maybeSingle(),
    ).then(({ data }) => data);
    profileCache.set(userId, p);
  }
  return p;
}

// 브라우저가 인터넷에 연결돼 있는지 (와이파이를 끄면 false)
function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}
export function useOnline() {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);
}
