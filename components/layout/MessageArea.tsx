// 가운데 메시지 영역: 채널 헤더 / 메시지 목록 / 입력창
import Placeholder from "./Placeholder";

export default function MessageArea() {
  return (
    <main className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-gray-200 px-4">
        <span className="font-semibold"># general</span>
        <div className="w-64">
          <Placeholder owner="E">검색창 (components/layout · app/api/ai)</Placeholder>
        </div>
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        <Placeholder owner="B">
          메시지 목록 · 실시간 수신 · 무한스크롤 · 답글 n개 버튼 (components/chat)
        </Placeholder>
        <Placeholder owner="D">메시지 안 첨부파일 미리보기 (components/attachments)</Placeholder>
        <Placeholder owner="E">AI 요약 · 할 일 추출 버튼 (app/api/ai)</Placeholder>
      </div>

      <footer className="shrink-0 border-t border-gray-200 p-4">
        <Placeholder owner="B">메시지 입력창 · 전송 (components/chat)</Placeholder>
        <div className="mt-2">
          <Placeholder owner="D">첨부 버튼 · @멘션 (components/attachments, notifications)</Placeholder>
        </div>
      </footer>
    </main>
  );
}
