"use client";
// [B] 메시지로 이동 + 강조 (검색 결과 클릭 → 그 메시지로 스크롤하고 잠깐 노랗게)
//
// 사용 예 (검색 결과를 눌렀을 때, components/layout/slots.tsx — 팀장님):
//   <MessageSearch onSelect={(channelId, messageId) => { selectChannel(channelId); focusMessage(channelId, messageId); }} />
//
// 검색창(가운데 위)과 메시지 목록·스레드 패널은 화면의 서로 다른 칸이라 threads.ts 처럼 작은 공유 저장소를 둔다.
// - 본문 메시지 → 채널 목록(MessageList)이 그 메시지로 스크롤 (화면에 없으면 그 주변을 새로 불러옴)
// - 스레드 답글 → 원본 메시지로 스크롤 + 스레드를 열고 답글을 강조
import { useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { openThread } from "./threads";

// seq: 같은 메시지를 두 번 눌러도 다시 이동하도록 매번 새 번호
export type FocusTarget = { channelId: string; messageId: number; seq: number } | null;

// 강조가 보이는 시간 (ms)
export const HIGHLIGHT_MS = 2500;

let listTarget: FocusTarget = null; // 채널 본문에서 찾을 메시지
let threadTarget: FocusTarget = null; // 스레드 패널에서 찾을 답글
let seq = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useListFocus() {
  return useSyncExternalStore(subscribe, () => listTarget, () => null);
}

export function useThreadFocus() {
  return useSyncExternalStore(subscribe, () => threadTarget, () => null);
}

// 화면에서 이동을 마쳤으면 지운다 (다시 그려져도 또 이동하지 않게)
export function clearListFocus(target: FocusTarget) {
  if (target && listTarget?.seq === target.seq) {
    listTarget = null;
    emit();
  }
}

export function clearThreadFocus(target: FocusTarget) {
  if (target && threadTarget?.seq === target.seq) {
    threadTarget = null;
    emit();
  }
}

// 검색 결과 등에서 부른다. 답글인지는 여기서 DB 에 한 번 물어본다 (검색 쪽은 id 만 넘기면 됨)
export async function focusMessage(channelId: string, messageId: number) {
  const mySeq = ++seq;
  const { data, error } = await createClient()
    .from("messages")
    .select("id, parent_id")
    .eq("id", messageId)
    .maybeSingle();
  if (mySeq !== seq) return; // 그새 다른 결과를 눌렀으면 이건 버린다
  if (error || !data) {
    console.error("[chat] 이동할 메시지를 찾지 못함", error);
    return;
  }
  if (data.parent_id === null) {
    listTarget = { channelId, messageId, seq: mySeq };
    threadTarget = null;
  } else {
    // 답글: 본문에서는 원본으로 이동, 스레드를 열어 답글을 강조
    listTarget = { channelId, messageId: data.parent_id, seq: mySeq };
    threadTarget = { channelId, messageId, seq: mySeq };
    openThread(channelId, data.parent_id);
  }
  emit();
}
