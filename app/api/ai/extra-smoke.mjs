// 빌드된 실제 E-4 API를 localhost에서 검사한다. 계정·대화·외부 AI는 사용하지 않는다.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import next from "next";

const app = next({ dev: false, dir: process.cwd(), hostname: "127.0.0.1" });
const handle = app.getRequestHandler();
const server = createServer((request, response) => handle(request, response));
const endpoints = [
  { path: "search", input: { query: "지난주 배포 얘기" }, emptyCode: "INVALID_QUERY" },
  { path: "tasks", input: { channelId: "11111111-1111-4111-8111-111111111111" }, emptyCode: "INVALID_CHANNEL" },
];

try {
  await app.prepare();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  for (const endpoint of endpoints) {
    const url = `http://127.0.0.1:${address.port}/api/ai/${endpoint.path}`;
    const cases = [
      { body: "{", status: 400, code: "INVALID_JSON" },
      { body: "{}", contentType: "text/plain", status: 415, code: "JSON_REQUIRED" },
      { body: "{}", status: 400, code: endpoint.emptyCode },
      { body: JSON.stringify(endpoint.input), status: 401, code: "UNAUTHORIZED" },
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
      console.log(`PASS ${endpoint.path}: ${response.status} ${body.error.code}`);
    }
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    assert.equal(response.status, 405);
    console.log(`PASS ${endpoint.path}: GET 405 (POST 전용)`);
  }
  console.log("E-4 실제 Next.js HTTP 검사 10개 통과. 로그인 후 DB 권한·실제 AI 기능은 미검증.");
} finally {
  server.closeAllConnections();
  if (server.listening) await new Promise((resolve) => server.close(resolve));
  await app.close();
}
