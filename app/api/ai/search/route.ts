// POST /api/ai/search: { query, channelId?, limit? }
// EXAONE은 검색 조건만 해석한다. 실제 결과는 로그인 RLS 범위의 DB 메시지다.
import { createClient } from "@/lib/supabase/server";
import { createExaoneExtra, handleNaturalSearch } from "../extra";

export async function POST(request: Request) {
  return handleNaturalSearch(request, createClient, createExaoneExtra({ apiKey: process.env.EXAONE_API_KEY }).interpret);
}
