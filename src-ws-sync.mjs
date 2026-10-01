/* ============================================================
   기록지 칸 단위 저장과 다른 기기 기록 받기 (2026-09-17)
   ------------------------------------------------------------
   왜 바꿨나
     기록지는 worksheets/{학번} 문서 하나이고, 자동 저장이 문서를 통째로 덮어썼다.
     탭을 둘 열거나(읽기 자료 탭과 기록지 탭) 학교 PC와 집 폰을 오가면, 옛 사본을 든 탭이
     활동 시간 저장(2분 30초마다)이나 한 글자 입력으로 다른 탭이 쓴 내용 전체를 지웠다.
     2026-09-17 4반 기록에서 「활동 시간은 길고 편집 기록은 없는」 그 흔적이 여럿 나왔다.

   어떻게 바꿨나
     ① 저장은 바뀐 키만 updateDoc으로 보낸다 (fbStore.updatePaths). 다른 탭이 쓴 키는 건드리지 않는다.
        키 이름에 점이 있어(l1.q1) FieldPath로 가리킨다. 문서가 아직 없을 때(첫 저장)만 통째로 만든다.
     ② 자기 기록지를 구독해(fbStore.watchDocMeta) 다른 기기가 쓴 값을 화면에 받는다.
        지금 이 탭이 고치는 중이거나 저장 중인 키는 서버 값으로 덮지 않는다.
     ③ 교사가 「기록 되돌리기」로 문서를 통째로 쓰면 학생 화면도 그 내용을 받는다.

   2026-09-28 보강 (전체 점검 결과)
     ④ 보조 맵(_inq 탐구 질문 흔적, _t 섹션 시각 장부, _act 차시별 활동 시간)은 한 키에 여러 칸·차시의
        기록이 들어 있어, 통째로 쓰면 옛 탭이 다른 기기가 쓴 항목을 지웠다. 이 키들은 안쪽 키 단위로
        저장한다: 고친 표시가 "_inq␟q1.concept"처럼 「맵 키 + 구분자 + 안쪽 키」 토큰이 되고,
        저장은 FieldPath("v", "_inq", "q1.concept")로 그 항목만 바꾼다. 안쪽 키에 점이 있어도 한 조각이다.
     ⑤ 흔적 배열(_log 고쳐 쓰기 이력, _paste 붙여넣기)은 항목을 고쳐 쓰는 일(settle·src)이 있어
        arrayUnion으로 덧붙일 수 없다. 대신 저장 직전에 이 탭이 본 마지막 서버 사본과 항목 단위(칸+시각)로
        합친 뒤 통째로 쓴다. 짧은 옛 배열이 긴 서버 배열을 덮지 못한다. 300·200건 상한은 이때 한 번만
        적용하고 덜어 낸 건수를 _pruned에 더한다 (예전에는 소리 없이 버렸다).

   이 파일은 순수 함수만 둔다 (React·Firebase 없음). 테스트: src-ws-sync.test.mjs
   ============================================================ */

/* 안쪽 키 단위로 저장하는 보조 맵 */
export const MAP_KEYS = new Set(["_inq", "_t", "_act"]);
/* 토큰 구분자: 저장 키에 쓰지 않는 제어 문자(단위 구분자). 점은 저장 키 안에 있으므로 쓸 수 없다 */
export const SEP = "\u001f";
export const tok = (k, sub) => k + SEP + sub;
/* 토큰 → [키] 또는 [키, 안쪽 키] */
export function untok(t) {
  const s = String(t);
  const i = s.indexOf(SEP);
  return i < 0 ? [s] : [s.slice(0, i), s.slice(i + 1)];
}

const isObj = (x) => !!x && typeof x === "object" && !Array.isArray(x);

/* 고치는 중(dirty)과 저장 중(inflight)인 키를 따로 센다.
   take(): dirty → inflight (저장 시작)  done(): inflight 비움 (성공)  fail(): inflight → dirty (실패, 다시 저장)
   drop(keys): 더 저장하지 않을 키를 dirty에서 뺀다 (서버에서 제출된 설문 블록처럼) */
export function makeDirtyTracker() {
  const dirty = new Set();
  const inflight = new Set();
  return {
    mark(keys) { for (const k of keys || []) dirty.add(k); },
    take() { const out = [...dirty]; for (const k of out) { inflight.add(k); } dirty.clear(); return out; },
    done() { inflight.clear(); },
    fail() { for (const k of inflight) dirty.add(k); inflight.clear(); },
    drop(keys) { for (const k of keys || []) dirty.delete(k); },
    has(k) { return dirty.has(k) || inflight.has(k); },
    all() { return new Set([...dirty, ...inflight]); },
    clear() { dirty.clear(); inflight.clear(); },
    get size() { return dirty.size; },
  };
}

/* 두 기록지 객체에서 값이 달라진 최상위 키 (참조가 다르면 다른 것으로 본다: setField는 바꾼 키에만 새 값을 넣는다) */
export function changedKeys(before, after) {
  const a = before || {}, b = after || {};
  const out = [];
  for (const k of Object.keys(b)) if (b[k] !== a[k]) out.push(k);
  for (const k of Object.keys(a)) if (!(k in b)) out.push(k);
  return out;
}

/* changedKeys와 같으나 보조 맵(MAP_KEYS)은 바뀐 안쪽 키마다 토큰을 낸다.
   맵이 맵 아닌 값으로 바뀌었거나 통째로 사라졌으면 키 전체를 낸다. */
export function changedTokens(before, after) {
  const a = before || {}, b = after || {};
  const out = [];
  for (const k of changedKeys(a, b)) {
    if (MAP_KEYS.has(k) && isObj(b[k]) && (a[k] === undefined || isObj(a[k]))) {
      const x = a[k] || {}, y = b[k];
      for (const s of Object.keys(y)) if (y[s] !== x[s]) out.push(tok(k, s));
      for (const s of Object.keys(x)) if (!(s in y)) out.push(tok(k, s));
    } else out.push(k);
  }
  return out;
}

/* 내용 비교. 키 순서는 보지 않는다 (서버가 돌려주는 맵은 키가 정렬돼 와서 JSON 문자열 비교로는 늘 달라 보인다) */
export function deepEq(x, y) {
  if (x === y) return true;
  if (x == null || y == null || typeof x !== "object" || typeof y !== "object") return false;
  if (Array.isArray(x) !== Array.isArray(y)) return false;
  if (Array.isArray(x)) {
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) if (!deepEq(x[i], y[i])) return false;
    return true;
  }
  const kx = Object.keys(x), ky = Object.keys(y);
  if (kx.length !== ky.length) return false;
  for (const k of kx) { if (!Object.prototype.hasOwnProperty.call(y, k) || !deepEq(x[k], y[k])) return false; }
  return true;
}

/* 서버 맵에 이 탭이 고치는 중인 안쪽 키만 이 탭의 값으로 얹는다 (이 탭에서 지운 안쪽 키는 지운 채로) */
function mergeMap(lv, rv, dirtySubs) {
  const L = isObj(lv) ? lv : {};
  const m = { ...(isObj(rv) ? rv : {}) };
  for (const s of dirtySubs) { if (s in L) m[s] = L[s]; else delete m[s]; }
  return m;
}

/* 서버 사본을 화면에 합친다. skip에 든 토큰(고치는 중·저장 중)은 이 탭의 값을 지킨다.
   토큰이 키 전체면 그 키를, "맵 키␟안쪽 키"면 그 항목만 지키고 같은 맵의 다른 항목은 서버 값을 받는다.
   바뀐 것이 없으면 같은 객체(local)를 그대로 돌려줘 다시 그리지 않게 하고, 내용이 같은 키는 이 탭의 참조를 유지한다.
   서버에 없는 키는 skip이 아니면 지운다 (교사가 옛 시점으로 되돌렸을 때 그 뒤에 생긴 칸도 함께 사라져야 맞다). */
export function mergeRemote(local, remote, skip) {
  const l = local || {}, r = remote || {};
  const keep = skip || new Set();
  const subs = new Map();
  for (const t of keep) {
    const [k, s] = untok(t);
    if (s === undefined) continue;
    if (!subs.has(k)) subs.set(k, new Set());
    subs.get(k).add(s);
  }
  const out = {};
  let changed = false;
  const take = (k, val) => {
    if (k in l && deepEq(l[k], val)) out[k] = l[k];
    else { out[k] = val; changed = true; }
  };
  for (const k of Object.keys(r)) {
    if (keep.has(k)) { if (k in l) out[k] = l[k]; continue; }
    if (subs.has(k)) { take(k, mergeMap(l[k], r[k], subs.get(k))); continue; }
    take(k, r[k]);
  }
  for (const k of Object.keys(l)) {
    if (k in r) continue;
    if (keep.has(k)) { out[k] = l[k]; continue; }
    if (subs.has(k)) { take(k, mergeMap(l[k], undefined, subs.get(k))); continue; }
    changed = true; // 서버에서 사라진 키
  }
  return changed ? out : l;
}

/* 저장할 항목: 고치던 토큰 + 저장 직전에 바뀐 보조 키(_act·_updatedAt·합친 _log 등).
   돌려주는 값은 fbStore.updatePaths의 entries 모양 [[v 아래 경로 배열, 값], ...].
   값이 undefined인 항목은 지우라는 뜻 (updatePaths가 deleteField로 바꾼다).
   같은 맵의 전체와 안쪽 키를 한 번에 쓰면 Firestore가 거부하므로 전체가 있으면 안쪽 키는 뺀다. */
export function buildEntries(before, data, dirtyList) {
  const d = data || {};
  const toks = new Set(dirtyList || []);
  for (const t of changedTokens(before, d)) toks.add(t);
  const whole = new Set();
  for (const t of toks) { const [k, s] = untok(t); if (s === undefined) whole.add(k); }
  const out = [];
  for (const t of toks) {
    const [k, s] = untok(t);
    if (s === undefined) { out.push([[k], d[k]]); continue; }
    if (whole.has(k)) continue;
    const m = d[k];
    if (m !== undefined && !isObj(m)) { whole.add(k); out.push([[k], m]); continue; } // 맵이 아닌 값이 됐다: 통째로
    out.push([[k, s], m === undefined ? undefined : m[s]]);
  }
  return out;
}

/* ---------- 흔적 배열 (_log · _paste) ---------- */

export const TRACE_CAPS = { _log: 300, _paste: 200 };
const traceId = (e) => (isObj(e) ? String(e.k) + "|" + String(e.at) : JSON.stringify(e));
const atOf = (e) => (isObj(e) && typeof e.at === "string" ? e.at : "");

/* 이 탭의 배열과 서버 사본을 항목(칸+시각) 단위로 합친다. 같은 항목이면 이 탭의 고친 값(settle·src·덜어 낸 앞머리)이 이긴다.
   시각 순으로 늘어놓고 cap을 넘으면 오래된 것부터 덜어 낸다. 돌려주는 값: { arr, dropped } */
export function unionTrace(local, server, cap) {
  const L = Array.isArray(local) ? local : [], S = Array.isArray(server) ? server : [];
  const byId = new Map();
  for (const e of S) byId.set(traceId(e), e);
  for (const e of L) {
    const id = traceId(e);
    const s = byId.get(id);
    byId.set(id, isObj(s) && isObj(e) ? { ...s, ...e } : e);
  }
  let arr = [...byId.values()].map((e, i) => [e, i])
    .sort((a, b) => (atOf(a[0]) < atOf(b[0]) ? -1 : atOf(a[0]) > atOf(b[0]) ? 1 : a[1] - b[1]))
    .map((x) => x[0]);
  const dropped = cap && arr.length > cap ? arr.length - cap : 0;
  if (dropped) arr = arr.slice(dropped);
  return { arr, dropped };
}

/* 저장 직전: 이 탭이 고친 흔적 배열을 서버 사본과 합치고 상한을 적용한다.
   touched는 이번 저장에 실을 토큰(고친 키). 고치지 않은 배열은 그대로 둔다 (쓰지 않으므로).
   덜어 낸 건수는 _pruned에 더한다 (연구 변수 trace_pruned: 0이 아니면 고쳐 쓰기 이력이 완전하지 않다). */
export function mergeTraceForSave(data, server, touched) {
  const d = data || {}, srv = server || {};
  const t = new Set(touched || []);
  let out = d, dropped = 0;
  for (const k of Object.keys(TRACE_CAPS)) {
    if (!t.has(k)) continue;
    if (!Array.isArray(d[k]) && !Array.isArray(srv[k])) continue;
    const r = unionTrace(d[k], srv[k], TRACE_CAPS[k]);
    if (out === d) out = { ...d };
    out[k] = r.arr;
    dropped += r.dropped;
  }
  if (dropped) out._pruned = Math.max(d._pruned || 0, srv._pruned || 0) + dropped;
  return out;
}

/* 저장이 끝난 뒤 화면의 흔적 배열을 저장한 것과 맞춘다.
   저장한 배열(saved) + 저장하는 사이 이 탭에서 새로 붙은 항목(cur에만 있고 before에는 없던 것).
   덜어 낸 옛 항목이 화면에 남아 다음 저장에서 다시 세어지는 일을 막는다. */
export function reconcileTrace(cur, before, saved) {
  if (!Array.isArray(saved)) return cur;
  const C = Array.isArray(cur) ? cur : [];
  if (C === before) return saved;
  const seen = new Set((Array.isArray(before) ? before : []).map(traceId));
  for (const e of saved) seen.add(traceId(e));
  const fresh = C.filter((e) => !seen.has(traceId(e)));
  return fresh.length ? [...saved, ...fresh] : saved;
}

/* ---------- 설문 (surveys/{학번}) ----------
   설문 문서도 블록(pre·post·anchor·stance.pre·stance.post) 단위로 저장하고 구독한다 (2026-09-28).
   예전에는 답 하나 고를 때마다 문서를 통째로 써서, 다른 기기에서 제출한 블록을 옛 사본이 「제출 전」으로 되돌릴 수 있었다.
   서버에서 제출된 블록은 언제나 이긴다 (제출 취소 없음). */

/* 블록 경로. 토큰은 경로를 점으로 이은 것 ("stance.pre") */
export const SURVEY_BLOCKS = ["pre", "post", "anchor", "stance.pre", "stance.post"];
const getIn = (o, path) => path.reduce((x, k) => (isObj(x) ? x[k] : undefined), o);
export const isSubmitted = (b) => !!(isObj(b) && b.submittedAt);

/* 서버 사본을 화면의 설문에 합친다.
   ① 서버에서 제출된 블록은 언제나 서버 값 (다른 기기에서 제출했으면 이 화면도 제출됨으로 바뀐다)
   ② 이 탭이 고치는 중·제출 중인 블록은 이 탭의 값
   ③ 나머지는 서버 값. 판 표시(ver·stance.ver)는 서버에 있으면 서버 값.
   바뀐 것이 없으면 local을 그대로 돌려준다. */
export function mergeSurvey(local, remote, skip) {
  const l = isObj(local) ? local : {}, r = isObj(remote) ? remote : {};
  const keep = skip || new Set();
  const out = { ...r };
  if (!("ver" in r) && "ver" in l) out.ver = l.ver;
  const lst = isObj(l.stance) ? l.stance : {}, rst = isObj(r.stance) ? r.stance : {};
  const st = { ...rst };
  if (!("ver" in rst) && "ver" in lst) st.ver = lst.ver;
  for (const b of SURVEY_BLOCKS) {
    const path = b.split(".");
    const rv = getIn(r, path), lv = getIn(l, path);
    const v = isSubmitted(rv) ? rv : keep.has(b) ? lv : rv;
    const tgt = path.length > 1 ? st : out;
    const k = path[path.length - 1];
    if (v === undefined) delete tgt[k]; else tgt[k] = v;
  }
  if (Object.keys(st).length) out.stance = st; else delete out.stance;
  return deepEq(l, out) ? (local || l) : out;
}

/* 설문 자동 저장 항목. toks는 고친 블록 토큰.
   제출된 블록(이 화면이든 서버든)은 자동 저장으로 다시 쓰지 않는다: 제출은 제출 함수가 한 번 쓰고, 규칙이 그 뒤를 잠근다.
   블록과 함께 그 판 표시(ver·stance.ver)를 싣는다 (값이 있을 때만). */
export function surveyEntries(cur, toks, server) {
  const c = isObj(cur) ? cur : {};
  const out = [];
  const vers = new Set();
  for (const b of toks || []) {
    if (!SURVEY_BLOCKS.includes(b)) continue;
    const path = b.split(".");
    if (isSubmitted(getIn(server, path)) || isSubmitted(getIn(c, path))) continue;
    const v = getIn(c, path);
    if (v === undefined) continue;
    out.push([path, v]);
    if (path[0] === "anchor") continue; // 앵커 판은 블록 안에 있다
    const vp = path.length > 1 ? [...path.slice(0, -1), "ver"] : ["ver"];
    const vk = vp.join(".");
    const vv = getIn(c, vp);
    if (!vers.has(vk) && vv !== undefined) { vers.add(vk); out.push([vp, vv]); }
  }
  return out;
}

/* 서버에서 제출된 블록 토큰 (이 화면의 자동 저장 대상에서 뺀다) */
export function submittedBlocks(server) {
  return SURVEY_BLOCKS.filter((b) => isSubmitted(getIn(server, b.split("."))));
}
