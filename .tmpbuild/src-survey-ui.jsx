import React, { useState, useEffect, useRef } from "react";

/* ============================================================
   설문 화면 UI 계층 — 사전·사후 창의성 설문(24문항)의 응답 보조 장치

   왜 따로 두는가:
   24문항을 한 화면에 세로로 늘어놓으면 척도 범례(1=전혀 그렇지 않다 …
   5=매우 그렇다)가 스크롤 밖으로 사라진다. 앵커를 잃은 응답은 그 자체로
   측정 오차이고, 특히 역문항(a12·a15·a23)에서 오염이 가장 크다.
   여기서는 세 가지를 붙인다.
     ① 화면에 고정되는 척도 막대 — 눈금이 아래 응답 단추와 같은 너비로
        정렬되어 열 머리글처럼 읽힌다.
     ② 남은 문항으로 건너뛰기 — 24개 중 안 한 것을 눈으로 찾지 않게 한다.
     ③ 키보드 방향키 이동과 스크린리더용 이름 — 기존 단추는 숫자만 읽혔다.

   src-app.jsx의 거대한 CSS 상수와 SurveyCard를 통째로 건드리지 않도록,
   src-content.jsx의 ContentStyle 선례를 따라 style을 따로 내보낸다.
   ============================================================ */

/* 고정 막대의 눈금에 붙는 짧은 이름. 34px 칸에 들어가야 하므로 세 글자 이내.
   원래 문구(LIKERT)는 카드 위쪽 안내문과 각 단추의 접근성 이름에 그대로 남는다. */
export const LIKERT_SHORT = ["전혀", "아니다", "보통", "그렇다", "매우"];

/* 상단 topbar가 sticky(top:0)이므로 그 높이만큼 내려서 겹치지 않게 한다.
   topbar-in은 flex-wrap이라 화면 폭에 따라 높이가 변한다 — 측정해서 따라간다. */
export function useTopbarHeight() {
  const [h, setH] = useState(56);
  useEffect(() => {
    const bar = document.querySelector(".topbar");
    if (!bar) return;
    const update = () => {
      const next = Math.round(bar.getBoundingClientRect().height);
      if (next > 0) setH(next);
    };
    update();
    let ro = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(update);
      ro.observe(bar);
    }
    window.addEventListener("resize", update);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);
  useEffect(() => {
    document.documentElement.style.setProperty("--sv-top", h + "px");
  }, [h]);
  return h;
}

/* 문항으로 이동 — 고정 막대에 가리지 않도록 scroll-margin-top을 CSS에서 준다 */
export function scrollToSurveyItem(key) {
  const el = document.getElementById("sv-" + key);
  if (!el) return;
  el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  el.classList.add("sv-hit");
  setTimeout(() => el.classList.remove("sv-hit"), 1400);
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

/* 진행률 묶음 — 몇 개 했는지 · 막대 · 남은 문항으로 건너뛰기.
   창의성 설문(v1)과 성향 설문(s1)이 같이 쓴다. 막대 색은 카드가 --sv-accent로 정한다. */
export function SurveyProgress({ done, total, remain, onJump }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="sv-prog">
      <span className="sv-prog-count">{done}<i>/{total}</i></span>
      <span className="sv-prog-track" role="progressbar" aria-valuenow={done} aria-valuemin={0}
        aria-valuemax={total} aria-label={"응답한 문항 " + done + "개, 전체 " + total + "개"}>
        <span className="sv-prog-fill" style={{ width: pct + "%" }} />
      </span>
      {remain > 0 && onJump ? (
        <button type="button" className="sv-scale-jump" onClick={onJump}>
          남은 {remain}개<span aria-hidden="true"> ↓</span>
        </button>
      ) : remain === 0 ? <span className="sv-scale-ok">다 답했습니다</span> : null}
    </div>
  );
}

/* 화면에 고정되는 척도 막대.
   왼쪽은 진행률, 오른쪽은 1~5 눈금(아래 응답 단추와 같은 너비·간격으로 정렬). */
export function SurveyScaleBar({ labels, done, total, remain, firstGapKey, onRevealGaps }) {
  const top = useTopbarHeight();

  const jump = () => {
    if (onRevealGaps) onRevealGaps();
    if (firstGapKey) scrollToSurveyItem(firstGapKey);
  };

  return (
    <div className="sv-scale sv-stickybar" style={{ top }}>
      <SurveyProgress done={done} total={total} remain={remain}
        onJump={firstGapKey ? jump : null} />
      <ol className="sv-scale-ticks" aria-label="응답 척도">
        {labels.map((full, i) => (
          <li key={i} title={full}>
            <b>{i + 1}</b>
            <span>{LIKERT_SHORT[i] || full}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* 응답 단추 한 줄 — 방향키 이동과 스크린리더용 이름을 붙인 판.
   기존 단추는 숫자만 읽혀서 "3"이 무슨 뜻인지 화면을 못 보면 알 수 없었다. */
export function LikertRow({ value, onPick, label, labels }) {
  const ref = useRef(null);

  const onKeyDown = (e) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1
      : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const cur = value >= 1 && value <= 5 ? value : (step > 0 ? 0 : 6);
    const next = Math.min(5, Math.max(1, cur + step));
    onPick(next);
    const btns = ref.current ? ref.current.querySelectorAll("button") : null;
    if (btns && btns[next - 1]) btns[next - 1].focus();
  };

  return (
    <div className="likert" role="radiogroup" aria-label={label} ref={ref} onKeyDown={onKeyDown}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n}
          className={value === n ? "on" : ""}
          aria-label={n + "점 — " + labels[n - 1]}
          title={labels[n - 1]}
          tabIndex={value === n || (!(value >= 1) && n === 1) ? 0 : -1}
          onClick={() => onPick(n)}>{n}</button>
      ))}
    </div>
  );
}

const SURVEY_UI_CSS = `
/* 고정 막대의 공통 뼈대 — card-body 안쪽 첫 자식이라 카드를 벗어나면 함께 사라진다.
   창의성 설문(.sv-scale)과 성향 설문(.st-bar)이 같이 쓴다. 카드마다 다른 값은
   --sv-accent(막대 색) · --sv-bar-gap(아래 여백) · --sv-bar-rowgap(줄바꿈 간격)으로 넘긴다.
   두 stylesheet의 순서에 기대지 않도록 덮어쓰기는 전부 사용자 정의 속성으로 한다. */
.sv-stickybar{
  position:sticky; z-index:12;
  margin:-16px -18px var(--sv-bar-gap, 14px); padding:8px 18px 7px;
  background:var(--card2); border-bottom:1px solid var(--line);
  display:flex; align-items:flex-end; justify-content:space-between;
  gap:var(--sv-bar-rowgap, 10px) var(--sv-bar-colgap, 14px); flex-wrap:wrap;
}
.sv-card{--sv-accent:var(--seal)}

/* 진행률 묶음 — 두 설문 공용 */
.sv-prog{display:flex;align-items:center;gap:8px;min-width:0;padding-bottom:2px}
.sv-prog-count{font-family:var(--mono);font-size:13px;color:var(--ink);white-space:nowrap;font-variant-numeric:tabular-nums}
.sv-prog-count i{font-style:normal;font-size:11px;color:var(--sub)}
.sv-prog-track{position:relative;display:block;width:56px;height:3px;background:var(--line);flex:0 0 auto}
.sv-prog-fill{position:absolute;left:0;top:0;bottom:0;background:var(--sv-accent, var(--seal));transition:width .25s ease}
.sv-scale-jump{
  border:1px solid var(--line); background:var(--card);
  font-family:var(--mono); font-size:11px; color:var(--sub);
  padding:2px 8px; cursor:pointer; white-space:nowrap;
}
.sv-scale-jump:hover{border-color:var(--seal);color:var(--seal)}
.sv-scale-jump:focus-visible{outline:2px solid var(--seal);outline-offset:1px}
.sv-scale-ok{font-family:var(--mono);font-size:11px;color:var(--patina);white-space:nowrap}

/* 눈금 — 아래 .likert 단추와 같은 34px·4px 간격이라 열 머리글처럼 정렬된다 */
.sv-scale-ticks{display:flex;gap:4px;list-style:none;margin:0 0 0 auto;padding:0;flex:0 0 auto}
.sv-scale-ticks li{
  width:34px; display:flex; flex-direction:column; align-items:center; gap:1px;
  text-align:center; line-height:1.1;
}
.sv-scale-ticks b{font-family:var(--mono);font-size:12px;font-weight:500;color:var(--ink)}
.sv-scale-ticks span{font-size:10px;color:var(--sub);letter-spacing:-.03em;word-break:keep-all}

/* 손가락 입력에서는 단추와 눈금을 함께 40px로 키워 정렬을 유지한다 */
@media (pointer:coarse){
  .likert button{width:40px;height:40px;font-size:14px}
  .sv-scale-ticks li{width:40px}
}

/* 건너뛰기로 도착한 문항이 고정 막대에 가리지 않게 */
.sv-item{scroll-margin-top:calc(var(--sv-top, 56px) + 74px)}

/* 아직 답하지 않은 문항 — 「남은 N개」를 누른 뒤에만 표시한다.
   처음부터 켜 두면 24문항이 전부 오류처럼 보인다 */
.sv-gaps .sv-item.is-gap{
  background:var(--seal-bg);
  box-shadow:inset 3px 0 0 var(--seal);
  padding-left:9px; margin-left:-9px;
}
.sv-item.sv-hit{animation:svHit 1.4s ease-out}
@keyframes svHit{
  0%,55%{background:var(--seal-bg)}
  100%{background:transparent}
}
@media (prefers-reduced-motion: reduce){
  .sv-item.sv-hit{animation:none;background:var(--seal-bg)}
  .sv-prog-fill{transition:none}
}

@media (max-width:560px){
  .sv-stickybar{margin:-16px -14px var(--sv-bar-gap, 12px);padding:7px 14px 6px}
  .sv-prog-track{width:40px}
  .sv-item{scroll-margin-top:calc(var(--sv-top, 56px) + 88px)}
}
`;

export function SurveyStyle() { return <style>{SURVEY_UI_CSS}</style>; }
