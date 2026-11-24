// 관리자 AI 설정(DB `ai_settings`, 007 마이그레이션)을 서버에서 읽는다.
// 저장하는 것은 "어느 업체·모델을 쓸지" 뿐이며 API 키는 DB에 없다(Vercel 환경변수 EXAONE_API_KEY·GEMINI_API_KEY).
// 읽기는 로그인한 사용자의 세션으로 한다(RLS: 로그인한 누구나 읽기). 못 읽으면(테이블 없음·로그인 안 함·오류) 환경변수로 동작한다.
//
// 이 파일은 provider.ts 를 타입으로만 가져온다(확장자 없는 import 와 node --test 가 함께 쓰이도록).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { AiSettingsOverride } from "./provider";

export type AiSettingsState =
  /** 설정 한 줄을 읽었다. override.provider 가 null 이면 환경변수를 따른다. */
  | { ok: true; override: AiSettingsOverride; updatedAt: string | null }
  /** 못 읽었다(007 미적용·로그인 안 함·DB 오류). 환경변수로 동작한다. */
  | { ok: false };

/** 읽은 값을 서버 인스턴스 메모리에 잠깐 둔다. 다른 인스턴스에는 최대 이 시간 뒤에 반영된다. */
export const AI_SETTINGS_CACHE_MS = 10_000;

let cache: { at: number; state: AiSettingsState & { ok: true } } | null = null;

/** 관리자가 설정을 바꾼 직후 이 인스턴스의 캐시를 비운다. */
export function invalidateAiSettingsCache() {
  cache = null;
}

type ClientFactory = () => Promise<SupabaseClient<Database>>;

/**
 * 설정을 읽는다. 성공한 값만 캐시한다 — 실패(특히 로그인 안 한 요청의 빈 결과)를 캐시하면
 * 그 사이 로그인한 사용자의 요청까지 환경변수로 돌아가는 일이 생기기 때문이다.
 */
export async function loadAiSettings(
  createClient: ClientFactory,
  options: { now?: () => number; /** true 면 캐시를 쓰지 않고 DB 에서 바로 읽는다(관리자 화면이 방금 저장한 값을 보게) */ fresh?: boolean } = {},
): Promise<AiSettingsState> {
  const time = (options.now ?? Date.now)();
  if (!options.fresh && cache && time - cache.at < AI_SETTINGS_CACHE_MS) return cache.state;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.from("ai_settings").select("ai_provider, gemini_model, updated_at").maybeSingle();
    if (error || !data) return { ok: false };
    const state: AiSettingsState & { ok: true } = {
      ok: true,
      override: {
        // DB 제약이 'exaone'/'gemini'/null 만 허용하지만, 다른 값이 와도 환경변수로 돌아가도록 한 번 더 거른다.
        provider: data.ai_provider === "exaone" || data.ai_provider === "gemini" ? data.ai_provider : null,
        geminiModel: typeof data.gemini_model === "string" && data.gemini_model.trim() ? data.gemini_model.trim() : null,
      },
      updatedAt: typeof data.updated_at === "string" ? data.updated_at : null,
    };
    cache = { at: time, state };
    return state;
  } catch {
    return { ok: false };
  }
}

/** resolveAiProvider 에 넘길 값. 못 읽었으면 null(환경변수 사용). */
export function overrideOf(state: AiSettingsState): AiSettingsOverride | null {
  return state.ok ? state.override : null;
}
