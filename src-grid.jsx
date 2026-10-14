/* ============================================================
   그리드 계층 (2026-10-14)
   · 화면 너비 다섯 구간마다 바깥 여백(gutter)·카드 안 여백(pad)·칸 간격(gap)을 토큰으로 정한다
   · 상단 바와 본문이 같은 틀(frame) 너비를 쓰게 해 왼쪽 선을 맞춘다
     (학생 화면은 상단 바 1080px·본문 880px로 로고와 카드가 100px 어긋나 있었다)
   · 넓은 화면에서는 틀을 넓혀, 열이 많은 표가 빈 여백을 두고 가로로 밀리지 않게 한다
   · 학습지 2열 격자(.f-grid)에서 표·점검표처럼 .field가 아닌 칸은 한 줄 전체를 쓴다
     (5차시 생성 회차 기록·이중 점검표가 오른쪽 절반을 비워 둔 채 398px 칸 안에서 가로 스크롤됐다)
   · 글상자는 글 길이만큼 늘어나 칸 안 스크롤 없이 읽힌다 (GridRuntime)
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
`;

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
    const later = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; fitAll(true); }); };
    const onInput = (e) => fit(e.target);
    const onResize = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; fitAll(false); }); };
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
    };
  }, []);
  return null;
}
