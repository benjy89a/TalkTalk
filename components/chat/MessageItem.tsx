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
// 휴대폰(마우스 없는 기기): "마우스를 올리면 보이는" 버튼들은 빼고(자리도 안 차지 → 말풍선이 넓어짐),
//   말풍선을 톡 누르면 아래에 "답글 · 반응 · 답장 · 복사 · 수정 · 삭제" 버튼 줄이 나온다 (컴퓨터에선 이 줄이 안 보임)
// 답장(onQuote): 입력창 위에 "○○님에게 답장" → 보내면 메시지 맨 앞에 "> 이름: 원문" 줄 (composer.ts). 말풍선 안에 인용 칸으로 그림
// 복사: 말풍선 글(인용 줄 빼고)을 클립보드에 복사
// ↑ 키 수정: 입력창이 비어 있을 때 ↑ 를 누르면 그 칸의 내 마지막 메시지가 수정 모드로 (composer.ts 의 수정 요청)
import { useCallback, useRef, useState, type ReactNode } from "react";
import { goToQuoted, splitQuote, useEditRequest, withQuote } from "./composer";
import EmojiPicker, { useDismiss } from "./EmojiPicker";
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
  onQuote?: () => void; // "답장" — 이 메시지를 인용해서 답장
};

// 클립보드 복사. 클립보드 기능이 막힌 브라우저면 예전 방식(execCommand)으로 한 번 더 시도
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  }
}

const BUBBLE = "min-w-0 rounded-2xl px-3 py-1.5 text-sm leading-6 whitespace-pre-wrap break-words";
// Tailwind 4 의 group-hover 는 마우스가 있는 기기에서만 켜진다 → 휴대폰에선 그 버튼들을 아예 뺀다
const HOVER_ONLY = "[@media(hover:none)]:hidden";
// 휴대폰에서만 보이는 것 (말풍선 톡 → 버튼 줄)
const TOUCH_ONLY = "[@media(hover:hover)]:hidden";

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
  onQuote,
}: Props) {
  // 말풍선 최대 폭: 채널 본문은 75%(카톡처럼), 좁은 스레드 패널은 92%
  // 휴대폰처럼 좁은 화면(sm 미만)에서는 카톡처럼 말풍선이 화면 끝까지 (반대쪽엔 시간 글자 자리만 남음)
  const maxW = wide ? "max-w-full sm:max-w-[92%]" : "max-w-full sm:max-w-[75%]";
  const name = message.profiles?.name || "알 수 없음";
  const { status } = message;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  // 이모지 고르는 창: quick = 자주 쓰는 6개 줄, full = 전체 고르기 창 (작업 2)
  const [picking, setPicking] = useState<null | "quick" | "full">(null);
  const [pickBelow, setPickBelow] = useState(false); // 목록 맨 위 근처면 아래로 연다 (위로 열면 잘림)
  const rowRef = useRef<HTMLDivElement>(null);
  const closePicker = useCallback(() => setPicking(null), []);
  // 바깥 클릭 · Esc 로 닫기 (예전엔 마우스가 말풍선 줄을 벗어나면 닫혀서, 창을 누르러 가는 사이 사라졌다)
  useDismiss(rowRef, picking !== null, closePicker);
  function openPicker(kind: "quick" | "full") {
    const row = rowRef.current;
    const box = row?.closest(".overflow-y-auto");
    if (row && box) {
      const room = row.getBoundingClientRect().top - box.getBoundingClientRect().top;
      setPickBelow(room < (kind === "full" ? 280 : 48));
    }
    setPicking(kind);
  }
  // 휴대폰: 말풍선을 톡 누르면 버튼 줄 (바깥을 누르거나 Esc 로 닫힘)
  const [tapOpen, setTapOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const closeTap = useCallback(() => setTapOpen(false), []);
  useDismiss(wrapRef, tapOpen, closeTap);
  const [confirming, setConfirming] = useState(false); // 삭제 확인 줄
  const [actionError, setActionError] = useState<string | null>(null); // 수정·삭제 실패 안내
  // 소프트 삭제된 메시지 (팀장님 005): 줄은 남고 내용은 비어 있음 → 카톡처럼 "삭제된 메시지입니다"
  const deleted = !status && !!message.deleted_at;
  // ↑ 키 수정 요청 (composer.ts): 이 메시지가 대상이면 수정 모드로. 요청마다 번호가 달라서 한 번만 열린다
  // (효과 안에서 상태를 바꾸지 않고, 그릴 때 "새 요청인지"만 비교 — React 권장 방식)
  // 답장 인용 줄 (맨 앞 "> 이름: 원문") 과 본문 — 수정할 때도 본문만 고치고 인용은 그대로 둔다
  const { quote, body } = splitQuote(message.content);
  const editReq = useEditRequest();
  const [seenEditNonce, setSeenEditNonce] = useState(editReq?.nonce);
  if (editReq && editReq.nonce !== seenEditNonce) {
    setSeenEditNonce(editReq.nonce);
    if (editReq.messageId === message.id && mine && !status && !deleted && !editing) {
      setActionError(null);
      setConfirming(false);
      setDraft(body);
      setEditing(true);
    }
  }
  // 카톡 "답장"처럼: 말풍선 맨 위에 "○○에게 답장" + 원문 한 줄(흐리게), 그 아래 "↳ 내 답장" (ㄴ> 모양 화살표로 이어짐)
  // 인용 칸을 누르면 원래 글 위치로 이동 + 잠깐 노랗게 (composer.ts goToQuoted → focus.ts)
  const [finding, setFinding] = useState(false);
  async function openQuoted() {
    if (!quote || finding || status) return;
    setFinding(true);
    setActionError(null);
    const ok = await goToQuoted(message.channel_id, message.id, quote);
    setFinding(false);
    if (!ok) setActionError("원래 메시지를 찾지 못했어요. 삭제됐거나 내용이 바뀌었을 수 있어요.");
  }
  const quoteBlock = quote ? (
    <span
      role="button"
      tabIndex={status ? -1 : 0}
      title="원래 메시지로 이동"
      aria-label={`${quote.name}의 원래 메시지로 이동: ${quote.text}`}
      onClick={(e) => {
        e.stopPropagation(); // 휴대폰에서 말풍선 톡(버튼 줄 열기)과 겹치지 않게
        openQuoted();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openQuoted();
        }
      }}
      className={`mb-1 block min-w-36 cursor-pointer rounded-lg px-2 py-1 transition-colors focus-visible:ring-2 focus-visible:outline-none ${
        mine ? "bg-white/10 hover:bg-white/20 focus-visible:ring-white/70" : "bg-gray-200/70 hover:bg-gray-300/70 focus-visible:ring-[#1e325c]"
      } ${finding ? "opacity-60" : ""}`}
    >
      <span className={`block text-xs leading-5 font-semibold ${mine ? "text-white" : "text-gray-900"}`}>
        {quote.name}에게 답장
      </span>
      <span className={`block truncate text-xs leading-5 ${mine ? "text-white/65" : "text-gray-500"}`}>{quote.text}</span>
    </span>
  ) : null;
  const bubbleBody = (onDark: boolean) =>
    quote ? (
      <span className="flex gap-1">
        <span aria-hidden className={`shrink-0 font-semibold ${onDark ? "text-white/70" : "text-gray-500"}`}>
          ↳
        </span>
        <span className="min-w-0">{formatText(body, onDark)}</span>
      </span>
    ) : (
      formatText(body, onDark)
    );
  // 복사 (잠깐 "복사했어요" 안내)
  const [copied, setCopied] = useState(false);
  async function copyMessage() {
    const ok = await copyText(body);
    if (!ok) return setActionError("복사하지 못했어요. 글을 길게 눌러 직접 복사해 주세요.");
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }
  const deletedBubble = (
    <p className={`${BUBBLE} border border-gray-200 bg-white text-gray-400 italic`}>삭제된 메시지입니다</p>
  );

  async function saveEdit() {
    const next = draft.trim();
    if (!next || busy) return;
    const content = withQuote(quote ?? undefined, next); // 인용 줄은 그대로 붙여서 저장
    if (content === message.content) return setEditing(false);
    setBusy(true);
    const ok = await editMessage(message.id, content);
    setBusy(false);
    if (ok) setEditing(false);
    else setActionError("메시지를 수정하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }

  // 소프트 삭제(팀장님 005): 말풍선은 "삭제된 메시지입니다"로 남고 답글은 그대로. 되돌릴 수는 없다.
  // 확인은 브라우저 팝업(window.confirm) 대신 말풍선 아래 작은 확인 줄로 한다
  // → 앱 안 브라우저 등 팝업이 막힌 곳에서는 confirm 이 바로 "아니요"가 되어 삭제가 아무 반응 없이 멈췄음
  async function confirmDelete() {
    if (busy) return;
    setBusy(true);
    const ok = await deleteMessage(message.id);
    setBusy(false);
    setConfirming(false);
    if (!ok) setActionError("메시지를 삭제하지 못했어요. 잠시 후 다시 시도해 주세요.");
  }

  // 내 메시지(저장 완료)에만: 마우스를 올리면 보이는 "수정 · 삭제"
  const ownActions =
    mine && !status && !editing && !deleted && !confirming ? (
      <span className={`invisible flex shrink-0 gap-1 text-[11px] leading-4 font-medium text-gray-500 group-hover:visible focus-within:visible ${HOVER_ONLY}`}>
        <button
          type="button"
          onClick={() => {
            setActionError(null);
            setDraft(body);
            setEditing(true);
          }}
          className="rounded px-1 hover:text-[#1e325c]"
        >
          수정
        </button>
        <button
          type="button"
          onClick={() => {
            setActionError(null);
            setConfirming(true);
          }}
          className="rounded px-1 hover:text-red-600"
        >
          삭제
        </button>
      </span>
    ) : null;

  // 저장된 메시지 모두: 마우스를 올리면 보이는 "답장 · 복사"
  const extraActions =
    !status && !editing && !deleted && !confirming ? (
      <span className={`invisible flex shrink-0 gap-1 text-[11px] leading-4 font-medium text-gray-500 group-hover:visible focus-within:visible ${HOVER_ONLY}`}>
        {onQuote && (
          <button type="button" onClick={onQuote} className="rounded px-1 hover:text-[#1e325c]">
            답장
          </button>
        )}
        <button type="button" onClick={copyMessage} className="rounded px-1 hover:text-[#1e325c]">
          {copied ? "복사됨 ✓" : "복사"}
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
        className={`invisible shrink-0 rounded px-1 text-[11px] leading-4 font-medium text-gray-500 group-hover:visible hover:text-[#1e325c] focus-visible:visible ${HOVER_ONLY}`}
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
      aria-expanded={picking !== null}
      onClick={() => (picking ? setPicking(null) : openPicker("quick"))}
      className={`${picking ? "visible" : "invisible"} shrink-0 rounded px-1 text-[13px] leading-4 text-gray-500 group-hover:visible hover:text-[#1e325c] focus-visible:visible ${HOVER_ONLY}`}
    >
      😊+
    </button>
  ) : null;
  // 고르는 창은 버튼이 아니라 말풍선 줄 기준으로 띄운다 → 좁은 스레드 패널에서도 화면 밖으로 잘리지 않음
  // (상대 메시지는 말풍선 왼쪽 끝부터, 내 메시지는 오른쪽 끝부터)
  const isMine = (emoji: string) => !!reactions?.find((r) => r.emoji === emoji && r.mine);
  const pick = (emoji: string) => {
    setPicking(null);
    onReact?.(emoji, isMine(emoji));
  };
  const place = `absolute ${pickBelow ? "top-full mt-1" : "bottom-full mb-1"} ${mine ? "right-0" : "left-0"}`;
  const picker =
    canReact && picking === "quick" ? (
      <span
        role="menu"
        className={`${place} z-20 flex gap-0.5 rounded-full border border-gray-200 bg-white px-1.5 py-1 shadow-md`}
      >
        {REACTION_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            role="menuitem"
            aria-label={`${emoji} 반응`}
            onClick={() => pick(emoji)}
            className={`rounded-full px-1 text-lg leading-6 transition-transform hover:scale-125 ${isMine(emoji) ? "bg-blue-50" : ""}`}
          >
            {emoji}
          </button>
        ))}
        {/* 더 많은 이모지 */}
        <button
          type="button"
          role="menuitem"
          aria-label="다른 이모지 고르기"
          onClick={() => openPicker("full")}
          className="rounded-full px-1.5 text-lg leading-6 text-gray-500 hover:bg-gray-100 hover:text-[#1e325c]"
        >
          ＋
        </button>
      </span>
    ) : canReact && picking === "full" ? (
      <EmojiPicker onPick={pick} selected={isMine} className={place} />
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

  // 삭제 확인 줄 / 실패 안내 (내 메시지 말풍선 바로 아래, 오른쪽 정렬)
  const replyCount = thread?.count ?? 0;
  const confirmBar =
    confirming && !deleted ? (
      <div
        role="alertdialog"
        aria-label="메시지 삭제 확인"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault(); // 스레드 패널 닫기(Esc)와 겹치지 않게
            setConfirming(false);
          }
        }}
        className={`mt-1 flex ${maxW} flex-wrap items-center justify-end gap-x-2 gap-y-1 text-[11px] leading-4 text-gray-600`}
      >
        <span>
          삭제하면 &lsquo;삭제된 메시지입니다&rsquo;로 바뀌고 되돌릴 수 없어요.
          {replyCount > 0 && ` 답글 ${replyCount}개는 그대로 남아요.`}
        </span>
        <span className="flex gap-1">
          <button
            type="button"
            autoFocus // 실수로 Enter 를 눌러도 지워지지 않게 "취소"에 먼저 초점
            onClick={() => setConfirming(false)}
            className="rounded border border-gray-300 bg-white px-2 py-0.5 font-medium hover:bg-gray-50"
          >
            취소
          </button>
          <button
            type="button"
            onClick={confirmDelete}
            disabled={busy}
            className="rounded bg-red-600 px-2 py-0.5 font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            {busy ? "삭제 중…" : "삭제"}
          </button>
        </span>
      </div>
    ) : null;
  const copiedLine = copied ? (
    <p role="status" className={`mt-1 text-[11px] leading-4 text-gray-500 ${TOUCH_ONLY}`}>
      복사했어요
    </p>
  ) : null;
  const errorLine = actionError ? (
    <p role="alert" className="mt-1 text-[11px] leading-4 text-red-600">
      {actionError}
    </p>
  ) : null;

  // 휴대폰: 말풍선을 톡 누르면 나오는 버튼 줄 (손가락으로 누르기 좋게 크게)
  const canTap = !status && !deleted && !editing && !confirming;
  type TapKey = "reply" | "react" | "quote" | "copy" | "edit" | "delete";
  const tapButtons: { key: TapKey; label: string }[] = [];
  if (canTap && onOpenThread) tapButtons.push({ key: "reply", label: hasReplies ? `답글 ${thread.count}개` : "답글" });
  if (canTap && canReact) tapButtons.push({ key: "react", label: "😊 반응" });
  if (canTap && onQuote) tapButtons.push({ key: "quote", label: "답장" });
  if (canTap) tapButtons.push({ key: "copy", label: "복사" });
  if (canTap && mine) tapButtons.push({ key: "edit", label: "수정" }, { key: "delete", label: "삭제" });
  function runTap(key: TapKey) {
    setTapOpen(false);
    setActionError(null);
    if (key === "reply") onOpenThread?.();
    else if (key === "react") openPicker("quick");
    else if (key === "quote") onQuote?.();
    else if (key === "copy") copyMessage();
    else if (key === "edit") {
      setDraft(body);
      setEditing(true);
    } else setConfirming(true);
  }
  const tapBar =
    tapOpen && tapButtons.length > 0 ? (
      <div role="toolbar" aria-label="메시지 메뉴" className={`${TOUCH_ONLY} mt-1 flex flex-wrap gap-1.5 ${mine ? "justify-end" : ""}`}>
        {tapButtons.map((b) => (
          <button
            key={b.key}
            type="button"
            data-thread-trigger={b.key === "reply" || undefined}
            onClick={() => runTap(b.key)}
            className={`min-h-8 rounded-full border bg-white px-3 text-xs font-medium ${
              b.key === "delete" ? "border-red-200 text-red-600" : "border-gray-300 text-gray-700"
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>
    ) : null;
  // 말풍선을 누르면 버튼 줄 열고 닫기 — 마우스 없는 기기에서만
  // (컴퓨터에서 열리면 안 보이는 줄이 Esc 한 번을 가로채 스레드가 안 닫힐 수 있음)
  const onBubbleTap = canTap
    ? () => {
        if (window.matchMedia("(hover: none)").matches) setTapOpen((v) => !v);
      }
    : undefined;

  const rowBg = active ? "bg-blue-50" : "";
  // 첨부 칸 (D) — 저장된 메시지에만
  const attachments = renderAttachments && !status && !deleted ? renderAttachments(message) : null;

  if (mine) {
    return (
      <div ref={wrapRef} className={`group flex flex-col items-end rounded-md px-2 ${rowBg} ${first ? "mt-3" : "mt-1"}`}>
        <div ref={rowRef} className={`relative flex ${maxW} items-end gap-1.5`}>
          {picker}
          {extraActions}
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
              onClick={onBubbleTap}
            >
              {quoteBlock}
              {bubbleBody(true)}
            </p>
          )}
        </div>
        {tapBar}
        {copiedLine}
        {confirmBar}
        {errorLine}
        {attachments && <div className={`mt-1 ${maxW}`}>{attachments}</div>}
        {reactionChips}
        {replyLink}
      </div>
    );
  }

  return (
    <div ref={wrapRef} className={`group flex gap-2 rounded-md px-2 ${rowBg} ${first ? "mt-3" : "mt-1"}`}>
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
        <div ref={rowRef} className={`relative flex ${maxW} items-end gap-1.5`}>
          {picker}
          {deleted ? (
            deletedBubble
          ) : (
            <p className={`${BUBBLE} bg-gray-100 text-gray-900`} onClick={onBubbleTap}>
              {quoteBlock}
              {bubbleBody(false)}
            </p>
          )}
          {side}
          {reactButton}
          {replyButton}
          {extraActions}
        </div>
        {tapBar}
        {copiedLine}
        {errorLine}
        {attachments && <div className={`mt-1 ${maxW}`}>{attachments}</div>}
        {reactionChips}
        {replyLink}
      </div>
    </div>
  );
}
