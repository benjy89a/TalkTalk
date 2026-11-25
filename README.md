# TalkTalk 💬

**사내 업무용 채팅 서비스.** 채널과 DM으로 실시간 대화하고, 스레드로 주제를 나누고, AI로 쌓인 대화를 빠르게 따라잡습니다.
5명이 4일(11/23~11/26) 동안 바이브 코딩 해커톤으로 만들었습니다. 화면 구성은 Mattermost 를 참고했고, 코드는 직접 작성했습니다.

| 항목 | 링크 |
|---|---|
| 🌐 시연 URL | **https://talk-talk-gold.vercel.app** |
| 📦 GitHub | https://github.com/benjy89a/TalkTalk |
| 📄 개발 문서 | [`DevelopDoc/`](DevelopDoc/) — [PRD](DevelopDoc/PRD.md) · [기술 명세](DevelopDoc/TECH_SPEC.md) · [작업 단위](DevelopDoc/WORK_UNITS.md) · [최종 체크리스트](DevelopDoc/FINAL_CHECKLIST.md) |
| 📏 팀 규칙 | [`CLAUDE.md`](CLAUDE.md) |

**기술 스택:** Next.js 16 (App Router, TypeScript) · Tailwind CSS 4 · Supabase (Auth, Postgres, Realtime, Storage) · Vercel · AI: EXAONE / Google Gemini (관리자 화면에서 전환)

---

## 주요 기능

```
┌──────────────┬──────────────────────────────────┬────────────────┐
│ 사이드바       │ 메시지 영역                        │ 스레드 패널      │
│ # 채널 목록    │ 헤더: 채널명 · 👥 멤버 · 🔍 검색     │ 원본 메시지      │
│   (굵게·배지)  │ 말풍선 목록 (실시간·반응·안읽음 수)   │ 댓글 목록        │
│ DM 목록 (●접속)│ ✨ AI 도구 · 입력창 (첨부·@멘션)     │ 댓글 입력창      │
└──────────────┴──────────────────────────────────┴────────────────┘
```

### 💬 대화
- **실시간 메시지** — 보내면 1초 안에 상대 화면에 표시 (배포본 실측 0.5~1초)
- **중복 없는 전송(멱등)** — 네트워크가 끊겨 다시 보내도 메시지는 한 번만 저장
- **놓친 메시지 채우기(델타 동기화)** — 재접속하면 끊긴 사이 온 메시지만 받아서 이어 붙임
- **스레드** — 메시지마다 "스레드" 버튼 → 오른쪽 패널에서 댓글 (패널 폭 조절 가능)
- 무한 스크롤(위로 올리면 이전 메시지), 메시지 **수정·삭제**("(수정됨)", "삭제된 메시지입니다")
- **이모지 반응**, 카톡식 **답장 인용**, **복사**, `:웃` 이모지 단축 입력, 텍스트 강조(**굵게**, ~~취소선~~, `{빨강:색 글자}`)
- 말풍선 옆 **안 읽은 사람 수**, "○○님이 입력 중…" 표시, 쓰던 글 임시 저장, ↑ 키로 마지막 메시지 수정, 맨 아래로 ↓ 버튼

### 📂 채널 · DM · 계정
- 공개 / 비공개 채널, 1:1 DM, 공개 채널 둘러보기·참여·나가기
- 채널 관리자: 멤버 초대·내보내기, 관리자 지정, 채널 이름 변경·삭제
- 사이드바 멤버 수, **접속 중 초록 점**
- 이메일 회원가입·로그인, 비밀번호 찾기, 이메일 기억하기, 내 정보(이름·이메일·비밀번호) 변경, 60일 비밀번호 변경 안내

### 🔔 알림 · 첨부
- 안 읽은 채널 **굵게**, 나를 부른 **@멘션 배지(숫자)**, `@all` 전체 멘션, `@` 자동완성
- 멘션 **알림 카드** · 윈도우 알림 · 탭 제목 숫자 `(2) TalkTalk`, 비공개 채널 초대·새 DM 알림
- 파일·이미지 첨부 (이미지 미리보기, 한글 파일명 다운로드)

### 🔍 검색 · ✨ AI
- 키워드 검색 → 결과를 누르면 **그 메시지로 이동 + 강조** (스레드 댓글이면 스레드까지 열림)
- **AI 대화 요약** (최근 10/25/50개, 말한 사람 이름 포함)
- **AI 검색** — "지난주 배포 얘기 찾아줘" 같은 문장으로 검색
- **할 일 추출** — 대화에서 할 일·담당자·기한을 뽑고 근거 메시지로 이동

### 🛠 관리자 페이지 (`/admin`, 서비스 관리자만)
- 사용자 관리(관리자 지정·해제), 공개 채널 관리(이름 변경·삭제), AI 설정(업체 선택·키 상태·연결 테스트)

### 🔒 보안
- 내가 멤버가 아닌 비공개 채널·DM 의 메시지는 **DB 권한(RLS, 행 단위 접근 제어)** 으로 차단
- AI·DB 비밀 키는 서버에서만 사용 (브라우저로 보내지 않음)

---

## 팀 (역할 분담)

| 담당 | 이름 | 역할 | 대표 작업 | 머지된 PR |
|---|---|---|---|---|
| A | 윤석 | 팀장 · 인프라 · DB 스키마 · 통합 · 배포 | Supabase 스키마·권한(마이그레이션 001~008), 화면 연결, 관리자 페이지 틀, Vercel 배포 | 23 |
| B | 계섭 | 메시지 코어 | 실시간·멱등·델타 동기화, 스레드, 무한 스크롤, 수정·삭제·반응, 입력 중·안읽음 수 | 26 |
| C | 서보 | 계정 · 채널 · 권한 | 로그인·가입·비밀번호, 채널·DM, 멤버·관리자 관리, 접속 표시 | 19 |
| D | 수정 | 실사용 기능 | 첨부, 읽음·미읽음, 멘션 배지·알림 카드, 관리자 사용자·채널 관리 | 12 |
| E | 재문 | UI · 검색 · AI | 디자인, 키워드 검색, AI 요약·검색·할 일 추출, EXAONE/Gemini 전환 | 22 |

머지된 PR **102개**. 모두 브랜치 → Pull Request → 팀장 머지 방식으로 진행했습니다. 개발 일정은 [`WORK_UNITS.md`](DevelopDoc/WORK_UNITS.md) 를 보세요.

---

## 실행 방법 (처음 한 번만)

### 0. 준비물
- **Git**: https://git-scm.com/downloads
- **Node.js 24 LTS**: https://nodejs.org — 설치 후 `node -v` 가 `v24.` 로 시작하면 OK

### 1. 코드 내려받기 · 패키지 설치

```bash
git clone https://github.com/benjy89a/TalkTalk.git
```

```bash
cd TalkTalk
```

```bash
npm ci
```

> `npm ci` 는 `package-lock.json` 에 적힌 버전 그대로 설치합니다 (팀원 모두 같은 버전).

### 2. 환경변수 파일 만들기

```bash
cp .env.example .env.local
```

`.env.local` 을 열어 값을 채웁니다. 이 파일은 GitHub 에 올라가지 않습니다.

| 이름 | 필수 | 설명 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase 프로젝트 주소 |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | ✅ | Supabase 공개용 키 (권한은 RLS 가 지킴) |
| `EXAONE_API_KEY` | AI 쓸 때 | EXAONE AI 키 (서버 전용) |
| `GEMINI_API_KEY` | AI 쓸 때 | Gemini AI 키 (서버 전용) |
| `AI_PROVIDER` | 선택 | `exaone`(기본) 또는 `gemini` |
| `GEMINI_MODEL` | 선택 | Gemini 모델 이름 (기본 `gemini-3.5-flash-lite`) |

> 새 Supabase 프로젝트에서 실행한다면 `supabase/migrations/` 의 SQL 을 번호 순서(001 → 008)대로 SQL Editor 에서 실행하세요.

### 3. 실행

```bash
npm run dev
```

브라우저에서 http://localhost:3000 → 로그인 화면에서 회원가입하면 `#general` 에 자동으로 들어갑니다.

### 검사 명령

```bash
npm run lint
```

```bash
npm run build
```

```bash
node --test
```

> `node --test` 는 프로젝트 안의 `*.test.mjs` 자동 테스트 310개를 실행합니다 (실제 DB·AI 는 호출하지 않음).

---

## 매일 작업하는 순서 (팀원용)

```bash
git checkout main
git pull
git checkout -b feature/내이름-기능이름
```

작업 → `npm run dev` 로 확인 → 커밋 → push → GitHub 에서 PR 만들기. 자세한 규칙은 [`CLAUDE.md`](CLAUDE.md) 5번을 보세요.
팀원별 Claude 프롬프트는 [`team-prompts/`](team-prompts/) 에 있습니다.

## 폴더 구조와 담당

```
app/
  (auth)/login/        C  로그인 · 회원가입 · 비밀번호 찾기/재설정
  admin/               A  관리자 페이지 틀 (탭 내용은 D·E 컴포넌트)
  api/ai/              E  AI API (요약 · 검색 · 할 일 · 상태)
  page.tsx             A  첫 화면 (레이아웃 셸)
components/
  layout/              A  화면 뼈대 · 팀원 컴포넌트 연결(slots.tsx)
  chat/                B  메시지 · 스레드 · 반응 · 입력 중
  channel/             C  채널 · DM · 멤버 · 계정 · 접속 표시
  attachments/         D  첨부파일
  notifications/       D  읽음 · 미읽음 · 멘션 · 알림 카드
  admin/               D  관리자 사용자 · 채널 관리
  search/              E  검색 · AI 도구 화면
lib/supabase/          A  Supabase 연결
types/                 A  DB 타입
supabase/migrations/   A  DB 스키마 SQL (001~008)
DevelopDoc/            모두  제출용 개발 문서 · 팀원 요청서
team-prompts/          모두  팀원별 Claude 프롬프트
```
