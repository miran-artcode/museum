// 생성과 다듬기 포트폴리오: 계약·용량·문장 규칙 시험 (spec §2.6, §5.4, §9.1, Appendix A)
// WP0: 계약 모양(내보내기 이름과 서명), 스키마 상수, PSPEC·pOk, ref 도우미, 최대·보통 고정 자료의 용량, 깊이 규칙,
//      실제 구현된 도우미(clean·assertSafe·totalUpd·clipJson·folioBytes·capsCheck·refsIn), 문구 lint, 원문 대조, 소스 검사.
// 고정 자료는 .tmpbuild/folio-harness/fixtures/(git에 올리지 않는 하네스 폴더)에 있다. 없으면 그 시험은 건너뛴다.
// WP1·WP1b: 9절에 core 함수 시험(updater, 상속, 프롬프트 몫, 가져오기, 진행률, 내보내기, 경로, 단계 기록, 수정 기록, 분류, 요약, 표기 문장, 확정 전 점검, 표시, 보내기, 휴지통, GC, 병합, 모르는 키, 흔들기).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as S from "./src-folio-schema.mjs";
import * as TX from "./src-portfolio-text.mjs";
import * as PT from "./src-photo-text.mjs";
import * as C from "./src-portfolio-core.mjs";
import * as PX from "./src-photo-px.mjs";
import * as MK from "./src-photo-marks.mjs";
import * as BR from "./src-photo-brush.mjs";
import * as DOC from "./src-photo-doc.mjs";
import * as RN from "./src-photo-render.mjs";
import * as IO from "./src-photo-io.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (f) => fs.readFileSync(path.join(here, f), "utf8").replace(/\r\n/g, "\n");
const bytes = (x) => Buffer.byteLength(JSON.stringify(x));
const FIX = path.join(here, ".tmpbuild", "folio-harness", "fixtures");
const haveFix = fs.existsSync(path.join(FIX, "maximal.mjs")) && fs.existsSync(path.join(FIX, "typical.mjs"));
const fixMod = async (name) => import(pathToFileURL(path.join(FIX, name)).href);
const NO_FIX = haveFix ? false : "fixtures not present (.tmpbuild/folio-harness/fixtures is gitignored)";

/* ---------- verbatim copies from src-app.jsx at HEAD 7311949 (keep in sync; the depth-rule test relies on them) ---------- */
function writtenTextAll(ws) {
  const d = ws || {};
  const out = [];
  const put = (k, v) => { if (typeof v === "string" && v.trim().length >= 10) out.push([k, v]); };
  for (const k in d) {
    if (k.charAt(0) === "_") continue;
    const v = d[k];
    if (typeof v === "string") put(k, v);
    else if (Array.isArray(v)) {
      v.forEach((row, i) => { if (row && typeof row === "object") for (const p in row) put(k + "#" + p + i, row[p]); });
    } else if (v && typeof v === "object") {
      for (const p in v) {
        const x = v[p];
        if (typeof x === "string") put(k + "#" + p, x);
        else if (x && typeof x === "object") for (const q in x) put(k + "#" + p + "." + q, x[q]);
      }
    }
  }
  return out;
}
function collectMediaRefs(ws) {
  const refs = new Set();
  const visit = (v) => {
    if (!v) return;
    if (Array.isArray(v)) return v.forEach(visit);
    if (typeof v === "object") {
      if (typeof v.ref === "string" && v.ref) refs.add(v.ref);
      Object.values(v).forEach(visit);
    }
  };
  Object.entries(ws || {}).forEach(([k, v]) => { if (!k.startsWith("_")) visit(v); });
  ((ws || {})["s5b.rounds"] || []).forEach((r) => { if (r && typeof r.img === "string" && r.img) refs.add(r.img); });
  return [...refs];
}
// src-fb.js (HEAD 7311949): media doc ids are "media:" + safe(owner + "_" + ref)
const safe = (s) => String(s).replace(/[\/\s"'#\[\]*~?:]/g, "_").slice(0, 180);

/* ---------- 1. contract: exports of every new module (spec §5.4) ---------- */
const EXPORTS = {
  "src-folio-schema.mjs": "FOLIO_V KEYS ROUNDS LINES IH TI_ROUND TI_REFLECT TI_NOTES ROUND_CAP REFLECT_CAP NOTE_CAP PROMPT_POOL BUDGET LIMITS STAGES STAGE_NOTE STAGE_FEAT ITEMS KP METHOD HM UK EL ROUTE ROUTE_ITEM HM_ROUTE KINDS TCODE T_RANK ZONE PSPEC pOk ADJ FLT BLENDS WPP OPS EV FEATURES feat CLASS_DEFAULTS GRACE_MS graceMs PRESETS THUMB SNAP OUT CMP SEND MEDIA_RE MEDIA_MAX stamp36 mkRef stampOf isFolioRef uploadTimeout",
  "src-portfolio-text.mjs": "T LINE_LABEL CHECK_LABEL CAUSE_LABEL PW_LABEL NR_LABEL NL_LABEL RM_LABEL CELL_LABEL METHOD_LABEL HM_LABEL UK_LABEL STAGE_TEXT OP_TEXT ADJ_TEXT FLT_TEXT MARK_TEXT WPP_LABEL ITEM_NOUN HELP MISMATCH PHRASE josa countWord lintKo allStrings",
  "src-photo-text.mjs": "TOOL_TEXT OPT_TEXT PANEL_TEXT BLEND_LABEL SHORTCUT_TEXT HIST_TEXT ERR_TEXT tooltip histLabel photoStrings",
  "src-portfolio-core.mjs": "normSteps normNotes normEdit normTrash migrate FolioShapeError clean assertSafe totalUpd utf8Len jsonBytes fnv32 clipJson folioBytes capsCheck compactEdit effRound seedFor startRound setRoundText setPromptLine pastePrompt setRoundCode addImage replaceImage removeImage setThumb chooseImage setSkip setReflect bumpHelp promptLines changedLines roundState roundDone reflectDone baseChoice indicators setNote acceptDraft copyDraft effPhrase defaultImportMap importPlan importRound folioProgress folioUnits routeInit routedStages stageRecUpdate appendLog classifyOp summarize opLines buildPhrases phraseGaps finalizeCheck flags sendPlan fmtArea fmtPrint folioMediaN confirmEdit releaseEdit markSent rebaseEdit refsIn liveRefs trashRefs addTrash dropTrash gcPlan mergeManifest editDiffRefs",
  "src-photo-px.mjs": "lutIdentity lutCompose bcLut levelsLut curveLut exposureLut adjLuts adjFn bake3D apply3D applyLuts mixAdjusted psSat vibrance hueSat colorBalance bwMix photoFilter lum setLum autoLevels greyPointCurves histogram stats gaussRGBA gaussPlane unsharp addNoise vignette shadowsHighlights wand backgroundMask objectBox maskCombine maskFeather maskGrow maskInvert maskFillHoles maskBBox maskCoverage maskClusters maskEdges discOverlap isBinaryish rleEncode rleDecode tipAlpha dodgeBurnLut spongeFn traceFn poissonBlend diffuseInpaint spotSource straightenAngle autoCropScale rotatedBounds cropForRatio diffMask alignSearch dHash hamming lightLinesMeet mulberry32",
  "src-photo-marks.mjs": "GREY20 CHART24 scaleBarSpec suggestBarCm markBox autoPlace drawMark drawText hitMarks textLines ensureFont FONT",
  "src-photo-brush.mjs": "BrushEngine TOOL_TARGET",
  "src-photo-doc.mjs": "makeGfx makeMemGfx PhotoDoc History pixCmd propCmd structCmd selCmd multiCmd TILE",
  "src-photo-render.mjs": "Renderer",
  "src-photo-io.mjs": "encodeJpeg encodePng encodeImage encodeGrey encodeJob encodeThumb decodeImage imageDims assertMedia putMedia latePut mediaCache getSaver Saver drafts currentSid tabLock watchAuthForDrafts devId",
  "src-folio-ui.jsx": "NoteField PfConfirm Seg PfNav PfViewer WipeSlider CompareView ProcessSlides IconBtn Range Status FOLIO_UI_CSS",
  "src-portfolio.jsx": "folioProgress folioUnits folioDirty folioGate FolioPad FolioRead FolioBoundary PortfolioStyle",
  "src-photo.jsx": "PE_CSS PhotoEditor",
  "src-photo-panels.jsx": "PE_PANELS_CSS CheckPanel PatchPanel CropPanel TonePanel FixPanel MarkPanel FinalPanel LayersPanel PropsPanel LevelsWidget CurvesWidget HistoryPanel InfoPanel ComparePanel",
};
const MODS = { "src-folio-schema.mjs": S, "src-portfolio-text.mjs": TX, "src-photo-text.mjs": PT, "src-portfolio-core.mjs": C, "src-photo-px.mjs": PX,
  "src-photo-marks.mjs": MK, "src-photo-brush.mjs": BR, "src-photo-doc.mjs": DOC, "src-photo-render.mjs": RN, "src-photo-io.mjs": IO };
const jsxExports = (code) => {
  const out = new Set();
  for (const m of code.matchAll(/^export\s+(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)) out.add(m[1]);
  for (const m of code.matchAll(/^export\s*\{([^}]*)\}/gm)) m[1].split(",").forEach((x) => { const n = x.trim().split(/\s+as\s+/).pop(); if (n) out.add(n); });
  return out;
};

test("contract: every module exports exactly the §5.4 names (plus logged additions)", () => {
  for (const [f, list] of Object.entries(EXPORTS)) {
    const want = list.split(/\s+/);
    const have = MODS[f] ? new Set(Object.keys(MODS[f])) : jsxExports(src(f));
    const missing = want.filter((n) => !have.has(n));
    assert.deepEqual(missing, [], f + " is missing " + missing.join(", "));
  }
});

test("contract: class methods and function arity of the engine stubs", () => {
  const has = (o, names, what) => names.split(" ").forEach((n) => assert.ok(n in o, what + "." + n));
  has(DOC.PhotoDoc.prototype, "on off addLayer ensureLayer importPatch duplicate remove move setActive setProp mergeDown addMask deleteMask invertMask setSelection selectAll deselect invertSelection featherSelection growSelection setGeo setPins setLines setRoute beginEdit undo redo canUndo canRedo list jumpTo stageMark stageMarkAvailable undoToStageMark stageChanged toManifest projectedBytes dirtyJobs draftJobs jobCanvas applyDraft markSaved memoryBytes dispose", "PhotoDoc");
  assert.equal(typeof DOC.PhotoDoc.fromManifest, "function");
  has(DOC.History.prototype, "push undo redo jumpTo list logDeltas markLogged", "History");
  has(RN.Renderer.prototype, "outSize baseToOut outToBase geoMatrix ppc setViewOverride invalidate freeCaches below composite renderDisplay outProxy exportImage coverage layerStats stats histogram sample", "Renderer");
  has(IO.Saver.prototype, "save observe attach detach noteChange writeDraftNow state busy pending reset", "Saver");
  has(BR.BrushEngine.prototype, "begin add end cancel setSource active", "BrushEngine");
  has(IO.drafts, "usable get put del hasUnsaved addPending takePending purgeOthers purgeAll purgeOld", "drafts");
  has(IO.mediaCache, "get drop", "mediaCache");
  // arity of a few signatures that callers depend on (positional parameters before any default)
  assert.equal(S.pOk.length, 3); assert.equal(S.mkRef.length, 4); assert.equal(C.capsCheck.length, 3); assert.equal(C.mergeManifest.length, 3);
  assert.equal(C.addTrash.length, 3); assert.equal(C.routeInit.length, 3); assert.equal(C.classifyOp.length, 3);
});

/* ---------- 2. schema constants ---------- */
test("schema: budget and limits are consistent (§2.6)", () => {
  const B = S.BUDGET;
  assert.equal(B.steps + B.notes + B.edit + B.trash, B.total);
  assert.equal(B.total, 32768);
  assert.equal(S.LIMITS.editStruct, B.edit - 576, "editStruct leaves room for eight log entries");
  assert.equal(S.PROMPT_POOL, 1560);
  assert.equal(S.TI_ROUND.length, 20); assert.equal(S.TI_REFLECT.length, 10); assert.equal(S.TI_NOTES.length, 12);
  for (const caps of [S.ROUND_CAP, S.REFLECT_CAP, S.NOTE_CAP]) for (const [k, v] of Object.entries(caps)) assert.equal(v % 3, 0, k + " cap holds whole Hangul characters");
  assert.equal(S.PROMPT_POOL % 3, 0);
  assert.equal(S.LIMITS.zones.txt <= S.LIMITS.zones.mark, true);
  assert.equal(S.GRACE_MS, 30 * 60 * 1000);
});

test("schema: stage, item, kind and op tables agree", () => {
  assert.deepEqual(Object.keys(S.STAGE_NOTE), S.STAGES);
  assert.deepEqual(Object.keys(TX.STAGE_TEXT), S.STAGES);
  assert.deepEqual(Object.keys(S.KP), S.ITEMS);
  S.TI_NOTES.forEach((k) => assert.ok(k in S.NOTE_CAP, k));
  Object.values(S.KP).forEach((k) => assert.ok(k in S.NOTE_CAP, k));
  Object.values(S.STAGE_NOTE).forEach((k) => assert.ok(k in S.NOTE_CAP, k));
  for (const tbl of [S.ROUTE, S.HM_ROUTE]) Object.values(tbl).flat().forEach((st) => assert.ok(S.STAGES.includes(st), st));
  for (const [it, m] of Object.entries(S.ROUTE_ITEM)) { assert.ok(S.ITEMS.includes(it)); Object.values(m).flat().forEach((st) => assert.ok(S.STAGES.includes(st))); }
  Object.keys(S.STAGE_FEAT).forEach((st) => assert.ok(S.STAGES.includes(st)));
  assert.deepEqual(Object.keys(S.ZONE).sort(), [...S.KINDS].sort());
  assert.deepEqual(Object.keys(S.ADJ).sort(), [...S.TCODE.adj].sort());
  assert.deepEqual(Object.keys(S.FLT).sort(), [...S.TCODE.flt].sort());
  Object.keys(S.T_RANK).forEach((t) => assert.ok(S.TCODE.px.includes(t)));
  assert.equal(S.BLENDS.length, 17);
  assert.equal(PT.BLEND_LABEL.length, S.BLENDS.length);
  for (const [op, o] of Object.entries(S.OPS)) {
    assert.ok(o.st === null || S.STAGES.includes(o.st), op + " stage");
    assert.ok(o.lv >= 0 && o.lv <= 5, op + " level");
    assert.ok(Object.values(S.WPP).includes(o.w), op + " class");
    assert.ok(op in TX.OP_TEXT, op + " has a name");
  }
  [...S.TCODE.adj, ...S.TCODE.flt, ...S.TCODE.ov, "spot", "clone", "heal", "sponge", "bsb", "shb", "trace", "txt", "patch"].forEach((t) => assert.ok(t in S.OPS, t + " is an op"));
  assert.equal(TX.WPP_LABEL.length, Object.keys(S.WPP).length);
  assert.equal(TX.METHOD_LABEL.length, Object.keys(S.METHOD).length);
  assert.equal(TX.HM_LABEL.length, Object.keys(S.HM).length);
  assert.equal(TX.UK_LABEL.length, Object.keys(S.UK).length);
  assert.deepEqual(Object.values(S.IH), [1, 2, 4, 8, 16, 32, 64, 128, 256]);
  assert.equal(S.CP.jd, 512); assert.equal(S.CP.nx, 1024);
});

test("schema: PSPEC covers every kind and t", () => {
  for (const k of S.KINDS) {
    const codes = S.TCODE[k];
    if (codes) codes.forEach((t) => assert.ok(S.specOf(k, t) || k === "px", k + "/" + t));
    else assert.ok(S.specOf(k, "_"), k);
  }
  assert.ok(S.specOf("px", 0), "px has the shared empty spec");
});

/* ---------- 3. pOk ---------- */
const widest = (spec) => {
  const len = (x) => JSON.stringify(x).length;
  const wi = (r) => (len(r.min) >= len(r.max) ? r.min : r.max);
  if (spec === "rgb") return [255, 255, 255];
  if (spec === "pts") { const a = [0, 255]; for (let i = 1; i < 13; i++) a.push(100 + i * 10, 255); a.push(255, 255); return a; }
  if (spec.enum) return spec.enum.reduce((a, b) => (len(b) > len(a) ? b : a));
  if (spec.tup) return spec.tup.map(wi);
  if (spec.flat) { const a = []; for (let i = 0; i < spec.max / 2; i++) a.push(i === 0 ? 0 : 100 + i, 255); return a; }
  if (spec.str) return "가".repeat(Math.min(spec.str.chars, Math.floor(spec.str.bytes / 3)));
  return wi(spec);
};
test("pOk: a generated parameter set of every kind and t at its PSPEC bound passes", () => {
  for (const [kind, byT] of Object.entries(S.PSPEC)) for (const [t, sp] of Object.entries(byT)) {
    let keys = Object.keys(sp.keys);
    if (kind === "adj" && t === "cv") keys = ["md", "l"];                         // one channel of 14 points
    if (kind === "adj" && t === "hs") keys = ["a", "r", "y", "g", "c", "cz"];      // five ranges + 색상화
    const p = {};
    keys.forEach((k) => { p[k] = widest(sp.keys[k]); });
    if (!keys.length) { assert.equal(S.pOk(kind, t === "_" ? undefined : t, undefined), true, kind + " without p"); continue; }
    assert.ok(bytes(p) <= sp.bound, `${kind}/${t} widest ${bytes(p)} B > bound ${sp.bound}`);
    assert.equal(S.pOk(kind, t, p), true, `${kind}/${t} ${JSON.stringify(p)}`);
    // numeric indexes work the same as names
    assert.equal(S.pOk(S.KINDS.indexOf(kind), S.TCODE[kind] ? S.TCODE[kind].indexOf(t) : undefined, p), true);
  }
});
test("pOk: rejects unknown keys, out-of-range values, non-integers, list and byte violations", () => {
  assert.equal(S.pOk("adj", "bc", { b: 151 }), false);
  assert.equal(S.pOk("adj", "bc", { b: 1.5 }), false);
  assert.equal(S.pOk("adj", "bc", { q: 1 }), false);
  assert.equal(S.pOk("adj", "bc", [1]), false);
  assert.equal(S.pOk("adj", "bc", {}), true);
  assert.equal(S.pOk("tr", undefined, {}), false, "tr requires pr");
  assert.equal(S.pOk("tr", undefined, { pr: 2 }), true);
  assert.equal(S.pOk("adj", "cv", { l: [5, 0, 255, 255] }), false, "x0 must be 0");
  assert.equal(S.pOk("adj", "cv", { l: [0, 0, 100, 50, 90, 60, 255, 255] }), false, "x strictly increasing");
  const pts = (n) => { const a = [0, 0]; for (let i = 1; i < n - 1; i++) a.push(i * 10, i); a.push(255, 255); return a; };
  assert.equal(S.pOk("adj", "cv", { l: pts(14), r: pts(3) }), false, "17 points in all");
  assert.equal(S.pOk("adj", "cv", { l: pts(15) }), false, "15 points in one channel");
  assert.equal(S.pOk("adj", "hs", { a: [0, 0, 0], r: [0, 0, 0], y: [0, 0, 0], g: [0, 0, 0], c: [0, 0, 0], b: [0, 0, 0] }), false, "six ranges");
  assert.equal(S.pOk("txt", undefined, { s: "가\n나\n다\n라" }), false, "four lines");
  assert.equal(S.pOk("txt", undefined, { s: "가".repeat(61) }), false, "61 characters");
  assert.equal(S.pOk("ov", "tg", { s: "x".repeat(21) }), false);
  assert.equal(S.pOk("nope", "bc", {}), false);
});

/* ---------- 4. refs, stamps, flags ---------- */
test("refs: stamp36/stampOf round trip, mkRef rules, isFolioRef, safe() leaves refs unchanged", () => {
  const ms = 1790123456789;
  const st = S.stamp36(ms);
  assert.equal(st.length, 8);
  assert.equal(S.stamp36(Date.UTC(2059, 0, 1)).length, 8);
  const r = S.mkRef(S.KEYS.steps, "ra", st);
  assert.equal(r, "s6f.steps.ra." + st);
  assert.equal(S.stampOf(r), ms);
  assert.equal(S.stampOf(S.mkRef(S.KEYS.edit, "L1234", st, "t3")), ms);
  assert.equal(S.stampOf("s6a.afterImg.1790123456789"), 1790123456789);
  assert.equal(S.stampOf("nothing"), 0);
  assert.throws(() => S.mkRef(S.KEYS.steps, "r a", st));
  assert.throws(() => S.mkRef(S.KEYS.steps, "ra", "x".repeat(60)));
  assert.throws(() => S.mkRef(S.KEYS.steps, "", st));
  assert.ok(S.isFolioRef(r)); assert.ok(!S.isFolioRef("s6f.notes.x")); assert.ok(!S.isFolioRef("s6a.afterImg.1"));
  const longest = S.mkRef(S.KEYS.edit, "L9999", st, "t3");
  assert.ok(longest.length <= 60);
  assert.equal(safe("20999_" + longest), "20999_" + longest);
  assert.equal(S.uploadTimeout(900000), 15000 + 22500);
  assert.equal(S.uploadTimeout(0), 15000);
});
test("flags: feat() and graceMs() read the harness override", () => {
  const prev = globalThis.__PHX_TEST__;
  try {
    delete globalThis.__PHX_TEST__;
    assert.equal(S.feat("editor"), S.FEATURES.editor);
    assert.equal(S.graceMs(), S.GRACE_MS);
    globalThis.__PHX_TEST__ = { features: { editor: true }, graceMs: 0 };
    assert.equal(S.feat("editor"), true);
    assert.equal(S.feat("trace"), S.FEATURES.trace);
    assert.equal(S.graceMs(), 0);
    const rs = C.routedStages(null, null, S.feat);
    assert.equal(rs.patch.hidden, !S.feat("patch"));
  } finally { if (prev === undefined) delete globalThis.__PHX_TEST__; else globalThis.__PHX_TEST__ = prev; }
  // 수업에는 편집기의 모든 과정을 켠 상태로 내보낸다 (2026-10-01 결정, contract-log U24)
  for (const k of ["editor", "patch", "fix", "all", "trace"]) assert.equal(S.FEATURES[k], true, k + " ships on");
});

/* ---------- 5. real helpers in core ---------- */
test("core: clean, assertSafe, totalUpd", () => {
  assert.deepEqual(C.clean({ a: undefined, b: { c: undefined, d: NaN, e: [1, Infinity] } }), { b: { d: 0, e: [1, 0] } });
  assert.throws(() => C.clean({ a: [[1]] }), (e) => e instanceof C.FolioShapeError && e.path === "a[0]");
  assert.throws(() => C.clean({ a: new Uint8Array(2) }), C.FolioShapeError);
  assert.throws(() => C.clean({ a: new Date() }), C.FolioShapeError);
  assert.throws(() => C.clean({ a: new Map() }), C.FolioShapeError);
  assert.throws(() => C.clean({ "": 1 }), C.FolioShapeError);
  assert.throws(() => C.clean({ __x__: 1 }), C.FolioShapeError);
  assert.equal(C.assertSafe({ a: [1, { b: "x" }] }), "");
  assert.match(C.assertSafe({ a: { b: undefined } }), /a\.b: undefined/);
  assert.match(C.assertSafe({ a: [[1]] }), /array inside an array/);
  const cur = { v: 1 };
  assert.equal(C.totalUpd(() => { throw new Error("x"); })(cur), cur);
  assert.equal(C.totalUpd(() => ({ a: [[1]] }))(cur), cur);
  assert.deepEqual(C.totalUpd((c) => ({ ...c, w: 2 }))(cur), { v: 1, w: 2 });
  // fuzz: 500 random objects → clean → same JSON round trip and assertSafe clean
  const r = PX.mulberry32(7);
  const rnd = (d) => {
    const x = r();
    if (d > 3 || x < 0.3) return [() => "s" + Math.floor(r() * 100), () => r() * 10, () => NaN, () => undefined, () => null, () => r() < 0.5][Math.floor(r() * 6)]();
    if (x < 0.6) return Array.from({ length: Math.floor(r() * 4) }, () => (r() < 0.3 ? { k: rnd(d + 1) } : rnd(d + 2)));
    const o = {}; for (let i = 0; i < 3; i++) o["k" + i] = rnd(d + 1); return o;
  };
  for (let i = 0; i < 500; i++) {
    let v = rnd(0), c;
    try { c = C.clean(v); } catch (e) { assert.ok(e instanceof C.FolioShapeError); continue; }
    if (c === undefined) continue;   // undefined at the root: nothing to write
    assert.equal(C.assertSafe(c), "", JSON.stringify(c));
      assert.deepEqual(JSON.parse(JSON.stringify(c)), c);
  }
});
test("core: utf8Len, jsonBytes, fnv32, clipJson", () => {
  assert.equal(C.utf8Len("a가😀"), 1 + 3 + 4);
  assert.equal(C.jsonBytes({ a: "가" }), 11);
  assert.equal(C.fnv32(""), 2166136261);
  assert.equal(C.fnv32("a"), 3826002220);
  assert.equal(C.clipJson("가나다", 6), "가나");
  assert.equal(C.clipJson("ab\"c", 3), "ab");      // the quote costs 2 bytes when escaped
  assert.equal(C.clipJson("a😀b", 4), "a");          // no split surrogate
  assert.equal(C.clipJson("a😀b", 5), "a😀");
  assert.equal(C.clipJson("short", 100), "short");
});
test("core: folioBytes and capsCheck (trash never refuses)", () => {
  const ws = { "s6f.steps": { v: 1 }, "s6f.trash": { v: 1, b: [] } };
  const b = C.folioBytes(ws, { "s6f.notes": { v: 1 } });
  assert.equal(b.steps, 7); assert.equal(b.notes, 7); assert.equal(b.edit, 0); assert.equal(b.trash, 14); assert.equal(b.total, 28);
  assert.equal(C.capsCheck(ws, "s6f.steps", { v: 1, x: "a".repeat(S.BUDGET.steps) }), "s6f.steps");
  assert.equal(C.capsCheck(ws, "s6f.trash", { v: 1, x: "a".repeat(40000) }), "");
  assert.equal(C.capsCheck(ws, "s6f.notes", { v: 1 }), "");
});
test("core: fmtArea and fmtPrint", () => {
  assert.equal(C.fmtArea(24), "화면의 약 2.4%");
  assert.equal(C.fmtArea(3), "화면의 1% 미만");
  assert.equal(C.fmtPrint(1600, 2000, { ppi: 240 }), "1600×2000px, 인쇄하면 약 16.9×21.2cm");
});

/* ---------- 6. fixtures: budget, depth rule, refs ---------- */
test("budget: the maximal fixture meets every cap (§2.6)", { skip: NO_FIX }, async () => {
  const M = await fixMod("maximal.mjs");
  const ws = M.maximal();
  const b = C.folioBytes(ws);
  const struct = bytes(M.maximalEdit());
  assert.ok(b.steps <= S.BUDGET.steps, `steps ${b.steps}`);
  assert.ok(b.notes <= S.BUDGET.notes, `notes ${b.notes}`);
  assert.ok(struct <= S.LIMITS.editStruct, `edit structure ${struct}`);
  assert.ok(b.edit <= S.BUDGET.edit, `edit with ${M.MAX_LOG_N} log entries ${b.edit}`);
  assert.ok(b.trash <= S.BUDGET.trash, `trash ${b.trash}`);
  assert.ok(b.total <= S.BUDGET.total, `total ${b.total}`);
  assert.ok(bytes(M.maximalEditMissing()) <= S.BUDGET.edit, "ms:1 on every media layer still fits the key");
  ["s6f.steps", "s6f.notes", "s6f.edit"].forEach((k) => assert.equal(C.capsCheck(ws, k, ws[k]), "", k));
  console.log(`# maximal: steps ${b.steps}/${S.BUDGET.steps}, notes ${b.notes}/${S.BUDGET.notes}, edit structure ${struct}/${S.LIMITS.editStruct}, edit ${b.edit}/${S.BUDGET.edit}, trash ${b.trash}/${S.BUDGET.trash}, total ${b.total}/${S.BUDGET.total}`);
});
test("budget: the maximal fixture is really maximal (lists, zones, refs, parameters)", { skip: NO_FIX }, async () => {
  const M = await fixMod("maximal.mjs");
  const ws = M.maximal();
  const st = ws["s6f.steps"], e = ws["s6f.edit"], tr = ws["s6f.trash"];
  S.ROUNDS.forEach((r) => { assert.equal(st[r].im.length, S.LIMITS.imgPerRound); S.LINES.forEach((k) => assert.ok(st[r][k].length > 0)); });
  S.ROUNDS.forEach((r) => assert.equal(C.utf8Len([...S.LINES, "po"].map((k) => st[r][k]).join("")), S.PROMPT_POOL));
  assert.equal(st.old.length, S.LIMITS.old);
  const zone = (k) => e.L.filter((L) => S.KINDS[L.k] === k).length;
  assert.equal(zone("ai"), S.LIMITS.zones.ai); assert.equal(zone("px"), S.LIMITS.zones.px); assert.equal(zone("tr"), 1); assert.equal(zone("db"), 1);
  assert.equal(zone("adj") + zone("flt"), S.LIMITS.zones.adjflt); assert.equal(zone("txt"), S.LIMITS.zones.txt);
  assert.equal(zone("txt") + zone("ov"), S.LIMITS.zones.mark);
  assert.equal(e.L.filter((L) => L.c && L.c.parts).length, S.LIMITS.tiledPlanes);
  e.L.forEach((L) => { if (L.p) assert.equal(S.pOk(L.k, L.t, L.p), true, "layer " + L.id); });
  e.L.forEach((L) => { if (L.nm) assert.equal([...L.nm].length, S.LIMITS.nmChars); });
  assert.equal(C.refsIn(e).length, 42, "42 media refs in the manifest");
  assert.equal(e.pins.length, S.LIMITS.pins); assert.equal(e.lines.length, S.LIMITS.lines); assert.equal(e.snaps.length, S.LIMITS.snaps);
  assert.equal(e.ev.length, S.LIMITS.ev); assert.equal(e.log.length, M.MAX_LOG_N);
  assert.equal(C.refsIn(tr).length, S.LIMITS.trashMax); assert.equal(tr.b.length, S.LIMITS.trashBatches);
  C.refsIn(ws).forEach((r) => { assert.ok(S.isFolioRef(r), r); assert.ok(r.length <= 60); assert.equal(safe("20999_" + r), "20999_" + r); });
  assert.equal(C.assertSafe(ws), "");
  assert.deepEqual(C.clean(ws), ws);
});
test("budget: the typical fixture stays under the target (§2.6)", { skip: NO_FIX }, async () => {
  const T = await fixMod("typical.mjs");
  const ws = T.typical();
  const b = C.folioBytes(ws);
  assert.ok(b.total <= S.BUDGET.target, `typical total ${b.total}`);
  assert.equal(C.assertSafe(ws), "");
  ws["s6f.edit"].L.forEach((L) => assert.equal(S.pOk(L.k, L.t, L.p), true, "layer " + L.id));
  console.log(`# typical: total ${b.total}/${S.BUDGET.target}`);
});
test("depth rule: writtenTextAll sees student text only (steps and notes), never edit or trash", { skip: NO_FIX }, async () => {
  const M = await fixMod("maximal.mjs"), T = await fixMod("typical.mjs");
  for (const ws of [M.maximal(), T.typical()]) {
    const paths = writtenTextAll(ws).map(([k]) => k);
    assert.ok(paths.length > 0);
    paths.forEach((p) => assert.match(p, /^s6f\.(steps|notes)#/, p));
    assert.ok(!paths.some((p) => /^s6f\.(edit|trash)/.test(p)));
    paths.filter((p) => p.startsWith("s6f.steps#")).forEach((p) => assert.match(p, /^s6f\.steps#(ra|rb|rc|rv)\.[a-zA-Z]+$/, p));
    // property names are letters only, so subLabel never reads a row number
    paths.forEach((p) => assert.ok(!/[a-zA-Z]\d+$/.test(p.split(".").pop()), p));
  }
  const M2 = M.maximal();
  const paths = new Set(writtenTextAll(M2).map(([k]) => k));
  ["s6f.steps#ra.aim", "s6f.steps#rb.pc", "s6f.steps#rv.look", "s6f.notes#stTone"].forEach((p) => assert.ok(paths.has(p), p));
});
test("refs: refsIn equals collectMediaRefs, liveRefs excludes the trash, editDiffRefs", { skip: NO_FIX }, async () => {
  const M = await fixMod("maximal.mjs"), T = await fixMod("typical.mjs");
  for (const ws of [M.maximal(), T.typical()]) {
    assert.deepEqual(new Set(C.refsIn(ws)), new Set(collectMediaRefs(ws)));
    const live = C.liveRefs(ws);
    C.refsIn(ws["s6f.trash"]).forEach((r) => assert.ok(!live.has(r) || C.refsIn(ws["s6f.steps"]).includes(r) || C.refsIn(ws["s6f.edit"]).includes(r)));
    assert.equal(live.size, new Set([...C.refsIn(ws["s6f.steps"]), ...C.refsIn(ws["s6f.notes"]), ...C.refsIn(ws["s6f.edit"])]).size);
  }
  const e = M.maximalEdit(), e2 = M.maximalEdit();
  e2.L = e2.L.slice(1);
  assert.deepEqual(C.editDiffRefs(e, e2), C.refsIn(e.L[0]));
});

/* ---------- 7. Korean strings ---------- */
test("text: lintKo passes every string of both tables", () => {
  const bad = [...TX.allStrings(), ...PT.photoStrings()].map((s) => [s, TX.lintKo(s)]).filter(([, v]) => v.length);
  assert.deepEqual(bad, []);
  assert.ok(TX.allStrings().length > 300);
  assert.ok(PT.photoStrings().length > 200);
});
test("text: lintKo catches each rule of Appendix A", () => {
  const hits = {
    [["가로 ", " 세로"].join(String.fromCharCode(0x2014))]: "줄표", "단추를 누르세요": "단추", "손잡이를 끌어": "손잡이", "켜집니다": "켜집니다·켜기·끄기", "상단 띠": "띠",
    "화면 낭독기": "화면 낭독기", "다녀간 횟수": "다녀간", "굳히기": "굳히·굳은·굳다", "잔가지 함수": "잔가지", "누구의 자리에서": "자리",
    "기록을 남긴다": "남기·남는", "물음": "물음", "낱말": "낱말", "되묻기": "되묻기", "네가 쓴 답": "네가·네 답", "보여지는": "이중 피동",
    "AI에 의한": "번역투", "보정": "보정", "단계 3": "단계 n", "AI로 만들었습니다": "AI 문구", "이라고 치면": "비유·구어",
  };
  for (const [s, rule] of Object.entries(hits)) assert.ok(TX.lintKo(s).includes(rule), s + " → " + rule);
  ["가장자리 밝기", "빈자리를 장식으로", "손수레 손잡이 파편", "문손잡이", "다섯 단계", "보이기·숨기기", "되돌리기"].forEach((s) => assert.deepEqual(TX.lintKo(s), [], s));
  assert.deepEqual(TX.lintKo("아름다운 결과"), []);
  assert.deepEqual(TX.lintKo("아름다운 결과", { phrase: true }), ["칭찬 형용사"]);
});
test("text: josa and countWord", () => {
  assert.equal(TX.josa("빛과 그림자", "을/를"), "빛과 그림자를");
  assert.equal(TX.josa("마모 흔적", "을/를"), "마모 흔적을");
  assert.equal(TX.josa("‘지움’", "이/가"), "‘지움’이");
  assert.equal(TX.josa("두 번째 그림자", "은/는"), "두 번째 그림자는");
  assert.equal(TX.josa("화면 편집", "으로/로"), "화면 편집으로");
  assert.equal(TX.josa("손질", "으로/로"), "손질로");
  assert.equal(TX.josa("부분 수정", "으로/로"), "부분 수정으로");
  assert.equal(TX.josa("3", "을/를"), "3을");
  assert.equal(TX.josa("5cm", "을/를"), "5cm를");
  assert.equal(TX.josa("A", "과/와"), "A와");
  assert.deepEqual([2, 3, 4, 5, 6].map(TX.countWord), ["두", "세", "네", "다섯", "여섯"]);
});
test("text: MISMATCH rows occur verbatim in src-lessons.jsx", () => {
  const lessons = src("src-lessons.jsx");
  assert.ok(lessons.includes(JSON.stringify(TX.MISMATCH.heads).replace(/","/g, "\", \"")), "heads");
  TX.MISMATCH.rows.forEach((row) => assert.ok(lessons.includes(JSON.stringify(row).replace(/","/g, "\", \"")), row[0]));
});
test("text: copied app labels still match src-app.jsx (INSPECT_ITEMS, FIX_OPTS, s4c.checks, s6a/s6b labels)", () => {
  const app = src("src-app.jsx");
  for (const [k, label] of Object.entries(TX.ITEM_LABEL)) assert.ok(app.includes(`{ k: "${k}", label: "${label}"`), k);
  const fix = app.match(/const FIX_OPTS = (\[[^\]]*\]);/);
  assert.ok(fix, "FIX_OPTS");
  JSON.parse(fix[1]).forEach((o) => assert.ok(TX.METHOD_LABEL.includes(o), o));
  assert.ok(app.includes(`opts: ${JSON.stringify(TX.CHECK_LABEL).replace(/","/g, "\", \"")}`), "s4c.checks labels");
  assert.ok(app.includes(`label: "${TX.STAGE_TEXT.final.note}"`), "stFinal label equals s6a.diff");
});
test("text: tooltip, histLabel and imgPreset", () => {
  assert.equal(PT.tooltip("spot"), "먼지와 긁힘 지우기 (J) · Photoshop: 스팟 복구 브러시");
  assert.equal(PT.tooltip("fitObj"), "사물에 맞춰 자르기");
  assert.equal(PT.histLabel({ lk: "clone" }), "복제 도장");
  assert.equal(PT.histLabel({ lk: "adjNew:lv", ln: 1 }), "레벨 1 만들기");
  assert.equal(PT.histLabel({ lk: "unknownKey" }), "unknownKey");
  Object.keys(PT.ERR_TEXT).forEach((k) => assert.ok(["limit", "memory", "locked", "aspect", "base", "missing", "size", "patchPx"].includes(k)));
  for (const k of Object.keys(S.PRESETS)) {
    const p = TX.imgPreset(k);
    ["maxPx", "maxChars", "minLong", "minShort", "name"].forEach((f) => assert.ok(p[f], k + "." + f));
    assert.ok(p.maxChars < S.MEDIA_MAX);
  }
});

/* ---------- 8. source scan of the new files ---------- */
const NEW_FILES = ["src-folio-schema.mjs", "src-portfolio-text.mjs", "src-photo-text.mjs", "src-portfolio-core.mjs", "src-folio-ui.jsx", "src-portfolio.jsx",
  "src-photo-px.mjs", "src-photo-marks.mjs", "src-photo-brush.mjs", "src-photo-doc.mjs", "src-photo-render.mjs", "src-photo-io.mjs", "src-photo.jsx", "src-photo-panels.jsx"];
const TEXT_FILES = new Set(["src-portfolio-text.mjs", "src-photo-text.mjs"]);
/** code with comments removed (strings, template literals and regex literals kept) */
function stripComments(code) {
  let out = "", i = 0, prev = "";
  const regexOk = () => /[(,=:[!&|?{};+\-*%<>~^]$|^$|\breturn$|\btypeof$/.test(out.trimEnd());
  while (i < code.length) {
    const c = code[i], d = code[i + 1];
    if (c === "/" && d === "/") { while (i < code.length && code[i] !== "\n") i++; continue; }
    if (c === "/" && d === "*") { const j = code.indexOf("*/", i + 2); i = j < 0 ? code.length : j + 2; out += " "; continue; }
    if (c === "\"" || c === "'" || c === "`") {
      let j = i + 1;
      while (j < code.length && code[j] !== c) { if (code[j] === "\\") j++; j++; }
      out += code.slice(i, j + 1); i = j + 1; continue;
    }
    if (c === "/" && regexOk()) {
      let j = i + 1, cls = false;
      while (j < code.length && (cls || code[j] !== "/") && code[j] !== "\n") { if (code[j] === "\\") j++; else if (code[j] === "[") cls = true; else if (code[j] === "]") cls = false; j++; }
      out += code.slice(i, j + 1); i = j + 1; continue;
    }
    out += c; prev = c; i++;
  }
  void prev;
  return out;
}
test("source: no Hangul outside comments except in the two text modules; no placeholder attribute", () => {
  for (const f of NEW_FILES) {
    const code = stripComments(src(f));
    if (!TEXT_FILES.has(f)) {
      const m = code.match(/[ㄱ-ㆎ가-힣]+/);
      assert.equal(m, null, f + " has Hangul outside comments: " + (m && code.slice(Math.max(0, m.index - 40), m.index + 20)));
    }
    assert.ok(!/\bplaceholder\s*=/.test(code), f + " has a placeholder attribute");
  }
});
test("source: import rules (no src-app.jsx, no src-sketch*, src-fb.js only from src-portfolio.jsx)", () => {
  for (const f of NEW_FILES) {
    const code = src(f);
    const imports = [...code.matchAll(/^import[^;]*?from\s+"([^"]+)"/gm)].map((m) => m[1]);
    imports.forEach((p) => {
      assert.ok(!/src-app/.test(p), f + " imports " + p);
      assert.ok(!/src-sketch/.test(p), f + " imports " + p);
      if (/src-fb/.test(p)) { assert.equal(f, "src-portfolio.jsx", f + " imports src-fb"); assert.equal(p, "./src-fb.js"); }
      if (p.startsWith("./")) assert.ok(fs.existsSync(path.join(here, p)), f + " imports a missing file " + p);
    });
  }
});

/* ---------- 9. core functions (WP1, WP1b; spec §9.1) ---------- */
const NOW = 1791000000;                                  // epoch s used by the updater tests
const NOW_MS = Date.UTC(2026, 9, 15, 3, 0, 0);           // 2026-10-15 12:00 KST: the month is the same in every time zone used here
const img = (r, n, sg = "0123456789abcdef") => ({ ref: S.mkRef(S.KEYS.steps, r, S.stamp36(1790000000000 + n * 1000)), w: 1600, h: 1200, sg, th: { ref: S.mkRef(S.KEYS.steps, r, S.stamp36(1790000000000 + n * 1000), "th") } });
const L_ = (id, kind, t, extra = {}) => ({ id, k: S.KINDS.indexOf(kind), ...(t != null ? { t: S.TCODE[kind].indexOf(t) } : {}), ...extra });
const it1 = (item) => S.ITEMS.indexOf(item) + 1;
const ER = (role, part) => S.mkRef(S.KEYS.edit, role, S.stamp36(1790000000000), part);
/** a started round (st = NOW) through the real updaters */
const started = (r, cur) => C.startRound(cur, r, null, NOW);
const withFlags = (features, fn) => {
  const prev = globalThis.__PHX_TEST__;
  try { globalThis.__PHX_TEST__ = { features }; return fn(); } finally { if (prev === undefined) delete globalThis.__PHX_TEST__; else globalThis.__PHX_TEST__ = prev; }
};

test("norm*: defaults and coercion; migrate v > 1 is read-only and updaters then write nothing", () => {
  const s = C.normSteps(undefined);
  for (const r of S.ROUNDS) {
    assert.equal(s[r].ci, -1); assert.deepEqual(s[r].ck, [0, 0, 0, 0]); assert.equal(s[r].ti.length, 20); assert.ok(s[r].ti.every((x) => x === 0));
    assert.equal(s[r].ih, 0); assert.equal(s[r].cp, 0); assert.deepEqual(s[r].im, []); assert.equal(s[r].aim, "");
  }
  assert.equal(s.rv.base, -1); assert.equal(s.rv.ti.length, 10); assert.deepEqual(s.old, []);
  assert.deepEqual(C.normSteps("garbage"), s);
  const g = C.normSteps({ ra: { aim: 5, im: [{ ref: 1 }, { ref: "s6f.steps.ra.x", th: "bad" }, null], ci: 7, ck: [3, 1], el: 9, cz: 2.5, nl: -1, ti: [5, "x"] }, rv: { base: 0, near: 9 } });
  assert.equal(g.ra.aim, ""); assert.equal(g.ra.im.length, 1); assert.equal(g.ra.im[0].th, null); assert.equal(g.ra.ci, -1);
  assert.deepEqual(g.ra.ck, [0, 1, 0, 0]); assert.equal(g.ra.el, 0); assert.equal(g.ra.cz, 0); assert.equal(g.ra.nl, 0); assert.equal(g.ra.ti[0], 5); assert.equal(g.ra.ti[1], 0);
  assert.equal(g.rv.base, 0); assert.equal(g.rv.near, 0);
  const n = C.normNotes([1, 2]);
  Object.keys(S.NOTE_CAP).forEach((k) => assert.equal(n[k], ""));
  assert.equal(n.rm, 0); assert.deepEqual(n.pd, { phScope: 0, phMaking: 0 }); assert.deepEqual(n.ti, {});
  assert.deepEqual(C.normNotes({ rm: 7, pd: { phScope: -1, phMaking: 5 }, ti: { stTone: 9, zz: 1 } }).pd, { phScope: 0, phMaking: 5 });
  assert.equal(C.normEdit(null), null); assert.equal(C.normEdit("x"), null); assert.equal(C.normEdit([]), null);
  const e = C.normEdit({ zz: 1, L: [{ id: 3, k: 42, q: { ref: "s6f.edit.L3.abc" } }, { id: 4, k: 4, t: 0, p: { b: 999 } }, { id: 5, k: 6, p: { s: "글" } }] });
  assert.equal(e.zz, 1, "unknown top-level keys kept");
  assert.deepEqual(e.L[0], { id: 3, k: 42, q: { ref: "s6f.edit.L3.abc" } }, "unknown kind kept verbatim");
  assert.equal(e.L[1].p, null, "a p that fails pOk is dropped"); assert.equal(e.L[1].op, 100); assert.equal(e.L[1].vis, 1);
  assert.deepEqual(e.L[2].p, { s: "글" });
  assert.deepEqual(e.route, { s: Array(8).fill(0), m: Array(8).fill(0), o: Array(8).fill(0) });
  assert.equal(e.done, null); assert.deepEqual(e.sent, { s6a: 0, s6b: 0, s7x: 0 }); assert.deepEqual(e.pr, { mode: 1, paper: 0, bw: 0, ppi: 240 });
  assert.deepEqual(e.m, { base: null, out: null, cmp: null }); assert.equal(e.nid, 6);
  assert.deepEqual(C.normTrash({ b: [{ t: 5, x: 1, q: [{ ref: "a" }, { ref: 3 }, "b"] }, "junk"] }), { v: 1, b: [{ t: 5, q: [{ ref: "a" }], x: 1 }] });
  assert.deepEqual(C.migrate({ v: 2 }), { v: { v: 2 }, readOnly: true });
  assert.equal(C.migrate({ v: 1 }).readOnly, false); assert.equal(C.migrate(undefined).readOnly, false);
  const newer = { v: 2, ra: { aim: "x", st: 1 } };
  assert.equal(C.setRoundText(newer, "ra", "aim", "y", NOW), newer);
  assert.equal(C.setNote({ v: 2 }, "stTone", "y", NOW).stTone, undefined);
  assert.equal(C.addTrash({ v: 1, b: [] }, [], NOW).b.length, 0);
  const ne = { v: 2, rev: 1 };
  assert.equal(C.mergeManifest(ne, { L: [] }, { dev: 1, sv: 2, nowMs: 3 }), ne);
  assert.equal(C.confirmEdit(ne, 1, 1), ne);
});
test("norm*: fixtures normalise without loss of the stored values", { skip: NO_FIX }, async () => {
  const M = await fixMod("maximal.mjs"), TY = await fixMod("typical.mjs");
  for (const ws of [M.maximal(), TY.typical()]) {
    const st = ws["s6f.steps"], s = C.normSteps(st);
    S.ROUNDS.forEach((r) => { [...S.LINES, "aim", "jd", "nx"].forEach((k) => assert.equal(s[r][k], st[r][k] || "")); assert.equal(s[r].im.length, st[r].im.length); });
    const e = C.normEdit(ws["s6f.edit"]);
    assert.equal(e.L.length, ws["s6f.edit"].L.length);
    e.L.forEach((L, i) => { if (ws["s6f.edit"].L[i].p) assert.deepEqual(L.p, ws["s6f.edit"].L[i].p); });
    assert.equal(C.normTrash(ws["s6f.trash"]).b.length, ws["s6f.trash"].b.length);
  }
});

test("startRound: round 1 fills only empty cells from the seed (cp bits); rounds 2–3 copy nothing; seedFor order", () => {
  const ws = {
    "s5a.tool": "", "s5d.selNo": "2회차",
    "s5b.rounds": [{ tool: "A", prompt: "one\ntwo" }, { tool: "B", prompt: "① 무엇인가: grip\n② wear\n⑥ no glow" }, { tool: "C", prompt: "last" }],
  };
  const seed = C.seedFor(undefined, ws);
  assert.equal(seed.tool, "B"); assert.deepEqual(seed.lines, ["grip", "wear", "", "", "", "no glow"]); assert.equal(seed.po, ""); assert.equal(seed.clipped, false);
  assert.equal(C.seedFor(undefined, { ...ws, "s5a.tool": "S5A" }).tool, "S5A", "s5a.tool first");
  assert.equal(C.seedFor(undefined, { ...ws, "s5d.selNo": "네 번째" }).tool, "C", "no digits: the last round with a tool");
  assert.deepEqual(C.seedFor(undefined, { ...ws, "s5d.selNo": "" }).lines.slice(0, 1), ["last"]);
  let cur = C.setPromptLine(undefined, "ra", 1, "mine", NOW).value;    // pb already written by the student
  cur = C.startRound(cur, "ra", seed, NOW);
  const ra = cur.ra;
  assert.equal(ra.st, NOW); assert.equal(ra.pa, "grip"); assert.equal(ra.pb, "mine", "a filled cell is kept"); assert.equal(ra.pf, "no glow"); assert.equal(ra.tool, "B");
  assert.equal(ra.cp, S.CP.pa | S.CP.pf | S.CP.tool);
  assert.ok(ra.ti.every((x) => x === 0), "copies never set first-input times");
  assert.equal(C.startRound(cur, "ra", { tool: "X", lines: ["z"] }, NOW + 5), cur, "a started round is not seeded again");
  const rb = C.startRound(cur, "rb", seed, NOW + 10).rb;
  assert.equal(rb.st, NOW + 10); S.LINES.forEach((k) => assert.equal(rb[k], "")); assert.equal(rb.tool, ""); assert.equal(rb.cp, 0);
  assert.equal(C.effRound(C.startRound(cur, "rb", seed, NOW + 10), "rb").pa, "grip", "rounds 2–3 inherit instead");
  // the seed is clipped to the free pool
  const big = C.seedFor(undefined, { "s5b.rounds": [{ prompt: "가".repeat(600) }] });
  assert.equal(big.clipped, true); assert.equal(C.utf8Len(big.lines[0]), S.PROMPT_POOL);
});

test("setRoundText: ti once as a clamped offset, ih bit, cp bit cleared, el rules", () => {
  let cur = started("ra");
  cur = C.setRoundText(cur, "ra", "aim", "노린 것", NOW + 40);
  assert.equal(cur.ra.ti[S.TI_ROUND.indexOf("aim")], 40);
  cur = C.setRoundText(cur, "ra", "aim", "노린 것을 고침", NOW + 90);
  assert.equal(cur.ra.ti[S.TI_ROUND.indexOf("aim")], 40, "written once");
  assert.equal(C.setRoundText(cur, "ra", "seen", "본 것", NOW + 5000000).ra.ti[S.TI_ROUND.indexOf("seen")], S.LIMITS.tiMax);
  assert.equal(C.setRoundText(cur, "ra", "seen", "본 것", NOW - 50).ra.ti[S.TI_ROUND.indexOf("seen")], 1);
  assert.equal(C.setRoundText(cur, "ra", "seen", "   ", NOW + 9).ra.ti[S.TI_ROUND.indexOf("seen")], 0, "blank text sets no time");
  assert.equal(C.setRoundText(undefined, "ra", "aim", "x", NOW).ra.ti[0], 0, "no time before the round starts");
  assert.equal(C.setRoundText(cur, "ra", "aim", "가".repeat(200), NOW).ra.aim.length, S.ROUND_CAP.aim / 3, "clipped to the byte cap");
  assert.equal(C.setRoundText(cur, "ra", "tool", "a\nb", NOW).ra.tool, "a b", "inputs are one line");
  assert.equal(C.setRoundText(cur, "ra", "nope", "x", NOW), cur);
  assert.equal(C.setRoundText(cur, "rc", "nw", "x", NOW), cur, "rc has no 방향 바꾸기");
  // ih in rounds 2–3, never in round 1
  let c2 = started("rb", cur);
  c2 = C.setRoundText(c2, "rb", "tool", "니지", NOW + 3);
  assert.equal(c2.rb.ih, S.IH.tool); assert.equal(c2.ra.ih, 0);
  assert.equal(C.setRoundText(c2, "rb", "aim", "", NOW).rb.ih, S.IH.tool | S.IH.aim, "an emptied inherited field keeps its bit");
  // cp cleared on edit
  const seeded = C.startRound(undefined, "ra", { tool: "MJ", lines: ["a", "", "", "", "", ""], po: "" }, NOW);
  assert.equal(seeded.ra.cp, S.CP.pa | S.CP.tool);
  assert.equal(C.setRoundText(seeded, "ra", "tool", "MJ v7", NOW).ra.cp, S.CP.pa);
  // el: exp written before the first image is locked by addImage (el 2) and then refused
  let e1 = C.setRoundText(started("rb"), "rb", "exp", "예상", NOW + 1);
  assert.equal(e1.rb.el, 0);
  e1 = C.addImage(e1, "rb", img("rb", 1), NOW + 2).value;
  assert.equal(e1.rb.el, 2);
  assert.equal(C.setRoundText(e1, "rb", "exp", "고친 예상", NOW + 3), e1, "exp is read-only while el 2");
  // exp emptied before the first image stays editable; text typed after the image sets el 1
  let e2 = C.setRoundText(C.setRoundText(started("rb"), "rb", "exp", "예상", NOW), "rb", "exp", "", NOW + 1);
  e2 = C.addImage(e2, "rb", img("rb", 2), NOW + 2).value;
  assert.equal(e2.rb.el, 0);
  e2 = C.setRoundText(e2, "rb", "exp", "본 뒤 예상", NOW + 3);
  assert.equal(e2.rb.el, 1); assert.equal(e2.rb.exp, "본 뒤 예상");
  assert.equal(C.setRoundText(e2, "rb", "exp", "또 고침", NOW + 4).rb.el, 1);
});

test("setPromptLine/pastePrompt within the pool: 600 kept whole, 1,700 clipped, six-line paste spreads", () => {
  const cur = started("ra");
  const en600 = "a".repeat(600), en1700 = "b".repeat(1700);
  const p1 = C.pastePrompt(cur, "ra", 0, en600, NOW);
  assert.equal(p1.value.ra.pa, en600); assert.equal(p1.clipped, false); assert.equal(p1.spread, false);
  const p2 = C.pastePrompt(cur, "ra", 0, en1700, NOW);
  assert.equal(p2.clipped, true); assert.equal(p2.value.ra.pa.length, S.PROMPT_POOL);
  const p3 = C.setPromptLine(p1.value, "ra", 1, en1700, NOW);
  assert.equal(p3.clipped, true); assert.equal(p3.value.ra.pb.length, S.PROMPT_POOL - 600, "the pool is shared by the lines");
  assert.equal(C.setPromptLine(cur, "ra", 2, "x\ny", NOW).value.ra.pc, "x y", "a line break becomes a space");
  assert.deepEqual(C.setPromptLine(cur, "ra", 7, "x", NOW), { value: cur, clipped: false });
  const six = ["one", "two", "three", "four", "five", "six"].join("\n");
  const sp = C.pastePrompt(cur, "ra", 2, six, NOW + 7);
  assert.equal(sp.spread, true); assert.equal(sp.clipped, false);
  assert.deepEqual(S.LINES.map((k) => sp.value.ra[k]), ["one", "two", "three", "four", "five", "six"]);
  assert.equal(sp.value.ra.ti[S.TI_ROUND.indexOf("pa")], 7);
  // fill-only-empty: an occupied line keeps its text and the displaced part goes to 그 밖에
  const occ = C.setPromptLine(cur, "ra", 0, "mine", NOW).value;
  const sp2 = C.pastePrompt(occ, "ra", 1, "① first\n② second", NOW);
  assert.equal(sp2.value.ra.pa, "mine"); assert.equal(sp2.value.ra.pb, "second"); assert.equal(sp2.value.ra.po, "first");
  // a paste into a non-empty line is a normal edit (no spread)
  const np = C.pastePrompt(occ, "ra", 0, "mine\nmore", NOW);
  assert.equal(np.spread, false); assert.equal(np.value.ra.pa, "mine more");
  // round 2: lines inherited from round 1 are not empty; writing a line sets its ih bit
  const r2 = C.setPromptLine(started("rb", sp.value), "rb", 3, "changed four", NOW).value;
  assert.equal(r2.rb.ih, S.IH.pd); assert.equal(C.effRound(r2, "rb").pa, "one");
});

test("addImage refuses a fifth image; replaceImage/removeImage move thumbnails to old; chooseImage; setThumb", () => {
  let cur = C.setRoundText(started("ra"), "ra", "exp", "예상", NOW);
  for (let i = 0; i < 4; i++) { const r = C.addImage(cur, "ra", img("ra", i), NOW + i); assert.equal(r.ok, true); cur = r.value; }
  assert.equal(cur.ra.ci, 0, "the first image is chosen"); assert.equal(cur.ra.el, 2);
  assert.equal(cur.ra.ti[S.TI_ROUND.indexOf("im")], 0 + 1, "first upload time, clamped to 1");
  assert.deepEqual(C.addImage(cur, "ra", img("ra", 9), NOW), { value: cur, ok: false });
  assert.deepEqual(C.addImage(cur, "ra", img("ra", 2), NOW), { value: cur, ok: true }, "the same ref twice is idempotent");
  assert.equal(C.addImage(cur, "ra", { ref: "" }, NOW).ok, false);
  cur = C.chooseImage(cur, "ra", 2, NOW);
  assert.equal(cur.ra.ci, 2);
  const rp = C.replaceImage(cur, "ra", 2, img("ra", 20), NOW);
  assert.equal(rp.value.ra.ci, 2); assert.equal(rp.value.ra.im[2].ref, img("ra", 20).ref);
  assert.equal(rp.oldMain, img("ra", 2).ref); assert.deepEqual(rp.oldThumb, img("ra", 2).th);
  assert.deepEqual(rp.value.old, [{ th: img("ra", 2).th, r: 0 }]); assert.deepEqual(rp.trashThumbs, []);
  assert.equal(C.replaceImage(rp.value, "ra", img("ra", 20).ref, img("ra", 20), NOW).value, rp.value, "replacing with the same ref is a no-op");
  // old keeps four thumbnails; the oldest beyond four comes back for the trash
  let v = rp.value;
  const dropped = [];
  for (let i = 0; i < 4; i++) { const r = C.replaceImage(v, "ra", 0, img("ra", 30 + i), NOW); v = r.value; dropped.push(...r.trashThumbs); }
  assert.equal(v.old.length, S.LIMITS.old); assert.deepEqual(dropped, [img("ra", 2).th.ref]);
  // remove: the chosen image deleted with two left → none chosen; by ref; with one left → it is chosen
  const rm = C.removeImage(v, "ra", 2, NOW);
  assert.equal(rm.value.ra.im.length, 3); assert.equal(rm.value.ra.ci, -1); assert.equal(rm.oldMain, img("ra", 20).ref);
  const rm2 = C.removeImage(C.chooseImage(rm.value, "ra", 2, NOW), "ra", rm.value.ra.im[0].ref, NOW);
  assert.equal(rm2.value.ra.ci, 1, "an index after the removed one shifts");
  const one = C.removeImage(C.removeImage(rm2.value, "ra", 0, NOW).value, "ra", 0, NOW).value;
  assert.equal(one.ra.im.length, 0); assert.equal(one.ra.ci, -1);
  assert.equal(C.chooseImage(rm.value, "ra", 9, NOW), rm.value); assert.equal(C.chooseImage(rm.value, "ra", -1, NOW).ra.ci, -1);
  // thumbnail repair sets th only where it is null
  const noTh = C.addImage(started("rb"), "rb", { ...img("rb", 1), th: null }, NOW).value;
  const fixed = C.setThumb(noTh, "rb", img("rb", 1).ref, { ref: "s6f.steps.rb.x.th" });
  assert.deepEqual(fixed.rb.im[0].th, { ref: "s6f.steps.rb.x.th" });
  assert.equal(C.setThumb(fixed, "rb", img("rb", 1).ref, { ref: "s6f.steps.rb.y.th" }), fixed);
});

test("promptLines: markers, newlines, ' / ', names with colons, rest, pool clipping", () => {
  assert.deepEqual(C.promptLines("① a\n② b\n⑥ f"), { lines: ["a", "b", "", "", "", "f"], rest: "", clipped: false });
  assert.deepEqual(C.promptLines("intro ①무엇인가: a ③ c ⑦ g ⑧ h").lines, ["a", "", "c", "", "", ""]);
  assert.equal(C.promptLines("intro ①무엇인가: a ③ c ⑦ g ⑧ h").rest, "intro / g / h");
  assert.deepEqual(C.promptLines("a\nb\n\nc").lines, ["a", "b", "c", "", "", ""]);
  assert.deepEqual(C.promptLines("a / b / c").lines, ["a", "b", "c", "", "", ""]);
  assert.deepEqual(C.promptLines("무엇인가: grip\n사용 흔적 : wear\n금지 조건：no glow").lines, ["grip", "wear", "no glow", "", "", ""]);
  const many = C.promptLines("1\n2\n3\n4\n5\n6\n7\n8");
  assert.deepEqual(many.lines, ["1", "2", "3", "4", "5", "6"]); assert.equal(many.rest, "7 / 8");
  const cl = C.promptLines("aaaa\nbbbb\ncccc", 6);
  assert.deepEqual(cl.lines.slice(0, 3), ["aaaa", "bb", ""]); assert.equal(cl.clipped, true);
  assert.equal(C.promptLines("aaaa\nbbbb", 100).clipped, false);
  assert.deepEqual(C.promptLines(""), { lines: ["", "", "", "", "", ""], rest: "", clipped: false });
});

test("effRound inheritance incl. skipped rounds and emptied lines; changedLines on effective lines", () => {
  let cur = started("ra");
  ["p1", "p2", "p3", "p4", "p5", "p6"].forEach((t, i) => { cur = C.setPromptLine(cur, "ra", i, t, NOW).value; });
  cur = C.setRoundText(C.setRoundText(cur, "ra", "tool", "MJ", NOW), "ra", "nx", "next of ra", NOW);
  cur = started("rb", cur);
  let rb = C.effRound(cur, "rb");
  assert.equal(rb.pa, "p1"); assert.equal(rb.tool, "MJ"); assert.equal(rb.aim, "next of ra", "aim takes the previous nx");
  assert.ok(rb.inh.pa && rb.inh.tool && rb.inh.aim && rb.inh.po);
  assert.equal(cur.rb.pa, "", "nothing is copied");
  cur = C.setPromptLine(cur, "rb", 1, "P2", NOW).value;
  cur = C.setPromptLine(cur, "rb", 4, "", NOW).value;            // removed in this round
  cur = C.setRoundText(cur, "rb", "nx", "next of rb", NOW);
  rb = C.effRound(cur, "rb");
  assert.equal(rb.pb, "P2"); assert.equal(rb.inh.pb, false); assert.equal(rb.pe, ""); assert.equal(rb.inh.pe, false);
  assert.deepEqual(C.changedLines(cur, "rb"), [1, 4]);
  assert.deepEqual(C.changedLines(cur, "ra"), []);
  let rc = C.effRound(cur, "rc");
  assert.equal(rc.pb, "P2"); assert.equal(rc.pe, ""); assert.equal(rc.aim, "next of rb");
  // a skipped round passes its predecessor through
  const sk = C.setSkip(cur, "rb", "시간이 없어서", NOW);
  rc = C.effRound(sk, "rc");
  assert.equal(rc.pb, "p2"); assert.equal(rc.pe, "p5"); assert.equal(rc.aim, "next of ra");
  assert.deepEqual(C.changedLines(sk, "rb"), [], "a skipped round has no changed lines");
  assert.deepEqual(C.changedLines(C.setPromptLine(sk, "rc", 0, "  p1  ", NOW).value, "rc"), [], "whitespace is normalised");
  assert.equal(C.effRound(cur, "zz").aim, "");
  assert.equal(C.setSkip(cur, "ra", "x", NOW), cur, "round 1 cannot be skipped");
});

/** a done round through the real updaters */
function doneRound(cur, r, k = 0) {
  let c = started(r, cur);
  if (r === "ra") { c = C.setRoundText(c, r, "aim", "노린 것", NOW); c = C.setRoundText(c, r, "tool", "MJ", NOW); c = C.setPromptLine(c, r, 0, "line", NOW).value; }
  else { c = C.setRoundText(c, r, "exp", "예상", NOW); c = C.setRoundCode(c, r, "pw", 2, NOW); }
  c = C.addImage(c, r, img(r, k), NOW).value;
  c = C.setRoundText(c, r, "seen", "본 것", NOW);
  c = C.setRoundText(c, r, "jd", "판단", NOW);
  c = C.setRoundCode(c, r, "cz", 3, NOW);
  c = C.setRoundText(c, r, "nx", "다음", NOW);
  c = r === "rc" ? C.setRoundCode(c, r, "hm", 2, NOW) : C.setRoundCode(c, r, "nl", 3, NOW);
  return c;
}
function doneReflect(cur) {
  let c = C.setReflect(C.setReflect(cur, "near", 3, NOW), "far", 1, NOW);
  ["look", "dPr", "dAi", "dHand", "big", "use"].forEach((k) => { c = C.setReflect(c, k, "글", NOW); });
  return c;
}
test("roundDone/reflectDone combinations; folioProgress total 4 for every flag setting", () => {
  let cur = doneRound(undefined, "ra");
  assert.equal(C.roundDone(cur, "ra"), true); assert.equal(C.roundState(cur, "ra"), "done");
  const need = [["aim", ""], ["seen", ""], ["jd", ""], ["nx", ""]];
  need.forEach(([k, v]) => assert.equal(C.roundDone(C.setRoundText(cur, "ra", k, v, NOW), "ra"), false, k));
  assert.equal(C.roundDone(C.setRoundCode(cur, "ra", "cz", 0, NOW), "ra"), false, "cz");
  assert.equal(C.roundDone(C.setRoundCode(cur, "ra", "nl", 0, NOW), "ra"), false, "nl");
  assert.equal(C.roundDone(C.setRoundCode(cur, "ra", "nl", 7, NOW), "ra"), false, "nl 7 needs nw");
  assert.equal(C.roundDone(C.setRoundText(C.setRoundCode(cur, "ra", "nl", 7, NOW), "ra", "nw", "이유", NOW), "ra"), true);
  assert.equal(C.roundDone(C.chooseImage(cur, "ra", -1, NOW), "ra"), false, "a chosen image");
  assert.equal(C.roundDone(C.setPromptLine(cur, "ra", 0, "", NOW).value, "ra"), false, "at least one line");
  // round 2 with inherited aim, tool and lines; exp and pw required
  cur = doneRound(cur, "rb", 1);
  assert.equal(C.roundDone(cur, "rb"), true, "inherited aim, tool and lines count");
  assert.equal(C.roundDone(C.setRoundCode(cur, "rb", "pw", 0, NOW), "rb"), false);
  assert.equal(C.roundDone(C.setRoundText(cur, "rb", "aim", "", NOW), "rb"), false, "an emptied inherited aim");
  // round 3 needs hm instead of nl
  cur = doneRound(cur, "rc", 2);
  assert.equal(C.roundDone(cur, "rc"), true); assert.equal(C.roundDone(C.setRoundCode(cur, "rc", "hm", 0, NOW), "rc"), false);
  assert.equal(C.setRoundCode(cur, "rc", "nl", 1, NOW), cur, "nl is for rounds 1–2"); assert.equal(C.setRoundCode(cur, "ra", "hm", 1, NOW), cur);
  assert.equal(C.setRoundCode(cur, "ra", "pw", 1, NOW), cur); assert.equal(C.setRoundCode(cur, "ra", "uk", 4, NOW), cur);
  assert.equal(C.setRoundCode(cur, "ra", "uk", 3, NOW).ra.uk, 3); assert.equal(TX.UK_LABEL.length, 4); assert.equal(TX.HM_LABEL.length, 5);
  assert.equal(C.setRoundCode(cur, "ra", "ck2", 2, NOW).ra.ck[2], 2); assert.equal(C.setRoundCode(cur, "ra", "ck4", 1, NOW), cur);
  // skipped rounds: done with ≥ 2 characters
  const sk = C.setSkip(C.setRoundText(started("rb", doneRound(undefined, "ra")), "rb", "aim", "x", NOW), "rb", "x", NOW);
  assert.equal(C.roundDone(sk, "rb"), false); assert.equal(C.roundState(sk, "rb"), "part");
  const sk2 = C.setSkip(sk, "rb", "시간", NOW);
  assert.equal(C.roundDone(sk2, "rb"), true); assert.equal(C.roundState(sk2, "rb"), "skip");
  assert.equal(C.roundState(undefined, "rc"), "empty"); assert.equal(C.roundState(started("rc"), "rc"), "part");
  // reflection
  let rv = doneReflect(cur);
  assert.equal(C.reflectDone(rv), true);
  ["look", "dPr", "dAi", "dHand", "big", "use"].forEach((k) => assert.equal(C.reflectDone(C.setReflect(rv, k, "", NOW)), false, k));
  assert.equal(C.reflectDone(C.setReflect(rv, "far", 0, NOW)), false);
  assert.equal(C.reflectDone(C.setReflect(rv, "base", 2, NOW)), true, "the default round needs no reason");
  assert.equal(C.reflectDone(C.setReflect(rv, "base", 0, NOW)), false, "another round needs baseWhy");
  assert.equal(C.reflectDone(C.setReflect(C.setReflect(rv, "base", 0, NOW), "baseWhy", "이유", NOW)), true);
  // folioProgress: total 4 whatever the flags
  for (const features of [{ editor: false }, { editor: true, patch: false, fix: false }, { editor: true, patch: true, fix: true, all: true }]) {
    withFlags(features, () => {
      assert.deepEqual(C.folioProgress({ part: "steps" }, rv), { total: 4, done: 4 });
      assert.deepEqual(C.folioProgress({ part: "steps" }, undefined), { total: 4, done: 0 });
      ["edit", "notes", "trash"].forEach((p) => assert.deepEqual(C.folioProgress({ part: p }, rv), { total: 0, done: 0 }));
    });
  }
});

test("baseChoice default/override/skipped/no image; defaultImportMap and importRound", () => {
  assert.equal(C.baseChoice(undefined), null);
  let cur = doneRound(doneRound(doneRound(undefined, "ra"), "rb", 1), "rc", 2);
  assert.deepEqual(C.baseChoice(cur), { r: 2, i: 0, img: C.normSteps(cur).rc.im[0], isDefault: true });
  assert.equal(C.baseChoice(C.setReflect(cur, "base", 0, NOW)).r, 0);
  assert.equal(C.baseChoice(C.setReflect(cur, "base", 0, NOW)).isDefault, false);
  assert.equal(C.baseChoice(C.setReflect(cur, "base", 2, NOW)).isDefault, true);
  const skipped = C.setSkip(cur, "rc", "시간", NOW);
  assert.equal(C.baseChoice(skipped).r, 1, "a skipped round is never the base");
  assert.equal(C.baseChoice(C.setReflect(skipped, "base", 2, NOW)).r, 1);
  assert.equal(C.baseChoice(C.chooseImage(cur, "rc", -1, NOW)).r, 1, "a round without a chosen image is passed over");
  assert.equal(C.setReflect(cur, "base", -1, NOW).rv.base, -1, "the Seg's none is −1, never 0");
  // defaultImportMap
  const R = (o) => ({ tool: "", prompt: "", change: "", no: "", judge: "", img: "", ...o });
  const rounds = [R({ tool: "a", img: "s5b.1" }), R({ prompt: "b" }), R({ judge: "c" }), R({ img: "s5b.4" }), R({})];
  assert.deepEqual(C.defaultImportMap(rounds, "4"), [0, 2, 3]);
  assert.deepEqual(C.defaultImportMap(rounds, "4회차"), [0, 2, 3]);
  assert.deepEqual(C.defaultImportMap(rounds, "네 번째"), [0, 2, 3], "fallback: the last round with an image");
  assert.deepEqual(C.defaultImportMap(rounds, "2"), [0, -1, 1]);
  assert.deepEqual(C.defaultImportMap(rounds, "1"), [-1, -1, 0], "chosen = round 1");
  assert.deepEqual(C.defaultImportMap([], ""), [-1, -1, -1]);
  // importPlan / importRound: fill-only-empty, cp and ih bits, from, st, prev nx
  const src = [R({ tool: "MJ", prompt: "① grip\n② wear", judge: "판단 1", change: "고친 것 1", img: "s5b.rounds.1" }), R({ tool: "NJ", prompt: "x / y", judge: "판단 2", change: "고친 것 2", img: "s5b.rounds.2" })];
  const mine = C.setRoundText(started("ra"), "ra", "jd", "내 판단", NOW);
  const plan = C.importPlan(mine, src, [0, 1, -1], { images: true });
  assert.equal(plan.any, true); assert.equal(plan.rows.length, 2);
  assert.deepEqual(plan.rows[0].fill, [TX.T.impCellTool, TX.T.impCellPrompt, TX.T.impCellAim, TX.T.impCellNext, TX.T.impCellImage]);
  assert.equal(plan.rows[0].round, 1); assert.equal(plan.rows[1].r, "rb");
  assert.equal(C.importPlan(mine, src, [0, -1, -1], { images: false }).rows[0].img, false);
  let im = C.importRound(mine, "ra", src[0], 1, NOW + 9);
  im = C.importRound(im, "rb", src[1], 2, NOW + 9, { prevR: "ra" });
  assert.equal(im.ra.jd, "내 판단", "a filled cell is kept"); assert.equal(im.ra.tool, "MJ"); assert.equal(im.ra.pa, "grip"); assert.equal(im.ra.pb, "wear");
  assert.equal(im.ra.aim, "고친 것 1"); assert.equal(im.ra.nx, "고친 것 2", "the next row's change fills nx");
  assert.equal(im.ra.from, 1); assert.equal(im.ra.st, NOW, "st kept when set");
  assert.equal(im.ra.cp, S.CP.tool | S.CP.pa | S.CP.pb | S.CP.aim | S.CP.nx);
  assert.equal(im.rb.st, NOW + 9); assert.equal(im.rb.from, 2); assert.equal(im.rb.tool, "NJ"); assert.equal(im.rb.pa, "x"); assert.equal(im.rb.jd, "판단 2");
  assert.equal(im.rb.ih, S.IH.tool | S.IH.pa | S.IH.pb | S.IH.aim, "imported cells are the round's own values");
  assert.ok(["tool", "pa", "pb", "aim", "nx"].every((k) => im.ra.ti[S.TI_ROUND.indexOf(k)] === 0), "no first-input times for imports");
  assert.ok(im.rb.ti.every((x) => x === 0)); assert.ok(im.ra.ti[S.TI_ROUND.indexOf("jd")] > 0, "the student's own jd keeps its time");
  const long = C.importPlan(undefined, [R({ prompt: "가".repeat(600) })], [0, -1, -1]);
  assert.equal(long.rows[0].clipped, true);
});

test("routeInit with each hm code; routedStages hidden stages", () => {
  const NO = TX.CORE_TEXT.s5cNo, OK = TX.CORE_TEXT.s5cOk;
  const ins = { light: { status: NO, fix: TX.METHOD_LABEL[S.METHOD.screen], note: "" }, structure: { status: OK }, text: { status: NO, fix: "" } };
  const i = (k) => S.ITEMS.indexOf(k);
  const base = C.routeInit(ins, null, undefined);
  assert.equal(base.s[i("light")], 2); assert.equal(base.m[i("light")], S.METHOD.screen); assert.equal(base.o[i("light")], 1);
  assert.equal(base.s[i("structure")], 1); assert.equal(base.s[i("text")], 2); assert.equal(base.m[i("text")], 0);
  const withHm = (hm) => C.routeInit(ins, undefined, C.setRoundCode(started("rc"), "rc", "hm", hm, NOW));
  assert.deepEqual([withHm(1).s[i("cause")], withHm(1).m[i("cause")], withHm(1).o[i("cause")]], [2, S.METHOD.patch, 2]);
  assert.deepEqual([withHm(2).m[i("exhibit")], withHm(2).o[i("exhibit")]], [S.METHOD.screen, 2]);
  assert.deepEqual([withHm(3).m[i("cause")], withHm(3).o[i("cause")]], [S.METHOD.hand, 2]);
  assert.deepEqual(withHm(4), base, "그대로 두기 adds nothing");
  const taken = C.routeInit({ cause: { status: NO, fix: TX.METHOD_LABEL[S.METHOD.regen] } }, null, C.setRoundCode(started("rc"), "rc", "hm", 1, NOW));
  assert.equal(taken.m[i("cause")], S.METHOD.regen, "an item with a method is not overwritten");
  const existing = { s: [1], m: [0], o: [0] };
  assert.equal(C.routeInit(ins, existing, undefined), existing, "seeded once");
  // routedStages
  const route = { s: S.ITEMS.map(() => 0), m: S.ITEMS.map(() => 0), o: S.ITEMS.map(() => 0) };
  const set = (k, m) => { route.s[i(k)] = 2; route.m[i(k)] = m; };
  set("light", S.METHOD.screen); set("scale", S.METHOD.screen); set("misread", S.METHOD.screen); set("exhibit", S.METHOD.screen); set("cause", S.METHOD.hand); set("text", S.METHOD.patch);
  const off = withFlags({ patch: false, fix: false }, () => C.routedStages(route, undefined, S.feat));
  assert.equal(off.tone.n, 2); assert.equal(off.mark.n, 1); assert.equal(off.crop.n, 2);
  assert.deepEqual(off.fix, { n: 0, hidden: true }); assert.deepEqual(off.patch, { n: 0, hidden: true }); assert.equal(off.check.n, 0);
  const on = withFlags({ patch: true, fix: true }, () => C.routedStages(route, undefined, S.feat));
  assert.deepEqual(on.fix, { n: 1, hidden: false }); assert.deepEqual(on.patch, { n: 1, hidden: false });
  const noRoute = C.routedStages(null, C.setRoundCode(started("rc"), "rc", "hm", 2, NOW), () => true);
  assert.equal(noRoute.crop.n, 1); assert.equal(noRoute.tone.n, 1);
});

test("summarize, classifyOp golden cases, flags, stageRecUpdate, appendLog 120 s merge", () => {
  // classifyOp (§7.2 dynamic rules)
  const spot = (mx, cov) => C.classifyOp("spot", { k: 1, t: 0, mx, cov });
  assert.deepEqual(spot(8, 4), { l: 4, w: S.WPP.exc }); assert.deepEqual(spot(12, 4), { l: 4, w: S.WPP.del }); assert.deepEqual(spot(8, 6), { l: 4, w: S.WPP.del });
  assert.deepEqual(C.classifyOp("dodge", { k: 3, po: 1, cov: 10 }), { l: 4, w: S.WPP.alter });
  assert.deepEqual(C.classifyOp("dodge", { k: 3, it: it1("light") }), { l: 4, w: S.WPP.alter });
  assert.deepEqual(C.classifyOp("sponge", { k: 1, it: it1("text") }), { l: 2, w: S.WPP.ok });
  assert.deepEqual(C.classifyOp("gb", { k: 5, mk: { ref: "m" }, cov: 300 }), { l: 4, w: S.WPP.del });
  assert.deepEqual(C.classifyOp("gb", { k: 5, mk: { ref: "m", on: 0 }, cov: 300 }), { l: 2, w: S.WPP.ok }, "a mask switched off is global");
  assert.deepEqual(C.classifyOp("gb", { k: 5, cov: 1000 }), { l: 2, w: S.WPP.ok });
  assert.deepEqual(C.classifyOp("nz", { k: 5, mk: { ref: "m" }, cov: 100 }), { l: 4, w: S.WPP.add });
  assert.deepEqual(C.classifyOp("trace", null), { l: 4, w: S.WPP.add }); assert.deepEqual(C.classifyOp("patch"), { l: 5, w: S.WPP.gen });
  assert.deepEqual(C.classifyOp("nope"), { l: 0, w: S.WPP.na });
  assert.deepEqual(C.classifyOp("spot", 7, { L: [{ id: 7, k: 1, mx: 50, cov: 2 }] }), { l: 4, w: S.WPP.del }, "a layer id is looked up in edit.L");
  // merged clone into spot keeps clone (mergeDown keeps the higher T_RANK) and phrases merge removals of the same target
  assert.ok(S.T_RANK.clone > S.T_RANK.spot);
  assert.equal(C.layerOp(L_(1, "px", "clone")), "clone");
  assert.deepEqual(C.classifyOp(C.layerOp(L_(1, "px", "clone")), L_(1, "px", "clone", { mx: 5, cov: 3 })), { l: 4, w: S.WPP.del });
  // summarize excludes hidden, zero-coverage and unknown layers
  const edit = {
    v: 1, doc: { w: 1000, h: 1000, crop: { x: 0, y: 0, w: 1000, h: 1000 }, r: 0, rot: 0, ext: { t: 0, r: 0, b: 0, l: 0 } },
    L: [L_(1, "px", "clone", { cov: 8, g: 2, it: it1("text") }), L_(2, "px", "heal", { cov: 0 }), L_(3, "px", "spot", { cov: 9, vis: 0 }), L_(4, "adj", "bc", { p: { b: 10 } }),
      L_(5, "adj", "lv", { mk: { ref: "m" }, cov: 0 }), L_(6, "tr", null, { cov: 12, ce: 1, p: { pr: 1 }, po: 2 }), L_(7, "px", "spot", { cov: 4, op: 0 }), { id: 8, k: 42, cov: 99 }],
  };
  assert.deepEqual(C.summarize(edit).map((x) => x.op), ["clone", "bc", "trace"], "a full-frame crop is not a crop");
  assert.deepEqual(C.summarize(null), []);
  // flags: Σ po of px, db and ai layers (tr excluded)
  const fl = C.flags({ "s6f.edit": { ...edit, L: [L_(1, "px", "clone", { cov: 60, po: 2 }), L_(2, "db", null, { cov: 5, po: 1 }), L_(3, "ai", null, { cov: 5, po: 1 }), L_(4, "tr", null, { cov: 30, po: 3, p: { pr: 1 } })] } });
  assert.equal(fl.find((f) => f.k === "pinTouched").text, TX.fmt(TX.T.flagPinTouched, { n: 4 }));
  assert.ok(fl.find((f) => f.k === "traceWide")); assert.ok(fl.find((f) => f.k === "wideRemove"));
  // stageRecUpdate: idle cutoff, ch only for out/plan
  let sr = C.stageRecUpdate(undefined, "fix", "enter", 1000);
  assert.deepEqual(sr, { fix: { t0: 1000, e: 0, d: 0, n: 0 } });
  sr = C.stageRecUpdate(sr, "fix", "tick", 1010);
  assert.deepEqual([sr.fix.d, sr.fix.e], [10, 10]);
  sr = C.stageRecUpdate(sr, "fix", "tick", 1100);
  assert.deepEqual([sr.fix.d, sr.fix.e], [10, 100], "a gap over 60 s adds nothing");
  sr = C.stageRecUpdate(sr, "fix", { commit: "view" }, 1130);
  assert.deepEqual([sr.fix.d, sr.fix.n, sr.fix.ch], [40, 0, undefined], "a selection is not a change");
  sr = C.stageRecUpdate(sr, "fix", "commit", 1140);
  assert.deepEqual([sr.fix.d, sr.fix.n, sr.fix.ch], [50, 1, 1]);
  sr = C.stageRecUpdate(sr, "fix", { commit: "plan" }, 1141);
  assert.equal(sr.fix.n, 2);
  sr = C.stageRecUpdate(sr, "fix", "enter", 5000);
  assert.deepEqual([sr.fix.d, sr.fix.e], [51, 4000], "re-entering marks activity without adding time");
  assert.equal(C.stageRecUpdate(sr, "fix", "skip", 1).fix.sk, 1);
  assert.equal("sk" in C.stageRecUpdate(C.stageRecUpdate(sr, "fix", "skip", 1), "fix", "unskip", 1).fix, false);
  assert.equal(C.stageRecUpdate(sr, "fix", { tries: 3 }, 1), sr, "tries only in patch");
  assert.equal(C.stageRecUpdate(sr, "patch", { tries: 25 }, 1).patch.tr, 20);
  const tone = C.stageRecUpdate(sr, "tone", { tone: { mb: 62, ct: -2000, sa: 1.4, bg: [1, 2, 3, 4, 5, 6, 7, 300] } }, 1).tone;
  assert.deepEqual([tone.mb, tone.ct, tone.sa, tone.bg[7]], [62, -1000, 1, 255]);
  assert.equal(C.stageRecUpdate(sr, "nope", "tick", 1), sr); assert.equal(C.stageRecUpdate(sr, "fix", "dance", 1), sr);
  assert.equal(C.stageRecUpdate({ fix: { t0: 1, e: 0, d: 0, n: 0, zz: 7 } }, "fix", "tick", 2).fix.zz, 7, "unknown keys kept");
  // appendLog: merges into the last entry with the same (s, o, y) within 120 s
  let log = C.appendLog([], { o: "clone", s: "fix", y: 3, n: 2, a: 5 }, 100);
  assert.deepEqual(log, [{ t: 100, s: 4, o: "clone", n: 2, a: 5, l: 4, w: S.WPP.del, y: 3 }]);
  log = C.appendLog(log, { o: "clone", s: "fix", y: 3, n: 3, p: "x".repeat(50) }, 200);
  assert.equal(log.length, 1); assert.deepEqual([log[0].n, log[0].t, log[0].a, log[0].p.length], [5, 200, 5, 40]);
  log = C.appendLog(log, { o: "clone", s: 4, y: 3 }, 400);
  assert.equal(log.length, 2, "more than 120 s later: a new entry"); assert.equal(log[1].n, 1);
  log = C.appendLog(log, { o: "clone", s: 4, y: 9 }, 410);
  assert.equal(log.length, 3, "another layer: a new entry");
  log = C.appendLog(log, { o: "gb", y: 2, l: 4, w: S.WPP.del }, 420);
  assert.deepEqual([log[3].s, log[3].l, log[3].w], [S.STAGES.indexOf("tone"), 4, S.WPP.del], "the op's own stage; given classes win");
  for (let i = 0; i < 30; i++) log = C.appendLog(log, { o: "spot", y: i }, 500 + i);
  assert.equal(log.length, S.LIMITS.log); assert.equal(log[log.length - 1].y, 29);
  assert.equal(C.appendLog(log, { s: 1 }, 1), log, "a delta without op is ignored");
});

/** the demo student 「오른손」 of §7.4 (product names illustrative) */
function demoWs({ withAi = true, aiTool = "어도비 파이어플라이", aiRegion = "그립 광택 범위" } = {}) {
  let st = undefined;
  ["ra", "rb", "rc"].forEach((r, k) => { st = doneRound(st, r, k); });
  st = C.setRoundText(st, "ra", "tool", "미드저니 v7", NOW);
  const route = { s: S.ITEMS.map(() => 0), m: S.ITEMS.map(() => 0), o: S.ITEMS.map(() => 0) };
  route.s[S.ITEMS.indexOf("light")] = 2; route.m[S.ITEMS.indexOf("light")] = S.METHOD.keep;
  route.s[S.ITEMS.indexOf("text")] = 2; route.m[S.ITEMS.indexOf("text")] = S.METHOD.hand;
  const L = [
    ...(withAi ? [L_(1, "ai", null, { cov: 30, mk: { ref: ER("M1") }, c: { ref: ER("L1"), f: 1 } })] : []),
    L_(2, "px", "clone", { cov: 4, g: 1, it: it1("text"), c: { ref: ER("L2"), f: 2 } }),
    L_(3, "tr", null, { cov: 12, ce: 1, p: { pr: 1 }, c: { ref: ER("L3"), f: 2 } }),
    L_(4, "adj", "gp", { cov: 610, mk: { ref: ER("M4") }, p: { tg: 118 } }),
    L_(5, "adj", "bc", { cov: 1000, p: { b: 12 } }),
    L_(6, "ov", "sb", { p: { cm: 50 } }),
  ];
  const edit = {
    v: 1, rev: 3, crev: 2, dev: 11, sv: 22, at: NOW_MS, st: 6, nid: 7, act: 0,
    m: { base: { ref: ER("base"), w: 1600, h: 2000, r: 2, sg: "0123456789abcdef", src: C.normSteps(st).rc.im[0].ref }, out: { ref: ER("out"), w: 1600, h: 2000, q: 92, cr: 2, th: { ref: ER("out", "th") } }, cmp: null },
    doc: { w: 1600, h: 2000, crop: { x: 100, y: 0, w: 1400, h: 2000 }, r: 0, rot: 0, ext: { t: 0, r: 0, b: 0, l: 0 }, fill: [255, 255, 255], out: { w: 1600, h: 2000 }, cal: null },
    L, route, pins: [], lines: [], sr: { tone: { t0: NOW, e: 10, d: 10, n: 2, ch: 1, mb: 62 } }, snaps: [], log: [], ev: [], done: { at: NOW_MS, n: 1, un: 0 },
    sent: { s6a: 0, s6b: 0, s7x: 0 }, pr: { mode: 1, paper: 0, bw: 0, ppi: 240 },
  };
  let notes = C.setNote(C.setNote(undefined, "aiTool", aiTool, NOW), "aiRegion", aiRegion, NOW);
  return {
    "s6f.steps": st, "s6f.notes": notes, "s6f.edit": edit, "s6b.title": "오른손",
    "s5b.rounds": [{ img: "s5b.rounds.1" }, { img: "s5b.rounds.2" }, { img: "s5b.rounds.3" }, { img: "s5b.rounds.4" }, { prompt: "no image" }],
  };
}
const PHRASE_BANNED = ["보정", "AI로 만들었습니다", "AI의 도움을 받았습니다", String.fromCharCode(0x2014)];
test("buildPhrases golden strings incl. josa, ordering, 외 n건, no name in (b), banned words", () => {
  const ws = demoWs();
  const p = C.buildPhrases({ ws, nowMs: NOW_MS });
  const tools = "미드저니 v7 생성(3회), 어도비 파이어플라이 부분 수정(그립 광택 범위, 화면의 약 3%)";
  const hand = "마모 흔적 그려 넣음(화면의 1.2%), 뭉개진 글자 1곳 지움(화면의 0.4%), 스케일 바(5cm) 덧붙임, 배경 회색 맞춤(배경 면적 61%) 외 2건";
  assert.equal(p.a, `「오른손」·(이름)·2026년 10월·${tools} 이미지에 ${hand}, 화면 게시, 1600×2000px`);
  assert.equal(p.b, `${tools} 이미지에 ${hand}`);
  assert.equal(p.c, "프롬프트 여섯 줄을 작성하고 생성 7회 가운데 1점을 고른 뒤, 그립 광택 범위를 부분 수정하고 뭉개진 글자를 지우고 마모 흔적을 그려 넣고 스케일 바를 덧붙이고 밝기·여백을 조정함. 두 번째 그림자는 생성 결과 그대로 둠.");
  // an outside partial edit in R1 (no AI layer, aiTool filled): no area
  const r1 = C.buildPhrases({ ws: demoWs({ withAi: false }), nowMs: NOW_MS });
  assert.ok(r1.b.startsWith("미드저니 v7 생성(3회), 어도비 파이어플라이 부분 수정(그립 광택 범위) 이미지에 "));
  assert.ok(r1.c.includes("그립 광택 범위를 부분 수정하고 "));
  assert.ok(C.buildPhrases({ ws: demoWs({ withAi: false, aiRegion: "" }), nowMs: NOW_MS }).b.startsWith("미드저니 v7 생성(3회), 어도비 파이어플라이 부분 수정 이미지에 "));
  // 을/를 and 은/는 follow the last word
  const ws2 = demoWs({ aiRegion: "그립 끝" });
  assert.ok(C.buildPhrases({ ws: ws2, nowMs: NOW_MS }).c.includes("그립 끝을 부분 수정하고"));
  const e3 = ws["s6f.edit"];
  e3.route.s[S.ITEMS.indexOf("text")] = 2; e3.route.m[S.ITEMS.indexOf("text")] = S.METHOD.keep;
  assert.ok(C.buildPhrases({ ws, nowMs: NOW_MS }).c.endsWith("두 번째 그림자는 생성 결과 그대로 둠. 뭉개진 글자는 생성 결과 그대로 둠."));
  // no hand work at all
  const bare = C.buildPhrases({ ws: { "s6f.steps": demoWs()["s6f.steps"] }, nowMs: NOW_MS });
  assert.equal(bare.b, "미드저니 v7 생성(3회) 이미지에 손질 없음");
  assert.equal(bare.c, "프롬프트 여섯 줄을 작성하고 생성 3회 가운데 1점을 고름.");
  assert.equal(bare.a, `「작품명」·(이름)·2026년 10월·미드저니 v7 생성(3회) 이미지에 손질 없음, 화면 게시, 1600×1200px`);
  // print output
  const pr = demoWs(); pr["s6f.edit"].pr = { mode: 2, paper: 5, bw: 1, ppi: 240 };
  assert.ok(C.buildPhrases({ ws: pr, nowMs: NOW_MS }).a.endsWith("인쇄(A5), 흑백, 약 16.9×21.2cm"));
  // (b) never holds (이름); every generated phrase passes the lint with the praise rule and the banned words of §7.4
  for (const x of [p, r1, bare]) {
    assert.ok(!x.b.includes(TX.PHRASE.nameSlot));
    for (const s of [x.a, x.b, x.c]) { assert.deepEqual(TX.lintKo(s, { phrase: true }), [], s); PHRASE_BANNED.forEach((w) => assert.ok(!s.includes(w), w)); }
  }
});

test("acceptDraft/copyDraft/effPhrase, phraseGaps, finalizeCheck, sendPlan", () => {
  const draft = "미드저니 v7 생성 3회 이미지에 손질 없음";
  // accept stores only a number (depth 2), no first-input time
  const acc = C.acceptDraft(undefined, "phScope", draft);
  assert.deepEqual(acc, { v: 1, pd: { phScope: C.fnv32(draft), phMaking: 0 } });
  assert.deepEqual(writtenTextAll({ "s6f.notes": acc }), []);
  assert.equal(C.acceptDraft(acc, "stTone", draft), acc); assert.equal(C.acceptDraft(acc, "phScope", " "), acc);
  assert.deepEqual(C.effPhrase(acc, "phScope", draft), { text: draft, source: "draft", stale: false });
  assert.deepEqual(C.effPhrase(acc, "phScope", draft + "!"), { text: draft + "!", source: "draft", stale: true });
  assert.deepEqual(C.effPhrase(undefined, "phScope", draft), { text: "", source: "none", stale: false });
  // copy: text and pd, no ti; the student's edits follow; an existing text is not overwritten
  const cp = C.copyDraft(undefined, "phMaking", draft);
  assert.equal(cp.phMaking, draft); assert.equal(cp.pd.phMaking, C.fnv32(draft)); assert.equal(cp.ti, undefined);
  assert.deepEqual(C.effPhrase(cp, "phMaking", draft), { text: draft, source: "own", stale: false });
  assert.equal(C.effPhrase(cp, "phMaking", draft + "!").stale, true, "an unedited copy of an older draft is stale");
  const own = C.setNote(cp, "phMaking", "내가 고친 문장", NOW);
  assert.deepEqual(C.effPhrase(own, "phMaking", draft + "!"), { text: "내가 고친 문장", source: "own", stale: false });
  assert.equal(C.copyDraft(own, "phMaking", "다른 초안").phMaking, "내가 고친 문장");
  assert.equal(own.ti.phMaking, NOW);
  // phraseGaps
  const ws = demoWs();
  const e = ws["s6f.edit"];
  assert.deepEqual(C.phraseGaps(e, C.buildPhrases({ ws, nowMs: NOW_MS }).b), [], "the draft itself has no gap");
  const gaps = C.phraseGaps(e, "어도비 파이어플라이 부분 수정 이미지에 스케일 바 덧붙임");
  assert.ok(gaps.includes("수정 기록에 있는 ‘지움’이 AI 활용 범위 문장에는 없습니다."), gaps.join("|"));
  assert.ok(gaps.includes("수정 기록에 있는 ‘그려 넣음’이 AI 활용 범위 문장에는 없습니다."));
  assert.ok(gaps.some((g) => g.includes("‘조정’")), "level 1–2 categories are checked when nothing is folded into 외 n건");
  const withTools = C.phraseGaps(e, "이미지에 지움 덧붙임 그려 넣음 부분 수정 자름 조정", { steps: ws["s6f.steps"], notes: ws["s6f.notes"] });
  assert.ok(withTools.some((g) => g.includes("‘미드저니 v7’이")), withTools.join("|"));
  assert.deepEqual(C.phraseGaps(e, ""), []);
  // finalizeCheck: empty ws blocks with the export, notes, rm, rf and phrase items
  const empty = C.finalizeCheck({}, {});
  assert.equal(empty.ok, false);
  assert.deepEqual(empty.items.filter((x) => x.block).map((x) => x.k), ["export", "note:final", "rm", "rf", "phScope", "phMaking"]);
  // a complete demo passes; accepted drafts count as written
  let notes = ws["s6f.notes"];
  notes = C.setNote(notes, "stTone", "배경을 맞췄다.", NOW); notes = C.setNote(notes, "stFinal", "차이와 이유", NOW);
  notes = C.setNote(notes, "kpLight", "그림자는 흔적과 상관없다.", NOW); notes = C.setNote(notes, "rm", 2, NOW); notes = C.setNote(notes, "rf", "배경", NOW);
  const ph = C.buildPhrases({ ws: { ...ws, "s6f.notes": notes }, nowMs: NOW_MS });
  notes = C.acceptDraft(C.acceptDraft(notes, "phScope", ph.b), "phMaking", ph.c);
  e.sr.fix = { t0: NOW, e: 5, d: 5, n: 1, ch: 1 }; notes = C.setNote(notes, "stFix", "글자를 지웠다.", NOW);
  const full = { ...ws, "s6f.notes": notes };
  const ok = withFlags({ fix: true }, () => C.finalizeCheck(full, { feat: S.feat }));
  assert.deepEqual(ok.items.filter((x) => x.block), []); assert.equal(ok.ok, true);
  assert.deepEqual(C.finalizeCheck(full, { dirty: true, uploading: 1, feat: () => true }).items.filter((x) => x.block).map((x) => x.k), ["dirty", "uploading"]);
  // a stage note missing, an out-of-date export, a method missing, a keep reason missing, a routed stage that changed nothing
  const bad = JSON.parse(JSON.stringify(full));
  bad["s6f.edit"].crev = 3; bad["s6f.notes"].stTone = ""; bad["s6f.notes"].kpLight = "";
  bad["s6f.edit"].route.s[S.ITEMS.indexOf("scale")] = 2;
  bad["s6f.edit"].route.s[S.ITEMS.indexOf("exhibit")] = 2; bad["s6f.edit"].route.m[S.ITEMS.indexOf("exhibit")] = S.METHOD.screen;
  delete bad["s6f.edit"].sr.tone.ch;
  const fc = C.finalizeCheck(bad, { feat: () => true });
  const ks = fc.items.filter((x) => x.block).map((x) => x.k);
  assert.deepEqual(ks, ["export", "keep:light", "method:scale", "nochange:exhibit"], ks.join(","));
  assert.equal(fc.items.find((x) => x.k === "keep:light").text, TX.fmt(TX.T.needKeepReason, { itemObj: "‘빛과 그림자’를" }));
  assert.equal(fc.items.find((x) => x.k === "nochange:exhibit").text, TX.fmt(TX.T.needNoChange, { itemObj: "‘전시했을 때의 화면’을", methodRo: "화면 편집으로" }));
  assert.equal(fc.items.find((x) => x.k === "nochange:exhibit").stage, "crop");
  // hidden stages (R1): an item routed to 손으로 고치기 asks only for the stFix note
  const hid = JSON.parse(JSON.stringify(full));
  delete hid["s6f.edit"].sr.fix; hid["s6f.notes"].stFix = "";
  const r1 = C.finalizeCheck(hid, { feat: (f) => f !== "fix" });
  assert.deepEqual(r1.items.filter((x) => x.block).map((x) => x.k), ["hidden:fix"]);
  assert.equal(r1.items[0].text, TX.fmt(TX.T.needHiddenNote, { stage: "손으로 고치기" }));
  assert.deepEqual(C.finalizeCheck(hid, { feat: () => true }).items.filter((x) => x.block).map((x) => x.k), ["nochange:text"]);
  // stale accepted draft: shown, not blocking
  const stale = JSON.parse(JSON.stringify(full)); stale["s6f.notes"].pd.phScope = 1;
  const st = C.finalizeCheck(stale, { feat: () => true });
  assert.equal(st.ok, true); assert.ok(st.items.some((x) => x.k === "stale:phScope" && !x.block && x.text === TX.T.staleDraft));
  // sendPlan: only empty keys, one line, ≤ 300 characters, joined with 「 / 」
  const sp = C.sendPlan({ ...full, "s6a.diff": "이미 씀", "s6f.notes": { ...notes, stFinal: "가\n" + "나".repeat(400) } });
  assert.ok(!("s6a.diff" in sp.s6a.text));
  assert.deepEqual(sp.s6a.keys, ["s6a.regen", "s6a.partial", "s6a.edit", "s6a.beforeImg", "s6a.afterImg"]);
  assert.equal(sp.s6a.text["s6a.regen"], "1회차: ③ 다음 / 2회차: ③ 다음");
  assert.equal(sp.s6a.text["s6a.partial"], "그립 광택 범위: 어도비 파이어플라이");
  assert.equal(sp.s6a.text["s6a.edit"], "배경 회색 맞춤(배경 면적 61%), 밝기·대비 조정(평균 밝기 +6%), 원래 화면의 88%로 자름");
  const sp2 = C.sendPlan({ ...full, "s6f.notes": { ...notes, stFinal: "가\n" + "나".repeat(400) } });
  assert.equal([...sp2.s6a.text["s6a.diff"]].length, 300); assert.ok(!sp2.s6a.text["s6a.diff"].includes("\n"));
  assert.equal(sp.aiScope, ph.b); assert.equal(sp.s7x.ok, true);
  assert.equal(C.sendPlan({ ...full, "s6b.aiScope": "이미 씀" }).aiScope, null);
  assert.deepEqual(C.sendPlan({ ...full, "s7x.img": { ref: "s7x.img.1790000000000" } }).s7x, { ok: false, why: TX.T.sendNone });
  const small = JSON.parse(JSON.stringify(full)); small["s6f.edit"].m.out.w = 800; small["s6f.edit"].m.out.h = 999;
  assert.deepEqual(C.sendPlan(small).s7x, { ok: false, why: TX.fmt(TX.CORE_TEXT.heroLong, { n: 1000 }) }, "the hero floor is 1000 px");
  const filledImgs = C.sendPlan({ ...full, "s6a.beforeImg": { ref: "s6a.beforeImg.1790000000000" } });
  assert.equal(filledImgs.s6a.before, false); assert.equal(filledImgs.s6a.after, true);
  assert.deepEqual(C.sendPlan({}), { s6a: { keys: [], text: {}, before: false, after: false }, aiScope: null, s7x: { ok: false, why: TX.T.notExported } });
  assert.deepEqual(C.imgSendValue("s7x.img.1790000000000", 2000, 1500, Date.UTC(2026, 9, 14, 2, 20)), { ref: "s7x.img.1790000000000", at: "2026-10-14T02:20:00.000Z", w: 2000, h: 1500 });
  [sp.s6a.text, sp.aiScope].flatMap((x) => (typeof x === "string" ? [x] : Object.values(x))).forEach((s) => assert.deepEqual(TX.lintKo(s), [], s));
});

test("addTrash never drops; gcPlan order; mergeManifest; small updaters keep sv; rebaseEdit", { skip: NO_FIX }, async () => {
  const M = await fixMod("maximal.mjs"), TY = await fixMod("typical.mjs");
  // addTrash: 65 refs appended to 64 stay 65; batches merge beyond 12 (x batches only when no plain pair exists)
  const tr = M.maximalTrash();
  const t65 = C.addTrash(tr, ["s6f.edit.L1.zzzzzzzz"], NOW);
  assert.equal(C.trashRefs(t65).length, 65); assert.equal(t65.b.length, S.LIMITS.trashBatches);
  assert.equal(C.addTrash(t65, ["s6f.edit.L1.zzzzzzzz"], NOW), t65, "a ref already in the trash is not appended again");
  let plain = { v: 1, b: [] };
  for (let i = 0; i < 12; i++) plain = C.addTrash(plain, ["r" + i], 100 + i);
  plain = C.addTrash(plain, ["x1"], 200, { x: true });
  assert.equal(plain.b.length, 12); assert.deepEqual(plain.b[0], { t: 101, q: [{ ref: "r0" }, { ref: "r1" }] }, "the two oldest plain batches merge, later t kept");
  assert.deepEqual(plain.b[11], { t: 200, x: 1, q: [{ ref: "x1" }] });
  assert.deepEqual(C.trashRefs(plain), ["r0", "r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9", "r10", "r11", "x1"]);
  assert.deepEqual(C.addTrash(undefined, [{ ref: "a" }, "a", "", 5], 7), { v: 1, b: [{ t: 7, q: [{ ref: "a" }] }] });
  assert.deepEqual(C.dropTrash(plain, ["r0", "x1"]).b.length, 11);
  assert.equal(C.dropTrash(plain, ["none"]), plain);
  // gcPlan: x batches, then grace, then the soft cap, then need; live refs never
  const live = img("ra", 1).ref;
  const grace = 30 * 60 * 1000, nowMs = 1791000000 * 1000;
  let trash = C.addTrash(undefined, ["old1"], nowMs / 1000 - 3600);
  trash = C.addTrash(trash, ["x1", live], nowMs / 1000 - 10, { x: true });
  trash = C.addTrash(trash, ["new1", "new2"], nowMs / 1000 - 5);
  const ws = { "s6f.steps": C.addImage(started("ra"), "ra", img("ra", 1), NOW).value, "s6f.trash": trash };
  assert.deepEqual(C.gcPlan(ws, { nowMs, graceMs: grace }), ["x1", "old1"]);
  assert.deepEqual(C.gcPlan(ws, { nowMs, graceMs: grace, need: 1 }), ["x1", "old1", "new1"]);
  assert.deepEqual(C.gcPlan(ws, { nowMs, graceMs: 0 }), ["x1", "old1", "new1", "new2"]);
  let many = { v: 1, b: [] };
  for (let i = 0; i < 30; i++) many = C.addTrash(many, ["m" + i], nowMs / 1000 - 1);
  assert.deepEqual(C.gcPlan({ "s6f.trash": many }, { nowMs, graceMs: grace }), ["m0", "m1", "m2", "m3", "m4", "m5"], "the oldest beyond 24");
  assert.ok(!C.gcPlan(ws, { nowMs, graceMs: 0, need: 99 }).includes(live));
  // mergeManifest: content from mine, done/sent/ev from cur, rev/crev, missing layers verbatim, unknown kinds carried
  const cur = TY.typicalEdit();
  cur.L.push({ id: 9, k: 1, t: 0, ms: 1, c: { ref: ER("L9") }, cov: 5 }, { id: 10, k: 42, blob: { ref: ER("L10") } });
  const mine = { m: cur.m, doc: { ...cur.doc, r: 0 }, route: cur.route, pins: [], lines: [], sr: { crop: { t0: 1, e: 1, d: 1, n: 1, ch: 1 } }, snaps: [], log: [], act: 2, st: 3, pr: cur.pr,
    nid: 4, L: [{ ...cur.L[0], cov: 600 }, { id: 9, k: 1, t: 0, ms: 1, c: { ref: "older" } }], done: null, sent: { s6a: 1 }, ev: [] };
  const meta = { dev: 5, sv: 77, nowMs: 123456, contentChanged: true, exported: true };
  const mm = C.mergeManifest(cur, mine, meta);
  assert.equal(mm.doc.r, 0); assert.deepEqual(mm.pins, []); assert.equal(mm.st, 3); assert.equal(mm.act, 2);
  assert.deepEqual(mm.done, cur.done); assert.deepEqual(mm.sent, cur.sent); assert.deepEqual(mm.ev, cur.ev);
  assert.equal(mm.rev, cur.rev + 1); assert.equal(mm.crev, cur.crev + 1); assert.equal(mm.m.out.cr, mm.crev);
  assert.deepEqual([mm.dev, mm.sv, mm.at, mm.nid], [5, 77, 123456, cur.nid]);
  assert.deepEqual(mm.L.map((x) => x.id), [1, 9, 10]); assert.equal(mm.L[0].cov, 600);
  assert.deepEqual(mm.L[1], cur.L[5], "the missing layer is copied verbatim from cur");
  assert.deepEqual(mm.L[2], cur.L[6], "an unknown kind is carried");
  assert.ok(C.refsIn(mm).includes(ER("L10")) && C.refsIn(mm).includes(ER("L9")));
  assert.ok(!C.editDiffRefs(cur, mm).includes(ER("L10")), "its refs stay live");
  assert.deepEqual(Object.keys(mm.sr), ["crop"]);
  const still = C.mergeManifest(cur, mine, { ...meta, contentChanged: false, exported: false });
  assert.equal(still.crev, cur.crev); assert.equal(still.m.out.cr, cur.m.out.cr);
  const first = C.mergeManifest(null, { m: { base: cur.m.base, out: null, cmp: null }, L: [], doc: cur.doc }, { dev: 1, sv: 2, nowMs: 3, contentChanged: true });
  assert.deepEqual([first.v, first.rev, first.crev, "done" in first], [1, 1, 1, false]);
  assert.throws(() => C.mergeManifest(cur, { L: [{ id: 1, k: 1, bad: [[1]] }] }, meta), C.FolioShapeError);
  assert.equal(C.totalUpd((c) => C.mergeManifest(c, { L: [{ id: 1, k: 1, bad: [[1]] }] }, meta))(cur), cur);
  assert.deepEqual(C.mergeManifest(cur, { L: [{ id: 1, bad: [[1]] }] }, meta).L, [cur.L[0], cur.L[6]], "a record without a known kind is never taken from mine over cur");
  // compactEdit: drops p first, then the oldest entries; never layers
  const big = M.maximalEdit();
  big.log = Array.from({ length: 24 }, (_, i) => ({ ...M.widestLog(), y: i, p: "가".repeat(40) }));
  const ce = C.compactEdit(big, S.BUDGET.edit);
  assert.equal(ce.ok, true); assert.ok(C.jsonBytes(ce.edit) <= S.BUDGET.edit);
  assert.equal(ce.edit.L.length, big.L.length); assert.deepEqual(ce.edit.L, big.L);
  assert.ok(ce.edit.log.every((x) => !("p" in x)), "every p goes before any entry"); assert.ok(ce.edit.log.length < 24 && ce.edit.log.length >= M.MAX_LOG_N);
  assert.equal(ce.edit.log[ce.edit.log.length - 1].y, 23, "the newest entries stay");
  const fits = TY.typicalEdit();
  assert.equal(C.compactEdit(fits, S.BUDGET.edit).edit, fits);
  assert.equal(C.compactEdit({ ...big, log: [] }, 100).ok, false);
  // small updaters: sv untouched, dev set, rev + 1; confirm and release are guarded
  const ed = TY.typicalEdit();
  ed.done = { at: 0, n: 1, un: 0 };
  const cf = C.confirmEdit(ed, 1791001000000, 99);
  assert.deepEqual(cf.done, { at: 1791001000000, n: 2, un: 0 }); assert.equal(cf.sv, ed.sv); assert.equal(cf.dev, 99); assert.equal(cf.rev, ed.rev + 1);
  assert.equal(cf.crev, ed.crev); assert.deepEqual(cf.ev[cf.ev.length - 1], { t: 1791001000, o: S.EV.done });
  assert.equal(C.confirmEdit(cf, 1, 1), cf, "already confirmed");
  const rl = C.releaseEdit(cf, 1791002000000, 98);
  assert.deepEqual(rl.done, { at: 0, n: 2, un: 1 }); assert.equal(rl.sv, ed.sv); assert.equal(rl.ev[rl.ev.length - 1].o, S.EV.unlock);
  assert.equal(C.releaseEdit(rl, 1, 1), rl);
  const ms = C.markSent(cf, "s6b", 1791003000000, 97);
  assert.deepEqual(ms.sent, { ...cf.sent, s6b: 1791003000000 }); assert.equal(ms.sv, ed.sv); assert.equal(ms.dev, 97);
  assert.equal(C.markSent(cf, "s9", 1, 1), cf); assert.equal(C.confirmEdit(undefined, 1, 1), undefined);
  let evs = ed;
  for (let i = 0; i < 12; i++) evs = i % 2 ? C.releaseEdit(evs, 1791000000000 + i * 1000, 1) : C.confirmEdit(evs, 1791000000000 + i * 1000, 1);
  assert.equal(evs.ev.length, S.LIMITS.ev); assert.deepEqual([evs.done.n, evs.done.un], [7, 6], "counts outlive dropped events");
  // rebaseEdit: every edit ref superseded; route, log, durations kept; crev + 1; refused while confirmed
  const rb = C.rebaseEdit(ed, 1791004000000, 96);
  assert.deepEqual(new Set(rb.superseded), new Set(C.refsIn(ed)));
  assert.deepEqual(C.refsIn(rb.value), []);
  assert.deepEqual(rb.value.route, ed.route); assert.deepEqual(rb.value.log, ed.log); assert.equal(rb.value.sr.tone.d, ed.sr.tone.d);
  assert.equal(rb.value.sr.tone.ch, undefined); assert.equal(rb.value.sr.tone.mb, undefined); assert.equal(rb.value.sr.tone.n, 0);
  assert.deepEqual([rb.value.crev, rb.value.rev, rb.value.sv, rb.value.dev], [ed.crev + 1, ed.rev + 1, ed.sv, 96]);
  assert.equal(rb.value.ev[rb.value.ev.length - 1].o, S.EV.rebase); assert.deepEqual(rb.value.L, []); assert.equal("doc" in rb.value, false);
  assert.deepEqual(C.rebaseEdit(cf, 1, 1), { value: cf, superseded: [] }, "not while confirmed");
});

test("unknown keys survive every updater and mergeManifest", () => {
  const X = { zz: { keep: 1 } };
  let steps = doneReflect(doneRound(doneRound(undefined, "ra"), "rb", 1));
  steps = { ...steps, ...X, ra: { ...steps.ra, ...X }, rb: { ...steps.rb, ...X }, rv: { ...steps.rv, ...X }, old: [{ th: { ref: "s6f.steps.ra.o.th" }, r: 0, ...X }] };
  steps.ra.im = steps.ra.im.map((x) => ({ ...x, ...X }));
  const ups = [
    (c) => C.setRoundText(c, "ra", "seen", "새로 본 것", NOW), (c) => C.setPromptLine(c, "rb", 2, "line", NOW).value, (c) => C.pastePrompt(c, "rb", 5, "a\nb", NOW).value,
    (c) => C.setRoundCode(c, "ra", "ck1", 1, NOW), (c) => C.addImage(c, "ra", img("ra", 7), NOW).value, (c) => C.replaceImage(c, "ra", 0, img("ra", 8), NOW).value,
    (c) => C.removeImage(c, "ra", 0, NOW).value, (c) => C.setThumb(c, "ra", img("ra", 7).ref, { ref: "t" }), (c) => C.chooseImage(c, "ra", 0, NOW),
    (c) => C.setSkip(c, "rb", "이유", NOW), (c) => C.setReflect(c, "big", "가장 큰 수정", NOW), (c) => C.setReflect(c, "base", 1, NOW), (c) => C.bumpHelp(c, "rv"),
    (c) => C.bumpHelp(c, "ra"), (c) => C.startRound(c, "rc", null, NOW), (c) => C.importRound(c, "rb", { tool: "x", judge: "j" }, 2, NOW, { prevR: "ra" }),
  ];
  for (const f of ups) {
    const out = f(steps);
    assert.deepEqual(out.zz, X.zz); assert.deepEqual(out.ra.zz, X.zz); assert.deepEqual(out.rb.zz, X.zz); assert.deepEqual(out.rv.zz, X.zz);
    assert.deepEqual(out.old[0].zz, X.zz, "entries of old");
    assert.equal(C.assertSafe(out), "");
  }
  assert.deepEqual(C.addImage(steps, "ra", img("ra", 9), NOW).value.ra.im[0].zz, X.zz, "images keep their unknown keys");
  let notes = { ...C.setNote(undefined, "stTone", "x", NOW), ...X, pd: { phScope: 0, phMaking: 0, ...X }, ti: { stTone: NOW, ...X } };
  for (const f of [(c) => C.setNote(c, "stCrop", "y", NOW), (c) => C.setNote(c, "rm", 2, NOW), (c) => C.acceptDraft(c, "phScope", "d"), (c) => C.copyDraft(c, "phMaking", "d")]) {
    const out = f(notes);
    assert.deepEqual(out.zz, X.zz); assert.deepEqual(out.pd.zz, X.zz); assert.deepEqual(out.ti.zz, X.zz);
  }
  const edit = { v: 1, rev: 1, crev: 1, sv: 5, dev: 1, ...X, m: { base: { ref: ER("base"), w: 10, h: 10 }, out: null, cmp: null, ...X }, doc: { w: 10, h: 10, ...X },
    sr: { tone: { t0: 1, e: 1, d: 1, n: 1, ...X }, later: { ...X } }, L: [{ id: 1, k: 4, t: 0, p: { b: 1 }, ...X }, { id: 2, k: 99, ...X, c: { ref: ER("L2") } }], done: { at: 0, n: 0, un: 0, ...X }, sent: { s6a: 0, s6b: 0, s7x: 0, ...X } };
  for (const f of [(c) => C.confirmEdit(c, 5, 2), (c) => C.releaseEdit(C.confirmEdit(c, 5, 2), 6, 2), (c) => C.markSent(c, "s7x", 5, 2)]) {
    const out = f(edit);
    assert.deepEqual(out.zz, X.zz); assert.deepEqual(out.m.zz, X.zz); assert.deepEqual(out.doc.zz, X.zz); assert.deepEqual(out.sr.tone.zz, X.zz);
    assert.deepEqual(out.L, edit.L); assert.deepEqual(out.done.zz, X.zz); assert.deepEqual(out.sent.zz, X.zz);
  }
  const rb = C.rebaseEdit(edit, 5, 2).value;
  assert.deepEqual(rb.zz, X.zz); assert.deepEqual(rb.m.zz, X.zz); assert.deepEqual(rb.sr.tone.zz, X.zz); assert.deepEqual(rb.sr.later, edit.sr.later);
  // mergeManifest: mine is what the editor re-emits (unknown keys of loaded layer records included, none elsewhere)
  const e = C.normEdit(edit);
  const mine = { m: { base: e.m.base, out: null, cmp: null }, doc: { w: 10, h: 10, crop: null }, sr: { tone: { t0: 1, e: 2, d: 2, n: 2 } },
    L: [{ id: 1, k: 4, t: 0, p: { b: 2 }, ...X }], route: e.route, pins: [], lines: [], snaps: [], log: [], act: 0, st: 0, pr: e.pr, nid: 3 };
  const mm = C.mergeManifest(edit, mine, { dev: 2, sv: 6, nowMs: 7, contentChanged: true });
  assert.deepEqual(mm.zz, X.zz); assert.deepEqual(mm.m.zz, X.zz); assert.deepEqual(mm.doc.zz, X.zz); assert.deepEqual(mm.sr.tone.zz, X.zz);
  assert.deepEqual(mm.sr.later, edit.sr.later, "a stage record of an unknown stage");
  assert.deepEqual(mm.L[0].zz, X.zz); assert.deepEqual(mm.L[1], edit.L[1], "a layer of an unknown kind");
  assert.deepEqual(mm.done, edit.done); assert.deepEqual(mm.sent, edit.sent);
  const tr = { v: 1, ...X, b: [{ t: 1, q: [{ ref: "a", ...X }], ...X }] };
  assert.deepEqual(C.addTrash(tr, ["b"], 2).zz, X.zz); assert.deepEqual(C.addTrash(tr, ["b"], 2).b[0], tr.b[0]);
  assert.deepEqual(C.dropTrash({ ...tr, b: [...tr.b, { t: 2, q: [{ ref: "c" }] }] }, ["c"]), tr);
});

test("folioUnits: effective values, inherited units not repeated, copied units marked, draft markers, text layers", () => {
  let st = C.startRound(undefined, "ra", { tool: "MJ", lines: ["grip", "", "", "", "", ""], po: "" }, NOW);
  st = C.setRoundText(C.setRoundText(st, "ra", "aim", "노린 것", NOW), "ra", "exp", "예상", NOW);
  st = C.addImage(st, "ra", img("ra", 1), NOW).value;
  st = C.setRoundCode(C.setRoundText(st, "ra", "jd", "판단", NOW), "ra", "cz", 2, NOW);
  st = C.setRoundCode(C.setRoundText(st, "ra", "nx", "다음", NOW), "ra", "nl", 7, NOW);
  st = C.setRoundText(st, "ra", "nw", "방향", NOW);
  st = C.setRoundCode(C.setRoundText(st, "ra", "un", "이유", NOW), "ra", "uk", 2, NOW);
  st = C.setRoundText(started("rb", st), "rb", "seen", "본 것", NOW);
  st = C.setRoundCode(C.setRoundText(started("rc", st), "rc", "nx", "다듬기 계획", NOW), "rc", "hm", 3, NOW);
  st = C.setReflect(C.setReflect(C.setReflect(st, "near", 3, NOW), "far", 1, NOW), "look", "광택", NOW);
  const u = Object.fromEntries(C.folioUnits({ part: "steps" }, st).map((x) => [x.sub, x.text]));
  assert.equal(u["1회차 도구"], "MJ (5차시에서 가져옴)"); assert.equal(u["1회차 프롬프트"], "① grip (5차시에서 가져옴)");
  assert.equal(u["1회차 판단과 근거"], "판단 (원인: ②)"); assert.equal(u["1회차 다음에 고칠 한 가지"], "다음 (방향 바꾸기: 방향)");
  assert.equal(u["1회차 시키지 않았는데 나온 것"], "살림: 이유");
  assert.equal(u["2회차 도구"], undefined, "an inherited tool is not exported again"); assert.equal(u["2회차 프롬프트"], undefined); assert.equal(u["2회차 노린 것"], undefined);
  assert.equal(u["2회차 보이는 것"], "본 것"); assert.equal(u["3회차 다듬기에서 고칠 것"], "다듬기 계획 (손으로 고치기)");
  assert.equal(u["가장 가까운 회차·가장 먼 회차"], "3회차 / 1회차: 광택");
  const after = C.setRoundText(C.addImage(started("rb", st), "rb", img("rb", 2), NOW).value, "rb", "exp", "본 뒤", NOW);
  assert.equal(Object.fromEntries(C.folioUnits({ part: "steps" }, after).map((x) => [x.sub, x.text]))["2회차 예상"], "본 뒤 (이미지를 본 뒤 씀)");
  let notes = C.acceptDraft(C.setNote(undefined, "stTone", "톤 기록", NOW), "phScope", "초안 b");
  notes = C.copyDraft(notes, "phMaking", "초안 c");
  notes = C.setNote(C.setNote(notes, "rm", 2, NOW), "rf", "배경", NOW);
  const nu = Object.fromEntries(C.folioUnits({ part: "notes" }, notes).map((x) => [x.sub, x.text]));
  assert.deepEqual(nu, { "빛과 톤 기록": "톤 기록", "반영한 방식·부분": "일부 수정: 배경", "AI 활용 범위 문장": "자동 초안 그대로 씀", "제작 과정 문장": "자동 초안을 옮겨 씀" });
  assert.equal(Object.fromEntries(C.folioUnits({ part: "notes" }, C.setNote(notes, "phMaking", "내 문장", NOW)).map((x) => [x.sub, x.text]))["제작 과정 문장"], "내 문장");
  assert.deepEqual(C.folioUnits({ part: "edit" }, { v: 1, L: [{ id: 1, k: 6, p: { s: "유물 번호 12" } }, { id: 2, k: 4, t: 0 }] }), [{ sub: "화면 속 글자", text: "유물 번호 12" }]);
  assert.deepEqual(C.folioUnits({ part: "trash" }, { v: 1, b: [] }), []);
  assert.deepEqual(C.folioUnits({ part: "steps" }, undefined), []);
});

test("indicators, opLines, flags text, folioMediaN", () => {
  let st = doneRound(undefined, "ra");
  st = C.setRoundText(st, "ra", "nx", "그림자를 하나로 줄인다", NOW);
  st = C.setRoundText(started("rb", st), "rb", "aim", "그림자를 하나로 줄이기", NOW);
  st = C.setPromptLine(C.setPromptLine(st, "rb", 0, "x", NOW).value, "rb", 1, "y", NOW).value;
  st = C.bumpHelp(C.bumpHelp(st, "rb"), "rb");
  const ind = C.indicators(st);
  assert.equal(ind.ra.expFirst, null); assert.equal(ind.ra.causeLine, true); assert.equal(ind.ra.carried, false);
  assert.equal(ind.rb.carried, true, "bigram overlap with the previous nx"); assert.equal(ind.rb.changed, 2); assert.equal(ind.rb.help, 2);
  assert.equal(ind.rc.carried, false);
  const copied = C.indicators(C.startRound(undefined, "ra", { tool: "MJ", lines: ["a", "b", "", "", "", ""], po: "" }, NOW));
  assert.equal(copied.ra.copied, 3);
  // flags on rounds: multi-line change, skipped round, expectation after the image, duplicate image
  let f = C.flags({ "s6f.steps": st });
  assert.ok(f.some((x) => x.k === "multiLine" && x.text === TX.fmt(TX.T.flagMultiLine, { list: "2회차" })));
  st = C.setSkip(st, "rc", "시간", NOW);
  st = C.setRoundText(C.addImage(st, "rb", img("ra", 0, "0123456789abcdee"), NOW).value, "rb", "exp", "본 뒤", NOW);
  f = C.flags({ "s6f.steps": st });
  assert.deepEqual(f.map((x) => x.k), ["multiLine", "dupImage", "skipped", "expAfter"]);
  assert.equal(f.find((x) => x.k === "expAfter").level, "info");
  // the editor flags of the demo
  const ws = demoWs();
  ws["s6f.edit"].done = { at: 0, n: 1, un: 2 };
  ws["s6f.edit"].L.push(L_(8, "px", "spot", { cov: 3, po: 1 }));
  ws["s6f.edit"].doc.cal = { a: 0, b: 0, c: 10, d: 0, cm: 120, ob: 0 };
  ws["s6b.size"] = "8×4×3cm";
  const fe = C.flags(ws);
  ["pinTouched", "scaleMismatch", "notConfirmed", "released"].forEach((k) => assert.ok(fe.some((x) => x.k === k), k));
  assert.ok(!C.flags({ ...ws, "s6b.size": "120mm" }).some((x) => x.k === "scaleMismatch"), "mm are converted");
  fe.forEach((x) => { assert.ok(["warn", "info", "good"].includes(x.level)); assert.deepEqual(TX.lintKo(x.text), [], x.text); });
  assert.ok(C.flags({ ...ws, "s6f.notes": C.setNote(ws["s6f.notes"], "kpLight", "이유", NOW) }).some((x) => x.k === "keptReasons" && x.level === "good"));
  // structure judged 안 맞음 with 재생성 and no later round
  const sw = demoWs(); sw["s6f.edit"].route.s[0] = 2; sw["s6f.edit"].route.m[0] = S.METHOD.regen;
  assert.ok(C.flags(sw).some((x) => x.k === "structNoRegen"));
  sw["s6f.edit"].m.base.r = 1;
  assert.ok(!C.flags(sw).some((x) => x.k === "structNoRegen"), "round 3 was generated after the base");
  // opLines: the §7.1 examples
  const e = { v: 1, doc: { w: 1000, h: 1000 }, L: [L_(9, "px", "clone", { cov: 8, g: 2, it: it1("text") }), L_(10, "tr", null, { cov: 12, ce: 1, p: { pr: 1 }, po: 1 })],
    log: [{ t: 1, s: 4, o: "clone", n: 12, a: 8, l: 4, w: 2, y: 9 }, { t: 2, s: 4, o: "trace", n: 5, a: 12, l: 4, w: 3, y: 10 }, { t: 3, s: 4, o: "heal", n: 2, a: 0, l: 4, w: 2, y: 77 }] };
  // teacher view (FolioRead): level with its name and the press-photo verdict (review r3 K8)
  assert.deepEqual(C.opLines(e, "fix", { audience: "teacher" }), [
    "복제 도장 12번, 2곳, 화면의 0.8% · 연결 항목: 글자와 표시 · 개입 4(요소를 지우거나 더하기) · 보도사진 기준: 허용 안 됨(지우기)",
    "흔적 그리기(마모 광택) 5번, 화면의 1.2% · 설계 카드: 마모 · 개입 4(요소를 지우거나 더하기) · 보도사진 기준: 허용 안 됨(더하기)",
    TX.T.traceOverlapLine,
    "복구 브러시 2번 · 개입 4(요소를 지우거나 더하기) · 보도사진 기준: 허용 안 됨(지우기)",
  ]);
  // student view (the default): no level, no verdict; level ≥ 4 in the final image is marked for the 표기 문장; log-only lines untagged
  assert.deepEqual(C.opLines(e, "fix"), [
    "복제 도장 12번, 2곳, 화면의 0.8% · 연결 항목: 글자와 표시 · 표기 문장에 밝힐 수정",
    "흔적 그리기(마모 광택) 5번, 화면의 1.2% · 설계 카드: 마모 · 표기 문장에 밝힐 수정",
    TX.T.traceOverlapLine,
    "복구 브러시 2번",
  ]);
  assert.deepEqual(C.opLines(e, "tone"), []); assert.deepEqual(C.opLines(null, "fix"), []); assert.deepEqual(C.opLines(e, "nope"), []);
  // folioMediaN: step images plus the export
  assert.equal(C.folioMediaN(ws), 3 + 1); assert.equal(C.folioMediaN({}), 0);
});

test("fuzz: every updater is total on garbage input (through totalUpd), and norm* never throw", () => {
  const r = PX.mulberry32(11);
  const pick = (a) => a[Math.floor(r() * a.length)];
  const junk = () => pick([undefined, null, 0, -1, 1.5, NaN, "", "x", [], [1, 2], {}, { v: 1 }, { v: 2 }, { ra: 5 }, { ra: { im: "x", ti: 5, ck: null } }, { b: "x" }, { L: 3, m: 1 }, true]);
  const fns = [
    (c) => C.startRound(c, pick(S.ROUNDS), pick([null, { lines: 5 }, { tool: 3 }]), NOW), (c) => C.setRoundText(c, pick(S.ROUNDS), pick(["aim", "exp", "pa", "zz", "sk"]), pick(["a", 5, null]), NOW),
    (c) => C.setPromptLine(c, pick(S.ROUNDS), pick([0, 6, 9, "x"]), pick(["a", null]), NOW).value, (c) => C.pastePrompt(c, "rb", 0, pick(["a\nb", 7]), NOW).value,
    (c) => C.setRoundCode(c, "ra", pick(["uk", "ck0", "zz"]), pick([1, 9, "1"]), NOW), (c) => C.addImage(c, "ra", pick([img("ra", 1), null, { ref: 3 }]), NOW).value,
    (c) => C.replaceImage(c, "ra", pick([0, "x", 5]), img("ra", 2), NOW).value, (c) => C.removeImage(c, "ra", pick([0, -1]), NOW).value, (c) => C.setThumb(c, "ra", "x", { ref: "y" }),
    (c) => C.chooseImage(c, "ra", pick([0, -1, 3]), NOW), (c) => C.setSkip(c, "rc", pick(["x", 3]), NOW), (c) => C.setReflect(c, pick(["base", "near", "look", "zz"]), pick([1, "x", -5]), NOW),
    (c) => C.bumpHelp(c, pick(["ra", "rv", "zz"])), (c) => C.setNote(c, pick(["stTone", "rm", "zz"]), pick(["x", 2, null]), NOW), (c) => C.acceptDraft(c, "phScope", "d"),
    (c) => C.copyDraft(c, "phMaking", "d"), (c) => C.importRound(c, "rb", pick([{ tool: "t", prompt: 5 }, null]), 1, NOW), (c) => C.confirmEdit(c, 1, 1), (c) => C.releaseEdit(c, 1, 1),
    (c) => C.markSent(c, "s6a", 1, 1), (c) => C.rebaseEdit(c, 1, 1).value, (c) => C.addTrash(c, pick([["a"], "x", null]), NOW), (c) => C.dropTrash(c, ["a"]),
    (c) => C.mergeManifest(c, pick([{ L: [{ id: 1, k: 1 }] }, null, { m: 5 }]), { dev: 1, sv: 1, nowMs: 1 }), (c) => C.compactEdit(c, 10).edit,
  ];
  for (let i = 0; i < 600; i++) {
    const cur = junk(), f = pick(fns);
    const out = C.totalUpd(f)(cur);
    if (!Object.is(out, cur)) assert.equal(C.assertSafe(out), "");
  }
  for (let i = 0; i < 100; i++) {
    const v = junk();
    C.normSteps(v); C.normNotes(v); C.normEdit(v); C.normTrash(v); C.effRound(v, "rc"); C.roundState(v, "rb"); C.indicators(v); C.summarize(v);
    C.buildPhrases({ ws: { "s6f.steps": v, "s6f.edit": v, "s6f.notes": v } }); C.finalizeCheck({ "s6f.edit": v }); C.flags({ "s6f.edit": v, "s6f.steps": v }); C.sendPlan({ "s6f.edit": v });
    C.gcPlan({ "s6f.trash": v }, { nowMs: 1 }); C.folioUnits({ part: "steps" }, v); C.folioUnits({ part: "notes" }, v); C.folioUnits({ part: "edit" }, v);
  }
});

test("depth rule: writes made through the updaters keep student text at depth 1–2 only", () => {
  let st = doneReflect(doneRound(doneRound(undefined, "ra"), "rb", 1));
  st = C.setRoundText(st, "ra", "aim", "기준 화면의 흔적 설계에 맞춘 광택", NOW);
  st = C.setPromptLine(st, "rb", 2, "buried in clay, compressed and hardened", NOW).value;
  st = C.setReflect(st, "look", "그립 안쪽의 광택 범위를 보고 판단", NOW);
  const notes = C.copyDraft(C.setNote(undefined, "stTone", "배경을 회색에 맞추고 밝기를 올렸다", NOW), "phMaking", "프롬프트 여섯 줄을 작성하고 생성 3회 가운데 1점을 고름.");
  const edit = C.confirmEdit(C.mergeManifest(null, { m: { base: { ref: ER("base"), w: 1, h: 1, r: 0, sg: "x", src: "s6f.steps.ra.x" } }, L: [L_(1, "txt", null, { p: { s: "화면 속 글자 열 자 이상입니다" } })], log: C.appendLog([], { o: "txt", y: 1, p: "글자 레이어를 덧붙임" }, NOW) }, { dev: 1, sv: 1, nowMs: 1 }), 2, 1);
  const trash = C.addTrash(undefined, [ER("old")], NOW);
  const paths = writtenTextAll({ "s6f.steps": st, "s6f.notes": notes, "s6f.edit": edit, "s6f.trash": trash }).map(([k]) => k);
  ["s6f.steps#ra.aim", "s6f.steps#rb.pc", "s6f.steps#rv.look", "s6f.notes#stTone", "s6f.notes#phMaking"].forEach((p) => assert.ok(paths.includes(p), p));
  assert.ok(paths.every((p) => /^s6f\.(steps|notes)#/.test(p)), paths.join(","));
});

test("generated strings of core pass the lint (phrases, op lines, flags, precheck, units)", { skip: NO_FIX }, async () => {
  const TY = await fixMod("typical.mjs"), M = await fixMod("maximal.mjs");
  for (const ws of [TY.typical(), demoWs(), M.maximal()]) {
    const ph = C.buildPhrases({ ws, nowMs: NOW_MS });
    const strs = [ph.a, ph.b, ph.c, ...S.STAGES.flatMap((st) => [...C.opLines(ws["s6f.edit"], st), ...C.opLines(ws["s6f.edit"], st, { audience: "teacher" })]), ...C.flags(ws).map((x) => x.text),
      ...C.finalizeCheck(ws, { dirty: true, uploading: 1 }).items.map((x) => x.text), ...Object.values(C.sendPlan(ws).s6a.text),
      ...["steps", "notes", "edit"].flatMap((p) => C.folioUnits({ part: p }, ws["s6f." + p]).map((u) => u.sub))];
    strs.forEach((s) => assert.deepEqual(TX.lintKo(s), [], s));
    [ph.a, ph.b, ph.c].forEach((s) => PHRASE_BANNED.forEach((w) => assert.ok(!s.includes(w), w)));
  }
});

/* ---------- 10. review round 1 (r3-ux.md): regressions ---------- */
test("review r3 K8: student log lines never show the 개입 level or the 보도사진 verdict; the teacher view keeps both", { skip: NO_FIX }, async () => {
  const TY = await fixMod("typical.mjs"), M = await fixMod("maximal.mjs");
  const verdict = TX.T.wppTag.split("{")[0], level = TX.T.levelTag.split("{")[0];   // 「보도사진 기준: 」, 「개입 」
  for (const ws of [TY.typical(), demoWs(), M.maximal()]) {
    const e = ws["s6f.edit"], sum = C.summarize(e);
    for (const st of S.STAGES) {
      const stu = C.opLines(e, st), tea = C.opLines(e, st, { audience: "teacher" });
      assert.deepEqual(C.opLines(e, st, { audience: "student" }), stu, "student is the default");
      assert.equal(stu.length, tea.length, st);
      stu.forEach((l) => { assert.ok(!l.includes(verdict) && !l.includes(level), l); });
      const strong = sum.filter((x) => S.OPS[x.op].st === st && x.l >= 4).length;
      assert.equal(stu.filter((l) => l.endsWith(TX.CORE_TEXT.sep + TX.CORE_TEXT.discloseTag)).length, strong, st + ": every level ≥ 4 edit in the image is marked");
      tea.filter((l) => l !== TX.T.traceOverlapLine).forEach((l, i) => {
        const x = sum.filter((y) => S.OPS[y.op].st === st)[i];
        if (x && x.w !== S.WPP.na) {
          assert.ok(l.includes(TX.fmt(TX.CORE_TEXT.levelNamed, { n: x.l, name: TX.LEVEL_LABEL[x.l] })), l);
          assert.ok(l.endsWith(TX.fmt(TX.T.wppTag, { w: TX.WPP_LABEL[x.w] })), l);
        }
      });
    }
  }
  const tone = TY.typicalEdit();
  assert.ok(C.opLines(tone, "tone").includes("레벨: 입력 12/243, 감마 1.12 · 평균 밝기 +6%"));
  assert.ok(C.opLines(tone, "tone", { audience: "teacher" }).includes("레벨: 입력 12/243, 감마 1.12 · 평균 밝기 +6% · 개입 2(밝기와 대비) · 보도사진 기준: 허용"));
  assert.ok(C.opLines(tone, "mark").includes("스케일 바: 5cm · 표기 문장에 밝힐 수정"));
});
test("review r3 K19, K20, K24: core wording (gap line, stage-note request, repeated tool)", () => {
  const ws = demoWs();
  assert.ok(C.buildPhrases({ ws, nowMs: NOW_MS }).b.startsWith(TX.fmt(TX.CORE_TEXT.genToolK, { tool: "미드저니 v7", k: 3 }) + ", "));
  assert.equal(TX.fmt(TX.CORE_TEXT.genToolK, { tool: "미드저니 v7", k: 3 }), "미드저니 v7 생성(3회)");
  assert.deepEqual(C.phraseGaps(ws["s6f.edit"], "이미지에 덧붙임 그려 넣음 부분 수정 외 2건"), ["수정 기록에 있는 ‘지움’이 AI 활용 범위 문장에는 없습니다."]);
  const n = ws["s6f.edit"];
  n.sr.crop = { t0: NOW, e: 1, d: 1, n: 1, ch: 1 };
  const it = C.finalizeCheck(ws, { feat: () => true }).items.find((x) => x.k === "note:crop");
  assert.equal(it.text, "‘자르기’에서 바꾼 내용을 기록하세요.");
  [TX.CORE_TEXT.discloseTag, TX.CORE_TEXT.levelNamed, TX.CORE_TEXT.gapLine, TX.CORE_TEXT.needStageNote, TX.CORE_TEXT.genToolK].forEach((s) => assert.deepEqual(TX.lintKo(s), [], s));
});

test("review r4 F7: the hero send needs both lower limits of the s7x.img upload preset (long side and short side)", () => {
  // the rule lives in src-media-img.js (CommonJS in node, so it is read as text, as the MISMATCH test reads src-lessons.jsx)
  const media = src("src-media-img.js");
  assert.ok(media.includes('if (fieldKey === "s7x.img") return IMG_PRESETS.hero;'), "s7x.img uses the hero preset");
  const m = /\bhero:\s*\{[^}]*\bminLong:\s*(\d+),\s*minShort:\s*(\d+)/.exec(media);
  assert.ok(m, "IMG_PRESETS.hero has minLong and minShort");
  const minLong = +m[1], minShort = +m[2];
  assert.equal(S.SEND.s7x.minLong, minLong);
  if (S.SEND.s7x.minShort !== undefined) assert.equal(S.SEND.s7x.minShort, minShort);
  const ws = demoWs();
  const hero = (w, h) => { const x = JSON.parse(JSON.stringify(ws)); x["s6f.edit"].m.out.w = w; x["s6f.edit"].m.out.h = h; return C.sendPlan(x).s7x; };
  const longNo = { ok: false, why: TX.fmt(TX.CORE_TEXT.heroLong, { n: minLong }) }, shortNo = { ok: false, why: TX.fmt(TX.CORE_TEXT.heroShort, { n: minShort }) };
  assert.deepEqual(hero(minLong, minShort), { ok: true, why: "" });
  assert.deepEqual(hero(minShort, minLong), { ok: true, why: "" }, "portrait");
  assert.deepEqual(hero(2000, minShort - 1), shortNo, "a wide strip is refused (was accepted before the fix)");
  assert.deepEqual(hero(minShort - 1, 2000), shortNo, "a tall strip is refused");
  assert.deepEqual(hero(minLong - 1, minLong - 1), longNo);
  assert.deepEqual(hero(minLong - 1, 200), longNo, "the long side is reported first");
  [longNo.why, shortNo.why].forEach((s) => assert.deepEqual(TX.lintKo(s), [], s));
});
