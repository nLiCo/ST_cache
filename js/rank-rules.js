// ③ 랭킹 / 내 정보 화면의 문구 규칙(점수 표기, 승인 상태, 등록한 장소 안내).
// 브라우저와 Node 테스트(node --test) 양쪽에서 불러야 해서 DOM도 다른 모듈도 import하지 않는다.

const STATUS_LABELS = { pending: "승인 대기", approved: "승인", rejected: "반려" };

// 점수는 늘 소수 한 자리로. 값이 없으면 0.0.
export function formatScore(n) {
  return Number(n ?? 0).toFixed(1);
}

// "42.5점 (찾기 30.5 · 등록 12.0)"
export function scoreBreakdown(row) {
  return `${formatScore(row.score)}점 (찾기 ${formatScore(row.find_score)} · 등록 ${formatScore(row.upload_score)})`;
}

// 랭킹 줄의 닉네임 아래: "찾기 6곳 · 등록 1곳". 0곳인 쪽은 뺀다.
export function placeCounts(row) {
  const parts = [];
  if (row.found_count) parts.push(`찾기 ${row.found_count}곳`);
  if (row.upload_count) parts.push(`등록 ${row.upload_count}곳`);
  return parts.join(" · ");
}

// 랭킹 줄의 총점 아래: "91.0 + 0.0" (찾기 점수 + 등록 점수)
export function scoreSum(row) {
  return `${formatScore(row.find_score)} + ${formatScore(row.upload_score)}`;
}

export function statusLabel(status) {
  return STATUS_LABELS[status] ?? "";
}

// 내가 등록한 장소 한 줄 안내. 승인된 장소만 말한다.
export function uploadedPlaceNote(place) {
  if (place.status !== "approved") return "";
  if (place.finder_count == null) return ""; // 마이그레이션 전에는 칸이 없다
  if (!place.finder_count) return "아직 찾은 사람이 없어요";
  return `${place.finder_count}명이 찾았어요 · +${formatScore(place.upload_score)}점`;
}
