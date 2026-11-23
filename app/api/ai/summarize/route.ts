// POST /api/ai/summarize: { channelId, limit? } 또는 { messages: string[] }
// 서버에서만 EXAONE 키를 읽는다. 인증·권한 검사를 통과한 요청만 요약한다.
import { createClient } from "@/lib/supabase/server";
import { createExaoneSummary, handleSummarize } from "./handler";

// 내부 대기 240초에 인증·DB 조회·응답 처리 여유를 둔다. 배포 환경의 지원 한도는 별도 확인한다.
export const maxDuration = 300;

export async function POST(request: Request) {
  return handleSummarize(request, createClient, createExaoneSummary({
    apiKey: process.env.EXAONE_API_KEY,
  }));
}
