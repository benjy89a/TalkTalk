# C 서보님께 — 역할(권한) 변경에 따른 후속 요청 (PR #35 머지 후)

안녕하세요, 팀장입니다. PR #31 · #32 · #33 · #34 모두 머지했어요. 고생 많으셨습니다!

같은 시점에 **PR #35 (`supabase/migrations/002_roles.sql`)** 가 들어가면서 DB 권한 규칙이 바뀌었고,
이미 Supabase 에 적용까지 끝났습니다. 그래서 서보님 화면 몇 군데를 맞춰 주셔야 해요.
특히 **요청 1 은 지금 화면에서 에러가 나는 부분**이라 가장 먼저 부탁드립니다.

모든 작업은 `components/channel/` 안에서 끝납니다. 작업 전에 최신 main 을 먼저 받아 주세요.

```bash
git checkout main
git pull
git checkout -b feature/seobo-roles-ui
```

---

## 0. 무엇이 바뀌었나 (먼저 읽어 주세요)

### 역할이 3단계가 됐어요

| 역할 | 누가 | 어디에 저장 | 할 수 있는 일 |
|---|---|---|---|
| **서비스 관리자** | 팀장이 SQL 로 지정한 사람 (지금 1명) | `app_admins` 테이블 (새로 생김) | 공개 채널 만들기, 모든 **공개** 채널(#general 포함) 관리 |
| **채널 관리자** | 채널을 만든 사람 + 기존 관리자가 지정한 사람 | `channel_members.role = 'admin'` (기존 그대로) | 자기 채널 관리 |
| **멤버** | 나머지 모두 | `channel_members.role = 'member'` | 대화, 비공개 채널·DM 만들기 (만들면 그 채널의 관리자) |

> 서비스 관리자도 **비공개 채널·DM 은 볼 수도, 관리할 수도 없습니다.** (사생활 보호)

### DB 권한 규칙 변경표

| 작업 | 이전 | **지금** |
|---|---|---|
| 공개 채널 만들기 | 누구나 | **서비스 관리자만** ⚠️ |
| 비공개 채널·DM 만들기 | 누구나 | 누구나 (변화 없음) |
| 채널 이름 변경 | 채널 관리자 | 채널 관리자 **+ 서비스 관리자(공개 채널만)** |
| 채널 삭제 | 채널 관리자 | 위와 같음. 단 **#general 은 아무도 삭제 불가** |
| 멤버 초대 | 채널 만든 사람, 채널 관리자 | 위 + **서비스 관리자(공개 채널만)** |
| 멤버 내보내기 | 본인(나가기), 채널 관리자 | 위 + **서비스 관리자(공개 채널만)** |
| 관리자 지정·해제 (role 변경) | 채널 관리자 | 채널 관리자 **+ 서비스 관리자(공개 채널만)** |
| 다른 사람 메시지 삭제 | 불가 (본인 것만) | 관리할 수 있는 채널에서 가능, **DM 은 제외** (B 계섭님 담당) |

### 새로 쓸 수 있는 DB 함수 2개

화면에서 버튼을 보여줄지 정할 때 이 두 함수를 쓰면 DB 규칙과 정확히 같은 기준이 됩니다.

```ts
const supabase = createClient();

// 1) 내가 서비스 관리자인가? → true / false
const { data: isAppAdmin } = await supabase.rpc("is_app_admin");

// 2) 내가 이 채널을 관리할 수 있는가? → true / false
//    (이 채널의 관리자이거나, 서비스 관리자 + 공개 채널이면 true)
const { data: canManage } = await supabase.rpc("can_manage_channel", { cid: channelId });
```

- `rpc` = DB 에 만들어 둔 함수를 불러오는 것. 타입은 `types/database.ts` 에 이미 들어가 있어요.
- 버튼을 숨기는 건 **편의**이고, 진짜 막는 건 DB 입니다. 지금 코드 주석에 쓰신 원칙 그대로예요.

---

## 요청 1. 채널 만들기 폼 — "공개" 선택지는 서비스 관리자에게만 ⚠️ 필수

**파일:** `components/channel/CreateChannelForm.tsx`

**지금 문제:** 일반 멤버가 "# 공개"(기본 선택값)로 채널을 만들면 DB 가 거절해서
"이 작업을 할 권한이 없어요." 에러가 납니다. 즉 **일반 멤버는 지금 기본값 그대로 채널을 못 만들어요.**

**바꿀 것:**
1. 폼이 열릴 때 `rpc("is_app_admin")` 으로 서비스 관리자인지 확인
2. 서비스 관리자가 **아니면**
   - 공개 범위 선택(`<fieldset>`)을 숨기거나 "# 공개" 라디오를 `disabled` 로
   - `isPrivate` 기본값을 `true`(비공개)로
   - 안내 문구 한 줄: "공개 채널은 관리자만 만들 수 있어요. 비공개 채널로 만들어져요."
3. 서비스 관리자면 지금처럼 둘 다 고를 수 있게

**코드 예시 (참고용):**

```tsx
const [isAppAdmin, setIsAppAdmin] = useState<boolean | null>(null); // null = 확인 중
const [isPrivate, setIsPrivate] = useState(true); // 기본값을 비공개로

useEffect(() => {
  createClient()
    .rpc("is_app_admin")
    .then(({ data }) => {
      setIsAppAdmin(data === true);
      if (data === true) setIsPrivate(false); // 관리자는 기존처럼 공개가 기본
    });
}, []);
```

**확인 방법:**
- [ ] 일반 계정: 공개 선택지가 안 보이거나 비활성, 바로 "만들기" 누르면 🔒 비공개 채널이 생김
- [ ] 서비스 관리자 계정: 공개/비공개 둘 다 선택 가능, 공개 채널 생성 성공

---

## 요청 2. 멤버 관리 버튼 — 기준을 `can_manage_channel` 로 ⭐ 중요

**파일:** `components/channel/ChannelMembersButton.tsx`

**지금 코드:**
```ts
const canManage = channel?.type === "private" && myRole === "admin";
```

**문제:** 서비스 관리자가 #general 같은 **공개 채널**을 관리할 수 있게 됐는데, 지금 기준으로는 버튼이 안 보여요.

**바꿀 것:**
```ts
// DM 은 2명 고정이라 계속 숨김. 나머지는 DB 함수 결과를 따른다.
const [canManage, setCanManage] = useState(false);

// load() 안에서 함께 불러오기
const { data } = await supabase.rpc("can_manage_channel", { cid: channelId });
setCanManage(data === true && res.channel?.type !== "dm");
```

- 비공개 채널의 관리자 → 지금처럼 초대·내보내기 가능 (변화 없음)
- 공개 채널의 일반 채널 관리자 → 이제 초대·내보내기 버튼이 보임 (DB 도 허용)
- 서비스 관리자 → 모든 공개 채널에서 버튼이 보임

**주의 — 서비스 관리자도 그 공개 채널에 "참여"해 있어야 멤버 목록이 보입니다.**
멤버 목록 읽기 규칙은 바뀌지 않았어요 (본인이 멤버인 채널만). 관리하려면 먼저 둘러보기에서 참여하면 됩니다.
#general 은 모두 자동 참여라 문제없어요.

**확인 방법:**
- [ ] 서비스 관리자로 #general 멤버 목록 → 초대·내보내기 버튼 보임, 실제로 동작
- [ ] 일반 계정으로 #general → 버튼 안 보임
- [ ] 비공개 채널 만든 사람 → 지금처럼 동작
- [ ] DM → 버튼 안 보임

---

## 요청 3. 관리자 지정·해제 버튼 추가 (권장)

**파일:** `components/channel/members.ts`, `components/channel/ChannelMembersButton.tsx`

지금은 채널을 만든 사람만 관리자이고, **다른 사람을 관리자로 올리는 화면이 없어요.**
멤버 목록의 각 줄에 (관리할 수 있는 사람에게만) "관리자로 지정" / "관리자 해제" 버튼을 붙여 주세요.

**`members.ts` 에 추가할 함수 예시:**

```ts
// 역할 바꾸기: 관리자 지정('admin') / 해제('member')
// 주의 1: RLS 로 막히면 에러 없이 "0줄 수정"으로 끝난다 → removeMember 처럼 줄 수로 확인
// 주의 2: 권한 없이 역할을 바꾸려 하면 DB 트리거가 에러를 낸다 ("관리자만 역할을 바꿀 수 있습니다")
export async function setMemberRole(
  supabase: Supabase,
  channelId: string,
  userId: string,
  role: MemberRole,
) {
  const { data, error } = await supabase
    .from("channel_members")
    .update({ role })
    .eq("channel_id", channelId)
    .eq("user_id", userId)
    .select("user_id");
  if (error) throw error;
  if (!data || data.length === 0) throw new NotAllowedError();
}
```

**지켜 주세요:**
- **마지막 관리자는 해제 못 하게** 화면에서 막아 주세요 (관리자가 0명이 되면 비공개 채널은 아무도 관리 못 함).
  예: 관리자 수가 1명이면 "관리자 해제" 버튼 숨김.
- 본인을 해제하는 것도 마찬가지로 마지막 관리자면 막기.
- 트리거 에러 메시지는 `toKoreanChannelError` 에서 "이 작업을 할 권한이 없어요." 로 보이게 해 주면 충분해요.

**확인 방법:**
- [ ] 비공개 채널 관리자가 멤버 A 를 관리자로 지정 → A 계정에서 초대·내보내기 버튼이 보임
- [ ] 관리자 1명인 채널에서 그 사람의 "해제" 버튼이 안 보임

---

## 요청 4. 서비스 관리자 표시 (선택)

멤버 목록에서 서비스 관리자에게 작은 배지(예: `서비스 관리자`)를 붙여 주면 누가 운영자인지 알기 쉬워요.
`app_admins` 는 로그인한 사람 누구나 **읽을 수 있습니다.**

```ts
const { data } = await supabase.from("app_admins").select("user_id");
const appAdminIds = new Set((data ?? []).map((a) => a.user_id));
// 멤버 줄을 그릴 때: appAdminIds.has(m.userId) 면 배지 표시
```

- 채널 관리자 표시(`m.role === "admin"`)와 헷갈리지 않게 색이나 문구를 다르게 해 주세요.

---

## 요청 5. 채널 이름 변경·삭제 (선택, 시간 남으면)

DB 는 이미 허용돼 있으니 화면만 있으면 됩니다. 보여주는 기준은 요청 2 와 같은 `canManage`.

- 이름 변경: `supabase.from("channels").update({ name }).eq("id", channelId).select("id")`
  - 같은 이름이 있으면 `23505` 에러 → 이미 있는 `toKoreanChannelError` 가 처리해 줘요.
- 삭제: `supabase.from("channels").delete().eq("id", channelId).select("id")`
  - **#general 은 DB 가 삭제를 막아요** (에러 없이 0줄 삭제). 화면에서도 #general 에는 삭제 버튼을 숨겨 주세요.
  - 삭제하면 그 채널의 메시지·첨부 기록도 함께 지워지니 "정말 삭제할까요?" 확인창을 꼭 넣어 주세요.
- 이름 변경·삭제 후에는 `onChanged?.()` 로 사이드바 목록을 새로고침해 주세요.

---

## 바뀌지 않은 것 (그대로 두셔도 돼요)

- 공개 채널 둘러보기 → 참여 / 나가기 (`BrowseChannels.tsx`)
- DM 만들기 (`dm.ts`) — 만든 사람이 관리자, 상대는 멤버로 들어가는 방식 그대로 동작
- 비밀번호 찾기, 이메일 기억하기, 채널 만들 때 멤버 초대

## 테스트 계정

- **서비스 관리자 계정**은 팀장에게 개별로 물어봐 주세요 (비밀번호는 채팅방에 올리지 않기).
- 일반 계정은 본인 계정 + 테스트용 계정 하나 더 있으면 확인이 쉬워요.

## 끝나면

```bash
npm run lint
npm run build
git add components/channel
git commit -m "[C] 역할 변경 반영: 공개 채널 생성 제한, 멤버 관리 기준 can_manage_channel"
git push -u origin feature/seobo-roles-ui
```

GitHub 에서 PR 을 만들어 주세요. **요청 1·2 만 먼저 PR 로 올려도 괜찮아요** (3~5 는 다음 PR 로).
궁금한 점은 언제든 물어봐 주세요!
