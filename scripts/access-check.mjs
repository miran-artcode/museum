// 학습 지원 자료 점검: 강의 노트 본문이 바뀐 뒤 맞지 않게 된 항목을 찾는다.
//   node scripts/access-check.mjs
// · 핵심 용어(src-access-lexicon.mjs): 그 차시 읽기 자료에 더 이상 나오지 않는 용어
// · 쉬운 말 요약: 제목이 없어진 읽기 자료, 본문 지문이 크게 달라져 화면에서 숨겨지는 요약, 요약이 없는 읽기 자료
// · 작품 설명(src-access-describe.mjs): 설명이 없는 수업 도판(새로 들어온 도판)
// · 문체: 학생 화면 문구 규칙(줄표, 이중 피동, 번역투, 2인칭)
// 끝나면 다시 만들 목록을 보여 준다. 수업 편집(misc/lessonEdits)으로 교사가 고친 내용은 보지 못한다(코드의 원본만 본다).
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const repo = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const require = createRequire(path.join(repo, "package.json"));
const esbuild = require("esbuild");
const url = (f) => "file:///" + path.join(repo, f).replace(/\\/g, "/");

const r = await esbuild.build({
  entryPoints: [path.join(repo, "src-lessons.jsx")], bundle: true, format: "cjs", platform: "node", write: false,
  loader: { ".jsx": "jsx" }, jsx: "automatic", external: ["react", "react/jsx-runtime"],
});
const m = { exports: {} };
new Function("module", "exports", "require", r.outputFiles[0].text)(m, m.exports, require);
const LESSONS = m.exports.LESSONS_DEF;
const { plainOf, textSig, sigSim, SIG_MIN, readingText } = await import(url("src-access-core.mjs"));
const { LEXICON } = await import(url("src-access-lexicon.mjs"));
const { DESCRIBE } = await import(url("src-access-describe.mjs"));

const bad = (s) => /—/.test(s) ? "줄표" : /보여지|쓰여진|잊혀진|불리우/.test(s) ? "이중 피동"
  : /에 의한|에 의해|로 인한|하게 됩니다|을 가진다|를 가진다|의 형태로/.test(s) ? "번역투" : /(^|\s)(네가|네 답|너는|너의)/.test(s) ? "2인칭" : "";

const out = { terms: [], stale: [], gone: [], noSum: [], noDesc: [], style: [] };
for (const L of LESSONS) {
  const lx = LEXICON[L.n] || { terms: [], easy: [] };
  const full = L.readings.map((rd) => plainOf(rd.h) + "\n" + readingText(rd)).join("\n");
  for (const t of lx.terms) {
    if (!full.includes(t.t)) out.terms.push(L.n + "차시 「" + t.t + "」");
    const w = bad([t.easy, t.ex || ""].join(" "));
    if (w) out.style.push(L.n + "차시 용어 「" + t.t + "」: " + w);
  }
  for (const e of lx.easy) {
    const rd = L.readings.find((x) => x.h === e.h);
    if (!rd) { out.gone.push(L.n + "차시 「" + e.h + "」"); continue; }
    const sim = e.sig && e.sig.length ? sigSim(e.sig, textSig(readingText(rd))) : 1;
    if (sim < SIG_MIN) out.stale.push(L.n + "차시 「" + e.h + "」 (지문 일치 " + sim.toFixed(2) + ")");
    const w = bad(e.s.join(" "));
    if (w) out.style.push(L.n + "차시 요약 「" + e.h + "」: " + w);
  }
  for (const rd of L.readings) if (!lx.easy.some((e) => e.h === rd.h)) out.noSum.push(L.n + "차시 「" + rd.h + "」");
  for (const rd of L.readings) for (const img of rd.images || []) {
    if (img && typeof img.src === "string" && img.src.startsWith("/img/") && !DESCRIBE[img.src]) out.noDesc.push(L.n + "차시 " + img.src);
  }
}
for (const [src, d] of Object.entries(DESCRIBE)) {
  const w = bad([d.alt, ...(d.desc || []), d.touch || ""].join(" "));
  if (w) out.style.push("설명 " + src + ": " + w);
  if (d.alt && d.alt.length > 90) out.style.push("설명 " + src + ": alt " + d.alt.length + "자(90자 넘음)");
}
out.noDesc = [...new Set(out.noDesc)];

const sec = (h, xs) => console.log("\n## " + h + " (" + xs.length + ")" + (xs.length ? "\n- " + xs.join("\n- ") : ""));
console.log("# 학습 지원 자료 점검");
sec("본문에 없는 핵심 용어 (화면에서 표시되지 않음)", out.terms);
sec("제목이 없어진 쉬운 말 요약 (숨겨짐)", out.gone);
sec("본문이 크게 달라진 쉬운 말 요약 (숨겨짐, 다시 만들 것)", out.stale);
sec("쉬운 말 요약이 없는 읽기 자료", out.noSum);
sec("작품 설명이 없는 수업 도판", out.noDesc);
sec("문체 규칙 위반", out.style);
const n = out.terms.length + out.gone.length + out.stale.length + out.style.length;
process.exit(n ? 1 : 0);
