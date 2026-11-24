/** 관리자 화면용 상태. keyEnvName 은 키를 넣을 환경변수의 "이름"이다(값이 아님). */
export type AiStatus = { provider: string; providerId?: string; model?: string; keyEnvName?: string; keyConfigured: boolean };
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
  return {
    provider: body.provider, model: body.model, keyConfigured: body.keyConfigured,
    ...(body.providerId !== undefined ? { providerId: body.providerId } : {}),
    ...(body.keyEnvName !== undefined ? { keyEnvName: body.keyEnvName } : {}),
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
