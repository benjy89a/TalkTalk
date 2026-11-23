"use client";

// [D] 관리자 페이지 — 사용자 관리 탭 (REQUEST_TO_D.md 요청 1)
//
// 사용자 목록(이름·이메일·가입일·권한)을 표로 보여주고, 서비스 관리자로 지정·해제한다.
// - 서비스 관리자만 쓸 수 있다 (DB 함수가 확인하고, 아니면 에러)
// - 내 줄에는 "관리자 해제" 버튼을 숨긴다 (DB 도 자기 자신 해제를 막음)
// - 사용자 삭제는 하지 않는다 (서버 전용 비밀키가 필요해서 이번 범위 밖)
//
// 사용 예 (app/admin/slots.tsx):
//   import AdminUsers from "@/components/admin/AdminUsers";
//   export function AdminUsersSlot() { return <AdminUsers />; }
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";
import { filterUsers, formatDate } from "./adminRules";

type AdminUser = Database["public"]["Functions"]["admin_list_users"]["Returns"][number];

const LOAD_ERROR = "사용자 목록을 불러오지 못했어요. 권한이 없거나 잠시 후 다시 시도해 주세요.";
const SAVE_ERROR = "권한을 바꾸지 못했어요. 권한이 없거나 잠시 후 다시 시도해 주세요.";

export default function AdminUsers() {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [myId, setMyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    const supabase = createClient();
    const [{ data, error: rpcError }, { data: me }] = await Promise.all([
      supabase.rpc("admin_list_users"),
      supabase.auth.getUser(),
    ]);
    setMyId(me.user?.id ?? null);
    if (rpcError) {
      console.error("[admin] 사용자 목록 실패:", rpcError.message);
      setError(LOAD_ERROR);
      setUsers([]);
      return;
    }
    setError(null);
    setUsers(data ?? []);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 화면이 열릴 때 DB 에서 목록을 읽어 오는 작업 (setState 는 await 뒤)
    void load();
  }, [load]);

  async function toggleAdmin(user: AdminUser) {
    const makeAdmin = !user.is_app_admin;
    const question = makeAdmin
      ? `${user.name} 님을 서비스 관리자로 지정할까요?`
      : `${user.name} 님의 서비스 관리자 권한을 해제할까요?`;
    if (!window.confirm(question)) return;

    setBusyId(user.id);
    const { error: rpcError } = await createClient().rpc("admin_set_app_admin", {
      uid: user.id,
      make_admin: makeAdmin,
    });
    setBusyId(null);
    if (rpcError) {
      console.error("[admin] 권한 변경 실패:", rpcError.message);
      setError(SAVE_ERROR);
      return;
    }
    await load();
  }

  const shown = useMemo(() => filterUsers(users ?? [], query), [users, query]);

  if (users === null) {
    return <p className="text-sm text-gray-600">불러오는 중…</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름 또는 이메일로 찾기"
          aria-label="사용자 검색"
          className="h-9 w-full max-w-64 rounded-md border border-gray-300 px-3 text-sm focus-visible:border-[#1e325c] focus-visible:ring-2 focus-visible:ring-[#1e325c] focus-visible:outline-none"
        />
        <p className="text-sm text-gray-600">
          전체 {users.length}명{query.trim() && ` · 찾은 사람 ${shown.length}명`}
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-600">
              <th scope="col" className="px-2 py-2 font-medium">이름</th>
              <th scope="col" className="px-2 py-2 font-medium">이메일</th>
              <th scope="col" className="px-2 py-2 font-medium whitespace-nowrap">가입일</th>
              <th scope="col" className="px-2 py-2 font-medium">권한</th>
              <th scope="col" className="px-2 py-2 font-medium">
                <span className="sr-only">작업</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((u) => {
              const isMe = u.id === myId;
              return (
                <tr key={u.id} className="border-b border-gray-100">
                  <td className="px-2 py-2 text-gray-900">
                    {u.name || "(이름 없음)"}
                    {isMe && <span className="ml-1 text-xs text-gray-500">(나)</span>}
                  </td>
                  <td className="px-2 py-2 break-all text-gray-700">{u.email}</td>
                  <td className="px-2 py-2 whitespace-nowrap text-gray-700">{formatDate(u.created_at)}</td>
                  <td className="px-2 py-2">
                    {u.is_app_admin ? (
                      <span className="inline-flex items-center rounded-full bg-[#1e325c] px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-white">
                        관리자
                      </span>
                    ) : (
                      <span className="text-xs whitespace-nowrap text-gray-500">일반</span>
                    )}
                  </td>
                  <td className="px-2 py-2 text-right whitespace-nowrap">
                    {!(isMe && u.is_app_admin) && (
                      <button
                        type="button"
                        onClick={() => toggleAdmin(u)}
                        disabled={busyId !== null}
                        className={`rounded-md border px-3 py-1 text-xs font-medium focus-visible:ring-2 focus-visible:ring-[#1e325c] focus-visible:outline-none disabled:opacity-50 ${
                          u.is_app_admin
                            ? "border-red-200 text-red-700 hover:bg-red-50"
                            : "border-gray-300 text-[#1e325c] hover:bg-gray-50"
                        }`}
                      >
                        {busyId === u.id ? "처리 중…" : u.is_app_admin ? "관리자 해제" : "관리자로 지정"}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={5} className="px-2 py-6 text-center text-gray-600">
                  {query.trim() ? "찾는 사용자가 없어요." : "사용자가 없어요."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
