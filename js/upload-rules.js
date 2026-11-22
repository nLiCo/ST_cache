// ② 장소 등록 화면의 판단 규칙(위치 상태, 사진 시각, 크기, 입력 검사, 안내 문구).
// 브라우저와 Node 테스트(node --test) 양쪽에서 불러야 해서 DOM도 다른 모듈도 import하지 않는다.

export const MAX_UPLOAD_ACCURACY_M = 30;
const PHOTO_TIME_TOLERANCE_MS = 60000; // 같은 폰 시계로 비교하므로 1분 여유면 충분하다
const MAX_PHOTO_SIDE = 1280;

// 사진 찍기 버튼을 켜도 되는지. fresh는 geo.js의 hasFreshPosition() 결과.
export function positionStatus(pos, fresh) {
  if (!pos || !fresh) return "none";
  return pos.accuracy > MAX_UPLOAD_ACCURACY_M ? "inaccurate" : "ok";
}

// 사진을 찍은 시각(ms). EXIF 촬영 시각이 있으면 그것, 없으면 파일 시각.
export function photoTakenAt(exifDate, lastModified) {
  const t = exifDate instanceof Date ? exifDate.getTime() : NaN;
  return Number.isNaN(t) ? lastModified : t;
}

// 카메라 버튼을 누른 뒤에 찍힌 사진인지.
export function isFreshPhoto(takenAtMs, pinnedAtMs) {
  return takenAtMs >= pinnedAtMs - PHOTO_TIME_TOLERANCE_MS;
}

// 긴 변을 maxSide 이하로 줄인 크기. 작은 사진은 키우지 않는다.
export function fitSize(width, height, maxSide = MAX_PHOTO_SIDE) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

// 사진을 그림으로 연다. createBitmap은 브라우저의 createImageBitmap(테스트에서는 가짜).
// 사진 방향(EXIF Orientation)을 따르라는 옵션을 모르는 옛 브라우저는 오류를 내므로,
// 그때는 옵션 없이 다시 연다(요즘 규격은 옵션이 없어도 사진 방향을 따른다).
export async function decodePhoto(file, createBitmap) {
  try {
    return await createBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return createBitmap(file);
  }
}

// 버킷 안 사진 경로. 첫 폴더가 내 id여야 DB 트리거와 버킷 정책을 통과한다.
export function photoPath(userId, id) {
  return `${userId}/${id}.jpg`;
}

// 입력 칸 검사. 문제가 있으면 안내 문구, 없으면 null. 글자 수 제한은 DB와 같다.
export function validateFields({ name, hint, story }) {
  const n = name.trim();
  if (!n) return "이름을 적어 주세요.";
  if (n.length > 30) return "이름은 30자까지 적을 수 있어요.";
  if (hint.trim().length > 100) return "힌트는 100자까지 적을 수 있어요.";
  if (story.trim().length > 500) return "이야기는 500자까지 적을 수 있어요.";
  return null;
}

// places에 넣을 줄. 브라우저가 넣을 수 있는 칸만 담는다.
export function placeRow({ name, hint, story }, pinned, path) {
  return {
    name: name.trim(),
    hint: hint.trim() || null,
    story: story.trim() || null,
    photo_path: path,
    lat: pinned.lat,
    lng: pinned.lng,
    accuracy: pinned.accuracy,
  };
}

// 등록 실패 안내. err는 Supabase 오류({ status?, name?, code?, message }).
// 서버·네트워크 문제(Cloudflare 520 같은 5xx, HTML 본문, 연결 끊김)는 다시 누르면 되는 경우가 많다.
const NETWORK_ERROR = /failed to fetch|load failed|networkerror|<!doctype|<html|not valid json|unexpected token/i;

export function uploadErrorMessage(err) {
  const message = String(err?.message ?? "");
  if (message.includes("위치 정확도")) {
    return "위치 정확도가 나빠 등록하지 못했어요. 하늘이 보이는 곳에서 다시 찍어 주세요.";
  }
  if (Number(err?.status) >= 500 || err?.name === "StorageUnknownError" || NETWORK_ERROR.test(message)) {
    return "서버와 연결이 잠시 불안정해요. 잠시 후 다시 등록해 주세요.";
  }
  return `올리지 못했어요 (${message})`;
}

// 등록 후 안내. 신뢰·관리자 계정은 DB 트리거가 바로 승인한다.
export function uploadNotice(role) {
  return role === "trusted" || role === "admin"
    ? "등록했어요! 바로 공개됐어요."
    : "등록했어요! 관리자가 승인하면 공개돼요.";
}
