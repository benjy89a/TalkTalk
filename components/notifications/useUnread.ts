"use client";

// 미읽음 표시 훅 (D-2) + 멘션 수 (D-3)
//
// 내가 속한 채널마다 "아직 안 읽은 메시지가 있는지"와 "나를 멘션한 안 읽은 메시지 수"를 알려준다.
// 같은 화면에서 여러 번 써도 DB 요청·Realtime 구독은 한 번만 일어난다 (unreadStore.ts).
//
// 사용 예:
//   import { useUnread } from "@/components/notifications/useUnread";
//
//   const { isUnread, mentionCount } = useUnread(activeChannelId); // 지금 열어 둔 채널 id (없으면 생략)
//   <span className={isUnread(channel.id) ? "font-bold text-white" : "text-white/70"}>
//     # {channel.name}
//   </span>
//   멘션 숫자 배지는 같은 폴더의 UnreadBadge 컴포넌트를 쓰면 된다.
//
// 판단 기준:
// - 미읽음 = 채널 본문 메시지(스레드 답글 제외) 중 id 가 내 last_read_message_id 보다 큰 것이 있음
// - 멘션 = 그 안 읽은 본문 메시지 중 다른 사람이 쓴 글에 "@내이름" 이 들어 있음
// - 내가 보낸 메시지는 미읽음으로 치지 않는다.
// - 지금 열어 둔 채널(activeChannelId)은 굵게·배지를 보이지 않는다.
//
// 언제 다시 계산하나:
// - 새 메시지가 오면 Realtime 으로 바로
// - 읽음 처리(markAsRead)가 되면 바로 (talktalk:read 신호)
// - 브라우저 탭으로 돌아오거나 로그인 상태가 바뀌면 DB 에서 다시 읽어 옴
// - 채널에 새로 참여했을 때 등은 refresh() 를 부르면 다시 읽어 옴
import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  getServerUnreadSnapshot,
  getUnreadSnapshot,
  refreshUnread,
  subscribeUnread,
} from "./unreadStore";
import { threadMentionCounts } from "./unreadRules";

export function useUnread(activeChannelId?: string | null) {
  const snap = useSyncExternalStore(subscribeUnread, getUnreadSnapshot, getServerUnreadSnapshot);

  const { unread, mentions } = useMemo(() => {
    const unread: Record<string, boolean> = {};
    const mentions: Record<string, number> = {};
    // 스레드 댓글 멘션은 보고 있는 채널이어도 센다 (본문에는 댓글이 안 보이므로). 스레드를 열면 사라짐
    const threads = threadMentionCounts(snap.threadMentions);
    for (const [id, s] of Object.entries(snap.channels)) {
      const active = id === activeChannelId;
      unread[id] = !active && s.latestId > s.lastReadId;
      mentions[id] = (active ? 0 : s.mentionIds.length) + (threads[id] ?? 0);
    }
    return { unread, mentions };
  }, [snap, activeChannelId]);

  const isUnread = useCallback((channelId: string) => unread[channelId] ?? false, [unread]);
  const mentionCount = useCallback((channelId: string) => mentions[channelId] ?? 0, [mentions]);

  return { unread, isUnread, mentions, mentionCount, refresh: refreshUnread };
}
