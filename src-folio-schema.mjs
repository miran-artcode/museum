/* ============================================================
   생성과 다듬기 포트폴리오(6차시 s6f) + 이미지 다듬기 편집기: 고정 계약
   (spec: .tmpbuild/folio/design/spec.md §2, §5.3, §5.4; 결정 기록: .tmpbuild/folio/contract-log.md)

   · 저장 키·용량 상한·목록 한도·과정/항목/레이어 종류 코드·매개변수 규칙(PSPEC, pOk)·작업 표·
     업로드 규정·기능 깃발(FEATURES, feat)·ref와 시각 도장 도우미를 한곳에 둔다.
   · 이 파일에는 한글 문자열을 두지 않는다(화면 문구는 src-portfolio-text.mjs, src-photo-text.mjs).
   · 아무것도 import하지 않는다(가져오기 그래프의 맨 끝).
   · 고치려면 네 담당자 모두의 합의와 spec 갱신이 필요하다.
   ============================================================ */

/* ---------- 공용 타입 (spec §5.3) ----------
 * @typedef {{x:number,y:number,w:number,h:number}} Rect            integer px
 * @typedef {Uint8ClampedArray} RGBA                                  length 4·w·h
 * @typedef {Uint8Array} Mask                                        length w·h, 0..255
 * @typedef {{get(o:string,r:string):Promise<string|null>, getSafe(o:string,r:string):Promise<{ok:boolean,data:string|null}>,
 *            put(o:string,r:string,d:string):Promise<boolean>, putT(o:string,r:string,d:string):Promise<boolean>,
 *            remove(o:string,r:string):Promise<boolean>}} MediaStore
 * @typedef {(k:string, v:any|((cur:any)=>any), opts?:{upload?:boolean})=>boolean} SetField
 * @typedef {"check"|"patch"|"crop"|"tone"|"fix"|"mark"|"final"} StageKey
 * @typedef {"out"|"plan"|"view"} Fx   out: pixels, parameters, geometry, calibration, vis/op/bl, masks, overlays (bumps doc.rev and crev);
 *                                     plan: route, pins, lines (sets sr.ch, never crev); view: selection (neither)
 * @typedef {{x:number,y:number,p:number,t:number}} PtrPt             work-area px, pressure 0..1, ms
 * @typedef {{layerId:number, role:"c"|"a"|"m", rev:number, raw?:boolean}} Job   a dirty plane to encode; raw = AI upload passed through
 * @typedef {{ref:string, data:string, kind:"base"|"c"|"t"|"a"|"m"|"snap"|"out"|"th"|"cmp", job?:Job}} Payload
 * @typedef {{c?:object, a?:object, mk?:object}} Ptr   the exact LayerRec fragment a job produces (§2.4 c / a / mk shapes)
 * @typedef {Map<string, Ptr>} PtrMap                  keyed "layerId:role"
 * @typedef {{sr:Object<string,object>, pr:object, st:number, snaps:object[], m:object, log:object[], lastSavedDocRev:number,
 *             apply(part:object):object}} EditorSession    the non-document half of the manifest (§6.4)
 */

/* ---------- 저장 형태 (spec §2.2–§2.5 그대로) ----------
 * @typedef {{ref:string}} RefPtr
 * @typedef {{ref:string, w:number, h:number, sg:string, th:RefPtr|null}} StepImg
 * @typedef {{st:number, at:number, from:number, hp:number, ti:number[], ih:number, cp:number,
 *   aim:string, exp:string, el:0|1|2, tool:string, pa:string, pb:string, pc:string, pd:string, pe:string, pf:string, po:string,
 *   im:StepImg[], ci:number, ck:number[], seen:string, uk:0|1|2|3, un:string, pw:number, jd:string, cz:number, nr:number,
 *   nl:number, nw:string, hm:number, nx:string, sk:string}} Round
 * @typedef {{near:0|1|2|3, far:0|1|2|3, look:string, dPr:string, dAi:string, dHand:string, big:string, use:string,
 *   drift:string, stuck:string, base:-1|0|1|2, baseWhy:string, hp:number, ti:number[]}} Reflect
 * @typedef {{v:1, ra:Round, rb:Round, rc:Round, rv:Reflect, old:{th:RefPtr, r:0|1|2}[]}} Steps
 * @typedef {{v:1, stCheck:string, stPatch:string, stCrop:string, stTone:string, stFix:string, stMark:string, stFinal:string,
 *   kpStructure:string, kpCause:string, kpLight:string, kpScale:string, kpText:string, kpLabel:string, kpMisread:string, kpExhibit:string,
 *   aiTool:string, aiRegion:string, aiPrompt:string, rm:0|1|2|3, rf:string, calWhat:string, phScope:string, phMaking:string,
 *   pd:{phScope:number, phMaking:number}, ti:Object<string,number>}} Notes
 * @typedef {{t0:number, e:number, d:number, n:number, ch?:1, sk?:1, tr?:number, mb?:number, ct?:number, sa?:number, bg?:number[]}} StageRec
 * @typedef {{t:number, s:number, o:string, n:number, a:number, l:number, w:number, y:number, p?:string}} LogEntry
 * @typedef {{id:number, k:number, t?:number, nm?:string, vis?:0, op?:number, bl?:number, lk?:1, it?:number, ce?:number,
 *   cov?:number, g?:number, mx?:number, po?:number, bx?:Rect,
 *   c?:{ref:string, f:1|2, s?:number}|{f:1|2, s?:number, parts:RefPtr[]}, a?:{ref:string, s:1|0.5|0.25, f:1|2},
 *   mk?:{ref:string, s:1|0.5|0.25, f:1|2, on?:0, fe?:number}, p?:object, ms?:1}} LayerRec
 * @typedef {{v:1, rev:number, crev:number, dev:number, sv:number, at:number, st:number, nid:number, act:number,
 *   m:{base:object|null, out:object|null, cmp:object|null}, doc:object, L:LayerRec[], route:{s:number[], m:number[], o:number[]},
 *   pins:object[], lines:object[], sr:Object<string,StageRec>, snaps:object[], log:LogEntry[], ev:{t:number,o:1|2|3}[],
 *   done:{at:number,n:number,un:number}|null, sent:{s6a:number,s6b:number,s7x:number}, pr:{mode:1|2,paper:0|4|5,bw:0|1,ppi:number}}} Edit
 * @typedef {{v:1, b:{t:number, x?:1, q:RefPtr[]}[]}} Trash
 */

export const FOLIO_V = 1;
export const KEYS = { steps: "s6f.steps", notes: "s6f.notes", edit: "s6f.edit", trash: "s6f.trash" };
export const ROUNDS = ["ra", "rb", "rc"];
export const LINES = ["pa", "pb", "pc", "pd", "pe", "pf"];
/** ih bits (rounds 2–3: field set in this round). cp uses the same bits plus jd and nx (CP). */
export const IH = { pa: 1, pb: 2, pc: 4, pd: 8, pe: 16, pf: 32, po: 64, tool: 128, aim: 256 };
/** cp bits: cells filled by copying (round-1 seed, 5차시 import) and not edited since (§2.2). */
export const CP = { ...IH, jd: 512, nx: 1024 };

/** first-input time slots of a round (index = position in Round.ti) */
export const TI_ROUND = ["aim", "exp", "tool", "pa", "pb", "pc", "pd", "pe", "pf", "po", "im", "ck", "seen", "un", "jd", "cz", "pw", "nr", "nx", "sk"];
/** first-input time slots of the reflection (index = position in Reflect.ti) */
export const TI_REFLECT = ["near", "look", "dPr", "dAi", "dHand", "big", "use", "drift", "stuck", "baseWhy"];
/** notes fields that record a first-input time in Notes.ti */
export const TI_NOTES = ["stCheck", "stPatch", "stCrop", "stTone", "stFix", "stMark", "stFinal", "aiPrompt", "rf", "phScope", "phMaking", "calWhat"];

/* ---------- 바이트 상한 (spec §2.6). 값은 JSON 문자열 바이트에서 따옴표 2개를 뺀 수 (clipJson) ---------- */
export const ROUND_CAP = { aim: 240, exp: 240, tool: 120, seen: 300, un: 180, jd: 300, nx: 270, nw: 180, sk: 120 };
export const PROMPT_POOL = 1560;   // pa…pf and po share one pool per round
export const REFLECT_CAP = { look: 270, dPr: 210, dAi: 210, dHand: 210, big: 270, use: 210, drift: 240, stuck: 180, baseWhy: 150 };
export const NOTE_CAP = {
  stCheck: 270, stPatch: 270, stCrop: 270, stTone: 270, stFix: 270, stMark: 270, stFinal: 450,
  kpStructure: 120, kpCause: 120, kpLight: 120, kpScale: 120, kpText: 120, kpLabel: 120, kpMisread: 120, kpExhibit: 120,
  aiTool: 120, aiRegion: 120, aiPrompt: 270, rf: 210, calWhat: 60, phScope: 540, phMaking: 540,
};
export const BUDGET = { steps: 15744, notes: 5568, edit: 8704, trash: 2752, total: 32768, target: 16384 };
export const LIMITS = {
  imgPerRound: 4, old: 4, trashSoft: 24, trashMax: 64, trashBatches: 12, pins: 8, lines: 4, snaps: 7,
  log: 24, ev: 8, txtChars: 60, txtBytes: 180, tagChars: 20, nmChars: 6, curvePts: 16, hsRanges: 5, tiledPlanes: 2,
  editStruct: 8128, hp: 999, tiMax: 999999,
  zones: { ai: 2, px: 3, tr: 1, db: 1, adjflt: 6, mark: 4, txt: 2 },
  histBytes: { desk: 120e6, touch: 40e6, phone: 24e6 }, histStates: { desk: 60, touch: 30, phone: 20 },
  canvasBytes: { touch: 160e6, desk: 400e6 }, proxyMax: { desk: 1280, touch: 1024, phone: 768 }, patchPxTouch: 2048,
  // additions (contract-log): counters stored in StageRec.n, LogEntry.n, done.n/un are clamped here
  stageN: 999, logN: 999, doneN: 999, tries: 20,
};

/* ---------- 과정과 점검 항목 ---------- */
export const STAGES = ["check", "patch", "crop", "tone", "fix", "mark", "final"];   // index = stage code
export const STAGE_NOTE = { check: "stCheck", patch: "stPatch", crop: "stCrop", tone: "stTone", fix: "stFix", mark: "stMark", final: "stFinal" };
export const STAGE_FEAT = { patch: "patch", fix: "fix" };   // stages hidden when that flag is off
export const ITEMS = ["structure", "cause", "light", "scale", "text", "label", "misread", "exhibit"];
export const KP = { structure: "kpStructure", cause: "kpCause", light: "kpLight", scale: "kpScale", text: "kpText", label: "kpLabel", misread: "kpMisread", exhibit: "kpExhibit" };
export const METHOD = { none: 0, regen: 1, patch: 2, screen: 3, hand: 4, caption: 5, keep: 6 };   // labels: METHOD_LABEL (text module)
export const HM = { none: 0, patch: 1, screen: 2, hand: 3, keep: 4 };        // round 3 다듬기에서 고칠 방법
export const UK = { none: 0, nothing: 1, keep: 2, drop: 3 };                // 시키지 않았는데 나온 것
export const EL = { none: 0, after: 1, locked: 2 };
export const ROUTE = { 1: [], 2: ["patch"], 3: ["crop", "tone"], 4: ["fix"], 5: [], 6: [] };
export const ROUTE_ITEM = { scale: { 3: ["mark"] }, misread: { 3: ["crop"] }, light: { 3: ["tone"] } };
export const HM_ROUTE = { 1: ["patch"], 2: ["crop", "tone"], 3: ["fix"], 4: [] };

/* ---------- 레이어 종류 ---------- */
export const KINDS = ["ai", "px", "tr", "db", "adj", "flt", "txt", "ov"];      // LayerRec.k = index
export const TCODE = {
  px: ["spot", "clone", "heal", "sponge", "bsb", "shb"],
  adj: ["bc", "lv", "cv", "ex", "hs", "vb", "cb", "pf", "gp", "bw"],
  flt: ["usm", "gb", "nz", "vg", "shd"],
  ov: ["sb", "gs", "cc", "tg"],
};    // LayerRec.t = index
export const T_RANK = { spot: 0, sponge: 1, shb: 1, bsb: 2, clone: 3, heal: 3 };   // mergeDown keeps the higher rank
export const ZONE = { ai: 1, px: 2, tr: 3, db: 4, adj: 5, flt: 5, txt: 6, ov: 6 };

/* ---------- 매개변수 규칙 PSPEC (spec §2.4) ----------
   PSPEC[kind][t] = { keys, opt, bound }. Kinds without TCODE (ai, tr, txt) use t "_"; px and db have no parameters ("_").
   A key spec is one of
     {min, max}                       integer in range
     {enum:[...]}                     one of the listed integers
     "rgb"                            [r, g, b], integers 0..255
     "pts"                            flat curve points [x0,y0,x1,y1,…], integers 0..255, 2–14 points, x strictly increasing,
                                      x0 = 0 and the last x = 255 (end points move vertically only; contract-log)
     {tup:[{min,max}, …]}             fixed-length integer tuple
     {flat:{min,max}, max, even}      flat integer list of length 2..max (even length when even)
     {str:{chars, lines, bytes}}      string, ≤ chars characters, ≤ lines lines, utf8Len(JSON.stringify(s)) − 2 ≤ bytes
   opt lists the keys that may be absent; every other key is required. bound = max jsonBytes(p). */
const I = (min, max) => ({ min, max });
const PERMILLE = I(0, 1000);
const SEED = I(0, 2147483647);
const HS3 = { tup: [I(-180, 180), I(-100, 100), I(-100, 100)] };
const CB3 = { tup: [I(-100, 100), I(-100, 100), I(-100, 100)] };
const LV5 = { tup: [I(0, 253), I(10, 999), I(2, 255), I(0, 255), I(0, 255)] };
const GP3 = { flat: I(0, 255), max: 6, even: true };
export const PSPEC = {
  ai: { _: { keys: { dx: I(-999, 999), dy: I(-999, 999), sc: I(970, 1030), gn: I(0, 100), sd: SEED }, opt: ["dx", "dy", "sc", "gn", "sd"], bound: 60 } },
  px: { _: { keys: {}, opt: [], bound: 0 } },
  tr: { _: { keys: { pr: I(1, 4) }, opt: [], bound: 10 } },
  db: { _: { keys: {}, opt: [], bound: 0 } },
  adj: {
    bc: { keys: { b: I(-150, 150), c: I(-50, 100), lg: I(0, 1) }, opt: ["b", "c", "lg"], bound: 30 },
    lv: { keys: { l: LV5, r: LV5, g: LV5, b: LV5 }, opt: ["l", "r", "g", "b"], bound: 106 },
    // 16 points with three-digit values in two or more channels reach 144–152 B, so the 140 B bound (not the point count) is
    // the binding limit there; CurvesWidget checks pOk before committing a point (contract-log)
    cv: { keys: { md: I(0, 1), l: "pts", r: "pts", g: "pts", b: "pts" }, opt: ["md", "l", "r", "g", "b"], bound: 140 },
    ex: { keys: { e: I(-500, 500), o: I(-500, 500), g: I(10, 999) }, opt: ["e", "o", "g"], bound: 32 },
    hs: { keys: { a: HS3, r: HS3, y: HS3, g: HS3, c: HS3, b: HS3, m: HS3, cz: { tup: [I(0, 360), I(0, 100), I(-100, 100)] } },
          opt: ["a", "r", "y", "g", "c", "b", "m", "cz"], bound: 140 },
    vb: { keys: { v: I(-100, 100), s: I(-100, 100) }, opt: ["v", "s"], bound: 20 },
    cb: { keys: { s: CB3, m: CB3, h: CB3, pl: I(0, 1) }, opt: ["s", "m", "h", "pl"], bound: 75 },
    pf: { keys: { c: "rgb", d: I(0, 100), pl: I(0, 1) }, opt: ["c", "d", "pl"], bound: 40 },
    gp: { keys: { r: GP3, g: GP3, b: GP3, tg: { enum: [0, 118] }, k: I(0, 100), x: PERMILLE, y: PERMILLE },
          opt: ["r", "g", "b", "tg", "k", "x", "y"], bound: 120 },
    bw: { keys: { w: { tup: [I(-200, 300), I(-200, 300), I(-200, 300), I(-200, 300), I(-200, 300), I(-200, 300)] }, tn: { tup: [I(0, 360), I(0, 100)] } },
          opt: ["w", "tn"], bound: 55 },
  },
  flt: {
    usm: { keys: { a: I(0, 300), r: I(3, 50), th: I(0, 20) }, opt: ["a", "r", "th"], bound: 28 },
    gb: { keys: { r: I(3, 200) }, opt: ["r"], bound: 10 },
    nz: { keys: { a: I(0, 200), gs: I(1, 3), mo: I(0, 1), sd: SEED }, opt: ["a", "gs", "mo", "sd"], bound: 45 },
    vg: { keys: { a: I(-100, 100), m: I(0, 100) }, opt: ["a", "m"], bound: 18 },
    shd: { keys: { sa: I(0, 100), ha: I(0, 100), r: I(5, 200) }, opt: ["sa", "ha", "r"], bound: 27 },   // spec 25 < widest 27 (contract-log)
  },
  txt: { _: { keys: { s: { str: { chars: 60, lines: 3, bytes: 180 } }, fn: I(0, 1), sz: I(20, 120), c: "rgb", wt: I(0, 1), al: I(0, 2), x: PERMILLE, y: PERMILLE },
              opt: ["fn", "sz", "c", "wt", "al", "x", "y"], bound: 254 } },
  ov: {
    sb: { keys: { cm: I(1, 1000), sg: I(0, 9), mm: I(0, 1), o: I(0, 1), x: PERMILLE, y: PERMILLE, hg: I(0, 100), lb: I(0, 1), ps: I(0, 3), au: I(0, 1) },
          opt: ["cm", "sg", "mm", "o", "x", "y", "hg", "lb", "ps", "au"], bound: 79 },   // spec 70 < widest 79 (contract-log)
    gs: { keys: { x: PERMILLE, y: PERMILLE, o: I(0, 1), ps: I(0, 3) }, opt: ["x", "y", "o", "ps"], bound: 32 },
    cc: { keys: { x: PERMILLE, y: PERMILLE, o: I(0, 1), ps: I(0, 3) }, opt: ["x", "y", "o", "ps"], bound: 32 },
    tg: { keys: { s: { str: { chars: 20, lines: 1, bytes: 60 } }, x: PERMILLE, y: PERMILLE, sz: I(20, 120) }, opt: ["x", "y", "sz"], bound: 95 },
  },
};

const utf8 = (s) => { let n = 0; for (const ch of String(s)) { const c = ch.codePointAt(0); n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; } return n; };
const isInt = (x) => typeof x === "number" && Number.isInteger(x);
const inR = (x, r) => isInt(x) && x >= r.min && x <= r.max;
const isPlain = (o) => !!o && typeof o === "object" && !Array.isArray(o) && Object.getPrototypeOf(o) === Object.prototype;

/** kind and t as names: k may be a KINDS index or name, t a TCODE index or name ("_" or absent for kinds without TCODE). */
export function specOf(k, t) {
  const kind = typeof k === "number" ? KINDS[k] : k;
  const byKind = kind && PSPEC[kind];
  if (!byKind) return null;
  const codes = TCODE[kind];
  if (!codes) return byKind._ || null;
  const name = typeof t === "number" ? codes[t] : t == null ? codes[0] : t;
  return byKind[name] || byKind._ || null;   // px: one shared empty spec for every t
}

function valOk(spec, v) {
  if (spec === "rgb") return Array.isArray(v) && v.length === 3 && v.every((x) => inR(x, { min: 0, max: 255 }));
  if (spec === "pts") {
    if (!Array.isArray(v) || v.length < 4 || v.length > 28 || v.length % 2) return false;
    if (!v.every((x) => inR(x, { min: 0, max: 255 }))) return false;
    for (let i = 2; i < v.length; i += 2) if (v[i] <= v[i - 2]) return false;
    return v[0] === 0 && v[v.length - 2] === 255;
  }
  if (spec.enum) return spec.enum.includes(v);
  if (spec.tup) return Array.isArray(v) && v.length === spec.tup.length && v.every((x, i) => inR(x, spec.tup[i]));
  if (spec.flat) {
    if (!Array.isArray(v) || v.length < 2 || v.length > spec.max || (spec.even && v.length % 2)) return false;
    if (!v.every((x) => inR(x, spec.flat))) return false;
    if (spec.even) for (let i = 2; i < v.length; i += 2) if (v[i] <= v[i - 2]) return false;
    return true;
  }
  if (spec.str) {
    if (typeof v !== "string") return false;
    if ([...v].length > spec.str.chars) return false;
    if (v.split("\n").length > spec.str.lines) return false;
    return utf8(JSON.stringify(v)) - 2 <= spec.str.bytes;
  }
  return inR(v, spec);
}

/** @returns {boolean} p matches PSPEC (keys, integer ranges, list rules, byte bound). k: KINDS index or name; t: TCODE index or name.
 *  p absent (null/undefined) is valid when the spec has no required key. */
export function pOk(k, t, p) {
  const sp = specOf(k, t);
  if (!sp) return false;
  const req = Object.keys(sp.keys).filter((x) => !sp.opt.includes(x));
  if (p == null) return req.length === 0;
  if (!isPlain(p)) return false;
  const ks = Object.keys(p);
  if (ks.length === 0) return req.length === 0;
  for (const x of req) if (!(x in p)) return false;
  for (const x of ks) { const s = sp.keys[x]; if (!s || !valOk(s, p[x])) return false; }
  const kind = typeof k === "number" ? KINDS[k] : k;
  const tn = TCODE[kind] ? (typeof t === "number" ? TCODE[kind][t] : t) : "_";
  if (kind === "adj" && tn === "cv") {
    let n = 0;
    for (const ch of ["l", "r", "g", "b"]) if (p[ch]) n += p[ch].length / 2;
    if (n > LIMITS.curvePts) return false;
  }
  if (kind === "adj" && tn === "hs") {
    if (["a", "r", "y", "g", "c", "b", "m"].filter((x) => x in p).length > LIMITS.hsRanges) return false;
  }
  return utf8(JSON.stringify(p)) <= sp.bound;
}

/* ---------- 조정·효과의 계산 방식 (spec §4.8, §4.9) ----------
   lut1: separable per-channel 1D LUT; lut3: non-separable, 3D LUT while dragging and exact on commit; px: per pixel always */
export const ADJ = {
  bc: { kind: "lut1", primary: true }, lv: { kind: "lut1", primary: true }, cv: { kind: "lut1", primary: false },
  ex: { kind: "lut1", primary: false }, hs: { kind: "lut3", primary: true }, vb: { kind: "lut3", primary: false },
  cb: { kind: "lut3", primary: false }, pf: { kind: "lut3", primary: false }, gp: { kind: "lut1", primary: true },
  bw: { kind: "px", primary: true },
};
/** margin(p): px a spatial filter reads beyond the rect it writes (3σ for blur and sharpen; r is px × 10 for usm/gb, px for shd) */
export const FLT = {
  usm: { margin: (p) => Math.ceil((3 * ((p && p.r) || 10)) / 10) + 1, primary: true },
  gb: { margin: (p) => Math.ceil((3 * ((p && p.r) || 20)) / 10) + 1, primary: true },
  nz: { margin: () => 0, primary: true },
  vg: { margin: () => 0, primary: true },
  shd: { margin: (p) => Math.ceil(3 * ((p && p.r) || 30)) + 1, primary: false },
};
export const BLENDS = ["source-over", "darken", "multiply", "color-burn", "lighten", "screen", "color-dodge", "lighter", "overlay",
  "soft-light", "hard-light", "difference", "exclusion", "hue", "saturation", "color", "luminosity"];

/* ---------- 작업 표 (spec §7.2) ---------- */
export const WPP = { ok: 0, exc: 1, del: 2, add: 3, move: 4, flip: 5, warp: 6, alter: 7, gen: 8, na: 9 };
const op = (st, lv, w, dyn) => (dyn ? { st, lv, w, dyn: true } : { st, lv, w });
/** { [op]: { st, lv, w, dyn? } }. st null: the op is logged under the stage of the command that made it (mask, erase).
 *  dyn: classifyOp decides level and class from the layer record (§7.2 dynamic rules). */
export const OPS = {
  crop: op("crop", 1, WPP.ok), strt: op("crop", 1, WPP.ok), rot: op("crop", 1, WPP.ok), ext: op("crop", 4, WPP.add),
  bc: op("tone", 2, WPP.ok), lv: op("tone", 2, WPP.ok), cv: op("tone", 2, WPP.ok), ex: op("tone", 2, WPP.ok),
  hs: op("tone", 2, WPP.ok), vb: op("tone", 2, WPP.ok), cb: op("tone", 2, WPP.ok), pf: op("tone", 2, WPP.ok),
  gp: op("tone", 2, WPP.ok), bw: op("tone", 2, WPP.ok), usm: op("tone", 2, WPP.ok),
  gb: op("tone", 2, WPP.ok, true), nz: op("tone", 2, WPP.ok, true), vg: op("tone", 2, WPP.ok), shd: op("tone", 2, WPP.ok),
  spot: op("fix", 4, WPP.exc, true), heal: op("fix", 4, WPP.del), clone: op("fix", 4, WPP.del),
  dodge: op("fix", 2, WPP.ok, true), sponge: op("fix", 2, WPP.ok, true), bsb: op("fix", 4, WPP.del), shb: op("fix", 2, WPP.ok),
  trace: op("fix", 4, WPP.add),
  patch: op("patch", 5, WPP.gen),
  sb: op("mark", 4, WPP.add), gs: op("mark", 4, WPP.add), cc: op("mark", 4, WPP.add), tg: op("mark", 4, WPP.add), txt: op("mark", 4, WPP.add),
  align: op("patch", 0, WPP.na), mask: op(null, 0, WPP.na), erase: op(null, 0, WPP.na),
  route: op("check", 0, WPP.na), pin: op("check", 0, WPP.na), light: op("check", 0, WPP.na), measure: op("mark", 0, WPP.na),
  out: op("final", 0, WPP.na),
};
export const EV = { done: 1, unlock: 2, rebase: 3 };

/* ---------- 기능 깃발 (spec §10.3). 깃발은 반드시 feat()로 읽는다 ---------- */
// 검토 1회차 결정(main, 2026-10-01): 수업에는 모두 켠다 (contract-log U24)
export const FEATURES = { editor: true, patch: true, fix: true, all: true, trace: true, tag: true };
/** (globalThis.__PHX_TEST__?.features ?? {})[name] ?? FEATURES[name]; the only way flags are read */
export function feat(name) {
  const t = globalThis.__PHX_TEST__;
  const o = (t && t.features) || {};
  return o[name] ?? FEATURES[name];
}
export const CLASS_DEFAULTS = { bgSpread: 6, ppi: 240 };
export const GRACE_MS = 1800000;
/** globalThis.__PHX_TEST__?.graceMs ?? GRACE_MS */
export function graceMs() {
  const t = globalThis.__PHX_TEST__;
  return (t && t.graceMs) ?? GRACE_MS;
}

/* ---------- 업로드 규정 (spec §3.4, §6.1) ----------
   PRESETS hold the four numeric fields of src-media-img.js presets. The fifth field, name, is a student-facing word, so it lives in
   the text module: always call prepareImage(file, imgPreset(k)) (src-portfolio-text.mjs), never prepareImage(file, PRESETS[k]). */
export const PRESETS = {
  full: { maxPx: 1600, maxChars: 900000, minLong: 512, minShort: 256 },    // first image of a round (chosen)
  cand: { maxPx: 1200, maxChars: 400000, minLong: 480, minShort: 240 },    // images 2–4 of a round
  patch: { maxPx: 1600, maxChars: 900000, minLong: 512, minShort: 256 },   // editor, 부분 수정
};
export const THUMB = { px: 480, q: 0.8 };
export const SNAP = { px: 800, q: 0.8 }, OUT = { px: 2000, maxChars: 950000 }, CMP = { px: 1600, maxChars: 900000 };
export const SEND = { s6a: { px: 1600, maxChars: 600000, textMax: 300 }, s7x: { px: 2000, maxChars: 950000, minLong: 1000, minShort: 500 } };   // minShort: K31
export const MEDIA_RE = /^data:image\/(jpeg|png);base64,/;
export const MEDIA_MAX = 950000;

/* ---------- ref와 시각 도장 (spec §2.7) ---------- */
const REF_RE = /^[A-Za-z0-9.]{1,60}$/;
/** @returns {string} ms.toString(36) (8 chars until 2059) */
export function stamp36(ms = Date.now()) {
  return Math.max(0, Math.floor(Number(ms) || 0)).toString(36);
}
/** @returns {string} "{key}.{role}.{stamp}[.{part}]"; throws unless /^[A-Za-z0-9.]{1,60}$/ */
export function mkRef(key, role, stamp, part) {
  const parts = [key, role, stamp];
  if (part != null && part !== "") parts.push(part);
  const ref = parts.map(String).join(".");
  if (!REF_RE.test(ref) || parts.some((x) => String(x) === "")) throw new Error("mkRef: invalid ref " + JSON.stringify(ref));
  return ref;
}
/** @returns {number} ms of a ref's stamp (base-36, or 13 digits for sends), 0 if none */
export function stampOf(ref) {
  if (typeof ref !== "string") return 0;
  const seg = ref.split(".");
  for (let i = seg.length - 1; i >= 0; i--) if (/^\d{13}$/.test(seg[i])) return Number(seg[i]);
  if (seg[0] === "s6f" && seg.length >= 4 && /^[0-9a-z]{6,9}$/.test(seg[3])) {
    const n = parseInt(seg[3], 36);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}
/** @returns {boolean} /^s6f\.(steps|edit)\.[A-Za-z0-9.]+$/ */
export function isFolioRef(ref) {
  return typeof ref === "string" && /^s6f\.(steps|edit)\.[A-Za-z0-9.]+$/.test(ref);
}
/** @returns {number} ms = 15000 + ceil(chars / 40) */
export function uploadTimeout(chars) {
  return 15000 + Math.ceil((Number(chars) || 0) / 40);
}
