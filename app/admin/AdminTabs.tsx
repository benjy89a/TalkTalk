"use client";
// [A] 관리자 페이지의 탭 (사용자 / 채널 / AI). 탭 안의 내용은 slots.tsx 에서 끼운다.
import { useState } from "react";
import { AdminAiSlot, AdminChannelsSlot, AdminUsersSlot } from "./slots";

const TABS = [
  { key: "users", label: "사용자 관리", Slot: AdminUsersSlot },
  { key: "channels", label: "채널 관리", Slot: AdminChannelsSlot },
  { key: "ai", label: "AI 설정", Slot: AdminAiSlot },
] as const;

export default function AdminTabs() {
  const [active, setActive] = useState<(typeof TABS)[number]["key"]>("users");
  const current = TABS.find((t) => t.key === active) ?? TABS[0];

  return (
    <div>
      <nav className="mb-4 flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActive(t.key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${
              t.key === active
                ? "border-[#1e325c] font-semibold text-[#1e325c]"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <section className="rounded border border-gray-200 bg-white p-4">
        <current.Slot />
      </section>
    </div>
  );
}
