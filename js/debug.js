// 디버그 패널(?debug=1). 현장에서 GPS가 쓸 만한지 숫자로 확인하는 용도.
// 장소 좌표는 브라우저에 없으므로 장소별 거리는 보여 주지 않는다.
import { MOCK, getPosition, onPosition } from "./geo.js";
import { supabase } from "./supabase.js";

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

  // 승인 대기 장소 수. mock은 위치만 가짜라서 DB는 그대로 쓴다.
  let pending = "확인 중…";
  supabase.rpc("pending_place_count").then(({ data, error }) => {
    pending = error ? "불러오지 못함" : `${data}개`;
    render();
  });

  const render = () => {
    const me = getPosition();
    const lines = [`모드: ${MOCK ? "가짜 위치(mock)" : "GPS"}`, `승인 대기: ${pending}`];
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
