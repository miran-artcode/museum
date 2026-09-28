/* 반 친구 판정 흉내 — 예시 작품의 숨은 품질(q)로 브래들리–테리 판정자를 만든다.
   판정자마다 변별도(lognormal 0.25)가 다르고, 먼저 놓인 쪽에 0.12 logit 끌림이 있다.
   이유 문장은 이긴 작품의 good(60%) 또는 진 작품의 weak(40%)에서 고른다. */
import { predPctOf, ranksAndBands, SELF_ITEMS } from "../../src-assess-core.mjs";
import { WORKS, workByNo, workOfSid } from "./works.js";

export function rng(seed) {
  let a = seed >>> 0;
  const u = () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const normal = () => { let x = 0; while (x === 0) x = u(); return Math.sqrt(-2 * Math.log(x)) * Math.cos(2 * Math.PI * u()); };
  return { u, normal };
}
export const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const Q_MEAN = WORKS.reduce((a, w) => a + w.q, 0) / WORKS.length;
export const qOf = (no, mult = 1) => (workByNo(no).q - Q_MEAN) * mult;

const T0 = Date.parse("2026-11-02T01:10:00.000Z");

/* roster의 배정대로 판정자 sids의 판정 블록을 만든다. 돌려주는 값: { sid: assess 문서 } */
export function simulateJudges({ roster, sids, seed = 1, mult = 1, withSelf = true }) {
  const R = rng(seed * 7919 + 17);
  const out = {};
  const truth = {};
  roster.works.forEach((w) => { truth[w.no] = qOf(w.no, mult); });
  const truePct = ranksAndBands(truth).pct;
  const n = roster.works.length;
  sids.forEach((sid, si) => {
    const plan = (roster.plan && roster.plan[sid]) || [];
    const disc = Math.exp(R.normal() * 0.25);
    let t = T0 + si * 17000;
    const items = plan.map((it) => {
      const leftNo = it.left === "a" ? it.a : it.b;
      const d = truth[it.a] - truth[it.b];
      const P = sigmoid(d * disc + (leftNo === it.a ? 0.12 : -0.12));
      const win = R.u() < P ? "a" : "b";
      const winNo = win === "a" ? it.a : it.b, loseNo = win === "a" ? it.b : it.a;
      const useGood = R.u() < 0.6;
      const src = useGood ? workByNo(winNo).good : workByNo(loseNo).weak;
      const pick = src[Math.floor(R.u() * src.length)] || ["두 작품 가운데 이쪽이 더 기록처럼 읽혔다", "whole"];
      const fast = R.u() < 0.03;
      const ms = fast ? 2500 + Math.floor(R.u() * 2000) : 14000 + Math.floor(R.u() * 52000);
      t += ms + 4000;
      return {
        i: it.i, a: it.a, b: it.b, left: it.left, rep: it.rep == null ? null : it.rep,
        win, conf: null, hard: Math.abs(d) < 0.5 ? R.u() < 0.45 : R.u() < 0.08, knowAuthor: R.u() < 0.04,
        why: pick[0], tag: pick[1], ms, fastOverride: fast, plateOpened: R.u() < 0.7, axis: "x", vw: 1366,
        at: new Date(t).toISOString(),
      };
    });
    const doc = {
      ver: "v1",
      judge: { p1: { rosterVer: roster.fixedAt, planHash: roster.hash, k: roster.k, repeat: roster.repeat, items, startedAt: new Date(T0).toISOString(), submittedAt: new Date(t).toISOString() } },
    };
    const own = roster.works.find((w) => w.sid === sid);
    if (withSelf && own) {
      /* 자기 등수 예측: 진짜 백분위 + 잡음(①이 ②보다 크다) + 약한 과대평가 */
      const clip = (x) => Math.max(0, Math.min(1, x));
      const p1 = clip(truePct[own.no] + 0.06 + R.normal() * 0.25), p2 = clip(truePct[own.no] + 0.03 + R.normal() * 0.17);
      const rankOf = (p) => Math.max(1, Math.min(n, Math.round(n - p * (n - 1))));
      const sc = (bump) => { const o = {}; SELF_ITEMS.forEach((s) => { o[s.k] = Math.max(1, Math.min(5, Math.round(3.3 + truth[own.no] * 0.6 + bump + R.normal() * 0.7))); }); return o; };
      const r1 = rankOf(p1), r2 = rankOf(p2);
      doc.self = {
        s1: { scores: sc(0.2), why: "흔적의 위치를 쓰임과 이어 보려고 했다", predRank: r1, n, predPct: predPctOf(r1, n), startedAt: new Date(T0 - 600000).toISOString(), submittedAt: new Date(T0 - 300000).toISOString(), durSec: 300 },
        s2: { scores: sc(0), why: "다른 작품과 견주니 캡션의 설명이 부족해 보인다", predRank: r2, n, predPct: predPctOf(r2, n), lockedAt: new Date(t + 600000).toISOString(), changeCode: R.u() < 0.55 ? "shifted" : "same", changeWhy: "비교하면서 흔적의 원인을 설명했는지를 보게 됐다", startedAt: new Date(t + 300000).toISOString(), submittedAt: new Date(t + 700000).toISOString(), durSec: 400 },
      };
    }
    out[sid] = doc;
  });
  return out;
}

/* 반복 쌍 일치율의 모형 기대치 — 반복된 쌍마다 θ̂로 P̂² + (1 − P̂)² */
export function expectedRepeatAgreement(judgements, theta) {
  const reps = (judgements || []).filter((J) => J.rep != null);
  if (!reps.length) return null;
  let s = 0;
  reps.forEach((J) => { const P = sigmoid((theta[J.a] || 0) - (theta[J.b] || 0)); s += P * P + (1 - P) * (1 - P); });
  return s / reps.length;
}

export { workOfSid };
