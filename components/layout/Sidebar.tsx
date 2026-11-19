// 왼쪽 사이드바: 워크스페이스 이름 / 채널 목록 / DM 목록
import Placeholder from "./Placeholder";

export default function Sidebar() {
  return (
    <aside className="flex w-64 shrink-0 flex-col bg-[#1e325c] text-white">
      <div className="flex h-12 items-center border-b border-white/10 px-4 font-bold">
        TalkTalk
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto p-3">
        <section>
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase text-white/60">채널</h2>
          <Placeholder owner="C" dark>
            채널 목록 · 채널 만들기/둘러보기 (components/channel)
          </Placeholder>
          <div className="mt-2">
            <Placeholder owner="D" dark>
              미읽음 굵게 · 멘션 배지 (components/notifications)
            </Placeholder>
          </div>
        </section>

        <section>
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase text-white/60">
            다이렉트 메시지
          </h2>
          <Placeholder owner="C" dark>
            DM 목록 · 새 DM 시작 (components/channel)
          </Placeholder>
        </section>
      </nav>

      <div className="border-t border-white/10 p-3">
        <Placeholder owner="C" dark>
          내 프로필 · 로그아웃
        </Placeholder>
      </div>
    </aside>
  );
}
