-- =====================================================================
-- 003_admin.sql  —  관리자 페이지(/admin)용 DB 함수 + 관리자 계정 지정
-- 실행 방법: 002_roles.sql 을 이미 실행한 DB 에서
--           Supabase 대시보드 → SQL Editor → 이 파일 전체를 붙여넣고 Run (한 번만)
-- 수정은 팀장(A)만.
--
-- 모든 함수는 "서비스 관리자(app_admins)" 만 결과를 받는다. 아니면 에러.
-- 비공개 채널·DM 은 002 원칙대로 관리자 페이지에서도 보이지 않는다 (사생활 보호).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. 사용자 목록 (이름 + 이메일 + 가입일 + 서비스 관리자 여부)
--    이메일은 auth.users 에만 있어서 화면에서 직접 못 읽는다 → 이 함수로만 제공
-- ---------------------------------------------------------------------

create function public.admin_list_users()
returns table (
  id          uuid,
  name        text,
  email       text,
  created_at  timestamptz,
  is_app_admin boolean
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception '서비스 관리자만 볼 수 있습니다';
  end if;

  return query
    select p.id,
           p.name,
           u.email::text,
           u.created_at,
           exists (select 1 from public.app_admins a where a.user_id = p.id)
    from public.profiles p
    join auth.users u on u.id = p.id
    order by u.created_at;
end;
$$;


-- ---------------------------------------------------------------------
-- 2. 서비스 관리자 지정·해제
--    자기 자신은 해제할 수 없다 (관리자가 0명이 되어 아무도 못 들어오는 사고 방지)
-- ---------------------------------------------------------------------

create function public.admin_set_app_admin(uid uuid, make_admin boolean)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception '서비스 관리자만 바꿀 수 있습니다';
  end if;

  if make_admin then
    insert into public.app_admins (user_id) values (uid)
    on conflict do nothing;
  else
    if uid = auth.uid() then
      raise exception '자기 자신의 관리자 권한은 해제할 수 없습니다';
    end if;
    delete from public.app_admins where user_id = uid;
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- 3. 공개 채널 목록 (멤버 수 포함)
--    channel_members 는 멤버만 읽을 수 있어서, 참여하지 않은 채널의 인원은 이 함수로 센다.
--    이름 변경·삭제·멤버 관리는 002 의 정책으로 이미 허용돼 있으니 기존 방식(update/delete)을 쓴다.
-- ---------------------------------------------------------------------

create function public.admin_list_channels()
returns table (
  id            uuid,
  name          text,
  created_by    uuid,
  created_at    timestamptz,
  member_count  bigint
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_app_admin() then
    raise exception '서비스 관리자만 볼 수 있습니다';
  end if;

  return query
    select c.id,
           c.name,
           c.created_by,
           c.created_at,
           (select count(*) from public.channel_members m where m.channel_id = c.id)
    from public.channels c
    where c.type = 'public'
    order by c.name;
end;
$$;


-- 로그인한 사용자만 부를 수 있게 (함수 안에서 다시 관리자인지 확인한다)
revoke execute on function public.admin_list_users() from public, anon;
revoke execute on function public.admin_set_app_admin(uuid, boolean) from public, anon;
revoke execute on function public.admin_list_channels() from public, anon;
grant execute on function public.admin_list_users() to authenticated;
grant execute on function public.admin_set_app_admin(uuid, boolean) to authenticated;
grant execute on function public.admin_list_channels() to authenticated;


-- ---------------------------------------------------------------------
-- 4. 기본 관리자 계정 지정 (admin@talktalk.com)
--    먼저 앱의 회원가입 화면에서 admin@talktalk.com 으로 가입해 두어야 한다.
--    가입 전에 실행하면 아무 일도 일어나지 않는다 → 가입 후 이 부분만 다시 실행하면 된다.
-- ---------------------------------------------------------------------

insert into public.app_admins (user_id)
select id from auth.users where email = 'admin@talktalk.com'
on conflict do nothing;
