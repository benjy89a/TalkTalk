// POST /api/ai/summarize: { channelId, limit? } 또는 { messages: string[] }
// 서버에서만 AI 키를 읽는다(AI_PROVIDER 로 EXAONE/Gemini 선택, 기본 EXAONE). 인증·권한 검사를 통과한 요청만 요약한다.
import { createClient } from "@/lib/supabase/server";
import { resolveAiProvider } from "../provider";
import { createAiSummary, handleSummarize } from "./handler";

// 내부 대기 240초에 인증·DB 조회·응답 처리 여유를 둔다. 배포 환경의 지원 한도는 별도 확인한다.
export const maxDuration = 300;

export async function POST(request: Request) {
  const provider = resolveAiProvider();
  return handleSummarize(request, createClient, createAiSummary({ apiKey: provider.apiKey, provider }));
}
