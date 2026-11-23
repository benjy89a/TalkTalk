"use client";
// [B] 메시지 한 줄 — 카톡처럼 상대방은 왼쪽, 나는 오른쪽 말풍선
// mine  : 내 메시지면 오른쪽(남색), 아니면 왼쪽(회색)
// first : 같은 사람이 5분 안에 연달아 보낸 묶음의 첫 메시지 → 상대방은 아바타·이름 표시
// last  : 묶음의 마지막 메시지 → 말풍선 옆에 시간 표시
// status: "sending"(보내는 중, 흐리게) / "failed"(실패, 재전송·삭제) / 없음(저장됨)
// thread: 답글 수·마지막 답글 시간 (B-5). 답글이 있으면 말풍선 아래 "답글 n개 · 시간",
//         없으면 마우스를 올렸을 때만 말풍선 옆에 "답글" 버튼
// renderAttachments: 말풍선 아래에 첨부를 그릴 칸 (D 첨부 기능이 채움, CONTRACTS.md)
//                    보내는 중/실패 메시지는 아직 DB id 가 없으므로 그리지 않는다
// 내 메시지(저장된 것)에 마우스를 올리면 "수정 · 삭제" → 수정은 말풍선 자리에서 바로 (Enter 저장 · Esc 취소)
import { useState, type ReactNode } from "react";
import { deleteMessage, editMessage } from "./messageActions";
import { REACTION_EMOJIS, type ReactionSummary } from "./useReactions";
import { discardMessage, retryMessage, type DisplayMessage } from "./outbox";
import { formatTime } from "./format";
import { formatText } from "./formatText";

type Props = {
  message: DisplayMessage;
  mine: boolean;
  first: boolean;
  last: boolean;
  thread?: { count: number; lastAt: string };
  onOpenThread?: () => void;
  active?: boolean; // 지금 스레드 패널에 열린 메시지
  renderAttachments?: (message: DisplayMessage) => ReactNode;
  // 좁은 칸(스레드 패널)용: 말풍선을 더 넓게(92%) 써서 글씨가 세로로 길게 꺾이지 않게
  wide?: boolean;
  // 이모지 반응 (추가 기능 ③): 말풍선 아래 "👍 2" 칩 + 마우스를 올리면 😊+ 로 고르기
  reactions?: ReactionSummary;
  onReact?: (emoji: string, alreadyMine: boolean) => void;
};

const BUBBLE = "min-w-0 rounded-2xl px-3 py-1.5 text-sm leading-6 whitespace-pre-wrap break-words";

export default function MessageItem({
  message,
  mine,
  first,
  last,
  thread,
  onOpenThread,
  active,
  renderAttachments,
  wide = false,
  reactions,
  onReact,
}: Props) {
  // 말풍선 최대 폭: 채널 본문은 75%(카톡처럼), 좁은 스레드 패널은 92%
  const maxW = wide ? "max-w-[92%]" : "max-w-[75%]";
  const name = message.profiles?.name || "알 수 없음";
  const { status } = message;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false); // 이모지 고르는 창
  // 소프트 삭제된 메시지 (팀장님 005): 줄은 남고 내용은 비어 있음 → 카톡처럼 "삭제된 메시지입니다"
  const deleted = !status && !!message.deleted_at;
  const deletedBubble = (
    <p className={`${BUBBLE} border border-gray-200 bg-white text-gray-400 italic`}>삭제된 메시지입니다</p>
  );

  async function saveEdit() {
    const next = draft.trim();
    if (!next || busy) return;
    if (next === message.content) return setEditing(false);
    setBusy(true);
    const ok = await editMessage(message.id, next);
    setBusy(false);
    if (ok) setEditing(false);
    else alert("메시지를 수정하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }

  async function onDelete() {
    // 소프트 삭제(팀장님 005): 말풍선은 "삭제된 메시지입니다"로 남고 답글은 그대로. 되돌릴 수는 없다.
    const replies = thread?.count ?? 0;
    const ask =
      "이 메시지를 삭제할까요?\n'삭제된 메시지입니다'로 바뀌고 되돌릴 수 없어요." +
      (replies > 0 ? `\n답글 ${replies}개는 그대로 남아요.` : "");
    if (!window.confirm(ask)) return;
    const ok = await deleteMessage(message.id);
    if (!ok) alert("메시지를 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }

  // 내 메시지(저장 완료)에만: 마우스를 올리면 보이는 "수정 · 삭제"
  const ownActions =
    mine && !status && !editing && !deleted ? (
      <span className="invisible flex shrink-0 gap-1 text-[11px] leading-4 font-medium text-gray-500 group-hover:visible focus-within:visible">
        <button
          type="button"
          onClick={() => {
            setDraft(message.content);
            setEditing(true);
          }}
          className="rounded px-1 hover:text-[#1e325c]"
        >
          수정
        </button>
        <button type="button" onClick={onDelete} className="rounded px-1 hover:text-red-600">
          삭제
        </button>
      </span>
    ) : null;

  // 말풍선 옆 작은 글씨: 실패면 재전송·삭제, 묶음의 마지막이면 시간
  // 내용을 고친 적 있는 저장된 메시지 (팀장님 005: DB 가 수정 시각 자동 기록)
  const edited = !status && !!message.edited_at && !deleted;
  const side =
    status === "failed" ? (
      <span className="flex shrink-0 flex-col items-end text-[11px] leading-4 text-red-600" role="alert">
        전송 실패
        <span className="flex gap-1">
          <button type="button" onClick={() => retryMessage(message.client_id)} className="font-medium underline hover:text-red-700">
            재전송
          </button>
          <button type="button" onClick={() => discardMessage(message.client_id)} className="font-medium underline hover:text-red-700">
            삭제
          </button>
        </span>
      </span>
    ) : (last && status !== "sending") || edited ? (
      // 수정된 메시지는 시간 위에 "수정됨" (같은 사람이 연달아 보내 시간이 숨은 줄에도 "수정됨"은 보인다)
      <span className={`flex shrink-0 flex-col text-[11px] leading-4 whitespace-nowrap text-gray-500 ${mine ? "items-end" : "items-start"}`}>
        {edited && (
          <span title={`수정: ${formatTime(message.edited_at!)}`} aria-label="수정된 메시지">
            수정됨
          </span>
        )}
        {last && status !== "sending" && <time dateTime={message.created_at}>{formatTime(message.created_at)}</time>}
      </span>
    ) : null;

  const hasReplies = !!thread && thread.count > 0;
  // 답글이 없을 때: 마우스를 올리면 말풍선 옆에 나타나는 버튼 (가로 공간만 써서 줄 간격이 안 벌어짐)
  const replyButton =
    onOpenThread && !hasReplies && !deleted ? (
      <button
        type="button"
        onClick={onOpenThread}
        data-thread-trigger
        className="invisible shrink-0 rounded px-1 text-[11px] leading-4 font-medium text-gray-500 group-hover:visible hover:text-[#1e325c] focus-visible:visible"
      >
        답글
      </button>
    ) : null;
  // 답글이 있을 때: 말풍선 아래 "답글 n개 · 마지막 답글 시간"
  const replyLink =
    onOpenThread && hasReplies ? (
      <button
        type="button"
        onClick={onOpenThread}
        data-thread-trigger
        className="mt-0.5 text-xs leading-5 font-medium text-blue-700 hover:underline"
      >
        답글 {thread.count}개 · {formatTime(thread.lastAt)}
      </button>
    ) : null;
  // 이모지 반응: 마우스를 올리면 보이는 😊+ 버튼과 고르는 창 (저장된 메시지에만)
  const canReact = !!onReact && !status && !editing && !deleted;
  const reactButton = canReact ? (
    <button
      type="button"
      aria-label="이모지 반응 달기"
      aria-expanded={picking}
      onClick={() => setPicking((v) => !v)}
      className={`${picking ? "visible" : "invisible"} shrink-0 rounded px-1 text-[13px] leading-4 text-gray-500 group-hover:visible hover:text-[#1e325c] focus-visible:visible`}
    >
      😊+
    </button>
  ) : null;
  // 고르는 창은 버튼이 아니라 말풍선 줄 기준으로 띄운다 → 좁은 스레드 패널에서도 화면 밖으로 잘리지 않음
  // (상대 메시지는 말풍선 왼쪽 끝부터, 내 메시지는 오른쪽 끝부터)
  const picker =
    canReact && picking ? (
      <span
        role="menu"
        className={`absolute bottom-full z-20 mb-1 flex gap-0.5 rounded-full border border-gray-200 bg-white px-1.5 py-1 shadow-md ${mine ? "right-0" : "left-0"}`}
      >
        {REACTION_EMOJIS.map((emoji) => {
          const already = !!reactions?.find((r) => r.emoji === emoji && r.mine);
          return (
            <button
              key={emoji}
              type="button"
              role="menuitem"
              aria-label={`${emoji} 반응`}
              onClick={() => {
                setPicking(false);
                onReact?.(emoji, already);
              }}
              className={`rounded-full px-1 text-lg leading-6 transition-transform hover:scale-125 ${already ? "bg-blue-50" : ""}`}
            >
              {emoji}
            </button>
          );
        })}
      </span>
    ) : null;
  // 말풍선 아래 반응 칩: 누르면 달기/취소, 내가 누른 건 파랗게
  const reactionChips =
    !deleted && reactions && reactions.length > 0 ? (
      <span className={`mt-1 flex flex-wrap gap-1 ${mine ? "justify-end" : ""}`}>
        {reactions.map((r) => (
          <button
            key={r.emoji}
            type="button"
            disabled={!onReact}
            onClick={() => onReact?.(r.emoji, r.mine)}
            aria-pressed={r.mine}
            aria-label={`${r.emoji} ${r.count}명${r.mine ? " (나 포함)" : ""}`}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs leading-4 transition-colors ${
              r.mine
                ? "border-blue-300 bg-blue-50 font-semibold text-blue-700 hover:bg-blue-100"
                : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            <span className="text-sm">{r.emoji}</span>
            {r.count}
          </button>
        ))}
      </span>
    ) : null;

  const rowBg = active ? "bg-blue-50" : "";
  // 첨부 칸 (D) — 저장된 메시지에만
  const attachments = renderAttachments && !status && !deleted ? renderAttachments(message) : null;

  if (mine) {
    return (
      <div className={`group flex flex-col items-end rounded-md px-2 ${rowBg} ${first ? "mt-3" : "mt-1"}`}>
        <div
          className={`relative flex ${maxW} items-end gap-1.5`}
          onMouseLeave={() => setPicking(false)}
        >
          {picker}
          {ownActions}
          {reactButton}
          {replyButton}
          {side}
          {editing ? (
            <div className="flex min-w-0 flex-1 flex-col items-end gap-1">
              <textarea
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault(); // 스레드 패널의 "Esc 로 닫기"가 같이 실행되지 않게
                    setEditing(false);
                  } else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    saveEdit();
                  }
                }}
                rows={Math.min(6, draft.split("\n").length)}
                aria-label="메시지 수정"
                className="w-72 max-w-full resize-none rounded-2xl border border-[#1e325c] bg-white px-3 py-1.5 text-sm leading-6 text-gray-900 focus-visible:ring-2 focus-visible:ring-[#1e325c] focus-visible:outline-none"
              />
              <span className="flex gap-2 text-[11px] leading-4 text-gray-500">
                Enter 저장 · Esc 취소
                <button type="button" onClick={() => setEditing(false)} className="font-medium hover:text-gray-800">
                  취소
                </button>
                <button type="button" onClick={saveEdit} disabled={busy} className="font-medium text-[#1e325c] hover:underline disabled:opacity-50">
                  저장
                </button>
              </span>
            </div>
          ) : deleted ? (
            deletedBubble
          ) : (
            <p
              className={`${BUBBLE} bg-[#1e325c] text-white ${status ? "opacity-60" : ""}`}
              aria-busy={status === "sending" || undefined}
            >
              {formatText(message.content, true)}
            </p>
          )}
        </div>
        {attachments && <div className={`mt-1 ${maxW}`}>{attachments}</div>}
        {reactionChips}
        {replyLink}
      </div>
    );
  }

  return (
    <div className={`group flex gap-2 rounded-md px-2 ${rowBg} ${first ? "mt-3" : "mt-1"}`}>
      {/* 왼쪽: 묶음 첫 메시지에만 아바타, 나머지는 같은 너비의 빈칸 */}
      <div className="w-9 shrink-0">
        {first && (
          <div
            aria-hidden
            className="flex h-9 w-9 items-center justify-center rounded-full bg-gray-300 text-sm font-semibold text-gray-700"
          >
            {name.slice(0, 1)}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        {first && <p className="mb-1 text-xs leading-5 font-semibold text-gray-700">{name}</p>}
        <div
          className={`relative flex ${maxW} items-end gap-1.5`}
          onMouseLeave={() => setPicking(false)}
        >
          {picker}
          {deleted ? deletedBubble : <p className={`${BUBBLE} bg-gray-100 text-gray-900`}>{formatText(message.content, false)}</p>}
          {side}
          {reactButton}
          {replyButton}
        </div>
        {attachments && <div className={`mt-1 ${maxW}`}>{attachments}</div>}
        {reactionChips}
        {replyLink}
      </div>
    </div>
  );
}
