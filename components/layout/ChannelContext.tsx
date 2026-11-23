"use client";
// "지금 선택한 채널"을 화면 전체가 함께 쓰는 공용 보관함.
// 팀원 컴포넌트는 props 를 이어받을 필요 없이 이 훅 하나로 현재 채널을 안다:
//   const { channelId } = useSelectedChannel();
//
// 처음 열 때 고르는 채널 (위에서부터):
//   1) 마지막으로 보던 채널 (브라우저 localStorage 에 기억, 아직 멤버일 때만)
//   2) #general (멤버일 때만 — 나간 사람에게는 열지 않는다)
//   3) 내가 멤버인 채널 중 이름순 첫 번째 (공개·비공개 → 없으면 DM)
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ChannelType } from "@/types/database";
import { useUnread } from "@/components/notifications/useUnread";

type Selected = {
  id: string;
  // 헤더에 보여줄 이름. DM 이면 상대방 이름, 아니면 채널 이름. 불러오는 중이면 null
  name: string | null;
  type: ChannelType | null;
};

type ChannelContextValue = {
  channelId: string | null;
  channelName: string | null;
  // DM 이면 헤더에 # 대신 @ 를 붙인다
  channelType: ChannelType | null;
  // 처음 채널 고르기가 끝났는지 (끝났는데 channelId 가 없으면 참여한 채널이 없는 것)
  ready: boolean;
  selectChannel: (id: string) => void;
  // 채널을 새로 만들거나 참여한 뒤 호출하면 사이드바 채널 목록을 다시 불러온다
  channelListKey: number;
  refreshChannelList: () => void;
  // DM 목록도 같은 방식으로 새로 고친다
  dmListKey: number;
  refreshDmList: () => void;
  // 안 읽은 메시지가 있는 채널인지 (D 의 useUnread). 사이드바 목록이 굵게 표시할 때 쓴다
  isUnread: (channelId: string) => boolean;
  // 좁은 화면(휴대폰)에서 사이드바를 서랍처럼 열고 닫는다. 넓은 화면에서는 항상 보인다
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
};

type ChannelRow = { id: string; name: string; type: ChannelType };

// 내가 멤버인 채널 중 기본으로 열 채널 고르기
//   1) 마지막으로 보던 채널  2) #general  3) 이름순 첫 번째 (공개·비공개 → 없으면 DM)
async function pickDefaultChannel(me: string, preferId: string | null): Promise<ChannelRow | null> {
  const { data: mine } = await createClient()
    .from("channel_members")
    .select("channel_id, channels!inner(name, type)")
    .eq("user_id", me);

  const list: ChannelRow[] = (mine ?? []).map((m) => ({
    id: m.channel_id,
    name: m.channels.name,
    type: m.channels.type,
  }));
  return (
    list.find((c) => c.id === preferId) ??
    list.find((c) => c.type === "public" && c.name === "general") ??
    [...list]
      .sort(
        (a, b) =>
          Number(a.type === "dm") - Number(b.type === "dm") || a.name.localeCompare(b.name, "ko"),
      )
      .at(0) ??
    null
  );
}

const ChannelContext = createContext<ChannelContextValue | null>(null);

// 같은 브라우저를 여러 계정이 써도 섞이지 않게 사용자 id 를 붙여 저장한다
const lastChannelKey = (userId: string) => `talktalk:lastChannel:${userId}`;

function readLastChannel(userId: string): string | null {
  try {
    return localStorage.getItem(lastChannelKey(userId));
  } catch {
    return null; // 개인정보 보호 모드 등에서는 저장소를 못 쓸 수 있다
  }
}

function saveLastChannel(userId: string, channelId: string) {
  try {
    localStorage.setItem(lastChannelKey(userId), channelId);
  } catch {
    // 저장 못 해도 화면은 정상 동작한다 (다음에 열 때 기억만 못 할 뿐)
  }
}

async function getMyId() {
  const { data } = await createClient().auth.getSession();
  return data.session?.user.id ?? null;
}

// 헤더 이름: DM 이면 상대방 이름, 아니면 채널 이름
async function loadTitle(channelId: string, myId: string | null) {
  const supabase = createClient();
  const { data: channel } = await supabase
    .from("channels")
    .select("name, type")
    .eq("id", channelId)
    .maybeSingle();
  if (!channel) return null;
  if (channel.type !== "dm" || !myId) return { name: channel.name, type: channel.type };

  const { data: partner } = await supabase
    .from("channel_members")
    .select("profiles(name)")
    .eq("channel_id", channelId)
    .neq("user_id", myId)
    .limit(1)
    .maybeSingle();
  return { name: partner?.profiles?.name || "이름 없음", type: channel.type };
}

export function ChannelProvider({ children }: { children: React.ReactNode }) {
  const [selected, setSelected] = useState<Selected | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [channelListKey, setChannelListKey] = useState(0);
  const [dmListKey, setDmListKey] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // 미읽음 계산은 화면 전체에서 한 번만 한다 (채널 목록·DM 목록이 함께 쓴다)
  const { isUnread } = useUnread(selected?.id ?? null);

  // 고른 채널의 헤더 이름을 불러와 채운다 (그 사이 다른 채널로 바꿨으면 무시)
  const fillTitle = useCallback((id: string, me: string | null) => {
    loadTitle(id, me).then((title) => {
      if (title) setSelected((cur) => (cur?.id === id ? { id, ...title } : cur));
    });
  }, []);

  // 처음 열 때 채널 고르기
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const me = await getMyId();
      if (cancelled) return;
      setMyId(me);
      if (!me) {
        setReady(true);
        return;
      }

      const pick = await pickDefaultChannel(me, readLastChannel(me));
      if (cancelled) return;

      if (pick) {
        // 사용자가 그 사이 직접 고른 채널이 있으면 그대로 둔다
        setSelected((cur) => cur ?? { id: pick.id, name: pick.type === "dm" ? null : pick.name, type: pick.type });
        if (pick.type === "dm") fillTitle(pick.id, me);
        saveLastChannel(me, pick.id);
      }
      setReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [fillTitle]);

  const selectChannel = useCallback(
    (id: string) => {
      setSelected({ id, name: null, type: null });
      setReady(true);
      setSidebarOpen(false); // 휴대폰에서 채널을 고르면 서랍을 닫고 대화 화면을 보여준다
      fillTitle(id, myId);
      if (myId) saveLastChannel(myId, id);
    },
    [fillTitle, myId],
  );

  const refreshChannelList = useCallback(() => setChannelListKey((k) => k + 1), []);
  const refreshDmList = useCallback(() => setDmListKey((k) => k + 1), []);

  // 보던 채널에서 나갔거나(나가기·내보내기) 채널이 삭제됐으면 → 다른 채널로 옮긴다.
  // 목록을 새로 고칠 때(참여·나가기·초대 등)마다 "아직 멤버인지" 확인한다.
  const selectedId = selected?.id ?? null;
  useEffect(() => {
    if (!myId || !selectedId) return;
    let cancelled = false;
    (async () => {
      const { data } = await createClient()
        .from("channel_members")
        .select("channel_id")
        .eq("channel_id", selectedId)
        .eq("user_id", myId)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        // 아직 멤버면 그대로. 채널 이름이 바뀌었을 수 있으니 헤더 이름만 다시 읽는다
        fillTitle(selectedId, myId);
        return;
      }

      const pick = await pickDefaultChannel(myId, null);
      if (cancelled) return;
      setSelected((cur) => {
        if (cur?.id !== selectedId) return cur; // 그 사이 사용자가 직접 다른 채널을 골랐으면 그대로
        return pick ? { id: pick.id, name: pick.type === "dm" ? null : pick.name, type: pick.type } : null;
      });
      if (pick) {
        if (pick.type === "dm") fillTitle(pick.id, myId);
        saveLastChannel(myId, pick.id);
      }
    })();
    return () => {
      cancelled = true;
    };
    // 목록 새로고침 신호(channelListKey, dmListKey)가 올 때만 다시 확인한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelListKey, dmListKey, myId]);

  // 다른 탭에 있다가 돌아오면 목록을 새로 고친다.
  // (channel_members 는 실시간 알림이 없어서, 남이 나를 초대·내보내기·DM 시작한 것을 여기서 따라잡는다)
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      setChannelListKey((k) => k + 1);
      setDmListKey((k) => k + 1);
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  const value = useMemo(
    () => ({
      channelId: selected?.id ?? null,
      channelName: selected?.name ?? null,
      channelType: selected?.type ?? null,
      ready,
      selectChannel,
      channelListKey,
      refreshChannelList,
      dmListKey,
      refreshDmList,
      isUnread,
      sidebarOpen,
      setSidebarOpen,
    }),
    [
      selected,
      ready,
      selectChannel,
      channelListKey,
      refreshChannelList,
      dmListKey,
      refreshDmList,
      isUnread,
      sidebarOpen,
    ],
  );

  return <ChannelContext.Provider value={value}>{children}</ChannelContext.Provider>;
}

export function useSelectedChannel() {
  const ctx = useContext(ChannelContext);
  if (!ctx) throw new Error("useSelectedChannel 은 ChannelProvider 안에서만 쓸 수 있어요.");
  return ctx;
}
