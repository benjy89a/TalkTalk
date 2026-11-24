// AI 제공업체(EXAONE / Gemini) 선택과 업체별 설정을 한곳에 모은다.
// 서버 환경변수 AI_PROVIDER 로 고른다. 값이 없거나 "exaone" 이면 지금까지와 똑같이 EXAONE 으로 동작한다.
//   AI_PROVIDER=gemini → Gemini (키 GEMINI_API_KEY, 모델 GEMINI_MODEL, 없으면 아래 기본 모델)
// 이 파일은 환경변수를 읽기만 한다(키를 로그·응답에 쓰지 않는다). 생성만으로 외부 호출을 하지 않는다.
// 호출 코드(요약·검색 해석·할 일 추출)는 같은 OpenAI 호환 "채팅 완성" 형식이라 어댑터가 이 설정만 바꿔 쓴다.

export type AiProviderId = "exaone" | "gemini";

/** 업체별 호출 설정. 키 값은 포함하지 않는다. */
export type AiProviderConfig = {
  id: AiProviderId;
  /** 화면·오류 문구에 쓰는 이름 */
  displayName: string;
  /** 채팅 완성 주소(OpenAI 호환) */
  url: string;
  model: string;
  /** 서버에서 읽는 키 환경변수 이름(값이 아님) */
  envKeyName: string;
  /** null 이면 요청에 reasoning_effort 를 넣지 않는다 */
  reasoningEffort: "low" | null;
  /** 모델이 JSON 을 ```json 코드블록으로 감싸 보내는 경우를 받아 줄지 */
  acceptCodeFence: boolean;
};

export type ResolvedAiProvider = AiProviderConfig & { apiKey: string | undefined };

export const EXAONE_CONFIG: AiProviderConfig = {
  id: "exaone",
  displayName: "EXAONE",
  url: "https://api.exaone.ai/v1/chat/completions",
  model: "k-exaone_v2.5",
  envKeyName: "EXAONE_API_KEY",
  reasoningEffort: "low",
  // EXAONE 은 지정한 JSON 객체만 받는다(코드블록은 형식 오류로 거절하는 기존 동작 유지).
  acceptCodeFence: false,
};

/** Gemini 의 OpenAI 호환 채팅 완성 주소(문서상 베타). 인증은 Authorization: Bearer 키. */
export const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

/**
 * GEMINI_MODEL 이 없을 때 쓰는 기본 모델.
 * 근거(AI Studio 문서 aistudio.google.com/docs/models, 2026-11-24 확인): gemini-3.5-flash-lite 는 안정(Stable) 상태이고
 * "3.5 세대 중 가장 빠르고 비용 효율적인 모델"로 소개되며, 새 프로젝트 권장 모델로 문서에 적혀 있다.
 * gemini-2.5-flash 는 2026-12-01 부터 이 모델로 자동 전환될 예정이라 처음부터 이 ID 를 쓴다.
 */
export const GEMINI_DEFAULT_MODEL = "gemini-3.5-flash-lite";

/** 모델 ID 로 쓸 수 있는 문자: 영문·숫자·점·밑줄·하이픈(요청 본문에만 들어가며 주소에는 쓰지 않는다). */
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

type Env = Record<string, string | undefined>;

/** AI_PROVIDER 값을 해석한다. 알 수 없는 값은 기존 동작(EXAONE)으로 둔다. */
export function parseProviderId(value: string | undefined): AiProviderId {
  return value?.trim().toLowerCase() === "gemini" ? "gemini" : "exaone";
}

/** 모델 ID 형식이 맞으면 다듬은 값, 아니면 null. */
export function validModelId(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && MODEL_ID.test(trimmed) ? trimmed : null;
}

/**
 * Gemini 설정. 모델 우선순위: 관리자 설정(DB, modelOverride) → 환경변수 GEMINI_MODEL → 기본 모델.
 * 형식이 이상한 값은 건너뛰고 다음 순위를 쓴다.
 */
export function geminiConfig(env: Env = process.env, modelOverride?: string | null): AiProviderConfig {
  return {
    id: "gemini",
    displayName: "Gemini",
    url: GEMINI_URL,
    model: validModelId(modelOverride) ?? validModelId(env.GEMINI_MODEL) ?? GEMINI_DEFAULT_MODEL,
    envKeyName: "GEMINI_API_KEY",
    // EXAONE 옵션(reasoning_effort)을 Gemini 가 거절하지 않도록 보내지 않는다. 모델 기본 생각 수준을 따른다.
    reasoningEffort: null,
    acceptCodeFence: true,
  };
}

/**
 * 관리자 설정(DB `ai_settings`, 007 마이그레이션)에서 읽은 업체·모델. API 키는 DB에 없다(Vercel 환경변수에만).
 * provider 가 null 이면 "환경변수(AI_PROVIDER)를 따른다".
 */
export type AiSettingsOverride = { provider: AiProviderId | null; geminiModel: string | null };

/**
 * 이번 요청에 쓸 업체 설정과 키를 고른다. 키는 서버 코드(route)에서만 읽는다.
 * 우선순위: 관리자 설정(DB 값이 있으면) → 환경변수 AI_PROVIDER → EXAONE. DB를 못 읽으면 override 를 넘기지 않아 환경변수로 동작한다.
 */
export function resolveAiProvider(env: Env = process.env, override?: AiSettingsOverride | null): ResolvedAiProvider {
  const id = override?.provider ?? parseProviderId(env.AI_PROVIDER);
  const config = id === "gemini" ? geminiConfig(env, override?.geminiModel) : EXAONE_CONFIG;
  return { ...config, apiKey: env[config.envKeyName] };
}

/** 서버에 그 업체의 키가 있는지(값은 보지 않고 있는지만). 공백뿐인 값은 없는 것으로 본다. */
export function isProviderKeyConfigured(id: AiProviderId, env: Env = process.env): boolean {
  const name = id === "gemini" ? "GEMINI_API_KEY" : EXAONE_CONFIG.envKeyName;
  return Boolean(env[name]?.trim());
}

/** 관리자 화면용: 업체별 키 환경변수 이름·설정 여부·기본 모델. 키 값은 담지 않는다. */
export type ProviderOption = {
  id: AiProviderId;
  displayName: string;
  keyEnvName: string;
  keyConfigured: boolean;
  defaultModel: string;
};

export function listProviderOptions(env: Env = process.env): ProviderOption[] {
  return ([EXAONE_CONFIG, geminiConfig(env)] as AiProviderConfig[]).map((config) => ({
    id: config.id,
    displayName: config.displayName,
    keyEnvName: config.envKeyName,
    keyConfigured: isProviderKeyConfigured(config.id, env),
    // Gemini 의 기본 모델은 환경변수 GEMINI_MODEL 이 있으면 그 값(설정에서 모델을 비웠을 때 쓰는 값)
    defaultModel: config.model,
  }));
}

/**
 * 모델이 JSON 을 ```json ... ``` 코드블록 하나로 감싸 보낸 경우 안쪽 JSON 만 꺼낸다.
 * 블록이 아니거나 앞뒤에 다른 글이 있으면 그대로 돌려줘 파싱 오류로 처리한다.
 */
export function stripCodeFence(text: string): string {
  const match = /^\s*```[A-Za-z0-9_-]*[ \t]*\r?\n([\s\S]*?)\r?\n?[ \t]*```\s*$/.exec(text);
  return match ? match[1] : text;
}
