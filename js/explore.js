// ① 탐색 화면: 지도, 사진 띠, 장소 카드, 확인 버튼.
// 장소 목록은 public_places 뷰에서 읽는다. 찾기 전 장소는 이름·이야기·좌표가 비어서 온다.
// 판정은 서버 함수 check_place가 한다. 브라우저는 위치만 보낸다.
import { supabase, photoUrl } from "./supabase.js";
import { getAuth, onAuthChange, hasNickname, signIn } from "./auth.js";
import { startTracking, getPosition, hasFreshPosition, onPosition } from "./geo.js";
import { showToast, escapeHtml } from "./ui.js";

const CAMPUS_CENTER = [37.63237, 127.0789];
const DEFAULT_ZOOM = 17;
const HIDDEN_NAME = "???";

let map;
let places = [];        // public_places 행
let openPlaceId = null; // 열려 있는 카드의 장소 id
const markers = new Map();

const card = document.getElementById("card");
const cardContent = document.getElementById("card-content");
const strip = document.getElementById("strip");

export function initExplore() {
  map = L.map("map", { zoomControl: false }).setView(CAMPUS_CENTER, DEFAULT_ZOOM);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);
  L.control.zoom({ position: "bottomright" }).addTo(map);

  onPosition(drawMe);
  startTracking(map);

  strip.addEventListener("click", (e) => {
    const thumb = e.target.closest(".thumb");
    if (thumb) openCard(thumb.dataset.id);
  });
  cardContent.addEventListener("click", onCardClick);
  document.getElementById("card-close").addEventListener("click", closeCard);

  // 로그인한 사람에 따라 찾은 장소·내가 올린 장소가 달라지므로 그때마다 다시 읽는다.
  onAuthChange(() => loadPlaces());
}

// 탐색 화면 보이기/숨기기. 숨겼다 다시 보이면 Leaflet이 칸 크기를 잘못 알고 있어서 다시 재게 한다.
export function setExploreVisible(visible) {
  document.getElementById("map").hidden = !visible;
  strip.hidden = !visible;
  if (visible) map.invalidateSize();
  else closeCard();
}

// 다른 화면(등록)에서 장소가 늘었을 때 다시 읽는다.
export const reloadPlaces = () => loadPlaces();

async function loadPlaces() {
  const { data, error } = await supabase
    .from("public_places").select("*").order("created_at").order("id");
  if (error) {
    showToast(`장소를 불러오지 못했어요 (${error.message})`);
    return;
  }
  places = data;
  renderMarkers();
  renderStrip();
  renderProgress();
  if (openPlaceId) openCard(openPlaceId);
}

const findPlace = (id) => places.find((p) => p.id === id);

// ---------- 내 위치 ----------

let meMarker = null;
let meCircle = null;

function drawMe({ lat, lng, accuracy }) {
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
}

// ---------- 지도 마커: 찾은 장소만 노란 별 ----------

const starIcon = L.divIcon({
  className: "",
  html: '<div class="place-marker found">★</div>',
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

function renderMarkers() {
  for (const marker of markers.values()) marker.remove();
  markers.clear();
  for (const place of places) {
    if (!place.found || place.lat == null) continue;
    const marker = L.marker([place.lat, place.lng], { icon: starIcon }).addTo(map);
    marker.on("click", () => openCard(place.id));
    markers.set(place.id, marker);
  }
}

// ---------- 사진 띠 / 진행도 ----------

function renderStrip() {
  strip.innerHTML = places.map((place) => `
    <button type="button" class="thumb ${place.found ? "found" : ""}" data-id="${escapeHtml(place.id)}">
      <img src="${escapeHtml(photoUrl(place.photo_path))}" alt="">
      ${place.found ? '<span class="badge">★</span>' : ""}
      <span class="label">${escapeHtml(place.name ?? HIDDEN_NAME)}</span>
    </button>`).join("");
}

function renderProgress() {
  // 내가 올린 장소는 찾을 수 없으니 전체에서 뺀다.
  const findable = places.filter((p) => !p.mine);
  const foundCount = findable.filter((p) => p.found).length;
  document.getElementById("progress").textContent = `찾은 장소 ${foundCount} / ${findable.length}`;
}

// ---------- 장소 카드 ----------

function renderCard(place) {
  const photo = `<img src="${escapeHtml(photoUrl(place.photo_path))}" alt="장소 사진">`;
  const uploader = `<div class="uploader">올린 사람: ${escapeHtml(place.uploader_nickname)}</div>`;
  const hint = place.hint ? `<div class="hint">${escapeHtml(place.hint)}</div>` : "";
  const story = place.story ? `<p class="story">${escapeHtml(place.story)}</p>` : "";

  if (place.mine) {
    return `
      <h2>${escapeHtml(place.name)}</h2>
      <div class="status">내가 올린 장소</div>
      ${photo}${hint}${story}${uploader}`;
  }
  if (place.found) {
    return `
      <h2>${escapeHtml(place.name)}</h2>
      <div class="status">찾은 장소</div>
      ${photo}${story}${uploader}`;
  }
  // 남은 거리는 보여 주지 않는다. 사진만 보고 추측해서 찾아가는 게 핵심이다.
  return `
    <h2>${HIDDEN_NAME}</h2>
    <div class="status">사진 속 장소를 찾아가서 확인 버튼을 눌러 보세요</div>
    ${photo}${hint}${uploader}
    <button type="button" class="confirm" data-action="confirm">📍 여기가 맞나 확인</button>
    <div class="check-result" hidden></div>`;
}

function openCard(id) {
  const place = findPlace(id);
  if (!place) return closeCard();
  openPlaceId = id;
  cardContent.innerHTML = renderCard(place);
  card.hidden = false;
}

function closeCard() {
  card.hidden = true;
  openPlaceId = null;
}

// ---------- 확인 버튼 ----------

// 거리는 알려 주지 않는다. 맞는지 아닌지만 말한다.
const MESSAGES = {
  "no-position": "위치를 확인하는 중이에요. 잠시 후 다시 눌러 주세요.",
  inaccurate: "위치가 부정확해요. 하늘이 보이는 곳에서 잠시 후 다시 눌러 주세요.",
  own: "내가 올린 장소예요.",
  not_here: "여기는 아닌 것 같아요. 사진을 다시 잘 보세요!",
};

function showResult(html) {
  const el = cardContent.querySelector(".check-result");
  if (!el) return;
  el.innerHTML = html;
  el.hidden = false;
}

async function onCardClick(e) {
  if (e.target.closest('[data-action="login"]')) {
    signIn();
    return;
  }
  const button = e.target.closest('[data-action="confirm"]');
  if (!button) return;
  const place = findPlace(openPlaceId);
  if (!place) return;

  if (!getAuth().user) {
    showResult('확인하려면 로그인이 필요해요. <button type="button" class="link" data-action="login">구글로 로그인</button>');
    return;
  }
  if (!hasNickname()) return;
  if (!hasFreshPosition()) {
    showResult(MESSAGES["no-position"]);
    return;
  }

  const me = getPosition();
  button.disabled = true;
  const { data: result, error } = await supabase.rpc("check_place", {
    place_id: place.id, lat: me.lat, lng: me.lng, accuracy: me.accuracy,
  });
  button.disabled = false;

  if (error) {
    showResult(`확인하지 못했어요 (${escapeHtml(error.message)})`);
    return;
  }
  if (result === "found" || result === "already") {
    await loadPlaces(); // 이름·이야기·좌표가 채워진 줄을 다시 받고 카드를 찾은 상태로 다시 그린다
    const name = findPlace(place.id)?.name;
    if (result === "found") showToast(`'${name}'을(를) 찾았어요!`);
    return;
  }
  showResult(escapeHtml(MESSAGES[result] ?? result));
}
