"use client";
// 오른쪽 스레드 패널: 선택한 메시지(root)와 답글 목록
// 열린 스레드가 없으면 패널 자체를 그리지 않는다 (가운데 메시지 영역이 넓어진다).
// 넓은 화면(lg 이상): 오른쪽 칸. 왼쪽 테두리 손잡이로 폭 조절 (B 의 ThreadResizeHandle, 폭은 브라우저에 기억)
// 좁은 화면: 화면 전체를 덮는 창으로 연다 (닫기 ✕ 는 ThreadView 안에 있다).
// 칸 안의 내용은 slots.tsx 에서 끼운다.
import { useOpenThread, useThreadWidth } from "@/components/chat/threads";
import ThreadResizeHandle from "@/components/chat/ThreadResizeHandle";
import { ThreadBodySlot } from "./slots";

export default function ThreadPanel() {
  const opened = useOpenThread();
  const width = useThreadWidth();
  if (!opened) return null;

  return (
    <aside
      // 폭은 넓은 화면에서만 적용한다 (좁은 화면은 전체 화면). CSS 변수로 넘겨서 lg: 일 때만 쓴다
      style={{ "--thread-w": `${width}px` } as React.CSSProperties}
      className="fixed inset-0 z-40 flex flex-col bg-white lg:relative lg:inset-auto lg:z-auto lg:w-(--thread-w) lg:shrink-0 lg:border-l lg:border-gray-200"
    >
      <div className="hidden lg:block">
        <ThreadResizeHandle />
      </div>
      <header className="flex h-12 shrink-0 items-center border-b border-gray-200 px-4 font-semibold">
        스레드
      </header>
      {/* 스크롤은 ThreadView 안쪽 답글 목록이 맡는다. 이 칸은 높이만 정해 준다 (여기서 스크롤하면 입력창이 밀려남) */}
      <div className="flex min-h-0 flex-1 flex-col">
        <ThreadBodySlot />
      </div>
    </aside>
  );
}
