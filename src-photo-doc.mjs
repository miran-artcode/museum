/* ============================================================
   이미지 다듬기: 문서 모델·그래픽 면·작업 내역 (spec §5.4 src-photo-doc.mjs, §5.5, §5.8, §5.10, §5.11, §5.13, §6.6, §6.8)
   담당 C. 한글 문자열 없음: 명령은 작업 내역 키 lk(와 수 ln)만, lastError는 코드만 갖는다(문장은 src-photo-text.mjs).

   좌표 (contract-log DOC1):
   · 기준 px(B): 생성 원본의 0..w, 0..h. LayerRec.bx, doc.crop, doc.cal, 핀은 여기(핀은 ‰).
   · 작업 영역 wa = 여백 넓히기로 B를 넓힌 사각형(기준 px, 원점이 음수일 수 있음).
   · 작업 영역 px(wa-local): wa의 왼쪽 위가 0,0. 마스크·선택(Uint8Array wa.w×wa.h), beginEdit의 면, PtrPt, 더러운 사각형은 여기.
   · 픽셀 레이어의 면은 bx 크기(기준 px 사각형)이고, beginEdit는 그 위에 wa-local 주소의 대리 면을 씌운다.
   ============================================================ */
import { KINDS, TCODE, ZONE, LIMITS, STAGES, OPS, T_RANK, BLENDS, KEYS, pOk, mkRef, stamp36 } from "./src-folio-schema.mjs";
import { jsonBytes } from "./src-portfolio-core.mjs";
import {
  maskCombine, maskFeather, maskGrow, maskInvert, maskBBox, backgroundMask, rleEncode, rleDecode,
} from "./src-photo-px.mjs";

export const TILE = 128;
const GROW = 256;
const FULL_PX = 4200000;   // a first pixel edit allocates the whole work area up to this size (desktop, memory permitting)
const PIXEL_KINDS = new Set(["px", "tr", "db"]);
const BASE_KINDS = new Set(["ai", "px", "tr", "db", "adj", "flt"]);
const OUT_KINDS = new Set(["txt", "ov"]);
const memErr = () => { const e = new Error("memory"); e.code = "memory"; return e; };
const clampI = (v, a, b) => Math.max(a, Math.min(b, Math.round(Number(v) || 0)));
const isPlain = (o) => !!o && typeof o === "object" && !Array.isArray(o) && Object.getPrototypeOf(o) === Object.prototype;
const rectI = (r) => ({ x: Math.floor(r.x), y: Math.floor(r.y), w: Math.max(0, Math.ceil(r.x + r.w) - Math.floor(r.x)), h: Math.max(0, Math.ceil(r.y + r.h) - Math.floor(r.y)) });
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
const eqRect = (a, b) => (!a && !b) || (!!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h);
const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

/* =====================================================================================================================
   Surfaces and Gfx
   @typedef {{w:number, h:number, cv:HTMLCanvasElement|null, ctx:CanvasRenderingContext2D|null,
     read(r:Rect):RGBA, write(r:Rect, d:RGBA):void, clear(r?:Rect):void,
     draw(src, o?:{dx?:number, dy?:number, dw?:number, dh?:number, alpha?:number, gco?:string}):void,
     resize(w:number, h:number, keepOffset?:{x:number,y:number}):void, free():void, fill(rgb:number[], r?:Rect):void}} Surface
   @typedef {{surface(w:number,h:number, tag?:string):Surface, fromImage(img:CanvasImageSource):Surface, bytes():number,
     lowMem:boolean, touch:boolean, limit:number, reclaim:(()=>void)|null, fits(need:number):boolean}} Gfx
   ===================================================================================================================== */
function guard(gfx, need) {
  if (gfx.bytes() + need <= gfx.limit) return true;
  if (typeof gfx.reclaim === "function") { try { gfx.reclaim(); } catch (e) { /* ignore */ } }
  return gfx.bytes() + need <= gfx.limit;
}

/** canvas-backed; tracks bytes; free() sets width = height = 0; throws {code:"memory"} past LIMITS.canvasBytes (after reclaim) */
export function makeGfx({ lowMem = false, touch = false } = {}) {
  let total = 0;
  const gfx = {
    lowMem, touch, reclaim: null,
    limit: touch || lowMem ? LIMITS.canvasBytes.touch : LIMITS.canvasBytes.desk,
    bytes() { return total; },
    fits(need) { return guard(gfx, need); },
    /** counts canvases made outside gfx (display, marks, UI) in bytes() (R2-17); untrack with the same number */
    track(n) { total += Math.max(0, n | 0); },
    untrack(n) { total = Math.max(0, total - Math.max(0, n | 0)); },
    surface(w, h) { return mk(w, h); },
    fromImage(img) {
      const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
      const s = mk(w, h);
      s.ctx.drawImage(img, 0, 0);
      return s;
    },
  };
  const alloc = (w, h) => {
    const cv = document.createElement("canvas");
    cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d", { willReadFrequently: true });
    if (!ctx || cv.width !== w || cv.height !== h) { cv.width = cv.height = 0; return null; }
    return { cv, ctx };
  };
  const mk = (w0, h0) => {
    const w = Math.max(1, Math.round(w0)), h = Math.max(1, Math.round(h0));
    if (!guard(gfx, w * h * 4)) throw memErr();
    let a = alloc(w, h);
    if (!a && typeof gfx.reclaim === "function") { gfx.reclaim(); a = alloc(w, h); }
    if (!a) throw memErr();
    const { cv, ctx } = a;
    let bytes = w * h * 4;
    total += bytes;
    const s = {
      w, h, cv, ctx,
      read(r) {
        if (r.w <= 0 || r.h <= 0) return new Uint8ClampedArray(0);
        return ctx.getImageData(r.x, r.y, r.w, r.h).data;
      },
      write(r, d) {
        if (r.w <= 0 || r.h <= 0) return;
        ctx.putImageData(new ImageData(d instanceof Uint8ClampedArray ? d : new Uint8ClampedArray(d), r.w, r.h), r.x, r.y);
      },
      clear(r) { if (r) ctx.clearRect(r.x, r.y, r.w, r.h); else ctx.clearRect(0, 0, cv.width, cv.height); },
      fill(rgb, r) {
        ctx.save(); ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
        ctx.fillStyle = "rgb(" + (rgb[0] | 0) + "," + (rgb[1] | 0) + "," + (rgb[2] | 0) + ")";
        if (r) ctx.fillRect(r.x, r.y, r.w, r.h); else ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.restore();
      },
      draw(src, o = {}) {
        const img = src && src.cv ? src.cv : src;
        if (!img) return;
        ctx.save();
        ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
        ctx.globalCompositeOperation = o.gco || "source-over";
        if (o.dw != null) {
          ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, o.dx || 0, o.dy || 0, o.dw, o.dh);
        } else ctx.drawImage(img, o.dx || 0, o.dy || 0);
        ctx.restore();
      },
      resize(w2, h2, keep) {
        w2 = Math.max(1, Math.round(w2)); h2 = Math.max(1, Math.round(h2));
        const need = w2 * h2 * 4 - bytes;
        if (need > 0 && !guard(gfx, need + bytes)) throw memErr();   // the copy lives next to the old canvas briefly
        const old = alloc(cv.width, cv.height);
        if (!old) throw memErr();
        old.ctx.drawImage(cv, 0, 0);
        total -= bytes; cv.width = w2; cv.height = h2; bytes = w2 * h2 * 4; total += bytes;
        s.w = w2; s.h = h2;
        ctx.drawImage(old.cv, keep ? keep.x : 0, keep ? keep.y : 0);
        old.cv.width = old.cv.height = 0;
      },
      free() { total -= bytes; bytes = 0; cv.width = cv.height = 0; s.w = s.h = 0; },
    };
    return s;
  };
  return gfx;
}

/* ---------- memory gfx: typed arrays, used by node tests (and as the compositor reference) ---------- */
const B255 = (x) => x / 255;
const lumF = (r, g, b) => 0.3 * r + 0.59 * g + 0.11 * b;
function clipColor(c) {
  const l = lumF(c[0], c[1], c[2]), n = Math.min(c[0], c[1], c[2]), x = Math.max(c[0], c[1], c[2]);
  if (n < 0) for (let i = 0; i < 3; i++) c[i] = l + ((c[i] - l) * l) / (l - n || 1);
  if (x > 1) for (let i = 0; i < 3; i++) c[i] = l + ((c[i] - l) * (1 - l)) / (x - l || 1);
  return c;
}
const setLumF = (c, l) => { const d = l - lumF(c[0], c[1], c[2]); return clipColor([c[0] + d, c[1] + d, c[2] + d]); };
const satF = (c) => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);
function setSatF(c, s) {
  const o = [0, 0, 0], idx = [0, 1, 2].sort((a, b) => c[a] - c[b]), [mn, md, mx] = idx;
  if (c[mx] > c[mn]) { o[md] = ((c[md] - c[mn]) * s) / (c[mx] - c[mn]); o[mx] = s; }
  o[mn] = 0;
  return o;
}
const SEP = {
  "source-over": (s) => s, multiply: (s, b) => s * b, screen: (s, b) => s + b - s * b, darken: (s, b) => Math.min(s, b),
  lighten: (s, b) => Math.max(s, b), difference: (s, b) => Math.abs(b - s), exclusion: (s, b) => b + s - 2 * b * s,
  "color-dodge": (s, b) => (b === 0 ? 0 : s >= 1 ? 1 : Math.min(1, b / (1 - s))),
  "color-burn": (s, b) => (b >= 1 ? 1 : s <= 0 ? 0 : 1 - Math.min(1, (1 - b) / s)),
  "hard-light": (s, b) => (s <= 0.5 ? b * 2 * s : SEP.screen(2 * s - 1, b)),
  overlay: (s, b) => SEP["hard-light"](b, s),
  "soft-light": (s, b) => {
    if (s <= 0.5) return b - (1 - 2 * s) * b * (1 - b);
    const d = b <= 0.25 ? ((16 * b - 12) * b + 4) * b : Math.sqrt(b);
    return b + (2 * s - 1) * (d - b);
  },
};
const NONSEP = {
  hue: (s, b) => setLumF(setSatF(s, satF(b)), lumF(b[0], b[1], b[2])),
  saturation: (s, b) => setLumF(setSatF(b, satF(s)), lumF(b[0], b[1], b[2])),
  color: (s, b) => setLumF(s, lumF(b[0], b[1], b[2])),
  luminosity: (s, b) => setLumF(b, lumF(s[0], s[1], s[2])),
};
/** one pixel: source (sr..sa, 0..255, sa already × alpha) over destination with gco → writes d[j..j+3] */
function compositePx(d, j, sr, sg, sb, sa, gco) {
  const as = sa / 255, ab = d[j + 3] / 255;
  if (gco === "copy") { d[j] = sr; d[j + 1] = sg; d[j + 2] = sb; d[j + 3] = sa; return; }
  if (gco === "destination-in") { d[j + 3] = Math.round(255 * ab * as); return; }
  if (gco === "destination-out") { d[j + 3] = Math.round(255 * ab * (1 - as)); return; }
  if (as <= 0) return;
  if (gco === "lighter") {
    const ao = Math.min(1, as + ab);
    for (let c = 0; c < 3; c++) { const s = [sr, sg, sb][c] / 255, b = d[j + c] / 255; d[j + c] = ao ? Math.round((255 * Math.min(1, s * as + b * ab)) / ao) : 0; }
    d[j + 3] = Math.round(255 * ao);
    return;
  }
  const cs = [B255(sr), B255(sg), B255(sb)], cb = [B255(d[j]), B255(d[j + 1]), B255(d[j + 2])];
  let mix;
  if (NONSEP[gco]) mix = NONSEP[gco](cs, cb);
  else { const f = SEP[gco] || SEP["source-over"]; mix = [f(cs[0], cb[0]), f(cs[1], cb[1]), f(cs[2], cb[2])]; }
  const ao = as + ab * (1 - as);
  for (let c = 0; c < 3; c++) {
    const co = cs[c] * as * (1 - ab) + cb[c] * ab * (1 - as) + as * ab * mix[c];
    d[j + c] = ao ? Math.round((255 * co) / ao) : 0;
  }
  d[j + 3] = Math.round(255 * ao);
}
function pixelsOf(src) {
  if (!src) return null;
  if (src.data && typeof src.w === "number" && src.cv == null && src.read) return { w: src.w, h: src.h, d: src.data };
  if (src.data && typeof src.width === "number") return { w: src.width, h: src.height, d: src.data };
  if (typeof src.getContext === "function") { const w = src.width, h = src.height; return { w, h, d: src.getContext("2d").getImageData(0, 0, w, h).data }; }
  if (src.cv) return pixelsOf(src.cv);
  return null;
}
/** typed arrays; draw supports source-over, destination-in, destination-out, copy, lighter, the separable and non-separable
 *  blend modes of BLENDS, alpha and nearest-neighbour scaling (dw, dh) */
export function makeMemGfx({ limit = Infinity } = {}) {
  let total = 0;
  const gfx = {
    lowMem: false, touch: false, limit, reclaim: null,
    bytes() { return total; },
    fits(need) { return guard(gfx, need); },
    track(n) { total += Math.max(0, n | 0); },
    untrack(n) { total = Math.max(0, total - Math.max(0, n | 0)); },
    surface(w, h) { return mk(Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); },
    fromImage(img) {
      const p = pixelsOf(img);
      const s = mk(Math.max(1, (p && p.w) || img.width || 1), Math.max(1, (p && p.h) || img.height || 1));
      if (p && p.d) s.data.set(p.d.subarray ? p.d.subarray(0, s.data.length) : p.d.slice(0, s.data.length));
      return s;
    },
  };
  const mk = (w, h) => {
    if (!guard(gfx, w * h * 4)) throw memErr();
    let data = new Uint8ClampedArray(w * h * 4);
    total += data.length;
    const s = {
      w, h, cv: null, ctx: null, data,
      read(r) {
        const out = new Uint8ClampedArray(Math.max(0, r.w * r.h * 4));
        for (let y = 0; y < r.h; y++) {
          const sy = r.y + y;
          if (sy < 0 || sy >= s.h) continue;
          const x0 = Math.max(0, r.x), x1 = Math.min(s.w, r.x + r.w);
          if (x1 <= x0) continue;
          out.set(data.subarray((sy * s.w + x0) * 4, (sy * s.w + x1) * 4), (y * r.w + (x0 - r.x)) * 4);
        }
        return out;
      },
      write(r, d) {
        for (let y = 0; y < r.h; y++) {
          const sy = r.y + y;
          if (sy < 0 || sy >= s.h) continue;
          const x0 = Math.max(0, r.x), x1 = Math.min(s.w, r.x + r.w);
          if (x1 <= x0) continue;
          data.set(d.subarray((y * r.w + (x0 - r.x)) * 4, (y * r.w + (x1 - r.x)) * 4), (sy * s.w + x0) * 4);
        }
      },
      clear(r) {
        if (!r) { data.fill(0); return; }
        const R = inter(r, { x: 0, y: 0, w: s.w, h: s.h });
        if (R) for (let y = R.y; y < R.y + R.h; y++) data.fill(0, (y * s.w + R.x) * 4, (y * s.w + R.x + R.w) * 4);
      },
      fill(rgb, r) {
        const R = r ? inter(r, { x: 0, y: 0, w: s.w, h: s.h }) : { x: 0, y: 0, w: s.w, h: s.h };
        if (!R) return;
        for (let y = R.y; y < R.y + R.h; y++) for (let x = R.x; x < R.x + R.w; x++) { const j = (y * s.w + x) * 4; data[j] = rgb[0]; data[j + 1] = rgb[1]; data[j + 2] = rgb[2]; data[j + 3] = 255; }
      },
      draw(src, o = {}) {
        const p = pixelsOf(src);
        if (!p || !p.d) return;
        const dx = Math.round(o.dx || 0), dy = Math.round(o.dy || 0);
        const dw = o.dw == null ? p.w : Math.round(o.dw), dh = o.dh == null ? p.h : Math.round(o.dh);
        const a = o.alpha == null ? 1 : o.alpha, gco = o.gco || "source-over";
        const x0 = Math.max(0, dx), y0 = Math.max(0, dy), x1 = Math.min(s.w, dx + dw), y1 = Math.min(s.h, dy + dh);
        const scaled = dw !== p.w || dh !== p.h;
        for (let ty = y0; ty < y1; ty++) {
          const sy = scaled ? Math.min(p.h - 1, Math.floor(((ty - dy + 0.5) * p.h) / dh)) : ty - dy;
          for (let tx = x0; tx < x1; tx++) {
            const sx = scaled ? Math.min(p.w - 1, Math.floor(((tx - dx + 0.5) * p.w) / dw)) : tx - dx;
            const i = (sy * p.w + sx) * 4;
            compositePx(data, (ty * s.w + tx) * 4, p.d[i], p.d[i + 1], p.d[i + 2], p.d[i + 3] * a, gco);
          }
        }
        if (gco === "destination-in" || gco === "copy") {   // outside the source rect: destination-in clears, copy clears
          for (let ty = 0; ty < s.h; ty++) for (let tx = 0; tx < s.w; tx++) {
            if (tx >= x0 && tx < x1 && ty >= y0 && ty < y1) continue;
            const j = (ty * s.w + tx) * 4;
            data[j] = data[j + 1] = data[j + 2] = data[j + 3] = 0;
          }
        }
      },
      resize(w2, h2, keep) {
        const old = data, ow = s.w, oh = s.h;
        if (!guard(gfx, w2 * h2 * 4)) throw memErr();
        total -= old.length; data = new Uint8ClampedArray(w2 * h2 * 4); total += data.length; s.data = data; s.w = w2; s.h = h2;
        const kx = keep ? keep.x : 0, ky = keep ? keep.y : 0;
        for (let y = 0; y < oh; y++) {
          const ty = y + ky;
          if (ty < 0 || ty >= h2) continue;
          const x0 = Math.max(0, -kx), x1 = Math.min(ow, w2 - kx);
          if (x1 > x0) data.set(old.subarray((y * ow + x0) * 4, (y * ow + x1) * 4), (ty * w2 + x0 + kx) * 4);
        }
      },
      free() { total -= data.length; data = new Uint8ClampedArray(0); s.data = data; s.w = s.h = 0; },
    };
    return s;
  };
  return gfx;
}

/* =====================================================================================================================
   Commands
   Command: { id, lk, ln?, stage, fx:Fx, t, bytes, undo(doc), redo(doc), log?:object|object[], logged:boolean }
   ===================================================================================================================== */
let cmdSeq = 0;
function mkCmd(lk, fx, { undo, redo, bytes = 0, log = null, ln, merge = null } = {}) {
  return { id: ++cmdSeq, lk, ln, stage: "", fx, t: Date.now(), bytes, undo: undo || (() => {}), redo: redo || (() => {}), log, logged: false, merge };
}
/** a pixel or mask edit of 128 px tiles: tiles = Map(key → {r, before, after}); undo writes "before", redo "after" */
export function pixCmd(layerId, plane, tiles, bxBefore, bxAfter, lk) {
  let bytes = 0;
  for (const t of tiles.values()) bytes += (t.before ? t.before.length : 0) + (t.after ? t.after.length : 0);
  const c = mkCmd(lk, "out", { bytes });
  Object.assign(c, { kind: "pix", layerId, plane, tiles, bxBefore, bxAfter });
  c.undo = (doc) => doc._pixApply(c, "before");
  c.redo = (doc) => doc._pixApply(c, "after");
  return c;
}
/** a property change (JSON before/after) of a layer ("layer") or of the document ("doc": geo, pins, lines, route) */
export function propCmd(target, id, path, before, after, lk, fx = "out") {
  const c = mkCmd(lk, fx, { bytes: 64 + jsonBytes(before === undefined ? null : before) + jsonBytes(after === undefined ? null : after) });
  Object.assign(c, { kind: "prop", target, layerId: id, path, before: clone(before), after: clone(after) });
  c.undo = (doc) => doc._setPath(target, id, path, clone(c.before));
  c.redo = (doc) => doc._setPath(target, id, path, clone(c.after));
  return c;
}
/** a structural change: before/after = { order?: RtLayer[], act?: number, masks?: [RtLayer, maskObj|null][], props?: [RtLayer, key, value][] } */
export function structCmd(kind, before, after, lk) {
  const c = mkCmd(lk, "out", { bytes: 256 });
  Object.assign(c, { kind: "struct", sk: kind, before, after });
  c.undo = (doc) => doc._applyStruct(c.before);
  c.redo = (doc) => doc._applyStruct(c.after);
  return c;
}
/** a selection change; RLE of the selection mask before and after (null = none) */
export function selCmd(beforeRle, afterRle, lk) {
  const c = mkCmd(lk, "view", { bytes: (beforeRle ? beforeRle.length : 0) + (afterRle ? afterRle.length : 0) + 32 });
  Object.assign(c, { kind: "sel", before: beforeRle, after: afterRle });
  c.undo = (doc) => doc._selApply(c.before);
  c.redo = (doc) => doc._selApply(c.after);
  return c;
}
export function multiCmd(cmds, lk) {
  const list = (cmds || []).filter(Boolean);
  const fx = list.some((x) => x.fx === "out") ? "out" : list.some((x) => x.fx === "plan") ? "plan" : "view";
  const c = mkCmd(lk, fx, { bytes: list.reduce((n, x) => n + (x.bytes || 0), 0) });
  c.kind = "multi"; c.cmds = list;
  c.undo = (doc) => { for (let i = list.length - 1; i >= 0; i--) list[i].undo(doc); };
  c.redo = (doc) => { for (const x of list) x.redo(doc); };
  return c;
}

/* =====================================================================================================================
   History (작업 내역): budget and state limits, stroke merging, log deltas, stage marks
   ===================================================================================================================== */
export class History {
  constructor({ budget = LIMITS.histBytes.desk, maxStates = LIMITS.histStates.desk } = {}) {
    this.budget = budget; this.maxStates = maxStates; this.items = []; this.index = -1; this.bytes = 0; this.evicted = 0;
    this.pending = [];        // log deltas of evicted commands that no save has carried yet (R2-05)
    this.onDrop = null;       // (commands) => void: commands that can never be undone or redone again (the doc frees their layers)
    this.barrier = null;      // id of the command at the last stage mark: nothing merges into it (R2-15, REQ-D3)
    this.gone = {};           // "stage|fx" → id of the newest applied command dropped from the list (stageChanged still counts it)
  }
  /** an applied command leaves the list: its unlogged deltas move to `pending`, its stage change is remembered */
  _forget(c) {
    if (!c.logged) for (const d of deltasOf(c)) this.pending.push(d);
    const k = (c.stage || "") + "|" + (c.fx || "");
    if (!(this.gone[k] >= c.id)) this.gone[k] = c.id;
  }
  /** pushes a command (or merges it into the top one: same-tool strokes within 2 s, slider nudges with the same mergeKey) */
  push(cmd) {
    let dropped = [];
    if (this.index < this.items.length - 1) {
      dropped = this.items.splice(this.index + 1);   // the redo branch: undone, so never logged
      for (const c of dropped) this.bytes -= c.bytes || 0;
    }
    const top = this.items[this.index];
    // a merge never crosses a stage switch nor a stage mark (「이 과정을 시작할 때로 되돌리기」 must not keep a new stroke, R2-15)
    const sameStage = (top && top.stage ? top.stage : "") === (cmd && cmd.stage ? cmd.stage : "");
    if (top && !top.logged && sameStage && top.id !== this.barrier && typeof top.merge === "function" && top.merge(cmd)) {
      this.bytes = this.items.reduce((n, c) => n + (c.bytes || 0), 0);
      dropped = dropped.concat(this._evict());
      if (dropped.length && this.onDrop) this.onDrop(dropped);
      return top;
    }
    this.items.push(cmd);
    this.index = this.items.length - 1;
    this.bytes += cmd.bytes || 0;
    dropped = dropped.concat(this._evict());
    if (dropped.length && this.onDrop) this.onDrop(dropped);
    return cmd;
  }
  /** drops the oldest commands past the budget; their unlogged deltas move to `pending` (the log never loses an operation) */
  _evict() {
    const out = [];
    while (this.items.length > 1 && (this.bytes > this.budget || this.items.length > this.maxStates)) {
      const c = this.items.shift();
      this.bytes -= c.bytes || 0;
      this.evicted = c.id;
      this.index--;
      if (this.index >= -1) this._forget(c);
      out.push(c);
    }
    return out;
  }
  /** memory relief on request: drops the redo branch, then the oldest commands one at a time until at most `keep` remain or
   *  `stop()` is true (checked before each drop). Layers no remaining command can reach are freed after each drop (onDrop).
   *  The log deltas stay for the next save. → number of commands dropped */
  trim(keep = 0, stop = null) {
    keep = Math.max(0, keep | 0);
    const done = () => typeof stop === "function" && stop();
    let n = 0;
    if (done()) return 0;
    if (this.index < this.items.length - 1) {
      const redo = this.items.splice(this.index + 1);   // undone: never logged
      for (const c of redo) this.bytes -= c.bytes || 0;
      n += redo.length;
      if (this.onDrop) this.onDrop(redo);
    }
    while (this.items.length > keep && !done()) {
      const c = this.items.shift();
      this.bytes -= c.bytes || 0;
      this.evicted = c.id;
      this.index--;
      this._forget(c);
      n++;
      if (this.onDrop) this.onDrop([c]);
    }
    if (this.bytes < 0) this.bytes = 0;
    return n;
  }
  undo(doc) { if (this.index < 0) return null; const c = this.items[this.index--]; c.undo(doc); return { lk: c.lk, ln: c.ln, cmd: c }; }
  redo(doc) { if (this.index >= this.items.length - 1) return null; const c = this.items[++this.index]; c.redo(doc); return { lk: c.lk, ln: c.ln, cmd: c }; }
  /** i = −1 is the state at 「열었을 때」 (or after the last evicted command) */
  jumpTo(doc, i) {
    i = Math.max(-1, Math.min(this.items.length - 1, i));
    while (this.index > i) this.undo(doc);
    while (this.index < i) this.redo(doc);
  }
  list() { return this.items.map((c, i) => ({ i, lk: c.lk, ln: c.ln, stage: c.stage, cur: i === this.index, undone: i > this.index, id: c.id })); }
  /** → [{ id, stage, delta }]: deltas of evicted commands first, then of commands at or below index not yet logged */
  logDeltas() {
    const out = this.pending.map((d) => ({ ...d, delta: { ...d.delta } }));
    for (let i = 0; i <= this.index; i++) { const c = this.items[i]; if (!c.logged) out.push(...deltasOf(c)); }
    return out;
  }
  /** after the save that carried them is confirmed */
  markLogged(ids) {
    const s = new Set(ids || []);
    this.items.forEach((c) => { if (s.has(c.id)) c.logged = true; });
    this.pending = this.pending.filter((d) => !s.has(d.id));
  }
  /** frees the pixel tiles of every command (the document is being disposed); the commands and their log deltas stay */
  dropPayloads() {
    const walk = (c) => { if (c.tiles) c.tiles = new Map(); if (c.cmds) c.cmds.forEach(walk); c.bytes = 0; };
    this.items.forEach(walk);
    this.bytes = 0;
  }
  get topId() { return this.index >= 0 ? this.items[this.index].id : this.evicted; }
}
function deltasOf(top) {
  const out = [];
  const walk = (c) => {
    if (c.kind === "multi" && !c.log) { for (const x of c.cmds) walk(x); return; }
    if (!c.log) return;
    for (const d of Array.isArray(c.log) ? c.log : [c.log]) out.push({ id: top.id, stage: top.stage, delta: { ...d } });
  };
  walk(top);
  return out;
}

/* =====================================================================================================================
   PhotoDoc
   Runtime layer (RtLayer): {id, k, t, nm, vis, op (0..1), bl, lk, it, ce, p, surf, bx (allocated rect, base px), mask, rev, savedRev,
   ptr {bx?, c?, a?, mk?} (last saved pointers), src (AI upload not yet saved), mx, extra (unknown keys), opaque (unknown kind record),
   missing, rec (verbatim record of a missing layer), cov, g, po}. mask: {m: Mask(wa), on, fe, rev, savedRev, src}.
   ===================================================================================================================== */
const DEF_GEO = () => ({ crop: null, r: 0, rot: 0, ext: { t: 0, r: 0, b: 0, l: 0 }, fill: [255, 255, 255], cal: null });
const KNOWN_REC = new Set(["id", "k", "t", "nm", "vis", "op", "bl", "lk", "it", "ce", "cov", "g", "mx", "po", "bx", "c", "a", "mk", "p", "ms", "dp"]);
const widest = (lo, hi) => (String(Math.round(lo)).length >= String(Math.round(hi)).length ? Math.round(lo) : Math.round(hi));

export class PhotoDoc {
  /** @param {Gfx} gfx @param {{base:Surface, w:number, h:number, limits?:object, onChange?:(what:string, fx:Fx)=>void, history?:object}} o */
  constructor(gfx, o = {}) {
    this.gfx = gfx;
    this.base = o.base || null;
    this.w = o.w || (o.base && o.base.w) || 1; this.h = o.h || (o.base && o.base.h) || 1;
    this.layers = []; this.activeId = 0; this.sel = null;
    this.geo = DEF_GEO();
    this.wa = { x: 0, y: 0, w: this.w, h: this.h };
    this.pins = []; this.lines = []; this.route = null;
    this._seq = 0;
    this.rev = 0; this.prev = 0; this.stage = STAGES[0];
    this.limits = o.limits || LIMITS;
    this.history = new History(o.history || { budget: this.limits.histBytes.desk, maxStates: this.limits.histStates.desk });
    this.history.onDrop = () => this._gcLayers();
    this.disposed = false;
    this.lastError = "";
    this.nid = 1;
    this._ls = {};
    this._onChange = o.onChange || null;
    this._all = new Map();         // every RtLayer ever created (undo can bring removed layers back)
    this._saved = { rev: 0, prev: 0 };
    this._snap = {};               // stage → command id at the last confirmed snapshot
    this._stageDirty = {};         // stage → a command older than its snapshot was undone
    this._marks = {};              // stage → command id at stage entry (이 과정을 시작할 때로 되돌리기)
  }
  /* ---------- events ---------- */
  on(ev, fn) { (this._ls[ev] = this._ls[ev] || []).push(fn); }
  off(ev, fn) { this._ls[ev] = (this._ls[ev] || []).filter((f) => f !== fn); }
  _emit(ev, ...a) {
    for (const f of this._ls[ev] || []) { try { f(...a); } catch (e) { /* a listener never breaks the doc */ } }
    if (ev === "change" && this._onChange) { try { this._onChange(...a); } catch (e) { /* ignore */ } }
  }
  _changed(what, fx) {
    if (what === "layers" || what === "struct") this._emit("layers");
    if (what === "geometry") this._emit("geometry");
    if (what === "selection") this._emit("selection");
    this._emit("change", what, fx);
  }
  /* ---------- small accessors (added API, contract-log DOC2) ---------- */
  get dirty() { return this.rev !== this._saved.rev || this.prev !== this._saved.prev || this.dirtyJobs().length > 0; }
  /** the Saver marks the document revisions a confirmed save carried */
  markSavedState({ rev, prev } = {}) { if (rev != null) this._saved.rev = rev; if (prev != null) this._saved.prev = prev; }
  layer(id) { return this.layers.find((L) => L.id === id) || null; }
  /** RLE of the selection (for drafts), null without one */
  selRle() { return this.sel ? rleEncode(this.sel.m) : null; }
  indexOf(id) { return this.layers.findIndex((L) => L.id === id); }
  _newRev() { return ++this._seq; }
  _kindCount(pred) { return this.layers.filter((L) => !L.opaque && pred(L)).length; }
  _zoneFull(kind) {
    const z = this.limits.zones;
    if (kind === "ai") return this._kindCount((L) => L.k === "ai") >= z.ai;
    if (kind === "px") return this._kindCount((L) => L.k === "px") >= z.px;
    if (kind === "tr") return this._kindCount((L) => L.k === "tr") >= z.tr;
    if (kind === "db") return this._kindCount((L) => L.k === "db") >= z.db;
    if (kind === "adj" || kind === "flt") return this._kindCount((L) => L.k === "adj" || L.k === "flt") >= z.adjflt;
    if (kind === "txt") return this._kindCount((L) => L.k === "txt") >= z.txt || this._kindCount((L) => OUT_KINDS.has(L.k)) >= z.mark;
    if (kind === "ov") return this._kindCount((L) => OUT_KINDS.has(L.k)) >= z.mark;
    return true;
  }
  _sortLayers() {
    const zoneOf = (L) => (L.opaque ? L.opaqueZone || 99 : ZONE[L.k]);
    this.layers = this.layers.map((L, i) => [L, i]).sort((a, b) => zoneOf(a[0]) - zoneOf(b[0]) || a[1] - b[1]).map((x) => x[0]);
  }
  _rt(kind, init = {}) {
    const L = {
      id: init.id || this.nid++, k: kind, t: init.t || "", nm: init.nm || null, vis: init.vis == null ? 1 : init.vis,
      op: init.op == null ? 1 : init.op, bl: init.bl || 0, lk: init.lk || 0, it: init.it || 0, ce: init.ce || 0,
      p: init.p ? clone(init.p) : null, surf: null, bx: null, mask: null, rev: 0, savedRev: -1, ptr: {}, src: null, mx: init.mx || 0,
      extra: init.extra || {}, opaque: null, missing: false, rec: null, cov: init.cov || 0, g: init.g || 0, po: init.po || 0,
    };
    if (L.id >= this.nid) this.nid = L.id + 1;
    this._all.set(L.id, L);
    return L;
  }
  /* ---------- work area ---------- */
  _waOf(ext) {
    const e = ext || { t: 0, r: 0, b: 0, l: 0 };
    const l = Math.round((e.l * this.w) / 1000), r = Math.round((e.r * this.w) / 1000);
    const t = Math.round((e.t * this.h) / 1000), b = Math.round((e.b * this.h) / 1000);
    return { x: -l, y: -t, w: this.w + l + r, h: this.h + t + b };
  }
  /** re-bases wa-sized planes (masks, selection) onto a new work area; returns the replacements [layer, oldMask, newMask] */
  _rebase(oldWa, newWa) {
    const move = (m) => {
      const out = new Uint8Array(newWa.w * newWa.h);
      const dx = oldWa.x - newWa.x, dy = oldWa.y - newWa.y;
      for (let y = 0; y < oldWa.h; y++) {
        const ty = y + dy;
        if (ty < 0 || ty >= newWa.h) continue;
        const x0 = Math.max(0, -dx), x1 = Math.min(oldWa.w, newWa.w - dx);
        if (x1 > x0) out.set(m.subarray(y * oldWa.w + x0, y * oldWa.w + x1), ty * newWa.w + x0 + dx);
      }
      return out;
    };
    const masks = [];
    for (const L of this.layers) if (L.mask) masks.push([L, L.mask, { ...L.mask, m: move(L.mask.m), rev: this._newRev(), alpha: null }]);
    const sel = this.sel ? { m: move(this.sel.m), bbox: null, rev: this.sel.rev + 1 } : null;
    if (sel) sel.bbox = maskBBox(sel.m, newWa.w, newWa.h);
    return { masks, sel };
  }
  /* ---------- layers ---------- */
  _fits() { return this.projectedBytes() <= this.limits.editStruct; }
  _histLk(kind, t, verb) {
    if (kind === "adj" || kind === "flt") return (verb === "new" ? "adjNew:" : "adjEdit:") + t;
    if (kind === "ov") return (verb === "new" ? "markNew:" : "markEdit:") + t;
    if (kind === "txt") return verb === "new" ? "textNew" : "textEdit";
    return verb === "new" ? "layerNew" : "layerOp";
  }
  _ln(L) { return this.layers.filter((x) => x.k === L.k && x.t === L.t && x.id <= L.id).length || 1; }
  _logOp(L) { return L.k === "adj" || L.k === "flt" || L.k === "ov" ? L.t : L.k === "txt" ? "txt" : L.k === "ai" ? "align" : null; }
  _delta(o, extra = {}) {
    const st = OPS[o] && OPS[o].st;
    const s = STAGES.indexOf(st || this.stage);
    return { s: s < 0 ? 0 : s, o, n: 1, ...extra };
  }
  _push(c) {
    c.stage = this.stage;
    const top = this.history.push(c);
    if (top !== c && top.stage == null) top.stage = this.stage;
    this._emit("history");
    return top;
  }
  /** wraps a mutation: fx "out" bumps rev, "plan" bumps prev; the command restores both on undo/redo */
  _record(c, apply) {
    const r0 = { rev: this.rev, prev: this.prev };
    apply();
    if (c.fx === "out") this.rev = this._newRev();
    if (c.fx === "plan") this.prev = this._newRev();
    const r1 = { rev: this.rev, prev: this.prev };
    const u = c.undo, rd = c.redo;
    c.r0 = r0; c.r1 = r1;
    c.undo = (doc) => { u(doc); doc.rev = c.r0.rev; doc.prev = c.r0.prev; doc._afterUndo(c); };
    c.redo = (doc) => { rd(doc); doc.rev = c.r1.rev; doc.prev = c.r1.prev; };
    return this._push(c);
  }
  _afterUndo(c) {
    for (const st of STAGES) if (this._snap[st] != null && c.id <= this._snap[st] && c.stage === st) this._stageDirty[st] = true;
  }
  /** → RtLayer | null (lastError set); init {t, nm, p, it, ce}; opts {noHist} */
  addLayer(kind, init = {}, opts = {}) {
    this.lastError = "";
    if (KINDS.indexOf(kind) < 0) { this.lastError = "limit"; return null; }
    const codes = TCODE[kind];
    const t = codes ? (init.t && codes.includes(init.t) ? init.t : codes[0]) : "";
    if (this._zoneFull(kind)) { this.lastError = "limit"; return null; }
    if (init.p != null && !pOk(kind, codes ? t : "_", init.p)) { this.lastError = "size"; return null; }
    const L = this._rt(kind, { t, nm: init.nm ? String(init.nm).slice(0, this.limits.nmChars) : null, p: init.p || null, it: clampI(init.it, 0, 8), ce: kind === "tr" ? clampI(init.ce, 0, 4) : 0 });
    L.rev = this._newRev();
    const before = { order: this.layers.slice(), act: this.activeId };
    // insertion: adjustments and effects above the active layer of their zone, everything else on top of its zone
    const act = this.layer(this.activeId), list = this.layers.slice();
    let at = list.length;
    if ((kind === "adj" || kind === "flt") && act && ZONE[act.k] === ZONE[kind]) at = list.indexOf(act) + 1;
    else { at = 0; for (let i = 0; i < list.length; i++) if (!list[i].opaque && ZONE[list[i].k] <= ZONE[kind]) at = i + 1; }
    list.splice(at, 0, L);
    this.layers = list;
    this.activeId = L.id;
    if (!this._fits()) { this.layers = before.order; this.activeId = before.act; this._all.delete(L.id); this.lastError = "limit"; return null; }
    if (opts.noHist) { this.rev = this._newRev(); this._changed("layers", "out"); return L; }
    const after = { order: this.layers.slice(), act: L.id };
    const c = structCmd("add", before, after, this._histLk(kind, t, "new"));
    c.ln = kind === "adj" || kind === "flt" || kind === "ov" ? this._ln(L) : undefined;
    const op = this._logOp(L);
    if (op && op !== "align") c.log = this._delta(op, { y: L.id });
    this._record(c, () => {});
    this._changed("layers", "out");
    return L;
  }
  /** topmost layer of kind/t in its zone (not missing), else a new one */
  ensureLayer(kind, t) {
    const hit = this.layers.slice().reverse().find((L) => L.k === kind && !L.missing && !L.opaque && (!t || L.t === t));
    return hit || this.addLayer(kind, { t: t || undefined });
  }
  /** the AI layer's draw rect in base px from its parameters (p defaults to L.p; the renderer passes a slider preview) */
  _aiRect(L, p0) {
    const p = p0 || L.p || {}, sc = (p.sc || 1000) / 1000, dw = this.w * sc, dh = this.h * sc;
    return { x: Math.round((this.w - dw) / 2 + (p.dx || 0)), y: Math.round((this.h - dh) / 2 + (p.dy || 0)), w: Math.round(dw), h: Math.round(dh) };
  }
  /** ai layer keeping src = dataUrl; null with lastError "aspect" when the aspect differs > 2 % */
  importPatch(img, dataUrl) {
    this.lastError = "";
    const iw = (img && (img.naturalWidth || img.width)) || 0, ih = (img && (img.naturalHeight || img.height)) || 0;
    if (!iw || !ih) { this.lastError = "aspect"; return null; }
    if (Math.abs(iw / ih - this.w / this.h) / (this.w / this.h) > 0.02) { this.lastError = "aspect"; return null; }
    if (this._zoneFull("ai")) { this.lastError = "limit"; return null; }
    let surf;
    try { surf = this.gfx.fromImage(img); } catch (e) { this.lastError = "memory"; return null; }
    const before = { order: this.layers.slice(), act: this.activeId };
    const L = this._rt("ai", {});
    L.surf = surf; L.src = dataUrl; L.rev = this._newRev(); L.bx = this._aiRect(L);
    const list = this.layers.slice();
    let at = 0;
    for (let i = 0; i < list.length; i++) if (!list[i].opaque && ZONE[list[i].k] <= ZONE.ai) at = i + 1;
    list.splice(at, 0, L);
    this.layers = list; this.activeId = L.id;
    if (!this._fits()) { this.layers = before.order; this.activeId = before.act; surf.free(); this._all.delete(L.id); this.lastError = "limit"; return null; }
    const c = structCmd("add", before, { order: this.layers.slice(), act: L.id }, "patch");
    c.log = this._delta("patch", { y: L.id });
    this._record(c, () => {});
    this._changed("layers", "out");
    return L;
  }
  /** pixel kinds and parametric kinds within their zone limits; AI layers cannot be duplicated (their upload is passed through) */
  duplicate(id) {
    this.lastError = "";
    const s = this.layer(id);
    if (!s || s.opaque || s.missing || s.k === "ai") { this.lastError = s && s.missing ? "missing" : "limit"; return null; }
    if (this._zoneFull(s.k)) { this.lastError = "limit"; return null; }
    const before = { order: this.layers.slice(), act: this.activeId };
    const L = this._rt(s.k, { t: s.t, p: s.p, it: s.it, ce: s.ce, op: s.op, bl: s.bl, vis: s.vis, mx: s.mx });
    L.rev = this._newRev();
    try {
      if (s.surf && s.bx) { L.surf = this.gfx.surface(s.surf.w, s.surf.h, "layer"); L.surf.draw(s.surf, { gco: "copy" }); L.bx = { ...s.bx }; }
      if (s.mask) L.mask = { ...s.mask, m: s.mask.m.slice(), rev: this._newRev(), savedRev: -1, alpha: null };
    } catch (e) { if (L.surf) L.surf.free(); this._all.delete(L.id); this.lastError = "memory"; return null; }
    const list = this.layers.slice();
    list.splice(list.indexOf(s) + 1, 0, L);
    this.layers = list; this.activeId = L.id;
    if (!this._fits()) { this.layers = before.order; this.activeId = before.act; if (L.surf) L.surf.free(); this._all.delete(L.id); this.lastError = "limit"; return null; }
    this._record(structCmd("dup", before, { order: this.layers.slice(), act: L.id }, "layerDup"), () => {});
    this._changed("layers", "out");
    return L;
  }
  remove(id) {
    this.lastError = "";
    const L = this.layer(id);
    if (!L) return false;
    const before = { order: this.layers.slice(), act: this.activeId };
    const i = this.layers.indexOf(L);
    const order = this.layers.filter((x) => x !== L);
    const act = this.activeId === id ? (order[Math.max(0, i - 1)] ? order[Math.max(0, i - 1)].id : 0) : this.activeId;
    this._record(structCmd("remove", before, { order, act }, "layerDel"), () => this._applyStruct({ order, act }));
    this._changed("layers", "out");
    return true;
  }
  /** dir −1|1, within the zone; → boolean */
  move(id, dir) {
    this.lastError = "";
    const L = this.layer(id);
    if (!L || L.opaque || L.missing) { this.lastError = L && L.missing ? "missing" : ""; return false; }
    const i = this.layers.indexOf(L), j = i + (dir > 0 ? 1 : -1), N = this.layers[j];
    if (!N || N.opaque || ZONE[N.k] !== ZONE[L.k]) return false;
    const before = { order: this.layers.slice(), act: this.activeId };
    const order = this.layers.slice(); order[i] = N; order[j] = L;
    this._record(structCmd("move", before, { order, act: this.activeId }, "layerMove"), () => this._applyStruct({ order, act: this.activeId }));
    this._changed("layers", "out");
    return true;
  }
  /** not a command (fx "view" without history) */
  setActive(id) {
    if (id !== 0 && !this.layer(id)) return;
    this.activeId = id;
    this._emit("layers");
    this._emit("change", "active", "view");
  }
  _setPath(target, id, path, value) {
    if (target === "doc") {
      if (path === "geo") { this._setGeoRaw(value); return; }
      if (path === "pins") this.pins = value || [];
      else if (path === "lines") this.lines = value || [];
      else if (path === "route") this.route = value || null;
      return;
    }
    const L = this._all.get(id);
    if (!L) return;
    if (path === "p") L.p = value;
    else if (path.startsWith("p.")) { const k = path.slice(2); L.p = { ...(L.p || {}) }; if (value === undefined || value === null) delete L.p[k]; else L.p[k] = value; if (!Object.keys(L.p).length) L.p = null; }
    else if (path === "mk.on") { if (L.mask) L.mask = { ...L.mask, on: value ? 1 : 0 }; }
    else if (path === "mk.fe") { if (L.mask) L.mask = { ...L.mask, fe: value | 0, alpha: null }; }
    else L[path] = value;
    if (L.k === "ai") L.bx = this._aiRect(L);
  }
  /** validated [[path, before, after]] for ed.commit(..., {props}); invalid entries are dropped (lastError "size") */
  _strokeProps(L, list) {
    if (!Array.isArray(list) || !list.length) return [];
    const ok = new Set(["vis", "op", "bl", "lk", "nm", "it", "ce", "p"]), out = [];
    for (const e of list) {
      if (!Array.isArray(e) || typeof e[0] !== "string") continue;
      const [path, before, after] = e;
      if (!ok.has(path) && !path.startsWith("p.")) { this.lastError = "size"; continue; }
      if (path === "p" || path.startsWith("p.")) {
        const next = path === "p" ? after : (() => { const q = { ...(L.p || {}) }; if (after == null) delete q[path.slice(2)]; else q[path.slice(2)] = after; return q; })();
        const pv = next && Object.keys(next).length ? next : null;
        if (pv && !pOk(L.k, TCODE[L.k] ? L.t : "_", pv)) { this.lastError = "size"; continue; }
      }
      out.push([path, clone(before === undefined ? null : before), clone(after === undefined ? null : after)]);
    }
    return out;
  }
  _getPath(L, path) {
    if (path === "p") return L.p;
    if (path.startsWith("p.")) return L.p ? L.p[path.slice(2)] : undefined;
    if (path === "mk.on") return L.mask ? L.mask.on : undefined;
    if (path === "mk.fe") return L.mask ? L.mask.fe : undefined;
    return L[path];
  }
  /** path "vis"|"op"|"bl"|"lk"|"nm"|"it"|"ce"|"p"|"p.<k>"|"mk.on"|"mk.fe"; opts {lk, mergeKey} → RtLayer | null */
  setProp(id, path, value, opts = {}) {
    this.lastError = "";
    const L = this.layer(id);
    if (!L) { this.lastError = "missing"; return null; }
    if (L.missing || L.opaque) { this.lastError = "missing"; return null; }
    let v = value;
    if (path === "vis" || path === "lk") v = v ? 1 : 0;
    else if (path === "op") v = Math.max(0, Math.min(1, Number(v) || 0));
    else if (path === "bl") { v = clampI(v, 0, BLENDS.length - 1); if ((L.k === "adj" || L.k === "flt") && v !== 0 && v !== 16) { this.lastError = "size"; return null; } if (OUT_KINDS.has(L.k)) v = 0; }
    else if (path === "nm") v = v == null || v === "" ? null : String(v).slice(0, this.limits.nmChars);
    else if (path === "it") v = clampI(v, 0, 8);
    else if (path === "ce") v = clampI(v, 0, 4);
    else if (path === "mk.on") { if (!L.mask) { this.lastError = "missing"; return null; } v = v ? 1 : 0; }
    else if (path === "mk.fe") { if (!L.mask) { this.lastError = "missing"; return null; } v = clampI(v, 0, 50); }
    else if (path === "p" || path.startsWith("p.")) {
      const next = path === "p" ? v : (() => { const q = { ...(L.p || {}) }; if (v == null) delete q[path.slice(2)]; else q[path.slice(2)] = v; return q; })();
      const tcode = TCODE[L.k] ? L.t : "_";
      const pv = next && Object.keys(next).length ? next : null;
      if (pv && !pOk(L.k, tcode, pv)) { this.lastError = "size"; return null; }
      if (path === "p") v = pv;
    } else { this.lastError = "size"; return null; }
    const before = clone(this._getPath(L, path));
    if (JSON.stringify(before) === JSON.stringify(v === undefined ? null : v) && JSON.stringify(before) !== undefined) return L;
    this._setPath("layer", id, path, clone(v));
    if ((path === "nm" || path === "p" || path.startsWith("p.")) && !this._fits()) {
      this._setPath("layer", id, path, before); this.lastError = "limit"; return null;
    }
    const lkDef = { vis: "layerVis", op: "layerOp", bl: "layerBlend", lk: "layerLock", nm: "layerRename", it: "layerLink", ce: "layerLink", "mk.on": "maskAdd", "mk.fe": "maskFeather" }[path]
      || (L.k === "ai" ? "layerAiMove" : this._histLk(L.k, L.t, "edit"));
    const c = propCmd("layer", id, path, before, this._getPath(L, path), opts.lk || lkDef, "out");
    if (lkDef.startsWith("adjEdit") || lkDef.startsWith("markEdit")) c.ln = this._ln(L);
    if (path === "p" || path.startsWith("p.")) {
      const op = this._logOp(L);
      if (op) {
        const ps = L.p ? JSON.stringify(L.p) : "";
        c.log = this._delta(op, { y: L.id, ...(ps && op !== "txt" && op !== "tg" && ps.length <= 40 ? { p: ps } : {}) });
      }
    } else if (path === "mk.on" || path === "mk.fe") c.log = this._delta("mask", { y: L.id });
    if (opts.mergeKey) {
      c.mergeKey = opts.mergeKey;
      c.merge = (n) => {
        if (n.kind !== "prop" || n.mergeKey !== c.mergeKey || n.layerId !== c.layerId || n.path !== c.path) return false;
        c.after = n.after; c.r1 = n.r1; c.t = n.t; if (n.log) c.log = n.log;
        return true;
      };
    }
    this._record(c, () => {});
    this._changed("prop", "out");
    return L;
  }
  /** same zone, pixel kinds only (Z2 손질); keeps the higher T_RANK t and the larger mx; the upper layer's opacity, blend and mask apply */
  mergeDown(id) {
    this.lastError = "";
    const U = this.layer(id), i = this.indexOf(id), D = this.layers[i - 1];
    if (!U || !D || U.k !== "px" || D.k !== "px" || U.missing || D.missing || U.lk || D.lk || !U.vis || !D.vis) { this.lastError = U && (U.missing || (D && D.missing)) ? "missing" : "limit"; return null; }
    const wa = this.wa, r = union(U.bx, D.bx);
    let pc = null;
    if (U.surf && U.bx && r) {
      const ed = this._editSession(D, "px");
      const loc = { x: r.x - wa.x, y: r.y - wa.y, w: r.w, h: r.h };
      if (!ed.touch(loc)) { this.lastError = "memory"; return null; }
      // the upper layer, masked, onto the lower surface
      let tmp;
      try { tmp = this.gfx.surface(U.bx.w, U.bx.h, "scratch"); } catch (e) { ed.cancel(); this.lastError = "memory"; return null; }
      tmp.draw(U.surf, { gco: "copy" });
      if (U.mask && U.mask.on) tmp.write({ x: 0, y: 0, w: U.bx.w, h: U.bx.h }, this._maskedAlpha(tmp.read({ x: 0, y: 0, w: U.bx.w, h: U.bx.h }), U.bx, U.mask));
      D.surf.draw(tmp, { dx: U.bx.x - D.bx.x, dy: U.bx.y - D.bx.y, alpha: U.op, gco: BLENDS[U.bl] || "source-over" });
      tmp.free();
      pc = ed.take("layerMerge");
    }
    const before = { order: this.layers.slice(), act: this.activeId, props: [[D, "t", D.t], [D, "mx", D.mx]] };
    const t = (T_RANK[U.t] || 0) > (T_RANK[D.t] || 0) ? U.t : D.t;
    const after = { order: this.layers.filter((x) => x !== U), act: D.id, props: [[D, "t", t], [D, "mx", Math.max(D.mx, U.mx)]] };
    const sc = structCmd("merge", before, after, "layerMerge");
    const c = pc ? multiCmd([pc, sc], "layerMerge") : sc;
    this._record(c, () => this._applyStruct(after));
    this._changed("layers", "out");
    return D;
  }
  _maskedAlpha(d, bx, mask) {
    const wa = this.wa, m = mask.fe ? this._feathered(mask) : mask.m;
    for (let y = 0; y < bx.h; y++) {
      const my = bx.y + y - wa.y;
      for (let x = 0; x < bx.w; x++) {
        const mx = bx.x + x - wa.x, i = (y * bx.w + x) * 4;
        const v = mx < 0 || my < 0 || mx >= wa.w || my >= wa.h ? 0 : m[my * wa.w + mx];
        d[i + 3] = Math.round((d[i + 3] * v) / 255);
      }
    }
    return d;
  }
  _feathered(mask) {
    if (!mask.fe) return mask.m;
    if (mask._fk !== mask.rev + ":" + mask.fe) { mask._fm = maskFeather(mask.m, this.wa.w, this.wa.h, mask.fe); mask._fk = mask.rev + ":" + mask.fe; }
    return mask._fm;
  }
  /** effective mask truth (feathered when fe > 0), wa-sized; null without an active mask (renderer, layerStats) */
  maskOf(L) {
    if (!L || !L.mask || !L.mask.on) return null;
    return L.mask.live ? L.mask.m : this._feathered(L.mask);   // painting shows the raw mask live; the feather returns at commit (R2-10)
  }
  /** from "all"|"selection"|"inverse"|"background" or a wa-sized Mask; opts {src:"bg"} marks a 배경만 mask → RtLayer | null */
  addMask(id, from = "all", opts = {}) {
    this.lastError = "";
    const L = this.layer(id);
    if (!L || L.missing || L.opaque) { this.lastError = "missing"; return null; }
    if (!BASE_KINDS.has(L.k)) { this.lastError = "limit"; return null; }
    if (L.mask) return L;
    const n = this.wa.w * this.wa.h;
    let m, src = opts.src || "";
    if (from instanceof Uint8Array) { if (from.length !== n) { this.lastError = "size"; return null; } m = from.slice(); }
    else if (from === "selection" || from === "inverse") {
      if (!this.sel) { this.lastError = "missing"; return null; }
      m = from === "inverse" ? maskInvert(this.sel.m) : this.sel.m.slice();
    } else if (from === "background") {
      const r = backgroundMask(this._waRGBA(), this.wa.w, this.wa.h);
      if (!r || !r.ok) { this.lastError = "bg"; return null; }
      m = r.mask; src = "bg";
    } else m = new Uint8Array(n).fill(255);
    const mask = { m, on: 1, fe: 0, rev: this._newRev(), savedRev: -1, src, alpha: null };
    L.mask = mask;
    if (!this._fits()) { L.mask = null; this.lastError = "limit"; return null; }
    L.mask = null;
    const c = structCmd("maskAdd", { masks: [[L, null]] }, { masks: [[L, mask]] }, "maskAdd");
    c.bytes += n;
    c.log = this._delta("mask", { y: L.id });
    this._record(c, () => { L.mask = mask; });
    this._changed("layers", "out");
    return L;
  }
  deleteMask(id) {
    this.lastError = "";
    const L = this.layer(id);
    if (!L || !L.mask || L.missing) { this.lastError = L && L.missing ? "missing" : ""; return null; }
    const old = L.mask;
    this._record(structCmd("maskDel", { masks: [[L, old]] }, { masks: [[L, null]] }, "maskDel"), () => { L.mask = null; });
    this._changed("layers", "out");
    return L;
  }
  invertMask(id) {
    this.lastError = "";
    const L = this.layer(id);
    if (!L || !L.mask || L.missing) { this.lastError = L && L.missing ? "missing" : ""; return null; }
    const old = L.mask, nm = { ...old, m: maskInvert(old.m), rev: this._newRev(), alpha: null, src: "" };
    const c = structCmd("maskInv", { masks: [[L, old]] }, { masks: [[L, nm]] }, "maskInv");
    c.bytes += old.m.length;
    c.log = this._delta("mask", { y: L.id });
    this._record(c, () => { L.mask = nm; });
    this._changed("layers", "out");
    return L;
  }
  _applyStruct(st) {
    if (!st) return;
    if (st.order) this.layers = st.order.slice();
    if (st.act != null) this.activeId = st.act;
    for (const [L, mask] of st.masks || []) L.mask = mask;
    for (const [L, k, v] of st.props || []) L[k] = v;
  }
  /** base pixels over the work area (margins in the fill colour) → RGBA wa.w × wa.h */
  _waRGBA() {
    const wa = this.wa, out = new Uint8ClampedArray(wa.w * wa.h * 4), f = this.geo.fill || [255, 255, 255];
    for (let i = 0; i < out.length; i += 4) { out[i] = f[0]; out[i + 1] = f[1]; out[i + 2] = f[2]; out[i + 3] = 255; }
    if (this.base) {
      const d = this.base.read({ x: 0, y: 0, w: this.w, h: this.h });
      for (let y = 0; y < this.h; y++) out.set(d.subarray(y * this.w * 4, (y + 1) * this.w * 4), ((y - wa.y) * wa.w - wa.x) * 4);
    }
    return out;
  }
  /* ---------- selection (fx "view") ---------- */
  _selApply(rle) {
    const n = this.wa.w * this.wa.h;
    if (!rle) this.sel = null;
    else { const m = rleDecode(rle, n); this.sel = { m, bbox: maskBBox(m, this.wa.w, this.wa.h), rev: (this.sel ? this.sel.rev : 0) + 1 }; }
    this._changed("selection", "view");
  }
  _selSet(m, lk) {
    const n = this.wa.w * this.wa.h;
    const bbox = m ? maskBBox(m, this.wa.w, this.wa.h) : null;
    const next = m && bbox ? m : null;
    const b = this.sel ? rleEncode(this.sel.m) : null, a = next ? rleEncode(next) : null;
    if (!b && !a) return;
    this.sel = next ? { m: next, bbox, rev: (this.sel ? this.sel.rev : 0) + 1 } : null;
    this._push(selCmd(b, a, lk));
    void n;
    this._changed("selection", "view");
  }
  /** mask: wa-sized Mask; op "new"|"add"|"sub"|"and" */
  setSelection(mask, op = "new", lk = "selRect") {
    if (mask && mask.length !== this.wa.w * this.wa.h) { this.lastError = "size"; return; }
    const m = mask ? maskCombine(this.sel ? this.sel.m : null, mask, op || "new") : null;
    this._selSet(m, lk);
  }
  selectAll() { this._selSet(new Uint8Array(this.wa.w * this.wa.h).fill(255), "selAll"); }
  deselect() { if (this.sel) this._selSet(null, "deselect"); }
  invertSelection() { this._selSet(this.sel ? maskInvert(this.sel.m) : new Uint8Array(this.wa.w * this.wa.h).fill(255), "selInvert"); }
  featherSelection(px) { if (this.sel && px > 0) this._selSet(maskFeather(this.sel.m, this.wa.w, this.wa.h, px), "selFeather"); }
  growSelection(px) { if (this.sel && px) this._selSet(maskGrow(this.sel.m, this.wa.w, this.wa.h, px), px > 0 ? "selGrow" : "selShrink"); }
  /* ---------- geometry, calibration and annotations ---------- */
  _setGeoRaw(g) {
    const oldWa = this.wa;
    this.geo = { ...DEF_GEO(), ...clone(g) };
    this.wa = this._waOf(this.geo.ext);
    void oldWa;
  }
  /** patch {crop?, r?, rot?, ext?, fill?, cal?}; fx "out"; validates every field (lastError "size" when invalid) */
  setGeo(patch = {}, lk) {
    this.lastError = "";
    const g = clone(this.geo);
    const log = [];
    if ("crop" in patch) {
      const c = patch.crop;
      if (c != null && !(c && [c.x, c.y, c.w, c.h].every(Number.isFinite) && c.w >= 1 && c.h >= 1)) { this.lastError = "size"; return false; }
      g.crop = c == null ? null : { x: Math.round(c.x), y: Math.round(c.y), w: Math.round(c.w), h: Math.round(c.h) };
      log.push("crop");
    }
    if ("r" in patch) { g.r = clampI(patch.r, -150, 150); log.push("strt"); }
    if ("rot" in patch) { const r = ((Math.round((Number(patch.rot) || 0) / 90) * 90) % 360 + 360) % 360; g.rot = r; log.push("rot"); }
    if ("ext" in patch) {
      const e = patch.ext || {};
      g.ext = { t: clampI(e.t, 0, 150), r: clampI(e.r, 0, 150), b: clampI(e.b, 0, 150), l: clampI(e.l, 0, 150) };
      log.push("ext");
    }
    if ("fill" in patch) { const f = patch.fill; if (!Array.isArray(f) || f.length !== 3) { this.lastError = "size"; return false; } g.fill = f.map((x) => clampI(x, 0, 255)); }
    if ("cal" in patch) {
      const c = patch.cal;
      if (c != null && !(c && [c.a, c.b, c.c, c.d].every(Number.isFinite) && Number.isFinite(c.cm))) { this.lastError = "size"; return false; }
      g.cal = c == null ? null : { a: Math.round(c.a), b: Math.round(c.b), c: Math.round(c.c), d: Math.round(c.d), cm: clampI(c.cm, 1, 5000), ob: c.ob ? 1 : 0 };
      log.push("measure");
    }
    const before = clone(this.geo), oldWa = { ...this.wa }, newWa = this._waOf(g.ext);
    const waChanged = !eqRect(oldWa, newWa);
    const rb = waChanged ? this._rebase(oldWa, newWa) : null;
    const oldSel = this.sel;
    const defLk = "ext" in patch ? "extend" : "rot" in patch ? "rotate" : "r" in patch ? "straighten" : "cal" in patch ? "measure" : "fill" in patch ? "fill" : "crop";
    const c = propCmd("doc", 0, "geo", before, g, lk || defLk, "out");
    const u0 = c.undo, r0 = c.redo;
    const shift = (from, to) => { if (from.x !== to.x || from.y !== to.y) this._emit("wa", { dx: from.x - to.x, dy: from.y - to.y, wa: { ...to } }); };
    c.undo = (doc) => { u0(doc); if (rb) { for (const [L, o] of rb.masks) L.mask = o; doc.sel = oldSel; } shift(newWa, oldWa); doc._changed("geometry", "out"); };
    c.redo = (doc) => { r0(doc); if (rb) { for (const [L, , n] of rb.masks) L.mask = n; doc.sel = rb.sel; } shift(oldWa, newWa); doc._changed("geometry", "out"); };
    if (rb) c.bytes += rb.masks.length * newWa.w * newWa.h;
    if (log.length) c.log = log.map((o) => this._delta(o, { y: 0 }));
    this._record(c, () => { this._setGeoRaw(g); if (rb) { for (const [L, , n] of rb.masks) L.mask = n; this.sel = rb.sel; } });
    shift(oldWa, newWa);   // "wa" {dx, dy}: add (dx, dy) to a wa-local point to keep it on the same base pixel (R2-16)
    this._changed("geometry", "out");
    return true;
  }
  _planCmd(path, value, lk, op, cap) {
    const v = Array.isArray(value) ? clone(value).slice(0, cap) : value == null ? null : clone(value);
    const before = clone(this[path]);
    const c = propCmd("doc", 0, path, before, v, lk, "plan");
    c.log = this._delta(op, { y: 0 });
    this._record(c, () => { this[path] = path === "route" ? v : v || []; });
    this._changed(path, "plan");
  }
  /** fx "plan" */
  setPins(pins, lk) { this._planCmd("pins", pins || [], lk || "pin", "pin", this.limits.pins); }
  setLines(lines, lk) { this._planCmd("lines", lines || [], lk || "line", "light", this.limits.lines); }
  setRoute(route, lk) { this._planCmd("route", route, lk || "route", "route", 99); }
  /* ---------- pixel edits ---------- */
  /** the edit of one plane: a wa-local proxy surface, tile capture on first touch, one pixCmd at commit */
  _editSession(L, plane) {
    const doc = this, wa = { ...this.wa }, tiles = new Map(), bxBefore = L.bx ? { ...L.bx } : null;
    const isMask = plane === "mask";
    let maskCreated = null;
    if (isMask && !L.mask) { maskCreated = { m: new Uint8Array(wa.w * wa.h).fill(255), on: 1, fe: 0, rev: this._newRev(), savedRev: -1, src: "", alpha: null }; L.mask = maskCreated; }
    if (isMask) L.mask.live = true;
    // every write bumps L.live: caches never keep a mid-stroke state under the committed signature (R2-14)
    const bump = () => { L.live = (L.live || 0) + 1; };
    const readPlane = (r) => {   // r wa-local, inside wa
      if (isMask) {
        const m = L.mask.m, out = new Uint8Array(r.w * r.h);
        for (let y = 0; y < r.h; y++) out.set(m.subarray((r.y + y) * wa.w + r.x, (r.y + y) * wa.w + r.x + r.w), y * r.w);
        return out;
      }
      if (!L.surf || !L.bx) return new Uint8ClampedArray(r.w * r.h * 4);
      return L.surf.read({ x: r.x + wa.x - L.bx.x, y: r.y + wa.y - L.bx.y, w: r.w, h: r.h });
    };
    const writePlane = (r, d) => {
      bump();
      if (isMask) { const m = L.mask.m; for (let y = 0; y < r.h; y++) m.set(d.subarray(y * r.w, (y + 1) * r.w), (r.y + y) * wa.w + r.x); return; }
      L.surf.write({ x: r.x + wa.x - L.bx.x, y: r.y + wa.y - L.bx.y, w: r.w, h: r.h }, d);
    };
    const grow = (r) => {   // r wa-local; allocation on the 256 px wa grid, clipped to wa
      if (isMask) return true;
      const g = { x: Math.floor(r.x / GROW) * GROW, y: Math.floor(r.y / GROW) * GROW };
      g.w = Math.min(wa.w, Math.ceil((r.x + r.w) / GROW) * GROW) - g.x; g.h = Math.min(wa.h, Math.ceil((r.y + r.h) / GROW) * GROW) - g.y;
      const want = { x: g.x + wa.x, y: g.y + wa.y, w: g.w, h: g.h };
      let nb = union(L.bx, want);
      if (L.bx && eqRect(nb, L.bx)) return true;
      if (L.bx && inter(L.bx, want) && eqRect(union(L.bx, want), L.bx)) return true;
      // every resize copies the whole surface in the middle of a stroke: fewer, larger steps. The first edit takes the whole work
      // area when it is small and memory allows (desktop); later growth adds at least half the current size on each growing side.
      const G = doc.gfx, room = (n) => G.bytes() + n <= G.limit;   // no reclaim just for the head room
      const waR = { x: wa.x, y: wa.y, w: wa.w, h: wa.h };
      if (!L.bx) {
        if (!G.touch && !G.lowMem && wa.w * wa.h <= FULL_PX && room(wa.w * wa.h * 4 * 2)) nb = waR;
      } else {
        const px = Math.max(GROW, L.bx.w >> 1), py = Math.max(GROW, L.bx.h >> 1);
        let x0 = nb.x, y0 = nb.y, x1 = nb.x + nb.w, y1 = nb.y + nb.h;
        if (x0 < L.bx.x) x0 -= px;
        if (y0 < L.bx.y) y0 -= py;
        if (x1 > L.bx.x + L.bx.w) x1 += px;
        if (y1 > L.bx.y + L.bx.h) y1 += py;
        const padded = inter({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, waR);
        if (padded && room((padded.w * padded.h + nb.w * nb.h) * 4)) nb = union(padded, nb);
      }
      try {
        if (!L.surf) { L.surf = doc.gfx.surface(nb.w, nb.h, "layer"); }
        else L.surf.resize(nb.w, nb.h, { x: L.bx.x - nb.x, y: L.bx.y - nb.y });
      } catch (e) { doc.lastError = "memory"; return false; }
      L.bx = nb;
      return true;
    };
    const pre = new Map();   // tile key: its pixels as the tool read them before any write of this session (the brush start tiles)
    const touch = (r0) => {
      const r = inter(rectI(r0), { x: 0, y: 0, w: wa.w, h: wa.h });
      if (!r) return true;
      if (!grow(r)) return false;
      const tx0 = Math.floor(r.x / TILE), ty0 = Math.floor(r.y / TILE), tx1 = Math.floor((r.x + r.w - 1) / TILE), ty1 = Math.floor((r.y + r.h - 1) / TILE);
      for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
        const key = tx + "," + ty;
        if (tiles.has(key)) continue;
        const tr = inter({ x: tx * TILE, y: ty * TILE, w: TILE, h: TILE }, { x: 0, y: 0, w: wa.w, h: wa.h });
        const kept = pre.get(key);
        pre.delete(key);
        tiles.set(key, { r: tr, before: kept || readPlane(tr), after: null });
      }
      return true;
    };
    /** remembers every whole tile inside a read rect that no write has touched yet (its pixels are the undo "before") */
    const keepRead = (c, d) => {
      if (isMask) return;
      const tx0 = Math.ceil(c.x / TILE), ty0 = Math.ceil(c.y / TILE);
      for (let ty = ty0; ty * TILE < c.y + c.h; ty++) for (let tx = tx0; tx * TILE < c.x + c.w; tx++) {
        const key = tx + "," + ty;
        if (tiles.has(key) || pre.has(key)) continue;
        const tr = inter({ x: tx * TILE, y: ty * TILE, w: TILE, h: TILE }, { x: 0, y: 0, w: wa.w, h: wa.h });
        if (!tr || tr.x + tr.w > c.x + c.w || tr.y + tr.h > c.y + c.h) continue;
        const out = new Uint8ClampedArray(tr.w * tr.h * 4);
        for (let y = 0; y < tr.h; y++) out.set(d.subarray(((tr.y - c.y + y) * c.w + (tr.x - c.x)) * 4, ((tr.y - c.y + y) * c.w + (tr.x - c.x) + tr.w) * 4), y * tr.w * 4);
        pre.set(key, out);
      }
    };
    // the surface handed to tools: wa-local coordinates (mask planes as RGBA (255, 255, 255, m))
    const surface = {
      w: wa.w, h: wa.h, cv: null, ctx: null, ox: wa.x, oy: wa.y, mask: isMask, m: isMask ? L.mask.m : null,
      read(r0) {
        const r = rectI(r0), out = new Uint8ClampedArray(r.w * r.h * 4), c = inter(r, { x: 0, y: 0, w: wa.w, h: wa.h });
        if (!c) return out;
        const d = readPlane(c);
        keepRead(c, d);
        for (let y = 0; y < c.h; y++) {
          if (isMask) {
            for (let x = 0; x < c.w; x++) { const o = ((c.y - r.y + y) * r.w + (c.x - r.x + x)) * 4; out[o] = out[o + 1] = out[o + 2] = 255; out[o + 3] = d[y * c.w + x]; }
          } else out.set(d.subarray(y * c.w * 4, (y + 1) * c.w * 4), ((c.y - r.y + y) * r.w + (c.x - r.x)) * 4);
        }
        return out;
      },
      write(r0, d) {
        const r = rectI(r0), c = inter(r, { x: 0, y: 0, w: wa.w, h: wa.h });
        if (!c || !touch(c)) return;
        if (isMask) {
          const m = new Uint8Array(c.w * c.h);
          for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) m[y * c.w + x] = d[((c.y - r.y + y) * r.w + (c.x - r.x + x)) * 4 + 3];
          writePlane(c, m);
          return;
        }
        const part = new Uint8ClampedArray(c.w * c.h * 4);
        for (let y = 0; y < c.h; y++) part.set(d.subarray(((c.y - r.y + y) * r.w + (c.x - r.x)) * 4, ((c.y - r.y + y) * r.w + (c.x - r.x) + c.w) * 4), y * c.w * 4);
        writePlane(c, part);
      },
      clear(r0) {
        const r = r0 ? inter(rectI(r0), { x: 0, y: 0, w: wa.w, h: wa.h }) : { x: 0, y: 0, w: wa.w, h: wa.h };
        if (!r || !touch(r)) return;
        writePlane(r, isMask ? new Uint8Array(r.w * r.h) : new Uint8ClampedArray(r.w * r.h * 4));
      },
      fill(rgb, r0) { const r = r0 || { x: 0, y: 0, w: wa.w, h: wa.h }; const d = new Uint8ClampedArray(r.w * r.h * 4); for (let i = 0; i < d.length; i += 4) { d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255; } surface.write(r, d); },
      draw(src, o = {}) {
        const p = pixelsOf(src) || (src && src.read ? { w: src.w, h: src.h, d: src.read({ x: 0, y: 0, w: src.w, h: src.h }) } : null);
        if (!p) return;
        const dr = { x: Math.round(o.dx || 0), y: Math.round(o.dy || 0), w: Math.round(o.dw == null ? p.w : o.dw), h: Math.round(o.dh == null ? p.h : o.dh) };
        const c = inter(dr, { x: 0, y: 0, w: wa.w, h: wa.h });
        if (!c || !touch(c)) return;
        if (isMask) return;
        bump();
        L.surf.draw(src && src.cv ? src.cv : src, { ...o, dx: dr.x + wa.x - L.bx.x, dy: dr.y + wa.y - L.bx.y });
      },
      resize() {}, free() {},
    };
    let closed = false;
    const finish = () => { closed = true; pre.clear(); if (isMask && L.mask) L.mask.live = false; };
    const ed = {
      surface, plane: isMask ? "mask" : "px", layer: L,
      touch(r) { return touch(r); },
      /** → the pixCmd (not pushed); used by mergeDown */
      take(lk) {
        finish();
        if (!tiles.size && !maskCreated) return null;
        const revBefore = isMask ? (maskCreated ? null : L.mask.rev) : L.rev;
        for (const t of tiles.values()) t.after = readPlane(t.r);
        const revAfter = doc._newRev();
        if (isMask) L.mask = { ...L.mask, rev: revAfter, alpha: null }; else L.rev = revAfter;
        const c = pixCmd(L.id, isMask ? "mask" : "px", tiles, bxBefore, L.bx ? { ...L.bx } : null, lk);
        c.revs = [revBefore, revAfter];
        c.maskCreated = maskCreated;
        return c;
      },
      /** opts.props [[path, before, after]]: layer property changes made with this stroke (trace preset, card cell); applied
       *  now and undone/redone with the pixels (paths as setProp: "p", "p.<k>", "ce", "it", "nm", "vis", "op", "bl", "lk") */
      commit(lk, log, opts = {}) {
        if (closed) return;
        const mx = log && Number.isFinite(log.mx) ? log.mx : null;
        const props = doc._strokeProps(L, opts && opts.props);
        const c = ed.take(lk);
        if (!c) { for (const [p, , a] of props) doc._setPath("layer", L.id, p, clone(a)); return; }
        c.props = props;
        for (const [p, , a] of props) doc._setPath("layer", L.id, p, clone(a));
        if (props.length) c.bytes += 64 + jsonBytes(props);
        const u0 = c.undo, r0 = c.redo;
        c.undo = (d) => { u0(d); for (const [p, b] of c.props || []) d._setPath("layer", c.layerId, p, clone(b)); };
        c.redo = (d) => { r0(d); for (const [p, , a] of c.props || []) d._setPath("layer", c.layerId, p, clone(a)); };
        const mx0 = L.mx;
        if (mx != null && mx > L.mx) L.mx = Math.round(mx);
        c.mx = [mx0, L.mx];
        if (log) {
          const d = { ...log }; delete d.mx;
          const op = d.o || (isMask ? "mask" : lk);
          if (!Number.isFinite(d.a)) {
            let area = 0; for (const t of tiles.values()) area += t.r.w * t.r.h;
            const o = doc._outArea();
            d.a = o ? Math.min(1000, Math.round((area * 1000) / o)) : 0;
          }
          c.log = { ...doc._delta(op, { y: L.id }), ...d, o: op, y: L.id, s: doc._delta(op).s };
        }
        // same-tool strokes on the same plane within 2 s merge into one row (「복제 도장 획 4개」)
        c.strokeLk = lk;
        c.merge = (n) => {
          if (n.kind !== "pix" || n.layerId !== c.layerId || n.plane !== c.plane || n.strokeLk !== c.strokeLk || n.maskCreated || n.t - c.t > 2000) return false;
          for (const [k, t] of n.tiles) { const o = c.tiles.get(k); if (o) o.after = t.after; else c.tiles.set(k, t); }
          c.bxAfter = n.bxAfter; c.revs = [c.revs[0], n.revs[1]]; c.r1 = n.r1; c.t = n.t; c.mx = [c.mx[0], n.mx[1]];
          for (const [p, b, a] of n.props || []) { const o = (c.props = c.props || []).find((x) => x[0] === p); if (o) o[2] = a; else c.props.push([p, b, a]); }
          c.ln = (c.ln || 1) + 1; c.lk = "strokes:" + c.strokeLk;
          if (c.log && n.log) c.log = { ...c.log, n: (c.log.n || 1) + (n.log.n || 1), a: Math.max(c.log.a || 0, n.log.a || 0) };
          let b = 0; for (const t of c.tiles.values()) b += (t.before ? t.before.length : 0) + (t.after ? t.after.length : 0);
          c.bytes = b;
          return true;
        };
        doc._record(c, () => {});
        doc._changed("pixels", "out");
      },
      cancel() {
        if (closed) return;
        finish();
        for (const t of tiles.values()) writePlane(t.r, t.before);
        if (maskCreated && L.mask === maskCreated) L.mask = null;
      },
    };
    return ed;
  }
  _pixApply(c, which) {
    const L = this._all.get(c.layerId);
    if (!L) return;
    const wa = this.wa;
    if (c.plane === "mask") {
      if (c.maskCreated) {
        if (which === "before") { L.mask = null; return; }
        if (!L.mask) L.mask = { ...c.maskCreated };
      }
      if (!L.mask) return;
      for (const t of c.tiles.values()) { const d = t[which]; for (let y = 0; y < t.r.h; y++) L.mask.m.set(d.subarray(y * t.r.w, (y + 1) * t.r.w), (t.r.y + y) * wa.w + t.r.x); }
      L.mask = { ...L.mask, rev: which === "before" ? c.revs[0] : c.revs[1], alpha: null };
      return;
    }
    if (!L.surf || !L.bx) return;
    for (const t of c.tiles.values()) L.surf.write({ x: t.r.x + wa.x - L.bx.x, y: t.r.y + wa.y - L.bx.y, w: t.r.w, h: t.r.h }, t[which]);
    L.rev = which === "before" ? c.revs[0] : c.revs[1];
    if (c.mx) L.mx = which === "before" ? c.mx[0] : c.mx[1];
  }
  _outArea() { const o = this.outSize(); return o.w * o.h; }
  /** output size after crop and 90° rotation */
  outSize() {
    const c = this.geo.crop || { x: 0, y: 0, w: this.w, h: this.h };
    return this.geo.rot === 90 || this.geo.rot === 270 ? { w: c.h, h: c.w } : { w: c.w, h: c.h };
  }
  /** @returns {{surface:Surface, plane:"px"|"mask", touch(r:Rect):boolean, commit(lk:string, log:object):void, cancel():void}}
   *  throws on the base, a locked, missing or unknown layer, and on "px" for non-pixel kinds (callers check first) */
  beginEdit(id, plane = "px") {
    const L = id ? this.layer(id) : null;
    if (!id || !L) { this.lastError = "base"; throw Object.assign(new Error("beginEdit: base"), { code: "base" }); }
    if (L.missing || L.opaque) { this.lastError = "missing"; throw Object.assign(new Error("beginEdit: missing layer"), { code: "missing" }); }
    if (L.lk) { this.lastError = "locked"; throw Object.assign(new Error("beginEdit: locked layer"), { code: "locked" }); }
    if (plane === "mask" ? !BASE_KINDS.has(L.k) : !PIXEL_KINDS.has(L.k)) { this.lastError = "base"; throw Object.assign(new Error("beginEdit: not a pixel plane"), { code: "base" }); }
    return this._editSession(L, plane === "mask" ? "mask" : "px");
  }
  /* ---------- history ---------- */
  undo() { const r = this.history.undo(this); if (r) this._changed("undo", r.cmd.fx); this._emit("history"); return r ? { lk: r.lk, ln: r.ln } : null; }
  redo() { const r = this.history.redo(this); if (r) this._changed("redo", r.cmd.fx); this._emit("history"); return r ? { lk: r.lk, ln: r.ln } : null; }
  canUndo() { return this.history.index >= 0; }
  canRedo() { return this.history.index < this.history.items.length - 1; }
  list() { return this.history.list(); }
  jumpTo(i) { this.history.jumpTo(this, i); this._changed("jump", "out"); this._emit("history"); }
  /** memory relief (the editor's memory message): drops undo steps, oldest first after the redo branch, so the layers they
   *  keep alive (deleted, merged, undone additions) free their canvases. keep: undo steps that always stay (default 0);
   *  need: stop as soon as that many canvas bytes fit under gfx.limit. → {dropped, freed} (freed: canvas bytes) */
  trimHistory({ keep = 0, need = 0 } = {}) {
    const G = this.gfx, b0 = G.bytes();
    const stop = need > 0 ? () => G.bytes() + need <= G.limit : null;
    const dropped = this.history.trim(keep, stop);
    if (dropped) this._emit("history");
    return { dropped, freed: Math.max(0, b0 - G.bytes()) };
  }
  /** records the history position at stage entry */
  stageMark(stage) { this._marks[stage] = { id: this.history.topId }; this.history.barrier = this.history.topId; }
  stageMarkAvailable(stage) {
    const m = this._marks[stage];
    if (!m) return false;
    if (m.id === this.history.evicted) return true;
    return this.history.items.some((c) => c.id === m.id);
  }
  undoToStageMark(stage) {
    if (!this.stageMarkAvailable(stage)) return false;
    const m = this._marks[stage], i = this.history.items.findIndex((c) => c.id === m.id);
    this.jumpTo(i);
    return true;
  }
  /** an fx command was committed in this stage since its last confirmed snapshot */
  stageChanged(stage, fx = "out") {
    if (this._stageDirty[stage]) return true;
    const mark = this._snap[stage] || 0;
    for (const k of Object.keys(this.history.gone)) {   // commands that left the history (evicted or trimmed) still count
      const i = k.indexOf("|"), st = k.slice(0, i), f = k.slice(i + 1);
      if (st === stage && this.history.gone[k] > mark && (f === fx || (fx === "any" && f !== "view"))) return true;
    }
    for (let i = 0; i <= this.history.index; i++) {
      const c = this.history.items[i];
      if (c.stage === stage && c.id > mark && (c.fx === fx || (fx === "any" && c.fx !== "view"))) return true;
    }
    return false;
  }
  /** the Saver records the snapshot it uploaded for a stage (id = history.topId at encode time) */
  markSnap(stage, id = this.history.topId) { this._snap[stage] = id; this._stageDirty[stage] = false; }
  /* ---------- persistence ---------- */
  _planeDirty(L) { return !L.missing && !L.opaque && ((PIXEL_KINDS.has(L.k) && L.rev !== L.savedRev) || (L.k === "ai" && !!L.src)); }
  _maskDirty(L) { return !L.missing && !L.opaque && !!L.mask && L.mask.rev !== L.mask.savedRev; }
  /** tiled colour planes the manifest may still gain (LIMITS.tiledPlanes minus tiled planes kept from earlier saves) */
  tiledLeft() {
    let n = 0;
    for (const L of this.layers) {
      const c = L.opaque ? L.opaque.c : L.missing ? L.rec && L.rec.c : this._planeDirty(L) ? null : L.ptr.c;
      if (c && Array.isArray(c.parts)) n++;
    }
    return Math.max(0, this.limits.tiledPlanes - n);
  }
  _worstBx() {
    const wa = this.wa;
    return { x: widest(wa.x, wa.x + wa.w), y: widest(wa.y, wa.y + wa.h), w: widest(1, wa.w), h: widest(1, wa.h) };
  }
  /** @param {{ptrs?:PtrMap, worst?:boolean, draft?:boolean, stamp?:string}} o
   *  ptrs: pending pointers overlaid without marking them saved; worst: every dirty plane gets the widest legal pointer;
   *  draft: layers never saved carry dp:1 (draft-only). → { doc, L, route, pins, lines, nid, act } as §2.4 */
  toManifest(o = {}) {
    const ptrs = o.ptrs || null, worst = !!o.worst, stamp = o.stamp || stamp36();
    let tiles = worst ? this.tiledLeft() : 0;
    const L = this.layers.map((x) => {
      if (x.opaque) return clone(x.opaque);
      if (x.missing) return { ...clone(x.rec), ms: 1 };
      const r = { id: x.id, k: KINDS.indexOf(x.k) };
      const codes = TCODE[x.k];
      if (codes) { const ti = codes.indexOf(x.t); if (ti > 0) r.t = ti; }
      if (x.nm) r.nm = x.nm;
      if (!x.vis) r.vis = 0;
      const op = Math.round(x.op * 100);
      if (op < 100) r.op = Math.max(0, Math.min(99, op));
      if (BASE_KINDS.has(x.k) && x.bl) r.bl = x.bl;
      if (x.lk) r.lk = 1;
      if (x.it) r.it = x.it;
      if (x.k === "tr" && x.ce) r.ce = x.ce;
      if (BASE_KINDS.has(x.k) && x.cov) r.cov = clampI(x.cov, 0, 1000);
      const pix = PIXEL_KINDS.has(x.k) || x.k === "ai";
      if (pix && x.g) r.g = clampI(x.g, 0, 999);
      if (PIXEL_KINDS.has(x.k) && x.mx) r.mx = clampI(x.mx, 0, 1000);
      if (pix && x.po) r.po = clampI(x.po, 0, this.limits.pins);
      // colour (+ alpha) plane
      if (pix) {
        let cp = ptrs && ptrs.get(x.id + ":c");
        if (!cp && worst && this._planeDirty(x)) {
          const ref = (part) => mkRef(KEYS.edit, "L" + x.id, stamp, part);
          if (x.k === "ai") cp = { bx: this._worstBx(), c: { ref: ref(), f: 1 } };
          else if (tiles > 0) { tiles--; cp = { bx: this._worstBx(), c: { f: 1, s: 0.512, parts: [0, 1, 2, 3].map((i) => ({ ref: ref("t" + i) })) }, a: { ref: ref("a"), s: 0.25, f: 1 } }; }
          else cp = { bx: this._worstBx(), c: { ref: ref(), f: 1, s: 0.512 }, a: { ref: ref("a"), s: 0.25, f: 1 } };
        }
        if (!cp) cp = x.ptr;   // the last saved pointer: a consistent earlier version of the plane
        if (cp && cp.c) {
          if (x.k === "ai") r.bx = worst ? this._worstBx() : { ...(x.bx || this._aiRect(x)) };
          else if (cp.bx) r.bx = { ...cp.bx };
          r.c = clone(cp.c);
          if (cp.a) r.a = clone(cp.a);
        }
      }
      // mask
      if (x.mask && BASE_KINDS.has(x.k)) {
        let mp = ptrs && ptrs.get(x.id + ":m");
        mp = mp ? mp.mk : null;
        if (!mp && worst && this._maskDirty(x)) mp = { ref: mkRef(KEYS.edit, "M" + x.id, stamp), s: 0.25, f: 1 };
        if (!mp) mp = x.ptr.mk || null;
        if (mp) {
          r.mk = { ref: mp.ref, s: mp.s, f: mp.f };
          if (!x.mask.on) r.mk.on = 0;
          if (x.mask.fe) r.mk.fe = x.mask.fe;
        }
      }
      if (x.p && Object.keys(x.p).length) r.p = clone(x.p);
      if (o.draft && ((pix && this._planeDirty(x) && !x.ptr.c) || (x.mask && this._maskDirty(x) && !x.ptr.mk))) r.dp = 1;
      for (const k of Object.keys(x.extra || {})) if (!(k in r) && !KNOWN_REC.has(k)) r[k] = clone(x.extra[k]);
      return r;
    });
    const g = this.geo, out = this.outSize();
    const doc = { w: this.w, h: this.h, crop: g.crop ? { ...g.crop } : null };
    if (g.r) doc.r = g.r;
    if (g.rot) doc.rot = g.rot;
    if (g.ext && (g.ext.t || g.ext.r || g.ext.b || g.ext.l)) doc.ext = { ...g.ext };
    doc.fill = (g.fill || [255, 255, 255]).slice();
    doc.out = { w: out.w, h: out.h };
    doc.cal = g.cal ? { ...g.cal } : null;
    for (const k of Object.keys(this._docExtra || {})) if (!(k in doc)) doc[k] = clone(this._docExtra[k]);
    const z = () => [0, 0, 0, 0, 0, 0, 0, 0];
    return {
      doc, L, route: this.route ? clone(this.route) : { s: z(), m: z(), o: z() }, pins: clone(this.pins), lines: clone(this.lines),
      nid: this.nid, act: this.activeId,
    };
  }
  /** → jsonBytes of the worst-case manifest: toManifest({worst:true}) plus the widest non-document half (§2.6) */
  projectedBytes() { return jsonBytes({ ...WORST_REST, ...this.toManifest({ worst: true }) }); }
  /** @param {(ptr:{ref:string})=>Promise<{img:CanvasImageSource|null, missing:boolean, error:boolean}>} load
   *  @returns {Promise<{doc:PhotoDoc, missing:number[], errors:number[]}>} */
  static async fromManifest(gfx, edit, baseImg, load, o = {}) {
    const e = isPlain(edit) ? edit : {};
    const d0 = isPlain(e.doc) ? e.doc : {};
    let base = null;
    if (baseImg) base = gfx.fromImage(baseImg);
    const w = base ? base.w : Math.max(1, d0.w | 0), h = base ? base.h : Math.max(1, d0.h | 0);
    if (!base) base = gfx.surface(w, h, "base");
    const doc = new PhotoDoc(gfx, { ...o, base, w, h });
    doc._setGeoRaw({
      crop: isPlain(d0.crop) ? d0.crop : null, r: clampI(d0.r, -150, 150), rot: [0, 90, 180, 270].includes(d0.rot) ? d0.rot : 0,
      ext: isPlain(d0.ext) ? { t: clampI(d0.ext.t, 0, 150), r: clampI(d0.ext.r, 0, 150), b: clampI(d0.ext.b, 0, 150), l: clampI(d0.ext.l, 0, 150) } : { t: 0, r: 0, b: 0, l: 0 },
      fill: Array.isArray(d0.fill) && d0.fill.length === 3 ? d0.fill.map((x) => clampI(x, 0, 255)) : [255, 255, 255],
      cal: isPlain(d0.cal) ? d0.cal : null,
    });
    doc._docExtra = {};
    for (const k of Object.keys(d0)) if (!["w", "h", "crop", "r", "rot", "ext", "fill", "out", "cal"].includes(k)) doc._docExtra[k] = d0[k];
    doc.pins = Array.isArray(e.pins) ? clone(e.pins) : [];
    doc.lines = Array.isArray(e.lines) ? clone(e.lines) : [];
    doc.route = isPlain(e.route) ? clone(e.route) : null;
    const missing = [], errors = [];
    const recs = Array.isArray(e.L) ? e.L : [];
    // fetch at most three media docs at a time
    const queue = [];
    const pool = async (tasks, n = 3) => {
      let i = 0;
      const run = async () => { while (i < tasks.length) { const k = i++; await tasks[k](); } };
      await Promise.all(Array.from({ length: Math.min(n, tasks.length) }, run));
    };
    for (const rec of recs) {
      if (!isPlain(rec)) continue;
      const kind = typeof rec.k === "number" ? KINDS[rec.k] : null;
      if (!kind || !Number.isInteger(rec.id)) {
        const L = doc._rt("opaque", { id: Number.isInteger(rec.id) && rec.id > 0 ? rec.id : undefined });
        L.k = "opaque"; L.opaque = clone(rec); L.opaqueZone = 99;
        doc.layers.push(L);
        continue;
      }
      const codes = TCODE[kind];
      const L = doc._rt(kind, {
        id: rec.id, t: codes ? codes[Number.isInteger(rec.t) ? rec.t : 0] || codes[0] : "", nm: typeof rec.nm === "string" && rec.nm ? rec.nm : null,
        vis: rec.vis === 0 ? 0 : 1, op: Number.isFinite(rec.op) ? clampI(rec.op, 0, 100) / 100 : 1, bl: Number.isInteger(rec.bl) ? clampI(rec.bl, 0, BLENDS.length - 1) : 0,
        lk: rec.lk ? 1 : 0, it: clampI(rec.it, 0, 8), ce: clampI(rec.ce, 0, 4), p: isPlain(rec.p) && pOk(kind, codes ? (codes[Number.isInteger(rec.t) ? rec.t : 0] || codes[0]) : "_", rec.p) ? rec.p : null,
        mx: clampI(rec.mx, 0, 1000), cov: clampI(rec.cov, 0, 1000), g: clampI(rec.g, 0, 999), po: clampI(rec.po, 0, 99),
      });
      for (const k of Object.keys(rec)) if (!KNOWN_REC.has(k)) L.extra[k] = clone(rec[k]);
      L.rec = compactRec(rec);
      L.rev = 0; L.savedRev = 0;
      doc.layers.push(L);
      queue.push(async () => {
        const fail = { missing: false, error: false };
        const get = async (ptr) => {
          let r;
          try { r = await load(ptr); } catch (err) { r = { img: null, missing: false, error: true }; }
          if (!r || !r.img) { if (r && r.missing) fail.missing = true; else fail.error = true; return null; }
          return r.img;
        };
        try {
          if (rec.c && (PIXEL_KINDS.has(kind) || kind === "ai")) {
            if (kind === "ai") {
              const img = await get(rec.c);
              if (img) { L.surf = gfx.fromImage(img); if (img.close) img.close(); L.bx = doc._aiRect(L); L.ptr.c = clone(rec.c); if (isPlain(rec.bx)) L.ptr.bx = clone(rec.bx); }
            } else if (isPlain(rec.bx) && rec.bx.w > 0 && rec.bx.h > 0) {
              const bx = { x: rec.bx.x | 0, y: rec.bx.y | 0, w: rec.bx.w | 0, h: rec.bx.h | 0 };
              const surf = gfx.surface(bx.w, bx.h, "layer");
              const parts = Array.isArray(rec.c.parts) ? rec.c.parts : null;
              if (parts) {
                const rs = tileRects(bx.w, bx.h);
                for (let i = 0; i < 4; i++) {
                  const img = parts[i] ? await get(parts[i]) : (fail.missing = true, null);
                  if (img) { surf.draw(img, { dx: rs[i].x, dy: rs[i].y, dw: rs[i].w, dh: rs[i].h }); if (img.close) img.close(); }
                }
              } else {
                const img = await get(rec.c);
                if (img) { surf.draw(img, { dx: 0, dy: 0, dw: bx.w, dh: bx.h }); if (img.close) img.close(); }
              }
              if (rec.a) {
                const img = await get(rec.a);
                if (img) {
                  const g = gfx.surface(bx.w, bx.h, "scratch");
                  g.draw(img, { dx: 0, dy: 0, dw: bx.w, dh: bx.h }); if (img.close) img.close();
                  const ad = g.read({ x: 0, y: 0, w: bx.w, h: bx.h }), cd = surf.read({ x: 0, y: 0, w: bx.w, h: bx.h });
                  for (let i = 0; i < cd.length; i += 4) { const v = ad[i]; cd[i + 3] = v < 4 ? 0 : v > 251 ? 255 : v; }
                  surf.write({ x: 0, y: 0, w: bx.w, h: bx.h }, cd);
                  g.free();
                }
              }
              L.surf = surf; L.bx = bx;
              L.ptr.bx = { ...bx }; L.ptr.c = clone(rec.c); if (rec.a) L.ptr.a = clone(rec.a);
            }
          }
          if (rec.mk && isPlain(rec.mk) && BASE_KINDS.has(kind)) {
            const img = await get(rec.mk);
            if (img) {
              const wa = doc.wa, g = gfx.surface(wa.w, wa.h, "scratch");
              g.draw(img, { dx: 0, dy: 0, dw: wa.w, dh: wa.h }); if (img.close) img.close();
              const gd = g.read({ x: 0, y: 0, w: wa.w, h: wa.h }), m = new Uint8Array(wa.w * wa.h);
              for (let i = 0, j = 0; j < m.length; i += 4, j++) { const v = gd[i]; m[j] = v < 4 ? 0 : v > 251 ? 255 : v; }
              g.free();
              L.mask = { m, on: rec.mk.on === 0 ? 0 : 1, fe: clampI(rec.mk.fe, 0, 50), rev: 0, savedRev: 0, src: "", alpha: null };
              L.ptr.mk = { ref: rec.mk.ref, s: rec.mk.s, f: rec.mk.f };
            }
          }
        } catch (err) { fail.error = true; }
        if (fail.missing || fail.error) {
          L.missing = true;
          if (L.surf) { L.surf.free(); L.surf = null; }
          L.mask = null;
          (fail.missing && !fail.error ? missing : errors).push(L.id);
        }
      });
    }
    await pool(queue, 3);
    doc._sortLayers();
    const ids = doc.layers.map((L) => L.id);
    doc.nid = Math.max(Number.isInteger(e.nid) ? e.nid : 1, ids.length ? Math.max(...ids) + 1 : 1, doc.nid);
    doc.activeId = Number.isInteger(e.act) && (e.act === 0 || ids.includes(e.act)) ? e.act : 0;
    doc.stage = STAGES[e.st] || STAGES[0];
    return { doc, missing, errors };
  }
  /** → Job[] (rev ≠ savedRev; raw:true for an AI layer with src; never for missing layers) */
  dirtyJobs() {
    const jobs = [];
    for (const L of this.layers) {
      if (L.missing || L.opaque) continue;
      if (L.k === "ai" && L.src) jobs.push({ layerId: L.id, role: "c", rev: L.rev, raw: true });
      else if (PIXEL_KINDS.has(L.k) && L.rev !== L.savedRev) jobs.push({ layerId: L.id, role: "c", rev: L.rev });
      if (L.mask && L.mask.rev !== L.mask.savedRev) jobs.push({ layerId: L.id, role: "m", rev: L.mask.rev });
    }
    return jobs;
  }
  /** revByPlane Map "id:role" → rev of the draft; → the dirty planes whose rev differs from the draft's (§6.8) */
  draftJobs(revByPlane) {
    const m = revByPlane instanceof Map ? revByPlane : new Map(Object.entries(revByPlane || {}));
    return this.dirtyJobs().filter((j) => m.get(j.layerId + ":" + j.role) !== j.rev);
  }
  /** → { canvas, rect, s:1, gray, fill:null }: the plane a job encodes (colour: the layer surface over its allocated rect in
   *  base px; mask: a new grey wa-sized surface that the caller frees). Encoders use planeData. */
  jobCanvas(job) {
    this._alive();
    const L = this._all.get(job.layerId);
    if (!L) return { canvas: null, rect: null, s: 1, gray: false, fill: null };
    if (job.role === "m") {
      const wa = this.wa, s = this.gfx.surface(wa.w, wa.h, "scratch"), m = L.mask ? L.mask.m : new Uint8Array(wa.w * wa.h);
      const d = new Uint8ClampedArray(wa.w * wa.h * 4);
      for (let i = 0, j = 0; j < m.length; i += 4, j++) { d[i] = d[i + 1] = d[i + 2] = m[j]; d[i + 3] = 255; }
      s.write({ x: 0, y: 0, w: wa.w, h: wa.h }, d);
      return { canvas: s, rect: { ...wa }, s: 1, gray: true, fill: null, free: () => s.free() };
    }
    return { canvas: L.surf, rect: L.bx ? { ...L.bx } : null, s: 1, gray: false, fill: null, free: () => {} };
  }
  /** pixel data of a job's plane: { d:RGBA, rect (base px, content bounds), opaque, empty, src? } (colour) or { m, w, h } (mask) */
  planeData(job) {
    this._alive();
    const L = this._all.get(job.layerId);
    if (!L) return { empty: true };
    if (job.role === "m") return { m: L.mask ? L.mask.m : null, w: this.wa.w, h: this.wa.h, rect: { ...this.wa }, rev: L.mask ? L.mask.rev : -1 };
    if (L.k === "ai") return { src: L.src, rect: L.bx ? { ...L.bx } : this._aiRect(L), rev: L.rev, empty: !L.src };
    if (!L.surf || !L.bx) return { empty: true, rev: L.rev };
    const bx = L.bx, d = L.surf.read({ x: 0, y: 0, w: bx.w, h: bx.h });
    let x0 = bx.w, y0 = bx.h, x1 = -1, y1 = -1, opaque = true;
    for (let y = 0; y < bx.h; y++) for (let x = 0; x < bx.w; x++) {
      const a = d[(y * bx.w + x) * 4 + 3];
      if (a) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return { empty: true, rev: L.rev };
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1, out = new Uint8ClampedArray(cw * ch * 4);
    for (let y = 0; y < ch; y++) out.set(d.subarray(((y0 + y) * bx.w + x0) * 4, ((y0 + y) * bx.w + x1 + 1) * 4), y * cw * 4);
    for (let i = 3; i < out.length; i += 4) if (out[i] !== 255) { opaque = false; break; }
    return { d: out, rect: { x: bx.x + x0, y: bx.y + y0, w: cw, h: ch }, opaque, empty: false, rev: L.rev };
  }
  /** base pixels for a rect in base px (outside the base: the fill colour) → RGBA (fills α = 0 pixels before JPEG, §6.1) */
  baseRGBA(r) {
    const out = new Uint8ClampedArray(r.w * r.h * 4), f = this.geo.fill || [255, 255, 255];
    for (let i = 0; i < out.length; i += 4) { out[i] = f[0]; out[i + 1] = f[1]; out[i + 2] = f[2]; out[i + 3] = 255; }
    const c = inter(r, { x: 0, y: 0, w: this.w, h: this.h });
    if (c && this.base) {
      const d = this.base.read(c);
      for (let y = 0; y < c.h; y++) out.set(d.subarray(y * c.w * 4, (y + 1) * c.w * 4), ((c.y - r.y + y) * r.w + (c.x - r.x)) * 4);
    }
    return out;
  }
  /** restores draft planes (incl. layers never saved), their rev, the selection RLE and the stage (§6.8) */
  async applyDraft(draft, decodeBlob) {
    if (!draft || !Array.isArray(draft.planes)) return { applied: 0, failed: [] };
    let applied = 0, maxRev = this._seq;
    const failed = [];
    for (const pl of draft.planes) {
      const L = this._all.get(pl && pl.layerId);
      if (!L || L.missing || L.opaque) { failed.push(pl && pl.layerId); continue; }
      try {
        if (pl.role === "c" && L.k === "ai") {
          if (typeof pl.data !== "string" || !pl.blob) throw new Error("no data");
          const img = await decodeBlob(pl.blob);
          if (L.surf) L.surf.free();
          L.surf = this.gfx.fromImage(img); if (img.close) img.close();
          L.src = pl.data; L.bx = this._aiRect(L);
        } else if (pl.role === "c") {
          const r = pl.rect;
          const img = pl.blob ? await decodeBlob(pl.blob) : null;
          if (L.surf) L.surf.free();
          L.surf = null; L.bx = null;
          if (img && r && r.w > 0 && r.h > 0) {
            L.surf = this.gfx.surface(r.w, r.h, "layer");
            L.surf.draw(img, { gco: "copy" }); if (img.close) img.close();
            L.bx = { x: r.x, y: r.y, w: r.w, h: r.h };
          }
        } else if (pl.role === "m") {
          const img = await decodeBlob(pl.blob);
          const wa = this.wa, g = this.gfx.surface(wa.w, wa.h, "scratch");
          g.draw(img, { dx: 0, dy: 0, dw: wa.w, dh: wa.h }); if (img.close) img.close();
          const gd = g.read({ x: 0, y: 0, w: wa.w, h: wa.h }), m = new Uint8Array(wa.w * wa.h);
          for (let i = 0, j = 0; j < m.length; i += 4, j++) m[j] = gd[i];
          g.free();
          L.mask = { m, on: L.mask ? L.mask.on : pl.on === 0 ? 0 : 1, fe: L.mask ? L.mask.fe : pl.fe | 0, rev: pl.rev, savedRev: L.mask ? L.mask.savedRev : -1, src: pl.src || "", alpha: null };
        } else continue;
        if (pl.role === "c") { L.rev = pl.rev; if (!L.ptr.c && L.k !== "ai") L.savedRev = -1; }
        if (Number.isFinite(pl.rev)) maxRev = Math.max(maxRev, pl.rev);
        applied++;
      } catch (e) { failed.push(L.id); }
    }
    this._seq = Math.max(this._seq, maxRev);
    if (draft.sel) {
      try { const m = rleDecode(draft.sel instanceof Uint8Array ? draft.sel : new Uint8Array(draft.sel), this.wa.w * this.wa.h); const bbox = maskBBox(m, this.wa.w, this.wa.h); this.sel = bbox ? { m, bbox, rev: 1 } : null; }
      catch (e) { this.sel = null; }
    }
    if (draft.stage && STAGES.includes(draft.stage)) this.stage = draft.stage;
    this.rev = this._newRev();   // restored work is unsaved
    this._changed("draft", "out");
    return { applied, failed };
  }
  /** savedRev = rev at encode time; ptr stored; src released for raw jobs */
  markSaved(job, ptr) {
    const L = this._all.get(job && job.layerId);
    if (!L || L.missing || L.opaque) return;
    if (job.role === "m") {
      if (L.mask && ptr && ptr.mk) { L.mask.savedRev = job.rev; L.ptr.mk = { ...ptr.mk }; }
      return;
    }
    L.savedRev = job.rev;
    const p = ptr || {};
    if (p.c) { L.ptr.c = clone(p.c); L.ptr.bx = p.bx ? { ...p.bx } : L.ptr.bx; } else { delete L.ptr.c; delete L.ptr.bx; }
    if (p.a) L.ptr.a = clone(p.a); else delete L.ptr.a;
    if (job.raw && L.rev === job.rev) L.src = null;
  }
  /** forgets a saved pointer so the plane is uploaded again under a new ref (its doc is gone, §6.9) */
  forgetPlane(id, role) {
    const L = this._all.get(id);
    if (!L || L.missing || L.opaque) return;
    if (role === "m") { if (L.mask) { L.mask.savedRev = -1; delete L.ptr.mk; } return; }
    L.savedRev = -1;
    if (L.k === "ai" && !L.src) { /* an AI layer cannot be re-encoded from pixels; keep its pointer */ L.savedRev = L.rev; return; }
    delete L.ptr.c; delete L.ptr.a; delete L.ptr.bx;
  }
  memoryBytes() { return this.gfx.bytes(); }
  /** zero every canvas */
  dispose() {
    this.disposed = true;
    for (const L of this._all.values()) { if (L.surf) { L.surf.free(); L.surf = null; } if (L.mask) L.mask.alpha = null; }
    if (this.base) this.base.free();
    this.history.dropPayloads();   // undo is gone with the canvases, but the log deltas stay for a save still running (R3)
  }
  /** throws {code:"disposed"} once dispose() ran: nothing may be encoded from freed canvases (R8) */
  _alive() { if (this.disposed) { const e = new Error("document disposed"); e.code = "disposed"; throw e; } }
  /** frees the canvases of layers that neither the document nor any remaining command can reach (removed, merged, discarded
   *  with a redo branch or evicted from the history) and forgets them (R2-01) */
  _gcLayers() {
    const keep = new Set(this.layers);
    const walk = (c) => {
      if (!c) return;
      if (c.cmds) c.cmds.forEach(walk);
      for (const st of [c.before, c.after]) {
        if (!st || typeof st !== "object") continue;
        (st.order || []).forEach((L) => keep.add(L));
        (st.masks || []).forEach(([L]) => keep.add(L));
        (st.props || []).forEach(([L]) => keep.add(L));
      }
      if (c.layerId != null && this._all.has(c.layerId)) keep.add(this._all.get(c.layerId));
    };
    this.history.items.forEach(walk);
    for (const [id, L] of [...this._all]) {
      if (keep.has(L)) continue;
      if (L.surf) { L.surf.free(); L.surf = null; }
      L.mask = null;
      this._all.delete(id);
    }
  }
}

/** a layer record without the default-valued fields normEdit restores (§2.4 "fields equal to their default are omitted") */
const REC_DEF = { t: 0, nm: null, vis: 1, op: 100, bl: 0, lk: 0, it: 0, ce: 0, cov: 0, g: 0, mx: 0, po: 0, p: null };
function compactRec(rec) {
  const o = clone(rec);
  delete o.ms; delete o.dp;
  for (const [k, v] of Object.entries(REC_DEF)) if (k in o && o[k] === v) delete o[k];
  return o;
}
/** tile rects of a w × h box split at floor(w/2), floor(h/2): t0 top left, t1 top right, t2 bottom left, t3 bottom right */
export function tileRects(w, h) {
  const hw = Math.floor(w / 2), hh = Math.floor(h / 2);
  return [{ x: 0, y: 0, w: hw, h: hh }, { x: hw, y: 0, w: w - hw, h: hh }, { x: 0, y: hh, w: hw, h: h - hh }, { x: hw, y: hh, w: w - hw, h: h - hh }];
}

/** the widest non-document half of the manifest (header, m, sr, snaps, ev, done, sent, pr; empty log) for projectedBytes */
const WORST_REST = (() => {
  const S = stamp36(4102444799999), T_S = 9999999999, T_MS = 4102444799999, HEX16 = "fedcba9876543210";
  const ref = (role, part) => mkRef(KEYS.edit, role, S, part);
  const sr = {};
  STAGES.forEach((k) => {
    sr[k] = { t0: T_S, e: LIMITS.tiMax, d: LIMITS.tiMax, n: LIMITS.stageN, ch: 1, sk: 1 };
    if (k === "patch") sr[k].tr = LIMITS.tries;
    if (k === "tone") Object.assign(sr[k], { mb: -1000, ct: -1000, sa: -1000, bg: [255, 255, 255, 255, 255, 255, 255, 255] });
  });
  return {
    v: 1, rev: 9999999, crev: 9999999, dev: 2147483647, sv: 2147483647, at: T_MS, st: 6,
    m: {
      base: { ref: ref("base"), w: 1600, h: 1600, r: 2, sg: HEX16, src: mkRef(KEYS.steps, "rc", S) },
      out: { ref: ref("out"), w: 2000, h: 2000, q: 92, cr: 9999999, th: { ref: ref("out", "th") } },
      cmp: { ref: ref("cmp"), w: 1600, h: 1600 },
    },
    sr,
    snaps: STAGES.map((k, s) => ({ s, ref: ref("S" + s), w: 800, h: 800 })),
    log: [],
    ev: Array.from({ length: LIMITS.ev }, () => ({ t: T_S, o: 3 })),
    done: { at: T_MS, n: LIMITS.doneN, un: LIMITS.doneN },
    sent: { s6a: T_MS, s6b: T_MS, s7x: T_MS },
    pr: { mode: 2, paper: 5, bw: 1, ppi: 999 },
  };
})();
export { WORST_REST as _WORST_REST };
