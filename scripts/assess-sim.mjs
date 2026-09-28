/* 쌍대비교 상호평가 설계의 몬테카를로 검증 — src-assess-core.mjs의 실제 배정·추정·품질 판정 코드를 그대로 돌린다.
   무엇을 보는가
     A. 신뢰도: 학급 크기 n · 1인당 판정 k · 진점수 분산 σ에 따라 SSR 점추정, 진점수와의 상관 r², 순위 상관, 반분, 채택 판정 비율
     B. 결석: 판정자 결측 m명일 때 노출 최솟값·연결성·SSR
     C. 표준오차 근사: 대각 근사 SE 대 완전 정보행렬 SE (θ 재현 확인 포함)
     D. 판정자 적합도 표시의 거짓 양성률(정상 판정자)과 무작위 클릭 판정자 탐지율
     E. 위치 편향 탐지력과 θ 불편성
     F. 보정 지표 calib: 평균 회귀 인공물(하위 삼분위 bias1), 1종 오류, 검정력
     G. 반복 쌍 일치율의 기대치(모형 기준선)
   사용: node scripts/assess-sim.mjs [A|B|C|D|E|F|G|all|A,B] [--reps=200] [--out=경로]
   결과는 JSON으로 저장(같은 파일에 시나리오별로 병합)하고 요약 행을 표준 출력에 찍는다. */
import fs from "node:fs";
import path from "node:path";
import {
  makePlan, scaleSeparation, aggregate, ranksAndBands, INFIT_BAND, QUALITY_MIN, DEFAULT_PEER,
} from "../src-assess-core.mjs";

const args = process.argv.slice(2);
const which = (args.find((a) => !a.startsWith("--")) || "all").toUpperCase();
const opt = (name, def) => { const a = args.find((x) => x.startsWith("--" + name + "=")); return a ? a.slice(name.length + 3) : def; };
const REPS = Number(opt("reps", 200));
const OUT = opt("out", path.join("pairwise-research", "assess-sim-results.json"));

/* ---------- 난수 ---------- */
function rng(seed) {
  let a = seed >>> 0;
  const u = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const normal = () => { let x = 0, y = 0; while (x === 0) x = u(); y = u(); return Math.sqrt(-2 * Math.log(x)) * Math.cos(2 * Math.PI * y); };
  const pick = (arr, m) => { const c = arr.slice(); for (let i = c.length - 1; i > 0; i -= 1) { const j = Math.floor(u() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; } return c.slice(0, m); };
  return { u, normal, pick };
}
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const mean = (xs) => { const v = xs.filter(Number.isFinite); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const sd = (xs) => { const v = xs.filter(Number.isFinite); if (v.length < 2) return null; const m = mean(v); return Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1)); };
const quantile = (xs, q) => { const v = xs.filter(Number.isFinite).sort((a, b) => a - b); if (!v.length) return null; const i = (v.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return v[lo] + (v[hi] - v[lo]) * (i - lo); };
const pearson = (xs, ys) => { const n = xs.length; const mx = mean(xs), my = mean(ys); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < n; i += 1) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; } return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null; };
const ranks = (xs) => { const idx = xs.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0]); const r = new Array(xs.length); idx.forEach(([, i], k) => { r[i] = k + 1; }); return r; };
const spearman = (xs, ys) => pearson(ranks(xs), ranks(ys));
const slope = (xs, ys) => { const mx = mean(xs), my = mean(ys); let sxy = 0, sxx = 0; xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; }); return sxx > 0 ? sxy / sxx : null; };
const r3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : null);

/* ---------- 학급 하나를 흉내 낸다 ----------
   opts: n, k, sigma(진점수 SD, logit), absent(결석 판정자 수), lapse(무작위 클릭 비율, 판정자 공통),
         lapseJudges(무작위 클릭 판정자 수, 이들의 lapse=0.5), posBias(왼쪽 편향 logit), hetero(판정자 변별 척도 lognormal SD), splitReps */
function simulateClass(opts, R) {
  const { n, k, sigma = 1, absent = 0, lapse = 0, lapseJudges = 0, posBias = 0, hetero = 0, splitReps = 1, seedTag = "" } = opts;
  const sids = Array.from({ length: n }, (_, i) => "s" + String(i + 1).padStart(2, "0"));
  const works = sids.map((sid, i) => ({ no: "A-" + String(i + 1).padStart(2, "0"), sid }));
  const fixedAt = "2026-11-01T00:00:00.000Z";
  const seed = fixedAt + "::" + seedTag;
  const made = makePlan({ works, judges: sids, k, repeat: 1, seed });
  if (made.errors.length) throw new Error(made.errors.join("; "));
  const roster = { fixedAt, seed, k: made.kEff, repeat: 1, works, judges: sids, plan: made.plan, hash: made.hash, stats: made.stats };
  const truth = {};
  works.forEach((w) => { truth[w.no] = R.normal() * sigma; });
  const tm = mean(works.map((w) => truth[w.no]));
  works.forEach((w) => { truth[w.no] -= tm; });
  const scale = {}, lapseOf = {};
  const lapsers = new Set(R.pick(sids, lapseJudges));
  sids.forEach((sid) => { scale[sid] = hetero > 0 ? Math.exp(R.normal() * hetero) : 1; lapseOf[sid] = lapsers.has(sid) ? 0.5 : lapse; });
  const absentSet = new Set(R.pick(sids, absent));
  const assessMap = {};
  sids.forEach((sid) => {
    if (absentSet.has(sid)) return;
    const items = roster.plan[sid].map((it) => {
      const leftNo = it.left === "a" ? it.a : it.b;
      const u = (truth[it.a] - truth[it.b] + (leftNo === it.a ? posBias : -posBias)) / scale[sid];
      let win;
      if (R.u() < lapseOf[sid]) win = R.u() < 0.5 ? "a" : "b";
      else win = R.u() < sigmoid(u) ? "a" : "b";
      return { ...it, win, why: "판정 이유 문장 표본입니다", tag: "whole", ms: 8000 + Math.floor(R.u() * 30000), plateOpened: false, axis: "x", at: fixedAt };
    });
    assessMap[sid] = { ver: "v1", self: {}, judge: { p1: { rosterVer: fixedAt, planHash: made.hash, k: made.kEff, repeat: 1, items, startedAt: fixedAt, submittedAt: fixedAt } } };
  });
  const agg = aggregate({ roster, assessMap, subMap: {}, cfg: { ...DEFAULT_PEER, stage: "result", k: made.kEff }, splitReps });
  const nos = works.map((w) => w.no);
  const byNo = {}; agg.works.forEach((w) => { byNo[w.no] = w; });
  const th = nos.map((no) => byNo[no].theta);
  const tt = nos.map((no) => truth[no]);
  return { roster, assessMap, agg, truth, nos, th, tt, byNo, lapsers, absentSet };
}

/* 기준 작품을 포함한 완전 정보행렬 SE — 코드와 같은 MM으로 다시 적합하고(θ 재현 확인), (m+1)×(m+1) 정보행렬에서 기준을 고정한 m×m 블록을 뒤집는다 */
function refitWithRef(judgements, nos, prior = 0.5) {
  const m = nos.length, idx = {}; nos.forEach((no, i) => { idx[no] = i; });
  const N = Array.from({ length: m + 1 }, () => new Float64Array(m + 1));
  const W = new Float64Array(m + 1);
  judgements.forEach((J) => { if (J.rep != null) return; const a = idx[J.a], b = idx[J.b]; N[a][b] += 1; N[b][a] += 1; W[J.win === "a" ? a : b] += 1; });
  for (let i = 0; i < m; i += 1) { N[i][m] += 1; N[m][i] += 1; W[i] += prior; }
  let p = new Float64Array(m + 1).fill(1);
  for (let it = 0; it < 5000; it += 1) {
    const q = new Float64Array(m + 1); q[m] = 1; let delta = 0;
    for (let i = 0; i < m; i += 1) { let den = 0; for (let j = 0; j <= m; j += 1) if (N[i][j]) den += N[i][j] / (p[i] + p[j]); q[i] = den > 0 ? W[i] / den : 1; delta = Math.max(delta, Math.abs(Math.log(q[i]) - Math.log(p[i]))); }
    p = q; if (delta < 1e-7) break;
  }
  const I = Array.from({ length: m }, () => new Float64Array(m));
  for (let i = 0; i < m; i += 1) for (let j = 0; j <= m; j += 1) if (N[i][j]) {
    const w = (N[i][j] * p[i] * p[j]) / ((p[i] + p[j]) ** 2);
    I[i][i] += w; if (j < m) I[i][j] -= w;
  }
  const A = I.map((row, i) => { const r = Array.from(row); const e = new Array(m).fill(0); e[i] = 1; return r.concat(e); });
  for (let c = 0; c < m; c += 1) {
    let piv = c; for (let r = c + 1; r < m; r += 1) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
    [A[c], A[piv]] = [A[piv], A[c]];
    const d = A[c][c]; if (Math.abs(d) < 1e-12) return null;
    for (let j = 0; j < 2 * m; j += 1) A[c][j] /= d;
    for (let r = 0; r < m; r += 1) if (r !== c) { const f = A[r][c]; if (f) for (let j = 0; j < 2 * m; j += 1) A[r][j] -= f * A[c][j]; }
  }
  // 공분산 Σ(기준 작품 대비). 학급 평균을 0으로 두는 코드의 θ에 맞추려면 대비 c_i = e_i − 1/m 의 분산을 써야 한다 —
  // 기준 작품 대비 분산에는 「학급 전체가 가상 기준보다 얼마나 높은가」라는 공통 성분이 들어 있어 작품 사이의 분리와 무관하다
  const S = (i, j) => A[i][m + j];
  let tot = 0; for (let i = 0; i < m; i += 1) for (let j = 0; j < m; j += 1) tot += S(i, j);
  const rowSum = nos.map((_, i) => { let r = 0; for (let j = 0; j < m; j += 1) r += S(i, j); return r; });
  const seFull = nos.map((_, i) => Math.sqrt(Math.max(0, S(i, i) - (2 / m) * rowSum[i] + tot / (m * m))));
  const seRef = nos.map((_, i) => Math.sqrt(S(i, i)));
  const seDiag = nos.map((_, i) => 1 / Math.sqrt(I[i][i]));
  const logs = nos.map((_, i) => Math.log(p[i]));
  const c = mean(logs);
  return { theta: logs.map((x) => x - c), seFull, seRef, seDiag };
}

/* ---------- 시나리오 ---------- */
const results = { meta: { at: new Date().toISOString(), reps: REPS, node: process.version }, A: [], B: [], C: [], D: [], E: [], F: {}, G: [] };
const log = (tag, row) => console.log(tag, JSON.stringify(row));

function scenarioA() {
  const grid = [];
  for (const n of [20, 24, 28, 30]) for (const k of [10, 12, 15, 21]) for (const sigma of [0.5, 0.75, 1.0, 1.5]) grid.push({ n, k, sigma });
  grid.forEach((cell, gi) => {
    const focal = (cell.n === 24 || cell.n === 28) && cell.k === 12;
    const R = rng(1000 + gi);
    const ssr = [], r2 = [], rho = [], sh = [], shRaw = [], ok = [], adopt = [], slopes = [], exMin = [], strongly = [], thSD = [], bandAgree = [], top3 = [];
    const reps = focal ? REPS : Math.max(60, Math.floor(REPS / 2));
    for (let r = 0; r < reps; r += 1) {
      const s = simulateClass({ ...cell, splitReps: focal ? 25 : 1, seedTag: "A" + gi + "-" + r }, R);
      ssr.push(s.agg.quality.ssr);
      const pr = pearson(s.th, s.tt); r2.push(pr * pr); rho.push(spearman(s.th, s.tt));
      if (focal) { sh.push(s.agg.quality.splitHalf.median); shRaw.push(s.agg.quality.splitHalf.medianRaw); }
      ok.push(s.agg.ok ? 1 : 0); adopt.push(s.agg.quality.ssr >= QUALITY_MIN.ssrAdopt ? 1 : 0);
      slopes.push(slope(s.tt, s.th)); thSD.push(sd(s.th));
      exMin.push(Math.min(...s.agg.works.map((w) => w.plays)));
      strongly.push(s.agg.quality.connectivity.strongly ? 1 : 0);
      // 밴드(상·중·하) 일치율 — 학생이 보는 「자리」가 진짜 삼분위와 같은 비율. 상위 3점의 진짜 순위 평균도 본다
      const bt = ranksAndBands(s.truth).band, rt = ranksAndBands(s.truth).rank;
      bandAgree.push(mean(s.nos.map((no) => (s.byNo[no].band === bt[no] ? 1 : 0))));
      top3.push(mean(s.agg.works.slice(0, 3).map((w) => rt[w.no])));
    }
    const row = {
      ...cell, perWork: 2 * cell.k, reps, bandAgree: r3(mean(bandAgree)), top3TrueRankMean: r3(mean(top3)),
      ssrMean: r3(mean(ssr)), ssrSD: r3(sd(ssr)), ssrP10: r3(quantile(ssr, 0.1)), ssrP90: r3(quantile(ssr, 0.9)),
      r2Mean: r3(mean(r2)), rhoMean: r3(mean(rho)), ssrMinusR2: r3(mean(ssr) - mean(r2)),
      pAdopt: r3(mean(adopt)), pOk: r3(mean(ok)), pSsrGe70: r3(mean(ssr.map((x) => (x >= 0.7 ? 1 : 0)))),
      shMedian: focal ? r3(mean(sh)) : null, shRawMedian: focal ? r3(mean(shRaw)) : null,
      slopeMean: r3(mean(slopes)), thetaHatSD: r3(mean(thSD)), exposureMin: Math.min(...exMin), pStrongly: r3(mean(strongly)),
    };
    results.A.push(row); log("A", row);
  });
}

function scenarioB() {
  let gi = 0;
  for (const n of [24, 28]) for (const absent of [0, 2, 4, 6, 8]) for (const sigma of [0.75, 1.0]) {
    const R = rng(2000 + gi); gi += 1;
    const ssr = [], r2 = [], exMin = [], exMean = [], conn = [], ok = [], holdPerWork = [];
    const reps = Math.max(60, Math.floor(REPS / 2));
    for (let r = 0; r < reps; r += 1) {
      const s = simulateClass({ n, k: 12, sigma, absent, seedTag: "B" + gi + "-" + r }, R);
      ssr.push(s.agg.quality.ssr); const pr = pearson(s.th, s.tt); r2.push(pr * pr);
      const plays = s.agg.works.map((w) => w.plays); exMin.push(Math.min(...plays)); exMean.push(mean(plays));
      conn.push(s.agg.quality.connectivity.connected ? 1 : 0); ok.push(s.agg.ok ? 1 : 0);
      holdPerWork.push(s.agg.quality.perWorkMean < QUALITY_MIN.perWork ? 1 : 0);
    }
    const row = { n, absent, sigma, k: 12, reps, ssrMean: r3(mean(ssr)), r2Mean: r3(mean(r2)), exposureMinMean: r3(mean(exMin)), exposureMinWorst: Math.min(...exMin), perWorkMean: r3(mean(exMean)), pConnected: r3(mean(conn)), pOk: r3(mean(ok)), pHoldPerWork: r3(mean(holdPerWork)) };
    results.B.push(row); log("B", row);
  }
}

function scenarioC() {
  let gi = 0;
  for (const n of [24, 28]) for (const k of [10, 12, 15]) for (const sigma of [0.75, 1.0, 1.5]) {
    const R = rng(3000 + gi); gi += 1;
    const ratio = [], ratioRef = [], maxDiff = [], ssrDiag = [], ssrFull = [], thetaMatch = [];
    for (let r = 0; r < 40; r += 1) {
      const s = simulateClass({ n, k, sigma, seedTag: "C" + gi + "-" + r }, R);
      const J = []; Object.values(s.assessMap).forEach((d) => d.judge.p1.items.forEach((it) => J.push(it)));
      const f = refitWithRef(J, s.nos);
      if (!f) continue;
      const seCode = s.nos.map((no) => s.byNo[no].se);
      ratio.push(mean(f.seFull.map((x, i) => x / seCode[i])));
      ratioRef.push(mean(f.seRef.map((x, i) => x / seCode[i])));
      maxDiff.push(Math.max(...f.seDiag.map((x, i) => Math.abs(x - seCode[i]))));
      thetaMatch.push(Math.max(...f.theta.map((x, i) => Math.abs(x - s.th[i]))));
      const thObj = {}, seD = {}, seF = {};
      s.nos.forEach((no, i) => { thObj[no] = s.th[i]; seD[no] = seCode[i]; seF[no] = f.seFull[i]; });
      ssrDiag.push(scaleSeparation(thObj, seD)); ssrFull.push(scaleSeparation(thObj, seF));
    }
    const row = { n, k, sigma, reps: ratio.length, seCenteredOverDiag: r3(mean(ratio)), seRefOverDiag: r3(mean(ratioRef)), seDiagReproMaxAbsDiff: r3(Math.max(...maxDiff)), thetaReproMaxAbsDiff: r3(Math.max(...thetaMatch)), ssrDiag: r3(mean(ssrDiag)), ssrCentered: r3(mean(ssrFull)) };
    results.C.push(row); log("C", row);
  }
}

function scenarioD() {
  let gi = 0;
  for (const n of [24, 28]) for (const sigma of [0.75, 1.0, 1.5]) for (const lapseJudges of [0, 2]) for (const hetero of [0, 0.3]) {
    const R = rng(4000 + gi); gi += 1;
    let flagsNormal = 0, nNormal = 0, flagsLapser = 0, nLapser = 0, lowInfit = 0;
    const againstNormal = [], againstLapser = [], infitsNormal = [], infitsLapser = [];
    const reps = Math.max(60, Math.floor(REPS / 2));
    for (let r = 0; r < reps; r += 1) {
      const s = simulateClass({ n, k: 12, sigma, lapseJudges, hetero, seedTag: "D" + gi + "-" + r }, R);
      Object.entries(s.agg.quality.judges).forEach(([sid, f]) => {
        if (s.lapsers.has(sid)) { nLapser += 1; if (f.flag) flagsLapser += 1; if (f.againstRate != null) againstLapser.push(f.againstRate); if (Number.isFinite(f.infit)) infitsLapser.push(f.infit); }
        else { nNormal += 1; if (f.flag) flagsNormal += 1; if (Number.isFinite(f.infit)) { infitsNormal.push(f.infit); if (f.infit < INFIT_BAND[0]) lowInfit += 1; } if (f.againstRate != null) againstNormal.push(f.againstRate); }
      });
    }
    const row = { n, sigma, lapseJudges, hetero, reps, falseFlagRate: r3(flagsNormal / nNormal), lapserDetectRate: nLapser ? r3(flagsLapser / nLapser) : null, infitNormalMean: r3(mean(infitsNormal)), infitNormalSD: r3(sd(infitsNormal)), infitNormalP95: r3(quantile(infitsNormal, 0.95)), infitLapserMean: r3(mean(infitsLapser)), lowInfitRate: r3(lowInfit / nNormal), againstNormal: r3(mean(againstNormal)), againstLapser: r3(mean(againstLapser)) };
    results.D.push(row); log("D", row);
  }
}

function scenarioE() {
  let gi = 0;
  for (const n of [24, 28]) for (const posBias of [0, 0.2, 0.4]) {
    const sigma = 1.0;
    const R = rng(5000 + gi); gi += 1;
    const leftRate = [], detect = [], r2 = [];
    const reps = Math.max(60, Math.floor(REPS / 2));
    for (let r = 0; r < reps; r += 1) {
      const s = simulateClass({ n, k: 12, sigma, posBias, seedTag: "E" + gi + "-" + r }, R);
      const p = s.agg.quality.position; leftRate.push(p.leftRate); detect.push(p.wilson[0] > 0.5 || p.wilson[1] < 0.5 ? 1 : 0);
      const pr = pearson(s.th, s.tt); r2.push(pr * pr);
    }
    const row = { n, posBias, sigma, reps, leftRateMean: r3(mean(leftRate)), pDetectWilson: r3(mean(detect)), r2Mean: r3(mean(r2)) };
    results.E.push(row); log("E", row);
  }
}

/* F. 보정 지표 — 학급 6개(n=24) × 학생 144명. 예측 백분위 = 진짜 백분위 + N(0, s). bias는 앱처럼 「측정된 BT 백분위」 기준으로 계산 */
function scenarioF() {
  const CLASSES = 6, n = 24, k = 12;
  const out = {};
  for (const sigma of [0.75, 1.0]) for (const [s1, s2, label] of [[0.25, 0.25, "null"], [0.25, 0.20, "small"], [0.25, 0.15, "medium"]]) {
    const R = rng(6000 + Math.round(sigma * 100) + Math.round(s2 * 100));
    let rejects = 0, reps = 0;
    const calibMeans = [], lowM = [], highM = [], lowT = [], corrM = [], corrT = [], ssrs = [];
    const nRep = Math.max(200, REPS);
    for (let r = 0; r < nRep; r += 1) {
      const calibs = [], rows = [], thM = [], thT = [];
      for (let c = 0; c < CLASSES; c += 1) {
        const s = simulateClass({ n, k, sigma, seedTag: "F" + label + "-" + r + "-" + c }, R);
        ssrs.push(s.agg.quality.ssr);
        const truePct = ranksAndBands(s.truth).pct, bandsTrue = ranksAndBands(s.truth).band;
        s.nos.forEach((no) => {
          const w = s.byNo[no];
          const clip = (x) => Math.max(0, Math.min(1, x));
          const p1 = clip(truePct[no] + R.normal() * s1), p2 = clip(truePct[no] + R.normal() * s2);
          const bias1 = p1 - w.pct, bias2 = p2 - w.pct;
          calibs.push(Math.abs(bias1) - Math.abs(bias2));
          thM.push(w.theta); thT.push(s.truth[no]);
          rows.push({ bias1, band: w.band, bandTrue: bandsTrue[no], biasTrue: p1 - truePct[no] });
        });
      }
      const m = mean(calibs), se = sd(calibs) / Math.sqrt(calibs.length);
      if (Math.abs(m / se) > 1.977) rejects += 1; reps += 1;   // df ≈ 143, 양측 .05
      calibMeans.push(m);
      lowM.push(mean(rows.filter((x) => x.band === "하").map((x) => x.bias1)));
      highM.push(mean(rows.filter((x) => x.band === "상").map((x) => x.bias1)));
      lowT.push(mean(rows.filter((x) => x.bandTrue === "하").map((x) => x.biasTrue)));
      corrM.push(pearson(rows.map((x) => x.bias1), thM));
      corrT.push(pearson(rows.map((x) => x.biasTrue), thT));
    }
    const key = "sigma" + sigma + "_" + label;
    out[key] = { sigma, s1, s2, label, classes: CLASSES, n, students: CLASSES * n, reps, ssrMean: r3(mean(ssrs)),
      calibMean: r3(mean(calibMeans)), calibSDacrossReps: r3(sd(calibMeans)), rejectRate: r3(rejects / reps),
      lowTertileBias1_measuredBand: r3(mean(lowM)), highTertileBias1_measuredBand: r3(mean(highM)), lowTertileBias1_trueBand: r3(mean(lowT)),
      corr_bias1_thetaHat: r3(mean(corrM)), corr_biasTrue_thetaTrue: r3(mean(corrT)) };
    log("F", out[key]);
  }
  results.F = out;
}

/* G. 반복 쌍 일치율의 기대치 — 표준 BT 판정자가 같은 쌍을 다시 볼 때 P²+(1−P)²의 기대값(Δθ ~ N(0, 2σ²)), 그리고 시뮬레이션 관측치 */
function scenarioG() {
  for (const sigma of [0.5, 0.75, 1.0, 1.5]) {
    let acc = 0; const M = 200000; const R = rng(7000 + Math.round(sigma * 100));
    for (let i = 0; i < M; i += 1) { const d = R.normal() * Math.SQRT2 * sigma; const P = sigmoid(d); acc += P * P + (1 - P) * (1 - P); }
    const obs = [];
    const reps = Math.max(50, Math.floor(REPS / 2));
    for (let r = 0; r < reps; r += 1) { const s = simulateClass({ n: 24, k: 12, sigma, seedTag: "G" + r }, R); obs.push(s.agg.quality.repeat.rate); }
    const row = { sigma, expectedAgreement: r3(acc / M), observedMean: r3(mean(obs)), observedP10: r3(quantile(obs, 0.1)), observedP90: r3(quantile(obs, 0.9)), nRepeatPairs: 24, reps };
    results.G.push(row); log("G", row);
  }
}

const run = { A: scenarioA, B: scenarioB, C: scenarioC, D: scenarioD, E: scenarioE, F: scenarioF, G: scenarioG };
const t0 = Date.now();
(which === "ALL" ? Object.keys(run) : which.split(",")).forEach((w) => { if (run[w]) { console.log("== 시나리오", w); run[w](); } });
results.meta.seconds = Math.round((Date.now() - t0) / 1000);
fs.mkdirSync(path.dirname(OUT), { recursive: true });
let prev = {};
try { prev = JSON.parse(fs.readFileSync(OUT, "utf8")); } catch { prev = {}; }
const merged = { ...prev };
Object.entries(results).forEach(([k, v]) => { if (k === "meta" || (Array.isArray(v) ? v.length : Object.keys(v).length)) merged[k] = v; });
fs.writeFileSync(OUT, JSON.stringify(merged, null, 1));
console.log("저장:", OUT, "(" + results.meta.seconds + "초)");
