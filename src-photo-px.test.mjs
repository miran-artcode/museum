// 이미지 다듬기 픽셀 계산 시험 (spec §9.1 src-photo-px.test.mjs). 담당 B.
// [PS] = .tmpbuild/folio/understand/read_photoshop-reference.md 의 값. 항등 매개변수, 단조성, 범위 고정, 알파, 가장자리, 결정성을 함께 본다.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as PX from "./src-photo-px.mjs";

/* ---------- fixtures ---------- */
const rgba = (w, h, f) => { const d = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = f(x, y), i = (y * w + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c.length > 3 ? c[3] : 255; } return d; };
const noiseImg = (w, h, seed) => { const r = PX.mulberry32(seed); return rgba(w, h, () => [r() * 255, r() * 255, r() * 255]); };
/** smooth field: gradient plus Gaussian blobs (deterministic) */
const blobImg = (w, h, seed, n = 6) => {
  const r = PX.mulberry32(seed), B = [];
  for (let k = 0; k < n; k++) B.push([r() * w, r() * h, 6 + r() * 14, (r() - 0.5) * 300, r()]);
  return rgba(w, h, (x, y) => {
    let v = 60 + (x / w) * 60 + (y / h) * 30;
    for (const [bx, by, s, a] of B) v += a * Math.exp(-((x - bx) ** 2 + (y - by) ** 2) / (2 * s * s));
    return [v, v * 0.8 + 20, 255 - v];
  });
};
const grid = () => { const out = []; for (let r = 0; r < 256; r += 17) for (let g = 0; g < 256; g += 51) for (let b = 0; b < 256; b += 85) out.push([r, g, b]); return out; };
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || "") + " " + a + " vs " + b + " (±" + tol + ")");
const isId = (l) => { for (let i = 0; i < 256; i++) if (l[i] !== i) return false; return true; };

test("px: module loads; identity LUT, mulberry32 determinism, hamming", () => {
  const l = PX.lutIdentity();
  assert.equal(l.length, 256); assert.equal(l[0], 0); assert.equal(l[255], 255);
  assert.deepEqual(PX.lutCompose(l, l), l);
  const a = PX.mulberry32(42), b = PX.mulberry32(42);
  for (let i = 0; i < 10; i++) assert.equal(a(), b());
  assert.equal(PX.hamming("0000000000000000", "000000000000000f"), 4);
  assert.equal(PX.maskCoverage(new Uint8Array([0, 255, 255, 0])), 500);
  assert.deepEqual(PX.maskBBox(new Uint8Array([0, 0, 0, 255]), 2, 2), { x: 1, y: 1, w: 1, h: 1 });
});

/* ---------- tone LUTs ---------- */
test("LUT identities: default parameters change nothing", () => {
  assert.ok(isId(PX.bcLut({})), "bc"); assert.ok(isId(PX.bcLut({ lg: 1 })), "bc legacy");
  assert.ok(isId(PX.levelsLut({})), "levels"); assert.ok(isId(PX.exposureLut({})), "exposure");
  assert.ok(isId(PX.exposureLut({ e: 0, o: 0, g: 100 })), "exposure explicit");
  assert.ok(isId(PX.curveLut([0, 0, 255, 255], 0)), "curve smooth"); assert.ok(isId(PX.curveLut([0, 0, 255, 255], 1)), "curve natural");
  assert.ok(isId(PX.curveLut([0, 0, 128, 128, 255, 255], 0)), "curve on the diagonal");
  for (const t of ["bc", "lv", "cv", "ex", "gp"]) { const L = PX.adjLuts(t, {}); assert.ok(isId(L.r) && isId(L.g) && isId(L.b), t); }
  for (const t of ["hs", "vb", "cb", "pf", "bw"]) assert.equal(PX.adjLuts(t, {}), null, t + " is not separable");
  const d = noiseImg(17, 9, 1), c = d.slice();
  PX.applyLuts(d, 17, null, PX.adjLuts("lv", {}));
  assert.deepEqual(d, c);
});
test("levels: γ 1.5 maps 128 → 161 [PS §2.2]; monotone; output range; per-channel then composite", () => {
  const l = PX.levelsLut({ g: 150 });
  assert.equal(l[128], 161);
  for (let i = 1; i < 256; i++) assert.ok(l[i] >= l[i - 1]);
  const o = PX.levelsLut({ ib: 20, iw: 230, ob: 10, ow: 240 });
  assert.equal(o[0], 10); assert.equal(o[20], 10); assert.equal(o[230], 240); assert.equal(o[255], 240);
  const L = PX.adjLuts("lv", { l: [0, 100, 255, 0, 200], r: [0, 100, 255, 100, 255] });
  assert.equal(L.r[0], Math.round(100 * 200 / 255)); assert.equal(L.g[255], 200); assert.equal(L.b[0], 0);
});
test("curves: natural 200 → 228, smooth (monotone) 200 → 216 [PS §2.3]; smooth never decreases on random increasing points", () => {
  const pts = [0, 0, 64, 40, 128, 150, 255, 255];
  assert.equal(PX.curveLut(pts, 1)[200], 228);
  assert.equal(PX.curveLut(pts, 0)[200], 216);
  const r = PX.mulberry32(7);
  for (let trial = 0; trial < 50; trial++) {
    const n = 2 + Math.floor(r() * 12), xs = new Set([0, 255]);
    while (xs.size < n) xs.add(1 + Math.floor(r() * 254));
    const X = [...xs].sort((a, b) => a - b), Y = X.map(() => Math.floor(r() * 256)).sort((a, b) => a - b), flat = [];
    X.forEach((x, i) => flat.push(x, Y[i]));
    const l = PX.curveLut(flat, 0);
    for (let i = 1; i < 256; i++) assert.ok(l[i] >= l[i - 1], "non-decreasing at " + i);
    X.forEach((x, i) => near(l[x], Y[i], 0.5, "passes through point"));
    const nat = PX.curveLut(flat, 1);
    for (let i = 0; i < 256; i++) assert.ok(nat[i] >= 0 && nat[i] <= 255, "natural spline clamped");
  }
  assert.equal(PX.curveLut([0, 30, 255, 220], 0)[0], 30, "end points move vertically");
});
test("brightness/contrast and exposure: monotone, clamped, black and white kept by the modern law (also for negative contrast)", () => {
  for (const p of [{ b: 150 }, { b: -150 }, { c: 100 }, { c: -50 }, { b: 60, c: 40 }]) {
    const l = PX.bcLut(p);
    for (let i = 1; i < 256; i++) assert.ok(l[i] >= l[i - 1], JSON.stringify(p));
    assert.equal(l[0], 0); assert.equal(l[255], 255);
  }
  assert.equal(PX.bcLut({ b: 150 })[128], 181, "B +150 gives γ 0.5 [PS §2.1]");
  const leg = PX.bcLut({ b: 50, lg: 1 }); assert.equal(leg[0], 128 - 128 + Math.round(2.55 * 50)); assert.equal(leg[255], 255);
  const e1 = PX.exposureLut({ e: 100 }), e2 = PX.exposureLut({ e: -500, o: -500 }), e3 = PX.exposureLut({ e: 500, g: 10 });
  for (let i = 1; i < 256; i++) { assert.ok(e1[i] >= e1[i - 1]); assert.ok(e1[i] >= i); }
  for (const l of [e2, e3]) for (let i = 0; i < 256; i++) assert.ok(l[i] >= 0 && l[i] <= 255);
  near(PX.exposureLut({ e: 100 })[100], 255 * Math.min(1, ((1.055 * Math.pow(Math.min(1, 2 * Math.pow((100 / 255 + 0.055) / 1.055, 2.4)), 1 / 2.4)) - 0.055)), 1, "+1 stop doubles linear light");
});

/* ---------- colour ---------- */
test("psSat (200,100,50) +50 → (250,83,0), −100 → (125,125,125); vibrance (140,120,110) → (149,117,101), (250,20,20) kept [PS §2.5–2.6]", () => {
  assert.deepEqual(PX.psSat(200, 100, 50, 0.5).map(Math.round), [250, 83, 0]);
  assert.deepEqual(PX.psSat(200, 100, 50, -1).map(Math.round), [125, 125, 125]);
  assert.deepEqual(PX.psSat(90, 90, 90, 0.7), [90, 90, 90], "grey has no saturation");
  assert.deepEqual(PX.vibrance(140, 120, 110, 1).map(Math.round), [149, 117, 101]);
  PX.vibrance(250, 20, 20, 1).forEach((v, i) => near(v, [250, 20, 20][i], 1.05, "saturated colour nearly unchanged"));
  for (const c of grid()) { const o = PX.vibrance(c[0], c[1], c[2], 1); o.forEach((v) => assert.ok(v >= -1e-9 && v <= 255 + 1e-9, "vibrance never clips")); }
});
test("black & white defaults: red 102, yellow 153, blue 51, grey 128 [PS §2.8]", () => {
  assert.equal(Math.round(PX.bwMix(255, 0, 0)[0]), 102);
  assert.equal(Math.round(PX.bwMix(255, 255, 0)[0]), 153);
  assert.equal(Math.round(PX.bwMix(0, 0, 255)[0]), 51);
  assert.equal(Math.round(PX.bwMix(128, 128, 128)[0]), 128);
  assert.equal(Math.round(PX.bwMix(0, 255, 0, [40, 60, 100, 60, 20, 80])[0]), 255, "green weight 100");
  const f = PX.adjFn("bw", {});
  for (const c of grid()) { const o = f(...c); assert.equal(o[0], o[1]); assert.equal(o[1], o[2]); assert.ok(o[0] >= 0 && o[0] <= 255); }
});
test("colour balance zero, photo filter d = 0, hue/sat zero and vibrance zero are identities; photo filter keeps luminosity", () => {
  for (const c of grid()) {
    assert.deepEqual(PX.colorBalance(...c, { s: [0, 0, 0], m: [0, 0, 0], h: [0, 0, 0] }), c);
    assert.deepEqual(PX.photoFilter(...c, { d: 0 }), c);
    assert.deepEqual(PX.hueSat(...c, { a: [0, 0, 0], r: [0, 0, 0] }), c);
    for (const t of ["hs", "vb", "cb"]) assert.deepEqual(PX.adjFn(t, {})(...c), c, t);
    const pf = PX.photoFilter(...c, { c: [0, 109, 255], d: 60 });
    if (Math.max(...pf) < 254.5 && Math.min(...pf) > 0.5) near(PX.lum(...pf), PX.lum(...c), 0.01, "luminosity kept");
  }
  const warm = PX.photoFilter(128, 128, 128, {});
  assert.ok(warm[0] > warm[2], "default warming filter (85)");
});
test("hue/sat: master hue 120 turns red green; range weights; colorize; lightness rule", () => {
  const g = PX.hueSat(255, 0, 0, { a: [120, 0, 0] }).map(Math.round);
  assert.deepEqual(g, [0, 255, 0]);
  assert.deepEqual(PX.hueSat(0, 0, 255, { r: [120, 0, 0] }).map(Math.round), [0, 0, 255], "red range leaves blue");
  assert.deepEqual(PX.hueSat(100, 50, 50, { a: [0, 0, 100] }).map(Math.round), [255, 255, 255]);
  assert.deepEqual(PX.hueSat(100, 50, 50, { a: [0, 0, -100] }).map(Math.round), [0, 0, 0]);
  const cz = PX.hueSat(128, 128, 128, { cz: [0, 50, 0] });
  assert.ok(cz[0] > cz[1] && cz[1] === cz[2], "colorize red");
  const cube = PX.bake3D(PX.adjFn("hs", { a: [30, 20, 0] })), d = noiseImg(64, 32, 3), e = d.slice();
  PX.apply3D(d, 64, null, cube); PX.applyAdj(e, 64, null, "hs", { a: [30, 20, 0] });
  let mx = 0; for (let i = 0; i < d.length; i++) mx = Math.max(mx, Math.abs(d[i] - e[i]));
  assert.ok(mx <= 12, "33³ cube close to the exact path (max " + mx + ")");
});
test("bake3D/apply3D: identity and channel permutation are exact; alpha untouched", () => {
  const d = noiseImg(31, 23, 5);
  for (let i = 3; i < d.length; i += 4) d[i] = i % 255;
  const c = d.slice();
  PX.apply3D(d, 31, null, PX.bake3D((r, g, b) => [r, g, b]));
  assert.deepEqual(d, c);
  PX.apply3D(d, 31, null, PX.bake3D((r, g, b) => [b, r, g]));
  for (let i = 0; i < d.length; i += 4) { assert.equal(d[i], c[i + 2]); assert.equal(d[i + 1], c[i]); assert.equal(d[i + 2], c[i + 1]); assert.equal(d[i + 3], c[i + 3]); }
  const e = c.slice(); PX.applyAdj(e, 31, { x: 3, y: 4, w: 5, h: 6 }, "bw", {});
  for (let y = 0; y < 23; y++) for (let x = 0; x < 31; x++) {
    const i = (y * 31 + x) * 4, inside = x >= 3 && x < 8 && y >= 4 && y < 10;
    if (!inside) assert.deepEqual([...e.subarray(i, i + 4)], [...c.subarray(i, i + 4)]);
    else { assert.equal(e[i], e[i + 1]); assert.equal(e[i + 3], c[i + 3]); }
  }
});
test("autoLevels: 0.1 % clip; contrast keeps one map; colour neutralises a cast", () => {
  const H = { r: new Uint32Array(256), g: new Uint32Array(256), b: new Uint32Array(256), l: new Uint32Array(256), n: 0 };
  for (let v = 10; v <= 240; v++) { H.r[v] += 100; H.g[v] += 100; H.b[v] += 100; }
  H.r[0] += 20; H.r[255] += 20; H.g[2] += 20; H.b[250] += 10;   // below 0.1 % of 23,100
  const t = PX.autoLevels(H, "tone");
  assert.deepEqual(t.r, [10, 100, 240, 0, 255]); assert.deepEqual(t.g, [10, 100, 240, 0, 255]); assert.deepEqual(t.b, [10, 100, 240, 0, 255]);
  const c = PX.autoLevels(H, "contrast");
  assert.deepEqual(Object.keys(c), ["l"]); assert.deepEqual(c.l, [10, 100, 240, 0, 255]);
  assert.deepEqual(PX.autoLevels({ r: Uint32Array.from({ length: 256 }, () => 1), g: Uint32Array.from({ length: 256 }, () => 1), b: Uint32Array.from({ length: 256 }, () => 1) }, "tone"), {}, "full range → identity omitted");
  const img = rgba(40, 40, (x, y) => { const v = 40 + ((x + y) * 160) / 78; return [v * 1.15, v, v * 0.8]; });
  const hist = PX.histogram(img, 40, 40), col = PX.autoLevels(hist, "color"), L = PX.adjLuts("lv", col);
  const d = img.slice(); PX.applyLuts(d, 40, null, L);
  const s = PX.stats(d, 40, 40, null, 1), s0 = PX.stats(img, 40, 40, null, 1);
  assert.ok(s.spread < s0.spread / 3, "cast reduced " + s0.spread.toFixed(1) + " → " + s.spread.toFixed(1));
});
test("greyPointCurves neutralise the sampled grey (keep its brightness or move it to 118)", () => {
  const sample = [150, 130, 110], cv = PX.greyPointCurves(sample, null);
  const L = PX.adjLuts("gp", cv), o = [L.r[150], L.g[130], L.b[110]];
  assert.equal(o[0], o[1]); assert.equal(o[1], o[2]); assert.equal(o[0], 130);
  const L2 = PX.adjLuts("gp", PX.greyPointCurves(sample, 118));
  assert.deepEqual([L2.r[150], L2.g[130], L2.b[110]], [118, 118, 118]);
  const half = PX.adjLuts("gp", { ...cv, k: 50 });
  near(half.r[150], 140, 1, "strength 50 % halfway");
  for (const ch of ["r", "g", "b"]) assert.equal(cv[ch].length, 6);
});
test("mixAdjusted: opacity, mask with offset, luminosity blend, alpha kept", () => {
  const below = rgba(4, 1, () => [100, 100, 100, 77]), adj = rgba(4, 1, () => [200, 0, 0, 255]);
  const m = new Uint8Array([0, 0, 255, 255, 0, 0]);   // width 6, read at x + 2
  const b1 = below.slice(); PX.mixAdjusted(b1, adj, 4, null, 1, m, 6, false, 2, 0);
  assert.deepEqual([...b1.subarray(0, 4)], [200, 0, 0, 77]); assert.deepEqual([...b1.subarray(4, 8)], [200, 0, 0, 77]);
  assert.deepEqual([...b1.subarray(8, 12)], [100, 100, 100, 77]);
  const b2 = below.slice(); PX.mixAdjusted(b2, adj, 4, null, 0.5, null, 4, false);
  assert.deepEqual([...b2.subarray(0, 4)], [150, 50, 50, 77]);
  const b3 = below.slice(); PX.mixAdjusted(b3, adj, 4, null, 1, null, 4, true);
  near(PX.lum(b3[0], b3[1], b3[2]), PX.lum(200, 0, 0), 1, "luminosity of the adjusted colour");
  assert.equal(b3[0], b3[1], "hue of below (grey) kept");
});

/* ---------- statistics ---------- */
test("histogram and stats: counts, alpha 0 skipped, mask, step", () => {
  const d = rgba(10, 10, (x) => (x < 5 ? [0, 0, 0, 255] : [255, 128, 0, x === 9 ? 0 : 255]));
  const H = PX.histogram(d, 10, 10);
  assert.equal(H.n, 90); assert.equal(H.r[0], 50); assert.equal(H.r[255], 40); assert.equal(H.g[128], 40);
  const m = new Uint8Array(100); for (let i = 0; i < 100; i++) m[i] = i % 10 < 5 ? 255 : 0;
  assert.equal(PX.histogram(d, 10, 10, 1, m).n, 50);
  assert.equal(PX.histogram(d, 10, 10, 2).n, 25, "x and y in 0, 2, 4, 6, 8");
  const s = PX.stats(rgba(4, 4, () => [142, 140, 137]), 4, 4, null, 1);
  assert.deepEqual(s.rgb.map(Math.round), [142, 140, 137]); assert.equal(Math.round(s.spread), 5); near(s.sd, 0, 1e-3);
});

/* ---------- spatial ---------- */
/** σ measured on a blurred step edge: the 15.87 %–84.13 % rise is 2σ (robust to 8-bit rounding) */
const stepSigma = (sigma) => {
  const w = 160, h = 8, d = rgba(w, h, (x) => (x < 80 ? [0, 0, 0] : [255, 255, 255])), o = PX.gaussRGBA(d, w, h, sigma, { x: 0, y: 0, w, h });
  const row = [], y = 4; for (let x = 0; x < w; x++) row.push(o[(y * w + x) * 4]);
  const cross = (v) => { for (let x = 1; x < w; x++) if (row[x] >= v) return x - 1 + (v - row[x - 1]) / Math.max(1e-9, row[x] - row[x - 1]); return NaN; };
  return (cross(255 * 0.8413) - cross(255 * 0.1587)) / 2;
};
test("gaussRGBA: σ 5 measures 4.6–5.2; small and mid σ paths agree; no dark fringe on transparent edges [PS §5.1]", () => {
  const s5 = stepSigma(5); assert.ok(s5 >= 4.6 && s5 <= 5.2, "σ 5 → " + s5);
  for (const s of [1, 1.5, 2.5, 3.5, 8, 20]) { const m = stepSigma(s); assert.ok(Math.abs(m - s) <= Math.max(0.35, 0.08 * s), "σ " + s + " → " + m); }
  const w = 60, h = 20, d = rgba(w, h, (x) => (x < 30 ? [0, 0, 0, 0] : [255, 255, 255, 255]));
  for (const s of [1, 3, 6]) {
    const o = PX.gaussRGBA(d, w, h, s, { x: 0, y: 0, w, h });
    for (let i = 0; i < o.length; i += 4) if (o[i + 3] > 8) assert.ok(o[i] >= 250 && o[i + 1] >= 250, "no dark fringe at σ " + s);
  }
  const flat = rgba(30, 30, () => [90, 120, 150]), o = PX.gaussRGBA(flat, 30, 30, 4, { x: 0, y: 0, w: 30, h: 30 });
  assert.deepEqual(o, flat, "flat image unchanged, edges included");
  const n = noiseImg(50, 40, 9), sub = PX.gaussRGBA(n, 50, 40, 2, { x: 10, y: 5, w: 20, h: 10 }), all = PX.gaussRGBA(n, 50, 40, 2, null);
  for (let y = 0; y < 10; y++) for (let x = 0; x < 20; x++) for (let c = 0; c < 4; c++) assert.equal(sub[(y * 20 + x) * 4 + c], all[((y + 5) * 50 + x + 10) * 4 + c]);
  const p = new Float32Array(41 * 41); p[20 * 41 + 20] = 1000; PX.gaussPlane(p, 41, 41, 5);
  let sum = 0; for (const v of p) sum += v; near(sum, 1000, 0.5, "plane blur keeps the mass");
});
test("unsharp: threshold leaves flat areas; edges get overshoot; slices with src equal the whole", () => {
  const r = PX.mulberry32(4), flat = rgba(40, 30, () => { const v = 128 + Math.round((r() - 0.5) * 2); return [v, v, v]; }), c = flat.slice();
  PX.unsharp(flat, 40, 30, { a: 300, r: 10, th: 4 });
  assert.deepEqual(flat, c, "differences below the threshold stay");
  const e = rgba(40, 10, (x) => (x < 20 ? [80, 80, 80] : [160, 160, 160]));
  PX.unsharp(e, 40, 10, { a: 150, r: 15, th: 0 });
  assert.ok(e[(5 * 40 + 19) * 4] < 80 && e[(5 * 40 + 20) * 4] > 160, "overshoot on both sides");
  assert.equal(e[(5 * 40 + 2) * 4], 80, "far from the edge unchanged");
  const n = noiseImg(48, 36, 2), whole = n.slice(), parts = n.slice();
  PX.unsharp(whole, 48, 36, { a: 120, r: 20, th: 1 });
  PX.unsharp(parts, 48, 36, { a: 120, r: 20, th: 1 }, { x: 0, y: 0, w: 48, h: 17 }, n);
  PX.unsharp(parts, 48, 36, { a: 120, r: 20, th: 1 }, { x: 0, y: 17, w: 48, h: 19 }, n);
  assert.deepEqual(parts, whole);
  const z = noiseImg(10, 10, 3), z0 = z.slice(); PX.unsharp(z, 10, 10, { a: 0 }); assert.deepEqual(z, z0, "amount 0");
});
test("addNoise: deterministic across rects and seeds, alpha kept, mono vs colour, grain sizes, amount 0", () => {
  const base = rgba(64, 48, () => [120, 120, 120, 200]);
  for (const p of [{ a: 60, sd: 9 }, { a: 60, sd: 9, mo: 0 }, { a: 60, sd: 9, gs: 2 }, { a: 60, sd: 9, gs: 3, mo: 0 }]) {
    const whole = base.slice(), parts = base.slice();
    PX.addNoise(whole, 64, 48, p);
    PX.addNoise(parts, 64, 48, p, { x: 0, y: 0, w: 30, h: 48 }); PX.addNoise(parts, 64, 48, p, { x: 30, y: 0, w: 34, h: 20 }); PX.addNoise(parts, 64, 48, p, { x: 30, y: 20, w: 34, h: 28 });
    assert.deepEqual(parts, whole, JSON.stringify(p));
    for (let i = 3; i < whole.length; i += 4) assert.equal(whole[i], 200);
    const off = rgba(34, 48, () => [120, 120, 120, 200]);
    PX.addNoise(off, 34, 48, p, null, { x: 30, y: 0 });
    for (let y = 0; y < 48; y++) for (let x = 0; x < 34; x++) for (let c = 0; c < 3; c++) assert.equal(off[(y * 34 + x) * 4 + c], whole[(y * 64 + x + 30) * 4 + c], "org offset");
  }
  const a = base.slice(), b = base.slice(); PX.addNoise(a, 64, 48, { a: 60, sd: 1 }); PX.addNoise(b, 64, 48, { a: 60, sd: 2 });
  assert.notDeepEqual(a, b, "seed matters");
  for (let i = 0; i < a.length; i += 4) assert.ok(a[i] === a[i + 1] && a[i + 1] === a[i + 2], "mono noise is grey");
  const z = base.slice(); PX.addNoise(z, 64, 48, { a: 0 }); assert.deepEqual(z, base);
});
test("vignette and shadows/highlights: identity at zero, corners darker than the centre, shadows lifted, slices with src", () => {
  const g = rgba(80, 60, () => [128, 128, 128]), v = g.slice();
  PX.vignette(v, 80, 60, { a: 0 }); assert.deepEqual(v, g);
  PX.vignette(v, 80, 60, { a: -60, m: 50 });
  assert.equal(v[(30 * 80 + 40) * 4], 128, "centre untouched"); assert.ok(v[0] < 100, "corner darker");
  const f = g.slice(); PX.vignette(f, 80, 60, { a: -60, m: 50 }, null, { x: 0, y: 0, w: 160, h: 60 });
  assert.ok(f[(30 * 80 + 79) * 4] >= 127, "frame centred on the right edge leaves it bright");
  const s = rgba(60, 40, (x) => (x < 30 ? [30, 30, 30] : [200, 200, 200])), s0 = s.slice();
  PX.shadowsHighlights(s, 60, 40, { sa: 0, ha: 0 }); assert.deepEqual(s, s0);
  PX.shadowsHighlights(s, 60, 40, { sa: 80, r: 10 });
  assert.ok(s[(20 * 60 + 5) * 4] > 45, "shadow lifted"); near(s[(20 * 60 + 55) * 4], 200, 1, "highlight kept");
  const n = noiseImg(40, 40, 8), whole = n.slice(), parts = n.slice();
  PX.shadowsHighlights(whole, 40, 40, { sa: 50, ha: 30, r: 6 });
  PX.shadowsHighlights(parts, 40, 40, { sa: 50, ha: 30, r: 6 }, { x: 0, y: 0, w: 40, h: 20 }, n);
  PX.shadowsHighlights(parts, 40, 40, { sa: 50, ha: 30, r: 6 }, { x: 0, y: 20, w: 40, h: 20 }, n);
  assert.deepEqual(parts, whole);
});

/* ---------- masks ---------- */
test("wand stops at a barrier; non-contiguous takes all; tolerance; outside seed", () => {
  const d = rgba(5, 4, (x) => (x === 2 ? [0, 0, 0] : [200, 200, 200]));
  const m = PX.wand(d, 5, 4, 0, 0, 10, true);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 5; x++) assert.equal(m[y * 5 + x], x < 2 ? 255 : 0);
  const all = PX.wand(d, 5, 4, 0, 0, 10, false);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 5; x++) assert.equal(all[y * 5 + x], x === 2 ? 0 : 255);
  assert.equal(PX.maskCoverage(PX.wand(d, 5, 4, 0, 0, 255, true)), 1000);
  assert.equal(PX.maskCoverage(PX.wand(d, 5, 4, -1, 0, 10, true)), 0);
  const big = rgba(300, 200, (x, y) => ((x - 150) ** 2 + (y - 100) ** 2 < 2500 ? [40, 40, 40] : [180, 180, 180]));
  const bm = PX.wand(big, 300, 200, 150, 100, 24, true);
  near(PX.maskCoverage(bm), (Math.PI * 2500 * 1000) / 60000, 3, "disc area");
});
test("backgroundMask and objectBox on a synthetic object on a grey background", () => {
  const w = 200, h = 150, d = rgba(w, h, (x, y) => {
    if (x >= 70 && x < 140 && y >= 40 && y < 120) return [90 + (x % 7) * 5, 60, 40];
    const v = 150 + Math.round((x / w) * 10);
    return [v, v, v + 2];
  });
  const { mask, ok } = PX.backgroundMask(d, w, h, 24);
  assert.equal(ok, true);
  assert.equal(mask[5 * w + 5], 255); assert.equal(mask[80 * w + 100], 0);
  const cov = PX.maskCoverage(mask, 128), objPm = (70 * 80 * 1000) / (w * h);
  near(cov, 1000 - objPm, 20, "background coverage");
  const box = PX.objectBox(d, w, h);
  near(box.x, 70, 2); near(box.y, 40, 2); near(box.w, 70, 3); near(box.h, 80, 3);
  const plain = rgba(50, 50, () => [128, 128, 128]);
  assert.equal(PX.backgroundMask(plain, 50, 50).ok, false, "all background → not found");
  assert.equal(PX.objectBox(plain, 50, 50), null);
  const bottom = rgba(w, h, (x, y) => (y >= 100 && x >= 60 && x < 140 ? [30, 30, 30] : [160, 160, 160]));
  const bm = PX.backgroundMask(bottom, w, h, 24);
  assert.equal(bm.mask[140 * w + 100], 0, "a seed on an object touching the edge is skipped");
});
test("maskCombine truth tables", () => {
  const a = new Uint8Array([0, 0, 255, 255, 128]), b = new Uint8Array([0, 255, 0, 255, 128]);
  assert.deepEqual([...PX.maskCombine(a, b, "new")], [0, 255, 0, 255, 128]);
  assert.deepEqual([...PX.maskCombine(a, b, "add")], [0, 255, 255, 255, 128]);
  assert.deepEqual([...PX.maskCombine(a, b, "sub")], [0, 0, 255, 0, 64]);
  assert.deepEqual([...PX.maskCombine(a, b, "and")], [0, 0, 0, 255, 128]);
  assert.deepEqual([...PX.maskCombine(null, b, "add")], [...b]);
  assert.deepEqual([...PX.maskInvert(a)], [255, 255, 0, 0, 127]);
});
test("feather is symmetric and keeps the mass; grow and shrink match a brute-force disc", () => {
  const w = 41, h = 41, m = new Uint8Array(w * h);
  for (let y = 15; y < 26; y++) for (let x = 15; x < 26; x++) m[y * w + x] = 255;
  const f = PX.maskFeather(m, w, h, 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { assert.equal(f[y * w + x], f[y * w + (w - 1 - x)]); assert.equal(f[y * w + x], f[x * w + y]); }
  let s0 = 0, s1 = 0; for (let i = 0; i < m.length; i++) { s0 += m[i]; s1 += f[i]; }
  near(s1, s0, s0 * 0.01, "mass");
  assert.deepEqual(PX.maskFeather(m, w, h, 0), m);
  const r = PX.mulberry32(11), W = 36, H = 28, s = new Uint8Array(W * H);
  for (let i = 0; i < s.length; i++) s[i] = r() < 0.06 ? 255 : r() < 0.1 ? 100 : 0;
  for (const px of [1, 2, 3, 6, -1, -2, -3, -5]) {
    const g = PX.maskGrow(s, W, H, px);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let want = s[y * W + x];
      if (px > 0) { if (want >= 128) want = 255; for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) if (s[yy * W + xx] >= 128 && (xx - x) ** 2 + (yy - y) ** 2 <= px * px) want = 255; }
      else { for (let yy = 0; yy < H; yy++) for (let xx = 0; xx < W; xx++) if (s[yy * W + xx] < 128 && (xx - x) ** 2 + (yy - y) ** 2 <= px * px) want = 0; }
      assert.equal(g[y * W + x], want, "px " + px + " at " + x + "," + y);
    }
  }
});
test("maskFillHoles, maskClusters, maskEdges, discOverlap, isBinaryish, maskBBox", () => {
  const w = 20, h = 20, m = new Uint8Array(w * h);
  for (let y = 2; y < 12; y++) for (let x = 2; x < 12; x++) m[y * w + x] = 255;
  m[6 * w + 6] = 0; m[6 * w + 7] = 0;
  for (let y = 14; y < 18; y++) for (let x = 14; x < 18; x++) m[y * w + x] = 255;
  m[0] = 255;
  const filled = PX.maskFillHoles(m, w, h, 10);
  assert.equal(filled[6 * w + 6], 255); assert.equal(filled[19 * w + 19], 0, "the outside is not a hole");
  assert.equal(PX.maskFillHoles(m, w, h, 1)[6 * w + 6], 0, "hole larger than maxArea stays");
  assert.equal(PX.maskClusters(m, w, h), 2, "two blobs (the 1 px speck is below minPx)");
  assert.equal(PX.maskClusters(m, w, h, 128, 1), 3);
  const sq = new Uint8Array(16 * 16); for (let y = 4; y < 10; y++) for (let x = 3; x < 11; x++) sq[y * 16 + x] = 255;
  const e = PX.maskEdges(sq, 16, 16);
  assert.ok(e instanceof Int32Array); assert.equal(e.length / 4, 4, "a rectangle outline is four merged segments");
  assert.deepEqual([...e.subarray(0, 4)], [3, 4, 11, 4]);
  assert.equal(PX.discOverlap(sq, 16, 16, 7, 7, 1), true); assert.equal(PX.discOverlap(sq, 16, 16, 14, 14, 2), false);
  assert.equal(PX.discOverlap(sq, 16, 16, 13, 7, 2.6), true, "disc reaching the edge");
  assert.equal(PX.isBinaryish(sq), true); assert.equal(PX.isBinaryish(PX.maskFeather(sq, 16, 16, 2)), false);
  assert.deepEqual(PX.maskBBox(sq, 16, 16), { x: 3, y: 4, w: 8, h: 6 }); assert.equal(PX.maskBBox(new Uint8Array(9), 3, 3), null);
});
test("RLE round trip (binary, soft, empty, long runs) and graceful decode", () => {
  const r = PX.mulberry32(5), cases = [new Uint8Array(0), new Uint8Array(1000), new Uint8Array(70000).fill(255), Uint8Array.from({ length: 5000 }, () => (r() * 256) | 0)];
  const blocks = new Uint8Array(1600 * 120); for (let i = 0; i < blocks.length; i++) blocks[i] = (i % 1600) > 400 && (i % 1600) < 1300 ? 255 : 0;
  cases.push(blocks, PX.maskFeather(blocks, 1600, 120, 4));
  for (const m of cases) {
    const e = PX.rleEncode(m);
    assert.ok(e.length <= m.length + 1, "never more than raw + 1 byte");
    assert.deepEqual(PX.rleDecode(e, m.length), m);
  }
  assert.ok(PX.rleEncode(blocks).length < 2000, "blocks compress");
  assert.deepEqual(PX.rleDecode(null, 4), new Uint8Array(4));
  assert.deepEqual(PX.rleDecode(new Uint8Array([0xa1, 7]), 3), new Uint8Array(3), "truncated input");
});

/* ---------- retouch ---------- */
test("poissonBlend: 48 × 48 hole converges to the exact (linear) solution in < 200 sweeps; half-resolution path for large regions", () => {
  const w = 52, h = 52, S = new Float32Array(w * h), T = new Float32Array(w * h), M = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { S[y * w + x] = 100 + 20 * Math.sin(x / 3); T[y * w + x] = S[y * w + x] + 0.5 * x + 0.3 * y + 10; }
  for (let y = 2; y < 50; y++) for (let x = 2; x < 50; x++) M[y * w + x] = 1;
  const out = PX.poissonBlend(S, T, M, w, h, { maxIter: 2000, tol: 0.001 });
  assert.ok(out.iters < 200, "sweeps " + out.iters);
  let mx = 0; for (let i = 0; i < w * h; i++) mx = Math.max(mx, Math.abs(out[i] - T[i]));
  assert.ok(mx < 0.5, "error " + mx);
  const many = PX.poissonBlend([S, S], [T, T], M, w, h);
  assert.equal(many.length, 2);
  const W = 340, H = 330, S2 = new Float32Array(W * H), T2 = new Float32Array(W * H), M2 = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { S2[y * W + x] = 50; T2[y * W + x] = 50 + 0.2 * x - 0.1 * y; if (x > 3 && y > 3 && x < W - 4 && y < H - 4) M2[y * W + x] = 1; }
  const big = PX.poissonBlend(S2, T2, M2, W, H, { tol: 0.05 });
  let e2 = 0; for (let i = 0; i < W * H; i++) e2 = Math.max(e2, Math.abs(big[i] - T2[i]));
  assert.ok(e2 < 3, "half-resolution solve error " + e2);
});
test("diffuseInpaint fills a 6 px scratch on a gradient (error < 3); known pixels untouched", () => {
  const w = 80, h = 60, d = rgba(w, h, (x, y) => [40 + x * 2, 30 + y * 3, 200 - x]), ref = d.slice(), hole = new Uint8Array(w * h);
  for (let y = 10; y < 50; y++) for (let x = 30; x < 36; x++) { hole[y * w + x] = 1; const i = (y * w + x) * 4; d[i] = 255; d[i + 1] = 0; d[i + 2] = 255; }
  PX.diffuseInpaint(d, w, h, hole, null);
  let mx = 0;
  for (let i = 0; i < w * h; i++) for (let c = 0; c < 4; c++) { const e = Math.abs(d[i * 4 + c] - ref[i * 4 + c]); if (hole[i]) mx = Math.max(mx, e); else assert.equal(e, 0); }
  assert.ok(mx < 3, "max error " + mx);
});
test("spotSource finds a planted clean patch", () => {
  // texture constant along (5, 11): only the candidate (5, 11) (direction 3 of 16 at 1.5 r, r = 8) matches the ring exactly
  const w = 120, h = 100, dx = Math.round(Math.cos((2 * Math.PI * 3) / 16) * 12), dy = Math.round(Math.sin((2 * Math.PI * 3) / 16) * 12);
  assert.deepEqual([dx, dy], [5, 11]);
  const hv = (k) => { const r = PX.mulberry32(k + 1000); return r() * 255; };
  const d = rgba(w, h, (x, y) => { const k = 11 * x - 5 * y; return [hv(k), hv(k + 7), hv(k + 13)]; }), hole = new Uint8Array(w * h);
  for (let y = 46; y <= 54; y++) for (let x = 56; x <= 64; x++) { hole[y * w + x] = 1; const i = (y * w + x) * 4; d[i] = 255; d[i + 1] = 0; d[i + 2] = 0; }
  const box = PX.maskBBox(hole, w, h), s = PX.spotSource(d, w, h, hole, box, 8);
  assert.deepEqual([s.dx, s.dy], [dx, dy]);
  assert.ok(Number.isFinite(s.score));
  assert.equal(PX.spotSource(d, w, h, new Uint8Array(w * h), null, 4).score, Infinity);
});
test("dodgeBurnLut matches the GIMP formulas; burn darkens, dodge lightens; spongeFn; tipAlpha", () => {
  for (const e of [0.15, 0.5, -0.15, -0.5]) for (const range of [0, 1, 2]) {
    const l = PX.dodgeBurnLut(range, e);
    for (let v = 0; v < 256; v += 5) {
      const i = v / 255;
      let o;
      if (range === 2) o = i * (1 + e / 3);
      else if (range === 1) o = Math.pow(i, e < 0 ? 1 - e / 3 : 1 / (1 + e));
      else if (e >= 0) o = e / 3 + i - (e / 3) * i;
      else o = i < -e / 3 ? 0 : (i + e / 3) / (1 + e / 3);
      near(l[v], Math.max(0, Math.min(1, o)) * 255, 1e-3, "range " + range + " e " + e + " v " + v);
      if (e > 0) assert.ok(l[v] >= v - 1e-6); else assert.ok(l[v] <= v + 1e-6);
    }
  }
  const de = PX.spongeFn(-1, false)(200, 100, 50);
  assert.ok(Math.abs(de[0] - de[2]) < 1e-9, "full desaturation is grey");
  const sat = PX.spongeFn(0.5, true)(140, 120, 110); assert.ok(sat[0] > 140 && sat[2] < 110);
  for (const [D, hd] of [[1, 0.5], [2, 1], [7, 0], [12, 0.5], [31, 1]]) {
    const t = PX.tipAlpha(D, hd);
    assert.equal(t.length, D * D);
    const c = Math.floor(D / 2);
    assert.ok(t[c * D + c] > 0.49, "centre");
    for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) { assert.ok(t[y * D + x] >= 0 && t[y * D + x] <= 1); near(t[y * D + x], t[y * D + (D - 1 - x)], 1e-6); near(t[y * D + x], t[x * D + y], 1e-6); }
    if (D > 6) assert.ok(t[0] < 0.05, "corner outside the disc");
  }
  const soft = PX.tipAlpha(21, 0), hard = PX.tipAlpha(21, 1);
  assert.ok(soft[10 * 21 + 16] < hard[10 * 21 + 16], "hardness keeps the edge");
  assert.deepEqual(PX.tipAlpha(9, 50), PX.tipAlpha(9, 0.5), "percent accepted");
});
test("traceFn: deterministic for equal seeds, different per preset and per seed; strength 0 is identity; colour of each preset", () => {
  const pts = []; const r = PX.mulberry32(3); for (let k = 0; k < 200; k++) pts.push([r() * 255, r() * 255, r() * 255, Math.floor(r() * 400), Math.floor(r() * 300)]);
  const outs = {};
  for (const pr of [1, 2, 3, 4]) {
    const a = PX.traceFn(pr, 0.8, 1234), b = PX.traceFn(pr, 0.8, 1234), z = PX.traceFn(pr, 0, 1234);
    outs[pr] = pts.map((p) => a(...p));
    pts.forEach((p, i) => { assert.deepEqual(b(...p), outs[pr][i]); z(...p).forEach((v, c) => near(v, p[c], 1e-9)); outs[pr][i].forEach((v) => assert.ok(v >= 0 && v <= 255)); });
  }
  for (const a of [1, 2, 3, 4]) for (const b of [1, 2, 3, 4]) if (a < b) assert.notDeepEqual(outs[a], outs[b], a + " vs " + b);
  const s1 = PX.traceFn(2, 0.8, 1), s2 = PX.traceFn(2, 0.8, 2);
  assert.notDeepEqual(pts.map((p) => s1(...p)), pts.map((p) => s2(...p)));
  const cell = PX.traceFn(3, 1, 5); assert.deepEqual(cell(100, 100, 100, 8, 8), cell(100, 100, 100, 11, 11), "one value per 4 px cell");
  const gloss = PX.traceFn(1, 1, 0)(60, 40, 30); assert.ok(gloss[0] > 60 && gloss[0] - gloss[2] < 30, "gloss lifts and desaturates");
  const rust = PX.traceFn(2, 1, 0)(128, 128, 128, 10, 10); assert.ok(rust[0] > rust[1] && rust[1] > rust[2], "rust is orange-brown");
  const scr = PX.traceFn(4, 1, 0)(50, 50, 50); assert.ok(scr[0] > 100);
  assert.equal(PX.traceFn(1, 1, 0).blur, 1.2); assert.equal(PX.traceFn(4, 1, 0).hard, 1); assert.equal(PX.traceFn(9, 1, 0).preset, 1);
});

/* ---------- geometry ---------- */
test("straightenAngle at ±45° and near vertical; autoCropScale(1600, 1000, 5) = 0.881 ± 0.001; rotatedBounds; cropForRatio", () => {
  assert.equal(PX.straightenAngle(0, 0, 10, 10), 45); assert.equal(PX.straightenAngle(0, 0, 10, -10), -45);
  near(PX.straightenAngle(0, 0, 100, 3), (Math.atan2(3, 100) * 180) / Math.PI, 1e-9);
  near(PX.straightenAngle(0, 0, -100, -3), (Math.atan2(3, 100) * 180) / Math.PI, 1e-9, "direction does not matter");
  near(PX.straightenAngle(0, 0, 5, 100), -(Math.atan2(5, 100) * 180) / Math.PI, 1e-9, "near-vertical");
  near(PX.autoCropScale(1600, 1000, 5), 0.881, 0.001);
  assert.equal(PX.autoCropScale(1600, 1000, 0), 1); near(PX.autoCropScale(1600, 1000, -5), PX.autoCropScale(1600, 1000, 5), 1e-12);
  assert.deepEqual(PX.rotatedBounds(1600, 1000, 90), { w: 1000, h: 1600 }); assert.deepEqual(PX.rotatedBounds(1600, 1000, 0), { w: 1600, h: 1000 });
  const rb = PX.rotatedBounds(100, 50, 30); assert.equal(rb.w, Math.ceil(100 * Math.cos(Math.PI / 6) + 50 * 0.5 - 1e-6));
  const c1 = PX.cropForRatio(1600, 1200, 1, null, 0); assert.deepEqual(c1, { x: 200, y: 0, w: 1200, h: 1200 });
  const c2 = PX.cropForRatio(1600, 1200, 0.8, { x: 600, y: 400, w: 300, h: 300 }, 0.1);
  near(c2.w / c2.h, 0.8, 0.01); assert.ok(c2.x <= 570 && c2.x + c2.w >= 930 && c2.y <= 370 && c2.y + c2.h >= 730, "contains box + margin");
  const c3 = PX.cropForRatio(1600, 1200, 2, { x: 0, y: 0, w: 1600, h: 1200 }, 15);
  assert.ok(c3.x >= 0 && c3.y >= 0 && c3.x + c3.w <= 1600 && c3.y + c3.h <= 1200); near(c3.w / c3.h, 2, 0.01);
  assert.deepEqual(PX.cropForRatio(1600, 1200, null, { x: 100, y: 100, w: 200, h: 100 }, 0), { x: 100, y: 100, w: 200, h: 100 });
});

/* ---------- analysis ---------- */
test("diffMask: changed area found, JPEG-like speckle removed", () => {
  const w = 100, h = 80, a = blobImg(w, h, 2), b = a.slice(), r = PX.mulberry32(6);
  for (let y = 20; y < 40; y++) for (let x = 30; x < 70; x++) { const i = (y * w + x) * 4; b[i] = 255 - b[i]; }
  for (let k = 0; k < 40; k++) { const i = (Math.floor(r() * w * h)) * 4; b[i + 1] = (b[i + 1] + 60) % 256; }
  const { mask, permille } = PX.diffMask(a, b, w, h);
  near(permille, 100, 12, "20 × 40 of 100 × 80");
  assert.equal(mask[30 * w + 50], 255);
});
test("alignSearch recovers (5, −3) and scale 1.02", () => {
  const w = 192, h = 128, a = blobImg(w, h, 31, 9), b = new Uint8ClampedArray(w * h * 4), dx = 5, dy = -3, sc = 1.02, cx = w / 2, cy = h / 2;
  const at = (x, y, c) => { x = Math.max(0, Math.min(w - 1, x)); y = Math.max(0, Math.min(h - 1, y)); const x0 = Math.floor(x), y0 = Math.floor(y), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(h - 1, y0 + 1), tx = x - x0, ty = y - y0; const g = (xx, yy) => a[(yy * w + xx) * 4 + c]; return (g(x0, y0) * (1 - tx) + g(x1, y0) * tx) * (1 - ty) + (g(x0, y1) * (1 - tx) + g(x1, y1) * tx) * ty; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const X = cx + sc * (x + 0.5 - cx) + dx - 0.5, Y = cy + sc * (y + 0.5 - cy) + dy - 0.5, i = (y * w + x) * 4;
    for (let c = 0; c < 3; c++) b[i + c] = at(X, Y, c);
    b[i + 3] = 255;
  }
  const r = PX.alignSearch(a, b, w, h, { range: 6 });
  assert.deepEqual([r.dx, r.dy, r.sc], [dx, dy, sc]);
  assert.ok(r.err < 3, "err " + r.err);
  const same = PX.alignSearch(a, a, w, h, {}); assert.deepEqual([same.dx, same.dy, same.sc], [0, 0, 1]);
});
test("dHash stable under noise (≤ 4) and distinct across images (≥ 10)", () => {
  const imgs = [1, 2, 3, 4, 5].map((s) => blobImg(160, 120, s * 17, 8)), hs = imgs.map((d) => PX.dHash(d, 160, 120));
  hs.forEach((x) => assert.match(x, /^[0-9a-f]{16}$/));
  const r = PX.mulberry32(99);
  imgs.forEach((d, k) => { const n = d.slice(); for (let i = 0; i < n.length; i++) if (i % 4 !== 3) n[i] += Math.round((r() - 0.5) * 16); assert.ok(PX.hamming(hs[k], PX.dHash(n, 160, 120)) <= 4); });
  for (let i = 0; i < hs.length; i++) for (let j = i + 1; j < hs.length; j++) assert.ok(PX.hamming(hs[i], hs[j]) >= 10, i + "," + j + " " + PX.hamming(hs[i], hs[j]));
});
test("lightLinesMeet: converging lines meet, parallel lines meet, diverging lines report the spread", () => {
  const L = [500, 100], line = (tx, ty) => ({ a: tx, b: ty, c: tx + (L[0] - tx) * 0.3, d: ty + (L[1] - ty) * 0.3 });
  const m = PX.lightLinesMeet([line(100, 900), line(800, 950), line(450, 990)]);
  assert.equal(m.meet, true); assert.ok(m.spreadDeg < 0.5);
  assert.equal(PX.lightLinesMeet([{ a: 0, b: 900, c: 100, d: 800 }, { a: 500, b: 900, c: 600, d: 800 }]).meet, true, "parallel");
  assert.equal(PX.lightLinesMeet([[0, 900, 100, 800], [500, 900, 500, 750]]).meet, true, "meeting ahead at (500, 400)");
  const d = PX.lightLinesMeet([[0, 900, -100, 800], [500, 900, 500, 750]]);
  assert.equal(d.meet, false); near(d.spreadDeg, 45, 0.2);
  assert.deepEqual(PX.lightLinesMeet([]), { meet: true, spreadDeg: 0 });
});
