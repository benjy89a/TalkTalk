// POST /api/ai/summarize: { channelId, limit? } 또는 { messages: string[] }
// 현재는 입력·로그인·권한·대화 조회까지만 수행하고 AI 미연결을 안내한다.
import { createClient } from "@/lib/supabase/server";
import { handleSummarize } from "./handler";

export async function POST(request: Request) {
  return handleSummarize(request, createClient);
}
