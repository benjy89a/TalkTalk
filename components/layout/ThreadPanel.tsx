"use client";
// 오른쪽 스레드 패널: 선택한 메시지(root)와 답글 목록
// 열린 스레드가 없으면 패널 자체를 그리지 않는다 (가운데 메시지 영역이 넓어진다).
// 좁은 화면(lg 미만)에서는 숨긴다. 칸 안의 내용은 slots.tsx 에서 끼운다.
import { useOpenThread } from "@/components/chat/threads";
import { ThreadBodySlot } from "./slots";

export default function ThreadPanel() {
  const opened = useOpenThread();
  if (!opened) return null;

  return (
    <aside className="hidden w-96 shrink-0 flex-col border-l border-gray-200 lg:flex">
      <header className="flex h-12 shrink-0 items-center border-b border-gray-200 px-4 font-semibold">
        스레드
      </header>
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        <ThreadBodySlot />
      </div>
    </aside>
  );
}
