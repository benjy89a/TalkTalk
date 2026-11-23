# components/attachments — [D 실사용 기능] 파일 첨부 업로드(Storage)·첨부 미리보기 컴포넌트를 두는 곳입니다.

## 파일 첨부 (D-4) — 연결 방법 (CONTRACTS.md 규격)

### 1) 첨부 버튼 → `MessageInput` 의 `extras` 칸

```tsx
import AttachButton from "@/components/attachments/AttachButton";

<MessageInput channelId={channelId} extras={<AttachButton channelId={channelId} />} />
// 스레드 답글 입력창: <AttachButton channelId={channelId} parentId={원본메시지id} />
```

- 누르면 파일 선택 창 → 고른 파일을 **"📎 파일이름" 메시지**로 바로 보냅니다 (여러 개 가능).
- 한 번에 최대 10개, 한 파일 최대 20MB. 실패하면 버튼 옆에 이유가 보입니다.

### 2) 첨부 표시 → `MessageList` 의 `renderAttachments` 칸

```tsx
import { renderMessageAttachments } from "@/components/attachments/AttachmentList";

<MessageList channelId={channelId} renderAttachments={renderMessageAttachments} />
```

- 이미지(png, jpg, gif, webp, bmp, avif)는 미리보기, 누르면 새 탭에서 크게 봅니다.
- 그 외 파일은 파일명 + **다운로드** 버튼. 파일을 받아 온 뒤 브라우저에서 원래 이름을 붙여 저장하므로 **한글 이름도 깨지지 않습니다**.
- 메시지 50개가 동시에 그려져도 DB 요청은 한 번으로 모아서 보냅니다.

### 직접 쓰는 함수

| 이름 | 하는 일 |
|---|---|
| `uploadAttachment(channelId, messageId, file)` | 이미 있는 메시지에 파일 하나 붙이기 → 저장된 `attachments` 행 반환 |
| `sendFiles({ channelId, parentId?, files })` | "📎" 메시지를 만들고 파일들을 붙임 (첨부 버튼이 사용) |

## 저장 규칙
- Storage `attachments` 버킷(비공개), 경로 `{channel_id}/{uuid}-{파일이름}`
- Supabase Storage 경로에는 한글·띄어쓰기를 쓸 수 없어서 **경로의 파일이름은 영문·숫자로 바꿔** 저장합니다.
  원래 이름은 `attachments.file_name` 에 그대로 저장되어 화면·다운로드에는 원래 이름이 보입니다.
- `file_url` 에는 Storage 경로를 저장하고, 보여줄 때 `createSignedUrls` 로 1시간짜리 임시 주소를 만듭니다.
- 파일을 하나도 못 올리면 만든 "📎" 메시지는 지웁니다.

## 테스트

```bash
node --test components/attachments/fileRules.test.mjs
```
