// 알림 규칙 테스트. Node 24의 TypeScript 지원으로 실행한다 (DB·계정 필요 없음).
// 실행: node --test components/notifications/notifyRules.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { chooseNotify, mentionTitle, previewText, tabTitle } from "./notifyRules.ts";

test("탭 제목 숫자", () => {
  assert.equal(tabTitle("TalkTalk", 0), "TalkTalk");
  assert.equal(tabTitle("TalkTalk", 2), "(2) TalkTalk");
  assert.equal(tabTitle("(2) TalkTalk", 5), "(5) TalkTalk"); // 이미 있던 숫자는 바꿈
  assert.equal(tabTitle("(5) TalkTalk", 0), "TalkTalk"); // 다 읽으면 원래대로
  assert.equal(tabTitle("TalkTalk", 150), "(99+) TalkTalk");
  assert.equal(tabTitle("(99+) TalkTalk", 1), "(1) TalkTalk");
});

test("본문 미리보기", () => {
  assert.equal(previewText("@수정\n내일  회의"), "@수정 내일 회의");
  const long = "가".repeat(100);
  assert.equal(previewText(long).length, 60);
  assert.ok(previewText(long).endsWith("…"));
});

test("알림 제목", () => {
  assert.equal(mentionTitle("계섭", { name: "프로젝트-알파", type: "public" }), "계섭님이 #프로젝트-알파에서 나를 언급했어요");
  assert.equal(mentionTitle("계섭", { name: "a-b", type: "dm" }), "계섭님이 DM에서 나를 언급했어요");
  assert.equal(mentionTitle("", null), "누군가님이 나를 언급했어요");
});

test("어떤 알림을 띄울지", () => {
  // 보고 있는 채널 + 탭 보임 → 아무것도 안 띄움
  assert.deepEqual(chooseNotify({ messageChannelId: "a", activeChannelId: "a", pageVisible: true, desktopAllowed: true }), { toast: false, desktop: false });
  // 다른 채널 + 탭 보임 → 카드
  assert.deepEqual(chooseNotify({ messageChannelId: "b", activeChannelId: "a", pageVisible: true, desktopAllowed: true }), { toast: true, desktop: false });
  // 탭 숨김 + 윈도우 알림 허락 → 윈도우 알림 (보던 채널이어도)
  assert.deepEqual(chooseNotify({ messageChannelId: "a", activeChannelId: "a", pageVisible: false, desktopAllowed: true }), { toast: false, desktop: true });
  // 탭 숨김 + 허락 안 함 → 돌아왔을 때 보이게 카드
  assert.deepEqual(chooseNotify({ messageChannelId: "b", activeChannelId: "a", pageVisible: false, desktopAllowed: false }), { toast: true, desktop: false });
});

test("초대 알림 문구", async () => {
  const { inviteNotice } = await import("./notifyRules.ts");
  const base = { me: "me", channelName: "인사팀", partnerName: "계섭" };
  assert.deepEqual(inviteNotice({ ...base, type: "private", createdBy: "boss" }), {
    kind: "private",
    title: "비공개 채널 #인사팀에 초대됐어요",
  });
  assert.deepEqual(inviteNotice({ ...base, type: "dm", createdBy: "gs" }), { kind: "dm", title: "계섭님이 DM을 시작했어요" });
  assert.equal(inviteNotice({ ...base, type: "dm", createdBy: "me" }), null); // 내가 만든 DM
  assert.equal(inviteNotice({ ...base, type: "private", createdBy: "me" }), null); // 내가 만든 채널
  assert.equal(inviteNotice({ ...base, type: "public", createdBy: "boss" }), null); // 공개 채널은 내가 참여
  assert.equal(inviteNotice({ ...base, type: "dm", createdBy: "x", partnerName: null }).title, "누군가님이 DM을 시작했어요");
});
