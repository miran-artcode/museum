import { test } from "node:test";
import assert from "node:assert/strict";
import {
  makeDirtyTracker, changedKeys, changedTokens, mergeRemote, buildEntries, deepEq, tok, untok, SEP,
  unionTrace, mergeTraceForSave, reconcileTrace, TRACE_CAPS,
  mergeSurvey, surveyEntries, submittedBlocks,
} from "./src-ws-sync.mjs";

/* entries → { "경로": 값 } (비교하기 쉽게) */
const asMap = (entries) => Object.fromEntries(entries.map(([p, v]) => [p.join(" > "), v]));

test("dirty tracker: 고치는 중 → 저장 중 → 성공/실패", () => {
  const t = makeDirtyTracker();
  t.mark(["l1.q1", "_t"]);
  assert.equal(t.size, 2);
  const taken = t.take();
  assert.deepEqual(taken.sort(), ["_t", "l1.q1"]);
  assert.equal(t.size, 0);
  assert.ok(t.has("l1.q1"), "저장 중인 키도 has에 잡힌다");
  t.mark(["l1.q2"]);                 // 저장 중에 다른 칸을 고침
  t.fail();                          // 저장 실패: 저장 중이던 키가 다시 dirty로
  assert.deepEqual([...t.all()].sort(), ["_t", "l1.q1", "l1.q2"]);
  t.take(); t.done();
  assert.equal(t.all().size, 0);
});

test("dirty tracker: drop은 고치는 중인 키만 뺀다", () => {
  const t = makeDirtyTracker();
  t.mark(["pre", "post"]);
  t.drop(["pre"]);
  assert.deepEqual([...t.all()], ["post"]);
});

test("changedKeys: 참조가 바뀐 키와 사라진 키", () => {
  const log = [{ k: "a" }];
  const before = { "l1.q1": "가", _log: log, gone: 1 };
  const after = { "l1.q1": "가나", _log: log, added: 2 };
  assert.deepEqual(changedKeys(before, after).sort(), ["added", "gone", "l1.q1"]);
});

test("토큰: 맵 키와 점이 든 안쪽 키를 한 조각으로 나눈다", () => {
  assert.deepEqual(untok(tok("_inq", "q1.concept")), ["_inq", "q1.concept"]);
  assert.deepEqual(untok("s3a.problem"), ["s3a.problem"]);
  assert.ok(!"s3a.problem".includes(SEP));
});

test("changedTokens: 보조 맵(_inq·_t·_act)은 바뀐 안쪽 키만 낸다", () => {
  const q1 = { v1: "첫 답" }, q2 = { v1: "다른 질문" };
  const before = { _inq: { "q1.concept": q1, "q2.concept": q2 }, _t: { l1: { edits: 1 } }, "l1.q1": "가" };
  const after = {
    ...before,
    _inq: { ...before._inq, "q1.concept": { ...q1, revAt: "t" } },
    _t: { ...before._t, s3a: { edits: 1 } },
    "l1.q1": "가나",
  };
  assert.deepEqual(changedTokens(before, after).sort(), [tok("_inq", "q1.concept"), tok("_t", "s3a"), "l1.q1"].sort());
});

test("changedTokens: 맵이 새로 생기면 안쪽 키마다, 맵이 통째로 사라지면 키 전체", () => {
  assert.deepEqual(changedTokens({}, { _act: { "1차시": { sec: 3 } } }), [tok("_act", "1차시")]);
  assert.deepEqual(changedTokens({ _act: { "1차시": {} } }, {}), ["_act"]);
  // 맵 키가 아니면 통째로
  assert.deepEqual(changedTokens({ _s3bAuto: { a: 1 } }, { _s3bAuto: { a: 2 } }), ["_s3bAuto"]);
});

test("deepEq: 키 순서가 달라도 같은 내용이면 같다", () => {
  assert.ok(deepEq({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 }));
  assert.ok(!deepEq({ a: 1 }, { a: 1, b: undefined }));
  assert.ok(!deepEq([1, 2], [2, 1]));
});

test("mergeRemote: 고치는 중인 키는 지키고 나머지는 서버 값을 받는다", () => {
  const local = { "l1.q1": "내가 치는 중", "l1.q2": "옛 값", _act: { a: 1 } };
  const remote = { "l1.q1": "서버의 옛 값", "l1.q2": "다른 기기에서 쓴 값", _act: { a: 2 }, "l1.q3": "새 칸" };
  const out = mergeRemote(local, remote, new Set(["l1.q1"]));
  assert.equal(out["l1.q1"], "내가 치는 중");
  assert.equal(out["l1.q2"], "다른 기기에서 쓴 값");
  assert.equal(out["l1.q3"], "새 칸");
  assert.deepEqual(out._act, { a: 2 });
});

test("mergeRemote: 같은 내용이면 같은 객체를 돌려준다 (다시 그리지 않음), 키 순서가 달라도", () => {
  const local = { "l1.q1": "가", _t: { l1: { edits: 3, last: "x" } } };
  const remote = { _t: { l1: { last: "x", edits: 3 } }, "l1.q1": "가" }; // 참조와 키 순서는 다르지만 내용은 같다
  assert.equal(mergeRemote(local, remote, new Set()), local);
});

test("mergeRemote: 바뀐 키가 있어도 내용이 같은 키는 이 탭의 참조를 유지한다", () => {
  const t = { l1: { edits: 3 } };
  const local = { "l1.q1": "가", _t: t };
  const out = mergeRemote(local, { "l1.q1": "가나", _t: { l1: { edits: 3 } } }, new Set());
  assert.equal(out["l1.q1"], "가나");
  assert.equal(out._t, t);
});

test("mergeRemote: 서버에서 사라진 키는 지운다 (교사가 옛 시점으로 되돌림), 고치는 중이면 남긴다", () => {
  const local = { "l1.q1": "가", "l4.q1": "되돌린 시점 뒤에 쓴 것", "l4.q2": "지금 치는 중" };
  const remote = { "l1.q1": "가" };
  const out = mergeRemote(local, remote, new Set(["l4.q2"]));
  assert.deepEqual(Object.keys(out).sort(), ["l1.q1", "l4.q2"]);
});

test("mergeRemote: 맵은 고치는 중인 안쪽 키만 지키고 다른 기기가 쓴 안쪽 키는 받는다", () => {
  const local = { _inq: { "q1.concept": { v1: "이 탭에서 저장한 첫 답" }, "q2.concept": { v1: "옛 값" } } };
  const remote = { _inq: { "q2.concept": { v1: "집 폰에서 고침" }, "q3.concept": { v1: "집 폰에서 새로 씀" } } };
  const out = mergeRemote(local, remote, new Set([tok("_inq", "q1.concept")]));
  assert.deepEqual(out._inq, {
    "q1.concept": { v1: "이 탭에서 저장한 첫 답" },
    "q2.concept": { v1: "집 폰에서 고침" },
    "q3.concept": { v1: "집 폰에서 새로 씀" },
  });
});

test("mergeRemote: 서버에 맵이 없어도 고치는 중인 안쪽 키는 남는다", () => {
  const local = { _t: { s3a: { edits: 1 }, l1: { edits: 9 } } };
  const out = mergeRemote(local, {}, new Set([tok("_t", "s3a")]));
  assert.deepEqual(out._t, { s3a: { edits: 1 } });
});

test("buildEntries: 고치던 키와 저장 직전에 바뀐 보조 키만 담는다", () => {
  const before = { "l1.q1": "가나", "l1.q2": "다", _act: { "1차시": { sec: 1 } }, _log: [] };
  const data = { ...before, _act: { ...before._act, "1차시": { sec: 2 } }, _updatedAt: "2026-09-17T00:00:00Z" };
  const m = asMap(buildEntries(before, data, ["l1.q1"]));
  assert.deepEqual(Object.keys(m).sort(), ["_act > 1차시", "_updatedAt", "l1.q1"]);
  assert.equal(m["l1.q1"], "가나");
  assert.deepEqual(m["_act > 1차시"], { sec: 2 });
  assert.ok(!("l1.q2" in m), "안 고친 칸은 보내지 않는다");
});

test("buildEntries: 지운 키와 지운 안쪽 키는 undefined로 표시된다", () => {
  const before = { a: 1, b: 2, _t: { x: 1, y: 2 } };
  const data = { a: 1, _t: { x: 1 } };
  const m = asMap(buildEntries(before, data, []));
  assert.ok("b" in m && m.b === undefined);
  assert.ok("_t > y" in m && m["_t > y"] === undefined);
});

test("buildEntries: 같은 맵의 전체와 안쪽 키가 함께 오면 전체만 쓴다 (Firestore 경로 충돌 방지)", () => {
  const data = { _inq: { "q1.concept": { v1: "a" } } };
  const e = buildEntries(data, data, ["_inq", tok("_inq", "q1.concept")]);
  assert.deepEqual(e, [[["_inq"], data._inq]]);
});

test("buildEntries: 맵이 맵 아닌 값이 되면 통째로 쓴다", () => {
  const e = buildEntries({}, { _t: "옛 값" }, [tok("_t", "s3a")]);
  assert.deepEqual(e, [[["_t"], "옛 값"]]);
});

test("unionTrace: 옛 탭의 짧은 배열이 긴 서버 배열을 지우지 않는다", () => {
  const a = { k: "l1.q1", at: "2026-09-28T01:00:00.000Z", prev: "가" };
  const b = { k: "l2.q1", at: "2026-09-28T01:05:00.000Z", prev: "나" }; // 다른 기기에서 남긴 것
  const c = { k: "l1.q1", at: "2026-09-28T01:10:00.000Z", prev: "다" }; // 이 탭에서 새로 남긴 것
  const { arr, dropped } = unionTrace([a, c], [a, b], 300);
  assert.deepEqual(arr, [a, b, c]);
  assert.equal(dropped, 0);
});

test("unionTrace: 같은 항목이면 이 탭의 고친 값이 이기고, 상한을 넘으면 오래된 것부터 센다", () => {
  const s = { k: "x", at: "2026-09-28T01:00:00.000Z", n: 50 };
  const l = { ...s, settle: 12, src: "ai" };
  assert.deepEqual(unionTrace([l], [s], 10).arr, [l]);
  const many = Array.from({ length: 5 }, (_, i) => ({ k: "x", at: "2026-09-28T01:0" + i + ":00.000Z" }));
  const r = unionTrace(many, [], 3);
  assert.equal(r.dropped, 2);
  assert.deepEqual(r.arr, many.slice(2));
});

test("mergeTraceForSave: 고친 배열만 합치고 덜어 낸 수를 _pruned에 더한다", () => {
  const cap = TRACE_CAPS._paste;
  const srv = { _paste: Array.from({ length: cap }, (_, i) => ({ k: "a", at: "2026-09-28T00:" + String(i % 60).padStart(2, "0") + ":" + String(Math.floor(i / 60)).padStart(2, "0") + ".000Z" })), _pruned: 4 };
  const mine = { k: "b", at: "2026-09-28T02:00:00.000Z" };
  const data = { _paste: [...srv._paste, mine], _log: [{ k: "l", at: "z" }], _pruned: 1 };
  const out = mergeTraceForSave(data, srv, ["_paste"]);
  assert.equal(out._paste.length, cap);
  assert.equal(out._paste[cap - 1], mine);
  assert.equal(out._pruned, 5, "서버·이 탭 가운데 큰 값(4)에 덜어 낸 1건을 더한다");
  assert.equal(out._log, data._log, "고치지 않은 배열은 그대로");
  assert.equal(mergeTraceForSave(data, srv, ["l1.q1"]), data, "흔적을 고치지 않았으면 같은 객체");
});

test("reconcileTrace: 저장한 배열 + 저장하는 사이 새로 붙은 항목, 덜어 낸 항목은 되살리지 않는다", () => {
  const old = { k: "a", at: "1" }, kept = { k: "a", at: "2" }, fresh = { k: "a", at: "3" };
  const before = [old, kept];
  const saved = [kept];                 // 저장할 때 old를 덜어 냄
  const cur = [old, kept, fresh];       // 저장하는 사이 fresh가 붙음
  assert.deepEqual(reconcileTrace(cur, before, saved), [kept, fresh]);
  assert.equal(reconcileTrace(before, before, saved), saved);
});

test("mergeSurvey: 다른 기기에서 제출한 블록은 고치는 중이어도 서버 값 (제출 취소 없음)", () => {
  const local = { ver: "v1", pre: { ans: { a: 3 }, startedAt: "s" } };
  const remote = { ver: "v1", pre: { ans: { a: 5 }, startedAt: "s", submittedAt: "t" } };
  const out = mergeSurvey(local, remote, new Set(["pre"]));
  assert.equal(out.pre.submittedAt, "t");
  assert.deepEqual(out.pre.ans, { a: 5 });
});

test("mergeSurvey: 고치는 중인 블록은 지키고, 나머지 블록은 서버 값을 받는다", () => {
  const local = { ver: "v1", pre: { ans: { a: 3 } }, stance: { ver: "s1", pre: { ans: { x: 1 } } } };
  const remote = { ver: "v1", pre: { ans: { a: 1 } }, stance: { ver: "s1", pre: { ans: { x: 2 } }, post: { ans: { y: 1 } } }, anchor: { items: [1] } };
  const out = mergeSurvey(local, remote, new Set(["pre"]));
  assert.deepEqual(out.pre, { ans: { a: 3 } });
  assert.deepEqual(out.stance, { ver: "s1", pre: { ans: { x: 2 } }, post: { ans: { y: 1 } } });
  assert.deepEqual(out.anchor, { items: [1] });
});

test("mergeSurvey: 같은 내용이면 같은 객체, 서버에 없는 블록은 고치는 중일 때만 남는다", () => {
  const local = { ver: "v1", pre: { ans: { a: 1 } } };
  assert.equal(mergeSurvey(local, { pre: { ans: { a: 1 } }, ver: "v1" }, new Set()), local);
  const typed = { ver: "v1", post: { ans: { a: 2 } } };
  assert.deepEqual(mergeSurvey(typed, { ver: "v1" }, new Set(["post"])).post, { ans: { a: 2 } });
  assert.equal(mergeSurvey(typed, { ver: "v1" }, new Set()).post, undefined);
});

test("surveyEntries: 고친 블록과 그 판 표시만, 제출된 블록은 자동 저장하지 않는다", () => {
  const cur = { ver: "v1", pre: { ans: { a: 1 } }, post: { ans: { a: 2 }, submittedAt: "t" }, stance: { ver: "s1", pre: { ans: {} } }, anchor: { ver: "a1", items: [] } };
  const m = asMap(surveyEntries(cur, ["pre", "post", "stance.pre", "anchor"], {}));
  assert.deepEqual(Object.keys(m).sort(), ["anchor", "pre", "stance > pre", "stance > ver", "ver"]);
  const m2 = asMap(surveyEntries(cur, ["pre"], { pre: { submittedAt: "서버에서 제출" } }));
  assert.deepEqual(m2, {});
});

test("submittedBlocks: 서버에서 제출된 블록 토큰", () => {
  assert.deepEqual(submittedBlocks({ pre: { submittedAt: "t" }, stance: { post: { submittedAt: "u" } } }), ["pre", "stance.post"]);
  assert.deepEqual(submittedBlocks(null), []);
});
