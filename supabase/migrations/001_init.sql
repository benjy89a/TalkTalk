-- =====================================================================
-- 001_init.sql  —  TalkTalk 최초 스키마
-- 실행 방법: Supabase 대시보드 → SQL Editor → 이 파일 전체를 붙여넣고 Run (한 번만)
-- 수정은 팀장(A)만. 변경이 필요하면 002_xxx.sql 처럼 새 파일을 추가한다.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. 테이블
-- ---------------------------------------------------------------------

-- 사용자 프로필 (auth.users 와 1:1, 회원가입 시 트리거로 자동 생성)
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null default '',
  avatar_url  text
);

-- 채널: 공개(public) / 비공개(private) / DM(dm, 멤버 2명)
create table public.channels (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  type        text not null check (type in ('public', 'private', 'dm')),
  created_by  uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

-- 채널 멤버 + 읽음 위치
create table public.channel_members (
  channel_id            uuid not null references public.channels (id) on delete cascade,
  user_id               uuid not null references public.profiles (id) on delete cascade,
  role                  text not null default 'member' check (role in ('admin', 'member')),
  last_read_message_id  bigint,  -- 이 id 까지 읽음. 미읽음 = 이 값보다 큰 id 의 메시지
  primary key (channel_id, user_id)
);

-- 메시지
--  * id 는 순서대로 커지는 숫자 → "마지막으로 받은 id 이후" 델타 동기화에 사용
--  * client_id 는 클라이언트가 만든 UUID → 같은 메시지를 두 번 보내도 한 번만 저장 (멱등)
--  * parent_id 가 있으면 스레드 답글 (root 메시지의 id)
create table public.messages (
  id          bigint generated always as identity primary key,
  client_id   uuid not null unique,
  channel_id  uuid not null references public.channels (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  parent_id   bigint references public.messages (id) on delete cascade,
  content     text not null default '',
  created_at  timestamptz not null default now()
);

-- 첨부파일
--  * file_url 에는 Storage 'attachments' 버킷 안의 경로를 저장한다
--    경로 규칙: {channel_id}/{아무 uuid}-{파일이름}
--  * 버킷이 비공개이므로 화면에 보여줄 때는 createSignedUrl 로 임시 URL 을 만든다
create table public.attachments (
  id          uuid primary key default gen_random_uuid(),
  message_id  bigint not null references public.messages (id) on delete cascade,
  file_url    text not null,
  file_name   text not null
);


-- ---------------------------------------------------------------------
-- 2. 인덱스
-- ---------------------------------------------------------------------

-- 채널 이름 중복 방지 (DM 은 이름이 겹쳐도 됨)
create unique index channels_name_unique on public.channels (name) where type <> 'dm';

-- "내가 속한 채널 목록"
create index channel_members_user_id_idx on public.channel_members (user_id);

-- 채널 메시지 목록 / 델타 동기화 (channel_id = ? and id > ? order by id)
create index messages_channel_id_id_idx on public.messages (channel_id, id);

-- 스레드 답글 목록 (parent_id = ? order by id)
create index messages_parent_id_idx on public.messages (parent_id, id) where parent_id is not null;

-- 메시지의 첨부파일
create index attachments_message_id_idx on public.attachments (message_id);


-- ---------------------------------------------------------------------
-- 3. 권한 확인용 함수 (RLS 정책에서 사용)
--    security definer: 정책끼리 서로를 참조하다 무한 루프 나는 것을 막기 위함
-- ---------------------------------------------------------------------

-- 내가 이 채널 멤버인가?
create function public.is_channel_member(cid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.channel_members
    where channel_id = cid and user_id = auth.uid()
  );
$$;

-- 내가 이 채널 관리자인가?
create function public.is_channel_admin(cid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.channel_members
    where channel_id = cid and user_id = auth.uid() and role = 'admin'
  );
$$;

-- 이 사용자(uid)를 이 채널에 넣을 수 있는가?
--  * 채널을 만든 사람 → 누구든 추가 가능 (비공개 채널·DM 만들 때)
--  * 공개 채널 → 자기 자신은 자유롭게 참여 가능
--  * 채널 관리자 → 누구든 추가 가능
create function public.can_add_channel_member(cid uuid, uid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.channels c
    where c.id = cid
      and (c.created_by = auth.uid() or (c.type = 'public' and uid = auth.uid()))
  ) or public.is_channel_admin(cid);
$$;

-- Storage 경로 첫 폴더({channel_id})의 채널 멤버인가?
create function public.can_access_attachment_path(path text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  folder text := split_part(path, '/', 1);
begin
  if folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return public.is_channel_member(folder::uuid);
end;
$$;


-- ---------------------------------------------------------------------
-- 4. RLS (행 단위 보안)
--    기본 원칙: 로그인한 사용자는 "자기가 멤버인 채널"만 읽고 쓴다.
-- ---------------------------------------------------------------------

alter table public.profiles        enable row level security;
alter table public.channels        enable row level security;
alter table public.channel_members enable row level security;
alter table public.messages        enable row level security;
alter table public.attachments     enable row level security;

-- profiles: 이름·아바타는 로그인한 사람 모두 볼 수 있음, 수정은 본인만
create policy "profiles_select" on public.profiles
  for select to authenticated using (true);
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- channels: 멤버인 채널 + 공개 채널(둘러보고 참여하기 위해) + 내가 만든 채널
create policy "channels_select" on public.channels
  for select to authenticated
  using (type = 'public' or created_by = auth.uid() or public.is_channel_member(id));
create policy "channels_insert" on public.channels
  for insert to authenticated with check (created_by = auth.uid());
create policy "channels_update_admin" on public.channels
  for update to authenticated using (public.is_channel_admin(id));
create policy "channels_delete_admin" on public.channels
  for delete to authenticated using (public.is_channel_admin(id));

-- channel_members
create policy "channel_members_select" on public.channel_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_channel_member(channel_id));
create policy "channel_members_insert" on public.channel_members
  for insert to authenticated
  with check (public.can_add_channel_member(channel_id, user_id));
-- 본인 행(읽음 위치) 수정 또는 관리자의 수정
create policy "channel_members_update" on public.channel_members
  for update to authenticated
  using (user_id = auth.uid() or public.is_channel_admin(channel_id));
-- 본인 나가기 또는 관리자의 내보내기
create policy "channel_members_delete" on public.channel_members
  for delete to authenticated
  using (user_id = auth.uid() or public.is_channel_admin(channel_id));

-- messages: 멤버인 채널만 읽기/쓰기, 수정·삭제는 본인 메시지만
create policy "messages_select" on public.messages
  for select to authenticated using (public.is_channel_member(channel_id));
create policy "messages_insert" on public.messages
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_channel_member(channel_id));
create policy "messages_update_own" on public.messages
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "messages_delete_own" on public.messages
  for delete to authenticated using (user_id = auth.uid());

-- attachments: 볼 수 있는 메시지의 첨부만 보기, 내 메시지에만 첨부
create policy "attachments_select" on public.attachments
  for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id));
create policy "attachments_insert_own" on public.attachments
  for insert to authenticated
  with check (exists (select 1 from public.messages m where m.id = message_id and m.user_id = auth.uid()));
create policy "attachments_delete_own" on public.attachments
  for delete to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id and m.user_id = auth.uid()));


-- ---------------------------------------------------------------------
-- 5. 관리자 권한 보호: 관리자가 아니면 role 을 'admin' 으로 바꿀 수 없음
--    (채널을 만든 사람은 처음에 자기 자신을 admin 으로 넣을 수 있음)
-- ---------------------------------------------------------------------

create function public.guard_member_role()
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
      public.is_channel_admin(new.channel_id)
      or exists (select 1 from public.channels c
                 where c.id = new.channel_id and c.created_by = auth.uid() and new.user_id = auth.uid())
    ) then
      new.role := 'member';
    end if;
  elsif tg_op = 'UPDATE' and new.role is distinct from old.role then
    if not public.is_channel_admin(old.channel_id) then
      raise exception '관리자만 역할을 바꿀 수 있습니다';
    end if;
  end if;
  return new;
end;
$$;

create trigger channel_members_guard_role
  before insert or update on public.channel_members
  for each row execute function public.guard_member_role();


-- ---------------------------------------------------------------------
-- 6. 기본 채널 #general
-- ---------------------------------------------------------------------

insert into public.channels (name, type)
values ('general', 'public')
on conflict (name) where type <> 'dm' do nothing;


-- ---------------------------------------------------------------------
-- 7. 회원가입 시 profiles 자동 생성 + #general 자동 참여
--    이름은 가입 시 options.data.name 으로 넘기면 사용, 없으면 이메일 앞부분
-- ---------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, name, avatar_url)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;

  insert into public.channel_members (channel_id, user_id, role)
  select c.id, new.id, 'member'
  from public.channels c
  where c.name = 'general' and c.type = 'public'
  on conflict do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 이 SQL 을 실행하기 전에 이미 가입한 사용자가 있다면 똑같이 채워줌
insert into public.profiles (id, name)
select u.id, split_part(u.email, '@', 1) from auth.users u
on conflict (id) do nothing;

insert into public.channel_members (channel_id, user_id, role)
select c.id, p.id, 'member'
from public.profiles p
cross join public.channels c
where c.name = 'general' and c.type = 'public'
on conflict do nothing;


-- ---------------------------------------------------------------------
-- 8. Realtime: messages 테이블 변경을 실시간으로 받기
--    (RLS 가 적용되므로 멤버인 채널의 메시지만 전달됨)
-- ---------------------------------------------------------------------

alter publication supabase_realtime add table public.messages;


-- ---------------------------------------------------------------------
-- 9. Storage: 첨부파일 버킷 (비공개)
--    경로의 첫 폴더가 channel_id 이고, 그 채널 멤버만 올리고 볼 수 있음
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

create policy "attachments_bucket_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'attachments' and public.can_access_attachment_path(name));

create policy "attachments_bucket_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attachments' and public.can_access_attachment_path(name));

create policy "attachments_bucket_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'attachments' and owner_id = auth.uid()::text);
