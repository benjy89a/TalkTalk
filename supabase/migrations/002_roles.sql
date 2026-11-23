-- =====================================================================
-- 002_roles.sql  —  서비스 관리자 + 채널 관리자 역할 구분
-- 실행 방법: 001_init.sql 을 이미 실행한 DB 에서
--           Supabase 대시보드 → SQL Editor → 이 파일 전체를 붙여넣고 Run (한 번만)
-- 수정은 팀장(A)만.
--
-- 역할 정리
--   * 서비스 관리자 (app_admins 테이블에 있는 사람, SQL Editor 로만 지정)
--       - 공개 채널을 만들 수 있다 (일반 멤버는 비공개 채널·DM 만)
--       - 모든 공개 채널(#general 포함)을 관리: 이름 변경·삭제·멤버 관리·관리자 지정·메시지 삭제
--       - 비공개 채널·DM 은 건드리지 못한다 (멤버가 아니면 내용도 못 본다)
--   * 채널 관리자 (channel_members.role = 'admin', 채널을 만든 사람이 자동으로 됨)
--       - 자기 채널의 이름 변경·삭제·초대·내보내기·관리자 지정·메시지 삭제
--   * 멤버
--       - 대화, 본인 메시지 수정·삭제, 비공개 채널·DM 만들기(만들면 그 채널의 관리자)
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. 서비스 관리자 목록
--    profiles 에 칸을 추가하지 않는 이유: profiles 는 본인이 수정할 수 있어서
--    스스로 관리자가 될 수 있기 때문. 이 테이블은 화면(앱)에서 쓸 수 없다.
-- ---------------------------------------------------------------------

create table public.app_admins (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);

alter table public.app_admins enable row level security;

-- 누가 서비스 관리자인지는 로그인한 사람 모두 볼 수 있음 (화면에 배지·버튼 표시용)
create policy "app_admins_select" on public.app_admins
  for select to authenticated using (true);
-- insert / update / delete 정책은 일부러 만들지 않는다 → SQL Editor 에서만 추가·삭제 가능


-- ---------------------------------------------------------------------
-- 2. 권한 확인용 함수
-- ---------------------------------------------------------------------

-- 내가 서비스 관리자인가?
create function public.is_app_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;

-- 내가 이 채널을 관리할 수 있는가?
--  * 그 채널의 관리자이거나
--  * 서비스 관리자이고 그 채널이 공개 채널이면
create function public.can_manage_channel(cid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.is_channel_admin(cid)
      or (public.is_app_admin()
          and exists (select 1 from public.channels c where c.id = cid and c.type = 'public'));
$$;

-- 이 사용자(uid)를 이 채널에 넣을 수 있는가? (001 의 함수를 교체)
--  * 채널을 만든 사람 → 누구든 추가 가능 (비공개 채널·DM 만들 때)
--  * 공개 채널 → 자기 자신은 자유롭게 참여 가능
--  * 채널을 관리할 수 있는 사람 → 누구든 추가 가능
create or replace function public.can_add_channel_member(cid uuid, uid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.channels c
    where c.id = cid
      and (c.created_by = auth.uid() or (c.type = 'public' and uid = auth.uid()))
  ) or public.can_manage_channel(cid);
$$;


-- ---------------------------------------------------------------------
-- 3. channels 정책 교체
-- ---------------------------------------------------------------------

-- 공개 채널은 서비스 관리자만 만들 수 있다
drop policy "channels_insert" on public.channels;
create policy "channels_insert" on public.channels
  for insert to authenticated
  with check (created_by = auth.uid() and (type <> 'public' or public.is_app_admin()));

-- 이름 변경: 채널 관리자 또는 (공개 채널이면) 서비스 관리자
drop policy "channels_update_admin" on public.channels;
create policy "channels_update_admin" on public.channels
  for update to authenticated using (public.can_manage_channel(id));

-- 삭제: 위와 같음. 단 #general 은 아무도 지울 수 없다
drop policy "channels_delete_admin" on public.channels;
create policy "channels_delete_admin" on public.channels
  for delete to authenticated
  using (public.can_manage_channel(id) and not (type = 'public' and name = 'general'));


-- ---------------------------------------------------------------------
-- 4. channel_members 정책 교체 (내보내기·역할 변경)
-- ---------------------------------------------------------------------

drop policy "channel_members_update" on public.channel_members;
create policy "channel_members_update" on public.channel_members
  for update to authenticated
  using (user_id = auth.uid() or public.can_manage_channel(channel_id));

drop policy "channel_members_delete" on public.channel_members;
create policy "channel_members_delete" on public.channel_members
  for delete to authenticated
  using (user_id = auth.uid() or public.can_manage_channel(channel_id));

-- 관리자 지정 보호 트리거도 같은 기준으로 교체
create or replace function public.guard_member_role()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- 트리거·SQL Editor 처럼 로그인 사용자 없이 실행되는 경우는 통과
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' and new.role = 'admin' then
    if not (
      public.can_manage_channel(new.channel_id)
      or exists (select 1 from public.channels c
                 where c.id = new.channel_id and c.created_by = auth.uid() and new.user_id = auth.uid())
    ) then
      new.role := 'member';
    end if;
  elsif tg_op = 'UPDATE' and new.role is distinct from old.role then
    if not public.can_manage_channel(old.channel_id) then
      raise exception '관리자만 역할을 바꿀 수 있습니다';
    end if;
  end if;
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- 5. messages 삭제 정책 교체
--    본인 메시지 + 관리자는 자기가 관리하는 채널의 다른 사람 메시지도 삭제 가능
--    DM 에서는 상대 메시지를 지울 수 없다 (본인 것만)
-- ---------------------------------------------------------------------

drop policy "messages_delete_own" on public.messages;
create policy "messages_delete_own" on public.messages
  for delete to authenticated
  using (
    user_id = auth.uid()
    or (
      public.can_manage_channel(channel_id)
      and exists (select 1 from public.channels c where c.id = channel_id and c.type <> 'dm')
    )
  );


-- ---------------------------------------------------------------------
-- 6. 서비스 관리자 지정 방법 (필요할 때 SQL Editor 에서 직접 실행)
--    아래 이메일을 실제 관리자 이메일로 바꿔서 실행한다.
-- ---------------------------------------------------------------------

-- insert into public.app_admins (user_id)
-- select id from auth.users where email = '관리자이메일@example.com'
-- on conflict do nothing;

-- 해제:
-- delete from public.app_admins
-- where user_id = (select id from auth.users where email = '관리자이메일@example.com');
