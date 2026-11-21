// ST_cache 프로토타입

const map = L.map("map", { zoomControl: false })
  .setView([CAMPUS_CENTER.lat, CAMPUS_CENTER.lng], DEFAULT_ZOOM);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "&copy; OpenStreetMap contributors",
}).addTo(map);

L.control.zoom({ position: "bottomright" }).addTo(map);

// ---------- 장소 마커 ----------

const markers = {};

function placeIcon(found) {
  return L.divIcon({
    className: "",
    html: `<div class="place-marker ${found ? "found" : "locked"}">${found ? "★" : "🔒"}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

// ---------- 찾은 장소 저장 ----------

const STORAGE_KEY = "st_cache.found";

function loadFound() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const ids = new Set(PLACES.map((p) => p.id));
    return new Set((raw ? JSON.parse(raw) : []).filter((id) => ids.has(id)));
  } catch (e) {
    return new Set();
  }
}

function saveFound() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...found]));
  } catch (e) {
    // 저장이 안 되는 환경이면 이번 세션에서만 유지한다
  }
}

const found = loadFound();

for (const place of PLACES) {
  const marker = L.marker([place.lat, place.lng], { icon: placeIcon(found.has(place.id)) }).addTo(map);
  marker.on("click", () => openCard(place.id));
  markers[place.id] = marker;
}

// ---------- 거리 계산 ----------

// 하버사인 공식: 두 좌표 사이 거리(m)
function distanceMeters(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ---------- 현재 위치 ----------

let me = null; // { lat, lng, accuracy, time }
let meMarker = null;
let meCircle = null;

function updateMe(lat, lng, accuracy) {
  me = { lat, lng, accuracy, time: new Date() };

  if (!meMarker) {
    meMarker = L.marker([lat, lng], {
      icon: L.divIcon({ className: "", html: '<div class="me-marker"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }),
      interactive: false,
    }).addTo(map);
    meCircle = L.circle([lat, lng], {
      radius: accuracy, color: "#2a7de1", weight: 1, fillOpacity: 0.12, interactive: false,
    }).addTo(map);
  } else {
    meMarker.setLatLng([lat, lng]);
    meCircle.setLatLng([lat, lng]).setRadius(accuracy);
  }

  checkArrivals();
  refreshOpenCard();
  renderDebug();
}

function checkArrivals() {
  if (!me) return;
  for (const place of PLACES) {
    if (found.has(place.id)) continue;
    const d = distanceMeters(me.lat, me.lng, place.lat, place.lng);
    if (d <= place.radius) {
      found.add(place.id);
      saveFound();
      markers[place.id].setIcon(placeIcon(true));
      updateProgress();
      showToast(`'${place.name}'을(를) 찾았어요!`);
      openCard(place.id);
    }
  }
}

function startGeolocation() {
  if (!("geolocation" in navigator)) {
    showToast("이 브라우저는 위치 기능을 지원하지 않아요");
    return;
  }
  navigator.geolocation.watchPosition(
    (pos) => updateMe(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
    (err) => showToast(`위치를 가져오지 못했어요 (${err.message})`),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
  );
}

// ---------- 장소 카드 ----------

const card = document.getElementById("card");
const cardContent = document.getElementById("card-content");
let openPlaceId = null;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderCard(place) {
  if (found.has(place.id)) {
    return `
      <h2>${escapeHtml(place.name)}</h2>
      <div class="status">찾은 장소</div>
      <img src="${escapeHtml(place.photo)}" alt="${escapeHtml(place.name)} 사진">
      <p class="story">${escapeHtml(place.story)}</p>`;
  }
  const dist = me ? `${Math.round(distanceMeters(me.lat, me.lng, place.lat, place.lng))} m` : "위치 확인 중…";
  return `
    <h2>${escapeHtml(place.name)}</h2>
    <div class="status">아직 찾지 못한 장소 · 반경 ${place.radius} m 안으로 가면 열려요</div>
    <div class="hint">${escapeHtml(place.hint)}</div>
    <div class="distance">${dist}</div>`;
}

function openCard(id) {
  const place = PLACES.find((p) => p.id === id);
  if (!place) return;
  openPlaceId = id;
  cardContent.innerHTML = renderCard(place);
  card.hidden = false;
}

function refreshOpenCard() {
  if (openPlaceId && !card.hidden) openCard(openPlaceId);
}

document.getElementById("card-close").addEventListener("click", () => {
  card.hidden = true;
  openPlaceId = null;
});

// ---------- 진행도 / 토스트 ----------

function updateProgress() {
  document.getElementById("progress").textContent = `찾은 장소 ${found.size} / ${PLACES.length}`;
  if (found.size === PLACES.length) {
    setTimeout(() => showToast("모든 장소를 찾았어요! 🎉"), 1500);
  }
}

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3000);
}

// ---------- 디버그 패널 ----------
// 캠퍼스에서 GPS가 쓸 만한지 숫자로 확인하기 위한 패널

const MOCK = new URLSearchParams(location.search).has("mock");
const debugEl = document.getElementById("debug");
const debugBody = document.getElementById("debug-body");

document.getElementById("debug-toggle").addEventListener("click", () => {
  debugEl.classList.toggle("collapsed");
});

function renderDebug() {
  const lines = [];
  lines.push(`모드: ${MOCK ? "가짜 위치(mock)" : "GPS"}`);
  if (me) {
    lines.push(`위도: ${me.lat.toFixed(6)}`);
    lines.push(`경도: ${me.lng.toFixed(6)}`);
    lines.push(`정확도: ±${Math.round(me.accuracy)} m`);
    lines.push(`갱신: ${me.time.toLocaleTimeString()}`);
    lines.push("");
    for (const place of PLACES) {
      const d = Math.round(distanceMeters(me.lat, me.lng, place.lat, place.lng));
      lines.push(`${found.has(place.id) ? "★" : "·"} ${place.id}: ${d} m`);
    }
  } else {
    lines.push("위치 대기 중…");
  }
  debugBody.textContent = lines.join("\n");

  {
    const reset = document.createElement("button");
    reset.type = "button";
    reset.textContent = "찾은 기록 초기화";
    reset.style.cssText = "display:block;margin-top:6px;font:inherit;";
    reset.addEventListener("click", resetFound);
    debugBody.appendChild(reset);
  }
}

function resetFound() {
  found.clear();
  saveFound();
  for (const place of PLACES) markers[place.id].setIcon(placeIcon(false));
  updateProgress();
  refreshOpenCard();
  renderDebug();
  showToast("찾은 기록을 초기화했어요");
}

// ---------- 가짜 위치 모드 (?mock=1) ----------
// 지도를 클릭한 곳을 내 위치로 쓴다. 실내 개발과 발표 시연용.

function startMock() {
  showToast("가짜 위치 모드: 지도를 눌러 위치를 옮기세요");
  debugEl.classList.remove("collapsed");
  map.on("click", (e) => updateMe(e.latlng.lat, e.latlng.lng, 5));
}

// ---------- 시작 ----------

updateProgress();
renderDebug();
if (MOCK) startMock();
else startGeolocation();
