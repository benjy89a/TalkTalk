# [E 재문] 관리자 페이지에서 AI 업체 전환 (A안 · 팀장 요청 11/24)

> 사용법: 이 파일 내용을 통째로 Claude 에 붙여넣으세요. **오늘 안에 못 끝내면 C안(Vercel 직접 변경)으로 갑니다.**

## 전제 (팀장 완료)
- `supabase/migrations/007_ai_settings.sql` (PR #97): `ai_settings` 한 줄 테이블 + `admin_set_ai_settings(provider, model)`
  - `ai_provider`: `'exaone' | 'gemini' | null`(null = 환경변수 `AI_PROVIDER` 따르기), `gemini_model`: 모델 ID 또는 null
  - 읽기: 로그인 사용자 누구나 / 바꾸기: 서비스 관리자만, rpc 로만 (`updated_by`·`updated_at` 자동)
  - 타입: `import type { AiSettings } from "@/types/database"`
- **API 키는 DB 에 없습니다.** Vercel 환경변수(`EXAONE_API_KEY`, `GEMINI_API_KEY`)에 둘 다 있습니다.

## 할 일
1. **서버(`app/api/ai/provider.ts` 등):** 요청마다 `ai_settings` 를 읽어 `ai_provider` 가 있으면 그걸, 없거나 읽기 실패면 지금처럼 환경변수로 고른다.
   `gemini_model` 이 있으면 `GEMINI_MODEL` 보다 우선. 서버 클라이언트(`@/lib/supabase/server`)로 읽는다.
2. **관리자 AI 설정 탭(`components/search/AiKeyStatus.tsx` 등):** "EXAONE / Gemini / 환경변수 따르기" 선택 + (선택) Gemini 모델 입력 →
   `supabase.rpc("admin_set_ai_settings", { provider, model })`. 지금 값·바꾼 시각을 보여 준다.
3. **키 없는 업체로 전환 막기:** 관리자용 `/api/ai/status` 응답에 업체별 키 설정 여부(`exaone`/`gemini` 각각 true/false, **값 아님**)를 추가하고,
   키가 없는 업체 버튼은 비활성 + "Vercel 에 GEMINI_API_KEY 가 없습니다" 안내.
4. 바꾼 뒤 `✨ AI 도구 (모델명)` 버튼이 새로 고침 없이 또는 새로 고침 한 번으로 바뀌는지 확인 (`useAiProviderInfo` 캐시 주의).

## 하지 말 것
- 키 값을 DB·화면·응답·로그에 넣기 / 키 입력 칸 만들기
- `supabase/`, `types/`, `.env.example`, `package.json` 수정 (팀장 담당)
- `app/api/ai/`, `components/search/` 밖 수정

## 마무리
- 브랜치 `feature/jaemun-ai-settings`, lint·tsc·테스트·build 통과
- 테스트: DB 값 우선 / null·읽기 실패 시 환경변수 / 키 없는 업체 차단
- PR 에: 관리자 화면에서 EXAONE ↔ Gemini 전환해 본 결과 (007 SQL 실행 후)
