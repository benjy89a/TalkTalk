# CLAUDE.md — TalkTalk 팀 규칙 (Claude가 매번 읽는 파일)

> 이 파일은 팀장 협의 없이 수정 금지입니다.
> Next.js 16 관련 주의사항은 아래 AGENTS.md 를 함께 따릅니다.

@AGENTS.md

---

## 0. Claude에게 주는 규칙 (가장 중요)

1. **담당 폴더 밖은 수정하지 않는다.**
   사용자의 담당 폴더(아래 3번 표) 밖의 파일을 고쳐야 할 것 같으면, 고치지 말고 먼저 이렇게 알린다.
   > ⚠️ **팀장과 협의가 필요한 변경입니다.** `파일 경로`를 이렇게 바꿔야 합니다: (무엇을, 왜)
   > 팀장에게 전달할 메시지 예시: "…"

   사용자가 자기 담당이 누구인지 말하지 않았으면 먼저 물어본다 (A/B/C/D/E 중 누구인지).
2. **새 패키지를 설치하기 전에 반드시 확인을 받는다.** `npm install 무엇` 을 바로 실행하지 말고
   "이 패키지가 왜 필요한지"를 설명하고, package.json 변경은 팀장 협의 사항임을 알린다.
3. **"변경 금지" 목록(4번)의 파일은 사용자가 시켜도 바로 고치지 않는다.** 협의 필요하다고 먼저 알린다.
4. **작게 나눠서 작업한다.** 한 번에 하나의 기능만. 끝나면 `npm run dev` 로 화면에서 확인하도록
   안내하고, 동작하면 커밋을 권한다 (커밋 명령어도 알려준다).
5. **비개발자에게 설명하듯 답한다.** 전문 용어는 한 줄 풀이를 붙이고, 무엇을 바꿨는지 파일별로 짧게 요약한다.
   명령어는 그대로 복사해 붙여넣을 수 있게 코드 블록으로 준다.
6. **비밀값을 코드에 쓰지 않는다.** Supabase 키, API 키는 `.env.local` 에만. 코드는 `process.env.이름` 으로 읽는다.
7. **main 브랜치에서 작업 중이면 먼저 브랜치를 만들자고 안내한다.** (5번 브랜치 규칙)

---

## 1. 프로젝트 배경

- 5명이 4일 동안 바이브 코딩 해커톤으로 만드는 **사내 채팅 서비스 TalkTalk**.
- 팀원 대부분은 개발·Git 경험이 거의 없다 → 구조는 단순하고 일관되게.
- 마감: **11/26(목) 10:00** — 제출물은 `DevelopDoc/FINAL_CHECKLIST.md` 참고.

### Mattermost 참고 방침
- UX 흐름과 데이터 구조만 참고한다. **Mattermost 코드를 복사하지 않는다.**
- 화면: 왼쪽 사이드바(채널 목록 / DM 목록 / 미읽음 굵게 + 멘션 배지) + 가운데 메시지 영역 + 오른쪽 스레드 패널
- 채널 타입: 공개(public) / 비공개(private) / DM(dm)
- 스레드: 답글은 `parent_id` 로 원본(root) 메시지에 연결, 오른쪽 패널에서 본다
- 팀(워크스페이스)은 1개만 있다고 가정한다

## 2. 기술 스택 (변경 금지)

| 영역 | 사용 기술 |
|---|---|
| 프론트/서버 | Next.js 16 (App Router, TypeScript) + Tailwind CSS 4 |
| DB·로그인·실시간·파일 | Supabase (Auth 이메일 로그인, Postgres, Realtime, Storage) |
| 배포 | Vercel |
| Node | 24 LTS (`.nvmrc`) |

### 설계 원칙 3가지
1. **서버 DB가 단일 진실 공급원.** 화면 상태는 DB에서 읽고, Realtime으로 DB 변경을 구독한다.
   화면에서만 데이터를 지어내지 않는다.
2. **델타 동기화.** 재접속하면 "마지막으로 받은 메시지 id 이후"만 받아온다.
   `messages.id` 는 순서대로 커지는 숫자다 → `.gt("id", lastId).order("id")`
3. **멱등 전송.** 메시지를 보낼 때 클라이언트가 `crypto.randomUUID()` 로 `client_id` 를 만든다.
   재전송해도 `client_id` 가 같으면 DB에 한 번만 저장된다 (UNIQUE 제약).

## 3. 역할별 담당 폴더 (각자 담당 폴더만 수정)

| 담당 | 역할 | 수정 가능한 폴더 |
|---|---|---|
| **A 팀장** | 인프라·스키마·통합·배포 | `supabase/`, `lib/supabase/`, `types/`, 설정 파일 전부 |
| **B** | 메시지 코어: 송수신, Realtime, 멱등, 델타 동기화, 스레드, 무한스크롤 | `components/chat/` |
| **C** | 계정·채널·권한: 로그인, 채널·DM, 관리자 권한, RLS(설계) | `app/(auth)/`, `components/channel/` |
| **D** | 실사용 기능: 첨부, 읽음, 미읽음 배지, 멘션 알림 | `components/attachments/`, `components/notifications/` |
| **E** | UI·검색·AI: 레이아웃, 검색, AI 요약·자연어 검색·할 일 추출 | `app/api/ai/` (+ `components/layout/` 은 팀장 협의 후) |

- 담당 폴더 안에서는 자유롭게 파일을 만들고 나눠도 된다.
- 다른 사람 컴포넌트는 **가져다 쓰기(import)만** 하고 내용은 고치지 않는다. 고칠 게 있으면 그 담당자에게 요청.
- 화면에 내 컴포넌트를 끼우려면 `components/layout/` 의 해당 칸(Placeholder)을 바꿔야 한다 → 팀장 협의.

## 4. 팀장 협의 없이 변경 금지

- DB 스키마·마이그레이션 (`supabase/`)
- RLS·Auth 설정 (Supabase 대시보드 포함)
- Storage 설정 (버킷, 정책)
- `CLAUDE.md`, `AGENTS.md`
- `package.json`, `package-lock.json` (패키지 추가·삭제)
- `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `app/globals.css` (Tailwind 설정)
- `.env.example`, 환경변수, `.nvmrc`, `.npmrc`
- `lib/supabase/`, `proxy.ts`
- `types/`
- `components/layout/`, `app/layout.tsx`, `app/page.tsx`
- 폴더 구조·라우팅 구조 (새 폴더/새 페이지 주소 추가)
- `main` 브랜치

## 5. 브랜치·커밋 규칙

- 브랜치 이름: `feature/이름-기능` (예: `feature/minsu-thread-panel`)
- **main 에 직접 push 금지.** GitHub에서 Pull Request(PR)를 만들고 팀장이 머지한다.
- 작업 시작 전 항상 최신 main 을 받는다.

```bash
git checkout main
git pull
git checkout -b feature/이름-기능
```

작은 단위로 커밋:

```bash
git add .
git commit -m "스레드 패널에 답글 목록 표시"
git push -u origin feature/이름-기능
```

push 후 GitHub 레포 페이지의 **Compare & pull request** 버튼으로 PR을 만든다.

## 6. DB 스키마 요약 (원본: `supabase/migrations/001_init.sql`, 타입: `types/database.ts`)

```
profiles        (id, name, avatar_url)                      -- 회원가입 시 자동 생성
channels        (id, name, type['public'|'private'|'dm'], created_by, created_at)
channel_members (channel_id, user_id, role['admin'|'member'], last_read_message_id)
messages        (id bigint 자동증가, client_id UNIQUE, channel_id, user_id, parent_id, content, created_at)
attachments     (id, message_id, file_url, file_name)
```

- DM = type `'dm'` 인 채널 (멤버 2명). 이름은 자유(예: 두 사람 id 조합), 화면에는 상대 이름을 보여준다.
- 읽음 = `channel_members.last_read_message_id`. 미읽음 = 그보다 큰 id 의 메시지 수.
- 스레드 = `messages.parent_id` (root 메시지의 id). 채널 본문 목록은 `parent_id is null` 만.
- 첨부 = Storage `attachments` 버킷(비공개). 경로 `{channel_id}/{uuid}-{파일이름}` 규칙 필수.
  `file_url` 에는 그 경로를 저장하고, 보여줄 때 `createSignedUrl` 로 임시 주소를 만든다.
- 회원가입하면 `#general` 에 자동 참여.
- Realtime 은 `messages` 테이블만 켜져 있다. 다른 테이블이 필요하면 팀장 협의.

### RLS(권한) 요약
- 로그인한 사용자는 **자기가 멤버인 채널**의 메시지만 읽고 쓴다.
- 공개 채널은 멤버가 아니어도 목록에서 보이고, 스스로 참여할 수 있다.
- 채널을 만든 사람은 자신을 `admin` 으로, 다른 사람을 멤버로 넣을 수 있다.
- 메시지 수정·삭제는 본인 것만. 역할(role) 변경은 관리자만.

## 7. 코드 작성 규칙

- Supabase 사용:
  - 클라이언트 컴포넌트(`"use client"`): `import { createClient } from "@/lib/supabase/client"`
  - 서버(서버 컴포넌트, `app/api/**/route.ts`): `import { createClient } from "@/lib/supabase/server"` → `await createClient()`
- DB 타입: `import type { Message, Channel } from "@/types/database"`
- 실시간·입력 등 상호작용 컴포넌트는 파일 맨 위에 `"use client"` 를 붙인다.
- 서버 컴포넌트에서 로그인 정보(cookies)를 읽는 부분은 `<Suspense>` 로 감싼다 (Next 16 Cache Components 규칙).
- 스타일은 Tailwind 클래스만 사용한다. 별도 CSS 파일을 만들지 않는다.
- 비밀 키(`ANTHROPIC_API_KEY` 등)는 `app/api/` 서버 코드에서만 읽는다. `NEXT_PUBLIC_` 이 붙은 값만 브라우저에 노출된다.
- 커밋 전 확인: `npm run lint` 와 `npm run build` 가 에러 없이 끝나는지.
