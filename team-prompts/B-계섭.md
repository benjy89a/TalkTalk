# 계섭님 — B 메시지 코어

**담당:** 메시지 보내기·받기, 실시간(Realtime), 중복 전송 방지(client_id), 재접속 시 놓친 메시지 받기(델타 동기화), 스레드(답글), 무한스크롤
**수정할 수 있는 폴더:** `components/chat/`
**내 작업 목록·완료 조건:** `DevelopDoc/WORK_UNITS.md` 의 **B** 섹션

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
나는 개발 경험이 거의 없는 해커톤 팀원 계섭이야. 아래 순서대로 프로젝트 세팅을 도와줘.
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
나는 TalkTalk 해커톤 팀의 B 담당(메시지 코어) 계섭이야.
내가 수정할 수 있는 폴더는 components/chat/ 뿐이야.
CLAUDE.md 규칙을 꼭 지켜줘. 특히:
- 내 담당 폴더 밖 파일은 고치지 말고 "팀장과 협의가 필요한 변경"이라고 먼저 알려줘
- 패키지 설치 전에 반드시 물어봐
- 비개발자에게 설명하듯 쉽게 말해줘

시작 전에 git 상태를 확인해줘:
지금 main 이면 git pull 로 최신을 받고, 작업 중인 내 브랜치가 있으면 그 브랜치로 이동해줘.
main 에서 package-lock.json 이 바뀌었으면 npm ci 도 다시 해줘.
그다음 DevelopDoc/WORK_UNITS.md 의 B 섹션을 보고 오늘 할 작업을 추천해줘.
```

---

## 3. 작업 프롬프트 (하나 끝나면 4번 마무리 → 다음 작업)

### 3-1. B-1 메시지 목록
브랜치: `feature/gyeseop-message-list`

```
main 을 최신으로 받은 뒤 feature/gyeseop-message-list 브랜치를 만들고 작업해줘.

components/chat/ 안에 MessageList 컴포넌트를 만들어줘.
- props 로 channelId 를 받는다
- 그 채널의 메시지 중 parent_id 가 null 인 것 최근 50개를 불러와 오래된 순으로 보여준다
- 보낸 사람 이름(profiles.name)과 시간을 같이 보여준다
- Supabase 는 @/lib/supabase/client 의 createClient, 타입은 @/types/database 의 Message 를 쓴다
- 로그인 기능(C 담당)이 아직 main 에 없으면, 가짜 메시지 배열로 먼저 모양을 만들고 나중에 DB 로 바꿀 수 있게 해줘
- 화면 뼈대(components/layout)에 끼우는 건 팀장이 하니까, 내가 확인만 할 수 있는 방법을 알려줘
```

### 3-2. B-2 메시지 전송 + 중복 방지
브랜치: `feature/gyeseop-message-send`

```
main 을 최신으로 받은 뒤 feature/gyeseop-message-send 브랜치를 만들고 작업해줘.

components/chat/ 안에 MessageInput 컴포넌트를 만들어줘.
- props: channelId, parentId(선택, 스레드 답글용)
- Enter 로 전송, Shift+Enter 는 줄바꿈
- 보낼 때 client_id = crypto.randomUUID() 를 만들고, 실패해서 다시 보낼 때는 같은 client_id 를 재사용
- upsert(..., { onConflict: "client_id", ignoreDuplicates: true }) 로 저장해서 같은 메시지가 두 번 저장되지 않게
- 전송 중 / 실패(재전송 버튼) 상태를 보여줘
- CLAUDE.md 의 "설계 원칙 3가지"를 지켜줘
```

### 3-3. B-3 실시간 수신
브랜치: `feature/gyeseop-realtime`

```
main 을 최신으로 받은 뒤 feature/gyeseop-realtime 브랜치를 만들고 작업해줘.

MessageList 에 Supabase Realtime 구독을 붙여줘.
- messages 테이블 INSERT 를 channel_id 필터로 구독
- channelId 가 바뀌면 이전 구독 해제
- 내가 보낸 메시지가 두 번 보이지 않게 client_id 로 중복 제거
- 브라우저 창 두 개(다른 계정)로 확인하는 방법도 알려줘
```

### 3-4. B-4 델타 동기화
브랜치: `feature/gyeseop-delta-sync`

```
main 을 최신으로 받은 뒤 feature/gyeseop-delta-sync 브랜치를 만들고 작업해줘.

재접속했을 때 놓친 메시지만 받아오게 해줘.
- 채널별로 마지막으로 받은 메시지 id 를 기억
- Realtime 이 다시 연결되거나 탭이 다시 보일 때 id > 마지막id 인 메시지만 불러와 이어 붙이기
- 와이파이를 껐다 켜서 확인하는 방법을 알려줘
```

### 3-5. B-5 스레드
브랜치: `feature/gyeseop-thread`

```
main 을 최신으로 받은 뒤 feature/gyeseop-thread 브랜치를 만들고 작업해줘.

스레드(답글) 기능을 만들어줘.
- 메시지마다 "답글 n개" 버튼
- components/chat/ 안에 ThreadView 컴포넌트: props 로 rootId 를 받아 원본 메시지 + 답글 목록(parent_id = rootId) + MessageInput(parentId=rootId)
- 답글도 실시간 반영
- 오른쪽 스레드 패널에 끼우는 건 팀장 협의
```

### 3-6. B-6 무한스크롤
브랜치: `feature/gyeseop-infinite-scroll`

```
main 을 최신으로 받은 뒤 feature/gyeseop-infinite-scroll 브랜치를 만들고 작업해줘.

MessageList 에 무한스크롤을 붙여줘.
- 맨 위로 스크롤하면 id < 가장오래된id 인 메시지 50개를 더 불러오기
- 불러온 뒤 스크롤 위치가 튀지 않게
```

---

## 4. 마무리 프롬프트 (작업 하나가 화면에서 잘 동작하면)

```
지금 작업을 마무리하고 싶어.
1. npm run lint 와 npm run build 를 돌려서 에러가 없는지 확인해줘
2. 내 담당 폴더(components/chat/) 밖에 바뀐 파일이 있는지 확인하고, 있으면 알려줘
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
