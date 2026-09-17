/* Firebase CLI의 현재 로그인으로 기본 은행을 Firestore에 배치한다. 정답부는 quizKeys/v1에만 쓴다. */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { splitBank, validateBank } from "../src-quiz-core.mjs";

const req = createRequire(import.meta.url);
const cliRoot = path.join(process.env.APPDATA || "", "npm", "node_modules", "firebase-tools", "lib");
const auth = req(path.join(cliRoot, "auth.js"));
const account = auth.getProjectDefaultAccount(process.cwd()) || auth.getGlobalDefaultAccount();
if (!account || !account.tokens || !account.tokens.refresh_token) throw new Error("Firebase CLI 로그인이 없습니다.");
const token = await auth.getAccessToken(account.tokens.refresh_token, [
  "email", "openid", "https://www.googleapis.com/auth/cloudplatformprojects.readonly",
  "https://www.googleapis.com/auth/firebase", "https://www.googleapis.com/auth/cloud-platform",
]);
const access = token.access_token;
const bank = JSON.parse(fs.readFileSync(new URL("../quiz-bank/bank.json", import.meta.url), "utf8"));
const report = validateBank(bank);
if (!report.ok) throw new Error(report.errors.join("\n"));
const { pub, keys } = splitBank(bank);
const value = (v) => {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(value) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, value(x)])) } };
};
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, value(v)]));
const base = "https://firestore.googleapis.com/v1/projects/class-9f074/databases/(default)/documents";
const put = async (url, body) => {
  const r = await fetch(url, { method: "PATCH", headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
};
await put(`${base}/quizBank/v1`, { fields: fields(pub) });
await put(`${base}/quizKeys/v1`, { fields: fields(keys) });
await put(`${base}/meta/config?updateMask.fieldPaths=v.quiz.bankVer`, { fields: { v: value({ quiz: { bankVer: pub.ver } }) } });
console.log(`Firestore 은행 배치 완료: ${pub.ver}, ${pub.itemCount}문항`);
