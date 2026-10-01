/* 연구 자료의 가명 번호(pid)와 학급 코드 — 「연구」 탭과 「상호평가」 탭이 함께 쓴다.

   문서 research/pidMap (store 키 "research:pidMap", 교사만 읽고 쓴다)
     v = { pids: { 학번: "P" + 4글자 }, classes: { "04": "C3", ... } }

   왜 학번 순 번호(P01…)를 버렸나: 순번은 분석 대상이 하나 늘거나(늦게 온 학생·시험 계정)
   동의 표시가 바뀌면 모든 번호가 밀려, 두 번 내려받은 파일이나 「연구」·「상호평가」 파일을
   pid로 이을 수 없다. 또 학번 순서가 그대로 남아 가명이 아니다.
   그래서 학생마다 한 번 정한 무작위 번호를 문서에 저장하고 다시는 바꾸지 않는다.
   학급 코드도 반 번호 순이 아니라 무작위 순서로 C1, C2…를 붙인다.

   규칙
   - 교사가 내려받을 때 없는 학생·학급만 새로 만든다(merge 쓰기). 있는 항목은 절대 고치지 않는다.
   - 학번 형식으로 학급을 알 수 없는 학생(src-class.mjs의 UNKNOWN_CLASS)은 코드 "CU"로 둔다. */

import { classOf, UNKNOWN_CLASS } from "./src-class.mjs";

export const PID_KEY = "research:pidMap";
/* 헷갈리기 쉬운 글자(0·O, 1·I·L, 2·Z, 5·S, 8·B, 6·G, U·V)를 뺀 알파벳 */
export const PID_ALPHABET = "ACDEFHJKMNPRTWXY3479";
export const PID_LEN = 4;
export const UNKNOWN_CLASS_CODE = "CU";

const PID_RE = new RegExp("^P[" + PID_ALPHABET + "]{" + PID_LEN + "}$");

/* 저장된 값을 검사해 { pids, classes } 꼴로 */
export function normPidMap(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const pids = {}, classes = {};
  Object.entries(r.pids || {}).forEach(([sid, p]) => { if (typeof p === "string" && PID_RE.test(p)) pids[sid] = p; });
  Object.entries(r.classes || {}).forEach(([c, code]) => { if (typeof code === "string" && /^C\d+$/.test(code)) classes[c] = code; });
  return { pids, classes };
}

export const pidOfMap = (map, sid) => ((map && map.pids) || {})[sid] || "";
export function classCodeOf(map, cls) {
  if (cls === UNKNOWN_CLASS) return UNKNOWN_CLASS_CODE;
  return ((map && map.classes) || {})[cls] || "";
}

/* 난수: 브라우저·노드의 crypto, 없으면 Math.random */
export function cryptoRng() {
  const c = typeof globalThis !== "undefined" ? globalThis.crypto : null;
  if (c && typeof c.getRandomValues === "function") {
    return () => { const a = new Uint32Array(1); c.getRandomValues(a); return a[0] / 4294967296; };
  }
  return Math.random;
}
/* 표본 학급 화면용 — 같은 씨앗이면 같은 번호 */
export function seededRng(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function newPid(taken, rng) {
  const r = rng || cryptoRng();
  for (let tries = 0; tries < 10000; tries++) {
    let p = "P";
    for (let i = 0; i < PID_LEN; i++) p += PID_ALPHABET[Math.floor(r() * PID_ALPHABET.length)];
    if (!taken.has(p)) return p;
  }
  throw new Error("가명 번호를 만들지 못했습니다");
}

/* 없는 학생·학급만 채운 새 지도와, 서버에 merge로 쓸 조각(patch)을 계산한다. 있는 항목은 그대로 */
export function planPidMap(map, ids, classMap, rng) {
  const r = rng || cryptoRng();
  const cur = normPidMap(map);
  const next = { pids: { ...cur.pids }, classes: { ...cur.classes } };
  const patch = { pids: {}, classes: {} };
  const taken = new Set(Object.values(next.pids));
  const addedPids = [];
  (ids || []).forEach((sid) => {
    if (next.pids[sid]) return;
    const p = newPid(taken, r);
    taken.add(p); next.pids[sid] = p; patch.pids[sid] = p; addedPids.push(sid);
  });
  const newCls = [...new Set((ids || []).map((sid) => classOf(sid, classMap)))]
    .filter((c) => c !== UNKNOWN_CLASS && !next.classes[c]);
  for (let i = newCls.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [newCls[i], newCls[j]] = [newCls[j], newCls[i]]; }
  let k = Object.values(next.classes).reduce((m, code) => Math.max(m, Number(code.slice(1)) || 0), 0);
  newCls.forEach((c) => { k += 1; next.classes[c] = "C" + k; patch.classes[c] = "C" + k; });
  return { next, patch, addedPids, addedClasses: newCls };
}

/* 서버의 지도를 읽고, 없는 학생·학급을 만들어 merge로 쓴 뒤 다시 읽어 돌려준다.
   store는 getSafe(key) → { ok, data }, setT(key, v, { merge }) → bool 을 갖춘 객체.
   읽기에 실패하면 무엇이 없는지 알 수 없으므로 쓰지 않고 실패를 돌려준다. */
export async function ensurePidMap(store, ids, classMap, opts) {
  const o = opts || {};
  const r = await store.getSafe(PID_KEY);
  if (!r || !r.ok) return { ok: false, error: "read" };
  const plan = planPidMap(r.data, ids, classMap, o.rng);
  if (!plan.addedPids.length && !plan.addedClasses.length) return { ok: true, map: plan.next, added: 0 };
  const w = await store.setT(PID_KEY, plan.patch, { merge: true });
  if (!w) return { ok: false, error: "write" };
  // 다른 창이 같은 순간 번호를 만들었을 수 있으니 서버 값을 다시 읽어 그쪽을 따른다
  const r2 = await store.getSafe(PID_KEY);
  const map = r2 && r2.ok ? normPidMap(r2.data) : plan.next;
  const dup = Object.values(map.pids).length !== new Set(Object.values(map.pids)).size;
  if (dup) return { ok: false, error: "duplicate", map };
  return { ok: true, map, added: plan.addedPids.length };
}

/* 가명 파일의 행 순서: pid 순(학번 순이 남지 않게). pid가 없는 행은 맨 뒤 */
export function byPid(pa, pb) {
  if (!pa && !pb) return 0;
  if (!pa) return 1;
  if (!pb) return -1;
  return pa < pb ? -1 : pa > pb ? 1 : 0;
}
