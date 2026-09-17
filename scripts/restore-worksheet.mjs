/* 한 학생의 기록지를 백업 폴더의 상태로 되돌린다.

     npm run restore -- <백업 폴더> <학번>            예) npm run restore -- 2026-09-17_1830 20420
     npm run restore -- --at=<ISO 시각> <학번>        예) npm run restore -- --at=2026-09-17T01:30:00Z 20420
                                                       (백업 폴더 없이 Firestore 시점 복구에서 그 시점을 직접 읽는다. 최근 7일)
     npm run restore -- <백업 폴더> <학번> --to=<다른 학번>
                                                       백업의 학번 기록을 다른 학번에 넣는다 (학번을 잘못 쳐서 만든 계정의 기록을 옮길 때)
     끝에 --yes 를 붙이면 확인 질문 없이 실행한다.

   실행 순서: ① 지금 상태를 wsHistory/{학번}_r{시각} 사본으로 먼저 남긴다 (실패하면 중단)
             ② 백업의 기록지를 worksheets/{학번}에 통째로 쓴다. _restored 에 되돌린 사실을 남긴다
   학생이 접속해 있으면 그 화면이 되돌린 내용을 실시간으로 받는다(2026-09-17 저장 구조 개정 뒤). */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { accessToken, getDoc, putDoc, BACKUP_DIR, unwrap, summarize } from "./fs-admin.mjs";

const args = process.argv.slice(2);
const opt = (name) => { const a = args.find((x) => x.startsWith(name + "=")); return a ? a.slice(name.length + 1) : ""; };
const yes = args.includes("--yes");
const at = opt("--at");
const to = opt("--to");
const rest = args.filter((a) => !a.startsWith("--"));
const [dirArg, sidArg] = at ? [null, rest[0]] : rest;
const sid = String(sidArg || "").trim();
const target = String(to || sid).trim();
if (!sid || !/^[A-Za-z0-9]+$/.test(sid) || !/^[A-Za-z0-9]+$/.test(target)) {
  console.error("사용법: npm run restore -- <백업 폴더> <학번> [--to=<학번>] [--yes]   또는   npm run restore -- --at=<ISO 시각> <학번>");
  process.exit(1);
}

const token = await accessToken();
let fromWs, fromLabel;
if (at) {
  if (isNaN(new Date(at).getTime())) { console.error("--at 값은 2026-09-17T01:30:00Z 같은 ISO 시각이어야 합니다."); process.exit(1); }
  const d = await getDoc(token, "worksheets", sid, { readTime: at });
  if (!d) { console.error(`${at} 시점에 ${sid} 기록지가 없습니다.`); process.exit(1); }
  fromWs = unwrap(d); fromLabel = at + " 시점";
} else {
  const dir = path.isAbsolute(dirArg) ? dirArg : path.join(BACKUP_DIR, dirArg);
  const file = path.join(dir, "worksheets.json");
  if (!fs.existsSync(file)) { console.error("백업 폴더에 worksheets.json이 없습니다:", dir); process.exit(1); }
  const all = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!all[sid]) { console.error(`백업에 ${sid} 기록지가 없습니다. 있는 학번: ${Object.keys(all).sort().join(" ")}`); process.exit(1); }
  fromWs = unwrap(all[sid]); fromLabel = "백업 " + path.basename(dir);
}
if (!fromWs || typeof fromWs !== "object") { console.error("되돌릴 기록이 비어 있습니다."); process.exit(1); }

const curDoc = await getDoc(token, "worksheets", target);
const cur = curDoc ? unwrap(curDoc) : null;
const a = summarize(cur), b = summarize(fromWs);
console.log(`대상: worksheets/${target}${to ? ` (백업의 ${sid} 기록을 옮김)` : ""}`);
console.log(`지금:   채운 칸 ${a.fields}개, ${a.chars.toLocaleString()}자 (마지막 저장 ${cur && cur._updatedAt || "없음"})`);
console.log(`되돌림: 채운 칸 ${b.fields}개, ${b.chars.toLocaleString()}자 (${fromLabel}, 기록의 저장 시각 ${fromWs._updatedAt || "없음"})`);

if (!yes) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ans = await new Promise((res) => rl.question("이대로 되돌릴까요? (y/N) ", res));
  rl.close();
  if (!/^y(es)?$/i.test(ans.trim())) { console.log("취소했습니다."); process.exit(0); }
}

const nowIso = new Date().toISOString();
if (cur) {
  // ① 되돌리기 전 상태를 사본으로. 교사 화면의 「기록 되돌리기」 카드에서도 이 사본이 보인다
  await putDoc(token, "wsHistory", `${target}_r${Date.now()}`, { v: { sid: target, bucket: "되돌리기 전", at: nowIso, ws: cur } });
  console.log("되돌리기 전 상태를 wsHistory 사본으로 남겼습니다.");
}
// ② 본 문서를 쓴다
const next = { ...fromWs, _updatedAt: nowIso, _restored: [...(cur && Array.isArray(cur._restored) ? cur._restored : []), { from: fromWs._updatedAt || fromLabel, at: nowIso, by: "script" }].slice(-20) };
await putDoc(token, "worksheets", target, { v: next });
console.log(`완료: worksheets/${target} 를 ${fromLabel} 상태로 되돌렸습니다.`);
