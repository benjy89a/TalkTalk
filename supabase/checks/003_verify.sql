-- =====================================================================
-- 003_security_fix.sql 적용 확인용 (아무것도 저장하지 않음 — 마지막에 rollback)
-- 실행 방법: SQL Editor 에 통째로 붙여넣고 Run → 맨 아래 결과 표를 확인
--   서비스 관리자 계정(app_admins 첫 번째 사람)으로 로그인한 것처럼 흉내 내서 공격을 시도해 본다.
--   모든 줄이 "통과" 또는 "건너뜀" 이면 정상.
-- =====================================================================

begin;

-- 서비스 관리자로 로그인한 것처럼 설정
select set_config(
  'request.jwt.claims',
  json_build_object('sub', (select user_id::text from public.app_admins limit 1), 'role', 'authenticated')::text,
  true
);
set local role authenticated;

do $$
declare
  r text := '';
  n int;
  general_id uuid := (select id from public.channels where name = 'general' and type = 'public');
begin
  -- 1) 내 #general 멤버 줄을 다른 채널로 옮기기 → 막혀야 함
  begin
    update public.channel_members set channel_id = gen_random_uuid()
    where user_id = auth.uid() and channel_id = general_id;
    get diagnostics n = row_count;
    r := r || case when n = 0 then '1) 건너뜀: #general 멤버가 아님' else '1) ❌ 실패: 채널 옮기기가 됨' end || E'\n';
  exception when insufficient_privilege then
    r := r || '1) 통과: 멤버 줄 채널 옮기기 막힘' || E'\n';
  end;

  -- 1-1) 읽음 위치 수정은 계속 되어야 함
  begin
    update public.channel_members set last_read_message_id = last_read_message_id
    where user_id = auth.uid() and channel_id = general_id;
    r := r || '1-1) 통과: 읽음 위치 수정은 정상' || E'\n';
  exception when others then
    r := r || '1-1) ❌ 실패: 읽음 위치 수정이 막힘 (' || sqlerrm || ')' || E'\n';
  end;

  -- 2) 내 메시지를 다른 채널로 옮기기 → 막혀야 함
  begin
    update public.messages set channel_id = gen_random_uuid()
    where id = (select id from public.messages where user_id = auth.uid() limit 1);
    get diagnostics n = row_count;
    r := r || case when n = 0 then '2) 건너뜀: 이 계정이 보낸 메시지가 없음' else '2) ❌ 실패: 메시지 옮기기가 됨' end || E'\n';
  exception when insufficient_privilege then
    r := r || '2) 통과: 메시지 채널 옮기기 막힘' || E'\n';
  end;

  -- 3) #general 을 비공개로 바꾸기 → 막혀야 함
  begin
    update public.channels set type = 'private' where id = general_id;
    get diagnostics n = row_count;
    r := r || case when n = 0 then '3) 건너뜀: #general 관리 권한 없음' else '3) ❌ 실패: 채널 종류 변경이 됨' end || E'\n';
  exception when insufficient_privilege then
    r := r || '3) 통과: 채널 종류 변경 막힘' || E'\n';
  end;

  -- 3-1) #general 이름 바꾸기 → 막혀야 함
  begin
    update public.channels set name = 'general-renamed' where id = general_id;
    get diagnostics n = row_count;
    r := r || case when n = 0 then '3-1) 건너뜀: #general 관리 권한 없음' else '3-1) ❌ 실패: #general 이름 변경이 됨' end || E'\n';
  exception when insufficient_privilege then
    r := r || '3-1) 통과: #general 이름 변경 막힘' || E'\n';
  end;

  perform set_config('verify.result', r, true);
end $$;

select regexp_split_to_table(trim(trailing E'\n' from current_setting('verify.result')), E'\n') as "확인 결과";

rollback;
