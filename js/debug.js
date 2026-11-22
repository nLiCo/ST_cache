// 디버그 패널(?debug=1). 현장에서 GPS가 쓸 만한지 숫자로 확인하는 용도.
// 장소 좌표는 브라우저에 없으므로 장소별 거리는 보여 주지 않는다.
import { MOCK, getPosition, onPosition } from "./geo.js";

const DEBUG = new URLSearchParams(location.search).has("debug");

export function initDebug() {
  const panel = document.getElementById("debug");
  const body = document.getElementById("debug-body");
  panel.hidden = !DEBUG;
  if (!DEBUG) return;

  if (MOCK) panel.classList.remove("collapsed");
  document.getElementById("debug-toggle").addEventListener("click", () => {
    panel.classList.toggle("collapsed");
  });

  const render = () => {
    const me = getPosition();
    const lines = [`모드: ${MOCK ? "가짜 위치(mock)" : "GPS"}`];
    if (me) {
      lines.push(`위도: ${me.lat.toFixed(6)}`);
      lines.push(`경도: ${me.lng.toFixed(6)}`);
      lines.push(`정확도: ±${Math.round(me.accuracy)} m`);
      lines.push(`갱신: ${me.time.toLocaleTimeString()}`);
    } else {
      lines.push("위치 대기 중…");
    }
    body.textContent = lines.join("\n");
  };
  onPosition(render);
  render();
}
