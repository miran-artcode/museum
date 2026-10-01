/* ============================================================
   Firebase 연결 계층
   기존 코드의 store.get / store.set 호출을 Firestore 문서로 잇는다.
   인증: 이메일·비밀번호 (학번 → 학번@museum.class, 4자리 코드 → 학번#코드)
   ============================================================ */

import { initializeApp } from "firebase/app";
import {
  initializeFirestore, getFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, getDoc, setDoc, collection, getDocs, onSnapshot, deleteDoc, query, where,
  serverTimestamp, arrayUnion, getDocFromServer, getDocsFromServer,
  updateDoc, deleteField, FieldPath,
  waitForPendingWrites, terminate, clearIndexedDbPersistence,
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
// 보기 전용 교사 계정(viewer@museum.class): 관리자 코드 칸에 참관용 코드를 넣으면 들어간다 (teacherEnter).
// 참관용 코드는 이 파일에도 규칙에도 적지 않는다. 저장소가 공개라 적어 두면 누구나 학급 기록 전체를 읽는다.
// 규칙(firestore.rules)이 viewer의 쓰기를 전부 거부하고, 아래 쓰기 함수도 서버에 보내지 않고 false를 돌려준다.
const VIEWER_ID = "viewer";
// 비밀번호가 틀렸거나 계정이 없을 때 Auth가 돌려주는 코드 (이메일 열거 보호가 켜진 뒤로는 invalid-credential 하나로 온다)
const BAD_CRED = ["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-login-credentials"];
const idOfUser = (u) => (u && u.email ? String(u.email).split("@")[0] : "");
export const isViewerNow = () => idOfUser(auth.currentUser) === VIEWER_ID;
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
      if (BAD_CRED.includes(code)) {
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

  isViewer() { return isViewerNow(); },

  /* 관리자 코드 칸 하나로 두 계정을 가린다: 먼저 교사(teacher#코드), 맞지 않으면 보기 전용(viewer#코드)으로 들어간다.
     두 계정은 Firebase 콘솔이나 scripts/reset-pin.mjs로 한 번 만들어 두고, 여기서는 만들지 않는다.
     예전에는 로그인이 실패하면 그 코드로 계정을 새로 만들었다. 그러면 교사 계정이 지워진 사이에
     처음 입장한 사람이 교사가 되고, 보기 전용 계정도 아무 코드로나 다시 만들 수 있었다. */
  async teacherEnter(code) {
    const tryIn = async (id) => {
      try { await signInWithEmailAndPassword(auth, emailOf(id), pwOf(id, code)); return ""; }
      catch (e) { return (e && e.code) || "unknown"; }
    };
    const t = await tryIn(TEACHER_ID);
    if (!t) return { ok: true, viewer: false };
    if (!BAD_CRED.includes(t)) return { ok: false, reason: t }; // 연결 끊김·시도 과다는 그대로 알린다
    const v = await tryIn(VIEWER_ID);
    if (!v) return { ok: true, viewer: true };
    if (!BAD_CRED.includes(v)) return { ok: false, reason: v };
    return { ok: false, reason: "wrong-code" };
  },

  async changeCode(newCode) {
    const u = auth.currentUser;
    if (!u || isViewerNow()) return false;
    const id = u.email.replace(DOMAIN, "");
    try { await updatePassword(u, pwOf(id, newCode)); return true; } catch (e) { return false; }
  },

  /* 입장 도중에 되돌릴 때(별명 없음·명단 밖): 로그아웃만 한다. 오류 문구를 보여 줘야 하므로 새로 고치지 않는다 */
  async cancelEnter() { try { await signOut(auth); } catch (e) {} },

  /* 나가기. 컴퓨터실처럼 여러 사람이 쓰는 PC에서 다음 사람이 앞사람의 기록을 읽지 못하게,
     로그아웃한 뒤 이 브라우저의 Firestore 캐시(IndexedDB)를 지우고 새로 고친다.
     캐시 사본은 오프라인 읽기에서 규칙을 거치지 않으므로 로그아웃만으로는 남는다.
     서버에 못 간 쓰기가 5초 안에 다 가지 않으면 지우지 않는다: 그 쓰기는 이 계정의 대기열에 남았다가 같은 학번이 다시 들어오면 전송된다.
     대기열 확인은 로그아웃 전에 한다(로그아웃 뒤에는 다른 사용자의 빈 대기열을 보게 되어 곧바로 끝난 것으로 보인다).
     부르는 쪽은 화면을 먼저 내리고(App의 leaving) 부른다. 이 함수 뒤에는 앱이 이어지지 않는다. */
  async leave() {
    let flushed = false;
    try {
      flushed = await Promise.race([
        waitForPendingWrites(db).then(() => true),
        new Promise((res) => setTimeout(() => res(false), 5000)),
      ]);
    } catch (e) { flushed = false; }
    try { await signOut(auth); } catch (e) {}
    if (flushed) {
      // 다른 탭이 같은 캐시를 쓰고 있으면 지우기가 거부된다. 그때는 새로 고치기만 한다
      try { await terminate(db); await clearIndexedDbPersistence(db); } catch (e) {}
    }
    try { location.reload(); } catch (e) {}
  },
};

/* ---------- 키 → 문서 경로 ---------- */

const safe = (s) => String(s).replace(/[\/\s"'#\[\]*~?:]/g, "_").slice(0, 180);

function route(key) {
  if (key === "config") return { kind: "doc", path: ["meta", "config"] };
  if (key === "roster") return { kind: "roster" };
  if (key.startsWith("ws:")) return { kind: "doc", path: ["worksheets", safe(key.slice(3))] };
  // 기록지 시점 사본: {학번}_{YYYYMMDDHH} — 자동 저장 때 학생이 쓰고 교사가 되돌린다 (src-ws-history.jsx)
  if (key.startsWith("wsh:")) return { kind: "doc", path: ["wsHistory", safe(key.slice(4))] };
  if (key.startsWith("grade:")) return { kind: "doc", path: ["grades", safe(key.slice(6))] };
  if (key.startsWith("survey:")) return { kind: "doc", path: ["surveys", safe(key.slice(7))] };
  if (key.startsWith("media:")) return { kind: "doc", path: ["media", safe(key.slice(6))] };
  // 연구 참여 동의 대장 — 교사만 읽고 쓴다 (학생 화면에서는 존재를 알 수 없음)
  if (key.startsWith("research:")) return { kind: "doc", path: ["research", safe(key.slice(9))] };
  // 상호평가(쌍대비교) — 작품 스냅샷은 학급이 읽고, 평가 기록은 본인·교사만 읽는다 (src-assess-core.js 계약)
  if (key === "peerRoster") return { kind: "doc", path: ["meta", "peerRoster"] }; // 반을 나누기 전의 옛 명단
  // 반별 비교 명단: peerRoster:{반} → meta/peerRoster_{반} (반은 src-class.mjs의 classOf, 미상 "?"는 "_"가 된다)
  if (key.startsWith("peerRoster:")) return { kind: "doc", path: ["meta", "peerRoster_" + safe(key.slice(11))] };
  // 전시장 출품: 기록지의 「공개」 작품 캡션 사본. 기록지는 본인·교사만 읽으므로 전시장은 이 컬렉션을 읽는다
  if (key.startsWith("exhibit:")) return { kind: "doc", path: ["exhibit", safe(key.slice(8))] };
  if (key.startsWith("sub:")) return { kind: "doc", path: ["submissions", safe(key.slice(4))] };
  if (key.startsWith("assess:")) return { kind: "doc", path: ["assess", safe(key.slice(7))] };
  // 적응형 쪽지시험: 은행(공개부)·정답 키·응시 기록 (src-quiz-core.mjs 계약)
  if (key === "quizBank") return { kind: "doc", path: ["quizBank", "v1"] };
  if (key === "quizKeys") return { kind: "doc", path: ["quizKeys", "v1"] };
  if (key.startsWith("quiz:")) return { kind: "doc", path: ["quiz", safe(key.slice(5))] };
  return { kind: "doc", path: ["misc", safe(key)] };
}

/* 기록지 판 표시. 2026-09-17 전의 옛 화면은 기록지를 통째로 덮어써 다른 기기에서 쓴 칸을 지웠다.
   이 계층을 거치는 기록지 쓰기는 모두 cv: 2를 함께 쓰고, 규칙(firestore.rules /worksheets)은
   cv가 한 번 들어간 문서를 cv 없이 고치는 쓰기(옛 화면이 열린 채 남은 탭)를 거부한다. */
const WS_CV = 2;
const isWsKey = (key) => typeof key === "string" && key.startsWith("ws:");

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
    if (isViewerNow()) return false; // 보기 전용 계정
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
      const body = { v: value, updatedAt: Date.now() };
      if (isWsKey(key)) body.cv = WS_CV;
      await setDoc(doc(db, r.path[0], r.path[1]), body, { merge: !!(opts && opts.merge) });
      return true;
    } catch (e) { console.error("write fail", key, e); return false; }
  },

  /* 문서의 v 안에서 준 키만 바꾼다 (다른 키는 손대지 않는다). 학생 기록지의 칸 단위 자동 저장용 (src-ws-sync.mjs).
     키 이름에 점이 있어(l1.q1) 문자열 경로가 아니라 FieldPath로 가리킨다. 값이 undefined인 키는 지운다.
     문서가 없으면 updateDoc이 거부되므로 "missing"을 돌려주고, 부른 쪽이 통째 쓰기(set)로 만든다.
     돌려주는 값: true(성공) · false(실패) · "missing"(문서 없음) */
  async updateFields(key, patch) {
    if (isViewerNow()) return false; // 보기 전용 계정
    try {
      const r = route(key);
      if (r.kind !== "doc") return false;
      const args = [];
      for (const k of Object.keys(patch || {})) {
        args.push(new FieldPath("v", k), patch[k] === undefined ? deleteField() : patch[k]);
      }
      args.push(new FieldPath("updatedAt"), Date.now());
      if (isWsKey(key)) args.push(new FieldPath("cv"), WS_CV);
      await updateDoc(doc(db, r.path[0], r.path[1]), ...args);
      return true;
    } catch (e) {
      if (e && e.code === "not-found") return "missing";
      console.error("update fail", key, e);
      return false;
    }
  },

  /* updateFields의 제한 시간판 (setT와 같은 이유) */
  updateFieldsT(key, patch, opts) {
    const ms = (opts && opts.timeout) || 8000;
    return Promise.race([
      this.updateFields(key, patch),
      new Promise((res) => setTimeout(() => res(false), ms)),
    ]);
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
    if (isViewerNow()) return false;
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

  /* watchDoc과 같으나 문서 유무와 출처(캐시 사본인지, 이 기기의 미전송 쓰기가 섞였는지)를 함께 준다.
     학생 화면이 자기 기록지를 구독해 다른 기기가 쓴 값을 받을 때 쓴다 (src-ws-sync.mjs):
     fromCache 사본은 로드 때 이미 반영됐고 서버보다 오래됐을 수 있어 부른 쪽이 건너뛴다. */
  watchDocMeta(key, cb) {
    const r = route(key);
    if (r.kind !== "doc") return () => {};
    return onSnapshot(doc(db, r.path[0], r.path[1]), (s) => {
      const m = s.metadata || {};
      if (!s.exists()) return cb({ exists: false, data: null, fromCache: !!m.fromCache, hasPendingWrites: !!m.hasPendingWrites });
      const data = s.data();
      cb({ exists: true, data: data && data.v !== undefined ? data.v : data, fromCache: !!m.fromCache, hasPendingWrites: !!m.hasPendingWrites });
    }, (e) => { console.error("watch fail", key, e); });
  },

  /* 한 학생의 기록지 시점 사본 목록. 실패와 없음을 구분한다 (되돌리기 화면이 빈 목록을 "없음"으로 보이면 안 되므로) */
  async listWsHistory(sid) {
    try {
      const snap = await getDocs(query(collection(db, "wsHistory"), where("v.sid", "==", String(sid))));
      const out = [];
      snap.forEach((d) => { const x = d.data(); const v = x && x.v !== undefined ? x.v : x; if (v && v.ws) out.push({ id: d.id, ...v }); });
      return { ok: true, data: out };
    } catch (e) { console.error("history read fail", sid, e); return { ok: false, data: [] }; }
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

  /* allOf와 같으나 "비어 있음"과 "읽기 실패"를 구분한다 — 학생의 등수 예측 분모처럼
     실패를 0으로 오인하면 되돌릴 수 없는 곳에서 쓴다 (getSafe와 같은 취지) */
  async allOfSafe(name) {
    try {
      const snap = await getDocs(collection(db, safe(name)));
      const out = {};
      snap.forEach((d) => { const x = d.data(); out[d.id] = x && x.v !== undefined ? x.v : x; });
      return { ok: true, data: out, fromCache: !!(snap.metadata && snap.metadata.fromCache) };
    } catch (e) { console.error("allOf fail", name, e); return { ok: false, data: null, fromCache: false }; }
  },

  watchCollection(name, cb) {
    return onSnapshot(collection(db, safe(name)), (snap) => {
      const out = {};
      snap.forEach((d) => { const x = d.data(); out[d.id] = x && x.v !== undefined ? x.v : x; });
      cb(out);
    }, () => {});
  },

  /* 학생 한 명의 명부 문서. 입장 화면이 자기 별명을 확인할 때 쓴다.
     명부 전체(students 컬렉션)는 명부에 오른 사람만 읽으므로(규칙 member()) 처음 입장하는 학생은 읽지 못한다.
     실패와 없음을 구분한다 */
  async getStudent(sid) {
    try {
      const s = await getDoc(doc(db, "students", safe(sid)));
      return { ok: true, data: s.exists() ? s.data() : null };
    } catch (e) { console.error("getStudent fail", sid, e); return { ok: false, data: null }; }
  },

  /* 교사용 학생 관리 —명부 문서를 학번 지정으로 쓰고 지운다 (규칙이 교사만 허용) */
  async setStudent(sid, data) {
    if (isViewerNow()) return false;
    try {
      await setDoc(doc(db, "students", safe(sid)), { ...data, updatedAt: Date.now() }, { merge: true });
      return true;
    } catch (e) { console.error("setStudent fail", sid, e); return false; }
  },

  async removeStudent(sid) {
    if (isViewerNow()) return false;
    try { await deleteDoc(doc(db, "students", safe(sid))); return true; }
    catch (e) { console.error("removeStudent fail", sid, e); return false; }
  },

  /* ---------- 적응형 쪽지시험 (src-quiz-core.mjs 계약, 쪽지시험_구현_근거.md §8) ----------
     응시 문서 quiz/{학번}은 봉투(v·updatedAt) 밖에 서버 시각 필드 startedAt·hb·lockedAt 을 둔다.
     규칙이 startedAt == request.time 과 제한 시간을 서버 시각으로 대조하므로 학생 브라우저의 시계는 믿지 않는다.
     Timestamp는 millis로 바꿔 돌려주고, serverTimestamp가 아직 서버에서 확정되지 않은 로컬 스냅샷에서는 null이다. */

  /* 응시 시작: 문서를 새로 만든다 (merge 없음). 이미 있는 문서에 다시 부르면 startedAt이 바뀌므로
     규칙이 학생의 재시작을 거부한다 — 이어 풀기는 quizPatch로 한다 */
  quizStart(sid, v) {
    if (isViewerNow()) return Promise.resolve(false);
    const write = (async () => {
      try {
        await setDoc(doc(db, "quiz", safe(sid)), { v, startedAt: serverTimestamp(), hb: serverTimestamp(), lockedAt: null, updatedAt: Date.now() });
        return true;
      } catch (e) { console.error("quizStart fail", sid, e); return false; }
    })();
    return Promise.race([write, new Promise((res) => setTimeout(() => res(false), 8000))]);
  },

  /* 진행 갱신: v의 준 필드만 깊은 병합하고 심장박동(hb)을 함께 찍는다.
     vPatch 안에 quizEvent(ev) 같은 FieldValue를 넣어도 되도록 값을 그대로 넘긴다.
     빈 vPatch(심장박동만)일 때 v: {} 를 보내면 merge가 v 전체를 빈 맵으로 바꾸므로 v 자체를 뺀다.
     opts.lock → lockedAt 서버 시각, opts.unlock → lockedAt null (교사 해제)
     opts.noHb → hb 를 찍지 않는다. 교사 화면의 쓰기(결과·오탐·메모·시간 추가·세션 초기화·해제)에 쓴다.
       hb 는 학생 세션의 심장박동이라 교사가 갱신하면 「끊김」 표시와 학생 화면의 중복 접속 판정(hb 60초 안 + sess 다름)이 어긋난다 */
  quizPatch(sid, vPatch, opts) {
    if (isViewerNow()) return Promise.resolve(false);
    const ms = (opts && opts.timeout) || 8000;
    const write = (async () => {
      try {
        const top = { updatedAt: Date.now() };
        if (!(opts && opts.noHb)) top.hb = serverTimestamp();
        if (vPatch && Object.keys(vPatch).length) top.v = vPatch;
        if (opts && opts.lock) top.lockedAt = serverTimestamp();
        if (opts && opts.unlock) top.lockedAt = null;
        await setDoc(doc(db, "quiz", safe(sid)), top, { merge: true });
        return true;
      } catch (e) { console.error("quizPatch fail", sid, e); return false; }
    })();
    return Promise.race([write, new Promise((res) => setTimeout(() => res(false), ms))]);
  },

  /* 이벤트 추가용 FieldValue 보조 함수 — 화면 모듈이 firebase를 직접 import하지 않게 한다 */
  quizEvent(ev) { return arrayUnion(ev); },

  /* 서버에서 되읽기 (캐시 안 씀). serverNowMs는 방금 쓴 hb의 서버 시각이므로
     쓰기 직후에 불렀을 때만 「지금 서버 시각」의 뜻이 있다 */
  async quizReadServer(sid) {
    try {
      const s = await getDocFromServer(doc(db, "quiz", safe(sid)));
      if (!s.exists()) return { ok: true, data: null };
      const d = quizShape(s.data());
      return { ok: true, data: { ...d, serverNowMs: d.hbMs } };
    } catch (e) { console.error("quizReadServer fail", sid, e); return { ok: false, data: null }; }
  },

  /* 자기 응시 문서 구독 (잠금 해제·재개 허용을 기다릴 때). 없으면 cb(null) */
  quizWatch(sid, cb) {
    return onSnapshot(doc(db, "quiz", safe(sid)), (s) => {
      if (!s.exists()) return cb(null);
      cb(quizShape(s.data()));
    }, () => {});
  },

  /* 교사: 응시 문서 전체 구독 → { [학번]: { v, startedAtMs, hbMs, lockedAtMs } } */
  quizWatchAll(cb) {
    return onSnapshot(collection(db, "quiz"), (snap) => {
      const out = {};
      snap.forEach((d) => { out[d.id] = quizShape(d.data()); });
      cb(out);
    }, () => {});
  },

  /* 교사 재계산용: 서버에서 전체 읽기, 같은 모양. 실패는 ok:false (빈 학급과 구분) */
  async quizAllServer() {
    try {
      const snap = await getDocsFromServer(collection(db, "quiz"));
      const out = {};
      snap.forEach((d) => { out[d.id] = quizShape(d.data()); });
      return { ok: true, data: out };
    } catch (e) { console.error("quizAllServer fail", e); return { ok: false, data: null }; }
  },
};

/* 응시 문서의 서버 시각 필드를 millis로. 대기 중인 serverTimestamp(로컬 스냅샷)는 null */
const tsMs = (x) => (x && typeof x.toMillis === "function" ? x.toMillis() : null);
function quizShape(data) {
  const d = data || {};
  return { v: d.v !== undefined ? d.v : null, startedAtMs: tsMs(d.startedAt), hbMs: tsMs(d.hb), lockedAtMs: tsMs(d.lockedAt) };
}
