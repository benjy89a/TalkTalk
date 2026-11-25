"use client";
// [B] 첨부 이미지 크게 보기 — 미리보기 그림을 누르면 새 탭 대신 화면 위에 크게 띄운다
//
// 왜: 첨부 미리보기(D, AttachmentList)는 그림을 누르면 새 탭으로 넘어가는데,
//     앱 안 브라우저 · 휴대폰에선 닫기/뒤로 버튼이 없어 빠져나올 수 없었다.
//     D 파일은 그대로 두고, 메시지 목록에서 "그림이 든 새 탭 링크" 클릭을 먼저 받아 여기서 띄운다.
// 닫기: 그림 바깥(어두운 곳) 클릭 · ✕ 버튼 · Esc
// "새 탭에서 열기" 는 남겨 둠 (원본 크기로 보거나 저장하고 싶을 때)
//
// 사용: const viewer = useImageViewer();
//       <div onClick={viewer.onClick}> …메시지 목록… </div>
//       {viewer.element}
import { useCallback, useEffect, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";

type Shown = { src: string; alt: string; href: string };

export function useImageViewer() {
  const [shown, setShown] = useState<Shown | null>(null);
  const close = useCallback(() => setShown(null), []);

  // 목록 안 클릭 중 "그림이 든 새 탭 링크"만 가로챈다 (일반 주소 링크는 그대로 새 탭)
  // Ctrl/⌘ 를 누르고 클릭하면 원래대로 새 탭
  const onClick = useCallback((e: MouseEvent<HTMLElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const link = (e.target as HTMLElement).closest?.('a[target="_blank"]');
    const img = link?.querySelector("img");
    if (!link || !img) return;
    e.preventDefault();
    setShown({ src: img.currentSrc || img.src, alt: img.alt, href: (link as HTMLAnchorElement).href });
  }, []);

  useEffect(() => {
    if (!shown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shown, close]);

  const element = shown
    ? createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${shown.alt} 크게 보기`}
          onClick={close} // 그림 바깥을 누르면 닫힘
          className="fixed inset-0 z-[100] flex flex-col bg-black/80"
        >
          <div className="flex items-center gap-2 px-3 py-2 text-sm text-white" onClick={(e) => e.stopPropagation()}>
            <span className="min-w-0 flex-1 truncate">{shown.alt}</span>
            <a
              href={shown.href}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 rounded-md px-2 py-1 text-white/80 hover:bg-white/10 hover:text-white"
            >
              새 탭에서 열기
            </a>
            <button
              type="button"
              onClick={close}
              autoFocus
              aria-label="닫기"
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xl text-white hover:bg-white/15 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
            >
              ✕
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-4 pt-0">
            {/* Storage 임시 주소라 next/image 최적화를 쓰지 않는다 (AttachmentList 와 같음) */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={shown.src}
              alt={shown.alt}
              onClick={(e) => e.stopPropagation()} // 그림 자체를 눌러선 안 닫힘
              className="max-h-full max-w-full rounded-md object-contain shadow-2xl"
            />
          </div>
        </div>,
        document.body,
      )
    : null;

  return { onClick, element };
}
