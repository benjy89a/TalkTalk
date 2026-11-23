"use client";

// [C] 사이드바 "+ 새 DM" 버튼 → 사람 고르기 대화상자 (C-4)
// 사람을 고르면: 이미 DM 이 있으면 그 방을 열고, 없으면 새로 만든다.
//
// 사용 예 (팀장 통합 때):
//   <StartDmButton onChanged={() => setDmRefreshKey((k) => k + 1)} onSelect={setChannelId} />
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types/database";
import { openOrCreateDm } from "./dm";
import { ChannelDialog, textInput, toKoreanChannelError } from "./ui";

type Person = Pick<Profile, "id" | "name">;

type Props = {
  onChanged?: () => void;
  onSelect?: (channelId: string) => void;
};

const sidebarButton =
  "flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-[#1e325c]";

function PeoplePicker({ onPicked }: { onPicked: (channelId: string) => void }) {
  const [people, setPeople] = useState<Person[] | null>(null);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
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

  async function pick(person: Person) {
    setBusyId(person.id);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("no session");
      const channelId = await openOrCreateDm(supabase, session.user.id, person.id);
      onPicked(channelId);
    } catch (err) {
      setError(toKoreanChannelError(err));
    } finally {
      setBusyId(null);
    }
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

  return (
    <div className="space-y-3">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="이름으로 찾기"
        aria-label="대화할 사람 이름으로 찾기"
        autoFocus
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
        <ul className="max-h-80 divide-y divide-gray-100 overflow-y-auto rounded-md border border-gray-200">
          {shown.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                disabled={busyId !== null}
                onClick={() => pick(p)}
                className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50 focus-visible:bg-gray-50 focus-visible:outline-none disabled:opacity-50"
              >
                <span
                  aria-hidden="true"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-[#1e325c] text-xs font-bold text-white"
                >
                  {(p.name || "?").slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1 truncate">{p.name || "이름 없음"}</span>
                {busyId === p.id && <span className="text-xs text-gray-500">여는 중…</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function StartDmButton({ onChanged, onSelect }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={sidebarButton}>
        <span aria-hidden="true" className="w-4 text-center">
          +
        </span>
        새 DM
      </button>

      {open && (
        <ChannelDialog title="누구와 대화할까요?" onClose={() => setOpen(false)}>
          <PeoplePicker
            onPicked={(channelId) => {
              setOpen(false);
              onChanged?.();
              onSelect?.(channelId);
            }}
          />
        </ChannelDialog>
      )}
    </>
  );
}
