// 메시지별 첨부 불러오기 (D-4)
//
// 메시지 50개가 한 번에 그려지면 AttachmentList 도 50개가 동시에 "내 첨부 줘" 한다.
// 그때마다 DB 에 따로 물어보지 않도록, 같은 순간에 들어온 요청을 모아 한 번에 가져온다.
// 비공개 버킷이라 보여줄 때는 createSignedUrls 로 1시간짜리 임시 주소를 만든다.
import { createClient } from "@/lib/supabase/client";
import type { Attachment } from "@/types/database";
import { BUCKET } from "./uploadAttachment";

export type AttachmentView = Attachment & { url: string | null };

const URL_TTL_SECONDS = 60 * 60; // 임시 주소 유효 시간 1시간
const CACHE_MS = 50 * 60 * 1000; // 주소가 만료되기 전(50분)에 새로 받는다

type CacheEntry = { at: number; items: AttachmentView[] };
const cache = new Map<number, CacheEntry>();

let queue = new Map<number, ((items: AttachmentView[]) => void)[]>();
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  const batch = queue;
  queue = new Map();
  timer = null;
  const ids = [...batch.keys()];

  const resolveAll = (byId: Map<number, AttachmentView[]>) => {
    for (const [id, callbacks] of batch) {
      const items = byId.get(id) ?? [];
      cache.set(id, { at: Date.now(), items });
      callbacks.forEach((cb) => cb(items));
    }
  };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("attachments")
    .select("*")
    .in("message_id", ids)
    .order("file_name");
  if (error) {
    console.error("[attachments] 첨부 불러오기 실패:", error.message);
    // 실패는 기억하지 않는다 (다음에 다시 시도)
    for (const callbacks of batch.values()) callbacks.forEach((cb) => cb([]));
    return;
  }

  const rows = data ?? [];
  const urls = new Map<string, string>();
  if (rows.length > 0) {
    const { data: signed, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(
        rows.map((r) => r.file_url),
        URL_TTL_SECONDS,
      );
    if (signError) console.error("[attachments] 임시 주소 만들기 실패:", signError.message);
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
    }
  }

  const byId = new Map<number, AttachmentView[]>();
  for (const r of rows) {
    const list = byId.get(r.message_id) ?? [];
    list.push({ ...r, url: urls.get(r.file_url) ?? null });
    byId.set(r.message_id, list);
  }
  resolveAll(byId);
}

/** 메시지 하나의 첨부 목록. force 면 기억해 둔 값을 무시하고 새로 가져온다 */
export function getAttachments(messageId: number, force = false): Promise<AttachmentView[]> {
  const hit = cache.get(messageId);
  if (!force && hit && Date.now() - hit.at < CACHE_MS) return Promise.resolve(hit.items);

  return new Promise((resolve) => {
    const callbacks = queue.get(messageId) ?? [];
    callbacks.push(resolve);
    queue.set(messageId, callbacks);
    if (!timer) timer = setTimeout(flush, 30); // 30ms 동안 들어온 요청을 모은다
  });
}

/** 파일 내려받기용 임시 주소 (원래 파일 이름으로 저장되게) */
export async function getDownloadUrl(attachment: Attachment): Promise<string | null> {
  const { data, error } = await createClient()
    .storage.from(BUCKET)
    .createSignedUrl(attachment.file_url, 60, { download: attachment.file_name });
  if (error) {
    console.error("[attachments] 다운로드 주소 만들기 실패:", error.message);
    return null;
  }
  return data.signedUrl;
}
