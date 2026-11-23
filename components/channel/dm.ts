// [C] DM(1:1 대화) 공통 함수 (C-4)
// DM = type 'dm' 인 채널 + 멤버 2명(나, 상대).
// 권한은 DB(RLS)가 지킨다: 내가 멤버인 DM 만 보이고, 채널을 만든 사람만 상대를 멤버로 넣을 수 있다.
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types/database";

export type DmItem = {
  channelId: string;
  partner: Pick<Profile, "id" | "name">;
};

type Supabase = ReturnType<typeof createClient>;

// 두 사람 id 를 정렬해 붙인 이름. 누가 먼저 만들어도 같은 이름이 된다.
export function dmName(a: string, b: string) {
  return `dm:${[a, b].sort().join(":")}`;
}

// 내가 속한 DM 목록 (상대 이름 포함)
export async function fetchMyDms(supabase: Supabase, me: string): Promise<DmItem[]> {
  // 1) 내가 멤버인 DM 채널 id
  const { data: mine, error: mineError } = await supabase
    .from("channel_members")
    .select("channel_id, channels!inner(type)")
    .eq("user_id", me)
    .eq("channels.type", "dm");
  if (mineError) throw mineError;

  const channelIds = (mine ?? []).map((m) => m.channel_id);
  if (channelIds.length === 0) return [];

  // 2) 그 채널들의 다른 멤버(=상대)와 이름
  const { data: others, error: othersError } = await supabase
    .from("channel_members")
    .select("channel_id, profiles(id, name)")
    .in("channel_id", channelIds)
    .neq("user_id", me);
  if (othersError) throw othersError;

  return (others ?? [])
    .filter((o) => o.profiles)
    .map((o) => ({
      channelId: o.channel_id,
      partner: { id: o.profiles!.id, name: o.profiles!.name || "이름 없음" },
    }))
    .sort((a, b) => a.partner.name.localeCompare(b.partner.name, "ko"));
}

// 상대와의 DM 이 있으면 그 채널 id, 없으면 새로 만들어서 id 를 돌려준다
export async function openOrCreateDm(
  supabase: Supabase,
  me: string,
  partnerId: string,
): Promise<string> {
  if (partnerId === me) throw new Error("자기 자신과는 DM 을 만들 수 없어요");

  // 1) 이미 있는 DM 찾기 (나와 상대가 모두 멤버인 dm 채널)
  const existing = await fetchMyDms(supabase, me);
  const found = existing.find((d) => d.partner.id === partnerId);
  if (found) return found.channelId;

  // 2) 없으면 만들기: 채널 → 나(admin) → 상대(member)
  const { data: channel, error: channelError } = await supabase
    .from("channels")
    .insert({ name: dmName(me, partnerId), type: "dm", created_by: me })
    .select("id")
    .single();
  if (channelError) throw channelError;

  const { error: membersError } = await supabase.from("channel_members").insert([
    { channel_id: channel.id, user_id: me, role: "admin" },
    { channel_id: channel.id, user_id: partnerId, role: "member" },
  ]);
  if (membersError) throw membersError;

  return channel.id;
}
