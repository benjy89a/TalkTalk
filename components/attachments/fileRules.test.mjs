// 첨부파일 규칙 테스트. Node 24의 TypeScript 지원으로 실행한다 (DB·계정 필요 없음).
// 실행: node --test components/attachments/fileRules.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_FILE_SIZE,
  buildAttachmentPath,
  fileMessageContent,
  formatBytes,
  isImageFile,
  safeFileName,
  validateFiles,
} from "./fileRules.ts";

test("Storage 경로용 파일 이름: 한글·띄어쓰기는 _ 로", () => {
  assert.equal(safeFileName("report.pdf"), "report.pdf");
  assert.equal(safeFileName("회의록 최종.docx"), "file.docx");
  assert.equal(safeFileName("my photo (1).PNG"), "my_photo_1.PNG");
  assert.equal(safeFileName(".env"), "env"); // 점으로 시작하면 숨김파일이 되지 않게
  assert.equal(safeFileName("noext"), "noext");
  // 폴더 이동 불가: / 가 남지 않고 . 으로 시작하지 않음
  const tricky = safeFileName("../../etc/passwd");
  assert.ok(!tricky.includes("/") && !tricky.startsWith("."), tricky);
});

test("팀 규칙 경로 {channel_id}/{uuid}-{파일이름}", () => {
  assert.equal(
    buildAttachmentPath("c1d2", "u-1", "사진 1.jpg"),
    "c1d2/u-1-1.jpg",
  );
  assert.equal(buildAttachmentPath("ch", "id", "a/b.txt").split("/").length, 2); // 폴더가 더 생기지 않음
});

test("이미지 판별", () => {
  assert.equal(isImageFile("a.PNG"), true);
  assert.equal(isImageFile("사진.jpeg"), true);
  assert.equal(isImageFile("a.pdf"), false);
  assert.equal(isImageFile("png"), false);
  assert.equal(isImageFile("a.svg"), false); // svg 는 미리보기 안 함
});

test("파일 크기 표시", () => {
  assert.equal(formatBytes(500), "500B");
  assert.equal(formatBytes(1536), "1.5KB");
  assert.equal(formatBytes(20 * 1024 * 1024), "20MB");
});

test("첨부 메시지 본문", () => {
  assert.equal(fileMessageContent(["a.png", "보고서.pdf"]), "📎 a.png, 보고서.pdf");
  const many = Array.from({ length: 30 }, (_, i) => `아주아주긴파일이름-${i}.txt`);
  const text = fileMessageContent(many);
  assert.ok(text.startsWith("📎 "));
  assert.match(text, /외 \d+개$/);
});

test("보내기 전 검사", () => {
  assert.equal(validateFiles([{ name: "a.txt", size: 10 }]), null);
  assert.match(validateFiles([]), /골라/);
  assert.match(validateFiles([{ name: "big.zip", size: MAX_FILE_SIZE + 1 }]), /너무 커요/);
  assert.match(validateFiles([{ name: "e.txt", size: 0 }]), /비어/);
  assert.match(validateFiles(Array.from({ length: 11 }, () => ({ name: "a", size: 1 }))), /10개/);
});
