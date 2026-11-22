# 사진 중심 화면 배치 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모바일은 사진 격자 → 사진 상세(둥근 미니맵 + 확인 버튼) → 지도 탭, PC는 큰 지도 + 오른쪽 사진 패널로 탐색 화면을 다시 짠다.

**Architecture:** 화면 요소는 한 벌이고, `main.js`가 주소를 해석해 `document.body.dataset.screen`(`photos` / `place` / `map` / `upload`)을 정하면 CSS가 너비(900px)에 따라 무엇을 보일지 정한다. 주소 해석과 로그인 후 주소 되살리기 판단은 import 없는 `js/routes.js`에 두고 Node로 테스트한다. 미니맵은 별도의 작은 Leaflet 지도(`js/minimap.js`).

**Tech Stack:** 순수 HTML/CSS/JS(ES 모듈), Leaflet 1.9.4, Supabase JS 2.119.0(CDN), 테스트 `node --test "tests/*.test.mjs"`, 화면 확인은 headless Chrome + CDP 스크립트.

**Spec:** `docs/superpowers/specs/2026-11-23-photo-first-layout-design.md`

## Global Constraints

- 빌드 도구·프레임워크·npm 의존성 없음. DB 변경 없음.
- PC 배치 기준: `@media (min-width: 900px)`. 그보다 좁으면 모바일 배치.
- 주소: `#photos`(빈 주소·`#explore`·로그인 결과 해시·모르는 주소 포함, 기본), `#place/<장소 id>`, `#map`, `#upload`.
- 모바일 격자 2열, PC 패널 너비 약 380px·격자 3열. 상세 사진은 `object-fit: contain`, 격자 사진은 `cover`.
- 미니맵: 지름 84px 원, 끌기·확대·축소 끔, 줌 17, 내 위치를 가운데(없으면 캠퍼스 가운데 `[37.63237, 127.0789]`), 찾은 곳 별, 누르면 `#map`. PC에서 숨김. 근처에 "© OpenStreetMap" 작게.
- 상세의 ← 는 `#photos`로 간다(history.back 쓰지 않음).
- 없는 장소 주소: 장소 목록을 읽은 뒤 `#photos`로 보내고 토스트 "장소를 찾을 수 없어요".
- 찾기 전 장소의 이름·좌표가 화면에 드러나지 않는다(지금 규칙 유지). 확인 버튼·판정 로직은 바꾸지 않는다.
- 상단 줄(제목, 진행도, 계정)은 모든 화면에서 같다. 메뉴는 모바일 아래 탭(📷 사진 / 🗺 지도 / ➕ 등록), PC 상단(탐색 / 등록).
- 문구는 한국어 "~요"체. 커밋은 Conventional Commits, 한국어, 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. 상세 화면을 보던 중 폰을 돌리거나 창 너비를 900px 넘나들게 바꿈 → 주소와 상세 내용은 그대로, 큰 지도·미니맵이 회색 조각 없이 다시 그려진다. (Task 2·3 확인 단계)
2. 링크로 `#place/<id>`에 바로 들어옴(장소 목록을 읽기 전) → 목록을 다 읽은 뒤 상세가 뜨고, 격자로 튕기지 않는다. (Task 2 확인 단계)
3. 로그인 안 한 사람이 상세에서 확인 → 구글 로그인 → 같은 상세로 돌아온다. (Task 4 `restoreHash` 테스트 + 사용자 확인)
4. 모바일 가짜 위치 모드: 지도 탭에서 위치를 찍고 사진 탭 → 상세 → 확인하면 찍은 위치가 쓰인다. (Task 2 확인 단계)
5. 상세에서 찾기 성공 → 상세가 찾은 상태로 바뀌고, 격자에 별·이름, 큰 지도와 미니맵에 별이 생긴다. (Task 3 확인 단계, 로그인 필요 부분은 사용자 확인)

---

### Task 1: 주소 해석 `js/routes.js`

**Files:**
- Create: `js/routes.js`
- Create: `tests/routes.test.mjs`

**Interfaces:**
- Produces (순수 함수, import 없음):
  - `parseRoute(hash: string) -> { screen: "photos" | "place" | "map" | "upload", placeId: string | null }` — `#place/<id>`의 id는 `decodeURIComponent`. id가 비면 `photos`.
  - `placeHash(id: string) -> string` — `"#place/" + encodeURIComponent(id)`.
  - `restoreHash(saved: string | null, current: string) -> string | null` — 로그인 전에 맡겨 둔 해시 `saved`가 있고 그것이 기본 화면이 아니며(`parseRoute(saved).screen !== "photos"`), 지금 주소가 기본 화면이면(`parseRoute(current).screen === "photos"`) `saved`를 돌려준다. 아니면 `null`.

- [ ] **Step 1: 실패하는 테스트 쓰기**

```js
test("parseRoute: 기본 화면", () => {
  for (const h of ["", "#", "#photos", "#explore", "#nope", "#place/", "#access_token=abc&type=bearer", "#error=access_denied"]) {
    assert.deepEqual(parseRoute(h), { screen: "photos", placeId: null }, h);
  }
});
test("parseRoute: 상세, 지도, 등록", () => {
  assert.deepEqual(parseRoute("#place/1b2c-3d"), { screen: "place", placeId: "1b2c-3d" });
  assert.deepEqual(parseRoute(placeHash("a/b c")), { screen: "place", placeId: "a/b c" });
  assert.deepEqual(parseRoute("#map"), { screen: "map", placeId: null });
  assert.deepEqual(parseRoute("#upload"), { screen: "upload", placeId: null });
});
test("placeHash", () => assert.equal(placeHash("abc"), "#place/abc"));
test("restoreHash: 로그인 후 보던 상세로", () => {
  assert.equal(restoreHash("#place/abc", ""), "#place/abc");
  assert.equal(restoreHash("#place/abc", "#access_token=x"), "#place/abc");
  assert.equal(restoreHash("#upload", "#photos"), "#upload");
});
test("restoreHash: 되살릴 필요 없음", () => {
  assert.equal(restoreHash(null, ""), null);
  assert.equal(restoreHash("#photos", ""), null);
  assert.equal(restoreHash("#place/abc", "#map"), null); // 이미 다른 화면으로 옮겨 갔으면 건드리지 않는다
});
```

- [ ] **Step 2: 실패 확인** — Run: `node --test "tests/*.test.mjs"` → routes 테스트 FAIL(모듈 없음)
- [ ] **Step 3: `js/routes.js` 구현** (파일 맨 위 한국어 한 줄 주석)
- [ ] **Step 4: 통과 확인** — Run: `node --test "tests/*.test.mjs"` → 전부 pass
- [ ] **Step 5: 커밋** — `feat: 화면 주소 해석과 로그인 후 주소 되살리기 규칙 추가`

### Task 2: 사진 격자·상세와 반응형 배치

**Files:**
- Modify: `index.html` — `#strip`, `#card` 제거. 추가: `<section id="photos">` 안에 `<div id="grid">`와 `<div id="detail">`(맨 위 `← ` 버튼 줄 + `#detail-content` + `#detail-actions`: 미니맵 자리 `<div id="minimap">`와 확인 버튼이 들어갈 자리), `<nav id="tabs">`(아래 탭 링크 `#photos` `#map` `#upload`). 상단 `#menu`는 `#photos`(탐색), `#upload`(등록).
- Modify: `style.css` — 모바일 기본 + `@media (min-width: 900px)`. 기존 `#strip`, `.thumb`, `#card` 규칙 정리.
- Modify: `js/explore.js` — 띠 대신 격자, 카드 대신 상세. 별 마커 클릭 → `location.hash = placeHash(id)`.
- Modify: `js/main.js` — `parseRoute`로 화면 정하기, `body.dataset.screen`, 탭·메뉴 `aria-current`.

**Interfaces:**
- Consumes: Task 1 `parseRoute`, `placeHash`.
- Produces from `explore.js` (`setExploreVisible` 대신):
  - `showRoute(route: {screen, placeId}) -> void` — `place`면 상세를 그리고(목록을 아직 안 읽었으면 읽은 뒤), 목록에 없으면 `location.hash = "#photos"` + 토스트 "장소를 찾을 수 없어요". 지도가 보이게 된 경우 `map.invalidateSize()`.
  - `reloadPlaces() -> Promise<void>` — 그대로.
  - `onPlacesChange(cb: (places) => void) -> void` — 목록을 새로 읽을 때마다 부름(Task 3 미니맵이 별을 그리는 데 씀).
- Produces from `main.js`: `body.dataset.screen` ∈ `photos | place | map | upload`. `window` `resize` 때 현재 라우트로 `showRoute`를 다시 불러 지도 크기를 맞춘다.
- CSS 보이기 규칙(모바일): `photos` → `#photos` 안 `#grid`만; `place` → `#photos` 안 `#detail`만; `map` → `#map`만; `upload` → `#upload`만. PC: `photos`·`map` → 지도 + 패널(`#grid`), `place` → 지도 + 패널(`#detail`), `upload` → `#upload`만, `#tabs`와 `#minimap` 숨김.
- 상세 내용은 지금 `renderCard`의 세 상태(잠김 / 찾음 / 내가 올림)와 같은 정보. 확인 버튼(`data-action="confirm"`)과 결과 줄(`.check-result`)은 `#detail-actions`의 오른쪽. 확인 로직(`onCardClick`의 판정 부분)은 그대로 쓴다.
- 상단 ← 줄에는 잠긴 장소면 `???`, 아니면 장소 이름.

- [ ] **Step 1: 구현**
- [ ] **Step 2: 모바일 확인 (390×844, `?mock=1`)** — 기본이 격자 2열, 사진 누르면 주소 `#place/<id>`·상세(사진이 잘리지 않음, 힌트·확인 버튼이 스크롤 없이 보임), 뒤로 가기(`history.back()`)로 격자, ← 로 격자, 지도 탭에서 위치를 찍고 사진 탭 → 상세 → 확인 → "로그인이 필요해요" 안내(가짜 위치가 쓰였는지는 디버그 없이도 판정 요청 전까지 막히지 않는 것으로 본다), 없는 id `#place/nope`로 열면 격자 + 토스트, `#place/<실제 id>`로 바로 열면 상세(격자로 튕기지 않음), `#explore`는 격자, 콘솔 오류 없음.
- [ ] **Step 3: PC 확인 (1440×860)** — 지도가 왼쪽을 채우고 오른쪽 패널에 3열 격자, 사진 누르면 패널이 상세, 지도 별 클릭 → 상세, 아래 탭 없음, 상단 메뉴 [탐색] [등록]. 상세를 띄운 채 창을 390 폭으로 바꿨다가 다시 1440으로 → 주소 그대로, 지도에 회색 조각 없음.
- [ ] **Step 4: `node --test "tests/*.test.mjs"` 전부 pass**
- [ ] **Step 5: 커밋** — `feat: 사진 격자와 사진 상세를 중심으로 탐색 화면 다시 짜기`

### Task 3: 둥근 미니맵 `js/minimap.js`

**Files:**
- Create: `js/minimap.js`
- Modify: `js/explore.js`(미니맵 켜기, 상세가 보일 때 `refreshMinimap()`), `style.css`

**Interfaces:**
- Consumes: `geo.js` `onPosition`, `getPosition`; Task 2 `onPlacesChange`.
- Produces: `initMinimap(el: HTMLElement) -> void`, `refreshMinimap() -> void`(크기 다시 맞추고 내 위치로 가운데).
- 미니맵 클릭 → `location.hash = "#map"`. Leaflet 옵션: `dragging:false, touchZoom:false, scrollWheelZoom:false, doubleClickZoom:false, boxZoom:false, keyboard:false, zoomControl:false, attributionControl:false`(출처는 CSS 글씨로 따로).

- [ ] **Step 1: 구현**
- [ ] **Step 2: 확인 (390×844, `?mock=1`)** — 상세에 둥근 미니맵이 왼쪽, 확인 버튼 오른쪽. 지도 탭에서 위치를 찍고 상세로 오면 미니맵 가운데에 파란 점. 미니맵을 손으로 끌어도 안 움직임. 누르면 `#map`. 미니맵 근처에 "© OpenStreetMap". 1440 폭에서는 미니맵 안 보임. 1440 → 390으로 바꿨을 때 미니맵 회색 조각 없음. 콘솔 오류 없음.
- [ ] **Step 3: `node --test "tests/*.test.mjs"` 전부 pass**
- [ ] **Step 4: 커밋** — `feat: 사진 상세에 둥근 미니맵 추가`

### Task 4: 로그인 후 보던 화면으로 돌아오기, 문서

**Files:**
- Modify: `js/auth.js` — `signIn()` 직전 `sessionStorage.setItem("st_cache_return_hash", location.hash)`(try/catch). 로그인 상태를 처음 정한 뒤(onAuthStateChange의 setTimeout 안, setState 다음) 저장된 값을 꺼내 지우고, `restoreHash(saved, location.hash)`가 값을 주면 `location.hash`에 넣는다.
- Modify: `SPEC.md`("화면" 절의 공통 상단·① 탐색을 새 배치로, 파일 구조에 `routes.js`, `minimap.js`), `README.md`("노는 법" 1~4단계를 사진 탭 → 상세 → 확인으로, 지도 탭 언급)

**Interfaces:**
- Consumes: Task 1 `restoreHash`.

- [ ] **Step 1: 구현**
- [ ] **Step 2: 확인** — headless에서: `#place/<id>`에서 `sessionStorage`에 값을 넣고 빈 해시로 새로 열었을 때 상세로 돌아오는지(로그인 상태 결정 후). `node --test "tests/*.test.mjs"` 전부 pass. 실제 구글 로그인 왕복은 사용자가 확인.
- [ ] **Step 3: 커밋** — `feat: 로그인하고 돌아오면 보던 화면으로` 와 `docs: SPEC과 README를 사진 중심 배치에 맞게 고치기` (둘로 나눔)
