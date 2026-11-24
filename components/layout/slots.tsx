"use client";
// 화면의 "칸(슬롯)" 모음. 팀원 컴포넌트는 여기서 한 칸씩만 바꿔 끼운다.
// Sidebar / MessageArea / ThreadPanel 은 이 파일의 슬롯만 불러다 쓰므로, 그 파일들은 다시 손댈 일이 없다.
//
// 칸을 채우는 방법 (슬롯 하나당 함수 본문만 바꾸면 끝):
//   1) 위쪽에 import 한 줄 추가
//   2) 해당 슬롯 함수의 <Placeholder .../> 를 내 컴포넌트로 교체
// 현재 채널이 필요하면 useSelectedChannel() 로 읽는다 (props 로 받지 않는다).
import ChannelActions from "@/components/channel/ChannelActions";
import ChannelList from "@/components/channel/ChannelList";
import ChannelMembersButton from "@/components/channel/ChannelMembersButton";
import DmList from "@/components/channel/DmList";
import MyProfile from "@/components/channel/MyProfile";
import StartDmButton from "@/components/channel/StartDmButton";
import ThreadView from "@/components/chat/ThreadView";
import UnreadBadge from "@/components/notifications/UnreadBadge";
import AiToolsBar from "@/components/search/AiToolsBar";
import MessageSearch from "@/components/search/MessageSearch";
import { useSelectedChannel } from "./ChannelContext";

// ───────── 사이드바 ─────────

/** [C][D] 채널 목록 + 미읽음 굵게 + 멘션 배지 (연결 완료) */
export function SidebarChannelListSlot() {
  const { channelId, selectChannel, channelListKey, isUnread } = useSelectedChannel();
  return (
    <ChannelList
      selectedChannelId={channelId}
      onSelect={selectChannel}
      refreshKey={channelListKey}
      isUnread={isUnread}
      renderBadge={(id) => <UnreadBadge channelId={id} activeChannelId={channelId} />}
    />
  );
}

/** [C] 채널 만들기 / 둘러보기 버튼 (연결 완료) */
export function SidebarChannelActionsSlot() {
  const { selectChannel, refreshChannelList } = useSelectedChannel();
  return <ChannelActions onChanged={refreshChannelList} onSelect={selectChannel} />;
}

/** [C][D] DM 목록 + 새 DM 시작 (연결 완료) */
export function SidebarDmListSlot() {
  const { channelId, selectChannel, dmListKey, refreshDmList, isUnread } = useSelectedChannel();
  return (
    <div className="space-y-0.5">
      <DmList
        selectedChannelId={channelId}
        onSelect={selectChannel}
        refreshKey={dmListKey}
        isUnread={isUnread}
        renderBadge={(id) => <UnreadBadge channelId={id} activeChannelId={channelId} />}
      />
      <StartDmButton onChanged={refreshDmList} onSelect={selectChannel} />
    </div>
  );
}

/** [C] 내 이름 + 로그아웃 (연결 완료) */
export function SidebarProfileSlot() {
  return <MyProfile />;
}

// ───────── 메시지 영역 ─────────

/** [E] 헤더 오른쪽 검색창 (연결 완료)
 *  결과를 누르면 그 채널로 가서 메시지 번호를 jumpToMessage 에 맡긴다 (CONTRACTS.md 3번).
 *  답글이면 원본으로 스크롤하고 스레드를 열어 답글을 강조한다 (B 의 focus.ts). */
export function HeaderSearchSlot() {
  const { jumpToMessage } = useSelectedChannel();
  return <MessageSearch onSelect={jumpToMessage} />;
}

// [D] 첨부 버튼·첨부 미리보기·@멘션은 칸 대신 MessageArea 의 MessageInput(extras)·MessageList(renderAttachments)에
//     직접 연결했다 (연결 완료)

/** [C] 헤더의 "👥 멤버" 버튼: 멤버 보기 + (관리할 수 있으면) 초대·내보내기 (연결 완료)
 *  DM 은 두 사람 고정이라 버튼을 보여주지 않는다. */
export function HeaderMembersSlot() {
  const { channelId, channelType, refreshChannelList, refreshDmList } = useSelectedChannel();
  if (!channelId || channelType === null || channelType === "dm") return null;
  return (
    <ChannelMembersButton
      key={channelId}
      channelId={channelId}
      onChanged={() => {
        refreshChannelList();
        refreshDmList();
      }}
    />
  );
}

/** [E] AI 요약 · 할 일 추출 버튼 (연결 완료)
 *  TODO(A): E 가 onSelectMessage 를 열면 onSelectMessage={jumpToMessage} 를 넘긴다 (CONTRACTS.md 3번). */
export function AiToolsSlot() {
  const { channelId } = useSelectedChannel();
  if (!channelId) return null;
  return <AiToolsBar channelId={channelId} />;
}

// ───────── 스레드 패널 ─────────

/** [B] 원본 메시지 + 답글 목록 + 답글 입력창 (연결 완료) */
export function ThreadBodySlot() {
  return <ThreadView />;
}
