"use client";
// [B] 지금 열린 스레드 (B-5)
//
// "답글" 버튼(메시지 목록, 가운데 칸)과 스레드 패널(ThreadView, 오른쪽 칸)은 화면의 서로 다른 칸이라
// 둘이 같은 값을 보도록 작은 공유 저장소를 둔다. (팀장님은 패널 칸에 <ThreadView /> 만 넣으면 된다)
import { useSyncExternalStore } from "react";

export type OpenThread = { channelId: string; rootId: number } | null;

let current: OpenThread = null;
const listeners = new Set<() => void>();

function set(next: OpenThread) {
  current = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useOpenThread() {
  return useSyncExternalStore(subscribe, () => current, () => null);
}

export function openThread(channelId: string, rootId: number) {
  set({ channelId, rootId });
}

export function closeThread() {
  set(null);
}

// 다른 채널로 옮기면 그 채널의 스레드가 아니므로 닫는다
export function closeThreadIfNotIn(channelId: string) {
  if (current && current.channelId !== channelId) set(null);
}

// ───────── 스레드 패널 폭 (좌우로 끌어서 조절) ─────────
// 패널 틀(ThreadPanel, 팀장님 담당)은 이 값을 style={{ width }} 로 쓰고,
// 손잡이(ThreadResizeHandle)는 이 값을 바꾼다. 브라우저에 기억해 두어 새로고침해도 유지된다.
export const THREAD_WIDTH_DEFAULT = 384; // 예전 고정 폭 w-96
export const THREAD_WIDTH_MIN = 320;
export const THREAD_WIDTH_MAX = 760;
const WIDTH_KEY = "talktalk:threadWidth";

// 가운데 메시지 영역이 이보다 좁아지지 않게 한다 (사이드바 폭 256px = w-64)
const SIDEBAR_WIDTH = 256;
const MAIN_MIN_WIDTH = 480;

function clampWidth(w: number) {
  const roomLeft =
    typeof window === "undefined" ? THREAD_WIDTH_MAX : window.innerWidth - SIDEBAR_WIDTH - MAIN_MIN_WIDTH;
  const max = Math.max(THREAD_WIDTH_MIN, Math.min(THREAD_WIDTH_MAX, roomLeft));
  return Math.round(Math.max(THREAD_WIDTH_MIN, Math.min(max, w)));
}

function readSavedWidth() {
  try {
    const v = Number(localStorage.getItem(WIDTH_KEY));
    return Number.isFinite(v) && v > 0 ? clampWidth(v) : THREAD_WIDTH_DEFAULT;
  } catch {
    return THREAD_WIDTH_DEFAULT;
  }
}

let width: number | null = null; // 처음 쓸 때 브라우저 저장값을 읽는다
const widthListeners = new Set<() => void>();

function subscribeWidth(listener: () => void) {
  widthListeners.add(listener);
  return () => {
    widthListeners.delete(listener);
  };
}

function getWidth() {
  if (width === null) width = readSavedWidth();
  return width;
}

export function useThreadWidth() {
  return useSyncExternalStore(subscribeWidth, getWidth, () => THREAD_WIDTH_DEFAULT);
}

export function setThreadWidth(next: number, save = true) {
  width = clampWidth(next);
  widthListeners.forEach((l) => l());
  if (save) {
    try {
      localStorage.setItem(WIDTH_KEY, String(width));
    } catch {
      // 저장이 막혀 있어도 지금 화면에서는 동작
    }
  }
}
