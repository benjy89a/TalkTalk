// [B] 채팅 컴포넌트끼리 같이 쓰는 타입·상수
import type { Message, Profile } from "@/types/database";

// 화면에 보여줄 메시지 한 줄 = messages 행 + 보낸 사람 프로필(이름·아바타)
export type ChatMessage = Message & {
  profiles: Pick<Profile, "name" | "avatar_url"> | null;
};

// messages 를 불러올 때 보낸 사람 프로필도 같이 가져오는 select 문
// (messages.user_id → profiles.id 관계를 따라감)
// ⚠️ "profiles!messages_user_id_fkey" 처럼 어느 연결인지 꼭 적는다.
//    DB 에 reactions(이모지 반응) 테이블이 생기면서 messages ↔ profiles 연결이 2개가 되어,
//    그냥 profiles(...) 라고 쓰면 "more than one relationship" 오류로 메시지를 하나도 못 불러온다.
export const MESSAGE_SELECT = "*, profiles!messages_user_id_fkey(name, avatar_url)" as const;

// 한 번에 불러오는 메시지 개수 (무한스크롤 B-6 에서도 같은 값 사용)
export const PAGE_SIZE = 50;

// 화면에 쌓아둘 최대 메시지 수 (대량 메시지 성능)
// 1만 건 채널에서 측정: 900개까지 부드러움, 1,500개는 50개 더 불러올 때마다 3~4초 + 화면 0.9초 멈춤
// → 느린 노트북까지 생각해 500개로 제한. 넘기면 위로 더 불러오지 않고 "검색으로 찾아보세요" 안내
export const MAX_RENDERED = 500;

// 재연결 때 놓친 메시지가 이보다 많으면 하나씩 이어 붙이지 않고 최신 50개로 새로 불러온다
export const CATCH_UP_LIMIT = 200;
