"use client";

// [C] 사이드바 채널 목록 (C-2)
// - 내가 멤버인 공개(public)·비공개(private) 채널만 보여준다. DM 은 DmList 에서 따로 보여준다.
// - 읽을 수 있는 채널은 DB 의 RLS(권한 규칙)가 정한다. 화면에서 따로 권한을 지어내지 않는다.
// - 선택된 채널을 화면 전체(메시지 영역)에 연결하는 건 팀장이 통합 때 한다.
//
// 사용 예:
//   <ChannelList selectedChannelId={channelId} onSelect={setChannelId} />
//   채널을 새로 만들거나 참여한 뒤 목록을 다시 불러오려면 refreshKey 값을 바꿔 준다.
//
// 미읽음 굵게 (D-2 useUnread 와 연결):
//   const { isUnread } = useUnread(channelId);
//   <ChannelList selectedChannelId={channelId} onSelect={setChannelId} isUnread={isUnread} />
//   isUnread 를 안 넘기면 굵게 표시 없이 그대로 동작한다.
//
// 배지 칸 (CONTRACTS.md — D 의 UnreadBadge 등을 채널 줄 오른쪽 끝에 끼움):
//   <ChannelList ... renderBadge={(id) => <UnreadBadge channelId={id} />} />
//   renderBadge 를 안 넘기거나 null 을 돌려주면 아무것도 그리지 않는다.
//
// 채널 이름 옆 "(13명)": 그 채널의 전체 멤버 수. 내가 멤버인 채널의 멤버 줄은 RLS 상 읽을 수 있어서
// 한 번에 가져와 센다. 목록을 다시 불러올 때(refreshKey) 함께 새로 센다.
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Channel } from "@/types/database";

type ChannelItem = Pick<Channel, "id" | "name" | "type">;

type Props = {
  selectedChannelId: string | null;
  onSelect: (channelId: string) => void;
  refreshKey?: number;
  isUnread?: (channelId: string) => boolean; // D 의 useUnread().isUnread 를 그대로 넘기면 된다
  renderBadge?: (channelId: string) => React.ReactNode; // 채널 줄 오른쪽 끝 칸 (D 배지)
};

const rowClass =
  "flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-white/90 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1e325c]";

export default function ChannelList({
  selectedChannelId,
  onSelect,
  refreshKey = 0,
  isUnread,
  renderBadge,
}: Props) {
  const [channels, setChannels] = useState<ChannelItem[] | null>(null);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError(null);
      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) {
          if (!cancelled) setChannels([]);
          return;
        }

        // channel_members(내 멤버십) → channels(채널 정보) 를 한 번에 가져온다
        const { data, error } = await supabase
          .from("channel_members")
          .select("channels(id, name, type)")
          .eq("user_id", session.user.id);
        if (error) throw error;

        const list = (data ?? [])
          .map((row) => row.channels)
          .filter((c): c is ChannelItem => !!c && c.type !== "dm")
          .sort((a, b) => a.name.localeCompare(b.name, "ko"));

        if (!cancelled) setChannels(list);

        // 채널별 멤버 수 (실패해도 목록은 그대로 보여 주고 숫자만 뺀다)
        if (list.length > 0) {
          const { data: rows, error: countError } = await supabase
            .from("channel_members")
            .select("channel_id")
            .in(
              "channel_id",
              list.map((c) => c.id),
            );
          if (!countError && !cancelled) {
            const counts: Record<string, number> = {};
            for (const r of rows ?? []) counts[r.channel_id] = (counts[r.channel_id] ?? 0) + 1;
            setMemberCounts(counts);
          }
        }
      } catch {
        if (!cancelled) {
          setChannels([]);
          setError("채널 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  if (channels === null) {
    return (
      <p role="status" className="px-2 py-2 text-sm text-white/60">
        채널을 불러오는 중이에요…
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

  if (channels.length === 0) {
    return <p className="px-2 py-2 text-sm text-white/60">아직 참여한 채널이 없어요.</p>;
  }

  return (
    <ul className="space-y-0.5">
      {channels.map((channel) => {
        const selected = channel.id === selectedChannelId;
        const isPrivate = channel.type === "private";
        const unread = !selected && (isUnread?.(channel.id) ?? false);
        const count = memberCounts[channel.id];
        return (
          <li key={channel.id}>
            <button
              type="button"
              onClick={() => onSelect(channel.id)}
              aria-current={selected ? "page" : undefined}
              className={`${rowClass} ${selected ? "bg-white/15 font-semibold" : ""}`}
            >
              <span aria-hidden="true" className="w-4 shrink-0 text-center text-white/60">
                {isPrivate ? "🔒" : "#"}
              </span>
              <span className={`min-w-0 truncate ${unread ? "font-bold text-white" : ""}`}>
                {channel.name}
              </span>
              {/* 이름이 길면 이름만 줄이고, 인원수는 항상 보이게 */}
              {count !== undefined && (
                <span className="shrink-0 text-xs font-normal text-white/50">
                  <span aria-hidden="true">({count}명)</span>
                  <span className="sr-only">멤버 {count}명</span>
                </span>
              )}
              <span className="flex-1" aria-hidden="true" />
              {isPrivate && <span className="sr-only">(비공개 채널)</span>}
              {unread && <span className="sr-only">(안 읽은 메시지 있음)</span>}
              {renderBadge?.(channel.id)}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
