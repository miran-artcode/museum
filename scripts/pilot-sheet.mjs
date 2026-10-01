/* 시험 전 사전 점검 자료 만들기 (쪽지시험_구현_근거.md §5.7.6, §9.1 1번).

   급은 인지 수준으로 정했고 난이도 자료는 아직 없다. 특히 2급(작가·작품·연도 연결)은 회상만으로 풀어야 하고
   3급(개념 이해)은 단서가 문두 안에 있어, 2급이 3급보다 어려울 수 있다. 그러면 라우팅이 학생을 잘못 내린다.
   동료 교사나 전년도 학생 서너 명에게 2급·3급 블록을 실제로 풀려 보고 정답률이 뒤집히지 않는지 확인한다.

     node scripts/pilot-sheet.mjs                        2·3급 A반 블록을 뽑아 문항지·정답표·기록표를 만든다
     node scripts/pilot-sheet.mjs --levels 1,2,3 --half B
     node scripts/pilot-sheet.mjs --out quiz-bank/items  저장 폴더 지정 (기본값이 이 폴더, .gitignore 대상)
     node scripts/pilot-sheet.mjs --score quiz-bank/items/사전점검_기록.csv
                                                         채워 넣은 기록표를 읽어 급별 정답률과 역전 여부를 보고한다
     (npm 으로 부를 때는 npm run pilot -- --score … 처럼 -- 를 넣는다. 빠지면 npm 이 --score 를 가져간다)

   문항지에는 정답이 없다. 정답표는 채점자만 본다. 두 파일 모두 quiz-bank/items/ 안에 만들어지며 이 폴더는
   .gitignore에 있어 공개 저장소로 올라가지 않는다. --out 으로 저장소 안의 다른 자리를 고르면 .gitignore 가 가리는지 먼저 본다.
   기록표(사전점검_기록.csv)에 적어 둔 값이 있으면 다시 실행해도 덮어쓰지 않는다. */
import fs from "node:fs";
import path from "node:path";
import { drawBlock, deriveSeed, optionOrder, LEVEL_NAMES, LEVEL_SEC, LEVEL_TARGET_P, LEVEL_P_RANGE, AREAS, BLOCK_SIZE } from "../src-quiz-core.mjs";
import { ROOT, secretPathOk } from "./fs-admin.mjs";

const BOM = String.fromCharCode(0xfeff);
const args = process.argv.slice(2);
const flag = (name, def) => {
  const i = args.indexOf("--" + name);
  if (i >= 0 && args[i + 1] && !args[i + 1].startsWith("--")) return args[i + 1];
  const eq = args.find((a) => a.startsWith("--" + name + "="));
  return eq ? eq.slice(name.length + 3) : def;
};
/* 기록표를 넘겼는데 채점 모드로 알아듣지 못하면 문항지 만들기로 넘어가므로 여기서 멈춘다 */
if (args.includes("--score") && !flag("score", "")) { console.error("--score 뒤에 기록표 경로를 쓰세요. 예) npm run pilot -- --score quiz-bank/items/사전점검_기록.csv"); process.exit(1); }
if (!flag("score", "") && args.some((a) => /\.csv$/i.test(a))) { console.error("기록표 경로만 받았습니다. 채점하려면 npm run pilot -- --score " + args.find((a) => /\.csv$/i.test(a)) + " 처럼 --score 를 붙이세요."); process.exit(1); }

/* ---------- 채점 모드 ---------- */
const scorePath = flag("score", "");
if (scorePath) {
  /* 받은사람수 = 그 문항을 받은 사람 수(빈칸으로 둔 사람 포함). 빈칸은 시험에서처럼 틀린 것으로 센다.
     칸은 숫자만 받는다. 숫자가 아닌 칸이 있는 줄은 계산에서 빼고 알린다(NaN 이 섞이면 역전 판정이 조용히 사라진다) */
  let raw = fs.readFileSync(path.resolve(scorePath), "utf8");
  if (raw.startsWith(BOM)) raw = raw.slice(1);
  const rows = raw.trim().split(/\r?\n/).slice(1)
    .map((line) => line.split(",").map((c) => c.trim()))
    .filter((c) => c.length >= 6 && c[0]);
  if (!rows.length) { console.error("기록이 비어 있습니다: " + scorePath); process.exit(1); }
  const byLevel = {};
  const weak = [], badRows = [];
  const numCell = (s) => (/^\d+(\.\d+)?$/.test(String(s || "")) ? Number(s) : NaN);
  for (const [id, level, , , got, correct, sec] of rows) {
    const L = Number(level);
    if (!LEVEL_P_RANGE[L]) { badRows.push(id + "(급 " + level + ")"); continue; }
    if (got === "" && correct === "") continue;           // 아직 적지 않은 줄
    const n = numCell(got), c = numCell(correct);
    if (!(n > 0) || !Number.isFinite(c) || c > n) { badRows.push(id + "(받은사람수 " + got + ", 맞힌사람수 " + correct + ")"); continue; }
    (byLevel[L] = byLevel[L] || { n: 0, c: 0, sec: [], items: 0 });
    byLevel[L].n += n; byLevel[L].c += c; byLevel[L].items += 1;
    if (numCell(sec) > 0) byLevel[L].sec.push(numCell(sec));
    const p = c / n;
    const range = LEVEL_P_RANGE[L];
    if (p < range[0] || p > range[1]) weak.push({ id, L, p, n, range });
  }
  if (badRows.length) console.log("계산에서 뺀 줄 " + badRows.length + "개(칸에 숫자만 적으세요): " + badRows.slice(0, 6).join(", ") + (badRows.length > 6 ? " 외" : "") + "\n");
  console.log("급별 정답률 (받은 사람 수를 분모로, 빈칸은 틀린 것으로)");
  console.log("급  문항  응답  정답률  설계 목표  기대 범위  평균 초(권장)");
  const ps = {}, slow = [];
  Object.keys(byLevel).map(Number).sort((a, b) => a - b).forEach((L) => {
    const g = byLevel[L];
    const p = g.c / g.n;
    ps[L] = p;
    const avg = g.sec.length ? g.sec.reduce((a, b) => a + b, 0) / g.sec.length : null;
    if (avg != null && avg > LEVEL_SEC[L] * 2) slow.push(L + "급 평균 " + avg.toFixed(0) + "초(권장 " + LEVEL_SEC[L] + "초의 두 배 넘음)");
    console.log(String(L) + "급  " + String(g.items).padStart(4) + String(g.n).padStart(6) + p.toFixed(2).padStart(8)
      + String(LEVEL_TARGET_P[L]).padStart(11) + (LEVEL_P_RANGE[L][0] + "~" + LEVEL_P_RANGE[L][1]).padStart(11)
      + ((avg == null ? "-" : avg.toFixed(0)) + " (" + LEVEL_SEC[L] + ")").padStart(14));
  });
  const levels = Object.keys(ps).map(Number).sort((a, b) => a - b);
  const inv = [], ties = [];
  for (let i = 0; i + 1 < levels.length; i += 1) {
    const a = levels[i], b = levels[i + 1];
    if (ps[a] < ps[b]) inv.push(a + "급 " + ps[a].toFixed(2) + " < " + b + "급 " + ps[b].toFixed(2));
    else if (ps[a] === ps[b]) ties.push(a + "급 = " + b + "급 " + ps[a].toFixed(2));
  }
  console.log("");
  console.log(inv.length ? "급 역전: " + inv.join(", ") + "\n  → 낮은 급 문항이 더 어렵습니다. 그 칸의 문항을 쉬운 말로 고치거나 급을 옮기고 은행을 다시 올리세요." : "급 역전 없음(낮은 급일수록 정답률이 높거나 같습니다).");
  if (ties.length) console.log("정답률이 같음: " + ties.join(", ") + " (서너 명 자료로는 순서를 판단할 수 없습니다)");
  if (slow.length) console.log("시간: " + slow.join(", ") + " → 문두가 깁니다.");
  if (weak.length) {
    console.log("");
    console.log("기대 범위를 벗어난 문항 " + weak.length + "개 (푼 사람이 적으면 참고만 하세요)");
    weak.forEach((w) => console.log("  " + w.id + " " + w.L + "급 정답률 " + w.p.toFixed(2) + " (n=" + w.n + ", 기대 " + w.range[0] + "~" + w.range[1] + ")"));
  }
  process.exit(0);
}

/* ---------- 문항지 만들기 ---------- */
const bankPath = path.join(ROOT, "quiz-bank", "bank.json");
if (!fs.existsSync(bankPath)) { console.error("문항 은행이 없습니다: " + bankPath); process.exit(1); }
const bank = JSON.parse(fs.readFileSync(bankPath, "utf8"));
const levels = String(flag("levels", "2,3")).split(",").map((s) => Number(s.trim())).filter((n) => n >= 1 && n <= 5);
const half = String(flag("half", "A")).toUpperCase() === "B" ? "B" : "A";
const outArg = flag("out", "");
const outDir = path.resolve(outArg || path.join(ROOT, "quiz-bank", "items"));
if (outArg && !secretPathOk(path.join(outDir, "사전점검_정답표.md"))) {
  console.error("정답표를 " + outDir + " 에 쓰지 않습니다. 공개 저장소에 올라가거나(.gitignore 밖) 사이트로 배포되는(public/) 자리입니다. quiz-bank/items 나 저장소 밖 폴더를 쓰세요.");
  process.exit(1);
}
fs.mkdirSync(outDir, { recursive: true });

/* 실제 시험과 같은 함수로 뽑는다. seed는 고정 문자열이라 다시 실행해도 같은 블록이 나온다 */
const seed = deriveSeed("사전점검", bank.seedSalt);
const used = new Set();
const blocks = levels.map((level, i) => {
  const d = drawBlock({ bank, half, seed, level, used, disabled: [], noImage: false, k: i + 1 });
  d.itemIds.forEach((id) => used.add(id));
  return { level, ids: d.itemIds };
});
const byId = new Map(bank.items.map((it) => [String(it.id), it]));
const num = "①②③④";

const sheet = [];
sheet.push("# 쪽지시험 사전 점검 문항지 (" + half + "반 문항)");
sheet.push("");
/* 설계 목표 정답률(LEVEL_TARGET_P·LEVEL_P_RANGE)은 시험처럼 모든 문항에 답할 때의 값이라 풀이 조건도 같게 둔다 */
sheet.push("풀어 주시는 분께: 강의 노트를 보지 말고 푸세요. 시험과 같이 모든 문항에 답을 하나씩 고르세요(확신이 없으면 가장 그럴듯한 것을 고릅니다).");
sheet.push("이 문항지에는 실제 시험 문항이 들어 있습니다. 다 푼 뒤 돌려주시고, 사진을 찍거나 다른 사람에게 보여 주지 마세요.");
sheet.push("블록마다 **시작 시각과 끝 시각**을 적어 주세요. 한 문항에 얼마나 걸리는지를 보려는 것이라 빨리 푸실 필요는 없습니다.");
sheet.push("");
blocks.forEach((b, bi) => {
  sheet.push("## 블록 " + (bi + 1) + " (문항 " + b.ids.length + "개)");
  sheet.push("");
  sheet.push("시작 시각 ____:____   끝 시각 ____:____");
  sheet.push("");
  b.ids.forEach((id, i) => {
    const it = byId.get(id);
    sheet.push("**" + (i + 1) + ".** " + it.stem);
    if (it.image) {
      /* 시험에서는 그림을 보고 푼다. 대체 텍스트만 주면 도판 문항이 더 어려워져 급별 정답률 비교가 흔들린다 */
      const rel = path.relative(outDir, path.join(ROOT, "public", String(it.image.src).replace(/^\//, ""))).split(path.sep).join("/");
      sheet.push("");
      sheet.push("![도판](" + rel + ")");
      sheet.push("");
      sheet.push("> 도판: " + it.image.alt);
    }
    sheet.push("");
    optionOrder(seed, it).forEach((oid, k) => {
      const o = it.options.find((x) => x.id === oid);
      sheet.push("- (" + num[k] + ") " + o.text);
    });
    sheet.push("");
    sheet.push("내 답: ______");
    sheet.push("");
  });
});
const sheetPath = path.join(outDir, "사전점검_문항지.md");
fs.writeFileSync(sheetPath, sheet.join("\n") + "\n", "utf8");

const key = [];
key.push("# 쪽지시험 사전 점검 정답표·채점 안내 (" + half + "반 문항)");
key.push("");
key.push("문항지의 보기 번호는 학생 화면과 같은 방식으로 섞여 있습니다. 아래 번호로 채점하세요.");
key.push("");
blocks.forEach((b, bi) => {
  key.push("## 블록 " + (bi + 1) + ": " + b.level + "급 (" + LEVEL_NAMES[b.level] + ")");
  key.push("");
  key.push("설계 목표 정답률 " + LEVEL_TARGET_P[b.level] + " · 기대 범위 " + LEVEL_P_RANGE[b.level][0] + "~" + LEVEL_P_RANGE[b.level][1]
    + " · 권장 시간 문항당 " + LEVEL_SEC[b.level] + "초(블록 " + Math.round(LEVEL_SEC[b.level] * BLOCK_SIZE / 60) + "분)");
  key.push("");
  key.push("| 번호 | 문항 id | 영역 | 정답 | 해설 |");
  key.push("|---|---|---|---|---|");
  b.ids.forEach((id, i) => {
    const it = byId.get(id);
    const pos = optionOrder(seed, it).indexOf(it.answer);
    key.push("| " + (i + 1) + " | " + id + " | " + num[it.area - 1] + " " + AREAS[it.area] + " | (" + num[pos] + ") | "
      + String(it.expl || "").replace(/\|/g, "/").replace(/\s+/g, " ").slice(0, 60) + " |");
  });
  key.push("");
});
key.push("## 보는 법");
key.push("");
key.push("1. 급별 평균 정답률이 **낮은 급일수록 높아야** 합니다. 2급이 3급보다 낮으면 2급 문항이 회상을 너무 많이 요구하는 것이니 그 칸을 고칩니다.");
key.push("2. 블록에 걸린 시간을 문항 수로 나눈 값이 권장 시간의 두 배를 넘으면 문두가 깁니다.");
key.push("3. 기록표(`사전점검_기록.csv`)의 받은사람수에는 그 문항을 받은 사람을 모두 적습니다. 빈칸으로 둔 사람도 세고, 맞힌사람수에는 넣지 않습니다(시험에서처럼 틀린 것으로 셉니다). 평균초는 블록에 걸린 시간을 문항 수로 나눈 값입니다. 칸에는 숫자만 적습니다.");
key.push("4. 기록표를 채운 뒤 `npm run pilot -- --score quiz-bank/items/사전점검_기록.csv` 를 실행하면 1·2번을 계산해 줍니다.");
key.push("5. 푼 사람이 서너 명이면 문항 하나하나의 정답률은 믿을 수 없습니다. 급별 평균과 시간만 봅니다.");
key.push("6. 문항지는 실제 시험 문항이라 풀이가 끝나면 모두 회수합니다. 도판 문항은 그림이 보여야 하므로 그림이 보이는 마크다운 보기(예: VS Code 미리 보기)에서 인쇄합니다.");
const keyPath = path.join(outDir, "사전점검_정답표.md");
fs.writeFileSync(keyPath, key.join("\n") + "\n", "utf8");

const csv = ["문항id,급,영역,반,받은사람수,맞힌사람수,평균초"];
blocks.forEach((b) => b.ids.forEach((id) => {
  const it = byId.get(id);
  csv.push([id, it.level, it.area, it.half, "", "", ""].join(","));
}));
const csvPath = path.join(outDir, "사전점검_기록.csv");
/* 기록표에는 풀어 본 결과를 손으로 적는다. 다시 실행해도(다른 반·급 문항지를 만들 때도) 적어 둔 값은 지우지 않는다 */
const typed = fs.existsSync(csvPath) && fs.readFileSync(csvPath, "utf8").split(/\r?\n/).slice(1)
  .some((line) => line.split(",").slice(4).some((c) => c.trim() !== ""));
/* 엑셀(한국어 Windows)이 UTF-8 로 읽도록 BOM 을 붙인다. 채점 모드는 BOM 을 떼고 읽는다 */
if (!typed) fs.writeFileSync(csvPath, BOM + csv.join("\n") + "\n", "utf8");

console.log("만들었습니다 (" + half + "반, " + levels.join("·") + "급)");
[sheetPath, keyPath].concat(typed ? [] : [csvPath]).forEach((p) => console.log("  " + path.relative(ROOT, p)));
if (typed) console.log("기록표에 적어 둔 값이 있어 덮어쓰지 않았습니다: " + path.relative(ROOT, csvPath) + ". 새 기록표가 필요하면 이 파일을 다른 이름으로 옮긴 뒤 다시 실행하세요.");
console.log("문항지를 인쇄해 서너 명에게 풀리고, 기록표를 채운 뒤 --score 로 확인하세요.");
