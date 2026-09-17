import { test } from "node:test";
import assert from "node:assert/strict";
import { makeDirtyTracker, changedKeys, mergeRemote, buildPatch } from "./src-ws-sync.mjs";

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

test("changedKeys: 참조가 바뀐 키와 사라진 키", () => {
  const log = [{ k: "a" }];
  const before = { "l1.q1": "가", _log: log, gone: 1 };
  const after = { "l1.q1": "가나", _log: log, added: 2 };
  assert.deepEqual(changedKeys(before, after).sort(), ["added", "gone", "l1.q1"]);
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

test("mergeRemote: 같은 내용이면 같은 객체를 돌려준다 (다시 그리지 않음)", () => {
  const local = { "l1.q1": "가", _t: { l1: { edits: 3 } } };
  const remote = { "l1.q1": "가", _t: { l1: { edits: 3 } } }; // 참조는 다르지만 내용은 같다
  assert.equal(mergeRemote(local, remote, new Set()), local);
});

test("mergeRemote: 서버에서 사라진 키는 지운다 (교사가 옛 시점으로 되돌림), 고치는 중이면 남긴다", () => {
  const local = { "l1.q1": "가", "l4.q1": "되돌린 시점 뒤에 쓴 것", "l4.q2": "지금 치는 중" };
  const remote = { "l1.q1": "가" };
  const out = mergeRemote(local, remote, new Set(["l4.q2"]));
  assert.deepEqual(Object.keys(out).sort(), ["l1.q1", "l4.q2"]);
});

test("buildPatch: 고치던 키와 저장 직전에 바뀐 보조 키만 담는다", () => {
  const before = { "l1.q1": "가나", "l1.q2": "다", _act: { a: 1 }, _log: [] };
  const data = { ...before, _act: { a: 2 }, _updatedAt: "2026-09-17T00:00:00Z" };
  const patch = buildPatch(before, data, ["l1.q1"]);
  assert.deepEqual(Object.keys(patch).sort(), ["_act", "_updatedAt", "l1.q1"]);
  assert.equal(patch["l1.q1"], "가나");
  assert.ok(!("l1.q2" in patch), "안 고친 칸은 보내지 않는다");
});

test("buildPatch: 지운 키는 undefined로 표시된다", () => {
  const before = { a: 1, b: 2 };
  const data = { a: 1 };
  const patch = buildPatch(before, data, []);
  assert.ok("b" in patch && patch.b === undefined);
});
