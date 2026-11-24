-- =====================================================================
-- 006_realtime_channel_members.sql  —  channel_members 실시간(Realtime) 켜기
-- 실행 방법: 005_message_edit_delete.sql 까지 실행한 DB 에서
--           Supabase 대시보드 → SQL Editor → 이 파일 전체를 붙여넣고 Run (한 번만)
-- 수정은 팀장(A)만.
--
-- 왜 필요한가 (팀원 요청 11/24)
--   * B 계섭: 말풍선 옆 "안 읽은 사람 수(1, 2…)" — 누가 어디까지 읽었는지(last_read_message_id)가
--     바뀌는 순간 숫자를 바로 줄이기
--   * D 수정: 초대 알림 — 내가 비공개 채널·새 DM 에 추가되면 바로 알리기
--   * C 서보: 사이드바 멤버 수 — 누가 들어오고 나가면 바로 바꾸기
--
-- 스키마·RLS 변경 없음. 이벤트는 기존 channel_members_select 정책을 그대로 따른다
--   (내 줄, 또는 내가 멤버인 채널의 줄만 받는다).
--
-- 구독할 때 알아 둘 것
--   * INSERT / UPDATE : channel_id=eq.{채널} 또는 user_id=eq.{내id} 필터로 구독 가능 (RLS 적용됨)
--   * DELETE          : Supabase 는 삭제 이벤트에 필터·RLS 를 적용하지 못하고
--                       old 에 기본 키(channel_id, user_id)만 보낸다 (004 reactions 와 같은 규칙).
--                       → 화면에서는 "받은 channel_id 가 내 목록에 있을 때만" 처리할 것
--   * UPDATE 는 누가 메시지를 읽을 때마다 온다 (읽음 위치 저장). 같은 채널 멤버 수만큼 전달되므로
--     받은 쪽에서 바로 DB 를 다시 읽지 말고, 받은 값(new.last_read_message_id)으로 화면을 고칠 것
-- =====================================================================

alter publication supabase_realtime add table public.channel_members;


-- ---------------------------------------------------------------------
-- 확인 (실행 후 아래 쿼리 결과에 channel_members 가 보이면 성공)
--   select tablename from pg_publication_tables where pubname = 'supabase_realtime';
--
-- 되돌리기 (필요할 때만)
--   alter publication supabase_realtime drop table public.channel_members;
-- ---------------------------------------------------------------------
