"use client";
// 관리자 "AI 설정" 탭의 업체 선택: 환경변수 따르기 / EXAONE / Gemini (+ Gemini 모델).
// 저장하는 것은 업체·모델뿐이며 API 키는 서버 환경변수(EXAONE_API_KEY · GEMINI_API_KEY)에만 있다. 키 값은 화면에도 오지 않는다.
// 고른 업체의 키가 서버에 없으면 선택할 수 없고(서버도 409로 막는다), 저장 전에 외부 전송 안내를 확인받는다.
// 사용 예: <AiProviderSelect status={관리자 상태} onSaved={() => 다시 불러오기} />  (AiKeyStatus 안에서 쓴다)
import { useId, useState } from "react";
import { aiPrimaryButton } from "./aiButtonStyles";
import { AiSettingsError, isSelectionChanged, isValidModelInput, saveAiSettings, selectionSourceText, type AiProviderChoice } from "./aiSettingsClient";
import type { AiProviderOption, AiStatus } from "./aiStatusClient";

type Choice = "env" | "exaone" | "gemini";
const toProvider = (choice: Choice): AiProviderChoice => (choice === "env" ? null : choice);

function formatTime(value: string | null): string {
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? new Date(time).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "";
}

export default function AiProviderSelect({ status, onSaved }: { status: AiStatus; onSaved: () => void }) {
  const selection = status.selection;
  const providers = status.providers;
  const [choice, setChoice] = useState<Choice>(selection?.provider ?? "env");
  const [model, setModel] = useState(selection?.geminiModel ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const groupName = useId();
  const modelId = useId();
  if (!selection || !providers) return null;

  const byId = (id: string): AiProviderOption | undefined => providers.find((item) => item.id === id);
  const envProvider = byId(selection.envProviderId);
  const gemini = byId("gemini");
  const draftProvider = toProvider(choice);
  const chosen = byId(draftProvider ?? selection.envProviderId); // 저장 뒤 실제로 쓰게 될 업체
  const keyMissing = !chosen?.keyConfigured;
  const modelOk = isValidModelInput(model);
  const changed = isSelectionChanged(selection, { provider: draftProvider, model });
  const applied = `${status.provider}${status.model ? ` · ${status.model}` : ""}`;
  const when = formatTime(selection.updatedAt);

  if (!selection.settingsAvailable) {
    return (
      <div className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm leading-6">
        <p className="font-semibold">AI 제공자 선택</p>
        <p>AI 설정 테이블(007 마이그레이션)이 아직 없어 화면에서 바꿀 수 없습니다. 팀장이 Supabase에서 <code>007_ai_settings.sql</code> 을 실행하면 이 자리에서 고를 수 있습니다.</p>
        <p>지금은 서버 환경변수 <code>AI_PROVIDER</code>(비움·<code>exaone</code>=EXAONE, <code>gemini</code>=Gemini)로 정해지며 현재 적용은 <strong>{applied}</strong> 입니다.</p>
      </div>
    );
  }

  async function save() {
    if (saving || !changed || !modelOk || keyMissing || !chosen) return;
    const name = choice === "env" ? `환경변수 따르기(현재 ${chosen.displayName})` : chosen.displayName;
    if (!window.confirm(`AI 제공자를 ${name}(으)로 바꿉니다. 지금부터 요약·검색·할 일 추출에서 대화와 작성자 이름이 해당 외부 AI 서비스로 전송됩니다. 계속할까요?`)) return;
    setSaving(true);
    setMessage(null);
    try {
      await saveAiSettings({ provider: draftProvider, model }, new AbortController().signal);
      setMessage({ kind: "ok", text: "저장했습니다. 다른 서버에는 최대 10초 뒤 반영되며, 이미 열려 있는 화면의 AI 도구 버튼 모델 이름은 새로고침하면 바뀝니다." });
      onSaved();
    } catch (error) {
      setMessage({ kind: "error", text: error instanceof AiSettingsError ? error.message : "저장하지 못했어요. 잠시 후 다시 시도해 주세요." });
    } finally {
      setSaving(false);
    }
  }

  const options: { value: Choice; label: string; provider: AiProviderOption | undefined; hint?: string }[] = [
    { value: "env", label: `환경변수 따르기 (지금 환경변수 AI_PROVIDER → ${envProvider?.displayName ?? selection.envProviderId})`, provider: envProvider },
    { value: "exaone", label: "EXAONE", provider: byId("exaone") },
    { value: "gemini", label: "Gemini", provider: gemini },
  ];

  return (
    <fieldset className="space-y-3 rounded-md border border-gray-200 p-4 text-sm" disabled={saving}>
      <legend className="px-1 font-semibold">AI 제공자 선택</legend>
      <p className="text-xs leading-5 text-gray-600">
        지금 적용: <strong className="text-gray-900">{applied}</strong> · 출처 {selectionSourceText(selection.source)}{when && ` · 마지막 변경 ${when}`}
      </p>
      <div role="radiogroup" aria-label="AI 제공자" className="space-y-2">
        {options.map((option) => {
          const disabled = !option.provider?.keyConfigured;
          const reasonId = `${groupName}-${option.value}`;
          return (
            <label key={option.value} className={`flex items-start gap-2 rounded-md border p-2 ${choice === option.value ? "border-[#1e325c] bg-gray-50" : "border-gray-200"} ${disabled ? "opacity-60" : ""}`}>
              <input type="radio" name={groupName} value={option.value} checked={choice === option.value} disabled={disabled}
                aria-describedby={reasonId} onChange={() => { setChoice(option.value); setMessage(null); }} className="mt-1" />
              <span className="min-w-0">
                <span className="block font-medium">{option.label}</span>
                <span id={reasonId} className="block text-xs leading-5 text-gray-600">
                  {option.provider
                    ? (option.provider.keyConfigured
                      ? `✅ 키 설정됨 (${option.provider.keyEnvName})`
                      : `❌ 키 없음 — Vercel 환경변수에 ${option.provider.keyEnvName} 를 넣고 다시 배포하면 고를 수 있습니다`)
                    : "업체 정보를 불러오지 못했습니다"}
                </span>
              </span>
            </label>
          );
        })}
      </div>
      <div className="space-y-1">
        <label htmlFor={modelId} className="block text-gray-600">Gemini 모델 <span className="text-xs">(비우면 {gemini?.defaultModel ?? "기본 모델"} · Gemini 를 쓸 때 적용)</span></label>
        <input id={modelId} value={model} maxLength={64} onChange={(event) => { setModel(event.target.value); setMessage(null); }}
          placeholder={gemini?.defaultModel ?? "gemini-3.5-flash-lite"} aria-invalid={!modelOk}
          className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1e325c] disabled:opacity-50" />
        {!modelOk && <p role="alert" className="text-xs text-gray-900">모델 이름은 영문·숫자·점·밑줄·하이픈으로 64자 이하여야 합니다.</p>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => void save()} disabled={saving || !changed || !modelOk || keyMissing} className={aiPrimaryButton}>
          {saving ? "저장 중…" : "저장"}
        </button>
        <p className="text-xs text-gray-600">API 키는 저장하지 않으며 서버 환경변수에서만 읽습니다. {changed ? "" : "바꾼 내용이 없습니다."}</p>
      </div>
      {message && <p role={message.kind === "error" ? "alert" : "status"} className="rounded-md border border-gray-200 bg-gray-50 p-3 leading-6">{message.text}</p>}
    </fieldset>
  );
}
