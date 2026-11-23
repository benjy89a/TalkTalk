// 첨부파일 규칙 모음 (D-4) — DB·화면 없이 글자만 다루는 함수들 (테스트: fileRules.test.mjs)

/** 한 파일 최대 크기: 20MB */
export const MAX_FILE_SIZE = 20 * 1024 * 1024;

/** 한 번에 보낼 수 있는 파일 수 */
export const MAX_FILES = 10;

/** 첨부 메시지 본문 앞에 붙는 표시. 이걸 보고 "첨부가 있는 메시지"인지 안다 */
export const FILE_MESSAGE_PREFIX = "📎 ";

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "avif"];

/**
 * Storage 경로에 쓸 수 있게 파일 이름을 바꾼다.
 * Supabase Storage 경로에는 한글·특수문자를 쓸 수 없어서 영문·숫자·. - _ 만 남기고 나머지는 _ 로 바꾼다.
 * (원래 이름은 attachments.file_name 에 그대로 저장되므로 화면에는 원래 이름이 보인다)
 */
export function safeFileName(name: string): string {
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot + 1) : "";
  const clean = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, "_").replace(/_+/g, "_");
  const safeBase = clean(base).replace(/^[._]+|[._]+$/g, "").slice(0, 80) || "file";
  const safeExt = clean(ext).replace(/[._]/g, "").slice(0, 10);
  return safeExt ? `${safeBase}.${safeExt}` : safeBase;
}

/** 팀 규칙 경로: {channel_id}/{uuid}-{파일이름} (첫 폴더가 channel_id 여야 권한이 통과됨) */
export function buildAttachmentPath(channelId: string, uuid: string, fileName: string): string {
  return `${channelId}/${uuid}-${safeFileName(fileName)}`;
}

/** 이미지 파일이면 true (미리보기를 보여줄지 정할 때) */
export function isImageFile(fileName: string): boolean {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return fileName.includes(".") && IMAGE_EXTENSIONS.includes(ext);
}

/** 파일 크기를 사람이 읽기 쉽게: 1536 → "1.5KB" */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace(/\.0$/, "")}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(/\.0$/, "")}MB`;
}

/** 첨부 메시지 본문: "📎 a.png, 보고서.pdf" (너무 길면 "외 N개") */
export function fileMessageContent(fileNames: string[]): string {
  const shown: string[] = [];
  let length = 0;
  for (const name of fileNames) {
    if (shown.length > 0 && length + name.length > 200) break;
    shown.push(name);
    length += name.length + 2;
  }
  const rest = fileNames.length - shown.length;
  return `${FILE_MESSAGE_PREFIX}${shown.join(", ")}${rest > 0 ? ` 외 ${rest}개` : ""}`;
}

/** 보내기 전에 파일을 검사한다. 문제가 있으면 사용자에게 보여줄 문장, 없으면 null */
export function validateFiles(files: { name: string; size: number }[]): string | null {
  if (files.length === 0) return "파일을 골라 주세요.";
  if (files.length > MAX_FILES) return `한 번에 ${MAX_FILES}개까지 보낼 수 있어요.`;
  const big = files.find((f) => f.size > MAX_FILE_SIZE);
  if (big) return `"${big.name}" 파일이 너무 커요. ${formatBytes(MAX_FILE_SIZE)}까지 보낼 수 있어요.`;
  const empty = files.find((f) => f.size === 0);
  if (empty) return `"${empty.name}" 파일이 비어 있어요.`;
  return null;
}
