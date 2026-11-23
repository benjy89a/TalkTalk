// [B] 채팅 컴포넌트끼리 같이 쓰는 타입·상수
import type { Message, Profile } from "@/types/database";

// 화면에 보여줄 메시지 한 줄 = messages 행 + 보낸 사람 프로필(이름·아바타)
export type ChatMessage = Message & {
  profiles: Pick<Profile, "name" | "avatar_url"> | null;
};

// messages 를 불러올 때 보낸 사람 프로필도 같이 가져오는 select 문
// (messages.user_id → profiles.id 관계를 따라감)
export const MESSAGE_SELECT = "*, profiles(name, avatar_url)" as const;

// 한 번에 불러오는 메시지 개수 (무한스크롤 B-6 에서도 같은 값 사용)
export const PAGE_SIZE = 50;
