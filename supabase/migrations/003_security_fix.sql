-- =====================================================================
-- 003_security_fix.sql  —  "수정(update)" 으로 권한을 우회하던 구멍 3개 막기
-- 실행 방법: 002_roles.sql 까지 실행한 DB 에서
--           Supabase 대시보드 → SQL Editor → 이 파일 전체를 붙여넣고 Run (한 번만)
-- 수정은 팀장(A)만.
--
-- 문제: 수정 정책(update)이 "내 줄인지"만 보고, 어떤 칸을 바꾸는지는 보지 않았다.
--   1) channel_members: 내 멤버 줄의 channel_id 를 남의 비공개 채널로 바꾸면 그 채널 멤버가 됨
--      (내가 admin 인 줄을 옮기면 남의 채널 관리자까지 됨)
--   2) messages: 내 메시지의 channel_id 를 바꾸면 남의 채널(비공개·DM)에 메시지를 넣을 수 있음
--   3) channels: 채널 관리자가 type 을 'public' 으로 바꿔 "공개 채널은 서비스 관리자만" 규칙을 우회
--      (서비스 관리자가 general 이름을 바꾸면 삭제 금지·신규 가입자 자동 참여도 깨짐)
--
-- 해결: 수정할 때 "바뀌면 안 되는 칸"을 트리거로 막는다.
--   * channel_members: role, last_read_message_id 만 수정 가능
--   * messages: content 만 수정 가능
--   * channels: name 만 수정 가능 (단 #general 은 이름도 못 바꿈)
-- 화면 코드는 이 칸들만 수정하고 있으므로 영향 없음.
-- SQL Editor 처럼 로그인 사용자 없이 실행되는 경우(auth.uid() 가 null)는 통과 → 팀장이 직접 고칠 수 있음.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. channel_members: 다른 채널·다른 사람 줄로 옮기기 금지
-- ---------------------------------------------------------------------

create function public.guard_member_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.channel_id is distinct from old.channel_id
     or new.user_id is distinct from old.user_id then
    raise exception '채널 멤버 정보의 채널·사용자는 바꿀 수 없습니다'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger channel_members_guard_update
  before update on public.channel_members
  for each row execute function public.guard_member_update();


-- ---------------------------------------------------------------------
-- 2. messages: 내용(content)만 수정 가능
-- ---------------------------------------------------------------------

create function public.guard_message_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.channel_id is distinct from old.channel_id
     or new.user_id is distinct from old.user_id
     or new.parent_id is distinct from old.parent_id
     or new.client_id is distinct from old.client_id
     or new.created_at is distinct from old.created_at then
    raise exception '메시지는 내용만 수정할 수 있습니다'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger messages_guard_update
  before update on public.messages
  for each row execute function public.guard_message_update();


-- ---------------------------------------------------------------------
-- 3. channels: 이름(name)만 수정 가능, #general 은 이름도 고정
-- ---------------------------------------------------------------------

create function public.guard_channel_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.type is distinct from old.type
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception '채널은 이름만 바꿀 수 있습니다'
      using errcode = '42501';
  end if;

  if old.type = 'public' and old.name = 'general'
     and new.name is distinct from old.name then
    raise exception '#general 채널의 이름은 바꿀 수 없습니다'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger channels_guard_update
  before update on public.channels
  for each row execute function public.guard_channel_update();
