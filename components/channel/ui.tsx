"use client";

// [C] 채널 기능에서 같이 쓰는 모양(디자인 가이드 6절 클래스)과 작은 대화상자
import { useEffect, useRef } from "react";

export const primaryButton =
  "inline-flex min-h-9 items-center justify-center gap-2 rounded-md bg-[#1e325c] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#172746] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e325c] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";

export const secondaryButton =
  "inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e325c] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";

export const textInput =
  "h-9 w-full min-w-0 rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-900 placeholder:text-gray-500 focus-visible:border-[#1e325c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e325c] disabled:cursor-not-allowed disabled:bg-gray-100";

// Supabase(Postgres) 에러를 쉬운 한국어로 바꾼다
export function toKoreanChannelError(err: unknown): string {
  const e = err as { code?: string; message?: string } | null;
  switch (e?.code) {
    case "23505":
      return "같은 이름의 채널이 이미 있어요. 다른 이름을 골라 주세요.";
    case "42501":
      return "이 작업을 할 권한이 없어요.";
    case "23514":
      return "입력한 값이 올바르지 않아요.";
  }
  if (/fetch|network/i.test(e?.message ?? "")) {
    return "서버에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.";
  }
  return "문제가 생겼어요. 잠시 후 다시 시도해 주세요.";
}

// 화면 가운데 뜨는 흰 상자. Esc 키나 바깥(어두운 부분)을 누르면 닫힌다.
export function ChannelDialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    boxRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl bg-white p-6 text-gray-900 shadow-xl outline-none"
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e325c]"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
