"use client";

// [C] 사이드바 DM 목록 (C-4)
// 채널 이름 대신 상대방 이름을 보여준다.
//
// 사용 예 (팀장 통합 때):
//   <DmList selectedChannelId={channelId} onSelect={setChannelId} refreshKey={dmRefreshKey} />
//
// ChannelList 와 같은 모양 (CONTRACTS.md):
//   isUnread={isUnread}                                   → 안 읽은 DM 은 이름 굵게 (D 의 useUnread)
//   renderBadge={(id) => <UnreadBadge channelId={id} />}  → 줄 오른쪽 끝 배지 칸 (D)
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchMyDms, type DmItem } from "./dm";

type Props = {
  selectedChannelId: string | null;
  onSelect: (channelId: string) => void;
  refreshKey?: number;
  isUnread?: (channelId: string) => boolean;
  renderBadge?: (channelId: string) => React.ReactNode;
};

const rowClass =
  "flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-white/90 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1e325c]";

export default function DmList({
  selectedChannelId,
  onSelect,
  refreshKey = 0,
  isUnread,
  renderBadge,
}: Props) {
  const [dms, setDms] = useState<DmItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          if (!cancelled) setDms([]);
          return;
        }
        const list = await fetchMyDms(supabase, session.user.id);
        if (!cancelled) {
          setError(null);
          setDms(list);
        }
      } catch {
        if (!cancelled) {
          setDms([]);
          setError("DM 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (dms === null) {
    return (
      <p role="status" className="px-2 py-2 text-sm text-white/60">
        DM을 불러오는 중이에요…
      </p>
    );
  }

  if (error) {
    return (
      <p role="alert" className="px-2 py-2 text-sm text-red-200">
        {error}
      </p>
    );
  }

  if (dms.length === 0) {
    return <p className="px-2 py-2 text-sm text-white/60">아직 DM이 없어요.</p>;
  }

  return (
    <ul className="space-y-0.5">
      {dms.map((dm) => {
        const selected = dm.channelId === selectedChannelId;
        const unread = !selected && (isUnread?.(dm.channelId) ?? false);
        return (
          <li key={dm.channelId}>
            <button
              type="button"
              onClick={() => onSelect(dm.channelId)}
              aria-current={selected ? "page" : undefined}
              className={`${rowClass} ${selected ? "bg-white/15 font-semibold" : ""}`}
            >
              <span
                aria-hidden="true"
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-white/20 text-[10px] font-bold"
              >
                {dm.partner.name.slice(0, 1)}
              </span>
              <span
                className={`min-w-0 flex-1 truncate ${unread ? "font-bold text-white" : ""}`}
              >
                {dm.partner.name}
              </span>
              {unread && <span className="sr-only">(안 읽은 메시지 있음)</span>}
              {renderBadge?.(dm.channelId)}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
