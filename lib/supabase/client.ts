// 브라우저(클라이언트 컴포넌트, "use client")에서 쓰는 Supabase 클라이언트.
// 사용 예:
//   import { createClient } from "@/lib/supabase/client";
//   const supabase = createClient();
//   const { data } = await supabase.from("messages").select("*").eq("channel_id", id);
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { requireSupabaseEnv } from "./env";

export function createClient() {
  const { url, key } = requireSupabaseEnv();
  // 같은 브라우저에서는 내부적으로 하나의 인스턴스를 재사용한다.
  return createBrowserClient<Database>(url, key);
}
