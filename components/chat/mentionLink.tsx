"use client";
// [B] 말풍선 안 "@이름" 멘션 표시 + "나를 멘션한 사람"에게 바로 답장 · 다이렉트 메시지
//
// 목적 (계섭님): 누가 나를 멘션했을 때, 그 메시지를 보낸 사람에게 답장하거나 DM 을 보내게 한다.
// - 나를 멘션한 것(@내이름): 밑줄 링크. 누르면 메뉴 "○○님이 나를 멘션했어요" · "↳ ○○에게 답장" · "💬 ○○에게 다이렉트 메시지"
//   (○○ = 그 메시지를 보낸 사람. 내가 보낸 메시지면 DM 은 빠짐)
// - 다른 사람을 멘션한 것: 누를 수 없고 이름만 굵게 · 색으로 강조 (헷갈리지 않게)
// - "@" 는 빼고 이름만 보인다. 회색 말풍선엔 보라, 남색 말풍선엔 밝은 노랑
//
// - MentionProvider (MessageList · ThreadView 가 감쌈): 지금 채널 멤버 이름 목록 + DM 열기
//   · DM 은 서보님(C) openOrCreateDm 으로 열고(없으면 만듦), 팀장님 layout 의 selectChannel 로 그 DM 으로 이동 (가져다 쓰기만)
// - SenderContext (MessageItem 이 말풍선마다 감쌈): 그 메시지를 보낸 사람 + 그 메시지에 답장하기(composer.ts setQuote)
// - formatText 가 "@글자" 를 만나면 MentionLink 를 그린다
//   · 멤버 이름 중 가장 긴 것부터 맞춰 봄 → "@수정님" 처럼 호칭이 붙어도 "수정" 만 강조, "님" 은 그냥 글자
//   · 채널 멤버가 아닌 이름(예: 이메일 a@b, 아무 글자)은 그대로 둔다
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { openOrCreateDm } from "@/components/channel/dm";
import { useSelectedChannel } from "@/components/layout/ChannelContext";
import { createClient } from "@/lib/supabase/client";
import { useDismiss } from "./EmojiPicker";
import { useCurrentUserId } from "./useCurrentUserId";

type Member = { id: string; name: string };
type MentionValue = {
  members: Member[]; // 이름이 긴 것부터 (앞부분이 겹치는 이름을 바르게 고르려고)
  myId: string | null;
  openDm: (partnerId: string) => Promise<boolean>;
};

const MentionContext = createContext<MentionValue | null>(null);
// 이 말풍선을 보낸 사람과 "이 메시지에 답장" 동작
export type Sender = { id: string; name: string; onReply?: () => void };
export const SenderContext = createContext<Sender | null>(null);

export function MentionProvider({ channelId, children }: { channelId: string; children: ReactNode }) {
  const [loaded, setLoaded] = useState<{ channelId: string; members: Member[] } | null>(null);
  const myId = useCurrentUserId();
  const { selectChannel, refreshDmList } = useSelectedChannel();

  useEffect(() => {
    let active = true;
    createClient()
      .from("channel_members")
      .select("user_id, profiles(id, name)")
      .eq("channel_id", channelId)
      .then(({ data, error }) => {
        if (!active) return;
        if (error || !data) {
          console.error("[chat] 멘션용 멤버 이름을 불러오지 못함", error);
          return;
        }
        const members = data
          .filter((m) => m.profiles?.name)
          .map((m) => ({ id: m.user_id, name: m.profiles!.name.trim() }))
          .filter((m) => m.name)
          .sort((a, b) => b.name.length - a.name.length);
        setLoaded({ channelId, members });
      });
    return () => {
      active = false;
    };
  }, [channelId]);

  const openDm = useCallback(
    async (partnerId: string) => {
      if (!myId) return false;
      try {
        const id = await openOrCreateDm(createClient(), myId, partnerId);
        refreshDmList(); // 새로 만든 DM 이면 사이드바 목록에 보이게
        selectChannel(id);
        return true;
      } catch (e) {
        console.error("[chat] DM 을 열지 못함", e);
        return false;
      }
    },
    [myId, refreshDmList, selectChannel],
  );

  const value = useMemo(
    () => ({ members: loaded?.channelId === channelId ? loaded.members : [], myId, openDm }),
    [loaded, channelId, myId, openDm],
  );
  return <MentionContext.Provider value={value}>{children}</MentionContext.Provider>;
}

// "@" 뒤 글자(token)에서 멤버 이름을 찾는다. 못 찾으면 원래 글자 그대로
export function MentionLink({ token, onDark }: { token: string; onDark: boolean }) {
  const ctx = useContext(MentionContext);
  const sender = useContext(SenderContext);
  const lower = token.toLowerCase();
  const member = ctx?.members.find((m) => lower.startsWith(m.name.toLowerCase()));
  if (!ctx || !member) return <>@{token}</>;
  const rest = token.slice(member.name.length); // "님" 같은 호칭
  const color = onDark ? "text-amber-300 decoration-amber-300/70" : "text-violet-700 decoration-violet-700/60";
  const isMe = !!ctx.myId && member.id === ctx.myId;
  // 다른 사람을 멘션한 것 → 강조만 (누를 수 없음)
  if (!isMe || !sender) {
    return (
      <>
        <span className={`font-bold ${color}`}>{member.name}</span>
        {rest}
      </>
    );
  }
  // 나를 멘션한 것 → 보낸 사람에게 답장 · DM 메뉴
  return (
    <>
      <MentionMenu
        label={member.name}
        sender={sender}
        senderIsMe={sender.id === ctx.myId}
        openDm={ctx.openDm}
        color={color}
      />
      {rest}
    </>
  );
}

function MentionMenu({
  label,
  sender,
  senderIsMe,
  openDm,
  color,
}: {
  label: string;
  sender: Sender;
  senderIsMe: boolean;
  openDm: (id: string) => Promise<boolean>;
  color: string;
}) {
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false); // 목록 맨 아래 근처면 위로 연다 (아래로 열면 잘림)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);

  function toggle(e: React.MouseEvent) {
    e.stopPropagation(); // 휴대폰 "말풍선 톡 → 버튼 줄" 과 겹치지 않게
    const box = ref.current?.closest(".overflow-y-auto");
    const r = ref.current?.getBoundingClientRect();
    if (box && r) setUp(box.getBoundingClientRect().bottom - r.bottom < 120);
    setError(false);
    setOpen((v) => !v);
  }

  async function dm() {
    if (busy) return;
    setBusy(true);
    const ok = await openDm(sender.id);
    setBusy(false);
    if (ok) setOpen(false);
    else setError(true);
  }

  const item =
    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm whitespace-nowrap text-gray-800 hover:bg-gray-100 disabled:opacity-50";
  return (
    <span ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        title={senderIsMe ? "내가 보낸 멘션" : `${sender.name}님에게 답장 · 다이렉트 메시지`}
        className={`font-bold underline underline-offset-2 ${color}`}
      >
        {label}
      </button>
      {open && (
        <span
          role="menu"
          onClick={(e) => e.stopPropagation()}
          className={`absolute left-0 z-30 flex min-w-max flex-col rounded-lg border border-gray-200 bg-white py-1 font-normal not-italic shadow-lg ${
            up ? "bottom-full mb-1" : "top-full mt-1"
          }`}
        >
          <span className="px-3 pb-1 text-xs whitespace-nowrap text-gray-500">
            {senderIsMe ? "내가 나를 멘션한 메시지" : `${sender.name}님이 나를 멘션했어요`}
          </span>
          {sender.onReply && (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                sender.onReply?.();
              }}
              className={item}
            >
              ↳ {senderIsMe ? "답장" : `${sender.name}에게 답장`}
            </button>
          )}
          {!senderIsMe && (
            <button type="button" role="menuitem" onClick={dm} disabled={busy} className={item}>
              💬 {busy ? "여는 중…" : `${sender.name}에게 다이렉트 메시지`}
            </button>
          )}
          {error && <span className="px-3 py-1 text-xs whitespace-nowrap text-red-600">DM 을 열지 못했어요. 다시 시도해 주세요.</span>}
        </span>
      )}
    </span>
  );
}
