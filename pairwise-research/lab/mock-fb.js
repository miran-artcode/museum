/* 체험실용 fbStore — src-fb.js 대신 묶인다(build.mjs가 경로를 바꿔 끼운다).
   Firestore 대신 메모리에 { v } 문서를 두고, 학생 화면(src-assess.jsx)이 쓰는 get·setT·watchDoc·allOfSafe를 그대로 흉내 낸다.
   merge 쓰기는 Firestore처럼 객체는 깊게 합치고 배열은 통째로 바꾼다. 아무것도 서버로 나가지 않는다. */

const docs = new Map();
const watchers = new Map();
const listeners = new Set();

const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);
const clone = (x) => (x == null || typeof x !== "object" ? x : JSON.parse(JSON.stringify(x)));
function deepMerge(base, patch) {
  if (!isObj(base) || !isObj(patch)) return clone(patch);
  const out = { ...base };
  Object.keys(patch).forEach((k) => { out[k] = isObj(out[k]) && isObj(patch[k]) ? deepMerge(out[k], patch[k]) : clone(patch[k]); });
  return out;
}
function emit(key) {
  const v = docs.has(key) ? docs.get(key) : null;
  (watchers.get(key) || new Set()).forEach((cb) => { try { cb(clone(v)); } catch (e) { console.error(e); } });
  listeners.forEach((fn) => { try { fn(key); } catch (e) { console.error(e); } });
}
const collectionOf = (name) => {
  const prefix = name === "submissions" ? "sub:" : name === "assess" ? "assess:" : name + ":";
  const out = {};
  docs.forEach((v, k) => { if (k.startsWith(prefix)) out[k.slice(prefix.length)] = clone(v); });
  return out;
};

export const fbStore = {
  async get(key) { return docs.has(key) ? clone(docs.get(key)) : null; },
  async getSafe(key) { return { ok: true, data: docs.has(key) ? clone(docs.get(key)) : null, fromCache: false }; },
  async set(key, value, opts) {
    docs.set(key, opts && opts.merge ? deepMerge(docs.get(key) || {}, value) : clone(value));
    setTimeout(() => emit(key), 0);
    return true;
  },
  setT(key, value, opts) { return this.set(key, value, opts); },
  async updateFields(key, patch) {
    if (!docs.has(key)) return "missing";
    const cur = { ...docs.get(key) };
    Object.keys(patch || {}).forEach((k) => { if (patch[k] === undefined) delete cur[k]; else cur[k] = clone(patch[k]); });
    docs.set(key, cur); setTimeout(() => emit(key), 0); return true;
  },
  updateFieldsT(key, patch) { return this.updateFields(key, patch); },
  async remove(key) { docs.delete(key); setTimeout(() => emit(key), 0); return true; },
  watchDoc(key, cb) {
    if (!watchers.has(key)) watchers.set(key, new Set());
    watchers.get(key).add(cb);
    setTimeout(() => cb(docs.has(key) ? clone(docs.get(key)) : null), 0);
    return () => { const s = watchers.get(key); if (s) s.delete(cb); };
  },
  watchDocMeta(key, cb) { return this.watchDoc(key, (v) => cb({ v, exists: v != null, fromCache: false, pending: false })); },
  async allOf(name) { return collectionOf(name); },
  async allOfSafe(name) { return { ok: true, data: collectionOf(name), fromCache: false }; },
  watchCollection(name, cb) {
    const fn = () => cb(collectionOf(name));
    listeners.add(fn); setTimeout(fn, 0);
    return () => listeners.delete(fn);
  },
};

/* 체험실 껍데기가 쓰는 동기 접근 */
export const labStore = {
  read: (key) => (docs.has(key) ? docs.get(key) : null),
  write(key, value, merge) { docs.set(key, merge ? deepMerge(docs.get(key) || {}, value) : clone(value)); emit(key); },
  collection: collectionOf,
  reset() { const keys = [...docs.keys()]; docs.clear(); keys.forEach(emit); },
  subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
};
