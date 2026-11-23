"use client";
// [B] 보낸 메시지 수정 · 삭제
//
// 권한은 DB(RLS)가 지킨다: 본인 메시지만 수정, 수정은 content 만 가능(003_security_fix), 삭제는 본인 또는 관리자(002_roles).
// 성공하면 브라우저 안에 신호를 보내서 이 화면의 목록·스레드가 바로 바뀌게 하고,
// 다른 사람 화면은 Realtime(UPDATE/DELETE)으로 바뀐다.
import { createClient } from "@/lib/supabase/client";
import { forgetSent, MAX_LENGTH, updateSent } from "./outbox";

export const EDITED_EVENT = "talktalk:message-edited";
export const DELETED_EVENT = "talktalk:message-deleted";

export type EditedDetail = { id: number; content: string };
export type DeletedDetail = { id: number };

export async function editMessage(id: number, content: string): Promise<boolean> {
  const next = content.trim();
  if (!next || next.length > MAX_LENGTH) return false;
  const { data, error } = await createClient()
    .from("messages")
    .update({ content: next })
    .eq("id", id)
    .select("id");
  if (error || !data?.length) {
    console.error("[chat] 메시지 수정 실패", error ?? "권한 없음");
    return false;
  }
  updateSent(id, next);
  window.dispatchEvent(new CustomEvent<EditedDetail>(EDITED_EVENT, { detail: { id, content: next } }));
  return true;
}

// 원본 메시지를 지우면 DB 가 답글도 같이 지운다 (parent_id on delete cascade)
export async function deleteMessage(id: number, clientId?: string): Promise<boolean> {
  const { data, error } = await createClient().from("messages").delete().eq("id", id).select("id");
  if (error || !data?.length) {
    console.error("[chat] 메시지 삭제 실패", error ?? "권한 없음");
    return false;
  }
  if (clientId) forgetSent(clientId); // 이번 접속에서 보낸 기록에서도 빼야 다시 나타나지 않는다
  window.dispatchEvent(new CustomEvent<DeletedDetail>(DELETED_EVENT, { detail: { id } }));
  return true;
}
