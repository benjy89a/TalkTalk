// GET  /api/ai/status → { provider, providerId, model, keyEnvName, keyConfigured }  (서비스 관리자만)
// GET  /api/ai/status?view=public → { provider, providerId, model }  (로그인한 누구나, 안내 문구용 업체·모델 이름만)
// POST /api/ai/status → { ok, ms } | { ok: false, message }  (버튼을 눌렀을 때만, 1회 호출)
import { createClient } from "@/lib/supabase/server";
import { createAiSummary } from "../summarize/handler";
import { resolveAiProvider, type ResolvedAiProvider } from "../provider";
import { handleStatusGet, handleStatusPost, type StatusConfig } from "./handler";

export const maxDuration = 300;

// 키 값은 담지 않는다. 키 환경변수의 "이름"과 설정 여부만 알린다.
function config(provider: ResolvedAiProvider): StatusConfig {
  return {
    provider: provider.displayName,
    providerId: provider.id,
    model: provider.model,
    keyEnvName: provider.envKeyName,
    keyConfigured: !!provider.apiKey,
  };
}

export async function GET(request: Request) {
  return handleStatusGet(request, createClient, config(resolveAiProvider()));
}

export async function POST(request: Request) {
  const provider = resolveAiProvider();
  const generate = createAiSummary({ apiKey: provider.apiKey, provider });
  return handleStatusPost(request, createClient, config(provider), (signal) => generate(["연결 테스트입니다."], signal));
}
