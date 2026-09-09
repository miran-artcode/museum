import test from "node:test";
import assert from "node:assert/strict";

import { makeClassAssignments } from "./research-spec.mjs";
import {
  RATING_ASSIGNMENT_ALGORITHM,
  RATING_ASSIGNMENT_VERSION,
  makeClassRatingAssignments,
  summarizeClassRatingAssignments,
  validateClassRatingAssignments,
} from "./rating-assignment.mjs";

function fixture(size = 24) {
  const evaluators = Array.from({ length: size }, (_, index) => `S${String(index + 1).padStart(2, "0")}`);
  const works = evaluators.map((ownerId, index) => ({
    id: `W${String(index + 1).padStart(2, "0")}`,
    ownerId,
    title: `작품 ${index + 1}`,
    relic: `가상 유물 ${index + 1}`,
    captionText: `작품 캡션 ${index + 1}`,
    contextVersion: "caption-v1",
  }));
  return { works, evaluators };
}

function pairPlans(works, evaluators, seed) {
  return makeClassAssignments({ works, evaluators, seed });
}

function mainEligibility(plan) {
  const seen = new Map();
  for (const trial of plan.trials.filter((item) => !item.repeatOf)) {
    seen.set(trial.leftWorkId, trial.context);
    seen.set(trial.rightWorkId, trial.context);
  }
  return seen;
}

test("24명×24작품은 학생당 6개, 작품당 6개, 작품×조건당 3개로 정확히 배정된다", () => {
  const { works, evaluators } = fixture();
  const plans = pairPlans(works, evaluators, "rating-balanced-pairs");
  const ratingAssignment = makeClassRatingAssignments({ works, plans, seed: "rating-balanced" });

  assert.equal(ratingAssignment.version, RATING_ASSIGNMENT_VERSION);
  assert.equal(ratingAssignment.algorithmVersion, RATING_ASSIGNMENT_ALGORITHM);
  assert.match(ratingAssignment.classAssignmentHash, /^[0-9a-f]{8}$/);
  assert.deepEqual(validateClassRatingAssignments({ works, plans, ratingAssignment }), []);

  for (const evaluatorId of evaluators) {
    const items = ratingAssignment.assignments[evaluatorId].items;
    assert.equal(items.length, 6);
    assert.deepEqual(items.map((item) => item.ratingIndex), [0, 1, 2, 3, 4, 5]);
    assert.equal(new Set(items.map((item) => item.workId)).size, 6);
    assert.equal(items.filter((item) => item.context === "image_only").length, 3);
    assert.equal(items.filter((item) => item.context === "image_context").length, 3);
    assert.equal(items.every((item) => typeof item.contextPayloadHash === "string" && item.contextPayloadHash.length > 0), true);
  }

  const summary = summarizeClassRatingAssignments({ works, plans, ratingAssignment });
  assert.equal(summary.totalRatings, 144);
  assert.equal(summary.workRatingRange, 0);
  assert.deepEqual(summary.workContextRatingRange, { image_only: 0, image_context: 0 });
  assert.equal(Object.values(summary.perWork).every((count) => count === 6), true);
  assert.equal(Object.values(summary.perWorkContext).every((count) => count.image_only === 3 && count.image_context === 3), true);
  assert.deepEqual(summary.validationErrors, []);
});

test("평정 후보는 본 비교에서 실제로 본 맥락의 작품뿐이며 자기 작품은 제외된다", () => {
  const { works, evaluators } = fixture();
  const plans = pairPlans(works, evaluators, "rating-eligibility-pairs");
  const ratingAssignment = makeClassRatingAssignments({ works, plans, seed: "rating-eligibility" });
  const ownByEvaluator = new Map(works.map((work) => [work.ownerId, work.id]));

  for (const evaluatorId of evaluators) {
    const eligible = mainEligibility(plans[evaluatorId]);
    for (const item of ratingAssignment.assignments[evaluatorId].items) {
      assert.equal(item.workId === ownByEvaluator.get(evaluatorId), false);
      assert.equal(eligible.get(item.workId), item.context);
      assert.equal(item.contextPayloadHash, plans[evaluatorId].contextPayloadHashByWork[item.workId]);
    }
  }
});

test("같은 seed의 결과는 작품·계획 입력 순서와 무관하고 재현 가능하다", () => {
  const { works, evaluators } = fixture();
  const plans = pairPlans(works, evaluators, "rating-order-pairs");
  const reversedPlans = Object.fromEntries(Object.entries(plans).reverse().map(([evaluatorId, plan]) => [evaluatorId, {
    ...plan,
    trials: [...plan.trials].reverse(),
    contextByWork: Object.fromEntries(Object.entries(plan.contextByWork).reverse()),
    contextPayloadHashByWork: Object.fromEntries(Object.entries(plan.contextPayloadHashByWork).reverse()),
  }]));
  const first = makeClassRatingAssignments({ works, plans, seed: "rating-order" });
  const second = makeClassRatingAssignments({ works: [...works].reverse(), plans: reversedPlans, seed: "rating-order" });
  const replay = makeClassRatingAssignments({ works, plans, seed: "rating-order" });

  assert.deepEqual(first, second);
  assert.deepEqual(first, replay);
});

test("seed는 배정 순서와 학급 해시에 반영된다", () => {
  const { works, evaluators } = fixture();
  const plans = pairPlans(works, evaluators, "rating-seed-pairs");
  const first = makeClassRatingAssignments({ works, plans, seed: "rating-seed-a" });
  const second = makeClassRatingAssignments({ works, plans, seed: "rating-seed-b" });
  assert.notEqual(first.classAssignmentHash, second.classAssignmentHash);
  assert.notDeepEqual(first.assignments, second.assignments);
});

test("변조된 인덱스·중복·자기 작품·맥락 payload와 학급 해시를 검출한다", () => {
  const { works, evaluators } = fixture();
  const plans = pairPlans(works, evaluators, "rating-tamper-pairs");
  const original = makeClassRatingAssignments({ works, plans, seed: "rating-tamper" });
  const evaluatorId = evaluators[0];
  const ownWorkId = works.find((work) => work.ownerId === evaluatorId).id;

  const badIndex = structuredClone(original);
  badIndex.assignments[evaluatorId].items[0].ratingIndex = 9;
  assert.equal(validateClassRatingAssignments({ works, plans, ratingAssignment: badIndex }).some((error) => error.includes("ratingIndex")), true);

  const duplicate = structuredClone(original);
  duplicate.assignments[evaluatorId].items[1].workId = duplicate.assignments[evaluatorId].items[0].workId;
  assert.equal(validateClassRatingAssignments({ works, plans, ratingAssignment: duplicate }).some((error) => error.includes("중복 평정")), true);

  const own = structuredClone(original);
  own.assignments[evaluatorId].items[0].workId = ownWorkId;
  assert.equal(validateClassRatingAssignments({ works, plans, ratingAssignment: own }).some((error) => error.includes("자기 작품")), true);

  const badPayload = structuredClone(original);
  badPayload.assignments[evaluatorId].items[0].contextPayloadHash = "tampered";
  const payloadErrors = validateClassRatingAssignments({ works, plans, ratingAssignment: badPayload });
  assert.equal(payloadErrors.some((error) => error.includes("contextPayloadHash")), true);
  assert.equal(payloadErrors.some((error) => error.includes("배정 해시")), true);
});

test("노출 그래프가 목표 할당량을 지지하지 않으면 축소 없이 중단한다", () => {
  const { works, evaluators } = fixture();
  const plans = pairPlans(works, evaluators, "rating-fail-closed-pairs");
  const concentratedOnlyQuota = Object.fromEntries(works.map((work, index) => [work.id, index === 0 ? 72 : 0]));

  assert.throws(
    () => makeClassRatingAssignments({
      works,
      plans,
      seed: "rating-impossible",
      workContextQuotas: {
        image_only: concentratedOnlyQuota,
        image_context: 3,
      },
    }),
    /배정이 불가능합니다/,
  );
});

test("r3 작품 payload의 필수 필드·120자 상한·학급 단일 버전을 그대로 강제한다", () => {
  const { works, evaluators } = fixture();
  const plans = pairPlans(works, evaluators, "rating-payload-contract-pairs");

  for (const field of ["title", "relic", "captionText", "contextVersion"]) {
    const missing = structuredClone(works);
    if (field === "captionText") missing[0].note = missing[0].captionText;
    delete missing[0][field];
    assert.throws(
      () => makeClassRatingAssignments({ works: missing, plans, seed: `missing-${field}` }),
      new RegExp(`${field}가 비어`),
    );
  }

  for (const field of ["title", "relic", "captionText"]) {
    const overlong = structuredClone(works);
    overlong[0][field] = "가".repeat(121);
    assert.throws(
      () => makeClassRatingAssignments({ works: overlong, plans, seed: `overlong-${field}` }),
      new RegExp(`${field}가 120자를 초과`),
    );
  }

  const mixedVersion = structuredClone(works);
  mixedVersion[0].contextVersion = "caption-v2";
  assert.throws(
    () => makeClassRatingAssignments({ works: mixedVersion, plans, seed: "mixed-context-version" }),
    /contextVersion이 서로 다릅니다/,
  );
});

test("계획의 작품 payload 해시가 누락되거나 현재 캡션과 다르면 중단한다", () => {
  const { works, evaluators } = fixture();
  const plans = pairPlans(works, evaluators, "rating-payload-hash-pairs");
  const evaluatorId = evaluators[0];
  const seenWorkId = plans[evaluatorId].trials.find((trial) => !trial.repeatOf).leftWorkId;

  const missingHashPlans = structuredClone(plans);
  delete missingHashPlans[evaluatorId].contextPayloadHashByWork[seenWorkId];
  assert.throws(
    () => makeClassRatingAssignments({ works, plans: missingHashPlans, seed: "missing-payload-hash" }),
    /contextPayloadHashByWork 값이 없습니다/,
  );

  const staleWorks = structuredClone(works);
  staleWorks.find((work) => work.id === seenWorkId).captionText += " 수정";
  assert.throws(
    () => makeClassRatingAssignments({ works: staleWorks, plans, seed: "stale-payload-hash" }),
    /현재 작품 payload와 다릅니다/,
  );
});

test("24명 기본 설계는 100개 seed에서 모든 평정 균형 불변식을 유지한다", () => {
  const { works, evaluators } = fixture();
  for (let index = 0; index < 100; index += 1) {
    const pairSeed = `rating-stress-pair-${index}`;
    const ratingSeed = `rating-stress-${index}`;
    const plans = pairPlans(works, evaluators, pairSeed);
    const ratingAssignment = makeClassRatingAssignments({ works, plans, seed: ratingSeed });
    const errors = validateClassRatingAssignments({ works, plans, ratingAssignment });
    assert.deepEqual(errors, [], `${ratingSeed}: ${errors.join(" / ")}`);
    const summary = summarizeClassRatingAssignments({ works, plans, ratingAssignment });
    assert.equal(summary.totalRatings, 144, ratingSeed);
    assert.equal(summary.workRatingRange, 0, `${ratingSeed}: 작품별 평정 수`);
    assert.deepEqual(summary.workContextRatingRange, { image_only: 0, image_context: 0 }, `${ratingSeed}: 작품×조건 평정 수`);
  }
});
