"use client";

// [D] 관리자 페이지 — 채널 관리 탭 (REQUEST_TO_D.md 요청 2)
//
// 공개 채널 목록(이름·멤버 수·만든 날)을 표로 보여주고, 이름 변경·삭제를 한다.
// - 비공개 채널·DM 은 사생활 보호 때문에 나오지 않는다 (DB 함수가 공개 채널만 돌려줌)
// - #general 은 이름 변경·삭제 버튼을 숨긴다 (DB 도 막음)
// - 삭제하면 그 채널의 메시지·첨부 기록까지 같이 지워진다 → 확인창 필수
//
// 사용 예 (app/admin/slots.tsx):
//   import AdminChannels from "@/components/admin/AdminChannels";
//   export function AdminChannelsSlot() { return <AdminChannels />; }
import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";
import {
  GENERAL_CHANNEL,
  MAX_CHANNEL_NAME,
  formatDate,
  friendlyError,
  validateChannelName,
} from "./adminRules";

type AdminChannel = Database["public"]["Functions"]["admin_list_channels"]["Returns"][number];

const LOAD_ERROR = "채널 목록을 불러오지 못했어요. 권한이 없거나 잠시 후 다시 시도해 주세요.";
const RENAME_ERROR = "이름을 바꾸지 못했어요. 권한이 없거나 잠시 후 다시 시도해 주세요.";
const DELETE_ERROR = "채널을 삭제하지 못했어요. 권한이 없거나 잠시 후 다시 시도해 주세요.";

export default function AdminChannels() {
  const [channels, setChannels] = useState<AdminChannel[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const load = useCallback(async () => {
    const { data, error: rpcError } = await createClient().rpc("admin_list_channels");
    if (rpcError) {
      console.error("[admin] 채널 목록 실패:", rpcError.message);
      setError(LOAD_ERROR);
      setChannels([]);
      return;
    }
    setChannels(data ?? []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 화면이 열릴 때 DB 에서 목록을 읽어 오는 작업 (setState 는 await 뒤)
    void load();
  }, [load]);

  function cancelEdit() {
    setEditing(null);
    setError(null);
  }

  async function saveName() {
    if (!editing) return;
    const problem = validateChannelName(editing.name);
    if (problem) {
      setError(problem);
      return;
    }
    const name = editing.name.trim();

    setBusyId(editing.id);
    setError(null);
    setNotice(null);
    const { data, error: updateError } = await createClient()
      .from("channels")
      .update({ name })
      .eq("id", editing.id)
      .select("id");
    setBusyId(null);

    if (updateError) {
      console.error("[admin] 채널 이름 변경 실패:", updateError.message);
      setError(friendlyError(updateError, RENAME_ERROR));
      return;
    }
    if (!data || data.length === 0) {
      setError(RENAME_ERROR);
      return;
    }
    setEditing(null);
    setNotice(`채널 이름을 #${name}(으)로 바꿨어요.`);
    await load();
  }

  async function remove(channel: AdminChannel) {
    const ok = window.confirm(
      `#${channel.name} 채널을 정말 삭제할까요?\n메시지·첨부 기록까지 모두 지워지고 되돌릴 수 없어요.`,
    );
    if (!ok) return;

    setBusyId(channel.id);
    setError(null);
    setNotice(null);
    const { data, error: deleteError } = await createClient()
      .from("channels")
      .delete()
      .eq("id", channel.id)
      .select("id");
    setBusyId(null);

    if (deleteError || !data || data.length === 0) {
      if (deleteError) console.error("[admin] 채널 삭제 실패:", deleteError.message);
      setError(DELETE_ERROR);
      return;
    }
    setNotice(`#${channel.name} 채널을 삭제했어요.`);
    await load();
  }

  if (channels === null) {
    return <p className="text-sm text-gray-600">불러오는 중…</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">
        공개 채널 {channels.length}개 · 비공개 채널과 DM 은 사생활 보호를 위해 보이지 않아요.
      </p>

      {error && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
          {notice}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-600">
              <th scope="col" className="px-2 py-2 font-medium">채널 이름</th>
              <th scope="col" className="px-2 py-2 font-medium whitespace-nowrap">멤버 수</th>
              <th scope="col" className="px-2 py-2 font-medium whitespace-nowrap">만든 날</th>
              <th scope="col" className="px-2 py-2 font-medium">
                <span className="sr-only">작업</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {channels.map((c) => {
              const isGeneral = c.name === GENERAL_CHANNEL;
              const isEditing = editing?.id === c.id;
              const busy = busyId === c.id;
              return (
                <tr key={c.id} className="border-b border-gray-100">
                  <td className="px-2 py-2 text-gray-900">
                    {isEditing ? (
                      <form
                        className="flex items-center gap-1"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void saveName();
                        }}
                      >
                        <span aria-hidden="true" className="text-gray-500">#</span>
                        <input
                          value={editing.name}
                          onChange={(e) => setEditing({ id: c.id, name: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") cancelEdit();
                          }}
                          maxLength={MAX_CHANNEL_NAME}
                          aria-label={`#${c.name} 새 이름`}
                          autoFocus
                          className="h-8 w-full max-w-48 rounded-md border border-gray-300 px-2 text-sm focus-visible:border-[#1e325c] focus-visible:ring-2 focus-visible:ring-[#1e325c] focus-visible:outline-none"
                        />
                        <button
                          type="submit"
                          disabled={busy}
                          className="shrink-0 rounded-md bg-[#1e325c] px-2 py-1 text-xs font-medium whitespace-nowrap text-white hover:bg-[#172746] disabled:opacity-50"
                        >
                          {busy ? "저장 중…" : "저장"}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="shrink-0 rounded-md px-2 py-1 text-xs whitespace-nowrap text-gray-600 hover:bg-gray-100"
                        >
                          취소
                        </button>
                      </form>
                    ) : (
                      <>
                        # {c.name}
                        {isGeneral && <span className="ml-1 text-xs text-gray-500">(기본 채널)</span>}
                      </>
                    )}
                  </td>
                  <td className="px-2 py-2 whitespace-nowrap text-gray-700">{c.member_count}명</td>
                  <td className="px-2 py-2 whitespace-nowrap text-gray-700">{formatDate(c.created_at)}</td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">
                    {!isGeneral && !isEditing && (
                      <div className="inline-flex gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            setError(null);
                            setNotice(null);
                            setEditing({ id: c.id, name: c.name });
                          }}
                          disabled={busyId !== null}
                          className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-[#1e325c] hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-[#1e325c] focus-visible:outline-none disabled:opacity-50"
                        >
                          이름 변경
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(c)}
                          disabled={busyId !== null}
                          className="rounded-md border border-red-200 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-600 focus-visible:outline-none disabled:opacity-50"
                        >
                          {busy ? "삭제 중…" : "삭제"}
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
            {channels.length === 0 && !error && (
              <tr>
                <td colSpan={4} className="px-2 py-6 text-center text-gray-600">
                  공개 채널이 없어요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
