// 사용자별 AI 호출 제한(서버). 요약·AI 검색·할 일 추출이 같은 한도를 나눠 쓴다.
//   1) 동시 호출: 사용자당 1건. 앞의 요청이 끝나기 전에는 새 요청을 받지 않는다.
//   2) 연속 호출: 사용자당 1분에 5회(최근 60초 안의 호출 수).
// 서버 인스턴스 메모리에서 센다. Vercel 처럼 인스턴스가 여러 개이거나 다시 시작되면 횟수가 초기화되므로
// "연타·반복 호출 방지"용이다. 하루 횟수·서비스 전체 상한은 DB 가 필요해 팀장 협의 사항이다(HISTORY.md 참고).
// 이 파일은 외부 호출을 하지 않고 환경변수도 읽지 않는다. 시간은 주입할 수 있어 테스트가 쉽다.

export const AI_LIMIT_PER_MINUTE = 5;
export const AI_LIMIT_WINDOW_MS = 60_000;

export type AiAcquireResult =
  | { ok: true; /** AI 호출이 끝나면(성공·실패·취소 모두) 반드시 부른다. 여러 번 불러도 안전하다. */ release: () => void }
  | { ok: false; reason: "busy" | "rate_limited"; /** 다시 시도할 때까지 남은 초(올림). busy 는 끝나는 시점을 알 수 없어 참고용 고정값이다 */ retryAfterSec: number; /** 사용자에게 보여 줄 안내 */ message: string };

export type AiRateLimiter = {
  acquire: (userId: string) => AiAcquireResult;
};

type Options = {
  perMinute?: number;
  windowMs?: number;
  now?: () => number;
};

export function createAiRateLimiter({
  perMinute = AI_LIMIT_PER_MINUTE,
  windowMs = AI_LIMIT_WINDOW_MS,
  now = Date.now,
}: Options = {}): AiRateLimiter {
  const calls = new Map<string, number[]>();
  const inFlight = new Set<string>();

  /** 창 밖 기록을 지운다. 기록이 없고 진행 중도 아니면 사용자 항목 자체를 지워 메모리가 계속 늘지 않게 한다. */
  function prune(userId: string, time: number): number[] {
    const recent = (calls.get(userId) ?? []).filter((at) => time - at < windowMs);
    if (recent.length) calls.set(userId, recent);
    else calls.delete(userId);
    return recent;
  }

  return {
    acquire(userId) {
      const time = now();
      // 가끔 다른 사용자의 오래된 기록도 정리한다(항목이 많아졌을 때만).
      if (calls.size > 500) for (const key of [...calls.keys()]) prune(key, time);

      if (inFlight.has(userId)) {
        return { ok: false, reason: "busy", retryAfterSec: 5, message: "이미 처리 중인 AI 요청이 있습니다. 응답에 몇 분 걸릴 수 있으니 끝난 뒤 다시 시도해 주세요." };
      }
      const recent = prune(userId, time);
      if (recent.length >= perMinute) {
        const wait = Math.max(1, Math.ceil((recent[0] + windowMs - time) / 1000));
        return {
          ok: false, reason: "rate_limited", retryAfterSec: wait,
          message: `AI 요청이 너무 잦습니다. 1분에 ${perMinute}회까지 사용할 수 있어요. 약 ${wait}초 뒤에 다시 시도해 주세요.`,
        };
      }
      recent.push(time);
      calls.set(userId, recent);
      inFlight.add(userId);
      let released = false;
      return {
        ok: true,
        release() {
          if (released) return;
          released = true;
          inFlight.delete(userId);
        },
      };
    },
  };
}

/** 실제 route 들이 함께 쓰는 하나의 제한기(같은 서버 인스턴스 안에서 요약·검색·추출이 한도를 공유한다). */
export const aiRateLimiter: AiRateLimiter = createAiRateLimiter();
