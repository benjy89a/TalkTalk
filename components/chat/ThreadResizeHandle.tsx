"use client";
// [B] 스레드 패널 폭 조절 손잡이 — 패널 왼쪽 테두리를 좌우로 끌어서 폭을 바꾼다
// 사용 예 (팀장님 ThreadPanel 의 <aside> 안, 맨 앞에):
//   const width = useThreadWidth();
//   <aside className="relative ..." style={{ width }}>
//     <ThreadResizeHandle />
//     ...
// 마우스: 끌기 / 두 번 클릭하면 기본 폭(384px)으로
// 키보드: 손잡이에 포커스 후 ← → (32px씩), Home 기본 폭
import {
  setThreadWidth,
  THREAD_WIDTH_DEFAULT,
  THREAD_WIDTH_MAX,
  THREAD_WIDTH_MIN,
  useThreadWidth,
} from "./threads";

export default function ThreadResizeHandle() {
  const width = useThreadWidth();

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    // 패널은 화면 오른쪽 끝에 붙어 있으므로, 폭 = 화면 오른쪽 끝 - 마우스 위치
    const panelRight = el.parentElement?.getBoundingClientRect().right ?? window.innerWidth;
    const onMove = (ev: PointerEvent) => setThreadWidth(panelRight - ev.clientX, false);
    const onUp = (ev: PointerEvent) => {
      setThreadWidth(panelRight - ev.clientX, true); // 놓을 때 한 번만 저장
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
      document.body.style.userSelect = "";
    };
    document.body.style.userSelect = "none"; // 끄는 동안 글자가 선택되지 않게
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    // 패널은 오른쪽에 있으므로 ← 는 넓게, → 는 좁게
    if (e.key === "ArrowLeft") setThreadWidth(width + 32);
    else if (e.key === "ArrowRight") setThreadWidth(width - 32);
    else if (e.key === "Home") setThreadWidth(THREAD_WIDTH_DEFAULT);
    else return;
    e.preventDefault();
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="스레드 패널 폭 조절"
      aria-valuenow={width}
      aria-valuemin={THREAD_WIDTH_MIN}
      aria-valuemax={THREAD_WIDTH_MAX}
      tabIndex={0}
      title="끌어서 폭 조절 · 두 번 클릭하면 기본 폭"
      onPointerDown={onPointerDown}
      onDoubleClick={() => setThreadWidth(THREAD_WIDTH_DEFAULT)}
      onKeyDown={onKeyDown}
      className="absolute inset-y-0 left-0 z-10 w-1.5 -translate-x-1/2 cursor-col-resize bg-transparent transition-colors hover:bg-[#1e325c]/30 focus-visible:bg-[#1e325c]/40 focus-visible:outline-none active:bg-[#1e325c]/50"
    />
  );
}
