// GET  /api/ai/status → { provider, model?, keyConfigured }  (서비스 관리자만)
// POST /api/ai/status → { ok, ms } | { ok: false, message }  (버튼을 눌렀을 때만, 1회 호출)
import { createClient } from "@/lib/supabase/server";
import { createExaoneSummary, EXAONE_MODEL } from "../summarize/handler";
import { handleStatusGet, handleStatusPost, type StatusConfig } from "./handler";

export const maxDuration = 60;

function config(): StatusConfig {
  return { provider: "EXAONE", model: EXAONE_MODEL, keyConfigured: !!process.env.EXAONE_API_KEY };
}

export async function GET(request: Request) {
  return handleStatusGet(request, createClient, config());
}

export async function POST(request: Request) {
  const generate = createExaoneSummary({ apiKey: process.env.EXAONE_API_KEY, timeoutMs: 30000 });
  return handleStatusPost(request, createClient, config(), (signal) => generate(["연결 테스트입니다."], signal));
}
