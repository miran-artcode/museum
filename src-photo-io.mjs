/* ============================================================
   이미지 다듬기: 부호화·미디어 저장·저장기(Saver)·이 기기 초안 (spec §5.4 src-photo-io.mjs, §6)
   담당 C. 미디어 쓰기는 모두 putMedia 하나를 거친다(카드·편집기·가져오기·보내기). 한글 문자열 없음(상태와 오류는 코드).
   · 미디어 값은 언제나 완전한 data:image/(jpeg|png);base64,… 하나, 950,000자 미만(assertMedia). WebP·JSON·조각 없음.
   · 올리기는 한 번에 하나씩(모듈 줄 세우기), 크기에 비례한 시간 제한, 시간이 지나도 원래 약속(promise)을 붙잡아 둔다.
   · fetch(data:)·Worker·ctx.filter를 쓰지 않는다(CSP, Safari). 캔버스는 다 쓰면 width = height = 0.
   · 초안은 IndexedDB "museum-photo"(store "drafts"), 쓸 수 없으면 메모리. sessionStorage에는 기기 번호만 둔다.
   ============================================================ */
import {
  KEYS, MEDIA_RE, MEDIA_MAX, mkRef, isFolioRef, uploadTimeout, stamp36, LIMITS, BUDGET, STAGES, THUMB, SNAP, OUT, CMP,
  graceMs,
} from "./src-folio-schema.mjs";
import {
  totalUpd, normEdit, clean, assertSafe, capsCheck, compactEdit, mergeManifest, editDiffRefs, liveRefs, addTrash,
  dropTrash, gcPlan, trashRefs, refsIn, stageRecUpdate, baseChoice,
} from "./src-portfolio-core.mjs";
import { T } from "./src-portfolio-text.mjs";

/* =====================================================================================================================
   1. small helpers
   ===================================================================================================================== */
const random31 = () => (Math.floor(Math.random() * 0x7ffffffe) + 1) | 0;
const sleep = (ms) => new Promise((r) => { const t = setTimeout(r, ms); if (t && t.unref) t.unref(); });
const yieldTask = () => new Promise((r) => setTimeout(r, 0));
const codeErr = (code, msg) => { const e = new Error(msg || code); e.code = code; return e; };
const isOffline = () => typeof navigator !== "undefined" && !!navigator && navigator.onLine === false;
const SEND_RE = /^(s6a\.(beforeImg|afterImg)|s7x\.img)\.\d{13}$/;
const refOk = (ref) => isFolioRef(ref) || SEND_RE.test(String(ref));
/** race a promise against ms; resolves the fallback value on timeout (timer cleared either way) */
function raceT(p, ms, fallback) {
  let t;
  return Promise.race([Promise.resolve(p).catch(() => fallback), new Promise((r) => { t = setTimeout(() => r(fallback), ms); })])
    .finally(() => clearTimeout(t));
}
const prefixOf = (type) => "data:" + type + ";base64,";
const b64len = (n) => 4 * Math.ceil(n / 3);

function bytesToB64(u8) {
  if (typeof Buffer === "function") return Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString("base64");
  let s = "";
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  return btoa(s);
}
function b64ToBytes(b64) {
  if (typeof Buffer === "function") return new Uint8Array(Buffer.from(b64, "base64"));
  const s = atob(b64), u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}
/** data URL → Blob (no fetch(data:), which the CSP's connect-src would block) */
export function dataUrlToBlob(data) {
  const s = String(data), c = s.indexOf(",");
  const head = s.slice(5, c), type = head.split(";")[0] || "application/octet-stream";
  return new Blob([b64ToBytes(s.slice(c + 1))], { type });
}
/** Blob → data URL (FileReader in browsers; arrayBuffer + base64 elsewhere) */
export async function blobToDataUrl(blob) {
  if (typeof FileReader === "function") {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.onerror = () => rej(fr.error || codeErr("read"));
      fr.readAsDataURL(blob);
    });
  }
  const u8 = new Uint8Array(await blob.arrayBuffer());
  return prefixOf(blob.type || "application/octet-stream") + bytesToB64(u8);
}

/* =====================================================================================================================
   2. canvases and encoders (§6.1)
   Every scratch canvas comes from gfx when one is given (so gfx.bytes() counts it) and is freed right after use.
   ===================================================================================================================== */
/** → { cv, ctx, free() } ; throws {code:"memory"} when the canvas cannot be allocated */
function scratch(w, h, gfx) {
  w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
  if (gfx && typeof gfx.surface === "function") {
    try {
      const s = gfx.surface(w, h, "scratch");
      if (s && s.cv) {
        const ctx = s.ctx || s.cv.getContext("2d");
        if (!ctx) { s.free(); throw codeErr("memory"); }
        return { cv: s.cv, ctx, free: () => s.free() };
      }
      if (s && s.free) s.free();
    } catch (e) { if (e && e.code === "memory") throw e; }
  }
  const doc = globalThis.document;
  if (!doc || typeof doc.createElement !== "function") throw codeErr("memory", "no canvas");
  const cv = doc.createElement("canvas");
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d");
  if (!ctx) { cv.width = cv.height = 0; throw codeErr("memory"); }
  return { cv, ctx, free: () => { cv.width = cv.height = 0; } };
}
const dimsOf = (src) => ({
  w: (src && (src.naturalWidth || src.videoWidth || src.width || src.w)) || 0,
  h: (src && (src.naturalHeight || src.videoHeight || src.height || src.h)) || 0,
});
/** a drawable for ctx.drawImage: a canvas, an image, an ImageBitmap, or a Surface (canvas-backed or, in tests, memory-backed) */
function drawableOf(src, gfx) {
  if (!src) throw codeErr("invalid", "no source");
  if (src.cv) return { img: src.cv, w: src.w, h: src.h, free: () => {} };
  if (typeof src.read === "function" && !src.cv) {   // memory Surface: copy its pixels into a scratch canvas
    const sc = scratch(src.w, src.h, gfx);
    const d = src.read({ x: 0, y: 0, w: src.w, h: src.h });
    sc.ctx.putImageData(mkImageData(d, src.w, src.h), 0, 0);
    return { img: sc.cv, w: src.w, h: src.h, free: sc.free };
  }
  const { w, h } = dimsOf(src);
  return { img: src, w, h, free: () => {} };
}
function mkImageData(d, w, h) {
  if (typeof ImageData === "function") return new ImageData(d instanceof Uint8ClampedArray ? d : new Uint8ClampedArray(d), w, h);
  return { data: d, width: w, height: h };
}
/** draws src (any drawable) into a new w×h scratch canvas with high-quality smoothing and successive halving (> 2× shrink) */
function resample(src, w, h, gfx, { bg } = {}) {
  const dr = drawableOf(src, gfx);
  try {
    let cur = { cv: dr.img, w: dr.w, h: dr.h, free: null };
    while (cur.w / 2 >= w * 1.0001 && cur.h / 2 >= h * 1.0001) {
      const nw = Math.max(w, Math.round(cur.w / 2)), nh = Math.max(h, Math.round(cur.h / 2));
      const half = scratch(nw, nh, gfx);
      half.ctx.imageSmoothingEnabled = true; half.ctx.imageSmoothingQuality = "high";
      half.ctx.drawImage(cur.cv, 0, 0, nw, nh);
      if (cur.free) cur.free();
      cur = { cv: half.cv, w: nw, h: nh, free: half.free };
    }
    const out = scratch(w, h, gfx);
    if (bg) { out.ctx.fillStyle = bg; out.ctx.fillRect(0, 0, w, h); }
    out.ctx.imageSmoothingEnabled = true; out.ctx.imageSmoothingQuality = "high";
    out.ctx.drawImage(cur.cv, 0, 0, w, h);
    if (cur.free) cur.free();
    return out;
  } finally { dr.free(); }
}
function toBlobAsync(cv, type, q) {
  if (typeof cv.toBlob !== "function") return Promise.resolve(null);
  return new Promise((res) => { try { cv.toBlob((b) => res(b || null), type, q); } catch (e) { res(null); } });
}
/** one encode → { blob|null, data|null, len, type }; len = the data URL length; throws {code:"memory"} on "data:," */
async function encodeOnce(cv, type, q) {
  const b = await toBlobAsync(cv, type, q);
  if (b && b.size > 0) {
    if (b.type && b.type !== type) throw codeErr("format", "encoder returned " + b.type);   // never WebP or anything else
    return { blob: b, data: null, len: prefixOf(type).length + b64len(b.size), type };
  }
  let d = "";
  try { d = cv.toDataURL(type, q); } catch (e) { d = ""; }
  if (!d || d === "data:," || d.length < 30) throw codeErr("memory", "encode failed");
  if (!d.startsWith(prefixOf(type))) throw codeErr("format", "encoder returned " + d.slice(0, 20));
  return { blob: null, data: d, len: d.length, type };
}
const finish = async (r) => (r.data != null ? r.data : blobToDataUrl(r.blob));
const canvasOf = (canvas, gfx) => {
  if (canvas && typeof canvas.toBlob === "function") return { cv: canvas, w: canvas.width, h: canvas.height, free: () => {} };
  if (canvas && canvas.cv && typeof canvas.cv.toBlob === "function") return { cv: canvas.cv, w: canvas.cv.width, h: canvas.cv.height, free: () => {} };
  const { w, h } = dimsOf(canvas);
  const sc = resample(canvas, w, h, gfx);
  return { cv: sc.cv, w, h, free: sc.free };
};

/** JPEG quality ladder q0 → qMin in `step` steps (qMin always tried) → { data, q }; throws {code:"big"} */
export async function encodeJpeg(canvas, { maxChars = MEDIA_MAX, q0 = 0.92, qMin = 0.70, step = 0.04, gfx } = {}) {
  const c = canvasOf(canvas, gfx);
  try {
    const qs = [];
    for (let q = q0; q > qMin + 1e-6; q = Math.round((q - step) * 1000) / 1000) qs.push(q);
    qs.push(qMin);
    for (const q of qs) {
      const r = await encodeOnce(c.cv, "image/jpeg", q);
      if (r.len < maxChars) { const data = await finish(r); assertMedia(data); return { data, q }; }
    }
    throw codeErr("big");
  } finally { c.free(); }
}
/** → data URL (PNG, full resolution; the caller checks the size) */
export async function encodePng(canvas, { gfx } = {}) {
  const c = canvasOf(canvas, gfx);
  try { return await finish(await encodeOnce(c.cv, "image/png")); } finally { c.free(); }
}
/** fit to maxPx, JPEG ladder, then ×0.8 downscales until it fits → { data, w, h, q } (exports, sends, compare) */
export async function encodeImage(canvas, { maxChars = MEDIA_MAX, maxPx = OUT.px, q0 = 0.92, qMin = 0.70, gfx } = {}) {
  const { w: W, h: H } = dimsOf(canvas.cv ? canvas.cv : canvas);
  let k = Math.min(1, maxPx / Math.max(W, H, 1));
  for (let i = 0; i < 12; i++) {
    const w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
    const sc = k === 1 ? null : resample(canvas, w, h, gfx);
    try {
      const r = await encodeJpeg(sc ? sc.cv : canvas, { maxChars, q0, qMin, gfx });
      return { data: r.data, w, h, q: r.q };
    } catch (e) {
      if (!e || e.code !== "big") throw e;
    } finally { if (sc) sc.free(); }
    k *= 0.8;
  }
  throw codeErr("big");
}
/** grey ladder for alpha planes and masks: PNG at full size → JPEG 0.92 at ½ → JPEG 0.85 at ¼ → { data, f, s } (§6.1) */
export async function encodeGrey(canvas, { maxChars = MEDIA_MAX, gfx } = {}) {
  const c = canvasOf(canvas, gfx);
  try {
    const png = await encodeOnce(c.cv, "image/png");
    if (png.len < maxChars) return { data: await finish(png), f: 2, s: 1 };
    for (const [s, q] of [[0.5, 0.92], [0.25, 0.85]]) {
      const sc = resample(c.cv, Math.max(1, Math.round(c.w * s)), Math.max(1, Math.round(c.h * s)), gfx);
      try {
        const r = await encodeOnce(sc.cv, "image/jpeg", q);
        if (r.len < maxChars) return { data: await finish(r), f: 1, s };
      } finally { sc.free(); }
    }
    throw codeErr("big");
  } finally { c.free(); }
}
/** 480 px JPEG thumbnail (white under transparency) → data URL. source: data URL, image, bitmap, canvas or Surface */
export async function encodeThumb(source, px = THUMB.px, q = THUMB.q, { gfx } = {}) {
  let src = source, freeSrc = null;
  if (typeof source === "string") { src = await decodeImage(source); freeSrc = () => { if (src && src.close) src.close(); }; }
  try {
    const { w: W, h: H } = dimsOf(src.cv ? src.cv : src);
    if (!W || !H) throw codeErr("invalid", "empty source");
    const k = Math.min(1, px / Math.max(W, H));
    const sc = resample(src, Math.max(1, Math.round(W * k)), Math.max(1, Math.round(H * k)), gfx, { bg: "#ffffff" });
    try {
      for (const qq of [q, 0.7, 0.6]) {
        const r = await encodeOnce(sc.cv, "image/jpeg", qq);
        if (r.len < MEDIA_MAX) { const data = await finish(r); assertMedia(data); return data; }
      }
      throw codeErr("big");
    } finally { sc.free(); }
  } finally { if (freeSrc) freeSrc(); }
}

/* =====================================================================================================================
   3. decoding and headers
   ===================================================================================================================== */
/** → ImageBitmap | HTMLImageElement; never fetch(data:). Throws {code:"decode"} */
export async function decodeImage(data) {
  if (typeof data !== "string" || !/^data:image\//.test(data)) throw codeErr("decode", "not an image data URL");
  if (typeof createImageBitmap === "function" && typeof Blob === "function") {
    try { return await createImageBitmap(dataUrlToBlob(data)); } catch (e) { /* fall back to Image */ }
  }
  if (typeof Image !== "function") throw codeErr("decode", "no decoder");
  const img = new Image();
  img.decoding = "async";
  img.src = data;
  try {
    if (img.decode) await img.decode();
    else await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
  } catch (e) { throw codeErr("decode", "undecodable image"); }
  if (!(img.naturalWidth > 0)) throw codeErr("decode", "empty image");
  return img;
}
/** Blob (draft planes, files) → ImageBitmap | HTMLImageElement; used by PhotoDoc.applyDraft */
export async function decodeBlob(blob) {
  if (typeof createImageBitmap === "function") {
    try { return await createImageBitmap(blob); } catch (e) { /* fall back */ }
  }
  return decodeImage(await blobToDataUrl(blob));
}
async function headBytes(src, n) {
  if (src == null) return null;
  if (typeof src === "string") {
    const c = src.indexOf(",");
    if (!/^data:/.test(src) || c < 0) return null;
    const b64 = src.slice(c + 1, c + 1 + Math.ceil(n / 3) * 4);
    try { return b64ToBytes(b64.slice(0, b64.length - (b64.length % 4))); } catch (e) { return null; }
  }
  if (src instanceof Uint8Array) return src.subarray(0, n);
  if (src instanceof ArrayBuffer) return new Uint8Array(src, 0, Math.min(n, src.byteLength));
  if (typeof src.slice === "function" && typeof src.size === "number") {
    const part = src.slice(0, n);
    if (typeof part.arrayBuffer === "function") return new Uint8Array(await part.arrayBuffer());
    if (typeof FileReader === "function") {
      return new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(new Uint8Array(fr.result)); fr.onerror = () => res(null); fr.readAsArrayBuffer(part); });
    }
  }
  return null;
}
/** → {w,h} | null (not a known image) | undefined (need more bytes) */
function parseDims(b) {
  if (!b || b.length < 4) return undefined;
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    if (b.length < 24) return undefined;
    const u32 = (i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
    return { w: u32(16), h: u32(20) };
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 3 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m === 0xff) { i++; continue; }
      if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      if (m === 0xd9 || m === 0xda) return null;
      if (i + 3 >= b.length) return undefined;
      const len = (b[i + 2] << 8) | b[i + 3];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) {
        if (i + 8 >= b.length) return undefined;
        return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
      }
      i += 2 + len;
    }
    return undefined;
  }
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) { if (b.length < 10) return undefined; return { w: b[6] | (b[7] << 8), h: b[8] | (b[9] << 8) }; }
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) {
    if (b.length < 30) return undefined;
    const tag = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (tag === "VP8X") return { w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
    if (tag === "VP8L") { const v = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24); return { w: 1 + (v & 0x3fff), h: 1 + ((v >>> 14) & 0x3fff) }; }
    if (tag === "VP8 ") return { w: (b[26] | (b[27] << 8)) & 0x3fff, h: (b[28] | (b[29] << 8)) & 0x3fff };
    return null;
  }
  return null;
}
/** → { w, h } | null from the JPEG/PNG (GIF, WebP) header, without decoding pixels. file: File/Blob, data URL, ArrayBuffer, Uint8Array */
export async function imageDims(file) {
  try {
    for (const n of [65536, 1 << 20, 8 << 20]) {
      const b = await headBytes(file, n);
      const d = parseDims(b);
      if (d === null) return null;
      if (d && d.w > 0 && d.h > 0) return d;
      const total = typeof file === "string" ? Math.floor(file.length * 0.75) : (file && (file.size || file.byteLength || file.length)) || 0;
      if (!b || total <= b.length) return null;
    }
  } catch (e) { /* unreadable */ }
  return null;
}
/** throws {code:"invalid"} unless MEDIA_RE and length < MEDIA_MAX */
export function assertMedia(data) {
  if (typeof data !== "string" || !MEDIA_RE.test(data) || data.length >= MEDIA_MAX) {
    throw codeErr("invalid", "invalid media");
  }
}

/* =====================================================================================================================
   4. putMedia: the only media writer (§6.2)
   ===================================================================================================================== */
const rawPut = (store, owner, ref, data) => store.put(owner, ref, data);   // museum-c8 swaps the timed API here: one line [XS]
const late = new Map();                                                   // owner_ref → original promise of a timed-out put
const settledTrue = new Set();                                            // owner_ref whose late put resolved true
let putChain = Promise.resolve();                                         // one upload at a time per client
let putCalls = 0;
/** @returns {Promise<"ok"|"rejected"|"timeout"|"offline"|"invalid">} */
export function putMedia(store, owner, ref, data, { timeoutMs } = {}) {
  try { assertMedia(data); } catch (e) { return Promise.resolve("invalid"); }   // never JSON, parts, WebP or ≥ 950,000 chars
  if (!refOk(ref) || !owner || /_/.test(String(owner))) return Promise.resolve("invalid");
  const run = () => putOne(store, owner, ref, data, timeoutMs);
  const p = putChain.then(run, run);
  putChain = p.then(() => {}, () => {});
  return p;
}
async function putOne(store, owner, ref, data, timeoutMs) {
  if (isOffline()) return "offline";
  if (!store || typeof store.put !== "function") return "rejected";
  const ms = timeoutMs || uploadTimeout(data.length), t0 = Date.now(), key = owner + "_" + ref;
  let p = late.get(key);
  if (p && settledTrue.has(key) && store && typeof store.getSafe === "function") {
    // a timed-out put that landed later: trust it only if the doc is still there (the caller may have removed it since, R4)
    let there = false;
    try { const g = store && typeof store.getSafe === "function" ? await store.getSafe(owner, ref) : null; there = !!(g && g.ok && g.data); } catch (e) { there = false; }
    if (!there) { late.delete(key); settledTrue.delete(key); p = null; }
  }
  if (!p) {
    putCalls++;
    try { p = Promise.resolve(rawPut(store, owner, ref, data)).then((x) => x === true, () => false); } catch (e) { p = Promise.resolve(false); }
  }
  let timer;
  const r = await Promise.race([p, new Promise((res) => { timer = setTimeout(() => res("timeout"), ms); })]);
  clearTimeout(timer);
  if (r === true) { late.delete(key); settledTrue.delete(key); return "ok"; }
  if (r === false) { late.delete(key); settledTrue.delete(key); return Date.now() - t0 < ms * 0.4 ? "rejected" : "timeout"; }   // fast false = rules/data
  late.set(key, p);
  p.then((ok) => { if (late.get(key) === p) { if (ok) settledTrue.add(key); else late.delete(key); } });
  return "timeout";
}
/** → the original promise of a timed-out put, or null */
export function latePut(ref) {
  for (const [k, p] of late) if (k.slice(k.indexOf("_") + 1) === ref) return p;
  return null;
}
/** forgets the late put of a ref (its doc is being removed: a later putMedia must upload again, R4) */
export function forgetLate(ref, owner) {
  for (const k of [...late.keys()]) if (k.slice(k.indexOf("_") + 1) === ref && (!owner || k.startsWith(owner + "_"))) { late.delete(k); settledTrue.delete(k); }
}
/** test hook: number of store.put calls made so far */
export function _putCalls() { return putCalls; }
/** removes one media doc (10 s race) and forgets its cache entry and late put; → false when the remove failed */
export async function removeMedia(store, owner, ref) {
  if (!store || typeof store.remove !== "function") return false;
  mediaCache.drop(ref);
  forgetLate(ref, owner);
  return raceT(Promise.resolve().then(() => store.remove(owner, ref)), 10000, false);
}

/* =====================================================================================================================
   5. mediaCache: getSafe-based reads, LRU 12 docs / 8 MB, one read per ref in flight
   ===================================================================================================================== */
const MC_DOCS = 12, MC_BYTES = 8e6;
const mcMap = new Map();      // owner_ref → data
const mcFly = new Map();      // owner_ref → promise
let mcBytes = 0;
function mcPut(k, data) {
  if (typeof data !== "string" || data.length > MC_BYTES) return;
  if (mcMap.has(k)) { mcBytes -= mcMap.get(k).length; mcMap.delete(k); }
  mcMap.set(k, data); mcBytes += data.length;
  while (mcMap.size > MC_DOCS || mcBytes > MC_BYTES) { const [k0, v0] = mcMap.entries().next().value; mcMap.delete(k0); mcBytes -= v0.length; }
}
/** { get(store, owner, ref) → Promise<{ ok, data, missing }> (getSafe; LRU 12 docs / 8 MB), set(owner, ref, data), drop(ref), clear() } */
export const mediaCache = {
  async get(store, owner, ref) {
    const k = owner + "_" + ref;
    if (mcMap.has(k)) { const d = mcMap.get(k); mcMap.delete(k); mcMap.set(k, d); return { ok: true, data: d, missing: false }; }
    if (mcFly.has(k)) return mcFly.get(k);
    const p = (async () => {
      let r;
      try {
        if (store && typeof store.getSafe === "function") r = await store.getSafe(owner, ref);
        else if (store && typeof store.get === "function") { const d = await store.get(owner, ref); r = { ok: d != null, data: d == null ? null : d }; }
        else r = { ok: false, data: null };
      } catch (e) { r = { ok: false, data: null }; }
      const ok = !!(r && r.ok), data = r && typeof r.data === "string" && r.data ? r.data : null;
      if (ok && data) mcPut(k, data);
      return { ok, data, missing: ok && !data };
    })();
    mcFly.set(k, p);
    try { return await p; } finally { mcFly.delete(k); }
  },
  set(owner, ref, data) { mcPut(owner + "_" + ref, data); },
  drop(ref) { for (const k of [...mcMap.keys()]) if (k.slice(k.indexOf("_") + 1) === ref) { mcBytes -= mcMap.get(k).length; mcMap.delete(k); } },
  clear() { mcMap.clear(); mcBytes = 0; },
};
/** loader for PhotoDoc.fromManifest: (ptr {ref}) → Promise<{ img, missing, error }> through mediaCache and decodeImage */
export function mediaLoader(store, owner) {
  return async (ptr) => {
    const ref = ptr && ptr.ref;
    if (!ref) return { img: null, missing: true, error: false };
    const r = await mediaCache.get(store, owner, ref);
    if (!r.ok) return { img: null, missing: false, error: true };
    if (!r.data) return { img: null, missing: true, error: false };
    try { return { img: await decodeImage(r.data), missing: false, error: false }; } catch (e) { mediaCache.drop(ref); return { img: null, missing: false, error: true }; }
  };
}

/* =====================================================================================================================
   6. drafts: IndexedDB "museum-photo" v1, store "drafts"; keys `${sid}|s6f.edit` (draft) and `${sid}|pending` (§6.8)
   ===================================================================================================================== */
const IDB_NAME = "museum-photo", IDB_STORE = "drafts", DRAFT_MAX = 60e6;
let dbp = null, idbBroken = false;
const memDrafts = new Map();      // fallback (private mode, blocked IndexedDB) and drafts over 60 MB
const idbAvail = () => !idbBroken && typeof indexedDB !== "undefined" && !!indexedDB && typeof indexedDB.open === "function";
function openDb() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    let req;
    try { req = indexedDB.open(IDB_NAME, 1); } catch (e) { rej(e); return; }
    req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE); };
    req.onsuccess = () => { const db = req.result; db.onversionchange = () => { try { db.close(); } catch (e) { /* closed */ } dbp = null; }; res(db); };
    req.onerror = () => rej(req.error || new Error("idb"));
    req.onblocked = () => rej(new Error("idb blocked"));
  });
  dbp.catch(() => { idbBroken = true; dbp = null; });
  return dbp;
}
/** runs fn(store) in one transaction; resolves fn's result after the transaction completes */
async function idbTx(mode, fn) {
  const db = await openDb();
  return new Promise((res, rej) => {
    let out, tx;
    try { tx = db.transaction(IDB_STORE, mode); } catch (e) { rej(e); return; }
    tx.oncomplete = () => res(out);
    tx.onerror = () => rej(tx.error || new Error("idb tx"));
    tx.onabort = () => rej(tx.error || new Error("idb abort"));
    try { fn(tx.objectStore(IDB_STORE), (v) => { out = v; }); } catch (e) { try { tx.abort(); } catch (e2) { /* gone */ } rej(e); }
  });
}
const onReq = (req, f) => { req.onsuccess = () => f(req.result); };
async function kvGet(k) {
  if (memDrafts.has(k)) return memDrafts.get(k);
  if (!idbAvail()) return null;
  try { return (await idbTx("readonly", (st, set) => onReq(st.get(k), (v) => set(v === undefined ? null : v)))) ?? null; }
  catch (e) { idbBroken = true; return null; }
}
async function kvPut(k, v, memOnly = false) {
  if (!memOnly && idbAvail()) {
    try { await idbTx("readwrite", (st) => { st.put(v, k); }); memDrafts.delete(k); return true; }
    catch (e) { idbBroken = true; }
  }
  memDrafts.set(k, v);
  if (memOnly && idbAvail()) { try { await idbTx("readwrite", (st) => { st.delete(k); }); } catch (e) { /* stale copy stays */ } }
  return false;
}
async function kvDel(k) {
  memDrafts.delete(k);
  if (!idbAvail()) return;
  try { await idbTx("readwrite", (st) => { st.delete(k); }); } catch (e) { idbBroken = true; }
}
/** atomic read-modify-write; f(old) → { value, out } (value undefined deletes) */
async function kvUpdate(k, f) {
  if (memDrafts.has(k) || !idbAvail()) {
    const r = f(memDrafts.has(k) ? memDrafts.get(k) : null);
    if (r.value === undefined) memDrafts.delete(k); else memDrafts.set(k, r.value);
    return r.out;
  }
  try {
    return await idbTx("readwrite", (st, set) => onReq(st.get(k), (old) => {
      const r = f(old === undefined ? null : old);
      if (r.value === undefined) st.delete(k); else st.put(r.value, k);
      set(r.out);
    }));
  } catch (e) {
    idbBroken = true;
    const r = f(null);
    if (r.value !== undefined) memDrafts.set(k, r.value);
    return r.out;
  }
}
async function kvKeys() {
  const ks = new Set(memDrafts.keys());
  if (idbAvail()) {
    try { (await idbTx("readonly", (st, set) => onReq(st.getAllKeys(), set)) || []).forEach((k) => ks.add(String(k))); }
    catch (e) { idbBroken = true; }
  }
  return [...ks];
}
const dkey = (sid, key) => String(sid) + "|" + String(key);
const draftSize = (d) => {
  let n = 0;
  for (const p of (d && d.planes) || []) n += (p && p.blob && p.blob.size) || (p && typeof p.data === "string" ? p.data.length : 0);
  return n;
};
/** IndexedDB drafts (§6.8). Every method resolves (never rejects); without IndexedDB everything lives in memory. */
export const drafts = {
  /** true when drafts persist across reloads (IndexedDB available and working) */
  usable() { return idbAvail(); },
  async get(sid, key) { return kvGet(dkey(sid, key)); },
  /** a draft over 60 MB is kept in memory only (§6.8) */
  async put(sid, key, d) { return kvPut(dkey(sid, key), d, draftSize(d) > DRAFT_MAX); },
  async del(sid, key) { await kvDel(dkey(sid, key)); return true; },
  /** an editor draft (unsaved work or a kept plan) exists for this student */
  async hasUnsaved(sid) { return !!sid && !!(await kvGet(dkey(sid, KEYS.edit))); },
  /** records refs whose upload is about to start (before the first put) */
  async addPending(sid, refs) {
    const add = (refs || []).filter((r) => typeof r === "string" && r);
    if (!sid || !add.length) return;
    await kvUpdate(dkey(sid, "pending"), (old) => {
      const cur = old && Array.isArray(old.refs) ? old.refs : [];
      return { value: { v: 1, at: Date.now(), refs: [...new Set([...cur, ...add])] }, out: undefined };
    });
  },
  /** → refs pending for sid except those in keep; the kept ones stay pending */
  async takePending(sid, { keep } = {}) {
    if (!sid) return [];
    const kept = new Set(keep || []);
    return kvUpdate(dkey(sid, "pending"), (old) => {
      const cur = old && Array.isArray(old.refs) ? old.refs : [];
      const stay = cur.filter((r) => kept.has(r));
      return { value: stay.length ? { v: 1, at: Date.now(), refs: stay } : undefined, out: cur.filter((r) => !kept.has(r)) };
    });
  },
  /** removes refs from the pending list (they are now referenced by a confirmed write) */
  async dropPending(sid, refs) {
    const drop = new Set(refs || []);
    if (!sid || !drop.size) return;
    await kvUpdate(dkey(sid, "pending"), (old) => {
      const stay = (old && Array.isArray(old.refs) ? old.refs : []).filter((r) => !drop.has(r));
      return { value: stay.length ? { v: 1, at: Date.now(), refs: stay } : undefined, out: undefined };
    });
  },
  async purgeOthers(sid) { for (const k of await kvKeys()) if (!k.startsWith(String(sid) + "|")) await kvDel(k); },
  async purgeAll() {
    memDrafts.clear();
    if (idbAvail()) { try { await idbTx("readwrite", (st) => { st.clear(); }); } catch (e) { idbBroken = true; } }
  },
  /** deletes editor drafts older than maxAgeMs; pending lists are kept (takePending moves them to the trash) */
  async purgeOld(maxAgeMs = 24 * 3600e3) {
    const lim = Date.now() - maxAgeMs;
    for (const k of await kvKeys()) {
      if (k.endsWith("|pending")) continue;
      const d = await kvGet(k);
      if (!d || !(Number(d.at) >= lim)) await kvDel(k);
    }
  },
};
/** test hook: forget the cached database connection (a fresh indexedDB shim is picked up) */
export function _resetDraftStore() { dbp = null; idbBroken = false; memDrafts.clear(); }

/* =====================================================================================================================
   7. identity, auth, tab lock
   ===================================================================================================================== */
let sidNow = "";
/** sid of the signed-in student as last reported to watchAuthForDrafts, "" when none */
export function currentSid() { return sidNow; }
/** → { ok:boolean, release() }; ok true when navigator.locks is missing */
export async function tabLock(name) {
  const L = typeof navigator !== "undefined" && navigator && navigator.locks;
  if (!L || typeof L.request !== "function") return { ok: true, release() {} };
  let release = () => {};
  const held = new Promise((r) => { release = r; });
  return new Promise((resolve) => {
    let done = false;
    const fin = (v) => { if (!done) { done = true; resolve(v); } };
    try {
      Promise.resolve(L.request(String(name), { ifAvailable: true }, (lock) => {
        if (!lock) { fin({ ok: false, release() {} }); return undefined; }
        fin({ ok: true, release: () => release() });
        return held;
      })).catch(() => fin({ ok: true, release() {} }));
    } catch (e) { fin({ ok: true, release() {} }); }
  });
}
/** signed out → purgeAll and reset every Saver; user → purgeOthers(sid) and drop other students' Savers; returns unsubscribe */
export function watchAuthForDrafts(authApi) {
  if (!authApi || typeof authApi.watch !== "function") return () => {};
  const un = authApi.watch((u) => {
    const email = u && u.email ? String(u.email) : "";
    sidNow = email ? email.split("@")[0] : "";
    if (!sidNow) {
      for (const s of savers.values()) s.reset();
      savers.clear();
      mediaCache.clear();
      drafts.purgeAll();
    } else {
      for (const [o, s] of [...savers]) if (o !== sidNow) { s.reset(); savers.delete(o); }
      drafts.purgeOthers(sidNow);
    }
  });
  return typeof un === "function" ? un : () => {};
}
let devMem = 0;
/** 31-bit int from sessionStorage "museum:photoDev" (try/catch), else per module load */
export function devId() {
  try {
    const v = Number(sessionStorage.getItem("museum:photoDev"));
    if (Number.isInteger(v) && v > 0 && v <= 0x7fffffff) return v;
    const n = random31();
    sessionStorage.setItem("museum:photoDev", String(n));
    return n;
  } catch (e) {
    if (!devMem) devMem = random31();
    return devMem;
  }
}

/* =====================================================================================================================
   8. encodeJob (§6.1) and the Saver (§6.4–§6.10)
   ===================================================================================================================== */
const roundS = (s) => Math.round(s * 1000) / 1000;
const isPlainO = (o) => !!o && typeof o === "object" && !Array.isArray(o);
function canvasFromRGBA(d, w, h, gfx) { const sc = scratch(w, h, gfx); sc.ctx.putImageData(mkImageData(d, w, h), 0, 0); return sc; }
function subRGBA(d, w, r) {
  const out = new Uint8ClampedArray(r.w * r.h * 4);
  for (let y = 0; y < r.h; y++) out.set(d.subarray(((r.y + y) * w + r.x) * 4, ((r.y + y) * w + r.x + r.w) * 4), y * r.w * 4);
  return out;
}
/** tile rects of a w × h box split at floor(w/2), floor(h/2) (t0 top left, t1 top right, t2 bottom left, t3 bottom right) */
function tileRects4(w, h) {
  const hw = Math.floor(w / 2), hh = Math.floor(h / 2);
  return [{ x: 0, y: 0, w: hw, h: hh }, { x: hw, y: 0, w: w - hw, h: hh }, { x: 0, y: hh, w: hw, h: h - hh }, { x: hw, y: hh, w: w - hw, h: h - hh }];
}
async function jpegAt(d, w, h, s, gfx, maxChars) {
  const src = canvasFromRGBA(d, w, h, gfx);
  try {
    if (s === 1) return await encodeJpeg(src.cv, { maxChars, gfx });
    const sc = resample(src.cv, Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)), gfx);
    try { return await encodeJpeg(sc.cv, { maxChars, gfx }); } finally { sc.free(); }
  } finally { src.free(); }
}
async function tryJpeg(d, w, h, s, gfx, maxChars) {
  try { return await jpegAt(d, w, h, s, gfx, maxChars); } catch (e) { if (e && e.code === "big") return null; throw e; }
}
/** colour ladder (§6.1): JPEG q 0.92 → 0.70; then 2×2 tiles while tiled planes remain; then ×0.8 downscales (of the tiles or the whole)
 *  → { s, data } | { s, parts:[data×4] } */
export async function colourLadder(d, w, h, { tiles = false, gfx = null, maxChars = MEDIA_MAX } = {}) {
  const whole = await tryJpeg(d, w, h, 1, gfx, maxChars);
  if (whole) return { s: 1, data: whole.data };
  if (tiles && w >= 2 && h >= 2) {
    const rs = tileRects4(w, h);
    let s = 1;
    for (let i = 0; i < 16; i++, s *= 0.8) {
      const parts = [];
      for (const r of rs) { const t = await tryJpeg(subRGBA(d, w, r), r.w, r.h, s, gfx, maxChars); if (!t) break; parts.push(t.data); }
      if (parts.length === 4) return { s: roundS(s), parts };
    }
    throw codeErr("big");
  }
  let s = 0.8;
  for (let i = 0; i < 16; i++, s *= 0.8) {
    const t = await tryJpeg(d, w, h, s, gfx, maxChars);
    if (t) return { s: roundS(s), data: t.data };
  }
  throw codeErr("big");
}
function fillFor(doc, renderer, id, rect) {
  if (renderer && typeof renderer.below === "function") {
    try {
      const i = doc.indexOf(id), s = renderer.below(Math.max(0, i)), wa = doc.wa;
      return s.read({ x: rect.x - wa.x, y: rect.y - wa.y, w: rect.w, h: rect.h });
    } catch (e) { /* fall back to the base */ }
  }
  return doc.baseRGBA(rect);
}
/** @returns {Promise<{payloads:Payload[], ptr:Ptr}>} ptr = the exact LayerRec fragment: colour jobs {bx, c, a} (c and a null when the
 *  plane is empty or has no alpha plane), masks {mk}. opts: tiledLeft (tiled planes the manifest may still gain), renderer (fills
 *  α = 0 pixels from the state below the layer; else the base), gfx (scratch canvases). Sets job.rev to the rev it encoded. */
export async function encodeJob(doc, job, stamp, { tiledLeft = 0, renderer = null, gfx = null } = {}) {
  const G = gfx || (doc && doc.gfx) || null;
  const pd = doc.planeData(job);
  if (pd && Number.isFinite(pd.rev)) job.rev = pd.rev;
  const id = job.layerId;
  if (job.role === "m") {
    if (!pd || !pd.m) return { payloads: [], ptr: { mk: null } };
    const { m, w, h } = pd, g = new Uint8ClampedArray(w * h * 4);
    for (let i = 0, j = 0; j < m.length; i += 4, j++) { g[i] = g[i + 1] = g[i + 2] = m[j]; g[i + 3] = 255; }
    const sc = canvasFromRGBA(g, w, h, G);
    let r;
    try { r = await encodeGrey(sc.cv, { gfx: G }); } finally { sc.free(); }
    const ref = mkRef(KEYS.edit, "M" + id, stamp);
    return { payloads: [{ ref, data: r.data, kind: "m", job }], ptr: { mk: { ref, s: r.s, f: r.f } } };
  }
  const Lr = "L" + id;
  if (job.raw) {
    if (!pd || typeof pd.src !== "string") return { payloads: [], ptr: { bx: null, c: null, a: null } };
    assertMedia(pd.src);
    const ref = mkRef(KEYS.edit, Lr, stamp);
    return { payloads: [{ ref, data: pd.src, kind: "c", job }], ptr: { bx: { ...pd.rect }, c: { ref, f: /^data:image\/png/.test(pd.src) ? 2 : 1 }, a: null } };
  }
  if (!pd || pd.empty) return { payloads: [], ptr: { bx: null, c: null, a: null } };
  const { d, rect, opaque } = pd, w = rect.w, h = rect.h;
  // transparent and small: one PNG with alpha (c.f 2, no a)
  if (!opaque && w * h <= 300000) {
    const sc = canvasFromRGBA(d, w, h, G);
    let png = "";
    try { png = await encodePng(sc.cv, { gfx: G }); } finally { sc.free(); }
    if (png.length < 900000) {
      const ref = mkRef(KEYS.edit, Lr, stamp);
      return { payloads: [{ ref, data: png, kind: "c", job }], ptr: { bx: { ...rect }, c: { ref, f: 2 }, a: null } };
    }
  }
  // colour JPEG of bx (α = 0 pixels filled from below so the JPEG sees no hard edges), alpha as a grey plane
  const col = new Uint8ClampedArray(d);
  if (!opaque) {
    const fill = fillFor(doc, renderer, id, rect);
    for (let i = 0; i < col.length; i += 4) {
      if (col[i + 3] === 0) { col[i] = fill[i]; col[i + 1] = fill[i + 1]; col[i + 2] = fill[i + 2]; }
      col[i + 3] = 255;
    }
  }
  const enc = await colourLadder(col, w, h, { tiles: tiledLeft > 0, gfx: G });
  const payloads = [];
  let c;
  if (enc.parts) {
    const parts = enc.parts.map((data, i) => { const ref = mkRef(KEYS.edit, Lr, stamp, "t" + i); payloads.push({ ref, data, kind: "t", job }); return { ref }; });
    c = { f: 1, ...(enc.s < 1 ? { s: enc.s } : {}), parts };
  } else {
    const ref = mkRef(KEYS.edit, Lr, stamp);
    payloads.push({ ref, data: enc.data, kind: "c", job });
    c = { ref, f: 1, ...(enc.s < 1 ? { s: enc.s } : {}) };
  }
  let a = null;
  if (!opaque) {
    const g = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < g.length; i += 4) { g[i] = g[i + 1] = g[i + 2] = d[i + 3]; g[i + 3] = 255; }
    const sc = canvasFromRGBA(g, w, h, G);
    let r;
    try { r = await encodeGrey(sc.cv, { gfx: G }); } finally { sc.free(); }
    const ref = mkRef(KEYS.edit, Lr, stamp, "a");
    payloads.push({ ref, data: r.data, kind: "a", job });
    a = { ref, s: r.s, f: r.f };
  }
  return { payloads, ptr: { bx: { ...rect }, c, a } };
}

/* ---------- Saver ----------
 * @typedef {{phase:"idle"|"encoding"|"uploading"|"writing"|"confirming"|"saved"|"offline"|"error"|"locked"|"conflict",
 *   done:number, total:number, at:number, err:""|"rejected"|"timeout"|"big"|"ws"|"memory"|"size",
 *   slow:boolean, unsaved:boolean, draft:boolean, current:boolean}} SaveState   (slow, unsaved, draft, current added: contract-log IO9) */
const jobKey = (j) => j.layerId + ":" + j.role;
/** epoch s of the latest 「새 이미지로 다시 시작」 event (edit.ev o 3) of a normalized manifest, 0 when none */
const lastRebaseT = (e) => (e && Array.isArray(e.ev) ? e.ev.reduce((t, x) => (x && x.o === 3 && x.t > t ? x.t : t), 0) : 0);
/** harness and unit tests shorten the size-scaled upload timeout with __PHX_TEST__.putTimeoutMs */
const testTimeout = () => { const t = globalThis.__PHX_TEST__; return (t && t.putTimeoutMs) || undefined; };
const RETRY_MS = [15000, 60000, 180000];
const nowS = () => Math.floor(Date.now() / 1000);
const replaceSnap = (snaps, s) => [...(Array.isArray(snaps) ? snaps : []).filter((x) => x && x.s !== s.s), s].sort((a, b) => a.s - b.s);
const pickStats = (st) => ({ cov: st.cov | 0, g: st.g | 0, po: st.po | 0 });
const BASE_KINDS_IO = new Set(["ai", "px", "tr", "db", "adj", "flt"]);

export class Saver {
  constructor({ store, owner, dev, setFieldRef, getWs, onState, getLocked, getSeq } = {}) {
    this.store = store; this.owner = owner; this.dev = dev || devId();
    this.setFieldRef = setFieldRef || { current: null }; this.getWs = getWs || (() => ({}));
    this.onState = onState || null; this.getLocked = getLocked || null;
    this.getSeq = getSeq || null;   // the card's render counter at the moment of a write (R7); observe(…, seq) compares against it
    this._st = { phase: "idle", done: 0, total: 0, at: 0, err: "", slow: false, unsaved: false, draft: false, current: false };
    this._init();
  }
  _init() {
    this._att = null; this._running = null; this._queued = null; this._queuedP = null;
    this._plan = null; this._write = null; this._seq = 0; this._confirmedOnce = false; this._locked = false;
    this._draftTimer = null; this._retryTimer = null; this._retryN = 0;
    this._draftPlanes = new Map(); this._hasDraft = false; this._current = false; this._drafting = null; this._draftAgain = false;
    this._encoding = null; this._seenPlan = null; this._uploadedSession = new Set(); this._loadedCrev = 0;
    this._gc = null; this._onlineFn = null; this._waiters = []; this._bg = new Set();
    this._attRebaseT = 0;   // the last 「새 이미지로 다시 시작」 the attached document has seen (R5)
    this._parked = null;    // a kept plan of a document that is no longer attached, set aside at attach: only resumeFrom reuses it (N2)
    this._draftDoc = null;  // the document that wrote the stored draft: only it may replace that draft with a clean state (N1)
    this._held = false; this._heldStop = false;   // setHold (the editor's conflict bar, N8): no server write starts while held
    // dispose lock (R8): doc → number of saves (running or queued) that may still read its canvases; detach() waits for 0
    this._holds = new Map(); this._freeWaiters = []; this._runDoc = null; this._runHeld = false;
  }
  _hold(doc) { if (doc) this._holds.set(doc, (this._holds.get(doc) || 0) + 1); }
  _release(doc) {
    if (!doc || !this._holds.has(doc)) return;
    const n = this._holds.get(doc) - 1;
    if (n > 0) { this._holds.set(doc, n); return; }
    this._holds.delete(doc);
    const go = this._freeWaiters.filter((x) => x.doc === doc);
    this._freeWaiters = this._freeWaiters.filter((x) => x.doc !== doc);
    go.forEach((x) => x.res());
  }
  /** the running save is past encoding (or ended): it no longer reads the document's canvases */
  _releaseRun() { if (this._runHeld) { this._runHeld = false; this._release(this._runDoc); } this._runDoc = null; }
  /** a running or queued save may still read the canvases of doc (it has not finished encoding): keep doc undisposed (N5) */
  holds(doc) { return !!doc && (this._holds.get(doc) || 0) > 0; }
  /** resolves when no save needs the canvases of doc any more */
  _untilFree(doc) {
    if (!doc || !this._holds.get(doc)) return Promise.resolve();
    return new Promise((res) => this._freeWaiters.push({ doc, res }));
  }
  _bgRun(fn) {
    const p = Promise.resolve().then(fn).catch(() => {});
    this._bg.add(p);
    p.finally(() => this._bg.delete(p));
    return p;
  }
  /** resolves once the follow-ups of a confirmation or a lost write (drafts, trash appends, GC) and any draft write have finished */
  async settled() {
    for (let i = 0; i < 20; i++) {
      const list = [...this._bg, this._drafting, this._gc, this._running].filter(Boolean);
      if (!list.length) return;
      await Promise.all(list.map((x) => x.catch(() => {})));
    }
  }
  /* ---------- state ---------- */
  _set(p = {}) {
    Object.assign(this._st, p);
    this._st.unsaved = this.pending; this._st.draft = this._hasDraft; this._st.current = this._current;
    if (this.onState) { try { this.onState({ ...this._st }); } catch (e) { /* the observer never breaks the Saver */ } }
  }
  get state() { return { ...this._st, unsaved: this.pending, draft: this._hasDraft, current: this._current }; }
  get busy() { return !!this._running || ["encoding", "uploading", "writing"].includes(this._st.phase); }
  /** unsaved changes of the attached document, its plan in progress, a running save or a write being confirmed. A plan kept for
   *  a closed or replaced document does not count (N2): its work is in the draft (`hasDraft`), and it resumes only through
   *  resumeFrom when that draft is restored */
  get pending() {
    let dirty = false;
    try { dirty = !!(this._att && this._att.doc && this._att.doc.dirty); } catch (e) { dirty = false; }
    return dirty || this._ownPlan() || !!this._write || !!this._running;
  }
  /** the kept plan belongs to the attached document */
  _ownPlan() { const p = this._plan, a = this._att; return !!(p && a && p.doc === a.doc && !p.stale); }
  /** an IndexedDB (or memory) draft with unsaved work or a kept plan exists for this student */
  get hasDraft() { return this._hasDraft; }
  /** getLocked (the WsLockCtx value) is the source of truth when given; setLock only feeds the fallback */
  _isLocked() {
    if (typeof this.getLocked === "function") { try { return !!this.getLocked(); } catch (e) { return this._locked; } }
    return this._locked;
  }
  /** the 입력 잠금 state (WsLockCtx); on: a running plan stops after the payload in flight, a draft is written, nothing is deleted */
  setLock(on) {
    const was = this._locked;
    this._locked = !!on;
    if (this._locked && !was) {
      if (this._att) this.writeDraftNow("lock");
      if (["idle", "saved", "error"].includes(this._st.phase)) this._set({ phase: "locked" });
    } else if (!this._locked && was && this._st.phase === "locked") this._set({ phase: "idle" });
  }
  _armOnline() {
    if (this._onlineFn || typeof window === "undefined" || !window.addEventListener) return;
    this._onlineFn = () => {
      if (this._att && (this._plan || this.pending)) this.save(null, null, null, { reason: "online" });
      // nothing left to send: the offline notice goes with the connection (review r4 F3)
      else if (this._st.phase === "offline" && !this.pending && !this._hasDraft) this._set({ phase: this._write ? "confirming" : "idle" });
    };
    window.addEventListener("online", this._onlineFn);
  }
  _scheduleRetry() {
    clearTimeout(this._retryTimer);
    if (this._retryN >= RETRY_MS.length) return;
    const ms = RETRY_MS[this._retryN++];
    this._retryTimer = setTimeout(() => { this._retryTimer = null; if (this._att) this.save(null, null, null, { reason: "auto" }); }, ms);
    if (this._retryTimer && this._retryTimer.unref) this._retryTimer.unref();
  }
  _waitConfirm(ms) {
    if (!this._write) return Promise.resolve(true);
    return new Promise((res) => {
      const t = setTimeout(() => { this._waiters = this._waiters.filter((f) => f !== fin); res(false); }, ms);
      const fin = () => { clearTimeout(t); res(true); };
      this._waiters.push(fin);
    });
  }
  _wake() { const w = this._waiters; this._waiters = []; w.forEach((f) => f()); }
  /* ---------- editor wiring ---------- */
  attach(doc, renderer, session) {
    this._att = { doc, renderer, session };
    const e = normEdit((this.getWs() || {})[KEYS.edit]);
    this._loadedCrev = e && Number.isFinite(e.crev) ? e.crev : 0;
    this._attRebaseT = lastRebaseT(e);
    this._draftPlanes = new Map();
    this._current = false;
    // a kept plan belongs to the document instance that encoded it: another document never reuses it (revisions restart per
    // document, R2). resumeFrom(draft) adopts it again for a draft restore; otherwise the next save drops it.
    if (this._plan && this._plan.doc !== doc) {
      this._plan.stale = true;
      // set aside (N2): it no longer counts as pending nor drives the draft; resumeFrom can still reuse its payloads. A plan of a
      // save that is still running stays in place (that save ends it); the next save drops a stale or parked plan.
      if (!this._running) { this._parked = this._plan; this._plan = null; }
    }
    this._armOnline();
    this._set({});
  }
  /** contract with the editor (contract-log IO14, D19): await it before doc.dispose() and before replacing the document.
   *  detach(doc) does nothing to the attachment when another document is attached (a quick reopen), but still waits for doc.
   *  Writes the draft while the document still holds unsaved work, then lets go of it: a save of it that has not started encoding
   *  (running, waiting for an earlier confirmation, or queued) stops and keeps its plan for the draft; a save that is encoding
   *  finishes encoding first (dispose lock) and then uploads and writes without the canvases. */
  async detach(only) {
    const a = this._att;
    if (only && (!a || a.doc !== only)) { await this._untilFree(only); return; }
    const doc = a && a.doc;
    if (this._draftTimer) { clearTimeout(this._draftTimer); this._draftTimer = null; }
    if (doc && !doc.disposed) {
      let dirty = false;
      try { dirty = !!doc.dirty; } catch (e) { dirty = false; }
      // only unsaved work or this document's own plan: a clean reopened document never replaces a stored draft (N1)
      if (dirty || this._ownPlan()) { try { await this._writeDraft(); } catch (e) { /* the draft is best effort */ } }
    }
    if (this._att === a) this._att = null;
    this._wake();   // a save waiting for a confirmation re-checks at once and stops (its document is no longer attached)
    await this._untilFree(doc);
    if (this._encoding) { try { await this._encoding; } catch (e) { /* ignore */ } }
    this._set({});
  }
  /** 「이 기기 내용으로 계속」: the attached document deliberately overwrites what another device saved, including a 「새 이미지로 다시
   *  시작」 made there; the next save re-uploads whatever that device deleted (R5). It also lifts setHold (the caller saves next). */
  acceptRemote() {
    const e = normEdit((this.getWs() || {})[KEYS.edit]);
    this._attRebaseT = lastRebaseT(e);
    if (e && Number.isFinite(e.crev)) this._loadedCrev = e.crev;
    this._held = false; this._heldStop = false;
    if (this._st.phase === "conflict" || this._st.phase === "held") this._set({ phase: "idle" });
  }
  /** the editor's conflict bar (final gate N8, D41). on: no upload, manifest write or GC deletion starts, whoever starts the save
   *  (the editor, the Saver's retry timer, the back-online resume, a re-encode): the save writes the draft, keeps its plan and stops
   *  with phase "held"; a save already uploading stops before its next upload or before its write (the payload in flight
   *  finishes). off: lifts the hold; with resume (default) a save that the hold stopped starts again for the attached document.
   *  Pass {resume:false} when the student chose the other device's content (그 내용 불러오기), or call it after the reload. */
  setHold(on, { resume = true } = {}) {
    const was = this._held;
    this._held = !!on;
    if (this._held && !was) { if (this._att) this.writeDraftNow("hold"); return; }
    if (!this._held && was) {
      const again = resume && this._heldStop && !!this._att;
      this._heldStop = false;
      if (this._st.phase === "held") this._set({ phase: "idle" });
      if (again) this.save(null, null, null, { reason: "auto" });
    }
  }
  get held() { return this._held; }
  async _holdStop() {
    this._heldStop = true;
    await this.writeDraftNow("hold");
    this._set({ phase: "held", done: 0, total: 0, slow: false });
    return this.state;
  }
  /** adopts the plan kept in a draft (「이어서 하기」): jobs whose plane rev still matches reuse their stamp and refs;
   *  refs marked done are re-checked with getSafe at the next save */
  resumeFrom(draft) {
    const list = draft && Array.isArray(draft.planned) ? draft.planned : [];
    if (!list.length) return;
    const jobs = new Map();
    for (const p of list) {
      if (!p || typeof p.ref !== "string" || typeof p.key !== "string" || !/^\d+:[cm]$/.test(p.key)) continue;
      let j = jobs.get(p.key);
      if (!j) {
        const [lid, role] = p.key.split(":");
        j = { key: p.key, kind: role, job: { layerId: Number(lid), role, rev: p.rev }, rev: p.rev, stamp: p.stamp || "", refs: [], done: new Set(), ptr: null, payloads: null, verify: true };
        jobs.set(p.key, j);
      }
      j.refs.push(p.ref);
      if (p.done) j.done.add(p.ref);
      if (p.ptr && !j.ptr) j.ptr = p.ptr;
      if (!j.stamp) { const seg = p.ref.split("."); j.stamp = seg[3] || ""; }
    }
    const olds = [this._plan, this._parked].filter(Boolean);
    const mem = new Map();
    for (const o of olds) for (const j of o.jobs) if (!mem.has(j.key)) mem.set(j.key, j);
    const merged = [...jobs.values()].map((j) => { const m = mem.get(j.key); return m && m.rev === j.rev && m.stamp === j.stamp ? m : j; });
    const uploaded = new Set(list.filter((p) => p.done).map((p) => p.ref));
    const keep = new Set(merged.flatMap((j) => j.refs || []));
    for (const o of olds) o.uploaded.forEach((r) => { if (keep.has(r)) uploaded.add(r); });
    this._parked = null;
    this._plan = { doc: this._att ? this._att.doc : null, jobs: merged, uploaded, resumed: true, stale: false };
    this._set({});
  }
  /* ---------- drafts (§6.8): the Saver is their only writer ---------- */
  noteChange() {
    this._current = true;
    if (this._draftTimer) clearTimeout(this._draftTimer);
    this._draftTimer = setTimeout(() => { this._draftTimer = null; this._writeDraft().catch(() => {}); }, 2000);
    if (this._draftTimer && this._draftTimer.unref) this._draftTimer.unref();
    this._set({});
  }
  /** the editor discards the stored draft (「저장된 내용으로 시작」, a draft it cannot offer, 「그 내용 불러오기」): deletes it and
   *  forgets it, so hasDraft and state.draft follow at once (final gate N7; added by D, reviewed by C: also drops a plan set aside
   *  for a restore of this draft) → true */
  async dropDraft() {
    if (this._draftTimer) { clearTimeout(this._draftTimer); this._draftTimer = null; }
    if (this._drafting) { try { await this._drafting; } catch (e) { /* ignore */ } }
    const sid = this.owner;
    if (sid && sid !== "preview") { try { await drafts.del(sid, KEYS.edit); } catch (e) { /* ignore */ } }
    this._draftPlanes.clear(); this._hasDraft = false; this._current = false; this._draftDoc = null;
    this._parked = null;   // only resumeFrom(this draft) could reuse it; its refs stay on the pending list (takePending trashes them)
    this._set({});
    return true;
  }
  /** reason "hidden"|"lock"|"close"|"error"|"offline" → Promise<boolean> */
  writeDraftNow(reason) {
    void reason;
    if (this._draftTimer) { clearTimeout(this._draftTimer); this._draftTimer = null; }
    return this._writeDraft().catch(() => false);
  }
  _plannedList() {
    const out = [];
    const add = (j, doneAll) => (j.refs || []).forEach((ref, i) => out.push({
      ref, key: j.key, rev: j.rev, done: doneAll || j.done.has(ref), stamp: j.stamp, ...(i === 0 && j.ptr && (j.kind === "c" || j.kind === "m") ? { ptr: j.ptr } : {}),
    }));
    const p = this._plan;
    if (p && (!this._att || this._ownPlan())) for (const j of p.jobs) if (j.kind === "c" || j.kind === "m") add(j, false);
    return out;
  }
  async _writeDraft() {
    if (this._drafting) { this._draftAgain = true; return this._drafting; }
    this._drafting = (async () => {
      let ok = false;
      do { this._draftAgain = false; ok = await this._writeDraftOnce(); } while (this._draftAgain);
      return ok;
    })().finally(() => { this._drafting = null; });
    return this._drafting;
  }
  async _writeDraftOnce() {
    const a = this._att, sid = this.owner;
    if (!sid || sid === "preview") return false;
    if (!a || !a.doc) {
      // the editor closed (lock, close) while a plan runs: only the planned list of the existing draft changes
      if (!this._plan) return false;
      const d0 = await drafts.get(sid, KEYS.edit);
      if (!d0) return false;
      await drafts.put(sid, KEYS.edit, { ...d0, at: Date.now(), planned: this._plannedList() });
      return true;
    }
    const doc = a.doc, session = a.session;
    const planned = this._plannedList();
    if (!doc.dirty && !planned.length) {
      // N1: a draft this document did not write (offered from an earlier opening, or kept for a closed editor) is not replaced by
      // a clean state. Only one made before the latest 「새 이미지로 다시 시작」 for another base image goes (it is never offered).
      if (this._draftDoc !== doc) {
        const d0 = await drafts.get(sid, KEYS.edit);
        if (d0) {
          const rb = lastRebaseT(normEdit((this.getWs() || {})[KEYS.edit]));
          const b = (session && session.m && session.m.base) || (session && session.baseSrc) || null;
          const sg = b && b.sg ? String(b.sg) : "";
          if (!(rb > 0 && Number(d0.at) < rb * 1000 && String(d0.baseSg || "") !== sg)) return false;
        }
      }
      await drafts.del(sid, KEYS.edit);
      this._draftPlanes.clear(); this._hasDraft = false; this._current = false;
      if (this._draftDoc === doc) this._draftDoc = null;
      this._set({});
      return true;
    }
    const dirty = doc.dirtyJobs(), keys = new Set(dirty.map(jobKey));
    for (const k of [...this._draftPlanes.keys()]) if (!keys.has(k)) this._draftPlanes.delete(k);
    const revs = new Map([...this._draftPlanes].map(([k, v]) => [k, v.rev]));
    for (const j of doc.draftJobs(revs)) {
      try { const e = await this._draftPlane(doc, j); if (e) this._draftPlanes.set(jobKey(j), e); } catch (err) { /* that plane stays as it was */ }
    }
    const base = (session && session.m && session.m.base) || (session && session.baseSrc) || null;
    const d = {
      v: 1, sid, at: Date.now(), baseSg: base && base.sg ? String(base.sg) : "", crev: this._loadedCrev, dev: this.dev, stage: doc.stage,
      man: doc.toManifest({ draft: true }),
      session: session ? { sr: session.sr || {}, pr: session.pr || null, st: session.st || 0, log: Array.isArray(session.log) ? session.log : [] } : null,
      planes: [...this._draftPlanes.values()], sel: doc.selRle ? doc.selRle() : null, planned,
    };
    await drafts.put(sid, KEYS.edit, d);
    this._draftDoc = doc;
    this._hasDraft = true; this._current = false;
    this._set({});
    return true;
  }
  async _draftPlane(doc, j) {
    const L = doc.layer(j.layerId);
    if (!L) return null;
    const G = doc.gfx;
    const pngBlob = async (cv) => { const r = await encodeOnce(cv, "image/png"); return r.blob || dataUrlToBlob(r.data); };
    if (j.role === "m") {
      const pd = doc.planeData(j);
      if (!pd.m) return null;
      const g = new Uint8ClampedArray(pd.w * pd.h * 4);
      for (let i = 0, k = 0; k < pd.m.length; i += 4, k++) { g[i] = g[i + 1] = g[i + 2] = pd.m[k]; g[i + 3] = 255; }
      const sc = canvasFromRGBA(g, pd.w, pd.h, G);
      try { return { layerId: j.layerId, role: "m", rev: pd.rev, rect: pd.rect, s: 1, blob: await pngBlob(sc.cv), on: L.mask ? L.mask.on : 1, fe: L.mask ? L.mask.fe : 0, src: L.mask ? L.mask.src || "" : "" }; }
      finally { sc.free(); }
    }
    if (j.raw) {
      const pd = doc.planeData(j);
      if (typeof pd.src !== "string") return null;
      return { layerId: j.layerId, role: "c", rev: j.rev, rect: pd.rect, s: 1, blob: dataUrlToBlob(pd.src), data: pd.src };
    }
    if (!L.surf || !L.bx) return { layerId: j.layerId, role: "c", rev: L.rev, rect: null, s: 1, blob: null };
    const c = canvasOf(L.surf, G);
    try { return { layerId: j.layerId, role: "c", rev: L.rev, rect: { ...L.bx }, s: 1, blob: await pngBlob(c.cv) }; } finally { c.free(); }
  }
  /* ---------- save (§6.4) ---------- */
  /** reason "manual"|"stage"|"close"|"auto"|"gate"|"online"|"export"|"final"|"lock" → Promise<SaveState>. A running save coalesces
   *  the next calls into one queued save. doc, renderer, session default to the attached ones. */
  save(doc, renderer, session, opts = {}) {
    const a = this._att;
    doc = doc || (a && a.doc); renderer = renderer || (a && a.renderer); session = session || (a && a.session);
    if (this.owner === "preview" || !doc || !(this.setFieldRef && this.setFieldRef.current)) return Promise.resolve(this.state);
    if (this._running) {
      const q = (this._queued && this._queued.opts) || {};
      const q0 = this._queued;
      this._hold(doc);   // the queued save will read this document's canvases
      if (q0) this._release(q0.doc);
      this._queued = { doc, renderer, session, opts: { reason: opts.reason || q.reason, snapshotStage: opts.snapshotStage || q.snapshotStage, exportFinal: !!(opts.exportFinal || q.exportFinal) } };
      if (!this._queuedP) {
        this._queuedP = this._running.then(() => {
          const q2 = this._queued;
          this._queued = null; this._queuedP = null;
          if (!q2) return this.state;
          const p = this.save(q2.doc, q2.renderer, q2.session, q2.opts);   // holds the document again before the queue lets go
          this._release(q2.doc);
          return p;
        });
      }
      return this._queuedP;
    }
    this._hold(doc); this._runDoc = doc; this._runHeld = true;
    const run = this._doSave(doc, renderer, session, opts).catch((e) => {
      if (e && e.code === "disposed") { this._abortSave(); return this.state; }   // the editor closed under it (R8)
      const err = e && e.code === "memory" ? "memory" : e && e.code === "big" ? "big" : "ws";
      this._plan = null;
      this._set({ phase: "error", err });
      this.writeDraftNow("error");
      return this.state;
    });
    this._running = run.finally(() => { this._releaseRun(); this._running = null; this._set({}); });
    return this._running.then(() => this.state);
  }
  _fail(err) { this._plan = null; this._set({ phase: "error", err }); return this.writeDraftNow("error").then(() => this.state); }
  /** a save of a document that was detached or disposed stops without writing; its kept plan stays for a draft restore (R8) */
  _abortSave() {
    if (["encoding", "uploading", "writing"].includes(this._st.phase)) this._set({ phase: this._write ? "confirming" : "idle", done: 0, total: 0 });
    else this._set({});
    return this.state;
  }
  _baseSource(session, ws) {
    const s = session && session.baseSrc;
    if (s && s.ref) return { ref: s.ref, w: s.w | 0, h: s.h | 0, r: s.r | 0, sg: String(s.sg || "") };
    let bc = null;
    try { bc = baseChoice(ws[KEYS.steps]); } catch (e) { bc = null; }
    if (bc && bc.img && bc.img.ref) return { ref: bc.img.ref, w: bc.img.w | 0, h: bc.img.h | 0, r: bc.r | 0, sg: String(bc.img.sg || "") };
    return null;
  }
  /** carried pointers whose docs may be gone (another device's GC, or a layer brought back by undo after its refs were trashed):
   *  refs absent from the live manifest are re-encoded when they sit in the trash or getSafe says the doc is gone (§6.9) */
  async _checkCarried(doc, ws, { dry = false, skip = null } = {}) {
    const live = liveRefs(ws), inTrash = new Set(trashRefs(ws[KEYS.trash]));
    const found = [];
    for (const L of doc.layers) {
      if (L.missing || L.opaque || !L.ptr) continue;
      const planes = [];
      if (L.ptr.c) planes.push(["c", [...refsIn(L.ptr.c), ...(L.ptr.a ? [L.ptr.a.ref] : [])]]);
      if (L.ptr.mk) planes.push(["m", [L.ptr.mk.ref]]);
      for (const [role, refs] of planes) {
        // our own uploads are checked too: a rebase can delete them after their write was confirmed (R5)
        const out = refs.filter((r) => !live.has(r) && !(skip && skip.has(r)));
        if (!out.length) continue;
        let gone = out.some((r) => inTrash.has(r));
        if (!gone && this.store && typeof this.store.getSafe === "function") {
          for (const r of out) {
            const g = await raceT(Promise.resolve().then(() => this.store.getSafe(this.owner, r)), 10000, { ok: false, data: null });
            if (g && g.ok && !g.data) { gone = true; break; }
          }
        }
        if (gone) { found.push(L.id + ":" + role); if (!dry) doc.forgetPlane(L.id, role); }
      }
    }
    return found;
  }
  /** never writes a pixel layer without the colour pointer the server manifest has for it, unless this plan encoded that plane as
   *  empty (the student erased it): a closed or failing document can drop pointers, the server copy cannot (R8). Masks keep their
   *  data through dispose() and can be removed on purpose, so they are left as the document says. */
  _keepPointers(mine, cur, plan) {
    const e = normEdit(cur);
    if (!e || !Array.isArray(e.L) || !isPlainO(mine) || !Array.isArray(mine.L)) return mine;
    const old = new Map(e.L.filter((r) => isPlainO(r) && Number.isFinite(r.id)).map((r) => [r.id, r]));
    const emptyC = new Set();
    for (const j of plan.jobs) if (j.kind === "c" && j.ptr && !j.ptr.c) emptyC.add(j.job.layerId);
    const L = mine.L.map((r) => {
      if (!isPlainO(r) || r.ms) return r;
      const o = old.get(r.id);
      if (!o || o.k !== r.k) return r;
      if (r.c || !o.c || emptyC.has(r.id)) return r;
      return { ...r, c: o.c, ...(o.bx ? { bx: o.bx } : {}), ...(o.a ? { a: o.a } : {}) };
    });
    return { ...mine, L };
  }
  /** m and snaps of the manifest about to be written: those of the latest server manifest (never the editor session's copy, which
   *  can be older than an unconfirmed write, R1) with only this plan's own base/out/cmp/snapshot results laid over them */
  _overlayM(mine, plan, worst, cur) {
    const out = { ...(isPlainO(mine) ? mine : {}) };
    const e = normEdit(cur);
    const srcM = e ? e.m : isPlainO(out.m) ? out.m : {};
    const m = { base: null, out: null, cmp: null, ...(isPlainO(srcM) ? srcM : {}) };
    let snaps = e ? (Array.isArray(e.snaps) ? e.snaps.slice() : []) : Array.isArray(out.snaps) ? out.snaps.slice() : [];
    for (const j of plan.jobs) {
      const res = worst ? j.worst : j.res;
      if (!res) continue;
      if (j.kind === "base") m.base = res;
      else if (j.kind === "out") m.out = res;
      else if (j.kind === "cmp") m.cmp = res;
      else if (j.kind === "snap") snaps = replaceSnap(snaps, res);
    }
    out.m = m;
    out.snaps = snaps;
    return out;
  }
  _apply(session, part) {
    if (session && typeof session.apply === "function") return session.apply(part);
    const s = session || {};
    return { ...part, m: s.m || { base: null, out: null, cmp: null }, sr: s.sr || {}, snaps: s.snaps || [], st: s.st || 0, pr: s.pr || { mode: 1, paper: 0, bw: 0, ppi: 240 }, log: s.log || [] };
  }
  async _removeRefs(refs) {
    const gone = [], live = liveRefs(this.getWs() || {});
    for (const r of refs) {
      if (live.has(r)) continue;   // a manifest references it: never delete (R2)
      const ok = await removeMedia(this.store, this.owner, r);
      if (ok !== false) gone.push(r);
    }
    if (gone.length) await drafts.dropPending(this.owner, gone);
    return gone;
  }
  _setTrash(fn, upload) {
    const sf = this.setFieldRef && this.setFieldRef.current;
    if (!sf) return false;
    return sf(KEYS.trash, totalUpd(fn), upload ? { upload: true } : undefined);
  }
  async _appendTrash(refs, upload = false) {
    const add = [...new Set(refs)];
    if (!add.length) return;
    const ws = this.getWs() || {}, n = trashRefs(ws[KEYS.trash]).length;
    if (n + add.length > LIMITS.trashMax) await this._gcNeed(n + add.length - LIMITS.trashMax);
    this._setTrash((cur) => addTrash(cur, add, nowS()), upload);
  }
  /** own uploads that no manifest references go to the trash (deleted after the grace), never straight to removal */
  async _trashOwn(refs) {
    const ws = this.getWs() || {}, live = liveRefs(ws), inTrash = new Set(trashRefs(ws[KEYS.trash]));
    const add = [...new Set(refs || [])].filter((r) => !live.has(r) && !inTrash.has(r));
    if (add.length) await this._appendTrash(add);
  }
  async _gcNeed(need) {
    if (!this._confirmedOnce && this._write) await this._waitConfirm(30000);
    if (this._confirmedOnce) await this.gcRun({ need });
  }
  async _doSave(doc, renderer, session, { reason = "manual", snapshotStage = null, exportFinal = false } = {}) {
    void reason;
    const sid = this.owner;
    // only the attached, undisposed document is planned and encoded (R8, D19); detach() holds disposal back while it encodes
    const alive = () => !doc.disposed && !!this._att && this._att.doc === doc;
    if (!alive()) return this._abortSave();
    // 0 guards
    if (this._isLocked()) { await this.writeDraftNow("lock"); this._set({ phase: "locked" }); return this.state; }
    if (this._held) return this._holdStop();
    if (isOffline()) {
      let dirty = false;
      try { dirty = !!doc.dirty; } catch (e) { dirty = false; }
      // nothing to save: the phase stays as it is (no offline notice that outlives the connection, review r4 F3)
      if (!dirty && !this._plan) { this._armOnline(); return this.state; }
      await this.writeDraftNow("offline"); this._armOnline(); this._set({ phase: "offline" }); return this.state;
    }
    if (this._write) { this._set({ phase: "confirming" }); await this._waitConfirm(30000); }
    if (!alive()) return this._abortSave();
    if (this._held) return this._holdStop();
    if (this._retryTimer) { clearTimeout(this._retryTimer); this._retryTimer = null; }
    const ws0 = this.getWs() || {};
    // 「새 이미지로 다시 시작」 after this document was loaded: its layers belong to the old base; writing them would bring back
    // pointers whose docs the rebase deleted (R5). Only 「이 기기 내용으로 계속」 (acceptRemote) overrides it.
    const rebaseT = lastRebaseT(normEdit(ws0[KEYS.edit]));
    if (rebaseT > this._attRebaseT) { await this.writeDraftNow("conflict"); this._set({ phase: "conflict" }); return this.state; }
    await this._checkCarried(doc, ws0);
    if (!alive()) return this._abortSave();
    // 2 plan, no upload yet
    this._set({ phase: "encoding", done: 0, total: 0, err: "", slow: false });
    if (renderer) {
      for (const L of doc.layers) {
        if (L.missing || L.opaque || !BASE_KINDS_IO.has(L.k)) continue;
        try { Object.assign(L, pickStats(renderer.layerStats(L.id))); } catch (e) { /* facts stay as they were */ }
      }
      if (session && session.sr && session.sr.tone) {
        try { const s = renderer.stats(); session.sr = stageRecUpdate(session.sr, "tone", { tone: { mb: s.mb, ct: s.ct, sa: s.sa, bg: [...s.bg0, ...s.bg] } }, nowS()); }
        catch (e) { /* tone deltas stay */ }
      }
    }
    // a kept plan of another document (or not adopted by resumeFrom after a reload) is dropped: its uploads go to the trash (R2)
    const olds = [this._parked, this._plan && (this._plan.doc !== doc || this._plan.stale) ? this._plan : null].filter(Boolean);
    if (olds.length) {
      if (olds.includes(this._plan)) this._plan = null;
      this._parked = null;
      // every ref it tried to upload (a timed-out put may still land): never referenced, so to the trash; live refs are skipped
      const refs = olds.flatMap((old) => [...old.uploaded, ...old.jobs.flatMap((j) => (j.refs || []).filter((r) => latePut(r)))]);
      this._bgRun(() => this._trashOwn(refs));
    }
    const prev = this._plan && this._plan.doc === doc ? this._plan : null;
    this._lastStampMs = Math.max(Date.now(), (this._lastStampMs || 0) + 1);
    const stamp = stamp36(this._lastStampMs);
    const e00 = normEdit(ws0[KEYS.edit]);
    const plan = { doc, session, stamp, jobs: [], uploaded: new Set(), seen: [], rebaseT, base0: e00 && e00.m && e00.m.base ? e00.m.base.ref : null };
    const fresh = (key, kind, extra = {}) => ({ key, kind, stamp, refs: [], done: new Set(), ptr: null, payloads: null, res: null, worst: null, ...extra });
    const reused = new Set();
    for (const j of doc.dirtyJobs()) {
      const key = jobKey(j), old = prev && prev.jobs.find((x) => x.key === key && x.rev === j.rev && (x.kind === "c" || x.kind === "m"));
      if (old) { reused.add(old); plan.jobs.push({ ...old, job: { ...j }, done: new Set(old.done) }); old.done.forEach((r) => plan.uploaded.add(r)); }
      else plan.jobs.push(fresh(key, j.role === "m" ? "m" : "c", { job: { ...j }, rev: j.rev }));
    }
    // resumed plans: done refs are re-checked; a gone doc is uploaded again under the same ref
    for (const j of plan.jobs) {
      if (!j.verify) continue;
      j.verify = false;
      for (const r of j.refs) {
        const g = this.store && this.store.getSafe ? await raceT(Promise.resolve().then(() => this.store.getSafe(this.owner, r)), 10000, { ok: false, data: null }) : { ok: false };
        if (g && g.ok && g.data) { j.done.add(r); plan.uploaded.add(r); }
        else if (g && g.ok) { j.done.delete(r); plan.uploaded.delete(r); }
      }
    }
    const e0 = normEdit(ws0[KEYS.edit]);
    if (!(e0 && e0.m && e0.m.base)) {   // the server manifest decides (after a rebase the session still names the old copy, R5)
      const src = this._baseSource(session, ws0);
      const old = src && prev && prev.jobs.find((x) => x.kind === "base" && x.src && x.src.ref === src.ref);
      if (old) { reused.add(old); plan.jobs.unshift({ ...old, done: new Set(old.done) }); old.done.forEach((r) => plan.uploaded.add(r)); }
      else if (src) {
        const ref = mkRef(KEYS.edit, "base", stamp), res = { ref, w: src.w, h: src.h, r: src.r, sg: src.sg, src: src.ref };
        plan.jobs.unshift(fresh("base", "base", { src, res: null, worst: res }));
      }
    }
    if (snapshotStage && renderer && STAGES.includes(snapshotStage) && doc.stageChanged(snapshotStage, "any")) {
      const s = STAGES.indexOf(snapshotStage), ref = mkRef(KEYS.edit, "S" + s, stamp);
      plan.jobs.push(fresh("snap:" + s, "snap", { stage: snapshotStage, mark: doc.history.topId, worst: { s, ref, w: 9999, h: 9999 } }));
    }
    if (exportFinal && renderer) {
      plan.jobs.push(fresh("out", "out", { worst: { ref: mkRef(KEYS.edit, "out", stamp), w: 9999, h: 9999, q: 92, th: { ref: mkRef(KEYS.edit, "out", stamp, "th") } } }));
      plan.jobs.push(fresh("cmp", "cmp", { worst: { ref: mkRef(KEYS.edit, "cmp", stamp), w: 9999, h: 9999 } }));
    }
    // refs uploaded by an earlier attempt of a job that changed since are never referenced: remove them
    if (prev) {
      const stale = [];
      for (const j of prev.jobs) if (!reused.has(j)) { j.done.forEach((r) => stale.push(r)); (j.refs || []).filter((r) => latePut(r)).forEach((r) => stale.push(r)); }
      if (stale.length) this._bgRun(() => this._trashOwn(stale));
    }
    this._plan = plan;
    this._seenPlan = plan.seen;
    // 3 pre-check outside React with worst-case pointers
    const sv = random31();
    const meta = () => ({ dev: this.dev, sv, nowMs: Date.now(), contentChanged: !session || doc.rev !== session.lastSavedDocRev, exported: !!exportFinal });
    const cur0 = ws0[KEYS.edit];
    let n0;
    try {
      const worst = this._overlayM(this._apply(session, doc.toManifest({ worst: true, stamp })), plan, true, cur0);
      n0 = compactEdit(mergeManifest(cur0, worst, meta()), BUDGET.edit);
      clean(n0.edit);
    } catch (e) { return this._fail("ws"); }
    if (assertSafe(n0.edit) !== "") return this._fail("ws");
    if (capsCheck(ws0, KEYS.edit, n0.edit)) return this._fail("size");
    const k = editDiffRefs(cur0, n0.edit).length, tc = trashRefs(ws0[KEYS.trash]).length;
    if (tc + k > LIMITS.trashMax) await this._gcNeed(tc + k - LIMITS.trashMax);
    // 4a encode every job (one at a time, yielding), so the editor can close while uploads continue
    let tiledLeft = doc.tiledLeft();
    let encRes = () => {};
    this._encoding = new Promise((r) => { encRes = r; });
    try {
      for (const j of plan.jobs) {
        if (this._isLocked()) break;
        if (j.payloads || (j.ptr && j.refs.length && j.refs.every((r) => j.done.has(r)))) {
          if (j.ptr && j.ptr.c && j.ptr.c.parts) tiledLeft--;
          continue;
        }
        if (j.kind === "c" || j.kind === "m") {
          const r = await encodeJob(doc, j.job, j.stamp, { tiledLeft, renderer, gfx: doc.gfx });
          j.payloads = r.payloads; j.ptr = r.ptr; j.rev = j.job.rev;
          if (r.ptr && r.ptr.c && r.ptr.c.parts) tiledLeft--;
        } else if (j.kind === "base") {
          const g = await mediaCache.get(this.store, this.owner, j.src.ref);
          if (!g.ok) { encRes(); return this._fail("timeout"); }
          if (!g.data) { encRes(); return this._fail("ws"); }
          try { assertMedia(g.data); } catch (e) { encRes(); return this._fail("ws"); }
          j.payloads = [{ ref: j.worst.ref, data: g.data, kind: "base" }]; j.res = j.worst;
        } else if (j.kind === "snap") {
          const S = await renderer.exportImage({ kind: "snapshot", maxLong: SNAP.px });
          try {
            const r = await encodeJpeg(S, { q0: SNAP.q, qMin: 0.5, gfx: doc.gfx });
            j.payloads = [{ ref: j.worst.ref, data: r.data, kind: "snap" }]; j.res = { s: j.worst.s, ref: j.worst.ref, w: S.w, h: S.h };
          } finally { S.free(); }
        } else if (j.kind === "out") {
          const S = await renderer.exportImage({ kind: "final", maxLong: OUT.px });
          try {
            const r = await encodeImage(S, { maxChars: OUT.maxChars, maxPx: OUT.px, gfx: doc.gfx });
            const th = await encodeThumb(S, THUMB.px, THUMB.q, { gfx: doc.gfx });
            j.payloads = [{ ref: j.worst.ref, data: r.data, kind: "out" }, { ref: j.worst.th.ref, data: th, kind: "th" }];
            j.res = { ref: j.worst.ref, w: r.w, h: r.h, q: Math.round(r.q * 100), th: { ref: j.worst.th.ref } };
          } finally { S.free(); }
        } else if (j.kind === "cmp") {
          const S = await renderer.exportImage({ kind: "compare", labels: [T.refineBefore, T.refineAfter] });
          try {
            const r = await encodeImage(S, { maxChars: CMP.maxChars, maxPx: CMP.px, gfx: doc.gfx });
            j.payloads = [{ ref: j.worst.ref, data: r.data, kind: "cmp" }]; j.res = { ref: j.worst.ref, w: r.w, h: r.h };
          } finally { S.free(); }
        }
        j.refs = (j.payloads || []).map((p) => p.ref);
        await yieldTask();
      }
    } finally { encRes(); this._encoding = null; this._releaseRun(); }
    const allEncoded = plan.jobs.every((j) => j.payloads || (j.ptr && j.refs.length && j.refs.every((r) => j.done.has(r))) || (j.ptr && !j.refs.length));
    // 4b pending refs and the planned list go to the draft before the first put
    const todo = [];
    for (const j of plan.jobs) for (const p of j.payloads || []) if (!j.done.has(p.ref)) todo.push({ j, p });
    if (todo.length) await drafts.addPending(sid, todo.map((x) => x.p.ref));
    await this._writeDraft();
    if (!allEncoded) { this._set({ phase: "locked" }); return this.state; }
    // 4c upload one doc at a time
    this._set({ phase: "uploading", done: 0, total: todo.length });
    let n = 0;
    for (const { j, p } of todo) {
      if (this._isLocked()) { await this._writeDraft(); this._set({ phase: "locked" }); return this.state; }
      if (this._held) return this._holdStop();
      const slow = setTimeout(() => this._set({ slow: true }), 10000);
      if (slow.unref) slow.unref();
      let r;
      try { r = await putMedia(this.store, this.owner, p.ref, p.data, { timeoutMs: testTimeout() }); } finally { clearTimeout(slow); }
      if (this._st.slow) this._set({ slow: false });
      if (r === "ok") {
        j.done.add(p.ref); plan.uploaded.add(p.ref); this._uploadedSession.add(p.ref); n++;
        if (p.kind === "base" || p.kind === "th") mediaCache.set(this.owner, p.ref, p.data);
        this._set({ done: n });
        continue;
      }
      if (r === "rejected" || r === "invalid") {
        await this._removeRefs([...plan.uploaded]);   // never-referenced uploads; live refs are skipped
        if (this._plan === plan) this._plan = null;
        this._set({ phase: "error", err: "rejected" });
        await this._writeDraft();
        return this.state;
      }
      if (r === "timeout") { await this._writeDraft(); this._set({ phase: "error", err: "timeout" }); this._scheduleRetry(); return this.state; }
      this._armOnline(); await this._writeDraft(); this._set({ phase: "offline" });
      return this.state;
    }
    if (this._held) return this._holdStop();   // every payload is on the server: a resumed save only writes
    for (const j of plan.jobs) for (const p of j.payloads || []) p.data = null;   // payloads are on the server; keep only the pointers
    // 4d every write re-checks what it carries (R5): a rebase since the plan started, or a carried plane whose doc is gone
    const wsC = this.getWs() || {};
    const eC = normEdit(wsC[KEYS.edit]);
    const baseNow = eC && eC.m && eC.m.base ? eC.m.base.ref : null;
    if (lastRebaseT(eC) > plan.rebaseT || (plan.base0 && baseNow !== plan.base0)) {
      if (this._plan === plan) this._plan = null;
      await this._trashOwn([...plan.uploaded]);
      if (this._att && this._att.doc === doc) await this.writeDraftNow("conflict");
      this._set({ phase: "conflict" });
      return this.state;
    }
    const carriedGone = await this._checkCarried(doc, wsC, { dry: true, skip: plan.uploaded });
    if (carriedGone.length) {
      // a layer would be written with a pointer to a deleted doc: re-encode it (attached) or write nothing (closed)
      if (alive()) { await this._checkCarried(doc, wsC); this._bgRun(() => this.save(doc, renderer, session, { reason: "auto" })); }
      this._set({ phase: this._write ? "confirming" : "idle" });
      return this.state;
    }
    // 5 build from the latest ws, synchronously just before the write
    const ws1 = this.getWs() || {}, cur1 = ws1[KEYS.edit];
    const ptrs = new Map();
    for (const j of plan.jobs) if ((j.kind === "c" || j.kind === "m") && j.ptr) ptrs.set(j.key, j.ptr);
    const logIds = [...new Set(doc.history.logDeltas().map((d) => d.id))];
    const docRev = doc.rev, docPrev = doc.prev;
    let mine, next;
    try {
      mine = this._keepPointers(this._overlayM(this._apply(session, doc.toManifest({ ptrs })), plan, false, cur1), cur1, plan);
      next = clean(compactEdit(mergeManifest(cur1, mine, meta()), BUDGET.edit).edit);
    } catch (e) { await this._trashOwn([...plan.uploaded]); return this._fail("ws"); }
    if (assertSafe(next) !== "") { await this._trashOwn([...plan.uploaded]); return this._fail("ws"); }
    if (capsCheck(ws1, KEYS.edit, next)) { await this._trashOwn([...plan.uploaded]); return this._fail("size"); }
    const live = liveRefs({ ...ws1, [KEYS.edit]: next });
    const superseded = editDiffRefs(cur1, next).filter((r) => !live.has(r));
    const anyUploaded = plan.uploaded.size > 0;
    const locked = this._isLocked();
    if (locked && !anyUploaded) { if (this._plan === plan) this._plan = null; await this._writeDraft(); this._set({ phase: "locked" }); return this.state; }
    if (this._held) return this._holdStop();
    // 6 write the manifest and the trash append in the same tick
    const setField = this.setFieldRef.current;
    if (!setField) { await this._trashOwn([...plan.uploaded]); return this._fail("ws"); }
    const mt = meta();
    this._set({ phase: "writing" });
    const ok = setField(KEYS.edit, totalUpd((cur) => compactEdit(mergeManifest(cur, mine, mt), BUDGET.edit).edit), anyUploaded ? { upload: true } : undefined);
    if (ok === false) {
      if (locked && !anyUploaded) { this._set({ phase: "locked" }); return this.state; }
      await this._removeRefs([...plan.uploaded]);   // the write did not happen: nothing references them (live ones are skipped)
      return this._fail("ws");
    }
    if (superseded.length) this._setTrash((cur) => addTrash(cur, superseded, nowS()), anyUploaded);
    // 7 remember the write; observe() confirms it from props
    const jobs = plan.jobs.filter((j) => (j.kind === "c" || j.kind === "m") && j.ptr).map((j) => ({ job: { ...j.job, rev: j.rev }, ptr: j.ptr }));
    const snapJob = plan.jobs.find((j) => j.kind === "snap" && j.res);
    const mRes = {};
    for (const j of plan.jobs) if (j.res && (j.kind === "base" || j.kind === "out" || j.kind === "cmp")) mRes[j.kind] = j.res;
    let cleanAfter = false;
    try { cleanAfter = doc.rev === docRev && doc.prev === docPrev && doc.dirtyJobs().every((x) => { const p = ptrs.get(jobKey(x)); const pj = plan.jobs.find((y) => y.key === jobKey(x)); return p && pj && pj.rev === x.rev; }); }
    catch (e) { cleanAfter = false; }
    // the session follows the write at once (a later save must not start from an older m or snaps, R1)
    if (session && isPlainO(next.m)) session.m = { ...(session.m || {}), ...next.m };
    if (session && Array.isArray(next.snaps)) session.snaps = next.snaps.slice();
    this._write = {
      prev: this._write || null,   // an unconfirmed earlier write: its follow-ups run when this one is confirmed
      sv, writtenRev: Number.isFinite(next.rev) ? next.rev : 0, seqAtWrite: this.getSeq ? this.getSeq() : this._seq,
      uploaded: [...plan.uploaded], superseded, jobs, seen: plan.seen, doc, session, docRev, docPrev, logIds,
      mRes, snapRes: snapJob ? snapJob.res : null, snap: snapJob ? { stage: snapJob.stage, mark: snapJob.mark } : null, at: Date.now(), clean: cleanAfter,
      exported: !!exportFinal,
    };
    if (this._plan === plan) this._plan = null;
    this._seenPlan = null; this._retryN = 0;
    this._set({ phase: "confirming" });
    return this.state;
  }
  /* ---------- confirmation, lost writes, deletion (§6.5) ---------- */
  /** FolioPad effect on every commit (seq = its render counter): confirmation, lost writes, own-orphan cleanup, GC */
  observe(ws, wsSaved, seq) {
    if (Number.isFinite(seq)) this._seq = Math.max(this._seq, seq);
    const cur = ws ? ws[KEYS.edit] : undefined;
    const rec = (list) => { if (list && cur !== undefined && !list.includes(cur) && list.length < 16) list.push(cur); };
    rec(this._seenPlan);
    const w = this._write;
    if (!w) return;
    rec(w.seen);
    if (!wsSaved) return;
    const e = normEdit(cur);
    if (e && e.sv === w.sv && e.dev === this.dev) { this._confirm(ws, e); return; }
    // lost only on evidence: a newer manifest replaced ours (rev ≥ the rev we wrote), or, with the card's render counter, a saved
    // render made after the write still lacks our save id (our updater was refused). A deferred effect of an earlier render is
    // neither (R7).
    const newer = !!(e && Number.isFinite(e.rev) && e.rev >= w.writtenRev && w.writtenRev > 0);
    const after = !!(this.getSeq && Number.isFinite(seq) && seq > w.seqAtWrite);
    if (newer || after) this._lost(ws, e);
  }
  _confirm(ws, e) {
    const w = this._write;
    this._write = null;
    this._confirmedOnce = true;
    if (Number.isFinite(e.crev)) this._loadedCrev = Math.max(this._loadedCrev, e.crev);
    // earlier unconfirmed writes this one superseded: oldest first, so the latest pointer of a plane wins
    const chain = [];
    for (let p = w.prev; p; p = p.prev) chain.unshift(p);
    w.prev = null;
    const liveNow = liveRefs(ws);
    // the document gets its saved pointers even after the editor closed, as long as it was not disposed (R8)
    if (w.doc && !w.doc.disposed) {
      for (const p of chain) if (p.doc === w.doc) for (const { job, ptr } of p.jobs) if (refsIn(ptr).every((r) => liveNow.has(r))) w.doc.markSaved(job, ptr);
      for (const { job, ptr } of w.jobs) w.doc.markSaved(job, ptr);
      w.doc.markSavedState({ rev: w.docRev, prev: w.docPrev });
      if (w.snap) w.doc.markSnap(w.snap.stage, w.snap.mark);
      w.doc.history.markLogged([...chain.flatMap((p) => p.logIds || []), ...w.logIds]);
    }
    if (w.session) {
      w.session.lastSavedDocRev = w.docRev;
      if (isPlainO(e.m)) w.session.m = { ...(w.session.m || {}), ...e.m };
      if (Array.isArray(e.snaps)) w.session.snaps = e.snaps.slice();
      if (Array.isArray(e.log)) w.session.log = e.log;
    }
    this._set({ phase: "saved", at: Date.now(), err: "" });
    this._wake();
    const sid = this.owner;
    this._bgRun(async () => {
      const live = liveRefs(ws);
      const uploaded = [...new Set([...chain.flatMap((p) => p.uploaded || []), ...w.uploaded])];
      await drafts.dropPending(sid, uploaded.filter((r) => live.has(r)));
      // own uploads that the confirmed manifest does not reference: to the trash, deleted after the grace
      await this._trashOwn(uploaded.filter((r) => !live.has(r)));
      const inTrash = new Set(trashRefs((this.getWs() || ws)[KEYS.trash]));
      // the draft goes only when nothing changed since the write: a closed (even disposed) document still knows its revisions (R8)
      let dirty = !w.clean;
      try {
        if (w.doc && !w.doc.disposed) dirty = w.doc.dirty;
        else if (w.doc && (w.doc.rev !== w.docRev || w.doc.prev !== w.docPrev)) dirty = true;
      } catch (err) { dirty = true; }
      // only the draft that document wrote: an offered draft of an earlier opening waits for the student's choice (N1)
      const planKept = !!this._plan && (!this._att || this._ownPlan());
      if (!dirty && !planKept && !this._write && this._draftDoc === w.doc) {
        await drafts.del(sid, KEYS.edit); this._draftPlanes.clear(); this._hasDraft = false; this._draftDoc = null;
      }
      else if (this._att) await this._writeDraft();
      // refs of other writes that ours replaced (seen in props since the plan started), neither live nor in the trash
      const orphan = new Set();
      for (const v of w.seen) for (const r of refsIn(v)) if (!live.has(r) && !inTrash.has(r) && isFolioRef(r)) orphan.add(r);
      if (orphan.size) await this._appendTrash([...orphan]);
      await this.gcRun();
      this._set({});
    });
  }
  _lost(ws, e) {
    const w = this._write;
    this._write = null;
    const live = liveRefs(ws), inTrash = new Set(trashRefs(ws[KEYS.trash]));
    const chain = [];
    for (let p = w; p; p = p.prev) chain.push(p);
    const own = [...new Set(chain.flatMap((p) => p.uploaded || []))].filter((r) => !live.has(r));
    const re = [...new Set(chain.flatMap((p) => p.superseded || []))].filter((r) => !live.has(r) && !inTrash.has(r));
    const conflict = !!(e && e.dev !== this.dev && Number.isFinite(e.crev) && e.crev > this._loadedCrev);
    this._set({ phase: conflict ? "conflict" : "idle" });
    this._wake();
    this._bgRun(async () => {
      // never a direct removal here: a misjudged loss must not delete what a manifest references (R7); the trash keeps the grace
      if (own.length || re.length) await this._trashOwn([...own, ...re]);
      this._set({});
    });
  }
  /** deletes trash entries per gcPlan (§2.9) after this device confirmed a folio write; every ref is re-checked against the live
   *  refs right before store.remove (10 s race); a failed remove stays in the trash. Skipped while locked. → deleted refs */
  async gcRun({ need = 0, force = false } = {}) {
    if (this._isLocked() || this._held || this.owner === "preview") return [];
    if (!this._confirmedOnce && !force) return [];
    if (this._gc) return this._gc;
    this._gc = (async () => {
      const plan = gcPlan(this.getWs() || {}, { nowMs: Date.now(), graceMs: graceMs(), need });
      const done = [];
      for (const ref of plan) {
        if (this._isLocked() || this._held) break;
        if (liveRefs(this.getWs() || {}).has(ref)) { done.push(ref); continue; }
        const ok = await removeMedia(this.store, this.owner, ref);
        if (ok !== false) done.push(ref);
      }
      if (done.length) this._setTrash((cur) => dropTrash(cur, done), false);
      return done;
    })().finally(() => { this._gc = null; });
    return this._gc;
  }
  /** owner change or sign-out: drop state (drafts are purged separately) */
  reset() {
    for (const x of this._freeWaiters || []) x.res();
    if (this._draftTimer) clearTimeout(this._draftTimer);
    if (this._retryTimer) clearTimeout(this._retryTimer);
    if (this._onlineFn && typeof window !== "undefined" && window.removeEventListener) window.removeEventListener("online", this._onlineFn);
    this._wake();
    this._init();
    this._st = { phase: "idle", done: 0, total: 0, at: 0, err: "", slow: false, unsaved: false, draft: false, current: false };
  }
}
const savers = new Map();
/** One Saver per student, kept at module level; FolioPad drives observe(), PhotoEditor borrows it while open. → Saver */
export function getSaver({ store, owner, dev, setFieldRef, getWs, onState, getLocked, getSeq } = {}) {
  let s = savers.get(owner);
  if (!s) { s = new Saver({ store, owner, dev, setFieldRef, getWs, onState, getLocked, getSeq }); savers.set(owner, s); }
  else {
    if (setFieldRef) s.setFieldRef = setFieldRef;
    if (getWs) s.getWs = getWs;
    if (onState) s.onState = onState;
    if (store) s.store = store;
    if (getLocked) s.getLocked = getLocked;
    if (getSeq) s.getSeq = getSeq;
  }
  return s;
}
