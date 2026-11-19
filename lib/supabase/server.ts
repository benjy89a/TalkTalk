// 서버(서버 컴포넌트 / Route Handler(app/api) / Server Action)에서 쓰는 Supabase 클라이언트.
// 요청마다 새로 만들어야 하므로 전역 변수에 저장하지 말 것.
// 사용 예:
//   import { createClient } from "@/lib/supabase/server";
//   const supabase = await createClient();
//   const { data: { user } } = await supabase.auth.getUser();
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";
import { requireSupabaseEnv } from "./env";

export async function createClient() {
  const { url, key } = requireSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // 서버 컴포넌트에서는 쿠키를 쓸 수 없다. 세션 갱신은 proxy.ts 가 대신 해주므로 무시해도 된다.
        }
      },
    },
  });
}
