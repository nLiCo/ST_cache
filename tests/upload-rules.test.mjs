// 장소 등록 판단 규칙 테스트. 실행: node --test tests/
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_UPLOAD_ACCURACY_M, positionStatus, photoTakenAt, isFreshPhoto,
  fitSize, photoPath, validateFields, placeRow, uploadNotice,
} from "../js/upload-rules.js";

test("사진 찍기 정확도 기준은 30m", () => assert.equal(MAX_UPLOAD_ACCURACY_M, 30));

test("positionStatus", () => {
  assert.equal(positionStatus(null, true), "none");
  assert.equal(positionStatus({ accuracy: 5 }, false), "none");
  assert.equal(positionStatus({ accuracy: 30 }, true), "ok");
  assert.equal(positionStatus({ accuracy: 30.1 }, true), "inaccurate");
});

test("photoTakenAt: EXIF 우선, 없거나 잘못되면 파일 시각", () => {
  assert.equal(photoTakenAt(new Date(1000), 5000), 1000);
  assert.equal(photoTakenAt(undefined, 5000), 5000);
  assert.equal(photoTakenAt(null, 5000), 5000);
  assert.equal(photoTakenAt(new Date("x"), 5000), 5000);
});

test("isFreshPhoto: 버튼 누르기 1분 전까지 허용", () => {
  const pinned = 1_000_000;
  assert.equal(isFreshPhoto(pinned - 60000, pinned), true);
  assert.equal(isFreshPhoto(pinned - 60001, pinned), false);
  assert.equal(isFreshPhoto(pinned + 30000, pinned), true);
});

test("fitSize: 긴 변 1280, 키우지 않음", () => {
  assert.deepEqual(fitSize(4000, 3000), { width: 1280, height: 960 });
  assert.deepEqual(fitSize(3000, 4000), { width: 960, height: 1280 });
  assert.deepEqual(fitSize(800, 600), { width: 800, height: 600 });
});

test("photoPath", () => assert.equal(photoPath("u1", "abc"), "u1/abc.jpg"));

test("validateFields", () => {
  assert.equal(validateFields({ name: "   ", hint: "", story: "" }), "이름을 적어 주세요.");
  assert.equal(validateFields({ name: " " + "가".repeat(30) + " ", hint: "", story: "" }), null);
  assert.equal(validateFields({ name: "가".repeat(31), hint: "", story: "" }), "이름은 30자까지 적을 수 있어요.");
  assert.equal(validateFields({ name: "a", hint: "가".repeat(101), story: "" }), "힌트는 100자까지 적을 수 있어요.");
  assert.equal(validateFields({ name: "a", hint: "", story: "가".repeat(501) }), "이야기는 500자까지 적을 수 있어요.");
});

test("placeRow: trim, 빈 칸은 null", () => {
  assert.deepEqual(
    placeRow({ name: " 돌계단 ", hint: "  ", story: " 옛 길 " }, { lat: 1, lng: 2, accuracy: 3, time: 9 }, "u/p.jpg"),
    { name: "돌계단", hint: null, story: "옛 길", photo_path: "u/p.jpg", lat: 1, lng: 2, accuracy: 3 });
});

test("uploadNotice", () => {
  assert.equal(uploadNotice("admin"), "등록했어요! 바로 공개됐어요.");
  assert.equal(uploadNotice("trusted"), "등록했어요! 바로 공개됐어요.");
  assert.equal(uploadNotice("user"), "등록했어요! 관리자가 승인하면 공개돼요.");
});
