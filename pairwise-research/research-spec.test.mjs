import test from "node:test";
import assert from "node:assert/strict";

import {
  PAIRWISE_DEFAULTS,
  PRE_SURVEY_ITEMS,
  SELF_ASSESSMENT_ITEMS,
  SELF_SCORE_LABELS,
  classifySelfChange,
  comparisonBudget,
  makeClassAssignments,
  preSurveyComplete,
  ratingWorkPlan,
  scorePreSurvey,
  selfAssessmentComplete,
  summarizeAssignments,
  validateAssignments,
} from "./research-spec.mjs";

function fixture(size = 24) {
  const evaluators = Array.from({ length: size }, (_, i) => "S" + String(i + 1).padStart(2, "0"));
  const works = evaluators.map((ownerId, i) => ({
    id: "W" + String(i + 1).padStart(2, "0"),
    ownerId,
    title: "작품 " + (i + 1),
    relic: "가상 유물 " + (i + 1),
    captionText: "작품 캡션 " + (i + 1),
    contextVersion: "fixture-caption-v1",
  }));
  return { works, evaluators };
}

test("사전설문은 비유도성 20문항이고 세 척도를 분리해 계산한다", () => {
  assert.equal(PRE_SURVEY_ITEMS.length, 20);
  const answers = Object.fromEntries(PRE_SURVEY_ITEMS.map((item) => [item.id, item.options ? 2 : item.scale.max]));
  assert.equal(preSurveyComplete(answers), true);
  const scores = scorePreSurvey(answers);
  assert.equal(scores.art_interest, 7);
  assert.equal(scores.art_exposure, 7);
  assert.equal(scores.ai_attitude, 10);
  assert.equal(Object.hasOwn(scores, "total"), false);
  const exposure = PRE_SURVEY_ITEMS.find((item) => item.id === "vai_8");
  assert.deepEqual(exposure.scale.labels, ["1년에 한 번 미만", "연 1회", "반년에 1회", "3개월에 1회", "월 1회", "2주에 1회", "주 1회 이상"]);
});

test("총 12화면 기본값은 본 비교 11회와 숨은 반복 1회로 구성된다", () => {
  const { works, evaluators } = fixture(24);
  assert.equal(PAIRWISE_DEFAULTS.mainTrials, 11);
  const plans = makeClassAssignments({ works, evaluators, seed: "twelve-total" });
  assert.equal(Object.values(plans).every((plan) => plan.mainTrialCount === 11 && plan.repeatTrialCount === 1 && plan.trials.length === 12), true);
  assert.deepEqual(validateAssignments({ works, plans }), []);
});

test("12화면 설계의 정보량과 자기평가 완료·변화 분류를 계산한다", () => {
  const budget = comparisonBudget({ workCount: 24, evaluatorCount: 24, mainTrials: 11 });
  assert.equal(budget.totalMainDecisions, 264);
  assert.equal(budget.comparisonsPerWork, 22);
  assert.equal(budget.meetsBasicTarget, true);
  assert.equal(budget.meetsPracticalTarget, true);
  assert.equal(budget.meetsConservativeTarget, false);
  assert.equal(budget.minimumMainTrialsForBasicTarget, 5);
  assert.equal(budget.minimumMainTrialsForPracticalTarget, 10);
  assert.equal(budget.minimumMainTrialsForConservativeTarget, 21);

  assert.deepEqual(SELF_SCORE_LABELS, [
    "전혀 그렇지 않다",
    "그렇지 않은 편이다",
    "보통이다",
    "그런 편이다",
    "매우 그렇다",
  ]);
  assert.equal(SELF_ASSESSMENT_ITEMS.some((item) => item.id === "plate"), false);
  const captionItem = SELF_ASSESSMENT_ITEMS.find((item) => item.id === "caption");
  assert.deepEqual(captionItem, {
    id: "caption",
    label: "작품 캡션의 의미 구체화",
    text: "작품 캡션(제목·유물명·짧은 설명)을 읽으면 이미지가 무엇을 뜻하는지 더 구체적으로 이해할 수 있다.",
  });

  const beforeScores = Object.fromEntries(SELF_ASSESSMENT_ITEMS.map((item) => [item.id, 3]));
  const afterScores = { ...beforeScores, overall: 4, cause: 2 };
  assert.equal(selfAssessmentComplete({ scores: beforeScores, evidence: "흔적의 위치와 작품 캡션의 설명이 구체적으로 연결된다." }), true);
  assert.equal(selfAssessmentComplete({ scores: afterScores, evidence: "근거가 충분히 구체적으로 보인다.", changeReasonCode: "new_or_shifted", changeReason: "흔적의 위치는 강하지만 인과 연결은 약하다고 판단했다." }, { requireChangeReason: true }), true);
  assert.equal(selfAssessmentComplete({ scores: afterScores, evidence: "근거가 충분히 구체적으로 보인다.", changeReasonCode: "unclear", changeReason: "" }, { requireChangeReason: true }), true);
  assert.equal(classifySelfChange(beforeScores, afterScores).deltaClass, "mixed");
});

test("24작품·24평가자·본 비교 12회 배정의 핵심 불변식", () => {
  const { works, evaluators } = fixture(24);
  const plans = makeClassAssignments({ works, evaluators, k: 12, seed: "class-24-pilot" });
  assert.deepEqual(validateAssignments({ works, plans }), []);
  assert.equal(Object.values(plans).every((plan) => plan.algorithmVersion === "balanced-class-v4"), true);

  for (const evaluatorId of evaluators) {
    const plan = plans[evaluatorId];
    const main = plan.trials.filter((trial) => !trial.repeatOf);
    const repeats = plan.trials.filter((trial) => trial.repeatOf);
    assert.equal(main.length, 12);
    assert.equal(repeats.length, 1);
    assert.equal(new Set(main.map((trial) => trial.pairId)).size, main.length);
    assert.equal(Math.abs(
      main.filter((trial) => trial.context === "image_only").length
      - main.filter((trial) => trial.context === "image_context").length,
    ) <= 1, true);
    assert.equal(Math.abs(
      plan.trials.filter((trial) => trial.context === "image_only").length
      - plan.trials.filter((trial) => trial.context === "image_context").length,
    ) <= 1, true);
    for (const repeat of repeats) {
      const sourceIndex = plan.trials.findIndex((trial) => trial.trialId === repeat.repeatOf);
      const repeatIndex = plan.trials.indexOf(repeat);
      assert.equal(repeatIndex - sourceIndex - 1 >= 3, true);
    }
    const own = works.find((work) => work.ownerId === evaluatorId).id;
    assert.equal(main.some((trial) => trial.leftWorkId === own || trial.rightWorkId === own), false);
    const rating = ratingWorkPlan(plan, 6);
    assert.equal(rating.length, 6);
    assert.equal(rating.every((item) => plan.contextByWork[item.workId] === item.context), true);
  }

  const summary = summarizeAssignments({ works, plans });
  assert.equal(summary.screenTrials, 24 * 13);
  assert.equal(summary.connectedComponents, 1);
  assert.equal(summary.reasonPromptCount, Math.round(summary.mainTrials * 0.2));
  assert.equal(summary.mainExposureRange <= 2, true);
  assert.equal(summary.exposureRange <= 3, true);
  assert.equal(summary.maxPositionImbalance <= 1, true);
  assert.equal(summary.maxMainContextExposureImbalance <= 1, true);
  assert.equal(summary.maxMainContextPositionImbalance <= 2, true);
  for (const work of works) {
    assert.equal(
      summary.mainContextExposure[work.id].image_only + summary.mainContextExposure[work.id].image_context,
      summary.mainExposure[work.id],
    );
    assert.equal(
      summary.mainContextLeft[work.id].image_only + summary.mainContextRight[work.id].image_only,
      summary.mainContextExposure[work.id].image_only,
    );
    assert.equal(
      summary.mainContextLeft[work.id].image_context + summary.mainContextRight[work.id].image_context,
      summary.mainContextExposure[work.id].image_context,
    );
  }
  assert.equal(Math.abs(summary.mainContexts.image_only - summary.mainContexts.image_context) <= 1, true);
  assert.equal(Math.abs(summary.contexts.image_only - summary.contexts.image_context) <= 1, true);

  const corrupted = structuredClone(plans);
  for (const plan of Object.values(corrupted)) {
    for (const trial of plan.trials) {
      if (trial.repeatOf || (trial.leftWorkId !== "W01" && trial.rightWorkId !== "W01")) continue;
      trial.context = "image_only";
      if (trial.rightWorkId === "W01") {
        [trial.leftWorkId, trial.rightWorkId] = [trial.rightWorkId, trial.leftWorkId];
      }
    }
  }
  const corruptedErrors = validateAssignments({ works, plans: corrupted });
  assert.equal(corruptedErrors.some((error) => error.includes("작품별 본 비교 맥락 조건 노출 불균형")), true);
  assert.equal(corruptedErrors.some((error) => error.includes("작품·맥락조건별 본 비교 좌우 위치 불균형")), true);
});

test("같은 입력과 seed는 배열 입력 순서와 무관하게 같은 계획을 만든다", () => {
  const { works, evaluators } = fixture(18);
  const a = makeClassAssignments({ works, evaluators, k: 10, seed: "same-seed" });
  const b = makeClassAssignments({ works: [...works].reverse(), evaluators: [...evaluators].reverse(), k: 10, seed: "same-seed" });
  assert.deepEqual(a, b);
});

test("seed가 달라지면 배정 또는 순서가 달라진다", () => {
  const { works, evaluators } = fixture(16);
  const a = makeClassAssignments({ works, evaluators, k: 8, seed: "seed-a" });
  const b = makeClassAssignments({ works, evaluators, k: 8, seed: "seed-b" });
  assert.notEqual(a[evaluators[0]].assignmentHash, b[evaluators[0]].assignmentHash);
});

test("현재 12화면 기본값은 100개 seed에서도 좌우·맥락·간격 불변식을 유지한다", () => {
  const { works, evaluators } = fixture(24);
  for (let i = 0; i < 100; i += 1) {
    const plans = makeClassAssignments({ works, evaluators, seed: "stress-" + i });
    const errors = validateAssignments({ works, plans });
    assert.deepEqual(errors, [], "seed stress-" + i + ": " + errors.join(" / "));
    const summary = summarizeAssignments({ works, plans });
    assert.equal(summary.maxPositionImbalance <= 1, true, "seed stress-" + i + ": 좌우 편차");
    assert.equal(Math.abs(summary.contexts.image_only - summary.contexts.image_context) <= 1, true, "seed stress-" + i + ": 맥락 편차");
    assert.equal(summary.maxMainContextExposureImbalance <= 1, true, "seed stress-" + i + ": 작품별 맥락 노출 편차");
    assert.equal(summary.maxMainContextPositionImbalance <= 2, true, "seed stress-" + i + ": 작품×맥락 좌우 편차");
  }
});

test("요청 시행 수를 채울 수 없으면 축소 계획 대신 생성이 중단된다", () => {
  const { works, evaluators } = fixture(4);
  assert.throws(
    () => makeClassAssignments({ works, evaluators, k: 12, seed: "too-small" }),
    /본 비교 12회/,
  );
});

test("숫자 0 ownerId도 문자열 평가자 0의 자기 작품으로 정확히 제외한다", () => {
  const evaluators = ["0", "1", "2", "3", "4", "5"];
  const works = evaluators.map((id, index) => ({
    id: index,
    ownerId: index,
    title: `작품 ${index}`,
    relic: `유물 ${index}`,
    captionText: `작품 캡션 ${index}`,
    contextVersion: "numeric-caption-v1",
  }));
  const plans = makeClassAssignments({ works, evaluators, k: 2, seed: "numeric-zero", includeRepeat: false });
  const ownWork = "0";
  assert.equal(plans["0"].trials.some((trial) => trial.leftWorkId === ownWork || trial.rightWorkId === ownWork), false);
  assert.deepEqual(validateAssignments({ works, plans }), []);
});

test("중복·누락 명단과 0회 계획은 검증을 통과하지 못한다", () => {
  const badWorks = [
    { id: "W1", ownerId: "S1", title: "작품 1", relic: "유물 1", captionText: "캡션 1", contextVersion: "bad-v1" },
    { id: "W1", ownerId: "S2", title: "작품 2", relic: "유물 2", captionText: "캡션 2", contextVersion: "bad-v1" },
  ];
  assert.throws(() => makeClassAssignments({ works: badWorks, evaluators: ["S1", "S2"], k: 1 }), /중복 작품 id/);

  const { works } = fixture(3);
  const plans = Object.fromEntries(works.map((work) => [work.ownerId, {
    evaluatorId: work.ownerId,
    requestedMainTrialCount: 0,
    mainTrialCount: 0,
    requestedRepeatTrialCount: 0,
    repeatTrialCount: 0,
    minRepeatGap: 3,
    reasonRateNominal: 0.2,
    contextByWork: {},
    trials: [],
  }]));
  const errors = validateAssignments({ works, plans });
  assert.equal(errors.some((error) => error.includes("본 비교가 0회")), true);
  assert.equal(errors.some((error) => error.includes("그래프")), true);
});

test("작품 캡션 payload는 r3 필수 필드·길이·단일 contextVersion을 검증한다", () => {
  const { works, evaluators } = fixture(6);
  const noteOnly = structuredClone(works);
  noteOnly[0].note = noteOnly[0].captionText;
  delete noteOnly[0].captionText;
  assert.throws(
    () => makeClassAssignments({ works: noteOnly, evaluators, k: 2, seed: "note-fallback-blocked" }),
    /captionText가 비어/,
  );

  const overlong = structuredClone(works);
  overlong[0].captionText = "가".repeat(121);
  assert.throws(
    () => makeClassAssignments({ works: overlong, evaluators, k: 2, seed: "caption-too-long" }),
    /captionText가 120자를 초과/,
  );

  const mixedVersion = structuredClone(works);
  mixedVersion[0].contextVersion = "fixture-caption-v2";
  assert.throws(
    () => makeClassAssignments({ works: mixedVersion, evaluators, k: 2, seed: "mixed-context-version" }),
    /contextVersion이 서로 다릅니다/,
  );
});

test("최소 3개 화면은 위치 차이 3이 아니라 실제 사이 화면 수로 검사한다", () => {
  const { works, evaluators } = fixture(14);
  const plans = structuredClone(makeClassAssignments({ works, evaluators, k: 12, seed: "gap-audit" }));
  const plan = plans[evaluators[0]];
  const repeatIndex = plan.trials.findIndex((trial) => trial.repeatOf);
  const [repeat] = plan.trials.splice(repeatIndex, 1);
  const sourceIndex = plan.trials.findIndex((trial) => trial.trialId === repeat.repeatOf);
  plan.trials.splice(sourceIndex + 3, 0, repeat);
  plan.trials.forEach((trial, displayIndex) => { trial.displayIndex = displayIndex; });
  const errors = validateAssignments({ works, plans });
  assert.equal(errors.some((error) => error.includes("반복 사이 화면 수 부족")), true);
});

test("repeatRate가 0이면 includeRepeat가 참이어도 반복이 생기지 않는다", () => {
  const { works, evaluators } = fixture(12);
  const plans = makeClassAssignments({ works, evaluators, k: 6, seed: "no-repeat", repeatRate: 0 });
  assert.equal(Object.values(plans).every((plan) => plan.repeatTrialCount === 0), true);
  assert.deepEqual(validateAssignments({ works, plans }), []);
});

test("홀수 시행 수에서도 평가자 id 성향과 무관하게 학급·학생 맥락조건을 맞춘다", () => {
  const evaluators = Array.from({ length: 20 }, (_, index) => `biased-id-${index * 7919 + 17}`);
  const works = evaluators.map((ownerId, index) => ({
    id: `odd-W${index + 1}`,
    ownerId,
    title: `작품 ${index + 1}`,
    relic: `유물 ${index + 1}`,
    captionText: `작품 캡션 ${index + 1}`,
    contextVersion: "odd-caption-v1",
  }));
  const plans = makeClassAssignments({ works, evaluators, k: 11, seed: "odd-context-balance" });
  const summary = summarizeAssignments({ works, plans });
  assert.equal(Math.abs(summary.contexts.image_only - summary.contexts.image_context) <= 1, true);
  assert.equal(Object.values(plans).every((plan) => {
    const only = plan.trials.filter((trial) => trial.context === "image_only").length;
    return Math.abs(only - (plan.trials.length - only)) <= 1;
  }), true);
  assert.deepEqual(validateAssignments({ works, plans }), []);
});
