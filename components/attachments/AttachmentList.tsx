"use client";

// 메시지 아래 첨부 표시 (D-4)
//
// 이미지는 미리보기(누르면 새 탭에서 크게), 그 외 파일은 파일명 + 다운로드 버튼.
// CONTRACTS.md 규격: AttachmentList(messageId) → MessageList 의 renderAttachments 칸에 연결
//
// 사용 예 (가장 쉬운 방법):
//   import { renderMessageAttachments } from "@/components/attachments/AttachmentList";
//   <MessageList channelId={channelId} renderAttachments={renderMessageAttachments} />
//
// 직접 쓸 때:
//   <AttachmentList messageId={m.id} createdAt={m.created_at} content={m.content} />
//   createdAt·content 는 생략해도 되지만, 넘기면 다른 사람이 방금 보낸 첨부도 놓치지 않는다
//   (메시지가 먼저 도착하고 첨부 정보가 조금 늦게 저장되는 경우를 위해 잠깐 다시 확인한다)
import { useEffect, useState } from "react";
import { FILE_MESSAGE_PREFIX, isImageFile } from "./fileRules";
import { downloadAttachment, getAttachments, type AttachmentView } from "./attachmentLoader";
import { ATTACHMENTS_EVENT, type AttachmentsEventDetail } from "./uploadAttachment";

type Props = {
  messageId: number;
  createdAt?: string;
  content?: string;
};

const RECENT_MS = 2 * 60 * 1000; // 2분 이내 메시지만 다시 확인
const MAX_RETRIES = 5;

export default function AttachmentList({ messageId, createdAt, content }: Props) {
  const [loaded, setLoaded] = useState<{ messageId: number; items: AttachmentView[] }>();
  const items = loaded?.messageId === messageId ? loaded.items : [];

  useEffect(() => {
    if (messageId <= 0) return; // 아직 저장 안 된(보내는 중) 메시지
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let tries = 0;

    const mayHaveFiles =
      content?.startsWith(FILE_MESSAGE_PREFIX.trim()) &&
      !!createdAt &&
      Date.now() - Date.parse(createdAt) < RECENT_MS;

    const load = (force: boolean) => {
      getAttachments(messageId, force).then((list) => {
        if (cancelled) return;
        setLoaded({ messageId, items: list });
        if (list.length === 0 && mayHaveFiles && tries < MAX_RETRIES) {
          tries += 1;
          retryTimer = setTimeout(() => load(true), 700 * tries);
        }
      });
    };
    load(false);

    // 내가 방금 올린 첨부면 바로 다시 읽는다
    const onChanged = (e: Event) => {
      if ((e as CustomEvent<AttachmentsEventDetail>).detail.messageId === messageId) load(true);
    };
    window.addEventListener(ATTACHMENTS_EVENT, onChanged);
    return () => {
      cancelled = true;
      clearTimeout(retryTimer);
      window.removeEventListener(ATTACHMENTS_EVENT, onChanged);
    };
  }, [messageId, createdAt, content]);

  if (items.length === 0) return null;

  const images = items.filter((a) => isImageFile(a.file_name) && a.url);
  const files = items.filter((a) => !images.includes(a));

  return (
    <div className="flex flex-col gap-2">
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((a) => (
            <a
              key={a.id}
              href={a.url!}
              target="_blank"
              rel="noopener noreferrer"
              className="block overflow-hidden rounded-md border border-gray-200 focus-visible:ring-2 focus-visible:ring-[#1e325c] focus-visible:outline-none"
              title={`${a.file_name} (새 탭에서 크게 보기)`}
            >
              {/* Storage 임시 주소는 매번 바뀌어 next/image 최적화를 쓰지 않는다 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.url!}
                alt={a.file_name}
                loading="lazy"
                className="block max-h-60 max-w-full object-contain"
              />
            </a>
          ))}
        </div>
      )}
      {files.map((a) => (
        <FileRow key={a.id} attachment={a} />
      ))}
    </div>
  );
}

function FileRow({ attachment }: { attachment: AttachmentView }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function download() {
    setBusy(true);
    setFailed(false);
    const ok = await downloadAttachment(attachment);
    setBusy(false);
    if (!ok) setFailed(true);
  }

  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900">
      <span aria-hidden="true">📄</span>
      <span className="min-w-0 flex-1 truncate" title={attachment.file_name}>
        {attachment.file_name}
      </span>
      {failed && <span className="shrink-0 text-xs text-red-700">실패</span>}
      <button
        type="button"
        onClick={download}
        disabled={busy}
        aria-label={`${attachment.file_name} 다운로드`}
        className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-[#1e325c] hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-[#1e325c] focus-visible:outline-none disabled:opacity-50"
      >
        {busy ? "준비 중…" : "다운로드"}
      </button>
    </div>
  );
}

/** MessageList 의 renderAttachments 에 그대로 넘기면 되는 함수 */
export function renderMessageAttachments(message: {
  id: number;
  created_at: string;
  content: string;
}) {
  return (
    <AttachmentList messageId={message.id} createdAt={message.created_at} content={message.content} />
  );
}
