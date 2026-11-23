// 왼쪽 사이드바: 워크스페이스 이름 / 채널 목록 / DM 목록 / 내 프로필
// 칸 안의 내용은 slots.tsx 에서 끼운다.
import AdminLink from "./AdminLink";
import {
  SidebarChannelActionsSlot,
  SidebarChannelListSlot,
  SidebarDmListSlot,
  SidebarProfileSlot,
} from "./slots";

export default function Sidebar() {
  return (
    <aside className="flex w-64 shrink-0 flex-col bg-[#1e325c] text-white">
      <div className="flex h-12 items-center justify-between border-b border-white/10 px-4 font-bold">
        TalkTalk
        <AdminLink />
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto p-3">
        <section>
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase text-white/60">채널</h2>
          <SidebarChannelListSlot />
          <div className="mt-2">
            <SidebarChannelActionsSlot />
          </div>
        </section>

        <section>
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase text-white/60">
            다이렉트 메시지
          </h2>
          <SidebarDmListSlot />
        </section>
      </nav>

      <div className="border-t border-white/10 p-3">
        <SidebarProfileSlot />
      </div>
    </aside>
  );
}
