# components/admin — [D] 관리자 페이지(`/admin`)의 사용자 관리 · 채널 관리 탭

요청서: [`DevelopDoc/REQUEST_TO_D.md`](../../DevelopDoc/REQUEST_TO_D.md)

## 연결 방법 (`app/admin/slots.tsx`, 팀장)

```tsx
import AdminUsers from "@/components/admin/AdminUsers";
import AdminChannels from "@/components/admin/AdminChannels";

export function AdminUsersSlot() {
  return <AdminUsers />;
}
export function AdminChannelsSlot() {
  return <AdminChannels />;
}
```

## 사용자 관리 — `AdminUsers`
- `rpc("admin_list_users")` 로 이름 / 이메일 / 가입일 / 권한(관리자 배지) 표
- 이름·이메일 검색 칸
- "관리자로 지정" / "관리자 해제" → 확인창 → `rpc("admin_set_app_admin")` → 목록 다시 불러오기
- 내가 관리자인 줄에는 "해제" 버튼이 없음 (DB 도 자기 자신 해제를 막음)
- 사용자 삭제는 하지 않음 (서버 전용 비밀키 필요)

## 채널 관리 — `AdminChannels`
- `rpc("admin_list_channels")` 로 공개 채널 이름 / 멤버 수 / 만든 날 표 (비공개·DM 은 안 나옴)
- **이름 변경**: 줄 안에서 바로 고치고 Enter·저장 (Esc·취소로 닫기). 같은 이름이 있으면 "이미 있는 채널 이름이에요."
- **삭제**: "정말 삭제할까요? 되돌릴 수 없어요." 확인창 → 메시지·첨부 기록까지 같이 지워짐
- `#general` 은 이름 변경·삭제 버튼이 없음 (DB 도 막음)

## 공통
- 처음 불러오는 동안 "불러오는 중…"
- 오류는 DB 원문 대신 "권한이 없거나 잠시 후 다시 시도해 주세요." 같은 안내 (원문은 브라우저 콘솔에만)

## 테스트

```bash
node --test components/admin/adminRules.test.mjs
```
