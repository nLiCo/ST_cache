// 장소 데이터 (프로토타입용 하드코딩)
// lat/lng는 tools/photos.py가 사진 EXIF에서 읽어 채운다.
// 사진 좌표가 현장과 어긋나면 ?debug=1에 뜨는 현재 좌표로 고치고 manualCoords: true를 붙인다.
// 그러면 photos.py가 그 장소의 좌표를 덮어쓰지 않는다.
// 장소를 추가하려면 원본 사진을 images/originals/에 넣고, 아래에 장소를 만들어
// photo를 "images/<원본 파일 이름>"으로 적은 뒤 python tools/photos.py를 실행한다.

const CAMPUS_CENTER = { lat: 37.62898, lng: 127.07931 }; // 두 장소의 가운데
const DEFAULT_ZOOM = 17;

const PLACES = [
  {
    id: "place-1",
    name: "돌계단 (이름 미정)",
    // 사진 EXIF 좌표(37.628861, 127.07721)가 현장에서 약 46m 어긋나서,
    // 2026-11-21 현장의 ?debug=1 좌표(정확도 ±12m)로 고쳤다.
    lat: 37.628601,
    lng: 127.077613,
    manualCoords: true,
    radius: 25,
    hint: "", // 사진만으로 어려우면 글 힌트를 적는다
    story: "이 장소에 얽힌 이야기나 소개를 적어 주세요.",
    photo: "images/20261121_193253.jpg",
  },
  {
    id: "place-2",
    name: "실내 방 (이름 미정)",
    lat: 37.629092,
    lng: 127.081405,
    radius: 25,
    hint: "", // 사진만으로 어려우면 글 힌트를 적는다
    story: "이 장소에 얽힌 이야기나 소개를 적어 주세요.",
    photo: "images/20261121_200335.jpg",
  },
];
