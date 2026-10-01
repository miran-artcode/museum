/* ============================================================
   생성과 다듬기 포트폴리오 카드(6차시 s6f): 학생 카드 FolioPad, 교사 열람 FolioRead, 오류 경계, 앱 관문
   (spec §3, §5.4 src-portfolio.jsx, §6.3, §6.11, §7.6, §8)
   · src-app.jsx를 import하지 않는다(순환). 저장소·미디어 도구·점검 항목은 FolioField 감싸개(A6)가 props로 넘긴다.
   · Firebase는 "./src-fb.js"(authApi만)로만 가져온다. 하네스가 이 경로를 대역으로 바꾼다.
   · 화면 문구는 src-portfolio-text.mjs(T와 표)에서 가져오고, 깃발은 feat()로만 읽는다.
   · 자료 판단은 모두 src-portfolio-core.mjs의 순수 함수가 한다. 이 파일은 화면과 저장 순서(§6.3)만 맡는다:
     최신 ws(wsRef)에서 다음 값을 계산해 clean·assertSafe·capsCheck를 React 밖에서 먼저 보고, 그 뒤에 totalUpd로 감싼
     같은 갱신을 setField에 넘긴다. 갱신 함수 안에서는 아무것도 결정하지 않는다.
   ============================================================ */
import React, { useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { authApi } from "./src-fb.js";
import { WsLockCtx, WsSavedCtx } from "./src-ws-lock.jsx";
import { prepareImage, imgErrText, imgHintText } from "./src-media-img.js";
import {
  KEYS, ROUNDS, LINES, CP, PROMPT_POOL, ROUND_CAP, REFLECT_CAP, NOTE_CAP, LIMITS, STAGES, STAGE_NOTE, STAGE_FEAT, ITEMS, KP,
  METHOD, THUMB, SEND, PRESETS, TI_ROUND, EV, KINDS, OPS, ROUTE, ROUTE_ITEM, feat, graceMs, stamp36, mkRef,
} from "./src-folio-schema.mjs";
import {
  T, fmt, ROUND_LABEL, LINE_LABEL, LINE_MARK, CHECK_LABEL, CAUSE_LABEL, PW_LABEL, NR_LABEL, NL_LABEL, HM_LABEL, UK_LABEL, RM_LABEL,
  METHOD_LABEL, CELL_LABEL, NOTE_LABEL, KIND_LABEL, OP_TEXT, MISMATCH, HELP, STAGE_TEXT, SEND_KEY_LABEL, FLAG_LEVEL, LEVEL_LABEL, WPP_LABEL, TI_LABEL,
  CORE_TEXT, imgPreset, countWord, josa,
} from "./src-portfolio-text.mjs";
import {
  normSteps, normNotes, normEdit, normTrash, migrate, clean, assertSafe, totalUpd, capsCheck, utf8Len,
  effRound, seedFor, startRound, setRoundText, setPromptLine, pastePrompt, setRoundCode, addImage, replaceImage, removeImage,
  setThumb, chooseImage, setSkip, setReflect, bumpHelp, changedLines, roundState, reflectDone, baseChoice, indicators,
  setNote, defaultImportMap, importPlan, importRound, routedStages, summarize, opLines, buildPhrases, effPhrase, phraseGaps,
  finalizeCheck, flags, sendPlan, fmtArea, confirmEdit, releaseEdit, markSent, rebaseEdit, refsIn, liveRefs, trashRefs, addTrash,
  dropTrash, gcPlan, imgSendValue,
} from "./src-portfolio-core.mjs";
import { Status, PfNav, PfViewer, PfConfirm, Seg, NoteField, PfImg, CompareView, ProcessSlides, loadMedia, primeMedia, clearMedia, useAutoGrow, FOLIO_UI_CSS } from "./src-folio-ui.jsx";
import { drafts, currentSid, getSaver, devId, watchAuthForDrafts, putMedia, encodeThumb, encodeImage, decodeImage, mediaCache, removeMedia, latePut } from "./src-photo-io.mjs";
import { dHash, hamming } from "./src-photo-px.mjs";
import { PhotoEditor, PE_CSS } from "./src-photo.jsx";
import { PE_PANELS_CSS } from "./src-photo-panels.jsx";

export { folioProgress, folioUnits } from "./src-portfolio-core.mjs";

/* ---------- 앱 관문 (§6.11) ---------- */
// current:  the open editor has changes the draft has not captured yet (cleared by each draft write)
// unsaved:  the Saver holds changes not confirmed on the server (dirty doc, plan in progress, or a write being confirmed)
// draft:    an IndexedDB draft with unsaved work or a kept plan exists for this student; survives FolioPad's unmount
// uploading: card or editor uploads in flight; flush: registered by the open editor (save now) or by the card (wait for uploads)
export const folioDirty = { current: false, unsaved: false, draft: false, uploading: 0, flush: null };

/** @returns {Promise<boolean>} true = navigation may continue (§6.11) */
export async function folioGate({ leaving = false } = {}) {
  // 초안이 남았는지는 IndexedDB에서 다시 읽는다: 기억해 둔 값은 저장기가 초안을 지운 뒤에도 남아 있을 수 있다 (검토 B1)
  const fresh = async () => { if (!leaving) return; try { folioDirty.draft = !!(await drafts.hasUnsaved(currentSid())); } catch (e) { /* keep */ } };
  await fresh();
  const busy = () => folioDirty.uploading > 0 || (leaving ? (folioDirty.unsaved || folioDirty.draft) : (folioDirty.unsaved && !!folioDirty.flush));
  if (folioDirty.flush && busy()) { await Promise.race([folioDirty.flush(), new Promise((r) => setTimeout(r, leaving ? 12000 : 8000))]); await fresh(); }
  if (!busy()) return true;
  return window.confirm(leaving ? T.gateLeave : T.gateMove);   // same mechanism as sketchGate
}

/* 모듈을 처음 읽을 때 한 번: 로그아웃하면 이 기기의 초안을 모두 지우고, 다른 학생으로 들어오면 그 학생 것만 남긴다 (§6.8) */
watchAuthForDrafts(authApi);
/* 로그아웃하면 카드가 기억해 둔 이미지도 비운다(공용 컴퓨터) */
try { authApi.watch((u) => { if (!u) clearMedia(); }); } catch (e) { /* ignore */ }

/* ---------- 오류 경계 ---------- */
/** Error boundary (class component): on error shows T.cardFail, asks the Saver to write its draft, logs the error once,
 *  and renders nothing else; the rest of the worksheet keeps running. */
export class FolioBoundary extends React.Component {
  constructor(props) { super(props); this.state = { err: null }; this.logged = false; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err) {
    if (this.logged) return;
    this.logged = true;
    try { const s = this.props.owner && this.props.owner !== "preview" ? getSaver({ owner: this.props.owner }) : null; if (s) s.writeDraftNow("error"); } catch (e) { /* ignore */ }
    try { console.warn("[folio] card error", err); } catch (e) { /* ignore */ }
  }
  render() {
    if (this.state.err) return <p className="pf-fail warn-note span2" role="alert">{T.cardFail}</p>;
    return this.props.children;
  }
}

const throwIn = (name) => { const t = globalThis.__PHX_TEST__; if (t && t.throwIn === name) throw new Error("__PHX_TEST__.throwIn " + name); };

/* ---------- 작은 도우미 ---------- */
/** remember a data URL this device just uploaded, in the card's cache and in C's mediaCache (IO2) */
const prime = (owner, ref, data) => { primeMedia(owner, ref, data); try { mediaCache.set(owner, ref, data); } catch (e) { /* ignore */ } };
const nowS = () => Math.floor(Date.now() / 1000);
const filled = (s) => typeof s === "string" && s.trim().length > 0;
const usedB = (s) => utf8Len(JSON.stringify(String(s || ""))) - 2;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** harness hook (as C's IO11): __PHX_TEST__.putTimeoutMs shortens the upload timeout of card uploads */
const testTimeout = () => { const t = globalThis.__PHX_TEST__; return (t && t.putTimeoutMs) || undefined; };
const roundNo = (r) => ROUNDS.indexOf(r) + 1;
const thumbOf = (img) => (img ? (img.th && img.th.ref) || img.ref : null);
const ZERO_SG = "0000000000000000";
const S6A_KEYS = ["s6a.regen", "s6a.partial", "s6a.edit", "s6a.diff", "s6a.beforeImg", "s6a.afterImg"];
const selIndex = (selNo) => { const m = String(selNo == null ? "" : selNo).match(/\d+/); return m ? parseInt(m[0], 10) - 1 : -1; };
const s5rounds = (ws) => (Array.isArray(ws["s5b.rounds"]) ? ws["s5b.rounds"] : []);
const hasRef = (v) => !!(v && typeof v === "object" && typeof v.ref === "string" && v.ref);
const msTime = (ms, fmtTime) => (ms > 0 && fmtTime ? fmtTime(new Date(ms).toISOString()) : "");
const mmss = (s) => Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
const prevRoundOf = (steps, r) => {
  if (r === "rb") return "ra";
  if (r === "rc") return roundState(steps, "rb") === "skip" ? "ra" : "rb";
  return null;
};

/** 16-hex dHash of a 9×8 grey downsample (two-step canvas reduction); the all-zero value means "unknown" */
function sigOf(img) {
  try {
    const a = document.createElement("canvas"); a.width = 72; a.height = 64;
    const ax = a.getContext("2d"); ax.imageSmoothingEnabled = true; ax.imageSmoothingQuality = "high"; ax.drawImage(img, 0, 0, 72, 64);
    const b = document.createElement("canvas"); b.width = 9; b.height = 8;
    const bx = b.getContext("2d"); bx.imageSmoothingEnabled = true; bx.imageSmoothingQuality = "high"; bx.drawImage(a, 0, 0, 9, 8);
    const s = dHash(bx.getImageData(0, 0, 9, 8).data, 9, 8);
    return typeof s === "string" && /^[0-9a-f]{16}$/i.test(s) ? s.toLowerCase() : ZERO_SG;
  } catch (e) { return ZERO_SG; }
}
/** image data URL → re-encoded within maxPx / maxChars through C's encodeImage → { data, w, h } */
async function reencode(data, maxPx, maxChars) {
  const img = await decodeImage(data);
  const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
  const k = Math.min(1, maxPx / Math.max(w0, h0, 1));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k));
  const x = c.getContext("2d"); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high"; x.drawImage(img, 0, 0, c.width, c.height);
  return encodeImage(c, { maxChars, maxPx });
}

/* ---------- 쓰기 (§6.3): 최신 ws에서 미리 검사하고, 같은 갱신을 totalUpd로 감싸 넘긴다 ---------- */
function makeWrite(wsRef, setFieldRef) {
  return (key, upd, opts) => {
    const ws = wsRef.current || {};
    let next;
    try { next = upd(ws[key]); } catch (e) { return { ok: false, err: "ws" }; }
    if (next === ws[key]) return { ok: true, same: true };
    try { next = clean(next); } catch (e) { return { ok: false, err: "ws" }; }
    if (next === undefined || assertSafe(next) !== "") return { ok: false, err: "ws" };
    if (capsCheck(ws, key, next)) return { ok: false, err: "size" };
    const sf = setFieldRef.current;
    if (typeof sf !== "function") return { ok: false, err: "ws" };
    const ok = sf(key, totalUpd((cur) => { const n = upd(cur); return n === cur ? cur : clean(n); }), opts);
    return ok === false ? { ok: false, err: "ws" } : { ok: true };
  };
}

/* ---------- 쓰기 확인 (§6.3 rule 3): 학생별로 모듈에 둔다(카드가 잠깐 사라져도 다음에 이어서 확인) ---------- */
const expects = new Map();     // owner → [{ key, refs, superseded, seq, onDone, onMissing }]
const editorOpen = new Set();  // owners whose editor overlay is open in this tab
const confirmed = new Set();   // owners for whom this device has confirmed a folio write (GC may run)

/* 저장 상태 지켜보기 (검토 B1, B2)
   저장기는 상태 알림(onState)을 하나만 받고 편집기가 그것을 쓴다. 그래서 카드는 일이 남아 있는 동안(저장기가 일하거나 확인 중,
   카드가 올리는 중, 편집기가 열림, 저장기가 아는 초안이 있음) 짧은 간격으로 다시 확인하고, 달라졌을 때만 구독한 카드에 알린다.
   IndexedDB 초안이 남았는지는 여기서 정하고 folioDirty.draft(앱 관문, beforeunload)도 여기서 맞춘다. */
const saverWatch = { owner: "", saver: null, timer: 0, running: false, again: false, sig: "", until: 0, subs: new Set() };
const WATCH_MS = 500, WATCH_TAIL_MS = 3000;
/** → { draft, busy, pending, phase, known, up } */
function saverSnap(draft) {
  const s = saverWatch.saver;
  let busy = false, pending = false, phase = "", known = false;
  try { busy = !!(s && s.busy); pending = !!(s && s.pending); phase = (s && s.state && s.state.phase) || ""; known = !!(s && s.hasDraft); } catch (e) { /* keep */ }
  return { draft: !!draft, busy, pending, phase, known, up: folioDirty.uploading > 0 };
}
/** check now; keeps checking every WATCH_MS while anything is outstanding, and for WATCH_TAIL_MS after it settles */
function pokeSaverWatch(owner, saver) {
  if (globalThis.__PHX_TEST__) globalThis.__folioDirty = folioDirty;   // harness hook: the leave-gate flags
  if (owner && owner !== saverWatch.owner) { saverWatch.owner = owner; saverWatch.sig = ""; }
  if (saver) saverWatch.saver = saver;
  if (!saverWatch.owner) return;
  if (saverWatch.running) { saverWatch.again = true; return; }
  clearTimeout(saverWatch.timer); saverWatch.timer = 0;
  saverWatch.running = true; saverWatch.again = false;
  const o = saverWatch.owner;
  (async () => {
    let v = folioDirty.draft;
    try { v = !!(await drafts.hasUnsaved(o)); } catch (e) { /* keep the last value */ }
    saverWatch.running = false;
    if (o !== saverWatch.owner) { pokeSaverWatch(); return; }
    folioDirty.draft = v;
    const snap = saverSnap(v);
    const sig = JSON.stringify(snap);
    if (sig !== saverWatch.sig) {
      saverWatch.sig = sig;
      saverWatch.subs.forEach((f) => { try { f(o, snap); } catch (e) { /* a subscriber never stops the watch */ } });
    }
    const now = Date.now();
    if (snap.busy || snap.pending || snap.up || snap.known || editorOpen.has(o)) saverWatch.until = now + WATCH_TAIL_MS;
    if (saverWatch.again) { pokeSaverWatch(); return; }
    if (now < saverWatch.until) saverWatch.timer = setTimeout(() => { saverWatch.timer = 0; pokeSaverWatch(); }, WATCH_MS);
  })();
}
let folioSeq = 0;
function addExpect(owner, x) {
  const a = expects.get(owner) || [];
  a.push({ ...x, seq: folioSeq });
  expects.set(owner, a);
}
function checkExpects(owner, ws, wsSaved, seq, ctx) {
  if (!wsSaved) return;
  const a = expects.get(owner);
  if (!a || !a.length) return;
  const keep = [];
  const lost = [];
  for (const x of a) {
    if (seq <= x.seq) { keep.push(x); continue; }
    const have = new Set(refsIn(ws[x.key]));
    if ((x.refs || []).every((r) => have.has(r))) {
      confirmed.add(owner);
      if (x.refs && x.refs.length) { try { drafts.dropPending(owner, x.refs); } catch (e) { /* ignore */ } }
      try { if (x.onDone) x.onDone(); } catch (e) { /* ignore */ }
    } else lost.push(x);
  }
  expects.set(owner, keep);
  if (!lost.length) return;
  const live = liveRefs(ws);
  const inTrash = new Set(trashRefs(normTrash(ws[KEYS.trash])));
  const requeue = [];
  for (const x of lost) {
    const here = new Set(refsIn(ws[x.key]));
    (x.refs || []).forEach((r) => { if (!live.has(r) && !here.has(r)) removeMedia(ctx.store, owner, r); });
    (x.superseded || []).forEach((r) => { if (!live.has(r) && !inTrash.has(r)) requeue.push(r); });
    try { if (x.onMissing) x.onMissing(); } catch (e) { /* ignore */ }
  }
  if (requeue.length && !ctx.locked()) ctx.write(KEYS.trash, (cur) => addTrash(cur, requeue, nowS()));
}

/* ---------- 정리 (§2.9, §6.5): 이 기기가 쓰기를 확인한 뒤에만 지운다 ---------- */
const gcBusy = new Set();
async function gcRun(ctx, need = 0) {
  const owner = ctx.owner;
  if (ctx.preview || ctx.locked() || !confirmed.has(owner) || gcBusy.has(owner)) return;
  gcBusy.add(owner);
  try {
    const plan = gcPlan(ctx.ws(), { nowMs: Date.now(), graceMs: graceMs(), need });
    if (!Array.isArray(plan) || !plan.length) return;
    const done = [];
    for (const ref of plan) {
      if (ctx.locked()) break;
      if (liveRefs(ctx.ws()).has(ref)) { done.push(ref); continue; }   // live again: drop from the trash without deleting
      const ok = await removeMedia(ctx.store, owner, ref);
      if (ok !== false) done.push(ref);
    }
    if (done.length) ctx.write(KEYS.trash, (cur) => dropTrash(cur, done));
  } finally { gcBusy.delete(owner); }
}
/** GC-before-append (§2.5): make room for k refs; without a confirmed write yet, wait at most 30 s and append anyway */
async function roomFor(ctx, k) {
  const n = trashRefs(normTrash(ctx.ws()[KEYS.trash])).length;
  if (n + k <= LIMITS.trashMax) return;
  for (let i = 0; i < 60 && !confirmed.has(ctx.owner); i++) { ctx.status(T.stConfirming); await sleep(500); }
  await gcRun(ctx, n + k - LIMITS.trashMax);
}

/* ---------- 화면 폭 ---------- */
function useWidth(ref) {
  const [w, setW] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    setW(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver((es) => { const r = es[0] && es[0].contentRect; if (r) setW(r.width); });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return w;
}

/* ============================================================
   학생 카드
   ============================================================ */
const SLICES = ["s6f.steps", "s6f.notes", "s6f.edit", "s6f.trash", "s5a.tool", "s5b.rounds", "s5c.inspect", "s5d.selNo", "s5d.selWhy", "s5e.pairSaw",
  "s4a.wear", "s4a.break", "s4a.repair", "s4a.stain", "s4c.final", "s4c.eskisImg", "s4c.sketchpad", "s6a.regen", "s6a.partial", "s6a.edit",
  "s6a.diff", "s6a.beforeImg", "s6a.afterImg", "s6b.title", "s6b.relic", "s6b.size", "s6b.aiScope", "s7x.img", "s7x.no"];
/** true when f, fieldKey, v, owner are identical and the ws slices the card reads are reference-equal; setField identity is ignored */
function folioPropsEqual(a, b) {
  if (a.f !== b.f || a.fieldKey !== b.fieldKey || a.v !== b.v || a.owner !== b.owner || a.store !== b.store) return false;
  const wa = a.ws || {}, wb = b.ws || {};
  return SLICES.every((k) => wa[k] === wb[k]);
}

const TABS = ["ref", "ra", "rb", "rc", "rv", "edit"];
const lastTab = new Map();   // owner → tab (the card unmounts on 차시 tab changes)
const tabName = (k) => (k === "ref" ? T.tabRef : k === "rv" ? T.tabReflect : k === "edit" ? T.tabRefine : ROUND_LABEL[ROUNDS.indexOf(k)]);
const STATE_GLYPH = { done: "✓", part: "◐", empty: "○", skip: "–" };
const STATE_TEXT = { done: T.stateDone, part: T.statePart, empty: T.stateEmpty, skip: T.stateSkip };

function firstOpenTab(steps, editorOn) {
  for (const r of ROUNDS) { const s = roundState(steps, r); if (s !== "done" && s !== "skip") return r; }
  if (!reflectDone(steps)) return "rv";
  return editorOn ? "edit" : "ra";
}

function FolioPadImpl(props) {
  const { ws: wsProp, owner, store, fmtTime, inspectItems } = props;
  folioSeq++;
  const seq = folioSeq;
  throwIn("FolioPad");
  const ws = wsProp || {};
  const locked = !!useContext(WsLockCtx);
  const wsSaved = useContext(WsSavedCtx);
  const preview = !owner || owner === "preview";
  const setFieldRef = useRef(props.setField);
  setFieldRef.current = props.setField;
  const wsRef = useRef(ws);
  wsRef.current = ws;
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const roSteps = migrate(ws[KEYS.steps]).readOnly;
  const roNotes = migrate(ws[KEYS.notes]).readOnly;
  const roEdit = migrate(ws[KEYS.edit]).readOnly;

  const [msg, setMsg] = useState({ text: "", err: false });
  const [rnote, setRnote] = useState({});   // per round: { img, clip, info, exp }
  const noteR = (r, patch) => setRnote((o) => ({ ...o, [r]: { ...(o[r] || {}), ...patch } }));
  const [busy, setBusy] = useState(0);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  // ctx: the latest values for event handlers (never read during render)
  const ctxRef = useRef(null);
  if (!ctxRef.current) {
    const write = makeWrite(wsRef, setFieldRef);
    ctxRef.current = {
      write, owner, store, preview,
      setField: (k, v, o) => (typeof setFieldRef.current === "function" ? setFieldRef.current(k, v, o) : false),   // stable for the editor
      ws: () => wsRef.current || {},
      locked: () => lockedRef.current,
      status: (text, err) => { if (alive.current) setMsg({ text: text || "", err: !!err }); },
    };
  }
  const ctx = ctxRef.current;
  ctx.owner = owner; ctx.store = store; ctx.preview = preview;

  // 저장기(Saver): 편집기를 열지 않아도 확인·정리를 계속한다 (§6.5)
  const saver = preview ? null : getSaver({ store, owner, dev: devId(), setFieldRef, getWs: () => wsRef.current, getLocked: () => lockedRef.current, getSeq: () => folioSeq });   // getSeq: IO16 (R7)
  // 입력 잠금을 저장기에 알린다 (REQ-C1): 저장 중 잠그면 남은 올리기를 멈추고, 잠긴 동안 정리하지 않는다
  useEffect(() => { if (saver && typeof saver.setLock === "function") saver.setLock(locked); }, [locked, saver]);
  useEffect(() => {
    if (preview) return;
    try { saver.observe(ws, wsSaved, seq); } catch (e) { /* ignore */ }
    checkExpects(owner, ws, wsSaved, seq, ctx);
    if (saver && saver.state && saver.state.phase === "saved") confirmed.add(owner);
    // 편집기를 닫은 뒤에도 저장기가 확인 중이면 앱 관문이 알 수 있게 둔다 (§6.11; 열려 있는 동안은 편집기의 onDirty가 정한다)
    if (!editorOpen.has(owner) && saver) folioDirty.unsaved = !!saver.pending;
  });
  // 처음 열 때: 오래된 초안 정리, 저장하다 만 ref를 정리 목록으로, 썸네일 복구 (§2.9, §3.4, §6.8)
  useEffect(() => {
    if (preview) return undefined;
    let stop = false;
    (async () => {
      try { await drafts.purgeOld(24 * 3600 * 1000); } catch (e) { /* ignore */ }
      try {
        const d = await drafts.get(owner, KEYS.edit);
        const keep = d && Array.isArray(d.planned) ? d.planned.map((p) => p.ref) : [];
        const back = await drafts.takePending(owner, { keep });
        const w = wsRef.current, live = liveRefs(w), inTrash = new Set(trashRefs(normTrash(w[KEYS.trash])));
        const lost = (back || []).filter((r) => !live.has(r) && !inTrash.has(r));
        if (lost.length && !lockedRef.current && !stop) ctx.write(KEYS.trash, (cur) => addTrash(cur, lost, nowS()));
      } catch (e) { /* ignore */ }
      if (!stop) pokeSaverWatch(owner);   // purgeOld may have removed a draft
      if (!stop) await repairThumbs(ctx);
    })();
    return () => { stop = true; };
  }, [owner]);
  useEffect(() => () => { if (!folioDirty.uploading) folioDirty.flush = null; folioDirty.current = false; }, []);
  const [watchSt, setWatchSt] = useState({ draft: false, busy: false, pending: false, phase: "", known: false, up: false });
  useEffect(() => {
    if (preview) return undefined;
    const f = (o, snap) => { if (o === owner && alive.current) setWatchSt(snap); };
    saverWatch.subs.add(f);
    saverWatch.sig = "";   // the new subscriber hears the current state
    pokeSaverWatch(owner, saver);
    return () => { saverWatch.subs.delete(f); };
  }, [owner, preview]);

  const steps = normSteps(ws[KEYS.steps]);
  const editorOn = !!feat("editor");
  const tabs = TABS.filter((k) => k !== "edit" || editorOn);
  const [tab, setTabState] = useState(() => {
    const t = lastTab.get(owner);
    return t && tabs.includes(t) ? t : firstOpenTab(steps, editorOn);
  });
  const curTab = tabs.includes(tab) ? tab : "ra";
  const headRef = useRef(null);
  const firstPaint = useRef(true);
  const focusHead = useRef(false);
  const setTab = (k, focus = true) => { lastTab.set(owner, k); focusHead.current = focus; setTabState(k); };
  useLayoutEffect(() => {
    // 휴대전화에서 가로로 넘기는 표시줄: 고른 탭이 보이게 표시줄만 옮긴다(페이지는 움직이지 않는다)
    const el = document.getElementById("pf-tab-" + curTab), strip = el && el.closest(".pf-strip");
    if (strip && strip.scrollWidth > strip.clientWidth + 1) {
      const lr = el.parentElement.getBoundingClientRect(), sr = strip.getBoundingClientRect();
      const l = lr.left - sr.left + strip.scrollLeft, r = l + lr.width;
      if (l < strip.scrollLeft || r > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = Math.max(0, l - 24);
    }
    if (firstPaint.current) { firstPaint.current = false; return; }
    if (focusHead.current && headRef.current) { headRef.current.focus({ preventScroll: false }); }
    focusHead.current = false;
  }, [curTab]);
  const [viewer, setViewer] = useState(null);   // { label, node }
  const openView = (label, node) => setViewer({ label, node });

  // 이미지 올리기 (§3.4)
  const run = async (fn) => {
    folioDirty.uploading++; pokeSaverWatch();
    folioDirty.flush = folioDirty.flush || waitUploads;
    setBusy((b) => b + 1);
    try { await fn(); } catch (e) { ctx.status(T.errWs, true); try { console.warn("[folio]", e); } catch (er) { /* ignore */ } }
    finally {
      folioDirty.uploading = Math.max(0, folioDirty.uploading - 1);
      if (!folioDirty.uploading && folioDirty.flush === waitUploads) folioDirty.flush = null;
      if (alive.current) setBusy((b) => Math.max(0, b - 1));
    }
  };
  const can = () => {
    if (preview) { ctx.status(T.preview); return false; }
    if (lockedRef.current) { ctx.status(T.lockedUpload, true); return false; }
    if (roSteps) { ctx.status(T.readOnlyVersion, true); return false; }
    return true;
  };
  const upload = (r, file, rep) => { if (file && can()) run(() => uploadStepImage(ctx, r, file, rep, (p) => noteR(r, p))); };
  const removeImg = (r, i) => {
    if (!can()) return;
    run(async () => {
      const cur = ctx.ws()[KEYS.steps];
      const res = removeImage(cur, r, i, nowS());
      if (!res || res.value === cur) return;
      const gone = [res.oldMain, ...(res.trashThumbs || [])].filter(Boolean);
      await roomFor(ctx, gone.length);
      const ref = res.oldMain;   // the updater uses the ref, so it stays idempotent if another device changed the round
      const w = ctx.write(KEYS.steps, (c) => removeImage(c, r, ref, nowS()).value);
      if (!w.ok) { ctx.status(T.errWs, true); return; }
      if (gone.length) ctx.write(KEYS.trash, (c) => addTrash(c, gone, nowS()));
      addExpect(owner, { key: KEYS.steps, refs: [], superseded: gone, onDone: () => gcRun(ctx) });
      ctx.status("");
    });
  };

  const sp = { ws, steps, ctx, owner, store, locked, preview, ro: roSteps, roNotes, roEdit, fmtTime, inspectItems, setTab, openView, upload, removeImg, rnote, noteR, editorOn, saver, watchSt };
  const saverState = saver ? saver.state : null;
  const statusText = msg.text || (busy ? "" : saverText(saverState, fmtTime));
  const statusErr = msg.text ? msg.err : !!(saverState && saverState.phase === "error");

  return (
    <div className="pf span2">
      <Strip tabs={tabs} cur={curTab} setTab={(k) => setTab(k, false)} {...sp} />
      <div className="pf-panel" role="tabpanel" id={"pf-panel-" + curTab} aria-labelledby={"pf-tab-" + curTab}>
        {preview ? <p className="pf-info">{T.preview}</p> : null}
        {roSteps || roNotes || roEdit ? <p className="pf-info warn-note" role="status">{T.readOnlyVersion}</p> : null}
        {curTab === "ref" && <RefPanel headRef={headRef} {...sp} />}
        {ROUNDS.includes(curTab) && <RoundPanel key={curTab} r={curTab} headRef={headRef} {...sp} />}
        {curTab === "rv" && <ReflectPanel headRef={headRef} {...sp} />}
        {curTab === "edit" && <RefinePanel headRef={headRef} {...sp} props={props} wsSaved={wsSaved} />}
      </div>
      <Status text={statusText} err={statusErr} />
      <PfViewer open={!!viewer} label={viewer ? viewer.label : ""} onClose={() => setViewer(null)}>{viewer ? viewer.node : null}</PfViewer>
    </div>
  );
}
const FolioPadMemo = React.memo(FolioPadImpl, folioPropsEqual);
async function waitUploads() { for (let i = 0; i < 200 && folioDirty.uploading > 0; i++) await sleep(100); return folioDirty.uploading === 0; }

function saverText(s, fmtTime) {
  if (!s) return "";
  if (s.phase === "uploading" || s.phase === "encoding") return fmt(T.stUploading, { i: Math.min((s.done || 0) + 1, s.total || 1), n: s.total || 1 });
  if (s.phase === "confirming" || s.phase === "writing") return T.stConfirming;
  if (s.phase === "offline") return T.stOffline;
  if (s.phase === "locked") return T.stLocked;
  if (s.phase === "error") return s.err === "rejected" ? T.errRejected : s.err === "size" ? T.errSize : s.err === "ws" ? T.errWs : T.errTimeout;
  if (s.phase === "saved" && s.at) return fmt(T.stSaved, { time: msTime(s.at, fmtTime).split(" ").pop() });
  return "";
}

/** React.memo(FolioPadImpl, folioPropsEqual), wrapped in FolioBoundary. Renders null unless f.part === "steps".
 *  props { f, fieldKey, v, setField, ws, owner, store, MediaThumb, confirmDel, fmtTime, inspectItems } */
export function FolioPad(props) {
  if (!props.f || props.f.part !== "steps") return null;
  return <FolioBoundary owner={props.owner}><FolioPadMemo {...props} /></FolioBoundary>;
}

/* ---------- 업로드 순서 (§3.4) ---------- */
const putMsg = (r) => (r === "rejected" ? T.errRejected : r === "offline" ? T.stOffline : r === "invalid" ? T.errRejected : T.errTimeout);
/** a ref whose put did not succeed: a timed-out put may still land later, so it goes to the trash (GC deletes it after the
 *  grace); a refused or never-started put stored nothing and is removed at once (review R4) */
function discard(ctx, refs, result) {
  const list = (refs || []).filter(Boolean);
  if (!list.length) return;
  if (result !== "timeout") { list.forEach((x) => removeMedia(ctx.store, ctx.owner, x)); return; }
  ctx.write(KEYS.trash, (c) => addTrash(c, list, nowS()), { upload: true });
  lateWatch(ctx, list);
}
/** when a timed-out put answers late and its ref has already left the trash (deleted by GC), remove the new doc at once */
function lateWatch(ctx, refs) {
  refs.forEach((ref) => {
    const p = latePut(ref);
    if (!p) return;
    Promise.resolve(p).then((ok) => {
      if (ok !== true && ok !== "ok") return;
      const w = ctx.ws(), inTrash = new Set(trashRefs(normTrash(w[KEYS.trash])));
      if (!liveRefs(w).has(ref) && !inTrash.has(ref)) removeMedia(ctx.store, ctx.owner, ref);
    }).catch(() => {});
  });
}
async function putOne(ctx, ref, data, i, n) {
  ctx.status(fmt(T.stUploading, { i, n }));
  const slow = setTimeout(() => ctx.status(T.stSlow), 10000);
  try { return await putMedia(ctx.store, ctx.owner, ref, data, { timeoutMs: testTimeout() }); } finally { clearTimeout(slow); }
}
/** prepare → decode once → 480 px thumbnail + sg → put main then thumbnail → one {upload:true} write → verify from props */
async function uploadStepImage(ctx, r, file, rep, note) {
  const owner = ctx.owner;
  note({ img: "" });
  const cur0 = normSteps(ctx.ws()[KEYS.steps])[r];
  const isRep = rep >= 0;
  if (!isRep && cur0.im.length >= LIMITS.imgPerRound) { note({ img: T.imgRoundFull }); return; }
  const preset = (isRep ? rep === cur0.ci || cur0.im.length <= 1 : cur0.im.length === 0) ? "full" : "cand";
  let prep;
  try { prep = await prepareImage(file, imgPreset(preset)); } catch (e) { note({ img: imgErrText(e) }); return; }
  let img = null, th = null, sg = ZERO_SG;
  try { img = await decodeImage(prep.data); } catch (e) { img = null; }
  if (img) {
    try { th = await encodeThumb(img, THUMB.px, THUMB.q); } catch (e) { th = null; }
    sg = sigOf(img);
  }
  const stamp = stamp36();
  const ref = mkRef(KEYS.steps, r, stamp), thRef = mkRef(KEYS.steps, r, stamp, "th");
  try { await drafts.addPending(owner, [ref, thRef]); } catch (e) { /* ignore */ }
  const r1 = await putOne(ctx, ref, prep.data, 1, 2);
  if (r1 !== "ok") { discard(ctx, [ref], r1); ctx.status(putMsg(r1), true); return; }
  prime(owner, ref, prep.data);
  const r2 = th ? await putOne(ctx, thRef, th, 2, 2) : "invalid";
  const thLate = th && r2 === "timeout" ? [thRef] : [];   // trashed in the same tick as the image write
  if (r2 !== "ok" && th && r2 !== "timeout") removeMedia(ctx.store, owner, thRef);
  if (r2 === "ok") prime(owner, thRef, th);
  const item = { ref, w: prep.w, h: prep.h, sg, th: r2 === "ok" ? { ref: thRef } : null };
  const up = [ref].concat(r2 === "ok" ? [thRef] : []);
  const drop = () => { up.forEach((x) => removeMedia(ctx.store, owner, x)); };
  const t = nowS();
  if (!isRep) {
    const pre = addImage(ctx.ws()[KEYS.steps], r, item, t);
    if (!pre || pre.ok === false) { drop(); note({ img: T.imgRoundFull }); ctx.status(""); return; }
    const w = ctx.write(KEYS.steps, (c) => addImage(c, r, item, t).value, { upload: true });
    if (!w.ok) { drop(); discard(ctx, thLate, "timeout"); ctx.status(w.err === "size" ? T.errSize : T.imgWsFail, true); return; }
    if (thLate.length) { ctx.write(KEYS.trash, (c) => addTrash(c, thLate, t), { upload: true }); lateWatch(ctx, thLate); }
    addExpect(owner, { key: KEYS.steps, refs: up, onDone: () => gcRun(ctx), onMissing: () => { note({ img: T.imgRoundFull }); } });
  } else {
    const pre = replaceImage(ctx.ws()[KEYS.steps], r, rep, item, t);
    if (!pre || pre.value === ctx.ws()[KEYS.steps]) { drop(); ctx.status(T.imgWsFail, true); return; }
    const gone = [pre.oldMain, ...(pre.trashThumbs || [])].filter(Boolean);
    await roomFor(ctx, gone.length);
    const oldRef = pre.oldMain;
    const w = ctx.write(KEYS.steps, (c) => replaceImage(c, r, oldRef, item, t).value, { upload: true });
    if (!w.ok) { drop(); ctx.status(w.err === "size" ? T.errSize : T.imgWsFail, true); return; }
    if (gone.length || thLate.length) ctx.write(KEYS.trash, (c) => addTrash(c, [...gone, ...thLate], t), { upload: true });
    lateWatch(ctx, thLate);
    addExpect(owner, { key: KEYS.steps, refs: up, superseded: gone, onDone: () => gcRun(ctx), onMissing: () => { note({ img: T.imgWsFail }); } });
  }
  ctx.status("");
}
/** rebuild missing thumbnails (th:null) once per card mount (§3.4 step 5) */
async function repairThumbs(ctx) {
  const steps = normSteps(ctx.ws()[KEYS.steps]);
  const todo = [];
  ROUNDS.forEach((r) => steps[r].im.forEach((im) => { if (im && im.ref && !im.th) todo.push({ r, ref: im.ref }); }));
  for (const t of todo) {
    if (ctx.locked() || ctx.preview) return;
    const m = await loadMedia(ctx.store, ctx.owner, t.ref);
    if (!m.ok) continue;
    let th = null;
    try { th = await encodeThumb(await decodeImage(m.data), THUMB.px, THUMB.q); } catch (e) { th = null; }
    if (!th) continue;
    const thRef = mkRef(KEYS.steps, t.r, stamp36(), "th");   // a fresh ref: a late answer for an older thumbnail ref cannot count (R4)
    folioDirty.uploading++; pokeSaverWatch();
    try {
      const r = await putMedia(ctx.store, ctx.owner, thRef, th, { timeoutMs: testTimeout() });
      if (r !== "ok") { discard(ctx, [thRef], r); continue; }
      prime(ctx.owner, thRef, th);
      const w = ctx.write(KEYS.steps, (c) => setThumb(c, t.r, t.ref, { ref: thRef }), { upload: true });
      if (w.ok && !w.same) addExpect(ctx.owner, { key: KEYS.steps, refs: [thRef] });
      else if (!w.ok) removeMedia(ctx.store, ctx.owner, thRef);
    } finally { folioDirty.uploading = Math.max(0, folioDirty.uploading - 1); }
  }
}

/* ---------- 표시줄 (§3.1) ---------- */
function Strip({ tabs, cur, setTab, steps, ws, store, owner }) {
  const edit = normEdit(ws[KEYS.edit]);
  const tabBox = (k) => {
    if (ROUNDS.includes(k)) {
      const rd = steps[k], img = rd.ci >= 0 ? rd.im[rd.ci] : null;
      return img ? <PfImg store={store} owner={owner} refId={thumbOf(img)} alt="" className="pf-tab-img" fit="cover" /> : <span className="pf-tab-img pf-tab-empty" aria-hidden="true" />;
    }
    if (k === "edit") {
      const ref = edit && edit.m && ((edit.m.out && edit.m.out.th && edit.m.out.th.ref) || (edit.m.base && edit.m.base.ref));
      const bc = !ref ? baseChoice(steps) : null;
      const r2 = ref || (bc && bc.img ? thumbOf(bc.img) : null);
      return r2 ? <PfImg store={store} owner={owner} refId={r2} alt="" className="pf-tab-img" fit="cover" /> : <span className="pf-tab-img pf-tab-empty" aria-hidden="true" />;
    }
    return <span className={"pf-tab-img pf-tab-glyph" + (k === "ref" ? " ref" : "")} aria-hidden="true">{k === "ref" ? "≡" : "↺"}</span>;
  };
  const stateOf = (k) => {
    if (ROUNDS.includes(k)) return roundState(steps, k);
    if (k === "rv") { const rv = steps.rv; return reflectDone(steps) ? "done" : (rv.near || rv.far || filled(rv.look) || filled(rv.dPr) || filled(rv.big)) ? "part" : "empty"; }
    return null;
  };
  const arrowChip = (k) => {
    const prev = prevRoundOf(steps, k);
    if (!prev) return "";
    if (steps[prev].nl === 7) return T.chipDirection;
    const ch = changedLines(steps, k) || [];
    return ch.map((i) => LINE_MARK[i]).join("");
  };
  const done = edit && edit.done && edit.done.at > 0;
  // 화살표·Home·End로 탭 사이를 옮긴다(수동 활성화: Enter·Space로 연다). 앱 전체 처리(A11yRuntime)와 겹치지 않게 여기서 멈춘다
  const onKey = (e) => {
    const i = tabs.indexOf(String(e.target.id || "").replace(/^pf-tab-/, ""));
    if (i < 0) return;
    let j = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") j = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") j = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = tabs.length - 1;
    if (j < 0) return;
    e.preventDefault(); e.stopPropagation();
    const el = document.getElementById("pf-tab-" + tabs[j]);
    if (el) el.focus();
  };
  const ol = useRef(null);
  const [more, setMore] = useState("");
  useLayoutEffect(() => {
    const el = ol.current;
    if (!el) return undefined;
    const upd = () => {
      const l = el.scrollLeft > 2, r = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
      setMore((l ? "l" : "") + (r ? "r" : ""));
    };
    upd();
    el.addEventListener("scroll", upd, { passive: true });
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(upd) : null;
    if (ro) ro.observe(el);
    return () => { el.removeEventListener("scroll", upd); if (ro) ro.disconnect(); };
  }, []);
  return (
    <ol className="pf-strip" role="tablist" aria-label={T.stripLabel} onKeyDown={onKey} ref={ol} data-more={more || undefined}>
      {tabs.map((k) => {
        const st = stateOf(k);
        const chip = k === "rb" || k === "rc" ? arrowChip(k) : null;
        return (
          <React.Fragment key={k}>
            {chip !== null ? <li className="pf-arrow" aria-hidden="true"><span>→</span>{chip ? <span className="pf-arrow-chip">{chip}</span> : null}</li> : null}
            <li role="presentation" className="pf-tab-li">
              <PfNav role="tab" id={"pf-tab-" + k} selected={cur === k} controls={"pf-panel-" + k} tabIndex={cur === k ? 0 : -1}
                className={"pf-tab" + (cur === k ? " on" : "")} onActivate={() => setTab(k)}>
                {tabBox(k)}
                <span className="pf-tab-name">{tabName(k)}</span>
                {st ? <span className={"pf-tab-st " + st}><span aria-hidden="true">{STATE_GLYPH[st]}</span> {STATE_TEXT[st]}</span> : null}
                {chip ? <span className="ax-sr">{chip === T.chipDirection ? chip : fmt(T.changedLinesList, { list: chip })}</span> : null}
                {k === "edit" && done ? <span className="pf-tab-st done"><span aria-hidden="true">✓</span> {T.chipConfirmed}</span> : null}
              </PfNav>
            </li>
          </React.Fragment>
        );
      })}
    </ol>
  );
}

/* ---------- 기준 화면 (§3.2) ---------- */
function refData(ws, inspectItems) {
  const insp = ws["s5c.inspect"] && typeof ws["s5c.inspect"] === "object" ? ws["s5c.inspect"] : {};
  const items = (inspectItems || []).filter((it) => insp[it.k] && insp[it.k].status === CORE_TEXT.s5cNo)
    .map((it) => ({ k: it.k, label: it.label, note: String(insp[it.k].note || ""), fix: String(insp[it.k].fix || "") }));
  const rounds = s5rounds(ws);
  const si = selIndex(ws["s5d.selNo"]);
  const sel = si >= 0 && rounds[si] && rounds[si].img ? { n: si + 1, img: String(rounds[si].img) } : null;
  const final = String(ws["s4c.final"] || "");
  const eskis = (Array.isArray(ws["s4c.eskisImg"]) ? ws["s4c.eskisImg"] : []).filter(hasRef).slice(0, 3).map((x) => x.ref);
  const pad = hasRef(ws["s4c.sketchpad"]) ? ws["s4c.sketchpad"].ref : null;
  const trace = [["wear", 1], ["break", 2], ["repair", 3], ["stain", 4]].map(([k, c]) => ({ k, label: CELL_LABEL[c], v: String(ws["s4a." + k] || "") })).filter((x) => filled(x.v));
  return { items, sel, selWhy: String(ws["s5d.selWhy"] || ""), final, eskis, pad, trace };
}
function MoreText({ text, lines = 3 }) {
  const [open, setOpen] = useState(false);
  const long = text.length > lines * 34 || text.split("\n").length > lines;
  return (
    <div className="pf-more">
      <p className={"pf-memo" + (open || !long ? "" : " clamp")} style={{ WebkitLineClamp: lines }}>{text}</p>
      {long ? <PfNav className="pf-link" expanded={open} onActivate={() => setOpen(!open)}>{open ? T.less : T.more}</PfNav> : null}
    </div>
  );
}
function Thumb({ store, owner, refId, alt, openView, size, cls }) {
  const open = () => openView(alt, <PfImg store={store} owner={owner} refId={refId} alt={alt} />);
  return (
    <PfNav className={"pf-thumb " + (cls || "")} label={fmt(T.viewLarge, { what: alt })} onActivate={open}>
      <PfImg store={store} owner={owner} refId={refId} alt={alt} style={size ? { width: size, height: size } : undefined} fit="cover" />
    </PfNav>
  );
}
function RefBlocks({ ws, inspectItems, store, owner, openView, compact }) {
  const d = refData(ws, inspectItems);
  const any = d.items.length || d.sel || filled(d.selWhy) || filled(d.final) || (!compact && (d.eskis.length || d.pad || d.trace.length));
  if (!any) return <p className="pf-empty">{T.refEmpty}</p>;
  return (
    <div className={"pf-refb" + (compact ? " compact" : "")}>
      {d.items.length ? (
        <section className="pf-rb">
          <h4>{T.refInspect}</h4>
          <ul className="pf-rb-list">{d.items.map((it) => (
            <li key={it.k}><b>{it.label}</b>{it.fix ? <span className="pf-chip">{it.fix}</span> : null}{filled(it.note) ? <span className="pf-rb-note">{it.note}</span> : null}</li>
          ))}</ul>
        </section>
      ) : null}
      {d.sel || filled(d.selWhy) ? (
        <section className="pf-rb">
          <h4>{T.refChosen}</h4>
          {d.sel ? <Thumb store={store} owner={owner} refId={d.sel.img} alt={fmt(T.s5Round, { n: d.sel.n })} openView={openView} size={compact ? 120 : 160} cls="sel" /> : null}
          {filled(d.selWhy) ? (compact ? <MoreText text={d.selWhy} /> : <p className="pf-memo">{d.selWhy}</p>) : null}
        </section>
      ) : null}
      {filled(d.final) ? (
        <section className="pf-rb">
          <h4>{T.refFinal}</h4>
          <MoreText text={d.final} />
        </section>
      ) : null}
      {!compact && (d.eskis.length || d.pad) ? (
        <section className="pf-rb">
          <h4>{T.refSketch}</h4>
          <div className="pf-rb-row">
            {d.eskis.map((ref, i) => <Thumb key={ref} store={store} owner={owner} refId={ref} alt={T.refSketch + " " + (i + 1)} openView={openView} size={96} />)}
            {d.pad ? <Thumb store={store} owner={owner} refId={d.pad} alt={T.refSketchPad} openView={openView} size={96} /> : null}
          </div>
        </section>
      ) : null}
      {!compact && d.trace.length ? (
        <section className="pf-rb">
          <h4>{T.refTrace}</h4>
          <dl className="pf-dl">{d.trace.map((x) => <React.Fragment key={x.k}><dt>{x.label}</dt><dd>{x.v}</dd></React.Fragment>)}</dl>
        </section>
      ) : null}
    </div>
  );
}
function RefPanel(p) {
  const { ws, steps, store, owner, openView, headRef, inspectItems } = p;
  const rounds = s5rounds(ws);
  const used = new Set(ROUNDS.map((r) => steps[r].from).filter((n) => n > 0));
  const si = selIndex(ws["s5d.selNo"]);
  const others = rounds.map((x, i) => ({ x, n: i + 1 })).filter(({ x, n }) => x && x.img && !used.has(n) && n - 1 !== si);
  const old = Array.isArray(steps.old) ? steps.old.filter((o) => o && o.th && o.th.ref) : [];
  return (
    <div className="pf-refp">
      <h3 tabIndex={-1} ref={headRef} className="pf-h">{T.tabRef}</h3>
      <RefBlocks ws={ws} inspectItems={inspectItems} store={store} owner={owner} openView={openView} />
      <ImportPanel {...p} />
      {others.length || old.length ? (
        <section className="pf-rb">
          <h4>{T.refOther}</h4>
          <div className="pf-rb-row">
            {others.map(({ x, n }) => (
              <figure key={"s5" + n} className="pf-fig"><Thumb store={store} owner={owner} refId={String(x.img)} alt={fmt(T.s5Round, { n })} openView={openView} size={96} />
                <figcaption>{fmt(T.s5Round, { n })}</figcaption></figure>
            ))}
            {old.map((o, i) => (
              <figure key={"old" + i} className="pf-fig"><Thumb store={store} owner={owner} refId={o.th.ref} alt={T.refOld} openView={openView} size={96} />
                <figcaption>{T.refOld} · {ROUND_LABEL[o.r] || ""}</figcaption></figure>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

/* ---------- 5차시에서 가져오기 (§3.6) ---------- */
function ImportPanel({ ws, steps, ctx, owner, store, locked, preview, ro }) {
  const rounds = s5rounds(ws);
  const has = rounds.some((x) => x && (x.img || filled(x.prompt)));
  const [map, setMap] = useState(() => defaultImportMap(rounds, ws["s5d.selNo"]));
  const [images, setImages] = useState(true);
  const [res, setRes] = useState({ text: "", err: false, lines: [] });
  const [going, setGoing] = useState(false);
  if (!has) return null;
  const plan = importPlan(ws[KEYS.steps], rounds, map, { images }) || { rows: [], any: false };
  const rowOf = (r) => (plan.rows || []).find((x) => x && x.r === r);
  const label = (x, i) => fmt(T.impOption, { n: i + 1, tool: String((x && x.tool) || "").trim() || "-", judge: String((x && x.judge) || "").trim().slice(0, 16) || "-" });
  const go = async () => {
    if (preview) { ctx.status(T.preview); return; }
    if (ctx.locked()) { ctx.status(T.lockedUpload, true); return; }
    setGoing(true);
    folioDirty.uploading++; pokeSaverWatch();
    const lines = [];
    try {
      const pl = importPlan(ctx.ws()[KEYS.steps], rounds, map, { images }) || { rows: [] };
      const rows = (pl.rows || []).filter((x) => x && x.r && ((x.fill && x.fill.length) || x.img));
      const imgs = rows.filter((x) => x.img && images);
      const copies = {};
      const up = [];
      let k = 0;
      for (const row of imgs) {
        k++;
        ctx.status(fmt(T.impProgress, { i: k, n: imgs.length }));
        const n = map[ROUNDS.indexOf(row.r)] + 1;
        const src = rounds[n - 1] && rounds[n - 1].img;
        const m = src ? await loadMedia(store, owner, String(src)) : { ok: false };
        if (!m.ok || !/^data:image\/(jpeg|png);base64,/.test(m.data || "")) { lines.push(fmt(T.impImgFail, { n })); continue; }
        const stamp = stamp36();
        const ref = mkRef(KEYS.steps, row.r, stamp), thRef = mkRef(KEYS.steps, row.r, stamp, "th");
        try { await drafts.addPending(owner, [ref, thRef]); } catch (e) { /* ignore */ }
        const pr = await putMedia(store, owner, ref, m.data, { timeoutMs: testTimeout() });
        if (pr !== "ok") { discard(ctx, [ref], pr); lines.push(fmt(T.impImgFail, { n })); continue; }
        prime(owner, ref, m.data);
        let im = null, th = null, sg = ZERO_SG;
        try { im = await decodeImage(m.data); th = await encodeThumb(im, THUMB.px, THUMB.q); sg = sigOf(im); } catch (e) { /* thumbnail repaired later */ }
        let thOk = false;
        const tr = th ? await putMedia(store, owner, thRef, th, { timeoutMs: testTimeout() }) : "invalid";
        if (tr === "ok") { thOk = true; prime(owner, thRef, th); } else if (th) discard(ctx, [thRef], tr);
        copies[row.r] = { ref, w: im ? im.naturalWidth || im.width : 0, h: im ? im.naturalHeight || im.height : 0, sg, th: thOk ? { ref: thRef } : null };
        up.push(ref); if (thOk) up.push(thRef);
      }
      const t = nowS();
      const upd = (cur) => {
        let c = cur, prevR = null;
        for (const row of rows) {
          const n = map[ROUNDS.indexOf(row.r)] + 1;
          c = importRound(c, row.r, rounds[n - 1], n, t, { prevR });
          if (copies[row.r]) { const a = addImage(c, row.r, copies[row.r], t); if (a && a.ok) c = a.value; }
          prevR = row.r;
        }
        return c;
      };
      const w = ctx.write(KEYS.steps, upd, up.length ? { upload: true } : undefined);
      if (!w.ok) { up.forEach((x) => removeMedia(store, owner, x)); setRes({ text: T.imgWsFail, err: true, lines }); ctx.status(""); return; }
      if (up.length) addExpect(owner, { key: KEYS.steps, refs: up, onDone: () => gcRun(ctx) });
      if (rows.some((x) => x.clipped)) lines.push(T.impClipped);
      setRes({ text: fmt(T.impDone, { n: rows.length }), err: false, lines });
      try { drafts.dropPending(owner, up); } catch (e) { /* ignore */ }
      ctx.status("");
    } finally {
      folioDirty.uploading = Math.max(0, folioDirty.uploading - 1);
      setGoing(false);
    }
  };
  const opts = rounds.map((x, i) => ({ x, i })).filter(({ x }) => x && (x.img || filled(x.prompt) || filled(x.tool) || filled(x.judge)));
  return (
    <details className="pf-imp">
      <summary>{T.impTitle}</summary>
      <div className="pf-imp-body">
        {ROUNDS.map((r, ri) => {
          const row = rowOf(r);
          const cells = row && Array.isArray(row.fill) ? row.fill : [];
          const id = "pf-imp-" + r;
          return (
            <div className="pf-imp-row" key={r}>
              <label htmlFor={id} className="pf-lb">{fmt(T.impRow, { n: ri + 1 })}</label>
              <select id={id} className="pf-in" value={map[ri]} disabled={going}
                onChange={(e) => { const v = parseInt(e.target.value, 10); setMap((m) => m.map((x, j) => (j === ri ? v : x))); }}>
                <option value={-1}>{T.impNone}</option>
                {opts.map(({ x, i }) => <option key={i} value={i}>{label(x, i)}</option>)}
              </select>
              {map[ri] >= 0 ? <span className="pf-q">{cells.length ? fmt(T.impFill, { list: cells.join(" · ") }) : T.impNothing}</span> : null}
            </div>
          );
        })}
        <label className="pf-check"><input type="checkbox" checked={images} disabled={going} onChange={(e) => setImages(e.target.checked)} /> {T.impImages}</label>
        <div className="pf-row">
          <button type="button" className="btn small" disabled={going || !plan.any || locked || preview || ro} onClick={go}>{T.impBtn}</button>
        </div>
        {res.text ? <p className={"pf-res" + (res.err ? " err" : "")} role={res.err ? "alert" : "status"}>{res.text}{res.lines.map((l, i) => <span key={i} className="pf-res-l">{l}</span>)}</p> : null}
      </div>
    </details>
  );
}

/* ---------- 회차 패널 (§3.3) ---------- */
function Chip({ children, kind }) { return <span className={"pf-chip" + (kind ? " " + kind : "")}>{children}</span>; }
function Field({ id, label, chips, q, children, fk, cls, opt, qid }) {
  return (
    <div className={"pf-f" + (cls ? " " + cls : "")} data-fk={fk || undefined}>
      <div className="pf-f-h">
        {id ? <label className="pf-lb" htmlFor={id}>{label}{opt ? <span className="pf-opt"> {T.optional}</span> : null}</label>
          : <span className="pf-lb">{label}{opt ? <span className="pf-opt"> {T.optional}</span> : null}</span>}
        {chips}
      </div>
      {q ? <span className="pf-q" id={qid || (id ? id + "-q" : undefined)}>{q}</span> : null}
      {children}
    </div>
  );
}
function TextBox({ id, value, maxB, onChange, rows = 2, input, readOnly, onFocus, describedBy, onKeyDown, onPaste, taRef, cls, onPointerDown }) {
  const own = useRef(null);
  const ref = taRef || own;
  useAutoGrow(ref, input ? null : value);
  const v = typeof value === "string" ? value : "";
  const ch = (e) => onChange && onChange(maxB ? clipText(e.target.value, maxB) : e.target.value);
  if (input) return <input ref={ref} id={id} className={"pf-in" + (cls ? " " + cls : "")} value={v} maxLength={maxB || undefined} readOnly={readOnly}
    onChange={ch} onFocus={onFocus} aria-describedby={describedBy} onKeyDown={onKeyDown} onPaste={onPaste} onPointerDown={onPointerDown} />;
  return <textarea ref={ref} id={id} className={"pf-ta" + (cls ? " " + cls : "")} rows={rows} value={v} maxLength={maxB || undefined} readOnly={readOnly}
    onChange={ch} onFocus={onFocus} aria-describedby={describedBy} onKeyDown={onKeyDown} onPaste={onPaste} onPointerDown={onPointerDown} />;
}
// 바이트 상한까지만 자른다(clipJson과 같은 규칙). 줄 칸 상한은 core가 다시 자른다
function clipText(s, maxB) {
  if (usedB(s) <= maxB) return s;
  let lo = 0, hi = s.length;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (usedB(s.slice(0, mid)) <= maxB) lo = mid; else hi = mid - 1; }
  let out = s.slice(0, lo);
  if (/[\ud800-\udbff]$/.test(out)) out = out.slice(0, -1);
  return out;
}

function RoundPanel(p) {
  const { r, ws, steps, ctx, owner, store, locked, preview, ro, setTab, openView, upload, removeImg, rnote, noteR, headRef, inspectItems, editorOn } = p;
  const n = roundNo(r);
  const raw = steps[r];
  const e = effRound(ws[KEYS.steps], r) || raw;
  const inh = e.inh || {};
  const started = raw.st > 0;
  const prevR = prevRoundOf(steps, r);
  const note = rnote[r] || {};
  const [help, setHelp] = useState(r === "ra");
  const [ckOpen, setCkOpen] = useState(r === "ra");
  const [skipOpen, setSkipOpen] = useState(false);
  const pfx = "pf-" + r + "-";
  const fk = (k) => KEYS.steps + "#" + r + "." + k;
  const can = !locked && !preview && !ro;
  const txt = (field) => (text) => { if (can) ctx.write(KEYS.steps, (c) => setRoundText(c, r, field, text, nowS())); };
  const code = (field) => (v) => { if (can) ctx.write(KEYS.steps, (c) => setRoundCode(c, r, field, v, nowS())); };
  const showQ = (k) => help || (r === "rb" && (k === "jd" || k === "nx"));
  const toggleHelp = () => {
    const open = !help;
    setHelp(open);
    if (open) { setCkOpen(true); if (can) ctx.write(KEYS.steps, (c) => bumpHelp(c, r)); }
  };
  const start = () => {
    if (!can) return;
    const seed = r === "ra" ? seedFor(ws[KEYS.steps], ws) : null;
    const w = ctx.write(KEYS.steps, (c) => startRound(c, r, seed, nowS()));
    if (!w.ok) { ctx.status(w.err === "size" ? T.errSize : T.errWs, true); return; }
    const any = seed && (filled(seed.tool) || filled(seed.po) || (seed.lines || []).some(filled));
    noteR(r, { info: r === "ra" ? (any ? T.roundSeeded + (seed.clipped ? " " + T.impClipped : "") : "") : (prevR ? fmt(T.roundInherited, { n: roundNo(prevR) }) : "") });
  };
  const skipOn = filled(raw.sk) || skipOpen;
  const changed = r !== "ra" ? (changedLines(ws[KEYS.steps], r) || []) : [];
  const nextTab = r === "ra" ? "rb" : r === "rb" ? "rc" : "rv";

  // 이미지를 확정한 회차인가 (§3.3 After 확정)
  const edit = normEdit(ws[KEYS.edit]);
  const doneEdit = !!(edit && edit.done && edit.done.at > 0);
  let baseR = -1;
  if (doneEdit) {
    const src = edit.m && edit.m.base && edit.m.base.src;
    ROUNDS.forEach((rr, i) => { if (src && steps[rr].im.some((im) => im.ref === src)) baseR = i; });
    if (baseR < 0) { const bc = baseChoice(steps); if (bc) baseR = bc.r; }
  }
  const imgLock = doneEdit && baseR === ROUNDS.indexOf(r);

  const head = (
    <div className="pf-rhead">
      <h3 tabIndex={-1} ref={headRef} className="pf-h">{ROUND_LABEL[n - 1]}</h3>
      <PfNav className="pf-help btn small ghost" expanded={help} controls={pfx + "form"} onActivate={toggleHelp}>{help ? T.helpHide : T.help}</PfNav>
    </div>
  );
  const body = (
    <div className={"pf-form" + (started ? "" : " off")} id={pfx + "form"}>
      {!started ? (
        <div className="pf-start">
          <button type="button" className="btn" disabled={!can} onClick={start}>{fmt(T.roundStart, { n })}</button>
          {r === "ra" ? <ImportPanel {...p} /> : null}
        </div>
      ) : null}
      {note.info ? <p className="pf-res" role="status">{note.info}</p> : null}
      <fieldset className="pf-fs" disabled={!started}>
        {skipOn && r !== "ra" ? null : (
          <>
            <Field id={pfx + "aim"} label={T.lbAim} fk={fk("aim")} q={showQ("aim") ? HELP.round.aim : null}
              chips={inh.aim ? <Chip kind="inh">{T.chipFromPrev}</Chip> : null}>
              <TextBox id={pfx + "aim"} value={e.aim} maxB={ROUND_CAP.aim} onChange={txt("aim")} describedBy={showQ("aim") ? pfx + "aim-q" : undefined} />
            </Field>
            <ExpField {...p} e={e} raw={raw} pfx={pfx} fk={fk} showQ={showQ} txt={txt} note={note} />
            <Field id={pfx + "tool"} label={T.lbTool} fk={fk("tool")} chips={inh.tool ? <Chip kind="inh">{T.chipSame}</Chip> : null}>
              <TextBox input id={pfx + "tool"} value={e.tool} maxB={ROUND_CAP.tool} onChange={txt("tool")} />
            </Field>
            <PromptBlock {...p} e={e} raw={raw} pfx={pfx} fk={fk} changed={changed} prevR={prevR} can={can} />
            <ImageGrid {...p} e={e} raw={raw} pfx={pfx} imgLock={imgLock} can={can} />
            <CheckRows r={r} raw={raw} code={code} open={ckOpen} setOpen={setCkOpen} />
            <Field id={pfx + "seen"} label={T.lbSeen} fk={fk("seen")} q={showQ("seen") ? HELP.round.seen : null}>
              <TextBox id={pfx + "seen"} value={raw.seen} maxB={ROUND_CAP.seen} onChange={txt("seen")} describedBy={showQ("seen") ? pfx + "seen-q" : undefined} />
            </Field>
            <Field label={T.lbUk} fk={fk("un")} q={showQ("uk") ? HELP.round.uk : null} qid={pfx + "uk-q"} opt>
              <Seg label={T.lbUk} options={UK_LABEL.slice(1)} value={raw.uk} onChange={code("uk")} describedBy={showQ("uk") ? pfx + "uk-q" : undefined} />
              {raw.uk === 2 || raw.uk === 3 ? (
                <div className="pf-sub"><label className="pf-lb small" htmlFor={pfx + "un"}>{T.lbReason}</label>
                  <TextBox input id={pfx + "un"} value={raw.un} maxB={ROUND_CAP.un} onChange={txt("un")} /></div>
              ) : null}
            </Field>
            {r !== "ra" ? (
              <Field label={T.lbPw}>
                <Seg label={T.lbPw} options={PW_LABEL.slice(1)} value={raw.pw} onChange={code("pw")} />
              </Field>
            ) : null}
            <Field id={pfx + "jd"} label={T.lbJd} fk={fk("jd")} q={showQ("jd") ? HELP.round.jd : null}
              chips={raw.cp & CP.jd ? <Chip kind="inh">{T.fromS5}</Chip> : null}>
              <TextBox id={pfx + "jd"} value={raw.jd} maxB={ROUND_CAP.jd} onChange={txt("jd")} describedBy={showQ("jd") ? pfx + "jd-q" : undefined} />
              <div className="pf-sub">
                <span className="pf-lb small" id={pfx + "cz-l"}>{T.lbCause}</span>
                <Seg label={T.lbCause} options={[...LINE_LABEL, CAUSE_LABEL[7], CAUSE_LABEL[8]]} value={raw.cz} onChange={code("cz")} />
              </div>
            </Field>
            {r === "rb" ? <MismatchTable fold open={help} /> : help ? <MismatchTable /> : null}
            <Field label={T.lbNr} opt>
              <Seg label={T.lbNr} options={NR_LABEL.slice(1)} value={raw.nr} onChange={code("nr")} />
            </Field>
            {r !== "rc" ? (
              <Field id={pfx + "nx"} label={T.lbNx} fk={fk("nx")} q={showQ("nx") ? HELP.round.nx : null}>
                <div className="pf-sub first">
                  <span className="pf-lb small">{T.lbNl}</span>
                  <Seg label={T.lbNl} options={[...LINE_LABEL, NL_LABEL[7]]} value={raw.nl} onChange={code("nl")} />
                </div>
                <TextBox id={pfx + "nx"} value={raw.nx} maxB={ROUND_CAP.nx} onChange={txt("nx")} describedBy={showQ("nx") ? pfx + "nx-q" : undefined} />
                {raw.nl === 7 ? (
                  <div className="pf-sub" data-fk={fk("nw")}><label className="pf-lb small" htmlFor={pfx + "nw"}>{T.lbNw}</label>
                    <TextBox input id={pfx + "nw"} value={raw.nw} maxB={ROUND_CAP.nw} onChange={txt("nw")} /></div>
                ) : null}
              </Field>
            ) : (
              <Field id={pfx + "nx"} label={T.lbHm} fk={fk("nx")} q={showQ("hm") ? HELP.round.hm : null}>
                <div className="pf-sub first">
                  <Seg label={T.lbHm} options={HM_LABEL.slice(1)} value={raw.hm} onChange={code("hm")} />
                </div>
                <TextBox id={pfx + "nx"} value={raw.nx} maxB={ROUND_CAP.nx} onChange={txt("nx")} describedBy={showQ("hm") ? pfx + "nx-q" : undefined} />
              </Field>
            )}
          </>
        )}
        {r !== "ra" ? (
          <div className="pf-skip" data-fk={fk("sk")}>
            <button type="button" className={"btn small " + (skipOn ? "" : "ghost")} aria-pressed={skipOn}
              onClick={() => { if (skipOn) { setSkipOpen(false); if (filled(raw.sk) && can) ctx.write(KEYS.steps, (c) => setSkip(c, r, "", nowS())); } else setSkipOpen(true); }}>
              {T.skipToggle}
            </button>
            {skipOn ? (
              <div className="pf-sub"><label className="pf-lb small" htmlFor={pfx + "sk"}>{T.lbSk}</label>
                <TextBox input id={pfx + "sk"} value={raw.sk} maxB={ROUND_CAP.sk}
                  onChange={(t) => { if (can) ctx.write(KEYS.steps, (c) => setSkip(c, r, t, nowS())); }} /></div>
            ) : null}
          </div>
        ) : null}
      </fieldset>
      <div className="pf-foot">
        <PfNav className="btn small ghost" onActivate={() => setTab(nextTab)}>{fmt(T.nextTab, { name: tabName(nextTab) })}</PfNav>
      </div>
    </div>
  );
  return <RefLayout head={head} body={body} {...p} />;
}

function RefLayout({ head, body, ws, inspectItems, store, owner, openView }) {
  const box = useRef(null);
  const w = useWidth(box);
  const wide = w >= 720;
  return (
    <div ref={box} className={"pf-round" + (wide ? " wide" : "")}>
      <div className="pf-main">
        {head}
        {!wide ? (
          <details className="pf-refd">
            <summary>{T.tabRef}</summary>
            <RefBlocks ws={ws} inspectItems={inspectItems} store={store} owner={owner} openView={openView} compact />
          </details>
        ) : null}
        {body}
      </div>
      {wide ? (
        <aside className="pf-refcol" aria-label={T.tabRef}>
          <div className="pf-refcol-h">{T.tabRef}</div>
          <RefBlocks ws={ws} inspectItems={inspectItems} store={store} owner={owner} openView={openView} compact />
        </aside>
      ) : null}
    </div>
  );
}

function ExpField({ r, raw, e, pfx, fk, showQ, txt, note, noteR }) {
  const lockedExp = raw.el === 2;
  const tell = () => { if (lockedExp && !note.exp) noteR(r, { exp: T.expLocked }); };
  return (
    <Field id={pfx + "exp"} label={T.lbExp} fk={fk("exp")} opt={r === "ra"} q={showQ("exp") ? HELP.round.exp : null}
      chips={raw.el === 1 ? <Chip kind="after">{T.chipAfterImg}</Chip> : raw.el === 2 ? <Chip kind="before">{T.chipBeforeImg}</Chip> : null}>
      <TextBox id={pfx + "exp"} value={e.exp} maxB={ROUND_CAP.exp} onChange={txt("exp")} readOnly={lockedExp}
        onFocus={tell} onPointerDown={tell} onKeyDown={(ev) => { if (ev.key.length === 1 || ev.key === "Backspace" || ev.key === "Delete") tell(); }}
        describedBy={[showQ("exp") ? pfx + "exp-q" : "", lockedExp ? pfx + "exp-lock" : ""].filter(Boolean).join(" ") || undefined} />
      <span className="pf-q lock" id={pfx + "exp-lock"} role="status">{lockedExp && note.exp ? note.exp : ""}</span>
    </Field>
  );
}

function PromptBlock({ r, ws, steps, ctx, e, raw, pfx, fk, changed, prevR, can, rnote, noteR }) {
  const refs = useRef([]);
  const keys = [...LINES, "po"];
  const note = rnote[r] || {};
  const inh = e.inh || {};
  const pool = keys.reduce((s, k) => s + (r === "ra" || !inh[k] ? usedB(raw[k]) : 0), 0);
  const near = pool >= 0.85 * PROMPT_POOL;
  const prevNl = prevR ? steps[prevR].nl : 0;
  const setLine = (i) => (text) => {
    if (!can) return;
    const t = String(text).replace(/\r?\n/g, " ");
    const t0 = nowS();
    const pre = setPromptLine(ctx.ws()[KEYS.steps], r, i, t, t0);
    noteR(r, { clip: !!(pre && pre.clipped) });
    ctx.write(KEYS.steps, (c) => setPromptLine(c, r, i, t, t0).value);
  };
  const onPaste = (i) => (ev) => {
    const text = (ev.clipboardData && ev.clipboardData.getData("text")) || "";
    const cur = String(e[keys[i]] || "");
    if (!can || filled(cur) || !(/\n/.test(text.trim()) || /[①②③④⑤⑥]/.test(text))) return;
    ev.preventDefault();
    const t0 = nowS();
    const pre = pastePrompt(ctx.ws()[KEYS.steps], r, i, text, t0);
    ctx.write(KEYS.steps, (c) => pastePrompt(c, r, i, text, t0).value);
    noteR(r, { clip: !!(pre && pre.clipped), info: pre && pre.spread ? T.promptSpread : "" });
  };
  const onKey = (i) => (ev) => {
    if (ev.key !== "Enter" || ev.shiftKey || ev.altKey || ev.ctrlKey || ev.metaKey || ev.nativeEvent.isComposing || ev.keyCode === 229) return;
    ev.preventDefault();
    const nx = refs.current[i + 1];
    if (nx) nx.focus();
  };
  const copy = async () => {
    const lines = LINES.map((k) => String(e[k] || "").trim()).filter(Boolean);
    if (filled(e.po)) lines.push(String(e.po).trim());
    const text = lines.join("\n");
    let ok = false;
    try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); ok = true; } } catch (er) { ok = false; }
    if (!ok) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0";
        (document.querySelector(".pf") || document.body).appendChild(ta); ta.select();
        ok = document.execCommand("copy"); ta.remove();
      } catch (er) { ok = false; }
    }
    noteR(r, { info: ok ? T.copied : T.copyFail });
  };
  return (
    <div className="pf-f pf-prompt" role="group" aria-labelledby={pfx + "pr-l"}>
      <div className="pf-f-h"><span className="pf-lb" id={pfx + "pr-l"}>{T.lbPrompt}</span>
        <PfNav className="btn small ghost pf-copy" onActivate={copy}>{T.copyPrompt}</PfNav></div>
      {keys.map((k, i) => {
        const id = pfx + k;
        const isInh = r !== "ra" && inh[k];
        const isCh = r !== "ra" && i < 6 && changed.includes(i);
        return (
          <div className="pf-line" key={k} data-fk={fk(k)}>
            <label htmlFor={id} className="pf-line-l">{i < 6 ? LINE_LABEL[i] : T.lbPo}</label>
            <div className="pf-line-c">
              <TextBox id={id} rows={1} value={e[k]} maxB={PROMPT_POOL} onChange={setLine(i)} onPaste={onPaste(i)} onKeyDown={onKey(i)}
                taRef={{ get current() { return refs.current[i]; }, set current(v) { refs.current[i] = v; } }} cls={isCh ? "changed" : isInh ? "inh" : ""} />
              {isInh ? <Chip kind="inh">{T.chipSame}</Chip> : isCh ? <Chip kind="ch">{T.chipChanged}</Chip> : null}
            </div>
          </div>
        );
      })}
      {near ? <span className="pf-full">{T.almostFull}</span> : null}
      {note.clip ? <p className="pf-alert" role="alert">{T.promptClipped}</p> : null}
      <p className="pf-hint" role="status">{changed.length >= 2 && prevNl !== 7 ? fmt(T.changedHint, { w: countWord(changed.length) }) : ""}</p>
    </div>
  );
}

function ImageGrid({ r, steps, e, raw, pfx, ctx, store, owner, openView, upload, removeImg, rnote, imgLock, can }) {
  const n = roundNo(r);
  const note = rnote[r] || {};
  const im = raw.im || [];
  const dup = (() => {
    for (const a of im) {
      if (!a || !a.sg || a.sg === ZERO_SG) continue;
      for (const rr of ROUNDS) {
        if (rr === r) continue;
        for (const b of steps[rr].im || []) if (b && b.sg && b.sg !== ZERO_SG && hamming(a.sg, b.sg) <= 4) return roundNo(rr);
      }
    }
    return 0;
  })();
  const dis = !can || imgLock;
  const pick = (rep) => (ev) => { const f = ev.target.files && ev.target.files[0]; ev.target.value = ""; if (f) upload(r, f, rep); };
  const repIn = useRef({});   // hidden file inputs of 「바꾸기」, opened only after the confirmation (review R9)
  const choose = (ref) => { if (can && !imgLock) ctx.write(KEYS.steps, (c) => chooseImage(c, r, ref, nowS())); };
  const lockId = pfx + "imglock";
  return (
    <div className="pf-f pf-imgs">
      <div className="pf-f-h"><span className="pf-lb" id={pfx + "im-l"}>{T.lbImages}</span></div>
      {im.length ? (
        <div className="pf-grid" role="radiogroup" aria-labelledby={pfx + "im-l"}>
          {im.map((x, i) => {
            const alt = fmt(T.imgAlt, { n, i: i + 1 });
            const on = raw.ci === i;
            return (
              <div className={"pf-tile" + (on ? " on" : "")} key={x.ref}>
                <PfNav className="pf-tile-img" label={fmt(T.viewLarge, { what: alt })}
                  onActivate={() => openView(alt, <PfImg store={store} owner={owner} refId={x.ref} alt={alt} />)}>
                  <PfImg store={store} owner={owner} refId={thumbOf(x)} alt={alt} fit="contain" />
                </PfNav>
                <div className="pf-tile-bar">
                  <button type="button" role="radio" aria-checked={on} className={"pf-pick" + (on ? " on" : "")} disabled={dis}
                    aria-label={fmt(T.tilePick, { n, i: i + 1 })} aria-describedby={imgLock ? lockId : undefined} onClick={() => choose(x.ref)}>
                    <span aria-hidden="true">{on ? "●" : "○"}</span> {T.chosenImg}
                  </button>
                  <input type="file" accept="image/*" className="pf-file-h" tabIndex={-1} aria-hidden="true" disabled={dis} onChange={pick(i)}
                    ref={(el) => { repIn.current[x.ref] = el; }} />
                  <PfConfirm label={T.replaceImg} ariaLabel={fmt(T.tileReplace, { n, i: i + 1 })} className="btn small ghost pf-rep" ask={T.replaceAsk}
                    yes={T.replaceImg} disabled={dis} describedBy={imgLock ? lockId : undefined}
                    onConfirm={() => { const el = repIn.current[x.ref]; if (el) el.click(); }} />
                  <PfConfirm label={T.removeImg} ariaLabel={fmt(T.tileRemove, { n, i: i + 1 })} className="btn small ghost pf-del" ask={fmt(T.removeAsk, { n })}
                    yes={T.removeImg} disabled={dis} onConfirm={() => removeImg(r, x.ref)} describedBy={imgLock ? lockId : undefined} />
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
      {im.length < LIMITS.imgPerRound ? (
        <label className={"pf-up" + (dis ? " dis" : "")}>
          <input type="file" accept="image/*" className="pf-file" disabled={dis} onChange={pick(-1)} />
          <span>{T.upload}</span>
        </label>
      ) : null}
      {!im.length || note.img ? <span className="pf-q">{imgHintText(imgPreset("full"))}</span> : null}
      {imgLock ? <p className="pf-hint" id={lockId}>{T.imgLockedByConfirm}</p> : null}
      {e.from > 0 ? <p className="pf-hint">{fmt(T.fromImport, { n: e.from })}</p> : null}
      {dup ? <p className="pf-hint">{fmt(T.dupImage, { n: dup })}</p> : null}
      {note.img ? <p className="pf-alert" role="alert">{note.img}</p> : null}
    </div>
  );
}

function CheckRows({ r, raw, code, open, setOpen }) {
  const ck = Array.isArray(raw.ck) ? raw.ck : [0, 0, 0, 0];
  const ok = ck.filter((x) => x === 1).length, no = ck.filter((x) => x === 2).length;
  const rows = (
    <div className="pf-ck">
      {CHECK_LABEL.map((lb, i) => (
        <div className="pf-ck-row" key={i}>
          <span className="pf-ck-l">{lb}</span>
          <Seg label={lb} options={[T.checkOk, T.checkNo]} value={ck[i] || 0} onChange={code("ck" + i)} />
        </div>
      ))}
    </div>
  );
  return (
    <div className="pf-f">
      {r === "ra" ? (<><div className="pf-f-h"><span className="pf-lb">{T.lbCheck}<span className="pf-opt"> {T.optional}</span></span></div>{rows}</>) : (
        <details className="pf-ckd" open={open} onToggle={(ev) => setOpen(ev.currentTarget.open)}>
          <summary><span className="pf-lb">{T.lbCheck}<span className="pf-opt"> {T.optional}</span></span> <span className="pf-q inline">{fmt(T.ckSummary, { ok, no })}</span></summary>
          {rows}
        </details>
      )}
    </div>
  );
}

/** the lesson table; fold: a <details> (2회차 shows it folded, [WSD] §2) that 「도움 보기」 opens */
function MismatchTable({ fold, open }) {
  const [o, setO] = useState(!!open);
  useEffect(() => { if (open) setO(true); }, [open]);
  const table = (
    <table className="pf-tbl">
      <thead><tr>{MISMATCH.heads.map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead>
      <tbody>{MISMATCH.rows.map((row, i) => <tr key={i}>{row.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
    </table>
  );
  if (fold) {
    return (
      <details className="pf-mm" open={o} onToggle={(ev) => setO(ev.currentTarget.open)}>
        <summary className="pf-mm-t">{T.mismatchTitle}</summary>
        {table}
      </details>
    );
  }
  return <div className="pf-mm"><div className="pf-mm-t">{T.mismatchTitle}</div>{table}</div>;
}

/* ---------- 세 회차 돌아보기 (§3.7) ---------- */
function ReflectPanel(p) {
  const { ws, steps, ctx, locked, preview, ro, setTab, headRef, editorOn, store, owner, openView } = p;
  const rv = steps.rv;
  const [help, setHelp] = useState(false);
  const can = !locked && !preview && !ro;
  const set = (field) => (v) => { if (can) ctx.write(KEYS.steps, (c) => setReflect(c, field, v, nowS())); };
  const def = baseChoice({ ...steps, rv: { ...rv, base: -1 } });
  const usable = ROUNDS.map((r) => roundState(steps, r) !== "skip" && steps[r].ci >= 0 && !!steps[r].im[steps[r].ci]);
  const notDefault = rv.base >= 0 && (!def || def.r !== rv.base);
  const fk = (k) => KEYS.steps + "#rv." + k;
  const tx = (k, cap, label, rows = 2) => (
    <NoteField id={"pf-rv-" + k} label={label} value={rv[k]} maxB={cap} onChange={set(k)} dataFk={fk(k)} rows={rows} readOnly={false} />
  );
  const toggleHelp = () => { const o = !help; setHelp(o); if (o && can) ctx.write(KEYS.steps, (c) => bumpHelp(c, "rv")); };
  const head = (
    <div className="pf-rhead">
      <h3 tabIndex={-1} ref={headRef} className="pf-h">{T.rvTitle}</h3>
      <PfNav className="pf-help btn small ghost" expanded={help} controls="pf-rv-form" onActivate={toggleHelp}>{help ? T.helpHide : T.help}</PfNav>
    </div>
  );
  // 세 회차에 고른 이미지를 같은 크기로 나란히 둔다(가장 가까운·먼 회차를 비교하는 질문, 검토 C2)
  const chosen = (
    <section className="pf-rv-imgs" aria-label={T.rvImages}>
      {ROUNDS.map((r, i) => {
        const rd = steps[r], img = rd.ci >= 0 ? rd.im[rd.ci] : null, skip = roundState(steps, r) === "skip";
        return (
          <figure key={r} className="pf-rv-fig">
            {img ? <PfNav className="pf-rv-img" label={fmt(T.viewLarge, { what: ROUND_LABEL[i] })}
              onActivate={() => openView(ROUND_LABEL[i], <PfImg store={store} owner={owner} refId={img.ref} alt={ROUND_LABEL[i]} />)}>
              <PfImg store={store} owner={owner} refId={thumbOf(img)} alt={ROUND_LABEL[i]} fit="contain" />
            </PfNav> : <span className="pf-img pf-img-none pf-rv-img" aria-hidden="true" />}
            <figcaption>{ROUND_LABEL[i]}{skip ? " · " + T.stateSkip : ""}</figcaption>
          </figure>
        );
      })}
    </section>
  );
  const body = (
    <div className="pf-rv" id="pf-rv-form">
      {chosen}
      <fieldset className="pf-fs">
        <section className="pf-grp">
          <h4>{T.rvGroupNear}</h4>
          {help ? <p className="pf-q">{HELP.reflect.near}</p> : null}
          <Field label={T.rvNear}><Seg label={T.rvNear} options={ROUND_LABEL} value={rv.near} onChange={set("near")} /></Field>
          <Field label={T.rvFar}><Seg label={T.rvFar} options={ROUND_LABEL} value={rv.far} onChange={set("far")} /></Field>
          {help ? <p className="pf-q">{HELP.reflect.look}</p> : null}
          {tx("look", REFLECT_CAP.look, T.rvLook)}
        </section>
        <section className="pf-grp">
          <h4>{T.rvGroupSrc}</h4>
          {help ? <p className="pf-q">{HELP.reflect.src}</p> : null}
          {tx("dPr", REFLECT_CAP.dPr, T.rvDPr)}
          {tx("dAi", REFLECT_CAP.dAi, T.rvDAi)}
          {tx("dHand", REFLECT_CAP.dHand, T.rvDHand)}
        </section>
        <section className="pf-grp">
          <h4>{T.rvGroupBig}</h4>
          {tx("big", REFLECT_CAP.big, T.rvBig)}
          {tx("use", REFLECT_CAP.use, T.rvUse)}
        </section>
        <section className="pf-grp">
          <h4>{T.rvGroupDrift}</h4>
          {help ? <p className="pf-q">{HELP.reflect.drift}</p> : null}
          {tx("drift", REFLECT_CAP.drift, T.rvDrift)}
          {tx("stuck", REFLECT_CAP.stuck, T.rvStuck)}
        </section>
        <section className="pf-grp" id="pf-rv-base">
          <h4>{T.rvGroupBase}</h4>
          <Seg label={T.rvGroupBase} options={ROUND_LABEL} value={rv.base} base={0} none={-1} onChange={set("base")}
            optDisabled={usable.map((u) => !u)} optNote={ROUNDS.map((r, i) => (def && def.r === i ? T.rvDefault : ""))} />
          {notDefault ? (
            <div className="pf-sub" data-fk={fk("baseWhy")}>
              <label className="pf-lb small" htmlFor="pf-rv-baseWhy">{T.rvBaseWhy}</label>
              <TextBox input id="pf-rv-baseWhy" value={rv.baseWhy} maxB={REFLECT_CAP.baseWhy} onChange={set("baseWhy")} />
            </div>
          ) : null}
        </section>
      </fieldset>
      <div className="pf-foot">
        {editorOn ? <PfNav className="btn small ghost" onActivate={() => setTab("edit")}>{fmt(T.nextTab, { name: T.tabRefine })}</PfNav> : null}
      </div>
    </div>
  );
  return <RefLayout head={head} body={body} {...p} />;
}

/* ============================================================
   다듬기 탭 (§3.8, §1.4, §3.10)
   ============================================================ */
function RefinePanel(p) {
  const { ws, steps, ctx, owner, store, locked, preview, roEdit, roNotes, setTab, openView, headRef, fmtTime, inspectItems, saver, props, wsSaved, watchSt } = p;
  const edit = normEdit(ws[KEYS.edit]);
  const notes = normNotes(ws[KEYS.notes]);
  const base = baseChoice(steps);
  const m = (edit && edit.m) || {};
  const done = !!(edit && edit.done && edit.done.at > 0);
  const [open, setOpen] = useState(null);   // null | { ro:boolean, k:number }
  const [keepEdit, setKeepEdit] = useState(false);
  const [sendMsg, setSendMsg] = useState({ text: "", err: false });
  const [sending, setSending] = useState(false);
  const opener = useRef(null);
  // 저장기에 일이 남아 있거나 카드가 올리는 중이면 다시 시작·확정·보내기를 막는다 (검토 R5)
  const busy = !!(saver && saver.pending) || folioDirty.uploading > 0;
  // 이 기기에만 임시 저장된 편집(IndexedDB 초안)이 있으면 확정하지 않는다 (검토 R6). 값은 저장 상태 지켜보기가 정한다 (검토 B1)
  const draftHeld = !preview && !!(watchSt && watchSt.draft);
  useEffect(() => { if (!preview) pokeSaverWatch(owner, saver); }, [owner, open, ws[KEYS.edit]]);
  // 저장기가 올리거나 적는 중이면 편집기를 새로 열지 않는다: 열린 편집기가 저장이 끝나기 전의 기록에서 시작한다 (검토 B2)
  const openBusy = !!(saver && saver.busy) || folioDirty.uploading > 0;
  // 이 기기에만 있는 초안(저장하지 않은 편집)은 다시 시작을 막지 않는다. 다시 시작하면 반영하지 않는다는 것을 한 번 묻는다 (C IO23)
  const draftAside = draftHeld || !!(watchSt && watchSt.known);
  const can = !locked && !preview;
  const dev = devId();
  // hidden stages are never counted as 할 일, so their routed items come from a call that opens every stage
  const routedAll = edit ? routedStages(edit.route, ws[KEYS.steps], () => true) || {} : {};
  const sr = (edit && edit.sr) || {};

  // 편집기 열기·닫기
  const openEditor = (readOnly) => {
    if (locked) return;
    if (!readOnly && ((saver && saver.busy) || folioDirty.uploading > 0)) { ctx.status(T.openBusy, true); pokeSaverWatch(owner, saver); return; }
    setOpen({ ro: !!readOnly, k: Date.now() });
  };
  const onClose = (reason) => {
    setOpen(null);
    folioDirty.flush = null; folioDirty.current = false;
    if (saver) folioDirty.unsaved = !!saver.pending;
    if (!preview) pokeSaverWatch(owner, saver);   // the close save may still run; the card hears when it ends and the draft goes (B1, B2)
    if (reason === "rebase") setTimeout(() => setOpen({ ro: false, k: Date.now() }), 0);
  };
  useEffect(() => { if (locked && open) onClose("lock"); }, [locked]);
  useEffect(() => {
    if (!open || open.ro || preview) return undefined;
    editorOpen.add(owner);
    pokeSaverWatch(owner, saver);
    return () => { editorOpen.delete(owner); };
  }, [open, owner]);

  // 다듬기에 쓴 이미지가 바뀌었는가 (src와 sg가 모두 다를 때)
  const bimg = base && base.img;
  const changedBase = !!(edit && m.base && bimg && m.base.src !== bimg.ref && m.base.sg !== bimg.sg);
  const rebase = () => {
    if (!can || done) return;
    if ((saver && saver.pending) || folioDirty.uploading > 0) { ctx.status(T.rebaseBusy, true); return; }
    ctx.status("");
    (async () => {
      const t = Date.now();
      const pre = rebaseEdit(ctx.ws()[KEYS.edit], t, dev);
      if (!pre || pre.value === ctx.ws()[KEYS.edit]) { ctx.status(T.errWs, true); return; }
      const sup = (pre.superseded || []).filter(Boolean);
      await roomFor(ctx, sup.length);
      const w = ctx.write(KEYS.edit, (c) => rebaseEdit(c, t, dev).value);
      if (!w.ok) { ctx.status(w.err === "size" ? T.errSize : T.errWs, true); return; }
      if (sup.length) ctx.write(KEYS.trash, (c) => addTrash(c, sup, Math.floor(t / 1000), { x: 1 }));
      addExpect(owner, { key: KEYS.edit, refs: [], superseded: sup, onDone: () => gcRun(ctx) });
      setKeepEdit(false);
    })();
  };

  // 구조 경고 (§3.8)
  const route = edit && edit.route;
  const si = ITEMS.indexOf("structure");
  const laterGen = base ? ROUNDS.slice(base.r + 1).some((r) => roundState(steps, r) !== "skip" && steps[r].ci >= 0) : false;
  const structWarn = !!(route && route.s && route.m && route.s[si] === 2 && route.m[si] === METHOD.regen && base && !laterGen);

  // 확정과 확정 풀기 (§3.10)
  const check0 = edit ? finalizeCheck(ws, { dirty: !!(saver && saver.pending), uploading: folioDirty.uploading, feat }) || { ok: true, items: [] } : null;
  const check = check0 && draftHeld
    ? { ok: false, items: [{ k: "draft", text: T.needDraft, block: true }, ...(check0.items || [])] } : check0;
  const confirmNow = async () => {
    if (!can) return;
    // 누르는 순간 다시 확인한다: 그사이 편집기가 초안을 남겼을 수 있다. 저장하지 않은 편집이 있는 초안은 지우지 않는다
    let held = false;
    try { held = await drafts.hasUnsaved(owner); } catch (e) { held = false; }
    if (held) { pokeSaverWatch(owner, saver); ctx.status(T.needDraft, true); return; }
    const w = ctx.write(KEYS.edit, (c) => confirmEdit(c, Date.now(), dev));
    if (!w.ok) { ctx.status(T.errWs, true); return; }
    drafts.del(owner, KEYS.edit).catch(() => {}).then(() => pokeSaverWatch(owner, saver));
  };
  const releaseNow = () => { if (can) { const w = ctx.write(KEYS.edit, (c) => releaseEdit(c, Date.now(), dev)); if (!w.ok) ctx.status(T.errWs, true); } };

  // 표기 문장
  const ph = edit ? buildPhrases({ steps: ws[KEYS.steps], notes: ws[KEYS.notes], edit: ws[KEYS.edit], ws, nowMs: Date.now() }) || { a: "", b: "", c: "" } : { a: "", b: "", c: "" };
  const effB = effPhrase(notes, "phScope", ph.b) || { text: "", source: "none" };
  const effC = effPhrase(notes, "phMaking", ph.c) || { text: "", source: "none" };
  const copyA = async () => {
    let ok = false;
    try { await navigator.clipboard.writeText(ph.a); ok = true; } catch (e) { ok = false; }
    setSendMsg({ text: ok ? T.phraseCopied : T.copyFail, err: !ok });
  };

  // 보내기 (§1.4)
  const plan = done ? sendPlan(ws) || null : null;
  const s6aKeys = plan && plan.s6a ? plan.s6a.keys || [] : [];
  const sendS6a = () => run(async () => {
    const pl = sendPlan(ctx.ws());
    const keys = (pl && pl.s6a && pl.s6a.keys) || [];
    if (!keys.length) return;
    const w0 = ctx.ws();
    const kept = S6A_KEYS.filter((k) => (/Img$/.test(k) ? hasRef(w0[k]) : filled(w0[k]))).length;   // cells the student had already written
    let filledN = 0;
    const text = (pl.s6a && pl.s6a.text) || {};
    for (const k of Object.keys(text)) {
      if (!keys.includes(k)) continue;
      const val = String(text[k] || "").replace(/\r?\n/g, " ").slice(0, SEND.s6a.textMax);
      const w = ctx.write(k, (cur) => (filled(cur) ? cur : val));
      if (w.ok && !w.same) filledN++;
    }
    const imgs = [];
    if (pl.s6a.before && keys.includes("s6a.beforeImg") && m.base) imgs.push(["s6a.beforeImg", m.base.ref]);
    if (pl.s6a.after && keys.includes("s6a.afterImg") && m.out) imgs.push(["s6a.afterImg", m.out.ref]);
    for (const [k, src] of imgs) if (await sendImage(k, src, SEND.s6a.px, SEND.s6a.maxChars)) filledN++;
    ctx.write(KEYS.edit, (c) => markSent(c, "s6a", Date.now(), dev));
    setSendMsg({ text: fmt(T.sendDone, { n: filledN }) + (kept > 0 ? " " + fmt(T.sendKept, { n: kept }) : ""), err: false });
  });
  const sendS6b = () => run(async () => {
    const cur = ctx.ws()["s6b.aiScope"];
    if (filled(cur)) { setSendMsg({ text: T.sendNone, err: false }); return; }
    const val = String(effB.text || "").replace(/\r?\n/g, " ").slice(0, SEND.s6a.textMax);
    if (!filled(val)) return;
    const w = ctx.write("s6b.aiScope", (c) => (filled(c) ? c : val));
    if (w.ok) { ctx.write(KEYS.edit, (c) => markSent(c, "s6b", Date.now(), dev)); setSendMsg({ text: T.sendScopeDone, err: false }); }
  });
  const sendS7x = () => run(async () => {
    if (!m.out) return;
    if (await sendImage("s7x.img", m.out.ref, SEND.s7x.px, SEND.s7x.maxChars)) {
      ctx.write(KEYS.edit, (c) => markSent(c, "s7x", Date.now(), dev));
      setSendMsg({ text: T.sendHeroDone, err: false });
    }
  });
  const run = (fn) => {
    if (!can || sending) return;
    setSending(true); setSendMsg({ text: "", err: false });
    folioDirty.uploading++; pokeSaverWatch();
    fn().catch(() => setSendMsg({ text: T.errWs, err: true })).finally(() => { folioDirty.uploading = Math.max(0, folioDirty.uploading - 1); setSending(false); ctx.status(""); });
  };
  // 사본을 새 문서로 올리고 비어 있을 때만 적는다. 다른 기기가 먼저 채웠으면 새 문서를 지운다 (§1.4 rules 3–4)
  const sendImage = async (k, srcRef, px, maxChars) => {
    if (hasRef(ctx.ws()[k])) return false;
    const src = await loadMedia(store, owner, srcRef);
    if (!src.ok) { setSendMsg({ text: T.imgUnreadable, err: true }); return false; }
    let enc;
    try { enc = await reencode(src.data, px, maxChars); } catch (e) { enc = null; }
    if (!enc || !enc.data) { setSendMsg({ text: T.errRejected, err: true }); return false; }
    const ms = Date.now();
    const ref = k + "." + ms;
    const r = await putOne(ctx, ref, enc.data, 1, 1);
    if (r !== "ok") { discard(ctx, [ref], r); setSendMsg({ text: putMsg(r), err: true }); return false; }
    const val = imgSendValue(ref, enc.w || 0, enc.h || 0, ms);
    const w = ctx.write(k, (cur) => (hasRef(cur) ? cur : val), { upload: true });
    if (!w.ok || w.same) { removeMedia(store, owner, ref); return false; }
    addExpect(owner, { key: k, refs: [ref], onMissing: () => setSendMsg({ text: T.sendLost, err: false }) });
    return true;
  };

  // 과정 목록 (§3.8 stage list)
  const sum = edit ? summarize(edit) || [] : [];
  const stageRows = STAGES.map((k, idx) => {
    const rec = sr[k] || {};
    const noteK = STAGE_NOTE[k];
    const hidden = !!(STAGE_FEAT[k] && !feat(STAGE_FEAT[k]));
    const rt = routedAll[k] || { n: 0 };
    const show = !!rec.ch || filled(notes[noteK]) || (hidden && rt.n > 0);
    const chips = [...new Set(sum.filter((x) => x && OPS[x.op] && OPS[x.op].st === k).map((x) => OP_TEXT[x.op]).filter(Boolean))];
    const snap = edit && Array.isArray(edit.snaps) ? edit.snaps.find((s) => s && s.s === idx) : null;
    return { k, idx, rec, noteK, hidden, show, chips, snap, routedN: rt.n || 0 };
  });
  const skipped = stageRows.filter((x) => !x.show).map((x) => STAGE_TEXT[x.k].name);
  const setNoteK = (k) => (text) => { if (can && !roNotes) ctx.write(KEYS.notes, (c) => setNote(c, k, text, nowS())); };

  const primary = !edit || !m.base ? T.editStart : done ? T.editView : T.editContinue;
  const needId = "pf-edit-need";
  const smallBase = bimg && Math.max(bimg.w || 0, bimg.h || 0) > 0 && Math.max(bimg.w || 0, bimg.h || 0) <= PRESETS.cand.maxPx;
  const before = m.base ? { ref: m.base.ref } : bimg ? { ref: bimg.ref } : null;
  const after = m.out ? { ref: m.out.ref } : null;
  const doneAt = done ? msTime(edit.done.at, fmtTime) : "";
  const logStages = edit ? STAGES.map((k) => ({ k, lines: opLines(edit, k) || [] })).filter((x) => x.lines.length) : [];

  return (
    <div className="pf-refine">
      <h3 tabIndex={-1} ref={headRef} className="pf-h">{T.tabRefine}</h3>
      <div className="pf-ba">
        <figure className="pf-ba-f">
          {before ? <Thumb store={store} owner={owner} refId={m.base ? m.base.ref : thumbOf(bimg)} alt={T.refineBefore} openView={openView} cls="ba" />
            : <span className="pf-img pf-img-none pf-ba-none" aria-hidden="true" />}
          <figcaption>{T.refineBefore}</figcaption>
        </figure>
        <figure className="pf-ba-f">
          {m.out ? <Thumb store={store} owner={owner} refId={(m.out.th && m.out.th.ref) || m.out.ref} alt={T.refineAfter} openView={openView} cls="ba" />
            : <span className="pf-img pf-img-none pf-ba-none"><span>{T.notExported}</span></span>}
          <figcaption>{T.refineAfter}</figcaption>
        </figure>
      </div>
      <div className="pf-row">
        {base ? <span className="pf-tag">{fmt(T.editBaseOf, { n: base.r + 1 })}</span> : null}
        <PfNav className="pf-link" onActivate={() => { setTab("rv"); setTimeout(() => { const el = document.getElementById("pf-rv-base"); if (el) el.scrollIntoView({ block: "center" }); }, 50); }}>{T.editChangeBase}</PfNav>
      </div>
      {smallBase ? <p className="pf-hint">{T.imgSmallBase}</p> : null}
      <div className="pf-row">
        <button type="button" ref={opener} className="btn" disabled={!base || locked || roEdit || (!done && !preview && openBusy)}
          aria-describedby={!base ? needId : !done && !preview && openBusy ? "pf-open-busy" : undefined}
          onClick={() => openEditor(done || preview)}>{primary}</button>
        {after || (edit && Array.isArray(edit.snaps) && edit.snaps.length) ? (
          <>
            <PfNav className="btn small ghost" onActivate={() => openView(T.compare, <CompareView before={before} after={after} store={store} owner={owner} />)}>{T.compare}</PfNav>
            <PfNav className="btn small ghost" onActivate={() => openView(T.processView, <ProcessSlides base={m.base} snaps={edit ? edit.snaps : []} store={store} owner={owner} />)}>{T.processView}</PfNav>
          </>
        ) : null}
      </div>
      {!base ? <p className="pf-hint" id={needId}>{T.editNeedBase}</p> : null}
      {base && !done && !preview && openBusy ? <p className="pf-hint" id="pf-open-busy" role="status">{T.openBusy}</p> : null}
      {changedBase && !done && !keepEdit ? (
        <div className="warn-note pf-warn" role="status">
          <span>{T.baseChanged}</span>
          <div className="pf-row">
            <PfConfirm label={T.rebase} className="btn small" ask={draftAside ? T.rebaseAskDraft : T.rebaseAsk} yes={T.rebase} onConfirm={rebase} disabled={!can || busy}
              describedBy={busy ? "pf-rebase-busy" : undefined} />
            <button type="button" className="btn small ghost" onClick={() => setKeepEdit(true)}>{T.keepEdit}</button>
          </div>
          {busy ? <span className="pf-q" id="pf-rebase-busy">{T.rebaseBusy}</span> : null}
        </div>
      ) : null}
      {structWarn ? <p className="warn-note pf-warn">{T.structWarn}</p> : null}

      {edit ? (
        <section className="pf-grp">
          <h4>{T.stageNotes}</h4>
          <ol className="pf-stages">
            {stageRows.filter((x) => x.show).map((x) => (
              <li key={x.k} className="pf-stage">
                <div className="pf-stage-h">
                  {x.snap ? <Thumb store={store} owner={owner} refId={x.snap.ref} alt={STAGE_TEXT[x.k].name} openView={openView} size={64} /> : null}
                  <b>{STAGE_TEXT[x.k].name}</b>
                  {x.hidden ? <span className="pf-chip">{T.hiddenStage}</span> : null}
                  {x.chips.map((c, i) => <span key={i} className="pf-chip">{c}</span>)}
                </div>
                <NoteField id={"pf-st-" + x.k} label={STAGE_TEXT[x.k].note} value={notes[x.noteK]} maxB={NOTE_CAP[x.noteK]} onChange={setNoteK(x.noteK)}
                  dataFk={KEYS.notes + "#" + x.noteK} readOnly={!!open || roNotes} />
                {x.k === "patch" && x.hidden ? (
                  <div className="pf-patch-hidden">
                    {["aiTool", "aiRegion", "aiPrompt"].map((k2) => (
                      <NoteField key={k2} id={"pf-st-" + k2} label={NOTE_LABEL[k2]} value={notes[k2]} maxB={NOTE_CAP[k2]} onChange={setNoteK(k2)}
                        dataFk={KEYS.notes + "#" + k2} readOnly={!!open || roNotes} rows={1} />
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
          {skipped.length ? <p className="pf-hint">{fmt(T.skippedStages, { list: skipped.join(T.listSep) })}</p> : null}
          {logStages.length ? (
            <details className="pf-log">
              <summary>{T.editLog}</summary>
              {logStages.map((x) => (
                <div key={x.k} className="pf-log-g"><b>{STAGE_TEXT[x.k].name}</b><ol>{x.lines.map((l, i) => <li key={i}>{l}</li>)}</ol></div>
              ))}
            </details>
          ) : null}
        </section>
      ) : null}

      {edit ? (
        <section className="pf-grp">
          <h4>{T.phraseTitle}</h4>
          {done ? (
            <>
              <PhraseBox label="phScope" eff={effB} />
              <PhraseBox label="phMaking" eff={effC} />
              <div className="pf-ph">
                <span className="pf-lb small">{T.phrasePreview}</span>
                <p className="pf-ro">{ph.a || T.missing}</p>
                <PfNav className="btn small ghost" onActivate={copyA}>{T.copyBtn}</PfNav>
              </div>
            </>
          ) : <p className="pf-hint">{T.phraseLater}</p>}
        </section>
      ) : null}

      {edit && m.base ? (
        <section className="pf-grp">
          <h4>{T.confirmTitle}</h4>
          {done ? (
            <div className="pf-row">
              <span className="pf-tag done"><span aria-hidden="true">✓ </span>{fmt(T.confirmedAt, { time: doneAt })}</span>
              <PfConfirm label={T.release} className="btn small ghost" ask={T.releaseAsk} yes={T.release} onConfirm={releaseNow} disabled={!can || roEdit} />
            </div>
          ) : (
            <>
              {check && !check.ok ? (
                <ul className="pf-pre" role="alert">{(check.items || []).filter((x) => x.block).map((x, i) => <li key={i}>{x.text}</li>)}</ul>
              ) : null}
              <PfConfirm label={T.confirmLabel} className="btn" ask={T.confirmAsk} yes={T.confirmYes} onConfirm={confirmNow}
                disabled={!can || roEdit || !check || !check.ok} />
            </>
          )}
        </section>
      ) : null}

      {done ? (
        <section className="pf-grp pf-send">
          <h4>{T.sendTitle}</h4>
          <div className="pf-send-r">
            <button type="button" className="btn small" disabled={!can || sending || busy || !s6aKeys.length} onClick={sendS6a}>{T.sendS6a}</button>
            <span className="pf-q">{s6aKeys.length ? fmt(T.sendFill, { list: s6aKeys.map((k) => SEND_KEY_LABEL[k] || k).join(T.listSep) }) : T.sendNone}</span>
          </div>
          <div className="pf-send-r">
            <button type="button" className="btn small" disabled={!can || sending || busy || filled(ws["s6b.aiScope"]) || !filled(effB.text)} onClick={sendS6b}>{T.sendS6b}</button>
            <span className="pf-q">{filled(ws["s6b.aiScope"]) ? T.sendNone : fmt(T.sendFill, { list: SEND_KEY_LABEL["s6b.aiScope"] })}</span>
          </div>
          <div className="pf-send-r">
            <button type="button" className="btn small" disabled={!can || sending || busy || !plan || !plan.s7x || !plan.s7x.ok} onClick={sendS7x}>{T.sendS7x}</button>
            <span className="pf-q">{plan && plan.s7x && plan.s7x.ok ? fmt(T.sendFill, { list: SEND_KEY_LABEL["s7x.img"] }) : hasRef(ws["s7x.img"]) ? T.sendNone : (plan && plan.s7x && plan.s7x.why) || ""}</span>
          </div>
          {sendMsg.text ? <p className={"pf-res" + (sendMsg.err ? " err" : "")} role={sendMsg.err ? "alert" : "status"}>{sendMsg.text}</p> : null}
        </section>
      ) : sendMsg.text ? <p className={"pf-res" + (sendMsg.err ? " err" : "")} role={sendMsg.err ? "alert" : "status"}>{sendMsg.text}</p> : null}

      {open ? (
        <FolioBoundary key={open.k} owner={open.ro ? null : owner}><PhotoEditor owner={owner} store={store} ws={ws} setField={ctx.setField} wsSaved={wsSaved} locked={locked}
          readOnly={open.ro || preview || roEdit} preview={preview} inspectItems={inspectItems || []} saver={saver || undefined}
          onClose={onClose} openerRef={opener}
          registerFlush={(fn) => { folioDirty.flush = fn || null; }}
          onDirty={(s) => { if (s) { folioDirty.current = !!s.current; folioDirty.unsaved = !!s.unsaved; } }} /></FolioBoundary>
      ) : null}
    </div>
  );
}
function PhraseBox({ label, eff }) {
  return (
    <div className="pf-ph">
      <span className="pf-lb small">{NOTE_LABEL[label]}{eff.source === "draft" ? <span className="pf-chip">{T.autoDraft}</span> : null}</span>
      <p className={"pf-ro" + (filled(eff.text) ? "" : " empty")}>{filled(eff.text) ? eff.text : T.missing}</p>
      {eff.stale ? <span className="pf-hint">{T.staleDraft}</span> : null}
    </div>
  );
}

/* ============================================================
   교사 열람과 채점 (§7.6)
   ============================================================ */
function FolioReadImpl({ f, ws: wsIn, owner, store, fmtTime, inspectItems, grade, onGrade, onGradeSave }) {
  throwIn("FolioRead");
  const ws = wsIn || {};
  const has = ws[KEYS.steps] != null && typeof ws[KEYS.steps] === "object";
  const steps = normSteps(ws[KEYS.steps]);
  const edit = normEdit(ws[KEYS.edit]);
  const notes = normNotes(ws[KEYS.notes]);
  const [viewer, setViewer] = useState(null);
  const [ed, setEd] = useState(false);
  const openView = (label, node) => setViewer({ label, node });
  const ind = indicators(ws[KEYS.steps]) || {};
  const fl = (() => { try { return flags(ws) || []; } catch (e) { return []; } })();
  const sum = edit ? summarize(edit) || [] : [];
  const gen = ROUNDS.filter((r) => roundState(steps, r) !== "skip" && steps[r].im.length > 0).length;
  const metrics = [fmt(T.mGen, { n: gen })];
  if (edit) {
    const L = (Array.isArray(edit.L) ? edit.L : []).filter(Boolean);
    if (L.length) {
      const by = {};
      L.forEach((x) => { const k = KINDS[x.k]; if (k) by[k] = (by[k] || 0) + 1; });
      const parts = ["ai", "px", "tr", "db", "adj", "flt", "txt", "ov"].filter((k) => by[k]).map((k) => KIND_LABEL[k] + " " + by[k]);
      metrics.push(fmt(T.mLayers, { n: L.length }) + (parts.length ? " (" + parts.join(" · ") + ")" : ""));
      const area = (kinds) => L.filter((x) => kinds.includes(KINDS[x.k]) && x.vis !== 0).reduce((a, x) => a + (x.cov || 0), 0);
      const hand = area(["px", "db"]), tr = area(["tr"]), ai = area(["ai"]);
      if (hand) metrics.push(fmt(T.mHandArea, { area: fmtArea(hand) }));
      if (tr) metrics.push(fmt(T.mTraceArea, { area: fmtArea(tr) }));
      if (ai) metrics.push(fmt(T.mAiArea, { area: fmtArea(ai) }));
    }
    const lv = sum.reduce((m, x) => Math.max(m, (x && x.l) || 0), 0);
    if (lv) metrics.push(fmt(T.mMaxLevel, { n: lv, name: LEVEL_LABEL[lv] || "" }));
    const secs = Object.values(edit.sr || {}).reduce((s, x) => s + ((x && x.d) || 0), 0);
    if (secs > 0) metrics.push(fmt(T.mMinutes, { n: Math.max(1, Math.round(secs / 60)) }));
    if (edit.done && edit.done.at > 0) metrics.push(fmt(T.mConfirmed, { time: msTime(edit.done.at, fmtTime) }) + (edit.done.un ? " " + fmt(T.mReleased, { n: edit.done.un }) : ""));
    else metrics.push(T.mNotConfirmed);
  }
  return (
    <div className="pf-read read-block" data-guard="off">
      <div className="rl">{f.label || T.title}</div>
      {!has ? <div className="rv empty">{T.missing}</div> : (
        <>
          <p className="pf-metrics" translate="no">{metrics.join(" · ")}</p>
          <ReadRow steps={steps} edit={edit} store={store} owner={owner} openView={openView} />
          {ROUNDS.map((r) => <ReadRound key={r} r={r} ws={ws} steps={steps} ind={ind[r] || {}} store={store} owner={owner} openView={openView} />)}
          <ReadReflect steps={steps} />
        </>
      )}
      <ReadGrade grade={grade} onGrade={onGrade} onGradeSave={onGradeSave} />
      {has && edit ? <ReadRefine ws={ws} steps={steps} edit={edit} notes={notes} sum={sum} store={store} owner={owner} openView={openView} fmtTime={fmtTime} inspectItems={inspectItems} onOpen={() => setEd(true)} /> : null}
      {has && fl.length ? (
        <section className="pf-rsec">
          <h4>{T.flagsTitle}</h4>
          <ul className="pf-flags">{fl.map((x, i) => <li key={i} className={"pf-flag " + (x.level || "info")}><b>{FLAG_LEVEL[x.level] || FLAG_LEVEL.info}</b> {x.text}</li>)}</ul>
        </section>
      ) : null}
      <PfViewer open={!!viewer} label={viewer ? viewer.label : ""} onClose={() => setViewer(null)}>{viewer ? viewer.node : null}</PfViewer>
      {ed ? <FolioBoundary owner={null}><PhotoEditor owner={owner} store={store} ws={ws} wsSaved locked={false} readOnly preview={owner === "preview"} inspectItems={inspectItems || []}
        onClose={() => setEd(false)} /></FolioBoundary> : null}
    </div>
  );
}
/** Teacher and demo read view, wrapped in FolioBoundary; null unless f.part === "steps". */
export function FolioRead(props) {
  if (!props.f || props.f.part !== "steps") return null;
  return <FolioBoundary owner={null}><FolioReadImpl {...props} /></FolioBoundary>;
}

function ReadRow({ steps, edit, store, owner, openView }) {
  const cells = ROUNDS.map((r) => {
    const rd = steps[r], img = rd.ci >= 0 ? rd.im[rd.ci] : null;
    const prev = prevRoundOf(steps, r);
    const chip = prev ? (steps[prev].nl === 7 ? T.chipDirection : (changedLines(steps, r) || []).map((i) => LINE_MARK[i]).join("")) : "";
    return { k: r, name: ROUND_LABEL[ROUNDS.indexOf(r)], ref: img ? thumbOf(img) : null, full: img ? img.ref : null, chip, skip: roundState(steps, r) === "skip" };
  });
  const out = edit && edit.m && edit.m.out;
  return (
    <ol className="pf-rrow">
      {cells.map((c, i) => (
        <React.Fragment key={c.k}>
          {i > 0 ? <li className="pf-arrow" aria-hidden="true"><span>→</span>{c.chip ? <span className="pf-arrow-chip">{c.chip}</span> : null}</li> : null}
          <li>
            {c.ref ? <Thumb store={store} owner={owner} refId={c.ref} alt={c.name} openView={openView} size={88} /> : <span className="pf-img pf-img-none" style={{ width: 88, height: 88 }} aria-hidden="true" />}
            <span>{c.name}{c.skip ? " · " + T.stateSkip : ""}{c.chip ? <span className="ax-sr"> {fmt(T.changedLinesList, { list: c.chip })}</span> : null}</span>
          </li>
        </React.Fragment>
      ))}
      {out ? (
        <>
          <li className="pf-arrow" aria-hidden="true"><span>→</span></li>
          <li><Thumb store={store} owner={owner} refId={(out.th && out.th.ref) || out.ref} alt={T.refineAfter} openView={openView} size={88} /><span>{T.refineAfter}</span></li>
        </>
      ) : null}
    </ol>
  );
}
function RV({ label, v, mark, children }) {
  return (
    <div className="pf-rf">
      <div className="pf-rl">{label}{mark ? <span className="pf-chip">{mark}</span> : null}</div>
      <div className="pf-rv">{children || (filled(v) ? v : <span className="pf-miss">{T.missing}</span>)}</div>
    </div>
  );
}
function ReadRound({ r, ws, steps, ind, store, owner, openView }) {
  const n = roundNo(r);
  const raw = steps[r];
  const e = effRound(ws[KEYS.steps], r) || raw;
  const inh = e.inh || {};
  const ch = r !== "ra" ? (changedLines(ws[KEYS.steps], r) || []) : [];
  const mk = (k) => (r !== "ra" && inh[k] ? T.chipSame : raw.cp & (CP[k] || 0) ? T.fromS5 : "");
  const codeTxt = (tbl, v) => (v > 0 ? tbl[v] : "");
  if (roundState(steps, r) === "skip") {
    return <section className="pf-rsec"><h4>{ROUND_LABEL[n - 1]} · {T.stateSkip}</h4><RV label={T.lbSk} v={raw.sk} /></section>;
  }
  const times = (ind.firstTimes || []).map((s, i) => (s > 0 ? (TI_LABEL[TI_ROUND[i]] || TI_ROUND[i]) + " " + mmss(s) : "")).filter(Boolean);
  const indLine = [
    ind.expFirst === true ? T.indExpFirst : ind.expFirst === false ? T.indExpAfter : "",
    r !== "ra" ? fmt(T.indChanged, { n: ind.changed || 0 }) : "",
    ind.carried ? T.indCarried : "",
    ind.causeLine ? T.indCauseLine : "",
    ind.help ? fmt(T.indHelp, { n: ind.help }) : "",
  ].filter(Boolean);
  return (
    <section className="pf-rsec">
      <h4>{ROUND_LABEL[n - 1]}</h4>
      <RV label={T.lbAim} v={e.aim} mark={r !== "ra" && inh.aim ? T.chipFromPrev : mk("aim")} />
      <RV label={T.lbExp} v={e.exp} mark={raw.el === 1 ? T.chipAfterImg : ""} />
      <RV label={T.lbTool} v={e.tool} mark={mk("tool")} />
      <RV label={T.lbPrompt}>
        <ol className="pf-rlines">
          {[...LINES, "po"].map((k, i) => (filled(e[k]) ? (
            <li key={k}><span className="pf-rl-m">{i < 6 ? LINE_LABEL[i] : T.lbPo}</span> {ch.includes(i) ? <mark>{e[k]}</mark> : e[k]}{mk(k) ? <span className="pf-chip">{mk(k)}</span> : null}</li>
          ) : null))}
        </ol>
        {ch.length ? <div className="pf-q">{fmt(T.changedLinesList, { list: ch.map((i) => LINE_MARK[i]).join(" ") })}</div> : null}
      </RV>
      <RV label={T.lbImages}>
        <div className="pf-rb-row">
          {raw.im.length ? raw.im.map((x, i) => (
            <figure key={x.ref} className="pf-fig"><Thumb store={store} owner={owner} refId={thumbOf(x)} alt={fmt(T.imgAlt, { n, i: i + 1 })} openView={openView} size={96} />
              {raw.ci === i ? <figcaption>{T.chosenImg}</figcaption> : null}</figure>
          )) : <span className="pf-miss">{T.missing}</span>}
        </div>
        {raw.from > 0 ? <div className="pf-q">{fmt(T.fromImport, { n: raw.from })}</div> : null}
      </RV>
      <RV label={T.lbCheck} v={raw.ck.some((x) => x > 0) ? CHECK_LABEL.map((lb, i) => lb + ": " + (raw.ck[i] === 1 ? T.checkOk : raw.ck[i] === 2 ? T.checkNo : "-")).join(" · ") : ""} />
      <RV label={T.lbSeen} v={raw.seen} />
      <RV label={T.lbUk} v={raw.uk ? UK_LABEL[raw.uk] + (filled(raw.un) ? ": " + raw.un : "") : ""} />
      {r !== "ra" ? <RV label={T.lbPw} v={codeTxt(PW_LABEL, raw.pw)} /> : null}
      <RV label={T.lbJd} v={filled(raw.jd) ? raw.jd + (raw.cz ? " (" + T.lbCause + ": " + CAUSE_LABEL[raw.cz] + ")" : "") : ""} mark={mk("jd")} />
      <RV label={T.lbNr} v={codeTxt(NR_LABEL, raw.nr)} />
      {r !== "rc"
        ? <RV label={T.lbNx} v={filled(raw.nx) ? (raw.nl ? (raw.nl === 7 ? T.chipDirection + (filled(raw.nw) ? ": " + raw.nw : "") : T.lbNl + " " + NL_LABEL[raw.nl]) + " · " : "") + raw.nx : ""} mark={mk("nx")} />
        : <RV label={T.lbHm} v={filled(raw.nx) || raw.hm ? (raw.hm ? HM_LABEL[raw.hm] + " · " : "") + raw.nx : ""} />}
      {indLine.length || times.length ? (
        <p className="pf-ind">{indLine.join(" · ")}{times.length ? (indLine.length ? " · " : "") + T.indFirstTimes + " " + times.join(", ") : ""}</p>
      ) : null}
    </section>
  );
}
function ReadReflect({ steps }) {
  const rv = steps.rv;
  const rn = (v) => (v > 0 ? ROUND_LABEL[v - 1] : "-");
  return (
    <section className="pf-rsec">
      <h4>{T.rvTitle}</h4>
      <RV label={T.rvGroupNear} v={rv.near || rv.far || filled(rv.look) ? rn(rv.near) + " / " + rn(rv.far) + (filled(rv.look) ? ": " + rv.look : "") : ""} />
      <RV label={T.rvDPr} v={rv.dPr} />
      <RV label={T.rvDAi} v={rv.dAi} />
      <RV label={T.rvDHand} v={rv.dHand} />
      <RV label={T.rvBig} v={rv.big} />
      <RV label={T.rvUse} v={rv.use} />
      <RV label={T.rvDrift} v={rv.drift} />
      <RV label={T.rvStuck} v={rv.stuck} />
      <RV label={T.rvGroupBase} v={rv.base >= 0 ? ROUND_LABEL[rv.base] + (filled(rv.baseWhy) ? ": " + rv.baseWhy : "") : T.rvDefault} />
    </section>
  );
}
function ReadGrade({ grade, onGrade, onGradeSave }) {
  const g = (grade && typeof grade === "object" && grade.folio && typeof grade.folio === "object") ? grade.folio : {};
  const edit = !!onGrade;
  const set = (path, v) => {
    if (!onGrade) return;
    const next = JSON.parse(JSON.stringify(g || {}));
    if (path.length === 2) {
      const o = { ...(next[path[0]] || {}) };
      if (v < 0) delete o[path[1]]; else o[path[1]] = v;
      if (Object.keys(o).length) next[path[0]] = o; else delete next[path[0]];
    } else if (v < 0) delete next[path[0]]; else next[path[0]] = v;
    onGrade({ ...(grade || {}), folio: next });
  };
  const val = (path) => { const x = path.length === 2 ? (g[path[0]] || {})[path[1]] : g[path[0]]; return typeof x === "number" ? x : -1; };
  const crit = [["o", T.gradeObs], ["j", T.gradeJudge], ["l", T.gradeLink]];
  const total = ROUNDS.reduce((s, r) => s + crit.reduce((t, [c]) => t + Math.max(0, val([r, c])), 0), 0) + Math.max(0, val(["src"]));
  const any = ROUNDS.some((r) => crit.some(([c]) => val([r, c]) >= 0)) || val(["src"]) >= 0;
  if (!edit && !any) return null;
  const cell = (path, label) => (edit
    ? <Seg label={label} options={["0", "1", "2"]} base={0} none={-1} value={val(path)} onChange={(v) => set(path, v)} />
    : <span className="pf-score">{val(path) >= 0 ? val(path) : "-"}</span>);
  return (
    <section className="pf-rsec pf-grade">
      <h4>{T.gradeTitle}</h4>
      <p className="pf-q">{fmt(T.gradeRubric, { list: T.rubricRows })}</p>
      <table className="pf-tbl pf-gtbl">
        <thead><tr><th scope="col" />{crit.map(([c, lb]) => <th key={c} scope="col">{lb}</th>)}</tr></thead>
        <tbody>
          {ROUNDS.map((r, i) => (
            <tr key={r}><th scope="row">{ROUND_LABEL[i]}</th>{crit.map(([c, lb]) => <td key={c}>{cell([r, c], ROUND_LABEL[i] + " " + lb)}</td>)}</tr>
          ))}
          <tr><th scope="row">{T.rvTitle}</th><td colSpan={3}><span className="pf-gsrc">{T.gradeSrc}</span> {cell(["src"], T.gradeSrc)}</td></tr>
        </tbody>
      </table>
      <p className="pf-q">{fmt(T.gradeTotal, { n: total })} · {T.gradeNote}</p>
      {edit && onGradeSave ? <button type="button" className="btn small" onClick={() => onGradeSave()}>{T.gradeSave}</button> : null}
    </section>
  );
}
function ReadRefine({ ws, steps, edit, notes, sum, store, owner, openView, fmtTime, inspectItems, onOpen }) {
  const m = edit.m || {};
  const insp = ws["s5c.inspect"] && typeof ws["s5c.inspect"] === "object" ? ws["s5c.inspect"] : {};
  const route = edit.route || { s: [], m: [], o: [] };
  const ph = buildPhrases({ steps: ws[KEYS.steps], notes: ws[KEYS.notes], edit: ws[KEYS.edit], ws, nowMs: Date.now() }) || { a: "", b: "", c: "" };
  const effB = effPhrase(notes, "phScope", ph.b) || { text: "", source: "none" };
  const effC = effPhrase(notes, "phMaking", ph.c) || { text: "", source: "none" };
  const how = (eff, k) => (eff.source === "draft" ? T.phDraftAsIs : eff.source === "own" ? (notes.pd && notes.pd[k] ? T.phDraftEdited : T.phOwn) : T.missing);
  const gaps = (() => { try { return phraseGaps(edit, effB.text, { steps: ws[KEYS.steps], notes: ws[KEYS.notes] }) || []; } catch (e) { return []; } })();
  const before = m.base ? { ref: m.base.ref } : null, after = m.out ? { ref: m.out.ref } : null;
  // 실제로 쓴 과정: 그 항목의 방법이 가리키는 과정 가운데 바꾼 기록이 있는 것 + 그 항목에 이어 둔 레이어의 종류
  const usedBy = (idx) => {
    const item = ITEMS[idx], meth = route.m && route.m[idx];
    const stages = (meth && ((ROUTE_ITEM[item] || {})[meth] || ROUTE[meth])) || [];
    const done = stages.filter((st) => edit.sr && edit.sr[st] && edit.sr[st].ch).map((st) => STAGE_TEXT[st].name);
    const L = Array.isArray(edit.L) ? edit.L : [];
    const ks = L.filter((x) => x && x.it === idx + 1).map((x) => KIND_LABEL[KINDS[x.k]] || "").filter(Boolean);
    return [...new Set([...done, ...ks])].join(", ");
  };
  const log = (Array.isArray(edit.log) ? edit.log : []).filter(Boolean).slice().sort((a, b) => (b.l || 0) - (a.l || 0) || (a.w || 0) - (b.w || 0) || (a.t || 0) - (b.t || 0));
  const ev = Array.isArray(edit.ev) ? edit.ev : [];
  return (
    <section className="pf-rsec">
      <h4>{T.tabRefine}</h4>
      <div className="pf-row">
        {before ? <PfNav className="btn small ghost" onActivate={() => openView(T.compare, <CompareView before={before} after={after} store={store} owner={owner} />)}>{T.compare}</PfNav> : null}
        {before ? <PfNav className="btn small ghost" onActivate={() => openView(T.processView, <ProcessSlides base={m.base} snaps={edit.snaps} store={store} owner={owner} />)}>{T.processView}</PfNav> : null}
        {before && feat("editor") ? <button type="button" className="btn small ghost" onClick={onOpen}>{T.openEditor}</button> : null}
      </div>
      <table className="pf-tbl pf-diag">
        <thead><tr><th scope="col">{T.diagItem}</th><th scope="col">{T.diagS5}</th><th scope="col">{T.diagNow}</th><th scope="col">{T.diagMethod}</th><th scope="col">{T.diagUsed}</th><th scope="col">{T.diagWhy}</th></tr></thead>
        <tbody>{(inspectItems || []).map((it) => {
          const idx = ITEMS.indexOf(it.k);
          const s5 = insp[it.k] && insp[it.k].status;
          const now = route.s && route.s[idx];
          const meth = route.m && route.m[idx];
          return (
            <tr key={it.k}>
              <th scope="row">{it.label}</th>
              <td>{s5 === CORE_TEXT.s5cNo ? T.checkNo : s5 ? T.checkOk : "-"}</td>
              <td>{now === 2 ? T.checkNo : now === 1 ? T.checkOk : "-"}</td>
              <td>{meth ? METHOD_LABEL[meth] : "-"}</td>
              <td>{usedBy(idx) || "-"}</td>
              <td>{filled(notes[KP[it.k]]) ? notes[KP[it.k]] : (insp[it.k] && filled(insp[it.k].note) ? insp[it.k].note : "-")}</td>
            </tr>
          );
        })}</tbody>
      </table>
      <div className="pf-rnotes">
        {STAGES.map((k) => {
          const rec = (edit.sr || {})[k] || {};
          const nk = STAGE_NOTE[k];
          if (!rec.ch && !filled(notes[nk]) && !rec.d) return null;
          const snap = Array.isArray(edit.snaps) ? edit.snaps.find((s) => s && s.s === STAGES.indexOf(k)) : null;
          const lines = opLines(edit, k, { audience: "teacher" }) || [];
          return (
            <RV key={k} label={STAGE_TEXT[k].name} mark={rec.d ? fmt(T.stageTime, { n: Math.max(1, Math.round(rec.d / 60)) }) : ""}>
              <div className="pf-rstage">
                {snap ? <Thumb store={store} owner={owner} refId={snap.ref} alt={STAGE_TEXT[k].name} openView={openView} size={64} /> : null}
                <div>
                  {filled(notes[nk]) ? notes[nk] : <span className="pf-miss">{T.missing}</span>}
                  {lines.length ? <ol className="pf-oplines">{lines.map((l, i) => <li key={i}>{l}</li>)}</ol> : null}
                </div>
              </div>
            </RV>
          );
        })}
      </div>
      {sum.length ? (
        <RV label={T.sumTitle}>
          <ul className="pf-oplines">{[...sum].filter(Boolean).sort((a, b) => (b.l || 0) - (a.l || 0) || (b.a || 0) - (a.a || 0)).map((x, i) => (
            <li key={i}>{OP_TEXT[x.op] || x.op}{x.a > 0 ? " · " + fmtArea(x.a) : ""} · <span title={LEVEL_LABEL[x.l] || ""}>{fmt(T.levelTag, { n: x.l || 0 })}</span> · {fmt(T.wppTag, { w: WPP_LABEL[x.w] || "" })}</li>
          ))}</ul>
        </RV>
      ) : null}
      {log.length ? (
        <div className="pf-rblock">
          <div className="pf-rl">{T.editLog}</div>
          <table className="pf-tbl pf-logt">
            <thead><tr><th scope="col">{T.logLevel}</th><th scope="col">{T.logWpp}</th>{T.logHead.split(" · ").map((x) => <th key={x} scope="col">{x}</th>)}</tr></thead>
            <tbody>{log.map((x, i) => (
              <tr key={i}>
                <td>{x.l ? fmt(T.levelTag, { n: x.l }) : "-"}</td>
                <td>{WPP_LABEL[x.w] || "-"}</td>
                <td>{STAGES[x.s] ? STAGE_TEXT[STAGES[x.s]].name : "-"}</td>
                <td>{OP_TEXT[x.o] || x.o}</td>
                <td>{x.n || 0}</td>
                <td>{x.a > 0 ? fmtArea(x.a) : "-"}</td>
                <td>{x.p || "-"}</td>
                <td>{x.t ? msTime(x.t * 1000, fmtTime) : "-"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : null}
      {ev.length ? (
        <RV label={T.events}>
          <ul className="pf-oplines">{ev.map((x, i) => <li key={i}>{(x.o === EV.done ? T.evDone : x.o === EV.unlock ? T.evUnlock : T.evRebase) + " " + msTime((x.t || 0) * 1000, fmtTime)}</li>)}</ul>
        </RV>
      ) : null}
      <div className="pf-rblock">
        <div className="pf-rl">{T.phraseCompare}</div>
        <RV label={NOTE_LABEL.phScope} mark={how(effB, "phScope")}>
          {filled(effB.text) ? effB.text : <span className="pf-miss">{T.missing}</span>}
          <span className="pf-q">{T.autoDraft}: {ph.b || T.missing}</span>
        </RV>
        <RV label={NOTE_LABEL.phMaking} mark={how(effC, "phMaking")}>
          {filled(effC.text) ? effC.text : <span className="pf-miss">{T.missing}</span>}
          <span className="pf-q">{T.autoDraft}: {ph.c || T.missing}</span>
        </RV>
        <RV label={SEND_KEY_LABEL["s6b.aiScope"]}>
          {filled(ws["s6b.aiScope"]) ? ws["s6b.aiScope"] : <span className="pf-miss">{T.missing}</span>}
          {filled(ws["s6b.aiLevel"]) ? <span className="pf-q">{fmt(T.aiLevelNote, { v: ws["s6b.aiLevel"] })}</span> : null}
        </RV>
        {gaps.length ? <ul className="pf-oplines">{gaps.map((g, i) => <li key={i}>{g}</li>)}</ul> : null}
      </div>
    </section>
  );
}

/* ---------- 스타일 ---------- */
const PF_CSS = `
.pf{min-width:0}
.pf h3.pf-h{font-size:17px;font-weight:700;margin:0;outline-offset:3px}
.pf h4,.pf-read h4{font-size:13.5px;font-weight:700;margin:0 0 8px;color:var(--seal)}
.pf-strip{list-style:none;margin:0 0 12px;padding:0 0 4px;display:flex;align-items:stretch;gap:6px;overflow-x:auto;overscroll-behavior-x:contain;
  user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
.pf-tab-li{flex:1 1 0;min-width:0;display:flex}
.pf-tab{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 5px;border:1px solid var(--line);background:#fff;min-width:96px}
.pf-tab.on{border-color:var(--ink);box-shadow:inset 0 -3px 0 var(--ink)}
.pf-tab-img{width:100%;max-width:112px;aspect-ratio:4/3;height:auto;display:block;object-fit:cover;background:var(--card2)}
.pf-tab-empty{border:1px dashed var(--line);background:transparent}
.pf-tab-glyph{display:flex;align-items:center;justify-content:center;font-size:26px;color:var(--sub);background:var(--card2)}
.pf-tab-name{font-size:13px;font-weight:600;white-space:nowrap}
.pf-tab-st{font-size:11px;color:var(--sub);white-space:nowrap}
.pf-tab-st.done{color:var(--patina)}
.pf-tab-st.part{color:var(--amber)}
.pf-arrow{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;color:var(--sub);font-size:14px;min-width:22px}
.pf-arrow-chip{font-size:11px;border:1px solid var(--line);background:var(--card2);padding:0 4px;color:var(--ink);white-space:nowrap}
.pf-panel{min-width:0}
.pf-info{font-size:13px;color:var(--sub);margin:0 0 8px}
.pf-rhead{display:flex;align-items:center;gap:10px;justify-content:space-between;margin-bottom:8px}
.pf-help{white-space:nowrap}
.pf-round.wide{display:grid;grid-template-columns:minmax(0,1fr) 240px;gap:18px;align-items:start}
.pf-main{min-width:0}
.pf-refcol{position:sticky;top:calc(var(--sv-top,60px) + 8px);max-height:calc(100dvh - var(--sv-top,60px) - 24px);overflow:auto;border-left:1px solid var(--line2);padding-left:12px}
.pf-refcol-h{font-size:12px;font-weight:700;color:var(--sub);margin-bottom:6px}
.pf-refd{border:1px solid var(--line2);background:var(--card2);padding:6px 10px;margin:0 0 12px}
.pf-refd > summary{cursor:pointer;font-size:13px;font-weight:600}
.pf-refb{display:flex;flex-direction:column;gap:12px}
.pf-refb.compact{gap:10px;font-size:13px}
.pf-refb.compact h4{font-size:12.5px;color:var(--sub)}
.pf-rb{min-width:0}
.pf-rb-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}
.pf-rb-list li{display:flex;flex-wrap:wrap;gap:4px 6px;align-items:baseline}
.pf-rb-note{flex:1 1 100%;color:var(--sub);font-size:12.5px}
.pf-rb-row{display:flex;flex-wrap:wrap;gap:8px;align-items:flex-start}
.pf-memo{margin:4px 0 0;font-size:13px;white-space:pre-wrap;word-break:keep-all;overflow-wrap:anywhere}
.pf-memo.clamp{display:-webkit-box;-webkit-box-orient:vertical;overflow:hidden}
.pf-link{display:inline-block;font-size:12.5px;color:var(--sub);text-decoration:underline;padding:2px 0}
.pf-dl{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;margin:0;font-size:13px}
.pf-dl dt{color:var(--sub)}.pf-dl dd{margin:0}
.pf-thumb{display:inline-block;line-height:0;border:1px solid var(--line)}
.pf-thumb .pf-img{display:block}
.pf-fig{margin:0;display:flex;flex-direction:column;gap:2px;font-size:12px;color:var(--sub);max-width:120px}
.pf-empty{font-size:13px;color:var(--sub)}
.pf-chip{display:inline-block;font-size:11px;line-height:1.5;padding:0 6px;border:1px solid var(--line);background:var(--card2);color:var(--sub);white-space:nowrap}
.pf-chip.inh{border-style:dashed}
.pf-chip.ch{border-color:var(--ink);color:var(--ink);font-weight:600}
.pf-chip.after{border-color:var(--amber);color:#7a5f30;background:#fff}
.pf-chip.before{border-color:var(--patina);color:var(--patina);background:#fff}
.pf-file-h{position:absolute;width:1px;height:1px;opacity:0;overflow:hidden;pointer-events:none}
.pf .btn:disabled{background:var(--card2);color:#6E6C62;border:1px dashed var(--line);cursor:not-allowed}
.pf .btn.ghost:disabled{background:transparent}
.pf-rv-imgs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:0 0 16px}
.pf-rv-fig{margin:0;display:flex;flex-direction:column;gap:3px;font-size:12.5px;color:var(--sub);min-width:0}
.pf-rv-img{display:block;position:relative;overflow:hidden;aspect-ratio:4/3;width:100%;background:var(--card2);line-height:0;border:1px solid var(--line)}
.pf-rv-img .pf-img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
.pf-strip[data-more="r"]{-webkit-mask-image:linear-gradient(to right,#000 calc(100% - 40px),transparent);mask-image:linear-gradient(to right,#000 calc(100% - 40px),transparent)}
.pf-strip[data-more="l"]{-webkit-mask-image:linear-gradient(to left,#000 calc(100% - 40px),transparent);mask-image:linear-gradient(to left,#000 calc(100% - 40px),transparent)}
.pf-strip[data-more="lr"]{-webkit-mask-image:linear-gradient(to right,transparent,#000 40px,#000 calc(100% - 40px),transparent);mask-image:linear-gradient(to right,transparent,#000 40px,#000 calc(100% - 40px),transparent)}
@media (pointer:coarse){.pf-pick,.pf-up.small,.pf .btn.small,.pf-del,.pf-rep,.pf-tab{min-height:44px}.pf-tile-bar{gap:6px}}
.pf-f{margin:0 0 14px;min-width:0}
.pf-f-h{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:3px}
.pf-opt{font-weight:400;color:var(--sub);font-size:12.5px}
.pf-lb.small{font-size:13px;font-weight:600;margin-top:6px}
.pf-q.inline{display:inline;margin-left:6px}
.pf-q.lock{color:var(--amber)}
.pf-sub{margin-top:6px;display:flex;flex-direction:column;gap:3px}
.pf-sub.first{margin:0 0 6px}
.pf-fs{border:0;margin:0;padding:0;min-width:0}
.pf-form.off .pf-fs .pf-ta,.pf-form.off .pf-fs .pf-in,.pf-form.off .pf-fs .pf-seg button,.pf-form.off .pf-up{border-style:dashed}
.pf-fs:disabled .pf-ta,.pf-fs:disabled .pf-in{background:transparent}
.pf-start{display:flex;flex-direction:column;gap:10px;padding:10px;border:1px dashed var(--line);margin-bottom:14px;background:#fff}
.pf-start > .btn{align-self:flex-start}
.pf-prompt{border-left:3px solid var(--line2);padding-left:10px}
.pf-line{display:grid;grid-template-columns:120px minmax(0,1fr);gap:4px 8px;align-items:start;margin-bottom:4px}
.pf-line-l{font-size:13px;padding-top:7px;color:var(--ink)}
.pf-line-c{display:flex;flex-direction:column;gap:2px;align-items:flex-start;min-width:0}
.pf-line-c .pf-ta{min-height:0;resize:none;overflow:hidden}
.pf-ta.inh{color:#5b5a52;border-style:dashed}
.pf-ta.changed{border-color:var(--ink);border-width:1px 1px 1px 3px}
.pf-copy{margin-left:auto}
.pf-alert{margin:6px 0 0;font-size:13px;color:var(--seal)}
.pf-hint{margin:6px 0 0;font-size:13px;color:var(--sub)}
.pf-res{margin:6px 0;font-size:13px;color:var(--patina)}
.pf-res.err{color:var(--seal)}
.pf-res-l{display:block;color:var(--seal)}
.pf-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:8px;max-width:500px}
.pf-tile{border:1px solid var(--line);background:#fff;display:flex;flex-direction:column;min-width:0}
.pf-tile.on{border:2px solid var(--ink)}
.pf-tile-img{line-height:0;position:relative;overflow:hidden;aspect-ratio:4/3;background:var(--card2)}
.pf-tile-img .pf-img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
.pf-tile-bar{display:flex;flex-wrap:wrap;gap:4px;padding:5px;align-items:center}
.pf-pick{border:1px solid var(--line);background:#fff;font-size:12px;padding:3px 7px;cursor:pointer;font-family:var(--sans);color:var(--ink);min-height:30px}
.pf-pick.on{background:var(--ink);color:var(--card);border-color:var(--ink)}
.pf-up{position:relative;display:inline-flex;align-items:center;justify-content:center;padding:8px 14px;border:1px solid var(--ink);background:var(--ink);color:var(--card);font-size:14px;cursor:pointer;min-height:36px}
.pf-up.small{padding:3px 8px;font-size:12px;background:#fff;color:var(--ink);border-color:var(--line);min-height:30px}
.pf-up.dis{opacity:.55;cursor:not-allowed;border-style:dashed}
.pf-up:focus-within{outline:2px solid var(--ink);outline-offset:2px}
.pf-file{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;font-size:0}
.pf-file:disabled{cursor:not-allowed}
.pf-del{padding:3px 8px}
.pf-ck{display:flex;flex-direction:column;gap:4px}
.pf-ck-row{display:flex;flex-wrap:wrap;align-items:center;gap:4px 10px}
.pf-ck-l{font-size:13px;min-width:170px}
.pf-ckd > summary{cursor:pointer;list-style-position:outside}
.pf-ckd[open] > summary{margin-bottom:4px}
.pf-mm{margin:0 0 14px;border:1px solid var(--line2);background:#fff;padding:8px}
.pf-mm-t{font-size:13px;font-weight:700;margin-bottom:4px}
.pf-tbl{width:100%;border-collapse:collapse;font-size:12.5px}
.pf-tbl th,.pf-tbl td{border:1px solid var(--line2);padding:4px 6px;text-align:left;vertical-align:top}
.pf-tbl thead th{background:var(--card2);font-weight:600}
.pf-skip{margin:6px 0 10px;padding-top:10px;border-top:1px dashed var(--line2)}
.pf-foot{display:flex;justify-content:flex-end;margin-top:10px}
.pf-row{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;margin:6px 0}
.pf-check{display:flex;align-items:center;gap:6px;font-size:13px;margin:6px 0}
.pf-imp{border:1px solid var(--line2);background:#fff;padding:6px 10px;margin:12px 0}
.pf-imp > summary{cursor:pointer;font-size:14px;font-weight:600}
.pf-imp-body{padding-top:8px}
.pf-imp-row{display:flex;flex-direction:column;gap:3px;margin-bottom:8px}
.pf-grp{margin:0 0 16px;padding-top:10px;border-top:1px solid var(--line2)}
.pf-grp:first-of-type{border-top:0;padding-top:0}
.pf-tag{font-size:13px;padding:2px 8px;border:1px solid var(--line);background:#fff}
.pf-tag.done{border-color:var(--patina);color:var(--patina)}
.pf-warn{display:flex;flex-direction:column;gap:6px}
.pf-ba{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px}
.pf-ba-f{margin:0;display:flex;flex-direction:column;gap:3px;font-size:12.5px;color:var(--sub)}
.pf-ba-f .pf-img,.pf-ba-none{width:200px;height:150px;object-fit:contain}
.pf-stages{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.pf-stage{border:1px solid var(--line2);background:#fff;padding:8px}
.pf-stage-h{display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:6px}
.pf-log{margin-top:8px}
.pf-log > summary{cursor:pointer;font-size:13px;font-weight:600}
.pf-log-g{margin:6px 0;font-size:13px}
.pf-log-g ol,.pf-oplines{margin:2px 0 0 18px;padding:0;font-size:12.5px}
.pf-ph{display:flex;flex-direction:column;gap:3px;margin-bottom:8px}
.pf-pre{margin:0 0 8px 18px;font-size:13px;color:var(--seal)}
.pf-send-r{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin-bottom:8px}
.pf-read .pf-metrics{font-size:12.5px;color:var(--sub);margin:4px 0 8px}
.pf-rrow{list-style:none;margin:0 0 10px;padding:0;display:flex;flex-wrap:wrap;gap:10px}
.pf-rrow li{display:flex;flex-direction:column;align-items:flex-start;gap:3px;font-size:12px;color:var(--sub)}
.pf-rrow li.pf-arrow{align-self:center;align-items:center}
.pf-rsec{margin:12px 0;padding-top:8px;border-top:1px solid var(--line2)}
.pf-rf{display:grid;grid-template-columns:170px minmax(0,1fr);gap:2px 12px;padding:6px 0;border-top:1px dotted var(--line2)}
.pf-rl{font-size:12.5px;color:var(--sub);display:flex;gap:4px 6px;align-items:flex-start;flex-wrap:wrap}
.pf-rv{font-size:14px;white-space:pre-wrap;word-break:keep-all;overflow-wrap:anywhere;min-width:0}
.pf-miss{color:var(--sub)}
.pf-rstage{display:flex;gap:8px;align-items:flex-start}
.pf-rblock{margin:8px 0;padding-top:6px;border-top:1px dotted var(--line2)}
.pf-rv .pf-q{display:block;margin-top:2px}
.pf-rlines{margin:0;padding:0 0 0 2px;list-style:none;font-size:13.5px}
.pf-rl-m{color:var(--sub);font-size:12px}
.pf-rlines mark{background:#F4E7B8}
.pf-ind{font-size:12px;color:var(--sub);background:var(--card2);padding:4px 8px;margin:4px 0 0}
.pf-gtbl td{min-width:110px}
.pf-gsrc{font-size:12px;color:var(--sub);margin-right:6px}
.pf-score{font-family:var(--mono)}
.pf-flags{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:3px;font-size:13px}
.pf-flag b{font-size:11px;border:1px solid var(--line);padding:0 5px;margin-right:4px;font-weight:600}
.pf-flag.warn b{border-color:var(--seal);color:var(--seal)}
.pf-flag.good b{border-color:var(--patina);color:var(--patina)}
.pf-diag{margin:6px 0 10px}
@media (max-width:1023px){.pf-tab-img{max-width:clamp(80px,12vw,112px)}}
@media (max-width:640px){
  .pf{padding:8px}
  .pf-strip{scroll-snap-type:x mandatory}
  .pf-tab-li{flex:0 0 auto;scroll-snap-align:start}
  .pf-tab{min-width:84px}
  .pf-tab-img{width:72px;max-width:72px}
  .pf-line{grid-template-columns:1fr}
  .pf-line-l{padding-top:0}
  .pf-grid{max-width:none}
  .pf-start > .btn,.pf-up:not(.small){width:100%}
  .pf-ck-l{min-width:0;flex:1 1 100%}
  .pf-ba-f .pf-img,.pf-ba-none{width:150px;height:112px}
  .pf-diag,.pf-logt{display:block;overflow-x:auto}
  .pf-rf{grid-template-columns:1fr}
}
`;
/** <style>{FOLIO_UI_CSS + PF_CSS + PE_CSS + PE_PANELS_CSS}</style> */
export function PortfolioStyle() {
  return <style>{FOLIO_UI_CSS + PF_CSS + PE_CSS + PE_PANELS_CSS}</style>;
}
