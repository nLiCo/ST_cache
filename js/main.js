// 시작점: 공통 상단(로그인 버튼, 닉네임, 화면 메뉴), 해시 라우팅(#explore, #upload), 각 화면 켜기.
import { signIn, signOut, onAuthChange, openNicknameDialog } from "./auth.js";
import { initExplore, setExploreVisible } from "./explore.js";
import { initDebug } from "./debug.js";

const account = document.getElementById("account");

function button(label, onClick) {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

onAuthChange(({ user, profile }) => {
  account.replaceChildren();
  if (!user) {
    account.append(button("로그인", () => signIn()));
    return;
  }
  if (profile?.nickname) {
    const name = document.createElement("span");
    name.textContent = profile.nickname;
    account.append(name);
  } else {
    account.append(button("닉네임 정하기", () => openNicknameDialog()));
  }
  account.append(button("로그아웃", () => signOut()));
});

// ---------- 해시 라우팅 ----------

function route() {
  const screen = location.hash === "#upload" ? "upload" : "explore";
  setExploreVisible(screen === "explore");
  document.getElementById("upload").hidden = screen !== "upload";
  for (const a of document.querySelectorAll("#menu a")) {
    if (a.hash === `#${screen}`) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
}

initExplore();
initDebug();
window.addEventListener("hashchange", route);
route();
