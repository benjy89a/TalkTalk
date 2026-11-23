"use client";
// 관리자 페이지의 "칸(슬롯)" 모음. 담당자 컴포넌트가 준비되면 팀장이 여기서 한 칸씩 바꿔 끼운다.
//   1) 위쪽에 import 한 줄 추가
//   2) 해당 슬롯의 <Placeholder .../> 를 내 컴포넌트로 교체
import AdminUsers from "@/components/admin/AdminUsers";
import AdminChannels from "@/components/admin/AdminChannels";
import AiKeyStatus from "@/components/search/AiKeyStatus";

/** [D] 사용자 목록 + 서비스 관리자 지정·해제 → components/admin/AdminUsers.tsx */
export function AdminUsersSlot() {
  return <AdminUsers />;
}

/** [D] 공개 채널 목록 + 이름 변경·삭제 → components/admin/AdminChannels.tsx */
export function AdminChannelsSlot() {
  return <AdminChannels />;
}

/** [E] AI 키 설정 상태 → components/search/AiKeyStatus.tsx + app/api/ai/status */
export function AdminAiSlot() {
  return <AiKeyStatus />;
}
