export type AiRequestKind = "summary" | "search" | "tasks" | "probe";
export type AiRequest = {
  kind: AiRequestKind;
  controller: AbortController;
  startedAt: number;
};

/** 한 화면의 AI 요청을 동기적으로 잠근다. 서버/다른 탭의 호출량 제한을 대신하지 않는다. */
export function createAiRequestGate(now: () => number = Date.now) {
  let active: AiRequest | null = null;
  let onCancel: (() => void) | undefined;
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of listeners) listener(); };
  return {
    getSnapshot: () => active,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    start(kind: AiRequestKind, cancel?: () => void): AiRequest | null {
      if (active) return null;
      active = { kind, controller: new AbortController(), startedAt: now() };
      onCancel = cancel;
      notify();
      return active;
    },
    finish(request: AiRequest) {
      // 취소한 이전 요청의 finally가 새 요청의 잠금을 풀지 않게 한다.
      if (active !== request) return;
      active = null;
      onCancel = undefined;
      notify();
    },
    cancel(request: AiRequest | null = active) {
      if (!request || active !== request) return;
      const reset = onCancel;
      active = null;
      onCancel = undefined;
      request.controller.abort();
      try { reset?.(); } finally { notify(); }
    },
    dispose() {
      const previous = active;
      active = null;
      onCancel = undefined;
      listeners.clear();
      previous?.controller.abort();
    },
  };
}

export type AiRequestGate = ReturnType<typeof createAiRequestGate>;

export function formatAiElapsed(startedAt: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
