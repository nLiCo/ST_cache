// 내 위치 추적. 실제 GPS 또는 가짜 위치 모드(?mock=1: 지도를 누른 곳을 내 위치로 쓴다).
import { showToast } from "./ui.js";

export const MOCK = new URLSearchParams(location.search).has("mock");
const MAX_POSITION_AGE_MS = 30000; // GPS 위치가 이보다 오래됐으면 판정에 쓰지 않는다

let current = null; // { lat, lng, accuracy, time }
const listeners = [];

export function getPosition() {
  return current;
}

// 판정에 쓸 만큼 최근 위치가 있는지. 가짜 위치는 시간이 지나도 그대로 쓴다.
export function hasFreshPosition() {
  return !!current && (MOCK || Date.now() - current.time.getTime() <= MAX_POSITION_AGE_MS);
}

export function onPosition(callback) {
  listeners.push(callback);
}

function update(lat, lng, accuracy) {
  current = { lat, lng, accuracy, time: new Date() };
  for (const cb of listeners) cb(current);
}

// map은 가짜 위치 모드에서 클릭을 받을 Leaflet 지도.
export function startTracking(map) {
  if (MOCK) {
    showToast("가짜 위치 모드: 지도를 눌러 위치를 옮기세요");
    map.on("click", (e) => update(e.latlng.lat, e.latlng.lng, 5));
    return;
  }
  if (!("geolocation" in navigator)) {
    showToast("이 브라우저는 위치 기능을 지원하지 않아요");
    return;
  }
  navigator.geolocation.watchPosition(
    (pos) => update(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
    (err) => showToast(`위치를 가져오지 못했어요 (${err.message})`),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
  );
}
