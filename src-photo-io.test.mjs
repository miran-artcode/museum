// 부호화·미디어 저장·Saver·초안 시험 (spec §9.1 src-photo-io.test.mjs). 담당 C. 가짜 저장소·가짜 캔버스·메모리 IndexedDB로 돌린다.
import { test } from "node:test";
import assert from "node:assert/strict";

/* ===================================================================================================================
   fakes (installed before the module under test is imported)
   =================================================================================================================== */
// --- fake canvas: RGBA-backed, nearest-neighbour drawImage, toBlob producing "FK" blobs whose size a test can inflate ---
const FAKE = { size: null, encodes: [] };
class FakeCtx {
  constructor(cv) { this.cv = cv; this.fillStyle = "#000"; this.imageSmoothingEnabled = true; this.imageSmoothingQuality = "low"; }
  _px(src) {
    if (src instanceof FakeCanvas) return { w: src.width, h: src.height, d: src._d };
    if (src && src.data && src.width) return { w: src.width, h: src.height, d: src.data };
    throw new Error("fake drawImage: unknown source");
  }
  drawImage(src, dx, dy, dw, dh) {
    const s = this._px(src), W = this.cv.width, H = this.cv.height, d = this.cv._d;
    dw = dw == null ? s.w : dw; dh = dh == null ? s.h : dh;
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
      const tx = Math.floor(dx + x), ty = Math.floor(dy + y);
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
      const sx = Math.min(s.w - 1, Math.floor(((x + 0.5) * s.w) / dw)), sy = Math.min(s.h - 1, Math.floor(((y + 0.5) * s.h) / dh));
      const i = (sy * s.w + sx) * 4, j = (ty * W + tx) * 4, a = s.d[i + 3] / 255;
      for (let c = 0; c < 3; c++) d[j + c] = Math.round(s.d[i + c] * a + d[j + c] * (1 - a));
      d[j + 3] = Math.round(255 * (a + (d[j + 3] / 255) * (1 - a)));
    }
  }
  fillRect(x, y, w, h) {
    const m = /^#([0-9a-f]{6})$/i.exec(this.fillStyle), v = m ? parseInt(m[1], 16) : 0;
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) {
      const j = (yy * this.cv.width + xx) * 4; this.cv._d.set([v >> 16, (v >> 8) & 255, v & 255, 255], j);
    }
  }
  clearRect() { this.cv._d.fill(0); }
  getImageData(x, y, w, h) {
    const out = new Uint8ClampedArray(w * h * 4);
    for (let r = 0; r < h; r++) out.set(this.cv._d.subarray(((y + r) * this.cv.width + x) * 4, ((y + r) * this.cv.width + x + w) * 4), r * w * 4);
    return { data: out, width: w, height: h };
  }
  putImageData(img, x, y) {
    for (let r = 0; r < img.height; r++) this.cv._d.set(img.data.subarray(r * img.width * 4, (r + 1) * img.width * 4), ((y + r) * this.cv.width + x) * 4);
  }
}
class FakeCanvas {
  constructor() { this._w = 300; this._h = 150; this._d = new Uint8ClampedArray(300 * 150 * 4); this._ctx = null; }
  get width() { return this._w; } set width(v) { this._w = v | 0; this._d = new Uint8ClampedArray(this._w * this._h * 4); }
  get height() { return this._h; } set height(v) { this._h = v | 0; this._d = new Uint8ClampedArray(this._w * this._h * 4); }
  getContext() { return (this._ctx = this._ctx || new FakeCtx(this)); }
  toBlob(cb, type, q) {
    const jpeg = type === "image/jpeg", w = this._w, h = this._h;
    const head = new Uint8Array(12); head[0] = 70; head[1] = 75; head[2] = jpeg ? 1 : 2; head[3] = Math.round((q || 1) * 100);
    new DataView(head.buffer).setUint32(4, w, true); new DataView(head.buffer).setUint32(8, h, true);
    const px = new Uint8Array(this._d); if (jpeg) for (let i = 3; i < px.length; i += 4) px[i] = 255;
    // with FAKE.size the blob has exactly that size and no pixels (size tests only); otherwise it carries the pixels losslessly
    const parts = FAKE.size ? [head, new Uint8Array(Math.max(0, FAKE.size({ type, q, w, h }) - 12))] : [head, px];
    FAKE.encodes.push({ type, q, w, h });
    setTimeout(() => cb(new Blob(parts, { type })), 0);
  }
}
globalThis.document = { createElement: (t) => { if (t !== "canvas") throw new Error(t); return new FakeCanvas(); } };
globalThis.ImageData = class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } };
globalThis.createImageBitmap = async (blob) => {
  const b = new Uint8Array(await blob.arrayBuffer());
  if (b[0] !== 70 || b[1] !== 75) throw new Error("not a fake image");
  const dv = new DataView(b.buffer), w = dv.getUint32(4, true), h = dv.getUint32(8, true);
  return { width: w, height: h, data: new Uint8ClampedArray(b.slice(12, 12 + w * h * 4)), close() {} };
};

// --- fake IndexedDB: one database map, async requests, transactions complete when no request is pending ---
function fakeIndexedDB() {
  const dbs = new Map(), later = (f) => setTimeout(f, 0);
  const makeDb = () => {
    const stores = new Map();
    return {
      objectStoreNames: { contains: (n) => stores.has(n) },
      createObjectStore(n) { stores.set(n, new Map()); },
      close() {},
      transaction(n) {
        const data = stores.get(n);
        if (!data) throw new Error("no store " + n);
        let pending = 0, done = false;
        const tx = {};
        const check = () => later(() => { if (!pending && !done) { done = true; if (tx.oncomplete) tx.oncomplete(); } });
        const req = (fn) => { const r = {}; pending++; later(() => { r.result = fn(); if (r.onsuccess) r.onsuccess(); pending--; check(); }); return r; };
        tx.objectStore = () => ({
          get: (k) => req(() => (data.has(k) ? data.get(k) : undefined)),
          put: (v, k) => req(() => { data.set(k, v); return k; }),
          delete: (k) => req(() => { data.delete(k); }),
          clear: () => req(() => { data.clear(); }),
          getAllKeys: () => req(() => [...data.keys()]),
        });
        check();
        return tx;
      },
      _stores: stores,
    };
  };
  return {
    open(name) {
      const req = {};
      later(() => {
        let db = dbs.get(name), up = false;
        if (!db) { db = makeDb(); dbs.set(name, db); up = true; }
        req.result = db;
        if (up && req.onupgradeneeded) req.onupgradeneeded();
        if (req.onsuccess) req.onsuccess();
      });
      return req;
    },
    _dbs: dbs,
  };
}
globalThis.indexedDB = fakeIndexedDB();
const NAV = { onLine: true };
Object.defineProperty(globalThis, "navigator", { value: NAV, configurable: true, writable: true });

const io = await import("./src-photo-io.mjs");
const { putMedia, assertMedia, getSaver, drafts, currentSid, watchAuthForDrafts, latePut, mediaCache, mediaLoader, encodeJpeg, encodeImage,
  encodeGrey, encodeThumb, encodePng, decodeImage, imageDims, tabLock, devId, dataUrlToBlob, blobToDataUrl } = io;
const { uploadTimeout, MEDIA_MAX } = await import("./src-folio-schema.mjs");

const canvasOf = (w, h, rgba = [120, 130, 140, 255]) => {
  const c = new FakeCanvas(); c.width = w; c.height = h;
  for (let i = 0; i < c._d.length; i += 4) c._d.set(rgba, i);
  return c;
};
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 3000) => { const t0 = Date.now(); while (!(await f()) && Date.now() - t0 < ms) await tick(5); };

/* ===================================================================================================================
   media rules and putMedia
   =================================================================================================================== */
test("io: putMedia refuses anything but JPEG/PNG data URLs under 950,000 characters and foreign refs", async () => {
  const store = { put: async () => true };
  assert.equal(await putMedia(store, "20999", "s6f.steps.ra.abcdefgh", "data:application/json;base64,e30="), "invalid");
  assert.equal(await putMedia(store, "20999", "s6f.steps.ra.abcdefgh", "data:image/webp;base64,AAAA"), "invalid");
  assert.equal(await putMedia(store, "20999", "s6f.steps.ra.abcdefgh", "data:image/jpeg;base64," + "A".repeat(950000)), "invalid");
  assert.equal(await putMedia(store, "20999", "s4c.eskisImg.1", "data:image/jpeg;base64,AAAA"), "invalid");
  assert.equal(await putMedia(store, "20999", "s6f.steps.ra.abcdefgh", "data:image/jpeg;base64,AAAA"), "ok");
  assert.equal(await putMedia(store, "20999", "s6a.afterImg.1790000000000", "data:image/png;base64,AAAA"), "ok");
  assert.throws(() => assertMedia("data:image/gif;base64,AAAA"));
  assert.throws(() => assertMedia("data:image/jpeg,AAAA"), "base64 only");
  assert.doesNotThrow(() => assertMedia("data:image/png;base64," + "A".repeat(MEDIA_MAX - 23)));
  assert.throws(() => assertMedia("data:image/png;base64," + "A".repeat(MEDIA_MAX - 22)));
  assert.equal(uploadTimeout(900000), 37500);
});

test("io: putMedia results: true ok, fast false rejected, slow false timeout, hanging timeout reused by a retry, offline", async () => {
  const J = "data:image/jpeg;base64,AAAA";
  let calls = 0;
  const mk = (impl) => ({ put: (...a) => { calls++; return impl(...a); } });
  assert.equal(await putMedia(mk(async () => true), "20999", "s6f.edit.L1.aaaaaaaa", J), "ok");
  assert.equal(await putMedia(mk(async () => false), "20999", "s6f.edit.L1.aaaaaaab", J), "rejected");
  assert.equal(await putMedia(mk(() => new Promise((r) => setTimeout(() => r(false), 60))), "20999", "s6f.edit.L1.aaaaaaac", J, { timeoutMs: 100 }), "timeout");
  // a put that never answers in time: timeout, then the retry of the same ref reuses the original promise (one store.put)
  let resolveLate;
  calls = 0;
  const hang = mk(() => new Promise((r) => { resolveLate = r; }));
  assert.equal(await putMedia(hang, "20999", "s6f.edit.L2.aaaaaaaa", J, { timeoutMs: 30 }), "timeout");
  assert.ok(latePut("s6f.edit.L2.aaaaaaaa"), "the late promise is kept");
  assert.equal(await putMedia(hang, "20999", "s6f.edit.L2.aaaaaaaa", J, { timeoutMs: 30 }), "timeout");
  assert.equal(calls, 1, "a retry never uploads twice while the first put is pending");
  resolveLate(true);
  await tick(5);
  assert.equal(await putMedia(hang, "20999", "s6f.edit.L2.aaaaaaaa", J, { timeoutMs: 30 }), "ok", "a late true makes the retry instant");
  assert.equal(calls, 1);
  assert.equal(latePut("s6f.edit.L2.aaaaaaaa"), null);
  // a late false lets the next retry upload again
  calls = 0;
  let rejLate;
  const hang2 = mk(() => new Promise((r) => { rejLate = r; }));
  assert.equal(await putMedia(hang2, "20999", "s6f.edit.L3.aaaaaaaa", J, { timeoutMs: 20 }), "timeout");
  rejLate(false); await tick(5);
  const ok2 = mk(async () => true);
  assert.equal(await putMedia(ok2, "20999", "s6f.edit.L3.aaaaaaaa", J), "ok");
  assert.equal(calls, 2);
  // offline: nothing is sent
  calls = 0;
  NAV.onLine = false;
  assert.equal(await putMedia(mk(async () => true), "20999", "s6f.edit.L4.aaaaaaaa", J), "offline");
  NAV.onLine = true;
  assert.equal(calls, 0);
  // a throwing store is a rejection, not an exception
  assert.equal(await putMedia({ put: () => { throw new Error("x"); } }, "20999", "s6f.edit.L5.aaaaaaaa", J), "rejected");
});

test("io: putMedia uploads one doc at a time across callers", async () => {
  const J = "data:image/jpeg;base64,AAAA";
  let active = 0, maxActive = 0;
  const order = [];
  const store = { put: async (o, ref) => { active++; maxActive = Math.max(maxActive, active); order.push(ref); await tick(10); active--; return true; } };
  const rs = await Promise.all([1, 2, 3].map((i) => putMedia(store, "20999", "s6f.edit.L" + i + ".serialxx", J)));
  assert.deepEqual(rs, ["ok", "ok", "ok"]);
  assert.equal(maxActive, 1);
  assert.deepEqual(order, ["s6f.edit.L1.serialxx", "s6f.edit.L2.serialxx", "s6f.edit.L3.serialxx"]);
});

/* ===================================================================================================================
   mediaCache and decoding
   =================================================================================================================== */
test("io: mediaCache tells read errors from missing docs, caches hits and shares reads in flight", async () => {
  const J = "data:image/jpeg;base64,QUJD";
  let gets = 0;
  const store = { getSafe: async (o, ref) => { gets++; await tick(5); if (ref.endsWith("err")) return { ok: false, data: null }; if (ref.endsWith("gone")) return { ok: true, data: null }; return { ok: true, data: J }; } };
  mediaCache.clear();
  const [a, b] = await Promise.all([mediaCache.get(store, "20999", "s6f.edit.L1.cacheaaa"), mediaCache.get(store, "20999", "s6f.edit.L1.cacheaaa")]);
  assert.deepEqual(a, { ok: true, data: J, missing: false });
  assert.deepEqual(b, a);
  assert.equal(gets, 1, "one read in flight");
  await mediaCache.get(store, "20999", "s6f.edit.L1.cacheaaa");
  assert.equal(gets, 1, "cached");
  assert.deepEqual(await mediaCache.get(store, "20999", "s6f.edit.L1.gone"), { ok: true, data: null, missing: true });
  assert.deepEqual(await mediaCache.get(store, "20999", "s6f.edit.L1.err"), { ok: false, data: null, missing: false });
  mediaCache.drop("s6f.edit.L1.cacheaaa");
  await mediaCache.get(store, "20999", "s6f.edit.L1.cacheaaa");
  assert.equal(gets, 4);
  // LRU of 12 docs
  for (let i = 0; i < 14; i++) mediaCache.set("20999", "s6f.edit.L" + i + ".lruaaaaa", J);
  const before = gets;
  await mediaCache.get(store, "20999", "s6f.edit.L13.lruaaaaa");
  await mediaCache.get(store, "20999", "s6f.edit.L0.lruaaaaa");
  assert.equal(gets, before + 1, "the oldest entries were evicted");
});

test("io: decodeImage never fetches; data URL and Blob round trip; mediaLoader maps missing and errors", async () => {
  const cv = canvasOf(3, 2, [10, 20, 30, 255]);
  const png = await encodePng(cv);
  assert.match(png, /^data:image\/png;base64,/);
  const img = await decodeImage(png);
  assert.equal(img.width, 3); assert.equal(img.height, 2); assert.deepEqual([...img.data.slice(0, 4)], [10, 20, 30, 255]);
  const blob = dataUrlToBlob(png);
  assert.equal(blob.type, "image/png");
  assert.equal(await blobToDataUrl(blob), png);
  await assert.rejects(decodeImage("data:application/json;base64,e30="), (e) => e.code === "decode");
  const store = { getSafe: async (o, ref) => (ref.endsWith("gone") ? { ok: true, data: null } : ref.endsWith("bad") ? { ok: true, data: "data:image/png;base64,AAAA" } : { ok: true, data: png }) };
  mediaCache.clear();
  const load = mediaLoader(store, "20999");
  assert.equal((await load({ ref: "s6f.edit.L1.loadaaaa" })).img.width, 3);
  assert.deepEqual(await load({ ref: "s6f.edit.L1.gone" }), { img: null, missing: true, error: false });
  assert.deepEqual(await load({ ref: "s6f.edit.L1.bad" }), { img: null, missing: false, error: true });
});

test("io: imageDims reads JPEG and PNG headers without decoding (Blob, data URL, bytes)", async () => {
  const png = new Uint8Array(33);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82]);
  new DataView(png.buffer).setUint32(16, 3000); new DataView(png.buffer).setUint32(20, 2000);
  assert.deepEqual(await imageDims(new Blob([png], { type: "image/png" })), { w: 3000, h: 2000 });
  // JPEG with an APP1 (EXIF-like) segment before SOF2
  const app1 = new Uint8Array(4 + 5000); app1.set([0xff, 0xe1, (5002 >> 8) & 255, 5002 & 255]);
  const sof = new Uint8Array([0xff, 0xc2, 0, 17, 8, 0x05, 0xdc, 0x07, 0xd0, 3]);
  const jpg = new Uint8Array([0xff, 0xd8, ...app1, ...sof, 0xff, 0xd9]);
  assert.deepEqual(await imageDims(new Blob([jpg])), { w: 2000, h: 1500 });
  assert.deepEqual(await imageDims("data:image/jpeg;base64," + Buffer.from(jpg).toString("base64")), { w: 2000, h: 1500 });
  assert.deepEqual(await imageDims(jpg), { w: 2000, h: 1500 });
  assert.equal(await imageDims(new Blob([new Uint8Array([1, 2, 3, 4, 5, 6])])), null);
  assert.equal(await imageDims(null), null);
});

/* ===================================================================================================================
   encoders (§6.1)
   =================================================================================================================== */
test("io: encodeJpeg walks q 0.92 → 0.70 in 0.04 steps and throws big below that", async () => {
  // data URL length ≈ 4/3 · size: make q 0.80 the first to fit 950,000 characters
  FAKE.size = ({ q }) => Math.round((q > 0.81 ? 800000 : 700000));
  FAKE.encodes.length = 0;
  const r = await encodeJpeg(canvasOf(10, 10));
  assert.equal(r.q, 0.8);
  assert.deepEqual(FAKE.encodes.map((e) => e.q), [0.92, 0.88, 0.84, 0.8]);
  assert.ok(r.data.length < MEDIA_MAX);
  FAKE.size = () => 800000;
  FAKE.encodes.length = 0;
  await assert.rejects(encodeJpeg(canvasOf(10, 10)), (e) => e.code === "big");
  assert.deepEqual(FAKE.encodes.map((e) => e.q), [0.92, 0.88, 0.84, 0.8, 0.76, 0.72, 0.7]);
  FAKE.size = null;
});

test("io: encodeImage fits maxPx then downscales by 0.8 until the JPEG fits", async () => {
  // size proportional to pixels: 2000×1000 at 0.5 B/px/q-step never fits until the pixel count drops
  FAKE.size = ({ w, h }) => Math.round(w * h * 0.45);
  const r = await encodeImage(canvasOf(2400, 1200), { maxChars: 950000, maxPx: 2000 });
  assert.equal(Math.max(r.w, r.h) <= 2000, true);
  assert.ok(r.data.length < 950000);
  // 2000×1000·0.45 = 900k bytes → 1.2M chars > 950k; ×0.8 → 1600×800 → 576k bytes → 768k chars fits
  assert.deepEqual([r.w, r.h], [1600, 800]);
  FAKE.size = null;
});

test("io: encodeGrey ladder: PNG at full size, JPEG at half, JPEG at quarter (never tiled)", async () => {
  FAKE.size = null;
  const small = await encodeGrey(canvasOf(16, 16, [200, 200, 200, 255]));
  assert.equal(small.f, 2); assert.equal(small.s, 1);
  FAKE.size = ({ type, w, h }) => (type === "image/png" ? w * h * 3 : w * h);
  const mid = await encodeGrey(canvasOf(800, 800));
  assert.deepEqual([mid.f, mid.s], [1, 0.5]);
  FAKE.size = ({ type, w, h }) => (type === "image/png" ? w * h * 3 : w * h * 2.5);
  const big = await encodeGrey(canvasOf(2080, 2080));
  assert.deepEqual([big.f, big.s], [1, 0.25]);
  assert.ok(big.data.length < MEDIA_MAX);
  FAKE.size = null;
});

test("io: encodeThumb makes a ≤ 480 px JPEG over white from a data URL or a canvas", async () => {
  FAKE.encodes.length = 0;
  const th = await encodeThumb(canvasOf(1600, 1200, [0, 0, 0, 0]));
  assert.match(th, /^data:image\/jpeg;base64,/);
  const img = await decodeImage(th);
  assert.deepEqual([img.width, img.height], [480, 360]);
  assert.deepEqual([...img.data.slice(0, 4)], [255, 255, 255, 255], "transparency becomes white");
  const th2 = await encodeThumb(await encodePng(canvasOf(100, 50)));
  assert.deepEqual([(await decodeImage(th2)).width], [100], "never upscaled");
});

/* ===================================================================================================================
   drafts, auth, tab lock, device id
   =================================================================================================================== */
test("io: drafts on an IndexedDB shim: key format, pending with keep, purges, hasUnsaved, 60 MB memory rule", async () => {
  io._resetDraftStore();
  globalThis.indexedDB = fakeIndexedDB();
  assert.equal(drafts.usable(), true);
  await drafts.put("20999", "s6f.edit", { v: 1, at: Date.now(), planes: [] });
  await drafts.put("20998", "s6f.edit", { v: 1, at: Date.now(), planes: [] });
  const db = globalThis.indexedDB._dbs.get("museum-photo");
  assert.ok(db, "database museum-photo");
  assert.deepEqual([...db._stores.get("drafts").keys()].sort(), ["20998|s6f.edit", "20999|s6f.edit"]);
  assert.equal(await drafts.hasUnsaved("20999"), true);
  assert.deepEqual((await drafts.get("20999", "s6f.edit")).v, 1);
  await drafts.addPending("20999", ["a", "b"]);
  await drafts.addPending("20999", ["b", "c"]);
  assert.ok(db._stores.get("drafts").has("20999|pending"));
  assert.deepEqual(await drafts.takePending("20999", { keep: ["b"] }), ["a", "c"]);
  assert.deepEqual(await drafts.takePending("20999"), ["b"], "kept refs stay pending until taken");
  assert.deepEqual(await drafts.takePending("20999"), []);
  await drafts.addPending("20999", ["x", "y"]);
  await drafts.dropPending("20999", ["x"]);
  assert.deepEqual(await drafts.takePending("20999"), ["y"]);
  await drafts.purgeOthers("20999");
  assert.equal(await drafts.hasUnsaved("20998"), false);
  assert.equal(await drafts.hasUnsaved("20999"), true);
  // purgeOld: an old draft goes, pending lists stay
  await drafts.put("20999", "s6f.edit", { v: 1, at: Date.now() - 25 * 3600e3, planes: [] });
  await drafts.addPending("20999", ["p"]);
  await drafts.purgeOld(24 * 3600e3);
  assert.equal(await drafts.hasUnsaved("20999"), false);
  assert.deepEqual(await drafts.takePending("20999"), ["p"]);
  // a draft over 60 MB stays in memory only
  const huge = { v: 1, at: Date.now(), planes: [{ blob: { size: 61e6 } }] };
  await drafts.put("20999", "s6f.edit", huge);
  assert.equal(db._stores.get("drafts").has("20999|s6f.edit"), false);
  assert.equal(await drafts.get("20999", "s6f.edit"), huge);
  await drafts.purgeAll();
  assert.equal(await drafts.hasUnsaved("20999"), false);
  assert.equal(db._stores.get("drafts").size, 0);
});

test("io: drafts fall back to memory without IndexedDB", async () => {
  io._resetDraftStore();
  const saved = globalThis.indexedDB;
  delete globalThis.indexedDB;
  try {
    assert.equal(drafts.usable(), false);
    await drafts.put("20999", "s6f.edit", { v: 1, at: Date.now() });
    assert.equal(await drafts.hasUnsaved("20999"), true);
    await drafts.addPending("20999", ["r1"]);
    assert.deepEqual(await drafts.takePending("20999", { keep: [] }), ["r1"]);
    await drafts.purgeAll();
    assert.equal(await drafts.hasUnsaved("20999"), false);
  } finally { globalThis.indexedDB = saved; io._resetDraftStore(); }
});

test("io: one Saver per student; drafts keyed by student and purged by sign-in changes", async () => {
  assert.equal(getSaver({ owner: "20999" }), getSaver({ owner: "20999" }));
  assert.notEqual(getSaver({ owner: "20999" }), getSaver({ owner: "20998" }));
  await drafts.put("20999", "s6f.edit", { v: 1, at: Date.now() });
  await drafts.put("20998", "s6f.edit", { v: 1, at: Date.now() });
  let cb = null;
  watchAuthForDrafts({ watch: (f) => { cb = f; return () => {}; } });
  const s98 = getSaver({ owner: "20998" });
  cb({ email: "20999@museum.class" });
  await until(async () => !(await drafts.hasUnsaved("20998")));
  assert.equal(currentSid(), "20999");
  assert.equal(await drafts.hasUnsaved("20998"), false);
  assert.equal(await drafts.hasUnsaved("20999"), true);
  assert.notEqual(getSaver({ owner: "20998" }), s98, "another student's Saver was dropped");
  cb(null);
  await until(async () => !(await drafts.hasUnsaved("20999")));
  assert.equal(currentSid(), "");
  assert.equal(await drafts.hasUnsaved("20999"), false);
});

test("io: tabLock with navigator.locks (ifAvailable) and without it; devId is a stable 31-bit id", async () => {
  assert.deepEqual((await tabLock("museum-photo:20999")).ok, true, "no navigator.locks: assumed owner");
  const held = new Set();
  NAV.locks = {
    request: async (name, opts, cb) => {
      if (held.has(name)) return cb(null);
      held.add(name);
      try { return await cb({ name }); } finally { held.delete(name); }
    },
  };
  const a = await tabLock("museum-photo:20999");
  const b = await tabLock("museum-photo:20999");
  assert.equal(a.ok, true); assert.equal(b.ok, false);
  a.release(); await tick(5);
  const c = await tabLock("museum-photo:20999");
  assert.equal(c.ok, true); c.release();
  delete NAV.locks;
  const ss = new Map();
  globalThis.sessionStorage = { getItem: (k) => (ss.has(k) ? ss.get(k) : null), setItem: (k, v) => ss.set(k, String(v)) };
  const d1 = devId(), d2 = devId();
  assert.equal(d1, d2); assert.ok(Number.isInteger(d1) && d1 > 0 && d1 <= 0x7fffffff);
  assert.equal(ss.get("museum:photoDev"), String(d1));
  delete globalThis.sessionStorage;
  const d3 = devId(), d4 = devId();
  assert.equal(d3, d4, "without sessionStorage the id lives per module load");
});

/* ===================================================================================================================
   encodeJob ladder and the Saver (§6.4–§6.10) against a simulated StudentApp (setField + wsSaved + render counter)
   =================================================================================================================== */
const { makeMemGfx, PhotoDoc } = await import("./src-photo-doc.mjs");
const { Renderer } = await import("./src-photo-render.mjs");
const { appendLog, normTrash, trashRefs, liveRefs, refsIn } = await import("./src-portfolio-core.mjs");
const { LIMITS, KEYS } = await import("./src-folio-schema.mjs");

test("io: encodeJob colour ladder: whole JPEG, then 2×2 tiles while tiled planes remain, then ×0.8 downscales", async () => {
  const g = makeMemGfx();
  const base = g.surface(60, 40);
  const doc = new PhotoDoc(g, { base, w: 60, h: 40 });
  const L = doc.addLayer("px", { t: "clone" });
  const ed = doc.beginEdit(L.id, "px"); const px = new Uint8ClampedArray(60 * 40 * 4).fill(200); for (let i = 3; i < px.length; i += 4) px[i] = 255;
  ed.surface.write({ x: 0, y: 0, w: 60, h: 40 }, px); ed.commit("clone", { o: "clone" });
  const job = () => doc.dirtyJobs()[0];
  FAKE.size = () => 1000;
  let r = await io.encodeJob(doc, job(), "aaaaaaaa", { tiledLeft: 2 });
  assert.deepEqual([r.ptr.c.ref, r.ptr.c.s, r.ptr.c.parts, r.ptr.a], ["s6f.edit.L1.aaaaaaaa", undefined, undefined, null]);
  // whole plane too big at q 0.70, quarters fit: four tiles
  FAKE.size = ({ type, w, h }) => (type === "image/jpeg" && w * h > 600 ? 800000 : 1000);
  r = await io.encodeJob(doc, job(), "aaaaaaab", { tiledLeft: 1 });
  assert.equal(r.ptr.c.parts.length, 4); assert.equal(r.ptr.c.s, undefined);
  assert.deepEqual(r.payloads.map((p) => p.ref.slice(-2)), ["t0", "t1", "t2", "t3"]);
  // no tiled plane left: downscale ×0.8 until the whole plane fits (60·40·0.64 = 1536 > 600, ·0.512… = 983 > 600, ·0.4096 ≈ 393)
  FAKE.size = ({ type, w, h }) => (type === "image/jpeg" && w * h > 600 ? 800000 : 1000);
  r = await io.encodeJob(doc, job(), "aaaaaaac", { tiledLeft: 0 });
  assert.equal(r.ptr.c.parts, undefined); assert.equal(r.ptr.c.s, 0.41);
  FAKE.size = null;
});

/** a store that logs every call; behave(ref) → true | false | "hang" | {delay, ok} */
function spyStore() {
  const db = new Map(), log = [];
  const s = {
    db, log, behave: null, gets: 0,
    put: (o, ref, d) => {
      log.push(["put", ref]);
      const b = s.behave ? s.behave(ref) : true;
      if (b === "hang") return new Promise(() => {});
      const finish = (ok) => { if (ok) db.set(o + "_" + ref, d); return ok; };
      if (b && typeof b === "object") return new Promise((res) => setTimeout(() => res(finish(b.ok !== false)), b.delay));
      return Promise.resolve(finish(b !== false));
    },
    getSafe: async (o, ref) => { s.gets++; return { ok: true, data: db.get(o + "_" + ref) || null }; },
    remove: async (o, ref) => { log.push(["remove", ref]); db.delete(o + "_" + ref); return true; },
  };
  return s;
}
const BASE_REF = "s6f.steps.rc.basebase";
const BASE_DATA = "data:image/jpeg;base64,QkFTRQ==";
function world({ owner = "20999", w = 40, h = 30, rgba = [90, 90, 90, 255] } = {}) {
  const store = spyStore();
  store.db.set(owner + "_" + BASE_REF, BASE_DATA);
  let ws = {}, saved = true, seq = 0, locked = false;
  const calls = [];
  const setField = (k, v, opts) => {
    if (locked && !(opts && opts.upload)) { calls.push({ k, refused: true }); return false; }
    ws = { ...ws, [k]: typeof v === "function" ? v(ws[k]) : v };
    saved = false;
    calls.push({ k, upload: !!(opts && opts.upload), puts: store.log.filter((x) => x[0] === "put").length });
    return true;
  };
  const g = makeMemGfx();
  const base = g.surface(w, h); for (let i = 0; i < base.data.length; i += 4) base.data.set(rgba, i);
  const doc = new PhotoDoc(g, { base, w, h });
  const renderer = new Renderer(doc, g, { proxyMax: 1280 });
  const session = {
    sr: {}, pr: { mode: 1, paper: 0, bw: 0, ppi: 240 }, st: 0, snaps: [], m: { base: null, out: null, cmp: null }, log: [], lastSavedDocRev: 0,
    baseSrc: { ref: BASE_REF, w, h, r: 2, sg: "0123456789abcdef" },
    apply(part) {
      let log = this.log;
      for (const d of doc.history.logDeltas()) log = appendLog(log, { ...d.delta }, Math.floor(Date.now() / 1000));
      return { ...part, m: this.m, sr: this.sr, snaps: this.snaps, st: this.st, pr: this.pr, log };
    },
  };
  const saver = new io.Saver({ store, owner, dev: 111, setFieldRef: { current: setField }, getWs: () => ws });
  saver.attach(doc, renderer, session);
  SETTLE = saver;
  const W = {
    store, saver, doc, renderer, session, calls, g,
    get ws() { return ws; }, set ws(v) { ws = v; saved = false; },
    get seq() { return seq; },
    render() { seq++; saver.observe(ws, saved, seq); },          // a render with the current save state
    ack() { saved = true; seq++; saver.observe(ws, true, seq); },  // the worksheet reached "saved"
    lock(v) { locked = v; saver.setLock(v); },
    paint(id, r, rgba = [200, 0, 0, 255], lk = "clone") {
      const ed = doc.beginEdit(id, "px"); const d = new Uint8ClampedArray(r.w * r.h * 4); for (let i = 0; i < d.length; i += 4) d.set(rgba, i);
      ed.surface.write(r, d); ed.commit(lk, { o: lk, n: 1 });
    },
    puts() { return store.log.filter((x) => x[0] === "put").map((x) => x[1]); },
    removes() { return store.log.filter((x) => x[0] === "remove").map((x) => x[1]); },
    edit() { return ws[KEYS.edit]; },
    trash() { return trashRefs(ws[KEYS.trash]); },
  };
  return W;
}
let SETTLE = null;
const settle = () => (SETTLE ? SETTLE.settled() : tick(30));

test("Saver: pre-check before any upload; all uploads before the manifest write; {upload:true} only when something uploaded", async () => {
  globalThis.__PHX_TEST__ = { graceMs: 0 };
  const W = world();
  const L = W.doc.addLayer("px", { t: "clone" });
  W.paint(L.id, { x: 2, y: 2, w: 10, h: 8 });
  const A = W.doc.addLayer("adj", { t: "bc", p: { b: 20 } });
  W.doc.addMask(A.id, "all");
  W.render();
  const st = await W.saver.save(null, null, null, { reason: "manual" });
  assert.equal(st.phase, "confirming");
  const puts = W.puts();
  assert.deepEqual(puts.map((r) => r.split(".")[2]), ["base", "L" + L.id, "M" + A.id], "base, colour, mask, one at a time");
  const editCalls = W.calls.filter((c) => c.k === KEYS.edit);
  assert.equal(editCalls.length, 1);
  assert.equal(editCalls[0].puts, 3, "the manifest is written after every upload");
  assert.equal(editCalls[0].upload, true);
  const e = W.edit();
  assert.ok(e.sv > 0 && e.dev === 111 && e.rev === 1 && e.crev === 1);
  assert.equal(e.m.base.ref, puts[0]); assert.equal(e.m.base.src, BASE_REF);
  assert.deepEqual(refsIn(e).sort(), puts.slice().sort());
  assert.equal(W.store.db.get("20999_" + puts[0]), BASE_DATA, "the base is a byte-identical copy");
  // confirmation: our sv with wsSaved true (no false needed)
  W.ack();
  assert.equal(W.saver.state.phase, "saved");
  await settle();
  assert.deepEqual(W.doc.dirtyJobs(), []);
  assert.equal(W.doc.dirty, false);
  assert.equal(await io.drafts.hasUnsaved("20999"), false, "a confirmed save with nothing dirty deletes the draft");
  // parameter-only save: no upload, no {upload:true}
  W.doc.setProp(A.id, "p.b", 40);
  await W.saver.save();
  assert.equal(W.puts().length, 3);
  const last = W.calls.filter((c) => c.k === KEYS.edit).pop();
  assert.equal(last.upload, false);
  W.ack(); await settle();
  assert.equal(W.edit().L.find((x) => x.id === A.id).p.b, 40);
  // a broken session value stops the save before any upload, with error "ws" and no exception
  W.paint(L.id, { x: 20, y: 2, w: 4, h: 4 });
  W.session.pr = new Float32Array(2);
  const bad = await W.saver.save();
  assert.deepEqual([bad.phase, bad.err], ["error", "ws"]);
  assert.equal(W.puts().length, 3);
  delete globalThis.__PHX_TEST__;
});

test("Saver: superseded computed from the latest ws; trash append in the same tick; GC-before-append past 64", async () => {
  const W = world();
  const L = W.doc.addLayer("px", { t: "clone" });
  W.paint(L.id, { x: 2, y: 2, w: 10, h: 8 });
  await W.saver.save(); W.ack(); await settle();
  const first = W.edit().L.find((x) => x.id === L.id).c.ref;
  // repaint; while the upload is slow another device writes a manifest carrying a layer of its own
  W.paint(L.id, { x: 5, y: 5, w: 3, h: 3 }, [0, 0, 255, 255]);
  W.store.behave = () => ({ delay: 40 });
  const p = W.saver.save();
  await tick(10);
  const other = { ...W.edit(), L: [...W.edit().L, { id: 77, k: 1, bx: { x: 0, y: 0, w: 2, h: 2 }, c: { ref: "s6f.edit.L77.otherdev", f: 1 } }], sv: 5, dev: 222 };
  W.ws = { ...W.ws, [KEYS.edit]: other };
  await p;
  W.store.behave = null;
  const i = W.calls.map((c) => c.k).lastIndexOf(KEYS.edit);
  assert.ok(i > 0);
  assert.equal(W.calls[i + 1].k, KEYS.trash, "the trash append follows the manifest write in the same tick");
  const tr = W.trash();
  assert.ok(tr.includes(first), "the replaced colour plane");
  assert.ok(tr.includes("s6f.edit.L77.otherdev"), "refs of the latest ws (another device) that the write drops");
  assert.equal(W.calls[i + 1].upload, true, "the trash append rides with the upload write");
  W.ack(); await settle();
  // GC-before-append: a full trash of 64 old refs is trimmed before the next append
  const old = Array.from({ length: 64 }, (_, k) => ({ ref: "s6f.edit.L9" + k + ".oldoldol" }));
  W.ws = { ...W.ws, [KEYS.trash]: { v: 1, b: [{ t: 1, q: old }] } };
  W.ack();
  W.paint(L.id, { x: 1, y: 1, w: 2, h: 2 }, [9, 9, 9, 255]);
  await W.saver.save();
  assert.ok(W.trash().length <= LIMITS.trashMax, "trash " + W.trash().length);
  assert.ok(W.removes().length >= 1, "the oldest entries were deleted to make room");
});

test("Saver: confirmation also after an unmount (no false observed); a lost write trashes own uploads (grace) and re-queues superseded refs", async () => {
  const W = world();
  const L = W.doc.addLayer("px", { t: "clone" });
  W.paint(L.id, { x: 2, y: 2, w: 10, h: 8 });
  await W.saver.save();
  await W.saver.detach();                     // the editor closed; FolioPad keeps observing
  W.ack();
  assert.equal(W.saver.state.phase, "saved");
  await settle();
  // lost: another device's write lands after ours (other sv), so our uploads are removed and our superseded refs re-queued
  W.saver.attach(W.doc, W.renderer, W.session);
  const before = W.edit().L.find((x) => x.id === L.id).c.ref;
  W.paint(L.id, { x: 6, y: 6, w: 4, h: 4 }, [0, 255, 0, 255]);
  await W.saver.save();
  const mine = W.edit().L.find((x) => x.id === L.id).c.ref;
  assert.ok(W.trash().includes(before));
  const foreign = { v: 1, rev: 9, crev: 9, dev: 222, sv: 333, L: [], doc: W.edit().doc, m: { base: W.edit().m.base, out: null, cmp: null } };
  W.ws = { ...W.ws, [KEYS.edit]: foreign, [KEYS.trash]: { v: 1, b: [] } };
  W.ack();
  assert.equal(W.saver.state.phase, "conflict", "another device with a newer crev");
  await settle();
  assert.ok(!W.removes().includes(mine), "a lost write never removes directly (R7: the judgement may be wrong)");
  assert.ok(W.trash().includes(mine), "our never-referenced upload goes to the trash with the grace");
  assert.ok(W.trash().includes(before), "our superseded ref is appended to the trash again");
  assert.deepEqual(W.doc.dirtyJobs().map((j) => j.layerId), [L.id], "the plane stays dirty");
});

test("Saver: nothing deleted while locked or before confirmation; GC respects grace, soft cap and live refs", async () => {
  const W = world();
  const L = W.doc.addLayer("px", { t: "clone" });
  W.paint(L.id, { x: 2, y: 2, w: 10, h: 8 });
  await W.saver.save(); W.ack(); await settle();
  // real grace: a superseded ref stays in the trash
  W.paint(L.id, { x: 3, y: 3, w: 2, h: 2 }, [1, 2, 3, 255]);
  await W.saver.save();
  const gone = W.trash();
  assert.equal(gone.length, 1);
  assert.deepEqual(W.removes(), [], "nothing is deleted before the write is confirmed");
  W.ack(); await settle();
  assert.deepEqual(W.removes(), [], "inside the 30-minute grace");
  assert.ok(W.store.db.has("20999_" + gone[0]));
  // grace 0 but locked: nothing
  globalThis.__PHX_TEST__ = { graceMs: 0 };
  W.lock(true);
  assert.deepEqual(await W.saver.gcRun(), []);
  assert.deepEqual(W.removes(), []);
  W.lock(false);
  // a ref that is live again is dropped from the trash without deleting it
  const live = W.edit().L.find((x) => x.id === L.id).c.ref;
  W.ws = { ...W.ws, [KEYS.trash]: { v: 1, b: [{ t: 1, q: [{ ref: gone[0] }, { ref: live }] }] } };
  const done = await W.saver.gcRun();
  assert.deepEqual(done, [gone[0]], "gcPlan never plans a live ref");
  assert.deepEqual(W.removes(), [gone[0]]);
  assert.ok(W.store.db.has("20999_" + live), "a live ref is never deleted");
  assert.deepEqual(W.trash(), [live]);
  W.ws = { ...W.ws, [KEYS.trash]: { v: 1, b: [] } };
  delete globalThis.__PHX_TEST__;
  // soft cap: beyond 24 entries the oldest go regardless of grace
  const many = Array.from({ length: 30 }, (_, k) => ({ ref: "s6f.edit.L5" + k + ".softcapx" }));
  W.ws = { ...W.ws, [KEYS.trash]: { v: 1, b: [{ t: Math.floor(Date.now() / 1000), q: many }] } };
  const cut = await W.saver.gcRun();
  assert.equal(cut.length, 6);
  assert.equal(W.trash().length, 24);
});

test("Saver: 12 tiled saves and 12 mask changes inside the real grace keep saving with the trash ≤ 64", async () => {
  const W = world({ w: 80, h: 60 });
  const L = W.doc.addLayer("px", { t: "clone" });
  const A = W.doc.addLayer("adj", { t: "bc", p: { b: 5 } });
  W.doc.addMask(A.id, "all");
  FAKE.size = ({ type, w, h }) => (type === "image/jpeg" && w * h > 2000 ? 800000 : 1000);
  for (let i = 0; i < 12; i++) {
    W.paint(L.id, { x: 0, y: 0, w: 80, h: 60 }, [i * 20, 0, 0, 255]);
    const ed = W.doc.beginEdit(A.id, "mask"); ed.surface.write({ x: i, y: 0, w: 1, h: 1 }, new Uint8ClampedArray(4)); ed.commit("maskPaint", { o: "mask" });
    const st = await W.saver.save();
    assert.equal(st.phase, "confirming", "save " + i + ": " + st.err);
    assert.ok(W.edit().L.find((x) => x.id === L.id).c.parts, "tiled colour plane");
    assert.ok(W.trash().length <= LIMITS.trashMax);
    W.ack(); await settle();
  }
  FAKE.size = null;
  assert.ok(W.trash().length <= LIMITS.trashSoft + 5, "trash " + W.trash().length);
  const live = liveRefs(W.ws);
  for (const k of W.store.db.keys()) {
    const ref = k.slice(6);
    if (ref.startsWith("s6f.edit.")) assert.ok(live.has(ref) || W.trash().includes(ref), "orphan " + ref);
  }
});

test("Saver: a lock during a plan writes the manifest only when every job was uploaded; unlock resumes with the same refs", async () => {
  const W = world();
  const L = W.doc.addLayer("px", { t: "clone" });
  W.paint(L.id, { x: 2, y: 2, w: 10, h: 8 });
  const A = W.doc.addLayer("adj", { t: "bc", p: { b: 20 } }); W.doc.addMask(A.id, "all");
  let once = false;
  W.store.behave = () => { if (!once) { once = true; setTimeout(() => W.lock(true), 0); } return { delay: 30 }; };   // lock during the first upload
  const p = W.saver.save();
  const st = await p;
  assert.equal(st.phase, "locked");
  assert.equal(W.puts().length, 1, "the payload in flight finishes; nothing more is sent");
  assert.equal(W.edit(), undefined, "no manifest write");
  const draft = await io.drafts.get("20999", KEYS.edit);
  assert.ok(draft.planned.length >= 2 && draft.planned.filter((x) => x.done).length === 0, "the colour/mask plan is kept in the draft");
  W.lock(false);
  W.store.behave = null;
  await W.saver.save();
  const puts = W.puts();
  assert.equal(new Set(puts).size, puts.length, "no ref is uploaded twice");
  assert.ok(draft.planned.every((x) => puts.includes(x.ref)), "the kept plan resumed with the same refs");
  W.ack(); await settle();
  // lock during the last payload: the manifest is written with {upload:true}, the only write allowed
  W.paint(L.id, { x: 1, y: 1, w: 3, h: 3 }, [1, 1, 1, 255]);
  let once2 = false;
  W.store.behave = () => { if (!once2) { once2 = true; setTimeout(() => W.lock(true), 0); } return { delay: 30 }; };   // lock during the last (only) upload
  const p2 = W.saver.save();
  await p2;
  W.store.behave = null;
  const lastEdit = W.calls.filter((c) => c.k === KEYS.edit).pop();
  assert.equal(lastEdit.upload, true);
  assert.equal(W.saver.state.phase, "confirming");
  assert.deepEqual(W.removes(), [], "no deletes while locked");
  W.lock(false);
});

test("Saver: timeout keeps the plan and the retry reuses the same ref; rejection removes the plan's uploads and keeps the manifest", async () => {
  const W = world();
  const L = W.doc.addLayer("px", { t: "clone" });
  W.paint(L.id, { x: 2, y: 2, w: 10, h: 8 });
  const A = W.doc.addLayer("adj", { t: "bc", p: { b: 20 } }); W.doc.addMask(A.id, "all");
  // rejected mask upload: base and colour were uploaded and are removed again; no manifest
  W.store.behave = (ref) => !ref.includes(".M");
  let st = await W.saver.save();
  assert.deepEqual([st.phase, st.err], ["error", "rejected"]);
  assert.equal(W.edit(), undefined);
  assert.deepEqual(W.removes().sort(), W.puts().filter((r) => !r.includes(".M")).sort());
  assert.ok(await io.drafts.hasUnsaved("20999"), "the draft is kept");
  // timeout: the put hangs, the state says timeout; the retry reuses the pending promise (one store.put per ref)
  globalThis.__PHX_TEST__ = { putTimeoutMs: 50 };
  W.store.behave = (ref) => (ref.includes(".M") ? "hang" : true);
  const n0 = W.puts().length;
  st = await W.saver.save();
  assert.deepEqual([st.phase, st.err], ["error", "timeout"]);
  const hung = W.puts().slice(n0).find((r) => r.includes(".M"));
  W.store.behave = null;
  st = await W.saver.save();
  assert.equal(st.phase, "error", "the first put still hangs: the retry waits on the same promise");
  assert.equal(W.puts().filter((r) => r === hung).length, 1, "a retry never uploads the same ref twice");
  delete globalThis.__PHX_TEST__;
});

test("Saver: a payload that finishes after the editor closed under a lock is recorded in the draft; resuming never uploads a ref twice", async () => {
  const W = world();
  // a first confirmed save puts the base copy on the server (the server manifest decides whether a base job is needed, R5)
  const L0 = W.doc.addLayer("px", { t: "clone" });
  W.paint(L0.id, { x: 0, y: 0, w: 2, h: 2 });
  assert.equal((await W.saver.save()).phase, "confirming");
  W.ack(); await W.saver.settled();
  const n0 = W.puts().length;
  const L = W.doc.addLayer("px", { t: "clone" });
  W.paint(L.id, { x: 2, y: 2, w: 10, h: 8 });
  const A = W.doc.addLayer("adj", { t: "bc", p: { b: 20 } }); W.doc.addMask(A.id, "all");
  let once = false;
  W.store.behave = () => { if (!once) { once = true; setTimeout(() => { W.lock(true); W.saver.detach(); }, 0); } return { delay: 40 }; };
  const st = await W.saver.save();
  assert.equal(st.phase, "locked");
  await W.saver.settled();
  const draft = await io.drafts.get("20999", KEYS.edit);
  const first = W.puts()[n0];
  assert.ok(draft.planned.some((x) => x.ref === first && x.done), "the finished payload is marked done in the draft");
  W.store.behave = null;
  W.lock(false);
  W.saver.attach(W.doc, W.renderer, W.session);
  W.saver.resumeFrom(draft);
  assert.equal((await W.saver.save()).phase, "confirming");
  const puts = W.puts();
  assert.equal(new Set(puts).size, puts.length, "no ref uploaded twice: " + puts.join(" "));
  assert.ok(draft.planned.every((x) => puts.includes(x.ref)), "the kept refs were used");
});

test("Saver: lock → unlock → save succeeds, with the editor attached and after it closed; getLocked is the source of truth", async () => {
  // with a getter (the app's WsLockCtx): a stale setLock(true) never keeps the Saver locked
  let lockedNow = false;
  const W = world();
  W.saver.getLocked = () => lockedNow;
  const L = W.doc.addLayer("px", { t: "clone" });
  W.paint(L.id, { x: 2, y: 2, w: 10, h: 8 });
  lockedNow = true; W.saver.setLock(true);
  assert.equal((await W.saver.save()).phase, "locked");
  lockedNow = false;                       // unlocked, but nobody calls setLock(false) (the editor is gone)
  await W.saver.detach();
  W.saver.attach(W.doc, W.renderer, W.session);
  assert.equal((await W.saver.save()).phase, "confirming", "the getter says unlocked");
  W.ack(); await W.saver.settled();
  assert.equal(W.saver.state.phase, "saved");
  // without a getter: setLock(false) clears the lock; saves work again, with the editor attached and after a close
  const V = world({ owner: "20998" });
  const M = V.doc.addLayer("px", { t: "clone" });
  V.paint(M.id, { x: 1, y: 1, w: 4, h: 4 });
  V.lock(true);
  assert.equal((await V.saver.save()).phase, "locked");
  V.lock(false);
  assert.equal((await V.saver.save()).phase, "confirming");
  V.ack(); await V.saver.settled();
  V.paint(M.id, { x: 6, y: 6, w: 2, h: 2 }, [1, 2, 3, 255]);
  V.lock(true);
  await V.saver.detach();
  V.lock(false);
  // D19: a save of a document that is no longer attached stops before encoding (nothing uploaded, nothing written)
  const putsB = V.puts().length, revB = V.edit().rev;
  assert.notEqual((await V.saver.save(V.doc, V.renderer, V.session)).phase, "confirming", "a detached document is not saved");
  assert.equal(V.puts().length, putsB); assert.equal(V.edit().rev, revB);
  V.saver.attach(V.doc, V.renderer, V.session);
  assert.equal((await V.saver.save()).phase, "confirming", "after the reopen and the unlock the save goes through");
  V.ack(); await V.saver.settled();
  assert.equal(V.saver.state.phase, "saved");
});

/* =====================================================================================================================
   review round 1 (r1-data-safety.md): the reviewer's scenarios, asserting the fixed behaviour
   ===================================================================================================================== */
const decodePx = async (data) => { const bm = await createImageBitmap(dataUrlToBlob(data)); return Array.from(bm.data.slice(0, 4)); };
const allRefsExist = (W) => refsIn(W.edit()).filter((r) => !W.store.db.has("20999_" + r));
const liveInTrash = (W) => { const live = liveRefs(W.ws); return W.trash().filter((r) => live.has(r)); };

test("R1 fixed: a save after the 30 s confirmation wait keeps m.base written by the unconfirmed save", async () => {
  const W = world();
  const L = W.doc.addLayer("px", { t: "clone" });
  W.paint(L.id, { x: 2, y: 2, w: 10, h: 8 });
  assert.equal((await W.saver.save()).phase, "confirming");
  const base1 = W.edit().m.base.ref;
  assert.equal(W.session.m.base && W.session.m.base.ref, base1, "the session follows the write at once");
  W.render();
  W.saver._waitConfirm = () => Promise.resolve(false);   // what the real wait returns after 30 s
  W.paint(L.id, { x: 20, y: 2, w: 4, h: 4 }, [0, 0, 255, 255]);
  await W.saver.save();
  assert.equal(W.edit().m.base.ref, base1);
  W.ack(); await settle();
  assert.equal(W.saver.state.phase, "saved");
  assert.equal(W.edit().m.base.ref, base1, "m.base survives");
  assert.ok(!W.trash().includes(base1), "the base copy is not trashed");
  assert.deepEqual(allRefsExist(W), []);
  assert.equal(W.doc.dirty, false, "the second write confirmed both");
});

test("R1b/R1c fixed: export pointers and a stage snapshot of an unconfirmed save survive the next save", async () => {
  const W = world();
  const L = W.doc.addLayer("px", { t: "clone" });
  W.paint(L.id, { x: 2, y: 2, w: 10, h: 8 });
  await W.saver.save(); W.ack(); await settle();
  W.paint(L.id, { x: 3, y: 3, w: 2, h: 2 }, [9, 9, 9, 255]);
  await W.saver.save(null, null, null, { reason: "export", exportFinal: true });
  const out1 = W.edit().m.out.ref, cmp1 = W.edit().m.cmp.ref;
  W.render();
  W.saver._waitConfirm = () => Promise.resolve(false);
  W.paint(L.id, { x: 6, y: 6, w: 2, h: 2 }, [1, 2, 3, 255]);
  const stg = W.doc.stage;
  await W.saver.save(null, null, null, { reason: "stage", snapshotStage: stg });
  const snapRef = (W.edit().snaps[0] || {}).ref;
  assert.ok(snapRef, "a snapshot was written");
  W.paint(L.id, { x: 8, y: 8, w: 2, h: 2 }, [7, 7, 7, 255]);
  await W.saver.save();
  W.ack(); await settle();
  assert.equal(W.edit().m.out.ref, out1, "export pointer kept");
  assert.equal(W.edit().m.cmp.ref, cmp1, "compare image kept");
  assert.equal((W.edit().snaps[0] || {}).ref, snapRef, "snapshot kept");
  for (const r of [out1, cmp1, snapRef]) assert.ok(!W.trash().includes(r), "not trashed: " + r);
  assert.deepEqual(allRefsExist(W), []);
});

test("R2 fixed: a plan kept from a closed editor is never replayed into a new document; its late upload goes to the trash", async () => {
  globalThis.__PHX_TEST__ = { putTimeoutMs: 50 };
  const W = world();
  const L1 = W.doc.addLayer("px", { t: "clone" });
  W.paint(L1.id, { x: 2, y: 2, w: 10, h: 8 }, [255, 0, 0, 255]);
  W.store.behave = (ref) => (ref.includes(".L") ? { delay: 150 } : true);
  const s1 = await W.saver.save();
  assert.equal(s1.err, "timeout");
  const redRef = W.puts().find((r) => r.includes(".L"));
  await W.saver.detach();
  const g = makeMemGfx();
  const base = g.surface(40, 30); for (let i = 0; i < base.data.length; i += 4) base.data.set([90, 90, 90, 255], i);
  const doc2 = new PhotoDoc(g, { base, w: 40, h: 30 });
  const rend2 = new Renderer(doc2, g, { proxyMax: 1280 });
  await io.drafts.del("20999", KEYS.edit);   // the student chose to start from the saved content
  W.saver.attach(doc2, rend2, W.session);
  const L2 = doc2.addLayer("px", { t: "clone" });
  const ed = doc2.beginEdit(L2.id, "px"); const d = new Uint8ClampedArray(10 * 8 * 4); for (let i = 0; i < d.length; i += 4) d.set([0, 0, 255, 255], i);
  ed.surface.write({ x: 2, y: 2, w: 10, h: 8 }, d); ed.commit("clone", { o: "clone", n: 1 });
  assert.equal(L2.id, L1.id, "same key and rev as the kept plan (the hazard)");
  W.store.behave = null;
  await tick(200);   // the timed-out put of session 1 lands late
  assert.equal((await W.saver.save(doc2, rend2, W.session)).phase, "confirming");
  const rec = W.edit().L.find((x) => x.id === L2.id);
  assert.notEqual(rec.c.ref, redRef, "a new ref for the new document");
  W.ack(); await settle();
  assert.deepEqual((await decodePx(W.store.db.get("20999_" + rec.c.ref))).slice(0, 3), [0, 0, 255], "session 2's blue plane is stored");
  assert.equal(doc2.dirty, false);
  assert.ok(W.trash().includes(redRef), "the kept plan's late upload is trashed (deleted after the grace)");
  assert.deepEqual(allRefsExist(W), []);
  delete globalThis.__PHX_TEST__;
});

test("R2 fixed: direct removals and own-upload trashing skip refs that a manifest references", async () => {
  const W = world();
  const L = W.doc.addLayer("px", { t: "clone" });
  W.paint(L.id, { x: 2, y: 2, w: 10, h: 8 });
  await W.saver.save(); W.ack(); await settle();
  const live = [...liveRefs(W.ws)];
  assert.ok(live.length >= 2);
  await W.saver._removeRefs(live);
  assert.deepEqual(W.removes().filter((r) => live.includes(r)), [], "nothing live removed");
  await W.saver._trashOwn(live);
  assert.deepEqual(liveInTrash(W), [], "nothing live trashed");
});

test("R3 fixed: closing the editor while a save uploads keeps this session's edit-log entries", async () => {
  const logs = [];
  for (const close of [false, true]) {
    const W = world();
    const L = W.doc.addLayer("px", { t: "clone" });
    W.paint(L.id, { x: 2, y: 2, w: 10, h: 8 });
    W.paint(L.id, { x: 14, y: 2, w: 4, h: 4 }, [0, 255, 0, 255], "heal");
    W.store.behave = () => ({ delay: 40 });
    const p = W.saver.save();
    if (close) { await tick(5); await W.saver.detach(); W.doc.dispose(); }
    const st = await p;
    W.store.behave = null;
    assert.equal(st.phase, "confirming", close ? "the detached save still writes" : "open");
    const e = W.edit();
    logs.push((e.log || []).length);
    assert.ok(e.L.find((x) => x.id === L.id).c, "the layer keeps its pixels");
    W.ack(); await settle();
    assert.deepEqual(allRefsExist(W), []);
  }
  assert.ok(logs[0] > 0);
  assert.equal(logs[1], logs[0], "the same log entries with the editor closed mid-save");
});

test("R4 fixed: a ref whose late put landed and was then removed is uploaded again", async () => {
  const store = spyStore();
  store.behave = () => ({ delay: 120 });
  const ref = "s6f.steps.ra.mupaaaaa.th", data = "data:image/jpeg;base64,VEhVTUI=";
  assert.equal(await putMedia(store, "20999", ref, data, { timeoutMs: 40 }), "timeout");
  await tick(150);
  await store.remove("20999", ref);              // the card's own remove, without forgetLate
  store.behave = null;
  const n0 = store.log.filter((x) => x[0] === "put").length;
  assert.equal(await putMedia(store, "20999", ref, data), "ok");
  assert.equal(store.log.filter((x) => x[0] === "put").length - n0, 1, "uploaded again");
  assert.ok(store.db.has("20999_" + ref));
  // removeMedia forgets the late put itself
  const ref2 = "s6f.steps.ra.mupaaaab.th";
  store.behave = () => ({ delay: 120 });
  assert.equal(await putMedia(store, "20999", ref2, data, { timeoutMs: 40 }), "timeout");
  await tick(150);
  await io.removeMedia(store, "20999", ref2);
  assert.equal(latePut(ref2), null);
  store.behave = null;
  assert.equal(await putMedia(store, "20999", ref2, data), "ok");
  assert.ok(store.db.has("20999_" + ref2));
});

test("R5 fixed: after another device's rebase a save stops with a conflict; keeping this device's content re-uploads everything", async () => {
  const { rebaseEdit, addTrash, gcPlan } = await import("./src-portfolio-core.mjs");
  const W = world();
  const L = W.doc.addLayer("px", { t: "clone" });
  W.paint(L.id, { x: 2, y: 2, w: 10, h: 8 });
  await W.saver.save(null, null, null, { exportFinal: true }); W.ack(); await settle();
  const oldBase = W.edit().m.base.ref, oldOut = W.edit().m.out.ref;
  W.paint(L.id, { x: 5, y: 5, w: 2, h: 2 }, [1, 1, 1, 255]);
  const rb = rebaseEdit(W.edit(), Date.now(), 222);
  W.ws = { ...W.ws, [KEYS.edit]: rb.value, [KEYS.trash]: addTrash(W.ws[KEYS.trash], rb.superseded, Math.floor(Date.now() / 1000), { x: 1 }) };
  W.ack();
  for (const r of gcPlan(W.ws, { graceMs: 1800000 })) await W.store.remove("20999", r);
  const rev0 = W.edit().rev;
  assert.equal((await W.saver.save()).phase, "conflict", "no silent overwrite of the rebase");
  assert.equal(W.edit().rev, rev0, "nothing written");
  assert.equal(W.edit().m.base, null);
  W.saver.acceptRemote();                     // the student keeps this device's content
  assert.equal((await W.saver.save()).phase, "confirming");
  W.ack(); await settle();
  const e1 = W.edit();
  assert.ok(e1.m.base && e1.m.base.ref !== oldBase, "a fresh base copy");
  assert.ok(!e1.m.out || e1.m.out.ref !== oldOut, "the deleted export is not written back");
  assert.ok(e1.L.find((x) => x.id === L.id).c, "the layer was re-uploaded");
  assert.deepEqual(allRefsExist(W), [], "every manifest ref exists");
});

test("R5b fixed: a rebase in the card while the closed editor's save uploads: that save writes nothing", async () => {
  const { rebaseEdit, addTrash, gcPlan } = await import("./src-portfolio-core.mjs");
  const W = world();
  const L = W.doc.addLayer("px", { t: "clone" });
  W.paint(L.id, { x: 2, y: 2, w: 10, h: 8 });
  await W.saver.save(null, null, null, { exportFinal: true }); W.ack(); await settle();
  const L2 = W.doc.addLayer("px", { t: "clone" });
  W.paint(L2.id, { x: 20, y: 2, w: 6, h: 6 }, [0, 0, 255, 255]);
  W.store.behave = () => ({ delay: 60 });
  const p = W.saver.save();
  await tick(10);
  await W.saver.detach();                     // the editor closed (back), the save continues detached
  const rb = rebaseEdit(W.edit(), Date.now(), 111);
  W.ws = { ...W.ws, [KEYS.edit]: rb.value, [KEYS.trash]: addTrash(W.ws[KEYS.trash], rb.superseded, Math.floor(Date.now() / 1000), { x: 1 }) };
  W.ack();
  for (const r of gcPlan(W.ws, { graceMs: 1800000 })) await W.store.remove("20999", r);
  const st = await p;
  W.store.behave = null;
  await settle();
  assert.equal(st.phase, "conflict");
  const e1 = W.edit();
  assert.equal(e1.m.base, null, "the rebase stands");
  assert.deepEqual(e1.L, [], "no layer brought back");
  assert.deepEqual(allRefsExist(W), []);
  const own = W.puts().slice(-1)[0];
  assert.ok(W.trash().includes(own), "its own uploads go to the trash");
});

test("R7 fixed: a deferred effect of an earlier render never counts as a lost write; a later saved render without our save id does", async () => {
  const W = world();
  const L = W.doc.addLayer("px", { t: "clone" });
  W.paint(L.id, { x: 2, y: 2, w: 10, h: 8 });
  W.ack();
  W.store.behave = () => ({ delay: 30 });
  const p = W.saver.save();
  await tick(5);
  const wsOfRender2 = W.ws;
  await p;
  W.store.behave = null;
  const refs = refsIn(W.edit());
  W.saver.observe(wsOfRender2, true, 2);
  await settle();
  assert.equal(W.saver.state.phase, "confirming", "still waiting for the real confirmation");
  assert.deepEqual(W.removes(), []);
  assert.deepEqual(refs.filter((r) => !W.store.db.has("20999_" + r)), []);
  W.ack(); await settle();
  assert.equal(W.saver.state.phase, "saved");
  // with the card's render counter (getSeq): an effect of the render that wrote is not lost; a later saved render that lacks
  // our save id is (the updater was refused); own uploads then go to the trash, never straight to removal
  const V = world({ owner: "20998" });
  let renderN = 7;
  V.saver.getSeq = () => renderN;
  const M = V.doc.addLayer("px", { t: "clone" });
  V.paint(M.id, { x: 1, y: 1, w: 4, h: 4 });
  const old = V.ws;
  await V.saver.save();
  V.saver.observe(old, true, 7);
  assert.equal(V.saver.state.phase, "confirming");
  V.ws = old;                                   // the updater was refused: the worksheet never got our manifest
  renderN = 8;
  V.saver.observe(old, true, 8);
  await V.saver.settled();
  assert.notEqual(V.saver.state.phase, "confirming", "lost");
  assert.deepEqual(V.removes(), [], "no direct removal");
  assert.ok(V.puts().every((r) => trashRefs(V.ws[KEYS.trash]).includes(r)), "own uploads in the trash");
});

test("R8 fixed: back right after a save: the close save waiting for confirmation stops at detach; no layer loses its pixels", async () => {
  const W = world();
  const L = W.doc.addLayer("px", { t: "clone" });
  W.paint(L.id, { x: 2, y: 2, w: 10, h: 8 });
  await W.saver.save();
  const c1 = W.edit().L.find((x) => x.id === L.id).c;
  W.render();
  const p2 = W.saver.save(W.doc, W.renderer, W.session, { reason: "close" });
  await tick(0);
  assert.equal(W.saver.busy, true, "busy covers a save waiting for the previous confirmation");
  await W.saver.detach();
  W.doc.dispose();
  W.ack();
  const s2 = await p2;
  W.ack(); await settle();
  assert.notEqual(s2.phase, "error");
  const rec = W.edit().L.find((x) => x.id === L.id);
  assert.deepEqual(rec.c, c1, "the layer keeps its pixel pointer");
  assert.ok(!W.trash().includes(c1.ref));
  assert.deepEqual(W.removes(), []);
  assert.deepEqual(allRefsExist(W), []);
});

test("R8 fixed: disposing the document mid-save (waiting, encoding, uploading) never costs a layer its pixels", async () => {
  // a) disposed (without detach) while waiting for the previous confirmation: the save stops
  {
    const W = world();
    const L = W.doc.addLayer("px", { t: "clone" });
    W.paint(L.id, { x: 2, y: 2, w: 10, h: 8 });
    await W.saver.save();
    W.paint(L.id, { x: 20, y: 2, w: 4, h: 4 }, [0, 0, 255, 255]);
    const p = W.saver.save();
    await tick(0);
    W.doc.dispose();
    W.ack();
    await p; W.ack(); await settle();
    assert.ok(W.edit().L.find((x) => x.id === L.id).c, "a: pointer kept");
    assert.deepEqual(liveInTrash(W), []); assert.deepEqual(allRefsExist(W), []);
  }
  // b) disposed while encoding: the next plane read refuses, the save writes nothing
  {
    const W = world();
    const A = W.doc.addLayer("px", { t: "clone" }), B = W.doc.addLayer("px", { t: "clone" });
    W.paint(A.id, { x: 2, y: 2, w: 10, h: 8 }); W.paint(B.id, { x: 20, y: 2, w: 6, h: 6 });
    await W.saver.save(); W.ack(); await settle();
    const before = JSON.stringify(W.edit().L);
    W.paint(A.id, { x: 4, y: 4, w: 2, h: 2 }, [1, 1, 1, 255]); W.paint(B.id, { x: 22, y: 4, w: 2, h: 2 }, [2, 2, 2, 255]);
    const orig = W.doc.planeData.bind(W.doc);
    let n = 0;
    W.doc.planeData = (j) => { const r = orig(j); if (++n === 1) W.doc.dispose(); return r; };
    const st = await W.saver.save();
    await settle();
    assert.notEqual(st.phase, "confirming", "b: nothing written");
    assert.equal(JSON.stringify(W.edit().L), before, "b: the manifest is unchanged");
    assert.deepEqual(liveInTrash(W), []); assert.deepEqual(allRefsExist(W), []);
  }
  // c) disposed while uploading: the write goes through with every pointer
  {
    const W = world();
    const A = W.doc.addLayer("px", { t: "clone" }), B = W.doc.addLayer("px", { t: "clone" });
    W.paint(A.id, { x: 2, y: 2, w: 10, h: 8 });
    await W.saver.save(); W.ack(); await settle();
    W.paint(B.id, { x: 20, y: 2, w: 6, h: 6 });
    W.store.behave = () => ({ delay: 30 });
    const p = W.saver.save();
    await tick(10);
    W.doc.dispose();
    const st = await p;
    W.store.behave = null;
    W.ack(); await settle();
    assert.equal(st.phase, "confirming", "c: written");
    for (const id of [A.id, B.id]) assert.ok(W.edit().L.find((x) => x.id === id).c, "c: layer " + id + " has its pointer");
    assert.deepEqual(liveInTrash(W), []); assert.deepEqual(allRefsExist(W), []);
  }
});

test("D19 contract: saves of a detached or disposed document stop before encoding and keep the plan; detach(doc) only lets go of that doc", async () => {
  globalThis.__PHX_TEST__ = { putTimeoutMs: 40 };
  const W = world();
  const L = W.doc.addLayer("px", { t: "clone" });
  W.paint(L.id, { x: 2, y: 2, w: 10, h: 8 });
  W.store.behave = (ref) => (ref.includes(".L") ? { delay: 80 } : true);
  assert.equal((await W.saver.save()).err, "timeout", "the plan is kept");
  W.store.behave = null;
  await tick(100);
  await W.saver.detach();
  const n0 = W.puts().length;
  const st = await W.saver.save(W.doc, W.renderer, W.session);
  assert.notEqual(st.phase, "confirming");
  assert.equal(W.puts().length, n0, "nothing encoded or uploaded");
  assert.ok(W.saver._plan, "the plan is kept");
  assert.equal(W.saver.pending, false, "a plan kept for a closed editor is not pending (N2): its work is in the draft");
  assert.equal(W.saver.hasDraft, true);
  const draft = await io.drafts.get("20999", KEYS.edit);
  assert.ok(draft && draft.planes.length, "detach wrote the draft of the dirty document");
  // the same document comes back: its plan resumes with the same refs
  W.saver.attach(W.doc, W.renderer, W.session);
  assert.equal((await W.saver.save()).phase, "confirming");
  assert.equal(new Set(W.puts()).size, W.puts().length, "no ref uploaded twice");
  W.ack(); await settle();
  // detach(other) leaves the attached document alone
  const g = makeMemGfx();
  const base = g.surface(40, 30);
  const doc2 = new PhotoDoc(g, { base, w: 40, h: 30 });
  W.saver.attach(doc2, new Renderer(doc2, g, { proxyMax: 1280 }), W.session);
  await W.saver.detach(W.doc);
  assert.equal(W.saver._att && W.saver._att.doc, doc2, "detach(old) is a no-op while another document is attached");
  await W.saver.detach(doc2);
  assert.equal(W.saver._att, null);
  // a disposed document is never encoded, attached or not
  W.saver.attach(doc2, new Renderer(doc2, g, { proxyMax: 1280 }), W.session);
  const P = doc2.addLayer("px", { t: "clone" });
  const ed = doc2.beginEdit(P.id, "px"); ed.surface.write({ x: 0, y: 0, w: 2, h: 2 }, new Uint8ClampedArray(16).fill(200)); ed.commit("clone", { o: "clone", n: 1 });
  doc2.dispose();
  const n1 = W.puts().length;
  assert.notEqual((await W.saver.save()).phase, "error", "a disposed document stops quietly");
  assert.equal(W.puts().length, n1);
  delete globalThis.__PHX_TEST__;
});

test("D19 contract: busy covers running, waiting and queued saves; detach waits for an encoding save, which then writes", async () => {
  const W = world();
  const L = W.doc.addLayer("px", { t: "clone" });
  W.paint(L.id, { x: 2, y: 2, w: 10, h: 8 });
  await W.saver.save();                              // written, not confirmed
  W.paint(L.id, { x: 20, y: 2, w: 4, h: 4 }, [0, 0, 255, 255]);
  const p2 = W.saver.save();                         // waits for the confirmation
  const p3 = W.saver.save();                         // queued
  await tick(0);
  assert.equal(W.saver.busy, true);
  W.ack();
  assert.equal((await p2).phase, "confirming");
  assert.equal(W.saver.busy, true, "the queued save still counts");
  W.ack();
  await p3;
  W.ack(); await settle();
  assert.equal(W.saver.busy, false);
  assert.equal(W.saver.state.phase, "saved");
  // a save that is encoding when the editor closes: detach resolves after the encoding, the save writes afterwards
  W.paint(L.id, { x: 30, y: 10, w: 4, h: 4 }, [0, 255, 0, 255]);
  W.store.behave = () => ({ delay: 30 });
  const p = W.saver.save();
  await tick(0);
  await W.saver.detach();
  assert.equal(W.saver._encoding, null, "no payload is being encoded once detach resolved");
  W.doc.dispose();
  const st = await p;
  W.store.behave = null;
  assert.equal(st.phase, "confirming");
  W.ack(); await settle();
  assert.deepEqual(allRefsExist(W), []);
  assert.deepEqual(liveInTrash(W), []);
});

test("review r4 F3: a save while offline with nothing to save leaves no offline notice; a real offline notice ends with the upload", async () => {
  const listeners = [];
  globalThis.window = { addEventListener: (ev, fn) => { if (ev === "online") listeners.push(fn); }, removeEventListener() {} };
  try {
    const W = world({ owner: "20997" });
    const L = W.doc.addLayer("px", { t: "clone" });
    W.paint(L.id, { x: 2, y: 2, w: 10, h: 8 });
    await W.saver.save(); W.ack(); await W.saver.settled();
    assert.equal(W.saver.state.phase, "saved");
    NAV.onLine = false;
    assert.equal((await W.saver.save()).phase, "saved", "nothing to save: no offline notice");
    W.paint(L.id, { x: 20, y: 2, w: 4, h: 4 }, [0, 0, 255, 255]);
    assert.equal((await W.saver.save()).phase, "offline", "unsaved work: offline (draft kept)");
    NAV.onLine = true;
    assert.ok(listeners.length >= 1);
    listeners.forEach((f) => f());
    await W.saver.settled();
    assert.equal(W.saver.state.phase, "confirming", "the connection came back: the save goes out");
    W.ack(); await W.saver.settled();
    assert.equal(W.saver.state.phase, "saved");
    // offline phase left over with nothing pending and no draft: cleared when the connection returns
    W.saver._set({ phase: "offline" });
    listeners.forEach((f) => f());
    assert.equal(W.saver.state.phase, "idle");
  } finally { NAV.onLine = true; delete globalThis.window; }
});

/* =====================================================================================================================
   final gate (verify/final-gate.md) N1, N2, N5
   ===================================================================================================================== */
const reopen = (w = 40, h = 30) => {
  const g = makeMemGfx();
  const base = g.surface(w, h); for (let i = 0; i < base.data.length; i += 4) base.data.set([90, 90, 90, 255], i);
  const doc = new PhotoDoc(g, { base, w, h });
  return { g, base, doc, rend: new Renderer(doc, g, { proxyMax: 1280 }) };
};
const draftSum = (d) => d && { at: d.at, planes: (d.planes || []).length, layers: ((d.man && d.man.L) || []).length, planned: (d.planned || []).length };
/** session 1: a painted layer whose upload times out (plan kept), then the editor closes */
async function keptPlanClosed(W) {
  globalThis.__PHX_TEST__ = { putTimeoutMs: 50 };
  const L1 = W.doc.addLayer("px", { t: "clone" });
  W.paint(L1.id, { x: 2, y: 2, w: 10, h: 8 }, [255, 0, 0, 255]);
  W.store.behave = (ref) => (ref.includes(".L") ? { delay: 150 } : true);
  assert.equal((await W.saver.save()).err, "timeout");
  await W.saver.detach(); W.doc.dispose();
  W.store.behave = null;
  await tick(200);   // the timed-out put lands late
  delete globalThis.__PHX_TEST__;
  return L1;
}

test("N1 fixed: a clean reopened document never replaces the stored draft (loadAll's detach, clean draft writes, a save of the clean doc)", async () => {
  const W = world();
  const L1 = await keptPlanClosed(W);
  const d1 = await io.drafts.get("20999", KEYS.edit);
  assert.ok(d1 && d1.planes.length === 1 && d1.planned.length >= 1, "session 1 draft: the painted plane and the kept plan");
  const A = reopen();
  W.saver.attach(A.doc, A.rend, W.session);          // the first loadAll(): a clean doc from the manifest
  W.saver.noteChange();
  assert.equal(await W.saver.writeDraftNow("hidden"), false, "a clean doc writes nothing over the offered draft");
  await W.saver.detach(A.doc);                       // 「이어서 하기」: loadAll({ draft }) detaches first
  assert.deepEqual(draftSum(await io.drafts.get("20999", KEYS.edit)), draftSum(d1), "the stored draft is untouched");
  // the draft restores and the kept plan resumes with the same refs (no second upload of the plane)
  const R = reopen();
  const { doc: d2 } = await PhotoDoc.fromManifest(R.g, d1.man, R.base, async () => ({ img: null, missing: true }));
  await d2.applyDraft(d1, io.decodeBlob);
  const rend2 = new Renderer(d2, R.g, { proxyMax: 1280 });
  W.saver.attach(d2, rend2, W.session);
  W.saver.resumeFrom(d1);
  const planned = d1.planned.map((p) => p.ref);
  const n0 = W.puts().length;
  assert.equal((await W.saver.save(d2, rend2, W.session)).phase, "confirming");
  assert.equal(W.puts().slice(n0).filter((r) => planned.includes(r)).length, 0, "the landed plane is not uploaded again");
  W.ack(); await settle();
  assert.equal(W.edit().L.find((x) => x.id === L1.id).c.ref, planned.find((r) => r.includes(".L")), "the manifest points at the plan's ref");
  assert.equal(await io.drafts.get("20999", KEYS.edit), null, "the draft goes once its work is saved");
  assert.equal(W.saver.pending, false);
});

test("N1 fixed: confirming a save of a clean reopened document keeps an offered draft; a draft from before a rebase for another image goes", async () => {
  const W = world({ owner: "20996" });
  const L = W.doc.addLayer("px", { t: "clone" });
  W.paint(L.id, { x: 2, y: 2, w: 10, h: 8 });
  await W.saver.detach(); W.doc.dispose();          // the editor closes with unsaved work: detach writes the draft
  const d1 = await io.drafts.get("20996", KEYS.edit);
  assert.ok(d1 && d1.planes.length === 1);
  const A = reopen();
  W.saver.attach(A.doc, A.rend, W.session);
  const A2 = A.doc.addLayer("adj", { t: "bc", p: { b: 10 } });   // a change, then undone: the doc is clean again
  void A2; A.doc.undo();
  assert.equal(A.doc.dirty, false);
  await W.saver.save(A.doc, A.rend, W.session);
  W.ack(); await settle();
  assert.deepEqual(draftSum(await io.drafts.get("20996", KEYS.edit)), draftSum(d1), "the offered draft waits for the student's choice");
  // another device starts over with a new image: the old draft can never be offered; the next clean write removes it
  const { rebaseEdit } = await import("./src-portfolio-core.mjs");
  await tick(5);
  W.ws = { ...W.ws, [KEYS.edit]: rebaseEdit(W.edit(), Date.now() + 2000, 222).value };
  W.session.baseSrc = { ...W.session.baseSrc, sg: "fedcba9876543210" };
  W.session.m = { base: null, out: null, cmp: null };
  await W.saver.writeDraftNow("hidden");
  assert.equal(await io.drafts.get("20996", KEYS.edit), null);
  await W.saver.detach(); A.doc.dispose();
});

test("N2 fixed: a plan kept for a closed editor does not count as pending; declining the draft leaves nothing pending and trashes the plan's refs", async () => {
  const W = world();
  await keptPlanClosed(W);
  assert.ok(W.saver._plan, "the plan is kept for a draft restore");
  assert.equal(W.saver.pending, false, "not pending: rebase, sends and 확정 are not held by it");
  assert.equal(W.saver.state.unsaved, false);
  assert.equal(W.saver.hasDraft, true, "its work is in the draft (the card's draft checks apply)");
  const kept = [...W.saver._plan.uploaded];
  // reopen, 「저장된 내용으로 시작」, close without edits (V-F)
  const A = reopen();
  W.saver.attach(A.doc, A.rend, W.session);
  assert.equal(W.saver.pending, false, "the reopened clean doc has nothing pending");
  await io.drafts.del("20999", KEYS.edit);
  await W.saver.detach(A.doc); A.doc.dispose();
  assert.equal(W.saver.pending, false);
  assert.equal(await io.drafts.get("20999", KEYS.edit), null, "no draft comes back after the decline");
  // the refs it uploaded stay in the pending list for the card's sweep (takePending) and go to the trash at the next save
  const pend = await io.drafts.takePending("20999", { keep: [] });
  for (const r of kept) assert.ok(pend.includes(r), "pending ref " + r);
  const B = reopen();
  W.saver.attach(B.doc, B.rend, W.session);
  const L = B.doc.addLayer("px", { t: "clone" });
  const ed = B.doc.beginEdit(L.id, "px"); ed.surface.write({ x: 1, y: 1, w: 4, h: 4 }, new Uint8ClampedArray(64).fill(200)); ed.commit("clone", { o: "clone", n: 1 });
  assert.equal((await W.saver.save(B.doc, B.rend, W.session)).phase, "confirming");
  W.ack(); await settle();
  for (const r of kept) assert.ok(W.trash().includes(r), "trashed: " + r);
  assert.equal(W.saver._parked, null);
  assert.equal(W.saver.pending, false);
});

test("N2: a running detached save still counts as pending until its write is confirmed", async () => {
  const W = world();
  const L = W.doc.addLayer("px", { t: "clone" });
  W.paint(L.id, { x: 2, y: 2, w: 10, h: 8 });
  W.store.behave = () => ({ delay: 40 });
  const p = W.saver.save();
  await tick(5);
  await W.saver.detach(); W.doc.dispose();
  assert.equal(W.saver.pending, true, "uploading");
  await p;
  W.store.behave = null;
  assert.equal(W.saver.pending, true, "written, not confirmed");
  W.ack(); await settle();
  assert.equal(W.saver.pending, false);
});

test("N5: saver.holds(doc) is true while a save may still read the document's canvases", async () => {
  const W = world();
  const L = W.doc.addLayer("px", { t: "clone" });
  W.paint(L.id, { x: 2, y: 2, w: 10, h: 8 });
  assert.equal(W.saver.holds(W.doc), false);
  W.store.behave = () => ({ delay: 30 });
  const p = W.saver.save();
  assert.equal(W.saver.holds(W.doc), true, "encoding");
  await W.saver.detach();
  assert.equal(W.saver.holds(W.doc), false, "past encoding: the canvases may be freed");
  assert.equal(W.saver.busy, true, "still uploading");
  await p;
  W.store.behave = null;
  W.ack(); await settle();
  assert.equal(W.saver.holds(null), false);
});

/* =====================================================================================================================
   final gate round 2: dropDraft (D42, N7) and setHold (N8)
   ===================================================================================================================== */
test("D42 dropDraft: deletes the stored draft, cancels a pending draft write, waits for a running one, clears the flags and a set-aside plan", async () => {
  const W = world({ owner: "20995" });
  const L = W.doc.addLayer("px", { t: "clone" });
  W.paint(L.id, { x: 2, y: 2, w: 10, h: 8 });
  await W.saver.writeDraftNow("hidden");
  assert.equal(W.saver.hasDraft, true);
  let states = 0; W.saver.onState = () => { states++; };
  W.saver.noteChange();                                   // a draft write is due in 2 s
  const running = W.saver.writeDraftNow("hidden");        // and one is running
  assert.equal(await W.saver.dropDraft(), true);
  await running;
  assert.equal(await io.drafts.get("20995", KEYS.edit), null);
  assert.equal(W.saver.hasDraft, false); assert.equal(W.saver.state.draft, false); assert.equal(W.saver.state.current, false);
  assert.ok(states > 0, "the new state is reported");
  await tick(2200);
  assert.equal(await io.drafts.get("20995", KEYS.edit), null, "the cancelled timer writes nothing");
  W.saver.onState = null;
  // a plan set aside for a restore of the draft goes with it
  const V = world();
  await keptPlanClosed(V);
  const A = reopen();
  V.saver.attach(A.doc, A.rend, V.session);
  assert.ok(V.saver._parked);
  await V.saver.dropDraft();
  assert.equal(V.saver._parked, null);
  assert.equal(V.saver.pending, false);
  await V.saver.detach(A.doc);
});

test("N8 setHold: a held saver never uploads, writes the manifest or deletes; the draft is still written; the retry and back-online paths wait too", async () => {
  const listeners = [];
  globalThis.window = { addEventListener: (ev, fn) => { if (ev === "online") listeners.push(fn); }, removeEventListener() {} };
  try {
    const W = world({ owner: "20994" });
    const L = W.doc.addLayer("px", { t: "clone" });
    W.paint(L.id, { x: 2, y: 2, w: 10, h: 8 });
    NAV.onLine = false;
    assert.equal((await W.saver.save()).phase, "offline");   // failed before the bar appeared: the online handler is armed
    W.saver.setHold(true);
    assert.equal(W.saver.held, true);
    NAV.onLine = true;
    listeners.forEach((f) => f());                            // back online
    await W.saver.settled();
    assert.equal(await W.saver.save(null, null, null, { reason: "auto" }).then((s) => s.phase), "held", "what the retry timer runs");
    assert.equal(W.saver.state.phase, "held");
    assert.deepEqual(W.puts(), [], "no upload");
    assert.equal(W.calls.filter((c) => c.k === KEYS.edit).length, 0, "no manifest write");
    assert.deepEqual(await W.saver.gcRun({ force: true }), [], "no deletion");
    const d = await io.drafts.get("20994", KEYS.edit);
    assert.ok(d && d.planes.length === 1, "the edits are in this device's draft");
    assert.equal(W.saver.pending, true, "still unsaved");
    // release: the stopped save starts again
    W.saver.setHold(false);
    assert.equal(W.saver.held, false);
    await W.saver.settled();
    assert.equal(W.saver.state.phase, "confirming");
    W.ack(); await settle();
    assert.equal(W.saver.state.phase, "saved");
    assert.ok(W.edit().L.find((x) => x.id === L.id).c);
  } finally { NAV.onLine = true; delete globalThis.window; }
});

test("N8 setHold: a save already uploading stops before its next upload and its write; the release reuses its uploads", async () => {
  const W = world({ owner: "20993" });
  const A = W.doc.addLayer("px", { t: "clone" }), B = W.doc.addLayer("px", { t: "clone" });
  W.paint(A.id, { x: 2, y: 2, w: 10, h: 8 }); W.paint(B.id, { x: 20, y: 2, w: 6, h: 6 }, [0, 0, 255, 255]);
  W.store.behave = () => ({ delay: 30 });
  const p = W.saver.save();
  for (let i = 0; i < 100 && !W.puts().length; i++) await tick(2);
  assert.equal(W.puts().length, 1, "the first upload is in flight");
  W.saver.setHold(true);                                  // the conflict bar appears
  assert.equal((await p).phase, "held");
  W.store.behave = null;
  assert.equal(W.puts().length, 1, "the payload in flight finished, nothing more was sent");
  assert.equal(W.calls.filter((c) => c.k === KEYS.edit).length, 0, "no manifest write");
  assert.ok(W.saver._plan, "the plan is kept");
  W.saver.setHold(false);
  await W.saver.settled();
  assert.equal(W.saver.state.phase, "confirming");
  assert.equal(new Set(W.puts()).size, W.puts().length, "no ref uploaded twice");
  W.ack(); await settle();
  for (const id of [A.id, B.id]) assert.ok(W.edit().L.find((x) => x.id === id).c, "layer " + id);
  for (const r of refsIn(W.edit())) assert.ok(W.store.db.has("20993_" + r), "exists: " + r);
});

test("N8 setHold: acceptRemote (keepMine) lifts the hold without starting a save; {resume:false} lifts it without a save", async () => {
  const W = world({ owner: "20992" });
  const L = W.doc.addLayer("px", { t: "clone" });
  W.paint(L.id, { x: 2, y: 2, w: 10, h: 8 });
  W.saver.setHold(true);
  assert.equal((await W.saver.save()).phase, "held");
  W.saver.acceptRemote();
  assert.equal(W.saver.held, false);
  assert.equal(W.saver.state.phase, "idle");
  await W.saver.settled();
  assert.deepEqual(W.puts(), [], "acceptRemote itself saves nothing (the editor's keepMine save follows)");
  assert.equal((await W.saver.save()).phase, "confirming", "the keepMine save goes through");
  W.ack(); await settle();
  // 그 내용 불러오기: lifted without resuming the stopped save
  W.paint(L.id, { x: 20, y: 2, w: 4, h: 4 }, [0, 0, 255, 255]);
  W.saver.setHold(true);
  assert.equal((await W.saver.save()).phase, "held");
  const n = W.puts().length, w0 = W.calls.filter((c) => c.k === KEYS.edit).length;
  W.saver.setHold(false, { resume: false });
  await tick(20); await W.saver.settled();
  assert.equal(W.puts().length, n);
  assert.equal(W.calls.filter((c) => c.k === KEYS.edit).length, w0, "nothing written");
  assert.equal(W.saver.state.phase, "idle");
});
