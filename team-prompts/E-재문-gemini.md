# [E 재문] AI 호출에 Gemini 선택지 추가 (팀장 요청 · 11/24)

> 사용법: 이 파일 내용을 통째로 Claude 에 붙여넣으세요.

## 목표
서버 환경변수 `AI_PROVIDER` 로 EXAONE / Gemini 중 하나를 골라 쓰게 한다. 팀장님이 배포를 Gemini 로 바꿔 팀 전체가 테스트할 예정.
- `AI_PROVIDER=gemini` → Gemini (키 `GEMINI_API_KEY`, 모델 `GEMINI_MODEL`)
- 값 없음 또는 `exaone` → 지금처럼 EXAONE. **설정을 안 넣으면 지금과 똑같이 동작해야 한다.**

## 방법
- 새 패키지 없이 지금처럼 `fetch` 사용.
- Gemini OpenAI 호환 주소: `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions` (Bearer 키, 형식은 지금 EXAONE 호출과 동일)
- `GEMINI_MODEL` 기본값은 AI Studio 문서에서 지금 제공되는 빠른 모델(Flash 계열)로 정하고 PR 에 근거를 적는다.
- 주소·모델·키·표시 이름 선택은 한 파일(예: `app/api/ai/provider.ts`)에 모아 `extra.ts`·`summarize/handler.ts` 가 같이 쓴다.

## 바꿀 곳
1. `app/api/ai/extra.ts`, `summarize/handler.ts`, 각 `route.ts`(search·tasks·summarize·status)
2. 오류 문구·`/api/ai/status` 응답의 "EXAONE" → 실제 쓰는 모델 이름
3. `components/search/` 안내 문구("외부 EXAONE으로 전송", AiKeyStatus 키 이름)도 실제 모델 기준으로
4. 테스트: 기존 통과 + 설정별로 주소·모델·키가 맞게 골라지는지, 키 없을 때 안내 문구

## 확인할 것
- Gemini 생각 토큰이 `max_tokens` 에 포함되는지 → 할 일 추출 잘림(`AI_OUTPUT_TRUNCATED`) 여부, 필요하면 Gemini 한도 따로
- `reasoning_effort` 등 EXAONE 옵션을 Gemini 가 거절하지 않는지
- JSON 을 ```json 코드블록으로 감싸 오면 처리

## 하지 말 것
- `.env.example`·`package.json`·환경변수 설정 변경 (팀장 담당)
- 키 값을 코드·테스트·PR·로그에 쓰기, 응답 원문 기록
- `app/api/ai/`, `components/search/` 밖 수정

## 마무리
- 브랜치 `feature/jaemun-ai-gemini`, lint·tsc·테스트·build 통과
- PR 에: 바뀐 파일, 고른 모델 이름, 실제 호출로 확인한 것/못 한 것, Vercel 에 넣을 환경변수
- 로컬에 Gemini 키가 없으면 가짜 응답 테스트만 하고, 실제 호출 확인은 팀장님께 부탁한다고 적기
