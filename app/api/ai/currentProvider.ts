// route 들이 "이번 요청에 쓸 AI 업체"를 한 줄로 얻는 서버 전용 도우미.
// 관리자 설정(DB)이 있으면 그것, 없거나 못 읽으면 환경변수(AI_PROVIDER)·기본값으로 고른다.
import { createClient } from "@/lib/supabase/server";
import { loadAiSettings, overrideOf } from "./aiSettings";
import { resolveAiProvider, type ResolvedAiProvider } from "./provider";

export async function currentAiProvider(): Promise<ResolvedAiProvider> {
  return resolveAiProvider(process.env, overrideOf(await loadAiSettings(createClient)));
}
