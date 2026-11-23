// 브라우저(클라이언트 컴포넌트, "use client")에서 쓰는 Supabase 클라이언트.
// 사용 예:
//   import { createClient } from "@/lib/supabase/client";
//   const supabase = createClient();
//   const { data } = await supabase.from("messages").select("*").eq("channel_id", id);
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { requireSupabaseEnv } from "./env";

// Supabase 응답을 브라우저 캐시에 저장하지 않는다.
//   Supabase 응답에는 캐시 금지 표시가 없어서 브라우저가 임의로 저장해 둔다.
//   같은 브라우저로 localhost:3000 과 배포 주소를 번갈아 열면, localhost 에서 저장된 응답
//   ("localhost:3000 전용" CORS 표시가 붙은 것)을 배포 주소에서 재사용하다 차단되어
//   메시지가 안 보이는 문제가 있었다. 채팅은 항상 최신 데이터가 필요하므로 캐시를 쓰지 않는다.
const noStoreFetch: typeof fetch = (input, init) => fetch(input, { ...init, cache: "no-store" });

export function createClient() {
  const { url, key } = requireSupabaseEnv();
  // 같은 브라우저에서는 내부적으로 하나의 인스턴스를 재사용한다.
  return createBrowserClient<Database>(url, key, { global: { fetch: noStoreFetch } });
}
