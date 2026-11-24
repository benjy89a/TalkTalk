/** 관리자 화면용 상태. keyEnvName 은 키를 넣을 환경변수의 "이름"이다(값이 아님). */
export type AiProviderId = "exaone" | "gemini";
/** 관리자 업체 선택 상태(서버 /api/ai/status 의 selection). 키 값은 없다. */
export type AiStatusSelection = {
  /** 지금 적용 중인 선택의 출처: 관리자 설정(settings) · 환경변수(env) */
  source: "settings" | "env";
  /** DB 에 저장된 업체(null = 환경변수 따르기) */
  provider: AiProviderId | null;
  /** DB 에 저장된 Gemini 모델(null = 환경변수·기본 모델) */
  geminiModel: string | null;
  updatedAt: string | null;
  /** 환경변수(AI_PROVIDER)가 가리키는 업체 */
  envProviderId: AiProviderId;
  /** 설정 테이블(007)을 읽을 수 있는가 */
  settingsAvailable: boolean;
};
/** 업체별 키 환경변수 이름·설정 여부(키 값 아님)·기본 모델 */
export type AiProviderOption = { id: AiProviderId; displayName: string; keyEnvName: string; keyConfigured: boolean; defaultModel: string };
export type AiStatus = {
  provider: string; providerId?: string; model?: string; keyEnvName?: string; keyConfigured: boolean;
  selection?: AiStatusSelection; providers?: AiProviderOption[];
};
/** 로그인한 누구나 받는 업체·모델 이름(안내 문구용). */
export type AiProviderInfo = { provider: string; providerId?: string; model?: string };
export type AiProbeResult = { ok: true; ms: number } | { ok: false; message: string };

export class AiStatusError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
const optionalString = (value: unknown) => value === undefined || typeof value === "string";
const providerId = (value: unknown): value is AiProviderId => value === "exaone" || value === "gemini";

function parseSelection(value: unknown): AiStatusSelection | null {
  if (!object(value)) return null;
  if (!(value.source === "settings" || value.source === "env") || !providerId(value.envProviderId)
    || !(value.provider === null || providerId(value.provider))
    || !(value.geminiModel === null || typeof value.geminiModel === "string")
    || !(value.updatedAt === null || typeof value.updatedAt === "string")
    || typeof value.settingsAvailable !== "boolean") return null;
  return {
    source: value.source, provider: value.provider, geminiModel: value.geminiModel, updatedAt: value.updatedAt,
    envProviderId: value.envProviderId, settingsAvailable: value.settingsAvailable,
  };
}

function parseProviders(value: unknown): AiProviderOption[] | null {
  if (!Array.isArray(value) || value.length > 4) return null;
  const list: AiProviderOption[] = [];
  for (const item of value) {
    if (!object(item) || !providerId(item.id) || typeof item.displayName !== "string" || typeof item.keyEnvName !== "string"
      || typeof item.keyConfigured !== "boolean" || typeof item.defaultModel !== "string") return null;
    list.push({ id: item.id, displayName: item.displayName, keyEnvName: item.keyEnvName, keyConfigured: item.keyConfigured, defaultModel: item.defaultModel });
  }
  return list;
}

async function call(method: "GET" | "POST", signal: AbortSignal, fetcher: typeof fetch, query = ""): Promise<unknown> {
  signal.throwIfAborted();
  const response = await fetcher("/api/ai/status" + query, { method, credentials: "same-origin", cache: "no-store", signal });
  let body: unknown;
  try { body = await response.json(); } catch {
    signal.throwIfAborted();
    throw new AiStatusError("REQUEST_FAILED", "상태를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
  signal.throwIfAborted();
  if (!response.ok) {
    if (response.status === 401) throw new AiStatusError("UNAUTHORIZED", "로그인한 뒤 다시 시도해 주세요.");
    if (response.status === 403) throw new AiStatusError("FORBIDDEN", "서비스 관리자만 볼 수 있어요.");
    throw new AiStatusError("REQUEST_FAILED", "상태를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
  return body;
}

export async function fetchAiStatus(signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<AiStatus> {
  const body = await call("GET", signal, fetcher);
  if (!object(body) || typeof body.provider !== "string" || typeof body.keyConfigured !== "boolean"
    || !optionalString(body.model) || !optionalString(body.providerId) || !optionalString(body.keyEnvName)) {
    throw new AiStatusError("INVALID_RESPONSE", "응답 형식을 확인하지 못했어요.");
  }
  // 이전 응답(providerId·keyEnvName 없음)과 같은 모양을 유지하고, 있을 때만 덧붙인다.
  const selection = body.selection === undefined ? undefined : parseSelection(body.selection);
  const providers = body.providers === undefined ? undefined : parseProviders(body.providers);
  if (selection === null || providers === null) throw new AiStatusError("INVALID_RESPONSE", "응답 형식을 확인하지 못했어요.");
  return {
    provider: body.provider, model: body.model, keyConfigured: body.keyConfigured,
    ...(body.providerId !== undefined ? { providerId: body.providerId } : {}),
    ...(body.keyEnvName !== undefined ? { keyEnvName: body.keyEnvName } : {}),
    ...(selection !== undefined ? { selection } : {}),
    ...(providers !== undefined ? { providers } : {}),
  };
}

/** 안내 문구에 쓸 업체·모델 이름. 로그인만 되어 있으면 읽을 수 있다(키 정보는 없음). */
export async function fetchAiProviderInfo(signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<AiProviderInfo> {
  const body = await call("GET", signal, fetcher, "?view=public");
  if (!object(body) || typeof body.provider !== "string" || !body.provider.trim() || body.provider.length > 40
    || !optionalString(body.model) || !optionalString(body.providerId)) {
    throw new AiStatusError("INVALID_RESPONSE", "응답 형식을 확인하지 못했어요.");
  }
  return {
    provider: body.provider.trim(), model: body.model,
    ...(body.providerId !== undefined ? { providerId: body.providerId } : {}),
  };
}

export async function requestAiProbe(signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<AiProbeResult> {
  const body = await call("POST", signal, fetcher);
  if (object(body) && body.ok === true && typeof body.ms === "number" && Number.isFinite(body.ms)) {
    return { ok: true, ms: body.ms };
  }
  if (object(body) && body.ok === false) return { ok: false, message: "연결에 실패했어요." };
  throw new AiStatusError("INVALID_RESPONSE", "응답 형식을 확인하지 못했어요.");
}

/** 안내문에 넣을 전송 대상: 이름을 알면 "외부 AI 서비스(Gemini)", 모르면 "외부 AI 서비스". 뒤에 "로"를 붙여 쓴다. */
export function aiTargetText(label: string | null): string {
  return label ? `외부 AI 서비스(${label})` : "외부 AI 서비스";
}

/**
 * 대기 안내 문구. EXAONE 은 느려서 "최대 4분"(기존 문구 그대로), Gemini 는 보통 몇 초라 그에 맞게 안내한다.
 * 서버가 기다려 주는 최대 시간은 두 업체 모두 4분으로 같다. 업체를 모르면(아직 못 받았거나 실패) 기존 EXAONE 문구.
 * @param elapsedMs 지금까지 걸린 시간(밀리초). Gemini 가 평소보다 오래 걸릴 때 안내를 바꾼다.
 */
export function aiWaitHint(providerId: string | undefined, elapsedMs = 0): { progress: string; detail: string } {
  if (providerId === "gemini") {
    // detail 은 시간이 지나도 다시 그려지지 않는 안내문이라 시간과 무관하게 두 경우를 모두 담는다. progress 만 시간에 따라 바뀐다.
    const detail = "AI 응답은 보통 몇 초 안에 도착합니다. 오래 걸려도 최대 4분까지 기다리며, 취소할 수 있습니다.";
    return elapsedMs >= 20000
      ? { progress: "평소보다 오래 걸립니다 · 최대 4분 대기", detail }
      : { progress: "보통 수 초", detail };
  }
  return { progress: "AI 대기 최대 4분", detail: "AI 응답은 최대 4분 정도 기다립니다. 취소할 수 있습니다." };
}

