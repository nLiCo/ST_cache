// 장소 데이터 (프로토타입용 하드코딩)
// lat/lng는 tools/photos.py가 사진 EXIF에서 읽어 채운다. 손으로 고치지 않는다.
// 장소를 추가하려면 원본 사진을 images/originals/에 넣고, 아래에 장소를 만들어
// photo를 "images/<원본 파일 이름>"으로 적은 뒤 python tools/photos.py를 실행한다.

const CAMPUS_CENTER = { lat: 37.62898, lng: 127.07931 }; // 두 장소의 가운데
const DEFAULT_ZOOM = 17;

const PLACES = [
  {
    id: "place-1",
    name: "돌계단 (이름 미정)",
    lat: 37.628861,
    lng: 127.07721,
    radius: 25,
    hint: "힌트를 적어 주세요.",
    story: "이 장소에 얽힌 이야기나 소개를 적어 주세요.",
    photo: "images/20261121_193253.jpg",
  },
  {
    id: "place-2",
    name: "실내 방 (이름 미정)",
    lat: 37.629092,
    lng: 127.081405,
    radius: 25,
    hint: "힌트를 적어 주세요.",
    story: "이 장소에 얽힌 이야기나 소개를 적어 주세요.",
    photo: "images/20261121_200335.jpg",
  },
];
