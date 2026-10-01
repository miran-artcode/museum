/* ============================================================
   이미지 다듬기: 표식과 글자의 기하·그리기 (spec §5.4 src-photo-marks.mjs, §4.11, [PS §8])
   담당 B. 스케일 바·회색 기준표·색 기준표·유물번호표·글자를 벡터로 그리고, 위치를 정하고, 누른 곳을 찾는다.
   규약
   - 출력 공간(O, 자르기·수평·회전 뒤) px. rec.p.x, rec.p.y(‰)는 표식 상자의 가운데. 없으면 프리셋 위치(ps)에 둔다.
   - rec은 런타임 레이어나 레이어 기록: { k: "ov"|"txt"|7|6, t: "sb"|"gs"|"cc"|"tg"|0..3, p, vis }.
   - scale = 출력 1px에 해당하는 ctx 픽셀 수(내보내기 배율, 화면 배율). ctx는 단위 변환으로 받는다.
   - ppc(출력 px/cm)는 언제나 renderer.ppc()에서 온다. 보정 전에는 null이고, 그때 스케일 바는 크기 0이며 그리지 않는다.
   - 빠진 매개변수는 src-photo-panels.jsx의 DEF와 같은 기본값(sb au 1·ps 0·o 0·mm 0·lb 0, gs·cc o 0·ps 0, tg sz 40,
     txt fn 0·sz 40·wt 0·al 0·c [0,0,0]).
   한글 문자열 리터럴 없음(라벨은 숫자와 "cm", 기준표 기호 A·M·B뿐).
   ============================================================ */
import { KINDS, TCODE } from "./src-folio-schema.mjs";

export const GREY20 = [255, 230, 208, 188, 169, 152, 137, 123, 111, 99, 89, 80, 71, 63, 56, 50, 44, 39, 34, 29];
export const CHART24 = [
  "735244", "C29682", "627A9D", "576C43", "8580B1", "67BDAA",
  "D67E2C", "505BA6", "C15A63", "5E3C6C", "9DBC40", "E0A32E",
  "383D96", "469449", "AF363C", "E7C71F", "BB5695", "0885A1",
  "F3F3F2", "C8C8C8", "A0A0A0", "7A7A79", "555555", "343434",
];
export const FONT = ["'Noto Sans KR', sans-serif", "'Noto Serif KR', serif"];
/** (added export) scale-bar segment codes p.sg → segment length in cm; 0 = the §4.11 rule (1 cm up to 10 cm, 2 cm up to 20 cm,
 *  10 cm above; 0.1 cm below 1 cm) */
export const SEG_CM = [0, 1, 2, 5, 10, 20, 50, 0.5, 0.2, 0.1];

const MONO = "'IBM Plex Mono', ui-monospace, monospace";
/** Hangul syllables and jamo by code point (no Hangul literal in this file) */
const HANGUL_CP = [[0x1100, 0x11ff], [0x3130, 0x318f], [0xa960, 0xa97f], [0xac00, 0xd7af], [0xd7b0, 0xd7ff]];
const isHangulCh = (ch) => { const c = ch.codePointAt(0); return HANGUL_CP.some(([a, b]) => c >= a && c <= b); };
const hasHangul = (s) => { for (const ch of String(s)) if (isHangulCh(ch)) return true; return false; };
const BAR_CM = [1, 2, 5, 10, 20, 50, 100];
const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const kindOf = (rec) => { const k = rec && rec.k; return typeof k === "number" ? KINDS[k] : k; };
const tOf = (rec) => { const t = rec && rec.t; return typeof t === "number" ? (TCODE.ov || [])[t] : t; };
const shortSide = (W, H) => Math.max(1, Math.min(W, H));
const margin = (W, H) => 0.05 * shortSide(W, H);
/** rough advance width of a string in em (Hangul ≈ 1, digits and Latin ≈ 0.56, space 0.3, mono 0.6) */
function textEm(s, mono) {
  let w = 0;
  for (const ch of String(s)) w += mono ? 0.6 : isHangulCh(ch) ? 1 : ch === " " ? 0.3 : /[MW@]/.test(ch) ? 0.85 : /[il.,:;|!']/.test(ch) ? 0.3 : 0.56;
  return w;
}
const fmtCm = (v) => { const r = Math.round(v * 10) / 10; return Number.isInteger(r) ? String(r) : r.toFixed(1); };

/* ---------- scale bar ---------- */
const autoSeg = (cm) => (cm < 1 ? 0.1 : cm <= 10 ? 1 : cm <= 20 ? 2 : 10);
const sgOfSeg = (seg) => { const i = SEG_CM.indexOf(seg); return i > 0 ? i : 0; };
/** 자동 길이 (§4.11): the value in {1, 2, 5, 10, 20, 50, 100} cm whose bar is 15–35 % of the output width, closest to 25 % of the
 *  object's long side (output px; else 25 % of the width) → { cm: length × 10 (PSPEC sb.cm), sg: segment code (SEG_CM) } */
export function suggestBarCm(ppc, outW, objLong) {
  if (!(ppc > 0) || !(outW > 0)) return { cm: 50, sg: 1 };
  const target = objLong > 0 ? 0.25 * objLong : 0.25 * outW;
  let best = null, bestD = Infinity, fall = null, fallD = Infinity;
  for (const c of BAR_CM) {
    const L = c * ppc, d = Math.abs(L - target), f = Math.abs(L - 0.25 * outW);
    if (L >= 0.15 * outW && L <= 0.35 * outW && d < bestD) { best = c; bestD = d; }
    if (f < fallD) { fall = c; fallD = f; }
  }
  const c = best == null ? fall : best;
  return { cm: c * 10, sg: sgOfSeg(autoSeg(c)) };
}
/** bar geometry in output px × scale, with the top-left of the mark box at (0, 0):
 *  → { rects:[{x,y,w,h,fill}] (segments, black first at 0, then mm cells), labels:[{x,y,text,size,align,base}],
 *      stroke:{x,y,w,h,lw} (the 1 output-px #000 outline), w, h, bar:{x,y,w,h}, len (output px), cm (length in cm) }.
 *  outW and outH (added optional) give the automatic length and the 4 %-of-short-side height cap; without ppc the bar is empty. */
export function scaleBarSpec(p, ppc, scale = 1, outW = 0, outH = 0) {
  p = p || {};
  const k = num(scale, 1) || 1, empty = { rects: [], labels: [], stroke: null, w: 0, h: 0, bar: { x: 0, y: 0, w: 0, h: 0 }, len: 0, cm: 0 };
  if (!(ppc > 0)) return empty;
  let cm10 = num(p.cm, 0), sg = num(p.sg, 0);
  if (!(cm10 > 0)) { const s = suggestBarCm(ppc, outW || 1000 * ppc, 0); cm10 = s.cm; if (!sg) sg = s.sg; }
  const cm = cm10 / 10, len = cm * ppc, S = outW > 0 && outH > 0 ? shortSide(outW, outH) : 0;
  const seg = SEG_CM[sg] > 0 ? SEG_CM[sg] : autoSeg(cm);
  let hb = num(p.hg, 0) > 0 && S ? (p.hg / 1000) * S : Math.max(8, Math.min(len / 10, S ? Math.max(8, 0.04 * S) : Infinity));
  hb = Math.max(2, hb);
  const fs = Math.max(11, 0.9 * hb), gap = 0.25 * hb, vert = num(p.o, 0) === 1, n = Math.max(1, Math.ceil(cm / seg - 1e-9));
  const ticks = [];
  const allLabels = num(p.lb, 0) === 1 && n <= 10;
  for (let i = 0; i <= n; i++) {
    const v = Math.min(cm, i * seg);
    if (!allLabels && i !== 0 && i !== n) continue;
    ticks.push({ at: v * ppc, text: i === n ? fmtCm(cm) + " cm" : fmtCm(v) });
  }
  const rects = [], labels = [], wOf = (t) => textEm(t, false) * fs;
  if (!vert) {
    const padL = wOf(ticks[0].text) / 2, padR = Math.max(0, wOf(ticks[ticks.length - 1].text) / 2);
    for (let i = 0; i < n; i++) {
      const x0 = i * seg * ppc, x1 = Math.min(len, (i + 1) * seg * ppc);
      if (x1 > x0) rects.push({ x: padL + x0, y: 0, w: x1 - x0, h: hb, fill: i % 2 ? "#fff" : "#000" });
    }
    if (num(p.mm, 0) === 1 && seg >= 1 && ppc >= 10) {
      for (let j = 0; j < 10; j++) rects.push({ x: padL + j * 0.1 * ppc, y: 0, w: 0.1 * ppc, h: hb / 2, fill: j % 2 ? "#000" : "#fff" });
    }
    ticks.forEach((t) => labels.push({ x: padL + t.at, y: hb + gap, text: t.text, size: fs, align: "center", base: "top" }));
    const out = { rects, labels, stroke: { x: padL, y: 0, w: len, h: hb, lw: 1 }, w: padL + len + padR, h: hb + gap + 1.2 * fs, bar: { x: padL, y: 0, w: len, h: hb }, len, cm };
    return scaleSpec(out, k);
  }
  const padT = fs / 2, maxW = Math.max(...ticks.map((t) => wOf(t.text)));
  for (let i = 0; i < n; i++) {
    const y0 = i * seg * ppc, y1 = Math.min(len, (i + 1) * seg * ppc);
    if (y1 > y0) rects.push({ x: 0, y: padT + len - y1, w: hb, h: y1 - y0, fill: i % 2 ? "#fff" : "#000" });
  }
  if (num(p.mm, 0) === 1 && seg >= 1 && ppc >= 10) {
    for (let j = 0; j < 10; j++) rects.push({ x: 0, y: padT + len - (j + 1) * 0.1 * ppc, w: hb / 2, h: 0.1 * ppc, fill: j % 2 ? "#000" : "#fff" });
  }
  ticks.forEach((t) => labels.push({ x: hb + gap, y: padT + len - t.at, text: t.text, size: fs, align: "left", base: "middle" }));
  const out = { rects, labels, stroke: { x: 0, y: padT, w: hb, h: len, lw: 1 }, w: hb + gap + maxW, h: len + fs, bar: { x: 0, y: padT, w: hb, h: len }, len, cm };
  return scaleSpec(out, k);
}
function scaleSpec(o, k) {
  if (k === 1) return o;
  const R = (r) => ({ ...r, x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k });
  return {
    ...o, rects: o.rects.map(R), labels: o.labels.map((l) => ({ ...l, x: l.x * k, y: l.y * k, size: l.size * k })),
    stroke: o.stroke ? { ...R(o.stroke), lw: o.stroke.lw * k } : null, w: o.w * k, h: o.h * k, bar: R(o.bar),
  };
}

/* ---------- the other overlays: size in output px ---------- */
function greySpec(p, S) {
  const s = 0.03 * S, vert = num(p.o, 0) === 1, fs = Math.max(9, 0.6 * s), gap = 0.15 * s;
  return vert ? { s, fs, gap, vert, w: s + gap + fs, h: 20 * s } : { s, fs, gap, vert, w: 20 * s, h: s + gap + 1.2 * fs };
}
function chartSpec(p, S) {
  const s = 0.03 * S, g = 0.08 * s, vert = num(p.o, 0) === 1, cols = vert ? 4 : 6, rows = vert ? 6 : 4;
  return { s, g, vert, cols, rows, w: cols * s + (cols + 1) * g, h: rows * s + (rows + 1) * g };
}
function tagSpec(p, S) {
  const s = String((p && p.s) || ""), fs = Math.max(8, (num(p.sz, 40) / 1000) * S), mono = !hasHangul(s);
  return { s, fs, mono, w: textEm(s, mono) * fs + 0.8 * fs, h: 1.2 * fs + 0.8 * fs };
}
function txtSpec(p, S) {
  const lines = textLines(p && p.s), fs = Math.max(6, (num(p.sz, 40) / 1000) * S), lh = 1.3 * fs;
  const w = Math.max(fs, ...lines.map((l) => textEm(l, false) * fs * (num(p.wt, 0) ? 1.04 : 1)));
  return { lines, fs, lh, w, h: Math.max(1, lines.length) * lh };
}
/** size {w, h} (output px) of a record's box, plus its kind and type names */
function sizeOf(rec, outW, outH, ppc) {
  const k = kindOf(rec), t = tOf(rec), p = (rec && rec.p) || {}, S = shortSide(outW, outH);
  if (k === "txt") { const s = txtSpec(p, S); return { k, t: "txt", w: s.w, h: s.h }; }
  if (t === "sb") { const s = scaleBarSpec(p, ppc, 1, outW, outH); return { k, t, w: s.w, h: s.h }; }
  if (t === "gs") { const s = greySpec(p, S); return { k, t, w: s.w, h: s.h }; }
  if (t === "cc") { const s = chartSpec(p, S); return { k, t, w: s.w, h: s.h }; }
  if (t === "tg") { const s = tagSpec(p, S); return { k, t, w: s.w, h: s.h }; }
  return { k, t, w: 0, h: 0 };
}
/** preset centre (output px) when p.x / p.y are absent: sb ps 0 아래 가운데 · 1 아래 왼쪽 · 2 아래 오른쪽 · 3 오른쪽 세로;
 *  gs ps 0 아래 · 1 왼쪽; cc ps 0 위 오른쪽 · 1 위 왼쪽 · 2 아래 오른쪽 · 3 아래 왼쪽; tg 아래 오른쪽; txt 위 가운데 */
function presetCentre(t, ps, W, H, w, h) {
  const m = margin(W, H), L = m + w / 2, R = W - m - w / 2, T = m + h / 2, B = H - m - h / 2, C = W / 2, M = H / 2;
  switch (t) {
    case "sb": return ps === 1 ? [L, B] : ps === 2 ? [R, B] : ps === 3 ? [R, M] : [C, B];
    case "gs": return ps === 1 ? [L, M] : [C, B];
    case "cc": return ps === 1 ? [L, T] : ps === 2 ? [R, B] : ps === 3 ? [L, B] : [R, T];
    case "tg": return [R, B];
    case "txt": return [C, T];
    default: return [C, M];
  }
}
/** → Rect in output px (centre at p.x, p.y ‰, else the preset place); zero size for an uncalibrated scale bar or an unknown type */
export function markBox(rec, outW, outH, ppc) {
  const sz = sizeOf(rec, outW, outH, ppc), p = (rec && rec.p) || {};
  let cx, cy;
  if (Number.isFinite(p.x) && Number.isFinite(p.y)) { cx = (p.x / 1000) * outW; cy = (p.y / 1000) * outH; }
  else [cx, cy] = presetCentre(sz.t, Math.round(num(p.ps, 0)), outW, outH, sz.w, sz.h);
  return { x: cx - sz.w / 2, y: cy - sz.h / 2, w: sz.w, h: sz.h };
}

const overlap = (a, b) => (!a || !b ? 0 : Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)));
/** default place of a new mark (§4.11, [PS §8] standard layout: object centred, scale bar below and parallel, strips along an edge,
 *  tag lower right, ≥ 5 % margins) avoiding objBox (output px, may be null) → { x, y } in ‰ of the output (integers, centre) */
export function autoPlace(t, outW, outH, objBox, ppc) {
  const rec = t === "txt" ? { k: "txt", p: { s: "A" } } : { k: "ov", t, p: {} };
  const sz = sizeOf(rec, outW, outH, ppc), w = sz.w, h = sz.h, m = margin(outW, outH), g = 0.03 * shortSide(outW, outH);
  const L = m + w / 2, R = outW - m - w / 2, T = m + h / 2, B = outH - m - h / 2, C = outW / 2;
  const ob = objBox && objBox.w > 0 && objBox.h > 0 ? objBox : null, cand = [];
  if (t === "sb") {
    if (ob) {
      const ox = clamp(ob.x + ob.w / 2, L, R);
      cand.push([ox, Math.min(B, ob.y + ob.h + g + h / 2)], [ox, B], [ox, Math.max(T, ob.y - g - h / 2)]);
    }
    cand.push([C, B], [L, B], [R, B], [C, T]);
  } else if (t === "gs") cand.push([C, B], [L, B], [R, B], [C, T]);
  else if (t === "cc") cand.push([R, T], [L, T], [R, B], [L, B]);
  else if (t === "tg") cand.push([R, B], [L, B], [R, T], [L, T]);
  else cand.push([C, T], [C, B], [L, T], [R, T]);
  const pad = ob ? { x: ob.x - g / 2, y: ob.y - g / 2, w: ob.w + g, h: ob.h + g } : null;
  let best = cand[0], bestO = Infinity;
  for (const c of cand) {
    const o = overlap({ x: c[0] - w / 2, y: c[1] - h / 2, w, h }, pad);
    if (o < bestO - 1e-9) { best = c; bestO = o; }
    if (o === 0) break;
  }
  return { x: clamp(Math.round((best[0] / outW) * 1000), 0, 1000), y: clamp(Math.round((best[1] / outH) * 1000), 0, 1000) };
}

/* ---------- drawing (vector paths only; ctx in device px, scale = device px per output px) ---------- */
const hexFill = (h) => "#" + h;
function strokeBox(ctx, x, y, w, h, lw) {
  ctx.lineWidth = lw;
  ctx.strokeStyle = "#000";
  ctx.strokeRect(x + lw / 2, y + lw / 2, Math.max(0, w - lw), Math.max(0, h - lw));
}
/** ov kinds (sb, gs, cc, tg) at their box; vector paths only. Draws nothing for an uncalibrated scale bar. */
export function drawMark(ctx, rec, outW, outH, scale = 1, ppc = null) {
  if (!ctx || !rec) return;
  const t = tOf(rec), p = rec.p || {}, k = num(scale, 1) || 1, S = shortSide(outW, outH), b = markBox(rec, outW, outH, ppc);
  if (!(b.w > 0) || !(b.h > 0)) return;
  const X = b.x * k, Y = b.y * k;
  ctx.save();
  if (t === "sb") {
    const s = scaleBarSpec(p, ppc, k, outW, outH);
    for (const r of s.rects) { ctx.fillStyle = r.fill; ctx.fillRect(X + r.x, Y + r.y, r.w, r.h); }
    if (s.stroke) strokeBox(ctx, X + s.stroke.x, Y + s.stroke.y, s.stroke.w, s.stroke.h, s.stroke.lw);
    ctx.fillStyle = "#000";
    for (const l of s.labels) {
      ctx.font = "500 " + l.size + "px " + FONT[0];
      ctx.textAlign = l.align; ctx.textBaseline = l.base;
      ctx.fillText(l.text, X + l.x, Y + l.y);
    }
  } else if (t === "gs") {
    const g = greySpec(p, S), s = g.s * k;
    GREY20.forEach((v, i) => {
      ctx.fillStyle = "rgb(" + v + "," + v + "," + v + ")";
      if (g.vert) ctx.fillRect(X, Y + i * s, s, s); else ctx.fillRect(X + i * s, Y, s, s);
    });
    strokeBox(ctx, X, Y, g.vert ? s : 20 * s, g.vert ? 20 * s : s, k);
    ctx.fillStyle = "#000";
    ctx.font = "500 " + g.fs * k + "px " + FONT[0];
    for (const [i, lab] of [[0, "A"], [7, "M"], [16, "B"]]) {
      if (g.vert) { ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(lab, X + s + g.gap * k, Y + (i + 0.5) * s); }
      else { ctx.textAlign = "center"; ctx.textBaseline = "top"; ctx.fillText(lab, X + (i + 0.5) * s, Y + s + g.gap * k); }
    }
  } else if (t === "cc") {
    const c = chartSpec(p, S), s = c.s * k, gg = c.g * k;
    ctx.fillStyle = "#000";
    ctx.fillRect(X, Y, b.w * k, b.h * k);
    for (let r = 0; r < 4; r++) for (let q = 0; q < 6; q++) {
      const col = c.vert ? r : q, row = c.vert ? q : r;
      ctx.fillStyle = hexFill(CHART24[r * 6 + q]);
      ctx.fillRect(X + gg + col * (s + gg), Y + gg + row * (s + gg), s, s);
    }
  } else if (t === "tg") {
    const g = tagSpec(p, S), fs = g.fs * k, fam = g.mono ? MONO : FONT[0];
    ctx.font = "500 " + fs + "px " + fam;
    let w = b.w * k;
    if (typeof ctx.measureText === "function") { const m = ctx.measureText(g.s); if (m && m.width > 0) w = m.width + 0.8 * fs; }
    const cx = X + (b.w * k) / 2, h = b.h * k;
    ctx.fillStyle = "#fff";
    ctx.fillRect(cx - w / 2, Y, w, h);
    strokeBox(ctx, cx - w / 2, Y, w, h, k);
    ctx.fillStyle = "#000"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(g.s, cx, Y + h / 2);
  }
  ctx.restore();
}
/** txt: lines of p.s (≤ 3) in FONT[fn], weight 700 (wt 1) or 500, size sz ‰ of the short side, colour c, aligned al 0/1/2 inside a
 *  block centred at p.x, p.y; the caller awaited ensureFont first */
export function drawText(ctx, rec, outW, outH, scale = 1) {
  if (!ctx || !rec) return;
  const p = rec.p || {}, k = num(scale, 1) || 1, S = shortSide(outW, outH), s = txtSpec(p, S), b = markBox({ ...rec, k: "txt" }, outW, outH, null);
  if (!s.lines.length || !s.lines.some((l) => l.length)) return;
  const fs = s.fs * k, lh = s.lh * k, al = Math.round(num(p.al, 0)), c = Array.isArray(p.c) && p.c.length === 3 ? p.c : [0, 0, 0];
  ctx.save();
  ctx.font = (num(p.wt, 0) ? "700 " : "500 ") + fs + "px " + FONT[num(p.fn, 0) === 1 ? 1 : 0];
  let bw = s.w * k;
  if (typeof ctx.measureText === "function") {
    const ws = s.lines.map((l) => { const m = ctx.measureText(l); return m && m.width > 0 ? m.width : 0; });
    if (Math.max(...ws) > 0) bw = Math.max(...ws);
  }
  const cx = (b.x + b.w / 2) * k, top = (b.y + b.h / 2) * k - (s.lines.length * lh) / 2, left = cx - bw / 2;
  ctx.fillStyle = "rgb(" + c.map((v) => clamp(Math.round(num(v, 0)), 0, 255)).join(",") + ")";
  ctx.textAlign = al === 1 ? "center" : al === 2 ? "right" : "left";
  ctx.textBaseline = "middle";
  const x = al === 1 ? cx : al === 2 ? left + bw : left;
  s.lines.forEach((l, i) => ctx.fillText(l, x, top + (i + 0.5) * lh));
  ctx.restore();
}
/** topmost record whose box (grown by max(4 px, 1 % of the short side)) contains (x, y) in output px → index | −1; hidden records skip */
export function hitMarks(recs, x, y, outW, outH, ppc) {
  const tol = Math.max(4, 0.01 * shortSide(outW, outH));
  for (let i = (recs || []).length - 1; i >= 0; i--) {
    const r = recs[i];
    if (!r || r.vis === 0) continue;
    const b = markBox(r, outW, outH, ppc);
    if (!(b.w > 0) || !(b.h > 0)) continue;
    if (x >= b.x - tol && x <= b.x + b.w + tol && y >= b.y - tol && y <= b.y + b.h + tol) return i;
  }
  return -1;
}
/** → string[] (≤ 3 lines; CR dropped) */
export function textLines(s) { return String(s == null ? "" : s).replace(/\r/g, "").split("\n").slice(0, 3); }

/* ---------- fonts ---------- */
const SERIF_HREF = "https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@500;700&display=swap";
let serifLink = null;
/** loads the face before a canvas render: Noto Sans KR is loaded by the theme; Noto Serif KR is injected once as a stylesheet link
 *  and awaited with document.fonts.load (both weights), raced against 4 s. → Promise<boolean> (false: fallback face, no DOM) */
export async function ensureFont(fn, text) {
  if (typeof document === "undefined" || !document.fonts || typeof document.fonts.load !== "function") return false;
  const serif = fn === 1, fam = serif ? "Noto Serif KR" : "Noto Sans KR", sample = String(text || "") || "A";
  try {
    if (serif && !serifLink && !document.querySelector('link[data-pe-font="serif"]')) {
      serifLink = document.createElement("link");
      serifLink.rel = "stylesheet"; serifLink.href = SERIF_HREF; serifLink.setAttribute("data-pe-font", "serif");
      document.head.appendChild(serifLink);
    }
    const load = Promise.all(["500", "700"].map((wt) => document.fonts.load(wt + ' 40px "' + fam + '"', sample)));
    await Promise.race([load, new Promise((r) => setTimeout(r, 4000))]);
    return typeof document.fonts.check === "function" ? document.fonts.check('500 40px "' + fam + '"', sample) : true;
  } catch (e) {
    return false;
  }
}
