// ① 탐색: 큰 지도, 사진 격자, 사진 상세(확인 버튼).
// 장소 목록은 public_places 뷰에서 읽는다. 찾기 전 장소는 이름·이야기·좌표가 비어서 온다.
// 판정은 서버 함수 check_place가 한다. 브라우저는 위치만 보낸다.
// 어느 요소가 보일지는 main.js가 정하는 body의 data-screen과 화면 너비로 style.css가 정한다.
import { supabase, photoUrl } from "./supabase.js";
import { getAuth, onAuthChange, hasNickname, signIn } from "./auth.js";
import { startTracking, getPosition, hasFreshPosition, onPosition } from "./geo.js";
import { placeHash } from "./routes.js";
import { showToast, escapeHtml } from "./ui.js";

export const CAMPUS_CENTER = [37.63237, 127.0789];
// 지도를 끌고 갈 수 있는 범위. OSM의 캠퍼스 경계 사각형에 사방 약 150m 여유를 둔다
// (가장자리 별·카드가 잘리지 않게). 장소 좌표로 계산하지 않는다.
const CAMPUS_BOUNDS = [[37.6268, 127.0736], [37.6379, 127.0848]];
const DEFAULT_ZOOM = 17;
const MIN_ZOOM = 16;
const HIDDEN_NAME = "???";

let map;
let places = [];       // public_places 행
let loaded = false;    // 장소 목록을 한 번이라도 읽었는지
let route = { screen: "photos", placeId: null };
const markers = new Map();
const placesListeners = [];

let started = false;    // 첫 주소를 처리했는지(링크로 바로 들어온 상세와 앱 안에서 연 상세를 가른다)
let backToGrid = false; // 지금 상세를 격자에서 열었는지. 그렇다면 ← 는 history.back()
let renderedPlaceId = null; // 상세에 지금 그려져 있는 장소
let gridScroll = 0;    // 격자 스크롤 위치. 상세가 보이는 동안 패널 높이가 줄어 0으로 잘리므로 따로 기억한다

const mapEl = document.getElementById("map");
const photosPanel = document.getElementById("photos");
const grid = document.getElementById("grid");
const detail = document.getElementById("detail");
const detailTitle = document.getElementById("detail-title");
const detailContent = document.getElementById("detail-content");
const detailAction = document.getElementById("detail-action");
const checkResult = detail.querySelector(".check-result");

export function initExplore() {
  map = L.map(mapEl, {
    zoomControl: false,
    maxBounds: CAMPUS_BOUNDS,
    maxBoundsViscosity: 1.0,
    minZoom: MIN_ZOOM,
  }).setView(CAMPUS_CENTER, DEFAULT_ZOOM);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);
  L.control.zoom({ position: "bottomright" }).addTo(map);

  onPosition(drawMe);
  startTracking(map);

  detail.addEventListener("click", onDetailClick);
  photosPanel.addEventListener("scroll", () => {
    if (route.screen === "photos") gridScroll = photosPanel.scrollTop;
  });
  // ← : 격자에서 열었으면 기록을 하나 되돌린다(폰의 뒤로 가기가 다시 상세를 열지 않게).
  // 링크·지도 별에서 바로 왔으면 지금 기록을 격자로 바꾼다(사이트 밖으로 나가지 않게).
  document.getElementById("detail-back").addEventListener("click", (e) => {
    e.preventDefault();
    if (backToGrid) history.back();
    else location.replace("#photos");
  });
  // 폰을 돌리거나 창 너비가 900px을 넘나들면 숨어 있던 지도가 새로 보일 수 있다.
  window.addEventListener("resize", fitMapIfVisible);

  // 로그인한 사람에 따라 찾은 장소·내가 올린 장소가 달라지므로 그때마다 다시 읽는다.
  onAuthChange(() => loadPlaces());
}

// main.js가 주소가 바뀔 때마다 부른다. body의 data-screen은 이미 바뀐 상태다.
export function showRoute(next) {
  const entering = next.screen === "place" && (route.screen !== "place" || next.placeId !== route.placeId);
  if (entering) backToGrid = started && route.screen === "photos";
  route = next;
  started = true;
  if (route.screen === "photos") photosPanel.scrollTop = gridScroll; // 상세에서 돌아오면 보던 자리로
  // 지도 탭에 다녀와 같은 장소로 돌아오면 다시 그리지 않는다(판정 문구, 스크롤 유지).
  if (route.screen === "place" && route.placeId !== renderedPlaceId) renderDetail();
  fitMapIfVisible();
}

// 다른 화면(등록)에서 장소가 늘었을 때 다시 읽는다.
export const reloadPlaces = () => loadPlaces();

// 장소 목록을 새로 읽을 때마다 callback(places).
export function onPlacesChange(callback) {
  placesListeners.push(callback);
  if (loaded) callback(places);
}

// 숨어 있던 지도가 보이게 되면 Leaflet이 칸 크기를 잘못 알고 있어서 다시 재게 한다.
function fitMapIfVisible() {
  if (map && getComputedStyle(mapEl).display !== "none") map.invalidateSize();
}

async function loadPlaces() {
  const { data, error } = await supabase
    .from("public_places").select("*").order("created_at").order("id");
  if (error) {
    showToast(`장소를 불러오지 못했어요 (${error.message})`);
    return;
  }
  places = data;
  loaded = true;
  renderMarkers();
  renderGrid();
  renderProgress();
  if (route.screen === "place") renderDetail();
  for (const cb of placesListeners) cb(places);
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
    marker.on("click", () => { location.hash = placeHash(place.id); });
    markers.set(place.id, marker);
  }
}

// ---------- 사진 격자 / 진행도 ----------

function renderGrid() {
  grid.innerHTML = places.map((place) => `
    <a class="cell ${place.found ? "found" : ""}" href="${escapeHtml(placeHash(place.id))}">
      <img src="${escapeHtml(photoUrl(place.photo_path))}" alt="" loading="lazy">
      ${place.found ? '<span class="badge">★</span>' : ""}
      <span class="label">${escapeHtml(place.name ?? HIDDEN_NAME)}</span>
    </a>`).join("");
}

function renderProgress() {
  // 내가 올린 장소는 찾을 수 없으니 전체에서 뺀다.
  const findable = places.filter((p) => !p.mine);
  const foundCount = findable.filter((p) => p.found).length;
  document.getElementById("progress").textContent = `찾은 장소 ${foundCount} / ${findable.length}`;
}

// ---------- 사진 상세 ----------

function renderDetail() {
  if (!loaded) return; // 목록을 읽은 뒤 loadPlaces가 다시 부른다
  const place = findPlace(route.placeId);
  if (!place) {
    detailContent.replaceChildren();
    renderedPlaceId = null;
    location.replace("#photos"); // 기록을 쌓으면 뒤로 가기가 이 주소로 돌아와 다시 튕기기를 되풀이한다
    showToast("장소를 찾을 수 없어요");
    return;
  }
  const photo = `<img class="detail-photo" src="${escapeHtml(photoUrl(place.photo_path))}" alt="장소 사진">`;
  const uploader = `<div class="uploader">올린 사람: ${escapeHtml(place.uploader_nickname)}</div>`;
  const hint = place.hint ? `<div class="hint">💡 ${escapeHtml(place.hint)}</div>` : "";
  const story = place.story ? `<p class="story">${escapeHtml(place.story)}</p>` : "";

  checkResult.hidden = true;
  if (place.mine) {
    detailTitle.textContent = place.name;
    detailContent.innerHTML = `${photo}${hint}${story}${uploader}`;
    detailAction.innerHTML = '<div class="status">내가 올린 장소</div>';
  } else if (place.found) {
    detailTitle.textContent = place.name;
    detailContent.innerHTML = `${photo}${story}${uploader}`;
    detailAction.innerHTML = '<div class="status found">★ 찾은 장소</div>';
  } else {
    // 남은 거리는 보여 주지 않는다. 사진만 보고 추측해서 찾아가는 게 핵심이다.
    detailTitle.textContent = HIDDEN_NAME;
    detailContent.innerHTML = `${photo}${hint}${uploader}`;
    detailAction.innerHTML = '<button type="button" class="confirm" data-action="confirm">📍 여기가 맞나 확인</button>';
  }
  if (renderedPlaceId !== place.id) detailContent.scrollTop = 0;
  renderedPlaceId = place.id;
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
  checkResult.innerHTML = html;
  checkResult.hidden = false;
}

async function onDetailClick(e) {
  if (e.target.closest('[data-action="login"]')) {
    signIn();
    return;
  }
  const button = e.target.closest('[data-action="confirm"]');
  if (!button) return;
  const place = findPlace(route.placeId);
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
    await loadPlaces(); // 이름·이야기·좌표가 채워진 줄을 다시 받고 상세를 찾은 상태로 다시 그린다
    const name = findPlace(place.id)?.name;
    if (result === "found") showToast(`'${name}'을(를) 찾았어요!`);
    return;
  }
  showResult(escapeHtml(MESSAGES[result] ?? result));
}
