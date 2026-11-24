"use client";

// [C] 접속 상태 점: 접속 중이면 초록 점, 아니면 회색 빈 점
// 사용 예:
//   <OnlineDot online={useIsOnline(userId)} />
//   <OnlineDot online={online} ringClass="ring-[#1e325c]" />   // 남색 사이드바 위에서는 테두리 색을 배경에 맞춘다
type Props = {
  online: boolean;
  ringClass?: string; // 점 테두리 색 (배경색과 맞추면 아바타 모서리에 붙여도 깔끔하다)
  className?: string;
};

export default function OnlineDot({ online, ringClass = "ring-white", className = "" }: Props) {
  return (
    <span
      title={online ? "접속 중" : "접속 안 함"}
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-2 ${ringClass} ${
        online ? "bg-emerald-500" : "border-2 border-gray-400 bg-transparent"
      } ${className}`}
    >
      <span className="sr-only">{online ? "(접속 중)" : "(접속 안 함)"}</span>
    </span>
  );
}
