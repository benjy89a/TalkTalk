// 관리자 AI 설정 저장(PUT /api/ai/status)과 화면이 쓰는 순수 도우미.
// 저장하는 것은 "어느 업체·모델을 쓸지"뿐이며 API 키는 서버 환경변수에만 있다(이 파일은 키를 다루지 않는다).
// 이 파일은 다른 로컬 모듈을 값으로 가져오지 않는다(확장자 없는 import 와 node --test 가 함께 쓰이도록).

export type AiProviderChoice = "exaone" | "gemini" | null;

export class AiSettingsError extends Error {
  code: string;
  constructor(code: string, message: string) { super(message); this.code = code; }
}

/** Gemini 모델 ID 형식(서버·DB 와 같은 규칙). */
const MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** 모델 입력칸 값이 괜찮은가. 비어 있으면 괜찮다(환경변수·기본 모델을 쓴다). */
export function isValidModelInput(text: string): boolean {
  const trimmed = text.trim();
  return trimmed === "" || MODEL_PATTERN.test(trimmed);
}

type SelectionLike = { provider: AiProviderChoice; geminiModel: string | null };

/** 지금 저장된 값과 화면에서 고른 값이 다른가(같으면 저장 버튼을 막는다). */
export function isSelectionChanged(current: SelectionLike, draft: { provider: AiProviderChoice; model: string }): boolean {
  return current.provider !== draft.provider || (current.geminiModel ?? "") !== draft.model.trim();
}

/** 지금 적용 중인 선택의 출처 문구. */
export function selectionSourceText(source: "settings" | "env"): string {
  return source === "settings" ? "관리자 설정" : "환경변수(AI_PROVIDER)";
}

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export type SaveAiSettingsResult = { provider: AiProviderChoice; model: string | null; updatedAt: string | null };

/**
 * 업체·모델을 저장한다. 서버가 "고른 업체의 키가 없으면" 409 로 막고, 007 이 없으면 503 으로 알려 준다.
 * 서버 안내문(한국어, 키 값 없음)을 그대로 보여 주고 DB 오류 원문은 서버가 이미 버린다.
 * 업체만 바꿀 때도 현재 모델을 함께 보낸다(서버 DB 함수가 호출마다 모델 칸을 덮어쓰기 때문).
 */
export async function saveAiSettings(
  input: { provider: AiProviderChoice; model: string },
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<SaveAiSettingsResult> {
  signal.throwIfAborted();
  const model = input.model.trim();
  const response = await fetcher("/api/ai/status", {
    method: "PUT", headers: { "Content-Type": "application/json" }, credentials: "same-origin", cache: "no-store", signal,
    body: JSON.stringify({ provider: input.provider, model: model === "" ? null : model }),
  });
  let body: unknown;
  try { body = await response.json(); } catch {
    signal.throwIfAborted();
    throw new AiSettingsError("REQUEST_FAILED", "저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
  signal.throwIfAborted();
  if (!response.ok) {
    if (response.status === 401) throw new AiSettingsError("UNAUTHORIZED", "로그인한 뒤 다시 시도해 주세요.");
    if (object(body) && object(body.error) && typeof body.error.code === "string" && typeof body.error.message === "string"
      && body.error.message.length <= 300) {
      throw new AiSettingsError(body.error.code, body.error.message);
    }
    throw new AiSettingsError("REQUEST_FAILED", "저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
  if (!object(body) || body.ok !== true || !(body.provider === null || body.provider === "exaone" || body.provider === "gemini")
    || !(body.model === null || typeof body.model === "string") || !(body.updatedAt === null || typeof body.updatedAt === "string")) {
    throw new AiSettingsError("INVALID_RESPONSE", "응답 형식을 확인하지 못했어요.");
  }
  return { provider: body.provider, model: body.model, updatedAt: body.updatedAt };
}
