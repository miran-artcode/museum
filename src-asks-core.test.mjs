import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ASK_MAX, REV_PER_ANSWER, REV_BYTES, normQ, askHash, askKey, isAskKey, askLessonOf,
  rememberQ, forgetQs, lessonAsks, resolveAsks, askTrace, revEntry, capRevs,
  askStats, askAnswerRows, askIndex, qSim, utf8Len,
} from "./src-asks-core.mjs";
import { changedTokens, buildEntries, mergeRemote, tok } from "./src-ws-sync.mjs";

const T0 = Date.parse("2026-10-01T01:00:00.000Z");
const at = (sec) => new Date(T0 + sec * 1000).toISOString();

const L3 = {
  n: 3, session: "3차시",
  readings: [
    { stage: "도입", h: "첫 읽기", asks: ["셋 중 앉을 수 있는 것은 어느 것인가요.", "**제목**이 붙는 순간 판단이 달라졌나요."] },
    { stage: "감상 1", h: "둘째 읽기", asks: [] },
    { stage: "감상 2", h: "셋째 읽기", asks: ["상자를 열 수 없다는 사실은 관람자에게 무엇을 시킬까요.", "  "] },
  ],
};

test("질문 지문: 표시 기호와 공백을 무시하고 같은 문장이면 같은 키", () => {
  assert.equal(normQ("**제목**이 붙는   순간"), "제목이 붙는 순간");
  assert.equal(normQ("[원문](https://example.org/a) 보기"), "원문 보기");
  assert.equal(askHash("**제목**이 붙는 순간"), askHash("제목이 붙는 순간"));
  assert.notEqual(askHash("가나다"), askHash("가나라"));
  const k = askKey(3, "제목이 붙는 순간");
  assert.match(k, /^ask3\.[0-9a-z]{7}$/);
  assert.ok(isAskKey(k));
  assert.equal(askLessonOf(k), 3);
  assert.ok(!isAskKey("l1.q1") && !isAskKey("ask3") && !isAskKey("_askMeta") && !isAskKey(k + "#a"));
});

test("차시 질문 목록: 빈 질문은 빼고 읽기 자료·질문 번호를 함께 준다", () => {
  const a = lessonAsks(L3);
  assert.equal(a.length, 3);
  assert.deepEqual(a.map((x) => [x.ri, x.qi]), [[0, 0], [0, 1], [2, 0]]);
  assert.equal(a[1].q, "제목이 붙는 순간 판단이 달라졌나요.");
  assert.equal(a[2].stage, "감상 2");
});

test("장부: 처음 쓰면 질문 사본과 시각, 이어 쓰면 입력 횟수만 는다", () => {
  forgetQs();
  const k = askKey(3, L3.readings[0].asks[0]);
  rememberQ(k, L3.readings[0].asks[0]);
  let ws = { "l1.q1": "다른 칸" };
  const p1 = askTrace(ws, k, "의", at(0));
  ws = { ...ws, [k]: "의", ...p1 };
  assert.deepEqual(ws._askMeta[k], { q: "셋 중 앉을 수 있는 것은 어느 것인가요.", first: at(0), last: at(0), n: 1 });
  assert.equal(ws._askRev, undefined);
  const p2 = askTrace(ws, k, "의자", at(3));
  assert.equal(p2._askMeta[k].first, at(0));
  assert.equal(p2._askMeta[k].n, 2);
  assert.equal(p2._askRev, undefined, "이어 쓰기는 흔적이 아니다");
});

test("장부: 질문 문장이 바뀐 뒤에 쓰면 처음 문장(q)은 두고 바뀐 문장(ql)을 더한다", () => {
  forgetQs();
  const k = "ask3.aaaaaaa";
  const ws = { [k]: "답", _askMeta: { [k]: { q: "옛 질문", first: at(0), last: at(0), n: 1 } } };
  rememberQ(k, "새 질문");
  const p = askTrace(ws, k, "답을", at(10));
  assert.equal(p._askMeta[k].q, "옛 질문");
  assert.equal(p._askMeta[k].ql, "새 질문");
});

test("고친 흔적: 한 번에 9자 넘게 지우면 cut, 같은 답은 2분 안에 다시 남기지 않는다", () => {
  const prev = "레디메이드는 작가가 고른 물건에 이름을 붙여 전시한 것이다.";
  const e = revEntry(prev, "레디메이드는", at(0), [], at(30));
  assert.deepEqual(e, { at: at(30), prev, why: "cut" });
  assert.equal(revEntry(prev, prev + "다", at(0), [], at(30)), null, "한 글자 덧붙임은 흔적이 아니다");
  assert.equal(revEntry("짧은 답", "", at(0), [], at(30)), null, "15자 이하는 남기지 않는다");
  assert.equal(revEntry(prev + " 더 붙인 문장", "레디", at(30), [e], at(60)), null, "2분 안에는 다시 남기지 않는다");
  assert.ok(revEntry(prev + " 더 붙인 문장", "레디", at(150), [e], at(200)), "2분이 지나면 다시 남긴다");
});

test("고친 흔적: 5분 넘게 둔 답을 다시 고치면 resume (작은 수정이어도)", () => {
  const prev = "선택과 명명이 사물의 지위를 바꾼다고 생각한다";
  const e = revEntry(prev, prev + ".", at(0), [], at(301));
  assert.equal(e.why, "resume");
  assert.equal(e.prev, prev);
  assert.equal(revEntry(prev, prev + ".", at(0), [], at(299)), null);
  assert.equal(revEntry(prev, prev + ".", at(0), [{ at: at(1), prev, why: "cut" }], at(400)), null, "같은 글은 두 번 남기지 않는다");
});

test("고친 흔적: askTrace가 답 키별 배열에 붙인다", () => {
  forgetQs();
  const k = askKey(3, "질문");
  const old = "처음에는 작가의 손이 작품을 만든다고 생각했다";
  const ws = { [k]: old, _askMeta: { [k]: { q: "질문", first: at(0), last: at(10), n: 30 } }, _askRev: { "ask3.zzzzzzz": [{ at: at(5), prev: "다른 답의 흔적입니다 열여섯 자 넘게", why: "cut" }] } };
  const p = askTrace(ws, k, "선택", at(20));
  assert.equal(p._askRev[k].length, 1);
  assert.equal(p._askRev[k][0].prev, old);
  assert.equal(p._askRev["ask3.zzzzzzz"], ws._askRev["ask3.zzzzzzz"], "다른 답의 배열은 같은 참조");
});

test("흔적 상한: 답 하나 20건, 전체 바이트 상한은 가장 오래된 것부터", () => {
  const many = Array.from({ length: REV_PER_ANSWER + 3 }, (_, i) => ({ at: at(i), prev: "글" + i, why: "cut" }));
  const other = [{ at: at(999), prev: "다른 답", why: "cut" }];
  const r = capRevs({ a: many, b: other });
  assert.equal(r.map.a.length, REV_PER_ANSWER);
  assert.equal(r.map.a[0].prev, "글3");
  assert.equal(r.map.b, other);
  assert.equal(r.dropped, 3);

  const big = "가".repeat(ASK_MAX);   // 1500바이트
  const n = Math.ceil(REV_BYTES / utf8Len(big)) + 5;
  const map = {};
  for (let i = 0; i < n; i++) map["k" + i] = [{ at: at(i), prev: big, why: "cut" }];
  const r2 = capRevs(map);
  assert.ok(utf8Len(JSON.stringify(r2.map)) <= REV_BYTES);
  assert.ok(!("k0" in r2.map), "가장 오래된 답의 흔적부터 덜어 낸다");
  assert.ok(("k" + (n - 1)) in r2.map);
  assert.ok(r2.dropped >= 5);
});

test("장부 조각이 저장 계층에서 답 키 단위 항목이 된다", () => {
  forgetQs();
  const k = askKey(3, "질문 하나"), j = askKey(3, "질문 둘");
  rememberQ(k, "질문 하나");
  const before = { [j]: "다른 답", _askMeta: { [j]: { q: "질문 둘", first: at(0), last: at(0), n: 3 } } };
  const after = { ...before, [k]: "새 답", ...askTrace(before, k, "새 답", at(5)) };
  const toks = changedTokens(before, after);
  assert.deepEqual(toks.sort(), [k, tok("_askMeta", k)].sort());
  const entries = buildEntries(before, after, toks);
  assert.deepEqual(entries.map((e) => e[0]).sort(), [[k], ["_askMeta", k]].sort());
  // 다른 기기가 다른 답의 장부를 쓴 서버 사본을 받아도, 이 탭이 고치는 항목은 지킨다
  const remote = { ...before, _askMeta: { ...before._askMeta, [j]: { q: "질문 둘", first: at(0), last: at(9), n: 4 } } };
  const merged = mergeRemote(after, remote, new Set(toks));
  assert.equal(merged._askMeta[j].n, 4, "다른 답의 항목은 서버 값");
  assert.equal(merged._askMeta[k].n, 1, "고치는 중인 항목은 이 탭 값");
  assert.equal(merged[k], "새 답");
});

test("질문 찾아 잇기: 같은 문장·다듬은 문장·크게 바뀐 문장", () => {
  const qa = L3.readings[0].asks[0], qb = L3.readings[0].asks[1], qc = L3.readings[2].asks[0];
  const kOldC = askKey(3, "상자를 열 수 없다는 사실은 관람자에게 무엇을 하게 할까요.");
  const kGone = askKey(3, "전혀 다른 옛 질문: 박물관 유리 진열장의 높이는 왜 정해져 있을까요.");
  const ws = {
    [askKey(3, qa)]: "답 A",
    [kOldC]: "상자 질문에 쓴 답",
    [kGone]: "없어진 질문에 쓴 답",
    _askMeta: {
      [askKey(3, qa)]: { q: normQ(qa), first: at(0), last: at(0), n: 1 },
      [kOldC]: { q: "상자를 열 수 없다는 사실은 관람자에게 무엇을 하게 할까요.", first: at(0), last: at(0), n: 1 },
      [kGone]: { q: "전혀 다른 옛 질문: 박물관 유리 진열장의 높이는 왜 정해져 있을까요.", first: at(0), last: at(0), n: 1 },
    },
  };
  const { slots, orphans } = resolveAsks(L3, ws);
  const by = (q) => slots.find((s) => s.q === normQ(q));
  assert.equal(by(qa).how, "same");
  assert.equal(by(qb).how, "none");
  assert.equal(by(qb).ansKey, askKey(3, qb));
  assert.equal(by(qc).how, "moved");
  assert.equal(by(qc).ansKey, kOldC);
  assert.deepEqual(orphans.map((o) => o.key), [kGone]);
  assert.equal(orphans[0].a, "없어진 질문에 쓴 답");
});

test("질문 찾아 잇기: 한 답은 한 질문에만, 다른 차시의 답은 보지 않는다", () => {
  const q1 = "작품의 제목은 판단을 바꾸나요.", q2 = "작품의 제목은 판단을 바꾸나요, 왜 그런가요.";
  const L = { n: 5, session: "5차시", readings: [{ stage: "", h: "", asks: [q1, q2] }] };
  const old = "작품의 제목은 판단을 바꿀까요.";
  const kOld = askKey(5, old);
  const ws = { [kOld]: "옛 답", _askMeta: { [kOld]: { q: old, first: at(0), last: at(0), n: 1 } }, [askKey(4, q1)]: "4차시 답" };
  const { slots, orphans } = resolveAsks(L, ws);
  assert.equal(slots.filter((s) => s.how === "moved").length, 1);
  assert.equal(slots.find((s) => s.how === "moved").q, q1, "더 비슷한 질문에 잇는다");
  assert.equal(orphans.length, 0);
  assert.ok(qSim(old, q1) > qSim(old, q2));
});

test("교사·연구용 요약과 답 목록", () => {
  const qa = L3.readings[0].asks[0];
  const k = askKey(3, qa);
  const ws = {
    [k]: "  앉을 수 있는 것은 의자 자체다  ",
    [askKey(3, "지운 질문")]: "",
    _askMeta: { [k]: { q: normQ(qa), first: at(0), last: at(60), n: 40 } },
    _askRev: { [k]: [{ at: at(30), prev: "처음 쓴 답은 사진이었다고 생각한다", why: "cut" }] },
    _paste: [{ k, at: at(10), n: 25 }, { k: "l1.q1", at: at(11), n: 30 }],
  };
  const st = askStats(ws);
  assert.deepEqual(st, { n: 1, chars: "앉을 수 있는 것은 의자 자체다".length, lessons: 1, inputN: 40, revN: 1, revAnsN: 1, pasteN: 1, pasteChars: 25, pruned: 0 });
  const rows = askAnswerRows(ws, [L3]);
  assert.equal(rows.length, 1, "글도 흔적도 없는 답은 뺀다");
  assert.equal(rows[0].how, "same");
  assert.equal(rows[0].stage, "도입");
  assert.equal(rows[0].revs.length, 1);
  assert.equal(rows[0].pasteN, 1);
  const lessons = [L3];
  const idx = askIndex(lessons);
  assert.equal(idx.get(k).q, normQ(qa));
  assert.equal(askIndex(lessons), idx, "같은 강의 노트 배열이면 다시 만들지 않는다");
});
