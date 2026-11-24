"use client";

// [C] 접속 중 표시 (초록 점) — Supabase Realtime presence 사용 (DB·패키지 변경 없음)
//
// 동작:
//   - 로그인한 사람이 앱을 열면 "online-users" 실시간 채널에 들어가 "나 접속 중"을 알린다 (track)
//   - 다른 사람이 들어오고 나가는 것을 실시간으로 받아 "지금 접속 중인 사용자 id 목록"을 만든다
//   - 탭을 닫거나, 인터넷이 끊기거나, 로그아웃하면 자동으로 목록에서 빠진다
//   - 화면 전체가 연결 하나를 같이 쓴다 (처음 쓰는 컴포넌트가 켜고, 아무도 안 쓰면 끈다)
//
// 개인정보: 알리는 내용은 "사용자 id + 접속 시각"뿐이다. 이름·이메일은 보내지 않는다.
// B(계섭님)의 "입력 중" 방송 채널과는 채널 이름이 달라 서로 겹치지 않는다.
//
// 사용 예:
//   const online = useIsOnline(userId);   // true / false
//   <OnlineDot online={online} />         // OnlineDot.tsx
import { useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";

const CHANNEL_NAME = "online-users";

let onlineIds: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();
let stopFn: (() => void) | null = null;

function setOnline(next: ReadonlySet<string>) {
  // 내용이 같으면 화면을 다시 그리지 않는다
  if (next.size === onlineIds.size && [...next].every((id) => onlineIds.has(id))) return;
  onlineIds = next;
  listeners.forEach((l) => l());
}

function start() {
  let supabase: ReturnType<typeof createClient>;
  try {
    supabase = createClient();
  } catch {
    return () => {}; // .env.local 이 없으면 아무것도 하지 않는다
  }

  let channel: ReturnType<typeof supabase.channel> | null = null;
  let joinedFor: string | null = null; // 지금 어느 사용자로 들어가 있는지
  let stopped = false;

  // 들어가기·나가기가 겹치지 않도록 한 줄로 세워서 차례대로 실행한다
  // (앱을 열 때 "처음 확인"과 "로그인됨" 신호가 거의 동시에 와서 두 번 들어가려는 문제를 막는다)
  let queue: Promise<void> = Promise.resolve();
  const run = (task: () => Promise<void>) => {
    queue = queue.then(task).catch(() => {});
  };

  async function leave() {
    if (channel) {
      const old = channel;
      channel = null;
      joinedFor = null;
      await supabase.removeChannel(old);
    }
    setOnline(new Set());
  }

  async function join() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (stopped || !session) return leave();

    const myId = session.user.id;
    if (channel && joinedFor === myId) return; // 이미 같은 계정으로 들어가 있음
    await leave();
    if (stopped) return;

    const ch = supabase.channel(CHANNEL_NAME, { config: { presence: { key: myId } } });
    channel = ch;
    joinedFor = myId;
    ch.on("presence", { event: "sync" }, () => {
      setOnline(new Set(Object.keys(ch.presenceState())));
    }).subscribe((status) => {
      if (status === "SUBSCRIBED") void ch.track({ online_at: new Date().toISOString() });
    });
  }

  run(join);

  // 로그인·로그아웃·계정 바뀜에 맞춰 다시 들어가거나 나간다
  const { data: auth } = supabase.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") run(leave);
    else if (event === "SIGNED_IN" || event === "USER_UPDATED") run(join);
  });

  return () => {
    stopped = true;
    run(leave);
    auth.subscription.unsubscribe();
  };
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!stopFn) stopFn = start();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && stopFn) {
      stopFn();
      stopFn = null;
    }
  };
}

const getSnapshot = () => onlineIds;
const EMPTY: ReadonlySet<string> = new Set();
const getServerSnapshot = () => EMPTY;

/** 지금 접속 중인 사용자 id 목록 */
export function useOnlineUsers(): ReadonlySet<string> {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** 이 사용자가 지금 접속 중인가 */
export function useIsOnline(userId: string | null | undefined): boolean {
  const online = useOnlineUsers();
  return !!userId && online.has(userId);
}
