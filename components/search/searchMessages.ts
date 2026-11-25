import type { SupabaseClient } from "@supabase/supabase-js";
import type { Channel, Database, Message, Profile } from "@/types/database";

export const SEARCH_RESULT_LIMIT = 50;
export const SEARCH_KEYWORD_MAX_LENGTH = 100;

export type MessageSearchResult = Pick<
  Message,
  "id" | "channel_id" | "content" | "created_at" | "parent_id"
> & {
  channels: Pick<Channel, "name" | "type"> | null;
  profiles: Pick<Profile, "name"> | null;
};

export type MessageSearchResponse = {
  results: MessageSearchResult[];
  hasMore: boolean;
};

// 이 종류의 오류만 화면에 표시하고, 접속 정보 등 내부 오류는 표시하지 않는다.
export class MessageSearchError extends Error {}

export async function searchMessages(
  supabase: SupabaseClient<Database>,
  keyword: string,
  signal?: AbortSignal,
): Promise<MessageSearchResponse> {
  const trimmedKeyword = keyword.trim();

  if (!trimmedKeyword) return { results: [], hasMore: false };
  if (trimmedKeyword.length > SEARCH_KEYWORD_MAX_LENGTH) {
    throw new MessageSearchError(
      `검색어는 ${SEARCH_KEYWORD_MAX_LENGTH}자 이하로 입력해 주세요.`,
    );
  }

  signal?.throwIfAborted();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  signal?.throwIfAborted();

  if (authError || !authData.user) {
    throw new MessageSearchError(
      "로그인 상태를 확인할 수 없습니다. 다시 로그인한 뒤 검색해 주세요.",
    );
  }

  // %, _, \를 검색 명령의 와일드카드가 아닌 입력한 문자로 처리한다.
  const escapedKeyword = trimmedKeyword.replace(/[\\%_]/g, "\\$&");

  // 채널 ID를 임의로 제한하거나 관리자 키를 쓰지 않는다.
  // 로그인 사용자의 세션과 messages_select RLS가 읽을 수 있는 메시지를 제한한다.
  let query = supabase
    .from("messages")
    // profiles 는 어느 연결인지 적는다(messages_user_id_fkey). 나중에 messages↔profiles 연결이 늘어도 "관계가 2개" 오류(PGRST201)로 검색이 깨지지 않게 한다.
    .select("id, channel_id, content, created_at, parent_id, channels(name, type), profiles!messages_user_id_fkey(name)")
    // 소프트 삭제된 메시지는 본문이 남아 있을 수 있어 검색에서 제외한다.
    .is("deleted_at", null)
    .ilike("content", `%${escapedKeyword}%`)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(SEARCH_RESULT_LIMIT + 1);

  if (signal) query = query.abortSignal(signal);

  const { data, error } = await query;
  signal?.throwIfAborted();

  if (error) {
    throw new MessageSearchError(
      "메시지를 검색하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요.",
    );
  }

  return {
    results: (data ?? []).slice(0, SEARCH_RESULT_LIMIT),
    hasMore: (data?.length ?? 0) > SEARCH_RESULT_LIMIT,
  };
}
