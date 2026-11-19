// 화면 전체 뼈대: [사이드바] [메시지 영역] [스레드 패널]
// 수정은 팀장 협의 후. 각 칸의 "내용"은 담당자 폴더의 컴포넌트를 만들어 아래 칸에 끼운다.
import Sidebar from "./Sidebar";
import MessageArea from "./MessageArea";
import ThreadPanel from "./ThreadPanel";

export default function AppShell() {
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-white text-gray-900">
      <Sidebar />
      <MessageArea />
      <ThreadPanel />
    </div>
  );
}
