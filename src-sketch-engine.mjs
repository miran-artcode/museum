/* ============================================================
   디지털 에스키스 그리기 엔진 (화면은 src-sketch.jsx, 순수 계산은 src-sketch-core.mjs)
   ------------------------------------------------------------
   · 레이어마다 캔버스 하나 + base(되돌리기 한도 밖으로 밀려난 작업을 굳힌 그림).
   · 작업(op)은 전부 기록한다. 픽셀 작업(획·도형·글자·사진·채우기·번짐·변형·조정·지우기)은
     그리기 직전에 그 작업이 건드릴 사각형을 떠 두었다가(_pre) 되돌릴 때 그 자리에 다시 놓는다.
     _pre가 한도(PRE_MAX)에 밀려 버려진 작업은 base 위에 남은 작업을 다시 그려 되돌린다(replay).
     구조 작업(레이어 추가·삭제·순서·속성·합치기·종이)은 그 작업이 들고 있는 이전 상태로 되돌린다.
   · 획은 scratch 캔버스에 불투명하게 그린 뒤 획 불투명도로 레이어에 합성한다. 실시간 미리보기와
     다시 그리기가 같은 경로를 타므로 되돌린 뒤 다시 실행해도 픽셀이 같다. 흩뿌림은 작업에 적힌
     씨앗으로 난수를 만들고, 연필·목탄의 결은 캔버스 좌표에 고정된 무늬를 쓴다.
   · 과정 기록(log) = past(굳은 작업) + hist(되돌릴 수 있는 작업). 「과정 다시 보기」는 같은 엔진을
     화면 밖에서 하나 더 만들어 기록을 처음부터 실행한다(runLog).
   작업 모양
     { kind: "stroke", tool, color, size, opacity, dash, b: {붓 설정}, g: 필압 곡선, seed, pts: [x,y,p,...], tl?: [기울기...], sym?, sel?, alock?, layers: [id], t }
     { kind: "shape", shape: line|arrow|rect|ellipse|poly, (x0,y0,x1,y1 | cx,cy,rx,ry,rot | cx,cy,w,h,rot | pts,closed), color, size, opacity, dash, fill, sym?, sel?, alock? }
     { kind: "text", x, y, text, size, font, color, opacity }      { kind: "image", img, x, y, w, h }
     { kind: "fill", x, y, color, opacity, tol, ref: layer|all }   { kind: "smudge", size, b, pts }
     { kind: "transform", m: [a,b,c,d,e,f] }                        { kind: "adjust", type, params, seed }
     { kind: "clear" }
     { kind: "ladd"|"ldel"|"lmove"|"lset"|"ldup"|"lmerge"|"lflat"|"paper" }   (구조 작업)
     { kind: "new"|"base"|"canvas" }                                           (기록 전용: 캔버스 만들기·불러온 그림·크기 바꾸기)
   "_"로 시작하는 속성(_L, _mask, _img 등)은 메모리에만 있고 기록을 꾸릴 때 빠진다.
   ============================================================ */
import {
  clamp, mulberry32, floodMask, dilateMask, maskBBox, symMatrices, packOps, unpackOps,
  adjustHSL, adjustBC, invertRGB, grayscale, posterize, addNoise, boxBlur, sharpen,
} from "./src-sketch-core.mjs";

export const MAX_LAYERS = 8;
export const HISTORY_MAX = 100;
const PRE_MAX = 80 * 1024 * 1024;   // 되돌리기용 이전 그림(_pre)을 들고 있는 한도(바이트)
export const PART_MAX = 900000;   // media 규칙: 문서 값(문자열) 1,000,000자 미만(조각 머리말을 붙일 여유를 둔다)
export const LIMIT = 950000;

export const RATIOS = [
  { k: "wide", name: "가로", W: 1500, H: 1000 },
  { k: "tall", name: "세로", W: 1000, H: 1500 },
  { k: "square", name: "정사각", W: 1250, H: 1250 },
  { k: "hd", name: "16:9", W: 1680, H: 945 },
];
export const PAPERS = [
  { k: "white", name: "흰색", c: "#FFFFFF" },
  { k: "cream", name: "미색", c: "#F4EEDF" },
  { k: "gray", name: "회색", c: "#BDBAB3" },
  { k: "kraft", name: "크라프트", c: "#C4A37A" },
  { k: "black", name: "검정", c: "#232323" },
];
export const paperColor = (k) => (PAPERS.find((p) => p.k === k) || PAPERS[0]).c;

/* 혼합 모드: CSS mix-blend-mode 이름과 canvas globalCompositeOperation 이름이 같다(보통만 source-over) */
export const BLENDS = [
  ["normal", "보통"], ["multiply", "곱하기"], ["darken", "어둡게"], ["color-burn", "색상 번"],
  ["screen", "스크린"], ["lighten", "밝게"], ["color-dodge", "색상 닷지"],
  ["overlay", "오버레이"], ["soft-light", "소프트 라이트"], ["hard-light", "하드 라이트"],
  ["difference", "차이"], ["hue", "색상"], ["saturation", "채도"], ["color", "색(색상+채도)"], ["luminosity", "광도"],
];
const gco = (blend) => (!blend || blend === "normal" ? "source-over" : blend);

/* 붓 표. eng: path 선 · grain 결 있는 선 · stamp 찍어 쌓기 · nib 납작한 촉 · spray 흩뿌리기 · smudge 번짐
   d: 기본 설정, adj: 「브러시 설정」에서 바꿀 수 있는 항목 */
export const BRUSHES = [
  { k: "pencil", name: "연필", key: "1", eng: "grain", tex: "fine", min: 1, max: 40, tilt: true, dens: [0.2, 0.8],
    d: { size: 4, op: 0.9, pSize: 0.4, pOp: 0.8, taper: 0 }, adj: ["pSize", "pOp"] },
  { k: "pen", name: "펜", key: "2", eng: "path", min: 1, max: 40, dash: true,
    d: { size: 3, op: 1, pSize: 0.65, taper: 0 }, adj: ["pSize", "taper"] },
  { k: "brush", name: "붓펜", key: "3", eng: "path", min: 2, max: 80, speed: true,
    d: { size: 14, op: 1, pSize: 0.88, taper: 0.8 }, adj: ["pSize", "taper"] },
  { k: "marker", name: "마커", key: "4", eng: "path", min: 4, max: 120,
    d: { size: 26, op: 0.45, pSize: 0, taper: 0 }, adj: ["pSize"] },
  { k: "flat", name: "평붓", key: "5", eng: "nib", min: 4, max: 160,
    d: { size: 34, op: 0.9, pSize: 0.3, angle: 35, aspect: 0.16 }, adj: ["pSize", "angle", "aspect"] },
  { k: "water", name: "수채", key: "6", eng: "stamp", wet: true, min: 8, max: 400,
    d: { size: 70, op: 0.5, flow: 0.06, hard: 0.35, spacing: 0.06, scatter: 0, pSize: 0.5, pOp: 0.5 }, adj: ["flow", "hard", "spacing", "scatter", "pSize", "pOp"] },
  { k: "charcoal", name: "목탄", key: "7", eng: "grain", tex: "coarse", min: 4, max: 160, tilt: true, dens: [0.15, 0.7],
    d: { size: 24, op: 0.9, pSize: 0.45, pOp: 0.8, taper: 0 }, adj: ["pSize", "pOp"] },
  { k: "pastel", name: "파스텔", key: "8", eng: "grain", tex: "pastel", min: 6, max: 200, tilt: true, dens: [0.45, 0.92],
    d: { size: 46, op: 0.8, pSize: 0.25, pOp: 0.6, taper: 0 }, adj: ["pSize", "pOp"] },
  { k: "air", name: "에어브러시", key: "9", eng: "stamp", min: 10, max: 400,
    d: { size: 90, op: 0.4, flow: 0.08, hard: 0, spacing: 0.06, scatter: 0, pSize: 0.65, pOp: 0.7 }, adj: ["flow", "hard", "spacing", "scatter", "pSize", "pOp"] },
  { k: "spray", name: "스프레이", key: "", eng: "spray", min: 10, max: 400,
    d: { size: 80, op: 0.9, flow: 0.5, spacing: 0.12, pSize: 0.4 }, adj: ["flow", "spacing", "pSize"] },
  { k: "eraser", name: "지우개", key: "e", eng: "stamp", erase: true, min: 2, max: 400,
    d: { size: 36, op: 1, flow: 1, hard: 0.9, spacing: 0.05, scatter: 0, pSize: 0.4, pOp: 0 }, adj: ["flow", "hard", "pSize", "pOp"] },
  { k: "smudge", name: "번짐", key: "s", eng: "smudge", min: 6, max: 300,
    d: { size: 44, op: 1, strength: 0.7, hard: 0.3 }, adj: ["strength", "hard"] },
];
export const BRUSH = Object.fromEntries(BRUSHES.map((b) => [b.k, b]));
/* 「브러시 설정」 항목 이름과 범위 [이름, 최소, 최대, 단위 배수(화면 표시용), 접미사] */
export const BRUSH_PARAMS = {
  flow: ["농도", 0.01, 1, 100, "%"], hard: ["가장자리 선명도", 0, 1, 100, "%"], spacing: ["찍는 간격", 0.02, 0.6, 100, "%"],
  scatter: ["흩뿌림", 0, 1.5, 100, "%"], pSize: ["필압에 따른 굵기", 0, 1, 100, "%"], pOp: ["필압에 따른 농도", 0, 1, 100, "%"],
  taper: ["끝 가늘어짐", 0, 1, 100, "%"], angle: ["촉 각도", 0, 180, 1, "°"], aspect: ["촉 두께", 0.05, 1, 100, "%"],
  strength: ["번짐 세기", 0.05, 0.95, 100, "%"],
};

export const TEXT_FONTS = [["sans", "고딕"], ["serif", "명조"], ["mono", "고정폭"]];
const FONT_STACK = {
  sans: "500 SIZEpx 'Noto Sans KR','IBM Plex Sans KR',sans-serif",
  serif: "500 SIZEpx 'Noto Serif KR','Nanum Myeongjo',serif",
  mono: "500 SIZEpx 'IBM Plex Mono','D2Coding',monospace",
};
export const textFont = (size, font) => (FONT_STACK[font] || FONT_STACK.sans).replace("SIZE", size);

export const ADJUSTS = [
  { k: "hsl", name: "색상·채도·명도", params: [["h", "색상", -180, 180, 0, "°"], ["s", "채도", -100, 100, 0, ""], ["l", "명도", -100, 100, 0, ""]] },
  { k: "bc", name: "밝기·대비", params: [["b", "밝기", -100, 100, 0, ""], ["c", "대비", -100, 100, 0, ""]] },
  { k: "blur", name: "흐림", params: [["r", "반지름", 0, 40, 6, "px"]] },
  { k: "sharpen", name: "선명하게", params: [["a", "세기", 0, 100, 40, ""]] },
  { k: "noise", name: "노이즈", params: [["a", "세기", 0, 100, 25, ""]] },
  { k: "poster", name: "색 단계 줄이기", params: [["n", "단계", 2, 12, 4, ""]] },
  { k: "gray", name: "흑백", params: [] },
  { k: "invert", name: "색 반전", params: [] },
];
function runAdjust(data, W, H, type, p, seed, sel) {
  if (type === "hsl") adjustHSL(data, p, sel);
  else if (type === "bc") adjustBC(data, p, sel);
  else if (type === "blur") boxBlur(data, W, H, p.r, sel);
  else if (type === "sharpen") sharpen(data, W, H, p.a, sel);
  else if (type === "noise") addNoise(data, W, H, p.a, seed || 1, sel);
  else if (type === "poster") posterize(data, p.n, sel);
  else if (type === "gray") grayscale(data, sel);
  else if (type === "invert") invertRGB(data, sel);
}

const PIXEL_KINDS = new Set(["stroke", "shape", "text", "image", "fill", "smudge", "transform", "adjust", "clear", "lmerge", "lflat"]);
const SHAPE_NAMES = { line: "직선", arrow: "화살표", rect: "사각형", ellipse: "타원", poly: "다각형" };
const LSET_NAMES = { op: "레이어 불투명도", vis: "레이어 보이기", name: "레이어 이름", blend: "혼합 모드", alock: "알파 잠금", lock: "레이어 잠금" };
/* 기록 창에 보일 작업 이름 */
export function opLabel(op) {
  switch (op.kind) {
    case "stroke": return (BRUSH[op.tool] || {}).name || "획";
    case "smudge": return "번짐";
    case "shape": return "도형: " + (SHAPE_NAMES[op.shape] || "도형") + (op.quick ? " (바로잡기)" : "");
    case "text": return "글자";
    case "image": return op.paste ? "붙여넣기" : "사진";
    case "fill": return "채우기";
    case "transform": return "변형";
    case "adjust": return "조정: " + ((ADJUSTS.find((a) => a.k === op.type) || {}).name || "");
    case "clear": return op.sel ? "선택 영역 지우기" : op.layers && op.layers.length > 1 ? "모두 지우기" : "레이어 비우기";
    case "ladd": return "레이어 추가";
    case "ldel": return "레이어 지우기";
    case "lmove": return "레이어 순서";
    case "lset": {
      const k = Object.keys(op.patch || {})[0], v = (op.patch || {})[k];
      if (k === "vis") return v ? "레이어 보이기" : "레이어 숨기기";
      if (k === "lock") return v ? "레이어 잠금" : "레이어 잠금 해제";
      if (k === "alock") return v ? "알파 잠금" : "알파 잠금 해제";
      return LSET_NAMES[k] || "레이어 설정";
    }
    case "ldup": return "레이어 복제";
    case "lmerge": return "아래 레이어와 합치기";
    case "lflat": return "모두 합치기";
    case "paper": return "종이 색";
    case "canvas": return op.type === "resize" ? "캔버스 크기" : op.type === "rot90" ? "캔버스 회전" : "캔버스 뒤집기";
    case "new": return "새 캔버스";
    case "base": return "불러온 그림";
    default: return "작업";
  }
}
/* 과정 기록 요약: 작업 수, 획 수, 그린 시간(작업 사이 간격이 60초 넘으면 쉬는 시간으로 보고 뺀다), 쓴 도구 */
export function logStats(ops) {
  const out = { n: 0, strokes: 0, ms: 0, tools: {} };
  let last = 0;
  for (const op of ops || []) {
    if (op.kind === "new" || op.kind === "base") { last = op.t || last; continue; }
    out.n++;
    if (op.kind === "stroke" || op.kind === "smudge") out.strokes++;
    const name = op.kind === "stroke" || op.kind === "shape" || op.kind === "text" || op.kind === "fill" || op.kind === "smudge" ? opLabel(op).split(":")[0] : null;
    if (name) out.tools[name] = (out.tools[name] || 0) + 1;
    if (op.t && last) out.ms += Math.min(60000, Math.max(0, op.t - last));
    if (op.t) last = op.t;
  }
  return out;
}

const mkCanvas = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
const copyCanvas = (src) => { const c = mkCanvas(src.width, src.height); c.getContext("2d").drawImage(src, 0, 0); return c; };
const freeCanvas = (c) => { if (c && c.width) { c.width = 0; c.height = 0; } };
const pow2 = (n) => { let p = 256; while (p < n) p *= 2; return p; };
const hexRgb = (h) => { const n = parseInt(String(h).slice(1), 16) || 0; return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const rgbHex = (r, g, b) => "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("").toUpperCase();
const smooth01 = (t) => t * t * (3 - 2 * t);

export function dashArr(dash, w) {
  if (dash === "dash") return [w * 4 + 8, w * 2.5 + 7];
  if (dash === "dot") return [0.1, w * 2 + 6];
  return [];
}
export function loadImg(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error("image"));
    im.src = src;
  });
}

/* ---------- 종이 결 (연필·목탄·파스텔) ---------- */

const GN = 256;
const grainCache = {};
/* 흐린 잡음의 순위(0~1). 문턱값이 곧 칠해지는 픽셀 비율이라 필압이 농도가 된다 */
function grainRank(tex) {
  if (grainCache[tex]) return grainCache[tex];
  let s = tex === "fine" ? 0x2545f491 : tex === "pastel" ? 0x51ed270b : 0x9e3779b9;
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
  if (tex === "pastel") b = blur(blur(b, 3, true), 1, false); // 가로로 긴 결
  const mix = tex === "fine" ? 0.35 : tex === "pastel" ? 0.3 : 0.15;
  const val = new Float32Array(GN * GN);
  for (let i = 0; i < val.length; i++) val[i] = b[i] * (1 - mix) + raw[i] * mix;
  const idx = Array.from({ length: GN * GN }, (_, i) => i).sort((a, c) => val[a] - val[c]);
  const rank = new Float32Array(GN * GN);
  idx.forEach((k, i) => { rank[k] = i / idx.length; });
  return (grainCache[tex] = rank);
}

/* ---------- 획 그리기 ---------- */

/* pts: [x, y, 필압, ...]. final이면 끝까지 다 그리고(꼬리·끝 가늘어짐 포함) 다시 그리기와 같은 결과.
   m: 대칭 그리기의 변환 행렬(없으면 그대로), si: 대칭 순번(난수 씨앗을 달리한다) */
function makeRenderer(eng, op, final, m, si = 0) {
  const T = BRUSH[op.tool] || BRUSH.pen;
  const b = { ...T.d, ...(op.b || {}) };
  const ctx = eng.sctx;
  const pts = op.pts, tl = op.tl;
  const X = m ? (k) => m[0] * pts[3 * k] + m[2] * pts[3 * k + 1] + m[4] : (k) => pts[3 * k];
  const Y = m ? (k) => m[1] * pts[3 * k] + m[3] * pts[3 * k + 1] + m[5] : (k) => pts[3 * k + 1];
  const P = (k) => pts[3 * k + 2];
  const TL = tl && T.tilt ? (k) => tl[k] || 0 : () => 0;
  const g = 0.75 * (op.g || 1);
  const pc = (p) => Math.pow(clamp(p, 0.02, 1), g);
  const rnd = mulberry32(((op.seed | 0) || 1) + si * 7919);
  const pSize = b.pSize || 0, pOp = b.pOp || 0;
  const dist = [0];
  const Ls = op.size * 2.5 * (b.taper || 0);
  const spacing = Math.max(0.75, op.size * (b.spacing || 0.06));
  let done = 0, dashOff = 0, next = 0, total = 0;
  const dashed = T.dash && op.dash && op.dash !== "solid";
  const na = ((b.angle || 0) * Math.PI) / 180, ncx = Math.cos(na), ncy = Math.sin(na);

  const wAt = (k) => {
    let w = op.size * (1 - pSize + pSize * pc(P(k))) * (1 + 2 * TL(k));
    if (Ls > 0) {
      if (final) {
        // 가늘어지는 길이와 하한을 획 길이에 맞춘다: 점은 온 굵기, 2×Ls보다 긴 획은 양 끝 0.2배까지
        const Lt = Math.min(Ls, total / 2), lo = 1 - 0.8 * Math.min(1, total / (2 * Ls));
        if (Lt > 0) w *= (lo + (1 - lo) * smooth01(Math.min(1, dist[k] / Lt))) * (lo + (1 - lo) * smooth01(Math.min(1, (total - dist[k]) / Lt)));
      } else if (total > 0) w *= 0.2 + 0.8 * smooth01(Math.min(1, dist[k] / Ls));
    }
    return Math.max(0.4, w);
  };
  const dens = (p, t) => (T.dens[0] + (T.dens[1] - T.dens[0]) * (1 - pOp + pOp * pc(p))) * (1 - 0.45 * t);
  const dab = (x, y, p) => {
    const r = (op.size / 2) * (1 - pSize + pSize * pc(p));
    if (r < 0.2) return;
    if (b.scatter) { const a = rnd() * Math.PI * 2, d = rnd() * b.scatter * op.size; x += Math.cos(a) * d; y += Math.sin(a) * d; }
    ctx.globalAlpha = clamp((b.flow || 1) * (1 - pOp + pOp * pc(p)), 0, 1);
    ctx.drawImage(eng.sprite(T.erase ? "#000000" : op.color, b.hard || 0, T.wet), x - r, y - r, r * 2, r * 2);
  };
  const spray = (x, y, p) => {
    const R = (op.size / 2) * (1 - pSize + pSize * pc(p));
    const n = Math.max(2, Math.round(2 + op.size / 9));
    ctx.globalAlpha = clamp(b.flow || 0.5, 0, 1);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * R, rr = clamp(op.size * 0.018, 0.5, 2.2) * (0.5 + rnd());
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, rr, 0, Math.PI * 2); ctx.fill();
    }
  };
  const dot = (k) => {
    const w = wAt(k);
    if (T.eng === "stamp") return dab(X(k), Y(k), P(k));
    if (T.eng === "spray") return spray(X(k), Y(k), P(k));
    if (T.eng === "nib") {
      const hx = (ncx * w) / 2, hy = (ncy * w) / 2;
      ctx.lineWidth = Math.max(1, w * (b.aspect || 0.16));
      ctx.beginPath(); ctx.moveTo(X(k) - hx, Y(k) - hy); ctx.lineTo(X(k) + hx, Y(k) + hy); ctx.stroke();
      return;
    }
    const path = (c) => { c.beginPath(); c.arc(X(k), Y(k), w / 2, 0, Math.PI * 2); c.fill(); };
    if (T.eng === "grain") eng.grainPaint(path, X(k), Y(k), X(k), Y(k), w, dens(P(k), TL(k)), T.tex, op.color);
    else path(ctx);
  };
  const quad = (ax, ay, cx, cy, bx, by, w, p, t) => {
    if (T.eng === "grain") {
      const path = (c) => { c.beginPath(); c.moveTo(ax, ay); c.quadraticCurveTo(cx, cy, bx, by); c.stroke(); };
      eng.grainPaint(path, Math.min(ax, cx, bx), Math.min(ay, cy, by), Math.max(ax, cx, bx), Math.max(ay, cy, by), w, dens(p, t), T.tex, op.color);
      return;
    }
    ctx.lineWidth = w;
    if (dashed) {
      ctx.lineDashOffset = dashOff;
      dashOff += (Math.hypot(cx - ax, cy - ay) + Math.hypot(bx - cx, by - cy) + Math.hypot(bx - ax, by - ay)) / 2;
    }
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(cx, cy, bx, by); ctx.stroke();
  };
  /* 납작한 촉: 앞 점과 뒤 점의 촉 선분을 이은 사각형을 채운다 */
  const nibSeg = (i) => {
    const w0 = wAt(i - 1), w1 = wAt(i);
    const ax = X(i - 1), ay = Y(i - 1), bx = X(i), by = Y(i);
    ctx.beginPath();
    ctx.moveTo(ax - (ncx * w0) / 2, ay - (ncy * w0) / 2); ctx.lineTo(ax + (ncx * w0) / 2, ay + (ncy * w0) / 2);
    ctx.lineTo(bx + (ncx * w1) / 2, by + (ncy * w1) / 2); ctx.lineTo(bx - (ncx * w1) / 2, by - (ncy * w1) / 2);
    ctx.closePath(); ctx.fill();
    ctx.lineWidth = Math.max(1, ((w0 + w1) / 2) * (b.aspect || 0.16));
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  };
  const stepSeg = (i, fn) => {
    const ax = X(i - 1), ay = Y(i - 1), len = dist[i] - dist[i - 1];
    if (len <= 0) return;
    while (next <= len) {
      const t = next / len;
      fn(ax + (X(i) - ax) * t, ay + (Y(i) - ay) * t, P(i - 1) + (P(i) - P(i - 1)) * t);
      next += spacing;
    }
    next -= len;
  };

  function add() {
    const n = pts.length / 3;
    for (let k = dist.length; k < n; k++) dist.push(dist[k - 1] + Math.hypot(X(k) - X(k - 1), Y(k) - Y(k - 1)));
    total = dist[n - 1] || 0;
    ctx.save();
    const col = T.erase ? "#000000" : op.color;
    ctx.strokeStyle = col; ctx.fillStyle = col;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (dashed) ctx.setLineDash(dashArr(op.dash, op.size));
    if (done === 0 && n >= 1) {
      // 실시간에는 누르자마자 점을 보이고, 최종 그리기에서는 점 하나짜리 획만 점으로 그린다
      if (!final || n === 1 || T.eng === "stamp" || T.eng === "spray") { dot(0); if (T.eng === "stamp" || T.eng === "spray") next = spacing; }
      done = 1;
    }
    for (let i = done; i < n; i++) {
      if (T.eng === "stamp") { stepSeg(i, dab); continue; }
      if (T.eng === "spray") { stepSeg(i, spray); continue; }
      if (T.eng === "nib") { nibSeg(i); continue; }
      const ax = i === 1 ? X(0) : (X(i - 2) + X(i - 1)) / 2, ay = i === 1 ? Y(0) : (Y(i - 2) + Y(i - 1)) / 2;
      quad(ax, ay, X(i - 1), Y(i - 1), (X(i - 1) + X(i)) / 2, (Y(i - 1) + Y(i)) / 2, (wAt(i - 1) + wAt(i)) / 2, (P(i - 1) + P(i)) / 2, (TL(i - 1) + TL(i)) / 2);
    }
    if (final && n >= 2 && (T.eng === "path" || T.eng === "grain")) {
      const k = n - 1, mx = (X(k - 1) + X(k)) / 2, my = (Y(k - 1) + Y(k)) / 2;
      quad(mx, my, (mx + X(k)) / 2, (my + Y(k)) / 2, X(k), Y(k), wAt(k), P(k), TL(k));
    }
    ctx.restore();
    done = Math.max(done, n);
  }
  return { add };
}

/* 대칭이면 행렬마다 하나씩 */
function makeRenderers(eng, op, final) {
  const mats = op.sym ? symMatrices(op.sym.kind, op.sym.cx, op.sym.cy, op.sym.n) : [null];
  const rs = mats.map((m, i) => makeRenderer(eng, op, final, i === 0 ? null : m, i));
  return { add() { for (const r of rs) r.add(); } };
}

/* 번짐: 붓 밑의 물감을 떠서 다음 위치에 옮겨 칠한다. 레이어에 바로 그린다 */
function makeSmudger(eng, op, T) {
  const b = { ...BRUSH.smudge.d, ...(op.b || {}) };
  const pts = op.pts, c = T.ctx;
  const D = Math.max(4, Math.ceil(op.size)), R = D / 2;
  const buf = mkCanvas(D, D), bctx = buf.getContext("2d");
  const tmp = mkCanvas(D, D), tctx = tmp.getContext("2d");
  const mask = eng.sprite("#000000", b.hard || 0, false);
  const str = clamp(b.strength, 0.05, 0.95);
  const spacing = Math.max(1, op.size * 0.07);
  const pc = (p) => Math.pow(clamp(p, 0.02, 1), 0.75 * (op.g || 1));
  let done = 0, next = 0;
  const pickup = (x, y, a) => {
    bctx.globalCompositeOperation = a >= 1 ? "copy" : "source-over";
    bctx.globalAlpha = a;
    bctx.drawImage(T.cv, Math.round(x - R), Math.round(y - R), D, D, 0, 0, D, D);
  };
  const stamp = (x, y, p) => {
    tctx.globalCompositeOperation = "copy"; tctx.globalAlpha = 1; tctx.drawImage(buf, 0, 0);
    tctx.globalCompositeOperation = "destination-in"; tctx.drawImage(mask, 0, 0, D, D);
    c.save(); c.globalCompositeOperation = "source-over"; c.globalAlpha = str * (0.5 + 0.5 * pc(p));
    c.drawImage(tmp, Math.round(x - R), Math.round(y - R));
    c.restore();
    pickup(x, y, 1 - str * 0.9);
  };
  function add() {
    const n = pts.length / 3;
    if (done === 0 && n >= 1) { pickup(pts[0], pts[1], 1); done = 1; next = spacing; }
    for (let i = done; i < n; i++) {
      const ax = pts[3 * i - 3], ay = pts[3 * i - 2], bx = pts[3 * i], by = pts[3 * i + 1];
      const len = Math.hypot(bx - ax, by - ay);
      if (len <= 0) continue;
      while (next <= len) {
        const t = next / len;
        stamp(ax + (bx - ax) * t, ay + (by - ay) * t, pts[3 * i - 1] + (pts[3 * i + 2] - pts[3 * i - 1]) * t);
        next += spacing;
      }
      next -= len;
    }
    done = Math.max(done, n);
  }
  return { add };
}

/* 작업이 건드리는 사각형 { x, y, w, h } (캔버스 좌표, 정수). 알 수 없으면 null(레이어 전체) */
function opBBox(eng, op) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, pad = 4;
  const add = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
  if (op.kind === "stroke" || op.kind === "smudge") {
    const b = { ...((BRUSH[op.tool] || {}).d || {}), ...(op.b || {}) };
    pad += op.size * (1.6 + (b.scatter || 0));
    for (let i = 0; i + 2 < op.pts.length; i += 3) add(op.pts[i], op.pts[i + 1]);
  } else if (op.kind === "shape") {
    pad += op.size * 4 + 16;
    if (op.cx != null) { const r = op.shape === "rect" ? Math.hypot(op.w, op.h) / 2 : Math.max(op.rx, op.ry); add(op.cx - r, op.cy - r); add(op.cx + r, op.cy + r); }
    else if (op.shape === "poly") { for (let i = 0; i + 1 < (op.pts || []).length; i += 2) add(op.pts[i], op.pts[i + 1]); }
    else { add(op.x0, op.y0); add(op.x1, op.y1); }
  } else if (op.kind === "text") {
    const c = eng.sctx;
    c.save(); c.font = textFont(op.size, op.font);
    const lines = String(op.text).split("\n");
    let w = 0;
    for (const ln of lines) w = Math.max(w, c.measureText(ln).width);
    c.restore();
    pad += op.size * 0.6;
    add(op.x, op.y); add(op.x + w, op.y + lines.length * op.size * 1.3);
  } else if (op.kind === "fill") {
    const m = op._mask;
    if (!m) return null;
    if (!m.w) return { x: 0, y: 0, w: 0, h: 0 };
    pad = 0; add(m.x, m.y); add(m.x + m.w, m.y + m.h);
  } else if (op.kind === "image") {
    pad = 2; add(op.x, op.y); add(op.x + op.w, op.y + op.h);
  } else return null;
  if (x1 < x0) return { x: 0, y: 0, w: 0, h: 0 };
  x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  if (op.sym) {
    const cs = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]];
    for (const m of symMatrices(op.sym.kind, op.sym.cx, op.sym.cy, op.sym.n)) {
      for (const [x, y] of cs) { const px = m[0] * x + m[2] * y + m[4], py = m[1] * x + m[3] * y + m[5]; if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; }
    }
  }
  const X0 = Math.max(0, Math.floor(x0)), Y0 = Math.max(0, Math.floor(y0)), X1 = Math.min(eng.W, Math.ceil(x1)), Y1 = Math.min(eng.H, Math.ceil(y1));
  return { x: X0, y: Y0, w: Math.max(0, X1 - X0), h: Math.max(0, Y1 - Y0) };
}

function shapePath(ctx, op) {
  ctx.beginPath();
  if (op.shape === "rect") {
    if (op.cx != null) {
      ctx.save(); ctx.translate(op.cx, op.cy); ctx.rotate(op.rot || 0);
      ctx.rect(-op.w / 2, -op.h / 2, op.w, op.h); ctx.restore();
    } else ctx.rect(Math.min(op.x0, op.x1), Math.min(op.y0, op.y1), Math.abs(op.x1 - op.x0), Math.abs(op.y1 - op.y0));
  } else if (op.shape === "ellipse") {
    if (op.cx != null) ctx.ellipse(op.cx, op.cy, Math.max(0.1, op.rx), Math.max(0.1, op.ry), op.rot || 0, 0, Math.PI * 2);
    else ctx.ellipse((op.x0 + op.x1) / 2, (op.y0 + op.y1) / 2, Math.abs(op.x1 - op.x0) / 2, Math.abs(op.y1 - op.y0) / 2, 0, 0, Math.PI * 2);
  } else if (op.shape === "poly") {
    const p = op.pts || [];
    for (let i = 0; i + 1 < p.length; i += 2) (i ? ctx.lineTo(p[i], p[i + 1]) : ctx.moveTo(p[i], p[i + 1]));
    if (op.closed) ctx.closePath();
  }
}
function drawShape(ctx, op) {
  ctx.save();
  ctx.strokeStyle = op.color; ctx.fillStyle = op.color;
  ctx.lineWidth = op.size; ctx.lineCap = "round";
  ctx.lineJoin = op.shape === "rect" ? "miter" : "round";
  if (op.dash && op.dash !== "solid") ctx.setLineDash(dashArr(op.dash, op.size));
  if (op.shape === "line" || op.shape === "arrow") {
    const { x0, y0, x1, y1 } = op;
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
  } else {
    shapePath(ctx, op);
    if (op.fill && (op.shape !== "poly" || op.closed)) ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
function drawText(ctx, op) {
  ctx.save();
  ctx.font = textFont(op.size, op.font);
  ctx.fillStyle = op.color;
  ctx.textBaseline = "top";
  String(op.text).split("\n").forEach((line, i) => ctx.fillText(line, op.x, op.y + i * op.size * 1.3));
  ctx.restore();
}

/* ============================================================
   엔진
   ============================================================ */

export class Engine {
  constructor() {
    this.W = 1500; this.H = 1000; this.paper = "white";
    this.layers = []; this.activeId = 0;
    this.hist = []; this.redo = []; this.past = [];
    this.seq = 1; this.nameSeq = 0; this.grpSeq = 1;
    this.host = null; this.live = null; this.sel = null; this.selCv = null;
    this.scratch = mkCanvas(this.W, this.H);
    this.scratch.className = "skx-scratch";
    this.sctx = this.scratch.getContext("2d");
    this.tmp = null; this.tctx = null; this.pat = {}; this.snap = null;
    this.gtmp = null; this.gctx = null;   // 결 있는 붓 전용 작은 캔버스
    this.sprites = new Map();
    this.pickCv = null;
    this.preBytes = 0;
  }

  /* ---------- 화면 붙이기 ---------- */

  attach(host) { this.host = host; this.mount(); }
  /* host 안의 캔버스 순서를 레이어 순서(아래 → 위)에 맞추고, 활성 레이어 바로 위에 scratch를, 맨 위에 선택 표시를 둔다 */
  mount() {
    const h = this.host;
    if (!h) return;
    const want = [];
    for (const L of this.layers) { want.push(L.cv); if (L.id === this.activeId) want.push(this.scratch); }
    if (this.sel && this.selCv) want.push(this.selCv);
    [...h.children].forEach((c) => { if (!want.includes(c)) h.removeChild(c); });
    want.forEach((c, i) => { if (h.children[i] !== c) h.insertBefore(c, h.children[i] || null); });
    for (const L of this.layers) {
      L.cv.style.opacity = String(L.op);
      L.cv.style.display = L.vis ? "" : "none";
      L.cv.style.mixBlendMode = L.blend || "normal";
    }
    const A = this.active();
    this.scratch.style.display = A && A.vis ? "" : "none";
    this.scratch.style.mixBlendMode = (A && A.blend) || "normal";
  }
  active() { return this.layers.find((L) => L.id === this.activeId) || this.layers[this.layers.length - 1]; }
  layer(id) { return this.layers.find((L) => L.id === id); }
  makeLayer(name, id) {
    const cv = mkCanvas(this.W, this.H);
    if (!name) name = "레이어 " + ++this.nameSeq;
    else { const m = /^레이어 (\d+)$/.exec(name); if (m) this.nameSeq = Math.max(this.nameSeq, +m[1]); }
    if (id) this.seq = Math.max(this.seq, id + 1); else id = this.seq++;
    return { id, name, op: 1, vis: true, blend: "normal", alock: false, lock: false, cv, ctx: cv.getContext("2d"), base: null, cow: false, ver: 0 };
  }
  setSize(W, H) {
    this.W = W; this.H = H;
    this.scratch.width = W; this.scratch.height = H;
    freeCanvas(this.tmp); freeCanvas(this.snap);
    this.tmp = null; this.tctx = null; this.snap = null;
    if (this.selCv) { this.selCv.width = W; this.selCv.height = H; }
    this.sel = null;
  }
  /* list: [{ id, name, op, vis, blend, alock, lock, img }] (없으면 빈 레이어 하나). 과정 기록(past)은 부르는 쪽이 정한다 */
  reset(W, H, list, activeIdx) {
    this.live = null;
    this.selSeen = null;
    this.freeAll();
    this.setSize(W, H);
    this.layers = []; this.hist = []; this.redo = []; this.past = []; this.nameSeq = 0; this.seq = 1;
    (list && list.length ? list : [{}]).slice(0, MAX_LAYERS).forEach((src) => {
      const L = this.makeLayer(src.name, src.id);
      L.op = typeof src.op === "number" ? clamp(src.op, 0, 1) : 1;
      L.vis = src.vis !== false;
      L.blend = BLENDS.some((b) => b[0] === src.blend) ? src.blend : "normal";
      L.alock = !!src.alock; L.lock = !!src.lock;
      if (src.img) { L.ctx.drawImage(src.img, 0, 0, W, H); L.cow = true; }
      this.layers.push(L);
    });
    const i = activeIdx != null && activeIdx >= 0 && activeIdx < this.layers.length ? activeIdx : this.layers.length - 1;
    this.activeId = this.layers[i].id;
    this.mount();
  }
  layersMeta() { return this.layers.map((L) => ({ id: L.id, name: L.name, op: Math.round(L.op * 100) / 100, vis: L.vis, blend: L.blend, alock: L.alock, lock: L.lock })); }
  log() { return this.past.concat(this.hist); }
  /* 레이어와 기록이 들고 있는 캔버스를 모두 놓는다(iOS Safari는 캔버스 총량 한도가 있다) */
  freeAll() {
    const ops = this.hist.concat(this.redo);
    this.hist = []; this.redo = [];
    for (const op of ops) this.release(op, true);
    const cur = this.sel;
    this.sel = null;
    for (const op of ops.concat(this.past)) this.dropSel(op.sel);
    this.sel = cur;
    for (const op of this.past) { if (op.img && op.img.getContext) freeCanvas(op.img); }
    for (const L of this.layers) { freeCanvas(L.cv); freeCanvas(L.base); }
    if (this.selSeen) { for (const v of this.selSeen.values()) { freeCanvas(v._mask); freeCanvas(v._m); } this.selSeen = null; }
    if (this.sel) { freeCanvas(this.sel._mask); for (const p of this.sel.parts || []) freeCanvas(p._m); }
    this.sel = null;
    this.preBytes = 0;
  }
  dispose() {
    this.live = null;
    this.freeAll();
    freeCanvas(this.scratch); freeCanvas(this.tmp); freeCanvas(this.snap); freeCanvas(this.selCv); freeCanvas(this.gtmp); freeCanvas(this.pickCv);
    this.sprites.forEach(freeCanvas); this.sprites.clear();
    this.tmp = null; this.tctx = null; this.gtmp = null; this.gctx = null; this.snap = null; this.pat = {};
    this.layers = []; this.hist = []; this.redo = []; this.past = [];
    if (this.host) [...this.host.children].forEach((c) => this.host.removeChild(c));
  }

  /* ---------- 캔버스 전체 작업 (되돌리기 기록을 비운다) ---------- */

  /* type: resize(W2,H2에 맞춰 줄이고 가운데) · rot90(dir ±1) · flipH · flipV */
  canvasOp(type, arg = {}) {
    const W = this.W, H = this.H;
    let W2 = W, H2 = H, draw;
    if (type === "resize") {
      W2 = arg.w; H2 = arg.h;
      const s = Math.min(W2 / W, H2 / H), dw = W * s, dh = H * s, dx = (W2 - dw) / 2, dy = (H2 - dh) / 2;
      draw = (x, src) => { x.imageSmoothingQuality = "high"; x.drawImage(src, dx, dy, dw, dh); };
    } else if (type === "rot90") {
      W2 = H; H2 = W;
      const d = arg.dir < 0 ? -1 : 1;
      draw = (x, src) => { x.translate(W2 / 2, H2 / 2); x.rotate((d * Math.PI) / 2); x.drawImage(src, -W / 2, -H / 2); };
    } else if (type === "flipH") draw = (x, src) => { x.translate(W, 0); x.scale(-1, 1); x.drawImage(src, 0, 0); };
    else if (type === "flipV") draw = (x, src) => { x.translate(0, H); x.scale(1, -1); x.drawImage(src, 0, 0); };
    else return;
    this.cancelLive();
    const olds = this.layers.map((L) => copyCanvas(L.cv));
    this.sealHistory();
    this.setSize(W2, H2);
    this.layers.forEach((L, i) => {
      L.cv.width = W2; L.cv.height = H2;
      L.ctx.save(); draw(L.ctx, olds[i]); L.ctx.restore();
      olds[i].width = 0;
      L.cow = true;
      L.ver++;
    });
    this.past.push({ kind: "canvas", type, w: W2, h: H2, dir: arg.dir, t: Date.now() });
    this.mount();
  }
  /* 되돌리기 기록을 굳힌다: 지금 그림이 곧 base, 기록은 past로 */
  sealHistory() {
    const hs = this.hist, rs = this.redo;
    this.hist = []; this.redo = [];
    for (const op of hs) { this.shrinkImg(op); this.past.push(op); this.release(op, true); }
    for (const op of rs) this.release(op, true);
    for (const op of hs.concat(rs)) this.dropSel(op.sel);
    for (const L of this.layers) { freeCanvas(L.base); L.base = null; L.cow = true; }
  }
  /* base를 필요할 때 만든다: cow면 지금 그림이 base다(레이어마다 캔버스를 두 장씩 들지 않으려고) */
  touch(L) {
    if (!L.cow) return;
    L.base = copyCanvas(L.cv);
    L.cow = false;
  }
  /* 작업이 들고 있던 캔버스를 놓는다. 지워진 레이어(_L·_order)는 기록 어디에서도 다시 쓰이지 않을 때만(all) 해제한다 */
  release(op, all) {
    this.freePre(op);
    if (op._mask) { freeCanvas(op._mask.cv); delete op._mask; }
    if (all) {
      const dead = (L) => L && !this.layers.includes(L) && !this.buried(L.id, op);
      if (op._L && dead(op._L)) { freeCanvas(op._L.cv); freeCanvas(op._L.base); }
      for (const o of op._order || []) if (dead(o.L)) { freeCanvas(o.L.cv); freeCanvas(o.L.base); }
    }
    delete op._L; delete op._order;
  }
  freePre(op) {
    if (!op._pre) return;
    for (const id of Object.keys(op._pre)) { const p = op._pre[id]; this.preBytes -= p.cv.width * p.cv.height * 4; freeCanvas(p.cv); }
    delete op._pre;
  }
  /* 굳는 사진 작업은 과정 기록용 작은 그림만 남긴다(packLog도 이 크기로 줄인다) */
  shrinkImg(op) {
    const im = op.img;
    if (op.kind !== "image" || !im || !im.getContext || Math.max(im.width, im.height) <= 720) return;
    const k = 720 / Math.max(im.width, im.height);
    const c = mkCanvas(Math.max(1, Math.round(im.width * k)), Math.max(1, Math.round(im.height * k)));
    const x = c.getContext("2d");
    x.imageSmoothingQuality = "high";
    x.drawImage(im, 0, 0, c.width, c.height);
    freeCanvas(im);
    op.img = c;
  }
  /* 그리기 직전의 그림을 작업 범위만큼 떠 둔다(되돌릴 때 그대로 놓는다). src: 떠 올 곳(기본은 레이어) */
  snapPre(op, L, src) {
    if (this.noUndo || (op._pre && op._pre[L.id])) return;
    const bb = opBBox(this, op) || { x: 0, y: 0, w: this.W, h: this.H };
    if (bb.w <= 0 || bb.h <= 0) return;
    const c = mkCanvas(bb.w, bb.h);
    c.getContext("2d").drawImage(src || L.cv, bb.x, bb.y, bb.w, bb.h, 0, 0, bb.w, bb.h);
    (op._pre || (op._pre = {}))[L.id] = { cv: c, x: bb.x, y: bb.y };
    this.preBytes += bb.w * bb.h * 4;
  }
  /* 한도를 넘으면 오래된 작업의 _pre부터 버린다(그 작업은 다시 그려서 되돌린다) */
  trimPre() {
    for (let i = 0; this.preBytes > PRE_MAX && i < this.hist.length - 1; i++) this.freePre(this.hist[i]);
  }
  restorePre(op, L) {
    const p = op._pre && op._pre[L.id];
    if (!p) return false;
    const c = L.ctx;
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
    c.clearRect(p.x, p.y, p.cv.width, p.cv.height);
    c.drawImage(p.cv, p.x, p.y);
    c.restore();
    L.ver++;
    return true;
  }

  /* ---------- 붓 재료 ---------- */

  clearScratch() {
    const c = this.sctx;
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
    c.clearRect(0, 0, this.W, this.H);
  }
  ensureTmp() {
    if (this.tmp) return;
    this.tmp = mkCanvas(this.W, this.H);
    this.tctx = this.tmp.getContext("2d");
  }
  grainPattern(tex, dens) {
    const q = clamp(Math.round(dens * 40), 1, 40), key = tex + q;
    if (this.pat[key]) return this.pat[key];
    const rank = grainRank(tex), th = q / 40;
    const c = mkCanvas(GN, GN), x = c.getContext("2d"), im = x.createImageData(GN, GN);
    for (let i = 0; i < rank.length; i++) im.data[i * 4 + 3] = rank[i] < th ? 255 : 0;
    x.putImageData(im, 0, 0);
    return (this.pat[key] = this.sctx.createPattern(c, "repeat"));
  }
  /* 선을 작은 캔버스(gtmp)에 그린 뒤 종이 결 무늬로 가려 scratch에 옮긴다.
     gtmp의 원점을 선분의 사각형에 맞춰 옮겨 그리므로 무늬는 캔버스 좌표에 고정되고 결이 이어진다.
     (캔버스 전체 크기의 임시 캔버스를 쓰면 가속이 꺼진 환경에서 선분마다 전체를 복사해 매우 느리다) */
  grainPaint(path, minx, miny, maxx, maxy, w, dens, tex, color) {
    const pad = w / 2 + 2;
    const x0 = Math.max(0, Math.floor(minx - pad)), y0 = Math.max(0, Math.floor(miny - pad));
    const x1 = Math.min(this.W, Math.ceil(maxx + pad)), y1 = Math.min(this.H, Math.ceil(maxy + pad));
    if (x1 <= x0 || y1 <= y0) return;
    const bw = x1 - x0, bh = y1 - y0;
    if (!this.gtmp || this.gtmp.width < bw || this.gtmp.height < bh) {
      const nw = Math.max(pow2(bw), this.gtmp ? this.gtmp.width : 0), nh = Math.max(pow2(bh), this.gtmp ? this.gtmp.height : 0);
      freeCanvas(this.gtmp);
      this.gtmp = mkCanvas(nw, nh);
      this.gctx = this.gtmp.getContext("2d");
    }
    const t = this.gctx;
    t.save();
    t.setTransform(1, 0, 0, 1, 0, 0); t.globalAlpha = 1; t.globalCompositeOperation = "source-over";
    t.clearRect(0, 0, bw, bh);
    t.beginPath(); t.rect(0, 0, bw, bh); t.clip();
    t.setTransform(1, 0, 0, 1, -x0, -y0);
    t.strokeStyle = color; t.fillStyle = color; t.lineWidth = w; t.lineCap = "round"; t.lineJoin = "round";
    path(t);
    t.globalCompositeOperation = "destination-in";
    t.fillStyle = this.grainPattern(tex, dens);
    t.fillRect(x0, y0, bw, bh);
    t.restore();
    this.sctx.drawImage(this.gtmp, 0, 0, bw, bh, x0, y0, bw, bh);
  }
  /* 찍는 붓의 한 점: hard(0~1)까지는 꽉 차고 그 밖으로 흐려진다. wet은 가장자리가 진한 수채 */
  sprite(color, hard = 0, wet = false) {
    // 가장자리 값을 1% 단계로 맞춰 키와 내용이 어긋나지 않게 한다(같은 작업을 다시 그려도 같은 무늬)
    const q = Math.round(clamp(hard, 0, 1) * 100);
    hard = q / 100;
    const key = color + "|" + q + (wet ? "w" : "");
    let c = this.sprites.get(key);
    if (c) return c;
    const S = 128;
    c = mkCanvas(S, S);
    const x = c.getContext("2d");
    const [r, g, b] = hexRgb(color);
    const col = (a) => `rgba(${r},${g},${b},${a})`;
    const gr = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    if (wet) {
      gr.addColorStop(0, col(0.5)); gr.addColorStop(0.62, col(0.55)); gr.addColorStop(0.86, col(0.9)); gr.addColorStop(0.94, col(0.55)); gr.addColorStop(1, col(0));
    } else {
      const h = clamp(hard, 0, 0.97);
      gr.addColorStop(0, col(1)); gr.addColorStop(h, col(1));
      gr.addColorStop(h + (1 - h) * 0.35, col(0.6)); gr.addColorStop(h + (1 - h) * 0.7, col(0.18)); gr.addColorStop(1, col(0));
    }
    x.fillStyle = gr; x.fillRect(0, 0, S, S);
    if (this.sprites.size > 80) { this.sprites.forEach(freeCanvas); this.sprites.clear(); }
    this.sprites.set(key, c);
    return c;
  }

  /* ---------- 선택 영역 ---------- */

  /* sel: { parts: [{ type: rect|ellipse|lasso|wand, mode: add|sub, ... }], inv } → 알파 마스크 캔버스 */
  buildMask(sel) {
    const W = this.W, H = this.H;
    const m = mkCanvas(W, H), x = m.getContext("2d");
    x.fillStyle = "#000";
    for (const p of sel.parts || []) {
      x.globalCompositeOperation = p.mode === "sub" ? "destination-out" : "source-over";
      if (p.type === "wand") {
        let pm = p._m;
        if (!pm) {
          const all = p.ref === "all" || !this.layer(p.layer);
          const src = all ? this.composite(paperColor(this.paper)) : this.layer(p.layer).cv;
          const d = src.getContext("2d").getImageData(0, 0, W, H);
          if (all) freeCanvas(src);
          const r = floodMask(d.data, W, H, p.x, p.y, p.tol, { contiguous: true });
          const grown = dilateMask(r.mask, W, H, 1);
          pm = mkCanvas(W, H);
          const im = new ImageData(W, H);
          for (let i = 0; i < grown.length; i++) im.data[i * 4 + 3] = grown[i];
          pm.getContext("2d").putImageData(im, 0, 0);
          p._m = pm;
        }
        x.drawImage(pm, 0, 0);
        continue;
      }
      x.beginPath();
      if (p.type === "rect") x.rect(p.x, p.y, p.w, p.h);
      else if (p.type === "ellipse") x.ellipse(p.cx, p.cy, Math.max(0.1, p.rx), Math.max(0.1, p.ry), 0, 0, Math.PI * 2);
      else if (p.type === "lasso") { for (let i = 0; i + 1 < p.pts.length; i += 2) (i ? x.lineTo(p.pts[i], p.pts[i + 1]) : x.moveTo(p.pts[i], p.pts[i + 1])); x.closePath(); }
      x.fill();
    }
    if (sel.inv) {
      const inv = mkCanvas(W, H), ix = inv.getContext("2d");
      ix.fillStyle = "#000"; ix.fillRect(0, 0, W, H);
      ix.globalCompositeOperation = "destination-out"; ix.drawImage(m, 0, 0);
      return inv;
    }
    return m;
  }
  maskOf(sel) { return sel._mask || (sel._mask = this.buildMask(sel)); }
  /* 더는 쓰이지 않는 선택의 마스크를 놓는다(지금 선택이거나 되돌리기 기록의 작업이 쓰는 선택은 둔다) */
  dropSel(sel) {
    if (!sel || sel === this.sel) return;
    const live = this.hist.concat(this.redo).map((o) => o.sel).filter(Boolean);
    if (live.includes(sel)) return;
    if (this.sel) live.push(this.sel);
    freeCanvas(sel._mask); delete sel._mask; delete sel._arr; delete sel._bbox;
    for (const p of sel.parts || []) if (p._m && !live.some((x) => (x.parts || []).includes(p))) { freeCanvas(p._m); delete p._m; }
  }
  selArr(sel) {
    if (sel._arr) return sel._arr;
    const d = this.maskOf(sel).getContext("2d").getImageData(0, 0, this.W, this.H).data;
    const a = new Uint8Array(this.W * this.H);
    for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
    return (sel._arr = a);
  }
  /* 선택을 바꾼다. sel이 비어 있으면(고른 픽셀 없음) 해제한다 */
  setSel(sel) {
    if (sel) {
      const bb = maskBBox(this.selArr(sel), this.W, this.H);
      if (!bb) { freeCanvas(sel._mask); sel = null; } else sel._bbox = bb;
    }
    if (sel) {
      // 과정 기록을 다시 볼 때 같은 선택(특히 자동 선택)을 한 번만 계산하도록 이름을 붙인다
      if (!sel.sid) sel.sid = Date.now().toString(36) + "." + (this.selSeq = (this.selSeq || 0) + 1);
      (sel.parts || []).forEach((p, i) => { if (p.type === "wand" && !p.wid) p.wid = sel.sid + "." + i; });
    }
    const old = this.sel;
    this.sel = sel;
    if (old && old !== sel) this.dropSel(old);
    if (sel) {
      if (!this.selCv) { this.selCv = mkCanvas(this.W, this.H); this.selCv.className = "skx-selcv"; }
      const c = this.selCv.getContext("2d");
      c.setTransform(1, 0, 0, 1, 0, 0); c.globalCompositeOperation = "source-over"; c.globalAlpha = 1;
      c.clearRect(0, 0, this.W, this.H);
      // 고르지 않은 곳에 빗금
      const p = mkCanvas(12, 12), px = p.getContext("2d");
      px.fillStyle = "rgba(40,40,40,.30)"; px.fillRect(0, 0, 12, 12);
      px.strokeStyle = "rgba(255,255,255,.55)"; px.lineWidth = 2;
      px.beginPath(); px.moveTo(-3, 9); px.lineTo(9, -3); px.moveTo(3, 15); px.lineTo(15, 3); px.stroke();
      c.fillStyle = c.createPattern(p, "repeat"); c.fillRect(0, 0, this.W, this.H);
      c.globalCompositeOperation = "destination-out"; c.drawImage(this.maskOf(sel), 0, 0);
    }
    this.mount();
    return sel;
  }

  /* ---------- 픽셀 작업 ---------- */

  paint(op, final) {
    if (op.kind === "stroke") makeRenderers(this, op, final).add();
    else if (op.kind === "shape") {
      const mats = op.sym ? symMatrices(op.sym.kind, op.sym.cx, op.sym.cy, op.sym.n) : [null];
      mats.forEach((m, i) => {
        this.sctx.save();
        if (i && m) this.sctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
        drawShape(this.sctx, op);
        this.sctx.restore();
      });
    } else if (op.kind === "text") drawText(this.sctx, op);
  }
  /* scratch를 레이어에 합성. 선택이 있으면 그 안에만, 알파 잠금이면 이미 칠해진 곳에만 */
  compose(op, c) {
    let src = this.scratch;
    if (op.sel) {
      this.ensureTmp();
      const t = this.tctx;
      t.save(); t.setTransform(1, 0, 0, 1, 0, 0); t.globalAlpha = 1;
      t.globalCompositeOperation = "copy"; t.drawImage(this.scratch, 0, 0);
      t.globalCompositeOperation = "destination-in"; t.drawImage(this.maskOf(op.sel), 0, 0);
      t.restore();
      src = this.tmp;
    }
    const erase = op.kind === "stroke" && BRUSH[op.tool] && BRUSH[op.tool].erase;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.globalAlpha = clamp(op.opacity == null ? 1 : op.opacity, 0, 1);
    c.globalCompositeOperation = erase ? "destination-out" : op.alock ? "source-atop" : "source-over";
    c.drawImage(src, 0, 0);
    c.restore();
  }
  /* 작업 하나를 대상(T: { cv, ctx })에 적용 */
  applyPixels(op, T) {
    const c = T.ctx, W = this.W, H = this.H;
    switch (op.kind) {
      case "clear":
        c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1;
        if (op.sel) { c.globalCompositeOperation = "destination-out"; c.drawImage(this.maskOf(op.sel), 0, 0); }
        else c.clearRect(0, 0, W, H);
        c.restore();
        return;
      case "image": {
        const im = op._img || op.img;
        if (!im || typeof im === "string") return;
        c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
        c.imageSmoothingQuality = "high";
        c.drawImage(im, op.x, op.y, op.w, op.h);
        c.restore();
        return;
      }
      case "fill": return this.applyFill(op, T);
      case "smudge": return this.applySmudge(op, T);
      case "transform": return this.applyTransform(op, T);
      case "adjust": {
        const d = c.getImageData(0, 0, W, H);
        runAdjust(d.data, W, H, op.type, op.params || {}, op.seed, op.sel ? this.selArr(op.sel) : undefined);
        c.putImageData(d, 0, 0);
        return;
      }
      case "lmerge": {
        const U = op._L;
        if (!U) return;
        c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = U.op; c.globalCompositeOperation = gco(U.blend);
        c.drawImage(U.cv, 0, 0);
        c.restore();
        return;
      }
      case "lflat": {
        const t = mkCanvas(W, H), x = t.getContext("2d");
        for (const o of op._order || []) {
          if (!o.vis) continue;
          x.globalAlpha = o.op; x.globalCompositeOperation = gco(o.blend);
          x.drawImage(o.L.id === op.layers[0] ? T.cv : o.L.cv, 0, 0);
        }
        c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = "copy"; c.drawImage(t, 0, 0); c.restore();
        t.width = 0;
        return;
      }
      default:
        this.clearScratch();
        this.paint(op, true);
        this.compose(op, c);
        this.clearScratch();
    }
  }
  /* 채우기: 누른 곳과 이어진 같은 색 영역. 영역은 처음 계산한 것을 작업에 붙여 두고 다시 쓴다
     (다른 레이어를 참조한 채우기도 되돌리기 뒤에 같은 모양이 되게). _mask: { cv, x, y, w, h } (w가 0이면 빈 영역) */
  fillMask(op, T) {
    if (op._mask) return op._mask;
    const W = this.W, H = this.H;
    const all = op.ref === "all";
    const src = all ? this.composite(paperColor(this.paper)) : T.cv;
    const d = src.getContext("2d").getImageData(0, 0, W, H);
    if (all) freeCanvas(src);
    const r = floodMask(d.data, W, H, op.x, op.y, op.tol == null ? 32 : op.tol, { contiguous: true, limit: op.sel ? this.selArr(op.sel) : undefined });
    if (!r.count) return (op._mask = { cv: null, x: 0, y: 0, w: 0, h: 0 });
    const grown = dilateMask(r.mask, W, H, 1);
    const bb = maskBBox(grown, W, H);
    const w = bb[2] - bb[0] + 1, h = bb[3] - bb[1] + 1;
    const im = new ImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) im.data[(y * w + x) * 4 + 3] = grown[(y + bb[1]) * W + x + bb[0]];
    const cv = mkCanvas(w, h);
    cv.getContext("2d").putImageData(im, 0, 0);
    return (op._mask = { cv, x: bb[0], y: bb[1], w, h });
  }
  applyFill(op, T) {
    const m = this.fillMask(op, T);
    if (!m.w) return;
    this.clearScratch();
    const s = this.sctx;
    s.fillStyle = op.color; s.fillRect(m.x, m.y, m.w, m.h);
    s.globalCompositeOperation = "destination-in"; s.drawImage(m.cv, m.x, m.y);
    this.compose(op, T.ctx);
    this.clearScratch();
  }
  applySmudge(op, T, keepSnap) {
    const guard = op.sel || op.alock;
    const before = guard ? keepSnap || copyCanvas(T.cv) : null;
    makeSmudger(this, op, T).add();
    if (guard) { this.guardSmudge(op, T, before); if (before !== keepSnap) freeCanvas(before); }
  }
  /* 번짐을 레이어에 바로 그린 뒤, 획의 범위 안에서: 알파 잠금이면 그리기 전 그림 위에 번진 그림을 source-atop으로(원래 알파 유지),
     선택이 있으면 「그리기 전 × (1 − 마스크) + 번진 그림 × 마스크」로 합친다. 범위 밖은 건드리지 않는다
     (캔버스 전체에 destination-in을 하면 반투명 픽셀이 획마다 옅어지고, 범위 밖은 _pre로 되돌려지지 않는다) */
  guardSmudge(op, T, before) {
    const bb = opBBox(this, op);
    if (!bb || bb.w <= 0 || bb.h <= 0) return;
    const { x, y, w, h } = bb, c = T.ctx, mask = op.sel ? this.maskOf(op.sel) : null;
    this.ensureTmp();
    const t = this.tctx;
    t.save(); t.setTransform(1, 0, 0, 1, 0, 0); t.globalAlpha = 1;
    t.clearRect(x, y, w, h);
    if (op.alock) {
      t.globalCompositeOperation = "source-over"; t.drawImage(before, x, y, w, h, x, y, w, h);
      t.globalCompositeOperation = "source-atop"; t.drawImage(T.cv, x, y, w, h, x, y, w, h);
    } else { t.globalCompositeOperation = "source-over"; t.drawImage(T.cv, x, y, w, h, x, y, w, h); }
    if (mask) { t.globalCompositeOperation = "destination-in"; t.drawImage(mask, x, y, w, h, x, y, w, h); }
    t.restore();
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
    c.clearRect(x, y, w, h);
    if (mask) {
      c.drawImage(before, x, y, w, h, x, y, w, h);
      c.globalCompositeOperation = "destination-out"; c.drawImage(mask, x, y, w, h, x, y, w, h);
      c.globalCompositeOperation = "lighter";
    }
    c.drawImage(this.tmp, x, y, w, h, x, y, w, h);
    c.restore();
  }
  /* 변형: 레이어(선택이 있으면 그 안)의 그림을 떼어 행렬 m으로 다시 그린다 */
  splitForXform(T, sel) {
    const src = copyCanvas(T.cv);
    let rest = null;
    if (sel) {
      const mask = this.maskOf(sel);
      const sx = src.getContext("2d");
      sx.globalCompositeOperation = "destination-in"; sx.drawImage(mask, 0, 0);
      rest = copyCanvas(T.cv);
      const rx = rest.getContext("2d");
      rx.globalCompositeOperation = "destination-out"; rx.drawImage(mask, 0, 0);
    }
    return { src, rest };
  }
  drawXform(T, src, rest, m, smooth) {
    const c = T.ctx;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
    c.clearRect(0, 0, this.W, this.H);
    if (rest) c.drawImage(rest, 0, 0);
    c.imageSmoothingEnabled = smooth !== false; c.imageSmoothingQuality = "high";
    c.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
    c.drawImage(src, 0, 0);
    c.restore();
  }
  applyTransform(op, T) {
    const { src, rest } = this.splitForXform(T, op.sel);
    this.drawXform(T, src, rest, op.m, op.smooth);
    freeCanvas(src); freeCanvas(rest);
  }
  /* 변형 도구가 쓰는 묶음: 시작 → 미리보기 → 확정/취소 */
  beginXform(L, sel) {
    this.touch(L);
    const { src, rest } = this.splitForXform(L, sel);
    const d = src.getContext("2d").getImageData(0, 0, this.W, this.H).data;
    const a = new Uint8Array(this.W * this.H);
    for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3] > 8 ? 255 : 0;
    return { L, sel, src, rest, orig: sel ? copyCanvas(L.cv) : null, bbox: maskBBox(a, this.W, this.H) };
  }
  previewXform(x, m, smooth) { this.drawXform(x.L, x.src, x.rest, m, smooth); }
  endXform(x, m, smooth) {
    if (x.orig) { const c = x.L.ctx; c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = "copy"; c.drawImage(x.orig, 0, 0); c.restore(); }
    else this.drawXform(x.L, x.src, x.rest, [1, 0, 0, 1, 0, 0], false);
    freeCanvas(x.src); freeCanvas(x.rest); freeCanvas(x.orig);
    x.L.ver++;
    if (!m) return null;
    return this.commit({ kind: "transform", m: m.slice(), smooth: smooth !== false, sel: x.sel || undefined, layers: [x.L.id] });
  }
  /* 조정 도구가 쓰는 묶음 */
  beginAdjust(L) { this.touch(L); return { L, sel: this.sel, orig: L.ctx.getImageData(0, 0, this.W, this.H) }; }
  previewAdjust(a, type, params, seed) {
    const d = new ImageData(new Uint8ClampedArray(a.orig.data), this.W, this.H);
    runAdjust(d.data, this.W, this.H, type, params, seed, a.sel ? this.selArr(a.sel) : undefined);
    a.L.ctx.putImageData(d, 0, 0);
  }
  endAdjust(a, type, params, seed) {
    a.L.ctx.putImageData(a.orig, 0, 0);
    a.L.ver++;
    if (!type) return null;
    return this.commit({ kind: "adjust", type, params: { ...params }, seed, sel: a.sel || undefined, layers: [a.L.id] });
  }

  /* ---------- 기록: 실행·되돌리기 ---------- */

  replay(L) {
    const c = L.ctx;
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
    c.clearRect(0, 0, this.W, this.H);
    if (L.base) c.drawImage(L.base, 0, 0);
    c.restore();
    for (const op of this.hist) if (PIXEL_KINDS.has(op.kind) && op.layers && op.layers.includes(L.id)) this.applyPixels(op, L);
    L.ver++;
  }
  /* 작업을 지금 상태에 실행한다. 되돌릴 때 필요한 이전 상태(_L, prev 등)는 처음 실행할 때 작업에 적어 둔다 */
  perform(op) {
    const idx = (id) => this.layers.findIndex((L) => L.id === id);
    if (op._act == null) op._act = this.activeId;
    switch (op.kind) {
      case "ladd": {
        const L = op._L || (op._L = this.makeLayer(op.name, op.id));
        op.id = L.id; op.name = L.name;
        this.layers.splice(clamp(op.index == null ? this.layers.length : op.index, 0, this.layers.length), 0, L);
        if (op.activate !== false) this.activeId = L.id;
        break;
      }
      case "ldel": {
        const i = idx(op.id);
        if (i < 0 || this.layers.length <= 1) break;
        op._L = this.layers[i]; op._index = i;
        this.layers.splice(i, 1);
        if (this.activeId === op.id) this.activeId = this.layers[Math.max(0, i - 1)].id;
        break;
      }
      case "lmove": {
        const i = idx(op.id), j = clamp(op.to, 0, this.layers.length - 1);
        if (i < 0) break;
        op.from = i;
        const [L] = this.layers.splice(i, 1);
        this.layers.splice(j, 0, L);
        break;
      }
      case "lset": {
        const L = this.layer(op.id);
        if (!L) break;
        if (!op.prev) { op.prev = {}; for (const k of Object.keys(op.patch)) op.prev[k] = L[k]; }
        Object.assign(L, op.patch);
        break;
      }
      case "ldup": {
        const S = this.layer(op.src);
        if (!S) break;
        let L = op._L;
        if (!L) {
          L = this.makeLayer(op.name || S.name + " 사본", op.id);
          Object.assign(L, { op: S.op, vis: S.vis, blend: S.blend, alock: S.alock });
          L.ctx.drawImage(S.cv, 0, 0);
          L.cow = true;
          op._L = L; op.id = L.id; op.name = L.name;
        }
        this.layers.splice(clamp(op.index == null ? idx(op.src) + 1 : op.index, 0, this.layers.length), 0, L);
        this.activeId = L.id;
        break;
      }
      case "lmerge": {
        const i = idx(op.id), into = this.layer(op.into);
        if (i < 0 || !into) break;
        op._L = this.layers[i]; op._index = i; op.layers = [into.id];
        this.touch(into);
        this.snapPre(op, into);
        this.applyPixels(op, into); into.ver++;
        this.layers.splice(i, 1);
        if (this.activeId === op.id) this.activeId = into.id;
        break;
      }
      case "lflat": {
        const bottom = this.layers[0];
        if (!op._order) op._order = this.layers.map((L) => ({ L, op: L.op, blend: L.blend, vis: L.vis }));
        op.layers = [bottom.id];
        this.touch(bottom);
        this.snapPre(op, bottom);
        this.applyPixels(op, bottom); bottom.ver++;
        Object.assign(bottom, { op: 1, blend: "normal", vis: true });
        this.layers = [bottom];
        this.activeId = bottom.id;
        break;
      }
      case "paper":
        if (op.prev == null) op.prev = this.paper;
        this.paper = op.paper;
        break;
      default:
        for (const id of op.layers || []) {
          const L = this.layer(id);
          if (!L) continue;
          this.touch(L);
          if (op.kind === "fill") this.fillMask(op, L);
          this.snapPre(op, L);
          this.applyPixels(op, L); L.ver++;
        }
    }
  }
  revert(op) {
    switch (op.kind) {
      case "ladd": case "ldup": {
        const i = this.layers.indexOf(op._L);
        if (i >= 0) this.layers.splice(i, 1);
        break;
      }
      case "ldel":
        if (op._L) this.layers.splice(clamp(op._index, 0, this.layers.length), 0, op._L);
        break;
      case "lmove": {
        const i = this.layers.findIndex((L) => L.id === op.id);
        if (i < 0) break;
        const [L] = this.layers.splice(i, 1);
        this.layers.splice(clamp(op.from, 0, this.layers.length), 0, L);
        break;
      }
      case "lset": { const L = this.layer(op.id); if (L && op.prev) Object.assign(L, op.prev); break; }
      case "lmerge": {
        if (!op._L) break;
        this.layers.splice(clamp(op._index, 0, this.layers.length), 0, op._L);
        const into = this.layer(op.into);
        if (into && !this.restorePre(op, into)) this.replay(into);
        break;
      }
      case "lflat": {
        if (!op._order) break;
        this.layers = op._order.map((o) => o.L);
        const bottom = this.layers[0], o0 = op._order[0];
        Object.assign(bottom, { op: o0.op, blend: o0.blend, vis: o0.vis });
        if (!this.restorePre(op, bottom)) this.replay(bottom);
        break;
      }
      case "paper": this.paper = op.prev; break;
      default:
        for (const id of op.layers || []) { const L = this.layer(id); if (L && !this.restorePre(op, L)) this.replay(L); }
    }
    if (op._act != null && this.layer(op._act)) this.activeId = op._act;
    else if (!this.layer(this.activeId)) this.activeId = this.layers[this.layers.length - 1].id;
  }
  /* 되돌리기 한도를 넘은 가장 오래된 작업은 레이어의 base에 굳힌다 */
  bake(op) {
    if (PIXEL_KINDS.has(op.kind)) {
      for (const id of op.layers || []) {
        const L = this.layer(id) || this.buried(id);
        if (!L) continue;
        if (!L.base) L.base = mkCanvas(this.W, this.H);
        this.applyPixels(op, { cv: L.base, ctx: L.base.getContext("2d") });
      }
    }
    this.shrinkImg(op);
    this.past.push(op);
    this.release(op, true);
    this.dropSel(op.sel);
  }
  /* 지워졌지만 되돌리기 기록 안에 아직 살아 있는 레이어 (skip: 이 작업은 빼고 찾는다) */
  buried(id, skip) {
    for (const op of this.hist.concat(this.redo)) {
      if (op === skip) continue;
      if ((op.kind === "ldel" || op.kind === "lmerge") && op._L && op._L.id === id) return op._L;
      if (op.kind === "lflat" && op._order) { const o = op._order.find((x) => x.L.id === id); if (o) return o.L; }
    }
    return null;
  }
  push(op) {
    if (!op.t) op.t = Date.now();
    this.hist.push(op);
    const gone = this.redo;
    this.redo = [];
    for (const r of gone) this.release(r, true);
    while (this.hist.length > HISTORY_MAX) {
      const old = this.hist.shift();
      this.bake(old);
      // 묶음(grp)이 한도에서 갈라지면 남은 반쪽만 되돌려져 그림이 사라진다: 묶음째 굳힌다
      while (old.grp && this.hist.length && this.hist[0].grp === old.grp) this.bake(this.hist.shift());
    }
    this.trimPre();
  }
  commit(op) {
    this.perform(op);
    this.push(op);
    this.mount();
    return op;
  }
  /* 같은 묶음(grp)은 한 번에 되돌린다 */
  undo() {
    if (this.live || !this.hist.length) return false;
    const grp = this.hist[this.hist.length - 1].grp;
    do {
      const op = this.hist.pop();
      this.redo.push(op);
      this.revert(op);
    } while (grp && this.hist.length && this.hist[this.hist.length - 1].grp === grp);
    this.mount();
    return true;
  }
  redoOne() {
    if (this.live || !this.redo.length) return false;
    const grp = this.redo[this.redo.length - 1].grp;
    do {
      const op = this.redo.pop();
      this.hist.push(op);
      this.perform(op);
    } while (grp && this.redo.length && this.redo[this.redo.length - 1].grp === grp);
    this.mount();
    return true;
  }
  /* 기록 창에서 고른 지점으로: n = 남길 작업 수(hist 기준) */
  jumpTo(n) {
    n = clamp(n, 0, this.hist.length + this.redo.length);
    let moved = false;
    while (this.hist.length > n && this.undo()) moved = true;
    while (this.hist.length < n && this.redoOne()) moved = true;
    return moved;
  }

  /* ---------- 레이어 작업 (모두 기록에 남는다) ---------- */

  addLayer(name, index, extra) {
    if (this.layers.length >= MAX_LAYERS) return null;
    const op = this.commit({ kind: "ladd", name, index: index != null ? index : this.layers.indexOf(this.active()) + 1, ...(extra || {}) });
    return op._L;
  }
  removeLayer(id) { if (this.layers.length <= 1 || !this.layer(id)) return false; this.commit({ kind: "ldel", id }); return true; }
  moveLayer(id, dir) {
    const i = this.layers.findIndex((L) => L.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= this.layers.length) return false;
    this.commit({ kind: "lmove", id, to: j });
    return true;
  }
  /* 슬라이더처럼 연달아 바뀌는 값은 직전의 같은 작업에 합친다 */
  setLayer(id, patch) {
    const last = this.hist[this.hist.length - 1], key = Object.keys(patch)[0];
    if (last && last.kind === "lset" && last.id === id && Object.keys(last.patch).length === 1 && key in last.patch && (key === "op" || key === "name") && !this.redo.length && Date.now() - last.t < 4000) {
      Object.assign(last.patch, patch);
      const L = this.layer(id); if (L) Object.assign(L, patch);
      last.t = Date.now();
      this.mount();
      return;
    }
    this.commit({ kind: "lset", id, patch });
  }
  dupLayer(id) { if (this.layers.length >= MAX_LAYERS || !this.layer(id)) return null; return this.commit({ kind: "ldup", src: id })._L; }
  mergeDown(id) {
    const i = this.layers.findIndex((L) => L.id === id);
    if (i <= 0) return false;
    this.commit({ kind: "lmerge", id, into: this.layers[i - 1].id });
    return true;
  }
  flatten() { if (this.layers.length <= 1) return false; this.commit({ kind: "lflat" }); return true; }
  setPaper(k) { if (k !== this.paper) this.commit({ kind: "paper", paper: k }); }
  /* 선택 영역을 새 레이어로 복사(cut이면 원래 자리에서 지운다) */
  liftSel(cut) {
    const L = this.active();
    if (!L || this.layers.length >= MAX_LAYERS) return null;
    const img = copyCanvas(L.cv);
    if (this.sel) { const x = img.getContext("2d"); x.globalCompositeOperation = "destination-in"; x.drawImage(this.maskOf(this.sel), 0, 0); }
    const grp = "g" + this.grpSeq++;
    if (cut) this.commit({ kind: "clear", sel: this.sel || undefined, layers: [L.id], grp });
    const N = this.commit({ kind: "ladd", name: cut ? "잘라낸 그림" : "복사한 그림", index: this.layers.indexOf(L) + 1, grp })._L;
    this.commit({ kind: "image", paste: true, img, x: 0, y: 0, w: this.W, h: this.H, layers: [N.id], grp });
    return N;
  }
  hasContent() {
    return this.layers.some((L) => this.layerHasContent(L));
  }
  layerHasContent(L) {
    let has = !!L.base || L.cow;
    for (const op of this.hist) if (op.layers && op.layers.includes(L.id) && PIXEL_KINDS.has(op.kind)) has = !(op.kind === "clear" && !op.sel);
    return has;
  }

  /* ---------- 실시간 획 ---------- */

  /* 지우개·알파 잠금·선택 안 그리기는 획 시작 때 레이어를 떠 두고(snap) 프레임마다 snap에서 다시 합성해 보인다.
     번짐은 레이어에 바로 그린다. 그 밖은 scratch를 레이어 위에 띄워 보인다 */
  beginLive(op) {
    const L = this.layer(op.layers[0]);
    if (!L) return false;
    this.touch(L);
    this.clearScratch();
    const smudge = op.kind === "smudge";
    const direct = smudge || (op.kind === "stroke" && BRUSH[op.tool] && BRUSH[op.tool].erase) || !!op.alock || !!op.sel;
    this.live = { op, L, direct, smudge, r: smudge ? makeSmudger(this, op, L) : op.kind === "stroke" ? makeRenderers(this, op, false) : null, raf: 0 };
    if (direct) {
      if (!this.snap || this.snap.width !== this.W || this.snap.height !== this.H) this.snap = mkCanvas(this.W, this.H);
      const s = this.snap.getContext("2d");
      s.globalCompositeOperation = "copy"; s.drawImage(L.cv, 0, 0);
      this.scratch.style.opacity = "0";
    } else this.scratch.style.opacity = String(clamp(op.opacity, 0, 1) * L.op);
    this.drawLive();
    return true;
  }
  drawLive() {
    const lv = this.live;
    if (!lv) return;
    if (lv.r) lv.r.add(); else { this.clearScratch(); this.paint(lv.op, false); }
    if (lv.direct && !lv.smudge && !lv.raf) {
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
    if (lv.smudge) { this.restoreSnap(lv.L); lv.r = makeSmudger(this, lv.op, lv.L); }
    else if (lv.op.kind === "stroke") lv.r = makeRenderers(this, lv.op, false);
    this.drawLive();
  }
  restoreSnap(L) {
    const c = L.ctx;
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = "copy"; c.drawImage(this.snap, 0, 0); c.restore();
  }
  endLive() {
    const lv = this.live;
    if (!lv) return null;
    this.live = null;
    if (lv.raf) cancelAnimationFrame(lv.raf);
    this.clearScratch();
    this.scratch.style.opacity = "1";
    if (lv.smudge) {
      lv.r.add(); // 펜을 뗄 때 덧붙은 마지막 점까지
      if (lv.op.sel || lv.op.alock) this.guardSmudge(lv.op, lv.L, this.snap);
      this.snapPre(lv.op, lv.L, this.snap);
    } else {
      if (lv.direct) this.restoreSnap(lv.L);
      this.snapPre(lv.op, lv.L);
      this.applyPixels(lv.op, lv.L);
    }
    lv.L.ver++;
    if (lv.op._act == null) lv.op._act = this.activeId;
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
    if (lv.direct) { this.restoreSnap(lv.L); lv.L.ver++; } // 미리보기가 레이어를 건드렸으므로 캐시(초안·미리보기)를 무효로
  }

  /* ---------- 합친 그림·색 가져오기 ---------- */

  /* paper: 종이 색(없으면 투명 배경) */
  composite(paper) {
    const c = mkCanvas(this.W, this.H), x = c.getContext("2d");
    if (paper) { x.fillStyle = paper; x.fillRect(0, 0, this.W, this.H); }
    for (const L of this.layers) if (L.vis) { x.globalAlpha = L.op; x.globalCompositeOperation = gco(L.blend); x.drawImage(L.cv, 0, 0); }
    return c;
  }
  compositeInto(cv, paper) {
    const x = cv.getContext("2d");
    x.save();
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
    if (paper) { x.fillStyle = paper; x.fillRect(0, 0, cv.width, cv.height); } else x.clearRect(0, 0, cv.width, cv.height);
    x.imageSmoothingQuality = "high";
    for (const L of this.layers) if (L.vis) { x.globalAlpha = L.op; x.globalCompositeOperation = gco(L.blend); x.drawImage(L.cv, 0, 0, cv.width, cv.height); }
    x.restore();
  }
  pick(px, py, paper) {
    const x = Math.floor(px), y = Math.floor(py);
    if (x < 0 || y < 0 || x >= this.W || y >= this.H) return null;
    if (!this.pickCv) this.pickCv = mkCanvas(1, 1);
    const c = this.pickCv.getContext("2d", { willReadFrequently: true });
    c.globalAlpha = 1; c.globalCompositeOperation = "source-over"; c.fillStyle = paper; c.fillRect(0, 0, 1, 1);
    for (const L of this.layers) if (L.vis) { c.globalAlpha = L.op; c.globalCompositeOperation = gco(L.blend); c.drawImage(L.cv, x, y, 1, 1, 0, 0, 1, 1); }
    const d = c.getImageData(0, 0, 1, 1).data;
    return rgbHex(d[0], d[1], d[2]);
  }

  /* ---------- 과정 다시 보기 ---------- */

  /* 기록 한 줄을 실행한다(화면 밖 엔진용). new·base·canvas는 기록 전용 작업 */
  runLog(op) {
    if (op.kind === "new") {
      this.reset(op.w, op.h, [{ id: op.id || 1, name: op.name }]);
      this.paper = op.paper || "white";
    } else if (op.kind === "base") {
      this.reset(op.w, op.h, (op.layers && op.layers.length ? op.layers : [{ id: 1 }]).map((l) => ({ ...l })), op.active);
      this.paper = op.paper || "white";
      // snap은 보이는 레이어를 이미 합친 그림이므로 맨 아래 레이어를 보통·100%·보임으로 두고 그린다
      if (op._img) { const L = this.layers[0]; Object.assign(L, { op: 1, vis: true, blend: "normal" }); L.ctx.drawImage(op._img, 0, 0, this.W, this.H); }
    } else if (op.kind === "canvas") {
      const past = this.past;
      this.canvasOp(op.type, { w: op.w, h: op.h, dir: op.dir });
      this.past = past;
    } else {
      this.noUndo = true;
      const copy = { ...op };
      for (const k of Object.keys(copy)) if (k[0] === "_" && k !== "_img") delete copy[k];
      delete copy.prev;
      // 선택은 이 엔진의 것으로 따로 둔다(본 엔진의 선택 객체에 마스크를 붙이지 않는다).
      // 같은 선택(sid)과 같은 자동 선택 조각(wid)은 처음 계산한 것을 다시 쓴다: 저장된 기록에서는 작업마다 선택 객체가 따로라
      // 그때마다 그 시점 그림으로 자동 선택을 다시 계산하면 선택 안에 그린 둘째 획부터 영역이 달라진다
      if (copy.sel) {
        const seen = this.selSeen || (this.selSeen = new Map());
        const same = copy.sel.sid ? seen.get(copy.sel.sid) : null;
        if (same) copy.sel = same;
        else {
          copy.sel = { parts: (copy.sel.parts || []).map((q) => { const o = { ...q }; delete o._m; return o; }), inv: copy.sel.inv, sid: copy.sel.sid };
          if (copy.sel.sid) seen.set(copy.sel.sid, copy.sel);
          for (const q of copy.sel.parts) {
            if (q.type !== "wand" || !q.wid) continue;
            const first = seen.get("w:" + q.wid);
            if (!first) seen.set("w:" + q.wid, q);
            else if (first._m) q._m = first._m;
          }
        }
      }
      const own = copy.sel && !copy.sel.sid ? copy.sel : null;
      this.perform(copy);
      this.release(copy, true);
      if (own) { freeCanvas(own._mask); delete own._mask; delete own._arr; }
    }
  }
}

/* 기록 안의 그림(dataURL)을 미리 풀어 둔다 */
export async function prepareLog(ops) {
  for (const op of ops) {
    const src = op.kind === "base" ? op.snap : op.kind === "image" && typeof op.img === "string" ? op.img : null;
    if (src && !op._img) { try { op._img = await loadImg(src); } catch (e) {} }
  }
  return ops;
}
/* 기록을 문자열로. 사진·붙여넣기 그림은 긴 변 720px로 줄여 넣는다 */
export function packLog(ops) {
  return packOps(ops, {
    image: (v, key) => {
      if (key !== "img" || !v || !v.width || !v.getContext) return null;
      const s = Math.min(1, 720 / Math.max(v.width, v.height));
      const c = mkCanvas(Math.max(1, Math.round(v.width * s)), Math.max(1, Math.round(v.height * s)));
      c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
      const png = c.toDataURL("image/png");
      if (png.length < 160000) return png;
      const webp = c.toDataURL("image/webp", 0.8);
      return webp.startsWith("data:image/webp") && webp.length < png.length ? webp : png;
    },
  });
}
export function unpackLog(str) {
  const ops = unpackOps(str, { image: (s) => s });
  return Array.isArray(ops) ? ops : [];
}

/* ---------- media 저장소 도우미 (store: { get, putT, remove }) ---------- */

/* 한 문서에 안 들어가는 문자열은 여러 문서로 나눠 담는다. 돌려주는 값은 [{ ref }] (collectMediaRefs가 ref를 모은다).
   firestore.rules의 mediaFmtOk가 학생이 쓰는 media 값을 「data:(image|audio|video)/…,…」 형식으로 제한하므로,
   과정 기록과 나눈 조각에도 그 형식의 머리말을 붙인다(그림으로 읽히지는 않는다. 읽을 때 머리말을 떼고 이어 붙인다) */
export const LOG_PREFIX = "data:image/x-sketch-log,";
const PART_PREFIX = "data:image/x-sketch-part,";
export async function putParts(store, owner, refBase, str) {
  const parts = splitParts(str), out = [];
  for (let i = 0; i < parts.length; i++) {
    const ref = parts.length === 1 ? refBase : refBase + ".p" + i;
    out.push({ ref });
    // 제한 시간을 넘긴 쓰기도 나중에 반영될 수 있으므로 실패한 조각까지 지우기를 걸어 둔다
    if (!(await store.putT(owner, ref, parts.length === 1 ? parts[i] : PART_PREFIX + parts[i]))) { out.forEach((p) => store.remove(owner, p.ref)); return null; }
  }
  return out;
}
/* 문서 하나 읽기: { ok, data }. ok가 false면 읽기 실패(없음과 다르다). store.getSafe가 없으면 get으로 대신한다 */
export async function readDoc(store, owner, ref) {
  try {
    if (store.getSafe) { const r = await store.getSafe(owner, ref); return { ok: !!(r && r.ok), data: r ? r.data : null }; }
    return { ok: true, data: await store.get(owner, ref) };
  } catch (e) { return { ok: false, data: null }; }
}
/* 조각을 이어 붙인 문자열. 하나라도 읽기에 실패하면 FAILED, 없는 조각이 있으면 null */
export const FAILED = Symbol("read-failed");
export async function getParts(store, owner, parts) {
  const rs = await Promise.all((parts || []).map((p) => readDoc(store, owner, p.ref)));
  if (rs.some((r) => !r.ok)) return FAILED;
  return rs.length && rs.every((r) => typeof r.data === "string") ? rs.map((r) => (r.data.startsWith(PART_PREFIX) ? r.data.slice(PART_PREFIX.length) : r.data)).join("") : null;
}
/* 저장 값의 log({ parts, n })에서 과정 기록을 읽는다. 없거나 읽지 못하면 [] */
export async function fetchLog(store, owner, log) {
  if (!log || !Array.isArray(log.parts) || !log.parts.length) return [];
  const str = await getParts(store, owner, log.parts);
  if (typeof str !== "string" || !str.startsWith(LOG_PREFIX)) return [];
  return unpackLog(str.slice(LOG_PREFIX.length));
}
/* 저장 값의 레이어 한 장({ parts } 또는 옛 { ref })을 dataURL로 */
export async function fetchLayer(store, owner, l) {
  if (l && Array.isArray(l.parts)) return getParts(store, owner, l.parts);
  if (l && l.ref) { const r = await readDoc(store, owner, l.ref); return !r.ok ? FAILED : typeof r.data === "string" ? r.data : null; }
  return null;
}
/* 저장 값이 가리키는 media 참조 전부 */
export function refsOf(val) {
  const out = [];
  const visit = (v) => {
    if (!v) return;
    if (Array.isArray(v)) return v.forEach(visit);
    if (typeof v === "object") { if (typeof v.ref === "string" && v.ref) out.push(v.ref); Object.values(v).forEach(visit); }
  };
  visit(val);
  return out;
}

/* ---------- 인코딩 ---------- */

/* 합친 그림: PNG가 한도 안이면 그대로, 아니면 JPEG 품질을 낮추고, 그래도 크면 줄인다 */
export function encodeOpaque(cv, limit = LIMIT) {
  let d = cv.toDataURL("image/png");
  if (d.length <= limit) return d;
  for (const q of [0.92, 0.85, 0.75, 0.62]) { d = cv.toDataURL("image/jpeg", q); if (d.length <= limit) return d; }
  for (const s of [0.8, 0.64, 0.5]) {
    const c = mkCanvas(Math.round(cv.width * s), Math.round(cv.height * s));
    c.getContext("2d").drawImage(cv, 0, 0, c.width, c.height);
    d = c.toDataURL("image/jpeg", 0.8);
    freeCanvas(c);
    if (d.length <= limit) return d;
  }
  return null;
}
export { freeCanvas };
/* 레이어: 투명도를 지켜야 하므로 PNG. 한 문서에 안 들어가면 여러 문서로 나눠 담는다(splitParts).
   조각 수 한도를 넘으면 WebP(Safari는 못 만든다), 그래도 넘으면 줄여서 PNG로 담는다(불러올 때 캔버스 크기로 늘려 그린다) */
export function encodeLayer(cv, maxParts = 6) {
  const max = PART_MAX * maxParts;
  let d = cv.toDataURL("image/png");
  if (d.length <= max) return d;
  for (const q of [0.92, 0.8]) {
    const w = cv.toDataURL("image/webp", q);
    if (w.startsWith("data:image/webp") && w.length <= max) return w;
  }
  for (const k of [0.75, 0.6, 0.5, 0.35]) {
    const c = mkCanvas(Math.round(cv.width * k), Math.round(cv.height * k));
    const x = c.getContext("2d");
    x.imageSmoothingQuality = "high";
    x.drawImage(cv, 0, 0, c.width, c.height);
    d = c.toDataURL("image/png");
    freeCanvas(c);
    if (d.length <= max) return d;
  }
  return null;
}
export function splitParts(str, max = PART_MAX) {
  const out = [];
  for (let i = 0; i < str.length; i += max) out.push(str.slice(i, i + max));
  return out.length ? out : [""];
}
export function blobOf(cv, type = "image/png", q) {
  return new Promise((res, rej) => {
    if (!cv.toBlob) return rej(new Error("blob"));
    cv.toBlob((b) => (b ? res(b) : rej(new Error("blob"))), type, q);
  });
}

/* 붓 보관함의 미리보기 획: 작은 엔진 하나를 돌려 쓴다 */
let previewEng = null;
export function brushPreview(tool, params, w, h, color = "#111111") {
  if (!previewEng) previewEng = new Engine();
  const e = previewEng;
  if (e.W !== w || e.H !== h || !e.layers.length) e.reset(w, h, null);
  const L = e.layers[0];
  L.ctx.clearRect(0, 0, w, h);
  const T = BRUSH[tool];
  const pts = [];
  const n = 48, size = clamp(params.size || T.d.size, 1, h * 0.55);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push(w * 0.08 + w * 0.84 * t, h / 2 + Math.sin(t * Math.PI * 2) * h * 0.2, 0.15 + 0.85 * Math.sin(t * Math.PI));
  }
  if (tool === "smudge") {
    L.ctx.fillStyle = color; L.ctx.fillRect(w * 0.3, h * 0.2, w * 0.12, h * 0.6);
    L.ctx.fillStyle = "#B5462F"; L.ctx.fillRect(w * 0.55, h * 0.2, w * 0.12, h * 0.6);
    e.applyPixels({ kind: "smudge", size: Math.min(size, h * 0.5), b: params, pts, layers: [L.id] }, L);
  } else if (T.erase) {
    L.ctx.fillStyle = "#555"; L.ctx.fillRect(0, h * 0.15, w, h * 0.7);
    e.applyPixels({ kind: "stroke", tool, color, size, opacity: params.op == null ? 1 : params.op, b: params, seed: 7, pts, layers: [L.id] }, L);
  } else e.applyPixels({ kind: "stroke", tool, color, size, opacity: params.op == null ? 1 : params.op, b: params, seed: 7, pts, layers: [L.id] }, L);
  const out = mkCanvas(w, h);
  out.getContext("2d").drawImage(L.cv, 0, 0);
  return out;
}
