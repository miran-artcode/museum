/* src-pid.mjs 검증 — node --test src-pid.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import { planPidMap, ensurePidMap, normPidMap, pidOfMap, classCodeOf, seededRng, byPid, PID_KEY, UNKNOWN_CLASS_CODE } from "./src-pid.mjs";

const memStore = (init) => {
  let doc = init ? JSON.parse(JSON.stringify(init)) : null;
  const s = {
    reads: 0, writes: 0, failRead: false,
    async getSafe(k) { s.reads++; assert.equal(k, PID_KEY); return s.failRead ? { ok: false, data: null } : { ok: true, data: doc }; },
    async setT(k, v, o) {
      s.writes++; assert.ok(o && o.merge);
      doc = doc || { pids: {}, classes: {} };
      doc = { pids: { ...doc.pids, ...v.pids }, classes: { ...doc.classes, ...v.classes } };
      return true;
    },
    get doc() { return doc; },
  };
  return s;
};

test("새 학생마다 P+4글자, 서로 다르고 형식이 맞다", () => {
  const ids = Array.from({ length: 140 }, (_, i) => "2" + String(Math.floor(i / 28) + 1).padStart(2, "0") + String((i % 28) + 1).padStart(2, "0"));
  const { next } = planPidMap(null, ids, null, seededRng("t"));
  const ps = ids.map((id) => next.pids[id]);
  assert.equal(new Set(ps).size, 140);
  assert.ok(ps.every((p) => /^P[A-Z0-9]{4}$/.test(p)));
  assert.deepEqual(Object.keys(next.classes).sort(), ["01", "02", "03", "04", "05"]);
  assert.deepEqual(Object.values(next.classes).sort(), ["C1", "C2", "C3", "C4", "C5"]);
});

test("있는 번호는 바꾸지 않고, 학생이 늘거나 빠져도 남은 학생의 번호는 같다", () => {
  const a = planPidMap(null, ["20101", "20102", "20103"], null, seededRng("a")).next;
  const b = planPidMap(a, ["20100", "20101", "20103", "20104"], null, seededRng("b"));
  assert.equal(b.next.pids["20101"], a.pids["20101"]);
  assert.equal(b.next.pids["20103"], a.pids["20103"]);
  assert.deepEqual(Object.keys(b.patch.pids).sort(), ["20100", "20104"]);
  assert.equal(b.next.pids["20102"], a.pids["20102"]);   // 빠진 학생 번호도 남긴다
  assert.deepEqual(b.patch.classes, {});
});

test("학급 코드는 반 번호 순이 아니라 무작위 순서이고, 새 반은 다음 번호를 받는다", () => {
  let orders = new Set();
  for (let s = 0; s < 20; s++) {
    const { next } = planPidMap(null, ["20101", "20201", "20301", "20401"], null, seededRng("c" + s));
    orders.add(["01", "02", "03", "04"].map((c) => next.classes[c]).join(","));
  }
  assert.ok(orders.size > 1, "반 번호 순으로 고정되면 안 된다");
  const one = planPidMap(null, ["20101", "20201"], null, seededRng("x")).next;
  const two = planPidMap(one, ["20101", "20201", "20501"], null, seededRng("y"));
  assert.deepEqual(two.patch.classes, { "05": "C3" });
});

test("학급 미상은 CU, classMap이 학번 규칙보다 먼저", () => {
  const { next } = planPidMap(null, ["000", "20420"], { "000": "04" }, seededRng("u"));
  assert.equal(classCodeOf(next, "?"), UNKNOWN_CLASS_CODE);
  assert.ok(next.classes["04"]);
  assert.equal(Object.keys(next.classes).length, 1);
});

test("ensurePidMap: 없는 항목만 merge로 쓰고, 두 번째에는 쓰지 않는다", async () => {
  const st = memStore();
  const r1 = await ensurePidMap(st, ["20101", "20102"], null, { rng: seededRng("e") });
  assert.ok(r1.ok); assert.equal(r1.added, 2); assert.equal(st.writes, 1);
  const r2 = await ensurePidMap(st, ["20101", "20102"], null, { rng: seededRng("f") });
  assert.ok(r2.ok); assert.equal(r2.added, 0); assert.equal(st.writes, 1);
  assert.equal(pidOfMap(r2.map, "20101"), pidOfMap(r1.map, "20101"));
});

test("ensurePidMap: 읽기 실패면 쓰지 않는다", async () => {
  const st = memStore(); st.failRead = true;
  const r = await ensurePidMap(st, ["20101"], null, {});
  assert.equal(r.ok, false); assert.equal(st.writes, 0);
});

test("normPidMap은 형식이 틀린 값을 버리고, byPid는 빈 pid를 뒤로 보낸다", () => {
  const m = normPidMap({ pids: { a: "P01", b: "PACDE" }, classes: { "01": "C1", "02": "X" } });
  assert.deepEqual(m, { pids: { b: "PACDE" }, classes: { "01": "C1" } });
  assert.deepEqual(["PX", "", "PA"].sort(byPid), ["PA", "PX", ""]);
});
