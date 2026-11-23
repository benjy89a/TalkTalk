// 읽음 처리 함수 (D-1)
//
// "이 채널에서 lastMessageId 번 메시지까지 읽었다"를 DB에 저장한다.
// → channel_members 테이블의 "내 행" last_read_message_id 를 갱신한다.
//
// 사용 예 (클라이언트 컴포넌트 안에서):
//   import { markAsRead } from "@/components/notifications/markAsRead";
//   await markAsRead(channelId, 마지막메시지.id);
//
// 화면에서 자동으로 부르고 싶으면 같은 폴더의 useMarkAsRead 훅을 쓰면 된다.
import { createClient } from "@/lib/supabase/client";

// 읽음 위치가 바뀌면 브라우저 안에 이 이름의 신호(이벤트)를 보낸다.
// 미읽음 표시(D-2) 같은 다른 화면이 이 신호를 듣고 바로 갱신할 수 있다.
export const READ_EVENT = "talktalk:read";

export type ReadEventDetail = {
  channelId: string;
  lastReadMessageId: number;
};

/**
 * 내 읽음 위치를 lastMessageId 로 올린다.
 *
 * - 메시지 id 는 클수록 최신이므로, 이미 더 뒤까지 읽었다면 되돌리지 않는다.
 * - 로그인하지 않았거나 그 채널 멤버가 아니면 아무것도 바꾸지 않는다.
 *
 * @returns 실제로 DB 값이 바뀌었으면 true, 바뀐 게 없으면 false
 */
export async function markAsRead(
  channelId: string,
  lastMessageId: number,
): Promise<boolean> {
  if (!channelId || !Number.isFinite(lastMessageId) || lastMessageId <= 0) {
    return false;
  }

  const supabase = createClient();

  // 지금 로그인한 사람(나)의 id. 관리자는 다른 사람 행도 고칠 수 있으므로
  // 반드시 "내 행"만 고치도록 user_id 로 걸러야 한다.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const myId = session?.user.id;
  if (!myId) return false;

  const { data, error } = await supabase
    .from("channel_members")
    .update({ last_read_message_id: lastMessageId })
    .eq("channel_id", channelId)
    .eq("user_id", myId)
    // 아직 읽은 기록이 없거나(null) 지금보다 앞쪽까지만 읽었을 때만 갱신 → 뒤로 되돌아가지 않음
    .or(`last_read_message_id.is.null,last_read_message_id.lt.${lastMessageId}`)
    .select("channel_id");

  if (error) {
    console.error("[markAsRead] 읽음 처리 실패:", error.message);
    return false;
  }

  const changed = (data?.length ?? 0) > 0;
  if (changed && typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<ReadEventDetail>(READ_EVENT, {
        detail: { channelId, lastReadMessageId: lastMessageId },
      }),
    );
  }
  return changed;
}
