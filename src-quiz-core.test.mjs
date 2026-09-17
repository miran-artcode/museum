/* 적응형 쪽지시험 핵심 계산 회귀 검사 — node --test src-quiz-core.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import {
  QUIZ_VER, LEVELS, START_LEVEL, BLOCKS, BLOCK_SIZE, AREA_MIX, CELL_MIN, ROUTE_UP, ROUTE_DOWN, MIN_ANSWERED, SCORE_ROWS, RULE_SENTENCES,
  DEFAULT_QUIZ, quizCfg, FLAG_ORDER, RELIABILITY_NOTE, LEVEL_NAMES, LEVEL_WORDS, AREAS,
  hash32, hash53, mulberry32, deriveSeed, keyHashOf, isCorrect, shuffled, optionOrder,
  parseSeatGrid, halfOf, routeNext, bankCells, cellOrder, drawBlock, usedOf, replayServed,
  correctCount, scoreOf, scoreAttempt, clientScoreOf, flagsOf, recompute, resultItems, wilson,
  itemStats, twinStats, levelMonotonic, reliabilityStats, recordSheet, csvAttempts, csvResponses, csvEvents, csvItems,
  validateBank, splitBank, remainingSec, buildSampleQuiz, makeSyntheticBank, fmtMMSS,
} from "./src-quiz-core.mjs";

const sids = (n, from = 20301) => Array.from({ length: n }, (_, i) => String(from + i));

/* 블록 만들기: 급·정답 수·응답 수로 answers를 채운다. 모든 문항의 정답은 "a" */
const KEYS = {};
function mkBlock(level, correct, answered = BLOCK_SIZE, k = 1) {
  const itemIds = Array.from({ length: BLOCK_SIZE }, (_, i) => "L" + level + "K" + k + "I" + i);
  itemIds.forEach((id) => { KEYS[id] = "a"; });
  const answers = itemIds.map((_, i) => (i < correct ? "a" : i < answered ? "b" : null));
  return { level, itemIds, answers, at: "2026-09-15T01:10:00.000Z", auto: answered < BLOCK_SIZE, blockMs: 100000, pickMs: itemIds.map((_, i) => (i < answered ? 20000 : null)), correct };
}
/* [ [level, correct, answered], … ] → blocks 맵 (null 항목은 미시작 블록) */
function mkBlocks(spec) {
  const blocks = {};
  spec.forEach((s, i) => { if (s) blocks[String(i + 1)] = mkBlock(s[0], s[1], s[2] == null ? BLOCK_SIZE : s[2], i + 1); });
  return blocks;
}
/* 정답 수 배열로 규칙대로 급을 정해 블록을 만든다 (라우팅 규칙 검산용) */
function blocksFromCorrect(cs) {
  const spec = [];
  let level = START_LEVEL;
  cs.forEach((c, i) => { spec.push([level, c]); level = routeNext(level, c); });
  return mkBlocks(spec);
}

const synthBank = () => splitBank(makeSyntheticBank());
const OPT = ["a", "b", "c", "d"];

/* ---------- 상수·문구 ---------- */

test("상수와 규칙 문장: 줄표 없음, 다섯 문장, 점수표 9행, 기본 설정 병합", () => {
  assert.equal(QUIZ_VER, "q1");
  assert.equal(RULE_SENTENCES.length, 5);
  RULE_SENTENCES.forEach((s) => { assert.equal(s.includes("—"), false); assert.ok(s.endsWith("."), s); });
  assert.equal(RELIABILITY_NOTE.includes("—"), false);
  assert.equal(SCORE_ROWS.length, 9);
  assert.deepEqual(LEVELS, [1, 2, 3, 4, 5]);
  assert.equal(Object.keys(LEVEL_NAMES).length, 5); assert.equal(Object.keys(LEVEL_WORDS).length, 5); assert.equal(Object.keys(AREAS).length, 4);
  LEVELS.forEach((l) => { assert.equal(AREA_MIX[l].reduce((a, b) => a + b, 0), BLOCK_SIZE); });
  assert.equal(quizCfg(null).stage, "closed");
  assert.equal(quizCfg({}).durationSec, 2400);
  assert.equal(quizCfg({ quiz: { stage: "open" } }).stage, "open");
  assert.equal(quizCfg({ quiz: { stage: "open" } }).warnLimit, DEFAULT_QUIZ.warnLimit);
});

/* ---------- 해시·seed ---------- */

test("hash32·hash53·mulberry32·deriveSeed·keyHashOf·isCorrect: 결정론이고 입력이 다르면 값이 다르다", () => {
  assert.equal(hash32("abc"), hash32("abc"));
  assert.notEqual(hash32("abc"), hash32("abd"));
  assert.ok(hash32("x") >= 0 && hash32("x") <= 0xffffffff);
  assert.equal(hash53("abc"), hash53("abc"));
  assert.notEqual(hash53("abc"), hash53("abd"));
  assert.ok(Number.isSafeInteger(hash53("한글 문자열")));
  const r1 = mulberry32(7), r2 = mulberry32(7);
  const a = [r1(), r1(), r1()], b = [r2(), r2(), r2()];
  assert.deepEqual(a, b);
  a.forEach((x) => assert.ok(x >= 0 && x < 1));
  assert.equal(deriveSeed("20301", "salt"), hash32("20301|salt"));
  assert.notEqual(deriveSeed("20301", "salt"), deriveSeed("20302", "salt"));
  assert.notEqual(deriveSeed("20301", "salt"), deriveSeed("20301", "salt2"));
  const item = { id: "Q31A01", options: OPT.map((o) => ({ id: o, text: o })), keyHash: keyHashOf("Q31A01", "c", "s") };
  assert.match(item.keyHash, /^[0-9a-z]+$/);
  assert.equal(isCorrect(item, "c", "s"), true);
  assert.equal(isCorrect(item, "a", "s"), false);
  assert.equal(isCorrect(item, "c", "other"), false);
  assert.equal(isCorrect(item, null, "s"), false);
  assert.equal(isCorrect(null, "c", "s"), false);
});

test("shuffled·optionOrder: 같은 seed면 같은 순서, 문항이 다르면 순서가 달라지고 원본은 그대로", () => {
  const arr = [1, 2, 3, 4, 5, 6];
  const s1 = shuffled(arr, mulberry32(3)), s2 = shuffled(arr, mulberry32(3));
  assert.deepEqual(s1, s2);
  assert.deepEqual(arr, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual([...s1].sort(), arr);
  const mk = (id) => ({ id, options: OPT.map((o) => ({ id: o, text: o })) });
  assert.deepEqual(optionOrder(123, mk("Q31A01")), optionOrder(123, mk("Q31A01")));
  assert.deepEqual([...optionOrder(123, mk("Q31A01"))].sort(), OPT);
  const orders = new Set();
  for (let i = 1; i <= 40; i += 1) orders.add(optionOrder(123, mk("Q31A" + String(i).padStart(2, "0"))).join(""));
  assert.ok(orders.size > 5, "문항마다 보기 순서가 달라야 한다");
  const bySeed = new Set();
  for (let s = 1; s <= 40; s += 1) bySeed.add(optionOrder(s, mk("Q31A01")).join(""));
  assert.ok(bySeed.size > 5, "seed(학생)마다 보기 순서가 달라야 한다");
  assert.notDeepEqual(optionOrder(1, mk("Q31A01")), optionOrder(2, mk("Q31A01")));
});

/* ---------- 좌석·반 ---------- */

test("parseSeatGrid·halfOf: 격자·중복·빈자리, (행+열) 홀짝, 좌석표 없으면 학번 홀짝과 known:false", () => {
  const g = parseSeatGrid("20301 20302 -\n20303,20304,20305\n\n\t20306  20301");
  assert.equal(g.grid.length, 3);
  assert.deepEqual(g.grid[0], ["20301", "20302", ""]);
  assert.deepEqual(g.pos["20301"], { r: 0, c: 0 });
  assert.deepEqual(g.pos["20305"], { r: 1, c: 2 });
  assert.deepEqual(g.dup, ["20301"]);
  const cfg = { seatGrid: "20301 20302\n20303 20304" };
  assert.deepEqual(halfOf("20301", cfg), { half: "A", known: true });
  assert.deepEqual(halfOf("20302", cfg), { half: "B", known: true });
  assert.deepEqual(halfOf("20303", cfg), { half: "B", known: true });
  assert.deepEqual(halfOf("20304", cfg), { half: "A", known: true });
  assert.deepEqual(halfOf("20312", cfg), { half: "A", known: false });
  assert.deepEqual(halfOf("20313", {}), { half: "B", known: false });
  assert.deepEqual(halfOf("20313", null), { half: "B", known: false });
  assert.deepEqual(parseSeatGrid("").grid, []);
});

/* ---------- 라우팅·점수표 ---------- */

test("routeNext 경계: 4 이상 상승, 2 이하 하강, 3 유지, 1~5로 잘림", () => {
  assert.equal(ROUTE_UP, 4); assert.equal(ROUTE_DOWN, 2);
  assert.equal(routeNext(3, 5), 4); assert.equal(routeNext(3, 4), 4); assert.equal(routeNext(3, 3), 3);
  assert.equal(routeNext(3, 2), 2); assert.equal(routeNext(3, 1), 2); assert.equal(routeNext(3, 0), 2);
  assert.equal(routeNext(5, 5), 5); assert.equal(routeNext(5, 4), 5); assert.equal(routeNext(5, 2), 4);
  assert.equal(routeNext(1, 0), 1); assert.equal(routeNext(1, 2), 1); assert.equal(routeNext(1, 3), 1); assert.equal(routeNext(1, 4), 2);
});

test("scoreOf 표 전체: 행마다 경계값과 그 아래를 확인하고 n<10 이면 무조건 E 2점", () => {
  const S = (F, c) => scoreOf(F, c, 20);
  assert.deepEqual(S(5, 20), { score: 10, band: "A" }); assert.deepEqual(S(5, 18), { score: 10, band: "A" });
  assert.deepEqual(S(5, 17), { score: 9, band: "A" }); assert.deepEqual(S(5, 16), { score: 9, band: "A" });
  assert.deepEqual(S(5, 15), { score: 8, band: "A" }); assert.deepEqual(S(5, 14), { score: 8, band: "A" });
  assert.deepEqual(S(4, 17), { score: 7, band: "B" }); assert.deepEqual(S(4, 14), { score: 7, band: "B" });
  assert.deepEqual(S(4, 13), { score: 6, band: "B" }); assert.deepEqual(S(4, 11), { score: 6, band: "B" }); assert.deepEqual(S(4, 0), { score: 6, band: "B" });
  assert.deepEqual(S(3, 15), { score: 5, band: "C" }); assert.deepEqual(S(3, 8), { score: 5, band: "C" });
  assert.deepEqual(S(2, 14), { score: 4, band: "D" }); assert.deepEqual(S(2, 7), { score: 4, band: "D" });
  assert.deepEqual(S(1, 12), { score: 3, band: "E" }); assert.deepEqual(S(1, 9), { score: 3, band: "E" });
  assert.deepEqual(S(1, 8), { score: 2, band: "E" }); assert.deepEqual(S(1, 0), { score: 2, band: "E" });
  assert.deepEqual(scoreOf(5, 20, 9), { score: 2, band: "E" });
  assert.deepEqual(scoreOf(3, 9, MIN_ANSWERED), { score: 5, band: "C" });
  assert.deepEqual(scoreOf(3, 9, MIN_ANSWERED - 1), { score: 2, band: "E" });
  assert.deepEqual(scoreOf(5, 13, 20), { score: 8, band: "A" });   // 구조상 불가능한 조합은 그 F의 가장 낮은 행
  SCORE_ROWS.forEach((r) => assert.deepEqual(scoreOf(r.F, r.cMin, 20), { score: r.score, band: r.band }));
});

test("correctCount: 빈 답은 오답, 정정(allCorrect) 문항은 답과 무관하게 정답, 키 형식 둘 다 허용", () => {
  const b = mkBlock(3, 2, 4);
  assert.equal(correctCount(b, KEYS, null), 2);
  assert.equal(correctCount(b, KEYS, new Set([b.itemIds[4]])), 3);
  assert.equal(correctCount(b, KEYS, [{ itemId: b.itemIds[3], allCorrect: true }]), 3);
  assert.equal(correctCount(b, KEYS, [{ itemId: b.itemIds[0], allCorrect: true }]), 2);
  const doc = { items: Object.fromEntries(b.itemIds.map((id) => [id, { answer: "a" }])), corrections: [{ itemId: b.itemIds[2], allCorrect: true }] };
  assert.equal(correctCount(b, doc, doc), 3);
  assert.equal(correctCount({ itemIds: [], answers: [] }, KEYS, null), 0);
});

/* ---------- scoreAttempt: 경계 사례 가~카 ---------- */

const CASES = [
  ["가", [[3, 4], [4, 4], [5, 3], [5, 3]], { path: [3, 4, 5, 5], F: 5, c: 14, n: 20, score: 8, band: "A" }],
  ["나", [[3, 5], [4, 5], [5, 4], [5, 2]], { path: [3, 4, 5, 5], F: 4, c: 16, n: 20, score: 7, band: "B" }],
  ["다", [[3, 4], [4, 4], [5, 2], [4, 4]], { path: [3, 4, 5, 4], F: 4, c: 14, n: 20, score: 7, band: "B" }],
  ["라", [[3, 5], [4, 2], [3, 5], [4, 2]], { path: [3, 4, 3, 4], F: 3, c: 14, n: 20, score: 5, band: "C" }],
  ["마", [[3, 3], [3, 3], [3, 3], [3, 3]], { path: [3, 3, 3, 3], F: 3, c: 12, n: 20, score: 5, band: "C" }],
  ["바", [[3, 2], [2, 4], [3, 4], [4, 3]], { path: [3, 2, 3, 4], F: 4, c: 13, n: 20, score: 6, band: "B" }],
  ["사", [[3, 2], [2, 2], [1, 3], [1, 3]], { path: [3, 2, 1, 1], F: 1, c: 10, n: 20, score: 3, band: "E" }],
  ["아", [[3, 1], [2, 1], [1, 2], [1, 2]], { path: [3, 2, 1, 1], F: 1, c: 6, n: 20, score: 2, band: "E" }],
  ["자", [[3, 5], [4, 5], [5, 4], [5, 1, 2]], { path: [3, 4, 5, 5], F: 4, c: 15, n: 17, score: 7, band: "B" }],
  ["차", [[3, 3], [3, 2], [2, 2, 3], null], { path: [3, 3, 2, 1], F: 1, c: 7, n: 13, score: 2, band: "E" }],
  ["카", [[3, 3], [3, 4], [4, 1, 1], null], { path: [3, 3, 4, 3], F: 2, c: 8, n: 11, score: 4, band: "D" }],
];
CASES.forEach(([name, spec, want]) => {
  test("경계 사례 「" + name + "」: F " + want.F + " · c " + want.c + " · n " + want.n + " → " + want.band + " " + want.score + "점", () => {
    const res = scoreAttempt({ blocks: mkBlocks(spec), keys: KEYS, corrections: null });
    assert.deepEqual({ path: res.path, F: res.F, c: res.c, n: res.n, score: res.score, band: res.band }, want);
    assert.equal(res.blockCorrect.length, BLOCKS);
    assert.equal(res.answered.reduce((a, b) => a + b, 0), want.n);
  });
});

test("scoreAttempt: 블록이 하나도 없으면 path [3,2,1,1]·F1·c0·n0, 미시작 블록은 0/5로 이어진다, 숫자 키 블록도 받는다", () => {
  const r0 = scoreAttempt({ blocks: {}, keys: KEYS });
  assert.deepEqual([r0.path, r0.blockCorrect, r0.F, r0.c, r0.n, r0.score, r0.band], [[3, 2, 1, 1], [0, 0, 0, 0], 1, 0, 0, 2, "E"]);
  const r1 = scoreAttempt({ blocks: mkBlocks([[3, 5], null, null, null]), keys: KEYS });
  assert.deepEqual([r1.path, r1.blockCorrect, r1.F], [[3, 4, 3, 2], [5, 0, 0, 0], 1]);
  const r2 = scoreAttempt({ blocks: { 1: mkBlock(3, 4), 2: mkBlock(4, 4, 5, 2) }, keys: KEYS });
  assert.deepEqual(r2.path, [3, 4, 5, 4]);
  assert.equal(scoreAttempt({ blocks: null, keys: null }).F, 1);
});

test("전수 검산(6^4 경로): 5급 최종급이면 c >= 14, 경로는 규칙과 일치, 점수는 scoreOf와 같다, 급별 최대 방문 수", () => {
  let n5 = 0, cMin5 = 99;
  const maxVisit = {};
  for (let a = 0; a <= 5; a += 1) for (let b = 0; b <= 5; b += 1) for (let c = 0; c <= 5; c += 1) for (let d = 0; d <= 5; d += 1) {
    const cs = [a, b, c, d];
    const res = scoreAttempt({ blocks: blocksFromCorrect(cs), keys: KEYS });
    let level = START_LEVEL;
    const path = cs.map((x) => { const l = level; level = routeNext(level, x); return l; });
    assert.deepEqual(res.path, path);
    assert.deepEqual(res.blockCorrect, cs);
    assert.equal(res.c, a + b + c + d);
    assert.equal(res.n, 20);
    assert.deepEqual({ score: res.score, band: res.band }, scoreOf(res.F, res.c, res.n));
    assert.ok(res.F <= path[3], "위로 올리지 않는다");
    if (res.F === 5) { n5 += 1; cMin5 = Math.min(cMin5, res.c); assert.ok(res.c >= 14, "F=5 인데 c=" + res.c + " " + cs); }
    const visits = {};
    path.forEach((l) => { visits[l] = (visits[l] || 0) + 1; });
    Object.keys(visits).forEach((l) => { maxVisit[l] = Math.max(maxVisit[l] || 0, visits[l]); });
  }
  assert.ok(n5 > 0);
  assert.equal(cMin5, 14);
  assert.deepEqual(maxVisit, { 1: 2, 2: 3, 3: 4, 4: 3, 5: 2 });   // 쪽지시험_구현_근거.md §2.1
  LEVELS.forEach((l) => [1, 2, 3, 4].forEach((a) => assert.ok(CELL_MIN[l][a - 1] >= maxVisit[l] * AREA_MIX[l][a - 1], "CELL_MIN " + l + "-" + a)));
});

/* ---------- 추출 ---------- */

test("bankCells·cellOrder: 반별 칸 나누기와 seed별 결정론 순서", () => {
  const { pub } = synthBank();
  const A = bankCells(pub, "A"), B = bankCells(pub, "B");
  assert.equal(A["3-1"].length, CELL_MIN[3][0]);
  assert.equal(B["5-2"].length, CELL_MIN[5][1]);
  assert.equal(A["5-4"], undefined);
  assert.ok(A["3-1"].every((it) => it.half === "A"));
  const o1 = cellOrder(11, 3, 1, A["3-1"]).map((it) => it.id), o2 = cellOrder(11, 3, 1, A["3-1"]).map((it) => it.id);
  assert.deepEqual(o1, o2);
  assert.notDeepEqual(o1, cellOrder(12, 3, 1, A["3-1"]).map((it) => it.id));
});

test("drawBlock: 같은 seed면 같은 결과, 영역 배분이 AREA_MIX와 같고 used·disabled를 제외한다", () => {
  const { pub } = synthBank();
  const base = { bank: pub, half: "A", seed: 12345, level: 3, used: new Set(), disabled: [], noImage: false, k: 1 };
  const d1 = drawBlock(base), d2 = drawBlock(base);
  assert.deepEqual(d1, d2);
  assert.equal(d1.itemIds.length, BLOCK_SIZE);
  assert.equal(d1.crossHalf, false);
  const areaCount = [0, 0, 0, 0];
  d1.itemIds.forEach((id) => { assert.equal(id[3], "A"); assert.equal(id[1], "3"); areaCount[Number(id[2]) - 1] += 1; });
  assert.deepEqual(areaCount, AREA_MIX[3]);
  const d5 = drawBlock({ ...base, level: 5, k: 3 });
  const a5 = [0, 0, 0, 0];
  d5.itemIds.forEach((id) => { a5[Number(id[2]) - 1] += 1; });
  assert.deepEqual(a5, AREA_MIX[5]);
  const d3 = drawBlock({ ...base, used: new Set(d1.itemIds), k: 2 });
  assert.equal(d3.itemIds.some((id) => d1.itemIds.includes(id)), false);
  const dis = drawBlock({ ...base, disabled: [d1.itemIds[0]] });
  assert.equal(dis.itemIds.includes(d1.itemIds[0]), false);
  const disSet = drawBlock({ ...base, disabled: new Set([d1.itemIds[0]]) });
  assert.deepEqual(disSet.itemIds, dis.itemIds);
  assert.notDeepEqual(drawBlock({ ...base, seed: 999 }).itemIds, d1.itemIds);
  assert.notDeepEqual(drawBlock({ ...base, half: "B" }).itemIds, d1.itemIds);
});

test("drawBlock 최악 경로: CELL_MIN 크기 은행에서 25가지 급 경로 모두 반복 없음·반 넘김 없음·매 블록 5문항", () => {
  const { pub } = synthBank();
  const paths = new Set();
  for (let a = 0; a <= 5; a += 1) for (let b = 0; b <= 5; b += 1) for (let c = 0; c <= 5; c += 1) {
    let level = START_LEVEL;
    const p = [a, b, c].map((x) => { const l = level; level = routeNext(level, x); return l; });
    p.push(level);
    paths.add(p.join(","));
  }
  assert.equal(paths.size, 25);
  ["A", "B"].forEach((half) => [1, 77, 4242].forEach((seed) => {
    paths.forEach((key) => {
      const path = key.split(",").map(Number);
      const served = {};
      path.forEach((level, i) => {
        const d = drawBlock({ bank: pub, half, seed, level, used: usedOf(served), disabled: [], noImage: false, k: i + 1 });
        assert.equal(d.itemIds.length, BLOCK_SIZE, key + " 블록 " + (i + 1));
        assert.equal(d.crossHalf, false, key + " 블록 " + (i + 1) + " 반 넘김");
        d.itemIds.forEach((id) => assert.equal(id[3], half));
        served[i + 1] = { level, itemIds: d.itemIds };
      });
      const all = Object.values(served).flatMap((s) => s.itemIds);
      assert.equal(new Set(all).size, all.length, key + " 반복");
    });
  }));
});

test("drawBlock 이미지 규칙: 블록당 이미지 1개, noImage면 0개, 건너뛴 문항은 소비되지 않고 다음 블록에 나온다", () => {
  const { pub } = splitBank(makeSyntheticBank({ images: true }));
  const idx = new Map(pub.items.map((it) => [it.id, it]));
  const imgIds = pub.items.filter((it) => it.image).map((it) => it.id);
  assert.ok(imgIds.length > 0);
  let seedWithImg = null;
  for (let seed = 1; seed < 500 && seedWithImg == null; seed += 1) {
    const d = drawBlock({ bank: pub, half: "A", seed, level: 3, used: new Set(), disabled: [], noImage: false, k: 1 });
    if (d.skipped.length) seedWithImg = seed;
  }
  assert.ok(seedWithImg != null, "이미지 둘이 같은 블록에 오려는 seed가 있어야 한다");
  const d = drawBlock({ bank: pub, half: "A", seed: seedWithImg, level: 3, used: new Set(), disabled: [], noImage: false, k: 1 });
  assert.equal(d.itemIds.filter((id) => idx.get(id).image).length, 1);
  assert.equal(d.itemIds.length, BLOCK_SIZE);
  const d2 = drawBlock({ bank: pub, half: "A", seed: seedWithImg, level: 3, used: new Set(d.itemIds), disabled: [], noImage: false, k: 2 });
  assert.ok(d.skipped.every((id) => d2.itemIds.includes(id)), "건너뛴 이미지 문항은 다음 블록에서 나온다");
  for (let seed = 1; seed < 40; seed += 1) {
    [2, 3, 4].forEach((level) => {
      const n = drawBlock({ bank: pub, half: "B", seed, level, used: new Set(), disabled: [], noImage: true, k: 1 });
      assert.equal(n.itemIds.some((id) => idx.get(id).image), false);
      assert.equal(n.itemIds.length, BLOCK_SIZE);
    });
  }
});

test("drawBlock 반 넘김: 칸이 바닥나면 반대 반에서 채우고 crossHalf:true, 그래도 없으면 있는 만큼", () => {
  const { pub } = synthBank();
  const A = bankCells(pub, "A");
  const used = new Set(A["1-2"].map((it) => it.id));   // A반 1급 영역 ②를 다 썼다
  const d = drawBlock({ bank: pub, half: "A", seed: 5, level: 1, used, disabled: [], noImage: false, k: 1 });
  assert.equal(d.itemIds.length, BLOCK_SIZE);
  assert.equal(d.crossHalf, true);
  assert.equal(d.itemIds.filter((id) => id[3] === "B").length, 1);
  const both = new Set([...A["1-2"], ...bankCells(pub, "B")["1-2"]].map((it) => it.id));
  const d2 = drawBlock({ bank: pub, half: "A", seed: 5, level: 1, used: both, disabled: [], noImage: false, k: 1 });
  assert.equal(d2.itemIds.length, BLOCK_SIZE - 1);
});

test("usedOf·replayServed: 재현이 맞으면 ok, 문항 하나가 바뀌거나 급이 다르면 그 블록만 불일치", () => {
  const { pub } = synthBank();
  const seed = deriveSeed("20301", pub.seedSalt);
  const path = [3, 4, 5, 5];
  const served = {};
  path.forEach((level, i) => {
    const d = drawBlock({ bank: pub, half: "A", seed, level, used: usedOf(served), disabled: [], noImage: false, k: i + 1 });
    served[String(i + 1)] = { level, itemIds: [...d.itemIds].reverse(), at: "t" };   // 순서는 무시한다
  });
  assert.equal(usedOf(served).size, 20);
  const ok = replayServed({ bank: pub, half: "A", seed, path, served, disabled: [], noImage: false });
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.mismatches, []);
  assert.equal(Object.keys(ok.expected).length, 4);
  const bad = JSON.parse(JSON.stringify(served));
  bad["2"].itemIds[0] = "Q41A99";
  const r = replayServed({ bank: pub, half: "A", seed, path, served: bad, disabled: [], noImage: false });
  assert.equal(r.ok, false);
  assert.deepEqual(r.mismatches.map((m) => m.k), [2]);
  assert.equal(r.mismatches[0].actual.includes("Q41A99"), true);
  const badLevel = JSON.parse(JSON.stringify(served));
  badLevel["3"].level = 4;
  assert.deepEqual(replayServed({ bank: pub, half: "A", seed, path, served: badLevel }).mismatches.map((m) => m.k), [3]);
  const part = { 1: served["1"], 2: served["2"] };
  assert.equal(replayServed({ bank: pub, half: "A", seed, path, served: part }).ok, true);
  assert.equal(replayServed({ bank: pub, half: "B", seed, path, served }).ok, false);
});

/* ---------- 가채점·재계산 ---------- */

/* 은행으로 실제 응시 문서 하나를 만든다 (정답률 p 프로파일) */
function simulateAttempt({ pub, keys, sid, half = "A", pByLevel = { 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 }, stopAt = 0, answeredLast = 5 }) {
  const seed = deriveSeed(sid, pub.seedSalt);
  const rnd = mulberry32(seed);
  const served = {}, blocks = {};
  let level = START_LEVEL;
  for (let k = 1; k <= BLOCKS; k += 1) {
    const d = drawBlock({ bank: pub, half, seed, level, used: usedOf(served), disabled: [], noImage: false, k });
    served[String(k)] = { level, itemIds: d.itemIds, at: "t" };
    const last = stopAt && k === stopAt;
    const answers = d.itemIds.map((id, i) => {
      if (last && i >= answeredLast) return null;
      const ans = keys.items[id].answer;
      return rnd() < pByLevel[level] ? ans : OPT.filter((o) => o !== ans)[Math.floor(rnd() * 3)];
    });
    const c = d.itemIds.filter((id, i) => answers[i] === keys.items[id].answer).length;
    blocks[String(k)] = { level, itemIds: d.itemIds, answers, at: "t", auto: !!last, blockMs: 60000, pickMs: answers.map((a) => (a ? 30000 : null)), correct: c };
    if (last) break;
    level = routeNext(level, c);
  }
  const v = { ver: QUIZ_VER, sid, half, seed, bankVer: pub.ver, timeMult: 1, noImage: false, sess: "x", status: "done", cur: Object.keys(blocks).length,
    served, draft: {}, blocks, events: [], warn: 0, lock: { count: 0, at: null }, finishedAt: "t", clientScore: null, client: {} };
  v.clientScore = clientScoreOf({ blocks, bank: pub });
  return v;
}

test("clientScoreOf(keyHash)와 scoreAttempt(정답 키)가 같은 값을 내고, recompute는 불일치 없이 같은 점수를 낸다", () => {
  const { pub, keys } = synthBank();
  const v = simulateAttempt({ pub, keys, sid: "20301", pByLevel: { 1: 0.9, 2: 0.85, 3: 0.75, 4: 0.6, 5: 0.5 } });
  const s = scoreAttempt({ blocks: v.blocks, keys, corrections: keys.corrections });
  assert.deepEqual(v.clientScore, s);
  const r = recompute({ attempt: v, bank: pub, keys, cfg: DEFAULT_QUIZ, now: "2026-09-15T09:00:00.000Z" });
  assert.equal(r.mismatch, null);
  assert.equal(r.flags.includes("mismatch"), false);
  assert.deepEqual([r.path, r.blockCorrect, r.F, r.c, r.n, r.score, r.band], [s.path, s.blockCorrect, s.F, s.c, s.n, s.score, s.band]);
  assert.equal(r.bonus, false);
  assert.equal(r.computedAt, "2026-09-15T09:00:00.000Z");
  assert.equal(r.keyVer, pub.ver);
  assert.equal(r.warnCount, 0); assert.equal(r.lockCount, 0);
  const perfect = simulateAttempt({ pub, keys, sid: "20302" });
  const rp = recompute({ attempt: perfect, bank: pub, keys, cfg: DEFAULT_QUIZ });
  assert.deepEqual([rp.path, rp.F, rp.c, rp.score, rp.band], [[3, 4, 5, 5], 5, 20, 10, "A"]);
});

test("recompute 불일치: served 변조·가채점 변조·급 변조를 각각 잡고 detail에 적는다", () => {
  const { pub, keys } = synthBank();
  const v = simulateAttempt({ pub, keys, sid: "20303", pByLevel: { 1: 0.9, 2: 0.8, 3: 0.7, 4: 0.6, 5: 0.5 } });
  const t1 = JSON.parse(JSON.stringify(v));
  t1.served["2"].itemIds[0] = t1.blocks["2"].itemIds[0] = "Q41A07";
  const r1 = recompute({ attempt: t1, bank: pub, keys, cfg: DEFAULT_QUIZ });
  assert.ok(r1.mismatch && r1.mismatch.served && !r1.mismatch.score);
  assert.ok(r1.flags.includes("mismatch"));
  assert.match(r1.mismatch.detail, /블록 2 추출 불일치/);
  const t2 = JSON.parse(JSON.stringify(v));
  t2.clientScore.score = 10; t2.clientScore.c = 20; t2.clientScore.F = 5;   // 완벽한 점수로 고쳐 쓴 학생
  const r2 = recompute({ attempt: t2, bank: pub, keys, cfg: DEFAULT_QUIZ });
  assert.ok(r2.mismatch && r2.mismatch.score);
  assert.match(r2.mismatch.detail, /가채점 불일치/);
  const t3 = JSON.parse(JSON.stringify(v));
  t3.blocks["1"].level = 5; t3.served["1"].level = 5;
  const r3 = recompute({ attempt: t3, bank: pub, keys, cfg: DEFAULT_QUIZ });
  assert.ok(r3.mismatch && r3.mismatch.served);
  assert.match(r3.mismatch.detail, /급 불일치/);
  assert.equal(r3.mismatch.detail.includes("—"), false);
});

test("recompute 정정: 전원 정답 처리로 c가 오르고, 블록 1~3의 이동이 유리해졌으면 F+1(최대 5), 정정만으로는 불일치가 아니다", () => {
  const { pub, keys } = synthBank();
  const v = simulateAttempt({ pub, keys, sid: "20304", pByLevel: { 1: 0.9, 2: 0.85, 3: 0.7, 4: 0.55, 5: 0.45 } });
  const base = recompute({ attempt: v, bank: pub, keys, cfg: DEFAULT_QUIZ });
  // 블록 2에서 틀린 문항 하나를 정정하면 c+1. 그 블록 정답 수가 2→3 또는 3→4 이면 이동이 유리해져 F+1
  let target = null, kBlock = null;
  for (let k = 1; k <= 3 && !target; k += 1) {
    const b = v.blocks[String(k)];
    if (b.correct === 2 || b.correct === 3) {
      const i = b.itemIds.findIndex((id, j) => b.answers[j] !== keys.items[id].answer);
      if (i >= 0) { target = b.itemIds[i]; kBlock = k; }
    }
  }
  if (!target) {   // 이 seed에서 경계 블록이 없으면 인위로 만든다
    const b = v.blocks["1"];
    const wrongs = b.itemIds.map((id, j) => (b.answers[j] !== keys.items[id].answer ? j : -1)).filter((j) => j >= 0);
    const rights = b.itemIds.map((id, j) => (b.answers[j] === keys.items[id].answer ? j : -1)).filter((j) => j >= 0);
    // 정답 3개로 맞춘다
    while (rights.length > 3) { const j = rights.pop(); b.answers[j] = OPT.find((o) => o !== keys.items[b.itemIds[j]].answer); wrongs.push(j); }
    while (rights.length < 3) { const j = wrongs.pop(); b.answers[j] = keys.items[b.itemIds[j]].answer; rights.push(j); }
    target = b.itemIds[wrongs[0]]; kBlock = 1;
  }
  const withCorr = { ...keys, corrections: [{ itemId: target, allCorrect: true, reason: "정답 둘", at: "t" }] };
  const bBase = recompute({ attempt: v, bank: pub, keys, cfg: DEFAULT_QUIZ });
  const r = recompute({ attempt: v, bank: pub, keys: withCorr, cfg: DEFAULT_QUIZ });
  assert.equal(r.mismatch, null, "정정은 불일치가 아니다");
  assert.equal(r.c, bBase.c + 1);
  assert.deepEqual(r.path, bBase.path, "실제 경로는 바꾸지 않는다");
  assert.equal(r.bonus, true);
  assert.equal(r.F, Math.min(5, bBase.F + 1));
  assert.deepEqual(r.correctedIds, [target]);
  assert.equal(r.fBase, bBase.F);
  // corrections 인자를 따로 주어도 같다
  const r2 = recompute({ attempt: v, bank: pub, keys, corrections: [target], cfg: DEFAULT_QUIZ });
  assert.deepEqual([r2.F, r2.c, r2.bonus], [r.F, r.c, r.bonus]);
  // 이동이 유리해지지 않는 정정(이미 정답인 문항)은 F 그대로
  const rightId = v.blocks["1"].itemIds.find((id, j) => v.blocks["1"].answers[j] === keys.items[id].answer);
  const r3 = recompute({ attempt: v, bank: pub, keys, corrections: [rightId], cfg: DEFAULT_QUIZ });
  assert.equal(r3.bonus, false); assert.equal(r3.F, base.F); assert.equal(r3.c, base.c);
  assert.equal(kBlock >= 1, true);
});

test("recompute: 미완료 응시(블록 3 자동 제출, 2문항 응답)는 n<10 이면 incomplete·E 2점, 블록 없는 문서도 돌아간다", () => {
  const { pub, keys } = synthBank();
  const v = simulateAttempt({ pub, keys, sid: "20305", stopAt: 2, answeredLast: 3 });
  const r = recompute({ attempt: v, bank: pub, keys, cfg: DEFAULT_QUIZ });
  assert.equal(r.n, 8);
  assert.deepEqual([r.score, r.band], [2, "E"]);
  assert.ok(r.flags.includes("incomplete") && r.flags.includes("boundary3"));
  assert.equal(r.mismatch, null);
  const empty = recompute({ attempt: { sid: "x", half: "A", seed: 1, blocks: {}, served: {} }, bank: pub, keys, cfg: DEFAULT_QUIZ });
  assert.deepEqual([empty.path, empty.F, empty.c, empty.n], [[3, 2, 1, 1], 1, 0, 0]);
});

test("flagsOf: 경계 ①②③·경로 민감·미완료·짧은 이탈·중복 접속, 고정 순서", () => {
  const res = (F, c, n, bc) => ({ F, c, n, blockCorrect: bc, flags: [] });
  assert.deepEqual(flagsOf(res(5, 14, 20, [5, 5, 5, 5]), {}, {}), ["boundary1"]);
  assert.deepEqual(flagsOf(res(5, 20, 20, [5, 5, 5, 5]), {}, {}), []);
  assert.deepEqual(flagsOf(res(4, 13, 20, [5, 5, 5, 5]), {}, {}), ["boundary1"]);
  assert.deepEqual(flagsOf(res(4, 11, 20, [5, 5, 5, 5]), {}, {}), []);
  assert.deepEqual(flagsOf(res(1, 10, 20, [5, 5, 5, 5]), {}, {}), ["boundary1"]);
  assert.deepEqual(flagsOf(res(3, 12, 20, [3, 3, 3, 3]), {}, {}), ["boundary2", "pathSensitive"]);
  assert.deepEqual(flagsOf(res(3, 12, 20, [5, 5, 4, 5]), {}, {}), ["boundary2"]);
  assert.deepEqual(flagsOf(res(3, 12, 19, [5, 5, 5, 5]), {}, {}), ["boundary3"]);
  assert.deepEqual(flagsOf(res(3, 5, 9, [5, 0, 0, 0]), {}, {}), ["boundary3", "incomplete"]);
  const ev = (type, n) => Array.from({ length: n }, () => ({ type }));
  assert.deepEqual(flagsOf(res(3, 12, 20, [5, 5, 5, 5]), {}, { events: ev("blur_short", 5) }), ["shortBlur"]);
  assert.deepEqual(flagsOf(res(3, 12, 20, [5, 5, 5, 5]), {}, { events: ev("blur_short", 4) }), []);
  assert.deepEqual(flagsOf(res(3, 12, 20, [5, 5, 5, 5]), {}, { events: [{ type: "dup" }] }), ["dup"]);
  const all = flagsOf({ F: 5, c: 15, n: 9, blockCorrect: [3, 4, 5, 5], flags: ["mismatch"] }, {}, { events: [...ev("blur_short", 6), { type: "dup" }] });
  assert.deepEqual(all, FLAG_ORDER);
});

test("resultItems: 시작한 블록의 문항만, 표시 순서는 optionOrder, 정답·해설·정정 표시", () => {
  const { pub, keys } = synthBank();
  const v = simulateAttempt({ pub, keys, sid: "20306", stopAt: 3 });
  const items = resultItems({ attempt: v, bank: pub, keysDoc: keys, seed: v.seed });
  assert.equal(items.length, 15);
  items.forEach((it) => {
    assert.ok(it.k >= 1 && it.k <= 3);
    assert.deepEqual(it.options.map((o) => o.id), optionOrder(v.seed, pub.items.find((x) => x.id === it.id)));
    assert.equal(it.answer, keys.items[it.id].answer);
    assert.equal(it.expl, keys.items[it.id].expl);
    assert.equal(it.correct, it.pick === it.answer);
    assert.ok(typeof it.stem === "string" && it.stem.length > 0);
  });
  const withCorr = { ...keys, corrections: [{ itemId: items[0].id, allCorrect: true }] };
  const items2 = resultItems({ attempt: v, bank: pub, keysDoc: withCorr });
  assert.equal(items2[0].correct, true); assert.equal(items2[0].corrected, true);
  assert.deepEqual(resultItems({ attempt: { blocks: {} }, bank: pub, keysDoc: keys, seed: 1 }), []);
});

test("wilson: 0~1 안, p=.5·n=20 구간, n=0 이면 [0,1]", () => {
  const [lo, hi] = wilson(0.5, 20);
  assert.ok(lo > 0.29 && lo < 0.30, String(lo));
  assert.ok(hi > 0.70 && hi < 0.71, String(hi));
  assert.deepEqual(wilson(0.5, 0), [0, 1]);
  assert.deepEqual(wilson(1, 5)[1], 1);
  assert.equal(wilson(0, 5)[0], 0);
});

/* ---------- 통계·CSV·기록표 ---------- */

function simulateClass(n = 12) {
  const { pub, keys } = synthBank();
  const P = [{ 1: 0.97, 2: 0.95, 3: 0.92, 4: 0.88, 5: 0.8 }, { 1: 0.9, 2: 0.8, 3: 0.62, 4: 0.45, 5: 0.35 }, { 1: 0.65, 2: 0.45, 3: 0.33, 4: 0.28, 5: 0.25 }];
  const ids = sids(n);
  const attempts = {}, results = {};
  ids.forEach((sid, i) => {
    attempts[sid] = simulateAttempt({ pub, keys, sid, half: i % 2 ? "B" : "A", pByLevel: P[i % 3] });
    results[sid] = recompute({ attempt: attempts[sid], bank: pub, keys, cfg: DEFAULT_QUIZ, now: "t" });
  });
  return { pub, keys, ids, attempts, results };
}

test("itemStats: 노출 수·정답률·구간·보기 점유·표시 규칙(few는 n<5, 판정은 n>=8)", () => {
  const { pub, keys, attempts } = simulateClass(12);
  const stats = itemStats({ attempts, keysDoc: keys, bank: pub });
  assert.equal(stats.length, pub.items.length);
  assert.deepEqual(stats.map((s) => s.id), [...stats.map((s) => s.id)].sort());
  let seen = 0;
  stats.forEach((s) => {
    assert.ok(s.n >= 0);
    if (s.n) { seen += s.n; assert.ok(s.p >= 0 && s.p <= 1); assert.ok(s.ci[0] <= s.p && s.p <= s.ci[1]); } else { assert.equal(s.p, null); }
    const share = OPT.reduce((a, o) => a + s.optShare[o], 0) + s.blank;
    if (s.n) assert.ok(Math.abs(share - 1) < 1e-9);
    assert.equal(s.flags.includes("few"), s.n < 5);
    if (s.n < 8) assert.deepEqual(s.flags.filter((f) => f !== "few"), []);
    if (s.n) assert.ok(s.medianMs > 0);
    assert.ok(["A", "B"].includes(s.half));
    assert.ok(typeof s.spec === "string");
  });
  assert.equal(seen, 12 * 20);
  const rich = stats.filter((s) => s.n >= 8);
  rich.forEach((s) => { if (s.rpb != null && s.rpb < 0) assert.ok(s.flags.includes("keyCheck")); });
  // 정답 키를 일부러 틀리면 keyCheck·levelCheck가 뜬다
  const wrongKeys = JSON.parse(JSON.stringify(keys));
  Object.keys(wrongKeys.items).forEach((id) => { wrongKeys.items[id].answer = OPT.find((o) => o !== keys.items[id].answer); });
  const bad = itemStats({ attempts, keysDoc: wrongKeys, bank: pub }).filter((s) => s.n >= 8);
  if (bad.length) assert.ok(bad.some((s) => s.flags.includes("keyCheck") || s.flags.includes("levelCheck")));
});

test("twinStats·levelMonotonic: 같은 spec의 A·B 짝과 급별 평균 정답률 순서", () => {
  const mk = (id, half, spec, level, p, n) => ({ id, half, spec, level, p, n });
  const stats = [mk("Q31A01", "A", "S3-1-01", 3, 0.9, 6), mk("Q31B01", "B", "S3-1-01", 3, 0.5, 6), mk("Q11A01", "A", "S1-1-01", 1, 0.95, 5), mk("Q11B01", "B", "S1-1-01", 1, 0.85, 3),
    mk("Q21A01", "A", "S2-1-01", 2, 0.5, 4), mk("Q51A01", "A", "S5-1-01", 5, 0.2, 4), mk("Q41A01", "A", "S4-1-01", 4, 0.3, 4)];
  const tw = twinStats(stats);
  assert.deepEqual(tw.map((t) => t.spec), ["S1-1-01", "S2-1-01", "S3-1-01", "S4-1-01", "S5-1-01"]);
  const t3 = tw.find((t) => t.spec === "S3-1-01");
  assert.equal(t3.flag, true); assert.ok(Math.abs(t3.diff - 0.4) < 1e-9); assert.deepEqual(t3.a, { id: "Q31A01", p: 0.9, n: 6 });
  assert.equal(tw.find((t) => t.spec === "S1-1-01").flag, false, "n<5 이면 표시하지 않는다");
  assert.equal(tw.find((t) => t.spec === "S2-1-01").b, null);
  const mono = levelMonotonic(stats);
  assert.ok(Math.abs(mono.means[1] - (0.95 * 5 + 0.85 * 3) / 8) < 1e-9);
  assert.ok(Math.abs(mono.means[3] - 0.7) < 1e-9);
  assert.deepEqual(mono.violations, [[1, 2]].filter(() => false).concat(mono.means[2] <= mono.means[3] ? [[2, 3]] : []));
  assert.deepEqual(levelMonotonic([]).violations, []);
  assert.equal(levelMonotonic([]).means[3], null);
});

test("reliabilityStats: 블록 1 평균·KR-20 근사, 라우팅 일관성, 경계 민감도, A·B 반 평균과 고정 문구", () => {
  const { keys, attempts, results } = simulateClass(12);
  const r = reliabilityStats({ attempts, keys, corrections: [], results });
  assert.equal(r.block1.n, 12);
  assert.ok(r.block1.mean >= 0 && r.block1.mean <= 1);
  assert.ok(r.block1.kr20 == null || (r.block1.kr20 <= 1 && Number.isFinite(r.block1.kr20)));
  assert.equal(r.routingConsistent.n, 12);
  assert.ok(r.routingConsistent.rate >= 0 && r.routingConsistent.rate <= 1);
  assert.ok(r.boundarySensitive.rate >= 0 && r.boundarySensitive.rate <= 1);
  assert.equal(r.halves.A.n, 6); assert.equal(r.halves.B.n, 6);
  assert.ok(Math.abs(r.halves.diff - Math.abs(r.halves.A.mean - r.halves.B.mean)) < 1e-9);
  assert.equal(r.note, RELIABILITY_NOTE);
  // results 없이도 같은 값
  const r2 = reliabilityStats({ attempts, keys, corrections: [] });
  assert.deepEqual(r2.halves, r.halves);
  assert.deepEqual(reliabilityStats({ attempts: {}, keys }).block1, { n: 0, mean: null, kr20: null });
});

test("recordSheet: 문항 행 20개·블록 표·요약 행 번호·오탐 표시", () => {
  const { pub, keys, attempts, results, ids } = simulateClass(4);
  const sid = ids[0];
  const v = { ...attempts[sid], events: [{ t: "t1", type: "blur", ms: 3000, block: 1, item: 2, warn: 1 }, { t: "t2", type: "reconnect", block: 2, warn: 1 }], falsePos: [0], pausedTotalSec: 30, extraSec: 60, extraReason: "PC 교체" };
  const sheet = recordSheet({ attempt: v, result: results[sid], keysDoc: keys, bank: pub });
  assert.equal(sheet.rows.length, 20);
  sheet.rows.forEach((r) => { assert.ok(r.k >= 1 && r.k <= 4); assert.ok(LEVELS.includes(r.level)); assert.ok([1, 2, 3, 4].includes(r.area)); assert.equal(r.correct, r.pick === r.answer); });
  assert.equal(sheet.blocks.length, 4);
  sheet.blocks.forEach((b, i) => { assert.equal(b.k, i + 1); assert.ok(["up", "stay", "down"].includes(b.move)); assert.equal(b.level, results[sid].path[i]); });
  assert.equal(sheet.summary.score, results[sid].score);
  assert.equal(sheet.summary.row, SCORE_ROWS.findIndex((r) => r.F === results[sid].F && results[sid].c >= r.cMin));
  assert.deepEqual([sheet.summary.pausedTotalSec, sheet.summary.extraSec, sheet.summary.extraReason, sheet.summary.reconnects], [30, 60, "PC 교체", 1]);
  assert.equal(sheet.events.length, 2);
  assert.equal(sheet.events[0].falsePos, true); assert.equal(sheet.events[1].falsePos, false);
  assert.equal(sheet.events[1].i, 1);
  const noRes = recordSheet({ attempt: v, keysDoc: keys, bank: pub });
  assert.equal(noRes.summary.F, results[sid].F);
});

test("CSV 4종: BOM 없이 head/rows 구조, 익명 번호만 나가고 학번은 나가지 않는다", () => {
  const { pub, keys, attempts, results, ids } = simulateClass(6);
  const pidOf = new Map(ids.map((sid, i) => [sid, "P" + String(i + 1).padStart(2, "0")]));
  attempts[ids[0]].events = [{ t: "t", type: "blur", ms: 2500, block: 1, item: 1, warn: 1 }, { t: "t", type: "blur_short", ms: 800, block: 2, item: 3, warn: 1 }];
  const a = csvAttempts(attempts, results, pidOf);
  assert.equal(a.rows.length, 6);
  assert.equal(a.head[0], "pid");
  a.rows.forEach((r) => { assert.equal(r.length, a.head.length); assert.match(String(r[0]), /^P\d\d$/); });
  assert.equal(a.rows[0][a.head.indexOf("n_blur_short")], 1);
  assert.equal(a.rows[0][a.head.indexOf("path")], results[ids[0]].path.join(">"));
  const rsp = csvResponses(attempts, keys, pidOf);
  assert.equal(rsp.rows.length, 6 * 20);
  rsp.rows.forEach((r) => assert.equal(r.length, rsp.head.length));
  assert.ok(rsp.head.includes("item_id") && rsp.head.includes("correct"));
  const ev = csvEvents(attempts, pidOf);
  assert.equal(ev.rows.length, 2);
  assert.equal(ev.rows[1][ev.head.indexOf("type")], "blur_short");
  const it = csvItems(itemStats({ attempts, keysDoc: keys, bank: pub }));
  assert.equal(it.rows.length, pub.items.length);
  it.rows.forEach((r) => assert.equal(r.length, it.head.length));
  const flat = JSON.stringify([a, rsp, ev]);
  ids.forEach((sid) => assert.equal(flat.includes(sid), false, "학번 노출 " + sid));
  assert.equal(flat.includes("﻿"), false);
  assert.equal(csvAttempts({}, {}, pidOf).rows.length, 0);
  assert.equal(csvAttempts(attempts, null, (s) => "P").rows[0][a.head.indexOf("F")], "");
});

/* ---------- 은행 검증·분리 ---------- */

test("validateBank: 완전한 은행은 통과, 모자란 칸·중복 id·잘못된 보기·5급 이미지·연습 문항 수를 잡는다", () => {
  const good = makeSyntheticBank();
  const v = validateBank(good);
  assert.deepEqual(v.errors, []);
  assert.equal(v.ok, true);
  assert.equal(v.cells.A["3-1"], CELL_MIN[3][0]); assert.equal(v.cells.B["5-4"], 0);
  v.errors.concat(v.warnings).forEach((m) => assert.equal(m.includes("—"), false));
  const short = makeSyntheticBank();
  short.items = short.items.filter((it) => it.id !== "Q31A09");
  const s = validateBank(short);
  assert.equal(s.ok, false);
  assert.ok(s.errors.some((e) => e.includes("A반 3급 영역 1")), s.errors.join("\n"));
  assert.equal(s.cells.A["3-1"], CELL_MIN[3][0] - 1);
  const bad = makeSyntheticBank();
  bad.items[0] = { ...bad.items[0], id: bad.items[1].id };
  bad.items[2] = { ...bad.items[2], options: bad.items[2].options.slice(0, 3) };
  bad.items[3] = { ...bad.items[3], answer: "z" };
  const i5 = bad.items.findIndex((it) => it.level === 5);
  bad.items[i5] = { ...bad.items[i5], image: { src: "/img/lessons/x.jpg", alt: "x" } };
  const i2 = bad.items.findIndex((it) => it.level === 2 && it.area === 1);
  bad.items[i2] = { ...bad.items[i2], image: { src: "http://x/y.jpg", alt: "" } };
  bad.items[4] = { ...bad.items[4], stem: "가".repeat(300) };
  bad.items[5] = { ...bad.items[5], level: 1, neg: true };
  bad.items[6] = { ...bad.items[6], area: 2 };   // id Q11A07 인데 area 2
  bad.practice = bad.practice.slice(0, 1);
  const b = validateBank(bad);
  assert.equal(b.ok, false);
  const E = b.errors.join("\n");
  assert.match(E, /겹칩니다/); assert.match(E, /보기는 4개/); assert.match(E, /answer가 보기에 없습니다/);
  assert.match(E, /5급에는 이미지/); assert.match(E, /\/img\/lessons\//); assert.match(E, /연습 문항은 2개/);
  assert.match(E, /id의 급·영역·반이 필드와 다릅니다/);
  const W = b.warnings.join("\n");
  assert.match(W, /문두가/); assert.match(W, /부정 문두/); assert.match(W, /대체 텍스트/);
  assert.equal(validateBank(null).ok, false);
  assert.equal(validateBank({ ver: "v", seedSalt: "s", items: [], practice: [] }).ok, false);
});

test("splitBank: 공개부에는 정답·해설·출처가 없고 keyHash가 맞으며, 정답부는 문항별 정답·해설·정정 목록을 갖는다", () => {
  const file = makeSyntheticBank({ ver: "2026-09-v1", seedSalt: "salt-x" });
  const { pub, keys } = splitBank(file);
  assert.equal(pub.ver, "2026-09-v1"); assert.equal(pub.seedSalt, "salt-x"); assert.equal(pub.itemCount, file.items.length);
  assert.equal(pub.items.length, file.items.length);
  assert.equal(pub.practice.length, 2);
  assert.equal(pub.practice[0].answer, "a");
  const flat = JSON.stringify(pub.items);
  assert.equal(flat.includes("answer"), false); assert.equal(flat.includes("expl"), false); assert.equal(flat.includes("\"src\":{"), false);
  pub.items.forEach((it, i) => {
    assert.equal(isCorrect(it, file.items[i].answer, pub.seedSalt), true);
    OPT.filter((o) => o !== file.items[i].answer).forEach((o) => assert.equal(isCorrect(it, o, pub.seedSalt), false));
    assert.deepEqual(Object.keys(it).sort(), ["area", "half", "id", "image", "keyHash", "level", "neg", "options", "spec", "stem"]);
  });
  assert.equal(Object.keys(keys.items).length, file.items.length);
  assert.equal(keys.items[file.items[0].id].answer, file.items[0].answer);
  assert.equal(keys.items[file.items[0].id].expl, file.items[0].expl);
  assert.deepEqual(keys.corrections, []);
  assert.equal(keys.ver, "2026-09-v1");
});

/* ---------- 시간·표본 ---------- */

test("remainingSec·fmtMMSS: 배수·보전·추가·전체 정지가 더해지고 경과가 빠진다", () => {
  const cfg = { ...DEFAULT_QUIZ, timeMult: { 20302: 1.5 }, pausedAccumSec: 20 };
  const v = { sid: "20301", timeMult: 1, pausedTotalSec: 30, extraSec: 60 };
  assert.equal(remainingSec({ nowMs: 100000, startedAtMs: 40000, cfg, v, sid: "20301" }), 2400 + 30 + 60 + 20 - 60);
  assert.equal(remainingSec({ nowMs: 0, startedAtMs: 0, cfg, v: { sid: "20302" }, sid: "20302" }), 3600 + 20);
  assert.equal(remainingSec({ nowMs: 0, startedAtMs: 0, cfg: DEFAULT_QUIZ, v: { timeMult: 2 }, sid: "x" }), 4800);
  assert.equal(remainingSec({ nowMs: 10 * 60 * 1000 + 2400 * 1000, startedAtMs: 0, cfg: DEFAULT_QUIZ, v: {}, sid: "x" }), -600);
  assert.equal(fmtMMSS(0), "00:00"); assert.equal(fmtMMSS(59), "00:59"); assert.equal(fmtMMSS(2400), "40:00"); assert.equal(fmtMMSS(4800), "80:00");
  assert.equal(fmtMMSS(-5), "00:00"); assert.equal(fmtMMSS(61.9), "01:01"); assert.equal(fmtMMSS(NaN), "00:00");
});

test("표본 자료는 결정론이고 재계산·통계·기록표·CSV까지 돌아간다", () => {
  const ids = sids(8);
  const a = buildSampleQuiz(ids), b = buildSampleQuiz(ids);
  assert.deepEqual(a, b);
  assert.equal(Object.keys(a.attempts).length, 8);
  assert.equal(a.cfg.stage, "published");
  assert.equal(a.cfg.bankVer, a.bank.ver);
  assert.equal(validateBank(makeSyntheticBank({ ver: a.bank.ver, seedSalt: a.bank.seedSalt })).ok, true);
  ids.forEach((sid) => {
    const v = a.attempts[sid];
    assert.equal(v.sid, sid);
    assert.ok(["A", "B"].includes(v.half));
    assert.equal(v.half, halfOf(sid, a.cfg).half);
    assert.equal(v.seed, deriveSeed(sid, a.bank.seedSalt));
    const r = recompute({ attempt: v, bank: a.bank, keys: a.keysDoc, cfg: a.cfg, now: "t" });
    assert.equal(r.mismatch, null, sid + " " + JSON.stringify(r.mismatch));
    assert.deepEqual([r.F, r.c, r.score], [a.results[sid].F, a.results[sid].c, a.results[sid].score]);
    assert.equal(v.result.published, true);
    assert.ok(Number.isFinite(a.meta[sid].startedAtMs));
  });
  const last = a.attempts[ids[7]];
  assert.equal(Object.keys(last.blocks).length, 3, "마지막 학생은 블록 3에서 시간 종료");
  assert.equal(last.blocks["3"].auto, true);
  assert.equal(a.attempts[ids[2]].warn, 3);
  assert.equal(a.attempts[ids[2]].lock.count, 1);
  const stats = itemStats({ attempts: a.attempts, keysDoc: a.keysDoc, bank: a.bank });
  assert.equal(stats.length, a.bank.items.length);
  const rel = reliabilityStats({ attempts: a.attempts, keys: a.keysDoc, results: a.results });
  assert.equal(rel.block1.n, 8);
  const pidOf = (sid) => "P" + sid.slice(-2);
  assert.equal(csvAttempts(a.attempts, a.results, pidOf).rows.length, 8);
  assert.ok(csvResponses(a.attempts, a.keysDoc, pidOf).rows.length >= 8 * 15);
  assert.ok(recordSheet({ attempt: a.attempts[ids[0]], result: a.results[ids[0]], keysDoc: a.keysDoc, bank: a.bank }).rows.length === 20);
  assert.deepEqual(buildSampleQuiz([]).attempts, {});
});
