-- =====================================================================
-- 005_message_edit_delete.sql  —  "(수정됨)" / "삭제된 메시지입니다" 표시
-- 실행 방법: 004_reactions.sql 까지 실행한 DB 에서
--           Supabase 대시보드 → SQL Editor → 이 파일 전체를 붙여넣고 Run (한 번만)
-- 수정은 팀장(A)만.
--
-- 규칙
--   * edited_at  : content 가 바뀌면 트리거가 자동으로 now() 기록. 화면에서 직접 못 바꿈.
--   * deleted_at : 삭제하면 행은 남기고 시각만 기록 (소프트 삭제) → 답글(스레드)이 살아남는다.
--   * 삭제는 반드시 RPC 로:  supabase.rpc("soft_delete_message", { mid: 메시지id })
--       - 본인 메시지, 또는 채널 관리자(DM 제외) — 기존 실제 삭제 권한(002)과 같은 기준
--       - 삭제되면 content 는 '' 로 비워지고, 첨부·반응 기록도 지워진다 (내용 유출 방지)
--       - 이미 삭제된 메시지에 다시 호출해도 에러 없이 그냥 끝난다
--   * 삭제된 메시지는 내용 수정도, 삭제 취소도 안 된다.
--   * 화면/검색/AI 는 deleted_at 이 null 이 아닌 메시지를 "삭제된 메시지"로 취급한다.
--       검색·AI 에서 빼려면: .is("deleted_at", null)
--   * Realtime: 수정·삭제 모두 messages 의 UPDATE 이벤트로 온다 (추가 설정 없음).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. 칸 추가
-- ---------------------------------------------------------------------

alter table public.messages
  add column edited_at  timestamptz,
  add column deleted_at timestamptz;


-- ---------------------------------------------------------------------
-- 2. 수정 감시 트리거 교체 (003 의 guard_message_update 를 확장)
--    트리거(messages_guard_update)는 그대로 두고 함수만 바꾼다.
-- ---------------------------------------------------------------------

create or replace function public.guard_message_update()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- 서버(service role)가 직접 고치는 경우는 통과
  if auth.uid() is null then
    return new;
  end if;

  -- 003 과 동일: 내용 외의 기본 칸은 못 바꿈
  if new.channel_id is distinct from old.channel_id
     or new.user_id is distinct from old.user_id
     or new.parent_id is distinct from old.parent_id
     or new.client_id is distinct from old.client_id
     or new.created_at is distinct from old.created_at then
    raise exception '메시지는 내용만 수정할 수 있습니다'
      using errcode = '42501';
  end if;

  -- 이미 삭제된 메시지는 아무것도 못 바꿈 (수정·삭제 취소 금지)
  if old.deleted_at is not null then
    raise exception '삭제된 메시지는 수정할 수 없습니다'
      using errcode = '42501';
  end if;

  -- 삭제 요청: soft_delete_message() 를 통해서만 허용
  if new.deleted_at is not null then
    if coalesce(current_setting('talktalk.soft_delete', true), '') <> 'on' then
      raise exception '메시지 삭제는 soft_delete_message 함수를 사용하세요'
        using errcode = '42501';
    end if;
    new.deleted_at := now();
    new.content    := '';
    new.edited_at  := old.edited_at;
    return new;
  end if;

  -- 일반 수정: 내용이 바뀌었을 때만 edited_at 기록 (화면이 보낸 값은 무시)
  if new.content is distinct from old.content then
    new.edited_at := now();
  else
    new.edited_at := old.edited_at;
  end if;
  return new;
end;
$$;


-- ---------------------------------------------------------------------
-- 3. 소프트 삭제 함수 (본인 + 채널 관리자)
-- ---------------------------------------------------------------------

create function public.soft_delete_message(mid bigint)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  m public.messages%rowtype;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다' using errcode = '42501';
  end if;

  select * into m from public.messages where id = mid;
  if not found then
    raise exception '존재하지 않는 메시지입니다' using errcode = 'P0002';
  end if;

  -- 이미 삭제됨 → 조용히 끝 (두 번 눌러도 안전)
  if m.deleted_at is not null then
    return;
  end if;

  -- 권한: 002 의 messages_delete_own 정책과 같은 기준
  if not (
    m.user_id = auth.uid()
    or (
      public.can_manage_channel(m.channel_id)
      and exists (select 1 from public.channels c where c.id = m.channel_id and c.type <> 'dm')
    )
  ) then
    raise exception '이 메시지를 삭제할 권한이 없습니다' using errcode = '42501';
  end if;

  -- 이 트랜잭션 안에서만 트리거가 삭제를 허용하도록 표시
  perform set_config('talktalk.soft_delete', 'on', true);

  update public.messages set deleted_at = now() where id = mid;

  -- 삭제된 메시지에 딸린 첨부 기록·반응은 지운다
  -- (Storage 의 실제 파일은 남는다 — 화면에서 file_url 을 더 이상 못 받으므로 노출되지 않음)
  delete from public.attachments where message_id = mid;
  delete from public.reactions   where message_id = mid;

  perform set_config('talktalk.soft_delete', 'off', true);
end;
$$;

revoke execute on function public.soft_delete_message(bigint) from public, anon;
grant  execute on function public.soft_delete_message(bigint) to authenticated;
