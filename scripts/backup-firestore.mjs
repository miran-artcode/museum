/* 학급 기록 전체를 이 PC에 내려받는다 (수업이 끝날 때마다 실행).

     npm run backup                       지금 상태를 .backup/YYYY-MM-DD_HHMM/ 에 저장
     npm run backup -- 4반수업뒤           폴더 이름 뒤에 표시를 붙임 (.backup/…_4반수업뒤)
     npm run backup -- --at=2026-09-17T01:30:00Z
                                          그 시점(UTC)의 상태를 저장. Firestore 시점 복구(PITR)가 켜져 있어
                                          최근 7일 안이면 1분 단위로 과거 상태를 읽을 수 있다
     npm run backup -- --with-media       사진·녹음·스케치(media)까지 포함 (용량이 커서 기본은 뺀다)

   저장 내용: meta·students·worksheets·wsHistory·grades·surveys·submissions·assess·quiz·quizAcc(쪽지시험 학생별 조정)·research·misc
   과 문항 은행 두 문서(quizBank 공개부·quizKeys 정답부). 은행 원본 quiz-bank/bank.json 은 공개 저장소에
   올리지 않아 교사 PC에만 있으므로, 이 백업이 사본 구실을 한다. 잃어버리면
   node scripts/quiz-bank-restore.mjs <백업 폴더> 로 두 문서를 합쳐 되살린다.
   한 학생을 되돌리려면 scripts/restore-worksheet.mjs 를 쓴다 (npm run restore).
   .backup/ 은 .gitignore에 있어 GitHub에 올라가지 않는다 (학생 개인 기록). */
import fs from "node:fs";
import path from "node:path";
import { accessToken, listCollection, BACKUP_DIR, stamp, unwrap, summarize, backupDirsByTime } from "./fs-admin.mjs";

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(name + "="));
const at = flag("--at") ? flag("--at").slice(5) : "";
const withMedia = args.includes("--with-media");
const label = args.filter((a) => !a.startsWith("--")).join("_").replace(/[\\/:*?"<>|\s]/g, "_");

if (at && isNaN(new Date(at).getTime())) { console.error("--at 값은 2026-09-17T01:30:00Z 같은 ISO 시각이어야 합니다."); process.exit(1); }

const COLS = ["meta", "students", "worksheets", "wsHistory", "grades", "surveys", "submissions", "assess", "quiz", "quizAcc", "research", "misc", "quizBank", "quizKeys"];
if (withMedia) COLS.push("media");

const token = await accessToken();
const dir = path.join(BACKUP_DIR, stamp() + (at ? "_시점" + at.replace(/[:]/g, "").replace(/\.\d+Z$/, "Z") : "") + (label ? "_" + label : ""));
fs.mkdirSync(dir, { recursive: true });

const counts = {};
for (const col of COLS) {
  const docs = await listCollection(token, col, at ? { readTime: at } : {});
  fs.writeFileSync(path.join(dir, col + ".json"), JSON.stringify(docs, null, 1));
  counts[col] = Object.keys(docs).length;
}
fs.writeFileSync(path.join(dir, "INFO.json"), JSON.stringify({ savedAt: new Date().toISOString(), readTime: at || null, withMedia, counts }, null, 1));

console.log("저장 위치:", dir);
console.log("문서 수:", Object.entries(counts).map(([k, n]) => k + " " + n).join(", "));

/* 직전 백업과 견주어 기록지가 바뀐 학생을 알린다. 직전은 이름순이 아니라 담긴 시각순이다(이름이 날짜로 시작하지 않는 폴더가 늘 뒤에 오므로).
   시점 백업(--at)이면 그 시점보다 앞선 것 가운데서 고른다 */
const prevDirs = backupDirsByTime((d) => d !== path.basename(dir) && fs.existsSync(path.join(BACKUP_DIR, d, "worksheets.json")), { before: at ? Date.parse(at) : Date.now() });
const prev = prevDirs.pop();
if (prev) {
  const before = JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, prev, "worksheets.json"), "utf8"));
  const now = JSON.parse(fs.readFileSync(path.join(dir, "worksheets.json"), "utf8"));
  const students = JSON.parse(fs.readFileSync(path.join(dir, "students.json"), "utf8"));
  const changed = [], shrunk = [], gone = [];
  for (const id of Object.keys(now)) {
    const a = summarize(unwrap(before[id])), b = summarize(unwrap(now[id]));
    if (!before[id]) { changed.push(id + "(새 기록지)"); continue; }
    if (before[id]._updateTime !== now[id]._updateTime) changed.push(id);
    if (b.chars < a.chars * 0.8 && a.chars >= 200) shrunk.push(`${id} ${(students[id] || {}).nick || ""} ${a.chars}자→${b.chars}자`);
  }
  for (const id of Object.keys(before)) if (!now[id]) gone.push(id);
  console.log(`직전 백업(${prev})과 비교: 바뀐 기록지 ${changed.length}개` + (changed.length ? ": " + changed.join(", ") : ""));
  if (shrunk.length) console.log("⚠ 글자 수가 20% 넘게 줄어든 기록지 (확인 필요):\n  " + shrunk.join("\n  "));
  if (gone.length) console.log("⚠ 사라진 기록지: " + gone.join(", "));
}
