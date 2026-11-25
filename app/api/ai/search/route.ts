// POST /api/ai/search: { query, channelId?, limit? }
// AI(AI_PROVIDER: EXAONE 기본/Gemini)는 검색 조건만 해석한다. 실제 결과는 로그인 RLS 범위의 DB 메시지다.
import { createClient } from "@/lib/supabase/server";
import { createAiExtra, handleNaturalSearch } from "../extra";
import { aiRateLimiter } from "../rateLimit";
import { currentAiProvider } from "../currentProvider";

// 업체 응답 대기 240초에 인증·DB 검색·응답 처리 여유를 둔다.
export const maxDuration = 300;

export async function POST(request: Request) {
  const provider = await currentAiProvider(); // 관리자 설정(DB) → 환경변수 순
  return handleNaturalSearch(request, createClient, createAiExtra({ apiKey: provider.apiKey, provider }).interpret, aiRateLimiter);
}
