"use client";

// [C] 채널 멤버 보기 · 관리자 초대/내보내기 (C-5)
// - 누구나: 이 채널 멤버 목록(이름, 관리자 표시)을 본다
// - 이 채널을 관리할 수 있는 사람만 (DB 함수 can_manage_channel = 채널 관리자, 또는 공개 채널이면 서비스 관리자):
//   멤버 초대 · 내보내기 버튼이 보인다 (DM 은 2명 고정이라 제외)
// - 관리할 수 있는 사람만: 관리자 지정·해제 (마지막 관리자는 해제 못 함), 채널 이름 변경·삭제 (#general 삭제 불가)
// - 서비스 관리자에게는 "서비스 관리자" 배지 (채널 관리자 배지와 색을 다르게)
// - 누구나(DM 제외): "채널 나가기" — 비공개 채널은 둘러보기에 안 나와서 여기가 유일한 나가는 길
//   · 내가 유일한 관리자이고 다른 멤버가 있으면 먼저 다른 사람을 관리자로 지정하도록 막는다
//   · 비공개 채널에 나 혼자면 나가면 아무도 못 들어오므로 "채널 삭제"를 안내한다
// - 버튼을 숨기는 건 편의일 뿐, 진짜 권한 검사는 DB(RLS)가 한다
//
// 사용 예 (팀장 통합 때, 메시지 영역 헤더 오른쪽 등):
//   const { channelId, refreshChannelList } = useSelectedChannel();
//   {channelId && <ChannelMembersButton channelId={channelId} onChanged={refreshChannelList} />}
//   (채널을 삭제하면 onChanged 로 목록이 새로 고쳐진다. 삭제 후 다른 채널로 옮기려면 onDeleted 를 쓰면 된다)
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MemberRole, Profile } from "@/types/database";
import {
  deleteChannel,
  fetchAppAdminIds,
  fetchInvitable,
  fetchMembers,
  inviteMember,
  removeMember,
  renameChannel,
  setMemberRole,
  type ChannelInfo,
  type Member,
} from "./members";
import OnlineDot from "./OnlineDot";
import { useOnlineUsers } from "./presence";
import { ChannelDialog, primaryButton, secondaryButton, textInput, toKoreanChannelError } from "./ui";

type Props = {
  channelId: string;
  onChanged?: () => void; // 초대·내보내기·이름 변경·나가기 후 (예: 사이드바 목록 새로고침)
  onDeleted?: () => void; // 채널을 삭제한 뒤 (예: 선택 채널 비우기)
};

type PanelProps = Props & {
  onLeft?: () => void; // 내가 채널에서 나간 뒤 (대화상자 닫기)
};

type Person = Pick<Profile, "id" | "name">;

const MAX_NAME = 30;
const smallButton = `${secondaryButton} min-h-8 px-2 py-1 text-xs`;

function MembersPanel({ channelId, onChanged, onDeleted, onLeft }: PanelProps) {
  const [me, setMe] = useState<string | null>(null);
  const [channel, setChannel] = useState<ChannelInfo | null>(null);
  const [members, setMembers] = useState<Member[] | null>(null);
  const [invitable, setInvitable] = useState<Person[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // DB 에 물어본 "이 채널을 관리할 수 있는가" (확인 전·실패 시 false = 버튼 숨김)
  const [canManageChannel, setCanManageChannel] = useState(false);
  const [appAdminIds, setAppAdminIds] = useState<Set<string>>(new Set());
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState("");
  // 접속 중인 사용자 (멤버 이름 옆 초록 점)
  const online = useOnlineUsers();

  const load = useCallback(async () => {
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("no session");
      setMe(session.user.id);
      const [res, manage, admins] = await Promise.all([
        fetchMembers(supabase, channelId),
        supabase.rpc("can_manage_channel", { cid: channelId }),
        fetchAppAdminIds(supabase).catch(() => new Set<string>()), // 배지는 선택 기능이라 실패해도 계속
      ]);
      setChannel(res.channel);
      setMembers(res.members);
      setCanManageChannel(!manage.error && manage.data === true);
      setAppAdminIds(admins);
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
  const adminCount = (members ?? []).filter((m) => m.role === "admin").length;
  const isGeneral = channel?.type === "public" && channel.name === "general";
  const myRole = (members ?? []).find((m) => m.userId === me)?.role;
  const memberCount = (members ?? []).length;
  // 나가기를 막아야 하는 경우와 그 이유 (null 이면 나갈 수 있음)
  const leaveBlockedReason =
    myRole === "admin" && adminCount === 1 && memberCount > 1
      ? "내가 이 채널의 유일한 관리자예요. 나가기 전에 다른 멤버를 \"관리자로\" 지정해 주세요."
      : channel?.type === "private" && memberCount === 1
        ? "혼자 남은 비공개 채널이에요. 나가면 아무도 들어올 수 없어서, 나가는 대신 \"채널 삭제\"를 이용해 주세요."
        : null;

  async function leaveChannel() {
    if (!channel || !me) return;
    if (!window.confirm(`#${channel.name} 채널에서 나갈까요?\n다시 들어오려면 ${channel.type === "private" ? "관리자의 초대가" : "둘러보기에서 참여가"} 필요해요.`)) {
      return;
    }
    setBusyId("leave");
    setError(null);
    setNotice(null);
    try {
      await removeMember(createClient(), channelId, me);
      onChanged?.();
      onLeft?.();
    } catch (err) {
      setError(toKoreanChannelError(err));
      setBusyId(null);
    }
  }

  async function changeRole(member: Member, role: MemberRole) {
    const label = role === "admin" ? "관리자로 지정할까요?" : "관리자에서 해제할까요?";
    if (!window.confirm(`${member.name} 님을 ${label}`)) return;
    setBusyId(member.userId);
    setError(null);
    setNotice(null);
    try {
      await setMemberRole(createClient(), channelId, member.userId, role);
      setNotice(
        role === "admin" ? `${member.name} 님을 관리자로 지정했어요.` : `${member.name} 님을 관리자에서 해제했어요.`,
      );
      await load();
    } catch (err) {
      setError(toKoreanChannelError(err));
    } finally {
      setBusyId(null);
    }
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (!channel) return;
    const name = newName.trim();
    if (!name) return setError("채널 이름을 입력해 주세요.");
    if (name.length > MAX_NAME) return setError(`채널 이름은 ${MAX_NAME}자 이하로 정해 주세요.`);
    if (name === channel.name) return setRenaming(false);
    setBusyId("channel");
    setError(null);
    setNotice(null);
    try {
      await renameChannel(createClient(), channelId, name);
      setNotice(`채널 이름을 #${name} 으로 바꿨어요.`);
      setRenaming(false);
      await load();
      onChanged?.();
    } catch (err) {
      setError(toKoreanChannelError(err));
    } finally {
      setBusyId(null);
    }
  }

  async function removeChannel() {
    if (!channel) return;
    if (
      !window.confirm(
        `#${channel.name} 채널을 정말 삭제할까요?\n채널 안의 메시지·첨부·멤버 기록이 모두 지워지고, 되돌릴 수 없어요.`,
      )
    ) {
      return;
    }
    setBusyId("channel");
    setError(null);
    setNotice(null);
    try {
      await deleteChannel(createClient(), channelId);
      onChanged?.();
      onDeleted?.();
    } catch (err) {
      setError(toKoreanChannelError(err));
      setBusyId(null);
    }
  }

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

      <p className="text-sm text-gray-600">
        멤버 {members.length}명
        <span className="ml-2 inline-flex items-center gap-1 text-emerald-700">
          <OnlineDot online className="h-2 w-2" />
          접속 중 {members.filter((m) => online.has(m.userId)).length}명
        </span>
      </p>
      <ul className="max-h-64 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200">
        {members.map((m) => (
          <li key={m.userId} className="flex items-center gap-3 px-3 py-2">
            <span className="relative shrink-0">
              <span
                aria-hidden="true"
                className="flex h-7 w-7 items-center justify-center rounded bg-[#1e325c] text-xs font-bold text-white"
              >
                {m.name.slice(0, 1)}
              </span>
              <OnlineDot
                online={online.has(m.userId)}
                className="absolute -bottom-0.5 -right-0.5"
              />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm">
              {m.name}
              {m.userId === me && <span className="text-gray-500"> (나)</span>}
            </span>
            {appAdminIds.has(m.userId) && (
              <span className="shrink-0 rounded bg-violet-100 px-1.5 py-0.5 text-xs font-medium text-violet-800">
                서비스 관리자
              </span>
            )}
            {m.role === "admin" && (
              <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">
                관리자
              </span>
            )}
            {canManage && m.role === "member" && (
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => changeRole(m, "admin")}
                className={smallButton}
              >
                관리자로
              </button>
            )}
            {/* 마지막 관리자는 해제하지 못하게 (관리자가 0명이면 아무도 관리 못 함) */}
            {canManage && m.role === "admin" && adminCount > 1 && (
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => changeRole(m, "member")}
                className={smallButton}
              >
                관리자 해제
              </button>
            )}
            {canManage && m.userId !== me && (
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => remove(m)}
                className={smallButton}
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

      {canManage && channel && (
        <div className="space-y-2 border-t border-gray-100 pt-3">
          <p className="text-sm font-medium text-gray-700">채널 설정</p>
          {renaming ? (
            <form onSubmit={saveName} className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                maxLength={MAX_NAME}
                aria-label="새 채널 이름"
                autoFocus
                className={`${textInput} max-w-[12rem]`}
              />
              <button type="submit" disabled={busyId !== null} className={primaryButton}>
                {busyId === "channel" ? "저장 중…" : "저장"}
              </button>
              <button type="button" onClick={() => setRenaming(false)} className={secondaryButton}>
                취소
              </button>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2">
              {/* #general 은 DB 규칙상 이름 변경·삭제 모두 불가 (002 · 003_security_fix) → 버튼도 숨긴다 */}
              {isGeneral && <p className="text-xs text-gray-500">#general 은 이름을 바꾸거나 지울 수 없어요.</p>}
              {!isGeneral && (
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={() => {
                    setNewName(channel.name);
                    setRenaming(true);
                    setError(null);
                  }}
                  className={secondaryButton}
                >
                  이름 바꾸기
                </button>
              )}
              {!isGeneral && (
                <button
                  type="button"
                  disabled={busyId !== null}
                  onClick={removeChannel}
                  className={`${secondaryButton} text-red-600 hover:bg-red-50`}
                >
                  {busyId === "channel" ? "삭제 중…" : "채널 삭제"}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* 채널 나가기 (DM 제외, 내가 멤버일 때) */}
      {channel && channel.type !== "dm" && myRole && (
        <div className="space-y-2 border-t border-gray-100 pt-3">
          {leaveBlockedReason && <p className="text-xs text-gray-500">{leaveBlockedReason}</p>}
          <button
            type="button"
            disabled={busyId !== null || leaveBlockedReason !== null}
            onClick={leaveChannel}
            className={`${secondaryButton} text-red-600 hover:bg-red-50`}
          >
            {busyId === "leave" ? "나가는 중…" : "채널 나가기"}
          </button>
        </div>
      )}
    </div>
  );
}

export default function ChannelMembersButton({ channelId, onChanged, onDeleted }: Props) {
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
          <MembersPanel
            channelId={channelId}
            onChanged={onChanged}
            onDeleted={() => {
              setOpen(false);
              onDeleted?.();
            }}
            onLeft={() => setOpen(false)}
          />
        </ChannelDialog>
      )}
    </>
  );
}
