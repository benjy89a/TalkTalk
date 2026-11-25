"use client";
// [B] 캡쳐 이미지 바로 보내기 — 입력창에 Ctrl+V(⌘+V) 하면 클립보드의 이미지를 바로 첨부 메시지로 보낸다
//
// - 화면 캡쳐(Win+Shift+S, ⌘+Shift+Ctrl+4 등)나 "이미지 복사" 한 그림이 대상
// - 글자만 붙여넣으면 평소처럼 글자가 들어간다 (이미지가 없으면 아무것도 가로채지 않음)
// - 실제 업로드는 D 의 sendFiles(첨부 버튼과 같은 함수)를 가져다 쓴다 → "📎 파일이름" 메시지 + 미리보기
// - 캡쳐 이미지는 이름이 전부 "image.png" 라서, 보낸 시각으로 이름을 붙인다: 캡쳐_2026-11-25_15-30-12.png
// - 스레드 패널은 아직 첨부 미리보기가 없어서 채널 입력창에서만 쓴다 (MessageInput 에서 parentId 로 구분)
import { useCallback, useState, type ClipboardEvent } from "react";
import { sendFiles } from "@/components/attachments/uploadAttachment";

type PasteStatus = { kind: "busy" | "error"; text: string } | null;

const pad = (n: number) => String(n).padStart(2, "0");

// 캡쳐 이미지에 보낸 시각으로 이름을 붙인다 (여러 장이면 _2, _3 …)
export function captureName(type: string, at: Date, index: number, total: number): string {
  const ext = (type.split("/")[1] || "png").replace("jpeg", "jpg").replace(/[^a-z0-9]/g, "") || "png";
  const stamp = `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}_${pad(at.getHours())}-${pad(at.getMinutes())}-${pad(at.getSeconds())}`;
  return `캡쳐_${stamp}${total > 1 ? `_${index + 1}` : ""}.${ext}`;
}

export function usePasteImage(channelId: string, parentId: number | null) {
  const [status, setStatus] = useState<PasteStatus>(null);

  const onPaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      const images = Array.from(e.clipboardData?.items ?? [])
        .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
        .map((item) => item.getAsFile())
        .filter((f): f is File => !!f);
      if (images.length === 0) return; // 글자 붙여넣기는 그대로
      e.preventDefault();

      const now = new Date();
      const files = images.map(
        (f, i) => new File([f], captureName(f.type, now, i, images.length), { type: f.type || "image/png" }),
      );
      setStatus({ kind: "busy", text: files.length > 1 ? `캡쳐 이미지 ${files.length}장 보내는 중…` : "캡쳐 이미지 보내는 중…" });
      sendFiles({ channelId, parentId, files })
        .then((result) => {
          setStatus(
            result.failed.length > 0
              ? { kind: "error", text: `${result.failed.length}장은 보내지 못했어요.` }
              : null,
          );
        })
        .catch((err: unknown) => {
          setStatus({ kind: "error", text: err instanceof Error ? err.message : "이미지를 보내지 못했어요." });
        });
    },
    [channelId, parentId],
  );

  const clearStatus = useCallback(() => setStatus(null), []);
  return { onPaste, status, clearStatus };
}
