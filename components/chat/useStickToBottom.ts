"use client";
// [B] 새 메시지가 붙을 때 스크롤 처리 (채널 본문 · 스레드 공용)
//  - 처음 불러왔을 때 / 내가 보낸 메시지 / 맨 아래를 보고 있었을 때 → 맨 아래로
//  - 위쪽 예전 메시지를 읽는 중 → 그대로 두고 "새 메시지 n개" 개수를 알려줌
//  - (B-6) 맨 위 근처에 오면 onReachTop 호출, 위에 메시지가 붙어도 보던 위치가 튀지 않게 맞춤
//  - 맨 아래를 보고 있을 때 내용이 길어지면(예: "답글 n개" 가 늦게 붙음) 맨 아래로 따라감
//  - 메시지로 이동(scrollToMessage): 검색 결과로 고른 말풍선을 화면 가운데로
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { HIGHLIGHT_MS } from "./focus";
import type { DisplayMessage } from "./outbox";

// 맨 아래에서 이 정도(px) 안쪽이면 "맨 아래를 보고 있다"고 본다
const BOTTOM_THRESHOLD = 80;
// 맨 위에서 이 정도(px) 안쪽까지 올라오면 이전 메시지를 미리 불러온다
const TOP_THRESHOLD = 200;

export function useStickToBottom(
  messages: DisplayMessage[],
  ready: boolean,
  scope: string,
  onReachTop?: () => Promise<unknown>,
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null); // 스크롤 영역 안의 내용 (높이 변화 감지용)
  const atBottomRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);
  // 사용자가 마지막으로 본(맨 아래였을 때의) 메시지 → 그 뒤에 온 것이 "새 메시지"
  const [seenKey, setSeenKey] = useState<string>();
  const prevLastRef = useRef<{ scope: string; key?: string }>(undefined);

  const last = messages.at(-1);
  const lastKey = last?.client_id;
  const firstKey = messages[0]?.client_id;
  const hasContent = messages.length > 0; // 빈 채널에 첫 메시지가 생기면 감지를 다시 건다
  // 이전 메시지를 부르기 직전의 스크롤 높이·위치 (위에 붙은 뒤 위치를 맞추는 데 씀)
  const anchorRef = useRef<{ height: number; top: number } | null>(null);

  // (B-6) 위에 이전 메시지가 붙었으면, 늘어난 높이만큼 내려서 보던 메시지가 그 자리에 있게 한다
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const anchor = anchorRef.current;
    if (!el || !anchor) return;
    anchorRef.current = null;
    el.scrollTop = el.scrollHeight - anchor.height + anchor.top;
  }, [firstKey]);

  useLayoutEffect(() => {
    if (!ready) return;
    const prev = prevLastRef.current;
    const first = !prev || prev.scope !== scope; // 처음이거나 채널·스레드가 바뀜
    if (!first && prev.key === lastKey) return;
    prevLastRef.current = { scope, key: lastKey };

    const mine = !!last?.status; // 보내는 중 표시가 있으면 내가 방금 보낸 것
    const el = scrollRef.current;
    if (el && (first || mine || atBottomRef.current)) {
      el.scrollTop = el.scrollHeight; // → onScroll 이 불려서 seenKey 갱신
    }
  }, [ready, scope, lastKey, last?.status]);

  // 맨 아래를 보고 있었는데 내용 높이가 늘어나면 맨 아래로 따라간다
  // (메시지를 그린 뒤 답글 수 링크가 늦게 붙어 마지막 메시지가 잘리던 문제)
  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!ready || !el || !content) return;
    const ro = new ResizeObserver(() => {
      if (atBottomRef.current && !anchorRef.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, [ready, scope, hasContent]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD;
    atBottomRef.current = near;
    setAtBottom(near);
    if (near) setSeenKey(lastKey);
    // 맨 위 근처 → 이전 메시지 불러오기 (지금 위치를 기억해 두고)
    if (onReachTop && el.scrollTop < TOP_THRESHOLD && !anchorRef.current) {
      anchorRef.current = { height: el.scrollHeight, top: el.scrollTop };
      // 불러오기가 끝났는데 아무것도 안 붙었으면(더 없음/실패) 기억해 둔 위치를 버린다
      onReachTop().finally(() => {
        anchorRef.current = null;
      });
    }
  }

  // 메시지로 이동 (검색 결과 등): 그 말풍선이 화면 가운데에 오게 스크롤하고 잠깐 노랗게 강조한다. 못 찾으면 false
  // 바로 onScroll 을 불러 "맨 아래를 보고 있음" 상태를 갱신 → 늦게 붙는 내용 때문에 맨 아래로 끌려가지 않게
  // 강조는 화면 요소에 색 클래스를 직접 붙였다 뗀다 (상태로 두면 그때마다 목록 전체를 다시 그림)
  function scrollToMessage(id: number) {
    const el = scrollRef.current;
    const target = el?.querySelector<HTMLElement>(`[data-message-id="${id}"]`);
    if (!el || !target) return false;
    const box = el.getBoundingClientRect();
    const t = target.getBoundingClientRect();
    el.scrollTop += t.top - box.top - (el.clientHeight - t.height) / 2;
    onScroll();
    target.classList.add("bg-yellow-100");
    setTimeout(() => target.classList.remove("bg-yellow-100"), HIGHLIGHT_MS);
    return true;
  }

  function scrollToBottom() {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }

  // 아직 안 본 새 메시지 수
  const seenIndex = seenKey ? messages.findIndex((m) => m.client_id === seenKey) : -1;
  const unseen = atBottom || seenIndex < 0 ? 0 : messages.length - 1 - seenIndex;

  return { scrollRef, contentRef, onScroll, scrollToBottom, scrollToMessage, unseen, atBottom };
}
