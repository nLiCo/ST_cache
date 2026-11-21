# ST_cache

캠퍼스의 잘 알려지지 않은 장소를 직접 찾아가 보게 하는 지오캐싱 웹앱 프로토타입.
기획과 범위는 [SPEC.md](SPEC.md) 참고.

## 실행

- 배포: GitHub Pages (Settings → Pages → Branch `main`, `/ (root)`)
- 위치 기능은 HTTPS에서만 동작하므로, 폰 테스트는 Pages 주소로 한다.
- `?mock=1`을 붙이면 지도를 누른 곳을 내 위치로 쓰는 가짜 위치 모드가 켜진다.

## 장소 수정

`places.js`의 `CAMPUS_CENTER`와 각 장소의 `lat`, `lng`, `hint`, `story`, `photo`를 바꾼다.
사진은 `images/`에 넣는다.
