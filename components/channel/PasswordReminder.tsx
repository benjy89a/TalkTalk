"use client";

// [C] 60일마다 비밀번호 변경 안내 팝업
// - 로그인 후 한 번 확인해서, 안내 날짜가 지났으면 팝업을 띄운다
// - 선택권: "지금 바꾸기"(내 정보 창의 비밀번호 변경 열기) / "60일 뒤에 바꾸기"(안내 날짜를 60일 미룸)
// - MyProfile 안에서 쓴다 (사이드바는 로그인한 화면에 항상 있으므로)
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { nextRemindAt, PASSWORD_REMIND_DAYS, shouldRemindPassword } from "./passwordPolicy";
import { ChannelDialog, primaryButton, secondaryButton } from "./ui";

type Props = {
  onChangeNow: () => void; // "지금 바꾸기" → 비밀번호 변경 화면 열기
};

export default function PasswordReminder({ onChangeNow }: Props) {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const {
          data: { user },
        } = await createClient().auth.getUser();
        if (!cancelled && user && shouldRemindPassword(user)) setShow(true);
      } catch {
        // 확인을 못 하면 그냥 안내를 띄우지 않는다
      }
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  async function later() {
    setBusy(true);
    setError(null);
    try {
      const { error } = await createClient().auth.updateUser({
        data: { password_remind_at: nextRemindAt() },
      });
      if (error) throw error;
      setShow(false);
    } catch {
      setError("저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  function changeNow() {
    setShow(false);
    onChangeNow();
  }

  if (!show) return null;

  return (
    // 바깥을 누르거나 Esc 로 닫으면 "이번만 닫기" (다음 로그인 때 다시 안내)
    <ChannelDialog title="비밀번호 변경 안내" onClose={() => setShow(false)}>
      <div className="space-y-4">
        <p className="text-sm text-gray-700">
          비밀번호를 바꾼 지 <b>{PASSWORD_REMIND_DAYS}일</b>이 지났어요.
          <br />
          계정을 안전하게 지키기 위해 비밀번호를 바꿔 주세요. 🔐
        </p>
        {error && (
          <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" disabled={busy} onClick={later} className={secondaryButton}>
            {busy ? "저장 중…" : `${PASSWORD_REMIND_DAYS}일 뒤에 바꾸기`}
          </button>
          <button type="button" disabled={busy} onClick={changeNow} className={primaryButton}>
            지금 바꾸기
          </button>
        </div>
      </div>
    </ChannelDialog>
  );
}
