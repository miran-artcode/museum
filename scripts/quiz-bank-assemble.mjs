/* 문항 은행 조립기 — 칸별 초안 파일(items/L{급}-A{영역}.json)을 하나의 quiz-bank/bank.json 으로 합치고 검증한다.
   사용: node scripts/quiz-bank-assemble.mjs <items 디렉터리> [출력 경로]
   - drop:true 문항은 버리고, 칸(급·영역·반)마다 필요한 수만큼 남긴다 (예비 reserve 는 모자랄 때만 채움)
   - validateBank(src-quiz-core.mjs) 로 구조·칸 수를 검사하고, 인용문(src.quote)이 src-lessons.jsx 에 그대로 있는지,
     도판(src)이 public/img/lessons 에 있는지, 정답 위치·가장 긴 보기가 정답인 비율을 함께 보고한다 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { validateBank, CELL_MIN, STEM_MAX, CASE_MAX_5 } from "../src-quiz-core.mjs";

const [,, itemsDir, outPath = "quiz-bank/bank.json"] = process.argv;
if (!itemsDir) { console.error("items 디렉터리를 지정하세요"); process.exit(2); }
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const lessons = fs.readFileSync(path.join(root, "src-lessons.jsx"), "utf8");

const files = fs.readdirSync(itemsDir).filter((f) => /^L\d-A\d\.json$/.test(f)).sort();
const all = [];
for (const f of files) {
  const arr = JSON.parse(fs.readFileSync(path.join(itemsDir, f), "utf8"));
  for (const it of Array.isArray(arr) ? arr : arr.items || []) all.push({ ...it, _file: f });
}

const problems = [];
const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
const lessonsNorm = norm(lessons);

/* 칸별로 필요한 수만 남긴다 */
const picked = [];
const cellCount = {};
for (const level of [1, 2, 3, 4, 5]) for (const area of [1, 2, 3, 4]) for (const half of ["A", "B"]) {
  const need = CELL_MIN[level][area - 1];
  const pool = all.filter((it) => it.level === level && it.area === area && it.half === half && !it.drop);
  const main = pool.filter((it) => !it.reserve);
  const reserve = pool.filter((it) => it.reserve);
  const take = main.slice(0, need);
  for (const r of reserve) if (take.length < need) take.push(r);
  if (take.length < need) problems.push(`칸 ${level}-${area}-${half}: ${take.length}/${need} 부족 (초안 ${pool.length}, 탈락 ${all.filter((it) => it.level === level && it.area === area && it.half === half && it.drop).length})`);
  cellCount[`${level}-${area}-${half}`] = take.length;
  picked.push(...take);
}
/* 쌍둥이가 한쪽만 뽑힌 spec 은 다른 쪽도 맞춘다 (같은 spec 의 A·B 가 모두 있어야 함) */
const specHalves = {};
for (const it of picked) (specHalves[it.spec] = specHalves[it.spec] || new Set()).add(it.half);
for (const [spec, hs] of Object.entries(specHalves)) if (hs.size !== 2) problems.push(`spec ${spec}: 반 ${[...hs].join("")} 만 있음`);

/* 문항별 점검 */
const answerPos = { a: 0, b: 0, c: 0, d: 0 };
let longestIsAnswer = 0;
const seen = new Set();
for (const it of picked) {
  if (seen.has(it.id)) problems.push(`id 중복 ${it.id}`); seen.add(it.id);
  if (!it.options || it.options.length !== 4) problems.push(`${it.id}: 보기 4개 아님`);
  const ans = (it.options || []).find((o) => o.id === it.answer);
  if (!ans) problems.push(`${it.id}: 정답 id ${it.answer} 가 보기에 없음`);
  else {
    answerPos[it.answer] = (answerPos[it.answer] || 0) + 1;
    const longest = it.options.reduce((m, o) => (o.text.length > m.text.length ? o : m), it.options[0]);
    if (longest.id === it.answer && it.options.filter((o) => o.text.length === longest.text.length).length === 1) longestIsAnswer += 1;
  }
  const stem = it.level === 5 && it.case && it.question ? `${it.case} ${it.question}` : it.stem;
  if (it.level === 5 && it.case && it.case.length > CASE_MAX_5) problems.push(`${it.id}: 5급 사례 ${it.case.length}자 > ${CASE_MAX_5}`);
  if (stem && stem.length > STEM_MAX[it.level]) problems.push(`${it.id}: 문두 ${stem.length}자 > ${STEM_MAX[it.level]}`);
  if (it.src && it.src.quote) { if (!lessonsNorm.includes(norm(it.src.quote))) problems.push(`${it.id}: 인용문이 src-lessons.jsx 에 없음: ${it.src.quote.slice(0, 40)}…`); }
  else problems.push(`${it.id}: src.quote 없음`);
  if (it.image) {
    if (!/^\/img\/lessons\//.test(it.image.src)) problems.push(`${it.id}: 도판 경로 형식 ${it.image.src}`);
    else if (!fs.existsSync(path.join(root, "public", it.image.src))) problems.push(`${it.id}: 도판 파일 없음 ${it.image.src}`);
    if (!it.image.alt) problems.push(`${it.id}: 도판 alt 없음`);
  }
  const text = [stem, ...(it.options || []).map((o) => o.text), it.expl].join(" ");
  if (text.includes("—")) problems.push(`${it.id}: 줄표(—) 포함`);
  if (/모두 옳|모두 맞|위의 어느 것도|모두 아니/.test(text)) problems.push(`${it.id}: 「모두/없다」류 보기`);
}

/* 은행 문서 만들기 */
const clean = picked.map((it) => {
  const o = {
    id: it.id, level: it.level, area: it.area, half: it.half, spec: it.spec,
    stem: it.level === 5 && it.case && it.question ? `${it.case} ${it.question}` : it.stem,
    options: it.options.map((x) => ({ id: x.id, text: x.text })), answer: it.answer,
    image: it.image ? { src: it.image.src, alt: it.image.alt } : null, neg: !!it.neg,
    expl: it.expl || "", src: it.src || null, tags: it.tags || [],
  };
  if (it.level === 5 && it.case) { o.case = it.case; o.question = it.question; o.caseLen = it.case.length; }
  return o;
}).sort((a, b) => a.id.localeCompare(b.id));

const practicePath = path.join(root, "quiz-bank", "practice.json");
const practice = fs.existsSync(practicePath) ? JSON.parse(fs.readFileSync(practicePath, "utf8")) : [];
const bank = { ver: "2026-09-v1", seedSalt: crypto.randomBytes(12).toString("hex"), practice, items: clean };
const v = validateBank(bank);

console.log("칸별 수:", JSON.stringify(cellCount));
console.log("문항 수:", clean.length, "· 정답 위치:", JSON.stringify(answerPos), "· 가장 긴 보기가 정답:", longestIsAnswer, `(${Math.round((100 * longestIsAnswer) / Math.max(1, clean.length))}%)`);
console.log("validateBank:", v.ok ? "OK" : "오류", v.errors.length, "경고", v.warnings.length);
for (const e of v.errors) console.log("  오류:", e);
for (const w of v.warnings) console.log("  경고:", w);
for (const p of problems) console.log("  점검:", p);
if (!v.ok || problems.length) { console.log("문제가 있어 파일을 쓰지 않습니다 (--force 로 강제)"); if (!process.argv.includes("--force")) process.exit(1); }
fs.mkdirSync(path.dirname(path.resolve(root, outPath)), { recursive: true });
fs.writeFileSync(path.resolve(root, outPath), JSON.stringify(bank, null, 1), "utf8");
console.log("썼습니다:", outPath);
