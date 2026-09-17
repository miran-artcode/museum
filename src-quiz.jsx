/* ============================================================
   적응형 쪽지시험(미술사·미술이론 선택형) — 학생 화면
   안내·연습 → 시험 시작(전체화면) → 블록 1~4 → 제출 → 결과(교사 공개 뒤)

   설계 근거: 쪽지시험_구현_근거.md §1~§3(규칙·시간표), §5.4(추출), §5.9(접근성), §7(잠금), §8(문서 구조).
   계약: src-quiz-core.mjs 의 순수 함수와 src-fb.js 의 fbStore.quiz* 만 쓴다(src-app.jsx 는 순환이라 금지).

   화면 원칙
   - 시험 중에는 현재 급·정오·상승/하강을 어디에도 내지 않는다. 블록 번호·답한 수·남은 시간·권장 종료만 보인다.
   - 시험 화면은 position:fixed 로 앱 전체를 덮는다(차시 탭을 누를 수 없다). 전체화면이 아니면 문항을 가린다.
   - 시스템은 기록하고 멈추고 교사를 부를 뿐 점수를 깎지 않는다. 경고 화면·잠금 화면·전체 정지 화면이 떠 있는 동안은 이벤트를 세지 않는다.
   - 시각의 기준은 서버다: 시작 시각은 quizStart 의 serverTimestamp, 남은 시간은 심장박동(20초)마다 되읽은 서버 시각과의 차이로 맞춘다.
   - 블록 제출은 blocks[k]·served[k+1]·cur 를 한 번의 quizPatch 로 쓴다. 실패하면 같은 내용을 「다시 제출」로 재전송하고
     그 전에는 다음 블록을 열지 않는다(served 는 이미 있는 키를 바꿀 수 없으므로 재전송은 같은 객체를 그대로 보낸다).
   - 저장 실패는 alert 가 아니라 화면 안 warn-note 로 알린다. 브라우저 대화 상자는 전체화면을 벗어나게 할 수 있어 쓰지 않는다
     (빈 문항 확인도 화면 안 확인 상자로 한다. 설계서 §5.9 의 「브라우저 대화 상자」에서 바꾼 점).
   ============================================================ */

import React, { useState, useEffect, useRef, useMemo } from "react";
import { fbStore } from "./src-fb.js";
import {
  QUIZ_VER, BLOCKS, BLOCK_SIZE, START_LEVEL, BLOCK_END_MIN, MAX_EVENTS, SCORE_ROWS, MIN_ANSWERED, quizCfg, ruleSentences, eventLabel,
  deriveSeed, halfOf, drawBlock, usedOf, routeNext, isCorrect, optionOrder, clientScoreOf, scoreRowIndex, remainingSec, fmtMMSS, buildSampleQuiz,
} from "./src-quiz-core.mjs";

/* ---------- 상수 (쪽지시험_구현_근거.md §7.2~§7.5) ---------- */

const HB_SEC = 30;               // 심장박동 주기(무료 한도: 박동마다 쓰기 1·읽기 2~3이 든다)
const HB_SYNC_EVERY = 2;         // 이 박동마다 한 번만 서버를 되읽어 시각을 다시 맞춘다
const HB_STALE_SEC = 90;         // 이보다 오래된 심장박동은 끊긴 세션으로 본다(중복 접속 판정)
const BLUR_WARN_MS = 2000;       // 이탈 지속이 이 이상이면 경고, 미만이면 「짧은 이탈」 기록만
const FS_GRACE_MS = 10000;       // 전체화면 복귀 유예
const PREP_MS = 30000;           // 시작 뒤 준비 구간(이탈을 기록만 한다)
const MERGE_MS = 1000;           // 같은 신호가 이 안에 여러 번 오면 한 건
const MLB_MS = 2000;             // 마우스 이탈 뒤 이 안의 blur 에 mlb 표시
const DRAFT_MS = 300;            // 답 선택 저장 디바운스
const RESIZE_RATIO = 0.9;        // 뷰포트가 화면의 이 비율 미만이면 「창 크기 변화」 기록
const SUBMIT_RETRY_MS = 4000;    // 자동 제출 재시도 간격
const SUBMIT_RETRY_N = 3;        // 이 횟수 이상 실패하고 유예도 지났으면 블록 없이 마무리 필드만 쓴다
const GRACE_MS = 60000;          // 규칙 quizWithinTime 의 유예(60초). 이 안에는 블록 쓰기가 아직 허용된다
const FONT_STEPS = [18, 22, 26]; // 글자 크기 3단계
const TIME_ALERTS = [600, 300, 60]; // 남은 시간 알림(초)
const OPT_MARK = ["①", "②", "③", "④"];

/* ---------- 보조 함수 ---------- */

const isPick = (x) => x != null && x !== "";
const pad2 = (n) => String(n).padStart(2, "0");
const fmtT = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return pad2(d.getMonth() + 1) + "/" + pad2(d.getDate()) + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
};
const fmtHMS = (iso) => {
  const d = new Date(iso || "");
  if (Number.isNaN(d.getTime())) return "-";
  return pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
};
const secOf = (ms) => (Number.isFinite(ms) ? Math.round(ms / 100) / 10 + "초" : "-");
const newSess = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
/* 세션 id 는 브라우저 탭마다 하나. 새로고침(F5)은 막지 않으므로 같은 탭은 같은 id 를 유지해야
   자기 자신을 「다른 곳에서 응시 중」으로 오인하지 않는다. 다른 탭·다른 PC 는 새 id 를 받는다 */
const sessOf = (sid) => {
  try {
    const k = "qz-sess:" + sid;
    let s = sessionStorage.getItem(k);
    if (!s) { s = newSess(); sessionStorage.setItem(k, s); }
    return s;
  } catch (e) { return newSess(); }
};
const fsEl = () => (typeof document === "undefined" ? null : document.fullscreenElement || document.webkitFullscreenElement || null);
/* 전체화면 요청은 사용자 제스처 안에서만 성공한다. 거부(promise reject)·API 없음은 false */
async function enterFs() {
  if (typeof document === "undefined") return false;
  const el = document.documentElement;
  const fn = el.requestFullscreen || el.webkitRequestFullscreen;
  if (typeof fn !== "function") return false;
  try {
    const p = fn.call(el);
    if (p && typeof p.then === "function") await p;
    return true;
  } catch (e) { return false; }
}
function exitFs() {
  try {
    if (!fsEl()) return;
    const fn = document.exitFullscreen || document.webkitExitFullscreen;
    if (typeof fn !== "function") return;
    const p = fn.call(document);
    if (p && typeof p.catch === "function") p.catch(() => {});
  } catch (e) {}
}
const nextBlockOf = (blocks) => {
  for (let k = 1; k <= BLOCKS; k += 1) if (!(blocks && blocks[String(k)])) return k;
  return null;
};
const itemMapOf = (bank) => { const m = new Map(); ((bank && bank.items) || []).forEach((it) => { if (it && it.id != null) m.set(String(it.id), it); }); return m; };
const bankReady = (bank, cfg) => !!(bank && bank.ver && Array.isArray(bank.items) && bank.items.length && (!cfg.bankVer || cfg.bankVer === bank.ver));
const clientInfo = () => ({
  ua: typeof navigator !== "undefined" ? String(navigator.userAgent || "").slice(0, 200) : "",
  w: typeof window !== "undefined" ? window.innerWidth : 0, h: typeof window !== "undefined" ? window.innerHeight : 0,
});

/* 부정 문두 표시: neg 문항은 「옳지 않은」 자리를 굵은 밑줄로 보인다(§5.5) */
const NEG_RE = /(옳지 않은|알맞지 않은|적절하지 않은|않은 것|아닌 것|않는 것|없는 것|틀린 것)/;
function Stem({ text, neg }) {
  const s = String(text || "");
  const m = neg ? NEG_RE.exec(s) : null;
  if (!m) return <>{s}</>;
  return <>{s.slice(0, m.index)}<u className="qz-neg">{m[0]}</u>{s.slice(m.index + m[0].length)}</>;
}

const warnText = (ev) => {
  const t = ev && ev.type;
  if (t === "devtools_key") return "개발자 도구 단축키를 누른 것이 기록되었습니다. 시험 화면에서는 쓸 수 없습니다.";
  if (t === "fs_exit") return "전체화면을 벗어난 것이 기록되었습니다. 시험 화면에 머물러 주세요.";
  return "다른 창으로 이동한 것이 기록되었습니다. 시험 화면에 머물러 주세요.";
};

/* ============================================================
   잠금 훅 — §7.2 감지 표와 §7.4 오탐 방지 규칙을 그대로 구현한다
   active: 시험 중(완료 전) · suspended: 경고·잠금·정지 화면이 떠 있음(세지 않음, 막기만 함)
   prepUntilMs: 이 시각 전의 blur·전체화면 이탈은 prep:true 로 기록만
   onEvent(ev, warn): ev 는 { type, ...부가 } (t·block·item·warn 은 호출한 쪽이 붙인다)
   돌려주는 것: fsOut(전체화면을 벗어난 상태), enterFullscreen()
   ============================================================ */
export function useLockdown({ active, suspended, prepUntilMs, onEvent }) {
  const [fsOut, setFsOut] = useState(false);
  const ref = useRef({});
  ref.current = { suspended: !!suspended, prepUntilMs: prepUntilMs || 0, onEvent };

  useEffect(() => {
    if (!active || typeof document === "undefined") return undefined;
    /* st: 리스너 사이에 공유하는 상태. incident 는 「blur 와 전체화면 이탈이 1초 안에 함께 온 한 사건」 */
    const st = { away: null, awayInc: null, awayMlb: false, awaySus: false, incident: null, fsOutAt: null, fsInc: null, fsTimer: null, mouseLeftAt: 0, last: {}, small: false, resizeTimer: null };
    const now = () => Date.now();
    const cur = () => ref.current;
    /* 같은 신호가 MERGE_MS 안에 다시 오면 한 건으로 합친다(일부 브라우저는 fullscreenchange 를 두 번 낸다) */
    const merged = (key) => { const t = now(); if (st.last[key] && t - st.last[key] < MERGE_MS) return true; st.last[key] = t; return false; };
    const incidentOf = () => { const t = now(); if (!st.incident || t - st.incident.at >= MERGE_MS) st.incident = { at: t, warned: false }; return st.incident; };
    /* 준비 구간이면 경고를 기록으로 낮춘다. 사건(incident)이 이미 경고를 냈으면 두 번째 신호는 기록만. 경고를 냈는지 돌려준다 */
    const emit = (type, extra, warn, inc) => {
      const c = cur();
      const prep = (type === "blur" || type === "fs_exit") && c.prepUntilMs && now() < c.prepUntilMs;
      const doWarn = !!warn && !prep && !(inc && inc.warned);
      if (doWarn && inc) inc.warned = true;
      if (typeof c.onEvent === "function") c.onEvent({ type, ...(extra || {}), ...(prep ? { prep: true } : {}) }, doWarn);
      return doWarn;
    };

    /* 탭·창 전환: hidden 과 blur 가 겹치면 먼저 온 것만 시작으로 삼고, 돌아올 때 지속 시간으로 판정한다 */
    /* 덮개(경고·잠금·정지)가 떠 있는 동안에도 이탈은 기록한다(경고는 아님): 경고 화면을 띄운 채 오래 나가 있는 것도 교사가 보아야 한다 */
    const awayStart = () => {
      if (st.away != null) return;
      st.away = now();
      st.awaySus = !!cur().suspended;
      st.awayMlb = st.mouseLeftAt > 0 && st.away - st.mouseLeftAt < MLB_MS;
      st.awayInc = st.awaySus ? null : incidentOf();
    };
    const awayEnd = () => {
      if (st.away == null) return;
      const ms = now() - st.away;
      const inc = st.awayInc, mlb = st.awayMlb;
      st.away = null; st.awayInc = null; st.awayMlb = false;
      /* 덮개가 뜨기 전에 시작된 이탈은 돌아올 때 기록만 남긴다(경고 없음). 지속 시간이 교사의 「오탐」 판단 자료라 버리지 않는다 */
      const sus = cur().suspended || st.awaySus;
      st.awaySus = false;
      if (ms < BLUR_WARN_MS) emit("blur_short", { ms, ...(mlb ? { mlb: true } : {}) }, false, null);
      else emit("blur", { ms, ...(mlb ? { mlb: true } : {}), ...(sus ? { cover: true } : {}) }, !sus, inc);
    };
    const onVis = () => { if (document.visibilityState === "hidden") awayStart(); else awayEnd(); };
    const onBlur = () => awayStart();
    const onFocus = () => awayEnd();

    /* 전체화면: 벗어나면 문항을 가리고(fsOut) 10초 안에 돌아오면 기록만, 넘기면 경고 */
    const onFs = () => {
      if (!fsEl()) {
        setFsOut(true);
        if (cur().suspended || merged("fs_exit") || st.fsOutAt != null) return;
        st.fsOutAt = now();
        st.fsInc = incidentOf();
        st.fsTimer = setTimeout(() => {
          st.fsTimer = null;
          if (st.fsOutAt == null || fsEl()) return;
          const inc = st.fsInc;
          st.fsOutAt = null; st.fsInc = null;
          emit("fs_exit", { ms: FS_GRACE_MS, over: true }, !cur().suspended, inc);
        }, FS_GRACE_MS);
      } else {
        setFsOut(false);
        if (st.fsOutAt != null) {
          const ms = now() - st.fsOutAt;
          st.fsOutAt = null; st.fsInc = null;
          if (st.fsTimer) { clearTimeout(st.fsTimer); st.fsTimer = null; }
          emit("fs_exit", { ms }, false, null);
        }
      }
    };

    /* 키: 개발자 도구 계열은 경고, 인쇄·저장·찾기·복사·붙여넣기는 막고 기록만(습관적 Ctrl+S 가 경고가 되지 않게) */
    const onKeyDown = (e) => {
      const k = String(e.key || "");
      const up = k.length === 1 ? k.toUpperCase() : k;
      const ctrl = e.ctrlKey || e.metaKey;
      const label = (ctrl ? (e.metaKey ? "Meta+" : "Ctrl+") : "") + (e.shiftKey ? "Shift+" : "") + up;
      if (k === "F12" || (ctrl && e.shiftKey && (up === "I" || up === "J" || up === "C")) || (ctrl && !e.shiftKey && up === "U")) {
        e.preventDefault(); e.stopPropagation();
        if (!cur().suspended && !merged("devtools")) emit("devtools_key", { key: label }, true, null);
        return;
      }
      if (ctrl && !e.altKey && (up === "P" || up === "S" || up === "F" || up === "X" || up === "C" || up === "V")) {
        e.preventDefault();
        if (!cur().suspended && !merged("key:" + up)) emit("blocked_key", { key: label }, false, null);
      }
    };
    const onKeyUp = (e) => {
      if (e.key === "PrintScreen" && !cur().suspended && !merged("printscreen")) emit("blocked_key", { key: "PrintScreen" }, false, null);
    };
    const onAction = (e) => {
      e.preventDefault();
      if (!cur().suspended && !merged("act:" + e.type)) emit("blocked_action", { action: e.type }, false, null);
    };
    const onMouseLeave = () => {
      st.mouseLeftAt = now();
      if (!cur().suspended && !merged("mouseleave")) emit("mouseleave", {}, false, null);
    };
    /* 창 크기: 전체화면 상태에서 뷰포트가 화면의 90% 미만으로 「작아지는 순간」만 기록한다(도킹된 개발자 도구·창 축소 의심).
       전체화면 밖의 뷰포트는 원래 작으므로(브라우저 UI·작업 표시줄) 보지 않는다. 그 이탈은 fs_exit 가 이미 기록한다 */
    const onResize = () => {
      if (st.resizeTimer) clearTimeout(st.resizeTimer);
      st.resizeTimer = setTimeout(() => {
        st.resizeTimer = null;
        const sw = (window.screen && window.screen.width) || 0, sh = (window.screen && window.screen.height) || 0;
        const small = !!fsEl() && !!(sw && sh) && (window.innerWidth < sw * RESIZE_RATIO || window.innerHeight < sh * RESIZE_RATIO);
        if (small && !st.small && !cur().suspended) emit("resize", { w: window.innerWidth, h: window.innerHeight }, false, null);
        st.small = small;
      }, 500);
    };

    const root = document.documentElement;
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    document.addEventListener("fullscreenchange", onFs);
    document.addEventListener("webkitfullscreenchange", onFs);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("keyup", onKeyUp, true);
    ["contextmenu", "copy", "cut", "paste", "dragstart"].forEach((t) => document.addEventListener(t, onAction, true));
    root.addEventListener("mouseleave", onMouseLeave);
    window.addEventListener("resize", onResize);
    setFsOut(!fsEl());
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("fullscreenchange", onFs);
      document.removeEventListener("webkitfullscreenchange", onFs);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("keyup", onKeyUp, true);
      ["contextmenu", "copy", "cut", "paste", "dragstart"].forEach((t) => document.removeEventListener(t, onAction, true));
      root.removeEventListener("mouseleave", onMouseLeave);
      window.removeEventListener("resize", onResize);
      if (st.fsTimer) clearTimeout(st.fsTimer);
      if (st.resizeTimer) clearTimeout(st.resizeTimer);
    };
  }, [active]);

  return { fsOut, enterFullscreen: enterFs };
}

/* ============================================================
   공통 조각 — 점수표 · 경고 화면 · 보기 묶음 · 문항 카드
   ============================================================ */

/* 점수표(§4.2). rowIdx 가 있으면 그 행을 「내 행」으로 강조한다 */
function ScoreTable({ rowIdx, incomplete }) {
  return (
    <div className="tbl-scroll">
      <table className="qz-score" aria-label="점수표">
        <thead><tr><th>최종급</th><th>총 정답 수</th><th>점수</th><th>등급</th></tr></thead>
        <tbody>
          {SCORE_ROWS.map((r, i) => {
            const prev = i > 0 && SCORE_ROWS[i - 1].F === r.F ? SCORE_ROWS[i - 1].cMin - 1 : null;
            const range = r.cMin > 0 ? (prev != null ? r.cMin + "~" + prev + "개" : r.cMin + "개 이상") : prev != null ? prev + "개 이하" : "제한 없음";
            return (
              <tr key={i} className={rowIdx === i ? "qz-me" : ""} aria-current={rowIdx === i ? "true" : undefined}>
                <td>{r.F}급</td><td>{range}</td><td className="mono">{r.score}점</td><td className="mono">{r.band}</td>
              </tr>
            );
          })}
          <tr className={incomplete ? "qz-me" : ""} aria-current={incomplete ? "true" : undefined}>
            <td>급 무관</td><td>응답 {MIN_ANSWERED}문항 미만</td><td className="mono">2점</td><td className="mono">E</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* 경고 화면(§7.3). demo 면 연습용이라 아무것도 기록하지 않는다 */
function WarnCover({ n, limit, ev, demo, onBack }) {
  const btn = useRef(null);
  useEffect(() => { if (btn.current) btn.current.focus(); }, []);
  /* 잠금 뒤에도 경고 수는 이어지므로(§7.3: 3·6·9회에 잠김) 다음 잠금까지 남은 횟수는 한도로 나눈 나머지로 센다 */
  const lim = Math.max(1, Number(limit) || 3);
  const nn = Number(n) || 0;
  const left = Math.max(0, lim - (nn % lim));
  /* 머리글은 이번 주기 안의 자리(1~한도)로 보이고, 잠금 뒤에는 누적 횟수를 덧붙인다(「경고 4 / 3」이 되지 않게) */
  const pos = nn > 0 ? ((nn - 1) % lim) + 1 : 0;
  return (
    <div className="qz-cover" role="alertdialog" aria-modal="true" aria-labelledby="qz-warn-h">
      <div className="qz-cover-in">
        <div className="qz-cover-k">{demo ? "경고 화면 체험" : nn > lim ? "경고 " + pos + " / " + lim + " (누적 " + nn + "회)" : "경고 " + nn + " / " + lim}</div>
        <h2 id="qz-warn-h" className="qz-cover-h">{warnText(ev)}</h2>
        {demo
          ? <p>본시험에서 다른 창으로 나가거나 전체화면을 벗어나면 이 화면이 나타나고 기록됩니다. 「돌아가기」를 누르면 시험 화면으로 돌아갑니다. 지금은 연습이라 아무것도 기록되지 않습니다.</p>
          : left === 1
            ? <p><b>한 번 더 기록되면 시험이 잠깁니다.</b> 잠기면 선생님이 풀어 줄 때까지 기다려야 합니다.</p>
            : left > 1 ? <p>앞으로 {left}번 더 기록되면 시험이 잠깁니다.</p> : null}
        {!demo && <p className="hint">남은 시간은 계속 줄어듭니다. 기록은 점수를 깎지 않으며, 시험이 끝난 뒤 자기 기록을 볼 수 있습니다.</p>}
        <button type="button" ref={btn} className="btn qz-big" onClick={onBack}>돌아가기</button>
      </div>
    </div>
  );
}

/* 보기 4개: role=radiogroup / role=radio 버튼. 방향키로 초점과 선택을 함께 옮기고 Space·Enter 는 버튼이 스스로 처리한다.
   고른 보기는 색과 함께 굵은 테두리·「선택됨」 글자로 표시한다(색만으로 구분하지 않는다) */
function OptionGroup({ options, pick, onPick, labelledBy, disabled }) {
  const box = useRef(null);
  const onKey = (e) => {
    const keys = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1, Home: "first", End: "last" };
    const mv = keys[e.key];
    if (mv == null || !box.current) return;
    const btns = Array.from(box.current.querySelectorAll("button[role=radio]"));
    if (!btns.length) return;
    const i = btns.indexOf(document.activeElement);
    const j = mv === "first" ? 0 : mv === "last" ? btns.length - 1 : ((i < 0 ? 0 : i) + mv + btns.length) % btns.length;
    e.preventDefault();
    btns[j].focus();
    if (!disabled) onPick(options[j].id);
  };
  const focusIdx = Math.max(0, options.findIndex((o) => o.id === pick));
  return (
    <div className="qz-opts" role="radiogroup" aria-labelledby={labelledBy} ref={box} onKeyDown={onKey}>
      {options.map((o, j) => {
        const on = pick === o.id;
        return (
          <button type="button" key={o.id} role="radio" aria-checked={on} tabIndex={j === focusIdx ? 0 : -1} disabled={disabled}
            className={"qz-opt" + (on ? " on" : "")} onClick={() => onPick(o.id)}>
            <span className="qz-opt-k" aria-hidden="true">{OPT_MARK[j] || j + 1}</span>
            <span className="qz-opt-t">{o.text}</span>
            {on && <span className="qz-opt-sel">선택됨</span>}
          </button>
        );
      })}
    </div>
  );
}

/* 도판: 차시 도판을 그대로 쓴다. 못 읽으면 대체 텍스트를 글로 보인다(§5.6) */
function ItemImage({ image }) {
  const [bad, setBad] = useState(false);
  if (!image || !image.src) return null;
  if (bad) return <div className="qz-img-alt" role="img" aria-label={image.alt || "도판"}>[도판을 불러오지 못했습니다] {image.alt || ""}</div>;
  return <figure className="qz-fig"><img src={image.src} alt={image.alt || ""} draggable={false} onError={() => setBad(true)} /></figure>;
}

/* 시험 문항 하나. 보기 순서는 optionOrder(seed, 문항)로 학생마다 다르고 재접속해도 같다 */
function ItemCard({ it, idx, seed, pick, onPick, missing, disabled }) {
  const hid = "qz-q-" + idx;
  if (missing) {
    return (
      <section className="qz-item" aria-labelledby={hid}>
        <div className="qz-item-n">문항 {idx + 1}</div>
        <h3 id={hid} className="qz-stem">이 문항을 은행에서 찾을 수 없습니다. 선생님께 알려 주세요.</h3>
      </section>
    );
  }
  const byId = new Map((it.options || []).map((o) => [o.id, o]));
  const opts = optionOrder(seed, it).map((oid) => byId.get(oid) || { id: oid, text: "" });
  return (
    <section className="qz-item" aria-labelledby={hid}>
      <div className="qz-item-n">문항 {idx + 1}{it.neg && <span className="qz-negtag">부정 문두</span>}{it.image && <span className="qz-negtag">도판</span>}</div>
      <h3 id={hid} className="qz-stem"><Stem text={it.stem} neg={it.neg} /></h3>
      <ItemImage image={it.image} />
      <OptionGroup options={opts} pick={pick} onPick={onPick} labelledBy={hid} disabled={disabled} />
    </section>
  );
}

/* ============================================================
   연습 2문항 — 채점 즉시 표시, 시간 없음, 기록 없음(§3.3)
   ============================================================ */
function PracticeCard({ items, onDemo }) {
  const [picks, setPicks] = useState({});
  const list = Array.isArray(items) ? items.slice(0, 2) : [];
  return (
    <div className="card qz-card">
      <div className="card-head"><span className="card-code">연습</span><span className="card-title">연습 문항 2개와 경고 화면 체험</span></div>
      <div className="card-body">
        <p className="hint" style={{ marginBottom: 12 }}>연습은 점수에 들어가지 않고 아무것도 기록되지 않습니다. 고르면 바로 정답과 해설이 보입니다.</p>
        {list.length === 0 && <div className="warn-note">연습 문항이 아직 없습니다. 선생님이 은행을 올리면 나타납니다.</div>}
        {list.map((p, i) => {
          const hid = "qz-p-" + i;
          const pick = picks[p.id];
          const ans = (p.options || []).find((o) => o.id === p.answer);
          const ansIdx = (p.options || []).findIndex((o) => o.id === p.answer);
          return (
            <section className="qz-item qz-practice" key={p.id} aria-labelledby={hid}>
              <div className="qz-item-n">연습 {i + 1}</div>
              <h3 id={hid} className="qz-stem"><Stem text={p.stem} neg={p.neg} /></h3>
              <OptionGroup options={p.options || []} pick={pick} onPick={(id) => setPicks((m) => ({ ...m, [p.id]: id }))} labelledBy={hid} />
              {isPick(pick) && (
                <div className={pick === p.answer ? "ok-note" : "warn-note"} role="status" style={{ marginTop: 10, marginBottom: 0 }}>
                  {pick === p.answer ? "정답입니다." : "정답은 " + (OPT_MARK[ansIdx] || "") + " 「" + ((ans && ans.text) || "") + "」입니다."}
                  {p.expl ? " " + p.expl : ""}
                </div>
              )}
            </section>
          );
        })}
        <div className="qz-tools">
          <button type="button" className="btn ghost" onClick={onDemo}>화면 이탈 경고 체험</button>
          <span className="hint">본시험에서 다른 창으로 나가면 나타나는 화면을 미리 봅니다. 놀라서 창을 닫지 않도록 한 번 보아 두세요.</span>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   시험 본체 — 앱 전체를 덮는 화면. 심장박동·타이머·잠금·블록 제출을 모두 여기서 한다
   init: { v, startedAtMs, offset, sess, prepUntil } (QuizTab 이 서버와 맞춘 뒤 넘긴다)
   live: quizWatch 스냅샷 { v, startedAtMs, hbMs, lockedAtMs } (교사 필드·해제·초기화를 본다)
   ============================================================ */
function ExamSession({ sid, cfg, bank, init, live, font, setFont, onDone }) {
  const v0 = init.v || {};
  const itemMap = useMemo(() => itemMapOf(bank), [bank]);
  const seed = v0.seed;
  const limit = Math.max(1, Number(cfg.warnLimit) || 3);

  const [cur, setCur] = useState(Number(v0.cur) || 1);
  const [served, setServed] = useState(v0.served || {});
  const [blocks, setBlocks] = useState(v0.blocks || {});
  const [draft, setDraft] = useState(v0.draft || {});
  const [pickMs, setPickMs] = useState(v0.pickMs || {});   // draft 와 함께 저장하므로 재접속해도 선택 시각이 남는다
  const [warn, setWarn] = useState(Number(v0.warn) || 0);
  const [status, setStatus] = useState(v0.status === "locked" ? "locked" : "running");
  const [overlay, setOverlay] = useState(null);      // { kind: "warn", ev, n } | { kind: "resume", text }
  const [yielded, setYielded] = useState(null);      // "dup" | "reset" — 다른 세션이 응시 중이거나 교사가 세션을 초기화함
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [submitErr, setSubmitErr] = useState("");
  const [confirmBlank, setConfirmBlank] = useState(false);
  const [alertText, setAlertText] = useState("");
  const [offline, setOffline] = useState(() => typeof navigator !== "undefined" && navigator.onLine === false);

  /* 최신 값을 타이머·리스너에서 읽기 위한 참조들 */
  const stRef = useRef({});
  stRef.current = { cur, served, blocks, draft, pickMs };
  const statusRef = useRef(status); statusRef.current = status;
  const yieldRef = useRef(false);
  const doneRef = useRef(false);
  const busyRef = useRef(false);
  const offsetRef = useRef(Number.isFinite(init.offset) ? init.offset : 0);
  const startedAtRef = useRef(Number.isFinite(init.startedAtMs) ? init.startedAtMs : Date.now());
  const sessRef = useRef(init.sess);
  const prepRef = useRef(init.prepUntil || 0);
  const warnRef = useRef(Number(v0.warn) || 0);
  const lockCountRef = useRef((v0.lock && Number(v0.lock.count)) || 0);
  const lockAtRef = useRef(v0.lock && v0.lock.at ? Date.parse(v0.lock.at) : NaN);
  const evCountRef = useRef(Array.isArray(v0.events) ? v0.events.length : 0);
  const lastItemRef = useRef(0);
  const queueRef = useRef([]);
  const flushingRef = useRef(false);
  const pendingRef = useRef(null);
  const retryRef = useRef(0);
  const retryTimer = useRef(null);
  const autoRef = useRef(false);
  const timeUpRef = useRef(0);          // 시간이 끝난 서버 시각(유예 계산용)
  const draftTimer = useRef(null);
  const draftBuf = useRef({});
  const pickBuf = useRef({});
  const alerted = useRef(null);
  const rootRef = useRef(null);

  const serverNow = () => Date.now() + offsetRef.current;
  const iso = () => new Date(serverNow()).toISOString();
  /* 블록이 열린 시각. 블록 1의 served.at 은 서버 시각을 알기 전에 적은 로컬 시각이므로 startedAt(서버)을 쓴다.
     그 뒤 블록의 at 은 서버 보정 시각이다(pickMs·blockMs 의 기준) */
  const blockStartMs = (k, s) => (k === 1 && Number.isFinite(startedAtRef.current) ? startedAtRef.current : s && s.at ? Date.parse(s.at) : NaN);
  const lv = (live && live.v) || {};
  const startedAtMs = live && Number.isFinite(live.startedAtMs) ? live.startedAtMs : startedAtRef.current;

  /* ---- 남은 시간: 잠금 중에는 잠긴 시각, 전체 정지 중에는 정지 시각에 고정한다 ---- */
  const paused = !!cfg.paused && status === "running";
  const lockedMs = live && Number.isFinite(live.lockedAtMs) ? live.lockedAtMs : lockAtRef.current;
  const frozenAt = status === "locked" ? (Number.isFinite(lockedMs) ? lockedMs : now + offsetRef.current)
    : paused && cfg.pausedAtMs ? cfg.pausedAtMs : null;
  const nowMs = frozenAt != null ? frozenAt : now + offsetRef.current;
  const remain = remainingSec({ nowMs, startedAtMs, cfg, v: { sid, timeMult: v0.timeMult, pausedTotalSec: lv.pausedTotalSec, extraSec: lv.extraSec }, sid });
  const mult = (cfg.timeMult && Number(cfg.timeMult[sid]) > 0 ? Number(cfg.timeMult[sid]) : Number(v0.timeMult) > 0 ? Number(v0.timeMult) : 1);
  const recRemain = Math.max(0, ((Number(cfg.durationSec) || 2400) - (BLOCK_END_MIN[cur - 1] || 35) * 60) * mult);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const on = () => setOffline(false), off = () => setOffline(true);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  useEffect(() => () => { exitFs(); if (retryTimer.current) clearTimeout(retryTimer.current); if (draftTimer.current) clearTimeout(draftTimer.current); }, []);
  /* 시험 중에는 앱의 상단 표시줄·차시 탭을 숨긴다(body 클래스 + QuizStyle 의 CSS): Tab 키로 초점이 시험 화면 밖으로 나가 Enter 로 탭이 바뀌는 일을 막는다.
     초점이 어떤 이유로든 밖에 있으면 시험 화면 안으로 되돌린다 */
  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    document.body.classList.add("qz-exam-on");
    const onFocusIn = (e) => {
      const root = rootRef.current;
      if (!root || root.contains(e.target)) return;
      const first = root.querySelector("button:not([disabled]), [tabindex]:not([tabindex='-1'])");
      if (first) first.focus();
    };
    document.addEventListener("focusin", onFocusIn);
    return () => { document.body.classList.remove("qz-exam-on"); document.removeEventListener("focusin", onFocusIn); };
  }, []);

  /* ---- 이벤트 큐: 한 번에 하나씩 quizPatch(arrayUnion 은 패치당 하나). 실패하면 남겨 두었다가 다음 심장박동에 다시 보낸다 ---- */
  const flushQueue = async () => {
    if (flushingRef.current) return;
    flushingRef.current = true;
    try {
      while (queueRef.current.length) {
        const it = queueRef.current[0];
        if (it.opts && it.opts.lock && it.tried) {
          /* 잠금 패치를 다시 보낼 때: 첫 전송이 실제로 들어갔으면 lockedAt 을 다시 찍지 않는다(교사 보전 시간이 줄어든다) */
          const r = await fbStore.quizReadServer(sid);
          if (r && r.ok && r.data && Number.isFinite(r.data.lockedAtMs)) it.opts = {};
        }
        it.tried = true;
        const ok = await fbStore.quizPatch(sid, it.vPatch, it.opts);
        if (!ok) break;
        queueRef.current.shift();
      }
    } finally { flushingRef.current = false; }
  };
  const enqueue = (vPatch, opts) => { queueRef.current.push({ vPatch, opts }); flushQueue(); };

  /* ---- 심장박동: hb 를 쓰고 되읽어 서버 시각을 다시 맞춘다. sess 가 바뀌었으면 이 세션은 물러난다 ---- */
  useEffect(() => {
    if (status === "done") return undefined;
    let n = 0;
    const beat = async () => {
      if (doneRef.current || yieldRef.current) return;
      await flushQueue();
      const ok = await fbStore.quizPatch(sid, {});
      if (!ok) return;
      n += 1;
      if (n % HB_SYNC_EVERY !== 0) return;   // 되읽기는 격박동으로(읽기 한도 절약). 중복 접속 판정도 그때 한다
      const r = await fbStore.quizReadServer(sid);
      if (!r || !r.ok || !r.data) return;
      if (Number.isFinite(r.data.hbMs)) offsetRef.current = r.data.hbMs - Date.now();
      if (Number.isFinite(r.data.startedAtMs)) startedAtRef.current = r.data.startedAtMs;
      const s = r.data.v ? r.data.v.sess : null;
      if (s !== sessRef.current && !doneRef.current) { yieldRef.current = true; setYielded(s == null ? "reset" : "dup"); exitFs(); }
    };
    const id = setInterval(beat, HB_SEC * 1000);
    return () => clearInterval(id);
  }, [status, sid]); // eslint-disable-line

  /* ---- 잠금 훅 ---- */
  const suspended = !!overlay || paused || status !== "running" || !!yielded;
  const onEvent = (ev, warnIt) => {
    if (statusRef.current !== "running" || doneRef.current || yieldRef.current) return;
    let w = warnRef.current;
    if (warnIt) w += 1;
    const full = { t: iso(), ...ev, block: stRef.current.cur, item: lastItemRef.current || null, warn: w };
    const canLog = evCountRef.current < MAX_EVENTS;
    if (canLog) evCountRef.current += 1;
    if (warnIt) { warnRef.current = w; setWarn(w); }
    if (warnIt && w % limit === 0) {
      /* 잠금(§7.3: 경고가 한도의 배수에 이를 때, 즉 3·6·9회): 경고 이벤트와 잠금 이벤트를 차례로 쓴다. 타이머는 lockedAt(서버 시각)에 멈춘다 */
      const count = lockCountRef.current + 1;
      lockCountRef.current = count;
      lockAtRef.current = serverNow();
      const lockEv = { t: iso(), type: "lock", block: stRef.current.cur, item: lastItemRef.current || null, warn: w };
      const canLog2 = evCountRef.current < MAX_EVENTS;
      if (canLog2) evCountRef.current += 1;
      statusRef.current = "locked"; setStatus("locked"); setOverlay(null); setConfirmBlank(false);
      if (canLog) enqueue({ warn: w, events: fbStore.quizEvent(full) });
      const lockPatch = { status: "locked", warn: w, lock: { count, at: lockEv.t } };
      if (canLog2) lockPatch.events = fbStore.quizEvent(lockEv);
      enqueue(lockPatch, { lock: true });
      return;
    }
    if (canLog) enqueue(warnIt ? { warn: w, events: fbStore.quizEvent(full) } : { events: fbStore.quizEvent(full) });
    else if (warnIt) enqueue({ warn: w });
    if (warnIt) setOverlay({ kind: "warn", ev: full, n: w });
  };
  const { fsOut, enterFullscreen } = useLockdown({ active: status !== "done", suspended, prepUntilMs: prepRef.current, onEvent });

  /* ---- 교사 해제: 로컬 잠금 뒤(lock.count 가 내 값과 같아진 뒤) 문서가 running·lockedAt null 로 바뀌면 「계속하기」 ---- */
  useEffect(() => {
    if (status !== "locked" || !live || !live.v) return;
    const cnt = live.v.lock ? Number(live.v.lock.count) || 0 : 0;
    if (live.v.status === "running" && live.lockedAtMs == null && cnt >= lockCountRef.current) {
      statusRef.current = "running"; setStatus("running");
      setOverlay({ kind: "resume", text: "선생님이 잠금을 풀었습니다. 「계속하기」를 누르면 시험 화면으로 돌아갑니다." });
    }
  }, [status, live]);

  /* ---- 남은 시간 알림(10·5·1분)과 시간 종료 자동 제출 ---- */
  useEffect(() => {
    if (status !== "running") return;
    if (!alerted.current) { alerted.current = new Set(TIME_ALERTS.filter((th) => th >= remain)); return; }
    TIME_ALERTS.forEach((th) => {
      if (remain <= th && !alerted.current.has(th)) { alerted.current.add(th); setAlertText("남은 시간이 " + Math.round(th / 60) + "분입니다."); }
    });
  }, [remain, status]);
  useEffect(() => {
    if (status !== "running" || paused || yielded || doneRef.current || remain > 0) return;
    if (!timeUpRef.current) timeUpRef.current = serverNow() + remain * 1000;   // 남은 시간이 0이 된 서버 시각(재접속으로 늦게 알았어도 실제 시각)
    setConfirmBlank(false);
    /* 손으로 누른 제출이 아직 저장되지 않았으면 그것을 자동 재시도로 돌린다(같은 객체를 그대로 보낸다).
       그 제출이 다음 블록을 열면 autoRef 가 풀려 새 블록이 빈 채로 자동 제출된다 */
    const p = pendingRef.current;
    if (p) {
      if (!p.auto) { p.auto = true; if (!busyRef.current && !retryTimer.current) retryTimer.current = setTimeout(sendPending, SUBMIT_RETRY_MS); }
      return;
    }
    if (autoRef.current) return;
    autoRef.current = true;
    submitBlock(true);
  }, [remain, status, paused, yielded, busy]); // eslint-disable-line

  /* ---- 답 선택: 화면에 바로 반영하고 300ms 뒤 draft 에 모아 저장한다(실패해도 화면의 답은 남는다) ---- */
  const onPick = (itemId, idx, optId) => {
    if (statusRef.current !== "running" || busyRef.current || pendingRef.current) return;
    const k = stRef.current.cur;
    const t0 = blockStartMs(k, stRef.current.served[String(k)]);
    lastItemRef.current = idx + 1;
    setDraft((d) => ({ ...d, [itemId]: optId }));
    setPickMs((m) => ({ ...m, [itemId]: Number.isFinite(t0) ? Math.max(0, serverNow() - t0) : null }));
    draftBuf.current[itemId] = optId;
    pickBuf.current[itemId] = Number.isFinite(t0) ? Math.max(0, serverNow() - t0) : null;
    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      draftTimer.current = null;
      const d = draftBuf.current; draftBuf.current = {};
      const pm = pickBuf.current; pickBuf.current = {};
      if (Object.keys(d).length) fbStore.quizPatch(sid, { draft: d, pickMs: pm });   // 재접속해도 선택 시각이 남도록 함께 저장
    }, DRAFT_MS);
  };

  /* ---- 블록 제출: blocks[k] + served[k+1] + cur 를 한 번에. 마지막 블록·자동 제출은 마무리 필드까지 함께 ---- */
  const buildBlock = (k, auto) => {
    const { served: sv, draft: dr, pickMs: pm } = stRef.current;
    const s = sv[String(k)] || {};
    const ids = (s.itemIds || []).map(String);
    const answers = ids.map((id) => (isPick(dr[id]) ? dr[id] : null));
    const t0 = blockStartMs(k, s);
    let correct = 0;
    ids.forEach((id, i) => { if (isCorrect(itemMap.get(id), answers[i], bank.seedSalt)) correct += 1; });
    return {
      level: Number.isInteger(s.level) ? s.level : START_LEVEL, itemIds: ids, answers, at: iso(), auto: !!auto,
      blockMs: Number.isFinite(t0) ? Math.max(0, serverNow() - t0) : null, pickMs: ids.map((id) => (Number.isFinite(pm[id]) ? pm[id] : null)), correct,
    };
  };
  const submitBlock = async (auto) => {
    if (busyRef.current || doneRef.current || pendingRef.current) return;
    const k = stRef.current.cur;
    const s = stRef.current.served[String(k)];
    if (!s) return;
    const block = buildBlock(k, auto);
    const all = { ...stRef.current.blocks, [String(k)]: block };
    const patch = { blocks: { [String(k)]: block } };
    const last = !!auto || k >= BLOCKS;
    if (last) {
      patch.status = "done"; patch.finishedAt = iso(); patch.cur = k;
      patch.clientScore = clientScoreOf({ blocks: all, bank });
    } else {
      const level = routeNext(block.level, block.correct);
      const d = drawBlock({ bank, half: v0.half, seed, level, used: usedOf(stRef.current.served), disabled: cfg.disabled || [], noImage: !!v0.noImage, k: k + 1 });
      patch.served = { [String(k + 1)]: { level, itemIds: d.itemIds, at: iso(), ...(d.crossHalf ? { crossHalf: true } : {}) } };
      patch.cur = k + 1;
    }
    pendingRef.current = { patch, block, last, k, auto: !!auto };
    retryRef.current = 0;
    await sendPending();
  };
  /* 실패 뒤 재전송은 같은 객체를 그대로 보낸다(served 의 at 이 달라지면 규칙 quizServedKept 에 걸린다).
     시간 초과로 돌아왔지만 실제로는 서버에 들어간 경우가 있으므로, 실패하면 서버를 되읽어 blocks[k] 가 있으면 성공으로 본다 */
  const sendPending = async () => {
    if (retryTimer.current) { clearTimeout(retryTimer.current); retryTimer.current = null; }
    const p = pendingRef.current;
    if (!p || busyRef.current || doneRef.current) return;
    busyRef.current = true; setBusy(true); setSubmitErr("");
    let ok = await fbStore.quizPatch(sid, p.patch);
    if (!ok) {
      const r = await fbStore.quizReadServer(sid);
      if (r && r.ok && r.data && r.data.v && r.data.v.blocks && r.data.v.blocks[String(p.k)]) ok = true;
      else if (r && r.ok && r.data && r.data.v && p.reduced && (r.data.v.status === "done" || r.data.v.finishedAt)) ok = true;
    }
    busyRef.current = false; setBusy(false);
    if (!ok) {
      if (p.auto) {
        retryRef.current += 1;
        const pastGrace = !!timeUpRef.current && serverNow() - timeUpRef.current > GRACE_MS;
        if (retryRef.current >= SUBMIT_RETRY_N && pastGrace && !p.reduced) {
          /* 유예(60초)가 지나 규칙이 블록 쓰기를 더는 받지 않는다 — 마무리 필드만 써서 완료로 닫는다. 이 블록의 답은 저장되지 않는다.
             유예 안에서는 연결 문제일 수 있으므로 같은 블록 패치를 계속 다시 보낸다 */
          p.reduced = true; p.last = true;
          p.patch = { status: "done", finishedAt: iso(), cur: p.k, clientScore: clientScoreOf({ blocks: stRef.current.blocks, bank }) };
        }
        setSubmitErr(p.reduced ? "시간이 끝나 마지막 블록이 저장되지 않았습니다. 완료 처리를 다시 시도합니다. 선생님께 알려 주세요." : "시간이 끝나 자동 제출했지만 저장되지 않았습니다. 연결을 확인해 주세요. 잠시 뒤 다시 시도합니다.");
        retryTimer.current = setTimeout(sendPending, SUBMIT_RETRY_MS * (p.reduced ? 2 : 1));
      } else {
        setSubmitErr("제출을 저장하지 못했습니다. 답은 이 화면에 남아 있으니 연결을 확인하고 「다시 제출」을 눌러 주세요. 시간이 끝난 뒤의 제출은 저장되지 않을 수 있습니다.");
      }
      return;
    }
    pendingRef.current = null;
    let landed = !p.reduced;
    if (p.reduced) {
      /* 마무리만 써서 닫았지만, 앞선 블록 전송이 시간 초과 뒤에 늦게 들어갔을 수 있다: 서버에 blocks[k] 가 있으면 저장된 것이다 */
      const r = await fbStore.quizReadServer(sid);
      if (r && r.ok && r.data && r.data.v && r.data.v.blocks && r.data.v.blocks[String(p.k)]) landed = true;
    }
    if (landed) setBlocks((b) => ({ ...b, [String(p.k)]: p.block }));
    if (p.last) {
      /* 완료: 전체화면을 풀고 「제출되었습니다」 화면을 보인다. 「닫기」가 onDone 을 부른다 */
      doneRef.current = true; statusRef.current = "done"; setStatus("done");
      if (p.reduced && !landed) setSubmitErr("마지막 블록의 답은 시간 안에 저장되지 않아 응시 기록에 들어가지 않았습니다. 선생님께 알려 주세요.");
      else setSubmitErr("");
      exitFs();
      return;
    }
    setServed((s) => ({ ...s, ...p.patch.served }));
    setCur(p.k + 1);
    lastItemRef.current = 0;
    autoRef.current = false;
    setConfirmBlank(false);
    if (rootRef.current) rootRef.current.scrollTop = 0;
  };
  const onSubmitClick = () => {
    if (busy || pendingRef.current || statusRef.current !== "running") return;
    if (offline) { setSubmitErr("연결을 확인해 주세요. 인터넷이 이어지면 제출할 수 있습니다."); return; }
    const s = served[String(cur)] || {};
    const blank = (s.itemIds || []).filter((id) => !isPick(draft[String(id)])).length;
    if (blank > 0 && !confirmBlank) { setConfirmBlank(true); return; }
    setConfirmBlank(false);
    submitBlock(false);
  };

  /* ---- 물러난 세션의 복귀: 교사가 세션을 초기화하면(sess null) 이 자리에서 다시 잡고 이어 푼다 ---- */
  const pastGrace = timeUpRef.current ? serverNow() - timeUpRef.current > GRACE_MS : remain * 1000 <= -GRACE_MS;
  /* 시간과 유예가 모두 지난 뒤에는 진행 필드(sess·served)를 쓸 수 없다(규칙): 마무리 필드만 써서 닫는다 */
  const finishLate = async () => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true);
    const ok = await fbStore.quizPatch(sid, { status: "done", finishedAt: iso(), cur: stRef.current.cur, clientScore: clientScoreOf({ blocks: stRef.current.blocks, bank }) });
    busyRef.current = false; setBusy(false);
    if (!ok) { setSubmitErr("완료 처리를 저장하지 못했습니다. 연결을 확인하고 한 번 더 눌러 주세요."); return; }
    yieldRef.current = false; setYielded(null);
    doneRef.current = true; statusRef.current = "done"; setStatus("done");
    setSubmitErr("시간이 끝나 제출 처리되었습니다. 마지막 블록의 답은 시간 안에 저장되지 않았습니다. 선생님께 알려 주세요.");
    exitFs();
  };
  const reclaim = async () => {
    if (busyRef.current) return;
    if (pastGrace) { await finishLate(); return; }
    busyRef.current = true; setBusy(true);
    const fsOk = await enterFullscreen();
    if (!fsOk) { busyRef.current = false; setBusy(false); setSubmitErr("브라우저가 전체화면을 막았습니다. 선생님께 알려 주세요."); return; }
    const ev = { t: iso(), type: "reconnect", block: stRef.current.cur, item: null, warn: warnRef.current };
    const patch = { sess: sessRef.current };
    if (evCountRef.current < MAX_EVENTS) { patch.events = fbStore.quizEvent(ev); evCountRef.current += 1; }
    const ok = await fbStore.quizPatch(sid, patch);
    busyRef.current = false; setBusy(false);
    if (!ok) { exitFs(); setSubmitErr("다시 잇지 못했습니다. 연결을 확인하고 한 번 더 눌러 주세요."); return; }
    prepRef.current = Date.now() + PREP_MS;
    yieldRef.current = false; setYielded(null); setSubmitErr("");
  };
  const backFromOverlay = async () => {
    setOverlay(null);
    if (!fsEl()) await enterFullscreen();
  };
  const changeFont = (px) => { setFont(px); };

  /* ---- 그리기 ---- */
  const s = served[String(cur)] || {};
  const ids = (s.itemIds || []).map(String);
  const answered = ids.filter((id) => isPick(draft[id])).length;
  const blank = ids.length - answered;
  const late = status === "running" && remain < recRemain;
  const fsCover = fsOut && !overlay && !paused && status === "running" && !yielded;

  let cover = null;
  if (yielded) {
    const canBack = yielded === "reset" || lv.sess == null;
    cover = (
      <div className="qz-cover" role="alertdialog" aria-modal="true" aria-labelledby="qz-y-h">
        <div className="qz-cover-in">
          <div className="qz-cover-k">{yielded === "dup" ? "중복 접속" : "세션 초기화"}</div>
          <h2 id="qz-y-h" className="qz-cover-h">{yielded === "dup" ? "다른 곳에서 응시 중입니다." : "선생님이 이 접속을 초기화했습니다."}</h2>
          <p>{yielded === "dup"
            ? "같은 학번이 다른 브라우저에서 시험을 보고 있어 이 화면은 멈췄습니다. 선생님이 「세션 초기화」를 누르면 여기서 이어 풀 수 있습니다."
            : "「이어서 풀기」를 누르면 이 자리에서 같은 블록을 이어 풉니다. 고른 답은 저장되어 있습니다."}</p>
          {submitErr && <div className="warn-note" role="alert">{submitErr}</div>}
          {pastGrace && <p className="hint">시간이 끝나 이어 풀 수 없습니다. 아래 버튼으로 제출 처리하고 선생님께 알려 주세요.</p>}
          <button type="button" className="btn qz-big" disabled={(!canBack && !pastGrace) || busy} onClick={reclaim}>{busy ? "잇는 중…" : pastGrace ? "제출 처리" : "이어서 풀기"}</button>
        </div>
      </div>
    );
  } else if (status === "locked") {
    cover = (
      <div className="qz-cover" role="alertdialog" aria-modal="true" aria-labelledby="qz-l-h">
        <div className="qz-cover-in">
          <div className="qz-cover-k">잠금 {lockCountRef.current}회 · 경고 {warn}회</div>
          <h2 id="qz-l-h" className="qz-cover-h">시험이 잠겼습니다. 선생님을 불러 주세요.</h2>
          <p>남은 시간은 멈춰 있습니다. 선생님이 풀어 주면 이 자리에서 이어 풉니다. 고른 답은 저장되어 있습니다.</p>
          <p className="hint">남은 시간 {fmtMMSS(Math.max(0, remain))} (정지)</p>
        </div>
      </div>
    );
  } else if (overlay && overlay.kind === "warn") {
    cover = <WarnCover n={overlay.n} limit={limit} ev={overlay.ev} onBack={backFromOverlay} />;
  } else if (overlay && overlay.kind === "resume") {
    cover = (
      <div className="qz-cover" role="alertdialog" aria-modal="true" aria-labelledby="qz-r-h">
        <div className="qz-cover-in">
          <div className="qz-cover-k">잠금 해제</div>
          <h2 id="qz-r-h" className="qz-cover-h">{overlay.text}</h2>
          <button type="button" className="btn qz-big" onClick={backFromOverlay} autoFocus>계속하기</button>
        </div>
      </div>
    );
  } else if (paused) {
    cover = (
      <div className="qz-cover" role="alertdialog" aria-modal="true" aria-labelledby="qz-p-h">
        <div className="qz-cover-in">
          <div className="qz-cover-k">전체 일시정지</div>
          <h2 id="qz-p-h" className="qz-cover-h">선생님이 시험을 잠시 멈췄습니다. 잠시 기다려 주세요.</h2>
          <p>남은 시간은 멈춰 있고, 재개되면 멈춘 시간이 그대로 보전됩니다. 이 화면을 닫지 마세요.</p>
          <p className="hint">남은 시간 {fmtMMSS(Math.max(0, remain))} (정지)</p>
        </div>
      </div>
    );
  } else if (fsCover) {
    cover = (
      <div className="qz-cover" role="alertdialog" aria-modal="true" aria-labelledby="qz-f-h">
        <div className="qz-cover-in">
          <div className="qz-cover-k">전체화면</div>
          <h2 id="qz-f-h" className="qz-cover-h">전체화면을 벗어났습니다.</h2>
          <p>10초 안에 돌아오면 기록만 남고, 넘기면 경고가 됩니다. 남은 시간은 계속 줄어듭니다.</p>
          <button type="button" className="btn qz-big" onClick={() => enterFullscreen()} autoFocus>전체화면으로 돌아가기</button>
        </div>
      </div>
    );
  }

  if (status === "done") {
    return (
      <div className="qz-overlay" ref={rootRef} style={{ "--qz-fs": font + "px" }}>
        <div className="qz-main qz-done">
          <div className="qz-cover-k">제출 완료</div>
          <h2 className="qz-cover-h">제출되었습니다.</h2>
          <p>점수와 급 경로는 선생님이 결과를 공개하면 이 자리에 나타납니다. 고맙습니다.</p>
          {submitErr && <div className="warn-note" role="alert">{submitErr}</div>}
          <button type="button" className="btn" onClick={() => { exitFs(); if (typeof onDone === "function") onDone(); }}>닫기</button>
        </div>
      </div>
    );
  }

  return (
    <div className="qz-overlay" ref={rootRef} style={{ "--qz-fs": font + "px" }} aria-label={cfg.title || "쪽지시험"}>
      <div className="qz-bar">
        <span className="qz-bar-i">블록 <b className="mono">{cur}</b> / {BLOCKS}</span>
        <span className="qz-bar-i">답한 문항 <b className="mono">{answered}</b> / {ids.length || BLOCK_SIZE}</span>
        <span className={"qz-bar-i qz-time" + (remain <= 60 ? " low" : "")}>
          남은 시간 <b className="mono">{fmtMMSS(Math.max(0, remain))}</b>{frozenAt != null ? " (정지)" : ""}
        </span>
        <span className={"qz-bar-i qz-rec" + (late ? " late" : "")}>권장 종료: 남은 시간 {fmtMMSS(recRemain)} 전{late ? " (지났습니다)" : ""}</span>
        <span role="status" aria-live="polite" className="qz-sr">{alertText}</span>
        <span className="qz-font" role="group" aria-label="글자 크기">
          {FONT_STEPS.map((px, i) => (
            <button type="button" key={px} className={"qz-font-b" + (font === px ? " on" : "")} aria-pressed={font === px} onClick={() => changeFont(px)} title={px + "px"}>
              {["작게", "보통", "크게"][i]}
            </button>
          ))}
        </span>
      </div>
      {alertText && <div className="qz-alert" aria-hidden="true">{alertText}</div>}
      {offline && <div className="warn-note qz-off" role="alert">연결을 확인해 주세요. 고른 답은 이 화면에 남아 있고, 인터넷이 이어지면 제출할 수 있습니다.</div>}
      {/* 덮개가 떠 있는 동안 문항 영역은 inert: 초점·클릭이 닿지 않는다 */}
      <main className="qz-main" aria-busy={busy} inert={cover ? true : undefined}>
        <h2 className="qz-blk-h">블록 {cur} / {BLOCKS} <span className="hint">5문항 모두 답한 뒤 「블록 제출」을 누르세요. 제출한 블록으로는 돌아갈 수 없습니다.</span></h2>
        {pendingRef.current && !busy && <div className="warn-note" role="status">제출 중인 답은 바꿀 수 없습니다. 「다시 제출」이 같은 답을 다시 보냅니다.</div>}
        {ids.map((id, i) => (
          <ItemCard key={id} it={itemMap.get(id)} missing={!itemMap.get(id)} idx={i} seed={seed} pick={draft[id]} onPick={(oid) => onPick(id, i, oid)} disabled={busy || !!pendingRef.current} />
        ))}
        <div className="qz-submit">
          {submitErr && (
            <div className="warn-note" role="alert" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <span style={{ flex: 1, minWidth: 200 }}>{submitErr}</span>
              {pendingRef.current && !pendingRef.current.auto && <button type="button" className="btn small" disabled={busy} onClick={sendPending}>{busy ? "저장 중…" : "다시 제출"}</button>}
            </div>
          )}
          {confirmBlank ? (
            <div className="qz-confirm" role="alertdialog" aria-modal="false" aria-labelledby="qz-c-h">
              <div id="qz-c-h" className="qz-confirm-h">빈 문항이 {blank}개 있습니다. 빈 문항은 오답과 같습니다. 제출할까요?</div>
              <div className="qz-tools">
                <button type="button" className="btn ghost" onClick={() => setConfirmBlank(false)} autoFocus>돌아가서 더 풀기</button>
                <button type="button" className="btn" disabled={busy} onClick={onSubmitClick}>{busy ? "제출 중…" : "그대로 제출"}</button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn qz-big" disabled={busy || !!pendingRef.current || offline} onClick={onSubmitClick}>
              {busy ? "제출 중…" : cur >= BLOCKS ? "블록 제출하고 시험 마치기" : "블록 " + cur + " 제출"}
            </button>
          )}
          <p className="hint" style={{ marginTop: 8 }}>답한 문항 {answered} / {ids.length || BLOCK_SIZE}{blank > 0 ? " · 빈 문항 " + blank + "개" : ""}</p>
        </div>
      </main>
      {cover}
    </div>
  );
}

/* ============================================================
   결과 화면 — 교사가 공개한 v.result 를 읽는다(§2.1 시험 후 표시, §6.3 자기 기록)
   ============================================================ */
function ResultView({ v, cfg }) {
  const r = (v && v.result) || {};
  const path = Array.isArray(r.path) ? r.path : [];
  const bc = Array.isArray(r.blockCorrect) ? r.blockCorrect : [];
  const rowIdx = scoreRowIndex(r.F, r.c, r.n);
  const items = Array.isArray(r.items) ? r.items : [];
  const fp = new Set((Array.isArray(v.falsePos) ? v.falsePos : []).map(Number));
  const events = (Array.isArray(v.events) ? v.events : []).map((e, i) => ({ i, ...(e || {}) }));
  const opened = (k) => !!(v.blocks && (v.blocks[String(k + 1)] || v.blocks[k + 1]));
  const moveWord = (k) => {
    if (k >= path.length) return "";
    if (k === path.length - 1) return r.F < path[k] ? "↓ 최종급 " + r.F + "급" : "= 최종급 " + r.F + "급";
    const d = (path[k + 1] || 0) - path[k];
    return d > 0 ? "↑" : d < 0 ? "↓" : "=";
  };
  return (
    <div className="qz-result">
      <div className="card qz-card">
        <div className="card-head"><span className="card-code">결과</span><span className="card-title">{cfg.title || "쪽지시험"} 결과</span><span className="card-sess">{fmtT(r.publishedAt)} 공개</span></div>
        <div className="card-body">
          <div className="qz-res-head">
            <div className="qz-res-score"><b className="mono">{r.score}</b>점 <span className="qz-res-band mono">{r.band}</span></div>
            <dl className="qz-res-dl">
              <dt>최종급</dt><dd>{r.F}급</dd>
              <dt>총 정답</dt><dd>{r.c} / {BLOCKS * BLOCK_SIZE}</dd>
              <dt>응답 문항</dt><dd>{r.n} / {BLOCKS * BLOCK_SIZE}</dd>
            </dl>
          </div>
          {r.n < MIN_ANSWERED && <div className="warn-note">응답 문항이 {MIN_ANSWERED}개 미만이라 「끝까지 응답하지 못함」으로 E 2점입니다. 기술 장애 때문이라면 선생님께 말씀해 주세요.</div>}
          {r.bonus && <div className="ok-note">문항 오류가 확인되어 전원 정답 처리한 결과, 급 이동이 유리해져 최종급에 한 급을 더했습니다(시험 전에 안내한 정정 규칙).</div>}
          <div className="qz-h">급 경로와 블록별 정답 수</div>
          <ol className="qz-path">
            {path.map((L, k) => (
              <li key={k}><span className="qz-path-k">블록 {k + 1}</span><b>{L}급</b> <span className="mono">{opened(k) ? (bc[k] != null ? bc[k] : 0) + "/" + BLOCK_SIZE : "열지 않음(0/" + BLOCK_SIZE + ")"}</span> <span className="qz-path-mv">{moveWord(k)}</span></li>
            ))}
          </ol>
          <p className="hint">4개 이상 맞히면 다음 블록이 한 급 오르고, 3개면 그대로, 2개 이하면 한 급 내려갑니다. 마지막 블록에서 2개 이하면 최종급이 한 급 내려갑니다.</p>
          <div className="qz-h">점수표의 내 행</div>
          <ScoreTable rowIdx={rowIdx} incomplete={rowIdx < 0} />
          <p className="hint">이 검사의 등급 판정에는 ±1등급의 오차가 있을 수 있습니다. 이의는 응시 기록표로 답하며, 선생님께 말씀해 주세요.</p>
        </div>
      </div>

      <div className="card qz-card">
        <div className="card-head"><span className="card-code">문항</span><span className="card-title">문항별 정답과 해설</span><span className="card-sess">{items.length}문항</span></div>
        <div className="card-body">
          {items.length === 0 && <p className="hint">공개된 문항 사본이 없습니다.</p>}
          {items.map((it, i) => (
            <section className={"qz-item qz-res-item " + (it.correct ? "ok" : "bad")} key={it.id + "-" + i}>
              <div className="qz-item-n">블록 {it.k} · 문항 {i + 1} · <span className={it.correct ? "qz-ok" : "qz-bad"}>{it.correct ? "정답" : it.pick == null ? "빈칸(오답)" : "오답"}</span>{it.corrected && <span className="qz-negtag">전원 정답 처리</span>}</div>
              <h3 className="qz-stem qz-stem-s"><Stem text={it.stem} neg={it.neg} /></h3>
              <ItemImage image={it.image} />
              <ol className="qz-res-opts">
                {(it.options || []).map((o, j) => {
                  const mine = it.pick != null && o.id === it.pick, ans = it.answer != null && o.id === it.answer;
                  return (
                    <li key={o.id} className={(ans ? "ans" : "") + (mine ? " mine" : "")}>
                      <span className="qz-opt-k" aria-hidden="true">{OPT_MARK[j] || j + 1}</span>{o.text}
                      {ans && <span className="qz-tag">정답</span>}{mine && <span className="qz-tag">내 답</span>}
                    </li>
                  );
                })}
              </ol>
              {it.expl && <p className="qz-expl">{it.expl}</p>}
            </section>
          ))}
        </div>
      </div>

      <div className="card qz-card">
        <div className="card-head"><span className="card-code">기록</span><span className="card-title">내 화면 이탈 기록</span><span className="card-sess">경고 {r.warnCount != null ? r.warnCount : Number(v.warn) || 0}회 · 잠금 {r.lockCount != null ? r.lockCount : (v.lock && v.lock.count) || 0}회</span></div>
        <div className="card-body">
          <p className="hint" style={{ marginBottom: 10 }}>기록은 점수를 깎지 않습니다. 선생님이 현장에서 확인해 「오탐」으로 표시한 기록은 그대로 남되 그렇게 표시됩니다.</p>
          {events.length === 0 ? <div className="ok-note">이탈 기록이 없습니다.</div> : (
            <div className="tbl-scroll">
              <table className="qz-score" aria-label="이탈 기록">
                <thead><tr><th>#</th><th>시각</th><th>종류</th><th>지속</th><th>블록</th><th>비고</th></tr></thead>
                <tbody>
                  {events.map((e) => (
                    <tr key={e.i} className={fp.has(e.i) ? "qz-fp" : ""}>
                      <td className="mono">{e.i + 1}</td><td className="mono">{fmtHMS(e.t)}</td><td>{eventLabel(e.type)}{e.mlb ? " (마우스 이탈 뒤)" : ""}{e.cover ? " (안내 화면 중)" : ""}</td>
                      <td className="mono">{e.ms != null ? secOf(e.ms) : "-"}</td><td className="mono">{e.block != null ? e.block : "-"}</td>
                      <td>{[e.prep ? "준비 구간" : "", e.key || e.action || "", fp.has(e.i) ? "오탐(선생님 확인)" : ""].filter(Boolean).join(" · ") || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   탭 본체 — 구독·단계 결정·시작/이어 풀기
   ============================================================ */
export function QuizTab({ me, cfgAll, sampleMode }) {
  const sid = me && me.sid ? String(me.sid) : "";
  const sample = useMemo(() => (sampleMode && sid ? buildSampleQuiz([sid]) : null), [sampleMode, sid]);
  /* 표본(미리 보기)은 표본 설정을 쓰고 단계가 닫혀 있어도 그린다. 실제 화면은 닫힘이면 아무것도 그리지 않는다 */
  const cfg = sampleMode && sample ? quizCfg({ quiz: sample.cfg }) : quizCfg(cfgAll);
  const stage = cfg.stage;
  const closed = !sampleMode && stage === "closed";

  const [live, setLive] = useState(null);
  const [got, setGot] = useState(false);
  const [bankLive, setBankLive] = useState(null);
  const [bankGot, setBankGot] = useState(false);   // 은행 문서 응답을 한 번이라도 받았는가(없음과 로딩 중을 가른다)
  const [slow, setSlow] = useState(false);
  const [session, setSession] = useState(null);   // { v, startedAtMs, offset, sess, prepUntil }
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [demo, setDemo] = useState(false);
  const [dup, setDup] = useState(false);
  const [showSampleRes, setShowSampleRes] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [font, setFontState] = useState(() => { try { const n = Number(sessionStorage.getItem("qz-font")); return FONT_STEPS.includes(n) ? n : FONT_STEPS[1]; } catch (e) { return FONT_STEPS[1]; } });
  const setFont = (px) => { setFontState(px); try { sessionStorage.setItem("qz-font", String(px)); } catch (e) {} };

  /* 응시 문서 구독. 은행은 stage 가 closed 가 아닐 때만 읽을 수 있으므로(규칙) 그때 구독한다 */
  useEffect(() => {
    if (!sid || sampleMode || closed) return undefined;
    const u = fbStore.quizWatch(sid, (d) => { setLive(d || null); setGot(true); });
    const t = setTimeout(() => setSlow(true), 8000);
    return () => { u(); clearTimeout(t); };
  }, [sid, sampleMode, closed]);
  useEffect(() => {
    if (!sid || sampleMode || closed) return undefined;
    const u = fbStore.watchDoc("quizBank", (v) => { setBankLive(v && typeof v === "object" ? v : null); setBankGot(true); });
    return () => u();
  }, [sid, sampleMode, closed]);
  useEffect(() => {
    if (session || closed) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [session, closed]);

  const bank = sampleMode ? (sample && sample.bank) || null : bankLive;
  const bankOk = bankReady(bank, cfg);
  const lv = live && live.v ? live.v : null;
  const deadlineMs = (Number(cfg.openedAtMs) || 0) + (Number(cfg.startDeadlineSec) || 900) * 1000;
  const canStart = stage === "open" && now < deadlineMs;

  /* ---- 시작·이어 풀기: 전체화면 → 서버 문서 확인 → (새로 만들기 | 중복 접속 판정 → 세션 잡기) → 시험 화면 ---- */
  const openSession = async (fresh) => {
    if (busy || sampleMode) return;
    setBusy(true); setErr("");
    const fsOk = await enterFs();
    if (!fsOk) { setBusy(false); setErr("브라우저가 전체화면을 막았습니다. 선생님께 알려 주세요."); return; }
    try {
      const sess = sessOf(sid);
      const a = await fbStore.quizReadServer(sid);
      if (!a || !a.ok) throw new Error("서버에서 응시 기록을 확인하지 못했습니다. 연결을 확인하고 다시 눌러 주세요.");
      let v, startedAtMs, offset;
      if (!a.data) {
        if (!fresh || !bankOk) throw new Error("응시 기록이 없습니다. 「시험 시작」으로 시작해 주세요.");
        if (!canStart) throw new Error("시작 마감이 지나 새로 시작할 수 없습니다. 선생님께 알려 주세요.");
        const half = halfOf(sid, cfg).half;
        const seed = deriveSeed(sid, bank.seedSalt);
        const noImage = !!(cfg.noImage && cfg.noImage[sid]);
        const tm = cfg.timeMult && Number(cfg.timeMult[sid]) > 0 ? Number(cfg.timeMult[sid]) : 1;
        const d = drawBlock({ bank, half, seed, level: START_LEVEL, used: [], disabled: cfg.disabled || [], noImage, k: 1 });
        const at = new Date().toISOString();
        v = {
          ver: QUIZ_VER, sid, half, seed, bankVer: bank.ver || "", timeMult: tm, noImage, sess, status: "running", cur: 1,
          served: { "1": { level: START_LEVEL, itemIds: d.itemIds, at, ...(d.crossHalf ? { crossHalf: true } : {}) } },
          draft: {}, blocks: {}, events: [], warn: 0, lock: { count: 0, at: null }, finishedAt: null, clientScore: null, client: clientInfo(),
        };
        const ok = await fbStore.quizStart(sid, v);
        if (!ok) {
          /* 시간 초과로 false 가 왔지만 실제로 만들어졌을 수 있다: 서버를 되읽어 있으면 이어 풀기로 넘긴다 */
          const chk = await fbStore.quizReadServer(sid);
          if (!(chk && chk.ok && chk.data)) throw new Error("시작하지 못했습니다. 시작 마감이 지났거나 연결이 끊겼습니다. 다시 눌러 보고, 계속 안 되면 선생님께 알려 주세요.");
        }
        const b = await fbStore.quizReadServer(sid);
        const bd = b && b.ok ? b.data : null;
        startedAtMs = bd && Number.isFinite(bd.startedAtMs) ? bd.startedAtMs : Date.now();
        offset = bd && Number.isFinite(bd.hbMs) ? bd.hbMs - Date.now() : 0;
        if (bd && bd.v) v = bd.v;
      } else {
        const d0 = a.data;
        if (d0.v && (d0.v.status === "done" || d0.v.finishedAt)) throw new Error("이미 제출되었습니다. 결과는 선생님이 공개하면 보입니다.");
        const okHb = await fbStore.quizPatch(sid, {});
        if (!okHb) throw new Error("서버와 시각을 맞추지 못했습니다. 연결을 확인하고 다시 눌러 주세요.");
        const b = await fbStore.quizReadServer(sid);
        if (!b || !b.ok || !b.data) throw new Error("서버에서 응시 기록을 읽지 못했습니다. 다시 눌러 주세요.");
        offset = Number.isFinite(b.data.hbMs) ? b.data.hbMs - Date.now() : 0;
        startedAtMs = Number.isFinite(b.data.startedAtMs) ? b.data.startedAtMs : Number.isFinite(d0.startedAtMs) ? d0.startedAtMs : Date.now();
        v = b.data.v || d0.v || {};
        const other = d0.v ? d0.v.sess : null;
        const fresh0 = Number.isFinite(d0.hbMs) && Number.isFinite(b.data.hbMs) && b.data.hbMs - d0.hbMs < HB_STALE_SEC * 1000;
        if (other && other !== sess && fresh0 && v.status !== "done" && !v.finishedAt) {
          const ev = { t: new Date(Date.now() + offset).toISOString(), type: "dup", block: v.cur || null, item: null, warn: Number(v.warn) || 0 };
          if ((Array.isArray(v.events) ? v.events.length : 0) < MAX_EVENTS) await fbStore.quizPatch(sid, { events: fbStore.quizEvent(ev) });
          exitFs(); setDup(true); setBusy(false);
          return;
        }
        if (v.status === "done" || v.finishedAt) throw new Error("이미 제출되었습니다. 결과는 선생님이 공개하면 보입니다.");
        /* 시간이 끝나고 규칙의 유예(60초)도 지났으면 진행 필드(sess·served)를 쓸 수 없다(quizWithinTime).
           마무리 필드만 써서 완료로 닫는다. 유예 안이면 그대로 이어 열고, 시험 화면이 곧바로 현재 블록을 자동 제출한다 */
        /* 전체 일시정지 중이면 정지 시각 기준으로 잰다(정지 시간은 재개 때 pausedAccumSec 에 더해진다) */
        const nowForRem = cfg.paused && cfg.pausedAtMs ? Number(cfg.pausedAtMs) : Number.isFinite(b.data.hbMs) ? b.data.hbMs : Date.now() + offset;
        const remNow = remainingSec({ nowMs: nowForRem, startedAtMs, cfg, v, sid });
        if (remNow * 1000 <= -GRACE_MS && !cfg.paused) {
          const fin = new Date(Date.now() + offset).toISOString();
          const okFin = await fbStore.quizPatch(sid, { status: "done", finishedAt: fin, cur: Number(v.cur) || BLOCKS, clientScore: clientScoreOf({ blocks: v.blocks || {}, bank }) });
          exitFs(); setBusy(false);
          setErr(okFin ? "시간이 끝나 제출 처리되었습니다. 마지막 블록의 답은 시간 안에 저장되지 않았습니다. 선생님께 알려 주세요."
            : "시간이 끝났지만 완료 처리를 저장하지 못했습니다. 연결을 확인하고 다시 눌러 주세요.");
          return;
        }
        const evTs = new Date(Date.now() + offset).toISOString();
        const patch = { sess };
        const nEv = Array.isArray(v.events) ? v.events.length : 0;
        if (nEv < MAX_EVENTS) patch.events = fbStore.quizEvent({ t: evTs, type: "reconnect", block: v.cur || null, item: null, warn: Number(v.warn) || 0 });
        const next = nextBlockOf(v.blocks);
        if (next == null) {
          await fbStore.quizPatch(sid, { status: "done", finishedAt: evTs, cur: BLOCKS });
          exitFs(); setBusy(false);
          return;
        }
        const servedMap = v.served || {};
        if (!servedMap[String(next)]) {
          /* 자동 제출 뒤 교사가 다시 연 경우: 다음 블록이 아직 열리지 않았다. 규칙대로 급을 잇고 여기서 연다 */
          const level = clientScoreOf({ blocks: v.blocks || {}, bank }).path[next - 1] || START_LEVEL;
          const d = drawBlock({ bank, half: v.half, seed: v.seed, level, used: usedOf(servedMap), disabled: cfg.disabled || [], noImage: !!v.noImage, k: next });
          patch.served = { [String(next)]: { level, itemIds: d.itemIds, at: evTs, ...(d.crossHalf ? { crossHalf: true } : {}) } };
        }
        if (v.cur !== next) patch.cur = next;
        const ok2 = await fbStore.quizPatch(sid, patch);
        if (!ok2) throw new Error("응시를 다시 잇지 못했습니다. 연결을 확인하고 다시 눌러 주세요.");
        v = { ...v, sess, cur: next, served: { ...servedMap, ...(patch.served || {}) }, events: (v.events || []).concat(nEv < MAX_EVENTS ? [{ type: "reconnect" }] : []) };
      }
      setSession({ v, startedAtMs, offset, sess, prepUntil: Date.now() + PREP_MS });
      setDup(false);
    } catch (e) {
      exitFs();
      setErr((e && e.message) || "시작하지 못했습니다. 다시 눌러 주세요.");
    }
    setBusy(false);
  };

  if (!sid || closed) return null;

  const stageNote = stage === "open" ? (canStart ? "시작 마감까지 " + fmtMMSS(Math.max(0, Math.floor((deadlineMs - now) / 1000))) : "시작 마감이 지났습니다")
    : stage === "ended" ? "시작 마감" : stage === "published" ? "결과 공개" : "";

  /* ---- 안내 카드(규칙 5문장·점수표·잠금 규칙) ---- */
  const intro = (
    <div className="card qz-card">
      <div className="card-head"><span className="card-code">쪽지시험</span><span className="card-title">{cfg.title || "쪽지시험"}</span><span className="card-sess">{stageNote}</span></div>
      <div className="card-body">
        <ol className="qz-rules">{ruleSentences(cfg.warnLimit).map((s, i) => <li key={i}>{s}</li>)}</ol>
        <details className="qz-details">
          <summary>점수표 보기</summary>
          <ScoreTable />
        </details>
        <details className="qz-details">
          <summary>시험 중 화면 규칙</summary>
          <ul className="qz-rules qz-rules-s">
            <li>「시험 시작」을 누르면 전체화면으로 바뀌고 이 창이 화면 전체를 덮습니다. 브라우저가 전체화면을 막으면 시작할 수 없으니 선생님께 알려 주세요.</li>
            <li>다른 창·탭으로 2초 이상 나가거나 전체화면을 10초 넘게 벗어나면 경고가 기록됩니다. 시작 뒤 30초는 준비 구간이라 경고로 세지 않습니다.</li>
            <li>경고가 {cfg.warnLimit || 3}회가 되면 시험이 잠기고 남은 시간이 멈춥니다. 선생님이 풀어 주면 이어 풉니다. 기록은 점수를 깎지 않습니다.</li>
            <li>우클릭·복사·붙여넣기·인쇄·저장 단축키는 막히고 기록만 남습니다. F12 같은 개발자 도구 단축키는 경고가 됩니다.</li>
            <li>새로고침이나 PC 고장 뒤 다시 로그인하면 같은 블록의 같은 자리에서 이어 풉니다. 제출한 블록은 다시 열리지 않습니다.</li>
            <li>남은 시간은 서버 시각으로 잽니다. 시간이 끝나면 지금 블록이 그대로 자동 제출됩니다.</li>
          </ul>
        </details>
      </div>
    </div>
  );

  let screen;
  if (session) {
    screen = <ExamSession sid={sid} cfg={cfg} bank={bank} init={session} live={live} font={font} setFont={setFont} onDone={() => setSession(null)} />;
  } else if (sampleMode) {
    const sv = sample && sample.attempts ? sample.attempts[sid] : null;
    screen = (
      <>
        {intro}
        <PracticeCard items={bank ? bank.practice : []} onDemo={() => setDemo(true)} />
        <div className="card qz-card"><div className="card-body">
          <div className="qz-tools">
            <button type="button" className="btn" disabled title="표본 학급">시험 시작</button>
            <button type="button" className="btn ghost" onClick={() => setShowSampleRes((x) => !x)}>{showSampleRes ? "결과 화면 예시 닫기" : "결과 화면 예시 보기"}</button>
          </div>
        </div></div>
        {showSampleRes && sv && sv.result && <ResultView v={sv} cfg={quizCfg({ quiz: sample.cfg })} />}
      </>
    );
  } else if (!got) {
    screen = (
      <div className="card qz-card"><div className="card-body" style={{ color: "var(--sub)", fontSize: 13 }}>
        응시 기록을 불러오는 중… 잠시만 기다려 주세요.
        {slow && <div className="warn-note" style={{ marginTop: 10 }}>연결이 느립니다. 인터넷 연결을 확인해 주세요. 연결되면 자동으로 이어집니다.</div>}
      </div></div>
    );
  } else if (lv && (lv.status === "done" || lv.finishedAt)) {
    if (stage === "published" && lv.result && lv.result.published) screen = <ResultView v={lv} cfg={cfg} />;
    else screen = (
      <div className="card qz-card">
        <div className="card-head"><span className="card-code">쪽지시험</span><span className="card-title">{cfg.title || "쪽지시험"}</span><span className="card-sess">{fmtT(lv.finishedAt)} 제출</span></div>
        <div className="card-body">
          <div className="ok-note" role="status">제출되었습니다. 점수와 급 경로는 선생님이 결과를 공개하면 이 자리에 나타납니다.</div>
          {err && <div className="warn-note" role="alert">{err}</div>}
        </div>
      </div>
    );
  } else if (lv) {
    const locked = lv.status === "locked";
    const waitDup = dup && lv.sess != null;
    screen = (
      <>
        {intro}
        <div className="card qz-card">
          <div className="card-head"><span className="card-code">이어 풀기</span><span className="card-title">진행 중인 응시가 있습니다</span><span className="card-sess">블록 {lv.cur || 1} / {BLOCKS}</span></div>
          <div className="card-body">
            {dup && <div className="warn-note" role="alert">다른 곳에서 응시 중입니다. 같은 학번이 다른 브라우저에서 시험을 보고 있어 여기서는 이어 풀 수 없습니다. 선생님이 「세션 초기화」를 누르면 이 버튼이 다시 활성화됩니다.</div>}
            {locked && <div className="warn-note" role="alert">시험이 잠겨 있습니다. 선생님을 불러 주세요. 선생님이 풀어 주면 「이어서 풀기」가 활성화됩니다.</div>}
            {lv.resumeOk && !locked && <div className="ok-note">선생님이 응시를 다시 열었습니다. 같은 문항·순서로 남은 블록을 이어 풉니다.</div>}
            {!locked && !dup && <p style={{ fontSize: 13, lineHeight: 1.6 }}>「이어서 풀기」를 누르면 전체화면으로 바뀌고 같은 블록의 같은 자리에서 이어 풉니다. 고른 답은 저장되어 있고, 남은 시간은 처음 시작한 시각 기준으로 이어집니다.</p>}
            {cfg.paused && <div className="warn-note" role="status">선생님이 시험을 잠시 멈췄습니다. 재개되면 「이어서 풀기」가 활성화됩니다. 멈춘 시간은 보전됩니다.</div>}
            {!bankOk && (bankGot ? <div className="warn-note">문항 은행이 아직 올라오지 않았습니다. 선생님께 알려 주세요.</div> : <div className="warn-note">문항 은행을 불러오는 중입니다. 잠시 뒤 다시 눌러 주세요.</div>)}
            {err && <div className="warn-note" role="alert">{err}</div>}
            <button type="button" className="btn qz-big" disabled={busy || locked || waitDup || !bankOk || !!cfg.paused} onClick={() => openSession(false)}>{busy ? "잇는 중…" : "이어서 풀기"}</button>
          </div>
        </div>
      </>
    );
  } else if (stage === "open") {
    screen = (
      <>
        {intro}
        <PracticeCard items={bank ? bank.practice : []} onDemo={() => setDemo(true)} />
        <div className="card qz-card">
          <div className="card-head"><span className="card-code">시작</span><span className="card-title">시험 시작</span><span className="card-sess">{stageNote}</span></div>
          <div className="card-body">
            {!bank && !bankGot && <div className="warn-note">문항 은행을 불러오는 중입니다. 잠시만 기다려 주세요.{slow ? " 연결이 느리면 인터넷 연결을 확인해 주세요." : ""}</div>}
            {!bank && bankGot && <div className="warn-note">선생님이 아직 문항 은행을 올리지 않았습니다. 선생님께 알려 주세요.</div>}
            {bank && !bankOk && <div className="warn-note">문항 은행이 준비되지 않았습니다. 선생님께 알려 주세요.</div>}
            {!canStart && <div className="warn-note" role="alert">시작 마감이 지나 새로 시작할 수 없습니다. 선생님께 알려 주세요.</div>}
            {err && <div className="warn-note" role="alert">{err}</div>}
            <p style={{ fontSize: 13, lineHeight: 1.6 }}>누르면 전체화면으로 바뀌고 40분 타이머가 시작됩니다. 준비가 되었을 때 누르세요. 시작한 뒤에는 처음부터 다시 할 수 없습니다.</p>
            <button type="button" className="btn qz-big" disabled={busy || !bankOk || !canStart} onClick={() => openSession(true)}>{busy ? "시작하는 중…" : "시험 시작"}</button>
          </div>
        </div>
      </>
    );
  } else if (stage === "ended") {
    screen = (
      <>
        {intro}
        <div className="card qz-card"><div className="card-body"><div className="warn-note" role="status" style={{ marginBottom: 0 }}>시작 마감이 지나 새로 시작할 수 없습니다. 응시하지 못한 사정이 있으면 선생님께 말씀해 주세요.</div></div></div>
      </>
    );
  } else {
    screen = (
      <>
        {intro}
        <div className="card qz-card"><div className="card-body"><div className="ok-note" role="status" style={{ marginBottom: 0 }}>이 학번의 응시 기록이 없습니다. 응시했는데 이 안내가 보이면 선생님께 말씀해 주세요.</div></div></div>
      </>
    );
  }

  return (
    <div className="qz-tab">
      {sampleMode && !session && <div className="warn-note">예시 화면입니다. 여기서는 아무것도 저장되지 않습니다.</div>}
      {screen}
      {demo && !session && <div className="qz-overlay qz-demo" style={{ "--qz-fs": font + "px" }}><WarnCover demo n={1} limit={cfg.warnLimit || 3} ev={{ type: "blur" }} onBack={() => setDemo(false)} /></div>}
    </div>
  );
}

/* ---------- 스타일 ---------- */

const QUIZ_CSS = `
.qz-card{border-top:3px solid var(--ink)}
body.qz-exam-on .topbar,body.qz-exam-on .sess-tabs,body.qz-exam-on .prog-strip{display:none!important}
.qz-main[inert]{opacity:.35;filter:blur(1px)}
.qz-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.qz-rules{margin:0 0 12px;padding-left:22px;font-size:14px;line-height:1.7}
.qz-rules li{margin-bottom:4px}
.qz-rules-s{font-size:13px}
.qz-details{margin:8px 0}
.qz-details summary{cursor:pointer;font-size:13px;font-weight:700;padding:6px 0}
.qz-tools{display:flex;align-items:center;gap:10px;margin:12px 0 0;flex-wrap:wrap}
.qz-big{padding:14px 26px;font-size:max(16px,.85em);font-weight:700}
.qz-big:disabled,.btn.qz-big:disabled{opacity:.45;cursor:not-allowed}
.qz-overlay .btn{font-size:max(14px,.75em)}
.qz-overlay .btn.qz-big{font-size:max(16px,.85em)}
.qz-overlay .warn-note,.qz-overlay .ok-note,.qz-overlay .hint{font-size:.7em}

/* 점수표 */
.qz-score{width:100%;border-collapse:collapse;font-size:13px;margin:6px 0 10px}
.qz-score th{font-weight:500;color:var(--sub);font-size:12px;text-align:left;border-bottom:1px solid var(--line2);padding:6px 8px}
.qz-score td{padding:6px 8px;border-bottom:1px dashed var(--line2);vertical-align:top}
.qz-score tr.qz-me td{background:var(--ink);color:#fff;font-weight:700}
.qz-score tr.qz-fp td{color:var(--sub);text-decoration:line-through}

/* 시험 화면 — 앱 전체를 덮는다. 글자 크기는 --qz-fs (18/22/26px), 줄 간격 1.6, 본문 대비 #111 on #fff */
.qz-overlay{position:fixed;inset:0;z-index:9999;background:#fff;color:#111;overflow:auto;-webkit-overflow-scrolling:touch;font-family:var(--sans);font-size:var(--qz-fs,22px);line-height:1.6;-webkit-user-select:none;user-select:none}
.qz-overlay *:focus-visible{outline:2px solid #111;outline-offset:2px}
.qz-bar{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:14px 22px;flex-wrap:wrap;padding:10px 20px;background:#fff;border-bottom:2px solid #111;font-size:.75em}
.qz-bar-i{white-space:nowrap}
.qz-bar-i b{font-weight:900}
.qz-time.low b{color:var(--seal)}
.qz-rec{color:var(--sub)}
.qz-rec.late{color:var(--seal)}
.qz-font{margin-left:auto;display:inline-flex;gap:4px}
.qz-font-b{border:1px solid var(--line);background:#fff;color:#111;font-family:var(--sans);font-size:12px;padding:4px 8px;cursor:pointer}
.qz-font-b.on{background:#111;color:#fff;border-color:#111}
.qz-alert{padding:6px 20px;background:var(--seal-bg);border-bottom:1px solid var(--seal);font-size:.75em;color:#111}
.qz-off{margin:12px 20px 0}
.qz-main{max-width:860px;margin:0 auto;padding:18px 20px 60px}
.qz-blk-h{font-size:1.1em;font-weight:900;margin:0 0 14px}
.qz-blk-h .hint{display:block;font-size:.6em;font-weight:400;margin-top:2px}
.qz-done{text-align:center;padding-top:80px}

/* 문항 */
.qz-item{border:1px solid var(--line);background:#fff;padding:16px 18px;margin-bottom:16px}
.qz-item-n{font-family:var(--mono);font-size:.6em;letter-spacing:.12em;color:var(--sub);margin-bottom:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.qz-negtag{font-family:var(--sans);letter-spacing:0;border:1px solid var(--ink);color:var(--ink);padding:0 6px;font-size:1em}
.qz-stem{font-size:1em;font-weight:700;line-height:1.6;margin:0 0 12px;white-space:pre-wrap}
.qz-stem-s{font-size:.9em}
.qz-neg{font-weight:900;text-decoration:underline;text-decoration-thickness:2px;text-underline-offset:3px}
.qz-fig{margin:0 0 12px;background:var(--card2);border:1px solid var(--line2);display:flex;justify-content:center}
.qz-fig img{max-width:100%;max-height:360px;object-fit:contain;display:block}
.qz-img-alt{background:var(--card2);border:1px dashed var(--line);padding:10px 12px;font-size:.85em;color:var(--sub);margin-bottom:12px}
.qz-opts{display:flex;flex-direction:column;gap:8px}
.qz-opt{display:flex;align-items:flex-start;gap:12px;width:100%;text-align:left;padding:12px 14px;border:2px solid var(--line);background:#fff;color:#111;font-family:var(--sans);font-size:1em;line-height:1.5;cursor:pointer}
.qz-opt:hover{border-color:#111}
.qz-opt.on{border-color:#111;border-width:3px;padding:11px 13px;background:var(--card2);font-weight:700}
.qz-opt:disabled{opacity:.5;cursor:not-allowed}
.qz-opt-k{font-family:var(--mono);flex:none;color:var(--sub)}
.qz-opt.on .qz-opt-k{color:#111}
.qz-opt-t{flex:1;white-space:pre-wrap}
.qz-opt-sel{flex:none;font-size:.7em;border:1px solid #111;background:#111;color:#fff;padding:1px 7px;align-self:center}
.qz-practice .qz-opt{font-size:.9em}
.qz-submit{margin-top:20px;padding-top:16px;border-top:1px solid var(--line)}
.qz-confirm{border:2px solid var(--seal);background:var(--seal-bg);padding:14px 16px}
.qz-confirm-h{font-weight:700}

/* 가림 화면(경고·잠금·정지·전체화면·중복) */
.qz-cover{position:fixed;inset:0;z-index:3;background:#fff;display:flex;align-items:center;justify-content:center;padding:24px}
.qz-cover-in{max-width:640px;width:100%;border:3px solid #111;padding:28px 30px;background:#fff}
.qz-cover-in p{font-size:.9em;line-height:1.7;margin:0 0 12px}
.qz-cover-k{font-family:var(--mono);font-size:.6em;letter-spacing:.14em;color:var(--seal);margin-bottom:8px}
.qz-cover-h{font-size:1.15em;font-weight:900;line-height:1.5;margin:0 0 14px}
.qz-demo{font-size:22px}

/* 결과 */
.qz-result .qz-item{user-select:text}
.qz-res-head{display:flex;align-items:center;gap:24px;flex-wrap:wrap;margin-bottom:14px}
.qz-res-score{font-size:34px;font-weight:900;line-height:1.2}
.qz-res-score b{font-size:48px}
.qz-res-band{display:inline-block;border:2px solid #111;padding:0 10px;margin-left:8px;font-size:28px;vertical-align:middle}
.qz-res-dl{display:grid;grid-template-columns:auto auto;gap:3px 12px;font-size:13px;margin:0}
.qz-res-dl dt{color:var(--sub)}
.qz-res-dl dd{margin:0;font-weight:700}
.qz-h{font-weight:700;font-size:14px;margin:16px 0 6px;padding-top:12px;border-top:1px solid var(--line2)}
.qz-path{list-style:none;padding:0;margin:0;display:flex;gap:8px;flex-wrap:wrap}
.qz-path li{border:1px solid var(--line);padding:8px 12px;font-size:13px;display:flex;flex-direction:column;gap:2px;min-width:110px}
.qz-path-k{font-family:var(--mono);font-size:11px;color:var(--sub);letter-spacing:.1em}
.qz-path-mv{color:var(--sub);font-size:12px}
.qz-res-item{font-size:14px}
.qz-res-item.ok{border-left:4px solid var(--patina)}
.qz-res-item.bad{border-left:4px solid var(--seal)}
.qz-ok{color:var(--patina);font-weight:700;letter-spacing:0}
.qz-bad{color:var(--seal);font-weight:700;letter-spacing:0}
.qz-res-opts{list-style:none;padding:0;margin:0 0 8px}
.qz-res-opts li{display:flex;gap:10px;align-items:center;padding:6px 10px;border:1px solid var(--line2);margin-bottom:4px}
.qz-res-opts li.ans{border-color:var(--patina);background:var(--patina-bg)}
.qz-res-opts li.mine:not(.ans){border-color:var(--seal);background:var(--seal-bg)}
.qz-tag{font-family:var(--mono);font-size:10px;letter-spacing:.1em;border:1px solid currentColor;padding:0 5px;margin-left:auto;white-space:nowrap}
.qz-expl{font-size:13px;line-height:1.7;color:var(--sub);margin:0;border-top:1px dashed var(--line2);padding-top:8px}

@media (pointer:coarse){.qz-opt,.qz-font-b,.qz-tools .btn{min-height:44px}}
@media (max-width:640px){
  .qz-bar{gap:8px 14px;padding:8px 12px;font-size:.65em}
  .qz-main{padding:14px 12px 60px}
  .qz-item{padding:12px}
  .qz-cover-in{padding:20px}
  .qz-res-head{gap:12px}
}
@media print{.qz-overlay{display:none!important}}
`;

export function QuizStyle() { return <style>{QUIZ_CSS}</style>; }
