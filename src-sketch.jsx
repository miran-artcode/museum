/* ============================================================
   디지털 에스키스 (4차시 「에스키스와 화면 설계」 s4c.sketchpad)
   ------------------------------------------------------------
   미술 전공 학생이 종이나 태블릿 그림 앱 대신 쓸 수 있게 만든 그리기 도구.
   파일 구성
     src-sketch.jsx            이 파일: 화면, 포인터·제스처, 선택·변형·조정, 저장·자동 저장·버전·초안
     src-sketch-engine.mjs     그리기 엔진: 붓, 레이어, 되돌리기, 과정 기록
     src-sketch-core.mjs       순수 계산: 색, 도형 바로잡기, 채우기 영역, 조정, 안내선, 기록 꾸리기
     src-sketch-ui.jsx         아이콘과 공용 부품
     src-sketch-color.jsx      색 창            src-sketch-brushpanel.jsx  브러시 보관함·설정
     src-sketch-layers.jsx     레이어 창        src-sketch-history.jsx     기록 창·과정 다시 보기
     src-sketch-read.jsx       교사 읽기 화면
   기능
     · 붓 10종(연필·펜·붓펜·마커·평붓·수채·목탄·파스텔·에어브러시·스프레이) + 번짐 + 지우개, 붓마다 설정 저장
     · 필압·기울기(펜), 손떨림 보정, 그리다 멈추면 도형으로 바로잡기, Shift 직선, 대칭 그리기, 안내선에 맞춰 그리기
     · 채우기, 도형, 글자, 스포이트, 선택(사각형·타원·올가미·자동)과 변형(이동·크기·회전·뒤집기), 조정(색조·밝기·흐림 등)
     · 레이어 8장: 혼합 모드, 불투명도, 알파 잠금, 잠금, 복제, 합치기. 모든 작업을 60단계까지 되돌린다
     · 화면: 확대·이동·회전(두 손가락)·좌우 반전 보기, 안내선(격자·삼분할·세 칸·등각·투시 1점·2점·대칭), 크게 그리기
     · 저장: 합친 그림(ref) + 레이어별 그림 + 과정 기록. 2분마다 자동 저장, 저장 버전 15개, 과정 다시 보기
       앞 저장본의 문서는 기록지 값이 새 값으로 바뀐 것을 본 뒤에 지운다. 한 장이라도 못 올리면 저장하지 않는다
     · 저장하지 않은 그림은 이 브라우저(IndexedDB)에 초안으로 두어 탭을 옮기거나 닫아도 이어진다
     · 읽기 실패와 「없음」을 구분한다: 읽지 못했으면 빈 캔버스에 그려 덮어쓰지 못하게 막고 다시 불러오게 한다
   값 모양
     { ref, at, w, h, paper, keep, stats, guide?,
       layers: [{ id, name, op, vis, blend, alock, lock, parts: [{ ref }] }],   (옛 값: { ref, name, op, vis })
       log: { parts: [{ ref }], n },  versions: [{ ref, at, w, h, n }] }
     교사 화면·집계는 ref(합친 그림)만 읽는다. ref만 있는 옛 값(720×480 JPEG)도 읽는다.
     collectMediaRefs(src-app.jsx)가 안쪽의 ref를 모두 모으므로 학번 변경·기록 초기화 때 함께 옮겨지고 지워진다.
   ============================================================ */
import React, { useState, useEffect, useRef, useContext } from "react";
import { flushSync } from "react-dom";
import { WsLockCtx, WsSavedCtx } from "./src-ws-lock.jsx";
import { clamp, fitShape, guideLines, assistSnap, matTRS, matApply } from "./src-sketch-core.mjs";
import {
  Engine, BRUSHES, BRUSH, RATIOS, PAPERS, paperColor, MAX_LAYERS, ADJUSTS, TEXT_FONTS, textFont, PART_MAX, LOG_PREFIX,
  encodeOpaque, encodeLayer, blobOf, loadImg, packLog, unpackLog, putParts, getParts, fetchLayer, readDoc, FAILED, refsOf, logStats, opLabel, freeCanvas,
} from "./src-sketch-engine.mjs";
import { Icon, IconBtn, Seg, Range, PanelHead } from "./src-sketch-ui.jsx";
import { ColorPanel, SKETCH_COLOR_CSS } from "./src-sketch-color.jsx";
import { LayersPanel, SKETCH_LAYERS_CSS } from "./src-sketch-layers.jsx";
import { HistoryPanel, ReplayPlayer, SKETCH_HISTORY_CSS } from "./src-sketch-history.jsx";
import { BrushPanel, SKETCH_BRUSH_CSS } from "./src-sketch-brushpanel.jsx";
import { SketchRead, SKETCH_READ_CSS } from "./src-sketch-read.jsx";

export { SketchRead };

/* 저장하지 않은 스케치 상태 — src-app.jsx의 차시 이동 확인(current)과 창 닫기 경고(unsaved)가 읽는다.
   current: 지금 화면을 떠나면 획이 사라지는가(초안 보관이 아직 안 됐거나 실패했을 때 true)
   unsaved: 서버에 저장하지 않은 변경이 있는가 */
export const sketchDirty = { current: false, unsaved: false, flush: null };
/* flush: 나가기 전에 src-app.jsx가 부르는 저장 함수(진행 중인 저장을 기다리고, 남은 변경을 한 번 저장해 본다). 스케치가 화면에 없으면 null */

const PREFS_KEY = "museum:sketchPrefs2";
const PREFS_FIELD = "_skp";            // 기록지에 함께 두는 붓 설정·내 팔레트(밑줄 키: 수정 이력·집계에서 빠진다)
const DRAFT_DB = "museum-sketch", DRAFT_STORE = "drafts";
const VERSIONS_MAX = 15, VERSION_GAP = 10 * 60000, AUTOSAVE_GAP = 120000;

const PALETTE = [
  ["#111111", "검정"], ["#444444", "진회색"], ["#777777", "회색"], ["#AAAAAA", "밝은 회색"], ["#DDDDDD", "연회색"], ["#FFFFFF", "흰색"],
  ["#5B3A29", "세피아"], ["#8A3B2E", "번트 시에나"], ["#B5462F", "상긴"], ["#C8963E", "옐로 오커"], ["#6B6B2E", "올리브"], ["#2E3A5C", "인디고"],
  ["#D63A2F", "빨강"], ["#EE7F2D", "주황"], ["#F2C12E", "노랑"], ["#3A8C4A", "초록"], ["#1F8A8A", "청록"], ["#2F62B5", "파랑"],
  ["#6F4AA0", "보라"], ["#E2789A", "분홍"],
];

/* 붓 말고의 도구 */
const EXTRA = [
  { k: "fill", name: "채우기", key: "g" },
  { k: "shape", name: "도형", key: "u", min: 1, max: 40, dash: true },
  { k: "text", name: "글자", key: "t", min: 16, max: 200 },
  { k: "select", name: "선택", key: "m" },
  { k: "xform", name: "변형", key: "v" },
  { k: "picker", name: "스포이트", key: "i" },
  { k: "hand", name: "화면 이동", key: "h" },
];
const TOOL = { ...BRUSH, ...Object.fromEntries(EXTRA.map((t) => [t.k, t])) };
const isDrawBrush = (k) => !!BRUSH[k] && !BRUSH[k].erase && BRUSH[k].eng !== "smudge";
const SHAPES = [["line", "직선"], ["arrow", "화살표"], ["rect", "사각형"], ["ellipse", "타원"]];
const DASHES = [["solid", "실선"], ["dash", "파선"], ["dot", "점선"]];
const GUIDES = [["none", "없음"], ["grid", "격자"], ["thirds", "삼분할"], ["three", "세 칸"], ["iso", "등각"], ["persp1", "투시 1점"], ["persp2", "투시 2점"], ["sym", "대칭"]];
const SYMS = [["v", "좌우"], ["h", "상하"], ["quad", "네 방향"], ["radial", "방사"]];
const SEL_KINDS = [["rect", "사각형"], ["ellipse", "타원"], ["lasso", "올가미"], ["wand", "자동"]];
const SEL_OPS = [["new", "새로"], ["add", "더하기"], ["sub", "빼기"]];
const ASSIST_KINDS = ["grid", "iso", "persp1", "persp2"];
const QUICK_NAMES = { line: "직선", ellipse: "타원", circle: "원", rect: "사각형", poly: "다각형" };

/* 한글 자판 상태(맥·아이패드 외장 키보드)에서는 e.key가 자모로 오므로 그때만 물리 키 위치로 읽는다 */
const keyOf = (e) => {
  const k = e.key || "";
  if (k.length > 1 || /^[\x20-\x7e]$/.test(k)) return k;
  const m = /^Key([A-Z])$/.exec(e.code || "");
  return m ? m[1].toLowerCase() : k;
};
let zoomCache = { at: 0, z: 1 };
/* 학습 지원의 글자 크기(body zoom) */
const bodyZoom = () => {
  const now = Date.now();
  if (now - zoomCache.at > 500) { zoomCache = { at: now, z: parseFloat(getComputedStyle(document.body).zoom) || 1 }; }
  return zoomCache.z;
};
const isHex = (c) => typeof c === "string" && /^#[0-9A-F]{6}$/i.test(c);
const pad2 = (n) => String(n).padStart(2, "0");

const ss = {
  get(k) { try { const s = sessionStorage.getItem(k); return s ? JSON.parse(s) : null; } catch (e) { return null; } },
  set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};

/* 초안 보관(IndexedDB). 쓸 수 없는 환경(사생활 보호 창 등)에서는 모든 호출이 조용히 실패한다 */
const idb = (() => {
  let dbp = null, ok = null;   // ok: 초안 저장소를 쓸 수 있는가(null이면 아직 모름)
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    try {
      const rq = indexedDB.open(DRAFT_DB, 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore(DRAFT_STORE);
      rq.onsuccess = () => { const db = rq.result; db.onversionchange = () => { db.close(); dbp = null; }; ok = true; res(db); };
      rq.onerror = () => { dbp = null; ok = false; rej(rq.error); };
      rq.onblocked = () => rej(new Error("blocked"));
    } catch (e) { ok = false; rej(e); }
  }));
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(DRAFT_STORE, mode);
      const rq = fn(t.objectStore(DRAFT_STORE));
      t.oncomplete = () => res(rq && rq.result);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
    });
  };
  return {
    get: (k) => tx("readonly", (s) => s.get(k)).catch(() => null),
    put: (k, v) => tx("readwrite", (s) => s.put(v, k)).then(() => true, () => false),
    del: (k) => tx("readwrite", (s) => s.delete(k)).catch(() => {}),
    keys: () => tx("readonly", (s) => s.getAllKeys()).catch(() => []),
    usable: () => ok !== false,
  };
})();

/* 같은 학생이 탭을 둘 열면 초안이 서로 덮인다: 탭 하나만 초안을 쓰게 한다(Web Locks, 페이지가 닫히면 풀린다).
   돌려주는 값: 이 탭이 초안을 써도 되는가. 잠금을 지원하지 않는 브라우저는 지금처럼 쓴다 */
const draftOwner = {};
function ownDraft(dkey) {
  if (draftOwner[dkey]) return draftOwner[dkey];
  return (draftOwner[dkey] = new Promise((ready) => {
    try {
      if (typeof navigator === "undefined" || !navigator.locks || !navigator.locks.request) return ready(true);
      navigator.locks.request("skx:" + dkey, { ifAvailable: true }, (lock) => { ready(!!lock); return lock ? new Promise(() => {}) : undefined; }).catch(() => ready(true));
    } catch (e) { ready(true); }
  }));
}
/* 저장 뒤 지울 옛 문서 목록: 기록지 쓰기가 확인되기 전에 화면을 떠나면 다음에 열 때 이어서 처리한다 */
const pendingCleanup = new Map();

function defaultPrefs() {
  const o = {
    press: true, gamma: 1, smooth: 3, dash: "solid", shapeKind: "line", fill: false, finger: true, rotGesture: true, quick: true, autosave: true,
    fillTol: 32, fillRef: "all", selKind: "rect", selOp: "new", wandTol: 32, font: "sans", uniform: true, penAuto: false, recent: [], palettes: [],
  };
  BRUSHES.forEach((b) => { o[b.k] = { ...b.d }; });
  o.shape = { size: 4, op: 1 }; o.text = { size: 44, op: 1 }; o.fillT = { op: 1 };
  return o;
}
function mergePrefs(saved) {
  const o = defaultPrefs();
  if (!saved || typeof saved !== "object") return o;
  for (const k of Object.keys(o)) {
    if (!(k in saved)) continue;
    const d = o[k], s = saved[k];
    if (k === "recent") { if (Array.isArray(s)) o[k] = s.filter(isHex).slice(0, 10); }
    else if (k === "palettes") {
      if (Array.isArray(s)) o[k] = s.filter((p) => p && typeof p.name === "string" && Array.isArray(p.colors)).slice(0, 8)
        .map((p) => ({ name: p.name.slice(0, 20), colors: p.colors.filter(isHex).slice(0, 30) }));
    } else if (d && typeof d === "object") {
      if (s && typeof s === "object") for (const kk of Object.keys(d)) if (typeof s[kk] === "number" && isFinite(s[kk])) d[kk] = s[kk];
      const T = TOOL[k];
      if (T && T.min) d.size = clamp(d.size, T.min, T.max);
      if ("op" in d) d.op = clamp(d.op, 0.05, 1);
    } else if (typeof s === typeof d) o[k] = s;
  }
  return o;
}

/* 굵기 슬라이더는 로그 눈금: 가는 선을 세밀하게 고를 수 있게 */
const sizeToSlider = (t, s) => Math.round((1000 * Math.log(s / t.min)) / Math.log(t.max / t.min));
const sliderToSize = (t, v) => { const s = t.min * Math.pow(t.max / t.min, v / 1000); return s < 10 ? Math.round(s * 2) / 2 : Math.round(s); };

function ratioFor(w, h) {
  const a = w / h;
  return RATIOS.reduce((best, r) => (Math.abs(r.W / r.H - a) < Math.abs(best.W / best.H - a) ? r : best), RATIOS[0]);
}
/* 저장된 크기를 그대로 쓸 수 있는가(회전한 캔버스 포함). 아니면 가까운 비율의 기본 크기로 */
function sizeFor(w, h) {
  if (w >= 200 && h >= 200 && w <= 2400 && h <= 2400 && w * h <= 2400000) return { W: Math.round(w), H: Math.round(h) };
  const R = ratioFor(w || 3, h || 2);
  return { W: R.W, H: R.H };
}
function blobImg(blob) {
  const url = URL.createObjectURL(blob);
  return loadImg(url).finally(() => setTimeout(() => URL.revokeObjectURL(url), 2000));
}
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
/* 글자 입력칸: 화면 배율에 맞춘 크기로 보이되, 16px 미만이면 iOS가 페이지를 확대하므로 16px로 두고 줄여 보인다 */
function textStyle(pos, fs, color, font) {
  const o = { left: pos.x, top: pos.y, color, font: textFont(Math.max(16, fs), font), lineHeight: 1 };
  if (fs < 16) { o.transform = `scale(${Math.max(0.2, fs / 16)})`; o.transformOrigin = "0 0"; }
  return o;
}

function Guides({ g, W, H }) {
  if (!g || g.kind === "none") return null;
  const cfg = g.kind === "sym" ? { sym: g.sym, cx: W / 2, cy: H / 2, n: g.n } : { step: g.step, vp: g.vp, rays: 28 };
  let L = [];
  try { L = guideLines(g.kind, cfg, W, H) || []; } catch (e) {}
  return (
    <svg className="skx-guide" viewBox={`0 0 ${W} ${H}`} width={W} height={H} aria-hidden="true">
      {L.map(([a, b, c, d, w], i) => <line key={i} x1={a} y1={b} x2={c} y2={d} stroke="rgba(0,105,190,.5)" strokeWidth={w || 1} vectorEffect="non-scaling-stroke" />)}
    </svg>
  );
}

/* ============================================================
   화면
   ============================================================ */

export function SketchPad({ f, fieldKey, v, setField, owner, store, MediaThumb, confirmDel, fmtTime, prefsV }) {
  const locked = useContext(WsLockCtx);
  const wsSaved = useContext(WsSavedCtx);       // 기록지가 서버에 저장된 상태인가
  const cur = v && typeof v === "object" && v.ref ? v : null;
  const rootRef = useRef(null), viewRef = useRef(null), stageRef = useRef(null), hostRef = useRef(null);
  const cursorRef = useRef(null), fileRef = useRef(null), selPathRef = useRef(null);
  const engRef = useRef(null);
  if (!engRef.current) engRef.current = new Engine();
  const eng = engRef.current;

  const [prefs, setPrefs] = useState(() => {
    // 손가락으로 그리기와 펜 자동 전환은 기기마다 다르므로 이 탭의 값만 쓴다(기록지의 _skp에는 넣지 않는다)
    const local = ss.get(PREFS_KEY), lo = local && typeof local === "object" ? local : null;
    const base = prefsV && typeof prefsV === "object" ? { ...prefsV } : { ...(lo || {}) };
    delete base.finger; delete base.penAuto;
    if (lo && "finger" in lo) base.finger = lo.finger;
    if (lo && "penAuto" in lo) base.penAuto = lo.penAuto;
    return mergePrefs(base);
  });
  const [tool, setTool] = useState("pencil");
  const [lastBrush, setLastBrush] = useState("pencil");
  const [color, setColor] = useState("#111111");
  const [guide, setGuide] = useState({ kind: "none", step: 100, vp: null, sym: "v", n: 6, assist: false });
  const [full, setFull] = useState(false);
  const [panel, setPanel] = useState(null);       // brush | layers | color | history | actions | adjust | guide
  const [tick, setTick] = useState(0);
  const [zoomPct, setZoomPct] = useState(100);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [textAt, setTextAt] = useState(null);
  const [textVal, setTextVal] = useState("");
  const [touchDev, setTouchDev] = useState(() => typeof navigator !== "undefined" && navigator.maxTouchPoints > 0);
  const [dims, setDims] = useState({ W: eng.W, H: eng.H });
  const [adj, setAdj] = useState(null);           // 조정 중: { type, params }
  const [replay, setReplay] = useState(null);     // 과정 다시 보기: 작업 배열
  const [savedAt, setSavedAt] = useState(0);
  const [loadFail, setLoadFail] = useState(false);  // 저장된 그림을 읽지 못함(없음과 다르다): 다시 불러오기 전에는 그리거나 저장하지 못한다
  const [autoFail, setAutoFail] = useState(0);      // 자동 저장이 연달아 실패한 횟수
  const [remote, setRemote] = useState(false);      // 그리는 동안 다른 기기에서 저장된 그림이 들어옴
  const [refImg, setRefImg] = useState(null);       // 참고 그림(이 기기에서만 보인다)
  const [hold, setHold] = useState(false);          // autoHold의 화면 표시용

  const view = useRef({ s: 0.5, r: 0, fx: 1, tx: 0, ty: 0, fit: true });
  const drag = useRef(null);
  const touches = useRef(new Map());
  const spaceRef = useRef(false);
  const prevTool = useRef("pencil");
  const loadedRef = useRef(undefined);
  const initDone = useRef(false);
  const loadSeq = useRef(0);
  const vRef = useRef(v); vRef.current = v;
  const dirtyRef = useRef(false); dirtyRef.current = dirty;
  const draft = useRef({ fresh: true, timer: 0, ver: 0, writing: false, again: false, failed: false });
  const changeSeq = useRef(0);
  const lastChangeAt = useRef(0);
  const lastSaveAt = useRef(Date.now());
  const savingRef = useRef(false);
  const cleanup = useRef(null);                   // 저장 뒤 지울 옛 문서: 값이 실제로 바뀐 것을 확인한 다음 지운다
  const noteTimer = useRef(0);
  const textValRef = useRef(""); textValRef.current = textVal;
  const textRef = useRef(null);
  const lastPen = useRef(-1e9);                   // 펜이 마지막으로 닿거나 떠 있던 시각: 손바닥 접촉을 거르는 데 쓴다
  const ignored = useRef(new Set());              // 무시하기로 한 터치(손바닥)의 pointerId
  const lastTry = useRef(0);
  const savePromise = useRef(null);
  const remoteRef = useRef(false);
  const loadFailRef = useRef(false);
  const refCv = useRef(null), refFile = useRef(null);
  const applied = useRef(null);                   // flush가 기다리는 것: 저장한 값이 기록지 상태로 내려옴
  const noDraft = useRef(false);                  // 다른 탭이 초안의 주인이다: 이 탭은 초안을 읽지도 쓰지도 않는다
  const autoHold = useRef(false);                 // 「저장된 스케치 지우기」 뒤: 다시 그리기 전에는 자동으로 저장하지 않는다
  const opener = useRef(null);                    // 창을 연 버튼(닫을 때 포커스를 돌려준다)
  const textInRef = useRef(null);
  const xfRef = useRef(null);                     // 변형 중: { x, cx, cy, w, h, tx, ty, rot, sx, sy }
  const xfDrag = useRef(null);
  const adjRef = useRef(null);                    // 조정 중: { a, type, params, seed }
  const rafRef = useRef(0);
  const prefsSent = useRef("");
  const prefsTimer = useRef(0);
  const aliveRef = useRef(true);
  const st = useRef({});
  st.current = { tool, prefs, color, locked, loading, full, textAt, busy, guide, panel, adj, loadFail };
  const fn = useRef({});
  const dkey = owner + ":" + fieldKey;
  // 앞서 화면을 떠날 때 미뤄 둔 정리 목록을 이어받는다(첫 렌더에서: 정리 effect가 처음 돌 때 이미 들고 있게)
  if (cleanup.current === null && pendingCleanup.has(dkey)) { cleanup.current = pendingCleanup.get(dkey); pendingCleanup.delete(dkey); }
  const bump = () => setTick((t) => t + 1);

  const flash = (msg) => {
    setNote(msg);
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(""), 3200);
  };

  /* ---------- 설정 (붓·팔레트): 이 탭(sessionStorage)과 기록지(_skp)에 둔다 ---------- */

  const sendPrefs = (n) => {
    const o = { ...n };
    delete o.finger; delete o.penAuto;
    const s = JSON.stringify(o);
    if (s === prefsSent.current || st.current.locked) return;
    prefsSent.current = s;
    try { setField(PREFS_FIELD, o); } catch (e) {}
  };
  const storePrefs = (n) => {
    ss.set(PREFS_KEY, n);
    clearTimeout(prefsTimer.current);
    prefsTimer.current = setTimeout(() => { prefsTimer.current = 0; if (aliveRef.current) sendPrefs(n); }, 4000);
  };
  /* 대기 중인 설정 변경을 바로 보낸다(화면을 떠날 때) */
  const flushPrefs = () => {
    if (!prefsTimer.current) return;
    clearTimeout(prefsTimer.current);
    prefsTimer.current = 0;
    sendPrefs(st.current.prefs);
  };
  const setPref = (patch) => setPrefs((p) => { const n = { ...p, ...patch }; storePrefs(n); return n; });
  const setToolPref = (k, patch) => setPrefs((p) => { const n = { ...p, [k]: { ...p[k], ...patch } }; storePrefs(n); return n; });
  const pushRecent = (c) => {
    if (!isHex(c)) return;
    setPrefs((p) => {
      if (p.recent[0] === c) return p;
      const n = { ...p, recent: [c, ...p.recent.filter((x) => x !== c)].slice(0, 10) };
      storePrefs(n);
      return n;
    });
  };

  /* ---------- 화면 변환 (캔버스 좌표 ↔ 화면 좌표) ---------- */

  const vpSize = () => { const el = viewRef.current; return el ? { w: el.clientWidth || 1, h: el.clientHeight || 1 } : { w: 800, h: 533 }; };
  const fitScale = (r = 0) => {
    const { w, h } = vpSize(), rad = (r * Math.PI) / 180;
    const bw = Math.abs(Math.cos(rad)) * eng.W + Math.abs(Math.sin(rad)) * eng.H;
    const bh = Math.abs(Math.sin(rad)) * eng.W + Math.abs(Math.cos(rad)) * eng.H;
    return Math.max(0.02, Math.min((w - 16) / bw, (h - 16) / bh));
  };
  const toScreen = (x, y) => {
    const V = view.current, rad = (V.r * Math.PI) / 180, c = Math.cos(rad), s = Math.sin(rad);
    const u = V.fx < 0 ? eng.W - x : x;
    return { x: V.tx + V.s * (c * u - s * y), y: V.ty + V.s * (s * u + c * y) };
  };
  const toCanvasLocal = (sx, sy) => {
    const V = view.current, rad = (V.r * Math.PI) / 180, c = Math.cos(rad), s = Math.sin(rad);
    const px = sx - V.tx, py = sy - V.ty;
    const u = (c * px + s * py) / V.s, y = (-s * px + c * py) / V.s;
    return { x: V.fx < 0 ? eng.W - u : u, y };
  };
  /* 학습 지원의 글자 크기(body zoom 125~200%)가 켜져 있으면 포인터 좌표(뷰포트 px)와 배치 좌표(확대 전 px)가 다르다.
     k = 화면에 보이는 폭 ÷ 배치 폭. rect까지 확대 전 좌표로 주는 브라우저에서는 body의 zoom 값을 쓴다 */
  const viewK = () => {
    const el = viewRef.current;
    if (!el || !el.offsetWidth) return 1;
    const k = el.getBoundingClientRect().width / el.offsetWidth;
    return Math.abs(k - 1) < 0.01 ? 1 : k;
  };
  const localOf = (clientX, clientY) => {
    const el = viewRef.current, r = el.getBoundingClientRect();
    const k = el.offsetWidth ? r.width / el.offsetWidth : 1;
    if (Math.abs(k - 1) < 0.01) {
      const z = bodyZoom();
      if (Math.abs(z - 1) > 0.01) return { x: clientX / z - r.left - el.clientLeft, y: clientY / z - r.top - el.clientTop };
      return { x: clientX - r.left - el.clientLeft, y: clientY - r.top - el.clientTop };
    }
    return { x: (clientX - r.left) / k - el.clientLeft, y: (clientY - r.top) / k - el.clientTop };
  };
  const deltaK = () => { const k = viewK(); return k === 1 ? bodyZoom() : k; };
  const toCanvas = (clientX, clientY) => { const l = localOf(clientX, clientY); return toCanvasLocal(l.x, l.y); };
  const centerOn = (cx, cy, sx, sy) => {
    const V = view.current, rad = (V.r * Math.PI) / 180, c = Math.cos(rad), s = Math.sin(rad);
    const u = V.fx < 0 ? eng.W - cx : cx;
    V.tx = sx - V.s * (c * u - s * cy);
    V.ty = sy - V.s * (s * u + c * cy);
  };
  const clampPan = () => {
    const V = view.current, { w, h } = vpSize(), m = 48;
    const cs = [[0, 0], [eng.W, 0], [0, eng.H], [eng.W, eng.H]].map(([x, y]) => toScreen(x, y));
    const xs = cs.map((p) => p.x), ys = cs.map((p) => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    if (x1 < m) V.tx += m - x1; else if (x0 > w - m) V.tx -= x0 - (w - m);
    if (y1 < m) V.ty += m - y1; else if (y0 > h - m) V.ty -= y0 - (h - m);
  };
  const applyView = () => {
    const st2 = stageRef.current;
    if (!st2) return;
    const V = view.current, rad = (V.r * Math.PI) / 180, c = Math.cos(rad) * V.s, s = Math.sin(rad) * V.s;
    const a = c * V.fx, b = s * V.fx, e = V.tx + (V.fx < 0 ? c * eng.W : 0), f2 = V.ty + (V.fx < 0 ? s * eng.W : 0);
    st2.style.transform = `matrix(${a},${b},${-s},${c},${e},${f2})`;
    st2.style.setProperty("--inv", String(1 / V.s));   // 손잡이를 화면에서 같은 크기로
    setZoomPct(Math.round((V.s / fitScale(0)) * 100));
    if (textRef.current) bump();                        // 글자 입력칸이 화면을 따라가게
  };
  const fitView = () => {
    const V = view.current, { w, h } = vpSize();
    V.s = fitScale(V.r);
    centerOn(eng.W / 2, eng.H / 2, w / 2, h / 2);
    V.fit = true;
    applyView();
  };
  const zoomAt = (s, sx, sy) => {
    const V = view.current, q = toCanvasLocal(sx, sy);
    V.s = clamp(s, fitScale(0) * 0.25, 12);
    centerOn(q.x, q.y, sx, sy);
    V.fit = false;
    clampPan();
    applyView();
  };
  const zoomBy = (k) => { const { w, h } = vpSize(); zoomAt(view.current.s * k, w / 2, h / 2); };
  const turnView = (patch) => {
    const { w, h } = vpSize(), q = toCanvasLocal(w / 2, h / 2), V = view.current;
    Object.assign(V, patch);
    centerOn(q.x, q.y, w / 2, h / 2);
    if (V.fit) { V.s = fitScale(V.r); centerOn(eng.W / 2, eng.H / 2, w / 2, h / 2); }
    clampPan();
    applyView();
    bump();
  };
  const refit = () => { view.current.fit = true; requestAnimationFrame(fitView); };

  /* ---------- 변경 표시와 초안 ---------- */

  const writeDraft = async () => {
    const D = draft.current;
    if (noDraft.current) return;
    if (D.writing) { D.again = true; return; }
    // 획·변형·조정 미리보기가 레이어를 건드리는 동안에는 뜨지 않는다(반쯤 지운 그림이 초안에 들어가지 않게)
    if (aliveRef.current && (eng.live || drag.current || xfRef.current || adjRef.current)) { clearTimeout(D.timer); D.timer = setTimeout(writeDraft, 600); return; }
    D.writing = true;
    const ver = D.ver;
    try {
      const layers = [];
      for (const L of eng.layers) {
        if (!L.dblob || L.dblob.ver !== L.ver) { const v0 = L.ver; L.dblob = { ver: v0, blob: await blobOf(L.cv) }; }
        // saved: 이 레이어가 서버에 저장된 것과 같으면 그 문서 이름(초안에서 열어도 다시 올리지 않게)
        layers.push({ id: L.id, name: L.name, op: L.op, vis: L.vis, blend: L.blend, alock: L.alock, lock: L.lock, blob: L.dblob.blob,
          saved: L.saved && L.saved.ver === L.ver ? L.saved.parts : null });
      }
      if (ver === D.ver && dirtyRef.current) {
        const rec = { v: 2, base: loadedRef.current || null, w: eng.W, h: eng.H, paper: eng.paper, active: eng.layers.indexOf(eng.active()), layers, log: packLog(eng.log()), guide: st.current.guide, hold: autoHold.current, at: Date.now() };
        const ok = await idb.put(dkey, rec);
        D.failed = !ok;
        if (ok && ver === D.ver) D.fresh = true;
        if (aliveRef.current && dirtyRef.current) sketchDirty.current = !ok;
      }
    } catch (e) {
      // 그림을 뜨지 못했다(메모리 부족 등): 초안이 없으므로 이동하기 전에 묻게 한다
      D.failed = true;
      if (aliveRef.current && dirtyRef.current) sketchDirty.current = true;
    }
    D.writing = false;
    if (D.again) { D.again = false; writeDraft(); }
    else if (!aliveRef.current) eng.dispose();     // 화면을 떠난 뒤 마지막 초안까지 썼으면 캔버스를 놓는다
  };
  const clearDraft = () => {
    clearTimeout(draft.current.timer);
    draft.current.ver++;
    draft.current.fresh = true;
    idb.del(dkey);
  };
  const changed = () => {
    if (autoHold.current) { autoHold.current = false; setHold(false); }
    setDirty(true);
    dirtyRef.current = true;
    changeSeq.current++;
    lastChangeAt.current = Date.now();
    draft.current.fresh = false;
    draft.current.ver++;
    sketchDirty.unsaved = true;
    // 화면을 떠날 때도 초안을 쓰므로(정리 함수), 초안 저장소를 쓸 수 없을 때만 「이동하면 사라진다」를 묻게 한다
    sketchDirty.current = noDraft.current || !idb.usable() || draft.current.failed;
    clearTimeout(draft.current.timer);
    draft.current.timer = setTimeout(writeDraft, 1200);
  };
  const markClean = () => {
    setDirty(false);
    dirtyRef.current = false;
    sketchDirty.unsaved = false;
    sketchDirty.current = false;
  };
  /* 그림이나 레이어가 바뀐 뒤: 저장 필요 표시 + 다시 그리기 */
  const touched = () => { changed(); bump(); };

  /* ---------- 불러오기 ---------- */

  const baseOp = () => {
    // 불러온 그림은 과정 기록의 출발점이 된다(작은 그림 한 장으로)
    const s = Math.min(1, 720 / Math.max(eng.W, eng.H));
    const c = document.createElement("canvas");
    c.width = Math.round(eng.W * s); c.height = Math.round(eng.H * s);
    eng.compositeInto(c, null);
    let snap = c.toDataURL("image/png");
    if (snap.length > 200000) { const w = c.toDataURL("image/webp", 0.8); if (w.startsWith("data:image/webp")) snap = w; }
    return { kind: "base", w: eng.W, h: eng.H, paper: eng.paper, layers: eng.layersMeta(), active: eng.layers.indexOf(eng.active()), snap, _img: c, t: Date.now() };
  };
  const loadFrom = async (val, dr, opt = {}) => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setErr("");
    loadFailRef.current = false; setLoadFail(false);
    try {
      let size = { W: RATIOS[0].W, H: RATIOS[0].H }, list = null, active = null, paper = "white", past = null, g = null, savedParts = null, flat = false;
      if (dr) {
        const imgs = await Promise.all(dr.layers.map((l) => blobImg(l.blob)));
        size = sizeFor(dr.w, dr.h); paper = dr.paper; active = dr.active; g = dr.guide;
        list = dr.layers.map((l, i) => ({ id: l.id, name: l.name, op: l.op, vis: l.vis, blend: l.blend, alock: l.alock, lock: l.lock, img: imgs[i] }));
        past = dr.log ? unpackLog(dr.log) : null;
        savedParts = opt.stale ? null : dr.layers.map((l) => (Array.isArray(l.saved) ? l.saved : null));
      } else if (val) {
        paper = val.paper; g = val.guide;
        if (Array.isArray(val.layers) && val.layers.length) {
          const datas = await Promise.all(val.layers.map((l) => fetchLayer(store, owner, l)));
          if (datas.some((d) => d === FAILED)) throw new Error("net");
          if (datas.every((d) => typeof d === "string" && d.startsWith("data:image"))) {
            const imgs = await Promise.all(datas.map(loadImg));
            list = val.layers.map((l, i) => ({ id: l.id, name: l.name, op: l.op, vis: l.vis, blend: l.blend, alock: l.alock, lock: l.lock, img: imgs[i] }));
            savedParts = val.layers.map((l) => (Array.isArray(l.parts) ? l.parts : l.ref ? [{ ref: l.ref }] : null));
            if (val.log && Array.isArray(val.log.parts) && val.log.parts.length) {
              // 과정 기록을 읽지 못했으면(없음과 다르다) 여기서 멈춘다: 그대로 열면 다음 저장이 옛 기록을 지운다
              const ls = await getParts(store, owner, val.log.parts);
              if (ls === FAILED) throw new Error("net");
              past = typeof ls === "string" && ls.startsWith(LOG_PREFIX) ? unpackLog(ls.slice(LOG_PREFIX.length)) : null;
            }
          } else flat = true;
        }
        if (!list) {
          const r = await readDoc(store, owner, val.ref);
          if (!r.ok) throw new Error("net");
          if (typeof r.data !== "string" || !r.data.startsWith("data:image")) throw new Error("missing");
          const img = await loadImg(r.data);
          list = [{ name: "레이어 1", img }];
          if (val.w && val.h) size = sizeFor(val.w, val.h);
          else { const R0 = ratioFor(img.naturalWidth, img.naturalHeight); size = { W: R0.W, H: R0.H }; }
        } else size = sizeFor(val.w, val.h);
      }
      if (seq !== loadSeq.current) return;
      abortModes();   // 하던 획·변형·조정을 옛 레이어가 살아 있을 때 거둔다
      eng.reset(size.W, size.H, list, active);
      eng.paper = PAPERS.some((p) => p.k === paper) ? paper : "white";
      eng.past = past && past.length ? past : [list ? baseOp() : { kind: "new", w: eng.W, h: eng.H, paper: eng.paper, id: eng.layers[0].id, name: eng.layers[0].name, t: Date.now() }];
      if (savedParts) eng.layers.forEach((L, i) => { if (savedParts[i]) L.saved = { ver: L.ver, parts: savedParts[i] }; });
      eng.setSel(null);
      if (g && typeof g === "object" && GUIDES.some((x) => x[0] === g.kind)) {
        // Firestore는 배열 안의 배열을 받지 않아 소실점을 { x, y }로 저장한다
        const vp = Array.isArray(g.vp) ? g.vp.map((p) => (Array.isArray(p) ? p : [p.x, p.y])).filter((p) => isFinite(p[0]) && isFinite(p[1])) : null;
        setGuide((p) => ({ ...p, ...g, vp: vp && vp.length ? vp : null }));
      }
      setDims({ W: eng.W, H: eng.H });
      loadedRef.current = dr ? dr.base : val ? val.ref : null;
      remoteRef.current = !!opt.stale; setRemote(!!opt.stale);
      refit();
      if (dr) { changed(); draft.current.fresh = true; sketchDirty.current = false; if (dr.hold) { autoHold.current = true; setHold(true); sketchDirty.unsaved = false; } flash(opt.stale ? "이 기기에서 그리던 그림을 불러왔습니다. 그 사이 다른 기기에서 저장된 그림은 저장 버전에 보관됩니다." : "저장하지 않은 그림을 다시 불러왔습니다."); }
      else { markClean(); if (flat) flash("레이어를 찾지 못해 한 장으로 열었습니다."); }
    } catch (e) {
      if (seq !== loadSeq.current) return;
      abortModes();
      eng.reset(RATIOS[0].W, RATIOS[0].H, null);
      eng.past = [{ kind: "new", w: eng.W, h: eng.H, paper: eng.paper, id: eng.layers[0].id, name: eng.layers[0].name, t: Date.now() }];
      setDims({ W: eng.W, H: eng.H });
      refit();
      markClean();
      if (dr) { loadedRef.current = opt.base !== undefined ? opt.base : null; setErr("저장하지 않은 그림을 다시 불러오지 못했습니다."); }
      else if (e && e.message === "net") {
        // 읽기 실패: 빈 캔버스에 그려서 저장하면 서버의 그림을 덮게 되므로, 다시 불러올 때까지 막는다
        loadedRef.current = val ? val.ref : null;
        loadFailRef.current = true; setLoadFail(true);
      } else {
        loadedRef.current = val ? val.ref : null;
        setErr("저장된 스케치를 캔버스로 불러오지 못했습니다. 저장된 그림은 아래 작은 그림으로 볼 수 있습니다.");
      }
    }
    if (seq === loadSeq.current) { setLoading(false); bump(); }
  };

  /* 처음 열 때: 이 브라우저의 초안 → 저장된 스케치 → 빈 캔버스.
     다른 기기에서 저장해 값이 바뀌면 저장 안 한 변경이 없을 때만 다시 읽는다 */
  const curRef = cur ? cur.ref : null;
  /* 앞 저장본의 문서와 초안은 새 값이 기록지에 실리고(curRef) 그 기록지가 서버에 저장된(wsSaved) 뒤에 지운다.
     그 전에 지우면, 기록지 쓰기 전에 페이지가 닫혔을 때 서버의 값이 없는 문서를 가리키고 초안도 없다 */
  useEffect(() => {
    const c = cleanup.current;
    if (!c || c.ref !== curRef || !wsSaved) return;
    c.olds.forEach((r) => store.remove(owner, r));
    if (c.draft && !dirtyRef.current) clearDraft();
    cleanup.current = null;
  }, [curRef, wsSaved]);
  useEffect(() => {
    if (applied.current && curRef === loadedRef.current) { applied.current(); applied.current = null; }
    const valNow = () => (vRef.current && typeof vRef.current === "object" && vRef.current.ref ? vRef.current : null);
    if (loadedRef.current === undefined) {
      loadedRef.current = null;
      (async () => {
        noDraft.current = !(await ownDraft(dkey));
        const keys = await idb.keys();
        for (const k of keys || []) if (typeof k === "string" && !k.startsWith(owner + ":")) idb.del(k);
        const dr = noDraft.current ? null : await idb.get(dkey);
        const now = valNow();
        const okDraft = dr && dr.v === 2 && Array.isArray(dr.layers) && dr.layers.length;
        if (okDraft && dr.base === (now ? now.ref : null)) await loadFrom(null, dr);
        // 초안의 바탕이 서버 값과 다르다(다른 기기에서 저장됨): 초안이 더 새것이면 초안을 열고, 서버 값은 다음 저장 때 버전으로 둔다
        else if (okDraft && now && dr.at > (+new Date(now.at) || 0)) await loadFrom(null, dr, { stale: true, base: now.ref });
        else { if (dr) idb.del(dkey); await loadFrom(now, null); }
        initDone.current = true;
        const later = valNow();
        if (later && later.ref !== loadedRef.current && !dirtyRef.current && !loadFailRef.current) loadFrom(later, null);
      })();
      return;
    }
    if (!initDone.current || curRef === loadedRef.current) return;
    // 올리는 중에 다른 기기의 값이 들어왔다: 저장이 끝날 때 그 값을 버전으로 두게 표시만 한다
    if (savingRef.current) { remoteRef.current = true; return; }
    if (!initDone.current || curRef === loadedRef.current || savingRef.current) return;
    if (dirtyRef.current) {
      // 그리는 동안 다른 기기에서 저장했거나 지웠다: 지금 그림은 그대로 두고, 저장할 때 그쪽 그림을 버전으로 둔다
      remoteRef.current = true; setRemote(true);
      eng.layers.forEach((L) => { L.saved = null; });
      return;
    }
    if (curRef) loadFrom(cur, null);
    else { clearDraft(); loadFrom(null, null); }   // 저장된 스케치가 지워졌다(다른 기기에서 지움, 교사의 기록 초기화)
  }, [curRef]);

  /* ---------- 마운트: 엔진 연결, 크기 변화, 휠, 자동 저장, 정리 ---------- */

  useEffect(() => {
    aliveRef.current = true;
    eng.attach(hostRef.current);
    if (typeof window.__SKX_DEBUG__ === "function") window.__SKX_DEBUG__({ eng, view, fn, st }); // 시험 도구용 연결(.tmpbuild/sketch-harness)
    const vp = viewRef.current;
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => {
      if (view.current.fit) fitView(); else { clampPan(); applyView(); }
    }) : null;
    if (ro) ro.observe(vp);
    const wheel = (e) => fn.current.onWheel(e);
    vp.addEventListener("wheel", wheel, { passive: false });
    const auto = setInterval(() => fn.current.autoTick(), 15000);
    // 스페이스를 누른 채 창을 바꾸거나 포커스를 잃으면 keyup이 오지 않는다: 그때도 이동 상태를 푼다
    const dropSpace = () => { spaceRef.current = false; if (viewRef.current) viewRef.current.classList.remove("space"); };
    const vis = () => { dropSpace(); if (document.visibilityState === "hidden") fn.current.onHide(); };
    const ku = (e) => { if (e.key === " ") dropSpace(); };
    document.addEventListener("visibilitychange", vis);
    document.addEventListener("keyup", ku, true);
    window.addEventListener("blur", dropSpace);
    sketchDirty.flush = () => fn.current.flush();
    return () => {
      aliveRef.current = false;
      if (ro) ro.disconnect();
      vp.removeEventListener("wheel", wheel);
      clearInterval(auto);
      document.removeEventListener("visibilitychange", vis);
      document.removeEventListener("keyup", ku, true);
      window.removeEventListener("blur", dropSpace);
      sketchDirty.flush = null;
      clearTimeout(draft.current.timer);
      clearTimeout(noteTimer.current);
      fn.current.flushPrefs();
      cancelAnimationFrame(rafRef.current);
      fn.current.abortModes();
      if (cleanup.current) pendingCleanup.set(dkey, cleanup.current);
      if (dirtyRef.current && !draft.current.fresh) writeDraft();   // 끝나면 writeDraft가 엔진을 놓는다
      else if (!draft.current.writing) eng.dispose();
      if (refCv.current) { freeCanvas(refCv.current); refCv.current = null; }
      // 서버에 저장하지 못한 채 떠났으면 unsaved를 그대로 둔다(나가기·창 닫기에서 알 수 있게)
      sketchDirty.current = false;
      if (!dirtyRef.current) sketchDirty.unsaved = false;
    };
  }, []);

  /* 잠금이 켜지면 하던 일을 거두고 크게 그리기를 닫는다 */
  useEffect(() => {
    if (!locked) return;
    fn.current.abortModes();
    setPanel(null);
    setFull(false);
    // 잠그는 순간까지 그린 내용은 저장한다(잠금 중에도 올리기가 끝난 참조는 기록지에 적을 수 있다: setField의 upload)
    if (dirtyRef.current && initDone.current && !autoHold.current) fn.current.save({ auto: true, force: true });
  }, [locked]);

  /* 창을 닫으면 포커스를 연 버튼(없으면 그리기 도구)으로 돌려준다: body로 빠지면 단축키가 듣지 않는다 */
  useEffect(() => {
    if (panel) { if (!opener.current) opener.current = document.activeElement; return; }
    const o = opener.current;
    opener.current = null;
    if (!o) return;
    const a = document.activeElement;
    if (a && a !== document.body) return;
    const to = o !== document.body && document.contains(o) && !o.disabled ? o : rootRef.current;
    if (to) to.focus({ preventScroll: true });
  }, [panel]);

  /* 크게 그리기: 페이지 스크롤을 막고, 포커스가 밖에 있어도 단축키가 듣게 한다 */
  useEffect(() => {
    if (!full) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const kd = (e) => {
      const root = rootRef.current;
      if (e.key === "Tab" && root && !root.querySelector(".skh-rp")) {
        // 화면을 덮고 있으므로 Tab이 뒤에 가려진 기록지 칸으로 나가지 않게 한다
        const els = Array.from(root.querySelectorAll("button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,[tabindex='0']")).filter((x) => x.offsetParent !== null);
        if (els.length) {
          const first = els[0], last = els[els.length - 1], a = document.activeElement;
          if (!root.contains(a)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
          else if (e.shiftKey && (a === first || a === root)) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
        }
        return;
      }
      if (!root || !root.contains(e.target)) fn.current.onKey(e);
    };
    const ku = (e) => { if (!rootRef.current || !rootRef.current.contains(e.target)) fn.current.onKeyUp(e); };
    document.addEventListener("keydown", kd);
    document.addEventListener("keyup", ku);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", kd);
      document.removeEventListener("keyup", ku);
    };
  }, [full]);
  useEffect(() => { refit(); }, [full]);

  /* ---------- 도구 고르기 ---------- */

  const chooseColor = (c) => {
    if (!isHex(c)) return;
    c = c.toUpperCase();
    setColor(c);
    if (tool === "eraser" || tool === "smudge" || tool === "picker" || tool === "hand" || tool === "select" || tool === "xform") {
      if (xfRef.current) applyXform();
      setTool(lastBrush);
    }
  };
  const selectTool = (k) => {
    if (st.current.locked || drag.current || eng.live) return;
    if (textRef.current) commitText();
    if (adjRef.current) endAdjust(true);
    if (k === "xform" && tool === "xform" && !xfRef.current) { if (enterXform()) { setPanel(null); bump(); } return; }
    if (k === tool) { if (isDrawBrush(k) || k === "eraser" || k === "smudge") setPanel((p) => (p === "brush" ? null : "brush")); return; }
    if (xfRef.current) applyXform();
    if (k === "xform") { if (!enterXform()) return; setPanel(null); }
    if (tool !== "picker" && tool !== "hand" && tool !== "xform") prevTool.current = tool;
    if (isDrawBrush(k)) setLastBrush(k);
    setTool(k);
  };
  const doUndo = () => {
    if (drag.current || st.current.locked) return;
    if (textRef.current) { textRef.current = null; setTextAt(null); setTextVal(""); return; }
    if (xfRef.current) { cancelXform(); return; }
    if (adjRef.current) { endAdjust(false); return; }
    const op = eng.hist[eng.hist.length - 1];
    if (eng.undo()) { syncDims(); touched(); if (op) flash("되돌림: " + opLabel(op)); }
  };
  const doRedo = () => {
    if (drag.current || st.current.locked || xfRef.current || adjRef.current || textRef.current) return;
    const op = eng.redo[eng.redo.length - 1];
    if (eng.redoOne()) { syncDims(); touched(); if (op) flash("다시 실행: " + opLabel(op)); }
  };
  const syncDims = () => { if (eng.W !== dims.W || eng.H !== dims.H) { setDims({ W: eng.W, H: eng.H }); refit(); } };

  /* ---------- 변형 ---------- */

  const enterXform = () => {
    const L = eng.active();
    if (!L || !L.vis) { flash("숨긴 레이어는 변형할 수 없습니다."); return false; }
    if (L.lock) { flash("잠긴 레이어는 변형할 수 없습니다."); return false; }
    const x = eng.beginXform(L, eng.sel);
    if (!x.bbox) { eng.endXform(x, null); flash("변형할 그림이 없습니다."); return false; }
    const [x0, y0, x1, y1] = x.bbox;
    xfRef.current = { x, cx: (x0 + x1 + 1) / 2, cy: (y0 + y1 + 1) / 2, w: x1 - x0 + 1, h: y1 - y0 + 1, tx: 0, ty: 0, rot: 0, sx: 1, sy: 1 };
    return true;
  };
  const xfMatrix = (X) => matTRS({ tx: X.tx, ty: X.ty, rot: X.rot, sx: X.sx, sy: X.sy, cx: X.cx, cy: X.cy });
  const xfPreview = () => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const X = xfRef.current;
      if (!X) return;
      eng.previewXform(X.x, xfMatrix(X));
      bump();
    });
  };
  function applyXform() {
    const X = xfRef.current;
    if (!X) return;
    cancelAnimationFrame(rafRef.current);
    xfRef.current = null; xfDrag.current = null;
    const same = !X.tx && !X.ty && !X.rot && X.sx === 1 && X.sy === 1;
    const op = eng.endXform(X.x, same ? null : xfMatrix(X));
    if (op) { if (eng.sel) eng.setSel(null); touched(); } else bump();
  }
  function cancelXform() {
    const X = xfRef.current;
    if (!X) return;
    cancelAnimationFrame(rafRef.current);
    xfRef.current = null; xfDrag.current = null;
    eng.endXform(X.x, null);
    setTool(prevTool.current === "xform" ? lastBrush : prevTool.current);
    bump();
  }
  const xfPatch = (patch) => { const X = xfRef.current; if (!X) return; Object.assign(X, typeof patch === "function" ? patch(X) : patch); xfPreview(); };
  const xfDown = (e, mode, hx = 0, hy = 0) => {
    const X = xfRef.current;
    if (!X || st.current.locked) return;
    e.preventDefault(); e.stopPropagation();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) {}
    const q = toCanvas(e.clientX, e.clientY);
    xfDrag.current = { id: e.pointerId, mode, hx, hy, q, s: { tx: X.tx, ty: X.ty, rot: X.rot, sx: X.sx, sy: X.sy }, a0: Math.atan2(q.y - (X.cy + X.ty), q.x - (X.cx + X.tx)) };
  };
  const xfMove = (e) => {
    const d = xfDrag.current, X = xfRef.current;
    if (!d || !X || d.id !== e.pointerId) return;
    // 버튼을 누르지 않은 마우스 움직임에는 반응하지 않는다(끌기가 끝난 것을 놓친 경우)
    if (e.pointerType === "mouse" && e.buttons === 0) { xfDrag.current = null; return; }
    const q = toCanvas(e.clientX, e.clientY);
    if (d.mode === "move") { X.tx = d.s.tx + (q.x - d.q.x); X.ty = d.s.ty + (q.y - d.q.y); }
    else {
      const ccx = X.cx + X.tx, ccy = X.cy + X.ty;
      if (d.mode === "rot") {
        let a = d.s.rot + (Math.atan2(q.y - ccy, q.x - ccx) - d.a0);
        const step = Math.PI / 12, near = Math.round(a / (Math.PI / 2)) * (Math.PI / 2);
        if (e.shiftKey) a = Math.round(a / step) * step;
        else if (Math.abs(a - near) < 0.045) a = near;
        X.rot = a;
      } else {
        const c = Math.cos(-X.rot), s = Math.sin(-X.rot);
        const lx = c * (q.x - ccx) - s * (q.y - ccy), ly = s * (q.x - ccx) + c * (q.y - ccy);
        const ax = Math.abs(d.s.sx), ay = Math.abs(d.s.sy);
        let sx = d.hx ? Math.abs(lx) / (X.w / 2) : ax, sy = d.hy ? Math.abs(ly) / (X.h / 2) : ay;
        if (d.hx && d.hy && (st.current.prefs.uniform || e.shiftKey)) { const k = Math.max(sx / ax, sy / ay); sx = ax * k; sy = ay * k; }
        X.sx = Math.max(0.02, sx) * Math.sign(d.s.sx || 1);
        X.sy = Math.max(0.02, sy) * Math.sign(d.s.sy || 1);
      }
    }
    xfPreview();
  };
  const xfUp = (e) => { if (xfDrag.current && xfDrag.current.id === e.pointerId) { xfDrag.current = null; bump(); } };

  /* ---------- 조정 ---------- */

  const adjPreview = () => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const A = adjRef.current;
      if (A) eng.previewAdjust(A.a, A.type, A.params, A.seed);
    });
  };
  const startAdjust = (type) => {
    const L = eng.active(), def = ADJUSTS.find((a) => a.k === type);
    if (!def || !L || drag.current || eng.live) return;
    if (!L.vis) return flash("숨긴 레이어는 조정할 수 없습니다.");
    if (L.lock) return flash("잠긴 레이어는 조정할 수 없습니다.");
    if (textRef.current) commitText();
    if (xfRef.current) { applyXform(); setTool(prevTool.current === "xform" ? lastBrush : prevTool.current); }
    if (adjRef.current) endAdjust(true);
    const params = Object.fromEntries(def.params.map((p) => [p[0], p[4]]));
    const A = { a: eng.beginAdjust(L), type, params, seed: (Math.random() * 1e9) | 0 };
    setPanel(null);
    if (!def.params.length) { eng.endAdjust(A.a, type, params, A.seed); touched(); return; }
    adjRef.current = A;
    setAdj({ type, params });
    adjPreview();
  };
  const setAdjParam = (k, val) => {
    const A = adjRef.current;
    if (!A) return;
    A.params = { ...A.params, [k]: val };
    setAdj({ type: A.type, params: A.params });
    adjPreview();
  };
  function endAdjust(apply) {
    const A = adjRef.current;
    if (!A) return;
    cancelAnimationFrame(rafRef.current);
    adjRef.current = null;
    setAdj(null);
    const op = eng.endAdjust(A.a, apply ? A.type : null, A.params, A.seed);
    if (op) touched(); else bump();
  }
  /* 하던 일(획·변형·조정·글자)을 버리고 원래 그림으로 */
  const abortModes = () => {
    if (drag.current) { clearTimeout(drag.current.hold); eng.cancelLive(); drag.current = null; }
    if (xfRef.current) { const X = xfRef.current; xfRef.current = null; xfDrag.current = null; eng.endXform(X.x, null); }
    if (adjRef.current) { const A = adjRef.current; adjRef.current = null; eng.endAdjust(A.a, null); }
    cancelAnimationFrame(rafRef.current);
    textRef.current = null;
    if (aliveRef.current) { setTextAt(null); setAdj(null); setTool((t) => (t === "xform" ? "pencil" : t)); }
  };

  /* ---------- 선택 ---------- */

  const setSel = (sel) => { eng.setSel(sel); bump(); };
  const addSelPart = (part) => {
    const S = st.current, prev = eng.sel, mode = S.prefs.selOp;
    if (mode === "sub" && !prev) return flash("뺄 선택 영역이 없습니다.");
    const parts = mode === "new" || !prev ? [{ ...part, mode: "add" }] : [...prev.parts, { ...part, mode: mode === "sub" ? "sub" : "add" }];
    // 반전된 선택에 더하거나 빼면 반전을 푼 모양으로는 나타낼 수 없으므로 새 선택으로 바꾼다
    const sel = eng.setSel({ parts: prev && prev.inv && mode !== "new" ? [{ ...part, mode: "add" }] : parts, inv: false });
    if (!sel) flash("선택된 곳이 없습니다.");
    bump();
  };
  const selectAll = () => setSel({ parts: [{ type: "rect", x: 0, y: 0, w: eng.W, h: eng.H, mode: "add" }], inv: false });
  const invertSel = () => { if (!eng.sel) return selectAll(); setSel({ parts: eng.sel.parts, inv: !eng.sel.inv }); };
  const drawSelPreview = (d) => {
    const p = selPathRef.current;
    if (!p) return;
    if (!d) { p.setAttribute("d", ""); return; }
    if (d.kind === "rect") p.setAttribute("d", `M${d.x0},${d.y0}H${d.x1}V${d.y1}H${d.x0}Z`);
    else if (d.kind === "ellipse") {
      const cx = (d.x0 + d.x1) / 2, cy = (d.y0 + d.y1) / 2, rx = Math.abs(d.x1 - d.x0) / 2, ry = Math.abs(d.y1 - d.y0) / 2;
      p.setAttribute("d", `M${cx - rx},${cy}a${rx},${ry} 0 1,0 ${rx * 2},0a${rx},${ry} 0 1,0 ${-rx * 2},0Z`);
    } else {
      let s = "";
      for (let i = 0; i + 1 < d.pts.length; i += 2) s += (i ? "L" : "M") + d.pts[i].toFixed(1) + "," + d.pts[i + 1].toFixed(1);
      p.setAttribute("d", s);
    }
  };
  const clearSelArea = () => {
    if (drag.current || eng.live) return;
    const L = eng.active();
    if (!L || L.lock) return flash("잠긴 레이어는 지울 수 없습니다.");
    eng.commit({ kind: "clear", sel: eng.sel || undefined, layers: [L.id] });
    touched();
  };
  const fillSelArea = () => {
    if (drag.current || eng.live) return;
    const L = eng.active();
    if (!L || L.lock || !L.vis) return flash("잠겼거나 숨긴 레이어에는 칠할 수 없습니다.");
    eng.commit({ kind: "shape", shape: "rect", x0: -2, y0: -2, x1: eng.W + 2, y1: eng.H + 2, color: st.current.color, size: 1, opacity: 1, dash: "solid", fill: true, sel: eng.sel || undefined, alock: L.alock || undefined, layers: [L.id] });
    pushRecent(st.current.color);
    touched();
  };
  const liftSel = (cut) => {
    if (drag.current || eng.live) return;
    const L0 = eng.active();
    if (cut && L0 && L0.lock) return flash("잠긴 레이어는 잘라 낼 수 없습니다.");
    if (eng.layers.length >= MAX_LAYERS) return flash("레이어는 " + MAX_LAYERS + "장까지 만들 수 있습니다.");
    if (eng.liftSel(cut)) { eng.setSel(null); touched(); }
  };

  /* ---------- 그리기 동작 ---------- */

  const pressureOf = (ev, T, d) => {
    const S = st.current;
    if (!S.prefs.press) return 1;
    if (ev.pointerType === "pen") return ev.pressure > 0 ? ev.pressure : d ? d.p : 0.5;
    if (T.speed && d) {
      const dt = Math.max(1, ev.timeStamp - d.lt);
      const vel = Math.hypot(ev.clientX - d.lcx, ev.clientY - d.lcy) / dt;
      const target = clamp(1.1 - vel * 0.3, 0.3, 1);
      d.pv += (target - d.pv) * (1 - Math.pow(0.8, Math.min(3, dt / 16)));   // 표본이 촘촘해도(묶인 이벤트) 같은 빠르기로 따라간다
      return d.pv;
    }
    return 1;
  };
  /* 펜을 많이 눕히면 연필·목탄이 넓고 옅게 칠해진다 */
  const tiltOf = (ev) => (ev.pointerType === "pen" ? clamp((Math.hypot(ev.tiltX || 0, ev.tiltY || 0) - 35) / 35, 0, 1) : 0);

  const hoverCursor = (e) => {
    const el = cursorRef.current;
    if (!el) return;
    const S = st.current, t = (drag.current && drag.current.tool) || S.tool;
    const sz = BRUSH[t] ? S.prefs[t].size * view.current.s : 0;
    if (e.pointerType === "touch" || sz < 4 || spaceRef.current) { el.style.display = "none"; return; }
    const l = localOf(e.clientX, e.clientY);
    el.style.display = "block";
    el.style.width = el.style.height = sz + "px";
    el.style.transform = `translate(${l.x - sz / 2}px,${l.y - sz / 2}px)`;
  };
  const hideCursor = () => { if (cursorRef.current) cursorRef.current.style.display = "none"; };

  const pickAt = (q) => {
    const c = eng.pick(q.x, q.y, paperColor(eng.paper));
    if (c) setColor(c);
    return c;
  };

  const keepView = () => { const V = view.current; return { s: V.s, r: V.r, tx: V.tx, ty: V.ty, fit: V.fit }; };
  const backView = (v0) => { if (!v0) return; Object.assign(view.current, v0); applyView(); bump(); };
  const startPan = (e) => {
    drag.current = { mode: "pan", id: e.pointerId, ptype: e.pointerType, cx: e.clientX, cy: e.clientY, tx: view.current.tx, ty: view.current.ty, v0: keepView(), go: e.pointerType !== "touch" };
    try { viewRef.current.setPointerCapture(e.pointerId); } catch (x) {}
    if (drag.current.go) viewRef.current.classList.add("panning");
  };
  /* 하던 끌기를 거둔다(두 번째 손가락이 닿았거나, 펜이 손바닥 조작을 넘겨받을 때) */
  const dropDrag = (d) => {
    if (!d) return;
    clearTimeout(d.hold);
    if (d.mode === "draw" || d.mode === "shape" || d.mode === "quick") eng.cancelLive();
    if (d.mode === "sel") drawSelPreview(null);
    if (d.mode === "pick" && d.back) setTool(prevTool.current);
    if (d.mode === "xf") {
      const s0 = xfDrag.current && xfDrag.current.s, X0 = xfRef.current;
      if (s0 && X0) { Object.assign(X0, s0); xfPreview(); }
      xfDrag.current = null;
    }
    if (viewRef.current) viewRef.current.classList.remove("panning");
  };
  const startPinch = () => {
    const d = drag.current;
    const was = d && d.mode === "pinch" ? d : null;
    if (d && !was) dropDrag(d);
    const [a, b] = [...touches.current.values()];
    const la = localOf(a.x, a.y), lb = localOf(b.x, b.y);
    const m = { x: (la.x + lb.x) / 2, y: (la.y + lb.y) / 2 };
    drag.current = {
      mode: "pinch", ptype: "touch", t0: was ? was.t0 : performance.now(), moved: was ? was.moved : false,
      fingers: Math.max(touches.current.size, was ? was.fingers : 0),
      big: (was && was.big) || [...touches.current.values()].some((p) => p.w > 60),   // 손바닥처럼 넓은 접촉
      v0: was ? was.v0 : d && d.v0 ? d.v0 : keepView(),
      d0: Math.hypot(la.x - lb.x, la.y - lb.y) || 1, m0: m, s0: view.current.s, q0: toCanvasLocal(m.x, m.y),
      a0: Math.atan2(lb.y - la.y, lb.x - la.x), r0: view.current.r, rotOn: was ? was.rotOn : false,
    };
  };
  const movePinch = () => {
    const d = drag.current, pts = [...touches.current.values()];
    if (pts.length < 2) return;
    const la = localOf(pts[0].x, pts[0].y), lb = localOf(pts[1].x, pts[1].y);
    const dd = Math.hypot(la.x - lb.x, la.y - lb.y), m = { x: (la.x + lb.x) / 2, y: (la.y + lb.y) / 2 };
    if (Math.abs(dd - d.d0) > 10 || Math.hypot(m.x - d.m0.x, m.y - d.m0.y) > 10) d.moved = true;
    const V = view.current;
    if (st.current.prefs.rotGesture) {
      const ang = Math.atan2(lb.y - la.y, lb.x - la.x);
      let da = ((ang - d.a0) * 180) / Math.PI;
      da = ((da + 540) % 360) - 180;
      if (!d.rotOn && Math.abs(da) > 9) { d.rotOn = true; d.moved = true; d.a0 = ang; d.r0 = V.r; da = 0; }
      if (d.rotOn) V.r = d.r0 + da;
    }
    if (!d.moved) return;
    V.s = clamp((d.s0 * dd) / d.d0, fitScale(0) * 0.25, 12);
    centerOn(d.q0.x, d.q0.y, m.x, m.y);
    V.fit = false;
    clampPan();
    applyView();
  };
  const endPinch = (d, tap) => {
    drag.current = null;
    const V = view.current;
    if (d.rotOn) { const r = ((V.r % 360) + 540) % 360 - 180; if (Math.abs(r) < 5) turnView({ r: 0 }); else bump(); }
    // 화면보다 작게 오므렸으면 화면에 맞춘다
    if (d.moved && V.s < fitScale(V.r) * 0.96) fitView();
    // 두 손가락으로 가볍게 치면 되돌리기, 세 손가락이면 다시 실행. 펜을 쓰는 중의 손바닥(넓은 접촉, 방금 펜이 닿음)은 치는 동작으로 보지 않는다
    if (tap && !d.moved && !d.big && performance.now() - d.t0 < 320 && performance.now() - lastPen.current > 1000) {
      if (d.fingers >= 3) doRedo(); else if (d.fingers === 2) doUndo();
    }
  };

  /* 안내선에 맞춰 그리기: 처음 움직인 방향과 가장 가까운 안내 방향으로 획을 고정한다 */
  const snapPt = (d, x, y) => {
    const a = d.assist;
    if (!a) return [x, y];
    if (!a.dir) {
      if (Math.hypot(x - d.x0, y - d.y0) < 10 / view.current.s) return [d.x0, d.y0];
      const g = st.current.guide;
      let s2 = [x, y];
      try { s2 = assistSnap(g.kind, { step: g.step, vp: g.vp }, d.x0, d.y0, x, y); } catch (e) {}
      const L = Math.hypot(s2[0] - d.x0, s2[1] - d.y0) || 1;
      a.dir = [(s2[0] - d.x0) / L, (s2[1] - d.y0) / L];
    }
    const t = (x - d.x0) * a.dir[0] + (y - d.y0) * a.dir[1];
    return [d.x0 + a.dir[0] * t, d.y0 + a.dir[1] * t];
  };
  /* 그리다 멈추면 도형으로 바로잡기 */
  const tryQuick = (d) => {
    if (drag.current !== d || d.mode !== "draw") return;
    let fit = null;
    try { fit = fitShape(d.op.pts); } catch (e) {}
    if (!fit) return;
    const o = d.op;
    const sop = { kind: "shape", tool: "shape", quick: true, color: o.color, size: o.size, opacity: o.opacity, dash: "solid", fill: false, sym: o.sym, sel: o.sel, alock: o.alock, layers: o.layers };
    if (fit.type === "line") Object.assign(sop, { shape: "line", x0: fit.x0, y0: fit.y0, x1: fit.x1, y1: fit.y1 });
    else if (fit.type === "ellipse") Object.assign(sop, { shape: "ellipse", cx: fit.cx, cy: fit.cy, rx: fit.rx, ry: fit.ry, rot: fit.rot || 0 });
    else if (fit.type === "rect") Object.assign(sop, { shape: "rect", cx: fit.cx, cy: fit.cy, w: fit.w, h: fit.h, rot: fit.rot || 0 });
    else if (fit.type === "poly") Object.assign(sop, { shape: "poly", pts: fit.pts, closed: !!fit.closed });
    else return;
    eng.cancelLive();
    if (!eng.beginLive(sop)) { drag.current = null; return; }
    d.mode = "quick"; d.op = sop;
    flash((QUICK_NAMES[fit.type === "ellipse" && fit.circle ? "circle" : fit.type] || "도형") + "으로 바로잡았습니다.");
  };
  /* 누르는 순간 실행되는 도구(채우기·글자·자동 선택). 손가락으로는 뗄 때 실행한다(두 손가락 동작과 겹치지 않게) */
  const runTap = (t, q) => {
    const S = st.current;
    if (t === "select") {
      addSelPart({ type: "wand", x: Math.floor(q.x), y: Math.floor(q.y), tol: S.prefs.wandTol, ref: S.prefs.fillRef, layer: eng.activeId });
      return;
    }
    const L = eng.active();
    if (!L) return;
    if (!L.vis) return flash("숨긴 레이어에는 그릴 수 없습니다. 레이어 창에서 눈 모양 버튼을 눌러 보이게 하세요.");
    if (L.lock) return flash("잠긴 레이어에는 그릴 수 없습니다. 레이어 창에서 잠금을 푸세요.");
    if (q.x < 0 || q.y < 0 || q.x >= eng.W || q.y >= eng.H) return;
    if (t === "text") {
      // 입력칸은 화면에 똑바로 놓이므로, 뒤집히거나 돌아간 화면에서는 쓴 글자의 위치와 어긋난다: 화면을 바로 놓는다
      if (view.current.fx < 0 || view.current.r % 360 !== 0) { turnView({ fx: 1, r: 0 }); flash("글자를 쓰는 동안 화면을 바로 놓았습니다."); }
      textRef.current = { x: q.x, y: q.y };
      // 누른 동작 안에서 입력칸에 포커스를 줘야 태블릿의 화면 키보드가 뜬다
      flushSync(() => { setTextVal(""); setTextAt(textRef.current); });
      if (textInRef.current) textInRef.current.focus({ preventScroll: true });
      return;
    }
    if (t === "fill") {
      eng.commit({ kind: "fill", x: Math.floor(q.x), y: Math.floor(q.y), color: S.color, opacity: S.prefs.fillT.op, tol: S.prefs.fillTol, ref: S.prefs.fillRef,
        layers: [L.id], sel: eng.sel || undefined, alock: L.alock || undefined });
      pushRecent(S.color);
      touched();
    }
  };

  const seePen = (e) => {
    lastPen.current = performance.now();
    const S = st.current;
    if (!S.prefs.penAuto) {
      // 펜을 처음 쓸 때 한 번만 손가락 그리기를 끈다. 그 뒤에는 학생이 고른 대로 둔다
      setPref({ finger: false, penAuto: true });
      if (S.prefs.finger) flash("펜을 쓰기 시작해 손가락 그리기를 껐습니다. 손가락으로는 화면 이동·확대만 합니다.");
    }
  };
  const onPointerDown = (e) => {
    const S = st.current;
    if (S.locked || S.loading || S.loadFail || adjRef.current) return;
    if (e.pointerType === "touch" && !touchDev) setTouchDev(true);
    if (e.pointerType === "pen") seePen(e);
    if (e.pointerType === "touch") {
      // 방금까지 펜이 닿아 있었거나 떠 있었다면 이 접촉은 손바닥이다
      if (ignored.current.has(e.pointerId)) return;
      if (performance.now() - lastPen.current < 500) { ignored.current.add(e.pointerId); return; }
    }
    if (rootRef.current && document.activeElement !== rootRef.current && !textRef.current) rootRef.current.focus({ preventScroll: true });
    if (e.pointerType !== "touch" && textRef.current) { commitText(); return; }
    if (e.pointerType === "touch") {
      const d0 = drag.current;
      if (d0 && d0.ptype !== "touch") { ignored.current.add(e.pointerId); return; } // 펜·마우스로 그리는 중에 닿은 손(손바닥)은 무시
      if (e.isPrimary) touches.current.clear();
      touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY, w: Math.max(e.width || 0, e.height || 0) });
      // 글자를 쓰던 중이면 확정한다. 이 손가락은 그 일만 하고(dead), 둘째 손가락이 오면 두 손가락 동작으로 넘어간다
      const hadText = !!textRef.current;
      if (hadText) commitText();
      if (touches.current.size >= 2) { startPinch(); return; }
      if (d0 && d0.mode === "pinch") return;
      if (hadText) { drag.current = { mode: "tap", id: e.pointerId, ptype: "touch", dead: true }; return; }
      if (!S.prefs.finger || S.tool === "hand") { startPan(e); return; }
    } else if (drag.current && drag.current.ptype === "touch") {
      // 펜·마우스가 손가락 조작보다 앞선다: 손바닥으로 시작된 이동·획을 거두고(화면도 되돌리고) 펜으로 그린다
      const d0 = drag.current;
      dropDrag(d0);
      if (d0.v0) backView(d0.v0);
      drag.current = null;
      touches.current.forEach((_, id) => ignored.current.add(id));
      touches.current.clear();
    }
    if (e.pointerType === "mouse") {
      if (e.button === 1 || (e.button === 0 && (spaceRef.current || S.tool === "hand"))) { e.preventDefault(); startPan(e); return; }
      if (e.button !== 0) return;
      e.preventDefault();
    } else if (e.pointerType === "pen" && (S.tool === "hand" || spaceRef.current)) { startPan(e); return; }
    if (drag.current) return;

    const q = toCanvas(e.clientX, e.clientY);
    const penEraser = e.pointerType === "pen" && (e.button === 5 || (e.buttons & 32));
    const t = xfRef.current ? "xform" : penEraser ? "eraser" : S.tool;   // 변형 중에는 펜의 지우개 쪽도 옮기기로
    const capture = () => { try { viewRef.current.setPointerCapture(e.pointerId); } catch (x) {} };
    if (t === "xform") { xfDown(e, "move"); drag.current = { mode: "xf", id: e.pointerId, ptype: e.pointerType }; capture(); return; }
    if (t === "picker" || (e.altKey && BRUSH[t])) {
      pickAt(q);
      drag.current = { mode: "pick", id: e.pointerId, ptype: e.pointerType, back: t === "picker" };
      capture();
      return;
    }
    const instant = t === "fill" || t === "text" || (t === "select" && S.prefs.selKind === "wand");
    if (instant) {
      e.preventDefault();
      if (e.pointerType === "touch") { drag.current = { mode: "tap", id: e.pointerId, ptype: "touch", tool: t, q, cx: e.clientX, cy: e.clientY }; capture(); return; }
      runTap(t, q);
      return;
    }
    if (t === "select") {
      drag.current = { mode: "sel", id: e.pointerId, ptype: e.pointerType, kind: S.prefs.selKind, x0: q.x, y0: q.y, x1: q.x, y1: q.y, pts: [q.x, q.y] };
      capture();
      return;
    }
    const L = eng.active();
    const blocked = !L.vis ? "숨긴 레이어에는 그릴 수 없습니다. 레이어 창에서 눈 모양 버튼을 눌러 보이게 하세요." : L.lock ? "잠긴 레이어에는 그릴 수 없습니다. 레이어 창에서 잠금을 푸세요." : "";
    if (blocked) return flash(blocked);
    const common = { layers: [L.id], sel: eng.sel || undefined, alock: L.alock || undefined };
    const g = S.guide;
    const sym = g.kind === "sym" ? { kind: g.sym, cx: eng.W / 2, cy: eng.H / 2, n: g.n } : undefined;
    capture();
    if (t === "shape") {
      const sk = S.prefs.shapeKind;
      const op = { kind: "shape", tool: "shape", shape: sk, x0: q.x, y0: q.y, x1: q.x, y1: q.y, color: S.color,
        size: S.prefs.shape.size, opacity: S.prefs.shape.op, dash: S.prefs.dash, fill: (sk === "rect" || sk === "ellipse") && S.prefs.fill, sym, ...common };
      if (!eng.beginLive(op)) return;
      drag.current = { mode: "shape", id: e.pointerId, ptype: e.pointerType, op, tool: t };
      return;
    }
    const T = BRUSH[t], pr = S.prefs[t];
    const b = {};
    for (const k of Object.keys(T.d)) if (k !== "size" && k !== "op") b[k] = pr[k];
    const op = T.eng === "smudge"
      ? { kind: "smudge", tool: t, size: pr.size, opacity: 1, b, g: S.prefs.gamma, pts: [], ...common }
      : { kind: "stroke", tool: t, color: S.color, size: pr.size, opacity: pr.op, dash: T.dash ? S.prefs.dash : "solid", b, g: S.prefs.gamma, seed: (Math.random() * 1e9) | 0, pts: [], sym, ...common };
    const d = { mode: "draw", id: e.pointerId, ptype: e.pointerType, op, T, tool: t, x0: q.x, y0: q.y, sx: q.x, sy: q.y, lt: e.timeStamp, lcx: e.clientX, lcy: e.clientY, pv: 1, p: 0.5, straight: false,
      assist: g.assist && ASSIST_KINDS.includes(g.kind) && T.eng !== "smudge" ? {} : null,
      quick: S.prefs.quick && !T.erase && (T.eng === "path" || T.eng === "grain" || T.eng === "nib"), hold: 0 };
    d.p = pressureOf(e, T, null);
    op.pts.push(q.x, q.y, d.p);
    if (T.tilt && e.pointerType === "pen") op.tl = [tiltOf(e)];
    if (!eng.beginLive(op)) return;
    drag.current = d;
    hoverCursor(e);
  };

  const onPointerMove = (e) => {
    if (e.pointerType === "pen") { if (!st.current.prefs.penAuto && !st.current.locked) seePen(e); else lastPen.current = performance.now(); }
    if (e.pointerType === "touch") {
      if (ignored.current.has(e.pointerId)) return;
      if (touches.current.has(e.pointerId)) { const t0 = touches.current.get(e.pointerId); touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY, w: Math.max(t0.w, e.width || 0, e.height || 0) }); }
    }
    const d = drag.current;
    if (!d) { hoverCursor(e); return; }
    if (d.mode === "pinch") { if ([...touches.current.values()].some((p) => p.w > 60)) d.big = true; movePinch(); return; }
    if (d.id !== e.pointerId) return;
    if (d.mode === "xf") { xfMove(e); return; }
    if (d.mode === "pan") {
      const V = view.current, K = deltaK();
      const dx = (e.clientX - d.cx) / K, dy = (e.clientY - d.cy) / K;
      // 손가락 이동은 8px 넘게 움직인 뒤에 시작한다(스친 손바닥에 화면이 밀리지 않게)
      if (!d.go) { if (Math.hypot(dx, dy) < 8) return; d.go = true; viewRef.current.classList.add("panning"); }
      V.tx = d.tx + dx; V.ty = d.ty + dy; V.fit = false;
      clampPan(); applyView();
      return;
    }
    if (d.mode === "pick") { pickAt(toCanvas(e.clientX, e.clientY)); return; }
    if (d.mode === "sel") {
      const q = toCanvas(e.clientX, e.clientY);
      d.x1 = q.x; d.y1 = q.y;
      if (e.shiftKey && d.kind !== "lasso") {
        const m = Math.max(Math.abs(q.x - d.x0), Math.abs(q.y - d.y0));
        d.x1 = d.x0 + Math.sign(q.x - d.x0 || 1) * m; d.y1 = d.y0 + Math.sign(q.y - d.y0 || 1) * m;
      }
      if (d.kind === "lasso") { const n = d.pts.length; if (Math.hypot(q.x - d.pts[n - 2], q.y - d.pts[n - 1]) > 2 / view.current.s) d.pts.push(q.x, q.y); }
      drawSelPreview(d);
      return;
    }
    if (d.mode === "shape") {
      const q = toCanvas(e.clientX, e.clientY), op = d.op;
      let x1 = q.x, y1 = q.y;
      if (e.shiftKey) {
        const dx = x1 - op.x0, dy = y1 - op.y0;
        if (op.shape === "line" || op.shape === "arrow") {
          const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12), L = Math.hypot(dx, dy);
          x1 = op.x0 + Math.cos(a) * L; y1 = op.y0 + Math.sin(a) * L;
        } else {
          const m = Math.max(Math.abs(dx), Math.abs(dy));
          x1 = op.x0 + Math.sign(dx || 1) * m; y1 = op.y0 + Math.sign(dy || 1) * m;
        }
      }
      op.x1 = x1; op.y1 = y1;
      eng.drawLive();
      hoverCursor(e);
      return;
    }
    if (d.mode !== "draw") return;
    const op = d.op;
    if (e.shiftKey) {
      // Shift: 시작점에서 지금 위치까지 직선
      const q = toCanvas(e.clientX, e.clientY);
      d.p = pressureOf(e, d.T, d);
      op.pts = [d.x0, d.y0, op.pts[2], q.x, q.y, d.p];
      if (op.tl) op.tl = [op.tl[0], tiltOf(e)];
      d.straight = true; d.sx = q.x; d.sy = q.y;
      eng.restartLive();
      hoverCursor(e);
      return;
    }
    // 펜은 한 프레임 사이에 여러 표본을 보낸다. React의 합성 이벤트에는 묶인 표본이 없어 원래 이벤트에서 꺼낸다
    const ne = e.nativeEvent || e;
    const list = typeof ne.getCoalescedEvents === "function" ? ne.getCoalescedEvents() : [];
    const evs = list.length ? list : [ne];
    const k0 = 1 - clamp(st.current.prefs.smooth, 0, 10) * 0.085;   // 16ms(한 프레임)마다 따라가는 비율
    const minD = 0.75 / view.current.s;
    let grew = false;
    for (const ev of evs) {
      const q = toCanvas(ev.clientX, ev.clientY);
      const dt = clamp(ev.timeStamp - d.lt, 1, 48);
      const k = k0 >= 1 ? 1 : 1 - Math.pow(1 - k0, dt / 16);
      const p = pressureOf(ev, d.T, d);
      d.lt = ev.timeStamp; d.lcx = ev.clientX; d.lcy = ev.clientY; d.p = p;
      d.sx += (q.x - d.sx) * k; d.sy += (q.y - d.sy) * k;
      const [px, py] = snapPt(d, d.sx, d.sy);
      const n = op.pts.length;
      if (Math.hypot(px - op.pts[n - 3], py - op.pts[n - 2]) < minD) continue;
      op.pts.push(px, py, p);
      if (op.tl) op.tl.push(tiltOf(ev));
      grew = true;
    }
    eng.drawLive();
    hoverCursor(e);
    if (d.quick && grew) { clearTimeout(d.hold); d.hold = setTimeout(() => tryQuick(d), 620); }
  };

  const finishDraw = (d, e) => {
    const op = d.op;
    clearTimeout(d.hold);
    if (e && !d.straight && !d.assist && st.current.prefs.smooth > 0) {
      // 보정 때문에 뒤처진 끝을 펜을 뗀 곳까지 잇는다
      const q = toCanvas(e.clientX, e.clientY), n = op.pts.length;
      if (Math.hypot(q.x - op.pts[n - 3], q.y - op.pts[n - 2]) > 0.75 / view.current.s) { op.pts.push(q.x, q.y, d.p); if (op.tl) op.tl.push(op.tl[op.tl.length - 1] || 0); }
    }
    if (op.tl && !op.tl.some((x) => x > 0)) delete op.tl;
    if (!eng.endLive()) { bump(); return; }   // 그 사이 캔버스를 다시 불러와 엔진이 받지 않은 획
    if (op.kind === "stroke" && !d.T.erase) pushRecent(op.color);
    touched();
  };

  const onPointerUp = (e) => {
    if (e.pointerType === "pen") lastPen.current = performance.now();
    if (e.pointerType === "touch") {
      if (ignored.current.delete(e.pointerId)) return;
      touches.current.delete(e.pointerId);
    }
    const d = drag.current;
    if (!d) return;
    if (d.mode === "pinch") {
      if (touches.current.size === 0) endPinch(d, true);
      else if (touches.current.size >= 2) startPinch();   // 세 손가락에서 하나를 떼면 남은 둘로 기준을 다시 잡는다
      return;
    }
    if (d.id !== e.pointerId) return;
    drag.current = null;
    viewRef.current.classList.remove("panning");
    if (d.mode === "xf") xfUp(e);
    else if (d.mode === "draw") finishDraw(d, e);
    else if (d.mode === "quick") { eng.endLive(); pushRecent(d.op.color); touched(); }
    else if (d.mode === "shape") {
      const op = d.op;
      if (Math.hypot(op.x1 - op.x0, op.y1 - op.y0) * view.current.s < 3) eng.cancelLive();
      else { eng.endLive(); pushRecent(op.color); touched(); }
    } else if (d.mode === "sel") {
      drawSelPreview(null);
      const w = Math.abs(d.x1 - d.x0), h = Math.abs(d.y1 - d.y0);
      if (d.kind === "lasso") { if (d.pts.length >= 6) addSelPart({ type: "lasso", pts: d.pts }); }
      else if (Math.max(w, h) * view.current.s < 4) { if (st.current.prefs.selOp === "new") setSel(null); }
      else if (d.kind === "rect") addSelPart({ type: "rect", x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1), w, h });
      else addSelPart({ type: "ellipse", cx: (d.x0 + d.x1) / 2, cy: (d.y0 + d.y1) / 2, rx: w / 2, ry: h / 2 });
    } else if (d.mode === "pick") {
      if (d.back) setTool(prevTool.current);
    } else if (d.mode === "tap") {
      if (!d.dead && Math.hypot(e.clientX - d.cx, e.clientY - d.cy) < 10 * deltaK()) runTap(d.tool, d.q);
    }
  };
  const onPointerCancel = (e) => {
    if (e.pointerType === "touch") {
      if (ignored.current.delete(e.pointerId)) return;
      touches.current.delete(e.pointerId);
    }
    const d = drag.current;
    if (!d || (d.mode !== "pinch" && d.id !== e.pointerId)) return;
    if (d.mode === "pinch") {
      // 브라우저가 터치를 거둬 갔다(손바닥 판정 등): 그 접촉이 옮긴 화면을 되돌린다
      if (touches.current.size === 0) { drag.current = null; backView(d.v0); }
      else if (touches.current.size >= 2) startPinch();
      return;
    }
    drag.current = null;
    clearTimeout(d.hold);
    viewRef.current.classList.remove("panning");
    if (d.mode === "xf") xfUp(e);
    else if (d.mode === "pan") { if (e.pointerType === "touch") backView(d.v0); }
    else if (d.mode === "draw" && e.pointerType !== "touch") finishDraw(d, null);
    else if (d.mode === "quick" && e.pointerType !== "touch") { eng.endLive(); touched(); }
    else if (d.mode === "draw" || d.mode === "shape" || d.mode === "quick") eng.cancelLive();
    else if (d.mode === "sel") drawSelPreview(null);
    else if (d.mode === "pick" && d.back) setTool(prevTool.current);
  };
  /* 캡처를 잃었는데 up·cancel이 오지 않는 경우(브라우저가 포인터를 가져감)를 정리한다 */
  const onLostCapture = (e) => {
    const d = drag.current;
    if (d && d.mode !== "pinch" && d.id === e.pointerId) onPointerCancel(e);
  };

  const onWheel = (e) => {
    const S = st.current;
    if (S.locked) return;
    if (textRef.current) commitText();
    const l = localOf(e.clientX, e.clientY);
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const k = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0022));
      zoomAt(view.current.s * k, l.x, l.y);
      return;
    }
    const V = view.current, K = deltaK();
    let dx = e.deltaX / K, dy = e.deltaY / K;
    if (e.deltaMode === 1) { dx *= 16; dy *= 16; }
    if (e.shiftKey && !dx) { dx = dy; dy = 0; }
    if (S.full) {
      e.preventDefault();
      V.tx -= dx; V.ty -= dy; V.fit = false;
      clampPan(); applyView();
      return;
    }
    // 본문 안에서는 캔버스가 화면(그리는 면) 밖으로 넘친 만큼만 휠로 옮기고, 끝에 닿으면 페이지가 스크롤되게 둔다
    if (V.fit) return;
    const { w, h } = vpSize();
    const cs = [[0, 0], [eng.W, 0], [0, eng.H], [eng.W, eng.H]].map(([x, y]) => toScreen(x, y));
    const x0 = Math.min(...cs.map((p) => p.x)), x1 = Math.max(...cs.map((p) => p.x)), y0 = Math.min(...cs.map((p) => p.y)), y1 = Math.max(...cs.map((p) => p.y));
    const mx = dx > 0 ? Math.min(dx, Math.max(0, x1 - w)) : Math.max(dx, Math.min(0, x0));
    const my = dy > 0 ? Math.min(dy, Math.max(0, y1 - h)) : Math.max(dy, Math.min(0, y0));
    if (Math.abs(mx) < 0.5 && Math.abs(my) < 0.5) return;
    e.preventDefault();
    V.tx -= mx; V.ty -= my;
    applyView();
  };

  const onKey = (e) => {
    const S = st.current;
    if (S.locked || replay) return;
    const t = e.target;
    const typing = t && (t.tagName === "TEXTAREA" || t.tagName === "SELECT" || (t.tagName === "INPUT" && !["range", "color", "checkbox", "button", "file"].includes(t.type)));
    if (typing) return;
    const k = keyOf(e), mod = e.ctrlKey || e.metaKey;
    // 긋거나 끄는 중에는 스페이스 말고는 받지 않는다(진행 중인 획과 엔진의 기준 그림이 어긋나지 않게)
    const dg = drag.current;
    if (dg && dg.mode !== "pinch" && dg.mode !== "pan" && k !== " ") { if (mod) e.preventDefault(); return; }
    if (mod && (k === "z" || k === "Z")) { e.preventDefault(); if (e.shiftKey) doRedo(); else doUndo(); return; }
    if (mod && (k === "y" || k === "Y")) { e.preventDefault(); doRedo(); return; }
    if (mod && (k === "s" || k === "S")) { e.preventDefault(); if (dirtyRef.current) save(); return; }
    if (mod && (k === "a" || k === "A")) { e.preventDefault(); if (!xfRef.current && !adjRef.current) selectAll(); return; }
    if (mod && (k === "d" || k === "D")) { e.preventDefault(); if (!xfRef.current && !adjRef.current) setSel(null); return; }
    if (mod || e.altKey) return;
    if (k === " ") {
      if (t === rootRef.current || t === viewRef.current || t === document.body) {
        e.preventDefault();
        if (!spaceRef.current) { spaceRef.current = true; viewRef.current.classList.add("space"); hideCursor(); }
      }
      return;
    }
    if (k === "Escape") {
      if (xfRef.current) { e.preventDefault(); cancelXform(); }
      else if (adjRef.current) { e.preventDefault(); endAdjust(false); }
      else if (S.panel) { e.preventDefault(); setPanel(null); }
      else if (S.full) { e.preventDefault(); setFull(false); }
      return;
    }
    if (k === "Enter") {
      // 버튼에 포커스가 있으면 그 버튼이 Enter를 처리한다(「취소」에서 Enter를 눌렀는데 적용되지 않게). 변형 손잡이는 예외
      if (t && t !== rootRef.current && t.closest && t.closest("button:not(.skx-h),a,summary")) return;
      if (xfRef.current) { e.preventDefault(); applyXform(); setTool(prevTool.current === "xform" ? lastBrush : prevTool.current); }
      else if (adjRef.current) { e.preventDefault(); endAdjust(true); }
      return;
    }
    if (xfRef.current && /^Arrow/.test(k)) {
      // 변형 중 화살표 키: 1px(Shift는 10px)씩 옮긴다
      e.preventDefault();
      // 손잡이에 포커스가 있으면 그 손잡이의 일을 한다: 크기(1%, Shift는 10%), 회전(1°, Shift는 15°)
      const hm = t && t.classList && t.classList.contains("skx-h") ? t.dataset.mode : "";
      if (hm === "scale") { const f = 1 + (k === "ArrowUp" || k === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 0.1 : 0.01); xfPatch((x) => ({ sx: x.sx * f, sy: x.sy * f })); return; }
      if (hm === "rot") { const dr = ((k === "ArrowRight" || k === "ArrowDown" ? 1 : -1) * (e.shiftKey ? 15 : 1) * Math.PI) / 180; xfPatch((x) => ({ rot: x.rot + dr })); return; }
      // 옮기기: 화면에서 누른 방향대로(좌우 반전·회전해서 보는 중에도)
      const n = e.shiftKey ? 10 : 1, X = xfRef.current, V = view.current;
      const dxs = k === "ArrowLeft" ? -n : k === "ArrowRight" ? n : 0, dys = k === "ArrowUp" ? -n : k === "ArrowDown" ? n : 0;
      const rad = (V.r * Math.PI) / 180, c = Math.cos(rad), sn = Math.sin(rad);
      const u = c * dxs + sn * dys, w = -sn * dxs + c * dys;
      xfPatch({ tx: X.tx + (V.fx < 0 ? -u : u), ty: X.ty + w });
      return;
    }
    if (xfRef.current || adjRef.current) return;
    if ((k === "Delete" || k === "Backspace") && eng.sel) { e.preventDefault(); clearSelArea(); return; }
    if (k === "[" || k === "]") {
      const T = TOOL[S.tool];
      if (!T || !T.min) return;
      e.preventDefault();
      const vv = sizeToSlider(T, S.prefs[S.tool].size) + (k === "]" ? 60 : -60);
      setToolPref(S.tool, { size: clamp(sliderToSize(T, clamp(vv, 0, 1000)), T.min, T.max) });
      return;
    }
    if (k === "+" || k === "=") { e.preventDefault(); zoomBy(1.25); return; }
    if (k === "-" || k === "_") { e.preventDefault(); zoomBy(0.8); return; }
    if (k === "0") { e.preventDefault(); fitView(); return; }
    if (k === "f" || k === "F") { e.preventDefault(); setFull((x) => !x); return; }
    if (k === "l" || k === "L") { e.preventDefault(); setPanel((p) => (p === "layers" ? null : "layers")); return; }
    if (k === "c" || k === "C") { e.preventDefault(); setPanel((p) => (p === "color" ? null : "color")); return; }
    if (k === "x" || k === "X") { e.preventDefault(); turnView({ fx: -view.current.fx }); return; }
    const T = Object.values(TOOL).find((x) => x.key && x.key === k.toLowerCase());
    if (T) { e.preventDefault(); if (T.k !== S.tool || (T.k === "xform" && !xfRef.current)) selectTool(T.k); }
  };
  const onKeyUp = (e) => {
    if (e.key === " " && spaceRef.current) {
      spaceRef.current = false;
      if (viewRef.current) viewRef.current.classList.remove("space");
    }
  };

  /* ---------- 글자 ---------- */

  function commitText() {
    const at = textRef.current, val = textValRef.current.replace(/\s+$/, "");
    textRef.current = null;
    setTextAt(null);
    setTextVal("");
    if (!at || !val.trim()) return;
    const L = eng.active(), S = st.current;
    if (!L || L.lock || !L.vis) return;
    const op = { kind: "text", tool: "text", x: at.x, y: at.y, text: val, size: S.prefs.text.size, font: S.prefs.font, color: S.color, opacity: S.prefs.text.op, sel: eng.sel || undefined, alock: L.alock || undefined, layers: [L.id] };
    const go = () => {
      if (!aliveRef.current || st.current.locked || !eng.layer(L.id)) return;
      // 그 사이 획·변형·조정이 시작됐으면 끝난 뒤에 넣는다(미리보기가 글자를 덮지 않게)
      if (eng.live || xfRef.current || adjRef.current) { setTimeout(go, 200); return; }
      eng.commit(op); pushRecent(op.color); touched();
    };
    const font = textFont(op.size, op.font);
    let ready = true;
    try { ready = !document.fonts || !document.fonts.check || document.fonts.check(font, val); } catch (e) {}
    if (ready) go();                                   // 입력칸이 같은 글꼴로 보여 주므로 대개 이미 준비돼 있다
    else Promise.race([document.fonts.load(font, val), new Promise((r) => setTimeout(r, 1500))]).then(go, go);
  }

  /* ---------- 캔버스·사진·내보내기 ---------- */

  const changeRatio = (k) => {
    const R = RATIOS.find((r) => r.k === k);
    if (!R || (R.W === eng.W && R.H === eng.H)) return;
    if (eng.hasContent() && !window.confirm("캔버스 비율을 바꾸면 지금 그림이 새 캔버스에 맞게 줄어들고, 되돌리기 기록이 지워집니다. 바꿀까요?")) return;
    canvasOp("resize", { w: R.W, h: R.H });
  };
  const canvasOp = (type, arg) => {
    abortModes();
    eng.canvasOp(type, arg);
    setGuide((g) => ({ ...g, vp: null }));
    setDims({ W: eng.W, H: eng.H });
    refit();
    touched();
  };
  const turnCanvas = (type, arg) => {
    if (eng.hist.length && !window.confirm("캔버스를 돌리거나 뒤집으면 되돌리기 기록이 지워집니다. 계속할까요?")) return;
    canvasOp(type, arg);
  };
  const importPhoto = async (file) => {
    if (!file) return;
    if (eng.layers.length >= MAX_LAYERS) return flash("레이어가 " + MAX_LAYERS + "장이라 더 불러올 수 없습니다. 레이어를 하나 지운 뒤 불러오세요.");
    let url = "";
    try {
      url = URL.createObjectURL(file);
      const img = await loadImg(url);
      const s = Math.min(eng.W / img.naturalWidth, eng.H / img.naturalHeight);
      const w = Math.round(img.naturalWidth * s), h = Math.round(img.naturalHeight * s);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const cx = c.getContext("2d");
      cx.imageSmoothingQuality = "high";
      cx.drawImage(img, 0, 0, w, h);
      if (st.current.locked || !aliveRef.current) return;
      const act = eng.active(), grp = "g" + eng.grpSeq++;
      const N = eng.commit({ kind: "ladd", name: "사진", index: eng.layers.indexOf(act), activate: false, grp })._L;
      eng.commit({ kind: "lset", id: N.id, patch: { op: 0.6 }, grp });
      eng.commit({ kind: "image", img: c, x: Math.round((eng.W - w) / 2), y: Math.round((eng.H - h) / 2), w, h, layers: [N.id], grp });
      setPanel("layers");
      touched();
      flash("사진을 지금 레이어 아래에 불러왔습니다. 레이어 창에서 불투명도를 바꿀 수 있습니다.");
    } catch (e) {
      flash("사진을 불러오지 못했습니다. JPG나 PNG 파일인지 확인해 주세요.");
    } finally {
      if (url) URL.revokeObjectURL(url);
    }
  };
  const exportImage = async (kind) => {
    try {
      const cv = eng.composite(kind === "png-t" ? null : paperColor(eng.paper));
      const blob = await blobOf(cv, kind === "jpg" ? "image/jpeg" : "image/png", 0.92);
      freeCanvas(cv);
      const d = new Date();
      download(blob, `에스키스_${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}.${kind === "jpg" ? "jpg" : "png"}`);
    } catch (e) { flash("그림 파일을 만들지 못했습니다."); }
  };
  const pasteCanvas = (c, name) => {
    const act = eng.active(), grp = "g" + eng.grpSeq++;
    const N = eng.commit({ kind: "ladd", name, index: eng.layers.indexOf(act) + 1, grp })._L;
    const s2 = Math.min(1, eng.W / c.width, eng.H / c.height), w = Math.round(c.width * s2), h = Math.round(c.height * s2);
    eng.commit({ kind: "image", paste: true, img: c, x: Math.round((eng.W - w) / 2), y: Math.round((eng.H - h) / 2), w, h, layers: [N.id], grp });
    touched();
  };
  const pasteClip = async () => {
    if (eng.layers.length >= MAX_LAYERS) return flash("레이어는 " + MAX_LAYERS + "장까지 만들 수 있습니다.");
    try {
      const items = await navigator.clipboard.read();
      for (const it of items) {
        const type = it.types.find((t) => t.startsWith("image/"));
        if (!type) continue;
        const img = await blobImg(await it.getType(type));
        if (st.current.locked || !aliveRef.current) return;
        const k = Math.min(1, eng.W / img.naturalWidth, eng.H / img.naturalHeight);
        const c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        pasteCanvas(c, "붙여넣은 그림");
        return flash("클립보드의 그림을 새 레이어로 붙여넣었습니다.");
      }
      flash("클립보드에 그림이 없습니다.");
    } catch (e) { flash("클립보드를 읽지 못했습니다. 브라우저 권한을 확인해 주세요."); }
  };
  const copyClip = async () => {
    try {
      const cv = eng.composite(paperColor(eng.paper));
      const blob = await blobOf(cv);
      freeCanvas(cv);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      flash("그림을 클립보드에 복사했습니다.");
    } catch (e) { flash("클립보드에 복사하지 못했습니다. 그림 파일로 내려받아 주세요."); }
  };
  /* 참고 그림: 옆에 띄워 놓고 보면서 그린다. 눌러서 색을 가져올 수 있다. 저장되지 않고 이 화면에서만 보인다 */
  const openRef = async (file) => {
    if (!file) return;
    try {
      const img = await blobImg(file);
      const k = Math.min(1, 1000 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
      c.getContext("2d", { willReadFrequently: true }).drawImage(img, 0, 0, c.width, c.height);
      if (refCv.current) freeCanvas(refCv.current);
      refCv.current = c;
      setRefImg({ src: c.toDataURL("image/jpeg", 0.85), w: c.width, h: c.height });
      setPanel("ref");
    } catch (e) { flash("사진을 불러오지 못했습니다. JPG나 PNG 파일인지 확인해 주세요."); }
  };
  const pickRef = (e) => {
    const c = refCv.current, r = e.currentTarget.getBoundingClientRect();
    if (!c || !r.width) return;
    const x = clamp(Math.floor(((e.clientX - r.left) / r.width) * c.width), 0, c.width - 1), y = clamp(Math.floor(((e.clientY - r.top) / r.height) * c.height), 0, c.height - 1);
    const d = c.getContext("2d", { willReadFrequently: true }).getImageData(x, y, 1, 1).data;
    chooseColor("#" + [d[0], d[1], d[2]].map((n) => n.toString(16).padStart(2, "0")).join("").toUpperCase());
  };
  const clearAll = () => {
    if (drag.current || eng.live || !eng.hasContent()) return;
    const ids = eng.layers.filter((L) => !L.lock).map((L) => L.id);
    if (!ids.length) return flash("모든 레이어가 잠겨 있습니다.");
    eng.commit({ kind: "clear", layers: ids });
    touched();
    flash("모두 지웠습니다. 되돌리기로 되살릴 수 있습니다.");
  };

  /* ---------- 저장 ---------- */

  const save = (opt = {}) => {
    if (savePromise.current) {
      if (!opt.force) return savePromise.current;
      // 잠그는 순간의 저장: 진행 중인 저장이 끝난 뒤, 그 저장이 시작된 다음에 그린 내용이 남아 있으면 한 번 더 저장한다
      return savePromise.current.then(() => (aliveRef.current && dirtyRef.current && st.current.locked ? save(opt) : true));
    }
    const p = doSave(opt).finally(() => { if (savePromise.current === p) savePromise.current = null; });
    savePromise.current = p;
    return p;
  };
  const doSave = async (opt) => {
    const S = st.current;
    if (savingRef.current || S.loading || S.loadFail || (S.locked && !opt.force) || drag.current || xfRef.current || adjRef.current) return false;
    if (textRef.current) commitText();
    savingRef.current = true;
    setBusy(true);
    lastTry.current = Date.now();
    if (!opt.auto) { setErr(""); await new Promise((r) => setTimeout(r, 30)); } // 「저장 중…」이 먼저 보이게
    const seq = changeSeq.current;
    const made = [];
    let ok = false;
    try {
      const ts = Date.now(), ref = fieldKey + "." + ts;
      // 1) 지금 상태를 한꺼번에 문자열로 만든다(올리는 동안 그림이 바뀌어도 한 시점의 그림이 저장되게)
      const whole = eng.composite(paperColor(eng.paper));
      const comp = encodeOpaque(whole);
      freeCanvas(whole);
      if (!comp) throw new Error("big");
      const Ls = eng.layers.slice(), metas = eng.layersMeta(), vers = Ls.map((L) => L.ver);
      // 바뀌지 않은 레이어는 앞 저장의 문서를 그대로 쓴다. 단, 지금 저장 값이 실제로 가리키는 문서일 때만
      // (지웠다 되돌린 레이어는 그 사이 저장이 문서를 지웠을 수 있다)
      const live0 = new Set(refsOf(vRef.current));
      const reuse = Ls.map((L) => !!(L.saved && L.saved.ver === L.ver && L.saved.parts.every((x) => live0.has(x.ref))));
      const reParts = Ls.map((L, i) => (reuse[i] ? L.saved.parts : null));
      const enc = Ls.map((L, i) => (reuse[i] ? null : encodeLayer(L.cv)));
      if (enc.some((d, i) => !reuse[i] && !d)) throw new Error("big");
      const log = eng.log(), stats = logStats(log);
      let logStr = LOG_PREFIX + packLog(log);
      if (logStr.length > PART_MAX * 4) logStr = null;
      const W = eng.W, H = eng.H, paper = eng.paper, g = S.guide;
      // 2) 올린다. 제한 시간을 넘긴 쓰기도 나중에 반영될 수 있으므로, 올리기 전에 이름을 적어 두고 실패하면 지우기를 건다
      made.push(ref);
      if (!(await store.putT(owner, ref, comp))) throw new Error("net");
      const layers = [];
      for (let i = 0; i < Ls.length; i++) {
        const parts = reuse[i] ? reParts[i] : await putParts(store, owner, ref + ".L" + metas[i].id, enc[i]);
        if (!parts) throw new Error("net");        // 한 장이라도 못 올리면 저장하지 않는다(레이어를 버리고 합쳐 저장하지 않는다)
        if (!reuse[i]) made.push(...parts.map((p) => p.ref));
        layers.push({ ...metas[i], parts });
      }
      let logParts = null;
      if (logStr) { logParts = await putParts(store, owner, ref + ".log", logStr); if (logParts) made.push(...logParts.map((p) => p.ref)); }
      // 3) 값. 앞의 저장본은 버전으로 두거나(keep) 지운다
      const pv = vRef.current, prev = pv && typeof pv === "object" && pv.ref ? pv : null;
      // 올리는 사이 값이 바뀌어(다른 기기, 지우기) 다시 쓰려던 문서가 사라졌으면 이번 저장은 버리고 다음에 새로 올린다
      const liveNow = new Set(prev ? refsOf(prev) : []);
      if (reParts.some((ps) => ps && !ps.every((x) => liveNow.has(x.ref)))) { Ls.forEach((L) => { L.saved = null; }); throw new Error("net"); }
      let versions = prev && Array.isArray(prev.versions) ? prev.versions.filter((x) => x && x.ref) : [];
      const lastKept = Math.max(0, ...versions.map((x) => +new Date(x.at) || 0), prev && prev.keep ? +new Date(prev.at) || 0 : 0);
      // 다른 기기에서 들어온 저장본(remote)은 이 기기가 본 적 없는 그림이므로 항상 버전으로 둔다
      if (prev && (prev.keep || remoteRef.current)) versions = [...versions, { ref: prev.ref, at: prev.at || "", w: prev.w || 0, h: prev.h || 0, n: prev.stats ? prev.stats.n || 0 : 0 }];
      versions = versions.slice(-VERSIONS_MAX);
      const val = { ref, at: new Date(ts).toISOString(), w: W, h: H, paper, stats, keep: !!opt.version || ts - lastKept >= VERSION_GAP, layers };
      if (logParts) val.log = { parts: logParts, n: log.length };
      if (versions.length) val.versions = versions;
      if (g && g.kind !== "none") val.guide = { kind: g.kind, step: g.step, vp: g.vp ? g.vp.map((p) => ({ x: p[0], y: p[1] })) : null, sym: g.sym, n: g.n, assist: !!g.assist };
      // 여기까지 온 저장은 잠금 전에 시작했거나 잠그는 순간의 저장(force)이다: 잠긴 뒤에 끝나도 적는다(setField의 upload)
      if (!aliveRef.current) throw new Error("lock");
      if (setField(fieldKey, val, st.current.locked ? { upload: true } : undefined) === false) throw new Error("lock");   // 기록지가 쓰기를 받지 않음(초기화·이관 직후)
      const keep = new Set(refsOf(val));
      cleanup.current = { ref, olds: [...(cleanup.current ? cleanup.current.olds : []), ...(prev ? refsOf(prev) : [])].filter((r) => !keep.has(r)), draft: false };
      loadedRef.current = ref;
      Ls.forEach((L, i) => { L.saved = { ver: vers[i], parts: layers[i].parts }; });
      remoteRef.current = false; setRemote(false);
      ok = true;
      lastSaveAt.current = ts;
      setSavedAt(ts);
      setAutoFail(0);
      // 초안은 기록지 쓰기가 확인된 뒤에 지운다(위의 정리 effect)
      if (seq === changeSeq.current) { cleanup.current.draft = true; clearTimeout(draft.current.timer); markClean(); }
      else { draft.current.fresh = false; draft.current.ver++; clearTimeout(draft.current.timer); draft.current.timer = setTimeout(writeDraft, 600); }
      if (!logParts && !opt.auto && logStr === null) flash("과정 기록이 너무 길어 그림만 저장했습니다.");
    } catch (e) {
      made.forEach((r) => store.remove(owner, r));
      const m = e && e.message;
      if (m === "big") setErr("스케치가 너무 커서 저장하지 못했습니다. 에어브러시·목탄으로 넓게 칠한 부분을 줄여 보세요.");
      else if (m !== "lock") { if (opt.auto) setAutoFail((n) => n + 1); else setErr("스케치를 저장하지 못했습니다. 연결을 확인하고 다시 저장해 주세요. 그린 내용은 그대로 있습니다."); }
    }
    savingRef.current = false;
    if (aliveRef.current) setBusy(false);
    return ok;
  };
  const autoTick = () => {
    const S = st.current;
    if (!S.prefs.autosave || autoHold.current || !dirtyRef.current || savingRef.current || S.locked || S.loading || S.loadFail || drag.current || xfRef.current || adjRef.current || textRef.current) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    const now = Date.now();
    // 실패한 뒤에는 간격을 벌린다(오프라인에서 쓰기가 대기열에 쌓이지 않게)
    if (now - lastChangeAt.current < 2500 || now - lastSaveAt.current < AUTOSAVE_GAP || now - lastTry.current < AUTOSAVE_GAP) return;
    save({ auto: true });
  };
  const onHide = () => {
    if (!dirtyRef.current) return;
    if (!draft.current.fresh) { clearTimeout(draft.current.timer); writeDraft(); }
    if (st.current.prefs.autosave && !autoHold.current && Date.now() - lastTry.current > 20000 && !drag.current) save({ auto: true });
  };
  /* 나가기 전에 src-app.jsx가 부른다: 진행 중인 저장을 기다리고, 남은 변경이 있으면 한 번 저장해 본다 */
  const flush = async () => {
    flushPrefs();
    if (autoHold.current) return true;
    if (savePromise.current) await savePromise.current;
    if (dirtyRef.current && !st.current.locked) { abortModes(); await save({ auto: true }); }
    // 저장한 값이 기록지 상태로 내려온 것을 본 뒤에 끝낸다(바로 이어지는 기록지 저장에 함께 실리게)
    const vr = vRef.current && typeof vRef.current === "object" ? vRef.current.ref || null : null;
    if (aliveRef.current && !dirtyRef.current && loadedRef.current && vr !== loadedRef.current) await new Promise((res) => { applied.current = res; setTimeout(res, 1500); });
    return !dirtyRef.current;
  };
  const revertToSaved = () => {
    if (!cur || savingRef.current) return;
    if (!window.confirm("저장한 뒤에 그린 내용을 버리고 저장한 그림으로 되돌릴까요?")) return;
    abortModes();
    clearDraft();
    markClean();
    loadFrom(cur, null);
  };
  const retryLoad = () => { abortModes(); loadFrom(cur, null); };
  const removeSaved = async () => {
    if (!cur || savingRef.current || !confirmDel()) return;
    const refs = [...refsOf(cur), ...(cleanup.current ? cleanup.current.olds : [])];
    if (setField(fieldKey, "") === false) return;
    cleanup.current = null;
    loadedRef.current = null;
    refs.forEach((r) => store.remove(owner, r));
    eng.layers.forEach((L) => { L.saved = null; });
    if (eng.hasContent()) {
      // 캔버스의 그림은 그대로 두되, 학생이 지운 저장본이 자동 저장으로 되살아나지 않게 한다
      changed();
      autoHold.current = true; setHold(true);
      sketchDirty.unsaved = false;
    } else { clearDraft(); markClean(); }
  };
  /* 저장 버전을 불러온다. layer: 새 레이어로(지금 그림은 그대로), replace: 지금 그림을 그 버전으로 바꾼다. 둘 다 되돌릴 수 있다 */
  const restoreVersion = async (ver, mode) => {
    if (st.current.locked || drag.current) return;
    if (mode === "layer" && eng.layers.length >= MAX_LAYERS) return flash("레이어는 " + MAX_LAYERS + "장까지 만들 수 있습니다.");
    abortModes();
    try {
      const data = await store.get(owner, ver.ref);
      if (typeof data !== "string" || !data.startsWith("data:image")) throw new Error("missing");
      const img = await loadImg(data);
      if (st.current.locked || !aliveRef.current) return;
      abortModes();   // 불러오는 사이 시작된 획·변형·조정을 거둔 뒤에 넣는다
      const c = document.createElement("canvas");
      c.width = eng.W; c.height = eng.H;
      const s = Math.min(eng.W / img.naturalWidth, eng.H / img.naturalHeight);
      const w = img.naturalWidth * s, h = img.naturalHeight * s;
      c.getContext("2d").drawImage(img, (eng.W - w) / 2, (eng.H - h) / 2, w, h);
      const grp = "g" + eng.grpSeq++;
      if (mode === "replace") {
        if (eng.layers.length > 1) eng.commit({ kind: "lflat", grp });
        const B = eng.layers[0];
        if (B.lock) eng.commit({ kind: "lset", id: B.id, patch: { lock: false }, grp });
        eng.commit({ kind: "image", paste: true, img: c, x: 0, y: 0, w: eng.W, h: eng.H, layers: [B.id], grp });
        flash("그 버전으로 바꿨습니다. 되돌리기 버튼으로 취소할 수 있습니다.");
      } else {
        const N = eng.commit({ kind: "ladd", name: "저장 버전 " + fmtTime(ver.at), index: eng.layers.length, grp })._L;
        eng.commit({ kind: "image", paste: true, img: c, x: 0, y: 0, w: eng.W, h: eng.H, layers: [N.id], grp });
        flash("저장 버전을 새 레이어로 불러왔습니다.");
      }
      touched();
    } catch (e) { flash("저장 버전을 불러오지 못했습니다."); }
  };

  fn.current = { onWheel, onKey, onKeyUp, autoTick, onHide, abortModes, save, flush, flushPrefs };

  /* ---------- 그리기 ---------- */

  const T = TOOL[tool];
  const pr = tool === "fill" ? prefs.fillT : prefs[tool];
  const hasSize = !!(T && T.min);
  const drawTool = isDrawBrush(tool);
  const brushLike = !!BRUSH[tool];
  const X = xfRef.current;
  const modal = !!X || !!adj;
  const canUndo = eng.hist.length > 0 || modal, canRedo = eng.redo.length > 0 && !modal;
  const textPos = textAt ? toScreen(textAt.x, textAt.y) : null;
  const sizeCss = hasSize && pr ? pr.size * view.current.s : 0;
  const R = ratioFor(dims.W, dims.H);
  const adjDef = adj ? ADJUSTS.find((a) => a.k === adj.type) : null;
  const vps = guide.kind === "persp1" || guide.kind === "persp2"
    ? (guide.vp && guide.vp.length >= (guide.kind === "persp2" ? 2 : 1) ? guide.vp : guide.kind === "persp2" ? [[dims.W * 0.08, dims.H * 0.42], [dims.W * 0.92, dims.H * 0.42]] : [[dims.W * 0.5, dims.H * 0.42]]).slice(0, guide.kind === "persp2" ? 2 : 1)
    : null;
  const gShown = vps ? { ...guide, vp: vps } : guide;
  if (vps && guide.vp !== vps && st.current.guide === guide) st.current.guide = gShown;

  const toolBtn = (t) => (
    <button key={t.k} type="button" className={"skx-tool" + (tool === t.k ? " on" : "")} aria-pressed={tool === t.k}
      title={t.name + (t.key ? ` (${t.key.toUpperCase()})` : "")} onClick={() => selectTool(t.k)}>
      <Icon k={t.k === "xform" ? "transform" : t.k} /><span>{t.name}</span>
    </button>
  );
  const menuBtn = (k, icon, name) => (
    <button type="button" className={"skx-tool" + (panel === k ? " open" : "")} aria-expanded={panel === k} title={name} disabled={modal && k !== "adjust"}
      onClick={() => setPanel((p) => (p === k ? null : k))}>
      <Icon k={icon} /><span>{name}</span>
    </button>
  );
  const vpDown = (e, i) => {
    e.preventDefault(); e.stopPropagation();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) {}
  };
  const vpMove = (e, i) => {
    if (!e.currentTarget.hasPointerCapture || !e.currentTarget.hasPointerCapture(e.pointerId)) return;
    const q = toCanvas(e.clientX, e.clientY);
    setGuide((g) => { const vp = (vps || []).map((p) => p.slice()); vp[i] = [Math.round(q.x), Math.round(q.y)]; return { ...g, vp }; });
  };
  const xfCorners = X ? (() => {
    const m = xfMatrix(X), hw = X.w / 2, hh = X.h / 2;
    const P = (dx, dy) => matApply(m, X.cx + dx * hw, X.cy + dy * hh);
    const c = [P(-1, -1), P(1, -1), P(1, 1), P(-1, 1)];
    const top = P(0, -1), ctr = P(0, 0);
    const L = Math.hypot(top[0] - ctr[0], top[1] - ctr[1]) || 1, off = 30 / view.current.s;
    // 그림이 작으면 변 손잡이가 모서리 손잡이·몸통과 겹쳐 옮기기 어려우므로 숨긴다
    const vs = view.current.s;
    return { c, sides: [P(0, -1), P(1, 0), P(0, 1), P(-1, 0)], rot: [top[0] + ((top[0] - ctr[0]) / L) * off, top[1] + ((top[1] - ctr[1]) / L) * off], top,
      wide: X.w * Math.abs(X.sx) * vs > 64, tall: X.h * Math.abs(X.sy) * vs > 64 };
  })() : null;
  const handle = (p, mode, hx, hy, label, cls = "") => (
    <button key={label} type="button" className={"skx-h " + cls} style={{ left: p[0], top: p[1] }} aria-label={label + " (화살표 키로도 됩니다)"} title={label} data-mode={mode}
      onPointerDown={(e) => xfDown(e, mode, hx, hy)} onPointerMove={xfMove} onPointerUp={xfUp} onPointerCancel={xfUp} onLostPointerCapture={xfUp} />
  );

  return (
    <div className="field span2">
      <label>{f.label}</label>
      <div ref={rootRef} className={"skx" + (full ? " skx-full" : "") + (touchDev ? " skx-touch" : "")} tabIndex={-1} onKeyDown={onKey} onKeyUp={onKeyUp}
        role={full ? "dialog" : undefined} aria-modal={full || undefined} aria-label={full ? "디지털 에스키스" : undefined}
        onClick={(e) => { if (e.detail > 0 && e.target.closest && e.target.closest("button") && !textRef.current && !replay) rootRef.current.focus({ preventScroll: true }); }}>
        <div className="skx-bar">
          <div className="skx-grp">
            {menuBtn("actions", "actions", "동작")}
            {menuBtn("adjust", "adjust", "조정")}
            {toolBtn(TOOL.select)}
            {toolBtn(TOOL.xform)}
            {menuBtn("guide", "grid", "안내선")}
          </div>
          <span className="skx-sep" />
          <div className="skx-grp" role="toolbar" aria-label="그리기 도구">
            <button type="button" className={"skx-tool skx-brushbtn" + (drawTool ? " on" : "") + (panel === "brush" ? " open" : "")} aria-pressed={drawTool}
              title={"브러시: " + BRUSH[lastBrush].name + " (한 번 더 누르면 보관함)"} onClick={() => selectTool(lastBrush)}>
              <Icon k={lastBrush} /><span>{BRUSH[lastBrush].name}</span>
            </button>
            {toolBtn(BRUSH.smudge)}
            {toolBtn(BRUSH.eraser)}
            {EXTRA.filter((t) => t.k !== "select" && t.k !== "xform").map(toolBtn)}
          </div>
          <span className="skx-sep" />
          <div className="skx-grp skx-view-grp">
            <IconBtn k="undo" label="되돌리기 (Ctrl+Z)" onClick={doUndo} disabled={!canUndo} />
            <IconBtn k="redo" label="다시 실행 (Ctrl+Shift+Z)" onClick={doRedo} disabled={!canRedo} />
            <IconBtn k="history" label="기록" onClick={() => setPanel((p) => (p === "history" ? null : "history"))} on={panel === "history"} disabled={modal} />
            <span className="skx-sep" />
            <IconBtn k="zoomOut" label="축소 (-)" onClick={() => zoomBy(0.8)} />
            <button type="button" className="skx-zoom" title="화면에 맞추기 (0)" onClick={fitView}>{zoomPct}%</button>
            <IconBtn k="zoomIn" label="확대 (+)" onClick={() => zoomBy(1.25)} />
            <IconBtn k="flip" label="좌우 반전해서 보기 (X)" onClick={() => turnView({ fx: -view.current.fx })} on={view.current.fx < 0} />
            <span className="skx-sep" />
            <IconBtn k="layers" label="레이어 (L)" onClick={() => setPanel((p) => (p === "layers" ? null : "layers"))} on={panel === "layers"} disabled={modal} />
            <button type="button" className={"skx-colorbtn" + (panel === "color" ? " on" : "")} title="색 (C)" aria-label={"색 " + color} aria-expanded={panel === "color"}
              onClick={() => setPanel((p) => (p === "color" ? null : "color"))}><i style={{ background: color }} /></button>
            <IconBtn k={full ? "unfull" : "full"} label={full ? "작게 보기 (Esc)" : "크게 그리기 (F)"} onClick={() => setFull((x) => !x)} on={full} />
          </div>
        </div>

        <div className="skx-opts">
          {adj && adjDef ? (
            <>
              <span className="skx-tip"><b>{adjDef.name}</b></span>
              {adjDef.params.map(([k, name, min, max, , unit]) => (
                <Range key={k} label={name} min={min} max={max} value={adj.params[k]} onChange={(val) => setAdjParam(k, val)} fmt={(x) => x + unit} />
              ))}
              <button type="button" className="btn small" onClick={() => endAdjust(true)}>적용</button>
              <button type="button" className="btn small ghost" onClick={() => endAdjust(false)}>취소</button>
            </>
          ) : X ? (
            <>
              <button type="button" className={"skx-chip" + (prefs.uniform ? " on" : "")} aria-pressed={prefs.uniform} onClick={() => setPref({ uniform: !prefs.uniform })}>비율 유지</button>
              <span className="skx-opt">
                <IconBtn k="flip" label="좌우 뒤집기" onClick={() => xfPatch((x) => ({ sx: -x.sx }))} />
                <IconBtn k="flipV" label="상하 뒤집기" onClick={() => xfPatch((x) => ({ sy: -x.sy }))} />
                <IconBtn k="rotL" label="왼쪽으로 90° 돌리기" onClick={() => xfPatch((x) => ({ rot: x.rot - Math.PI / 2 }))} />
                <IconBtn k="rotR" label="오른쪽으로 90° 돌리기" onClick={() => xfPatch((x) => ({ rot: x.rot + Math.PI / 2 }))} />
              </span>
              <button type="button" className="skx-chip" onClick={() => xfPatch({ tx: dims.W / 2 - X.cx, ty: dims.H / 2 - X.cy })}>가운데로</button>
              <button type="button" className="skx-chip" onClick={() => xfPatch({ tx: 0, ty: 0, rot: 0, sx: 1, sy: 1 })}>처음대로</button>
              <span className="skx-num">{Math.round(Math.abs(X.sx) * 100)}% · {Math.round((((X.rot * 180) / Math.PI) % 360 + 360) % 360)}°</span>
              <button type="button" className="btn small" onClick={() => { applyXform(); setTool(prevTool.current === "xform" ? lastBrush : prevTool.current); }}>적용</button>
              <button type="button" className="btn small ghost" onClick={cancelXform}>취소</button>
            </>
          ) : (
            <>
              {tool === "shape" && <span className="skx-opt"><b>모양</b><Seg items={SHAPES} value={prefs.shapeKind} onPick={(k) => setPref({ shapeKind: k })} label="도형 모양" /></span>}
              {tool === "select" && (
                <>
                  <span className="skx-opt"><b>방법</b><Seg items={SEL_KINDS} value={prefs.selKind} onPick={(k) => setPref({ selKind: k })} label="선택 방법" /></span>
                  <span className="skx-opt"><Seg items={SEL_OPS} value={prefs.selOp} onPick={(k) => setPref({ selOp: k })} label="선택 더하기·빼기" /></span>
                  {prefs.selKind === "wand" && <Range label="허용 범위" min={0} max={128} value={prefs.wandTol} onChange={(x) => setPref({ wandTol: x })} />}
                  <span className="skx-opt">
                    <button type="button" className="skx-chip" onClick={selectAll}>전체</button>
                    <button type="button" className="skx-chip" onClick={invertSel}>반전</button>
                    <button type="button" className="skx-chip" disabled={!eng.sel} onClick={() => setSel(null)}>해제</button>
                  </span>
                  {eng.sel && (
                    <span className="skx-opt">
                      <button type="button" className="skx-chip" onClick={() => liftSel(false)}>복사해 새 레이어로</button>
                      <button type="button" className="skx-chip" onClick={() => liftSel(true)}>잘라 새 레이어로</button>
                      <button type="button" className="skx-chip" onClick={fillSelArea}>색 채우기</button>
                      <button type="button" className="skx-chip" onClick={clearSelArea}>지우기</button>
                    </span>
                  )}
                </>
              )}
              {hasSize && pr && (
                <span className="skx-opt">
                  <b>{tool === "text" ? "글자 크기" : "굵기"}</b>
                  <input type="range" min="0" max="1000" value={sizeToSlider(T, pr.size)} aria-label={tool === "text" ? "글자 크기" : "굵기"}
                    onChange={(e) => setToolPref(tool, { size: sliderToSize(T, +e.target.value) })} />
                  <span className="skx-num">{pr.size}px</span>
                  {tool !== "text" && <span className="skx-dot" aria-hidden="true"><i style={{ width: clamp(sizeCss, 1, 34), height: clamp(sizeCss, 1, 34), background: tool === "eraser" || tool === "smudge" ? "#fff" : color, opacity: tool === "eraser" || tool === "smudge" ? 1 : pr.op }} /></span>}
                </span>
              )}
              {pr && tool !== "smudge" && (hasSize || tool === "fill") && (
                <Range label="불투명도" min={5} max={100} value={Math.round(pr.op * 100)} onChange={(x) => setToolPref(tool === "fill" ? "fillT" : tool, { op: x / 100 })} fmt={(x) => x + "%"} />
              )}
              {tool === "smudge" && <Range label="번짐 세기" min={5} max={95} value={Math.round(prefs.smudge.strength * 100)} onChange={(x) => setToolPref("smudge", { strength: x / 100 })} fmt={(x) => x + "%"} />}
              {tool === "fill" && (
                <>
                  <Range label="허용 범위" min={0} max={128} value={prefs.fillTol} onChange={(x) => setPref({ fillTol: x })} />
                  <span className="skx-opt"><b>기준</b><Seg items={[["all", "모든 레이어"], ["layer", "이 레이어"]]} value={prefs.fillRef} onPick={(k) => setPref({ fillRef: k })} label="채우기 기준" /></span>
                </>
              )}
              {tool === "text" && <span className="skx-opt"><b>글꼴</b><Seg items={TEXT_FONTS} value={prefs.font} onPick={(k) => setPref({ font: k })} label="글꼴" /></span>}
              {T && T.dash && <span className="skx-opt"><b>선 모양</b><Seg items={DASHES} value={prefs.dash} onPick={(k) => setPref({ dash: k })} label="선 모양" /></span>}
              {tool === "shape" && (prefs.shapeKind === "rect" || prefs.shapeKind === "ellipse") && (
                <button type="button" className={"skx-chip" + (prefs.fill ? " on" : "")} aria-pressed={prefs.fill} onClick={() => setPref({ fill: !prefs.fill })}>안쪽 채우기</button>
              )}
              {brushLike && <button type="button" className={"skx-chip" + (panel === "brush" ? " on" : "")} aria-expanded={panel === "brush"} onClick={() => setPanel((p) => (p === "brush" ? null : "brush"))}>브러시 설정</button>}
              {brushLike && <Range label="손떨림 보정" min={0} max={10} value={prefs.smooth} onChange={(x) => setPref({ smooth: x })} />}
              {touchDev && (brushLike || tool === "shape" || tool === "text" || tool === "fill" || tool === "select") && (
                <button type="button" className={"skx-chip" + (prefs.finger ? " on" : "")} aria-pressed={prefs.finger} onClick={() => setPref({ finger: !prefs.finger, penAuto: true })}
                  title="끄면 손가락은 화면 이동·확대에만 쓰고, 그리기는 펜으로만 합니다">손가락으로 그리기</button>
              )}
              {tool === "picker" && <span className="skx-tip">캔버스를 누르면 그 색을 가져옵니다.</span>}
              {tool === "hand" && <span className="skx-tip">끌어서 화면을 옮깁니다.</span>}
              {tool === "text" && <span className="skx-tip">캔버스를 누른 뒤 글자를 쓰고 Enter를 누릅니다.</span>}
              {tool === "fill" && <span className="skx-tip">선으로 둘러싸인 곳을 누르면 색이 채워집니다.</span>}
            </>
          )}
        </div>

        <div className={"skx-colors" + (tool === "eraser" || tool === "hand" || tool === "smudge" ? " dim" : "")}>
          <span className="skx-hex">{color}</span>
          <span className="skx-pal" role="group" aria-label="기본 팔레트">
            {PALETTE.map(([c, name]) => (
              <button key={c} type="button" className={"skx-sw" + (color === c ? " on" : "")} style={{ background: c }} title={name} aria-label={name}
                aria-pressed={color === c} onClick={() => chooseColor(c)} />
            ))}
          </span>
          {prefs.recent.length > 0 && (
            <span className="skx-pal skx-recent" role="group" aria-label="최근 쓴 색">
              <b>최근</b>
              {prefs.recent.map((c) => (
                <button key={c} type="button" className={"skx-sw" + (color === c ? " on" : "")} style={{ background: c }} title={c} aria-label={"최근 색 " + c}
                  onClick={() => chooseColor(c)} />
              ))}
            </span>
          )}
        </div>

        <div className="skx-main">
          <div ref={viewRef} className={"skx-view tool-" + tool} style={{ aspectRatio: `${dims.W} / ${dims.H}` }}
            onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}
            onLostPointerCapture={onLostCapture} onPointerLeave={hideCursor} onContextMenu={(e) => e.preventDefault()}>
            <div ref={stageRef} className="skx-stage" style={{ width: dims.W, height: dims.H }}>
              <div className="skx-paper" style={{ background: paperColor(eng.paper) }} />
              <div ref={hostRef} className="skx-host" />
              <Guides g={gShown} W={dims.W} H={dims.H} />
              <svg className="skx-guide" viewBox={`0 0 ${dims.W} ${dims.H}`} width={dims.W} height={dims.H} aria-hidden="true">
                <path ref={selPathRef} d="" fill="rgba(0,105,190,.08)" stroke="#0069be" strokeWidth="1.5" strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
                {xfCorners && <polygon points={xfCorners.c.map((p) => p.join(",")).join(" ")} fill="none" stroke="#0069be" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
                {xfCorners && <line x1={xfCorners.top[0]} y1={xfCorners.top[1]} x2={xfCorners.rot[0]} y2={xfCorners.rot[1]} stroke="#0069be" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
              </svg>
              {xfCorners && !locked && (
                <>
                  {xfCorners.c.map((p, i) => handle(p, "scale", [-1, 1, 1, -1][i], [-1, -1, 1, 1][i], ["왼쪽 위", "오른쪽 위", "오른쪽 아래", "왼쪽 아래"][i] + " 모서리: 크기 바꾸기"))}
                  {xfCorners.sides.map((p, i) => ((i % 2 ? xfCorners.wide : xfCorners.tall) || xfDrag.current ? handle(p, "scale", [0, 1, 0, -1][i], [-1, 0, 1, 0][i], ["위", "오른쪽", "아래", "왼쪽"][i] + " 변: 한쪽으로 늘이기", "side") : null))}
                  {handle(xfCorners.rot, "rot", 0, 0, "돌리기", "rot")}
                </>
              )}
              {vps && !modal && !locked && vps.map((p, i) => (
                <button key={i} type="button" className="skx-h vp" style={{ left: p[0], top: p[1] }} aria-label={"소실점 " + (i + 1) + ": 끌거나 화살표 키로 옮기기"} title="소실점: 끌어서 옮기기"
                  onPointerDown={(e) => vpDown(e, i)} onPointerMove={(e) => vpMove(e, i)}
                  onKeyDown={(e) => {
                    const dv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
                    if (!dv) return;
                    e.preventDefault(); e.stopPropagation();
                    const n = e.shiftKey ? 50 : 10;
                    setGuide((g) => { const vp = (vps || []).map((x) => x.slice()); vp[i] = [vp[i][0] + dv[0] * n, vp[i][1] + dv[1] * n]; return { ...g, vp }; });
                  }} />
              ))}
            </div>
            <div ref={cursorRef} className="skx-cursor" />
            {textAt && textPos && (
              <input ref={textInRef} className="skx-textin" autoFocus value={textVal} placeholder="글자 입력" aria-label="캔버스에 쓸 글자"
                style={textStyle(textPos, prefs.text.size * view.current.s, color, prefs.font)}
                onChange={(e) => setTextVal(e.target.value)} onBlur={commitText} onPointerDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) { e.preventDefault(); commitText(); }
                  else if (e.key === "Escape") { e.preventDefault(); textRef.current = null; setTextAt(null); setTextVal(""); }
                }} />
            )}
            {loading && <div className="skx-load">불러오는 중…</div>}
            {loadFail && !loading && (
              <div className="skx-load skx-fail" role="alert">
                <p>저장된 스케치를 불러오지 못했습니다. 연결을 확인해 주세요.</p>
                <button type="button" className="btn small" onClick={retryLoad}>다시 불러오기</button>
              </div>
            )}
            {note && <div className="skx-toast" role="status">{note}</div>}
          </div>

          {panel === "brush" && (
            <div className="skx-pop right">
              <BrushPanel tool={brushLike ? tool : lastBrush} prefs={prefs} color={color}
                onPick={(k) => { if (k !== tool) selectTool(k); }}
                onParam={(k, patch) => setToolPref(k, patch)}
                onReset={(k) => setToolPref(k, { ...BRUSH[k].d })}
                onClose={() => setPanel(null)} />
            </div>
          )}
          {panel === "layers" && (
            <div className="skx-pop right">
              <LayersPanel eng={eng} tick={tick} flash={flash} onChange={touched}
                onSelect={(id) => { eng.activeId = id; eng.mount(); bump(); }} onClose={() => setPanel(null)} />
            </div>
          )}
          {panel === "color" && (
            <div className="skx-pop right">
              <PanelHead title="색" onClose={() => setPanel(null)} />
              <ColorPanel color={color} onChange={chooseColor} recent={prefs.recent} basePalette={PALETTE}
                palettes={prefs.palettes} onPalettes={(next) => setPref({ palettes: next })} />
            </div>
          )}
          {panel === "history" && (
            <div className="skx-pop right">
              <HistoryPanel eng={eng} tick={tick} versions={cur && Array.isArray(cur.versions) ? cur.versions : []} cur={cur} owner={owner}
                MediaThumb={MediaThumb} fmtTime={fmtTime} busy={busy || loading || locked}
                onJump={(n) => { if (!drag.current && !locked && eng.jumpTo(n)) { syncDims(); touched(); } }}
                onRestore={restoreVersion} onSaveVersion={() => save({ version: true })}
                onReplay={() => setReplay(eng.log().slice())} onClose={() => setPanel(null)} />
            </div>
          )}
          {panel === "adjust" && (
            <div className="skx-pop left skx-menu">
              <PanelHead title="조정" onClose={() => setPanel(null)} />
              <p className="skx-mnote">지금 레이어{eng.sel ? "의 선택 영역" : ""}에 적용합니다.</p>
              <ul>{ADJUSTS.map((a) => <li key={a.k}><button type="button" onClick={() => startAdjust(a.k)}>{a.name}</button></li>)}</ul>
            </div>
          )}
          {panel === "guide" && (
            <div className="skx-pop left skx-menu">
              <PanelHead title="안내선" onClose={() => setPanel(null)} />
              <div className="skx-msec">
                <Seg items={GUIDES} value={guide.kind} onPick={(k) => setGuide((g) => ({ ...g, kind: k, vp: k === g.kind ? g.vp : null }))} label="안내선 종류" />
                {(guide.kind === "grid" || guide.kind === "iso") && <Range label="간격" min={30} max={300} step={10} value={guide.step} onChange={(x) => setGuide((g) => ({ ...g, step: x }))} fmt={(x) => x + "px"} />}
                {guide.kind === "sym" && <span className="skx-opt"><b>대칭</b><Seg items={SYMS} value={guide.sym} onPick={(k) => setGuide((g) => ({ ...g, sym: k }))} label="대칭 종류" /></span>}
                {guide.kind === "sym" && guide.sym === "radial" && <Range label="갈래" min={3} max={12} value={guide.n} onChange={(x) => setGuide((g) => ({ ...g, n: x }))} />}
                {guide.kind === "sym" && <p className="skx-mnote">한쪽에 그리면 반대쪽에도 함께 그려집니다.</p>}
                {vps && <p className="skx-mnote">파란 점(소실점)을 끌어 옮깁니다.</p>}
                {ASSIST_KINDS.includes(guide.kind) && (
                  <button type="button" className={"skx-chip" + (guide.assist ? " on" : "")} aria-pressed={guide.assist} onClick={() => setGuide((g) => ({ ...g, assist: !g.assist }))}>안내선에 맞춰 그리기</button>
                )}
              </div>
            </div>
          )}
          {panel === "ref" && refImg && (
            <div className="skx-pop left skx-ref">
              <PanelHead title="참고 그림" onClose={() => setPanel(null)}>
                <button type="button" className="skx-lbtn" onClick={() => refFile.current && refFile.current.click()}>다른 사진</button>
              </PanelHead>
              <img src={refImg.src} alt="참고 그림" draggable={false} onPointerDown={pickRef} />
              <p className="skx-mnote">사진을 누르면 그 색을 가져옵니다. 참고 그림은 저장되지 않습니다.</p>
            </div>
          )}
          {panel === "actions" && (
            <div className="skx-pop left skx-menu">
              <PanelHead title="동작" onClose={() => setPanel(null)} />
              <div className="skx-msec">
                <h4>캔버스</h4>
                <span className="skx-opt"><b>비율</b><Seg items={RATIOS.map((r) => [r.k, r.name])} value={R.W === dims.W && R.H === dims.H ? R.k : ""} onPick={changeRatio} label="캔버스 비율" /></span>
                <span className="skx-opt"><b>종이</b>
                  <span className="skx-pal" role="group" aria-label="종이 색">
                    {PAPERS.map((p) => (
                      <button key={p.k} type="button" className={"skx-sw paper" + (eng.paper === p.k ? " on" : "")} style={{ background: p.c }} title={p.name + " 종이"}
                        aria-label={p.name + " 종이"} aria-pressed={eng.paper === p.k} onClick={() => { if (eng.paper !== p.k) { eng.setPaper(p.k); touched(); } }} />
                    ))}
                  </span>
                </span>
                <span className="skx-opt"><b>캔버스 돌리기</b>
                  <IconBtn k="rotL" label="캔버스를 왼쪽으로 90° 돌리기" onClick={() => turnCanvas("rot90", { dir: -1 })} />
                  <IconBtn k="rotR" label="캔버스를 오른쪽으로 90° 돌리기" onClick={() => turnCanvas("rot90", { dir: 1 })} />
                  <IconBtn k="flip" label="캔버스 좌우 뒤집기" onClick={() => turnCanvas("flipH")} />
                  <IconBtn k="flipV" label="캔버스 상하 뒤집기" onClick={() => turnCanvas("flipV")} />
                </span>
                <span className="skx-opt"><b>화면 돌려 보기</b>
                  <IconBtn k="rotL" label="왼쪽으로 15° 돌려 보기" onClick={() => turnView({ r: (view.current.r - 15) % 360 })} />
                  <IconBtn k="rotR" label="오른쪽으로 15° 돌려 보기" onClick={() => turnView({ r: (view.current.r + 15) % 360 })} />
                  {view.current.r % 360 !== 0 && <button type="button" className="skx-chip" onClick={() => turnView({ r: 0 })}>원래대로</button>}
                </span>
              </div>
              <div className="skx-msec">
                <h4>추가·지우기</h4>
                <button type="button" className="skx-lbtn" onClick={() => fileRef.current && fileRef.current.click()}><Icon k="image" />사진 불러오기</button>
                {typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.read && (
                  <button type="button" className="skx-lbtn" onClick={pasteClip}><Icon k="copy" />클립보드 그림 붙여넣기</button>
                )}
                <button type="button" className="skx-lbtn" onClick={() => (refImg ? setPanel("ref") : refFile.current && refFile.current.click())}><Icon k="eye" />참고 그림 띄우기</button>
                <button type="button" className="skx-lbtn" onClick={clearAll}><Icon k="trash" />모두 지우기</button>
              </div>
              <div className="skx-msec">
                <h4>그림 파일로 내려받기</h4>
                <button type="button" className="skx-lbtn" onClick={() => exportImage("png")}><Icon k="download" />PNG</button>
                <button type="button" className="skx-lbtn" onClick={() => exportImage("png-t")}><Icon k="download" />PNG (투명 배경)</button>
                <button type="button" className="skx-lbtn" onClick={() => exportImage("jpg")}><Icon k="download" />JPG</button>
                {typeof ClipboardItem !== "undefined" && <button type="button" className="skx-lbtn" onClick={copyClip}><Icon k="copy" />클립보드에 복사</button>}
              </div>
              <div className="skx-msec">
                <h4>설정</h4>
                <button type="button" className={"skx-chip" + (prefs.press ? " on" : "")} aria-pressed={prefs.press} onClick={() => setPref({ press: !prefs.press })}>필압</button>
                <button type="button" className={"skx-chip" + (prefs.quick ? " on" : "")} aria-pressed={prefs.quick} onClick={() => setPref({ quick: !prefs.quick })}
                  title="선을 긋고 떼지 않은 채 잠깐 멈추면 직선·원·사각형으로 바뀝니다">멈추면 도형으로 바로잡기</button>
                <button type="button" className={"skx-chip" + (prefs.rotGesture ? " on" : "")} aria-pressed={prefs.rotGesture} onClick={() => setPref({ rotGesture: !prefs.rotGesture })}>두 손가락으로 화면 돌리기</button>
                <button type="button" className={"skx-chip" + (prefs.autosave ? " on" : "")} aria-pressed={prefs.autosave} onClick={() => setPref({ autosave: !prefs.autosave })}>2분마다 자동 저장</button>
                <Range label="필압 세기" min={40} max={250} step={5} value={Math.round(prefs.gamma * 100)} onChange={(x) => setPref({ gamma: x / 100 })}
                  fmt={(x) => (x < 90 ? "가볍게" : x > 115 ? "세게" : "보통")} />
              </div>
              <p className="skx-mnote skx-info">캔버스 {dims.W}×{dims.H}px · 레이어 {eng.layers.length}장 · 작업 {Math.max(0, eng.log().length - 1)}개</p>
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { importPhoto(e.target.files && e.target.files[0]); e.target.value = ""; }} />
        <input ref={refFile} type="file" accept="image/*" hidden onChange={(e) => { openRef(e.target.files && e.target.files[0]); e.target.value = ""; }} />

        <div className="skx-foot">
          <button type="button" className="btn small" disabled={busy || loading || loadFail || !dirty || modal} onClick={() => save()}>{busy ? "저장 중…" : "스케치 저장"}</button>
          {dirty && !busy && (
            <span className="hint" style={{ color: "var(--seal)" }}>
              {locked ? "잠금 전에 저장하지 못한 그림이 있습니다. 잠금이 풀리면 저장해 주세요."
                : hold ? "저장된 스케치를 지웠습니다. 캔버스의 그림은 「스케치 저장」을 눌러야 다시 저장됩니다."
                : autoFail >= 2 ? "자동 저장에 실패했습니다. 연결을 확인하고 「스케치 저장」을 눌러 주세요."
                : "저장하지 않은 변경이 있습니다." + (prefs.autosave ? " 잠시 뒤 자동으로 저장됩니다." : "")}
            </span>
          )}
          {!dirty && savedAt > 0 && <span className="hint">저장했습니다.</span>}
          {remote && dirty && <span className="hint">다른 기기에서 저장된 그림이 있습니다. 지금 그림을 저장하면 그 그림은 저장 버전에 보관됩니다.</span>}
          {cur && (
            <>
              <span className="hint">저장된 스케치 {fmtTime(cur.at)}</span>
              <MediaThumb owner={owner} refId={cur.ref} alt="저장된 스케치" size={48} />
              {dirty && <button type="button" className="mm-del" disabled={busy} onClick={revertToSaved}>저장한 그림으로 되돌리기</button>}
              <button type="button" className="mm-del" disabled={busy} onClick={removeSaved}>저장된 스케치 지우기</button>
            </>
          )}
          {err && <span className="hint" role="alert" style={{ color: "var(--seal)", flex: "1 1 100%" }}>{err}</span>}
          <details className="skx-help">
            <summary>단축키와 손동작</summary>
            <ul>
              <li>두 손가락: 벌리거나 모으면 확대·축소(끝까지 오므리면 화면 맞춤), 끌면 이동, 돌리면 화면 회전, 가볍게 치면 되돌리기. 세 손가락으로 치면 다시 실행</li>
              <li>펜을 쓰면 손가락으로는 그려지지 않습니다(손바닥이 닿아도 선이 생기지 않음). 「손가락으로 그리기」로 바꿀 수 있습니다.</li>
              <li>선을 긋고 떼지 않은 채 잠깐 멈추면 직선·원·사각형으로 바뀝니다. Shift를 누른 채 그리면 직선, Alt를 누른 채 누르면 스포이트</li>
              <li>Ctrl+휠 확대·축소, 스페이스바나 휠 버튼을 누른 채 끌면 이동, 0 화면 맞춤, X 좌우 반전 보기, F 크게 그리기</li>
              <li>1~9 브러시, E 지우개, S 번짐, G 채우기, U 도형, T 글자, M 선택, V 변형, I 스포이트, H 화면 이동, [ ] 굵기, L 레이어, C 색</li>
              <li>Ctrl+Z 되돌리기, Ctrl+Shift+Z 다시 실행, Ctrl+S 저장, Ctrl+A 전체 선택, Ctrl+D 선택 해제, Delete 선택 영역 지우기</li>
              <li>변형: 모서리를 끌면 크기, 위쪽 점을 끌면 회전(Shift는 15°씩), 화살표 키로 1px씩 옮기기, Enter 적용, Esc 취소</li>
            </ul>
          </details>
        </div>
        {replay && <ReplayPlayer ops={replay} title="과정 다시 보기" onClose={() => setReplay(null)} />}
      </div>
    </div>
  );
}

/* ---------- 스타일 ---------- */

export const SKETCH_CSS = `
.skx{position:relative;display:flex;flex-direction:column;background:#fff;border:1px solid var(--line);min-width:0;outline:none}
.skx:focus-visible{outline:2px solid var(--ink);outline-offset:1px}
.skx-bar{display:flex;flex-wrap:wrap;align-items:center;gap:4px;padding:6px;border-bottom:1px solid var(--line2);background:#fafafa}
.skx-grp{display:flex;flex-wrap:wrap;gap:2px;align-items:center}
.skx-view-grp{margin-left:auto}
.skx-sep{align-self:stretch;width:1px;min-height:24px;background:var(--line);margin:4px 3px}
.skx-tool{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-width:48px;height:50px;padding:4px 4px 3px;border:1px solid transparent;background:transparent;color:var(--ink);font-family:var(--sans);font-size:11.5px;line-height:1.1;cursor:pointer;white-space:nowrap}
.skx-tool:hover:not(:disabled){background:#ececec}
.skx-tool.on{background:var(--ink);border-color:var(--ink);color:#fff}
.skx-tool.open{border-color:var(--ink)}
.skx-tool:disabled{opacity:.35;cursor:default}
.skx-brushbtn{min-width:64px;border-color:var(--line)}
.skx-ib{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;padding:0;border:1px solid transparent;background:transparent;color:var(--ink);cursor:pointer}
.skx-ib:hover:not(:disabled){background:#ececec}
.skx-ib.on{border-color:var(--ink);background:#fff}
.skx-ib:disabled{opacity:.3;cursor:default}
.skx-zoom{min-width:52px;height:36px;border:1px solid var(--line);background:#fff;font-family:var(--sans);font-size:12.5px;font-variant-numeric:tabular-nums;cursor:pointer;color:var(--ink)}
.skx-colorbtn{display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;padding:0;border:1px solid #9a9a9a;background:#fff;cursor:pointer}
.skx-colorbtn i{display:block;width:26px;height:26px;border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,.25)}
.skx-colorbtn.on{border-color:var(--ink);box-shadow:inset 0 0 0 1px var(--ink)}
.skx-opts{display:flex;flex-wrap:wrap;align-items:center;gap:8px 18px;padding:8px 10px;border-bottom:1px solid var(--line2);font-size:13px;min-height:50px}
.skx-opt{display:inline-flex;align-items:center;gap:7px;white-space:nowrap;flex-wrap:wrap}
.skx-opt>b{font-weight:500;font-size:12.5px;color:var(--sub)}
.skx input[type=range]{width:120px;height:26px;padding:0;margin:0;border:0;background:transparent;accent-color:var(--ink);cursor:pointer}
.skx-num{min-width:40px;font-size:12.5px;font-variant-numeric:tabular-nums;color:var(--ink)}
.skx-dot{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border:1px solid var(--line2);background:repeating-conic-gradient(#f2f2f2 0 25%,#fff 0 50%) 0 0/10px 10px}
.skx-dot i{display:block;border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,.25)}
.skx-seg{display:inline-flex;flex-wrap:wrap;border:1px solid #9a9a9a}
.skx-seg button{padding:5px 10px;border:0;border-left:1px solid #ddd;background:#fff;font-family:var(--sans);font-size:12.5px;color:var(--ink);cursor:pointer}
.skx-seg button:first-child{border-left:0}
.skx-seg button.on{background:var(--ink);color:#fff}
.skx-chip{padding:5px 11px;border:1px solid #9a9a9a;background:#fff;font-family:var(--sans);font-size:12.5px;color:var(--ink);cursor:pointer}
.skx-chip.on{background:var(--ink);border-color:var(--ink);color:#fff}
.skx-chip:disabled{opacity:.4;cursor:default}
.skx-tip{font-size:12.5px;color:var(--sub)}
.skx-tip b{color:var(--ink);font-weight:700}
.skx-colors{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;padding:8px 10px;border-bottom:1px solid var(--line2)}
.skx-colors.dim .skx-pal{opacity:.45}
.skx-hex{font-size:12px;color:var(--sub);font-variant-numeric:tabular-nums;min-width:58px}
.skx-pal{display:inline-flex;flex-wrap:wrap;gap:4px;align-items:center}
.skx-pal>b{font-weight:500;font-size:12.5px;color:var(--sub);margin-right:2px}
.skx-sw{width:26px;height:26px;padding:0;border:1px solid rgba(0,0,0,.22);cursor:pointer}
.skx-sw.on{outline:2px solid var(--seal);outline-offset:1px}
.skx-sw.paper{width:30px}
.skx-main{position:relative}
.skx-view{position:relative;width:100%;max-height:72vh;max-height:min(72vh,calc(100vh - 250px));min-height:220px;overflow:hidden;background:#e4e3df;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;cursor:crosshair}
.skx-view.tool-hand,.skx-view.space{cursor:grab}
.skx-view.panning{cursor:grabbing}
.skx-view.tool-text{cursor:text}
.skx-view.tool-xform{cursor:move}
.skx-stage{position:absolute;left:0;top:0;transform-origin:0 0;box-shadow:0 0 0 1px rgba(0,0,0,.2),0 3px 16px rgba(0,0,0,.14);--inv:1}
.skx-paper,.skx-host{position:absolute;inset:0}
.skx-host canvas{position:absolute;left:0;top:0;width:100%;height:100%}
.skx-host canvas.skx-selcv{mix-blend-mode:normal;pointer-events:none}
.skx-guide{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;overflow:visible}
.skx-h{position:absolute;width:18px;height:18px;margin:-9px 0 0 -9px;padding:0;border:2px solid #0069be;background:#fff;border-radius:50%;transform:scale(var(--inv));cursor:nwse-resize;touch-action:none}
.skx-h.side{border-radius:2px;width:14px;height:14px;margin:-7px 0 0 -7px;cursor:ew-resize}
.skx-h.rot{background:#0069be;cursor:grab}
.skx-h.vp{background:#0069be;border-color:#fff;box-shadow:0 0 0 2px #0069be;cursor:move}
.skx-touch .skx-h{width:26px;height:26px;margin:-13px 0 0 -13px}
.skx-touch .skx-h.side{width:22px;height:22px;margin:-11px 0 0 -11px}
html[data-ax-targets] .skx .skx-h{min-height:0;width:26px;height:26px;margin:-13px 0 0 -13px}
.skx-cursor{position:absolute;left:0;top:0;display:none;border-radius:50%;border:1px solid rgba(0,0,0,.75);box-shadow:0 0 0 1px rgba(255,255,255,.85);pointer-events:none}
.skx .skx-textin,.skx .skx-textin:focus{position:absolute;z-index:4;width:auto;min-width:140px;padding:0;margin:0;border:0;outline:1px dashed #0069be;outline-offset:2px;background:rgba(255,255,255,.72)}
.skx-load{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.6);font-size:13px;color:var(--sub)}
.skx-fail{flex-direction:column;gap:10px;background:rgba(255,255,255,.9);color:var(--ink);text-align:center;padding:16px;z-index:5}
.skx-fail p{margin:0;font-size:13.5px;line-height:1.6}
.skx-ref img{display:block;width:100%;height:auto;cursor:crosshair;touch-action:none;user-select:none;-webkit-user-select:none}
.skx-info{padding:8px 10px 10px}
.skx-toast{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);max-width:calc(100% - 24px);padding:7px 12px;background:rgba(17,17,17,.88);color:#fff;font-size:12.5px;line-height:1.5;pointer-events:none;z-index:5}
.skx-pop{position:absolute;top:8px;z-index:6;width:300px;max-width:calc(100% - 16px);max-height:calc(100% - 16px);overflow:auto;overscroll-behavior:contain;background:#fff;border:1px solid var(--ink);box-shadow:0 6px 24px rgba(0,0,0,.18);font-size:13px}
.skx-pop.right{right:8px}
.skx-pop.left{left:8px}
.skx-phead{position:sticky;top:0;z-index:1;display:flex;align-items:center;gap:6px;padding:6px 6px 6px 10px;border-bottom:1px solid var(--line2);background:#fff}
.skx-phead b{flex:1;font-weight:700;font-size:13.5px}
.skx-lbtn{display:inline-flex;align-items:center;gap:4px;height:32px;padding:0 10px 0 6px;border:1px solid #9a9a9a;background:#fff;font-family:var(--sans);font-size:12.5px;cursor:pointer;color:var(--ink);white-space:nowrap}
.skx-lbtn svg{width:16px;height:16px}
.skx-lbtn:disabled{opacity:.4;cursor:default}
.skx-menu ul{list-style:none;margin:0;padding:4px 0}
.skx-menu li button{display:block;width:100%;padding:9px 12px;border:0;background:transparent;font-family:var(--sans);font-size:13px;color:var(--ink);text-align:left;cursor:pointer}
.skx-menu li button:hover{background:#efefef}
.skx-msec{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px;border-bottom:1px solid var(--line2)}
.skx-msec:last-child{border-bottom:0}
.skx-msec h4{flex:1 1 100%;margin:0;font-size:12.5px;font-weight:700;color:var(--sub)}
.skx-mnote{flex:1 1 100%;margin:0;padding:8px 10px 0;font-size:12.5px;color:var(--sub);line-height:1.5}
.skx-msec .skx-mnote{padding:0}
.skx-foot{display:flex;flex-wrap:wrap;align-items:center;gap:8px 12px;padding:8px 10px;border-top:1px solid var(--line2)}
.skx-foot .mm-thumb{border:1px solid var(--line)}
.skx-help{flex:1 1 100%;font-size:12.5px;color:var(--sub)}
.skx-help summary{cursor:pointer;width:max-content}
.skx-help ul{margin:6px 0 0;padding-left:18px;line-height:1.7}
.skx select{width:auto}
/* 크게 그리기: 화면 가득 */
.skx.skx-full{position:fixed;inset:0;z-index:5000;height:calc(100vh / var(--ax-zoom,1));height:calc(100dvh / var(--ax-zoom,1));border:0;overflow:auto}
html[data-ax-cap] .skx.skx-full{bottom:var(--ax-cap-h,0px);height:auto}
.skx-full>.skx-bar,.skx-full>.skx-opts,.skx-full>.skx-colors,.skx-full>.skx-foot{flex:0 0 auto}
@media (max-width:640px),(max-height:520px){
  .skx-full .skx-colors{display:none}
  .skx-full .skx-bar,.skx-full .skx-grp,.skx-full .skx-opts{flex-wrap:nowrap}
  .skx-full .skx-bar,.skx-full .skx-opts{overflow-x:auto;overscroll-behavior-x:contain}
  .skx-full .skx-bar>*,.skx-full .skx-grp>*,.skx-full .skx-opts>*{flex:0 0 auto}
  .skx-full .skx-opt{flex-wrap:nowrap}
  .skx-full .skx-chip,.skx-full .skx-tip{white-space:nowrap}
  .skx-full .skx-view-grp{margin-left:0}
}
.skx-full .skx-main{flex:1 1 auto;min-height:260px;display:flex}
.skx-full .skx-view{flex:1;height:auto;max-height:none;aspect-ratio:auto!important}
.skx-full .skx-help{display:none}
@media (max-width:640px){
  .skx-tool{min-width:44px;height:48px;font-size:11px}
  .skx-view-grp{margin-left:0}
  .skx input[type=range]{width:96px}
  .skx-opts{gap:8px 12px}
  .skx-pop{width:calc(100% - 16px)}
  .skx-pop .skb-lib,.skx-pop .skh-ops{max-height:none;overflow:visible}
}
@media (pointer:coarse){.skx-sw{width:32px;height:32px}.skx-ib{width:40px;height:40px}.skx-chip{padding:8px 12px}.skx-seg button{padding:8px 11px}}
.skx .mm-del:disabled{opacity:.4;cursor:default}
/* 학습 지원의 어두운 화면: 페이지 전체가 뒤집히므로 그리는 면과 색 견본은 한 번 더 뒤집어 실제 색으로 보인다
   (캔버스는 학습 지원 쪽 규칙이 이미 되돌리지만 종이는 div라 뒤집힌 채 남아 검은 종이에 검은 선이 된다) */
html[data-ax-contrast="dark"] .skx-stage{filter:invert(1) hue-rotate(180deg)}
html[data-ax-contrast="dark"] .skx-stage canvas{filter:none}
html[data-ax-contrast="dark"] :is(.skx-sw,.skx-colorbtn i,.skx-dot i,.skc-sw,.skc-now,.skc-prev,.skc-sv,.skc-range,.skx-textin,.skx-ref img,.skl-thumb,.skb canvas,.skh-rp canvas){filter:invert(1) hue-rotate(180deg)}
/* 학습지 입력 잠금 */
.ws-lockset:disabled .skx-view{pointer-events:none;cursor:not-allowed}
.ws-lockset:disabled .skx-pop{display:none}
`;

export function SketchStyle() {
  return <style>{SKETCH_CSS + SKETCH_COLOR_CSS + SKETCH_LAYERS_CSS + SKETCH_HISTORY_CSS + SKETCH_BRUSH_CSS + SKETCH_READ_CSS}</style>;
}
