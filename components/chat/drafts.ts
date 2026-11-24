// [B] 쓰던 글 임시 저장 — 채널(스레드면 스레드)마다 입력창에 쓰다 만 글을 브라우저에 보관
// 다른 채널에 갔다 와도, 새로고침해도 쓰던 글이 그대로 남는다. 보내거나 지우면 같이 지워진다.
// 브라우저 저장소(localStorage)는 이 컴퓨터·이 브라우저에만 남고 서버로는 보내지 않는다.

const PREFIX = "talktalk:draft:";

export function draftKey(channelId: string, parentId: number | null) {
  return `${PREFIX}${channelId}:${parentId ?? "root"}`;
}

export function readDraft(key: string): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return ""; // 사생활 보호 모드 등 저장소를 못 쓰는 브라우저
  }
}

export function writeDraft(key: string, text: string) {
  try {
    if (text.trim()) localStorage.setItem(key, text);
    else localStorage.removeItem(key);
  } catch {
    // 저장소를 못 쓰면 임시 저장만 안 될 뿐, 입력은 그대로 된다
  }
}
