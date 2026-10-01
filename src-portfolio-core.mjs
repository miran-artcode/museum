/* ============================================================
   생성과 다듬기 포트폴리오: 순수 자료 함수 (spec §2, §3, §5.4 src-portfolio-core.mjs, §6.3, §7)
   · DOM 없음, React 없음, 한글 문자열 없음(문구는 src-portfolio-text.mjs의 T·표에서 가져온다).
   · updater 규칙: 날값(raw cur)을 받아 norm*으로 읽고, 바꾼 경로만 고친 사본을 돌려준다(모르는 키는 그대로).
     패치가 잘못되었거나 상한을 넘으면 입력을 그대로 돌려준다. setField에 넘길 때는 totalUpd로 감싼다.
     v > 1(새 버전이 쓴 값)이면 아무것도 고치지 않고 입력을 그대로 돌려준다(§2.10).
   · 결정 기록: .tmpbuild/folio/contract-log.md 「WP1 core (A-core)」.
   ============================================================ */
import {
  KEYS, ROUNDS, LINES, IH, CP, TI_ROUND, TI_REFLECT, TI_NOTES, ROUND_CAP, REFLECT_CAP, NOTE_CAP, PROMPT_POOL, BUDGET, LIMITS,
  STAGES, STAGE_NOTE, STAGE_FEAT, ITEMS, KP, METHOD, HM, EL, ROUTE, ROUTE_ITEM, HM_ROUTE, KINDS, TCODE, OPS, WPP, EV, SEND,
  CLASS_DEFAULTS, pOk, feat as featDefault, graceMs as graceDefault,
} from "./src-folio-schema.mjs";
import {
  T, fmt, josa, LINE_LABEL, LINE_MARK, CAUSE_LABEL, PW_LABEL, NL_LABEL, RM_LABEL, HM_LABEL, CELL_LABEL, METHOD_LABEL, ROUND_LABEL,
  ITEM_LABEL, ITEM_NOUN, STAGE_TEXT, OP_TEXT, MARK_TEXT, WPP_LABEL, KIND_LABEL, LEVEL_LABEL, PHRASE, GAP_WORDS, UNIT, CORE_TEXT,
} from "./src-portfolio-text.mjs";

/* ---------- 작은 도우미 ---------- */
const isPlain = (o) => !!o && typeof o === "object" && !Array.isArray(o) && Object.getPrototypeOf(o) === Object.prototype;
const filled = (v) => typeof v === "string" && v.trim().length > 0;    // src-app.jsx filled()와 같다
const str = (x) => (typeof x === "string" ? x : "");
const isNum = (x) => typeof x === "number" && Number.isFinite(x);
/** finite number rounded and clamped to [min, max], else def (counters, sizes, times) */
const num = (x, min, max, def = 0) => (isNum(x) ? Math.min(max, Math.max(min, Math.round(x))) : def);
/** integer code in [min, max], else def (codes are never clamped: an unknown code means "not answered") */
const code = (x, max, def = 0, min = 0) => (Number.isInteger(x) && x >= min && x <= max ? x : def);
const u32 = (x) => (Number.isInteger(x) && x >= 0 && x <= 0xffffffff ? x : 0);
/** bytes of a string as stored (JSON escapes counted, without the two quotes) */
const jb = (s) => utf8Len(JSON.stringify(String(s))) - 2;
const oneLine = (s) => String(s).replace(/\r\n|\r|\n/g, " ");
const nowInt = (x) => Math.max(0, Math.floor(Number(x) || 0));
const isRef = (x) => isPlain(x) && typeof x.ref === "string" && x.ref !== "";
const EPOCH_MAX = 1e14;   // generous upper bound for epoch s and ms
const PROMPT_KEYS = [...LINES, "po"];
const MARK0 = 0x2460;     // ① (U+2460) … ⑳ (U+2473): line markers; ①–⑥ are the six prompt lines
const isMarker = (c) => c >= MARK0 && c <= MARK0 + 19;
const popcount = (n) => { let c = 0; let x = n >>> 0; while (x) { c += x & 1; x >>>= 1; } return c; };
const ro = (cur) => migrate(cur).readOnly;

/* ---------- normalise, shape, bytes ---------- */

const ROUND_TEXT = ["aim", "exp", "tool", ...LINES, "po", "seen", "un", "jd", "nx", "nw", "sk"];
const SINGLE_LINE = new Set(["tool", "un", "nw", "sk"]);   // <input> fields of the round panel (§3.3)
function emptyRound() {
  return {
    st: 0, at: 0, from: 0, hp: 0, ti: TI_ROUND.map(() => 0), ih: 0, cp: 0,
    aim: "", exp: "", el: 0, tool: "", pa: "", pb: "", pc: "", pd: "", pe: "", pf: "", po: "",
    im: [], ci: -1, ck: [0, 0, 0, 0], seen: "", uk: 0, un: "", pw: 0, jd: "", cz: 0, nr: 0, nl: 0, nw: "", hm: 0, nx: "", sk: "",
  };
}
function emptyReflect() {
  return { near: 0, far: 0, look: "", dPr: "", dAi: "", dHand: "", big: "", use: "", drift: "", stuck: "", base: -1, baseWhy: "", hp: 0, ti: TI_REFLECT.map(() => 0) };
}
function normImg(x) {
  return { ref: x.ref, w: num(x.w, 0, 1e6), h: num(x.h, 0, 1e6), sg: str(x.sg), th: isRef(x.th) ? { ref: x.th.ref } : null };
}
function normRound(x) {
  const o = isPlain(x) ? x : {};
  const r = emptyRound();
  ROUND_TEXT.forEach((k) => { r[k] = str(o[k]); });
  r.st = num(o.st, 0, EPOCH_MAX); r.at = num(o.at, 0, EPOCH_MAX); r.from = num(o.from, 0, 999); r.hp = num(o.hp, 0, LIMITS.hp);
  const ti = Array.isArray(o.ti) ? o.ti : [];
  r.ti = TI_ROUND.map((_, i) => num(ti[i], 0, LIMITS.tiMax));
  r.ih = Number.isInteger(o.ih) && o.ih > 0 ? o.ih & 511 : 0;
  r.cp = Number.isInteger(o.cp) && o.cp > 0 ? o.cp & 2047 : 0;
  r.el = code(o.el, 2); r.uk = code(o.uk, 3); r.pw = code(o.pw, 4); r.cz = code(o.cz, 8); r.nr = code(o.nr, 4); r.nl = code(o.nl, 7); r.hm = code(o.hm, 4);
  r.im = (Array.isArray(o.im) ? o.im : []).filter(isRef).slice(0, LIMITS.imgPerRound).map(normImg);
  r.ci = code(o.ci, r.im.length - 1, -1, -1);
  const ck = Array.isArray(o.ck) ? o.ck : [];
  r.ck = [0, 1, 2, 3].map((i) => code(ck[i], 2));
  return r;
}
function normReflect(x) {
  const o = isPlain(x) ? x : {};
  const v = emptyReflect();
  Object.keys(REFLECT_CAP).forEach((k) => { v[k] = str(o[k]); });
  v.near = code(o.near, 3); v.far = code(o.far, 3); v.base = code(o.base, 2, -1, -1); v.hp = num(o.hp, 0, LIMITS.hp);
  const ti = Array.isArray(o.ti) ? o.ti : [];
  v.ti = TI_REFLECT.map((_, i) => num(ti[i], 0, EPOCH_MAX));
  return v;
}
/** → Steps (never throws; display and decisions only) */
export function normSteps(v) {
  const o = isPlain(v) ? v : {};
  const old = (Array.isArray(o.old) ? o.old : []).filter((x) => isPlain(x) && isRef(x.th)).map((x) => ({ th: { ref: x.th.ref }, r: code(x.r, 2) }));
  return { v: 1, ra: normRound(o.ra), rb: normRound(o.rb), rc: normRound(o.rc), rv: normReflect(o.rv), old };
}
function emptyNotes() {
  const n = { v: 1 };
  Object.keys(NOTE_CAP).forEach((k) => { n[k] = ""; });
  n.rm = 0; n.pd = { phScope: 0, phMaking: 0 }; n.ti = {};
  return n;
}
/** → Notes */
export function normNotes(v) {
  const o = isPlain(v) ? v : {};
  const n = emptyNotes();
  Object.keys(NOTE_CAP).forEach((k) => { n[k] = str(o[k]); });
  n.rm = code(o.rm, 3);
  const pd = isPlain(o.pd) ? o.pd : {};
  n.pd = { phScope: u32(pd.phScope), phMaking: u32(pd.phMaking) };
  const ti = isPlain(o.ti) ? o.ti : {};
  TI_NOTES.forEach((k) => { if (isNum(ti[k]) && ti[k] > 0) n.ti[k] = Math.floor(ti[k]); });
  return n;
}

/* ---- edit ---- */
const rect = (x) => (isPlain(x) && isNum(x.w) && isNum(x.h) && x.w > 0 && x.h > 0
  ? { x: num(x.x, -1e5, 1e5), y: num(x.y, -1e5, 1e5), w: num(x.w, 1, 1e5), h: num(x.h, 1, 1e5) } : null);
const rgb = (x, def) => (Array.isArray(x) && x.length === 3 && x.every((c) => Number.isInteger(c) && c >= 0 && c <= 255) ? x.slice() : def);
/** a layer record of a known kind with its defaults restored; a record of an unknown kind is returned verbatim (opaque) */
function normLayer(x) {
  if (!(Number.isInteger(x.k) && x.k >= 0 && x.k < KINDS.length)) return x;
  const kind = KINDS[x.k], tc = TCODE[kind];
  const t = tc ? code(x.t, tc.length - 1) : 0;
  const o = {
    ...x, id: num(x.id, 0, 1e9), k: x.k, t, nm: typeof x.nm === "string" ? x.nm : null, vis: x.vis === 0 ? 0 : 1,
    op: isNum(x.op) ? num(x.op, 0, 100) : 100, bl: code(x.bl, 16), lk: x.lk === 1 ? 1 : 0, it: code(x.it, ITEMS.length), ce: code(x.ce, 4),
    cov: num(x.cov, 0, 1000), g: num(x.g, 0, 999), mx: num(x.mx, 0, 1000), po: num(x.po, 0, LIMITS.pins),
  };
  o.p = x.p != null && pOk(x.k, tc ? t : undefined, x.p) ? x.p : null;
  return o;
}
function normStageRec(x) {
  const o = { ...x, t0: num(x.t0, 0, EPOCH_MAX), e: num(x.e, 0, LIMITS.tiMax), d: num(x.d, 0, LIMITS.tiMax), n: num(x.n, 0, LIMITS.stageN) };
  if (x.ch === 1) o.ch = 1; else delete o.ch;
  if (x.sk === 1) o.sk = 1; else delete o.sk;
  return o;
}
/** → Edit | null (unknown layer kinds kept as opaque records; unknown top-level keys kept) */
export function normEdit(v) {
  if (!isPlain(v)) return null;
  const m = isPlain(v.m) ? v.m : {};
  const b = m.base, out = m.out, cmp = m.cmp;
  const base = isRef(b) ? { ref: b.ref, w: num(b.w, 0, 1e6), h: num(b.h, 0, 1e6), r: code(b.r, 2), sg: str(b.sg), src: str(b.src) } : null;
  const d = isPlain(v.doc) ? v.doc : {};
  const w = num(d.w, 0, 1e6, base ? base.w : 0), h = num(d.h, 0, 1e6, base ? base.h : 0);
  const ext = isPlain(d.ext) ? d.ext : {};
  const cal = isPlain(d.cal) && isNum(d.cal.cm) && d.cal.cm > 0
    ? { a: num(d.cal.a, -1e5, 1e5), b: num(d.cal.b, -1e5, 1e5), c: num(d.cal.c, -1e5, 1e5), d: num(d.cal.d, -1e5, 1e5), cm: num(d.cal.cm, 1, 5000), ob: d.cal.ob === 1 ? 1 : 0 } : null;
  const dout = isPlain(d.out) ? d.out : {};
  const L = (Array.isArray(v.L) ? v.L : []).filter(isPlain).map(normLayer);
  const route = isPlain(v.route) ? v.route : {};
  const arr8 = (a, max) => ITEMS.map((_, i) => code(Array.isArray(a) ? a[i] : 0, max));
  const sr = {};
  const srIn = isPlain(v.sr) ? v.sr : {};
  STAGES.forEach((k) => { if (isPlain(srIn[k])) sr[k] = normStageRec(srIn[k]); });
  const sent = isPlain(v.sent) ? v.sent : {};
  const pr = isPlain(v.pr) ? v.pr : {};
  const done = isPlain(v.done) ? { at: num(v.done.at, 0, EPOCH_MAX), n: num(v.done.n, 0, LIMITS.doneN), un: num(v.done.un, 0, LIMITS.doneN) } : null;
  const maxId = L.reduce((a, x) => (Number.isInteger(x.id) && x.id > a ? x.id : a), 0);
  return {
    ...v,
    v: isNum(v.v) && v.v >= 1 ? v.v : 1, rev: num(v.rev, 0, 1e9), crev: num(v.crev, 0, 1e9), dev: num(v.dev, 0, 2147483647), sv: num(v.sv, 0, 2147483647),
    at: num(v.at, 0, EPOCH_MAX), st: code(v.st, STAGES.length - 1), nid: Math.max(num(v.nid, 1, 1e9, 1), maxId + 1), act: num(v.act, 0, 1e9),
    m: {
      base,
      out: isRef(out) ? { ref: out.ref, w: num(out.w, 0, 1e6), h: num(out.h, 0, 1e6), q: num(out.q, 0, 100), cr: num(out.cr, 0, 1e9), th: isRef(out.th) ? { ref: out.th.ref } : null } : null,
      cmp: isRef(cmp) ? { ref: cmp.ref, w: num(cmp.w, 0, 1e6), h: num(cmp.h, 0, 1e6) } : null,
    },
    doc: {
      w, h, crop: rect(d.crop), r: num(d.r, -150, 150), rot: [0, 90, 180, 270].includes(d.rot) ? d.rot : 0,
      ext: { t: num(ext.t, 0, 150), r: num(ext.r, 0, 150), b: num(ext.b, 0, 150), l: num(ext.l, 0, 150) },
      fill: rgb(d.fill, [255, 255, 255]), out: { w: num(dout.w, 0, 1e6, w), h: num(dout.h, 0, 1e6, h) }, cal,
    },
    L,
    route: { s: arr8(route.s, 2), m: arr8(route.m, METHOD_LABEL.length - 1), o: arr8(route.o, 2) },
    pins: (Array.isArray(v.pins) ? v.pins : []).filter(isPlain).map((p) => ({ x: num(p.x, 0, 1000), y: num(p.y, 0, 1000), k: code(p.k, 3, 1, 1), it: code(p.it, ITEMS.length), ce: code(p.ce, 4) })),
    lines: (Array.isArray(v.lines) ? v.lines : []).filter(isPlain).map((p) => ({ a: num(p.a, 0, 1000), b: num(p.b, 0, 1000), c: num(p.c, 0, 1000), d: num(p.d, 0, 1000) })),
    sr,
    snaps: (Array.isArray(v.snaps) ? v.snaps : []).filter(isRef).map((x) => ({ s: code(x.s, STAGES.length - 1), ref: x.ref, w: num(x.w, 0, 1e6), h: num(x.h, 0, 1e6) })),
    log: (Array.isArray(v.log) ? v.log : []).filter((x) => isPlain(x) && typeof x.o === "string").map((x) => {
      const e = { t: num(x.t, 0, EPOCH_MAX), s: code(x.s, STAGES.length - 1), o: x.o, n: num(x.n, 0, LIMITS.logN), a: num(x.a, 0, 1000), l: code(x.l, 5), w: code(x.w, 9, WPP.na), y: num(x.y, 0, 1e9) };
      if (typeof x.p === "string") e.p = x.p;
      return e;
    }),
    ev: (Array.isArray(v.ev) ? v.ev : []).filter(isPlain).map((x) => ({ t: num(x.t, 0, EPOCH_MAX), o: code(x.o, 3, 0, 1) })).filter((x) => x.o > 0),
    done,
    sent: { s6a: num(sent.s6a, 0, EPOCH_MAX), s6b: num(sent.s6b, 0, EPOCH_MAX), s7x: num(sent.s7x, 0, EPOCH_MAX) },
    pr: { mode: pr.mode === 2 ? 2 : 1, paper: [0, 4, 5].includes(pr.paper) ? pr.paper : 0, bw: pr.bw === 1 ? 1 : 0, ppi: num(pr.ppi, 1, 9999, CLASS_DEFAULTS.ppi) },
  };
}
/** → Trash */
export function normTrash(v) {
  const o = isPlain(v) ? v : {};
  const b = (Array.isArray(o.b) ? o.b : []).filter(isPlain).map((x) => {
    const y = { t: num(x.t, 0, EPOCH_MAX), q: (Array.isArray(x.q) ? x.q : []).filter(isRef).map((e) => ({ ref: e.ref })) };
    if (x.x === 1) y.x = 1;
    return y;
  });
  return { v: 1, b };
}
/** [real] → { v, readOnly:boolean }: missing v counts as 1; v > 1 is read-only (written by a newer release) */
export function migrate(v) { return { v, readOnly: !!(isPlain(v) && typeof v.v === "number" && v.v > 1) }; }

export class FolioShapeError extends Error {
  constructor(path, reason) { super((path || "(root)") + ": " + reason); this.name = "FolioShapeError"; this.path = path || ""; }
}
/** [real] deep plain-JSON copy; drops undefined keys; NaN/±Infinity → 0; throws FolioShapeError on nested arrays, typed arrays, Blob,
 *  Map, Set, Date, class instances, functions, symbols, bigint, "" or "__x__" keys */
export function clean(x) {
  const walk = (v, path, inArr) => {
    if (v === null) return null;
    const t = typeof v;
    if (t === "string" || t === "boolean") return v;
    if (t === "number") return Number.isFinite(v) ? v : 0;
    if (t === "undefined") return undefined;
    if (t !== "object") throw new FolioShapeError(path, "not JSON (" + t + ")");
    if (Array.isArray(v)) {
      if (inArr) throw new FolioShapeError(path, "array inside an array");
      const out = [];
      for (let i = 0; i < v.length; i++) {
        const y = walk(v[i], path + "[" + i + "]", true);
        out.push(y === undefined ? null : y);
      }
      return out;
    }
    if (!isPlain(v)) throw new FolioShapeError(path, "not a plain object (" + ((v.constructor && v.constructor.name) || "?") + ")");
    const out = {};
    for (const k of Object.keys(v)) {
      if (k === "" || /^__.*__$/.test(k)) throw new FolioShapeError(path, "bad key " + JSON.stringify(k));
      const y = walk(v[k], path ? path + "." + k : k, false);
      if (y !== undefined) out[k] = y;
    }
    return out;
  };
  return walk(x, "", false);
}
/** [real] → "" or "path: reason" (the same rules as clean, without copying; undefined anywhere is an error here) */
export function assertSafe(x) {
  const walk = (v, path, inArr) => {
    if (v === null) return "";
    const t = typeof v;
    if (t === "string" || t === "boolean") return "";
    if (t === "number") return Number.isFinite(v) ? "" : path + ": not finite";
    if (t === "undefined") return (path || "(root)") + ": undefined";
    if (t !== "object") return (path || "(root)") + ": not JSON (" + t + ")";
    if (Array.isArray(v)) {
      if (inArr) return (path || "(root)") + ": array inside an array";
      for (let i = 0; i < v.length; i++) { const e = walk(v[i], path + "[" + i + "]", true); if (e) return e; }
      return "";
    }
    if (!isPlain(v)) return (path || "(root)") + ": not a plain object";
    for (const k of Object.keys(v)) {
      if (k === "" || /^__.*__$/.test(k)) return (path || "(root)") + ": bad key " + JSON.stringify(k);
      const e = walk(v[k], path ? path + "." + k : k, false);
      if (e) return e;
    }
    return "";
  };
  return walk(x, "", false);
}
/** [real] → (cur) => { try { n = f(cur); return assertSafe(n) === "" ? n : cur } catch { return cur } } */
export function totalUpd(f) {
  return (cur) => {
    try { const n = f(cur); return assertSafe(n) === "" ? n : cur; } catch (e) { return cur; }
  };
}
/** [real] UTF-8 byte length of a string */
export function utf8Len(s) {
  let n = 0;
  for (const ch of String(s)) { const c = ch.codePointAt(0); n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; }
  return n;
}
/** [real] utf8Len(JSON.stringify(x)); undefined counts 0 */
export function jsonBytes(x) { const s = JSON.stringify(x); return s === undefined ? 0 : utf8Len(s); }
/** [real] 32-bit FNV-1a of the UTF-16 code units, as an unsigned integer */
export function fnv32(s) {
  let h = 0x811c9dc5;
  const str2 = String(s);
  for (let i = 0; i < str2.length; i++) { h ^= str2.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
/** [real] longest prefix with utf8Len(JSON.stringify(prefix)) − 2 ≤ maxB (no split surrogates) */
export function clipJson(s, maxB) {
  const str2 = String(s == null ? "" : s);
  if (utf8Len(JSON.stringify(str2)) - 2 <= maxB) return str2;
  let out = "", n = 0;
  for (const ch of str2) {
    const b = utf8Len(JSON.stringify(ch)) - 2;
    if (n + b > maxB) break;
    out += ch; n += b;
  }
  return out;
}
/** [real] → { steps, notes, edit, trash, total } after applying patch {key: value} */
export function folioBytes(ws, patch = {}) {
  const d = { ...(ws || {}), ...(patch || {}) };
  const steps = jsonBytes(d[KEYS.steps]), notes = jsonBytes(d[KEYS.notes]), edit = jsonBytes(d[KEYS.edit]), trash = jsonBytes(d[KEYS.trash]);
  return { steps, notes, edit, trash, total: steps + notes + edit + trash };
}
/** [real] → "" | key | "total"; next is the raw value of key; trash never fails it (§2.6) */
export function capsCheck(ws, key, next) {
  const b = folioBytes(ws, { [key]: next });
  if (key === KEYS.steps && b.steps > BUDGET.steps) return key;
  if (key === KEYS.notes && b.notes > BUDGET.notes) return key;
  if (key === KEYS.edit && b.edit > BUDGET.edit) return key;
  if (b.steps + b.notes + b.edit > BUDGET.total - BUDGET.trash) return "total";
  return "";
}
/** → { edit, ok:boolean }: drops log[].p (oldest first), then the oldest log entries, until jsonBytes(edit) ≤ capB.
 *  Never drops layers, stage records, events or snapshots. Returns the same object when it already fits. */
export function compactEdit(edit, capB) {
  if (!isPlain(edit) || !Array.isArray(edit.log) || jsonBytes(edit) <= capB) return { edit, ok: jsonBytes(edit) <= capB };
  const log = edit.log.slice();
  let e = { ...edit, log };
  let size = jsonBytes(e);
  for (let i = 0; i < log.length && size > capB; i++) {
    const x = log[i];
    if (isPlain(x) && "p" in x) { const { p, ...rest } = x; void p; log[i] = rest; size = jsonBytes(e); }
  }
  while (size > capB && log.length) { log.shift(); size = jsonBytes(e); }
  e = { ...e, log };
  return { edit: e, ok: size <= capB };
}

/* ---------- rounds and reflection (updaters on the raw value; nowS = epoch s) ---------- */
const isSkipped = (s, r) => r !== "ra" && filled(s[r].sk);
const hasChosen = (n) => n.ci >= 0 && n.ci < n.im.length;
const prevIdx = (s, idx) => { let j = idx - 1; while (j > 0 && isSkipped(s, ROUNDS[j])) j--; return j; };
const INH_KEYS = ["aim", "tool", ...LINES, "po"];
/** effective round idx of normalised steps s (inheritance of §2.2/§3.5) */
function effOf(s, idx) {
  const own = s[ROUNDS[idx]];
  const inh = {};
  INH_KEYS.forEach((k) => { inh[k] = false; });
  const e = { ...own, inh };
  if (idx <= 0) return e;
  const prev = effOf(s, prevIdx(s, idx));
  INH_KEYS.forEach((k) => {
    if (own.ih & IH[k]) return;
    e[k] = k === "aim" ? prev.nx : prev[k];
    inh[k] = true;
  });
  return e;
}
/** → effective Round with inheritance + { inh:{aim,tool,pa…po:boolean} } (§2.2): for rounds 2–3 every field whose ih bit is 0 takes
 *  the previous non-skipped round's effective value (aim takes that round's nx). Round 1 never inherits. */
export function effRound(steps, r) {
  const idx = ROUNDS.indexOf(r);
  if (idx < 0) { const inh = {}; INH_KEYS.forEach((k) => { inh[k] = false; }); return { ...emptyRound(), inh }; }
  return effOf(normSteps(steps), idx);
}
const stepsBase = (cur) => (isPlain(cur) ? cur : { v: 1 });
const roundRaw = (base, r) => (isPlain(base[r]) ? base[r] : emptyRound());
/** first-input time of a round slot: written once, as clamp(nowS − st, 1, 999999), when the round has started */
function tiOnce(n, slot, hasValue, nowS) {
  const i = TI_ROUND.indexOf(slot);
  if (i < 0 || !hasValue || n.ti[i] > 0 || !n.st) return null;
  const ti = n.ti.slice();
  ti[i] = Math.min(LIMITS.tiMax, Math.max(1, nowInt(nowS) - n.st));
  return ti;
}
/** bytes of the stored prompt lines of a normalised round, except the listed keys */
const poolUsed = (n, except = []) => PROMPT_KEYS.reduce((a, k) => a + (except.includes(k) ? 0 : jb(n[k])), 0);

/** pure part of seedFor/importRound/pastePrompt: parts[7] (pa…pf, po) clipped in order within free bytes */
function fitParts(parts, free) {
  let left = Math.max(0, free), clipped = false;
  const out = parts.map((x) => {
    const s = str(x);
    if (!s) return "";
    const b = jb(s);
    if (b <= left) { left -= b; return s; }
    clipped = true;
    const c = clipJson(s, left);
    left -= jb(c);
    return c;
  });
  return { parts: out, clipped };
}
/** → { tool, lines:string[6], po, clipped } for round 1 (selNo round first, §3.5). Cells of round 1 that are already filled get "" */
export function seedFor(steps, ws) {
  const d = ws || {};
  const rounds = Array.isArray(d["s5b.rounds"]) ? d["s5b.rounds"] : [];
  const sel = selIndex(d["s5d.selNo"], rounds);
  const toolOf = (r) => (isPlain(r) && filled(r.tool) ? r.tool.trim() : "");
  const promptOf = (r) => (isPlain(r) && filled(r.prompt) ? r.prompt : "");
  const last = (f) => { for (let i = rounds.length - 1; i >= 0; i--) { const x = f(rounds[i]); if (x) return x; } return ""; };
  const tool = (filled(d["s5a.tool"]) ? d["s5a.tool"].trim() : "") || (sel >= 0 ? toolOf(rounds[sel]) : "") || last(toolOf);
  const prompt = (sel >= 0 ? promptOf(rounds[sel]) : "") || last(promptOf);
  const n = normSteps(steps).ra;
  const pl = promptLines(prompt);
  const raw = [...pl.lines, pl.rest].map((x, i) => (filled(n[PROMPT_KEYS[i]]) ? "" : x));
  const fit = fitParts(raw, PROMPT_POOL - poolUsed(n));
  const t1 = filled(n.tool) ? "" : oneLine(tool);
  const tc = clipJson(t1, ROUND_CAP.tool);
  return { tool: tc, lines: fit.parts.slice(0, 6), po: fit.parts[6], clipped: fit.clipped || tc !== t1 };
}
/** → Steps (round 1 fills empty cells from the seed and sets their cp bits; rounds 2–3 set st only). No-op once st > 0 */
export function startRound(cur, r, seed, nowS) {
  if (!ROUNDS.includes(r) || ro(cur)) return cur;
  const base = stepsBase(cur), raw = roundRaw(base, r), n = normRound(raw);
  if (n.st > 0) return cur;
  const now = nowInt(nowS);
  const o = { ...raw, st: now, at: now };
  if (r === "ra" && isPlain(seed)) {
    let cp = n.cp;
    const vals = [...(Array.isArray(seed.lines) ? seed.lines : []).slice(0, 6), seed.po].map((x) => oneLine(str(x)));
    while (vals.length < 7) vals.splice(vals.length - 1, 0, "");
    const want = vals.map((x, i) => (!filled(n[PROMPT_KEYS[i]]) && filled(x) ? x : ""));
    const fit = fitParts(want, PROMPT_POOL - poolUsed(n));
    fit.parts.forEach((x, i) => { if (x) { o[PROMPT_KEYS[i]] = x; cp |= CP[PROMPT_KEYS[i]]; } });
    const tool = clipJson(oneLine(str(seed.tool)), ROUND_CAP.tool);
    if (!filled(n.tool) && filled(tool)) { o.tool = tool; cp |= CP.tool; }
    o.cp = cp;
  }
  return { ...base, [r]: o };
}
/** clips, sets ti once (offset), ih bit (rounds 2–3), cp bit cleared, el rule, at. field: aim exp tool seen un jd nx nw sk
 *  (pa…pf and po are passed to setPromptLine). exp is refused while el === 2 (written before the first image). */
export function setRoundText(cur, r, field, text, nowS) {
  if (PROMPT_KEYS.includes(field)) return setPromptLine(cur, r, PROMPT_KEYS.indexOf(field), text, nowS).value;
  if (field === "sk") return setSkip(cur, r, text, nowS);
  if (!ROUNDS.includes(r) || !(field in ROUND_CAP) || ro(cur)) return cur;
  if (field === "nw" && r === "rc") return cur;
  const base = stepsBase(cur), raw = roundRaw(base, r), n = normRound(raw);
  let t = typeof text === "string" ? text : "";
  if (SINGLE_LINE.has(field)) t = oneLine(t);
  const val = clipJson(t, ROUND_CAP[field]);
  const o = { ...raw, [field]: val, at: nowInt(nowS) };
  if (field === "exp") {
    if (n.el === EL.locked) return cur;
    if (n.el === EL.none && filled(val) && n.im.length > 0) o.el = EL.after;
  }
  const ti = tiOnce(n, field, filled(val), nowS);
  if (ti) o.ti = ti;
  if (r !== "ra" && IH[field]) o.ih = n.ih | IH[field];
  if (CP[field] && (n.cp & CP[field])) o.cp = n.cp & ~CP[field];
  return { ...base, [r]: o };
}
/** → { value, clipped:boolean } within PROMPT_POOL; i 0..5 = pa…pf, 6 = po. A line break becomes a space. In rounds 2–3 every
 *  call sets the line's ih bit (an emptied inherited line means "removed in this round"). */
export function setPromptLine(cur, r, i, text, nowS) {
  if (!ROUNDS.includes(r) || !Number.isInteger(i) || i < 0 || i > 6 || ro(cur)) return { value: cur, clipped: false };
  const k = PROMPT_KEYS[i];
  const base = stepsBase(cur), raw = roundRaw(base, r), n = normRound(raw);
  const t = oneLine(typeof text === "string" ? text : "");
  const val = clipJson(t, Math.max(0, PROMPT_POOL - poolUsed(n, [k])));
  const o = { ...raw, [k]: val, at: nowInt(nowS) };
  const ti = tiOnce(n, k, filled(val), nowS);
  if (ti) o.ti = ti;
  if (r !== "ra") o.ih = n.ih | IH[k];
  if (n.cp & CP[k]) o.cp = n.cp & ~CP[k];
  return { value: { ...base, [r]: o }, clipped: val !== t };
}
/** → { value, clipped, spread:boolean } (§3.3). text = the line's text after the paste (for an empty line: the pasted text).
 *  A paste into an effectively empty line whose text has two or more lines or ①–⑥ markers is spread by promptLines() over the
 *  round's empty lines (fill-only-empty); parts whose line is not empty, and lines 7 and later, go to 그 밖에 when it is empty.
 *  Anything that does not fit (pool, or 그 밖에 already used) sets clipped. Otherwise this is setPromptLine. */
export function pastePrompt(cur, r, i, text, nowS) {
  if (!ROUNDS.includes(r) || !Number.isInteger(i) || i < 0 || i > 6 || ro(cur)) return { value: cur, clipped: false, spread: false };
  const t = typeof text === "string" ? text.replace(/\r\n|\r/g, "\n") : "";
  const s = normSteps(cur), idx = ROUNDS.indexOf(r), e = effOf(s, idx);
  const multi = t.split("\n").filter((x) => x.trim()).length >= 2;
  const marks = [...t].some((ch) => { const c = ch.codePointAt(0); return c >= MARK0 && c <= MARK0 + 5; });
  if (filled(e[PROMPT_KEYS[i]]) || !(multi || marks)) return { ...setPromptLine(cur, r, i, t, nowS), spread: false };
  const pl = promptLines(t);
  const want = [...pl.lines, ""];
  const extra = [];
  LINES.forEach((k, j) => { if (want[j] && filled(e[k])) { extra.push(want[j]); want[j] = ""; } });
  if (pl.rest) extra.push(pl.rest);
  let dropped = false;
  if (extra.length) { if (filled(e.po)) dropped = true; else want[6] = extra.join(" / "); }
  const targets = PROMPT_KEYS.filter((k, j) => want[j]);
  if (!targets.length) return { value: cur, clipped: dropped, spread: false };
  const base = stepsBase(cur), raw = roundRaw(base, r), n = s[r];
  const fit = fitParts(want, PROMPT_POOL - poolUsed(n, targets));
  const o = { ...raw, at: nowInt(nowS) };
  let ih = n.ih, cp = n.cp, ti = n.ti;
  fit.parts.forEach((x, j) => {
    if (!want[j]) return;
    const k = PROMPT_KEYS[j];
    o[k] = x;
    if (r !== "ra") ih |= IH[k];
    cp &= ~CP[k];
    const t2 = tiOnce({ ...n, ti }, k, filled(x), nowS);
    if (t2) ti = t2;
  });
  if (r !== "ra") o.ih = ih;
  if (cp !== n.cp) o.cp = cp;
  if (ti !== n.ti) o.ti = ti;
  return { value: { ...base, [r]: o }, clipped: fit.clipped || dropped, spread: true };
}
const ROUND_CODES = { uk: [3, "un"], pw: [4, "pw"], cz: [8, "cz"], nr: [4, "nr"], nl: [7, "nx"], hm: [4, "nx"] };
/** codes: uk pw cz nr nl hm, and ck via field "ck0".."ck3". pw only in rounds 2–3, nl only in rounds 1–2, hm only in round 3.
 *  0 clears (the Seg's none). The first non-zero value sets the slot's first-input time (nl/hm share 「nx」, uk shares 「un」). */
export function setRoundCode(cur, r, field, val, nowS) {
  if (!ROUNDS.includes(r) || ro(cur)) return cur;
  const ckm = /^ck([0-3])$/.exec(String(field));
  const spec = ckm ? [2, "ck"] : ROUND_CODES[field];
  if (!spec || !Number.isInteger(val) || val < 0 || val > spec[0]) return cur;
  if ((field === "pw" && r === "ra") || (field === "nl" && r === "rc") || (field === "hm" && r !== "rc")) return cur;
  const base = stepsBase(cur), raw = roundRaw(base, r), n = normRound(raw);
  const o = { ...raw, at: nowInt(nowS) };
  if (ckm) { const ck = n.ck.slice(); ck[+ckm[1]] = val; o.ck = ck; } else o[field] = val;
  const ti = tiOnce(n, spec[1], val > 0, nowS);
  if (ti) o.ti = ti;
  return { ...base, [r]: o };
}
const validImgs = (raw) => (Array.isArray(raw.im) ? raw.im.filter(isRef) : []);
/** → { value, ok:boolean } (ok false when the round has 4 images or img is not a StepImg). The first image becomes the chosen
 *  one (ci 0) and locks exp (el 2) when exp is filled at that moment. Adding a ref that is already there is a no-op with ok true. */
export function addImage(cur, r, img, nowS) {
  if (!ROUNDS.includes(r) || !isRef(img) || ro(cur)) return { value: cur, ok: false };
  const base = stepsBase(cur), raw = roundRaw(base, r), n = normRound(raw);
  const im0 = validImgs(raw);
  if (im0.some((x) => x.ref === img.ref)) return { value: cur, ok: true };
  if (im0.length >= LIMITS.imgPerRound) return { value: cur, ok: false };
  const o = { ...raw, im: [...im0, normImg(img)], at: nowInt(nowS) };
  if (!im0.length) {
    o.ci = 0;
    if (n.el === EL.none && filled(n.exp)) o.el = EL.locked;
  }
  const ti = tiOnce(n, "im", true, nowS);
  if (ti) o.ti = ti;
  return { value: { ...base, [r]: o }, ok: true };
}
/** index of an image: i is an index or the image's ref (a ref is idempotent inside setField updaters) */
const imgIndex = (im, i) => (typeof i === "string" ? im.findIndex((x) => x.ref === i) : Number.isInteger(i) && i >= 0 && i < im.length ? i : -1);
/** appends a thumbnail to steps.old (≤ LIMITS.old); → { old, dropped:string[] } (the oldest beyond the limit) */
function pushOld(rawOld, th, ri) {
  const list = (Array.isArray(rawOld) ? rawOld : []).filter((x) => isPlain(x) && isRef(x.th));
  list.push({ th, r: ri });
  const dropped = [];
  while (list.length > LIMITS.old) dropped.push(list.shift().th.ref);
  return { old: list, dropped };
}
const NO_IMG_CHANGE = (cur) => ({ value: cur, oldMain: null, oldThumb: null, trashThumbs: [] });
/** → { value, oldMain:string|null, oldThumb:{ref}|null, trashThumbs:string[] }. i: index or ref of the image to replace (keeps ci).
 *  The old thumbnail moves to steps.old; thumbnails beyond 4 come back in trashThumbs; the caller trashes oldMain and trashThumbs. */
export function replaceImage(cur, r, i, img, nowS) {
  if (!ROUNDS.includes(r) || !isRef(img) || ro(cur)) return NO_IMG_CHANGE(cur);
  const base = stepsBase(cur), raw = roundRaw(base, r);
  const im = validImgs(raw);
  const idx = imgIndex(im, i);
  if (idx < 0 || im[idx].ref === img.ref || im.some((x) => x.ref === img.ref)) return NO_IMG_CHANGE(cur);
  const old = im[idx];
  const next = im.slice();
  next[idx] = normImg(img);
  const oldThumb = isRef(old.th) ? { ref: old.th.ref } : null;
  const out = { ...base, [r]: { ...raw, im: next, at: nowInt(nowS) } };
  let trashThumbs = [];
  if (oldThumb) { const p = pushOld(base.old, oldThumb, ROUNDS.indexOf(r)); out.old = p.old; trashThumbs = p.dropped; }
  return { value: out, oldMain: old.ref, oldThumb, trashThumbs };
}
/** → same shape as replaceImage. i: index or ref. Fixes ci (the chosen image deleted: the only remaining image becomes chosen,
 *  otherwise none is chosen). */
export function removeImage(cur, r, i, nowS) {
  if (!ROUNDS.includes(r) || ro(cur)) return NO_IMG_CHANGE(cur);
  const base = stepsBase(cur), raw = roundRaw(base, r), n = normRound(raw);
  const im = validImgs(raw);
  const idx = imgIndex(im, i);
  if (idx < 0) return NO_IMG_CHANGE(cur);
  const old = im[idx];
  const next = im.filter((_, j) => j !== idx);
  const ci = n.ci === idx ? (next.length === 1 ? 0 : -1) : n.ci > idx ? n.ci - 1 : n.ci;
  const oldThumb = isRef(old.th) ? { ref: old.th.ref } : null;
  const out = { ...base, [r]: { ...raw, im: next, ci, at: nowInt(nowS) } };
  let trashThumbs = [];
  if (oldThumb) { const p = pushOld(base.old, oldThumb, ROUNDS.indexOf(r)); out.old = p.old; trashThumbs = p.dropped; }
  return { value: out, oldMain: old.ref, oldThumb, trashThumbs };
}
/** → Steps; sets th only where it is still null (thumbnail repair) */
export function setThumb(cur, r, ref, th) {
  if (!ROUNDS.includes(r) || typeof ref !== "string" || !isRef(th) || ro(cur)) return cur;
  const base = stepsBase(cur), raw = roundRaw(base, r);
  const im = Array.isArray(raw.im) ? raw.im : [];
  const idx = im.findIndex((x) => isPlain(x) && x.ref === ref);
  if (idx < 0 || isRef(im[idx].th)) return cur;
  const next = im.slice();
  next[idx] = { ...im[idx], th: { ref: th.ref } };
  return { ...base, [r]: { ...raw, im: next } };
}
/** → Steps; i: index, ref, or −1 (none) */
export function chooseImage(cur, r, i, nowS) {
  if (!ROUNDS.includes(r) || ro(cur)) return cur;
  const base = stepsBase(cur), raw = roundRaw(base, r), n = normRound(raw);
  const idx = i === -1 ? -1 : imgIndex(validImgs(raw), i);
  if (idx < 0 && i !== -1) return cur;
  if (idx === n.ci && raw.ci === idx) return cur;
  return { ...base, [r]: { ...raw, ci: idx, at: nowInt(nowS) } };
}
/** rb, rc only: 생성하지 않은 이유 (one line, ROUND_CAP.sk); non-empty = the round was not generated */
export function setSkip(cur, r, text, nowS) {
  if ((r !== "rb" && r !== "rc") || ro(cur)) return cur;
  const base = stepsBase(cur), raw = roundRaw(base, r), n = normRound(raw);
  const val = clipJson(oneLine(typeof text === "string" ? text : ""), ROUND_CAP.sk);
  const o = { ...raw, sk: val, at: nowInt(nowS) };
  const ti = tiOnce(n, "sk", filled(val), nowS);
  if (ti) o.ti = ti;
  return { ...base, [r]: o };
}
/** text (REFLECT_CAP fields) or code (near, far 0..3; base −1..2). First-input times of the reflection are epoch s; far shares
 *  the 「near」 slot. */
export function setReflect(cur, field, val, nowS) {
  if (ro(cur)) return cur;
  const base = stepsBase(cur), raw = isPlain(base.rv) ? base.rv : emptyReflect(), n = normReflect(raw);
  const o = { ...raw };
  let slot = "", has = false;
  if (field in REFLECT_CAP) {
    let t = typeof val === "string" ? val : "";
    if (field === "baseWhy") t = oneLine(t);
    o[field] = clipJson(t, REFLECT_CAP[field]);
    slot = field; has = filled(o[field]);
  } else if (field === "near" || field === "far") {
    if (!Number.isInteger(val) || val < 0 || val > 3) return cur;
    o[field] = val; slot = "near"; has = val > 0;
  } else if (field === "base") {
    if (!Number.isInteger(val) || val < -1 || val > 2) return cur;
    o.base = val;
  } else return cur;
  const i = TI_REFLECT.indexOf(slot);
  if (i >= 0 && has && !n.ti[i]) { const ti = n.ti.slice(); ti[i] = Math.max(1, nowInt(nowS)); o.ti = ti; }
  return { ...base, rv: o };
}
/** hp + 1, capped at 999; scope "ra"|"rb"|"rc"|"rv" */
export function bumpHelp(cur, scope) {
  if ((!ROUNDS.includes(scope) && scope !== "rv") || ro(cur)) return cur;
  const base = stepsBase(cur);
  const raw = isPlain(base[scope]) ? base[scope] : scope === "rv" ? emptyReflect() : emptyRound();
  const hp = num(raw.hp, 0, LIMITS.hp);
  return { ...base, [scope]: { ...raw, hp: Math.min(LIMITS.hp, hp + 1) } };
}
const LINE_NAMES = () => [...LINE_LABEL.map((l) => l.replace(/^\S+\s+/, "")), T.lbPo];
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** strip a leading line name with a colon (「무엇인가:」 … 「금지 조건:」, 「그 밖에:」), collapse spaces */
function cleanPart(s) {
  let x = String(s).replace(/\s+/g, " ").trim();
  for (const nm of LINE_NAMES()) {
    const m = new RegExp("^" + escRe(nm) + "\\s*[:\uff1a]\\s*").exec(x);
    if (m) { x = x.slice(m[0].length); break; }
  }
  return x.trim();
}
/** → { lines:string[6], rest:string, clipped:boolean } (§3.5): by ①…⑥ markers when present (text before the first marker and
 *  ⑦ and later go to rest), otherwise by newlines, or by 「 / 」 when that gives one line; a leading marker and a line name with a
 *  colon are stripped; lines 7 and later join into rest with 「 / 」. With a finite pool the parts are clipped together, in order
 *  ① → ⑥ → rest, to pool bytes. */
export function promptLines(text, pool) {
  const t = String(text == null ? "" : text).replace(/\r\n|\r/g, "\n");
  const lines = ["", "", "", "", "", ""], rest = [];
  const chars = [...t];
  if (chars.some((ch) => isMarker(ch.codePointAt(0)))) {
    let mark = -1, buf = "";
    const flush = () => {
      const x = cleanPart(buf);
      if (x) { if (mark >= 0 && mark < 6) lines[mark] = lines[mark] ? lines[mark] + " / " + x : x; else rest.push(x); }
      buf = "";
    };
    for (const ch of chars) {
      const c = ch.codePointAt(0);
      if (isMarker(c)) { flush(); mark = c - MARK0; } else buf += ch;
    }
    flush();
  } else {
    let parts = t.split("\n").map((x) => x.trim()).filter(Boolean);
    if (parts.length === 1) parts = parts[0].split(" / ");
    parts.map(cleanPart).filter(Boolean).forEach((x, i) => { if (i < 6) lines[i] = x; else rest.push(x); });
  }
  const all = [...lines, rest.join(" / ")];
  if (!(isNum(pool) && pool >= 0)) return { lines, rest: all[6], clipped: false };
  const fit = fitParts(all, pool);
  return { lines: fit.parts.slice(0, 6), rest: fit.parts[6], clipped: fit.clipped };
}
const normSpace = (x) => String(x).replace(/\s+/g, " ").trim();
function changedS(s, r) {
  const idx = ROUNDS.indexOf(r);
  if (idx <= 0 || isSkipped(s, r)) return [];
  const a = effOf(s, prevIdx(s, idx)), b = effOf(s, idx);
  return LINES.map((k, i) => (normSpace(a[k]) !== normSpace(b[k]) ? i : -1)).filter((i) => i >= 0);
}
/** → number[] (0..5): prompt lines ①–⑥ whose normalised effective text differs from the previous non-skipped round's */
export function changedLines(steps, r) { return changedS(normSteps(steps), r); }
function doneS(s, r) {
  const idx = ROUNDS.indexOf(r);
  if (idx < 0) return false;
  if (idx > 0 && s[r].sk.trim().length >= 2) return true;
  if (isSkipped(s, r)) return false;
  const e = effOf(s, idx);
  if (!(hasChosen(e) && filled(e.aim) && filled(e.tool) && PROMPT_KEYS.some((k) => filled(e[k])))) return false;
  if (!(filled(e.seen) && filled(e.jd) && e.cz > 0 && filled(e.nx))) return false;
  if (r === "rc" ? !(e.hm > 0) : !(e.nl > 0 && (e.nl !== 7 || filled(e.nw)))) return false;
  return r === "ra" || (filled(e.exp) && e.pw > 0);
}
/** §3.10: rb/rc with a 생성하지 않은 이유 of ≥ 2 characters are done; otherwise every required cell on effective values */
export function roundDone(steps, r) { return doneS(normSteps(steps), r); }
/** → "empty"|"part"|"done"|"skip" ("skip": a done 생성하지 않음 round) */
export function roundState(steps, r) {
  const s = normSteps(steps);
  if (!ROUNDS.includes(r)) return "empty";
  const n = s[r];
  if (doneS(s, r)) return isSkipped(s, r) ? "skip" : "done";
  const any = n.st > 0 || n.im.length > 0 || ROUND_TEXT.some((k) => filled(n[k])) || n.ck.some((x) => x > 0)
    || [n.uk, n.pw, n.cz, n.nr, n.nl, n.hm].some((x) => x > 0);
  return any ? "part" : "empty";
}
function baseS(s) {
  const ok = (i) => { const r = ROUNDS[i]; return !isSkipped(s, r) && hasChosen(s[r]); };
  let def = -1;
  for (let i = ROUNDS.length - 1; i >= 0; i--) if (ok(i)) { def = i; break; }
  const b = s.rv.base;
  const pick = b >= 0 && ok(b) ? b : def;
  if (pick < 0) return null;
  const n = s[ROUNDS[pick]];
  return { r: pick, i: n.ci, img: n.im[n.ci], isDefault: pick === def };
}
/** → { r:0|1|2, i, img:StepImg, isDefault } | null: rv.base when that round is not skipped and has a chosen image, else the last
 *  such round (rc → rb → ra). Never hard-coded to round 3. */
export function baseChoice(steps) { return baseS(normSteps(steps)); }
/** near, far, look, dPr, dAi, dHand, big, use filled, and baseWhy when the chosen base round differs from the default */
export function reflectDone(steps) {
  const s = normSteps(steps), v = s.rv;
  if (!(v.near > 0 && v.far > 0)) return false;
  if (!["look", "dPr", "dAi", "dHand", "big", "use"].every((k) => filled(v[k]))) return false;
  const b = baseS(s);
  return v.base === -1 || !b || b.isDefault || filled(v.baseWhy);
}
function bigrams(s) {
  const c = [...String(s).replace(/\s+/g, "")], m = new Map();
  for (let i = 0; i + 1 < c.length; i++) { const k = c[i] + c[i + 1]; m.set(k, (m.get(k) || 0) + 1); }
  return m;
}
/** Dice coefficient of character bigrams (0..1) */
function dice(a, b) {
  const A = bigrams(a), B = bigrams(b);
  let na = 0, nb = 0, both = 0;
  A.forEach((v) => { na += v; }); B.forEach((v) => { nb += v; });
  A.forEach((v, k) => { both += Math.min(v, B.get(k) || 0); });
  return na + nb ? (2 * both) / (na + nb) : 0;
}
/** → per round { expFirst:boolean|null, changed, carried, causeLine, help, firstTimes, copied } (§7.6, shown, never scored).
 *  carried: rounds 2–3 whose aim is inherited from, or shares ≥ 30 % of character bigrams (Dice) with, the previous round's nx. */
export function indicators(steps) {
  const s = normSteps(steps), out = {};
  ROUNDS.forEach((r, idx) => {
    const n = s[r];
    let carried = false;
    if (idx > 0 && !isSkipped(s, r)) {
      const e = effOf(s, idx), pnx = s[ROUNDS[prevIdx(s, idx)]].nx;
      carried = filled(e.aim) && filled(pnx) && (e.inh.aim || dice(e.aim, pnx) >= 0.3);
    }
    out[r] = {
      expFirst: n.el === EL.locked ? true : n.el === EL.after ? false : null, changed: changedS(s, r).length, carried,
      causeLine: n.cz >= 1 && n.cz <= 6, help: n.hp, firstTimes: n.ti.slice(), copied: popcount(n.cp),
    };
  });
  return out;
}

/* ---------- notes ---------- */
const PH_KEYS = ["phScope", "phMaking"];
/** clips to NOTE_CAP, sets ti once (epoch s); k "rm" takes a code 0..3 */
export function setNote(cur, k, text, nowS) {
  if (ro(cur)) return cur;
  const base = stepsBase(cur);
  if (k === "rm") return Number.isInteger(text) && text >= 0 && text <= 3 ? { ...base, rm: text } : cur;
  if (!(k in NOTE_CAP)) return cur;
  const val = clipJson(typeof text === "string" ? text : "", NOTE_CAP[k]);
  const o = { ...base, [k]: val };
  const ti = isPlain(base.ti) ? base.ti : {};
  if (TI_NOTES.includes(k) && filled(val) && !(isNum(ti[k]) && ti[k] > 0)) o.ti = { ...ti, [k]: Math.max(1, nowInt(nowS)) };
  return o;
}
const pdOf = (base) => (isPlain(base.pd) ? base.pd : { phScope: 0, phMaking: 0 });
/** pd[k] = fnv32(draft); text untouched; k "phScope"|"phMaking"; an empty draft is refused */
export function acceptDraft(cur, k, draft) {
  if (!PH_KEYS.includes(k) || !filled(draft) || ro(cur)) return cur;
  const base = stepsBase(cur);
  return { ...base, pd: { ...pdOf(base), [k]: fnv32(draft) } };
}
/** notes[k] = draft (clipped to NOTE_CAP) when empty, pd[k] = fnv32 of the copied text (of the draft when nothing was copied);
 *  ti not set */
export function copyDraft(cur, k, draft) {
  if (!PH_KEYS.includes(k) || !filled(draft) || ro(cur)) return cur;
  const base = stepsBase(cur), n = normNotes(base);
  const o = { ...base };
  let h = fnv32(draft);
  if (!filled(n[k])) { const t = clipJson(draft, NOTE_CAP[k]); o[k] = t; h = fnv32(t); }
  o.pd = { ...pdOf(base), [k]: h };
  return o;
}
/** → { text, source:"own"|"draft"|"none", stale:boolean } (§7.4): own text when filled; else the current draft when pd[k] ≠ 0;
 *  stale when pd[k] differs from the current draft's hash (for a draft, or for an unedited copy of an older draft) */
export function effPhrase(notes, k, draft) {
  const n = normNotes(notes), own = str(n[k]), pd = PH_KEYS.includes(k) ? n.pd[k] : 0, d = str(draft);
  const stale = !!pd && filled(d) && pd !== fnv32(d);
  if (filled(own)) return { text: own, source: "own", stale: stale && fnv32(own) === pd };
  if (pd) return { text: d, source: "draft", stale };
  return { text: "", source: "none", stale: false };
}

/* ---------- import ---------- */
/** 0-based index of the s5d.selNo round (first digit run: 「4」, 「4회차」), or −1 */
function selIndex(selNo, rounds) {
  const m = /\d+/.exec(String(selNo == null ? "" : selNo));
  const i = m ? parseInt(m[0], 10) - 1 : -1;
  return i >= 0 && i < rounds.length && isPlain(rounds[i]) ? i : -1;
}
const s5Content = (r) => isPlain(r) && ((typeof r.img === "string" && r.img !== "") || filled(r.tool) || filled(r.prompt) || filled(r.judge) || filled(r.change));
const s5Img = (r) => isPlain(r) && typeof r.img === "string" && r.img !== "";
/** → [i0, i1, i2], 0-based s5b indices or −1 (§3.6): row 3 = the selNo round, else the last round with an image; row 1 = round 1
 *  unless it is row 3's; row 2 = the last round with content after row 1's and before row 3's */
export function defaultImportMap(rounds, selNo) {
  const rs = Array.isArray(rounds) ? rounds : [];
  let c = selIndex(selNo, rs);
  if (c >= 0 && !s5Content(rs[c])) c = -1;
  if (c < 0) for (let i = rs.length - 1; i >= 0; i--) if (s5Img(rs[i])) { c = i; break; }
  const a = s5Content(rs[0]) && c !== 0 ? 0 : -1;
  let b = -1;
  const hi = c >= 0 ? c : rs.length;
  for (let i = hi - 1; i > a; i--) if (s5Content(rs[i])) { b = i; break; }
  return [a, b, c];
}
/** the effective cells importRound would fill in round r from s5b round `round` (own stored values only) */
function importCells(n, round, r) {
  const fill = { tool: false, prompt: false, jd: false, aim: false, lines: [], clipped: false };
  if (!isPlain(round)) return fill;
  fill.tool = !filled(n.tool) && filled(round.tool);
  if (filled(round.prompt)) {
    const pl = promptLines(round.prompt);
    const want = [...pl.lines, pl.rest].map((x, i) => (!filled(n[PROMPT_KEYS[i]]) && filled(x) ? x : ""));
    const fit = fitParts(want, PROMPT_POOL - poolUsed(n));
    fill.lines = fit.parts; fill.clipped = fit.clipped;
    fill.prompt = fit.parts.some(Boolean);
  }
  fill.jd = !filled(n.jd) && filled(round.judge);
  fill.aim = !filled(n.aim) && filled(round.change);
  void r;
  return fill;
}
/** → { rows:[{ r, round, fill:string[], img:boolean, clipped:boolean }], any:boolean } (§3.6). fill lists the cell names (T.impCell*)
 *  that will be filled, image included; round is the 1-based s5b round; clipped: the prompt does not fit the pool whole. */
export function importPlan(steps, rounds, map, { images = true } = {}) {
  const s = normSteps(steps), rs = Array.isArray(rounds) ? rounds : [], mp = Array.isArray(map) ? map : [];
  const rows = [];
  let prevRow = null;
  ROUNDS.forEach((r, j) => {
    const i = mp[j];
    if (!(Number.isInteger(i) && i >= 0 && isPlain(rs[i]))) return;
    const src = rs[i], n = s[r], c = importCells(n, src, r);
    const fill = [];
    if (c.tool) fill.push(T.impCellTool);
    if (c.prompt) fill.push(T.impCellPrompt);
    if (c.jd) fill.push(T.impCellJudge);
    if (c.aim) fill.push(T.impCellAim);
    if (prevRow && filled(src.change) && !filled(s[prevRow.r].nx) && !prevRow.fill.includes(T.impCellNext)) prevRow.fill.push(T.impCellNext);
    const img = images !== false && s5Img(src) && n.im.length === 0;
    const row = { r, round: i + 1, fill, img, clipped: c.clipped };
    rows.push(row);
    prevRow = row;
  });
  rows.forEach((row) => { if (row.img) row.fill.push(T.impCellImage); });
  return { rows, any: rows.some((x) => x.fill.length > 0 || x.img) };
}
/** text only, fill-only-empty (own stored values), cp bits (and ih bits in rounds 2–3), from = roundNo, st = now when 0.
 *  opts.prevR: the round of the previous imported row, whose empty nx takes this round's change (§3.6). First-input times are
 *  not set. Images are added separately with addImage. */
export function importRound(cur, r, round, roundNo, nowS, { prevR } = {}) {
  if (!ROUNDS.includes(r) || !isPlain(round) || ro(cur)) return cur;
  const base = stepsBase(cur), raw = roundRaw(base, r), n = normRound(raw);
  const c = importCells(n, round, r);
  const now = nowInt(nowS);
  const o = { ...raw, from: num(roundNo, 0, 999), at: now };
  if (!n.st) o.st = now;
  let cp = n.cp, ih = n.ih;
  const put = (k, v) => { o[k] = v; cp |= CP[k]; if (r !== "ra" && IH[k]) ih |= IH[k]; };
  if (c.tool) put("tool", clipJson(oneLine(round.tool.trim()), ROUND_CAP.tool));
  c.lines.forEach((x, i) => { if (x) put(PROMPT_KEYS[i], x); });
  if (c.jd) put("jd", clipJson(round.judge, ROUND_CAP.jd));
  if (c.aim) put("aim", clipJson(round.change, ROUND_CAP.aim));
  o.cp = cp;
  if (r !== "ra") o.ih = ih;
  const out = { ...base, [r]: o };
  if (prevR && prevR !== r && ROUNDS.includes(prevR) && filled(round.change)) {
    const pr = roundRaw(base, prevR), pn = normRound(pr);
    if (!filled(pn.nx)) out[prevR] = { ...pr, nx: clipJson(round.change, ROUND_CAP.nx), cp: pn.cp | CP.nx, at: now };
  }
  return out;
}

/* ---------- progress and export ---------- */
/** §3.10 (steps only; total 4 in every release). edit, notes, trash are opt:true: fieldProgress returns {0,0} before the switch */
export function folioProgress(f, v) {
  if (f && f.part === "steps") {
    const s = normSteps(v);
    return { total: 4, done: ROUNDS.filter((r) => doneS(s, r)).length + (reflectDone(s) ? 1 : 0) };
  }
  return { total: 0, done: 0 };
}
const withCopied = (text, copied) => (copied && filled(text) ? text + " " + UNIT.copied : text);
const paren = (s) => "(" + s + ")";
function stepsUnits(v) {
  const s = normSteps(v), out = [];
  const push = (sub, text) => { if (filled(text)) out.push({ sub, text: String(text).trim() }); };
  ROUNDS.forEach((r, idx) => {
    const n = s[r], e = effOf(s, idx), no = idx + 1, cp = n.cp;
    const own = (k) => idx === 0 || !e.inh[k];
    if (own("aim")) push(fmt(UNIT.aim, { n: no }), withCopied(e.aim, cp & CP.aim));
    push(fmt(UNIT.exp, { n: no }), filled(n.exp) && n.el === EL.after ? n.exp.trim() + " " + UNIT.expAfter : n.exp);
    if (own("tool")) push(fmt(UNIT.tool, { n: no }), withCopied(e.tool, cp & CP.tool));
    if (PROMPT_KEYS.some(own)) {
      const parts = LINES.map((k, j) => (filled(e[k]) ? LINE_MARK[j] + " " + e[k].trim() : "")).filter(Boolean);
      if (filled(e.po)) parts.push(T.lbPo + ": " + e.po.trim());
      push(fmt(UNIT.prompt, { n: no }), withCopied(parts.join(" / "), PROMPT_KEYS.some((k) => cp & CP[k])));
    }
    push(fmt(UNIT.seen, { n: no }), n.seen);
    const un = n.un.trim();
    push(fmt(UNIT.uk, { n: no }), n.uk === 1 ? [UNIT.ukNothing, un].filter(Boolean).join(" ") : n.uk === 2 ? fmt(UNIT.ukKeep, { t: un }) : n.uk === 3 ? fmt(UNIT.ukDrop, { t: un }) : un);
    if (idx > 0 && n.pw > 0) push(fmt(UNIT.pw, { n: no }), PW_LABEL[n.pw]);
    const cause = n.cz > 0 ? fmt(UNIT.cause, { c: CAUSE_LABEL[n.cz] }) : "";
    push(fmt(UNIT.jd, { n: no }), withCopied(filled(n.jd) ? n.jd.trim() + (cause ? " " + paren(cause) : "") : cause, cp & CP.jd));
    if (idx < 2) {
      const lab = n.nl === 7 ? fmt(UNIT.nw, { t: n.nw.trim() }) : n.nl > 0 ? fmt(UNIT.nl, { c: NL_LABEL[n.nl] }) : "";
      push(fmt(UNIT.nx, { n: no }), withCopied(filled(n.nx) ? n.nx.trim() + (lab ? " " + paren(lab) : "") : lab, cp & CP.nx));
    } else {
      const lab = n.hm > 0 ? HM_LABEL[n.hm] : "";
      push(UNIT.hm, withCopied(filled(n.nx) ? n.nx.trim() + (lab ? " " + paren(lab) : "") : lab, cp & CP.nx));
    }
    if (idx > 0) push(fmt(UNIT.sk, { n: no }), n.sk);
  });
  const v2 = s.rv;
  if (v2.near || v2.far || filled(v2.look)) {
    const lab = (x) => (x > 0 ? ROUND_LABEL[x - 1] : T.missing);
    push(UNIT.rvNearFar, filled(v2.look) ? fmt(UNIT.rvNearFarText, { near: lab(v2.near), far: lab(v2.far), look: v2.look.trim() }) : lab(v2.near) + " / " + lab(v2.far));
  }
  push(UNIT.rvDPr, v2.dPr); push(UNIT.rvDAi, v2.dAi); push(UNIT.rvDHand, v2.dHand); push(UNIT.rvBig, v2.big);
  push(UNIT.rvUse, v2.use); push(UNIT.rvDrift, v2.drift); push(UNIT.rvStuck, v2.stuck); push(UNIT.rvBaseWhy, v2.baseWhy);
  return out;
}
function notesUnits(v) {
  const n = normNotes(v), out = [];
  const push = (sub, text) => { if (filled(text)) out.push({ sub, text: String(text).trim() }); };
  STAGES.forEach((k) => push(UNIT[STAGE_NOTE[k]], n[STAGE_NOTE[k]]));
  ITEMS.forEach((it) => push(fmt(UNIT.kp, { item: ITEM_LABEL[it] }), n[KP[it]]));
  push(UNIT.aiTool, n.aiTool); push(UNIT.aiRegion, n.aiRegion); push(UNIT.aiPrompt, n.aiPrompt);
  if (n.rm > 0 || filled(n.rf)) push(UNIT.rmRf, n.rm > 0 && filled(n.rf) ? RM_LABEL[n.rm] + ": " + n.rf.trim() : n.rm > 0 ? RM_LABEL[n.rm] : n.rf);
  push(UNIT.calWhat, n.calWhat);
  PH_KEYS.forEach((k) => {
    const own = n[k], pd = n.pd[k];
    if (filled(own)) push(UNIT[k], pd && fnv32(own) === pd ? UNIT.draftCopied : own);
    else if (pd) push(UNIT[k], UNIT.draftAsIs);
  });
  return out;
}
function editUnits(v) {
  const e = normEdit(v), out = [];
  if (!e) return out;
  e.L.forEach((L) => { if (KINDS[L.k] === "txt" && L.p && filled(L.p.s)) out.push({ sub: UNIT.txt, text: L.p.s.trim() }); });
  return out;
}
/** → { sub, text }[] (§7.7): student text only (steps: effective values, inherited-only units not repeated, copied units marked;
 *  notes: accepted or copied drafts exported as markers; edit: text layers; trash: none) */
export function folioUnits(f, v) {
  const part = f && f.part;
  if (part === "steps") return stepsUnits(v);
  if (part === "notes") return notesUnits(v);
  if (part === "edit") return editUnits(v);
  return [];
}

/* ---------- editor-facing data (WP1b) ---------- */
/** stages an INSPECT item routes to with method m (§4.2: ROUTE_ITEM overrides ROUTE) */
const stagesFor = (item, m) => (ROUTE_ITEM[item] && ROUTE_ITEM[item][m]) || ROUTE[m] || [];
const isRoute = (r) => isPlain(r) && Array.isArray(r.s) && Array.isArray(r.m);
const routeOf = (r) => {
  const a = (x, max) => ITEMS.map((_, i) => code(Array.isArray(x) ? x[i] : 0, max));
  return { s: a(r.s, 2), m: a(r.m, METHOD_LABEL.length - 1), o: a(r.o, 2) };
};
/** → route (§4.2). An existing route is returned unchanged. Otherwise: s5c.inspect 불성립 → s 2, its fix → method, o 1
 *  (성립 → s 1, o 1); then round 3's hm (when rc is not skipped): 부분 수정 → cause, 화면 편집 → exhibit, 손으로 고치기 → cause
 *  with that method, s 2, o 2, only when the item has no method yet. */
export function routeInit(inspect, route, steps) {
  if (isRoute(route)) return route;
  const s = ITEMS.map(() => 0), m = ITEMS.map(() => 0), o = ITEMS.map(() => 0);
  const ins = isPlain(inspect) ? inspect : {};
  ITEMS.forEach((it, i) => {
    const row = isPlain(ins[it]) ? ins[it] : null;
    if (!row) return;
    if (row.status === CORE_TEXT.s5cNo) {
      const k = METHOD_LABEL.indexOf(str(row.fix).trim());
      s[i] = 2; m[i] = k > 0 ? k : 0; o[i] = 1;
    } else if (row.status === CORE_TEXT.s5cOk) { s[i] = 1; o[i] = 1; }
  });
  const st = normSteps(steps);
  if (!isSkipped(st, "rc")) {
    const place = (item, method) => { const i = ITEMS.indexOf(item); if (m[i] === 0) { s[i] = 2; m[i] = method; o[i] = 2; } };
    const hm = st.rc.hm;
    if (hm === HM.patch) place("cause", METHOD.patch);
    else if (hm === HM.screen) place("exhibit", METHOD.screen);
    else if (hm === HM.hand) place("cause", METHOD.hand);
  }
  return { s, m, o };
}
/** → { [StageKey]: { n, hidden } }: n = routed items (s 2 with a method) per stage; a stage the release hides (STAGE_FEAT, featFn)
 *  is never counted. Without a route (no manifest yet), round 3's hm alone gives the stages (HM_ROUTE). */
export function routedStages(route, steps, featFn = featDefault) {
  const out = {};
  STAGES.forEach((k) => { out[k] = { n: 0, hidden: STAGE_FEAT[k] ? !featFn(STAGE_FEAT[k]) : false }; });
  const bump = (st) => { if (out[st] && !out[st].hidden) out[st].n++; };
  if (isRoute(route)) {
    const rt = routeOf(route);
    ITEMS.forEach((it, i) => { if (rt.s[i] === 2 && rt.m[i] > 0) stagesFor(it, rt.m[i]).forEach(bump); });
  } else {
    const s = normSteps(steps);
    if (!isSkipped(s, "rc")) (HM_ROUTE[s.rc.hm] || []).forEach(bump);
  }
  return out;
}
/** → sr (the whole stage-record map, patched for one stage; unknown keys kept). ev:
 *  "enter" (creates {t0,e,d,n}; marks activity without adding time) | "tick" | "leave" (activity: adds the gap since the last
 *  activity to d when it is ≤ 60 s, then e = now − t0) | "commit" or {commit:"out"|"plan"} (activity, n + 1, ch 1) |
 *  {commit:"view"} (activity only) | "skip" | "unskip" | {tries:n} (patch only, 1..20) | {tone:{mb,ct,sa,bg}} (tone only) */
export function stageRecUpdate(sr, stage, ev, nowS) {
  if (!STAGES.includes(stage)) return sr;
  const map = isPlain(sr) ? sr : {};
  const now = nowInt(nowS);
  const raw = isPlain(map[stage]) ? map[stage] : null;
  const r = raw ? { ...raw } : { t0: now, e: 0, d: 0, n: 0 };
  if (!(isNum(r.t0) && r.t0 > 0)) r.t0 = now;
  const t0 = r.t0;
  const lastAct = () => t0 + num(r.e, 0, LIMITS.tiMax);
  const mark = () => { if (now > lastAct()) r.e = Math.min(LIMITS.tiMax, now - t0); };
  const activity = () => {
    const gap = now - lastAct();
    if (gap > 0 && gap <= 60) r.d = Math.min(LIMITS.tiMax, num(r.d, 0, LIMITS.tiMax) + gap);
    mark();
  };
  const commit = ev === "commit" ? "out" : isPlain(ev) && typeof ev.commit === "string" ? ev.commit : null;
  if (ev === "enter") { if (raw) mark(); }
  else if (ev === "tick" || ev === "leave") activity();
  else if (commit) {
    activity();
    if (commit === "out" || commit === "plan") { r.n = Math.min(LIMITS.stageN, num(r.n, 0, LIMITS.stageN) + 1); r.ch = 1; }
  } else if (ev === "skip") r.sk = 1;
  else if (ev === "unskip") delete r.sk;
  else if (isPlain(ev) && "tries" in ev) {
    if (stage !== "patch" || !isNum(ev.tries)) return sr;
    r.tr = num(ev.tries, 1, LIMITS.tries);
  } else if (isPlain(ev) && isPlain(ev.tone)) {
    if (stage !== "tone") return sr;
    const t = ev.tone;
    ["mb", "ct", "sa"].forEach((k) => { if (isNum(t[k])) r[k] = num(t[k], -1000, 1000); });
    if (Array.isArray(t.bg) && t.bg.length === 8 && t.bg.every(isNum)) r.bg = t.bg.map((x) => num(x, 0, 255));
  } else return sr;
  return { ...map, [stage]: r };
}
/** → log (a new array; ≤ LIMITS.log, oldest dropped). delta {o, s (index or StageKey; default the op's stage), y, n (1), a, l, w, p}:
 *  merges into the last entry with the same (s, o, y) within 120 s (n += delta.n, a and p replaced when given, t updated);
 *  l and w default to classifyOp(o). p is cut to 40 characters. */
export function appendLog(log, delta, nowS) {
  const list = Array.isArray(log) ? log : [];
  if (!isPlain(delta) || typeof delta.o !== "string" || !delta.o) return list;
  const t = nowInt(nowS);
  const sIn = typeof delta.s === "string" ? STAGES.indexOf(delta.s) : delta.s;
  const opSt = OPS[delta.o] && OPS[delta.o].st ? STAGES.indexOf(OPS[delta.o].st) : 0;
  const s = Number.isInteger(sIn) && sIn >= 0 && sIn < STAGES.length ? sIn : opSt;
  const y = num(delta.y, 0, 1e9);
  const cls = Number.isInteger(delta.l) && Number.isInteger(delta.w) ? { l: code(delta.l, 5), w: code(delta.w, 9, WPP.na) } : classifyOp(delta.o);
  const n = num(delta.n == null ? 1 : delta.n, 0, LIMITS.logN);
  const p = typeof delta.p === "string" ? [...delta.p].slice(0, 40).join("") : null;
  const last = list[list.length - 1];
  if (isPlain(last) && last.s === s && last.o === delta.o && num(last.y, 0, 1e9) === y && Math.abs(t - num(last.t, 0, EPOCH_MAX)) <= 120) {
    const m = { ...last, t, n: Math.min(LIMITS.logN, num(last.n, 0, LIMITS.logN) + n), l: cls.l, w: cls.w };
    if (delta.a != null) m.a = num(delta.a, 0, 1000);
    if (p != null) m.p = p;
    return [...list.slice(0, -1), m];
  }
  const e = { t, s, o: delta.o, n, a: num(delta.a, 0, 1000), l: cls.l, w: cls.w, y };
  if (p != null) e.p = p;
  const out = [...list, e];
  while (out.length > LIMITS.log) out.shift();
  return out;
}
/** op code of a layer record: ai → patch, px → its t (spot…shb), tr → trace, db → dodge, adj/flt/ov → their t, txt → txt; "" for
 *  an unknown kind (export added in WP1, contract-log) */
export function layerOp(rec) {
  if (!isPlain(rec) || !Number.isInteger(rec.k)) return "";
  const kind = KINDS[rec.k];
  if (kind === "ai") return "patch";
  if (kind === "tr") return "trace";
  if (kind === "db") return "dodge";
  if (kind === "txt") return "txt";
  const tc = TCODE[kind];
  return tc ? tc[code(rec.t, tc.length - 1)] : "";
}
const IT_CAUSE = ITEMS.indexOf("cause") + 1, IT_LIGHT = ITEMS.indexOf("light") + 1;
/** → { l:0..5, w:WPP code } incl. the dynamic rules of §7.2, decided from the layer record (rec, or a layer id looked up in edit.L):
 *  gb/nz local (a mask that is on and cov < 950‰) → 4 지우기 / 4 더하기; spot → 예외 허용 when mx ≤ 10‰ and cov ≤ 5‰, else 지우기;
 *  dodge/sponge → 4 내용 변경 when it links cause or light or po > 0. Without a record: the static OPS entry. */
export function classifyOp(op, rec, edit) {
  const o = OPS[op];
  if (!o) return { l: 0, w: WPP.na };
  let r = rec;
  if (!isPlain(r) && Number.isInteger(rec) && isPlain(edit) && Array.isArray(edit.L)) r = edit.L.find((x) => isPlain(x) && x.id === rec);
  if (!o.dyn || !isPlain(r)) return { l: o.lv, w: o.w };
  const cov = num(r.cov, 0, 1000), mx = num(r.mx, 0, 1000), po = num(r.po, 0, 1e6), it = code(r.it, ITEMS.length);
  const local = isPlain(r.mk) && r.mk.on !== 0 && cov < 950;
  if (op === "gb") return local ? { l: 4, w: WPP.del } : { l: 2, w: WPP.ok };
  if (op === "nz") return local ? { l: 4, w: WPP.add } : { l: 2, w: WPP.ok };
  if (op === "spot") return mx <= 10 && cov <= 5 ? { l: 4, w: WPP.exc } : { l: 4, w: WPP.del };
  if (op === "dodge" || op === "sponge") return it === IT_CAUSE || it === IT_LIGHT || po > 0 ? { l: 4, w: WPP.alter } : { l: 2, w: WPP.ok };
  return { l: o.lv, w: o.w };
}
const PIX = new Set(["ai", "px", "tr", "db"]);
const TONE_OPS = ["bc", "lv", "cv", "ex"], COLOR_OPS = ["hs", "vb", "cb", "pf"];
/** SumEntry: { op, l, w, y (layer id, 0 for doc ops), kind ("doc" or a KINDS name), a (area ‰ that orders the phrase: cov of pixel
 *  and local layers, kept ‰ for crop, else 0), cov, g, po, it, ce, mx, local, p, mb? (sr.tone mean brightness ‰, tone ops) } */
function docEntry(op, a, p) { const c = classifyOp(op); return { op, l: c.l, w: c.w, y: 0, kind: "doc", a, cov: 0, g: 0, po: 0, it: 0, ce: 0, mx: 0, local: false, p }; }
function summarizeE(e) {
  if (!e) return [];
  const out = [], d = e.doc, W = d.w, H = d.h;
  if (d.crop && W > 0 && H > 0 && !(d.crop.x === 0 && d.crop.y === 0 && d.crop.w === W && d.crop.h === H)) {
    const iw = Math.max(0, Math.min(W, d.crop.x + d.crop.w) - Math.max(0, d.crop.x)), ih = Math.max(0, Math.min(H, d.crop.y + d.crop.h) - Math.max(0, d.crop.y));
    const kept = Math.min(1000, Math.round((iw * ih * 1000) / (W * H)));
    out.push(docEntry("crop", kept, { kept }));
  }
  if (d.r) out.push(docEntry("strt", 0, { deg: d.r / 10 }));
  if (d.rot) out.push(docEntry("rot", 0, { deg: d.rot }));
  const x = d.ext;
  if (x.t || x.r || x.b || x.l) out.push(docEntry("ext", 0, { tb: (x.t || x.b) && !x.l && !x.r ? 1 : 0 }));
  const tone = e.sr.tone || {};
  e.L.forEach((L) => {
    const kind = KINDS[L.k];
    if (!kind || L.vis === 0 || L.op <= 0) return;
    const masked = isPlain(L.mk) && L.mk.on !== 0;
    if (PIX.has(kind) && !(L.cov > 0)) return;
    if ((kind === "adj" || kind === "flt") && masked && !(L.cov > 0)) return;
    const op = layerOp(L);
    if (!OPS[op]) return;
    const c = classifyOp(op, L);
    const local = PIX.has(kind) || (masked && L.cov < 950);
    const en = { op, l: c.l, w: c.w, y: L.id, kind, a: local ? L.cov : 0, cov: L.cov, g: L.g, po: L.po, it: L.it, ce: L.ce, mx: L.mx, local, p: L.p };
    if (TONE_OPS.includes(op) && isNum(tone.mb)) en.mb = tone.mb;
    out.push(en);
  });
  return out;
}
/** → SumEntry[] from the manifest only (§7.3): crop/strt/rot/ext from doc, then every visible layer (op > 0) of a known kind that
 *  is in the image (pixel kinds and masked adjustments need cov > 0), each classified by classifyOp */
export function summarize(edit) { return summarizeE(normEdit(edit)); }

/* ---- phrase parts (§7.2 Part in) ---- */
const pct1 = (p) => String(Math.round(Number(p) || 0) / 10);
const pct0 = (p) => String(Math.round((Number(p) || 0) / 10));
const signed = (permille) => { const v = Math.round((Number(permille) || 0) / 10); return (v > 0 ? "+" : "") + v; };
const nounOf = (it) => (it > 0 ? ITEM_NOUN[ITEMS[it - 1]] || "" : "");
const cmStr = (p) => String(Math.round(num(p && p.cm, 0, 1e6)) / 10);
function partKey(x) {
  if (TONE_OPS.includes(x.op)) return "tone";
  if (COLOR_OPS.includes(x.op)) return "color";
  if (x.op === "spot" && x.w === WPP.exc) return "dust";
  if (x.op === "spot" || x.op === "heal" || x.op === "clone") return "rm:" + nounOf(x.it);
  if (x.op === "dodge" || x.op === "sponge") return x.l >= 4 ? "dbT:" + (nounOf(x.it) || ITEM_NOUN.cause) : "db";
  return x.op;
}
/** merges summary entries that make the same phrase part (areas and groups add up, the higher level wins), first-seen order */
function mergeParts(entries) {
  const m = new Map();
  entries.forEach((x) => {
    const k = partKey(x), y = m.get(k);
    if (!y) { m.set(k, { ...x, key: k }); return; }
    y.cov = Math.min(1000, y.cov + x.cov); y.a = Math.min(1000, y.a + x.a); y.g += x.g; y.po += x.po; y.l = Math.max(y.l, x.l);
  });
  return [...m.values()];
}
function partText(x) {
  const a = pct1(x.cov), g = Math.max(1, x.g);
  if (x.key === "tone") return isNum(x.mb) ? fmt(PHRASE.tone, { n: signed(x.mb) }) : CORE_TEXT.toneBare;
  if (x.key === "color") return PHRASE.color;
  if (x.key === "dust") return fmt(PHRASE.spotDust, { n: g });
  if (x.key.startsWith("rm:")) { const t = x.key.slice(3); return t ? fmt(PHRASE.removeTarget, { target: t, n: g, a }) : fmt(PHRASE.remove, { n: g, a }); }
  if (x.key.startsWith("dbT:")) return fmt(PHRASE.dodgeTarget, { target: x.key.slice(4), a });
  if (x.key === "db") return fmt(PHRASE.dodge, { a });
  switch (x.op) {
    case "crop": return x.a >= 900 ? PHRASE.crop : fmt(PHRASE.cropPct, { n: pct0(x.a) });
    case "strt": return fmt(PHRASE.strt, { n: Math.abs(Number(x.p && x.p.deg) || 0) });
    case "rot": return PHRASE.rot;
    case "ext": return x.p && x.p.tb ? PHRASE.extTb : PHRASE.ext;
    case "gp": return x.local ? fmt(PHRASE.gpBg, { n: pct0(x.cov) }) : PHRASE.gp;
    case "bw": return PHRASE.bwPart;
    case "usm": return PHRASE.usm;
    case "vg": return PHRASE.vg;
    case "shd": return PHRASE.shd;
    case "gb": return x.l >= 4 ? fmt(PHRASE.gbLocal, { a }) : PHRASE.gb;
    case "nz": return x.l >= 4 ? fmt(PHRASE.nzLocal, { a }) : PHRASE.nz;
    case "bsb": return fmt(PHRASE.bsb, { a });
    case "shb": return PHRASE.shb;
    case "trace": return x.ce > 0 ? fmt(PHRASE.trace, { cell: CELL_LABEL[x.ce], a }) : fmt(PHRASE.traceNoCell, { a });
    case "sb": return fmt(PHRASE.sb, { cm: cmStr(x.p) });
    case "gs": case "cc": case "tg": case "txt": return PHRASE[x.op];
    default: return "";
  }
}
/** merged parts of levels lo..hi, ordered by level (high first), then area */
function handParts(sum, lo, hi) {
  return mergeParts(sum.filter((x) => x.l >= lo && x.l <= hi && x.w !== WPP.gen))
    .map((x, i) => ({ ...x, i }))
    .sort((p, q) => q.l - p.l || q.a - p.a || p.i - q.i)
    .map((x) => ({ ...x, text: partText(x) }))
    .filter((x) => x.text);
}
const aiPct = (cov) => (cov >= 10 ? String(Math.round(cov / 10)) : String(Math.round(cov) / 10));
/** context of the phrases: normalised steps, notes, edit and the ws slice they came from */
function phraseCtx({ steps, notes, edit, ws } = {}) {
  const d = ws || {};
  return { d, s: normSteps(steps !== undefined ? steps : d[KEYS.steps]), n: normNotes(notes !== undefined ? notes : d[KEYS.notes]), e: normEdit(edit !== undefined ? edit : d[KEYS.edit]) };
}
const aiLayers = (e) => (e ? e.L.filter((L) => KINDS[L.k] === "ai" && L.vis !== 0 && L.op > 0 && L.cov > 0) : []);
/** generation tools of the rounds with images (not skipped), grouped by effective tool, in first-seen order: [{tool, k}] */
function genTools(s) {
  const groups = [];
  ROUNDS.forEach((r, idx) => {
    if (isSkipped(s, r) || !s[r].im.length) return;
    const tool = effOf(s, idx).tool.trim();
    if (!tool) return;
    const g = groups.find((x) => x.tool === tool);
    if (g) g.k++; else groups.push({ tool, k: 1 });
  });
  return groups;
}
function toolsText(s, n, e) {
  const parts = genTools(s).map((g) => fmt(g.k > 1 ? CORE_TEXT.genToolK : PHRASE.genTool, g));
  if (!parts.length) parts.push(fmt(PHRASE.genTool, { tool: KIND_LABEL.ai }));
  const aiTool = n.aiTool.trim() || KIND_LABEL.ai, region = n.aiRegion.trim();
  const ai = aiLayers(e);
  if (ai.length) ai.forEach((L) => parts.push(fmt(region ? PHRASE.patchArea : CORE_TEXT.patchAreaOnly, { aiTool, aiRegion: region, n: aiPct(L.cov) })));
  else if (filled(n.aiTool)) parts.push(region ? fmt(PHRASE.patchNoArea, { aiTool, aiRegion: region }) : fmt(CORE_TEXT.patchBare, { aiTool }));
  return parts.join(T.listSep);
}
const TONE_WORD = { tone: "tone", gp: "tone", usm: "tone", gb: "tone", nz: "tone", vg: "tone", shd: "tone", db: "tone", bsb: "tone", shb: "tone",
  color: "color", bw: "color", crop: "crop", ext: "crop", rot: "crop", strt: "strt" };
function clausesText(parts, n, e) {
  const cl = [];
  const join = (xs) => [...new Set(xs.filter(Boolean))].join(CORE_TEXT.nameJoin);
  if (aiLayers(e).length || filled(n.aiTool)) cl.push([PHRASE.clausePatch, { obj: josa(n.aiRegion.trim() || CORE_TEXT.objPatch, CORE_TEXT.josaObj) }]);
  const rm = parts.filter((x) => x.key === "dust" || x.key.startsWith("rm:")).map((x) => (x.key === "dust" ? CORE_TEXT.objDust : x.key.slice(3) || CORE_TEXT.objRemove));
  if (rm.length) cl.push([PHRASE.clauseRemove, { obj: josa(join(rm), CORE_TEXT.josaObj) }]);
  const tr = parts.find((x) => x.op === "trace");
  if (tr) cl.push(tr.ce > 0 ? [PHRASE.clauseTrace, { cell: CELL_LABEL[tr.ce] }] : [PHRASE.clauseTraceNoCell, {}]);
  const add = parts.filter((x) => ["sb", "gs", "cc", "tg", "txt"].includes(x.op)).map((x) => MARK_TEXT[x.op]);
  if (add.length) cl.push([PHRASE.clauseAdd, { obj: josa(join(add), CORE_TEXT.josaObj) }]);
  const words = new Set(parts.map((x) => TONE_WORD[x.key.startsWith("dbT:") ? "db" : x.key]).filter(Boolean));
  const tw = ["tone", "color", "crop", "strt"].filter((k) => words.has(k)).map((k) => PHRASE.toneWords[k]);
  if (tw.length) cl.push([PHRASE.clauseTone, { obj: josa(tw.join(CORE_TEXT.nameJoin), CORE_TEXT.josaObj) }]);
  return cl.map(([pair, vars], i) => fmt(pair[i === cl.length - 1 ? 1 : 0], vars)).join(PHRASE.clauseJoin);
}
/** → { a, b, c } drafts (§7.4), recomputed deterministically; never stored as text. Inputs default to the ws slices. */
export function buildPhrases({ steps, notes, edit, ws, nowMs } = {}) {
  const { d, s, n, e } = phraseCtx({ steps, notes, edit, ws });
  const sum = summarizeE(e);
  const title = [d["s6b.title"], d["s6b.relic"]].find(filled);
  const at = e && e.done && e.done.at > 0 ? e.done.at : isNum(nowMs) ? nowMs : Date.now();
  const dt = new Date(at);
  const ym = fmt(PHRASE.ym, { y: dt.getFullYear(), m: dt.getMonth() + 1 });
  const tools = toolsText(s, n, e);
  const all = handParts(sum, 1, 4);
  const shown = all.slice(0, 4).map((x) => x.text);
  let hand = shown.length ? shown.join(T.listSep) : PHRASE.noHand;
  if (all.length > 4) hand += " " + fmt(PHRASE.more, { n: all.length - 4 });
  const pr = e ? e.pr : { mode: 1, paper: 0, bw: 0, ppi: CLASS_DEFAULTS.ppi };
  const output = (pr.mode === 2 ? (pr.paper === 5 ? PHRASE.printA5 : PHRASE.printA4) : PHRASE.screen) + (pr.bw ? PHRASE.bw : "");
  let w = 0, h = 0;
  if (e && e.m.out) { w = e.m.out.w; h = e.m.out.h; } else if (e && e.doc.out.w) { w = e.doc.out.w; h = e.doc.out.h; } else { const b = baseS(s); if (b) { w = b.img.w; h = b.img.h; } }
  const cm = (px) => Math.round((px / (pr.ppi || CLASS_DEFAULTS.ppi)) * 2.54 * 10) / 10;
  const size = pr.mode === 2 ? fmt(PHRASE.sizeCm, { w: cm(w), h: cm(h) }) : fmt(PHRASE.sizePx, { w, h });
  const a = fmt(PHRASE.a, { title: title ? title.trim() : PHRASE.titleFallback, ym, tools, hand, output, size });
  const b = fmt(PHRASE.b, { tools, hand });
  const rounds5 = Array.isArray(d["s5b.rounds"]) ? d["s5b.rounds"] : [];
  const N = rounds5.filter(s5Img).length + ROUNDS.filter((r) => !isSkipped(s, r) && s[r].im.length > 0 && s[r].from === 0).length;
  const clauses = clausesText(all, n, e);
  let c = clauses ? fmt(PHRASE.c, { n: N, clauses }) : fmt(CORE_TEXT.cNoHand, { n: N });
  if (e) ITEMS.forEach((it, i) => {
    if (e.route.s[i] === 2 && e.route.m[i] === METHOD.keep) c += " " + fmt(PHRASE.cKeep, { topic: josa(ITEM_NOUN[it] || ITEM_LABEL[it], CORE_TEXT.josaTopic) });
  });
  return { a, b, c };
}
/** categories of the summary (§7.5) whose keywords the text lacks → their GAP_WORDS show words; tool names (first two
 *  characters) when ctx gives steps/notes. Level 1–2 categories are skipped when the text ends in 「외 n건」. */
function gapShows(e, text, ctx = {}) {
  const t = str(text);
  if (!filled(t)) return [];
  const sum = summarizeE(e);
  const n = normNotes(ctx.notes);
  const cats = new Set();
  sum.forEach((x) => {
    if (["spot", "heal", "clone"].includes(x.op)) cats.add("remove");
    else if (["sb", "gs", "cc", "tg", "txt"].includes(x.op)) cats.add("add");
    else if (x.op === "trace") cats.add("trace");
    else if (x.op === "crop") cats.add("crop");
    else if (x.op === "bw") cats.add("bw");
    else if ([...TONE_OPS, ...COLOR_OPS, "usm", "vg", "dodge", "sponge", "shb"].includes(x.op)) cats.add("tone");
  });
  if (aiLayers(e).length || filled(n.aiTool)) cats.add("patch");
  const moreRe = new RegExp(escRe(PHRASE.more).replace("\\{n\\}", "\\d+"));
  const folded = moreRe.test(t);
  const out = [];
  ["remove", "add", "trace", "patch", "crop", "tone", "bw"].forEach((k) => {
    if (!cats.has(k) || (folded && ["crop", "tone", "bw"].includes(k))) return;
    if (!GAP_WORDS[k].find.some((w) => t.includes(w))) out.push(GAP_WORDS[k].show);
  });
  if (ctx.steps !== undefined || ctx.notes !== undefined) {
    const names = genTools(normSteps(ctx.steps)).map((g) => g.tool);
    if (filled(n.aiTool)) names.push(n.aiTool.trim());
    [...new Set(names)].forEach((nm) => { const head = [...nm.replace(/\s+/g, "")].slice(0, 2).join(""); if (head && !t.replace(/\s+/g, "").includes(head)) out.push(nm); });
  }
  return out;
}
/** → string[] warning lines (§7.5), e.g. 「수정 기록에 있는 ‘지움’이 AI 활용 범위 문장에는 없습니다.」 Never blocking.
 *  ctx (optional, added in WP1): { steps, notes } also checks the tool names and an outside partial edit. */
export function phraseGaps(edit, text, ctx = {}) {
  return gapShows(normEdit(edit), text, ctx).map(gapLine);
}
const gapLine = (w) => fmt(CORE_TEXT.gapLine, { wSubj: josa(QL + w + QR, CORE_TEXT.josaSubj) });
const QL = String.fromCharCode(0x2018), QR = String.fromCharCode(0x2019);   // ‘ ’ around a quoted word (T templates use them)
/** parameters of a summary entry for its log line (opLines) */
function paramText(x) {
  const p = x.p || {};
  if (x.op === "lv" && Array.isArray(p.l)) return fmt(CORE_TEXT.lv, { ib: p.l[0], iw: p.l[2], g: (p.l[1] / 100).toFixed(2) });
  if (x.op === "bc" && (isNum(p.b) || isNum(p.c))) return fmt(CORE_TEXT.bc, { b: signed((p.b || 0) * 10), c: signed((p.c || 0) * 10) });
  if (x.op === "crop") return x.a >= 900 ? PHRASE.crop : fmt(PHRASE.cropPct, { n: pct0(x.a) });
  if (x.op === "strt") return fmt(PHRASE.strt, { n: Math.abs(Number(p.deg) || 0) });
  if (x.op === "sb") return cmStr(p) + "cm";
  return "";
}
/** → string[] human log lines for one stage (§7.1): one line per op in the final document (name, count from the log, groups, area,
 *  parameters, mean brightness, linked item, design-card cell, level and WPP class; the overlap warning for layers with po > 0),
 *  then one line per op that only the log holds for that stage (analysis and scope ops, or layers deleted since).
 *  opts.audience (review r3 K8; contract-log K28): "student" (the default) shows no 개입 level and no 보도사진 verdict; a line in the
 *  final document at level ≥ 4 ends with CORE_TEXT.discloseTag (「표기 문장에 밝힐 수정」), log-only lines carry no tag.
 *  "teacher" (FolioRead) ends every classified line with 「개입 n(LEVEL_LABEL)」 and 「보도사진 기준: …」. */
export function opLines(edit, stage, { audience = "student" } = {}) {
  const e = normEdit(edit);
  if (!e || !STAGES.includes(stage)) return [];
  const si = STAGES.indexOf(stage);
  const tone = e.sr.tone || {};
  const lines = [], covered = new Set();
  const count = (op, y) => e.log.filter((l) => l.o === op && (!y || l.y === y)).reduce((a, l) => a + l.n, 0);
  const teacher = audience === "teacher";
  const tags = (l, w, inDoc) => {
    if (!teacher) return inDoc && l >= 4 ? [CORE_TEXT.discloseTag] : [];
    return w !== WPP.na ? [fmt(CORE_TEXT.levelNamed, { n: l, name: LEVEL_LABEL[l] || "" }), fmt(T.wppTag, { w: WPP_LABEL[w] })] : [];
  };
  summarizeE(e).filter((x) => OPS[x.op].st === stage).forEach((x) => {
    covered.add(x.op);
    let head = OP_TEXT[x.op] || x.op;
    if (x.op === "trace" && x.p && x.p.pr) head += "(" + CORE_TEXT.trace[x.p.pr] + ")";
    const cnt = count(x.op, x.y);
    const params = paramText(x);
    const extras = [];
    if (x.g > 0) extras.push(fmt(CORE_TEXT.groups, { n: x.g }));
    if (x.kind !== "doc" && x.local) extras.push(fmt(T.areaExact, { n: pct1(x.cov) }));
    if (params) head += ": " + [params, ...extras].join(T.listSep);
    else { const bits = [cnt > 0 ? fmt(CORE_TEXT.times, { n: cnt }) : "", ...extras].filter(Boolean); if (bits.length) head += " " + bits.join(T.listSep); }
    const segs = [head];
    if (TONE_OPS.includes(x.op) && isNum(tone.mb)) segs.push(fmt(CORE_TEXT.mean, { n: signed(tone.mb) }));
    if (x.it > 0) segs.push(fmt(CORE_TEXT.link, { item: ITEM_LABEL[ITEMS[x.it - 1]] }));
    if (x.op === "trace" && x.ce > 0) segs.push(fmt(CORE_TEXT.cell, { cell: CELL_LABEL[x.ce] }));
    lines.push([...segs, ...tags(x.l, x.w, true)].join(CORE_TEXT.sep));
    if (x.po > 0 && PIX.has(x.kind)) lines.push(T.traceOverlapLine);
  });
  const agg = new Map();
  e.log.forEach((l) => {
    if (l.s !== si || covered.has(l.o)) return;
    const a = agg.get(l.o) || { n: 0, l: 0, w: l.w };
    a.n += l.n; a.l = Math.max(a.l, l.l); if (l.w !== WPP.na) a.w = l.w;
    agg.set(l.o, a);
  });
  agg.forEach((a, op) => {
    const head = (OP_TEXT[op] || op) + (a.n > 0 ? " " + fmt(CORE_TEXT.times, { n: a.n }) : "");
    lines.push([head, ...(a.l > 0 ? tags(a.l, a.w, false) : [])].join(CORE_TEXT.sep));
  });
  return lines;
}
/** → { ok, items:[{ k, text, block, stage? }] } (§3.10 precheck). Blocking items in order: export current; notes of changed stages
 *  and stFinal; methods, 그대로 두기 reasons, reasons for routed stages that changed nothing (items routed to a hidden stage ask
 *  only for that stage's note); rm and rf; phrases (b) and (c) written or accepted; no unsaved changes or uploads. Non-blocking:
 *  stale drafts and phrase gaps. */
export function finalizeCheck(ws, { dirty = false, uploading = 0, feat: featFn = featDefault } = {}) {
  const d = ws || {}, e = normEdit(d[KEYS.edit]), n = normNotes(d[KEYS.notes]);
  const items = [];
  const add = (k, text, stage, block = true) => items.push(stage ? { k, text, block, stage } : { k, text, block });
  const hidden = (st) => !!STAGE_FEAT[st] && !featFn(STAGE_FEAT[st]);
  if (!e || !e.m.out || e.m.out.cr !== e.crev) add("export", T.needExport, "final");
  const sr = e ? e.sr : {};
  STAGES.forEach((st) => {
    if (st !== "final" && sr[st] && sr[st].ch && !filled(n[STAGE_NOTE[st]])) add("note:" + st, fmt(CORE_TEXT.needStageNote, { stage: STAGE_TEXT[st].name }), st);
  });
  if (!filled(n.stFinal)) add("note:final", T.needFinal, "final");
  if (e) {
    const asked = new Set();
    ITEMS.forEach((it, i) => {
      if (e.route.s[i] !== 2) return;
      const m = e.route.m[i], reason = filled(n[KP[it]]);
      const itemObj = josa(QL + ITEM_LABEL[it] + QR, CORE_TEXT.josaObj);
      if (m === METHOD.none) { add("method:" + it, fmt(T.needMethod, { item: ITEM_LABEL[it] }), "check"); return; }
      if (m === METHOD.keep) { if (!reason) add("keep:" + it, fmt(T.needKeepReason, { itemObj }), "check"); return; }
      const stages = stagesFor(it, m), hid = stages.filter(hidden);
      if (hid.length) {
        hid.forEach((st) => {
          if (asked.has(st) || filled(n[STAGE_NOTE[st]])) return;
          asked.add(st);
          add("hidden:" + st, fmt(T.needHiddenNote, { stage: STAGE_TEXT[st].name }), st);
        });
        return;
      }
      if ((m === METHOD.screen || m === METHOD.hand) && !reason && !stages.some((st) => sr[st] && sr[st].ch)) {
        add("nochange:" + it, fmt(T.needNoChange, { itemObj, methodRo: josa(METHOD_LABEL[m], CORE_TEXT.josaRo) }), stages[0] || "check");
      }
    });
  }
  if (!n.rm) add("rm", T.needRm, "final");
  if (!filled(n.rf)) add("rf", T.needRf, "final");
  if (!filled(n.phScope) && !n.pd.phScope) add("phScope", T.needPhScope, "final");
  if (!filled(n.phMaking) && !n.pd.phMaking) add("phMaking", T.needPhMaking, "final");
  if (dirty) add("dirty", T.needSaved);
  if (uploading > 0) add("uploading", T.needUploads);
  const ph = buildPhrases({ ws: d });
  const pb = effPhrase(n, "phScope", ph.b), pc = effPhrase(n, "phMaking", ph.c);
  if (pb.stale) add("stale:phScope", T.staleDraft, "final", false);
  if (pc.stale) add("stale:phMaking", T.staleDraft, "final", false);
  if (e) gapShows(e, pb.text, { steps: d[KEYS.steps], notes: d[KEYS.notes] })
    .forEach((w, i) => add("gap:" + i, gapLine(w), "final", false));
  return { ok: !items.some((x) => x.block), items };
}
/** 16-hex dHash distance (64 when either is not a 16-hex string) */
function hamming16(a, b) {
  if (!/^[0-9a-f]{16}$/i.test(a) || !/^[0-9a-f]{16}$/i.test(b)) return 64;
  let dd = 0;
  for (let i = 0; i < 16; i++) dd += popcount(parseInt(a[i], 16) ^ parseInt(b[i], 16));
  return dd;
}
/** numbers of a size text in cm (「12×4×3cm」, 「120mm」); a unit written once applies to every number */
function sizeNumbersCm(text) {
  const t = str(text), f = /mm/i.test(t) ? 0.1 : 1;
  return (t.match(/\d+(?:\.\d+)?/g) || []).map((x) => parseFloat(x) * f).filter((x) => x > 0);
}
/** → [{ k, text, level:"warn"|"info"|"good" }] (§7.6 item 10), in the order of the spec list */
export function flags(ws) {
  const d = ws || {}, s = normSteps(d[KEYS.steps]), n = normNotes(d[KEYS.notes]), e = normEdit(d[KEYS.edit]);
  const out = [];
  const add = (k, text, level = "warn") => out.push({ k, text, level });
  const area = (p) => fmt(T.areaExact, { n: pct1(p) });
  const L = e ? e.L.filter((x) => KINDS[x.k] && x.vis !== 0 && x.op > 0) : [];
  const kindOf = (x) => KINDS[x.k];
  if (e) {
    const i = ITEMS.indexOf("structure");
    if (e.route.s[i] === 2 && e.route.m[i] === METHOD.regen) {
      const b = baseS(s);
      const br = e.m.base ? e.m.base.r : b ? b.r : -1;
      if (!ROUNDS.some((r, j) => j > br && !isSkipped(s, r) && s[r].im.length > 0)) add("structNoRegen", T.flagStructNoRegen);
    }
  }
  const po = L.filter((x) => ["px", "db", "ai"].includes(kindOf(x))).reduce((a, x) => a + x.po, 0);
  if (po > 0) add("pinTouched", fmt(T.flagPinTouched, { n: po }));
  const trCov = L.filter((x) => kindOf(x) === "tr").reduce((a, x) => a + x.cov, 0);
  if (trCov > 20) add("traceWide", fmt(T.flagTraceWide, { area: area(Math.min(1000, trCov)) }));
  const rmCov = L.filter((x) => kindOf(x) === "px" && ["spot", "clone", "heal"].includes(TCODE.px[x.t])).reduce((a, x) => a + x.cov, 0);
  if (rmCov > 50) add("wideRemove", fmt(T.flagWideRemove, { area: area(Math.min(1000, rmCov)) }));
  if (e && e.doc.cal && filled(d["s6b.size"]) && L.some((x) => layerOp(x) === "sb")) {
    const cm = e.doc.cal.cm / 10, nums = sizeNumbersCm(d["s6b.size"]);
    if (nums.length && !nums.some((v) => Math.abs(v - cm) <= Math.max(0.05 * cm, 0.1))) add("scaleMismatch", T.flagScaleMismatch);
  }
  if (e) {
    const b = effPhrase(n, "phScope", buildPhrases({ ws: d }).b);
    const g = gapShows(e, b.text, { steps: d[KEYS.steps], notes: d[KEYS.notes] });
    if (g.length) add("phraseGap", fmt(T.flagPhraseGap, { list: g.join(T.listSep) }));
  }
  const multi = ROUNDS.filter((r, idx) => idx > 0 && changedS(s, r).length >= 2 && s[ROUNDS[prevIdx(s, idx)]].nl !== 7);
  if (multi.length) add("multiLine", fmt(T.flagMultiLine, { list: multi.map((r) => ROUND_LABEL[ROUNDS.indexOf(r)]).join(T.listSep) }));
  let dup = false;
  ROUNDS.forEach((r1, i) => ROUNDS.forEach((r2, j) => {
    if (dup || j <= i) return;
    dup = s[r1].im.some((x) => s[r2].im.some((y) => hamming16(x.sg, y.sg) <= 4));
  }));
  if (dup) add("dupImage", T.flagDupImage);
  const sk = ROUNDS.filter((r) => isSkipped(s, r));
  if (sk.length) add("skipped", fmt(T.flagSkipped, { list: sk.map((r) => ROUND_LABEL[ROUNDS.indexOf(r)]).join(T.listSep) }));
  const ea = ROUNDS.filter((r) => s[r].el === EL.after);
  if (ea.length) add("expAfter", fmt(T.flagExpAfter, { list: ea.map((r) => ROUND_LABEL[ROUNDS.indexOf(r)]).join(T.listSep) }), "info");
  if (e) {
    const short = STAGES.filter((st) => e.sr[st] && e.sr[st].ch && [...n[STAGE_NOTE[st]].trim()].length < 15).map((st) => STAGE_TEXT[st].name);
    if (short.length) add("shortNotes", fmt(T.flagShortNotes, { list: short.join(T.listSep) }));
    if (e.m.base && !(e.done && e.done.at > 0)) add("notConfirmed", T.flagNotConfirmed, "info");
    if (e.done && e.done.un > 0) add("released", fmt(T.flagReleased, { n: e.done.un }), "info");
    const kept = ITEMS.filter((it, i) => e.route.s[i] === 2 && e.route.m[i] === METHOD.keep && filled(n[KP[it]])).length;
    if (kept) add("keptReasons", fmt(T.flagKeptReasons, { n: kept }), "good");
  }
  return out;
}
/** the value a send writes into an image key (§1.4): { ref, at: ISO time, w, h }, exactly as FieldEditor writes image fields
 *  (export added in WP1, contract-log) */
export function imgSendValue(ref, w, h, nowMs) {
  return { ref: String(ref), at: new Date(isNum(nowMs) ? nowMs : Date.now()).toISOString(), w: num(w, 0, 1e6), h: num(h, 0, 1e6) };
}
/** lower limits of the exhibit hero image (review r4 F7): the s7x.img upload preset of src-media-img.js (IMG_PRESETS.hero, minLong
 *  1000, minShort 500), mirrored in the schema as SEND.s7x. SEND.s7x has no minShort yet (contract-log K31 REQUEST to A-card), so
 *  500 stands in until it does; a unit test checks both numbers against src-media-img.js. */
const HERO = { minLong: SEND.s7x.minLong, minShort: isNum(SEND.s7x.minShort) ? SEND.s7x.minShort : 500 };
/** → { s6a:{ keys, text, before, after }, aiScope:string|null, s7x:{ ok, why } } (§1.4). Only empty keys: text keys whose value is
 *  not filled, image keys without a ref. Text is one line, ≤ 300 characters. keys lists every target key that will be filled, in
 *  field order. aiScope: the effective phrase (b) when s6b.aiScope is empty. s7x: the export must meet both lower limits of the
 *  s7x.img upload preset (HERO: long side ≥ 1000 px and short side ≥ 500 px). */
export function sendPlan(ws) {
  const d = ws || {}, s = normSteps(d[KEYS.steps]), n = normNotes(d[KEYS.notes]), e = normEdit(d[KEYS.edit]);
  const max = SEND.s6a.textMax;
  const clip = (t) => [...oneLine(str(t)).replace(/\s+/g, " ").trim()].slice(0, max).join("");
  const regen = ["ra", "rb"].map((r, idx) => {
    const x = s[r];
    if (isSkipped(s, r) || !filled(x.nx)) return "";
    return fmt(CORE_TEXT.sendRegen, { round: ROUND_LABEL[idx], line: x.nl > 0 ? NL_LABEL[x.nl] : "", nx: x.nx.trim() });
  }).filter(Boolean).join(" / ");
  const partial = e && (e.L.some((L) => KINDS[L.k] === "ai") || filled(n.aiTool)) || (!e && filled(n.aiTool))
    ? [n.aiRegion.trim(), n.aiTool.trim()].filter(Boolean).join(": ") : "";
  const editTxt = handParts(summarizeE(e), 1, 2).map((x) => x.text).join(T.listSep);
  const cand = { "s6a.regen": regen, "s6a.partial": partial, "s6a.edit": editTxt, "s6a.diff": n.stFinal };
  const text = {};
  Object.entries(cand).forEach(([k, v]) => { const t = clip(v); if (filled(t) && !filled(d[k])) text[k] = t; });
  const before = !!(e && e.m.base) && !isRef(d["s6a.beforeImg"]);
  const after = !!(e && e.m.out) && !isRef(d["s6a.afterImg"]);
  const keys = [...Object.keys(text), ...(before ? ["s6a.beforeImg"] : []), ...(after ? ["s6a.afterImg"] : [])];
  const eff = effPhrase(n, "phScope", buildPhrases({ ws: d }).b);
  const scope = clip(eff.text);
  const aiScope = !filled(d["s6b.aiScope"]) && filled(scope) ? scope : null;
  const out = e && e.m.out;
  const s7x = isRef(d["s7x.img"]) ? { ok: false, why: T.sendNone }
    : !out ? { ok: false, why: T.notExported }
      : Math.max(out.w, out.h) < HERO.minLong ? { ok: false, why: fmt(CORE_TEXT.heroLong, { n: HERO.minLong }) }
        : Math.min(out.w, out.h) < HERO.minShort ? { ok: false, why: fmt(CORE_TEXT.heroShort, { n: HERO.minShort }) } : { ok: true, why: "" };
  return { s6a: { keys, text, before, after }, aiScope, s7x };
}
/** [real] 24 → "화면의 약 2.4%", 3 → "화면의 1% 미만" (permille of the output) */
export function fmtArea(permille) {
  const p = Number(permille) || 0;
  if (p < 10) return T.areaUnder1;
  return fmt(T.areaAbout, { n: Math.round(p) / 10 });
}
/** [real] "1600×2000px, 인쇄하면 약 16.9×21.2cm" (pr.ppi, default 240) */
export function fmtPrint(w, h, pr) {
  const ppi = (pr && pr.ppi) || 240;
  const cm = (px) => Math.round((px / ppi) * 2.54 * 10) / 10;
  return fmt(T.printSize, { w, h, cw: cm(w), ch: cm(h) });
}
/** count of live folio images: step images of the three rounds plus the export (research hook; used only if A15 is enabled) */
export function folioMediaN(ws) {
  const d = ws || {};
  const s = normSteps(d[KEYS.steps]), e = normEdit(d[KEYS.edit]);
  return ROUNDS.reduce((a, r) => a + s[r].im.length, 0) + (e && e.m.out ? 1 : 0);
}

/* ---------- small edit updaters (never touch sv) ---------- */
/** events list with one more event (≤ LIMITS.ev, oldest dropped); t in epoch s */
function evPush(ev, o, nowMs) {
  const list = (Array.isArray(ev) ? ev : []).filter(isPlain).slice();
  list.push({ t: Math.floor(nowInt(nowMs) / 1000), o });
  while (list.length > LIMITS.ev) list.shift();
  return list;
}
const head = (cur, nowMs, dev) => ({ rev: num(cur.rev, 0, 1e9) + 1, at: nowInt(nowMs), dev: num(dev, 0, 2147483647) });
const confirmed = (cur) => isPlain(cur.done) && isNum(cur.done.at) && cur.done.at > 0;
/** done = {at: now, n + 1, un}, event 1, rev + 1, at, dev; sv untouched. No-op without a manifest or while already confirmed */
export function confirmEdit(cur, nowMs, dev) {
  if (!isPlain(cur) || ro(cur) || confirmed(cur)) return cur;
  const d = isPlain(cur.done) ? cur.done : {};
  const done = { ...d, at: nowInt(nowMs), n: Math.min(LIMITS.doneN, num(d.n, 0, LIMITS.doneN) + 1), un: num(d.un, 0, LIMITS.doneN) };
  return { ...cur, done, ev: evPush(cur.ev, EV.done, nowMs), ...head(cur, nowMs, dev) };
}
/** done.at 0, un + 1, event 2, rev + 1, at, dev; sv untouched. No-op unless confirmed */
export function releaseEdit(cur, nowMs, dev) {
  if (!isPlain(cur) || ro(cur) || !confirmed(cur)) return cur;
  const done = { ...cur.done, at: 0, un: Math.min(LIMITS.doneN, num(cur.done.un, 0, LIMITS.doneN) + 1) };
  return { ...cur, done, ev: evPush(cur.ev, EV.unlock, nowMs), ...head(cur, nowMs, dev) };
}
/** sent[key] = nowMs, rev + 1, at, dev; sv untouched; key "s6a"|"s6b"|"s7x" */
export function markSent(cur, key, nowMs, dev) {
  if (!isPlain(cur) || ro(cur) || !["s6a", "s6b", "s7x"].includes(key)) return cur;
  const sent = isPlain(cur.sent) ? cur.sent : { s6a: 0, s6b: 0, s7x: 0 };
  if (sent[key] === nowInt(nowMs)) return cur;
  return { ...cur, sent: { s6a: 0, s6b: 0, s7x: 0, ...sent, [key]: nowInt(nowMs) }, ...head(cur, nowMs, dev) };
}
const KNOWN_M = ["base", "out", "cmp"];
const KNOWN_DOC = ["w", "h", "crop", "r", "rot", "ext", "fill", "out", "cal"];
const KNOWN_SR = ["t0", "e", "d", "n", "ch", "sk", "tr", "mb", "ct", "sa", "bg"];
const unknownOf = (o, known) => { const u = {}; if (isPlain(o)) Object.keys(o).forEach((k) => { if (!known.includes(k)) u[k] = o[k]; }); return u; };
/** → { value, superseded:string[] } (§3.8 「새 이미지로 다시 시작」): resets m (base, out, cmp), L, snaps, doc, pins, lines, act and
 *  the ch, n, tr and tone fields of every stage record; keeps route, log, nid, stage durations and unknown keys; event 3, rev + 1,
 *  crev + 1, at, dev; sv untouched. superseded = every ref of cur that the result no longer holds. Refused while confirmed. */
export function rebaseEdit(cur, nowMs, dev) {
  if (!isPlain(cur) || ro(cur) || confirmed(cur)) return { value: cur, superseded: [] };
  const sr = {};
  if (isPlain(cur.sr)) Object.keys(cur.sr).forEach((k) => {
    const r = cur.sr[k];
    if (!isPlain(r) || !STAGES.includes(k)) { sr[k] = r; return; }
    const { ch, n, tr, mb, ct, sa, bg, ...rest } = r;
    void ch; void n; void tr; void mb; void ct; void sa; void bg;
    sr[k] = { ...rest, n: 0 };
  });
  const value = {
    ...cur, m: { ...unknownOf(cur.m, KNOWN_M), base: null, out: null, cmp: null }, L: [], snaps: [], pins: [], lines: [], act: 0, sr,
    ev: evPush(cur.ev, EV.rebase, nowMs), ...head(cur, nowMs, dev), crev: num(cur.crev, 0, 1e9) + 1,
  };
  delete value.doc;
  return { value, superseded: editDiffRefs(cur, value) };
}

/* ---------- refs, trash, GC, manifest merge ---------- */
/** [real] every {ref:string} at any depth (mirror of collectMediaRefs for one value), in visiting order, unique */
export function refsIn(v) {
  const out = new Set();
  const visit = (x) => {
    if (!x) return;
    if (Array.isArray(x)) return x.forEach(visit);
    if (typeof x === "object") {
      if (typeof x.ref === "string" && x.ref) out.add(x.ref);
      Object.values(x).forEach(visit);
    }
  };
  visit(v);
  return [...out];
}
/** [real] Set of refs in s6f.steps, s6f.notes, s6f.edit (never trash) */
export function liveRefs(ws) {
  const d = ws || {};
  return new Set([...refsIn(d[KEYS.steps]), ...refsIn(d[KEYS.notes]), ...refsIn(d[KEYS.edit])]);
}
/** → string[] oldest first (batch order, then entry order), unique */
export function trashRefs(trash) {
  const out = new Set();
  normTrash(trash).b.forEach((b) => b.q.forEach((e) => out.add(e.ref)));
  return [...out];
}
/** → Trash: dedups (against the trash too) and appends one batch {t: nowS, x?, q}; while there are more than 12 batches it merges
 *  the two oldest batches without x (the merged batch keeps the later t), or, when fewer than two such batches exist, the two oldest
 *  x batches. Never drops a ref; appending nothing new returns cur. */
export function addTrash(cur, refs, nowS, { x } = {}) {
  const have = new Set(trashRefs(cur));
  const add = [];
  (Array.isArray(refs) ? refs : []).forEach((r) => {
    const ref = typeof r === "string" ? r : isRef(r) ? r.ref : "";
    if (ref && !have.has(ref)) { have.add(ref); add.push(ref); }
  });
  if (!add.length) return cur;
  const base = isPlain(cur) ? cur : { v: 1, b: [] };
  const b = (Array.isArray(base.b) ? base.b : []).filter(isPlain).slice();
  const batch = { t: nowInt(nowS) };
  if (x) batch.x = 1;
  batch.q = add.map((ref) => ({ ref }));
  b.push(batch);
  const mergeTwo = (want) => {
    const idx = [];
    for (let i = 0; i < b.length && idx.length < 2; i++) if ((b[i].x === 1) === want) idx.push(i);
    if (idx.length < 2) return false;
    const [i, j] = idx, A = b[i], B = b[j];
    const m = { ...A, ...B, t: Math.max(num(A.t, 0, EPOCH_MAX), num(B.t, 0, EPOCH_MAX)), q: [...(Array.isArray(A.q) ? A.q : []), ...(Array.isArray(B.q) ? B.q : [])] };
    b.splice(j, 1);
    b[i] = m;
    return true;
  };
  while (b.length > LIMITS.trashBatches) if (!mergeTwo(false) && !mergeTwo(true)) break;
  return { ...base, b };
}
/** → Trash without the given refs; empty batches are removed; nothing to drop returns cur */
export function dropTrash(cur, refs) {
  if (!isPlain(cur) || !Array.isArray(cur.b)) return cur;
  const drop = new Set((Array.isArray(refs) ? refs : []).map((r) => (typeof r === "string" ? r : isRef(r) ? r.ref : "")).filter(Boolean));
  if (!drop.size) return cur;
  let changed = false;
  const b = [];
  cur.b.forEach((bt) => {
    if (!isPlain(bt) || !Array.isArray(bt.q)) { b.push(bt); return; }
    const q = bt.q.filter((e) => !(isRef(e) && drop.has(e.ref)));
    if (q.length !== bt.q.length) changed = true;
    if (q.length) b.push(q.length === bt.q.length ? bt : { ...bt, q });
  });
  return changed ? { ...cur, b } : cur;
}
/** → string[] refs to delete, in the order of §2.9: (1) refs of x:1 batches, (2) refs older than the grace, (3) the oldest beyond
 *  LIMITS.trashSoft of what remains, (4) the oldest `need` more. Live refs (steps, notes, edit) are never planned. */
export function gcPlan(ws, { nowMs = Date.now(), graceMs, need = 0 } = {}) {
  const d = ws || {};
  const live = liveRefs(d);
  const grace = isNum(graceMs) ? graceMs : graceDefault();
  const seen = new Set(), entries = [];
  normTrash(d[KEYS.trash]).b.forEach((bt) => bt.q.forEach((e) => {
    if (seen.has(e.ref)) return;
    seen.add(e.ref);
    entries.push({ ref: e.ref, t: bt.t, x: bt.x === 1 });
  }));
  const cand = entries.filter((e) => !live.has(e.ref));
  const plan = [], planned = new Set();
  const take = (e) => { if (!planned.has(e.ref)) { planned.add(e.ref); plan.push(e.ref); } };
  cand.filter((e) => e.x).forEach(take);
  cand.filter((e) => nowMs - e.t * 1000 >= grace).forEach(take);
  const rest = () => cand.filter((e) => !planned.has(e.ref));
  const over = entries.filter((e) => !planned.has(e.ref)).length - LIMITS.trashSoft;
  if (over > 0) rest().slice(0, over).forEach(take);
  const k = Math.max(0, Math.floor(Number(need) || 0));
  if (k > 0) rest().slice(0, k).forEach(take);
  return plan;
}
const knownKind = (x) => Number.isInteger(x.k) && x.k >= 0 && x.k < KINDS.length;
/** L matched by id: mine's records; a cur record replaces mine's when mine carries it as missing (ms:1) or either side has a kind
 *  this release does not know; cur records of an unknown kind that mine lacks are inserted after their cur predecessor */
function mergeLayers(cL, mL) {
  const cur = (Array.isArray(cL) ? cL : []).filter(isPlain);
  const byId = new Map();
  cur.forEach((x) => { if (x.id != null && !byId.has(x.id)) byId.set(x.id, x); });
  const out = (Array.isArray(mL) ? mL : []).filter(isPlain).map((x) => {
    const c = byId.get(x.id);
    return c && (x.ms === 1 || !knownKind(c) || !knownKind(x)) ? c : x;
  });
  const ids = new Set(out.map((x) => x.id));
  cur.forEach((x, j) => {
    if (knownKind(x) || ids.has(x.id)) return;
    let pos = 0;
    for (let i = j - 1; i >= 0; i--) { const at = out.findIndex((y) => y.id === cur[i].id); if (at >= 0) { pos = at + 1; break; } }
    out.splice(pos, 0, x);
    ids.add(x.id);
  });
  return out;
}
/** → Edit (§6.4); meta { dev, sv, nowMs, contentChanged:boolean, exported:boolean }. Starts from a copy of cur (unknown top-level
 *  keys survive); content from mine (m, doc, route, pins, lines, sr, snaps, log, act, st, pr), keeping cur's unknown keys inside
 *  m, doc and each stage record (and cur's stage records of unknown stages); nid = max; L by mergeLayers; done, sent and ev
 *  always from cur; rev + 1; crev + 1 only when contentChanged; m.out.cr = crev when exported; dev, sv, at = meta. The result is
 *  clean()ed (a shape error throws, which totalUpd turns into cur). A read-only cur (v > 1) is returned unchanged. */
export function mergeManifest(cur, mine, meta) {
  if (ro(cur)) return cur;
  const c = isPlain(cur) ? cur : {}, m = isPlain(mine) ? mine : {}, mt = isPlain(meta) ? meta : {};
  const out = { ...c };
  if (!isNum(out.v)) out.v = 1;
  ["route", "pins", "lines", "snaps", "log", "act", "st", "pr"].forEach((k) => { if (k in m) out[k] = m[k]; });
  if ("m" in m) out.m = isPlain(m.m) ? { ...unknownOf(c.m, KNOWN_M), ...m.m } : m.m;
  if ("doc" in m) out.doc = isPlain(m.doc) ? { ...unknownOf(c.doc, KNOWN_DOC), ...m.doc } : m.doc;
  if ("sr" in m) {
    if (isPlain(m.sr)) {
      const csr = isPlain(c.sr) ? c.sr : {}, sr = {};
      Object.keys(csr).forEach((k) => { if (!STAGES.includes(k)) sr[k] = csr[k]; });
      Object.keys(m.sr).forEach((k) => { sr[k] = isPlain(m.sr[k]) ? { ...unknownOf(csr[k], KNOWN_SR), ...m.sr[k] } : m.sr[k]; });
      out.sr = sr;
    } else out.sr = m.sr;
  }
  if ("L" in m) out.L = mergeLayers(c.L, m.L);
  const nid = Math.max(num(c.nid, 0, 1e9), num(m.nid, 0, 1e9));
  if (nid > 0) out.nid = nid;
  out.rev = num(c.rev, 0, 1e9) + 1;
  out.crev = num(c.crev, 0, 1e9) + (mt.contentChanged ? 1 : 0);
  if (mt.exported && isPlain(out.m) && isPlain(out.m.out)) out.m = { ...out.m, out: { ...out.m.out, cr: out.crev } };
  out.dev = num(mt.dev, 0, 2147483647); out.sv = num(mt.sv, 0, 2147483647); out.at = nowInt(mt.nowMs);
  return clean(out);
}
/** [real] → string[] refs present before and absent after (superseded) */
export function editDiffRefs(prevEdit, nextEdit) {
  const after = new Set(refsIn(nextEdit));
  return refsIn(prevEdit).filter((r) => !after.has(r));
}
