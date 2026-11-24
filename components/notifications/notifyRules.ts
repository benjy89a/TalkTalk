// 알림 규칙 모음 (D) — DB·화면 없이 값만 계산하는 함수들 (테스트: notifyRules.test.mjs)

/** 나를 멘션한 새 메시지가 오면 브라우저 안에 이 이름의 신호를 보낸다 (unreadStore → NotificationToasts) */
export const MENTION_EVENT = "talktalk:mention";

export type MentionEventDetail = {
  channelId: string;
  messageId: number;
  authorId: string;
  content: string;
  parentId: number | null; // 스레드 댓글이면 원본 메시지 id
  all: boolean; // "@all" 전체 멘션이고 내 이름으로는 부르지 않았으면 true
};

/** 알림 카드가 화면에 머무는 시간 (ms) */
export const TOAST_MS = 10_000;

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

/**
 * 알림 제목
 * - "계섭님이 #프로젝트-알파에서 나를 언급했어요" / DM 이면 "계섭님이 DM에서…"
 * - 스레드 댓글이면 "…#프로젝트-알파 스레드 댓글에서 나를 언급했어요"
 * - @all 이면 "…#프로젝트-알파에서 전체에게 알렸어요"
 */
export function mentionTitle(
  authorName: string,
  channel: { name: string; type: string } | null,
  opts: { thread?: boolean; all?: boolean } = {},
): string {
  const who = authorName.trim() || "누군가";
  const where = channel ? (channel.type === "dm" ? "DM" : `#${channel.name}`) : "";
  const place = `${where}${opts.thread ? `${where ? " " : ""}스레드 댓글` : ""}`;
  const what = opts.all ? "전체에게 알렸어요" : "나를 언급했어요";
  return place ? `${who}님이 ${place}에서 ${what}` : `${who}님이 ${what}`;
}

/**
 * 지금 그 메시지가 이미 화면에 보이는지
 * - 본문 메시지: 그 채널을 보고 있으면 보임
 * - 스레드 댓글: 그 원본의 스레드 패널을 열어 두었을 때만 보임 (채널 본문에는 댓글이 안 나오므로)
 */
export function isOnScreen(input: {
  channelId: string;
  parentId: number | null;
  activeChannelId: string | null;
  openThreadRootId: number | null;
}): boolean {
  const { channelId, parentId, activeChannelId, openThreadRootId } = input;
  if (channelId !== activeChannelId) return false;
  return parentId === null ? true : parentId === openThreadRootId;
}

/**
 * 알림을 띄울지 정한다.
 * - 이미 화면에 보이는 메시지(onScreen)이고 탭이 보이는 상태면 아무것도 안 띄움
 * - 탭이 보이면 화면 안 알림 카드, 탭이 숨겨져 있으면(다른 탭·다른 프로그램) 윈도우 알림
 */
export function chooseNotify(input: {
  onScreen: boolean;
  pageVisible: boolean;
  desktopAllowed: boolean;
}): { toast: boolean; desktop: boolean } {
  const { onScreen, pageVisible, desktopAllowed } = input;
  if (pageVisible) {
    return { toast: !onScreen, desktop: false };
  }
  // 탭이 안 보일 때: 윈도우 알림이 허락돼 있으면 그걸로, 아니면 돌아왔을 때 보이도록 카드로 남겨 둔다
  return { toast: !desktopAllowed, desktop: desktopAllowed };
}

/** 비공개 채널 초대·새 DM 이 생기면 이 이름의 신호를 보낸다 (unreadStore → NotificationToasts) */
export const INVITE_EVENT = "talktalk:invite";

export type InviteEventDetail = {
  channelId: string;
  kind: "private" | "dm";
  title: string;
};

/**
 * 내가 새 채널의 멤버가 됐을 때 알림 문구. 알릴 필요 없으면 null
 * - 내가 만든 채널·DM (내가 한 일) → null
 * - 공개 채널 (내가 직접 참여한 것) → null
 * - DM → "계섭님이 DM을 시작했어요"
 * - 비공개 채널 → "비공개 채널 #인사팀에 초대됐어요" (누가 초대했는지는 DB 에 기록되지 않음)
 */
export function inviteNotice(input: {
  type: string;
  createdBy: string | null;
  me: string;
  channelName: string;
  partnerName: string | null;
}): { kind: "private" | "dm"; title: string } | null {
  const { type, createdBy, me, channelName, partnerName } = input;
  if (createdBy === me) return null;
  if (type === "dm") return { kind: "dm", title: `${partnerName?.trim() || "누군가"}님이 DM을 시작했어요` };
  if (type === "private") return { kind: "private", title: `비공개 채널 #${channelName}에 초대됐어요` };
  return null;
}
