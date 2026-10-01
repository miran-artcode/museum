/* ============================================================
   디지털 에스키스: 화면과 canvas에 기대지 않는 순수 계산

   무엇을 하는가
     · 수·행렬·색: 필압 곡선, 2D 아핀 행렬([a,b,c,d,e,f], canvas setTransform 순서), HEX·HSV·HSL, 색 조화, 휘도
     · 점 목록 꾸리기: 획의 점 [x,y,필압, ...]을 차이 부호화한 짧은 문자열로 바꾸고(encodePts), 작업 목록을
       JSON으로 묶는다(packOps). 되돌리기 내역을 sessionStorage 초안이나 Firestore 문서에 넣을 때 쓴다
     · 바로잡기(fitShape): 손으로 그린 획을 직선·타원·사각형·다각형으로 바꾼다
     · 채우기·자동 선택(floodMask), 선택 넓히기(dilateMask)
     · 조정: 색조·채도·명도, 밝기·대비, 반전, 흑백, 포스터, 잡음, 흐림, 선명하게
     · 안내선(guideLines)·그리기 보조(assistSnap)·대칭 행렬(symMatrices)

   픽셀 함수는 모두 RGBA 바이트 배열(Uint8ClampedArray, 직선 알파)을 받는다. DOM을 쓰지 않으므로 node --test로 검증한다.
   ============================================================ */

/* ---------- 수 ---------- */

export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const num = (v) => { v = +v; return Number.isFinite(v) ? v : 0; };
const TAU = Math.PI * 2;

/* 씨앗이 같으면 같은 수열을 내는 난수(0 이상 1 미만) */
export const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/* 필압 곡선. gamma가 1보다 작으면 약한 필압이 커진다 */
export const pressureCurve = (p, gamma = 1) => Math.pow(clamp(num(p), 0, 1), gamma > 0 ? gamma : 1);

/* ---------- 행렬 ----------
   [a,b,c,d,e,f]: x' = a·x + c·y + e, y' = b·x + d·y + f */

export const matMul = (m, n) => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
export const matInv = (m) => {
  const det = m[0] * m[3] - m[1] * m[2];
  if (!det || !Number.isFinite(det)) return null;
  // + 0: -0을 0으로 (deepEqual 비교에서 -0과 0은 다르다)
  return [m[3] / det + 0, -m[1] / det + 0, -m[2] / det + 0, m[0] / det + 0, (m[2] * m[5] - m[3] * m[4]) / det + 0, (m[1] * m[4] - m[0] * m[5]) / det + 0];
};
export const matApply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
/* (cx,cy)를 중심으로 배율 → 회전한 뒤 tx,ty만큼 옮긴다 */
export const matTRS = ({ tx = 0, ty = 0, rot = 0, sx = 1, sy = 1, cx = 0, cy = 0 } = {}) => {
  const c = Math.cos(rot), s = Math.sin(rot), a = c * sx, b = s * sx, cc = -s * sy, d = c * sy;
  return [a + 0, b + 0, cc + 0, d + 0, cx + tx - (a * cx + cc * cy) + 0, cy + ty - (b * cx + d * cy) + 0];
};

/* ---------- 색 ---------- */

const byte = (v) => clamp(Math.round(num(v)), 0, 255);

export const hexToRgb = (hex) => {
  let s = String(hex == null ? "" : hex).trim().replace(/^#/, "");
  if (/^[0-9a-f]{3}$/i.test(s)) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  if (!/^[0-9a-f]{6}$/i.test(s)) return [0, 0, 0];
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
export const rgbToHex = (r, g, b) => "#" + [r, g, b].map((v) => byte(v).toString(16).padStart(2, "0")).join("").toUpperCase();

const hueOf = (r, g, b, mx, d) => {
  if (!d) return 0;
  const h = 60 * (mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4);
  return h < 0 ? h + 360 : h;
};
const wrapHue = (h) => ((num(h) % 360) + 360) % 360;
/* 색상 h(0..360), 채도 성분 c, 바닥값 m으로 r,g,b(0..1)를 T에 쓴다 */
const T = new Float64Array(3);
const hueRgb = (h, c, m) => {
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1)), k = Math.floor(h / 60) % 6;
  T[0] = m + (k === 0 || k === 5 ? c : k === 1 || k === 4 ? x : 0);
  T[1] = m + (k === 1 || k === 2 ? c : k === 0 || k === 3 ? x : 0);
  T[2] = m + (k === 3 || k === 4 ? c : k === 2 || k === 5 ? x : 0);
};

export const rgbToHsv = (r, g, b) => {
  r = byte(r) / 255; g = byte(g) / 255; b = byte(b) / 255;
  const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  return [hueOf(r, g, b, mx, d), mx ? d / mx : 0, mx];
};
export const hsvToRgb = (h, s, v) => {
  s = clamp(num(s), 0, 1); v = clamp(num(v), 0, 1);
  hueRgb(wrapHue(h), v * s, v - v * s);
  return [byte(T[0] * 255), byte(T[1] * 255), byte(T[2] * 255)];
};
export const rgbToHsl = (r, g, b) => {
  r = byte(r) / 255; g = byte(g) / 255; b = byte(b) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
  return [hueOf(r, g, b, mx, d), d ? Math.min(1, d / (1 - Math.abs(2 * l - 1))) : 0, l];
};
export const hslToRgb = (h, s, l) => {
  s = clamp(num(s), 0, 1); l = clamp(num(l), 0, 1);
  const c = (1 - Math.abs(2 * l - 1)) * s;
  hueRgb(wrapHue(h), c, l - c / 2);
  return [byte(T[0] * 255), byte(T[1] * 255), byte(T[2] * 255)];
};

/* 색 조화(HSV 색상환). 첫 원소는 입력 색 */
const HARMONY = { complement: [180], analogous: [30, -30], triad: [120, 240], split: [150, 210], tetrad: [90, 180, 270] };
export const harmony = (hex, kind) => {
  const [r, g, b] = hexToRgb(hex), [h, s, v] = rgbToHsv(r, g, b);
  return [rgbToHex(r, g, b), ...(HARMONY[kind] || []).map((d) => rgbToHex(...hsvToRgb(h + d, s, v)))];
};

/* sRGB 상대 휘도(WCAG) */
const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
export const luminance = (hex) => { const [r, g, b] = hexToRgb(hex); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };

/* ---------- 점 목록 꾸리기 ----------
   정수 하나를 zigzag(부호를 맨 아래 비트로)로 바꾼 뒤 5비트씩 끊어 쓴다. 뒤에 더 있으면 여섯째 비트를 세운다 */

const ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const AIDX = new Int8Array(128).fill(-1);
for (let i = 0; i < 64; i++) AIDX[ALPHA.charCodeAt(i)] = i;

const vi = (n) => {
  let z = n < 0 ? -2 * n - 1 : 2 * n, s = "";
  do { const d = z % 32; z = (z - d) / 32; s += ALPHA[z ? d + 32 : d]; } while (z);
  return s;
};
const readInts = (str) => {
  const out = [];
  let z = 0, mul = 1;
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i), c = code < 128 ? AIDX[code] : -1;
    if (c < 0) break;
    z += (c & 31) * mul;
    if (c & 32) mul *= 32;
    else { out.push(z % 2 ? -(z + 1) / 2 : z / 2); z = 0; mul = 1; }
  }
  return out;
};

export const encodePts = (pts) => {
  const n = pts ? pts.length - (pts.length % 3) : 0;
  let s = "", px = 0, py = 0, pp = 0;
  for (let i = 0; i < n; i += 3) {
    const x = Math.round(num(pts[i]) * 2), y = Math.round(num(pts[i + 1]) * 2), p = Math.round(clamp(num(pts[i + 2]), 0, 1) * 100);
    s += vi(x - px) + vi(y - py) + vi(p - pp);
    px = x; py = y; pp = p;
  }
  return s;
};
export const decodePts = (str) => {
  const v = readInts(String(str == null ? "" : str)), out = [];
  let x = 0, y = 0, p = 0;
  for (let i = 0; i + 2 < v.length; i += 3) { x += v[i]; y += v[i + 1]; p += v[i + 2]; out.push(x / 2, y / 2, p / 100); }
  return out;
};
/* 0..1 숫자 배열(기울기 등) */
export const encodeTl = (tl) => {
  let s = "", prev = 0;
  for (let i = 0; tl && i < tl.length; i++) { const q = Math.round(clamp(num(tl[i]), 0, 1) * 100); s += vi(q - prev); prev = q; }
  return s;
};
export const decodeTl = (str) => { let q = 0; return readInts(String(str == null ? "" : str)).map((d) => (q += d) / 100); };

const isPlain = (v) => { if (v === null || typeof v !== "object") return false; const p = Object.getPrototypeOf(v); return p === Object.prototype || p === null; };
const isNums = (v) => v.every((x) => typeof x === "number");
/* 획의 점 목록인가: 셋씩 떨어지고 셋째 값(필압)이 모두 0..1. 다각형 꼭짓점 [x,y,...]처럼 둘씩 묶인 배열은 그대로 둔다 */
const isStroke = (v) => { if (v.length % 3 || !isNums(v)) return false; for (let i = 2; i < v.length; i += 3) if (!(v[i] >= 0 && v[i] <= 1)) return false; return true; };
const isUnit = (v) => isNums(v) && v.every((x) => x >= 0 && x <= 1);
/* 소수 자릿수. 행렬은 여섯째, 회전(라디안)·배율은 넷째 자리까지 둔다(둘째 자리로 자르면 큰 그림에서 몇 px 어긋난다) */
const DIGITS = { m: 6, rot: 4, sx: 4, sy: 4 };
const DROP = Symbol("drop");

/* path: 지금 내려가고 있는 객체·배열들. 자기 자신을 다시 가리키는 값(순환 참조)은 버린다 */
const packVal = (v, key, op, image, digits, dg, path) => {
  if (v === null) return null;
  const t = typeof v;
  if (t === "number") return !Number.isFinite(v) ? null : Number.isInteger(v) ? v : +v.toFixed(dg);
  if (t === "string" || t === "boolean") return v;
  // pts·tl이 Float32Array·Float64Array로 와도 숫자 배열로 보고 꾸린다(획의 점을 잃지 않게)
  if ((key === "pts" || key === "tl") && (v instanceof Float32Array || v instanceof Float64Array)) v = Array.from(v);
  if (Array.isArray(v)) {
    if (key === "pts" && isStroke(v)) return { $p: encodePts(v) };
    if (key === "tl" && isUnit(v)) return { $t: encodeTl(v) };
    if (path.has(v)) return DROP;
    path.add(v);
    const a = v.map((x) => { const r = packVal(x, key, op, image, digits, dg, path); return r === DROP ? null : r; });
    path.delete(v);
    return a;
  }
  if (isPlain(v)) {
    if (path.has(v)) return DROP;
    path.add(v);
    const o = {};
    for (const k of Object.keys(v)) {
      if (k[0] === "_") continue;
      const r = packVal(v[k], k, op, image, digits, digits[k] ?? 2, path);
      if (r !== DROP) o[k] = r;
    }
    path.delete(v);
    return o;
  }
  if (t !== "object" && t !== "function") return DROP;       // undefined·symbol·bigint
  if (!image) return DROP;                                    // canvas·Image·함수·typed array 등
  const r = image(v, key, op);
  return r == null ? DROP : { $i: String(r) };
};

export const packOps = (ops, opts = {}) => {
  const o = opts || {}, digits = { ...DIGITS, ...(o.digits || {}) }, image = typeof o.image === "function" ? o.image : null;
  return JSON.stringify((Array.isArray(ops) ? ops : []).filter(isPlain).map((op) => packVal(op, "", op, image, digits, 2, new Set())));
};

const unpackVal = (v, image) => {
  if (Array.isArray(v)) return v.map((x) => { const r = unpackVal(x, image); return r === DROP ? null : r; });
  if (!v || typeof v !== "object") return v;
  const ks = Object.keys(v);
  if (ks.length === 1 && typeof v[ks[0]] === "string") {
    if (ks[0] === "$p") return decodePts(v.$p);
    if (ks[0] === "$t") return decodeTl(v.$t);
    if (ks[0] === "$i") { const r = image ? image(v.$i) : DROP; return r === undefined ? DROP : r; }
  }
  const o = {};
  for (const k of ks) { const r = unpackVal(v[k], image); if (r !== DROP) o[k] = r; }
  return o;
};

export const unpackOps = (str, opts = {}) => {
  let arr;
  try { arr = typeof str === "string" ? JSON.parse(str) : str; } catch (e) { return []; }
  if (!Array.isArray(arr)) return [];
  const image = opts && typeof opts.image === "function" ? opts.image : null;
  return arr.filter((op) => op && typeof op === "object" && !Array.isArray(op)).map((op) => unpackVal(op, image));
};

/* ---------- 바로잡기 (QuickShape) ---------- */

const MIN_TURN = Math.PI / 6;      // 이보다 덜 꺾인 꼭짓점은 모서리로 치지 않는다

/* 점에서 선분까지의 거리 */
const segDist = (px, py, ax, ay, bx, by) => {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
};

/* Douglas-Peucker: a..b 구간에서 남길 점 번호(오름차순, 양 끝 포함) */
const rdp = (X, Y, a, b, tol) => {
  const keep = [a, b], st = [a, b];
  while (st.length) {
    const j = st.pop(), i = st.pop();
    let dm = tol, k = -1;
    for (let q = i + 1; q < j; q++) { const d = segDist(X[q], Y[q], X[i], Y[i], X[j], Y[j]); if (d > dm) { dm = d; k = q; } }
    if (k >= 0) { keep.push(k); st.push(i, k, k, j); }
  }
  return keep.sort((p, q) => p - q);
};

/* 꼭짓점 j에서 꺾인 각(0..π) */
const turnAt = (X, Y, i, j, k) => {
  const d = Math.abs(Math.atan2(Y[k] - Y[j], X[k] - X[j]) - Math.atan2(Y[j] - Y[i], X[j] - X[i]));
  return d > Math.PI ? TAU - d : d;
};

/* 두 직선이 만나는 점(거의 나란하면 null). 직선은 [지나는 점 x, y, 단위 방향 x, y] */
const meet = (p, q) => {
  const c = p[2] * q[3] - p[3] * q[2];
  if (Math.abs(c) < 0.05) return null;
  const t = ((q[0] - p[0]) * q[3] - (q[1] - p[1]) * q[2]) / c;
  return [p[0] + t * p[2], p[1] + t * p[3]];
};
const lineThru = (X, Y, a, b) => { const dx = X[b] - X[a], dy = Y[b] - Y[a], L = Math.hypot(dx, dy) || 1; return [X[a], Y[a], dx / L, dy / L]; };

/* 단순화한 꼭짓점 번호에서 모서리가 아닌 것을 하나씩 걸러 낸다. 닫힌 길이면 n(점 개수)으로 번호가 돈다.
   ① MIN_TURN보다 덜 꺾인 꼭짓점(가장 약한 것부터)
   ② 2·tol보다 짧은 변(펜을 뗄 때 생긴 꼬리 등)의 두 끝 가운데 덜 꺾인 쪽
   ③ 한 모서리를 사이에 두고 잡힌 두 꼭짓점: 양옆 변을 늘려 만나는 점이 둘을 잇는 변에서 1.5·tol 안이면, 그 점에 가장 가까운 점 하나로 합친다
   ④ (열린 획만) 양옆 꼭짓점을 이은 선에서 1.5·tol도 벗어나지 않은 꼭짓점(짧은 변 사이에서 손떨림만으로 30° 넘게 꺾인 것처럼 보이는 점) */
const prune = (X, Y, idx, closed, tol, n) => {
  idx = idx.slice();
  const lo = closed ? 0 : 1, at = (i) => idx[(i + idx.length) % idx.length], turn = (i) => turnAt(X, Y, at(i - 1), at(i), at(i + 1));
  while (idx.length > 2) {
    const k = idx.length, hi = closed ? k : k - 1;
    let m = MIN_TURN, cut = -1;
    for (let i = lo; i < hi; i++) { const t = turn(i); if (t < m) { m = t; cut = i; } }
    if (cut < 0) {
      let short = 2 * tol;
      for (let i = 0; i < (closed ? k : k - 1); i++) {
        const j = (i + 1) % k, d = Math.hypot(X[idx[j]] - X[idx[i]], Y[idx[j]] - Y[idx[i]]);
        if (d >= short) continue;
        const ci = i >= lo && i < hi, cj = j >= lo && j < hi;
        if (ci || cj) { short = d; cut = !cj || (ci && turn(i) <= turn(j)) ? i : j; }
      }
    }
    if (cut >= 0) { idx.splice(cut, 1); continue; }
    let best = 1.5 * tol, pair = -1, px = 0, py = 0;
    for (let i = lo; k >= 4 && i < (closed ? k : k - 2); i++) {
      const b = at(i), c = at(i + 1), P = meet(lineThru(X, Y, at(i - 1), b), lineThru(X, Y, c, at(i + 2)));
      const d = P ? segDist(P[0], P[1], X[b], Y[b], X[c], Y[c]) : Infinity;
      if (d < best) { best = d; pair = i; px = P[0]; py = P[1]; }
    }
    if (pair < 0) {
      if (closed) break;
      let h = 1.5 * tol;
      for (let i = lo; i < hi; i++) { const d = segDist(X[at(i)], Y[at(i)], X[at(i - 1)], Y[at(i - 1)], X[at(i + 1)], Y[at(i + 1)]); if (d < h) { h = d; cut = i; } }
      if (cut < 0) break;
      idx.splice(cut, 1);
      continue;
    }
    const c = at(pair + 1);
    let near = at(pair), nd = Infinity;
    for (let q = near; ; q = closed ? (q + 1) % n : q + 1) {
      const d = Math.hypot(X[q] - px, Y[q] - py);
      if (d < nd) { nd = d; near = q; }
      if (q === c) break;
    }
    idx[pair] = near;
    idx.splice((pair + 1) % k, 1);
  }
  return idx;
};

/* 점 번호 목록 ids(한 변이나 한 구간)가 한쪽으로 휜 정도: 현에서 잰 부호 있는 거리의 가운데 절반 평균 − 바깥 절반 평균.
   양 끝 꼭짓점이 잡음으로 밀린 것(일정한 치우침)에는 반응하지 않고 호처럼 휜 것에만 반응한다.
   손떨림이 없는 호에서는 현에서 가장 먼 거리의 절반쯤이다 */
const bow = (X, Y, ids) => {
  const m = ids.length, i = ids[0], j = ids[m - 1], dx = X[j] - X[i], dy = Y[j] - Y[i], l2 = dx * dx + dy * dy;
  if (!l2 || m < 6) return 0;
  const L = Math.sqrt(l2);
  let sm = 0, nm = 0, so = 0, no = 0;
  for (let q = 1; q < m - 1; q++) {
    const ax = X[ids[q]] - X[i], ay = Y[ids[q]] - Y[i], t = (ax * dx + ay * dy) / l2, d = (ax * dy - ay * dx) / L;
    if (t > 0.25 && t < 0.75) { sm += d; nm++; } else { so += d; no++; }
  }
  return nm && no ? sm / nm - so / no : 0;
};

/* 손떨림의 크기(표준편차, px) 어림: 점마다 양옆 두 점을 이은 선에서 벗어난 거리의 중앙값.
   점마다 따로 떨리는 잡음에서 그 거리의 표준편차는 √1.5·σ, 중앙값은 0.826·σ다.
   촘촘히 찍힌 매끄러운 획에서는 0에 가깝고, 모서리 몇 개는 중앙값에 영향을 주지 않는다 */
const jitter = (X, Y) => {
  const d = [];
  for (let i = 1; i < X.length - 1; i++) {
    const dx = X[i + 1] - X[i - 1], dy = Y[i + 1] - Y[i - 1], L = Math.hypot(dx, dy);
    if (L > 1e-9) d.push(Math.abs((X[i] - X[i - 1]) * dy - (Y[i] - Y[i - 1]) * dx) / L);
  }
  d.sort((a, b) => a - b);
  return d.length ? d[d.length >> 1] / 0.826 : 0;
};

/* 한 변의 점들에 맞춘 직선 [중심 x, y, 방향 x, y]. 양 끝 15%(둥글게 돈 모서리)는 빼고 맞춘다 */
const edgeLine = (X, Y, ids) => {
  const cut = Math.floor(ids.length * 0.15), mid = ids.slice(cut, ids.length - cut);
  if (mid.length >= 3) {
    let mx = 0, my = 0, sxx = 0, syy = 0, sxy = 0;
    for (const i of mid) { mx += X[i]; my += Y[i]; }
    mx /= mid.length; my /= mid.length;
    for (const i of mid) { const dx = X[i] - mx, dy = Y[i] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    if (sxx + syy > 1e-9) { const th = 0.5 * Math.atan2(2 * sxy, sxx - syy); return [mx, my, Math.cos(th), Math.sin(th)]; }
  }
  return lineThru(X, Y, ids[0], ids[ids.length - 1]);
};
const project = (l, x, y) => { const t = (x - l[0]) * l[2] + (y - l[1]) * l[3]; return [l[0] + t * l[2], l[1] + t * l[3]]; };
const range = (i, j) => { const out = []; for (let q = i; q <= j; q++) out.push(q); return out; };

/* 연립방정식(가우스 소거, 부분 피벗). 풀 수 없으면 null */
const solve = (A, b) => {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; }
  }
  return M.map((r, i) => r[n] / r[i]);
};

/* 타원 맞춤: 중심 = 평균, 축 = 주성분, 반지름 = 축 방향 표준편차 × √2.
   이어서 그 축 좌표계(반지름으로 나눈 u,v)에서 원뿔곡선 A·u² + B·uv + C·v² + D·u + E·v = 1을 최소제곱으로 풀어
   중심·반지름·기울기를 다듬는다(점이 고르게 찍히지 않았거나 시작·끝이 겹친 획에서 평균과 표준편차가 치우치는 것을 바로잡는다).
   풀이가 타원이 아니거나 처음 값에서 크게 벗어나면 처음 값을 쓴다. rms는 타원에서 떨어진 거리(px)의 제곱평균제곱근 */
const fitEllipse = (X, Y) => {
  const n = X.length;
  let mx = 0, my = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) { mx += X[i]; my += Y[i]; }
  mx /= n; my /= n;
  for (let i = 0; i < n; i++) { const dx = X[i] - mx, dy = Y[i] - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
  sxx /= n; syy /= n; sxy /= n;
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy), c = Math.cos(th), s = Math.sin(th);
  const hf = Math.hypot((sxx - syy) / 2, sxy), r1 = Math.sqrt(2 * ((sxx + syy) / 2 + hf)), r2 = Math.sqrt(2 * Math.max(0, (sxx + syy) / 2 - hf));
  if (!(r2 > 0.5)) return null;
  let cx = mx, cy = my, rx = r1, ry = r2, rot = th;
  const N = [0, 1, 2, 3, 4].map(() => [0, 0, 0, 0, 0]), R = [0, 0, 0, 0, 0];
  for (let i = 0; i < n; i++) {
    const dx = X[i] - mx, dy = Y[i] - my, u = (dx * c + dy * s) / r1, v = (-dx * s + dy * c) / r2, f = [u * u, u * v, v * v, u, v];
    for (let a = 0; a < 5; a++) { R[a] += f[a]; for (let b = 0; b < 5; b++) N[a][b] += f[a] * f[b]; }
  }
  const q = solve(N, R), det = q ? 4 * q[0] * q[2] - q[1] * q[1] : 0;
  if (q && q[0] > 0 && det > 1e-9) {
    const u0 = (q[1] * q[4] - 2 * q[2] * q[3]) / det, v0 = (q[1] * q[3] - 2 * q[0] * q[4]) / det, k = 1 - (q[3] * u0 + q[4] * v0) / 2;
    const a = q[0] / (r1 * r1), b = q[1] / (r1 * r2), g = q[2] / (r2 * r2), hm = Math.hypot((a - g) / 2, b / 2);
    const nx = Math.sqrt(k / ((a + g) / 2 - hm)), ny = Math.sqrt(k / ((a + g) / 2 + hm)), U0 = u0 * r1, V0 = v0 * r2;
    if (nx > 0.5 * r1 && nx < 2 * r1 && ny > 0.5 * r2 && ny < 2 * r2 && Math.hypot(U0, V0) < 0.5 * r1) {
      rx = nx; ry = ny; rot = th + 0.5 * Math.atan2(b, a - g) + Math.PI / 2;
      cx = mx + U0 * c - V0 * s; cy = my + U0 * s + V0 * c;
    }
  }
  while (rot > Math.PI / 2) rot -= Math.PI;
  while (rot <= -Math.PI / 2) rot += Math.PI;
  const cr = Math.cos(rot), sr = Math.sin(rot);
  let ss = 0;
  for (let i = 0; i < n; i++) {
    const dx = X[i] - cx, dy = Y[i] - cy, u = dx * cr + dy * sr, v = -dx * sr + dy * cr;
    const F = (u * u) / (rx * rx) + (v * v) / (ry * ry) - 1, g = 2 * Math.hypot(u / (rx * rx), v / (ry * ry)), d = g > 1e-9 ? F / g : ry;
    ss += d * d;
  }
  return { cx, cy, rx, ry, rot, rms: Math.sqrt(ss / n) };
};

/* 네 꼭짓점 → 직사각형. 방향은 네 변 방향의 평균(90° 주기, 변 길이로 가중), 변의 위치는 마주 보는 두 꼭짓점의 평균.
   손떨림이 없는 직사각형에서는 최소 넓이로 감싸는 직사각형과 같다. rot은 -45°..45°, w는 그 방향의 길이 */
const rectOf = (V) => {
  let C = 0, S = 0;
  for (let e = 0; e < 4; e++) {
    const a = V[e], b = V[(e + 1) % 4], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), t = 4 * Math.atan2(dy, dx);
    C += L * Math.cos(t); S += L * Math.sin(t);
  }
  const rot = Math.atan2(S, C) / 4, c = Math.cos(rot), s = Math.sin(rot);
  const pu = V.map((v) => v[0] * c + v[1] * s).sort((a, b) => a - b), pv = V.map((v) => -v[0] * s + v[1] * c).sort((a, b) => a - b);
  const u0 = (pu[0] + pu[1]) / 2, u1 = (pu[2] + pu[3]) / 2, v0 = (pv[0] + pv[1]) / 2, v1 = (pv[2] + pv[3]) / 2, um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
  return { type: "rect", cx: um * c - vm * s, cy: um * s + vm * c, w: u1 - u0, h: v1 - v0, rot: rot + 0 };
};

const fitOpen = (X, Y, idx0, tol, D, chord, noise) => {
  const n = X.length;
  let dm = 0;
  for (let i = 1; i < n - 1; i++) dm = Math.max(dm, segDist(X[i], Y[i], X[0], Y[0], X[n - 1], Y[n - 1]));
  // 직선: 현에서 가장 먼 점이 현 길이의 6% 이내. 손떨림이 있으면 가장 먼 점 하나가 떨림만으로도 6%를 넘으므로,
  // 떨림 크기 안에 있고 한쪽으로 휜 정도(bow, 6% 휜 호에서 3%)가 작을 때도 직선으로 본다
  if (dm <= 0.06 * chord || (dm <= Math.min(noise, 0.12 * chord) && Math.abs(bow(X, Y, range(0, n - 1))) <= 0.03 * chord)) return { type: "line", x0: X[0], y0: Y[0], x1: X[n - 1], y1: Y[n - 1] };
  const idx = prune(X, Y, idx0, false, tol, n), k = idx.length;
  if (k < 3 || k > 6) return null;
  const floor = clamp(0.012 * D, 0.4, 1.5), lines = [];
  for (let e = 0; e < k - 1; e++) {
    const i = idx[e], j = idx[e + 1], ids = range(i, j);
    if (Math.abs(bow(X, Y, ids)) > Math.max(floor, 0.02 * Math.hypot(X[j] - X[i], Y[j] - Y[i]))) return null;   // 휜 구간이 있으면 곡선
    lines.push(edgeLine(X, Y, ids));
  }
  const pts = [];
  for (let e = 0; e < k; e++) {
    const i = idx[e];
    let v = e === 0 ? project(lines[0], X[i], Y[i]) : e === k - 1 ? project(lines[k - 2], X[i], Y[i]) : meet(lines[e - 1], lines[e]);
    if (!v || Math.hypot(v[0] - X[i], v[1] - Y[i]) > 3 * tol) v = [X[i], Y[i]];
    pts.push(v[0], v[1]);
  }
  return { type: "poly", pts, closed: false };
};

const fitClosed = (X0, Y0, tol, D) => {
  const n = X0.length;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += X0[i]; my += Y0[i]; }
  mx /= n; my /= n;
  // 중심에서 가장 먼 점 A(다각형이면 꼭짓점)에서 시작하도록 돌려 놓고, A에서 가장 먼 점 B로 둘로 나눠 단순화한다
  let A = 0, B = 1, far = -1;
  for (let i = 0; i < n; i++) { const d = Math.hypot(X0[i] - mx, Y0[i] - my); if (d > far) { far = d; A = i; } }
  const X = new Array(n + 1), Y = new Array(n + 1);
  for (let i = 0; i <= n; i++) { X[i] = X0[(A + i) % n]; Y[i] = Y0[(A + i) % n]; }
  far = -1;
  for (let i = 1; i < n; i++) { const d = Math.hypot(X[i] - X[0], Y[i] - Y[0]); if (d > far) { far = d; B = i; } }
  const idx = prune(X, Y, [...rdp(X, Y, 0, B, tol), ...rdp(X, Y, B, n, tol).slice(1, -1)], true, tol, n), k = idx.length;
  const ell = fitEllipse(X0, Y0);
  let V = null, rms = Infinity;
  let bulge = 0, side = 0;
  if (k >= 3 && k <= 6) {
    const lines = idx.map((p, e) => { const q = idx[(e + 1) % k], ids = [p]; for (let i = p; i !== q;) { i = (i + 1) % n; ids.push(i); } return edgeLine(X, Y, ids); });
    V = idx.map((p, e) => { const v = meet(lines[(e - 1 + k) % k], lines[e]); return v && Math.hypot(v[0] - X[p], v[1] - Y[p]) <= 3 * tol ? v : [X[p], Y[p]]; });
    // 점마다 가장 가까운 변까지의 거리(rms)와, 변의 가운데 절반에서 잰 부호 있는 거리 평균 − 양 끝 쪽 평균(bulge).
    // 변이 호처럼 휘었으면(반원에 현을 그은 모양, 물방울, 다각형으로 잘못 읽힌 원) 모든 변에서 같은 쪽으로 쌓이므로
    // 변마다 따로 재는 것보다 손떨림에 덜 흔들린다
    let ss = 0, sm = 0, nm = 0, so = 0, no = 0;
    for (let i = 0; i < n; i++) {
      let d = Infinity, be = 0;
      for (let e = 0; e < k; e++) { const a = V[e], b = V[(e + 1) % k], q = segDist(X[i], Y[i], a[0], a[1], b[0], b[1]); if (q < d) { d = q; be = e; } }
      ss += d * d;
      const a = V[be], b = V[(be + 1) % k], ex = b[0] - a[0], ey = b[1] - a[1], l2 = ex * ex + ey * ey;
      if (!l2) continue;
      const ax = X[i] - a[0], ay = Y[i] - a[1], t = (ax * ex + ay * ey) / l2, s = (ax * ey - ay * ex) / Math.sqrt(l2);
      if (t > 0.25 && t < 0.75) { sm += s; nm++; } else { so += s; no++; }
    }
    rms = Math.sqrt(ss / n);
    bulge = nm && no ? Math.abs(sm / nm - so / no) : 0;
    for (let e = 0; e < k; e++) side += Math.hypot(V[(e + 1) % k][0] - V[e][0], V[(e + 1) % k][1] - V[e][1]) / k;
  }
  // 다각형과 타원 가운데 점들에 더 가까운 쪽을 고른다. 둘 다 멀면(별·낙서) 바꾸지 않는다.
  // 오각형·육각형은 원과 비슷하므로 타원보다 뚜렷이(1.2배) 가까울 때만 다각형으로 본다
  // 왔다가 되돌아간 선처럼 납작한 획은 타원이 아니다(짧은 반지름이 5px, 긴 반지름의 5%, 어긋남의 세 배는 되어야 한다)
  const polyOk = V && rms <= Math.max(3, 0.025 * D) && bulge <= Math.max(1.2, 0.015 * side), ellOk = ell && ell.rms <= Math.max(3, 0.15 * ell.ry) && ell.ry >= Math.max(5, 0.05 * ell.rx, 3 * ell.rms);
  if (polyOk && !(ellOk && ell.rms < rms * (k >= 5 ? 1.2 : 1))) {
    if (k === 4 && V.every((v, e) => {
      const a = V[(e + 3) % 4], b = V[(e + 1) % 4], ax = a[0] - v[0], ay = a[1] - v[1], bx = b[0] - v[0], by = b[1] - v[1];
      const ang = Math.acos(clamp((ax * bx + ay * by) / (Math.hypot(ax, ay) * Math.hypot(bx, by) || 1), -1, 1));
      return Math.abs(ang - Math.PI / 2) <= Math.PI / 10;
    })) return rectOf(V);
    return { type: "poly", pts: V.flat(), closed: true };
  }
  if (!ellOk) return null;
  if (ell.rx / ell.ry <= 1.15) { const r = (ell.rx + ell.ry) / 2; return { type: "ellipse", cx: ell.cx, cy: ell.cy, rx: r, ry: r, rot: 0, circle: true }; }
  return { type: "ellipse", cx: ell.cx, cy: ell.cy, rx: ell.rx, ry: ell.ry, rot: ell.rot, circle: false };
};

/* 손으로 그린 획 → 도형. pts는 [x,y,필압, ...](opts.stride로 묶음 크기를 바꿀 수 있다).
   opts: minLen(24) 이보다 짧으면 null · closeRatio(0.18) 시작과 끝이 이만큼 가까우면 닫힌 도형 · tol 꼭짓점을 찾는 허용 오차(px).
   tol을 주지 않으면 획 크기의 4%(적어도 4px)이고, 점마다 떨리는 손떨림이 크면 그 크기에 맞춰 키운다.
   어느 도형인지 뚜렷하지 않으면(S자·호 같은 곡선, 갔다가 되돌아온 선, 변이 휜 닫힌 획, 별) null을 돌려줘 그린 대로 둔다 */
export const fitShape = (pts, opts = {}) => {
  const o = opts || {}, stride = o.stride >= 2 ? Math.floor(o.stride) : 3, minLen = o.minLen >= 0 ? o.minLen : 24, closeRatio = o.closeRatio >= 0 ? o.closeRatio : 0.18;
  if (!pts || Math.floor(pts.length / stride) < 8) return null;
  const X = [], Y = [];
  for (let i = 0; i + 1 < pts.length; i += stride) {
    const x = +pts[i], y = +pts[i + 1], m = X.length - 1;
    if (!Number.isFinite(x) || !Number.isFinite(y) || (m >= 0 && x === X[m] && y === Y[m])) continue;
    X.push(x); Y.push(y);
  }
  const n = X.length;
  if (n < 3) return null;
  let len = 0, x0 = X[0], x1 = X[0], y0 = Y[0], y1 = Y[0];
  for (let i = 1; i < n; i++) {
    len += Math.hypot(X[i] - X[i - 1], Y[i] - Y[i - 1]);
    x0 = Math.min(x0, X[i]); x1 = Math.max(x1, X[i]); y0 = Math.min(y0, Y[i]); y1 = Math.max(y1, Y[i]);
  }
  if (len < minLen) return null;
  // 꼭짓점을 찾는 허용 오차. 손떨림이 크면 떨림이 꼭짓점으로 잡히지 않게 그만큼 키운다(획 크기의 8%까지)
  const D = Math.hypot(x1 - x0, y1 - y0), noise = 3.5 * jitter(X, Y), tol = o.tol > 0 ? o.tol : Math.max(4, 0.04 * D, Math.min(noise, 0.08 * D));
  // 손떨림은 점 사이 거리를 부풀리므로, 닫혔는지는 단순화한 길의 길이로 잰다
  const idx = rdp(X, Y, 0, n - 1, tol);
  let sl = 0;
  for (let i = 1; i < idx.length; i++) sl += Math.hypot(X[idx[i]] - X[idx[i - 1]], Y[idx[i]] - Y[idx[i - 1]]);
  const gap = Math.hypot(X[n - 1] - X[0], Y[n - 1] - Y[0]);
  return gap <= closeRatio * sl + 1e-6 ? fitClosed(X, Y, tol, D) : fitOpen(X, Y, idx, tol, D, gap, noise);
};

/* ---------- 채우기·자동 선택 ---------- */

/* (x,y)의 색과 비슷한 픽셀을 고른다. 네 채널 차이의 최댓값이 tol 이하면 같은 색, 투명한 픽셀끼리는 색과 상관없이 같은 색 */
export const floodMask = (data, w, h, x, y, tol, opts = {}) => {
  const o = opts || {}, mask = new Uint8Array(Math.max(0, w * h) || 0), none = { mask, count: 0, bbox: null };
  x = Math.floor(x); y = Math.floor(y);
  if (!(x >= 0 && y >= 0 && x < w && y < h)) return none;
  const lim = o.limit || null, t = clamp(num(tol), 0, 255), s = (y * w + x) * 4;
  if (lim && !lim[y * w + x]) return none;
  const r0 = data[s], g0 = data[s + 1], b0 = data[s + 2], a0 = data[s + 3];
  const ok = (i) => {
    if (lim && !lim[i]) return false;
    const j = i * 4, a = data[j + 3];
    if (!a0 && !a) return true;
    return Math.abs(a - a0) <= t && Math.abs(data[j] - r0) <= t && Math.abs(data[j + 1] - g0) <= t && Math.abs(data[j + 2] - b0) <= t;
  };
  let count = 0, bx0 = w, by0 = h, bx1 = -1, by1 = -1;
  if (o.contiguous === false) {
    for (let yy = 0, i = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++, i++) if (ok(i)) {
      mask[i] = 255; count++;
      if (xx < bx0) bx0 = xx; if (xx > bx1) bx1 = xx; if (yy < by0) by0 = yy; if (yy > by1) by1 = yy;
    }
  } else {
    // 스캔라인: 한 줄에서 좌우로 끝까지 칠한 구간(l, r, y)을 쌓아 두고, 구간마다 위아래 줄에서 이어지는 새 구간을 찾아 칠한다.
    // 칠할 때 바로 표시하므로 픽셀마다 색 비교는 한 번쯤만 한다
    const st = [];
    const span = (i, yy) => {
      const row = yy * w;
      let a = i, b = i;
      mask[row + i] = 255;
      while (a > 0 && !mask[row + a - 1] && ok(row + a - 1)) mask[row + --a] = 255;
      while (b < w - 1 && !mask[row + b + 1] && ok(row + b + 1)) mask[row + ++b] = 255;
      count += b - a + 1;
      if (a < bx0) bx0 = a; if (b > bx1) bx1 = b; if (yy < by0) by0 = yy; if (yy > by1) by1 = yy;
      st.push(a, b, yy);
      return b;
    };
    span(x, y);
    while (st.length) {
      const cy = st.pop(), r = st.pop(), l = st.pop();
      for (let ny = cy - 1; ny <= cy + 1; ny += 2) {
        if (ny < 0 || ny >= h) continue;
        const nrow = ny * w;
        for (let i = l; i <= r; i++) if (!mask[nrow + i] && ok(nrow + i)) i = span(i, ny) + 1;   // 구간 바로 다음 칸은 이미 아닌 것을 안다
      }
    }
  }
  return { mask, count, bbox: count ? [bx0, by0, bx1, by1] : null };
};

/* 한 방향 최댓값 필터(van Herk). 줄마다 양옆에 0을 r칸 덧대고 2r+1칸 묶음의 앞·뒤 누적 최댓값으로 창의 최댓값을 얻는다 */
const maxPass = (src, dst, w, h, r, horiz) => {
  const n = horiz ? w : h, lines = horiz ? h : w, step = horiz ? 1 : w, k = 2 * r + 1, m = n + 2 * r;
  const pad = new Uint8Array(m), g = new Uint8Array(m), hh = new Uint8Array(m);
  for (let l = 0; l < lines; l++) {
    const off = horiz ? l * w : l;
    for (let i = 0; i < n; i++) pad[i + r] = src[off + i * step];
    for (let i = 0; i < m; i++) g[i] = i % k ? Math.max(g[i - 1], pad[i]) : pad[i];
    for (let i = m - 1; i >= 0; i--) hh[i] = i === m - 1 || i % k === k - 1 ? pad[i] : Math.max(hh[i + 1], pad[i]);
    for (let i = 0; i < n; i++) dst[off + i * step] = Math.max(hh[i], g[i + 2 * r]);
  }
};
/* 선택을 r px 넓힌다(가로·세로로 나눠 하는 최댓값 필터, 정사각 모양) */
export const dilateMask = (mask, w, h, r = 1) => {
  const n = Math.max(0, w * h) || 0, out = new Uint8Array(n), rr = Math.max(0, Math.floor(num(r)));
  if (!n) return out;
  if (!rr) { for (let i = 0; i < n; i++) out[i] = mask[i]; return out; }
  const tmp = new Uint8Array(n);
  maxPass(mask, tmp, w, h, rr, true);
  maxPass(tmp, out, w, h, rr, false);
  return out;
};

export const maskBBox = (mask, w, h) => {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) if (mask[i]) {
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return x1 < 0 ? null : [x0, y0, x1, y1];
};

/* ---------- 조정 ----------
   sel(픽셀마다 0..255)은 적용 세기. 완전히 투명한 픽셀은 건드리지 않는다 */

/* 채널 값 → 새 값 표(256칸)를 RGB에 적용 */
const applyLut = (data, lut, sel) => {
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const k = sel ? sel[p] : 255;
    if (!k || !data[i + 3]) continue;
    for (let c = 0; c < 3; c++) { const v = data[i + c]; data[i + c] = k === 255 ? lut[v] : v + ((lut[v] - v) * k) / 255; }
  }
  return data;
};

/* 색조(도)·채도·명도. 채도는 곱으로 바꿔 무채색은 무채색으로 둔다(+100이면 세 배, -100이면 흑백).
   명도는 +100이면 흰색, -100이면 검정 쪽으로 간다 */
export const adjustHSL = (data, cfg, sel) => {
  const { h = 0, s = 0, l = 0 } = cfg || {};
  const dh = num(h), ks = clamp(num(s), -100, 100) / 100, kl = clamp(num(l), -100, 100) / 100;
  if (!dh && !ks && !kl) return data;
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const k = sel ? sel[p] : 255;
    if (!k || !data[i + 3]) continue;
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, L = (mx + mn) / 2;
    const S = clamp((d ? d / (1 - Math.abs(2 * L - 1)) : 0) * (ks > 0 ? 1 + 2 * ks : 1 + ks), 0, 1);
    const L2 = kl > 0 ? L + (1 - L) * kl : L * (1 + kl), c = (1 - Math.abs(2 * L2 - 1)) * S;
    hueRgb(wrapHue(hueOf(r, g, b, mx, d) + dh), c, L2 - c / 2);
    for (let q = 0; q < 3; q++) { const v = data[i + q]; data[i + q] = v + ((T[q] * 255 - v) * k) / 255; }
  }
  return data;
};

/* 밝기·대비. 대비는 가운데 회색(128)을 축으로 벌리고, 밝기는 ±100에서 ±255를 더한다 */
export const adjustBC = (data, cfg, sel) => {
  const { b = 0, c = 0 } = cfg || {};
  const kb = clamp(num(b), -100, 100) * 2.55, cc = clamp(num(c), -100, 100) * 2.55, f = (259 * (cc + 255)) / (255 * (259 - cc));
  if (!kb && !cc) return data;
  const lut = new Float32Array(256);
  for (let v = 0; v < 256; v++) lut[v] = clamp(f * (v - 128) + 128 + kb, 0, 255);
  return applyLut(data, lut, sel);
};

export const invertRGB = (data, sel) => {
  const lut = new Float32Array(256);
  for (let v = 0; v < 256; v++) lut[v] = 255 - v;
  return applyLut(data, lut, sel);
};

export const grayscale = (data, sel) => {
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    const k = sel ? sel[p] : 255;
    if (!k || !data[i + 3]) continue;
    const y = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    for (let c = 0; c < 3; c++) { const v = data[i + c]; data[i + c] = v + ((y - v) * k) / 255; }
  }
  return data;
};

export const posterize = (data, levels, sel) => {
  const n = clamp(Math.round(num(levels)) || 2, 2, 16), lut = new Float32Array(256);
  for (let v = 0; v < 256; v++) lut[v] = Math.round((Math.round((v / 255) * (n - 1)) / (n - 1)) * 255);
  return applyLut(data, lut, sel);
};

/* 단색 잡음. 난수는 픽셀마다 하나씩 쓰므로 선택 범위가 달라도 같은 위치에는 같은 잡음이 온다 */
export const addNoise = (data, w, h, amount, seed, sel) => {
  const amp = (clamp(num(amount), 0, 100) / 100) * 127.5, rnd = mulberry32(num(seed));
  if (!amp) return data;
  for (let i = 0, p = 0; p < w * h; i += 4, p++) {
    const d = (rnd() * 2 - 1) * amp, k = sel ? sel[p] : 255;
    if (!k || !data[i + 3]) continue;
    const e = (d * k) / 255;
    data[i] += e; data[i + 1] += e; data[i + 2] += e;
  }
  return data;
};

/* 상자 흐림 한 번. 가장자리 밖은 끝 픽셀이 이어지는 것으로 본다 */
const boxPass = (src, dst, w, h, r, horiz) => {
  const k = 2 * r + 1;
  if (horiz) {
    for (let y = 0; y < h; y++) {
      const off = y * w, last = off + w - 1;
      let acc = (r + 1) * src[off];
      for (let i = 1; i <= r; i++) acc += src[i < w ? off + i : last];
      for (let x = 0; x < w; x++) {
        dst[off + x] = acc / k;
        const a = x + r + 1, b = x - r;
        acc += src[a < w ? off + a : last] - src[b > 0 ? off + b : off];
      }
    }
    return;
  }
  // 세로: 열마다 누적값을 두고 줄 순서대로 훑는다(메모리를 차례로 읽어서 열을 따라 내려가는 것보다 빠르다)
  const acc = new Float64Array(w), bot = (h - 1) * w;
  for (let x = 0; x < w; x++) acc[x] = (r + 1) * src[x];
  for (let i = 1; i <= r; i++) { const o = i < h ? i * w : bot; for (let x = 0; x < w; x++) acc[x] += src[o + x]; }
  for (let y = 0; y < h; y++) {
    const off = y * w, a = y + r + 1 < h ? (y + r + 1) * w : bot, b = y - r > 0 ? (y - r) * w : 0;
    for (let x = 0; x < w; x++) { dst[off + x] = acc[x] / k; acc[x] += src[a + x] - src[b + x]; }
  }
};
/* 표준편차 sigma인 가우시안에 가까워지는 상자 세 개의 반지름 */
const boxRadii = (sigma) => {
  let wl = Math.floor(Math.sqrt(4 * sigma * sigma + 1));
  if (wl % 2 === 0) wl--;
  const m = Math.round((12 * sigma * sigma - 3 * wl * wl - 12 * wl - 9) / (-4 * wl - 4));
  return [0, 1, 2].map((i) => ((i < m ? wl : wl + 2) - 1) / 2);
};
/* 알파를 미리 곱한 네 평면 [R,G,B,A](0..255)를 흐려서 돌려준다. 흐릴 것이 없으면 null */
const blurPlanes = (data, w, h, sigma) => {
  const radii = boxRadii(sigma).filter((r) => r > 0), n = w * h;
  if (!radii.length || !(n > 0)) return null;
  const tmp = new Float32Array(n), out = [];
  for (let c = 3; c >= 0; c--) {
    const pl = new Float32Array(n);
    for (let p = 0, i = 0; p < n; p++, i += 4) pl[p] = c === 3 ? data[i + 3] : (data[i + c] * data[i + 3]) / 255;
    for (const r of radii) { boxPass(pl, tmp, w, h, r, true); boxPass(tmp, pl, w, h, r, false); }
    out[c] = pl;
  }
  return out;
};

/* 흐림(반지름 = 가우시안 표준편차 px). 알파를 미리 곱해 흐리므로 투명한 가장자리가 검게 번지지 않는다 */
export const boxBlur = (data, w, h, radius, sel) => {
  const P = blurPlanes(data, w, h, clamp(num(radius), 0, 40));
  if (!P) return data;
  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    const k = sel ? sel[p] / 255 : 1;
    if (!k) continue;
    const a0 = data[i + 3], a = a0 + (P[3][p] - a0) * k;
    if (a > 0) for (let c = 0; c < 3; c++) { const pm = (data[i + c] * a0) / 255; data[i + c] = ((pm + (P[c][p] - pm) * k) * 255) / a; }
    data[i + 3] = a;
  }
  return data;
};

/* 선명하게(언샤프 마스크): 흐린 사본과의 차이를 더한다. amount 100이면 차이의 1.5배 */
export const sharpen = (data, w, h, amount, sel) => {
  const amt = (clamp(num(amount), 0, 100) / 100) * 1.5, P = amt ? blurPlanes(data, w, h, 1.5) : null;
  if (!P) return data;
  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    const k = (sel ? sel[p] / 255 : 1) * amt, A = P[3][p];
    if (!k || !data[i + 3] || !(A > 0)) continue;
    for (let c = 0; c < 3; c++) { const v = data[i + c]; data[i + c] = v + (v - (P[c][p] * 255) / A) * k; }
  }
  return data;
};

/* ---------- 안내선·대칭 ---------- */

/* 선분을 [0,W]×[0,H]로 자른다(Liang-Barsky). 사각형 밖이면 null */
const clipSeg = (x0, y0, x1, y1, W, H) => {
  const dx = x1 - x0, dy = y1 - y0, P = [-dx, dx, -dy, dy], Q = [x0, W - x0, y0, H - y0];
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 4; i++) {
    if (!P[i]) { if (Q[i] < 0) return null; continue; }
    const t = Q[i] / P[i];
    if (P[i] < 0) { if (t > t1) return null; if (t > t0) t0 = t; } else { if (t < t0) return null; if (t < t1) t1 = t; }
  }
  if (!(t1 - t0 > 1e-9)) return null;
  return [clamp(x0 + t0 * dx, 0, W), clamp(y0 + t0 * dy, 0, H), clamp(x0 + t1 * dx, 0, W), clamp(y0 + t1 * dy, 0, H)];
};
const isPt = (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]);
const vpsOf = (cfg) => (cfg && Array.isArray(cfg.vp) ? cfg.vp.filter(isPt) : []);
const C30 = Math.cos(Math.PI / 6), T30 = Math.tan(Math.PI / 6);
const symCount = (n) => clamp(Math.round(num(n)) || 6, 1, 64);

/* 화면에 그릴 안내선 [[x0,y0,x1,y1,굵기], ...]. 굵기 1은 보통 선, 2는 수평선·대칭축·세 칸 */
export const guideLines = (kind, cfg, W, H) => {
  const c = cfg || {}, L = [];
  if (!(W > 0 && H > 0)) return L;
  const add = (x0, y0, x1, y1, wt = 1) => { const s = clipSeg(x0, y0, x1, y1, W, H); if (s) L.push([...s, wt]); };
  const ray = (px, py, ang, wt = 1) => {
    const R = Math.hypot(Math.max(Math.abs(px), Math.abs(W - px)), Math.max(Math.abs(py), Math.abs(H - py))) + 1;
    add(px, py, px + Math.cos(ang) * R, py + Math.sin(ang) * R, wt);
  };
  /* 소실점에서 퍼지는 방사선. 소실점이 캔버스 밖이면 캔버스가 보이는 각도 범위 안에 고르게 편다 */
  const fan = (px, py) => {
    const n = clamp(Math.round(num(c.rays)) || 24, 2, 360);
    if (px >= 0 && px <= W && py >= 0 && py <= H) { for (let k = 0; k < n; k++) ray(px, py, (k * TAU) / n); return; }
    const mid = Math.atan2(H / 2 - py, W / 2 - px);
    let lo = 0, hi = 0;
    for (const [qx, qy] of [[0, 0], [W, 0], [W, H], [0, H]]) {
      const d = Math.atan2(qy - py, qx - px) - mid, e = Math.atan2(Math.sin(d), Math.cos(d));
      lo = Math.min(lo, e); hi = Math.max(hi, e);
    }
    for (let k = 0; k < n; k++) ray(px, py, mid + lo + ((hi - lo) * (k + 0.5)) / n);
  };
  const step = Math.max(4, c.step > 0 ? c.step : Math.min(W, H) / 10);
  if (kind === "grid") {
    for (let i = 1; i * step < W; i++) add(i * step, 0, i * step, H);
    for (let i = 1; i * step < H; i++) add(0, i * step, W, i * step);
  } else if (kind === "thirds") {
    for (const i of [1, 2]) { add((W * i) / 3, 0, (W * i) / 3, H, 1.2); add(0, (H * i) / 3, W, (H * i) / 3, 1.2); }
  } else if (kind === "three") {
    for (const i of [1, 2]) W >= H ? add((W * i) / 3, 0, (W * i) / 3, H, 2) : add(0, (H * i) / 3, W, (H * i) / 3, 2);
  } else if (kind === "iso") {
    // 한 변이 step인 정삼각 격자: 수직선 간격 step·cos30°, 30°·150° 선은 세로로 step 간격
    const dx = step * C30, rise = T30 * W;
    for (let i = 1; i * dx < W; i++) add(i * dx, 0, i * dx, H);
    for (let j = Math.floor(-rise / step) + 1; j * step < H; j++) add(0, j * step, W, j * step + rise);
    for (let j = 1; j * step < H + rise; j++) add(0, j * step, W, j * step - rise);
  } else if (kind === "persp1") {
    const v = vpsOf(c)[0] || [W / 2, H / 2];
    fan(v[0], v[1]);
    add(0, v[1], W, v[1], 2);
  } else if (kind === "persp2") {
    const vs = vpsOf(c), a = vs[0] || [-W / 4, H * 0.4], b = vs[1] || [W * 1.25, a[1]];
    fan(a[0], a[1]); fan(b[0], b[1]);
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy), ux = l > 1e-9 ? dx / l : 1, uy = l > 1e-9 ? dy / l : 0;
    const R = Math.hypot(a[0] - W / 2, a[1] - H / 2) + Math.hypot(W, H);
    add(a[0] - ux * R, a[1] - uy * R, a[0] + ux * R, a[1] + uy * R, 2);
  } else if (kind === "sym") {
    const cx = Number.isFinite(c.cx) ? c.cx : W / 2, cy = Number.isFinite(c.cy) ? c.cy : H / 2, n = symCount(c.n);
    if (c.sym === "v" || c.sym === "quad") add(cx, 0, cx, H, 2);
    if (c.sym === "h" || c.sym === "quad") add(0, cy, W, cy, 2);
    if (c.sym === "radial") for (let k = 0; k < n; k++) ray(cx, cy, (k * TAU) / n - Math.PI / 2, 2);
    if (c.sym === "radialMirror") for (let k = 0; k < 2 * n; k++) ray(cx, cy, (k * Math.PI) / n - Math.PI / 2, k % 2 ? 1 : 2);
  }
  return L;
};

/* 그리기 보조: 시작점에서 지금 점으로 가는 방향과 가장 가까운 안내 방향 위로 지금 점을 옮긴다 */
export const assistSnap = (kind, cfg, x0, y0, x, y) => {
  const vx = x - x0, vy = y - y0, dirs = [], vs = vpsOf(cfg);
  const toVp = (p) => { if (!p) return; const dx = p[0] - x0, dy = p[1] - y0, l = Math.hypot(dx, dy); if (l > 1e-6) dirs.push([dx / l, dy / l]); };
  if (kind === "grid") dirs.push([1, 0], [0, 1]);
  else if (kind === "iso") dirs.push([C30, 0.5], [-C30, 0.5], [0, 1]);
  else if (kind === "persp1") { toVp(vs[0]); dirs.push([1, 0], [0, 1]); }
  else if (kind === "persp2") { toVp(vs[0]); toVp(vs[1]); dirs.push([0, 1]); }
  else return [x, y];
  if (!(Math.hypot(vx, vy) > 0)) return [x, y];
  let best = dirs[0], bt = 0, bd = -1;
  for (const d of dirs) { const t = vx * d[0] + vy * d[1]; if (Math.abs(t) > bd) { bd = Math.abs(t); bt = t; best = d; } }
  return [x0 + best[0] * bt, y0 + best[1] * bt];
};

const tidy = (m) => m.map((v) => Math.round(v * 1e12) / 1e12 + 0);

/* 대칭 그리기에 쓸 행렬들. 첫 원소는 항등 */
export const symMatrices = (kind, cx, cy, n = 6) => {
  const I = [1, 0, 0, 1, 0, 0], MV = [-1, 0, 0, 1, 2 * cx, 0], MH = [1, 0, 0, -1, 0, 2 * cy];
  if (kind === "v") return [I, MV];
  if (kind === "h") return [I, MH];
  if (kind === "quad") return [I, MV, MH, [-1, 0, 0, -1, 2 * cx, 2 * cy]];
  if (kind === "radial" || kind === "radialMirror") {
    const k = symCount(n), rots = [];
    for (let i = 0; i < k; i++) rots.push(i ? tidy(matTRS({ rot: (i * TAU) / k, cx, cy })) : I);
    return kind === "radial" ? rots : [...rots, ...rots.map((r) => tidy(matMul(r, MV)))];
  }
  return [I];
};
