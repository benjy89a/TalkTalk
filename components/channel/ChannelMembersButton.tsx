"use client";

// [C] 채널 멤버 보기 · 관리자 초대/내보내기 (C-5)
// - 누구나: 이 채널 멤버 목록(이름, 관리자 표시)을 본다
// - 이 채널을 관리할 수 있는 사람만 (DB 함수 can_manage_channel = 채널 관리자, 또는 공개 채널이면 서비스 관리자):
//   멤버 초대 · 내보내기 버튼이 보인다 (DM 은 2명 고정이라 제외)
// - 버튼을 숨기는 건 편의일 뿐, 진짜 권한 검사는 DB(RLS)가 한다
//
// 사용 예 (팀장 통합 때, 메시지 영역 헤더 오른쪽 등):
//   const { channelId, refreshChannelList } = useSelectedChannel();
//   {channelId && <ChannelMembersButton channelId={channelId} onChanged={refreshChannelList} />}
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types/database";
import {
  fetchInvitable,
  fetchMembers,
  inviteMember,
  removeMember,
  type ChannelInfo,
  type Member,
} from "./members";
import { ChannelDialog, primaryButton, secondaryButton, toKoreanChannelError } from "./ui";

type Props = {
  channelId: string;
  onChanged?: () => void; // 초대·내보내기 후 (예: 사이드바 목록 새로고침)
};

type Person = Pick<Profile, "id" | "name">;

function MembersPanel({ channelId, onChanged }: Props) {
  const [me, setMe] = useState<string | null>(null);
  const [channel, setChannel] = useState<ChannelInfo | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invitable, setInvitable] = useState<Person[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // DB 에 물어본 "이 채널을 관리할 수 있는가" (확인 전·실패 시 false = 버튼 숨김)
  const [canManageChannel, setCanManageChannel] = useState(false);

  const load = useCallback(async () => {
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("no session");
      setMe(session.user.id);
      const [res, manage] = await Promise.all([
        fetchMembers(supabase, channelId),
        supabase.rpc("can_manage_channel", { cid: channelId }),
      ]);
      setChannel(res.channel);
      setMembers(res.members);
      setCanManageChannel(!manage.error && manage.data === true);
    } catch (err) {
      setMembers([]);
      setError(toKoreanChannelError(err));
    }
  }, [channelId]);

  useEffect(() => {
    // 대화상자가 열릴 때 한 번 불러온다 (setState 는 await 뒤에 일어남)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // 관리 버튼은 DB 함수 can_manage_channel 이 true 일 때만 (팀장 PR #35 기준). DM 은 2명 고정이라 제외
  const canManage = canManageChannel && channel !== null && channel.type !== "dm";

  async function openInvite() {
    setError(null);
    try {
      const list = await fetchInvitable(
        createClient(),
        (members ?? []).map((m) => m.userId),
      );
      setInvitable(list);
    } catch (err) {
      setError(toKoreanChannelError(err));
    }
  }

  async function invite(person: Person) {
    setBusyId(person.id);
    setError(null);
    setNotice(null);
    try {
      await inviteMember(createClient(), channelId, person.id);
      setInvitable((prev) => prev?.filter((p) => p.id !== person.id) ?? null);
      setNotice(`${person.name || "이름 없음"} 님을 초대했어요.`);
      await load();
      onChanged?.();
    } catch (err) {
      setError(toKoreanChannelError(err));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(member: Member) {
    if (!window.confirm(`${member.name} 님을 이 채널에서 내보낼까요?`)) return;
    setBusyId(member.userId);
    setError(null);
    setNotice(null);
    try {
      await removeMember(createClient(), channelId, member.userId);
      setNotice(`${member.name} 님을 내보냈어요.`);
      setInvitable(null); // 초대 목록은 다시 열 때 새로 불러온다 (내보낸 사람도 다시 초대할 수 있게)
      await load();
      onChanged?.();
    } catch (err) {
      setError(toKoreanChannelError(err));
    } finally {
      setBusyId(null);
    }
  }

  if (members === null) {
    return (
      <p role="status" className="text-sm text-gray-600">
        멤버를 불러오는 중이에요…
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
      {notice && (
        <p role="status" className="rounded-md bg-blue-50 px-3 py-2 text-sm text-blue-700">
          {notice}
        </p>
      )}

      <p className="text-sm text-gray-600">멤버 {members.length}명</p>
      <ul className="max-h-64 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200">
        {members.map((m) => (
          <li key={m.userId} className="flex items-center gap-3 px-3 py-2">
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-[#1e325c] text-xs font-bold text-white"
            >
              {m.name.slice(0, 1)}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm">
              {m.name}
              {m.userId === me && <span className="text-gray-500"> (나)</span>}
            </span>
            {m.role === "admin" && (
              <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                관리자
              </span>
            )}
            {canManage && m.userId !== me && (
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => remove(m)}
                className={secondaryButton}
              >
                {busyId === m.userId ? "처리 중…" : "내보내기"}
              </button>
            )}
          </li>
        ))}
      </ul>

      {canManage && invitable === null && (
        <button type="button" onClick={openInvite} className={primaryButton}>
          + 멤버 초대
        </button>
      )}

      {canManage && invitable !== null && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-700">누구를 초대할까요?</p>
          {invitable.length === 0 ? (
            <p className="text-sm text-gray-600">초대할 수 있는 사람이 없어요.</p>
          ) : (
            <ul className="max-h-48 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200">
              {invitable.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-sm">{p.name || "이름 없음"}</span>
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() => invite(p)}
                    className={primaryButton}
                  >
                    {busyId === p.id ? "처리 중…" : "초대"}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button type="button" onClick={() => setInvitable(null)} className={secondaryButton}>
            닫기
          </button>
        </div>
      )}
    </div>
  );
}

export default function ChannelMembersButton({ channelId, onChanged }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 py-1 text-sm text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e325c]"
      >
        <span aria-hidden="true">👥</span>
        멤버
      </button>
      {open && (
        <ChannelDialog title="채널 멤버" onClose={() => setOpen(false)}>
          <MembersPanel channelId={channelId} onChanged={onChanged} />
        </ChannelDialog>
      )}
    </>
  );
}
