// 시작점: 공통 상단(로그인 버튼, 닉네임)과 각 화면을 켠다.
// 등록·랭킹 화면이 생기면 해시 라우팅(#explore, #upload, #rank)을 여기에 더한다.
import { signIn, signOut, onAuthChange, openNicknameDialog } from "./auth.js";
import { initExplore } from "./explore.js";
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

initExplore();
initDebug();
