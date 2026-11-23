"use client";
// [B] 보낸 메시지 수정 · 삭제
//
// 권한은 DB 가 지킨다 (팀장님 003·005):
//   - 수정: 본인 메시지의 content 만. 수정 시각(edited_at)은 DB 트리거가 자동으로 적는다.
//   - 삭제: soft_delete_message 함수로만 (본인, 또는 채널 관리자). 줄은 남기고 content 를 비우고 deleted_at 기록
//          → 답글(스레드)은 그대로 남고, 화면에는 "삭제된 메시지입니다". 첨부·반응 기록은 DB 가 지운다.
//   - 삭제된 메시지는 다시 수정할 수 없다.
// 성공하면 브라우저 안에 신호를 보내서 이 화면의 목록·스레드가 바로 바뀌게 하고,
// 다른 사람 화면은 Realtime(UPDATE — 수정·삭제 모두)으로 바뀐다.
import { createClient } from "@/lib/supabase/client";
import { MAX_LENGTH, updateSent } from "./outbox";
import type { MessagePatch } from "./types";

// 수정·삭제 모두 이 신호 하나로 알린다 (바뀐 칸만 담아서)
export const UPDATED_EVENT = "talktalk:message-updated";
export type UpdatedDetail = { id: number; patch: MessagePatch };

function announce(id: number, patch: MessagePatch) {
  updateSent(id, patch); // 이번 접속에서 보낸 기록에도 반영해야 예전 내용이 다시 나타나지 않는다
  window.dispatchEvent(new CustomEvent<UpdatedDetail>(UPDATED_EVENT, { detail: { id, patch } }));
}

export async function editMessage(id: number, content: string): Promise<boolean> {
  const next = content.trim();
  if (!next || next.length > MAX_LENGTH) return false;
  const { data, error } = await createClient()
    .from("messages")
    .update({ content: next })
    .eq("id", id)
    .select("id, edited_at"); // 수정 시각은 DB 가 적어 준 값을 받아 쓴다
  if (error || !data?.length) {
    console.error("[chat] 메시지 수정 실패", error ?? "권한 없음");
    return false;
  }
  announce(id, { content: next, edited_at: data[0].edited_at ?? new Date().toISOString() });
  return true;
}

export async function deleteMessage(id: number): Promise<boolean> {
  const { error } = await createClient().rpc("soft_delete_message", { mid: id });
  if (error) {
    console.error("[chat] 메시지 삭제 실패", error);
    return false;
  }
  announce(id, { content: "", deleted_at: new Date().toISOString() });
  return true;
}
