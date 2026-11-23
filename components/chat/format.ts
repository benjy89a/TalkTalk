// [B] 시간 표시·메시지 묶기 규칙
import type { ChatMessage } from "./types";

// 같은 사람이 이 시간 안에 이어서 보낸 메시지는 이름·시간을 생략하고 묶어서 보여준다
const GROUP_WINDOW_MS = 5 * 60 * 1000;

// "오후 3:42"
export function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ko-KR", {
    hour: "numeric",
    minute: "2-digit",
  });
}

// "15:42" — 묶인 메시지에 마우스를 올렸을 때 왼쪽 좁은 칸에 보여주는 짧은 시간
export function formatShortTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// "11월 23일 월요일" (올해가 아니면 "2025년 11월 23일 일요일")
export function formatDateDivider(iso: string) {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString("ko-KR", {
    year: sameYear ? undefined : "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
}

export function isSameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

// 이전 메시지와 묶어서(이름·시간 생략) 보여줄지
export function isGroupedWith(prev: ChatMessage | undefined, cur: ChatMessage) {
  if (!prev) return false;
  if (prev.user_id !== cur.user_id) return false;
  if (!isSameDay(prev.created_at, cur.created_at)) return false;
  const gap = new Date(cur.created_at).getTime() - new Date(prev.created_at).getTime();
  return gap >= 0 && gap < GROUP_WINDOW_MS;
}
