# CONTRACTS — 컴포넌트 연결 규격

> 목적: **팀원끼리 서로의 파일을 고치거나 상의하지 않고도** 기능이 이어지게 한다.
> 규칙: 남의 컴포넌트는 **import 해서 쓰기만** 한다. 규격(props)을 바꾸고 싶으면 팀장에게 알린다. 팀장이 규격을 고치고 양쪽에 전달한다.
> 연결(조립)은 팀장이 `components/layout/slots.tsx` 에서 한다. 팀원은 연결을 기다리지 말고 자기 컴포넌트를 완성한다.

---

## 1. 공통 약속

- 현재 채널은 컴포넌트가 props(`channelId`)로 받는다. 화면에 끼울 때 팀장이 `useSelectedChannel()` 값을 넘긴다.
  (`import { useSelectedChannel } from "@/components/layout/ChannelContext"` — 레이아웃 안에서만 동작)
- 다른 컴포넌트의 일을 끼워 넣고 싶을 땐 **콜백(`onXxx`)이나 칸(`renderXxx`) props** 로 받는다. 남의 파일을 열어 코드를 넣지 않는다.
- 새로 만든 컴포넌트는 파일 맨 위 주석에 **사용 예**를 적는다.
- 아래 표의 "현재"는 이미 main 에 있는 규격, "추가 예정"은 해당 담당자가 열어 두기로 한 규격이다.

---

## 2. 담당별 컴포넌트 규격

### B — `components/chat/`

| 컴포넌트 | 현재 props | 추가 예정 (요청 담당) | 용도 |
|---|---|---|---|
| `MessageList` | `channelId` | `renderAttachments?(message) => ReactNode` (D) · `onOpenThread?(message)` (B 스레드) | 메시지 말풍선 안에 첨부 표시, 스레드 열기 |
| `MessageItem` | `message, mine, first, last` | `renderAttachments?` 를 `MessageList` 에서 전달받아 말풍선 아래에 그린다 | 첨부 표시 칸 |
| `MessageInput` | `channelId, parentId?, placeholder?` | `extras?: ReactNode` — 입력창 아래에 놓일 칸 (D) | 첨부 버튼 · @멘션 |

- 읽음 처리: 지금은 `MessageList` 가 D 의 `useMarkAsRead` 를 직접 쓰고 있다 (B 가 이미 연결, 유지).
- **메시지로 이동 (11/24 회의 확정)** — 아래 3번 "메시지로 이동 규격" 참고. B 는 `MessageList` 에 `focusMessageId?` · `onFocusHandled?` 를 연다.

### C — `components/channel/`

| 컴포넌트 | 현재 props | 추가 예정 (요청 담당) | 용도 |
|---|---|---|---|
| `ChannelList` | `selectedChannelId, onSelect, refreshKey?` | `renderBadge?(channelId) => ReactNode` (D) | 채널 줄 오른쪽에 미읽음·멘션 배지 |
| `MyProfile` | 없음 | — | 내 이름 + 로그아웃 |
| `DmList` | (미구현) `selectedChannelId, onSelect, refreshKey?` | `renderBadge?` 동일 | DM 목록 — `ChannelList` 와 같은 모양으로 맞춘다 |

### D — `components/attachments/`, `components/notifications/`

| 항목 | 규격 | 용도 |
|---|---|---|
| `useMarkAsRead(channelId, lastMessageId)` | 현재 (B 가 사용 중) | 읽음 위치 저장 |
| `uploadAttachment(channelId, messageId, file)` | (미구현) 저장 성공 시 첨부 정보 반환 | 파일 업로드 |
| `AttachmentList` | (미구현) `messageId` | 메시지 아래 첨부 표시 → `renderAttachments` 에 연결 |
| `AttachButton` | (미구현) `channelId` | 입력창 `extras` 칸에 끼움 |
| `UnreadBadge` | (미구현) `channelId` | 채널 목록의 `renderBadge` 에 연결 |

### E — `components/search/`, `app/api/ai/`

| 항목 | 규격 | 용도 |
|---|---|---|
| `SearchBox` | (미구현) `onSelectMessage(channelId, messageId)` | 검색 후 결과 클릭 시 호출만 한다. 이동은 팀장이 연결 |
| `POST /api/ai/summarize` | (미구현) 요청 `{ channelId }` → 응답 `{ summary }` | E 가 서버에서 DB 를 직접 읽어 B 코드에 의존하지 않는다 |
| `AiToolsBar` | (미구현) `channelId` | 요약 · 할 일 추출 버튼 |

---

## 3. 메시지로 이동 규격 (11/24 회의 확정)

검색(상단 검색 · AI 검색 · 할 일 근거)에서 결과를 누르면 **그 채널로 가서 그 메시지 위치로 스크롤 + 잠깐 강조**한다.

```
[E 검색 결과 클릭] ──onSelect(channelId, messageId)──▶ [A slots.tsx: jumpToMessage]
                                                         │ 채널이 다르면 채널 바꾸기
                                                         ▼
                              [B MessageList  focusMessageId={messageId}  onFocusHandled={…}]
```

| 담당 | 해야 할 것 |
|---|---|
| **B** `components/chat/MessageList.tsx` | 선택 props 2개 추가: `focusMessageId?: number`, `onFocusHandled?: () => void`.<br>① `focusMessageId` 가 들어오면 그 메시지가 화면에 있는지 본다. 없으면(오래된 메시지) 그 메시지까지 이전 메시지를 더 불러온다.<br>② 그 위치로 스크롤하고 1~2초 강조(예: 노란 배경)한다.<br>③ **답글**(parent_id 가 있음)이면 본문에는 원본(root) 메시지로 스크롤하고 스레드 패널을 연다.<br>④ 삭제됐거나 권한이 없어 못 찾으면 이동하지 않고 끝낸다.<br>⑤ 성공이든 실패든 끝나면 **반드시 `onFocusHandled()` 를 한 번 부른다** (같은 결과를 다시 눌러도 다시 이동하도록 팀장이 값을 비운다). |
| **E** `components/search/` | 상단 검색 `MessageSearch` 는 이미 `onSelect(channelId, messageId)` 를 부른다 → 그대로 유지.<br>`AiToolsBar` 에 선택 prop `onSelectMessage?: (channelId: string, messageId: number) => void` 추가.<br>AI 검색 결과 줄, 할 일의 근거 메시지 번호를 **클릭 가능하게** 하고 누르면 `onSelectMessage` 를 부른다. 부른 뒤 AI 도구 패널은 **닫는다**(채팅이 보이도록). |
| **A** `components/layout/` | `ChannelContext` 의 `jumpToMessage(channelId, messageId)` 로 연결 (준비 완료). B·E 머지 후 `MessageList`·`AiToolsBar` 에 props 를 넘기기만 하면 끝. |

- 메시지 번호(`messageId`)는 `messages.id` (bigint → 화면에서는 number) 그대로 쓴다.
- 같은 채널 안에서 이동해도 `MessageList` 를 새로 그리지 않는다 (key 는 `channelId` 그대로).

---

## 4. 이 규격을 바꾸고 싶을 때

1. 내 파일 안에서 해결되는지 먼저 본다 (대부분 선택 props 하나 추가로 끝난다).
2. 다른 사람 파일을 고쳐야 한다면 직접 고치거나 따로 상의하지 말고 팀장에게 이렇게 전달한다.
   > "`파일/컴포넌트` 에 `이런 props` 가 필요해요. 이유: …"
3. 팀장이 이 문서를 고치고, 해당 담당자와 나에게 알려 준다.
4. props 는 **선택(`?`)으로 추가**한다. 기존 사용처가 깨지지 않는다.
