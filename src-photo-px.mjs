/* ============================================================
   이미지 다듬기: 순수 픽셀 계산 (spec §5.4 src-photo-px.mjs, §4.8, §4.9, §5.6–§5.10; [PS] = read_photoshop-reference.md)
   담당 B. DOM 없음, 결정적(같은 입력 → 같은 출력). 형식화 배열만 다룬다.
   규약
   - RGBA 배열은 getImageData와 같은 straight alpha Uint8ClampedArray(길이 4·w·h). 공간 필터는 내부에서만 premultiplied로 계산한다.
   - rect = {x, y, w, h}는 배열 좌표의 정수 사각형. 생략하면 배열 전체. 공간 필터는 rect ± 여백을 읽고 rect만 쓴다.
   - 매개변수 객체(bcLut, levelsLut, exposureLut, adjLuts, adjFn, unsharp, addNoise, vignette, shadowsHighlights)는
     PSPEC(§2.4)에 저장되는 정수 단위 그대로 받는다(g = 감마×100, usm r = px×10, nz a = ‰ …). 빠진 키는 §4.8·§4.9의 기본값.
   - 마스크는 Uint8Array(w·h, 0..255). 128 이상을 "선택됨"으로 본다(달리 적힌 곳 제외).
   한글 문자열 리터럴 없음(주석만).
   ============================================================ */

/* ---------- 작은 도우미 ---------- */
const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const smooth01 = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
const fullRect = (w, h, r) => {
  if (!r) return { x: 0, y: 0, w, h };
  const x0 = Math.max(0, Math.floor(r.x)), y0 = Math.max(0, Math.floor(r.y));
  const x1 = Math.min(w, Math.floor(r.x) + Math.floor(r.w)), y1 = Math.min(h, Math.floor(r.y) + Math.floor(r.h));
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
};
const expandRect = (r, m, w, h) => {
  const x0 = Math.max(0, r.x - m), y0 = Math.max(0, r.y - m);
  const x1 = Math.min(w, r.x + r.w + m), y1 = Math.min(h, r.y + r.h + m);
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) };
};
/** fraction from a value given either as a fraction (≤ 1) or as percent (> 1) */
const frac = (v, d) => { v = num(v, d); return v > 1 ? v / 100 : v; };

/* sRGB ↔ linear light [PS §2.0] */
const DEC = new Float64Array(256);
for (let v = 0; v < 256; v++) { const c = v / 255; DEC[v] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
const decF = (v) => { const c = clamp01(v / 255); return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const encF = (L) => { L = clamp01(L); return 255 * (L <= 0.0031308 ? 12.92 * L : 1.055 * Math.pow(L, 1 / 2.4) - 0.055); };
const ENC_N = 4096;
let ENC = null;   // 0..1 linear → 0..255 sRGB, interpolated table (built on first use)
const encT = (L) => {
  if (!ENC) { ENC = new Float64Array(ENC_N + 1); for (let i = 0; i <= ENC_N; i++) ENC[i] = encF(i / ENC_N); }
  if (L <= 0) return 0;
  if (L >= 1) return 255;
  const f = L * ENC_N, i = f | 0;
  return ENC[i] + (ENC[i + 1] - ENC[i]) * (f - i);
};

/* HSL (h 0..360, s and l 0..1; rgb 0..255). The *Into forms write into o and allocate nothing (per-pixel paths). */
function hslInto(r, g, b, o) {
  r /= 255; g /= 255; b /= 255;
  const mx = r > g ? (r > b ? r : b) : g > b ? g : b, mn = r < g ? (r < b ? r : b) : g < b ? g : b, l = (mx + mn) / 2, d = mx - mn;
  if (d === 0) { o[0] = 0; o[1] = 0; o[2] = l; return o; }
  let h;
  if (mx === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  o[0] = h * 60; o[1] = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn); o[2] = l;
  return o;
}
function hue2c(p, q, t) {
  if (t < 0) t += 1; if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}
function rgbInto(h, s, l, o) {
  h %= 360; if (h < 0) h += 360; h /= 360; s = clamp01(s); l = clamp01(l);
  if (s === 0) { o[0] = o[1] = o[2] = l * 255; return o; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  o[0] = hue2c(p, q, h + 1 / 3) * 255; o[1] = hue2c(p, q, h) * 255; o[2] = hue2c(p, q, h - 1 / 3) * 255;
  return o;
}
const rgb2hsl = (r, g, b) => Array.from(hslInto(r, g, b, [0, 0, 0]));
const hsl2rgb = (h, s, l) => rgbInto(h, s, l, [0, 0, 0]);

/* ---------- tone LUTs [PS §2] ---------- */
const ident = () => { const l = new Uint8ClampedArray(256); for (let i = 0; i < 256; i++) l[i] = i; return l; };

/** → Uint8ClampedArray(256) */
export function lutIdentity() { return ident(); }
/** then ∘ first */
export function lutCompose(first, then) { const o = new Uint8ClampedArray(256); for (let i = 0; i < 256; i++) o[i] = then[first[i]]; return o; }

/** 밝기·대비 [PS §2.1]. b −150..150 (γ = 2^(−b/150)), c −50..100 (S-curve; below 0 a mid-flattening curve that keeps black and
 *  white, since Adobe's modern law keeps both end points); lg 1 = 「이전 방식」 (b, c read as ±100 legacy values). */
export function bcLut({ b, c, lg } = {}) {
  b = num(b, 0); c = num(c, 0);
  const l = new Uint8ClampedArray(256);
  if (num(lg, 0)) {
    const C = 2.55 * c, F = (259 * (C + 255)) / (255 * (259 - C));
    for (let v = 0; v < 256; v++) l[v] = F * (v - 128) + 128 + 2.55 * b;
    return l;
  }
  const gam = Math.pow(2, -b / 150), k = 1 + (1.5 * c) / 100;
  for (let v = 0; v < 256; v++) {
    let t = v / 255;
    if (b) t = Math.pow(t, gam);
    if (c > 0) t = t < 0.5 ? 0.5 * Math.pow(2 * t, k) : 1 - 0.5 * Math.pow(2 * (1 - t), k);
    else if (c < 0) t += (c / 100) * (t - 0.5) * 4 * t * (1 - t);   // flatter middle, black and white kept, slope ≥ 0.5
    l[v] = t * 255;
  }
  return l;
}

/** 레벨 [PS §2.2]. g = gamma × 100 (g > 100 brightens): 128 → 161 at g 150. */
export function levelsLut({ ib, g, iw, ob, ow } = {}) {
  ib = num(ib, 0); iw = num(iw, 255); ob = num(ob, 0); ow = num(ow, 255);
  const gam = Math.max(0.01, num(g, 100) / 100), span = Math.max(1, iw - ib), l = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) { const t = clamp01((v - ib) / span); l[v] = ob + Math.pow(t, 1 / gam) * (ow - ob); }
  return l;
}
const lvTup = (t) => (Array.isArray(t) && t.length === 5 ? levelsLut({ ib: t[0], g: t[1], iw: t[2], ob: t[3], ow: t[4] }) : null);

/** points → sorted [[x, y]] with unique x (accepts flat [x0,y0,…] or [[x,y],…]) */
function curvePts(flat) {
  const pts = [];
  if (!flat) return pts;
  if (Array.isArray(flat[0])) flat.forEach((p) => pts.push([num(p[0], 0), num(p[1], 0)]));
  else for (let i = 0; i + 1 < flat.length; i += 2) pts.push([num(flat[i], 0), num(flat[i + 1], 0)]);
  pts.sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const p of pts) if (!out.length || p[0] > out[out.length - 1][0]) out.push(p); else out[out.length - 1] = p;
  return out;
}
/** 곡선 [PS §2.3]. mode 0 부드럽게 (monotone Fritsch–Carlson, never inverts tones), 1 기본 (natural cubic spline, clamped). */
export function curveLut(flatPts, mode = 0) {
  const P = curvePts(flatPts), n = P.length;
  if (n < 2) return ident();
  const x = P.map((p) => p[0]), y = P.map((p) => p[1]), l = new Uint8ClampedArray(256);
  if (mode === 1) {
    const M = new Float64Array(n);
    if (n > 2) {
      const hh = [], a = new Float64Array(n), bb = new Float64Array(n), cc = new Float64Array(n), dd = new Float64Array(n);
      for (let i = 0; i < n - 1; i++) hh[i] = x[i + 1] - x[i];
      for (let i = 1; i < n - 1; i++) { a[i] = hh[i - 1]; bb[i] = 2 * (hh[i - 1] + hh[i]); cc[i] = hh[i]; dd[i] = 6 * ((y[i + 1] - y[i]) / hh[i] - (y[i] - y[i - 1]) / hh[i - 1]); }
      for (let i = 2; i < n - 1; i++) { const m = a[i] / bb[i - 1]; bb[i] -= m * cc[i - 1]; dd[i] -= m * dd[i - 1]; }
      for (let i = n - 2; i >= 1; i--) M[i] = (dd[i] - cc[i] * M[i + 1]) / bb[i];
    }
    for (let v = 0, k = 0; v < 256; v++) {
      if (v <= x[0]) { l[v] = y[0]; continue; }
      if (v >= x[n - 1]) { l[v] = y[n - 1]; continue; }
      while (v > x[k + 1]) k++;
      const h = x[k + 1] - x[k], A = (x[k + 1] - v) / h, B = (v - x[k]) / h;
      l[v] = A * y[k] + B * y[k + 1] + (((A * A * A - A) * M[k] + (B * B * B - B) * M[k + 1]) * h * h) / 6;
    }
    return l;
  }
  const dl = [], m = new Float64Array(n);
  for (let i = 0; i < n - 1; i++) dl[i] = (y[i + 1] - y[i]) / (x[i + 1] - x[i]);
  m[0] = dl[0]; m[n - 1] = dl[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = dl[i - 1] * dl[i] <= 0 ? 0 : (dl[i - 1] + dl[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (dl[i] === 0) { m[i] = m[i + 1] = 0; continue; }
    const al = m[i] / dl[i], be = m[i + 1] / dl[i], s = al * al + be * be;
    if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * al * dl[i]; m[i + 1] = t * be * dl[i]; }
  }
  for (let v = 0, k = 0; v < 256; v++) {
    if (v <= x[0]) { l[v] = y[0]; continue; }
    if (v >= x[n - 1]) { l[v] = y[n - 1]; continue; }
    while (v > x[k + 1]) k++;
    const h = x[k + 1] - x[k], t = (v - x[k]) / h, t2 = t * t, t3 = t2 * t;
    l[v] = (2 * t3 - 3 * t2 + 1) * y[k] + (t3 - 2 * t2 + t) * h * m[k] + (-2 * t3 + 3 * t2) * y[k + 1] + (t3 - t2) * h * m[k + 1];
  }
  return l;
}

/** 노출 [PS §2.4], linear light. e = stops × 100, o = offset × 1000, g = gamma × 100. */
export function exposureLut({ e, o, g } = {}) {
  const E = num(e, 0) / 100, O = num(o, 0) / 1000, G = Math.max(0.01, num(g, 100) / 100), l = new Uint8ClampedArray(256);
  if (!E && !O && G === 1) return ident();
  const k = Math.pow(2, E);
  for (let v = 0; v < 256; v++) {
    const L1 = DEC[v] * k + O;
    const L2 = Math.sign(L1) * Math.pow(Math.abs(L1), 1 / G);
    l[v] = encF(L2);
  }
  return l;
}

/** grey-point curve list (flat, possibly without end points) → LUT, mixed with identity by k/100 */
function gpLut(flat, k) {
  if (!Array.isArray(flat) || flat.length < 2) return null;
  const P = curvePts(flat);
  if (!P.length) return null;
  if (P[0][0] > 0) P.unshift([0, 0]);
  if (P[P.length - 1][0] < 255) P.push([255, 255]);
  const c = curveLut(P, 0);
  if (k >= 1) return c;
  const l = new Uint8ClampedArray(256);
  for (let i = 0; i < 256; i++) l[i] = i + (c[i] - i) * k;
  return l;
}

/** separable adjustments → { r, g, b } LUTs (channel curve first, then the composite [PS §2.0]); null when not separable */
export function adjLuts(t, p) {
  p = p || {};
  const one = (l) => ({ r: l, g: l, b: l });
  const chain = (comp, ch) => {
    const out = {};
    for (const c of ["r", "g", "b"]) {
      const a = ch[c], l = a && comp ? lutCompose(a, comp) : a || comp || ident();
      out[c] = l;
    }
    return out;
  };
  switch (t) {
    case "bc": return one(bcLut(p));
    case "ex": return one(exposureLut(p));
    case "lv": return chain(lvTup(p.l), { r: lvTup(p.r), g: lvTup(p.g), b: lvTup(p.b) });
    case "cv": {
      const md = num(p.md, 0) ? 1 : 0, cl = (k) => (Array.isArray(p[k]) ? curveLut(p[k], md) : null);
      return chain(cl("l"), { r: cl("r"), g: cl("g"), b: cl("b") });
    }
    case "gp": {
      const k = clamp01(num(p.k, 100) / 100);
      return { r: gpLut(p.r, k) || ident(), g: gpLut(p.g, k) || ident(), b: gpLut(p.b, k) || ident() };
    }
    default: return null;
  }
}

/** LUT read at a fractional input (linear between entries) */
const lutAt = (l, v) => { if (v <= 0) return l[0]; if (v >= 255) return l[255]; const i = v | 0, f = v - i; return f ? l[i] + (l[i + 1] - l[i]) * f : l[i]; };

/* Per-pixel colour kernels. prep*(p) parses stored params once; *Px(r, g, b, Q, o) writes 0..255 values (unclamped) into o.
   They share the scratch S3, so they never call each other recursively. */
const S3 = new Float64Array(3);
function psSatPx(r, g, b, inc, o) {
  const mx = r > g ? (r > b ? r : b) : g > b ? g : b, mn = r < g ? (r < b ? r : b) : g < b ? g : b, delta = (mx - mn) / 255;
  if (!delta || !inc) { o[0] = r; o[1] = g; o[2] = b; return o; }
  const value = (mx + mn) / 255, Lh = value / 2, S = Lh < 0.5 ? delta / value : delta / (2 - value), L = Lh * 255;
  let a;
  if (inc >= 0) { a = inc + S >= 1 ? S : 1 - inc; a = 1 / a - 1; o[0] = r + (r - L) * a; o[1] = g + (g - L) * a; o[2] = b + (b - L) * a; return o; }
  a = 1 + (inc < -1 ? -1 : inc);
  o[0] = L + (r - L) * a; o[1] = L + (g - L) * a; o[2] = L + (b - L) * a;
  return o;
}
function vibPx(r, g, b, v, o) {
  if (!v) { o[0] = r; o[1] = g; o[2] = b; return o; }
  const Y = 0.299 * r + 0.587 * g + 0.114 * b, mx = r > g ? (r > b ? r : b) : g > b ? g : b, mn = r < g ? (r < b ? r : b) : g < b ? g : b;
  const s = mx ? (mx - mn) / mx : 0;
  let k = v >= 0 ? 1 + v * (1 - s) * (1 - s) : 1 + v;
  if (v > 0) {
    let kmax = Infinity;
    if (r > Y) kmax = Math.min(kmax, (255 - Y) / (r - Y)); else if (r < Y) kmax = Math.min(kmax, Y / (Y - r));
    if (g > Y) kmax = Math.min(kmax, (255 - Y) / (g - Y)); else if (g < Y) kmax = Math.min(kmax, Y / (Y - g));
    if (b > Y) kmax = Math.min(kmax, (255 - Y) / (b - Y)); else if (b < Y) kmax = Math.min(kmax, Y / (Y - b));
    k = Math.max(1, Math.min(k, kmax));
  }
  o[0] = Y + (r - Y) * k; o[1] = Y + (g - Y) * k; o[2] = Y + (b - Y) * k;
  return o;
}
const HS_RANGES = ["r", "y", "g", "c", "b", "m"];   // centres 0, 60, …, 300°
function prepHS(p) {
  p = p || {};
  const a = Array.isArray(p.a) ? p.a : null, R = [];
  HS_RANGES.forEach((k, i) => { const v = p[k]; if (Array.isArray(v)) R.push([i * 60, num(v[0], 0), num(v[1], 0), num(v[2], 0)]); });
  const cz = Array.isArray(p.cz) ? [num(p.cz[0], 0), num(p.cz[1], 25) / 100, num(p.cz[2], 0)] : null;
  return { cz, h: a ? num(a[0], 0) : 0, s: a ? num(a[1], 0) : 0, l: a ? num(a[2], 0) : 0, R };
}
const lightOf = (c, dL) => (dL > 0 ? c + ((255 - c) * dL) / 100 : (c * (100 + dL)) / 100);
function hsPx(r, g, b, Q, o) {
  if (Q.cz) {
    rgbInto(Q.cz[0], Q.cz[1], (0.299 * r + 0.587 * g + 0.114 * b) / 255, o);
    const dL = Q.cz[2];
    if (dL) { o[0] = lightOf(o[0], dL); o[1] = lightOf(o[1], dL); o[2] = lightOf(o[2], dL); }
    return o;
  }
  let dH = Q.h, dS = Q.s, dL = Q.l;
  if (Q.R.length && !(r === g && g === b)) {
    const h0 = hslInto(r, g, b, S3)[0];
    for (const v of Q.R) {
      let dd = h0 - v[0]; if (dd < 0) dd = -dd; if (dd > 180) dd = 360 - dd;
      const wt = dd <= 15 ? 1 : dd < 45 ? (45 - dd) / 30 : 0;
      if (wt) { dH += wt * v[1]; dS += wt * v[2]; dL += wt * v[3]; }
    }
  }
  o[0] = r; o[1] = g; o[2] = b;
  if (!dH && !dS && !dL) return o;
  if (dH) { hslInto(r, g, b, S3); rgbInto(S3[0] + dH, S3[1], S3[2], o); }
  if (dS) psSatPx(o[0], o[1], o[2], dS > 100 ? 1 : dS < -100 ? -1 : dS / 100, o);
  if (dL) { dL = dL > 100 ? 100 : dL < -100 ? -100 : dL; o[0] = lightOf(o[0], dL); o[1] = lightOf(o[1], dL); o[2] = lightOf(o[2], dL); }
  return o;
}
const Z3 = [0, 0, 0];
function prepCB(p) {
  p = p || {};
  const t = (v) => (Array.isArray(v) ? [num(v[0], 0) / 100, num(v[1], 0) / 100, num(v[2], 0) / 100] : Z3);
  const S = t(p.s), M = t(p.m), H = t(p.h);
  return { S, M, H, pl: num(p.pl, 1), any: [S, M, H].some((v) => v[0] || v[1] || v[2]) };
}
function cbPx(r, g, b, Q, o) {
  if (!Q.any) { o[0] = r; o[1] = g; o[2] = b; return o; }
  const mx = r > g ? (r > b ? r : b) : g > b ? g : b, mn = r < g ? (r < b ? r : b) : g < b ? g : b, l = (mx + mn) / 510;
  const ws = clamp01((l - 0.333) / -0.25 + 0.5) * 0.7;
  const wm = clamp01((l - 0.333) / 0.25 + 0.5) * clamp01((l + 0.333 - 1) / -0.25 + 0.5) * 0.7;
  const wh = clamp01((l + 0.333 - 1) / 0.25 + 0.5) * 0.7, S = Q.S, M = Q.M, H = Q.H;
  const c0 = clamp01(r / 255 + S[0] * ws + M[0] * wm + H[0] * wh) * 255;
  const c1 = clamp01(g / 255 + S[1] * ws + M[1] * wm + H[1] * wh) * 255;
  const c2 = clamp01(b / 255 + S[2] * ws + M[2] * wm + H[2] * wh) * 255;
  if (Q.pl) { hslInto(c0, c1, c2, S3); return rgbInto(S3[0], S3[1], l, o); }
  o[0] = c0; o[1] = c1; o[2] = c2;
  return o;
}
const BW_DEF = [40, 60, 40, 60, 20, 80];   // R, Y, G, C, B, M (Photoshop defaults)
const prepBW = (w6) => (Array.isArray(w6) && w6.length === 6 ? w6.map((v) => num(v, 0) / 100) : BW_DEF.map((v) => v / 100));
function bwGrey(r, g, b, W) {
  if (r >= g && g >= b) return b + (r - g) * W[0] + (g - b) * W[1];
  if (r >= b && b >= g) return g + (r - b) * W[0] + (b - g) * W[5];
  if (g >= r && r >= b) return b + (g - r) * W[2] + (r - b) * W[1];
  if (g >= b && b >= r) return r + (g - b) * W[2] + (b - r) * W[3];
  if (b >= r && r >= g) return g + (b - r) * W[4] + (r - g) * W[5];
  return r + (b - g) * W[4] + (g - r) * W[3];
}
function setLumPx(r, g, b, l, o) {
  const d = l - (0.3 * r + 0.59 * g + 0.11 * b);
  r += d; g += d; b += d;
  const L = 0.3 * r + 0.59 * g + 0.11 * b, n = r < g ? (r < b ? r : b) : g < b ? g : b, x = r > g ? (r > b ? r : b) : g > b ? g : b;
  if (n < 0 && L - n > 1e-9) { const k = L / (L - n); r = L + (r - L) * k; g = L + (g - L) * k; b = L + (b - L) * k; }
  if (x > 255 && x - L > 1e-9) { const k = (255 - L) / (x - L); r = L + (r - L) * k; g = L + (g - L) * k; b = L + (b - L) * k; }
  o[0] = r; o[1] = g; o[2] = b;
  return o;
}
function prepPF(p) {
  p = p || {};
  const c = Array.isArray(p.c) && p.c.length === 3 ? p.c.map((v) => num(v, 0)) : [236, 138, 0];
  return { c, d: clamp01(num(p.d, 25) / 100), pl: num(p.pl, 1) };
}
function pfPx(r, g, b, Q, o) {
  const d = Q.d, c = Q.c;
  if (!d) { o[0] = r; o[1] = g; o[2] = b; return o; }
  const R = r + (c[0] - r) * d, G = g + (c[1] - g) * d, B = b + (c[2] - b) * d;
  if (Q.pl) return setLumPx(R, G, B, 0.3 * r + 0.59 * g + 0.11 * b, o);
  o[0] = R; o[1] = G; o[2] = B;
  return o;
}
/** (r, g, b, o) ⇒ o for a non-separable kind, or null */
function pixOf(t, p) {
  p = p || {};
  switch (t) {
    case "hs": { const Q = prepHS(p); return (r, g, b, o) => hsPx(r, g, b, Q, o); }
    case "cb": { const Q = prepCB(p); return (r, g, b, o) => cbPx(r, g, b, Q, o); }
    case "pf": { const Q = prepPF(p); return (r, g, b, o) => pfPx(r, g, b, Q, o); }
    case "vb": {
      const v = num(p.v, 0) / 100, s = num(p.s, 0) / 100;
      return (r, g, b, o) => {
        vibPx(r, g, b, v, o);
        if (s) { const Y = 0.299 * o[0] + 0.587 * o[1] + 0.114 * o[2], k = 1 + s; o[0] = Y + (o[0] - Y) * k; o[1] = Y + (o[1] - Y) * k; o[2] = Y + (o[2] - Y) * k; }
        return o;
      };
    }
    case "bw": {
      const W = prepBW(p.w), tn = Array.isArray(p.tn) && p.tn.length === 2 ? [num(p.tn[0], 0), num(p.tn[1], 0) / 100] : null;
      return (r, g, b, o) => {
        const y = bwGrey(r, g, b, W);
        if (tn) return rgbInto(tn[0], tn[1], clamp01(y / 255), o);
        o[0] = o[1] = o[2] = y;
        return o;
      };
    }
    default: return null;
  }
}

/** any adjustment → (r, g, b) ⇒ [r, g, b] with 0..255 numbers (fractional inputs allowed, outputs clamped, not rounded) */
export function adjFn(t, p) {
  const L = adjLuts(t, p);
  if (L) return (r, g, b) => [lutAt(L.r, r), lutAt(L.g, g), lutAt(L.b, b)];
  const px = pixOf(t, p);
  if (!px) return (r, g, b) => [r, g, b];
  const o = new Float64Array(3);
  return (r, g, b) => { px(r, g, b, o); return [clamp255(o[0]), clamp255(o[1]), clamp255(o[2])]; };
}

/** 33³ cube of fn (inputs and outputs 0..255; fn(r, g, b) at grid values). Layout ((b·n + g)·n + r)·3. */
export function bake3D(fn, n = 33) {
  const d = new Float32Array(n * n * n * 3);
  let i = 0;
  for (let b = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++) {
    const o = fn((r * 255) / (n - 1), (g * 255) / (n - 1), (b * 255) / (n - 1));
    d[i++] = o[0]; d[i++] = o[1]; d[i++] = o[2];
  }
  return d;
}
/** trilinear lookup of a bake3D cube, in place over rect */
export function apply3D(d, w, rect, lut, n = 33) {
  const R = fullRect(w, (d.length / 4 / w) | 0, rect), s = (n - 1) / 255, SG = n * 3, SB = n * n * 3, n2 = n - 2;
  for (let y = R.y; y < R.y + R.h; y++) {
    for (let x = 0, i = (y * w + R.x) * 4; x < R.w; x++, i += 4) {
      const fr = d[i] * s, fg = d[i + 1] * s, fb = d[i + 2] * s;
      let r0 = fr | 0, g0 = fg | 0, b0 = fb | 0;
      if (r0 > n2) r0 = n2; if (g0 > n2) g0 = n2; if (b0 > n2) b0 = n2;
      const dr = fr - r0, dg = fg - g0, db = fb - b0, er = 1 - dr, eg = 1 - dg, eb = 1 - db;
      const p000 = b0 * SB + g0 * SG + r0 * 3, p100 = p000 + 3, p010 = p000 + SG, p110 = p010 + 3;
      const p001 = p000 + SB, p101 = p001 + 3, p011 = p001 + SG, p111 = p011 + 3;
      const w000 = er * eg * eb, w100 = dr * eg * eb, w010 = er * dg * eb, w110 = dr * dg * eb;
      const w001 = er * eg * db, w101 = dr * eg * db, w011 = er * dg * db, w111 = dr * dg * db;
      d[i] = lut[p000] * w000 + lut[p100] * w100 + lut[p010] * w010 + lut[p110] * w110 + lut[p001] * w001 + lut[p101] * w101 + lut[p011] * w011 + lut[p111] * w111;
      d[i + 1] = lut[p000 + 1] * w000 + lut[p100 + 1] * w100 + lut[p010 + 1] * w010 + lut[p110 + 1] * w110 + lut[p001 + 1] * w001 + lut[p101 + 1] * w101 + lut[p011 + 1] * w011 + lut[p111 + 1] * w111;
      d[i + 2] = lut[p000 + 2] * w000 + lut[p100 + 2] * w100 + lut[p010 + 2] * w010 + lut[p110 + 2] * w110 + lut[p001 + 2] * w001 + lut[p101 + 2] * w101 + lut[p011 + 2] * w011 + lut[p111 + 2] * w111;
    }
  }
}
/** per-channel LUTs {r, g, b}, in place over rect */
export function applyLuts(d, w, rect, luts) {
  if (!luts) return;
  const R = fullRect(w, (d.length / 4 / w) | 0, rect), lr = luts.r, lg = luts.g, lb = luts.b;
  for (let y = R.y; y < R.y + R.h; y++) {
    for (let x = 0, i = (y * w + R.x) * 4; x < R.w; x++, i += 4) { d[i] = lr[d[i]]; d[i + 1] = lg[d[i + 1]]; d[i + 2] = lb[d[i + 2]]; }
  }
}
/** (added export) apply any adjustment exactly over rect, in place: separable kinds through adjLuts, the others through the
 *  per-pixel kernel of adjFn. The exact commit path of §5.6 (the 3D LUT is for slider drags). */
export function applyAdj(d, w, rect, t, p) {
  const L = adjLuts(t, p);
  if (L) { applyLuts(d, w, rect, L); return; }
  const px = pixOf(t, p);
  if (!px) return;
  const R = fullRect(w, (d.length / 4 / w) | 0, rect), o = new Float64Array(3);
  for (let y = R.y; y < R.y + R.h; y++) {
    for (let x = 0, i = (y * w + R.x) * 4; x < R.w; x++, i += 4) { px(d[i], d[i + 1], d[i + 2], o); d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2]; }
  }
}

/** below ← lerp(below, adjusted, k · mask/255) over rect, in place; lumOnly = 광도 blend (SetLum(below, Lum(adjusted))).
 *  below and adjusted share width w and coordinates; the mask (width maskW) is read at (x + mx0, y + my0). Alpha is kept. */
export function mixAdjusted(below, adjusted, w, rect, k, mask, maskW, lumOnly, mx0 = 0, my0 = 0) {
  const R = fullRect(w, (below.length / 4 / w) | 0, rect), o = new Float64Array(3);
  k = num(k, 1);
  const mw = maskW || w, mh = mask ? (mask.length / mw) | 0 : 0;
  for (let y = R.y; y < R.y + R.h; y++) {
    const my = y + my0;
    for (let x = R.x, i = (y * w + R.x) * 4; x < R.x + R.w; x++, i += 4) {
      let a = k;
      if (mask) { const mx = x + mx0; a = mx < 0 || my < 0 || mx >= mw || my >= mh ? 0 : (k * mask[my * mw + mx]) / 255; }
      if (a <= 0) continue;
      let r = adjusted[i], g = adjusted[i + 1], b = adjusted[i + 2];
      if (lumOnly) { setLumPx(below[i], below[i + 1], below[i + 2], 0.3 * r + 0.59 * g + 0.11 * b, o); r = o[0]; g = o[1]; b = o[2]; }
      if (a >= 1) { below[i] = r; below[i + 1] = g; below[i + 2] = b; continue; }
      below[i] += (r - below[i]) * a; below[i + 1] += (g - below[i + 1]) * a; below[i + 2] += (b - below[i + 2]) * a;
    }
  }
}

/* ---------- colour primitives (array-returning forms of the kernels above) ---------- */
/** Photoshop-like saturation [PS §2.5]; inc is a fraction −1..1 (+0.5: (200,100,50) → (250,83,0)); unclamped output */
export function psSat(r, g, b, inc) { return psSatPx(r, g, b, num(inc, 0), [0, 0, 0]); }
/** 활기 [PS §2.6]; v −1..1; boosts low-saturation pixels more and never leaves 0..255 */
export function vibrance(r, g, b, v) { return vibPx(r, g, b, num(v, 0), [0, 0, 0]); }
/** 색조·채도·명도 [PS §2.5] with stored params p: a (master) and r y g c b m = [hue, sat, light] (range weights: full within ±15°,
 *  linear to 0 at ±45°); cz = 색상화 [H, S, L]. Unclamped output. */
export function hueSat(r, g, b, p) { return hsPx(r, g, b, prepHS(p), [0, 0, 0]); }
/** 색상 균형 (GIMP 2.10 formulas [PS §2.7]); p.s, p.m, p.h = [cyan–red, magenta–green, yellow–blue] −100..100; pl 광도 유지 [1] */
export function colorBalance(r, g, b, p) { return cbPx(r, g, b, prepCB(p), [0, 0, 0]); }
/** 흑백 [PS §2.8]; w6 = [R, Y, G, C, B, M] weights in percent (−200..300) [40,60,40,60,20,80] → [grey, grey, grey] (unclamped) */
export function bwMix(r, g, b, w6) { const y = bwGrey(r, g, b, prepBW(w6)); return [y, y, y]; }
/** 포토 필터 [PS §2.9]; p.c [r,g,b] [#EC8A00], d density 0..100 [25], pl 광도 유지 [1] */
export function photoFilter(r, g, b, p) { return pfPx(r, g, b, prepPF(p), [0, 0, 0]); }
/** W3C Lum (0.30, 0.59, 0.11), 0..255 */
export function lum(r, g, b) { return 0.3 * r + 0.59 * g + 0.11 * b; }
/** W3C SetLum + ClipColor on 0..255 values */
export function setLum(rgb, l) { return setLumPx(rgb[0], rgb[1], rgb[2], l, [0, 0, 0]); }

/** 0.1 % clip limits of a 256-bin histogram */
function clipLimits(bins, clip) {
  let n = 0;
  for (let i = 0; i < 256; i++) n += bins[i];
  if (!n) return [0, 255];
  const need = Math.max(1, clip * n);
  let lo = 0, hi = 255, acc = 0;
  for (let i = 0; i < 256; i++) { acc += bins[i]; if (acc >= need) { lo = i; break; } }
  acc = 0;
  for (let i = 255; i >= 0; i--) { acc += bins[i]; if (acc >= need) { hi = i; break; } }
  if (hi <= lo) return [0, 255];
  return [lo, hi];
}
const lvClean = (ib, gm, iw) => {
  ib = Math.max(0, Math.min(253, Math.round(ib))); iw = Math.max(ib + 2, Math.min(255, Math.round(iw)));
  gm = Math.max(10, Math.min(999, Math.round(gm)));
  return ib === 0 && iw === 255 && gm === 100 ? null : [ib, gm, iw, 0, 255];
};
/** 자동 톤 ("tone", per channel), 자동 대비 ("contrast", one map for R, G, B), 자동 색상 ("color", per channel + neutral
 *  midtones by per-channel gamma) [PS §2.12] → lv params (PSPEC lv; identity channels omitted) */
export function autoLevels(hist, mode = "tone", clip = 0.001) {
  if (!hist) return {};
  const out = {};
  if (mode === "contrast") {
    const all = new Float64Array(256);
    for (let i = 0; i < 256; i++) all[i] = hist.r[i] + hist.g[i] + hist.b[i];
    const [lo, hi] = clipLimits(all, clip), t = lvClean(lo, 100, hi);
    if (t) out.l = t;
    return out;
  }
  const lim = { r: clipLimits(hist.r, clip), g: clipLimits(hist.g, clip), b: clipLimits(hist.b, clip) };
  const gam = { r: 100, g: 100, b: 100 };
  if (mode === "color") {
    const mean = {};
    for (const c of ["r", "g", "b"]) {
      const [lo, hi] = lim[c], bins = hist[c];
      let s = 0, n = 0;
      for (let i = 0; i < 256; i++) { const t = clamp01((i - lo) / Math.max(1, hi - lo)); s += t * bins[i]; n += bins[i]; }
      mean[c] = n ? s / n : 0.5;
    }
    const target = (mean.r + mean.g + mean.b) / 3;
    if (target > 0.02 && target < 0.98) {
      for (const c of ["r", "g", "b"]) {
        if (mean[c] > 0.02 && mean[c] < 0.98) gam[c] = (100 * Math.log(mean[c])) / Math.log(target);
      }
    }
  }
  for (const c of ["r", "g", "b"]) { const t = lvClean(lim[c][0], gam[c], lim[c][1]); if (t) out[c] = t; }
  return out;
}
/** 회색 맞추기 [PS §2.11]: sample [r, g, b] (5×5 mean) → per-channel curves through (c_k, target);
 *  target null keeps the sample's mean brightness, 118 = 18 % grey. Flat [0,0, c,Y, 255,255] (PSPEC gp). */
export function greyPointCurves(sample, target = null) {
  const s = Array.isArray(sample) ? sample : [128, 128, 128];
  const Y = Math.round(target == null ? (num(s[0], 128) + num(s[1], 128) + num(s[2], 128)) / 3 : target);
  const ty = Math.max(1, Math.min(254, Y));
  const one = (c) => { const x = Math.max(1, Math.min(254, Math.round(num(c, 128)))); return [0, 0, x, ty, 255, 255]; };
  return { r: one(s[0]), g: one(s[1]), b: one(s[2]) };
}

/* ---------- statistics ---------- */
/** → { r, g, b, l: Uint32Array(256), n }; skips α = 0 and (with a mask) mask < 128; l = 0.30/0.59/0.11 [PS §2.13] */
export function histogram(d, w, h, step = 1, mask = null) {
  const R = new Uint32Array(256), G = new Uint32Array(256), B = new Uint32Array(256), Lb = new Uint32Array(256);
  let n = 0;
  step = Math.max(1, step | 0);
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = y * w + x;
      if (mask && mask[i] < 128) continue;
      const j = i * 4;
      if (d[j + 3] === 0) continue;
      const r = d[j], g = d[j + 1], b = d[j + 2];
      R[r]++; G[g]++; B[b]++; Lb[(0.3 * r + 0.59 * g + 0.11 * b + 0.5) | 0]++; n++;
    }
  }
  return { r: R, g: G, b: B, l: Lb, n };
}
/** → { mean, sd, sat, rgb:[r,g,b], spread, n }: luma 0.30/0.59/0.11 mean and SD, sat = mean chroma (max − min, 0..255),
 *  rgb = mean colour, spread = 무채색 차이 of the mean colour (max − min) */
export function stats(d, w, h, mask = null, step = 2) {
  step = Math.max(1, step | 0);
  let n = 0, sy = 0, syy = 0, sc = 0, sr = 0, sg = 0, sb = 0;
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = y * w + x;
      if (mask && mask[i] < 128) continue;
      const j = i * 4;
      if (d[j + 3] === 0) continue;
      const r = d[j], g = d[j + 1], b = d[j + 2], Y = 0.3 * r + 0.59 * g + 0.11 * b;
      n++; sy += Y; syy += Y * Y; sc += Math.max(r, g, b) - Math.min(r, g, b); sr += r; sg += g; sb += b;
    }
  }
  if (!n) return { mean: 0, sd: 0, sat: 0, rgb: [0, 0, 0], spread: 0, n: 0 };
  const mean = sy / n, rgb = [sr / n, sg / n, sb / n];
  return { mean, sd: Math.sqrt(Math.max(0, syy / n - mean * mean)), sat: sc / n, rgb, spread: Math.max(...rgb) - Math.min(...rgb), n };
}

/* ---------- Gaussian machinery (box passes for σ ≥ 2, exact kernel below) [PS §5.1] ---------- */
function boxesForGauss(sigma, n = 3) {
  const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal);
  if (wl % 2 === 0) wl--;
  const wu = wl + 2, m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  const out = [];
  for (let i = 0; i < n; i++) out.push(((i < m ? wl : wu) - 1) / 2);
  return out;
}
const kernelOf = (sigma) => {
  const r = Math.max(1, Math.ceil(3 * sigma)), k = new Float64Array(2 * r + 1);
  let s = 0;
  for (let i = -r; i <= r; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); k[i + r] = v; s += v; }
  for (let i = 0; i < k.length; i++) k[i] /= s;
  return { k, r };
};
/** one row: box of radius r over C (1 or 4) interleaved channels (edge clamp, running sums), src → dst */
function box1D(src, dst, w, r, C) {
  const inv = 1 / (2 * r + 1);
  if (C === 1) {
    let a = 0;
    for (let x = -r; x <= r; x++) a += src[x < 0 ? 0 : x >= w ? w - 1 : x];
    for (let x = 0; x < w; x++) { dst[x] = a * inv; a += src[x + r + 1 < w ? x + r + 1 : w - 1] - src[x - r > 0 ? x - r : 0]; }
    return;
  }
  let a0 = 0, a1 = 0, a2 = 0, a3 = 0;
  for (let x = -r; x <= r; x++) { const j = (x < 0 ? 0 : x >= w ? w - 1 : x) * 4; a0 += src[j]; a1 += src[j + 1]; a2 += src[j + 2]; a3 += src[j + 3]; }
  for (let x = 0, j = 0; x < w; x++, j += 4) {
    dst[j] = a0 * inv; dst[j + 1] = a1 * inv; dst[j + 2] = a2 * inv; dst[j + 3] = a3 * inv;
    const ai = (x + r + 1 < w ? x + r + 1 : w - 1) * 4, ri = (x - r > 0 ? x - r : 0) * 4;
    a0 += src[ai] - src[ri]; a1 += src[ai + 1] - src[ri + 1]; a2 += src[ai + 2] - src[ri + 2]; a3 += src[ai + 3] - src[ri + 3];
  }
}
/** all horizontal box passes fused per row (the row stays in cache), in place */
function boxRowsH(buf, w, h, radii, C) {
  const W = w * C;
  let a = new Float64Array(W), b = new Float64Array(W);
  for (let y = 0; y < h; y++) {
    const o = y * W;
    for (let i = 0; i < W; i++) a[i] = buf[o + i];
    for (const r of radii) { box1D(a, b, w, r, C); const t = a; a = b; b = t; }
    for (let i = 0; i < W; i++) buf[o + i] = a[i];
  }
}
/** vertical box of radius r, row-wise running sums (cache friendly, any C), src → dst */
function boxV(src, dst, w, h, r, C) {
  const inv = 1 / (2 * r + 1), W = w * C, acc = new Float64Array(W);
  for (let y = -r; y <= r; y++) { const o = (y < 0 ? 0 : y >= h ? h - 1 : y) * W, S = src.subarray(o, o + W); for (let i = 0; i < W; i++) acc[i] += S[i]; }
  for (let y = 0; y < h; y++) {
    const o = y * W, ao = (y + r + 1 < h ? y + r + 1 : h - 1) * W, ro = (y - r > 0 ? y - r : 0) * W;
    const D = dst.subarray(o, o + W), SA = src.subarray(ao, ao + W), SR = src.subarray(ro, ro + W);
    for (let i = 0; i < W; i++) { const a = acc[i]; D[i] = a * inv; acc[i] = a + SA[i] - SR[i]; }
  }
}
/** horizontal convolution with a symmetric kernel (C = 1 or 4), src → dst */
function convH(src, dst, w, h, K, C) {
  const { k, r } = K, k0 = k[r];
  const at = (x) => (x < 0 ? 0 : x >= w ? w - 1 : x);
  for (let y = 0; y < h; y++) {
    const o = y * w * C;
    if (C === 1) {
      for (let x = 0; x < w; x++) {
        let s = k0 * src[o + x];
        if (x >= r && x < w - r) for (let t = 1; t <= r; t++) s += k[r + t] * (src[o + x - t] + src[o + x + t]);
        else for (let t = 1; t <= r; t++) s += k[r + t] * (src[o + at(x - t)] + src[o + at(x + t)]);
        dst[o + x] = s;
      }
      continue;
    }
    for (let x = 0; x < w; x++) {
      const p = o + x * 4;
      let s0 = k0 * src[p], s1 = k0 * src[p + 1], s2 = k0 * src[p + 2], s3 = k0 * src[p + 3];
      const inner = x >= r && x < w - r;
      for (let t = 1; t <= r; t++) {
        const pa = inner ? p - 4 * t : o + at(x - t) * 4, pb = inner ? p + 4 * t : o + at(x + t) * 4, kk = k[r + t];
        s0 += kk * (src[pa] + src[pb]); s1 += kk * (src[pa + 1] + src[pb + 1]); s2 += kk * (src[pa + 2] + src[pb + 2]); s3 += kk * (src[pa + 3] + src[pb + 3]);
      }
      dst[p] = s0; dst[p + 1] = s1; dst[p + 2] = s2; dst[p + 3] = s3;
    }
  }
}
/** vertical convolution with a symmetric kernel, row-wise, src → dst */
function convV(src, dst, w, h, K, C) {
  const { k, r } = K, W = w * C, k0 = k[r];
  for (let y = 0; y < h; y++) {
    const o = y * W;
    for (let i = 0; i < W; i++) dst[o + i] = k0 * src[o + i];
    for (let t = 1; t <= r; t++) {
      const ya = y - t < 0 ? 0 : y - t, yb = y + t >= h ? h - 1 : y + t, sa = ya * W, sb = yb * W, kk = k[r + t];
      for (let i = 0; i < W; i++) dst[o + i] += kk * (src[sa + i] + src[sb + i]);
    }
  }
}
/** σ ≥ 4: box-average down by f = 2ⁿ, blur with σ corrected for the resampling variance, bilinear back up (in place) */
function gaussDown(buf, w, h, sigma, C) {
  let f = 1;
  while (sigma / (f * 2) >= 2 && Math.min(w, h) / (f * 2) >= 8) f *= 2;
  const nw = Math.ceil(w / f), nh = Math.ceil(h / f), small = new Float32Array(nw * nh * C), acc = new Float64Array(C);
  for (let Y = 0; Y < nh; Y++) {
    const y0 = Y * f, y1 = Math.min(h, y0 + f);
    for (let X = 0; X < nw; X++) {
      const x0 = X * f, x1 = Math.min(w, x0 + f);
      acc.fill(0);
      for (let y = y0; y < y1; y++) for (let x = x0, j = (y * w + x0) * C; x < x1; x++, j += C) for (let c = 0; c < C; c++) acc[c] += buf[j + c];
      const inv = 1 / ((y1 - y0) * (x1 - x0)), q = (Y * nw + X) * C;
      for (let c = 0; c < C; c++) small[q + c] = acc[c] * inv;
    }
  }
  const s2 = Math.sqrt(Math.max(0.25, sigma * sigma - (f * f - 1) / 12 - (f * f) / 6)) / f;
  gaussBuf(small, nw, nh, s2, C);
  const xi0 = new Int32Array(w), xi1 = new Int32Array(w), xt = new Float64Array(w);
  for (let x = 0; x < w; x++) {
    const fx = Math.min(nw - 1, Math.max(0, (x + 0.5) / f - 0.5)), a = Math.floor(fx);
    xi0[x] = a * C; xi1[x] = Math.min(nw - 1, a + 1) * C; xt[x] = fx - a;
  }
  for (let y = 0; y < h; y++) {
    const fy = Math.min(nh - 1, Math.max(0, (y + 0.5) / f - 0.5)), a = Math.floor(fy), b = Math.min(nh - 1, a + 1), ty = fy - a;
    const ra = a * nw * C, rb = b * nw * C, o = y * w * C;
    for (let x = 0; x < w; x++) {
      const tx = xt[x], i0 = xi0[x], i1 = xi1[x], j = o + x * C;
      for (let c = 0; c < C; c++) {
        const top = small[ra + i0 + c] + (small[ra + i1 + c] - small[ra + i0 + c]) * tx;
        const bot = small[rb + i0 + c] + (small[rb + i1 + c] - small[rb + i0 + c]) * tx;
        buf[j + c] = top + (bot - top) * ty;
      }
    }
  }
  return buf;
}
/** Gaussian blur of a C-channel (1 or 4) interleaved Float32 buffer in place [PS §5.1], O(n) whatever σ:
 *  σ < 2 exact symmetric kernel; σ ≥ 2 three box passes (horizontal ones fused per row). Both have a support ≤ ceil(3σ) + 1, so a
 *  rect read with that margin gives exactly the whole-image result (slices never show seams). down = true (whole masks only, where
 *  the result need not be slice-exact) uses a 2ⁿ pyramid level for σ ≥ 4. */
function gaussBuf(buf, w, h, sigma, C, down = false) {
  if (!(sigma > 0.15) || !w || !h) return buf;
  if (sigma < 2) { const K = kernelOf(sigma), tmp = new Float32Array(buf.length); convH(buf, tmp, w, h, K, C); convV(tmp, buf, w, h, K, C); return buf; }
  if (down && sigma >= 4 && Math.min(w, h) >= 32) return gaussDown(buf, w, h, sigma, C);
  const radii = boxesForGauss(sigma).filter((r) => r >= 1);
  boxRowsH(buf, w, h, radii, C);
  let src = buf, dst = new Float32Array(buf.length);
  for (const r of radii) { boxV(src, dst, w, h, r, C); const t = src; src = dst; dst = t; }
  if (src !== buf) buf.set(src);
  return buf;
}

/* ---------- spatial (rect = region written; reads rect ± margin) ---------- */
/** Gaussian blur σ px of rect → new RGBA (rect.w × rect.h); premultiplied passes, so transparent edges get no dark fringe */
export function gaussRGBA(d, w, h, sigma, rect) {
  const R = fullRect(w, h, rect), out = new Uint8ClampedArray(R.w * R.h * 4);
  if (!R.w || !R.h) return out;
  if (!(sigma > 0.15)) {
    for (let y = 0; y < R.h; y++) out.set(d.subarray(((R.y + y) * w + R.x) * 4, ((R.y + y) * w + R.x + R.w) * 4), y * R.w * 4);
    return out;
  }
  const E = expandRect(R, Math.ceil(3 * sigma) + 1, w, h), A = new Float32Array(E.w * E.h * 4);
  let opaque = true;
  for (let y = 0; y < E.h && opaque; y++) for (let x = 0, i = ((E.y + y) * w + E.x) * 4 + 3; x < E.w; x++, i += 4) if (d[i] !== 255) { opaque = false; break; }
  for (let y = 0; y < E.h; y++) {
    const i0 = ((E.y + y) * w + E.x) * 4, j0 = y * E.w * 4;
    if (opaque) { A.set(d.subarray(i0, i0 + E.w * 4), j0); continue; }
    for (let x = 0, i = i0, j = j0; x < E.w; x++, i += 4, j += 4) {
      const a = d[i + 3], k = a / 255;
      A[j] = d[i] * k; A[j + 1] = d[i + 1] * k; A[j + 2] = d[i + 2] * k; A[j + 3] = a;
    }
  }
  gaussBuf(A, E.w, E.h, sigma, 4);
  for (let y = 0; y < R.h; y++) {
    const j0 = ((R.y - E.y + y) * E.w + (R.x - E.x)) * 4, o0 = y * R.w * 4;
    if (opaque) { out.set(A.subarray(j0, j0 + R.w * 4), o0); continue; }
    for (let x = 0, j = j0, o = o0; x < R.w; x++, j += 4, o += 4) {
      const a = A[j + 3];
      if (a < 0.01) { out[o] = out[o + 1] = out[o + 2] = out[o + 3] = 0; continue; }
      const k = 255 / a;
      out[o] = A[j] * k; out[o + 1] = A[j + 1] * k; out[o + 2] = A[j + 2] * k; out[o + 3] = a;
    }
  }
  return out;
}
/** Float32 plane, in place (σ px) */
export function gaussPlane(p, w, h, sigma) { gaussBuf(p, w, h, sigma, 1); return p; }

const lumaPlane601 = (d, w, E) => {
  const Y = new Float32Array(E.w * E.h);
  for (let y = 0; y < E.h; y++) for (let x = 0, i = ((E.y + y) * w + E.x) * 4, j = y * E.w; x < E.w; x++, i += 4, j++) Y[j] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  return Y;
};
/** 선명하게 (언샵 마스크) on luma [PS §5.2]: a amount % [80], r radius px×10 [10], th threshold levels [2]; writes rect of d.
 *  Reads rect ± 3σ from src (default d itself): pass an untouched copy as src when applying in slices. */
export function unsharp(d, w, h, { a, r, th } = {}, rect, src) {
  a = num(a, 80); r = num(r, 10); th = num(th, 2);
  const R = fullRect(w, h, rect), S = src || d;
  if (!a || !R.w || !R.h) return;
  const sigma = r / 10, E = expandRect(R, Math.ceil(3 * sigma) + 1, w, h);
  const Y = lumaPlane601(S, w, E), Yb = Y.slice();
  gaussPlane(Yb, E.w, E.h, sigma);
  const amt = a / 100;
  for (let y = 0; y < R.h; y++) {
    for (let x = 0, i = ((R.y + y) * w + R.x) * 4, j = (R.y - E.y + y) * E.w + (R.x - E.x); x < R.w; x++, i += 4, j++) {
      const diff = Y[j] - Yb[j];
      if (S !== d) { d[i] = S[i]; d[i + 1] = S[i + 1]; d[i + 2] = S[i + 2]; d[i + 3] = S[i + 3]; }
      if (Math.abs(diff) < th || !diff) continue;
      const dY = amt * diff;
      d[i] = S[i] + dY; d[i + 1] = S[i + 1] + dY; d[i + 2] = S[i + 2] + dY;
    }
  }
}

/** position hash → uint32: the first output of mulberry32(seed ^ x·73856093 ^ y·19349663 ^ c·83492791) */
function hash32(seed, x, y, c) {
  let a = (seed ^ Math.imul(x, 73856093) ^ Math.imul(y, 19349663) ^ Math.imul(c, 83492791)) >>> 0;
  a = (a + 0x6d2b79f5) >>> 0;
  let t = Math.imul(a ^ (a >>> 15), a | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return (t ^ (t >>> 14)) >>> 0;
}
/** position hash → [0, 1) */
const hashU = (seed, x, y, c) => hash32(seed, x, y, c) / 4294967296;
/** inverse normal CDF at 4096 midpoints (Acklam's rational approximation), so one hash gives one N(0, 1) sample */
let NORM = null;
function normTable() {
  if (NORM) return NORM;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const inv = (p) => {
    if (p < 0.02425) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - 0.02425) { const q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    const q = p - 0.5, r = q * q;
    return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  };
  NORM = new Float32Array(4096);
  for (let i = 0; i < 4096; i++) NORM[i] = inv((i + 0.5) / 4096);
  return NORM;
}
/** N(0, 1) sample at an absolute position */
const gaussAt = (seed, x, y, c) => normTable()[hash32(seed, x, y, c) >>> 20];
/** 노이즈·결 (노이즈 추가) [PS §5.3]: a ‰ of 255 [30], gs grain size 1..3 [1], mo 단색 [1], sd seed [0]; Gaussian, SD = A/2.
 *  Seeded by absolute pixel position: pixel (x, y) of d is (x + org.x, y + org.y), so any split into rects gives the same pixels.
 *  Grain sizes 2 and 3 interpolate a lattice of samples (spacing gs) bilinearly, rescaled to keep the SD. */
export function addNoise(d, w, h, { a, gs, mo, sd } = {}, rect, org) {
  a = num(a, 30); gs = Math.max(1, Math.min(3, Math.round(num(gs, 1)))); mo = num(mo, 1); const seed = num(sd, 0) >>> 0;
  const R = fullRect(w, h, rect);
  if (!a || !R.w || !R.h) return;
  const N = normTable(), ox = org ? num(org.x, 0) | 0 : 0, oy = org ? num(org.y, 0) | 0 : 0, S = ((a / 1000) * 255) / 2, nc = mo ? 1 : 3;
  if (gs === 1) {
    for (let y = R.y; y < R.y + R.h; y++) {
      const Y = y + oy;
      for (let x = R.x, i = (y * w + R.x) * 4; x < R.x + R.w; x++, i += 4) {
        const X = x + ox;
        if (nc === 1) { const n = S * N[hash32(seed, X, Y, 0) >>> 20]; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
        else { d[i] += S * N[hash32(seed, X, Y, 0) >>> 20]; d[i + 1] += S * N[hash32(seed, X, Y, 1) >>> 20]; d[i + 2] += S * N[hash32(seed, X, Y, 2) >>> 20]; }
      }
    }
    return;
  }
  const fx0 = (R.x + ox + 0.5) / gs - 0.5, fy0 = (R.y + oy + 0.5) / gs - 0.5, lx = Math.floor(fx0), ly = Math.floor(fy0);
  const lw = Math.floor((R.x + R.w - 1 + ox + 0.5) / gs - 0.5) - lx + 2, lh = Math.floor((R.y + R.h - 1 + oy + 0.5) / gs - 0.5) - ly + 2;
  const L = new Float32Array(lw * lh * nc);
  for (let j = 0; j < lh; j++) for (let i = 0; i < lw; i++) for (let c = 0; c < nc; c++) L[(j * lw + i) * nc + c] = 1.5 * gaussAt(seed, lx + i, ly + j, c);
  for (let y = R.y; y < R.y + R.h; y++) {
    const fy = (y + oy + 0.5) / gs - 0.5, y0 = Math.floor(fy), ty = fy - y0, jr = y0 - ly;
    for (let x = R.x, i = (y * w + R.x) * 4; x < R.x + R.w; x++, i += 4) {
      const fx = (x + ox + 0.5) / gs - 0.5, x0 = Math.floor(fx), tx = fx - x0, ir = x0 - lx;
      for (let c = 0; c < 3; c++) {
        const cc = nc === 1 ? 0 : c, p = (jr * lw + ir) * nc + cc, q = p + lw * nc;
        const v = (L[p] * (1 - tx) + L[p + nc] * tx) * (1 - ty) + (L[q] * (1 - tx) + L[q + nc] * tx) * ty;
        d[i + c] += S * v;
      }
    }
  }
}
/** 가장자리 밝기 (비네팅) [PS §5.5] in linear light: a −100..100 [0], m midpoint 0..100 [50].
 *  full = {w, h, x?, y?}: the frame (output frame mapped to d's coordinates; default the whole array) whose centre and half sizes
 *  define the falloff. In place over rect. */
export function vignette(d, w, h, { a, m } = {}, rect, full) {
  a = num(a, 0); m = num(m, 50);
  const R = fullRect(w, h, rect);
  if (!a || !R.w || !R.h) return;
  const F = full || { w, h }, fx = num(F.x, 0), fy = num(F.y, 0), hw = Math.max(1, num(F.w, w)) / 2, hh = Math.max(1, num(F.h, h)) / 2;
  const cx = fx + hw, cy = fy + hh, m0 = 0.2 + (0.6 * m) / 100, amt = a / 100;
  for (let y = R.y; y < R.y + R.h; y++) {
    const dy = (y + 0.5 - cy) / hh;
    for (let x = R.x, i = (y * w + R.x) * 4; x < R.x + R.w; x++, i += 4) {
      const dx = (x + 0.5 - cx) / hw, dd = Math.sqrt(dx * dx + dy * dy) / Math.SQRT2;
      if (dd <= m0) continue;
      const t = clamp01((dd - m0) / (1 - m0)), gain = 1 + amt * t * t * (3 - 2 * t);
      d[i] = encT(DEC[d[i]] * gain); d[i + 1] = encT(DEC[d[i + 1]] * gain); d[i + 2] = encT(DEC[d[i + 2]] * gain);
    }
  }
}
/** 그림자 밝히기 (어두운 영역/밝은 영역): sa shadows 0..100 [35], ha highlights 0..100 [0], r radius px [30].
 *  The local tone Yb = gauss(Y, r) weights a gamma lift of dark areas and a gamma compression of bright ones;
 *  the luma change is added to R, G and B (tones only, hue kept). Writes rect of d; reads rect ± 3r from src (default d). */
export function shadowsHighlights(d, w, h, { sa, ha, r } = {}, rect, src) {
  sa = num(sa, 35) / 100; ha = num(ha, 0) / 100; r = Math.max(1, num(r, 30));
  const R = fullRect(w, h, rect), S = src || d;
  if ((!sa && !ha) || !R.w || !R.h) return;
  if (S !== d) for (let y = 0; y < R.h; y++) { const i0 = ((R.y + y) * w + R.x) * 4; d.set(S.subarray(i0, i0 + R.w * 4), i0); }
  const E = expandRect(R, Math.ceil(3 * r) + 1, w, h), Y = lumaPlane601(S, w, E);
  for (let i = 0; i < Y.length; i++) Y[i] /= 255;
  const Yb = Y.slice();
  gaussPlane(Yb, E.w, E.h, r);
  for (let y = 0; y < R.h; y++) {
    for (let x = 0, i = ((R.y + y) * w + R.x) * 4, j = (R.y - E.y + y) * E.w + (R.x - E.x); x < R.w; x++, i += 4, j++) {
      const y0 = Y[j], yb = Yb[j];
      let y1 = y0;
      if (sa) { const ws = 1 - smooth01(yb / 0.5); if (ws > 0) y1 = Math.pow(clamp01(y1), 1 / (1 + 2 * sa * ws)); }
      if (ha) { const wh = smooth01((yb - 0.5) / 0.5); if (wh > 0) y1 = 1 - Math.pow(clamp01(1 - y1), 1 / (1 + 2 * ha * wh)); }
      const dY = (y1 - y0) * 255;
      if (dY) { d[i] += dY; d[i + 1] += dY; d[i + 2] += dY; }
    }
  }
}

/* ---------- connected components (shared by holes, clusters, objectBox) ---------- */
/** labels pixels where on[i] is truthy; conn8 for 8-neighbour connectivity. → { lab:Int32Array, n, area, border, box:[x0,y0,x1,y1]… } */
function components(on, w, h, conn8) {
  const lab = new Int32Array(w * h).fill(-1), stack = new Int32Array(w * h), area = [], border = [], box = [];
  let n = 0;
  for (let s = 0; s < w * h; s++) {
    if (!on[s] || lab[s] >= 0) continue;
    let sp = 0, ar = 0, bd = false, x0 = w, y0 = h, x1 = -1, y1 = -1;
    stack[sp++] = s; lab[s] = n;
    while (sp) {
      const p = stack[--sp], x = p % w, y = (p - x) / w;
      ar++;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) bd = true;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          if (!conn8 && dx && dy) continue;
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const q = yy * w + xx;
          if (on[q] && lab[q] < 0) { lab[q] = n; stack[sp++] = q; }
        }
      }
    }
    area.push(ar); border.push(bd); box.push([x0, y0, x1, y1]); n++;
  }
  return { lab, n, area, border, box };
}
const binOf = (m, thr = 128) => { const b = new Uint8Array(m.length); for (let i = 0; i < m.length; i++) b[i] = m[i] >= thr ? 1 : 0; return b; };

/* ---------- masks and selection ---------- */
/** 자동 선택 [PS §4.7]: tol = max channel difference in 8-bit levels (incl. alpha); contiguous = 인접한 곳만 (scanline fill) → Mask 0/255 */
export function wand(d, w, h, x, y, tol, contiguous = true) {
  const n = w * h, m = new Uint8Array(n);
  x = Math.floor(num(x, -1)); y = Math.floor(num(y, -1));
  if (x < 0 || y < 0 || x >= w || y >= h) return m;
  const s = (y * w + x) * 4, r0 = d[s], g0 = d[s + 1], b0 = d[s + 2], a0 = d[s + 3], T = Math.max(0, num(tol, 24));
  const ok = new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const dr = d[j] - r0, dg = d[j + 1] - g0, db = d[j + 2] - b0, da = d[j + 3] - a0;
    ok[i] = (dr < 0 ? -dr : dr) <= T && (dg < 0 ? -dg : dg) <= T && (db < 0 ? -db : db) <= T && (da < 0 ? -da : da) <= T ? 1 : 0;
  }
  if (!contiguous) { for (let i = 0; i < n; i++) if (ok[i]) m[i] = 255; return m; }
  let st = new Int32Array(1024), sp = 0;
  const push = (px, py) => { if (sp + 2 > st.length) { const t = new Int32Array(st.length * 2); t.set(st); st = t; } st[sp++] = px; st[sp++] = py; };
  push(x, y);
  while (sp) {
    const py = st[--sp], px = st[--sp], row = py * w;
    if (m[row + px] || !ok[row + px]) continue;
    let l = px, r = px;
    while (l > 0 && !m[row + l - 1] && ok[row + l - 1]) l--;
    while (r < w - 1 && !m[row + r + 1] && ok[row + r + 1]) r++;
    for (let i = l; i <= r; i++) m[row + i] = 255;
    for (const ny of [py - 1, py + 1]) {
      if (ny < 0 || ny >= h) continue;
      const nr = ny * w;
      let run = false;
      for (let i = l; i <= r; i++) {
        const q = !m[nr + i] && ok[nr + i];
        if (q && !run) { push(i, ny); run = true; } else if (!q) run = false;
      }
    }
  }
  return m;
}
/** union of corner and edge-midpoint wands (seeds far from the seeds' median colour are skipped), small holes filled; binary */
function bgBinary(d, w, h, tol) {
  const n = w * h, ins = Math.min(2, Math.floor((Math.min(w, h) - 1) / 2));
  const xs = [ins, w >> 1, w - 1 - ins], ys = [ins, h >> 1, h - 1 - ins], seeds = [];
  for (const sy of ys) for (const sx of xs) if (!(sx === xs[1] && sy === ys[1])) seeds.push([sx, sy]);
  const col = seeds.map(([sx, sy]) => { const j = (sy * w + sx) * 4; return [d[j], d[j + 1], d[j + 2]]; });
  const med = [0, 1, 2].map((c) => col.map((v) => v[c]).sort((a, b) => a - b)[col.length >> 1]);
  const keep = seeds.filter((_, i) => Math.max(...[0, 1, 2].map((c) => Math.abs(col[i][c] - med[c]))) <= 2 * tol);
  const m = new Uint8Array(n);
  for (const [sx, sy] of keep.length ? keep : seeds) {
    if (m[sy * w + sx]) continue;
    const one = wand(d, w, h, sx, sy, tol, true);
    for (let i = 0; i < n; i++) if (one[i]) m[i] = 255;
  }
  return maskFillHoles(m, w, h, Math.max(16, Math.floor(n / 1000)));
}
/** 배경만 고르기 (§5.8) → { mask, ok }: corner + edge-midpoint wands, small holes filled, grow 1, feather 2.
 *  ok is false when the background covers < 5 % or > 85 % of the image. */
export function backgroundMask(d, w, h, tol = 24) {
  const b = bgBinary(d, w, h, num(tol, 24)), cov = maskCoverage(b, 128);
  return { mask: maskFeather(maskGrow(b, w, h, 1), w, h, 2), ok: cov >= 50 && cov <= 850 };
}
/** 사물에 맞춰 자르기 · 사물 긴 변: bbox of the non-background components of at least 0.2 % of the image → Rect | null */
export function objectBox(d, w, h) {
  const b = bgBinary(d, w, h, 24), cov = maskCoverage(b, 128);
  if (cov < 50 || cov > 970) return null;
  const on = new Uint8Array(w * h);
  for (let i = 0; i < on.length; i++) on[i] = b[i] < 128 ? 1 : 0;
  const C = components(on, w, h, true), minA = Math.max(9, Math.floor(w * h * 0.002));
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let k = 0; k < C.n; k++) {
    if (C.area[k] < minA) continue;
    const bx = C.box[k];
    if (bx[0] < x0) x0 = bx[0]; if (bx[1] < y0) y0 = bx[1]; if (bx[2] > x1) x1 = bx[2]; if (bx[3] > y1) y1 = bx[3];
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
/** op "new" (b) | "add" (max) | "sub" (a·(255−b)/255) | "and" (min) → new Mask; a may be null */
export function maskCombine(a, b, op) {
  const n = b ? b.length : a ? a.length : 0, o = new Uint8Array(n);
  if (op === "new" || !a) { if (op === "sub" || op === "and") return o; if (b) o.set(b); return o; }
  if (!b) { o.set(a); return o; }
  for (let i = 0; i < n; i++) {
    const x = a[i], y = b[i];
    o[i] = op === "add" ? (x > y ? x : y) : op === "sub" ? Math.round((x * (255 - y)) / 255) : op === "and" ? (x < y ? x : y) : y;
  }
  return o;
}
/** 가장자리 부드럽게: Gaussian of the mask, σ = px → new Mask (σ ≥ 4 blurs a pyramid level: whole masks only) */
export function maskFeather(m, w, h, px) {
  if (!(px > 0)) return m.slice();
  const f = Float32Array.from(m);
  gaussBuf(f, w, h, px, 1, true);
  const o = new Uint8Array(m.length);
  for (let i = 0; i < o.length; i++) o[i] = f[i] < 0 ? 0 : f[i] > 255 ? 255 : Math.round(f[i]);
  return o;
}
/** exact squared Euclidean distance to the nearest set pixel, O(n): vertical distances by two row-major scans, then the
 *  Felzenszwalb–Huttenlocher lower envelope along each row (every pass walks memory in order) */
function edt(on, w, h) {
  const BIG = 1e7, G = new Float64Array(w * h);
  for (let x = 0; x < w; x++) G[x] = on[x] ? 0 : BIG;
  for (let y = 1; y < h; y++) {
    const o = y * w, p = o - w;
    for (let x = 0; x < w; x++) G[o + x] = on[o + x] ? 0 : G[p + x] + 1;
  }
  for (let y = h - 2; y >= 0; y--) {
    const o = y * w, q = o + w;
    for (let x = 0; x < w; x++) { const b = G[q + x] + 1; if (b < G[o + x]) G[o + x] = b; }
  }
  for (let i = 0; i < G.length; i++) G[i] *= G[i];
  const INF = 1e20, f = new Float64Array(w), v = new Int32Array(w), z = new Float64Array(w + 1);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) f[x] = G[o + x];
    let k = 0; v[0] = 0; z[0] = -INF; z[1] = INF;
    for (let q = 1; q < w; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) { k--; s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
      k++; v[k] = q; z[k] = s; z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < w; q++) { while (z[k + 1] < q) k++; const dq = q - v[k]; G[o + q] = dq * dq + f[v[k]]; }
  }
  return G;
}
/** one step of the radius-1 Euclidean disc (the 4-neighbour cross) at threshold 128 */
function cross1(m, w, h, grow) {
  const o = m.slice();
  for (let y = 0; y < h; y++) {
    const r = y * w;
    for (let x = 0; x < w; x++) {
      const i = r + x;
      if (grow) {
        if (m[i] >= 128) { o[i] = 255; continue; }
        if ((x > 0 && m[i - 1] >= 128) || (x < w - 1 && m[i + 1] >= 128) || (y > 0 && m[i - w] >= 128) || (y < h - 1 && m[i + w] >= 128)) o[i] = 255;
      } else {
        if (m[i] < 128) { o[i] = 0; continue; }
        if ((x > 0 && m[i - 1] < 128) || (x < w - 1 && m[i + 1] < 128) || (y > 0 && m[i - w] < 128) || (y < h - 1 && m[i + w] < 128)) o[i] = 0;
      }
    }
  }
  return o;
}
/** 넓히기 (px > 0) · 좁히기 (px < 0) by an exact Euclidean disc at threshold 128; soft values outside the change are kept
 *  (grow: max(m, disc), shrink: min(m, eroded)). The image border does not shrink the selection. Radii 1 and 2 (the discs are
 *  the cross and the diamond) step the cross; larger radii use the distance transform. → new Mask */
export function maskGrow(m, w, h, px) {
  px = num(px, 0);
  if (!px) return m.slice();
  const a = Math.abs(px);
  if (a <= 2 && Number.isInteger(a)) { let o = cross1(m, w, h, px > 0); if (a === 2) o = cross1(o, w, h, px > 0); return o; }
  const n = w * h, o = new Uint8Array(n), R2 = px * px + 1e-6;
  if (px > 0) {
    const D = edt(binOf(m), w, h);
    for (let i = 0; i < n; i++) o[i] = D[i] <= R2 ? 255 : m[i];
    return o;
  }
  const off = new Uint8Array(n);
  for (let i = 0; i < n; i++) off[i] = m[i] < 128 ? 1 : 0;
  const D = edt(off, w, h);
  for (let i = 0; i < n; i++) o[i] = D[i] <= R2 ? 0 : m[i];
  return o;
}
/** 255 − m */
export function maskInvert(m) { const o = new Uint8Array(m.length); for (let i = 0; i < m.length; i++) o[i] = 255 - m[i]; return o; }
/** fills unselected regions (m < 128, 4-connected) that do not touch the border and are at most maxArea px → new Mask */
export function maskFillHoles(m, w, h, maxArea = Infinity) {
  const on = new Uint8Array(w * h);
  for (let i = 0; i < on.length; i++) on[i] = m[i] < 128 ? 1 : 0;
  const C = components(on, w, h, false), o = m.slice();
  const fill = new Uint8Array(C.n);
  for (let k = 0; k < C.n; k++) fill[k] = !C.border[k] && C.area[k] <= maxArea ? 1 : 0;
  for (let i = 0; i < o.length; i++) { const l = C.lab[i]; if (l >= 0 && fill[l]) o[i] = 255; }
  return o;
}
/** → Rect | null */
export function maskBBox(m, w, h, thr = 1) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    const o = y * w;
    for (let x = 0; x < w; x++) if (m[o + x] >= thr) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
/** → ‰ integer of pixels ≥ thr */
export function maskCoverage(m, thr = 1) { let n = 0; for (let i = 0; i < m.length; i++) if (m[i] >= thr) n++; return m.length ? Math.round((n * 1000) / m.length) : 0; }
/** → number of 8-connected groups of at least minPx pixels (「n곳」) */
export function maskClusters(m, w, h, thr = 128, minPx = 9) {
  const C = components(binOf(m, thr), w, h, true);
  let k = 0;
  for (let i = 0; i < C.n; i++) if (C.area[i] >= minPx) k++;
  return k;
}
/** marching-ants outline at threshold 128 [PS §4.8] → Int32Array [x0,y0,x1,y1,…] of merged horizontal and vertical pixel edges */
export function maskEdges(m, w, h) {
  const ins = (x, y) => x >= 0 && y >= 0 && x < w && y < h && m[y * w + x] >= 128, seg = [];
  for (let y = 0; y <= h; y++) {
    let x0 = -1;
    for (let x = 0; x <= w; x++) {
      const e = x < w && ins(x, y - 1) !== ins(x, y);
      if (e && x0 < 0) x0 = x; else if (!e && x0 >= 0) { seg.push(x0, y, x, y); x0 = -1; }
    }
  }
  for (let x = 0; x <= w; x++) {
    let y0 = -1;
    for (let y = 0; y <= h; y++) {
      const e = y < h && ins(x - 1, y) !== ins(x, y);
      if (e && y0 < 0) y0 = y; else if (!e && y0 >= 0) { seg.push(x, y0, x, y); y0 = -1; }
    }
  }
  return Int32Array.from(seg);
}
/** does the disc (cx, cy, r) meet mask values ≥ thr? (pin overlap, po) */
export function discOverlap(m, w, h, cx, cy, r, thr = 64) {
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(w - 1, Math.ceil(cx + r)), y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(h - 1, Math.ceil(cy + r));
  const r2 = r * r;
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - cy;
    for (let x = x0; x <= x1; x++) { const dx = x + 0.5 - cx; if (dx * dx + dy * dy <= r2 && m[y * w + x] >= thr) return true; }
  }
  return false;
}
export function isBinaryish(m, frac = 0.95) { let n = 0; for (let i = 0; i < m.length; i++) if (m[i] === 0 || m[i] === 255) n++; return !m.length || n / m.length >= frac; }
/** run-length code: header 0xA1 then (value, LEB128 run) pairs; falls back to header 0xA0 + raw bytes when that is not smaller */
export function rleEncode(m) {
  const n = m.length;
  let buf = new Uint8Array(Math.min(n + 16, 64 + (n >> 3))), p = 0;
  const put = (v) => { if (p >= buf.length) { const t = new Uint8Array(buf.length * 2 + 16); t.set(buf); buf = t; } buf[p++] = v; };
  put(0xa1);
  for (let i = 0; i < n;) {
    const v = m[i];
    let j = i + 1;
    while (j < n && m[j] === v) j++;
    put(v);
    let run = j - i;
    while (run >= 0x80) { put((run & 0x7f) | 0x80); run >>>= 7; }
    put(run);
    i = j;
    if (p > n) break;
  }
  if (p > n) { const raw = new Uint8Array(n + 1); raw[0] = 0xa0; raw.set(m, 1); return raw; }
  return buf.slice(0, p);
}
/** inverse of rleEncode; never throws (short or malformed input leaves zeros); unknown headers are read as raw bytes */
export function rleDecode(buf, n) {
  const o = new Uint8Array(n);
  if (!buf || !buf.length) return o;
  if (buf[0] === 0xa0) { for (let i = 0; i < n && i + 1 < buf.length; i++) o[i] = buf[i + 1]; return o; }
  if (buf[0] !== 0xa1) { for (let i = 0; i < n && i < buf.length; i++) o[i] = buf[i]; return o; }
  let p = 1, q = 0;
  while (p < buf.length && q < n) {
    const v = buf[p++];
    let run = 0, sh = 0, b;
    do { b = buf[p++]; if (b === undefined) return o; run += (b & 0x7f) * Math.pow(2, sh); sh += 7; } while (b & 0x80);
    const end = Math.min(n, q + run);
    if (v) o.fill(v, q, end);
    q = end;
  }
  return o;
}

/* ---------- brush support and retouch ---------- */
/** brush tip [PS §4.1]: 1 inside R·hard, smoothstep to 0 at R, 2× supersampled → Float32Array(diam²). hard 0..1 (> 1 = percent) */
export function tipAlpha(diam, hard) {
  const D = Math.max(1, Math.round(num(diam, 1))), H = clamp01(frac(hard, 0.5)), R = D / 2, Ri = R * H, out = new Float32Array(D * D);
  const fall = Math.max(1e-6, R - Ri);
  for (let y = 0; y < D; y++) {
    for (let x = 0; x < D; x++) {
      let s = 0;
      for (const oy of [0.25, 0.75]) for (const ox of [0.25, 0.75]) {
        const dx = x + ox - R, dy = y + oy - R, dd = Math.sqrt(dx * dx + dy * dy);
        s += dd <= Ri ? 1 : dd >= R ? 0 : 1 - smooth01((dd - Ri) / fall);
      }
      out[y * D + x] = s / 4;
    }
  }
  if (D <= 2) for (let i = 0; i < out.length; i++) out[i] = Math.max(out[i], H >= 0.99 ? 1 : 0.5);
  return out;
}
/** 밝게·어둡게 칠하기 LUT (GIMP gimp-gegl-loops formulas [PS §4.5]); range 0 shadows, 1 midtones, 2 highlights; e −1..1 (burn < 0)
 *  → Float32Array(256) of 0..255 values */
export function dodgeBurnLut(range, e) {
  e = Math.max(-1, Math.min(1, num(e, 0)));
  const l = new Float32Array(256);
  for (let v = 0; v < 256; v++) {
    const i = v / 255;
    let o;
    if (range === 2) o = i * (1 + e / 3);
    else if (range === 0) {
      if (e >= 0) { const k = e / 3; o = k + i - k * i; } else { const k = -e / 3; o = i < k ? 0 : (i - k) / (1 - k); }
    } else o = Math.pow(i, e < 0 ? 1 - e / 3 : 1 / (1 + e));
    l[v] = clamp01(o) * 255;
  }
  return l;
}
/** 스펀지: amt −1..1 (negative desaturates); chroma scaled around luma by (1 + amt), or the vibrance law when vib */
export function spongeFn(amt, vib) {
  amt = Math.max(-1, Math.min(1, num(amt, 0)));
  if (vib) return (r, g, b) => { const o = vibrance(r, g, b, amt); return [clamp255(o[0]), clamp255(o[1]), clamp255(o[2])]; };
  return (r, g, b) => {
    const Y = 0.299 * r + 0.587 * g + 0.114 * b, k = 1 + amt;
    return [clamp255(Y + (r - Y) * k), clamp255(Y + (g - Y) * k), clamp255(Y + (b - Y) * k)];
  };
}
/** smooth value noise: lattice values hashed per lattice point (lattice spacing L px), smoothstep interpolation; 0..1 */
function valueNoise(seed, x, y, L) {
  const fx = x / L, fy = y / L, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = smooth01(fx - x0), ty = smooth01(fy - y0);
  const v = (i, j) => hashU(seed, i * L, j * L, L);
  const a = v(x0, y0), b = v(x0 + 1, y0), c = v(x0, y0 + 1), d = v(x0 + 1, y0 + 1);
  return (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
}
/** 흔적 그리기 colour kernels (§5.9) → fn(r, g, b, x, y) ⇒ [r, g, b] (0..255, clamped). strength 0..1 (> 1 = percent) mixes the
 *  full preset effect: 1 마모 광택 (screen-lift luma 18 %, chroma −30 %; fn.blur = 1.2 asks the caller to blur the sample first),
 *  2 녹 (rust tint between #8B4A2B and #B4642D by two-octave value noise, carrying the pixel's luma detail),
 *  3 얼룩 (low-frequency blotches at 24 px darken by 35 % with a warm shift), 4 긁힘 (screen-lift luma 30 %, chroma −40 %;
 *  fn.hard = 1, fn.spacing = 0.1, fn.maxSize = 8 for the brush). Noise lattices are seeded by absolute position, every 4 px. */
export function traceFn(preset, strength, seed) {
  const s = clamp01(frac(strength, 0.4)), sd = num(seed, 0) >>> 0, pr = Math.round(num(preset, 1));
  const mixTo = (r, g, b, o) => [clamp255(r + (o[0] - r) * s), clamp255(g + (o[1] - g) * s), clamp255(b + (o[2] - b) * s)];
  const liftChroma = (r, g, b, lift, chroma) => {
    const Y = 0.299 * r + 0.587 * g + 0.114 * b, Y1 = Y + lift * (255 - Y), k = 1 - chroma;
    return [Y1 + (r - Y) * k, Y1 + (g - Y) * k, Y1 + (b - Y) * k];
  };
  let fn;
  if (pr === 2) {
    const A = [0x8b, 0x4a, 0x2b], B = [0xb4, 0x64, 0x2d];
    fn = (r, g, b, x, y) => {
      const X = Math.floor(num(x, 0) / 4) * 4, Y = Math.floor(num(y, 0) / 4) * 4;
      const n = 0.65 * valueNoise(sd, X, Y, 16) + 0.35 * valueNoise(sd ^ 0x9e3779b9, X, Y, 4);
      const t = [A[0] + (B[0] - A[0]) * n, A[1] + (B[1] - A[1]) * n, A[2] + (B[2] - A[2]) * n];
      const k = (0.299 * r + 0.587 * g + 0.114 * b) / 128;
      return mixTo(r, g, b, [t[0] * k, t[1] * k, t[2] * k]);
    };
  } else if (pr === 3) {
    fn = (r, g, b, x, y) => {
      const X = Math.floor(num(x, 0) / 4) * 4, Y = Math.floor(num(y, 0) / 4) * 4;
      const n = 0.7 * valueNoise(sd ^ 0x85ebca6b, X, Y, 24) + 0.3 * valueNoise(sd ^ 0xc2b2ae35, X, Y, 12);
      const bl = smooth01((n - 0.35) / 0.4), k = 1 - 0.35 * bl;
      return mixTo(r, g, b, [r * k, g * k * (1 - 0.03 * bl), b * k * (1 - 0.1 * bl)]);
    };
  } else if (pr === 4) {
    fn = (r, g, b) => mixTo(r, g, b, liftChroma(r, g, b, 0.3, 0.4));
    fn.hard = 1; fn.spacing = 0.1; fn.maxSize = 8;
  } else {
    fn = (r, g, b) => mixTo(r, g, b, liftChroma(r, g, b, 0.18, 0.3));
    fn.blur = 1.2;
  }
  fn.preset = pr === 2 || pr === 3 || pr === 4 ? pr : 1;
  return fn;
}
const FINE_SWEEPS = 60;   // sweeps after a prolongation (measured on a 200 × 200 heal: 0.44 levels from the converged solution)
/** Laplace solve of C interleaved difference fields: D[p·C + c] holds T − S at known pixels; unknown pixels (M set, never on the
 *  border) get Δd = 0. SOR with ω = 2/(1 + sin(π/max(w, h))) until the largest update < tol. Regions over 64 × 64 first solve a
 *  half-resolution copy (block means of the known values), recursively, and start from its bilinear prolongation (cascadic
 *  multigrid), then run at most FINE_SWEEPS sweeps. → { d: Float64Array (interleaved), iters } (iters = sweeps at this level) */
function laplaceSolve(D, M, w, h, C, maxIter, tol, depth = 0) {
  const n = w * h, d = Float64Array.from(D), list = [];
  const border = (p) => { const x = p % w; return x === 0 || x === w - 1 || p < w || p >= n - w; };
  for (let p = 0; p < n; p++) if (M[p] && !border(p)) list.push(p);
  const I = Int32Array.from(list);
  if (!I.length) return { d, iters: 0 };
  let cap = maxIter;
  if (n > 4096 && w > 16 && h > 16 && depth < 8) {
    const hw = Math.ceil(w / 2), hh = Math.ceil(h / 2), Dh = new Float64Array(hw * hh * C), Mh = new Uint8Array(hw * hh), s = new Float64Array(C);
    for (let Y = 0; Y < hh; Y++) for (let X = 0; X < hw; X++) {
      let k = 0;
      s.fill(0);
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const x = 2 * X + dx, y = 2 * Y + dy;
        if (x >= w || y >= h) continue;
        const p = y * w + x;
        if (M[p] && !border(p)) continue;
        for (let c = 0; c < C; c++) s[c] += D[p * C + c];
        k++;
      }
      const q = Y * hw + X;
      if (k) for (let c = 0; c < C; c++) Dh[q * C + c] = s[c] / k; else Mh[q] = 1;
    }
    const half = laplaceSolve(Dh, Mh, hw, hh, C, maxIter, tol, depth + 1).d;
    for (let k = 0; k < I.length; k++) {
      const p = I[k], x = p % w, y = (p - x) / w;
      const fx = Math.min(hw - 1, Math.max(0, (x + 0.5) / 2 - 0.5)), fy = Math.min(hh - 1, Math.max(0, (y + 0.5) / 2 - 0.5));
      const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(hw - 1, x0 + 1), y1 = Math.min(hh - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
      const a = (y0 * hw + x0) * C, b = (y0 * hw + x1) * C, e = (y1 * hw + x0) * C, f = (y1 * hw + x1) * C;
      for (let c = 0; c < C; c++) d[p * C + c] = (half[a + c] * (1 - tx) + half[b + c] * tx) * (1 - ty) + (half[e + c] * (1 - tx) + half[f + c] * tx) * ty;
    }
    cap = Math.min(maxIter, FINE_SWEEPS);
  } else {
    const s = new Float64Array(C);
    let bn = 0;
    for (let k = 0; k < I.length; k++) {
      const p = I[k];
      for (const q of [p - 1, p + 1, p - w, p + w]) if (!M[q] || border(q)) { for (let c = 0; c < C; c++) s[c] += d[q * C + c]; bn++; }
    }
    for (let k = 0; k < I.length; k++) for (let c = 0; c < C; c++) d[I[k] * C + c] = bn ? s[c] / bn : 0;
  }
  const om = 2 / (1 + Math.sin(Math.PI / Math.max(w, h))), WC = w * C;
  let it = 0;
  const q = om * 0.25, k1 = 1 - om, L = I.length;
  // red-black order: no pixel of a half-sweep reads another of the same half, so the loop carries no dependency
  const RB = new Int32Array(L);
  let nr = 0;
  for (let k = 0; k < L; k++) { const p = I[k]; if ((p % w + ((p / w) | 0)) % 2 === 0) RB[nr++] = p; }
  for (let k = 0, j = nr; k < L; k++) { const p = I[k]; if ((p % w + ((p / w) | 0)) % 2 === 1) RB[j++] = p; }
  for (; it < cap; it++) {
    let md = 0;
    if (C === 3) {
      for (let k = 0; k < L; k++) {
        const i = RB[k] * 3, u = i - WC, b = i + WC;
        const o0 = d[i], v0 = k1 * o0 + q * (d[i - 3] + d[i + 3] + d[u] + d[b]);
        const o1 = d[i + 1], v1 = k1 * o1 + q * (d[i - 2] + d[i + 4] + d[u + 1] + d[b + 1]);
        const o2 = d[i + 2], v2 = k1 * o2 + q * (d[i - 1] + d[i + 5] + d[u + 2] + d[b + 2]);
        d[i] = v0; d[i + 1] = v1; d[i + 2] = v2;
        const e = Math.max(Math.abs(v0 - o0), Math.abs(v1 - o1), Math.abs(v2 - o2));
        if (e > md) md = e;
      }
    } else {
      for (let k = 0; k < L; k++) {
        const j = RB[k] * C;
        for (let c = 0; c < C; c++) {
          const i = j + c, old = d[i], v = k1 * old + q * (d[i - C] + d[i + C] + d[i - WC] + d[i + WC]), dv = v - old;
          if (dv > md) md = dv; else if (-dv > md) md = -dv;
          d[i] = v;
        }
      }
    }
    if (md < tol) { it++; break; }
  }
  return { d, iters: it };
}
/** seamless cloning [PS §4.3]: f = S + d with Δd = 0 where M is set and d = T − S elsewhere (the bbox border is always known).
 *  S, T: Float32 planes, or arrays of planes (one per channel, solved together); M: Uint8Array (nonzero = solve). Regions over
 *  64 × 64 start from a recursive half-resolution solve and then run ≤ 60 full-resolution sweeps (§5.9 asks for this above
 *  300 × 300 with 30 sweeps; it is used earlier, with more sweeps, for the 60 ms 200 × 200 target; within 0.5 levels of the converged solution).
 *  → Float32 plane (or array of planes) with `.iters` = full-resolution sweeps. */
export function poissonBlend(S, T, M, w, h, { maxIter = 2000, tol = 0.05 } = {}) {
  const many = Array.isArray(S), Sl = many ? S : [S], Tl = many ? T : [T], C = Sl.length, n = w * h, D = new Float64Array(n * C);
  for (let p = 0; p < n; p++) for (let c = 0; c < C; c++) D[p * C + c] = Tl[c][p] - Sl[c][p];
  const r = laplaceSolve(D, M, w, h, C, maxIter, tol), outs = [];
  for (let c = 0; c < C; c++) {
    const o = new Float32Array(n), Sc = Sl[c], Tc = Tl[c];
    for (let p = 0; p < n; p++) o[p] = M[p] ? Sc[p] + r.d[p * C + c] : Tc[p];
    o.iters = r.iters;
    outs.push(o);
  }
  return many ? outs : outs[0];
}
/** diffusion inpainting with a pyramid [PS §4.4]: fills pixels where hole is set (inside rect, default the hole's bbox), in place.
 *  All four channels are filled; known pixels are never changed. */
export function diffuseInpaint(d, w, h, hole, rect) {
  const HB = rect ? fullRect(w, h, rect) : maskBBox(hole, w, h);
  if (!HB || !HB.w || !HB.h) return;
  const E = expandRect(HB, 4, w, h), lv = [];
  let cw = E.w, ch = E.h, C = new Float32Array(cw * ch * 4), H = new Uint8Array(cw * ch), holes = 0;
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const X = E.x + x, Y = E.y + y, i = (Y * w + X) * 4, j = (y * cw + x) * 4;
    const inR = X >= HB.x && Y >= HB.y && X < HB.x + HB.w && Y < HB.y + HB.h;
    if (inR && hole[Y * w + X]) { H[y * cw + x] = 1; holes++; }
    C[j] = d[i]; C[j + 1] = d[i + 1]; C[j + 2] = d[i + 2]; C[j + 3] = d[i + 3];
  }
  if (!holes) return;
  lv.push({ C, H, w: cw, h: ch, holes });
  while (lv[lv.length - 1].holes > 0 && cw > 2 && ch > 2) {
    const P = lv[lv.length - 1], nw = Math.ceil(P.w / 2), nh = Math.ceil(P.h / 2), NC = new Float32Array(nw * nh * 4), NH = new Uint8Array(nw * nh);
    let nh2 = 0;
    for (let Y = 0; Y < nh; Y++) for (let X = 0; X < nw; X++) {
      let k = 0;
      const s = [0, 0, 0, 0];
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const x = 2 * X + dx, y = 2 * Y + dy;
        if (x >= P.w || y >= P.h || P.H[y * P.w + x]) continue;
        const j = (y * P.w + x) * 4;
        s[0] += P.C[j]; s[1] += P.C[j + 1]; s[2] += P.C[j + 2]; s[3] += P.C[j + 3]; k++;
      }
      const q = Y * nw + X;
      if (!k) { NH[q] = 1; nh2++; } else for (let c = 0; c < 4; c++) NC[q * 4 + c] = s[c] / k;
    }
    lv.push({ C: NC, H: NH, w: nw, h: nh, holes: nh2 });
    cw = nw; ch = nh;
  }
  const sweep = (L, iters, tol) => {
    const { C: Cc, H: Hh, w: W, h: Hh2 } = L, list = [];
    for (let p = 0; p < W * Hh2; p++) if (Hh[p]) list.push(p);
    for (let it = 0; it < iters; it++) {
      let md = 0;
      for (const p of list) {
        const x = p % W, y = (p - x) / W;
        let k = 0;
        const s = [0, 0, 0, 0];
        for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < Hh2 - 1 ? p + W : -1]) {
          if (q < 0) continue;
          for (let c = 0; c < 4; c++) s[c] += Cc[q * 4 + c];
          k++;
        }
        if (!k) continue;
        for (let c = 0; c < 4; c++) { const v = Cc[p * 4 + c] + 1.6 * (s[c] / k - Cc[p * 4 + c]); const dv = Math.abs(v - Cc[p * 4 + c]); if (dv > md) md = dv; Cc[p * 4 + c] = v; }
      }
      if (md < tol) break;
    }
  };
  for (let li = lv.length - 1; li >= 0; li--) {
    const L = lv[li];
    if (!L.holes) continue;
    if (li === lv.length - 1) {
      let k = 0;
      const s = [0, 0, 0, 0];
      for (let p = 0; p < L.w * L.h; p++) if (!L.H[p]) { for (let c = 0; c < 4; c++) s[c] += L.C[p * 4 + c]; k++; }
      for (let p = 0; p < L.w * L.h; p++) if (L.H[p]) for (let c = 0; c < 4; c++) L.C[p * 4 + c] = k ? s[c] / k : 0;
      sweep(L, 500, 0.01);
    } else {
      const P = lv[li + 1];
      for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
        const p = y * L.w + x;
        if (!L.H[p]) continue;
        const q = (Math.min(P.h - 1, y >> 1) * P.w + Math.min(P.w - 1, x >> 1)) * 4;
        for (let c = 0; c < 4; c++) L.C[p * 4 + c] = P.C[q + c];
      }
      sweep(L, 60, 0.02);
    }
  }
  const L0 = lv[0];
  for (let y = 0; y < L0.h; y++) for (let x = 0; x < L0.w; x++) {
    const p = y * L0.w + x;
    if (!L0.H[p]) continue;
    const i = ((E.y + y) * w + E.x + x) * 4;
    for (let c = 0; c < 4; c++) d[i + c] = L0.C[p * 4 + c];
  }
}
/** 먼지와 긁힘 지우기 source search (§5.9): 16 directions × {1.5r, 2.5r}; a candidate whose shifted hole meets the hole or leaves the
 *  image is skipped; score = mean SSD over the ring (a 3 px band around the hole; ring pixels shifted into the hole are left out, and at
 *  least half must remain) plus half the luma-variance mismatch between the candidate's interior and the ring → { dx, dy, score }
 *  (score Infinity when nothing fits) */
export function spotSource(d, w, h, hole, bbox, r) {
  const B = bbox || maskBBox(hole, w, h);
  if (!B) return { dx: 0, dy: 0, score: Infinity };
  r = num(r, Math.max(B.w, B.h) / 2);
  const E = expandRect(B, 3, w, h), ring = [], inner = [];
  const grown = new Uint8Array(E.w * E.h);
  for (let y = 0; y < E.h; y++) for (let x = 0; x < E.w; x++) if (hole[(E.y + y) * w + E.x + x]) grown[y * E.w + x] = 255;
  const g3 = maskGrow(grown, E.w, E.h, 3);
  for (let y = 0; y < E.h; y++) for (let x = 0; x < E.w; x++) {
    const p = (E.y + y) * w + E.x + x;
    if (hole[p]) inner.push(p); else if (g3[y * E.w + x]) ring.push(p);
  }
  if (!ring.length) return { dx: 0, dy: 0, score: Infinity };
  const varOf = (list, off) => {
    let s = 0, ss = 0;
    for (const p of list) { const j = (p + off) * 4, Y = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]; s += Y; ss += Y * Y; }
    const m = s / list.length; return ss / list.length - m * m;
  };
  const vRing = varOf(ring, 0);
  let best = { dx: 0, dy: 0, score: Infinity };
  for (const f of [1.5, 2.5]) {
    for (let k = 0; k < 16; k++) {
      const a = (2 * Math.PI * k) / 16, dx = Math.round(Math.cos(a) * f * r), dy = Math.round(Math.sin(a) * f * r);
      if (!dx && !dy) continue;
      if (E.x + dx < 0 || E.y + dy < 0 || E.x + E.w + dx > w || E.y + E.h + dy > h) continue;
      const off = dy * w + dx;
      let bad = false;
      for (const p of inner) if (hole[p + off]) { bad = true; break; }
      if (bad) continue;
      let ssd = 0, nv = 0;
      for (const p of ring) {
        if (hole[p + off]) continue;   // the shifted ring may cross the hole: compare only clean pixels
        const i = p * 4, j = (p + off) * 4;
        const a0 = d[i] - d[j], a1 = d[i + 1] - d[j + 1], a2 = d[i + 2] - d[j + 2];
        ssd += a0 * a0 + a1 * a1 + a2 * a2; nv++;
      }
      if (nv < ring.length / 2) continue;
      const score = ssd / nv + 0.5 * Math.abs(varOf(inner.length ? inner : ring, off) - vRing);
      if (score < best.score) best = { dx, dy, score };
    }
  }
  return best;
}

/* ---------- geometry [PS §6] ---------- */
/** 선으로 맞추기: the line's angle folded to −45..45 degrees (near-vertical lines measure against the vertical) */
export function straightenAngle(x1, y1, x2, y2) {
  let a = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  if (a > 90) a -= 180; else if (a <= -90) a += 180;
  if (a > 45) a -= 90; else if (a < -45) a += 90;
  return a;
}
/** largest same-aspect crop scale inside a W × H image rotated by deg: (1600, 1000, 5) ≈ 0.881 */
export function autoCropScale(W, H, deg) {
  const t = (Math.abs(num(deg, 0)) * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  if (!W || !H) return 1;
  return Math.min(1, W / (W * c + H * s), H / (W * s + H * c));
}
/** bounding size of a w × h rectangle rotated by deg → { w, h } (integers, ceil) */
export function rotatedBounds(w, h, deg) {
  const t = (num(deg, 0) * Math.PI) / 180, c = Math.abs(Math.cos(t)), s = Math.abs(Math.sin(t));
  return { w: Math.ceil(w * c + h * s - 1e-6), h: Math.ceil(w * s + h * c - 1e-6) };
}
/** crop rect of aspect ratio (w/h; null = free) centred on box (default the whole image) grown by margin (fraction of the box's long
 *  side; > 1 = percent), kept inside W × H (scaled down when it cannot fit) → Rect (integers) */
export function cropForRatio(W, H, ratio, box, margin) {
  const B = box && box.w > 0 && box.h > 0 ? box : { x: 0, y: 0, w: W, h: H }, mg = box ? frac(margin, 0) * Math.max(B.w, B.h) : 0;
  let cw = B.w + 2 * mg, chh = B.h + 2 * mg;
  const rt = ratio > 0 ? ratio : null;
  if (rt) { if (cw / chh < rt) cw = chh * rt; else chh = cw / rt; }
  if (cw > W || chh > H) {
    if (rt) { const s = Math.min(W / cw, H / chh); cw *= s; chh *= s; } else { cw = Math.min(cw, W); chh = Math.min(chh, H); }
  }
  const cx = B.x + B.w / 2, cy = B.y + B.h / 2;
  let x = cx - cw / 2, y = cy - chh / 2;
  x = Math.max(0, Math.min(W - cw, x)); y = Math.max(0, Math.min(H - chh, y));
  const out = { x: Math.round(x), y: Math.round(y), w: Math.max(1, Math.round(cw)), h: Math.max(1, Math.round(chh)) };
  if (out.x + out.w > W) out.w = W - out.x;
  if (out.y + out.h > H) out.h = H - out.y;
  return out;
}

/* ---------- analysis ---------- */
/** changed pixels (max channel difference > thr), cleaned by a 1 px opening → { mask, permille } */
export function diffMask(a, b, w, h, thr = 12) {
  const n = w * h, m = new Uint8Array(n);
  for (let i = 0, j = 0; i < n; i++, j += 4) {
    const d0 = Math.abs(a[j] - b[j]), d1 = Math.abs(a[j + 1] - b[j + 1]), d2 = Math.abs(a[j + 2] - b[j + 2]);
    if (Math.max(d0, d1, d2) > thr) m[i] = 255;
  }
  const o = maskGrow(maskGrow(m, w, h, -1), w, h, 1);
  return { mask: o, permille: maskCoverage(o, 128) };
}
const lumaOf = (d, w, h) => { const Y = new Float32Array(w * h); for (let i = 0, j = 0; i < w * h; i++, j += 4) Y[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]; return Y; };
const halfPlane = (P, w, h, isMask) => {
  const nw = Math.max(1, w >> 1), nh = Math.max(1, h >> 1), o = new Float32Array(nw * nh);
  for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) {
    const a = P[2 * y * w + 2 * x], b = P[2 * y * w + Math.min(w - 1, 2 * x + 1)], c = P[Math.min(h - 1, 2 * y + 1) * w + 2 * x], d = P[Math.min(h - 1, 2 * y + 1) * w + Math.min(w - 1, 2 * x + 1)];
    o[y * nw + x] = isMask ? Math.max(a, b, c, d) : (a + b + c + d) / 4;
  }
  return { P: o, w: nw, h: nh };
};
/** mean squared luma error of b placed by (dx, dy, sc) about the centre against a (only where neither excluded nor outside b) */
function alignCost(A, B, w, h, dx, dy, sc, ex, step) {
  const cx = w / 2, cy = h / 2, inv = 1 / sc;
  let s = 0, n = 0;
  for (let y = 0; y < h; y += step) {
    const v = cy + (y + 0.5 - dy - cy) * inv - 0.5;
    if (v < 0 || v > h - 1) continue;
    const y0 = v | 0, y1 = y0 + 1 < h ? y0 + 1 : y0, ty = v - y0;
    for (let x = 0; x < w; x += step) {
      if (ex && ex[y * w + x] > 0) continue;
      const u = cx + (x + 0.5 - dx - cx) * inv - 0.5;
      if (u < 0 || u > w - 1) continue;
      const x0 = u | 0, x1 = x0 + 1 < w ? x0 + 1 : x0, tx = u - x0;
      const bv = (B[y0 * w + x0] * (1 - tx) + B[y0 * w + x1] * tx) * (1 - ty) + (B[y1 * w + x0] * (1 - tx) + B[y1 * w + x1] * tx) * ty;
      const e = A[y * w + x] - bv;
      s += e * e; n++;
    }
  }
  return n > (w * h) / (8 * step * step) ? s / n : Infinity;
}
/** 자동 맞추기: (dx, dy, sc) that places b over a (b drawn scaled by sc about the centre, then moved by dx, dy) on ≤ 256 px proxies.
 *  range = search radius as a fraction of the long side (> 1 = percent) [3 %]; exclude = Mask of a to ignore (the changed area).
 *  → { dx, dy (proxy px), sc (0.97..1.03, steps of 0.005), err (RMS luma) } */
export function alignSearch(a, b, w, h, { range = 3, exclude = null } = {}) {
  const R = frac(range, 0.03), levels = [{ A: lumaOf(a, w, h), B: lumaOf(b, w, h), E: exclude ? Float32Array.from(exclude) : null, w, h }];
  while (Math.max(levels[levels.length - 1].w, levels[levels.length - 1].h) > 64) {
    const L = levels[levels.length - 1], A2 = halfPlane(L.A, L.w, L.h), B2 = halfPlane(L.B, L.w, L.h);
    levels.push({ A: A2.P, B: B2.P, E: L.E ? halfPlane(L.E, L.w, L.h, true).P : null, w: A2.w, h: A2.h });
  }
  const top = levels[levels.length - 1], ms = Math.ceil(R * Math.max(top.w, top.h)) + 1, scales = [];
  for (let k = 0; k <= 12; k++) scales.push(Math.round((0.97 + 0.005 * k) * 1000) / 1000);
  // ties (a flat image) go to the smallest shift, then to the scale nearest 1
  const better = (e, dx, dy, sc, b) => e < b.e - 1e-9 || (Math.abs(e - b.e) <= 1e-9 &&
    (Math.abs(dx) + Math.abs(dy) < Math.abs(b.dx) + Math.abs(b.dy) || (Math.abs(dx) + Math.abs(dy) === Math.abs(b.dx) + Math.abs(b.dy) && Math.abs(sc - 1) < Math.abs(b.sc - 1))));
  let best = { dx: 0, dy: 0, sc: 1, e: Infinity };
  for (const sc of scales) for (let dy = -ms; dy <= ms; dy++) for (let dx = -ms; dx <= ms; dx++) {
    const e = alignCost(top.A, top.B, top.w, top.h, dx, dy, sc, top.E, 1);
    if (better(e, dx, dy, sc, best)) best = { dx, dy, sc, e };
  }
  for (let li = levels.length - 2; li >= 0; li--) {
    const L = levels[li], cx = best.dx * 2, cy = best.dy * 2, step = L.w * L.h > 40000 ? 2 : 1;
    let nb = { dx: cx, dy: cy, sc: best.sc, e: Infinity };   // ties keep the shift nearest zero
    for (const sc of [best.sc - 0.01, best.sc - 0.005, best.sc, best.sc + 0.005, best.sc + 0.01]) {
      const s = Math.round(sc * 1000) / 1000;
      if (s < 0.969 || s > 1.031) continue;
      for (let dy = cy - 2; dy <= cy + 2; dy++) for (let dx = cx - 2; dx <= cx + 2; dx++) {
        const e = alignCost(L.A, L.B, L.w, L.h, dx, dy, s, L.E, step);
        if (better(e, dx, dy, s, nb)) nb = { dx, dy, sc: s, e };
      }
    }
    best = nb;
  }
  const e = alignCost(levels[0].A, levels[0].B, w, h, best.dx, best.dy, best.sc, levels[0].E, 1);
  return { dx: best.dx, dy: best.dy, sc: best.sc, err: Number.isFinite(e) ? Math.sqrt(e) : Infinity };
}
/** 64-bit difference hash of a 9 × 8 area-averaged luma grid → 16 hex chars */
export function dHash(d, w, h) {
  const g = new Float64Array(72), cnt = new Float64Array(72), step = Math.max(1, Math.floor(Math.min(w, h) / 256));
  for (let y = 0; y < h; y += step) {
    const gy = Math.min(7, Math.floor((y * 8) / h));
    for (let x = 0; x < w; x += step) {
      const gx = Math.min(8, Math.floor((x * 9) / w)), j = (y * w + x) * 4;
      g[gy * 9 + gx] += 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]; cnt[gy * 9 + gx]++;
    }
  }
  for (let i = 0; i < 72; i++) g[i] = cnt[i] ? g[i] / cnt[i] : 0;
  let hex = "";
  for (let row = 0; row < 8; row++) {
    let byte = 0;
    for (let c = 0; c < 8; c++) byte = (byte << 1) | (g[row * 9 + c] < g[row * 9 + c + 1] ? 1 : 0);
    hex += (byte >>> 0).toString(16).padStart(2, "0");
  }
  return hex;
}
export function hamming(a, b) {
  let n = 0;
  for (let i = 0; i < 16; i++) { let x = parseInt(String(a)[i] || "0", 16) ^ parseInt(String(b)[i] || "0", 16); while (x) { n += x & 1; x >>= 1; } }
  return n;
}
/** 빛 방향 선 (shadow tip → object point): do the lines meet at one light? Lines are {a,b,c,d} or [x1,y1,x2,y2].
 *  spreadDeg = the smaller of (a) the largest angle between a line and the direction from its shadow tip to the least-squares meeting
 *  point (which must lie ahead of the tips) and (b) the largest angle between two line directions (a distant light gives parallel lines).
 *  meet = spreadDeg ≤ 5. Fewer than two lines → { meet: true, spreadDeg: 0 }. */
export function lightLinesMeet(lines) {
  const L = (lines || []).map((l) => (Array.isArray(l) ? l : [l && l.a, l && l.b, l && l.c, l && l.d]).map((v) => num(v, 0)))
    .filter((l) => Math.hypot(l[2] - l[0], l[3] - l[1]) > 1e-9);
  if (L.length < 2) return { meet: true, spreadDeg: 0 };
  const dir = L.map((l) => { const dx = l[2] - l[0], dy = l[3] - l[1], n = Math.hypot(dx, dy); return [dx / n, dy / n]; });
  const ang = (u, v) => (Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1]))) * 180) / Math.PI;
  let par = 0;
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) par = Math.max(par, ang(dir[i], dir[j]));
  let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
  L.forEach((l, i) => {
    const nx = -dir[i][1], ny = dir[i][0], c = nx * l[0] + ny * l[1];
    a11 += nx * nx; a12 += nx * ny; a22 += ny * ny; b1 += nx * c; b2 += ny * c;
  });
  const det = a11 * a22 - a12 * a12;
  let pt = Infinity;
  if (Math.abs(det) > 1e-9) {
    const px = (b1 * a22 - b2 * a12) / det, py = (a11 * b2 - a12 * b1) / det;
    pt = 0;
    L.forEach((l, i) => {
      const vx = px - l[0], vy = py - l[1], n = Math.hypot(vx, vy);
      pt = Math.max(pt, n < 1e-9 ? 0 : ang(dir[i], [vx / n, vy / n]));
    });
  }
  const spreadDeg = Math.min(par, pt);
  return { meet: spreadDeg <= 5, spreadDeg: Math.round(spreadDeg * 10) / 10 };
}
/** seeded PRNG → () => number in [0, 1) */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
