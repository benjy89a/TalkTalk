"use client";
// [B] 채널 본문 · 스레드가 같이 쓰는 작은 화면 조각들

export function CenterText({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center p-4 text-center text-sm leading-6 text-gray-600">
      {children}
    </div>
  );
}

export function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-3 inline-flex min-h-9 items-center justify-center rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus-visible:ring-2 focus-visible:ring-[#1e325c] focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      다시 시도
    </button>
  );
}

export function LostBanner() {
  return (
    <div role="status" className="shrink-0 bg-amber-50 px-4 py-1.5 text-center text-xs leading-5 text-amber-800">
      연결이 끊겼어요. 다시 연결하는 중…
    </div>
  );
}

// 잠깐 보여주는 안내 띠 (파란색). 예: 놓친 메시지가 많아 최신부터 보여줄 때
export function InfoBanner({ children }: { children: React.ReactNode }) {
  return (
    <div role="status" className="shrink-0 bg-blue-50 px-4 py-1.5 text-center text-xs leading-5 text-blue-800">
      {children}
    </div>
  );
}

export function NewMessagesButton({ count, onClick }: { count: number; onClick: () => void }) {
  if (count <= 0) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute bottom-4 left-1/2 inline-flex min-h-9 -translate-x-1/2 items-center gap-1 rounded-full bg-[#1e325c] px-4 py-2 text-sm font-medium text-white shadow-md transition-colors hover:bg-[#172746] focus-visible:ring-2 focus-visible:ring-[#1e325c] focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      새 메시지 {count}개 ↓
    </button>
  );
}

// 메시지로 이동해서 예전 구간을 보는 중일 때: 최신 메시지로 돌아가기
export function JumpToLatestButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute bottom-4 left-1/2 inline-flex min-h-9 -translate-x-1/2 items-center gap-1 rounded-full bg-[#1e325c] px-4 py-2 text-sm font-medium text-white shadow-md transition-colors hover:bg-[#172746] focus-visible:ring-2 focus-visible:ring-[#1e325c] focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      최신 메시지로 ↓
    </button>
  );
}

// 위로 올려 예전 메시지를 보는 중일 때 오른쪽 아래 동그란 ↓ (카톡처럼) — 누르면 맨 아래 최신 글로
// 새 메시지가 와 있으면 가운데 "새 메시지 n개 ↓" 가 대신 뜨므로 그때는 숨긴다
export function ScrollDownButton({ show, onClick }: { show: boolean; onClick: () => void }) {
  if (!show) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="맨 아래 최신 메시지로 가기"
      title="최신 메시지로"
      className="absolute right-4 bottom-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white/95 text-lg text-gray-700 shadow-md transition-colors hover:bg-gray-50 hover:text-[#1e325c] focus-visible:ring-2 focus-visible:ring-[#1e325c] focus-visible:outline-none"
    >
      ↓
    </button>
  );
}
