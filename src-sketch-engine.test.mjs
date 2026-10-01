/* 디지털 에스키스 엔진 가운데 캔버스 없이 확인할 수 있는 부분: 저장소 도우미(조각 나누기·읽기 실패 구분),
   과정 기록 꾸리기, 요약, 붓 표의 정합성. 그리기 자체는 헤드리스 브라우저 시험(.tmpbuild/sketch-harness)이 본다.
   실행: node --test src-sketch-engine.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import {
  BRUSHES, BRUSH, BRUSH_PARAMS, BLENDS, ADJUSTS, RATIOS, PAPERS, paperColor, MAX_LAYERS, HISTORY_MAX, PART_MAX, LOG_PREFIX,
  opLabel, logStats, splitParts, putParts, getParts, readDoc, fetchLog, fetchLayer, FAILED, refsOf, packLog, unpackLog, textFont, dashArr,
} from "./src-sketch-engine.mjs";

/* firestore.rules의 media 규칙: 문자열, 1,000,000자 미만, data:(image|audio|video)/[^,]*,.* 전체 일치 */
const RULE = /^data:(image|audio|video)\/[^,]*,.*$/;
const ruleOk = (v) => typeof v === "string" && v.length < 1000000 && RULE.test(v);

function fakeStore({ failPut, failGet } = {}) {
  const db = new Map(), removed = [];
  return {
    db, removed,
    async putT(owner, ref, v) { if (failPut && failPut(ref)) return false; if (!ruleOk(v)) return false; db.set(owner + "_" + ref, v); return true; },
    async get(owner, ref) { return db.has(owner + "_" + ref) ? db.get(owner + "_" + ref) : null; },
    async getSafe(owner, ref) { if (failGet && failGet(ref)) return { ok: false, data: null }; return { ok: true, data: db.has(owner + "_" + ref) ? db.get(owner + "_" + ref) : null }; },
    remove(owner, ref) { removed.push(ref); db.delete(owner + "_" + ref); },
  };
}

test("붓 표: 키가 겹치지 않고 기본 굵기가 범위 안이며 설정 항목이 모두 정의돼 있다", () => {
  const keys = new Set(), shortcuts = new Set();
  for (const b of BRUSHES) {
    assert.ok(!keys.has(b.k), "키 중복 " + b.k); keys.add(b.k);
    if (b.key) { assert.ok(!shortcuts.has(b.key), "단축키 중복 " + b.key); shortcuts.add(b.key); }
    assert.ok(b.name && typeof b.name === "string");
    assert.ok(b.d.size >= b.min && b.d.size <= b.max, b.k + " 기본 굵기");
    assert.ok(b.d.op > 0 && b.d.op <= 1, b.k + " 기본 불투명도");
    assert.ok(["path", "grain", "stamp", "nib", "spray", "smudge"].includes(b.eng), b.k + " 방식");
    for (const a of b.adj) {
      assert.ok(BRUSH_PARAMS[a], b.k + " 설정 항목 " + a);
      const [, lo, hi] = BRUSH_PARAMS[a];
      assert.ok(a in b.d, b.k + " 기본값에 " + a);
      assert.ok(b.d[a] >= lo && b.d[a] <= hi, b.k + "." + a + " 기본값이 범위 안");
    }
    if (b.eng === "grain") assert.ok(Array.isArray(b.dens) && b.tex);
    assert.equal(BRUSH[b.k], b);
  }
  assert.ok(BRUSH.eraser.erase && BRUSH.smudge.eng === "smudge");
  assert.ok(BRUSHES.length >= 12);
});

test("표: 혼합 모드·조정·비율·종이", () => {
  assert.equal(BLENDS[0][0], "normal");
  assert.equal(new Set(BLENDS.map((b) => b[0])).size, BLENDS.length);
  for (const a of ADJUSTS) for (const p of a.params) { assert.equal(p.length, 6); assert.ok(p[4] >= p[2] && p[4] <= p[3], a.k + " 기본값"); }
  for (const r of RATIOS) assert.ok(r.W * r.H <= 2400000 && r.W >= 200 && r.H >= 200, r.k);
  assert.equal(paperColor("kraft"), PAPERS.find((p) => p.k === "kraft").c);
  assert.equal(paperColor("없는 종이"), PAPERS[0].c);
  assert.ok(MAX_LAYERS >= 8 && HISTORY_MAX >= 60);
  assert.match(textFont(24, "serif"), /24px/);
  assert.match(textFont(24, "없는 글꼴"), /24px/);
  assert.deepEqual(dashArr("solid", 4), []);
  assert.equal(dashArr("dash", 4).length, 2);
});

test("opLabel: 모든 작업 종류에 이름이 있다", () => {
  const ops = [
    { kind: "stroke", tool: "pencil" }, { kind: "stroke", tool: "eraser" }, { kind: "smudge" }, { kind: "shape", shape: "rect" }, { kind: "shape", shape: "ellipse", quick: true },
    { kind: "text" }, { kind: "image" }, { kind: "image", paste: true }, { kind: "fill" }, { kind: "transform" }, { kind: "adjust", type: "blur" },
    { kind: "clear", layers: [1] }, { kind: "clear", layers: [1, 2] }, { kind: "clear", sel: {}, layers: [1] },
    { kind: "ladd" }, { kind: "ldel" }, { kind: "lmove" }, { kind: "lset", patch: { op: 0.5 } }, { kind: "lset", patch: { blend: "multiply" } }, { kind: "ldup" }, { kind: "lmerge" }, { kind: "lflat" },
    { kind: "paper" }, { kind: "canvas", type: "resize" }, { kind: "canvas", type: "rot90" }, { kind: "canvas", type: "flipH" }, { kind: "new" }, { kind: "base" }, { kind: "모르는 것" },
  ];
  for (const op of ops) { const s = opLabel(op); assert.ok(typeof s === "string" && s.length > 0, JSON.stringify(op)); assert.ok(!s.includes("—"), s); }
  assert.equal(opLabel({ kind: "stroke", tool: "pencil" }), "연필");
  assert.match(opLabel({ kind: "shape", shape: "ellipse", quick: true }), /바로잡기/);
  // 레이어 설정은 값에 따라 이름이 달라진다(숨긴 작업이 「보이기」로 적히지 않게)
  assert.equal(opLabel({ kind: "lset", patch: { vis: false } }), "레이어 숨기기");
  assert.equal(opLabel({ kind: "lset", patch: { vis: true } }), "레이어 보이기");
  assert.equal(opLabel({ kind: "lset", patch: { lock: false } }), "레이어 잠금 해제");
  assert.equal(opLabel({ kind: "lset", patch: { alock: true } }), "알파 잠금");
  assert.equal(opLabel({ kind: "lset", patch: { op: 0.5 } }), "레이어 불투명도");
});

test("logStats: 획 수·도구·그린 시간(60초 넘는 간격은 쉬는 시간)", () => {
  const t0 = 1_000_000;
  const ops = [
    { kind: "new", t: t0 },
    { kind: "stroke", tool: "pencil", t: t0 + 5000 },
    { kind: "stroke", tool: "pencil", t: t0 + 8000 },
    { kind: "shape", shape: "rect", t: t0 + 10000 },
    { kind: "ladd", t: t0 + 11000 },
    { kind: "smudge", t: t0 + 600000 },   // 한참 쉬었다가
  ];
  const s = logStats(ops);
  assert.equal(s.n, 5);
  assert.equal(s.strokes, 3);
  assert.equal(s.tools["연필"], 2);
  assert.equal(s.tools["도형"], 1);
  assert.equal(s.ms, 5000 + 3000 + 2000 + 1000 + 60000);
  assert.deepEqual(logStats([]), { n: 0, strokes: 0, ms: 0, tools: {} });
  assert.deepEqual(logStats(null), { n: 0, strokes: 0, ms: 0, tools: {} });
});

test("splitParts: 한도 안이면 한 조각, 넘으면 순서대로", () => {
  assert.deepEqual(splitParts("abc", 10), ["abc"]);
  assert.deepEqual(splitParts("abcdefg", 3), ["abc", "def", "g"]);
  assert.deepEqual(splitParts("", 3), [""]);
});

test("putParts·getParts: 한 조각은 그대로, 여러 조각은 규칙에 맞는 머리말을 붙여 담고 읽을 때 뗀다", async () => {
  const st = fakeStore();
  const small = "data:image/png;base64," + "A".repeat(1000);
  const p1 = await putParts(st, "20999", "s4c.sketchpad.1.L1", small);
  assert.deepEqual(p1, [{ ref: "s4c.sketchpad.1.L1" }]);
  assert.equal(st.db.get("20999_s4c.sketchpad.1.L1"), small);
  assert.equal(await getParts(st, "20999", p1), small);

  const big = "data:image/png;base64," + Array.from({ length: PART_MAX * 2 + 12345 }, (_, i) => "ABCDEFGH"[i % 8]).join("");
  const p3 = await putParts(st, "20999", "s4c.sketchpad.1.L2", big);
  assert.equal(p3.length, 3);
  assert.deepEqual(p3.map((p) => p.ref), ["s4c.sketchpad.1.L2.p0", "s4c.sketchpad.1.L2.p1", "s4c.sketchpad.1.L2.p2"]);
  for (const p of p3) assert.ok(ruleOk(st.db.get("20999_" + p.ref)), "조각이 media 규칙을 지킨다: " + p.ref);
  assert.equal(await getParts(st, "20999", p3), big);
  assert.equal(await fetchLayer(st, "20999", { parts: p3 }), big);
  assert.equal(await fetchLayer(st, "20999", { ref: "s4c.sketchpad.1.L1" }), small);   // 옛 값 모양
  assert.equal(await fetchLayer(st, "20999", {}), null);
});

test("putParts: 한 조각이라도 못 올리면 올린 것과 실패한 것 모두 지우기를 건다", async () => {
  const st = fakeStore({ failPut: (ref) => ref.endsWith(".p1") });
  const big = "data:image/png;base64," + "Z".repeat(PART_MAX * 2 + 10);
  const r = await putParts(st, "20999", "x.L1", big);
  assert.equal(r, null);
  assert.deepEqual(st.removed.sort(), ["x.L1.p0", "x.L1.p1"]);
  assert.equal(st.db.size, 0);
});

test("getParts·readDoc: 읽기 실패(FAILED)와 없음(null)을 구분한다", async () => {
  const st = fakeStore({ failGet: (ref) => ref === "b" });
  await st.putT("o", "a", "data:image/png,1");
  assert.deepEqual(await readDoc(st, "o", "a"), { ok: true, data: "data:image/png,1" });
  assert.deepEqual(await readDoc(st, "o", "없음"), { ok: true, data: null });
  assert.deepEqual(await readDoc(st, "o", "b"), { ok: false, data: null });
  assert.equal(await getParts(st, "o", [{ ref: "a" }, { ref: "b" }]), FAILED);
  assert.equal(await getParts(st, "o", [{ ref: "a" }, { ref: "없음" }]), null);
  assert.equal(await getParts(st, "o", []), null);
  assert.equal(await fetchLayer(st, "o", { ref: "b" }), FAILED);
  // getSafe가 없는 저장소는 get으로 읽는다
  const plain = { get: async (o, r) => (r === "a" ? "data:image/png,1" : null) };
  assert.deepEqual(await readDoc(plain, "o", "a"), { ok: true, data: "data:image/png,1" });
  // 저장소가 예외를 던져도 실패로 돌려준다
  assert.deepEqual(await readDoc({ getSafe: async () => { throw new Error("x"); } }, "o", "a"), { ok: false, data: null });
});

test("과정 기록: 꾸려서 규칙에 맞는 문자열로 담고 다시 읽는다", async () => {
  const pts = [];
  for (let i = 0; i < 300; i++) pts.push(100 + i * 2.25, 200 + Math.sin(i / 7) * 40, 0.2 + 0.6 * ((i % 10) / 10));
  const ops = [
    { kind: "new", w: 1500, h: 1000, paper: "white", id: 1, name: "레이어 1", t: 1 },
    { kind: "stroke", tool: "pencil", color: "#111111", size: 4, opacity: 0.9, b: { pSize: 0.4, pOp: 0.8, taper: 0 }, g: 1, seed: 123, pts, tl: pts.filter((_, i) => i % 3 === 0).map(() => 0.5), layers: [1], t: 2, _pre: { 1: {} }, _act: 1 },
    { kind: "text", text: "정면 시점 1:10\n둘째 줄", x: 10, y: 20, size: 44, font: "sans", color: "#111111", opacity: 1, layers: [1], t: 3 },
    { kind: "shape", shape: "poly", pts: [10, 10, 200, 10, 100, 150], closed: true, color: "#D63A2F", size: 3, opacity: 1, dash: "solid", fill: false, layers: [1], t: 4, sel: { parts: [{ type: "rect", x: 0, y: 0, w: 50, h: 50, mode: "add" }], inv: false, _mask: { big: 1 }, _arr: new Uint8Array(4) } },
    { kind: "transform", m: [1, 0, 0, 1, 12.5, -3.25], smooth: true, layers: [1], t: 5 },
  ];
  const packed = LOG_PREFIX + packLog(ops);
  assert.ok(ruleOk(packed), "과정 기록 문자열이 media 규칙을 지킨다(줄바꿈이 든 글자 작업 포함)");
  assert.ok(!packed.includes("\n"));
  const back = unpackLog(packed.slice(LOG_PREFIX.length));
  assert.equal(back.length, ops.length);
  assert.equal(back[1].pts.length, pts.length);
  for (let i = 0; i < pts.length; i += 3) { assert.ok(Math.abs(back[1].pts[i] - pts[i]) <= 0.25); assert.ok(Math.abs(back[1].pts[i + 2] - pts[i + 2]) <= 0.005); }
  assert.equal(back[1]._pre, undefined, "메모리 전용 속성은 빠진다");
  assert.equal(back[1]._act, undefined);
  assert.equal(back[2].text, "정면 시점 1:10\n둘째 줄");
  assert.deepEqual(back[3].pts, [10, 10, 200, 10, 100, 150], "다각형 꼭짓점은 필압으로 잘리지 않는다");
  assert.equal(back[3].sel._mask, undefined);
  assert.deepEqual(back[3].sel.parts[0], { type: "rect", x: 0, y: 0, w: 50, h: 50, mode: "add" });
  assert.deepEqual(back[4].m, [1, 0, 0, 1, 12.5, -3.25]);
  assert.deepEqual(unpackLog("깨진 문자열"), []);

  const st = fakeStore();
  const parts = await putParts(st, "20999", "s4c.sketchpad.9.log", packed);
  const got = await fetchLog(st, "20999", { parts, n: ops.length });
  assert.equal(got.length, ops.length);
  assert.deepEqual(await fetchLog(st, "20999", null), []);
  assert.deepEqual(await fetchLog(st, "20999", { parts: [{ ref: "없음" }] }), []);
  assert.deepEqual(await fetchLog(fakeStore({ failGet: () => true }), "20999", { parts }), []);
});

test("refsOf: 저장 값 안의 media 참조를 모두 모은다(합친 그림·레이어 조각·과정 기록·저장 버전)", () => {
  const val = {
    ref: "s.1", at: "2026-10-01T00:00:00.000Z", w: 1500, h: 1000,
    layers: [{ id: 1, name: "레이어 1", parts: [{ ref: "s.1.L1" }] }, { id: 2, parts: [{ ref: "s.1.L2.p0" }, { ref: "s.1.L2.p1" }] }, { ref: "옛.L0" }],
    log: { parts: [{ ref: "s.1.log" }], n: 3 },
    versions: [{ ref: "s.0", at: "x" }, null],
    guide: { kind: "persp2", vp: [{ x: 1, y: 2 }, { x: 3, y: 4 }] },
  };
  assert.deepEqual(refsOf(val).sort(), ["s.0", "s.1", "s.1.L1", "s.1.L2.p0", "s.1.L2.p1", "s.1.log", "옛.L0"].sort());
  assert.deepEqual(refsOf(""), []);
  assert.deepEqual(refsOf(null), []);
  assert.deepEqual(refsOf({ ref: "" }), []);
});

test("머리말: 과정 기록 머리말이 media 규칙의 형식이다", () => {
  assert.ok(RULE.test(LOG_PREFIX + "[]"));
  assert.ok(PART_MAX + 40 < 1000000);
});
