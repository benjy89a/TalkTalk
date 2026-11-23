-- =====================================================================
-- 004_reactions.sql  —  메시지 이모지 반응 (👍 ❤️ 😂 …)
-- 실행 방법: 003_admin.sql, 003_security_fix.sql 까지 실행한 DB 에서
--           Supabase 대시보드 → SQL Editor → 이 파일 전체를 붙여넣고 Run (한 번만)
-- 수정은 팀장(A)만.
--
-- 규칙
--   * 한 사람이 한 메시지에 같은 이모지는 한 번만 (기본 키로 보장 → 중복 클릭해도 1개)
--   * 반응 달기 = insert, 반응 취소 = delete (수정은 없음)
--   * 볼 수 있는 메시지(내가 멤버인 채널)에만 반응을 달고 볼 수 있다
--   * 지우기는 본인 반응만
--   * channel_id 는 화면에서 넣지 않아도 된다 → 트리거가 메시지에서 자동으로 채움
--     (Realtime 에서 channel_id=eq.{채널} 필터로 구독하기 위해 칸을 둔다)
--   * 메시지가 삭제되면 반응도 같이 삭제 (on delete cascade)
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. 테이블
-- ---------------------------------------------------------------------

create table public.reactions (
  message_id  bigint not null references public.messages (id) on delete cascade,
  user_id     uuid   not null default auth.uid() references public.profiles (id) on delete cascade,
  emoji       text   not null check (char_length(emoji) between 1 and 16),
  channel_id  uuid   not null references public.channels (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

-- 채널 단위로 반응을 한꺼번에 불러올 때 사용
create index reactions_channel_id_idx on public.reactions (channel_id, message_id);


-- ---------------------------------------------------------------------
-- 2. channel_id 자동 채우기 (화면이 보낸 값은 무시하고 메시지의 채널로 덮어씀)
-- ---------------------------------------------------------------------

create function public.set_reaction_channel()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  select m.channel_id into new.channel_id
  from public.messages m
  where m.id = new.message_id;

  if new.channel_id is null then
    raise exception '존재하지 않는 메시지입니다' using errcode = '23503';
  end if;
  return new;
end;
$$;

create trigger reactions_set_channel
  before insert on public.reactions
  for each row execute function public.set_reaction_channel();


-- ---------------------------------------------------------------------
-- 3. RLS (권한)
-- ---------------------------------------------------------------------

alter table public.reactions enable row level security;

-- 내가 멤버인 채널의 반응만 보기
create policy "reactions_select" on public.reactions
  for select to authenticated
  using (public.is_channel_member(channel_id));

-- 내 이름으로, 내가 멤버인 채널의 메시지에만 달기
create policy "reactions_insert_own" on public.reactions
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_channel_member(channel_id));

-- 본인 반응만 취소
create policy "reactions_delete_own" on public.reactions
  for delete to authenticated
  using (user_id = auth.uid());

-- update 정책은 일부러 만들지 않는다 → 수정 불가 (취소 후 다시 달기)


-- ---------------------------------------------------------------------
-- 4. Realtime: 반응 추가·취소를 실시간으로 받기
--    * INSERT: channel_id=eq.{채널} 필터로 구독 가능 (RLS 적용됨)
--    * DELETE: Supabase 는 삭제 이벤트에 필터·RLS 를 적용하지 못하고
--      old 에 기본 키(message_id, user_id, emoji)만 보낸다.
--      → 화면에서는 "받은 message_id 가 지금 목록에 있으면 그 반응을 뺀다" 로 처리
-- ---------------------------------------------------------------------

alter publication supabase_realtime add table public.reactions;
