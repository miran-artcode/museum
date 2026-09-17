/* Firestore REST 접근 보조 (백업·복원 스크립트 공용).
   Firebase CLI의 현재 로그인(firebase login)을 그대로 쓰므로 서비스 계정 키 파일이 필요 없다.
   프로젝트 아이디는 .firebaserc에서 읽는다. */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
