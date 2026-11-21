// ST_cache 프로토타입

const params = new URLSearchParams(location.search);
const MOCK = params.has("mock");   // 지도를 누른 곳을 내 위치로 쓴다
const DEBUG = params.has("debug"); // 디버그 패널과 찾기 전 장소 마커를 보여 준다 (답이 보이는 테스트용)

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

// 찾기 전 장소의 위치는 곧 답이라서 지도에 올리지 않는다. 찾은 장소만 별로 보여 준다.
// 디버그 모드에서는 찾기 전 장소도 자물쇠로 보여 준다.
function refreshMarker(place) {
  const isFound = found.has(place.id);
  let marker = markers[place.id];
  if (!isFound && !DEBUG) {
    if (marker) {
      marker.remove();
      delete markers[place.id];
    }
    return;
  }
  if (!marker) {
    marker = L.marker([place.lat, place.lng]).addTo(map);
    marker.on("click", () => openCard(place.id));
    markers[place.id] = marker;
  }
  marker.setIcon(placeIcon(isFound));
}

for (const place of PLACES) refreshMarker(place);

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

  renderDebug();
}

// ---------- 도착 확인 ----------
// 반경에 들어가도 자동으로 열지 않는다. 지나가다 우연히 열리거나 GPS 오차로 도착 전에
// 열리는 걸 막기 위해, 카드의 확인 버튼을 눌렀을 때만 판정한다.

const MAX_ACCURACY_M = 50;     // 이보다 부정확하면 판정하지 않는다
const MAX_POSITION_AGE_MS = 30000; // GPS 위치가 이보다 오래됐으면 판정하지 않는다

// 결과: "found" | "no-position" | "inaccurate" | "not-here"
function confirmHere(place) {
  if (!me || (!MOCK && Date.now() - me.time.getTime() > MAX_POSITION_AGE_MS)) return "no-position";
  if (me.accuracy > MAX_ACCURACY_M) return "inaccurate";
  if (distanceMeters(me.lat, me.lng, place.lat, place.lng) > place.radius) return "not-here";

  found.add(place.id);
  saveFound();
  refreshMarker(place);
  renderStrip();
  updateProgress();
  showToast(`'${place.name}'을(를) 찾았어요!`);
  return "found";
}

// 거리는 알려 주지 않는다. 맞는지 아닌지만 말한다.
const CONFIRM_MESSAGES = {
  "no-position": "위치를 확인하는 중이에요. 잠시 후 다시 눌러 주세요.",
  "inaccurate": "위치가 부정확해요. 하늘이 보이는 곳에서 잠시 후 다시 눌러 주세요.",
  "not-here": "여기는 아닌 것 같아요. 사진을 다시 잘 보세요!",
};

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

// 한글 음절을 초성으로 바꾼다. 한글이 아닌 글자(공백, 괄호, 영문)는 그대로 둔다.
const CHOSEONG = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
function toChoseong(text) {
  return [...text].map((ch) => {
    const code = ch.charCodeAt(0) - 0xac00;
    return code >= 0 && code < 11172 ? CHOSEONG[Math.floor(code / 588)] : ch;
  }).join("");
}

// 찾기 전에는 초성만, 찾은 뒤에는 전체 이름을 보여 준다.
function displayName(place) {
  return found.has(place.id) ? place.name : toChoseong(place.name);
}

function renderCard(place) {
  if (found.has(place.id)) {
    return `
      <h2>${escapeHtml(place.name)}</h2>
      <div class="status">찾은 장소</div>
      <img src="${escapeHtml(place.photo)}" alt="${escapeHtml(place.name)} 사진">
      <p class="story">${escapeHtml(place.story)}</p>`;
  }
  // 남은 거리는 보여 주지 않는다. 사진만 보고 추측해서 찾아가는 게 핵심이다.
  const hint = place.hint ? `<div class="hint">${escapeHtml(place.hint)}</div>` : "";
  return `
    <h2>${escapeHtml(displayName(place))}</h2>
    <div class="status">사진 속 장소를 찾아가서 확인 버튼을 눌러 보세요</div>
    <img src="${escapeHtml(place.photo)}" alt="찾아갈 장소 사진">
    ${hint}
    <button type="button" class="confirm" data-action="confirm">📍 여기가 맞나 확인</button>
    <div class="check-result" hidden></div>`;
}

cardContent.addEventListener("click", (e) => {
  if (!e.target.closest('[data-action="confirm"]')) return;
  const place = PLACES.find((p) => p.id === openPlaceId);
  if (!place) return;
  const result = confirmHere(place);
  if (result === "found") {
    openCard(place.id); // 찾은 상태(전체 이름, 이야기)로 다시 그린다
    return;
  }
  const el = cardContent.querySelector(".check-result");
  el.textContent = CONFIRM_MESSAGES[result];
  el.hidden = false;
});

// ---------- 사진 목록 (화면 아래 띠) ----------

const strip = document.getElementById("strip");

function renderStrip() {
  strip.innerHTML = PLACES.map((place) => {
    const isFound = found.has(place.id);
    return `
      <button type="button" class="thumb ${isFound ? "found" : ""}" data-id="${escapeHtml(place.id)}">
        <img src="${escapeHtml(place.photo)}" alt="">
        ${isFound ? '<span class="badge">★</span>' : ""}
        <span class="label">${escapeHtml(displayName(place))}</span>
      </button>`;
  }).join("");
}

strip.addEventListener("click", (e) => {
  const thumb = e.target.closest(".thumb");
  if (thumb) openCard(thumb.dataset.id);
});

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

// ---------- 디버그 패널 (?debug=1) ----------
// 캠퍼스에서 GPS가 쓸 만한지 숫자로 확인하기 위한 패널. 장소별 거리가 나와 답이 보이므로
// 기본 화면에서는 숨긴다.

const debugEl = document.getElementById("debug");
const debugBody = document.getElementById("debug-body");
debugEl.hidden = !DEBUG;

document.getElementById("debug-toggle").addEventListener("click", () => {
  debugEl.classList.toggle("collapsed");
});

function renderDebug() {
  if (!DEBUG) return;
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
  for (const place of PLACES) refreshMarker(place);
  renderStrip();
  updateProgress();
  refreshOpenCard();
  renderDebug();
  showToast("찾은 기록을 초기화했어요");
}

// ---------- 가짜 위치 모드 (?mock=1) ----------
// 지도를 클릭한 곳을 내 위치로 쓴다. 실내 개발과 발표 시연용.

function startMock() {
  showToast("가짜 위치 모드: 지도를 눌러 위치를 옮기세요");
  if (DEBUG) debugEl.classList.remove("collapsed");
  map.on("click", (e) => updateMe(e.latlng.lat, e.latlng.lng, 5));
}

// ---------- 시작 ----------

renderStrip();
updateProgress();
renderDebug();
if (MOCK) startMock();
else startGeolocation();
