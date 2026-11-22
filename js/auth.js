// 구글 로그인 / 로그아웃과 로그인 상태 구독.
import { supabase } from "./supabase.js";

export function signIn() {
  // 로그인 후 지금 보던 주소(?mock=1 같은 옵션 포함)로 돌아온다.
  const back = location.origin + location.pathname + location.search;
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: back },
  });
}

export function signOut() {
  return supabase.auth.signOut();
}

// 로그인 상태가 바뀔 때마다(처음 열 때 포함) callback(user 또는 null)을 부른다.
export function onAuthChange(callback) {
  supabase.auth.onAuthStateChange((_event, session) => {
    callback(session ? session.user : null);
  });
}
