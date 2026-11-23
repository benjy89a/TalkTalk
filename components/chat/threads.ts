"use client";
// [B] 지금 열린 스레드 (B-5)
//
// "답글" 버튼(메시지 목록, 가운데 칸)과 스레드 패널(ThreadView, 오른쪽 칸)은 화면의 서로 다른 칸이라
// 둘이 같은 값을 보도록 작은 공유 저장소를 둔다. (팀장님은 패널 칸에 <ThreadView /> 만 넣으면 된다)
import { useSyncExternalStore } from "react";

export type OpenThread = { channelId: string; rootId: number } | null;

let current: OpenThread = null;
const listeners = new Set<() => void>();

function set(next: OpenThread) {
  current = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useOpenThread() {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

export function openThread(channelId: string, rootId: number) {
  set({ channelId, rootId });
}

export function closeThread() {
  set(null);
}

// 다른 채널로 옮기면 그 채널의 스레드가 아니므로 닫는다
export function closeThreadIfNotIn(channelId: string) {
  if (current && current.channelId !== channelId) set(null);
}
