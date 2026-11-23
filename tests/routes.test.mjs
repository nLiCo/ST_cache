// 화면 주소 해석 테스트. 실행: node --test "tests/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRoute, placeHash, restoreHash } from "../js/routes.js";

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
