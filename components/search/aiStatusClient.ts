export type AiStatus = { provider: string; model?: string; keyConfigured: boolean };
export type AiProbeResult = { ok: true; ms: number } | { ok: false; message: string };

export class AiStatusError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function call(method: "GET" | "POST", signal: AbortSignal, fetcher: typeof fetch): Promise<unknown> {
  signal.throwIfAborted();
  const response = await fetcher("/api/ai/status", { method, credentials: "same-origin", cache: "no-store", signal });
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
    || !(body.model === undefined || typeof body.model === "string")) {
    throw new AiStatusError("INVALID_RESPONSE", "응답 형식을 확인하지 못했어요.");
  }
  return { provider: body.provider, model: body.model, keyConfigured: body.keyConfigured };
}

export async function requestAiProbe(signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<AiProbeResult> {
  const body = await call("POST", signal, fetcher);
  if (object(body) && body.ok === true && typeof body.ms === "number" && Number.isFinite(body.ms)) {
    return { ok: true, ms: body.ms };
  }
  if (object(body) && body.ok === false) return { ok: false, message: "연결에 실패했어요." };
  throw new AiStatusError("INVALID_RESPONSE", "응답 형식을 확인하지 못했어요.");
}
