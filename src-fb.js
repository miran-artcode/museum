/* ============================================================
   Firebase 연결 계층
   기존 코드의 store.get / store.set 호출을 Firestore 문서로 잇는다.
   인증: 이메일·비밀번호 (학번 → 학번@museum.class, 4자리 코드 → 학번#코드)
   ============================================================ */

import { initializeApp } from "firebase/app";
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, getDoc, setDoc, collection, getDocs, onSnapshot, deleteDoc,
} from "firebase/firestore";
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, onAuthStateChanged, updatePassword,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyCf6tQ7fYXyKfRUcsrStLMc7zXX1M_hYks",
  authDomain: "class-9f074.firebaseapp.com",
  projectId: "class-9f074",
  storageBucket: "class-9f074.firebasestorage.app",
  messagingSenderId: "715206309418",
  appId: "1:715206309418:web:a8c01d9f23f714f6407553",
};

const app = initializeApp(firebaseConfig);
// 오프라인 지속 캐시: 와이파이가 끊겨도 쓰던 내용이 IndexedDB에 쌓였다가
// 연결이 돌아오면 자동 전송된다. 탭을 닫아도 큐가 사라지지 않는다.
let db;
try {
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
} catch (e) {
  // 초기화가 동기적으로 실패한 환경 — 기본 인스턴스로 계속.
  // initializeFirestore를 다른 옵션으로 두 번 부르면 그 자체가 throw하므로 getFirestore를 쓴다.
  // (사파리 사생활 보호 모드의 IndexedDB 차단은 여기로 오지 않고 SDK가 내부에서 메모리로 물러난다.)
  db = getFirestore(app);
}
const auth = getAuth(app);

const DOMAIN = "@museum.class";
const TEACHER_ID = "teacher";
export const emailOf = (id) => id + DOMAIN;
export const pwOf = (id, code) => id + "#" + code;

/* ---------- 인증 ---------- */

export const authApi = {
  current() { return auth.currentUser; },
  watch(cb) { return onAuthStateChanged(auth, cb); },

  async studentEnter(sid, pin) {
    try {
      await signInWithEmailAndPassword(auth, emailOf(sid), pwOf(sid, pin));
      return { ok: true, isNew: false };
    } catch (e) {
      const code = e && e.code;
      if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
        try {
          await createUserWithEmailAndPassword(auth, emailOf(sid), pwOf(sid, pin));
          return { ok: true, isNew: true };
        } catch (e2) {
          if (e2.code === "auth/email-already-in-use") return { ok: false, reason: "wrong-pin" };
          return { ok: false, reason: e2.code || "unknown" };
        }
      }
      return { ok: false, reason: code || "unknown" };
    }
  },

  async teacherEnter(code) {
    try {
      await signInWithEmailAndPassword(auth, emailOf(TEACHER_ID), pwOf(TEACHER_ID, code));
      return { ok: true, isNew: false };
    } catch (e) {
      const c = e && e.code;
      if (c === "auth/invalid-credential" || c === "auth/wrong-password" || c === "auth/user-not-found") {
        try {
          await createUserWithEmailAndPassword(auth, emailOf(TEACHER_ID), pwOf(TEACHER_ID, code));
          return { ok: true, isNew: true };
        } catch (e2) {
          if (e2.code === "auth/email-already-in-use") return { ok: false, reason: "wrong-code" };
          return { ok: false, reason: e2.code || "unknown" };
        }
      }
      return { ok: false, reason: c || "unknown" };
    }
  },

  async changeCode(newCode) {
    const u = auth.currentUser;
    if (!u) return false;
    const id = u.email.replace(DOMAIN, "");
    try { await updatePassword(u, pwOf(id, newCode)); return true; } catch (e) { return false; }
  },

  async leave() { try { await signOut(auth); } catch (e) {} },
};

/* ---------- 키 → 문서 경로 ---------- */

const safe = (s) => String(s).replace(/[\/\s"'#\[\]*~?:]/g, "_").slice(0, 180);

function route(key) {
  if (key === "config") return { kind: "doc", path: ["meta", "config"] };
  if (key === "roster") return { kind: "roster" };
  if (key.startsWith("ws:")) return { kind: "doc", path: ["worksheets", safe(key.slice(3))] };
  if (key.startsWith("grade:")) return { kind: "doc", path: ["grades", safe(key.slice(6))] };
  if (key.startsWith("survey:")) return { kind: "doc", path: ["surveys", safe(key.slice(7))] };
  if (key.startsWith("media:")) return { kind: "doc", path: ["media", safe(key.slice(6))] };
  // 연구 참여 동의 대장 — 교사만 읽고 쓴다 (학생 화면에서는 존재를 알 수 없음)
  if (key.startsWith("research:")) return { kind: "doc", path: ["research", safe(key.slice(9))] };
  // 상호평가(쌍대비교) — 작품 스냅샷은 학급이 읽고, 평가 기록은 본인·교사만 읽는다 (src-assess-core.js 계약)
  if (key === "peerRoster") return { kind: "doc", path: ["meta", "peerRoster"] };
  if (key.startsWith("sub:")) return { kind: "doc", path: ["submissions", safe(key.slice(4))] };
  if (key.startsWith("assess:")) return { kind: "doc", path: ["assess", safe(key.slice(7))] };
  return { kind: "doc", path: ["misc", safe(key)] };
}

/* ---------- store: 기존 API 유지 ---------- */

export const fbStore = {
  async get(key) {
    try {
      const r = route(key);
      if (r.kind === "roster") {
        const snap = await getDocs(collection(db, "students"));
        const out = {};
        snap.forEach((d) => { out[d.id] = d.data(); });
        return Object.keys(out).length ? out : null;
      }
      const s = await getDoc(doc(db, r.path[0], r.path[1]));
      if (!s.exists()) return null;
      const data = s.data();
      return data && data.v !== undefined ? data.v : data;
    } catch (e) { console.error("read fail", key, e); return null; }
  },

  /* get과 같으나 "없음"과 "읽기 실패"를 구분해 돌려준다.
     실패를 없음으로 오인해 빈 문서로 덮어쓰는 사고를 막는 용도 —
     학생 기록 최초 로드처럼 실패 시 쓰기를 잠가야 하는 곳에서 쓴다.
     fromCache: 오프라인 지속 캐시가 켜진 뒤로는 서버에 못 닿아도 getDoc이
     IndexedDB 사본으로 조용히 성공한다 — 그 사본은 다른 기기에서 쓴 최신 기록보다
     오래됐을 수 있으므로, 호출한 쪽이 이 표시를 보고 경고를 띄운다. */
  async getSafe(key) {
    try {
      const r = route(key);
      if (r.kind === "roster") {
        const snap = await getDocs(collection(db, "students"));
        const out = {};
        snap.forEach((d) => { out[d.id] = d.data(); });
        return { ok: true, data: Object.keys(out).length ? out : null, fromCache: !!(snap.metadata && snap.metadata.fromCache) };
      }
      const s = await getDoc(doc(db, r.path[0], r.path[1]));
      const fromCache = !!(s.metadata && s.metadata.fromCache);
      if (!s.exists()) return { ok: true, data: null, fromCache };
      const data = s.data();
      return { ok: true, data: data && data.v !== undefined ? data.v : data, fromCache };
    } catch (e) { console.error("read fail", key, e); return { ok: false, data: null, fromCache: false }; }
  },

  /* opts.merge — v의 준 필드만 깊은 병합으로 갱신한다 (안 준 필드는 서버 값 유지).
     설정 문서처럼 여러 화면·세션이 서로 다른 필드를 고치는 문서에서,
     읽기 실패 후의 전체 덮어쓰기와 동시 편집의 상호 삭제를 함께 막는다. */
  async set(key, value, opts) {
    try {
      const r = route(key);
      if (r.kind === "roster") {
        // 자기 학번 문서만 갱신함 (별명 등록·수정)
        const u = auth.currentUser;
        if (!u) return false;
        const sid = u.email.replace(DOMAIN, "");
        const mine = value && value[sid];
        if (!mine) return true;
        await setDoc(doc(db, "students", sid), { nick: mine.nick || "", updatedAt: Date.now() }, { merge: true });
        return true;
      }
      await setDoc(doc(db, r.path[0], r.path[1]), { v: value, updatedAt: Date.now() }, { merge: !!(opts && opts.merge) });
      return true;
    } catch (e) { console.error("write fail", key, e); return false; }
  },

  /* set과 같으나 제한 시간 안에 서버 확인이 없으면 false로 끝낸다.
     오프라인이면 setDoc이 거부되지 않고 영원히 미해결로 남아 await가 안 풀리기 때문 —
     저장·제출처럼 결과를 사용자에게 알려야 하는 모든 경로는 이것을 쓴다.
     (시간 초과 뒤 원래 쓰기가 늦게 큐에서 성공해도 같은 내용이라 무해하다.) */
  setT(key, value, opts) {
    const ms = (opts && opts.timeout) || 8000;
    return Promise.race([
      this.set(key, value, opts),
      new Promise((res) => setTimeout(() => res(false), ms)),
    ]);
  },

  async remove(key) {
    try {
      const r = route(key);
      if (r.kind === "doc") await deleteDoc(doc(db, r.path[0], r.path[1]));
      return true;
    } catch (e) { return false; }
  },

  /* 실시간 구독: 차시 공개 설정과 학생 기록에 사용 */
  watchDoc(key, cb) {
    const r = route(key);
    if (r.kind !== "doc") return () => {};
    return onSnapshot(doc(db, r.path[0], r.path[1]), (s) => {
      if (!s.exists()) return cb(null);
      const data = s.data();
      cb(data && data.v !== undefined ? data.v : data);
    }, () => {});
  },

  watchStudents(cb) {
    return onSnapshot(collection(db, "students"), (snap) => {
      const out = {};
      snap.forEach((d) => { out[d.id] = d.data(); });
      cb(out);
    }, () => {});
  },

  watchWorksheets(cb) {
    return onSnapshot(collection(db, "worksheets"), (snap) => {
      const out = {};
      snap.forEach((d) => { const x = d.data(); out[d.id] = x && x.v !== undefined ? x.v : x; });
      cb(out);
    }, () => {});
  },

  async allGrades() {
    try {
      const snap = await getDocs(collection(db, "grades"));
      const out = {};
      snap.forEach((d) => { const x = d.data(); out[d.id] = x && x.v !== undefined ? x.v : x; });
      return out;
    } catch (e) { return {}; }
  },

  async allSurveys() {
    try {
      const snap = await getDocs(collection(db, "surveys"));
      const out = {};
      snap.forEach((d) => { const x = d.data(); out[d.id] = x && x.v !== undefined ? x.v : x; });
      return out;
    } catch (e) { return {}; }
  },

  watchSurveys(cb) {
    return onSnapshot(collection(db, "surveys"), (snap) => {
      const out = {};
      snap.forEach((d) => { const x = d.data(); out[d.id] = x && x.v !== undefined ? x.v : x; });
      cb(out);
    }, () => {});
  },

  /* 컬렉션 전체 읽기·구독 — 상호평가의 제출(submissions)과 평가 기록(assess)에 쓴다.
     읽기 권한이 없는 문서가 섞이면 쿼리 전체가 거부되므로, 학생은 submissions만 부를 수 있다. */
  async allOf(name) {
    try {
      const snap = await getDocs(collection(db, safe(name)));
      const out = {};
      snap.forEach((d) => { const x = d.data(); out[d.id] = x && x.v !== undefined ? x.v : x; });
      return out;
    } catch (e) { console.error("allOf fail", name, e); return {}; }
  },

  watchCollection(name, cb) {
    return onSnapshot(collection(db, safe(name)), (snap) => {
      const out = {};
      snap.forEach((d) => { const x = d.data(); out[d.id] = x && x.v !== undefined ? x.v : x; });
      cb(out);
    }, () => {});
  },

  /* 교사용 학생 관리 — 명부 문서를 학번 지정으로 쓰고 지운다 (규칙이 교사만 허용) */
  async setStudent(sid, data) {
    try {
      await setDoc(doc(db, "students", safe(sid)), { ...data, updatedAt: Date.now() }, { merge: true });
      return true;
    } catch (e) { console.error("setStudent fail", sid, e); return false; }
  },

  async removeStudent(sid) {
    try { await deleteDoc(doc(db, "students", safe(sid))); return true; }
    catch (e) { console.error("removeStudent fail", sid, e); return false; }
  },
};
