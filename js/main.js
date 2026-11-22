// 시작점. 지금은 공통 상단의 로그인 버튼만 맡는다.
// 프로토타입(app.js)을 화면별 모듈로 옮기면서 라우팅 등을 여기로 더한다.
import { signIn, signOut, onAuthChange } from "./auth.js";

const box = document.getElementById("account");

onAuthChange((user) => {
  box.replaceChildren();
  const button = document.createElement("button");
  button.type = "button";
  if (user) {
    // 닉네임은 profiles 테이블이 생기면 바꾼다. 지금은 이메일 앞부분.
    const name = document.createElement("span");
    name.textContent = user.email.split("@")[0];
    button.textContent = "로그아웃";
    button.addEventListener("click", () => signOut());
    box.append(name, button);
  } else {
    button.textContent = "로그인";
    button.addEventListener("click", () => signIn());
    box.append(button);
  }
});
