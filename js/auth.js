// 구글 로그인 / 로그아웃, 내 프로필(닉네임, 등급), 닉네임 정하기 창.
import { supabase } from "./supabase.js";
import { showToast } from "./ui.js";
import { restoreHash } from "./routes.js";

// 로그인하러 가기 전 보던 주소(#place/… 등)를 맡겨 두는 자리. 구글 로그인 결과가 해시로 돌아와서
// 돌아올 주소에 해시를 실을 수 없기 때문이다.
const RETURN_KEY = "st_cache_return_hash";

function takeReturnHash() {
  try {
    const saved = sessionStorage.getItem(RETURN_KEY);
    sessionStorage.removeItem(RETURN_KEY);
    return saved;
  } catch {
    return null;
  }
}

// 지금 로그인 상태. profile은 { nickname, role } (닉네임은 정하기 전이면 null).
let state = { ready: false, user: null, profile: null };
const listeners = [];

export function getAuth() {
  return state;
}

// 로그인 상태나 닉네임이 바뀔 때마다 callback(state)를 부른다.
// 처음 상태를 다 읽은 뒤에 한 번 부르고, 그 뒤로는 바뀔 때마다 부른다.
export function onAuthChange(callback) {
  listeners.push(callback);
  if (state.ready) callback(state);
}

function setState(next) {
  state = { ...state, ...next, ready: true };
  for (const cb of listeners) cb(state);
}

async function loadProfile(user) {
  const { data, error } = await supabase
    .from("profiles").select("nickname, role").eq("id", user.id).maybeSingle();
  if (error) {
    showToast(`내 정보를 불러오지 못했어요 (${error.message})`);
    return null;
  }
  return data;
}

let lastUserId; // 아직 한 번도 안 불렸으면 undefined
supabase.auth.onAuthStateChange((_event, session) => {
  const user = session ? session.user : null;
  // 토큰 갱신처럼 같은 사람으로 다시 불리는 경우는 무시한다.
  if ((user?.id ?? null) === lastUserId) return;
  lastUserId = user?.id ?? null;
  // 이 콜백 안에서 바로 Supabase를 부르면 멈출 수 있어서 한 박자 미룬다.
  setTimeout(async () => {
    const profile = user ? await loadProfile(user) : null;
    setState({ user, profile });
    const back = restoreHash(takeReturnHash(), location.hash);
    if (back) location.hash = back;
    if (user && profile && !profile.nickname) openNicknameDialog();
  }, 0);
});

export function signIn() {
  // 로그인 후 지금 보던 주소(?mock=1 같은 옵션 포함)로 돌아온다.
  const back = location.origin + location.pathname + location.search;
  try {
    sessionStorage.setItem(RETURN_KEY, location.hash);
  } catch {
    // 저장소를 못 쓰는 브라우저면 로그인 후 첫 화면으로 돌아온다.
  }
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: back },
  });
}

export function signOut() {
  return supabase.auth.signOut();
}

// 확인 버튼·등록처럼 닉네임이 있어야 하는 동작 앞에서 부른다.
// 쓸 수 있으면 true, 아니면 닉네임 창을 열고 false.
export function hasNickname() {
  if (state.profile?.nickname) return true;
  openNicknameDialog();
  return false;
}

// ---------- 닉네임 정하기 창 ----------

const dialog = document.getElementById("nickname-dialog");
const form = document.getElementById("nickname-form");
const input = document.getElementById("nickname-input");
const errorEl = document.getElementById("nickname-error");

export function openNicknameDialog() {
  if (!state.user || dialog.open) return;
  input.value = state.profile?.nickname ?? "";
  errorEl.textContent = "";
  dialog.showModal();
  input.focus();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const nickname = input.value.trim();
  if (nickname.length < 2 || nickname.length > 12) {
    errorEl.textContent = "닉네임은 2~12자로 정해 주세요.";
    return;
  }
  const { error } = await supabase
    .from("profiles").update({ nickname }).eq("id", state.user.id);
  if (error) {
    errorEl.textContent = error.code === "23505"
      ? "이미 누가 쓰고 있는 닉네임이에요."
      : `저장하지 못했어요 (${error.message})`;
    return;
  }
  dialog.close();
  setState({ profile: { ...state.profile, nickname } });
  showToast(`반가워요, ${nickname}님!`);
});

document.getElementById("nickname-cancel").addEventListener("click", () => dialog.close());
