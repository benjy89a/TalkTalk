# E 재문님께 — 관리자 페이지: AI 설정 탭 요청

안녕하세요, 팀장입니다. AI 기능 추가 작업 고생 많으셨어요!
새로 **관리자 페이지(`/admin`)** 를 만들었는데, 그 안의 **"AI 설정" 탭**을 부탁드립니다.

- 페이지 틀과 권한 확인(서비스 관리자만 들어옴)은 팀장이 이미 만들었어요.
- 재문님은 **`app/api/ai/`** 와 **`components/search/`** 안에서만 작업하면 됩니다.
- 다 만들면 팀장이 `app/admin/slots.tsx` 의 `AdminAiSlot` 에 끼워 넣을게요.

```bash
git checkout main
git pull
git checkout -b feature/jaemun-admin-ai
```

---

## 0. 범위를 이렇게 정했어요 (중요)

**API 키 원본을 화면에서 입력·저장·변경하는 기능은 만들지 않습니다.**
- 키를 DB 에 저장하면 서버 전용 비밀키(service role)가 추가로 필요하고, 유출 위험이 커져요.
- 마감(11/26 10:00) 안에 안전하게 만들기 어려워요.
- **키 변경은 지금처럼 Vercel 환경변수(`EXAONE_API_KEY`)에서** 팀장이 합니다.

그래서 이 탭은 **"상태 확인"** 화면이에요.

---

## 요청 1. 상태 API — `app/api/ai/status/route.ts` ⭐ 필수

`GET /api/ai/status`

1. 로그인 확인 → 안 했으면 401 (기존 summarize 와 같은 방식)
2. `supabase.rpc("is_app_admin")` 으로 **서비스 관리자인지 확인** → 아니면 403
3. 응답 예:
   ```json
   { "provider": "EXAONE", "keyConfigured": true }
   ```
   - `keyConfigured` = `!!process.env.EXAONE_API_KEY`
   - **키 값, 키 앞뒤 몇 글자, 길이 등 키에 관한 어떤 정보도 응답에 넣지 않기**
   - 다른 모델·설정값이 있으면(모델 이름 등, 비밀이 아닌 것만) 같이 넣어도 돼요
4. `Cache-Control: no-store` (기존 AI API 규칙과 같게)

## 요청 2. (선택) 연결 테스트 — `POST /api/ai/status`

- 관리자만. 아주 짧은 문장 하나로 EXAONE 을 한 번 불러보고 `{ "ok": true, "ms": 820 }` 처럼 성공 여부와 걸린 시간만 돌려주기
- 실패하면 `{ "ok": false, "message": "연결에 실패했어요." }` — 업체 에러 원문은 넣지 않기
- 버튼을 눌렀을 때만 호출 (자동 호출·재시도 없음). 호출 비용이 생길 수 있으니 확인창 한 번

## 요청 3. 화면 — `components/search/AiKeyStatus.tsx` ⭐ 필수

1. `"use client"`, 열리면 `fetch("/api/ai/status")`
2. 보여줄 것
   - AI 제공자: EXAONE
   - API 키: ✅ 설정됨 / ❌ 설정 안 됨
   - 설정 안 됨이면 안내: "Vercel 프로젝트 → Settings → Environment Variables 에서 `EXAONE_API_KEY` 를 넣고 다시 배포하세요."
3. (요청 2 를 했다면) **"연결 테스트"** 버튼 + 결과 표시

---

## 확인 방법

1. `npm run dev` → `admin@talktalk.com` 으로 로그인 (비밀번호는 팀장에게 개별로) → 사이드바 "⚙ 관리자" → "AI 설정" 탭
2. 지금은 점선 상자만 보여요. 확인할 때만 **로컬에서** `app/admin/slots.tsx` 의 `AdminAiSlot` 을 잠깐 바꿔 보고, **커밋 전에 되돌려 주세요** (`git checkout app/admin/slots.tsx`).
3. 일반 계정으로 `/api/ai/status` 를 열면 403 이 나오는지 꼭 확인해 주세요.

## 끝나면

```bash
npm run lint
npm run build
git add app/api/ai components/search
git commit -m "[E] 관리자 페이지: AI 설정 상태 확인"
git push -u origin feature/jaemun-admin-ai
```

GitHub 에서 PR 을 만들어 주세요. 궁금한 점은 언제든 물어봐 주세요!
