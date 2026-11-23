"use client";
// [B] 보내는 중인 메시지 보관함 (B-2)
//
// 입력창(MessageInput)과 목록(MessageList)은 화면에서 서로 다른 칸에 들어가므로,
// 둘이 같은 데이터를 보도록 이 파일에 작은 공유 저장소를 둔다.
//
// 흐름: Enter → 보관함에 "보내는 중"으로 추가 (화면에 바로 흐리게 표시)
//       → DB 저장 성공: 보관함에서 빼고, 저장된 행을 sent 에 넣음 (목록이 진하게 표시)
//       → 실패: "실패"로 바꿈 → 재전송(같은 client_id 재사용) 또는 삭제
//
// 멱등: client_id 는 처음 만들 때 한 번만 만들고 재전송에도 그대로 쓴다.
//       DB 의 client_id UNIQUE + upsert(ignoreDuplicates) 로 몇 번을 보내도 한 건만 저장된다.
import { useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { MESSAGE_SELECT, type ChatMessage } from "./types";

export type OutboxStatus = "sending" | "failed";
export type OutboxItem = ChatMessage & { status: OutboxStatus };
// 목록에 그릴 메시지: 저장된 것(status 없음) 또는 보내는 중/실패
export type DisplayMessage = ChatMessage & { status?: OutboxStatus };

export const MAX_LENGTH = 4000;

type State = {
  pending: OutboxItem[]; // 보내는 중 / 실패
  sent: ChatMessage[]; // 이번 접속에서 내가 보내서 저장된 메시지 (실시간 B-3 붙기 전까지 목록 반영용)
};

const EMPTY: State = { pending: [], sent: [] };
let state: State = EMPTY;
const listeners = new Set<() => void>();
const inFlight = new Set<string>(); // 전송 중인 client_id (연타해도 동시에 두 번 보내지 않게)

function setState(next: State) {
  state = next;
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useOutbox() {
  return useSyncExternalStore(subscribe, () => state, () => EMPTY);
}

function updatePending(clientId: string, patch: Partial<OutboxItem> | null) {
  setState({
    ...state,
    pending:
      patch === null
        ? state.pending.filter((p) => p.client_id !== clientId)
        : state.pending.map((p) => (p.client_id === clientId ? { ...p, ...patch } : p)),
  });
}

// 메시지 보내기. 화면에는 즉시 나타나고, 저장은 뒤에서 진행된다.
export async function sendMessage(input: {
  channelId: string;
  parentId?: number | null;
  content: string;
}) {
  const content = input.content.trim();
  if (!content || content.length > MAX_LENGTH) return;

  const supabase = createClient();
  // getSession 은 브라우저에 저장된 로그인 정보를 읽으므로 서버 왕복이 없다 (빠름)
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    console.error("[chat] 로그인이 필요합니다");
    return;
  }
  const user = session.user;

  const item: OutboxItem = {
    id: -1, // DB 가 매겨줄 때까지 임시
    client_id: crypto.randomUUID(),
    channel_id: input.channelId,
    user_id: user.id,
    parent_id: input.parentId ?? null,
    content,
    created_at: new Date().toISOString(),
    profiles: {
      name: (user.user_metadata?.name as string | undefined) || user.email?.split("@")[0] || "",
      avatar_url: null,
    },
    status: "sending",
  };
  setState({ ...state, pending: [...state.pending, item] });
  await deliver(item);
}

// 실패한 메시지 재전송 (같은 client_id 그대로)
export function retryMessage(clientId: string) {
  const item = state.pending.find((p) => p.client_id === clientId);
  if (!item || item.status !== "failed") return;
  updatePending(clientId, { status: "sending" });
  return deliver(item);
}

// 다시 연결됐을 때 실패한 메시지를 모두 자동 재전송 (B-4)
// 같은 client_id 를 쓰므로 이전 시도가 사실은 저장됐어도 두 번 저장되지 않는다
export function retryAllFailed() {
  for (const p of state.pending) {
    if (p.status === "failed") retryMessage(p.client_id);
  }
}

// 실패한 메시지 지우기 (DB 에는 저장되지 않은 것)
export function discardMessage(clientId: string) {
  updatePending(clientId, null);
}

async function deliver(item: OutboxItem) {
  if (inFlight.has(item.client_id)) return;
  inFlight.add(item.client_id);
  const supabase = createClient();

  try {
    const row = {
      client_id: item.client_id,
      channel_id: item.channel_id,
      user_id: item.user_id,
      parent_id: item.parent_id,
      content: item.content,
    };
    // 같은 client_id 가 이미 있으면 아무것도 안 함 (= 중복 저장 방지)
    const { data, error } = await supabase
      .from("messages")
      .upsert(row, { onConflict: "client_id", ignoreDuplicates: true })
      .select(MESSAGE_SELECT);
    if (error) throw error;

    let saved = (data as ChatMessage[] | null)?.[0];
    if (!saved) {
      // 이미 저장돼 있던 경우(이전 시도가 사실은 성공)에는 빈 결과가 오므로 직접 찾아온다
      const found = await supabase
        .from("messages")
        .select(MESSAGE_SELECT)
        .eq("client_id", item.client_id)
        .single();
      if (found.error) throw found.error;
      saved = found.data as ChatMessage;
    }

    setState({
      pending: state.pending.filter((p) => p.client_id !== item.client_id),
      sent: [...state.sent, saved],
    });
  } catch (err) {
    console.error("[chat] 메시지 전송 실패", err);
    updatePending(item.client_id, { status: "failed" });
  } finally {
    inFlight.delete(item.client_id);
  }
}

// 서버에서 불러온 목록 + 내가 보낸(저장된) 메시지 + 보내는 중 메시지를 합친다
// parentId 가 null 이면 채널 본문, 숫자면 그 스레드
export function mergeWithOutbox(
  loaded: ChatMessage[],
  outbox: State,
  channelId: string,
  parentId: number | null,
): DisplayMessage[] {
  const belongs = (m: ChatMessage) => m.channel_id === channelId && m.parent_id === parentId;
  const seen = new Set(loaded.map((m) => m.client_id));
  // 이미 불러온 목록보다 오래된 건 붙이지 않는다 (목록 맨 위 이전 메시지는 무한스크롤 담당)
  const oldestId = loaded[0]?.id ?? 0;

  const extra = outbox.sent.filter((m) => belongs(m) && !seen.has(m.client_id) && m.id > oldestId);
  const merged: DisplayMessage[] = extra.length
    ? [...loaded, ...extra].sort((a, b) => a.id - b.id)
    : loaded;

  // 실시간 수신이 서버 응답보다 먼저 도착하면, 같은 메시지가 "보내는 중"과 "저장됨"으로 두 번 보일 수 있다
  // → 이미 목록에 있는 client_id 는 보내는 중 목록에서 뺀다
  for (const m of extra) seen.add(m.client_id);
  const pending = outbox.pending.filter((m) => belongs(m) && !seen.has(m.client_id));
  return pending.length ? [...merged, ...pending] : merged;
}
