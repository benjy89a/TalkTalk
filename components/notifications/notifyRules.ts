// 알림 규칙 모음 (D) — DB·화면 없이 값만 계산하는 함수들 (테스트: notifyRules.test.mjs)

/** 나를 멘션한 새 메시지가 오면 브라우저 안에 이 이름의 신호를 보낸다 (unreadStore → NotificationToasts) */
export const MENTION_EVENT = "talktalk:mention";

export type MentionEventDetail = {
  channelId: string;
  messageId: number;
  authorId: string;
  content: string;
};

/** 알림 카드가 화면에 머무는 시간 (ms) */
export const TOAST_MS = 6000;

/** 한 번에 쌓아 두는 알림 카드 수 (넘으면 오래된 것부터 사라짐) */
export const MAX_TOASTS = 3;

/** 탭 제목: 안 읽은 멘션이 있으면 앞에 "(3) " 을 붙인다. 이미 붙어 있던 숫자는 바꾼다 */
export function tabTitle(current: string, mentionCount: number): string {
  const base = current.replace(/^\(\d+\+?\)\s/, "");
  if (mentionCount <= 0) return base;
  return `(${mentionCount > 99 ? "99+" : mentionCount}) ${base}`;
}

/** 알림에 보여줄 본문 미리보기: 줄바꿈은 띄어쓰기로, 너무 길면 … */
export function previewText(content: string, max = 60): string {
  const oneLine = content.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}…` : oneLine;
}

/** 알림 제목: "계섭님이 #프로젝트-알파에서 나를 언급했어요" / DM 이면 "계섭님이 DM에서…" */
export function mentionTitle(authorName: string, channel: { name: string; type: string } | null): string {
  const who = authorName.trim() || "누군가";
  if (!channel) return `${who}님이 나를 언급했어요`;
  const where = channel.type === "dm" ? "DM" : `#${channel.name}`;
  return `${who}님이 ${where}에서 나를 언급했어요`;
}

/**
 * 알림을 띄울지 정한다.
 * - 지금 보고 있는 채널(탭이 보이는 상태)이면 메시지가 이미 눈앞에 있으므로 아무것도 안 띄움
 * - 탭이 보이면 화면 안 알림 카드, 탭이 숨겨져 있으면(다른 탭·다른 프로그램) 윈도우 알림
 */
export function chooseNotify(input: {
  messageChannelId: string;
  activeChannelId: string | null;
  pageVisible: boolean;
  desktopAllowed: boolean;
}): { toast: boolean; desktop: boolean } {
  const { messageChannelId, activeChannelId, pageVisible, desktopAllowed } = input;
  if (pageVisible) {
    return { toast: messageChannelId !== activeChannelId, desktop: false };
  }
  // 탭이 안 보일 때: 윈도우 알림이 허락돼 있으면 그걸로, 아니면 돌아왔을 때 보이도록 카드로 남겨 둔다
  return { toast: !desktopAllowed, desktop: desktopAllowed };
}
