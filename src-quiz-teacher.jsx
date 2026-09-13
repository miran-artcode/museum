/* ============================================================
   적응형 쪽지시험 — 교사 화면 「쪽지시험」 탭

   일곱 장의 카드: 설정(단계·시간·좌석표·학생별 배수·비활성 문항·전체 일시정지), 문항 은행(검증·올리기·열람),
   실시간(응시 현황·해제·시간 추가·세션 초기화·재개), 결과(재계산·표시·응시 기록표·정정·공개·CSV),
   문항 통계, 신뢰도, 설계 근거. 측정 규칙과 화면 구성의 원본은 쪽지시험_구현_근거.md(§6 사후 통계와 교사 화면, §7 잠금 규칙).

   이 파일은 계산을 하지 않는다 — 추출 재현·채점·통계·CSV 행은 모두 src-quiz-core.mjs 가 만들고,
   여기서는 부르고 보여 주고 저장할 뿐이다. 예외는 표시 전용의 작은 비교 셋(Wilson 걸침·급 이동 후보·이동 일관성)으로,
   core 가 돌려주는 값을 견주기만 한다. src-app.jsx 를 import 하지 않는다(순환).

   저장 규약
   - 단계·설정은 onSaveCfg(patch) 한 길로만 나간다. 메인 세션이 { quiz: {...} } 만 merge 로 쓴다.
     merge 는 맵을 필드 단위로 합치므로 timeMult·noImage 의 키를 지우는 대신 1·false 를 명시해 보낸다.
   - 은행은 quizBank/v1(공개부)·quizKeys/v1(정답부) 두 문서로 나눠 올린다(splitBank).
   - 응시 문서의 교사 필드(result·pausedTotalSec·extraSec·falsePos·note·resumeOk)는 fbStore.quizPatch 로 merge 한다.
     학생이 쓰는 필드(blocks·served·events)는 여기서 건드리지 않는다.
   ============================================================ */

import React, { useState, useEffect, useRef, useMemo } from "react";
import { fbStore } from "./src-fb.js";
import {
  LEVELS, BLOCKS, BLOCK_SIZE, LEVEL_NAMES, LEVEL_WORDS, AREAS, AREA_MIX, CELL_MIN, LEVEL_SEC, BLOCK_END_MIN,
  LEVEL_TARGET_P, LEVEL_P_RANGE, ITEM_STAT_MIN_N, ITEM_FLAG_MIN_N, TWIN_DIFF, SHORT_BLUR_N, MIN_ANSWERED, MAX_EVENTS,
  RULE_SENTENCES, SCORE_ROWS, SCORE_BOUNDS, FLAG_LABELS, RELIABILITY_NOTE, QUIZ_STAGES, quizCfg,
  parseSeatGrid, halfOf, moveOf, wilson, recompute, resultItems, itemStats, twinStats, levelMonotonic, reliabilityStats, recordSheet,
  csvAttempts, csvResponses, csvEvents, csvItems, validateBank, splitBank, remainingSec, buildSampleQuiz, fmtMMSS,
} from "./src-quiz-core.mjs";

const DEADLINE_MIN = [5, 30];       // 시작 마감(분) 허용 범위
const WARN_LIMIT = [2, 5];          // 경고 한도 허용 범위
const MULTS = [1, 1.5, 2];          // 학생별 시간 배수
const HB_STALE_SEC = 60;            // 심장박동이 이보다 오래되면 연결 끊김으로 본다(중복 접속 판정과 같은 값)
const LOCK_INTERVENE = 3;           // 잠금이 이 횟수에 이르면 「감독 개입 필요」(설계 §7.3: 9회 경고 = 세 번째 잠금)
const N_ITEMS = BLOCKS * BLOCK_SIZE;
const AREA_MARK = { 1: "①", 2: "②", 3: "③", 4: "④" };
const ITEM_FLAG_LABELS = {
  few: "노출 부족", levelCheck: "난이도 재검토", lowDisc: "변별 없음", keyCheck: "정답 키 확인", deadOption: "기능하지 않는 오답", longTime: "길이 재검토",
};
const STATUS_LABEL = { none: "미시작", running: "진행", locked: "잠김", done: "완료" };

/* 단계를 바꾸기 전에 띄우는 확인 문장 — 학생 화면에 무엇이 나타나는지를 말한다 */
const STAGE_CONFIRM = {
  closed: "「닫힘」으로 바꿉니다. 학생 화면에서 쪽지시험 탭이 사라지고 은행을 읽을 수 없게 됩니다. 진행 중인 학생이 있으면 누르지 마세요.",
  open: "「열기」로 바꿉니다. 지금부터 시작 마감 시간 안에 학생이 「시험 시작」을 누를 수 있습니다. 여는 시각이 기록되므로 학생이 모두 준비된 뒤에 누르세요.",
  ended: "「시작 마감」으로 바꿉니다. 새로 시작할 수 없고, 이미 시작한 학생은 자기 남은 시간까지 계속 풉니다.",
  published: "「결과 공개」로 바꿉니다. 저장된 결과가 있는 학생에게 점수·급 경로·문항별 정답과 해설·이탈 기록이 보입니다.",
};
/* 당일 운영 점검표(설계 §6.6). 화면에서 바로 보게 둔다 */
const CHECKLIST = [
  "전날: 컴퓨터실 한 대에서 연습 화면까지 실행(전체화면·이미지·서버 시각). OS 알림·메신저·업데이트 알림을 끈다. 좌석표를 입력·출력한다. 은행을 올리고 「은행 상태」가 일치하는지 본다.",
  "0분: 규칙 5문장, 「이탈 3회면 잠기고 선생님이 풀어 준다」, 「문항 오류는 전원 정답 처리」를 말한다.",
  "3분: 연습 시작. 전체화면이 안 되는 자리는 이 단계에서 걸러 자리를 옮긴다(옮기면 반이 바뀔 수 있으므로 좌석표를 갱신).",
  "6분: 「열기」. 15분 안에 전원 시작 확인.",
  "6~46분: 실시간 카드를 보며 순시한다. 빨간 칸(잠금·중복 접속)으로 간다. 「전체 일시정지」는 정전·서버 장애에만 쓴다.",
  "46~50분: 전원 「완료」 확인 후 「시작 마감」.",
  "당일 저녁: 재계산 → 문항 통계의 빨간 표시(정답 키 확인) → 경계·불일치 학생 → 「결과 공개」.",
];
/* 경계 사례(설계 §4.5): 학생에게 보여 줄 표. 회귀 테스트에 같은 11개가 들어 있다 */
const BOUNDARY_CASES = [
  ["가", "4/5 ↑", "4급 4/5 ↑", "5급 3/5 =", "5급 3/5 =", 5, 14, 20, "A 8", "A의 최솟값. 5급 6/10 유지"],
  ["나", "5/5 ↑", "4급 5/5 ↑", "5급 4/5 =", "5급 2/5 ↓", 4, 16, 20, "B 7", "5급까지 도달했으나 마지막에 유지 못함"],
  ["다", "4/5 ↑", "4급 4/5 ↑", "5급 2/5 ↓", "4급 4/5", 4, 14, 20, "B 7", "위로 올리지 않음"],
  ["라", "5/5 ↑", "4급 2/5 ↓", "3급 5/5 ↑", "4급 2/5 ↓", 3, 14, 20, "C 5", "4급 누적 4/10. 경로 민감"],
  ["마", "3/5 =", "3급 3/5 =", "3급 3/5 =", "3급 3/5 =", 3, 12, 20, "C 5", "전형적 C(60%)"],
  ["바", "2/5 ↓", "2급 4/5 ↑", "3급 4/5 ↑", "4급 3/5 =", 4, 13, 20, "B 6", "하강 뒤 회복"],
  ["사", "2/5 ↓", "2급 2/5 ↓", "1급 3/5 =", "1급 3/5 =", 1, 10, 20, "E 3", "1급에 머물렀으나 추측 수준 아님"],
  ["아", "1/5 ↓", "2급 1/5 ↓", "1급 2/5 ↓", "1급 2/5", 1, 6, 20, "E 2", "추측과 구별 안 됨(c ≤ 8)"],
  ["자", "5/5 ↑", "4급 5/5 ↑", "5급 4/5 =", "5급 시간 종료 1/5", 4, 15, 17, "B 7", "빈 3문항이 오답으로 들어가 한 급 내려감"],
  ["차", "3/5 =", "3급 2/5 ↓", "2급 시간 종료 2/5", "미시작 0/5(1급)", 1, 7, 13, "E 2", "미시작 블록의 0/5가 라우팅에 들어감"],
  ["카", "3/5 =", "3급 4/5 ↑", "4급 시간 종료 1/5", "미시작 0/5(3급)", 2, 8, 11, "D 4", "3급→4급 도달 뒤 시간 부족"],
];
const REFS = [
  "Yan, D., von Davier, A. A., & Lewis, C. (Eds.). (2014). Computerized multistage testing: Theory and applications. CRC Press. (정답 수 라우팅 MST)",
  "Hendrickson, A. (2007). An NCME instructional module on multistage testing. Educational Measurement: Issues and Practice, 26(2), 44–52.",
  "Haladyna, T. M., Downing, S. M., & Rodriguez, M. C. (2002). A review of multiple-choice item-writing guidelines for classroom assessment. Applied Measurement in Education, 15(3), 309–334.",
  "Rodriguez, M. C. (2005). Three options are optimal for multiple-choice items. Educational Measurement: Issues and Practice, 24(2), 3–13. (합산형 검사의 결론이라 라우팅형에는 4지선다를 택함)",
  "Wilson, E. B. (1927). Probable inference, the law of succession, and statistical inference. JASA, 22(158), 209–212. (정답률 구간)",
  "Anderson, L. W., & Krathwohl, D. R. (Eds.). (2001). A taxonomy for learning, teaching, and assessing. Longman. (급의 인지 수준)",
];

/* ---------- 작은 도우미 ---------- */

const nowISO = () => new Date().toISOString();
const fmtT = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return (d.getMonth() + 1) + "/" + d.getDate() + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
};
const fmtHMS = (ms) => {
  if (!Number.isFinite(ms)) return "-";
  const d = new Date(ms);
  return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") + ":" + String(d.getSeconds()).padStart(2, "0");
};
const num = (x, d = 2) => (x == null || Number.isNaN(Number(x)) ? "-" : Number(x).toFixed(d));
const pct = (x) => (x == null || Number.isNaN(Number(x)) ? "-" : Math.round(Number(x) * 100) + "%");
const ci = (w) => (Array.isArray(w) && w.length === 2 ? "(" + num(w[0]) + "~" + num(w[1]) + ")" : "");
const sec = (ms) => (ms == null ? "-" : Math.round(ms / 100) / 10 + "초");
const clampInt = (v, lo, hi, dflt) => {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
};
const trunc = (s, n) => { const t = String(s == null ? "" : s); return t.length > n ? t.slice(0, n) + "…" : t; };
const isPick = (x) => x != null && x !== "";
const cutIds = (s) => String(s || "").split(/[\s,]+/).map((t) => t.trim()).filter(Boolean);

/* 설정 패치를 서버에 보내기 직전에 범위를 맞춘다 — 입력 중에는 "1"→"15"처럼 지나가는
   값이 있으므로 칠 때마다 자르지 않고, 0.8초 쉰 뒤 한 번만 자른다 */
function sanitize(patch, base) {
  const out = { ...patch };
  if ("stage" in out && !QUIZ_STAGES.some((s) => s.k === out.stage)) out.stage = base.stage;
  if ("startDeadlineSec" in out) out.startDeadlineSec = clampInt(out.startDeadlineSec, DEADLINE_MIN[0] * 60, DEADLINE_MIN[1] * 60, base.startDeadlineSec);
  if ("warnLimit" in out) out.warnLimit = clampInt(out.warnLimit, WARN_LIMIT[0], WARN_LIMIT[1], base.warnLimit);
  if ("seatGrid" in out) out.seatGrid = String(out.seatGrid || "").slice(0, 4000);
  if ("timeMult" in out) {
    const m = {};
    Object.keys(out.timeMult || {}).forEach((k) => { const v = Number(out.timeMult[k]); m[k] = MULTS.includes(v) ? v : 1; });
    out.timeMult = m;
  }
  if ("noImage" in out) {
    const m = {};
    Object.keys(out.noImage || {}).forEach((k) => { m[k] = !!out.noImage[k]; });
    out.noImage = m;
  }
  if ("disabled" in out) out.disabled = [...new Set((Array.isArray(out.disabled) ? out.disabled : []).map((x) => String(x).trim()).filter(Boolean))].slice(0, 200);
  if ("paused" in out) out.paused = !!out.paused;
  ["pausedAtMs", "pausedAccumSec", "openedAtMs"].forEach((k) => { if (k in out) out[k] = Math.max(0, Number(out[k]) || 0); });
  if ("bankVer" in out) out.bankVer = String(out.bankVer || "").slice(0, 60);
  if ("title" in out) out.title = String(out.title || "").slice(0, 80);
  return out;
}

/* CSV 내려받기 — BOM을 붙이고, 셀마다 따옴표를 겹치고, 수식 문자로 시작하면 ' 를 앞에 둔다
   (엑셀에서 =·+·-·@ 로 시작하는 셀이 수식으로 실행되는 것을 막는다). src-assess-teacher.jsx 와 같은 보조 함수 */
function downloadCsv(name, head, rows) {
  const esc = (c) => {
    if (typeof c === "number" && Number.isFinite(c)) return String(c);   // 숫자 열은 그대로 — 음수를 문자열로 만들면 안 된다
    let s = String(c == null ? "" : c);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  const csv = "﻿" + [head, ...rows].map((r) => r.map(esc).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

/* 응시 문서 하나의 표시 상태. 문서가 없으면 none */
const statusOf = (v) => (!v ? "none" : v.status === "locked" ? "locked" : v.status === "done" || v.finishedAt ? "done" : "running");
/* 지금 블록에서 고른 답 수(초안 기준). 완료면 제출된 블록의 응답 수 합.
   초안(draft)의 모양은 학생 화면이 정한다 — { 문항id: 보기id } 평면 맵, { "k": { 문항id: 보기id } } 블록별 맵,
   { "k": { answers: [] } } 배열 셋 다 받아 센다(어느 쪽이든 「고른 수」만 보면 된다) */
function answeredOf(v) {
  if (!v) return { n: 0, of: 0 };
  if (statusOf(v) === "done") {
    let n = 0, of = 0;
    Object.values(v.blocks || {}).forEach((b) => { if (!b) return; of += (b.itemIds || []).length; (b.answers || []).forEach((a) => { if (isPick(a)) n += 1; }); });
    return { n, of };
  }
  const cur = String(v.cur || 1);
  const s = (v.served || {})[cur];
  const ids = (s && s.itemIds) || [];
  const d = v.draft || {};
  const blk = d[cur] && typeof d[cur] === "object" ? d[cur] : d;
  const n = Array.isArray(blk.answers) ? blk.answers.filter(isPick).length : ids.filter((id) => isPick(blk[id])).length;
  return { n, of: ids.length || BLOCK_SIZE };
}
const eventsOf = (v) => ((v && Array.isArray(v.events)) ? v.events.filter(Boolean) : []);
const countEv = (v, type) => eventsOf(v).filter((e) => e.type === type).length;
/* 잠근 시각: 서버 시각이 아직 없으면(쓰기 대기) 학생이 적은 ISO 로 대신한다 */
const lockedMsOf = (v, meta) => (meta && Number.isFinite(meta.lockedAtMs) ? meta.lockedAtMs : v && v.lock && v.lock.at ? Date.parse(v.lock.at) : NaN);

/* ---------- 표시 전용 비교 (core 값을 견주기만 한다) ---------- */

/* Wilson 걸침(설계 §6.2): c/20 의 Wilson 95% 구간이 자기 행의 점수 경계를 걸치는가.
   경계 b 는 「c ≥ b 이면 윗줄」이므로 b − 0.5 가 구간 안에 있으면 걸친 것으로 본다. 점수는 바꾸지 않는다 */
function wilsonStraddle(res) {
  if (!res || !(res.n >= MIN_ANSWERED)) return false;
  const bounds = SCORE_BOUNDS[res.F] || [];
  if (!bounds.length) return false;
  const [lo, hi] = wilson(res.c / N_ITEMS, N_ITEMS);
  return bounds.some((b) => lo * N_ITEMS <= b - 0.5 && hi * N_ITEMS >= b - 0.5);
}
/* 급 오배정 의심(설계 §6.1): 노출 8 이상이고 (i) 정답률이 한 급 위 문항들의 평균보다 낮거나
   (ii) 한 급 아래 평균보다 높은 문항. 급별 평균은 levelMonotonic 의 means 를 그대로 쓴다. 「다음 해 급 이동 후보」 목록 */
function levelShiftCandidates(stats, means) {
  if (!stats || !means) return [];
  return stats.map((s) => {
    if (!(s.n >= ITEM_FLAG_MIN_N) || s.p == null || s.level == null) return null;
    const up = means[s.level + 1], down = means[s.level - 1];
    const why = [];
    if (up != null && s.p < up) why.push("한 급 위 평균 " + num(up) + "보다 낮음");
    if (down != null && s.p > down) why.push("한 급 아래 평균 " + num(down) + "보다 높음");
    return why.length ? { id: s.id, level: s.level, p: s.p, n: s.n, why: why.join(", ") } : null;
  }).filter(Boolean);
}
/* 이동 일관성(설계 §6.4 5번): 상승한 학생의 다음 블록 정답률이 유지한 학생의 다음 블록 정답률보다 낮은가
   (급이 실제로 더 어려웠는가). 다음 블록을 실제로 푼 경우만 센다 */
function moveConsistency(resultsMap, attempts) {
  const acc = { up: [], stay: [], down: [] };
  Object.keys(resultsMap || {}).forEach((sid) => {
    const r = resultsMap[sid], v = (attempts || {})[sid] || {};
    if (!r || !Array.isArray(r.path) || !Array.isArray(r.blockCorrect)) return;
    for (let k = 1; k < BLOCKS; k += 1) {
      if (!(v.blocks && (v.blocks[String(k + 1)] || v.blocks[k + 1]))) continue;
      const mv = moveOf(r.path[k - 1], r.blockCorrect[k - 1]);
      (mv > 0 ? acc.up : mv < 0 ? acc.down : acc.stay).push(r.blockCorrect[k] / BLOCK_SIZE);
    }
  });
  const m = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const up = m(acc.up), stay = m(acc.stay), down = m(acc.down);
  return { up: { n: acc.up.length, mean: up }, stay: { n: acc.stay.length, mean: stay }, down: { n: acc.down.length, mean: down }, ok: up != null && stay != null ? up < stay : null };
}
/* A·B 반별 최종급(등급) 분포(설계 §6.4 4번). 반은 응시 문서의 half */
function bandByHalf(resultsMap, attempts) {
  const out = { A: {}, B: {} };
  Object.keys(resultsMap || {}).forEach((sid) => {
    const r = resultsMap[sid];
    if (!r || !r.band) return;
    const h = ((attempts || {})[sid] || {}).half === "B" ? "B" : "A";
    out[h][r.band] = (out[h][r.band] || 0) + 1;
  });
  return out;
}

function Flag({ f }) {
  return <span className={"qt-flag qt-flag-" + f}>{FLAG_LABELS[f] || f}</span>;
}

/* ============================================================ 교사 패널 */

export function QuizPanel({ ids, roster, wsMap, cfgAll, sampleMode, onSaveCfg, onSel }) {
  const idsKey = (ids || []).join("|");
  const nickOf = (id) => ((roster || {})[id] || {}).nick || "";
  const wr = sampleMode ? "표본 학급" : undefined;   // 쓰기 버튼의 title

  /* ---- 표본 학급: 결정론적 자료로 모든 표를 채운다. 쓰기 버튼은 모두 잠근다 ---- */
  const sample = useMemo(() => (sampleMode ? buildSampleQuiz(ids || []) : null), [sampleMode, idsKey]);

  /* ---- 실시간 구독: 응시 컬렉션, 은행 공개부, 정답 키 ---- */
  const [liveAll, setLiveAll] = useState({});
  const [bankLive, setBankLive] = useState(null);
  const [keysLive, setKeysLive] = useState(null);
  const [apiErr, setApiErr] = useState("");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (sampleMode) return undefined;
    const missing = ["quizWatchAll", "quizAllServer", "quizPatch"].filter((k) => typeof fbStore[k] !== "function");
    if (missing.length) { setApiErr("fbStore." + missing.join("·") + "이(가) 아직 없습니다. src-fb.js를 갱신해야 실시간·재계산이 동작합니다."); }
    const offs = [
      fbStore.watchDoc("quizBank", (v) => setBankLive(v || null)),
      fbStore.watchDoc("quizKeys", (v) => setKeysLive(v || null)),
    ];
    if (typeof fbStore.quizWatchAll === "function") offs.push(fbStore.quizWatchAll((m) => setLiveAll(m || {})));
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => { clearInterval(tick); offs.forEach((f) => { try { if (typeof f === "function") f(); } catch (e) {} }); };
  }, [sampleMode]);

  const cfg = sampleMode ? quizCfg({ quiz: (sample && sample.cfg) || {} }) : quizCfg(cfgAll);
  const bank = sampleMode ? (sample && sample.bank) || null : bankLive;
  const keysDoc = sampleMode ? (sample && sample.keysDoc) || null : keysLive;
  /* attempts: { sid: v }, meta: { sid: { startedAtMs, hbMs, lockedAtMs } } */
  const { attempts, meta } = useMemo(() => {
    if (sampleMode) return { attempts: (sample && sample.attempts) || {}, meta: (sample && sample.meta) || {} };
    const a = {}, m = {};
    Object.keys(liveAll || {}).forEach((sid) => { const e = liveAll[sid]; if (!e || !e.v) return; a[sid] = e.v; m[sid] = { startedAtMs: e.startedAtMs, hbMs: e.hbMs, lockedAtMs: e.lockedAtMs }; });
    return { attempts: a, meta: m };
  }, [sampleMode, sample, liveAll]);
  const resultsMap = useMemo(() => {
    if (sampleMode) return (sample && sample.results) || {};
    const r = {};
    Object.keys(attempts).forEach((sid) => { if (attempts[sid] && attempts[sid].result) r[sid] = attempts[sid].result; });
    return r;
  }, [sampleMode, sample, attempts]);
  const nowMs = sampleMode ? (sample && sample.cfg ? Date.parse(sample.cfg.updatedAt) : now) : now;

  /* ---- 설정 편집: 키 입력마다 서버에 쓰지 않고 0.8초 쉬면 모아 보낸다 (AssessPanel과 같은 규약) ---- */
  const [draft, setDraft] = useState(null);
  const [saveSt, setSaveSt] = useState(null);    // null | saving | saved | err
  const pendingRef = useRef(null);
  const saveT = useRef(null);
  const onSaveRef = useRef(onSaveCfg);
  onSaveRef.current = onSaveCfg;
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  const live = draft ? { ...cfg, ...draft } : cfg;
  const lastPatchRef = useRef({});
  const flushPending = async () => {
    if (saveT.current) { clearTimeout(saveT.current); saveT.current = null; }
    const p = pendingRef.current;
    pendingRef.current = null;
    if (!p) return { pending: false, ok: true, clean: null };
    const clean = sanitize(p, { ...cfgRef.current, ...lastPatchRef.current });
    const ok = await onSaveRef.current(clean);
    setSaveSt(ok === false ? "err" : "saved");
    if (ok !== false) { lastPatchRef.current = { ...lastPatchRef.current, ...clean }; if (!saveT.current) setDraft(null); }
    else pendingRef.current = { ...p, ...(pendingRef.current || {}) };
    return { pending: true, ok: ok !== false, clean };
  };
  useEffect(() => {
    const lp = lastPatchRef.current;
    if (Object.keys(lp).every((k) => JSON.stringify(cfg[k]) === JSON.stringify(lp[k]))) lastPatchRef.current = {};
  }, [cfg]);
  const edit = (key, val) => {
    if (sampleMode) return;
    setDraft((d) => ({ ...(d || {}), [key]: val }));
    pendingRef.current = { ...(pendingRef.current || {}), [key]: val };
    setSaveSt("saving");
    if (saveT.current) clearTimeout(saveT.current);
    saveT.current = setTimeout(() => { saveT.current = null; flushPending(); }, 800);
  };
  useEffect(() => () => {
    if (saveT.current) clearTimeout(saveT.current);
    if (pendingRef.current) onSaveRef.current(sanitize(pendingRef.current, cfgRef.current));
  }, []);
  /* 예약된 편집을 먼저 내보낸 뒤 즉시 저장한다(단계·일시정지처럼 바로 나가야 하는 것) */
  const saveNow = async (patch) => {
    await flushPending();
    const ok = await onSaveRef.current(sanitize(patch, { ...cfgRef.current, ...lastPatchRef.current }));
    if (ok !== false) lastPatchRef.current = { ...lastPatchRef.current, ...patch };
    return ok !== false;
  };

  const [note, setNote] = useState(null);       // { kind: "ok" | "warn", text }
  const [stageBusy, setStageBusy] = useState(false);

  /* ---- 은행 상태 ---- */
  const bankOk = !!(bank && bank.ver);
  const bankMatch = bankOk && cfg.bankVer === bank.ver;
  const keysMatch = !!(keysDoc && bankOk && keysDoc.ver === bank.ver);

  /* ---- 단계 스위치 ---- */
  const setStage = async (k) => {
    if (sampleMode || stageBusy || k === cfg.stage) return;
    if (k === "published") { doPublish(); return; }
    let msg = STAGE_CONFIRM[k] || "단계를 바꿉니다.";
    if (k === "open") {
      if (!bankOk) msg += "\n\n주의: 올린 은행이 없습니다. 학생은 시작할 수 없습니다.";
      else if (!bankMatch) msg += "\n\n주의: 설정의 은행 버전(" + (cfg.bankVer || "없음") + ")과 올린 은행(" + bank.ver + ")이 다릅니다.";
      if (!String(live.seatGrid || "").trim()) msg += "\n\n주의: 좌석표가 없어 학번 홀짝으로 반을 나눕니다. 앞뒤좌우 이웃과 문항이 겹치지 않는다는 보장이 없습니다.";
      msg += "\n\n시작 마감: 열고 나서 " + Math.round(live.startDeadlineSec / 60) + "분.";
    }
    msg += "\n\n계속할까요?";
    if (!window.confirm(msg)) return;
    setStageBusy(true);
    const patch = k === "open" ? { stage: k, openedAtMs: Date.now(), paused: false, pausedAtMs: 0 } : { stage: k };
    const ok = await saveNow(patch);
    setNote(ok ? null : { kind: "warn", text: "단계를 저장하지 못했습니다. 연결을 확인하고 다시 누르세요." });
    setStageBusy(false);
  };
  const togglePause = async () => {
    if (sampleMode || stageBusy) return;
    const paused = !!cfg.paused;
    if (!window.confirm(paused
      ? "전체 일시정지를 풉니다. 멈춘 시간(" + Math.max(0, Math.round((Date.now() - (cfg.pausedAtMs || Date.now())) / 1000)) + "초)이 모든 학생의 남은 시간에 더해집니다. 계속할까요?"
      : "모든 학생의 화면을 멈춥니다. 정전·서버 장애 같은 때만 쓰고, 개별 학생은 실시간 표의 해제·시간 추가로 다룹니다. 계속할까요?")) return;
    setStageBusy(true);
    const patch = paused
      ? { paused: false, pausedAtMs: 0, pausedAccumSec: (Number(cfg.pausedAccumSec) || 0) + Math.max(0, Math.round((Date.now() - (cfg.pausedAtMs || Date.now())) / 1000)) }
      : { paused: true, pausedAtMs: Date.now() };
    const ok = await saveNow(patch);
    setNote(ok ? { kind: "ok", text: paused ? "재개했습니다." : "전체 일시정지 중입니다. 다시 누르면 재개됩니다." } : { kind: "warn", text: "일시정지 상태를 저장하지 못했습니다." });
    setStageBusy(false);
  };

  /* ---- 좌석표 ---- */
  const seat = useMemo(() => parseSeatGrid(live.seatGrid), [live.seatGrid]);
  const seatUnknown = (ids || []).filter((id) => !seat.pos[id]);
  const seatForeign = Object.keys(seat.pos).filter((id) => !(ids || []).includes(id));
  const halfLabel = (id) => { const h = halfOf(id, live); return h.half + (h.known ? "" : "?"); };

  /* ---- 학생별 배수·이미지 제외 ---- */
  const setMult = (id, v) => edit("timeMult", { ...(live.timeMult || {}), [id]: Number(v) });
  const setNoImg = (id, on) => edit("noImage", { ...(live.noImage || {}), [id]: !!on });
  /* ---- 비활성 문항 ---- */
  const [disInput, setDisInput] = useState("");
  const disabledList = Array.isArray(live.disabled) ? live.disabled : [];
  const setDisabled = (id, on) => {
    const cur = disabledList.filter((x) => x !== id);
    edit("disabled", on ? [...cur, id] : cur);
  };

  /* ---- 문항 은행 파일 ---- */
  const [bankFile, setBankFile] = useState(null);    // { name, data, report }
  const [bankBusy, setBankBusy] = useState(false);
  const [bankErr, setBankErr] = useState("");
  const onBankFile = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    setBankErr(""); setBankFile(null);
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const data = JSON.parse(String(rd.result));
        setBankFile({ name: f.name, data, report: validateBank(data) });
      } catch (err) { setBankErr("JSON을 읽지 못했습니다: " + ((err && err.message) || err)); }
    };
    rd.onerror = () => setBankErr("파일을 읽지 못했습니다.");
    rd.readAsText(f, "utf-8");
    e.target.value = "";
  };
  const uploadBank = async () => {
    if (sampleMode || bankBusy || !bankFile || !bankFile.report.ok) return;
    const started = Object.keys(attempts).length;
    let msg = "은행 「" + bankFile.data.ver + "」(" + (bankFile.data.items || []).length + "문항)을 올립니다.";
    if (bankOk && bank.ver !== bankFile.data.ver) msg += "\n\n지금 올라가 있는 은행(" + bank.ver + ")을 덮어씁니다.";
    if (started) msg += "\n\n주의: 응시 문서가 " + started + "건 있습니다. 은행이 바뀌면 이미 시작한 학생의 추출 재현·채점이 어긋납니다.";
    msg += "\n\n계속할까요?";
    if (!window.confirm(msg)) return;
    setBankBusy(true); setBankErr(""); setNote(null);
    let split;
    try { split = splitBank(bankFile.data); }
    catch (e) { setBankErr("은행을 나누지 못했습니다: " + ((e && e.message) || e)); setBankBusy(false); return; }
    const ok1 = await fbStore.setT("quizBank", split.pub, { timeout: 15000 });
    if (!ok1) { setBankErr("공개부(quizBank)를 저장하지 못했습니다. 연결을 확인하고 다시 누르세요."); setBankBusy(false); return; }
    const ok2 = await fbStore.setT("quizKeys", split.keys, { timeout: 15000 });
    if (!ok2) { setBankErr("정답부(quizKeys)를 저장하지 못했습니다. 공개부는 올라갔으니 같은 파일로 다시 누르세요."); setBankBusy(false); return; }
    const ok3 = await saveNow({ bankVer: split.pub.ver });
    setBankBusy(false);
    if (!ok3) { setBankErr("설정의 은행 버전을 저장하지 못했습니다. 잠시 뒤 다시 누르세요."); return; }
    setNote({ kind: "ok", text: "은행 「" + split.pub.ver + "」을 올렸습니다. 문항 " + split.pub.itemCount + "개, 연습 " + split.pub.practice.length + "개." });
    setBankFile(null);
  };
  /* 문항 열람 */
  const [fLevel, setFLevel] = useState("");
  const [fArea, setFArea] = useState("");
  const [fHalf, setFHalf] = useState("");
  const [fText, setFText] = useState("");
  const bankItems = useMemo(() => {
    const items = ((bank && bank.items) || []).slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const t = fText.trim().toLowerCase();
    return items.filter((it) => (!fLevel || String(it.level) === fLevel) && (!fArea || String(it.area) === fArea) && (!fHalf || it.half === fHalf)
      && (!t || String(it.id).toLowerCase().includes(t) || String(it.spec || "").toLowerCase().includes(t) || String(it.stem || "").toLowerCase().includes(t)));
  }, [bank, fLevel, fArea, fHalf, fText]);
  const answerOf = (id) => (keysDoc && keysDoc.items && keysDoc.items[id] ? keysDoc.items[id].answer : null);
  const exportReview = () => {
    if (!bank || !keysDoc) return;
    const head = ["item_id", "level", "area", "half", "spec", "stem", "a", "b", "c", "d", "answer", "expl", "src", "image", "neg", "disabled"];
    const rows = ((bank.items || []).slice().sort((a, b) => String(a.id).localeCompare(String(b.id)))).map((it) => {
      const kd = (keysDoc.items && keysDoc.items[it.id]) || {};
      const o = (k) => { const x = (it.options || []).find((p) => p.id === k); return x ? x.text : ""; };
      const src = kd.src ? [kd.src.lesson != null ? "L" + kd.src.lesson : "", kd.src.h || "", kd.src.quote || ""].filter(Boolean).join(" / ") : "";
      return [it.id, it.level, it.area, it.half, it.spec, it.stem, o("a"), o("b"), o("c"), o("d"), kd.answer, kd.expl, src, it.image ? it.image.src : "", it.neg ? 1 : 0, disabledList.includes(it.id) ? 1 : 0];
    });
    downloadCsv("쪽지시험_review" + (sampleMode ? "_표본" : "") + "_" + stamp() + ".csv", head, rows);
  };

  /* ---- 실시간 ---- */
  const rows = (ids || []).map((id) => {
    const v = attempts[id] || null, m = meta[id] || {};
    const st = statusOf(v);
    const ans = answeredOf(v);
    let remain = null;
    if (v && st !== "done" && Number.isFinite(m.startedAtMs)) {
      const at = st === "locked" ? lockedMsOf(v, m) : cfg.paused && cfg.pausedAtMs ? cfg.pausedAtMs : nowMs;
      remain = remainingSec({ nowMs: Number.isFinite(at) ? at : nowMs, startedAtMs: m.startedAtMs, cfg, v, sid: id });
    }
    const hbAge = Number.isFinite(m.hbMs) ? Math.max(0, Math.round((nowMs - m.hbMs) / 1000)) : null;
    const nEv = eventsOf(v).length;
    return {
      id, nick: nickOf(id), v, m, st, cur: v ? v.cur || 1 : null, ans, remain,
      warn: v ? Number(v.warn) || 0 : 0, lockN: v && v.lock ? Number(v.lock.count) || 0 : 0, shortBlur: countEv(v, "blur_short"), dup: countEv(v, "dup") > 0,
      nEv, capped: nEv >= MAX_EVENTS, reconnects: countEv(v, "reconnect"), resizes: countEv(v, "resize"),
      hbAge, stale: st === "running" && hbAge != null && hbAge > HB_STALE_SEC, half: v ? v.half : null,
    };
  });
  const nStarted = rows.filter((r) => r.v).length;
  const nRunning = rows.filter((r) => r.st === "running").length;
  const nDone = rows.filter((r) => r.st === "done").length;
  const nLocked = rows.filter((r) => r.st === "locked").length;

  const [rowBusy, setRowBusy] = useState("");
  const [keepMap, setKeepMap] = useState({});          // 해제 때 시간 보전 여부(기본 켬)
  const [rowAct, setRowAct] = useState(null);          // { sid, kind: "extra" | "resume", min, reason }
  /* 교사 쓰기는 hb(학생 심장박동)를 찍지 않는다(noHb). 찍으면 「끊김」 표시와 학생 화면의 중복 접속 판정이 어긋난다 */
  const patchV = async (sid, vPatch, opts) => {
    if (typeof fbStore.quizPatch !== "function") { setNote({ kind: "warn", text: "fbStore.quizPatch가 없어 저장할 수 없습니다." }); return false; }
    return fbStore.quizPatch(sid, vPatch, { noHb: true, ...(opts || {}) });
  };
  const doUnlock = async (r) => {
    if (sampleMode || rowBusy) return;
    const keep = keepMap[r.id] !== false;
    const lockedMs = lockedMsOf(r.v, r.m);
    // 멈춘 초 = 교사 브라우저 시각 − 잠근 서버 시각. 교사 시계가 크게 어긋나도 제한 시간(배수 최대 2) 밖의 값은 주지 않는다
    const add = keep && Number.isFinite(lockedMs) ? Math.min(cfg.durationSec * 2, Math.max(0, Math.round((Date.now() - lockedMs) / 1000))) : 0;
    if (!window.confirm(r.id + "의 잠금을 풉니다. " + (keep ? "멈춘 " + fmtMMSS(add) + "을 남은 시간에 더합니다(시간 보전)." : "시간을 보전하지 않습니다.") + " 계속할까요?")) return;
    setRowBusy(r.id);
    const ok = await patchV(r.id, { status: "running", pausedTotalSec: (Number(r.v.pausedTotalSec) || 0) + add }, { unlock: true });
    setRowBusy("");
    setNote(ok ? { kind: "ok", text: r.id + "의 잠금을 풀었습니다." + (add ? " 보전 " + fmtMMSS(add) + "." : "") } : { kind: "warn", text: "잠금을 풀지 못했습니다. 연결을 확인하세요." });
  };
  const doResetSess = async (r) => {
    if (sampleMode || rowBusy) return;
    if (!window.confirm(r.id + "의 접속 세션을 초기화합니다. 「다른 곳에서 응시 중」으로 막힌 학생이 다시 들어올 수 있게 됩니다. 계속할까요?")) return;
    setRowBusy(r.id);
    const ok = await patchV(r.id, { sess: null });
    setRowBusy("");
    setNote(ok ? { kind: "ok", text: r.id + "의 세션을 초기화했습니다." } : { kind: "warn", text: "세션을 초기화하지 못했습니다." });
  };
  const submitRowAct = async () => {
    if (!rowAct || sampleMode || rowBusy) return;
    const r = rows.find((x) => x.id === rowAct.sid);
    if (!r || !r.v) { setRowAct(null); return; }
    const min = clampInt(rowAct.min, 0, 60, 0);
    const reason = String(rowAct.reason || "").trim().slice(0, 120);
    if (rowAct.kind === "extra" && min <= 0) { setNote({ kind: "warn", text: "추가할 분을 1 이상 넣으세요." }); return; }
    const extraSec = (Number(r.v.extraSec) || 0) + min * 60;
    const extraReason = [r.v.extraReason, reason ? "+" + min + "분: " + reason : min ? "+" + min + "분" : ""].filter(Boolean).join(" / ").slice(0, 400);
    const msg = rowAct.kind === "extra"
      ? r.id + "에게 " + min + "분을 더합니다(누적 " + Math.round(extraSec / 60) + "분). 계속할까요?"
      : r.id + "의 응시를 다시 엽니다. 완료 표시가 풀리고 같은 문항·순서로 남은 블록을 이어 풉니다" + (min ? ". 잃은 시간 " + min + "분을 더합니다" : "") + ". 제출된 블록은 바뀌지 않습니다. 계속할까요?";
    if (!window.confirm(msg)) return;
    setRowBusy(r.id);
    const patch = rowAct.kind === "extra" ? { extraSec, extraReason } : { finishedAt: null, status: "running", resumeOk: true, extraSec, extraReason };
    const ok = await patchV(r.id, patch);
    setRowBusy("");
    if (ok) { setRowAct(null); setNote({ kind: "ok", text: r.id + (rowAct.kind === "extra" ? "에게 " + min + "분을 더했습니다." : "의 응시를 다시 열었습니다.") }); }
    else setNote({ kind: "warn", text: "저장하지 못했습니다. 연결을 확인하세요." });
  };

  /* ---- 결과: 재계산 ---- */
  const [calcBusy, setCalcBusy] = useState(false);
  const [calcProg, setCalcProg] = useState(null);   // { done, total, fail }
  const runRecompute = async () => {
    if (sampleMode || calcBusy) return;
    if (typeof fbStore.quizAllServer !== "function") { setNote({ kind: "warn", text: "fbStore.quizAllServer가 없어 재계산할 수 없습니다." }); return; }
    setCalcBusy(true); setNote(null); setCalcProg(null);
    const [all, bk, ks] = await Promise.all([fbStore.quizAllServer(), fbStore.get("quizBank"), fbStore.get("quizKeys")]);
    if (!all || !all.ok) { setNote({ kind: "warn", text: "응시 문서를 서버에서 읽지 못했습니다. 연결을 확인하고 다시 누르세요." }); setCalcBusy(false); return; }
    if (!bk || !ks) { setNote({ kind: "warn", text: "은행 또는 정답 키를 읽지 못했습니다. 문항 은행 카드에서 은행을 먼저 올리세요." }); setCalcBusy(false); return; }
    if (bk.ver !== ks.ver) { setNote({ kind: "warn", text: "은행(" + bk.ver + ")과 정답 키(" + ks.ver + ")의 버전이 다릅니다. 같은 파일로 은행을 다시 올리세요." }); setCalcBusy(false); return; }
    const data = all.data || {};
    const sids = Object.keys(data).filter((sid) => data[sid] && data[sid].v).sort();
    let fail = 0;
    setCalcProg({ done: 0, total: sids.length, fail: 0 });
    const at = nowISO();
    for (let i = 0; i < sids.length; i += 1) {
      const v = data[sids[i]].v;
      let result;
      try {
        const r = recompute({ attempt: v, bank: bk, keys: ks, corrections: ks.corrections || [], cfg, now: at });
        const prev = v.result || {};
        result = { ...r, published: !!prev.published, publishedAt: prev.publishedAt || null, items: resultItems({ attempt: v, bank: bk, keysDoc: ks, seed: v.seed }) };
      } catch (e) { console.error("recompute fail", sids[i], e); fail += 1; setCalcProg({ done: i + 1, total: sids.length, fail }); continue; }
      const ok = await patchV(sids[i], { result });
      if (!ok) fail += 1;
      setCalcProg({ done: i + 1, total: sids.length, fail });
    }
    setCalcBusy(false);
    setNote(fail ? { kind: "warn", text: fail + "명의 결과를 저장하지 못했습니다. 연결을 확인하고 재계산을 다시 실행하세요." }
      : { kind: "ok", text: sids.length + "명의 결과를 다시 계산해 저장했습니다." + (sids.length ? "" : " (응시 문서가 없습니다)") });
  };
  const [pubBusy, setPubBusy] = useState(false);
  const doPublish = async () => {
    if (sampleMode || pubBusy || stageBusy) return;
    const withRes = Object.keys(resultsMap);
    const noRes = Object.keys(attempts).filter((sid) => !resultsMap[sid]);
    const unpub = withRes.filter((sid) => !resultsMap[sid].published);
    // 이미 공개된 뒤에도 다시 누를 수 있다 — 별도 응시·재계산으로 뒤늦게 생긴 결과에 공개 표시를 쓰기 위해서다
    let msg = (cfg.stage === "published" ? "공개 표시를 다시 씁니다. 아직 공개 표시가 없는 결과 " + unpub.length + "건이 학생에게 보이게 됩니다." : STAGE_CONFIRM.published)
      + "\n\n결과가 있는 학생 " + withRes.length + "명에게 공개 표시를 씁니다.";
    if (noRes.length) msg += "\n\n주의: 응시했지만 결과가 없는 학생 " + noRes.length + "명(" + noRes.slice(0, 6).join(", ") + (noRes.length > 6 ? " 외" : "") + "). 먼저 「재계산」을 누르세요.";
    const mism = withRes.filter((sid) => (resultsMap[sid].flags || []).includes("mismatch"));
    if (mism.length) msg += "\n\n주의: 불일치 표시 학생 " + mism.length + "명(" + mism.join(", ") + "). 원응답을 먼저 확인하세요.";
    msg += "\n\n계속할까요?";
    if (!window.confirm(msg)) return;
    setPubBusy(true); setNote(null);
    const at = nowISO();
    let fail = 0;
    for (let i = 0; i < withRes.length; i += 1) {
      const ok = await patchV(withRes[i], { result: { published: true, publishedAt: at } });
      if (!ok) fail += 1;
    }
    const ok = cfg.stage === "published" ? true : await saveNow({ stage: "published" });
    setPubBusy(false);
    setNote(!ok || fail ? { kind: "warn", text: (fail ? fail + "명의 공개 표시를 저장하지 못했습니다. " : "") + (ok ? "" : "단계를 저장하지 못했습니다. ") + "다시 누르세요." }
      : { kind: "ok", text: "결과를 공개했습니다(" + withRes.length + "명). 학생 화면에 자기 결과가 보입니다." });
  };

  /* ---- 응시 기록표 ---- */
  const [sheetSid, setSheetSid] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const sheet = useMemo(() => {
    if (!sheetSid || !attempts[sheetSid]) return null;
    try { return recordSheet({ attempt: attempts[sheetSid], result: resultsMap[sheetSid] || null, keysDoc, bank }); }
    catch (e) { console.error("recordSheet fail", e); return null; }
  }, [sheetSid, attempts, resultsMap, keysDoc, bank]);
  const openSheet = (sid) => { setSheetSid(sid === sheetSid ? "" : sid); setNoteDraft((attempts[sid] && attempts[sid].note) || ""); };
  const toggleFalsePos = async (i) => {
    if (sampleMode || rowBusy || !sheetSid) return;
    const v = attempts[sheetSid];
    const cur = new Set((Array.isArray(v.falsePos) ? v.falsePos : []).map(Number));
    if (cur.has(i)) cur.delete(i); else cur.add(i);
    setRowBusy(sheetSid);
    const ok = await patchV(sheetSid, { falsePos: [...cur].sort((a, b) => a - b) });
    setRowBusy("");
    if (!ok) setNote({ kind: "warn", text: "오탐 표시를 저장하지 못했습니다." });
  };
  const saveNote = async () => {
    if (sampleMode || rowBusy || !sheetSid) return;
    setRowBusy(sheetSid);
    const ok = await patchV(sheetSid, { note: noteDraft.slice(0, 1000) });
    setRowBusy("");
    setNote(ok ? { kind: "ok", text: "메모를 저장했습니다." } : { kind: "warn", text: "메모를 저장하지 못했습니다." });
  };

  /* ---- 정정 ---- */
  const [corrId, setCorrId] = useState("");
  const [corrWhy, setCorrWhy] = useState("");
  const [corrBusy, setCorrBusy] = useState(false);
  const corrections = (keysDoc && Array.isArray(keysDoc.corrections)) ? keysDoc.corrections : [];
  const writeCorrections = async (list, okText) => {
    setCorrBusy(true);
    const ok = await fbStore.setT("quizKeys", { corrections: list }, { merge: true });
    setCorrBusy(false);
    setNote(ok ? { kind: "ok", text: okText + " 「재계산」을 눌러야 점수에 반영됩니다." } : { kind: "warn", text: "정정을 저장하지 못했습니다." });
    return ok;
  };
  const addCorrection = async () => {
    if (sampleMode || corrBusy || !keysDoc) return;
    const id = corrId.trim(), why = corrWhy.trim();
    if (!id || !(keysDoc.items && keysDoc.items[id])) { setNote({ kind: "warn", text: "은행에 없는 문항 id입니다: " + (id || "(빈칸)") }); return; }
    if (corrections.some((c) => c.itemId === id)) { setNote({ kind: "warn", text: id + "은(는) 이미 전원 정답 처리되어 있습니다." }); return; }
    if (!why) { setNote({ kind: "warn", text: "정정 사유를 적으세요. 응시 기록표와 이의 답변에 그대로 나옵니다." }); return; }
    if (!window.confirm(id + "을(를) 전원 정답 처리합니다. 실제 경로는 바뀌지 않고 c·F만 다시 세며, 이동이 유리해진 학생은 F에 한 급을 더합니다. 계속할까요?")) return;
    const ok = await writeCorrections([...corrections, { itemId: id, allCorrect: true, reason: why.slice(0, 300), at: nowISO() }], id + "을(를) 정정 목록에 넣었습니다.");
    if (ok) { setCorrId(""); setCorrWhy(""); }
  };
  const removeCorrection = async (id) => {
    if (sampleMode || corrBusy) return;
    if (!window.confirm(id + "의 정정을 취소합니다. 계속할까요?")) return;
    await writeCorrections(corrections.filter((c) => c.itemId !== id), id + "의 정정을 취소했습니다.");
  };

  /* ---- 통계 ---- */
  const stats = useMemo(() => {
    if (!bank || !keysDoc) return null;
    try { return itemStats({ attempts, keysDoc, bank }); } catch (e) { console.error("itemStats fail", e); return null; }
  }, [attempts, keysDoc, bank]);
  const twins = useMemo(() => (stats ? twinStats(stats) : []), [stats]);
  const mono = useMemo(() => (stats ? levelMonotonic(stats) : null), [stats]);
  const shiftCands = useMemo(() => levelShiftCandidates(stats, mono && mono.means), [stats, mono]);
  const moveCons = useMemo(() => moveConsistency(resultsMap, attempts), [resultsMap, attempts]);
  const bandHalves = useMemo(() => bandByHalf(resultsMap, attempts), [resultsMap, attempts]);
  const rel = useMemo(() => {
    if (!keysDoc) return null;
    try { return reliabilityStats({ attempts, keys: keysDoc, corrections: keysDoc.corrections || [], results: resultsMap }); }
    catch (e) { console.error("reliabilityStats fail", e); return null; }
  }, [attempts, keysDoc, resultsMap]);
  const [sLevel, setSLevel] = useState("");
  const [sArea, setSArea] = useState("");
  const [sFlagOnly, setSFlagOnly] = useState(false);
  const [twinAll, setTwinAll] = useState(false);
  const statRows = (stats || []).filter((s) => (!sLevel || String(s.level) === sLevel) && (!sArea || String(s.area) === sArea) && (!sFlagOnly || s.flags.some((f) => f !== "few")) && (s.n > 0 || !sFlagOnly));
  const seenStats = (stats || []).filter((s) => s.n > 0);

  /* ---- CSV: pid는 「연구」 탭과 같은 규칙 — 학번 정렬 순 P01… ---- */
  const pidMap = useMemo(() => {
    const m = new Map();
    (ids || []).slice().sort().forEach((id, i) => m.set(id, "P" + String(i + 1).padStart(2, "0")));
    return m;
  }, [idsKey]);
  const pidOf = (sid) => pidMap.get(sid) || "P--";
  const stamp = () => new Date().toISOString().slice(2, 10).replace(/-/g, "");
  const exportKind = (kind) => {
    let out;
    try {
      out = kind === "attempts" ? csvAttempts(attempts, resultsMap, pidOf)
        : kind === "responses" ? csvResponses(attempts, keysDoc, pidOf)
          : kind === "events" ? csvEvents(attempts, pidOf)
            : csvItems(stats || []);
    } catch (e) { setNote({ kind: "warn", text: "CSV를 만들지 못했습니다: " + ((e && e.message) || e) }); return; }
    if (!out || !out.head) { setNote({ kind: "warn", text: "내려받을 행이 없습니다." }); return; }
    downloadCsv("쪽지시험_" + kind + (sampleMode ? "_표본" : "") + "_" + stamp() + ".csv", out.head, out.rows || []);
  };

  /* ---- 표시용 ---- */
  const stageIdx = QUIZ_STAGES.findIndex((s) => s.k === cfg.stage);
  const stageCls = (k) => {
    if (k !== cfg.stage) return QUIZ_STAGES.findIndex((s) => s.k === k) < stageIdx ? "qt-past" : "";
    return k === "closed" ? "on-no" : k === "published" ? "on-ok" : "on-mid";
  };
  const Badge = saveSt ? (
    <span className="hint" role="status" aria-live="polite" style={{ marginLeft: 8, fontWeight: 400, color: saveSt === "err" ? "var(--seal)" : "var(--sub)" }}>
      {saveSt === "saving" ? "저장 중…" : saveSt === "err" ? "저장 실패. 잠시 뒤 다시 입력해 보세요" : "저장됨"}
    </span>
  ) : null;
  const deadlineLeft = cfg.stage === "open" && cfg.openedAtMs ? Math.round((cfg.openedAtMs + cfg.startDeadlineSec * 1000 - nowMs) / 1000) : null;
  const busyAny = rowBusy || calcBusy || pubBusy || stageBusy;

  if (!ids || !ids.length) {
    return <div className="card"><div className="card-body" style={{ color: "var(--sub)", fontSize: 13 }}>
      학생이 입장하면 쪽지시험 설정·은행·실시간 현황·결과가 여기에 나타납니다.
    </div></div>;
  }

  return (
    <div className="qt-panel">
      {apiErr && <div className="warn-note">{apiErr}</div>}
      {sampleMode && <div className="warn-note">예시 화면입니다. 표본 학급 자료로 표를 그리며 여기서는 아무것도 저장되지 않습니다.</div>}
      {note && <div className={note.kind === "warn" ? "warn-note" : "ok-note"} role={note.kind === "warn" ? "alert" : "status"}>{note.text}</div>}
      {cfg.paused && <div className="warn-note"><b>전체 일시정지 중</b> ({fmtT(new Date(cfg.pausedAtMs || 0).toISOString())}부터). 모든 학생 화면이 멈춰 있습니다. 설정 카드의 「재개」를 누르면 멈춘 시간이 보전됩니다.</div>}

      {/* ---------------- 카드 1 · 설정 ---------------- */}
      <div className="card qt-card">
        <div className="card-head"><span className="card-code">쪽지시험 1</span><span className="card-title">설정: 단계·시간·좌석표·학생별 조정</span>
          <span className="card-sess">{(QUIZ_STAGES.find((s) => s.k === cfg.stage) || {}).label || cfg.stage}{cfg.paused ? " · 일시정지" : ""}</span></div>
        <div className="card-note">
          단계는 학급 전체에 한꺼번에 적용됩니다. 순서는 은행 올리기 → 좌석표 → 열기(시작 마감 {Math.round(live.startDeadlineSec / 60)}분) → 실시간 순시 → 재계산 → 결과 공개입니다.
          개인 제한 시간 40분은 학생이 「시험 시작」을 누른 서버 시각부터 흐르며 설정으로 바꾸지 않습니다. 「전체 종료」 버튼은 없습니다(개인 타이머가 알아서 끝납니다).
        </div>
        <div className="card-body">
          <div className="seg qt-stage">
            {QUIZ_STAGES.map((s) => (
              <button key={s.k} type="button" className={stageCls(s.k)} disabled={sampleMode || stageBusy || pubBusy} title={wr}
                aria-pressed={s.k === cfg.stage} onClick={() => setStage(s.k)}>{s.label}</button>
            ))}
            <button type="button" className={"qt-pause " + (cfg.paused ? "on-no" : "")} disabled={sampleMode || stageBusy} title={wr} aria-pressed={!!cfg.paused} onClick={togglePause}>
              {cfg.paused ? "재개" : "전체 일시정지"}
            </button>
          </div>
          <p className="hint" style={{ marginTop: 6 }}>
            {cfg.stage === "open" && cfg.openedAtMs ? "연 시각 " + fmtT(new Date(cfg.openedAtMs).toISOString()) + " · 시작 마감까지 " + (deadlineLeft > 0 ? fmtMMSS(deadlineLeft) : "지남(새로 시작 불가)") + " · " : ""}
            은행: {bankOk ? bank.ver + " · " + (bank.itemCount || (bank.items || []).length) + "문항" + (bankMatch ? " · 설정과 일치" : " · 설정 bankVer(" + (cfg.bankVer || "없음") + ")과 다름") : "올린 은행 없음"}
            {" · 누적 전체 정지 " + fmtMMSS(cfg.pausedAccumSec || 0)}
          </p>

          <div className="sv-block-t">시간·경고{Badge}</div>
          <div className="qt-settings">
            <div className="field">
              <label>제한 시간</label>
              <input type="text" value="40분 (고정)" disabled readOnly />
            </div>
            <div className="field">
              <label>시작 마감(분, {DEADLINE_MIN[0]}~{DEADLINE_MIN[1]})</label>
              <input type="number" min={DEADLINE_MIN[0]} max={DEADLINE_MIN[1]} value={Math.round((live.startDeadlineSec || 0) / 60)} disabled={sampleMode}
                onChange={(e) => edit("startDeadlineSec", (parseInt(e.target.value, 10) || 0) * 60)} />
            </div>
            <div className="field">
              <label>경고 한도(회, {WARN_LIMIT[0]}~{WARN_LIMIT[1]}: 이 횟수에 잠김)</label>
              <input type="number" min={WARN_LIMIT[0]} max={WARN_LIMIT[1]} value={live.warnLimit} disabled={sampleMode} onChange={(e) => edit("warnLimit", e.target.value)} />
            </div>
            <div className="field">
              <label>제목(학생 화면)</label>
              <input type="text" value={live.title || ""} maxLength={80} disabled={sampleMode} onChange={(e) => edit("title", e.target.value)} />
            </div>
          </div>

          <div className="sv-block-t">좌석표 <span className="hint" style={{ fontWeight: 400 }}>(줄 = 행, 칸은 공백이나 쉼표로 구분, 빈자리는 -. 반 = (행+열) 홀짝이라 앞뒤좌우 이웃과 문항이 겹치지 않습니다)</span></div>
          <div className="qt-seatwrap">
            <div className="field qt-seatin">
              <label>학번 격자</label>
              <textarea rows={6} value={live.seatGrid || ""} disabled={sampleMode} spellCheck={false} placeholder={"20301 20302 20303 20304 20305\n20306 20307 - 20308 20309"} onChange={(e) => edit("seatGrid", e.target.value)} />
            </div>
            <div className="qt-seatprev" aria-label="좌석표 미리 보기">
              {seat.grid.length === 0 ? <div className="warn-note" style={{ marginBottom: 0 }}>좌석표 없음: 학번 홀짝으로 반을 나누므로 인접 회피가 보장되지 않습니다.</div> : (
                <table className="qt-seat"><tbody>
                  {seat.grid.map((row, r) => (
                    <tr key={r}>{row.map((sid, c) => {
                      const h = (r + c) % 2 === 0 ? "A" : "B";
                      const bad = sid && (!(ids || []).includes(sid) || seat.dup.includes(sid));
                      return <td key={c} className={sid ? "qt-seat-" + h + (bad ? " qt-seat-bad" : "") : "qt-seat-empty"} title={sid ? sid + " · " + h + "반" + (bad ? " · 명단에 없거나 겹침" : "") : "빈자리"}>
                        {sid ? <><span className="mono">{sid}</span><small>{h}</small></> : "·"}</td>;
                    })}</tr>
                  ))}
                </tbody></table>
              )}
              {seat.dup.length > 0 && <p className="hint qt-bad">겹치는 학번(첫 자리를 씁니다): {seat.dup.join(", ")}</p>}
              {seatForeign.length > 0 && <p className="hint qt-bad">명단에 없는 학번: {seatForeign.join(", ")}</p>}
              {seat.grid.length > 0 && seatUnknown.length > 0 && <p className="hint qt-bad">좌석표에 없는 학생(학번 홀짝으로 대신): {seatUnknown.join(", ")}</p>}
            </div>
          </div>

          <div className="sv-block-t">학생별 조정 <span className="hint" style={{ fontWeight: 400 }}>(시간 배수는 학습지원·특수교육 대상. 이미지 제외 학생은 이미지 문항을 늘 건너뜁니다. 줄을 누르면 학생 기록이 열립니다)</span></div>
          <div className="tbl-scroll">
            <table className="roster at-click qt-tbl">
              <thead><tr><th>학번</th><th>별명</th><th>반</th><th>좌석</th><th>시간 배수</th><th>이미지 제외</th></tr></thead>
              <tbody>
                {(ids || []).map((id) => {
                  const p = seat.pos[id];
                  return (
                    <tr key={id} onClick={() => onSel && onSel(id)}>
                      <td className="mono">{id}</td>
                      <td>{nickOf(id)}</td>
                      <td className="mono">{halfLabel(id)}</td>
                      <td className="mono">{p ? (p.r + 1) + "행 " + (p.c + 1) + "열" : "-"}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <select value={(live.timeMult || {})[id] || 1} disabled={sampleMode} aria-label={id + " 시간 배수"} onChange={(e) => setMult(id, e.target.value)}>
                          {MULTS.map((m) => <option key={m} value={m}>{m === 1 ? "1 (40분)" : m + " (" + Math.round(40 * m) + "분)"}</option>)}
                        </select>
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={!!(live.noImage || {})[id]} disabled={sampleMode} aria-label={id + " 이미지 문항 제외"} onChange={(e) => setNoImg(id, e.target.checked)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="sv-block-t">비활성 문항 <span className="hint" style={{ fontWeight: 400 }}>(추출에서 빼는 문항 id. 칸이 바닥나면 반대 반에서 채워집니다)</span></div>
          <div className="at-row">
            <input type="text" className="qt-in" value={disInput} placeholder="Q31A02, Q52B03" disabled={sampleMode} aria-label="비활성 문항 id" onChange={(e) => setDisInput(e.target.value)} />
            <button type="button" className="btn small" disabled={sampleMode || !cutIds(disInput).length} title={wr}
              onClick={() => { edit("disabled", [...new Set([...disabledList, ...cutIds(disInput)])]); setDisInput(""); }}>추가</button>
            {disabledList.length === 0 ? <span className="hint">없음</span> : disabledList.map((id) => (
              <span key={id} className="qt-chip"><span className="mono">{id}</span>
                <button type="button" className="qt-x" disabled={sampleMode} title={wr} aria-label={id + " 비활성 해제"} onClick={() => setDisabled(id, false)}>×</button></span>
            ))}
          </div>
        </div>
      </div>

      {/* ---------------- 카드 2 · 문항 은행 ---------------- */}
      <div className="card qt-card">
        <div className="card-head"><span className="card-code">쪽지시험 2</span><span className="card-title">문항 은행: 검증·올리기·열람</span>
          <span className="card-sess">{bankOk ? bank.ver : "은행 없음"}</span></div>
        <div className="card-note">
          quiz-bank/bank.json 을 고르면 검증 결과가 먼저 나옵니다. 오류가 없을 때만 올릴 수 있고, 공개부(문두·보기·정답 해시)는 quizBank/v1, 정답·해설·출처는 교사만 읽는 quizKeys/v1 로 나뉩니다.
          보기가 4개뿐이라 정답 해시는 비밀이 아니며 채점의 권위는 이 화면의 재계산에 있습니다.
        </div>
        <div className="card-body">
          <div className="at-row">
            <label className="btn small ghost qt-file">
              파일 고르기<input type="file" accept=".json,application/json" disabled={sampleMode} onChange={onBankFile} />
            </label>
            {bankFile && <span className="hint">{bankFile.name} · {(bankFile.data.items || []).length}문항 · ver {bankFile.data.ver || "(없음)"}</span>}
            <button type="button" className="btn small" disabled={sampleMode || bankBusy || !bankFile || !bankFile.report.ok} title={wr} onClick={uploadBank}>
              {bankBusy ? "올리는 중…" : "은행 올리기"}
            </button>
          </div>
          {bankErr && <div className="warn-note" role="alert">{bankErr}</div>}
          {bankFile && (
            <div className="qt-report">
              {bankFile.report.errors.length > 0 && (
                <div className="warn-note"><b>오류 {bankFile.report.errors.length}건. 고친 뒤 다시 고르세요.</b>
                  <ul className="at-errs">{bankFile.report.errors.slice(0, 40).map((e, i) => <li key={i}>{e}</li>)}{bankFile.report.errors.length > 40 && <li>… 외 {bankFile.report.errors.length - 40}건</li>}</ul>
                </div>
              )}
              {bankFile.report.warnings.length > 0 && (
                <details className="qt-details"><summary>경고 {bankFile.report.warnings.length}건 (올릴 수는 있습니다)</summary>
                  <ul className="at-errs">{bankFile.report.warnings.map((e, i) => <li key={i}>{e}</li>)}</ul>
                </details>
              )}
              {bankFile.report.ok && bankFile.report.warnings.length === 0 && <div className="ok-note">검증을 통과했습니다.</div>}
              <div className="tbl-scroll">
                <table className="roster qt-cells">
                  <thead><tr><th>급</th>{[1, 2, 3, 4].map((a) => <th key={a}>{AREA_MARK[a]} {AREAS[a]}</th>)}<th>계(A+B)</th></tr></thead>
                  <tbody>
                    {LEVELS.map((l) => {
                      let tot = 0;
                      return (
                        <tr key={l}><td className="mono">{l}급</td>
                          {[1, 2, 3, 4].map((a) => {
                            const need = CELL_MIN[l][a - 1];
                            const A = bankFile.report.cells.A[l + "-" + a] || 0, B = bankFile.report.cells.B[l + "-" + a] || 0;
                            tot += A + B;
                            return <td key={a} className="mono">
                              <span className={A < need ? "qt-bad" : ""}>A {A}/{need}</span> · <span className={B < need ? "qt-bad" : ""}>B {B}/{need}</span>
                            </td>;
                          })}
                          <td className="mono">{tot}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="hint">칸의 최소 수는 급별 최대 방문 블록 수 × 블록당 영역 문항 수(설계 §5.3)입니다. 모자란 칸이 있으면 최악 경로에서 문항이 반복될 수 있어 올리지 못합니다.</p>
            </div>
          )}

          <div className="sv-block-t">올린 은행</div>
          {!bankOk ? <p className="hint">아직 올린 은행이 없습니다.</p> : (
            <p className="hint">
              공개부 {bank.ver} · 문항 {bank.itemCount || (bank.items || []).length} · 연습 {(bank.practice || []).length} ·
              정답부 {keysDoc ? (keysMatch ? keysDoc.ver + " (일치)" : (keysDoc.ver || "?") + " (버전 불일치)") : "읽지 못함"} ·
              정정 {corrections.length}건 · 설정 bankVer {cfg.bankVer || "(없음)"}{bankMatch ? "" : " (불일치)"} · 비활성 {disabledList.length}
            </p>
          )}
          {bankOk && (
            <div>
              <div className="at-row">
                <select value={fLevel} aria-label="급 필터" onChange={(e) => setFLevel(e.target.value)}><option value="">급 전체</option>{LEVELS.map((l) => <option key={l} value={l}>{l}급</option>)}</select>
                <select value={fArea} aria-label="영역 필터" onChange={(e) => setFArea(e.target.value)}><option value="">영역 전체</option>{[1, 2, 3, 4].map((a) => <option key={a} value={a}>{AREA_MARK[a]} {AREAS[a]}</option>)}</select>
                <select value={fHalf} aria-label="반 필터" onChange={(e) => setFHalf(e.target.value)}><option value="">반 전체</option><option value="A">A반</option><option value="B">B반</option></select>
                <input type="text" className="qt-in" value={fText} placeholder="id·spec·문두 검색" aria-label="문항 검색" onChange={(e) => setFText(e.target.value)} />
                <span className="hint">{bankItems.length}문항</span>
                <button type="button" className="btn small ghost" disabled={!keysDoc} onClick={exportReview}>문항 검토표 CSV</button>
              </div>
              <div className="tbl-scroll qt-scroll">
                <table className="roster qt-tbl">
                  <thead><tr><th>id</th><th>spec</th><th>급</th><th>영역</th><th>반</th><th>문두</th><th>정답</th><th>이미지</th><th>비활성</th></tr></thead>
                  <tbody>
                    {bankItems.map((it) => {
                      const ans = answerOf(it.id);
                      const off = disabledList.includes(it.id);
                      return (
                        <tr key={it.id} className={off ? "qt-off" : ""}>
                          <td className="mono">{it.id}</td>
                          <td className="mono">{it.spec || "-"}</td>
                          <td className="mono">{it.level}</td>
                          <td>{AREA_MARK[it.area]}</td>
                          <td className="mono">{it.half}</td>
                          <td>{trunc(it.stem, 60)}{it.neg ? <span className="hint"> (부정)</span> : null}</td>
                          <td className="mono">{ans || <span className="hint">키 없음</span>}</td>
                          <td>{it.image ? "있음" : "-"}</td>
                          <td>
                            <button type="button" className={"btn small ghost" + (off ? " qt-btn-on" : "")} disabled={sampleMode} title={wr} aria-pressed={off} onClick={() => setDisabled(it.id, !off)}>{off ? "비활성" : "활성"}</button>
                          </td>
                        </tr>
                      );
                    })}
                    {bankItems.length === 0 && <tr><td colSpan={9} className="hint">조건에 맞는 문항이 없습니다.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ---------------- 카드 3 · 실시간 ---------------- */}
      <div className="card qt-card">
        <div className="card-head"><span className="card-code">쪽지시험 3</span><span className="card-title">실시간: 누가 어디까지, 무엇이 걸렸는가</span>
          <span className="card-sess">시작 {nStarted}/{ids.length} · 완료 {nDone}</span></div>
        <div className="card-note">
          빨간 칸(잠김·중복 접속·연결 끊김)으로 갑니다. 시스템은 기록하고 멈추고 교사를 부를 뿐 점수를 깎지 않습니다.
          해제할 때 「보전」이 켜져 있으면 잠겨 있던 시간이 남은 시간에 더해집니다. 부정으로 판단하면 끕니다.
        </div>
        <div className="card-body">
          <div className="kpis">
            <div className="kpi"><div className="n">{nStarted}<span className="at-of"> / {ids.length}</span></div><div className="l">시작</div></div>
            <div className="kpi"><div className="n">{nRunning}</div><div className="l">진행 중</div></div>
            <div className="kpi"><div className="n">{nDone}</div><div className="l">완료</div></div>
            <div className={"kpi" + (nLocked ? " qt-kpi-bad" : "")}><div className="n">{nLocked}</div><div className="l">잠김</div></div>
          </div>
          <div className="tbl-scroll">
            <table className="roster at-click qt-tbl qt-live">
              <thead><tr><th>학번</th><th>별명</th><th>반</th><th>상태</th><th>블록</th><th>답한 수</th><th>남은 시간</th><th>경고</th><th>잠금</th><th>짧은 이탈</th><th>심장박동</th><th>중복</th><th>기록</th><th>시작</th><th>조치</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={r.st === "locked" || r.dup ? "qt-row-bad" : r.stale ? "qt-row-warn" : ""} onClick={() => onSel && onSel(r.id)}>
                    <td className="mono">{r.id}</td>
                    <td>{r.nick}</td>
                    <td className="mono">{r.half || "-"}</td>
                    <td><span className={"qt-st qt-st-" + r.st}>{STATUS_LABEL[r.st]}</span>{r.v && r.v.resumeOk ? <span className="hint"> 재개</span> : null}</td>
                    <td className="mono">{r.v ? r.cur + "/" + BLOCKS : "-"}</td>
                    <td className="mono">{r.v ? r.ans.n + "/" + r.ans.of : "-"}</td>
                    <td className="mono">{r.remain == null ? "-" : (r.remain <= 0 ? "종료" : fmtMMSS(r.remain)) + (r.st === "locked" ? " (고정)" : cfg.paused ? " (정지)" : "")}</td>
                    <td className={"mono" + (r.warn ? " qt-warn" : "")}>{r.v ? r.warn + (cfg.warnLimit ? "/" + cfg.warnLimit : "") : "-"}</td>
                    <td className={"mono" + (r.lockN ? " qt-bad" : "")}>{r.v ? r.lockN : "-"}{r.lockN >= LOCK_INTERVENE ? <b className="qt-bad"> 감독 개입 필요</b> : null}</td>
                    <td className={"mono" + (r.shortBlur >= SHORT_BLUR_N ? " qt-warn" : "")}>{r.v ? r.shortBlur : "-"}{r.shortBlur >= SHORT_BLUR_N ? <span className="hint"> 반복</span> : null}</td>
                    <td className={"mono" + (r.stale ? " qt-bad" : "")}>{r.hbAge == null ? "-" : r.st === "done" ? "완료" : r.hbAge + "초 전" + (r.stale ? " (끊김)" : "")}</td>
                    <td className={r.dup ? "qt-bad" : ""}>{r.dup ? "있음" : "-"}</td>
                    <td className="mono">{!r.v ? "-" : <>{r.nEv}{r.capped ? <b className="qt-bad"> 상한</b> : null}{r.reconnects ? <span className="hint"> · 재접속 {r.reconnects}</span> : null}{r.resizes ? <span className="qt-warn"> · 도킹 의심</span> : null}</>}</td>
                    <td className="mono">{Number.isFinite(r.m.startedAtMs) ? fmtHMS(r.m.startedAtMs) : "-"}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {!r.v ? "-" : (
                        <div className="qt-acts">
                          {r.st === "locked" && (
                            <>
                              <label className="qt-keep"><input type="checkbox" checked={keepMap[r.id] !== false} disabled={sampleMode} onChange={(e) => setKeepMap((m) => ({ ...m, [r.id]: e.target.checked }))} />보전</label>
                              <button type="button" className="btn small" disabled={sampleMode || !!rowBusy} title={wr} onClick={() => doUnlock(r)}>{rowBusy === r.id ? "…" : "해제"}</button>
                            </>
                          )}
                          {r.st !== "done" && <button type="button" className="btn small ghost" disabled={sampleMode || !!rowBusy} title={wr} onClick={() => setRowAct({ sid: r.id, kind: "extra", min: "5", reason: "" })}>시간 추가</button>}
                          <button type="button" className="btn small ghost" disabled={sampleMode || !!rowBusy} title={wr} onClick={() => doResetSess(r)}>세션 초기화</button>
                          {r.st === "done" && <button type="button" className="btn small ghost" disabled={sampleMode || !!rowBusy} title={wr} onClick={() => setRowAct({ sid: r.id, kind: "resume", min: "0", reason: "" })}>재개 허용</button>}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rowAct && (
            <div className="qt-actform" role="group" aria-label={rowAct.kind === "extra" ? "시간 추가" : "재개 허용"}>
              <b>{rowAct.kind === "extra" ? "시간 추가" : "재개 허용"}: <span className="mono">{rowAct.sid}</span></b>
              <label>분 <input type="number" min={0} max={60} value={rowAct.min} onChange={(e) => setRowAct({ ...rowAct, min: e.target.value })} /></label>
              <label className="qt-grow">사유 <input type="text" maxLength={120} value={rowAct.reason} placeholder={rowAct.kind === "extra" ? "PC 고장으로 자리 이동" : "네트워크 끊김"} onChange={(e) => setRowAct({ ...rowAct, reason: e.target.value })} /></label>
              <button type="button" className="btn small" disabled={sampleMode || !!rowBusy} title={wr} onClick={submitRowAct}>저장</button>
              <button type="button" className="btn small ghost" onClick={() => setRowAct(null)}>취소</button>
            </div>
          )}
          <p className="hint">
            남은 시간 = 40분 × 배수 + 보전 + 추가 + 전체 정지 − 경과. 잠김·전체 정지 중에는 그 시점 값으로 고정해 보입니다. 심장박동은 학생 화면이 20초마다 보내며 {HB_STALE_SEC}초를 넘기면 연결 끊김으로 봅니다.
            「기록」은 이탈 이벤트 수이며 {MAX_EVENTS}건에 이르면 「상한」(그 뒤의 이벤트는 저장되지 않음), 창 크기가 화면의 90% 미만으로 줄면 「도킹 의심」, 잠금 {LOCK_INTERVENE}회부터 「감독 개입 필요」로 표시합니다.
            「세션 초기화」는 「다른 곳에서 응시 중」으로 막힌 학생을 풀어 주고, 「재개 허용」은 기술 장애로 완료 처리된 학생을 같은 문항으로 이어 풀게 합니다(사유를 남기세요).
          </p>
        </div>
      </div>

      {/* ---------------- 카드 4 · 결과 ---------------- */}
      <div className="card qt-card">
        <div className="card-head"><span className="card-code">쪽지시험 4</span><span className="card-title">결과: 재계산·표시·응시 기록표·공개</span>
          <span className="card-sess">{cfg.stage === "published" ? "공개됨" : "결과 " + Object.keys(resultsMap).length + "/" + nStarted}</span></div>
        <div className="card-note">
          학생 화면의 점수는 가채점입니다. 「재계산」이 원응답과 교사만 읽는 정답 키로 경로·F·c·점수를 다시 세고, seed로 추출을 재현해 기록과 대조합니다.
          표시는 표시일 뿐 점수를 바꾸지 않습니다. 표시된 학생은 응시 기록표에서 원응답을 먼저 열어 문항 오류를 확인합니다.
        </div>
        <div className="card-body">
          <div className="at-row">
            <button type="button" className="btn" disabled={sampleMode || calcBusy || pubBusy} title={wr} onClick={runRecompute}>
              {calcBusy ? "재계산 중… " + (calcProg ? calcProg.done + "/" + calcProg.total : "") : "재계산"}
            </button>
            <button type="button" className="btn" disabled={sampleMode || calcBusy || pubBusy || stageBusy || !Object.keys(resultsMap).length} title={wr} onClick={doPublish}>
              {pubBusy ? "공개 중…" : cfg.stage === "published" ? "공개 표시 다시 쓰기" : "결과 공개"}
            </button>
            {cfg.stage === "published" && Object.values(resultsMap).some((r) => !r.published) && <span className="hint qt-warn">공개 표시가 없는 결과 {Object.values(resultsMap).filter((r) => !r.published).length}건</span>}
            {calcProg && !calcBusy && <span className="hint">{calcProg.done}/{calcProg.total} 저장{calcProg.fail ? " · 실패 " + calcProg.fail : ""}</span>}
          </div>
          <div className="tbl-scroll">
            <table className="roster at-click qt-tbl qt-res">
              <thead><tr><th>학번</th><th>별명</th><th>경로</th><th>블록 정답</th><th>F</th><th>c</th><th>n</th><th>점수</th><th>등급</th><th>표시</th><th>경고/잠금</th><th>가채점</th><th>공개</th><th>기록표</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const res = resultsMap[r.id] || null;
                  const cs = r.v && r.v.clientScore;
                  const diff = res && cs && (cs.score !== res.score || cs.F !== res.F || cs.c !== res.c);
                  return (
                    <tr key={r.id} className={(res && (res.flags || []).includes("mismatch") ? "qt-row-bad " : "") + (sheetSid === r.id ? "qt-row-open" : "")} onClick={() => onSel && onSel(r.id)}>
                      <td className="mono">{r.id}</td>
                      <td>{r.nick}</td>
                      <td className="mono">{res ? (res.path || []).join("→") : r.v ? <span className="hint">미계산</span> : "-"}</td>
                      <td className="mono">{res ? (res.blockCorrect || []).map((c, i) => (r.v && r.v.blocks && r.v.blocks[String(i + 1)] ? c + "/5" : "·")).join(" ") : "-"}</td>
                      <td className="mono">{res ? res.F + (res.bonus ? "*" : "") : "-"}</td>
                      <td className="mono">{res ? res.c : "-"}</td>
                      <td className="mono">{res ? res.n : "-"}</td>
                      <td className="mono"><b>{res ? res.score : "-"}</b></td>
                      <td className="mono">{res ? res.band : "-"}</td>
                      <td className="qt-flags">
                        {res ? (res.flags || []).map((f) => <Flag key={f} f={f} />) : null}
                        {res && wilsonStraddle(res) ? <span className="qt-flag qt-flag-wilson" title="c/20의 Wilson 95% 구간이 자기 행의 점수 경계를 걸칩니다">Wilson 걸침</span> : null}
                        {res && res.mismatch && res.mismatch.detail ? <span className="hint qt-detail">{res.mismatch.detail}</span> : null}
                      </td>
                      <td className="mono">{r.v ? r.warn + "/" + r.lockN : "-"}</td>
                      <td className={"mono" + (diff ? " qt-bad" : "")}>{cs ? cs.score + "점" + (diff ? " (차이)" : "") : "-"}</td>
                      <td>{res ? (res.published ? "공개" : "-") : "-"}</td>
                      <td onClick={(e) => e.stopPropagation()}>
                        {r.v ? <button type="button" className={"btn small ghost" + (sheetSid === r.id ? " qt-btn-on" : "")} aria-expanded={sheetSid === r.id} onClick={() => openSheet(r.id)}>{sheetSid === r.id ? "닫기" : "기록표"}</button> : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="hint">
            F 옆의 *는 정정으로 이동이 유리해져 한 급을 더한 학생(설계 §4.6). 「가채점」은 학생 브라우저가 낸 점수이며 재계산과 다르면 「차이」로 표시합니다(정정이 있으면 달라지는 것이 정상).
            표시의 뜻: 경계 ①은 c가 자기 행의 점수 경계에서 ±1, 경계 ②는 어느 블록의 정답 수가 3 또는 4(한 문항 차이로 이동이 바뀜), 경계 ③은 미응답 있음, 경로 민감은 경계 ② 블록이 둘 이상, 불일치는 재계산·추출 재현이 기록과 다름(빨강), Wilson 걸침은 c/20의 95% 구간이 점수 경계를 걸침.
          </p>

          {sheetSid && !sheet && <div className="warn-note">응시 기록표를 만들지 못했습니다. 은행과 정답 키가 있어야 합니다.</div>}
          {sheet && (
            <div className="qt-sheet">
              <div className="qt-sheet-head">
                <div>
                  <b>응시 기록표</b> · <span className="mono">{sheetSid}</span> {nickOf(sheetSid)} · {cfg.title}
                  <div className="hint">
                    반 {sheet.summary.half || "-"} · seed <span className="mono">{sheet.summary.seed}</span> · 배수 {sheet.summary.timeMult} · 이미지 제외 {sheet.summary.noImage ? "예" : "아니요"} ·
                    시작 {Number.isFinite((meta[sheetSid] || {}).startedAtMs) ? fmtHMS(meta[sheetSid].startedAtMs) : "-"} · 완료 {sheet.summary.finishedAt ? fmtHMS(Date.parse(sheet.summary.finishedAt)) : "-"} ·
                    경고 {sheet.summary.warn} · 잠금 {sheet.summary.lockCount} · 보전 {fmtMMSS(sheet.summary.pausedTotalSec)} · 추가 {fmtMMSS(sheet.summary.extraSec)}{sheet.summary.extraReason ? " (" + sheet.summary.extraReason + ")" : ""} · 재접속 {sheet.summary.reconnects}
                  </div>
                </div>
                <div className="qt-noprint">
                  <button type="button" className="btn small ghost" onClick={() => window.print()}>인쇄</button>
                </div>
              </div>
              <div className="kpis qt-sheet-kpis">
                <div className="kpi"><div className="n">{sheet.summary.path.join("→")}</div><div className="l">급 경로</div></div>
                <div className="kpi"><div className="n">{sheet.summary.F}</div><div className="l">최종급 F</div></div>
                <div className="kpi"><div className="n">{sheet.summary.c}<span className="at-of"> / {BLOCKS * BLOCK_SIZE}</span></div><div className="l">총 정답 c</div></div>
                <div className="kpi"><div className="n">{sheet.summary.n}</div><div className="l">응답 수 n</div></div>
                <div className="kpi"><div className="n">{sheet.summary.score}<span className="at-of"> {sheet.summary.band}</span></div><div className="l">점수·등급</div></div>
              </div>
              <div className="qt-sheet-cols">
                <div className="tbl-scroll">
                  <table className="roster qt-tbl">
                    <thead><tr><th>블록</th><th>급</th><th>정답</th><th>응답</th><th>이동</th><th>제출</th></tr></thead>
                    <tbody>
                      {sheet.blocks.map((b) => (
                        <tr key={b.k}><td className="mono">{b.k}</td><td className="mono">{b.level}급</td><td className="mono">{b.correct}/5</td><td className="mono">{b.answered != null ? b.answered : "-"}</td>
                          <td>{b.move === "up" ? "상승" : b.move === "down" ? "하강" : "유지"}{b.k === BLOCKS ? " (최종)" : ""}</td>
                          <td className="mono">{b.at ? fmtHMS(Date.parse(b.at)) : "-"}{b.auto ? " 자동" : ""}{b.blockMs != null ? " · " + fmtMMSS(b.blockMs / 1000) : ""}</td></tr>
                      ))}
                      {sheet.blocks.length === 0 && <tr><td colSpan={6} className="hint">제출된 블록이 없습니다.</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className="tbl-scroll">
                  <table className="roster qt-tbl qt-score">
                    <thead><tr><th>F</th><th>c</th><th>점수</th><th>등급</th></tr></thead>
                    <tbody>
                      {SCORE_ROWS.map((row, i) => (
                        <tr key={i} className={sheet.summary.row === i ? "qt-row-me" : ""}><td className="mono">{row.F}</td><td className="mono">{row.cMin ? row.cMin + " 이상" : "제한 없음"}</td><td className="mono">{row.score}</td><td className="mono">{row.band}</td></tr>
                      ))}
                      <tr className={sheet.summary.row === -1 ? "qt-row-me" : ""}><td className="mono">-</td><td className="mono">n &lt; {MIN_ANSWERED}</td><td className="mono">2</td><td className="mono">E</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="tbl-scroll">
                <table className="roster qt-tbl">
                  <thead><tr><th>#</th><th>블록</th><th>급</th><th>영역</th><th>문항</th><th>고른 답</th><th>정답</th><th>정오</th><th>응답 시간</th></tr></thead>
                  <tbody>
                    {sheet.rows.map((x, i) => (
                      <tr key={x.k + "-" + x.i} className={x.correct ? "" : "qt-row-wrong"}>
                        <td className="mono">{i + 1}</td><td className="mono">{x.k}</td><td className="mono">{x.level}</td><td>{x.area ? AREA_MARK[x.area] : "-"}</td>
                        <td className="mono">{x.id}</td><td className="mono">{x.pick || "(빈칸)"}</td><td className="mono">{x.answer || "?"}</td>
                        <td>{x.correct ? "정답" : "오답"}{x.corrected ? " (전원 정답 처리)" : ""}</td><td className="mono">{x.pickMs != null ? sec(x.pickMs) : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="sv-block-t">이탈 기록 <span className="hint" style={{ fontWeight: 400 }}>(오탐 표시는 기록을 지우지 않고 그대로 남깁니다)</span></div>
              <div className="tbl-scroll">
                <table className="roster qt-tbl">
                  <thead><tr><th>#</th><th>시각</th><th>종류</th><th>지속</th><th>블록</th><th>문항</th><th>키·동작</th><th>경고</th><th>준비</th><th>오탐</th></tr></thead>
                  <tbody>
                    {sheet.events.map((e) => (
                      <tr key={e.i} className={e.falsePos ? "qt-row-fp" : ""}>
                        <td className="mono">{e.i + 1}</td><td className="mono">{e.t ? fmtHMS(Date.parse(e.t)) : "-"}</td><td className="mono">{e.type}{e.mlb ? " (마우스 이탈 뒤)" : ""}</td>
                        <td className="mono">{e.ms != null ? sec(e.ms) : "-"}</td><td className="mono">{e.block != null ? e.block : "-"}</td><td className="mono">{e.item != null ? e.item : "-"}</td>
                        <td className="mono">{e.key || e.action || "-"}</td><td className="mono">{e.warn != null ? e.warn : "-"}</td><td>{e.prep ? "준비 구간" : "-"}</td>
                        <td><input type="checkbox" checked={!!e.falsePos} disabled={sampleMode || !!rowBusy} aria-label={"이벤트 " + (e.i + 1) + " 오탐"} onChange={() => toggleFalsePos(e.i)} /></td>
                      </tr>
                    ))}
                    {sheet.events.length === 0 && <tr><td colSpan={10} className="hint">이탈 기록이 없습니다.</td></tr>}
                  </tbody>
                </table>
              </div>
              <div className="field qt-noprint" style={{ marginTop: 12 }}>
                <label>교사 메모 (응시 기록표에 함께 나옵니다)</label>
                <textarea rows={2} maxLength={1000} value={noteDraft} disabled={sampleMode} onChange={(e) => setNoteDraft(e.target.value)} />
                <div className="at-row" style={{ marginTop: 6 }}>
                  <button type="button" className="btn small" disabled={sampleMode || !!rowBusy || noteDraft === ((attempts[sheetSid] || {}).note || "")} title={wr} onClick={saveNote}>메모 저장</button>
                </div>
              </div>
              {(attempts[sheetSid] || {}).note ? <p className="qt-printnote"><b>교사 메모:</b> {attempts[sheetSid].note}</p> : null}
            </div>
          )}

          <div className="sv-block-t">문항 오류 정정 <span className="hint" style={{ fontWeight: 400 }}>(정답 둘·정답 없음·뜻이 바뀌는 오타가 확인된 문항은 전원 정답 처리. 산출식 자체는 바꾸지 않습니다)</span></div>
          <div className="at-row">
            <input type="text" className="qt-in" value={corrId} placeholder="문항 id (Q31A02)" disabled={sampleMode} aria-label="정정할 문항 id" onChange={(e) => setCorrId(e.target.value)} />
            <input type="text" className="qt-in qt-grow" value={corrWhy} placeholder="사유" maxLength={300} disabled={sampleMode} aria-label="정정 사유" onChange={(e) => setCorrWhy(e.target.value)} />
            <button type="button" className="btn small" disabled={sampleMode || corrBusy || !keysDoc} title={wr} onClick={addCorrection}>전원 정답 처리</button>
          </div>
          {corrections.length > 0 && (
            <ul className="at-errs qt-corr">
              {corrections.map((c, i) => (
                <li key={c.itemId + i}><span className="mono">{c.itemId}</span> · {c.reason} · {fmtT(c.at)}
                  <button type="button" className="qt-x" disabled={sampleMode || corrBusy} title={wr} aria-label={c.itemId + " 정정 취소"} onClick={() => removeCorrection(c.itemId)}>×</button></li>
              ))}
            </ul>
          )}

          <div className="sv-block-t">CSV: 연구 자료 네 파일</div>
          <div className="at-row">
            <button type="button" className="btn small ghost" disabled={!nStarted} onClick={() => exportKind("attempts")}>응시 CSV</button>
            <button type="button" className="btn small ghost" disabled={!nStarted || !keysDoc} onClick={() => exportKind("responses")}>응답 CSV</button>
            <button type="button" className="btn small ghost" disabled={!nStarted} onClick={() => exportKind("events")}>이벤트 CSV</button>
            <button type="button" className="btn small ghost" disabled={!stats} onClick={() => exportKind("items")}>문항 통계 CSV</button>
          </div>
          <p className="hint">
            파일 이름은 <span className="mono">쪽지시험_&lt;종류&gt;_&lt;yymmdd&gt;.csv</span>. 학번 대신 「연구」 탭과 같은 규칙의 익명 번호(학번 정렬 순 P01…)를 씁니다. 셀 앞의 <span className="mono">'</span>는 수식 주입을 막는 표시이니 그대로 두세요.
            응답 CSV는 한 행이 학생×문항이며 정오는 정정 전 정답 키로 셉니다(corrected 열 참고).
          </p>
        </div>
      </div>

      {/* ---------------- 카드 5 · 문항 통계 ---------------- */}
      <div className="card qt-card">
        <div className="card-head"><span className="card-code">쪽지시험 5</span><span className="card-title">문항 통계: 정답률·변별도·보기 분석</span>
          <span className="card-sess">노출 문항 {seenStats.length}</span></div>
        <div className="card-note">{RELIABILITY_NOTE}</div>
        <div className="card-body">
          {!stats ? <p className="hint">은행과 정답 키가 있어야 문항 통계를 냅니다.</p> : (
            <div>
              <div className="at-row">
                <select value={sLevel} aria-label="급 필터" onChange={(e) => setSLevel(e.target.value)}><option value="">급 전체</option>{LEVELS.map((l) => <option key={l} value={l}>{l}급</option>)}</select>
                <select value={sArea} aria-label="영역 필터" onChange={(e) => setSArea(e.target.value)}><option value="">영역 전체</option>{[1, 2, 3, 4].map((a) => <option key={a} value={a}>{AREA_MARK[a]} {AREAS[a]}</option>)}</select>
                <label className="qt-keep"><input type="checkbox" checked={sFlagOnly} onChange={(e) => setSFlagOnly(e.target.checked)} />표시된 문항만</label>
                <span className="hint">{statRows.length}문항 · 회색은 노출 {ITEM_STAT_MIN_N} 미만(해석 보류), 판정 표시는 노출 {ITEM_FLAG_MIN_N} 이상에서만</span>
              </div>
              <div className="tbl-scroll qt-scroll">
                <table className="roster qt-tbl">
                  <thead><tr><th>id</th><th>급</th><th>영역</th><th>반</th><th>n</th><th>p (Wilson 95%)</th><th>목표</th><th>r_pb</th><th>a</th><th>b</th><th>c</th><th>d</th><th>빈칸</th><th>중앙 초</th><th>표시</th></tr></thead>
                  <tbody>
                    {statRows.map((s) => (
                      <tr key={s.id} className={s.n < ITEM_STAT_MIN_N ? "qt-row-gray" : s.flags.includes("keyCheck") ? "qt-row-bad" : s.flags.length ? "qt-row-warn" : ""}>
                        <td className="mono">{s.id}</td><td className="mono">{s.level}</td><td>{s.area ? AREA_MARK[s.area] : "-"}</td><td className="mono">{s.half || "-"}</td>
                        <td className="mono">{s.n}</td><td className="mono">{s.n ? num(s.p) + " " + ci(s.ci) : "-"}</td>
                        <td className="mono">{LEVEL_TARGET_P[s.level] != null ? num(LEVEL_TARGET_P[s.level]) + " (" + num(LEVEL_P_RANGE[s.level][0]) + "~" + num(LEVEL_P_RANGE[s.level][1]) + ")" : "-"}</td>
                        <td className="mono">{num(s.rpb)}</td>
                        {["a", "b", "c", "d"].map((o) => <td key={o} className={"mono" + (s.answer === o ? " qt-ans" : "")}>{s.n ? pct(s.optShare[o]) : "-"}{s.topHalfWrong === o ? "!" : ""}</td>)}
                        <td className="mono">{s.n ? pct(s.blank) : "-"}</td><td className="mono">{s.medianMs != null ? sec(s.medianMs) : "-"}</td>
                        <td className="qt-flags">{s.flags.filter((f) => f !== "few").map((f) => <span key={f} className={"qt-flag qt-flag-" + f}>{ITEM_FLAG_LABELS[f] || f}</span>)}</td>
                      </tr>
                    ))}
                    {statRows.length === 0 && <tr><td colSpan={15} className="hint">조건에 맞는 문항이 없습니다.</td></tr>}
                  </tbody>
                </table>
              </div>
              <p className="hint">정답 보기는 굵게, !는 상위 절반 학생의 50% 이상이 고른 오답(정답 키 확인). r_pb는 문항 정오와 「총 정답 수에서 그 문항을 뺀 값」의 점이연 상관. 한 학급 자료로 문항을 삭제하거나 급을 옮기지 않습니다(누적 노출 30 이후 다음 해에).</p>

              <div className="sv-block-t">급 단조성 <span className="hint" style={{ fontWeight: 400 }}>(급별 평균 정답률이 1 &gt; 2 &gt; 3 &gt; 4 &gt; 5 인가)</span></div>
              <div className="kpis">
                {LEVELS.map((l) => (
                  <div key={l} className={"kpi" + (mono && mono.violations.some((p) => p.includes(l)) ? " qt-kpi-warn" : "")}>
                    <div className="n">{mono && mono.means[l] != null ? num(mono.means[l]) : "-"}</div>
                    <div className="l">{l}급 {LEVEL_NAMES[l]} · 목표 {num(LEVEL_TARGET_P[l])}</div>
                  </div>
                ))}
              </div>
              {mono && mono.violations.length > 0 && <p className="hint qt-bad">어긋나는 급 쌍: {mono.violations.map((p) => p[0] + "급 ≤ " + p[1] + "급").join(", ")}</p>}

              <div className="sv-block-t">급 오배정 의심 <span className="hint" style={{ fontWeight: 400 }}>(노출 {ITEM_FLAG_MIN_N} 이상이고 정답률이 한 급 위 평균보다 낮거나 한 급 아래 평균보다 높은 문항. 다음 해 급 이동 후보이며 올해 점수는 바꾸지 않습니다)</span></div>
              {shiftCands.length === 0 ? <p className="hint">해당 문항이 없습니다{seenStats.filter((s) => s.n >= ITEM_FLAG_MIN_N).length === 0 ? " (노출 " + ITEM_FLAG_MIN_N + " 이상인 문항이 아직 없습니다)" : ""}.</p> : (
                <div className="tbl-scroll qt-scroll">
                  <table className="roster qt-tbl">
                    <thead><tr><th>id</th><th>급</th><th>n</th><th>p</th><th>까닭</th></tr></thead>
                    <tbody>
                      {shiftCands.map((c) => <tr key={c.id} className="qt-row-warn"><td className="mono">{c.id}</td><td className="mono">{c.level}</td><td className="mono">{c.n}</td><td className="mono">{num(c.p)}</td><td>{c.why}</td></tr>)}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="sv-block-t">쌍둥이 불균형 <span className="hint" style={{ fontWeight: 400 }}>(같은 명세의 A·B 문항. 둘 다 노출 {ITEM_STAT_MIN_N} 이상이고 정답률 차 ≥ {TWIN_DIFF}이면 표시)</span></div>
              <div className="at-row">
                <label className="qt-keep"><input type="checkbox" checked={twinAll} onChange={(e) => setTwinAll(e.target.checked)} />전부 보기 ({twins.length}쌍)</label>
                <span className="hint">표시 {twins.filter((t) => t.flag).length}쌍</span>
              </div>
              <div className="tbl-scroll qt-scroll">
                <table className="roster qt-tbl">
                  <thead><tr><th>spec</th><th>A</th><th>p_A (n)</th><th>B</th><th>p_B (n)</th><th>차</th></tr></thead>
                  <tbody>
                    {twins.filter((t) => twinAll || t.flag).map((t) => (
                      <tr key={t.spec} className={t.flag ? "qt-row-warn" : ""}>
                        <td className="mono">{t.spec}</td>
                        <td className="mono">{t.a ? t.a.id : "-"}</td><td className="mono">{t.a && t.a.p != null ? num(t.a.p) + " (" + t.a.n + ")" : "-"}</td>
                        <td className="mono">{t.b ? t.b.id : "-"}</td><td className="mono">{t.b && t.b.p != null ? num(t.b.p) + " (" + t.b.n + ")" : "-"}</td>
                        <td className="mono">{t.diff != null ? num(t.diff) : "-"}</td>
                      </tr>
                    ))}
                    {twins.filter((t) => twinAll || t.flag).length === 0 && <tr><td colSpan={6} className="hint">{twinAll ? "쌍둥이 명세가 없습니다." : "표시된 쌍이 없습니다."}</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ---------------- 카드 6 · 신뢰도 ---------------- */}
      <div className="card qt-card">
        <div className="card-head"><span className="card-code">쪽지시험 6</span><span className="card-title">신뢰도: 기술 통계로만</span></div>
        <div className="card-note">계수 하나로 요약할 수 없는 적응형·25명 자료라 참고값만 냅니다. 의사결정에 직접 쓰지 않습니다.</div>
        <div className="card-body">
          {!rel ? <p className="hint">정답 키가 있어야 냅니다.</p> : (
            <div>
              <div className="kpis">
                <div className="kpi"><div className="n">{num(rel.block1.kr20)}</div><div className="l">블록 1(전원 3급) KR-20 근사 · n {rel.block1.n} · 평균 정답률 {num(rel.block1.mean)}</div></div>
                <div className="kpi"><div className="n">{pct(rel.routingConsistent.rate)}</div><div className="l">라우팅 일관성 (블록 4 규칙을 한 번 더 적용한 급 = F) · n {rel.routingConsistent.n}</div></div>
                <div className="kpi"><div className="n">{pct(rel.boundarySensitive.rate)}</div><div className="l">경계 민감도 (문항 하나가 뒤집히면 점수가 바뀌는 학생) · n {rel.boundarySensitive.n}</div></div>
                <div className={"kpi" + (rel.halves.flag ? " qt-kpi-warn" : "")}><div className="n">{num(rel.halves.A.mean, 1)} / {num(rel.halves.B.mean, 1)}</div><div className="l">A·B 반 평균 점수 (n {rel.halves.A.n}·{rel.halves.B.n}) · 차 {num(rel.halves.diff, 1)}{rel.halves.flag ? " · 반 불균형 의심" : ""}</div></div>
                <div className={"kpi" + (moveCons.ok === false ? " qt-kpi-warn" : "")}><div className="n">{pct(moveCons.up.mean)} / {pct(moveCons.stay.mean)}</div><div className="l">이동 일관성: 상승 뒤 다음 블록 정답률 / 유지 뒤 (n {moveCons.up.n}·{moveCons.stay.n}){moveCons.ok === false ? " · 상승 뒤가 더 높음(급이 더 어렵지 않았음)" : ""} · 하강 뒤 {pct(moveCons.down.mean)} (n {moveCons.down.n})</div></div>
              </div>
              <div className="tbl-scroll">
                <table className="roster qt-tbl qt-score">
                  <caption>A·B 반별 등급 분포 (반 불균형은 12~13명씩이라 1점 이상 차이만 봅니다)</caption>
                  <thead><tr><th>반</th>{["A", "B", "C", "D", "E"].map((b) => <th key={b}>{b}</th>)}<th>계</th></tr></thead>
                  <tbody>
                    {["A", "B"].map((h) => {
                      const d = bandHalves[h] || {};
                      const tot = Object.values(d).reduce((a, b) => a + b, 0);
                      return <tr key={h}><td className="mono">{h}반</td>{["A", "B", "C", "D", "E"].map((b) => <td key={b} className="mono">{d[b] || 0}</td>)}<td className="mono">{tot}</td></tr>;
                    })}
                  </tbody>
                </table>
              </div>
              <p className="hint">{rel.note}</p>
              <p className="hint">블록 1 KR-20은 학생마다 문항이 달라 정답률로 Σpq를 근사한 참고값입니다. 경계 민감도는 같은 F에서 c ± 1, 마지막 블록 2·3개, 앞 블록 3·4개 가운데 하나라도 해당하는 학생의 비율입니다. 등급 분포·이동 일관성은 「재계산」으로 저장된 결과를 기준으로 합니다.</p>
            </div>
          )}
        </div>
      </div>

      {/* ---------------- 카드 7 · 설계 근거 ---------------- */}
      <div className="card qt-card">
        <div className="card-head"><span className="card-code">쪽지시험 7</span><span className="card-title">설계 근거: 규칙·점수표·급·시간</span></div>
        <div className="card-note">학생·학부모에게 그대로 보여 주는 다섯 문장과 산출표입니다. 자세한 근거와 바꾼 점은 저장소의 쪽지시험_구현_근거.md 에 있습니다.</div>
        <div className="card-body qt-design">
          <ol className="qt-rules">{RULE_SENTENCES.map((s, i) => <li key={i}>{s}</li>)}</ol>
          <div className="qt-design-cols">
            <div className="tbl-scroll">
              <table className="roster qt-tbl qt-score">
                <caption>점수표</caption>
                <thead><tr><th>F</th><th>c</th><th>점수</th><th>등급</th></tr></thead>
                <tbody>
                  {SCORE_ROWS.map((row, i) => <tr key={i}><td className="mono">{row.F}</td><td className="mono">{row.cMin ? row.cMin + " 이상" : "제한 없음"}</td><td className="mono">{row.score}</td><td className="mono">{row.band}</td></tr>)}
                  <tr><td className="mono">-</td><td className="mono">n &lt; {MIN_ANSWERED}</td><td className="mono">2</td><td className="mono">E</td></tr>
                </tbody>
              </table>
            </div>
            <div className="tbl-scroll">
              <table className="roster qt-tbl">
                <caption>급 정의와 블록 구성</caption>
                <thead><tr><th>급</th><th>교사 기준</th><th>인지 수준</th><th>①②③④</th><th>목표 p</th><th>문항당</th></tr></thead>
                <tbody>
                  {LEVELS.map((l) => <tr key={l}><td className="mono">{l}</td><td>{LEVEL_WORDS[l]}</td><td>{LEVEL_NAMES[l]}</td><td className="mono">{AREA_MIX[l].join("·")}</td><td className="mono">{num(LEVEL_TARGET_P[l])}</td><td className="mono">{LEVEL_SEC[l]}초</td></tr>)}
                </tbody>
              </table>
            </div>
          </div>
          <p className="hint">
            시간표: 개인 타이머 40분, 최장 경로 3→4→5→5가 33분 20초. 학생 화면의 권장 종료는 블록 번호 기준 {BLOCK_END_MIN.map((m, i) => "블록 " + (i + 1) + " " + m + "분").join(" · ")}(급을 드러내지 않기 위해 누적으로 보입니다).
            라우팅 4/3/2: 순수 추측(p=.25)이 한 블록에서 오를 확률 1.6%. 5급 최종급이면 구조상 c ≥ 14. 영역: {[1, 2, 3, 4].map((a) => AREA_MARK[a] + " " + AREAS[a]).join(" · ")}.
          </p>
          <details className="qt-details"><summary>경계 사례 11개 (학생에게 보여 줄 표. 「나」와 「가」가 도달과 유지의 차이를, 「라」가 총 정답 수가 같아도 마지막 급이 다르면 점수가 다름을 보입니다)</summary>
            <div className="tbl-scroll">
              <table className="roster qt-tbl">
                <thead><tr><th>사례</th><th>블록 1(3급)</th><th>블록 2</th><th>블록 3</th><th>블록 4</th><th>F</th><th>c</th><th>n</th><th>점수</th><th>설명</th></tr></thead>
                <tbody>{BOUNDARY_CASES.map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i} className={i >= 5 && i <= 8 ? "mono" : ""}>{i === 8 ? <b>{c}</b> : c}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </details>
          <details className="qt-details"><summary>당일 운영 점검표</summary>
            <ol className="qt-rules">{CHECKLIST.map((s, i) => <li key={i}>{s}</li>)}</ol>
          </details>
          <details className="qt-details"><summary>참고 문헌 (확인된 것만)</summary>
            <ul className="at-errs">{REFS.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </details>
        </div>
      </div>
    </div>
  );
}

/* ---------- 스타일 ---------- */

const QUIZ_TEACHER_CSS = `
.qt-card{border-top:3px solid var(--amber-fill)}
.qt-stage{flex-wrap:wrap}
.qt-stage button{padding:7px 14px;font-size:13px}
.qt-stage button.qt-past{color:var(--sub);background:var(--card2)}
.qt-stage .qt-pause{margin-left:auto;border-color:var(--seal);color:var(--seal)}
.qt-stage .qt-pause.on-no{color:#fff}
.qt-settings{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px 14px;margin-bottom:12px}
.qt-settings .field{margin-bottom:0}
.qt-settings .field input{padding:7px 9px;font-size:13px}
.qt-seatwrap{display:grid;grid-template-columns:minmax(220px,1fr) 2fr;gap:14px;margin-bottom:12px}
.qt-seatin textarea{font-family:var(--mono);font-size:12px;resize:vertical}
.qt-seat{border-collapse:separate;border-spacing:3px}
.qt-seat td{border:1px solid var(--line);padding:4px 6px;font-size:11px;text-align:center;min-width:52px;line-height:1.3}
.qt-seat td small{display:block;font-size:10px;color:var(--sub)}
.qt-seat .qt-seat-A{background:var(--patina-bg);border-color:var(--patina)}
.qt-seat .qt-seat-B{background:#FBF6E9;border-color:var(--amber)}
.qt-seat .qt-seat-bad{border:2px solid var(--seal)}
.qt-seat .qt-seat-empty{color:var(--sub);border-style:dashed}
.qt-tbl td,.qt-tbl th{white-space:nowrap}
.qt-tbl td select,.qt-tbl td input[type=text]{padding:4px 6px;font-size:12px;border:1px solid var(--line);font-family:var(--sans)}
.qt-scroll{max-height:420px;overflow:auto;border:1px solid var(--line2)}
.qt-scroll thead th{position:sticky;top:0;z-index:1}
.qt-in{padding:6px 9px;border:1px solid var(--line);font-size:13px;font-family:var(--sans);min-width:160px}
.qt-grow{flex:1 1 200px}
.qt-grow input{width:100%}
.qt-chip{display:inline-flex;align-items:center;gap:4px;border:1px solid var(--line);padding:2px 6px;font-size:12px;background:var(--card2)}
.qt-x{border:none;background:transparent;cursor:pointer;font-size:14px;line-height:1;padding:0 3px;color:var(--sub)}
.qt-x:hover{color:var(--seal)}
.qt-x:disabled{opacity:.4;cursor:default}
.qt-file{position:relative;overflow:hidden;cursor:pointer}
.qt-file input{position:absolute;inset:0;opacity:0;cursor:pointer}
.qt-report{margin:8px 0 4px}
.qt-details{margin:6px 0 10px;font-size:12.5px}
.qt-details summary{cursor:pointer;color:var(--sub)}
.qt-cells td{font-size:12px}
.qt-bad{color:var(--seal);font-weight:500}
.qt-warn{color:var(--amber);font-weight:500}
.qt-ans{font-weight:700}
.qt-off td{color:var(--sub);text-decoration:line-through}
.qt-off td:last-child{text-decoration:none}
.qt-btn-on{background:var(--ink);color:var(--card)}
.qt-row-bad td{background:var(--seal-bg)}
.qt-row-warn td{background:#FBF6E9}
.qt-row-gray td{color:var(--sub)}
.qt-row-open td{background:var(--card2)}
.qt-row-me td{background:var(--patina-bg);font-weight:700}
.qt-row-wrong td{color:var(--seal)}
.qt-row-fp td{color:var(--sub);text-decoration:line-through}
.qt-row-fp td:last-child{text-decoration:none}
.at-click tbody tr.qt-row-bad:hover td{background:var(--seal-bg)}
.qt-st{display:inline-block;padding:1px 6px;border:1px solid var(--line);font-size:12px}
.qt-st-running{border-color:var(--patina);color:var(--patina)}
.qt-st-locked{border-color:var(--seal);color:var(--seal);font-weight:700}
.qt-st-done{border-color:var(--ink)}
.qt-st-none{color:var(--sub)}
.qt-kpi-bad{border-color:var(--seal);box-shadow:inset 3px 0 0 var(--seal)}
.qt-kpi-warn{border-color:var(--amber);box-shadow:inset 3px 0 0 var(--amber)}
.qt-acts{display:flex;gap:4px;align-items:center;flex-wrap:wrap}
.qt-keep{display:inline-flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;white-space:nowrap}
.qt-keep input{margin:0}
.qt-actform{display:flex;gap:10px;align-items:center;flex-wrap:wrap;border:1px solid var(--line);background:var(--card2);padding:10px 12px;margin:10px 0;font-size:13px}
.qt-actform label{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--sub)}
.qt-actform input{padding:5px 8px;border:1px solid var(--line);font-size:13px;font-family:var(--sans)}
.qt-actform input[type=number]{width:64px}
.qt-flags{white-space:normal;min-width:160px}
.qt-flag{display:inline-block;margin:1px 3px 1px 0;padding:0 6px;border:1px solid var(--line);font-size:11px;line-height:1.7}
.qt-flag-mismatch,.qt-flag-keyCheck{border-color:var(--seal);color:var(--seal);font-weight:700}
.qt-flag-dup,.qt-flag-shortBlur,.qt-flag-incomplete,.qt-flag-levelCheck,.qt-flag-lowDisc{border-color:var(--amber);color:var(--amber)}
.qt-flag-pathSensitive{border-color:var(--ink)}
.qt-flag-wilson{border-style:dashed;color:var(--sub)}
/* .at-row·.at-errs·.at-of·.at-click 는 상호평가 패널의 스타일(AssessTeacherStyle)과 같은 이름이다.
   그 스타일이 함께 실리지 않아도 이 패널이 무너지지 않도록 같은 규칙을 .qt-panel 아래에 한 번 더 둔다 */
.qt-panel .at-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px}
.qt-panel .at-errs{margin:6px 0 0 18px;padding:0}
.qt-panel .at-errs li{margin:2px 0}
.qt-panel .at-of{font-size:15px;color:var(--sub);font-weight:400}
.qt-panel .at-click tbody tr{cursor:pointer}
.qt-panel .at-click tbody tr:hover td{background:var(--card2)}
.qt-detail{display:block;white-space:normal;max-width:320px}
.qt-corr li{margin:3px 0}
.qt-sheet{border:1px solid var(--line);padding:14px 16px;margin:12px 0;background:var(--card)}
.qt-sheet-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-bottom:10px}
.qt-sheet-kpis{grid-template-columns:repeat(auto-fit,minmax(120px,1fr));margin-bottom:12px}
.qt-sheet-kpis .n{font-size:20px}
.qt-sheet-cols,.qt-design-cols{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
.qt-score td{padding:5px 8px}
.qt-printnote{font-size:13px;margin:8px 0 0}
.qt-rules{margin:0 0 12px 18px;padding:0;font-size:13.5px;line-height:1.7}
.qt-rules li{margin:3px 0}
.qt-design caption{caption-side:top;text-align:left;font-size:12px;color:var(--sub);padding:2px 0 4px}
.qt-panel .btn:disabled,.qt-panel .seg button:disabled{opacity:.45;cursor:default}
@media print{
  body *{visibility:hidden}
  .qt-sheet,.qt-sheet *{visibility:visible}
  .qt-sheet{position:absolute;left:0;top:0;width:100%;border:none;margin:0;padding:0}
  .qt-noprint{display:none!important}
  .qt-scroll{max-height:none;overflow:visible}
}
@media (pointer:coarse){.qt-panel .btn,.qt-stage button,.qt-x{min-height:40px}}
@media (max-width:640px){
  .qt-settings{grid-template-columns:1fr 1fr}
  .qt-stage button{flex:1 1 30%}
  .qt-stage .qt-pause{margin-left:0}
  .qt-seatwrap,.qt-sheet-cols,.qt-design-cols{grid-template-columns:1fr}
}
`;

export function QuizTeacherStyle() { return <style>{QUIZ_TEACHER_CSS}</style>; }
