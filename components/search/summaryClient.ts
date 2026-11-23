export class SummaryRequestError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export async function requestChannelSummary(
  channelId: string,
  limit: number,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<string> {
  const response = await fetcher("/api/ai/summarize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({ channelId, limit }),
    signal,
  });
  const body: unknown = await response.json();
  signal.throwIfAborted();
  if (!response.ok) {
    if (body && typeof body === "object" && "error" in body) {
      const error = body.error;
      if (error && typeof error === "object" && "code" in error && "message" in error
        && typeof error.code === "string" && typeof error.message === "string") {
        throw new SummaryRequestError(error.code, error.message);
      }
    }
    throw new SummaryRequestError("REQUEST_FAILED", "요약을 요청하지 못했습니다. 다시 시도해 주세요.");
  }
  if (!body || typeof body !== "object" || !("summary" in body)
    || typeof body.summary !== "string" || !body.summary.trim()) {
    throw new SummaryRequestError("INVALID_RESPONSE", "요약 응답을 확인하지 못했습니다.");
  }
  return body.summary.trim();
}
