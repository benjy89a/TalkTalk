// 매 요청마다 로그인 세션(토큰)을 갱신해 쿠키에 다시 써주는 코드. 루트의 proxy.ts 에서 호출한다.
// (Next.js 16 부터 middleware 의 이름이 proxy 로 바뀌었다)
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { getSupabaseEnv } from "./env";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const env = getSupabaseEnv();
  // .env.local 을 아직 안 넣었으면 아무것도 하지 않는다 (화면은 뜨도록)
  if (!env) return response;

  const supabase = createServerClient<Database>(env.url, env.key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  // 이 호출이 만료된 토큰을 갱신한다. 지우지 말 것.
  // (로그인 안 한 사용자를 /login 으로 보내는 처리는 C 가 필요할 때 팀장과 협의해 여기 추가)
  await supabase.auth.getClaims();

  return response;
}
