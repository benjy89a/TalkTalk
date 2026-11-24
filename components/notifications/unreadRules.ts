// 미읽음·멘션 계산 규칙 (D-2, D-3) — DB·화면 없이 값만 계산하는 함수들 (테스트: unreadRules.test.mjs)
// unreadStore.ts 가 새 메시지·수정·삭제·읽음 신호를 받을 때마다 이 함수들로 채널 상태를 바꾼다.

/** 채널 하나의 상태 */
export type ChannelReadState = {
  lastReadId: number; // 내가 어디까지 읽었는지 (기록 없으면 0)
  latestId: number; // 삭제되지 않은 가장 최근 본문 메시지 id (없으면 0)
  mentionIds: number[]; // 안 읽은 메시지 중 나를 멘션한 메시지 id 들
};

/** 배지는 99+ 까지만 보여주므로 그 이상은 세지 않는다 */
export const MAX_MENTIONS = 100;

export type MessageRow = {
  id: number;
  user_id: string;
  parent_id: number | null;
  deleted_at?: string | null;
};

/**
 * 새 메시지가 왔을 때.
 * mine: 내가 보낸 메시지인지 / mentioned: 본문에 "@내이름" 이 있는지
 */
export function applyInsert(
  cur: ChannelReadState,
  row: MessageRow,
  mine: boolean,
  mentioned: boolean,
): ChannelReadState {
  if (row.parent_id !== null) return cur; // 스레드 답글은 세지 않음
  return {
    latestId: Math.max(cur.latestId, row.id),
    // 내가 보낸 메시지는 읽은 것으로 본다 → 그 앞의 멘션도 읽은 것
    lastReadId: mine ? Math.max(cur.lastReadId, row.id) : cur.lastReadId,
    mentionIds: mine
      ? cur.mentionIds.filter((id) => id > row.id)
      : mentioned
        ? addId(cur.mentionIds, row.id)
        : cur.mentionIds,
  };
}

/**
 * 메시지가 수정되거나 삭제됐을 때 (둘 다 DB 의 UPDATE 로 온다. 삭제는 deleted_at 이 채워짐).
 *
 * 규칙 (이미 읽은 메시지는 건드리지 않는다):
 * - 삭제: 멘션 목록에서 뺀다. 가장 최근 메시지가 지워졌으면 needLatest = true
 *         → 저장소가 DB 에서 "삭제되지 않은 가장 최근 메시지"를 다시 읽어 굵게 여부를 정한다.
 * - 수정: 안 읽은 다른 사람 메시지만 "@내이름" 이 새로 들어갔으면 +1, 빠졌으면 -1.
 *         굵게(미읽음) 여부는 수정으로 바뀌지 않는다 (메시지 id 가 그대로라서).
 */
export function applyUpdate(
  cur: ChannelReadState,
  row: MessageRow,
  mine: boolean,
  mentioned: boolean,
): { next: ChannelReadState; needLatest: boolean } {
  if (row.parent_id !== null) return { next: cur, needLatest: false };

  if (row.deleted_at) {
    const has = cur.mentionIds.includes(row.id);
    return {
      next: has ? { ...cur, mentionIds: cur.mentionIds.filter((id) => id !== row.id) } : cur,
      needLatest: row.id >= cur.latestId,
    };
  }

  if (mine || row.id <= cur.lastReadId) return { next: cur, needLatest: false };

  const has = cur.mentionIds.includes(row.id);
  if (mentioned && !has) return { next: { ...cur, mentionIds: addId(cur.mentionIds, row.id) }, needLatest: false };
  if (!mentioned && has) {
    return { next: { ...cur, mentionIds: cur.mentionIds.filter((id) => id !== row.id) }, needLatest: false };
  }
  return { next: cur, needLatest: false };
}

/** 읽음 위치가 lastReadId 로 올라갔을 때 */
export function applyRead(cur: ChannelReadState, lastReadId: number): ChannelReadState {
  if (cur.lastReadId >= lastReadId) return cur;
  return { ...cur, lastReadId, mentionIds: cur.mentionIds.filter((id) => id > lastReadId) };
}

/** 미읽음 여부: 삭제되지 않은 최근 메시지가 읽은 위치보다 뒤에 있으면 true */
export function isUnreadState(s: ChannelReadState): boolean {
  return s.latestId > s.lastReadId;
}

/**
 * DB 에서 다시 읽었을 때 새로 알게 된 멘션 (화면이 숨겨져 실시간 신호를 놓친 경우 등).
 * - prev 가 null 이면(처음 로그인해서 읽은 것) 예전 멘션이므로 알림 없이 배지로만 → 빈 목록
 * - 이미 알림을 띄운 메시지(notified)는 빼고, 가장 최근 것부터 limit 개만
 */
export function findMissedMentions(
  prev: Record<string, ChannelReadState> | null,
  next: Record<string, ChannelReadState>,
  notified: ReadonlySet<number>,
  limit = 3,
): { channelId: string; messageId: number }[] {
  if (!prev) return [];
  const found: { channelId: string; messageId: number }[] = [];
  for (const [channelId, s] of Object.entries(next)) {
    const before = new Set(prev[channelId]?.mentionIds ?? []);
    for (const id of s.mentionIds) {
      if (!before.has(id) && !notified.has(id)) found.push({ channelId, messageId: id });
    }
  }
  return found.sort((a, b) => b.messageId - a.messageId).slice(0, limit);
}

function addId(ids: number[], id: number): number[] {
  if (ids.includes(id) || ids.length >= MAX_MENTIONS) return ids;
  return [...ids, id].sort((a, b) => a - b);
}
