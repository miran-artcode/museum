/* ============================================================
   그리드 계층 (2026-10-14)
   · 화면 너비 다섯 구간마다 바깥 여백(gutter)·카드 안 여백(pad)·칸 간격(gap)을 토큰으로 정한다
   · 상단 바와 본문이 같은 틀(frame) 너비를 쓰게 해 왼쪽 선을 맞춘다
     (학생 화면은 상단 바 1080px·본문 880px로 로고와 카드가 100px 어긋나 있었다)
   · 넓은 화면에서는 틀을 넓혀, 열이 많은 표가 빈 여백을 두고 가로로 밀리지 않게 한다
   · 학습지 2열 격자(.f-grid)에서 표·점검표처럼 .field가 아닌 칸은 한 줄 전체를 쓴다
     (5차시 생성 회차 기록·이중 점검표가 오른쪽 절반을 비워 둔 채 398px 칸 안에서 가로 스크롤됐다)
   · 글상자는 글 길이만큼 늘어나 칸 안 스크롤 없이 읽힌다 (GridRuntime)
   · 같은 날 보강: 균형 격자. 차시 흐름·작품 카드·도식·지표 카드처럼 칸 수가 정해진 격자는
     칸 수와 실제 너비로 열 수를 골라 마지막 줄에 한두 칸만 떨어지지 않게 한다(GridRuntime의 balance)
   · 작품 띠처럼 가로로 넘기는 띠는 썸네일을 정수 개로 나눠 끝에서 잘리지 않게 한다(strip)
   App이 UxStyle·ArStyle 뒤에 마지막 <style>로 얹는다.
   ============================================================ */
import React, { useEffect } from "react";

/* 구간: xs <600 · sm 600~899 · md 900~1199 · lg 1200~1599 · xl ≥1600
   frame은 여백을 뺀 본문 너비다. read는 학생 기록지·예시 기록지, wide는 교사 화면·전시장. */
export const GRID_CSS = `
:root{
  --gutter:16px; --pad:14px; --gap-x:12px; --gap-y:12px;
  --frame-read:848px; --frame-wide:1048px;
}
@media(min-width:600px){:root{--gutter:20px;--pad:18px;--gap-x:16px;--gap-y:14px}}
@media(min-width:900px){:root{--gutter:24px;--pad:20px}}
@media(min-width:1200px){:root{--gutter:32px;--frame-read:1000px;--frame-wide:1136px}}
@media(min-width:1600px){:root{--frame-read:1040px;--frame-wide:1376px}}

/* ---------- 틀: 상단 바와 본문이 같은 너비·같은 여백 ---------- */
.wrap{max-width:calc(var(--frame-read) + 2 * var(--gutter));padding-left:var(--gutter);padding-right:var(--gutter)}
.wrap.wide{max-width:calc(var(--frame-wide) + 2 * var(--gutter))}
.topbar-in{max-width:calc(var(--frame-read) + 2 * var(--gutter));padding-left:var(--gutter);padding-right:var(--gutter)}
:has(.wrap.wide) > .topbar .topbar-in{max-width:calc(var(--frame-wide) + 2 * var(--gutter))}
.paste-ask-in{max-width:calc(var(--frame-wide) + 2 * var(--gutter));padding-left:var(--gutter);padding-right:var(--gutter)}

/* ---------- 카드 안 여백: 머리·안내·본문·꼬리가 같은 세로선에서 시작한다 ---------- */
.card-head,.card-note,.card-body,.lesson-head,.lesson-body,.lesson-guide{padding-left:var(--pad);padding-right:var(--pad)}
.grade-panel{padding-left:var(--pad);padding-right:var(--pad)}
.card-head{flex-wrap:wrap;row-gap:2px}

/* ---------- 학습지 격자 ---------- */
.f-grid{gap:var(--gap-y) var(--gap-x)}
.f-grid > *,.f-grid > [data-fk] > *{min-width:0}
/* 표·점검표·발상 단계처럼 자체 입력칸을 가진 칸, 글상자·표를 품은 칸은 두 열을 모두 쓴다 */
.f-grid > [data-fk] > :not(.field),.f-grid > :not(.field):not([data-fk]),
.f-grid > [data-fk] > .field:has(textarea,table,.tbl-scroll),.f-grid > .field:has(textarea,table,.tbl-scroll){grid-column:1/-1}
@media(max-width:639px){.f-grid{grid-template-columns:minmax(0,1fr)}}

/* 표 상자는 칸 너비를 넘지 않고, 넘치는 표만 상자 안에서 밀린다 */
.tbl-scroll{max-width:100%}

/* 교사 쪽지시험의 두 열 표 묶음: 표가 한 열에 다 들어가지 않으면 두 열로 나란히 두지 않고 위아래로 쌓는다
   (나란히 두면 두 표가 모두 499px 상자 안에서 가로로 밀렸다) */
.qt-sheet-cols:has(.tbl-scroll),.qt-design-cols:has(.tbl-scroll){grid-template-columns:repeat(auto-fit,minmax(min(100%,740px),1fr))}

/* ---------- 넓은 화면의 교사 지표·연구 카드 ---------- */
.kpis{gap:var(--gap-x)}
.res-grid,.cardgrid{gap:var(--gap-x)}

/* ---------- 글상자: 칸 안에서 스크롤하지 않고 글만큼 늘어난다 (높이는 GridRuntime이 맞춘다) ---------- */
.wrap textarea[data-gfit="fit"]{overflow-y:hidden}

/* ---------- 균형 격자 (열 수는 GridRuntime이 고른다) ----------
   --bal-min: 칸 최소 너비, --bal-max: 최대 열 수, --bal-maxw: 칸이 이보다 넓어지면 열을 늘린다.
   auto-fit·auto-fill은 너비만 보고 열을 정해 7단계가 6+1로 갈라지거나 2개 카드가 4열 격자의 절반을 비웠다.
   균형 격자는 칸 수와 너비를 함께 보고 한 줄에 다 들어가면 한 줄, 아니면 4+3·3+2처럼 고르게 나눈다. */
.lz-steps{--bal-min:124px}
.rd-wk-grid{--bal-min:220px;--bal-maxw:480px}
.vz-cards{--bal-min:150px}
.vz-cmp{--bal-min:200px}
.vz-stats{--bal-min:118px}
.rd-figs.c3{--bal-min:100px;--bal-max:3}
.rd-figs.c4{--bal-min:140px;--bal-max:4}
.kpis{--bal-min:150px}
.at-kpis{--bal-min:160px}
.qt-sheet-kpis{--bal-min:120px}
.cardgrid{--bal-min:168px}
.res-grid{--bal-min:250px}
.at-settings,.qt-settings{--bal-min:150px}
.ax-presets{--bal-min:200px}
[data-bal="on"]{grid-template-columns:repeat(var(--bal-cols),minmax(0,1fr))!important}
[data-bal="on"] > [data-bal-fill]{grid-column:1/-1}

/* ---------- 가로 띠: 썸네일이 띠 끝에서 잘리지 않게 정수 개로 나눈다 ----------
   --strip-min: 썸네일 최소 너비. 넘치는 쪽 끝은 흐리게 해서 더 있다는 것을 보인다. */
.lz-strip{--strip-min:96px}
.iaid-row{--strip-min:132px}
[data-strip] > *{flex:0 0 var(--strip-w)!important;width:var(--strip-w)!important;min-width:0}
[data-strip~="r"]{-webkit-mask-image:linear-gradient(to right,#000 calc(100% - 36px),transparent);mask-image:linear-gradient(to right,#000 calc(100% - 36px),transparent)}
[data-strip~="l"]{-webkit-mask-image:linear-gradient(to left,#000 calc(100% - 36px),transparent);mask-image:linear-gradient(to left,#000 calc(100% - 36px),transparent)}
[data-strip~="l"][data-strip~="r"]{-webkit-mask-image:linear-gradient(to right,transparent,#000 36px,#000 calc(100% - 36px),transparent);mask-image:linear-gradient(to right,transparent,#000 36px,#000 calc(100% - 36px),transparent)}
`;

const BAL_SEL = ".lz-steps,.rd-wk-grid,.vz-cards,.vz-cmp,.vz-stats,.rd-figs.c3,.rd-figs.c4,.kpis,.at-kpis,.qt-sheet-kpis,.cardgrid,.res-grid,.at-settings,.qt-settings,.ax-presets";
const STRIP_SEL = ".lz-strip,.iaid-row";

const num = (cs, k, d) => { const v = parseFloat(cs.getPropertyValue(k)); return isFinite(v) ? v : d; };
const innerW = (el, cs) => el.clientWidth - (parseFloat(cs.paddingLeft) || 0) - (parseFloat(cs.paddingRight) || 0);
const shown = (el) => [...el.children].filter((c) => c.tagName !== "STYLE" && getComputedStyle(c).display !== "none");

/* 열 수 고르기: 한 줄에 다 들어가면 한 줄. 아니면 들어가는 열 수(fit)부터 그 절반까지 시험해
   줄 수가 적고 마지막 줄 빈칸이 적은 쪽을 고른다(7칸·fit 6 → 4+3, 5칸·fit 4 → 3+2, 8칸·fit 7 → 4+4). */
export function pickCols(n, fit, maxw, W, gap) {
  if (n <= 1) return 1;
  if (n <= fit) {
    if (maxw && (W - (n - 1) * gap) / n > maxw) return Math.min(fit, Math.max(n, Math.ceil((W + gap) / (maxw + gap))));
    return n;
  }
  let best = fit, cost = Infinity;
  for (let c = fit; c >= Math.max(1, Math.ceil(fit / 2)); c--) {
    const rows = Math.ceil(n / c), empty = rows * c - n;
    const k = rows + (1.5 * empty) / c;
    if (k < cost - 1e-9) { cost = k; best = c; }
  }
  return best;
}

function balance(el) {
  const cs = getComputedStyle(el);
  const kids = shown(el);
  kids.forEach((c) => { if (c.hasAttribute("data-bal-fill")) c.removeAttribute("data-bal-fill"); });
  if (cs.display !== "grid" || el.offsetParent === null) return;
  const gap = parseFloat(cs.columnGap) || 0;
  const W = innerW(el, cs);
  if (W <= 0) return;
  const min = num(cs, "--bal-min", 160), maxC = num(cs, "--bal-max", 12), maxw = num(cs, "--bal-maxw", 0);
  const fit = Math.max(1, Math.min(maxC, Math.floor((W + gap) / (min + gap))));
  const n = kids.length;
  const cols = pickCols(n, fit, maxw, W, gap);
  if (el.dataset.bal !== "on") el.dataset.bal = "on";
  if (el.style.getPropertyValue("--bal-cols") !== String(cols)) el.style.setProperty("--bal-cols", String(cols));
  // 그래도 마지막 줄에 한 칸만 남으면 그 칸이 줄 전체를 쓴다(3칸·2열, 7칸·3열)
  if (cols > 1 && n > cols && n % cols === 1) kids[n - 1].setAttribute("data-bal-fill", "");
}

function strip(el) {
  const cs = getComputedStyle(el);
  if (el.offsetParent === null) return;
  const gap = parseFloat(cs.columnGap) || 0;
  const W = innerW(el, cs);
  if (W <= 0) return;
  const min = num(cs, "--strip-min", 96);
  // 들어가는 개수를 반올림하되 썸네일이 최소 너비의 80%보다 작아지면 내림(폰 300px 띠: 2개 146px 대신 3개 95px)
  const x = (W + gap) / (min + gap);
  let k = Math.max(1, Math.round(x));
  if ((W - (k - 1) * gap) / k < min * 0.8) k = Math.max(1, Math.floor(x));
  const w = Math.floor(((W - (k - 1) * gap) / k) * 10) / 10 + "px";
  if (el.style.getPropertyValue("--strip-w") !== w) el.style.setProperty("--strip-w", w);
  // 스크롤 위치에 따라 넘치는 쪽 끝을 흐리게
  const more = (el.scrollLeft > 2 ? "l " : "") + (el.scrollLeft + el.clientWidth < el.scrollWidth - 2 ? "r" : "");
  const v = ("on " + more).trim();
  if (el.getAttribute("data-strip") !== v) el.setAttribute("data-strip", v);
}

/* 격자·띠를 찾아 크기 변화를 지켜본다. 새로 그려진 것은 MutationObserver가 넘겨준다 */
let watched = new WeakSet();
let ro = null;
function layoutAll() {
  document.querySelectorAll(BAL_SEL).forEach((el) => { if (ro && !watched.has(el)) { watched.add(el); ro.observe(el); } balance(el); });
  document.querySelectorAll(STRIP_SEL).forEach((el) => {
    if (!watched.has(el)) { watched.add(el); if (ro) ro.observe(el); el.addEventListener("scroll", () => strip(el), { passive: true }); }
    strip(el);
  });
}

export function GridStyle() { return <style>{GRID_CSS}</style>; }

/* 글상자 자동 높이.
   rows로 정한 높이를 최소로 두고 글이 넘치면 그만큼 늘린다. 화면 높이의 85%를 넘으면 그 안에서 스크롤한다
   (아주 긴 답에서 입력 위치를 잃지 않게). 사진 편집기·스케치 도구의 글상자와 field-sizing:content를 쓰는 칸은 건드리지 않는다.
   서버에서 값이 바뀌는 경우(다른 기기 저장·되돌리기)는 input 이벤트가 없으므로 1.5초마다 넘친 칸만 다시 잰다. */
const SKIP = ".pe, .pe-txt, [class^='sk'], [class*=' sk'], [data-gfit='off']";
function fit(t) {
  if (!t || t.tagName !== "TEXTAREA" || !t.isConnected) return;
  if (!t.closest(".wrap") || t.closest(SKIP)) return;
  if (t.offsetParent === null) return; // 접힌 칸은 펼쳐질 때 잰다
  const cs = getComputedStyle(t);
  if (cs.fieldSizing === "content") return;
  const keep = window.scrollY;
  const border = t.offsetHeight - t.clientHeight;
  t.style.height = "";                 // rows 기준 높이로 되돌려 최소 높이를 잰다
  const base = t.offsetHeight;
  const need = t.scrollHeight + border;
  const cap = Math.max(base, Math.round(window.innerHeight * 0.85));
  const h = Math.min(Math.max(base, need), cap);
  if (h > base) t.style.height = h + "px";
  t.dataset.gfit = need > cap ? "max" : "fit";
  if (window.scrollY !== keep) window.scrollTo(window.scrollX, keep);
}
function fitAll(onlyOverflow) {
  document.querySelectorAll(".wrap textarea").forEach((t) => {
    if (onlyOverflow && !(t.scrollHeight > t.clientHeight + 1) && t.dataset.gw === String(t.clientWidth)) return;
    t.dataset.gw = String(t.clientWidth);
    fit(t);
  });
}

export function GridRuntime() {
  useEffect(() => {
    let raf = 0;
    const later = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; fitAll(true); layoutAll(); }); };
    const onInput = (e) => fit(e.target);
    const onResize = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; fitAll(false); layoutAll(); }); };
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver((ents) => ents.forEach((e) => { const el = e.target; if (el.matches(STRIP_SEL)) strip(el); else balance(el); }));
    }
    document.addEventListener("input", onInput, true);
    // 펼침(details)·탭 전환·새 칸이 그려질 때
    document.addEventListener("toggle", later, true);
    window.addEventListener("resize", onResize);
    const mo = new MutationObserver(later);
    mo.observe(document.body, { childList: true, subtree: true });
    const iv = setInterval(() => fitAll(true), 1500);
    later();
    return () => {
      document.removeEventListener("input", onInput, true);
      document.removeEventListener("toggle", later, true);
      window.removeEventListener("resize", onResize);
      mo.disconnect(); clearInterval(iv); if (raf) cancelAnimationFrame(raf);
      if (ro) { ro.disconnect(); ro = null; }
      watched = new WeakSet();
    };
  }, []);
  return null;
}
