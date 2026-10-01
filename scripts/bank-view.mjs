/* 문항 은행을 이 PC에서만 볼 수 있는 HTML 한 장으로 만든다.

     npm run view                       quiz-bank/items/문항은행_보기.html 을 만든다
     npm run view -- --out 다른경로.html   (--out=경로 도 된다. 저장소 안이면 .gitignore 가 가리는 자리만 받는다)

   만들어진 파일은 인터넷에 올리지 않는다. 정답·해설·출처가 다 들어 있고, 학생이 쓰는 사이트(public/)와
   저장소(.gitignore의 quiz-bank/items/)에 들어가지 않는 자리에 만든다. 브라우저로 그냥 열면 되고
   바깥으로 나가는 요청이 없다(글꼴·스크립트를 모두 파일 안에 둔다). 도판은 이 저장소의 public/img/lessons/ 를
   상대 경로로 가리키므로 저장소 안에서 열 때만 보인다. */
import fs from "node:fs";
import path from "node:path";
import { LEVEL_NAMES, LEVEL_WORDS, LEVEL_TARGET_P, LEVEL_SEC, AREAS, cellNeed, validateBank } from "../src-quiz-core.mjs";
import { ROOT, secretPathOk } from "./fs-admin.mjs";

const args = process.argv.slice(2);
/* --out 경로 와 --out=경로 를 모두 받는다 */
const val = (n, d) => {
  const i = args.indexOf("--" + n);
  if (i >= 0 && args[i + 1] && !args[i + 1].startsWith("--")) return args[i + 1];
  const eq = args.find((a) => a.startsWith("--" + n + "="));
  return eq ? eq.slice(n.length + 3) : d;
};
const outArg = val("out", "");
const outPath = path.resolve(outArg || path.join(ROOT, "quiz-bank", "items", "문항은행_보기.html"));
/* 정답·해설이 다 든 파일이다. 저장소 안의 .gitignore 밖에 두면 커밋 한 번으로 공개 저장소에 올라간다 */
if (outArg && !secretPathOk(outPath)) {
  console.error("정답이 든 HTML 을 " + outArg + " 에 쓰지 않습니다. 공개 저장소에 올라가거나(.gitignore 밖) 사이트로 배포되는(public/) 자리입니다. quiz-bank/items/ 안이나 저장소 밖 경로를 쓰세요.");
  process.exit(1);
}
const bank = JSON.parse(fs.readFileSync(path.join(ROOT, "quiz-bank", "bank.json"), "utf8"));
const report = validateBank(bank);

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const MARK = { 1: "①", 2: "②", 3: "③", 4: "④" };
/* 도판은 public/img/lessons/ 에 있다. 이 파일(quiz-bank/items/)에서 본 상대 경로로 바꾼다 */
const imgSrc = (src) => path.relative(path.dirname(outPath), path.join(ROOT, "public", String(src).replace(/^\//, ""))).replace(/\\/g, "/");

/* 같은 칸 안에서도 id 순서로 놓는다(비교 함수가 0을 돌려주지 않으면 id 비교까지 가지 않고 파일 순서가 남는다) */
const cmpStr = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
const items = [...bank.items].sort((a, b) => (a.level - b.level) || (a.area - b.area) || cmpStr(a.half, b.half) || cmpStr(String(a.id), String(b.id)));

const card = (it) => {
  const opts = it.options.map((o) => `<li class="${o.id === it.answer ? "ok" : ""}"><b>${o.id}</b> ${esc(o.text)}${o.id === it.answer ? '<span class="tag">정답</span>' : ""}</li>`).join("");
  const img = it.image ? `<figure><img src="${esc(imgSrc(it.image.src))}" alt="${esc(it.image.alt)}" loading="lazy"><figcaption>대체 텍스트: ${esc(it.image.alt)}</figcaption></figure>` : "";
  const c5 = it.case ? `<p class="case">사례(${it.caseLen}자): ${esc(it.case)}</p><p class="ask">묻는 것: ${esc(it.question)}</p>` : "";
  return `<article class="q" data-l="${it.level}" data-a="${it.area}" data-h="${it.half}" data-t="${esc([it.id, it.spec, it.stem, it.options.map((o) => o.text).join(" "), (it.tags || []).join(" ")].join(" ").toLowerCase())}">
  <header><span class="id">${esc(it.id)}</span><span class="meta">${it.level}급 · ${MARK[it.area]} ${esc(AREAS[it.area])} · ${it.half}반 · ${esc(it.spec)}</span>${it.image ? '<span class="tag img">도판</span>' : ""}${it.neg ? '<span class="tag neg">부정 문두</span>' : ""}</header>
  <p class="stem">${esc(it.stem)}</p>
  ${img}${c5}
  <ol class="opts">${opts}</ol>
  <div class="key"><p class="expl">${esc(it.expl)}</p><p class="src">근거: ${it.src ? esc(it.src.lesson) + "차시 「" + esc(it.src.h) + "」" : "없음"}${it.src && it.src.quote ? `<br><span class="quote">${esc(it.src.quote)}</span>` : ""}</p></div>
</article>`;
};

const groups = [];
for (let l = 1; l <= 5; l += 1) {
  const g = items.filter((it) => it.level === l);
  if (!g.length) continue;
  /* 반마다 따로 센다(두 반의 평균은 모자란 반을 가린다). 필요 수는 교사 화면의 칸 부족 경고(cellShort)와 같은 규칙으로,
     도판이 든 ③ 밖의 칸은 하나를 더한다 */
  const cells = [1, 2, 3, 4].map((a) => {
    const n = g.filter((it) => it.area === a).length;
    if (!n) return "";
    const per = ["A", "B"].map((h) => {
      const c = g.filter((it) => it.area === a && it.half === h);
      const need = cellNeed(l, a) + (a !== 3 && c.some((it) => it.image) ? 1 : 0);
      return h + " " + c.length + "/" + need + (c.length < need ? " 모자람" : "");
    }).join(", ");
    return `${MARK[a]} ${n}문항(있음/필요 ${per})`;
  }).filter(Boolean).join(" · ");
  groups.push(`<section class="lv" data-l="${l}">
  <h2>${l}급 <small>${esc(LEVEL_WORDS[l])} · ${esc(LEVEL_NAMES[l])}</small></h2>
  <p class="lvmeta">목표 정답률 ${LEVEL_TARGET_P[l]} · 권장 ${LEVEL_SEC[l]}초/문항 · ${g.length}문항 · ${cells}</p>
  ${g.map(card).join("\n")}
</section>`);
}

const practice = (bank.practice || []).map((p) => `<article class="q"><header><span class="id">${esc(p.id)}</span><span class="meta">연습 · ${p.level}급</span></header>
  <p class="stem">${esc(p.stem)}</p><ol class="opts">${p.options.map((o) => `<li class="${o.id === p.answer ? "ok" : ""}"><b>${o.id}</b> ${esc(o.text)}${o.id === p.answer ? '<span class="tag">정답</span>' : ""}</li>`).join("")}</ol>
  <div class="key"><p class="expl">${esc(p.expl)}</p></div></article>`).join("\n");

const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>문항 은행 ${esc(bank.ver)}</title>
<style>
:root{--ink:#1b1b1b;--sub:#666;--line:#d8d4cc;--bg:#faf8f4;--card:#fff;--ok:#1f6f4a;--okbg:#eef6f1;--warn:#9a6b00}
@media (prefers-color-scheme:dark){:root{--ink:#e9e6e0;--sub:#a8a49c;--line:#3a3a38;--bg:#17181a;--card:#1f2022;--ok:#7fd3a6;--okbg:#1c2a23;--warn:#d8a93c}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.7 "Noto Serif KR","Nanum Myeongjo",-apple-system,"Malgun Gothic",serif;padding:0 16px 80px}
.wrap{max-width:920px;margin:0 auto}
header.top{padding:28px 0 12px;border-bottom:2px solid var(--ink)}
h1{font-size:22px;margin:0 0 6px;letter-spacing:-.01em}
.top p{margin:4px 0;color:var(--sub);font-size:13px}
.danger{border:1px solid var(--warn);color:var(--warn);padding:8px 12px;margin:12px 0;font-size:13px}
.bar{position:sticky;top:0;background:var(--bg);padding:12px 0;border-bottom:1px solid var(--line);z-index:5;display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.bar button,.bar label{font:inherit;font-size:13px;border:1px solid var(--line);background:var(--card);color:var(--ink);padding:4px 10px;cursor:pointer}
.bar button.on{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.bar input[type=search]{font:inherit;font-size:13px;padding:4px 8px;border:1px solid var(--line);background:var(--card);color:var(--ink);flex:1 1 180px;min-width:140px}
.bar .sp{flex-basis:100%;height:0}
h2{font-size:18px;margin:32px 0 2px;padding-top:8px;border-top:1px solid var(--line)}
h2 small{font-weight:400;color:var(--sub);font-size:13px}
.lvmeta{margin:0 0 14px;color:var(--sub);font-size:12px}
.q{background:var(--card);border:1px solid var(--line);padding:14px 16px;margin:0 0 12px}
.q header{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline;margin-bottom:8px}
.id{font-family:ui-monospace,Consolas,monospace;font-weight:700;font-size:13px}
.meta{color:var(--sub);font-size:12px}
.tag{font-size:11px;border:1px solid var(--ok);color:var(--ok);padding:0 5px;margin-left:6px;white-space:nowrap}
.tag.img,.tag.neg{border-color:var(--sub);color:var(--sub);margin-left:0}
.stem{margin:0 0 10px}
.case{margin:0 0 6px;padding-left:10px;border-left:3px solid var(--line);color:var(--ink)}
.ask{margin:0 0 10px;font-weight:600}
figure{margin:0 0 10px}
figure img{max-width:100%;max-height:320px;border:1px solid var(--line)}
figcaption{color:var(--sub);font-size:11px;margin-top:4px}
ol.opts{list-style:none;margin:0;padding:0}
ol.opts li{padding:5px 8px;border-bottom:1px dotted var(--line)}
ol.opts li b{font-family:ui-monospace,Consolas,monospace;margin-right:6px;color:var(--sub)}
ol.opts li.ok{background:var(--okbg);color:var(--ok);font-weight:600}
.key{margin-top:10px;font-size:13px;color:var(--sub)}
.expl{margin:0 0 4px}
.src{margin:0;font-size:12px}
.quote{display:block;margin-top:2px;padding-left:10px;border-left:2px solid var(--line)}
body.hide-key .key{display:none}
body.hide-key ol.opts li.ok{background:none;color:inherit;font-weight:400}
body.hide-key .tag:not(.img):not(.neg){display:none}
.none{color:var(--sub);padding:20px 0}
@media print{
  body{background:#fff;padding:0;font-size:11pt}
  .bar,.danger{display:none}
  .q{break-inside:avoid;border:none;border-bottom:1px solid #999;padding:6px 0}
  figure img{max-height:180px}
}
</style></head>
<body><div class="wrap">
<header class="top">
  <h1>문항 은행 ${esc(bank.ver)}</h1>
  <p>${bank.items.length}문항 · 연습 ${(bank.practice || []).length}문항 · 검증 ${report.ok ? "통과" : "오류 " + report.errors.length + "건"} · 만든 때 ${new Date().toLocaleString("ko-KR")}</p>
  <p>급별 문항 수 ${[1, 2, 3, 4, 5].map((l) => l + "급 " + bank.items.filter((i) => i.level === l).length).join(" · ")}</p>
  <div class="danger">이 파일에는 정답·해설·출처가 들어 있습니다. 학생이 쓰는 사이트나 공유 폴더, 메신저로 보내지 마세요. 인쇄물도 시험 뒤에 회수합니다.</div>
</header>
<div class="bar">
  <button data-f="l" data-v="" class="on">급 전체</button>${[1, 2, 3, 4, 5].map((l) => `<button data-f="l" data-v="${l}">${l}급</button>`).join("")}
  <span class="sp"></span>
  <button data-f="a" data-v="" class="on">영역 전체</button>${[1, 2, 3, 4].map((a) => `<button data-f="a" data-v="${a}">${MARK[a]}</button>`).join("")}
  <button data-f="h" data-v="" class="on">반 전체</button><button data-f="h" data-v="A">A반</button><button data-f="h" data-v="B">B반</button>
  <span class="sp"></span>
  <input type="search" id="q" placeholder="id·명세·문두·보기 검색" aria-label="검색">
  <button id="keyBtn" aria-pressed="false">정답 가리기</button>
  <button onclick="window.print()">인쇄</button>
  <span class="meta" id="cnt"></span>
</div>
${groups.join("\n")}
<section class="lv" data-l="0"><h2>연습 문항 <small>점수에 들어가지 않음</small></h2>${practice}</section>
</div>
<script>
var F={l:"",a:"",h:""},qs=document.getElementById("q"),cnt=document.getElementById("cnt");
function apply(){
  var t=qs.value.trim().toLowerCase(),n=0;
  document.querySelectorAll(".q").forEach(function(el){
    var ok=(!F.l||el.dataset.l===F.l)&&(!F.a||el.dataset.a===F.a)&&(!F.h||el.dataset.h===F.h)&&(!t||(el.dataset.t||"").indexOf(t)>=0);
    el.style.display=ok?"":"none"; if(ok)n++;
  });
  document.querySelectorAll("section.lv").forEach(function(s){
    var any=[].some.call(s.querySelectorAll(".q"),function(e){return e.style.display!=="none"});
    s.style.display=any?"":"none";
  });
  cnt.textContent=n+"문항";
}
document.querySelectorAll(".bar button[data-f]").forEach(function(b){
  b.addEventListener("click",function(){
    F[b.dataset.f]=b.dataset.v;
    document.querySelectorAll('.bar button[data-f="'+b.dataset.f+'"]').forEach(function(x){x.classList.toggle("on",x===b)});
    apply();
  });
});
qs.addEventListener("input",apply);
document.getElementById("keyBtn").addEventListener("click",function(){
  var on=document.body.classList.toggle("hide-key");
  this.setAttribute("aria-pressed",String(on));
  this.textContent=on?"정답 보이기":"정답 가리기";
});
apply();
</script>
</body></html>`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html, "utf8");
console.log("만들었습니다: " + path.relative(ROOT, outPath) + " (" + Math.round(html.length / 1024) + "KB, " + bank.items.length + "문항)");
console.log("브라우저로 그냥 열면 됩니다. 이 파일은 저장소에 올라가지 않는 자리에 있습니다(.gitignore).");
