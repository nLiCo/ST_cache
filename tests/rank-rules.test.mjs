// 랭킹 문구 규칙 테스트. 실행: node --test "tests/*.test.mjs"
import { test } from "node:test";
import assert from "node:assert/strict";
import { formatScore, scoreBreakdown, statusLabel, uploadedPlaceNote } from "../js/rank-rules.js";

test("formatScore", () => {
  assert.equal(formatScore(42.5), "42.5");
  assert.equal(formatScore(12), "12.0");
  assert.equal(formatScore(null), "0.0");
  assert.equal(formatScore(undefined), "0.0");
});

test("scoreBreakdown", () => {
  assert.equal(scoreBreakdown({ score: 42.5, find_score: 30.5, upload_score: 12 }), "42.5점 (찾기 30.5 · 등록 12.0)");
});

test("statusLabel", () => {
  assert.equal(statusLabel("pending"), "승인 대기");
  assert.equal(statusLabel("approved"), "승인");
  assert.equal(statusLabel("rejected"), "반려");
});

test("uploadedPlaceNote", () => {
  assert.equal(uploadedPlaceNote({ status: "approved", finder_count: 0, upload_score: 0 }), "아직 찾은 사람이 없어요");
  assert.equal(uploadedPlaceNote({ status: "approved", finder_count: 3, upload_score: 9.8 }), "3명이 찾았어요 · +9.8점");
  assert.equal(uploadedPlaceNote({ status: "approved", upload_score: 0 }), "");
  assert.equal(uploadedPlaceNote({ status: "approved", finder_count: null }), "");
  assert.equal(uploadedPlaceNote({ status: "pending", finder_count: 0, upload_score: 0 }), "");
});
