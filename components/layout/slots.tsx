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
import DmList from "@/components/channel/DmList";
import MyProfile from "@/components/channel/MyProfile";
import StartDmButton from "@/components/channel/StartDmButton";
import ThreadView from "@/components/chat/ThreadView";
import MessageSearch from "@/components/search/MessageSearch";
import { useSelectedChannel } from "./ChannelContext";
import Placeholder from "./Placeholder";

// ───────── 사이드바 ─────────

/** [C][D] 채널 목록 + 미읽음 굵게 (연결 완료) */
export function SidebarChannelListSlot() {
  const { channelId, selectChannel, channelListKey, isUnread } = useSelectedChannel();
  return (
    <ChannelList
      selectedChannelId={channelId}
      onSelect={selectChannel}
      refreshKey={channelListKey}
      isUnread={isUnread}
    />
  );
}

/** [C] 채널 만들기 / 둘러보기 버튼 (연결 완료) */
export function SidebarChannelActionsSlot() {
  const { selectChannel, refreshChannelList } = useSelectedChannel();
  return <ChannelActions onChanged={refreshChannelList} onSelect={selectChannel} />;
}

/** [D] 멘션 배지 — 미읽음 굵게는 채널·DM 목록에 연결됨. 배지 컴포넌트는 아직 없다 */
export function SidebarUnreadSlot() {
  return (
    <Placeholder owner="D" dark>
      멘션 배지 (components/notifications)
    </Placeholder>
  );
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
 *  결과를 누르면 그 채널로 이동한다. 메시지 위치까지 스크롤하는 건 B 가 focusMessageId 를 열어 주면 추가한다. */
export function HeaderSearchSlot() {
  const { selectChannel } = useSelectedChannel();
  return <MessageSearch onSelect={(channelId) => selectChannel(channelId)} />;
}

/** [D] 메시지 안 첨부파일 미리보기 */
export function AttachmentPreviewSlot() {
  return (
    <Placeholder owner="D">메시지 안 첨부파일 미리보기 (components/attachments)</Placeholder>
  );
}

/** [E] AI 요약 · 할 일 추출 버튼 */
export function AiToolsSlot() {
  return <Placeholder owner="E">AI 요약 · 할 일 추출 버튼 (app/api/ai)</Placeholder>;
}

/** [D] 입력창 아래 첨부 버튼 · @멘션 */
export function ComposerExtrasSlot() {
  return (
    <Placeholder owner="D">첨부 버튼 · @멘션 (components/attachments, notifications)</Placeholder>
  );
}

// ───────── 스레드 패널 ─────────

/** [B] 원본 메시지 + 답글 목록 + 답글 입력창 (연결 완료) */
export function ThreadBodySlot() {
  return <ThreadView />;
}
