-- =====================================================================
-- 007_ai_settings.sql  —  관리자 페이지에서 AI 업체(EXAONE / Gemini) 바꾸기
-- 실행 방법: 006_realtime_channel_members.sql 까지 실행한 DB 에서
--           Supabase 대시보드 → SQL Editor → 이 파일 전체를 붙여넣고 Run (한 번만)
-- 수정은 팀장(A)만.
--
-- 규칙
--   * 저장하는 것은 "어느 업체·모델을 쓸지" 뿐이다. **API 키는 절대 DB 에 저장하지 않는다.**
--     키는 지금처럼 Vercel 환경변수(EXAONE_API_KEY, GEMINI_API_KEY)에만 둔다.
--   * 설정은 한 줄(row)뿐이다. ai_provider 가 null 이면 "환경변수(AI_PROVIDER)를 따른다".
--   * 읽기: 로그인한 사용자 누구나 (업체·모델 이름은 비밀이 아니고, 서버가 요청마다 사용자 세션으로 읽는다)
--   * 바꾸기: 서비스 관리자(app_admins)만, 아래 함수로만. 바꾼 사람·시각이 자동 기록된다.
--       supabase.rpc("admin_set_ai_settings", { provider: "gemini", model: null })
--         provider: 'exaone' | 'gemini' | null(환경변수 따르기)
--         model   : Gemini 모델 ID 또는 null(기본 모델). EXAONE 일 때는 무시해도 된다.
--   * 고른 업체의 키가 서버에 있는지는 DB 가 알 수 없다 → 서버(app/api/ai)가 확인하고 막는다.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. 테이블 (한 줄짜리)
-- ---------------------------------------------------------------------

create table public.ai_settings (
  id            boolean primary key default true check (id),  -- 항상 true → 한 줄만 존재
  ai_provider   text check (ai_provider in ('exaone', 'gemini')),
  gemini_model  text check (gemini_model ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$'),
  updated_by    uuid references auth.users (id) on delete set null,
  updated_at    timestamptz not null default now()
);

-- 처음에는 비어 있음 → 지금처럼 환경변수(AI_PROVIDER)를 따른다
insert into public.ai_settings (id) values (true);


-- ---------------------------------------------------------------------
-- 2. 권한 (RLS): 읽기만 허용. 쓰기 정책은 만들지 않는다 → 아래 함수로만 바꿀 수 있다
-- ---------------------------------------------------------------------

alter table public.ai_settings enable row level security;

create policy "ai_settings_select" on public.ai_settings
  for select to authenticated using (true);


-- ---------------------------------------------------------------------
-- 3. 바꾸기 함수 (서비스 관리자만)
-- ---------------------------------------------------------------------

create function public.admin_set_ai_settings(provider text, model text default null)
returns public.ai_settings
language plpgsql volatile security definer set search_path = ''
as $$
declare
  result public.ai_settings;
begin
  if not public.is_app_admin() then
    raise exception '서비스 관리자만 바꿀 수 있습니다';
  end if;

  if provider is not null and provider not in ('exaone', 'gemini') then
    raise exception 'AI 업체는 exaone 또는 gemini 만 고를 수 있습니다';
  end if;

  if model is not null and model !~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$' then
    raise exception '모델 이름 형식이 올바르지 않습니다';
  end if;

  update public.ai_settings
     set ai_provider  = provider,
         gemini_model = nullif(trim(model), ''),
         updated_by   = auth.uid(),
         updated_at   = now()
   where id
  returning * into result;

  return result;
end;
$$;

-- 로그인한 사용자만 부를 수 있게 (함수 안에서 다시 관리자인지 확인한다)
revoke execute on function public.admin_set_ai_settings(text, text) from public, anon;
grant execute on function public.admin_set_ai_settings(text, text) to authenticated;


-- ---------------------------------------------------------------------
-- 확인 (실행 후)
--   select * from public.ai_settings;   -- 한 줄, ai_provider 가 null 이면 성공
--
-- 되돌리기 (필요할 때만)
--   drop function public.admin_set_ai_settings(text, text);
--   drop table public.ai_settings;
-- ---------------------------------------------------------------------
