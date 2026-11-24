import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

// 관리자 전용 AI 상태 확인. 키 값·길이·앞뒤 글자는 어떤 응답에도 넣지 않는다.
export type StatusConfig = {
  /** 화면에 보이는 업체 이름(EXAONE · Gemini) */
  provider: string;
  /** AI_PROVIDER 로 고른 값(exaone · gemini) */
  providerId?: string;
  model?: string;
  /** 키를 읽는 환경변수의 "이름"(값이 아님). 키가 없을 때 무엇을 넣어야 하는지 안내용 */
  keyEnvName?: string;
  keyConfigured: boolean;
  /** 관리자 업체 선택 상태(관리자 응답에만 담는다) */
  selection?: StatusSelection;
  /** 업체별 키 설정 여부(키 값 없음). 키가 없는 업체로는 전환을 막는 데 쓴다 */
  providers?: StatusProvider[];
};

export type StatusProvider = { id: string; displayName: string; keyEnvName: string; keyConfigured: boolean; defaultModel: string };

export type StatusSelection = {
  /** 지금 적용 중인 선택의 출처: settings(관리자 설정) · env(환경변수) */
  source: "settings" | "env";
  /** DB 에 저장된 업체(null = 환경변수 따르기, 못 읽었으면 null) */
  provider: "exaone" | "gemini" | null;
  /** DB 에 저장된 Gemini 모델(null = 환경변수·기본 모델) */
  geminiModel: string | null;
  updatedAt: string | null;
  /** 환경변수(AI_PROVIDER)가 가리키는 업체 */
  envProviderId: "exaone" | "gemini";
  /** 설정 테이블을 읽을 수 있는가(007 적용 여부) */
  settingsAvailable: boolean;
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

/** 로그인만 확인한다(안내 문구용 업체·모델 이름처럼 비밀이 아닌 값을 보여 줄 때). */
async function requireLogin(createClient: () => Promise<SupabaseClient<Database>>): Promise<Response | null> {
  let supabase: SupabaseClient<Database>;
  try {
    supabase = await createClient();
  } catch {
    return fail(503, "SERVICE_NOT_CONFIGURED", "서버 연결 설정을 확인해 주세요.");
  }
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return fail(401, "UNAUTHORIZED", "로그인한 뒤 다시 시도해 주세요.");
  return null;
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
  request: Request,
  createClient: () => Promise<SupabaseClient<Database>>,
  config: StatusConfig,
): Promise<Response> {
  // ?view=public: 로그인한 누구나 업체·모델 "이름"만 본다(화면 안내문이 실제 업체를 가리키도록). 키 설정 여부는 관리자만.
  let publicView = false;
  try { publicView = new URL(request.url).searchParams.get("view") === "public"; } catch { /* 잘못된 주소는 관리자 전용 응답으로 */ }
  const denied = publicView ? await requireLogin(createClient) : await requireAdmin(createClient);
  if (denied) return denied;
  // 필드를 하나씩 골라 담아 키 관련 정보가 섞이지 않게 한다.
  const base = {
    provider: config.provider,
    ...(config.providerId ? { providerId: config.providerId } : {}),
    ...(config.model ? { model: config.model } : {}),
  };
  if (publicView) return json(base);
  return json({
    ...base,
    ...(config.keyEnvName ? { keyEnvName: config.keyEnvName } : {}),
    keyConfigured: config.keyConfigured === true,
    ...(config.selection ? { selection: config.selection } : {}),
    ...(config.providers ? { providers: config.providers.map((item) => ({
      id: item.id, displayName: item.displayName, keyEnvName: item.keyEnvName,
      keyConfigured: item.keyConfigured === true, defaultModel: item.defaultModel,
    })) } : {}),
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

// ───────── 관리자 업체 선택 저장 (PUT) ─────────

const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
type ProviderChoice = "exaone" | "gemini" | null;

/** 저장 실패의 종류. DB 오류 원문은 응답에 넣지 않고 종류만 구분한다. */
export class SettingsSaveError extends Error {
  kind: "forbidden" | "not_ready" | "invalid" | "failed";
  constructor(kind: SettingsSaveError["kind"]) {
    super(kind);
    this.kind = kind;
  }
}

/** supabase rpc 오류를 종류로 나눈다(원문 메시지는 버린다). */
export function classifySettingsError(error: { code?: string; message?: string } | null | undefined): SettingsSaveError {
  const code = error?.code ?? "";
  const message = error?.message ?? "";
  // 007 을 아직 실행하지 않아 함수·테이블이 없을 때
  if (["42883", "42P01", "PGRST202", "PGRST205"].includes(code)) return new SettingsSaveError("not_ready");
  if (code === "42501" || message.includes("서비스 관리자만")) return new SettingsSaveError("forbidden");
  if (message.includes("AI 업체는") || message.includes("모델 이름 형식")) return new SettingsSaveError("invalid");
  return new SettingsSaveError("failed");
}

export type SettingsSaver = (provider: ProviderChoice, model: string | null) => Promise<{ updatedAt: string | null }>;

export type SaveContext = {
  /** 환경변수(AI_PROVIDER)가 가리키는 업체: "환경변수 따르기"를 고르면 실제로 쓰게 되는 업체 */
  envProviderId: "exaone" | "gemini";
  /** 업체별 표시 이름·키 환경변수 이름·키 설정 여부(키 값은 모른다) */
  providers: StatusProvider[];
  save: SettingsSaver;
  /** 저장 성공 뒤 이 서버 인스턴스의 설정 캐시를 비운다 */
  invalidate: () => void;
};

function parseSaveBody(text: string): { provider: ProviderChoice; model: string | null } | null {
  let value: unknown;
  try { value = JSON.parse(text); } catch { return null; }
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (Object.keys(body).some((key) => key !== "provider" && key !== "model") || !("provider" in body)) return null;
  const provider = body.provider;
  if (!(provider === null || provider === "exaone" || provider === "gemini")) return null;
  const rawModel = body.model;
  if (!(rawModel === undefined || rawModel === null || typeof rawModel === "string")) return null;
  const model = typeof rawModel === "string" && rawModel.trim() ? rawModel.trim() : null;
  if (model !== null && !MODEL_ID.test(model)) return null;
  return { provider, model };
}

/**
 * PUT /api/ai/status: { provider: 'exaone'|'gemini'|null, model?: string|null }  (서비스 관리자만)
 * - provider null = 환경변수 따르기. model 은 Gemini 모델 ID(비우면 환경변수·기본 모델). 업체만 바꿀 때도 현재 모델을 함께 보낸다
 *   (DB 함수 admin_set_ai_settings 가 호출할 때마다 모델 칸을 덮어쓰기 때문).
 * - **고른 업체의 키가 서버에 없으면 저장하지 않고 409로 막는다.** "환경변수 따르기"도 그 환경변수가 가리키는 업체의 키가 있어야 한다.
 */
export async function handleStatusPut(
  request: Request,
  createClient: () => Promise<SupabaseClient<Database>>,
  context: SaveContext,
): Promise<Response> {
  const denied = await requireAdmin(createClient);
  if (denied) return denied;
  let text: string;
  try { text = await request.text(); } catch { return fail(400, "INVALID_INPUT", "요청을 읽지 못했습니다."); }
  if (text.length > 1024) return fail(413, "INPUT_TOO_LARGE", "요청이 너무 깁니다.");
  const parsed = parseSaveBody(text);
  if (!parsed) {
    return fail(400, "INVALID_INPUT", "업체는 exaone·gemini·null 중 하나, 모델은 영문·숫자·점·밑줄·하이픈 64자 이하여야 합니다.");
  }
  // 전환 뒤 실제로 쓰게 될 업체의 키가 있는지 확인한다.
  const effective = parsed.provider ?? context.envProviderId;
  const target = context.providers.find((item) => item.id === effective);
  if (!target || target.keyConfigured !== true) {
    const name = target?.displayName ?? effective;
    const envName = target?.keyEnvName ?? "API 키";
    return fail(409, "KEY_NOT_CONFIGURED", parsed.provider === null
      ? `환경변수 AI_PROVIDER 가 가리키는 ${name}의 키(${envName})가 서버에 없어 "환경변수 따르기"로 바꿀 수 없습니다. Vercel 환경변수에 키를 넣고 다시 배포한 뒤 선택해 주세요.`
      : `${name} 키(${envName})가 서버에 없어 전환할 수 없습니다. Vercel 환경변수에 키를 넣고 다시 배포한 뒤 선택해 주세요.`);
  }
  try {
    const saved = await context.save(parsed.provider, parsed.model);
    context.invalidate();
    return json({ ok: true, provider: parsed.provider, model: parsed.model, updatedAt: saved.updatedAt });
  } catch (error) {
    const kind = error instanceof SettingsSaveError ? error.kind : "failed";
    if (kind === "not_ready") {
      return fail(503, "SETTINGS_NOT_READY", "AI 설정 테이블(007 마이그레이션)이 아직 적용되지 않았습니다. 팀장이 Supabase에서 007_ai_settings.sql 을 실행한 뒤 다시 시도해 주세요.");
    }
    if (kind === "forbidden") return fail(403, "FORBIDDEN", "서비스 관리자만 바꿀 수 있습니다.");
    if (kind === "invalid") return fail(400, "INVALID_INPUT", "업체 또는 모델 이름 형식이 올바르지 않습니다.");
    // DB 오류 원문은 응답에 넣지 않는다.
    return fail(500, "DATABASE_ERROR", "설정을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
}
