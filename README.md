# TalkTalk 💬

**사내 팀 채팅 서비스.** Mattermost 같은 업무용 메신저를 4일 만에 5명이 바이브 코딩으로 만드는 해커톤 프로젝트입니다.

- 왼쪽 사이드바에서 채널·DM을 고르고, 가운데에서 대화하고, 오른쪽 패널에서 스레드(답글)를 봅니다.
- 공개/비공개 채널, 1:1 DM, 실시간 메시지, 파일 첨부, 미읽음 배지, @멘션 알림
- AI 기능: 채널 대화 요약, 자연어 검색, 할 일 추출

| 항목 | 링크 |
|---|---|
| 시연 URL | _(배포 후 추가)_ |
| 개발 문서 | [`DevelopDoc/`](DevelopDoc/) — PRD · 기술 명세 · 작업 단위 · 최종 체크리스트 |
| 팀 규칙 | [`CLAUDE.md`](CLAUDE.md) |

**기술 스택:** Next.js 16 (App Router, TypeScript) · Tailwind CSS · Supabase (Auth, Postgres, Realtime, Storage) · Vercel

---

## 팀

| 담당 | 이름 | 역할 |
|---|---|---|
| A | 윤석 | 팀장 · 인프라 · 통합 · 배포 |
| B | 계섭 | 메시지 코어 (송수신, 실시간, 스레드) |
| C | 서보 | 계정 · 채널 · 권한 |
| D | 문수정 | 첨부 · 읽음 · 미읽음 · 멘션 |
| E | 재문 | UI · 검색 · AI |

> 👉 팀원은 [`team-prompts/`](team-prompts/) 에서 자기 이름 파일을 열고 순서대로 Claude 에게 붙여넣으세요.

---

## 팀원 최초 세팅 (처음 한 번만)

### 0. 준비물 설치
- **Git**: https://git-scm.com/downloads
- **Node.js 24 LTS**: https://nodejs.org (24.x 버전을 받으세요)
  - 설치 후 터미널에서 확인: `node -v` → `v24.`로 시작하면 OK
  - nvm 을 쓰는 사람은 프로젝트 폴더에서 `nvm use` (`.nvmrc` 에 24가 적혀 있음)

### 1. 코드 내려받기

```bash
git clone https://github.com/benjy89a/TalkTalk.git
```

```bash
cd TalkTalk
```

### 2. 패키지 설치 — `npm install` 이 아니라 `npm ci`

```bash
npm ci
```

> `npm ci` 는 `package-lock.json` 에 적힌 버전 그대로 설치합니다. 팀원 모두가 똑같은 버전을 쓰게 됩니다.
> Node 버전이 24가 아니면 여기서 에러가 납니다 → 0번으로 돌아가 Node 24를 설치하세요.

### 3. 환경변수 파일 만들기

`.env.example` 을 복사해서 `.env.local` 을 만듭니다.

```bash
cp .env.example .env.local
```

`.env.local` 을 열어 **팀장에게 받은 값**을 `=` 뒤에 붙여넣습니다.
이 파일은 GitHub에 올라가지 않습니다. 절대 다른 곳(코드, 채팅방 공개 채널 등)에 붙여넣지 마세요.

### 4. 실행

```bash
npm run dev
```

브라우저에서 http://localhost:3000 을 엽니다. 사이드바/메시지 영역/스레드 패널이 보이면 성공입니다.

---

## 매일 작업하는 순서

```bash
git checkout main
```

```bash
git pull
```

```bash
git checkout -b feature/내이름-기능이름
```

작업 → `npm run dev` 로 확인 → 커밋 → push → GitHub에서 PR 만들기. 자세한 규칙은 [`CLAUDE.md`](CLAUDE.md) 5번을 보세요.

> 다른 사람이 패키지를 추가한 main 을 받았다면 `npm ci` 를 한 번 더 실행하세요.

## 폴더 구조와 담당

```
app/
  (auth)/login/        C  로그인 페이지
  api/ai/              E  AI API (서버)
  page.tsx             A  첫 화면 (레이아웃 셸)
components/
  layout/              E  화면 뼈대 (팀장 협의)
  chat/                B  메시지·스레드
  channel/             C  채널·DM
  attachments/         D  첨부파일
  notifications/       D  읽음·배지·멘션
  search/              E  검색·AI 결과 화면
lib/supabase/          A  Supabase 연결
types/                 A  DB 타입
supabase/migrations/   A  DB 스키마 SQL
DevelopDoc/            모두  제출용 개발 문서
team-prompts/          모두  팀원별 Claude 프롬프트
```
