import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export const MAX_MESSAGES = 100;
export const MAX_MESSAGE_LENGTH = 4000;
export const MAX_TOTAL_LENGTH = 20000;
export const MAX_BODY_BYTES = 128 * 1024;

type SummaryInput =
  | { channelId: string; limit: number }
  | { messages: string[] };

// 테스트와 향후 제공업체 연결을 위한 경계. 실제 route는 미연결 함수를 사용한다.
export type SummaryGenerator = (messages: readonly string[], signal: AbortSignal) => Promise<string>;

class SummaryError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function json(body: unknown, status: number) {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function validateMessages(messages: unknown): string[] {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    throw new SummaryError(400, "INVALID_MESSAGES", `메시지는 1~${MAX_MESSAGES}개의 텍스트 배열이어야 합니다.`);
  }
  if (messages.some((message) => typeof message !== "string" || !message.trim())) {
    throw new SummaryError(400, "INVALID_MESSAGES", "각 메시지는 비어 있지 않은 텍스트여야 합니다.");
  }
  const texts = (messages as string[]).map((message) => message.trim());
  if (texts.some((message) => message.length > MAX_MESSAGE_LENGTH)
    || texts.reduce((sum, message) => sum + message.length, 0) > MAX_TOTAL_LENGTH) {
    throw new SummaryError(413, "INPUT_TOO_LARGE", "대화가 너무 깁니다. 메시지 개수나 길이를 줄여 주세요.");
  }
  return texts;
}

function parseInput(value: unknown): SummaryInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SummaryError(400, "INVALID_INPUT", "JSON 객체로 요청해 주세요.");
  }
  const body = value as Record<string, unknown>;
  if ("channelId" in body && "messages" in body) {
    throw new SummaryError(400, "INVALID_INPUT", "channelId와 messages 중 하나만 보내 주세요.");
  }
  if ("messages" in body) {
    if (Object.keys(body).some((key) => key !== "messages")) {
      throw new SummaryError(400, "INVALID_INPUT", "텍스트 입력에는 messages만 보내 주세요.");
    }
    return { messages: validateMessages(body.messages) };
  }
  if (Object.keys(body).some((key) => !["channelId", "limit"].includes(key))
    || typeof body.channelId !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.channelId)) {
    throw new SummaryError(400, "INVALID_CHANNEL", "올바른 channelId를 보내 주세요.");
  }
  const limit = body.limit === undefined ? 50 : body.limit;
  if (typeof limit !== "number" || !Number.isInteger(limit) || limit < 1 || limit > MAX_MESSAGES) {
    throw new SummaryError(400, "INVALID_LIMIT", `limit은 1~${MAX_MESSAGES} 사이의 정수여야 합니다.`);
  }
  return { channelId: body.channelId, limit };
}

async function readInput(request: Request): Promise<SummaryInput> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new SummaryError(415, "JSON_REQUIRED", "Content-Type: application/json으로 보내 주세요.");
  }
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_BODY_BYTES) {
    throw new SummaryError(413, "INPUT_TOO_LARGE", "요청 본문이 너무 큽니다.");
  }

  // Content-Length가 없거나 부정확해도 실제 읽은 바이트를 제한한다.
  const reader = request.body?.getReader();
  if (!reader) throw new SummaryError(400, "INVALID_JSON", "JSON 본문을 보내 주세요.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      request.signal.throwIfAborted();
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new SummaryError(413, "INPUT_TOO_LARGE", "요청 본문이 너무 큽니다.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new SummaryError(400, "INVALID_JSON", "올바른 JSON 본문을 보내 주세요.");
  }
  return parseInput(parsed);
}

export const unavailableSummary: SummaryGenerator = async () => {
  // 키가 나중에 추가되어도 자동 호출하지 않는다. 업체 협의·명시 요청 후 교체한다.
  throw new SummaryError(503, "AI_NOT_CONNECTED", "AI 요약은 아직 연결되지 않았습니다. 제공업체 결정 후 사용할 수 있습니다.");
};

export async function handleSummarize(
  request: Request,
  createClient: () => Promise<SupabaseClient<Database>>,
  generateSummary: SummaryGenerator = unavailableSummary,
): Promise<Response> {
  try {
    request.signal.throwIfAborted();
    const input = await readInput(request);
    let supabase: SupabaseClient<Database>;
    try {
      supabase = await createClient();
    } catch {
      throw new SummaryError(503, "SERVICE_NOT_CONFIGURED", "서버 연결 설정을 확인해 주세요.");
    }
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) {
      throw new SummaryError(401, "UNAUTHORIZED", "로그인한 뒤 다시 시도해 주세요.");
    }
    request.signal.throwIfAborted();

    let messages: string[];
    if ("messages" in input) {
      // 사용자가 제출한 텍스트다. DB 메시지를 조회하거나 접근 권한을 증명하지 않는다.
      messages = input.messages;
    } else {
      const { data: membership, error: memberError } = await supabase
        .from("channel_members")
        .select("channel_id")
        .eq("channel_id", input.channelId)
        .eq("user_id", auth.user.id)
        .abortSignal(request.signal)
        .maybeSingle();
      if (memberError) throw new SummaryError(500, "DATABASE_ERROR", "채널 접근 권한을 확인하지 못했습니다.");
      if (!membership) throw new SummaryError(403, "FORBIDDEN", "접근할 수 없는 채널입니다.");

      const { data, error } = await supabase
        .from("messages")
        .select("content")
        .eq("channel_id", input.channelId)
        .is("parent_id", null)
        .order("id", { ascending: false })
        .limit(input.limit)
        .abortSignal(request.signal);
      if (error) throw new SummaryError(500, "DATABASE_ERROR", "대화를 불러오지 못했습니다.");
      const texts = (data ?? []).map((row) => row.content).filter((text) => text.trim()).reverse();
      if (!texts.length) throw new SummaryError(422, "NO_MESSAGES", "요약할 대화가 없습니다.");
      messages = validateMessages(texts);
    }

    request.signal.throwIfAborted();
    const summary = await generateSummary(messages, request.signal);
    request.signal.throwIfAborted();
    if (typeof summary !== "string" || !summary.trim() || summary.length > 8000) {
      throw new SummaryError(502, "INVALID_AI_RESPONSE", "요약 응답을 확인하지 못했습니다.");
    }
    return json({ summary: summary.trim() }, 200);
  } catch (error) {
    if (request.signal.aborted) {
      return json({ error: { code: "REQUEST_ABORTED", message: "요청이 취소되었습니다." } }, 408);
    }
    if (error instanceof SummaryError) {
      return json({ error: { code: error.code, message: error.message } }, error.status);
    }
    // 원문 대화·키·접속 주소·DB 내부 오류는 응답이나 로그에 넣지 않는다.
    return json({ error: { code: "INTERNAL_ERROR", message: "요약을 준비하지 못했습니다. 잠시 후 다시 시도해 주세요." } }, 500);
  }
}
