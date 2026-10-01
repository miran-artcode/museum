/* ============================================================
   이미지 다듬기 편집기 껍데기: 전체 화면 덧창, 표시줄, 과정 줄, 도구 막대, 옵션 표시줄, 보기와 포인터,
   키보드·한글 입력, 잠금·뒤로 가기·초점, 충돌 표시줄, 휴대전화의 가벼운 편집, EditorSession 연결
   (spec §4, §5.4 src-photo.jsx, §6.7–§6.10)
   담당 D. 덧창은 FolioPad 안에서(LockSet·data-fk 안) 그린다: portal, showModal, Fullscreen API를 쓰지 않는다.
   · 한글 문구는 src-photo-text.mjs(편집기 전용)와 src-portfolio-text.mjs(카드와 함께 쓰는 이름)에서만 가져온다.
   · 문서·합성·저장은 C(doc/render/io), 픽셀·표식·붓은 B(px/marks/brush)의 §5.4 계약만 부른다.
     그쪽이 아직 자리 표시 구현이어도 화면은 돌아가야 하므로, 결과가 비거나 null이면 조용히 넘어간다.
   · 끌기 중에는 DOM 노드를 더하거나 빼지 않고 class·aria-pressed도 바꾸지 않는다(A11yRuntime 비용, spec §4.3).
     표시는 style.transform, 캔버스 픽셀, SVG 좌표 속성으로만 바꾼다.
   ============================================================ */
import React, { useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { WsLockCtx, WsSavedCtx } from "./src-ws-lock.jsx";
import { lockScroll } from "./src-folio-ui.jsx";
import { STAGES, STAGE_FEAT, KEYS, LIMITS, ITEMS, feat, pOk } from "./src-folio-schema.mjs";
import { STAGE_TEXT, T, CELL_LABEL, ITEM_LABEL, CORE_TEXT, fmt, josa } from "./src-portfolio-text.mjs";
import { PANEL_TEXT as P, OPT_TEXT as O, TOOL_TEXT, ERR_TEXT, SHORTCUT_TEXT, tooltip, histLabel } from "./src-photo-text.mjs";
import { PhotoDoc, makeGfx } from "./src-photo-doc.mjs";
import { Renderer } from "./src-photo-render.mjs";
import { BrushEngine } from "./src-photo-brush.mjs";
import * as IO from "./src-photo-io.mjs";
const { getSaver, devId, mediaCache, decodeImage, drafts, tabLock } = IO;
import {
  normEdit, normSteps, normNotes, normTrash, baseChoice, routeInit, routedStages, stageRecUpdate, appendLog, classifyOp,
  totalUpd, migrate, liveRefs, trashRefs, addTrash, fmtArea, setNote as coreSetNote,
} from "./src-portfolio-core.mjs";
import { wand, backgroundMask, maskFeather, maskEdges, maskBBox, maskCoverage, straightenAngle, autoCropScale, greyPointCurves, objectBox, curveLut } from "./src-photo-px.mjs";
import { drawMark, drawText, markBox, hitMarks, ensureFont, autoPlace } from "./src-photo-marks.mjs";
import {
  CheckPanel, PatchPanel, CropPanel, TonePanel, FixPanel, MarkPanel, FinalPanel, LayersPanel, PropsPanel, HistoryPanel, InfoPanel,
  Icon, PeRange, PeSeg, PeSelect, PeCheck, layerName, newParams, pruneP, RATIOS,
} from "./src-photo-panels.jsx";

/* ---------- small helpers ---------- */
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isPlain = (o) => !!o && typeof o === "object" && !Array.isArray(o);
const nowS = () => Math.floor(Date.now() / 1000);
const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));
const hhmm = (ms) => { const d = new Date(ms || Date.now()); return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
const mdhm = (ms) => { const d = new Date(ms || Date.now()); return (d.getMonth() + 1) + "/" + d.getDate() + " " + hhmm(ms); };
const reduceMotion = () => {
  try { return (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) || document.documentElement.hasAttribute("data-ax-motion"); }
  catch (e) { return false; }
};
/* 2D affine [a, b, c, d, e, f]: (x, y) → (a x + c y + e, b x + d y + f) */
const mMul = (A, B) => [A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1], A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
  A[0] * B[4] + A[2] * B[5] + A[4], A[1] * B[4] + A[3] * B[5] + A[5]];
const mApply = (M, x, y) => ({ x: M[0] * x + M[2] * y + M[4], y: M[1] * x + M[3] * y + M[5] });
const mCss = (M) => "matrix(" + M.map((v) => (Math.abs(v) < 1e-9 ? 0 : +v.toFixed(6))).join(",") + ")";
const okM = (M) => Array.isArray(M) && M.length === 6 && M.every((v) => Number.isFinite(v));

/* ---------- prefs (sessionStorage "museum:photoPrefs", never localStorage; try/catch everywhere) ---------- */
const PREF_KEY = "museum:photoPrefs";
/** the document this tab's editor last attached to the Saver singleton (D19: a closing editor detaches only its own document), and
 *  the closing of the last editor of this tab: {owner, lock, run} until its close save has landed or stopped (gate B2) */
const ATT = { doc: null, closing: null };
/** how long an opening waits for the previous editor's close save before it loads anyway (gate B2); harness: __PHX_TEST__.prevWaitMs */
const prevWaitMs = () => { const t = globalThis.__PHX_TEST__; return t && Number.isFinite(t.prevWaitMs) ? t.prevWaitMs : 150000; };
const saverBusy = (sv) => { try { return !!(sv && sv.busy); } catch (e) { return false; } };
function loadPrefs() {
  try { const v = JSON.parse(sessionStorage.getItem(PREF_KEY) || "null"); return isPlain(v) ? v : {}; } catch (e) { return {}; }
}
function savePrefs(p) { try { sessionStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) { /* private mode or quota */ } }

/* ---------- tools (§4.6). kind decides the pointer gesture; st the owning stage ("*" = every stage) ---------- */
export const TOOLS = {
  move: { st: "*", code: "KeyV", kind: "move" },
  hand: { st: "*", code: "KeyH", kind: "hand" },
  zoom: { st: "*", code: "KeyZ", kind: "zoom" },
  eyedrop: { st: "check", code: "KeyI", kind: "pick" },
  pin: { st: "check", code: "KeyP", kind: "pin" },
  light: { st: "check", kind: "light" },
  maskBrush: { st: "patch", code: "KeyB", kind: "brush", flag: "mask" },
  crop: { st: "crop", code: "KeyC", kind: "crop" },
  straighten: { st: "crop", kind: "strline" },
  selRect: { st: "tone", code: "KeyM", kind: "sel" },
  selLasso: { st: "tone", code: "KeyL", kind: "sel" },
  selWand: { st: "tone", code: "KeyW", kind: "sel" },
  spot: { st: "fix", code: "KeyJ", kind: "brush", flag: "fix" },
  heal: { st: "fix", code: "KeyJ", shift: true, kind: "brush", flag: "fix" },
  clone: { st: "fix", code: "KeyS", kind: "brush", flag: "fix" },
  dodge: { st: "fix", code: "KeyO", kind: "brush", flag: "fix" },
  trace: { st: "fix", code: "KeyK", kind: "brush", flag: "trace" },
  sponge: { st: "fix", kind: "brush", flag: "fix" },
  blurB: { st: "fix", kind: "brush", flag: "fix" },
  sharpB: { st: "fix", kind: "brush", flag: "fix" },
  erase: { st: "fix", code: "KeyE", kind: "brush", flag: "fix" },
  measure: { st: "mark", kind: "measure" },
  text: { st: "mark", code: "KeyT", kind: "text" },
};
/** primary tools (stage view) and 「자세히」 extras per stage; 이동 · 손 · 돋보기 follow in every stage */
export const STAGE_TOOLS = {
  check: { main: ["pin", "eyedrop"], adv: ["light"] },
  patch: { main: ["maskBrush"], adv: [] },
  crop: { main: ["crop", "straighten"], adv: [] },
  tone: { main: ["selRect", "selLasso", "selWand"], adv: ["maskBrush", "eyedrop"] },
  fix: { main: ["spot", "heal", "clone", "dodge", "trace"], adv: ["sponge", "blurB", "sharpB", "erase", "selRect", "selLasso", "selWand"] },
  mark: { main: ["measure", "text"], adv: [] },
  final: { main: [], adv: [] },
};
const COMMON_TOOLS = ["move", "hand", "zoom"];
const DEFAULT_TOOL = { check: "hand", patch: "move", crop: "crop", tone: "hand", fix: "hand", mark: "move", final: "hand" };
const PAINT = new Set(["maskBrush", "spot", "heal", "clone", "dodge", "trace", "sponge", "blurB", "sharpB", "erase"]);
/** tool option defaults (sizes in base px; size 0 = a share of the long side, §4.6) */
export const OPT_DEF = {
  maskBrush: { size: 60, hard: 30, mode: 0 },
  spot: { size: 12, hard: 50 },
  heal: { size: 0, hard: 50, aligned: 1, sample: 0 },
  clone: { size: 0, hard: 60, op: 100, flow: 100, aligned: 1, sample: 0, press: 0 },
  dodge: { mode: 0, range: 1, exposure: 15, protect: 1, size: 0, hard: 0 },
  trace: { preset: 1, size: 24, strength: 40, press: 0, ce: 0 },
  sponge: { mode: 0, flow: 20, vib: 1, size: 0, hard: 0 },
  blurB: { size: 0, strength: 40, hard: 0 },
  sharpB: { size: 0, strength: 40, hard: 0 },
  erase: { size: 30, hard: 50 },
  selRect: { mode: 0, feather: 0 },
  selLasso: { mode: 0, feather: 0 },
  selWand: { mode: 0, tol: 24, contig: 1, all: 1 },
  crop: { ratio: 0, guide: 0, extend: 0 },
  eyedrop: { sample: 2 },
  zoom: { out: 0 },
  pin: { kind: 1, it: 0, ce: 0 },
  text: { fn: 0, sz: 40, color: 0, wt: 0, al: 0 },
};
const SIZE_SHARE = { heal: 0.025, clone: 0.025, dodge: 0.05, sponge: 0.05, blurB: 0.05, sharpB: 0.05 };
const SAMPLE_PX = [1, 3, 5];
const TEXT_RGB = [[0, 0, 0], [255, 255, 255]];

function toolAvail(id, { phone }) {
  const t = TOOLS[id];
  if (!t) return false;
  if (t.flag === "fix") return feat("fix") && !phone;
  if (t.flag === "trace") return feat("fix") && feat("trace");   // review C1: also in the phone's 「가벼운 편집」
  if (t.flag === "mask") return (feat("patch") || feat("fix")) && !phone;
  return true;
}

/* ---------- EditorSession (§5.3, §5.4): the non-document half of the manifest ---------- */
const PR_DEF = { mode: 1, paper: 0, bw: 0, ppi: 240 };
function makeSession(src, doc, wsRef) {
  const e = isPlain(src) ? src : {};
  const s = {
    sr: isPlain(e.sr) ? clone(e.sr) : {},
    pr: isPlain(e.pr) ? { ...PR_DEF, ...clone(e.pr) } : { ...PR_DEF },
    st: Number.isInteger(e.st) ? e.st : 0,
    snaps: Array.isArray(e.snaps) ? clone(e.snaps) : [],
    m: isPlain(e.m) ? clone(e.m) : { base: null, out: null, cmp: null },
    log: Array.isArray(e.log) ? clone(e.log) : [],
    lastSavedDocRev: doc ? doc.rev : 0,
    /** mine = docPart + m, sr, snaps, st, pr and log = log base with History.logDeltas() folded in (classifyOp per delta) */
    apply(part) {
      const p = isPlain(part) ? part : {};
      const t = nowS();
      const live = { ...(normEdit(wsRef.current && wsRef.current[KEYS.edit]) || {}), ...p, sr: s.sr, m: s.m };
      let log = Array.isArray(s.log) ? s.log : [];
      const deltas = doc && doc.history && typeof doc.history.logDeltas === "function" ? doc.history.logDeltas() : [];
      for (const it of deltas || []) {
        const d = it && it.delta;
        if (!isPlain(d) || !d.o) continue;
        const rec = (p.L || []).find((r) => r && r.id === d.y) || null;
        const c = classifyOp(d.o, rec, live) || { l: 0, w: 9 };
        const st = Number.isInteger(d.s) ? d.s : Math.max(0, STAGES.indexOf(it.stage));
        log = appendLog(log, { ...d, s: st, l: c.l, w: c.w }, t);
      }
      const out = { ...p, m: s.m, sr: s.sr, snaps: s.snaps, st: s.st, log };
      const pr = s.pr || PR_DEF;
      out.pr = { ...pr };   // always explicit: mergeManifest takes pr from mine, so a reset to the default must be written too
      return out;
    },
  };
  return s;
}

/* ---------- scanline fill of a polygon (base px) into a work-area mask ---------- */
function fillPoly(pts, wa) {
  const m = new Uint8Array(wa.w * wa.h);
  if (!pts || pts.length < 3) return m;
  const P2 = pts.map((p) => ({ x: p.x - wa.x, y: p.y - wa.y }));
  let y0 = Infinity, y1 = -Infinity;
  P2.forEach((p) => { y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); });
  y0 = clamp(Math.floor(y0), 0, wa.h - 1); y1 = clamp(Math.ceil(y1), 0, wa.h - 1);
  const xs = [];
  for (let y = y0; y <= y1; y++) {
    const yc = y + 0.5;
    xs.length = 0;
    for (let i = 0, j = P2.length - 1; i < P2.length; j = i++) {
      const a = P2[i], b = P2[j];
      if ((a.y > yc) !== (b.y > yc)) xs.push(a.x + ((yc - a.y) * (b.x - a.x)) / (b.y - a.y));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = clamp(Math.ceil(xs[k] - 0.5), 0, wa.w), xb = clamp(Math.floor(xs[k + 1] - 0.5), -1, wa.w - 1);
      if (xb >= xa) m.fill(255, y * wa.w + xa, y * wa.w + xb + 1);
    }
  }
  return m;
}
/** a mask computed on a base-sized plane, placed into the work area */
function toWa(mask, w, h, wa) {
  if (w === wa.w && h === wa.h) return mask;
  const out = new Uint8Array(wa.w * wa.h);
  for (let y = 0; y < h; y++) {
    const ty = y - wa.y;
    if (ty < 0 || ty >= wa.h) continue;
    for (let x = 0; x < w; x++) { const tx = x - wa.x; if (tx >= 0 && tx < wa.w) out[ty * wa.w + tx] = mask[y * w + x]; }
  }
  return out;
}

/* ---------- live geometry for drafts (only while dragging; the renderer is the truth after a commit) ---------- */
function rotAbout(M, cx, cy, deg) {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return mMul([1, 0, 0, 1, cx, cy], mMul([c, s, -s, c, 0, 0], mMul([1, 0, 0, 1, -cx, -cy], M)));
}

/* ============================================================ */
/**
 * @param {{ owner:string, store:MediaStore, ws:object, setField?:SetField, wsSaved:boolean, locked:boolean,
 *   readOnly:boolean, preview:boolean, inspectItems:{k:string,label:string,hint:string}[], saver?:Saver,
 *   onClose:(reason:"user"|"lock"|"back"|"rebase")=>void, openerRef?:{current:HTMLElement|null},
 *   registerFlush?:(fn:(()=>Promise<boolean>)|null)=>void, onDirty?:(s:{current:boolean, unsaved:boolean, uploading:number})=>void }} props
 */
export function PhotoEditor(props) {
  const t0 = globalThis.__PHX_TEST__;
  if (t0 && t0.throwIn === "PhotoEditor") throw new Error("__PHX_TEST__.throwIn PhotoEditor");
  const { owner, store, ws, wsSaved, inspectItems, onClose, openerRef, registerFlush, onDirty } = props;
  const lockCtx = useContext(WsLockCtx);
  const savedCtx = useContext(WsSavedCtx);
  const locked = !!(props.locked || lockCtx);
  const lockedNow = useRef(locked); lockedNow.current = locked;
  const wsRef = useRef(ws || {}); wsRef.current = ws || {};
  const setFieldRef = useRef(props.setField); setFieldRef.current = props.setField;
  const propsRef = useRef(props); propsRef.current = props;
  const preview = !!props.preview || owner === "preview";

  /* DOM refs */
  const rootRef = useRef(null), titleRef = useRef(null), viewRef = useRef(null), paneRef = useRef(null), outRef = useRef(null);
  const stageRef = useRef(null), cvRef = useRef(null), mkRef = useRef(null), uiRef = useRef(null), covRef = useRef(null);
  const outBRef = useRef(null), beforeHostRef = useRef(null), wipeHostRef = useRef(null), wipeStageRef = useRef(null), stageBRef = useRef(null);
  const zoomTxtRef = useRef(null), posTxtRef = useRef(null), rgbTxtRef = useRef(null), txtRef = useRef(null), stageHeadRef = useRef(null);
  const keysDlgRef = useRef(null), keysBtnRef = useRef(null), keysWas = useRef(false);

  /* engine (mutable, outside React) */
  const E = useRef(null);
  if (!E.current) E.current = { gfx: null, doc: null, rend: null, brush: null, saver: null, session: null, lock: null, img: null, baseSg: "",
    loadedCrev: 0, savedRev: { rev: 0, prev: 0 }, planRev: null, dev: devId(), outside: new Set(), outsideTold: new Set(), routeSeed: null,
    beforeSurf: null, lastAct: Date.now(), idleSince: Date.now(), stageT: 0, unsub: null, disposed: false, missing: [] };
  const eng = E.current;

  /* UI state */
  const prefs0 = useRef(null);
  if (!prefs0.current) prefs0.current = loadPrefs();
  const [phase, setPhase] = useState("loading");     // loading | ready | noBase | baseErr | memErr
  const [, setTickN] = useState(0);
  const tickRaf = useRef(0);
  const bump = () => { if (tickRaf.current) return; tickRaf.current = requestAnimationFrame(() => { tickRaf.current = 0; setTickN((n) => n + 1); }); };
  const [stage, setStageS] = useState("check");
  const stageNow = useRef("check"); stageNow.current = stage;
  const [tool, setToolS] = useState("hand");
  const toolNow = useRef("hand"); toolNow.current = tool;
  const [adv, setAdv] = useState(!!prefs0.current.adv);
  const [all, setAll] = useState(!!prefs0.current.all && feat("all"));
  const [opts, setOpts] = useState(() => {
    const o = {};
    Object.keys(OPT_DEF).forEach((k) => { o[k] = { ...OPT_DEF[k], ...((prefs0.current.opt && prefs0.current.opt[k]) || {}) }; });
    return o;
  });
  const optsNow = useRef(opts); optsNow.current = opts;
  const [open, setOpen] = useState(() => ({ props: true, layers: true, hist: false, info: false, ...(prefs0.current.open || {}) }));
  const [sheetTab, setSheetTab] = useState("process");
  const [sheetBig, setSheetBig] = useState(false);
  const [fingerPaint, setFingerPaint] = useState(!!prefs0.current.finger);
  const [toastMsg, setToastMsg] = useState("");
  const [alertMsg, setAlertMsg] = useState("");
  const [closeBar, setCloseBar] = useState("");      // "" | ask | saving | fail
  const [conflict, setConflict] = useState(false);
  const [conflictHeld, setConflictHeld] = useState(false);   // a save was held by the bar: the edits are in this device's draft
  const [draftOffer, setDraftOffer] = useState(null);
  const [secondTab, setSecondTab] = useState(false);
  const [versionRO, setVersionRO] = useState(false);
  const [missingN, setMissingN] = useState(0);
  const [keysOpen, setKeysOpen] = useState(false);
  const [saveSt, setSaveSt] = useState({ phase: "idle", done: 0, total: 0, at: 0, err: "" });
  const [flip, setFlip] = useState(false);
  const flipNow = useRef(false); flipNow.current = flip;
  const [hold, setHold] = useState(false);
  const [cmpMode, setCmpMode] = useState("none");
  const [wipe, setWipe] = useState(50);
  const [origLayout, setOrigLayout] = useState(false);
  const [viewHide, setViewHide] = useState([]);
  const [scope, setScope] = useState(0);             // 0 전체 · 1 배경만 · 2 선택 영역
  const [armed, setArmed] = useState(null);         // { kind:"grey"|"source"|"fill", id? }
  const armedNow = useRef(null); armedNow.current = armed;
  const [textEd, setTextEd] = useState(null);       // { id|null, x, y (‰), s }
  const textEdNow = useRef(null); textEdNow.current = textEd;
  const [selMark, setSelMark] = useState(0);        // selected ov/txt layer id (move tool, arrows)
  const [selPin, setSelPin] = useState(-1);
  const [measure, setMeasure] = useState(null);     // draft measure line {a,b,c,d} base px
  const [cropDraft, setCropDraft] = useState(null); // { x, y, w, h } output px while the crop tool edits
  const cropNow = useRef(null); cropNow.current = cropDraft;
  const [vp, setVp] = useState(() => ({ w: typeof innerWidth === "number" ? innerWidth : 1366, h: typeof innerHeight === "number" ? innerHeight : 900 }));
  const coarse = useRef(false);
  if (typeof matchMedia === "function") { try { coarse.current = matchMedia("(pointer: coarse)").matches; } catch (e) { /* ignore */ } }
  const phone = vp.w <= 640 || vp.h <= 520;
  const portrait = !phone && vp.w <= 1023;
  const memClass = phone ? "phone" : coarse.current ? "touch" : "desk";

  const ready = phase === "ready";
  const { doc, rend } = eng;
  const editRaw = wsRef.current[KEYS.edit];
  const edit = normEdit(editRaw);
  const confirmed = !!(edit && edit.done && edit.done.at > 0);
  const canWrite = !props.readOnly && !preview && typeof props.setField === "function" && !secondTab && !versionRO;
  const editable = canWrite && !confirmed && !locked && ready && !draftOffer;
  const editableNow = useRef(false); editableNow.current = editable;

  /* ---------- toasts and alerts (one polite region; alerts are role=alert) ---------- */
  const toastT = useRef(0);
  const toast = (msg) => { setToastMsg(msg || ""); clearTimeout(toastT.current); if (msg) toastT.current = setTimeout(() => setToastMsg(""), 3200); };
  const showAlert = (msg) => setAlertMsg(msg || "");
  const errText = (code) => {
    if (code === "memory" && eng.memTrimFail) { eng.memTrimFail = false; return P.memTrimFail; }
    return ERR_TEXT[code] || (code ? ERR_TEXT.limit : "");
  };
  /* gate N4, DOC15: on a memory refusal free the render caches and the oldest undo steps (enough for one work-area layer), then
     retry once. fn → a truthy result on success; the caller reports a failure through errText(d.lastError) as before */
  const memRetry = (fn) => {
    const d = eng.doc;
    const isMem = (e) => !!(d && (d.lastError === "memory" || (e && e.code === "memory") || (eng.brush && eng.brush.lastError === "memory")));
    let r = null, err = null;
    try { r = fn(); } catch (e) { r = null; err = e; }
    if (r || !d || !isMem(err)) { if (err) throw err; return r; }
    try { if (eng.rend && typeof eng.rend.freeCaches === "function") eng.rend.freeCaches(); } catch (e) { /* ignore */ }
    let tr = null;
    try { if (typeof d.trimHistory === "function") tr = d.trimHistory({ need: Math.max(1, (d.wa ? d.wa.w * d.wa.h : d.w * d.h) * 4) }); } catch (e) { tr = null; }
    d.lastError = "";
    if (eng.brush && eng.brush.lastError === "memory") eng.brush.lastError = "";
    err = null;
    try { r = fn(); } catch (e) { r = null; err = e; }
    const trimmed = !!(tr && tr.dropped > 0);
    if (r) { if (trimmed) showAlert(P.memTrimmed); return r; }   // an alert, not a toast: the undo steps are gone for good
    if (isMem(err)) { d.lastError = "memory"; eng.memTrimFail = trimmed; return null; }
    if (err) throw err;
    return r;
  };

  /* ---------- view transform ---------- */
  const V = useRef({ s: 1, tx: 0, ty: 0, fit: true }).current;
  const outSz = () => { const r = eng.rend; const o = r && r.outSize ? r.outSize() : null; return o && o.w > 0 && o.h > 0 ? o : { w: (eng.doc && eng.doc.w) || 1, h: (eng.doc && eng.doc.h) || 1 }; };
  const paneSize = () => { const el = paneRef.current; return el ? { w: el.clientWidth || 1, h: el.clientHeight || 1 } : { w: 800, h: 600 }; };
  const dprNow = () => Math.min(2, (typeof devicePixelRatio === "number" && devicePixelRatio) || 1);
  const zoomOf = (el) => { if (!el) return 1; const r = el.getBoundingClientRect(); return el.currentCSSZoom || (el.offsetWidth ? r.width / el.offsetWidth : 1) || 1; };
  /** client → pane-local CSS px, zoom-safe (§4.3; sketch §5.8 measured fix) */
  const localOf = (cx, cy) => {
    const el = paneRef.current;
    if (!el) return { x: 0, y: 0 };
    const r = el.getBoundingClientRect(), z = zoomOf(el);
    return { x: (cx - r.left) / z - el.clientLeft, y: (cy - r.top) / z - el.clientTop };
  };
  const viewM = () => { const o = outSz(); return flipNow.current ? [-V.s, 0, 0, V.s, V.tx + V.s * o.w, V.ty] : [V.s, 0, 0, V.s, V.tx, V.ty]; };
  const toOut = (lx, ly) => { const o = outSz(), x = (lx - V.tx) / V.s; return { x: flipNow.current ? o.w - x : x, y: (ly - V.ty) / V.s }; };
  const fromOut = (ox, oy) => { const o = outSz(); return { x: V.tx + V.s * (flipNow.current ? o.w - ox : ox), y: V.ty + V.s * oy }; };
  const geoM = () => { const r = eng.rend; const M = r && r.geoMatrix ? r.geoMatrix() : null; return okM(M) ? M : [1, 0, 0, 1, 0, 0]; };
  const b2o = (x, y) => { const r = eng.rend; const q = r && r.baseToOut ? r.baseToOut(x, y) : null; return q && Number.isFinite(q.x) ? q : mApply(geoM(), x, y); };
  const o2b = (x, y) => { const r = eng.rend; const q = r && r.outToBase ? r.outToBase(x, y) : null; return q && Number.isFinite(q.x) ? q : { x, y }; };
  const scaleBounds = () => { const z = zoomOf(paneRef.current) * dprNow(); return { min: 0.05 / z, max: 16 / z }; };
  const pctOf = () => Math.round(V.s * zoomOf(paneRef.current) * ((typeof devicePixelRatio === "number" && devicePixelRatio) || 1) * 100);
  /** the box the view fits: the output frame, or the whole work area while the crop tool edits */
  const frameBox = () => {
    const o = outSz();
    if (toolNow.current !== "crop" || !eng.doc) return { x: 0, y: 0, w: o.w, h: o.h };
    const wa = eng.doc.wa || { x: 0, y: 0, w: o.w, h: o.h };
    const cs = [b2o(wa.x, wa.y), b2o(wa.x + wa.w, wa.y), b2o(wa.x, wa.y + wa.h), b2o(wa.x + wa.w, wa.y + wa.h)];
    const xs = cs.map((p) => p.x).concat([0, o.w]), ys = cs.map((p) => p.y).concat([0, o.h]);
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
  };
  const applyView = () => {
    const out = outRef.current;
    if (!out) return;
    const css = mCss(viewM());
    out.style.transform = css;
    if (outBRef.current) outBRef.current.style.transform = css;
    const o = outSz();
    out.style.width = o.w + "px"; out.style.height = o.h + "px";
    if (outBRef.current) { outBRef.current.style.width = o.w + "px"; outBRef.current.style.height = o.h + "px"; }
    const pct = pctOf();
    if (zoomTxtRef.current && zoomTxtRef.current.firstChild) zoomTxtRef.current.firstChild.nodeValue = fmt(P.zoom, { n: pct });
    out.dataset.px = pct >= 200 ? "1" : "";
    drawUi();
    scheduleMarks();
  };
  const fitView = () => {
    const b = frameBox(), ps = paneSize(), m = phone ? 8 : 20;
    const s = Math.min((ps.w - 2 * m) / Math.max(1, b.w), (ps.h - 2 * m) / Math.max(1, b.h));
    const sb = scaleBounds();
    V.s = clamp(s > 0 ? s : 0.1, sb.min, sb.max);
    const o = outSz();
    const bx = flipNow.current ? o.w - b.x - b.w : b.x;
    V.tx = (ps.w - b.w * V.s) / 2 - bx * V.s; V.ty = (ps.h - b.h * V.s) / 2 - b.y * V.s; V.fit = true;
    applyView();
  };
  const clampPan = () => {
    const o = outSz(), ps = paneSize(), keep = 48;
    const w = o.w * V.s, h = o.h * V.s;
    V.tx = clamp(V.tx, keep - w, ps.w - keep); V.ty = clamp(V.ty, keep - h, ps.h - keep);
  };
  const zoomAt = (s, lx, ly) => {
    const q = toOut(lx, ly), sb = scaleBounds();
    V.s = clamp(s, sb.min, sb.max);
    const o = outSz();
    V.tx = lx - V.s * (flipNow.current ? o.w - q.x : q.x); V.ty = ly - V.s * q.y; V.fit = false;
    clampPan(); applyView();
  };
  const zoomBy = (k) => { const ps = paneSize(); zoomAt(V.s * k, ps.w / 2, ps.h / 2); };
  const zoom100 = () => { const ps = paneSize(); const z = zoomOf(paneRef.current) * ((typeof devicePixelRatio === "number" && devicePixelRatio) || 1); zoomAt(1 / z, ps.w / 2, ps.h / 2); };

  /* ---------- stage transform (base → output), work-area canvas placement ---------- */
  const placeStage = (M) => {
    const d = eng.doc;
    if (!d) return;
    const css = mCss(M || geoM());
    [stageRef.current, stageBRef.current, wipeStageRef.current].forEach((el) => { if (el) el.style.transform = css; });
    const wa = d.wa || { x: 0, y: 0, w: d.w, h: d.h };
    const cv = cvRef.current;
    if (cv) { cv.style.left = wa.x + "px"; cv.style.top = wa.y + "px"; cv.style.width = wa.w + "px"; cv.style.height = wa.h + "px"; }
    const o = outSz();
    if (wipeHostRef.current) { wipeHostRef.current.style.width = o.w + "px"; wipeHostRef.current.style.height = o.h + "px"; }
    if (covRef.current) { covRef.current.style.width = o.w + "px"; covRef.current.style.height = o.h + "px"; }
  };

  /* ---------- display rendering (one at a time; new input aborts a slow full-resolution pass) ---------- */
  const R = useRef({ busy: false, req: null, raf: 0, ctl: null }).current;
  const requestRender = (o = {}) => {
    const a = R.req;
    R.req = a ? { interactive: !!o.interactive, rect: a.rect && o.rect ? unionRect(a.rect, o.rect) : null, preview: "preview" in o ? o.preview : a.preview } : { ...o };
    /* a slow full-resolution pass gives way to new input; paint (rect) and proxy passes are short and run to completion */
    if (R.busy && R.ctl && R.cur && !R.cur.rect && !R.cur.interactive) { try { R.ctl.abort(); } catch (e) { /* ignore */ } }
    if (!R.raf && !R.busy) R.raf = requestAnimationFrame(runRender);
  };
  const runRender = async () => {
    R.raf = 0;
    if (R.busy) return;
    const o = R.req; R.req = null;
    if (!o || !eng.rend || !cvRef.current || eng.disposed) return;
    R.busy = true; R.cur = o;
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    R.ctl = ctl;
    try {
      await eng.rend.renderDisplay(cvRef.current, { interactive: !!o.interactive, rect: o.rect || null, preview: o.preview || null, signal: ctl ? ctl.signal : undefined });
    } catch (e) { if (!(e && e.name === "AbortError")) { try { console.warn("[photo] render", e); } catch (e2) { /* ignore */ } } }
    R.busy = false; R.ctl = null; R.cur = null;
    placeStage();
    if (R.req && !R.raf) R.raf = requestAnimationFrame(runRender);
  };

  /* ---------- marks and text (output space; drawn with B's vector routines) ---------- */
  const M = useRef({ raf: 0, t: 0, override: null }).current;
  const scheduleMarks = () => { clearTimeout(M.t); M.t = setTimeout(() => { if (!M.raf) M.raf = requestAnimationFrame(drawMarks); }, 60); };
  const markRecs = () => {
    const d = eng.doc;
    if (!d) return [];
    const hide = new Set(viewHideNow.current || []);
    return d.layers.filter((L) => (L.k === "ov" || L.k === "txt") && L.vis !== 0 && !hide.has(L.id) && !L.missing && !L.opaque);
  };
  const drawMarks = async () => {
    M.raf = 0;
    const cv = mkRef.current, d = eng.doc, r = eng.rend;
    if (!cv || !d || !r) return;
    const o = outSz();
    const k = clamp(Math.min(V.s * dprNow(), 2048 / Math.max(o.w, o.h)), 0.25, 2);
    const W = Math.max(1, Math.round(o.w * k)), H = Math.max(1, Math.round(o.h * k));
    if (cv.width !== W) cv.width = W;
    if (cv.height !== H) cv.height = H;
    cv.style.width = o.w + "px"; cv.style.height = o.h + "px";
    const ctx = cv.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
    const ppc = r.ppc ? r.ppc() : null;
    const editing = textEdNow.current && textEdNow.current.id;
    for (const L0 of markRecs()) {
      if (editing && L0.id === editing) continue;
      const L = M.override && M.override.id === L0.id ? { ...L0, p: M.override.p } : L0;
      try {
        ctx.save(); ctx.globalAlpha = L.op == null ? 1 : L.op;
        if (L.k === "txt") { await ensureFont((L.p && L.p.fn) || 0, (L.p && L.p.s) || ""); drawText(ctx, L, o.w, o.h, k); }
        else drawMark(ctx, L, o.w, o.h, k, ppc);
      } catch (e) { /* B's routine not ready */ }
      ctx.restore();
    }
  };
  const viewHideNow = useRef([]); viewHideNow.current = viewHide;

  /* ---------- UI canvas (screen space): marching ants, brush ring, temporary mask flash ---------- */
  const U = useRef({ ants: null, antsRev: -1, dash: 0, ring: null, flash: null, timer: 0 }).current;
  const screenM = () => mMul(viewM(), geoM());   // base → pane CSS px
  const drawUi = () => {
    const cv = uiRef.current, pane = paneRef.current;
    if (!cv || !pane) return;
    const k = dprNow(), w = pane.clientWidth, h = pane.clientHeight;
    if (cv.width !== Math.round(w * k)) cv.width = Math.round(w * k);
    if (cv.height !== Math.round(h * k)) cv.height = Math.round(h * k);
    cv.style.width = w + "px"; cv.style.height = h + "px";
    const ctx = cv.getContext("2d");
    ctx.setTransform(k, 0, 0, k, 0, 0); ctx.clearRect(0, 0, w, h);
    const d = eng.doc;
    if (!d) return;
    const S = screenM(), wa = d.wa || { x: 0, y: 0, w: d.w, h: d.h };
    if (U.flash && U.flash.cv) {
      ctx.save();
      const sx = wa.w / U.flash.cv.width, sy = wa.h / U.flash.cv.height;
      const F = mMul(S, [sx, 0, 0, sy, wa.x, wa.y]);
      ctx.setTransform(k * F[0], k * F[1], k * F[2], k * F[3], k * F[4], k * F[5]);
      ctx.globalAlpha = 0.5; ctx.drawImage(U.flash.cv, 0, 0);
      ctx.restore();
      ctx.setTransform(k, 0, 0, k, 0, 0);
    }
    if (d.sel && d.sel.m) {
      if (U.antsRev !== d.sel.rev || !U.ants) {
        let e = null;
        try { e = maskEdges(d.sel.m, wa.w, wa.h); } catch (er) { e = null; }
        U.ants = e && e.length ? e : null; U.antsRev = d.sel.rev;
        if (!U.ants) { const bb = maskBBox(d.sel.m, wa.w, wa.h); if (bb) U.ants = Int32Array.from([bb.x, bb.y, bb.x + bb.w, bb.y, bb.x + bb.w, bb.y, bb.x + bb.w, bb.y + bb.h, bb.x + bb.w, bb.y + bb.h, bb.x, bb.y + bb.h, bb.x, bb.y + bb.h, bb.x, bb.y]); }
      }
      if (U.ants) {
        ctx.beginPath();
        for (let i = 0; i + 3 < U.ants.length; i += 4) {
          const a = mApply(S, U.ants[i] + wa.x, U.ants[i + 1] + wa.y), b = mApply(S, U.ants[i + 2] + wa.x, U.ants[i + 3] + wa.y);
          ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        }
        ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
        ctx.strokeStyle = "#000"; ctx.lineDashOffset = U.dash; ctx.stroke();
        ctx.strokeStyle = "#fff"; ctx.lineDashOffset = U.dash + 4; ctx.stroke();
        ctx.setLineDash([]);
      }
    } else { U.ants = null; U.antsRev = -1; }
    if (U.ring) {
      ctx.beginPath(); ctx.arc(U.ring.x, U.ring.y, Math.max(1, U.ring.r), 0, Math.PI * 2);
      ctx.lineWidth = 1; ctx.strokeStyle = "#000"; ctx.stroke();
      ctx.beginPath(); ctx.arc(U.ring.x, U.ring.y, Math.max(1, U.ring.r) + 1, 0, Math.PI * 2); ctx.strokeStyle = "#fff"; ctx.stroke();
    }
  };
  /** 50 % red overlay of a work-area mask for 1.5 s (new masked adjustment layer, §4.8) */
  const flashMask = (mask) => {
    const d = eng.doc;
    if (!d || !mask) return;
    const wa = d.wa || { x: 0, y: 0, w: d.w, h: d.h };
    const s = Math.min(1, 512 / Math.max(wa.w, wa.h)), w = Math.max(1, Math.round(wa.w * s)), h = Math.max(1, Math.round(wa.h * s));
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    const ctx = cv.getContext("2d"), img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = mask[Math.min(wa.h - 1, Math.floor(y / s)) * wa.w + Math.min(wa.w - 1, Math.floor(x / s))], i = (y * w + x) * 4;
      img.data[i] = 230; img.data[i + 1] = 20; img.data[i + 2] = 20; img.data[i + 3] = v;
    }
    ctx.putImageData(img, 0, 0);
    if (U.flash && U.flash.cv) U.flash.cv.width = U.flash.cv.height = 0;
    U.flash = { cv };
    drawUi();
    setTimeout(() => { if (U.flash && U.flash.cv === cv) { cv.width = cv.height = 0; U.flash = null; drawUi(); } }, 1500);
  };

  /* ---------- loading (§6.6, §6.8, §6.9) ---------- */
  const decodeBlob = async (blob) => {
    if (typeof IO.decodeBlob === "function") return IO.decodeBlob(blob);
    if (typeof createImageBitmap === "function") { try { return await createImageBitmap(blob); } catch (e) { /* fall back */ } }
    const url = URL.createObjectURL(blob);
    try { const img = new Image(); img.src = url; if (img.decode) await img.decode(); else await new Promise((res, rej) => { img.onload = res; img.onerror = rej; }); return img; }
    finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
  };
  const ioLoader = useRef(null);
  if (!ioLoader.current && typeof IO.mediaLoader === "function") ioLoader.current = IO.mediaLoader(store, owner);
  const loadLayer = async (ptr) => {
    if (ioLoader.current) return ioLoader.current(ptr);
    try {
      const r = await mediaCache.get(store, owner, ptr && ptr.ref);
      if (!r || !r.ok) return { img: null, missing: false, error: true };
      if (!r.data) return { img: null, missing: true, error: false };
      return { img: await decodeImage(r.data), missing: false, error: false };
    } catch (e) { return { img: null, missing: false, error: true }; }
  };
  const detachDoc = () => {
    if (eng.unsub) { eng.unsub(); eng.unsub = null; }
  };
  /** frees a document and its renderer once no save still needs them (review R8, R2-03): a running or queued save of the
   *  Saver singleton holds the doc it was given, so the canvases are zeroed only when `saver.busy` is false (≤ 10 min) */
  const retire = (d, r, extra) => {
    const free = () => {
      try { if (r) { if (typeof r.dispose === "function") r.dispose(); else if (typeof r.freeCaches === "function") r.freeCaches(); } } catch (e) { /* ignore */ }
      try { if (d) d.dispose(); } catch (e) { /* ignore */ }
      if (extra && extra.free) { try { extra.free(); } catch (e) { /* ignore */ } }
    };
    const sv = eng.saver;
    if (!sv || !canWriteNow()) { free(); return Promise.resolve(); }
    return (async () => {
      const t1 = Date.now() + 600000;
      while (Date.now() < t1) {
        let b = false;
        try { b = typeof sv.holds === "function" ? !!sv.holds(d) : !!sv.busy; } catch (e) { b = false; }   // IO24
        if (!b) break;
        await new Promise((res) => setTimeout(res, 250));
      }
      free();
    })();
  };
  const disposeDoc = () => {
    detachDoc();
    const d = eng.doc, r = eng.rend, bs = eng.beforeSurf;
    eng.beforeSurf = null; eng.doc = null; eng.rend = null; eng.brush = null;
    return retire(d, r, bs);
  };
  const attachDoc = (d) => {
    const onChange = (what, fx) => {
      eng.lastAct = Date.now();
      if (eng.saver && editableNow.current) { try { eng.saver.noteChange(); } catch (e) { /* ignore */ } }
      if ((fx === "out" || fx === "plan") && eng.session && canWriteNow() && what !== "undo" && what !== "redo" && what !== "jump") eng.session.sr = stageRecUpdate(eng.session.sr, stageNow.current, { commit: fx }, nowS()) || eng.session.sr;
      if (fx === "out") requestRender({});
      reportDirty();
      bump();
    };
    const onLayers = () => { requestRender({}); scheduleMarks(); bump(); };
    const onHist = () => { requestRender({}); scheduleMarks(); drawUi(); bump(); };
    const onSel = () => { U.antsRev = -1; drawUi(); bump(); };
    const onGeo = () => { placeStage(); if (V.fit) fitView(); else applyView(); requestRender({}); bump(); };
    d.on("change", onChange); d.on("layers", onLayers); d.on("history", onHist); d.on("selection", onSel); d.on("geometry", onGeo);
    eng.unsub = () => { d.off("change", onChange); d.off("layers", onLayers); d.off("history", onHist); d.off("selection", onSel); d.off("geometry", onGeo); };
  };
  const firstStage = (ed, rs) => {
    if (ed && Number.isInteger(ed.st) && STAGES[ed.st]) return STAGES[ed.st];
    const todo = STAGES.find((k) => rs && rs[k] && rs[k].n > 0 && !rs[k].hidden);
    return todo || "check";
  };
  const loadAll = async ({ draft = null, quiet = false } = {}) => {
    eng.loaded = false;
    if (!quiet) setPhase("loading");
    const ws0 = wsRef.current, raw = ws0[KEYS.edit];
    const ed = normEdit(raw);
    const steps = normSteps(ws0[KEYS.steps]);
    const bc = baseChoice(steps);
    const mb = ed && ed.m && ed.m.base;
    const baseRef = mb && mb.ref ? mb.ref : bc && bc.img && bc.img.ref;
    if (!baseRef) { setPhase("noBase"); return false; }
    eng.baseSg = (mb && mb.sg) || (bc && bc.img && bc.img.sg) || "";
    let img = null;
    try {
      const got = await mediaCache.get(store, owner, baseRef);
      if (got && got.ok && got.data) img = await decodeImage(got.data);
    } catch (e) { img = null; }
    if (!img) { setPhase("baseErr"); return false; }
    if (eng.disposed) return false;
    eng.img = img;
    if (!eng.gfx) eng.gfx = makeGfx({ lowMem: phone, touch: coarse.current });
    let res;
    try {
      res = await PhotoDoc.fromManifest(eng.gfx, draft ? draft.man : ed, img, loadLayer, {
        limits: LIMITS, history: { budget: LIMITS.histBytes[memClass], maxStates: LIMITS.histStates[memClass] } });
      if (draft && res && res.doc && res.doc.applyDraft) await res.doc.applyDraft(draft, decodeBlob);
    } catch (e) {
      try { console.warn("[photo] load", e); } catch (e2) { /* ignore */ }
      setPhase("memErr"); return false;
    }
    if (eng.disposed) { try { res.doc.dispose(); } catch (e) { /* ignore */ } return false; }
    await detachSaver();   // IO14: before the document is replaced
    if (eng.disposed) { try { res.doc.dispose(); } catch (e) { /* ignore */ } return false; }
    disposeDoc();
    const d = res.doc;
    eng.doc = d;
    eng.rend = new Renderer(d, eng.gfx, { proxyMax: LIMITS.proxyMax[memClass] });
    eng.brush = new BrushEngine(d, eng.rend);
    const src = draft ? { ...(ed || {}), ...(draft.session || {}), m: ed && ed.m, snaps: ed && ed.snaps } : ed;
    eng.session = makeSession(src, d, wsRef);
    if (bc && bc.img && bc.img.ref) eng.session.baseSrc = { ref: bc.img.ref, w: bc.img.w, h: bc.img.h, r: bc.r, sg: bc.img.sg || "" };
    eng.loadedCrev = (ed && ed.crev) || 0;
    eng.savedSince = false;
    reserveIds(normEdit(wsRef.current[KEYS.edit]));
    eng.savedRev = draft ? { rev: -1, prev: -1 } : { rev: d.rev, prev: d.prev };
    eng.missing = [...(res.missing || []), ...(res.errors || [])];
    eng.goneIds = new Set(res.missing || []);
    setMissingN(eng.missing.length);
    eng.routeSeed = canWriteNow() ? routeInit(ws0["s5c.inspect"] || null, isPlain(raw) ? raw.route : null, steps) : null;
    /* the seeded route rides the first real save (no command, no dirty flag: opening writes nothing; contract-log D10) */
    if (eng.routeSeed && canWriteNow() && !(isPlain(raw) && isPlain(raw.route)) && !draft) { if (typeof d.seedRoute === "function") d.seedRoute(eng.routeSeed); else d.route = eng.routeSeed; }
    attachDoc(d);
    const rs = routedStages(d.route || eng.routeSeed, steps, feat);
    const st0 = draft && draft.stage && STAGES.includes(draft.stage) ? draft.stage : firstStage(ed, rs);
    d.stage = st0;
    try { d.stageMark(st0); } catch (e) { /* ignore */ }
    setStageS(st0); stageNow.current = st0;
    setToolS(DEFAULT_TOOL[st0]); toolNow.current = DEFAULT_TOOL[st0];
    if (eng.session && canWriteNow()) eng.session.sr = stageRecUpdate(eng.session.sr, st0, "enter", nowS()) || eng.session.sr;
    const sv = eng.saver;
    if (sv && canWriteNow()) {
      try { sv.attach(d, eng.rend, eng.session); ATT.doc = d; } catch (e) { /* ignore */ }
      if (draft && typeof sv.resumeFrom === "function") { try { sv.resumeFrom(draft); } catch (e) { /* ignore */ } }
    }
    setPhase("ready");
    eng.loaded = true;
    requestAnimationFrame(() => { placeStage(); fitView(); requestRender({}); drawMarks(); });
    if (window.__PHX_DEBUG__) { try { window.__PHX_DEBUG__(debugObj()); } catch (e) { /* ignore */ } }
    return true;
  };
  const canWriteNow = () => !propsRef.current.readOnly && !preview && typeof setFieldRef.current === "function" && !eng.secondTab && !eng.versionRO;
  /* the debug object's members are non-enumerable: a harness that evaluates `window.__phx` with returnByValue gets {} instead of
     serialising the whole document graph (canvases, typed arrays), which stalls CDP for tens of seconds */
  const debugObj = () => {
    const o = {};
    const def = (k, get) => Object.defineProperty(o, k, { get, enumerable: false, configurable: true });
    def("doc", () => eng.doc); def("renderer", () => eng.rend); def("brush", () => eng.brush); def("saver", () => eng.saver);
    def("session", () => eng.session); def("view", () => V);
    /* review r4: harnesses wait for `ready` (the document of this opening is loaded and attached), not for the Saver */
    def("ready", () => !!eng.loaded && !!eng.doc && !eng.disposed); def("closed", () => !!eng.disposed);
    def("prevSave", () => !!eng.prevSave); def("loadedCrev", () => eng.loadedCrev);
    const ui = {};
    Object.defineProperties(ui, {
      stage: { get: () => stageNow.current }, tool: { get: () => toolNow.current },
      setStage: { value: (k) => apiRef.current && apiRef.current.setStage(k) }, setTool: { value: (k) => apiRef.current && apiRef.current.setTool(k) },
      api: { value: () => apiRef.current }, localOf: { value: localOf }, toOut: { value: toOut }, fromOut: { value: fromOut },
      b2o: { value: b2o }, o2b: { value: o2b }, eng: { value: eng },
    });
    def("ui", () => ui);
    return o;
  };

  /* open: lock, saver, draft offer, load (once) */
  useEffect(() => {
    let alive = true;
    eng.disposed = false;
    /* review r4 F1: one reference-counted body scroll lock shared with PfViewer (A-card U35), so the page scrolls again
       whichever overlay closes first */
    const unlockScroll = lockScroll();
    if (titleRef.current) titleRef.current.focus({ preventScroll: true });
    (async () => {
      const raw = wsRef.current[KEYS.edit];
      if (migrate(raw).readOnly) { eng.versionRO = true; setVersionRO(true); }
      const prev = ATT.closing && ATT.closing.owner === owner ? ATT.closing : null;
      if (canWriteNow() && prev && prev.lock) { eng.lock = prev.lock; prev.lock = null; }   // the tab lock passes to this opening
      else if (canWriteNow()) {
        try {
          const lk = await tabLock("museum-photo:" + owner);
          if (!alive) { if (lk && lk.release) lk.release(); return; }
          eng.lock = lk;
          if (lk && lk.ok === false) { eng.secondTab = true; setSecondTab(true); }
        } catch (e) { /* no navigator.locks: this tab owns the editor */ }
      }
      if (canWriteNow()) {
        eng.saver = props.saver || getSaver({ store, owner, dev: eng.dev, setFieldRef, getWs: () => wsRef.current, onState: (st) => setSaveSt({ ...st }), getLocked: () => lockedNow.current });
        /* the singleton may still hold an earlier lock (no editor was open when it was lifted): report the current state */
        if (eng.saver && typeof eng.saver.setLock === "function") { try { eng.saver.setLock(lockedNow.current); } catch (e) { /* ignore */ } }
        try { setSaveSt({ ...eng.saver.state }); } catch (e) { /* ignore */ }
      }
      /* gate B2: the previous editor's close save may still be uploading; loading now would start from the manifest before it
         lands, and this session's next save would drop what it wrote. Wait (bounded, P.waitSave), then load. */
      if (canWriteNow() && eng.saver) {
        const waiting = () => !!(ATT.closing && ATT.closing.owner === owner) || saverBusy(eng.saver);
        if (waiting()) {
          setPhase("waitSave");
          const t1 = Date.now() + prevWaitMs();
          while (alive && waiting() && Date.now() < t1) await new Promise((r) => setTimeout(r, 200));
          if (!alive) return;
          await new Promise((r) => setTimeout(r, 50));   // the landed manifest reaches wsRef on the next render
          if (waiting()) {
            /* bound reached: load, defer this session's saves, and treat a same-device write as foreign until the old save settles */
            eng.prevSave = true;
            const c = ATT.closing;
            /* the landed write reaches wsRef and the check above on the next render: keep this session's saves deferred a moment longer */
            const end = () => { setTimeout(() => { eng.prevSave = false; bump(); }, 400); };
            if (c && c.run) c.run.then(end, end); else end();
          }
        }
      }
      if (canWriteNow() && eng.saver && eng.saver.held) holdSaver(false, { resume: false });
      let draft = null;
      if (canWriteNow()) {
        try {
          await drafts.purgeOld(24 * 3600 * 1000);
          draft = await drafts.get(owner, KEYS.edit);
        } catch (e) { draft = null; }
      }
      const ok = await loadAll();
      if (!alive || !ok) return;
      const ed = normEdit(wsRef.current[KEYS.edit]);
      if (draft && isPlain(draft) && draft.man && (draft.baseSg || "") === (eng.baseSg || "")) {
        setDraftOffer({ draft, at: draft.at || Date.now(), newer: !!(ed && ed.crev > (draft.crev || 0) && draft.dev !== eng.dev) });
      } else {
        /* IO22: a draft that cannot be offered (another base image, no manifest) goes, as with 「저장된 내용으로 시작」 */
        if (draft) await dropDraft();
        await sweepPending(null);
      }
    })();
    const onPop = () => { closeNow("back", { save: true }); };
    window.addEventListener("popstate", onPop);
    const onVis = () => {
      if (document.visibilityState !== "hidden" || !eng.saver || !editableNow.current) return;
      try { eng.saver.writeDraftNow("hidden"); } catch (e) { /* ignore */ }
      if (!eng.saver.busy && docDirty()) saveNow("auto");
    };
    document.addEventListener("visibilitychange", onVis);
    const onOnline = () => { if (docDirty() && editableNow.current) saveNow("online"); };
    window.addEventListener("online", onOnline);
    const onResize = () => setVp({ w: innerWidth, h: innerHeight });
    window.addEventListener("resize", onResize);
    return () => {
      alive = false;
      unlockScroll();
      window.removeEventListener("popstate", onPop);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("resize", onResize);
      if (registerFlush) registerFlush(null);
      finishDispose();
      const op = openerRef && openerRef.current;
      if (op && op.focus) { try { op.focus({ preventScroll: true }); } catch (e) { op.focus(); } }
    };
  }, []);

  /* pending refs of earlier plans (§6.6 step 5): after the draft choice, never while locked */
  const sweepPending = async (keepDraft) => {
    if (!canWriteNow() || locked) return;
    try {
      const keep = keepDraft && Array.isArray(keepDraft.planned) ? keepDraft.planned.map((p) => p && p.ref).filter(Boolean) : [];
      const refs = await drafts.takePending(owner, { keep });
      if (!refs || !refs.length) return;
      const w = wsRef.current, live = liveRefs(w), inTrash = new Set(trashRefs(normTrash(w[KEYS.trash])));
      const drop = refs.filter((r) => !live.has(r) && !inTrash.has(r));
      if (drop.length && setFieldRef.current) setFieldRef.current(KEYS.trash, totalUpd((cur) => addTrash(cur, drop, nowS())));
    } catch (e) { /* ignore */ }
  };
  const takeDraft = async (use) => {
    const off = draftOffer;
    setDraftOffer(null);
    if (!off) return;
    if (use) { await loadAll({ draft: off.draft, quiet: true }); await sweepPending(off.draft); bump(); return; }
    await dropDraft();
    await sweepPending(null);
  };
  /* final gate N7: the Saver forgets the draft too (hasDraft), so the card stops polling and the rebase question stays true */
  const dropDraft = async () => {
    const sv = eng.saver;
    if (sv && typeof sv.dropDraft === "function") { try { await sv.dropDraft(); } catch (e) { /* ignore */ } return; }
    try { await drafts.del(owner, KEYS.edit); } catch (e) { /* ignore */ }
  };

  /* ---------- dirty, autosave, flush, onDirty ---------- */
  const docDirty = () => { const d = eng.doc; if (!d) return false; if (typeof d.dirty === "boolean") return d.dirty; return d.rev !== eng.savedRev.rev || d.prev !== eng.savedRev.prev; };
  const uploadingNow = () => { const p = eng.saver && eng.saver.state && eng.saver.state.phase; return p === "encoding" || p === "uploading" ? 1 : 0; };
  const reportDirty = () => {
    if (!onDirty || !canWriteNow()) return;
    const dd = docDirty();
    let pend = false;
    try { pend = !!(eng.saver && eng.saver.pending); } catch (e) { pend = false; }
    const st = (eng.saver && eng.saver.state) || {};
    try { onDirty({ current: st.current != null ? !!st.current || dd : dd, unsaved: dd || pend || !!st.unsaved, uploading: uploadingNow() }); } catch (e) { /* ignore */ }
  };
  const saveNow = async (reason, o = {}) => {
    const sv = eng.saver, d = eng.doc;
    if (!sv || !d || !canWriteNow()) return null;
    /* gate B2: the previous editor's close save may still land; this session saves only after it (the draft keeps the work) */
    if (eng.prevSave) { try { await sv.writeDraftNow("prev"); } catch (e) { /* ignore */ } return null; }
    /* final gate N8: while the bar 「다른 기기에서 이 작품을 저장했습니다」 is up, no save path (저장, Ctrl+S, stage change, close and
       Back, the leave gate, export) writes to the server: the edits go to this device's draft until the student chooses */
    const { keepMine: fromKeep, ...o2 } = o;
    o = o2;
    if (conflictNow.current && !fromKeep) {
      try { await sv.writeDraftNow("conflict"); } catch (e) { /* ignore */ }
      setConflictHeld(true);
      if (reason === "manual" || reason === "export") toast(P.conflictHeld);
      return null;
    }
    commitTransient();
    if (eng.session) eng.session.st = Math.max(0, STAGES.indexOf(stageNow.current));
    eng.planRev = { rev: d.rev, prev: d.prev };
    eng.savedSince = true;   // gate B2: from now on a same-device write may be this session's own
    try { const st = await sv.save(d, eng.rend, eng.session, { reason, ...o }); if (st) setSaveSt({ ...st }); return st; }
    catch (e) { try { console.warn("[photo] save", e); } catch (e2) { /* ignore */ } return null; }
  };
  const waitSaved = async (ms) => {
    const t1 = Date.now() + ms;
    while (Date.now() < t1) {
      const p = eng.saver && eng.saver.state && eng.saver.state.phase;
      if (p === "saved" || p === "error" || p === "offline" || p === "locked" || p === "conflict" || p === "held") return p;
      await new Promise((r) => setTimeout(r, 150));
    }
    return eng.saver && eng.saver.state ? eng.saver.state.phase : "";
  };
  useEffect(() => {
    if (!registerFlush || !canWrite) return undefined;
    registerFlush(async () => {
      if (!docDirty() && !(eng.saver && eng.saver.pending)) return true;
      await saveNow("gate");
      return (await waitSaved(8000)) === "saved";
    });
    return () => registerFlush(null);
  }, [canWrite]);
  /* saver state → saved revs, session log base, dirty report */
  useEffect(() => {
    if (saveSt.phase === "saved" && eng.planRev) {
      eng.savedRev = eng.planRev; eng.planRev = null;
      const e2 = normEdit(wsRef.current[KEYS.edit]);
      if (e2 && Array.isArray(e2.log) && eng.session) eng.session.log = clone(e2.log);
      if (e2) eng.loadedCrev = Math.max(eng.loadedCrev, e2.crev || 0);
    }
    if (saveSt.phase === "conflict") raiseConflict(true);
    reportDirty();
    bump();
  }, [saveSt.phase, saveSt.at, saveSt.done]);
  /* the Saver singleton may have been re-bound by the card (single onState): poll its state while open */
  useEffect(() => {
    if (!canWrite) return undefined;
    const iv = setInterval(() => {
      const st = eng.saver && eng.saver.state;
      if (st && (st.phase !== saveSt.phase || st.done !== saveSt.done || st.at !== saveSt.at || st.err !== saveSt.err)) setSaveSt({ ...st });
    }, 500);
    return () => clearInterval(iv);
  }, [canWrite, saveSt]);
  /* autosave: dirty, idle ≥ 10 s, online, not locked, no conflict, never during a stroke (§6.7) */
  useEffect(() => {
    if (!canWrite) return undefined;
    const every = (globalThis.__PHX_TEST__ && globalThis.__PHX_TEST__.autosaveMs) || 180000;
    const iv = setInterval(() => {
      if (!editableNow.current || conflictNow.current || drag.current || !docDirty()) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      if (Date.now() - eng.lastAct < Math.min(10000, every)) return;
      if (eng.saver && eng.saver.busy) return;
      saveNow("auto");
    }, every);
    return () => clearInterval(iv);
  }, [canWrite]);
  const conflictNow = useRef(false); conflictNow.current = conflict;
  /* final gate N8, C IO26: while the bar is up the Saver holds every server write, whoever starts it (the retry timer, back
     online, a re-encode); the held save writes the draft and stops in phase "held" */
  const holdSaver = (on, o) => { const sv = eng.saver; if (sv && typeof sv.setHold === "function" && canWriteNow()) { try { sv.setHold(on, o); } catch (e) { /* ignore */ } } };
  const raiseConflict = (v) => { conflictNow.current = v; setConflict(v); holdSaver(true); };

  /* the content revision moved past what this session loaded (§6.9, gate B2). It is this session's own write only when it comes
     from this device, this session can write (the tab lock keeps any other writer of this device out), this session has started
     a save since it loaded (eng.savedSince), and no earlier editor's close save may still land (eng.prevSave). Anything else is
     foreign: a clean document reloads, a dirty one gets the bar. A misjudgement can only go the safe way (a reload or the bar). */
  useEffect(() => {
    if (!ready || !canWrite) return;
    const e2 = normEdit(ws && ws[KEYS.edit]);
    if (!e2) return;
    reserveIds(e2);
    if (!(e2.crev > eng.loadedCrev)) return;
    const own = e2.dev === eng.dev && canWriteNow() && !!eng.savedSince && !eng.prevSave;
    if (own) return;
    eng.sameDev = e2.dev === eng.dev;
    if (!docDirty() && !(eng.saver && eng.saver.busy && !eng.prevSave)) {
      eng.loadedCrev = e2.crev;
      loadAll({ quiet: true }).then((ok) => { if (ok) toast(eng.sameDev ? P.prevLoaded : P.otherLoaded); });
    } else raiseConflict(eng.sameDev ? "same" : true);
  }, [ws && ws[KEYS.edit], ready]);   // ready: a write that landed while this opening was loading is judged once it is ready
  /* new layer ids never reuse an id of the latest manifest (gate B2): the next id is max(loaded, latest) */
  const reserveIds = (e2) => {
    const d = eng.doc;
    if (!d || !e2 || d.disposed) return;
    let mx = Number.isInteger(e2.nid) ? e2.nid : 1;
    for (const x of Array.isArray(e2.L) ? e2.L : []) if (x && Number.isInteger(x.id) && x.id + 1 > mx) mx = x.id + 1;
    if (Number.isInteger(d.nid) && mx > d.nid) d.nid = mx;
  };
  /* 「이 기기 내용으로 계속」: the Saver overwrites deliberately, including a 「새 이미지로 다시 시작」 made on the other device (IO18) */
  const keepMine = () => {
    const e2 = normEdit(wsRef.current[KEYS.edit]); eng.loadedCrev = (e2 && e2.crev) || eng.loadedCrev;
    if (eng.saver && typeof eng.saver.acceptRemote === "function") { try { eng.saver.acceptRemote(); } catch (e) { /* ignore */ } }
    conflictNow.current = false; setConflict(false); setConflictHeld(false);
    if (eng.saver && typeof eng.saver.held === "boolean" && eng.saver.held) holdSaver(false, { resume: false });   // acceptRemote lifted it already
    saveNow("manual", { keepMine: true });
  };
  /* lets the Saver go of the current document before it is replaced (IO14); a dirty document leaves a draft */
  const detachSaver = async () => {
    const d = eng.doc, sv = eng.saver;
    if (!d || !sv || !canWriteNow() || ATT.doc !== d) return;
    try { await sv.detach(d); } catch (e) { /* ignore */ }
    if (ATT.doc === d) ATT.doc = null;
  };
  const loadTheirs = async () => {
    await detachSaver();   // first, so the draft it may write is the one deleted next
    await dropDraft();
    const e2 = normEdit(wsRef.current[KEYS.edit]);
    eng.loadedCrev = (e2 && e2.crev) || eng.loadedCrev;
    conflictNow.current = false; setConflict(false); setConflictHeld(false);
    await loadAll({ quiet: true });
    holdSaver(false, { resume: false });   // the other device's content was chosen: the held save of this device never resumes
  };

  /* lock turned on while open (§6.10): cancel transients, keep a draft, let the Saver finish, close */
  useEffect(() => {
    if (eng.saver && canWrite && typeof eng.saver.setLock === "function") { try { eng.saver.setLock(locked); } catch (e) { /* ignore */ } }
    if (!locked || !ready || !canWrite) return;
    cancelTransient();
    try { if (eng.brush && eng.brush.active) eng.brush.cancel(); } catch (e) { /* ignore */ }
    try { if (eng.saver) eng.saver.writeDraftNow("lock"); } catch (e) { /* ignore */ }
    closeNow("lock", { save: false });
  }, [locked]);

  /* ---------- close flows (§4.3, §4.14) ---------- */
  const closing = useRef(false);
  /* contract-log D19 (review R8): the close save started by closeNow keeps the document attached and alive until it settles
     (at most 120 s), then the Saver lets go of it (detach, only while it is still this editor's document: a quick reopen may have
     attached a new one), and the document and renderer are freed only when no save runs any more (retire) */
  const finishDispose = () => {
    if (eng.disposed) return;
    eng.disposed = true;
    const sv = eng.saver, lk = eng.lock, d = eng.doc, cs = eng.closeSave;
    eng.closeSave = null;
    if (!sv || !canWriteNow()) {
      if (lk && lk.release) { try { lk.release(); } catch (e) { /* ignore */ } }
      if (ATT.doc === d) ATT.doc = null; disposeDoc(); return;
    }
    /* gate B2: until this editor's last save has landed or stopped, the tab lock stays held (another tab opens read-only instead
       of writable on the older manifest) and ATT.closing tells a reopen in this tab to wait; that reopen adopts the lock */
    const entry = { owner, lock: lk, run: null };
    const heldAtClose = !!conflictNow.current || !!(sv && sv.held);
    entry.run = (async () => {
      if (cs) { try { await Promise.race([cs, new Promise((r) => setTimeout(r, 120000))]); } catch (e) { /* ignore */ } }
      if (d && ATT.doc === d) {
        try { await sv.detach(d); } catch (e) { /* ignore */ }
        if (ATT.doc === d) ATT.doc = null;
      }
      /* closed with the conflict bar up: the edits are in the draft; the held save never resumes on its own (N8, IO26) */
      if (heldAtClose && typeof sv.setHold === "function") { try { sv.setHold(false, { resume: false }); } catch (e) { /* ignore */ } }
      disposeDoc();
      /* a save past encoding still uploads and writes after detach (IO14) */
      const t1 = Date.now() + 600000;
      while (Date.now() < t1 && saverBusy(sv)) await new Promise((r) => setTimeout(r, 200));
    })();
    ATT.closing = entry;
    entry.run.finally(() => {
      if (ATT.closing === entry) ATT.closing = null;
      if (entry.lock && entry.lock.release) { try { entry.lock.release(); } catch (e) { /* ignore */ } }
      entry.lock = null;
    });
  };
  const closeNow = async (reason, { save = false } = {}) => {
    if (closing.current) return;
    closing.current = true;
    if (save && canWriteNow() && !lockedNow.current && docDirty()) {
      /* review R8: write the draft first, then start the close save; the overlay closes at once and the document stays alive until
         the Saver no longer runs a save for it (finishDispose, retire), so nothing is encoded from disposed canvases */
      try { if (eng.saver) await Promise.race([eng.saver.writeDraftNow("close"), new Promise((r) => setTimeout(r, 2500))]); } catch (e) { /* ignore */ }
      eng.closeSave = saveNow("close");
    }
    reportDirty();
    try { onClose && onClose(reason); } catch (e) { /* ignore */ }
  };
  const requestClose = () => {
    if (closing.current) return;
    if (!canWrite || confirmed || (!docDirty() && !(eng.saver && eng.saver.busy))) { closeNow("user"); return; }
    setCloseBar("ask");
  };
  const saveAndClose = async () => {
    setCloseBar("saving");
    await saveNow("close");
    const p = await waitSaved(20000);
    if (p === "error") { setCloseBar("fail"); return; }
    closeNow("user");
  };
  const closeNoSave = async () => {
    try { if (eng.saver) await Promise.race([eng.saver.writeDraftNow("close"), new Promise((r) => setTimeout(r, 2500))]); } catch (e) { /* ignore */ }
    closeNow("user");
  };

  /* ---------- stages ---------- */
  const steps = normSteps(wsRef.current[KEYS.steps]);
  const notes = normNotes(wsRef.current[KEYS.notes]);
  const routeView = (doc && doc.route) || eng.routeSeed || null;
  const rs = routedStages(routeView, steps, feat) || {};
  const hiddenStage = (k) => !!(rs[k] && rs[k].hidden) || (STAGE_FEAT[k] && !feat(STAGE_FEAT[k]));
  const goStage = (k, { focus = true } = {}) => {
    if (!STAGES.includes(k)) return;
    const prev = stageNow.current;
    if (prev === k) { if (focus && stageHeadRef.current) stageHeadRef.current.focus({ preventScroll: true }); return; }
    commitTransient();
    const d = eng.doc;
    if (d && eng.session && canWriteNow()) {
      eng.session.sr = stageRecUpdate(eng.session.sr, prev, "leave", nowS()) || eng.session.sr;
      eng.session.sr = stageRecUpdate(eng.session.sr, k, "enter", nowS()) || eng.session.sr;
    }
    let changed = false;
    try { changed = !!(d && d.stageChanged(prev)); } catch (e) { changed = false; }
    if (d) { d.stage = k; try { d.stageMark(k); } catch (e) { /* ignore */ } }
    setStageS(k); stageNow.current = k;
    setToolS(DEFAULT_TOOL[k]); toolNow.current = DEFAULT_TOOL[k];
    setArmed(null); setCropDraft(null); setMeasure(null);
    if (k !== "final") { setCmpMode("none"); setViewHide([]); if (eng.rend && eng.rend.setViewOverride) eng.rend.setViewOverride({ hide: [] }); }
    if (eng.session) eng.session.st = Math.max(0, STAGES.indexOf(k));
    if (changed && editableNow.current) saveNow("stage", { snapshotStage: prev });
    if (V.fit) requestAnimationFrame(fitView);
    focusStage.current = focus;
  };
  const focusStage = useRef(false);
  /* review A6: closing the shortcut dialog returns focus to 「단축키」 */
  useEffect(() => {
    if (keysWas.current && !keysOpen && keysBtnRef.current) { try { keysBtnRef.current.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    keysWas.current = keysOpen;
  }, [keysOpen]);
  useLayoutEffect(() => {
    if (focusStage.current && stageHeadRef.current) { focusStage.current = false; stageHeadRef.current.focus({ preventScroll: true }); }
  }, [stage]);

  /* ---------- tools and options ---------- */
  const pickTool = (id) => {
    if (!TOOLS[id] || !toolAvail(id, { phone })) return;
    commitTransient();
    const st = TOOLS[id].st, cur = stageNow.current;
    const own = st === "*" || (STAGE_TOOLS[cur] && (STAGE_TOOLS[cur].main.includes(id) || STAGE_TOOLS[cur].adv.includes(id)));
    if (!own) {
      eng.outside.add(id);
      if (!eng.outsideTold.has(id)) {
        eng.outsideTold.add(id);
        const home = STAGES.find((k) => STAGE_TOOLS[k].main.includes(id) || STAGE_TOOLS[k].adv.includes(id)) || st;
        toast(fmt(P.outsideTool, { toolTopic: josa(TOOL_TEXT[id].name, CORE_TEXT.josaTopic), stage: STAGE_TEXT[home] ? STAGE_TEXT[home].name : "" }));
      }
    }
    setToolS(id); toolNow.current = id;
    if (id === "crop" || toolNow.current !== "crop") requestAnimationFrame(() => { if (V.fit) fitView(); });
    if (id !== "text" && textEdNow.current) commitText();
  };
  useEffect(() => { if (ready && V.fit) fitView(); }, [tool === "crop"]);
  /* choosing a 비율 on the crop tool reshapes the frame at once (largest centred box of that ratio), as in Photoshop */
  const ratioWas = useRef(null);
  useEffect(() => {
    const k = opts.crop && opts.crop.ratio || 0, was = ratioWas.current;
    ratioWas.current = k;
    if (was == null || was === k || !ready || tool !== "crop" || !editableNow.current) return;
    const r = cropRatio();
    if (!r) return;
    const o = outSz(), F0 = cropNow.current || { x: 0, y: 0, w: o.w, h: o.h };
    const w = F0.w / F0.h > r ? F0.h * r : F0.w, h = w / r;
    setCropDraft(clampCrop({ x: F0.x + (F0.w - w) / 2, y: F0.y + (F0.h - h) / 2, w, h }));
  }, [opts.crop && opts.crop.ratio]);
  const setOpt = (id, patch) => {
    setOpts((o) => {
      const n = { ...o, [id]: { ...o[id], ...patch } };
      const pf = loadPrefs(); pf.opt = { ...(pf.opt || {}), [id]: n[id] }; savePrefs(pf);
      return n;
    });
  };
  const togglePref = (k, v) => { const pf = loadPrefs(); pf[k] = v; savePrefs(pf); };
  const setOpenSec = (k, v) => setOpen((o) => { const n = { ...o, [k]: v }; const pf = loadPrefs(); pf.open = n; savePrefs(pf); return n; });
  const sizeOf = (id) => {
    const o = optsNow.current[id] || {}, d = eng.doc;
    if (o.size) return o.size;
    const long = d ? Math.max(d.w, d.h) : 1600;
    return Math.max(2, Math.round(long * (SIZE_SHARE[id] || 0.02)));
  };
  const strokeOpts = (id, e) => {
    const o = optsNow.current[id] || {};
    const base = { size: sizeOf(id), hard: (o.hard == null ? 50 : o.hard) / 100, op: (o.op == null ? 100 : o.op) / 100, flow: (o.flow == null ? 100 : o.flow) / 100,
      spacing: 0.25, press: ["size", "flow", "off"][o.press || 0] || "size", smooth: 0, sample: o.sample ? "all" : "below", aligned: o.aligned !== 0,
      range: o.range == null ? 1 : o.range, exposure: (o.exposure == null ? 15 : o.exposure) / 100, protect: o.protect !== 0, preset: o.preset || 1,
      strength: (o.strength == null ? 40 : o.strength) / 100, ce: o.ce || 0, maskMode: o.mode ? "erase" : "paint" };
    const tool = { maskBrush: "mask", blurB: "bsb", sharpB: "shb" }[id] || id;
    if (id === "dodge") return { ...base, tool: (o.mode ? !(e && e.altKey) : !!(e && e.altKey)) ? "burn" : "dodge" };
    if (id === "maskBrush") return { ...base, tool, maskMode: (o.mode ? 1 : 0) ^ (e && e.altKey ? 1 : 0) ? "erase" : "paint" };
    if (id === "sponge") return { ...base, tool, dir: o.mode ? 1 : -1, vib: o.vib !== 0 };
    return { ...base, tool };
  };

  /* ---------- pointer input (§4.3, §4.4) ---------- */
  const drag = useRef(null);
  const touches = useRef(new Map()).current;
  const penSeen = useRef(false);
  const tapInfo = useRef({ t0: 0, max: 0, moved: false });
  const spaceDown = useRef(false);
  const lastPress = useRef(0.5);
  const ptrOf = (ev, l) => {
    const d = eng.doc, q = toOut(l.x, l.y), b = o2b(q.x, q.y), wa = (d && d.wa) || { x: 0, y: 0 };
    let p = 1;
    if (ev.pointerType === "pen") { p = ev.pressure > 0 ? ev.pressure : lastPress.current || 0.5; lastPress.current = p; }
    return { x: b.x - wa.x, y: b.y - wa.y, p, t: ev.timeStamp || performance.now() };
  };
  const outPt = (e) => { const l = localOf(e.clientX, e.clientY); return { l, o: toOut(l.x, l.y) }; };
  const activity = () => {
    const t = Date.now();
    eng.lastAct = t;
    if (eng.session && canWriteNow() && t - eng.stageT > 1000) { eng.stageT = t; eng.session.sr = stageRecUpdate(eng.session.sr, stageNow.current, "tick", nowS()) || eng.session.sr; }
  };
  const startPan = (e, l) => { drag.current = { mode: "pan", ptype: e.pointerType, id: e.pointerId, l0: l, tx: V.tx, ty: V.ty }; if (viewRef.current) viewRef.current.dataset.panning = "1"; };
  const startPinch = () => {
    const d0 = drag.current;
    if (d0 && d0.mode === "brush") { try { eng.brush.cancel(); } catch (e) { /* ignore */ } requestRender({}); }
    const pts = [...touches.values()], la = localOf(pts[0].x, pts[0].y), lb = localOf(pts[1].x, pts[1].y);
    const m = { x: (la.x + lb.x) / 2, y: (la.y + lb.y) / 2 };
    drag.current = { mode: "pinch", ptype: "touch", d0: Math.hypot(la.x - lb.x, la.y - lb.y) || 1, m0: m, s0: V.s, q0: toOut(m.x, m.y), moved: false };
  };
  const movePinch = () => {
    const D = drag.current, pts = [...touches.values()];
    if (pts.length < 2) return;
    const la = localOf(pts[0].x, pts[0].y), lb = localOf(pts[1].x, pts[1].y), dd = Math.hypot(la.x - lb.x, la.y - lb.y);
    const m = { x: (la.x + lb.x) / 2, y: (la.y + lb.y) / 2 };
    if (Math.abs(dd - D.d0) > 10 || Math.hypot(m.x - D.m0.x, m.y - D.m0.y) > 10) D.moved = true;
    if (!D.moved) return;
    tapInfo.current.moved = true;
    const sb = scaleBounds();
    V.s = clamp((D.s0 * dd) / D.d0, sb.min, sb.max);
    const o = outSz();
    V.tx = m.x - V.s * (flipNow.current ? o.w - D.q0.x : D.q0.x); V.ty = m.y - V.s * D.q0.y; V.fit = false;
    clampPan(); applyView();
  };
  const hitPin = (l) => {
    const d = eng.doc;
    if (!d || !d.pins) return -1;
    for (let i = d.pins.length - 1; i >= 0; i--) {
      const p = d.pins[i], o = b2o((p.x / 1000) * d.w, (p.y / 1000) * d.h), s = fromOut(o.x, o.y);
      if (Math.hypot(s.x - l.x, s.y - l.y) <= (coarse.current ? 22 : 14)) return i;
    }
    return -1;
  };
  const hitMark = (o) => {
    const d = eng.doc, r = eng.rend;
    if (!d || !r) return 0;
    const recs = markRecs(), os = outSz(), ppc = r.ppc ? r.ppc() : null;
    let i = -1;
    try { i = hitMarks(recs, o.x, o.y, os.w, os.h, ppc); } catch (e) { i = -1; }
    if (i < 0) {
      for (let j = recs.length - 1; j >= 0; j--) {
        let b = null;
        try { b = markBox(recs[j], os.w, os.h, ppc); } catch (e) { b = null; }
        if (b && b.w > 0 && o.x >= b.x && o.x <= b.x + b.w && o.y >= b.y && o.y <= b.y + b.h) { i = j; break; }
      }
    }
    return i >= 0 && recs[i] ? recs[i].id : 0;
  };
  const selOp = (e, mode) => (e.shiftKey && e.altKey ? "and" : e.shiftKey ? "add" : e.altKey ? "sub" : ["new", "add", "sub", "and"][mode || 0] || "new");

  const onPointerDown = (e) => {
    if (!ready || !eng.doc) return;
    if (e.pointerType === "mouse" && e.button !== 0 && e.button !== 1) return;
    if (rootRef.current && document.activeElement !== rootRef.current && !(txtRef.current && document.activeElement === txtRef.current)) {
      try { rootRef.current.focus({ preventScroll: true }); } catch (er) { /* ignore */ }
    }
    if (textEdNow.current) commitText();
    activity();
    const l = localOf(e.clientX, e.clientY);
    if (e.pointerType === "pen" && !penSeen.current) { penSeen.current = true; if (fingerPaint) { setFingerPaint(false); toast(P.penSeen); } }
    if (e.pointerType === "touch") {
      const d0 = drag.current;
      if (d0 && d0.ptype !== "touch") return;                      // palm while a pen or mouse works
      if (e.isPrimary) { touches.clear(); tapInfo.current = { t0: performance.now(), max: 0, moved: false }; }
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      tapInfo.current.max = Math.max(tapInfo.current.max, touches.size);
      if (touches.size >= 2) { startPinch(); capture(e); return; }
    } else if (drag.current && drag.current.ptype === "touch") {
      if (drag.current.mode === "brush") { try { eng.brush.cancel(); } catch (er) { /* ignore */ } }
      drag.current = null;
    }
    if (e.pointerType === "mouse") e.preventDefault();
    capture(e);
    const tl = toolNow.current, kind = TOOLS[tl] ? TOOLS[tl].kind : "hand";
    const fingerOnly = e.pointerType === "touch" && penSeen.current && !fingerPaint;
    const o = toOut(l.x, l.y), d = eng.doc;
    eng.lastDown = { o, b: o2b(o.x, o.y) };   // read by the harness (zoom-safe mapping check)
    const arm = armedNow.current;
    if (arm && e.button !== 1 && !spaceDown.current) {
      if (arm.kind === "grey" || arm.kind === "fill") { pickAt(o, arm); return; }
      if (arm.kind === "source") { const p = ptrOf(e, l); try { eng.brush.setSource(p.x, p.y); } catch (er) { /* ignore */ } setArmed(null); toast(P.sourceSet); return; }
    }
    if ((e.ctrlKey || e.metaKey) && e.button === 0 && curvePointAt(o)) return;
    if (e.button === 1 || spaceDown.current || kind === "hand" || (fingerOnly && (kind === "brush" || kind === "sel"))) { startPan(e, l); return; }
    switch (kind) {
      case "zoom": zoomAt(V.s * (e.altKey || optsNow.current.zoom.out ? 0.5 : 2), l.x, l.y); return;
      case "pick": pickAt(o, null); return;
      case "move": {
        const id = hitMark(o);
        if (id) { const L = d.layers.find((x) => x.id === id); setSelMark(id); drag.current = { mode: "mark", ptype: e.pointerType, id, o0: o, p0: { ...(L.p || {}) }, moved: false }; return; }
        const A = d.layers.find((x) => x.id === d.activeId);
        if (A && A.k === "ai" && editableNow.current && !A.lk && !A.missing) { drag.current = { mode: "ai", ptype: e.pointerType, id: A.id, o0: o, p0: { ...(A.p || {}) }, moved: false }; return; }
        startPan(e, l); return;
      }
      case "pin": {
        if (!editableNow.current) { startPan(e, l); return; }
        const i = hitPin(l);
        if (i >= 0) { setSelPin(i); drag.current = { mode: "pin", ptype: e.pointerType, i, moved: false }; return; }
        if ((d.pins || []).length >= LIMITS.pins) { toast(ERR_TEXT.limit); return; }
        const b = o2b(o.x, o.y), po = optsNow.current.pin;
        const pin = { x: clamp(Math.round((b.x / d.w) * 1000), 0, 1000), y: clamp(Math.round((b.y / d.h) * 1000), 0, 1000), k: po.kind || 1 };
        if (po.it) pin.it = po.it;
        if (po.ce) pin.ce = po.ce;
        d.setPins([...(d.pins || []), pin], "pin");
        setSelPin((d.pins || []).length - 1);
        return;
      }
      case "light": case "measure": case "strline": {
        if (!editableNow.current && kind !== "measure") { startPan(e, l); return; }
        drag.current = { mode: kind, ptype: e.pointerType, a: o, b: o };
        ovSet({ line: { kind, a: o, b: o } });
        return;
      }
      case "crop": {
        if (!editableNow.current) { startPan(e, l); return; }
        const F = cropNow.current || { x: 0, y: 0, ...outSz() };
        const h = cropHit(F, l);
        drag.current = { mode: "crop", ptype: e.pointerType, h, F0: { ...F }, o0: o };
        if (!cropNow.current) setCropDraft({ ...F });
        return;
      }
      case "sel": {
        if (!editableNow.current) { startPan(e, l); return; }
        if (tl === "selWand") { wandAt(o, selOp(e, optsNow.current.selWand.mode)); return; }
        drag.current = { mode: tl, ptype: e.pointerType, a: o, pts: [o], op: selOp(e, optsNow.current[tl].mode) };
        ovSet({ marquee: tl === "selRect" ? { x: o.x, y: o.y, w: 0, h: 0 } : null, lasso: tl === "selLasso" ? [o] : null });
        return;
      }
      case "text": {
        if (!editableNow.current) { startPan(e, l); return; }
        const id = hitMark(o);
        const L = id && d.layers.find((x) => x.id === id);
        if (L && L.k === "txt") { openText(L); return; }
        const os = outSz();
        openText(null, { x: clamp(Math.round((o.x / os.w) * 1000), 0, 1000), y: clamp(Math.round((o.y / os.h) * 1000), 0, 1000) });
        return;
      }
      case "brush": {
        if (!editableNow.current) { startPan(e, l); return; }
        if (e.altKey && (tl === "clone" || tl === "heal")) { const p = ptrOf(e, l); try { eng.brush.setSource(p.x, p.y); } catch (er) { /* ignore */ } toast(P.sourceSet); return; }
        if (tl === "maskBrush") {
          const A = d.layers.find((x) => x.id === d.activeId);
          if (!A) { showAlert(P.needLayer); return; }
          if (!A.mask) { showAlert(P.needMask); return; }
        }
        const n0 = d.layers.length, ids0 = new Set(d.layers.map((x) => x.id));
        const so = strokeOpts(tl, e), p = ptrOf(e, l);
        let ok = false;
        try { ok = memRetry(() => eng.brush.begin(so, p)); } catch (er) { ok = false; if (!d.lastError) d.lastError = "base"; }
        if (!ok) {
          const be = eng.brush && eng.brush.lastError;
          showAlert(be === "source" ? P.needSource : be === "hidden" ? P.layerHidden : errText(d.lastError || "base"));
          return;
        }
        if (d.layers.length > n0) { const L = d.layers.find((x) => !ids0.has(x.id)); if (L) toast(fmt(P.layerMade, { name: layerName(L, d) })); }
        drag.current = { mode: "brush", ptype: e.pointerType, tool: tl, t0: performance.now() };
        return;
      }
      default: startPan(e, l);
    }
  };
  const capture = (e) => { try { viewRef.current.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ } };

  const onPointerMove = (e) => {
    const l = localOf(e.clientX, e.clientY);
    if (e.pointerType === "touch" && touches.has(e.pointerId)) {
      touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (drag.current && drag.current.mode === "pinch") { movePinch(); return; }
    }
    hoverReadout(l, e);
    const D = drag.current;
    if (!D) return;
    if (D.ptype === "touch" && e.pointerType !== "touch") return;
    if (D.mode === "pan") {
      V.tx = D.tx + (l.x - D.l0.x); V.ty = D.ty + (l.y - D.l0.y); V.fit = false;
      if (Math.hypot(l.x - D.l0.x, l.y - D.l0.y) > 6) tapInfo.current.moved = true;
      clampPan(); applyView(); return;
    }
    activity();
    const o = toOut(l.x, l.y), d = eng.doc;
    if (!d) return;
    switch (D.mode) {
      case "brush": {
        const list = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
        const evs = list.length ? list : [e];
        const pts = evs.map((ev) => ptrOf(ev, localOf(ev.clientX, ev.clientY)));
        let r = null;
        try { r = eng.brush.add(pts); } catch (er) { r = null; }
        if (r) requestRender({ rect: r });   // B's add() already invalidated the caches above the painted layer
        return;
      }
      case "mark": {
        D.moved = true;
        const os = outSz(), dx = ((o.x - D.o0.x) / os.w) * 1000, dy = ((o.y - D.o0.y) / os.h) * 1000;
        const L = d.layers.find((x) => x.id === D.id);
        if (!L) return;
        const base = markXY(L, D.p0);
        D.p = { ...D.p0, x: clamp(Math.round(base.x + dx), 0, 1000), y: clamp(Math.round(base.y + dy), 0, 1000) };
        delete D.p.ps;
        M.override = { id: D.id, p: D.p };
        if (!M.raf) M.raf = requestAnimationFrame(drawMarks);
        ovBump();
        return;
      }
      case "ai": {
        D.moved = true;
        const b0 = o2b(D.o0.x, D.o0.y), b1 = o2b(o.x, o.y);
        D.p = { ...D.p0, dx: clamp(Math.round((D.p0.dx || 0) + b1.x - b0.x), -999, 999), dy: clamp(Math.round((D.p0.dy || 0) + b1.y - b0.y), -999, 999) };
        requestRender({ interactive: true, preview: { id: D.id, p: D.p } });
        return;
      }
      case "pin": {
        D.moved = true;
        const b = o2b(o.x, o.y), pins = (d.pins || []).slice();
        const p = { ...pins[D.i], x: clamp(Math.round((b.x / d.w) * 1000), 0, 1000), y: clamp(Math.round((b.y / d.h) * 1000), 0, 1000) };
        D.pin = p; ovSet({ pinDrag: { i: D.i, p } });
        return;
      }
      case "light": case "measure": case "strline": D.b = o; ovSet({ line: { kind: D.mode, a: D.a, b: o } }); return;
      case "crop": { const F = cropMove(D, o, e.shiftKey); setCropDraft(F); return; }
      case "selRect": {
        let w = o.x - D.a.x, h = o.y - D.a.y;
        if (e.shiftKey) { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
        D.b = { x: D.a.x + w, y: D.a.y + h };
        ovSet({ marquee: { x: Math.min(D.a.x, D.b.x), y: Math.min(D.a.y, D.b.y), w: Math.abs(w), h: Math.abs(h) } });
        return;
      }
      case "selLasso": {
        const last = D.pts[D.pts.length - 1];
        if (Math.hypot(o.x - last.x, o.y - last.y) * V.s >= 2) { D.pts.push(o); ovSet({ lasso: D.pts }); }
        return;
      }
      default:
    }
  };
  const finishGesture = async (e, cancel) => {
    const D = drag.current;
    if (e && e.pointerType === "touch") {
      touches.delete(e.pointerId);
      if (touches.size === 0) {
        const ti = tapInfo.current, dt = performance.now() - ti.t0;
        if (D && D.mode === "pinch" && !D.moved && !ti.moved && dt < 320) { if (ti.max === 2) undo(); else if (ti.max >= 3) redo(); }
      } else if (D && D.mode === "pinch") return;
    }
    if (!D) return;
    if (e && D.ptype === "touch" && e.pointerType !== "touch") return;
    drag.current = null;
    if (viewRef.current) delete viewRef.current.dataset.panning;
    const d = eng.doc;
    if (!d) return;
    switch (D.mode) {
      case "brush": {
        if (cancel && D.ptype === "touch") { try { eng.brush.cancel(); } catch (er) { /* ignore */ } requestRender({}); return; }
        let res = null;
        try { res = await eng.brush.end(); } catch (er) { res = null; }
        requestRender({});
        afterStroke(D.tool, res);
        return;
      }
      case "mark": {
        M.override = null;
        if (D.moved && D.p && editableNow.current) {
          const L = d.layers.find((x) => x.id === D.id);
          if (L) commitP(L.id, D.p, "markMove:" + (L.k === "txt" ? "txt" : L.t));
        }
        scheduleMarks(); ovBump();
        return;
      }
      case "ai": if (D.moved && D.p) commitP(D.id, D.p, "layerAiMove"); else requestRender({}); return;
      case "pin": ovSet({ pinDrag: null }); if (D.moved && D.pin) { const pins = (d.pins || []).slice(); pins[D.i] = D.pin; d.setPins(pins, "pinMove"); } return;
      case "light": {
        ovSet({ line: null });
        if (cancel || Math.hypot(D.b.x - D.a.x, D.b.y - D.a.y) * V.s < 6) return;
        if ((d.lines || []).length >= LIMITS.lines) { toast(ERR_TEXT.limit); return; }
        const a = o2b(D.a.x, D.a.y), b = o2b(D.b.x, D.b.y), pm = (v, n) => clamp(Math.round((v / n) * 1000), 0, 1000);
        d.setLines([...(d.lines || []), { a: pm(a.x, d.w), b: pm(a.y, d.h), c: pm(b.x, d.w), d: pm(b.y, d.h) }], "line");
        return;
      }
      case "measure": {
        ovSet({ line: null });
        if (cancel || Math.hypot(D.b.x - D.a.x, D.b.y - D.a.y) * V.s < 6) return;
        const a = o2b(D.a.x, D.a.y), b = o2b(D.b.x, D.b.y);
        setMeasure({ a: Math.round(a.x), b: Math.round(a.y), c: Math.round(b.x), d: Math.round(b.y) });
        return;
      }
      case "strline": {
        ovSet({ line: null });
        if (cancel || Math.hypot(D.b.x - D.a.x, D.b.y - D.a.y) * V.s < 6) return;
        const a = o2b(D.a.x, D.a.y), b = o2b(D.b.x, D.b.y);
        let ang = 0;
        try { ang = straightenAngle(a.x, a.y, b.x, b.y); } catch (er) { ang = 0; }
        if (!Number.isFinite(ang)) return;
        setStraighten(clamp(Math.round(-ang * 10), -150, 150));
        return;
      }
      case "crop": return;
      case "selRect": {
        ovSet({ marquee: null });
        if (cancel || !D.b) return;
        const r = { x: Math.min(D.a.x, D.b.x), y: Math.min(D.a.y, D.b.y), w: Math.abs(D.b.x - D.a.x), h: Math.abs(D.b.y - D.a.y) };
        if (r.w * V.s < 3 || r.h * V.s < 3) { if (D.op === "new") deselect(); return; }
        selectOutPoly([{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }], D.op, "selRect", optsNow.current.selRect.feather);
        return;
      }
      case "selLasso": {
        ovSet({ lasso: null });
        if (cancel || D.pts.length < 3) return;
        selectOutPoly(D.pts, D.op, "selLasso", optsNow.current.selLasso.feather);
        return;
      }
      default:
    }
  };
  const onPointerUp = (e) => { finishGesture(e, false); };
  const onPointerCancel = (e) => { finishGesture(e, e.pointerType === "touch"); };
  const onPointerLeave = () => { if (U.ring) { U.ring = null; drawUi(); } };
  const hoverReadout = (l, e) => {
    const tl = toolNow.current;
    if (PAINT.has(tl) && (e.pointerType === "mouse" || e.pointerType === "pen")) { U.ring = { x: l.x, y: l.y, r: (sizeOf(tl) / 2) * V.s }; drawUi(); }
    else if (U.ring) { U.ring = null; drawUi(); }
    if (H.raf) { H.l = l; return; }
    H.l = l;
    H.raf = requestAnimationFrame(() => {
      H.raf = 0;
      const q = toOut(H.l.x, H.l.y), os = outSz();
      const inside = q.x >= 0 && q.y >= 0 && q.x < os.w && q.y < os.h;
      const xi = Math.floor(q.x), yi = Math.floor(q.y);
      if (posTxtRef.current && posTxtRef.current.firstChild) posTxtRef.current.firstChild.nodeValue = inside ? "x " + xi + " y " + yi : "x – y –";
      let s = null;
      if (inside && eng.rend && eng.rend.sample) { try { s = eng.rend.sample(xi, yi, SAMPLE_PX[optsNow.current.eyedrop.sample] || 5); } catch (er) { s = null; } }
      if (s && inside) eng.hover = { x: xi, y: yi, ...s };
      if (rgbTxtRef.current && rgbTxtRef.current.firstChild) rgbTxtRef.current.firstChild.nodeValue = s && inside ? P.infoRgb + " " + Math.round(s.r) + "·" + Math.round(s.g) + "·" + Math.round(s.b) : P.infoRgb + " –";
    });
  };
  const H = useRef({ raf: 0, l: null }).current;

  /* wheel: Ctrl+wheel and trackpad pinch zoom; plain wheel pans (non-passive listener) */
  useEffect(() => {
    const el = viewRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (!eng.doc) return;
      e.preventDefault();
      const l = localOf(e.clientX, e.clientY);
      if (e.ctrlKey || e.metaKey) { zoomAt(V.s * Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0022)), l.x, l.y); return; }
      let dx = e.deltaX, dy = e.deltaY;
      if (e.deltaMode === 1) { dx *= 16; dy *= 16; }
      if (e.shiftKey && !dx) { dx = dy; dy = 0; }
      V.tx -= dx; V.ty -= dy; V.fit = false; clampPan(); applyView();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [phase]);
  /* refit on pane size changes while fitted */
  useEffect(() => {
    const el = paneRef.current;
    if (!el || typeof ResizeObserver !== "function") return undefined;
    const ro = new ResizeObserver(() => { if (V.fit) fitView(); else { clampPan(); applyView(); } });
    ro.observe(el);
    return () => ro.disconnect();
  }, [phase, cmpMode]);
  /* marching ants every 100 ms; static under reduced motion or when the tab is hidden */
  useEffect(() => {
    const iv = setInterval(() => {
      if (!eng.doc || !eng.doc.sel || reduceMotion() || document.visibilityState === "hidden") return;
      U.dash = (U.dash + 1) % 8; drawUi();
    }, 100);
    return () => clearInterval(iv);
  }, []);

  /* ---------- overlay store (SVG in output space; re-renders alone) ---------- */
  const OV = useRef({ v: {}, subs: new Set() }).current;
  const ovSet = (patch) => { OV.v = { ...OV.v, ...patch }; OV.subs.forEach((f) => f()); };
  const ovBump = () => OV.subs.forEach((f) => f());

  /* ---------- actions ---------- */
  const commitP = (id, p, lk) => {
    const d = eng.doc;
    if (!d || !editableNow.current) return null;
    let L = null;
    try { L = d.setProp(id, "p", p, { lk }); } catch (e) { L = null; }
    if (!L && d.lastError) showAlert(errText(d.lastError));
    requestRender({}); scheduleMarks();
    return L;
  };
  const markXY = (L, p) => {
    const q = p || L.p || {};
    if (Number.isFinite(q.x) && Number.isFinite(q.y)) return { x: q.x, y: q.y };
    const r = eng.rend, os = outSz();
    let b = null;
    try { b = markBox(L, os.w, os.h, r && r.ppc ? r.ppc() : null); } catch (e) { b = null; }
    if (b && b.w > 0) return { x: ((b.x + b.w / 2) / os.w) * 1000, y: ((b.y + b.h / 2) / os.h) * 1000 };
    return { x: 500, y: 900 };
  };
  const addLayer = (kind, init) => {
    const d = eng.doc;
    if (!d || !editableNow.current) return null;
    let L = null;
    try { L = memRetry(() => d.addLayer(kind, init)); } catch (e) { L = null; if (!d.lastError) d.lastError = "limit"; }
    if (!L) { showAlert(errText(d.lastError || "limit")); return null; }
    try { d.setActive(L.id); } catch (e) { /* ignore */ }
    requestRender({}); scheduleMarks();
    return L;
  };
  /** new adjustment or effect layer above the active one; masked by the selection or the background when the scope says so */
  const addAdj = (kind, t, p) => {
    const d = eng.doc;
    if (!d) return null;
    const sc = scopeNow.current;
    if (sc === 2 && !(d.sel && d.sel.m)) { showAlert(P.noSelection); return null; }
    const L = addLayer(kind, { t, p: p || newParams(kind, t) });
    if (!L) return null;
    let from = null;
    if (sc === 1) from = "background"; else if (sc === 2 || (d.sel && d.sel.m)) from = "selection";
    if (from) {
      let ok = null;
      try { ok = d.addMask(L.id, from); } catch (e) { ok = null; }
      if (!ok && d.lastError === "bg") showAlert(P.bgNotFound);
      const mk = L.mask && L.mask.m;
      if (mk) flashMask(mk); else if (from === "selection" && d.sel) flashMask(d.sel.m);
    }
    setOpenSec("props", true);
    return L;
  };
  const scopeNow = useRef(0); scopeNow.current = scope;
  const deselect = () => { const d = eng.doc; if (d && d.sel) { try { d.deselect(); } catch (e) { /* ignore */ } } };
  const selectAll = () => { const d = eng.doc; if (d) { try { d.selectAll(); } catch (e) { /* ignore */ } } };
  const setSelection = (mask, op, lk) => {
    const d = eng.doc;
    if (!d || !mask) return;
    try { d.setSelection(mask, op, lk); } catch (e) { /* ignore */ }
    const wa = d.wa;
    let bb = null;
    try { bb = d.sel && d.sel.m ? maskBBox(d.sel.m, wa.w, wa.h) : null; } catch (e) { bb = null; }
    if (bb) toast(fmt(P.selMade, { w: bb.w, h: bb.h }));
  };
  const selectOutPoly = (ptsOut, op, lk, feather) => {
    const d = eng.doc;
    if (!d) return;
    const pts = ptsOut.map((q) => o2b(q.x, q.y));
    let m = fillPoly(pts, d.wa);
    if (feather > 0) { try { m = maskFeather(m, d.wa.w, d.wa.h, feather) || m; } catch (e) { /* ignore */ } }
    setSelection(m, op, lk);
  };
  const compositeRGBA = () => {
    const r = eng.rend, d = eng.doc;
    if (!r || !d) return null;
    let S = null;
    try { S = r.composite({}); } catch (e) { S = null; }
    if (!S || !S.read) return null;
    try { return { d: S.read({ x: 0, y: 0, w: S.w, h: S.h }), w: S.w, h: S.h }; } catch (e) { return null; }
  };
  const wandAt = (o, op) => {
    const d = eng.doc, c = compositeRGBA();
    if (!d || !c) return;
    const b = o2b(o.x, o.y), wa = d.wa, onWa = c.w === wa.w && c.h === wa.h;
    const x = Math.round(onWa ? b.x - wa.x : b.x), y = Math.round(onWa ? b.y - wa.y : b.y);
    if (x < 0 || y < 0 || x >= c.w || y >= c.h) return;
    const wo = optsNow.current.selWand;
    let m = null;
    try { m = wand(c.d, c.w, c.h, x, y, wo.tol, wo.contig !== 0); } catch (e) { m = null; }
    if (!m) return;
    setSelection(onWa ? m : toWa(m, c.w, c.h, wa), op, "selWand");
  };
  const selectBg = () => {
    const d = eng.doc, c = compositeRGBA();
    if (!d || !c) return false;
    let r = null;
    try { r = backgroundMask(c.d, c.w, c.h); } catch (e) { r = null; }
    const cov = r && r.mask ? maskCoverage(r.mask) : 0;
    if (!r || !r.ok || cov > 850 || cov < 50) { showAlert(P.bgNotFound); return false; }
    const m = c.w === d.wa.w && c.h === d.wa.h ? r.mask : toWa(r.mask, c.w, c.h, d.wa);
    try { d.setSelection(m, "new", "selBg"); } catch (e) { /* ignore */ }
    toast(fmt(P.bgSelected, { area: fmtArea(cov) }));
    return true;
  };
  const pickAt = (o, arm) => {
    const r = eng.rend;
    if (!r) return;
    const os = outSz();
    if (o.x < 0 || o.y < 0 || o.x >= os.w || o.y >= os.h) return;
    let s = null;
    try { s = r.sample(Math.floor(o.x), Math.floor(o.y), arm && arm.kind === "grey" ? 5 : SAMPLE_PX[optsNow.current.eyedrop.sample] || 5); } catch (e) { s = null; }
    if (!s) return;
    eng.picked = { x: Math.floor(o.x), y: Math.floor(o.y), ...s };
    if (arm && arm.kind === "grey" && apiRef.current && apiRef.current.onGreyPick) apiRef.current.onGreyPick(arm.id, s, o);
    else if (arm && arm.kind === "fill") { const d = eng.doc; if (d && editableNow.current) d.setGeo({ fill: [Math.round(s.r), Math.round(s.g), Math.round(s.b)] }, "fill"); }
    else toast(fmt(P.pickedColor, { r: Math.round(s.r), g: Math.round(s.g), b: Math.round(s.b) }));
    setArmed(null);
    bump();
  };
  const afterStroke = (tl, res) => {
    const d = eng.doc, r = eng.rend;
    if (!d || !r) return;
    if (res && Array.isArray(res.po) && res.po.length && tl !== "maskBrush" && tl !== "erase") {
      eng.pinTold = eng.pinTold || new Set();
      const fresh = res.po.filter((i) => !eng.pinTold.has(i));
      if (fresh.length) { fresh.forEach((i) => eng.pinTold.add(i)); toast(P.pinTouched); }
    }
    const fam = tl === "trace" ? "tr" : tl === "dodge" ? "db" : tl === "maskBrush" || tl === "erase" ? "" : "px";
    const ids = d.layers.filter((x) => x.k === fam || (!fam && x.id === d.activeId)).map((x) => x.id);
    for (const id of [...new Set(ids)]) {
      let st = null;
      try { st = r.layerStats ? r.layerStats(id) : null; } catch (e) { st = null; }
      if (st) eng.meter = { ...(eng.meter || {}), [id]: st.cov };
    }
    bump();
  };
  /* ---------- crop (frame in output space; Enter commits, Esc cancels) ---------- */
  const cropHit = (F, l) => {
    const corners = { nw: [F.x, F.y], ne: [F.x + F.w, F.y], sw: [F.x, F.y + F.h], se: [F.x + F.w, F.y + F.h],
      n: [F.x + F.w / 2, F.y], s: [F.x + F.w / 2, F.y + F.h], w: [F.x, F.y + F.h / 2], e: [F.x + F.w, F.y + F.h / 2] };
    const tol = coarse.current ? 22 : 12;
    for (const k of Object.keys(corners)) { const s = fromOut(corners[k][0], corners[k][1]); if (Math.hypot(s.x - l.x, s.y - l.y) <= tol) return k; }
    const q = toOut(l.x, l.y);
    if (q.x > F.x && q.x < F.x + F.w && q.y > F.y && q.y < F.y + F.h) return "move";
    return "new";
  };
  const cropRatio = () => {
    const r = RATIOS[optsNow.current.crop.ratio || 0];
    if (r === "orig") { const d = eng.doc; return d ? (d.geo && (d.geo.rot === 90 || d.geo.rot === 270) ? d.h / d.w : d.w / d.h) : null; }
    return r;
  };
  const cropMove = (D, o, shift) => {
    const F0 = D.F0, dx = o.x - D.o0.x, dy = o.y - D.o0.y, ratio = shift ? F0.w / F0.h : cropRatio();
    let x0 = F0.x, y0 = F0.y, x1 = F0.x + F0.w, y1 = F0.y + F0.h;
    if (D.h === "move") { x0 += dx; x1 += dx; y0 += dy; y1 += dy; }
    else if (D.h === "new") { x0 = D.o0.x; y0 = D.o0.y; x1 = o.x; y1 = o.y; }
    else {
      if (D.h.includes("w")) x0 += dx;
      if (D.h.includes("e")) x1 += dx;
      if (D.h.includes("n")) y0 += dy;
      if (D.h.includes("s")) y1 += dy;
    }
    let F = { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.max(8, Math.abs(x1 - x0)), h: Math.max(8, Math.abs(y1 - y0)) };
    if (ratio && D.h !== "move") {
      if (D.h === "n" || D.h === "s") F.w = F.h * ratio; else F.h = F.w / ratio;
      if (D.h === "new") { if (o.x < D.o0.x) F.x = D.o0.x - F.w; if (o.y < D.o0.y) F.y = D.o0.y - F.h; }
      else { if (D.h.includes("n")) F.y = y1 - F.h; if (D.h.includes("w")) F.x = x1 - F.w; }
    }
    return clampCrop(F);
  };
  /** keep the frame inside the rotated base (or inside 15 % margins when 여백 넓히기 is on) */
  const clampCrop = (F) => {
    const d = eng.doc;
    if (!d) return F;
    const ext = optsNow.current.crop.extend ? 0.15 : 0;
    const bx0 = -d.w * ext, by0 = -d.h * ext, bx1 = d.w * (1 + ext), by1 = d.h * (1 + ext);
    const inside = (G) => [[G.x, G.y], [G.x + G.w, G.y], [G.x, G.y + G.h], [G.x + G.w, G.y + G.h]].every(([x, y]) => {
      const b = o2b(x, y); return b.x >= bx0 - 0.5 && b.y >= by0 - 0.5 && b.x <= bx1 + 0.5 && b.y <= by1 + 0.5; });
    if (inside(F)) return F;
    const cx = F.x + F.w / 2, cy = F.y + F.h / 2;
    let lo = 0, hi = 1;
    for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2, G = { x: cx - (F.w * m) / 2, y: cy - (F.h * m) / 2, w: F.w * m, h: F.h * m }; if (inside(G)) lo = m; else hi = m; }
    if (lo < 0.05) return cropNow.current || F;
    return { x: cx - (F.w * lo) / 2, y: cy - (F.h * lo) / 2, w: F.w * lo, h: F.h * lo };
  };
  const cropToGeo = (F) => {
    const d = eng.doc, g = (d && d.geo) || {};
    const c = o2b(F.x + F.w / 2, F.y + F.h / 2);
    const swap = g.rot === 90 || g.rot === 270;
    const w = Math.round(swap ? F.h : F.w), h = Math.round(swap ? F.w : F.h);
    const crop = { x: Math.round(c.x - w / 2), y: Math.round(c.y - h / 2), w, h };
    const ext = { t: 0, r: 0, b: 0, l: 0 };
    if (optsNow.current.crop.extend) {
      const cs = [[F.x, F.y], [F.x + F.w, F.y], [F.x, F.y + F.h], [F.x + F.w, F.y + F.h]].map(([x, y]) => o2b(x, y));
      const minX = Math.min(...cs.map((p) => p.x)), maxX = Math.max(...cs.map((p) => p.x)), minY = Math.min(...cs.map((p) => p.y)), maxY = Math.max(...cs.map((p) => p.y));
      ext.l = clamp(Math.ceil((Math.max(0, -minX) / d.w) * 1000), 0, 150); ext.r = clamp(Math.ceil((Math.max(0, maxX - d.w) / d.w) * 1000), 0, 150);
      ext.t = clamp(Math.ceil((Math.max(0, -minY) / d.h) * 1000), 0, 150); ext.b = clamp(Math.ceil((Math.max(0, maxY - d.h) / d.h) * 1000), 0, 150);
    }
    return { crop, ext };
  };
  const commitCrop = () => {
    const F = cropNow.current, d = eng.doc;
    setCropDraft(null);
    if (!F || !d || !editableNow.current) return;
    const os = outSz();
    if (Math.abs(F.x) < 0.5 && Math.abs(F.y) < 0.5 && Math.abs(F.w - os.w) < 0.5 && Math.abs(F.h - os.h) < 0.5) return;
    const { crop, ext } = cropToGeo(F);
    const g = d.geo || {}, e0 = g.ext || { t: 0, r: 0, b: 0, l: 0 };
    const patch = { crop };
    if (ext.t !== e0.t || ext.r !== e0.r || ext.b !== e0.b || ext.l !== e0.l) patch.ext = ext;
    eng.cropHand = true;
    try { d.setGeo(patch, "crop"); } catch (e) { /* ignore */ }
  };
  const setStraighten = (r10) => {
    const d = eng.doc;
    if (!d || !editableNow.current) return;
    const g = d.geo || {};
    const patch = { r: r10 };
    if (!eng.cropHand && !optsNow.current.crop.extend) {
      const deg = Math.abs(r10 / 10), W = d.w, Hh = d.h;
      let k = 1;
      try { k = autoCropScale(W, Hh, deg) || 1; } catch (e) { k = 1; }
      const w = Math.round(W * k), h = Math.round(Hh * k);
      patch.crop = { x: Math.round((W - w) / 2), y: Math.round((Hh - h) / 2), w, h };
    }
    if (g.r !== r10) { try { d.setGeo(patch, "straighten"); } catch (e) { /* ignore */ } }
  };
  const previewStraighten = (r10) => {
    const d = eng.doc;
    if (!d) return;
    const r0 = (d.geo && d.geo.r) || 0, o = outSz();
    placeStage(rotAbout(geoM(), o.w / 2, o.h / 2, (r10 - r0) / 10));
  };

  /* ---------- text tool (IME-safe textarea over the canvas, §4.7) ---------- */
  const openText = (L, at) => {
    const d = eng.doc;
    if (!d) return;
    if (!L) {
      const nTxt = d.layers.filter((x) => x.k === "txt").length, nMarks = d.layers.filter((x) => x.k === "txt" || x.k === "ov").length;
      if (nTxt >= LIMITS.zones.txt) { showAlert(P.txtMax); return; }
      if (nMarks >= LIMITS.zones.mark) { showAlert(P.markLimit); return; }
    }
    const to = optsNow.current.text;
    setTextEd({ id: L ? L.id : 0, x: L ? markXY(L).x : at.x, y: L ? markXY(L).y : at.y, s: L && L.p ? L.p.s || "" : "",
      fn: L && L.p && L.p.fn != null ? L.p.fn : to.fn, sz: L && L.p && L.p.sz ? L.p.sz : to.sz, wt: L && L.p && L.p.wt != null ? L.p.wt : to.wt,
      al: L && L.p && L.p.al != null ? L.p.al : to.al, c: L && L.p && L.p.c ? L.p.c : TEXT_RGB[to.color] || TEXT_RGB[0] });
    setSelMark(L ? L.id : 0);
    scheduleMarks();
    requestAnimationFrame(() => { if (txtRef.current) { txtRef.current.focus({ preventScroll: true }); } });
  };
  const commitText = () => {
    const te = textEdNow.current, d = eng.doc;
    setTextEd(null); textEdNow.current = null;
    if (!te || !d) { scheduleMarks(); return; }
    const s = String(te.s || "").replace(/\r/g, "").split("\n").slice(0, 3).join("\n").slice(0, LIMITS.txtChars);
    const p = { s, x: te.x, y: te.y };
    if (te.fn) p.fn = te.fn;
    if (te.sz && te.sz !== 40) p.sz = te.sz;
    if (te.wt) p.wt = te.wt;
    if (te.al) p.al = te.al;
    if (te.c && !(te.c[0] === 0 && te.c[1] === 0 && te.c[2] === 0)) p.c = te.c;
    if (te.id) {
      const L = d.layers.find((x) => x.id === te.id);
      if (!s.trim()) { try { d.remove(te.id); } catch (e) { /* ignore */ } }
      else if (L && JSON.stringify(L.p || {}) !== JSON.stringify(p)) commitP(te.id, p, "textEdit");
    } else if (s.trim()) {
      const L = addLayer("txt", { p });
      if (L) setSelMark(L.id);
    }
    scheduleMarks();
  };
  const cancelText = () => { setTextEd(null); textEdNow.current = null; scheduleMarks(); };

  /* ---------- transient operations (Esc cancels, Enter / save / stage change commit) ---------- */
  const hasTransient = () => !!(cropNow.current || textEdNow.current || armedNow.current || (drag.current && drag.current.mode !== "pan") || measure || keysOpen || closeBar);
  const commitTransient = () => {
    if (textEdNow.current) commitText();
    if (cropNow.current) commitCrop();
  };
  const cancelTransient = () => {
    const D = drag.current;
    if (D) {
      if (D.mode === "brush") { try { eng.brush.cancel(); } catch (e) { /* ignore */ } requestRender({}); }
      if (D.mode === "mark") { M.override = null; scheduleMarks(); }
      if (D.mode === "ai") requestRender({});
      drag.current = null;
      ovSet({ marquee: null, lasso: null, line: null, pinDrag: null });
    }
    if (textEdNow.current) cancelText();
    if (cropNow.current) setCropDraft(null);
    if (armedNow.current) setArmed(null);
    if (measure) setMeasure(null);
    if (keysOpen) setKeysOpen(false);
    if (closeBar === "ask") setCloseBar("");
  };

  /* ---------- history ---------- */
  const undo = () => {
    const d = eng.doc;
    if (!d || !editableNow.current) return;
    cancelTransient();
    if (!d.canUndo()) { toast(P.nothingUndo); return; }
    const r = d.undo();
    if (r) toast(fmt(P.undoDone, { name: histLabel(r) }));
    requestRender({}); scheduleMarks(); bump();
  };
  const redo = () => {
    const d = eng.doc;
    if (!d || !editableNow.current || !d.canRedo()) return;
    const r = d.redo();
    if (r) toast(fmt(P.redoDone, { name: histLabel(r) }));
    requestRender({}); scheduleMarks(); bump();
  };

  /* ---------- keyboard (§4.7): physical keys only; IME-safe ---------- */
  const digitBuf = useRef({ v: "", t: 0 });
  const nudge = (dx, dy) => {
    const d = eng.doc;
    if (!d || !editableNow.current) return false;
    if (cropNow.current) { const F = cropNow.current; setCropDraft(clampCrop({ ...F, x: F.x + dx, y: F.y + dy })); return true; }
    if (selPinNow.current >= 0 && toolNow.current === "pin" && d.pins && d.pins[selPinNow.current]) {
      const pins = d.pins.slice(), p = pins[selPinNow.current], b = b2o((p.x / 1000) * d.w, (p.y / 1000) * d.h), nb = o2b(b.x + dx, b.y + dy);
      pins[selPinNow.current] = { ...p, x: clamp(Math.round((nb.x / d.w) * 1000), 0, 1000), y: clamp(Math.round((nb.y / d.h) * 1000), 0, 1000) };
      d.setPins(pins, "pinMove"); return true;
    }
    const L = selMarkNow.current && d.layers.find((x) => x.id === selMarkNow.current);
    if (L && (L.k === "ov" || L.k === "txt")) {
      const os = outSz(), xy = markXY(L);
      const p = { ...(L.p || {}), x: clamp(Math.round(xy.x + (dx / os.w) * 1000), 0, 1000), y: clamp(Math.round(xy.y + (dy / os.h) * 1000), 0, 1000) };
      delete p.ps;
      commitP(L.id, p, "markMove:" + (L.k === "txt" ? "txt" : L.t)); return true;
    }
    const A = d.layers.find((x) => x.id === d.activeId);
    if (A && A.k === "ai" && !A.lk) {
      /* review R2-13: arrows move on screen (output axes); the AI layer offset is in base px, so map the delta back */
      const os = outSz(), b0 = o2b(os.w / 2, os.h / 2), b1 = o2b(os.w / 2 + dx, os.h / 2 + dy), q = A.p || {};
      commitP(A.id, { ...q, dx: clamp(Math.round((q.dx || 0) + b1.x - b0.x), -999, 999), dy: clamp(Math.round((q.dy || 0) + b1.y - b0.y), -999, 999) }, "layerAiMove");
      return true;
    }
    return false;
  };
  const selPinNow = useRef(-1); selPinNow.current = selPin;
  const selMarkNow = useRef(0); selMarkNow.current = selMark;
  const clearSelArea = () => {
    const d = eng.doc;
    if (!d || !editableNow.current || !d.sel || !d.sel.m) return false;
    const A = d.layers.find((x) => x.id === d.activeId);
    if (!A || A.lk || A.missing || !["ai", "px", "tr", "db"].includes(A.k)) return false;
    try {
      const ed = d.beginEdit(A.id, "px"), S = ed.surface, wa = d.wa;
      const bb = maskBBox(d.sel.m, wa.w, wa.h);
      if (!bb) { ed.cancel(); return false; }
      const off = A.bx && S.w !== wa.w ? { x: A.bx.x, y: A.bx.y } : { x: 0, y: 0 };
      const r = { x: clamp(bb.x - off.x, 0, S.w), y: clamp(bb.y - off.y, 0, S.h) };
      r.w = clamp(bb.x + bb.w - off.x, 0, S.w) - r.x; r.h = clamp(bb.y + bb.h - off.y, 0, S.h) - r.y;
      if (r.w <= 0 || r.h <= 0) { ed.cancel(); return false; }
      const px = S.read(r);
      for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
        const mv = d.sel.m[(r.y + off.y + y) * wa.w + r.x + off.x + x], i = (y * r.w + x) * 4 + 3;
        px[i] = Math.round((px[i] * (255 - mv)) / 255);
      }
      S.write(r, px); ed.touch(r); ed.commit("layerClear", null);
      requestRender({});
      return true;
    } catch (e) { return false; }
  };
  const setOpacityDigit = (dg) => {
    const b = digitBuf.current, t = performance.now();
    const two = b.v && t - b.t < 300;
    const v = two ? parseInt(b.v + dg, 10) : dg === "0" ? 100 : parseInt(dg, 10) * 10;
    b.v = two ? "" : dg; b.t = t;
    const tl = toolNow.current;
    if (PAINT.has(tl) && (tl === "clone" || tl === "maskBrush")) { setOpt(tl, { op: clamp(v, 1, 100) }); return; }
    const d = eng.doc, A = d && d.layers.find((x) => x.id === d.activeId);
    if (A && editableNow.current && !A.lk) { try { d.setProp(A.id, "op", clamp(v, 0, 100) / 100, { lk: "layerOp", mergeKey: "op" + A.id }); } catch (e) { /* ignore */ } }
  };
  const onKeyDown = (e) => {
    if (e.code === "Tab") return;   // the trap handles Tab
    const tg = e.target;
    if (tg && tg.closest && tg.closest(".pf-viewer")) return;   // portal events bubble through React: the viewer handles its own keys
    const typing = !!(tg && tg.closest && tg.closest("textarea, select, [contenteditable=''], [contenteditable='true'], input:not([type=range]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=file])"));
    const mod = e.ctrlKey || e.metaKey, c = e.code;
    if (mod && c === "KeyS") { e.preventDefault(); if (canWrite && !confirmed) saveNow("manual"); return; }
    if (c === "AltLeft") { e.preventDefault(); return; }
    if (typing) return;
    if (!ready) { if (c === "Escape") { e.preventDefault(); requestClose(); } return; }
    if (c === "Escape") { e.preventDefault(); if (hasTransient()) cancelTransient(); else requestClose(); return; }
    if (mod) {
      if (e.shiftKey && c !== "KeyZ") return;      // never Ctrl+Shift+S/X/P/I/J/C
      if (e.altKey) return;
      const run = (f) => { e.preventDefault(); f(); };
      switch (c) {
        case "KeyZ": return run(() => (e.shiftKey ? redo() : undo()));
        case "KeyY": return run(redo);
        case "Digit0": case "Numpad0": return run(fitView);
        case "Digit1": case "Numpad1": return run(zoom100);
        case "Equal": case "NumpadAdd": return run(() => zoomBy(1.25));
        case "Minus": case "NumpadSubtract": return run(() => zoomBy(0.8));
        case "KeyA": return run(() => { if (editableNow.current) selectAll(); });
        case "KeyD": return run(() => { if (editableNow.current) deselect(); });
        case "KeyJ": return run(() => { if (feat("all") && editableNow.current) layerCmd("dup"); });
        case "KeyE": return run(() => { if (feat("all") && editableNow.current) layerCmd("merge"); });
        case "KeyL": return run(() => { if (editableNow.current) { goStage("tone", { focus: false }); addAdj("adj", "lv"); } });
        case "KeyM": return run(() => { if (editableNow.current) { goStage("tone", { focus: false }); addAdj("adj", "cv"); } });
        case "KeyU": return run(() => { if (editableNow.current) { goStage("tone", { focus: false }); addAdj("adj", "hs"); } });
        default: return;
      }
    }
    if (e.isComposing || e.keyCode === 229) return;
    if (e.altKey && c !== "Backslash") return;
    const onSurface = tg === rootRef.current || tg === viewRef.current || tg === document.body || (tg && tg.classList && tg.classList.contains("pe-view"));
    /* review A7 (WCAG 2.1.4): single-key shortcuts act only while focus is on the editor surface or the tool bar, never on a
       focused button, slider or tab elsewhere (those keep their own keys) */
    if (!onSurface && !(tg && tg.closest && tg.closest(".pe-tools"))) return;
    if (c === "Space") { if (onSurface) { e.preventDefault(); spaceDown.current = true; if (viewRef.current) viewRef.current.dataset.space = "1"; } return; }
    if (c === "Backslash") { e.preventDefault(); setHold(true); return; }
    if (c === "Enter" || c === "NumpadEnter") {
      if (cropNow.current && onSurface) { e.preventDefault(); commitCrop(); return; }
      if (measure && onSurface) { e.preventDefault(); return; }
      return;
    }
    if (c === "Delete" || c === "Backspace") {
      if (toolNow.current === "pin" && selPinNow.current >= 0 && eng.doc && editableNow.current) {
        e.preventDefault(); const pins = (eng.doc.pins || []).filter((_, i) => i !== selPinNow.current); eng.doc.setPins(pins, "pinDel"); setSelPin(-1); return;
      }
      if (clearSelArea()) e.preventDefault();
      return;
    }
    if (c.startsWith("Arrow")) {
      const isRange = tg && tg.tagName === "INPUT";
      if (isRange || !onSurfaceForArrows(tg)) return;
      const s = e.shiftKey ? 10 : 1, dx = c === "ArrowLeft" ? -s : c === "ArrowRight" ? s : 0, dy = c === "ArrowUp" ? -s : c === "ArrowDown" ? s : 0;
      if (nudge(dx, dy)) e.preventDefault();
      return;
    }
    if (c === "BracketLeft" || c === "BracketRight") {
      const tl = toolNow.current;
      if (!PAINT.has(tl)) return;
      e.preventDefault();
      const o = optsNow.current[tl] || {};
      if (e.shiftKey) setOpt(tl, { hard: clamp((o.hard || 0) + (c === "BracketLeft" ? -25 : 25), 0, 100) });
      else { const s0 = sizeOf(tl); setOpt(tl, { size: clamp(Math.round(c === "BracketLeft" ? Math.min(s0 - 1, s0 * 0.9) : Math.max(s0 + 1, s0 * 1.1)), 1, 400) }); }
      return;
    }
    const dm = /^(Digit|Numpad)([0-9])$/.exec(c);
    if (dm) { e.preventDefault(); setOpacityDigit(dm[2]); return; }
    for (const id of Object.keys(TOOLS)) {
      const t = TOOLS[id];
      if (!t.code || t.code !== c) continue;
      if (id === "dodge" && e.shiftKey) { e.preventDefault(); pickTool("dodge"); setOpt("dodge", { mode: 1 }); return; }
      if (!!t.shift !== !!e.shiftKey) continue;
      if (!toolAvail(id, { phone })) continue;
      e.preventDefault(); pickTool(id); return;
    }
  };
  const onSurfaceForArrows = (tg) => !tg || tg === rootRef.current || tg === viewRef.current || tg === document.body || (tg.closest && !!tg.closest(".pe-view"));
  const onKeyUp = (e) => {
    if (e.code === "AltLeft") { e.preventDefault(); return; }
    if (e.code === "Space") { spaceDown.current = false; if (viewRef.current) delete viewRef.current.dataset.space; }
    if (e.code === "Backslash") setHold(false);
  };
  /* Tab trap over the overlay plus the captions bar tools (.ax-float, .paste-ask); key events from outside the root too */
  useEffect(() => {
    const onDocKey = (e) => {
      const root = rootRef.current;
      if (!root) return;
      if (document.querySelector(".pf-viewer")) return;   // a viewer opened from the editor keeps its own trap and Esc
      if (e.key === "Tab") {
        /* review A6: while the shortcut dialog is open, Tab stays inside it */
        const dlg = root.querySelector(".pe-dlg");
        if (dlg) {
          const f = [...dlg.querySelectorAll("button:not([disabled]), [href], [tabindex]:not([tabindex='-1'])")];
          if (f.length) {
            const j = f.indexOf(document.activeElement);
            e.preventDefault();
            f[(j < 0 ? 0 : e.shiftKey ? j - 1 + f.length : j + 1) % f.length].focus();
          }
          return;
        }
        const sel = "a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
        const pool = [...root.querySelectorAll(sel), ...document.querySelectorAll(".ax-float " + sel.split(", ").join(", .ax-float ") + ", .paste-ask " + sel.split(", ").join(", .paste-ask "))]
          .filter((el) => el.offsetParent !== null || el === document.activeElement);
        if (!pool.length) return;
        const i = pool.indexOf(document.activeElement);
        const inside = root.contains(document.activeElement) || i >= 0;
        if (!inside) { e.preventDefault(); pool[0].focus(); return; }
        if (e.shiftKey && i <= 0) { e.preventDefault(); pool[pool.length - 1].focus(); }
        else if (!e.shiftKey && i === pool.length - 1) { e.preventDefault(); pool[0].focus(); }
        return;
      }
      if (!root.contains(e.target) && (e.key === "Escape" || ((e.ctrlKey || e.metaKey) && (e.code === "KeyS" || e.code === "KeyZ" || e.code === "KeyY")))) onKeyDown(e);
    };
    document.addEventListener("keydown", onDocKey, true);
    return () => document.removeEventListener("keydown", onDocKey, true);
  });

  /* ---------- layer commands shared by shortcuts and the panel ---------- */
  const layerCmd = (cmd) => {
    const d = eng.doc;
    if (!d || !editableNow.current) return;
    const A = d.layers.find((x) => x.id === d.activeId);
    if (!A) { toast(P.needLayer); return; }
    let r = null;
    try { r = memRetry(() => (cmd === "dup" ? d.duplicate(A.id) : cmd === "merge" ? d.mergeDown(A.id) : null)); } catch (e) { r = null; }
    if (!r && d.lastError) showAlert(errText(d.lastError));
    requestRender({}); bump();
  };

  /* ---------- notes (s6f.notes; the editor is the only editable instance while open) ---------- */
  const writeNote = (k, text) => {
    const sf = setFieldRef.current;
    if (!sf || !canWrite || locked) return;
    sf(KEYS.notes, totalUpd((cur) => coreSetNote(cur, k, text, nowS())));
  };
  const patchNotes = (obj) => {
    const sf = setFieldRef.current;
    if (!sf || !canWrite || locked) return;
    sf(KEYS.notes, totalUpd((cur) => ({ ...(isPlain(cur) ? cur : { v: 1 }), ...obj })));
  };

  /* ---------- small layer helpers used by the panels ---------- */
  const setLayerOp = (id, v, final) => {
    const d = eng.doc;
    if (!d || !editableNow.current) return;
    if (!final) { eng.opDraft = { id, v }; bump(); return; }
    eng.opDraft = null;
    const L = d.layers.find((x) => x.id === id);
    if (!L || Math.round((L.op == null ? 1 : L.op) * 100) === v) { bump(); return; }
    try { d.setProp(id, "op", clamp(v, 0, 100) / 100, { lk: "layerOp" }); } catch (e) { /* ignore */ }
    requestRender({}); scheduleMarks();
  };
  const clearLayer = (id) => {
    const d = eng.doc;
    if (!d || !editableNow.current) return;
    try {
      const ok = memRetry(() => { const ed = d.beginEdit(id, "px"), S = ed.surface; S.clear(); if (!ed.touch({ x: 0, y: 0, w: S.w, h: S.h })) { ed.cancel(); d.lastError = "memory"; return false; } ed.commit("layerClear", null); return true; });
      if (!ok) showAlert(errText(d.lastError || "base"));
    } catch (e) { showAlert(errText(d.lastError || "base")); }
    requestRender({});
  };
  /** 5 × 5 mean of the composite below a layer at an output point (회색 맞추기 samples what the layer receives) */
  const sampleBelow = (id, o) => {
    const d = eng.doc, r = eng.rend;
    if (!d || !r) return null;
    const idx = d.layers.findIndex((x) => x.id === id), b = o2b(o.x, o.y);
    let S = null;
    try { S = r.below(idx < 0 ? d.layers.length : idx, {}); } catch (e) { S = null; }
    if (!S || !S.read) { try { return r.sample(Math.floor(o.x), Math.floor(o.y), 5); } catch (e) { return null; } }
    const onWa = S.w === d.wa.w && S.h === d.wa.h, x0 = Math.round(onWa ? b.x - d.wa.x : b.x) - 2, y0 = Math.round(onWa ? b.y - d.wa.y : b.y) - 2;
    const rx = clamp(x0, 0, Math.max(0, S.w - 5)), ry = clamp(y0, 0, Math.max(0, S.h - 5));
    let px;
    try { px = S.read({ x: rx, y: ry, w: Math.min(5, S.w), h: Math.min(5, S.h) }); } catch (e) { return null; }
    let R = 0, G = 0, B = 0, n = 0;
    for (let i = 0; i < px.length; i += 4) { R += px[i]; G += px[i + 1]; B += px[i + 2]; n++; }
    return n ? { r: R / n, g: G / n, b: B / n } : null;
  };
  const greyApply = (id, s, o) => {
    const d = eng.doc, L = d && d.layers.find((x) => x.id === id);
    if (!L || !s) return;
    const p = { ...(L.p || {}) };
    const sample = Object.assign([s.r, s.g, s.b], { r: s.r, g: s.g, b: s.b });
    let cv = null;
    try { cv = greyPointCurves(sample, p.tg ? p.tg : null); } catch (e) { cv = null; }
    if (cv) ["r", "g", "b"].forEach((c) => { if (Array.isArray(cv[c])) p[c] = cv[c].map((v) => clamp(Math.round(v), 0, 255)); });
    if (o) { const os = outSz(); p.x = clamp(Math.round((o.x / os.w) * 1000), 0, 1000); p.y = clamp(Math.round((o.y / os.h) * 1000), 0, 1000); }
    else { delete p.x; delete p.y; }
    commitP(id, pruneP("adj", "gp", p), "adjEdit:gp");
    toast(P.gpDone);
  };
  const greyFromBackground = (id) => {
    const c = compositeRGBA();
    if (!c) return;
    let r = null;
    try { r = backgroundMask(c.d, c.w, c.h); } catch (e) { r = null; }
    if (!r || !r.ok || !r.mask) { showAlert(P.bgNotFound); return; }
    let R = 0, G = 0, B = 0, n = 0;
    for (let i = 0; i < r.mask.length; i++) if (r.mask[i] > 128) { R += c.d[i * 4]; G += c.d[i * 4 + 1]; B += c.d[i * 4 + 2]; n++; }
    if (!n) { showAlert(P.bgNotFound); return; }
    greyApply(id, { r: R / n, g: G / n, b: B / n }, null);
  };
  const greyRetarget = (id, tg) => {
    const d = eng.doc, L = d && d.layers.find((x) => x.id === id);
    if (!L) return;
    const p = { ...(L.p || {}), tg };
    if (Number.isFinite(p.x) && Number.isFinite(p.y)) {
      const os = outSz(), o = { x: (p.x / 1000) * os.w, y: (p.y / 1000) * os.h };
      const s = sampleBelow(id, o);
      if (s) { const L2 = { ...L, p }; void L2; commitP(id, pruneP("adj", "gp", p), "adjEdit:gp"); greyApply(id, s, o); return; }
    }
    commitP(id, pruneP("adj", "gp", p), "adjEdit:gp");
  };
  /** 곡선: Ctrl+click on the image adds a point at the clicked tone (§4.8) */
  const curvePointAt = (o) => {
    const d = eng.doc, A = d && d.layers.find((x) => x.id === d.activeId);
    if (!A || A.k !== "adj" || A.t !== "cv" || !editableNow.current) return false;
    const s = sampleBelow(A.id, o);
    if (!s) return true;
    const p = { ...(A.p || {}) }, pts = Array.isArray(p.l) ? p.l.slice() : [0, 0, 255, 255];
    const x = clamp(Math.round(0.3 * s.r + 0.59 * s.g + 0.11 * s.b), 1, 254);
    for (let i = 0; i < pts.length; i += 2) if (pts[i] === x) return true;
    let lut = null;
    try { lut = curveLut(pts, p.md || 0); } catch (e) { lut = null; }
    const y = lut ? lut[x] : x;
    let i = 2;
    while (i < pts.length - 2 && pts[i] < x) i += 2;
    pts.splice(i, 0, x, y);
    const np = pruneP("adj", "cv", { ...p, l: pts });
    if (pts.length > (phone ? 8 : 28) || !pOk("adj", "cv", np)) { showAlert(P.curveMax); return true; }
    commitP(A.id, np, "adjEdit:cv");
    return true;
  };
  const onGreyPick = (id, s0, o) => { const s = sampleBelow(id, o) || s0; greyApply(id, s, o); };

  /* ---------- api handed to the panels ---------- */
  const apiRef = useRef(null);
  const api = {
    setLayerOp, clearLayer, greyFromBackground, greyRetarget, onGreyPick,
    audience: props.readOnly && !preview ? "teacher" : "student",
    skipStage: (k, on) => stageRecUpdate(eng.session ? eng.session.sr : {}, k, on ? "skip" : "unskip", nowS()) || (eng.session ? eng.session.sr : {}),
    recTries: (n) => stageRecUpdate(eng.session ? eng.session.sr : {}, "patch", { tries: n }, nowS()) || (eng.session ? eng.session.sr : {}),
    cellLabels: CELL_LABEL, itemLabels: [CELL_LABEL[0], ...ITEMS.map((k) => ITEM_LABEL[k])],
    doc, rend, brush: eng.brush, session: eng.session, saver: eng.saver, eng,
    stage, setStage: goStage, tool, setTool: pickTool, opts, setOpt, adv, all, phone, coarse: coarse.current,
    editable, canWrite, locked, confirmed, preview, ws: wsRef.current, notes, steps, edit, inspectItems: inspectItems || [],
    toast, alert: showAlert, errText, render: requestRender, marks: scheduleMarks, bump,
    preview_: (id, p) => requestRender({ interactive: true, preview: { id, p } }),
    commit: commitP, addLayer, addAdj, scope, setScope,
    setNote: writeNote, patchNotes, coreSetNote: null,
    routeView, setRoute: (route) => { const d = eng.doc; if (d && editableNow.current) d.setRoute(route, "route"); },
    selectBg, selectAll, deselect, setSelection, invertSel: () => { const d = eng.doc; if (d && d.sel) { try { d.invertSelection(); } catch (e) { /* ignore */ } } },
    featherSel: (px) => { const d = eng.doc; if (d && d.sel) { try { d.featherSelection(px); } catch (e) { /* ignore */ } } },
    growSel: (px) => { const d = eng.doc; if (d && d.sel) { try { d.growSelection(px); } catch (e) { /* ignore */ } } },
    selNumeric: (r) => selectOutPoly([{ x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x + r.w, y: r.y + r.h }, { x: r.x, y: r.y + r.h }], "new", "selNumeric", 0),
    flashMask, armGrey: (id) => setArmed({ kind: "grey", id }), armFill: () => setArmed({ kind: "fill" }), armSource: () => { setArmed({ kind: "source" }); toast(P.sourceArm); },
    armed,
    cmpMode, setCmpMode: (m) => { setCmpMode(m); requestAnimationFrame(() => { if (V.fit) fitView(); }); }, wipe, setWipe, origLayout, setOrigLayout,
    viewHide, setViewHide: (ids) => { setViewHide(ids); if (eng.rend && eng.rend.setViewOverride) eng.rend.setViewOverride({ hide: ids }); requestRender({}); scheduleMarks(); },
    save: saveNow, saveSt, dirty: docDirty, uploading: uploadingNow,
    openText, addText: () => {
      const d = eng.doc;
      if (!d) return;
      const r = eng.rend, os = outSz();
      let at = { x: 500, y: 120 };
      try {
        const c = compositeRGBA();
        let box = c ? objectBox(c.d, c.w, c.h) : null;
        if (box) { const a = b2o(box.x + (c.w !== d.w ? d.wa.x : 0), box.y + (c.h !== d.h ? d.wa.y : 0)); box = { ...box, x: a.x, y: a.y }; }
        const q = autoPlace("txt", os.w, os.h, box, r && r.ppc ? r.ppc() : null);
        if (q && Number.isFinite(q.x) && Number.isFinite(q.y)) at = { x: clamp(Math.round(q.x), 0, 1000), y: clamp(Math.round(q.y), 0, 1000) };
      } catch (e) { /* B not ready: top centre */ }
      pickTool("text"); openText(null, at);
    },
    measure, setMeasure, cropDraft, setCropDraft, commitCrop, cancelCrop: () => setCropDraft(null), setStraighten, previewStraighten,
    resetGeo: () => { const d = eng.doc; if (d && editableNow.current) { eng.cropHand = false; d.setGeo({ crop: null, r: 0, rot: 0, ext: { t: 0, r: 0, b: 0, l: 0 } }, "crop"); } },
    selPin, setSelPin, selMark, setSelMark, layerCmd, compositeRGBA, outSz, b2o, o2b, fromOut, toOut,
    openSection: (k) => setOpenSec(k, true), viewCenterOut: () => { const ps = paneSize(); return toOut(ps.w / 2, ps.h / 2); },
    phraseNow: null, missingN, reload: () => loadAll({ quiet: false }), memRetry,
    ownerId: owner, store, setField: setFieldRef.current, dev: eng.dev,
  };
  apiRef.current = api;

  /* 원본 보기(누르고 있기): pointer or Enter/Space held */
  const holdProps = {
    onPointerDown: (e) => { e.preventDefault(); setHold(true); }, onPointerUp: () => setHold(false), onPointerLeave: () => setHold(false), onPointerCancel: () => setHold(false),
    onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setHold(true); } },
    onKeyUp: (e) => { if (e.key === "Enter" || e.key === " ") setHold(false); }, onBlur: () => setHold(false),
  };

  /* ---------- status line (§4.14, §6.12) ---------- */
  const status = (() => {
    const st = saveSt || {};
    const dd = ready && docDirty();
    if (preview) return { text: T.preview };
    if (secondTab) return { text: P.secondTab };
    if (versionRO) return { text: T.readOnlyVersion };
    if (locked) return { text: T.stLocked };
    switch (st.phase) {
      case "encoding": case "uploading": return { text: fmt(T.stUploading, { i: Math.min(st.total || 1, (st.done || 0) + 1), n: st.total || 1 }), line: st.slow ? T.stSlow : "" };
      case "writing": case "confirming": return { text: T.stConfirming };
      case "offline": return { text: T.stDraft, line: T.stOffline };
      case "locked": return { text: T.stLocked };
      case "error": {
        const line = st.err === "rejected" ? T.errRejected : st.err === "ws" ? T.errWs : st.err === "size" ? T.errSize : st.err === "memory" ? ERR_TEXT.memory : T.errTimeout;
        return { text: T.stFailed, err: true, line };
      }
      case "saved": return dd ? { text: T.stUnsaved } : { text: fmt(T.stSaved, { time: hhmm(st.at) }) };
      default: return dd ? { text: T.stUnsaved } : { text: "" };
    }
  })();

  /* ---------- render ---------- */
  const tools = (() => {
    const avail = (id) => toolAvail(id, { phone });
    if (all) {
      const groups = [{ k: "*", ids: COMMON_TOOLS.filter(avail) }];
      STAGES.forEach((s) => { const ids = [...STAGE_TOOLS[s].main, ...STAGE_TOOLS[s].adv].filter((id, i, a) => avail(id) && a.indexOf(id) === i && !groups.some((g) => g.ids.includes(id))); if (ids.length) groups.push({ k: s, ids }); });
      return groups;
    }
    const own = [...STAGE_TOOLS[stage].main, ...(adv ? STAGE_TOOLS[stage].adv : [])].filter(avail);
    const hideTools = hiddenStage(stage) || (phone && stage === "patch");
    const g = [{ k: stage, ids: hideTools ? [] : own }, { k: "*", ids: COMMON_TOOLS.filter(avail) }];
    const out = [...eng.outside].filter((id) => avail(id) && !own.includes(id) && !COMMON_TOOLS.includes(id));
    if (out.length) g.push({ k: "out", ids: out });
    return g;
  })();
  const toolBtn = (id) => (
    <button key={id} type="button" className="pe-tool" aria-pressed={tool === id} aria-label={tooltip(id)} title={tooltip(id)}
      onClick={() => pickTool(id)} disabled={!ready}><Icon k={id} /></button>
  );

  const stageMark = (k) => {
    const sr = (eng.session && eng.session.sr && eng.session.sr[k]) || (edit && edit.sr && edit.sr[k]) || {};
    if (k === stage) return { g: "●", sr: P.stageMarkSr.now, cls: "now" };
    if (hiddenStage(k)) return { g: "–", sr: P.stageMarkSr.hidden, cls: "hid" };
    if (sr.sk) return { g: "–", sr: P.stageMarkSr.skipped, cls: "skip" };
    if (sr.ch) return { g: "✓", sr: P.stageMarkSr.changed, cls: "ch" };
    if (rs[k] && rs[k].n > 0) return { g: "", sr: P.stageMarkSr.todo, cls: "todo", n: rs[k].n };
    return { g: "", sr: P.stageMarkSr.optional, cls: "opt" };
  };
  const onStripKey = (e) => {
    const i = STAGES.indexOf(stage);
    let j = -1;
    if (e.key === "ArrowRight") j = (i + 1) % STAGES.length;
    else if (e.key === "ArrowLeft") j = (i - 1 + STAGES.length) % STAGES.length;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = STAGES.length - 1;
    if (j < 0) return;
    e.preventDefault(); e.stopPropagation();
    goStage(STAGES[j], { focus: false });
    requestAnimationFrame(() => { const el = rootRef.current && rootRef.current.querySelector("#pe-tab-" + STAGES[j]); if (el) el.focus(); });
  };
  const strip = (
    <ol className="pe-strip" role="tablist" aria-label={P.stageStrip}>
      {STAGES.map((k, i) => {
        const m = stageMark(k);
        return (
          <React.Fragment key={k}>
            {k === "fix" ? <li role="separator" className="pe-strip-div" title={P.divider}><span className="ax-sr">{P.divider}</span></li> : null}
            <li role="presentation">
              <div id={"pe-tab-" + k} role="tab" tabIndex={k === stage ? 0 : -1} aria-selected={k === stage} aria-controls="pe-stagepanel"
                className={"pe-stab pe-stab-" + m.cls} data-i={i} onClick={() => goStage(k)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); goStage(k); } else onStripKey(e); }}>
                <span className="pe-stab-g" aria-hidden="true">{m.g}</span>
                <span className="pe-stab-n">{STAGE_TEXT[k].name}</span>
                {m.cls === "todo" ? <span className="pe-stab-cnt" aria-hidden="true">{fmt(T.todoCount, { n: m.n })}</span> : null}
                <span className="ax-sr">{m.sr}</span>
              </div>
            </li>
          </React.Fragment>
        );
      })}
    </ol>
  );

  const panelProps = { api, doc, renderer: rend, notes, setNote: writeNote, readOnly: !editable, ws: wsRef.current };
  const stagePanel = (() => {
    if (!ready || !doc) return null;
    const hid = hiddenStage(stage), phoneHid = phone && stage === "patch";
    switch (stage) {
      case "check": return <CheckPanel {...panelProps} route={routeView} setRoute={api.setRoute} pins={doc.pins || []} inspectItems={inspectItems || []} />;
      case "patch": return <PatchPanel {...panelProps} onImport={null} onAlign={null} rec={(eng.session && eng.session.sr && eng.session.sr.patch) || {}} session={eng.session} hidden={hid || phoneHid} hiddenWhy={phoneHid && !hid ? "phone" : hid ? "release" : ""} />;
      case "crop": return <CropPanel {...panelProps} tool={tool} setTool={pickTool} />;
      case "tone": return <TonePanel {...panelProps} onAdd={addAdj} scope={scope} setScope={setScope} adv={adv} />;
      case "fix": return <FixPanel {...panelProps} tool={tool} setTool={pickTool} hidden={hid || phoneHid} hiddenWhy={phoneHid && !hid ? "phone" : hid ? "release" : ""} />;
      case "mark": return <MarkPanel {...panelProps} tool={tool} setTool={pickTool} adv={adv} />;
      case "final": return <FinalPanel {...panelProps} session={eng.session} />;
      default: return null;
    }
  })();
  const sec = (k, title, body, forceOpen) => {
    const isOpen = forceOpen || open[k];
    return (
      <section className="pe-sec" key={k} id={"pe-secw-" + k}>
        <h3 className="pe-sec-h"><button type="button" aria-expanded={!!isOpen} aria-controls={"pe-sec-" + k} onClick={() => !forceOpen && setOpenSec(k, !isOpen)}>{title}</button></h3>
        {isOpen ? <div id={"pe-sec-" + k} className="pe-sec-b">{body}</div> : null}
      </section>
    );
  };
  const sideContent = ready && doc ? [
    <section className="pe-sec pe-sec-process" key="process" id="pe-stagepanel" role="tabpanel" aria-labelledby={"pe-tab-" + stage}>
      <div className="pe-sec-b">{React.cloneElement(stagePanel || <div />, { headRef: stageHeadRef })}</div>
    </section>,
    sec("layers", P.secLayers, <LayersPanel api={api} doc={doc} adv={adv} all={all && feat("all")} readOnly={!editable} phoneLock={phone} />),
    stage === "tone" || stage === "mark" ? null : sec("props", P.secProps, <PropsPanel api={api} doc={doc} renderer={rend} adv={adv} readOnly={!editable} onPreview={api.preview_} onCommit={commitP} />),
    sec("hist", P.secHistory, <HistoryPanel api={api} doc={doc} />),
    sec("info", P.secHist, <InfoPanel api={api} renderer={rend} doc={doc} sampleSize={SAMPLE_PX[opts.eyedrop.sample] || 5} />, stage === "tone"),
  ] : null;
  const sheetTabs = phone ? ["process", "props", "layers"] : ["process", "props", "layers", "hist", "info"];
  const sheetName = { process: P.secProcess, props: P.secProps, layers: P.secLayers, hist: P.secHistory, info: P.secInfo };
  const sheetBody = ready && doc ? (sheetTab === "process" ? sideContent[0]
    : sheetTab === "props" ? <div className="pe-sec-b"><PropsPanel api={api} doc={doc} renderer={rend} adv={adv} readOnly={!editable} onPreview={api.preview_} onCommit={commitP} /></div>
    : sheetTab === "layers" ? <div className="pe-sec-b"><LayersPanel api={api} doc={doc} adv={adv} all={all && feat("all")} readOnly={!editable} phoneLock={phone} /></div>
    : sheetTab === "hist" ? <div className="pe-sec-b"><HistoryPanel api={api} doc={doc} /></div>
    : <div className="pe-sec-b"><InfoPanel api={api} renderer={rend} doc={doc} sampleSize={SAMPLE_PX[opts.eyedrop.sample] || 5} /></div>) : null;

  const canvasLabel = (() => {
    if (!doc) return P.title;
    const parts = [fmt(P.canvasLayers, { n: (doc.layers || []).length })];
    const os = outSz();
    if (doc.geo && doc.geo.crop) parts.push(fmt(P.canvasCrop, { ratio: os.w + "×" + os.h + "px" }));
    (doc.layers || []).filter((L) => (L.k === "adj" || L.k === "flt") && L.vis !== 0).slice(0, 4).forEach((L) => parts.push(layerName(L, doc)));
    return fmt(P.canvasLabel, { summary: parts.join(", ") });
  })();

  const showBefore = hold || cmpMode === "wipe" || cmpMode === "side";
  /* the before canvas (generation original through the same geometry): created on demand, through gfx */
  useEffect(() => {
    if (!ready || !showBefore || !eng.doc || !eng.doc.base) return;
    const host = cmpMode === "side" ? beforeHostRef.current : wipeStageRef.current;
    if (!host) return;
    const b = eng.doc.base;
    if (!eng.beforeSurf) {
      try { eng.beforeSurf = eng.gfx.surface(b.w, b.h, "cmp"); eng.beforeSurf.draw(b, { dx: 0, dy: 0 }); } catch (e) { eng.beforeSurf = null; }
    }
    const cv = eng.beforeSurf && eng.beforeSurf.cv;
    if (!cv) return;
    cv.className = "pe-before-cv"; cv.style.width = b.w + "px"; cv.style.height = b.h + "px";
    if (cv.parentNode !== host) host.appendChild(cv);
    placeStage();
    if (cmpMode === "side" && origLayout && stageBRef.current) stageBRef.current.style.transform = "none";
  }, [ready, showBefore, cmpMode, origLayout, phase]);
  useEffect(() => { if (ready) { placeStage(); applyView(); } }, [cmpMode, flip, hold]);
  /* coverage overlay for 손질한 곳 보기 */
  useEffect(() => {
    const cv = covRef.current, r = eng.rend;
    if (!cv || !r) return;
    if (cmpMode !== "marks") { cv.width = cv.height = 0; return; }
    let c = null;
    try { c = r.coverage(); } catch (e) { c = null; }
    if (!c || !c.w) return;
    drawCoverage(cv, c);
    eng.cov = c;
    bump();
  }, [cmpMode, doc && doc.rev]);

  const optionsBar = ready ? <OptionsBar api={api} tool={tool} opts={opts} setOpt={setOpt} adv={adv} phone={phone} sizeOf={sizeOf}
    armed={armed} setArmed={setArmed} fingerPaint={fingerPaint} setFingerPaint={(v) => { setFingerPaint(v); togglePref("finger", v); }} coarse={coarse.current} /> : null;

  const closeBarEl = closeBar ? (
    <div className={"pe-bar " + (closeBar === "fail" ? "pe-bar-err" : "pe-bar-ask")} role={closeBar === "fail" ? "alert" : "group"} aria-label={P.closeBar}>
      <span>{closeBar === "fail" ? T.errTimeout : P.closeBar}</span>
      {closeBar === "fail" ? (
        <>
          <button type="button" className="btn small" onClick={saveAndClose}>{P.retrySave}</button>
          <button type="button" className="btn small ghost" onClick={closeNoSave}>{P.closeAnyway}</button>
        </>
      ) : (
        <>
          <button type="button" className="btn small" disabled={closeBar === "saving"} onClick={saveAndClose}>{P.saveClose}</button>
          <button type="button" className="btn small ghost" disabled={closeBar === "saving"} onClick={closeNoSave}>{P.closeNoSave}</button>
          <button type="button" className="btn small ghost" disabled={closeBar === "saving"} onClick={() => setCloseBar("")}>{P.cancel}</button>
        </>
      )}
    </div>
  ) : null;

  const viewCls = "pe-view tool-" + tool + (cmpMode === "side" ? " is-side" : "") + (hold ? " is-hold" : "") + (armed ? " is-armed" : "");
  const os = ready ? outSz() : { w: 1, h: 1 };
  return (
    <div className={"pe pe-full" + (phone ? " pe-phone" : portrait ? " pe-portrait" : "") + (coarse.current ? " pe-coarse" : "") + (all ? " pe-all" : "") + ((phone || portrait) && sheetBig ? " pe-sheet-big" : "")} role="dialog" aria-modal="true"
      aria-labelledby="pe-title" data-guard="off" tabIndex={-1} ref={rootRef} onKeyDown={onKeyDown} onKeyUp={onKeyUp}
      onScroll={(e) => { const el = e.currentTarget; if (e.target === el && (el.scrollTop || el.scrollLeft)) { el.scrollTop = 0; el.scrollLeft = 0; } }}>
      <header className="pe-top">
        <button type="button" className="pe-btn pe-close" onClick={requestClose}>{P.close}</button>
        <h2 id="pe-title" tabIndex={-1} ref={titleRef}>{P.title}</h2>
        {/* review r4 F2: phones have no bottom bar; the save status takes the badge's place in the top bar */}
        {phone ? (status.text ? <span className="pe-pill pe-pill-b" translate="no" aria-hidden="true" data-err={status.err ? "1" : ""}>{status.text}</span> : <span className="pe-badge">{P.phoneMode}</span>) : null}
        <div className="pe-actions">
          <button type="button" className="pe-btn pe-icon" aria-label={P.undo + " (Ctrl+Z)"} title={P.undo + " (Ctrl+Z)"} disabled={!editable || !(doc && doc.canUndo())} onClick={undo}><Icon k="undo" /><span className="pe-btn-l">{P.undo}</span></button>
          <button type="button" className="pe-btn pe-icon" aria-label={P.redo + " (Ctrl+Y)"} title={P.redo + " (Ctrl+Y)"} disabled={!editable || !(doc && doc.canRedo())} onClick={redo}><Icon k="redo" /><span className="pe-btn-l">{P.redo}</span></button>
          {!phone ? <button type="button" className="pe-btn" aria-pressed={adv} onClick={() => { const v = !adv; setAdv(v); togglePref("adv", v); }}>{P.adv}</button> : null}
          {!phone && feat("all") ? <button type="button" className="pe-btn" aria-pressed={all} onClick={() => { const v = !all; setAll(v); if (v) setAdv(true); togglePref("all", v); if (v) togglePref("adv", true); }}>{P.all}</button> : null}
          {!phone ? <button type="button" className="pe-btn" ref={keysBtnRef} onClick={() => setKeysOpen(true)}>{P.keys}</button> : null}
          {canWrite ? <button type="button" className="pe-btn pe-save" disabled={!editable} onClick={() => saveNow("manual")}>{P.save}</button> : null}
          {status.text ? <span className="pe-pill" translate="no" aria-hidden="true" data-err={status.err ? "1" : ""}>{status.text}</span> : null}
          <span className="ax-sr" role={status.err ? "alert" : "status"}>{status.text}</span>
        </div>
      </header>
      {closeBarEl}
      {status.line ? <p className={status.err ? "pe-bar pe-bar-err" : "pe-bar"} role={status.err ? "alert" : "status"}>{status.line}</p> : null}
      {conflict ? (
        <div className="pe-bar pe-bar-ask" role="group" aria-label={conflict === "same" ? P.prevSaved : P.otherDevice}>
          <span>{conflict === "same" ? P.prevSaved : P.otherDevice}</span>
          {conflictHeld ? <span className="pe-cfm-q" role="status">{P.conflictHeld}</span> : null}
          <ConfirmInline label={P.loadOther} ask={P.loadOtherAsk} onConfirm={loadTheirs} />
          <button type="button" className="btn small ghost" onClick={keepMine}>{conflict === "same" ? P.keepMineSame : P.keepMine}</button>
        </div>
      ) : null}
      {draftOffer ? (
        <div className="pe-bar pe-bar-ask" role="group" aria-label={P.resume}>
          <span>{fmt(P.draftOffer, { time: mdhm(draftOffer.at) })}{draftOffer.newer ? " " + P.draftNewer : ""}</span>
          <button type="button" className="btn small" onClick={() => takeDraft(true)}>{P.resume}</button>
          <button type="button" className="btn small ghost" onClick={() => takeDraft(false)}>{P.startSaved}</button>
        </div>
      ) : null}
      {missingN > 0 ? (
        <div className="pe-bar pe-bar-err" role="alert"><span>{P.missingLayers}</span>
          <button type="button" className="btn small ghost" onClick={() => loadAll({ quiet: true })}>{P.reload}</button></div>
      ) : null}
      {ready && confirmed && canWrite ? <p className="pe-bar" role="status">{P.confirmedRO}</p> : null}
      {ready && !canWrite && !preview && !secondTab && !versionRO ? <p className="pe-bar" role="status">{P.viewOnly}</p> : null}
      {alertMsg ? <div className="pe-bar pe-bar-err" role="alert"><span>{alertMsg}</span><button type="button" className="btn small ghost" onClick={() => setAlertMsg("")}>{P.close}</button></div> : null}
      <nav className="pe-stages" aria-label={P.stageStrip}>{strip}</nav>
      <div className="pe-opts" role="toolbar" aria-label={P.optsLabel}>{optionsBar}</div>
      <div className="pe-main">
        <div className="pe-tools" role="toolbar" aria-label={P.toolsLabel} aria-orientation="vertical">
          {tools.map((g) => (
            <div key={g.k} className="pe-tgroup" role="group" aria-label={g.k === "*" ? P.toolsLabel : g.k === "out" ? P.outsideGroup : fmt(P.stageGroup, { stage: STAGE_TEXT[g.k].name })}>
              {all && g.k !== "*" ? <span className="pe-tgroup-h" aria-hidden="true">{g.k === "out" ? "" : STAGE_TEXT[g.k].name}</span> : null}
              {g.ids.map(toolBtn)}
            </div>
          ))}
          {phone ? (
            <div className="pe-tgroup pe-tgroup-view" role="group" aria-label={P.bottomLabel}>
              <button type="button" className="pe-tool" aria-label={P.fit} title={P.fit} onClick={fitView} disabled={!ready}><Icon k="fit" /></button>
              <button type="button" className="pe-tool pe-hold" aria-label={P.holdOrig} title={P.holdOrig} aria-pressed={hold} disabled={!ready} {...holdProps}><Icon k="orig" /></button>
            </div>
          ) : null}
        </div>
        <div className="pe-vwrap">
        <div className={viewCls} ref={viewRef} role="img" aria-label={canvasLabel} tabIndex={-1}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}
          onPointerLeave={onPointerLeave} onContextMenu={(e) => e.preventDefault()}>
          {cmpMode === "side" ? (
            <div className="pe-pane pe-pane-b">
              <div className="pe-out pe-out-b" ref={outBRef}><div className="pe-stage" ref={stageBRef}><div ref={beforeHostRef} className="pe-before-host" /></div></div>
            </div>
          ) : null}
          <div className="pe-pane pe-pane-a" ref={paneRef}>
            <div className={"pe-out" + (tool === "crop" ? " is-crop" : "")} ref={outRef}>
              <div className="pe-stage" ref={stageRef}><canvas className="pe-cv" ref={cvRef} /></div>
              {(hold || cmpMode === "wipe") ? (
                <div className="pe-wipe" ref={wipeHostRef} style={hold ? undefined : { clipPath: "inset(0 " + (100 - wipe) + "% 0 0)" }}>
                  <div className="pe-stage" ref={wipeStageRef} />
                </div>
              ) : null}
              <canvas className="pe-mk" ref={mkRef} />
              <canvas className="pe-cov" ref={covRef} />
              {ready && doc ? <Overlay store={OV} api={api} os={os} tool={tool} stage={stage} cropDraft={cropDraft} measure={measure} selPin={selPin} selMark={selMark}
                cmpMode={cmpMode} wipe={wipe} viewScale={V.s} /> : null}
            </div>
            <canvas className="pe-ui" ref={uiRef} aria-hidden="true" />
            {cmpMode === "side" || cmpMode === "wipe" ? <span className="pe-cap pe-cap-a" aria-hidden="true">{T.refineAfter}</span> : null}
            {cmpMode === "wipe" ? <span className="pe-cap pe-cap-b" aria-hidden="true">{T.refineBefore}</span> : null}
          </div>
          {cmpMode === "side" ? <span className="pe-cap pe-cap-b" aria-hidden="true">{T.refineBefore}</span> : null}
        </div>
        {textEd ? <TextBox te={textEd} setTe={setTextEd} taRef={txtRef} fromOut={fromOut} os={os} scale={V.s} onCommit={commitText} onCancel={cancelText}
          offX={cmpMode === "side" && paneRef.current ? paneRef.current.offsetLeft : 0} /> : null}
        {phase !== "ready" ? (
          <div className="pe-msg" role={phase === "loading" || phase === "waitSave" ? "status" : "alert"}>
            <p>{phase === "loading" ? P.loading : phase === "waitSave" ? P.waitSave : phase === "noBase" ? P.noBase : phase === "memErr" ? P.memClose : P.baseMissing}</p>
            {phase === "baseErr" ? <button type="button" className="btn small" onClick={() => loadAll()}>{P.reload}</button> : null}
          </div>
        ) : null}
        </div>
        {!phone && !portrait ? (
          <aside className="pe-side" aria-label={P.sideLabel}>
            {ready && doc ? (
              /* review U4: the side panels are one tap away even under a long stage panel */
              <nav className="pe-jump" aria-label={P.jumpLabel}>
                {[["layers", P.secLayers + " " + ((doc.layers || []).length + 1)], ...(stage === "tone" || stage === "mark" ? [] : [["props", P.secProps]]), ["hist", P.secHistory], ["info", P.secInfo]].map(([k, t]) => (
                  <button key={k} type="button" className="pe-jump-b" translate="no" onClick={() => {
                    setOpenSec(k, true);
                    requestAnimationFrame(() => { const el = document.getElementById("pe-secw-" + k); if (el) el.scrollIntoView({ block: "start", behavior: reduceMotion() ? "auto" : "smooth" }); const b = el && el.querySelector(".pe-sec-h button"); if (b) b.focus({ preventScroll: true }); });
                  }}>{t}</button>
                ))}
              </nav>
            ) : null}
            {sideContent}
          </aside>
        ) : null}
      </div>
      {(phone || portrait) ? (
        <div className="pe-sheet" aria-label={P.sideLabel}>
          <div className="pe-sheet-head">
          <div className="pe-sheet-tabs" role="tablist" aria-label={P.sheetTabs}>
            {sheetTabs.map((k, i) => {
              const pick = (kk) => { setSheetTab(kk); const b = rootRef.current && rootRef.current.querySelector(".pe-sheet-body"); if (b) b.scrollTop = 0; };
              return (
                <div key={k} id={"pe-sheet-tab-" + k} role="tab" tabIndex={sheetTab === k ? 0 : -1} aria-selected={sheetTab === k} aria-controls="pe-sheet-panel" className="pe-sheet-tab"
                  onClick={() => pick(k)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(k); return; }
                    const j = e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? sheetTabs.length - 1 : null;
                    if (j == null) return;
                    e.preventDefault(); e.stopPropagation();
                    const kk = sheetTabs[(j + sheetTabs.length) % sheetTabs.length];
                    pick(kk);
                    requestAnimationFrame(() => { const el = document.getElementById("pe-sheet-tab-" + kk); if (el) el.focus(); });
                  }}>{sheetName[k]}</div>
              );
            })}
          </div>
          {/* review F2: the canvas keeps at least 45 % of the screen; 「패널 크게」 gives the panel the room instead */}
          <button type="button" className="pe-btn small pe-sheet-size" aria-pressed={sheetBig} aria-controls="pe-sheet-panel"
            onClick={() => { setSheetBig(!sheetBig); requestAnimationFrame(() => { if (V.fit) fitView(); }); }}>{sheetBig ? P.sheetShrink : P.sheetGrow}</button>
          </div>
          <div className="pe-sheet-body" id="pe-sheet-panel" role="tabpanel" aria-labelledby={"pe-sheet-tab-" + sheetTab}>{sheetBody}</div>
        </div>
      ) : null}
      {!phone ? <footer className="pe-bottom" aria-label={P.bottomLabel}>
        <span className="pe-zoom" translate="no" ref={zoomTxtRef} hidden={phone}>{fmt(P.zoom, { n: 100 })}</span>
        <button type="button" className="pe-btn small" onClick={fitView} disabled={!ready}>{P.fit}</button>
        {!phone ? <button type="button" className="pe-btn small" onClick={zoom100} disabled={!ready}>{P.actual}</button> : null}
        <button type="button" className="pe-btn small" hidden={phone} aria-pressed={flip} onClick={() => { setFlip(!flip); flipNow.current = !flip; requestAnimationFrame(() => (V.fit ? fitView() : applyView())); }} disabled={!ready}>{P.flipView}</button>
        <button type="button" className="pe-btn small pe-hold" aria-pressed={hold} disabled={!ready} {...holdProps}>{P.holdOrig}</button>
        {!phone ? <span className="pe-ro" translate="no">{ready && doc ? fmt(P.docSize, { w: doc.w, h: doc.h }) : ""}</span> : null}
        {!phone ? <span className="pe-ro" translate="no" ref={posTxtRef}>{"x – y –"}</span> : null}
        {!phone ? <span className="pe-ro" translate="no" ref={rgbTxtRef}>{P.infoRgb + " –"}</span> : null}
      </footer> : null}
      <div className="ax-sr" role="status" aria-live="polite">{toastMsg}</div>
      {toastMsg ? <div className="pe-toast" aria-hidden="true">{toastMsg}</div> : null}
      {keysOpen ? (
        <div className="pe-dlg" role="dialog" aria-modal="true" aria-labelledby="pe-keys-h" ref={keysDlgRef}>
          <div className="pe-dlg-box">
            <h3 id="pe-keys-h" tabIndex={-1} ref={(el) => { if (el && !el.dataset.f) { el.dataset.f = "1"; el.focus(); } }}>{P.dialogKeys}</h3>
            <table className="pe-keys"><tbody>{SHORTCUT_TEXT.map(([k, v]) => <tr key={k}><th scope="row" translate="no">{k}</th><td>{v}</td></tr>)}</tbody></table>
            <p className="pe-hint">{P.gestures}</p>
            <button type="button" className="btn small" onClick={() => setKeysOpen(false)}>{P.close}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
// Debug hook: on mount, if window.__PHX_DEBUG__ exists, call it with { doc, renderer, brush, saver, session, view, ui }.

function unionRect(a, b) {
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
}

/* 손질한 곳 보기 (§4.12): hatching per kind, never colour alone */
function drawCoverage(cv, c) {
  cv.width = c.w; cv.height = c.h;
  const ctx = cv.getContext("2d");
  const pat = (col, dir, dots) => {
    const p = document.createElement("canvas"); p.width = p.height = 8;
    const x = p.getContext("2d"); x.strokeStyle = col; x.fillStyle = col; x.lineWidth = 2;
    if (dots) { x.beginPath(); x.arc(4, 4, 1.6, 0, Math.PI * 2); x.fill(); }
    else { x.beginPath(); if (dir > 0) { x.moveTo(0, 8); x.lineTo(8, 0); } else { x.moveTo(0, 0); x.lineTo(8, 8); } x.stroke(); }
    return ctx.createPattern(p, "repeat");
  };
  const layer = (m, style) => {
    if (!m || m.length !== c.w * c.h) return;
    const t = document.createElement("canvas"); t.width = c.w; t.height = c.h;
    const tx = t.getContext("2d"); tx.fillStyle = style; tx.fillRect(0, 0, c.w, c.h);
    const id = tx.getImageData(0, 0, c.w, c.h);
    for (let i = 0; i < m.length; i++) id.data[i * 4 + 3] = m[i] > 0 ? Math.min(255, id.data[i * 4 + 3]) : 0;
    tx.putImageData(id, 0, 0);
    ctx.drawImage(t, 0, 0);
    t.width = t.height = 0;
  };
  layer(c.ai, pat("#1f5fbf", 1));
  layer(c.hand, pat("#b35400", -1));
  layer(c.trace, pat("#6a1b9a", 0, true));
  if (c.local && c.local.length === c.w * c.h) {
    let e = null;
    try { e = maskEdges(c.local, c.w, c.h); } catch (er) { e = null; }
    if (e && e.length) {
      ctx.beginPath();
      for (let i = 0; i + 3 < e.length; i += 4) { ctx.moveTo(e[i], e[i + 1]); ctx.lineTo(e[i + 2], e[i + 3]); }
      ctx.setLineDash([3, 3]); ctx.strokeStyle = "#111"; ctx.lineWidth = 1; ctx.stroke();
    }
  }
}

/* ---------- overlay (SVG in output space; its own small store so drags re-render only this) ---------- */
function Overlay({ store, api, os, tool, stage, cropDraft, measure, selPin, selMark, cmpMode, wipe, viewScale }) {
  const [, setN] = useState(0);
  useEffect(() => { const f = () => setN((n) => n + 1); store.subs.add(f); return () => store.subs.delete(f); }, []);
  const v = store.v || {};
  const d = api.doc;
  if (!d) return null;
  const k = 1 / Math.max(0.01, viewScale || 1);
  const pinPos = (p) => api.b2o((p.x / 1000) * d.w, (p.y / 1000) * d.h);
  const pins = (d.pins || []).map((p, i) => (v.pinDrag && v.pinDrag.i === i ? v.pinDrag.p : p));
  const showPins = stage === "check" || stage === "fix" || tool === "pin";
  const lines = d.lines || [];
  const showLines = stage === "check" || tool === "light";
  const cal = d.geo && d.geo.cal;
  const F = cropDraft || (tool === "crop" && api.editable ? { x: 0, y: 0, w: os.w, h: os.h } : null);
  const g = api.opts.crop.guide || 0;
  const ln = v.line;
  const selM = selMark && d.layers.find((L) => L.id === selMark && (L.k === "ov" || L.k === "txt"));
  let mb = null;
  if (selM && (tool === "move" || tool === "text") && api.rend) { try { mb = markBox(selM, os.w, os.h, api.rend.ppc ? api.rend.ppc() : null); } catch (e) { mb = null; } }
  const pinCol = ["", "#b35400", "#1f7a3f", "#1f5fbf"];
  return (
    <svg className="pe-ov" width={os.w} height={os.h} viewBox={"0 0 " + os.w + " " + os.h} aria-hidden="true" overflow="visible">
      {F ? (
        <g className="pe-crop">
          <path d={"M" + (-os.w * 4) + " " + (-os.h * 4) + "H" + os.w * 5 + "V" + os.h * 5 + "H" + (-os.w * 4) + "Z M" + F.x + " " + F.y + "V" + (F.y + F.h) + "H" + (F.x + F.w) + "V" + F.y + "Z"}
            fill="rgba(0,0,0,0.6)" fillRule="evenodd" />
          <rect x={F.x} y={F.y} width={F.w} height={F.h} fill="none" stroke="#fff" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          {g === 0 ? [1, 2].map((i) => <g key={i}><line x1={F.x + (F.w * i) / 3} y1={F.y} x2={F.x + (F.w * i) / 3} y2={F.y + F.h} stroke="#fff" strokeOpacity="0.7" vectorEffect="non-scaling-stroke" />
            <line x1={F.x} y1={F.y + (F.h * i) / 3} x2={F.x + F.w} y2={F.y + (F.h * i) / 3} stroke="#fff" strokeOpacity="0.7" vectorEffect="non-scaling-stroke" /></g>) : null}
          {g === 1 ? Array.from({ length: 7 }, (_, i) => i + 1).map((i) => <g key={i}><line x1={F.x + (F.w * i) / 8} y1={F.y} x2={F.x + (F.w * i) / 8} y2={F.y + F.h} stroke="#fff" strokeOpacity="0.5" vectorEffect="non-scaling-stroke" />
            <line x1={F.x} y1={F.y + (F.h * i) / 8} x2={F.x + F.w} y2={F.y + (F.h * i) / 8} stroke="#fff" strokeOpacity="0.5" vectorEffect="non-scaling-stroke" /></g>) : null}
          {g === 2 ? <g><line x1={F.x + F.w / 2} y1={F.y} x2={F.x + F.w / 2} y2={F.y + F.h} stroke="#fff" strokeOpacity="0.7" vectorEffect="non-scaling-stroke" />
            <line x1={F.x} y1={F.y + F.h / 2} x2={F.x + F.w} y2={F.y + F.h / 2} stroke="#fff" strokeOpacity="0.7" vectorEffect="non-scaling-stroke" />
            <rect x={F.x + F.w * 0.05} y={F.y + F.h * 0.05} width={F.w * 0.9} height={F.h * 0.9} fill="none" stroke="#fff" strokeOpacity="0.7" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" /></g> : null}
          {[[F.x, F.y], [F.x + F.w, F.y], [F.x, F.y + F.h], [F.x + F.w, F.y + F.h], [F.x + F.w / 2, F.y], [F.x + F.w / 2, F.y + F.h], [F.x, F.y + F.h / 2], [F.x + F.w, F.y + F.h / 2]].map(([x, y], i) => (
            <rect key={i} className="pe-handle" x={x - 5 * k} y={y - 5 * k} width={10 * k} height={10 * k} fill="#fff" stroke="#111" vectorEffect="non-scaling-stroke" />
          ))}
        </g>
      ) : null}
      {showLines ? lines.map((l, i) => {
        const a = api.b2o((l.a / 1000) * d.w, (l.b / 1000) * d.h), b = api.b2o((l.c / 1000) * d.w, (l.d / 1000) * d.h);
        return <g key={i}><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#ffd400" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          <circle cx={a.x} cy={a.y} r={4 * k} fill="#111" /><circle cx={b.x} cy={b.y} r={4 * k} fill="#ffd400" stroke="#111" vectorEffect="non-scaling-stroke" /></g>;
      }) : null}
      {(stage === "mark" || tool === "measure") && (measure || cal) ? (() => {
        const m = measure || cal, a = api.b2o(m.a, m.b), b = api.b2o(m.c, m.d);
        return <g><line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#00b5ff" strokeWidth="2" vectorEffect="non-scaling-stroke" />
          <circle cx={a.x} cy={a.y} r={4 * k} fill="#00b5ff" /><circle cx={b.x} cy={b.y} r={4 * k} fill="#00b5ff" /></g>;
      })() : null}
      {ln ? <line x1={ln.a.x} y1={ln.a.y} x2={ln.b.x} y2={ln.b.y} stroke={ln.kind === "light" ? "#ffd400" : ln.kind === "measure" ? "#00b5ff" : "#fff"} strokeWidth="2" strokeDasharray={ln.kind === "strline" ? "6 4" : undefined} vectorEffect="non-scaling-stroke" /> : null}
      {showPins ? pins.map((p, i) => {
        const o = pinPos(p);
        return <g key={i} className="pe-pin" data-sel={i === selPin ? "1" : ""}>
          <circle cx={o.x} cy={o.y} r={9 * k} fill={pinCol[p.k] || "#b35400"} stroke={i === selPin ? "#fff" : "#111"} strokeWidth={i === selPin ? 3 : 1.5} vectorEffect="non-scaling-stroke" />
          <text x={o.x} y={o.y + 4 * k} fontSize={11 * k} textAnchor="middle" fill="#fff" fontFamily="'IBM Plex Mono',monospace">{i + 1}</text>
        </g>;
      }) : null}
      {v.marquee ? <rect x={v.marquee.x} y={v.marquee.y} width={v.marquee.w} height={v.marquee.h} fill="rgba(31,95,191,0.12)" stroke="#1f5fbf" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" /> : null}
      {v.lasso && v.lasso.length > 1 ? <polyline points={v.lasso.map((p) => p.x + "," + p.y).join(" ")} fill="rgba(31,95,191,0.12)" stroke="#1f5fbf" strokeDasharray="4 3" vectorEffect="non-scaling-stroke" /> : null}
      {mb && mb.w > 0 ? <rect x={mb.x} y={mb.y} width={mb.w} height={mb.h} fill="none" stroke="#1f5fbf" strokeWidth="1.5" strokeDasharray="5 3" vectorEffect="non-scaling-stroke" /> : null}
      {cmpMode === "wipe" ? <line x1={(os.w * wipe) / 100} y1={0} x2={(os.w * wipe) / 100} y2={os.h} stroke="#fff" strokeWidth="2" vectorEffect="non-scaling-stroke" /> : null}
    </svg>
  );
}

/* ---------- 글자: a real textarea placed over the text box (16 px, scaled with a transform on small zooms) ---------- */
function TextBox({ te, setTe, taRef, fromOut, os, scale, onCommit, onCancel, offX = 0 }) {
  const p0 = fromOut((te.x / 1000) * os.w, (te.y / 1000) * os.h), p = { x: p0.x + offX, y: p0.y };
  const fontPx = Math.max(16, ((te.sz || 40) / 1000) * Math.min(os.w, os.h) * scale);
  return (
    <div className="pe-txt" style={{ left: p.x + "px", top: p.y + "px" }}>
      <label className="ax-sr" htmlFor="pe-txt-ta">{P.textBox}</label>
      <textarea id="pe-txt-ta" ref={taRef} value={te.s} autoFocus rows={Math.min(3, Math.max(1, String(te.s || "").split("\n").length))} maxLength={LIMITS.txtChars}
        style={{ fontSize: fontPx + "px", fontFamily: te.fn ? "'Noto Serif KR', serif" : "'Noto Sans KR', sans-serif", fontWeight: te.wt ? 700 : 500,
          textAlign: ["left", "center", "right"][te.al || 0], color: "rgb(" + (te.c || [17, 17, 17]).join(",") + ")" }}
        onChange={(e) => { const s = e.target.value.split("\n").slice(0, 3).join("\n"); setTe({ ...te, s }); }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === "Escape") { e.preventDefault(); onCancel(); return; }
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); onCommit(); return; }
          if (e.key === "Enter" && (e.nativeEvent.isComposing || String(te.s || "").split("\n").length >= 3)) { if (!e.nativeEvent.isComposing) e.preventDefault(); }
        }} />
      <div className="pe-txt-bar">
        <button type="button" className="btn small" onMouseDown={(e) => e.preventDefault()} onClick={onCommit}>{P.textDone}</button>
        <button type="button" className="btn small ghost" onMouseDown={(e) => e.preventDefault()} onClick={onCancel}>{P.cancel}</button>
      </div>
    </div>
  );
}

/* PfConfirm-like inline confirmation that moves focus to 「확인」 and disarms on Esc or blur */
function ConfirmInline({ label, ask, onConfirm, yes = T.yes, no = T.no, disabled, className = "btn small" }) {
  const [armed, setArmed] = useState(false);
  const yesRef = useRef(null);
  useEffect(() => { if (armed && yesRef.current) yesRef.current.focus(); }, [armed]);
  if (!armed) return <button type="button" className={className} disabled={disabled} onClick={() => setArmed(true)}>{label}</button>;
  return (
    <span className="pe-cfm" role="group" aria-label={ask} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setArmed(false); } }}>
      <span className="pe-cfm-q">{ask}</span>
      <button type="button" ref={yesRef} className="btn small seal" onClick={() => { setArmed(false); onConfirm && onConfirm(); }}>{yes}</button>
      <button type="button" className="btn small ghost" onClick={() => setArmed(false)}>{no}</button>
    </span>
  );
}

/* ---------- options bar (§4.3: options of the current tool + a one-line hint) ---------- */
function OptionsBar({ api, tool, opts, setOpt, adv, phone, sizeOf, armed, setArmed, fingerPaint, setFingerPaint, coarse }) {
  const o = opts[tool] || {};
  const tt = TOOL_TEXT[tool] || { name: "" };
  const set = (patch) => setOpt(tool, patch);
  const size = (min = 2, max = 400) => (
    <PeRange key="size" label={O.size} min={min} max={max} value={sizeOf(tool)} onInput={(v) => set({ size: v })} onCommit={(v) => set({ size: v })} valueText={sizeOf(tool) + "px"} num={adv} unit="px" />
  );
  const pct = (k, label, min = 0, max = 100) => (
    <PeRange key={k} label={label} min={min} max={max} value={o[k] == null ? 0 : o[k]} onInput={(v) => set({ [k]: v })} onCommit={(v) => set({ [k]: v })} valueText={(o[k] || 0) + "%"} num={adv} unit="%" />
  );
  const items = [];
  const hint = (coarse || phone) && tt.hintTouch ? tt.hintTouch : tt.hint || "";   // review U8: no Space/Enter/Alt on touch
  switch (tool) {
    case "maskBrush":
      items.push(<PeSeg key="m" label={O.kind} options={[O.maskPaint, O.maskErase]} value={o.mode || 0} onChange={(v) => set({ mode: v })} />, size(2, 400), pct("hard", O.hardness));
      break;
    case "spot": items.push(size(2, 48), pct("hard", O.hardness)); break;
    case "heal": case "clone":
      items.push(size(2, 200), pct("hard", O.hardness));
      if (tool === "clone") { items.push(pct("op", O.opacity, 1, 100)); if (adv) items.push(pct("flow", O.flow, 1, 100)); }
      items.push(<PeCheck key="al" label={O.aligned} checked={o.aligned !== 0} onChange={(v) => set({ aligned: v ? 1 : 0 })} />);
      items.push(<PeSelect key="sm" label={O.sample} value={o.sample || 0} options={[O.sampleBelow, O.sampleAll]} onChange={(v) => set({ sample: v })} />);
      if (tool === "clone") items.push(<PeSelect key="pr" label={O.pressure} value={o.press || 0} options={[O.pressSize, O.pressFlow, O.pressOff]} onChange={(v) => set({ press: v })} />);
      items.push(<button key="src" type="button" className="btn small ghost" aria-pressed={!!(armed && armed.kind === "source")} onClick={() => (armed && armed.kind === "source" ? setArmed(null) : api.armSource())}>{O.setSource}</button>);
      break;
    case "dodge":
      items.push(<PeSeg key="m" label={O.kind} options={[O.dodgeMode, O.burnMode]} value={o.mode || 0} onChange={(v) => set({ mode: v })} />);
      items.push(<PeSelect key="r" label={O.range} value={o.range == null ? 1 : o.range} options={[O.shadows, O.mids, O.highs]} onChange={(v) => set({ range: v })} />);
      items.push(pct("exposure", O.exposure, 1, 50), size(2, 400));
      items.push(<PeCheck key="pt" label={O.protect} checked={o.protect !== 0} onChange={(v) => set({ protect: v ? 1 : 0 })} />);
      break;
    case "trace": {
      items.push(<PeSelect key="p" label={O.kind} value={(o.preset || 1) - 1} options={[O.traceWear, O.traceRust, O.traceStain, O.traceScratch]}
        onChange={(v) => set({ preset: v + 1, size: v === 3 ? Math.min(8, Math.max(1, o.preset === 4 ? o.size || 4 : 4)) : o.preset === 4 ? 24 : clamp(o.size || 24, 4, 120) })} />);
      items.push(o.preset === 4 ? size(1, 8) : size(4, 120), pct("strength", O.strength, 5, 100));
      items.push(<PeSelect key="pr" label={O.pressure} value={o.press || 0} options={[O.pressSize, O.pressFlow, O.pressOff]} onChange={(v) => set({ press: v })} />);
      items.push(<PeSelect key="ce" label={O.cell} value={o.ce || 0} options={api.cellLabels || []} onChange={(v) => set({ ce: v })} />);
      const A = api.doc && api.doc.layers.find((L) => L.k === "tr");
      const cov = A && api.eng.meter && api.eng.meter[A.id];
      items.push(<span key="mt" className="pe-meter" translate="no">{fmt(O.traceMeter, { area: fmtArea(cov || (A && A.cov) || 0) })}</span>);
      break;
    }
    case "sponge":
      items.push(<PeSeg key="m" label={O.kind} options={[O.spongeDown, O.spongeUp]} value={o.mode || 0} onChange={(v) => set({ mode: v })} />, pct("flow", O.flow, 1, 100), size(2, 400));
      items.push(<PeCheck key="vb" label={O.vibranceOpt} checked={o.vib !== 0} onChange={(v) => set({ vib: v ? 1 : 0 })} />);
      break;
    case "blurB": case "sharpB": items.push(size(2, 400), pct("strength", O.strength, 1, 100)); break;
    case "erase": items.push(size(2, 400), pct("hard", O.hardness)); break;
    case "selRect": case "selLasso": case "selWand":
      items.push(<PeSeg key="m" label={O.kind} options={[O.selNew, O.selAdd, O.selSub, O.selAnd]} value={o.mode || 0} base={0} clearable={false} onChange={(v) => set({ mode: v })} />);
      if (tool === "selWand") {
        items.push(<PeRange key="t" label={O.tolerance} min={0} max={100} value={o.tol == null ? 24 : o.tol} onInput={(v) => set({ tol: v })} onCommit={(v) => set({ tol: v })} valueText={String(o.tol)} num={adv} />);
        items.push(<PeCheck key="c" label={O.contiguous} checked={o.contig !== 0} onChange={(v) => set({ contig: v ? 1 : 0 })} />);
        items.push(<PeCheck key="a" label={O.allLayers} checked={o.all !== 0} onChange={(v) => set({ all: v ? 1 : 0 })} />);
      } else items.push(<PeRange key="f" label={O.feather} min={0} max={50} value={o.feather || 0} onInput={(v) => set({ feather: v })} onCommit={(v) => set({ feather: v })} valueText={(o.feather || 0) + "px"} num={adv} unit="px" />);
      break;
    case "crop":
      items.push(<PeSelect key="r" label={O.ratio} value={o.ratio || 0} options={[O.ratioOrig, "1:1", "4:5", "3:4", "2:3", "3:2", O.ratioA4, O.ratioFree]} onChange={(v) => set({ ratio: v })} />);
      items.push(<PeSelect key="g" label={O.guides} value={o.guide || 0} options={[O.guideThirds, O.guideGrid, O.guideCenter, O.guideNone]} onChange={(v) => set({ guide: v })} />);
      items.push(<PeCheck key="e" label={O.extend} checked={!!o.extend} onChange={(v) => set({ extend: v ? 1 : 0 })} />);
      if (api.cropDraft) {
        items.push(<button key="ok" type="button" className="btn small" onClick={api.commitCrop}>{P.applyKey}</button>);
        items.push(<button key="no" type="button" className="btn small ghost" onClick={api.cancelCrop}>{P.cancelKey}</button>);
        const F = api.cropDraft;
        items.push(<span key="sz" className="pe-meter" translate="no">{fmt(P.cropSize, { w: Math.round(F.w), h: Math.round(F.h) })}</span>);
      }
      break;
    case "straighten": items.push(<span key="h" className="pe-hint">{P.lineHint}</span>); break;
    case "eyedrop": items.push(<PeSelect key="s" label={O.sampleSize} value={o.sample == null ? 2 : o.sample} options={[O.sample1, O.sample3, O.sample5]} onChange={(v) => set({ sample: v })} />); break;
    case "zoom":
      items.push(<PeSeg key="z" label={O.kind} options={[P.zoomIn, P.zoomOutCmd]} value={o.out ? 1 : 0} base={0} clearable={false} onChange={(v) => set({ out: v })} />);
      break;
    case "pin":
      items.push(<PeSelect key="k" label={O.pinKind} value={(o.kind || 1) - 1} options={[O.pinTrace, O.pinKeep, O.pinFix]} onChange={(v) => set({ kind: v + 1 })} />);
      items.push(<PeSelect key="i" label={O.pinItem} value={o.it || 0} options={api.itemLabels || []} onChange={(v) => set({ it: v })} />);
      items.push(<PeSelect key="c" label={O.pinCell} value={o.ce || 0} options={api.cellLabels || []} onChange={(v) => set({ ce: v })} />);
      break;
    case "text":
      items.push(<PeSelect key="f" label={O.font} value={o.fn || 0} options={[O.gothic, O.serif]} onChange={(v) => set({ fn: v })} />);
      items.push(<PeSelect key="c" label={O.color} value={o.color || 0} options={[O.black, O.white]} onChange={(v) => set({ color: v })} />);
      items.push(<PeSelect key="w" label={O.weight} value={o.wt || 0} options={[O.normal, O.bold]} onChange={(v) => set({ wt: v })} />);
      items.push(<PeSelect key="a" label={O.align} value={o.al || 0} options={[O.alignLeft, O.alignCenter, O.alignRight]} onChange={(v) => set({ al: v })} />);
      break;
    default:
  }
  if (coarse && TOOLS[tool] && TOOLS[tool].kind === "brush") items.push(<PeCheck key="fp" label={P.fingerPaint} checked={!!fingerPaint} onChange={setFingerPaint} />);
  if (armed && armed.kind === "grey") items.push(<span key="arm" className="pe-arm" role="status">{P.gpArm}</span>);
  if (armed && armed.kind === "source") items.push(<span key="arm" className="pe-arm" role="status">{P.sourceArm}</span>);
  return (
    <div className="pe-opts-in">
      <strong className="pe-opts-name">{tt.name}</strong>
      {items}
      {hint ? <span className="pe-hint pe-opts-hint">{hint}</span> : null}
      {/* gate N3: the 흔적 그리기 caution is required in the options bar (spec §4.7); phones hide the other hints, not this one */}
      {hint && tool === "trace" ? <span className="pe-hint pe-opts-must">{hint}</span> : null}
    </div>
  );
}

export const PE_CSS = `
.pe.pe-full{position:fixed;inset:0;z-index:5000;height:calc(100vh / var(--ax-zoom,1));height:calc(100dvh / var(--ax-zoom,1));
  padding:env(safe-area-inset-top,0) env(safe-area-inset-right,0) env(safe-area-inset-bottom,0) env(safe-area-inset-left,0);
  font-family:var(--sans);font-size:15px;line-height:1.6;color:var(--ink,#111);background:#fff;overflow:hidden;overflow:clip;display:flex;flex-direction:column;box-sizing:border-box;text-align:left}
html[data-ax-cap] .pe.pe-full{bottom:var(--ax-cap-h,0px);height:auto}
html:has(.pe-full) .ax-float, html:has(.pe-full) .paste-ask{z-index:5010}
html[data-ax-float] .pe-full .pe-bottom{padding-right:72px}
html[data-ax-contrast="dark"] .pe-out{filter:invert(1) hue-rotate(180deg)}
html[data-ax-contrast="dark"] .pe-out :is(img,canvas,svg image,.ax-keep){filter:none}
.ws-lockset:disabled .pe-view{pointer-events:none;cursor:not-allowed}
html[data-ax-targets] .pe .pe-h{min-height:0}
.pe-view{touch-action:none}
.pe :is(.pe-view,.pe-tools,.pe-strip,.pe-opts,.pe-curves,.pe-levels,.pe-cmp,.pe-handle,.pe-layer-row,.pe-hist,.pe-range){
  user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
.pe *{box-sizing:border-box}
.pe [hidden]{display:none!important}
.pe :focus-visible{outline:3px solid #1f5fbf;outline-offset:2px}
.pe [tabindex="-1"]:focus:not(:focus-visible){outline:none}
.pe-top{display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid #ddd;min-height:48px;flex:0 0 auto;flex-wrap:wrap}
.pe-top h2{font-size:16px;margin:0;font-weight:700;white-space:nowrap}
.pe-actions{display:flex;align-items:center;gap:6px;margin-left:auto;flex-wrap:wrap;justify-content:flex-end}
.pe-btn{white-space:nowrap;font:inherit;font-size:13px;line-height:1.2;padding:6px 10px;border:1px solid #767676;border-radius:6px;background:#fff;color:#111;cursor:pointer;min-height:34px;display:inline-flex;align-items:center;gap:4px}
.pe-btn[aria-pressed="true"]{background:#111;color:#fff;border-color:#111}
.pe-btn:disabled{opacity:.45;cursor:not-allowed}
.pe-btn.small{padding:3px 8px;min-height:28px;font-size:12px}
.pe-save{background:#111;color:#fff;border-color:#111}
.pe-pill{font-size:12px;padding:2px 8px;border:1px solid #767676;border-radius:999px;white-space:nowrap;max-width:260px;overflow:hidden;text-overflow:ellipsis}
.pe-pill[data-err="1"]{border-color:#B5382A;color:#B5382A}
.pe-badge{font-size:12px;padding:2px 8px;border:1px dashed #767676;border-radius:999px}
.pe-bar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:6px 12px;margin:0;font-size:13px;background:#f6f6f6;border-bottom:1px solid #ddd}
.pe-bar-ask{background:#F8ECEA;border-bottom-color:#B5382A}
.pe-bar-err{background:#F8ECEA;border-bottom-color:#B5382A;color:#8e1b10}
.pe-stages{flex:0 0 auto;border-bottom:1px solid #ddd;padding:4px 8px}
.pe-strip{list-style:none;margin:0;padding:0;display:flex;gap:4px;overflow-x:auto;overscroll-behavior-x:contain;align-items:stretch;scrollbar-width:thin}
.pe-strip>li{flex:0 0 auto;display:flex}
.pe-stab{display:flex;align-items:center;gap:4px;padding:5px 10px;border:1px solid #c8c8c8;border-radius:6px;cursor:pointer;font-size:14px;white-space:nowrap;background:#fff}
.pe-stab[aria-selected="true"]{border-color:#111;background:#111;color:#fff;font-weight:700}
.pe-stab-hid{border-style:dashed;color:#5f5f5f}
.pe-stab-g{font-size:12px;min-width:.7em;text-align:center}
.pe-stab-cnt{font-size:11px;font-weight:700;padding:0 5px;border:1px solid currentColor;border-radius:999px}
.pe-stab-todo{border-color:#111;border-width:2px}
.pe-stab-skip .pe-stab-n{text-decoration:line-through}
.pe-strip-div{width:1px;background:#767676;margin:2px 4px;flex:0 0 1px}
.pe-opts{flex:0 0 auto;min-height:40px;border-bottom:1px solid #ddd;padding:4px 10px;overflow-x:auto;overscroll-behavior-x:contain}
.pe-opts-in{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:13px}
.pe-opts-name{font-size:13px;white-space:nowrap}
.pe-hint{font-size:12px;color:#6e6e6e}
.pe-meter,.pe-arm{font-size:12px;padding:2px 2px;border:0;border-bottom:1px dashed #767676;border-radius:0;white-space:nowrap}
.pe-arm{border-color:#1f5fbf;color:#1f5fbf}
.pe-main{flex:1 1 auto;min-height:0;display:grid;grid-template-columns:52px minmax(0,1fr) clamp(280px,24vw,340px);overflow:hidden;overflow:clip}
.pe-tools{border-right:1px solid #ddd;overflow-y:auto;overscroll-behavior:contain;padding:4px 2px;display:flex;flex-direction:column;gap:2px;align-items:center}
.pe-tgroup{display:flex;flex-direction:column;gap:2px;align-items:center;padding-bottom:4px;border-bottom:1px solid #ebebeb;width:100%}
.pe-tgroup:last-child{border-bottom:0}
.pe-tgroup-h{font-size:11px;font-weight:700;color:#6e6e6e;text-align:center;line-height:1.2;padding:2px 0;word-break:keep-all}
.pe-tool{width:44px;height:44px;display:flex;align-items:center;justify-content:center;border:1px solid transparent;border-radius:6px;background:#fff;color:#111;cursor:pointer;padding:0}
.pe-tool:hover{border-color:#c8c8c8}
.pe-tool[aria-pressed="true"]{background:#111;color:#fff;border-color:#111}
.pe-tool:disabled{opacity:.45}
.pe-vwrap{position:relative;min-width:0;min-height:0;overflow:hidden;overflow:clip}
.pe-view{position:absolute;inset:0;overflow:hidden;overflow:clip;background:#e9e9e6;outline:none;cursor:default}
.pe-view.tool-hand,.pe-view[data-space="1"]{cursor:grab}
.pe-view[data-panning="1"]{cursor:grabbing}
.pe-view:is(.tool-crop,.tool-selRect,.tool-selLasso,.tool-selWand,.tool-measure,.tool-light,.tool-straighten,.tool-pin,.tool-eyedrop){cursor:crosshair}
.pe-view.tool-zoom{cursor:zoom-in}
.pe-view.is-armed{cursor:crosshair}
.pe-view.tool-text{cursor:text}
.pe-pane{position:absolute;inset:0;overflow:hidden;overflow:clip}
.pe-view.is-side .pe-pane-a{left:50%}
.pe-view.is-side .pe-pane-b{right:50%;border-right:2px solid #fff}
.pe-out{position:absolute;left:0;top:0;transform-origin:0 0;overflow:hidden;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.25)}
.pe-out.is-crop{overflow:visible;background:transparent}
.pe-out[data-px="1"] canvas{image-rendering:pixelated}
.pe-stage{position:absolute;left:0;top:0;transform-origin:0 0}
.pe-cv,.pe-before-cv{position:absolute;left:0;top:0;display:block}
.pe-wipe{position:absolute;left:0;top:0;overflow:hidden;pointer-events:none}
.pe-mk,.pe-cov{position:absolute;left:0;top:0;pointer-events:none}
.pe-ov{position:absolute;left:0;top:0;pointer-events:none;overflow:visible}
.pe-ui{position:absolute;left:0;top:0;pointer-events:none}
.pe-cap{position:absolute;top:8px;font-size:12px;background:rgba(255,255,255,.9);padding:1px 6px;border-radius:4px;pointer-events:none}
.pe-cap-a{right:8px}.pe-cap-b{left:8px}
.pe-msg{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:16px;text-align:center;background:#f6f6f6}
.pe-txt{position:absolute;transform:translate(-50%,-50%);display:flex;flex-direction:column;gap:4px;align-items:center;z-index:3}
.pe-txt textarea{background:rgba(255,255,255,.75);border:1px dashed #1f5fbf;resize:none;line-height:1.25;padding:2px 4px;min-width:160px;max-width:min(80vw,640px);font-size:16px}
.pe-txt-bar{display:flex;gap:4px}
.pe-side{border-left:1px solid #ddd;overflow-y:auto;overscroll-behavior:contain;min-width:0;background:#fff;scroll-padding-bottom:140px}
.pe-sheet-body{scroll-padding-bottom:140px}
.pe-sec{border-bottom:1px solid #ddd;scroll-margin-top:44px}
.pe-jump{position:sticky;top:0;z-index:2;display:flex;flex-wrap:wrap;gap:4px;padding:4px 8px;background:#fff;border-bottom:1px solid #ddd}
.pe-jump-b{font:inherit;font-size:12px;padding:3px 8px;border:1px solid #767676;border-radius:999px;background:#fff;color:#111;cursor:pointer;min-height:28px}
.pe-sec-h{margin:0;font-size:14px}
.pe-sec-h button{all:unset;box-sizing:border-box;display:flex;width:100%;padding:8px 12px;cursor:pointer;font-weight:700;font-size:14px}
.pe-sec-h button::before{content:"▸";margin-right:6px;font-size:11px}
.pe-sec-h button[aria-expanded="true"]::before{content:"▾"}
.pe-sec-h button:focus-visible{outline:3px solid #1f5fbf;outline-offset:-3px}
.pe-sec-b{padding:4px 12px 12px}
.pe-sec-process>.pe-sec-b{padding-top:8px}
.pe-bottom{flex:0 0 auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-height:32px;padding:3px 10px;border-top:1px solid #ddd;font-size:12px}
.pe-zoom,.pe-ro{font-family:var(--mono,'IBM Plex Mono',monospace);font-size:12px;white-space:nowrap;color:#333}
.pe-ro{font-family:var(--sans)}
.pe-toast{position:absolute;left:50%;bottom:52px;transform:translateX(-50%);background:#111;color:#fff;padding:6px 12px;border-radius:6px;font-size:13px;z-index:6;max-width:min(90vw,560px);pointer-events:none}
.pe-dlg{position:absolute;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:8;padding:16px}
.pe-dlg-box{background:#fff;border-radius:8px;padding:16px;max-height:90%;overflow:auto;max-width:560px;width:100%}
.pe-dlg-box h3{margin:0 0 8px;font-size:16px}
.pe-keys{border-collapse:collapse;font-size:13px;width:100%;margin-bottom:8px}
.pe-keys th{text-align:left;padding:3px 10px 3px 0;white-space:nowrap;font-weight:700}
.pe-keys td{padding:3px 0}
.pe-cfm{display:inline-flex;flex-wrap:wrap;align-items:center;gap:6px;padding:4px 8px;border:1px solid #B5382A;background:#F8ECEA;border-radius:6px}
.pe-cfm-q{font-size:13px}
.pe-sheet{flex:0 0 42%;min-height:0;display:flex;flex-direction:column;border-top:1px solid #767676;background:#fff}
.pe-sheet-tabs{display:flex;gap:2px;overflow-x:auto;border-bottom:1px solid #ddd;padding:2px 6px;flex:0 0 auto}
.pe-sheet-tab{padding:6px 10px;font-size:14px;cursor:pointer;border-bottom:3px solid transparent;white-space:nowrap}
.pe-sheet-tab[aria-selected="true"]{border-bottom-color:#111;font-weight:700}
.pe-sheet-body{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain}
.pe-portrait .pe-main{grid-template-columns:48px minmax(0,1fr)}
.pe-all:not(.pe-phone) .pe-main{grid-template-columns:100px minmax(0,1fr) clamp(280px,24vw,340px)}
.pe-all.pe-portrait .pe-main{grid-template-columns:100px minmax(0,1fr)}
.pe-all:not(.pe-phone) .pe-tgroup{flex-direction:row;flex-wrap:wrap;justify-content:center}
.pe-all:not(.pe-phone) .pe-tgroup-h{width:100%}
.pe-portrait .pe-opts-in{flex-wrap:nowrap}
.pe-portrait .pe-opts-in>*{flex:0 0 auto}
.pe-portrait .pe-opts-in>.pe-opts-hint{flex:0 1 auto;min-width:14em}
.pe-opts-in :is(label,strong){white-space:nowrap}
.pe-coarse .pe-tool{width:46px;height:46px}
@media (min-width:1024px){.pe-coarse:not(.pe-portrait):not(.pe-phone) .pe-main{grid-template-columns:52px minmax(0,1fr) 300px}}
.pe-phone .pe-main{grid-template-columns:minmax(0,1fr);grid-template-rows:auto minmax(0,1fr);flex:1 1 0;min-height:calc(45% + 52px)}
.pe-phone .pe-tools{flex-direction:row;overflow-x:auto;overflow-y:hidden;border-right:0;border-bottom:1px solid #ddd;padding:2px 4px;align-items:center;min-height:52px}
.pe-phone .pe-tgroup{flex-direction:row;width:auto;border-bottom:0;border-right:1px solid #ebebeb;padding:0 4px;flex:0 0 auto}
.pe-phone .pe-tool{width:44px;height:44px;flex:0 0 auto}
.pe-phone .pe-opts{padding:2px 8px;min-height:0}
.pe-phone .pe-opts-in{flex-wrap:nowrap}
.pe-phone .pe-opts-in>*{flex:0 0 auto}
.pe-phone .pe-opts-in :is(label,span,strong,select){white-space:nowrap}
.pe-phone .pe-opts-hint{display:none}
.pe-opts-must{display:none}
.pe-phone .pe-opts-in:has(.pe-opts-must){flex-wrap:wrap;row-gap:0}
.pe-phone .pe-opts-must{display:block;flex:1 0 100%;order:-1;white-space:normal;font-size:12px;line-height:1.35}
.pe-phone .pe-stages{padding:2px 6px}
.pe-phone .pe-top{padding:4px 8px;gap:6px}
.pe-phone .pe-btn-l{display:none}
.pe-phone .pe-actions .pe-pill{display:none}
.pe-phone .pe-top h2{font-size:15px}
.pe-phone .pe-badge{font-size:11px;padding:1px 6px}
.pe-phone .pe-actions{gap:4px;flex-wrap:nowrap}
.pe-phone .pe-bottom{flex-wrap:nowrap;overflow-x:auto;overscroll-behavior-x:contain}
.pe-pill-b{display:none}
.pe-phone .pe-pill-b{display:inline-block;max-width:150px;flex:0 1 auto;white-space:normal;overflow:visible;text-overflow:clip;line-height:1.25;border-radius:10px;word-break:keep-all}
.pe-phone .pe-top h2{position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.pe-phone .pe-tgroup-view{border-right:0;margin-left:auto}
.pe-phone .pe-sheet{min-height:50px}
html[data-ax-float] .pe-phone .pe-sheet-body{padding-bottom:72px}
.pe-phone .pe-sheet,.pe-portrait .pe-sheet{flex:1 1 0;min-height:0}
.pe-portrait .pe-main{flex:1 1 0;min-height:45%}
.pe-sheet-head{display:flex;align-items:center;gap:4px;flex:0 0 auto;border-bottom:1px solid #ddd;padding-right:6px}
.pe-sheet-head .pe-sheet-tabs{flex:1 1 auto;min-width:0;border-bottom:0}
.pe-sheet-size{flex:0 0 auto;white-space:nowrap}
.pe-phone.pe-sheet-big .pe-main{min-height:calc(160px + 52px)}
.pe-portrait.pe-sheet-big .pe-main{min-height:30%}
.pe-sheet-big .pe-sheet{flex:0 0 60%}
.pe.pe-phone :is(textarea,select,input:not([type=range]):not([type=checkbox])),.pe.pe-coarse :is(textarea,select,input:not([type=range]):not([type=checkbox])){font-size:16px}
.pe-btn-l{font-size:13px}
@media (pointer:coarse){.pe textarea,.pe input:not([type=range]):not([type=checkbox]),.pe select{font-size:16px}.pe-btn{min-height:40px}}
.pe.pe-coarse :is(.pe-btn,.pe-btn.small,.pe-stab,.pe-sheet-tab,.pe-seg button,.pe-hrow,.pe-jump-b,.pe-link){min-height:44px}
.pe.pe-coarse .pe-eye{width:44px;height:44px}
.pe.pe-coarse .pe-sheet-tab{display:flex;align-items:center}
.pe.pe-coarse .pe-link{display:inline-flex;align-items:center}
@media (max-width:1180px){.pe-btn-l{display:none}}
`;
