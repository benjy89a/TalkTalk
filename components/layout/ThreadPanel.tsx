// 오른쪽 스레드 패널: 선택한 메시지(root)와 답글 목록
// 좁은 화면(lg 미만)에서는 숨긴다. 열기/닫기는 B 가 스레드 기능을 만들 때 팀장과 협의해 붙인다.
// 칸 안의 내용은 slots.tsx 에서 끼운다.
import { ThreadBodySlot } from "./slots";

export default function ThreadPanel() {
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
