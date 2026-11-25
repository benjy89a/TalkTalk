// POST /api/ai/tasks: { channelId, limit? }
// AI(AI_PROVIDER: EXAONE 기본/Gemini)로 추출하되 원문 근거를 검증한다. DB 업무 저장·자동 배정은 하지 않는다.
import { createClient } from "@/lib/supabase/server";
import { createAiExtra, handleExtractTasks } from "../extra";
import { aiRateLimiter } from "../rateLimit";
import { currentAiProvider } from "../currentProvider";

// 무료 API의 느린 생성 속도를 감안해 배포 함수 실행 한도를 명시한다.
// 300초는 현재 Vercel Hobby의 기본값이자 최대값이며, 코드 내부 대기 제한은 240초로 둔다.
export const maxDuration = 300;

export async function POST(request: Request) {
  const provider = await currentAiProvider(); // 관리자 설정(DB) → 환경변수 순
  return handleExtractTasks(request, createClient, createAiExtra({ apiKey: provider.apiKey, provider }).extract, aiRateLimiter);
}
