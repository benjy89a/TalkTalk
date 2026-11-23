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
  const { data } = await supabase.auth.getClaims();
  const loggedIn = !!data?.claims;

  const { pathname } = request.nextUrl;
  const isLoginPage = pathname === "/login" || pathname.startsWith("/login/");
  // /api 는 화면이 아니라 데이터 요청이다. 각 API 가 직접 401 을 돌려주므로 여기서는 건드리지 않는다.
  const isApi = pathname === "/api" || pathname.startsWith("/api/");

  // 로그인 안 한 사용자 → 로그인 화면 (로그인 화면에 회원가입도 있다)
  // 로그인한 사용자가 /login 에 오면 → 첫 화면
  let target: string | null = null;
  if (!loggedIn && !isLoginPage && !isApi) target = "/login";
  else if (loggedIn && isLoginPage) target = "/";

  if (target) {
    const redirect = NextResponse.redirect(new URL(target, request.url));
    // 갱신된 로그인 쿠키를 이동 응답에도 그대로 실어 보낸다 (안 그러면 로그인이 풀린다)
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    // 토큰을 갱신했을 때 Supabase 가 붙이는 "캐시 금지" 헤더도 같이 옮긴다.
    // (response 의 나머지 헤더에는 Next 내부용 값이 섞여 있어 전부 복사하면 안 된다)
    for (const key of ["cache-control", "expires", "pragma"]) {
      const value = response.headers.get(key);
      if (value) redirect.headers.set(key, value);
    }
    return redirect;
  }

  return response;
}
