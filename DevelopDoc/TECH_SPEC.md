# TECH_SPEC — TalkTalk 기술 명세

> 원본 기준: DB 는 `supabase/migrations/001_init.sql`, 타입은 `types/database.ts`, 팀 규칙은 `CLAUDE.md`.

## 1. 아키텍처

```
[브라우저 (Next.js 클라이언트 컴포넌트)]
   │  ① 조회/전송: supabase-js (RLS 로 권한 검사)
   │  ② 실시간: Supabase Realtime (messages INSERT 구독)
   ▼
[Supabase]  Auth · Postgres(+RLS) · Realtime · Storage
   ▲
   │  ③ 서버 전용 작업(AI 호출 등)
[Next.js 서버 (app/api/*)] ── Anthropic API (AI 요약·검색·할 일 추출)

배포: Vercel (GitHub main 브랜치 → 자동 배포)
```

| 영역 | 기술 | 버전 |
|---|---|---|
| 프레임워크 | Next.js App Router, React | 16.4.6, 19.3 |
| 언어 | TypeScript | 5 |
| 스타일 | Tailwind CSS | 4.3 |
| 백엔드 | Supabase (`@supabase/supabase-js`, `@supabase/ssr`) | 2.119.1, 0.12.7 |
| 런타임 | Node.js | 24 LTS |
| 배포 | Vercel | – |

## 2. 설계 원칙

### 2-1. 서버 DB = 단일 진실 공급원
- 화면에 보이는 메시지·채널·읽음 상태는 모두 DB 에서 온다.
- 내가 보낸 메시지는 화면에 먼저 "전송 중"으로 보여줄 수 있지만(낙관적 표시), DB 에 저장된 행이 오면 그 행으로 교체한다.

### 2-2. 델타 동기화
- `messages.id` 는 `bigint` 자동 증가 → 나중에 저장된 메시지가 항상 더 큰 id.
- 채널별로 "마지막으로 받은 id"(`lastId`)를 기억한다.
- 재접속(Realtime 재구독, 탭 복귀) 시:
  ```ts
  supabase.from("messages").select("*")
    .eq("channel_id", channelId).gt("id", lastId).order("id")
  ```
- 무한스크롤(과거 방향)은 반대로 `.lt("id", oldestId).order("id", { ascending: false }).limit(50)`.

### 2-3. 멱등 전송
- 보낼 때마다 `client_id = crypto.randomUUID()` 생성, 재시도 시 **같은 client_id** 재사용.
- `messages.client_id` 에 UNIQUE 제약 → 중복 저장 불가.
  ```ts
  supabase.from("messages")
    .upsert(row, { onConflict: "client_id", ignoreDuplicates: true })
  ```
- 화면에서는 `client_id` 로 "전송 중 메시지"와 "DB에서 온 메시지"를 맞춘다 (중복 표시 방지).

## 3. 데이터 모델

```
profiles        (id uuid PK = auth.users.id, name, avatar_url)
channels        (id uuid PK, name, type 'public'|'private'|'dm', created_by → profiles, created_at)
channel_members (channel_id → channels, user_id → profiles, role 'admin'|'member',
                 last_read_message_id bigint)            PK (channel_id, user_id)
messages        (id bigint identity PK, client_id uuid UNIQUE, channel_id → channels,
                 user_id → profiles, parent_id → messages, content, created_at)
attachments     (id uuid PK, message_id → messages, file_url, file_name)
```

| 개념 | 표현 방법 |
|---|---|
| DM | `type = 'dm'` 채널 + 멤버 2명 |
| 읽음 | `channel_members.last_read_message_id` |
| 미읽음 수 | 그 채널에서 `id > last_read_message_id` 인 메시지 수 |
| 스레드 | `messages.parent_id` = root 메시지 id. 채널 본문은 `parent_id is null` |
| 멘션 | 메시지 본문의 `@이름` 문자열 (별도 테이블 없음, 필요 시 팀장 협의) |
| 첨부 파일 | Storage `attachments` 버킷, 경로 `{channel_id}/{uuid}-{파일명}` |

### 인덱스
- `channels(name)` UNIQUE (DM 제외)
- `channel_members(user_id)`
- `messages(channel_id, id)` — 채널 목록·델타 동기화
- `messages(parent_id, id)` — 스레드
- `attachments(message_id)`

### 트리거
- `on_auth_user_created`: 회원가입 → `profiles` 생성 + `#general` 참여
- `channel_members_guard_role`: 관리자가 아니면 role 을 admin 으로 바꿀 수 없음

## 4. 권한 (RLS)

| 테이블 | 읽기 | 쓰기 |
|---|---|---|
| profiles | 로그인 사용자 전체 | 본인만 수정 |
| channels | 공개 채널 · 내가 멤버인 채널 · 내가 만든 채널 | 생성: 본인 이름으로 / 수정·삭제: 채널 관리자 |
| channel_members | 같은 채널 멤버 | 추가: 채널 생성자·관리자, 공개 채널은 본인 / 수정: 본인(읽음)·관리자 / 삭제: 본인(나가기)·관리자 |
| messages | 멤버인 채널 | 작성: 멤버인 채널에 본인 이름으로 / 수정·삭제: 본인 |
| attachments | 볼 수 있는 메시지의 첨부 | 본인 메시지에만 |
| storage `attachments` | 경로 첫 폴더 채널의 멤버 | 업로드: 그 채널 멤버 / 삭제: 올린 사람 |

## 5. 실시간 (Realtime)
- Publication 에 `messages` 만 추가. RLS 가 적용되므로 멤버인 채널 메시지만 수신.
- 구독 예:
  ```ts
  supabase.channel(`messages:${channelId}`)
    .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` },
        (payload) => { /* payload.new 추가 */ })
    .subscribe()
  ```
- 사이드바 미읽음/멘션은 "내가 속한 모든 채널"의 INSERT 를 구독해서 계산 (D).

## 6. 화면 구성

```
┌────────────┬──────────────────────────────┬──────────────┐
│ Sidebar    │ MessageArea                  │ ThreadPanel  │
│ (C, D)     │  헤더: 채널명 / 검색(E)        │ (B)          │
│ 채널 목록   │  메시지 목록(B) + 첨부(D)      │ root 메시지   │
│ DM 목록     │  입력창(B) + 첨부/멘션(D)      │ 답글 목록     │
└────────────┴──────────────────────────────┴──────────────┘
```
- 뼈대: `components/layout/` (AppShell, Sidebar, MessageArea, ThreadPanel)
- 페이지: `/` (채팅), `/login` (로그인)

## 7. 폴더 구조

| 경로 | 담당 | 내용 |
|---|---|---|
| `supabase/migrations/` | A | 스키마 SQL |
| `lib/supabase/` | A | `client.ts`(브라우저) · `server.ts`(서버) · `proxy.ts`(세션 갱신) |
| `types/database.ts` | A | DB 타입 |
| `proxy.ts` | A | 모든 요청에서 로그인 세션 갱신 |
| `components/layout/` | E (팀장 협의) | 화면 뼈대 |
| `components/chat/` | B | 메시지·스레드 |
| `app/(auth)/`, `components/channel/` | C | 로그인, 채널·DM |
| `components/attachments/`, `components/notifications/` | D | 첨부, 읽음·배지·멘션 |
| `app/api/ai/` | E | AI API (서버) |
| `components/search/` | E | 검색·AI 결과 화면 |

## 8. 환경변수

| 이름 | 쓰는 곳 | 설명 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 브라우저·서버 | Supabase 프로젝트 주소 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | 브라우저·서버 | 공개용 키 (RLS 가 권한을 지킴) |
| `ANTHROPIC_API_KEY` | 서버(`app/api/ai`)만 | AI 기능 |

## 9. 배포
- Vercel 에 GitHub 레포 연결 → main 에 머지되면 자동 배포.
- Vercel 프로젝트 환경변수에 위 3개 등록.
- Supabase Auth → URL Configuration 에 Vercel 주소 등록.
