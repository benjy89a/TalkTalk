# 재문님 — E UI·검색·AI

**담당:** 전체 디자인 다듬기, 메시지 검색, AI 요약·자연어 검색·할 일 추출
**수정할 수 있는 폴더:** `app/api/ai/, components/search/ (components/layout/ 은 팀장 협의 후)`
**내 작업 목록·완료 조건:** `DevelopDoc/WORK_UNITS.md` 의 **E** 섹션

> 아래 회색 상자 안의 글을 **통째로 복사해서 Claude 에게 붙여넣기** 하면 됩니다.
> 한 번에 하나씩! Claude 가 끝났다고 하면 화면에서 직접 확인하고 다음으로 넘어가세요.

---

## 0. 준비물 (사람이 직접, 처음 한 번)

1. **GitHub 초대 수락** — 메일의 *View invitation → Accept* (또는 https://github.com/benjy89a/TalkTalk/invitations)
2. **Node.js 24** 설치 — https://nodejs.org 에서 24.x 버전
3. **Git** 설치 — https://git-scm.com/downloads
4. **Claude Code** 설치 (데스크톱 앱 권장) 후, 레포를 받을 빈 폴더(예: `D:\hackathon`)를 열기
5. 팀장(윤석)에게 개인톡으로 `.env.local` 값 두 줄 받기

---

## 1. 세팅 프롬프트 (처음 한 번만)

```
나는 개발 경험이 거의 없는 해커톤 팀원 재문이야. 아래 순서대로 프로젝트 세팅을 도와줘.
명령어는 네가 실행하고, 각 단계가 무슨 뜻인지 한 줄씩 쉽게 설명해줘.

1. node -v 로 Node 버전 확인 (24.x 가 아니면 멈추고 설치 방법을 알려줘)
2. 이 폴더에 https://github.com/benjy89a/TalkTalk.git 을 git clone 하고 TalkTalk 폴더로 이동
3. npm install 이 아니라 npm ci 로 패키지 설치
4. .env.example 을 복사해서 .env.local 만들기
   → 값은 내가 직접 붙여넣을 테니 키 값을 나에게 묻거나 화면에 출력하지 마. 파일 위치만 알려줘
5. 내가 값을 넣었다고 하면 npm run dev 실행 후 http://localhost:3000 을 열어 확인
6. 마지막으로 CLAUDE.md 와 README.md 를 읽고, 팀 규칙을 3줄로 요약해줘
```

✅ 성공 기준: 브라우저에 남색 사이드바 + 점선 상자 화면이 보임 → 캡처해서 단톡방에 올리기

> 💡 Claude Code 에서 TalkTalk 폴더를 **프로젝트 폴더로 다시 열면** CLAUDE.md 를 자동으로 읽습니다. 세팅 후 한 번 다시 열어주세요.

---

## 2. 매일 시작 프롬프트 (Claude 를 새로 켤 때마다 맨 처음)

```
나는 TalkTalk 해커톤 팀의 E 담당(UI·검색·AI) 재문이야.
내가 수정할 수 있는 폴더는 app/api/ai/, components/search/ (components/layout/ 은 팀장 협의 후) 뿐이야.
CLAUDE.md 규칙을 꼭 지켜줘. 특히:
- 내 담당 폴더 밖 파일은 고치지 말고 "팀장과 협의가 필요한 변경"이라고 먼저 알려줘
- 패키지 설치 전에 반드시 물어봐
- 비개발자에게 설명하듯 쉽게 말해줘

시작 전에 git 상태를 확인해줘:
지금 main 이면 git pull 로 최신을 받고, 작업 중인 내 브랜치가 있으면 그 브랜치로 이동해줘.
main 에서 package-lock.json 이 바뀌었으면 npm ci 도 다시 해줘.
그다음 DevelopDoc/WORK_UNITS.md 의 E 섹션을 보고 오늘 할 작업을 추천해줘.
```

---

## 3. 작업 프롬프트 (하나 끝나면 4번 마무리 → 다음 작업)

### 3-1. E-1 디자인 가이드 (Day 1)
브랜치: `feature/jaemun-design`

```
main 을 최신으로 받은 뒤 feature/jaemun-design 브랜치를 만들고 작업해줘.

TalkTalk 의 디자인 규칙을 정리해줘.
- 지금 components/layout/ 의 3단 레이아웃을 보고, 색·글자 크기·여백·버튼 모양을 Tailwind 클래스 기준으로 정리
- 팀원들이 같은 모양으로 만들 수 있게 "버튼은 이 클래스, 사이드바 글씨는 이 클래스" 식으로
- 결과는 DevelopDoc/DESIGN_GUIDE.md 로 만들어줘 (새 문서라 팀장에게 PR 로 확인받을게)
- components/layout/ 수정이 필요한 부분은 코드를 고치지 말고 팀장에게 전달할 내용으로 정리해줘
```

### 3-2. E-2 키워드 검색
브랜치: `feature/jaemun-search`

```
main 을 최신으로 받은 뒤 feature/jaemun-search 브랜치를 만들고 작업해줘.

메시지 키워드 검색 기능을 components/search/ 안에 만들어줘.
- 내가 볼 수 있는 메시지 중 content 에 키워드가 포함된 것(ilike)을 최신순으로
- 결과를 누르면 그 채널로 이동할 수 있게 onSelect(channelId, messageId) props
- 헤더 검색창 자리(components/layout/MessageArea.tsx)에 끼우는 건 팀장 협의
```

### 3-3. E-3 AI 요약
브랜치: `feature/jaemun-ai-summary`

```
main 을 최신으로 받은 뒤 feature/jaemun-ai-summary 브랜치를 만들고 작업해줘.

app/api/ai/summarize/route.ts 에 채널 대화 요약 API 를 만들어줘.
- 요청: { channelId } → 서버에서 @/lib/supabase/server 로 최근 메시지 100개 조회 → Claude API 로 요약 → { summary } 응답
- API 키는 process.env.ANTHROPIC_API_KEY (서버에서만). 키 값은 내가 .env.local 에 직접 넣을게
- Claude API 를 쓰려면 @anthropic-ai/sdk 패키지가 필요할 텐데, 설치하지 말고 팀장에게 요청할 내용으로 정리해줘 (package.json 은 팀장 담당)
- 화면에 "요약" 버튼과 결과를 보여줄 컴포넌트는 components/search/ 안에
```

### 3-4. E-4 자연어 검색 · 할 일 추출
브랜치: `feature/jaemun-ai-extra`

```
main 을 최신으로 받은 뒤 feature/jaemun-ai-extra 브랜치를 만들고 작업해줘.

AI 자연어 검색과 할 일 추출 API 를 app/api/ai/ 안에 만들어줘.
- 자연어 검색: "지난주 배포 얘기" 같은 질문 → 관련 메시지 찾기
- 할 일 추출: 채널 대화에서 할 일 목록(내용, 담당자, 기한)을 JSON 으로
- E-3 과 같은 방식(서버에서만 키 사용)으로
```

---

## 4. 마무리 프롬프트 (작업 하나가 화면에서 잘 동작하면)

```
지금 작업을 마무리하고 싶어.
1. npm run lint 와 npm run build 를 돌려서 에러가 없는지 확인해줘
2. 내 담당 폴더(app/api/ai/, components/search/ (components/layout/ 은 팀장 협의 후)) 밖에 바뀐 파일이 있는지 확인하고, 있으면 알려줘
3. .env.local 이 커밋에 들어가지 않는지 확인
4. 바뀐 내용을 한국어 커밋 메시지로 커밋하고 지금 브랜치를 push 해줘
5. GitHub 에서 Pull Request 만드는 방법을 단계별로 알려줘 (PR 템플릿 체크리스트 채우는 법 포함)
```

PR 을 올렸으면 단톡방에 링크를 공유하세요. 팀장이 확인 후 main 에 합칩니다.
다음 작업은 **다시 2번(매일 시작 프롬프트)의 git 정리부터** 하고 시작하세요.

---

## 막혔을 때

```
지금 이런 문제가 생겼어: (에러 메시지나 상황을 붙여넣기)
원인이 뭔지 쉽게 설명하고, 내 담당 폴더 안에서 고칠 수 있는지, 팀장에게 물어봐야 하는 건지 알려줘.
```
