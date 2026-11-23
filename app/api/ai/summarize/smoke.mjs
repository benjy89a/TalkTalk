// 빌드된 실제 Next.js API의 비로그인·잘못된 요청만 localhost에서 확인한다.
// 로그인 정보를 만들거나 외부 AI 서비스를 호출하지 않는다. 배포 서버를 바꾸는 파일이 아니다.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import next from "next";

const app = next({ dev: false, dir: process.cwd(), hostname: "127.0.0.1" });
const handle = app.getRequestHandler();
const server = createServer((request, response) => handle(request, response));

try {
  await app.prepare();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}/api/ai/summarize`;
  const cases = [
    { label: "잘못된 JSON", status: 400, code: "INVALID_JSON", body: "{" },
    { label: "잘못된 Content-Type", status: 415, code: "JSON_REQUIRED", body: "{}", contentType: "text/plain" },
    { label: "비로그인 텍스트 요청", status: 401, code: "UNAUTHORIZED", body: JSON.stringify({ messages: ["허용된 로컬 테스트 문장"] }) },
    { label: "비로그인 채널 요청", status: 401, code: "UNAUTHORIZED", body: JSON.stringify({ channelId: "11111111-1111-4111-8111-111111111111" }) },
  ];
  for (const item of cases) {
    const response = await fetch(url, {
      method: "POST", headers: { "Content-Type": item.contentType ?? "application/json" },
      body: item.body, signal: AbortSignal.timeout(15000),
    });
    const body = await response.json();
    assert.equal(response.status, item.status);
    assert.equal(body.error.code, item.code);
    assert.equal(response.headers.get("cache-control"), "no-store");
    console.log(`PASS ${item.label}: ${response.status} ${body.error.code}`);
  }
  const unsupported = await fetch(url, { signal: AbortSignal.timeout(15000) });
  assert.equal(unsupported.status, 405);
  console.log("PASS GET: 405 (POST 전용)");
  console.log("실제 Next.js HTTP 검사 5개 통과. 로그인 후 권한·AI 요약은 검증하지 않음.");
} finally {
  server.closeAllConnections();
  if (server.listening) await new Promise((resolve) => server.close(resolve));
  await app.close();
}
