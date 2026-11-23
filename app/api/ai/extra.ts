import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Message } from "@/types/database";

export const EXTRA_MAX_BODY_BYTES = 128 * 1024;
export const EXTRA_MAX_TEXT_LENGTH = 20000;

type ClientFactory = () => Promise<SupabaseClient<Database>>;
type Context = { referenceTime: string; timeZone: "Asia/Seoul" };
export type TaskSource = Pick<Message, "id" | "content" | "created_at" | "parent_id">;
export type SearchInterpreter = (question: string, context: Context, signal: AbortSignal) => Promise<unknown>;
export type TaskExtractor = (messages: readonly TaskSource[], context: Context, signal: AbortSignal) => Promise<unknown>;

type SearchPlan = { keywords: string[]; from: string | null; to: string | null };
export type ExtractedTask = {
  content: string;
  assignee: string | null;
  dueDate: string | null;
  messageIds: number[];
};

class ExtraError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function onlyKeys(value: Record<string, unknown>, allowed: string[]) {
  return Object.keys(value).every((key) => allowed.includes(key));
}

function channelId(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new ExtraError(400, "INVALID_CHANNEL", "올바른 channelId를 보내 주세요.");
  }
  return value;
}

function limit(value: unknown, fallback: number, maximum: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > maximum) {
    throw new ExtraError(400, "INVALID_LIMIT", `limit은 1~${maximum} 사이의 정수여야 합니다.`);
  }
  return value;
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new ExtraError(415, "JSON_REQUIRED", "Content-Type: application/json으로 보내 주세요.");
  }
  if (Number(request.headers.get("content-length")) > EXTRA_MAX_BODY_BYTES) {
    throw new ExtraError(413, "INPUT_TOO_LARGE", "요청 본문이 너무 큽니다.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new ExtraError(400, "INVALID_JSON", "JSON 본문을 보내 주세요.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      request.signal.throwIfAborted();
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > EXTRA_MAX_BODY_BYTES) {
        await reader.cancel();
        throw new ExtraError(413, "INPUT_TOO_LARGE", "요청 본문이 너무 큽니다.");
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
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ExtraError(400, "INVALID_JSON", "올바른 JSON 본문을 보내 주세요.");
  }
  if (!object(value)) throw new ExtraError(400, "INVALID_INPUT", "JSON 객체로 요청해 주세요.");
  return value;
}

async function authenticate(createClient: ClientFactory, signal: AbortSignal) {
  let supabase: SupabaseClient<Database>;
  try {
    supabase = await createClient();
  } catch {
    throw new ExtraError(503, "SERVICE_NOT_CONFIGURED", "서버 연결 설정을 확인해 주세요.");
  }
  const { data, error } = await supabase.auth.getUser();
  signal.throwIfAborted();
  if (error || !data.user) throw new ExtraError(401, "UNAUTHORIZED", "로그인한 뒤 다시 시도해 주세요.");
  return { supabase, userId: data.user.id };
}

async function requireMember(supabase: SupabaseClient<Database>, id: string, userId: string, signal: AbortSignal) {
  const { data, error } = await supabase.from("channel_members")
    .select("channel_id").eq("channel_id", id).eq("user_id", userId)
    .abortSignal(signal).maybeSingle();
  signal.throwIfAborted();
  if (error) throw new ExtraError(500, "DATABASE_ERROR", "채널 접근 권한을 확인하지 못했습니다.");
  if (!data) throw new ExtraError(403, "FORBIDDEN", "접근할 수 없는 채널입니다.");
}

async function respond(request: Request, work: () => Promise<unknown>): Promise<Response> {
  const headers = { "Cache-Control": "no-store" };
  try {
    request.signal.throwIfAborted();
    const body = await work();
    request.signal.throwIfAborted();
    return Response.json(body, { headers });
  } catch (error) {
    if (request.signal.aborted) {
      return Response.json({ error: { code: "REQUEST_ABORTED", message: "요청이 취소되었습니다." } }, { status: 408, headers });
    }
    if (error instanceof ExtraError) {
      return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status, headers });
    }
    // 대화 원문·키·접속 정보·AI 내부 오류는 응답이나 로그에 넣지 않는다.
    return Response.json({ error: { code: "INTERNAL_ERROR", message: "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." } }, { status: 500, headers });
  }
}

function unavailable(): never {
  // 환경변수에 키가 생겨도 자동 연결하지 않는다. 업체 협의와 별도 요청 후 교체한다.
  throw new ExtraError(503, "AI_NOT_CONNECTED", "AI 기능은 아직 연결되지 않았습니다. 제공업체 결정 후 사용할 수 있습니다.");
}

export const unavailableInterpreter: SearchInterpreter = async () => unavailable();
export const unavailableExtractor: TaskExtractor = async () => unavailable();

function invalidAi(): never {
  throw new ExtraError(502, "INVALID_AI_RESPONSE", "AI 응답의 형식이나 근거를 확인하지 못했습니다.");
}

function instant(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string"
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
    || !Number.isFinite(Date.parse(value))) return invalidAi();
  dateOnly(value.slice(0, 10));
  return new Date(value).toISOString();
}

function validatePlan(value: unknown): SearchPlan {
  if (!object(value) || !onlyKeys(value, ["keywords", "from", "to"])
    || !Array.isArray(value.keywords) || value.keywords.length > 5
    || value.keywords.some((word) => typeof word !== "string" || !word.trim() || word.trim().length > 100 || word.includes("*"))) return invalidAi();
  const from = instant(value.from);
  const to = instant(value.to);
  if (from && to && from >= to) return invalidAi();
  if (!value.keywords.length && !(from && to)) return invalidAi();
  return { keywords: (value.keywords as string[]).map((word) => word.trim()), from, to };
}

/** POST /api/ai/search: { query, channelId?, limit? }. 기본 연결은 503이다. */
export async function handleNaturalSearch(
  request: Request,
  createClient: ClientFactory,
  interpret: SearchInterpreter = unavailableInterpreter,
): Promise<Response> {
  return respond(request, async () => {
    const body = await readBody(request);
    if (!onlyKeys(body, ["query", "channelId", "limit"])) throw new ExtraError(400, "INVALID_INPUT", "query, channelId, limit만 보내 주세요.");
    if (typeof body.query !== "string" || !body.query.trim() || body.query.trim().length > 500) {
      throw new ExtraError(400, "INVALID_QUERY", "질문은 1~500자의 텍스트로 보내 주세요.");
    }
    const id = "channelId" in body ? channelId(body.channelId) : null;
    const count = limit(body.limit, 20, 50);
    const { supabase, userId } = await authenticate(createClient, request.signal);
    if (id) await requireMember(supabase, id, userId, request.signal);

    const context: Context = { referenceTime: new Date().toISOString(), timeZone: "Asia/Seoul" };
    // AI에게 SQL·채널 권한·조회 개수를 결정하게 하지 않는다. 질문 해석만 맡긴다.
    const plan = validatePlan(await interpret(body.query.trim(), context, request.signal));
    request.signal.throwIfAborted();
    let query = supabase.from("messages")
      .select("id, channel_id, content, created_at, parent_id")
      .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(count + 1);
    if (id) query = query.eq("channel_id", id);
    for (const keyword of plan.keywords) {
      query = query.ilike("content", `%${keyword.replace(/[\\%_]/g, "\\$&")}%`);
    }
    if (plan.from) query = query.gte("created_at", plan.from);
    if (plan.to) query = query.lt("created_at", plan.to);
    const { data, error } = await query.abortSignal(request.signal);
    if (error) throw new ExtraError(500, "DATABASE_ERROR", "메시지를 검색하지 못했습니다.");
    return { messages: (data ?? []).slice(0, count), hasMore: (data?.length ?? 0) > count, interpretation: plan, ...context };
  });
}

function dateOnly(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return invalidAi();
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) return invalidAi();
  return value;
}

function validateTasks(value: unknown, messages: readonly TaskSource[]): ExtractedTask[] {
  if (!object(value) || !onlyKeys(value, ["tasks"]) || !Array.isArray(value.tasks) || value.tasks.length > 20) return invalidAi();
  const source = new Map(messages.map((message) => [message.id, message.content]));
  return value.tasks.map((task: unknown) => {
    if (!object(task) || !onlyKeys(task, ["content", "assignee", "dueDate", "messageIds"])
      || typeof task.content !== "string" || !task.content.trim() || task.content.trim().length > 1000
      || !Array.isArray(task.messageIds) || !task.messageIds.length || task.messageIds.length > 10
      || task.messageIds.some((id) => !Number.isSafeInteger(id) || !source.has(id))) return invalidAi();
    const messageIds = [...new Set(task.messageIds as number[])];
    let assignee: string | null = null;
    if (task.assignee !== null) {
      if (typeof task.assignee !== "string" || !task.assignee.trim() || task.assignee.trim().length > 100) return invalidAi();
      const name = task.assignee.trim();
      // 원문에 없는 이름을 담당자로 지어내지 않는다. 모호하면 null을 사용한다.
      if (!messageIds.some((id) => source.get(id)?.includes(name))) return invalidAi();
      assignee = name;
    }
    return { content: task.content.trim(), assignee, dueDate: dateOnly(task.dueDate), messageIds };
  });
}

/** POST /api/ai/tasks: { channelId, limit? }. DB에 할 일을 저장하지 않는다. */
export async function handleExtractTasks(
  request: Request,
  createClient: ClientFactory,
  extract: TaskExtractor = unavailableExtractor,
): Promise<Response> {
  return respond(request, async () => {
    const body = await readBody(request);
    if (!onlyKeys(body, ["channelId", "limit"])) throw new ExtraError(400, "INVALID_INPUT", "channelId, limit만 보내 주세요.");
    const id = channelId(body.channelId);
    const count = limit(body.limit, 50, 100);
    const { supabase, userId } = await authenticate(createClient, request.signal);
    await requireMember(supabase, id, userId, request.signal);
    const { data, error } = await supabase.from("messages")
      .select("id, content, created_at, parent_id")
      .eq("channel_id", id).order("id", { ascending: false }).limit(count).abortSignal(request.signal);
    if (error) throw new ExtraError(500, "DATABASE_ERROR", "대화를 불러오지 못했습니다.");
    const messages = (data ?? []).filter((message) => message.content.trim())
      .map((message) => ({ ...message, content: message.content.trim() })).reverse();
    if (!messages.length) throw new ExtraError(422, "NO_MESSAGES", "할 일을 추출할 대화가 없습니다.");
    if (messages.some((message) => message.content.length > 4000)
      || messages.reduce((sum, message) => sum + message.content.length, 0) > EXTRA_MAX_TEXT_LENGTH) {
      throw new ExtraError(413, "INPUT_TOO_LARGE", "대화가 너무 깁니다. 메시지 개수를 줄여 주세요.");
    }
    request.signal.throwIfAborted();
    const context: Context = { referenceTime: new Date().toISOString(), timeZone: "Asia/Seoul" };
    const tasks = validateTasks(await extract(messages, context, request.signal), messages);
    return { tasks, messageCount: messages.length };
  });
}
