// 시작점: 공통 상단(로그인 버튼, 닉네임), 해시 라우팅, 각 화면 켜기.
// 주소는 routes.js가 해석하고, 화면 이름을 body의 data-screen에 넣으면 style.css가 보일 요소를 정한다.
import { signIn, signOut, onAuthChange, openNicknameDialog } from "./auth.js";
import { initExplore, showRoute } from "./explore.js";
import { parseRoute } from "./routes.js";
import { initUpload, setUploadVisible } from "./upload.js";
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

// 메뉴에서 불이 들어올 항목. 상세는 사진 탭에 속하고, PC 상단 메뉴에는 지도 항목이 없어 탐색(photos)에 불이 들어온다.
const TAB_FOR = { photos: "photos", place: "photos", map: "map", upload: "upload" };
const MENU_FOR = { photos: "photos", place: "photos", map: "photos", upload: "upload" };

function route() {
  const r = parseRoute(location.hash);
  document.body.dataset.screen = r.screen;
  showRoute(r);
  setUploadVisible(r.screen === "upload");
  markCurrent("#tabs a", TAB_FOR[r.screen]);
  markCurrent("#menu a", MENU_FOR[r.screen]);
}

function markCurrent(selector, current) {
  for (const a of document.querySelectorAll(selector)) {
    if (a.dataset.for === current) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }
}

initExplore();
initUpload();
initDebug();
window.addEventListener("hashchange", route);
route();
