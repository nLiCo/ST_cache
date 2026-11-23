// 화면 주소(해시) 해석과 로그인 후 주소 되살리기 규칙. Node 테스트를 위해 아무것도 import하지 않는다.
// #photos(기본) / #place/<장소 id> / #map / #upload. 모르는 주소와 로그인 결과 해시(#access_token=…)는 기본 화면.

const PLACE_PREFIX = "#place/";

export function parseRoute(hash) {
  if (hash.startsWith(PLACE_PREFIX)) {
    const id = safeDecode(hash.slice(PLACE_PREFIX.length));
    if (id) return { screen: "place", placeId: id };
  }
  if (hash === "#map") return { screen: "map", placeId: null };
  if (hash === "#upload") return { screen: "upload", placeId: null };
  return { screen: "photos", placeId: null };
}

export function placeHash(id) {
  return PLACE_PREFIX + encodeURIComponent(id);
}

// 로그인하러 가기 전에 맡겨 둔 주소(saved)로 돌아갈지. 돌아갈 주소면 그 값, 아니면 null.
// 돌아온 뒤 이미 다른 화면으로 옮겨 갔다면(지금 주소가 기본 화면이 아니면) 건드리지 않는다.
export function restoreHash(saved, current) {
  if (!saved || parseRoute(saved).screen === "photos") return null;
  return parseRoute(current).screen === "photos" ? saved : null;
}

function safeDecode(s) {
  try {
    return decodeURIComponent(s);
  } catch {
    return "";
  }
}
