# app/api/ai — E AI 서버 코드

## 현재 동작 요약 (한눈에 보기)

| 항목 | 현재 값 |
|---|---|
| 기능 | 대화 요약(`/api/ai/summarize`) · 자연어 검색(`/api/ai/search`) · 할 일 추출(`/api/ai/tasks`) · 관리자 상태·업체 선택(`/api/ai/status`) |
| AI 업체 | 관리자 설정(DB `ai_settings`) → 환경변수 `AI_PROVIDER` → 기본 EXAONE. Gemini 모델은 DB → `GEMINI_MODEL` → 기본 `gemini-3.5-flash-lite` |
| 키 | 서버 환경변수 `EXAONE_API_KEY`·`GEMINI_API_KEY`만. DB·화면·응답에 저장·노출하지 않음. 고른 업체의 키가 없으면 전환 차단 |
| 응답 대기 | 요약·검색·추출·연결 테스트 모두 **최대 240초**, route `maxDuration = 300` |
| 출력 한도(`max_tokens`) | 요약 4,096 · 추출 5,120 · 검색 4,096 (생각 토큰 포함) |
| 요약 입력 | `[이름] 본문` 형식(말한 사람 실명 포함), 기본 50개·1~100개 |
| 할 일 추출 입력 | 기본 10개·최대 25개, 상대 기한은 코드가 서울 날짜로 계산 |
| 권한 | 로그인 + 채널 멤버만, 답글은 제외, 입력·응답·오류 원문을 로그에 남기지 않음 |
| 자동 재시도·다른 업체 자동 대체 | 없음 |

아래는 항목별 상세 설명이며, 날짜별 실측·변경 근거는 [HISTORY.md](HISTORY.md)에 있습니다. 이 문서의 "EXAONE" 설명은 기본 업체 기준이고, 업체별 차이는 "AI 제공업체 선택"에 모았습니다.

## E-3 요약 API

`POST /api/ai/summarize`는 입력 검사·로그인·채널 권한 확인 후 EXAONE으로 요약합니다. 서버 전용 `EXAONE_API_KEY`가 필요하며 `NEXT_PUBLIC_`을 붙이지 않습니다. 키 값은 코드·로그·브라우저에 넣지 않습니다.

사용자가 요약을 요청하면 선택 범위의 대화가 외부 EXAONE 서버로 전송됩니다. 모듈 불러오기·빌드·아래 자동 테스트만으로는 외부 AI를 호출하지 않습니다. 실제 사내 대화 사용 전 데이터 처리 조건과 사용 허용 범위를 팀에서 확인해야 합니다. 무료·무제한 사용을 보장하지 않으며 자동 재시도·유료 전환·다른 업체로의 자동 대체 호출은 없습니다.

### 요청 형식

1. 팀 연결 규격: `{ "channelId": "채널 UUID", "limit": 50 }`
   - `limit`은 선택이며 기본 50, 범위 1~100입니다.
   - 서버가 로그인 사용자의 채널 멤버 여부를 확인한 뒤, 기존 RLS가 적용된 Supabase 클라이언트로 최근 원본 메시지를 조회합니다. 답글은 제외합니다.
   - 조회한 메시지는 오래된 순서부터 요약 연결 함수에 전달합니다. B 담당 화면 코드를 사용하지 않습니다.
2. 추가 요청의 텍스트 배열: `{ "messages": ["첫 번째 대화", "두 번째 대화"] }`
   - 로그인은 필요합니다. 사용자가 직접 제출한 텍스트이며 DB의 채널 메시지라고 가정하거나 DB 접근 권한을 증명하지 않습니다.
   - `channelId`와 `messages`를 함께 보내면 거절합니다. 각 형식에 정한 필드 외의 필드도 거절합니다.

제한: 본문 최대 128KiB, 메시지 1~100개, 메시지당 4,000자, 전체 20,000자. 공백만 있는 텍스트는 허용하지 않습니다. 채널 대화가 길면 `limit`을 줄여야 하며, 몰래 잘라 요약한 것으로 처리하지 않습니다.

### 응답 계약

성공 응답은 `{ "summary": "요약 문장" }`입니다. EXAONE의 최종 `message.content`만 사용하고 `reasoning_content`는 반환·기록하지 않습니다. 빈 응답·비정상 형식·8,000자 초과·중간에 잘린 응답은 성공으로 표시하지 않습니다.

오류는 `{ "error": { "code": "오류 코드", "message": "안내" } }` 형태입니다. 모든 이 API의 JSON 응답은 `Cache-Control: no-store`이며 입력 원문·비밀값·내부 DB/업체 오류를 그대로 반환하거나 로그에 넣지 않습니다. 요약은 입력 내용을 반영하므로 개인정보가 포함될 수 있으며 공유 전 원문과 함께 확인해야 합니다.

| HTTP 상태 | 코드 예 | 의미 |
|---|---|---|
| 400 | `INVALID_JSON`, `INVALID_INPUT`, `INVALID_MESSAGES`, `INVALID_CHANNEL`, `INVALID_LIMIT` | 잘못된 입력 |
| 401 | `UNAUTHORIZED` | 로그인 필요·로그인 확인 실패 |
| 403 | `FORBIDDEN` | 채널 비회원 (채널 존재 여부와 구분하여 노출하지 않음) |
| 408 | `REQUEST_ABORTED` | 요청 취소 |
| 413 | `INPUT_TOO_LARGE` | 본문·대화 길이 초과 |
| 415 | `JSON_REQUIRED` | JSON Content-Type 필요 |
| 422 | `NO_MESSAGES` | 채널에 요약할 원본 대화 없음 |
| 429 | `AI_RATE_LIMITED` | 업체 호출 한도·사용량 제한 |
| 429 | `USER_RATE_LIMITED` | 우리 서버의 사용자별 제한: 1분에 5회 초과 |
| 429 | `USER_BUSY` | 우리 서버의 사용자별 제한: 앞선 AI 요청이 아직 처리 중(동시 1건) |
| 500 | `DATABASE_ERROR`, `INTERNAL_ERROR` | 일반화한 서버 오류 |
| 502 | `AI_AUTH_FAILED`, `AI_SERVICE_ERROR`, `AI_CONNECTION_FAILED` | 업체 키/모델 권한·서비스·네트워크 오류 |
| 502 | `INVALID_AI_RESPONSE`, `AI_OUTPUT_TRUNCATED` | 잘못되거나 잘린 요약 응답 |
| 503 | `AI_NOT_CONFIGURED`, `SERVICE_NOT_CONFIGURED` | EXAONE 키 또는 서버 설정 누락 |
| 504 | `AI_TIMEOUT` | 업체 응답 시간 초과 |

파일: `summarize/route.ts`만 서버 키를 읽어 `createExaoneSummary`를 전달합니다. `summarize/handler.ts`는 입력·권한·조회·응답과 업체 연결을 처리합니다. 독립 `handleSummarize`의 기본값은 테스트 안전성을 위해 외부 호출 없는 `unavailableSummary`(503 `AI_NOT_CONNECTED`)입니다. 가짜 응답을 사용하는 테스트 성공과 실제 업체/API/브라우저 검증은 서로 구분합니다.

### EXAONE 호출 제한 (Gemini 차이는 아래 "AI 제공업체 선택")

- 고정 주소 `https://api.exaone.ai/v1/chat/completions`, 모델 `k-exaone_v2.5`, Bearer 인증. 사용자 입력으로 주소·모델·키를 바꿀 수 없습니다.
- 비스트리밍, `reasoning_effort: "low"`, `max_tokens: 4096`(추론 토큰 포함, 근거는 아래 "요약 응답 한도와 말한 사람 표시"), 업체 요청·응답 읽기에 **240초 제한**(`SUMMARY_TIMEOUT_MS`). 사용자 요청으로 **요약·AI 검색·할 일 추출·관리자 연결 테스트 모두 240초**로 통일했습니다. 네 route의 `maxDuration = 300`이며 배포 환경에서 이 실행 한도를 지원하는지 확인해야 합니다. 취소 신호를 전달하며 리다이렉트는 허용하지 않습니다. 취소해도 업체가 이미 처리한 사용량까지 되돌아가는 것은 아닙니다.
- 기존 메시지 개수·입력 길이 제한 유지. 요약 생성 중 UI 버튼 중복 실행 방지는 있지만 서버 전체 사용자 호출량 제한은 아직 없습니다. 공개 배포 전 사용량·한도 관리 방식은 팀장 협의가 필요합니다.
- 데이터 속 지시를 따르지 않고 원문에 없는 담당자·기한을 만들지 않도록 요청하지만, 모델의 정확성이나 지시 무시 방어를 보장하지 않습니다.
- [공식 모델·요청 문서](https://docs.exaone.ai/ko/docs/k-exaone-2.5)

### 검증 범위

첫 연결 검증(합성 대화 실제 1회 호출, 10개 대화 시간 초과 조사)은 [HISTORY.md](HISTORY.md)에 있습니다. 로그인한 실제 API의 성공 응답·두 계정 DB 권한·Vercel 반영은 이 문서의 범위에서 검증하지 않았고, 확인 순서는 PR 본문에 적습니다. 자세한 조사·진단 절차는 [summarize/TIMEOUT.md](summarize/TIMEOUT.md)입니다.

### 검사 명령

프로젝트 루트, Node 24에서 실행합니다. 패키지를 추가로 설치하지 않습니다.

```bash
node --test app/api/ai/summarize/handler.test.mjs app/api/ai/summarize/exaone.test.mjs components/search/summaryClient.test.mjs components/search/searchMessages.test.mjs
npm run lint
npm run build
node app/api/ai/summarize/smoke.mjs
```

단위 테스트의 HTTP는 모두 가짜 함수입니다. 마지막 명령은 빌드된 Next.js를 임시 localhost 포트에서 실행해 잘못된 요청·비로그인·POST 전용 동작을 확인한 뒤 종료합니다. 기존 Supabase 환경변수는 필요하지만 로그인 쿠키·실제 대화는 사용하지 않으며, 키가 있어도 인증을 통과하지 않아 외부 AI를 호출하지 않습니다. 이 검사는 로그인 후 채널 접근 권한이나 실제 요약을 증명하지 않습니다.

### 비로그인 요청 예

`npm run dev` 실행 후 PowerShell에서 다음과 같이 요청할 수 있습니다.

```powershell
$body = @{ messages = @("Test message one", "Test message two") } | ConvertTo-Json -Compress
Invoke-WebRequest -Uri http://localhost:3000/api/ai/summarize -Method Post -ContentType application/json -Body $body
```

로그인 쿠키 없이 실행하면 `401 UNAUTHORIZED`입니다(PowerShell은 오류 응답을 예외로 표시할 수 있습니다). 인증된 정상 요청에서는 서버 키가 있으면 실제 EXAONE을 호출하고, 키가 없으면 `503 AI_NOT_CONFIGURED`를 반환합니다. 계정 쿠키·토큰을 공유하거나 코드에 넣지 마세요.

### UI 연결 — 팀장 협의

`components/search/AiToolsBar.tsx`가 `channelId` props를 받습니다. 팀장이 `components/layout/slots.tsx`의 `AiToolsSlot`에서 선택 채널 ID를 넘겨 연결합니다. 이번 작업에서는 레이아웃·계약 문서·환경변수·패키지·DB 설정을 바꾸지 않았습니다.

팀장 전달 예시:

> E-3에 EXAONE 연결을 추가했습니다. `AiToolsBar`의 `{ channelId }`와 API의 `{ channelId }` → `{ summary }` 계약은 그대로입니다. `slots.tsx`의 `AiToolsSlot` 연결과 Vercel의 서버 전용 `EXAONE_API_KEY` 등록·재배포를 협의해 주세요. 현재 이 브랜치 변경은 배포에 반영되지 않았고 인증된 실제 API·두 계정 권한·브라우저 동작은 별도 확인해야 합니다. 실제 대화 전송 허용 범위와 사용량 제한도 확인이 필요합니다.

```tsx
// 아래 코드는 연결 예시이며, 실제 slots.tsx를 변경한 것은 아닙니다.
import AiToolsBar from "@/components/search/AiToolsBar";

export function AiToolsSlot() {
  const { channelId } = useSelectedChannel();
  return <AiToolsBar channelId={channelId} />;
}
```

## E-4 자연어 검색·할 일 추출

`/api/ai/search`, `/api/ai/tasks`의 업체 연결·입력/권한/결과 검증을 제공합니다. 대기 제한은 240초이며(과거 25초·45초에서 실패해 늘린 경과는 [HISTORY.md](HISTORY.md)와 [E4.md](E4.md)), `maxDuration = 300`을 명시했습니다. 인증된 앱 API·실DB 권한·사내 대화 품질은 별도 검증이 필요합니다. API 규격·상대 날짜 정책·제한·검사·남은 협의는 [E4.md](E4.md)를 참고하세요.

## 요약 응답 한도와 말한 사람 표시

- **한도:** `SUMMARY_MAX_TOKENS = 4096`. 이 업체는 생각 토큰도 `max_tokens`에 포함해 쓰므로, 지어낸 대화 50개 실측(필요량 1,070~2,313토큰, 이름이 붙으면 약 40% 증가)에 따라 2,048에서 올렸습니다. 최악 시간은 4,096토큰 ÷ 26토큰/초 ≈ 158초로 제한 240초 안입니다. 잘림 안내는 "다시 시도해 주세요. 반복되면 대화 범위를 줄여 보세요."입니다.
- **말한 사람:** 채널 요약은 `[이름] 본문` 형식(`formatSpeakerLine`)으로 보냅니다. 이름이 없으면 `[알 수 없음]`, 이름 안의 줄바꿈·대괄호는 공백으로 바꾸고 30자로 제한합니다. 이름은 실명 그대로 전송하며(사용자 결정), 화면 안내에 "작성자 이름"이 외부로 전송됨을 밝힙니다. 조회는 `profiles!messages_user_id_fkey(name)`로 하고 DB·권한 변경은 없습니다. 원문 4,000자·합계 20,000자는 원문 기준으로 검사하고 이름 접두어(최대 64자)는 별도 여유입니다. 스레드 답글은 요약 대상이 아닙니다.
- 측정 표·정확도 대조·한계는 [HISTORY.md](HISTORY.md)에 있습니다. 표본이 작고 지어낸 짧은 대화 기반이라 실제 대화에서는 다를 수 있습니다.


## AI 제공업체 선택: EXAONE / Gemini (`AI_PROVIDER`)

서버 환경변수 `AI_PROVIDER`로 AI 제공업체를 고른다. **설정이 없으면 지금까지와 똑같이 EXAONE**이다(팀장 요청 11/24). 팀장님이 배포를 Gemini로 바꿔 팀 전체가 테스트할 수 있다.

| 환경변수 | 값 | 설명 |
|---|---|---|
| `AI_PROVIDER` | 비움 · `exaone` · (그 밖의 값) | EXAONE (기존 동작, 키 `EXAONE_API_KEY`) |
| | `gemini` (대소문자·앞뒤 공백 무시) | Gemini (키 `GEMINI_API_KEY`) |
| `GEMINI_API_KEY` | 키 | Gemini 선택 시에만 읽는다. **Gemini를 골랐는데 이 키가 없으면 EXAONE 키로 대신 호출하지 않고** "서버의 GEMINI_API_KEY 설정을 확인해 주세요" 안내 |
| `GEMINI_MODEL` | 모델 ID (선택) | 없거나 형식이 이상하면 기본 `gemini-3.5-flash-lite`. 영문·숫자·`.`·`_`·`-`만 허용(최대 64자) |

- **Vercel에 넣을 값:** `AI_PROVIDER=gemini`, `GEMINI_API_KEY=<키>`, (선택) `GEMINI_MODEL`. 환경변수를 바꾼 뒤에는 **다시 배포**해야 적용된다. `.env.example`·`package.json`·Vercel 설정은 팀장 담당이라 이 작업에서 바꾸지 않았다.
- **EXAONE으로 되돌리기:** `AI_PROVIDER`를 지우거나 `exaone`으로 바꾸고 다시 배포.

### 코드 구조
- `app/api/ai/provider.ts` — 주소·모델·키 환경변수 이름·표시 이름·옵션을 **한 파일**에 모은다. `resolveAiProvider()`가 환경변수로 고르고, `stripCodeFence()`가 JSON 코드블록을 벗긴다. 키 값은 설정 객체에 넣지 않는다.
- `summarize/handler.ts`(요약)·`extra.ts`(검색 해석·할 일 추출)의 어댑터는 `provider` 옵션을 받는다. **안 넘기면 기존 EXAONE 설정으로 동작**(기본값은 `provider.ts`의 `EXAONE_CONFIG`와 같아야 하며 테스트가 확인). route 4개(`summarize`·`search`·`tasks`·`status`)는 `resolveAiProvider()` 결과를 넘긴다. `createAiSummary`/`createAiExtra`는 기존 `createExaoneSummary`/`createExaoneExtra`의 별칭이다.
- 오류 문구와 관리자 상태의 업체 이름이 실제 업체를 가리킨다("Gemini 호출 한도에 도달했습니다" 등).
- **화면 안내문**("선택한 범위의 대화가 외부 AI 서비스(Gemini)로 전송됩니다")은 `GET /api/ai/status?view=public`에서 업체 **이름만** 받아 채운다. 로그인한 누구나 읽을 수 있고 키 설정 여부·키 이름은 관리자에게만 보인다. 받기 전이나 실패 시에는 "외부 AI 서비스"로 보인다. 관리자 AI 설정 탭은 키 환경변수 이름(`GEMINI_API_KEY` 등)을 보여 준다.

### Gemini 호출 방식과 처리한 차이 (OpenAI 호환 주소)
- 주소 `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`, `Authorization: Bearer 키`, 요청 형식은 EXAONE과 같은 채팅 완성(비스트리밍). 문서상 이 호환 주소는 **베타**다.
- **`reasoning_effort`는 Gemini에 보내지 않는다.** 모델마다 허용 값이 달라 거절될 위험이 있어서이고, 모델 기본 생각 수준을 따른다(`gemini-3.5-flash-lite` 기본은 minimal).
- **JSON 코드블록:** Gemini는 JSON을 ```json 블록으로 감싸 보낼 수 있어, Gemini 설정에서만 블록 하나로 감싼 응답은 안쪽을 읽는다(설명 글이 섞이면 형식 오류). EXAONE은 기존처럼 코드블록을 거절한다.
- **안전 필터:** 종료 사유가 `content_filter`이면 형식 오류가 아니라 `AI_CONTENT_FILTERED`("AI 서비스(Gemini)가 이 내용에는 응답하지 않았습니다…")로 안내한다. 문서에 응답 모양이 없어 종료 사유 값으로만 구분한다.
- 잘림(`length`)·빈 본문·429·401/403은 EXAONE과 같은 처리.
- **생각 토큰과 `max_tokens`:** 문서상 Gemini도 생각 토큰이 최대 출력 한도에 포함된다. 기본 모델은 생각이 적어 한도를 EXAONE과 **같게 두었다**(요약 4,096·추출 5,120·검색 4,096, 대기 240초). 실제 호출로 잘림이 나면 Gemini 한도를 따로 정한다.

### 기본 모델 `gemini-3.5-flash-lite` 선택 근거 (AI Studio 문서, 2026-11-24 확인)
- Flash-Lite 3.5는 **안정(Stable)** 이고 "3.5 세대에서 가장 빠르고 비용 효율적인 모델"로 소개된다. 문서가 새 프로젝트에 "Gemini 4 Hydrogen 또는 3.5 Flash-Lite"를 권장한다.
- `gemini-2.5-flash`는 2026-12-01부터 `gemini-3.5-flash-lite`로 자동 전환될 예정이라 처음부터 이 ID를 쓴다. 더 높은 품질이 필요하면 `GEMINI_MODEL`로 바꾼다(예: `gemini-3.8-flash`).
- 이 근거는 문서 요약이며 **모델 ID·무료 티어 적용 여부는 실제 호출로 확인하지 못했다**(아래).

### 실제 호출로 확인한 것 / 못 한 것
- **확인(가짜 응답 테스트):** 설정별 주소·모델·키·옵션 선택, 키 없을 때 안내, 업체 이름이 들어간 오류 문구, JSON 코드블록 처리, 안전 필터·잘림 처리, 공개/관리자 상태 응답, EXAONE 기본값 불변.
- **못 한 것(로컬에 Gemini 키가 없어 실제 호출 없음):** Gemini 응답 형식, `max_tokens` 적용, 종료 사유 값, 한국어 요약·추출 품질, 무료 한도, 모델 ID 유효성.
- **팀장님 확인 방법(키 등록·재배포 후):**
  1. 관리자 → AI 설정 탭: 제공자 `Gemini`·모델·`API 키 ✅` 확인 → **연결 테스트**(1회 호출)가 성공하는지(= 주소·키·모델·`max_tokens` 형식이 받아들여짐)
  2. 채널에서 **대화 요약**, **AI 검색**(예: "팀장"), **할 일 추출**을 각각 실행해 결과와 오류 문구 확인
  3. 오류가 나면 문구가 `Gemini`를 가리키는지: 키 오류(401/403), 한도(429), 잘림(`AI_OUTPUT_TRUNCATED`), 형식 오류(`INVALID_AI_RESPONSE`), 안전 필터(`AI_CONTENT_FILTERED`)
  4. 안내문이 "외부 AI 서비스(Gemini)로 전송됩니다"로 보이는지
- **무료 티어 주의:** 문서상 무료 티어는 입력 데이터가 제품 개선에 사용될 수 있다(유료는 아님). 사내 대화·작성자 이름을 보내므로 팀 기준에서 허용되는지 확인이 필요하다.


## 관리자 화면에서 AI 업체 선택 (DB 설정, 007 마이그레이션)

팀장 지시(A안): **API 키는 DB에 저장하지 않고 "어느 업체(와 Gemini 모델)를 쓸지"만 저장**한다. 키는 Vercel 환경변수에 **둘 다** 넣어 둔다(`EXAONE_API_KEY`, `GEMINI_API_KEY`). 설정 테이블 `ai_settings`(한 줄)와 관리자 전용 함수 `admin_set_ai_settings(provider, model)`는 팀장의 `supabase/migrations/007_ai_settings.sql`(PR #97)이다 — **팀장이 Supabase SQL Editor에서 실행해야 이 기능이 동작한다.**

### 어떤 업체를 쓰는가 (우선순위)
1. **관리자 설정(DB)**의 `ai_provider`가 `exaone`/`gemini`면 그것 (`gemini_model`이 있으면 그 모델)
2. DB 값이 `null`("환경변수 따르기")이거나 **DB를 못 읽으면**(007 미적용·오류·로그인 전 요청) 환경변수 `AI_PROVIDER`(없으면 EXAONE)
3. Gemini 모델은 DB `gemini_model` → 환경변수 `GEMINI_MODEL` → 기본 `gemini-3.5-flash-lite`

처음에는 DB 값이 `null`이라 **007을 실행해도 동작이 바뀌지 않는다.** 코드를 먼저 배포하고 007을 나중에 실행해도, 007 없이도 안전하게 환경변수로 동작한다.

### 구조
- `aiSettings.ts` — `ai_settings`를 로그인한 사용자의 세션으로 읽는다(RLS: 로그인한 누구나 읽기). **성공한 값만 서버 인스턴스 메모리에 10초 캐시**하고(다른 인스턴스에는 최대 10초 뒤 반영), 실패는 캐시하지 않는다(로그인 전 요청의 빈 결과가 다음 사용자를 오염시키지 않게). 관리자 상태 화면은 항상 캐시 없이 최신 값을 읽는다.
- `currentProvider.ts` — 요약·검색 해석·할 일 추출 route 3개가 `await currentAiProvider()`로 이번 요청의 업체를 얻는다.
- `provider.ts` — `resolveAiProvider(env, override)`가 위 우선순위를 적용한다. `listProviderOptions`·`isProviderKeyConfigured`는 업체별 키 설정 여부(키 값 없음)를 만든다.
- `status/route.ts` — `GET`(관리자: 현재 적용 + `selection` + 업체별 키 여부, `?view=public`: 업체·모델 이름만), **`PUT`(관리자 저장)**, `POST`(연결 테스트: 지금 적용된 업체로 1회 호출).

### 저장 규칙 (`PUT /api/ai/status`, 서비스 관리자만)
요청 `{ "provider": "exaone" | "gemini" | null, "model"?: string | null }`.
- **고른 업체의 키가 서버에 없으면 저장하지 않고 409 `KEY_NOT_CONFIGURED`로 막는다**("Gemini 키(GEMINI_API_KEY)가 서버에 없어 전환할 수 없습니다. Vercel 환경변수에 키를 넣고 다시 배포한 뒤 선택해 주세요."). "환경변수 따르기"(`null`)는 환경변수 `AI_PROVIDER`가 가리키는 업체의 키가 있어야 한다. 키 값은 서버도 화면도 보지 않고 "있는지"만 본다.
- 업체만 바꿀 때도 **현재 모델을 함께 보낸다**: DB 함수가 호출할 때마다 `gemini_model`을 덮어쓰기 때문이다(빈 값은 `null`).
- 오류: 400 형식 오류, 401/403 권한, 409 키 없음, 413 너무 긴 요청, **503 `SETTINGS_NOT_READY`(007 미적용)**, 500 그 밖(DB 오류 원문은 응답에 넣지 않음).
- 저장 성공 뒤 이 인스턴스의 캐시를 비운다.

### 관리자 화면 (`AiProviderSelect`, AI 설정 탭)
`환경변수 따르기 / EXAONE / Gemini` 라디오 + Gemini 모델 입력. 지금 적용(업체·모델·출처·마지막 변경 시각)을 보여 주고, **키가 없는 업체는 선택할 수 없으며**(키 환경변수 이름과 "Vercel에 넣고 재배포" 안내), 바꾼 내용이 없으면 저장 버튼이 꺼진다. 저장 전에 "대화와 작성자 이름이 해당 외부 AI 서비스로 전송됩니다" 확인창을 띄운다. 설정 테이블이 없으면(007 미적용) 안내만 보여 준다. 저장 요청에는 업체·모델만 담긴다(키 없음).

### 확인한 것 / 못 한 것
- **확인(가짜 DB·가짜 응답 테스트 + 로컬 임시 화면):** 우선순위(DB→환경변수→기본), 설정 읽기·캐시·실패 처리, 저장 API의 모든 분기(권한·입력·키 없음 409·007 없음 503·성공·캐시 비우기), 화면의 시나리오별 표시(키 없음·007 미적용·환경변수=Gemini인데 키 없음)와 저장 성공·409·503 안내.
- **못 한 것:** 실제 DB(007 적용 여부 미확인)에서의 읽기·저장, 관리자 계정으로 `/admin` AI 설정 탭의 실제 화면(로컬 계정이 관리자가 아니라 가짜 데이터로 컴포넌트만 확인), 여러 서버 인스턴스에서의 10초 반영 지연.
- **팀장 확인 순서:** ① 이 PR 병합·배포 ② Vercel에 키 둘 다 등록 확인 ③ Supabase에서 `007_ai_settings.sql` 실행 ④ 관리자 → AI 설정 탭에서 업체 선택 → 저장 → 다시 열어 "출처 관리자 설정" 확인 ⑤ 연결 테스트·요약/검색/추출 실행.

## 사용자별 호출 제한 (`rateLimit.ts`)
- **동시 1건 + 분당 5회**를 사용자별로 제한한다. 요약·AI 검색·할 일 추출이 한도를 함께 쓴다.
- 입력 검증·로그인·채널 권한 확인을 통과한 **실제 AI 호출만** 센다. AI가 실패하거나 취소돼도 "처리 중" 자리는 반납한다. 한도를 넘으면 AI를 부르지 않고 429로 답한다.
- 서버 인스턴스 메모리로 센다. 인스턴스가 여러 개이거나 재시작되면 횟수가 초기화되므로 **연타·반복 호출 방지용**이다. 하루 횟수·서비스 전체 상한은 DB가 필요해 팀장 협의 대상이다(초안은 개인 기록).
- 업체 연결 테스트(관리자 POST `/api/ai/status`)는 제한 대상이 아니다.
