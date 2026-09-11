/* ============================================================
   상호평가(쌍대비교) — 교사 화면 「상호평가」 탭

   학급 전체를 한 라디오로 움직이는 단계 스위치, 비교 명단 확정, 진행 현황,
   브래들리–테리 집계와 품질 지표, 연구용 CSV 네 가지를 다섯 장의 카드에 둔다.
   (최종작품_상호평가_설계.md §3.4·§6·§7·§8, pairwise-research/research-design.md §4.5·§9)

   이 파일은 계산을 하지 않는다 — 배정·점수·신뢰도·CSV 행은 모두 src-assess-core.mjs가
   만들고, 여기서는 부르고 보여 주고 저장할 뿐이다. src-app.jsx를 import하지 않는다(순환).

   저장 규약
   - 단계·설정은 onSaveCfg(patch) 한 길로만 나간다. 메인 세션이 { peer: {...} }만 merge로 쓴다.
   - 명단은 meta/peerRoster 한 문서로 굳힌다 — 명단이 실시간으로 바뀌면 학생마다 다른 쌍을
     보게 되어 노출 균형이 깨지고 점수를 견줄 수 없게 된다(설계 §4.3).
   - 집계 결과는 assess/{학번}.result 에 merge로 쓴다. 학생의 self·judge 블록은 건드리지 않는다.
   ============================================================ */

import React, { useState, useEffect, useRef, useMemo } from "react";
import { fbStore } from "./src-fb.js";
import {
  STAGES, STAGE_ORDER, TAG_OPTIONS, ROSTER_VER, FAST_MS, INFIT_BAND, QUALITY_MIN, K_FLOOR,
  peerCfg, subReady, makePlan, aggregate, judgeBlockOf,
  csvSubmissions, csvJudgements, csvSelf, csvScores, csvJudges, buildSampleAssess, fmtNum,
} from "./src-assess-core.mjs";

const SPLIT_REPS = 25;          // 반분 신뢰도 반복 수 — 교사 브라우저에서 몇 초 안에 끝나는 크기
/* 두 층의 기준을 구분해 보여 준다 — 공개 보류 권고(QUALITY_MIN, core가 ok/reasons를 만든다)와
   논문 채택 기준(research-design.md §4.5: SSR ≥ .80, 반분 중앙값 ≥ .70). 사이 값은 색 없이 둔다 */
const SSR_ADOPT = QUALITY_MIN.ssrAdopt;
const SPLIT_ADOPT = QUALITY_MIN.splitHalf;
const FAST_SEC = Math.round(FAST_MS / 1000);
const K_MIN = K_FLOOR, K_MAX = 30;   // 작품당 20회 노출(k≥10)이 SSR .80의 계획 기준 — 작품이 적으면 core가 n−1로 자른다

/* 단계를 바꾸기 전에 띄우는 확인 문장 — 학생 화면에 무엇이 나타나는지를 말한다 */
const STAGE_CONFIRM = {
  closed: "「닫힘」으로 바꿉니다. 학생 화면에서 상호평가가 사라지고 어떤 단계도 진행할 수 없게 됩니다.",
  submit: "「제출」 단계로 바꿉니다. 학생은 기록지의 최종 작품(대표 이미지·작품 캡션·작가 노트)을 확인하고 제출을 확정합니다. 확정한 제출은 학생이 고칠 수 없습니다.",
  self1: "「자기평가 ①」 단계로 바꿉니다. 학생은 자기 작품을 다섯 문항으로 평정하고 학급 안 등수를 예측합니다. 작품 제출은 이 시점에 닫힙니다.",
  peer: "「동료 비교」 단계로 바꿉니다. 학생은 확정된 명단에서 배정된 쌍을 차례로 비교합니다. 고른 것은 되돌릴 수 없습니다.",
  self2: "「자기평가 ②」 단계로 바꿉니다. 학생은 ①의 답을 보지 않은 채 다시 평정해 확정한 뒤, ①과 나란히 놓고 변화 사유를 씁니다.",
  result: "「결과 공개」 단계로 바꿉니다. 집계된 결과가 「공개 범위」 설정대로(밴드·백분위·등수) 학생에게 보입니다.",
};
const REVEALS = [
  { k: "band", label: "밴드(상·중·하)" }, { k: "pct", label: "백분위" }, { k: "rank", label: "등수" }, { k: "none", label: "보이지 않음" },
];
const TIMING = "100분 운영표 — 0–5 설명·예시 한 쌍 시연 · 5–12 자기평가① · 12–30 쌍대비교(쌍당 60~90초) · 30–33 집계 실행·신뢰도 확인 · 33–45 자기평가② · 45–60 결과 공개·토의";

/* ---------- 작은 도우미 ---------- */

const fmtT = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return (d.getMonth() + 1) + "/" + d.getDate() + " " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
};
const num = (x, d = 2) => (x == null || Number.isNaN(Number(x)) ? "-" : fmtNum(Number(x), d));
const pct = (x) => (x == null || Number.isNaN(Number(x)) ? "-" : Math.round(Number(x) * 100) + "%");
const ci = (w) => (Array.isArray(w) && w.length === 2 && w[0] != null ? "(" + num(w[0]) + "–" + num(w[1]) + ")" : "");
const sec = (ms) => (ms == null ? "-" : Math.round(ms / 100) / 10 + "초");
const clampInt = (v, lo, hi, dflt) => {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return dflt;
  return Math.min(hi, Math.max(lo, n));
};

/* 설정 패치를 서버에 보내기 직전에 범위를 맞춘다 — 입력 중에는 "1"→"12"처럼 지나가는
   값이 있으므로 칠 때마다 자르지 않고, 0.8초 쉰 뒤 한 번만 자른다 */
function sanitize(patch, base) {
  const out = { ...patch };
  if ("k" in out) out.k = clampInt(out.k, K_MIN, K_MAX, base.k);
  if ("repeat" in out) out.repeat = out.repeat ? 1 : 0;
  if ("minSec" in out) out.minSec = clampInt(out.minSec, 0, 60, base.minSec);
  if ("minWhy" in out) out.minWhy = clampInt(out.minWhy, 0, 100, base.minWhy);
  if ("askConf" in out) out.askConf = !!out.askConf;
  if ("reveal" in out && !REVEALS.some((r) => r.k === out.reveal)) out.reveal = base.reveal;
  if ("question" in out) out.question = String(out.question || "").slice(0, 300);
  return out;
}

/* CSV 내려받기 — BOM을 붙이고, 셀마다 따옴표를 겹치고, 수식 문자로 시작하면 ' 를 앞에 둔다
   (엑셀에서 =·+·-·@ 로 시작하는 셀이 수식으로 실행되는 것을 막는다) */
function downloadCsv(name, head, rows) {
  const esc = (c) => {
    if (typeof c === "number" && Number.isFinite(c)) return String(c);   // 숫자 열(θ·SE·bias·calib…)은 그대로 — 음수를 문자열로 만들면 안 된다
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

/* 품질 타일 — ok가 true/false면 테두리 색으로 기준 통과 여부를 보인다 */
function QTile({ n, l, s, ok }) {
  return (
    <div className={"kpi at-kpi" + (ok === true ? " at-ok" : ok === false ? " at-bad" : "")}>
      <div className="n">{n}</div>
      <div className="l">{l}</div>
      {s ? <div className="at-s">{s}</div> : null}
    </div>
  );
}

/* ============================================================ 교사 패널 */

export function AssessPanel({ ids, roster, wsMap, cfgAll, sampleMode, onSaveCfg, onSel }) {
  const idsKey = (ids || []).join("|");

  /* ---- 표본 학급: 결정론적 자료로 모든 표를 채운다. 쓰기 단추는 모두 잠근다 ---- */
  const sample = useMemo(() => (sampleMode ? buildSampleAssess(ids || []) : null), [sampleMode, idsKey]);
  const sampleAgg = useMemo(() => {
    if (!sample || !sample.roster) return null;
    try { return aggregate({ roster: sample.roster, assessMap: sample.assessMap, subMap: sample.subMap, cfg: sample.cfg, splitReps: SPLIT_REPS }); }
    catch (e) { console.error("sample aggregate fail", e); return null; }
  }, [sample]);

  /* ---- 실시간 구독: 명단 문서, 제출 컬렉션, 평가 컬렉션 ---- */
  const [peerLive, setPeerLive] = useState(null);
  const [subLive, setSubLive] = useState({});
  const [assessLive, setAssessLive] = useState({});
  const [subErr, setSubErr] = useState("");
  useEffect(() => {
    if (sampleMode) return undefined;
    if (typeof fbStore.watchCollection !== "function") {
      setSubErr("fbStore.watchCollection 이 아직 없습니다 — src-fb.js 갱신이 필요합니다.");
      return undefined;
    }
    const offs = [
      fbStore.watchDoc("peerRoster", (v) => setPeerLive(v || null)),
      fbStore.watchCollection("submissions", (m) => setSubLive(m || {})),
      fbStore.watchCollection("assess", (m) => setAssessLive(m || {})),
    ];
    return () => offs.forEach((f) => { try { if (typeof f === "function") f(); } catch (e) {} });
  }, [sampleMode]);

  const peer = sampleMode ? (sample && sample.roster) || null : peerLive;
  const subMap = sampleMode ? (sample && sample.subMap) || {} : subLive;
  const assessMap = sampleMode ? (sample && sample.assessMap) || {} : assessLive;
  const cfg = sampleMode ? peerCfg({ peer: (sample && sample.cfg) || {} }) : peerCfg(cfgAll);
  const nickOf = (id) => ((roster || {})[id] || {}).nick || "";

  /* ---- 설정 편집: 키 입력마다 서버에 쓰지 않고 0.8초 쉬면 모아 보낸다 (AnchorPanel과 같은 규약) ---- */
  const [draft, setDraft] = useState(null);      // 아직 서버가 돌려주지 않은 편집값
  const [saveSt, setSaveSt] = useState(null);    // null | saving | saved | err
  const pendingRef = useRef(null);               // 예약만 되고 아직 나가지 않은 패치
  const saveT = useRef(null);
  const onSaveRef = useRef(onSaveCfg);
  onSaveRef.current = onSaveCfg;
  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;
  const live = draft ? { ...cfg, ...draft } : cfg;

  const lastPatchRef = useRef({});               // 서버가 돌려주기 전까지 마지막으로 보낸 설정값
  const flushPending = async () => {
    if (saveT.current) { clearTimeout(saveT.current); saveT.current = null; }
    const p = pendingRef.current;
    pendingRef.current = null;
    if (!p) return null;
    const clean = sanitize(p, { ...cfgRef.current, ...lastPatchRef.current });
    const ok = await onSaveRef.current(clean);
    setSaveSt(ok === false ? "err" : "saved");
    if (ok !== false) { lastPatchRef.current = { ...lastPatchRef.current, ...clean }; if (!saveT.current) setDraft(null); }
    return ok !== false ? clean : null;
  };
  // 서버 값이 마지막 패치를 따라잡으면 기억을 비운다
  useEffect(() => {
    const lp = lastPatchRef.current;
    if (Object.keys(lp).every((k) => cfg[k] === lp[k])) lastPatchRef.current = {};
  }, [cfg]);
  const edit = (key, val) => {
    if (sampleMode) return;
    setDraft((d) => ({ ...(d || {}), [key]: val }));
    pendingRef.current = { ...(pendingRef.current || {}), [key]: val };
    setSaveSt("saving");
    if (saveT.current) clearTimeout(saveT.current);
    saveT.current = setTimeout(() => { saveT.current = null; flushPending(); }, 800);
  };
  // 언마운트가 예약된 저장을 버리면 "저장 중…"이라 말한 편집이 조용히 사라진다 — 즉시 밀어 보낸다
  useEffect(() => () => {
    if (saveT.current) clearTimeout(saveT.current);
    if (pendingRef.current) onSaveRef.current(sanitize(pendingRef.current, cfgRef.current));
  }, []);

  /* ---- 단계 스위치 ---- */
  const [stageBusy, setStageBusy] = useState(false);
  const [note, setNote] = useState(null);       // { kind: "ok" | "warn", text }
  const [agg, setAgg] = useState(null);
  const [aggAt, setAggAt] = useState(null);
  const shownAgg = sampleMode ? sampleAgg : agg;

  const setStage = async (k) => {
    if (sampleMode || stageBusy || k === cfg.stage) return;
    let msg = STAGE_CONFIRM[k] || "단계를 바꿉니다.";
    if (k === "peer" && !peer) msg += "\n\n주의: 아직 비교 명단이 확정되지 않았습니다. 이대로 바꾸면 학생 화면에 비교할 쌍이 없습니다.";
    if (k === "result" && !shownAgg) msg += "\n\n주의: 이 화면에서 집계를 실행하지 않았습니다. 결과가 저장되지 않은 학생에게는 아무것도 보이지 않습니다.";
    if (k === "result" && shownAgg && shownAgg.ok === false) msg += "\n\n주의: 마지막 집계가 신뢰도 기준에 미달했습니다(" + (shownAgg.reasons || []).join(" / ") + ").";
    msg += "\n\n계속할까요?";
    if (!window.confirm(msg)) return;
    setStageBusy(true);
    await flushPending();   // 설정 편집이 예약돼 있으면 단계와 함께 나가야 학생이 옛 k·질문을 보지 않는다
    const ok = await onSaveCfg({ stage: k });
    setNote(ok === false ? { kind: "warn", text: "단계를 저장하지 못했습니다 — 연결을 확인하고 다시 누르세요." } : null);
    setStageBusy(false);
  };

  /* ---- 명단: 제출 현황과 확정 ---- */
  const subRows = useMemo(() => (ids || []).map((id) => {
    const s = subMap[id] || null;
    const w = (wsMap || {})[id] || {};
    const wsImg = !!(w["s7x.img"] && w["s7x.img"].ref);
    return { id, nick: nickOf(id), sub: s, ready: subReady(s), submitted: !!(s && (s.submittedAt || s.locked)), wsImg };
  }), [idsKey, subMap, wsMap, roster]);
  const nSubmitted = subRows.filter((r) => r.submitted).length;
  const nReady = subRows.filter((r) => r.ready).length;
  const inRoster = useMemo(() => {
    const m = {};
    ((peer && peer.works) || []).forEach((w) => { m[w.sid] = w.no; });
    return m;
  }, [peer]);
  const outside = subRows.filter((r) => peer && r.ready && !inRoster[r.id]);      // 확정 뒤 들어온 제출
  const notReady = subRows.filter((r) => r.submitted && !r.ready);                // 잠겼지만 이미지가 없는 제출

  const [fixBusy, setFixBusy] = useState(false);
  const [fixErrors, setFixErrors] = useState([]);
  const doFix = async () => {
    if (sampleMode || fixBusy) return;
    const errs = [];
    const works = subRows.filter((r) => r.ready).map((r) => ({ no: String(r.sub.no).trim(), sid: r.id }));
    works.sort((a, b) => a.no.localeCompare(b.no, "ko", { numeric: true }));
    const byNo = {};
    works.forEach((w) => { (byNo[w.no] = byNo[w.no] || []).push(w.sid); });
    Object.keys(byNo).filter((no) => byNo[no].length > 1)
      .forEach((no) => errs.push("작품 번호 " + no + " 이(가) 겹칩니다: " + byNo[no].join(", ") + " — 한쪽 번호를 고친 뒤 다시 확정하세요."));
    if (works.length < 4) errs.push("비교 가능한 제출이 " + works.length + "점입니다. 네 점 이상이어야 쌍을 만들 수 있습니다(설계 §5 예외 처리).");
    if (errs.length) { setFixErrors(errs); return; }
    if (peer && !window.confirm(
      "이미 확정된 명단이 있습니다 (" + fmtT(peer.fixedAt) + " · 작품 " + ((peer.works || []).length) + "점 · " + (peer.hash || "") + ").\n\n" +
      "다시 확정하면 새 fixedAt과 해시로 배정이 통째로 바뀝니다. 이미 저장된 판정은 지워지지 않고 그대로 남지만 옛 명단 기준이라 새 집계에 섞이지 않습니다. " +
      "판정을 시작한 학생이 있으면 되도록 하지 마세요.\n\n계속할까요?")) return;
    setFixBusy(true); setFixErrors([]); setNote(null);
    const saved = await flushPending();
    // 화면이 아직 다시 그려지기 전이면 cfgRef가 옛값이다 — 방금 보낸 설정을 얹어 쓴다
    const c = { ...cfgRef.current, ...lastPatchRef.current, ...(saved || {}) };
    const fixedAt = new Date().toISOString();
    let res;
    try { res = makePlan({ works, judges: (ids || []).slice(), k: c.k, repeat: c.repeat, seed: fixedAt }); }
    catch (e) { setFixErrors(["배정을 계산하지 못했습니다: " + ((e && e.message) || e)]); setFixBusy(false); return; }
    if (res.errors && res.errors.length) { setFixErrors(res.errors); setFixBusy(false); return; }
    // k는 core가 n−1로 잘라 준 kEff를 굳힌다 — 작품이 k보다 적은 학급에서 설정값 그대로 쓰면 학생 배정과 어긋난다
    const kEff = Number.isFinite(res.kEff) ? res.kEff : c.k;
    const docv = {
      ver: ROSTER_VER, fixedAt, seed: fixedAt, k: kEff, repeat: c.repeat,
      works, judges: (ids || []).slice(), plan: res.plan, hash: res.hash, stats: res.stats,
    };
    const ok = await fbStore.setT("peerRoster", docv);
    setFixBusy(false);
    if (!ok) { setFixErrors(["명단을 저장하지 못했습니다 — 연결을 확인하고 다시 누르세요."]); return; }
    // 옛 명단으로 낸 집계는 이 명단의 것이 아니다 — 지워서 「결과 공개」가 옛 결과를 내보내지 않게 한다
    setAgg(null); setAggAt(null); setAggProg(null); setOverride(false);
    const st = res.stats || {};
    setNote({ kind: "ok", text: "비교 명단을 확정했습니다 — 작품 " + st.n + "점 · 판정자 " + st.nJudges + "명 · 1인당 " + kEff + "쌍" + (kEff < c.k ? "(설정 " + c.k + "을 작품 수에 맞춰 줄임)" : "") + " · 노출 " + st.exposureMin + "~" + st.exposureMax + "회 · 서로 다른 쌍 " + st.distinctPairs + " · " + (st.connected ? "연결됨" : "연결되지 않음") });
  };

  /* 제출 잠금 해제 — 잘못된 번호·이미지로 확정한 학생이 다시 제출할 수 있게. 명단에 든 작품은 풀지 않는다
     (비교 도중 스냅샷이 바뀌면 판정자마다 다른 작품을 본 것이 된다) */
  const [unlockBusy, setUnlockBusy] = useState("");
  const doUnlock = async (id) => {
    if (sampleMode || unlockBusy) return;
    if (inRoster[id]) { setNote({ kind: "warn", text: id + "의 작품은 확정된 명단에 들어 있어 잠금을 풀 수 없습니다. 명단을 다시 확정한 뒤에 푸세요." }); return; }
    if (!window.confirm(id + "의 제출 잠금을 풉니다. 학생은 내용을 고쳐 다시 「제출 확정」을 눌러야 합니다. 계속할까요?")) return;
    setUnlockBusy(id);
    const ok = await fbStore.setT("sub:" + id, { locked: false, unlockedAt: new Date().toISOString() }, { merge: true });
    setUnlockBusy("");
    setNote(ok ? { kind: "ok", text: id + "의 제출 잠금을 풀었습니다." } : { kind: "warn", text: "잠금을 풀지 못했습니다 — 연결을 확인하세요." });
  };

  /* ---- 진행 ---- */
  const prog = useMemo(() => (ids || []).map((id) => {
    const a = assessMap[id] || {};
    const s1 = a.self && a.self.s1, s2 = a.self && a.self.s2;
    const j = (peer ? judgeBlockOf(a, peer).block : (a.judge && a.judge.p1)) || {};
    const items = j.items || [];
    const total = peer && peer.plan && Array.isArray(peer.plan[id]) ? peer.plan[id].length : (cfg.k + cfg.repeat);
    return { id, nick: nickOf(id), s1: !!(s1 && s1.submittedAt), s2: !!(s2 && s2.submittedAt), jDone: !!j.submittedAt, n: items.length, total };
  }), [idsKey, assessMap, peer, cfg.k, cfg.repeat, roster]);
  const nS1 = prog.filter((p) => p.s1).length;
  const nS2 = prog.filter((p) => p.s2).length;
  const nJDone = prog.filter((p) => p.jDone).length;
  const nItems = prog.reduce((a, p) => a + p.n, 0);
  const undone = prog.filter((p) => !p.jDone);

  /* ---- 집계 ---- */
  const [aggBusy, setAggBusy] = useState(false);
  const [aggProg, setAggProg] = useState(null);   // { done, total, fail }
  const [override, setOverride] = useState(false);
  const peerHash = peer && peer.hash;
  useEffect(() => { setAgg(null); setAggAt(null); setAggProg(null); setOverride(false); }, [peerHash]);
  const runAgg = async () => {
    if (sampleMode || aggBusy) return;
    if (!peer) { setNote({ kind: "warn", text: "비교 명단이 없어 집계할 수 없습니다. 먼저 「비교 명단 확정」을 누르세요." }); return; }
    setAggBusy(true); setNote(null); setOverride(false);
    let res;
    try { res = aggregate({ roster: peer, assessMap, subMap, cfg, splitReps: SPLIT_REPS }); }
    catch (e) { setNote({ kind: "warn", text: "집계 중 오류: " + ((e && e.message) || e) }); setAggBusy(false); return; }
    setAgg(res); setAggAt(res.aggAt ? new Date(res.aggAt) : new Date());
    // 학생별 결과를 순서대로 쓴다 — 한꺼번에 던지면 실패한 학생을 알 수 없다
    const sids = Object.keys(res.results || {});
    let fail = 0;
    setAggProg({ done: 0, total: sids.length, fail: 0 });
    for (let i = 0; i < sids.length; i++) {
      const ok = await fbStore.setT("assess:" + sids[i], { result: res.results[sids[i]] }, { merge: true });
      if (!ok) fail += 1;
      setAggProg({ done: i + 1, total: sids.length, fail });
    }
    setAggBusy(false);
    setNote(fail ? { kind: "warn", text: fail + "명의 결과를 저장하지 못했습니다 — 연결을 확인하고 집계를 다시 실행하세요." }
      : { kind: "ok", text: "집계를 마치고 " + sids.length + "명의 결과를 저장했습니다." });
  };
  const doReveal = async () => {
    if (!shownAgg || sampleMode) return;
    if (!window.confirm(STAGE_CONFIRM.result + (shownAgg.ok === false ? "\n\n신뢰도 기준 미달을 알고도 공개합니다." : "") + "\n\n계속할까요?")) return;
    setStageBusy(true);
    const ok = await onSaveCfg({ stage: "result" });
    setNote(ok === false ? { kind: "warn", text: "결과 공개 단계를 저장하지 못했습니다." } : { kind: "ok", text: "결과를 공개했습니다. 학생 화면에 자기 결과가 보입니다." });
    setStageBusy(false);
  };

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
      out = kind === "submissions" ? csvSubmissions({ roster: peer, subMap, pidOf })
        : kind === "judgements" ? csvJudgements({ roster: peer, assessMap, pidOf })
          : kind === "self" ? csvSelf({ roster: peer, assessMap, pidOf })
          : kind === "judges" ? csvJudges({ agg: shownAgg, pidOf })
            : csvScores({ agg: shownAgg, pidOf });
    } catch (e) { setNote({ kind: "warn", text: "CSV를 만들지 못했습니다: " + ((e && e.message) || e) }); return; }
    if (!out || !out.head) { setNote({ kind: "warn", text: "내려받을 행이 없습니다." }); return; }
    downloadCsv("상호평가_" + kind + (sampleMode ? "_표본" : "") + "_" + stamp() + ".csv", out.head, out.rows || []);
  };

  /* ---- 표시용 ---- */
  const wr = sampleMode ? "표본 학급" : undefined;   // 쓰기 단추의 title
  const q = (shownAgg && shownAgg.quality) || null;
  const judgesFit = q && q.judges ? Object.keys(q.judges).sort() : [];
  const flagged = (f) => !!f && (f.flag || (f.againstRate != null && f.againstRate > 0.4) || (f.fastN != null && f.fastN >= 3));
  /* 세 단계 색: 채택 기준 이상이면 초록, 보류 기준 아래면 붉은색, 그 사이는 색 없음 */
  const tri = (v, adopt, hold) => (v == null ? null : v >= adopt ? true : v < hold ? false : null);
  const canReveal = !sampleMode && !!shownAgg && cfg.stage !== "result" && (shownAgg.ok !== false || override);
  const stageIdx = STAGE_ORDER.indexOf(cfg.stage);
  const stageCls = (k) => {
    if (k !== cfg.stage) return STAGE_ORDER.indexOf(k) < stageIdx ? "at-past" : "";
    return k === "closed" ? "on-no" : k === "result" ? "on-ok" : "on-mid";
  };
  const Badge = saveSt ? (
    <span className="hint" role="status" aria-live="polite" style={{ marginLeft: 8, fontWeight: 400, color: saveSt === "err" ? "var(--seal)" : "var(--sub)" }}>
      {saveSt === "saving" ? "저장 중…" : saveSt === "err" ? "저장 실패 — 잠시 뒤 다시 입력해 보세요" : "저장됨"}
    </span>
  ) : null;

  if (!ids || !ids.length) {
    return <div className="card"><div className="card-body" style={{ color: "var(--sub)", fontSize: 13 }}>
      학생이 입장하면 상호평가 단계·명단·집계가 여기에 나타납니다.
    </div></div>;
  }

  return (
    <div className="at-panel">
      {subErr && <div className="warn-note">{subErr}</div>}
      {note && <div className={note.kind === "warn" ? "warn-note" : "ok-note"}>{note.text}</div>}

      {/* ---------------- 카드 1 · 단계 ---------------- */}
      <div className="card at-card">
        <div className="card-head"><span className="card-code">상호평가 1</span><span className="card-title">단계 — 학급 전체를 한 스위치로</span>
          <span className="card-sess">{cfg.stage}</span></div>
        <div className="card-note">
          단계는 학급 전체에 한꺼번에 적용됩니다. 앞 단계로 되돌리는 것도 막지 않지만, 학생이 이미 굳힌 제출·판정은 되돌아가지 않습니다.
        </div>
        <div className="card-body">
          <div className="seg at-stage">
            {STAGES.map((s) => (
              <button key={s.k} type="button" className={stageCls(s.k)} disabled={sampleMode || stageBusy} title={wr}
                aria-pressed={s.k === cfg.stage} onClick={() => setStage(s.k)}>{s.label}</button>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 6 }}>{TIMING}</p>

          <div className="sv-block-t">설정{Badge}</div>
          <div className="at-settings">
            <div className="field">
              <label>1인당 본 판정 수 k ({K_MIN}–{K_MAX})</label>
              <input type="number" min={K_MIN} max={K_MAX} value={live.k} disabled={sampleMode} onChange={(e) => edit("k", e.target.value)} />
            </div>
            <div className="field">
              <label>숨은 역순 반복</label>
              <div className="seg">
                <button type="button" className={Number(live.repeat) === 1 ? "on-ok" : ""} disabled={sampleMode} onClick={() => edit("repeat", 1)}>1쌍</button>
                <button type="button" className={Number(live.repeat) === 0 ? "on-no" : ""} disabled={sampleMode} onClick={() => edit("repeat", 0)}>없음</button>
              </div>
            </div>
            <div className="field">
              <label>최소 판정 시간(초)</label>
              <input type="number" min={0} max={60} value={live.minSec} disabled={sampleMode} onChange={(e) => edit("minSec", e.target.value)} />
            </div>
            <div className="field">
              <label>이유 최소 글자 수 <span className="hint">— 15자 미만은 표시로만 센다</span></label>
              <input type="number" min={0} max={100} value={live.minWhy} disabled={sampleMode} onChange={(e) => edit("minWhy", e.target.value)} />
            </div>
            <div className="field">
              <label>판정 확신도(5단계) <span className="hint">— 기본 끔. 「판단이 어려웠다」 표시는 늘 있음</span></label>
              <div className="seg">
                <button type="button" className={live.askConf ? "on-ok" : ""} disabled={sampleMode} onClick={() => edit("askConf", true)}>묻기</button>
                <button type="button" className={!live.askConf ? "on-no" : ""} disabled={sampleMode} onClick={() => edit("askConf", false)}>묻지 않기</button>
              </div>
            </div>
            <div className="field">
              <label>학생에게 보여 줄 결과 범위</label>
              <select value={live.reveal} disabled={sampleMode} onChange={(e) => edit("reveal", e.target.value)}>
                {REVEALS.map((r) => <option key={r.k} value={r.k}>{r.label}</option>)}
              </select>
            </div>
          </div>
          <div className="field at-q">
            <label>쌍대비교 종합 질문 — 학생 화면 두 작품 위에 그대로 뜹니다</label>
            <textarea rows={2} value={live.question || ""} maxLength={300} disabled={sampleMode} onChange={(e) => edit("question", e.target.value)} />
          </div>
          <p className="hint">
            k와 반복 수는 <b>명단을 확정하는 순간</b> 배정표에 굳습니다. 확정 뒤에 바꾸면 다음 확정부터 적용됩니다.
            작품 n점·판정자 n명이면 작품당 약 2k회 노출 — k=12·24명이면 작품당 24회입니다.
          </p>
        </div>
      </div>

      {/* ---------------- 카드 2 · 명단 ---------------- */}
      <div className="card at-card">
        <div className="card-head"><span className="card-code">상호평가 2</span><span className="card-title">명단 — 제출 현황과 비교 명단 확정</span>
          <span className="card-sess">제출 {nSubmitted}/{ids.length} · 비교 가능 {nReady}</span></div>
        <div className="card-note">
          <b>비교 가능</b> = 제출을 확정했고 작품 번호와 이미지가 있는 작품. 명단은 문서 하나로 굳혀 두어야 모든 학생이 같은 배정을 봅니다 — 확정 뒤에 들어온 제출은 판정에는 참여하되 자기 작품은 다음 확정 때 들어갑니다.
        </div>
        <div className="card-body">
          <div className="at-row">
            <button className="btn" disabled={sampleMode || fixBusy || nReady < 4} title={wr} onClick={doFix}>
              {fixBusy ? "확정 중…" : peer ? "비교 명단 다시 확정" : "비교 명단 확정"}
            </button>
            {peer ? (
              <span className="hint">
                확정 {fmtT(peer.fixedAt)} · 작품 {(peer.works || []).length}점 · 판정자 {(peer.judges || []).length}명 · k {peer.k}+{peer.repeat} · <span className="mono">{peer.hash}</span>
                {peer.stats ? " · 노출 " + peer.stats.exposureMin + "~" + peer.stats.exposureMax + "회 · 쌍 " + peer.stats.distinctPairs + " · " + (peer.stats.connected ? "연결됨" : "연결되지 않음")
                  + (peer.stats.sideDevMax != null ? " · 좌우 편차 ≤ " + peer.stats.sideDevMax : "") : ""}
              </span>
            ) : <span className="hint">아직 확정된 명단이 없습니다. 제출 마감 뒤 한 번 누릅니다.</span>}
          </div>
          {fixErrors.length > 0 && (
            <div className="warn-note"><b>명단을 확정하지 못했습니다.</b>
              <ul className="at-errs">{fixErrors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            </div>
          )}
          {peer && outside.length > 0 && (
            <div className="warn-note">명단 확정 뒤에 들어온 제출 {outside.length}건 — {outside.map((r) => r.id + (r.sub && r.sub.no ? "(" + r.sub.no + ")" : "")).join(", ")}.
              판정에는 참여하지만 자기 작품은 비교되지 않습니다. 다시 확정하면 들어갑니다.</div>
          )}
          {notReady.length > 0 && (
            <p className="hint" style={{ marginBottom: 8 }}>제출은 했지만 이미지 또는 번호가 없어 비교할 수 없는 학생 {notReady.length}명 — {notReady.map((r) => r.id).join(", ")}</p>
          )}
          <div className="tbl-scroll">
            <table className="roster at-click">
              <thead><tr><th>학번</th><th>별명</th><th>작품 번호</th><th>이미지</th><th>제출 시각</th><th>잠금</th><th>명단</th><th>해제</th></tr></thead>
              <tbody>
                {subRows.map((r) => (
                  <tr key={r.id} onClick={() => onSel && onSel(r.id)}>
                    <td className="mono">{r.id}</td>
                    <td>{r.nick}</td>
                    <td className="mono">{r.sub && r.sub.no ? r.sub.no : "-"}</td>
                    <td>{r.sub ? (r.sub.img && r.sub.img.ref ? <span className="at-yes">있음</span> : <span className="at-no">없음</span>)
                      : <span className="hint">{r.wsImg ? "기록지에 있음 · 미제출" : "미제출"}</span>}</td>
                    <td className="mono">{r.sub && r.sub.submittedAt ? fmtT(r.sub.submittedAt) : "-"}</td>
                    <td>{r.sub && r.sub.locked ? <span className="at-yes">잠김</span> : "-"}</td>
                    <td>{peer ? (inRoster[r.id] ? <span className="at-yes">포함</span> : r.ready ? <span className="at-no">밖</span> : "-") : "-"}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {r.sub && r.sub.locked && !inRoster[r.id] ? (
                        <button type="button" className="btn small ghost" disabled={sampleMode || !!unlockBusy} title={wr} onClick={() => doUnlock(r.id)}>
                          {unlockBusy === r.id ? "푸는 중…" : "잠금 해제"}
                        </button>
                      ) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ---------------- 카드 3 · 진행 ---------------- */}
      <div className="card at-card">
        <div className="card-head"><span className="card-code">상호평가 3</span><span className="card-title">진행 — 누가 어디까지 했는가</span></div>
        <div className="card-body">
          <div className="kpis">
            <div className="kpi"><div className="n">{nS1}<span className="at-of"> / {ids.length}</span></div><div className="l">자기평가 ① 제출</div></div>
            <div className="kpi"><div className="n">{nJDone}<span className="at-of"> / {ids.length}</span></div><div className="l">판정 완료</div></div>
            <div className="kpi"><div className="n">{nItems}</div><div className="l">총 판정 건수 (반복 포함)</div></div>
            <div className="kpi"><div className="n">{nS2}<span className="at-of"> / {ids.length}</span></div><div className="l">자기평가 ② 제출</div></div>
          </div>
          {undone.length === 0 ? <div className="ok-note">모든 학생이 판정을 마쳤습니다.</div> : (
            <div>
              <div className="sv-block-t" style={{ marginTop: 0 }}>판정 미완료 {undone.length}명 <span className="hint" style={{ fontWeight: 400 }}>— 누르면 학생 기록이 열립니다</span></div>
              <div className="at-undone">
                {undone.map((p) => (
                  <button key={p.id} type="button" className="btn small ghost" onClick={() => onSel && onSel(p.id)}>
                    <span className="mono">{p.id}</span>{p.nick ? " " + p.nick : ""} · {p.n}/{p.total}
                    {!p.s1 && <span className="at-no"> · ①없음</span>}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ---------------- 카드 4 · 집계 ---------------- */}
      <div className="card at-card">
        <div className="card-head"><span className="card-code">상호평가 4</span><span className="card-title">집계 — 브래들리–테리 점수와 신뢰도</span>
          {aggAt && <span className="card-sess">집계 {fmtT(aggAt.toISOString())}</span>}
          {sampleMode && <span className="card-sess">표본</span>}</div>
        <div className="card-note">
          승률만 쓰면 센 상대와 붙어 진 작품이 밀립니다. 브래들리–테리 θ 옆에 승/노출을 함께 두어 모형을 몰라도 읽히게 했습니다.
          공개 보류 권고: SSR &lt; {QUALITY_MIN.ssr}, 작품당 비교 &lt; {QUALITY_MIN.perWork}회, 그래프 단절, 배정 밖 판정. SSR {QUALITY_MIN.ssr}~{SSR_ADOPT}는 주의 문구와 함께 공개됩니다.
          판정자 반분 신뢰도는 반쪽 자료라 낮게 나오는 것이 보통이므로 보고 지표입니다(논문 기준 SSR ≥ {SSR_ADOPT}, 반분 ≥ {SPLIT_ADOPT} — 쌍대비교_구현_근거.md).
        </div>
        <div className="card-body">
          <div className="at-row">
            <button className="btn" disabled={sampleMode || aggBusy || !peer} title={wr} onClick={runAgg}>
              {aggBusy ? "집계 중… " + (aggProg ? aggProg.done + "/" + aggProg.total + " 저장" : "") : "집계 실행"}
            </button>
            <button className="btn" disabled={!canReveal || stageBusy} title={wr} onClick={doReveal}>
              {cfg.stage === "result" ? "결과 공개됨" : "결과 공개"}
            </button>
            {shownAgg && shownAgg.ok === false && cfg.stage !== "result" && (
              <label className="hint at-override">
                <input type="checkbox" checked={override} disabled={sampleMode} onChange={(e) => setOverride(e.target.checked)} />
                기준 미달을 알고도 공개
              </label>
            )}
            {aggProg && !aggBusy && <span className="hint">{aggProg.done}/{aggProg.total} 저장{aggProg.fail ? " · 실패 " + aggProg.fail : ""}</span>}
          </div>

          {!shownAgg ? (
            <p className="hint">{peer ? "「집계 실행」을 누르면 순위표와 품질 지표가 나타나고 학생별 결과가 저장됩니다. 판정이 더 모이면 다시 실행해도 됩니다." : "비교 명단을 먼저 확정하세요."}</p>
          ) : (
            <div>
              {shownAgg.ok === false && (
                <div className="warn-note"><b>신뢰도 기준 미달 — 결과 공개를 보류하세요.</b>
                  <ul className="at-errs">{(shownAgg.reasons || []).map((r, i) => <li key={i}>{r}</li>)}</ul>
                  같은 자료에 즉석 쌍을 덧붙이지 말고, 미완료 학생의 판정을 받은 뒤 다시 집계합니다.
                </div>
              )}
              {shownAgg.ok !== false && !shownAgg.caution && <div className="ok-note">신뢰도 기준을 통과했습니다. 결과를 공개할 수 있습니다.</div>}
              {shownAgg.ok !== false && shownAgg.caution && (
                <div className="ok-note" style={{ borderColor: "var(--amber)", color: "var(--amber)", background: "#FBF6E9" }}>
                  <b>공개는 되지만 주의가 붙습니다.</b>
                  <ul className="at-errs">{(shownAgg.cautions || []).map((r, i) => <li key={i}>{r}</li>)}</ul>
                </div>
              )}

              <div className="sv-block-t" style={{ marginTop: 0 }}>품질 지표</div>
              <div className="kpis at-kpis">
                <QTile n={num(q && q.ssr)} l="SSR (척도 분리 신뢰도)" s={"채택 ≥ " + SSR_ADOPT + " · 보류 < " + QUALITY_MIN.ssr} ok={tri(q && q.ssr, SSR_ADOPT, QUALITY_MIN.ssr)} />
                <QTile n={num(q && q.splitHalf && q.splitHalf.median)} l="판정자 반분 신뢰도 (스피어만–브라운)"
                  s={q && q.splitHalf ? "보정 전 r " + num(q.splitHalf.medianRaw) + " · " + SPLIT_REPS + "회 · 계산 실패 " + (q.splitHalf.failed || 0) + " · 보고 지표(기준 " + SPLIT_ADOPT + ")" : ""}
                  ok={q && q.splitHalf && q.splitHalf.median != null ? (q.splitHalf.median >= SPLIT_ADOPT ? true : null) : null} />
                <QTile n={num(q && q.perWorkMean, 1)} l="작품당 평균 비교 수" s={"본 판정 " + (q ? q.nJudgements : "-") + "건 · 보류 < " + QUALITY_MIN.perWork + " · 보수적 목표 20"} ok={tri(q && q.perWorkMean, 20, QUALITY_MIN.perWork)} />
                <QTile n={(q ? q.nJudgesDone : "-") + " / " + (q ? q.nJudges : "-")} l="판정자 (완료 / 전체)" />
                <QTile n={pct(q && q.position && q.position.leftRate)} l="먼저 놓인 쪽(왼쪽·위) 선택률 — 위치 편향"
                  s={q && q.position ? "Wilson 95% " + ci(q.position.wilson) + " · n " + q.position.n
                    + (q.position.byAxis ? " · 좌우 " + pct(q.position.byAxis.x.rate) + "(" + q.position.byAxis.x.n + ") · 위아래 " + pct(q.position.byAxis.y.rate) + "(" + q.position.byAxis.y.n + ")" : "") : ""}
                  ok={q && q.position && q.position.wilson ? (q.position.wilson[0] <= 0.5 && q.position.wilson[1] >= 0.5) : null} />
                <QTile n={pct(q && q.repeat && q.repeat.rate)} l="역순 반복 일치율" s={q && q.repeat ? "Wilson 95% " + ci(q.repeat.wilson) + " · " + q.repeat.agree + "/" + q.repeat.n : ""} />
                <QTile n={q && q.connectivity ? (q.connectivity.strongly ? "강연결" : q.connectivity.connected ? "약연결" : "끊김") : "-"} l="비교 그래프 연결성"
                  s={q && q.connectivity && q.connectivity.components != null ? "성분 " + q.connectivity.components : ""}
                  ok={q && q.connectivity ? !!q.connectivity.connected : null} />
                <QTile n={sec(q && q.medianMs)} l="중앙 판정 시간" />
                <QTile n={q && q.fastN != null ? q.fastN : "-"} l={FAST_SEC + "초 미만 판정"} s={q && q.fastOverrideN != null ? "경고 뒤 그대로 넘긴 판정 " + q.fastOverrideN : ""} ok={q && q.fastN != null ? q.fastN === 0 : null} />
                <QTile n={q && q.droppedN != null ? q.droppedN : "-"} l="배정표와 맞지 않아 제외한 판정" s={q && q.droppedJudges && q.droppedJudges.length ? q.droppedJudges.join(", ") : "학생 문서에 배정에 없는 판정이 있으면 집계에서 뺀다"} ok={q && q.droppedN != null ? q.droppedN === 0 : null} />
                <QTile n={q && q.dupWhyN != null ? q.dupWhyN : "-"} l="겹치는 이유 문장" />
                <QTile n={pct(q && q.plateOpenRate)} l="작품 캡션 펼침률" />
                <QTile n={pct(q && q.hardRate)} l="「판단이 어려웠다」 비율" />
                <QTile n={pct(q && q.knowRate)} l="「누구 작품인지 알 것 같다」 비율" ok={q && q.knowRate != null ? q.knowRate < 0.2 : null} />
                {cfg.askConf && <QTile n={num(q && q.confMean, 1)} l="확신도 평균 (1~5)" />}
              </div>
              {q && q.tagDist && (
                <p className="hint" style={{ marginBottom: 12 }}>
                  결정적 축 태그 분포 — {TAG_OPTIONS.map((c) => c.label + " " + (q.tagDist[c.k] || 0)).join(" · ")}
                </p>
              )}

              <div className="sv-block-t">순위표 <span className="hint" style={{ fontWeight: 400 }}>— 줄을 누르면 학생 기록이 열립니다. bias = 예측 백분위 − 실제 백분위(+면 과대평가), calib = |bias①| − |bias②|</span></div>
              <div className="tbl-scroll">
                <table className="roster at-click at-rank">
                  <thead><tr><th>순위</th><th>번호</th><th>θ</th><th>SE</th><th>승/노출</th><th>좌측 선택률</th><th>예측①</th><th>예측②</th><th>bias①</th><th>bias②</th><th>calib</th><th>밴드</th></tr></thead>
                  <tbody>
                    {(shownAgg.works || []).map((w) => (
                      <tr key={w.no + "|" + w.sid} onClick={() => onSel && w.sid && onSel(w.sid)}>
                        <td className="mono">{w.rank}</td>
                        <td className="mono">{w.no}</td>
                        <td className="mono">{num(w.theta)}</td>
                        <td className="mono">{num(w.se)}</td>
                        <td className="mono">{w.wins}/{w.plays}</td>
                        <td className="mono">{pct(w.leftRate)}</td>
                        <td className="mono">{pct(w.predPct1)}</td>
                        <td className="mono">{pct(w.predPct2)}</td>
                        <td className="mono">{num(w.bias1)}</td>
                        <td className="mono">{num(w.bias2)}</td>
                        <td className="mono">{num(w.calib)}</td>
                        <td><span className={"at-band at-band-" + (w.band === "상" ? "hi" : w.band === "하" ? "lo" : "mid")}>{w.band || "-"}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="sv-block-t">판정자 적합도 <span className="hint" style={{ fontWeight: 400 }}>— 붉은 줄은 infit이 {INFIT_BAND[0]}~{INFIT_BAND[1]} 밖이거나 학급 평균+2SD 위, 역방향률 &gt; 40%, {FAST_SEC}초 미만 3건 이상 가운데 하나. <b>성적이 아니라 수업 자료 — 제외하지 않는다.</b> 판단 경향이 학급 합의와 다르다는 뜻이지 오류가 아닙니다.</span></div>
              <div className="tbl-scroll">
                <table className="roster at-click">
                  <thead><tr><th>학번</th><th>별명</th><th>판정 수</th><th>infit</th><th>역방향률</th><th>좌측률</th><th>중앙 초</th><th>{FAST_SEC}초 미만</th><th>중복 이유</th></tr></thead>
                  <tbody>
                    {judgesFit.map((j) => {
                      const f = q.judges[j] || {};
                      return (
                        <tr key={j} className={flagged(f) ? "at-flag" : ""} onClick={() => onSel && onSel(j)}>
                          <td className="mono">{j}</td>
                          <td>{nickOf(j)}</td>
                          <td className="mono">{f.n != null ? f.n : "-"}</td>
                          <td className="mono">{num(f.infit)}</td>
                          <td className="mono">{pct(f.againstRate)}{f.nGap ? " (" + f.against + "/" + f.nGap + ")" : ""}</td>
                          <td className="mono">{pct(f.leftRate)}</td>
                          <td className="mono">{sec(f.medianMs)}</td>
                          <td className="mono">{f.fastN != null ? f.fastN : "-"}</td>
                          <td className="mono">{f.dupWhyN != null ? f.dupWhyN : "-"}</td>
                        </tr>
                      );
                    })}
                    {judgesFit.length === 0 && <tr><td colSpan={9} className="hint">판정이 아직 없습니다.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ---------------- 카드 5 · CSV ---------------- */}
      <div className="card at-card">
        <div className="card-head"><span className="card-code">상호평가 5</span><span className="card-title">CSV — 연구 자료 네 파일</span></div>
        <div className="card-note">
          제출(작품 단위) · 판정(판정 단위, 옛 명단의 판정은 valid=0) · 자기평가(학생×단계) · 집계(작품 점수) · 판정자(적합도·위치·시간). 학번 대신 <b>「연구」 탭과 같은 규칙의 익명 번호</b>(학번 정렬 순 P01…)를 씁니다.
        </div>
        <div className="card-body">
          <div className="at-row">
            <button className="btn small ghost" disabled={!peer && !nSubmitted} onClick={() => exportKind("submissions")}>제출 CSV</button>
            <button className="btn small ghost" disabled={!peer} onClick={() => exportKind("judgements")}>판정 CSV</button>
            <button className="btn small ghost" disabled={!peer} onClick={() => exportKind("self")}>자기평가 CSV</button>
            <button className="btn small ghost" disabled={!shownAgg} onClick={() => exportKind("scores")}>집계 CSV</button>
            <button className="btn small ghost" disabled={!shownAgg} onClick={() => exportKind("judges")}>판정자 CSV</button>
          </div>
          <p className="hint">
            파일 이름은 <span className="mono">상호평가_&lt;종류&gt;_&lt;yymmdd&gt;.csv</span>. 셀 앞의 <span className="mono">'</span>는 수식 주입을 막는 표시이니 그대로 두세요.
            네 파일에는 학급 전원이 들어갑니다 — 논문용 집계에서는 「연구」 탭의 동의 대장을 기준으로 동의하지 않은 학생의 P 번호를 빼고 쓰세요.
            집계 CSV는 이 화면에서 마지막으로 실행한 집계를 내려받습니다.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ---------- 스타일 ---------- */

const ASSESS_TEACHER_CSS = `
.at-card{border-top:3px solid var(--patina)}
.at-stage{flex-wrap:wrap}
.at-stage button{padding:7px 14px;font-size:13px}
.at-stage button.at-past{color:var(--sub);background:var(--card2)}
.at-settings{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px 14px;margin-bottom:12px}
.at-settings .field{margin-bottom:0}
.at-settings .field input,.at-settings .field select{padding:7px 9px;font-size:13px}
.at-settings .seg{margin-top:2px}
.at-q textarea{resize:vertical;min-height:52px}
.at-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px}
.at-errs{margin:6px 0 0 18px;padding:0}
.at-errs li{margin:2px 0}
.at-yes{color:var(--patina);font-weight:500}
.at-no{color:var(--seal);font-weight:500}
.at-of{font-size:15px;color:var(--sub);font-weight:400}
.at-undone{display:flex;gap:6px;flex-wrap:wrap}
.at-undone .btn{text-align:left}
.at-click tbody tr{cursor:pointer}
.at-click tbody tr:hover td{background:var(--card2)}
.at-kpis{grid-template-columns:repeat(auto-fit,minmax(160px,1fr))}
.at-kpi .n{font-size:22px}
.at-kpi.at-ok{border-color:var(--patina);box-shadow:inset 3px 0 0 var(--patina)}
.at-kpi.at-bad{border-color:var(--seal);box-shadow:inset 3px 0 0 var(--seal)}
.at-kpi .at-s{font-family:var(--mono);font-size:11px;color:var(--sub);margin-top:3px;line-height:1.4}
.at-rank td{white-space:nowrap}
.at-flag td{background:var(--seal-bg)}
.at-click tbody tr.at-flag:hover td{background:var(--seal-bg)}
.at-band{display:inline-block;min-width:22px;text-align:center;padding:1px 6px;border:1px solid var(--line);font-size:12px}
.at-band-hi{border-color:var(--patina);color:var(--patina)}
.at-band-mid{border-color:var(--amber);color:var(--amber)}
.at-band-lo{border-color:var(--seal);color:var(--seal)}
.at-override{display:inline-flex;align-items:center;gap:6px;cursor:pointer}
.at-override input{margin:0}
@media(max-width:640px){
  .at-settings{grid-template-columns:1fr 1fr}
  .at-stage button{flex:1 1 30%}
}
`;

export function AssessTeacherStyle() { return <style>{ASSESS_TEACHER_CSS}</style>; }
