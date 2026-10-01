import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clamp, mulberry32, pressureCurve,
  matMul, matInv, matApply, matTRS,
  hexToRgb, rgbToHex, rgbToHsv, hsvToRgb, rgbToHsl, hslToRgb, harmony, luminance,
  encodePts, decodePts, packOps, unpackOps,
  fitShape, encodeTl, decodeTl,
  floodMask, dilateMask, maskBBox,
  adjustHSL, adjustBC, invertRGB, grayscale, posterize, addNoise, boxBlur, sharpen,
  guideLines, assistSnap, symMatrices,
} from "./src-sketch-core.mjs";

/* ---------- 도우미 ---------- */

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || "값"}: ${a} ≉ ${b} (±${eps})`);
const nearArr = (a, b, eps, msg) => { assert.equal(a.length, b.length, msg); a.forEach((v, i) => near(v, b[i], eps, `${msg || "배열"}[${i}]`)); };
const DEG = Math.PI / 180;
const SEEDS = Array.from({ length: 25 }, (_, i) => i + 1);

/* [x,y,...] → 손떨림(±amp px)을 얹은 획 [x,y,필압,...] */
const stroke = (xy, seed, amp = 3) => {
  const r = seed == null ? () => 0.5 : mulberry32(seed), o = [];
  for (let i = 0; i < xy.length; i += 2) o.push(xy[i] + (r() * 2 - 1) * amp, xy[i + 1] + (r() * 2 - 1) * amp, 0.5);
  return o;
};
const ellipseXY = (cx, cy, rx, ry, rot, n, sweep = Math.PI * 2, t0 = 0.3) => {
  const o = [];
  for (let i = 0; i <= n; i++) {
    const t = t0 + (sweep * i) / n, u = rx * Math.cos(t), v = ry * Math.sin(t);
    o.push(cx + u * Math.cos(rot) - v * Math.sin(rot), cy + u * Math.sin(rot) + v * Math.cos(rot));
  }
  return o;
};
/* 꼭짓점을 따라 변마다 per개씩 찍는다. upto(0..1)로 마지막 변을 덜 그릴 수 있다 */
const polyXY = (V, per, closed, upto = 1) => {
  const o = [], k = V.length, m = closed ? k : k - 1;
  for (let e = 0; e < m; e++) {
    const a = V[e], b = V[(e + 1) % k], last = e === m - 1;
    for (let i = 0; i < per; i++) { const t = i / per; if (last && t > upto) break; o.push(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t); }
  }
  if (upto >= 1) { const l = V[closed ? 0 : k - 1]; o.push(l[0], l[1]); }
  return o;
};
const rotPts = (V, a, cx, cy) => V.map(([x, y]) => [cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)]);
const regular = (k, r, cx, cy, a0 = 0) => Array.from({ length: k }, (_, i) => [cx + r * Math.cos(a0 + (i * 2 * Math.PI) / k), cy + r * Math.sin(a0 + (i * 2 * Math.PI) / k)]);
/* 결과 꼭짓점마다 가장 가까운 참 꼭짓점까지의 거리 가운데 최댓값 */
const vertexErr = (pts, V) => {
  let worst = 0;
  for (const [x, y] of V) { let d = Infinity; for (let i = 0; i < pts.length; i += 2) d = Math.min(d, Math.hypot(pts[i] - x, pts[i + 1] - y)); worst = Math.max(worst, d); }
  return worst;
};

/* w×h RGBA 그림. fn(x,y) → [r,g,b,a] */
const image = (w, h, fn) => {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d.set(fn(x, y), (y * w + x) * 4);
  return d;
};
const px = (d, w, x, y) => Array.from(d.subarray((y * w + x) * 4, (y * w + x) * 4 + 4));
const WHITE = [255, 255, 255, 255], BLACK = [0, 0, 0, 255], CLEAR = [0, 0, 0, 0];

/* ---------- 수 ---------- */

test("clamp: 범위 안은 그대로, 밖은 끝값", () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-3, 0, 10), 0);
  assert.equal(clamp(42, 0, 10), 10);
});

test("mulberry32: 같은 씨앗이면 같은 수열, 값은 0 이상 1 미만", () => {
  const a = mulberry32(7), b = mulberry32(7), c = mulberry32(8);
  const A = Array.from({ length: 200 }, a), B = Array.from({ length: 200 }, b), C = Array.from({ length: 200 }, c);
  assert.deepEqual(A, B);
  assert.notDeepEqual(A, C);
  assert.ok(A.every((v) => v >= 0 && v < 1));
  near(A.reduce((s, v) => s + v, 0) / A.length, 0.5, 0.08, "평균");
});

test("pressureCurve: 0..1로 자르고 gamma 제곱, gamma<1이면 약한 필압이 커진다", () => {
  assert.equal(pressureCurve(0.5), 0.5);
  assert.equal(pressureCurve(-1), 0);
  assert.equal(pressureCurve(3), 1);
  assert.equal(pressureCurve(NaN), 0);
  near(pressureCurve(0.25, 0.5), 0.5, 1e-12);
  assert.ok(pressureCurve(0.2, 0.6) > 0.2);
  assert.ok(pressureCurve(0.2, 2) < 0.2);
  assert.equal(pressureCurve(1, 0.3), 1);
});

/* ---------- 행렬 ---------- */

test("matApply: x' = a·x + c·y + e, y' = b·x + d·y + f", () => {
  assert.deepEqual(matApply([2, 3, 4, 5, 6, 7], 1, 10), [2 + 40 + 6, 3 + 50 + 7]);
  assert.deepEqual(matApply([1, 0, 0, 1, 0, 0], 3, 4), [3, 4]);
});

test("matMul(m, n): n을 먼저 적용하고 m을 적용한다", () => {
  const scale = [2, 0, 0, 2, 0, 0], move = [1, 0, 0, 1, 10, 0];
  assert.deepEqual(matApply(matMul(move, scale), 1, 1), [12, 2]);   // 배율 뒤 이동
  assert.deepEqual(matApply(matMul(scale, move), 1, 1), [22, 2]);   // 이동 뒤 배율
  const m = [0.5, 0.2, -0.3, 1.5, 7, -4], n = [1.2, -0.7, 0.4, 0.9, 3, 5];
  nearArr(matApply(matMul(m, n), 3, -2), matApply(m, ...matApply(n, 3, -2)), 1e-12);
});

test("matInv: 역행렬을 곱하면 항등, 행렬식 0이면 null", () => {
  const m = [0.5, 0.2, -0.3, 1.5, 7, -4];
  nearArr(matMul(m, matInv(m)), [1, 0, 0, 1, 0, 0], 1e-12);
  nearArr(matMul(matInv(m), m), [1, 0, 0, 1, 0, 0], 1e-12);
  assert.equal(matInv([1, 2, 2, 4, 0, 0]), null);
  assert.equal(matInv([0, 0, 0, 0, 5, 5]), null);
  assert.deepEqual(matInv([1, 0, 0, 1, 0, 0]), [1, 0, 0, 1, 0, 0], "-0이 섞이지 않는다");
});

test("matTRS: 기본값은 항등, 중심은 제자리에 있다가 tx,ty만큼만 옮겨진다", () => {
  assert.deepEqual(matTRS({}), [1, 0, 0, 1, 0, 0]);
  assert.deepEqual(matTRS(), [1, 0, 0, 1, 0, 0]);
  const m = matTRS({ tx: 5, ty: -3, rot: 1.1, sx: 2, sy: 0.5, cx: 40, cy: 60 });
  nearArr(matApply(m, 40, 60), [45, 57], 1e-9);
});

test("matTRS: 배율을 먼저, 회전을 나중에 한다", () => {
  const m = matTRS({ rot: Math.PI / 2, sx: 2, sy: 1 });
  nearArr(matApply(m, 1, 0), [0, 2], 1e-12);     // (1,0) → 배율 (2,0) → 90° 회전 (0,2)
  nearArr(matApply(m, 0, 1), [-1, 0], 1e-12);
  const c = matTRS({ rot: Math.PI, cx: 10, cy: 10 });
  nearArr(matApply(c, 12, 10), [8, 10], 1e-12);
});

/* ---------- 색 ---------- */

test("hexToRgb: 여섯 자리·세 자리·소문자를 받는다", () => {
  assert.deepEqual(hexToRgb("#FF8000"), [255, 128, 0]);
  assert.deepEqual(hexToRgb("#abc"), [170, 187, 204]);
  assert.deepEqual(hexToRgb("#2f62b5"), [47, 98, 181]);
  assert.deepEqual(hexToRgb("2F62B5"), [47, 98, 181]);
});

test("hexToRgb: 잘못된 값이면 [0,0,0]", () => {
  for (const bad of ["", "#12", "#GGGGGG", "red", null, undefined, 12, "#1234567"]) assert.deepEqual(hexToRgb(bad), [0, 0, 0], String(bad));
});

test("rgbToHex: 대문자, 반올림, 범위 자름", () => {
  assert.equal(rgbToHex(255, 128, 0), "#FF8000");
  assert.equal(rgbToHex(10.6, 0.4, 15), "#0B000F");
  assert.equal(rgbToHex(-20, 300, NaN), "#00FF00");
  assert.equal(rgbToHex(...hexToRgb("#6f4aa0")), "#6F4AA0");
});

test("rgbToHsv·hsvToRgb: 기준 색", () => {
  assert.deepEqual(rgbToHsv(255, 0, 0), [0, 1, 1]);
  assert.deepEqual(rgbToHsv(0, 255, 0), [120, 1, 1]);
  assert.deepEqual(rgbToHsv(0, 0, 255), [240, 1, 1]);
  assert.deepEqual(rgbToHsv(0, 0, 0), [0, 0, 0]);
  assert.deepEqual(rgbToHsv(255, 255, 255), [0, 0, 1]);
  assert.deepEqual(hsvToRgb(60, 1, 1), [255, 255, 0]);
  assert.deepEqual(hsvToRgb(180, 1, 0.5), [0, 128, 128]);
  assert.deepEqual(hsvToRgb(300, 0, 0.2), [51, 51, 51]);
});

test("rgbToHsl·hslToRgb: 기준 색", () => {
  assert.deepEqual(rgbToHsl(255, 0, 0), [0, 1, 0.5]);
  assert.deepEqual(rgbToHsl(255, 255, 255), [0, 0, 1]);
  nearArr(rgbToHsl(128, 128, 128), [0, 0, 128 / 255], 1e-12);
  assert.deepEqual(hslToRgb(120, 1, 0.5), [0, 255, 0]);
  assert.deepEqual(hslToRgb(240, 1, 0.25), [0, 0, 128]);
  assert.deepEqual(hslToRgb(0, 0, 1), [255, 255, 255]);
  assert.deepEqual(hslToRgb(77, 0.4, 0), [0, 0, 0]);
});

test("HSV·HSL: 임의의 색을 바꿨다 되돌리면 같은 색", () => {
  const r = mulberry32(11);
  for (let i = 0; i < 500; i++) {
    const c = [Math.floor(r() * 256), Math.floor(r() * 256), Math.floor(r() * 256)];
    const hsv = rgbToHsv(...c), hsl = rgbToHsl(...c);
    assert.ok(hsv[0] >= 0 && hsv[0] < 360 && hsv[1] >= 0 && hsv[1] <= 1 && hsv[2] >= 0 && hsv[2] <= 1);
    assert.ok(hsl[0] >= 0 && hsl[0] < 360 && hsl[1] >= 0 && hsl[1] <= 1 && hsl[2] >= 0 && hsl[2] <= 1);
    assert.deepEqual(hsvToRgb(...hsv), c);
    assert.deepEqual(hslToRgb(...hsl), c);
  }
});

test("hsvToRgb·hslToRgb: 색상은 360°로 돌고, 채도·명도는 범위로 자른다", () => {
  assert.deepEqual(hsvToRgb(-120, 1, 1), hsvToRgb(240, 1, 1));
  assert.deepEqual(hsvToRgb(480, 1, 1), hsvToRgb(120, 1, 1));
  assert.deepEqual(hsvToRgb(360, 1, 1), [255, 0, 0]);
  assert.deepEqual(hsvToRgb(0, 5, 9), [255, 0, 0]);
  assert.deepEqual(hslToRgb(-360, 1, 0.5), [255, 0, 0]);
  assert.deepEqual(hslToRgb(0, -1, 2), [255, 255, 255]);
});

test("harmony: 종류마다 색 수와 색상 차이", () => {
  const hueOf = (hex) => rgbToHsv(...hexToRgb(hex))[0];
  const diff = (a, b) => { const d = Math.abs(hueOf(a) - hueOf(b)) % 360; return Math.min(d, 360 - d); };
  const base = "#D63A2F";
  const want = { complement: [180], analogous: [30, 30], triad: [120, 120], split: [150, 150], tetrad: [90, 180, 90] };
  for (const [kind, ds] of Object.entries(want)) {
    const h = harmony(base, kind);
    assert.equal(h.length, ds.length + 1, kind);
    assert.equal(h[0], base, kind);
    ds.forEach((d, i) => near(diff(h[0], h[i + 1]), d, 1.5, `${kind}[${i + 1}]`));
    assert.ok(h.every((c) => /^#[0-9A-F]{6}$/.test(c)), kind);
  }
  assert.notEqual(harmony(base, "analogous")[1], harmony(base, "analogous")[2]);
  assert.deepEqual(harmony("#ff0000", "complement"), ["#FF0000", "#00FFFF"]);
  assert.deepEqual(harmony("#ff0000", "triad"), ["#FF0000", "#00FF00", "#0000FF"]);
});

test("harmony: 소문자·세 자리 입력은 대문자 여섯 자리로, 모르는 종류는 입력 색만, 무채색은 그대로", () => {
  assert.deepEqual(harmony("#abc", "nope"), ["#AABBCC"]);
  assert.deepEqual(harmony("#777777", "triad"), ["#777777", "#777777", "#777777"]);
  assert.deepEqual(harmony("zzz", "complement"), ["#000000", "#000000"]);
});

test("luminance: 흰색 1, 검정 0, WCAG 식", () => {
  assert.equal(luminance("#000000"), 0);
  near(luminance("#FFFFFF"), 1, 1e-12);
  near(luminance("#FF0000"), 0.2126, 1e-4);
  near(luminance("#00FF00"), 0.7152, 1e-4);
  near(luminance("#808080"), 0.2159, 1e-3);
  assert.equal(luminance("#fff"), luminance("#FFFFFF"));
  assert.equal(luminance("엉뚱한 값"), 0);
});

/* ---------- 점 목록 꾸리기 ---------- */

test("encodePts → decodePts: 오차는 x,y 0.25px, 필압 0.005 이하", () => {
  const r = mulberry32(3), pts = [];
  let x = 400, y = 300;
  for (let i = 0; i < 600; i++) { x += (r() - 0.5) * 14; y += (r() - 0.5) * 14; pts.push(x, y, r()); }
  const s = encodePts(pts), back = decodePts(s);
  assert.match(s, /^[A-Za-z0-9_-]+$/);
  assert.equal(back.length, pts.length);
  for (let i = 0; i < pts.length; i += 3) {
    near(back[i], pts[i], 0.25 + 1e-9, "x"); near(back[i + 1], pts[i + 1], 0.25 + 1e-9, "y"); near(back[i + 2], pts[i + 2], 0.005 + 1e-9, "p");
  }
});

test("encodePts: 양자화된 값은 그대로 되돌아오고, 다시 꾸려도 같은 문자열", () => {
  const pts = [10, 20.5, 0.3, 11.5, 19, 0.31, 250, 0, 1, 0, 0, 0];
  assert.deepEqual(decodePts(encodePts(pts)), pts);
  const r = mulberry32(5), raw = Array.from({ length: 90 }, (_, i) => (i % 3 === 2 ? r() : r() * 1500));
  const once = encodePts(raw);
  assert.equal(encodePts(decodePts(once)), once);
});

test("encodePts·decodePts: 빈 입력", () => {
  assert.equal(encodePts([]), "");
  assert.equal(encodePts(null), "");
  assert.equal(encodePts(undefined), "");
  assert.deepEqual(decodePts(""), []);
  assert.deepEqual(decodePts(null), []);
});

test("encodePts: 음수 좌표와 큰 건너뜀", () => {
  const pts = [-12.5, -3000, 0, 5000, 4200.5, 1, -0.5, 0, 0.5];
  assert.deepEqual(decodePts(encodePts(pts)), pts);
});

test("encodePts: 필압은 0..1로 자르고, 숫자가 아닌 값은 0, 셋이 안 되는 꼬리는 버린다", () => {
  assert.deepEqual(decodePts(encodePts([1, 2, 7, 3, 4, -2])), [1, 2, 1, 3, 4, 0]);
  assert.deepEqual(decodePts(encodePts([NaN, 2, undefined])), [0, 2, 0]);
  assert.deepEqual(decodePts(encodePts([1, 2, 0.5, 9, 9])), [1, 2, 0.5]);
});

test("decodePts: 알파벳 밖 글자에서 멈추고, 끝나지 않은 값은 버린다", () => {
  const s = encodePts([10, 20, 0.5, 30, 40, 0.6]);
  assert.deepEqual(decodePts(s + "!" + s), [10, 20, 0.5, 30, 40, 0.6]);
  assert.deepEqual(decodePts(encodePts([10, 20, 0.5]) + "g"), [10, 20, 0.5]);   // g = 이어짐 비트만 선 글자
  assert.deepEqual(decodePts("한글"), []);
});

test("encodePts: 같은 획의 JSON보다 훨씬 짧다", () => {
  const pts = stroke(ellipseXY(700, 500, 300, 200, 0.4, 400), 9, 1.5);
  assert.ok(encodePts(pts).length < JSON.stringify(pts).length / 6, `${encodePts(pts).length} / ${JSON.stringify(pts).length}`);
  assert.ok(encodePts(pts).length <= (pts.length / 3) * 4, "점 하나에 네 글자 이하");
});

test("encodeTl·decodeTl: 0..1 숫자 배열을 1/100 단위로", () => {
  const tl = [0, 0.254, 0.5, 1, 0.999, 0.001, 0.33];
  const back = decodeTl(encodeTl(tl));
  assert.deepEqual(back, [0, 0.25, 0.5, 1, 1, 0, 0.33]);
  assert.match(encodeTl(tl), /^[A-Za-z0-9_-]+$/);
  assert.deepEqual(decodeTl(encodeTl([-3, 7, NaN])), [0, 1, 0], "범위로 자른다");
  assert.equal(encodeTl([]), "");
  assert.equal(encodeTl(null), "");
  assert.deepEqual(decodeTl(""), []);
  assert.deepEqual(decodeTl(undefined), []);
});

test("packOps: _로 시작하는 속성은 버리고 pts·tl은 문자열로 바꾼다", () => {
  const ops = [{ kind: "stroke", color: "#111111", pts: [10, 20, 0.5, 12, 22, 0.6], tl: [0, 0.25, 1], _cache: { big: 1 }, _len: 3 }];
  const out = JSON.parse(packOps(ops));
  assert.deepEqual(out, [{ kind: "stroke", color: "#111111", pts: { $p: encodePts(ops[0].pts) }, tl: { $t: out[0].tl.$t } }]);
  assert.match(out[0].tl.$t, /^[A-Za-z0-9_-]+$/);
  assert.equal(ops[0]._len, 3, "원본은 건드리지 않는다");
  assert.ok(Array.isArray(ops[0].pts));
});

test("packOps: 평범한 값이 아니면 opts.image가 없을 때 버린다", () => {
  class Canvas {}
  const ops = [{ kind: "image", img: new Canvas(), fn: () => 1, bytes: new Uint8Array(4), when: new Date(0), none: undefined, keep: null, x: 1 }];
  assert.deepEqual(JSON.parse(packOps(ops)), [{ kind: "image", keep: null, x: 1 }]);
});

test("packOps: opts.image(값, 키, op)의 반환을 $i로 넣고, null이면 속성을 버린다", () => {
  class Canvas { constructor(id) { this.id = id; } }
  const a = new Canvas("a"), b = new Canvas("b"), calls = [];
  const ops = [{ kind: "image", img: a, mask: b, nest: { src: a } }];
  const out = JSON.parse(packOps(ops, { image: (v, key, op) => { calls.push([v, key, op]); return v.id === "b" ? null : "ref:" + v.id; } }));
  assert.deepEqual(out, [{ kind: "image", img: { $i: "ref:a" }, nest: { src: { $i: "ref:a" } } }]);
  assert.deepEqual(calls.map((c) => c[1]), ["img", "mask", "src"]);
  assert.ok(calls.every((c) => c[2] === ops[0]), "셋째 인자는 맨 위 작업 객체");
  assert.equal(calls[0][0], a);
});

test("packOps: 정수가 아닌 수는 소수 둘째 자리까지, 행렬 m은 여섯째 자리까지", () => {
  const out = JSON.parse(packOps([{ size: 12.3456, op: 0.456, n: 7, big: 123456789, m: [1.23456789, 0, 0, 0.99999949, 10.5, -3.1234567], at: { x: 0.005, y: -1.999 } }]));
  assert.deepEqual(out, [{ size: 12.35, op: 0.46, n: 7, big: 123456789, m: [1.234568, 0, 0, 0.999999, 10.5, -3.123457], at: { x: 0.01, y: -2 } }]);
  assert.deepEqual(JSON.parse(packOps([{ v: NaN, w: Infinity }])), [{ v: null, w: null }]);
});

test("packOps: 회전(rot)·배율(sx·sy)은 넷째 자리까지 두고 opts.digits로 바꿀 수 있다", () => {
  assert.deepEqual(JSON.parse(packOps([{ rot: 0.123456, sx: 1.23456, sy: 2, w: 1.23456 }])), [{ rot: 0.1235, sx: 1.2346, sy: 2, w: 1.23 }]);
  assert.deepEqual(JSON.parse(packOps([{ rot: 0.123456, w: 1.23456 }], { digits: { rot: 2, w: 3 } })), [{ rot: 0.12, w: 1.235 }]);
});

test("packOps: 중첩된 객체·배열에도 같은 규칙", () => {
  class Img {}
  const ops = [{ kind: "group", items: [{ pts: [1, 2, 0.5], _tmp: 1, deep: { _x: 1, tl: [0.5], list: [1.239, { _y: 2, z: 3.14159 }] } }, { src: new Img() }], arr: [new Img(), 1.005, "글자"] }];
  assert.deepEqual(JSON.parse(packOps(ops)), [{
    kind: "group",
    items: [{ pts: { $p: encodePts([1, 2, 0.5]) }, deep: { tl: { $t: JSON.parse(packOps([{ tl: [0.5] }]))[0].tl.$t }, list: [1.24, { z: 3.14 }] } }, {}],
    arr: [null, 1, "글자"],
  }]);
});

test("packOps: 둘씩 묶인 꼭짓점 배열(pts)과 0..1을 벗어난 tl은 숫자 배열로 둔다", () => {
  const poly = { type: "poly", pts: [100.126, 200, 300, 250.5, 180, 400.999, 90, 310], closed: true };
  assert.deepEqual(JSON.parse(packOps([poly])), [{ type: "poly", pts: [100.13, 200, 300, 250.5, 180, 401, 90, 310], closed: true }]);
  assert.deepEqual(JSON.parse(packOps([{ pts: [10, 20, 30, 40, 50, 60] }])), [{ pts: [10, 20, 30, 40, 50, 60] }], "셋째 값이 필압 범위 밖");
  assert.deepEqual(JSON.parse(packOps([{ tl: [0, 45, 90] }])), [{ tl: [0, 45, 90] }]);
  assert.deepEqual(JSON.parse(packOps([{ pts: "글자", tl: 3 }])), [{ pts: "글자", tl: 3 }]);
  assert.deepEqual(JSON.parse(packOps([{ pts: [] }])), [{ pts: { $p: "" } }]);
});

test("packOps: 배열이 아니거나 비어 있으면 \"[]\", 객체가 아닌 원소는 뺀다", () => {
  assert.equal(packOps(null), "[]");
  assert.equal(packOps(undefined), "[]");
  assert.equal(packOps("x"), "[]");
  assert.equal(packOps([]), "[]");
  assert.equal(packOps([null, 3, { a: 1 }, [1]]), '[{"a":1}]');
  assert.equal(packOps([{ a: 1 }], null), '[{"a":1}]');
});

test("unpackOps: packOps를 되돌린다($p·$t → 숫자 배열)", () => {
  const ops = [
    { kind: "stroke", tool: "pen", color: "#2F62B5", size: 3, opacity: 1, layers: ["a", "b"], pts: [10, 20.5, 0.3, 11.5, 19, 0.31, 250, 0, 1], tl: [0, 0.5, 1] },
    { kind: "shape", shape: "rect", m: [1, 0, 0, 1, 12.5, 0.000001], on: true, note: null },
  ];
  assert.deepEqual(unpackOps(packOps(ops)), ops);
});

test("unpackOps: $i는 opts.image(문자열)로 되살리고, 없으면 속성을 버린다", () => {
  class Canvas { constructor(id) { this.id = id; } }
  const str = packOps([{ kind: "image", img: new Canvas("k1"), list: [new Canvas("k2")], x: 3 }], { image: (v) => v.id });
  assert.deepEqual(unpackOps(str), [{ kind: "image", list: [null], x: 3 }]);
  const seen = [];
  const back = unpackOps(str, { image: (...args) => { seen.push(args); return { loaded: args[0] }; } });
  assert.deepEqual(back, [{ kind: "image", img: { loaded: "k1" }, list: [{ loaded: "k2" }], x: 3 }]);
  assert.deepEqual(seen, [["k1"], ["k2"]], "인자는 문자열 하나");
});

test("unpackOps: 잘못된 JSON이나 배열이 아닌 값이면 []", () => {
  assert.deepEqual(unpackOps("{not json"), []);
  assert.deepEqual(unpackOps(""), []);
  assert.deepEqual(unpackOps(null), []);
  assert.deepEqual(unpackOps(undefined), []);
  assert.deepEqual(unpackOps('{"a":1}'), []);
  assert.deepEqual(unpackOps("[]"), []);
  assert.deepEqual(unpackOps('[1,null,{"a":1}]'), [{ a: 1 }]);
});

/* ---------- 바로잡기 ---------- */

test("fitShape: 점이 8개 미만이거나 너무 짧으면 null", () => {
  assert.equal(fitShape([]), null);
  assert.equal(fitShape(null), null);
  assert.equal(fitShape(stroke(polyXY([[0, 0], [300, 0]], 6, false))), null, "점 7개");
  assert.equal(fitShape(stroke(polyXY([[0, 0], [20, 0]], 12, false))), null, "길이 20px");
  assert.equal(fitShape(stroke(polyXY([[0, 0], [20, 0]], 12, false)), { minLen: 10 }).type, "line");
  assert.equal(fitShape(Array.from({ length: 30 }, (_, i) => (i % 3 === 2 ? 0.5 : 100))), null, "한 점에 머문 획");
});

test("fitShape: 곧은 획은 시작점과 끝점을 잇는 line", () => {
  const s = fitShape(stroke(polyXY([[50, 60], [420, 250]], 40, false)));
  assert.deepEqual(s, { type: "line", x0: 50, y0: 60, x1: 420, y1: 250 });
});

test("fitShape: 손떨림(±3px)이 있는 직선", () => {
  for (const seed of SEEDS) {
    const s = fitShape(stroke(polyXY([[50, 60], [420, 250]], 40, false), seed));
    assert.equal(s && s.type, "line", `seed ${seed}`);
    near(s.x0, 50, 3, "x0"); near(s.y0, 60, 3, "y0"); near(s.x1, 420, 3, "x1"); near(s.y1, 250, 3, "y1");
  }
  for (const seed of SEEDS) assert.equal(fitShape(stroke(polyXY([[300, 40], [300, 380]], 30, false), seed)).type, "line", `세로 seed ${seed}`);
});

test("fitShape: 손떨림이 있는 원 → circle (rx = ry, rot = 0)", () => {
  for (const seed of SEEDS) {
    const s = fitShape(stroke(ellipseXY(300, 280, 100, 100, 0, 72), seed));
    assert.equal(s && s.type, "ellipse", `seed ${seed}`);
    assert.equal(s.circle, true);
    assert.equal(s.rx, s.ry);
    assert.equal(s.rot, 0);
    near(s.cx, 300, 2, "cx"); near(s.cy, 280, 2, "cy"); near(s.rx, 100, 2.5, "r");
  }
});

test("fitShape: 손떨림이 있는 타원 → 중심·반지름·기울기", () => {
  for (const seed of SEEDS) {
    const s = fitShape(stroke(ellipseXY(400, 300, 160, 80, 0.5, 80), seed));
    assert.equal(s && s.type, "ellipse", `seed ${seed}`);
    assert.equal(s.circle, false);
    assert.ok(s.rx >= s.ry);
    near(s.cx, 400, 2.5, "cx"); near(s.cy, 300, 2.5, "cy"); near(s.rx, 160, 4, "rx"); near(s.ry, 80, 4, "ry"); near(s.rot, 0.5, 0.04, "rot");
  }
});

test("fitShape: 세로로 긴 타원은 rx가 긴 반지름, rot이 ±90° 쪽", () => {
  const s = fitShape(stroke(ellipseXY(200, 300, 60, 180, 0, 80)));
  assert.equal(s.type, "ellipse");
  near(s.rx, 180, 0.5); near(s.ry, 60, 0.5);
  near(Math.abs(s.rot), Math.PI / 2, 1e-3);
  assert.ok(s.rot > -Math.PI / 2 - 1e-9 && s.rot <= Math.PI / 2 + 1e-9);
});

test("fitShape: 장단축 비가 1.15 이하면 원으로 본다", () => {
  const a = fitShape(stroke(ellipseXY(300, 300, 110, 100, 0.7, 72)));
  assert.equal(a.circle, true);
  near(a.rx, 105, 0.5); assert.equal(a.rot, 0);
  const b = fitShape(stroke(ellipseXY(300, 300, 125, 100, 0.7, 72)));
  assert.equal(b.circle, false);
  near(b.rot, 0.7, 0.01);
});

test("fitShape: 점이 고르게 찍히지 않은 타원도 반지름을 맞춘다", () => {
  // 한쪽 절반에 점이 세 배 몰린 획
  const xy = [...ellipseXY(400, 300, 150, 70, 0, 90, Math.PI, 0), ...ellipseXY(400, 300, 150, 70, 0, 30, Math.PI, Math.PI)];
  const s = fitShape(stroke(xy));
  assert.equal(s.type, "ellipse");
  near(s.cx, 400, 1); near(s.cy, 300, 1); near(s.rx, 150, 1.5); near(s.ry, 70, 1.5);
});

test("fitShape: 손떨림이 있는 기울어진 사각형 → rect", () => {
  const V = rotPts([[100, 100], [340, 100], [340, 240], [100, 240]], 0.2, 220, 170);
  for (const seed of SEEDS) {
    const s = fitShape(stroke(polyXY(V, 20, true), seed));
    assert.equal(s && s.type, "rect", `seed ${seed}`);
    near(s.cx, 220, 2.5, "cx"); near(s.cy, 170, 2.5, "cy"); near(s.w, 240, 4, "w"); near(s.h, 140, 4, "h"); near(s.rot, 0.2, 0.03, "rot");
  }
});

test("fitShape: 반듯한 사각형은 rot ≈ 0, w가 가로", () => {
  assert.deepEqual(
    Object.fromEntries(Object.entries(fitShape(stroke(polyXY([[100, 100], [340, 100], [340, 240], [100, 240]], 20, true)))).map(([k, v]) => [k, typeof v === "number" ? Math.round(v * 1e6) / 1e6 + 0 : v])),
    { type: "rect", cx: 220, cy: 170, w: 240, h: 140, rot: 0 },
  );
  for (const seed of SEEDS) {
    const s = fitShape(stroke(polyXY([[100, 100], [300, 100], [300, 300], [100, 300]], 16, true), seed));
    assert.equal(s && s.type, "rect", `seed ${seed}`);
    near(s.rot, 0, 0.03, "rot"); near(s.w, 200, 4, "w"); near(s.h, 200, 4, "h");
    assert.ok(s.rot > -Math.PI / 4 - 1e-9 && s.rot <= Math.PI / 4 + 1e-9);
  }
});

test("fitShape: 끝이 조금 덜 닫혔거나 변 가운데에서 시작한 사각형", () => {
  const V = [[100, 100], [340, 100], [340, 240], [100, 240]];
  for (const seed of SEEDS.slice(0, 10)) {
    const open = fitShape(stroke(polyXY(V, 20, true, 0.75), seed));          // 마지막 변을 3/4만 그림
    assert.equal(open && open.type, "rect", `덜 닫힘 seed ${seed}`);
    near(open.w, 240, 5); near(open.h, 140, 5);
    const mid = fitShape(stroke(polyXY([[220, 100], [340, 100], [340, 240], [100, 240], [100, 100], [220, 100]], 12, false), seed));
    assert.equal(mid && mid.type, "rect", `변 가운데 시작 seed ${seed}`);
    near(mid.w, 240, 5); near(mid.h, 140, 5);
  }
});

test("fitShape: 손떨림이 있는 삼각형 → 닫힌 poly, 꼭짓점 셋", () => {
  const V = [[200, 80], [360, 320], [60, 300]];
  for (const seed of SEEDS) {
    const s = fitShape(stroke(polyXY(V, 24, true), seed));
    assert.equal(s && s.type, "poly", `seed ${seed}`);
    assert.equal(s.closed, true);
    assert.equal(s.pts.length, 6);
    assert.ok(vertexErr(s.pts, V) < 6, `seed ${seed}: 꼭짓점 오차 ${vertexErr(s.pts, V)}`);
  }
});

test("fitShape: 오각형·육각형 → 닫힌 poly", () => {
  for (const k of [5, 6]) {
    const V = regular(k, 120, 300, 300, -Math.PI / 2 + 0.1);
    for (const seed of SEEDS) {
      const s = fitShape(stroke(polyXY(V, 18, true), seed));
      assert.equal(s && s.type, "poly", `${k}각형 seed ${seed}`);
      assert.equal(s.closed, true);
      assert.equal(s.pts.length, k * 2, `${k}각형 seed ${seed}`);
      assert.ok(vertexErr(s.pts, V) < 7, `${k}각형 seed ${seed}`);
    }
  }
});

test("fitShape: 사다리꼴·마름모는 rect가 아니라 닫힌 poly", () => {
  const trap = [[160, 100], [300, 100], [380, 260], [80, 260]], dia = [[300, 100], [420, 300], [300, 500], [180, 300]];
  for (const seed of SEEDS) {
    for (const [name, V] of [["사다리꼴", trap], ["마름모", dia]]) {
      const s = fitShape(stroke(polyXY(V, 18, true), seed));
      assert.equal(s && s.type, "poly", `${name} seed ${seed}`);
      assert.equal(s.pts.length, 8, `${name} seed ${seed}`);
      assert.equal(s.closed, true);
    }
  }
});

test("fitShape: 꺾인 열린 선 → 열린 poly", () => {
  const L = [[100, 100], [100, 300], [320, 300]], Z = [[100, 100], [300, 100], [100, 300], [300, 300]];
  for (const seed of SEEDS) {
    const a = fitShape(stroke(polyXY(L, 22, false), seed));
    assert.deepEqual([a && a.type, a.closed, a.pts.length], ["poly", false, 6], `ㄴ seed ${seed}`);
    assert.ok(vertexErr(a.pts, L) < 6, `ㄴ seed ${seed}`);
    const b = fitShape(stroke(polyXY(Z, 22, false), seed));
    assert.deepEqual([b && b.type, b.closed, b.pts.length], ["poly", false, 8], `Z seed ${seed}`);
    assert.ok(vertexErr(b.pts, Z) < 6, `Z seed ${seed}`);
  }
  // 꼭짓점 순서는 그린 순서
  const c = fitShape(stroke(polyXY(L, 22, false)));
  nearArr(c.pts, L.flat(), 1e-6);
});

test("fitShape: 부드러운 곡선(호·나선)은 바꾸지 않는다", () => {
  for (const seed of [null, ...SEEDS]) {
    assert.equal(fitShape(stroke(ellipseXY(300, 300, 120, 120, 0, 50, Math.PI), seed)), null, `반원 seed ${seed}`);
    assert.equal(fitShape(stroke(ellipseXY(300, 300, 160, 160, 0, 40, Math.PI / 2), seed)), null, `1/4원 seed ${seed}`);
    assert.equal(fitShape(stroke(ellipseXY(300, 300, 300, 300, 0, 40, 40 * DEG), seed)), null, `40° 호 seed ${seed}`);
    const sp = [];
    for (let i = 0; i <= 120; i++) { const t = (i / 120) * 4 * Math.PI, r = 20 + 12 * t; sp.push(300 + r * Math.cos(t), 300 + r * Math.sin(t)); }
    assert.equal(fitShape(stroke(sp, seed)), null, `나선 seed ${seed}`);
  }
});

test("fitShape: 아주 얕은 호는 직선으로 본다(현에서 6% 이내)", () => {
  assert.equal(fitShape(stroke(ellipseXY(300, 300, 600, 600, 0, 40, 20 * DEG))).type, "line");
});

test("fitShape: 별처럼 타원도 다각형도 아닌 닫힌 획은 null", () => {
  const star = Array.from({ length: 10 }, (_, i) => { const r = i % 2 ? 50 : 130, a = -Math.PI / 2 + (i * Math.PI) / 5; return [300 + r * Math.cos(a), 300 + r * Math.sin(a)]; });
  for (const seed of [null, ...SEEDS.slice(0, 10)]) assert.equal(fitShape(stroke(polyXY(star, 10, true), seed)), null, `seed ${seed}`);
});

test("fitShape: closeRatio로 닫힌 도형으로 보는 틈의 크기를 바꾼다", () => {
  const c = stroke(ellipseXY(300, 300, 100, 100, 0, 72, 300 * DEG));    // 60°가 비어 있는 원
  assert.equal(fitShape(c), null, "기본값에서는 열린 곡선");
  const s = fitShape(c, { closeRatio: 0.3 });
  assert.equal(s.type, "ellipse");
  assert.equal(s.circle, true);
  near(s.rx, 100, 1.5); near(s.cx, 300, 1.5); near(s.cy, 300, 1.5);
  assert.equal(fitShape(stroke(ellipseXY(300, 300, 100, 100, 0, 72)), { closeRatio: 0 }).type, "ellipse", "끝이 맞닿으면 0이어도 닫힘");
});

test("fitShape: opts.stride로 [x,y,...] 배열도 받는다", () => {
  const xy = polyXY([[100, 100], [300, 100], [300, 300], [100, 300]], 16, true);
  assert.equal(fitShape(xy, { stride: 2 }).type, "rect");
  assert.equal(fitShape(ellipseXY(300, 300, 90, 90, 0, 60), { stride: 2 }).circle, true);
});

test("fitShape: 촘촘히 찍힌 획과 끝에서 펜을 멈추고 있는 동안 쌓인 점들", () => {
  const r = mulberry32(8), pts = stroke(ellipseXY(700, 500, 260, 260, 0, 900), 8, 0.6);
  const ex = pts[pts.length - 3], ey = pts[pts.length - 2];
  for (let i = 0; i < 60; i++) pts.push(ex + r() - 0.5, ey + r() - 0.5, 0.4);
  const s = fitShape(pts);
  assert.equal(s.type, "ellipse");
  assert.equal(s.circle, true);
  near(s.cx, 700, 1.5); near(s.cy, 500, 1.5); near(s.rx, 260, 1.5);
  const sq = stroke(polyXY([[200, 200], [900, 200], [900, 700], [200, 700]], 300, true), 9, 0.6);
  for (let i = 0; i < 60; i++) sq.push(200 + r() - 0.5, 200 + r() - 0.5, 0.4);
  const q = fitShape(sq);
  assert.equal(q.type, "rect");
  near(q.w, 700, 2); near(q.h, 500, 2); near(q.rot, 0, 0.005);
});

test("fitShape: 같은 점이 거듭 찍히거나 숫자가 아닌 값이 섞여도 견딘다", () => {
  const base = stroke(polyXY([[50, 60], [420, 250]], 40, false)), dup = [];
  for (let i = 0; i < base.length; i += 3) dup.push(base[i], base[i + 1], 0.5, base[i], base[i + 1], 0.5);
  dup.push(NaN, 3, 0.5);
  assert.equal(fitShape(dup).type, "line");
});

/* ---------- 채우기·자동 선택 ---------- */

/* 10×8 흰 바탕, 가운데 x=5 세로 검은 벽 */
const WALL = () => image(10, 8, (x) => (x === 5 ? BLACK : WHITE));
/* 이웃 넷으로 번지는 단순한 기준 구현 */
const naiveFlood = (d, w, h, x, y, tol) => {
  const m = new Uint8Array(w * h), s = (y * w + x) * 4, q = [[x, y]];
  const ok = (i) => (!d[s + 3] && !d[i * 4 + 3]) || [0, 1, 2, 3].every((c) => Math.abs(d[i * 4 + c] - d[s + c]) <= tol);
  m[y * w + x] = 255;
  while (q.length) {
    const [cx, cy] = q.pop();
    for (const [nx, ny] of [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || m[ny * w + nx] || !ok(ny * w + nx)) continue;
      m[ny * w + nx] = 255; q.push([nx, ny]);
    }
  }
  return m;
};

test("floodMask: 이어진 같은 색 영역만 고르고 개수와 범위를 준다", () => {
  const r = floodMask(WALL(), 10, 8, 2, 3, 0);
  assert.equal(r.count, 5 * 8);
  assert.deepEqual(r.bbox, [0, 0, 4, 7]);
  assert.ok(r.mask instanceof Uint8Array && r.mask.length === 80);
  assert.equal(r.mask[3 * 10 + 4], 255);
  assert.equal(r.mask[3 * 10 + 5], 0);
  assert.equal(r.mask[3 * 10 + 6], 0);
  const wall = floodMask(WALL(), 10, 8, 5, 0, 0);
  assert.equal(wall.count, 8);
  assert.deepEqual(wall.bbox, [5, 0, 5, 7]);
});

test("floodMask: 시작점은 내림하고, 범위 밖이면 count 0·bbox null", () => {
  assert.equal(floodMask(WALL(), 10, 8, 2.9, 3.9, 0).count, 40);
  assert.equal(floodMask(WALL(), 10, 8, 5.99, 0, 0).count, 8);
  for (const [x, y] of [[-1, 0], [0, -0.5], [10, 0], [0, 8], [NaN, 1], [99, 99]]) {
    const r = floodMask(WALL(), 10, 8, x, y, 255);
    assert.equal(r.count, 0, `${x},${y}`);
    assert.equal(r.bbox, null);
    assert.equal(r.mask.length, 80);
    assert.ok(r.mask.every((v) => v === 0));
  }
});

test("floodMask: 네 채널 차이의 최댓값이 tol 이하면 같은 색", () => {
  const d = image(6, 1, (x) => [[100, 100, 100, 255], [110, 100, 100, 255], [100, 120, 100, 255], [100, 100, 100, 225], [100, 100, 131, 255], [100, 100, 100, 255]][x]);
  assert.equal(floodMask(d, 6, 1, 0, 0, 0).count, 1);
  assert.equal(floodMask(d, 6, 1, 0, 0, 10).count, 2);
  assert.equal(floodMask(d, 6, 1, 0, 0, 20).count, 3);
  assert.equal(floodMask(d, 6, 1, 0, 0, 30).count, 4, "알파 차이도 센다");
  assert.equal(floodMask(d, 6, 1, 0, 0, 31).count, 6);
  assert.equal(floodMask(d, 6, 1, 0, 0, 999).count, 6, "tol은 255로 자른다");
  assert.equal(floodMask(d, 6, 1, 0, 0, NaN).count, 1);
});

test("floodMask: 투명한 픽셀끼리는 RGB가 달라도 같은 색", () => {
  const d = image(5, 1, (x) => [[0, 0, 0, 0], [255, 0, 0, 0], [9, 99, 199, 0], [0, 0, 0, 255], [0, 0, 0, 0]][x]);
  const r = floodMask(d, 5, 1, 0, 0, 0);
  assert.equal(r.count, 3);
  assert.deepEqual(r.bbox, [0, 0, 2, 0]);
  assert.equal(floodMask(d, 5, 1, 3, 0, 0).count, 1, "불투명한 검정은 투명한 검정과 다르다");
  assert.equal(floodMask(d, 5, 1, 0, 0, 0, { contiguous: false }).count, 4);
});

test("floodMask: 대각선으로만 닿은 픽셀은 이어진 것이 아니다", () => {
  const d = image(4, 4, (x, y) => ((x + y) % 2 ? BLACK : WHITE));
  assert.equal(floodMask(d, 4, 4, 0, 0, 0).count, 1);
  assert.equal(floodMask(d, 4, 4, 0, 0, 0, { contiguous: false }).count, 8);
});

test("floodMask: contiguous=false면 떨어진 영역도 모두 고른다", () => {
  const r = floodMask(WALL(), 10, 8, 2, 3, 0, { contiguous: false });
  assert.equal(r.count, 9 * 8);
  assert.deepEqual(r.bbox, [0, 0, 9, 7]);
  assert.equal(r.mask[5], 0);
});

test("floodMask: opts.limit 안에서만 번진다", () => {
  const lim = new Uint8Array(80);
  for (let y = 2; y <= 5; y++) for (let x = 1; x <= 8; x++) lim[y * 10 + x] = 1;
  const r = floodMask(WALL(), 10, 8, 2, 3, 0, { limit: lim });
  assert.equal(r.count, 4 * 4);
  assert.deepEqual(r.bbox, [1, 2, 4, 5]);
  assert.equal(floodMask(WALL(), 10, 8, 0, 0, 0, { limit: lim }).count, 0, "시작점이 limit 밖");
  const g = floodMask(WALL(), 10, 8, 2, 3, 0, { limit: lim, contiguous: false });
  assert.equal(g.count, 4 * 7);
  assert.deepEqual(g.bbox, [1, 2, 8, 5]);
});

test("floodMask: 구불구불한 영역도 단순 구현과 같은 결과", () => {
  const rnd = mulberry32(21), w = 41, h = 33;
  for (let round = 0; round < 12; round++) {
    const d = image(w, h, () => (rnd() < 0.42 ? BLACK : rnd() < 0.1 ? [250, 250, 250, 255] : WHITE));
    const x = Math.floor(rnd() * w), y = Math.floor(rnd() * h), tol = round % 2 ? 8 : 0;
    const r = floodMask(d, w, h, x, y, tol), want = naiveFlood(d, w, h, x, y, tol);
    assert.deepEqual(r.mask, want, `round ${round}`);
    assert.equal(r.count, want.reduce((s, v) => s + (v ? 1 : 0), 0));
    assert.deepEqual(r.bbox, maskBBox(want, w, h));
  }
  // 달팽이 모양 통로
  const sp = image(21, 21, (x, y) => { const k = Math.min(x, y, 20 - x, 20 - y); return k % 2 === 1 && !(y === k + 1 && x === k) ? BLACK : WHITE; });
  assert.deepEqual(floodMask(sp, 21, 21, 0, 0, 0).mask, naiveFlood(sp, 21, 21, 0, 0, 0));
});

test("floodMask: 1500×1000 캔버스도 금방 끝난다", () => {
  const w = 1500, h = 1000, d = new Uint8ClampedArray(w * h * 4).fill(255);
  for (let i = 0; i < 2000; i++) { const t = (i / 2000) * Math.PI * 2, x = Math.round(750 + 400 * Math.cos(t)), y = Math.round(500 + 300 * Math.sin(t)); for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) d.fill(0, ((y + dy) * w + x + dx) * 4, ((y + dy) * w + x + dx) * 4 + 3); }
  let out = null, ms = Infinity;
  for (let i = 0; i < 4; i++) { const t0 = performance.now(); out = floodMask(d, w, h, 5, 5, 16); ms = Math.min(ms, performance.now() - t0); }   // 가장 빠른 회차로 잰다
  const inside = floodMask(d, w, h, 750, 500, 16);
  assert.ok(ms < 300, `${ms.toFixed(0)}ms`);
  assert.deepEqual(out.bbox, [0, 0, w - 1, h - 1]);
  assert.equal(out.mask[500 * w + 750], 0, "타원 안으로 새지 않는다");
  assert.ok(inside.count > 360000 && inside.count < 380000, `${inside.count}`);    // π·400·300 ≈ 377,000
  assert.ok(out.count + inside.count < w * h);
});

test("floodMask: 크기가 0인 그림", () => {
  const r = floodMask(new Uint8ClampedArray(0), 0, 0, 0, 0, 10);
  assert.equal(r.count, 0);
  assert.equal(r.bbox, null);
  assert.equal(r.mask.length, 0);
});

test("dilateMask: 선택을 r px 넓히고 원본은 그대로 둔다", () => {
  const m = new Uint8Array(7 * 5);
  m[2 * 7 + 3] = 255;
  const a = dilateMask(m, 7, 5);
  assert.notEqual(a, m);
  assert.equal(m.reduce((s, v) => s + v, 0), 255);
  assert.deepEqual(maskBBox(a, 7, 5), [2, 1, 4, 3]);
  assert.equal(a.reduce((s, v) => s + (v ? 1 : 0), 0), 9);
  const b = dilateMask(m, 7, 5, 2);
  assert.deepEqual(maskBBox(b, 7, 5), [1, 0, 5, 4]);
  assert.equal(b.reduce((s, v) => s + (v ? 1 : 0), 0), 25);
  assert.deepEqual(dilateMask(m, 7, 5, 0), m);
  assert.deepEqual(dilateMask(new Uint8Array(35), 7, 5, 3), new Uint8Array(35), "빈 선택은 빈 채로");
});

test("dilateMask: 가장자리에서 넘치지 않고, 단순 구현과 같다(값이 섞인 마스크 포함)", () => {
  const rnd = mulberry32(4), w = 23, h = 17;
  for (const r of [1, 2, 3, 5, 30]) {
    const m = new Uint8Array(w * h);
    for (let i = 0; i < m.length; i++) if (rnd() < 0.04) m[i] = rnd() < 0.5 ? 255 : 1 + Math.floor(rnd() * 200);
    m[0] = 255; m[w * h - 1] = 255;
    const want = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = 0;
      for (let yy = Math.max(0, y - r); yy <= Math.min(h - 1, y + r); yy++) for (let xx = Math.max(0, x - r); xx <= Math.min(w - 1, x + r); xx++) v = Math.max(v, m[yy * w + xx]);
      want[y * w + x] = v;
    }
    assert.deepEqual(dilateMask(m, w, h, r), want, `r=${r}`);
  }
});

test("dilateMask: 안티에일리어싱 틈을 메운다", () => {
  // 검은 선 양옆의 회색 픽셀은 tol 밖이라 채우기가 닿지 않는다. 1px 넓히면 덮인다
  const d = image(9, 3, (x) => (x === 4 ? BLACK : x === 3 || x === 5 ? [128, 128, 128, 255] : WHITE));
  const r = floodMask(d, 9, 3, 0, 1, 20);
  assert.deepEqual(r.bbox, [0, 0, 2, 2]);
  assert.deepEqual(maskBBox(dilateMask(r.mask, 9, 3, 1), 9, 3), [0, 0, 3, 2]);
});

test("maskBBox: 포함 범위, 비어 있으면 null", () => {
  const m = new Uint8Array(6 * 4);
  assert.equal(maskBBox(m, 6, 4), null);
  m[1 * 6 + 2] = 1;
  assert.deepEqual(maskBBox(m, 6, 4), [2, 1, 2, 1]);
  m[3 * 6 + 5] = 255; m[0] = 7;
  assert.deepEqual(maskBBox(m, 6, 4), [0, 0, 5, 3]);
  assert.equal(maskBBox(new Uint8Array(0), 0, 0), null);
});

/* ---------- 조정 ---------- */

test("adjustHSL: 색조를 돌린다. 알파는 그대로, 받은 배열을 돌려준다", () => {
  const d = image(3, 1, (x) => [[255, 0, 0, 255], [0, 255, 0, 128], [40, 80, 120, 7]][x]);
  const out = adjustHSL(d, { h: 120 });
  assert.equal(out, d);
  assert.deepEqual(px(d, 3, 0, 0), [0, 255, 0, 255]);
  assert.deepEqual(px(d, 3, 1, 0), [0, 0, 255, 128]);
  assert.deepEqual(px(d, 3, 2, 0), [120, 40, 80, 7]);
  adjustHSL(d, { h: -120 });
  assert.deepEqual(px(d, 3, 0, 0), [255, 0, 0, 255]);
  assert.deepEqual(px(d, 3, 2, 0), [40, 80, 120, 7]);
});

test("adjustHSL: 채도 -100은 흑백, 명도 +100은 흰색, -100은 검정, 무채색은 채도를 올려도 무채색", () => {
  assert.deepEqual(px(adjustHSL(image(1, 1, () => [255, 0, 0, 255]), { s: -100 }), 1, 0, 0), [128, 128, 128, 255]);
  assert.deepEqual(px(adjustHSL(image(1, 1, () => [30, 90, 200, 255]), { l: 100 }), 1, 0, 0), [255, 255, 255, 255]);
  assert.deepEqual(px(adjustHSL(image(1, 1, () => [30, 90, 200, 255]), { l: -100 }), 1, 0, 0), [0, 0, 0, 255]);
  assert.deepEqual(px(adjustHSL(image(1, 1, () => [90, 90, 90, 255]), { s: 100 }), 1, 0, 0), [90, 90, 90, 255]);
  const up = px(adjustHSL(image(1, 1, () => [150, 120, 110, 255]), { s: 50 }), 1, 0, 0), sat = (c) => rgbToHsl(...c)[1];
  assert.ok(sat(up) > sat([150, 120, 110]) * 1.8, "채도가 커진다");
  near(rgbToHsl(...up)[2], rgbToHsl(150, 120, 110)[2], 0.01, "명도는 그대로");
});

test("adjustHSL: 값이 모두 0이거나 인자가 없으면 그대로", () => {
  const d = image(2, 2, (x, y) => [x * 100, y * 100, 50, 200]), keep = d.slice();
  assert.deepEqual(adjustHSL(d, {}), keep);
  assert.deepEqual(adjustHSL(d), keep);
  assert.deepEqual(adjustHSL(d, { h: 0, s: 0, l: 0 }), keep);
  assert.deepEqual(adjustHSL(new Uint8ClampedArray(0), { h: 90 }), new Uint8ClampedArray(0));
});

test("조정: sel은 적용 세기(0은 그대로, 255는 전부, 사이는 섞음), 투명한 픽셀은 건드리지 않는다", () => {
  const mk = () => image(4, 1, (x) => (x === 3 ? [10, 20, 30, 0] : [0, 100, 200, 255]));
  const sel = Uint8Array.from([0, 255, 128, 255]);
  const inv = invertRGB(mk(), sel);
  assert.deepEqual(px(inv, 4, 0, 0), [0, 100, 200, 255]);
  assert.deepEqual(px(inv, 4, 1, 0), [255, 155, 55, 255]);
  assert.deepEqual(px(inv, 4, 2, 0), [128, 128, 127, 255]);       // 원본과 반전의 가운데(128/255)
  assert.deepEqual(px(inv, 4, 3, 0), [10, 20, 30, 0]);
  const hs = adjustHSL(mk(), { l: 100 }, sel);
  assert.deepEqual(px(hs, 4, 0, 0), [0, 100, 200, 255]);
  assert.deepEqual(px(hs, 4, 1, 0), [255, 255, 255, 255]);
  nearArr(px(hs, 4, 2, 0), [128, 178, 228, 255], 1);
  assert.deepEqual(px(hs, 4, 3, 0), [10, 20, 30, 0]);
  const gr = grayscale(mk(), sel), bc = adjustBC(mk(), { b: 100 }, sel), po = posterize(mk(), 2, sel);
  for (const out of [gr, bc, po]) { assert.deepEqual(px(out, 4, 0, 0), [0, 100, 200, 255]); assert.deepEqual(px(out, 4, 3, 0), [10, 20, 30, 0]); }
  assert.deepEqual(px(bc, 4, 1, 0), [255, 255, 255, 255]);
  nearArr(px(bc, 4, 2, 0), [128, 178, 228, 255], 1);
});

test("adjustBC: 밝기는 더하고 대비는 가운데 회색을 축으로 벌린다", () => {
  const row = () => image(3, 1, (x) => [[100, 100, 100, 255], [128, 128, 128, 77], [200, 200, 200, 255]][x]);
  const b = adjustBC(row(), { b: 20 });
  assert.deepEqual([b[0], b[4], b[8]], [151, 179, 251]);
  assert.equal(b[7], 77, "알파는 그대로");
  const dark = adjustBC(row(), { b: -100 });
  assert.deepEqual([dark[0], dark[4], dark[8]], [0, 0, 0]);
  const c = adjustBC(row(), { c: 50 });
  assert.ok(c[0] < 100 && c[8] > 200 && c[4] === 128, `${c[0]}, ${c[4]}, ${c[8]}`);
  const flat = adjustBC(row(), { c: -100 });
  assert.deepEqual([flat[0], flat[4], flat[8]], [128, 128, 128]);
  const hard = adjustBC(row(), { c: 100 });
  assert.deepEqual([hard[0], hard[8]], [0, 255]);
  const d = row();
  assert.equal(adjustBC(d, {}), d);
  assert.deepEqual(adjustBC(row(), { b: 0, c: 0 }), row());
  assert.deepEqual(adjustBC(row(), { b: 500 }), adjustBC(row(), { b: 100 }), "범위로 자른다");
});

test("invertRGB: 두 번 하면 원래대로, 알파는 그대로", () => {
  const d = image(3, 2, (x, y) => [x * 90, y * 200, 33, 100 + x]), keep = d.slice();
  const once = invertRGB(d);
  assert.equal(once, d);
  assert.deepEqual(px(d, 3, 1, 1), [165, 55, 222, 101]);
  assert.deepEqual(invertRGB(d), keep);
});

test("grayscale: 밝기 가중 평균(0.299·0.587·0.114)", () => {
  const d = grayscale(image(4, 1, (x) => [[255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 9], [200, 200, 200, 255]][x]));
  assert.deepEqual(px(d, 4, 0, 0), [76, 76, 76, 255]);
  assert.deepEqual(px(d, 4, 1, 0), [150, 150, 150, 255]);
  assert.deepEqual(px(d, 4, 2, 0), [29, 29, 29, 9]);
  assert.deepEqual(px(d, 4, 3, 0), [200, 200, 200, 255]);
});

test("posterize: 채널을 levels 단계로 줄인다(2..16으로 자름)", () => {
  const ramp = () => image(256, 1, (x) => [x, x, x, 255]);
  for (const n of [2, 4, 16]) {
    const d = posterize(ramp(), n), seen = new Set();
    for (let x = 0; x < 256; x++) seen.add(d[x * 4]);
    assert.equal(seen.size, n, `levels ${n}`);
    assert.ok(seen.has(0) && seen.has(255));
  }
  const two = posterize(ramp(), 2);
  assert.deepEqual([two[127 * 4], two[128 * 4]], [0, 255]);
  assert.deepEqual(posterize(ramp(), 1), posterize(ramp(), 2));
  assert.deepEqual(posterize(ramp(), 99), posterize(ramp(), 16));
  assert.deepEqual(posterize(ramp(), 3.4), posterize(ramp(), 3));
});

test("addNoise: 같은 씨앗이면 같은 결과, 단색 잡음, 알파 0은 그대로", () => {
  const mk = () => image(16, 16, (x, y) => (x < 2 ? CLEAR : [128, 100, 150, y < 8 ? 255 : 60]));
  const a = addNoise(mk(), 16, 16, 50, 9), b = addNoise(mk(), 16, 16, 50, 9), c = addNoise(mk(), 16, 16, 50, 10), src = mk();
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  let changed = 0;
  for (let i = 0; i < a.length; i += 4) {
    assert.equal(a[i + 3], src[i + 3], "알파는 그대로");
    if (!src[i + 3]) { assert.deepEqual([a[i], a[i + 1], a[i + 2]], [0, 0, 0]); continue; }
    const dr = a[i] - src[i], dg = a[i + 1] - src[i + 1], db = a[i + 2] - src[i + 2];
    assert.ok(Math.abs(dr - dg) <= 1 && Math.abs(dr - db) <= 1, "세 채널에 같은 값을 더한다");
    assert.ok(Math.abs(dr) <= 64, `세기 50 → ±64 이내: ${dr}`);
    if (dr) changed++;
  }
  assert.ok(changed > 180, `${changed}`);
});

test("addNoise: 세기 0이면 그대로, sel로 세기를 줄이고, 선택이 달라도 같은 위치의 잡음은 같다", () => {
  const mk = () => image(12, 12, () => [128, 128, 128, 255]);
  assert.deepEqual(addNoise(mk(), 12, 12, 0, 1), mk());
  const full = addNoise(mk(), 12, 12, 80, 5), sel = new Uint8Array(144);
  for (let i = 72; i < 144; i++) sel[i] = 255;
  const half = addNoise(mk(), 12, 12, 80, 5, sel);
  assert.deepEqual(half.subarray(0, 72 * 4), mk().subarray(0, 72 * 4), "선택 밖은 그대로");
  assert.deepEqual(half.subarray(72 * 4), full.subarray(72 * 4), "선택 안은 전체에 건 것과 같다");
  const weak = addNoise(mk(), 12, 12, 80, 5, new Uint8Array(144).fill(64));
  for (let i = 0; i < 144 * 4; i += 4) assert.ok(Math.abs(weak[i] - 128) <= Math.abs(full[i] - 128) / 4 + 1);
});

test("boxBlur: 반지름 0이면 그대로, 고른 색은 흐려도 그대로", () => {
  const mk = () => image(20, 14, (x, y) => [x * 12, y * 18, 77, 255]);
  const d = mk();
  assert.equal(boxBlur(d, 20, 14, 0), d);
  assert.deepEqual(d, mk());
  assert.deepEqual(boxBlur(mk(), 20, 14, -5), mk());
  assert.deepEqual(boxBlur(mk(), 20, 14, NaN), mk());
  const flat = () => image(20, 14, () => [37, 141, 222, 180]);
  assert.deepEqual(boxBlur(flat(), 20, 14, 6), flat());
  assert.deepEqual(boxBlur(flat(), 20, 14, 400), flat(), "반지름은 40으로 자른다");
});

test("boxBlur: 경계를 부드럽게 만들고 좌우 대칭으로 번진다", () => {
  const w = 41, h = 9, d = boxBlur(image(w, h, (x) => (x === 20 ? WHITE : BLACK)), w, h, 3);
  const row = (x) => d[(4 * w + x) * 4];
  assert.ok(row(20) < 255 && row(20) > row(18) && row(18) > row(15) && row(15) > 0, `${row(20)}, ${row(18)}, ${row(15)}`);
  for (let k = 1; k <= 12; k++) assert.equal(row(20 - k), row(20 + k), `대칭 ${k}`);
  assert.equal(row(2), 0);
  let sum = 0;
  for (let x = 0; x < w; x++) sum += row(x);
  near(sum, 255, 6, "밝기의 합은 그대로");
  // 표준편차가 반지름과 비슷하다
  let v = 0;
  for (let x = 0; x < w; x++) v += row(x) * (x - 20) ** 2;
  near(Math.sqrt(v / sum), 3, 0.5, "표준편차");
});

test("boxBlur: 투명한 가장자리가 검게 번지지 않는다(알파를 미리 곱해 흐림)", () => {
  const w = 15, h = 15, d = boxBlur(image(w, h, (x, y) => (x >= 5 && x < 10 && y >= 5 && y < 10 ? [255, 0, 0, 255] : CLEAR)), w, h, 2);
  let soft = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    if (d[i + 3] < 255) soft++;
    assert.ok(d[i] >= 250 && d[i + 1] === 0 && d[i + 2] === 0, `알파 ${d[i + 3]}인 픽셀의 색 ${d[i]},${d[i + 1]},${d[i + 2]}`);
  }
  assert.ok(soft > 40, "알파는 부드럽게 번진다");
  assert.ok(d[(7 * w + 2) * 4 + 3] > 0 && d[(7 * w + 2) * 4 + 3] < d[(7 * w + 5) * 4 + 3]);
});

test("boxBlur: sel이 0인 곳은 그대로, 사이 값은 섞는다", () => {
  const w = 21, h = 5, mk = () => image(w, h, (x) => (x === 10 ? WHITE : BLACK));
  const none = boxBlur(mk(), w, h, 2, new Uint8Array(w * h));
  assert.deepEqual(none, mk());
  const full = boxBlur(mk(), w, h, 2), half = boxBlur(mk(), w, h, 2, new Uint8Array(w * h).fill(128));
  const at = (d, x) => d[(2 * w + x) * 4];
  near(at(half, 10), (255 + at(full, 10)) / 2, 2);
  near(at(half, 9), at(full, 9) / 2, 2);
  const left = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < 10; x++) left[y * w + x] = 255;
  const part = boxBlur(mk(), w, h, 2, left);
  assert.equal(at(part, 10), 255); assert.equal(at(part, 11), 0); assert.equal(at(part, 9), at(full, 9));
});

test("sharpen: 경계의 대비를 키우고 평평한 곳과 알파는 그대로", () => {
  const w = 24, h = 6, mk = () => image(w, h, (x) => (x < 12 ? [100, 100, 100, 255] : [150, 150, 150, 200]));
  const d = sharpen(mk(), w, h, 100), at = (x) => d[(3 * w + x) * 4];
  assert.ok(at(11) < 100 && at(12) > 150, `${at(11)}, ${at(12)}`);
  assert.equal(at(2), 100); assert.equal(at(21), 150);
  for (let i = 3; i < d.length; i += 4) assert.equal(d[i], mk()[i]);
  const soft = sharpen(mk(), w, h, 30);
  assert.ok(100 - soft[(3 * w + 11) * 4] < 100 - at(11), "세기가 작으면 덜 변한다");
  assert.ok(soft[(3 * w + 11) * 4] < 100);
});

test("sharpen: 세기 0이면 그대로, sel이 0이거나 투명한 픽셀은 그대로", () => {
  const w = 24, h = 6, mk = () => image(w, h, (x, y) => (y === 0 ? CLEAR : x < 12 ? [100, 100, 100, 255] : [150, 150, 150, 255]));
  const d = mk();
  assert.equal(sharpen(d, w, h, 0), d);
  assert.deepEqual(d, mk());
  assert.deepEqual(sharpen(mk(), w, h, 100, new Uint8Array(w * h)), mk());
  const out = sharpen(mk(), w, h, 100);
  assert.deepEqual(out.subarray(0, w * 4), mk().subarray(0, w * 4), "투명한 줄");
  assert.notDeepEqual(out, mk());
});

/* ---------- 안내선·대칭 ---------- */

const inBounds = (L, W, H) => L.every(([a, b, c, d]) => [a, c].every((v) => v >= 0 && v <= W) && [b, d].every((v) => v >= 0 && v <= H));
const angleOf = ([a, b, c, d]) => ((Math.atan2(d - b, c - a) / DEG) % 180 + 180) % 180;

test("guideLines grid: 기본 간격은 짧은 변의 1/10, cfg.step으로 바꾼다", () => {
  const L = guideLines("grid", {}, 1000, 500);
  assert.equal(L.length, 19 + 9);
  assert.deepEqual(L[0], [50, 0, 50, 500, 1]);
  assert.deepEqual(L[19], [0, 50, 1000, 50, 1]);
  const M = guideLines("grid", { step: 100 }, 1000, 500);
  assert.equal(M.length, 9 + 4);
  assert.deepEqual(guideLines("grid", null, 1000, 500), L);
  assert.deepEqual(guideLines("grid", undefined, 1000, 500), L);
});

test("guideLines thirds·three: 삼분할, 세 칸은 긴 쪽을 나눈다", () => {
  const t = guideLines("thirds", {}, 900, 600);
  assert.equal(t.length, 4);
  assert.deepEqual(t.map((l) => l.slice(0, 4)), [[300, 0, 300, 600], [0, 200, 900, 200], [600, 0, 600, 600], [0, 400, 900, 400]]);
  assert.deepEqual(guideLines("three", {}, 1500, 1000).map((l) => l.slice(0, 4)), [[500, 0, 500, 1000], [1000, 0, 1000, 1000]]);
  assert.deepEqual(guideLines("three", {}, 1000, 1500).map((l) => l.slice(0, 4)), [[0, 500, 1000, 500], [0, 1000, 1000, 1000]]);
  assert.equal(guideLines("three", {}, 1250, 1250)[0][0], 1250 / 3, "정사각은 세로선");
});

test("guideLines iso: 30°·150°·수직 세 방향, 모두 캔버스 안", () => {
  const W = 800, H = 600, L = guideLines("iso", { step: 100 }, W, H);
  assert.ok(inBounds(L, W, H));
  const by = { 30: 0, 90: 0, 150: 0 };
  for (const l of L) { const a = Math.round(angleOf(l)); assert.ok(a in by, `각도 ${a}`); by[a]++; assert.ok(Math.hypot(l[2] - l[0], l[3] - l[1]) > 0); }
  assert.equal(by[90], Math.ceil(W / (100 * Math.cos(30 * DEG))) - 1);
  assert.ok(by[30] >= 6 && by[30] === by[150], `${by[30]}, ${by[150]}`);
  // 격자점 (step·cos30°, step/2)에서 세 방향이 만난다
  const gx = 100 * Math.cos(30 * DEG), gy = 250;
  for (const a of [30, 90, 150]) assert.ok(L.some((l) => Math.round(angleOf(l)) === a && Math.abs((l[2] - l[0]) * (gy - l[1]) - (l[3] - l[1]) * (gx - l[0])) / Math.hypot(l[2] - l[0], l[3] - l[1]) < 1e-6), `${a}° 선이 격자점을 지난다`);
  assert.ok(guideLines("iso", {}, W, H).length > L.length, "기본 간격은 60px");
});

test("guideLines persp1: 소실점에서 퍼지는 방사선과 수평선", () => {
  const L = guideLines("persp1", { vp: [[400, 200]], rays: 12 }, 1000, 500);
  assert.equal(L.length, 13);
  assert.deepEqual(L[12], [0, 200, 1000, 200, 2]);
  for (const l of L.slice(0, 12)) { nearArr(l.slice(0, 2), [400, 200], 1e-9, "소실점에서 시작"); assert.equal(l[4], 1); }
  assert.ok(inBounds(L, 1000, 500));
  assert.ok(L.slice(0, 12).every((l) => l[2] === 0 || l[2] === 1000 || l[3] === 0 || l[3] === 500), "가장자리까지 뻗는다");
  const def = guideLines("persp1", {}, 1000, 500);
  assert.equal(def.length, 25, "기본 24개 + 수평선");
  nearArr(def[0].slice(0, 2), [500, 250], 1e-9, "기본 소실점은 가운데");
});

test("guideLines persp1: 소실점이 캔버스 밖이어도 선분은 캔버스 안으로 잘린다", () => {
  for (const vp of [[-600, 250], [1500, -300], [500, 2000], [-50, -50]]) {
    const L = guideLines("persp1", { vp: [vp], rays: 10 }, 1000, 500), rays = L.filter((l) => l[4] === 1);
    assert.equal(rays.length, 10, `${vp}: 방사선이 모두 캔버스를 지난다`);
    assert.ok(inBounds(L, 1000, 500), `${vp}`);
    for (const l of rays) {
      const cross = (l[2] - l[0]) * (vp[1] - l[1]) - (l[3] - l[1]) * (vp[0] - l[0]);
      near(cross / Math.hypot(l[2] - l[0], l[3] - l[1]), 0, 1e-6, `${vp}: 소실점을 향한다`);
      assert.ok(Math.hypot(l[2] - l[0], l[3] - l[1]) > 1);
    }
    assert.equal(L.length - rays.length, vp[1] >= 0 && vp[1] <= 500 ? 1 : 0, "수평선은 캔버스 안에 있을 때만");
  }
});

test("guideLines persp2: 두 소실점의 방사선과 둘을 잇는 수평선", () => {
  const L = guideLines("persp2", { vp: [[-200, 200], [1200, 200]], rays: 8 }, 1000, 500);
  assert.equal(L.length, 17);
  assert.deepEqual(L[16], [0, 200, 1000, 200, 2]);
  assert.ok(inBounds(L, 1000, 500));
  const toward = (l, vp) => Math.abs((l[2] - l[0]) * (vp[1] - l[1]) - (l[3] - l[1]) * (vp[0] - l[0])) / Math.hypot(l[2] - l[0], l[3] - l[1]) < 1e-6;
  assert.ok(L.slice(0, 8).every((l) => toward(l, [-200, 200])));
  assert.ok(L.slice(8, 16).every((l) => toward(l, [1200, 200])));
  // 기울어진 수평선
  const T = guideLines("persp2", { vp: [[0, 100], [1000, 400]], rays: 4 }, 1000, 500), hz = T.find((l) => l[4] === 2);
  nearArr(hz.slice(0, 4), [0, 100, 1000, 400], 1e-6);
  assert.ok(guideLines("persp2", {}, 1000, 500).length > 20, "소실점이 없으면 기본 위치");
  assert.ok(guideLines("persp2", { vp: [[100, 100], "x", [NaN, 1]] }, 1000, 500).some((l) => l[4] === 2), "잘못된 점은 무시");
});

test("guideLines sym: 대칭축", () => {
  assert.deepEqual(guideLines("sym", { sym: "v", cx: 300 }, 1000, 500), [[300, 0, 300, 500, 2]]);
  assert.deepEqual(guideLines("sym", { sym: "h", cy: 100 }, 1000, 500), [[0, 100, 1000, 100, 2]]);
  assert.deepEqual(guideLines("sym", { sym: "quad" }, 1000, 500), [[500, 0, 500, 500, 2], [0, 250, 1000, 250, 2]]);
  const r = guideLines("sym", { sym: "radial", n: 5, cx: 400, cy: 300 }, 1000, 500);
  assert.equal(r.length, 5);
  for (const l of r) nearArr(l.slice(0, 2), [400, 300], 1e-9);
  nearArr(r[0], [400, 300, 400, 0, 2], 1e-9, "첫 축은 위쪽");
  assert.equal(guideLines("sym", { sym: "radial" }, 1000, 500).length, 6, "기본 6");
  assert.equal(guideLines("sym", { sym: "radialMirror", n: 4 }, 1000, 500).length, 8);
  assert.deepEqual(guideLines("sym", { sym: "v", cx: -20 }, 1000, 500), [], "축이 캔버스 밖");
  assert.deepEqual(guideLines("sym", {}, 1000, 500), []);
});

test("guideLines: 모르는 종류나 크기 0이면 빈 배열", () => {
  assert.deepEqual(guideLines("none", {}, 1000, 500), []);
  assert.deepEqual(guideLines(undefined, undefined, 1000, 500), []);
  assert.deepEqual(guideLines("grid", {}, 0, 500), []);
  assert.deepEqual(guideLines("persp1", {}, 1000, NaN), []);
});

test("assistSnap grid: 수평·수직 가운데 가까운 쪽으로", () => {
  assert.deepEqual(assistSnap("grid", {}, 100, 100, 180, 120), [180, 100]);
  assert.deepEqual(assistSnap("grid", {}, 100, 100, 110, 30), [100, 30]);
  assert.deepEqual(assistSnap("grid", null, 100, 100, 40, 95), [40, 100]);
});

test("assistSnap iso: 30°·150°·수직", () => {
  const t30 = Math.tan(30 * DEG);
  const a = assistSnap("iso", {}, 100, 100, 200, 150);
  near((a[1] - 100) / (a[0] - 100), t30, 1e-9, "30°");
  const b = assistSnap("iso", {}, 100, 100, 0, 160);
  near((b[1] - 100) / (b[0] - 100), -t30, 1e-9, "150°");
  nearArr(assistSnap("iso", {}, 100, 100, 108, 300), [100, 300], 1e-9);
  // 이미 안내 방향 위에 있으면 그대로
  nearArr(assistSnap("iso", {}, 0, 0, 100 * Math.cos(30 * DEG), 50), [100 * Math.cos(30 * DEG), 50], 1e-9);
  // 수평에 가까운 움직임도 30°나 150° 쪽으로 간다
  const c = assistSnap("iso", {}, 100, 100, 200, 100);
  near(Math.abs((c[1] - 100) / (c[0] - 100)), t30, 1e-9);
});

test("assistSnap persp1: 소실점 방향·수평·수직", () => {
  const cfg = { vp: [[500, 250]] };
  nearArr(assistSnap("persp1", cfg, 100, 50, 310, 148), [307.2, 153.6], 1e-9);        // (2,1) 방향 위로 정사영
  nearArr(assistSnap("persp1", cfg, 100, 50, 300, 60), [300, 50], 1e-9);
  nearArr(assistSnap("persp1", cfg, 100, 50, 95, 400), [100, 400], 1e-9);
  nearArr(assistSnap("persp1", cfg, 100, 50, -100, -52), [-100.8, -50.4], 1e-9, "소실점 반대쪽으로도");
  nearArr(assistSnap("persp1", cfg, 500, 250, 530, 240), [530, 250], 1e-9, "소실점에서 시작하면 수평·수직만");
  nearArr(assistSnap("persp1", {}, 0, 0, 30, 4), [30, 0], 1e-9, "소실점이 없으면 수평·수직만");
});

test("assistSnap persp2: 두 소실점 방향·수직", () => {
  const cfg = { vp: [[-100, 0], [100, 0]] };
  nearArr(assistSnap("persp2", cfg, 0, 50, 40, 30), [40, 30], 1e-9);          // 오른쪽 소실점 방향 그대로
  nearArr(assistSnap("persp2", cfg, 0, 50, -40, 30), [-40, 30], 1e-9);
  nearArr(assistSnap("persp2", cfg, 0, 50, 3, 120), [0, 120], 1e-9);
  const p = assistSnap("persp2", cfg, 0, 50, 60, 45);                          // 수평에 가까워도 수평으로 가지 않는다
  near((p[1] - 50) / p[0], -0.5, 1e-9);
});

test("assistSnap: 그 밖의 안내선이거나 움직임이 없으면 그대로", () => {
  for (const kind of ["thirds", "three", "sym", "none", undefined]) assert.deepEqual(assistSnap(kind, {}, 10, 10, 37, 91), [37, 91]);
  assert.deepEqual(assistSnap("grid", {}, 10, 10, 10, 10), [10, 10]);
  assert.deepEqual(assistSnap("persp1", { vp: [[0, 0]] }, 10, 10, 10, 10), [10, 10]);
});

test("symMatrices v·h·quad: 거울 대칭", () => {
  const I = [1, 0, 0, 1, 0, 0];
  const v = symMatrices("v", 100, 50);
  assert.equal(v.length, 2);
  assert.deepEqual(v[0], I);
  assert.deepEqual(matApply(v[1], 30, 40), [170, 40]);
  const h = symMatrices("h", 100, 50);
  assert.deepEqual(h[0], I);
  assert.deepEqual(matApply(h[1], 30, 40), [30, 60]);
  const q = symMatrices("quad", 100, 50);
  assert.equal(q.length, 4);
  assert.deepEqual(q.map((m) => matApply(m, 30, 40)), [[30, 40], [170, 40], [30, 60], [170, 60]]);
  assert.deepEqual(symMatrices("nope", 1, 2), [I]);
  assert.deepEqual(symMatrices(undefined, 1, 2), [I]);
});

test("symMatrices radial: 중심을 두고 360/n°씩 돈다", () => {
  const m = symMatrices("radial", 50, 50, 4);
  assert.equal(m.length, 4);
  assert.deepEqual(m[0], [1, 0, 0, 1, 0, 0]);
  assert.deepEqual(m.map((k) => matApply(k, 60, 50)), [[60, 50], [50, 60], [40, 50], [50, 40]]);
  assert.deepEqual(m[2], [-1, 0, 0, -1, 100, 100], "-0이나 1e-17 같은 찌꺼기가 없다");
  for (const n of [1, 3, 5, 6, 12]) {
    const R = symMatrices("radial", 320, 240, n);
    assert.equal(R.length, n);
    for (const k of R) nearArr(matApply(k, 320, 240), [320, 240], 1e-6, "중심은 제자리");
    if (n > 1) nearArr(R.slice(1).reduce((acc) => matMul(R[1], acc), R[1]), [1, 0, 0, 1, 0, 0], 1e-6, `${n}번 돌면 제자리`);
    const pts = R.map((k) => matApply(k, 400, 240));
    for (const p of pts) near(Math.hypot(p[0] - 320, p[1] - 240), 80, 1e-6);
  }
  assert.equal(symMatrices("radial", 0, 0).length, 6, "기본 6");
  assert.equal(symMatrices("radial", 0, 0, 0).length, 6);
  assert.equal(symMatrices("radial", 0, 0, 999).length, 64);
});

test("symMatrices radialMirror: 회전 n개 × 거울 = 2n개", () => {
  const n = 5, M = symMatrices("radialMirror", 200, 150, n);
  assert.equal(M.length, 2 * n);
  assert.deepEqual(M[0], [1, 0, 0, 1, 0, 0]);
  assert.deepEqual(M.slice(0, n), symMatrices("radial", 200, 150, n));
  const pts = M.map((k) => matApply(k, 260, 170)), keys = new Set(pts.map((p) => p.map((v) => v.toFixed(3)).join(",")));
  assert.equal(keys.size, 2 * n, "서로 다른 점 2n개");
  for (const p of pts) near(Math.hypot(p[0] - 200, p[1] - 150), Math.hypot(60, 20), 1e-6);
  M.forEach((k, i) => near(k[0] * k[3] - k[1] * k[2], i < n ? 1 : -1, 1e-9, "뒤쪽 n개는 뒤집힌 것"));
  nearArr(matApply(M[n], 260, 170), [140, 170], 1e-9, "첫 거울은 x=cx 축");
});

/* ---------- 검토에서 보탠 시험: 손떨림이 큰 작은 획, 도형이 아닌 획, 꾸리기·채우기·흐림·안내선의 경계 ---------- */

const SEEDS100 = Array.from({ length: 100 }, (_, i) => i + 1);
/* 씨앗마다 다른 각도로 돌린 획을 넣어 결과 종류를 센다. 예: { line: 93, null: 7 } */
const kinds = (xyOf, seeds = SEEDS100, amp = 3) => {
  const t = {};
  for (const seed of seeds) {
    const s = fitShape(stroke(xyOf(mulberry32(seed * 7919)() * Math.PI * 2), seed, amp));
    const k = !s ? "null" : s.type === "ellipse" ? (s.circle ? "circle" : "ellipse") : s.type === "poly" ? `poly${s.pts.length / 2}${s.closed ? "c" : "o"}` : s.type;
    t[k] = (t[k] || 0) + 1;
  }
  return t;
};
const turned = (V, a, cx, cy, per, closed) => polyXY(rotPts(V, a, cx, cy), per, closed);
const sCurve = (a, amp = 50) => rotPts(Array.from({ length: 60 }, (_, i) => [100 + i * 4, 200 + amp * Math.sin((i / 59) * Math.PI * 2)]), a, 220, 200).flat();

test("fitShape: 손떨림(±3px)이 있는 짧은 직선은 꺾은선으로 바뀌지 않는다", () => {
  const t = kinds((a) => turned([[200, 200], [270, 200]], a, 200, 200, 20, false));     // 70px, 점 21개
  assert.deepEqual(Object.keys(t).filter((k) => k !== "line" && k !== "null"), [], JSON.stringify(t));
  assert.ok(t.line >= 85, JSON.stringify(t));
  // 손떨림이 작으면(±1px) 40px짜리도 모두 직선
  assert.deepEqual(kinds((a) => turned([[200, 200], [240, 200]], a, 200, 200, 14, false), SEEDS100, 1), { line: 100 });
});

test("fitShape: 손떨림이 있어도 휜 획은 직선으로 보지 않는다(현에서 10% 벗어난 호)", () => {
  // 반지름 100, 중심각 80°: 현 128.6px, 현에서 가장 먼 곳 23.4px(18%)
  const t = kinds((a) => ellipseXY(300, 300, 100, 100, 0, 30, 80 * DEG, a));
  assert.ok(!t.line && t.null >= 95, JSON.stringify(t));
  // 6%를 조금 넘는 얕은 호(중심각 32°, 7%)도 손떨림을 핑계로 직선이 되지는 않는다
  const shallow = kinds((a) => ellipseXY(300, 300, 400, 400, 0, 40, 32 * DEG, a), SEEDS100, 1);
  assert.ok((shallow.line || 0) <= 10, JSON.stringify(shallow));
});

test("fitShape: S자 곡선은 바꾸지 않는다", () => {
  assert.equal(fitShape(stroke(sCurve(0))), null);
  assert.equal(fitShape(stroke(sCurve(1.1, 25))), null);
  assert.equal(fitShape(stroke(sCurve(Math.PI / 2, 80))), null);
  for (const amp of [1.5, 3]) {
    const t = kinds((a) => sCurve(a), SEEDS100, amp);
    assert.ok(t.null >= 95, `±${amp}: ${JSON.stringify(t)}`);
    assert.deepEqual(Object.keys(t).filter((k) => !/^(null|poly\do)$/.test(k)), [], "직선·닫힌 도형으로는 읽지 않는다");
  }
});

test("fitShape: 갔다가 되돌아온 선은 납작한 타원이 아니라 null", () => {
  const there = polyXY([[100, 100], [300, 180]], 30, false), back = polyXY([[300, 180], [100, 100]], 30, false);
  assert.equal(fitShape(stroke([...there, ...back])), null);
  for (const amp of [0.5, 1, 3]) assert.deepEqual(kinds((a) => rotPts([[100, 100], [300, 180], [100, 100]], a, 200, 140).flatMap((p, i, V) => (i ? polyXY([V[i - 1], p], 30, false) : [])), SEEDS100.slice(0, 40), amp), { null: 40 }, `±${amp}`);
  // 가는 타원(4:1)은 그대로 타원
  assert.deepEqual(kinds((a) => ellipseXY(300, 300, 120, 30, a, 80)), { ellipse: 100 });
});

test("fitShape: 변이 호처럼 휜 닫힌 획(반원에 현을 그은 모양, 물방울)은 다각형으로 읽지 않는다", () => {
  const D = [...ellipseXY(300, 300, 100, 100, 0, 50, Math.PI, 0), ...polyXY([[200, 300], [400, 300]], 25, false)];
  assert.equal(fitShape(stroke(D)), null);
  const drop = [];
  for (let i = 0; i < 80; i++) { const t = (i / 79) * Math.PI * 2; drop.push(300 + 60 * Math.sin(t) * Math.sin(t / 2), 300 - 120 * Math.cos(t)); }
  const s = fitShape(stroke(drop));
  assert.ok(s === null || s.type === "ellipse", JSON.stringify(s));
});

test("fitShape: 작은 도형에 손떨림(±3px)이 얹혀도 대부분 제 도형으로 읽는다", () => {
  const sq = kinds((a) => turned([[100, 100], [160, 100], [160, 160], [100, 160]], a, 130, 130, 12, true));
  assert.ok(sq.rect >= 90, `한 변 60px 정사각형: ${JSON.stringify(sq)}`);
  const tri = kinds((a) => turned(regular(3, 50, 200, 200), a, 200, 200, 15, true));
  assert.ok(tri.poly3c >= 90, `반지름 50px 정삼각형: ${JSON.stringify(tri)}`);
  const ci = kinds((a) => ellipseXY(200, 200, 25, 25, 0, 40, Math.PI * 2, a));
  assert.ok(ci.circle >= 85, `반지름 25px 원: ${JSON.stringify(ci)}`);
  const thin = kinds((a) => turned([[100, 100], [400, 100], [400, 140], [100, 140]], a, 250, 120, 20, true));
  assert.ok(thin.rect >= 90, `300×40 사각형: ${JSON.stringify(thin)}`);
  // 손떨림이 ±1.5px이면 모두 맞는다
  assert.deepEqual(kinds((a) => turned([[100, 100], [160, 100], [160, 160], [100, 160]], a, 130, 130, 12, true), SEEDS100, 1.5), { rect: 100 });
  assert.deepEqual(kinds((a) => ellipseXY(200, 200, 25, 25, 0, 40, Math.PI * 2, a), SEEDS100, 1.5), { circle: 100 });
});

test("fitShape: 기울기와 상관없이 같은 도형으로 읽는다(원·타원·사각형·삼각형·직선·꺾은선)", () => {
  assert.deepEqual(kinds((a) => ellipseXY(200, 200, 60, 60, 0, 60, Math.PI * 2, a)), { circle: 100 });
  assert.deepEqual(kinds((a) => ellipseXY(200, 200, 60, 60, 0, 70, Math.PI * 2.1, a)), { circle: 100 }, "끝이 20° 겹친 원");
  assert.deepEqual(kinds((a) => ellipseXY(200, 200, 90, 45, a, 70)), { ellipse: 100 });
  assert.deepEqual(kinds((a) => turned([[100, 100], [260, 100], [260, 190], [100, 190]], a, 180, 145, 20, true)), { rect: 100 });
  assert.deepEqual(kinds((a) => turned([[100, 220], [260, 220], [170, 90]], a, 180, 170, 22, true)), { poly3c: 100 });
  assert.deepEqual(kinds((a) => turned([[200, 200], [400, 200]], a, 200, 200, 40, false)), { line: 100 });
  assert.deepEqual(kinds((a) => turned([[100, 100], [140, 240], [180, 100]], a, 140, 170, 20, false)), { poly3o: 100 }, "V자");
});

test("fitShape: 제 선을 가로지르는 별과 오목한 다각형, 모서리가 조금 둥근 사각형", () => {
  const star = Array.from({ length: 5 }, (_, i) => [300 + 120 * Math.cos(-Math.PI / 2 + (i * 4 * Math.PI) / 5), 300 + 120 * Math.sin(-Math.PI / 2 + (i * 4 * Math.PI) / 5)]);
  assert.deepEqual(kinds((a) => turned(star, a, 300, 300, 20, true), SEEDS), { poly5c: 25 }, "한붓그리기 별");
  assert.deepEqual(kinds((a) => turned([[100, 200], [300, 120], [240, 200], [300, 280]], a, 200, 200, 16, true), SEEDS), { poly4c: 25 }, "화살촉");
  // 240×140, 모서리 반지름 15px
  const r = 15, arc = (cx, cy, a0) => ellipseXY(cx, cy, r, r, 0, 5, Math.PI / 2, a0), seg = (a, b) => polyXY([a, b], Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 8), false);
  const round = [...seg([115, 100], [325, 100]), ...arc(325, 115, -Math.PI / 2), ...seg([340, 115], [340, 225]), ...arc(325, 225, 0), ...seg([325, 240], [115, 240]), ...arc(115, 225, Math.PI / 2), ...seg([100, 225], [100, 115]), ...arc(115, 115, Math.PI)];
  for (const seed of [null, ...SEEDS]) {
    const s = fitShape(stroke(round, seed, 1.5));
    assert.equal(s && s.type, "rect", `seed ${seed}`);
    near(s.w, 240, 4, "w"); near(s.h, 140, 4, "h"); near(s.cx, 220, 2.5, "cx"); near(s.cy, 170, 2.5, "cy");
  }
});

test("fitShape: 빠르게 그어 점이 듬성듬성한 획", () => {
  assert.deepEqual(kinds((a) => turned([[100, 100], [300, 100], [300, 300], [100, 300]], a, 200, 200, 5, true), SEEDS), { rect: 25 }, "변마다 점 5개");
  assert.deepEqual(kinds((a) => ellipseXY(200, 200, 100, 100, 0, 16, Math.PI * 2, a), SEEDS), { circle: 25 }, "점 17개");
  assert.deepEqual(kinds((a) => turned([[100, 100], [400, 180]], a, 200, 150, 8, false), SEEDS), { line: 25 }, "점 9개");
});

test("packOps: pts·tl이 Float32Array여도 꾸리고, 자기를 다시 가리키는 값은 버린다", () => {
  const out = JSON.parse(packOps([{ pts: new Float32Array([1.5, 2, 0.5, 3, 4, 1]), tl: new Float64Array([0, 0.5, 1]), other: new Float32Array([1, 2]) }]));
  assert.deepEqual(out, [{ pts: { $p: encodePts([1.5, 2, 0.5, 3, 4, 1]) }, tl: { $t: encodeTl([0, 0.5, 1]) } }]);
  assert.deepEqual(unpackOps(JSON.stringify(out)), [{ pts: [1.5, 2, 0.5, 3, 4, 1], tl: [0, 0.5, 1] }]);
  const op = { kind: "x", a: { n: 1 }, list: [1] };
  op.self = op; op.a.up = op; op.list.push(op.list);
  assert.deepEqual(JSON.parse(packOps([op])), [{ kind: "x", a: { n: 1 }, list: [1, null] }]);
  // 같은 객체를 두 군데서 가리키는 것은 순환이 아니다
  const shared = { v: 1 };
  assert.deepEqual(JSON.parse(packOps([{ p: shared, q: shared, r: [shared, shared] }])), [{ p: { v: 1 }, q: { v: 1 }, r: [{ v: 1 }, { v: 1 }] }]);
});

test("encodePts: 큰 좌표·큰 건너뜀이 섞인 긴 획 200개의 왕복 오차", () => {
  const r = mulberry32(11);
  let ex = 0, ep = 0;
  for (let k = 0; k < 200; k++) {
    const pts = [];
    let x = (r() - 0.5) * 8000, y = (r() - 0.5) * 8000;
    for (let i = 0; i < 100; i++) { x += (r() - 0.5) * (k % 5 ? 20 : 4000); y += (r() - 0.5) * 20; pts.push(x, y, r()); }
    const s = encodePts(pts), q = decodePts(s);
    assert.equal(q.length, pts.length);
    assert.match(s, /^[A-Za-z0-9_-]+$/);
    for (let i = 0; i < pts.length; i += 3) { ex = Math.max(ex, Math.abs(q[i] - pts[i]), Math.abs(q[i + 1] - pts[i + 1])); ep = Math.max(ep, Math.abs(q[i + 2] - pts[i + 2])); }
  }
  assert.ok(ex <= 0.25 && ep <= 0.005 + 1e-12, `x,y ${ex} · 필압 ${ep}`);
  assert.deepEqual(decodePts(encodePts([1e9, -1e9, 1, -1e9, 1e9, 0])), [1e9, -1e9, 1, -1e9, 1e9, 0], "32비트를 넘는 차이");
  assert.deepEqual(decodePts(encodePts(new Float32Array([1.5, 2.5, 0.5, 3, 4, 1]))), [1.5, 2.5, 0.5, 3, 4, 1]);
});

test("floodMask: 1500×1000 빈(투명) 캔버스는 100ms 안에, 빗 모양(구간 75만 개)도 스택이 넘치지 않는다", () => {
  const w = 1500, h = 1000, empty = new Uint8ClampedArray(w * h * 4);
  let ms = Infinity, r = null;
  for (let i = 0; i < 5; i++) { const t0 = performance.now(); r = floodMask(empty, w, h, 750, 500, 0); ms = Math.min(ms, performance.now() - t0); }
  assert.equal(r.count, w * h);
  assert.deepEqual(r.bbox, [0, 0, w - 1, h - 1]);
  assert.ok(ms < 100, `${ms.toFixed(0)}ms`);
  // 홀수 열은 벽, 맨 윗줄만 뚫려 있다: 한 칸짜리 세로 통로 750개를 모두 따라 내려가야 한다
  const comb = new Uint8ClampedArray(w * h * 4);
  for (let y = 1; y < h; y++) for (let x = 1; x < w; x += 2) comb[(y * w + x) * 4 + 3] = 255;
  const c = floodMask(comb, w, h, 0, 0, 0);
  assert.equal(c.count, w + (h - 1) * (w / 2));
  assert.deepEqual(c.bbox, [0, 0, w - 1, h - 1]);
  assert.equal(c.mask[(h - 1) * w + 1], 0);
  assert.equal(c.mask[(h - 1) * w + w - 2], 255);
  // 벽에서 시작하면 벽만(세로 줄 하나)
  assert.equal(floodMask(comb, w, h, 1, 500, 0).count, h - 1);
});

test("조정: 설정이 null이어도 그대로 돌려준다", () => {
  const d = image(2, 1, (x) => [10 + x, 20, 30, 255]), before = Array.from(d);
  assert.equal(adjustHSL(d, null), d);
  assert.equal(adjustBC(d, null), d);
  assert.deepEqual(Array.from(d), before);
});

test("boxBlur: 반지름이 커도 투명한 바탕 위의 색은 그대로, 불투명한 그림은 가장자리까지 불투명하다", () => {
  for (const r of [1, 5, 12, 40]) {
    const w = 64, h = 48, d = boxBlur(image(w, h, (x, y) => (x >= 20 && x < 44 && y >= 16 && y < 32 ? [255, 0, 0, 255] : [0, 0, 0, 0])), w, h, r);
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] >= 2) assert.ok(d[i] >= 250 && d[i + 1] <= 3 && d[i + 2] <= 3, `반지름 ${r}: 알파 ${d[i + 3]}인 픽셀의 색 ${d[i]},${d[i + 1]},${d[i + 2]}`);
    assert.ok(d[(24 * w + 10) * 4 + 3] > 0 || r < 5, `반지름 ${r}: 알파가 번진다`);
  }
  const rnd = mulberry32(3), op = boxBlur(image(40, 30, () => [rnd() * 256, rnd() * 256, rnd() * 256, 255]), 40, 30, 6);
  for (let i = 3; i < op.length; i += 4) assert.equal(op[i], 255);
  // 색은 알파만큼의 무게로 섞인다: 불투명한 흰색 옆의 옅은(알파 51) 검정은 흰색 쪽으로 끌려간다
  const e = boxBlur(image(4, 1, (x) => (x < 2 ? [255, 255, 255, 255] : [0, 0, 0, 51])), 4, 1, 1);
  assert.ok(e[4] > 215 && e[8] > 160, `${Array.from(e)}`);
  assert.ok(e[7] < 255 && e[7] > e[11] && e[11] > 51);
});

test("guideLines persp1·persp2: 소실점이 가장자리·모서리·아주 먼 곳에 있어도 캔버스 안의 선분만, 모두 소실점을 향한다", () => {
  const W = 800, H = 600;
  const off = (l, p) => Math.abs((p[0] - l[0]) * (l[3] - l[1]) - (p[1] - l[1]) * (l[2] - l[0])) / Math.hypot(l[2] - l[0], l[3] - l[1]);
  for (const vp of [[0, 0], [800, 300], [400, 600], [-1e-9, 300], [2000, -900], [400, -1e5], [1e7, 300], [-1e6, -1e6]]) {
    const L = guideLines("persp1", { vp: [vp] }, W, H), rays = L.filter((l) => l[4] === 1);
    assert.ok(rays.length >= 6, `${vp}: 방사선 ${rays.length}개`);
    assert.ok(inBounds(L, W, H), `${vp}`);
    for (const l of L) { assert.equal(l.length, 5); assert.ok(l.every(Number.isFinite)); assert.ok(Math.hypot(l[2] - l[0], l[3] - l[1]) > 1, `${vp}: 길이`); }
    for (const l of rays) assert.ok(off(l, vp) < 1e-6 * Math.max(1, Math.hypot(vp[0], vp[1]) / 1000), `${vp}: 소실점을 향한다 (${off(l, vp)})`);
    const far = !(vp[0] >= 0 && vp[0] <= W && vp[1] >= 0 && vp[1] <= H);
    if (far) assert.equal(rays.length, 24, `${vp}: 캔버스 밖이면 방사선을 캔버스가 보이는 각도 안에 모두 편다`);
  }
  for (const vps of [[[100, 200], [700, 320]], [[400, -200], [400, 900]], [[-300, 250], [-300, 250]], [[-5000, -3000], [9000, 250]]]) {
    const L = guideLines("persp2", { vp: vps, rays: 12 }, W, H), hz = L.filter((l) => l[4] === 2);
    assert.ok(inBounds(L, W, H), JSON.stringify(vps));
    assert.equal(L.length - hz.length, 24);
    for (const l of hz) { assert.ok(off(l, vps[0]) < 1e-6 && off(l, vps[1]) < 1e-6, "수평선은 두 소실점을 지난다"); }
    assert.equal(hz.length, vps[0][0] === -5000 ? 0 : 1, "수평선이 캔버스를 지나지 않으면 없다");
  }
});

test("guideLines iso: 세 방향의 선이 격자점에서 만난다", () => {
  const L = guideLines("iso", { step: 100 }, 800, 600), dx = 100 * Math.cos(Math.PI / 6);
  const thru = (p) => L.filter((l) => Math.abs((p[0] - l[0]) * (l[3] - l[1]) - (p[1] - l[1]) * (l[2] - l[0])) / Math.hypot(l[2] - l[0], l[3] - l[1]) < 1e-6).length;
  for (const p of [[dx, 50], [2 * dx, 100], [dx, 150], [3 * dx, 250], [4 * dx, 400]]) assert.equal(thru(p), 3, `${p}`);
  assert.equal(thru([dx, 100]), 1, "격자점 사이에는 수직선만");
});

test("행렬: 임의의 행렬에서 matMul·matInv·matTRS가 풀어 쓴 식과 같다", () => {
  const r = mulberry32(9);
  for (let k = 0; k < 300; k++) {
    const m = Array.from({ length: 6 }, () => r() * 4 - 2), n = Array.from({ length: 6 }, () => r() * 4 - 2), x = r() * 100 - 50, y = r() * 100 - 50;
    nearArr(matApply(matMul(m, n), x, y), matApply(m, ...matApply(n, x, y)), 1e-9, "m∘n");
    const det = m[0] * m[3] - m[1] * m[2], inv = matInv(m);
    if (Math.abs(det) > 0.05) { nearArr(matApply(inv, ...matApply(m, x, y)), [x, y], 1e-8, "역행렬"); near(inv[0] * inv[3] - inv[1] * inv[2], 1 / det, 1e-8 * Math.abs(1 / det) + 1e-9, "행렬식"); }
    const o = { tx: r() * 50 - 25, ty: r() * 50 - 25, rot: r() * 7 - 3.5, sx: r() * 2 + 0.2, sy: -(r() * 2 + 0.2), cx: r() * 100, cy: r() * 100 };
    const ux = (x - o.cx) * o.sx, uy = (y - o.cy) * o.sy;      // 중심 기준 배율 → 회전 → 이동
    nearArr(matApply(matTRS(o), x, y), [o.cx + ux * Math.cos(o.rot) - uy * Math.sin(o.rot) + o.tx, o.cy + ux * Math.sin(o.rot) + uy * Math.cos(o.rot) + o.ty], 1e-9, "matTRS");
  }
  assert.equal(matInv([NaN, 0, 0, 1, 0, 0]), null);
  assert.deepEqual(matInv([2, 0, 0, 4, 6, 8]), [0.5, 0, 0, 0.25, -3, -2]);
});

test("symMatrices: 두 대칭을 이어 해도 다시 그 묶음 안의 대칭이다", () => {
  for (const [kind, n] of [["v", 0], ["h", 0], ["quad", 0], ["radial", 7], ["radial", 2], ["radialMirror", 4], ["radialMirror", 1], ["radialMirror", 9]]) {
    const M = symMatrices(kind, 30, -20, n);
    for (const a of M) {
      nearArr(matApply(a, 30, -20), [30, -20], 1e-9, `${kind}: 중심은 제자리`);
      near(Math.abs(a[0] * a[3] - a[1] * a[2]), 1, 1e-9, `${kind}: 크기를 바꾸지 않는다`);
      assert.ok(!a.some((v) => Object.is(v, -0)), "-0 없음");
      for (const b of M) { const p = matMul(a, b); assert.ok(M.some((m) => m.every((v, i) => Math.abs(v - p[i]) < 1e-6)), `${kind} n=${n}: 곱이 묶음 안에 있다`); }
    }
    const img = new Set(M.map((m) => matApply(m, 47, -9).map((v) => v.toFixed(4)).join()));
    assert.equal(img.size, M.length, `${kind} n=${n}: 서로 다른 상`);
  }
});
