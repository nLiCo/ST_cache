// 사진 상세의 둥근 미니맵(모바일 전용, PC에서는 CSS로 숨김).
// 큰 지도와 별개의 작은 Leaflet 지도다. 손으로 움직일 수 없고 내 위치를 가운데에 두고 따라간다.
// 찾은 곳 별만 그린다(찾기 전 장소는 좌표가 오지 않는다). 누르면 지도 탭으로 간다.
import { getPosition, onPosition } from "./geo.js";

const ZOOM = 17;
const CAMPUS_CENTER = [37.63237, 127.0789];

let mini;
let me = null;
let stars = [];

export function initMinimap(el) {
  mini = L.map(el, {
    dragging: false, touchZoom: false, scrollWheelZoom: false, doubleClickZoom: false,
    boxZoom: false, keyboard: false, zoomControl: false, attributionControl: false, // 출처는 CSS 글씨로 따로
  }).setView(CAMPUS_CENTER, ZOOM);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(mini);
  el.addEventListener("click", () => { location.hash = "#map"; });
  onPosition(({ lat, lng }) => {
    drawMe(lat, lng);
    mini.setView([lat, lng], ZOOM, { animate: false });
  });
}

// 장소 목록이 바뀔 때마다 찾은 곳 별을 다시 그린다.
export function drawStars(places) {
  for (const s of stars) s.remove();
  stars = places
    .filter((p) => p.found && p.lat != null)
    .map((p) => L.marker([p.lat, p.lng], {
      icon: L.divIcon({ className: "", html: '<div class="mini-star">★</div>', iconSize: [14, 14], iconAnchor: [7, 7] }),
      interactive: false,
    }).addTo(mini));
}

// 미니맵이 숨어 있다가 보일 때 크기를 다시 재고 내 위치로 가운데를 맞춘다.
export function refreshMinimap() {
  if (!mini || getComputedStyle(mini.getContainer()).display === "none" || !mini.getContainer().offsetWidth) return;
  mini.invalidateSize();
  const pos = getPosition();
  mini.setView(pos ? [pos.lat, pos.lng] : CAMPUS_CENTER, ZOOM, { animate: false });
}

function drawMe(lat, lng) {
  if (!me) {
    me = L.marker([lat, lng], {
      icon: L.divIcon({ className: "", html: '<div class="me-marker"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }),
      interactive: false,
    }).addTo(mini);
  } else {
    me.setLatLng([lat, lng]);
  }
}
