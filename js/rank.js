// ③ 랭킹 / 내 정보 화면. 랭킹은 로그인 없이 보고, 로그인하면 내 순위·찾은 장소·올린 장소도 보인다.
// 문구 규칙은 rank-rules.js에 있다. 화면에 들어올 때마다 leaderboard(와 my_places)를 다시 읽는다.
import { supabase, photoUrl } from "./supabase.js";
import { getAuth, onAuthChange, signIn, openNicknameDialog } from "./auth.js";
import { onPlacesChange } from "./explore.js";
import { placeHash } from "./routes.js";
import { escapeHtml } from "./ui.js";
import { formatScore, scoreBreakdown, statusLabel, uploadedPlaceNote } from "./rank-rules.js";

const section = document.getElementById("rank");

let visible = false;
let places = [];          // public_places 행(내가 찾은 장소를 거르려고)
let board = undefined;    // undefined: 읽는 중 / null: 실패 / 배열: leaderboard 행
let mine = undefined;     // my_places도 같은 규칙
let boardRequest = 0;     // 늦게 온 응답이 새 응답을 덮어쓰지 않게 하는 번호
let mineRequest = 0;
let savedScroll = 0;      // 숨기기 전 스크롤 위치
let restoring = false;    // 다시 보일 때 데이터가 그려지면 스크롤을 되돌린다

export function initRank() {
  section.addEventListener("click", onClick);
  onPlacesChange((list) => {
    places = list;
    if (visible) render();
  });
  onAuthChange(() => {
    // 다른 계정의 데이터가 잠깐이라도 보이지 않게 로그인 데이터를 비운다.
    board = undefined;
    mine = undefined;
    if (visible) reload();
  });
}

export function setRankVisible(next) {
  if (visible && !next) savedScroll = section.scrollTop; // hidden이 되면 0으로 잘리므로 먼저 기억
  section.hidden = !next;
  visible = next;
  if (next) {
    restoring = true;
    reload();
  }
}

function reload() {
  loadBoard();
  loadMine();
  render();
}

async function loadBoard() {
  const request = ++boardRequest;
  if (board === null) board = undefined; // 실패 뒤 다시 시도: 불러오는 중으로. 이전 목록이 있으면 그대로 둔다
  const { data, error } = await supabase.from("leaderboard").select("*").order("rank").order("nickname");
  if (request !== boardRequest) return;
  board = error ? null : data;
  restoring = false;
  render();
}

async function loadMine() {
  const request = ++mineRequest;
  if (!getAuth().user) { mine = undefined; return; }
  if (mine === null) mine = undefined;
  const { data, error } = await supabase.from("my_places").select("*").order("created_at", { ascending: false });
  if (request !== mineRequest) return;
  mine = error ? null : data;
  render();
}

function onClick(e) {
  const action = e.target.closest("[data-action]")?.dataset.action;
  if (action === "login") signIn();
  else if (action === "nickname") openNicknameDialog();
  else if (action === "retry-board") { loadBoard(); render(); }
  else if (action === "retry-mine") { loadMine(); render(); }
}

// ---------- 그리기 ----------

function render() {
  if (!visible) return;
  const auth = getAuth();
  const parts = ["<h2>랭킹</h2>", renderMe(auth), renderBoard()];
  if (auth.user) parts.push(renderFound(), renderUploaded());
  section.innerHTML = parts.join("");
  if (restoring && board !== undefined) section.scrollTop = savedScroll;
}

function failure(message, action) {
  return `<div class="rank-fail"><p>${message}</p><button type="button" data-action="${action}">다시 시도</button></div>`;
}

// 마이그레이션 전에는 find_score·upload_score 칸이 없다. 없으면 0.0으로 꾸미지 않고 내역을 뺀다.
const hasBreakdown = (row) => row.find_score != null && row.upload_score != null;

function renderMe({ ready, user, profile }) {
  if (!ready) return "";
  if (!user) {
    return '<div class="rank-me"><p>로그인하면 내 순위가 보여요</p><button type="button" class="primary" data-action="login">구글로 로그인</button></div>';
  }
  if (!profile?.nickname) {
    return '<div class="rank-me"><p>닉네임을 정하면 랭킹에 나와요</p><button type="button" class="primary" data-action="nickname">닉네임 정하기</button></div>';
  }
  if (profile.role === "admin") {
    return '<div class="rank-me"><p>관리자 계정은 랭킹에 나오지 않아요</p></div>';
  }
  const row = Array.isArray(board) ? board.find((r) => r.is_me) : null;
  if (!row) return "";
  return `<div class="rank-me"><p><strong>${escapeHtml(row.rank)}위</strong> · ${escapeHtml(hasBreakdown(row) ? scoreBreakdown(row) : `${formatScore(row.score)}점`)} · 찾은 장소 ${escapeHtml(row.found_count ?? 0)}곳</p></div>`;
}

function renderBoard() {
  if (board === undefined) return '<p class="rank-note">불러오는 중이에요</p>';
  if (board === null) return failure("랭킹을 불러오지 못했어요", "retry-board");
  if (board.length === 0) return '<p class="rank-note">아직 랭킹에 오른 사람이 없어요</p>';
  const rows = board.map((r) => `
    <li class="rank-row${r.is_me ? " me" : ""}">
      <span class="pos">${escapeHtml(r.rank)}</span>
      <span class="who">
        <span class="nick">${escapeHtml(r.nickname)}</span>
        ${hasBreakdown(r) ? `<small>찾기 ${formatScore(r.find_score)} · 등록 ${formatScore(r.upload_score)}</small>` : ""}
      </span>
      <span class="pts">${formatScore(r.score)}점<small>${escapeHtml(r.found_count ?? 0)}곳</small></span>
    </li>`).join("");
  return `<ol class="rank-list">${rows}</ol>`;
}

function thumb(path) {
  return `<img src="${escapeHtml(photoUrl(path))}" alt="" loading="lazy">`;
}

function renderFound() {
  const found = places.filter((p) => p.found && !p.mine);
  const body = found.length === 0
    ? '<p class="rank-note">아직 찾은 장소가 없어요</p>'
    : `<div class="rank-places">${found.map((p) => `
        <a class="rank-place" href="${escapeHtml(placeHash(p.id))}">${thumb(p.photo_path)}<span>${escapeHtml(p.name)}</span></a>`).join("")}</div>`;
  return `<h3>내가 찾은 장소</h3>${body}`;
}

function renderUploaded() {
  let body;
  if (mine === undefined) body = '<p class="rank-note">불러오는 중이에요</p>';
  else if (mine === null) body = failure("올린 장소를 불러오지 못했어요", "retry-mine");
  else if (mine.length === 0) body = '<p class="rank-note">아직 올린 장소가 없어요 <a href="#upload">장소 올리러 가기</a></p>';
  else {
    body = `<div class="rank-places">${mine.map((p) => {
      const note = uploadedPlaceNote(p);
      const inner = `${thumb(p.photo_path)}<span>${escapeHtml(p.name)}</span>`
        + `<em class="${escapeHtml(p.status)}">${escapeHtml(statusLabel(p.status))}</em>`
        + (note ? `<small>${escapeHtml(note)}</small>` : "");
      return p.status === "approved"
        ? `<a class="rank-place" href="${escapeHtml(placeHash(p.id))}">${inner}</a>`
        : `<div class="rank-place">${inner}</div>`;
    }).join("")}</div>`;
  }
  return `<h3>내가 올린 장소</h3>${body}`;
}
