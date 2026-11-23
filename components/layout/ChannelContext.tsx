"use client";
// "지금 선택한 채널"을 화면 전체가 함께 쓰는 공용 보관함.
// 팀원 컴포넌트는 props 를 이어받을 필요 없이 이 훅 하나로 현재 채널을 안다:
//   const { channelId } = useSelectedChannel();
// 선택된 채널이 없으면 처음엔 #general 을 자동으로 선택한다.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUnread } from "@/components/notifications/useUnread";

type Selected = { id: string; name: string | null };

type ChannelContextValue = {
  channelId: string | null;
  channelName: string | null;
  selectChannel: (id: string) => void;
  // 채널을 새로 만들거나 참여한 뒤 호출하면 사이드바 채널 목록을 다시 불러온다
  channelListKey: number;
  refreshChannelList: () => void;
  // DM 목록도 같은 방식으로 새로 고친다
  dmListKey: number;
  refreshDmList: () => void;
  // 안 읽은 메시지가 있는 채널인지 (D 의 useUnread). 사이드바 목록이 굵게 표시할 때 쓴다
  isUnread: (channelId: string) => boolean;
};

const ChannelContext = createContext<ChannelContextValue | null>(null);

export function ChannelProvider({ children }: { children: React.ReactNode }) {
  const [selected, setSelected] = useState<Selected | null>(null);
  const [channelListKey, setChannelListKey] = useState(0);
  const [dmListKey, setDmListKey] = useState(0);
  // 미읽음 계산은 화면 전체에서 한 번만 한다 (채널 목록·DM 목록이 함께 쓴다)
  const { isUnread } = useUnread(selected?.id ?? null);

  // 처음 열면 #general 을 선택
  useEffect(() => {
    createClient()
      .from("channels")
      .select("id, name")
      .eq("name", "general")
      .eq("type", "public")
      .maybeSingle()
      .then(({ data }) => {
        if (data) setSelected((cur) => cur ?? { id: data.id, name: data.name });
      });
  }, []);

  const selectChannel = useCallback((id: string) => {
    setSelected({ id, name: null });
    // 헤더에 보여줄 채널 이름은 따로 불러온다
    createClient()
      .from("channels")
      .select("name")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setSelected((cur) => (cur?.id === id ? { id, name: data.name } : cur));
      });
  }, []);

  const refreshChannelList = useCallback(() => setChannelListKey((k) => k + 1), []);
  const refreshDmList = useCallback(() => setDmListKey((k) => k + 1), []);

  const value = useMemo(
    () => ({
      channelId: selected?.id ?? null,
      channelName: selected?.name ?? null,
      selectChannel,
      channelListKey,
      refreshChannelList,
      dmListKey,
      refreshDmList,
      isUnread,
    }),
    [selected, selectChannel, channelListKey, refreshChannelList, dmListKey, refreshDmList, isUnread],
  );

  return <ChannelContext.Provider value={value}>{children}</ChannelContext.Provider>;
}

export function useSelectedChannel() {
  const ctx = useContext(ChannelContext);
  if (!ctx) throw new Error("useSelectedChannel 은 ChannelProvider 안에서만 쓸 수 있어요.");
  return ctx;
}
