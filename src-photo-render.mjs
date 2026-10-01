/* ============================================================
   이미지 다듬기: 합성기 (spec §5.4 src-photo-render.mjs, §5.6, §4.12, §4.13, §7.1)
   담당 C. 기준 공간(작업 영역 wa)에서 아래→위로 합성하고, 기하(자르기·수평·회전)를 거쳐 출력 공간(O)으로 옮긴다.
   · 픽셀 레이어: 마스크(destination-in) 뒤 globalCompositeOperation(BLENDS)으로 쌓는다.
   · 조정·효과 레이어: 아래 합성 결과를 읽어 px 커널을 적용하고 마스크·불투명도로 섞는다(mixAdjusted). ctx.filter는 쓰지 않는다.
   · 표식과 글자(txt, ov)는 출력 공간 레이어라 합성에 들어가지 않는다. 내보내기와 스냅샷에서만 벡터로 그린다.
   · 캐시: below(i) 상태를 원본 해상도 2개, 미리 보기 해상도 2개까지 보관(LRU). gfx.reclaim이 freeCaches를 부른다.
   ============================================================ */
import { TILE } from "./src-photo-doc.mjs";
import {
  histogram as pxHistogram, stats as pxStats, adjLuts, adjFn, applyLuts, bake3D, apply3D, lutCompose, mixAdjusted,
  gaussRGBA, unsharp, addNoise, vignette, shadowsHighlights, maskCoverage, maskClusters, maskBBox, discOverlap,
} from "./src-photo-px.mjs";
import { FONT, drawMark, drawText, ensureFont } from "./src-photo-marks.mjs";
import { BLENDS, FLT, KINDS, TCODE } from "./src-folio-schema.mjs";

const PIXEL = new Set(["px", "tr", "db"]);
const BASE_KINDS = new Set(["ai", "px", "tr", "db", "adj", "flt"]);
const now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());
const yieldTask = () => new Promise((r) => setTimeout(r, 0));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const BAND = 64;
const PREVIEW_MAX = 512;   // long side of a slider preview (px)
const PREVIEW_CUBE = 13;   // 3D LUT points per axis while dragging (tetrahedral interpolation)
/** adjustments that are the identity when their parameters are empty (bw and pf are not: their defaults change the image) */
const IDENT_EMPTY = new Set(["bc", "lv", "cv", "ex", "hs", "vb", "cb", "gp"]);
/** tetrahedral lookup of a bake3D cube (layout ((b·n + g)·n + r)·3), in place over the first rows·w pixels of d */
function tetra3D(d, lut, n) {
  const s = (n - 1) / 255, SG = n * 3, SB = n * n * 3, n2 = n - 2;
  for (let i = 0; i < d.length; i += 4) {
    const fr = d[i] * s, fg = d[i + 1] * s, fb = d[i + 2] * s;
    let r0 = fr | 0, g0 = fg | 0, b0 = fb | 0;
    if (r0 > n2) r0 = n2; if (g0 > n2) g0 = n2; if (b0 > n2) b0 = n2;
    const dr = fr - r0, dg = fg - g0, db = fb - b0, p = b0 * SB + g0 * SG + r0 * 3;
    let a, b, wa, wb, wc;
    if (dr >= dg) {
      if (dg >= db) { a = 3; b = 3 + SG; wa = dr - dg; wb = dg - db; wc = db; }
      else if (dr >= db) { a = 3; b = 3 + SB; wa = dr - db; wb = db - dg; wc = dg; }
      else { a = SB; b = 3 + SB; wa = db - dr; wb = dr - dg; wc = dg; }
    } else if (db > dg) { a = SB; b = SG + SB; wa = db - dg; wb = dg - dr; wc = dr; }
    else if (db > dr) { a = SG; b = SG + SB; wa = dg - db; wb = db - dr; wc = dr; }
    else { a = SG; b = 3 + SG; wa = dg - dr; wb = dr - db; wc = db; }
    const w0 = 1 - wa - wb - wc, q = p + 3 + SG + SB;
    d[i] = lut[p] * w0 + lut[p + a] * wa + lut[p + b] * wb + lut[q] * wc;
    d[i + 1] = lut[p + 1] * w0 + lut[p + a + 1] * wa + lut[p + b + 1] * wb + lut[q + 1] * wc;
    d[i + 2] = lut[p + 2] * w0 + lut[p + a + 2] * wa + lut[p + b + 2] * wb + lut[q + 2] * wc;
  }
}
const HIST_MAX = 256;      // long side of the histogram sample (px)
/** exact per-pixel adjustment with one evaluation per distinct colour (open-addressing table of 2^18 slots) → (d) => void, in place */
function colourMemo(fn) {
  const SIZE = 1 << 18, MASK = SIZE - 1, keys = new Int32Array(SIZE).fill(-1), vals = new Uint8ClampedArray(SIZE * 3);
  return (d) => {
    for (let i = 0; i < d.length; i += 4) {
      const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      let h = Math.imul(key, 0x9e3779b1) >>> 14 & MASK, hit = -1;
      for (let probe = 0; probe < 8; probe++, h = (h + 1) & MASK) {
        const kk = keys[h];
        if (kk === key) { hit = h; break; }
        if (kk === -1) { const o = fn(d[i], d[i + 1], d[i + 2]); keys[h] = key; vals[h * 3] = o[0]; vals[h * 3 + 1] = o[1]; vals[h * 3 + 2] = o[2]; hit = h; break; }
      }
      if (hit < 0) { const o = fn(d[i], d[i + 1], d[i + 2]); d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2]; continue; }
      d[i] = vals[hit * 3]; d[i + 1] = vals[hit * 3 + 1]; d[i + 2] = vals[hit * 3 + 2];
    }
  };
}
const COV_THR = 8;

export class Renderer {
  /** @param {PhotoDoc} doc @param {Gfx} gfx @param {{proxyMax:number}} o */
  constructor(doc, gfx, o = {}) {
    this.doc = doc; this.gfx = gfx;
    this.proxyMax = o.proxyMax || 1280;
    this.view = { hide: new Set() };
    this._cache = [];                 // {k, idx, sigs, key, surf, at}: the state below layer idx at scale k
    this._maskCache = new Map();      // layerId → {key, m, w, h} (scaled masks), and alpha surfaces
    this._cube = new Map();           // param key → 3D LUT
    this._probe = false;
    this._paintFrom = Infinity;       // lowest layer index painted since the last full render (invalidate(rect, i) during strokes)
    this._hist = new Map();           // histogram per layer state (≤ 4 entries)
    this._pool = [];                  // spare accumulator surfaces (reused per size)
    this._rs = [null, null];          // two grown scratch surfaces for paint renders (start state, accumulator)
    this._warm = setTimeout(() => this._warmUp(), 0);   // compile the hot pixel loops before the first slider drag
    if (this._warm && this._warm.unref) this._warm.unref();
    this.skipped = false;             // the last rect render skipped wide spatial filters (미리 보기)
    void TILE; void FONT;
    this._pins = new Map();           // surface → count: surfaces a render is reading or writing right now (never reclaimed, R2-02)
    this._dispBytes = 0;              // the display canvas bitmap counted in gfx (R2-17)
    this._disposed = false;
    this._reclaimFn = () => this.freeCaches();
    gfx.reclaim = this._reclaimFn;
  }
  _pin(s2) { if (s2) this._pins.set(s2, (this._pins.get(s2) || 0) + 1); return s2; }
  _unpin(s2) { if (!s2) return; const n = (this._pins.get(s2) || 0) - 1; if (n > 0) this._pins.set(s2, n); else this._pins.delete(s2); }
  /** frees every surface of this renderer (caches, pool, scratch) and stops answering; the editor calls it when it closes or
   *  replaces the document (R2-03) */
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    clearTimeout(this._warm);
    this._pins.clear();
    this.freeCaches();
    if (this._dispBytes && typeof this.gfx.untrack === "function") this.gfx.untrack(this._dispBytes);
    this._dispBytes = 0;
    if (this.gfx.reclaim === this._reclaimFn) this.gfx.reclaim = null;
  }
  /* =================================================================================================================
     geometry: G maps base px to output px: translate −crop centre → rotate clockwise by rot + r/10 degrees → + out centre
     ================================================================================================================= */
  _crop() { const d = this.doc; return d.geo.crop || { x: 0, y: 0, w: d.w, h: d.h }; }
  _theta() { const g = this.doc.geo; return (((g.rot || 0) + (g.r || 0) / 10) * Math.PI) / 180; }
  /** → { w, h } */
  outSize() { return this.doc.outSize(); }
  /** → [a, b, c, d, e, f] base → output (x' = a·x + c·y + e, y' = b·x + d·y + f), for the CSS stage and setTransform */
  geoMatrix() {
    const c = this._crop(), o = this.outSize(), t = this._theta(), cs = Math.cos(t), sn = Math.sin(t);
    const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
    return [cs, sn, -sn, cs, o.w / 2 - (cs * cx - sn * cy), o.h / 2 - (sn * cx + cs * cy)];
  }
  /** wa-local px → output px (the display canvas holds the work area; contract-log DOC1) */
  stageMatrix() {
    const [a, b, c, d, e, f] = this.geoMatrix(), wa = this.doc.wa;
    return [a, b, c, d, e + a * wa.x + c * wa.y, f + b * wa.x + d * wa.y];
  }
  baseToOut(x, y) { const [a, b, c, d, e, f] = this.geoMatrix(); return { x: a * x + c * y + e, y: b * x + d * y + f }; }
  outToBase(x, y) {
    const [a, b, c, d, e, f] = this.geoMatrix(), det = a * d - b * c, X = x - e, Y = y - f;
    return { x: (d * X - c * Y) / det, y: (-b * X + a * Y) / det };
  }
  /** output px per cm from doc.geo.cal through the geometry (rigid, so the segment length is kept), or null */
  ppc() {
    const cal = this.doc.geo.cal;
    if (!cal || !(cal.cm > 0)) return null;
    const p = this.baseToOut(cal.a, cal.b), q = this.baseToOut(cal.c, cal.d), len = Math.hypot(q.x - p.x, q.y - p.y);
    return len > 0 ? len / (cal.cm / 10) : null;
  }
  /** display-only layer hiding for 비교와 확정; not a command, not saved */
  setViewOverride({ hide } = {}) { this.view = { hide: new Set(hide || []) }; }
  /* =================================================================================================================
     caches
     ================================================================================================================= */
  /** rect null = all: frees cached states above fromIndex. With a rect (a stroke in progress on layer fromIndex) nothing is freed:
   *  the state below the stroke's layer stays valid and the brush keeps sampling its own copy; display renders of the rect start at
   *  or below fromIndex until the next full render. */
  invalidate(rect, fromIndex = 0) {
    if (rect) { this._paintFrom = Math.min(this._paintFrom, fromIndex | 0); return; }
    this._cache = this._cache.filter((c) => { if (c.idx > fromIndex) { c.surf.free(); return false; } return true; });
    this._hist.clear();
  }
  /** drops proxy and below caches (memory guard, before import and export) */
  freeCaches() {
    // a surface a render is using right now stays (the memory guard calls this in the middle of renders, R2-02)
    this._cache = this._cache.filter((c) => { if (this._pins.has(c.surf)) return true; c.surf.free(); return false; });
    for (const s2 of this._pool) s2.free();
    this._pool = [];
    for (let i = 0; i < 2; i++) if (this._rs[i] && !this._pins.has(this._rs[i])) { this._rs[i].free(); this._rs[i] = null; }
    for (const v of this._maskCache.values()) if (v.alpha) v.alpha.free();
    this._maskCache.clear();
    this._cube.clear();
    this._hist.clear();
  }
  _proxyK() { const wa = this.doc.wa; return Math.min(1, this.proxyMax / Math.max(wa.w, wa.h)); }
  /** the slider-preview scale: long side ≤ PREVIEW_MAX (and never above the proxy) */
  _previewK() { const wa = this.doc.wa; return Math.min(this._proxyK(), PREVIEW_MAX / Math.max(wa.w, wa.h)); }
  _base() { const d = this.doc; return [d.wa.x, d.wa.y, d.wa.w, d.wa.h, d.w, d.h, (d.geo.fill || []).join(",")].join("|"); }
  _sig(L, preview, hide) {
    if (!L || L.opaque || L.missing || !BASE_KINDS.has(L.k) || !L.vis || hide.has(L.id)) return "-" + (L ? L.id : 0);
    const m = L.mask ? L.mask.rev + "." + L.mask.on + "." + L.mask.fe : "0";
    const p = preview && preview.id === L.id ? preview.p : L.p;
    return [L.id, L.rev, L.op, L.bl, m, p ? JSON.stringify(p) : "", L.live || 0, L.mask && L.mask.live ? "ml" : ""].join(":");
  }
  _sigs(upto, preview, hide) { const out = [this._base()]; for (let i = 0; i < upto; i++) out.push(this._sig(this.doc.layers[i], preview, hide)); return out; }
  /** best cached state at scale k with idx ≤ upto whose layer signatures match */
  _find(k, upto, sigs) {
    let best = null;
    for (const c of this._cache) {
      if (c.k !== k || c.idx > upto) continue;
      let ok = true;
      for (let i = 0; i <= c.idx; i++) if (c.sigs[i] !== sigs[i]) { ok = false; break; }
      if (ok && (!best || c.idx > best.idx)) best = c;
    }
    if (best) best.at = now();
    return best;
  }
  /** stores surf (ownership passes to the cache) as the state below idx; LRU per scale: full 3 (touch 2), each proxy scale 2 */
  _store(k, idx, sigs, surf, keep = false) {
    const key = sigs.slice(0, idx + 1).join("\n");
    const old = this._cache.find((c) => c.k === k && c.idx === idx && c.key === key);
    if (old) { if (old.surf !== surf && !keep) this._release(surf); old.at = now(); return old; }
    const cap = k === 1 ? (this.gfx.touch || this.gfx.lowMem ? 2 : 3) : 2;
    const list = this._cache.filter((c) => c.k === k).sort((a, b) => a.at - b.at);
    while (list.length >= cap) { const c = list.shift(); if (this._pins.has(c.surf)) continue; c.surf.free(); this._cache.splice(this._cache.indexOf(c), 1); }   // a pinned surface stays (R2-02)
    const e = { k, idx, sigs: sigs.slice(0, idx + 1), key, surf, at: now() };
    this._cache.push(e);
    return e;
  }
  _owned(surf) { return this._cache.some((c) => c.surf === surf); }
  _acquire(w, h) {
    const i = this._pool.findIndex((s2) => s2.w === w && s2.h === h);
    if (i >= 0) return this._pool.splice(i, 1)[0];
    return this.gfx.surface(w, h, "acc");
  }
  /** returns an accumulator to the pool (one spare per size, at most two) unless the cache owns it */
  _release(surf) {
    if (!surf || this._owned(surf)) return;
    if (this._pool.length >= 2 || this.gfx.touch || this.gfx.lowMem) { surf.free(); return; }
    this._pool.push(surf);
  }
  /** scratch surface i (0, 1) of at least w × h, grown in 256 px steps and kept between paint renders */
  _rectSurf(i, w, h) {
    let s2 = this._rs[i];
    if (!s2 || s2.w < w || s2.h < h) {
      if (s2) s2.free();
      s2 = this._rs[i] = this.gfx.surface(Math.ceil(Math.max(w, s2 ? s2.w : 0) / 256) * 256, Math.ceil(Math.max(h, s2 ? s2.h : 0) / 256) * 256, "scratch");
    }
    return s2;
  }
  /** runs the per-pixel loops once on a small buffer so the engine compiles them before the first drag (no visible output) */
  _warmUp() {
    try {
      const n = 128, d = new Uint8ClampedArray(n * n * 4);
      for (let i = 0; i < d.length; i++) d[i] = (i * 37) & 255;
      const R = { x: 0, y: 0, w: n, h: n }, o = d.slice();
      tetra3D(o, this._cubeFor("hs", { a: [10, 10, 0] }, PREVIEW_CUBE), PREVIEW_CUBE);
      applyLuts(o, n, R, adjLuts("bc", { b: 10 }));
      mixAdjusted(d, o, n, R, 0.5, null, n, false);
      colourMemo(adjFn("hs", { a: [5, 0, 0] }))(o);
    } catch (e) { /* warm-up is optional */ }
  }
  _copy(src) {
    const s2 = this._acquire(src.w, src.h);
    s2.draw(src, { gco: "copy" });
    return s2;
  }
  /* =================================================================================================================
     masks at a scale
     ================================================================================================================= */
  _maskAt(L, k) {
    const m = this.doc.maskOf(L);
    if (!m) return null;
    const wa = this.doc.wa;
    if (k === 1) return { m, w: wa.w, h: wa.h };
    const key = "m:" + L.id + ":" + L.mask.rev + ":" + L.mask.fe + ":" + k + ":" + wa.w + "x" + wa.h;
    const hit = this._maskCache.get(key);
    if (hit) return hit;
    const w = Math.max(1, Math.round(wa.w * k)), h = Math.max(1, Math.round(wa.h * k)), out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const sy = Math.min(wa.h - 1, Math.floor((y + 0.5) / k));
      for (let x = 0; x < w; x++) out[y * w + x] = m[sy * wa.w + Math.min(wa.w - 1, Math.floor((x + 0.5) / k))];
    }
    for (const kk of [...this._maskCache.keys()]) if (kk.startsWith("m:" + L.id + ":") && kk !== key) this._maskCache.delete(kk);
    const v = { m: out, w, h };
    this._maskCache.set(key, v);
    return v;
  }
  /* =================================================================================================================
     the compositor (a generator: sync and sliced async drivers share it)
     opts: { from, to, k, area (scaled wa-local rect), start (Surface at state `from`, area-sized), preview, hide, interactive,
             cacheAt (indices whose below-state is stored), storeEnd (the result itself becomes the cached state at `to`), sigs }
     ================================================================================================================= */
  *_compose(o) {
    const doc = this.doc, wa = doc.wa, k = o.k, A = o.area;
    this._pin(o.start);
    let acc;
    try { acc = o.acc || this._acquire(A.w, A.h); }
    catch (e) {
      // out of canvas memory: when nothing else reads the cached start, compose into it in place (the cache entry is given up)
      const i = e && e.code === "memory" && o.start && !o.acc && o.start.w === A.w && o.start.h === A.h && this._pins.get(o.start) === 1
        ? this._cache.findIndex((c) => c.surf === o.start) : -1;
      if (i < 0) { this._unpin(o.start); throw e; }
      this._cache.splice(i, 1);
      acc = o.start;
    }
    this._pin(acc);
    try {
      yield* this._composeRun(o, acc, doc, wa, k, A);
    } finally { this._unpin(acc); this._unpin(o.start); }
    return acc;
  }
  *_composeRun(o, acc, doc, wa, k, A) {
    if (o.start) { if (o.start !== acc) acc.draw(o.start, { gco: "copy" }); }   // start === acc: already holds the start (rect paint, in place)
    else {
      acc.fill(doc.geo.fill || [255, 255, 255]);
      if (doc.base) drawScaled(acc, doc.base, -wa.x * k - A.x, -wa.y * k - A.y, k === 1 ? null : doc.w * k, k === 1 ? null : doc.h * k, 1, "source-over");
    }
    const at = new Set(o.rectRender || !o.sigs ? [] : (Array.isArray(o.cacheAt) ? o.cacheAt : o.cacheAt == null ? [] : [o.cacheAt]));
    for (let i = o.from; i < o.to; i++) {
      if (at.has(i) && !(o.start && i === o.from)) this._store(k, i, o.sigs, this._copy(acc));
      const L = doc.layers[i];
      if (!L || L.opaque || L.missing || !BASE_KINDS.has(L.k) || !L.vis || o.hide.has(L.id) || !(L.op > 0)) continue;
      const p = o.preview && o.preview.id === L.id ? o.preview.p : L.p;
      if (PIXEL.has(L.k) || L.k === "ai") { this._drawPixel(acc, L, k, A, p); yield; continue; }
      if (L.k === "adj") { if (!(IDENT_EMPTY.has(L.t) && (!p || !Object.keys(p).length))) yield* this._adjust(acc, L, p, k, A, o.interactive); continue; }
      if (L.k === "flt") { yield* this._filter(acc, L, p, k, A); continue; }
    }
    if (o.storeEnd && o.sigs && !o.rectRender) this._store(k, o.to, o.sigs, acc, true);
    else if (at.has(o.to) && !(o.start && o.to === o.from)) this._store(k, o.to, o.sigs, this._copy(acc));
  }
  _drawPixel(acc, L, k, A, p) {
    const doc = this.doc, wa = doc.wa, gfx = this.gfx;
    if (!L.surf || !L.bx) return;
    const ai = L.k === "ai";
    const r = ai ? doc._aiRect(L, p || L.p) : L.bx;
    const gn = ai && p && p.gn > 0 ? p.gn : 0;
    const dx = (r.x - wa.x) * k - A.x, dy = (r.y - wa.y) * k - A.y, dw = r.w * k, dh = r.h * k;
    if (dx >= A.w || dy >= A.h || dx + dw <= 0 || dy + dh <= 0) return;
    const gco = BLENDS[L.bl] || "source-over";
    const mask = this._maskAt(L, k);
    const scaled = L.k === "ai" ? L.surf.w !== r.w || L.surf.h !== r.h || k !== 1 : k !== 1;
    if (!mask && !gn) { drawScaled(acc, L.surf, dx, dy, scaled ? dw : null, scaled ? dh : null, L.op, gco); return; }
    // masked or grained: draw into a scratch of the destination size, add the grain, cut by the mask, then composite
    const tw = Math.max(1, Math.round(dw)), th = Math.max(1, Math.round(dh));
    const tmp = gfx.surface(tw, th, "scratch");
    try {
      drawScaled(tmp, L.surf, 0, 0, tw, th, 1, "source-over");
      const ox = Math.round((r.x - wa.x) * k), oy = Math.round((r.y - wa.y) * k);
      const d = tmp.read({ x: 0, y: 0, w: tw, h: th });
      // 결 맞추기: monochrome grain of gn ‰, seeded by p.sd and the pixel position in the work area (slices and proxies agree)
      if (gn) addNoise(d, tw, th, { a: gn, gs: 1, mo: 1, sd: p.sd || 0 }, { x: 0, y: 0, w: tw, h: th }, { x: ox + Math.round(wa.x * k), y: oy + Math.round(wa.y * k) });
      if (mask) for (let y = 0; y < th; y++) {
        const my = oy + y;
        for (let x = 0; x < tw; x++) {
          const mx = ox + x, i = (y * tw + x) * 4 + 3;
          const v = mx < 0 || my < 0 || mx >= mask.w || my >= mask.h ? 0 : mask.m[my * mask.w + mx];
          if (v !== 255) d[i] = Math.round((d[i] * v) / 255);
        }
      }
      tmp.write({ x: 0, y: 0, w: tw, h: th }, d);
      acc.draw(tmp, { dx: Math.round(dx), dy: Math.round(dy), alpha: L.op, gco });
    } finally { tmp.free(); }
  }
  _cubeFor(t, p, n) {
    const key = n + ":" + t + ":" + JSON.stringify(p || {});
    let c = this._cube.get(key);
    if (!c) { c = bake3D(adjFn(t, p || {}), n); if (this._cube.size > 6) this._cube.clear(); this._cube.set(key, c); }
    return c;
  }
  *_adjust(acc, L, p, k, A, interactive) {
    const mask = this._maskAt(L, k), lumOnly = L.bl === 16, t = L.t, W = A.w;
    const luts = adjLuts(t, p || {});
    const direct = !mask && L.op >= 1 && !lumOnly;   // no mix needed: adjust the pixels in place
    const band = interactive ? A.h : BAND;            // a preview is small: one pass
    const fn = luts || interactive ? null : adjFn(t, p || {});
    const memo = fn ? colourMemo(fn) : null;          // exact on commit, one evaluation per distinct colour
    const cube = !luts && interactive ? this._cubeFor(t, p, PREVIEW_CUBE) : null;
    for (let y0 = 0; y0 < A.h; y0 += band) {
      const r = { x: 0, y: y0, w: W, h: Math.min(band, A.h - y0) };
      const d = acc.read(r);
      const bandR = { x: 0, y: 0, w: W, h: r.h };
      const out = direct ? d : d.slice();
      if (luts) applyLuts(out, W, bandR, luts);
      else if (cube) tetra3D(out, cube, PREVIEW_CUBE);
      else memo(out);
      if (!direct) mixAdjusted(d, out, W, bandR, L.op, mask ? mask.m : null, mask ? mask.w : W, lumOnly, A.x, A.y + y0);
      acc.write(r, d);
      yield;
    }
  }
  *_filter(acc, L, p0, k, A) {
    const doc = this.doc, wa = doc.wa, p = { ...(p0 || {}) }, t = L.t, W = A.w, H = A.h;
    const mask = this._maskAt(L, k), lumOnly = L.bl === 16;
    const src = acc.read({ x: 0, y: 0, w: W, h: H });   // spatial filters read rect ± margin of the state below: one full read
    const crop = doc.geo.crop || { x: 0, y: 0, w: doc.w, h: doc.h };
    const margin = Math.ceil((FLT[t] ? FLT[t].margin(p) : 0) * k) + 1;
    // the in-place kernels run on a window of rows (band ± margin) copied from the unchanged state; a wide margin runs once
    const step = margin > BAND ? H : BAND;
    let whole = null;
    for (let y0 = 0; y0 < H; y0 += step) {
      const bh = Math.min(step, H - y0), band = { x: 0, y: y0, w: W, h: bh };
      let out;
      if (t === "gb") out = gaussRGBA(src, W, H, ((p.r || 20) / 10) * k, band);
      else {
        const wy0 = Math.max(0, y0 - margin), wy1 = Math.min(H, y0 + bh + margin), wh = wy1 - wy0;
        const win = step === H ? (whole = whole || src.slice()) : src.slice(wy0 * W * 4, wy1 * W * 4);
        const r = { x: 0, y: y0 - wy0, w: W, h: bh };
        if (t === "usm") unsharp(win, W, wh, { ...p, r: Math.max(1, (p.r || 10) * k) }, r);
        else if (t === "nz") addNoise(win, W, wh, p, r, { x: Math.round(A.x + wa.x * k), y: Math.round(A.y + wa.y * k) + wy0 });
        else if (t === "vg") vignette(win, W, wh, p, r, { x: (crop.x - wa.x) * k - A.x, y: (crop.y - wa.y) * k - A.y - wy0, w: crop.w * k, h: crop.h * k });
        else if (t === "shd") shadowsHighlights(win, W, wh, { ...p, r: Math.max(1, (p.r || 30) * k) }, r);
        out = win.slice((y0 - wy0) * W * 4, (y0 - wy0 + bh) * W * 4);
      }
      for (let y = 0; y < bh; y += BAND) {   // mix and write in bands so a long render yields between them
        const h2 = Math.min(BAND, bh - y), rows = { x: 0, y: y0 + y, w: W, h: h2 };
        const d = src.slice((y0 + y) * W * 4, (y0 + y + h2) * W * 4), o2 = out.subarray(y * W * 4, (y + h2) * W * 4);
        mixAdjusted(d, o2, W, { x: 0, y: 0, w: W, h: h2 }, L.op, mask ? mask.m : null, mask ? mask.w : W, lumOnly, A.x, A.y + y0 + y);
        acc.write(rows, d);
        yield;
      }
    }
  }
  _runSync(gen) { let r; do { r = gen.next(); } while (!r.done); return r.value; }
  async _runAsync(gen, signal) {
    let t0 = now();
    for (;;) {
      if (signal && signal.aborted) { try { gen.return(); } catch (e) { /* closed */ } const e = new Error("aborted"); e.name = "AbortError"; throw e; }
      const r = gen.next();
      if (r.done) return r.value;
      if (now() - t0 > 12) { await yieldTask(); t0 = now(); }
    }
  }
  _upto() { return this.doc.layers.length; }
  /** the render plan at scale k: start from the best cached state; a proxy without its own cache starts from a downscaled copy of a
   *  full-resolution cached state (so the first preview frame never rebuilds the layers below) */
  _plan(upto, { k = 1, preview = null, hide = null, cacheAt = null } = {}) {
    const wa = this.doc.wa;
    const H = hide || new Set();
    const sigs = this._sigs(upto, preview, H);
    const area = { x: 0, y: 0, w: Math.max(1, Math.round(wa.w * k)), h: Math.max(1, Math.round(wa.h * k)) };
    let hit = this._find(k, upto, sigs);
    if (k < 1) {
      const full = this._find(1, upto, sigs);
      if (full && (!hit || full.idx > hit.idx)) {
        this._pin(full.surf);
        let sc;
        try { sc = this._acquire(area.w, area.h); } finally { this._unpin(full.surf); }
        if (sc.ctx) { sc.ctx.save(); sc.ctx.globalCompositeOperation = "copy"; sc.ctx.imageSmoothingEnabled = true; sc.ctx.imageSmoothingQuality = "low"; sc.ctx.drawImage(full.surf.cv, 0, 0, area.w, area.h); sc.ctx.restore(); }
        else sc.draw(full.surf, { dx: 0, dy: 0, dw: area.w, dh: area.h, gco: "copy" });
        hit = this._store(k, full.idx, sigs, sc);
      }
    }
    return { from: hit ? hit.idx : 0, to: upto, k, area, start: hit ? hit.surf : null, preview, hide: H, sigs, cacheAt };
  }
  /** → Surface: base + layers[0, index) (base-space kinds only), cached. Use it at once; never keep, change or free it. */
  below(index, { proxy = false } = {}) {
    const upto = clamp(index | 0, 0, this._upto());
    const pl = this._plan(upto, { k: proxy ? this._proxyK() : 1 });
    if (pl.start && pl.from === upto) return pl.start;
    pl.storeEnd = true;
    const acc = this._runSync(this._compose(pl));
    const e = this._find(pl.k, upto, pl.sigs);
    if (e && e.surf !== acc) this._release(acc);
    return e ? e.surf : acc;
  }
  /** → Surface: base + all base-space layers (cached; use it at once, never keep, change or free it) */
  composite({ proxy = false } = {}) { return this.below(this._upto(), { proxy }); }
  /** renders into the display canvas (wa-sized at doc resolution). rect (wa-local): only that area, from the cached state below the
   *  active layer (or below the lowest layer painted since the last full render). interactive: a small proxy (≤ PREVIEW_MAX px), drawn
   *  scaled. preview {id, p}: parameters of one layer without a command. → { proxy, skipped } */
  async renderDisplay(canvas, opts = {}) {
    if (this._disposed || !canvas || this.doc.disposed) return { proxy: false, skipped: false, disposed: this._disposed || this.doc.disposed };
    try { return await this._renderDisplay(canvas, opts); }
    catch (e) { if (e && e.code === "memory") return { proxy: false, skipped: false, error: "memory" }; throw e; }
  }
  _countDisplay(canvas) {
    const b = canvas.width * canvas.height * 4;
    if (b === this._dispBytes || typeof this.gfx.track !== "function") return;
    this.gfx.untrack(this._dispBytes); this.gfx.track(b); this._dispBytes = b;
  }
  async _renderDisplay(canvas, { interactive = false, rect = null, preview = null, signal } = {}) {
    const doc = this.doc, wa = doc.wa, hide = this.view.hide;
    const upto = this._upto();
    const pivot = preview ? doc.indexOf(preview.id) : doc.indexOf(doc.activeId);
    const ctx = canvas.getContext("2d");
    if (rect && (canvas.width !== wa.w || canvas.height !== wa.h)) rect = null;   // after a preview frame: redraw everything
    if (rect) {
      // painting: area = rect grown by the margins of filters at or above the start, from the cached state below it
      const from = Math.min(pivot >= 0 ? pivot : upto, this._paintFrom, upto);
      const base = this._pin(this.below(from));
      try {
      let m = 0, skipped = false;
      for (let i = from; i < upto; i++) {
        const L = doc.layers[i];
        if (L && L.k === "flt" && L.vis && !L.missing) { const mg = FLT[L.t] ? FLT[L.t].margin(L.p || {}) : 0; if (mg > 72) skipped = true; else m += mg; }
      }
      const R = { x: clamp(Math.floor(rect.x) - m, 0, wa.w), y: clamp(Math.floor(rect.y) - m, 0, wa.h) };
      R.w = clamp(Math.ceil(rect.x + rect.w) + m, 0, wa.w) - R.x; R.h = clamp(Math.ceil(rect.y + rect.h) + m, 0, wa.h) - R.y;
      if (R.w <= 0 || R.h <= 0) return { proxy: false, skipped };
      const acc = this._pin(this._rectSurf(1, R.w, R.h));
      this._unpin(acc);   // _compose pins it (o.acc) for the run; the copy below allocates nothing
      if (acc.ctx && base.cv) { acc.ctx.save(); acc.ctx.globalCompositeOperation = "copy"; acc.ctx.globalAlpha = 1; acc.ctx.drawImage(base.cv, R.x, R.y, R.w, R.h, 0, 0, R.w, R.h); acc.ctx.restore(); }
      else acc.write({ x: 0, y: 0, w: R.w, h: R.h }, base.read(R));
      const gen = this._compose({ from, to: upto, k: 1, area: R, start: acc, acc, preview, hide: skipped ? new Set([...hide, ...this._wideFilters(from)]) : hide, rectRender: true });
      this._runSync(gen);
      const ix = clamp(Math.floor(rect.x), 0, wa.w) - R.x, iy = clamp(Math.floor(rect.y), 0, wa.h) - R.y;
      const iw = Math.min(R.w - ix, Math.ceil(rect.w)), ih = Math.min(R.h - iy, Math.ceil(rect.h));
      if (iw > 0 && ih > 0) putRect(ctx, acc, { x: ix, y: iy, w: iw, h: ih }, R.x + ix, R.y + iy);
      this.skipped = skipped;
      return { proxy: false, skipped };
      } finally { this._unpin(base); }
    }
    const k = interactive ? this._previewK() : 1;
    const proxy = k < 1;
    const bw = Math.max(1, Math.round(wa.w * k)), bh = Math.max(1, Math.round(wa.h * k));
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    this._countDisplay(canvas);
    this._paintFrom = Infinity;
    const pl = this._plan(upto, { k, preview, hide, cacheAt: pivot >= 0 ? pivot : null });
    pl.interactive = !!interactive;
    pl.storeEnd = !preview && !hide.size;   // the true composite becomes the cached state at the top (composite(), samples, the next layer)
    const t0 = now();
    const acc = await this._runAsync(this._compose(pl), signal);
    if (proxy && !this._probe) { this._probe = true; if (now() - t0 > 40 && this.proxyMax > 768) { this.proxyMax = 768; } }
    try {
      if (signal && signal.aborted) return { proxy, skipped: false };
      if (acc.cv) {
        ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = "copy"; ctx.globalAlpha = 1;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(acc.cv, 0, 0);
        ctx.restore();
      } else putRect(ctx, acc, { x: 0, y: 0, w: acc.w, h: acc.h }, 0, 0);
    } finally { this._release(acc); }
    this.skipped = false;
    return { proxy, skipped: false };
  }
  _wideFilters(from) {
    const out = [];
    for (let i = from; i < this.doc.layers.length; i++) { const L = this.doc.layers[i]; if (L && L.k === "flt" && FLT[L.t] && FLT[L.t].margin(L.p || {}) > 72) out.push(L.id); }
    return out;
  }
  /* =================================================================================================================
     output space: warp the composite through G
     ================================================================================================================= */
  /** src: a Surface of the work area at scale k → new gfx Surface ow·s × oh·s in output space (margins in the fill colour) */
  _warp(src, k, s) {
    const doc = this.doc, wa = doc.wa, o = this.outSize(), gfx = this.gfx;
    const W = Math.max(1, Math.round(o.w * s)), H = Math.max(1, Math.round(o.h * s));
    this._pin(src);
    let T;
    try { T = gfx.surface(W, H, "scratch"); } finally { this._unpin(src); }
    T.fill(doc.geo.fill || [255, 255, 255]);
    // M: src px → target px = S(s) · G · translate(wa) · S(1/k)
    const [a, b, c, d, e, f] = this.geoMatrix();
    const M = [a * s / k, b * s / k, c * s / k, d * s / k, (e + a * wa.x + c * wa.y) * s, (f + b * wa.x + d * wa.y) * s];
    if (T.ctx && src.cv) {
      let img = src.cv, iw = src.w, ih = src.h, tmp = null, sc = s / k;
      while (sc < 0.5 && iw > 2 && ih > 2) {   // successive halving keeps a strong shrink sharp and alias-free
        const nw = Math.max(1, Math.round(iw / 2)), nh = Math.max(1, Math.round(ih / 2));
        const h2 = gfx.surface(nw, nh, "scratch");
        h2.ctx.imageSmoothingEnabled = true; h2.ctx.imageSmoothingQuality = "high";
        h2.ctx.drawImage(img, 0, 0, nw, nh);
        if (tmp) tmp.free();
        tmp = h2; img = h2.cv; sc *= 2; iw = nw; ih = nh;
      }
      const fx = src.w / iw, fy = src.h / ih;
      const ctx = T.ctx;
      ctx.save();
      ctx.setTransform(M[0] * fx, M[1] * fx, M[2] * fy, M[3] * fy, M[4], M[5]);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0);
      ctx.restore();
      if (tmp) tmp.free();
      return T;
    }
    // memory surfaces: inverse map with bilinear sampling
    const sd = src.read({ x: 0, y: 0, w: src.w, h: src.h }), out = T.read({ x: 0, y: 0, w: W, h: H });
    const det = M[0] * M[3] - M[1] * M[2];
    const ia = M[3] / det, ib = -M[1] / det, ic = -M[2] / det, id = M[0] / det;
    const ie = -(ia * M[4] + ic * M[5]), iff = -(ib * M[4] + id * M[5]);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const X = x + 0.5, Y = y + 0.5, u = ia * X + ic * Y + ie - 0.5, v = ib * X + id * Y + iff - 0.5;
      if (u < -0.5 || v < -0.5 || u > src.w - 0.5 || v > src.h - 0.5) continue;
      const x0 = clamp(Math.floor(u), 0, src.w - 1), y0 = clamp(Math.floor(v), 0, src.h - 1);
      const x1 = Math.min(src.w - 1, x0 + 1), y1 = Math.min(src.h - 1, y0 + 1), fx = clamp(u - x0, 0, 1), fy = clamp(v - y0, 0, 1);
      const j = (y * W + x) * 4;
      let aSum = 0;
      const acc4 = [0, 0, 0];
      for (const [xx, yy, wt] of [[x0, y0, (1 - fx) * (1 - fy)], [x1, y0, fx * (1 - fy)], [x0, y1, (1 - fx) * fy], [x1, y1, fx * fy]]) {
        const i = (yy * src.w + xx) * 4, al = (sd[i + 3] / 255) * wt;
        aSum += al; acc4[0] += sd[i] * al; acc4[1] += sd[i + 1] * al; acc4[2] += sd[i + 2] * al;
      }
      if (aSum <= 0) continue;
      for (let ch = 0; ch < 3; ch++) out[j + ch] = Math.round((acc4[ch] / aSum) * aSum + out[j + ch] * (1 - aSum));
      out[j + 3] = 255;
    }
    T.write({ x: 0, y: 0, w: W, h: H }, out);
    return T;
  }
  _markRecs() {
    return this.doc.layers.filter((L) => (L.k === "ov" || L.k === "txt") && L.vis && !L.missing && !L.opaque && L.p)
      .map((L) => ({ id: L.id, k: KINDS.indexOf(L.k), t: TCODE[L.k] ? TCODE[L.k].indexOf(L.t) : 0, kind: L.k, tn: L.t, p: L.p, op: L.op }));
  }
  _drawMarks(T, s) {
    if (!T.ctx) return;
    const o = this.outSize(), ppc = this.ppc();
    for (const rec of this._markRecs()) {
      try {
        T.ctx.save();
        T.ctx.globalAlpha = rec.op == null ? 1 : rec.op;
        if (rec.kind === "txt") drawText(T.ctx, rec, o.w, o.h, s); else drawMark(T.ctx, rec, o.w, o.h, s, ppc);
      } catch (e) { /* a bad mark never breaks an export */ } finally { T.ctx.restore(); }
    }
  }
  _scaleFor(maxLong) { const o = this.outSize(); return Math.min(1, maxLong / Math.max(o.w, o.h, 1)); }
  /** → { d:RGBA, w, h } output-space proxy (histogram, info, stats, snapshots) */
  outProxy(maxLong = 512, { marks = false, layers = true } = {}) {
    const s = this._scaleFor(maxLong);
    const useProxy = this._proxyK() >= s * 1.2 && this._proxyK() < 1;
    let src, k, tmp = null;
    if (layers) { src = this.composite({ proxy: useProxy }); k = useProxy ? this._proxyK() : 1; }
    else { tmp = this._baseOnly(); src = tmp; k = 1; }
    const T = this._warp(src, k, s);
    if (tmp) tmp.free();
    if (marks) this._drawMarks(T, s);
    const d = T.read({ x: 0, y: 0, w: T.w, h: T.h }), w = T.w, h = T.h;
    T.free();
    return { d, w, h };
  }
  _baseOnly() {
    const doc = this.doc, wa = doc.wa, s = this.gfx.surface(wa.w, wa.h, "scratch");
    s.fill(doc.geo.fill || [255, 255, 255]);
    if (doc.base) s.draw(doc.base, { dx: -wa.x, dy: -wa.y });
    return s;
  }
  /** kind "final"|"before"|"compare"|"snapshot" → a gfx Surface (`.cv` is the canvas in browsers); the caller frees it.
   *  labels: the two captions of "compare" (from the text module; this file holds no Hangul). */
  async exportImage({ maxLong = 2000, kind = "final", signal, labels = null } = {}) {
    this.freeCaches();
    if (kind === "snapshot") {
      const p = this.outProxy(maxLong, { marks: true });
      const S = this.gfx.surface(p.w, p.h, "scratch");
      S.write({ x: 0, y: 0, w: p.w, h: p.h }, p.d);
      return S;
    }
    const s = this._scaleFor(maxLong);
    if (kind === "before") { const b = this._baseOnly(); try { return this._warp(b, 1, s); } finally { b.free(); } }
    if (kind === "compare") {
      const half = Math.floor((1600 - 24) / 2), o = this.outSize(), hs = Math.min(1, half / o.w, 1600 / Math.max(o.w, o.h));
      const before = await this.exportImage({ maxLong: Math.max(o.w, o.h) * hs, kind: "before" });
      const after = await this.exportImage({ maxLong: Math.max(o.w, o.h) * hs, kind: "final", signal });
      const cap = labels && after.ctx ? Math.max(28, Math.round(after.h * 0.06)) : 0;
      const S = this.gfx.surface(before.w + 24 + after.w, Math.max(before.h, after.h) + cap, "scratch");
      S.fill([255, 255, 255]);
      S.draw(before, { dx: 0, dy: 0 });
      S.draw(after, { dx: before.w + 24, dy: 0 });
      if (cap && S.ctx) {
        try { await ensureFont(0, labels.join("")); } catch (e) { /* serif fallback */ }
        const c = S.ctx;
        c.save(); c.fillStyle = "#000"; c.textAlign = "center"; c.textBaseline = "middle";
        c.font = "500 " + Math.round(cap * 0.5) + "px " + FONT[0];
        c.fillText(String(labels[0] || ""), before.w / 2, Math.max(before.h, after.h) + cap / 2);
        c.fillText(String(labels[1] || ""), before.w + 24 + after.w / 2, Math.max(before.h, after.h) + cap / 2);
        c.restore();
      }
      before.free(); after.free();
      return S;
    }
    const pl = this._plan(this._upto(), {});
    const acc = await this._runAsync(this._compose({ ...pl, cacheAt: null }), signal);
    let T;
    try { T = this._warp(acc, 1, s); } finally { acc.free(); }
    if (T.ctx) {
      for (const rec of this._markRecs()) if (rec.kind === "txt") { try { await ensureFont(rec.p.fn || 0, rec.p.s || ""); } catch (e) { /* fallback font */ } }
      this._drawMarks(T, s);
    }
    return T;
  }
  /* =================================================================================================================
     coverage, layer facts, statistics, histogram, samples
     ================================================================================================================= */
  _covGrid() {
    const o = this.outSize(), s = Math.min(1, 512 / Math.max(o.w, o.h, 1));
    return { s, w: Math.max(1, Math.round(o.w * s)), h: Math.max(1, Math.round(o.h * s)) };
  }
  /** a layer's coverage (alpha × mask, or the mask of a parametric layer) on the output grid of _covGrid → Uint8Array */
  _layerCov(L, grid) {
    const doc = this.doc, wa = doc.wa, { s, w, h } = grid;
    const out = new Uint8Array(w * h);
    const mask = doc.maskOf(L);
    let ad = null, r = null, sw = 0, sh = 0;
    if (PIXEL.has(L.k) || L.k === "ai") {
      if (!L.surf || !L.bx) return out;
      r = L.k === "ai" ? doc._aiRect(L) : L.bx; sw = L.surf.w; sh = L.surf.h;
      ad = L.surf.read({ x: 0, y: 0, w: sw, h: sh });
    }
    const [a, b, c, d, e, f] = this.geoMatrix(), det = a * d - b * c;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const X = (x + 0.5) / s - e, Y = (y + 0.5) / s - f;
      const bxp = (d * X - c * Y) / det, byp = (-b * X + a * Y) / det;
      let v = 255;
      if (ad) {
        const u = Math.floor(((bxp - r.x) * sw) / r.w), q = Math.floor(((byp - r.y) * sh) / r.h);
        v = u < 0 || q < 0 || u >= sw || q >= sh ? 0 : ad[(q * sw + u) * 4 + 3];
      } else if (!mask) v = 255;
      if (v && mask) {
        const mx = Math.floor(bxp - wa.x), my = Math.floor(byp - wa.y);
        v = mx < 0 || my < 0 || mx >= wa.w || my >= wa.h ? 0 : Math.round((v * mask[my * wa.w + mx]) / 255);
      }
      out[y * w + x] = v;
    }
    return out;
  }
  _pinDiscs(grid) {
    const doc = this.doc, o = this.outSize(), rad = 0.02 * Math.min(doc.w, doc.h) * grid.s;
    return (doc.pins || []).filter((p) => p && p.k === 1).map((p) => { const q = this.baseToOut((p.x * doc.w) / 1000, (p.y * doc.h) / 1000); return { x: q.x * grid.s, y: q.y * grid.s, r: Math.max(1, rad) }; })
      .filter((q) => q.x >= -q.r && q.y >= -q.r && q.x <= o.w * grid.s + q.r && q.y <= o.h * grid.s + q.r);
  }
  /** → { cov:‰, g, bbox (output px), po } (po = 흔적 위치 pins whose disc meets the coverage) */
  layerStats(id) {
    const L = this.doc.layer(id);
    if (!L || L.missing || L.opaque || !BASE_KINDS.has(L.k)) return { cov: 0, g: 0, bbox: null, po: 0 };
    const grid = this._covGrid(), m = this._layerCov(L, grid);
    const cov = maskCoverage(m, COV_THR);
    const pix = PIXEL.has(L.k) || L.k === "ai";
    const g = pix && cov ? maskClusters(m, grid.w, grid.h, 128, 9) : 0;
    const bb = maskBBox(m, grid.w, grid.h, COV_THR);
    const bbox = bb ? { x: Math.floor(bb.x / grid.s), y: Math.floor(bb.y / grid.s), w: Math.ceil(bb.w / grid.s), h: Math.ceil(bb.h / grid.s) } : null;
    const po = pix && cov ? this._pinDiscs(grid).filter((q) => discOverlap(m, grid.w, grid.h, q.x, q.y, q.r)).length : 0;
    return { cov, g, bbox, po };
  }
  /** → { ai, hand, trace, local: Mask, w, h, permille:{ ai, hand, trace, local } } (≤ 512 px, output space) */
  coverage() {
    const grid = this._covGrid(), n = grid.w * grid.h;
    const out = { ai: new Uint8Array(n), hand: new Uint8Array(n), trace: new Uint8Array(n), local: new Uint8Array(n) };
    for (const L of this.doc.layers) {
      if (!L || L.missing || L.opaque || !L.vis || !BASE_KINDS.has(L.k)) continue;
      const cat = L.k === "ai" ? "ai" : L.k === "tr" ? "trace" : PIXEL.has(L.k) ? "hand" : L.mask && L.mask.on ? "local" : null;
      if (!cat) continue;
      const m = this._layerCov(L, grid), dst = out[cat];
      for (let i = 0; i < n; i++) if (m[i] > dst[i]) dst[i] = m[i];
    }
    const pm = (m) => maskCoverage(m, COV_THR);
    return { ...out, w: grid.w, h: grid.h, permille: { ai: pm(out.ai), hand: pm(out.hand), trace: pm(out.trace), local: pm(out.local) } };
  }
  _bgMask(w, h) {
    const doc = this.doc, wa = doc.wa;
    const L = doc.layers.find((x) => x.mask && x.mask.src === "bg" && !x.missing);
    const m = new Uint8Array(w * h);
    if (L) {
      const [a, b, c, d, e, f] = this.geoMatrix(), det = a * d - b * c, s = w / this.outSize().w;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const X = (x + 0.5) / s - e, Y = (y + 0.5) / s - f;
        const mx = Math.floor((d * X - c * Y) / det - wa.x), my = Math.floor((-b * X + a * Y) / det - wa.y);
        m[y * w + x] = mx < 0 || my < 0 || mx >= wa.w || my >= wa.h ? 0 : L.mask.m[my * wa.w + mx];
      }
      return m;
    }
    const bw = Math.max(1, Math.round(w * 0.08)), bh = Math.max(1, Math.round(h * 0.08));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (x < bw || y < bh || x >= w - bw || y >= h - bh) m[y * w + x] = 255;
    return m;
  }
  /** → { mb, ct, sa, bg:[r,g,b,spread], bg0:[r,g,b,spread] } vs the base through the same geometry (‰ changes) */
  stats() {
    const a = this.outProxy(512), b = this.outProxy(512, { layers: false });
    const A = pxStats(a.d, a.w, a.h, null, 2), B = pxStats(b.d, b.w, b.h, null, 2);
    const rel = (x, y) => clamp(Math.round((1000 * (x - y)) / Math.max(1, y)), -1000, 1000);
    const m = this._bgMask(a.w, a.h);
    const Ab = pxStats(a.d, a.w, a.h, m, 2), Bb = pxStats(b.d, b.w, b.h, m, 2);
    const q = (s) => [Math.round(s.rgb[0]), Math.round(s.rgb[1]), Math.round(s.rgb[2]), Math.round(s.spread)];
    return { mb: rel(A.mean, B.mean), ct: rel(A.sd, B.sd), sa: rel(A.sat, B.sat), bg: q(Ab), bg0: q(Bb) };
  }
  /** ch "l"|"rgb"|"r"|"g"|"b"; below = layer index (the input of that layer) → { bins, mean, sd, median, clipLo, clipHi } (fractions) */
  histogram(ch = "l", { below = null } = {}) {
    const upto = below == null ? this._upto() : clamp(below | 0, 0, this._upto());
    const key = upto + "|" + this._sigs(upto, null, new Set()).join("\n") + "|" + JSON.stringify(this.doc.geo);
    let H = this._hist.get(key);
    if (!H) {
      const s = this._scaleFor(HIST_MAX), kp = this._proxyK();
      const src = this.below(upto, { proxy: kp < 1 && kp >= s });
      const T = this._warp(src, src.w / this.doc.wa.w, s);
      H = pxHistogram(T.read({ x: 0, y: 0, w: T.w, h: T.h }), T.w, T.h, 1);
      T.free();
      if (this._hist.size >= 4) this._hist.delete(this._hist.keys().next().value);
      this._hist.set(key, H);
    }
    let bins;
    if (ch === "rgb") { bins = new Uint32Array(256); for (let i = 0; i < 256; i++) bins[i] = H.r[i] + H.g[i] + H.b[i]; }
    else bins = H[ch] || H.l;
    let n = 0, s1 = 0, s2 = 0;
    for (let i = 0; i < 256; i++) { n += bins[i]; s1 += i * bins[i]; s2 += i * i * bins[i]; }
    if (!n) return { bins, mean: 0, sd: 0, median: 0, clipLo: 0, clipHi: 0 };
    const mean = s1 / n, sd = Math.sqrt(Math.max(0, s2 / n - mean * mean));
    let acc = 0, median = 0;
    for (let i = 0; i < 256; i++) { acc += bins[i]; if (acc >= n / 2) { median = i; break; } }
    return { bins, mean, sd, median, clipLo: bins[0] / n, clipHi: bins[255] / n };
  }
  /** → { r, g, b, l } mean of size × size at output px (x, y) */
  sample(x, y, size = 1) {
    const doc = this.doc, wa = doc.wa, comp = this.composite();
    const n = Math.max(1, size | 0), h = Math.floor(n / 2);
    let r = 0, g = 0, b = 0, c = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const p = this.outToBase(x - h + i + 0.5, y - h + j + 0.5);
      const px = Math.floor(p.x - wa.x), py = Math.floor(p.y - wa.y);
      if (px < 0 || py < 0 || px >= wa.w || py >= wa.h) continue;
      const d = comp.read({ x: px, y: py, w: 1, h: 1 });
      r += d[0]; g += d[1]; b += d[2]; c++;
    }
    if (!c) return { r: 0, g: 0, b: 0, l: 0 };
    r /= c; g /= c; b /= c;
    return { r: Math.round(r), g: Math.round(g), b: Math.round(b), l: Math.round(0.3 * r + 0.59 * g + 0.11 * b) };
  }
}

/** draws src into the surface dst; scaled draws use the browser's fast (low) smoothing, which is what a proxy needs (Surface.draw
 *  asks for "high", a slow software resample on CPU canvases) */
function drawScaled(dst, src, dx, dy, dw, dh, alpha, gco) {
  if (dst.ctx && (src.cv || src.getContext)) {
    const c = dst.ctx;
    c.save(); c.globalAlpha = alpha == null ? 1 : alpha; c.globalCompositeOperation = gco || "source-over";
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = "low";
    if (dw != null) c.drawImage(src.cv || src, dx, dy, dw, dh); else c.drawImage(src.cv || src, dx, dy);
    c.restore();
    return;
  }
  dst.draw(src, { dx, dy, dw: dw == null ? undefined : dw, dh: dh == null ? undefined : dh, alpha, gco });
}
/** writes rect r of surface S into a 2D context at (dx, dy) (optionally scaled to dw × dh with nearest sampling) */
function putRect(ctx, S, r, dx, dy, dw, dh) {
  if (S.cv) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = "copy"; ctx.drawImage(S.cv, r.x, r.y, r.w, r.h, dx, dy, dw || r.w, dh || r.h); ctx.restore(); return; }
  let d = S.read(r), w = r.w, h = r.h;
  if (dw && dh && (dw !== w || dh !== h)) {
    const o = new Uint8ClampedArray(dw * dh * 4);
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
      const sx = Math.min(w - 1, Math.floor(((x + 0.5) * w) / dw)), sy = Math.min(h - 1, Math.floor(((y + 0.5) * h) / dh));
      o.set(d.subarray((sy * w + sx) * 4, (sy * w + sx) * 4 + 4), (y * dw + x) * 4);
    }
    d = o; w = dw; h = dh;
  }
  const img = typeof ImageData === "function" ? new ImageData(d, w, h) : { data: d, width: w, height: h };
  ctx.putImageData(img, dx, dy);
}
void lutCompose;
