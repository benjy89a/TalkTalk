"use client";

// [C] 여러 사람을 체크해서 고르는 칸 (채널 만들 때 멤버 초대에 사용)
// 나를 뺀 모든 사용자(profiles)를 이름순으로 보여주고, 이름으로 찾을 수 있다.
//
// 사용 예:
//   const [ids, setIds] = useState<string[]>([]);
//   <MemberPicker selectedIds={ids} onChange={setIds} />
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types/database";
import { textInput, toKoreanChannelError } from "./ui";

type Person = Pick<Profile, "id" | "name">;

type Props = {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
};

export default function MemberPicker({ selectedIds, onChange, disabled = false }: Props) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (!session) throw new Error("no session");
        const { data, error } = await supabase
          .from("profiles")
          .select("id, name")
          .neq("id", session.user.id)
          .order("name");
        if (error) throw error;
        if (!cancelled) setPeople(data ?? []);
      } catch (err) {
        if (!cancelled) {
          setPeople([]);
          setError(toKoreanChannelError(err));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function toggle(id: string) {
    onChange(
      selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id],
    );
  }

  if (people === null) {
    return (
      <p role="status" className="text-sm text-gray-600">
        사람 목록을 불러오는 중이에요…
      </p>
    );
  }

  const q = query.trim().toLowerCase();
  const shown = q ? people.filter((p) => (p.name || "").toLowerCase().includes(q)) : people;
  const selectedNames = people
    .filter((p) => selectedIds.includes(p.id))
    .map((p) => p.name || "이름 없음");

  return (
    <div className="space-y-2">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="이름으로 찾기"
        aria-label="초대할 사람 이름으로 찾기"
        disabled={disabled}
        className={textInput}
      />

      {error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          {error}
        </p>
      )}

      {shown.length === 0 ? (
        <p className="text-sm text-gray-600">
          {people.length === 0 ? "아직 다른 사용자가 없어요." : "찾는 사람이 없어요."}
        </p>
      ) : (
        <ul className="max-h-44 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200">
          {shown.map((p) => {
            const checked = selectedIds.includes(p.id);
            return (
              <li key={p.id}>
                <label
                  className={`flex cursor-pointer items-center gap-3 px-3 py-2 text-sm transition-colors hover:bg-gray-50 ${
                    checked ? "bg-blue-50/60" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(p.id)}
                    disabled={disabled}
                    className="h-4 w-4 accent-[#1e325c]"
                  />
                  <span
                    aria-hidden="true"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-[#1e325c] text-xs font-bold text-white"
                  >
                    {(p.name || "?").slice(0, 1)}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{p.name || "이름 없음"}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-gray-600" aria-live="polite">
        {selectedNames.length === 0
          ? "아무도 고르지 않으면 나만 있는 채널이 만들어져요."
          : `${selectedNames.length}명 초대: ${selectedNames.join(", ")}`}
      </p>
    </div>
  );
}
