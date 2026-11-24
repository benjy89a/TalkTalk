// GET  /api/ai/status → { provider, providerId, model, keyEnvName, keyConfigured, selection, providers }  (서비스 관리자만)
// GET  /api/ai/status?view=public → { provider, providerId, model }  (로그인한 누구나, 안내 문구용 업체·모델 이름만)
// PUT  /api/ai/status { provider: 'exaone'|'gemini'|null, model? } → 관리자 업체 선택 저장 (키가 없는 업체로는 막음)
// POST /api/ai/status → { ok, ms } | { ok: false, message }  (버튼을 눌렀을 때만, 1회 호출)
//
// 업체 선택은 DB `ai_settings`(007)에 저장하고, 없으면 환경변수 AI_PROVIDER 를 따른다. API 키는 DB에 저장하지 않는다.
import { createClient } from "@/lib/supabase/server";
import { createAiSummary } from "../summarize/handler";
import { invalidateAiSettingsCache, loadAiSettings, overrideOf } from "../aiSettings";
import { isProviderKeyConfigured, listProviderOptions, parseProviderId, resolveAiProvider, type ResolvedAiProvider } from "../provider";
import { classifySettingsError, handleStatusGet, handleStatusPost, handleStatusPut, type StatusConfig } from "./handler";

export const maxDuration = 300;

/** 지금 적용되는 업체(DB 설정 → 환경변수)와 관리자 화면용 선택 상태. 키 값은 담지 않는다. */
async function currentStatus(fresh: boolean): Promise<{ provider: ResolvedAiProvider; config: StatusConfig }> {
  const state = await loadAiSettings(createClient, { fresh });
  const provider = resolveAiProvider(process.env, overrideOf(state));
  const settingsProvider = state.ok ? state.override.provider : null;
  return {
    provider,
    config: {
      provider: provider.displayName,
      providerId: provider.id,
      model: provider.model,
      keyEnvName: provider.envKeyName,
      keyConfigured: isProviderKeyConfigured(provider.id),
      selection: {
        source: settingsProvider ? "settings" : "env",
        provider: settingsProvider,
        geminiModel: state.ok ? state.override.geminiModel : null,
        updatedAt: state.ok ? state.updatedAt : null,
        envProviderId: parseProviderId(process.env.AI_PROVIDER),
        settingsAvailable: state.ok,
      },
      providers: listProviderOptions(process.env),
    },
  };
}

export async function GET(request: Request) {
  // 관리자 화면은 방금 저장한 값을 바로 봐야 하므로 캐시 없이 읽고, 안내 문구용 공개 보기는 캐시를 쓴다.
  let publicView = false;
  try { publicView = new URL(request.url).searchParams.get("view") === "public"; } catch { /* 관리자 전용으로 */ }
  const { config } = await currentStatus(!publicView);
  return handleStatusGet(request, createClient, config);
}

export async function PUT(request: Request) {
  return handleStatusPut(request, createClient, {
    envProviderId: parseProviderId(process.env.AI_PROVIDER),
    providers: listProviderOptions(process.env),
    save: async (provider, model) => {
      const supabase = await createClient();
      const { data, error } = await supabase.rpc("admin_set_ai_settings", { provider, model });
      if (error) throw classifySettingsError(error);
      return { updatedAt: data?.updated_at ?? null };
    },
    invalidate: invalidateAiSettingsCache,
  });
}

export async function POST(request: Request) {
  const { provider, config } = await currentStatus(true);
  const generate = createAiSummary({ apiKey: provider.apiKey, provider });
  return handleStatusPost(request, createClient, config, (signal) => generate(["연결 테스트입니다."], signal));
}
