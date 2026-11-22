// ② 장소 등록 화면. 현장에서 사진을 찍어 장소를 올린다.
// 좌표는 "사진 찍기" 버튼을 누르는 순간의 위치로 고정하고, 그 뒤에 찍힌 사진만 받는다.
// 판단 규칙은 upload-rules.js에 있다. DB 트리거가 등급·정확도·사진 경로를 다시 검사한다.
import { parse as parseExif } from "https://cdn.jsdelivr.net/npm/exifr@7.1.3/dist/lite.esm.mjs";
import { supabase } from "./supabase.js";
import { getAuth, onAuthChange, signIn, openNicknameDialog } from "./auth.js";
import { getPosition, hasFreshPosition, onPosition, MOCK } from "./geo.js";
import { reloadPlaces } from "./explore.js";
import { showToast } from "./ui.js";
import {
  positionStatus, photoTakenAt, isFreshPhoto, fitSize, decodePhoto, photoPath,
  validateFields, placeRow, uploadNotice, uploadErrorMessage,
} from "./upload-rules.js";

const JPEG_QUALITY = 0.85;

const $ = (id) => document.getElementById(id);
const section = $("upload");
const gate = $("upload-gate");
const form = $("upload-form");
const cameraButton = $("upload-camera");
const fileInput = $("upload-file");
const submitButton = $("upload-submit");
const fields = { name: $("upload-name"), hint: $("upload-hint"), story: $("upload-story") };

let pendingPin = null; // 카메라를 연 순간의 위치. 사진이 통과하면 pinned가 된다
let pinned = null;     // { lat, lng, accuracy, time }
let photo = null;      // 찍은 사진 File
let previewUrl = null;
let busy = false;
let lastUserId;        // 계정이 바뀌면 입력을 비우려고 기억한다

export function initUpload() {
  onPosition(renderPosition);
  setInterval(renderPosition, 5000); // 위치 갱신이 멈춰 30초가 지나 낡는 경우도 잡는다
  cameraButton.addEventListener("click", openCamera);
  fileInput.addEventListener("change", onPhoto);
  form.addEventListener("submit", onSubmit);
  form.addEventListener("input", renderCounts);
  gate.addEventListener("click", (e) => {
    if (e.target.closest('[data-action="login"]')) signIn();
    if (e.target.closest('[data-action="nickname"]')) openNicknameDialog();
  });
  onAuthChange(onAuth);
  renderCounts();
  renderPosition();
}

export function setUploadVisible(visible) {
  section.hidden = !visible;
  if (visible) renderPosition();
}

// ---------- 로그인 상태 ----------

function onAuth({ user, profile }) {
  const userId = user?.id ?? null;
  if (userId !== lastUserId) {
    lastUserId = userId;
    resetForm();
  }
  if (!user) {
    gate.innerHTML = '<p>장소를 올리려면 로그인이 필요해요.</p><button type="button" class="primary" data-action="login">구글로 로그인</button>';
  } else if (!profile?.nickname) {
    gate.innerHTML = '<p>닉네임을 먼저 정해 주세요.</p><button type="button" class="primary" data-action="nickname">닉네임 정하기</button>';
  } else {
    gate.replaceChildren();
  }
  form.hidden = !user || !profile?.nickname;
}

// ---------- 위치와 사진 찍기 ----------

function renderPosition() {
  const pos = getPosition();
  const status = positionStatus(pos, hasFreshPosition());
  $("upload-accuracy").textContent = status === "none"
    ? (MOCK ? "탐색 지도에서 먼저 위치를 찍어 주세요" : "위치를 확인하는 중이에요")
    : `현재 위치 정확도: ±${Math.round(pos.accuracy)}m`;
  $("upload-wait").hidden = status !== "inaccurate";
  cameraButton.disabled = busy || status !== "ok";
}

function openCamera() {
  const pos = getPosition();
  if (positionStatus(pos, hasFreshPosition()) !== "ok") return;
  // 가짜 위치도 시각은 지금으로 둔다. 사진 시각과 비교하는 기준이기 때문이다.
  pendingPin = { lat: pos.lat, lng: pos.lng, accuracy: pos.accuracy, time: Date.now() };
  fileInput.value = "";
  fileInput.click();
}

async function onPhoto() {
  const file = fileInput.files[0];
  if (!file || !pendingPin) return; // 카메라를 취소하면 이전 사진과 위치를 그대로 둔다
  // exifr 경량판은 parse(file, ["태그"])처럼 배열로 부르면 오류가 나서 옵션 없이 부른다.
  const exif = await parseExif(file).catch(() => undefined);
  if (!isFreshPhoto(photoTakenAt(exif?.DateTimeOriginal, file.lastModified), pendingPin.time)) {
    clearPhoto();
    showError("방금 찍은 사진만 올릴 수 있어요. 다시 찍어 주세요.");
    return;
  }
  photo = file;
  pinned = pendingPin;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = URL.createObjectURL(file);
  $("upload-preview").src = previewUrl;
  $("upload-pinned").textContent = `위치 고정됨 ±${Math.round(pinned.accuracy)}m`;
  $("upload-photo").hidden = false;
  showError("");
  renderSubmit();
}

function clearPhoto() {
  photo = null;
  pinned = null;
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  $("upload-preview").removeAttribute("src");
  $("upload-photo").hidden = true;
  renderSubmit();
}

// ---------- 입력 칸 ----------

function renderCounts() {
  for (const el of form.querySelectorAll(".count")) {
    el.textContent = `${$(el.dataset.for).value.length}/${el.dataset.max}`;
  }
}

function renderSubmit() {
  submitButton.disabled = busy || !photo || !pinned;
}

function showError(message) {
  $("upload-error").textContent = message;
}

function resetForm() {
  pendingPin = null;
  clearPhoto();
  for (const el of Object.values(fields)) el.value = "";
  renderCounts();
  showError("");
}

// ---------- 등록 ----------

// 긴 변 1280px 이하로 줄여 JPEG로 다시 저장한다. 새로 그린 그림이라 EXIF(위치 포함)가 남지 않는다.
async function shrink(file) {
  const bitmap = await decodePhoto(file, (f, opts) => createImageBitmap(f, opts));
  const { width, height } = fitSize(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => (blob ? resolve(blob) : reject(new Error("사진을 줄이지 못했어요"))),
    "image/jpeg", JPEG_QUALITY));
}

async function onSubmit(e) {
  e.preventDefault();
  if (busy || !photo || !pinned) return;
  const values = { name: fields.name.value, hint: fields.hint.value, story: fields.story.value };
  const invalid = validateFields(values);
  if (invalid) {
    showError(invalid);
    return;
  }

  busy = true;
  submitButton.textContent = "올리는 중…";
  renderSubmit();
  renderPosition();
  // 올리는 동안 다른 탭에서 계정이 바뀌면 resetForm이 모듈 변수를 비우므로 값을 미리 떼어 둔다.
  const { user, profile } = getAuth();
  const file = photo;
  const pin = pinned;
  try {
    const blob = await shrink(file);
    const path = photoPath(user.id, crypto.randomUUID());
    const upload = await supabase.storage.from("photos").upload(path, blob, { contentType: "image/jpeg" });
    if (upload.error) throw upload.error;
    // .select()를 붙이지 않는다. places를 읽을 권한이 없어서 붙이면 실패한다.
    const insert = await supabase.from("places").insert(placeRow(values, pin, path));
    // insert 오류에는 HTTP 상태가 없어서(응답 쪽에만 있음) 붙여서 던진다.
    if (insert.error) throw { ...insert.error, status: insert.status };
    showToast(uploadNotice(profile.role));
    resetForm();
    reloadPlaces();
  } catch (err) {
    showError(uploadErrorMessage(err));
  } finally {
    busy = false;
    submitButton.textContent = "등록하기";
    renderSubmit();
    renderPosition();
  }
}
