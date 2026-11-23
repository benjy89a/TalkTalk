"use client";

// [C] 채널 만들기 (C-3)
// 1) channels 에 created_by = 나 로 새 채널을 넣고
// 2) channel_members 에 나를 role 'admin' 으로 넣는다
// 3) 고른 사람들을 role 'member' 로 함께 넣는다 (멤버 초대)
// 권한은 DB(RLS + guard_member_role 트리거)가 지킨다. 막히면 에러 문구를 보여준다.
// (채널을 만든 사람은 다른 사람을 멤버로 넣을 수 있다 — can_add_channel_member)
// 공개 채널은 서비스 관리자만 만들 수 있다 (002_roles.sql). 일반 멤버에게는 "공개" 선택지를 숨긴다.
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import MemberPicker from "./MemberPicker";
import { primaryButton, secondaryButton, textInput, toKoreanChannelError } from "./ui";

const MAX_NAME = 30;

type Props = {
  onCreated: (channelId: string) => void;
  onCancel?: () => void;
};

export default function CreateChannelForm({ onCreated, onCancel }: Props) {
  const [name, setName] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  // 공개 채널을 만들 수 있는가 (= 서비스 관리자인가). 확인 전·실패 시에는 false (안전한 쪽)
  const [canCreatePublic, setCanCreatePublic] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function checkAdmin() {
      try {
        const { data, error } = await createClient().rpc("is_app_admin");
        if (!cancelled && !error) setCanCreatePublic(data === true);
      } catch {
        // 확인하지 못하면 비공개만 보여 준다
      }
    }
    void checkAdmin();
    return () => {
      cancelled = true;
    };
  }, []);
  const [inviteIds, setInviteIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 채널은 만들어졌는데 초대만 실패했을 때: 같은 채널을 또 만들지 않도록 기억해 둔다
  const [createdId, setCreatedId] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (createdId) return;
    setError(null);

    const trimmed = name.trim();
    if (trimmed === "") {
      setError("채널 이름을 입력해 주세요.");
      return;
    }
    if (trimmed.length > MAX_NAME) {
      setError(`채널 이름은 ${MAX_NAME}자 이하로 정해 주세요.`);
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setError("로그인이 필요해요. 다시 로그인해 주세요.");
        return;
      }
      const me = session.user.id;

      const { data: channel, error: channelError } = await supabase
        .from("channels")
        .insert({
          name: trimmed,
          // 서비스 관리자가 아니면 항상 비공개 (DB 도 공개 채널 생성을 거절한다)
          type: canCreatePublic && !isPrivate ? "public" : "private",
          created_by: me,
        })
        .select("id")
        .single();
      if (channelError) throw channelError;

      const { error: memberError } = await supabase
        .from("channel_members")
        .insert({ channel_id: channel.id, user_id: me, role: "admin" });
      if (memberError) throw memberError;

      // 멤버 초대 (고른 사람이 있을 때만)
      const invitees = inviteIds.filter((id) => id !== me);
      if (invitees.length > 0) {
        const { error: inviteError } = await supabase
          .from("channel_members")
          .insert(invitees.map((id) => ({ channel_id: channel.id, user_id: id, role: "member" as const })));
        if (inviteError) {
          setCreatedId(channel.id);
          setError(
            `채널은 만들어졌지만 초대하지 못했어요. (${toKoreanChannelError(inviteError)}) 채널로 이동한 뒤 다시 초대해 주세요.`,
          );
          return;
        }
      }

      setName("");
      setInviteIds([]);
      onCreated(channel.id);
    } catch (err) {
      setError(toKoreanChannelError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-gray-700">채널 이름</span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="예: project-a"
          maxLength={MAX_NAME}
          autoFocus
          className={textInput}
        />
      </label>

      <fieldset>
        <legend className="mb-1 block text-sm font-medium text-gray-700">공개 범위</legend>
        <div className="space-y-2">
          {canCreatePublic && (
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <input
                type="radio"
                name="visibility"
                checked={!isPrivate}
                onChange={() => setIsPrivate(false)}
                className="mt-0.5"
              />
              <span>
                <span className="font-medium"># 공개</span>
                <span className="block text-gray-500">누구나 둘러보고 스스로 참여할 수 있어요</span>
              </span>
            </label>
          )}
          <label className="flex cursor-pointer items-start gap-2 text-sm">
            <input
              type="radio"
              name="visibility"
              checked={isPrivate || !canCreatePublic}
              onChange={() => setIsPrivate(true)}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">🔒 비공개</span>
              <span className="block text-gray-500">관리자가 초대한 사람만 볼 수 있어요</span>
            </span>
          </label>
          {!canCreatePublic && (
            <p className="text-xs text-gray-500">공개 채널은 서비스 관리자만 만들 수 있어요.</p>
          )}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1 block text-sm font-medium text-gray-700">
          멤버 초대 <span className="font-normal text-gray-500">(선택)</span>
        </legend>
        <MemberPicker selectedIds={inviteIds} onChange={setInviteIds} disabled={loading || createdId !== null} />
      </fieldset>

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} className={secondaryButton}>
            취소
          </button>
        )}
        {createdId ? (
          <button type="button" onClick={() => onCreated(createdId)} className={primaryButton}>
            채널로 이동
          </button>
        ) : (
          <button type="submit" disabled={loading} className={primaryButton}>
            {loading ? "만드는 중…" : inviteIds.length > 0 ? `만들고 ${inviteIds.length}명 초대` : "만들기"}
          </button>
        )}
      </div>
    </form>
  );
}
