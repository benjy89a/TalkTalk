import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// 관리자 전용 AI 상태 확인. 키 값·길이·앞뒤 글자는 어떤 응답에도 넣지 않는다.
export type StatusConfig = {
  provider: string;
  model?: string;
  keyConfigured: boolean;
};
/** 연결 테스트용. 성공하면 반환, 실패하면 throw. 호출은 POST일 때만 한다. */
export type ConnectionProbe = (signal: AbortSignal) => Promise<unknown>;

const HEADERS = { "Cache-Control": "no-store" };

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: HEADERS });
}

function fail(status: number, code: string, message: string) {
  return json({ error: { code, message } }, status);
}

async function requireAdmin(createClient: () => Promise<SupabaseClient<Database>>): Promise<Response | null> {
  let supabase: SupabaseClient<Database>;
  try {
    supabase = await createClient();
  } catch {
    return fail(503, "SERVICE_NOT_CONFIGURED", "서버 연결 설정을 확인해 주세요.");
  }
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return fail(401, "UNAUTHORIZED", "로그인한 뒤 다시 시도해 주세요.");
  const { data: isAdmin, error: adminError } = await supabase.rpc("is_app_admin");
  if (adminError) return fail(500, "DATABASE_ERROR", "관리자 권한을 확인하지 못했습니다.");
  if (isAdmin !== true) return fail(403, "FORBIDDEN", "서비스 관리자만 볼 수 있습니다.");
  return null;
}

export async function handleStatusGet(
  _request: Request,
  createClient: () => Promise<SupabaseClient<Database>>,
  config: StatusConfig,
): Promise<Response> {
  const denied = await requireAdmin(createClient);
  if (denied) return denied;
  // 필드를 하나씩 골라 담아 키 관련 정보가 섞이지 않게 한다.
  return json({
    provider: config.provider,
    ...(config.model ? { model: config.model } : {}),
    keyConfigured: config.keyConfigured === true,
  });
}

export async function handleStatusPost(
  request: Request,
  createClient: () => Promise<SupabaseClient<Database>>,
  config: StatusConfig,
  probe: ConnectionProbe,
  now: () => number = Date.now,
): Promise<Response> {
  const denied = await requireAdmin(createClient);
  if (denied) return denied;
  // 키가 없으면 외부 호출 없이 실패로 답한다.
  if (!config.keyConfigured) return json({ ok: false, message: "연결에 실패했어요." });
  const start = now();
  try {
    await probe(request.signal);
    return json({ ok: true, ms: Math.max(0, Math.round(now() - start)) });
  } catch {
    // 업체 오류 원문·키는 응답에 넣지 않고 재시도도 하지 않는다.
    return json({ ok: false, message: "연결에 실패했어요." });
  }
}
