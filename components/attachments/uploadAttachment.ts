// 첨부파일 올리기 (D-4)
//
// uploadAttachment(channelId, messageId, file)  ← CONTRACTS.md 규격
//   이미 저장된 메시지에 파일 하나를 붙인다.
//   1) Storage 'attachments' 버킷의 {channel_id}/{uuid}-{파일이름} 에 업로드
//   2) attachments 테이블에 message_id, file_url(=Storage 경로), file_name(원래 이름) 저장
//
// sendFiles({ channelId, parentId?, files })
//   첨부 버튼이 쓰는 함수. "📎 파일이름" 메시지를 먼저 만들고, 그 메시지에 파일들을 붙인다.
//   파일이 하나도 안 올라가면 만든 메시지를 지운다 (빈 첨부 메시지가 남지 않게).
import { createClient } from "@/lib/supabase/client";
import type { Attachment } from "@/types/database";
import { buildAttachmentPath, fileMessageContent, validateFiles } from "./fileRules";

export const BUCKET = "attachments";

// 첨부가 새로 저장되면 브라우저 안에 이 신호를 보낸다 → 그 메시지의 AttachmentList 가 바로 다시 읽음
export const ATTACHMENTS_EVENT = "talktalk:attachments";
export type AttachmentsEventDetail = { messageId: number };

export async function uploadAttachment(
  channelId: string,
  messageId: number,
  file: File,
): Promise<Attachment> {
  const problem = validateFiles([file]);
  if (problem) throw new Error(problem);

  const supabase = createClient();
  const path = buildAttachmentPath(channelId, crypto.randomUUID(), file.name);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || undefined, upsert: false });
  if (uploadError) {
    console.error("[attachments] 업로드 실패:", uploadError.message);
    throw new Error(`"${file.name}" 업로드에 실패했어요.`);
  }

  const { data, error } = await supabase
    .from("attachments")
    .insert({ message_id: messageId, file_url: path, file_name: file.name })
    .select()
    .single();
  if (error || !data) {
    console.error("[attachments] 첨부 정보 저장 실패:", error?.message);
    // 연결 정보가 저장되지 않았으면 올린 파일도 지워서 주인 없는 파일이 남지 않게 한다
    await supabase.storage.from(BUCKET).remove([path]);
    throw new Error(`"${file.name}" 첨부 저장에 실패했어요.`);
  }

  window.dispatchEvent(
    new CustomEvent<AttachmentsEventDetail>(ATTACHMENTS_EVENT, { detail: { messageId } }),
  );
  return data;
}

export type SendFilesResult = {
  messageId: number;
  uploaded: Attachment[];
  failed: { fileName: string; reason: string }[];
};

export async function sendFiles(input: {
  channelId: string;
  parentId?: number | null;
  files: File[];
}): Promise<SendFilesResult> {
  const { channelId, files } = input;
  const problem = validateFiles(files);
  if (problem) throw new Error(problem);

  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("로그인이 필요해요.");

  // 1) 메시지 먼저 만들기 (멱등 전송 규칙: client_id 로 한 번만 저장)
  const { data: message, error } = await supabase
    .from("messages")
    .upsert(
      {
        client_id: crypto.randomUUID(),
        channel_id: channelId,
        user_id: session.user.id,
        parent_id: input.parentId ?? null,
        content: fileMessageContent(files.map((f) => f.name)),
      },
      { onConflict: "client_id", ignoreDuplicates: true },
    )
    .select("id")
    .single();
  if (error || !message) {
    console.error("[attachments] 메시지 저장 실패:", error?.message);
    throw new Error("메시지를 보내지 못했어요. 잠시 후 다시 시도해 주세요.");
  }

  // 2) 파일 붙이기 (동시에 올림)
  const results = await Promise.allSettled(
    files.map((f) => uploadAttachment(channelId, message.id, f)),
  );
  const uploaded: Attachment[] = [];
  const failed: SendFilesResult["failed"] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") uploaded.push(r.value);
    else failed.push({ fileName: files[i].name, reason: String(r.reason?.message ?? r.reason) });
  });

  // 3) 하나도 못 올렸으면 메시지도 지운다
  if (uploaded.length === 0) {
    await supabase.from("messages").delete().eq("id", message.id);
    throw new Error(failed[0]?.reason ?? "파일을 올리지 못했어요.");
  }

  return { messageId: message.id, uploaded, failed };
}
