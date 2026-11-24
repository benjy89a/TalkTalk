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
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    signal.throwIfAborted();
    // 배포 플랫폼/프록시의 504는 HTML·일반 텍스트일 수 있다. 원문을 노출하지 않는다.
    if (response.status === 504) {
      throw new SummaryRequestError("SERVER_TIMEOUT", "서버 응답 시간이 초과됐습니다. 관리자에게 배포 실행시간 설정을 확인해 달라고 요청해 주세요.");
    }
    throw new SummaryRequestError("REQUEST_FAILED", "요약 응답을 읽지 못했습니다. 연결 상태를 확인해 주세요.");
  }
  signal.throwIfAborted();
  if (!response.ok) {
    if (body && typeof body === "object" && "error" in body) {
      const error = body.error;
      if (error && typeof error === "object" && "code" in error && "message" in error
        && typeof error.code === "string" && typeof error.message === "string") {
        throw new SummaryRequestError(error.code, error.message);
      }
    }
    if (response.status === 504) {
      throw new SummaryRequestError("SERVER_TIMEOUT", "서버 응답 시간이 초과됐습니다. 관리자에게 배포 실행시간 설정을 확인해 달라고 요청해 주세요.");
    }
    throw new SummaryRequestError("REQUEST_FAILED", "요약을 요청하지 못했습니다. 다시 시도해 주세요.");
  }
  if (!body || typeof body !== "object" || !("summary" in body)
    || typeof body.summary !== "string" || !body.summary.trim()) {
    throw new SummaryRequestError("INVALID_RESPONSE", "요약 응답을 확인하지 못했습니다.");
  }
  return body.summary.trim();
}
