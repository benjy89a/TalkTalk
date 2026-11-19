// Supabase 접속 정보(.env.local)를 읽는 곳.
// 값이 비어 있으면 null 을 돌려줘서, 키를 넣기 전에도 화면은 뜨도록 한다.
export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  return { url, key };
}

export function requireSupabaseEnv() {
  const env = getSupabaseEnv();
  if (!env) {
    throw new Error(
      ".env.local 에 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY 가 없습니다. README 의 '최초 세팅'을 확인하세요.",
    );
  }
  return env;
}
