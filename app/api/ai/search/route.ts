// POST /api/ai/search: { query, channelId?, limit? }
// EXAONE은 검색 조건만 해석한다. 실제 결과는 로그인 RLS 범위의 DB 메시지다.
import { createClient } from "@/lib/supabase/server";
import { createExaoneExtra, handleNaturalSearch } from "../extra";

// 업체 응답 대기 240초에 인증·DB 검색·응답 처리 여유를 둔다.
export const maxDuration = 300;

export async function POST(request: Request) {
  return handleNaturalSearch(request, createClient, createExaoneExtra({ apiKey: process.env.EXAONE_API_KEY }).interpret);
}
