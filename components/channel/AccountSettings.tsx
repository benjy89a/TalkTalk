"use client";

// [C] 내 정보 변경 (로그인한 상태에서): 이름 · 이메일(아이디) · 비밀번호
// - 사이드바 맨 아래 내 이름 옆 "⚙️" 버튼 → "내 정보" 창
// - 이메일·비밀번호를 바꿀 때는 "지금 비밀번호"를 한 번 더 확인한다
//   (로그인된 컴퓨터를 남이 잠깐 써도 계정을 못 바꾸게)
// - 이메일 변경은 Supabase 가 새 이메일로 확인 메일을 보내고, 링크를 눌러야 실제로 바뀐다
// - 채널·DM·메시지는 이메일이 아니라 고유 번호(user id)로 연결돼 있어서 이메일을 바꿔도 그대로다
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { passwordChangedMeta } from "./passwordPolicy";
import { ChannelDialog, primaryButton, secondaryButton, textInput } from "./ui";

export type AccountSection = "name" | "email" | "password" | null;
type Section = AccountSection;

type Props = {
  onNameChanged?: (name: string) => void; // 이름을 바꾸면 사이드바 이름도 바로 바꾸기
  initialSection?: AccountSection; // 처음부터 펼쳐 둘 칸 (예: 60일 안내에서 "지금 바꾸기" → "password")
};

// 지금 비밀번호가 맞는지 확인 (맞으면 같은 계정으로 다시 로그인될 뿐이라 상태는 그대로)
async function verifyCurrentPassword(email: string, password: string): Promise<boolean> {
  const { error } = await createClient().auth.signInWithPassword({ email, password });
  return !error;
}

function AccountPanel({ onNameChanged, initialSection = null }: Props) {
  const [me, setMe] = useState<{ id: string; email: string; name: string } | null>(null);
  const [open, setOpen] = useState<Section>(initialSection);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // 입력값
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const supabase = createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error("no user");
        const { data } = await supabase.from("profiles").select("name").eq("id", user.id).maybeSingle();
        if (!cancelled) setMe({ id: user.id, email: user.email ?? "", name: data?.name ?? "" });
      } catch {
        if (!cancelled) setError("내 정보를 불러오지 못했어요. 다시 로그인해 주세요.");
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function openSection(s: Section) {
    setOpen((prev) => (prev === s ? null : s));
    setError(null);
    setNotice(null);
    setCurrentPw("");
    setNewPw("");
    setNewPw2("");
    setNewName(me?.name ?? "");
    setNewEmail("");
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (!me) return;
    const name = newName.trim();
    if (!name) return setError("이름을 입력해 주세요.");
    if (name.length > 30) return setError("이름은 30자까지 쓸 수 있어요.");
    setBusy(true);
    setError(null);
    try {
      const { error } = await createClient().from("profiles").update({ name }).eq("id", me.id);
      if (error) throw error;
      setMe({ ...me, name });
      onNameChanged?.(name);
      setNotice("이름을 바꿨어요.");
      setOpen(null);
    } catch {
      setError("이름을 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function saveEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!me) return;
    const email = newEmail.trim();
    if (email.toLowerCase() === me.email.toLowerCase()) {
      return setError("지금 쓰는 이메일과 같아요. 다른 이메일을 입력해 주세요.");
    }
    setBusy(true);
    setError(null);
    try {
      if (!(await verifyCurrentPassword(me.email, currentPw))) {
        return setError("지금 비밀번호가 맞지 않아요.");
      }
      const { error } = await createClient().auth.updateUser(
        { email },
        { emailRedirectTo: `${window.location.origin}/` },
      );
      if (error) {
        if (error.code === "email_exists") return setError("이미 다른 계정이 쓰고 있는 이메일이에요.");
        if (error.code === "email_address_invalid" || error.code === "validation_failed") {
          return setError("이메일 주소 형식을 확인해 주세요.");
        }
        if (error.code === "over_email_send_rate_limit" || error.code === "over_request_rate_limit") {
          return setError("요청이 너무 많아요. 잠시 후 다시 시도해 주세요.");
        }
        return setError(`문제가 생겼어요: ${error.message}`);
      }
      setNotice("새 이메일로 확인 메일을 보냈어요. 메일의 링크를 누르면 이메일이 바뀌어요. (그 전까지는 지금 이메일로 로그인해요)");
      setOpen(null);
    } catch {
      setError("서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.");
    } finally {
      setBusy(false);
    }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!me) return;
    if (newPw.length < 6) return setError("새 비밀번호는 6자 이상으로 정해 주세요.");
    if (newPw !== newPw2) return setError("새 비밀번호 두 개가 서로 달라요.");
    if (newPw === currentPw) return setError("지금 비밀번호와 다른 비밀번호로 정해 주세요.");
    setBusy(true);
    setError(null);
    try {
      if (!(await verifyCurrentPassword(me.email, currentPw))) {
        return setError("지금 비밀번호가 맞지 않아요.");
      }
      // 바꾼 날짜도 함께 저장 → 60일 뒤 다시 변경 안내
      const { error } = await createClient().auth.updateUser({
        password: newPw,
        data: passwordChangedMeta(),
      });
      if (error) {
        if (error.code === "same_password") return setError("지금 비밀번호와 다른 비밀번호로 정해 주세요.");
        if (error.code === "weak_password") return setError("비밀번호가 너무 쉬워요. 더 길고 어렵게 정해 주세요.");
        return setError(`문제가 생겼어요: ${error.message}`);
      }
      setNotice("비밀번호를 바꿨어요. 다음 로그인부터 새 비밀번호를 써 주세요.");
      setOpen(null);
    } catch {
      setError("서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.");
    } finally {
      setBusy(false);
      setCurrentPw("");
      setNewPw("");
      setNewPw2("");
    }
  }

  if (!me) {
    return (
      <p role={error ? "alert" : "status"} className="text-sm text-gray-600">
        {error ?? "내 정보를 불러오는 중이에요…"}
      </p>
    );
  }

  const row = "flex items-center justify-between gap-3 px-3 py-3";
  const currentPwField = (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-gray-600">지금 비밀번호 (본인 확인)</span>
      <input
        type="password"
        required
        value={currentPw}
        onChange={(e) => setCurrentPw(e.target.value)}
        autoComplete="current-password"
        className={textInput}
      />
    </label>
  );

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

      <ul className="divide-y divide-gray-100 rounded-md border border-gray-200">
        {/* 이름 */}
        <li>
          <div className={row}>
            <div className="min-w-0">
              <p className="text-xs text-gray-500">이름</p>
              <p className="truncate text-sm font-medium">{me.name || "이름 없음"}</p>
            </div>
            <button type="button" onClick={() => openSection("name")} className={secondaryButton}>
              {open === "name" ? "취소" : "바꾸기"}
            </button>
          </div>
          {open === "name" && (
            <form onSubmit={saveName} className="space-y-2 px-3 pb-3">
              <input
                type="text"
                required
                maxLength={30}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                autoComplete="name"
                aria-label="새 이름"
                className={textInput}
              />
              <button type="submit" disabled={busy} className={primaryButton}>
                {busy ? "저장 중…" : "이름 저장"}
              </button>
            </form>
          )}
        </li>

        {/* 이메일(아이디) */}
        <li>
          <div className={row}>
            <div className="min-w-0">
              <p className="text-xs text-gray-500">이메일 (로그인 아이디)</p>
              <p className="truncate text-sm font-medium">{me.email}</p>
            </div>
            <button type="button" onClick={() => openSection("email")} className={secondaryButton}>
              {open === "email" ? "취소" : "바꾸기"}
            </button>
          </div>
          {open === "email" && (
            <form onSubmit={saveEmail} className="space-y-2 px-3 pb-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">새 이메일</span>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  autoComplete="email"
                  placeholder="name@company.com"
                  className={textInput}
                />
              </label>
              {currentPwField}
              <p className="text-xs text-gray-500">새 이메일로 확인 메일이 가요. 링크를 눌러야 바뀌어요.</p>
              <button type="submit" disabled={busy} className={primaryButton}>
                {busy ? "확인 중…" : "확인 메일 보내기"}
              </button>
            </form>
          )}
        </li>

        {/* 비밀번호 */}
        <li>
          <div className={row}>
            <div className="min-w-0">
              <p className="text-xs text-gray-500">비밀번호</p>
              <p className="text-sm font-medium tracking-widest">••••••</p>
            </div>
            <button type="button" onClick={() => openSection("password")} className={secondaryButton}>
              {open === "password" ? "취소" : "바꾸기"}
            </button>
          </div>
          {open === "password" && (
            <form onSubmit={savePassword} className="space-y-2 px-3 pb-3">
              {currentPwField}
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">새 비밀번호 (6자 이상)</span>
                <input
                  type="password"
                  required
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  autoComplete="new-password"
                  className={textInput}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">새 비밀번호 확인</span>
                <input
                  type="password"
                  required
                  value={newPw2}
                  onChange={(e) => setNewPw2(e.target.value)}
                  autoComplete="new-password"
                  className={textInput}
                />
              </label>
              <button type="submit" disabled={busy} className={primaryButton}>
                {busy ? "확인 중…" : "비밀번호 바꾸기"}
              </button>
            </form>
          )}
        </li>
      </ul>
    </div>
  );
}

// "내 정보" 창 (버튼 없이 창만 — 60일 안내의 "지금 바꾸기"에서 바로 연다)
export function AccountDialog({
  onClose,
  onNameChanged,
  initialSection,
}: Props & { onClose: () => void }) {
  return (
    <ChannelDialog title="내 정보" onClose={onClose}>
      <AccountPanel onNameChanged={onNameChanged} initialSection={initialSection} />
    </ChannelDialog>
  );
}

export default function AccountSettings({ onNameChanged }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="내 정보 변경"
        title="내 정보 변경"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-sm text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
      >
        <span aria-hidden="true">⚙️</span>
      </button>
      {open && <AccountDialog onClose={() => setOpen(false)} onNameChanged={onNameChanged} />}
    </>
  );
}
