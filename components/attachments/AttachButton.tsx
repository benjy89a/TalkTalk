"use client";

// 첨부 버튼 (D-4)
//
// 누르면 파일 선택 창이 열리고, 고른 파일을 "📎 파일이름" 메시지로 바로 보낸다.
// CONTRACTS.md 규격: AttachButton(channelId) → MessageInput 의 extras 칸에 끼운다.
//
// 사용 예:
//   import AttachButton from "@/components/attachments/AttachButton";
//   <MessageInput channelId={channelId} extras={<AttachButton channelId={channelId} />} />
//   스레드 답글 입력창이면 parentId 도 넘긴다: <AttachButton channelId={id} parentId={원본id} />
//
// - 여러 파일을 한 번에 고를 수 있다 (최대 10개, 한 파일 20MB)
// - 올리는 동안 버튼이 "올리는 중…"으로 바뀌고, 실패하면 버튼 옆에 이유가 보인다
import { useRef, useState } from "react";
import { sendFiles } from "./uploadAttachment";

type Props = {
  channelId: string;
  parentId?: number | null;
};

export default function AttachButton({ channelId, parentId = null }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "info"; text: string } | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = ""; // 같은 파일을 다시 골라도 동작하게 비운다
    if (files.length === 0) return;

    setBusy(true);
    setMessage(null);
    try {
      const result = await sendFiles({ channelId, parentId, files });
      if (result.failed.length > 0) {
        setMessage({
          kind: "error",
          text: `${result.failed.length}개는 올리지 못했어요: ${result.failed.map((f) => f.fileName).join(", ")}`,
        });
      }
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "파일을 보내지 못했어요." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <input
        ref={inputRef}
        type="file"
        multiple
        onChange={onChange}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        aria-label="파일 첨부"
        className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-[#1e325c] focus-visible:ring-offset-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
      >
        <span aria-hidden="true">📎</span>
        {busy ? "올리는 중…" : "파일"}
      </button>
      {message && (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`min-w-0 truncate text-xs ${message.kind === "error" ? "text-red-700" : "text-gray-600"}`}
          title={message.text}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
