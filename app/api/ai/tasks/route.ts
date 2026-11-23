// POST /api/ai/tasks: { channelId, limit? }
// 실제 AI 추출은 미연결. UI 조립·DB 스키마·업무 저장은 이 API 범위가 아니다.
import { createClient } from "@/lib/supabase/server";
import { handleExtractTasks } from "../extra";

export async function POST(request: Request) {
  return handleExtractTasks(request, createClient);
}
