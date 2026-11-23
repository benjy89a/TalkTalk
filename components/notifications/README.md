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
- 채널에 새로 참여하거나 DM 을 새로 만든 직후에는 `refresh()` 를 불러 주세요 (`channel_members` 는 Realtime 이 꺼져 있어서).
- 기준: 채널 본문 메시지(스레드 답글 제외) 중 `id > last_read_message_id` 인 것이 있으면 미읽음. 내가 보낸 메시지는 미읽음으로 치지 않습니다.
- **굵게가 풀리려면 B 의 메시지 목록에 `useMarkAsRead` 가 연결되어 있어야 합니다** (위 D-1 참고).
