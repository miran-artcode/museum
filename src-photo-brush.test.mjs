// 브러시·표식 시험 (spec §9.1 src-photo-brush.test.mjs). 담당 B. 메모리 그래픽(makeMemGfx)으로 만든 PhotoDoc과 ctx 기록기로 돌린다.
// 견본은 시험용 합성기(아래 레이어를 source-over로 겹친 결과)에서 읽는다. 실제 Renderer와 같은 계약: below(i) = 원본 + layers[0, i).
import { test } from "node:test";
import assert from "node:assert/strict";
import { BrushEngine, TOOL_TARGET } from "./src-photo-brush.mjs";
import { makeMemGfx, PhotoDoc } from "./src-photo-doc.mjs";
import { GREY20, CHART24, SEG_CM, textLines, scaleBarSpec, suggestBarCm, markBox, autoPlace, drawMark, drawText, hitMarks, ensureFont, FONT } from "./src-photo-marks.mjs";
import { dodgeBurnLut, traceFn, mulberry32 } from "./src-photo-px.mjs";
import { Renderer } from "./src-photo-render.mjs";

/* ---------- fixtures ---------- */
const rgbaOf = (w, h, f) => { const d = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = f(x, y), i = (y * w + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; } return d; };
function mkDoc(w, h, f) {
  const gfx = makeMemGfx(), base = gfx.surface(w, h, "base");
  base.write({ x: 0, y: 0, w, h }, rgbaOf(w, h, f));
  return { gfx, doc: new PhotoDoc(gfx, { base, w, h }) };
}
/** straight-alpha source-over of the visible pixel layers below index i over the base (wa = base here) */
function compose(doc, upto) {
  const w = doc.w, h = doc.h, out = doc.base.read({ x: 0, y: 0, w, h });
  for (let k = 0; k < upto && k < doc.layers.length; k++) {
    const L = doc.layers[k];
    if (!L.surf || !L.bx || L.vis === 0 || !["px", "tr", "db"].includes(L.k)) continue;
    const d = L.surf.read({ x: 0, y: 0, w: L.bx.w, h: L.bx.h });
    for (let y = 0; y < L.bx.h; y++) for (let x = 0; x < L.bx.w; x++) {
      const X = x + L.bx.x, Y = y + L.bx.y;
      if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
      const i = (y * L.bx.w + x) * 4, j = (Y * w + X) * 4, a = (d[i + 3] / 255) * (L.op == null ? 1 : L.op);
      if (!a) continue;
      for (let c = 0; c < 3; c++) out[j + c] = out[j + c] * (1 - a) + d[i + c] * a;
    }
  }
  return out;
}
function testRenderer(doc) {
  const surf = (upto) => {
    const d = compose(doc, upto);
    return { w: doc.w, h: doc.h, read: (r) => {
      const o = new Uint8ClampedArray(r.w * r.h * 4), x0 = Math.max(0, r.x), x1 = Math.min(doc.w, r.x + r.w);
      if (x1 > x0) for (let y = 0; y < r.h; y++) { const Y = r.y + y; if (Y < 0 || Y >= doc.h) continue; o.set(d.subarray((Y * doc.w + x0) * 4, (Y * doc.w + x1) * 4), (y * r.w + x0 - r.x) * 4); }
      return o;
    } };
  };
  return { calls: 0, below(i) { this.calls++; return surf(i); }, composite() { return surf(doc.layers.length); }, invalidate() {} };
}
const P = (x, y, p = 1) => ({ x, y, p, t: 0 });
async function stroke(br, o, pts) { assert.equal(br.begin(o, pts[0]), true, "begin " + o.tool); if (pts.length > 1) br.add(pts.slice(1)); return br.end(); }
const px = (d, w, x, y) => [...d.subarray((y * w + x) * 4, (y * w + x) * 4 + 4)];
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || "") + " " + a + " vs " + b + " (±" + tol + ")");
const noHangul = (o) => assert.ok(!/[ㄱ-ㆎ가-힣]/.test(JSON.stringify(o)), "no Hangul in " + JSON.stringify(o));

/* ---------- brush ---------- */
test("brush: a stroke on a mem-gfx doc commits one command; lk keys only; TOOL_TARGET", async () => {
  const { doc } = mkDoc(64, 48, () => [120, 120, 120]);
  const br = new BrushEngine(doc, testRenderer(doc));
  br.setSource(40, 30);
  assert.equal(br.begin({ tool: "clone", size: 6 }, P(10, 10, 0.5)), true);
  assert.equal(br.active, true);
  br.add([P(20, 12, 0.5)]);
  const r = await br.end();
  assert.equal(r.lk, "clone"); assert.equal(r.op, "clone");
  assert.ok(r.rect && r.rect.w > 0);
  noHangul(r);
  assert.equal(doc.canUndo(), true);
  assert.equal(br.active, false);
  assert.deepEqual(Object.keys(TOOL_TARGET).sort(), ["bsb", "burn", "clone", "dodge", "erase", "heal", "mask", "shb", "sponge", "spot", "trace"]);
});
test("clone stroke copies from the offset source; aligned keeps the offset, non-aligned restarts at the source", async () => {
  const w = 120, h = 80, { doc } = mkDoc(w, h, (x, y) => (x >= 80 ? [200 + (y % 5), 30, 30] : [40, 90 + (x % 7), 140]));
  const ren = testRenderer(doc), br = new BrushEngine(doc, ren);
  br.setSource(95, 40);   // inside the red block
  const r1 = await stroke(br, { tool: "clone", size: 10, hard: 1 }, [P(20, 40), P(30, 40)]);
  const comp = compose(doc, doc.layers.length);
  for (const x of [20, 25, 30]) assert.deepEqual(px(comp, w, x, 40).slice(0, 3), px(comp, w, x + 75, 40).slice(0, 3), "copied from +75");
  assert.ok(r1.n >= 2);
  // aligned (default): the next stroke keeps off = (75, 0)
  await stroke(br, { tool: "clone", size: 10, hard: 1 }, [P(20, 60)]);
  let c2 = compose(doc, doc.layers.length);
  assert.deepEqual(px(c2, w, 20, 60).slice(0, 3), px(c2, w, 95, 60).slice(0, 3));
  // non-aligned: each stroke restarts at the source point
  await stroke(br, { tool: "clone", size: 10, hard: 1, aligned: false }, [P(10, 20)]);
  c2 = compose(doc, doc.layers.length);
  assert.deepEqual(px(c2, w, 10, 20).slice(0, 3), px(c2, w, 95, 40).slice(0, 3));
  // no source → refused with an engine reason, no doc error, no command
  const b2 = new BrushEngine(doc, ren), n0 = doc.list().length;
  assert.equal(b2.begin({ tool: "heal", size: 8 }, P(5, 5)), false); assert.equal(b2.lastError, "source");
  assert.equal(doc.list().length, n0);
});
test("one stroke never compounds: passing twice over the same place in one stroke equals passing once", async () => {
  const w = 60, h = 40;
  const run = async (pts) => {
    const { doc } = mkDoc(w, h, (x, y) => [100 + x, 80 + y, 60]);
    const br = new BrushEngine(doc, testRenderer(doc));
    await stroke(br, { tool: "dodge", size: 16, hard: 0.5, flow: 0.5, exposure: 0.4, range: 1 }, pts);
    return compose(doc, doc.layers.length);
  };
  const once = await run([P(20, 20), P(40, 20)]), twice = await run([P(20, 20), P(40, 20), P(20, 20), P(40, 20)]);
  assert.deepEqual(twice, once);
  const { doc } = mkDoc(w, h, () => [100, 100, 100]);
  const br = new BrushEngine(doc, testRenderer(doc));
  await stroke(br, { tool: "dodge", size: 16, hard: 1, flow: 0.5, exposure: 0.4, range: 1 }, [P(30, 20)]);
  const a1 = compose(doc, doc.layers.length)[(20 * w + 30) * 4];
  await stroke(br, { tool: "dodge", size: 16, hard: 1, flow: 0.5, exposure: 0.4, range: 1 }, [P(30, 20)]);
  const a2 = compose(doc, doc.layers.length)[(20 * w + 30) * 4];
  assert.ok(a2 > a1, "strokes build on each other as in Photoshop: " + a1 + " → " + a2);
});
test("filter mode on an empty layer: layer = F with alpha = coverage, so the visible result is lerp(below, F(sample), cov)", async () => {
  const w = 50, h = 40, { doc } = mkDoc(w, h, (x) => [60 + x * 2, 90, 150]);
  const br = new BrushEngine(doc, testRenderer(doc)), lut = dodgeBurnLut(1, 0.3);
  const res = await stroke(br, { tool: "burn", size: 11, hard: 1, flow: 0.6, exposure: 0.3, range: 1, protect: false }, [P(25, 20)]);
  assert.equal(res.op, "dodge"); assert.equal(res.lk, "burn");
  const L = doc.layers.find((x) => x.k === "db"), lay = L.surf.read({ x: 25 - L.bx.x, y: 20 - L.bx.y, w: 1, h: 1 });
  const burn = dodgeBurnLut(1, -0.3), below = px(doc.base.read({ x: 0, y: 0, w, h }), w, 25, 20);
  near(lay[3], 0.6 * 255, 1, "alpha = cov");
  for (let c = 0; c < 3; c++) near(lay[c], burn[below[c]], 1, "colour = F(sample)");
  const vis = compose(doc, doc.layers.length);
  for (let c = 0; c < 3; c++) near(vis[(20 * w + 25) * 4 + c], below[c] * 0.4 + burn[below[c]] * 0.6, 1.5, "lerp");
  void lut;
  assert.deepEqual(px(vis, w, 2, 2), px(doc.base.read({ x: 0, y: 0, w, h }), w, 2, 2), "outside the tip unchanged");
});
test("selection clip: tip × sel/255", async () => {
  const w = 60, h = 30, { doc } = mkDoc(w, h, () => [100, 100, 100]);
  const m = new Uint8Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < 30; x++) m[y * w + x] = 255;
  doc.setSelection(m, "new", "selRect");
  const br = new BrushEngine(doc, testRenderer(doc));
  await stroke(br, { tool: "dodge", size: 20, hard: 1, flow: 1, exposure: 0.5, range: 1 }, [P(10, 15), P(50, 15)]);
  const vis = compose(doc, doc.layers.length);
  assert.ok(vis[(15 * w + 15) * 4] > 100, "inside the selection");
  for (let x = 30; x < w; x++) assert.equal(vis[(15 * w + x) * 4], 100, "outside the selection at " + x);
});
test("pressure drives size (0.25 + 0.75·p^0.75) and mx; spacing places a dab every 25 % of the diameter along a 100 px line", async () => {
  const w = 160, h = 120, { doc } = mkDoc(w, h, () => [128, 128, 128]);
  const br = new BrushEngine(doc, testRenderer(doc));
  const full = await stroke(br, { tool: "dodge", size: 40, press: "size" }, [P(30, 30, 1)]);
  const light = await stroke(br, { tool: "dodge", size: 40, press: "size" }, [P(90, 30, 0.25)]);
  const D = Math.round(40 * (0.25 + 0.75 * Math.pow(0.25, 0.75)));
  assert.equal(full.mx, Math.ceil((20 * 1000) / 120)); assert.equal(light.mx, Math.ceil(((D / 2) * 1000) / 120));
  assert.equal(light.rect.w, D, "dab diameter " + D);
  const off = await stroke(br, { tool: "dodge", size: 40, press: "off" }, [P(30, 90, 0.1)]);
  assert.equal(off.mx, full.mx, "pressure off");
  const line = await stroke(br, { tool: "dodge", size: 20, spacing: 0.25 }, [P(20, 60), P(70, 60), P(120, 60)]);
  assert.equal(line.n, 1 + 100 / 5, "21 dabs at 5 px steps");
  const pct = await stroke(br, { tool: "dodge", size: 20, spacing: 50 }, [P(20, 100), P(120, 100)]);
  assert.equal(pct.n, 1 + 100 / 10, "spacing given as percent");
});
test("StrokeResult.mx and the layer's mx after strokes of 12 px and 30 px (largest kept, undo restores it)", async () => {
  const { doc } = mkDoc(200, 120, () => [90, 90, 90]);
  const br = new BrushEngine(doc, testRenderer(doc));
  br.setSource(150, 60);
  const a = await stroke(br, { tool: "clone", size: 12 }, [P(30, 30)]);
  const L = doc.layers.find((x) => x.k === "px" && x.t === "clone");
  assert.equal(a.mx, 50); assert.equal(L.mx, 50);
  const b = await stroke(br, { tool: "clone", size: 30 }, [P(40, 80)]);
  assert.equal(b.mx, 125); assert.equal(L.mx, 125);
  await stroke(br, { tool: "clone", size: 12 }, [P(80, 40)]);
  assert.equal(L.mx, 125, "never lowered by a smaller stroke");
  const rows = doc.list().filter((r) => /clone/.test(r.lk));
  assert.equal(rows.length, 1, "same-tool strokes within 2 s merge into one row (doc rule)");
  doc.undo();
  assert.equal(L.mx, 0, "undoing the row restores the mx from before it");
  doc.redo();
  assert.equal(L.mx, 125);
});
test("trace: preset and ce recorded on the single tr layer; scratch preset uses a hard small tip; log delta", async () => {
  const w = 80, h = 60, { doc } = mkDoc(w, h, (x, y) => [70 + (x % 9), 60 + (y % 7), 50]);
  const br = new BrushEngine(doc, testRenderer(doc));
  const r = await stroke(br, { tool: "trace", size: 20, preset: 2, strength: 0.6, ce: 1 }, [P(20, 30), P(50, 30)]);
  const tr = doc.layers.filter((x) => x.k === "tr");
  assert.equal(tr.length, 1); assert.deepEqual(tr[0].p, { pr: 2 }); assert.equal(tr[0].ce, 1);
  assert.equal(r.lk, "trace"); assert.equal(r.op, "trace");
  const vis = compose(doc, doc.layers.length), c = px(vis, w, 35, 30);
  assert.ok(c[0] > c[2], "rust tint is warm");
  const s = await stroke(br, { tool: "trace", size: 40, preset: 4, strength: 1 }, [P(10, 50), P(70, 50)]);
  assert.ok(s.rect.h <= 8 + 1, "scratch tip at most 8 px: " + s.rect.h);
  assert.equal(doc.layers.filter((x) => x.k === "tr").length, 1, "same layer");
  assert.deepEqual(doc.layers.find((x) => x.k === "tr").p, { pr: 4 });
  const deltas = doc.history.logDeltas().map((d) => d.delta).filter((d) => d.o === "trace");
  assert.ok(deltas.length >= 1 && deltas.every((d) => d.n >= 1 && d.y === tr[0].id));
  const f = traceFn(2, 0.6, ((tr[0].id * 2654435761) ^ 0x5eed) >>> 0);
  assert.equal(typeof f, "function");
});
test("base protection and refusals: erase on the base, hidden target, unknown tool", async () => {
  const { doc } = mkDoc(40, 30, () => [100, 100, 100]);
  const br = new BrushEngine(doc, testRenderer(doc));
  doc.setActive(0);
  assert.equal(br.begin({ tool: "erase", size: 10 }, P(10, 10)), false); assert.equal(doc.lastError, "base");
  assert.equal(br.begin({ tool: "mask", size: 10 }, P(10, 10)), false); assert.equal(doc.lastError, "base");
  assert.equal(br.begin({ tool: "paint" }, P(1, 1)), false); assert.equal(br.lastError, "tool");
  await stroke(br, { tool: "dodge", size: 10 }, [P(10, 10)]);
  const db = doc.layers.find((x) => x.k === "db");
  doc.setProp(db.id, "vis", 0);
  assert.equal(br.begin({ tool: "dodge", size: 10 }, P(10, 10)), false); assert.equal(br.lastError, "hidden");
  const baseBefore = doc.base.read({ x: 0, y: 0, w: 40, h: 30 });
  assert.deepEqual(doc.base.read({ x: 0, y: 0, w: 40, h: 30 }), baseBefore, "the base is never painted");
});
test("mask brush paints and erases the active layer's mask; erase tool lowers alpha; cancel and undo restore exactly", async () => {
  const w = 50, h = 40, { doc } = mkDoc(w, h, () => [100, 100, 100]);
  const br = new BrushEngine(doc, testRenderer(doc));
  await stroke(br, { tool: "dodge", size: 30, hard: 1, exposure: 0.5 }, [P(25, 20)]);
  const db = doc.layers.find((x) => x.k === "db");
  doc.setActive(db.id);
  const before = db.surf.read({ x: 0, y: 0, w: db.bx.w, h: db.bx.h });
  const e = await stroke(br, { tool: "erase", size: 10, hard: 1 }, [P(25, 20)]);
  assert.equal(e.lk, "erase"); assert.equal(e.mx, mxOf(10, 40));
  assert.equal(db.surf.read({ x: 25 - db.bx.x, y: 20 - db.bx.y, w: 1, h: 1 })[3], 0, "erased");
  doc.undo();
  assert.deepEqual(db.surf.read({ x: 0, y: 0, w: db.bx.w, h: db.bx.h }), before, "undo restores the pixels");
  const m1 = await stroke(br, { tool: "mask", size: 10, hard: 1, maskMode: "erase" }, [P(10, 10)]);
  assert.equal(m1.lk, "maskPaint"); assert.equal(m1.op, "mask"); assert.equal(m1.mx, 0);
  assert.ok(db.mask && db.mask.m.length === w * h, "mask created on first use");
  assert.equal(db.mask.m[10 * w + 10], 0); assert.equal(db.mask.m[30 * w + 40], 255);
  await stroke(br, { tool: "mask", size: 10, hard: 1, op: 0.5 }, [P(10, 10)]);
  near(db.mask.m[10 * w + 10], 128, 1, "paint toward 255 capped at opacity");
  const snap = db.surf.read({ x: 0, y: 0, w: db.bx.w, h: db.bx.h });
  assert.equal(br.begin({ tool: "erase", size: 20, hard: 1 }, P(25, 20)), true);
  br.add([P(30, 22)]);
  br.cancel();
  assert.deepEqual(db.surf.read({ x: 0, y: 0, w: db.bx.w, h: db.bx.h }), snap, "cancel restores");
  assert.equal(br.active, false);
});
const mxOf = (size, short) => Math.ceil(((size / 2) * 1000) / short);
test("heal: the Poisson solve at pointerup removes a dark blot and blends into the surroundings", async () => {
  const w = 120, h = 90, r = mulberry32(3);
  const { doc } = mkDoc(w, h, (x, y) => { const v = 120 + 0.4 * x + 0.2 * y + (r() - 0.5) * 6; return (x - 40) ** 2 + (y - 45) ** 2 < 36 ? [20, 20, 20] : [v, v * 0.9, v * 0.8]; });
  const br = new BrushEngine(doc, testRenderer(doc));
  br.setSource(80, 45);
  await stroke(br, { tool: "heal", size: 22, hard: 0.6 }, [P(40, 45), P(41, 45)]);
  const vis = compose(doc, doc.layers.length);
  const v = px(vis, w, 40, 45), want = 120 + 0.4 * 40 + 0.2 * 45;
  near(v[0], want, 12, "blot healed toward the local tone");
  const L = doc.layers.find((x) => x.t === "heal");
  assert.ok(L && L.surf, "heal layer");
});
test("spot: a small dust dot on a gradient is filled by diffusion; a larger blot by a found source", async () => {
  const w = 100, h = 80, { doc } = mkDoc(w, h, (x, y) => ((x - 30) ** 2 + (y - 40) ** 2 <= 4 ? [255, 255, 255] : [60 + x, 80 + y * 0.5, 100]));
  const br = new BrushEngine(doc, testRenderer(doc));
  const s1 = await stroke(br, { tool: "spot", size: 8, hard: 0.5 }, [P(30, 40)]);
  assert.equal(s1.lk, "spot");
  let vis = compose(doc, doc.layers.length);
  near(vis[(40 * w + 30) * 4], 90, 4, "red channel restored"); near(vis[(40 * w + 30) * 4 + 1], 100, 4);
  const L = doc.layers.find((x) => x.t === "spot");
  const lay = L.surf.read({ x: 0, y: 0, w: L.bx.w, h: L.bx.h });
  for (let i = 0; i < lay.length; i += 4) if (lay[i + 3] > 0) assert.ok(!(lay[i] === 255 && lay[i + 1] === 0), "no red overlay left");
  const { doc: d2 } = mkDoc(140, 100, (x, y) => ((x - 70) ** 2 + (y - 50) ** 2 <= 49 ? [0, 0, 0] : [100 + ((x * 7 + y * 3) % 11), 120, 140]));
  const b2 = new BrushEngine(d2, testRenderer(d2));
  await stroke(b2, { tool: "spot", size: 26, hard: 0.8 }, [P(70, 50)]);
  vis = compose(d2, d2.layers.length);
  assert.ok(vis[(50 * 140 + 70) * 4] >= 95, "blot replaced by surrounding texture: " + vis[(50 * 140 + 70) * 4]);
});
test("trace overlap with a 흔적 위치 pin is reported once per pin (po)", async () => {
  const { doc } = mkDoc(100, 100, () => [100, 100, 100]);
  doc.setPins([{ x: 500, y: 500, k: 1 }, { x: 100, y: 100, k: 1 }, { x: 900, y: 900, k: 2 }], "pin");
  const br = new BrushEngine(doc, testRenderer(doc));
  const r = await stroke(br, { tool: "dodge", size: 10 }, [P(50, 50), P(60, 50)]);
  assert.deepEqual(r.po, [0]);
  const r2 = await stroke(br, { tool: "dodge", size: 10 }, [P(80, 20)]);
  assert.equal(r2.po, undefined);
});
test("perf (reported): 60-point stroke with a 100 px tip, heal 200 × 200", async () => {
  const { doc } = mkDoc(1600, 1200, (x, y) => [80 + (x % 50), 90 + (y % 40), 100]);
  const ren = testRenderer(doc), cached = new Map();
  const below = ren.below.bind(ren);
  ren.below = (i) => { if (!cached.has(i)) cached.set(i, below(i)); return cached.get(i); };
  const br = new BrushEngine(doc, ren);
  ren.below(1);   // the renderer's cache exists before the stroke in the editor
  const t0 = performance.now();
  assert.equal(br.begin({ tool: "dodge", size: 100, hard: 0.5 }, P(200, 600)), true);
  const t1 = performance.now();
  let worst = 0;
  for (let i = 1; i < 60; i++) { const a = performance.now(); br.add([P(200 + i * 10, 600 + Math.sin(i / 5) * 40)]); worst = Math.max(worst, performance.now() - a); }
  await br.end();
  const t2 = performance.now();
  console.log("# brush: begin " + (t1 - t0).toFixed(1) + " ms, worst add (≈2 dabs) " + worst.toFixed(1) + " ms, 60-point stroke " + (t2 - t0).toFixed(1) + " ms");
  br.setSource(1000, 600);
  const h0 = performance.now();
  await stroke(br, { tool: "heal", size: 200, hard: 0.5 }, [P(500, 600), P(501, 600)]);
  console.log("# brush: heal stroke 200 px incl. solve " + (performance.now() - h0).toFixed(1) + " ms");
});

/* ---------- marks ---------- */
test("marks: constants and textLines", () => {
  assert.equal(GREY20.length, 20); assert.equal(GREY20[0], 255); assert.equal(GREY20[19], 29);
  assert.equal(CHART24.length, 24); CHART24.forEach((h) => assert.match(h, /^[0-9A-F]{6}$/));
  assert.deepEqual(textLines("a\nb\nc\nd"), ["a", "b", "c"]); assert.deepEqual(textLines("a\r\nb"), ["a", "b"]); assert.deepEqual(textLines(null), [""]);
  assert.equal(SEG_CM[1], 1); assert.equal(FONT.length, 2);
});
test("scaleBarSpec: 5 cm with 1 cm segments → 5 alternating rects starting #000; labels 0 and 5 cm; scale; vertical; mm; uncalibrated", () => {
  const s = scaleBarSpec({ cm: 50, sg: 1 }, 40, 1, 1600, 1200);
  assert.equal(s.rects.length, 5);
  s.rects.forEach((r, i) => { assert.equal(r.fill, i % 2 ? "#fff" : "#000"); near(r.w, 40, 1e-9); });
  near(s.rects[1].x - s.rects[0].x, 40, 1e-9); near(s.len, 200, 1e-9);
  assert.deepEqual(s.labels.map((l) => l.text), ["0", "5 cm"]);
  near(s.labels[1].x - s.labels[0].x, 200, 1e-9);
  assert.ok(s.rects[0].h >= 8 && s.rects[0].h <= 0.04 * 1200 + 1e-9, "height clamp(length/10, 8, 4 % of the short side)");
  assert.ok(s.labels[0].size >= 11);
  const k2 = scaleBarSpec({ cm: 50, sg: 1 }, 40, 2, 1600, 1200);
  near(k2.rects[2].x, s.rects[2].x * 2, 1e-9); near(k2.w, s.w * 2, 1e-9); near(k2.labels[1].size, s.labels[1].size * 2, 1e-9); near(k2.stroke.lw, 2, 1e-9);
  const all = scaleBarSpec({ cm: 50, sg: 1, lb: 1 }, 40, 1, 1600, 1200);
  assert.deepEqual(all.labels.map((l) => l.text), ["0", "1", "2", "3", "4", "5 cm"]);
  const v = scaleBarSpec({ cm: 50, sg: 1, o: 1 }, 40, 1, 1600, 1200);
  assert.equal(v.rects.length, 5); assert.ok(v.h > v.w); assert.equal(v.rects[0].fill, "#000");
  assert.ok(v.rects[0].y > v.rects[4].y, "0 at the bottom");
  const mm = scaleBarSpec({ cm: 50, sg: 1, mm: 1 }, 40, 1, 1600, 1200);
  assert.equal(mm.rects.length, 15);
  const big = scaleBarSpec({ cm: 500 }, 10, 1, 1600, 1200);
  assert.equal(big.rects.length, 5, "50 cm in 10 cm segments (auto rule)");
  const twenty = scaleBarSpec({ cm: 200 }, 10, 1, 1600, 1200);
  assert.equal(twenty.rects.length, 10, "20 cm in 2 cm segments");
  const odd = scaleBarSpec({ cm: 35, sg: 1 }, 40, 1, 1600, 1200);
  assert.equal(odd.rects.length, 4); near(odd.rects[3].w, 20, 1e-9, "the last segment is cut at the length");
  assert.deepEqual(odd.labels.map((l) => l.text), ["0", "3.5 cm"]);
  const none = scaleBarSpec({ cm: 50 }, null, 1, 1600, 1200);
  assert.equal(none.rects.length, 0); assert.equal(none.w, 0);
  const auto = scaleBarSpec({}, 40, 1, 1600, 1200);
  assert.equal(auto.cm, suggestBarCm(40, 1600, 0).cm / 10, "absent cm = automatic length");
});
test("suggestBarCm: 15–35 % of the width, closest to 25 % of the object; segment rule", () => {
  for (const [ppc, W, obj] of [[40, 1600, 800], [10, 1600, null], [3, 1200, 900], [120, 1600, 1000]]) {
    const s = suggestBarCm(ppc, W, obj), L = (s.cm / 10) * ppc;
    assert.ok([10, 20, 50, 100, 200, 500, 1000].includes(s.cm));
    if (L >= 0.15 * W && L <= 0.35 * W) {
      for (const c of [1, 2, 5, 10, 20, 50, 100]) { const l = c * ppc; if (l >= 0.15 * W && l <= 0.35 * W) assert.ok(Math.abs(L - 0.25 * (obj || W)) <= Math.abs(l - 0.25 * (obj || W)) + 1e-9); }
    }
  }
  assert.deepEqual(suggestBarCm(40, 1600, 800), { cm: 100, sg: 1 });
  assert.deepEqual(suggestBarCm(10, 1600, null), { cm: 500, sg: 4 });
  assert.equal(SEG_CM[suggestBarCm(4, 1600, 1200).sg], 10);
  assert.deepEqual(suggestBarCm(null, 1600, 800), { cm: 50, sg: 1 });
});
test("markBox: centre at p.x/p.y ‰, preset places inside the 5 % margins, sizes for each kind", () => {
  const W = 1600, H = 1200;
  const b = markBox({ k: "ov", t: "gs", p: { x: 500, y: 500 } }, W, H, null);
  near(b.x + b.w / 2, 800, 1e-9); near(b.y + b.h / 2, 600, 1e-9); near(b.w, 20 * 36, 1e-9, "20 patches of 3 % of the short side");
  for (const rec of [{ k: "ov", t: "sb", p: {} }, { k: 7, t: 1, p: { ps: 1 } }, { k: "ov", t: "cc", p: { ps: 2 } }, { k: "ov", t: "tg", p: { s: "2300-KR-001" } }, { k: "txt", p: { s: "abc\ndef" } }, { k: "ov", t: "sb", p: { ps: 3, o: 1 } }]) {
    const m = markBox(rec, W, H, 40);
    assert.ok(m.w > 0 && m.h > 0, JSON.stringify(rec));
    assert.ok(m.x >= 0.05 * H - 1e-6 && m.y >= 0.05 * H - 1e-6 && m.x + m.w <= W - 0.05 * H + 1e-6 && m.y + m.h <= H - 0.05 * H + 1e-6, "inside margins " + JSON.stringify(rec));
  }
  const sb = markBox({ k: "ov", t: "sb", p: {} }, W, H, 40);
  near(sb.x + sb.w / 2, 800, 1e-9, "아래 가운데"); assert.ok(sb.y > H / 2);
  const t1 = markBox({ k: "txt", p: { s: "a" } }, W, H, null), t3 = markBox({ k: "txt", p: { s: "a\nb\nc" } }, W, H, null);
  near(t3.h, 3 * t1.h, 1e-9);
  assert.deepEqual(markBox({ k: "ov", t: "sb", p: { x: 500, y: 900 } }, W, H, null).w, 0, "uncalibrated bar has no size");
  const tg = markBox({ k: "ov", t: "tg", p: { s: "AB", sz: 40 } }, W, H, null), tgK = markBox({ k: "ov", t: "tg", p: { s: "AB", sz: 80 } }, W, H, null);
  near(tgK.h, 2 * tg.h, 1e-9);
});
test("autoPlace avoids the object box and stays inside the frame", () => {
  const W = 1600, H = 1200, obj = { x: 400, y: 250, w: 800, h: 650 };
  for (const t of ["sb", "gs", "cc", "tg", "txt"]) {
    const q = autoPlace(t, W, H, obj, 40);
    assert.ok(Number.isInteger(q.x) && Number.isInteger(q.y) && q.x >= 0 && q.x <= 1000 && q.y >= 0 && q.y <= 1000);
    const rec = t === "txt" ? { k: "txt", p: { s: "A", x: q.x, y: q.y } } : { k: "ov", t, p: { x: q.x, y: q.y } };
    const b = markBox(rec, W, H, 40);
    const ov = Math.max(0, Math.min(b.x + b.w, obj.x + obj.w) - Math.max(b.x, obj.x)) * Math.max(0, Math.min(b.y + b.h, obj.y + obj.h) - Math.max(b.y, obj.y));
    assert.equal(ov, 0, t + " overlaps the object");
  }
  const sb = autoPlace("sb", W, H, obj, 40), sbBox = markBox({ k: "ov", t: "sb", p: sb }, W, H, 40);
  near(sbBox.x + sbBox.w / 2, 800, 2, "below the object, centred on it"); assert.ok(sbBox.y >= obj.y + obj.h);
  const free = autoPlace("tg", W, H, null, null); assert.ok(free.x > 500 && free.y > 500, "tag lower right");
});
/** ctx recorder: every call and property set */
function recorder() {
  const calls = [];
  const ctx = new Proxy({ calls }, {
    get(t, k) {
      if (k === "calls") return calls;
      if (k === "measureText") return (s) => ({ width: String(s).length * 10 });
      if (k in t) return t[k];
      return (...a) => calls.push([k, ...a]);
    },
    set(t, k, v) { calls.push(["set:" + String(k), v]); t[k] = v; return true; },
  });
  return ctx;
}
test("drawMark call sequence on the ctx recorder: segments, outline, labels; nothing without calibration", () => {
  const ctx = recorder();
  drawMark(ctx, { k: "ov", t: "sb", p: { cm: 50, sg: 1, x: 500, y: 500 } }, 1600, 1200, 1, 40);
  const fills = ctx.calls.filter((c) => c[0] === "set:fillStyle").map((c) => c[1]);
  assert.deepEqual(fills.slice(0, 5), ["#000", "#fff", "#000", "#fff", "#000"]);
  assert.equal(ctx.calls.filter((c) => c[0] === "fillRect").length, 5);
  assert.equal(ctx.calls.filter((c) => c[0] === "strokeRect").length, 1);
  assert.deepEqual(ctx.calls.filter((c) => c[0] === "fillText").map((c) => c[1]), ["0", "5 cm"]);
  assert.equal(ctx.calls[0][0], "save"); assert.equal(ctx.calls[ctx.calls.length - 1][0], "restore");
  const firstRect = ctx.calls.find((c) => c[0] === "fillRect"), b = markBox({ k: "ov", t: "sb", p: { cm: 50, sg: 1, x: 500, y: 500 } }, 1600, 1200, 40);
  const s = scaleBarSpec({ cm: 50, sg: 1 }, 40, 1, 1600, 1200);
  near(firstRect[1], b.x + s.rects[0].x, 1e-9); near(firstRect[3], 40, 1e-9);
  const k2 = recorder();
  drawMark(k2, { k: "ov", t: "sb", p: { cm: 50, sg: 1, x: 500, y: 500 } }, 1600, 1200, 2, 40);
  near(k2.calls.find((c) => c[0] === "fillRect")[3], 80, 1e-9, "scale 2 doubles");
  const none = recorder(); drawMark(none, { k: "ov", t: "sb", p: { cm: 50 } }, 1600, 1200, 1, null);
  assert.equal(none.calls.length, 0);
  const g = recorder(); drawMark(g, { k: "ov", t: "gs", p: {} }, 1600, 1200, 1, null);
  assert.equal(g.calls.filter((c) => c[0] === "fillRect").length, 20);
  assert.deepEqual(g.calls.filter((c) => c[0] === "set:fillStyle").slice(0, 2).map((c) => c[1]), ["rgb(255,255,255)", "rgb(230,230,230)"]);
  assert.deepEqual(g.calls.filter((c) => c[0] === "fillText").map((c) => c[1]), ["A", "M", "B"]);
  const cc = recorder(); drawMark(cc, { k: "ov", t: "cc", p: {} }, 1600, 1200, 1, null);
  assert.equal(cc.calls.filter((c) => c[0] === "fillRect").length, 25, "frame + 24 patches");
  assert.ok(cc.calls.some((c) => c[0] === "set:fillStyle" && c[1] === "#383D96"));
  const tg = recorder(); drawMark(tg, { k: "ov", t: "tg", p: { s: "2300-KR-001" } }, 1600, 1200, 1, null);
  assert.deepEqual(tg.calls.filter((c) => c[0] === "fillText").map((c) => c[1]), ["2300-KR-001"]);
  assert.ok(tg.calls.some((c) => c[0] === "set:font" && /Plex Mono/.test(c[1])), "mono for Latin numbers");
});
test("drawText: lines, font, weight, colour and alignment inside a block centred at p.x/p.y; hitMarks topmost, hidden skipped", () => {
  const ctx = recorder();
  drawText(ctx, { k: "txt", p: { s: "ab\ncdef", x: 500, y: 500, al: 2, wt: 1, fn: 1, c: [10, 20, 30], sz: 50 } }, 1000, 800, 1);
  const texts = ctx.calls.filter((c) => c[0] === "fillText");
  assert.deepEqual(texts.map((c) => c[1]), ["ab", "cdef"]);
  near(texts[0][2], 500 + 20, 1e-9, "right edge of a 40 px block centred at 500");
  assert.ok(texts[1][3] > texts[0][3]);
  assert.ok(ctx.calls.some((c) => c[0] === "set:font" && /^700 /.test(c[1]) && c[1].includes("Noto Serif KR")));
  assert.ok(ctx.calls.some((c) => c[0] === "set:fillStyle" && c[1] === "rgb(10,20,30)"));
  assert.ok(ctx.calls.some((c) => c[0] === "set:textAlign" && c[1] === "right"));
  const recs = [{ id: 1, k: "ov", t: "gs", p: { x: 500, y: 500 } }, { id: 2, k: "txt", p: { s: "X", x: 500, y: 500 } }, { id: 3, k: "ov", t: "tg", vis: 0, p: { s: "T", x: 500, y: 500 } }];
  assert.equal(hitMarks(recs, 800, 600, 1600, 1200, null), 1, "topmost visible");
  assert.equal(hitMarks(recs, 10, 10, 1600, 1200, null), -1);
  assert.equal(hitMarks([recs[0]], 800 - 360 - 3, 600, 1600, 1200, null), 0, "edge tolerance");
});
test("ensureFont resolves false without a DOM", async () => {
  assert.equal(await ensureFont(1, "x"), false);
  assert.equal(await ensureFont(0, ""), false);
});

/* ---------- review round 1 regressions (r2-engine.md R2-04, R2-09, R2-11, R2-16, perf) ---------- */
const fnv = (u8) => { let h = 2166136261; for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 16777619) >>> 0; } return h; };
const layerState = (doc) => doc.layers.map((L) => JSON.stringify({ id: L.id, k: L.k, p: L.p, ce: L.ce, mx: L.mx, px: L.surf ? fnv(L.surf.read({ x: 0, y: 0, w: L.bx.w, h: L.bx.h })) : 0, bx: L.bx }));
test("R2-04: the trace preset (p.pr) and card cell (ce) are restored by undo and redo; a stroke outside the image changes nothing", async () => {
  const { doc } = mkDoc(80, 60, (x, y) => [90 + x, 70 + y, 60]);
  const br = new BrushEngine(doc, testRenderer(doc));
  await stroke(br, { tool: "trace", size: 10, preset: 1, strength: 1, ce: 0 }, [P(10, 10), P(30, 10)]);
  const L = doc.layers.find((x) => x.k === "tr");
  assert.deepEqual(L.p, { pr: 1 }); assert.equal(L.ce, 0);
  const s1 = layerState(doc);
  await stroke(br, { tool: "dodge", size: 10 }, [P(60, 50)]);   // another row in between: the trace strokes do not merge
  const s2 = layerState(doc);
  await stroke(br, { tool: "trace", size: 10, preset: 3, strength: 1, ce: 2 }, [P(10, 30), P(30, 30)]);
  assert.deepEqual(L.p, { pr: 3 }); assert.equal(L.ce, 2);
  const s3 = layerState(doc), man3 = JSON.stringify(doc.toManifest().L);
  doc.undo();
  assert.deepEqual(L.p, { pr: 1 }, "undo restores the preset"); assert.equal(L.ce, 0, "undo restores the card cell");
  assert.deepEqual(layerState(doc), s2, "undo is byte-identical");
  const man = doc.toManifest().L.find((r) => r.id === L.id);
  assert.deepEqual(man.p, { pr: 1 }); assert.ok(!man.ce, "manifest without the undone cell");
  doc.redo();
  assert.deepEqual(layerState(doc), s3, "redo is byte-identical"); assert.equal(JSON.stringify(doc.toManifest().L), man3);
  doc.undo(); doc.undo();   // trace stroke 2, dodge stroke
  assert.equal(layerState(doc)[0], s1[0], "the trace layer is back to stroke 1");
  doc.undo(); doc.undo();   // the dodge layer, trace stroke 1
  assert.equal(L.p, null, "undoing the first stroke restores the empty layer's p"); assert.equal(L.ce, 0);
  doc.redo(); doc.redo(); doc.redo(); doc.redo();
  assert.deepEqual(layerState(doc), s3);
  // merged strokes (same tool within 2 s) unwind in order within one row
  const n0 = doc.list().length;
  await stroke(br, { tool: "trace", size: 8, preset: 2, strength: 1, ce: 4 }, [P(50, 10)]);
  await stroke(br, { tool: "trace", size: 8, preset: 4, strength: 1, ce: 1 }, [P(55, 20), P(70, 20)]);
  const merged = doc.list().length === n0;   // both merged into the top trace row (same tool within 2 s), or into one new row
  assert.ok(merged || doc.list().length === n0 + 1, "one row for both strokes");
  assert.deepEqual(L.p, { pr: 4 }); assert.equal(L.ce, 1);
  doc.undo();
  assert.deepEqual(layerState(doc), merged ? s2 : s3, "one undo restores the state before the merged row");
  doc.redo();
  assert.deepEqual(L.p, { pr: 4 }); assert.equal(L.ce, 1);
  // a tap outside the work area: no dab, no command, no property change
  const rows = doc.list().length, p0 = JSON.stringify(L.p);
  assert.equal(br.begin({ tool: "trace", size: 4, preset: 2, strength: 1 }, P(-500, -500)), true);
  const r = await br.end();
  assert.equal(r.rect, null); assert.equal(doc.list().length, rows); assert.equal(JSON.stringify(L.p), p0);
});
/** the reviewer's t10 scenario: a real Renderer on memory gfx; the final write of the solve is refused (memory) */
async function solveUnderPressure(tool, before) {
  const W = 600, H = 200, g = makeMemGfx({ limit: Infinity }), base = g.surface(W, H);
  for (let i = 0; i < base.data.length; i += 4) base.data.set([128, 128, 128, 255], i);
  const doc = new PhotoDoc(g, { base, w: W, h: H }), rend = new Renderer(doc, g, {}), br = new BrushEngine(doc, rend);
  rend.below(1); rend.composite();
  br.setSource(100, 100);
  assert.equal(br.begin({ tool, size: 12, hard: 1, op: 1, flow: 1 }, P(240, 100)), true);
  br.add([P(247, 100)]);   // the stroke rect ends at x 253, inside the first 256-px allocation column
  const L = doc.layers[0], rows = doc.list().length;
  rend.freeCaches(); g.limit = g.bytes() + 1000;
  if (before) before(br);
  const res = await br.end();
  return { doc, br, L, res, rows };
}
test("R2-09: when the final spot (or heal) solve or write fails, nothing is committed, pixels are restored and lastError is memory", async () => {
  for (const tool of ["spot", "heal"]) {
    // spot: its final region (stroke ± 4 px) needs the layer to grow past the 256-px column under the memory limit (t10);
    // heal (stroke ± 2 px) fits, so its final write is refused directly
    const { doc, br, L, res, rows } = await solveUnderPressure(tool, tool === "heal" ? (b) => { b._compose = () => false; } : null);
    assert.equal(res.rect, null, tool);
    assert.equal(doc.lastError, "memory"); assert.equal(br.lastError, "memory");
    assert.equal(doc.list().length, rows, tool + ": no stroke row");
    const d = L.surf.read({ x: 0, y: 0, w: L.bx.w, h: L.bx.h });
    let painted = 0; for (let i = 3; i < d.length; i += 4) if (d[i]) painted++;
    assert.equal(painted, 0, tool + ": the layer is back to empty (no red overlay)");
    assert.equal(br.active, false);
  }
});
test("R2-09: a sampler failure during add cancels the stroke with lastError memory", async () => {
  const { doc } = mkDoc(300, 200, () => [100, 100, 100]);
  const ren = testRenderer(doc);
  const br = new BrushEngine(doc, ren);
  br.lookahead = false;
  assert.equal(br.begin({ tool: "dodge", size: 10 }, P(10, 10)), true);
  br._s.sampler.read = () => { throw new Error("canvas allocation failed"); };   // the renderer cannot give the sample (memory)
  assert.equal(br.add([P(250, 170)]), null);
  assert.equal(doc.lastError, "memory"); assert.equal(br.lastError, "memory"); assert.equal(br.active, false);
  const L = doc.layers.find((x) => x.k === "db");
  const d = L.surf ? L.surf.read({ x: 0, y: 0, w: L.bx.w, h: L.bx.h }) : new Uint8ClampedArray(4);
  for (let i = 3; i < d.length; i += 4) assert.equal(d[i], 0, "restored");
});
test("R2-11: spot stays inside the selection (as clone, heal and dodge do)", async () => {
  for (const tool of ["spot", "heal", "clone", "dodge"]) {
    const w = 120, h = 90, { doc } = mkDoc(w, h, (x, y) => [(x * 255) / w, (y * 255) / h, ((x + y) * 7) & 255]);
    const br = new BrushEngine(doc, testRenderer(doc));
    br.setSource(20, 70);
    const m = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < 60; x++) m[y * w + x] = 255;
    doc.setSelection(m, "new");
    await stroke(br, { tool, size: 30, hard: 1, op: 1, flow: 1, exposure: 0.5 }, [P(50, 30), P(50, 50)]);
    const L = doc.layers.find((x) => x.k === "px" || x.k === "db");
    const d = L.surf.read({ x: 0, y: 0, w: L.bx.w, h: L.bx.h });
    let outside = 0, inside = 0;
    for (let y = 0; y < L.bx.h; y++) for (let x = 0; x < L.bx.w; x++) if (d[(y * L.bx.w + x) * 4 + 3]) { if (L.bx.x + x >= 60) outside++; else inside++; }
    assert.equal(outside, 0, tool + " wrote right of the selection edge");
    assert.ok(inside > 0, tool + " painted inside");
  }
});
test("R2-16: the clone source keeps its base position when the work-area origin moves (margins)", async () => {
  const w = 100, h = 80, { doc } = mkDoc(w, h, (x, y) => (x >= 25 && x < 35 && y >= 25 && y < 35 ? [250, 20, 20] : [40, 60, 200]));
  const br = new BrushEngine(doc, null);
  br.setSource(30, 30);                                    // base (30, 30), the red square
  doc.setGeo({ ext: { t: 0, r: 0, b: 0, l: 100 } });       // 10 % left margin: wa.x = -10
  assert.equal(doc.wa.x, -10);
  await stroke(br, { tool: "clone", size: 6, hard: 1 }, [P(80, 60)]);   // wa-local (80, 60) = base (70, 60)
  const L = doc.layers.find((x) => x.t === "clone");
  const c = L.surf.read({ x: 80 + doc.wa.x - L.bx.x, y: 60 - L.bx.y, w: 1, h: 1 });
  assert.deepEqual([...c].slice(0, 3), [250, 20, 20], "copied from base (30, 30)");
});
test("perf: the look-ahead never changes the result and undo is exact", async () => {
  const run = async (look) => {
    const { doc } = mkDoc(400, 300, (x, y) => [60 + (x % 90), 70 + (y % 50), 100 + ((x * y) % 30)]);
    const br = new BrushEngine(doc, testRenderer(doc));
    br.lookahead = look;
    const pts = []; for (let i = 0; i <= 30; i++) pts.push(P(40 + i * 9, 150 + Math.sin(i / 4) * 60));
    assert.equal(br.begin({ tool: "dodge", size: 60, hard: 0.5, exposure: 0.3 }, pts[0]), true);
    for (const q of pts.slice(1)) br.add([q]);
    await br.end();
    const after = compose(doc, doc.layers.length);
    doc.undo();
    return { after, doc };
  };
  const a = await run(true), b = await run(false);
  assert.deepEqual(a.after, b.after, "identical pixels with and without the look-ahead");
  const L = a.doc.layers.find((x) => x.k === "db");
  const d = L.surf.read({ x: 0, y: 0, w: L.bx.w, h: L.bx.h });
  for (let i = 3; i < d.length; i += 4) assert.equal(d[i], 0, "undo leaves no paint");
});
