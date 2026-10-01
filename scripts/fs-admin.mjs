/* Firestore REST 접근 보조 (백업·복원 스크립트 공용).
   Firebase CLI의 현재 로그인(firebase login)을 그대로 쓰므로 서비스 계정 키 파일이 필요 없다.
   프로젝트 아이디는 .firebaserc에서 읽는다. */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

/* 저장소 루트. new URL(import.meta.url).pathname 은 공백·한글을 %xx 로 남겨 경로가 어긋나므로 fileURLToPath 로 만든 이 값을 쓴다 */
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const BACKUP_DIR = path.join(ROOT, ".backup");

export function projectId() {
  try {
    const rc = JSON.parse(fs.readFileSync(path.join(ROOT, ".firebaserc"), "utf8"));
    return rc.projects && rc.projects.default;
  } catch (e) { return "class-9f074"; }
}

export async function accessToken() {
  const req = createRequire(import.meta.url);
  const cliRoot = path.join(process.env.APPDATA || "", "npm", "node_modules", "firebase-tools", "lib");
  let auth;
  try { auth = req(path.join(cliRoot, "auth.js")); }
  catch (e) { throw new Error("전역 firebase-tools를 찾지 못했습니다. `npm i -g firebase-tools` 뒤 `firebase login`을 먼저 하세요."); }
  const account = auth.getProjectDefaultAccount(ROOT) || auth.getGlobalDefaultAccount();
  if (!account || !account.tokens || !account.tokens.refresh_token) throw new Error("Firebase CLI 로그인이 없습니다. `firebase login`을 먼저 하세요.");
  const t = await auth.getAccessToken(account.tokens.refresh_token, [
    "email", "openid", "https://www.googleapis.com/auth/cloudplatformprojects.readonly",
    "https://www.googleapis.com/auth/firebase", "https://www.googleapis.com/auth/cloud-platform",
  ]);
  return t.access_token;
}

export function base() {
  return `https://firestore.googleapis.com/v1/projects/${projectId()}/databases/(default)/documents`;
}

/* Firestore 값 ↔ JS 값 */
export function decode(f) {
  if (!f || typeof f !== "object") return null;
  if ("stringValue" in f) return f.stringValue;
  if ("integerValue" in f) return Number(f.integerValue);
  if ("doubleValue" in f) return f.doubleValue;
  if ("booleanValue" in f) return f.booleanValue;
  if ("nullValue" in f) return null;
  if ("timestampValue" in f) return f.timestampValue;
  if ("arrayValue" in f) return (f.arrayValue.values || []).map(decode);
  if ("mapValue" in f) return Object.fromEntries(Object.entries(f.mapValue.fields || {}).map(([k, v]) => [k, decode(v)]));
  return null;
}
export function encode(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)])) } };
}

/* 컬렉션 전체를 { 문서이름: {_createTime, _updateTime, ...필드} }로. readTime을 주면 그 시점(PITR 보관 기간 안)의 상태를 읽는다 */
export async function listCollection(token, col, { readTime, mask } = {}) {
  const out = {};
  let pageToken = "";
  for (;;) {
    const qs = new URLSearchParams({ pageSize: "300" });
    if (pageToken) qs.set("pageToken", pageToken);
    if (readTime) qs.set("readTime", readTime);
    if (mask) for (const m of mask) qs.append("mask.fieldPaths", m);
    const r = await fetch(`${base()}/${col}?${qs}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw new Error(`${col} 읽기 실패 ${r.status} ${(await r.text()).slice(0, 300)}`);
    const j = await r.json();
    for (const d of j.documents || []) {
      const id = d.name.split("/").pop();
      out[id] = { _createTime: d.createTime, _updateTime: d.updateTime, ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, decode(v)])) };
    }
    if (!j.nextPageToken) break;
    pageToken = j.nextPageToken;
  }
  return out;
}

export async function getDoc(token, col, id, { readTime } = {}) {
  const qs = readTime ? `?readTime=${encodeURIComponent(readTime)}` : "";
  const r = await fetch(`${base()}/${col}/${encodeURIComponent(id)}${qs}`, { headers: { Authorization: `Bearer ${token}` } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`${col}/${id} 읽기 실패 ${r.status} ${(await r.text()).slice(0, 300)}`);
  const d = await r.json();
  return { _createTime: d.createTime, _updateTime: d.updateTime, ...Object.fromEntries(Object.entries(d.fields || {}).map(([k, v]) => [k, decode(v)])) };
}

/* 문서 전체를 덮어쓴다(없으면 만든다). fields는 { 필드: JS값 } */
export async function putDoc(token, col, id, fields) {
  const body = { fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, encode(v)])) };
  const r = await fetch(`${base()}/${col}/${encodeURIComponent(id)}`, { method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${col}/${id} 쓰기 실패 ${r.status} ${(await r.text()).slice(0, 300)}`);
  return r.json();
}

/* 앱이 문서에 쓰는 형태는 { v: 값 } 이다 (src-fb.js). 백업 파일의 문서에서 앱 값을 꺼낸다 */
export const unwrap = (d) => (d && d.v !== undefined ? d.v : d);

/* 기록지 요약: 채운 칸 수와 글자 수 (밑줄 키는 보조 기록이라 뺀다). src-ws-history.jsx의 summarize와 같은 기준 */
export function summarize(ws) {
  let fields = 0, chars = 0;
  const walk = (v) => {
    if (typeof v === "string") { chars += v.trim().length; return v.trim().length > 0; }
    if (Array.isArray(v)) { let any = false; v.forEach((x) => { if (walk(x)) any = true; }); return any; }
    if (v && typeof v === "object") { let any = false; Object.keys(v).forEach((k) => { if (walk(v[k])) any = true; }); return any; }
    return v != null && v !== "";
  };
  for (const k of Object.keys(ws || {})) { if (k.charAt(0) === "_") continue; if (walk(ws[k])) fields++; }
  return { fields, chars };
}

export const stamp = (d = new Date()) => {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
};

/* .backup/ 의 폴더를 담긴 자료의 시각 순(오래된 것 먼저)으로 돌려준다. 이름순으로 고르면 안 된다:
   「은행내림_…」「복구문구_…」「firestore-…」처럼 날짜로 시작하지 않는 폴더가 날짜 폴더보다 늘 뒤에 오고,
   --at 시점 백업은 이름의 시각(실행한 때)과 담긴 시점이 다르다. 시각은 INFO.json 의 readTime(시점 백업) → savedAt(백업)
   → takenDownAt(은행 내림) 순으로 보고, INFO.json 이 없으면 폴더 수정 시각을 쓴다. before(ms)를 주면 그 시각까지의 것만 */
export function backupDirsByTime(filter = () => true, { before = Infinity } = {}) {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  const timeOf = (d) => {
    try {
      const info = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, d, "INFO.json"), "utf8"));
      const t = Date.parse(info.readTime || info.savedAt || info.takenDownAt || "");
      if (Number.isFinite(t)) return t;
    } catch (e) { /* INFO.json 이 없는 폴더 */ }
    return fs.statSync(path.join(BACKUP_DIR, d)).mtimeMs;
  };
  return fs.readdirSync(BACKUP_DIR)
    .filter((d) => fs.statSync(path.join(BACKUP_DIR, d)).isDirectory() && filter(d))
    .map((d) => ({ d, t: timeOf(d) }))
    .filter((x) => x.t <= before)
    .sort((a, b) => a.t - b.t || (a.d < b.d ? -1 : a.d > b.d ? 1 : 0))
    .map((x) => x.d);
}

/* 은행 문서(quizBank·quizKeys)의 값. 교사 화면은 { v, updatedAt } 봉투로 쓰고 scripts/quiz-bank-upload.mjs 는 필드를 그대로 쓴다.
   스크립트로 올린 문서에 교사 화면이 정정을 병합하면(setT("quizKeys", { corrections }, { merge: true })) 한 문서에 두 꼴이 섞이므로
   바깥 필드 위에 v 를 덮어 셋 다 받는다. listCollection·getDoc 이 붙인 _createTime·_updateTime 은 뺀다 */
export function bankDocValue(d) {
  if (!d || typeof d !== "object") return null;
  const out = { ...d, ...(d.v !== null && typeof d.v === "object" ? d.v : {}) };
  delete out.v; delete out._createTime; delete out._updateTime; delete out.updatedAt;
  return out;
}

/* 정답이 든 파일(은행·정답표·열람 HTML)을 p 에 써도 되는가. 저장소 밖이거나 .gitignore 가 가리는 자리여야 한다.
   공개 저장소라 그 밖의 자리에 두면 git add -A 한 번으로 정답이 올라간다. git 을 부르지 못하면 안전하다고 보지 않는다.
   public/ 은 .gitignore 가 가려도(public/quiz-bank/ 등) firebase deploy 가 그대로 올리는 사이트 폴더이고,
   .tmpbuild/ 는 배포용 임시 트리라 둘 다 받지 않는다 */
export function secretPathOk(p) {
  const rel = path.relative(ROOT, path.resolve(p));
  if (rel.startsWith("..") || path.isAbsolute(rel)) return true;
  const top = rel.split(path.sep)[0].toLowerCase();   // Windows 경로는 대소문자를 가리지 않는다
  if (top === "public" || top === ".tmpbuild") return false;
  try {
    execFileSync("git", ["check-ignore", "-q", "--", rel.split(path.sep).join("/")], { cwd: ROOT, stdio: "ignore" });
    return true;
  } catch (e) { return false; }
}
