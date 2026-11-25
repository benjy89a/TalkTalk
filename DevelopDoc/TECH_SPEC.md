# TECH_SPEC — TalkTalk 기술 명세

> 상태: **최종** (11/25 실제 구현 기준으로 갱신) · 시연 URL: https://talk-talk-gold.vercel.app
> 원본 기준: DB 는 `supabase/migrations/001~008`, 타입은 `types/database.ts`, 연결 규격은 `DevelopDoc/CONTRACTS.md`, 팀 규칙은 `CLAUDE.md`.

## 1. 아키텍처

```
[브라우저 (Next.js 클라이언트 컴포넌트)]
   │  ① 조회/전송: supabase-js (모든 요청에 RLS 권한 검사)
   │  ② 실시간: Supabase Realtime
   │       - postgres_changes: messages · reactions · channel_members 변경 구독
   │       - broadcast: "입력 중…" 신호 / presence: 접속 중 사용자
   ▼
[Supabase]  Auth(이메일) · Postgres(+RLS, 트리거, RPC 함수) · Realtime · Storage(attachments 버킷)
   ▲
   │  ③ 서버 전용 작업: AI 호출 (로그인 쿠키로 사용자 확인 → RLS 적용된 조회)
[Next.js 서버 (app/api/ai/*)] ──► EXAONE API (k-exaone_v2.5)  또는  Google Gemini API (OpenAI 호환 주소)
                                   ↑ 어느 업체를 쓸지는 관리자 설정(ai_settings) → 환경변수(AI_PROVIDER) 순서

배포: Vercel (GitHub main 브랜치 → 자동 배포, Fluid compute)
```

| 영역 | 기술 | 버전 |
|---|---|---|
| 프레임워크 | Next.js App Router, React | 16.4.6, 19.3.0 |
| 언어 | TypeScript | 5 |
| 스타일 | Tailwind CSS (`@tailwindcss/turbopack`) | 4.3.3 |
| 백엔드 | Supabase (`@supabase/supabase-js`, `@supabase/ssr`) | 2.119.1, 0.12.7 |
| AI | EXAONE `k-exaone_v2.5` / Gemini `gemini-3.5-flash-lite`(기본) — 패키지 없이 `fetch` 로 호출 | – |
| 런타임 | Node.js | 24 LTS |
| 배포 | Vercel | – |

> 외부 라이브러리는 위 5개(next, react, react-dom, supabase-js, ssr)뿐이다. 이모지 목록·텍스트 강조·드래그 폭 조절 등은 모두 직접 구현했다.

## 2. 설계 원칙

### 2-1. 서버 DB = 단일 진실 공급원
- 화면에 보이는 메시지·채널·읽음 상태·반응은 모두 DB 에서 온다. 화면에서만 데이터를 지어내지 않는다.
- 내가 보낸 메시지는 먼저 "전송 중"으로 보여 주고(낙관적 표시), DB 에 저장된 행이 오면 그 행으로 교체한다. 실패하면 "재전송" 버튼.
- 권한 검사는 화면이 아니라 DB(RLS·트리거)가 한다. 버튼 숨기기는 편의일 뿐이다.

### 2-2. 델타 동기화
- `messages.id` 는 `bigint` 자동 증가 → 나중에 저장된 메시지가 항상 더 큰 id.
- 채널별로 "마지막으로 받은 id"(`lastId`)를 기억하고, 재접속(Realtime 재구독·온라인 복귀·탭 복귀) 시:
  ```ts
  supabase.from("messages").select("*")
    .eq("channel_id", channelId).is("parent_id", null)
    .gt("id", lastId).order("id").limit(201)
  ```
  - 200개 이하면 이어 붙이고, **200개를 넘으면 최신 50개로 새로 불러온다** (한꺼번에 많이 그려 화면이 멈추는 것 방지).
- 무한 스크롤(과거 방향): `.lt("id", oldestId).order("id", { ascending: false }).limit(50)`, 화면 최대 500개.

### 2-3. 멱등 전송
- 보낼 때마다 `client_id = crypto.randomUUID()` 생성, 재시도 시 **같은 client_id** 재사용 (`components/chat/outbox.ts`).
- `messages.client_id` 에 UNIQUE 제약 → 중복 저장 불가.
  ```ts
  supabase.from("messages").upsert(row, { onConflict: "client_id", ignoreDuplicates: true })
  ```
- 화면에서는 `client_id` 로 "전송 중 메시지"와 "DB에서 온 메시지"를 맞춘다 (중복 표시 방지).
- 배포본 검증: 같은 client_id 로 3번 전송 → DB 1건 · 화면 1개.

## 3. 데이터 모델

```
profiles        (id uuid PK = auth.users.id, name, avatar_url)
channels        (id uuid PK, name, type 'public'|'private'|'dm', created_by → profiles, created_at)
channel_members (channel_id → channels, user_id → profiles, role 'admin'|'member',
                 last_read_message_id bigint)                     PK (channel_id, user_id)
messages        (id bigint identity PK, client_id uuid UNIQUE, channel_id → channels,
                 user_id → profiles, parent_id → messages, content, created_at,
                 edited_at, deleted_at)                           -- 005: 수정·소프트 삭제
attachments     (id uuid PK, message_id → messages, file_url, file_name)
app_admins      (user_id PK → profiles, created_at)               -- 002: 서비스 관리자 목록
reactions       (message_id, user_id, emoji, channel_id, created_at)
                                                PK (message_id, user_id, emoji)  -- 004
ai_settings     (id boolean PK(항상 true, 한 줄), ai_provider 'exaone'|'gemini'|null,
                 gemini_model, updated_by, updated_at)            -- 007: AI 업체 선택 (키는 저장 안 함)
```

### 마이그레이션 (Supabase SQL Editor 에서 번호 순서대로 실행)
| 파일 | 내용 |
|---|---|
| `001_init.sql` | 기본 테이블 5개, 인덱스, RLS, 가입 트리거(`#general` 자동 참여), Storage 버킷·정책, `messages` Realtime |
| `002_roles.sql` | 서비스 관리자(`app_admins`) + 채널 관리자 역할 구분, `is_app_admin()` · `can_manage_channel(cid)` 함수, 공개 채널 생성은 서비스 관리자만 |
| `003_admin.sql` | 관리자 페이지용 함수 `admin_list_users` · `admin_set_app_admin` · `admin_list_channels` |
| `003_security_fix.sql` | update 로 권한을 우회하던 구멍 3개를 막는 가드 트리거 (멤버 줄 옮기기 · 메시지 채널 바꾸기 · 채널 type 바꾸기) |
| `004_reactions.sql` | `reactions` 테이블, RLS, `channel_id` 자동 채움 트리거, Realtime |
| `005_message_edit_delete.sql` | `edited_at` · `deleted_at`, 삭제는 `soft_delete_message(mid)` RPC 로만 (본문·첨부·반응 지움, 댓글은 유지) |
| `006_realtime_channel_members.sql` | `channel_members` Realtime (안 읽은 사람 수 · 초대 알림 · 멤버 수 실시간) |
| `007_ai_settings.sql` | `ai_settings` 한 줄 테이블 + 관리자 전용 `admin_set_ai_settings(provider, model)` |
| `008_dm_unique.sql` | 같은 두 사람의 DM 은 1개만 (DM 이름 `dm:{작은id}:{큰id}` 에 부분 유니크 인덱스) |

### 개념 → 표현 방법
| 개념 | 표현 방법 |
|---|---|
| DM | `type = 'dm'` 채널 + 멤버 2명, 이름 `dm:{작은id}:{큰id}` (화면에는 상대 이름) |
| 읽음 | `channel_members.last_read_message_id` (뒤로 되돌아가지 않음) |
| 미읽음 | 채널 본문(댓글 제외) 중 `id > last_read_message_id` 이고 내가 보내지 않은 메시지가 있으면 굵게 |
| 안 읽은 사람 수 | 같은 채널 멤버 중 `last_read_message_id < 메시지 id` 인 사람 수 (보낸 사람 제외) |
| 스레드 | `messages.parent_id` = root 메시지 id. 채널 본문은 `parent_id is null` |
| 멘션 | 메시지 본문의 `@이름` 글자 (별도 테이블 없음). 이름이 겹치면 가장 길게 맞는 사람, `@all` = 채널 전원 |
| 스레드 댓글 멘션 배지 | 댓글에는 읽음 위치가 없어서 나를 부른 댓글 목록을 브라우저(localStorage, 사용자별)에 저장, 그 스레드를 열면 지움 |
| 답장 인용 | 본문 맨 앞 `> 이름: 원문` 한 줄 (DB 칸 추가 없음 → 검색·AI 에서도 자연스럽게 읽힘) |
| 첨부 파일 | Storage `attachments` 버킷(비공개), 경로 `{channel_id}/{uuid}-{영문화한 파일명}`, 원래 이름은 `file_name`, 보여줄 때 1시간 signed URL |
| 수정·삭제 | 수정하면 트리거가 `edited_at` 기록("(수정됨)"), 삭제는 `deleted_at` + 본문 비움("삭제된 메시지입니다") |
| 역할 | 서비스 관리자 = `app_admins` 에 있음 / 채널 관리자 = `channel_members.role = 'admin'` |
| 입력 중 · 접속 중 | DB 에 저장하지 않음. Realtime broadcast(`typing:{채널}:{root|원본id}`) · presence(`online-users`) |
| 비밀번호 변경 안내 날짜 | Supabase Auth `user_metadata` (`password_changed_at`, `password_remind_at`) |

### 인덱스
- `channels(name)` UNIQUE (DM 제외) · `channels(name) where type='dm'` UNIQUE (008)
- `channel_members(user_id)`
- `messages(channel_id, id)` — 채널 목록·델타 동기화
- `messages(parent_id, id)` — 스레드
- `attachments(message_id)` · `reactions(channel_id, message_id)`

### 트리거
| 트리거 | 하는 일 |
|---|---|
| `on_auth_user_created` | 회원가입 → `profiles` 생성 + `#general` 참여 |
| `channel_members_guard_role` | 관리자가 아니면 role 을 admin 으로 바꿀 수 없음 |
| 가드 트리거 3개 (003) | 멤버 줄은 role·읽음 위치만, 메시지는 content 만, 채널은 name 만 수정 가능 (`#general` 이름 고정) |
| `reactions` channel_id 채움 (004) | 반응의 `channel_id` 를 메시지에서 자동으로 채움 |
| `guard_message_update` (005) | content 가 바뀌면 `edited_at` 기록, 삭제된 메시지는 수정 불가 |

## 4. 권한 (RLS)

| 테이블 | 읽기 | 쓰기 |
|---|---|---|
| profiles | 로그인 사용자 전체 | 본인만 수정 |
| channels | 공개 채널 · 내가 멤버인 채널 · 내가 만든 채널 | 생성: 본인 이름으로 (공개는 서비스 관리자만) / 수정·삭제: 채널 관리자, 공개 채널은 서비스 관리자도 |
| channel_members | 내 줄 · 같은 채널 멤버 | 추가: 채널 관리자·서비스 관리자, 공개 채널은 본인 / 수정: 본인(읽음 위치)·관리자(role) / 삭제: 본인(나가기)·관리자 |
| messages | 멤버인 채널 | 작성: 멤버인 채널에 본인 이름으로 / 수정: 본인 / 삭제: 본인·채널 관리자(DM 제외), `soft_delete_message` 로만 |
| attachments | 볼 수 있는 메시지의 첨부 | 본인 메시지에만 |
| reactions | 멤버인 채널 | 추가·삭제: 본인 반응만 |
| app_admins | 로그인 사용자 (배지 표시용) | 앱에서 직접 불가 → `admin_set_app_admin` 함수(서비스 관리자, 자기 자신 해제 불가) |
| ai_settings | 로그인 사용자 | 앱에서 직접 불가 → `admin_set_ai_settings` 함수(서비스 관리자) |
| storage `attachments` | 경로 첫 폴더 채널의 멤버 | 업로드: 그 채널 멤버 / 삭제: 올린 사람 |

- 비공개 채널·DM 은 서비스 관리자도 멤버가 아니면 보지 못한다 (관리자 페이지 채널 목록에도 공개 채널만).
- `security definer` 함수는 모두 `set search_path = ''` 로 고정하고, 함수 안에서 `is_app_admin()` 을 먼저 확인한다.

## 5. 실시간 (Realtime)

| 구독 대상 | 방식 | 쓰는 곳 |
|---|---|---|
| `messages` INSERT·UPDATE | postgres_changes, `channel_id=eq.{채널}` | 새 메시지·수정·삭제 반영 (B), 미읽음·멘션 (D) |
| `reactions` INSERT·DELETE | postgres_changes | 이모지 반응 (B) |
| `channel_members` INSERT·UPDATE·DELETE | postgres_changes | 안 읽은 사람 수 (B), 초대·새 DM 알림 (D), 사이드바 멤버 수 (C) |
| `typing:{채널}:{root\|원본id}` | broadcast (DB 저장 없음) | "○○님이 입력 중…" — 2초마다 신호, 5초 없으면 지움 (B) |
| `online-users` | presence (DB 저장 없음, id·접속 시각만) | 접속 중 초록 점 (C) |

- RLS 가 적용되므로 멤버인 채널 것만 수신한다.
- DELETE 이벤트에는 필터·RLS 가 적용되지 않고 기본 키만 오므로, 받은 쪽에서 "내 목록에 있는 채널인지" 확인한다.
- `channel_members` UPDATE 는 누가 읽을 때마다 오므로, DB 를 다시 읽지 않고 받은 값으로 화면만 고친다.
- 실시간 신호를 놓친 경우를 대비해 탭 복귀·1분마다 멘션을 다시 확인한다 (D).

## 6. 화면 구성

```
┌────────────┬──────────────────────────────────┬──────────────┐
│ Sidebar    │ MessageArea                      │ ThreadPanel  │
│ 채널 목록(C) │  헤더: 채널명 · 👥 멤버(C) · 🔍 검색(E) │ (B, 폭 조절)  │
│  굵게·배지(D)│  메시지 목록(B) + 첨부(D) + 반응(B)  │ root 메시지   │
│ DM 목록(C)  │  ✨ AI 도구(E)                     │ 댓글 목록     │
│  ● 접속(C)  │  입력창(B) + 첨부·@멘션(D)          │ 댓글 입력창   │
│ 내 정보(C)  │                                  │              │
└────────────┴──────────────────────────────────┴──────────────┘
                              알림 카드(D) — 오른쪽 위
```
- 뼈대: `components/layout/` (AppShell, Sidebar, MessageArea, ThreadPanel, ChannelContext). 팀원 컴포넌트는 `slots.tsx` 에서 한 칸씩 연결.
- 페이지: `/` (채팅), `/login` (로그인·가입), `/login/forgot` (비밀번호 찾기), `/login/reset` (새 비밀번호), `/admin` (관리자 페이지: 사용자 / 채널 / AI 설정 탭)
- 좁은 화면(`md` 미만): 사이드바는 서랍(☰), 스레드 패널은 화면 전체, 말풍선을 톡 누르면 버튼 줄(스레드·반응·답장·복사·수정·삭제).
- 현재 채널 상태는 `ChannelContext` 의 `useSelectedChannel()` 하나로 공유한다 (주소는 `/` 하나).

### 메시지로 이동 (검색 결과 · 알림 카드 연결)
```
[상단 검색 · AI 검색 · 할 일 근거 · 멘션 알림 카드 클릭] → jumpToMessage(channelId, messageId)  (A: ChannelContext)
   → 채널이 다르면 채널 바꾸기 → focusMessage(channelId, messageId)                        (B: components/chat/focus.ts)
   → 화면에 없으면 그 주변을 불러와 스크롤 + 강조, 댓글이면 스레드 열고 그 댓글 강조
```
규격 원본: `DevelopDoc/CONTRACTS.md` 3번.

## 7. AI API (`app/api/ai/`, E)

| 경로 | 요청 | 응답 / 하는 일 |
|---|---|---|
| `POST /api/ai/summarize` | `{ channelId, limit }` (기본 50, 화면 10/25/50) | `{ summary }` — 최근 본문 메시지를 `[이름] 본문` 형식으로 보내 요약 |
| `POST /api/ai/search` | `{ query, channelId?, limit? }` (질문 500자, 결과 기본 20·최대 50) | AI 가 질문을 키워드·기간으로 바꾼 뒤 **DB 를 RLS 로 검색** (AI 가 결과를 지어내지 않음) |
| `POST /api/ai/tasks` | `{ channelId, limit }` (기본 10·최대 25) | 할 일·담당자·기한·근거 메시지 id (최대 10개) |
| `GET /api/ai/status` | `?view=public` | 누구나: 업체·모델 이름만 / 관리자: 적용 업체·출처·업체별 키 설정 여부 |
| `PUT /api/ai/status` | `{ provider, model }` | 관리자: 업체·모델 저장 (고른 업체의 키가 서버에 없으면 409) |
| `POST /api/ai/status` | – | 관리자: 연결 테스트 (지금 업체로 1회 호출) |

- 모든 경로는 서버에서 로그인과 채널 멤버 여부를 확인한 뒤, **로그인 사용자의 세션(RLS 적용)** 으로 DB 를 읽는다. 대화 원문·키를 브라우저에서 보내지 않는다.
- 업체 선택 우선순위: 관리자 설정(`ai_settings`, 10초 캐시) → 환경변수 `AI_PROVIDER` → EXAONE. 고른 업체의 키가 없으면 다른 업체로 대신 호출하지 않는다.
- 응답 대기 최대 240초, 화면에 경과 시간·취소 버튼. Vercel 함수 `maxDuration = 300`. 자동 재시도 없음.
- 한 채널에서 요약·검색·추출은 동시에 하나만 실행한다 (`aiRequestGate.ts`). 탭을 옮겨도 유지, 로그아웃하면 취소.
- 서버 호출 제한 (`rateLimit.ts`): 사용자별 동시 1건 · 최근 60초 5회, 세 기능이 한도를 공유한다. 넘으면 429 `USER_BUSY` / `USER_RATE_LIMITED` 와 남은 시간 안내. 입력·권한 검사를 통과한 실제 AI 호출만 센다. 서버 인스턴스 메모리 기준이라 인스턴스가 여러 개면 각각 센다 (연타 방지용).
- 입력 제한: 본문 128KiB, 메시지당 4,000자, 합계 20,000자. 오류는 `{ error: { code, message } }` 한국어 안내, `Cache-Control: no-store`.
- 상세: `app/api/ai/README.md`, `app/api/ai/E4.md`.

## 8. 폴더 구조

| 경로 | 담당 | 내용 |
|---|---|---|
| `supabase/migrations/` | A | 스키마 SQL 001~008 |
| `lib/supabase/` | A | `client.ts`(브라우저) · `server.ts`(서버) · `proxy.ts`(세션 갱신) · `env.ts` |
| `types/database.ts` | A | DB 타입 |
| `proxy.ts` | A | 모든 요청에서 로그인 세션 갱신, 비로그인이면 `/login` 으로 |
| `components/layout/`, `app/admin/` | A | 화면 뼈대·관리자 페이지 틀, 팀원 컴포넌트 연결(`slots.tsx`) |
| `components/chat/` | B | 메시지·스레드·수정·삭제·반응·입력 중·안 읽은 사람 수·이동 |
| `app/(auth)/`, `components/channel/` | C | 로그인·비밀번호, 채널·DM, 멤버·관리자, 내 정보, 접속 표시 |
| `components/attachments/`, `components/notifications/` | D | 첨부, 읽음·미읽음·멘션·알림 카드 |
| `components/admin/` | D | 관리자 페이지: 사용자·채널 관리 |
| `app/api/ai/` | E | AI API (서버) |
| `components/search/` | E | 검색·AI 도구 화면·관리자 AI 설정 |

## 9. 환경변수

| 이름 | 쓰는 곳 | 설명 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 브라우저·서버 | Supabase 프로젝트 주소 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 브라우저·서버 | 공개용 키 (RLS 가 권한을 지킴) |
| `EXAONE_API_KEY` | 서버(`app/api/ai`)만 | EXAONE 키 |
| `GEMINI_API_KEY` | 서버(`app/api/ai`)만 | Gemini 키 |
| `AI_PROVIDER` | 서버 | 선택. `exaone`(기본) / `gemini` — 관리자 설정이 "환경변수 따르기"일 때 |
| `GEMINI_MODEL` | 서버 | 선택. 기본 `gemini-3.5-flash-lite` |

- `NEXT_PUBLIC_` 이 붙은 값만 브라우저에 노출된다. AI 키는 DB·로그·화면 어디에도 넣지 않는다 (관리자 화면에는 "있음/없음"과 환경변수 이름만).
- 서비스 역할 키(service role)는 사용하지 않는다.

## 10. 테스트·품질
- 자동 테스트: `node --test` → **327개 통과** (11/25). 실제 DB·AI 대신 가짜 응답으로 규칙(멘션 판별·미읽음 계산·파일 규칙·AI 입력 검사·오류 처리·취소 등)을 검사.
- `npm run lint` · `npm run build` 에러 없음 (11/25).
- 배포본 점검(11/24): 실시간 0.48~0.96초, 멱등(3번 전송 → 1건), 델타 동기화(끊긴 사이 3건 → 0.4초 만에 채움), 스레드, 콘솔 에러 0건.
- 성능 측정: 메시지 1만 건 채널에서 화면 최대 500개 제한 → 50개 추가 로드 0.25~0.47초, 화면 멈춤 최대 0.12초.

## 11. 배포
- Vercel 에 GitHub 레포 연결 → main 에 머지되면 자동 배포. 주소: https://talk-talk-gold.vercel.app
- Vercel 환경변수에 9번 표의 값 등록 (바꾼 뒤에는 다시 배포). Fluid compute 켜짐 (AI 경로 최대 300초).
- Supabase Auth → URL Configuration 에 Vercel 주소 등록 (비밀번호 재설정 메일 링크용).
- Supabase 무료 플랜은 1주일 미사용 시 일시정지 → 심사 기간 중 주기적으로 접속.
