/* 상호평가 핵심 계산 회귀 검사 — node --test src-assess-core.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import {
  makePlan, validatePlan, pairsForLateJudge, myPairs, planHash, dSequence,
  bradleyTerry, scaleSeparation, splitHalf, judgeFit, positionBias, connectivity, repeatAgreement, ranksAndBands,
  collectJudgements, aggregate, csvJudgements, csvScores, csvSelf, csvSubmissions, csvJudges, buildSampleAssess, judgeBlockOf,
  wilson, predPctOf, simText, submissionFromWs, subReady, stableHash, peerCfg, DEFAULT_PEER, TAG_OPTIONS, QUALITY_MIN,
} from "./src-assess-core.mjs";

const sids = (n, from = 20301) => Array.from({ length: n }, (_, i) => String(from + i));
const worksOf = (ids) => ids.map((sid, i) => ({ no: "A-" + String(i + 1).padStart(2, "0"), sid }));
const pairKey = (a, b) => (a < b ? a + "::" + b : b + "::" + a);

function exposures(plan) {
  const ex = {};
  Object.values(plan).forEach((items) => items.forEach((it) => {
    if (it.rep != null) return;
    ex[it.a] = (ex[it.a] || 0) + 1; ex[it.b] = (ex[it.b] || 0) + 1;
  }));
  return ex;
}

test("24명·24작품·k=12 — 자기 작품 없음, 판정자 안 중복 쌍 없음, 작품마다 정확히 24회 노출", () => {
  const ids = sids(24);
  const works = worksOf(ids);
  const made = makePlan({ works, judges: ids, k: 12, repeat: 1, seed: "2026-04-02T05:20:00.000Z" });
  assert.deepEqual(made.errors, []);
  assert.equal(made.kEff, 12);
  ids.forEach((sid, i) => {
    const items = made.plan[sid];
    assert.equal(items.length, 13);                       // 12 + 반복 1
    assert.equal(items.filter((it) => it.rep == null).length, 12);
    const own = works[i].no;
    const keys = new Set();
    items.forEach((it, idx) => {
      assert.equal(it.i, idx);
      assert.notEqual(it.a, own); assert.notEqual(it.b, own);
      assert.notEqual(it.a, it.b);
      if (it.rep == null) { assert.equal(keys.has(pairKey(it.a, it.b)), false); keys.add(pairKey(it.a, it.b)); }
    });
    const rep = items[12];
    assert.ok(rep.rep >= 0 && rep.rep <= 9, "반복 원본은 앞쪽 k-3개 안에서 고른다");   // 사이에 3화면 이상
    assert.equal(pairKey(rep.a, rep.b), pairKey(items[rep.rep].a, items[rep.rep].b));
    assert.notEqual(rep.left, items[rep.rep].left);
  });
  const ex = exposures(made.plan);
  works.forEach((w) => assert.equal(ex[w.no], 24));
  assert.equal(made.stats.connected, true);
  assert.equal(made.stats.exposureMin, 24);
  assert.equal(made.stats.exposureMax, 24);
  assert.ok(made.stats.distinctPairs >= 24 * 12 / 2, "쌍의 종류가 충분히 다양해야 한다");
  assert.ok(made.stats.sideDevMax <= 1, "작품별 좌우 차이 " + made.stats.sideDevMax);
  assert.ok(made.stats.sideDevMaxRep <= 2, "반복 포함 작품별 좌우 차이 " + made.stats.sideDevMaxRep);
  assert.ok(made.stats.judgeSideDevMax <= 2, "판정자별 좌우 차이 " + made.stats.judgeSideDevMax);
  assert.match(made.hash, /^[0-9a-f]{8}$/);
});

test("같은 입력이면 같은 배정, seed가 다르면 다른 배정, 입력 순서와 무관", () => {
  const ids = sids(20);
  const works = worksOf(ids);
  const a = makePlan({ works, judges: ids, k: 10, repeat: 1, seed: "s1" });
  const b = makePlan({ works: [...works].reverse(), judges: [...ids].reverse(), k: 10, repeat: 1, seed: "s1" });
  const c = makePlan({ works, judges: ids, k: 10, repeat: 1, seed: "s2" });
  assert.deepEqual(a.plan, b.plan);
  assert.equal(a.hash, b.hash);
  assert.notEqual(a.hash, c.hash);
  assert.equal(planHash(a.plan), a.hash);
});

test("작품 없는 판정자(미제출)도 k쌍을 받고 자기 작품 제외 조건 없이 노출이 고르게 늘어난다", () => {
  const ids = sids(26);
  const works = worksOf(ids.slice(0, 22));   // 4명은 미제출
  const made = makePlan({ works, judges: ids, k: 12, repeat: 1, seed: "x" });
  assert.deepEqual(made.errors, []);
  ids.slice(22).forEach((sid) => {
    const main = made.plan[sid].filter((it) => it.rep == null);
    assert.equal(main.length, 12);
    assert.equal(new Set(main.map((it) => pairKey(it.a, it.b))).size, 12);
  });
  const ex = exposures(made.plan);
  const vals = works.map((w) => ex[w.no]);
  assert.ok(Math.max(...vals) - Math.min(...vals) <= 2, "노출 편차 " + (Math.max(...vals) - Math.min(...vals)));
});

test("k가 n−1보다 크면 n−1로 줄이고, 작품 4점 미만이면 오류", () => {
  const ids = sids(6);
  const made = makePlan({ works: worksOf(ids), judges: ids, k: 12, repeat: 1, seed: "s" });
  assert.equal(made.kEff, 5);
  assert.deepEqual(made.errors, []);
  const bad = makePlan({ works: worksOf(sids(3)), judges: sids(3), k: 5, repeat: 1, seed: "s" });
  assert.ok(bad.errors.length > 0);
  const dup = makePlan({ works: [{ no: "A-01", sid: "1" }, { no: "A-01", sid: "2" }, { no: "A-02", sid: "3" }, { no: "A-03", sid: "4" }], judges: ["1", "2", "3", "4"], k: 3, seed: "s" });
  assert.ok(dup.errors.some((e) => e.includes("겹칩니다")));
});

test("홀수 학급(25명)과 작은 학급(8명·k=6)에서도 조건이 지켜진다", () => {
  for (const [n, k] of [[25, 12], [8, 6], [31, 12], [30, 16]]) {
    const ids = sids(n);
    const works = worksOf(ids);
    const made = makePlan({ works, judges: ids, k, repeat: 1, seed: "n" + n });
    assert.deepEqual(made.errors, [], "n=" + n);
    const ex = exposures(made.plan);
    works.forEach((w) => assert.equal(ex[w.no], 2 * made.kEff, "n=" + n + " " + w.no));
    assert.equal(made.stats.connected, true);
  }
});

test("validatePlan은 변조를 잡는다 — 자기 작품·중복 쌍·반복 좌우·번호 어긋남", () => {
  const ids = sids(8);
  const works = worksOf(ids);
  const made = makePlan({ works, judges: ids, k: 5, repeat: 1, seed: "v" });
  assert.deepEqual(validatePlan({ plan: made.plan, works, judges: ids, k: 5, repeat: 1 }), []);
  const p1 = structuredClone(made.plan);
  p1[ids[0]][0].a = works[0].no;
  assert.ok(validatePlan({ plan: p1, works, judges: ids, k: 5 }).some((e) => e.includes("자기 작품")));
  const p2 = structuredClone(made.plan);
  p2[ids[1]][1] = { ...p2[ids[1]][0], i: 1 };
  assert.ok(validatePlan({ plan: p2, works, judges: ids, k: 5 }).some((e) => e.includes("두 번")));
  const p3 = structuredClone(made.plan);
  p3[ids[2]][5].left = p3[ids[2]][0].left;
  assert.ok(validatePlan({ plan: p3, works, judges: ids, k: 5 }).some((e) => e.includes("뒤집히지")));
  const p4 = structuredClone(made.plan);
  p4[ids[3]][2].i = 9;
  assert.ok(validatePlan({ plan: p4, works, judges: ids, k: 5 }).some((e) => e.includes("화면 번호")));
});

test("명단 뒤 늦게 온 판정자는 결정론적인 쌍을 받고 myPairs가 이를 되돌려준다", () => {
  const ids = sids(20);
  const works = worksOf(ids);
  const made = makePlan({ works, judges: ids, k: 10, repeat: 1, seed: "late" });
  const roster = { fixedAt: "late", seed: "late", k: 10, repeat: 1, works, plan: made.plan };
  const late = myPairs(roster, "99999");
  assert.equal(late.length, 11);
  assert.deepEqual(late, pairsForLateJudge({ works, sid: "99999", k: 10, repeat: 1, seed: "late" }));
  assert.equal(new Set(late.filter((it) => it.rep == null).map((it) => pairKey(it.a, it.b))).size, 10);
  assert.deepEqual(myPairs(roster, ids[3]), made.plan[ids[3]]);
  assert.deepEqual(myPairs(null, ids[3]), []);
});

test("dSequence — B≠j, A≠B, 앞 회차와 같은 쌍을 만들지 않는다", () => {
  for (const n of [8, 12, 24, 25, 30]) {
    const ds = dSequence(n, n - 1, "d" + n);
    ds.forEach((d, i) => {
      const r = i + 1;
      assert.ok(d >= 1 && d <= n - 1);
      assert.notEqual((r + d) % n, 0, "n=" + n + " r=" + r);
    });
  }
});

/* ---- 점수 ---- */

function simulate({ n = 24, k = 12, seed = "sim", noise = 1.0, judgeNoise = 0.6 }) {
  const ids = sids(n);
  const works = worksOf(ids);
  const made = makePlan({ works, judges: ids, k, repeat: 1, seed });
  const truth = {};
  works.forEach((w, i) => { truth[w.no] = (i - (n - 1) / 2) * (3 / n); });   // 등간격 진짜 능력
  let s = stableHash(seed + "::sim");
  const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  const assessMap = {};
  ids.forEach((sid) => {
    const jn = (rnd() - 0.5) * judgeNoise;
    const items = made.plan[sid].map((it) => {
      const P = 1 / (1 + Math.exp(-((truth[it.a] - truth[it.b]) / noise + jn * 0)));
      return { ...it, win: rnd() < P ? "a" : "b", conf: 3, why: "이유 " + it.i + " 손잡이 마모가 쓰임과 이어져서", tag: "cause", ms: 12000, plateOpened: false, at: "t" };
    });
    assessMap[sid] = { self: {}, judge: { p1: { rosterVer: seed, planHash: made.hash, items, submittedAt: "t" } } };
  });
  const roster = { fixedAt: seed, seed, k, repeat: 1, works, judges: ids, plan: made.plan, hash: made.hash };
  return { ids, works, roster, assessMap, truth };
}

test("Bradley–Terry — 진짜 순위를 복원하고 전승·전패도 유한, θ 평균 0, 표준오차 양수", () => {
  const { works, roster, assessMap, truth } = simulate({ noise: 0.6 });
  const J = collectJudgements(assessMap, roster);
  const nos = works.map((w) => w.no);
  const bt = bradleyTerry(J, nos);
  assert.equal(bt.converged, true);
  const thetas = nos.map((no) => bt.theta[no]);
  assert.ok(Math.abs(thetas.reduce((a, b) => a + b, 0) / nos.length) < 1e-9);
  nos.forEach((no) => { assert.ok(Number.isFinite(bt.theta[no])); assert.ok(bt.se[no] > 0); assert.equal(bt.plays[no], 24); });
  // 진짜 값과의 상관
  const mx = nos.reduce((a, no) => a + truth[no], 0) / nos.length;
  let sxy = 0, sxx = 0, syy = 0;
  nos.forEach((no) => { sxy += (truth[no] - mx) * bt.theta[no]; sxx += (truth[no] - mx) ** 2; syy += bt.theta[no] ** 2; });
  const r = sxy / Math.sqrt(sxx * syy);
  assert.ok(r > 0.9, "진짜 능력과의 상관 " + r);
  // 전승 작품 — 발산하지 않는다
  const allWin = J.filter((x) => x.rep == null).map((x) => ({ ...x, win: x.a === "A-01" ? "a" : x.b === "A-01" ? "b" : x.win }));
  const bt2 = bradleyTerry(allWin, nos);
  assert.ok(Number.isFinite(bt2.theta["A-01"]) && bt2.theta["A-01"] < 8);
  assert.equal(ranksAndBands(bt2.theta).rank["A-01"], 1);
});

test("SSR·반분·적합도·위치·반복·연결성이 계산되고 집계가 공개 가능 판정을 낸다", () => {
  const { works, roster, assessMap } = simulate({ noise: 0.5 });
  const agg = aggregate({ roster, assessMap, subMap: {}, cfg: DEFAULT_PEER, splitReps: 10 });
  assert.equal(agg.works.length, 24);
  assert.equal(agg.works[0].rank, 1);
  assert.ok(agg.quality.ssr > 0.7, "SSR " + agg.quality.ssr);
  assert.ok(agg.quality.splitHalf.median > 0.7, "split-half " + agg.quality.splitHalf.median);
  assert.equal(agg.quality.splitHalf.n, 10);
  assert.equal(agg.quality.connectivity.connected, true);
  assert.equal(agg.quality.perWorkMean, 24);
  assert.equal(agg.quality.nJudgements, 24 * 12);
  assert.equal(agg.quality.repeat.n, 24);
  assert.ok(agg.quality.position.leftRate > 0.3 && agg.quality.position.leftRate < 0.7);
  assert.equal(agg.ok, true, agg.reasons.join(" / "));
  const sid = works[0].sid;
  assert.equal(agg.results[sid].no, "A-01");
  assert.equal(agg.results[sid].rosterVer, roster.fixedAt);
  assert.ok(["상", "중", "하"].includes(agg.results[sid].band));
  Object.values(agg.quality.judges).forEach((f) => { assert.equal(f.n, 12); assert.ok(f.infit > 0); });
});

test("무작위 판정(정보 없음)에서는 신뢰도가 낮고 집계가 공개 보류를 권고한다", () => {
  const { roster, assessMap } = simulate({ noise: 1000 });
  const agg = aggregate({ roster, assessMap, subMap: {}, cfg: DEFAULT_PEER, splitReps: 10 });
  assert.ok(agg.quality.ssr < 0.6, "SSR " + agg.quality.ssr);
  assert.equal(agg.ok, false);
  assert.ok(agg.reasons.length > 0);
});

test("판정 부족·명단 없음은 조용히 실패하지 않는다", () => {
  const none = aggregate({ roster: null, assessMap: {}, subMap: {}, cfg: DEFAULT_PEER });
  assert.equal(none.ok, false);
  const { roster } = simulate({ n: 8, k: 6 });
  const empty = aggregate({ roster, assessMap: {}, subMap: {}, cfg: DEFAULT_PEER, splitReps: 5 });
  assert.equal(empty.ok, false);
  assert.equal(empty.works.length, 8);
  assert.ok(empty.reasons.some((r) => r.includes("판정이 아직")));
});

test("옛 명단의 판정은 집계에서 빠진다", () => {
  const { roster, assessMap } = simulate({ n: 8, k: 6 });
  const sid = Object.keys(assessMap)[0];
  assessMap[sid].judge.p1.rosterVer = "old";
  const J = collectJudgements(assessMap, roster);
  assert.equal(J.filter((x) => x.judge === sid).length, 0);
});

test("자기예측 편향과 보정량 — 예측 백분위와 실제 백분위의 차", () => {
  const { works, roster, assessMap } = simulate({ noise: 0.5 });
  const sid = works[0].sid;                 // 진짜 최하위 작품
  const n = works.length;
  assessMap[sid].self = {
    s1: { scores: { overall: 4 }, predRank: 3, n, predPct: predPctOf(3, n), submittedAt: "t" },
    s2: { scores: { overall: 3 }, predRank: 18, n, predPct: predPctOf(18, n), submittedAt: "t", lockedAt: "t" },
  };
  const agg = aggregate({ roster, assessMap, subMap: {}, cfg: DEFAULT_PEER, splitReps: 5 });
  const r = agg.results[sid];
  assert.ok(r.bias1 > r.bias2, "과대평가가 줄어야 한다");
  assert.ok(r.calib > 0);
  assert.equal(predPctOf(1, 24), 1);
  assert.equal(predPctOf(24, 24), 0);
});

test("판정자 적합도 — 항상 반대로 고르는 판정자는 infit이 크고 역방향률이 높다", () => {
  const { works, roster, assessMap } = simulate({ noise: 0.5 });
  const nos = works.map((w) => w.no);
  const J = collectJudgements(assessMap, roster);
  const bt = bradleyTerry(J, nos);
  const bad = J.map((x) => (x.judge === "20301" ? { ...x, win: x.win === "a" ? "b" : "a", winNo: x.loseNo, loseNo: x.winNo, chosenLeft: !x.chosenLeft } : x));
  const fit = judgeFit(bad, bt.theta);
  const others = Object.keys(fit).filter((s) => s !== "20301").map((s) => fit[s].infit);
  assert.ok(fit["20301"].infit > Math.max(...others), "infit " + fit["20301"].infit);
  assert.ok(fit["20301"].againstRate > 0.7);
});

test("반복 일치·위치 편향·윌슨 구간·2-gram 유사도", () => {
  const { roster, assessMap } = simulate({ n: 8, k: 6 });
  const J = collectJudgements(assessMap, roster);
  const rep = repeatAgreement(J);
  assert.equal(rep.n, 8);
  assert.ok(rep.rate >= 0 && rep.rate <= 1);
  const pb = positionBias(J);
  assert.equal(pb.n, 48);
  assert.ok(pb.wilson[0] <= pb.leftRate && pb.leftRate <= pb.wilson[1]);
  const [lo, hi] = wilson(12, 24);
  assert.ok(lo > 0.3 && hi < 0.7);
  assert.deepEqual(wilson(0, 0), [0, 1]);
  assert.ok(simText("손잡이 안쪽만 닳아 있어서", "손잡이 안쪽만 닳아 있어서 ") > 0.95);
  assert.ok(simText("손잡이 안쪽만 닳아 있어서", "빛 방향이 하나로 맞다") < 0.2);
  const c = connectivity(J, roster.works.map((w) => w.no));
  assert.equal(c.connected, true);
});

test("CSV 행 — 익명 번호만 나가고 학번은 나가지 않는다", () => {
  const { ids, works, roster, assessMap } = simulate({ n: 8, k: 6 });
  const pidOf = new Map(ids.map((sid, i) => [sid, "P" + String(i + 1).padStart(2, "0")]));
  const subMap = {};
  works.forEach((w) => { subMap[w.sid] = { no: w.no, title: "t", plate: { relic: "r" }, locked: true, img: { owner: w.sid, ref: "x" }, submittedAt: "t" }; });
  const j = csvJudgements({ roster, assessMap, pidOf });
  assert.equal(j.rows.length, 8 * 7);
  assert.equal(j.head[0], "pid");
  j.rows.forEach((r) => assert.match(String(r[0]), /^P\d\d$/));
  const flat = JSON.stringify([j, csvSubmissions({ roster, subMap, pidOf }), csvSelf({ roster, assessMap, pidOf })]);
  ids.forEach((sid) => assert.equal(flat.includes(sid), false, "학번 노출 " + sid));
  const agg = aggregate({ roster, assessMap, subMap, cfg: DEFAULT_PEER, splitReps: 3 });
  const sc = csvScores({ agg, pidOf });
  assert.equal(sc.rows.length, 8);
  assert.equal(JSON.stringify(sc).includes("20301"), false);
});

test("표본 자료는 집계까지 돌아가고 결정론적이다", () => {
  const a = buildSampleAssess(sids(8));
  const b = buildSampleAssess(sids(8));
  assert.deepEqual(a, b);
  assert.equal(a.roster.works.length, 8);
  const agg = aggregate({ roster: a.roster, assessMap: a.assessMap, subMap: a.subMap, cfg: a.cfg, splitReps: 5 });
  assert.equal(agg.works.length, 8);
  assert.ok(agg.quality.nJudgements > 0);
});

test("제출 초안과 준비 판정, 설정 기본값", () => {
  const ws = { "s7x.no": " A-03 ", "s6b.title": "오른손", "s6b.relic": "손잡이", "s6b.aiScope": "전부 AI", "s6b.aiLevel": "AI가 생성한 이미지를 거의 그대로 썼다", "s7x.img": { ref: "s7x.img.1" }, "s7.note": "노트" };
  const d = submissionFromWs(ws, "20301");
  assert.equal(d.no, "A-03");
  assert.deepEqual(d.img, { owner: "20301", ref: "s7x.img.1" });
  assert.equal(d.plate.aiScope, undefined);
  assert.equal(d.aiLevel, "AI가 생성한 이미지를 거의 그대로 썼다");
  assert.equal(subReady({ ...d, locked: true }), true);
  assert.equal(subReady({ ...d, locked: false }), false);
  assert.equal(subReady({ ...d, locked: true, img: null }), false);
  assert.equal(peerCfg(null).k, 12);
  assert.equal(peerCfg({ peer: { k: 8 } }).k, 8);
  assert.equal(peerCfg({ peer: { k: 8 } }).stage, "closed");
});

test("작은 학급(4점·k=3)과 최소 k=4에서도 200개 seed 모두 배정이 만들어지고 그래프가 이어진다", () => {
  for (let t = 0; t < 200; t += 1) {
    const seed = "2026-09-10T0" + (t % 10) + ":" + String(t).padStart(2, "0") + ":00.000Z";
    const ids4 = sids(4);
    const m4 = makePlan({ works: worksOf(ids4), judges: ids4, k: 3, repeat: 1, seed });
    assert.deepEqual(m4.errors, [], "n=4 seed " + seed);
    assert.equal(m4.stats.connected, true);
    const ids30 = sids(30);
    const m30 = makePlan({ works: worksOf(ids30), judges: ids30, k: 4, repeat: 1, seed });
    assert.deepEqual(m30.errors, [], "n=30 k=4 seed " + seed);
    assert.equal(m30.stats.connected, true);
  }
});

test("배정표와 맞지 않는 판정(자기 작품 끼워 넣기 등)은 집계에서 걸러진다", () => {
  const { works, roster, assessMap } = simulate({ noise: 0.5 });
  const worst = works[0];                              // 진짜 최하위
  const honest = aggregate({ roster, assessMap, subMap: {}, cfg: DEFAULT_PEER, splitReps: 3 });
  const forged = structuredClone(assessMap);
  const others = works.slice(1).map((w) => w.no);
  const fake = Array.from({ length: 60 }, (_, i) => ({ i: 100 + i, a: worst.no, b: others[i % others.length], left: "a", rep: null, win: "a", conf: 5, why: "내 작품이 최고다 정말로 그렇다", tag: "veri", ms: 9000, plateOpened: false, at: "t" }));
  forged[worst.sid].judge.p1.items = forged[worst.sid].judge.p1.items.concat(fake);
  const stats = {};
  const J = collectJudgements(forged, roster, { stats });
  assert.equal(stats.dropped, 60);
  assert.deepEqual(stats.droppedJudges, [worst.sid]);
  assert.equal(J.filter((x) => x.judge === worst.sid).length, 13);
  const agg = aggregate({ roster, assessMap: forged, subMap: {}, cfg: DEFAULT_PEER, splitReps: 3 });
  assert.equal(agg.results[worst.sid].rank, honest.results[worst.sid].rank);
  assert.equal(agg.quality.droppedN, 60);
  assert.ok(agg.reasons.some((r) => r.includes("배정표와 맞지 않는")));
  // 명단 해시가 없는 블록도 이 명단의 것이 아니다
  const noHash = structuredClone(assessMap);
  delete noHash[works[1].sid].judge.p1.planHash;
  assert.equal(collectJudgements(noHash, roster).filter((x) => x.judge === works[1].sid).length, 0);
});

test("동점은 공동 순위·같은 밴드, 비교 0회는 순위 없음", () => {
  const rb = ranksAndBands({ A: 1, B: 1, C: 0.2, D: -0.5, E: -0.5, F: -1 }, { A: 3, B: 3, C: 3, D: 3, E: 3, F: 0 });
  assert.equal(rb.rank.A, 1); assert.equal(rb.rank.B, 1); assert.equal(rb.rank.C, 3);
  assert.equal(rb.band.A, rb.band.B);
  assert.equal(rb.rank.D, rb.rank.E); assert.equal(rb.band.D, rb.band.E);
  assert.equal(rb.rank.F, null); assert.equal(rb.band.F, null); assert.equal(rb.pct.F, null);
});

test("명단을 다시 확정하면 판정 블록이 새 자리에 쌓이고 옛 블록은 남는다", () => {
  const ids = sids(8);
  const works = worksOf(ids);
  const m1 = makePlan({ works, judges: ids, k: 5, repeat: 1, seed: "r1" });
  const r1 = { fixedAt: "r1", seed: "r1", k: 5, repeat: 1, works, judges: ids, plan: m1.plan, hash: m1.hash };
  const doc = { judge: { p1: { rosterVer: "r1", planHash: m1.hash, items: m1.plan[ids[0]].map((it) => ({ ...it, win: "a" })), submittedAt: "t" } } };
  assert.equal(judgeBlockOf(doc, r1).key, "p1");
  assert.ok(judgeBlockOf(doc, r1).block);
  const m2 = makePlan({ works, judges: ids, k: 5, repeat: 1, seed: "r2" });
  const r2 = { ...r1, fixedAt: "r2", seed: "r2", plan: m2.plan, hash: m2.hash };
  const jb2 = judgeBlockOf(doc, r2);
  assert.equal(jb2.block, null);
  assert.equal(jb2.key, "r_" + m2.hash);
  doc.judge[jb2.key] = { rosterVer: "r2", planHash: m2.hash, items: m2.plan[ids[0]].slice(0, 2).map((it) => ({ ...it, win: "b" })), submittedAt: null };
  assert.equal(judgeBlockOf(doc, r2).key, "r_" + m2.hash);
  assert.equal(collectJudgements({ [ids[0]]: doc }, r2).length, 2);
  assert.equal(collectJudgements({ [ids[0]]: doc }, r1).length, 6);
  const csv = csvJudgements({ roster: r2, assessMap: { [ids[0]]: doc }, pidOf: new Map([[ids[0], "P01"]]) });
  assert.equal(csv.rows.filter((r) => r[2] === 1).length, 2);   // valid=1 은 새 명단의 것
  assert.equal(csv.rows.filter((r) => r[2] === 0).length, 6);   // 옛 명단의 것은 valid=0으로 남는다
  assert.equal(new Set(csv.rows.map((r) => r[1])).size, 2);
});

test("위치 편향은 축(좌우·위아래)별로 나뉘고 판정자 CSV가 만들어진다", () => {
  const { roster, assessMap } = simulate({ n: 8, k: 6 });
  const sid = Object.keys(assessMap)[0];
  assessMap[sid].judge.p1.items = assessMap[sid].judge.p1.items.map((it, i) => ({ ...it, axis: i % 2 ? "y" : "x", vw: 390 }));
  const J = collectJudgements(assessMap, roster);
  const pb = positionBias(J);
  assert.equal(pb.byAxis.x.n + pb.byAxis.y.n + pb.byAxis.unknown.n, pb.n);
  assert.ok(pb.byAxis.y.n >= 3);
  const agg = aggregate({ roster, assessMap, subMap: {}, cfg: DEFAULT_PEER, splitReps: 3 });
  const cj = csvJudges({ agg, pidOf: new Map(Object.keys(assessMap).map((s, i) => [s, "P" + (i + 1)])) });
  assert.equal(cj.rows.length, 8);
  assert.equal(cj.head[0], "pid");
});

test("문헌 결정 반영 — 태그 다섯 보기, 판단 어려움·작성자 짐작 표시, SSR 주의 구간, 반분은 보고 지표", () => {
  assert.equal(TAG_OPTIONS.length, 5);
  assert.equal(TAG_OPTIONS[4].k, "whole");
  assert.equal(DEFAULT_PEER.askConf, false);
  assert.equal(DEFAULT_PEER.minWhy, 10);
  assert.equal(QUALITY_MIN.ssrAdopt, 0.8);
  const { roster, assessMap } = simulate({ n: 12, k: 8, noise: 0.5 });
  const sid = Object.keys(assessMap)[0];
  assessMap[sid].judge.p1.items = assessMap[sid].judge.p1.items.map((it, i) => ({ ...it, tag: "whole", hard: i % 2 === 0, knowAuthor: i === 0 }));
  const agg = aggregate({ roster, assessMap, subMap: {}, cfg: DEFAULT_PEER, splitReps: 5 });
  assert.ok(agg.quality.tagDist.whole >= 8);
  assert.ok(agg.quality.hardRate > 0 && agg.quality.knowRate > 0);
  assert.ok(Array.isArray(agg.cautions));
  assert.equal(typeof agg.caution, "boolean");
  assert.ok(agg.quality.splitHalf.medianRaw == null || agg.quality.splitHalf.medianRaw <= agg.quality.splitHalf.median + 1e-9);
  // 반분 신뢰도가 낮아도 보류 사유(reasons)에는 들어가지 않는다
  assert.equal(agg.reasons.some((r) => r.includes("반분")), false);
  Object.values(agg.quality.judges).forEach((f) => assert.equal(typeof f.flag, "boolean"));
  const cj = csvJudges({ agg, pidOf: (x) => "P" });
  assert.ok(cj.head.includes("flag") && cj.head.includes("hard_n"));
  const j = csvJudgements({ roster, assessMap, pidOf: (x) => "P" });
  assert.ok(j.head.includes("hard") && j.head.includes("know_author"));
});
