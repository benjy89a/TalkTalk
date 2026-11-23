"use client";

// [C] 사이드바용 "⚙️ 내 정보" 버튼 → 내 정보 창 (이름 · 이메일(아이디) · 비밀번호 변경)
// 사용 예 (팀장 통합 때, 사이드바 "채널" 위에):
//   <MyAccountButton />
// 사이드바 맨 아래 MyProfile 의 ⚙️ 버튼과 같은 창을 연다.
import { useState } from "react";
import { AccountDialog } from "./AccountSettings";

export default function MyAccountButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm text-white/80 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
      >
        <span aria-hidden="true">⚙️</span>
        내 정보 변경
      </button>
      {open && <AccountDialog onClose={() => setOpen(false)} />}
    </>
  );
}
