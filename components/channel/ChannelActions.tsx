"use client";

// [C] 사이드바 채널 목록 아래의 "+ 채널 만들기" / "채널 둘러보기" 버튼 (C-3)
// 누르면 가운데에 대화상자가 열린다.
//
// 사용 예 (팀장 통합 때):
//   <ChannelActions onChanged={() => setRefreshKey((k) => k + 1)} onSelect={setChannelId} />
//   onChanged 로 ChannelList 의 refreshKey 를 바꿔 주면 목록이 새로 고쳐진다.
import { useState } from "react";
import BrowseChannels from "./BrowseChannels";
import CreateChannelForm from "./CreateChannelForm";
import { ChannelDialog } from "./ui";

type Props = {
  onChanged?: () => void;
  onSelect?: (channelId: string) => void;
};

const sidebarButton =
  "flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1e325c]";

export default function ChannelActions({ onChanged, onSelect }: Props) {
  const [open, setOpen] = useState<"create" | "browse" | null>(null);
  const close = () => setOpen(null);

  return (
    <div className="space-y-0.5">
      <button type="button" onClick={() => setOpen("create")} className={sidebarButton}>
        <span aria-hidden="true" className="w-4 text-center">
          +
        </span>
        채널 만들기
      </button>
      <button type="button" onClick={() => setOpen("browse")} className={sidebarButton}>
        <span aria-hidden="true" className="w-4 text-center">
          🔍
        </span>
        채널 둘러보기
      </button>

      {open === "create" && (
        <ChannelDialog title="새 채널 만들기" onClose={close}>
          <CreateChannelForm
            onCancel={close}
            onCreated={(id) => {
              close();
              onChanged?.();
              onSelect?.(id);
            }}
          />
        </ChannelDialog>
      )}

      {open === "browse" && (
        <ChannelDialog title="공개 채널 둘러보기" onClose={close}>
          <BrowseChannels onChanged={onChanged} onSelect={onSelect} />
        </ChannelDialog>
      )}
    </div>
  );
}
