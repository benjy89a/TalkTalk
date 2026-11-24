"use client";
// [B] 말풍선 ↔ 입력창 사이 공유 저장소 (threads.ts 와 같은 방식)
//
// 1) 답장 인용 (카톡 "답장"): 말풍선에서 "답장"을 누르면 그 입력창 위에 "○○에게 답장" 줄이 뜨고,
//    보내면 메시지 맨 앞에 "> 이름: 원문" 한 줄이 붙는다. DB 는 그대로 (내용 글자에만 붙음)
//    → 검색·AI 요약에서도 "> 이름: 원문" 으로 자연스럽게 읽힌다.
//    말풍선 안 인용 칸을 누르면 원래 글 위치로 이동 (goToQuoted). 원문 id 는 글에 넣지 않으므로(숫자가 보여 지저분함)
//    같은 채널에서 이 답장보다 앞선 글 중 "보낸 사람 이름 + 인용 글자"가 같은 가장 최근 글을 찾아간다.
// 2) ↑ 키로 마지막 메시지 수정: 입력창이 비어 있을 때 ↑ → 그 칸(채널 본문/스레드)의 내 마지막 메시지가 수정 모드로
//    MessageRows 가 "내 마지막 메시지 id" 를 칸마다 알려 두고, 입력창이 수정 요청을 보낸다.
import { useSyncExternalStore } from "react";
import { createClient } from "@/lib/supabase/client";
import { focusMessage } from "./focus";
import { MESSAGE_SELECT } from "./types";

// 칸 이름: 채널 본문 "채널id:root", 스레드 "채널id:원본id"
export function composerScope(channelId: string, parentId: number | null) {
  return `${channelId}:${parentId ?? "root"}`;
}

export type Quote = { name: string; text: string };
type EditRequest = { messageId: number; nonce: number };

let quotes: Record<string, Quote | undefined> = {};
let editRequest: EditRequest | null = null;
const lastMine: Record<string, number | undefined> = {};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

// ---- 답장 인용 ----
const QUOTE_MAX = 50; // 인용 줄에 남길 원문 글자 수

// 이미 답장인 메시지를 다시 답장하면 원래 인용 줄은 빼고 본문 첫 줄만 쓴다
export function quoteSnippet(content: string) {
  // 굵게·취소선·코드·색 글자 표시(**, ~~, `, {빨강:글자})는 빼고 글자만
  const firstLine = (splitQuote(content).body.trim().split("\n")[0] ?? "")
    .replace(/\{[^{}:\n]+:([^{}\n]+)\}/g, "$1")
    .replace(/\*\*|~~|`/g, "")
    .trim();
  return firstLine.length > QUOTE_MAX ? `${firstLine.slice(0, QUOTE_MAX)}…` : firstLine;
}

export function setQuote(scope: string, quote: Quote | null) {
  quotes = { ...quotes, [scope]: quote ?? undefined };
  emit();
}

export function useQuote(scope: string) {
  return useSyncExternalStore(subscribe, () => quotes[scope], () => undefined);
}

// 보낼 때: "> 이름: 원문" + 줄바꿈 + 내 글
export function withQuote(quote: Quote | undefined, text: string) {
  if (!quote) return text;
  return `> ${quote.name.replace(/[:\n]/g, " ")}: ${quote.text.replace(/\n/g, " ")}\n${text}`;
}

// 인용 칸을 누르면 원래 글로 이동. 못 찾으면(삭제됨 · 수정돼서 글자가 달라짐) false
export async function goToQuoted(channelId: string, replyId: number, quote: Quote) {
  // DB 에서 후보를 좁힐 낱말: 인용 글자 중 가장 긴 낱말 (%, _ 같은 검색 기호는 글자 그대로)
  const words = quote.text.replace(/…$/, "").split(/\s+/).filter(Boolean);
  const word = words.sort((a, b) => b.length - a.length)[0] ?? "";
  const pattern = `%${word.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const { data, error } = await createClient()
    .from("messages")
    .select(MESSAGE_SELECT)
    .eq("channel_id", channelId)
    .lt("id", replyId)
    .is("deleted_at", null)
    .ilike("content", pattern)
    .order("id", { ascending: false })
    .limit(30);
  if (error || !data) {
    console.error("[chat] 답장 원문 찾기 실패", error);
    return false;
  }
  const hit = data.find((m) => quoteSnippet(m.content) === quote.text && (m.profiles?.name || "알 수 없음") === quote.name);
  if (!hit) return false;
  await focusMessage(channelId, hit.id);
  return true;
}

// 그릴 때: 맨 앞 "> 이름: 원문" 줄을 떼어 낸다 (없으면 quote 없음)
const QUOTE_RE = /^> ([^\n:]{1,40}): ([^\n]*)\n([\s\S]*)$/;
export function splitQuote(content: string): { quote: Quote | null; body: string } {
  const m = QUOTE_RE.exec(content);
  if (!m) return { quote: null, body: content };
  return { quote: { name: m[1], text: m[2] }, body: m[3] };
}

// ---- ↑ 키로 마지막 메시지 수정 ----
export function setLastMine(scope: string, messageId: number | undefined) {
  lastMine[scope] = messageId; // 화면을 다시 그릴 필요 없는 값이라 알림(emit) 없음
}

// 수정할 내 메시지가 있으면 true (없으면 입력창의 ↑ 는 원래대로 커서 이동)
export function requestEditLast(scope: string) {
  const messageId = lastMine[scope];
  if (messageId === undefined) return false;
  editRequest = { messageId, nonce: (editRequest?.nonce ?? 0) + 1 };
  emit();
  return true;
}

export function useEditRequest() {
  return useSyncExternalStore(subscribe, () => editRequest, () => null);
}
