# components/notifications — [D 실사용 기능] 읽음 처리·미읽음 배지·멘션(@) 알림 컴포넌트를 두는 곳입니다.

## 읽음 처리 (D-1) — B 담당 메시지 목록에서 쓰는 법

**가장 쉬운 방법: 훅 한 줄**

```tsx
"use client";
import { useMarkAsRead } from "@/components/notifications/useMarkAsRead";

// messages = 지금 화면에 보이는 채널 본문 메시지 (id 오름차순)
const lastId = messages.at(-1)?.id ?? null;
useMarkAsRead(channelId, lastId);
```

- 채널을 열거나 새 메시지가 오면 `channel_members.last_read_message_id` 를 자동으로 갱신합니다.
- 브라우저 탭이 숨겨져 있을 때는 읽음 처리하지 않고, 탭으로 돌아오면 처리합니다.
- 읽음 위치는 뒤로 되돌아가지 않습니다 (예전 메시지를 다시 불러와도 안전).

**직접 부르고 싶을 때: 함수**

```ts
import { markAsRead } from "@/components/notifications/markAsRead";
const changed = await markAsRead(channelId, messageId); // 바뀌었으면 true
```

**읽음 위치가 바뀌었다는 신호** — 읽음 처리가 되면 브라우저 안에 `talktalk:read` 이벤트가 발생합니다
(`detail: { channelId, lastReadMessageId }`). 미읽음 표시(D-2)가 이 신호로 바로 굵게 표시를 풉니다.

## 미읽음 표시 (D-2) — C 담당 채널 목록에서 쓰는 법

```tsx
"use client";
import { useUnread } from "@/components/notifications/useUnread";

// activeChannelId = 지금 열어 둔 채널 id (그 채널은 굵게 하지 않음). 없으면 생략 가능
const { isUnread, refresh } = useUnread(activeChannelId);

<span className={isUnread(channel.id) ? "font-bold text-white" : "text-white/70"}>
  # {channel.name}
</span>
```

- `isUnread(channelId)`: 안 읽은 메시지가 있으면 `true`. `unread` 에는 `{ 채널id: true/false }` 가 통째로 들어 있습니다.
- 새 메시지가 오면 Realtime 으로 바로 굵게 되고, 채널을 열어 읽음 처리(`useMarkAsRead`)가 되면 바로 풀립니다.
- 채널에 새로 참여하거나 DM 을 새로 만들어도 따로 할 일은 없습니다. 그 채널에 메시지가 오면 자동으로 DB 를 다시 읽습니다.
  (바로 다시 읽고 싶을 때만 `refresh()` 를 부르면 됩니다)
- 기준: 채널 본문 메시지(스레드 답글 제외) 중 `id > last_read_message_id` 인 것이 있으면 미읽음. 내가 보낸 메시지는 미읽음으로 치지 않습니다.
- **굵게가 풀리려면 B 의 메시지 목록에 `useMarkAsRead` 가 연결되어 있어야 합니다** (위 D-1 참고).

## @멘션 (D-3)

멘션은 별도 테이블 없이 메시지 본문의 **"@이름" 글자**로 판단합니다. "@수정님"처럼 이름 뒤에 글자가 붙어도 멘션으로 봅니다.

- **이름이 겹치면 가장 길게 맞는 사람만**: "문수정Test"와 "문수정Test2"가 있을 때 `@문수정Test2` 는 문수정Test2 만, `@문수정Test님` 은 문수정Test 만 (가입한 사람 이름 목록으로 판단)
- **`@all` = 채널 멤버 전원**: 알림 카드는 "📢 계섭님이 #알파에서 전체에게 알렸어요". 입력창 자동완성 맨 위에 "@all 채널 모든 멤버에게 알림"이 뜹니다 (상대가 한 명뿐인 DM 에서는 안 뜸). `@allen` 처럼 영문이 이어지면 전체 멘션이 아닙니다.
- 이메일처럼 `@` 앞에 글자가 붙어 있으면(`a@b.com`) 멘션이 아닙니다 (말풍선 강조와 같은 규칙)

### 1) 멘션 배지 — 채널 목록 `renderBadge` 칸에 연결 (CONTRACTS.md 규격)

```tsx
import UnreadBadge from "@/components/notifications/UnreadBadge";

<ChannelList
  ...
  renderBadge={(id) => <UnreadBadge channelId={id} activeChannelId={channelId} />}
/>
```

- 나를 멘션한 **안 읽은** 본문 메시지 수를 빨간 숫자로 보여 줍니다 (0이면 안 보임, 100개부터 `99+`).
- 채널을 열어 읽음 처리가 되면 바로 사라집니다.
- `useUnread()` 의 `mentionCount(channelId)` 로 숫자만 받을 수도 있습니다.
- `useUnread` / `UnreadBadge` 를 여러 군데 써도 DB 요청·Realtime 구독은 한 번만 합니다 (`unreadStore.ts`).
- **스레드 댓글 속 멘션도 알림 카드·윈도우 알림을 보냅니다** ("계섭님이 #알파 스레드 댓글에서 나를 언급했어요"). 누르면 스레드를 열고 그 댓글을 강조합니다. 그 스레드를 이미 열어 두었으면 띄우지 않습니다.
  - 단, 사이드바 **배지 숫자에는 세지 않습니다** (읽음 위치가 채널 본문 기준이라 댓글은 "읽음"으로 지울 방법이 없어서). 화면이 숨겨져 실시간으로 못 받은 댓글 멘션은 돌아왔을 때 다시 찾지 않습니다.
- **수정·삭제도 바로 반영**합니다 (Realtime UPDATE). 안 읽은 메시지에 "@내이름" 이 수정으로 들어가면 +1, 빠지면 -1.
  이미 읽은 메시지는 수정돼도 다시 "안 읽음"이 되지 않습니다. 안 읽은 최근 메시지가 삭제되면 굵게도 풀립니다.

### 2) @ 자동완성 — B 의 `MessageInput` 에 연결 (B 담당 파일 수정 필요)

```tsx
import { useMentionAutocomplete } from "@/components/notifications/useMentionAutocomplete";

const mention = useMentionAutocomplete({ channelId, textareaRef: ref, text, setText });

return (
  <div>
    {mention.popup}  {/* 입력창 줄 바로 위 */}
    <div className="flex items-end gap-2"> ... textarea ... </div>
  </div>
);
```

- `@` 를 치면 채널 멤버(나 제외) 이름 목록이 입력창 위에 뜹니다. ↑↓ 이동, Enter·Tab 선택, Esc 닫기.
- 목록이 열려 있을 때 Enter 는 전송이 아니라 이름 선택입니다. `MessageInput` 의 `onKeyDown` 은 고치지 않아도 됩니다.
- 커서 위치는 입력 이벤트가 끝난 뒤(다음 화면 그리기 직전)에 읽습니다. 그래서 입력창 쪽에서 입력 순서를 따로 맞추지 않아도 글자가 정상으로 써집니다.

### 테스트

```bash
node --test components/notifications/*.test.mjs
```

## 알림 (멘션 알림 카드 · 윈도우 알림 · 탭 제목 숫자)

```tsx
// 팀장님 — components/layout/AppShell.tsx 의 <ChannelProvider> 안에 한 줄
import NotificationToasts from "@/components/notifications/NotificationToasts";
<NotificationToasts />
```

- 누가 나를 `@멘션`하면 **화면 오른쪽 위에 알림 카드**가 10초 동안 떴다가 사라집니다 (✕ 로 바로 닫기).
  - 지금 보고 있는 채널의 멘션은 이미 눈앞에 있으므로 띄우지 않습니다.
  - 카드를 누르면 `jumpToMessage` 로 **그 메시지까지 이동 + 강조**합니다.
- 다른 탭·다른 프로그램을 보고 있으면 **윈도우 알림**(허락한 경우). 허락하지 않았으면 돌아왔을 때 카드로 보여 줍니다.
- 처음 한 번 "🔔 윈도우 알림을 켤까요?" 카드가 뜹니다 (알림 켜기 / 나중에).
- 탭 제목에 안 읽은 멘션 수: `(2) TalkTalk`
- **놓친 멘션도 알림:** 실시간 신호를 놓친 경우를 위해 **탭·창으로 돌아올 때, 그리고 화면을 보는 동안 1분마다** DB 를 다시 읽고, 새로 찾은 멘션을 카드로 보여 줍니다 (최근 3개). 처음 로그인할 때 쌓여 있던 예전 멘션은 배지로만.
- 화면 어디에 넣어도 `document.body` 에 포털로 붙어 오른쪽 위에 뜹니다. `useSelectedChannel()` 을 쓰므로 `ChannelProvider` 안이어야 합니다.
- **초대 알림** (006 `channel_members` Realtime): 비공개 채널에 초대되면 "🔒 비공개 채널 #인사팀에 초대됐어요", 누가 나에게 새 DM 을 시작하면 "💬 계섭님이 DM을 시작했어요" 카드 → 누르면 그 채널을 엽니다. 사이드바 채널·DM 목록도 바로 다시 불러옵니다.
  - 내가 만든 채널·DM, 내가 직접 참여한 공개 채널은 알리지 않습니다. 누가 초대했는지는 DB 에 기록되지 않아 채널 이름만 보여 줍니다.
  - 화면이 숨겨져 실시간 신호를 놓쳤어도, 돌아와 다시 읽을 때 새로 생긴 채널을 찾아 알려 줍니다.
