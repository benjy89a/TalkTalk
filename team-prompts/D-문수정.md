# 문수정님 — D 실사용 기능

**담당:** 읽음 처리, 미읽음 표시(굵게), @멘션 배지, 파일·이미지 첨부
**수정할 수 있는 폴더:** `components/attachments/, components/notifications/`
**내 작업 목록·완료 조건:** `DevelopDoc/WORK_UNITS.md` 의 **D** 섹션

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
나는 개발 경험이 거의 없는 해커톤 팀원 문수정이야. 아래 순서대로 프로젝트 세팅을 도와줘.
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
나는 TalkTalk 해커톤 팀의 D 담당(실사용 기능) 문수정이야.
내가 수정할 수 있는 폴더는 components/attachments/, components/notifications/ 뿐이야.
CLAUDE.md 규칙을 꼭 지켜줘. 특히:
- 내 담당 폴더 밖 파일은 고치지 말고 "팀장과 협의가 필요한 변경"이라고 먼저 알려줘
- 패키지 설치 전에 반드시 물어봐
- 비개발자에게 설명하듯 쉽게 말해줘

시작 전에 git 상태를 확인해줘:
지금 main 이면 git pull 로 최신을 받고, 작업 중인 내 브랜치가 있으면 그 브랜치로 이동해줘.
main 에서 package-lock.json 이 바뀌었으면 npm ci 도 다시 해줘.
그다음 DevelopDoc/WORK_UNITS.md 의 D 섹션을 보고 오늘 할 작업을 추천해줘.
```

---

## 3. 작업 프롬프트 (하나 끝나면 4번 마무리 → 다음 작업)

### 3-1. D-1 읽음 처리
브랜치: `feature/sujeong-read`

```
main 을 최신으로 받은 뒤 feature/sujeong-read 브랜치를 만들고 작업해줘.

components/notifications/ 안에 읽음 처리 기능을 만들어줘.
- 함수 또는 훅: markAsRead(channelId, lastMessageId) → channel_members 의 내 행 last_read_message_id 를 갱신
- 메시지 목록은 B 담당이라, B 컴포넌트에서 불러 쓸 수 있는 형태로 만들어줘
- 메시지 id 는 숫자이고 클수록 최신이다
```

### 3-2. D-2 미읽음 표시
브랜치: `feature/sujeong-unread`

```
main 을 최신으로 받은 뒤 feature/sujeong-unread 브랜치를 만들고 작업해줘.

미읽음 채널을 사이드바에서 굵게 보이게 하는 기능을 만들어줘.
- 훅 useUnread(): 내가 속한 채널별로 id > last_read_message_id 인 메시지가 있는지 계산
- 내가 속한 채널들의 messages INSERT 를 Realtime 으로 구독해서 새 메시지가 오면 갱신
- 채널 목록 컴포넌트(C 담당)가 이 훅의 결과를 받아 굵게 표시할 수 있게 만들어줘
```

### 3-3. D-3 @멘션
브랜치: `feature/sujeong-mention`

```
main 을 최신으로 받은 뒤 feature/sujeong-mention 브랜치를 만들고 작업해줘.

@멘션 기능을 components/notifications/ 안에 만들어줘.
- 입력창에서 @ 를 치면 채널 멤버 이름 자동완성 (입력창은 B 담당이라 B 가 붙여 쓸 수 있는 컴포넌트/함수로)
- 나를 멘션한 미읽음 메시지 수를 채널별로 계산해서 숫자 배지 컴포넌트로 보여주기
- 멘션은 메시지 본문의 "@이름" 문자열로 판단 (별도 테이블 없음)
```

### 3-4. D-4 파일 첨부
브랜치: `feature/sujeong-attachments`

```
main 을 최신으로 받은 뒤 feature/sujeong-attachments 브랜치를 만들고 작업해줘.

파일 첨부 기능을 components/attachments/ 안에 만들어줘.
- 파일 선택 → Storage 'attachments' 버킷에 {channel_id}/{uuid}-{파일이름} 경로로 업로드 (이 경로 규칙을 지켜야 권한이 통과됨)
- 메시지 저장 후 attachments 테이블에 message_id, file_url(=Storage 경로), file_name 저장
- 보여줄 때 createSignedUrl 로 임시 주소 만들기. 이미지는 미리보기, 그 외는 파일명 + 다운로드 링크
```

---

## 4. 마무리 프롬프트 (작업 하나가 화면에서 잘 동작하면)

```
지금 작업을 마무리하고 싶어.
1. npm run lint 와 npm run build 를 돌려서 에러가 없는지 확인해줘
2. 내 담당 폴더(components/attachments/, components/notifications/) 밖에 바뀐 파일이 있는지 확인하고, 있으면 알려줘
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
