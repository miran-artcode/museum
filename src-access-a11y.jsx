/* ============================================================
   모든 화면 공통 접근성 보정 (2026-09-28)
   ------------------------------------------------------------
   2026-09-28 접근성 점검(WCAG 2.2 AA·KWCAG 2.2, 설계서 §7)에서 나온 결함 가운데
   화면 구성 요소를 고치지 않고 바로잡을 수 있는 것만 여기 모았다. 구성 요소 안을 고쳐야 하는 것
   (저장 표시의 실시간 알림, 차시 탭의 역할, 동료 평가 기호 버튼의 상태)은 설계서 §7.3의 목록으로 넘긴다.

   A11yStyle (CSS)
     · 키보드 초점 표시(2.4.7), 고정 표시줄 아래로 초점이 숨지 않게 scroll-padding(2.4.11)
     · 입력칸 테두리 3:1(1.4.11), 자리 표시 글자 4.5:1(1.4.3), 옅은 상자 위 회색 글자 짙게
     · 차시 진행 점을 색만이 아니라 모양으로도 구분(1.4.1): 빈 고리·반 채움·채움
     · 9~10px 이름표를 12px로
   A11yRuntime (한 번 그린다)
     · 본문으로 건너뛰기(2.4.1), 탭 줄의 화살표 이동(WAI-ARIA 탭 패턴)
     · 학습지 질문 이름표와 입력칸 잇기(1.3.1·4.1.2): <label>이 입력칸과 이어져 있지 않아 스크린리더가
       「편집, 빈 칸」만 읽던 문제. JSX가 쓰지 않는 속성(id, aria-labelledby, aria-label, role=group)만 붙이므로
       React가 다시 그려도 부딪히지 않는다. 입력칸이 새로 그려지면 MutationObserver가 다시 잇는다.
     · 표 안 입력칸의 이름: 열 제목 + 행 번호 (폰에서 thead가 숨는 표 포함)
     · 누른 버튼이 사라져 초점이 문서 처음으로 떨어지면 가까운 카드로 옮긴다(2.4.3)
     · 화면마다 문서 제목 바꾸기(2.4.2)
   ============================================================ */
import React, { useEffect } from "react";

export const A11Y_CSS = `
html :focus-visible{outline:3px solid #1f5fbf;outline-offset:2px}
.arx-stage canvas:focus-visible{outline:3px solid #1f5fbf!important}
.ax-skip{position:absolute;left:-9999px;top:0;z-index:10000;background:#111;color:#fff;padding:10px 14px;font-size:14px;text-decoration:none}
.ax-skip:focus{left:8px;top:8px}
[tabindex="-1"]:focus:not(:focus-visible){outline:none}
/* 화면에는 보이지 않고 스크린리더만 읽는 글 */
.ax-sr{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}

/* 고정 표시줄(상단 바·설문 진행 줄) 아래로 초점이 숨지 않게 */
html{scroll-padding-top:calc(var(--sv-top,56px) + 12px)}
html:has(.sv-stickybar){scroll-padding-top:calc(var(--sv-top,56px) + 100px)}
html:has(.paste-ask){scroll-padding-bottom:40vh}
@media (max-height:480px){
  .topbar,.sv-stickybar,.gal-controls{position:static!important}
  .paste-ask{max-height:45vh;overflow:auto}
}

/* 자리 표시 글자: 파이어폭스·사파리의 기본값은 대비가 모자란다 */
::placeholder{color:#6e6e6e;opacity:1}

/* 입력칸 테두리 3:1 이상 (#9a9a9a는 2.8:1) */
html body .field input,html body .field textarea,html body .field select{border-color:#767676}

/* 옅은 초록·붉은 상자 위의 회색 글자 */
.inq-probe .hint,.inq-probe .inq-l,.pcard.on .pc-s{color:#555}

/* 나중 단계 버튼을 흐리게(opacity) 하면 글자 대비가 2:1까지 떨어진다: 점선 테두리로 구분 */
html body .ld-step.later{opacity:1;border-style:dashed;color:#5f5f5f}

/* 차시 진행 점: 시작 전은 빈 고리, 진행 중은 반 채움, 다 한 차시는 채움 */
html body .sess-tab .dot{background:transparent;box-shadow:inset 0 0 0 1.5px #767676}
html body .sess-tab .dot.part{background:linear-gradient(90deg,var(--amber-fill,#96712F) 50%,transparent 50%);box-shadow:inset 0 0 0 1.5px var(--amber-fill,#96712F)}
html body .sess-tab .dot.full{background:var(--patina);box-shadow:none}
html body .sess-tab.on .dot{box-shadow:inset 0 0 0 1.5px #fff}
.as-tab .dot,.qz-tab .dot{display:none}

/* 펼치기 기호는 스크린리더가 읽지 않게 */
.gal-samples > summary::before{content:"＋" / ""}
.gal-samples[open] > summary::before{content:"－" / ""}

/* 9~10px 이름표 */
.ld-step .hw,.hw-chip,.carry .cr .l,.tf .tf-l,.tf-sub,.sum-box .h,.sum-edit,.stmt-prev b{font-size:12px}
@media (max-width:640px){.lt.stack td::before{font-size:12px}}
.ivt button{min-height:24px}
`;

export function A11yStyle() { return <style>{A11Y_CSS}</style>; }

/* ---------- 이름표 잇기 ---------- */
let seq = 0;
const nid = (p) => p + "-" + (++seq).toString(36);
const CONTROL = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=range]), textarea, select';

/* 이미 이름이 있는 입력칸인가: aria-label, aria-labelledby, 이어진 <label> */
function named(el) {
  if (el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby")) return true;
  if (el.labels && el.labels.length) return Array.from(el.labels).some((l) => (l.textContent || "").trim());
  return false;
}

/* 입력칸을 이름표 요소와 잇는다 (이름표에 id가 없으면 붙인다) */
function link(ctrl, labelEl) {
  if (!labelEl || !(labelEl.textContent || "").trim()) return;
  if (!labelEl.id) labelEl.id = nid("axl");
  ctrl.setAttribute("aria-labelledby", labelEl.id);
}

/* 표 안의 입력칸: 열 제목과 행 번호로 이름을 짓는다 */
function tableName(ctrl) {
  const td = ctrl.closest("td");
  if (!td) return "";
  const tr = td.parentElement;
  const table = td.closest("table");
  let col = td.getAttribute("data-th") || "";
  if (!col && table) {
    const ths = table.querySelectorAll("thead th");
    const th = ths[td.cellIndex];
    col = th ? (th.textContent || "").trim() : "";
  }
  let row = "";
  const rn = tr && tr.querySelector(".rn");
  if (rn) row = (rn.textContent || "").trim();
  else if (tr && tr.parentElement && tr.parentElement.tagName === "TBODY") row = String(Array.prototype.indexOf.call(tr.parentElement.children, tr) + 1);
  const n = td.querySelectorAll(CONTROL).length > 1 ? " " + (Array.prototype.indexOf.call(td.querySelectorAll(CONTROL), ctrl) + 1) : "";
  return [col, row && row + "번"].filter(Boolean).join(" ") + n;
}

/* 묶음 상자와 그 안의 이름표 */
const BOXES = [
  { box: ".field", label: ":scope > label, :scope > .q-head > label, :scope > .q-head label" },
  { box: ".tf", label: ":scope > .tf-l" },
  { box: ".debate-cell", label: ":scope > .debate-l" },
  { box: ".inq-selfq", label: ":scope > label" },
];

function linkAll(root) {
  for (const b of BOXES) {
    root.querySelectorAll(b.box).forEach((box) => {
      const lab = box.querySelector(b.label);
      if (!lab || lab.htmlFor) return;
      // 안쪽에 같은 종류의 상자가 또 있으면 그 상자의 칸은 제외
      const ctrls = Array.from(box.querySelectorAll(CONTROL)).filter((c) => c.closest(b.box) === box);
      const free = ctrls.filter((c) => !named(c));
      if (ctrls.length === 1) { if (free.length) link(free[0], lab); return; }
      if (ctrls.length > 1) {
        if (!box.hasAttribute("role")) {
          if (!lab.id) lab.id = nid("axl");
          box.setAttribute("role", "group");
          box.setAttribute("aria-labelledby", lab.id);
        }
        free.forEach((c) => { const t = tableName(c); if (t) c.setAttribute("aria-label", t); });
      }
    });
  }
  // 상자 밖의 표 입력칸(발상 단계 표 등)
  root.querySelectorAll("table " + CONTROL.split(", ").join(", table ")).forEach((c) => {
    if (named(c)) return;
    const t = tableName(c);
    if (t) c.setAttribute("aria-label", t);
  });
}

/* ---------- 문서 제목 ---------- */
const BASE_TITLE = "허구의 아카이브";
function titleNow() {
  const q = (s) => document.querySelector(s);
  const txt = (el) => (el ? (el.textContent || "").replace(/\s+/g, " ").trim() : "");
  if (q(".g4")) return BASE_TITLE + ": 입장";
  if (q(".qz-overlay")) return "쪽지시험 · " + BASE_TITLE;
  const on = q(".sess-tab.on");
  if (on) return txt(on).replace(/^잠김/, "") + " · " + BASE_TITLE + " 기록실";
  const tt = q(".t-groups .btn[aria-pressed=\"true\"]");
  if (tt) return "교사 · " + txt(tt) + " · " + BASE_TITLE;
  if (q(".gal-hero")) return "전시장 · " + BASE_TITLE;
  return "";
}

export function A11yRuntime() {
  useEffect(() => {
    let raf = 0;
    const run = () => {
      raf = 0;
      try { linkAll(document); } catch (e) {}
      const t = titleNow();
      if (t && document.title !== t) document.title = t;
    };
    const mo = new MutationObserver(() => { if (!raf) raf = requestAnimationFrame(run); });
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "aria-pressed"] });
    run();

    // 탭 줄: 화살표·Home·End로 옮기고 Enter·Space로 연다(수동 활성화)
    const onKey = (e) => {
      const t = e.target;
      if (!t || !t.getAttribute || t.getAttribute("role") !== "tab") return;
      const list = t.closest('[role="tablist"]');
      if (!list) return;
      const tabs = Array.from(list.querySelectorAll('[role="tab"]')).filter((b) => !b.disabled && b.offsetParent !== null);
      const i = tabs.indexOf(t);
      if (i < 0) return;
      let j = -1;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") j = (i + 1) % tabs.length;
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") j = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === "Home") j = 0;
      else if (e.key === "End") j = tabs.length - 1;
      if (j < 0) return;
      e.preventDefault();
      tabs[j].focus();
    };
    document.addEventListener("keydown", onKey);

    // 초점 구조: 누른 버튼이 사라지면(확인 버튼, 단계 이동) 초점이 문서 처음으로 떨어진다. 가까운 카드로 옮긴다
    const onOut = (e) => {
      const el = e.target;
      if (!el || el === document.body) return;
      const home = el.closest && el.closest(".card, .lesson, .as-card, .wrap, dialog");
      setTimeout(() => {
        if (document.activeElement && document.activeElement !== document.body) return;
        if (el.isConnected) return;
        const to = home && home.isConnected ? home : document.querySelector(".wrap");
        if (!to) return;
        if (!to.hasAttribute("tabindex")) to.setAttribute("tabindex", "-1");
        try { to.focus({ preventScroll: true }); } catch (err) {}
      }, 0);
    };
    document.addEventListener("focusout", onOut);
    return () => {
      mo.disconnect();
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("focusout", onOut);
    };
  }, []);

  const skip = (e) => {
    e.preventDefault();
    const el = document.querySelector("main, .wrap, .g4-main, .gal-wrap");
    if (!el) return;
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    try { el.focus(); } catch (err) {}
  };
  return <a href="#" className="ax-skip" onClick={skip}>본문으로 건너뛰기</a>;
}
