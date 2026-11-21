# ST_cache

캠퍼스의 잘 알려지지 않은 장소를 직접 찾아가 보게 하는 지오캐싱 웹앱 프로토타입.
기획과 범위는 [SPEC.md](SPEC.md) 참고.

## 실행

- 배포: GitHub Pages (Settings → Pages → Branch `main`, `/ (root)`)
- 위치 기능은 HTTPS에서만 동작하므로, 폰 테스트는 Pages 주소로 한다.
- `?mock=1`을 붙이면 지도를 누른 곳을 내 위치로 쓰는 가짜 위치 모드가 켜진다.

## 장소 수정

1. 장소 앞에서 폰 카메라로 사진을 찍는다 (카메라 설정에서 위치 태그를 켠다).
2. 폰을 USB로 연결해 `내부 저장소\DCIM\Camera`의 원본을 `images/originals/`에 복사한다.
   Gmail이나 메신저 등 앱을 거치면 위치가 지워진다.
3. `places.js`에 장소를 만들고 `photo`를 `"images/<원본 파일 이름>"`으로 적는다.
4. `python tools/photos.py`를 실행한다 (Pillow 필요: `pip install pillow`).
   좌표가 `lat`, `lng`에 들어가고, EXIF를 지운 축소본이 `images/`에 생긴다.
5. `name`, `hint`, `story`는 직접 적는다. `images/originals/`는 커밋하지 않는다.
