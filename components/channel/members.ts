// [C] 채널 멤버 관리 공통 함수 (C-5)
// 진짜 권한 검사는 DB(RLS + guard_member_role 트리거)가 한다.
// 화면에서 버튼을 숨기는 건 편의일 뿐이고, 관리자가 아니면 아래 함수를 억지로 불러도 DB 에서 막힌다.
import { createClient } from "@/lib/supabase/client";
import type { Channel, MemberRole, Profile } from "@/types/database";

type Supabase = ReturnType<typeof createClient>;

export type Member = {
  userId: string;
  name: string;
  role: MemberRole;
};

export type ChannelInfo = Pick<Channel, "id" | "name" | "type">;

// 권한이 없어서 막혔을 때 쓰는 에러 (화면에서 쉬운 문구로 바꾼다)
export class NotAllowedError extends Error {
  code = "42501";
  constructor() {
    super("not allowed");
  }
}

// 채널 정보 + 멤버 목록(이름·역할)
export async function fetchMembers(
  supabase: Supabase,
  channelId: string,
): Promise<{ channel: ChannelInfo | null; members: Member[] }> {
  const [channelRes, membersRes] = await Promise.all([
    supabase.from("channels").select("id, name, type").eq("id", channelId).maybeSingle(),
    supabase
      .from("channel_members")
      .select("user_id, role, profiles(name)")
      .eq("channel_id", channelId),
  ]);
  if (channelRes.error) throw channelRes.error;
  if (membersRes.error) throw membersRes.error;

  const members = (membersRes.data ?? [])
    .map((m) => ({
      userId: m.user_id,
      name: m.profiles?.name || "이름 없음",
      role: m.role,
    }))
    // 관리자 먼저, 그다음 이름순
    .sort((a, b) =>
      a.role === b.role ? a.name.localeCompare(b.name, "ko") : a.role === "admin" ? -1 : 1,
    );

  return { channel: channelRes.data, members };
}

// 초대할 수 있는 사람 = 아직 이 채널 멤버가 아닌 모든 사용자
export async function fetchInvitable(
  supabase: Supabase,
  memberIds: string[],
): Promise<Pick<Profile, "id" | "name">[]> {
  const { data, error } = await supabase.from("profiles").select("id, name").order("name");
  if (error) throw error;
  const taken = new Set(memberIds);
  return (data ?? []).filter((p) => !taken.has(p.id));
}

// 초대: 멤버로 넣는다. 관리자가 아니면 RLS 가 거부한다 (에러 42501).
export async function inviteMember(supabase: Supabase, channelId: string, userId: string) {
  const { error } = await supabase
    .from("channel_members")
    .insert({ channel_id: channelId, user_id: userId, role: "member" });
  if (error) throw error;
}

// 내보내기: 행을 지운다.
// 주의: RLS 로 막힌 delete 는 에러 없이 "0줄 삭제"로 끝난다 → 지워진 줄 수를 확인해서 막힘을 알아낸다.
export async function removeMember(supabase: Supabase, channelId: string, userId: string) {
  const { data, error } = await supabase
    .from("channel_members")
    .delete()
    .eq("channel_id", channelId)
    .eq("user_id", userId)
    .select("user_id");
  if (error) throw error;
  if (!data || data.length === 0) throw new NotAllowedError();
}
