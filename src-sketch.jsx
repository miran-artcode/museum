/* ============================================================
   디지털 에스키스 (4차시 「에스키스와 화면 설계」 s4c.sketchpad)
   ------------------------------------------------------------
   미술 전공 학생이 종이 대신 쓸 수 있게 만든 그리기 도구.
   · 도구: 연필·펜·붓펜·마커·목탄·에어브러시·지우개, 도형(직선·화살표·사각형·타원), 글자, 스포이트, 화면 이동
   · 필압(애플 펜슬·S펜·와콤)을 굵기·농도에 반영하고, 마우스·손가락은 붓펜만 속도로 굵기를 흉내 낸다.
     손떨림 보정, Shift 직선, Alt 스포이트, 펜 뒤쪽 지우개(와콤·서피스)
   · 색: 팔레트 20색 + 색 고르기 + 최근 색, 도구별 굵기·불투명도 기억
   · 화면: 확대·축소(버튼·Ctrl+휠·두 손가락), 이동(스페이스·휠 버튼·두 손가락), 회전, 좌우 반전 보기,
     안내선(격자·삼분할·세 칸), 종이 색, 크게 그리기(화면 가득)
   · 레이어 4장, 되돌리기 40단계, 사진을 레이어로 불러와 따라 그리기
   · 저장: 합친 그림 한 장(ref, 교사 화면·집계가 읽는 값) + 레이어별 PNG(layers[].ref). 다시 열면 레이어째 이어 그린다.
     media 규칙이 dataURL 1,000,000자 미만이라 합친 그림은 PNG → JPEG 품질 단계 → 축소 순으로 맞춘다.
   · 저장하지 않은 그림은 sessionStorage 초안으로 둔다. 차시 탭을 옮기거나 새로 고쳐도 이어진다.
     (탭을 닫으면 사라지므로 beforeunload 경고는 sketchDirty.unsaved로 그대로 띄운다.)
   값 모양: { ref, at, w, h, paper, layers: [{ ref, name, op, vis }] }. ref만 있는 옛 값(720×480 JPEG)도 읽는다.
   collectMediaRefs(src-app.jsx)가 layers[].ref까지 모으므로 학번 변경·기록 초기화 때 레이어 문서도 함께 옮겨지고 지워진다.

   그리기 엔진: 레이어마다 캔버스 하나 + 되돌리기 한도 밖으로 밀려난 작업을 굳힌 base.
   작업(획·도형·글자·사진·지우기)은 벡터로 기록하고, 되돌리기는 base 위에 남은 작업을 다시 그린다.
   획은 늘 scratch 캔버스에 불투명하게 그린 뒤 획 불투명도로 레이어에 합성한다. 실시간 미리보기와
   다시 그리기가 같은 경로를 타므로 되돌린 뒤 다시 실행해도 픽셀이 같다. 연필·목탄의 결은 캔버스 좌표에
   고정된 종이 결 무늬(같은 씨앗)로 가리므로 난수 없이도 다시 그릴 때 똑같다.
   ============================================================ */
import React, { useState, useEffect, useRef, useContext } from "react";
import { WsLockCtx } from "./src-ws-lock.jsx";

/* 저장하지 않은 스케치 상태 — src-app.jsx의 차시 이동 확인(current)과 창 닫기 경고(unsaved)가 읽는다.
   current: 지금 화면을 떠나면 획이 사라지는가(초안 보관에 실패했을 때만 true)
   unsaved: 서버에 저장하지 않은 변경이 있는가 */
export const sketchDirty = { current: false, unsaved: false };

const LIMIT = 950000;          // media 규칙: dataURL 글자 수 < 1,000,000
const MAX_LAYERS = 4;
const HISTORY_MAX = 40;
const DRAFT_PREFIX = "museum:sketch:";
const PREFS_KEY = "museum:sketchPrefs";

const RATIOS = [
  { k: "wide", name: "가로", W: 1500, H: 1000 },
  { k: "tall", name: "세로", W: 1000, H: 1500 },
  { k: "square", name: "정사각", W: 1250, H: 1250 },
];
const PAPERS = [
  { k: "white", name: "흰색", c: "#FFFFFF" },
  { k: "cream", name: "미색", c: "#F4EEDF" },
  { k: "gray", name: "회색", c: "#BDBAB3" },
  { k: "kraft", name: "크라프트", c: "#C4A37A" },
  { k: "black", name: "검정", c: "#232323" },
];
const paperColor = (k) => (PAPERS.find((p) => p.k === k) || PAPERS[0]).c;

const PALETTE = [
  ["#111111", "검정"], ["#444444", "진회색"], ["#777777", "회색"], ["#AAAAAA", "밝은 회색"], ["#DDDDDD", "연회색"], ["#FFFFFF", "흰색"],
  ["#5B3A29", "세피아"], ["#8A3B2E", "번트 시에나"], ["#B5462F", "상긴"], ["#C8963E", "옐로 오커"], ["#6B6B2E", "올리브"], ["#2E3A5C", "인디고"],
  ["#D63A2F", "빨강"], ["#EE7F2D", "주황"], ["#F2C12E", "노랑"], ["#3A8C4A", "초록"], ["#1F8A8A", "청록"], ["#2F62B5", "파랑"],
  ["#6F4AA0", "보라"], ["#E2789A", "분홍"],
];

/* 도구 표. eng: 그리는 방식(path 선, grain 결 있는 선, soft 부드러운 분사), minW: 필압 0일 때 굵기 비율 */
const TOOLS = [
  { k: "pencil", name: "연필", key: "1", eng: "grain", tex: "fine", min: 1, max: 40, size: 4, op: 0.9, minW: 0.6, dens: [0.2, 0.8], press: true },
  { k: "pen", name: "펜", key: "2", eng: "path", min: 1, max: 40, size: 3, op: 1, minW: 0.35, dash: true, press: true },
  { k: "brush", name: "붓펜", key: "3", eng: "path", min: 2, max: 80, size: 14, op: 1, minW: 0.12, taper: true, speed: true, press: true },
  { k: "marker", name: "마커", key: "4", eng: "path", min: 4, max: 120, size: 26, op: 0.45, minW: 1 },
  { k: "charcoal", name: "목탄", key: "5", eng: "grain", tex: "coarse", min: 4, max: 160, size: 24, op: 0.9, minW: 0.55, dens: [0.15, 0.7], press: true },
  { k: "air", name: "에어브러시", key: "6", eng: "soft", min: 10, max: 400, size: 90, op: 0.4, flow: 0.08, press: true },
  { k: "eraser", name: "지우개", key: "e", eng: "path", min: 2, max: 400, size: 36, op: 1, minW: 0.6, erase: true, press: true },
  { k: "shape", name: "도형", key: "u", min: 1, max: 40, size: 4, op: 1, dash: true },
  { k: "text", name: "글자", key: "t", min: 16, max: 200, size: 44, op: 1 },
  { k: "picker", name: "스포이트", key: "i" },
  { k: "hand", name: "이동", key: "h" },
];
const TOOL = Object.fromEntries(TOOLS.map((t) => [t.k, t]));
const SHAPES = [["line", "직선"], ["arrow", "화살표"], ["rect", "사각형"], ["ellipse", "타원"]];
const DASHES = [["solid", "실선"], ["dash", "파선"], ["dot", "점선"]];
const GUIDES = [["none", "없음"], ["grid", "격자"], ["thirds", "삼분할"], ["three", "세 칸"]];

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const pcurve = (p) => Math.pow(clamp(p, 0.02, 1), 0.75);
const smooth01 = (t) => t * t * (3 - 2 * t);
const mkCanvas = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
const hexRgb = (h) => { const n = parseInt(String(h).slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgbHex = (r, g, b) => "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
const TEXT_FONT = (size) => `500 ${size}px 'Noto Sans KR','IBM Plex Sans KR',sans-serif`;

function dashArr(dash, w) {
  if (dash === "dash") return [w * 4 + 8, w * 2.5 + 7];
  if (dash === "dot") return [0.1, w * 2 + 6];
  return [];
}

function loadImg(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error("image"));
    im.src = src;
  });
}

/* ---------- 종이 결 (연필·목탄) ---------- */

const GN = 256;
const grainCache = {};
/* 흐린 잡음의 순위(0~1). 문턱값이 곧 칠해지는 픽셀 비율이라 필압이 농도가 된다 */
function grainRank(tex) {
  if (grainCache[tex]) return grainCache[tex];
  let s = tex === "fine" ? 0x2545f491 : 0x9e3779b9;
  const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
  const raw = new Float32Array(GN * GN);
  for (let i = 0; i < raw.length; i++) raw[i] = rnd();
  const blur = (src, r, horiz) => {
    const out = new Float32Array(GN * GN);
    for (let y = 0; y < GN; y++) for (let x = 0; x < GN; x++) {
      let sum = 0;
      for (let k = -r; k <= r; k++) sum += horiz ? src[y * GN + ((x + k + GN) % GN)] : src[((y + k + GN) % GN) * GN + x];
      out[y * GN + x] = sum / (2 * r + 1);
    }
    return out;
  };
  const r = tex === "fine" ? 1 : 2;
  let b = blur(blur(raw, r, true), r, false);
  if (tex !== "fine") b = blur(blur(b, 1, true), 1, false);
  const mix = tex === "fine" ? 0.35 : 0.15;
  const val = new Float32Array(GN * GN);
  for (let i = 0; i < val.length; i++) val[i] = b[i] * (1 - mix) + raw[i] * mix;
  const idx = Array.from({ length: GN * GN }, (_, i) => i).sort((a, c) => val[a] - val[c]);
  const rank = new Float32Array(GN * GN);
  idx.forEach((k, i) => { rank[k] = i / idx.length; });
  return (grainCache[tex] = rank);
}

/* ---------- 획 그리기 ---------- */

/* pts: [x, y, 필압, x, y, 필압, ...]. final이면 끝까지 다 그리고(꼬리·끝 가늘어짐 포함) 다시 그리기와 같은 결과 */
function makeRenderer(eng, op, final) {
  const T = TOOL[op.tool];
  const ctx = eng.sctx;
  const pts = op.pts;
  const X = (k) => pts[3 * k], Y = (k) => pts[3 * k + 1], P = (k) => pts[3 * k + 2];
  const dist = [0];
  const Ls = op.size * 2.5;
  const spacing = Math.max(1, op.size * 0.06);
  let done = 0, dashOff = 0, next = 0, total = 0;
  const dashed = T.dash && op.dash && op.dash !== "solid";

  const wAt = (k) => {
    let w = op.size * (T.minW + (1 - T.minW) * pcurve(P(k)));
    if (T.taper) {
      w *= 0.2 + 0.8 * smooth01(Math.min(1, dist[k] / Ls));
      if (final) w *= 0.2 + 0.8 * smooth01(Math.min(1, (total - dist[k]) / Ls));
    }
    return Math.max(0.4, w);
  };
  const dens = (p) => T.dens[0] + (T.dens[1] - T.dens[0]) * pcurve(p);
  const dab = (x, y, p) => {
    const r = (op.size / 2) * (0.35 + 0.65 * pcurve(p));
    ctx.globalAlpha = Math.min(1, T.flow * (0.3 + 0.7 * pcurve(p)));
    ctx.drawImage(eng.sprite(op.color), x - r, y - r, r * 2, r * 2);
  };
  const dot = (k) => {
    const w = wAt(k);
    if (T.eng === "soft") return dab(X(k), Y(k), P(k));
    const path = (c) => { c.beginPath(); c.arc(X(k), Y(k), w / 2, 0, Math.PI * 2); c.fill(); };
    if (T.eng === "grain") eng.grainPaint(path, X(k), Y(k), X(k), Y(k), w, dens(P(k)), T.tex, op.color);
    else path(ctx);
  };
  const quad = (ax, ay, cx, cy, bx, by, w, p) => {
    if (T.eng === "grain") {
      const path = (c) => { c.beginPath(); c.moveTo(ax, ay); c.quadraticCurveTo(cx, cy, bx, by); c.stroke(); };
      eng.grainPaint(path, Math.min(ax, cx, bx), Math.min(ay, cy, by), Math.max(ax, cx, bx), Math.max(ay, cy, by), w, dens(p), T.tex, op.color);
      return;
    }
    ctx.lineWidth = w;
    if (dashed) {
      ctx.lineDashOffset = dashOff;
      dashOff += (Math.hypot(cx - ax, cy - ay) + Math.hypot(bx - cx, by - cy) + Math.hypot(bx - ax, by - ay)) / 2;
    }
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(cx, cy, bx, by); ctx.stroke();
  };
  const softSeg = (i) => {
    const ax = X(i - 1), ay = Y(i - 1), len = dist[i] - dist[i - 1];
    if (len <= 0) return;
    while (next <= len) {
      const t = next / len;
      dab(ax + (X(i) - ax) * t, ay + (Y(i) - ay) * t, P(i - 1) + (P(i) - P(i - 1)) * t);
      next += spacing;
    }
    next -= len;
  };

  function add() {
    const n = pts.length / 3;
    for (let k = dist.length; k < n; k++) dist.push(dist[k - 1] + Math.hypot(X(k) - X(k - 1), Y(k) - Y(k - 1)));
    total = dist[n - 1] || 0;
    ctx.save();
    ctx.strokeStyle = op.color; ctx.fillStyle = op.color;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (dashed) ctx.setLineDash(dashArr(op.dash, op.size));
    if (done === 0 && n >= 1) {
      // 실시간에는 누르자마자 점을 보이고, 최종 그리기에서는 점 하나짜리 획만 점으로 그린다
      if (!final || n === 1) { dot(0); if (T.eng === "soft") next = spacing; }
      done = 1;
    }
    for (let i = done; i < n; i++) {
      if (T.eng === "soft") { softSeg(i); continue; }
      const ax = i === 1 ? X(0) : (X(i - 2) + X(i - 1)) / 2, ay = i === 1 ? Y(0) : (Y(i - 2) + Y(i - 1)) / 2;
      quad(ax, ay, X(i - 1), Y(i - 1), (X(i - 1) + X(i)) / 2, (Y(i - 1) + Y(i)) / 2, (wAt(i - 1) + wAt(i)) / 2, (P(i - 1) + P(i)) / 2);
    }
    if (final && n >= 2 && T.eng !== "soft") {
      const k = n - 1, mx = (X(k - 1) + X(k)) / 2, my = (Y(k - 1) + Y(k)) / 2;
      quad(mx, my, (mx + X(k)) / 2, (my + Y(k)) / 2, X(k), Y(k), wAt(k), P(k));
    }
    ctx.restore();
    done = Math.max(done, n);
  }
  return { add };
}

function drawShape(ctx, op) {
  const { x0, y0, x1, y1 } = op;
  ctx.save();
  ctx.strokeStyle = op.color; ctx.fillStyle = op.color;
  ctx.lineWidth = op.size; ctx.lineCap = "round";
  ctx.lineJoin = op.shape === "rect" ? "miter" : "round";
  if (op.dash && op.dash !== "solid") ctx.setLineDash(dashArr(op.dash, op.size));
  if (op.shape === "line" || op.shape === "arrow") {
    let ex = x1, ey = y1;
    const L = Math.hypot(x1 - x0, y1 - y0) || 1, ux = (x1 - x0) / L, uy = (y1 - y0) / L;
    const hl = Math.min(L * 0.6, Math.max(16, op.size * 4)), hw = hl * 0.5;
    if (op.shape === "arrow") { ex = x1 - ux * hl * 0.8; ey = y1 - uy * hl * 0.8; }
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(ex, ey); ctx.stroke();
    if (op.shape === "arrow") {
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1 - ux * hl - uy * hw, y1 - uy * hl + ux * hw);
      ctx.lineTo(x1 - ux * hl + uy * hw, y1 - uy * hl - ux * hw);
      ctx.closePath(); ctx.fill();
    }
  } else if (op.shape === "rect") {
    const x = Math.min(x0, x1), y = Math.min(y0, y1), w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
    if (op.fill) ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
  } else {
    ctx.beginPath();
    ctx.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, 0, 0, Math.PI * 2);
    if (op.fill) ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawText(ctx, op) {
  ctx.save();
  ctx.font = TEXT_FONT(op.size);
  ctx.fillStyle = op.color;
  ctx.textBaseline = "top";
  String(op.text).split("\n").forEach((line, i) => ctx.fillText(line, op.x, op.y + i * op.size * 1.3));
  ctx.restore();
}

/* ---------- 엔진: 레이어·되돌리기·합성 ---------- */

class Engine {
  constructor() {
    this.W = 1500; this.H = 1000;
    this.layers = []; this.activeId = 0; this.hist = []; this.redo = [];
    this.seq = 1; this.nameSeq = 0;
    this.host = null; this.live = null;
    this.scratch = mkCanvas(this.W, this.H);
    this.scratch.className = "skx-scratch";
    this.sctx = this.scratch.getContext("2d");
    this.tmp = null; this.tctx = null; this.pat = {}; this.snap = null;
    this.spr = null; this.sprC = "";
    this.pickCv = null;
  }
  attach(host) { this.host = host; this.mount(); }
  /* host 안의 캔버스 순서를 레이어 순서(아래 → 위)에 맞추고, 활성 레이어 바로 위에 scratch를 둔다 */
  mount() {
    const h = this.host;
    if (!h) return;
    const want = [];
    for (const L of this.layers) { want.push(L.cv); if (L.id === this.activeId) want.push(this.scratch); }
    [...h.children].forEach((c) => { if (!want.includes(c)) h.removeChild(c); });
    want.forEach((c, i) => { if (h.children[i] !== c) h.insertBefore(c, h.children[i] || null); });
    for (const L of this.layers) { L.cv.style.opacity = String(L.op); L.cv.style.display = L.vis ? "" : "none"; }
    const A = this.active();
    this.scratch.style.display = A && A.vis ? "" : "none";
  }
  active() { return this.layers.find((L) => L.id === this.activeId) || this.layers[this.layers.length - 1]; }
  layer(id) { return this.layers.find((L) => L.id === id); }
  makeLayer(name) {
    const cv = mkCanvas(this.W, this.H);
    if (!name) name = "레이어 " + ++this.nameSeq;
    else { const m = /^레이어 (\d+)$/.exec(name); if (m) this.nameSeq = Math.max(this.nameSeq, +m[1]); }
    return { id: this.seq++, name, op: 1, vis: true, cv, ctx: cv.getContext("2d"), base: null, ver: 0 };
  }
  setSize(W, H) {
    this.W = W; this.H = H;
    this.scratch.width = W; this.scratch.height = H;
    this.tmp = null; this.tctx = null; this.pat = {}; this.snap = null;
  }
  /* list: [{ name, op, vis, img }] (없으면 빈 레이어 하나) */
  reset(W, H, list, activeIdx) {
    this.live = null;
    this.setSize(W, H);
    this.layers = []; this.hist = []; this.redo = []; this.nameSeq = 0;
    (list && list.length ? list : [{}]).slice(0, MAX_LAYERS).forEach((src) => {
      const L = this.makeLayer(src.name);
      L.op = typeof src.op === "number" ? clamp(src.op, 0, 1) : 1;
      L.vis = src.vis !== false;
      if (src.img) {
        L.base = mkCanvas(W, H);
        L.base.getContext("2d").drawImage(src.img, 0, 0, W, H);
        L.ctx.drawImage(L.base, 0, 0);
      }
      this.layers.push(L);
    });
    const i = activeIdx != null && activeIdx >= 0 && activeIdx < this.layers.length ? activeIdx : this.layers.length - 1;
    this.activeId = this.layers[i].id;
    this.mount();
  }
  /* 비율 바꾸기: 지금 그림을 새 캔버스에 맞춰 줄이고 가운데에 둔다. 되돌리기 기록은 비운다 */
  resizeKeep(W2, H2) {
    const olds = this.layers.map((L) => { const c = mkCanvas(this.W, this.H); c.getContext("2d").drawImage(L.cv, 0, 0); return c; });
    const s = Math.min(W2 / this.W, H2 / this.H), dw = this.W * s, dh = this.H * s, dx = (W2 - dw) / 2, dy = (H2 - dh) / 2;
    this.live = null;
    this.setSize(W2, H2);
    this.hist = []; this.redo = [];
    this.layers.forEach((L, i) => {
      L.cv.width = W2; L.cv.height = H2;
      L.base = mkCanvas(W2, H2);
      L.base.getContext("2d").drawImage(olds[i], dx, dy, dw, dh);
      this.replay(L);
    });
    this.mount();
  }
  addLayer(name, index) {
    const L = this.makeLayer(name);
    let i = index != null ? index : this.layers.indexOf(this.active()) + 1;
    if (i < 0 || i > this.layers.length) i = this.layers.length;
    this.layers.splice(i, 0, L);
    return L;
  }
  removeLayer(id) {
    if (this.layers.length <= 1) return false;
    const i = this.layers.findIndex((L) => L.id === id);
    if (i < 0) return false;
    this.layers.splice(i, 1);
    const strip = (arr) => arr.map((op) => (op.layers.includes(id) ? { ...op, layers: op.layers.filter((x) => x !== id) } : op)).filter((op) => op.layers.length);
    this.hist = strip(this.hist); this.redo = strip(this.redo);
    if (this.activeId === id) this.activeId = this.layers[Math.max(0, i - 1)].id;
    this.mount();
    return true;
  }
  moveLayer(id, dir) {
    const i = this.layers.findIndex((L) => L.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= this.layers.length) return false;
    [this.layers[i], this.layers[j]] = [this.layers[j], this.layers[i]];
    this.mount();
    return true;
  }
  hasContent() {
    return this.layers.some((L) => {
      let has = !!L.base;
      for (const op of this.hist) if (op.layers.includes(L.id)) has = op.kind !== "clear";
      return has;
    });
  }
  clearScratch() {
    const c = this.sctx;
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
    c.clearRect(0, 0, this.W, this.H);
  }
  ensureTmp() {
    if (this.tmp) return;
    this.tmp = mkCanvas(this.W, this.H);
    this.tctx = this.tmp.getContext("2d");
    this.pat = {};
  }
  grainPattern(tex, dens) {
    const q = clamp(Math.round(dens * 40), 1, 40), key = tex + q;
    if (this.pat[key]) return this.pat[key];
    const rank = grainRank(tex), th = q / 40;
    const c = mkCanvas(GN, GN), x = c.getContext("2d"), im = x.createImageData(GN, GN);
    for (let i = 0; i < rank.length; i++) im.data[i * 4 + 3] = rank[i] < th ? 255 : 0;
    x.putImageData(im, 0, 0);
    return (this.pat[key] = this.tctx.createPattern(c, "repeat"));
  }
  /* 선을 tmp에 그린 뒤 종이 결 무늬로 가려 scratch에 옮긴다. 무늬가 캔버스 좌표에 고정돼 있어 결이 이어진다 */
  grainPaint(path, minx, miny, maxx, maxy, w, dens, tex, color) {
    this.ensureTmp();
    const pad = w / 2 + 2;
    const x0 = Math.max(0, Math.floor(minx - pad)), y0 = Math.max(0, Math.floor(miny - pad));
    const x1 = Math.min(this.W, Math.ceil(maxx + pad)), y1 = Math.min(this.H, Math.ceil(maxy + pad));
    if (x1 <= x0 || y1 <= y0) return;
    const t = this.tctx, bw = x1 - x0, bh = y1 - y0;
    t.save();
    t.beginPath(); t.rect(x0, y0, bw, bh); t.clip();
    t.clearRect(x0, y0, bw, bh);
    t.strokeStyle = color; t.fillStyle = color; t.lineWidth = w; t.lineCap = "round"; t.lineJoin = "round";
    path(t);
    t.globalCompositeOperation = "destination-in";
    t.fillStyle = this.grainPattern(tex, dens);
    t.fillRect(x0, y0, bw, bh);
    t.restore();
    this.sctx.drawImage(this.tmp, x0, y0, bw, bh, x0, y0, bw, bh);
  }
  sprite(color) {
    if (this.spr && this.sprC === color) return this.spr;
    const S = 128, c = mkCanvas(S, S), x = c.getContext("2d");
    const [r, g, b] = hexRgb(color);
    const gr = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, `rgba(${r},${g},${b},1)`);
    gr.addColorStop(0.35, `rgba(${r},${g},${b},0.7)`);
    gr.addColorStop(0.7, `rgba(${r},${g},${b},0.22)`);
    gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
    x.fillStyle = gr; x.fillRect(0, 0, S, S);
    this.spr = c; this.sprC = color;
    return c;
  }
  paint(op, final) {
    if (op.kind === "stroke") makeRenderer(this, op, final).add();
    else if (op.kind === "shape") drawShape(this.sctx, op);
    else if (op.kind === "text") drawText(this.sctx, op);
  }
  compose(op, c) {
    c.save();
    c.globalAlpha = clamp(op.opacity, 0, 1);
    c.globalCompositeOperation = TOOL[op.tool] && TOOL[op.tool].erase ? "destination-out" : "source-over";
    c.drawImage(this.scratch, 0, 0);
    c.restore();
  }
  apply(op, L) {
    const c = L.ctx;
    if (op.kind === "clear") { c.clearRect(0, 0, this.W, this.H); return; }
    if (op.kind === "image") { c.save(); c.globalAlpha = 1; c.drawImage(op.img, op.x, op.y, op.w, op.h); c.restore(); return; }
    this.clearScratch();
    this.paint(op, true);
    this.compose(op, c);
    this.clearScratch();
  }
  replay(L) {
    const c = L.ctx;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
    c.clearRect(0, 0, this.W, this.H);
    if (L.base) c.drawImage(L.base, 0, 0);
    c.restore();
    for (const op of this.hist) if (op.layers.includes(L.id)) this.apply(op, L);
    L.ver++;
  }
  /* 되돌리기 한도를 넘은 가장 오래된 작업은 레이어의 base에 굳힌다 */
  bake(op) {
    for (const id of op.layers) {
      const L = this.layer(id);
      if (!L) continue;
      if (!L.base) L.base = mkCanvas(this.W, this.H);
      this.apply(op, { ctx: L.base.getContext("2d") });
    }
  }
  push(op) {
    this.hist.push(op);
    this.redo = [];
    while (this.hist.length > HISTORY_MAX) this.bake(this.hist.shift());
  }
  commit(op) {
    for (const id of op.layers) { const L = this.layer(id); if (L) { this.apply(op, L); L.ver++; } }
    this.push(op);
  }
  undo() {
    const op = this.hist.pop();
    if (!op) return false;
    this.redo.push(op);
    for (const id of op.layers) { const L = this.layer(id); if (L) this.replay(L); }
    return true;
  }
  redoOne() {
    const op = this.redo.pop();
    if (!op) return false;
    this.hist.push(op);
    for (const id of op.layers) { const L = this.layer(id); if (L) { this.apply(op, L); L.ver++; } }
    return true;
  }
  /* 실시간 획. 지우개는 획 시작 때 레이어를 떠 두고(snap) 프레임마다 snap에서 지운 결과를 보인다 */
  beginLive(op) {
    const L = this.layer(op.layers[0]);
    if (!L) return;
    this.clearScratch();
    const erase = TOOL[op.tool] && TOOL[op.tool].erase;
    this.live = { op, L, erase, r: op.kind === "stroke" ? makeRenderer(this, op, false) : null, raf: 0 };
    if (erase) {
      if (!this.snap || this.snap.width !== this.W || this.snap.height !== this.H) this.snap = mkCanvas(this.W, this.H);
      const s = this.snap.getContext("2d");
      s.clearRect(0, 0, this.W, this.H); s.drawImage(L.cv, 0, 0);
      this.scratch.style.opacity = "0";
    } else this.scratch.style.opacity = String(clamp(op.opacity, 0, 1));
    this.drawLive();
  }
  drawLive() {
    const lv = this.live;
    if (!lv) return;
    if (lv.r) lv.r.add(); else { this.clearScratch(); this.paint(lv.op, false); }
    if (lv.erase && !lv.raf) {
      lv.raf = requestAnimationFrame(() => {
        lv.raf = 0;
        if (this.live !== lv) return;
        this.restoreSnap(lv.L);
        this.compose(lv.op, lv.L.ctx);
      });
    }
  }
  /* Shift 직선처럼 점 목록이 통째로 바뀌었을 때 */
  restartLive() {
    const lv = this.live;
    if (!lv) return;
    this.clearScratch();
    if (lv.op.kind === "stroke") lv.r = makeRenderer(this, lv.op, false);
    this.drawLive();
  }
  restoreSnap(L) {
    const c = L.ctx;
    c.save(); c.globalAlpha = 1; c.globalCompositeOperation = "copy"; c.drawImage(this.snap, 0, 0); c.restore();
  }
  endLive() {
    const lv = this.live;
    if (!lv) return null;
    this.live = null;
    if (lv.raf) cancelAnimationFrame(lv.raf);
    this.clearScratch();
    this.scratch.style.opacity = "1";
    if (lv.erase) this.restoreSnap(lv.L);
    this.apply(lv.op, lv.L);
    lv.L.ver++;
    this.push(lv.op);
    return lv.op;
  }
  cancelLive() {
    const lv = this.live;
    if (!lv) return;
    this.live = null;
    if (lv.raf) cancelAnimationFrame(lv.raf);
    this.clearScratch();
    this.scratch.style.opacity = "1";
    if (lv.erase) this.restoreSnap(lv.L);
  }
  composite(paper) {
    const c = mkCanvas(this.W, this.H), x = c.getContext("2d");
    x.fillStyle = paper; x.fillRect(0, 0, this.W, this.H);
    for (const L of this.layers) if (L.vis) { x.globalAlpha = L.op; x.drawImage(L.cv, 0, 0); }
    return c;
  }
  pick(px, py, paper) {
    const x = Math.floor(px), y = Math.floor(py);
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return null;
    if (!this.pickCv) this.pickCv = mkCanvas(1, 1);
    const c = this.pickCv.getContext("2d", { willReadFrequently: true });
    c.globalAlpha = 1; c.fillStyle = paper; c.fillRect(0, 0, 1, 1);
    for (const L of this.layers) if (L.vis) { c.globalAlpha = L.op; c.drawImage(L.cv, x, y, 1, 1, 0, 0, 1, 1); }
    const d = c.getImageData(0, 0, 1, 1).data;
    return rgbHex(d[0], d[1], d[2]);
  }
}

/* ---------- 인코딩 ---------- */

/* 합친 그림: PNG가 한도 안이면 그대로, 아니면 JPEG 품질을 낮추고, 그래도 크면 줄인다 */
function encodeOpaque(cv) {
  let d = cv.toDataURL("image/png");
  if (d.length <= LIMIT) return d;
  for (const q of [0.92, 0.85, 0.75, 0.62]) { d = cv.toDataURL("image/jpeg", q); if (d.length <= LIMIT) return d; }
  for (const s of [0.8, 0.64, 0.5]) {
    const c = mkCanvas(Math.round(cv.width * s), Math.round(cv.height * s));
    c.getContext("2d").drawImage(cv, 0, 0, c.width, c.height);
    d = c.toDataURL("image/jpeg", 0.8);
    if (d.length <= LIMIT) return d;
  }
  return null;
}
/* 레이어: 투명도를 지켜야 하므로 PNG, 크면 WebP(지원 브라우저만) */
function encodeAlpha(cv) {
  let d = cv.toDataURL("image/png");
  if (d.length <= LIMIT) return d;
  for (const q of [0.92, 0.8]) {
    d = cv.toDataURL("image/webp", q);
    if (d.startsWith("data:image/webp") && d.length <= LIMIT) return d;
  }
  return null;
}
function blobData(cv) {
  return new Promise((res, rej) => {
    if (!cv.toBlob) { try { res(cv.toDataURL("image/png")); } catch (e) { rej(e); } return; }
    cv.toBlob((b) => {
      if (!b) return rej(new Error("blob"));
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = rej;
      fr.readAsDataURL(b);
    }, "image/png");
  });
}

const ss = {
  get(k) { try { const s = sessionStorage.getItem(k); return s ? JSON.parse(s) : null; } catch (e) { return null; } },
  set(k, v) { sessionStorage.setItem(k, JSON.stringify(v)); },
  del(k) { try { sessionStorage.removeItem(k); } catch (e) {} },
};

function loadPrefs() {
  const o = { press: true, smooth: 3, dash: "solid", shapeKind: "line", fill: false, finger: true, recent: [] };
  TOOLS.forEach((t) => { if (t.size) o[t.k] = { size: t.size, op: t.op }; });
  const saved = ss.get(PREFS_KEY);
  if (saved && typeof saved === "object") {
    for (const k of Object.keys(o)) {
      if (!(k in saved)) continue;
      if (o[k] && typeof o[k] === "object" && !Array.isArray(o[k])) {
        const t = TOOL[k];
        const s = saved[k] || {};
        o[k] = { size: clamp(+s.size || t.size, t.min, t.max), op: clamp(+s.op || t.op, 0.05, 1) };
      } else if (Array.isArray(o[k])) {
        if (Array.isArray(saved[k])) o[k] = saved[k].filter((c) => /^#[0-9A-F]{6}$/i.test(c)).slice(0, 8);
      } else if (typeof saved[k] === typeof o[k]) o[k] = saved[k];
    }
  }
  return o;
}

/* 굵기 슬라이더는 로그 눈금: 가는 선을 세밀하게 고를 수 있게 */
const sizeToSlider = (t, s) => Math.round((1000 * Math.log(s / t.min)) / Math.log(t.max / t.min));
const sliderToSize = (t, v) => { const s = t.min * Math.pow(t.max / t.min, v / 1000); return s < 10 ? Math.round(s * 2) / 2 : Math.round(s); };

/* ---------- 아이콘 ---------- */

const ICONS = {
  pencil: <><path d="M4 16l.7-3.2L14.2 3.3a1.6 1.6 0 0 1 2.3 0l.2.2a1.6 1.6 0 0 1 0 2.3L7.2 15.3z" /><path d="M12.6 4.9l2.5 2.5" /></>,
  pen: <><path d="M10 2.5l4.5 6.5L10 17.5 5.5 9z" /><circle cx="10" cy="9.5" r="1.2" /><path d="M10 10.7v6.8" /></>,
  brush: <><path d="M16.8 3.2c-2.2 1.2-5.6 4.4-7.3 6.6l1.7 1.7c2.2-1.7 5.4-5.1 6.6-7.3z" /><path d="M9.3 10.1c-1.8-.2-3.3 1-3.5 2.7-.2 1.5-1 2.6-2.3 3.4 3.2.7 6.8-.4 7.4-3.7" /></>,
  marker: <><path d="M12.5 3.5l4 4-7.5 7.5H5v-4z" /><path d="M10.5 5.5l4 4" /><path d="M3 17.5h7" /></>,
  charcoal: <><path d="M6.2 16.8L3.2 13.8 12 5l3 3z" /><path d="M12 5l1.6-1.6a1.4 1.4 0 0 1 2 0l1 1a1.4 1.4 0 0 1 0 2L15 8" /><path d="M3 18.2h1.2M5.5 18.2h1" /></>,
  air: <><circle cx="6" cy="10" r="3.5" /><path d="M9.5 10h4" /><circle cx="15.5" cy="7" r=".7" /><circle cx="17" cy="10" r=".7" /><circle cx="15.5" cy="13" r=".7" /><circle cx="17.8" cy="5.5" r=".5" /><circle cx="17.8" cy="14.5" r=".5" /></>,
  eraser: <><path d="M3.5 12.5l7.2-7.2a1.5 1.5 0 0 1 2.1 0l3.9 3.9a1.5 1.5 0 0 1 0 2.1L11 17H7.5z" /><path d="M7.8 8.2l6 6" /><path d="M11 17h6" /></>,
  shape: <><rect x="2.8" y="2.8" width="8.4" height="8.4" /><circle cx="13" cy="13" r="4.3" /></>,
  text: <><path d="M4 5V3.5h12V5" /><path d="M10 3.5v13" /><path d="M7.5 16.5h5" /></>,
  picker: <><path d="M12.6 3.9a2.1 2.1 0 0 1 3 3l-1.8 1.8-3-3z" /><path d="M10.8 5.7l-6.5 6.5-.6 3.6 3.6-.6 6.5-6.5" /></>,
  hand: <><path d="M7 10.5V5.2a1.1 1.1 0 0 1 2.2 0v4.3M9.2 9.5V3.9a1.1 1.1 0 0 1 2.2 0v5.6M11.4 9.5V5.1a1.1 1.1 0 0 1 2.2 0v5.4M13.6 10.3V7.6a1.1 1.1 0 0 1 2.2 0v4.9c0 3-2.3 5.3-5.3 5.3-2.1 0-3.4-.9-4.6-2.6L3.6 12a1.1 1.1 0 0 1 1.8-1.3L7 12.4" /></>,
  undo: <><path d="M7.5 4.5L3.5 8.5l4 4" /><path d="M3.5 8.5h8.5a4.5 4.5 0 0 1 0 9H9" /></>,
  redo: <><path d="M12.5 4.5l4 4-4 4" /><path d="M16.5 8.5H8a4.5 4.5 0 0 0 0 9h3" /></>,
  zoomOut: <><circle cx="8.5" cy="8.5" r="5.5" /><path d="M12.5 12.5l5 5M6 8.5h5" /></>,
  zoomIn: <><circle cx="8.5" cy="8.5" r="5.5" /><path d="M12.5 12.5l5 5M6 8.5h5M8.5 6v5" /></>,
  flip: <><path d="M10 2.5v15" strokeDasharray="2 2" /><path d="M7.5 5.5L2.5 14h5z" /><path d="M12.5 5.5l5 8.5h-5z" /></>,
  layers: <><path d="M10 3l7.5 4-7.5 4-7.5-4z" /><path d="M2.5 11l7.5 4 7.5-4" /></>,
  full: <><path d="M3 7.5V3h4.5M12.5 3H17v4.5M17 12.5V17h-4.5M7.5 17H3v-4.5" /></>,
  unfull: <><path d="M7.5 3v4.5H3M17 7.5h-4.5V3M12.5 17v-4.5H17M3 12.5h4.5V17" /></>,
  rotL: <><path d="M4.5 9a6 6 0 1 1 1.6 5" /><path d="M4 4.5V9h4.5" /></>,
  rotR: <><path d="M15.5 9a6 6 0 1 0-1.6 5" /><path d="M16 4.5V9h-4.5" /></>,
  eye: <><path d="M1.8 10S5 4.5 10 4.5 18.2 10 18.2 10 15 15.5 10 15.5 1.8 10 1.8 10z" /><circle cx="10" cy="10" r="2.6" /></>,
  eyeOff: <><path d="M3 3l14 14" /><path d="M8 5a8.6 8.6 0 0 1 2-.5c5 0 8.2 5.5 8.2 5.5a14 14 0 0 1-2.4 3M5.4 6.6A13.5 13.5 0 0 0 1.8 10S5 15.5 10 15.5a8 8 0 0 0 3.5-.8" /></>,
  up: <path d="M5 12.5l5-5 5 5" />,
  down: <path d="M5 7.5l5 5 5-5" />,
  trash: <><path d="M3.5 5.5h13M8 5.5V3.5h4v2M5.5 5.5l.8 11h7.4l.8-11" /></>,
  plus: <path d="M10 4v12M4 10h12" />,
  close: <path d="M5 5l10 10M15 5L5 15" />,
};
const Icon = ({ k }) => (
  <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[k]}</svg>
);

function Guides({ kind, W, H }) {
  if (kind === "none") return null;
  const L = [];
  if (kind === "grid") {
    const step = Math.round(Math.min(W, H) / 10);
    for (let x = step; x < W; x += step) L.push([x, 0, x, H, 1]);
    for (let y = step; y < H; y += step) L.push([0, y, W, y, 1]);
  } else if (kind === "thirds") {
    [1, 2].forEach((i) => { L.push([(W * i) / 3, 0, (W * i) / 3, H, 1.2]); L.push([0, (H * i) / 3, W, (H * i) / 3, 1.2]); });
  } else if (kind === "three") {
    // 세 시점 에스키스용 세 칸: 가로 캔버스는 좌우로, 세로 캔버스는 위아래로 나눈다
    [1, 2].forEach((i) => L.push(W >= H ? [(W * i) / 3, 0, (W * i) / 3, H, 2] : [0, (H * i) / 3, W, (H * i) / 3, 2]));
  }
  return (
    <svg className="skx-guide" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
      {L.map(([a, b, c, d, w], i) => <line key={i} x1={a} y1={b} x2={c} y2={d} stroke="rgba(0,105,190,.5)" strokeWidth={w} vectorEffect="non-scaling-stroke" />)}
    </svg>
  );
}

/* 글자 입력칸: 화면 배율에 맞춘 크기로 보이되, 16px 미만이면 iOS가 페이지를 확대하므로 16px로 두고 줄여 보인다 */
function textStyle(pos, fs, color) {
  const o = { left: pos.x, top: pos.y, color, fontSize: Math.max(16, fs) };
  if (fs < 16) { o.transform = `scale(${Math.max(0.2, fs / 16)})`; o.transformOrigin = "0 0"; }
  return o;
}

function LayerThumb({ L, paper }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const x = c.getContext("2d");
    x.globalAlpha = 1; x.fillStyle = paper; x.fillRect(0, 0, c.width, c.height);
    x.drawImage(L.cv, 0, 0, c.width, c.height);
  });
  const k = 40 / Math.max(L.cv.width, L.cv.height);
  return <canvas ref={ref} width={Math.round(L.cv.width * k)} height={Math.round(L.cv.height * k)} className="skx-lthumb" aria-hidden="true" />;
}

/* ============================================================
   화면
   ============================================================ */

export function SketchPad({ f, fieldKey, v, setField, owner, store, MediaThumb, confirmDel, fmtTime }) {
  const locked = useContext(WsLockCtx);
  const cur = v && typeof v === "object" && v.ref ? v : null;
  const rootRef = useRef(null), viewRef = useRef(null), stageRef = useRef(null), hostRef = useRef(null);
  const cursorRef = useRef(null), fileRef = useRef(null);
  const engRef = useRef(null);
  if (!engRef.current) engRef.current = new Engine();
  const eng = engRef.current;

  const [prefs, setPrefs] = useState(loadPrefs);
  const [tool, setTool] = useState("pencil");
  const [color, setColor] = useState("#111111");
  const [paper, setPaper] = useState("white");
  const [guide, setGuide] = useState("none");
  const [full, setFull] = useState(false);
  const [showLayers, setShowLayers] = useState(false);
  const [, setTick] = useState(0);
  const [zoomPct, setZoomPct] = useState(100);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [textAt, setTextAt] = useState(null);
  const [textVal, setTextVal] = useState("");
  const [touchDev, setTouchDev] = useState(() => typeof navigator !== "undefined" && navigator.maxTouchPoints > 0);
  const [dims, setDims] = useState({ W: eng.W, H: eng.H });

  const view = useRef({ s: 0.5, r: 0, fx: 1, tx: 0, ty: 0, fit: true });
  const drag = useRef(null);
  const touches = useRef(new Map());
  const spaceRef = useRef(false);
  const prevTool = useRef("pencil");
  const loadedRef = useRef(undefined);
  const loadSeq = useRef(0);
  const vRef = useRef(v); vRef.current = v;
  const dirtyRef = useRef(false); dirtyRef.current = dirty;
  const draft = useRef({ fresh: true, timer: 0, ver: 0 });
  const noteTimer = useRef(0);
  const textValRef = useRef(""); textValRef.current = textVal;
  const textRef = useRef(null);
  const penSeen = useRef(false);
  const st = useRef({});
  st.current = { tool, prefs, color, paper, locked, loading, full, textAt, busy };
  const fn = useRef({});
  const dkey = DRAFT_PREFIX + owner + ":" + fieldKey;
  const bump = () => setTick((t) => t + 1);

  const flash = (msg) => {
    setNote(msg);
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(""), 3200);
  };
  const setPref = (patch) => setPrefs((p) => {
    const n = { ...p, ...patch };
    try { ss.set(PREFS_KEY, n); } catch (e) {}
    return n;
  });
  const setToolPref = (k, patch) => setPrefs((p) => {
    const n = { ...p, [k]: { ...p[k], ...patch } };
    try { ss.set(PREFS_KEY, n); } catch (e) {}
    return n;
  });

  /* ---------- 화면 변환 (캔버스 좌표 ↔ 화면 좌표) ---------- */

  const vpSize = () => { const el = viewRef.current; return el ? { w: el.clientWidth || 1, h: el.clientHeight || 1 } : { w: 800, h: 533 }; };
  const fitScale = (r = 0) => {
    const { w, h } = vpSize(), rad = (r * Math.PI) / 180;
    const bw = Math.abs(Math.cos(rad)) * eng.W + Math.abs(Math.sin(rad)) * eng.H;
    const bh = Math.abs(Math.sin(rad)) * eng.W + Math.abs(Math.cos(rad)) * eng.H;
    return Math.max(0.02, Math.min((w - 16) / bw, (h - 16) / bh));
  };
  const toScreen = (x, y) => {
    const V = view.current, rad = (V.r * Math.PI) / 180, c = Math.cos(rad), s = Math.sin(rad);
    const u = V.fx < 0 ? eng.W - x : x;
    return { x: V.tx + V.s * (c * u - s * y), y: V.ty + V.s * (s * u + c * y) };
  };
  const toCanvasLocal = (sx, sy) => {
    const V = view.current, rad = (V.r * Math.PI) / 180, c = Math.cos(rad), s = Math.sin(rad);
    const px = sx - V.tx, py = sy - V.ty;
    const u = (c * px + s * py) / V.s, y = (-s * px + c * py) / V.s;
    return { x: V.fx < 0 ? eng.W - u : u, y };
  };
  const localOf = (clientX, clientY) => {
    const el = viewRef.current, r = el.getBoundingClientRect();
    return { x: clientX - r.left - el.clientLeft, y: clientY - r.top - el.clientTop };
  };
  const toCanvas = (clientX, clientY) => { const l = localOf(clientX, clientY); return toCanvasLocal(l.x, l.y); };
  const centerOn = (cx, cy, sx, sy) => {
    const V = view.current, rad = (V.r * Math.PI) / 180, c = Math.cos(rad), s = Math.sin(rad);
    const u = V.fx < 0 ? eng.W - cx : cx;
    V.tx = sx - V.s * (c * u - s * cy);
    V.ty = sy - V.s * (s * u + c * cy);
  };
  const clampPan = () => {
    const V = view.current, { w, h } = vpSize(), m = 48;
    const cs = [[0, 0], [eng.W, 0], [0, eng.H], [eng.W, eng.H]].map(([x, y]) => toScreen(x, y));
    const xs = cs.map((p) => p.x), ys = cs.map((p) => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    if (x1 < m) V.tx += m - x1; else if (x0 > w - m) V.tx -= x0 - (w - m);
    if (y1 < m) V.ty += m - y1; else if (y0 > h - m) V.ty -= y0 - (h - m);
  };
  const applyView = () => {
    const st2 = stageRef.current;
    if (!st2) return;
    const V = view.current, rad = (V.r * Math.PI) / 180, c = Math.cos(rad) * V.s, s = Math.sin(rad) * V.s;
    const a = c * V.fx, b = s * V.fx, e = V.tx + (V.fx < 0 ? c * eng.W : 0), f2 = V.ty + (V.fx < 0 ? s * eng.W : 0);
    st2.style.transform = `matrix(${a},${b},${-s},${c},${e},${f2})`;
    setZoomPct(Math.round((V.s / fitScale(0)) * 100));
  };
  const fitView = () => {
    const V = view.current, { w, h } = vpSize();
    V.s = fitScale(V.r);
    centerOn(eng.W / 2, eng.H / 2, w / 2, h / 2);
    V.fit = true;
    applyView();
  };
  const zoomAt = (s, sx, sy) => {
    const V = view.current, q = toCanvasLocal(sx, sy);
    V.s = clamp(s, fitScale(0) * 0.25, 8);
    centerOn(q.x, q.y, sx, sy);
    V.fit = false;
    clampPan();
    applyView();
  };
  const zoomBy = (k) => { const { w, h } = vpSize(); zoomAt(view.current.s * k, w / 2, h / 2); };
  const turnView = (patch) => {
    const { w, h } = vpSize(), q = toCanvasLocal(w / 2, h / 2), V = view.current;
    Object.assign(V, patch);
    centerOn(q.x, q.y, w / 2, h / 2);
    if (V.fit) { V.s = fitScale(V.r); centerOn(eng.W / 2, eng.H / 2, w / 2, h / 2); }
    clampPan();
    applyView();
    bump();
  };

  /* ---------- 초안 (sessionStorage) ---------- */

  const layerData = async (L) => {
    if (L.enc && L.enc.ver === L.ver) return L.enc.data;
    const data = await blobData(L.cv);
    L.enc = { ver: L.ver, data };
    return data;
  };
  const draftObj = (layers) => ({
    v: 1, base: loadedRef.current || null, w: eng.W, h: eng.H, paper: st.current.paper,
    active: eng.layers.indexOf(eng.active()), layers,
  });
  const writeDraft = async () => {
    const ver = draft.current.ver;
    try {
      const layers = [];
      for (const L of eng.layers) layers.push({ name: L.name, op: L.op, vis: L.vis, data: await layerData(L) });
      if (ver !== draft.current.ver || !dirtyRef.current) return;
      ss.set(dkey, draftObj(layers));
      draft.current.fresh = true;
      sketchDirty.current = false;
    } catch (e) {
      ss.del(dkey);
    }
  };
  const writeDraftSync = () => {
    try {
      const layers = eng.layers.map((L) => ({
        name: L.name, op: L.op, vis: L.vis,
        data: L.enc && L.enc.ver === L.ver ? L.enc.data : L.cv.toDataURL("image/png"),
      }));
      ss.set(dkey, draftObj(layers));
    } catch (e) { ss.del(dkey); }
  };
  const clearDraft = () => {
    clearTimeout(draft.current.timer);
    draft.current.ver++;
    draft.current.fresh = true;
    ss.del(dkey);
  };
  const changed = () => {
    setDirty(true);
    dirtyRef.current = true;
    draft.current.fresh = false;
    draft.current.ver++;
    sketchDirty.unsaved = true;
    sketchDirty.current = true;
    clearTimeout(draft.current.timer);
    draft.current.timer = setTimeout(writeDraft, 800);
  };
  const markClean = () => {
    setDirty(false);
    dirtyRef.current = false;
    sketchDirty.unsaved = false;
    sketchDirty.current = false;
  };

  /* ---------- 불러오기 ---------- */

  const ratioFor = (w, h) => {
    const exact = RATIOS.find((r) => r.W === w && r.H === h);
    if (exact) return exact;
    const a = w / h;
    return RATIOS.reduce((best, r) => (Math.abs(r.W / r.H - a) < Math.abs(best.W / best.H - a) ? r : best), RATIOS[0]);
  };
  const loadFrom = async (val, dr) => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setErr("");
    try {
      let W = RATIOS[0].W, H = RATIOS[0].H, list = null, active = null, pk = "white";
      if (dr) {
        const imgs = await Promise.all(dr.layers.map((l) => loadImg(l.data)));
        const R = ratioFor(dr.w, dr.h);
        W = R.W; H = R.H; pk = dr.paper; active = dr.active;
        list = dr.layers.map((l, i) => ({ name: l.name, op: l.op, vis: l.vis, img: imgs[i] }));
      } else if (val) {
        if (Array.isArray(val.layers) && val.layers.length) {
          const datas = await Promise.all(val.layers.map((l) => Promise.resolve(store.get(owner, l.ref)).catch(() => null)));
          if (datas.every((d) => typeof d === "string" && d.startsWith("data:image"))) {
            const imgs = await Promise.all(datas.map(loadImg));
            list = val.layers.map((l, i) => ({ name: l.name, op: l.op, vis: l.vis, img: imgs[i] }));
          }
        }
        let R = val.w && val.h ? ratioFor(val.w, val.h) : null;
        if (!list) {
          const data = await store.get(owner, val.ref);
          if (typeof data !== "string" || !data.startsWith("data:image")) throw new Error("missing");
          const img = await loadImg(data);
          if (!R) R = ratioFor(img.naturalWidth, img.naturalHeight);
          list = [{ name: "레이어 1", img }];
        }
        W = R.W; H = R.H; pk = val.paper;
      }
      if (seq !== loadSeq.current) return;
      eng.reset(W, H, list, active);
      setPaper(PAPERS.some((p) => p.k === pk) ? pk : "white");
      setDims({ W, H });
      loadedRef.current = dr ? dr.base : val ? val.ref : null;
      view.current.fit = true;
      requestAnimationFrame(fitView);
      if (dr) {
        changed();
        flash("저장하지 않은 그림을 다시 불러왔습니다.");
      } else markClean();
    } catch (e) {
      if (seq !== loadSeq.current) return;
      eng.reset(RATIOS[0].W, RATIOS[0].H, null);
      setDims({ W: RATIOS[0].W, H: RATIOS[0].H });
      loadedRef.current = val ? val.ref : null;
      requestAnimationFrame(fitView);
      setErr(dr ? "저장하지 않은 그림을 다시 불러오지 못했습니다." : "저장된 스케치를 캔버스로 불러오지 못했습니다. 저장된 그림은 아래 작은 그림으로 볼 수 있습니다.");
    }
    if (seq === loadSeq.current) { setLoading(false); bump(); }
  };

  /* 처음 열 때: 이 탭의 초안 → 저장된 스케치 → 빈 캔버스. 다른 기기에서 저장해 값이 바뀌면 저장 안 한 변경이 없을 때만 다시 읽는다 */
  const curRef = cur ? cur.ref : null;
  useEffect(() => {
    if (loadedRef.current === undefined) {
      try {
        for (let i = sessionStorage.length - 1; i >= 0; i--) {
          const k = sessionStorage.key(i);
          if (k && k.startsWith(DRAFT_PREFIX) && !k.startsWith(DRAFT_PREFIX + owner + ":")) sessionStorage.removeItem(k);
        }
      } catch (e) {}
      const dr = ss.get(dkey);
      if (dr && dr.v === 1 && Array.isArray(dr.layers) && dr.layers.length && dr.base === curRef) loadFrom(null, dr);
      else { if (dr) ss.del(dkey); loadFrom(cur, null); }
      return;
    }
    if (curRef === loadedRef.current || dirtyRef.current) return;
    if (curRef) loadFrom(cur, null);
    else loadedRef.current = null;
  }, [curRef]);

  /* ---------- 마운트: 엔진 연결, 크기 변화, 휠, 정리 ---------- */

  useEffect(() => {
    eng.attach(hostRef.current);
    const vp = viewRef.current;
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => {
      if (view.current.fit) fitView(); else { clampPan(); applyView(); }
    }) : null;
    if (ro) ro.observe(vp);
    const wheel = (e) => fn.current.onWheel(e);
    vp.addEventListener("wheel", wheel, { passive: false });
    return () => {
      if (ro) ro.disconnect();
      vp.removeEventListener("wheel", wheel);
      clearTimeout(draft.current.timer);
      clearTimeout(noteTimer.current);
      if (dirtyRef.current && !draft.current.fresh) writeDraftSync();
      sketchDirty.current = false;
      sketchDirty.unsaved = false;
    };
  }, []);

  /* 잠금이 켜지면 그리던 획을 거두고 크게 그리기를 닫는다 */
  useEffect(() => {
    if (!locked) return;
    if (drag.current) { eng.cancelLive(); drag.current = null; }
    textRef.current = null;
    setTextAt(null);
    setFull(false);
  }, [locked]);

  /* 크게 그리기: 페이지 스크롤을 막고, 포커스가 밖에 있어도 단축키가 듣게 한다 */
  useEffect(() => {
    if (!full) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const kd = (e) => { if (!rootRef.current || !rootRef.current.contains(e.target)) fn.current.onKey(e); };
    const ku = (e) => { if (!rootRef.current || !rootRef.current.contains(e.target)) fn.current.onKeyUp(e); };
    document.addEventListener("keydown", kd);
    document.addEventListener("keyup", ku);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", kd);
      document.removeEventListener("keyup", ku);
    };
  }, [full]);
  useEffect(() => { view.current.fit = true; requestAnimationFrame(fitView); }, [full]);

  /* ---------- 그리기 동작 ---------- */

  const pushRecent = (c) => {
    if (!c) return;
    setPrefs((p) => {
      if (p.recent[0] === c) return p;
      const n = { ...p, recent: [c, ...p.recent.filter((x) => x !== c)].slice(0, 8) };
      try { ss.set(PREFS_KEY, n); } catch (e) {}
      return n;
    });
  };
  const chooseColor = (c) => {
    setColor(c);
    if (tool === "eraser" || tool === "picker" || tool === "hand") setTool(prevTool.current === "eraser" ? "pencil" : prevTool.current);
  };
  const selectTool = (k) => {
    if (textAt) commitText();
    if (k !== tool) { if (tool !== "picker" && tool !== "hand") prevTool.current = tool; setTool(k); }
  };
  const doUndo = () => { if (drag.current) return; if (eng.undo()) { changed(); bump(); } };
  const doRedo = () => { if (drag.current) return; if (eng.redoOne()) { changed(); bump(); } };

  const pressureOf = (ev, T, d) => {
    const S = st.current;
    if (!S.prefs.press || !T.press) return 1;
    if (ev.pointerType === "pen") return ev.pressure > 0 ? ev.pressure : d ? d.p : 0.5;
    if (T.speed && d) {
      const dt = Math.max(1, ev.timeStamp - d.lt);
      const vel = Math.hypot(ev.clientX - d.lcx, ev.clientY - d.lcy) / dt;
      const target = clamp(1.1 - vel * 0.3, 0.3, 1);
      d.pv += (target - d.pv) * 0.2;
      return d.pv;
    }
    return 1;
  };

  const hoverCursor = (e) => {
    const el = cursorRef.current;
    if (!el) return;
    const S = st.current, t = (drag.current && drag.current.tool) || S.tool, T = TOOL[t];
    const sz = T && T.eng ? S.prefs[t].size * view.current.s : 0;
    if (e.pointerType === "touch" || sz < 4 || spaceRef.current) { el.style.display = "none"; return; }
    const l = localOf(e.clientX, e.clientY);
    el.style.display = "block";
    el.style.width = el.style.height = sz + "px";
    el.style.transform = `translate(${l.x - sz / 2}px,${l.y - sz / 2}px)`;
  };
  const hideCursor = () => { if (cursorRef.current) cursorRef.current.style.display = "none"; };

  const pickAt = (q) => {
    const c = eng.pick(q.x, q.y, paperColor(st.current.paper));
    if (c) setColor(c);
    return c;
  };

  const startPan = (e) => {
    drag.current = { mode: "pan", id: e.pointerId, ptype: e.pointerType, cx: e.clientX, cy: e.clientY, tx: view.current.tx, ty: view.current.ty };
    try { viewRef.current.setPointerCapture(e.pointerId); } catch (x) {}
    viewRef.current.classList.add("panning");
  };
  const startPinch = () => {
    const d = drag.current;
    if (d && (d.mode === "draw" || d.mode === "shape")) eng.cancelLive(); // 두 번째 손가락이 닿으면 그리던 획을 버리고 화면 조작으로
    const [a, b] = [...touches.current.values()];
    const la = localOf(a.x, a.y), lb = localOf(b.x, b.y);
    const m = { x: (la.x + lb.x) / 2, y: (la.y + lb.y) / 2 };
    drag.current = {
      mode: "pinch", ptype: "touch", t0: d && d.mode === "pinch" ? d.t0 : performance.now(), moved: d && d.mode === "pinch" ? d.moved : false,
      fingers: Math.max(touches.current.size, d && d.mode === "pinch" ? d.fingers : 0),
      d0: Math.hypot(la.x - lb.x, la.y - lb.y) || 1, m0: m, s0: view.current.s, q0: toCanvasLocal(m.x, m.y),
    };
  };
  const movePinch = () => {
    const d = drag.current, pts = [...touches.current.values()];
    if (pts.length < 2) return;
    const la = localOf(pts[0].x, pts[0].y), lb = localOf(pts[1].x, pts[1].y);
    const dd = Math.hypot(la.x - lb.x, la.y - lb.y), m = { x: (la.x + lb.x) / 2, y: (la.y + lb.y) / 2 };
    if (Math.abs(dd - d.d0) > 10 || Math.hypot(m.x - d.m0.x, m.y - d.m0.y) > 10) d.moved = true;
    if (!d.moved) return;
    const V = view.current;
    V.s = clamp((d.s0 * dd) / d.d0, fitScale(0) * 0.25, 8);
    centerOn(d.q0.x, d.q0.y, m.x, m.y);
    V.fit = false;
    clampPan();
    applyView();
  };

  const onPointerDown = (e) => {
    const S = st.current;
    if (S.locked || S.loading || S.busy) return;
    if (e.pointerType === "touch" && !touchDev) setTouchDev(true);
    if (e.pointerType === "pen" && !penSeen.current) {
      penSeen.current = true;
      if (S.prefs.finger) { setPref({ finger: false }); flash("펜이 감지되어 손가락으로는 화면 이동·확대만 합니다."); }
    }
    if (rootRef.current && document.activeElement !== rootRef.current && !(S.textAt)) rootRef.current.focus({ preventScroll: true });
    if (S.textAt) { commitText(); return; }
    if (e.pointerType === "touch") {
      const d0 = drag.current;
      if (d0 && d0.ptype !== "touch") return; // 펜·마우스로 그리는 중에 닿은 손(손바닥)은 무시
      if (e.isPrimary) touches.current.clear();
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (touches.current.size >= 2) { startPinch(); return; }
      if (d0 && d0.mode === "pinch") return;
      if (!S.prefs.finger || S.tool === "hand") { startPan(e); return; }
    } else if (drag.current && drag.current.ptype === "touch") {
      // 펜·마우스가 손가락 조작보다 앞선다: 손바닥으로 시작된 이동·획을 거두고 펜으로 그린다
      if (drag.current.mode === "draw" || drag.current.mode === "shape") eng.cancelLive();
      drag.current = null;
      viewRef.current.classList.remove("panning");
    }
    if (e.pointerType === "mouse") {
      if (e.button === 1 || (e.button === 0 && (spaceRef.current || S.tool === "hand"))) { e.preventDefault(); startPan(e); return; }
      if (e.button !== 0) return;
      e.preventDefault();
    } else if (S.tool === "hand" || spaceRef.current) { startPan(e); return; }
    if (drag.current) return;

    const q = toCanvas(e.clientX, e.clientY);
    const penEraser = e.pointerType === "pen" && (e.button === 5 || (e.buttons & 32));
    const t = penEraser ? "eraser" : S.tool;
    const T = TOOL[t];
    if (t === "picker" || (e.altKey && T.eng)) {
      pickAt(q);
      drag.current = { mode: "pick", id: e.pointerId, ptype: e.pointerType, back: t === "picker" };
      try { viewRef.current.setPointerCapture(e.pointerId); } catch (x) {}
      return;
    }
    if (t === "text") {
      if (!eng.active().vis) { flash("숨긴 레이어에는 쓸 수 없습니다. 레이어 창에서 눈 모양 버튼을 눌러 보이게 하세요."); return; }
      if (q.x < 0 || q.y < 0 || q.x > eng.W || q.y > eng.H) return;
      e.preventDefault();
      setTextVal("");
      textRef.current = { x: q.x, y: q.y };
      setTextAt(textRef.current);
      return;
    }
    const L = eng.active();
    if (!L.vis) { flash("숨긴 레이어에는 그릴 수 없습니다. 레이어 창에서 눈 모양 버튼을 눌러 보이게 하세요."); return; }
    try { viewRef.current.setPointerCapture(e.pointerId); } catch (x) {}
    if (t === "shape") {
      const sk = S.prefs.shapeKind;
      const op = { kind: "shape", tool: "shape", shape: sk, x0: q.x, y0: q.y, x1: q.x, y1: q.y, color: S.color,
        size: S.prefs.shape.size, opacity: S.prefs.shape.op, dash: S.prefs.dash, fill: (sk === "rect" || sk === "ellipse") && S.prefs.fill, layers: [L.id] };
      eng.beginLive(op);
      drag.current = { mode: "shape", id: e.pointerId, ptype: e.pointerType, op, tool: t };
      return;
    }
    const pr = S.prefs[t];
    const op = { kind: "stroke", tool: t, color: S.color, size: pr.size, opacity: pr.op, dash: T.dash ? S.prefs.dash : "solid", layers: [L.id], pts: [] };
    const d = { mode: "draw", id: e.pointerId, ptype: e.pointerType, op, T, tool: t, x0: q.x, y0: q.y, sx: q.x, sy: q.y, lt: e.timeStamp, lcx: e.clientX, lcy: e.clientY, pv: 1, p: 0.5, straight: false };
    d.p = pressureOf(e, T, null);
    op.pts.push(q.x, q.y, d.p);
    drag.current = d;
    eng.beginLive(op);
    hoverCursor(e);
  };

  const onPointerMove = (e) => {
    if (e.pointerType === "touch" && touches.current.has(e.pointerId)) touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const d = drag.current;
    if (!d) { hoverCursor(e); return; }
    if (d.mode === "pinch") { movePinch(); return; }
    if (d.id !== e.pointerId) return;
    if (d.mode === "pan") {
      const V = view.current;
      V.tx = d.tx + (e.clientX - d.cx); V.ty = d.ty + (e.clientY - d.cy); V.fit = false;
      clampPan(); applyView();
      return;
    }
    if (d.mode === "pick") { pickAt(toCanvas(e.clientX, e.clientY)); return; }
    if (d.mode === "shape") {
      const q = toCanvas(e.clientX, e.clientY), op = d.op;
      let x1 = q.x, y1 = q.y;
      if (e.shiftKey) {
        const dx = x1 - op.x0, dy = y1 - op.y0;
        if (op.shape === "line" || op.shape === "arrow") {
          const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12), L = Math.hypot(dx, dy);
          x1 = op.x0 + Math.cos(a) * L; y1 = op.y0 + Math.sin(a) * L;
        } else {
          const m = Math.max(Math.abs(dx), Math.abs(dy));
          x1 = op.x0 + Math.sign(dx || 1) * m; y1 = op.y0 + Math.sign(dy || 1) * m;
        }
      }
      op.x1 = x1; op.y1 = y1;
      eng.drawLive();
      hoverCursor(e);
      return;
    }
    if (d.mode !== "draw") return;
    const op = d.op;
    if (e.shiftKey) {
      // Shift: 시작점에서 지금 위치까지 직선
      const q = toCanvas(e.clientX, e.clientY);
      d.p = pressureOf(e, d.T, d);
      op.pts = [d.x0, d.y0, op.pts[2], q.x, q.y, d.p];
      d.straight = true; d.sx = q.x; d.sy = q.y;
      eng.restartLive();
      hoverCursor(e);
      return;
    }
    const list = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
    const evs = list.length ? list : [e];
    const k = 1 - clamp(st.current.prefs.smooth, 0, 10) * 0.085;
    const minD = 0.75 / view.current.s;
    for (const ev of evs) {
      const q = toCanvas(ev.clientX, ev.clientY);
      const p = pressureOf(ev, d.T, d);
      d.lt = ev.timeStamp; d.lcx = ev.clientX; d.lcy = ev.clientY; d.p = p;
      d.sx += (q.x - d.sx) * k; d.sy += (q.y - d.sy) * k;
      const n = op.pts.length;
      if (Math.hypot(d.sx - op.pts[n - 3], d.sy - op.pts[n - 2]) < minD) continue;
      op.pts.push(d.sx, d.sy, p);
    }
    eng.drawLive();
    hoverCursor(e);
  };

  const finishDraw = (d, e) => {
    const op = d.op;
    if (e && !d.straight && st.current.prefs.smooth > 0) {
      // 보정 때문에 뒤처진 끝을 펜을 뗀 곳까지 잇는다
      const q = toCanvas(e.clientX, e.clientY), n = op.pts.length;
      if (Math.hypot(q.x - op.pts[n - 3], q.y - op.pts[n - 2]) > 0.75 / view.current.s) op.pts.push(q.x, q.y, d.p);
    }
    eng.endLive();
    if (!d.T.erase) pushRecent(op.color);
    changed();
    bump();
  };

  const onPointerUp = (e) => {
    if (e.pointerType === "touch") touches.current.delete(e.pointerId);
    const d = drag.current;
    if (!d) return;
    if (d.mode === "pinch") {
      if (touches.current.size === 0) {
        drag.current = null;
        // 두 손가락 탭은 되돌리기, 세 손가락 탭은 다시 실행
        if (!d.moved && performance.now() - d.t0 < 320) { if (d.fingers >= 3) doRedo(); else if (d.fingers === 2) doUndo(); }
      }
      return;
    }
    if (d.id !== e.pointerId) return;
    drag.current = null;
    viewRef.current.classList.remove("panning");
    if (d.mode === "draw") finishDraw(d, e);
    else if (d.mode === "shape") {
      const op = d.op;
      if (Math.hypot(op.x1 - op.x0, op.y1 - op.y0) * view.current.s < 3) eng.cancelLive();
      else { eng.endLive(); pushRecent(op.color); changed(); bump(); }
    } else if (d.mode === "pick") {
      if (d.back) setTool(prevTool.current);
    }
  };
  const onPointerCancel = (e) => {
    if (e.pointerType === "touch") touches.current.delete(e.pointerId);
    const d = drag.current;
    if (!d || (d.mode !== "pinch" && d.id !== e.pointerId)) return;
    if (d.mode === "pinch") { if (touches.current.size === 0) drag.current = null; return; }
    drag.current = null;
    viewRef.current.classList.remove("panning");
    if (d.mode === "draw" && e.pointerType !== "touch") finishDraw(d, null);
    else if (d.mode === "draw" || d.mode === "shape") eng.cancelLive();
  };

  const onWheel = (e) => {
    const S = st.current;
    if (S.locked) return;
    const l = localOf(e.clientX, e.clientY);
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const k = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0022));
      zoomAt(view.current.s * k, l.x, l.y);
      return;
    }
    const V = view.current;
    const moved = V.s > fitScale(0) * 1.02 || V.r % 360 !== 0;
    if (!S.full && !moved) return; // 맞춤 보기에서는 페이지를 스크롤한다
    let dx = e.deltaX, dy = e.deltaY;
    if (e.deltaMode === 1) { dx *= 16; dy *= 16; }
    if (e.shiftKey && !dx) { dx = dy; dy = 0; }
    const tx0 = V.tx, ty0 = V.ty;
    V.tx -= dx; V.ty -= dy; V.fit = false;
    clampPan();
    // 캔버스가 끝까지 밀렸으면 페이지가 스크롤되게 둔다
    if (S.full || Math.abs(V.tx - tx0) > 0.5 || Math.abs(V.ty - ty0) > 0.5) { e.preventDefault(); applyView(); }
  };

  const onKey = (e) => {
    const S = st.current;
    if (S.locked) return;
    const t = e.target;
    const typing = t && (t.tagName === "TEXTAREA" || t.tagName === "SELECT" || (t.tagName === "INPUT" && !["range", "color", "checkbox", "button", "file"].includes(t.type)));
    if (typing) return;
    const k = e.key, mod = e.ctrlKey || e.metaKey;
    if (mod && (k === "z" || k === "Z")) { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); return; }
    if (mod && (k === "y" || k === "Y")) { e.preventDefault(); doRedo(); return; }
    if (mod && (k === "s" || k === "S")) { e.preventDefault(); save(); return; }
    if (mod || e.altKey) return;
    if (k === " ") {
      if (t === rootRef.current || t === viewRef.current || t === document.body) {
        e.preventDefault();
        if (!spaceRef.current) { spaceRef.current = true; viewRef.current.classList.add("space"); hideCursor(); }
      }
      return;
    }
    if (k === "Escape") { if (S.full) { e.preventDefault(); setFull(false); } else if (showLayers) setShowLayers(false); return; }
    if (k === "[" || k === "]") {
      const T = TOOL[S.tool];
      if (!T.size) return;
      e.preventDefault();
      const vv = sizeToSlider(T, S.prefs[S.tool].size) + (k === "]" ? 60 : -60);
      setToolPref(S.tool, { size: clamp(sliderToSize(T, clamp(vv, 0, 1000)), T.min, T.max) });
      return;
    }
    if (k === "+" || k === "=") { e.preventDefault(); zoomBy(1.25); return; }
    if (k === "-" || k === "_") { e.preventDefault(); zoomBy(0.8); return; }
    if (k === "0") { e.preventDefault(); fitView(); return; }
    if (k === "f" || k === "F") { e.preventDefault(); setFull((x) => !x); return; }
    const T = TOOLS.find((x) => x.key === k.toLowerCase());
    if (T) { e.preventDefault(); selectTool(T.k); }
  };
  const onKeyUp = (e) => {
    if (e.key === " " && spaceRef.current) {
      spaceRef.current = false;
      if (viewRef.current) viewRef.current.classList.remove("space");
    }
  };
  fn.current = { onWheel, onKey, onKeyUp };

  /* ---------- 글자 ---------- */

  const commitText = () => {
    const at = textRef.current, val = textValRef.current.replace(/\s+$/, "");
    textRef.current = null;
    setTextAt(null);
    setTextVal("");
    if (!at || !val.trim()) return;
    const L = eng.active();
    const S = st.current;
    const op = { kind: "text", tool: "text", x: at.x, y: at.y, text: val, size: S.prefs.text.size, color: S.color, opacity: S.prefs.text.op, layers: [L.id] };
    const go = () => { eng.commit(op); pushRecent(op.color); changed(); bump(); };
    if (document.fonts && document.fonts.load) document.fonts.load(TEXT_FONT(op.size), val).then(go, go);
    else go();
  };

  /* ---------- 레이어·캔버스 ---------- */

  const addLayer = () => {
    if (eng.layers.length >= MAX_LAYERS) return flash("레이어는 4장까지 만들 수 있습니다.");
    const L = eng.addLayer();
    eng.activeId = L.id;
    eng.mount();
    bump();
  };
  const layerHasContent = (L) => {
    let has = !!L.base;
    for (const op of eng.hist) if (op.layers.includes(L.id)) has = op.kind !== "clear";
    return has;
  };
  const removeLayer = (L) => {
    if (eng.layers.length <= 1) return;
    if (layerHasContent(L) && !window.confirm(`「${L.name}」을(를) 지울까요? 레이어 지우기는 되돌릴 수 없습니다.`)) return;
    eng.removeLayer(L.id);
    changed();
    bump();
  };
  const setLayer = (L, patch) => { Object.assign(L, patch); eng.mount(); changed(); bump(); };
  const clearAll = () => {
    if (!eng.hasContent()) return;
    eng.commit({ kind: "clear", layers: eng.layers.map((L) => L.id) });
    changed();
    bump();
    flash("모두 지웠습니다. 되돌리기로 되살릴 수 있습니다.");
  };
  const changeRatio = (k) => {
    const R = RATIOS.find((r) => r.k === k);
    if (!R || (R.W === eng.W && R.H === eng.H)) return;
    if (eng.hasContent() && !window.confirm("캔버스 비율을 바꾸면 지금 그림이 새 캔버스에 맞게 줄어들고, 되돌리기 기록이 지워집니다. 바꿀까요?")) return;
    eng.resizeKeep(R.W, R.H);
    setDims({ W: R.W, H: R.H });
    view.current.fit = true;
    requestAnimationFrame(fitView);
    changed();
    bump();
  };
  const importPhoto = async (file) => {
    if (!file) return;
    if (eng.layers.length >= MAX_LAYERS) return flash("레이어가 4장이라 더 불러올 수 없습니다. 레이어를 하나 지운 뒤 불러오세요.");
    let url = "";
    try {
      url = URL.createObjectURL(file);
      const img = await loadImg(url);
      const s = Math.min(eng.W / img.naturalWidth, eng.H / img.naturalHeight);
      const w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s);
      const c = mkCanvas(w, h);
      c.getContext("2d").drawImage(img, 0, 0, w, h);
      const act = eng.active();
      const L = eng.addLayer("사진", eng.layers.indexOf(act));
      L.op = 0.6;
      eng.activeId = act.id;
      eng.mount();
      eng.commit({ kind: "image", layers: [L.id], img: c, x: Math.round((eng.W - w) / 2), y: Math.round((eng.H - h) / 2), w, h });
      changed();
      setShowLayers(true);
      bump();
      flash("사진을 지금 레이어 아래에 불러왔습니다. 레이어 창에서 불투명도를 바꿀 수 있습니다.");
    } catch (e) {
      flash("사진을 불러오지 못했습니다. JPG나 PNG 파일인지 확인해 주세요.");
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  };

  /* ---------- 저장 ---------- */

  const save = async () => {
    const S = st.current;
    if (S.busy || S.loading || S.locked) return;
    if (drag.current) return;
    if (S.textAt) commitText();
    setBusy(true);
    setErr("");
    await new Promise((r) => setTimeout(r, 30)); // 「저장 중…」이 먼저 보이게
    try {
      const comp = encodeOpaque(eng.composite(paperColor(S.paper)));
      if (!comp) throw new Error("big");
      const ref = fieldKey + "." + Date.now();
      const ok = await store.putT(owner, ref, comp);
      if (!ok) { setErr("스케치를 저장하지 못했습니다. 연결을 확인하고 다시 저장해 주세요. 그린 내용은 그대로 있습니다."); setBusy(false); return; }
      let layers = [];
      for (let i = 0; i < eng.layers.length; i++) {
        const L = eng.layers[i];
        const data = encodeAlpha(L.cv);
        const lref = ref + ".L" + i;
        if (!data || !(await store.putT(owner, lref, data))) { layers.forEach((l) => store.remove(owner, l.ref)); layers = null; break; }
        layers.push({ ref: lref, name: L.name, op: Math.round(L.op * 100) / 100, vis: L.vis });
      }
      const prev = vRef.current;
      const val = { ref, at: new Date().toISOString(), w: eng.W, h: eng.H, paper: S.paper };
      if (layers) val.layers = layers;
      loadedRef.current = ref;
      setField(fieldKey, val);
      if (prev && typeof prev === "object") {
        if (prev.ref) store.remove(owner, prev.ref);
        (Array.isArray(prev.layers) ? prev.layers : []).forEach((l) => l && l.ref && store.remove(owner, l.ref));
      }
      clearDraft();
      markClean();
      if (!layers) flash("레이어가 커서 한 장으로 합쳐 저장했습니다. 다시 열면 레이어 1장으로 열립니다.");
    } catch (e) {
      setErr(e && e.message === "big" ? "스케치가 너무 커서 저장하지 못했습니다. 에어브러시·목탄으로 넓게 칠한 부분을 줄여 보세요." : "스케치를 저장하지 못했습니다. 그린 내용은 그대로 있습니다.");
    }
    setBusy(false);
  };
  const revertToSaved = () => {
    if (!cur) return;
    if (!window.confirm("저장한 뒤에 그린 내용을 버리고 저장한 그림으로 되돌릴까요?")) return;
    clearDraft();
    markClean();
    loadFrom(cur, null);
  };
  const removeSaved = async () => {
    if (!cur || !confirmDel()) return;
    const refs = [cur.ref, ...(Array.isArray(cur.layers) ? cur.layers.map((l) => l && l.ref) : [])].filter(Boolean);
    loadedRef.current = null;
    setField(fieldKey, "");
    refs.forEach((r) => store.remove(owner, r));
    if (eng.hasContent()) changed(); else { clearDraft(); markClean(); }
  };

  /* ---------- 그리기 ---------- */

  const T = TOOL[tool];
  const pr = prefs[tool];
  const A = eng.active();
  const isBrush = !!(T && T.eng);
  const sizeCss = pr ? pr.size * view.current.s : 0;
  const canUndo = eng.hist.length > 0, canRedo = eng.redo.length > 0;
  const textPos = textAt ? toScreen(textAt.x, textAt.y) : null;

  const toolBtn = (t) => (
    <button key={t.k} type="button" className={"skx-tool" + (tool === t.k ? " on" : "")} aria-pressed={tool === t.k}
      title={`${t.name} (${t.key.toUpperCase()})`} onClick={() => selectTool(t.k)}>
      <Icon k={t.k} /><span>{t.name}</span>
    </button>
  );
  const iconBtn = (k, label, onClick, opts = {}) => (
    <button type="button" className={"skx-ib" + (opts.on ? " on" : "")} title={label} aria-label={label} aria-pressed={opts.on === undefined ? undefined : !!opts.on}
      disabled={opts.disabled} onClick={onClick}><Icon k={k} /></button>
  );
  const seg = (items, value, onPick, label) => (
    <span className="skx-seg" role="group" aria-label={label}>
      {items.map(([k, name]) => <button key={k} type="button" className={value === k ? "on" : ""} aria-pressed={value === k} onClick={() => onPick(k)}>{name}</button>)}
    </span>
  );

  return (
    <div className="field span2">
      <label>{f.label}</label>
      <div ref={rootRef} className={"skx" + (full ? " skx-full" : "")} tabIndex={-1} onKeyDown={onKey} onKeyUp={onKeyUp}>
        <div className="skx-bar">
          <div className="skx-grp" role="toolbar" aria-label="그리기 도구">{TOOLS.slice(0, 7).map(toolBtn)}</div>
          <span className="skx-sep" />
          <div className="skx-grp" role="toolbar" aria-label="도형·글자·색 가져오기·이동">{TOOLS.slice(7).map(toolBtn)}</div>
          <span className="skx-sep" />
          <div className="skx-grp skx-view-grp">
            {iconBtn("undo", "되돌리기 (Ctrl+Z)", doUndo, { disabled: !canUndo })}
            {iconBtn("redo", "다시 실행 (Ctrl+Shift+Z)", doRedo, { disabled: !canRedo })}
            <span className="skx-sep" />
            {iconBtn("zoomOut", "축소 (-)", () => zoomBy(0.8))}
            <button type="button" className="skx-zoom" title="화면에 맞추기 (0)" onClick={fitView}>{zoomPct}%</button>
            {iconBtn("zoomIn", "확대 (+)", () => zoomBy(1.25))}
            {iconBtn("flip", "좌우 반전해서 보기", () => turnView({ fx: -view.current.fx }), { on: view.current.fx < 0 })}
            {iconBtn("layers", "레이어", () => setShowLayers((x) => !x), { on: showLayers })}
            {iconBtn(full ? "unfull" : "full", full ? "작게 보기 (Esc)" : "크게 그리기 (F)", () => setFull((x) => !x), { on: full })}
          </div>
        </div>

        <div className="skx-opts">
          {tool === "shape" && <span className="skx-opt"><b>모양</b>{seg(SHAPES, prefs.shapeKind, (k) => setPref({ shapeKind: k }), "도형 모양")}</span>}
          {pr && (
            <span className="skx-opt">
              <b>{tool === "text" ? "글자 크기" : "굵기"}</b>
              <input type="range" min="0" max="1000" value={sizeToSlider(T, pr.size)} aria-label={tool === "text" ? "글자 크기" : "굵기"}
                onChange={(e) => setToolPref(tool, { size: sliderToSize(T, +e.target.value) })} />
              <span className="skx-num">{pr.size}px</span>
              {tool !== "text" && <span className="skx-dot" aria-hidden="true"><i style={{ width: clamp(sizeCss, 1, 34), height: clamp(sizeCss, 1, 34), background: tool === "eraser" ? "#fff" : color, opacity: tool === "eraser" ? 1 : pr.op }} /></span>}
            </span>
          )}
          {pr && (
            <span className="skx-opt">
              <b>불투명도</b>
              <input type="range" min="5" max="100" value={Math.round(pr.op * 100)} aria-label="불투명도"
                onChange={(e) => setToolPref(tool, { op: +e.target.value / 100 })} />
              <span className="skx-num">{Math.round(pr.op * 100)}%</span>
            </span>
          )}
          {T.dash && <span className="skx-opt"><b>선 모양</b>{seg(DASHES, prefs.dash, (k) => setPref({ dash: k }), "선 모양")}</span>}
          {tool === "shape" && (prefs.shapeKind === "rect" || prefs.shapeKind === "ellipse") && (
            <button type="button" className={"skx-chip" + (prefs.fill ? " on" : "")} aria-pressed={prefs.fill} onClick={() => setPref({ fill: !prefs.fill })}>안쪽 채우기</button>
          )}
          {isBrush && T.press && (
            <button type="button" className={"skx-chip" + (prefs.press ? " on" : "")} aria-pressed={prefs.press} onClick={() => setPref({ press: !prefs.press })}
              title="펜을 누르는 힘에 따라 굵기와 농도가 달라집니다">필압</button>
          )}
          {isBrush && (
            <span className="skx-opt">
              <b>손떨림 보정</b>
              <input type="range" min="0" max="10" value={prefs.smooth} aria-label="손떨림 보정" onChange={(e) => setPref({ smooth: +e.target.value })} />
              <span className="skx-num">{prefs.smooth}</span>
            </span>
          )}
          {touchDev && (isBrush || tool === "shape" || tool === "text") && (
            <button type="button" className={"skx-chip" + (prefs.finger ? " on" : "")} aria-pressed={prefs.finger} onClick={() => setPref({ finger: !prefs.finger })}
              title="끄면 손가락은 화면 이동·확대에만 쓰고, 그리기는 펜으로만 합니다">손가락으로 그리기</button>
          )}
          {tool === "picker" && <span className="skx-tip">캔버스를 누르면 그 색을 가져옵니다.</span>}
          {tool === "hand" && <span className="skx-tip">끌어서 화면을 옮깁니다.</span>}
          {tool === "text" && <span className="skx-tip">캔버스를 누른 뒤 글자를 쓰고 Enter를 누릅니다.</span>}
        </div>

        <div className={"skx-colors" + (tool === "eraser" || tool === "hand" ? " dim" : "")}>
          <span className="skx-cur" title="색 고르기" style={{ background: color }}>
            <input type="color" value={/^#[0-9A-F]{6}$/i.test(color) ? color.toLowerCase() : "#111111"} aria-label="색 고르기"
              onChange={(e) => chooseColor(e.target.value.toUpperCase())} />
          </span>
          <span className="skx-hex">{color}</span>
          <span className="skx-pal" role="group" aria-label="팔레트">
            {PALETTE.map(([c, name]) => (
              <button key={c} type="button" className={"skx-sw" + (color === c ? " on" : "")} style={{ background: c }} title={name} aria-label={name}
                aria-pressed={color === c} onClick={() => chooseColor(c)} />
            ))}
          </span>
          {prefs.recent.length > 0 && (
            <span className="skx-pal skx-recent" role="group" aria-label="최근 쓴 색">
              <b>최근</b>
              {prefs.recent.map((c) => (
                <button key={c} type="button" className={"skx-sw" + (color === c ? " on" : "")} style={{ background: c }} title={c} aria-label={"최근 색 " + c}
                  onClick={() => chooseColor(c)} />
              ))}
            </span>
          )}
        </div>

        <div className="skx-main">
          <div ref={viewRef} className={"skx-view tool-" + tool} style={{ aspectRatio: `${dims.W} / ${dims.H}` }}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}
            onPointerLeave={hideCursor} onContextMenu={(e) => e.preventDefault()}>
            <div ref={stageRef} className="skx-stage" style={{ width: dims.W, height: dims.H }}>
              <div className="skx-paper" style={{ background: paperColor(paper) }} />
              <div ref={hostRef} className="skx-host" />
              <Guides kind={guide} W={dims.W} H={dims.H} />
            </div>
            <div ref={cursorRef} className="skx-cursor" />
            {textAt && textPos && (
              <input className="skx-textin" autoFocus value={textVal} placeholder="글자 입력" aria-label="캔버스에 쓸 글자"
                style={textStyle(textPos, prefs.text.size * view.current.s, color)}
                onChange={(e) => setTextVal(e.target.value)} onBlur={commitText} onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); commitText(); }
                  else if (e.key === "Escape") { e.preventDefault(); textRef.current = null; setTextAt(null); setTextVal(""); }
                }} />
            )}
            {loading && <div className="skx-load">불러오는 중…</div>}
            {note && <div className="skx-toast" role="status">{note}</div>}
          </div>

          {showLayers && (
            <div className="skx-layers" role="group" aria-label="레이어">
              <div className="skx-lhead">
                <b>레이어</b>
                <button type="button" className="skx-lbtn" onClick={addLayer} disabled={eng.layers.length >= MAX_LAYERS}><Icon k="plus" />새 레이어</button>
                {iconBtn("close", "레이어 창 닫기", () => setShowLayers(false))}
              </div>
              <ul>
                {[...eng.layers].reverse().map((L, ri) => {
                  const i = eng.layers.length - 1 - ri;
                  const on = L.id === eng.activeId;
                  return (
                    <li key={L.id} className={on ? "on" : ""}>
                      {iconBtn(L.vis ? "eye" : "eyeOff", L.vis ? L.name + " 숨기기" : L.name + " 보이기", () => setLayer(L, { vis: !L.vis }), { on: L.vis })}
                      <button type="button" className="skx-lname" aria-pressed={on} onClick={() => { eng.activeId = L.id; eng.mount(); bump(); }}>
                        <LayerThumb L={L} paper={paperColor(paper)} />
                        <span>{L.name}{L.op < 1 ? ` · ${Math.round(L.op * 100)}%` : ""}</span>
                      </button>
                      {iconBtn("up", L.name + " 위로", () => { eng.moveLayer(L.id, 1); changed(); bump(); }, { disabled: i === eng.layers.length - 1 })}
                      {iconBtn("down", L.name + " 아래로", () => { eng.moveLayer(L.id, -1); changed(); bump(); }, { disabled: i === 0 })}
                      {iconBtn("trash", L.name + " 지우기", () => removeLayer(L), { disabled: eng.layers.length <= 1 })}
                    </li>
                  );
                })}
              </ul>
              {A && (
                <div className="skx-opt skx-lop">
                  <b>{A.name} 불투명도</b>
                  <input type="range" min="0" max="100" value={Math.round(A.op * 100)} aria-label={A.name + " 불투명도"}
                    onChange={(e) => setLayer(A, { op: +e.target.value / 100 })} />
                  <span className="skx-num">{Math.round(A.op * 100)}%</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="skx-canvasbar">
          <span className="skx-opt"><b>종이</b>
            <span className="skx-pal" role="group" aria-label="종이 색">
              {PAPERS.map((p) => (
                <button key={p.k} type="button" className={"skx-sw paper" + (paper === p.k ? " on" : "")} style={{ background: p.c }} title={p.name + " 종이"}
                  aria-label={p.name + " 종이"} aria-pressed={paper === p.k} onClick={() => { if (paper !== p.k) { setPaper(p.k); changed(); } }} />
              ))}
            </span>
          </span>
          <span className="skx-opt"><b>안내선</b>{seg(GUIDES, guide, setGuide, "안내선")}</span>
          <span className="skx-opt"><b>캔버스</b>{seg(RATIOS.map((r) => [r.k, r.name]), ratioFor(dims.W, dims.H).k, changeRatio, "캔버스 비율")}</span>
          <span className="skx-opt"><b>회전</b>
            {iconBtn("rotL", "왼쪽으로 15° 돌려 보기", () => turnView({ r: (view.current.r - 15) % 360 }))}
            {iconBtn("rotR", "오른쪽으로 15° 돌려 보기", () => turnView({ r: (view.current.r + 15) % 360 }))}
            {view.current.r % 360 !== 0 && <button type="button" className="skx-chip" onClick={() => turnView({ r: 0 })}>원래대로</button>}
          </span>
          <span className="skx-opt">
            <button type="button" className="btn small ghost" onClick={() => fileRef.current && fileRef.current.click()}>사진 불러오기</button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { importPhoto(e.target.files && e.target.files[0]); e.target.value = ""; }} />
            <button type="button" className="btn small ghost" onClick={clearAll}>모두 지우기</button>
          </span>
        </div>

        <div className="skx-foot">
          <button type="button" className="btn small" disabled={busy || loading || !dirty} onClick={save}>{busy ? "저장 중…" : "스케치 저장"}</button>
          {dirty && !busy && <span className="hint" style={{ color: "var(--seal)" }}>저장하지 않은 변경이 있습니다.</span>}
          {cur && (
            <>
              <span className="hint">저장된 스케치 {fmtTime(cur.at)}</span>
              <MediaThumb owner={owner} refId={cur.ref} alt="저장된 스케치" size={48} />
              {dirty && <button type="button" className="mm-del" onClick={revertToSaved}>저장한 그림으로 되돌리기</button>}
              <button type="button" className="mm-del" onClick={removeSaved}>저장된 스케치 지우기</button>
            </>
          )}
          {err && <span className="hint" role="alert" style={{ color: "var(--seal)", flex: "1 1 100%" }}>{err}</span>}
          <details className="skx-help">
            <summary>단축키와 손동작</summary>
            <ul>
              <li>두 손가락으로 벌리거나 모으면 확대·축소, 끌면 이동, 두 손가락 탭은 되돌리기, 세 손가락 탭은 다시 실행</li>
              <li>펜을 쓰면 손가락으로는 그려지지 않습니다(손바닥이 닿아도 선이 생기지 않음). 「손가락으로 그리기」로 바꿀 수 있습니다.</li>
              <li>Shift를 누른 채 그리면 직선, Alt를 누른 채 누르면 스포이트</li>
              <li>Ctrl+휠 확대·축소, 스페이스바나 휠 버튼을 누른 채 끌면 이동</li>
              <li>1~6 붓 종류, E 지우개, U 도형, T 글자, I 스포이트, H 이동, [ ] 굵기, 0 화면 맞춤, F 크게 그리기</li>
              <li>Ctrl+Z 되돌리기, Ctrl+Shift+Z 다시 실행, Ctrl+S 저장</li>
            </ul>
          </details>
        </div>
      </div>
    </div>
  );
}

/* ---------- 스타일 ---------- */

export const SKETCH_CSS = `
.skx{position:relative;display:flex;flex-direction:column;background:#fff;border:1px solid var(--line);min-width:0;outline:none}
.skx:focus-visible{outline:2px solid var(--ink);outline-offset:1px}
.skx-bar{display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:6px;border-bottom:1px solid var(--line2);background:#fafafa}
.skx-grp{display:flex;flex-wrap:wrap;gap:2px;align-items:center}
.skx-view-grp{margin-left:auto}
.skx-sep{align-self:stretch;width:1px;min-height:24px;background:var(--line);margin:4px 3px}
.skx-tool{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-width:48px;height:50px;padding:4px 4px 3px;border:1px solid transparent;background:transparent;color:var(--ink);font-family:var(--sans);font-size:11.5px;line-height:1.1;cursor:pointer;white-space:nowrap}
.skx-tool:hover{background:#ececec}
.skx-tool.on{background:var(--ink);border-color:var(--ink);color:#fff}
.skx-ib{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;padding:0;border:1px solid transparent;background:transparent;color:var(--ink);cursor:pointer}
.skx-ib:hover:not(:disabled){background:#ececec}
.skx-ib.on{border-color:var(--ink);background:#fff}
.skx-ib:disabled{opacity:.3;cursor:default}
.skx-zoom{min-width:52px;height:36px;border:1px solid var(--line);background:#fff;font-family:var(--sans);font-size:12.5px;font-variant-numeric:tabular-nums;cursor:pointer;color:var(--ink)}
.skx-opts{display:flex;flex-wrap:wrap;align-items:center;gap:8px 18px;padding:8px 10px;border-bottom:1px solid var(--line2);font-size:13px;min-height:50px}
.skx-opt{display:inline-flex;align-items:center;gap:7px;white-space:nowrap}
.skx-opt>b{font-weight:500;font-size:12.5px;color:var(--sub)}
.skx input[type=range]{width:120px;height:26px;padding:0;margin:0;border:0;background:transparent;accent-color:var(--ink);cursor:pointer}
.skx-num{min-width:40px;font-size:12.5px;font-variant-numeric:tabular-nums;color:var(--ink)}
.skx-dot{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border:1px solid var(--line2);background:repeating-conic-gradient(#f2f2f2 0 25%,#fff 0 50%) 0 0/10px 10px}
.skx-dot i{display:block;border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,.25)}
.skx-seg{display:inline-flex;border:1px solid #9a9a9a}
.skx-seg button{padding:5px 10px;border:0;border-left:1px solid #ddd;background:#fff;font-family:var(--sans);font-size:12.5px;color:var(--ink);cursor:pointer}
.skx-seg button:first-child{border-left:0}
.skx-seg button.on{background:var(--ink);color:#fff}
.skx-chip{padding:5px 11px;border:1px solid #9a9a9a;background:#fff;font-family:var(--sans);font-size:12.5px;color:var(--ink);cursor:pointer}
.skx-chip.on{background:var(--ink);border-color:var(--ink);color:#fff}
.skx-tip{font-size:12.5px;color:var(--sub)}
.skx-colors{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;padding:8px 10px;border-bottom:1px solid var(--line2)}
.skx-colors.dim .skx-pal,.skx-colors.dim .skx-cur{opacity:.45}
.skx-cur{position:relative;display:inline-block;width:38px;height:38px;border:1px solid #9a9a9a;box-shadow:inset 0 0 0 2px #fff;cursor:pointer}
.skx-cur input[type=color]{position:absolute;inset:0;width:100%;height:100%;opacity:0;padding:0;border:0;cursor:pointer}
.skx-hex{font-size:12px;color:var(--sub);font-variant-numeric:tabular-nums;min-width:58px}
.skx-pal{display:inline-flex;flex-wrap:wrap;gap:4px;align-items:center}
.skx-pal>b{font-weight:500;font-size:12.5px;color:var(--sub);margin-right:2px}
.skx-sw{width:26px;height:26px;padding:0;border:1px solid rgba(0,0,0,.22);cursor:pointer}
.skx-sw.on{outline:2px solid var(--seal);outline-offset:1px}
.skx-sw.paper{width:30px}
.skx-main{position:relative}
.skx-view{position:relative;width:100%;max-height:72vh;max-height:min(72vh,calc(100vh - 250px));min-height:220px;overflow:hidden;background:#e4e3df;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;cursor:crosshair}
.skx-view.tool-hand,.skx-view.space{cursor:grab}
.skx-view.panning{cursor:grabbing}
.skx-view.tool-text{cursor:text}
.skx-stage{position:absolute;left:0;top:0;transform-origin:0 0;box-shadow:0 0 0 1px rgba(0,0,0,.2),0 3px 16px rgba(0,0,0,.14)}
.skx-paper,.skx-host{position:absolute;inset:0}
.skx-host canvas{position:absolute;left:0;top:0;width:100%;height:100%}
.skx-guide{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none}
.skx-cursor{position:absolute;left:0;top:0;display:none;border-radius:50%;border:1px solid rgba(0,0,0,.75);box-shadow:0 0 0 1px rgba(255,255,255,.85);pointer-events:none}
.skx .skx-textin,.skx .skx-textin:focus{position:absolute;z-index:4;width:auto;min-width:140px;padding:0;margin:0;border:0;outline:1px dashed #0069be;outline-offset:2px;background:rgba(255,255,255,.72);font-family:'Noto Sans KR','IBM Plex Sans KR',sans-serif;font-weight:500;line-height:1}
.skx-load{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.6);font-size:13px;color:var(--sub)}
.skx-toast{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);max-width:calc(100% - 24px);padding:7px 12px;background:rgba(17,17,17,.88);color:#fff;font-size:12.5px;line-height:1.5;pointer-events:none;z-index:5}
.skx-layers{position:absolute;right:8px;top:8px;z-index:6;width:268px;max-width:calc(100% - 16px);max-height:calc(100% - 16px);overflow:auto;background:#fff;border:1px solid var(--ink);box-shadow:0 6px 24px rgba(0,0,0,.18);font-size:13px}
.skx-lhead{display:flex;align-items:center;gap:6px;padding:6px 6px 6px 10px;border-bottom:1px solid var(--line2)}
.skx-lhead b{flex:1;font-weight:700}
.skx-lbtn{display:inline-flex;align-items:center;gap:3px;height:32px;padding:0 9px 0 5px;border:1px solid #9a9a9a;background:#fff;font-family:var(--sans);font-size:12.5px;cursor:pointer;color:var(--ink)}
.skx-lbtn svg{width:16px;height:16px}
.skx-lbtn:disabled{opacity:.4;cursor:default}
.skx-layers ul{list-style:none;margin:0;padding:4px 0}
.skx-layers li{display:flex;align-items:center;gap:2px;padding:2px 4px}
.skx-layers li.on{background:#efefef;box-shadow:inset 3px 0 0 var(--seal)}
.skx-layers li .skx-ib{width:30px;height:30px}
.skx-layers li .skx-ib svg{width:17px;height:17px}
.skx-layers li .skx-ib.on{border-color:transparent;background:transparent}
.skx-lname{flex:1;min-width:0;display:flex;align-items:center;gap:7px;padding:3px 4px;border:0;background:transparent;font-family:var(--sans);font-size:13px;color:var(--ink);text-align:left;cursor:pointer}
.skx-lname span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.skx-lthumb{flex:0 0 auto;border:1px solid var(--line)}
.skx-lop{display:flex;padding:8px 10px;border-top:1px solid var(--line2);flex-wrap:wrap}
.skx-lop input[type=range]{flex:1;min-width:90px}
.skx-canvasbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px 18px;padding:8px 10px;border-top:1px solid var(--line2);font-size:13px}
.skx-canvasbar .skx-opt{gap:5px}
.skx-canvasbar .btn.small{white-space:nowrap}
.skx-foot{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:8px 10px;border-top:1px solid var(--line2)}
.skx-foot .mm-thumb{border:1px solid var(--line)}
.skx-help{flex:1 1 100%;font-size:12.5px;color:var(--sub)}
.skx-help summary{cursor:pointer;width:max-content}
.skx-help ul{margin:6px 0 0;padding-left:18px;line-height:1.7}
.skx select{width:auto}
/* 크게 그리기: 화면 가득 */
.skx.skx-full{position:fixed;inset:0;z-index:5000;height:100vh;height:100dvh;border:0;overflow:auto}
.skx-full .skx-main{flex:1 1 auto;min-height:260px;display:flex}
.skx-full .skx-view{flex:1;height:auto;max-height:none;aspect-ratio:auto!important}
.skx-full .skx-help{display:none}
@media (max-width:640px){
  .skx-tool{min-width:44px;height:48px;font-size:11px}
  .skx-view-grp{margin-left:0}
  .skx input[type=range]{width:96px}
  .skx-opts,.skx-canvasbar{gap:8px 12px}
  .skx-layers{width:calc(100% - 16px)}
}
/* 학습지 입력 잠금 */
.ws-lockset:disabled .skx-view{pointer-events:none;cursor:not-allowed}
.ws-lockset:disabled .skx-cur{pointer-events:none}
`;

export function SketchStyle() {
  return <style>{SKETCH_CSS}</style>;
}
