// POST /api/ai/tasks: { channelId, limit? }
// EXAONE으로 추출하되 원문 근거를 검증한다. DB 업무 저장·자동 배정은 하지 않는다.
import { createClient } from "@/lib/supabase/server";
import { createExaoneExtra, handleExtractTasks } from "../extra";

export async function POST(request: Request) {
  return handleExtractTasks(request, createClient, createExaoneExtra({ apiKey: process.env.EXAONE_API_KEY }).extract);
}
