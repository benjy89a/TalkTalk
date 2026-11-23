# D 수정님께 — 관리자 페이지: 사용자 관리 · 채널 관리 요청

안녕하세요, 팀장입니다. 첨부·읽음·멘션 마무리 고생 많으셨어요!
새로 **관리자 페이지(`/admin`)** 를 만들었는데, 그 안의 **사용자 관리 · 채널 관리** 두 탭을 부탁드립니다.

- 페이지 틀, 권한 확인(관리자가 아니면 `/` 로 돌려보내기), DB 함수는 팀장이 이미 만들었어요.
- 수정님은 **새 폴더 `components/admin/`** 안에서만 작업하면 됩니다 (이 폴더는 수정님 담당으로 정했어요).
- 다 만들면 팀장이 `app/admin/slots.tsx` 에 끼워 넣을게요. (수정님이 슬롯 파일을 고치지 않아도 돼요)

작업 전에 최신 main 을 받아 주세요. (팀장 PR 이 머지된 뒤에 시작해 주세요 — 디스코드로 알려드릴게요)

```bash
git checkout main
git pull
git checkout -b feature/sujeong-admin-page
```

---

## 0. 먼저 알아 둘 것

### 서비스 관리자 계정
- `admin@talktalk.com` 이 서비스 관리자예요. 비밀번호는 팀장에게 개별로 물어봐 주세요 (채팅방에 올리지 않기).
- 이 계정으로 로그인하면 사이드바 맨 위 **"⚙ 관리자"** 링크가 보이고, 누르면 `/admin` 으로 가요.
- 일반 계정으로 `/admin` 주소를 직접 쳐도 첫 화면으로 돌아가요.

### 새로 쓸 수 있는 DB 함수 3개 (`supabase/migrations/003_admin.sql`)

서비스 관리자가 아니면 에러가 나요. 타입은 `types/database.ts` 에 이미 들어가 있어요.

```ts
const supabase = createClient(); // "@/lib/supabase/client"

// 1) 사용자 목록 → [{ id, name, email, created_at, is_app_admin }]
const { data: users, error } = await supabase.rpc("admin_list_users");

// 2) 서비스 관리자 지정(true) / 해제(false)
//    자기 자신은 해제할 수 없어요 (DB 가 에러를 돌려줌)
await supabase.rpc("admin_set_app_admin", { uid: userId, make_admin: true });

// 3) 공개 채널 목록 → [{ id, name, created_by, created_at, member_count }]
const { data: channels } = await supabase.rpc("admin_list_channels");
```

- `rpc` = DB 에 만들어 둔 함수를 불러오는 것.
- **비공개 채널·DM 은 나오지 않아요.** 관리자도 사생활 보호 때문에 못 보게 정했어요 (002 규칙).

---

## 요청 1. 사용자 관리 — `components/admin/AdminUsers.tsx` ⭐ 필수

1. 맨 위 `"use client"`
2. 화면이 열리면 `rpc("admin_list_users")` 로 목록을 불러와 **표**로 보여주기
   - 칸: 이름 / 이메일 / 가입일 / 권한(관리자 배지)
   - 가입일은 `new Date(created_at).toLocaleDateString("ko-KR")` 정도면 충분해요
3. 각 줄 오른쪽에 버튼
   - 관리자가 아니면 **"관리자로 지정"**, 관리자면 **"관리자 해제"**
   - 누르면 `rpc("admin_set_app_admin", ...)` → 성공하면 목록 다시 불러오기
   - **내 줄에는 "해제" 버튼을 숨기기** (내 id 는 `supabase.auth.getUser()` 로)
   - 지정·해제 전에 `confirm("홍길동 님을 관리자로 지정할까요?")` 확인창
4. 에러가 나면 화면에 빨간 글씨로 한 줄 안내 (에러 원문을 그대로 보여주지 말고 "권한이 없거나 잠시 후 다시 시도해 주세요." 처럼)
5. 위쪽에 이름·이메일 **검색 칸**이 있으면 좋아요 (선택)

> 사용자 **삭제**는 이번에 하지 않아요. 서버 전용 비밀키가 필요해서 마감 안에는 위험해요.

## 요청 2. 채널 관리 — `components/admin/AdminChannels.tsx` ⭐ 필수

1. `rpc("admin_list_channels")` 로 공개 채널 목록을 **표**로: 채널 이름 / 멤버 수 / 만든 날
2. 각 줄에 **"이름 변경"**, **"삭제"** 버튼
   - 이름 변경: `supabase.from("channels").update({ name: 새이름 }).eq("id", channelId).select("id")`
     - 같은 이름이 있으면 에러 코드 `23505` → "이미 있는 채널 이름이에요."
   - 삭제: `supabase.from("channels").delete().eq("id", channelId).select("id")`
     - **#general 은 삭제 버튼을 숨겨 주세요** (DB 도 막아요. 에러 없이 0줄 삭제됨)
     - 삭제하면 메시지·첨부 기록까지 같이 지워져요 → **"정말 삭제할까요? 되돌릴 수 없어요."** 확인창 필수
   - 끝나면 목록 다시 불러오기
3. 서비스 관리자는 공개 채널을 관리할 권한이 이미 DB 에 있어서 추가 작업은 없어요.

## 요청 3. (선택) 공통

- 두 화면 모두 처음 불러오는 동안 "불러오는 중…" 표시
- 스타일은 Tailwind 만, 표는 `w-full text-sm` + 줄 구분선 정도로 단순하게

---

## 확인 방법

1. `npm run dev` → `admin@talktalk.com` 으로 로그인 → 사이드바 "⚙ 관리자"
2. 지금은 각 탭에 점선 상자(Placeholder)만 보여요. 수정님 컴포넌트를 확인하려면
   **로컬에서만** `app/admin/slots.tsx` 의 Placeholder 를 잠깐 바꿔서 보고, **커밋할 때는 되돌려 주세요.**
   (커밋에서 빼는 방법: `git checkout app/admin/slots.tsx`)
3. 일반 계정으로 두 번째 브라우저(시크릿 창)를 열어 두면, 관리자 지정 → 새로고침 → "⚙ 관리자" 링크가 생기는지 확인하기 좋아요.

## 끝나면

```bash
npm run lint
npm run build
git add components/admin
git commit -m "[D] 관리자 페이지: 사용자 관리, 채널 관리"
git push -u origin feature/sujeong-admin-page
```

GitHub 에서 PR 을 만들어 주세요. 요청 1 만 먼저 올려도 괜찮아요. 궁금한 점은 언제든 물어봐 주세요!
