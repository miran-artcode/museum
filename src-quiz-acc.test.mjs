import { test } from "node:test";
import assert from "node:assert/strict";
import { ACC_MULTS, accKey, normAcc, isDefaultAcc, legacyHas, withAcc, migrateEntries, accWrite } from "./src-quiz-acc.mjs";
import { DEFAULT_QUIZ, quizCfg, remainingSec } from "./src-quiz-core.mjs";

test("accKey·normAcc: 허용 배수만 남기고 나머지는 1, 제외는 참·거짓", () => {
  assert.equal(accKey(20301), "quizAcc:20301");
  assert.deepEqual(ACC_MULTS, [1, 1.5, 2]);
  assert.deepEqual(normAcc({ timeMult: 1.5, noImage: 1 }), { timeMult: 1.5, noImage: true });
  assert.deepEqual(normAcc({ timeMult: "2" }), { timeMult: 2, noImage: false });
  assert.deepEqual(normAcc({ timeMult: 3 }), { timeMult: 1, noImage: false });
  assert.deepEqual(normAcc(null), { timeMult: 1, noImage: false });
  assert.equal(isDefaultAcc({ timeMult: 1, noImage: false }), true);
  assert.equal(isDefaultAcc({ timeMult: 1, noImage: true }), false);
});

test("withAcc: quizAcc 값이 옛 설정 맵을 이기고, 문서가 없는 학번은 옛 값을 그대로 둔다", () => {
  const cfg = quizCfg({ quiz: { timeMult: { 20301: 1.5, 20302: 2 }, noImage: { 20302: true } } });
  const out = withAcc(cfg, { 20302: { timeMult: 1.5, noImage: false }, 20303: { timeMult: 2 } });
  assert.deepEqual(out.timeMult, { 20301: 1.5, 20302: 1.5, 20303: 2 });
  assert.deepEqual(out.noImage, { 20302: false, 20303: false });
  assert.deepEqual(cfg.timeMult, { 20301: 1.5, 20302: 2 }, "원본 설정은 바뀌지 않는다");
  assert.equal(withAcc(cfg, {}), cfg, "덮을 값이 없으면 같은 객체");
  assert.equal(withAcc(cfg, null), cfg);
});

test("withAcc 결과로 남은 시간 계산: 설정 맵이 비어 있어도 quizAcc 배수가 적용된다", () => {
  const cfg = withAcc(quizCfg({ quiz: {} }), { 20301: { timeMult: 2 } });
  assert.equal(remainingSec({ nowMs: 0, startedAtMs: 0, cfg, v: { sid: "20301", timeMult: 1 }, sid: "20301" }), DEFAULT_QUIZ.durationSec * 2);
  assert.equal(remainingSec({ nowMs: 0, startedAtMs: 0, cfg, v: { sid: "20302" }, sid: "20302" }), DEFAULT_QUIZ.durationSec);
});

test("migrateEntries: 기본값이 아닌 학번만 옮기고, 이미 quizAcc 에 있는 학번은 건드리지 않으며, 키가 있으면 비운다", () => {
  const cfg = { timeMult: { 20301: 1.5, 20302: 1, 20304: 2 }, noImage: { 20303: true, 20302: false } };
  const r = migrateEntries(cfg, { 20304: { timeMult: 1.5 } });
  assert.deepEqual(r.write, { 20301: { timeMult: 1.5, noImage: false }, 20303: { timeMult: 1, noImage: true } });
  assert.equal(r.clear, true);
  assert.deepEqual(migrateEntries({ timeMult: { 20302: 1 }, noImage: {} }, {}), { write: {}, clear: true }, "1·false 만 남은 키도 비운다");
  assert.deepEqual(migrateEntries({ timeMult: {}, noImage: {} }, {}), { write: {}, clear: false });
  assert.deepEqual(migrateEntries(quizCfg(null), {}), { write: {}, clear: false });
});

test("accWrite: 기본값이면 지우되, 옛 맵에 키가 남아 있으면 기본값을 그대로 쓴다", () => {
  assert.deepEqual(accWrite({ timeMult: 1.5 }, { timeMult: 1 }, false), { op: "remove", value: { timeMult: 1, noImage: false } });
  assert.deepEqual(accWrite({ timeMult: 1.5 }, { timeMult: 1 }, true), { op: "set", value: { timeMult: 1, noImage: false } });
  assert.deepEqual(accWrite({ timeMult: 1.5, noImage: false }, { noImage: true }, false), { op: "set", value: { timeMult: 1.5, noImage: true } });
  assert.deepEqual(accWrite({}, { timeMult: "2" }, false), { op: "set", value: { timeMult: 2, noImage: false } });
  assert.equal(legacyHas({ timeMult: { 20301: 1 } }, "20301"), true);
  assert.equal(legacyHas({ timeMult: {}, noImage: {} }, "20301"), false);
  assert.equal(legacyHas(null, "20301"), false);
});
