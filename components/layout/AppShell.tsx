// 화면 전체 뼈대: [사이드바] [메시지 영역] [스레드 패널]
// 칸 안의 내용은 slots.tsx 에서 끼운다. 이 파일은 거의 고칠 일이 없다.
import { ChannelProvider } from "./ChannelContext";
import Sidebar from "./Sidebar";
import MessageArea from "./MessageArea";
import ThreadPanel from "./ThreadPanel";
// [D] 멘션 알림 카드·윈도우 알림·탭 제목 숫자 (useSelectedChannel 을 쓰므로 ChannelProvider 안에 둔다)
import NotificationToasts from "@/components/notifications/NotificationToasts";

export default function AppShell() {
  return (
    <ChannelProvider>
      <div className="flex h-dvh w-full overflow-hidden bg-white text-gray-900">
        <Sidebar />
        <MessageArea />
        <ThreadPanel />
      </div>
      <NotificationToasts />
    </ChannelProvider>
  );
}
