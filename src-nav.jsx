/* ============================================================
   사이드바·고정 머리 계층 (2026-10-14)
   · 1200px 이상에서 학생·교사 화면 왼쪽에 사이드바를 둔다
     - 학생: 차시 목록(진행 점·잠김)과 최종 평가·쪽지시험, 그 아래 「이 화면 차례」(강의 노트·학습지 카드로 이동, 지금 읽는 카드 표시)
     - 교사: 교사 탭 묶음(TEACHER_TAB_GROUPS)을 세로로 펼친다
     그 아래 너비에서는 사이드바를 숨기고 기존 가로 탭을 그대로 쓴다.
   · 상단 바는 원래 sticky다. 여기에 학생 차시 탭(.sess-tabs)을 상단 바 바로 아래에 붙여 고정하고,
     두 줄을 합친 높이를 --sv-top에 넣어 카드로 이동할 때 머리에 가리지 않게 한다.
     설문 고정 막대(.sv-stickybar)가 있는 동안은 설문 쪽이 --sv-top을 쓰므로 손대지 않고 차시 탭 고정도 푼다.
   · 틀 너비는 src-grid.jsx의 토큰(--gutter·--frame-read·--frame-wide)을 읽기만 한다.
     2열일 때 상단 바 안쪽 너비를 [사이드바 + 간격 + 본문 틀]로 넓혀 로고와 사이드바의 왼쪽 선을 맞춘다.
   App이 GridStyle 뒤에 마지막 <style>로 얹는다.
   ============================================================ */
import React, { useEffect, useState } from "react";

export const NAV_CSS = `
:root{--side-w:232px;--side-gap:28px;--top-h:56px}

/* ---------- 고정 머리 ---------- */
.topbar{transition:box-shadow .15s}
html.nav-scrolled .topbar{box-shadow:0 2px 10px rgba(36,38,31,.10)}
.sess-tabs{position:sticky;top:var(--top-h);z-index:15;background:var(--bg);margin-left:calc(-1 * var(--gutter,16px));margin-right:calc(-1 * var(--gutter,16px));padding-left:var(--gutter,16px);padding-right:var(--gutter,16px)}
html.nav-scrolled .sess-tabs{border-bottom:1px solid var(--line2)}
html.nav-sv .sess-tabs{position:static;border-bottom:0}
.wrap .lesson,.wrap .card{scroll-margin-top:calc(var(--sv-top,60px) + 12px)}
@media (max-height:480px){.sess-tabs{position:static}}
/* 폰: 머리를 얇게 하고, 아래로 읽는 동안은 상단 바를 올려 숨긴다(위로 조금만 올리면 다시 나온다). 차시 탭은 계속 보인다 */
@media (max-width:599px){
  .topbar-in{padding-top:7px;padding-bottom:7px;row-gap:6px}
  .top-right{gap:6px}
  .wrap .sess-tabs{padding-top:8px;padding-bottom:8px}
  .topbar{transition:transform .2s ease,box-shadow .15s}
  .sess-tabs{transition:top .2s ease}
  html.nav-hide .topbar{transform:translateY(-100%);box-shadow:none}
  html.nav-hide .sess-tabs{top:0}
}
@media (prefers-reduced-motion:reduce){.topbar,.sess-tabs{transition:none!important}}

/* ---------- 사이드바 ---------- */
.side-nav{display:none}
@media (min-width:1200px){
  .nav-shell:has(> .side-nav){display:grid;grid-template-columns:var(--side-w) minmax(0,1fr);column-gap:var(--side-gap);
    max-width:calc(var(--side-w) + var(--side-gap) + var(--frame-read) + 2 * var(--gutter));margin:0 auto;padding:0 var(--gutter)}
  .nav-shell:has(> .wrap.wide):has(> .side-nav){max-width:calc(var(--side-w) + var(--side-gap) + var(--frame-wide) + 2 * var(--gutter))}
  .nav-shell:has(> .side-nav) > .wrap{max-width:none;margin:0;padding-left:0;padding-right:0;padding-top:16px;min-width:0}
  :has(> .nav-shell > .side-nav) > .topbar .topbar-in{max-width:calc(var(--side-w) + var(--side-gap) + var(--frame-read) + 2 * var(--gutter))}
  :has(> .nav-shell > .side-nav):has(> .nav-shell > .wrap.wide) > .topbar .topbar-in{max-width:calc(var(--side-w) + var(--side-gap) + var(--frame-wide) + 2 * var(--gutter))}
  .nav-shell:has(> .side-nav) .sess-tabs,.nav-shell:has(> .side-nav) .t-groups{display:none}

  .side-nav{display:block;position:sticky;top:calc(var(--top-h) + 16px);align-self:start;
    max-height:calc(100dvh - var(--top-h) - 32px);overflow-y:auto;scrollbar-width:thin;scrollbar-color:#bbb transparent;
    margin-top:16px;padding:0 4px 24px 0;font-size:13px}
}
.sn-group{margin-bottom:18px}
.sn-l{display:block;font-family:var(--sans);font-size:11px;font-weight:700;color:var(--sub);margin:0 0 6px 10px}
.sn-list{list-style:none;margin:0;padding:0}
.sn-item{display:flex;align-items:center;gap:8px;width:100%;text-align:left;padding:6px 10px;border:0;border-left:2px solid transparent;
  background:none;color:var(--ink);font-family:var(--sans);font-size:13px;line-height:1.4;cursor:pointer}
.sn-item:hover:not(:disabled){background:var(--card2)}
.sn-item.on{border-left-color:var(--seal);background:var(--card);font-weight:700}
.sn-item:disabled{color:var(--sub);cursor:default}
.sn-item:focus-visible{outline:2px solid var(--seal);outline-offset:-2px}
.sn-pct{margin-left:auto;font-size:11px;color:var(--sub);font-variant-numeric:tabular-nums}
.sn-lock{margin-left:auto;font-size:11px;color:var(--sub)}
.sn-dot{flex:0 0 auto;width:8px;height:8px;border-radius:50%;border:1px solid var(--line);background:transparent}
.sn-dot.part{background:linear-gradient(90deg,var(--patina) 50%,transparent 50%);border-color:var(--patina)}
.sn-dot.done{background:var(--patina);border-color:var(--patina)}
.sn-toc{border-left:1px solid var(--line2);margin-left:10px}
.sn-toc .sn-item{padding:4px 10px;font-size:12.5px;color:var(--sub);border-left-width:2px;margin-left:-1px}
.sn-toc .sn-item.on{color:var(--ink);background:none;font-weight:700}
.sn-code{flex:0 0 auto;font-size:11px;color:var(--sub);font-weight:400}
.sn-title{min-width:0;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.sn-top{margin:4px 0 0 10px}
@media print{.side-nav{display:none!important}.sess-tabs{position:static}}
`;

export function NavStyle() { return <style>{NAV_CSS}</style>; }

const reduceMotion = () => typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* 상단 바(+고정된 차시 탭) 높이를 재서 --top-h·--sv-top에 넣고, 스크롤하면 그림자를 켠다 */
export function NavRuntime() {
  useEffect(() => {
    const root = document.documentElement;
    let raf = 0, lastY = window.scrollY;
    const measure = () => {
      raf = 0;
      const bar = document.querySelector(".topbar");
      const full = bar ? Math.round(bar.offsetHeight) : 0;
      if (full > 0) root.style.setProperty("--top-h", full + "px");
      const y = window.scrollY;
      root.classList.toggle("nav-scrolled", y > 4);
      // 폰에서만: 아래로 내리면 숨기고 위로 올리면 보인다. 상단 바 안에 초점이 있으면 숨기지 않는다
      const phone = window.innerWidth < 600;
      const focusIn = bar && bar.contains(document.activeElement);
      if (!phone || focusIn || y < 160) root.classList.remove("nav-hide");
      else if (y > lastY + 6) root.classList.add("nav-hide");
      else if (y < lastY - 6) root.classList.remove("nav-hide");
      if (Math.abs(y - lastY) > 6 || !phone) lastY = y;
      const h = root.classList.contains("nav-hide") ? 0 : full;
      // 설문 고정 막대가 보이는 동안은 설문 쪽 측정이 --sv-top을 맡고, 차시 탭은 고정을 푼다(두 막대가 같은 높이에 겹치지 않게)
      const sv = [...document.querySelectorAll(".sv-stickybar")].some((e) => e.offsetParent !== null);
      root.classList.toggle("nav-sv", sv);
      if (sv) return;
      let top = h;
      const tabs = document.querySelector(".sess-tabs");
      if (tabs && tabs.offsetParent !== null && getComputedStyle(tabs).position === "sticky") top += Math.round(tabs.getBoundingClientRect().height);
      if (top > 0) root.style.setProperty("--sv-top", top + "px");
    };
    const queue = () => { if (!raf) raf = requestAnimationFrame(measure); };
    measure();
    let ro = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(queue);
      const bar = document.querySelector(".topbar");
      if (bar) ro.observe(bar);
    }
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    document.addEventListener("focusin", queue);
    const t = setInterval(queue, 1500); // 화면 전환으로 상단 바가 새로 그려지는 경우
    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      window.removeEventListener("scroll", queue);
      window.removeEventListener("resize", queue);
      document.removeEventListener("focusin", queue);
      clearInterval(t);
      root.classList.remove("nav-scrolled", "nav-sv", "nav-hide");
    };
  }, []);
  return null;
}

/* 본문에서 강의 노트(.lesson)와 학습지 카드(.card[id^=sec-])를 찾아 차례를 만든다.
   카드가 열리고 닫힐 때마다 다시 읽고, 스크롤 위치로 지금 읽는 카드를 고른다. */
function useToc(key) {
  const [items, setItems] = useState([]);
  const [active, setActive] = useState(null);
  useEffect(() => {
    const wrap = document.querySelector(".nav-shell > .wrap");
    if (!wrap) return;
    let els = [];
    const scan = () => {
      els = [...wrap.querySelectorAll(".lesson, .card[id^='sec-']")].filter((el) => el.offsetParent !== null);
      const next = els.map((el, i) => {
        if (el.classList.contains("lesson")) {
          if (!el.id) el.id = "lesson-" + i;
          const n = el.querySelector(".lesson-n");
          const t = el.querySelector(".lesson-title");
          return { id: el.id, code: n ? n.textContent.trim() : "", title: t ? t.textContent.trim() : "강의 노트" };
        }
        const c = el.querySelector(".card-code");
        const t = el.querySelector(".card-title");
        const first = t && t.firstChild && t.firstChild.nodeType === 3 ? t.firstChild.textContent : t ? t.textContent : "";
        return { id: el.id, code: c ? c.textContent.trim() : "", title: first.trim() };
      });
      setItems((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      pick();
    };
    const pick = () => {
      const line = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sv-top")) || 60) + 40;
      let cur = els.length ? els[0].id : null;
      for (const el of els) { if (el.getBoundingClientRect().top <= line) cur = el.id; else break; }
      setActive(cur);
    };
    let tm = 0;
    const later = () => { clearTimeout(tm); tm = setTimeout(scan, 120); };
    const mo = new MutationObserver(later);
    mo.observe(wrap, { childList: true, subtree: true });
    let raf = 0;
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; pick(); }); };
    window.addEventListener("scroll", onScroll, { passive: true });
    scan();
    return () => { mo.disconnect(); clearTimeout(tm); if (raf) cancelAnimationFrame(raf); window.removeEventListener("scroll", onScroll); };
  }, [key]);
  return [items, active];
}

function goTo(id) {
  const el = document.getElementById(id);
  if (!el) return;
  // scrollIntoView는 html의 scroll-padding과 카드의 scroll-margin이 겹쳐 더해지므로 위치를 직접 정한다
  const top = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sv-top")) || 60;
  window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - top - 12, behavior: reduceMotion() ? "auto" : "smooth" });
  const focusEl = el.querySelector("[role='heading']") || el;
  if (!focusEl.hasAttribute("tabindex")) focusEl.setAttribute("tabindex", "-1");
  focusEl.focus({ preventScroll: true });
}

const dotClass = (r) => "sn-dot" + (r >= 1 ? " done" : r > 0 ? " part" : "");

/* 학생 사이드바.
   sessions: [{ name, open, on, ratio }], extras: [{ key, label, on, go }], tocKey: 화면이 바뀔 때 차례를 다시 읽는 열쇠 */
export function StudentSideNav({ sessions, onSession, extras, tocKey }) {
  const [toc, active] = useToc(tocKey);
  return (
    <nav className="side-nav" aria-label="차시와 이 화면 차례">
      <div className="sn-group">
        <span className="sn-l">차시</span>
        <ul className="sn-list">
          {sessions.map((s) => (
            <li key={s.name}>
              <button className={"sn-item" + (s.on ? " on" : "")} disabled={!s.open} aria-current={s.on ? "page" : undefined}
                onClick={() => s.open && onSession(s.name)}>
                {s.open ? <span className={dotClass(s.ratio)} aria-hidden="true" /> : <span className="sn-dot" aria-hidden="true" />}
                <span>{s.name}</span>
                {s.open ? <span className="sn-pct">{Math.round(s.ratio * 100)}%</span> : <span className="sn-lock">잠김</span>}
              </button>
            </li>
          ))}
          {extras.map((x) => (
            <li key={x.key}>
              <button className={"sn-item" + (x.on ? " on" : "")} aria-current={x.on ? "page" : undefined} onClick={x.go}>
                <span className="sn-dot part" aria-hidden="true" /><span>{x.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {toc.length > 1 && (
        <div className="sn-group">
          <span className="sn-l">이 화면 차례</span>
          <ul className="sn-list sn-toc">
            {toc.map((t) => (
              <li key={t.id}>
                <button className={"sn-item" + (active === t.id ? " on" : "")} aria-current={active === t.id ? "location" : undefined} onClick={() => goTo(t.id)}>
                  <span className="sn-title">{t.code && <span className="sn-code">{t.code} </span>}{t.title}</span>
                </button>
              </li>
            ))}
          </ul>
          <button className="btn small ghost sn-top" onClick={() => window.scrollTo({ top: 0, behavior: reduceMotion() ? "auto" : "smooth" })}>맨 위로</button>
        </div>
      )}
    </nav>
  );
}

/* 교사 사이드바: 교사 탭 묶음을 세로로. groups는 보기 전용 계정이면 이미 걸러서 넘긴다 */
export function TeacherSideNav({ groups, tab, onSwitch, dirty }) {
  return (
    <nav className="side-nav" aria-label="교사 화면 메뉴">
      {groups.map((g) => (
        <div className="sn-group" key={g.name}>
          <span className="sn-l">{g.name}</span>
          <ul className="sn-list">
            {g.tabs.map((t) => (
              <li key={t}>
                <button className={"sn-item" + (tab === t ? " on" : "")} aria-current={tab === t ? "page" : undefined} onClick={() => onSwitch(t)}>
                  <span>{t}</span>{t === "수업 편집" && dirty ? <span className="sn-pct" aria-label="저장하지 않은 수정">●</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
