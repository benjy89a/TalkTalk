# 서보님 — C 계정·채널·권한

**담당:** 로그인·회원가입, 채널 목록·만들기·참여, DM, 관리자 권한. **로그인은 팀 전체가 기다리므로 Day 1 오전 최우선!** 머지되면 단톡방에 알려주세요.
**수정할 수 있는 폴더:** `app/(auth)/, components/channel/`
**내 작업 목록·완료 조건:** `DevelopDoc/WORK_UNITS.md` 의 **C** 섹션

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
나는 개발 경험이 거의 없는 해커톤 팀원 서보이야. 아래 순서대로 프로젝트 세팅을 도와줘.
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
나는 TalkTalk 해커톤 팀의 C 담당(계정·채널·권한) 서보이야.
내가 수정할 수 있는 폴더는 app/(auth)/, components/channel/ 뿐이야.
CLAUDE.md 규칙을 꼭 지켜줘. 특히:
- 내 담당 폴더 밖 파일은 고치지 말고 "팀장과 협의가 필요한 변경"이라고 먼저 알려줘
- 패키지 설치 전에 반드시 물어봐
- 비개발자에게 설명하듯 쉽게 말해줘

시작 전에 git 상태를 확인해줘:
지금 main 이면 git pull 로 최신을 받고, 작업 중인 내 브랜치가 있으면 그 브랜치로 이동해줘.
main 에서 package-lock.json 이 바뀌었으면 npm ci 도 다시 해줘.
그다음 DevelopDoc/WORK_UNITS.md 의 C 섹션을 보고 오늘 할 작업을 추천해줘.
```

---

## 3. 작업 프롬프트 (하나 끝나면 4번 마무리 → 다음 작업)

### 3-1. C-1 로그인 / 회원가입 (최우선)
브랜치: `feature/seobo-login`

```
main 을 최신으로 받은 뒤 feature/seobo-login 브랜치를 만들고 작업해줘.

app/(auth)/login/page.tsx 에 이메일 로그인/회원가입 화면을 만들어줘.
- 이메일, 비밀번호, (회원가입일 때) 이름 입력
- 회원가입: supabase.auth.signUp({ email, password, options: { data: { name } } })
  → 가입하면 DB 트리거가 profiles 를 만들고 #general 에 자동 참여시킨다 (이미 만들어져 있음)
- 이메일 인증은 꺼져 있어서 가입하면 바로 로그인된다
- 로그인 성공하면 / 로 이동
- 로그아웃 버튼은 components/channel/ 안에 컴포넌트로
- Supabase 는 @/lib/supabase/client 의 createClient 사용
- "로그인 안 하면 /login 으로 보내기"는 proxy.ts 수정이 필요하니 코드를 고치지 말고 팀장에게 전달할 내용으로 정리해줘
```

### 3-2. C-2 채널 목록
브랜치: `feature/seobo-channel-list`

```
main 을 최신으로 받은 뒤 feature/seobo-channel-list 브랜치를 만들고 작업해줘.

components/channel/ 안에 ChannelList 컴포넌트를 만들어줘.
- 내가 멤버인 public/private 채널 목록 (channel_members 와 channels 조인)
- props: selectedChannelId, onSelect(channelId) — 선택된 채널을 화면 전체에 연결하는 건 팀장이 통합 때 함
- 사이드바(남색 배경)에 어울리게 흰 글씨
```

### 3-3. C-3 채널 만들기·참여
브랜치: `feature/seobo-channel-create`

```
main 을 최신으로 받은 뒤 feature/seobo-channel-create 브랜치를 만들고 작업해줘.

채널 만들기와 공개 채널 참여 기능을 components/channel/ 안에 만들어줘.
- 만들기: 이름 + 공개/비공개 선택 → channels 에 created_by=내 id 로 insert → 나를 role 'admin' 으로 channel_members 에 insert
- 둘러보기: 공개 채널 목록 → 참여(나를 member 로 insert) / 나가기(내 행 delete)
- 권한은 DB(RLS)가 이미 지키고 있으니, 막히면 에러 메시지를 보여줘
```

### 3-4. C-4 DM
브랜치: `feature/seobo-dm`

```
main 을 최신으로 받은 뒤 feature/seobo-dm 브랜치를 만들고 작업해줘.

DM 기능을 components/channel/ 안에 만들어줘.
- 사용자 목록(profiles)에서 상대를 고르면, 나와 그 사람 둘만 있는 type 'dm' 채널이 있으면 열고 없으면 만든다
- 만들 때: channels(type 'dm', created_by 나) → channel_members 에 나(admin)와 상대(member) insert
- DmList 컴포넌트: 사이드바 DM 목록에는 채널 이름 대신 상대방 이름 표시
```

### 3-5. C-5 관리자 권한
브랜치: `feature/seobo-admin`

```
main 을 최신으로 받은 뒤 feature/seobo-admin 브랜치를 만들고 작업해줘.

비공개 채널 관리자 기능을 만들어줘.
- 관리자(role 'admin')만 멤버 초대·내보내기 버튼이 보이게
- 관리자가 아닌 계정으로 시도해도 DB 에서 막히는지 확인하는 방법을 알려줘
- RLS 규칙을 바꿔야 할 것 같으면 SQL 을 고치지 말고 팀장에게 전달할 내용으로 정리해줘
```

---

## 4. 마무리 프롬프트 (작업 하나가 화면에서 잘 동작하면)

```
지금 작업을 마무리하고 싶어.
1. npm run lint 와 npm run build 를 돌려서 에러가 없는지 확인해줘
2. 내 담당 폴더(app/(auth)/, components/channel/) 밖에 바뀐 파일이 있는지 확인하고, 있으면 알려줘
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
