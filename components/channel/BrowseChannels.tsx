"use client";

// [C] 공개 채널 둘러보기 → 참여 / 나가기 (C-3)
// - 참여: channel_members 에 나를 'member' 로 넣는다
// - 나가기: channel_members 에서 내 행을 지운다
// 권한은 DB(RLS)가 지킨다. 막히면 에러 문구를 보여준다.
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Channel } from "@/types/database";
import { primaryButton, secondaryButton, toKoreanChannelError } from "./ui";

type PublicChannel = Pick<Channel, "id" | "name">;

type Props = {
  onChanged?: () => void; // 참여·나가기 후 (예: 사이드바 목록 다시 불러오기)
  onSelect?: (channelId: string) => void; // 참여한 채널로 바로 이동
};

export default function BrowseChannels({ onChanged, onSelect }: Props) {
  const [channels, setChannels] = useState<PublicChannel[] | null>(null);
  const [joined, setJoined] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setChannels([]);
        setError("로그인이 필요해요. 다시 로그인해 주세요.");
        return;
      }

      const [channelsRes, mineRes] = await Promise.all([
        supabase.from("channels").select("id, name").eq("type", "public").order("name"),
        supabase.from("channel_members").select("channel_id").eq("user_id", session.user.id),
      ]);
      if (channelsRes.error) throw channelsRes.error;
      if (mineRes.error) throw mineRes.error;

      setChannels(channelsRes.data ?? []);
      setJoined(new Set((mineRes.data ?? []).map((m) => m.channel_id)));
    } catch (err) {
      setChannels([]);
      setError(toKoreanChannelError(err));
    }
  }, []);

  useEffect(() => {
    // 처음 열릴 때 한 번 불러온다 (Supabase 응답이 오면 상태가 바뀐다)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function join(channelId: string) {
    setBusyId(channelId);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("no session");
      const { error } = await supabase
        .from("channel_members")
        .insert({ channel_id: channelId, user_id: session.user.id, role: "member" });
      if (error) throw error;
      setJoined((prev) => new Set(prev).add(channelId));
      onChanged?.();
      onSelect?.(channelId);
    } catch (err) {
      setError(toKoreanChannelError(err));
    } finally {
      setBusyId(null);
    }
  }

  async function leave(channelId: string, channelName: string) {
    if (!window.confirm(`#${channelName} 채널에서 나갈까요?`)) return;
    setBusyId(channelId);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("no session");
      const { error } = await supabase
        .from("channel_members")
        .delete()
        .eq("channel_id", channelId)
        .eq("user_id", session.user.id);
      if (error) throw error;
      setJoined((prev) => {
        const next = new Set(prev);
        next.delete(channelId);
        return next;
      });
      onChanged?.();
    } catch (err) {
      setError(toKoreanChannelError(err));
    } finally {
      setBusyId(null);
    }
  }

  if (channels === null) {
    return (
      <p role="status" className="text-sm text-gray-600">
        공개 채널을 불러오는 중이에요…
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      {channels.length === 0 ? (
        <p className="text-sm text-gray-600">아직 공개 채널이 없어요.</p>
      ) : (
        <ul className="max-h-80 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200">
          {channels.map((c) => {
            const isMember = joined.has(c.id);
            const busy = busyId === c.id;
            return (
              <li key={c.id} className="flex items-center gap-2 px-3 py-2">
                <span aria-hidden="true" className="text-gray-400">
                  #
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
                {isMember ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => leave(c.id, c.name)}
                    className={secondaryButton}
                  >
                    {busy ? "처리 중…" : "나가기"}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => join(c.id)}
                    className={primaryButton}
                  >
                    {busy ? "처리 중…" : "참여"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
