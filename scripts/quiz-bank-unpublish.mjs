/* 올려 둔 문항 은행을 Firestore에서 내린다 (시험을 치르기 전까지는 올려 둘 까닭이 없다).

     node scripts/quiz-bank-unpublish.mjs            무엇이 지워질지 보여 주기만 한다(연습 실행)
     node scripts/quiz-bank-unpublish.mjs --yes      사본을 받아 두고 실제로 지운다
     node scripts/quiz-bank-unpublish.mjs --yes --force
                                                     아래 「막음」 사유가 있어도 지운다

   하는 일: quizBank/v1(공개부)와 quizKeys/v1(정답부)를 .backup/은행내림_<시각>/ 에 저장한 뒤 지우고,
   meta/config 의 quiz.bankVer 를 비운다. 단계가 닫혀 있으면 학생 화면에 시험 탭이 없고, 은행 없이 단계를 열면
   「선생님이 아직 문항 은행을 올리지 않았습니다」가 보인다.
   막는 경우: 단계가 닫힘이 아님, 응시 문서가 있음, 이 PC의 quiz-bank/bank.json 이 서버본을 다 담고 있지 않음(없음·검증 실패·
   서버에만 있는 문항이나 다른 필드·정정 기록). 사본은 이 PC의 .backup/ 에만 남으므로 지운 뒤에는 서버 쪽 사본이 없다.
   다시 올리려면 교사 화면 「문항 은행」 카드나 node scripts/quiz-bank-upload.mjs 를 쓴다. */
import fs from "node:fs";
import path from "node:path";
import { accessToken, base, getDoc, listCollection, BACKUP_DIR, ROOT, stamp, encode, bankDocValue } from "./fs-admin.mjs";
import { splitBank, mergeBank, validateBank } from "../src-quiz-core.mjs";

const args = process.argv.slice(2);
const yes = args.includes("--yes");
const force = args.includes("--force");

const token = await accessToken();
const pubDoc = await getDoc(token, "quizBank", "v1");
const keyDoc = await getDoc(token, "quizKeys", "v1");
const cfgDoc = await getDoc(token, "meta", "config");
const cfg = (cfgDoc && cfgDoc.v) || {};
const quiz = cfg.quiz || {};

if (!pubDoc && !keyDoc) {
  console.log("올라가 있는 은행이 없습니다. 내릴 것이 없습니다.");
  process.exit(0);
}
const pub = bankDocValue(pubDoc) || {}, keys = bankDocValue(keyDoc) || {};
console.log("올라가 있는 은행");
console.log("  quizBank/v1: ver " + (pub.ver || "?") + " · 문항 " + ((pub.items || []).length) + " · 연습 " + ((pub.practice || []).length));
console.log("  quizKeys/v1: ver " + (keys.ver || "?") + " · 문항 " + Object.keys(keys.items || {}).length + " · 정정 " + ((keys.corrections || []).length));
console.log("  meta/config: stage " + (quiz.stage || "closed") + " · bankVer " + (quiz.bankVer || "(없음)"));

/* 서버에만 있는 내용이 없는지 확인한다. 두 문서를 mergeBank 로 은행 파일 꼴로 되돌려 이 PC의 파일과 문항·필드 단위로 견준다.
   정답만 견주면 문두·보기·도판·해설·버전이 달라도 「모두 담고 있음」이 된다. 이 PC 쪽에만 있는 필드(예: 예전 번들로 올려
   정답부에 없는 5급 사례 필드)는 서버에 없는 것이라 문제 삼지 않는다 */
const localPath = path.join(ROOT, "quiz-bank", "bank.json");
let onlyOnServer = [];
if (!fs.existsSync(localPath)) {
  onlyOnServer.push("이 PC에 quiz-bank/bank.json 이 없습니다");
} else {
  const local = JSON.parse(fs.readFileSync(localPath, "utf8"));
  const rep = validateBank(local);
  if (!rep.ok) onlyOnServer.push("이 PC의 은행이 검증을 통과하지 못합니다(오류 " + rep.errors.length + "건)");
  const sp = splitBank(local);
  const mine = mergeBank(sp.pub, sp.keys);
  const server = mergeBank(pub, keys);
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  if (!same(server.ver, mine.ver)) onlyOnServer.push("은행 버전이 다릅니다(서버 " + (server.ver || "?") + ", 이 PC " + (mine.ver || "?") + ")");
  if (!same(server.seedSalt, mine.seedSalt)) onlyOnServer.push("seedSalt 가 서버와 다릅니다");
  if (!same(server.practice, mine.practice)) onlyOnServer.push("연습 문항이 서버와 다릅니다");
  const mineItems = new Map(mine.items.map((it) => [String(it.id), it]));
  server.items.forEach((s) => {
    const m = mineItems.get(String(s.id));
    if (!m) { onlyOnServer.push("서버에만 있는 문항 " + s.id); return; }
    const fields = Object.keys(s).filter((k) => !same(s[k], m[k]));
    if (fields.length) onlyOnServer.push("문항 " + s.id + ": 서버와 다른 필드 " + fields.join("·"));
  });
  if ((keys.corrections || []).length) onlyOnServer.push("정정 기록 " + keys.corrections.length + "건은 은행 파일에 없습니다(사본에만 남습니다)");
  console.log("  이 PC 은행: ver " + local.ver + " · 문항 " + ((local.items || []).length) + (onlyOnServer.length ? "" : " · 서버본을 모두 담고 있음"));
}
onlyOnServer.slice(0, 8).forEach((m) => console.log("  주의: " + m));
if (onlyOnServer.length > 8) console.log("  주의: 그 밖에 " + (onlyOnServer.length - 8) + "건");

const blocked = [];
if ((quiz.stage || "closed") !== "closed") blocked.push("시험 단계가 「" + quiz.stage + "」입니다. 진행 중이면 학생이 문항을 읽지 못합니다");
/* 응시 문서가 하나라도 있는가. 읽기에 실패하면 멈춘다(실패를 「없음」으로 읽으면 채점에 필요한 은행을 지운다) */
let attempts;
try { attempts = await listCollection(token, "quiz", { mask: ["updatedAt"] }); }
catch (e) { console.error("응시 문서가 있는지 확인하지 못해 멈춥니다: " + ((e && e.message) || e)); process.exit(1); }
if (Object.keys(attempts).length > 0) blocked.push("응시 문서가 있습니다. 채점·재계산에 은행이 필요합니다");
if (onlyOnServer.length) blocked.push("이 PC의 은행 파일이 서버본을 다 담고 있지 않습니다(위 주의). 지우면 서버 쪽 내용은 이 PC의 .backup/ 사본에만 남습니다");
blocked.forEach((m) => console.log("  막음: " + m));

if (!yes) { console.log("\n연습 실행이라 아무것도 바꾸지 않았습니다. 실제로 내리려면 --yes 를 붙이세요."); process.exit(0); }
if (blocked.length && !force) { console.error("\n위 사유로 내리지 않았습니다. 그래도 내리려면 --force 를 붙이세요."); process.exit(1); }

/* 1. 사본 저장 */
const dir = path.join(BACKUP_DIR, "은행내림_" + stamp());
fs.mkdirSync(dir, { recursive: true });
if (pubDoc) fs.writeFileSync(path.join(dir, "quizBank.json"), JSON.stringify({ v1: pubDoc }, null, 1), "utf8");
if (keyDoc) fs.writeFileSync(path.join(dir, "quizKeys.json"), JSON.stringify({ v1: keyDoc }, null, 1), "utf8");
fs.writeFileSync(path.join(dir, "INFO.json"), JSON.stringify({ takenDownAt: new Date().toISOString(), ver: pub.ver || "", stage: quiz.stage || "closed", bankVer: quiz.bankVer || "", notes: onlyOnServer }, null, 1), "utf8");
console.log("\n사본을 저장했습니다: " + path.relative(ROOT, dir));

/* 2. 지우기 */
const del = async (col, id) => {
  const r = await fetch(`${base()}/${col}/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(col + "/" + id + " 지우기 실패 " + r.status + " " + (await r.text()).slice(0, 200));
  console.log("  지웠습니다: " + col + "/" + id);
};
if (pubDoc) await del("quizBank", "v1");
if (keyDoc) await del("quizKeys", "v1");

/* 3. 설정의 은행 버전 비우기 (다른 설정은 건드리지 않는다) */
const r = await fetch(`${base()}/meta/config?updateMask.fieldPaths=v.quiz.bankVer`, {
  method: "PATCH", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ fields: { v: encode({ quiz: { bankVer: "" } }) } }),
});
if (!r.ok) console.error("  설정의 bankVer 를 비우지 못했습니다: " + r.status + " " + (await r.text()).slice(0, 200));
else console.log("  meta/config 의 quiz.bankVer 를 비웠습니다");

/* 4. 확인 */
const after = await getDoc(token, "quizBank", "v1");
const after2 = await getDoc(token, "quizKeys", "v1");
console.log("\n내린 뒤 확인: quizBank/v1 " + (after ? "남아 있음(실패)" : "없음") + " · quizKeys/v1 " + (after2 ? "남아 있음(실패)" : "없음"));
console.log("이제 은행은 이 PC에만 있습니다(quiz-bank/bank.json 과 " + path.relative(ROOT, dir) + "). PC를 잃을 때를 대비해 USB 같은 다른 저장 장치에도 한 부 두세요. 공유 폴더나 메신저에는 두지 않습니다.");
console.log("다시 올리려면 교사 화면 「문항 은행」 카드에서 quiz-bank/bank.json 을 고르거나 node scripts/quiz-bank-upload.mjs 를 쓰세요.");
