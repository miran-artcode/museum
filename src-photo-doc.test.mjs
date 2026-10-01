// 문서 모델·작업 내역·합성기 시험 (spec §9.1 src-photo-doc.test.mjs). 담당 C. 메모리 그래픽과 가짜 캔버스(무손실 "FK" 부호화)로 돌린다.
import { test } from "node:test";
import assert from "node:assert/strict";

/* ---------- fake canvas: RGBA-backed, lossless "FK" blobs (JPEG drops alpha); FAKE.pad(type, w, h) inflates a blob ---------- */
const FAKE = { pad: null };
class FakeCtx {
  constructor(cv) { this.cv = cv; this.fillStyle = "#000"; }
  _px(src) {
    if (src instanceof FakeCanvas) return { w: src.width, h: src.height, d: src._d };
    if (src && src.data && (src.width || src.w)) return { w: src.width || src.w, h: src.height || src.h, d: src.data };
    throw new Error("fake drawImage: unknown source");
  }
  drawImage(src, dx, dy, dw, dh) {
    const s = this._px(src), W = this.cv.width, H = this.cv.height, d = this.cv._d;
    dw = dw == null ? s.w : dw; dh = dh == null ? s.h : dh;
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
      const tx = Math.floor(dx + x), ty = Math.floor(dy + y);
      if (tx < 0 || ty < 0 || tx >= W || ty >= H) continue;
      const sx = Math.min(s.w - 1, Math.floor(((x + 0.5) * s.w) / dw)), sy = Math.min(s.h - 1, Math.floor(((y + 0.5) * s.h) / dh));
      const i = (sy * s.w + sx) * 4, j = (ty * W + tx) * 4, a = s.d[i + 3] / 255, b = d[j + 3] / 255, ao = a + b * (1 - a);
      for (let c = 0; c < 3; c++) d[j + c] = ao ? Math.round((s.d[i + c] * a + d[j + c] * b * (1 - a)) / ao) : 0;
      d[j + 3] = Math.round(255 * ao);
    }
  }
  fillRect(x, y, w, h) {
    const m = /^#([0-9a-f]{6})$/i.exec(this.fillStyle), v = m ? parseInt(m[1], 16) : 0;
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.cv._d.set([v >> 16, (v >> 8) & 255, v & 255, 255], (yy * this.cv.width + xx) * 4);
  }
  getImageData(x, y, w, h) {
    const out = new Uint8ClampedArray(w * h * 4);
    for (let r = 0; r < h; r++) out.set(this.cv._d.subarray(((y + r) * this.cv.width + x) * 4, ((y + r) * this.cv.width + x + w) * 4), r * w * 4);
    return { data: out, width: w, height: h };
  }
  putImageData(img, x, y) { for (let r = 0; r < img.height; r++) this.cv._d.set(img.data.subarray(r * img.width * 4, (r + 1) * img.width * 4), ((y + r) * this.cv.width + x) * 4); }
}
class FakeCanvas {
  constructor() { this._w = 1; this._h = 1; this._d = new Uint8ClampedArray(4); this._ctx = null; }
  get width() { return this._w; } set width(v) { this._w = v | 0; this._d = new Uint8ClampedArray(this._w * this._h * 4); }
  get height() { return this._h; } set height(v) { this._h = v | 0; this._d = new Uint8ClampedArray(this._w * this._h * 4); }
  getContext() { return (this._ctx = this._ctx || new FakeCtx(this)); }
  toBlob(cb, type, q) {
    const jpeg = type === "image/jpeg", w = this._w, h = this._h, head = new Uint8Array(12);
    head[0] = 70; head[1] = 75; head[2] = jpeg ? 1 : 2; head[3] = Math.round((q || 1) * 100);
    new DataView(head.buffer).setUint32(4, w, true); new DataView(head.buffer).setUint32(8, h, true);
    const px = new Uint8Array(this._d); if (jpeg) for (let i = 3; i < px.length; i += 4) px[i] = 255;
    const pad = FAKE.pad ? FAKE.pad(type, w, h, q, this._d) : 0;
    setTimeout(() => cb(new Blob([head, px, new Uint8Array(pad)], { type })), 0);
  }
}
globalThis.document = { createElement: () => new FakeCanvas() };
globalThis.ImageData = class { constructor(d, w, h) { this.data = d; this.width = w; this.height = h; } };
globalThis.createImageBitmap = async (blob) => {
  const b = new Uint8Array(await blob.arrayBuffer());
  if (b[0] !== 70 || b[1] !== 75) throw new Error("not a fake image");
  const dv = new DataView(b.buffer), w = dv.getUint32(4, true), h = dv.getUint32(8, true);
  return { width: w, height: h, data: new Uint8ClampedArray(b.slice(12, 12 + w * h * 4)), close() {} };
};

const { makeMemGfx, PhotoDoc, History, TILE, tileRects, pixCmd, propCmd } = await import("./src-photo-doc.mjs");
const { Renderer } = await import("./src-photo-render.mjs");
const io = await import("./src-photo-io.mjs");
const { assertSafe, jsonBytes } = await import("./src-portfolio-core.mjs");
const { ZONE, KINDS, LIMITS } = await import("./src-folio-schema.mjs");

/* ---------- helpers ---------- */
const solid = (gfx, w, h, rgba) => { const s = gfx.surface(w, h); for (let i = 0; i < s.data.length; i += 4) s.data.set(rgba, i); return s; };
const newDoc = (w = 32, h = 24, rgba = [100, 110, 120, 255], o = {}) => { const g = makeMemGfx(); return { g, doc: new PhotoDoc(g, { base: solid(g, w, h, rgba), w, h, ...o }) }; };
const paint = (doc, id, r, rgba, lk = "clone", log = { o: "clone", n: 1 }) => {
  const ed = doc.beginEdit(id, "px");
  const d = new Uint8ClampedArray(r.w * r.h * 4); for (let i = 0; i < d.length; i += 4) d.set(rgba, i);
  ed.surface.write(r, d);
  ed.commit(lk, log);
};
const layerPixels = (doc, L) => { const wa = doc.wa; const out = new Uint8ClampedArray(wa.w * wa.h * 4); if (L.surf && L.bx) { const d = L.surf.read({ x: 0, y: 0, w: L.bx.w, h: L.bx.h }); for (let y = 0; y < L.bx.h; y++) for (let x = 0; x < L.bx.w; x++) { const X = L.bx.x - wa.x + x, Y = L.bx.y - wa.y + y; if (X < 0 || Y < 0 || X >= wa.w || Y >= wa.h) continue; out.set(d.subarray((y * L.bx.w + x) * 4, (y * L.bx.w + x) * 4 + 4), (Y * wa.w + X) * 4); } } return out; };
const hash = (u8) => { let h = 2166136261; for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 16777619) >>> 0; } return h; };
/** writtenTextAll's depth rule for s6f.edit: no string at depth ≤ 2 outside arrays */
function stringsAtDepth2(v) {
  const out = [];
  for (const [k, x] of Object.entries(v)) {
    if (typeof x === "string") out.push(k);
    else if (x && typeof x === "object" && !Array.isArray(x)) for (const [k2, y] of Object.entries(x)) if (typeof y === "string") out.push(k + "." + k2);
  }
  return out;
}

/* ===================================================================================================================
   layers, zones, history
   =================================================================================================================== */
test("doc: layers keep zone order, zone limits refuse with lastError, base protection, undo/redo of add/remove/move", () => {
  const { doc } = newDoc();
  const ov = doc.addLayer("ov", { t: "sb" }), px = doc.addLayer("px", { t: "spot" }), adj = doc.addLayer("adj", { t: "bc", p: { b: 10 } });
  assert.deepEqual(doc.layers.map((L) => ZONE[L.k]), [...doc.layers.map((L) => ZONE[L.k])].sort((a, b) => a - b));
  assert.ok(ov && px && adj);
  // zone limits
  doc.addLayer("px", { t: "clone" }); doc.addLayer("px", { t: "heal" });
  assert.equal(doc.addLayer("px", { t: "spot" }), null); assert.equal(doc.lastError, "limit");
  assert.ok(doc.addLayer("txt", { p: { s: "a" } })); assert.ok(doc.addLayer("txt", { p: { s: "b" } }));
  assert.equal(doc.addLayer("txt", { p: { s: "c" } }), null); assert.equal(doc.lastError, "limit");
  assert.ok(doc.addLayer("ov", { t: "gs" }));
  assert.equal(doc.addLayer("ov", { t: "tg", p: { s: "1" } }), null, "txt + ov ≤ 4");
  assert.equal(doc.addLayer("adj", { t: "lv", p: { l: [300, 100, 255, 0, 255] } }), null); assert.equal(doc.lastError, "size", "parameters checked with pOk");
  // base protection
  assert.throws(() => doc.beginEdit(0, "px"), (e) => e.code === "base");
  assert.equal(doc.lastError, "base");
  assert.throws(() => doc.beginEdit(adj.id, "px"), "an adjustment layer has no pixel plane");
  doc.setProp(px.id, "lk", 1);
  assert.throws(() => doc.beginEdit(px.id, "px"), (e) => e.code === "locked");
  // move within the zone only
  const n0 = doc.layers.map((L) => L.id).join();
  const a2 = doc.addLayer("adj", { t: "lv" });
  assert.equal(doc.move(a2.id, 1), false, "top of its zone");
  assert.equal(doc.move(a2.id, -1), true);
  assert.equal(doc.move(doc.layers.find((L) => L.k === "px").id, -1), false, "bottom of zone 2");
  // undo everything back to the start, then redo
  const ids = doc.layers.map((L) => L.id).join();
  while (doc.canUndo()) doc.undo();
  assert.equal(doc.layers.length, 0); assert.equal(doc.rev, 0);
  while (doc.canRedo()) doc.redo();
  assert.equal(doc.layers.map((L) => L.id).join(), ids);
  void n0;
  assert.ok(doc.list().every((r) => typeof r.lk === "string" && !/[가-힣]/.test(r.lk)), "history rows carry keys, never Hangul");
  assert.equal(TILE, 128);
});

test("doc: 50 random strokes then undo all is byte-identical to the start, redo all to the end", () => {
  const { doc } = newDoc(300, 200);
  const L = doc.addLayer("px", { t: "clone" }), M = doc.addLayer("adj", { t: "bc", p: { b: 5 } });
  doc.addMask(M.id, "all");
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) >>> 0; return seed % n; };
  const start = hash(layerPixels(doc, L)), mstart = hash(M.mask.m);
  for (let i = 0; i < 50; i++) {
    const r = { x: rnd(280), y: rnd(180), w: 1 + rnd(40), h: 1 + rnd(40) };
    if (i % 5 === 4) { const ed = doc.beginEdit(M.id, "mask"); ed.surface.write(r, new Uint8ClampedArray(r.w * r.h * 4).fill(rnd(255))); ed.commit("maskPaint", { o: "mask", n: 1 }); }
    else paint(doc, L.id, r, [rnd(255), rnd(255), rnd(255), 1 + rnd(254)], i % 2 ? "clone" : "spot");
    doc.history.items[doc.history.index].t -= 5000 * (i + 1);   // keep strokes apart (no 2 s merge) for this test
  }
  const end = hash(layerPixels(doc, L)), mend = hash(M.mask.m), revEnd = doc.rev;
  assert.notEqual(end, start);
  while (doc.canUndo() && doc.history.items[doc.history.index].kind !== "struct") doc.undo();
  assert.equal(hash(layerPixels(doc, L)), start); assert.equal(hash(M.mask.m), mstart);
  while (doc.canRedo()) doc.redo();
  assert.equal(hash(layerPixels(doc, L)), end); assert.equal(hash(M.mask.m), mend);
  assert.equal(doc.rev, revEnd, "revisions are restored too");
});

test("doc: same-tool strokes within 2 s merge into one row; propCmd merge by mergeKey; history budget and maxStates", () => {
  const { doc } = newDoc(64, 64);
  const L = doc.addLayer("px", { t: "clone" });
  for (let i = 0; i < 4; i++) paint(doc, L.id, { x: i * 8, y: 0, w: 4, h: 4 }, [255, 0, 0, 255]);
  const rows = doc.list();
  assert.equal(rows.length, 2);
  assert.deepEqual([rows[1].lk, rows[1].ln], ["strokes:clone", 4]);
  const d = doc.history.logDeltas().filter((x) => x.delta.o === "clone");
  assert.equal(d.length, 1); assert.equal(d[0].delta.n, 4);
  doc.undo();
  assert.equal(hash(layerPixels(doc, L)), hash(new Uint8ClampedArray(64 * 64 * 4)), "one undo removes the merged strokes");
  // slider nudges with one mergeKey become one row
  const A = doc.addLayer("adj", { t: "bc", p: { b: 0 } });
  doc.setProp(A.id, "p.b", 5, { mergeKey: "k1" }); doc.setProp(A.id, "p.b", 9, { mergeKey: "k1" }); doc.setProp(A.id, "p.b", 12, { mergeKey: "k1" });
  assert.equal(doc.list().filter((r) => r.lk.startsWith("adjEdit")).length, 1);
  doc.undo();
  assert.deepEqual(A.p, { b: 0 }, "back to the value before the first nudge");
  // budget and state limits
  const h = new History({ budget: 1000, maxStates: 3 });
  for (let i = 0; i < 5; i++) h.push(propCmd("doc", 0, "pins", [], [{ x: i }], "pin", "plan"));
  assert.equal(h.items.length, 3); assert.equal(h.index, 2); assert.ok(h.evicted > 0);
  const big = new History({ budget: 300, maxStates: 60 });
  const tiles = new Map([["0,0", { r: { x: 0, y: 0, w: 4, h: 4 }, before: new Uint8ClampedArray(200), after: new Uint8ClampedArray(200) }]]);
  big.push(pixCmd(1, "px", tiles, null, null, "clone")); big.push(pixCmd(1, "px", tiles, null, null, "spot"));
  assert.equal(big.items.length, 1, "oldest command dropped past the byte budget");
});

test("doc: selection is a view command (rev and stageChanged unchanged); setActive is not a command; RLE round trip", () => {
  const { doc } = newDoc(40, 30);
  doc.stage = "tone";
  const rev = doc.rev, n = doc.list().length;
  const m = new Uint8Array(40 * 30); for (let y = 5; y < 15; y++) for (let x = 10; x < 20; x++) m[y * 40 + x] = 255;
  doc.setSelection(m, "new", "selRect");
  assert.deepEqual(doc.sel.bbox, { x: 10, y: 5, w: 10, h: 10 });
  assert.equal(doc.rev, rev); assert.equal(doc.stageChanged("tone"), false);
  doc.setActive(0);
  assert.equal(doc.list().length, n + 1);
  doc.deselect(); assert.equal(doc.sel, null);
  doc.undo(); assert.deepEqual([...doc.sel.m], [...m], "selCmd RLE round trip");
  doc.undo(); assert.equal(doc.sel, null);
  const A = doc.addLayer("adj", { t: "bc", p: { b: 3 } });
  assert.equal(doc.stageChanged("tone"), true);
  doc.markSnap("tone");
  assert.equal(doc.stageChanged("tone"), false);
  doc.setProp(A.id, "p.b", 9);
  assert.equal(doc.stageChanged("tone"), true);
  doc.undo();
  assert.equal(doc.stageChanged("tone"), false);
  doc.undo();
  assert.equal(doc.stageChanged("tone"), true, "undoing a command older than the snapshot changes the stage again");
});

test("doc: stage marks return to the stage entry and become unavailable when evicted", () => {
  const { doc } = newDoc(16, 16, undefined, { history: { budget: 1e9, maxStates: 4 } });
  doc.addLayer("adj", { t: "bc", p: { b: 1 } });
  doc.stageMark("tone");
  doc.addLayer("adj", { t: "lv" }); doc.addLayer("flt", { t: "usm" });
  assert.equal(doc.stageMarkAvailable("tone"), true);
  assert.equal(doc.undoToStageMark("tone"), true);
  assert.equal(doc.layers.length, 1);
  for (let i = 0; i < 6; i++) doc.setPins([{ x: i, y: 0, k: 1 }]);
  assert.equal(doc.stageMarkAvailable("tone"), false);
});

/* ===================================================================================================================
   manifests
   =================================================================================================================== */
test("doc: toManifest is safe JSON with no string at depth ≤ 2; ptrs overlay without marking saved; worst ≥ real", () => {
  const { doc } = newDoc(50, 40);
  const L = doc.addLayer("px", { t: "heal" }); paint(doc, L.id, { x: 3, y: 4, w: 10, h: 8 }, [10, 20, 30, 255]);
  const A = doc.addLayer("adj", { t: "cv", p: { md: 1, l: [0, 0, 128, 150, 255, 255] } }); doc.addMask(A.id, "all");
  doc.addLayer("txt", { p: { s: "x", x: 500, y: 900 } });
  doc.setProp(L.id, "op", 0.5); doc.setProp(L.id, "nm", "abcdefghij");
  doc.setGeo({ crop: { x: 2, y: 2, w: 40, h: 30 }, r: 25, ext: { t: 0, r: 100, b: 0, l: 0 } });
  const man = doc.toManifest();
  assert.equal(assertSafe(man), "");
  assert.deepEqual(stringsAtDepth2(man), []);
  const rec = man.L.find((x) => x.id === L.id);
  assert.equal(rec.op, 50); assert.equal(rec.nm, "abcdef", "names clipped to 6 characters");
  assert.equal(rec.c, undefined, "no pointer before a save");
  assert.equal(man.doc.r, 25); assert.deepEqual(man.doc.ext, { t: 0, r: 100, b: 0, l: 0 }); assert.equal(man.doc.rot, undefined, "defaults omitted");
  const ptrs = new Map([[L.id + ":c", { bx: { x: 3, y: 4, w: 10, h: 8 }, c: { ref: "s6f.edit.L1.aaaaaaaa", f: 1 }, a: null }]]);
  const withP = doc.toManifest({ ptrs });
  assert.deepEqual(withP.L.find((x) => x.id === L.id).c, { ref: "s6f.edit.L1.aaaaaaaa", f: 1 });
  assert.equal(doc.dirtyJobs().length, 2, "still dirty: ptrs do not mark planes saved");
  assert.ok(jsonBytes(doc.toManifest({ worst: true })) >= jsonBytes(withP));
  doc.markSaved({ layerId: L.id, role: "c", rev: L.rev }, ptrs.get(L.id + ":c"));
  assert.equal(doc.dirtyJobs().length, 1);
  assert.ok(jsonBytes(doc.toManifest({ worst: true })) >= jsonBytes(doc.toManifest()));
});

test("doc: projectedBytes refuses one operation past editStruct and leaves the document unchanged", () => {
  const { doc } = newDoc(40, 30, undefined, { limits: { ...LIMITS, editStruct: 2200 } });
  assert.ok(doc.projectedBytes() < 2200);
  let refused = null;
  for (let i = 0; i < 6 && !refused; i++) {
    const before = doc.layers.length;
    const L = doc.addLayer("adj", { t: "cv", p: { md: 1, l: [0, 0, 60, 70, 128, 150, 200, 220, 255, 255] } });
    if (!L) { refused = before; assert.equal(doc.layers.length, before); assert.equal(doc.lastError, "limit"); }
  }
  assert.ok(refused != null, "the projected-size guard refused a layer");
  assert.ok(doc.projectedBytes() <= 2200);
  const T = doc.layers[0];
  doc.limits = { ...doc.limits, editStruct: doc.projectedBytes() + 10 };
  assert.equal(doc.setProp(T.id, "nm", "가나다라마바"), null);
  assert.equal(doc.lastError, "limit");
  assert.equal(T.nm, null, "a refused rename is rolled back");
});

test("doc: a maximal-size document stays under editStruct in the worst-case projection", () => {
  const { doc } = newDoc(1600, 1600, [128, 128, 128, 255]);
  doc.setGeo({ ext: { t: 150, r: 150, b: 150, l: 150 }, crop: { x: -240, y: -240, w: 2080, h: 2080 }, r: -150, rot: 270, cal: { a: 1, b: 1, c: 1600, d: 1600, cm: 5000, ob: 1 } });
  for (let i = 0; i < 2; i++) { const L = doc.importPatch({ width: 1600, height: 1600, data: new Uint8ClampedArray(1600 * 1600 * 4) }, "data:image/jpeg;base64,AAAA"); doc.setProp(L.id, "p", { dx: -999, dy: -999, sc: 1030, gn: 100, sd: 2147483647 }); doc.addMask(L.id, "all"); }
  for (const t of ["spot", "clone", "shb"]) { const L = doc.addLayer("px", { t }); doc.addMask(L.id, "all"); }
  for (const k of ["tr", "db"]) { const L = doc.addLayer(k, k === "tr" ? { p: { pr: 4 }, ce: 4 } : {}); doc.addMask(L.id, "all"); }
  for (let i = 0; i < 6; i++) { const L = doc.addLayer("adj", { t: "cv", p: { md: 1, l: [0, 255, 110, 9, 120, 9, 130, 9, 140, 9, 150, 9, 160, 9, 170, 9, 180, 9, 190, 9, 200, 9, 210, 9, 220, 9, 255, 255], r: [0, 255, 255, 255] } }); assert.ok(L, doc.lastError); doc.addMask(L.id, "all"); }
  for (let i = 0; i < 2; i++) assert.ok(doc.addLayer("txt", { p: { s: "가".repeat(60), fn: 1, sz: 120, c: [255, 255, 255], wt: 1, al: 2, x: 1000, y: 1000 } }), doc.lastError);
  for (let i = 0; i < 2; i++) assert.ok(doc.addLayer("ov", { t: "tg", p: { s: "가".repeat(20), x: 1000, y: 1000, sz: 120 } }), doc.lastError);
  doc.layers.forEach((L) => { assert.ok(doc.setProp(L.id, "nm", "가나다라마바"), "rename " + L.k + " " + doc.lastError); });
  doc.setPins(Array.from({ length: 8 }, () => ({ x: 1000, y: 1000, k: 3, it: 8, ce: 4 })));
  doc.setLines(Array.from({ length: 4 }, () => ({ a: 1000, b: 1000, c: 1000, d: 1000 })));
  assert.equal(doc.layers.length, 17);
  assert.ok(doc.projectedBytes() <= LIMITS.editStruct, "projected " + doc.projectedBytes());
});

/* ===================================================================================================================
   round trips through the encoders
   =================================================================================================================== */
const memStore = () => {
  const db = new Map();
  return {
    db,
    put: async (o, ref, d) => { db.set(o + "_" + ref, d); return true; },
    getSafe: async (o, ref) => ({ ok: true, data: db.get(o + "_" + ref) || null }),
    remove: async (o, ref) => { db.delete(o + "_" + ref); return true; },
  };
};
const loaderFrom = (store) => io.mediaLoader(store, "20999");

test("doc: tiled layer round trip: encodeJob → pointers → fromManifest restores pixels (colour and alpha)", async () => {
  const { g, doc } = newDoc(120, 90, [50, 60, 70, 255]);
  const L = doc.addLayer("px", { t: "clone" });
  // a transparent layer larger than 0.3 MP would use JPEG + alpha; force the JPEG + alpha path with a pad on PNG and whole JPEGs
  const ed = doc.beginEdit(L.id, "px");
  const r = { x: 4, y: 6, w: 100, h: 70 }, d = new Uint8ClampedArray(r.w * r.h * 4);
  for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) { const i = (y * r.w + x) * 4; d[i] = x * 2; d[i + 1] = y * 3; d[i + 2] = 200; d[i + 3] = (x + y) % 3 === 0 ? 0 : 128 + (x % 100); }
  ed.surface.write(r, d); ed.commit("clone", { o: "clone", n: 1 });
  // PNG with transparency and whole-size JPEGs are "too big"; the grey alpha PNG and the tiles fit
  FAKE.pad = (type, w, h, q, px) => { let alpha = false; for (let i = 3; i < px.length; i += 4) if (px[i] < 255) { alpha = true; break; } return (type === "image/png" && alpha) || (type === "image/jpeg" && w * h > 3000) ? 1e6 : 0; };
  const [job] = doc.dirtyJobs();
  const out = await io.encodeJob(doc, job, "abcdefgh", { tiledLeft: 2 });
  FAKE.pad = null;
  assert.ok(out.ptr.c.parts, "tiled colour plane");
  assert.equal(out.ptr.c.parts.length, 4);
  assert.ok(out.ptr.a && out.ptr.a.ref.endsWith(".a"), "alpha plane");
  assert.deepEqual(out.payloads.map((p) => p.ref.split(".").slice(3).join(".")), ["abcdefgh.t0", "abcdefgh.t1", "abcdefgh.t2", "abcdefgh.t3", "abcdefgh.a"]);
  out.payloads.forEach((p) => assert.doesNotThrow(() => io.assertMedia(p.data)));
  const store = memStore();
  for (const p of out.payloads) assert.equal(await io.putMedia(store, "20999", p.ref, p.data), "ok");
  const man = doc.toManifest({ ptrs: new Map([[L.id + ":c", out.ptr]]) });
  const { doc: d2, missing, errors } = await PhotoDoc.fromManifest(g, man, null, loaderFrom(store));
  assert.deepEqual([missing, errors], [[], []]);
  const L2 = d2.layer(L.id);
  assert.deepEqual(L2.bx, out.ptr.bx);
  const a = layerPixels(doc, L), b = layerPixels(d2, L2);
  let bad = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (Math.abs(a[i + 3] - b[i + 3]) > 4) bad++;
    else if (a[i + 3] > 0 && (Math.abs(a[i] - b[i]) > 2 || Math.abs(a[i + 1] - b[i + 1]) > 2 || Math.abs(a[i + 2] - b[i + 2]) > 2)) bad++;
  }
  assert.equal(bad, 0);
  assert.equal(d2.dirtyJobs().length, 0, "loaded planes are saved");
  assert.deepEqual(tileRects(5, 3).map((t) => [t.w, t.h]), [[2, 1], [3, 1], [2, 2], [3, 2]]);
});

test("doc: small transparent layer as one PNG; empty layer gives no payload; mask through the grey ladder; AI raw job passes src", async () => {
  const { g, doc } = newDoc(60, 40);
  const L = doc.addLayer("px", { t: "spot" });
  paint(doc, L.id, { x: 5, y: 5, w: 6, h: 6 }, [200, 10, 10, 160]);
  const [j] = doc.dirtyJobs();
  const r = await io.encodeJob(doc, j, "aaaaaaaa", {});
  assert.equal(r.ptr.c.f, 2); assert.equal(r.ptr.a, null); assert.deepEqual(r.ptr.bx, { x: 5, y: 5, w: 6, h: 6 });
  const E = doc.addLayer("px", { t: "clone" });
  const re = await io.encodeJob(doc, doc.dirtyJobs().find((x) => x.layerId === E.id), "aaaaaaaa", {});
  assert.deepEqual(re, { payloads: [], ptr: { bx: null, c: null, a: null } });
  doc.addMask(L.id, "all");
  const mj = doc.dirtyJobs().find((x) => x.role === "m");
  const rm = await io.encodeJob(doc, mj, "aaaaaaaa", {});
  assert.deepEqual([rm.ptr.mk.f, rm.ptr.mk.s, rm.payloads[0].ref], [2, 1, "s6f.edit.M" + L.id + ".aaaaaaaa"]);
  const src = await io.encodePng({ width: 60, height: 40, data: new Uint8ClampedArray(60 * 40 * 4).fill(90) });
  const img = await io.decodeImage(src);
  assert.equal(doc.importPatch({ width: 61, height: 50, data: new Uint8ClampedArray(61 * 50 * 4) }, src), null);
  assert.equal(doc.lastError, "aspect");
  const A = doc.importPatch(img, src);
  const aj = doc.dirtyJobs().find((x) => x.layerId === A.id);
  assert.equal(aj.raw, true);
  const ra = await io.encodeJob(doc, aj, "aaaaaaaa", {});
  assert.equal(ra.payloads[0].data, src, "the prepared upload is passed through, never re-encoded");
  doc.markSaved(aj, ra.ptr);
  assert.equal(A.src, null, "src released after the save");
  assert.equal(doc.dirtyJobs().some((x) => x.layerId === A.id && x.role === "c"), false);
  void g;
});

test("doc: missing media keep the record verbatim (ms:1), stay out of dirtyJobs and refuse edits; unknown kinds are carried", async () => {
  const g = makeMemGfx();
  const store = memStore();
  const ok = await io.encodePng({ width: 4, height: 4, data: new Uint8ClampedArray(64).fill(255) });
  await io.putMedia(store, "20999", "s6f.edit.L2.aaaaaaaa", ok);
  const edit = {
    v: 1, doc: { w: 20, h: 10, crop: null, fill: [255, 255, 255], out: { w: 20, h: 10 }, cal: null }, nid: 9, act: 3,
    L: [
      { id: 2, k: 1, bx: { x: 0, y: 0, w: 4, h: 4 }, c: { ref: "s6f.edit.L2.aaaaaaaa", f: 2 }, zz: 7 },
      { id: 3, k: 1, t: 1, bx: { x: 1, y: 1, w: 4, h: 4 }, c: { ref: "s6f.edit.L3.gonegone", f: 1 }, a: { ref: "s6f.edit.L3.gonegone.a", s: 1, f: 2 }, mx: 12, cov: 3 },
      { id: 4, k: 42, weird: { ref: "s6f.edit.X4.aaaaaaaa" } },
      { id: 5, k: 4, t: 1, p: { l: [10, 100, 250, 0, 255] }, mk: { ref: "s6f.edit.M5.gonegone", s: 1, f: 2 } },
    ],
  };
  const { doc, missing } = await PhotoDoc.fromManifest(g, edit, null, loaderFrom(store));
  assert.deepEqual(missing.sort(), [3, 5]);
  assert.equal(doc.layer(3).missing, true);
  assert.equal(doc.layer(2).extra.zz, 7, "unknown keys of a known record are kept");
  const man = doc.toManifest();
  assert.deepEqual(man.L.find((x) => x.id === 3), { ...edit.L[1], ms: 1 }, "verbatim with ms:1");
  assert.deepEqual(man.L.find((x) => x.id === 4), edit.L[2], "unknown kind carried verbatim");
  assert.equal(man.L.find((x) => x.id === 2).zz, 7);
  assert.equal(doc.dirtyJobs().length, 0);
  assert.equal(doc.setProp(3, "op", 0.5), null); assert.equal(doc.lastError, "missing");
  assert.throws(() => doc.beginEdit(3, "px"));
  assert.equal(doc.act, undefined); assert.equal(doc.activeId, 3);
  // a later open finds the media: the record loads normally
  await io.putMedia(store, "20999", "s6f.edit.M5.gonegone", ok);
  const again = await PhotoDoc.fromManifest(g, man, null, loaderFrom(store));
  assert.equal(again.doc.layer(5).missing, false);
  assert.equal(again.doc.toManifest().L.find((x) => x.id === 5).ms, undefined);
});

test("doc: draft round trip through the Saver: planes (incl. a never-saved layer), selection and stage come back; restored planes are dirty", async () => {
  const { g, doc } = newDoc(80, 60, [30, 30, 30, 255]);
  const L = doc.addLayer("px", { t: "clone" });
  paint(doc, L.id, { x: 10, y: 10, w: 20, h: 12 }, [250, 200, 100, 255]);
  const A = doc.addLayer("adj", { t: "bc", p: { b: 20 } });
  doc.addMask(A.id, "all");
  const ed = doc.beginEdit(A.id, "mask"); ed.surface.write({ x: 0, y: 0, w: 10, h: 10 }, new Uint8ClampedArray(400)); ed.commit("maskPaint", { o: "mask" });
  const m = new Uint8Array(80 * 60); m.fill(255, 0, 400);
  doc.setSelection(m, "new", "selRect");
  doc.stage = "tone";
  const saver = new io.Saver({ owner: "20997", setFieldRef: { current: () => true }, getWs: () => ({}) });
  saver.attach(doc, null, { sr: {}, pr: null, st: 3, log: [], m: { base: null, out: null, cmp: null } });
  assert.equal(await saver.writeDraftNow("hidden"), true);
  const draft = await io.drafts.get("20997", "s6f.edit");
  assert.ok(draft && draft.planes.length === 2);
  assert.equal(draft.man.L.find((x) => x.id === L.id).dp, 1, "a layer never saved carries dp:1 in the draft");
  const { doc: d2 } = await PhotoDoc.fromManifest(g, draft.man, null, async () => ({ img: null, missing: true }));
  const res = await d2.applyDraft(draft, io.decodeBlob);
  assert.deepEqual(res.failed, []);
  assert.equal(hash(layerPixels(d2, d2.layer(L.id))), hash(layerPixels(doc, L)));
  assert.deepEqual([...d2.layer(A.id).mask.m], [...A.mask.m]);
  assert.deepEqual([...d2.sel.m], [...m]);
  assert.equal(d2.stage, "tone");
  assert.deepEqual(d2.dirtyJobs().map((j) => j.layerId + ":" + j.role).sort(), [L.id + ":c", A.id + ":m"].sort());
  assert.deepEqual(d2.draftJobs(new Map(draft.planes.map((p) => [p.layerId + ":" + p.role, p.rev]))), [], "the restored revs match the draft");
  await io.drafts.del("20997", "s6f.edit");
});

/* ===================================================================================================================
   log deltas, geometry, compositor
   =================================================================================================================== */
test("doc: commands carry log deltas until markLogged; an undone command never reaches the log", () => {
  const { doc } = newDoc();
  doc.stage = "tone";
  const A = doc.addLayer("adj", { t: "lv", p: { l: [10, 100, 250, 0, 255] } });
  doc.setGeo({ crop: { x: 1, y: 1, w: 20, h: 10 } });
  doc.setPins([{ x: 1, y: 1, k: 1 }]);
  const ds = doc.history.logDeltas();
  assert.deepEqual(ds.map((d) => d.delta.o), ["lv", "crop", "pin"]);
  assert.deepEqual(ds.map((d) => d.delta.s), [3, 2, 0], "operations log under their own stage");
  assert.equal(ds[0].delta.y, A.id);
  doc.undo();
  assert.deepEqual(doc.history.logDeltas().map((d) => d.delta.o), ["lv", "crop"]);
  doc.history.markLogged(doc.history.logDeltas().map((d) => d.id));
  assert.deepEqual(doc.history.logDeltas(), []);
});

test("render: geometry closed form (crop, straighten, 90° rotation), ppc through the geometry, stage matrix", () => {
  const { g, doc } = newDoc(200, 100);
  const r = new Renderer(doc, g, { proxyMax: 1280 });
  doc.setGeo({ crop: { x: 20, y: 10, w: 100, h: 60 }, r: 37, rot: 90, ext: { t: 0, r: 0, b: 0, l: 100 } });
  assert.deepEqual(r.outSize(), { w: 60, h: 100 });
  for (const [x, y] of [[0, 0], [70, 40], [199, 99], [-20, 5]]) {
    const o = r.baseToOut(x, y), b = r.outToBase(o.x, o.y);
    assert.ok(Math.abs(b.x - x) < 1e-9 && Math.abs(b.y - y) < 1e-9);
  }
  const c = r.baseToOut(70, 40);
  assert.ok(Math.abs(c.x - 30) < 1e-9 && Math.abs(c.y - 50) < 1e-9, "the crop centre maps to the output centre");
  const sm = r.stageMatrix(), gm = r.geoMatrix(), wa = doc.wa;
  assert.ok(Math.abs(sm[4] - (gm[4] + gm[0] * wa.x + gm[2] * wa.y)) < 1e-9);
  assert.equal(r.ppc(), null);
  doc.setGeo({ cal: { a: 10, b: 10, c: 110, d: 10, cm: 50, ob: 0 } });
  assert.ok(Math.abs(r.ppc() - 20) < 1e-9, "100 px for 5 cm = 20 px/cm, unchanged by rotation");
});

test("render: compositor pixels: source-over with opacity, destination-in masks, multiply, adjustment with a mask, ext margins", () => {
  const { g, doc } = newDoc(10, 10, [100, 100, 100, 255]);
  const r = new Renderer(doc, g, { proxyMax: 1280 });
  const L = doc.addLayer("px", { t: "clone" });
  paint(doc, L.id, { x: 0, y: 0, w: 10, h: 10 }, [200, 0, 0, 255]);
  doc.setProp(L.id, "op", 0.5);
  const px = (x, y) => [...r.composite().read({ x: x - doc.wa.x, y: y - doc.wa.y, w: 1, h: 1 })];
  assert.deepEqual(px(5, 5), [150, 50, 50, 255]);
  // mask: left half hidden
  doc.addMask(L.id, "all");
  const ed = doc.beginEdit(L.id, "mask"); ed.surface.write({ x: 0, y: 0, w: 5, h: 10 }, new Uint8ClampedArray(5 * 10 * 4)); ed.commit("maskPaint", { o: "mask" });
  assert.deepEqual(px(2, 5), [100, 100, 100, 255]); assert.deepEqual(px(7, 5), [150, 50, 50, 255]);
  // multiply
  doc.setProp(L.id, "op", 1); doc.setProp(L.id, "bl", 2);
  assert.deepEqual(px(7, 5), [78, 0, 0, 255]);
  // brightness adjustment masked to the top half
  doc.setProp(L.id, "vis", 0);
  const A = doc.addLayer("adj", { t: "bc", p: { b: 50 } });
  const m = new Uint8Array(100); m.fill(255, 0, 50);
  doc.addMask(A.id, m);
  const top = px(5, 2), bottom = px(5, 7);
  assert.ok(top[0] > 100, "adjusted where the mask is on"); assert.deepEqual(bottom, [100, 100, 100, 255]);
  // margins: ext fills with the fill colour
  doc.setGeo({ ext: { t: 0, r: 0, b: 0, l: 100 }, fill: [0, 255, 0] });
  assert.equal(doc.wa.x, -1);
  assert.deepEqual(px(-1, 7), [0, 255, 0, 255]);
  assert.equal(A.mask.m.length, doc.wa.w * doc.wa.h, "masks follow the work area");
  doc.undo();
  assert.equal(A.mask.m.length, 100, "and come back on undo");
  // view override hides a layer only on the display
  r.setViewOverride({ hide: [A.id] });
  const fc = new FakeCanvas();
  return r.renderDisplay(fc).then(() => {
    const d = fc.getContext().getImageData(5, 2, 1, 1).data;
    assert.deepEqual([...d], [100, 100, 100, 255]);
    assert.ok(px(5, 2)[0] > 100, "the composite (export) ignores the view override");
  });
});

test("render: layerStats coverage, groups and pin overlap; coverage categories; histogram of a layer's input", () => {
  const { g, doc } = newDoc(100, 100, [128, 128, 128, 255]);
  const r = new Renderer(doc, g, { proxyMax: 1280 });
  const L = doc.addLayer("px", { t: "clone" });
  paint(doc, L.id, { x: 10, y: 10, w: 10, h: 10 }, [0, 0, 0, 255]);
  paint(doc, L.id, { x: 60, y: 60, w: 10, h: 10 }, [0, 0, 0, 255]);
  doc.setPins([{ x: 150, y: 150, k: 1 }, { x: 900, y: 900, k: 1 }, { x: 650, y: 650, k: 2 }]);
  const s = r.layerStats(L.id);
  assert.equal(s.cov, 20); assert.equal(s.g, 2); assert.equal(s.po, 1);
  const T = doc.addLayer("tr", {}); paint(doc, T.id, { x: 0, y: 0, w: 5, h: 5 }, [1, 1, 1, 255], "trace", { o: "trace" });
  const c = r.coverage();
  assert.deepEqual([c.permille.hand, c.permille.trace, c.permille.ai], [20, 3, 0]);
  const A = doc.addLayer("adj", { t: "lv", p: { l: [0, 100, 128, 0, 255] } });
  const hin = r.histogram("l", { below: doc.indexOf(A.id) }), hout = r.histogram("l");
  assert.ok(Math.abs(hin.mean - (128 * 0.977 + 0 * 0.023)) < 1.5, "the input of the levels layer");
  assert.ok(hout.mean > hin.mean, "levels brighten the output");
  const smp = r.sample(50, 50, 3);
  assert.ok(smp.r > 128);
});

test("render: export is the output size, before ignores layers, compare puts both side by side; outProxy scales", async () => {
  const { g, doc } = newDoc(40, 20, [10, 20, 30, 255]);
  const r = new Renderer(doc, g, { proxyMax: 1280 });
  const L = doc.addLayer("px", { t: "clone" }); paint(doc, L.id, { x: 0, y: 0, w: 40, h: 20 }, [200, 200, 200, 255]);
  doc.setGeo({ crop: { x: 0, y: 0, w: 30, h: 20 }, rot: 90 });
  const fin = await r.exportImage({ kind: "final" });
  assert.deepEqual([fin.w, fin.h], [20, 30]);
  assert.deepEqual([...fin.read({ x: 10, y: 10, w: 1, h: 1 })], [200, 200, 200, 255]);
  const bef = await r.exportImage({ kind: "before" });
  assert.deepEqual([...bef.read({ x: 10, y: 10, w: 1, h: 1 })], [10, 20, 30, 255]);
  const cmp = await r.exportImage({ kind: "compare" });
  assert.deepEqual([cmp.w, cmp.h], [20 + 24 + 20, 30]);
  const p = r.outProxy(10);
  assert.deepEqual([p.w, p.h], [7, 10]);
  fin.free(); bef.free(); cmp.free();
});

/* =====================================================================================================================
   review round 1 (r2-engine.md): the reviewer's repros (r2/t1, t3, t6, t12, t13), asserting the fixed behaviour
   ===================================================================================================================== */
const BRM = await import("./src-photo-brush.mjs");
const grad = (g, w, h) => {
  const s = g.surface(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) s.data.set([(x * 255 / w) | 0, (y * 255 / h) | 0, ((x + y) * 7) & 255, 255], (y * w + x) * 4);
  return s;
};
const paintRect = (doc, id, r, rgba, lk = "clone") => {
  const ed = doc.beginEdit(id, "px");
  const d = new Uint8ClampedArray(r.w * r.h * 4); for (let i = 0; i < d.length; i += 4) d.set(rgba, i);
  ed.surface.write(r, d); ed.commit(lk, { o: lk, n: 1 });
};
const shown = async (rend) => { const fc = new FakeCanvas(); await rend.renderDisplay(fc, {}); return fc; };

test("R2-01 fixed: removed layers and layers dropped with a redo branch free their canvases", () => {
  const g = makeMemGfx();
  const doc = new PhotoDoc(g, { base: grad(g, 512, 512), w: 512, h: 512 });
  const b0 = g.bytes();
  for (let i = 0; i < 5; i++) {
    const L = doc.addLayer("px", { t: "clone" });
    paintRect(doc, L.id, { x: 0, y: 0, w: 512, h: 512 }, [200, 10, 10, 255]);
    doc.remove(L.id);
  }
  for (let i = 0; i < 70; i++) doc.setPins([{ x: i, y: 1, k: 1 }]);   // evicts every command that could bring them back
  assert.ok(g.bytes() - b0 < 512 * 512 * 4, "freed: " + (g.bytes() - b0));
  const g2 = makeMemGfx();
  const d2 = new PhotoDoc(g2, { base: grad(g2, 512, 512), w: 512, h: 512 });
  const L = d2.addLayer("px", { t: "clone" });
  paintRect(d2, L.id, { x: 0, y: 0, w: 512, h: 512 }, [1, 2, 3, 255]);
  d2.undo(); d2.undo();
  d2.setPins([{ x: 1, y: 1, k: 1 }]);    // discards the redo branch: L is unreachable
  assert.equal(L.surf, null, "the unreachable layer's surface is freed");
  assert.ok(g2.bytes() <= 512 * 512 * 4 + 64, "only the base remains: " + g2.bytes());
});

test("R2-05 fixed: history eviction keeps unsaved log deltas (phone: 20 states)", () => {
  const g = makeMemGfx();
  const doc = new PhotoDoc(g, { base: grad(g, 64, 48), w: 64, h: 48, history: { budget: 24e6, maxStates: 20 } });
  for (let i = 0; i < 25; i++) doc.setGeo({ r: i + 1 });
  assert.equal(doc.history.items.length, 20, "the history is capped");
  const ds = doc.history.logDeltas();
  assert.equal(ds.length, 25, "every command's delta is still there");
  doc.history.markLogged(ds.map((d) => d.id));
  assert.equal(doc.history.logDeltas().length, 0, "and goes once a save carried it");
});

test("R2-03/R2-17 fixed: renderer.dispose() and doc.dispose() leave no canvas bytes on the shared gfx (iPad case)", async () => {
  const W = 1600, H = 1200, g = makeMemGfx();
  g.touch = true;
  const doc = new PhotoDoc(g, { base: solid(g, W, H, [128, 128, 128, 255]), w: W, h: H });
  const rend = new Renderer(doc, g, { proxyMax: 1024 });
  const br = new BRM.BrushEngine(doc, rend);
  doc.addLayer("adj", { t: "bc", p: { b: 20 } });
  const fc = new FakeCanvas();
  await rend.renderDisplay(fc, {});
  assert.ok(g.bytes() >= W * H * 4 + fc.width * fc.height * 4, "the display bitmap is counted");
  await rend.renderDisplay(fc, { interactive: true, preview: { id: doc.layers[0].id, p: { b: 40 } } });
  br.begin({ tool: "dodge", size: 300, exposure: 0.3 }, { x: 200, y: 200, p: 1 });
  const r = br.add([{ x: 1400, y: 1000, p: 1 }]);
  await rend.renderDisplay(fc, { rect: r });
  await br.end();
  await rend.renderDisplay(fc, {});
  rend.dispose();
  doc.dispose();
  assert.equal(g.bytes(), 0, "nothing left");
  const after = await rend.renderDisplay(fc, {});
  assert.ok(after.disposed, "a disposed renderer refuses to render");
  assert.throws(() => doc.planeData({ layerId: 1, role: "c" }), (e) => e.code === "disposed");
});

test("R2-02 fixed: near the canvas limit a render never starts from a cache that the memory guard just freed", async () => {
  const W = 100, H = 100, S = W * H * 4;
  const g = makeMemGfx({ limit: Infinity });
  const doc = new PhotoDoc(g, { base: solid(g, W, H, [200, 150, 100, 255]), w: W, h: H });
  const rend = new Renderer(doc, g, {});
  const L = doc.addLayer("px", { t: "clone" });
  paintRect(doc, L.id, { x: 10, y: 10, w: 20, h: 20 }, [0, 0, 255, 255]);
  doc.addLayer("adj", { t: "bc", p: { b: 30 } });
  const ref = rend.composite().read({ x: 0, y: 0, w: W, h: H }).slice();
  rend.freeCaches();
  rend.below(1);
  g.limit = g.bytes() + S - 1;
  const fc = new FakeCanvas();
  const res = await rend.renderDisplay(fc, {});
  if (!res.error) {
    const got = fc.getContext().getImageData(0, 0, W, H).data;
    let diff = 0; for (let i = 0; i < got.length; i++) diff = Math.max(diff, Math.abs(got[i] - ref[i]));
    assert.ok(diff <= 1, "display diff " + diff);
  }
  rend.freeCaches(); g.limit = Infinity;
  rend.below(1);
  g.limit = g.bytes() + S - 1;
  let s2 = null;
  try { s2 = rend.below(2).read({ x: 0, y: 0, w: W, h: H }); } catch (e) { assert.equal(e.code, "memory", "refused, never wrong"); }
  if (s2) { let d2 = 0; for (let i = 0; i < s2.length; i++) d2 = Math.max(d2, Math.abs(s2[i] - ref[i])); assert.ok(d2 <= 1, "below() diff " + d2); }
});

test("R2-06/R2-07 fixed: the AI layer follows the previewed move and grain, and the preview equals the committed result", async () => {
  const W = 80, H = 60, g = makeMemGfx();
  const doc = new PhotoDoc(g, { base: solid(g, W, H, [255, 255, 255, 255]), w: W, h: H });
  const img = { width: W, height: H, data: new Uint8ClampedArray(W * H * 4) };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) img.data.set(y >= 20 && y < 40 && x >= 30 && x < 50 ? [255, 0, 0, 255] : [200, 200, 200, 255], (y * W + x) * 4);
  const A = doc.importPatch(img, "data:image/png;base64,AAAA");
  const rend = new Renderer(doc, g, {});
  const c0 = await shown(rend);
  const pv = new FakeCanvas();
  await rend.renderDisplay(pv, { preview: { id: A.id, p: { dx: 20, dy: 0 } } });
  doc.setProp(A.id, "p", { dx: 20 });
  const c1 = await shown(rend);
  assert.notEqual(hash(pv._d), hash(c0._d), "the preview moves");
  assert.equal(hash(pv._d), hash(c1._d), "preview == commit");
  // 결 맞추기 (grain): seeded, so the preview and the committed layer agree pixel for pixel
  const pg = new FakeCanvas();
  await rend.renderDisplay(pg, { preview: { id: A.id, p: { dx: 20, gn: 60, sd: 7 } } });
  assert.notEqual(hash(pg._d), hash(c1._d), "the grain shows in the preview");
  doc.setProp(A.id, "p", { dx: 20, gn: 60, sd: 7 });
  const c2 = await shown(rend);
  assert.equal(hash(pg._d), hash(c2._d), "grain preview == commit");
  const exp = rend.composite().read({ x: 0, y: 0, w: W, h: H });
  assert.equal(hash(exp), hash(c2.getContext().getImageData(0, 0, W, H).data), "export == display");
});

test("R2-10 fixed: mask strokes on a feathered mask show while painting", async () => {
  const W = 96, H = 72, g = makeMemGfx();
  const doc = new PhotoDoc(g, { base: solid(g, W, H, [255, 255, 255, 255]), w: W, h: H });
  const rend = new Renderer(doc, g, {}), br = new BRM.BrushEngine(doc, rend);
  const L = doc.addLayer("px", { t: "clone" });
  paintRect(doc, L.id, { x: 0, y: 0, w: W, h: H }, [0, 0, 200, 255]);
  doc.addMask(L.id, "all");
  doc.setProp(L.id, "mk.fe", 4);
  doc.setActive(L.id);
  const fc = new FakeCanvas(); await rend.renderDisplay(fc, {});
  const px = (x, y) => Array.from(fc.getContext().getImageData(x, y, 1, 1).data.slice(0, 3));
  const before = px(48, 36);
  br.begin({ tool: "mask", size: 30, hard: 1, op: 1, flow: 1, maskMode: "erase" }, { x: 40, y: 36, p: 1 });
  const r = br.add([{ x: 56, y: 36, p: 1 }]);
  await rend.renderDisplay(fc, { rect: r });
  const during = px(48, 36);
  await br.end(); await rend.renderDisplay(fc, {});
  const after = px(48, 36);
  assert.notDeepEqual(during, before, "visible while painting");
  assert.notDeepEqual(after, before);
});

test("R2-14 fixed: a cancelled stroke is not shown after the cancel (full render mid-stroke, hover sample after eviction)", async () => {
  for (const variant of ["new", "existing"]) {
    const g = makeMemGfx();
    const doc = new PhotoDoc(g, { base: grad(g, 96, 72), w: 96, h: 72 });
    const rend = new Renderer(doc, g, {}), br = new BRM.BrushEngine(doc, rend);
    if (variant === "existing") { const L = doc.addLayer("px", { t: "clone" }); paintRect(doc, L.id, { x: 0, y: 0, w: 4, h: 4 }, [0, 0, 0, 255]); }
    await shown(rend);
    br.setSource(10, 10);
    br.begin({ tool: "clone", size: 20, hard: 1, op: 1, flow: 1 }, { x: 60, y: 40, p: 1 });
    br.add([{ x: 70, y: 45, p: 1 }]);
    if (variant === "new") await shown(rend);
    else { rend.freeCaches(); rend.sample(5, 5, 5); }
    br.cancel();
    const after = await shown(rend);
    const truth = await shown(new Renderer(doc, g, {}));
    assert.equal(hash(after._d), hash(truth._d), variant + ": display == truth after the cancel");
  }
});

test("R2-15 fixed (REQ-D3): a stroke never merges across a stage switch or into a stage mark", async () => {
  const g = makeMemGfx();
  const doc = new PhotoDoc(g, { base: grad(g, 96, 72), w: 96, h: 72 });
  const rend = new Renderer(doc, g, {}), br = new BRM.BrushEngine(doc, rend);
  doc.stage = "fix"; doc.stageMark("fix");
  br.begin({ tool: "dodge", size: 10, exposure: 0.5 }, { x: 10, y: 10, p: 1 }); br.add([{ x: 30, y: 10, p: 1 }]); await br.end();
  doc.stage = "tone"; doc.stageMark("tone");
  const L = doc.layers.find((x) => x.k === "db");
  const h0 = hash(L.surf.read({ x: 0, y: 0, w: L.bx.w, h: L.bx.h }));
  const n1 = doc.list().length;
  br.begin({ tool: "dodge", size: 10, exposure: 0.5 }, { x: 10, y: 50, p: 1 }); br.add([{ x: 30, y: 50, p: 1 }]); await br.end();
  assert.equal(doc.list().length, n1 + 1, "the stroke of the new stage is its own row");
  assert.equal(doc.stageChanged("tone"), true);
  doc.undoToStageMark("tone");
  const L2 = doc.layers.find((x) => x.k === "db");
  assert.equal(hash(L2.surf.read({ x: 0, y: 0, w: L2.bx.w, h: L2.bx.h })), h0, "back to the stage entry");
  // History level: same stage merges, another stage or a marked top does not
  const H = new History({ budget: 1e9, maxStates: 50 });
  const mk = (id, stage) => ({ id, stage, bytes: 0, merge: () => true, undo() {}, redo() {} });
  H.push(mk(1, "fix"));
  assert.equal(H.push(mk(2, "fix")).id, 1, "same stage merges");
  assert.equal(H.push(mk(3, "tone")).id, 3, "a stage switch never merges");
  H.barrier = 3;
  assert.equal(H.push(mk(4, "tone")).id, 4, "nothing merges into the stage mark");
});

test("R2-16: extending the margins emits \"wa\" with the shift that keeps a wa-local point on the same base pixel", () => {
  const g = makeMemGfx();
  const doc = new PhotoDoc(g, { base: grad(g, 100, 80), w: 100, h: 80 });
  const evs = [];
  doc.on("wa", (e) => evs.push(e));
  const p = { x: 30, y: 30 }, baseX = p.x + doc.wa.x;
  doc.setGeo({ ext: { t: 0, r: 0, b: 0, l: 100 } });
  assert.equal(evs.length, 1);
  assert.ok(doc.wa.x < 0);
  assert.equal(p.x + evs[0].dx + doc.wa.x, baseX, "the same base pixel");
  doc.undo();
  assert.equal(evs.length, 2, "undo shifts back");
  assert.equal(evs[1].dx, -evs[0].dx);
});

test("doc: ed.commit(lk, log, {props}) carries layer property changes in the pixel command (undo, redo, merge)", () => {
  const g = makeMemGfx();
  const doc = new PhotoDoc(g, { base: grad(g, 96, 72), w: 96, h: 72 });
  const L = doc.addLayer("tr", { t: "trace" });
  const stroke = (r, pr, ce) => {
    const ed = doc.beginEdit(L.id, "px");
    const d = new Uint8ClampedArray(r.w * r.h * 4).fill(200);
    ed.surface.write(r, d);
    ed.commit("trace", { o: "trace", n: 1 }, { props: [["p.pr", L.p ? L.p.pr : null, pr], ["ce", L.ce || 0, ce]] });
  };
  const rows0 = doc.list().length;
  stroke({ x: 2, y: 2, w: 8, h: 8 }, 1, 0);
  assert.equal(L.p.pr, 1);
  stroke({ x: 20, y: 2, w: 8, h: 8 }, 3, 2);           // within 2 s: merges into one row
  assert.equal(doc.list().length, rows0 + 1, "one row");
  assert.equal(L.p.pr, 3); assert.equal(L.ce, 2);
  doc.undo();
  assert.ok(!L.p || L.p.pr == null, "undo restores the preset of before the first stroke");
  assert.equal(L.ce, 0);
  doc.redo();
  assert.equal(L.p.pr, 3); assert.equal(L.ce, 2);
  assert.equal(doc.toManifest().L.find((r) => r.id === L.id).ce, 2, "the manifest follows");
  // an invalid property is dropped, the pixels still commit
  const ed = doc.beginEdit(L.id, "px");
  ed.surface.write({ x: 40, y: 40, w: 4, h: 4 }, new Uint8ClampedArray(64).fill(9));
  ed.commit("trace", { o: "trace", n: 1 }, { props: [["zz", 0, 1]] });
  assert.equal(doc.lastError, "size");
  assert.equal(L.zz, undefined);
});

test("doc perf: a long stroke resizes the layer a few times (touch) or once (desktop); whole tiles read before a write are not read again", () => {
  for (const touch of [true, false]) {
    const g = makeMemGfx();
    g.touch = touch;
    const doc = new PhotoDoc(g, { base: solid(g, 2000, 1500, [128, 128, 128, 255]), w: 2000, h: 1500 });
    const L = doc.addLayer("px", { t: "clone" });
    const ed = doc.beginEdit(L.id, "px");
    const dab = new Uint8ClampedArray(20 * 20 * 4).fill(255);
    const seen = new Set();
    for (let i = 0; i <= 100; i++) {
      ed.surface.write({ x: 1000 + Math.round((i - 50) * 19), y: 750 + Math.round((i - 50) * 14), w: 20, h: 20 }, dab);
      seen.add(JSON.stringify(L.bx));
    }
    ed.commit("clone", { o: "clone", n: 1 });
    if (touch) assert.ok(seen.size <= 7, "touch: " + seen.size + " allocations (the 256 px grid gave 13 for this stroke)");
    else assert.equal(seen.size, 1, "desktop: the whole work area at once");
  }
  const g = makeMemGfx();
  const doc = new PhotoDoc(g, { base: grad(g, 512, 512), w: 512, h: 512 });
  const L = doc.addLayer("px", { t: "clone" });
  const ed = doc.beginEdit(L.id, "px");
  ed.surface.write({ x: 0, y: 0, w: 2, h: 2 }, new Uint8ClampedArray(16).fill(50));
  let reads = 0;
  const rd = L.surf.read.bind(L.surf);
  L.surf.read = (r) => { reads++; return rd(r); };
  const start = ed.surface.read({ x: 128, y: 128, w: 256, h: 128 });   // the brush reads two whole tiles first
  assert.equal(reads, 1);
  start.fill(77);
  ed.surface.write({ x: 128, y: 128, w: 256, h: 128 }, start);
  assert.equal(reads, 1, "touch() reused the tiles the tool read");
  ed.commit("clone", { o: "clone", n: 1 });
  L.surf.read = rd;
  doc.undo();
  const back = L.surf.read({ x: 128 - L.bx.x, y: 128 - L.bx.y, w: 4, h: 4 });
  assert.deepEqual([...back.slice(0, 4)], [0, 0, 0, 0], "undo restores what was there before");
  doc.redo();
  assert.deepEqual([...L.surf.read({ x: 128 - L.bx.x, y: 128 - L.bx.y, w: 1, h: 1 })], [77, 77, 77, 77]);
});

test("render: a paint (rect) render keeps the layers below the active one and equals the full render", async () => {
  const W = 96, H = 72, g = makeMemGfx();
  const doc = new PhotoDoc(g, { base: grad(g, W, H), w: W, h: H });
  const rend = new Renderer(doc, g, {});
  const A = doc.addLayer("px", { t: "clone" });
  paintRect(doc, A.id, { x: 10, y: 10, w: 60, h: 40 }, [0, 0, 255, 255]);
  doc.addLayer("adj", { t: "bc", p: { b: 30 } });
  const B = doc.addLayer("px", { t: "clone" });
  doc.setActive(B.id);
  const fc = new FakeCanvas();
  await rend.renderDisplay(fc, {});
  const ed = doc.beginEdit(B.id, "px");
  ed.surface.write({ x: 20, y: 20, w: 10, h: 10 }, new Uint8ClampedArray(400).fill(255));
  await rend.renderDisplay(fc, { rect: { x: 15, y: 15, w: 30, h: 30 } });
  const part = fc.getContext().getImageData(0, 0, W, H).data;
  ed.commit("clone", { o: "clone", n: 1 });
  const full = await shown(new Renderer(doc, g, {}));
  assert.equal(hash(part), hash(full.getContext().getImageData(0, 0, W, H).data), "rect render == full render");
});

test("R2-02: under memory pressure a full render composes into its cached start in place instead of failing", async () => {
  const W = 100, H = 100, S = W * H * 4;
  const g = makeMemGfx({ limit: Infinity });
  const doc = new PhotoDoc(g, { base: solid(g, W, H, [200, 150, 100, 255]), w: W, h: H });
  const rend = new Renderer(doc, g, {});
  const L = doc.addLayer("px", { t: "clone" });
  paintRect(doc, L.id, { x: 10, y: 10, w: 20, h: 20 }, [0, 0, 255, 255]);
  doc.addLayer("adj", { t: "bc", p: { b: 30 } });
  const ref = rend.composite().read({ x: 0, y: 0, w: W, h: H }).slice();
  const fc = new FakeCanvas(); await rend.renderDisplay(fc, {});
  rend.freeCaches();
  rend.below(1);
  g.limit = g.bytes() + S - 1;
  const res = await rend.renderDisplay(fc, {});
  assert.ok(!res.error, "rendered");
  assert.equal(hash(fc.getContext().getImageData(0, 0, W, H).data), hash(ref));
});

test("N4 (t9): doc.trimHistory frees deleted layers that undo kept alive; need stops early; log deltas and stage changes survive", () => {
  const W = 400, H = 300, S = W * H * 4;
  const g = makeMemGfx({ limit: Infinity });
  const doc = new PhotoDoc(g, { base: solid(g, W, H, [128, 128, 128, 255]), w: W, h: H });
  doc.stage = "fix"; doc.stageMark("fix");
  const ids = [];
  for (const t of ["clone", "heal", "spot"]) { const L = doc.addLayer("px", { t }); paintRect(doc, L.id, { x: 0, y: 0, w: W, h: H }, [200, 0, 0, 255]); ids.push(L.id); }
  g.limit = g.bytes() + S / 2;                 // the next full-size layer does not fit
  const L4 = doc.addLayer("tr", {});
  const e1 = doc.beginEdit(L4.id, "px"); assert.equal(e1.touch({ x: 0, y: 0, w: W, h: H }), false); e1.cancel();
  doc.remove(ids[0]); doc.remove(ids[1]);       // what the memory message asks for
  const e2 = doc.beginEdit(L4.id, "px"); assert.equal(e2.touch({ x: 0, y: 0, w: W, h: H }), false, "undo still keeps them"); e2.cancel();
  const logs0 = doc.history.logDeltas().length, rows0 = doc.list().length;
  let hist = 0; doc.on("history", () => hist++);
  const r = doc.trimHistory({ need: S });
  assert.ok(r.dropped > 0 && r.dropped < rows0, "only as many steps as needed: " + r.dropped + " of " + rows0);
  assert.ok(r.freed >= S, "freed " + r.freed);
  assert.equal(hist, 1);
  assert.equal(doc.trimHistory({ need: S }).dropped, 0, "nothing more when it already fits");
  const e3 = doc.beginEdit(L4.id, "px"); assert.equal(e3.touch({ x: 0, y: 0, w: W, h: H }), true, "the layer fits now"); e3.cancel();
  assert.equal(doc.history.logDeltas().length, logs0, "every unsaved log delta stays");
  assert.equal(doc.stageChanged("fix"), true, "the stage still counts as changed");
  assert.deepEqual(doc.layers.map((L) => L.id), [ids[2], L4.id]);
  // keep: the newest steps stay undoable
  doc.setProp(ids[2], "op", 0.5); doc.setProp(ids[2], "op", 0.4, { mergeKey: "x" });
  doc.setPins([{ x: 1, y: 1, k: 1 }]);
  doc.undo();                                   // a redo branch goes first
  const r2 = doc.trimHistory({ keep: 1 });
  assert.ok(r2.dropped >= 2);
  assert.equal(doc.list().length, 1);
  assert.equal(doc.canRedo(), false);
  assert.ok(doc.canUndo());
  doc.undo();
  assert.equal(doc.canUndo(), false);
});
