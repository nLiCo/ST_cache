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

for (const place of PLACES) {
  markers[place.id] = L.marker([place.lat, place.lng], { icon: placeIcon(false) }).addTo(map);
}
