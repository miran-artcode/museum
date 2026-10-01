/* ============================================================
   이미지 다듬기: 브러시와 획 엔진 (spec §5.4 src-photo-brush.mjs, §5.7, §5.9): R2
   담당 B. 끝 모양·간격·필압·덮임 버퍼, 칠하기/필터/마스크 방식, 도구별 계산, 가장 큰 끝 반지름(mx).
   결과는 lk(작업 내역 키)만 들고 다니고 한글 문자열을 만들지 않는다.
   좌표: 작업 영역 px(wa-local, wa의 왼쪽 위가 0,0). PtrPt, 더러운 사각형, 원본 지점, 선택 마스크 모두 여기.
   흐름
   - begin: 대상 레이어(TOOL_TARGET)를 정하고 doc.beginEdit로 편집을 연다. 견본은 「현재 및 아래」 renderer.below(i + 1) 또는
     「모든 레이어」 renderer.composite()에서 128px 타일 단위로 처음 닿을 때 한 번 읽어 둔다(새로 칠한 픽셀을 다시 집지 않는다).
   - add: 점을 간격대로 찍고 덮임 버퍼(cov)를 갱신한 뒤, 닿은 사각형을 획 시작 픽셀 P₀·α₀와 타일별 F(견본)로 다시 계산해 쓴다.
     필터 방식: cov = max(cov, tip·flow). 칠하기 방식(마스크, 지우개): cov = cov + (1 − cov)·tip·flow. 둘 다 불투명도로 상한.
   - end: 복구 브러시는 푸아송 풀이, 먼지와 긁힘 지우기는 확산 채우기 또는 원본 찾기 + 푸아송으로 마무리하고 명령 하나를 확정한다.
   ============================================================ */
import {
  tipAlpha, gaussRGBA, unsharp, dodgeBurnLut, spongeFn, traceFn, poissonBlend, diffuseInpaint, spotSource, maskGrow, maskFeather, maskBBox,
} from "./src-photo-px.mjs";

/** @typedef {{tool:"spot"|"clone"|"heal"|"dodge"|"burn"|"sponge"|"bsb"|"shb"|"trace"|"mask"|"erase",
 *   size:number, hard:number, op:number, flow:number, spacing:number, press:"size"|"flow"|"off", smooth:number,
 *   sample:"below"|"all", aligned:boolean, range:0|1|2, exposure:number, protect:boolean,
 *   preset:1|2|3|4, strength:number, ce:number, maskMode:"paint"|"erase",
 *   dir?:1|-1, vib?:boolean}} StrokeOpts   dir/vib (added): 스펀지 채도 높이기 (1) · 낮추기 (−1, default), 활기 [true] */
/** @typedef {{rect:Rect|null, op:string, n:number, lk:string, mx:number, po?:number[]}} StrokeResult
 *   mx = largest dab radius, ‰ of the base short side; po (added) = indexes of 흔적 위치 pins (k 1) the stroke's coverage met */

export const TOOL_TARGET = {
  spot: ["px", "spot"], clone: ["px", "clone"], heal: ["px", "heal"], sponge: ["px", "sponge"], bsb: ["px", "bsb"],
  shb: ["px", "shb"], dodge: ["db", ""], burn: ["db", ""], trace: ["tr", ""], mask: [null, "mask"], erase: [null, "active"],
};
const LK = { spot: "spot", clone: "clone", heal: "heal", sponge: "sponge", bsb: "bsb", shb: "shb", dodge: "dodge", burn: "burn", trace: "trace", mask: "maskPaint", erase: "erase" };
const OPC = { burn: "dodge" };
const PIXEL_KINDS = new Set(["px", "tr", "db"]);
const MASKABLE = new Set(["ai", "px", "tr", "db", "adj", "flt"]);
const T = 64;    // tile size of the sample, start and F caches (small, so a frame entering new tiles stays cheap)
const key = (tx, ty) => ty * 65536 + tx;
const now = () => (typeof performance !== "undefined" && performance.now ? performance.now() : Date.now());
const clone = (v) => (v == null ? null : JSON.parse(JSON.stringify(v)));
const memErr = () => Object.assign(new Error("memory"), { code: "memory" });
const num = (v, d) => (typeof v === "number" && Number.isFinite(v) ? v : d);
const frac = (v, d) => { v = num(v, d); return v > 1 ? v / 100 : v; };
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const inter = (a, b) => {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y), x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
  return x1 > x && y1 > y ? { x, y, w: x1 - x, h: y1 - y } : null;
};
const union = (a, b) => {
  if (!a) return b ? { ...b } : null;
  if (!b) return { ...a };
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};
const grow = (r, m) => ({ x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m });

export class BrushEngine {
  constructor(doc, renderer) {
    this.doc = doc; this.renderer = renderer || null;
    this._s = null; this._src = null; this._off = null; this._tips = new Map(); this._cov = null; this._covW = 0; this._covH = 0;
    this.lastError = "";   // engine-level reason when begin() returns false without a doc code: "source" | "hidden" | "tool" | "memory"
    this.lookahead = true;   // prefetch the tiles the stroke is heading into on cheap frames (tests switch it off to compare)
  }
  get active() { return !!this._s; }
  /** clone/heal source (Alt+click or 「원본 지정」), given in wa-local px and kept in base px, so 여백 넓히기 afterwards (which moves
   *  the wa origin) does not move it (R2-16); resets the aligned offset */
  setSource(x, y) { const wa = this.doc.wa || { x: 0, y: 0 }; this._src = { x: num(x, 0) + wa.x, y: num(y, 0) + wa.y }; this._off = null; }

  /* ---------- target, edit and sampling ---------- */
  _target(o) {
    const doc = this.doc, [kind, t] = TOOL_TARGET[o.tool] || [null, ""];
    if (kind) {
      const L = doc.ensureLayer(kind, t || undefined);
      return L ? { L, plane: "px" } : null;
    }
    const L = doc.activeId ? (doc.layer ? doc.layer(doc.activeId) : doc.layers.find((x) => x.id === doc.activeId)) : null;
    if (!L) { doc.lastError = "base"; return null; }
    if (o.tool === "erase" && PIXEL_KINDS.has(L.k)) return { L, plane: "px" };
    if (!MASKABLE.has(L.k)) { doc.lastError = "base"; return null; }
    return { L, plane: "mask" };
  }
  _sampler(idx, all) {
    const r = this.renderer, doc = this.doc;
    let surf = null;
    const fetch = () => {
      if (r) return all ? r.composite() : r.below(idx + 1);
      return doc.base;
    };
    return {
      read: (rect) => {
        if (!surf || !(surf.w > 0)) surf = fetch();
        if (!surf) return new Uint8ClampedArray(rect.w * rect.h * 4);
        if (!r && doc.wa) {   // no renderer: the base, shifted into wa-local px (tests)
          const out = new Uint8ClampedArray(rect.w * rect.h * 4), q = { x: rect.x + doc.wa.x, y: rect.y + doc.wa.y, w: rect.w, h: rect.h };
          const c = inter(q, { x: 0, y: 0, w: surf.w, h: surf.h });
          if (!c) return out;
          const d = surf.read(c);
          for (let y = 0; y < c.h; y++) out.set(d.subarray(y * c.w * 4, (y + 1) * c.w * 4), ((c.y - q.y + y) * rect.w + (c.x - q.x)) * 4);
          return out;
        }
        return surf.read(rect);
      },
    };
  }

  /** @returns {boolean} false when nothing is paintable (base, locked, hidden, zone limit, memory, no source); doc.lastError says why */
  begin(o, p) {
    const doc = this.doc;
    this.lastError = "";
    if (this._s) this.cancel();
    o = { ...(o || {}) };
    if (!TOOL_TARGET[o.tool]) { this.lastError = "tool"; return false; }
    if ((o.tool === "clone" || o.tool === "heal") && !this._src) { this.lastError = "source"; return false; }
    const tg = this._target(o);
    if (!tg) { if (!doc.lastError) doc.lastError = "limit"; return false; }
    const L = tg.L;
    if (L.vis === 0) { this.lastError = "hidden"; return false; }
    let ed;
    try { ed = doc.beginEdit(L.id, tg.plane); } catch (e) { if (!doc.lastError) doc.lastError = (e && e.code) || "base"; return false; }
    const wa = doc.wa || { x: 0, y: 0, w: doc.w, h: doc.h };
    if (!this._cov || this._covW !== wa.w || this._covH !== wa.h) { this._cov = new Float32Array(wa.w * wa.h); this._covW = wa.w; this._covH = wa.h; }
    const idx = doc.indexOf ? doc.indexOf(L.id) : doc.layers.indexOf(L);
    const tool = o.tool, paint = tool === "mask" || tool === "erase";
    const tf = tool === "trace" ? traceFn(o.preset || 1, frac(o.strength, 0.4), ((L.id * 2654435761) ^ 0x5eed) >>> 0) : null;
    if (tf && tf.hard) { o.hard = 1; o.spacing = tf.spacing; o.size = Math.max(1, Math.min(tf.maxSize, num(o.size, 4))); }
    const s = {
      o, ed, L, plane: tg.plane, idx, wa, tool, paint, tf,
      op: Math.max(0, Math.min(1, frac(o.op, 1))), flow: Math.max(0.01, Math.min(1, frac(o.flow, 1))),
      sampler: this._sampler(idx, o.sample === "all"), samp: new Map(), start: new Map(), F: new Map(),
      n: 0, rect: null, mxPx: 0, last: null, ema: null, rem: 0, press: null, off: null, pinHit: new Set(), vel: null, frameLast: null,
      mode: paint ? (tool === "erase" ? "erase" : o.maskMode === "erase" ? "erase" : "paint") : "filter",
    };
    if (tool === "dodge" || tool === "burn") {
      const e = frac(o.exposure, 0.15) * (tool === "burn" ? -1 : 1);
      s.lut = dodgeBurnLut(num(o.range, 1), e);
    }
    if (tool === "sponge") s.sponge = spongeFn(num(o.dir, -1) < 0 ? -1 : 1, o.vib !== false);
    this._s = s;
    this.add([p]);
    if (!this._s) { if (!doc.lastError) doc.lastError = "memory"; this.lastError = "memory"; return false; }
    if (this.lookahead) { try { this._prefetch(12); } catch (e) { /* the frames do the work themselves */ } }
    return true;
  }
  /** current dab diameter for pressure pr */
  _diam(pr) {
    const o = this._s.o, pc = Math.pow(clamp01(pr == null ? 1 : pr), 0.75);
    return Math.max(1, Math.round(num(o.size, 20) * (o.press === "size" ? 0.25 + 0.75 * pc : 1)));
  }

  /* ---------- dabs ---------- */
  _tip(D, hard) {
    const key = D + ":" + Math.round(clamp01(frac(hard, 0.5)) * 20);
    let t = this._tips.get(key);
    if (!t) {
      t = tipAlpha(D, Math.round(clamp01(frac(hard, 0.5)) * 20) / 20);
      this._tips.set(key, t);
      if (this._tips.size > 40) this._tips.delete(this._tips.keys().next().value);
    }
    return t;
  }
  _dab(x, y, pr) {
    const s = this._s, o = s.o, cov = this._cov, W = this._covW, H = this._covH;
    const pc = Math.pow(clamp01(pr), 0.75);
    const sizeK = o.press === "size" ? 0.25 + 0.75 * pc : 1, flowK = o.press === "flow" ? pc : 1;
    const D = Math.max(1, Math.round(num(o.size, 20) * sizeK)), tip = this._tip(D, o.hard), f = s.flow * flowK;
    const x0 = Math.round(x - D / 2), y0 = Math.round(y - D / 2);
    const r = inter({ x: x0, y: y0, w: D, h: D }, { x: 0, y: 0, w: W, h: H });
    s.n++;
    s.mxPx = Math.max(s.mxPx, D / 2);
    if (!r) return null;
    if ((s.tool === "clone" || s.tool === "heal") && !s.off) {
      const wa = this.doc.wa || { x: 0, y: 0 }, sx = this._src.x - wa.x, sy = this._src.y - wa.y;
      if (!this._off || o.aligned === false) this._off = { x: Math.round(sx - x), y: Math.round(sy - y) };   // 정렬 [on]
      s.off = { ...this._off };
    }
    const sel = this.doc.sel && this.doc.sel.m && this.doc.sel.m.length === W * H ? this.doc.sel.m : null, filt = s.mode === "filter";
    for (let yy = r.y; yy < r.y + r.h; yy++) {
      let ti = (yy - y0) * D + (r.x - x0), i = yy * W + r.x;
      for (let xx = 0; xx < r.w; xx++, ti++, i++) {
        let a = tip[ti] * f;
        if (!(a > 0)) continue;
        if (sel) { a *= sel[i] / 255; if (!(a > 0)) continue; }
        if (filt) { if (a > cov[i]) cov[i] = a; }
        else cov[i] += (1 - cov[i]) * a;
      }
    }
    return r;
  }
  /** pts PtrPt[] → Rect | null (dirty rect, wa-local px) */
  add(pts) {
    const s = this._s;
    if (!s) return null;
    const tA = now(), o = s.o, sm = Math.max(0, Math.min(10, num(o.smooth, 0))), k = 1 - sm * 0.085;
    let dirty = null;
    for (const q of pts || []) {
      if (!q || !Number.isFinite(q.x) || !Number.isFinite(q.y)) continue;
      const pr = q.p > 0 ? q.p : s.press != null ? s.press : 0.5;
      s.press = pr;
      let x = q.x, y = q.y;
      if (s.ema && sm > 0) { x = s.ema.x + (x - s.ema.x) * k; y = s.ema.y + (y - s.ema.y) * k; }
      s.ema = { x, y };
      if (!s.last) { dirty = union(dirty, this._dab(x, y, pr)); s.last = { x, y, p: pr }; s.rem = 0; continue; }
      const dx = x - s.last.x, dy = y - s.last.y, dist = Math.hypot(dx, dy);
      if (dist <= 0) continue;
      const D = Math.max(1, num(o.size, 20) * (o.press === "size" ? 0.25 + 0.75 * Math.pow(clamp01(pr), 0.75) : 1));
      const sp = num(o.spacing, 0.25), step = Math.max(0.5, (sp > 2 ? sp / 100 : sp) * D);   // fraction 0.01–2, or percent above 2
      let t = step - s.rem;
      while (t <= dist) {
        const u = t / dist;
        dirty = union(dirty, this._dab(s.last.x + dx * u, s.last.y + dy * u, s.last.p + (pr - s.last.p) * u));
        t += step;
      }
      s.rem = dist - (t - step);
      s.last = { x, y, p: pr };
    }
    if (s.frameLast && s.last) s.vel = { x: s.last.x - s.frameLast.x, y: s.last.y - s.frameLast.y };
    if (s.last) s.frameLast = { x: s.last.x, y: s.last.y };
    if (!dirty) return null;
    let ok = false;
    try { ok = this._compose(dirty); } catch (e) { ok = false; }
    if (!ok) { this.cancel(); this.doc.lastError = "memory"; this.lastError = "memory"; return null; }
    s.rect = union(s.rect, dirty);
    this._pins(dirty);
    const spent = now() - tA;
    if (this.lookahead && spent < 4) { try { this._prefetch(Math.min(5, 9 - spent)); } catch (e) { /* the next frame does it */ } }
    return dirty;
  }

  /* ---------- caches ---------- */
  _tiles(r, fn) {
    const tx0 = Math.floor(r.x / T), ty0 = Math.floor(r.y / T), tx1 = Math.floor((r.x + r.w - 1) / T), ty1 = Math.floor((r.y + r.h - 1) / T);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) fn(tx, ty);
  }
  _tileRect(tx, ty) { return inter({ x: tx * T, y: ty * T, w: T, h: T }, { x: 0, y: 0, w: this._covW, h: this._covH }); }
  /** one sample tile, read on first use */
  _sampleTile(tx, ty) {
    const s = this._s, k = key(tx, ty);
    let t = s.samp.get(k);
    if (!t) { const tr = this._tileRect(tx, ty); t = { r: tr, d: s.sampler.read(tr) }; s.samp.set(k, t); }
    return t;
  }
  /** sample pixels of any rect (outside wa: transparent), read per tile on first use */
  _sample(r) {
    const out = new Uint8ClampedArray(r.w * r.h * 4), c = inter(r, { x: 0, y: 0, w: this._covW, h: this._covH });
    if (!c) return out;
    this._tiles(c, (tx, ty) => {
      const t = this._sampleTile(tx, ty), q = inter(t.r, c);
      for (let y = 0; y < q.h; y++) {
        const src = ((q.y - t.r.y + y) * t.r.w + (q.x - t.r.x)) * 4;
        out.set(t.d.subarray(src, src + q.w * 4), ((q.y - r.y + y) * r.w + (q.x - r.x)) * 4);
      }
    });
    return out;
  }
  /** the target plane's stroke-start pixels of a tile (RGBA; a mask plane carries the mask in alpha) */
  _startTile(tx, ty) {
    const s = this._s, k = key(tx, ty);
    let t = s.start.get(k);
    if (!t) {
      const tr = this._tileRect(tx, ty);
      this._sampleTile(tx, ty);   // every painted tile is sampled before it changes, so it is never re-sampled with fresh paint
      t = { r: tr, d: s.ed.surface.read(tr) };
      s.start.set(k, t);
    }
    return t;
  }
  /** F (the tool's target colour) of a tile: RGBA, alpha 255 where valid */
  _fTile(tx, ty) {
    const s = this._s, k = key(tx, ty);
    let t = s.F.get(k);
    if (t) return t;
    const tr = this._tileRect(tx, ty), tool = s.tool, n = tr.w * tr.h;
    let F;
    if (tool === "spot") { F = new Uint8ClampedArray(n * 4); for (let i = 0; i < n; i++) { F[i * 4] = 255; F[i * 4 + 3] = 255; } }
    else if (tool === "clone") F = this._sample({ x: tr.x + s.off.x, y: tr.y + s.off.y, w: tr.w, h: tr.h });
    else if (tool === "heal") F = this._healLive(tr);
    else if (tool === "bsb" || tool === "shb" || (tool === "trace" && s.tf.blur)) {
      const sigma = tool === "bsb" ? 0.5 + 3.5 * frac(s.o.strength, 0.4) : tool === "shb" ? 1 : s.tf.blur, m = Math.ceil(3 * sigma) + 1;
      const E = grow(tr, m), reg = this._sample(E), inner = { x: m, y: m, w: tr.w, h: tr.h };
      if (tool === "shb") {
        const cp = reg.slice();
        unsharp(cp, E.w, E.h, { a: 200 * frac(s.o.strength, 0.4), r: 10, th: 2 }, inner, reg);
        F = new Uint8ClampedArray(n * 4);
        for (let y = 0; y < tr.h; y++) F.set(cp.subarray(((m + y) * E.w + m) * 4, ((m + y) * E.w + m + tr.w) * 4), y * tr.w * 4);
      } else F = gaussRGBA(reg, E.w, E.h, sigma, inner);
      if (tool === "trace") this._perPixel(F, tr, (r, g, b, x, y) => s.tf(r, g, b, x, y));
    } else {
      F = this._sampleTile(tx, ty).d.slice();
      if (tool === "dodge" || tool === "burn") {   // inline (the retouch frame budget): LUT, or LUT on luma only (색조 보호)
        const lut = s.lut, prot = s.o.protect !== false;
        for (let i = 0; i < n * 4; i += 4) {
          if (!F[i + 3]) continue;
          const r = F[i], g = F[i + 1], b = F[i + 2];
          if (prot) { const Y = 0.299 * r + 0.587 * g + 0.114 * b, d = lut[(Y + 0.5) | 0] - Y; F[i] = r + d; F[i + 1] = g + d; F[i + 2] = b + d; }
          else { F[i] = lut[r]; F[i + 1] = lut[g]; F[i + 2] = lut[b]; }
        }
      } else if (tool === "sponge") this._perPixel(F, tr, s.sponge);
      else if (tool === "trace") this._perPixel(F, tr, (r, g, b, x, y) => s.tf(r, g, b, x, y));
    }
    for (let i = 0; i < n; i++) if (F[i * 4 + 3] > 0) F[i * 4 + 3] = 255;   // a sample is opaque or invalid (outside wa)
    t = { r: tr, d: F };
    s.F.set(k, t);
    return t;
  }
  /** look-ahead on cheap frames (perf R2): the sample, start and F tiles that the next three dabs reach along the stroke's
   *  per-frame motion are prepared, nearest first, until `budget` ms are spent, so the frame that reaches them does not pay for
   *  them. It only reads: the doc's history tiles are touched by the frame that paints them, so undo records stay minimal. */
  _prefetch(budget) {
    const s = this._s;
    if (!s || !s.last || !(budget > 0)) return;
    const t0 = now(), v = s.vel || { x: 0, y: 0 }, R = this._diam(s.press) / 2 + 2, W = this._covW, H = this._covH, cands = [], seen = new Set();
    for (const k of s.vel ? [1, 2, 3] : [0]) {
      const cx = s.last.x + v.x * k, cy = s.last.y + v.y * k;
      const r = inter({ x: Math.floor(cx - R), y: Math.floor(cy - R), w: Math.ceil(2 * R) + 1, h: Math.ceil(2 * R) + 1 }, { x: 0, y: 0, w: W, h: H });
      if (!r) continue;
      this._tiles(r, (tx, ty) => {
        const kk = key(tx, ty);
        if (seen.has(kk)) return;
        seen.add(kk);
        cands.push([Math.hypot((tx + 0.5) * T - cx, (ty + 0.5) * T - cy) + k * T, tx, ty]);
      });
    }
    cands.sort((a, b) => a[0] - b[0]);
    for (const [, tx, ty] of cands) {
      if (now() - t0 > budget) return;
      const kk = key(tx, ty);
      if (!s.start.has(kk)) this._startTile(tx, ty);
      if (s.mode === "filter" && !s.F.has(kk) && now() - t0 <= budget) this._fTile(tx, ty);
    }
  }
  _perPixel(F, tr, fn) {
    const ox = this._s.wa.x, oy = this._s.wa.y;
    for (let y = 0; y < tr.h; y++) for (let x = 0; x < tr.w; x++) {
      const i = (y * tr.w + x) * 4;
      if (!F[i + 3]) continue;
      const o = fn(F[i], F[i + 1], F[i + 2], tr.x + x + ox, tr.y + y + oy);
      F[i] = o[0]; F[i + 1] = o[1]; F[i + 2] = o[2];
    }
  }
  /** live 복구 브러시: frequency separation blur(T, σ) + (S − blur(S, σ)), σ = r/2 (≤ 12 while painting) */
  _healLive(tr) {
    const s = this._s, sigma = Math.max(0.5, Math.min(12, num(s.o.size, 20) / 4)), m = Math.ceil(3 * sigma) + 1;
    const E = grow(tr, m), Tg = this._sample(E), Sg = this._sample({ x: E.x + s.off.x, y: E.y + s.off.y, w: E.w, h: E.h });
    const inner = { x: m, y: m, w: tr.w, h: tr.h }, bT = gaussRGBA(Tg, E.w, E.h, sigma, inner), bS = gaussRGBA(Sg, E.w, E.h, sigma, inner);
    const F = new Uint8ClampedArray(tr.w * tr.h * 4);
    for (let y = 0; y < tr.h; y++) for (let x = 0; x < tr.w; x++) {
      const i = (y * tr.w + x) * 4, j = ((m + y) * E.w + m + x) * 4;
      if (!Sg[j + 3] || !Tg[j + 3]) continue;
      F[i] = bT[i] + Sg[j] - bS[i]; F[i + 1] = bT[i + 1] + Sg[j + 1] - bS[i + 1]; F[i + 2] = bT[i + 2] + Sg[j + 2] - bS[i + 2]; F[i + 3] = 255;
    }
    return F;
  }

  /* ---------- compose and write ---------- */
  /** recompute rect r from P₀ and F with the coverage (or an override {cov: Float32Array(r), F: RGBA(r)}) and write it */
  _compose(r, ov = null) {
    const s = this._s, W = this._covW, out = new Uint8ClampedArray(r.w * r.h * 4), opk = s.op, mode = s.mode;
    if (!s.ed.touch(r)) return false;
    const spotK = s.tool === "spot" && !ov ? 0.4 : 1, C = ov ? ov.cov : this._cov;
    this._tiles(r, (tx, ty) => {
      const st = this._startTile(tx, ty), q = inter(st.r, r);
      if (!q) return;
      const P = st.d, Ft = mode === "filter" && !ov ? this._fTile(tx, ty) : null, Fd = Ft ? Ft.d : ov ? ov.F : null;
      for (let y = q.y; y < q.y + q.h; y++) {
        let si = ((y - st.r.y) * st.r.w + (q.x - st.r.x)) * 4, oi = ((y - r.y) * r.w + (q.x - r.x)) * 4;
        let ci = ov ? (y - r.y) * r.w + (q.x - r.x) : y * W + q.x, fi = Ft ? ((y - Ft.r.y) * Ft.r.w + (q.x - Ft.r.x)) * 4 : oi;
        for (let x = 0; x < q.w; x++, si += 4, oi += 4, ci++, fi += 4) {
          let c = C[ci];
          if (c > opk) c = opk;
          c *= spotK;
          const p3 = P[si + 3];
          if (!(c > 0)) { out[oi] = P[si]; out[oi + 1] = P[si + 1]; out[oi + 2] = P[si + 2]; out[oi + 3] = p3; continue; }
          if (mode === "paint") { out[oi] = out[oi + 1] = out[oi + 2] = 255; out[oi + 3] = p3 + (255 - p3) * c; continue; }   // mask plane: alpha = mask
          if (mode === "erase") { out[oi] = P[si]; out[oi + 1] = P[si + 1]; out[oi + 2] = P[si + 2]; out[oi + 3] = p3 * (1 - c); continue; }
          const ca = (c * Fd[fi + 3]) / 255, a0 = p3 / 255, oa = a0 * (1 - ca) + ca;
          if (!(oa > 0)) { out[oi] = out[oi + 1] = out[oi + 2] = out[oi + 3] = 0; continue; }
          const k0 = (a0 * (1 - ca)) / oa, k1 = ca / oa;
          out[oi] = P[si] * k0 + Fd[fi] * k1; out[oi + 1] = P[si + 1] * k0 + Fd[fi + 1] * k1; out[oi + 2] = P[si + 2] * k0 + Fd[fi + 2] * k1; out[oi + 3] = oa * 255;
        }
      }
    });
    s.ed.surface.write(r, out);
    if (this.renderer && typeof this.renderer.invalidate === "function") { try { this.renderer.invalidate(r, s.idx); } catch (e) { /* display only */ } }
    return true;
  }
  /** 흔적 위치 pins (k 1) whose disc (2 % of the base short side) the stroke's coverage meets, for px, tr and db targets */
  _pins(r) {
    const s = this._s, doc = this.doc;
    if (s.plane !== "px" || !Array.isArray(doc.pins) || !doc.pins.length) return;
    const W = this._covW, H = this._covH, rad = 0.02 * Math.min(doc.w, doc.h), cov = this._cov;
    doc.pins.forEach((pin, i) => {
      if (!pin || pin.k !== 1 || s.pinHit.has(i)) return;
      const cx = (pin.x / 1000) * doc.w - s.wa.x, cy = (pin.y / 1000) * doc.h - s.wa.y;
      const b = inter({ x: Math.floor(cx - rad), y: Math.floor(cy - rad), w: Math.ceil(2 * rad) + 1, h: Math.ceil(2 * rad) + 1 }, inter(r, { x: 0, y: 0, w: W, h: H }) || { x: 0, y: 0, w: 0, h: 0 });
      if (!b) return;
      for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) {
        if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= rad * rad && cov[y * W + x] >= 0.25) { s.pinHit.add(i); return; }
      }
    });
  }

  /* ---------- end ---------- */
  /** → Promise<StrokeResult>; heal/spot solve here; pushes one "out" command with a log delta and raises the layer's mx */
  async end() {
    const s = this._s;
    if (!s) return { rect: null, op: "", n: 0, lk: "", mx: 0 };
    const doc = this.doc, op = s.tool === "mask" ? "mask" : OPC[s.tool] || s.tool, lk = LK[s.tool] || s.tool;
    let rect = s.rect;
    try {
      if (rect && s.tool === "heal") rect = this._healEnd(rect);
      else if (rect && s.tool === "spot") rect = this._spotEnd(rect);
    } catch (e) {
      // R2-09: a solve or final write that fails (memory) never commits the live preview (spot's red overlay): restore and report
      this.cancel();
      doc.lastError = "memory"; this.lastError = "memory";
      return { rect: null, op, n: s.n, lk, mx: 0 };
    }
    // R2-04: the trace layer's preset (p.pr) and card cell (ce) change only with a committed stroke, carried in its pixel command
    // (C's ed.commit(lk, log, {props}), DOC12: applied at commit, undone/redone with the pixels; merged rows keep the first
    // before and the last after)
    const props = [];
    if (s.tool === "trace" && rect) {
      const pr = s.tf ? s.tf.preset : 1, ce = Number.isFinite(s.o.ce) ? Math.max(0, Math.round(s.o.ce)) : s.L.ce || 0;
      if (!s.L.p || s.L.p.pr !== pr) props.push(["p", clone(s.L.p), { ...(s.L.p || {}), pr }]);
      if ((s.L.ce || 0) !== ce) props.push(["ce", s.L.ce || 0, ce]);
    }
    const short = Math.max(1, Math.min(doc.w, doc.h)), mx = Math.min(1000, Math.ceil((s.mxPx * 1000) / short - 1e-9));
    let a = 0;
    if (rect) {
      let k = 0;
      const W = this._covW, cov = this._cov;
      for (let y = rect.y; y < rect.y + rect.h; y++) for (let x = rect.x; x < rect.x + rect.w; x++) if (cov[y * W + x] >= 0.5) k++;
      const o = doc.outSize ? doc.outSize() : { w: doc.w, h: doc.h };
      a = Math.min(1000, Math.round((k * 1000) / Math.max(1, o.w * o.h)));
    }
    const log = { o: op, n: 1, a };
    if (s.plane === "px") log.mx = mx;
    this._clearCov(s.rect);
    this._s = null;
    if (rect) s.ed.commit(lk, log, props.length ? { props } : undefined); else s.ed.cancel();
    const res = { rect: rect || null, op, n: s.n, lk, mx: s.plane === "px" ? mx : 0 };
    if (s.pinHit.size) res.po = [...s.pinHit].sort((x, y) => x - y);
    return res;
  }
  cancel() {
    const s = this._s;
    if (!s) return;
    this._s = null;
    try { s.ed.cancel(); } catch (e) { /* already closed */ }
    this._clearCov(s.rect);
    if (s.rect && this.renderer && typeof this.renderer.invalidate === "function") { try { this.renderer.invalidate(s.rect, s.idx); } catch (e) { /* display only */ } }
  }
  _clearCov(r) {
    if (!r || !this._cov) return;
    const W = this._covW;
    for (let y = r.y; y < r.y + r.h; y++) this._cov.fill(0, y * W + r.x, y * W + r.x + r.w);
  }
  /** region covering r plus margin, clipped to wa, with the coverage there */
  _region(r, m) {
    const W = this._covW, H = this._covH, B = inter(grow(r, m), { x: 0, y: 0, w: W, h: H });
    const c = new Float32Array(B.w * B.h);
    for (let y = 0; y < B.h; y++) c.set(this._cov.subarray((B.y + y) * W + B.x, (B.y + y) * W + B.x + B.w), y * B.w);
    return { B, c };
  }
  /** 복구 브러시 at pointerup: Poisson over the stroke bbox + 2 px per channel, Ω = cov > 0.5; result alpha = the (soft) coverage */
  _healEnd(rect) {
    const s = this._s, { B, c } = this._region(rect, 2), n = B.w * B.h;
    const Td = this._sample(B), Sd = this._sample({ x: B.x + s.off.x, y: B.y + s.off.y, w: B.w, h: B.h }), M = new Uint8Array(n);
    for (let y = 1; y < B.h - 1; y++) for (let x = 1; x < B.w - 1; x++) { const i = y * B.w + x; if (c[i] > 0.5 && Sd[i * 4 + 3]) M[i] = 1; }
    const Sp = [0, 1, 2].map((ch) => { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = Sd[i * 4 + ch]; return a; });
    const Tp = [0, 1, 2].map((ch) => { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = Td[i * 4 + ch]; return a; });
    const f = poissonBlend(Sp, Tp, M, B.w, B.h, { maxIter: 2000, tol: 0.05 }), F = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) { F[i * 4] = f[0][i]; F[i * 4 + 1] = f[1][i]; F[i * 4 + 2] = f[2][i]; F[i * 4 + 3] = Td[i * 4 + 3] ? 255 : 0; }
    if (!this._compose(B, { cov: c, F })) throw memErr();
    return B;
  }
  /** 먼지와 긁힘 지우기 at pointerup: hole = cov > 0.5 grown 2 px; smaller side ≤ 12 px → diffusion fill, else the best source of
   *  spotSource and a Poisson blend; written with the hole feathered by 1 px */
  _spotEnd(rect) {
    const s = this._s, W = this._covW, H = this._covH, { B, c } = this._region(rect, 4), n = B.w * B.h;
    let hole = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (c[i] > 0.5) hole[i] = 255;
    hole = maskGrow(hole, B.w, B.h, 2);
    const hb = maskBBox(hole, B.w, B.h, 128);
    const zero = new Float32Array(n);
    if (!hb) { if (!this._compose(B, { cov: zero, F: new Uint8ClampedArray(n * 4) })) throw memErr(); return B; }
    let F;
    if (Math.min(hb.w, hb.h) <= 12) {
      F = this._sample(B);
      const h01 = new Uint8Array(n);
      for (let i = 0; i < n; i++) h01[i] = hole[i] >= 128 ? 1 : 0;
      diffuseInpaint(F, B.w, B.h, h01, null);
    } else {
      const r = Math.max(hb.w, hb.h) / 2, m = Math.ceil(2.5 * r + r + 6);
      const E = inter(grow(B, m), { x: 0, y: 0, w: W, h: H }), big = this._sample(E), bh = new Uint8Array(E.w * E.h);
      for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) if (hole[y * B.w + x] >= 128) bh[(B.y - E.y + y) * E.w + (B.x - E.x + x)] = 1;
      const src = spotSource(big, E.w, E.h, bh, { x: hb.x + B.x - E.x, y: hb.y + B.y - E.y, w: hb.w, h: hb.h }, r);
      const Td = this._sample(B);
      if (!Number.isFinite(src.score)) {
        F = Td;
        const h01 = new Uint8Array(n);
        for (let i = 0; i < n; i++) h01[i] = hole[i] >= 128 ? 1 : 0;
        diffuseInpaint(F, B.w, B.h, h01, null);
      } else {
        const Sd = this._sample({ x: B.x + src.dx, y: B.y + src.dy, w: B.w, h: B.h }), M = new Uint8Array(n);
        for (let y = 1; y < B.h - 1; y++) for (let x = 1; x < B.w - 1; x++) { const i = y * B.w + x; if (hole[i] >= 128) M[i] = 1; }
        const Sp = [0, 1, 2].map((ch) => { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = Sd[i * 4 + ch]; return a; });
        const Tp = [0, 1, 2].map((ch) => { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = Td[i * 4 + ch]; return a; });
        const f = poissonBlend(Sp, Tp, M, B.w, B.h, { maxIter: 2000, tol: 0.05 });
        F = new Uint8ClampedArray(n * 4);
        for (let i = 0; i < n; i++) { F[i * 4] = f[0][i]; F[i * 4 + 1] = f[1][i]; F[i * 4 + 2] = f[2][i]; F[i * 4 + 3] = Td[i * 4 + 3]; }
      }
    }
    for (let i = 0; i < n; i++) F[i * 4 + 3] = F[i * 4 + 3] ? 255 : 0;
    const soft = maskFeather(hole, B.w, B.h, 1), cv = new Float32Array(n);
    for (let i = 0; i < n; i++) cv[i] = soft[i] / 255;
    const sel = this.doc.sel && this.doc.sel.m && this.doc.sel.m.length === W * H ? this.doc.sel.m : null;
    if (sel) for (let y = 0; y < B.h; y++) for (let x = 0; x < B.w; x++) cv[y * B.w + x] *= sel[(B.y + y) * W + B.x + x] / 255;   // R2-11
    if (!this._compose(B, { cov: cv, F })) throw memErr();
    return B;
  }
}
