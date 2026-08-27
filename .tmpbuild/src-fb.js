/* ============================================================
   Firebase 연결 계층
   기존 코드의 store.get / store.set 호출을 Firestore 문서로 잇는다.
   인증: 이메일·비밀번호 (학번 → 학번@museum.class, 4자리 코드 → 학번#코드)
   ============================================================ */

import { initializeApp } from "firebase/app";
import {
  getFirestore, doc, getDoc, setDoc, collection, getDocs, onSnapshot, deleteDoc,
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
const db = getFirestore(app);
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

  async set(key, value) {
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
      await setDoc(doc(db, r.path[0], r.path[1]), { v: value, updatedAt: Date.now() }, { merge: false });
      return true;
    } catch (e) { console.error("write fail", key, e); return false; }
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
