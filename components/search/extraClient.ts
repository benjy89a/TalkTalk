import type { Message } from "@/types/database";

export type AiSearchMessage = Pick<Message, "id" | "channel_id" | "content" | "created_at" | "parent_id">;
export type AiSearchResult = {
  messages: AiSearchMessage[]; hasMore: boolean;
  interpretation: { keywords: string[]; from: string | null; to: string | null };
  referenceTime: string; timeZone: "Asia/Seoul";
};
export type AiTaskResult = {
  tasks: { content: string; assignee: string | null; dueDate: string | null; messageIds: number[] }[];
  messageCount: number;
};

export class AiExtraRequestError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
const timestamp = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const id = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
function invalid(): never { throw new AiExtraRequestError("INVALID_RESPONSE", "응답 형식을 확인하지 못했습니다. 다시 시도해 주세요."); }

async function post(url: string, input: unknown, signal: AbortSignal, fetcher: typeof fetch): Promise<unknown> {
  signal.throwIfAborted();
  const response = await fetcher(url, {
    method: "POST", headers: { "Content-Type": "application/json" },
    credentials: "same-origin", cache: "no-store", body: JSON.stringify(input), signal,
  });
  let body: unknown;
  try { body = await response.json(); } catch {
    signal.throwIfAborted();
    throw new AiExtraRequestError("REQUEST_FAILED", "요청을 처리하지 못했습니다. 연결 상태를 확인해 주세요.");
  }
  signal.throwIfAborted();
  if (!response.ok) {
    if (object(body) && object(body.error) && typeof body.error.code === "string" && typeof body.error.message === "string") {
      throw new AiExtraRequestError(body.error.code, body.error.message);
    }
    throw new AiExtraRequestError("REQUEST_FAILED", "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
  return body;
}

export async function requestNaturalSearch(
  channelId: string, query: string, signal: AbortSignal, fetcher: typeof fetch = fetch,
): Promise<AiSearchResult> {
  const body = await post("/api/ai/search", { channelId, query: query.trim(), limit: 20 }, signal, fetcher);
  if (!object(body) || !Array.isArray(body.messages) || body.messages.length > 20 || typeof body.hasMore !== "boolean"
    || !object(body.interpretation) || !Array.isArray(body.interpretation.keywords)
    || body.interpretation.keywords.length > 5
    || body.interpretation.keywords.some((word: unknown) => typeof word !== "string" || !word.trim() || word.length > 100)
    || !(body.interpretation.from === null || timestamp(body.interpretation.from))
    || !(body.interpretation.to === null || timestamp(body.interpretation.to))
    || !timestamp(body.referenceTime) || body.timeZone !== "Asia/Seoul") return invalid();
  if (body.messages.some((message: unknown) => !object(message) || !id(message.id)
    || message.channel_id !== channelId || typeof message.content !== "string" || !timestamp(message.created_at)
    || !(message.parent_id === null || id(message.parent_id)))) return invalid();
  return body as AiSearchResult;
}

export async function requestExtractTasks(
  channelId: string, limit: number, signal: AbortSignal, fetcher: typeof fetch = fetch,
): Promise<AiTaskResult> {
  const body = await post("/api/ai/tasks", { channelId, limit }, signal, fetcher);
  if (!object(body) || !Array.isArray(body.tasks) || body.tasks.length > 20
    || !id(body.messageCount) || body.messageCount > limit) return invalid();
  if (body.tasks.some((task: unknown) => {
    if (!object(task) || typeof task.content !== "string" || !task.content.trim() || task.content.length > 1000
      || !(task.assignee === null || (typeof task.assignee === "string" && task.assignee.trim() && task.assignee.length <= 100))
      || !Array.isArray(task.messageIds) || task.messageIds.length < 1 || task.messageIds.length > 10
      || task.messageIds.some((value: unknown) => !id(value))) return true;
    if (task.dueDate === null) return false;
    if (typeof task.dueDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(task.dueDate)) return true;
    const date = new Date(`${task.dueDate}T00:00:00Z`);
    return !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== task.dueDate;
  })) return invalid();
  return body as AiTaskResult;
}
