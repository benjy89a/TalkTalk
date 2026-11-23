# app/api/ai — E AI 서버 코드

## E-3 요약 API — EXAONE 연결

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
| 500 | `DATABASE_ERROR`, `INTERNAL_ERROR` | 일반화한 서버 오류 |
| 502 | `AI_AUTH_FAILED`, `AI_SERVICE_ERROR`, `AI_CONNECTION_FAILED` | 업체 키/모델 권한·서비스·네트워크 오류 |
| 502 | `INVALID_AI_RESPONSE`, `AI_OUTPUT_TRUNCATED` | 잘못되거나 잘린 요약 응답 |
| 503 | `AI_NOT_CONFIGURED`, `SERVICE_NOT_CONFIGURED` | EXAONE 키 또는 서버 설정 누락 |
| 504 | `AI_TIMEOUT` | 업체 응답 시간 초과 |

파일: `summarize/route.ts`만 서버 키를 읽어 `createExaoneSummary`를 전달합니다. `summarize/handler.ts`는 입력·권한·조회·응답과 업체 연결을 처리합니다. 독립 `handleSummarize`의 기본값은 테스트 안전성을 위해 외부 호출 없는 `unavailableSummary`(503 `AI_NOT_CONNECTED`)입니다. 가짜 응답을 사용하는 테스트 성공과 실제 업체/API/브라우저 검증은 서로 구분합니다.

### EXAONE 호출 제한

- 고정 주소 `https://api.exaone.ai/v1/chat/completions`, 모델 `k-exaone_v2.5`, Bearer 인증. 사용자 입력으로 주소·모델·키를 바꿀 수 없습니다.
- 비스트리밍, `reasoning_effort: "low"`, `max_tokens: 2048`(추론 토큰 포함), 업체 요청·응답 읽기에 25초 제한. 취소 신호를 전달하며 리다이렉트는 허용하지 않습니다. 취소해도 업체가 이미 처리한 사용량까지 되돌아가는 것은 아닙니다.
- 기존 메시지 개수·입력 길이 제한 유지. 요약 생성 중 UI 버튼 중복 실행 방지는 있지만 서버 전체 사용자 호출량 제한은 아직 없습니다. 공개 배포 전 사용량·한도 관리 방식은 팀장 협의가 필요합니다.
- 데이터 속 지시를 따르지 않고 원문에 없는 담당자·기한을 만들지 않도록 요청하지만, 모델의 정확성이나 지시 무시 방어를 보장하지 않습니다.
- [공식 모델·요청 문서](https://docs.exaone.ai/ko/docs/k-exaone-2.5)

### 검증 범위 (2026-11-23)

- 짧은 합성 대화 4개로 연결 함수에서 실제 EXAONE 1회 호출: HTTP 200, 약 10.7초, 최종 요약 수신. 해당 예제의 일정·담당자·미정 사항을 원문과 대조했습니다. 일반적인 요약 품질·긴 대화 성능까지 검증한 것은 아닙니다.
- 아래 단위 테스트와 비로그인 실제 HTTP 검사는 별도 수행했습니다. 로그인한 실제 API의 성공 응답·두 계정 DB 권한·브라우저 UI·Vercel 반영은 아직 검증하지 않았습니다.

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

`/api/ai/search`, `/api/ai/tasks`의 EXAONE 연결·입력/권한/결과 검증과 UI를 추가했습니다. **실제 합성 질문 해석은 성공했으나 할 일 추출은 25초·45초 모두 시간 초과로 실제 성공/품질 미검증**입니다. `AiToolsBar(channelId)` 안에 E-4 UI를 포함했지만 공용 슬롯·배포 설정·인증된 앱 검증은 별도입니다. API 규격·상대 날짜 정책·제한·검사·남은 협의는 [E4.md](E4.md)를 참고하세요.
