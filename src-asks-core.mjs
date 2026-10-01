/* ============================================================
   생각해 볼 질문: 답 저장 키·고친 흔적·질문 찾아 잇기 (2026-10-01)
   ------------------------------------------------------------
   강의 노트 읽기 자료마다 있는 「생각해 볼 질문」(rd.asks)에 학생이 골라서 답을 쓴다(선택 활동).
   답은 기록지 문서(worksheets/{학번}) 안에 저장한다. 그래야 칸 단위 저장, 다른 기기 기록 받기,
   1시간 시점 사본, 매일 백업, 입력 잠금, 붙여넣기 기록이 새로 만들지 않아도 그대로 적용된다.

     ask{차시}.{지문}   답 (문자열, ASK_MAX자까지)
                        지문 = 질문 문장(표시 기호를 뺀 것)의 FNV-1a 32비트 해시, 36진수 7자리
     _askMeta[답 키]    { q 처음 답할 때 본 질문 문장, ql 그 뒤 바뀐 질문 문장(있을 때만),
                          first 처음 입력 시각, last 마지막 입력 시각, n 입력 횟수 }
     _askRev[답 키]     [{ at, prev 고치기 전의 글, why }]  고친 흔적
                        why "cut": 한 번에 9자 넘게 지우거나 바꿈(기록지 _log와 같은 기준, 같은 답은 2분에 한 번)
                        why "resume": 5분 넘게 두었던 답을 다시 고치기 시작함(그 앞까지의 글이 한 판이 된다)
     _askPruned         흔적 상한으로 덜어 낸 건수 (0이 아니면 그 학생의 답 흔적은 완전하지 않다)

   _askMeta·_askRev는 저장 계층(src-ws-sync.mjs MAP_KEYS)이 답 키 단위로 저장하고 합친다.
   답 하나를 고쳐도 그 답의 항목만 보내므로, 다른 탭·기기에서 쓴 다른 답의 흔적을 지우지 않는다.

   왜 흔적을 _log에 섞지 않나
     _log는 연구 변수 edit_n(고쳐 쓴 횟수)·rewrite_*의 원자료이고 300건 상한을 함께 쓴다.
     선택 활동인 질문 답이 섞이면 이미 모은 자료와 변수의 뜻이 달라지고, 상한에 밀려 본 과제의 흔적이 빠진다.

   왜 질문 순서가 아니라 질문 문장으로 찾나
     교사가 「수업 편집」에서 읽기 자료와 질문의 순서를 바꾸거나 지울 수 있다. 순서로 찾으면
     답이 다른 질문 밑에 소리 없이 붙는다. 문장이 다듬어지면(윤문) 지문이 달라지므로,
     지문이 맞는 답이 없을 때는 같은 차시 안에서 _askMeta에 저장한 질문 문장이 가장 비슷한 답을
     찾아 잇는다(글자 2-gram 다이스 계수 FUZZY_MIN 이상, 한 답은 한 질문에만).
     그래도 이어지지 않는 답은 「질문이 바뀌기 전에 쓴 답」으로 읽기 전용으로 보인다. 지우지 않는다.

   이 파일은 순수 함수만 둔다 (React·Firebase 없음). 테스트: src-asks-core.test.mjs
   ============================================================ */

export const ASK_MAX = 500;            // 답 한 개의 글자 상한
export const REV_PER_ANSWER = 20;      // 답 하나에 남기는 흔적 수
export const REV_BYTES = 120000;       // 모든 답의 흔적을 합친 상한 (UTF-8 바이트)
export const CUT_GAP_MS = 120000;      // "cut" 흔적은 같은 답에서 2분에 한 번 (기록지 _log와 같음)
export const RESUME_MS = 300000;       // 5분 넘게 두었다가 다시 고치면 "resume"
export const FUZZY_MIN = 0.6;          // 바뀐 질문 문장을 같은 질문으로 볼 최소 유사도

const isObj = (x) => !!x && typeof x === "object" && !Array.isArray(x);

export function utf8Len(s) {
  let n = 0;
  const t = String(s);
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xD800 && c <= 0xDBFF) { n += 4; i++; }
    else n += 3;
  }
  return n;
}
const jsonBytes = (x) => { try { return utf8Len(JSON.stringify(x)); } catch (e) { return 0; } };

/* 질문 문장: 강의 노트 표시 기호(**강조**, [글자](주소))를 벗기고 공백을 하나로 */
export function normQ(s) {
  return String(s || "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\((?:https?:\/\/|\/)[^)\s]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/* 질문 지문 (FNV-1a 32비트 → 36진수 7자리) */
export function askHash(q) {
  const s = normQ(q);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36).padStart(7, "0");
}

export const askKey = (n, q) => "ask" + n + "." + askHash(q);
const KEY_RE = /^ask(\d+)\.([0-9a-z]{7})$/;
export const isAskKey = (k) => KEY_RE.test(String(k));
export function askLessonOf(k) {
  const m = KEY_RE.exec(String(k));
  return m ? Number(m[1]) : null;
}

/* ---------- 글 비교 (src-app.jsx의 normText·gramSet·jaccard와 같은 정의) ---------- */
const normText = (s) => String(s || "").toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, " ").replace(/\s+/g, " ").trim();
export function gramSet(s, n) {
  const N = n || 3;
  const t = normText(s).replace(/ /g, "");
  const out = new Set();
  if (!t) return out;
  if (t.length <= N) { out.add(t); return out; }
  for (let i = 0; i + N <= t.length; i++) out.add(t.slice(i, i + N));
  return out;
}
export function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const w of a) if (b.has(w)) inter++;
  return inter / (a.size + b.size - inter);
}
/* 질문 문장끼리의 유사도: 글자 2-gram 다이스 계수 (질문은 짧아 3-gram보다 안정적이다) */
export function qSim(a, b) {
  const x = gramSet(a, 2), y = gramSet(b, 2);
  if (!x.size || !y.size) return 0;
  let inter = 0;
  for (const g of x) if (y.has(g)) inter++;
  return (2 * inter) / (x.size + y.size);
}

/* ---------- 지금 화면에 보이는 질문 문장 ----------
   학생 화면이 질문 상자를 그릴 때 답 키 → 지금 질문 문장을 적어 둔다.
   setField 안의 askTrace가 이것을 읽어 _askMeta에 질문 사본을 남긴다 (setField는 키와 값만 받으므로). */
const Q_NOW = new Map();
export function rememberQ(k, q) { if (k && q) Q_NOW.set(k, normQ(q)); }
export function forgetQs() { Q_NOW.clear(); }

/* ---------- 차시의 질문 목록 ---------- */
export function lessonAsks(L) {
  const out = [];
  if (!L) return out;
  (Array.isArray(L.readings) ? L.readings : []).forEach((rd, ri) => {
    (Array.isArray(rd && rd.asks) ? rd.asks : []).forEach((a, qi) => {
      const q = normQ(a);
      if (!q) return;
      out.push({ n: L.n, session: L.session || "", ri, qi, stage: (rd && rd.stage) || "", h: (rd && rd.h) || "", q, key: askKey(L.n, q) });
    });
  });
  return out;
}

/* 지금 질문 목록과 기록지에 저장된 답을 잇는다.
   돌려주는 값: { slots, orphans }
     slots[i] = lessonAsks의 항목 + { ansKey 이 질문의 답을 읽고 쓸 키, how "same"|"moved"|"none", sim }
       same  지문이 같은 답이 있다
       moved 질문 문장이 바뀌어 지문은 다르지만, 저장해 둔 질문 문장이 가장 비슷한 답을 이었다
       none  아직 답이 없다 (ansKey는 지금 문장의 지문)
     orphans = 어느 질문에도 잇지 못한 답 [{ key, q, a }] (글이 있는 것만) */
export function resolveAsks(L, ws) {
  const d = ws || {};
  const meta = isObj(d._askMeta) ? d._askMeta : {};
  const has = (k) => k in d || k in meta;
  const slots = lessonAsks(L).map((s) => ({ ...s, ansKey: s.key, how: has(s.key) ? "same" : "none", sim: null }));
  if (!L) return { slots, orphans: [] };
  const taken = new Set(slots.filter((s) => s.how === "same").map((s) => s.key));
  const prefix = "ask" + L.n + ".";
  const pool = new Set();
  for (const k of Object.keys(d)) if (k.startsWith(prefix) && isAskKey(k) && !taken.has(k)) pool.add(k);
  for (const k of Object.keys(meta)) if (k.startsWith(prefix) && isAskKey(k) && !taken.has(k)) pool.add(k);
  const qOf = (k) => (isObj(meta[k]) ? (meta[k].ql || meta[k].q || "") : "");
  const pairs = [];
  for (const k of pool) {
    const oq = qOf(k);
    if (!oq) continue;
    slots.forEach((s, i) => {
      if (s.how !== "none") return;
      const sim = qSim(oq, s.q);
      if (sim >= FUZZY_MIN) pairs.push({ k, i, sim });
    });
  }
  // 가장 비슷한 짝부터 하나씩. 같은 답이나 같은 질문은 두 번 잇지 않는다
  pairs.sort((a, b) => b.sim - a.sim || (a.k < b.k ? -1 : 1));
  const used = new Set();
  for (const p of pairs) {
    const s = slots[p.i];
    if (s.how !== "none" || used.has(p.k)) continue;
    s.ansKey = p.k; s.how = "moved"; s.sim = Math.round(p.sim * 100) / 100;
    used.add(p.k);
  }
  const orphans = [...pool].filter((k) => !used.has(k))
    .map((k) => ({ key: k, q: qOf(k), a: typeof d[k] === "string" ? d[k] : "" }))
    .filter((o) => o.a.trim())
    .sort((a, b) => (a.key < b.key ? -1 : 1));
  return { slots, orphans };
}

/* ---------- 입력 한 번마다 쓰는 장부 ----------
   setField 안에서 부른다. p는 고치기 전 기록지, val은 새 답.
   돌려주는 조각: { _askMeta, _askRev?, _askPruned? } (setField가 next에 덧붙인다) */
export function askTrace(p, k, val, at) {
  const d = p || {};
  const prevRaw = typeof d[k] === "string" ? d[k] : "";
  const cur = typeof val === "string" ? val : "";
  const metaAll = isObj(d._askMeta) ? d._askMeta : {};
  const m = isObj(metaAll[k]) ? metaAll[k] : {};
  const qNow = Q_NOW.get(k) || "";
  const q0 = m.q || qNow;
  const nm = { q: q0, first: m.first || at, last: at, n: (m.n || 0) + 1 };
  const ql = qNow && q0 && qNow !== q0 ? qNow : m.ql;
  if (ql) nm.ql = ql;
  const out = { _askMeta: { ...metaAll, [k]: nm } };

  const revAll = isObj(d._askRev) ? d._askRev : {};
  const list = Array.isArray(revAll[k]) ? revAll[k] : [];
  const e = revEntry(prevRaw, cur, m.last, list, at);
  if (e) {
    const capped = capRevs({ ...revAll, [k]: [...list, e] });
    out._askRev = capped.map;
    if (capped.dropped) out._askPruned = (d._askPruned || 0) + capped.dropped;
  }
  return out;
}

/* 고친 흔적 한 건을 남길지. 남기면 { at, prev, why } */
export function revEntry(prevRaw, cur, lastInput, list, at) {
  const prev = String(prevRaw || "").trim();
  const now = String(cur || "").trim();
  if (prev.length <= 15 || prev === now) return null;
  const t = Date.parse(at);
  const lastIn = Date.parse(lastInput || "");
  const resume = Number.isFinite(t) && Number.isFinite(lastIn) && t - lastIn >= RESUME_MS;
  const L = Array.isArray(list) ? list : [];
  const last = L.length ? L[L.length - 1] : null;
  const lastAt = last ? Date.parse(last.at) : NaN;
  const gapOk = !Number.isFinite(lastAt) || !Number.isFinite(t) || t - lastAt > CUT_GAP_MS;
  const cut = Math.abs(now.length - prev.length) > 8 || (now.length > 15 && jaccard(gramSet(prev), gramSet(now)) < 0.6);
  if (!resume && !(cut && gapOk)) return null;
  const keep = prev.slice(0, ASK_MAX);
  if (last && last.prev === keep) return null; // 같은 글을 두 번 남기지 않는다
  return { at, prev: keep, why: resume ? "resume" : "cut" };
}

/* 흔적 상한: 답 하나에 REV_PER_ANSWER건, 모두 합쳐 REV_BYTES. 넘으면 가장 오래된 흔적부터 덜어 낸다.
   바꾸지 않은 답의 배열은 같은 참조로 둔다 (저장 계층이 바뀐 답 항목만 보내도록) */
export function capRevs(map) {
  const out = { ...(map || {}) };
  let dropped = 0;
  for (const k of Object.keys(out)) {
    const L = out[k];
    if (Array.isArray(L) && L.length > REV_PER_ANSWER) { dropped += L.length - REV_PER_ANSWER; out[k] = L.slice(-REV_PER_ANSWER); }
  }
  let bytes = jsonBytes(out);
  while (bytes > REV_BYTES) {
    let oldK = null, oldAt = "";
    for (const k of Object.keys(out)) {
      const L = out[k];
      if (!Array.isArray(L) || !L.length) continue;
      const a = String((L[0] && L[0].at) || "");
      if (oldK === null || a < oldAt) { oldK = k; oldAt = a; }
    }
    if (oldK === null) break;
    bytes -= jsonBytes(out[oldK][0]) + 1;
    out[oldK] = out[oldK].slice(1);
    if (!out[oldK].length) delete out[oldK];
    dropped++;
  }
  return { map: out, dropped };
}

/* ---------- 교사 화면·연구 자료 ---------- */

/* 붙여넣기 기록 가운데 질문 답에 붙인 것 */
export function askPastes(ws, key) {
  const ps = Array.isArray((ws || {})._paste) ? ws._paste : [];
  return ps.filter((e) => e && e.k && isAskKey(String(e.k).split("#")[0]) && (!key || String(e.k).split("#")[0] === key));
}

/* 한 학생의 요약 */
export function askStats(ws) {
  const d = ws || {};
  const keys = Object.keys(d).filter(isAskKey);
  const answered = keys.filter((k) => typeof d[k] === "string" && d[k].trim());
  const meta = isObj(d._askMeta) ? d._askMeta : {};
  const rev = isObj(d._askRev) ? d._askRev : {};
  const revKeys = Object.keys(rev).filter((k) => Array.isArray(rev[k]) && rev[k].length);
  const ps = askPastes(d);
  return {
    n: answered.length,
    chars: answered.reduce((a, k) => a + d[k].trim().length, 0),
    lessons: new Set(answered.map(askLessonOf)).size,
    inputN: answered.reduce((a, k) => a + ((isObj(meta[k]) && meta[k].n) || 0), 0),
    revN: revKeys.reduce((a, k) => a + rev[k].length, 0),
    revAnsN: revKeys.length,
    pasteN: ps.length,
    pasteChars: ps.reduce((a, e) => a + (e.n || 0), 0),
    pruned: d._askPruned || 0,
  };
}

/* 한 학생의 답 목록 (교사 화면·내려받기). 지금 질문 순서대로, 잇지 못한 답은 그 차시 끝에.
   글이 없어도 흔적이 있으면 넣는다 (다 지운 답도 연구 자료다) */
export function askAnswerRows(ws, lessons) {
  const d = ws || {};
  const meta = isObj(d._askMeta) ? d._askMeta : {};
  const rev = isObj(d._askRev) ? d._askRev : {};
  const rows = [];
  const seen = new Set();
  const row = (L, k, s, how, q) => {
    const a = typeof d[k] === "string" ? d[k] : "";
    const revs = Array.isArray(rev[k]) ? rev[k] : [];
    if (!a.trim() && !revs.length) return;
    seen.add(k);
    const m = isObj(meta[k]) ? meta[k] : {};
    const ps = askPastes(d, k);
    rows.push({
      key: k, n: L ? L.n : askLessonOf(k), session: L ? L.session : "", how,
      ri: s ? s.ri : null, qi: s ? s.qi : null, stage: s ? s.stage : "", h: s ? s.h : "",
      q: q || m.ql || m.q || "", qSeen: m.q || "", a, chars: a.trim().length,
      first: m.first || "", last: m.last || "", inputN: m.n || 0,
      revs, pasteN: ps.length, pasteChars: ps.reduce((x, e) => x + (e.n || 0), 0),
    });
  };
  for (const L of lessons || []) {
    const { slots, orphans } = resolveAsks(L, d);
    for (const s of slots) if (!seen.has(s.ansKey)) row(L, s.ansKey, s, s.how, s.q);
    for (const o of orphans) if (!seen.has(o.key)) row(L, o.key, null, "orphan", o.q);
  }
  // 강의 노트에 없는 차시의 답 (차시를 지운 경우)
  for (const k of Object.keys(d)) if (isAskKey(k) && !seen.has(k)) row(null, k, null, "orphan", "");
  return rows;
}

/* 질문 지문 → 지금 질문 (붙여넣기 표 같은 곳에서 답 키를 사람이 읽는 이름으로) */
const IDX = new WeakMap();
export function askIndex(lessons) {
  if (!lessons || typeof lessons !== "object") return new Map();
  if (IDX.has(lessons)) return IDX.get(lessons);
  const m = new Map();
  for (const L of lessons) for (const s of lessonAsks(L)) if (!m.has(s.key)) m.set(s.key, s);
  IDX.set(lessons, m);
  return m;
}
