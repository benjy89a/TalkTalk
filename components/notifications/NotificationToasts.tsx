"use client";

// 알림 (D) — 멘션·초대 알림 카드(토스트) · 윈도우 알림 · 탭 제목 숫자
//
// 비공개 채널에 초대되거나 누가 나에게 새 DM 을 시작하면 (006 channel_members Realtime):
//   - "🔒 비공개 채널 #인사팀에 초대됐어요" / "💬 계섭님이 DM을 시작했어요" 카드 → 누르면 그 채널 열기
//   - 사이드바 채널·DM 목록을 바로 다시 불러온다 (refreshChannelList / refreshDmList)
//
// 누가 나를 @멘션하면:
//   - TalkTalk 탭을 보고 있을 때 → 화면 오른쪽 위에 알림 카드가 10초 동안 떴다가 사라진다
//     (지금 보고 있는 채널의 멘션은 이미 눈앞에 있으므로 띄우지 않는다)
//   - 다른 탭·다른 프로그램을 보고 있을 때 → 윈도우 알림 (허락한 경우. 아니면 돌아왔을 때 카드로)
//   - 카드나 윈도우 알림을 누르면 jumpToMessage 로 그 메시지까지 이동 + 강조
//   - 탭 제목에 안 읽은 멘션 수: "(2) TalkTalk"
// 처음 한 번 "🔔 윈도우 알림을 켤까요?" 카드가 뜬다 (켜기 / 나중에).
//
// 사용 예 (팀장님 — components/layout/AppShell.tsx 의 ChannelProvider 안에 한 줄):
//   import NotificationToasts from "@/components/notifications/NotificationToasts";
//   <ChannelProvider> ... <NotificationToasts /> </ChannelProvider>
//
// 화면 어디에 넣어도 오른쪽 위에 뜬다 (document.body 에 포털로 붙임).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { useSelectedChannel } from "@/components/layout/ChannelContext";
import { useOpenThread } from "@/components/chat/threads";
import { useUnread } from "./useUnread";
import {
  desktopAllowed,
  requestDesktop,
  rememberAsked,
  shouldAskDesktop,
  showDesktop,
} from "./desktopNotify";
import {
  chooseNotify,
  INVITE_EVENT,
  isOnScreen,
  MAX_TOASTS,
  MENTION_EVENT,
  mentionTitle,
  previewText,
  tabTitle,
  TOAST_MS,
  type InviteEventDetail,
  type MentionEventDetail,
} from "./notifyRules";

type Toast = {
  key: string;
  icon: string;
  channelId: string;
  messageId: number | null; // 멘션이면 그 메시지로, 초대면(null) 채널로 이동
  title: string;
  body: string;
};

// 보낸 사람 이름·채널 이름은 한 번 읽으면 기억해 둔다
const nameCache = new Map<string, Promise<string>>();
const channelCache = new Map<string, Promise<{ name: string; type: string } | null>>();

function authorName(userId: string) {
  let p = nameCache.get(userId);
  if (!p) {
    p = Promise.resolve(
      createClient().from("profiles").select("name").eq("id", userId).maybeSingle(),
    ).then(({ data }) => data?.name ?? "");
    nameCache.set(userId, p);
  }
  return p;
}

function channelInfo(channelId: string) {
  let p = channelCache.get(channelId);
  if (!p) {
    p = Promise.resolve(
      createClient().from("channels").select("name, type").eq("id", channelId).maybeSingle(),
    ).then(({ data }) => data ?? null);
    channelCache.set(channelId, p);
  }
  return p;
}

export default function NotificationToasts() {
  const { channelId, jumpToMessage, selectChannel, refreshChannelList, refreshDmList } =
    useSelectedChannel();
  const { mentions } = useUnread(channelId);
  const openThread = useOpenThread(); // 지금 열려 있는 스레드 패널 (B threads.ts)
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [askDesktop, setAskDesktop] = useState(false);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  // 이벤트 처리 중에 최신 값을 쓰기 위해 ref 에 담아 둔다
  const openThreadRootId = openThread?.rootId ?? null;
  const latest = useRef({
    channelId,
    openThreadRootId,
    jumpToMessage,
    selectChannel,
    refreshChannelList,
    refreshDmList,
  });
  useEffect(() => {
    latest.current = { channelId, openThreadRootId, jumpToMessage, selectChannel, refreshChannelList, refreshDmList };
  });

  const dismiss = useCallback((key: string) => {
    clearTimeout(timers.current.get(key));
    timers.current.delete(key);
    setToasts((list) => list.filter((t) => t.key !== key));
  }, []);

  // 멘션 → 그 메시지로 이동 + 강조 / 초대 → 그 채널 열기
  const go = useCallback((t: Pick<Toast, "channelId" | "messageId">) => {
    if (t.messageId !== null) latest.current.jumpToMessage(t.channelId, t.messageId);
    else latest.current.selectChannel(t.channelId);
  }, []);

  const open = useCallback(
    (t: Toast) => {
      dismiss(t.key);
      go(t);
    },
    [dismiss, go],
  );

  // ---- 알림 띄우기 (멘션·초대 공통) ----
  const notify = useCallback(
    (t: Toast, onScreen: boolean) => {
      const how = chooseNotify({
        onScreen,
        pageVisible: document.visibilityState === "visible",
        desktopAllowed: desktopAllowed(),
      });
      if (how.desktop) showDesktop(t.title, t.body, t.key, () => go(t));
      if (!how.toast) return;

      setToasts((list) => {
        if (list.some((x) => x.key === t.key)) return list;
        return [...list, t].slice(-MAX_TOASTS);
      });
      // 10초 뒤 사라짐. 단 탭이 숨겨져 있으면 돌아와서 볼 수 있게 기다린다
      const schedule = () => {
        timers.current.set(
          t.key,
          setTimeout(() => {
            if (document.visibilityState === "visible") dismiss(t.key);
            else schedule();
          }, TOAST_MS),
        );
      };
      schedule();
    },
    [dismiss, go],
  );

  // ---- 멘션·초대 신호 받기 ----
  useEffect(() => {
    async function onMention(e: Event) {
      const d = (e as CustomEvent<MentionEventDetail>).detail;
      // 이미 화면에 보이는 메시지인지: 본문은 그 채널을 보고 있을 때, 스레드 댓글은 그 스레드를 열어 두었을 때
      const onScreen = () =>
        isOnScreen({
          channelId: d.channelId,
          parentId: d.parentId,
          activeChannelId: latest.current.channelId,
          openThreadRootId: latest.current.openThreadRootId,
        });
      // 보이는 메시지면 미리 걸러서 이름을 읽어 오지 않는다
      if (onScreen() && document.visibilityState === "visible") return;
      const [name, channel] = await Promise.all([authorName(d.authorId), channelInfo(d.channelId)]);
      notify(
        {
          key: `mention-${d.messageId}`,
          icon: d.all ? "📢" : "💬",
          channelId: d.channelId,
          messageId: d.messageId, // 스레드 댓글이면 jumpToMessage 가 스레드를 열고 그 댓글을 강조
          title: mentionTitle(name, channel, { thread: d.parentId !== null, all: d.all }),
          body: previewText(d.content),
        },
        onScreen(),
      );
    }

    function onInvite(e: Event) {
      const d = (e as CustomEvent<InviteEventDetail>).detail;
      // 사이드바 목록에 새 채널·DM 이 바로 보이도록 목록을 다시 불러온다 (팀장님 ChannelContext)
      if (d.kind === "dm") latest.current.refreshDmList();
      else latest.current.refreshChannelList();
      notify(
        {
          key: `invite-${d.channelId}`,
          icon: d.kind === "dm" ? "💬" : "🔒",
          channelId: d.channelId,
          messageId: null,
          title: d.title,
          body: d.kind === "dm" ? "눌러서 대화 열기" : "눌러서 채널로 이동",
        },
        false, // 새로 생긴 채널은 아직 화면에 없음
      );
    }

    window.addEventListener(MENTION_EVENT, onMention);
    window.addEventListener(INVITE_EVENT, onInvite);
    const timerMap = timers.current;
    return () => {
      window.removeEventListener(MENTION_EVENT, onMention);
      window.removeEventListener(INVITE_EVENT, onInvite);
      timerMap.forEach(clearTimeout);
      timerMap.clear();
    };
  }, [notify]);

  // ---- "알림 켜기" 안내는 처음 한 번만 ----
  useEffect(() => {
    const t = setTimeout(() => setAskDesktop(shouldAskDesktop()), 1500); // 화면이 다 뜬 뒤에
    return () => clearTimeout(t);
  }, []);

  // ---- 탭 제목 숫자 ----
  const totalMentions = useMemo(
    () => Object.values(mentions).reduce((sum, n) => sum + n, 0),
    [mentions],
  );
  useEffect(() => {
    document.title = tabTitle(document.title, totalMentions);
  }, [totalMentions]);
  useEffect(() => () => {
    document.title = tabTitle(document.title, 0); // 화면이 사라지면 원래 제목으로
  }, []);

  if (typeof document === "undefined") return null;
  if (toasts.length === 0 && !askDesktop) return null;

  return createPortal(
    <div
      role="region"
      aria-label="알림"
      className="pointer-events-none fixed top-3 right-3 left-3 z-[60] flex flex-col items-end gap-2 sm:left-auto"
    >
      {askDesktop && (
        <div className="pointer-events-auto w-full max-w-sm rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-900 shadow-lg">
          <p className="font-semibold">🔔 윈도우 알림을 켤까요?</p>
          <p className="mt-1 text-gray-600">다른 창을 보고 있을 때도 나를 언급한 메시지를 알려 드려요.</p>
          <div className="mt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                rememberAsked();
                setAskDesktop(false);
              }}
              className="rounded-md px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-[#1e325c] focus-visible:outline-none"
            >
              나중에
            </button>
            <button
              type="button"
              onClick={async () => {
                setAskDesktop(false);
                await requestDesktop();
              }}
              className="rounded-md bg-[#1e325c] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#172746] focus-visible:ring-2 focus-visible:ring-[#1e325c] focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              알림 켜기
            </button>
          </div>
        </div>
      )}

      {toasts.map((t) => (
        <div
          key={t.key}
          role="status"
          className="pointer-events-auto flex w-full max-w-sm items-start gap-2 rounded-lg border border-gray-200 bg-white p-3 text-sm text-gray-900 shadow-lg"
        >
          <button
            type="button"
            onClick={() => open(t)}
            className="min-w-0 flex-1 text-left focus-visible:outline-none"
            title={t.messageId !== null ? "눌러서 메시지로 이동" : "눌러서 채널로 이동"}
          >
            <span className="flex items-center gap-1 font-semibold">
              <span aria-hidden="true">{t.icon}</span>
              <span className="truncate">{t.title}</span>
            </span>
            <span className="mt-0.5 block truncate text-gray-600">{t.body}</span>
          </button>
          <button
            type="button"
            onClick={() => dismiss(t.key)}
            aria-label="알림 닫기"
            className="shrink-0 rounded px-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800 focus-visible:ring-2 focus-visible:ring-[#1e325c] focus-visible:outline-none"
          >
            ✕
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
