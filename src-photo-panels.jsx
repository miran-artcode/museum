/* ============================================================
   이미지 다듬기 편집기 패널: 과정별 패널(점검·부분 수정·자르기·빛과 톤·손으로 고치기·스케일 바와 표식·비교와 확정),
   레이어·속성·레벨·곡선·작업 내역·정보·비교 패널 (spec §4.1–§4.13, §5.4 src-photo-panels.jsx)
   담당 D. 화면 문구는 src-photo-text.mjs와 src-portfolio-text.mjs에서 가져온다(이 파일에 한글 문자열 없음).
   · 패널은 §5.4의 props에 더해 껍데기의 도우미 묶음 api를 받는다(contract-log WP4/WP5 D2).
   · 매개변수는 PSPEC 단위의 정수로 다루고, 기본값과 같은 키는 저장하지 않는다(pruneP). 확정 전에 pOk로 확인한다.
   · 슬라이더는 기본 <input type=range>: 움직이는 동안 미리 보기, 놓을 때(포인터 떼기·움직이는 키 떼기) 작업 내역 한 줄.
   ============================================================ */
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { NoteField, PfViewer, ProcessSlides } from "./src-folio-ui.jsx";
import {
  STAGE_NOTE, NOTE_CAP, STAGES, ITEMS, KP, ROUTE, ROUTE_ITEM, LIMITS, KINDS, TCODE, BLENDS, ZONE, KEYS, pOk, feat, CLASS_DEFAULTS, OUT,
} from "./src-folio-schema.mjs";
import {
  STAGE_TEXT, METHOD_LABEL, HM_LABEL, ITEM_LABEL, CELL_LABEL, RM_LABEL, NOTE_LABEL, ADJ_TEXT, FLT_TEXT, MARK_TEXT, KIND_LABEL, OP_TEXT, T, fmt, josa,
} from "./src-portfolio-text.mjs";
import { PANEL_TEXT as P, OPT_TEXT as O, TOOL_TEXT, BLEND_LABEL, ADJ_PS, tooltip, histLabel } from "./src-photo-text.mjs";
import {
  effRound, opLines, buildPhrases, effPhrase, phraseGaps, finalizeCheck, fmtArea, fmtPrint, acceptDraft, copyDraft, confirmEdit, releaseEdit,
  totalUpd, normEdit, fnv32,
} from "./src-portfolio-core.mjs";
import { autoLevels, greyPointCurves, curveLut, objectBox, cropForRatio, lightLinesMeet, alignSearch, diffMask, backgroundMask, histogram as pxHistogram } from "./src-photo-px.mjs";
import { imageDims, decodeImage } from "./src-photo-io.mjs";
import { suggestBarCm, markBox } from "./src-photo-marks.mjs";
import { prepareImage, imgErrText } from "./src-media-img.js";
import { imgPreset } from "./src-portfolio-text.mjs";

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isPlain = (o) => !!o && typeof o === "object" && !Array.isArray(o);
const eqArr = (a, b) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => x === b[i]);
const nowMs = () => Date.now();

/* ---------- parameters: defaults, identities, pruning (§2.4, §4.8, §4.9, §4.11) ---------- */
/** a missing key means this default (shared reading with B's adjFn/adjLuts/markBox; contract-log D7) */
export const DEF = {
  adj: {
    bc: { b: 0, c: 0, lg: 0 }, lv: {}, cv: { md: 0 }, ex: { e: 0, o: 0, g: 100 }, hs: {}, vb: { v: 0, s: 0 }, cb: { pl: 1 },
    pf: { c: [236, 138, 0], d: 25, pl: 1 }, gp: { tg: 0, k: 100 }, bw: { w: [40, 60, 40, 60, 20, 80] },
  },
  flt: { usm: { a: 80, r: 10, th: 2 }, gb: { r: 20 }, nz: { a: 30, gs: 1, mo: 1 }, vg: { a: 0, m: 50 }, shd: { sa: 35, ha: 0, r: 30 } },
  ov: { sb: { o: 0, ps: 0, mm: 0, lb: 0, au: 1 }, gs: { o: 0, ps: 0 }, cc: { o: 0, ps: 0 }, tg: { sz: 40 } },
  txt: { _: { fn: 0, sz: 40, wt: 0, al: 0, c: [0, 0, 0] } },
};
const LV_ID = [0, 100, 255, 0, 255];
const CV_ID = [0, 0, 255, 255];
const Z3 = [0, 0, 0];
const tName = (k, t) => (typeof t === "number" ? (TCODE[k] || [])[t] : t) || "_";
const kName = (k) => (typeof k === "number" ? KINDS[k] : k);
/** drop keys equal to their default or identity; keeps unknown keys untouched */
export function pruneP(kind, t, p) {
  const k = kName(kind), tn = tName(k, t), d = ((DEF[k] || {})[tn]) || {};
  const out = {};
  Object.keys(p || {}).forEach((x) => {
    const v = p[x];
    if (v == null) return;
    if (Array.isArray(d[x]) ? eqArr(v, d[x]) : d[x] === v) return;
    if (k === "adj" && tn === "lv" && eqArr(v, LV_ID)) return;
    if (k === "adj" && tn === "cv" && ["l", "r", "g", "b"].includes(x) && eqArr(v, CV_ID)) return;
    if (k === "adj" && (tn === "hs" || tn === "cb") && x !== "cz" && x !== "pl" && eqArr(v, Z3)) return;
    out[x] = v;
  });
  return out;
}
/** parameters of a new layer (seeded noise gets its seed here) */
export function newParams(kind, t) {
  if (kind === "flt" && t === "nz") return { sd: Math.floor(Math.random() * 2147483647) };
  return {};
}
/** effective value of a key (default when absent) */
const pv = (L, x) => { const p = (L && L.p) || {}; if (p[x] != null) return p[x]; const d = ((DEF[kName(L.k)] || {})[tName(kName(L.k), L.t)]) || {}; return d[x]; };
export const RATIOS = ["orig", 1, 4 / 5, 3 / 4, 2 / 3, 3 / 2, 210 / 297, null];
/** the first preset place (ps) whose box does not overlap a mark already shown; the default place when every one does */
function freePreset(api, doc, renderer, t, p) {
  const os = api.outSz(), ppc = renderer && renderer.ppc ? renderer.ppc() : null;
  const others = doc.layers.filter((L) => (kName(L.k) === "ov" || kName(L.k) === "txt") && L.vis !== 0);
  const box = (rec) => { try { return markBox(rec, os.w, os.h, ppc); } catch (e) { return null; } };
  const boxes = others.map(box).filter((b) => b && b.w > 0);
  const hit = (b) => boxes.some((o) => b.x < o.x + o.w && o.x < b.x + b.w && b.y < o.y + o.h && o.y < b.y + b.h);
  const cands = t === "sb" ? [0, 1, 2, 3] : t === "gs" || t === "cc" ? [0, 1] : [0];
  for (const ps of cands) {
    const q = ps ? { ...p, ps, ...((t === "sb" && ps === 3) || ((t === "gs" || t === "cc") && ps === 1) ? { o: 1 } : {}) } : { ...p };
    const b = box({ k: "ov", t, p: q });
    if (!b || !(b.w > 0) || !hit(b)) return q;
  }
  return p;
}
/** 자동 톤·대비·색상 and 레벨 「자동」 from the histogram of the layer's input (`renderer.below(index)`), sampled every 2nd pixel */
function autoFromInput(doc, renderer, id, mode) {
  try {
    const i = doc.layers.findIndex((x) => x.id === id);
    const S = renderer.below(i < 0 ? doc.layers.length : i, {});
    if (!S || !S.read) return null;
    const step = Math.max(1, Math.round(Math.max(S.w, S.h) / 800));
    const h = pxHistogram(S.read({ x: 0, y: 0, w: S.w, h: S.h }), S.w, S.h, step);
    return autoLevels(h, mode) || null;
  } catch (e) { return null; }
}
/** 자동 길이 at the moment it is chosen: stored as cm and sg so the record and the phrases name the length (contract-log D8) */
function autoBar(api, doc, renderer) {
  const os = api.outSz(), ppc = renderer && renderer.ppc ? renderer.ppc() : null;
  let objLong = 0;
  try {
    const c = api.compositeRGBA(), box = c ? objectBox(c.d, c.w, c.h) : null;
    if (box) objLong = Math.max(box.w, box.h);
  } catch (e) { objLong = 0; }
  let s = null;
  try { s = suggestBarCm(ppc, os.w, objLong); } catch (e) { s = null; }
  return s && s.cm > 0 ? { cm: s.cm, sg: s.sg || 0 } : {};
}

/* ---------- layer names (default names are derived, «복제 도장 1»; a renamed nm wins) ---------- */
const PX_NAME = { spot: TOOL_TEXT.spot.name, clone: TOOL_TEXT.clone.name, heal: TOOL_TEXT.heal.name, sponge: TOOL_TEXT.sponge.name, bsb: TOOL_TEXT.blurB.name, shb: TOOL_TEXT.sharpB.name };
export function layerName(L, doc) {
  if (!L) return KIND_LABEL.base;
  if (L.nm) return L.nm;
  const k = kName(L.k), tn = tName(k, L.t);
  const base = k === "adj" ? ADJ_TEXT[tn] : k === "flt" ? FLT_TEXT[tn] : k === "ov" ? MARK_TEXT[tn] : k === "txt" ? MARK_TEXT.txt
    : k === "px" ? PX_NAME[tn] || KIND_LABEL.px : k === "ai" ? OP_TEXT.patch : KIND_LABEL[k] || k;
  const same = ((doc && doc.layers) || []).filter((x) => kName(x.k) === k && tName(k, x.t) === tn);
  const i = same.findIndex((x) => x.id === L.id);
  return (base || "") + " " + (i >= 0 ? i + 1 : same.length + 1);
}
const isPixel = (L) => ["ai", "px", "tr", "db"].includes(kName(L.k));
const baseSpace = (L) => ["ai", "px", "tr", "db", "adj", "flt"].includes(kName(L.k));

/* ---------- controls ---------- */
let uid = 0;
const useUid = (p) => { const r = useRef(""); if (!r.current) r.current = p + "-" + (++uid); return r.current; };
const MOVE_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"]);
/** native range: onInput while moving, onCommit on pointer release or the key-up of a moving key; optional number field */
export function PeRange({ label, min, max, step = 1, value, onInput, onCommit, valueText, vt, num, unit, disabled, scale = 1, id, numTo, numFrom, numStep, onNum, outText }) {
  const rid = useUid("pe-r");
  const fid = id || rid;
  const [live, setLive] = useState(null);
  useEffect(() => { setLive(null); }, [value]);
  const v = live != null ? live : Number.isFinite(value) ? value : 0;
  if (vt) valueText = vt(v);
  const [txt, setTxt] = useState(null);
  const done = (n) => { if (onCommit) onCommit(n); setTimeout(() => setLive(null), 0); };
  return (
    <span className="pe-range-w">
      <label htmlFor={fid} className="pe-range-l">{label}</label>
      <input id={fid} type="range" className="pe-range" min={min} max={max} step={step} value={v} disabled={disabled}
        aria-valuetext={valueText || String(v)}
        onChange={(e) => { const n = Number(e.target.value); setLive(n); if (onInput) onInput(n); }}
        onPointerUp={(e) => done(Number(e.currentTarget.value))}
        onKeyUp={(e) => { if (MOVE_KEYS.has(e.key)) done(Number(e.currentTarget.value)); }} />
      {num ? (
        <input type="number" className="pe-num" aria-label={fmt(P.numField, { name: label })} min={numTo ? Number(numTo(min)) : min / scale} max={numTo ? Number(numTo(max)) : max / scale} step={numStep || step / scale}
          value={txt != null ? txt : numTo ? numTo(v) : +(v / scale).toFixed(scale >= 100 ? 2 : scale >= 10 ? 1 : 0)} disabled={disabled}
          onChange={(e) => setTxt(e.target.value)}
          onBlur={() => { if (txt == null) return; const x = Number(txt); const n = clamp(numFrom ? numFrom(x) : Math.round(x * scale), min, max); setTxt(null); if (!Number.isFinite(x) || !Number.isFinite(n)) return; if (onNum) onNum(x); else if (onCommit) onCommit(n); }}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }} />
      ) : <output className="pe-range-v" translate="no" aria-hidden="true">{outText ? outText(v) : valueText ? (typeof label === "string" && valueText.startsWith(label + " ") ? valueText.slice(label.length + 1) : valueText) : <>{v}{unit || ""}</>}</output>}
    </span>
  );
}
/** role=group with aria-pressed buttons; value is the option index */
export function PeSeg({ label, options, value, onChange, disabled, clearable = false }) {
  return (
    <span className="pe-seg" role="group" aria-label={label}>
      {(options || []).map((o, i) => (
        <button key={i} type="button" aria-pressed={value === i} disabled={disabled}
          onClick={() => onChange && onChange(value === i && clearable ? -1 : i)}>{o}</button>
      ))}
    </span>
  );
}
export function PeSelect({ label, options, value, onChange, disabled }) {
  const id = useUid("pe-s");
  return (
    <span className="pe-sel-w">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} disabled={disabled} onChange={(e) => onChange && onChange(Number(e.target.value))}>
        {(options || []).map((o, i) => <option key={i} value={i}>{o}</option>)}
      </select>
    </span>
  );
}
export function PeCheck({ label, checked, onChange, disabled }) {
  const id = useUid("pe-c");
  return (
    <span className="pe-chk">
      <input id={id} type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange && onChange(e.target.checked)} />
      <label htmlFor={id}>{label}</label>
    </span>
  );
}
function NumIn({ label, value, min, max, step = 1, onChange, disabled, allowEmpty }) {
  const id = useUid("pe-n");
  const [t, setT] = useState(null);
  return (
    <span className="pe-numw">
      <label htmlFor={id}>{label}</label>
      <input id={id} type="number" className="pe-num" min={min} max={max} step={step} value={t != null ? t : value} disabled={disabled}
        onChange={(e) => setT(e.target.value)}
        onBlur={() => { if (t == null) return; setT(null); if (allowEmpty && String(t).trim() === "") { onChange(""); return; } const n = clamp(Number(t), min, max); if (Number.isFinite(n)) onChange(n); }}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }} />
    </span>
  );
}
/** inline confirmation (PfConfirm API) that focuses 「확인」 when armed and disarms on Esc */
function Confirm({ label, ask, onConfirm, precheck, disabled, className = "pe-btn", yes = T.yes, no = T.no }) {
  const [armed, setArmed] = useState(false);
  const yesRef = useRef(null);
  useEffect(() => { if (armed && yesRef.current) yesRef.current.focus(); }, [armed]);
  if (!armed) return <button type="button" className={className} disabled={disabled} onClick={() => { if (precheck && precheck() === false) return; setArmed(true); }}>{label}</button>;
  return (
    <span className="pe-cfm" role="group" aria-label={ask} onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setArmed(false); } }}>
      <span className="pe-cfm-q">{ask}</span>
      <button type="button" ref={yesRef} className="btn small seal" onClick={() => { setArmed(false); onConfirm && onConfirm(); }}>{yes}</button>
      <button type="button" className="btn small ghost" onClick={() => setArmed(false)}>{no}</button>
    </span>
  );
}

/* ---------- icons (20 × 20, stroke) ---------- */
const ICONS = {
  move: <><path d="M10 2v16M2 10h16" /><path d="M7 5l3-3 3 3M7 15l3 3 3-3M5 7l-3 3 3 3M15 7l3 3-3 3" /></>,
  hand: <path d="M6 10V5.5a1.2 1.2 0 0 1 2.4 0V9m0-4.5V3.8a1.2 1.2 0 0 1 2.4 0V9m0-4.2a1.2 1.2 0 0 1 2.4 0V9.5m0-3a1.2 1.2 0 0 1 2.4 0V12a6 6 0 0 1-6 6h-.5a5 5 0 0 1-4.2-2.3L3.4 12.6a1.2 1.2 0 0 1 2-1.3L6 12" />,
  zoom: <><circle cx="8.5" cy="8.5" r="5.5" /><path d="M12.5 12.5L18 18M6 8.5h5M8.5 6v5" /></>,
  eyedrop: <><path d="M13.6 3.2a2 2 0 0 1 2.9 2.9l-1.8 1.8-2.9-2.9z" /><path d="M10.6 5.2l4.2 4.2M12.7 7.3L5.5 14.5 3 17l2.5-2.5" /><path d="M5.5 14.5L3.5 16.5" /></>,
  pin: <><path d="M10 18s-5-5.2-5-9a5 5 0 0 1 10 0c0 3.8-5 9-5 9z" /><circle cx="10" cy="9" r="1.8" /></>,
  light: <><circle cx="6" cy="6" r="2.5" /><path d="M6 1v1.5M6 9.5V11M1 6h1.5M9.5 6H11M8 13l9 5" /><circle cx="17" cy="18" r="1" /></>,
  maskBrush: <><rect x="2.5" y="2.5" width="9" height="9" rx="1" /><path d="M17.5 8.5l-7 7-2 .5.5-2 7-7z" /></>,
  crop: <path d="M5 1v14h14M1 5h14v14" />,
  straighten: <><path d="M2 12l16-4" /><path d="M2 15h16" strokeDasharray="2 2" /></>,
  selRect: <rect x="3" y="4" width="14" height="12" strokeDasharray="2.5 2" />,
  selLasso: <><ellipse cx="10" cy="8" rx="7" ry="4.5" strokeDasharray="2.5 2" /><path d="M6 12c-1 2 0 4 2 4" /></>,
  selWand: <><path d="M3 17l9-9" /><path d="M14 2v3M14 9v3M10 5.5h-1M19 5.5h-1M11.5 3l1 1M16.5 8l1 1M16.5 3l-1 1" /></>,
  spot: <><rect x="5" y="7.5" width="10" height="5" rx="2.5" transform="rotate(-35 10 10)" /><circle cx="10" cy="10" r="8.2" strokeDasharray="1.6 2.2" /></>,
  heal: <><rect x="2.5" y="7" width="15" height="6" rx="3" transform="rotate(-35 10 10)" /><path d="M10 7.6v4.8M7.6 10h4.8" /></>,
  clone: <><path d="M7 3h6l-1 6H8z" /><path d="M4 12h12v3H4zM6 17h8" /></>,
  dodge: <><circle cx="12.5" cy="7.5" r="4.5" /><path d="M12.5 3a4.5 4.5 0 0 1 0 9z" fill="currentColor" /><path d="M9.3 10.7L3 17" strokeWidth="2.2" /></>,
  trace: <><path d="M3 15c3-1 4-5 7-5s3 4 7 2" /><path d="M4 6l2 1M8 4l1 2M13 4l-1 2" /></>,
  sponge: <><rect x="3" y="6" width="14" height="9" rx="2" /><circle cx="7" cy="10" r=".8" /><circle cx="12" cy="9" r=".8" /><circle cx="10" cy="12.5" r=".8" /></>,
  blurB: <path d="M10 2.5s-5 5.5-5 9a5 5 0 0 0 10 0c0-3.5-5-9-5-9z" />,
  sharpB: <path d="M10 2.5L16 17H4z" />,
  erase: <><path d="M3 13.5l7-7 5 5-5 5H6z" /><path d="M10 18h8" /></>,
  measure: <><rect x="2" y="7" width="16" height="6" rx="1" /><path d="M5 7v3M8 7v2M11 7v3M14 7v2" /></>,
  text: <path d="M4 4h12M10 4v13M7 17h6" />,
  undo: <path d="M7 5L3 9l4 4M3 9h9a5 5 0 0 1 0 10h-2" />,
  fit: <path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4M7 7h6v6H7z" />,
  orig: <><rect x="3" y="4" width="14" height="12" rx="1" /><path d="M10 4v12" /><path d="M3.5 15.5L10 9" /></>,
  redo: <path d="M13 5l4 4-4 4M17 9H8a5 5 0 0 0 0 10h2" />,
  eye: <><path d="M1.5 10S5 4 10 4s8.5 6 8.5 6-3.5 6-8.5 6-8.5-6-8.5-6z" /><circle cx="10" cy="10" r="2.5" /></>,
  eyeOff: <><path d="M1.5 10S5 4 10 4s8.5 6 8.5 6-3.5 6-8.5 6-8.5-6-8.5-6z" /><path d="M3 17L17 3" /></>,
  lock: <><rect x="4" y="9" width="12" height="9" rx="1.5" /><path d="M7 9V6a3 3 0 0 1 6 0v3" /></>,
  up: <path d="M5 12l5-5 5 5" />,
  down: <path d="M5 8l5 5 5-5" />,
};
export function Icon({ k }) {
  return <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{ICONS[k] || null}</svg>;
}

/* ---------- live manifest for the log lines and phrases (doc + session, memoised per revision) ---------- */
function liveEdit(api) {
  const d = api && api.doc;
  const key = d ? d.rev + ":" + d.prev + ":" + (api.saveSt ? api.saveSt.at : 0) + ":" + JSON.stringify((api.session && api.session.sr) || {}).length : "";
  const c = api && api.eng ? api.eng : {};
  if (c._liveKey === key && c._live) return c._live;
  let e = normEdit(api && api.ws && api.ws[KEYS.edit]) || {};
  if (d && api.session) {
    try { e = { ...e, ...api.session.apply(d.toManifest({})) }; } catch (er) { /* doc not ready */ }
  }
  c._liveKey = key; c._live = e;
  return e;
}

/* ---------- stage panel frame: name, subtitle, controls, this stage's log, note, next ---------- */
function StagePanel({ stage, api, notes, setNote, headRef, children, hidden, hiddenText }) {
  const k = STAGE_NOTE[stage];
  /* review K8: students get core's default (no 개입·보도사진 기준; 「표기 문장에 밝힐 수정」 for level ≥ 4); a read-only teacher editor keeps them */
  let lines = [];
  try { lines = opLines(liveEdit(api), stage, { audience: api.audience || "student" }) || []; } catch (e) { lines = []; }
  const i = STAGES.indexOf(stage), next = STAGES[i + 1];
  const d = api.doc, sr = (api.session && api.session.sr && api.session.sr[stage]) || {};
  const noteRO = !api.canWrite || api.locked;
  let markOk = false;
  try { markOk = !!(d && d.stageMarkAvailable(stage)); } catch (e) { markOk = false; }
  return (
    <div className="pe-panel" data-stage={stage}>
      <h2 tabIndex={-1} ref={headRef} className="pe-stage-h">{STAGE_TEXT[stage].name}</h2>
      <p className="pe-sub">{STAGE_TEXT[stage].sub}</p>
      {hidden ? <p className="pe-hidden" role="status">{hiddenText}</p> : null}
      {!hidden ? children : null}
      {hidden && stage === "patch" ? children : null}
      <section className="pe-log" aria-label={P.stageLog}>
        <h4>{P.stageLog}</h4>
        {lines.length ? <ol>{lines.map((s, j) => <li key={j}>{s}</li>)}</ol> : <p className="pe-hint">{"–"}</p>}
      </section>
      <div className="pe-note-dock">
        <NoteField id={"pe-note-" + stage} label={STAGE_TEXT[stage].note} value={(notes && notes[k]) || ""} maxB={NOTE_CAP[k]}
          onChange={(t) => setNote && setNote(k, t)} readOnly={noteRO} dataFk={"s6f.notes#" + k} rows={3} />
      </div>
      <div className="pe-row">
        {next ? <button type="button" className="pe-btn" onClick={() => api.setStage(next)}>{fmt(P.nextStage, { stage: STAGE_TEXT[next].name })}</button> : null}
      </div>
      {api.adv && !hidden && api.editable ? (
        <div className="pe-row pe-adv">
          <button type="button" className="pe-btn small" disabled={!markOk} aria-describedby={markOk ? undefined : "pe-back-why-" + stage}
            onClick={() => { try { d.undoToStageMark(stage); } catch (e) { /* ignore */ } api.render({}); api.bump(); }}>{P.backToStage}</button>
          {!markOk ? <span id={"pe-back-why-" + stage} className="pe-hint">{P.backEvicted}</span> : null}
          <PeCheck label={P.skipStage} checked={!!sr.sk} onChange={(v) => { api.session.sr = api.skipStage(stage, v); api.bump(); }} />
        </div>
      ) : null}
    </div>
  );
}

/* ============================================================ 점검 */
const normRoute = (r) => {
  const z = () => ITEMS.map(() => 0);
  const ok = (a) => (Array.isArray(a) && a.length === ITEMS.length ? a.slice() : z());
  return isPlain(r) ? { s: ok(r.s), m: ok(r.m), o: ok(r.o) } : { s: z(), m: z(), o: z() };
};
const stagesFor = (item, m) => ((ROUTE_ITEM[item] && ROUTE_ITEM[item][m]) || ROUTE[m] || []);
/** METHOD codes, METHOD_LABEL */
export function CheckPanel({ api, ws, route, setRoute, notes, setNote, pins, inspectItems, readOnly, headRef }) {
  const r = normRoute(route);
  const items = ITEMS.map((k) => { const it = (inspectItems || []).find((x) => x.k === k); return { k, label: (it && it.label) || ITEM_LABEL[k], hint: (it && it.hint) || "" }; });
  const rc = (() => { try { return effRound(api.steps, "rc") || {}; } catch (e) { return {}; } })();
  const plan = rc.hm ? HM_LABEL[rc.hm] + (rc.nx ? ": " + rc.nx : "") : "";
  const setRow = (i, patch) => {
    const n = normRoute(route);
    if ("s" in patch) n.s[i] = patch.s;
    if ("m" in patch) n.m[i] = patch.m;
    n.o[i] = 0;
    setRoute(n);
  };
  const pair = ws && typeof ws["s5e.pairSaw"] === "string" ? ws["s5e.pairSaw"] : "";
  const d = api.doc;
  const lines = (d && d.lines) || [];
  let meet = null;
  try { meet = lines.length >= 2 ? lightLinesMeet(lines) : null; } catch (e) { meet = null; }
  const kindName = [O.pinTrace, O.pinTrace, O.pinKeep, O.pinFix];
  const addPinCenter = () => {
    if (!d || readOnly) return;
    if ((d.pins || []).length >= LIMITS.pins) { api.toast(P.layerLimit); return; }
    const c = api.viewCenterOut(), b = api.o2b(c.x, c.y), po = api.opts.pin;
    const pin = { x: clamp(Math.round((b.x / d.w) * 1000), 0, 1000), y: clamp(Math.round((b.y / d.h) * 1000), 0, 1000), k: po.kind || 1 };
    if (po.it) pin.it = po.it;
    if (po.ce) pin.ce = po.ce;
    d.setPins([...(d.pins || []), pin], "pin");
    api.setTool("pin"); api.setSelPin((d.pins || []).length - 1);
  };
  const addLineCenter = () => {
    if (!d || readOnly || lines.length >= LIMITS.lines) return;
    const c = api.viewCenterOut(), a = api.o2b(c.x - 40, c.y + 30), b = api.o2b(c.x + 40, c.y - 30), pm = (v, n) => clamp(Math.round((v / n) * 1000), 0, 1000);
    d.setLines([...lines, { a: pm(a.x, d.w), b: pm(a.y, d.h), c: pm(b.x, d.w), d: pm(b.y, d.h) }], "line");
  };
  const moveLineEnd = (i, end, dx, dy) => {
    const ls = lines.slice(), l = { ...ls[i] };
    if (end === 0) { l.a = clamp(l.a + dx, 0, 1000); l.b = clamp(l.b + dy, 0, 1000); } else { l.c = clamp(l.c + dx, 0, 1000); l.d = clamp(l.d + dy, 0, 1000); }
    ls[i] = l; d.setLines(ls, "line");
  };
  return (
    <StagePanel stage="check" api={api} notes={notes} setNote={setNote} headRef={headRef}>
      <p className="pe-plan"><strong>{P.planLine}</strong> {plan || <span className="pe-hint">{P.noPlan}</span>}</p>
      <h4>{P.inspectTable}</h4>
      <ol className="pe-items">
        {items.map((it, i) => {
          const m = r.m[i], st = stagesFor(it.k, m);
          const kp = KP[it.k];
          return (
            <li key={it.k} className="pe-item" data-s={r.s[i]}>
              <div className="pe-item-h"><span className="pe-item-l">{it.label}</span>
                {r.o[i] ? <span className="pe-chip">{r.o[i] === 1 ? P.fromS5c : P.fromPlan}</span> : null}</div>
              <div className="pe-row">
                <PeSeg label={fmt(P.result, {}) + " " + it.label} options={[T.checkOk, T.checkNo]} value={r.s[i] - 1} clearable
                  onChange={(v) => setRow(i, { s: v < 0 ? 0 : v + 1 })} disabled={readOnly} />
                <PeSelect label={P.method} value={m} options={[P.undecided, ...METHOD_LABEL.slice(1)]} onChange={(v) => setRow(i, { m: v })} disabled={readOnly} />
              </div>
              {st.length ? <p className="pe-chips">{st.map((s) => <span key={s} className="pe-chip pe-chip-go">{fmt(P.routedChip, { stage: STAGE_TEXT[s].name })}</span>)}</p> : null}
              {m === 6 || (notes && notes[kp]) ? (
                <NoteField id={"pe-kp-" + it.k} label={P.keepReason} value={(notes && notes[kp]) || ""} maxB={NOTE_CAP[kp]} rows={1}
                  onChange={(t) => setNote(kp, t)} readOnly={!api.canWrite || api.locked} dataFk={"s6f.notes#" + kp} />
              ) : null}
            </li>
          );
        })}
      </ol>
      {pair ? <div className="pe-pair"><h4>{P.pairSaw}</h4><p>{pair}</p></div> : null}
      <div className="pe-row">
        <button type="button" className="pe-btn" onClick={addPinCenter} disabled={readOnly}>{P.addPin}</button>
        <span className="pe-hint">{fmt(P.pinsCount, { n: (pins || []).length })}</span>
      </div>
      {(pins || []).length ? (
        <ul className="pe-list">
          {pins.map((p, i) => (
            <li key={i}>
              <button type="button" className="pe-link" aria-pressed={api.selPin === i} onClick={() => { api.setTool("pin"); api.setSelPin(i); }}>
                {fmt(P.pinLabel, { n: i + 1, kind: kindName[p.k] || "" })}{p.it ? " · " + ITEM_LABEL[ITEMS[p.it - 1]] : ""}{p.ce ? " · " + CELL_LABEL[p.ce] : ""}</button>
              {!readOnly ? <button type="button" className="pe-btn small" onClick={() => { d.setPins(pins.filter((_, j) => j !== i), "pinDel"); api.setSelPin(-1); }}>{P.delPin}</button> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {api.adv ? (
        <div className="pe-group">
          <h4>{TOOL_TEXT.light.name}</h4>
          <div className="pe-row"><button type="button" className="pe-btn" onClick={addLineCenter} disabled={readOnly || lines.length >= LIMITS.lines}>{P.addLine}</button>
            <button type="button" className="pe-btn" aria-pressed={api.tool === "light"} onClick={() => api.setTool("light")}>{TOOL_TEXT.light.name}</button></div>
          {lines.length ? (
            <ul className="pe-list">
              {lines.map((l, i) => (
                <li key={i}><span>{fmt(P.lineLabel, { n: i + 1 })}</span>
                  {!readOnly ? [0, 1].map((end) => (
                    <span key={end} className="pe-nudge" role="group" aria-label={end ? P.lineEndB : P.lineEndA}>
                      <span className="pe-hint">{end ? P.lineEndB : P.lineEndA}</span>
                      {[["ArrowLeft", -5, 0, P.nudgeLeft], ["ArrowRight", 5, 0, P.nudgeRight], ["ArrowUp", 0, -5, P.nudgeUp], ["ArrowDown", 0, 5, P.nudgeDown]].map(([k2, dx, dy, lb]) => (
                        <button key={k2} type="button" className="pe-btn small" aria-label={lb} onClick={() => moveLineEnd(i, end, dx, dy)}>{k2 === "ArrowLeft" ? "←" : k2 === "ArrowRight" ? "→" : k2 === "ArrowUp" ? "↑" : "↓"}</button>
                      ))}
                    </span>
                  )) : null}
                  {!readOnly ? <button type="button" className="pe-btn small" onClick={() => d.setLines(lines.filter((_, j) => j !== i), "line")}>{P.delLine}</button> : null}
                </li>
              ))}
            </ul>
          ) : <p className="pe-hint">{P.linesNone}</p>}
          {meet ? <p className="pe-result" role="status">{meet.meet ? P.lightMeet : fmt(P.lightOff, { n: Math.round(meet.spreadDeg || 0) })}</p> : null}
        </div>
      ) : null}
    </StagePanel>
  );
}

/* ============================================================ 부분 수정 (R2) */
export function PatchPanel({ api, doc, renderer, notes, setNote, onImport, onAlign, rec, session, readOnly, hidden, hiddenWhy, headRef }) {
  void onImport; void onAlign;
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [range, setRange] = useState(1);
  const ai = doc ? doc.layers.filter((L) => kName(L.k) === "ai") : [];
  const A = ai.find((L) => L.id === doc.activeId) || ai[ai.length - 1] || null;
  const tries = (rec && rec.tr) || 0;
  const noteRO = !api.canWrite || api.locked;
  const field = (k, rows = 1) => (
    <NoteField id={"pe-" + k} label={NOTE_LABEL[k]} value={(notes && notes[k]) || ""} maxB={NOTE_CAP[k]} rows={rows}
      onChange={(t) => setNote(k, t)} readOnly={noteRO} dataFk={"s6f.notes#" + k} />
  );
  const load = async (file) => {
    if (!file || readOnly) return;
    setBusy(true);
    try {
      if (api.coarse) {
        const dm = await imageDims(file).catch(() => null);
        if (dm && Math.max(dm.w, dm.h) > LIMITS.patchPxTouch) { api.alert(api.errText("patchPx")); return; }
      }
      try { renderer.freeCaches(); } catch (e) { /* ignore */ }
      let res;
      try { res = await prepareImage(file, imgPreset("patch")); } catch (e) { api.alert(imgErrText(e)); return; }
      const img = await decodeImage(res.data);
      const L = api.memRetry ? api.memRetry(() => doc.importPatch(img, res.data)) : doc.importPatch(img, res.data);
      if (!L) { api.alert(api.errText(doc.lastError || "aspect")); return; }
      try { doc.setActive(L.id); } catch (e) { /* ignore */ }
      /* initial mask: where the result differs from the base */
      try {
        const base = doc.base, w = base.w, h = base.h;
        const c = document.createElement("canvas"); c.width = w; c.height = h;
        const cx = c.getContext("2d"); cx.drawImage(img, 0, 0, w, h);
        const b = base.read({ x: 0, y: 0, w, h }), a = cx.getImageData(0, 0, w, h).data;
        c.width = c.height = 0;
        const dm = diffMask(b, a, w, h);
        if (dm && dm.mask && dm.permille > 0) {
          const wa = doc.wa, m = w === wa.w && h === wa.h ? dm.mask : (() => { const o = new Uint8Array(wa.w * wa.h); for (let y = 0; y < h; y++) o.set(dm.mask.subarray(y * w, y * w + w), (y - wa.y) * wa.w - wa.x); return o; })();
          doc.setSelection(m, "new", "patch");
          doc.addMask(L.id, "selection");
          doc.deselect();
        }
      } catch (e) { /* px not ready: the layer stays unmasked */ }
      if (api.session) { api.session.sr = api.recTries(Math.min(LIMITS.tries, tries + 1)); }
      api.toast(P.patchLoaded);
      api.render({}); api.bump();
    } finally { setBusy(false); if (fileRef.current) fileRef.current.value = ""; }
  };
  const align = () => {
    if (!A || readOnly) return;
    try {
      const base = doc.base, w = base.w, h = base.h, s = Math.min(1, 256 / Math.max(w, h));
      const pw = Math.max(1, Math.round(w * s)), ph = Math.max(1, Math.round(h * s));
      const grab = (src) => { const c = document.createElement("canvas"); c.width = pw; c.height = ph; const x = c.getContext("2d"); x.drawImage(src, 0, 0, pw, ph); const d = x.getImageData(0, 0, pw, ph).data; c.width = c.height = 0; return d; };
      const a = grab(base.cv), b = grab(A.surf && A.surf.cv ? A.surf.cv : base.cv);
      const r = alignSearch(a, b, pw, ph, { range: [0.01, 0.03, 0.06][range] || 0.03 });
      if (!r) return;
      const p = { ...(A.p || {}), dx: clamp(Math.round(r.dx / s), -999, 999), dy: clamp(Math.round(r.dy / s), -999, 999), sc: clamp(Math.round((r.sc || 1) * 1000), 970, 1030) };
      api.commit(A.id, pruneAi(p), "align");
      api.toast(fmt(P.alignDone, { dx: p.dx, dy: p.dy, sc: (p.sc / 10).toFixed(1) }));
    } catch (e) { /* ignore */ }
  };
  const pruneAi = (p) => { const q = { ...p }; if (!q.dx) delete q.dx; if (!q.dy) delete q.dy; if (q.sc === 1000) delete q.sc; if (!q.gn) delete q.gn; return q; };
  const nudge = (dx, dy, ds) => {
    if (!A || readOnly) return;
    const p = A.p || {};
    /* review R2-13: the buttons move on screen; map the output delta to base px */
    const os = api.outSz(), b0 = api.o2b(os.w / 2, os.h / 2), b1 = api.o2b(os.w / 2 + dx, os.h / 2 + dy);
    const bdx = Math.round(b1.x - b0.x), bdy = Math.round(b1.y - b0.y);
    api.commit(A.id, pruneAi({ ...p, dx: clamp((p.dx || 0) + bdx, -999, 999), dy: clamp((p.dy || 0) + bdy, -999, 999), sc: clamp((p.sc || 1000) + ds, 970, 1030) }), ds ? "align" : "layerAiMove");
  };
  const hidText = hiddenWhy === "phone" ? P.phoneOnly : T.hiddenStage;
  return (
    <StagePanel stage="patch" api={api} notes={notes} setNote={setNote} headRef={headRef} hidden={hidden} hiddenText={hidText}>
      {field("aiTool")}
      {field("aiRegion")}
      {field("aiPrompt", 2)}
      {!hidden ? (
        <>
          <PeRange label={P.tries} min={1} max={LIMITS.tries} value={Math.max(1, tries)} disabled={readOnly}
            onCommit={(v) => { api.session.sr = api.recTries(v); api.bump(); }} vt={(v) => String(v)} num />
          <div className="pe-row">
            <label className="pe-btn" aria-disabled={readOnly || busy}>
              <span>{TOOL_TEXT.patchLoad.name}</span>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png" className="ax-sr" aria-label={P.patchFile} disabled={readOnly || busy}
                onChange={(e) => load(e.target.files && e.target.files[0])} />
            </label>
          </div>
          {A ? (
            <>
              <div className="pe-row">
                <PeSelect label={O.alignRange} value={range} options={["±1%", "±3%", "±6%"]} onChange={setRange} />
                <button type="button" className="pe-btn" onClick={align} disabled={readOnly} title={tooltip("patchAlign")}>{TOOL_TEXT.patchAlign.name}</button>
              </div>
              <div className="pe-row">
                <button type="button" className="pe-btn" aria-pressed={api.tool === "maskBrush"} onClick={() => api.setTool("maskBrush")} title={tooltip("maskBrush")}>{P.acceptRange}</button>
                <button type="button" className="pe-btn" aria-pressed={api.cmpMode === "marks"} onClick={() => api.setCmpMode(api.cmpMode === "marks" ? "none" : "marks")}>{P.changedView}</button>
              </div>
              <PeRange label={O.opacity} min={0} max={100} value={Math.round((A.op == null ? 1 : A.op) * 100)} disabled={readOnly}
                onCommit={(v) => api.setLayerOp(A.id, v, true)} vt={(v) => v + "%"} num={api.adv} unit="%" />
              {api.adv ? (
                <div className="pe-group">
                  <span className="pe-nudge" role="group" aria-label={P.nudge1}>
                    <span className="pe-hint">{P.nudge1}</span>
                    <button type="button" className="pe-btn small" aria-label={P.nudgeLeft} onClick={() => nudge(-1, 0, 0)}>←</button>
                    <button type="button" className="pe-btn small" aria-label={P.nudgeRight} onClick={() => nudge(1, 0, 0)}>→</button>
                    <button type="button" className="pe-btn small" aria-label={P.nudgeUp} onClick={() => nudge(0, -1, 0)}>↑</button>
                    <button type="button" className="pe-btn small" aria-label={P.nudgeDown} onClick={() => nudge(0, 1, 0)}>↓</button>
                  </span>
                  <span className="pe-nudge" role="group" aria-label={P.scaleNudge}>
                    <span className="pe-hint">{P.scaleNudge}</span>
                    <button type="button" className="pe-btn small" onClick={() => nudge(0, 0, -5)}>{P.scaleDown}</button>
                    <button type="button" className="pe-btn small" onClick={() => nudge(0, 0, 5)}>{P.scaleUp}</button>
                  </span>
                  {A.mask ? (
                    <>
                      <PeRange label={P.maskSoft} min={0} max={50} value={(A.mask && A.mask.fe) || 0} disabled={readOnly}
                        onCommit={(v) => { try { doc.setProp(A.id, "mk.fe", v, { lk: "maskFeather" }); } catch (e) { /* ignore */ } api.render({}); }} vt={(v) => v + "px"} num />
                      <button type="button" className="pe-btn" disabled={readOnly} onClick={() => { try { doc.invertMask(A.id); } catch (e) { /* ignore */ } api.render({}); }}>{P.maskInvert}</button>
                    </>
                  ) : null}
                  <PeRange label={P.grain} min={0} max={100} value={(A.p && A.p.gn) || 0} disabled={readOnly}
                    onInput={(v) => api.preview_(A.id, { ...(A.p || {}), gn: v })} onCommit={(v) => api.commit(A.id, pruneAi({ ...(A.p || {}), gn: v, sd: (A.p && A.p.sd) || Math.floor(Math.random() * 2147483647) }), "align")} valueText={String((A.p && A.p.gn) || 0)} num />
                </div>
              ) : null}
            </>
          ) : <p className="pe-hint">{P.noAiLayer}</p>}
        </>
      ) : null}
    </StagePanel>
  );
}

/* ============================================================ 자르기 */
export function CropPanel({ api, doc, renderer, notes, setNote, tool, setTool, readOnly, headRef }) {
  const g = (doc && doc.geo) || {};
  const [r10, setR10] = useState(g.r || 0);
  useEffect(() => { setR10(g.r || 0); }, [g.r]);
  const [mg, setMg] = useState(1);
  const os = api.outSz();
  const crop = g.crop || { x: 0, y: 0, w: doc.w, h: doc.h };
  const fitObj = () => {
    const c = api.compositeRGBA();
    if (!c || readOnly) return;
    let box = null;
    try { box = objectBox(c.d, c.w, c.h); } catch (e) { box = null; }
    if (!box) return;
    if (c.w !== doc.w || c.h !== doc.h) box = { ...box, x: box.x + doc.wa.x, y: box.y + doc.wa.y };
    /* review R2-12: ratios are output ratios; under a 90°/270° rotation the base-px crop takes the inverse */
    const ratio = RATIOS[api.opts.crop.ratio || 0], swap = g.rot === 90 || g.rot === 270;
    const outR = ratio === "orig" ? (swap ? doc.h / doc.w : doc.w / doc.h) : ratio;
    const rr = outR ? (swap ? 1 / outR : outR) : null;
    let rect = null;
    try { rect = cropForRatio(doc.w, doc.h, rr, box, [0.05, 0.1, 0.15][mg]); } catch (e) { rect = null; }
    if (rect && rect.w > 0) { api.eng.cropHand = true; doc.setGeo({ crop: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.w), h: Math.round(rect.h) } }, "crop"); }
  };
  const rotate = (dir) => { if (readOnly) return; doc.setGeo({ rot: (((g.rot || 0) + dir * 90) % 360 + 360) % 360 }, "rotate"); };
  const setNum = (k, v) => {
    if (readOnly) return;
    const c = { ...crop, [k]: Math.round(v) };
    api.eng.cropHand = true;
    doc.setGeo({ crop: c }, "crop");
  };
  return (
    <StagePanel stage="crop" api={api} notes={notes} setNote={setNote} headRef={headRef}>
      <div className="pe-row">
        <button type="button" className="pe-btn" aria-pressed={tool === "crop"} onClick={() => setTool("crop")} title={tooltip("crop")}>{TOOL_TEXT.crop.name}</button>
        <button type="button" className="pe-btn" aria-pressed={tool === "straighten"} onClick={() => setTool("straighten")}>{O.byLine}</button>
        <span className="pe-meter" translate="no">{fmt(P.cropSize, { w: os.w, h: os.h })}</span>
      </div>
      {api.phone ? (
        <div className="pe-row">
          <PeSelect label={O.ratio} value={api.opts.crop.ratio || 0} options={[O.ratioOrig, "1:1", "4:5", "3:4", "2:3", "3:2", O.ratioA4, O.ratioFree]} onChange={(v) => api.setOpt("crop", { ratio: v })} />
          {api.cropDraft ? <><button type="button" className="pe-btn" onClick={api.commitCrop}>{P.apply}</button><button type="button" className="pe-btn" onClick={api.cancelCrop}>{P.cancel}</button></> : null}
        </div>
      ) : null}
      <PeRange label={TOOL_TEXT.straighten.name} min={-150} max={150} value={r10} disabled={readOnly} scale={10} step={1}
        onInput={(v) => { setR10(v); api.previewStraighten(v); }} onCommit={(v) => api.setStraighten(v)} valueText={(r10 / 10).toFixed(1) + "°"} num={api.adv} unit="°" />
      <div className="pe-row">
        <PeSelect label={O.margin} value={mg} options={["5%", "10%", "15%"]} onChange={setMg} />
        <button type="button" className="pe-btn" onClick={fitObj} disabled={readOnly}>{TOOL_TEXT.fitObj.name}</button>
      </div>
      <div className="pe-row" role="group" aria-label={TOOL_TEXT.rotate90.name}>
        <button type="button" className="pe-btn" onClick={() => rotate(-1)} disabled={readOnly}>{P.rotateLeft}</button>
        <button type="button" className="pe-btn" onClick={() => rotate(1)} disabled={readOnly}>{P.rotateRight}</button>
      </div>
      <div className="pe-row">
        <PeCheck label={O.extend} checked={!!api.opts.crop.extend} onChange={(v) => api.setOpt("crop", { extend: v ? 1 : 0 })} disabled={readOnly} />
        {api.opts.crop.extend ? (
          <>
            <span className="pe-swatch ax-keep" aria-hidden="true" style={{ background: "rgb(" + (g.fill || [255, 255, 255]).join(",") + ")" }} />
            <span className="pe-hint">{O.fillColor}</span>
            <button type="button" className="pe-btn small" aria-pressed={!!(api.armed && api.armed.kind === "fill")} onClick={api.armFill} disabled={readOnly}>{O.fillPick}</button>
          </>
        ) : null}
      </div>
      {api.adv ? (
        <div className="pe-group pe-grid4">
          <NumIn label={O.numX} value={crop.x} min={-doc.w} max={doc.w * 2} onChange={(v) => setNum("x", v)} disabled={readOnly} />
          <NumIn label={O.numY} value={crop.y} min={-doc.h} max={doc.h * 2} onChange={(v) => setNum("y", v)} disabled={readOnly} />
          <NumIn label={O.numW} value={crop.w} min={8} max={doc.w * 2} onChange={(v) => setNum("w", v)} disabled={readOnly} />
          <NumIn label={O.numH} value={crop.h} min={8} max={doc.h * 2} onChange={(v) => setNum("h", v)} disabled={readOnly} />
          <NumIn label={O.angle} value={(g.r || 0) / 10} min={-15} max={15} step={0.1} onChange={(v) => api.setStraighten(clamp(Math.round(v * 10), -150, 150))} disabled={readOnly} />
          <button type="button" className="pe-btn" onClick={api.resetGeo} disabled={readOnly}>{O.reset}</button>
        </div>
      ) : null}
    </StagePanel>
  );
}

/* ============================================================ 빛과 톤 */
const ADJ_MAIN = ["bc", "lv", "gp", "hs", "bw"], ADJ_ADV = ["cv", "ex", "vb", "cb", "pf"];
const FLT_MAIN = ["usm", "gb", "nz", "vg"], FLT_ADV = ["shd"];
export function TonePanel({ api, doc, renderer, onAdd, scope, setScope, adv, readOnly, notes, setNote, headRef }) {
  const [num, setNum] = useState({ x: 0, y: 0, w: 200, h: 200 });
  let st = null;
  try { st = renderer && renderer.stats ? renderer.stats() : null; } catch (e) { st = null; }
  const bg = st && Array.isArray(st.bg) && st.bg.some((v) => v) ? st.bg : null;
  /* review R2-08: automatic levels read the new layer's input (the composite below it), not the finished output */
  const auto = (mode) => {
    const L = onAdd("adj", "lv");
    if (!L) return;
    const a = autoFromInput(doc, renderer, L.id, mode);
    if (a) api.commit(L.id, pruneP("adj", "lv", a), "adjEdit:lv");
  };
  const addGp = () => { const L = onAdd("adj", "gp"); if (L) api.armGrey(L.id); };
  const has = !!(doc && doc.sel);
  return (
    <StagePanel stage="tone" api={api} notes={notes} setNote={setNote} headRef={headRef}>
      <div className="pe-row">
        <PeSeg label={P.applyScope} options={[P.scopeAll, P.scopeBg, P.scopeSel]} value={scope} onChange={(v) => { setScope(v); if (v === 1 && !readOnly && !doc.sel) api.selectBg(); }} disabled={readOnly} />
      </div>
      {adv ? (   /* review U12: the scope choice is the default way; the selection buttons live under 도구 더 보기 */
        <div className="pe-row">
          <button type="button" className="pe-btn" onClick={api.selectBg} disabled={readOnly}>{P.bgOnly}</button>
          <button type="button" className="pe-btn" onClick={api.selectAll} disabled={readOnly}>{P.selAll}</button>
          <button type="button" className="pe-btn" onClick={api.deselect} disabled={readOnly || !has}>{P.deselect}</button>
          <button type="button" className="pe-btn" onClick={api.invertSel} disabled={readOnly || !has}>{P.invertSel}</button>
        </div>
      ) : has ? (
        <div className="pe-row"><button type="button" className="pe-btn" onClick={api.deselect} disabled={readOnly}>{P.deselect}</button></div>
      ) : null}
      {adv ? (
        <details className="pe-details">
          <summary>{P.selNumeric}</summary>
          <div className="pe-grid4">
            {["x", "y", "w", "h"].map((k) => <NumIn key={k} label={O["num" + k.toUpperCase()]} value={num[k]} min={0} max={9999} onChange={(v) => setNum({ ...num, [k]: v })} />)}
            <button type="button" className="pe-btn" disabled={readOnly} onClick={() => api.selNumeric(num)}>{P.apply}</button>
          </div>
          <div className="pe-row">
            <PeRange label={O.feather} min={0} max={50} value={api.eng.featherPx || 0} onInput={(v) => { api.eng.featherPx = v; api.bump(); }} onCommit={(v) => { api.eng.featherPx = v; }} valueText={(api.eng.featherPx || 0) + "px"} num />
            <button type="button" className="pe-btn small" disabled={readOnly || !has} onClick={() => api.featherSel(api.eng.featherPx || 0)}>{P.apply}</button>
            <button type="button" className="pe-btn small" disabled={readOnly || !has} onClick={() => api.growSel(2)}>{O.grow}</button>
            <button type="button" className="pe-btn small" disabled={readOnly || !has} onClick={() => api.growSel(-2)}>{O.shrink}</button>
          </div>
        </details>
      ) : null}
      <h4>{P.panelAdjust}</h4>
      <div className="pe-tiles">
        {[...ADJ_MAIN, ...(adv ? ADJ_ADV : [])].map((t) => (
          <button key={t} type="button" className="pe-btn pe-tile" disabled={readOnly} title={fmt(P.psTitle, { name: ADJ_TEXT[t], ps: ADJ_PS[t] })} onClick={() => (t === "gp" ? addGp() : onAdd("adj", t))}>{ADJ_TEXT[t]}</button>
        ))}
      </div>
      {adv ? (
        <div className="pe-row">
          <button type="button" className="pe-btn small" disabled={readOnly} onClick={() => auto("tone")}>{P.autoTone}</button>
          <button type="button" className="pe-btn small" disabled={readOnly} onClick={() => auto("contrast")}>{P.autoContrast}</button>
          <button type="button" className="pe-btn small" disabled={readOnly} onClick={() => auto("color")}>{P.autoColor}</button>
        </div>
      ) : null}
      <h4>{P.panelEffect}</h4>
      <div className="pe-tiles">
        {[...FLT_MAIN, ...(adv ? FLT_ADV : [])].map((t) => (
          <button key={t} type="button" className="pe-btn pe-tile" disabled={readOnly} title={fmt(P.psTitle, { name: FLT_TEXT[t], ps: ADJ_PS[t] })} onClick={() => onAdd("flt", t)}>{FLT_TEXT[t]}</button>
        ))}
      </div>
      {adv && (feat("patch") || feat("fix")) && !api.phone ? (
        <div className="pe-row"><button type="button" className="pe-btn" aria-pressed={api.tool === "maskBrush"} onClick={() => api.setTool("maskBrush")} title={tooltip("maskBrush")}>{TOOL_TEXT.maskBrush.name}</button></div>
      ) : null}
      {(() => { const A = doc && doc.layers.find((x) => x.id === doc.activeId); return A && (kName(A.k) === "adj" || kName(A.k) === "flt") ? (
        <div className="pe-group pe-embed"><PropsPanel api={api} doc={doc} renderer={renderer} adv={adv} readOnly={readOnly} onPreview={api.preview_} onCommit={api.commit} /></div>) : null; })()}
      <p className="pe-readout">
        {fmt(P.bgTarget, { n: CLASS_DEFAULTS.bgSpread })}
        {bg ? <> <span aria-hidden="true">{bg[3] <= CLASS_DEFAULTS.bgSpread ? "✓" : "✗"}</span> <span>{bg[3] <= CLASS_DEFAULTS.bgSpread ? P.bgMet : P.bgNotMet}</span></> : null}
      </p>
      {adv && bg ? <p className="pe-readout" translate="no">{fmt(P.bgReadout, { r: Math.round(bg[0]), g: Math.round(bg[1]), b: Math.round(bg[2]), s: Math.round(bg[3]) })}</p> : null}
    </StagePanel>
  );
}

/* ============================================================ 손으로 고치기 (R2) */
const FIX_MAIN = ["spot", "heal", "clone", "dodge", "trace"], FIX_ADV = ["sponge", "blurB", "sharpB", "erase"];
export function FixPanel({ api, doc, renderer, notes, setNote, tool, setTool, ws, readOnly, hidden, hiddenWhy, headRef }) {
  const A = doc ? doc.layers.find((L) => L.id === doc.activeId) : null;
  const fam = doc ? doc.layers.filter((L) => ["px", "tr", "db"].includes(kName(L.k))) : [];
  const hidText = hiddenWhy === "phone" ? P.phoneOnly : T.hiddenStage;
  /* review C1: on phones 「가벼운 편집」 keeps 흔적 그리기 only */
  const avail = (id) => (id !== "trace" || feat("trace")) && (!api.phone || id === "trace");
  const meter = (L) => { const c = (api.eng.meter && api.eng.meter[L.id]) != null ? api.eng.meter[L.id] : L.cov || 0; return fmt(P.meter, { name: layerName(L, doc), area: fmtArea(c) }); };
  const cellTxt = (ce) => { const k = ["", "s4a.wear", "s4a.break", "s4a.repair", "s4a.stain"][ce]; const v = k && ws && typeof ws[k] === "string" ? ws[k] : ""; return v; };
  const traceCe = (api.opts.trace && api.opts.trace.ce) || 0;
  return (
    <StagePanel stage="fix" api={api} notes={notes} setNote={setNote} headRef={headRef} hidden={hidden} hiddenText={hidText}>
      <div className="pe-tiles" role="group" aria-label={P.toolsLabel}>
        {[...FIX_MAIN, ...(api.adv ? FIX_ADV : [])].filter(avail).map((id) => (
          <button key={id} type="button" className="pe-btn pe-tile" aria-pressed={tool === id} title={tooltip(id)} onClick={() => setTool(id)} disabled={readOnly}>
            <Icon k={id} /><span>{TOOL_TEXT[id].name}</span></button>
        ))}
      </div>
      {api.phone ? <p className="pe-hint">{P.phoneTraceOnly}</p> : null}
      {tool === "spot" ? <p className="pe-hint">{TOOL_TEXT.spot.hint}</p> : null}
      {tool === "trace" ? (
        <div className="pe-group">
          <p className="pe-hint">{TOOL_TEXT.trace.hint}</p>
          <p className="pe-hint">{cellTxt(traceCe) ? fmt(P.cellText, { text: cellTxt(traceCe) }) : traceCe ? P.cellEmpty : ""}</p>
        </div>
      ) : null}
      {A && ["px", "tr", "db"].includes(kName(A.k)) ? (
        <PeSelect label={P.fixedItem} value={A.it || 0} options={[CELL_LABEL[0], ...ITEMS.map((k) => ITEM_LABEL[k])]} disabled={readOnly}
          onChange={(v) => { try { doc.setProp(A.id, "it", v, { lk: "layerLink" }); } catch (e) { /* ignore */ } api.bump(); }} />
      ) : null}
      {fam.length ? <ul className="pe-list pe-meters" translate="no">{fam.map((L) => <li key={L.id}>{meter(L)}{L.po ? " · " + T.traceOverlapLine : ""}</li>)}</ul> : null}
      <div className="pe-row">
        <button type="button" className="pe-btn" disabled={readOnly} onClick={() => { api.setOpt("pin", { kind: 2 }); setTool("pin"); }}>{P.keepPlace}</button>
        {api.adv ? <button type="button" className="pe-btn" disabled={readOnly} onClick={() => {
          const t = { spot: "spot", clone: "clone", heal: "heal", sponge: "sponge", blurB: "bsb", sharpB: "shb" }[tool] || "spot";
          const L = api.addLayer("px", { t });
          if (L) api.toast(fmt(P.layerMade, { name: layerName(L, doc) }));
        }}>{P.newRetouch}</button> : null}
      </div>
    </StagePanel>
  );
}

/* ============================================================ 스케일 바와 표식 */
export function MarkPanel({ api, doc, renderer, ws, notes, setNote, tool, setTool, adv, readOnly, headRef }) {
  const cal = doc && doc.geo && doc.geo.cal;
  const m = api.measure || cal || null;
  const [cm, setCm] = useState(cal ? cal.cm / 10 : "");   // review U2: no example value; the student types the real length
  const [ob, setOb] = useState(cal ? !!cal.ob : false);
  useEffect(() => { if (cal) { setCm(cal.cm / 10); setOb(!!cal.ob); } }, [cal && cal.cm, cal && cal.ob]);
  const [ends, setEnds] = useState(null);
  const marks = doc ? doc.layers.filter((L) => kName(L.k) === "ov" || kName(L.k) === "txt") : [];
  const nTxt = marks.filter((L) => kName(L.k) === "txt").length;
  const full = marks.length >= LIMITS.zones.mark;
  const useLong = () => {
    const c = api.compositeRGBA();
    if (!c) return;
    let box = null;
    try { box = objectBox(c.d, c.w, c.h); } catch (e) { box = null; }
    if (!box) return;
    const ox = c.w !== doc.w ? doc.wa.x : 0, oy = c.h !== doc.h ? doc.wa.y : 0;
    const horiz = box.w >= box.h;
    const seg = horiz ? { a: box.x + ox, b: Math.round(box.y + oy + box.h / 2), c: box.x + ox + box.w, d: Math.round(box.y + oy + box.h / 2) }
      : { a: Math.round(box.x + ox + box.w / 2), b: box.y + oy, c: Math.round(box.x + ox + box.w / 2), d: box.y + oy + box.h };
    api.setMeasure(seg); setEnds(seg);
  };
  const seg = ends || m;
  const applyCal = () => {
    const s = ends || api.measure || cal;
    if (!s || readOnly) return;
    if (!(Number(cm) > 0)) return;
    const c = { a: Math.round(s.a), b: Math.round(s.b), c: Math.round(s.c), d: Math.round(s.d), cm: clamp(Math.round(Number(cm) * 10), 1, 5000), ob: ob ? 1 : 0 };
    doc.setGeo({ cal: c }, "measure");
    api.setMeasure(null); setEnds(null);
  };
  const pxLen = seg ? Math.round(Math.hypot(seg.c - seg.a, seg.d - seg.b)) : 0;
  const ppc = renderer && renderer.ppc ? renderer.ppc() : null;
  const sizeTxt = ws && typeof ws["s6b.size"] === "string" ? ws["s6b.size"] : "";
  const mismatch = (() => {
    if (!cal || !sizeTxt) return "";
    const mt = /(\d+(?:\.\d+)?)\s*(cm|mm)/i.exec(sizeTxt);
    if (!mt) return "";
    const v = Number(mt[1]) * (/mm/i.test(mt[2]) ? 0.1 : 1);
    const c = cal.cm / 10;
    return v > 0 && Math.abs(v - c) / c > 0.1 ? fmt(P.sizeMismatch, { size: sizeTxt, cm: c }) : "";
  })();
  const add = (t) => {
    if (readOnly) return;
    if (full) { api.alert(P.markLimit); return; }
    const L = api.addLayer("ov", { t, p: freePreset(api, doc, renderer, t, t === "sb" ? autoBar(api, doc, renderer) : {}) });
    if (L) { api.setSelMark(L.id); api.openSection("props"); api.setTool("move"); }
  };
  const calWhatKey = "calWhat";
  return (
    <StagePanel stage="mark" api={api} notes={notes} setNote={setNote} headRef={headRef}>
      <h4>{TOOL_TEXT.measure.name}</h4>
      <div className="pe-row">
        <button type="button" className="pe-btn" aria-pressed={tool === "measure"} onClick={() => setTool("measure")} title={tooltip("measure")}>{TOOL_TEXT.measure.name}</button>
        <button type="button" className="pe-btn" onClick={useLong} disabled={readOnly}>{O.useLong}</button>
      </div>
      {adv ? (
        <div className="pe-grid4">
          {["a", "b", "c", "d"].map((k) => (
            <NumIn key={k} label={O[{ a: "startX", b: "startY", c: "endX", d: "endY" }[k]]} value={seg ? seg[k] : 0} min={-9999} max={9999}
              onChange={(v) => { const s = { ...(seg || { a: 0, b: 0, c: 0, d: 0 }), [k]: Math.round(v) }; setEnds(s); api.setMeasure(s); }} disabled={readOnly} />
          ))}
        </div>
      ) : null}
      <div className="pe-row">
        <NumIn label={O.realLen} value={cm} min={0.1} max={500} step={0.1} onChange={setCm} disabled={readOnly} allowEmpty />
        <PeCheck label={O.oblique} checked={ob} onChange={setOb} disabled={readOnly} />
      </div>
      <NoteField id="pe-calWhat" label={O.whatLen} value={(notes && notes[calWhatKey]) || ""} maxB={NOTE_CAP[calWhatKey]} rows={1}
        onChange={(t) => setNote(calWhatKey, t)} readOnly={!api.canWrite || api.locked} dataFk={"s6f.notes#" + calWhatKey} />
      <div className="pe-row">
        <button type="button" className="pe-btn" onClick={applyCal} disabled={readOnly || !(ends || api.measure || cal) || !(Number(cm) > 0)}>{P.calApply}</button>
        <span className="pe-meter" translate="no">{cal ? fmt(P.calNow, { cm: cal.cm / 10, px: Math.round(Math.hypot(cal.c - cal.a, cal.d - cal.b)) }) : seg ? pxLen + "px" : P.calNone}</span>
      </div>
      {cal && cal.ob ? <p className="pe-hint">{P.obliqueHint}</p> : null}
      {mismatch ? <p className="pe-warn" role="status">{mismatch}</p> : null}
      <h4>{MARK_TEXT.sb}</h4>
      <div className="pe-row">
        <button type="button" className="pe-btn" onClick={() => add("sb")} disabled={readOnly || !cal || full} aria-describedby={!cal ? "pe-needcal" : undefined}>{P.addBar}</button>
        {!cal ? <span id="pe-needcal" className="pe-hint">{P.needCal}</span> : null}
      </div>
      <div className="pe-row">
        <button type="button" className="pe-btn" onClick={() => add("gs")} disabled={readOnly || full}>{P.addGray}</button>
        {adv ? <button type="button" className="pe-btn" onClick={() => add("cc")} disabled={readOnly || full}>{P.addChart}</button> : null}
        {adv && feat("tag") ? <button type="button" className="pe-btn" onClick={() => add("tg")} disabled={readOnly || full}>{P.addTag}</button> : null}
      </div>
      <h4>{MARK_TEXT.txt}</h4>
      <div className="pe-row">
        <button type="button" className="pe-btn" onClick={api.addText} disabled={readOnly || nTxt >= LIMITS.zones.txt || full}>{P.addText}</button>
        <button type="button" className="pe-btn" aria-pressed={tool === "move"} onClick={() => setTool("move")} title={tooltip("move")}>{TOOL_TEXT.move.name}</button>
      </div>
      {nTxt >= LIMITS.zones.txt ? <p className="pe-hint">{P.txtMax}</p> : null}
      <p className="pe-hint">{TOOL_TEXT.text.hint}</p>
      {marks.length ? (
        <ul className="pe-list">
          {marks.map((L) => (
            <li key={L.id}>
              <button type="button" className="pe-link" aria-pressed={api.selMark === L.id}
                onClick={() => { api.setSelMark(L.id); try { doc.setActive(L.id); } catch (e) { /* ignore */ } api.openSection("props"); api.setTool("move"); api.bump(); }}>
                {fmt(P.editMark, { name: layerName(L, doc) })}</button>
              {kName(L.k) === "txt" && !readOnly ? <button type="button" className="pe-btn small" onClick={() => { api.setTool("text"); api.openText(L); }}>{P.textEdit}</button> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {(() => { const A = doc && doc.layers.find((x) => x.id === doc.activeId); return A && (kName(A.k) === "ov" || kName(A.k) === "txt") ? (
        <div className="pe-group pe-embed"><PropsPanel api={api} doc={doc} renderer={renderer} adv={adv} readOnly={readOnly} onPreview={api.preview_} onCommit={api.commit} /></div>) : null; })()}
    </StagePanel>
  );
}

/* ============================================================ 비교와 확정 */
export function FinalPanel({ api, ws, doc, renderer, notes, setNote, phrases, onAccept, onCopy, onExport, check, onConfirm, onRelease, session, readOnly, headRef }) {
  void phrases; void onAccept; void onCopy; void onExport; void check; void onConfirm; void onRelease;
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState("");
  const [slides, setSlides] = useState(false);
  const slidesRef = useRef(null);
  const live = liveEdit(api);
  let ph = { a: "", b: "", c: "" };
  try { ph = buildPhrases({ steps: ws && ws[KEYS.steps], notes: ws && ws[KEYS.notes], edit: live, ws, nowMs: nowMs() }) || ph; } catch (e) { /* core not ready */ }
  const pr = (session && session.pr) || { mode: 1, paper: 0, bw: 0, ppi: 240 };
  const setPr = (patch) => { if (!session || readOnly) return; session.pr = { ...pr, ...patch }; api.bump(); };
  const os = api.outSz();
  const edit = normEdit(ws && ws[KEYS.edit]);
  const out = edit && edit.m && edit.m.out;
  const done = !!(edit && edit.done && edit.done.at > 0);
  const noteRO = !api.canWrite || api.locked;
  const sf = api.setField;
  const writeNotes = (f) => { if (sf && !noteRO) sf(KEYS.notes, totalUpd(f)); };
  const phraseBox = (k, draft, label) => {
    const own = (notes && notes[k]) || "";
    let eff = { text: "", source: "none", stale: false };
    try { eff = effPhrase(notes, k, draft) || eff; } catch (e) { /* ignore */ }
    let gaps = [];
    if (k === "phScope") { try { gaps = phraseGaps(live, eff.text || own) || []; } catch (e) { gaps = []; } }
    return (
      <div className="pe-phrase">
        <h4>{label}</h4>
        <div className="pe-draft"><span className="pe-chip">{T.autoDraft}</span><p>{draft || <span className="pe-hint">{P.phraseNone}</span>}</p></div>
        <div className="pe-row">
          {!own && !(eff.source === "draft" && !eff.stale) ? <button type="button" className="pe-btn" disabled={noteRO || !draft} onClick={() => writeNotes((cur) => acceptDraft(cur, k, draft))}>{P.useDraft}</button>
            : own ? <Confirm label={P.toDraft} ask={P.toDraftAsk} disabled={noteRO || !draft} onConfirm={() => writeNotes((cur) => acceptDraft({ ...(isPlain(cur) ? cur : { v: 1 }), [k]: "" }, k, draft))} /> : null}
          {!own ? <button type="button" className="pe-btn" disabled={noteRO || !draft} onClick={() => { writeNotes((cur) => copyDraft(cur, k, draft)); requestAnimationFrame(() => { const el = document.getElementById("pe-" + k); if (el) el.focus(); }); }}>{P.rewrite}</button> : null}
          {eff.source === "draft" ? <span className="pe-chip">{T.autoDraft}</span> : null}
        </div>
        <NoteField id={"pe-" + k} label={P.ownText} value={own} maxB={NOTE_CAP[k]} rows={2} onChange={(t) => setNote(k, t)} readOnly={noteRO} dataFk={"s6f.notes#" + k} />
        {eff.stale ? <p className="pe-warn" role="status">{T.staleDraft}</p> : null}
        {gaps.map((g, i) => <p key={i} className="pe-warn">{g}</p>)}
      </div>
    );
  };
  const precheck = () => {
    let r = { ok: true, items: [] };
    try { r = finalizeCheck(ws, { dirty: api.dirty(), uploading: api.uploading(), feat }) || r; } catch (e) { r = { ok: true, items: [] }; }
    const blocks = (r.items || []).filter((x) => x.block !== false);
    setItems(r.items || []);
    if (!r.ok || blocks.length) {
      const first = blocks.find((x) => x.stage) || null;
      if (first && first.stage && first.stage !== "final") api.setStage(first.stage);
      return false;
    }
    return true;
  };
  const exportNow = async () => {
    if (readOnly) return;
    setBusy("export");
    try { await api.save("export", { exportFinal: true }); } finally { setBusy(""); }
  };
  const confirmNow = () => {
    if (!sf) return;
    sf(KEYS.edit, totalUpd((cur) => confirmEdit(cur, nowMs(), api.dev)));
    setItems(null);
  };
  const releaseNow = () => { if (sf) sf(KEYS.edit, totalUpd((cur) => releaseEdit(cur, nowMs(), api.dev))); };
  const copyA = async () => {
    try { await navigator.clipboard.writeText(ph.a || ""); api.toast(T.phraseCopied); } catch (e) { api.toast(T.copyFail); }
  };
  return (
    <StagePanel stage="final" api={api} notes={notes} setNote={setNote} headRef={headRef}>
      <ComparePanel api={api} renderer={renderer} mode={api.cmpMode} setMode={api.setCmpMode} />
      {edit && edit.m && edit.m.base && edit.m.base.ref ? (
        <div className="pe-row">
          <button type="button" className="pe-btn" ref={slidesRef} onClick={() => setSlides(true)}>{T.processView}</button>
          <PfViewer open={slides} onClose={() => setSlides(false)} label={T.processView} openerRef={slidesRef}>
            <ProcessSlides base={edit.m.base} snaps={edit.snaps || []} store={api.store} owner={api.ownerId} />
          </PfViewer>
        </div>
      ) : null}
      <div className="pe-group">
        <span className="pe-flabel">{NOTE_LABEL.rm}</span>
        <PeSeg label={NOTE_LABEL.rm} options={RM_LABEL.slice(1)} value={((notes && notes.rm) || 0) - 1} clearable disabled={noteRO}
          onChange={(v) => api.setNote("rm", v < 0 ? 0 : v + 1)} />
        <NoteField id="pe-rf" label={NOTE_LABEL.rf} value={(notes && notes.rf) || ""} maxB={NOTE_CAP.rf} rows={2} onChange={(t) => setNote("rf", t)} readOnly={noteRO} dataFk="s6f.notes#rf" />
      </div>
      <div className="pe-phrase">
        <h4>{P.phraseA}</h4>
        <p className="pe-draft-a">{ph.a || <span className="pe-hint">{P.phraseNone}</span>}</p>
        <button type="button" className="pe-btn small" onClick={copyA} disabled={!ph.a}>{T.copyBtn}</button>
      </div>
      {phraseBox("phScope", ph.b, P.phraseB)}
      {phraseBox("phMaking", ph.c, P.phraseC)}
      <div className="pe-group">
        <h4>{P.outputMode}</h4>
        <PeSeg label={P.outputMode} options={[P.screenPost, P.print]} value={(pr.mode || 1) - 1} onChange={(v) => setPr({ mode: v + 1, paper: v === 1 ? pr.paper || 4 : 0 })} disabled={readOnly} />
        {pr.mode === 2 ? <PeSeg label={P.print} options={[P.paperA4, P.paperA5]} value={pr.paper === 5 ? 1 : 0} onChange={(v) => setPr({ paper: v ? 5 : 4 })} disabled={readOnly} /> : null}
        <PeCheck label={P.printBw} checked={!!pr.bw} onChange={(v) => setPr({ bw: v ? 1 : 0 })} disabled={readOnly} />
        <p className="pe-readout" translate="no">{fmtPrint(os.w, os.h, pr)}</p>
      </div>
      <div className="pe-row">
        <button type="button" className="pe-btn pe-save" onClick={exportNow} disabled={readOnly || !!busy}>{busy === "export" ? P.exporting : P.exportBtn}</button>
        <span className="pe-meter" translate="no">{out ? fmt(P.exported, { w: out.w, h: out.h }) : P.exportNeed}</span>
      </div>
      {items ? (
        items.length ? (
          <div className="pe-check" role="alert">
            <h4>{P.checkTitle}</h4>
            <ul>{items.map((x, i) => <li key={i}>{x.text}{x.stage && x.stage !== "final" ? <button type="button" className="pe-link" onClick={() => api.setStage(x.stage)}>{fmt(P.checkGo, { stage: STAGE_TEXT[x.stage].name })}</button> : null}</li>)}</ul>
          </div>
        ) : <p className="pe-ok" role="status">{P.checkOk}</p>
      ) : null}
      <div className="pe-row">
        {!done ? <Confirm label={T.confirmLabel} yes={T.confirmYes} ask={T.confirmAsk} precheck={precheck} onConfirm={confirmNow} disabled={!api.canWrite || api.locked || !sf} className="pe-btn pe-save" />
          : <>
            <span className="pe-chip">{fmt(T.confirmedAt, { time: (() => { const d = new Date(edit.done.at); return (d.getMonth() + 1) + "/" + d.getDate() + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); })() })}</span>
            <Confirm label={T.release} ask={T.releaseAsk} onConfirm={releaseNow} disabled={!api.canWrite || api.locked || !sf} />
          </>}
      </div>
    </StagePanel>
  );
}

/* ============================================================ 레이어 */
function LayerThumb({ L, doc }) {
  const ref = useRef(null);
  const sig = L ? L.rev + ":" + L.vis + ":" + L.op : "base";
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const S = L ? L.surf : doc.base;
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, 40, 40);
    if (!S || !S.cv || !S.w) return;
    const s = Math.min(40 / S.w, 40 / S.h);
    try { ctx.drawImage(S.cv, (40 - S.w * s) / 2, (40 - S.h * s) / 2, S.w * s, S.h * s); } catch (e) { /* ignore */ }
  }, [sig]);
  if (L && !isPixel(L)) {
    const k = kName(L.k);
    return <span className="pe-thumb pe-thumb-p" aria-hidden="true">{k === "adj" ? "◐" : k === "flt" ? "✦" : k === "txt" ? "T" : "▭"}</span>;
  }
  return <canvas className="pe-thumb ax-keep" width={40} height={40} ref={ref} aria-hidden="true" />;
}
export function LayersPanel({ api, doc, adv, all, readOnly, phoneLock }) {
  const [renaming, setRenaming] = useState(null);
  if (!doc) return null;
  const A = doc.layers.find((L) => L.id === doc.activeId) || null;
  const final = api.stage === "final";
  const hide = new Set(api.viewHide || []);
  const rows = [...doc.layers].reverse();
  const toggleVis = (L) => {
    if (final) { const n = new Set(hide); if (n.has(L.id)) n.delete(L.id); else n.add(L.id); api.setViewHide([...n]); return; }
    if (readOnly) return;
    try { doc.setProp(L.id, "vis", L.vis === 0 ? 1 : 0, { lk: "layerVis" }); } catch (e) { /* ignore */ }
    api.render({}); api.marks();
  };
  const shown = (L) => (final ? !hide.has(L.id) && L.vis !== 0 : L.vis !== 0);
  const zoneCount = (L) => doc.layers.filter((x) => ZONE[kName(x.k)] === ZONE[kName(L.k)]).length;
  const canMerge = A && isPixel(A) && (() => { const i = doc.layers.indexOf(A); const B = doc.layers[i - 1]; return !!(B && isPixel(B) && ZONE[kName(B.k)] === ZONE[kName(A.k)] && !B.missing && !A.missing); })();
  const lockedRow = (L) => !!(L.lk || L.missing || L.opaque || (phoneLock && isPixel(L)));
  const gone = api.eng && api.eng.goneIds ? api.eng.goneIds : new Set();
  return (
    <div className="pe-layers">
      <ul className="pe-lrows" aria-label={P.layersList}>
        {rows.map((L) => (
          <li key={L.id} className="pe-layer-row" data-active={A && A.id === L.id ? "1" : ""} data-hidden={shown(L) ? "" : "1"}>
            <button type="button" className="pe-eye" aria-pressed={!shown(L)} aria-label={fmt(shown(L) ? P.hide : P.show, { name: layerName(L, doc) })}
              title={fmt(shown(L) ? P.hide : P.show, { name: layerName(L, doc) })} onClick={() => toggleVis(L)} disabled={!final && readOnly}>
              <Icon k={shown(L) ? "eye" : "eyeOff"} /></button>
            <button type="button" className="pe-lsel" aria-pressed={!!(A && A.id === L.id)} aria-label={fmt(P.layerSelect, { name: layerName(L, doc) })}
              onClick={() => { try { doc.setActive(L.id); } catch (e) { /* ignore */ } if (kName(L.k) === "ov" || kName(L.k) === "txt") api.setSelMark(L.id); api.bump(); }}>
              <LayerThumb L={L} doc={doc} />
              <span className="pe-lname" translate="no">{layerName(L, doc)}</span>
              <span className="pe-kind">{KIND_LABEL[kName(L.k)] || ""}</span>
              {L.mask ? <span className="pe-kind">{P.maskBadge}</span> : null}
              {L.missing || L.opaque ? <span className="pe-kind pe-kind-err">{P.missing}</span> : null}
              {lockedRow(L) ? <span className="pe-lock" title={P.lockedGlyph}><Icon k="lock" /><span className="ax-sr">{P.lockedGlyph}</span></span> : null}
            </button>
          </li>
        ))}
        <li className="pe-layer-row" data-active={!A ? "1" : ""}>
          <span className="pe-eye pe-eye-none" aria-hidden="true" />
          <button type="button" className="pe-lsel" aria-pressed={!A} onClick={() => { try { doc.setActive(0); } catch (e) { /* ignore */ } api.bump(); }}>
            <LayerThumb L={null} doc={doc} />
            <span className="pe-lname">{KIND_LABEL.base}</span>
            <span className="pe-lock" title={P.lockedGlyph}><Icon k="lock" /><span className="ax-sr">{P.lockedGlyph}</span></span>
          </button>
        </li>
      </ul>
      {final ? <p className="pe-hint">{P.layerCompare}</p> : null}
      {A && !final ? (
        <div className="pe-lctl" aria-label={P.selLayer}>
          <PeRange label={O.opacity} min={0} max={100} value={Math.round((A.op == null ? 1 : A.op) * 100)} disabled={readOnly || lockedRow(A)}
            onCommit={(v) => api.setLayerOp(A.id, v, true)} vt={(v) => v + "%"} num={adv} unit="%" />
          {adv && baseSpace(A) ? (
            <PeSelect label={P.blend} value={A.bl || 0} disabled={readOnly || lockedRow(A)}
              options={isPixel(A) ? BLEND_LABEL : [BLEND_LABEL[0], BLEND_LABEL[16]]}
              onChange={(v) => { const bl = isPixel(A) ? v : v ? 16 : 0; try { doc.setProp(A.id, "bl", bl, { lk: "layerBlend" }); } catch (e) { /* ignore */ } api.render({}); }} />
          ) : null}
          {adv ? <PeCheck label={P.lockLayer} checked={!!A.lk} disabled={readOnly || A.missing} onChange={(v) => { try { doc.setProp(A.id, "lk", v ? 1 : 0, { lk: "layerLock" }); } catch (e) { /* ignore */ } api.bump(); }} /> : null}
          {baseSpace(A) && !api.phone ? (
            <div className="pe-row">
              {!A.mask ? (
                <>
                  <button type="button" className="pe-btn small" disabled={readOnly || lockedRow(A)} onClick={() => { try { doc.addMask(A.id, "all"); } catch (e) { /* ignore */ } api.render({}); api.bump(); }}>{P.addMask + ": " + P.maskAll}</button>
                  <button type="button" className="pe-btn small" disabled={readOnly || lockedRow(A) || !doc.sel} onClick={() => { try { doc.addMask(A.id, "selection"); } catch (e) { /* ignore */ } api.render({}); api.bump(); }}>{P.addMask + ": " + P.maskSel}</button>
                </>
              ) : adv ? (
                <>
                  <PeRange label={P.maskSoft} min={0} max={50} value={(A.mask && A.mask.fe) || 0} disabled={readOnly || lockedRow(A)}
                    onCommit={(v) => { try { doc.setProp(A.id, "mk.fe", v, { lk: "maskFeather" }); } catch (e) { /* ignore */ } api.render({}); api.bump(); }} vt={(v) => v + "px"} num />
                  <button type="button" className="pe-btn small" disabled={readOnly || lockedRow(A)} onClick={() => { try { doc.deleteMask(A.id); } catch (e) { /* ignore */ } api.render({}); api.bump(); }}>{P.delMask}</button>
                  <button type="button" className="pe-btn small" disabled={readOnly || lockedRow(A)} onClick={() => { try { doc.invertMask(A.id); } catch (e) { /* ignore */ } api.render({}); api.bump(); }}>{P.invMask}</button>
                </>
              ) : null}
            </div>
          ) : null}
          <div className="pe-row">
            {isPixel(A) && kName(A.k) !== "ai" ? <button type="button" className="pe-btn small" disabled={readOnly || lockedRow(A)} onClick={() => api.clearLayer(A.id)}>{P.clearLayer}</button> : null}
            {(A.missing || A.opaque) && !gone.has(A.id) ? null : (
              <Confirm label={P.delLayer} ask={fmt(P.delLayerAsk, { name: layerName(A, doc) })} className="pe-btn small" disabled={readOnly || (lockedRow(A) && !gone.has(A.id))}
                onConfirm={() => { try { doc.remove(A.id); } catch (e) { /* ignore */ } api.render({}); api.marks(); api.bump(); }} />
            )}
            {adv ? <button type="button" className="pe-btn small" disabled={readOnly || zoneCount(A) < 2} aria-label={P.up} onClick={() => { try { doc.move(A.id, 1); } catch (e) { /* ignore */ } api.render({}); api.bump(); }}><Icon k="up" /><span className="ax-sr">{P.up}</span></button> : null}
            {adv ? <button type="button" className="pe-btn small" disabled={readOnly || zoneCount(A) < 2} aria-label={P.down} onClick={() => { try { doc.move(A.id, -1); } catch (e) { /* ignore */ } api.render({}); api.bump(); }}><Icon k="down" /><span className="ax-sr">{P.down}</span></button> : null}
          </div>
          {adv ? (
            renaming === A.id ? (
              <span className="pe-row">
                <label htmlFor="pe-rename" className="pe-hint">{P.layerName}</label>
                <input id="pe-rename" type="text" maxLength={LIMITS.nmChars} defaultValue={A.nm || ""} autoFocus
                  onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setRenaming(null); }}
                  onBlur={(e) => { const v = e.target.value.trim().slice(0, LIMITS.nmChars); setRenaming(null); if (v !== (A.nm || "")) { try { doc.setProp(A.id, "nm", v || null, { lk: "layerRename" }); } catch (er) { /* ignore */ } api.bump(); } }} />
              </span>
            ) : <button type="button" className="pe-btn small" disabled={readOnly} onClick={() => setRenaming(A.id)}>{P.rename}</button>
          ) : null}
          {all ? (
            <div className="pe-row">
              <button type="button" className="pe-btn small" disabled={readOnly || !isPixel(A)} onClick={() => api.layerCmd("dup")}>{P.dupLayer}</button>
              <button type="button" className="pe-btn small" disabled={readOnly || !canMerge} onClick={() => api.layerCmd("merge")}>{P.mergeDown}</button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ============================================================ 속성 */
const HS_KEYS = ["a", "r", "y", "g", "c", "b", "m"];
const CB_KEYS = ["s", "m", "h"];
const PF_PRESETS = [[236, 138, 0], [235, 177, 19], [0, 109, 255], [0, 181, 255]];
const LV_CH = ["l", "r", "g", "b"];
/** onPreview (id, p), onCommit (id, p, lk) */
export function PropsPanel({ api, doc, renderer, adv, onPreview, onCommit, readOnly }) {
  const L = doc ? doc.layers.find((x) => x.id === doc.activeId) : null;
  const [draft, setDraft] = useState(null);
  const [sub, setSub] = useState(0);
  useEffect(() => { setDraft(null); setSub(0); }, [L && L.id, L && L.rev]);
  if (!L) return <p className="pe-hint">{P.propsEmpty}</p>;
  const k = kName(L.k), t = tName(k, L.t);
  if (!["adj", "flt", "ov", "txt", "ai"].includes(k)) return <p className="pe-hint">{P.propsEmpty}</p>;
  const ro = readOnly || L.lk || L.missing || L.opaque;
  const p = draft || L.p || {};
  const val = (x) => (p[x] != null ? p[x] : ((DEF[k] || {})[t] || {})[x]);
  const live = (np) => { setDraft(np); onPreview && onPreview(L.id, pruneP(k, t, np)); };
  const commit = (np, lk) => {
    setDraft(null);
    const q = k === "ai" ? np : pruneP(k, t, np);
    if (!pOk(k, k === "txt" || k === "ai" ? undefined : t, q)) { api.alert(api.errText("limit")); api.render({}); return; }
    onCommit && onCommit(L.id, q, lk || (k === "ov" ? "markEdit:" + t : k === "txt" ? "textEdit" : "adjEdit:" + t));
  };
  const rng = (x, label, min, max, o = {}) => {
    const v = val(x);
    const sc = o.scale || 1;
    const vt = o.vt ? o.vt(v) : (sc !== 1 ? (v / sc).toFixed(sc >= 100 ? 2 : 1) : String(v)) + (o.unit || "");
    return <PeRange key={x} label={label} min={min} max={max} value={v == null ? 0 : v} disabled={ro} scale={sc} unit={o.unit}
      onInput={(n) => live({ ...p, [x]: n })} onCommit={(n) => commit({ ...p, [x]: n })} valueText={label + " " + vt} num={adv || api.phone} />;
  };
  const tupRng = (key, idx, label, min, max, def) => {
    const arr = Array.isArray(p[key]) ? p[key] : def.slice();
    const v = arr[idx];
    const set = (n) => { const a = arr.slice(); a[idx] = n; return { ...p, [key]: a }; };
    return <PeRange key={key + idx} label={label} min={min} max={max} value={v} disabled={ro} onInput={(n) => live(set(n))} onCommit={(n) => commit(set(n))}
      valueText={label + " " + (v > 0 ? "+" : "") + v} num={adv || api.phone} />;
  };
  const body = (() => {
    switch (k + ":" + t) {
      case "adj:bc": return <>{rng("b", O.brightness, adv && val("lg") ? -100 : -150, adv && val("lg") ? 100 : 150, { vt: (v) => (v > 0 ? "+" : "") + v })}{rng("c", O.contrast, adv && val("lg") ? -100 : -50, 100, { vt: (v) => (v > 0 ? "+" : "") + v })}
        {adv ? <PeCheck label={O.legacy} checked={!!val("lg")} disabled={ro} onChange={(c) => commit({ ...p, lg: c ? 1 : 0 })} /> : null}</>;
      case "adj:lv": {
        const ch = LV_CH[sub] || "l";
        let hist = null;
        try { hist = renderer.histogram(sub === 0 ? "l" : ch, { below: doc.layers.indexOf(L) }); } catch (e) { hist = null; }
        return <>
          {adv ? <PeSelect label={O.channel} value={sub} options={[O.chRgb, O.chRed, O.chGreen, O.chBlue]} onChange={setSub} /> : null}
          <LevelsWidget value={Array.isArray(p[ch]) ? p[ch] : LV_ID} hist={hist} channel={ch} disabled={ro} adv={adv || api.phone}
            onPreview={(a) => live({ ...p, [ch]: a })} onCommit={(a) => commit({ ...p, [ch]: a })} />
          <button type="button" className="pe-btn small" disabled={ro} onClick={() => {
            const a = autoFromInput(doc, renderer, L.id, "tone");   // review R2-08: the layer input; replaces the channels (no merge)
            if (a) commit({ ...a });
          }}>{O.levelsAuto}</button>
        </>;
      }
      case "adj:cv": {
        const ch = LV_CH[sub] || "l";
        let hist = null;
        try { hist = renderer.histogram(sub === 0 ? "l" : ch, { below: doc.layers.indexOf(L) }); } catch (e) { hist = null; }
        return <>
          <PeSelect label={O.channel} value={sub} options={[O.chRgb, O.chRed, O.chGreen, O.chBlue]} onChange={setSub} />
          <PeSelect label={O.curveMode} value={val("md") || 0} options={[O.curveSmooth, O.curveBasic]} onChange={(v) => commit({ ...p, md: v })} disabled={ro} />
          <CurvesWidget value={Array.isArray(p[ch]) ? p[ch] : CV_ID} hist={hist} channel={ch} mode={val("md") || 0} maxPts={api.phone ? 4 : 14} disabled={ro}
            check={(a) => pOk("adj", "cv", pruneP("adj", "cv", { ...p, [ch]: a }))} onRefuse={() => api.alert(P.curveMax)}
            onPreview={(a) => live({ ...p, [ch]: a })} onCommit={(a) => commit({ ...p, [ch]: a })} />
        </>;
      }
      case "adj:ex": return <>{rng("e", O.exposureStops, -500, 500, { scale: 100 })}{rng("o", O.offset, -500, 500, { scale: 1000 })}{rng("g", O.gamma, 10, 999, { scale: 100 })}</>;
      case "adj:hs": {
        const rk = HS_KEYS[sub] || "a";
        const changed = HS_KEYS.filter((x) => Array.isArray(p[x]) && !eqArr(p[x], Z3));
        const full = changed.length >= LIMITS.hsRanges && !changed.includes(rk);
        const cz = Array.isArray(p.cz) ? p.cz : null;
        return <>
          <PeSelect label={O.range} value={sub} options={[O.hsAll, O.hsRed, O.hsYellow, O.hsGreen, O.hsCyan, O.hsBlue, O.hsMagenta]} onChange={setSub} />
          {full ? <p className="pe-warn">{P.hsMax}</p> : null}
          {!cz ? <>{tupRng(rk, 0, O.hue, -180, 180, Z3)}{tupRng(rk, 1, O.saturation, -100, 100, Z3)}{tupRng(rk, 2, O.lightness, -100, 100, Z3)}</> : null}
          <PeCheck label={O.colorize} checked={!!cz} disabled={ro} onChange={(c) => { const n = { ...p }; if (c) n.cz = [30, 25, 0]; else delete n.cz; commit(n); }} />
          {cz ? <>{tupRng("cz", 0, O.hue, 0, 360, [30, 25, 0])}{tupRng("cz", 1, O.saturation, 0, 100, [30, 25, 0])}{tupRng("cz", 2, O.lightness, -100, 100, [30, 25, 0])}</> : null}
        </>;
      }
      case "adj:vb": return <>{rng("v", O.vibrance, -100, 100)}{rng("s", O.saturation, -100, 100)}</>;
      case "adj:cb": {
        const ck = CB_KEYS[sub] || "m";
        return <>
          <PeSeg label={O.range} options={[O.cbShadows, O.cbMids, O.cbHighs]} value={sub} onChange={(v) => setSub(v < 0 ? 1 : v)} />
          {tupRng(ck, 0, O.cbCyanRed, -100, 100, Z3)}{tupRng(ck, 1, O.cbMagentaGreen, -100, 100, Z3)}{tupRng(ck, 2, O.cbYellowBlue, -100, 100, Z3)}
          <PeCheck label={O.keepLum} checked={val("pl") !== 0} disabled={ro} onChange={(c) => commit({ ...p, pl: c ? 1 : 0 })} />
        </>;
      }
      case "adj:pf": {
        const c = val("c") || PF_PRESETS[0];
        const pi = PF_PRESETS.findIndex((x) => eqArr(x, c));
        return <>
          <PeSelect label={O.kind} value={pi < 0 ? 4 : pi} options={[O.pfWarm85, O.pfWarm81, O.pfCool80, O.pfCool82, O.pfCustom]} disabled={ro}
            onChange={(v) => { if (v < 4) commit({ ...p, c: PF_PRESETS[v] }); }} />
          {pi < 0 || adv ? <span className="pe-sel-w"><label htmlFor="pe-pf-c">{O.pfCustom}</label>
            <input id="pe-pf-c" type="color" className="ax-keep" disabled={ro} value={"#" + c.map((x) => x.toString(16).padStart(2, "0")).join("")}
              onChange={(e) => { const h = e.target.value; commit({ ...p, c: [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) }); }} /></span> : null}
          {rng("d", O.density, 0, 100, { unit: "%" })}
          <PeCheck label={O.keepLum} checked={val("pl") !== 0} disabled={ro} onChange={(cc) => commit({ ...p, pl: cc ? 1 : 0 })} />
        </>;
      }
      case "adj:gp": return <>
        <div className="pe-row">
          <button type="button" className="pe-btn small" aria-pressed={!!(api.armed && api.armed.kind === "grey")} disabled={ro} onClick={() => api.armGrey(L.id)}>{TOOL_TEXT.eyedrop.name}</button>
          <button type="button" className="pe-btn small" disabled={ro} onClick={() => api.greyFromBackground(L.id)}>{P.bgMean}</button>
        </div>
        <PeSelect label={O.gpTarget} value={val("tg") === 118 ? 1 : 0} options={[O.gpKeep, O.gpGrey]} disabled={ro} onChange={(v) => api.greyRetarget(L.id, v ? 118 : 0)} />
        {rng("k", O.gpStrength, 0, 100, { unit: "%" })}
      </>;
      case "adj:bw": {
        const tn = Array.isArray(p.tn) ? p.tn : null;
        return <>
          {adv ? ["hsRed", "hsYellow", "hsGreen", "hsCyan", "hsBlue", "hsMagenta"].map((nm, i) => tupRng("w", i, O[nm], -200, 300, DEF.adj.bw.w)) : null}
          <PeCheck label={O.tint} checked={!!tn} disabled={ro} onChange={(c) => { const n = { ...p }; if (c) n.tn = [40, 20]; else delete n.tn; commit(n); }} />
          {tn ? <>{tupRng("tn", 0, O.hue, 0, 360, [40, 20])}{tupRng("tn", 1, O.saturation, 0, 100, [40, 20])}</> : null}
        </>;
      }
      case "flt:usm": return <>{rng("a", O.amount, 0, 300, { unit: "%" })}{rng("r", O.radius, 3, 50, { scale: 10, unit: "px" })}{rng("th", O.threshold, 0, 20)}</>;
      case "flt:gb": return <>{rng("r", O.radius, 3, 200, { scale: 10, unit: "px" })}</>;
      case "flt:nz": return <>{rng("a", O.amount, 0, 200, { scale: 10, unit: "%" })}{rng("gs", O.grainSize, 1, 3)}
        <PeCheck label={O.mono} checked={val("mo") !== 0} disabled={ro} onChange={(c) => commit({ ...p, mo: c ? 1 : 0 })} /></>;
      case "flt:vg": return <>{rng("a", O.amount, -100, 100)}{rng("m", O.midpoint, 0, 100)}{(val("a") || 0) < 0 ? <p className="pe-warn">{P.vgWarn}</p> : null}</>;
      case "flt:shd": return <>{rng("sa", O.shdShadows, 0, 100, { unit: "%" })}{rng("ha", O.shdHighs, 0, 100, { unit: "%" })}{rng("r", O.radius, 5, 200, { unit: "px" })}</>;
      case "ov:sb": {
        const CMS = [0, 1, 2, 5, 10, 20, 50, 100];
        const ci = val("au") !== 0 ? 0 : Math.max(0, CMS.indexOf(Math.round((val("cm") || 50) / 10)));
        return <>
          <PeSelect label={O.length} value={ci} options={[O.auto, "1 cm", "2 cm", "5 cm", "10 cm", "20 cm", "50 cm", "100 cm"]} disabled={ro}
            onChange={(v) => { const n = { ...p }; if (v === 0) { delete n.au; Object.assign(n, autoBar(api, doc, renderer)); } else { n.au = 0; n.cm = CMS[v] * 10; delete n.sg; } commit(n); }} />
          <PeSeg label={O.dir} options={[O.horizontal, O.vertical]} value={val("o") || 0} disabled={ro} onChange={(v) => commit({ ...p, o: v < 0 ? 0 : v })} />
          <PeSelect label={O.position} value={p.x != null ? 4 : val("ps") || 0} options={[O.bottomCenter, O.bottomLeft, O.bottomRight, O.rightVertical, "–"]} disabled={ro}
            onChange={(v) => { if (v > 3) return; const n = { ...p, ps: v }; delete n.x; delete n.y; if (v === 3) n.o = 1; commit(n); }} />
          {adv ? <>
            <PeCheck label={O.mmTicks} checked={!!val("mm")} disabled={ro} onChange={(c) => commit({ ...p, mm: c ? 1 : 0 })} />
            <PeSeg label={O.labelsAll} options={[O.labelsEnds, O.labelsAll]} value={val("lb") || 0} disabled={ro} onChange={(v) => commit({ ...p, lb: v < 0 ? 0 : v })} />
            {rng("hg", O.barHeight, 0, 100)}
          </> : null}
        </>;
      }
      case "ov:gs": case "ov:cc": return <PeSelect label={O.position} value={p.x != null ? 2 : val("ps") || 0} options={[O.bottom, O.left, "–"]} disabled={ro}
        onChange={(v) => { if (v > 1) return; const n = { ...p, ps: v, o: v === 1 ? 1 : 0 }; delete n.x; delete n.y; commit(n); }} />;
      case "ov:tg": return <>
        <span className="pe-sel-w"><label htmlFor="pe-tag">{O.tagNo}</label>
          <input id="pe-tag" type="text" maxLength={LIMITS.tagChars} defaultValue={p.s || ""} disabled={ro} key={L.id + ":" + L.rev}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") e.currentTarget.blur(); }}
            onBlur={(e) => { const s = e.target.value.trim().slice(0, LIMITS.tagChars); if (s && s !== p.s) commit({ ...p, s }); }} /></span>
        <p className="pe-hint">{fmt(O.tagHint, { no: (api.ws && api.ws["s7x.no"]) || "" })}</p>
        <p className="pe-hint">{TOOL_TEXT.tag.hint}</p>
        {rng("sz", O.size, 20, 120)}
      </>;
      case "txt:_": return <>
        <p className="pe-txtprev">{p.s || ""}</p>
        <button type="button" className="pe-btn small" disabled={ro} onClick={() => { api.setTool("text"); api.openText(L); }}>{P.textEdit}</button>
        <PeSelect label={O.font} value={val("fn") || 0} options={[O.gothic, O.serif]} disabled={ro} onChange={(v) => commit({ ...p, fn: v })} />
        {rng("sz", O.size, 20, 120)}
        <PeSelect label={O.color} value={eqArr(val("c"), [0, 0, 0]) ? 0 : eqArr(val("c"), [255, 255, 255]) ? 1 : 2} options={[O.black, O.white, O.pickColor]} disabled={ro}
          onChange={(v) => { if (v < 2) commit({ ...p, c: v ? [255, 255, 255] : [0, 0, 0] }); }} />
        {!eqArr(val("c"), [0, 0, 0]) && !eqArr(val("c"), [255, 255, 255]) || adv ? <span className="pe-sel-w"><label htmlFor="pe-txt-c">{O.pickColor}</label>
          <input id="pe-txt-c" type="color" className="ax-keep" disabled={ro} value={"#" + (val("c") || [0, 0, 0]).map((x) => x.toString(16).padStart(2, "0")).join("")}
            onChange={(e) => { const h = e.target.value; commit({ ...p, c: [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) }); }} /></span> : null}
        <PeSeg label={O.weight} options={[O.normal, O.bold]} value={val("wt") || 0} disabled={ro} onChange={(v) => commit({ ...p, wt: v < 0 ? 0 : v })} />
        <PeSeg label={O.align} options={[O.alignLeft, O.alignCenter, O.alignRight]} value={val("al") || 0} disabled={ro} onChange={(v) => commit({ ...p, al: v < 0 ? 0 : v })} />
        <p className="pe-hint">{TOOL_TEXT.text.hint}</p>
      </>;
      case "ai:_": return <p className="pe-hint">{STAGE_TEXT.patch.sub}</p>;
      default: return <p className="pe-hint">{P.propsEmpty}</p>;
    }
  })();
  return (
    <div className="pe-props">
      <h4 translate="no">{fmt(P.propsOf, { name: layerName(L, doc) })}</h4>
      {body}
    </div>
  );
}

/* ---------- histogram view (input histogram of a layer, or the output) ---------- */
function HistView({ hist, h = 64, label }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    ctx.clearRect(0, 0, 256, h);
    ctx.fillStyle = "#f2f2f2"; ctx.fillRect(0, 0, 256, h);
    const b = hist && hist.bins;
    if (!b || !b.length) return;
    const sorted = Array.from(b).sort((x, y) => x - y), top = Math.max(1, sorted[Math.floor(sorted.length * 0.99)] || 1);
    ctx.fillStyle = "#555";
    for (let i = 0; i < 256; i++) { const v = Math.min(1, (b[i] || 0) / top); ctx.fillRect(i, h - v * h, 1, v * h); }
  });
  return <canvas className="pe-hist ax-keep" width={256} height={h} ref={ref} role="img" aria-label={label || ""} />;
}

/* ============================================================ 레벨 */
/** hist = renderer.histogram(ch, {below}) */
export function LevelsWidget({ value, hist, channel, onPreview, onCommit, disabled, adv }) {
  const v = Array.isArray(value) && value.length === 5 ? value : LV_ID;
  const set = (i, n) => { const a = v.slice(); a[i] = n; if (i === 0) a[0] = Math.min(n, a[2] - 2); if (i === 2) a[2] = Math.max(n, a[0] + 2); return a; };
  const gPos = (g) => Math.round(500 + 500 * Math.log10(clamp(g, 10, 999) / 100));
  const gFrom = (pos) => clamp(Math.round(100 * Math.pow(10, (pos - 500) / 500)), 10, 999);
  void channel;
  return (
    <div className="pe-levels">
      <HistView hist={hist} />
      <PeRange label={O.inBlack} min={0} max={253} value={v[0]} disabled={disabled} onInput={(n) => onPreview(set(0, n))} onCommit={(n) => onCommit(set(0, n))} valueText={O.inBlack + " " + v[0]} num={adv} />
      <PeRange label={O.gamma} min={0} max={1000} value={gPos(v[1])} disabled={disabled} onInput={(n) => onPreview(set(1, gFrom(n)))} onCommit={(n) => onCommit(set(1, gFrom(n)))} valueText={O.gamma + " " + (v[1] / 100).toFixed(2)}
        num={adv} numStep={0.01} numTo={(pos) => (gFrom(pos) / 100).toFixed(2)} numFrom={(x) => gPos(Math.round(x * 100))} onNum={(x) => onCommit(set(1, clamp(Math.round(x * 100), 10, 999)))} />
      <PeRange label={O.inWhite} min={2} max={255} value={v[2]} disabled={disabled} onInput={(n) => onPreview(set(2, n))} onCommit={(n) => onCommit(set(2, n))} valueText={O.inWhite + " " + v[2]} num={adv} />
      <PeRange label={O.outBlack} min={0} max={255} value={v[3]} disabled={disabled} onInput={(n) => onPreview(set(3, n))} onCommit={(n) => onCommit(set(3, n))} valueText={O.outBlack + " " + v[3]} num={adv} />
      <PeRange label={O.outWhite} min={0} max={255} value={v[4]} disabled={disabled} onInput={(n) => onPreview(set(4, n))} onCommit={(n) => onCommit(set(4, n))} valueText={O.outWhite + " " + v[4]} num={adv} />
    </div>
  );
}

/* ============================================================ 곡선 */
/** points flat [x0,y0,…], x0 = 0 and last x = 255 (end points move vertically only); calls check (pOk) before committing a point */
export function CurvesWidget({ value, hist, channel, mode, maxPts, onPreview, onCommit, disabled, check, onRefuse }) {
  const pts0 = Array.isArray(value) && value.length >= 4 ? value : CV_ID;
  const [pts, setPts] = useState(pts0);
  const [sel, setSel] = useState(-1);
  const drag = useRef(null);
  const svgRef = useRef(null);
  useEffect(() => { setPts(pts0); }, [pts0.join(","), channel]);
  const n = pts.length / 2;
  const S = 200;
  let lut = null;
  try { lut = curveLut(pts, mode || 0); } catch (e) { lut = null; }
  const ident = !lut || Array.from(lut).every((x, i) => x === i);
  const path = (() => {
    if (lut && !(ident && !eqArr(pts, CV_ID))) { let d = ""; for (let i = 0; i < 256; i += 3) d += (i ? "L" : "M") + ((i / 255) * S).toFixed(1) + " " + (S - (lut[i] / 255) * S).toFixed(1); return d + "L" + S + " " + (S - (lut[255] / 255) * S).toFixed(1); }
    let d = ""; for (let i = 0; i < n; i++) d += (i ? "L" : "M") + ((pts[2 * i] / 255) * S).toFixed(1) + " " + (S - (pts[2 * i + 1] / 255) * S).toFixed(1); return d;
  })();
  const ok = (a) => (check ? check(a) : true);
  const commit = (a) => { if (!ok(a)) { onRefuse && onRefuse(); setPts(pts0); onPreview(pts0); return; } onCommit(a); };
  const movePt = (i, x, y) => {
    const a = pts.slice();
    const last = i === n - 1;
    if (i === 0) a[0] = 0; else if (last) a[2 * i] = 255; else a[2 * i] = clamp(Math.round(x), a[2 * i - 2] + 1, a[2 * i + 2] - 1);
    a[2 * i + 1] = clamp(Math.round(y), 0, 255);
    return a;
  };
  const addPt = (x, y) => {
    if (n >= (maxPts || 14)) { onRefuse && onRefuse(); return null; }
    const xi = Math.round(clamp(x, 1, 254));
    let i = 1;
    while (i < n && pts[2 * i] < xi) i++;
    if (pts[2 * i] === xi) return null;
    const a = [...pts.slice(0, 2 * i), xi, clamp(Math.round(y), 0, 255), ...pts.slice(2 * i)];
    if (!ok(a)) { onRefuse && onRefuse(); return null; }
    return { a, i };
  };
  const local = (e) => {
    const r = svgRef.current.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 255, y: 255 - ((e.clientY - r.top) / r.height) * 255 };
  };
  const onDown = (e) => {
    if (disabled) return;
    const q = local(e);
    let i = -1;
    for (let j = 0; j < n; j++) if (Math.hypot(pts[2 * j] - q.x, pts[2 * j + 1] - q.y) < 10) { i = j; break; }
    if (i < 0) { const r = addPt(q.x, q.y); if (!r) return; setPts(r.a); i = r.i; onPreview(r.a); }
    setSel(i);
    drag.current = { i };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
  };
  const onMove = (e) => { if (!drag.current) return; const q = local(e); const a = movePt(drag.current.i, q.x, q.y); setPts(a); onPreview(a); };
  const onUp = () => { if (!drag.current) return; drag.current = null; commit(pts); };
  const onKey = (e, i) => {
    const st = e.shiftKey ? 10 : 1;
    let a = null;
    if (e.key === "ArrowUp") a = movePt(i, pts[2 * i], pts[2 * i + 1] + st);
    else if (e.key === "ArrowDown") a = movePt(i, pts[2 * i], pts[2 * i + 1] - st);
    else if (e.key === "ArrowLeft") a = movePt(i, pts[2 * i] - st, pts[2 * i + 1]);
    else if (e.key === "ArrowRight") a = movePt(i, pts[2 * i] + st, pts[2 * i + 1]);
    else if ((e.key === "Delete" || e.key === "Backspace") && i > 0 && i < n - 1) { a = [...pts.slice(0, 2 * i), ...pts.slice(2 * i + 2)]; e.preventDefault(); e.stopPropagation(); setPts(a); setSel(-1); commit(a); return; }
    else if (e.key === "Insert") { e.preventDefault(); e.stopPropagation(); addMid(i); return; }
    if (!a) return;
    e.preventDefault(); e.stopPropagation();
    setPts(a); onPreview(a);
  };
  const onKeyUp = (e) => { if (e.key.startsWith("Arrow")) commit(pts); };
  const addMid = (after) => {
    const i = after >= 0 && after < n - 1 ? after : 0;
    const x = (pts[2 * i] + pts[2 * i + 2]) / 2, y = lut ? lut[Math.round(x)] : (pts[2 * i + 1] + pts[2 * i + 3]) / 2;
    const r = addPt(x, y);
    if (!r) return;
    setPts(r.a); setSel(r.i); commit(r.a);
  };
  return (
    <div className="pe-curves">
      <div className="pe-curves-box">
        <HistView hist={hist} h={S} />
        <svg ref={svgRef} className="pe-curves-svg" viewBox={"0 0 " + S + " " + S} width={S} height={S} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          {[1, 2, 3].map((i) => <g key={i}><line x1={(S * i) / 4} y1="0" x2={(S * i) / 4} y2={S} stroke="#ccc" /><line y1={(S * i) / 4} x1="0" y2={(S * i) / 4} x2={S} stroke="#ccc" /></g>)}
          <line x1="0" y1={S} x2={S} y2="0" stroke="#bbb" strokeDasharray="3 3" />
          <path d={path} fill="none" stroke="#111" strokeWidth="1.5" />
          {Array.from({ length: n }, (_, i) => (
            <circle key={i} cx={(pts[2 * i] / 255) * S} cy={S - (pts[2 * i + 1] / 255) * S} r={i === sel ? 6 : 5} fill={i === sel ? "#1f5fbf" : "#fff"} stroke="#111"
              tabIndex={disabled ? -1 : 0} role="slider" aria-label={P.handle + " " + (i + 1)} aria-valuemin={0} aria-valuemax={255} aria-valuenow={pts[2 * i + 1]}
              aria-valuetext={P.handle + " " + (i + 1) + ": " + pts[2 * i] + ", " + pts[2 * i + 1]}
              onFocus={() => setSel(i)} onKeyDown={(e) => onKey(e, i)} onKeyUp={onKeyUp} />
          ))}
        </svg>
      </div>
      <div className="pe-row">
        <button type="button" className="pe-btn small" disabled={disabled} onClick={() => addMid(sel)}>{P.addPoint}</button>
        <span className="pe-hint" translate="no">{n + " / " + (maxPts || 14)}</span>
      </div>
    </div>
  );
}

/* ============================================================ 작업 내역 */
export function HistoryPanel({ api, doc }) {
  if (!doc) return null;
  let list = [];
  try { list = doc.list() || []; } catch (e) { list = []; }
  const cur = list.findIndex((x) => x.cur);
  const ro = !api || !api.editable;
  const go = (i) => { if (ro) return; try { doc.jumpTo(i); } catch (e) { /* ignore */ } api.render({}); api.marks(); api.bump(); };
  return (
    <ol className="pe-hlist" aria-label={P.histList}>
      <li data-cur={cur < 0 ? "1" : ""}><button type="button" className="pe-hrow" aria-current={cur < 0 ? "step" : undefined} disabled={ro} onClick={() => go(-1)}>{P.histFirst}</button></li>
      {list.map((x) => (
        <li key={x.i} data-cur={x.cur ? "1" : ""} data-later={cur >= 0 && x.i > cur ? "1" : ""}>
          <button type="button" className="pe-hrow" aria-current={x.cur ? "step" : undefined} disabled={ro} onClick={() => go(x.i)}>
            <span>{histLabel(x)}</span>{x.stage && STAGE_TEXT[x.stage] ? <span className="pe-hint"> · {STAGE_TEXT[x.stage].name}</span> : null}</button>
        </li>
      ))}
    </ol>
  );
}

/* ============================================================ 히스토그램 · 정보 */
export function InfoPanel({ api, renderer, doc, sampleSize }) {
  const [ch, setCh] = useState(0);
  const CH = ["l", "rgb", "r", "g", "b"];
  const key = doc ? doc.rev + ":" + ch + ":" + JSON.stringify(doc.geo || {}).length : "";
  const memo = useRef({ key: "", h: null });
  if (memo.current.key !== key) {
    let h = null;
    try { h = renderer.histogram(CH[ch]); } catch (e) { h = null; }
    memo.current = { key, h };
  }
  const h = memo.current.h;
  const pct = (v) => (v == null ? "0.0" : (v > 1 ? v : v * 100).toFixed(1));
  const s = (api && api.eng && (api.eng.picked || api.eng.hover)) || null;
  const os = api ? api.outSz() : { w: 0, h: 0 };
  const pr = (api && api.session && api.session.pr) || { ppi: CLASS_DEFAULTS.ppi };
  const cm = (px) => Math.round(((px / (pr.ppi || 240)) * 2.54) * 10) / 10;
  let selBox = null;
  try { selBox = doc && doc.sel && doc.sel.m ? (doc.sel.bbox || null) : null; } catch (e) { selBox = null; }
  return (
    <div className="pe-info">
      <PeSelect label={P.histChannel} value={ch} options={[P.histLum, P.histRgb, P.histRed, P.histGreen, P.histBlue]} onChange={setCh} />
      <HistView hist={h} h={100} label={P.secHist} />
      <dl className="pe-dl" translate="no">
        <dt>{P.histMean}</dt><dd>{h ? (+h.mean || 0).toFixed(1) : "–"}</dd>
        <dt>{P.histSd}</dt><dd>{h ? (+h.sd || 0).toFixed(1) : "–"}</dd>
        <dt>{P.histMedian}</dt><dd>{h ? Math.round(+h.median || 0) : "–"}</dd>
      </dl>
      {h && (h.clipLo > 0.005 || h.clipLo > 0.5) ? <p className="pe-warn">{fmt(P.clipLo, { n: pct(h.clipLo) })}</p> : null}
      {h && (h.clipHi > 0.005 || h.clipHi > 0.5) ? <p className="pe-warn">{fmt(P.clipHi, { n: pct(h.clipHi) })}</p> : null}
      <dl className="pe-dl" translate="no">
        <dt>{P.infoPos}</dt><dd>{s ? "x " + s.x + " y " + s.y : "–"}</dd>
        <dt>{P.infoRgb}</dt><dd>{s ? Math.round(s.r) + "·" + Math.round(s.g) + "·" + Math.round(s.b) : "–"}</dd>
        <dt>{P.infoBright}</dt><dd>{s ? Math.round(0.3 * s.r + 0.59 * s.g + 0.11 * s.b) : "–"}</dd>
        <dt>{P.infoNeutral}</dt><dd>{s ? Math.round(Math.max(s.r, s.g, s.b) - Math.min(s.r, s.g, s.b)) : "–"}</dd>
        <dt>{O.sampleSize}</dt><dd>{sampleSize + "×" + sampleSize}</dd>
      </dl>
      <p className="pe-readout" translate="no">{doc ? fmt(P.docSize, { w: doc.w, h: doc.h }) : ""}</p>
      <p className="pe-readout" translate="no">{fmt(P.printInfo, { w: os.w, h: os.h, cw: cm(os.w), ch: cm(os.h), ppi: pr.ppi || 240 })}</p>
      {selBox ? <p className="pe-readout" translate="no">{fmt(P.selSize, { w: selBox.w, h: selBox.h })}</p> : null}
    </div>
  );
}

/* ============================================================ 전후 비교 */
/** live modes. The wipe uses its own range (value = 다듬기 전 share on the left, review U6) instead of WipeSlider, whose value is the after share */
export function ComparePanel({ api, renderer, mode, setMode }) {
  void renderer;
  const MODES = ["none", "wipe", "side", "marks"];
  const i = Math.max(0, MODES.indexOf(mode || "none"));
  const c = api && api.eng && api.eng.cov;
  const pm = (c && c.permille) || {};
  return (
    <div className="pe-cmp" data-mode={mode || "none"}>
      <h4>{TOOL_TEXT.compare.name}</h4>
      <PeSeg label={TOOL_TEXT.compare.name} options={[P.cmpNone, P.cmpWipe, P.cmpSide, P.cmpMarks]} value={i} onChange={(v) => setMode(MODES[v < 0 ? 0 : v])} />
      {mode === "wipe" ? (
        /* review U6: 다듬기 전 on the left; the divider follows the thumb (value = the before share) */
        <PeRange label={P.cmpWipeLabel} min={0} max={100} value={api.wipe} onInput={api.setWipe} onCommit={api.setWipe} vt={(v) => fmt(P.cmpWipeValue, { a: v, b: 100 - v })} outText={(v) => v + "%"} />
      ) : null}
      {mode === "side" ? <PeCheck label={P.origLayout} checked={!!api.origLayout} onChange={api.setOrigLayout} /> : null}
      {mode === "marks" ? (
        <ul className="pe-legend ax-keep">
          <li><span className="pe-sw pe-sw-ai" aria-hidden="true" />{fmt(P.legendAi, { area: fmtArea(pm.ai || 0) })}</li>
          <li><span className="pe-sw pe-sw-hand" aria-hidden="true" />{fmt(P.legendHand, { area: fmtArea(pm.hand || 0) })}</li>
          <li><span className="pe-sw pe-sw-trace" aria-hidden="true" />{fmt(P.legendTrace, { area: fmtArea(pm.trace || 0) })}</li>
          <li><span className="pe-sw pe-sw-local" aria-hidden="true" />{fmt(P.legendLocal, { area: fmtArea(pm.local || 0) })}</li>
        </ul>
      ) : null}
    </div>
  );
}

export const PE_PANELS_CSS = `
.pe-panel{display:flex;flex-direction:column;gap:8px}
.pe-panel>button,.pe-phrase>button,.pe-group>button,.pe-props>button,.pe-levels>button{align-self:flex-start}
.pe-flabel{font-size:14px;font-weight:700}
.pe-note-dock{position:sticky;bottom:0;background:#fff;border-top:1px solid #ddd;padding:4px 0 2px;z-index:1}
.pe-note-dock .pf-note{margin:0}
.pe-sheet .pe-note-dock{position:static;border-top:1px solid #ebebeb}
.pe-note-dock label{font-size:14px;font-weight:700}
.pe-panel h2.pe-stage-h{font-size:18px;margin:0;line-height:1.3}
.pe-panel h4,.pe-props h4,.pe-cmp h4{font-size:13px;margin:6px 0 2px;font-weight:700}
.pe-sub{margin:0;font-size:13px;color:#444}
.pe-hidden{margin:0;padding:6px 8px;border:1px dashed #767676;border-radius:6px;font-size:13px}
.pe-row{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.pe-group{display:flex;flex-direction:column;gap:6px;padding:6px 0;border-top:1px solid #ebebeb}
.pe-adv{border-top:1px dashed #c8c8c8;padding-top:6px}
.pe-grid4{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;align-items:end}
.pe-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:6px}
.pe-tile{justify-content:center;min-height:38px;text-align:center}
.pe-tile svg{flex:0 0 auto}
.pe-log ol{margin:0;padding-left:18px;font-size:12px}
.pe-log h4{margin:0}
.pe-plan{margin:0;font-size:13px}
.pe-items{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.pe-item{border:1px solid #ddd;border-radius:6px;padding:6px 8px;display:flex;flex-direction:column;gap:4px}
.pe-item[data-s="2"]{border-color:#B5382A}
.pe-item-h{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.pe-item-l{font-size:14px;font-weight:700}
.pe-chip{font-size:11px;font-weight:700;padding:1px 6px;border:1px solid #767676;border-radius:999px;white-space:nowrap}
.pe-chip-go{border-color:#31684F;color:#31684F}
.pe-chips{margin:0;display:flex;gap:4px;flex-wrap:wrap}
.pe-pair p{margin:0;font-size:13px}
.pe-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;font-size:13px}
.pe-list li{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.pe-link{all:unset;cursor:pointer;text-decoration:underline;font-size:13px}
.pe-link[aria-pressed="true"]{font-weight:700}
.pe-link:focus-visible{outline:3px solid #1f5fbf}
.pe-nudge{display:inline-flex;gap:3px;align-items:center;flex-wrap:wrap}
.pe-result,.pe-readout{margin:0;font-size:13px}
.pe-warn{margin:0;font-size:13px;color:#8e1b10}
.pe-ok{margin:0;font-size:13px;color:#31684F}
.pe-range-w{display:grid;grid-template-columns:minmax(64px,auto) minmax(80px,1fr) auto;align-items:center;gap:6px;font-size:13px;width:100%}
.pe-opts .pe-range-w{width:auto;grid-template-columns:auto 110px auto}
.pe-range{width:100%;min-width:0}
.pe-range-v{font-size:12px;min-width:36px;text-align:right;white-space:nowrap}
.pe-num{width:64px;font:inherit;font-size:13px;padding:2px 4px;border:1px solid #767676;border-radius:4px}
.pe-numw{display:flex;flex-direction:column;gap:2px;font-size:12px}
.pe-numw .pe-num{width:100%}
.pe-sel-w{display:inline-flex;align-items:center;gap:6px;font-size:13px}
.pe-sel-w select,.pe-sel-w input[type=text]{font:inherit;font-size:13px;padding:3px 4px;border:1px solid #767676;border-radius:4px;max-width:200px}
.pe-chk{display:inline-flex;align-items:center;gap:4px;font-size:13px}
.pe-seg{display:inline-flex;flex-wrap:wrap;gap:4px}
.pe-seg button{font:inherit;font-size:13px;padding:4px 10px;border:1px solid #767676;border-radius:6px;background:#fff;color:#111;cursor:pointer;min-height:30px}
.pe-seg button[aria-pressed="true"]{background:#111;color:#fff}
.pe-seg button:disabled{opacity:.5;cursor:not-allowed}
.pe-swatch{display:inline-block;width:20px;height:20px;border:1px solid #767676;border-radius:4px;forced-color-adjust:none}
.pe-details summary{cursor:pointer;font-size:13px}
.pe-layers{display:flex;flex-direction:column;gap:6px}
.pe-lrows{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px}
.pe-layer-row{display:flex;align-items:center;gap:4px;border:1px solid transparent;border-radius:6px}
.pe-layer-row[data-active="1"]{border-color:#111;background:#f6f6f6}
.pe-layer-row[data-hidden="1"] .pe-lname{text-decoration:line-through;color:#5f5f5f}
.pe-eye{width:32px;height:32px;display:flex;align-items:center;justify-content:center;border:1px solid #c8c8c8;border-radius:4px;background:#fff;cursor:pointer;flex:0 0 auto;padding:0}
.pe-eye-none{border-color:transparent;cursor:default}
.pe-lsel{all:unset;box-sizing:border-box;flex:1 1 auto;display:flex;align-items:center;gap:6px;min-width:0;padding:3px 4px;cursor:pointer;flex-wrap:wrap}
.pe-lsel:focus-visible{outline:3px solid #1f5fbf}
.pe-thumb{width:40px;height:40px;border:1px solid #ddd;background:repeating-conic-gradient(#eee 0 25%,#fff 0 50%) 0 0/10px 10px;flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;font-size:18px}
.pe-thumb-p{background:#f6f6f6}
.pe-lname{font-size:13px;font-weight:700;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pe-kind{font-size:11px;padding:0 5px;border:1px solid #767676;border-radius:999px;white-space:nowrap}
.pe-kind-err{border-color:#B5382A;color:#8e1b10}
.pe-lock{display:inline-flex;color:#5f5f5f}
.pe-lctl{display:flex;flex-direction:column;gap:6px;border-top:1px solid #ebebeb;padding-top:6px}
.pe-lctl>button{align-self:flex-start}
.pe-props{display:flex;flex-direction:column;gap:6px}
.pe-txtprev{margin:0;padding:4px 6px;border:1px solid #ddd;border-radius:4px;white-space:pre-wrap;font-size:13px;min-height:1.6em}
.pe-hist{display:block;width:100%;max-width:256px;height:auto;border:1px solid #ddd;forced-color-adjust:none}
.pe-levels{display:flex;flex-direction:column;gap:4px}
.pe-curves-box{position:relative;width:200px;height:200px}
.pe-curves-box .pe-hist{position:absolute;inset:0;width:200px;height:200px;max-width:none;opacity:.6}
.pe-curves-svg{position:absolute;inset:0;touch-action:none;cursor:crosshair;border:1px solid #767676;forced-color-adjust:none}
.pe-curves-svg circle:focus-visible{outline:none;stroke:#1f5fbf;stroke-width:3}
.pe-hlist{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:2px;max-height:280px;overflow-y:auto}
.pe-hrow{all:unset;box-sizing:border-box;display:block;width:100%;padding:4px 8px;border:1px solid transparent;border-radius:4px;font-size:13px;cursor:pointer}
.pe-hrow[aria-current="step"]{border-color:#111;font-weight:700}
.pe-hlist li[data-later="1"] .pe-hrow{border:1px dashed #767676;color:#5f5f5f}
.pe-hrow:focus-visible{outline:3px solid #1f5fbf}
.pe-hrow:disabled{cursor:default}
.pe-info{display:flex;flex-direction:column;gap:6px}
.pe-dl{display:grid;grid-template-columns:auto 1fr;gap:2px 10px;margin:0;font-size:12px}
.pe-dl dt{color:#444}.pe-dl dd{margin:0}
.pe-cmp{display:flex;flex-direction:column;gap:6px}
.pe-legend{list-style:none;margin:0;padding:0;font-size:12px;display:flex;flex-direction:column;gap:3px;forced-color-adjust:none}
.pe-legend li{display:flex;align-items:center;gap:6px}
.pe-sw{width:18px;height:12px;border:1px solid #767676;display:inline-block}
.pe-sw-ai{background:repeating-linear-gradient(45deg,#1f5fbf 0 2px,transparent 2px 6px)}
.pe-sw-hand{background:repeating-linear-gradient(-45deg,#b35400 0 2px,transparent 2px 6px)}
.pe-sw-trace{background:radial-gradient(#6a1b9a 1.5px,transparent 1.6px) 0 0/5px 5px}
.pe-sw-local{border:1px dashed #111}
.pe-phrase{display:flex;flex-direction:column;gap:4px;border-top:1px solid #ebebeb;padding-top:6px}
.pe-draft{border:1px solid #ddd;background:#f6f6f6;border-radius:6px;padding:6px 8px;font-size:13px}
.pe-draft p,.pe-draft-a{margin:4px 0 0;font-size:13px}
.pe-check{border:1px solid #B5382A;background:#F8ECEA;border-radius:6px;padding:6px 8px;font-size:13px}
.pe-check ul{margin:0;padding-left:18px}
.pe-meters{font-size:12px}
.pe-phone .pe-range-w{grid-template-columns:minmax(64px,auto) minmax(80px,1fr) auto}
`;
