# app/api/ai — E AI 서버 코드

## E-3 요약 API 준비 — 실제 AI 미연결

`POST /api/ai/summarize`를 구현했습니다. 현재는 입력 검사·로그인·채널 권한·대화 조회와 오류 응답까지 준비한 단계입니다.
**실제 AI 요약은 제공하지 않습니다.** 환경변수에 키가 있더라도 외부 AI 서비스를 자동 호출하지 않습니다. 제공업체·무료 한도·데이터 처리 조건 협의와 명시적인 연동 요청 후 연결 함수를 교체합니다.

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

향후 실제 AI 연결 후 성공 응답은 `{ "summary": "요약 문장" }`입니다. **현재 기본 연결 함수는 성공 응답이나 샘플 요약을 반환하지 않습니다.**

오류는 `{ "error": { "code": "오류 코드", "message": "안내" } }` 형태입니다. 모든 이 API의 JSON 응답은 `Cache-Control: no-store`이며 원문·비밀값·내부 DB 오류를 응답 또는 로그에 넣지 않습니다.

| HTTP 상태 | 코드 예 | 의미 |
|---|---|---|
| 400 | `INVALID_JSON`, `INVALID_INPUT`, `INVALID_MESSAGES`, `INVALID_CHANNEL`, `INVALID_LIMIT` | 잘못된 입력 |
| 401 | `UNAUTHORIZED` | 로그인 필요·로그인 확인 실패 |
| 403 | `FORBIDDEN` | 채널 비회원 (채널 존재 여부와 구분하여 노출하지 않음) |
| 408 | `REQUEST_ABORTED` | 요청 취소 |
| 413 | `INPUT_TOO_LARGE` | 본문·대화 길이 초과 |
| 415 | `JSON_REQUIRED` | JSON Content-Type 필요 |
| 422 | `NO_MESSAGES` | 채널에 요약할 원본 대화 없음 |
| 500 | `DATABASE_ERROR`, `INTERNAL_ERROR` | 일반화한 서버 오류 |
| 502 | `INVALID_AI_RESPONSE` | 향후 요약 연결 함수의 잘못된 응답 |
| 503 | `AI_NOT_CONNECTED`, `SERVICE_NOT_CONFIGURED` | AI 미연결 또는 서버 설정 누락 |

파일: `summarize/route.ts`는 서버 Supabase 클라이언트를 연결하고, `summarize/handler.ts`는 입력·권한·조회·응답을 처리합니다. 실제 route는 `unavailableSummary`를 사용합니다. 테스트에만 주입한 가짜 요약 함수의 성공은 실제 AI 성공이 아닙니다.

### 검사 명령

프로젝트 루트, Node 24에서 실행합니다. 패키지를 추가로 설치하지 않습니다.

```bash
node --test app/api/ai/summarize/handler.test.mjs components/search/summaryClient.test.mjs components/search/searchMessages.test.mjs
npm run lint
npm run build
node app/api/ai/summarize/smoke.mjs
```

마지막 명령은 빌드된 Next.js를 임시 localhost 포트에서 실행해 잘못된 요청·비로그인·POST 전용 동작을 확인한 뒤 종료합니다. 기존 Supabase 환경변수는 필요하지만 로그인 쿠키·AI 키·실제 대화는 사용하지 않습니다. 이 검사는 로그인 후 채널 접근 권한이나 실제 요약을 증명하지 않습니다.

### 직접 요청 예 — 아직 요약은 반환하지 않음

`npm run dev` 실행 후 PowerShell에서 다음과 같이 요청할 수 있습니다.

```powershell
$body = @{ messages = @("Test message one", "Test message two") } | ConvertTo-Json -Compress
Invoke-WebRequest -Uri http://localhost:3000/api/ai/summarize -Method Post -ContentType application/json -Body $body
```

로그인 쿠키 없이 실행하면 `401 UNAUTHORIZED`입니다(PowerShell은 오류 응답을 예외로 표시할 수 있습니다). 유효한 로그인 쿠키가 있고 입력이 정상인 텍스트 요청은 `503 AI_NOT_CONNECTED`입니다. 계정 쿠키·토큰을 공유하거나 코드에 넣지 마세요.

### UI 연결 — 팀장 협의

`components/search/AiToolsBar.tsx`가 `channelId` props를 받습니다. 팀장이 `components/layout/slots.tsx`의 `AiToolsSlot`에서 선택 채널 ID를 넘겨 연결합니다. 이번 작업에서는 레이아웃·계약 문서·환경변수·패키지·DB 설정을 바꾸지 않았습니다.

팀장 전달 예시:

> E-3 키 없는 준비 코드를 만들었습니다. `AiToolsBar`는 `{ channelId }` props를 받고, API는 CONTRACTS의 `{ channelId }` 요청·향후 `{ summary }` 성공 응답 형태를 유지합니다. 현재는 정상 입력·권한 확인 후 `503 AI_NOT_CONNECTED`를 반환하며 실제 요약은 하지 않습니다. `slots.tsx`의 `AiToolsSlot`에 아래처럼 연결해 주시거나 수정 승인을 부탁드립니다. 연결 후 두 계정 권한·채널 변경·미연결 안내를 확인해야 합니다.

```tsx
// 아래 코드는 연결 예시이며, 실제 slots.tsx를 변경한 것은 아닙니다.
import AiToolsBar from "@/components/search/AiToolsBar";

export function AiToolsSlot() {
  const { channelId } = useSelectedChannel();
  return <AiToolsBar channelId={channelId} />;
}
```
