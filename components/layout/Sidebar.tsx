"use client";
// 왼쪽 사이드바: 워크스페이스 이름 / 채널 목록 / DM 목록 / 내 프로필
// 칸 안의 내용은 slots.tsx 에서 끼운다.
// 넓은 화면(md 이상): 항상 왼쪽에 보인다.
// 좁은 화면(휴대폰): 평소엔 숨겨 두고, 헤더의 ☰ 버튼을 누르면 서랍처럼 왼쪽에서 열린다.
import AdminLink from "./AdminLink";
import { useSelectedChannel } from "./ChannelContext";
import {
  SidebarChannelActionsSlot,
  SidebarChannelListSlot,
  SidebarDmListSlot,
  SidebarProfileSlot,
} from "./slots";

export default function Sidebar() {
  const { sidebarOpen, setSidebarOpen } = useSelectedChannel();

  return (
    <>
      {/* 휴대폰에서 서랍이 열렸을 때 뒤를 어둡게 + 누르면 닫기 */}
      {sidebarOpen && (
        <div
          aria-hidden="true"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col bg-[#1e325c] text-white transition-transform md:static md:z-auto md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-12 items-center justify-between gap-2 border-b border-white/10 px-4 font-bold">
          TalkTalk
          <div className="flex items-center gap-1">
            <AdminLink />
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              aria-label="채널 목록 닫기"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-white/70 hover:bg-white/10 hover:text-white md:hidden"
            >
              ✕
            </button>
          </div>
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
    </>
  );
}
