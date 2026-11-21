// 장소 데이터 (프로토타입용 하드코딩)
// TODO: CAMPUS_CENTER와 각 장소의 lat/lng를 실제 캠퍼스 좌표로 바꾼다.
//       구글 지도에서 지점을 우클릭(PC)하거나 길게 누르면(폰) "위도, 경도"가 나온다.
//       현장에서 디버그 패널에 뜨는 현재 좌표를 적어 넣으면 더 정확하다.

const CAMPUS_CENTER = { lat: 37.5665, lng: 126.9780 }; // 플레이스홀더
const DEFAULT_ZOOM = 17;

const PLACES = [
  {
    id: "place-1",
    name: "장소 1 (이름 미정)",
    lat: 37.5671,
    lng: 126.9772,
    radius: 25,
    hint: "힌트를 적어 주세요. 예: 도서관 뒤편, 계단 옆 작은 정원.",
    story: "이 장소에 얽힌 이야기나 소개를 적어 주세요.",
    photo: "images/placeholder-1.svg",
  },
  {
    id: "place-2",
    name: "장소 2 (이름 미정)",
    lat: 37.5660,
    lng: 126.9790,
    radius: 25,
    hint: "힌트를 적어 주세요.",
    story: "이 장소에 얽힌 이야기나 소개를 적어 주세요.",
    photo: "images/placeholder-2.svg",
  },
  {
    id: "place-3",
    name: "장소 3 (이름 미정)",
    lat: 37.5658,
    lng: 126.9768,
    radius: 25,
    hint: "힌트를 적어 주세요.",
    story: "이 장소에 얽힌 이야기나 소개를 적어 주세요.",
    photo: "images/placeholder-3.svg",
  },
];
