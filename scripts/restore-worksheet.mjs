/* 한 학생의 기록지를 백업 폴더의 상태로 되돌린다.

     npm run restore -- <백업 폴더> <학번>            예) npm run restore -- 2026-09-17_1830 29901
     npm run restore -- --at=<ISO 시각> <학번>        예) npm run restore -- --at=2026-09-17T01:30:00Z 29901
                                                       (백업 폴더 없이 Firestore 시점 복구에서 그 시점을 직접 읽는다. 최근 7일)
     npm run restore -- <백업 폴더> <학번> --to=<다른 학번>
                                                       백업의 학번 기록을 다른 학번에 넣는다 (학번을 잘못 쳐서 만든 계정의 기록을 옮길 때)
     npm run restore -- <백업 폴더> <학번> --to=<다른 학번> --merge
                                                       통째로 덮지 않고, 다른 학번의 빈 칸만 백업의 값으로 채운다 (두 학번에 모두 기록이 있을 때)
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
const merge = args.includes("--merge");
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
/* --merge: 대상의 빈 칸만 백업 값으로 채운다. 밑줄 키(보조 기록)는 대상에 없을 때만 가져온다 */
const empty = (v) => v == null || v === "" || (Array.isArray(v) && v.length === 0) || (typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 0);
if (merge) {
  const out = { ...(cur || {}) };
  let filledN = 0;
  for (const k of Object.keys(fromWs)) {
    if (k.charAt(0) === "_") { if (!(k in out)) out[k] = fromWs[k]; continue; }
    if (empty(out[k]) && !empty(fromWs[k])) { out[k] = fromWs[k]; filledN++; }
  }
  console.log(`--merge: 대상의 빈 칸 ${filledN}개를 백업 값으로 채웁니다 (대상에 이미 있는 칸은 그대로).`);
  fromWs = out;
}
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

/* --to: 기록지의 미디어 참조는 media/{기록지 주인}_{ref}로 풀리므로, 기록지만 옮기면 새 학번에서 사진·녹음이 모두 빈다.
   기록지를 쓰기 전에 참조마다 media/{원래 학번}_{ref}를 media/{새 학번}_{ref}로 복사한다(이미 있으면 그대로 둔다).
   지금 서버에 없으면 백업 폴더의 media.json(--with-media 백업), --at이면 그 시점의 문서에서 찾는다. 하나라도 쓰기에 실패하면 기록지를 쓰지 않는다. */
const safeId = (s) => String(s).replace(/[\/\s"'#\[\]*~?:]/g, "_").slice(0, 180); // src-fb.js safe()와 같은 규칙
function mediaRefs(ws) {
  const refs = new Set();
  const visit = (v) => {
    if (!v) return;
    if (Array.isArray(v)) return v.forEach(visit);
    if (typeof v === "object") { if (typeof v.ref === "string" && v.ref) refs.add(v.ref); Object.values(v).forEach(visit); }
  };
  Object.entries(ws || {}).forEach(([k, v]) => { if (!k.startsWith("_")) visit(v); });
  ((ws || {})["s5b.rounds"] || []).forEach((r) => { if (r && typeof r.img === "string" && r.img) refs.add(r.img); });
  return [...refs];
}
if (target !== sid) {
  let backupMedia = null;
  if (!at) { const mf = path.join(path.isAbsolute(dirArg) ? dirArg : path.join(BACKUP_DIR, dirArg), "media.json"); if (fs.existsSync(mf)) backupMedia = JSON.parse(fs.readFileSync(mf, "utf8")); }
  const copied = [], kept = [], missing = [];
  for (const ref of mediaRefs(fromWs)) {
    const toId = safeId(`${target}_${ref}`), fromId = safeId(`${sid}_${ref}`);
    if (await getDoc(token, "media", toId)) { kept.push(ref); continue; }
    let src = await getDoc(token, "media", fromId);
    if (!src && backupMedia && backupMedia[fromId]) src = backupMedia[fromId];
    if (!src && at) src = await getDoc(token, "media", fromId, { readTime: at });
    const v = unwrap(src);
    if (!src || typeof v !== "string") { missing.push(ref); continue; }
    await putDoc(token, "media", toId, { v, updatedAt: Date.now() });
    copied.push(ref);
  }
  console.log(`미디어: ${copied.length}개 복사 (media/${sid}_* → media/${target}_*), 새 학번에 이미 있음 ${kept.length}개, 원본을 찾지 못함 ${missing.length}개`);
  copied.forEach((r) => console.log("  복사 " + r));
  missing.forEach((r) => console.log("  ⚠ 원본 없음 " + r));
  console.log(`⚠ 주의: 옛 학번 ${sid}을(를) 교사 화면에서 지우면 media/${sid}_* 파일도 함께 지워집니다. 복사한 것은 새 학번에 남지만, 위에서 원본을 찾지 못한 항목은 되살릴 수 없으니 지우기 전에 확인하세요.`);
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
