"use client";

// 멘션 배지 (D-3)
//
// 채널 줄 오른쪽에 "나를 멘션한 안 읽은 메시지 수"를 빨간 숫자로 보여준다. 0이면 아무것도 안 그린다.
// CONTRACTS.md 규격: UnreadBadge(channelId) → ChannelList 의 renderBadge 에 연결
//
// 사용 예:
//   import UnreadBadge from "@/components/notifications/UnreadBadge";
//   <ChannelList ... renderBadge={(id) => <UnreadBadge channelId={id} activeChannelId={channelId} />} />
//
// activeChannelId(지금 열어 둔 채널)를 넘기면 그 채널에는 배지를 보이지 않는다. 생략해도 된다.
import { useUnread } from "./useUnread";

type Props = {
  channelId: string;
  activeChannelId?: string | null;
};

export default function UnreadBadge({ channelId, activeChannelId }: Props) {
  const { mentionCount } = useUnread(activeChannelId);
  const count = mentionCount(channelId);
  if (count === 0) return null;

  return (
    <span className="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-xs font-semibold text-white">
      <span aria-hidden="true">{count > 99 ? "99+" : count}</span>
      <span className="sr-only">나를 멘션한 안 읽은 메시지 {count}개</span>
    </span>
  );
}
