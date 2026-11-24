import assert from "node:assert/strict";
import test from "node:test";
import { shouldCancelOnAuthChange } from "./authCancel.ts";

test("탭 복귀 때 오는 같은 계정 SIGNED_IN 으로는 AI 요청을 취소하지 않음", () => {
  assert.equal(shouldCancelOnAuthChange("SIGNED_IN", "user-a", "user-a"), false);
});

test("로그아웃하면 취소", () => {
  assert.equal(shouldCancelOnAuthChange("SIGNED_OUT", "user-a", null), true);
  assert.equal(shouldCancelOnAuthChange("SIGNED_OUT", undefined, null), true);
});

test("다른 계정으로 바뀌면 이전 계정의 로그아웃으로 보고 취소", () => {
  assert.equal(shouldCancelOnAuthChange("SIGNED_IN", "user-a", "user-b"), true);
});

test("이전 계정을 모르거나 로그아웃 뒤 다시 로그인한 SIGNED_IN 은 취소하지 않음", () => {
  assert.equal(shouldCancelOnAuthChange("SIGNED_IN", undefined, "user-a"), false);
  assert.equal(shouldCancelOnAuthChange("SIGNED_IN", null, "user-a"), false);
});

test("토큰 갱신·사용자 정보 수정·첫 세션 신호로는 취소하지 않음", () => {
  for (const event of ["INITIAL_SESSION", "TOKEN_REFRESHED", "USER_UPDATED", "PASSWORD_RECOVERY"]) {
    assert.equal(shouldCancelOnAuthChange(event, "user-a", "user-a"), false, event);
  }
});
