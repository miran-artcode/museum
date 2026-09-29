/* 문항 은행 되살리기 — 백업의 공개부(quizBank)와 정답부(quizKeys)를 합쳐 quiz-bank/bank.json 을 다시 만든다.

   은행 원본은 정답이 들어 있어 공개 저장소에 올리지 않는다(.gitignore). 그래서 교사 PC의 파일이 사라지면
   Firestore의 두 문서가 유일한 사본이고, npm run backup 이 그 둘을 .backup/ 에 함께 내려받는다.

     node scripts/quiz-bank-restore.mjs                     은행이 든 백업 가운데 가장 최근 것에서 되살린다
     node scripts/quiz-bank-restore.mjs 2026-09-23_1830     .backup/ 안의 그 폴더에서 (경로를 써도 된다)
     node scripts/quiz-bank-restore.mjs --live              Firestore의 지금 문서에서 바로 되살린다
     node scripts/quiz-bank-restore.mjs --out .backup/복구본.json
                                                            덮어쓰지 않고 다른 이름으로 쓴다(--out=경로 도 된다).
                                                            정답이 들어 있으므로 저장소 안에서는 .gitignore 가 가리는 자리만 받는다

   이미 quiz-bank/bank.json 이 있으면 덮어쓰기 전에 어느 문항이 다른지 알리고 --force 를 요구한다.
   --force 로 덮어쓸 때는 지금 파일을 .backup/은행덮어쓰기전_<시각>/ 에 먼저 복사한다(bank.json 은 git 에 없다). */
import fs from "node:fs";
import path from "node:path";
import { mergeBank, validateBank, keyHashOf } from "../src-quiz-core.mjs";
import { accessToken, listCollection, BACKUP_DIR, ROOT, stamp, backupDirsByTime, bankDocValue, secretPathOk } from "./fs-admin.mjs";

const args = process.argv.slice(2);
const has = (n) => args.includes("--" + n);
/* --out 경로 와 --out=경로 를 모두 받는다(다른 스크립트는 --at=… 꼴을 쓴다). 못 알아들으면 기본 경로 bank.json 에 써 버린다 */
const val = (n) => {
  const i = args.indexOf("--" + n);
  if (i >= 0 && args[i + 1] && !args[i + 1].startsWith("--")) return args[i + 1];
  const eq = args.find((a) => a.startsWith("--" + n + "="));
  return eq ? eq.slice(n.length + 3) : null;
};
const outArg = val("out");
const outPath = path.resolve(outArg || path.join(ROOT, "quiz-bank", "bank.json"));
const dirArg = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--out");
if (outArg && !secretPathOk(outPath)) {
  console.error("정답이 든 파일을 " + outArg + " 에 쓰지 않습니다. 공개 저장소에 올라가거나(.gitignore 밖) 사이트로 배포되는(public/) 자리입니다.");
  console.error("  .backup/ 이나 quiz-bank/items/ 안, 또는 저장소 밖 경로를 쓰세요. 예) --out .backup/복구본.json");
  process.exit(1);
}

/* 백업 파일은 { v1: { …필드, _createTime, _updateTime } } 꼴이다(listCollection). 문서 값은 bankDocValue 가 꺼낸다 */
const docOf = (docs) => (docs && typeof docs === "object" && (docs.v1 || docs[Object.keys(docs)[0]])) || null;
const pick = (docs, label) => {
  const d = bankDocValue(docOf(docs));
  if (!d) throw new Error(label + " 문서가 없습니다.");
  return d;
};

let pub, keys, from;
try {
  if (has("live")) {
    const token = await accessToken();
    const hint = " 은행을 내려 둔 상태면 Firestore에는 없습니다. 백업 폴더에서 되살리세요.";
    try {
      pub = pick(await listCollection(token, "quizBank"), "Firestore quizBank");
      keys = pick(await listCollection(token, "quizKeys"), "Firestore quizKeys");
    } catch (e) { throw new Error(((e && e.message) || e) + hint); }
    from = "Firestore(지금 상태)";
  } else {
    let dir;
    if (dirArg) {
      /* scripts/restore-worksheet.mjs 처럼 .backup/ 안의 폴더 이름만 써도 된다 */
      dir = path.isAbsolute(dirArg) || fs.existsSync(path.resolve(dirArg)) ? path.resolve(dirArg) : path.join(BACKUP_DIR, dirArg);
      if (!fs.existsSync(dir)) throw new Error("백업 폴더가 없습니다: " + dirArg);
    } else {
      /* 두 문서가 실제로 든 폴더 가운데 담긴 시각이 가장 늦은 것. 은행을 내려 둔 동안 받은 백업의 quizBank.json 은 빈 {} 이라 건너뛴다 */
      const hasDocs = (d) => ["quizBank", "quizKeys"].every((n) => {
        try { return !!docOf(JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, d, n + ".json"), "utf8"))); } catch (e) { return false; }
      });
      const dirs = backupDirsByTime(hasDocs);
      if (!dirs.length) throw new Error("은행이 든 백업 폴더가 없습니다. npm run backup 을 먼저 실행하거나 --live 를 쓰세요.");
      dir = path.join(BACKUP_DIR, dirs[dirs.length - 1]);
    }
    const read = (name) => {
      const p = path.join(dir, name + ".json");
      if (!fs.existsSync(p)) throw new Error("파일이 없습니다: " + p + ". 이 백업은 은행을 함께 받기 전에 만든 것입니다.");
      return pick(JSON.parse(fs.readFileSync(p, "utf8")), path.relative(ROOT, p));
    };
    pub = read("quizBank");
    keys = read("quizKeys");
    from = path.relative(ROOT, dir);
  }
} catch (e) {
  console.error((e && e.message) || e);
  process.exit(1);
}

const bank = mergeBank(pub, keys);
const report = validateBank(bank);
const text = JSON.stringify(bank, null, 1);

console.log("되살린 은행: " + (bank.ver || "(버전 없음)") + " · " + bank.items.length + "문항 · 연습 " + bank.practice.length + "문항 (출처: " + from + ")");

/* 두 문서가 한 벌인지 본다. 교사 화면은 공개부와 정답부를 차례로 쓰므로 둘째 쓰기가 실패한 사이에 받은 사본은 버전이 섞일 수 있고,
   섞인 채 합치면 새 문두에 옛 정답이 붙는데 validateBank 는 이를 잡지 못한다. 공개부의 keyHash 는 정답에서 만든 값이라 문항마다 대조한다 */
const pairErr = [];
if (String(pub.ver || "") !== String(keys.ver || "")) pairErr.push("버전이 다릅니다(공개부 " + (pub.ver || "?") + ", 정답부 " + (keys.ver || "?") + ")");
if (String(pub.seedSalt || "") !== String(keys.seedSalt || "")) pairErr.push("seedSalt 가 다릅니다");
const hashOf = new Map((Array.isArray(pub.items) ? pub.items : []).map((it) => [String(it.id), it.keyHash]));
const badKey = bank.items.filter((it) => it.answer != null && hashOf.get(String(it.id)) !== keyHashOf(it.id, it.answer, bank.seedSalt)).map((it) => it.id);
if (badKey.length) pairErr.push("정답이 공개부의 keyHash 와 맞지 않는 문항 " + badKey.length + "개(" + badKey.slice(0, 5).join(", ") + (badKey.length > 5 ? " 외" : "") + ")");
if (pairErr.length) {
  console.error("공개부와 정답부가 한 벌이 아니라 저장하지 않습니다");
  pairErr.forEach((m) => console.error("  " + m));
  console.error("  다른 백업 폴더를 지정해 다시 실행하세요.");
  process.exit(1);
}
if (!report.ok) {
  console.error("검증 오류 " + report.errors.length + "건이라 저장하지 않습니다");
  report.errors.slice(0, 10).forEach((e) => console.error("  " + e));
  process.exit(1);
}
if (report.warnings.length) report.warnings.slice(0, 10).forEach((w) => console.log("  경고: " + w));
/* 5급 사례 필드는 정답부에만 실린다. 이 필드를 정답부에 싣기 전의 splitBank(예전 번들 public/app.js 의 교사 화면 포함)로 올린
   은행의 사본에서는 되살아나지 않는다. 문두에는 사례가 들어 있어 시험에는 지장이 없다 */
const noCase = bank.items.filter((it) => it.level === 5 && (it.case == null || it.question == null || it.caseLen == null)).map((it) => it.id);
if (noCase.length) console.log("  경고: 5급 " + noCase.length + "문항에 사례 필드(case·question·caseLen)가 없습니다. 사례 필드를 정답부에 싣기 전에 올린 은행의 사본입니다. 문두는 온전하지만 사례 길이 검사와 bank-view 의 사례 표시가 빠집니다.");
const corr = Array.isArray(keys.corrections) ? keys.corrections.filter((c) => c && c.itemId != null) : [];
if (corr.length) console.log("  정정 " + corr.length + "건(" + corr.map((c) => c.itemId).join(", ") + ")은 은행 파일에 들어가지 않습니다. 서버의 정답부가 지워진 뒤 은행을 다시 올렸다면 「문항 오류 정정」에서 다시 넣으세요.");

if (fs.existsSync(outPath)) {
  const cur = fs.readFileSync(outPath, "utf8");
  if (cur === text) { console.log("이미 같은 내용입니다: " + path.relative(ROOT, outPath)); process.exit(0); }
  if (!has("force")) {
    let curBank = null;
    try { curBank = JSON.parse(cur); } catch (e) { curBank = null; }
    console.error("이미 있는 파일과 내용이 다릅니다: " + path.relative(ROOT, outPath));
    if (curBank) {
      console.error("  지금 파일 " + (curBank.ver || "?") + " · " + ((curBank.items || []).length) + "문항 / 되살린 것 " + (bank.ver || "?") + " · " + bank.items.length + "문항");
      /* 버전과 문항 수가 같아도 내용은 다를 수 있다(예: 사례 필드가 빠진 사본). 어느 문항의 어느 필드가 다른지 보인다 */
      const curItems = new Map((Array.isArray(curBank.items) ? curBank.items : []).filter(Boolean).map((it) => [String(it.id), it]));
      const newIds = new Set(bank.items.map((it) => String(it.id)));
      const diffs = [];
      bank.items.forEach((it) => {
        const c = curItems.get(String(it.id));
        if (!c) { diffs.push(it.id + "(지금 파일에 없음)"); return; }
        const fields = [...new Set([...Object.keys(c), ...Object.keys(it)])].filter((k) => JSON.stringify(c[k]) !== JSON.stringify(it[k]));
        if (fields.length) diffs.push(it.id + "(" + fields.join("·") + ")");
      });
      curItems.forEach((c, id) => { if (!newIds.has(id)) diffs.push(id + "(되살린 것에 없음)"); });
      if (diffs.length) console.error("  다른 문항 " + diffs.length + "개: " + diffs.slice(0, 8).join(", ") + (diffs.length > 8 ? " 외" : ""));
    }
    console.error("  덮어쓰려면 --force(지금 파일은 .backup/ 에 먼저 복사합니다), 따로 저장하려면 --out .backup/복구본.json");
    process.exit(1);
  }
  /* bank.json 은 git 에 없어 덮어쓰면 되돌릴 사본이 없다. .backup/(gitignore)에 먼저 복사한다 */
  let keep = path.join(BACKUP_DIR, "은행덮어쓰기전_" + stamp());
  for (let i = 2; fs.existsSync(keep); i += 1) keep = path.join(BACKUP_DIR, "은행덮어쓰기전_" + stamp() + "_" + i);
  fs.mkdirSync(keep, { recursive: true });
  fs.writeFileSync(path.join(keep, path.basename(outPath)), cur, "utf8");
  console.log("덮어쓰기 전 파일을 복사해 두었습니다: " + path.relative(ROOT, path.join(keep, path.basename(outPath))));
}
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, text, "utf8");
console.log("저장했습니다: " + path.relative(ROOT, outPath));
