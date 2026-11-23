// POST /api/ai/search: { query, channelId?, limit? }
// 실제 AI 자연어 해석은 미연결이며, 키·호출 코드를 브라우저에 두지 않는다.
import { createClient } from "@/lib/supabase/server";
import { handleNaturalSearch } from "../extra";

export async function POST(request: Request) {
  return handleNaturalSearch(request, createClient);
}
