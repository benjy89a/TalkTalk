// POST /api/ai/summarize: { channelId, limit? } 또는 { messages: string[] }
// 서버에서만 EXAONE 키를 읽는다. 인증·권한 검사를 통과한 요청만 요약한다.
import { createClient } from "@/lib/supabase/server";
import { createExaoneSummary, handleSummarize } from "./handler";

export async function POST(request: Request) {
  return handleSummarize(request, createClient, createExaoneSummary({
    apiKey: process.env.EXAONE_API_KEY,
  }));
}
