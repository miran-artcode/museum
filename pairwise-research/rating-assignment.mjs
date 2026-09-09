/**
 * 학급 단위 사후 AI 인상평가 배정.
 *
 * 쌍대비교 본 시행에서 실제로 본 evaluator×work×context만 후보로 삼고,
 * 조건별 이분 그래프의 정수 최대유량을 구해 평가자·작품 할당량을
 * 동시에 정확히 맞춘다. 목표를 충족하지 못하면 일부만 반환하지 않는다.
 */

export const RATING_ASSIGNMENT_VERSION = "class-rating-v1";
export const RATING_ASSIGNMENT_ALGORITHM = "seeded-bipartite-max-flow-v1";
export const RATING_CONTEXTS = Object.freeze(["image_only", "image_context"]);
const CONTEXT_TEXT_MAX_LENGTH = 120;

const compareText = (a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);

function normalizedId(value) {
  return String(value ?? "").trim();
}

function stringHash(input) {
  let hash = 2166136261;
  const text = String(input);
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort(compareText);
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function hexHash(value) {
  return stringHash(typeof value === "string" ? value : stableStringify(value)).toString(16).padStart(8, "0");
}

function contextPayloadHash(work) {
  // research-spec.mjs의 payload 계약은 키 삽입 순서가 고정된
  // JSON.stringify를 사용한다. 학급 배정 해시의 stable 직렬화와 분리한다.
  return stringHash(JSON.stringify({
    id: work.id,
    title: work.title,
    relic: work.relic,
    captionText: work.captionText,
    contextVersion: work.contextVersion,
  })).toString(16).padStart(8, "0");
}

function seededOrder(values, seedPart) {
  return [...values].sort((a, b) => {
    const aHash = stringHash(`${seedPart}::${a}`);
    const bHash = stringHash(`${seedPart}::${b}`);
    return aHash - bHash || compareText(a, b);
  });
}

function normalizeInputs(works, plans) {
  if (!Array.isArray(works) || !works.length) throw new Error("작품 명단이 비어 있습니다.");
  if (!plans || typeof plans !== "object" || Array.isArray(plans)) throw new Error("쌍대비교 학급 계획이 없습니다.");

  const cleanWorks = works.map((work, index) => {
    if (!work || typeof work !== "object") throw new Error(`작품 ${index + 1}의 자료 형식이 올바르지 않습니다.`);
    const id = normalizedId(work.id);
    const ownerId = normalizedId(work.ownerId);
    if (!id) throw new Error(`작품 ${index + 1}의 id가 비어 있습니다.`);
    if (id.includes("::")) throw new Error(`작품 id에는 예약 구분자 ::를 사용할 수 없습니다: ${id}`);
    if (!ownerId) throw new Error(`작품 ${id}의 ownerId가 비어 있습니다.`);
    const title = normalizedId(work.title);
    const relic = normalizedId(work.relic);
    const captionText = normalizedId(work.captionText);
    const contextVersion = normalizedId(work.contextVersion);
    for (const [field, value] of [["title", title], ["relic", relic], ["captionText", captionText]]) {
      if (!value) throw new Error(`작품 ${id}의 ${field}가 비어 있습니다.`);
      if (value.length > CONTEXT_TEXT_MAX_LENGTH) {
        throw new Error(`작품 ${id}의 ${field}가 ${CONTEXT_TEXT_MAX_LENGTH}자를 초과합니다.`);
      }
    }
    if (!contextVersion) throw new Error(`작품 ${id}의 contextVersion이 비어 있습니다.`);
    return { ...work, id, ownerId, title, relic, captionText, contextVersion };
  }).sort((a, b) => compareText(a.id, b.id));

  const workIds = new Set();
  const ownerIds = new Set();
  for (const work of cleanWorks) {
    if (workIds.has(work.id)) throw new Error(`중복 작품 id: ${work.id}`);
    if (ownerIds.has(work.ownerId)) throw new Error(`한 평가자에게 작품이 둘 이상 연결됨: ${work.ownerId}`);
    workIds.add(work.id);
    ownerIds.add(work.ownerId);
  }

  const planEntries = Object.entries(plans).map(([rawId, plan]) => [normalizedId(rawId), plan]);
  if (!planEntries.length) throw new Error("쌍대비교 학급 계획이 비어 있습니다.");
  if (planEntries.some(([id]) => !id)) throw new Error("평가자 id가 비어 있습니다.");
  if (new Set(planEntries.map(([id]) => id)).size !== planEntries.length) throw new Error("정규화한 평가자 id가 중복되었습니다.");
  planEntries.sort(([a], [b]) => compareText(a, b));

  const cleanPlans = {};
  for (const [evaluatorId, plan] of planEntries) {
    if (!plan || typeof plan !== "object") throw new Error(`${evaluatorId}: 쌍대비교 계획 형식이 올바르지 않습니다.`);
    if (normalizedId(plan.evaluatorId) !== evaluatorId) throw new Error(`${evaluatorId}: 계획의 평가자 id가 일치하지 않습니다.`);
    if (!Array.isArray(plan.trials)) throw new Error(`${evaluatorId}: 시행 배열이 없습니다.`);
    cleanPlans[evaluatorId] = plan;
  }

  const evaluatorIds = planEntries.map(([id]) => id);
  const evaluatorSet = new Set(evaluatorIds);
  for (const work of cleanWorks) {
    if (!evaluatorSet.has(work.ownerId)) throw new Error(`작품 ${work.id} 소유자의 평가 계획이 없습니다: ${work.ownerId}`);
  }
  if (new Set(cleanWorks.map((work) => work.contextVersion)).size !== 1) {
    throw new Error("학급 작품의 contextVersion이 서로 다릅니다.");
  }

  return {
    cleanWorks,
    cleanPlans,
    evaluatorIds,
    workById: new Map(cleanWorks.map((work) => [work.id, work])),
  };
}

function collectEligibility({ cleanWorks, cleanPlans, evaluatorIds, workById }) {
  const eligibleByEvaluator = {};
  const payloadHashByEvaluator = {};

  for (const evaluatorId of evaluatorIds) {
    const plan = cleanPlans[evaluatorId];
    const seen = new Map();
    const payloads = {};
    for (const trial of plan.trials.filter((item) => item && !item.repeatOf)) {
      if (!RATING_CONTEXTS.includes(trial.context)) throw new Error(`${evaluatorId}: 본 시행의 맥락 조건이 올바르지 않습니다.`);
      for (const rawWorkId of [trial.leftWorkId, trial.rightWorkId]) {
        const workId = normalizedId(rawWorkId);
        const work = workById.get(workId);
        if (!work) throw new Error(`${evaluatorId}: 본 시행에 존재하지 않는 작품이 있습니다: ${workId}`);
        if (work.ownerId === evaluatorId) throw new Error(`${evaluatorId}: 본 시행에 자기 작품이 포함되어 있습니다: ${workId}`);
        const declaredContext = plan.contextByWork && plan.contextByWork[workId];
        if (declaredContext != null && declaredContext !== trial.context) {
          throw new Error(`${evaluatorId}: 작품 ${workId}의 계획 맥락과 본 시행 맥락이 다릅니다.`);
        }
        if (seen.has(workId) && seen.get(workId) !== trial.context) {
          throw new Error(`${evaluatorId}: 작품 ${workId}가 서로 다른 맥락으로 제시되었습니다.`);
        }
        seen.set(workId, trial.context);
        const declaredHash = plan.contextPayloadHashByWork && plan.contextPayloadHashByWork[workId];
        if (declaredHash == null || declaredHash === "") {
          throw new Error(`${evaluatorId}: 작품 ${workId}의 contextPayloadHashByWork 값이 없습니다.`);
        }
        const expectedHash = contextPayloadHash(work);
        if (String(declaredHash) !== expectedHash) {
          throw new Error(`${evaluatorId}: 작품 ${workId}의 contextPayloadHashByWork 값이 현재 작품 payload와 다릅니다.`);
        }
        payloads[workId] = expectedHash;
      }
    }
    eligibleByEvaluator[evaluatorId] = Object.fromEntries([...seen.entries()].sort(([a], [b]) => compareText(a, b)));
    payloadHashByEvaluator[evaluatorId] = Object.fromEntries(Object.entries(payloads).sort(([a], [b]) => compareText(a, b)));
  }

  return { eligibleByEvaluator, payloadHashByEvaluator };
}

function normalizePositiveInteger(value, label, { allowZero = false } = {}) {
  const number = Number(value);
  const minimum = allowZero ? 0 : 1;
  if (!Number.isInteger(number) || number < minimum) throw new Error(`${label}은 ${minimum} 이상의 정수여야 합니다.`);
  return number;
}

function quotaByWork(option, context, workIds, inferredQuota) {
  const source = option == null ? inferredQuota : option[context];
  if (source == null) throw new Error(`${context} 작품별 할당량이 없습니다.`);
  if (typeof source === "number") {
    const quota = normalizePositiveInteger(source, `${context} 작품별 할당량`, { allowZero: true });
    return Object.fromEntries(workIds.map((workId) => [workId, quota]));
  }
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    throw new Error(`${context} 작품별 할당량 형식이 올바르지 않습니다.`);
  }
  const unexpected = Object.keys(source).map(normalizedId).filter((workId) => !workIds.includes(workId));
  if (unexpected.length) throw new Error(`${context} 할당량에 존재하지 않는 작품이 있습니다: ${unexpected.join(", ")}`);
  return Object.fromEntries(workIds.map((workId) => {
    if (!Object.hasOwn(source, workId)) throw new Error(`${context} 작품 ${workId}의 할당량이 없습니다.`);
    return [workId, normalizePositiveInteger(source[workId], `${context} 작품 ${workId} 할당량`, { allowZero: true })];
  }));
}

function normalizeQuotas({ evaluatorIds, workIds, ratingsPerEvaluator, ratingsPerContext, workContextQuotas, workQuotas }) {
  const perEvaluator = normalizePositiveInteger(ratingsPerEvaluator, "평가자별 평정 수");
  const contextTargets = ratingsPerContext == null
    ? (() => {
      if (perEvaluator % 2 !== 0) throw new Error("평가자별 평정 수가 홀수이면 조건별 평정 수를 명시해야 합니다.");
      return { image_only: perEvaluator / 2, image_context: perEvaluator / 2 };
    })()
    : Object.fromEntries(RATING_CONTEXTS.map((context) => [
      context,
      normalizePositiveInteger(ratingsPerContext[context], `${context} 평가자별 평정 수`, { allowZero: true }),
    ]));
  if (contextTargets.image_only + contextTargets.image_context !== perEvaluator) {
    throw new Error("조건별 평가자 평정 수의 합이 평가자별 평정 수와 다릅니다.");
  }

  const quotaByContext = {};
  for (const context of RATING_CONTEXTS) {
    const total = evaluatorIds.length * contextTargets[context];
    let inferred = null;
    if (workContextQuotas == null) {
      if (total % workIds.length !== 0) {
        throw new Error(`${context} 총 평정 ${total}회를 ${workIds.length}개 작품에 정확히 나눌 수 없습니다. workContextQuotas를 명시하십시오.`);
      }
      inferred = total / workIds.length;
    }
    quotaByContext[context] = quotaByWork(workContextQuotas, context, workIds, inferred);
    const quotaTotal = Object.values(quotaByContext[context]).reduce((sum, value) => sum + value, 0);
    if (quotaTotal !== total) throw new Error(`${context} 작품별 할당량 합계 ${quotaTotal}가 필요한 평정 수 ${total}와 다릅니다.`);
  }

  let totalQuotaByWork;
  if (workQuotas == null) {
    totalQuotaByWork = Object.fromEntries(workIds.map((workId) => [
      workId,
      RATING_CONTEXTS.reduce((sum, context) => sum + quotaByContext[context][workId], 0),
    ]));
  } else if (typeof workQuotas === "number") {
    const quota = normalizePositiveInteger(workQuotas, "작품별 총 할당량", { allowZero: true });
    totalQuotaByWork = Object.fromEntries(workIds.map((workId) => [workId, quota]));
  } else if (typeof workQuotas === "object" && !Array.isArray(workQuotas)) {
    totalQuotaByWork = Object.fromEntries(workIds.map((workId) => {
      if (!Object.hasOwn(workQuotas, workId)) throw new Error(`작품 ${workId}의 총 할당량이 없습니다.`);
      return [workId, normalizePositiveInteger(workQuotas[workId], `작품 ${workId} 총 할당량`, { allowZero: true })];
    }));
  } else {
    throw new Error("작품별 총 할당량 형식이 올바르지 않습니다.");
  }
  for (const workId of workIds) {
    const contextSum = RATING_CONTEXTS.reduce((sum, context) => sum + quotaByContext[context][workId], 0);
    if (totalQuotaByWork[workId] !== contextSum) {
      throw new Error(`작품 ${workId}의 총 할당량과 조건별 할당량 합계가 다릅니다.`);
    }
  }

  return {
    ratingsPerEvaluator: perEvaluator,
    ratingsPerContext: contextTargets,
    workQuotaById: totalQuotaByWork,
    workContextQuotaById: Object.fromEntries(workIds.map((workId) => [workId, {
      image_only: quotaByContext.image_only[workId],
      image_context: quotaByContext.image_context[workId],
    }])),
  };
}

function addFlowEdge(graph, from, to, capacity, meta = null) {
  const forward = { to, capacity, reverse: graph[to].length, meta };
  const backward = { to: from, capacity: 0, reverse: graph[from].length, meta: null };
  graph[from].push(forward);
  graph[to].push(backward);
  return forward;
}

function maximumFlow(graph, source, sink) {
  let total = 0;
  while (true) {
    const level = Array(graph.length).fill(-1);
    const queue = [source];
    level[source] = 0;
    for (let head = 0; head < queue.length; head += 1) {
      const node = queue[head];
      for (const edge of graph[node]) {
        if (edge.capacity > 0 && level[edge.to] < 0) {
          level[edge.to] = level[node] + 1;
          queue.push(edge.to);
        }
      }
    }
    if (level[sink] < 0) break;
    const nextEdge = Array(graph.length).fill(0);
    const send = (node, available) => {
      if (node === sink) return available;
      for (; nextEdge[node] < graph[node].length; nextEdge[node] += 1) {
        const edge = graph[node][nextEdge[node]];
        if (edge.capacity <= 0 || level[edge.to] !== level[node] + 1) continue;
        const amount = send(edge.to, Math.min(available, edge.capacity));
        if (!amount) continue;
        edge.capacity -= amount;
        graph[edge.to][edge.reverse].capacity += amount;
        return amount;
      }
      return 0;
    };
    while (true) {
      const amount = send(source, Number.MAX_SAFE_INTEGER);
      if (!amount) break;
      total += amount;
    }
  }
  return total;
}

function assignOneContext({ context, evaluatorIds, workIds, eligibleByEvaluator, evaluatorQuota, workQuotaById, seed }) {
  const orderedEvaluators = seededOrder(evaluatorIds, `${seed}::${context}::evaluator`);
  const orderedWorks = seededOrder(workIds, `${seed}::${context}::work-node`);
  const source = 0;
  const evaluatorOffset = 1;
  const workOffset = evaluatorOffset + orderedEvaluators.length;
  const sink = workOffset + orderedWorks.length;
  const graph = Array.from({ length: sink + 1 }, () => []);
  const evaluatorNode = new Map(orderedEvaluators.map((id, index) => [id, evaluatorOffset + index]));
  const workNode = new Map(orderedWorks.map((id, index) => [id, workOffset + index]));
  const candidateEdges = [];

  for (const evaluatorId of orderedEvaluators) {
    addFlowEdge(graph, source, evaluatorNode.get(evaluatorId), evaluatorQuota);
    const eligibleWorks = workIds.filter((workId) => eligibleByEvaluator[evaluatorId][workId] === context);
    if (eligibleWorks.length < evaluatorQuota) {
      throw new Error(`${evaluatorId}: ${context}에서 실제로 본 서로 다른 작품이 ${eligibleWorks.length}개라 평정 ${evaluatorQuota}개를 배정할 수 없습니다.`);
    }
    for (const workId of seededOrder(eligibleWorks, `${seed}::${context}::${evaluatorId}::edge`)) {
      const edge = addFlowEdge(graph, evaluatorNode.get(evaluatorId), workNode.get(workId), 1, { evaluatorId, workId });
      candidateEdges.push(edge);
    }
  }
  for (const workId of orderedWorks) addFlowEdge(graph, workNode.get(workId), sink, workQuotaById[workId]);

  const required = orderedEvaluators.length * evaluatorQuota;
  const achieved = maximumFlow(graph, source, sink);
  if (achieved !== required) {
    throw new Error(`${context} 사후 평정 배정이 불가능합니다: 필요 ${required}개 중 ${achieved}개만 매칭되었습니다. 본 비교 노출 그래프나 명시 할당량을 확인하십시오.`);
  }

  const selected = Object.fromEntries(evaluatorIds.map((evaluatorId) => [evaluatorId, []]));
  for (const edge of candidateEdges) {
    if (edge.capacity === 0) selected[edge.meta.evaluatorId].push(edge.meta.workId);
  }
  for (const evaluatorId of evaluatorIds) selected[evaluatorId].sort(compareText);
  return selected;
}

function assignmentHashPayload(assignment) {
  return {
    version: assignment.version,
    algorithmVersion: assignment.algorithmVersion,
    rosterVersion: assignment.rosterVersion,
    evaluatorIds: assignment.evaluatorIds,
    workIds: assignment.workIds,
    ratingsPerEvaluator: assignment.ratingsPerEvaluator,
    ratingsPerContext: assignment.ratingsPerContext,
    workQuotaById: assignment.workQuotaById,
    workContextQuotaById: assignment.workContextQuotaById,
    assignments: assignment.assignments,
  };
}

/**
 * @param {object} options
 * @param {Array<object>} options.works 작품 명단(id, ownerId 포함)
 * @param {object} options.plans makeClassAssignments의 학급 계획
 * @param {string} [options.seed]
 * @param {number} [options.ratingsPerEvaluator=6]
 * @param {{image_only:number,image_context:number}} [options.ratingsPerContext]
 * @param {{image_only:number|object,image_context:number|object}} [options.workContextQuotas]
 * @param {number|object} [options.workQuotas]
 */
export function makeClassRatingAssignments({
  works,
  plans,
  seed = "class-rating-v1",
  ratingsPerEvaluator = 6,
  ratingsPerContext,
  workContextQuotas,
  workQuotas,
} = {}) {
  const normalized = normalizeInputs(works, plans);
  const { cleanWorks, cleanPlans, evaluatorIds, workById } = normalized;
  const workIds = cleanWorks.map((work) => work.id);
  const { eligibleByEvaluator, payloadHashByEvaluator } = collectEligibility(normalized);
  const quotas = normalizeQuotas({
    evaluatorIds,
    workIds,
    ratingsPerEvaluator,
    ratingsPerContext,
    workContextQuotas,
    workQuotas,
  });

  const selectedByContext = {};
  for (const context of RATING_CONTEXTS) {
    selectedByContext[context] = assignOneContext({
      context,
      evaluatorIds,
      workIds,
      eligibleByEvaluator,
      evaluatorQuota: quotas.ratingsPerContext[context],
      workQuotaById: Object.fromEntries(workIds.map((workId) => [workId, quotas.workContextQuotaById[workId][context]])),
      seed: String(seed),
    });
  }

  const assignments = {};
  for (const evaluatorId of evaluatorIds) {
    const selected = RATING_CONTEXTS.flatMap((context) => selectedByContext[context][evaluatorId].map((workId) => ({
      workId,
      context,
      contextPayloadHash: payloadHashByEvaluator[evaluatorId][workId],
    })));
    const ordered = seededOrder(
      selected.map((item) => `${item.context}::${item.workId}`),
      `${seed}::${evaluatorId}::rating-order`,
    ).map((key) => {
      const splitAt = key.indexOf("::");
      const context = key.slice(0, splitAt);
      const workId = key.slice(splitAt + 2);
      return selected.find((item) => item.context === context && item.workId === workId);
    });
    assignments[evaluatorId] = {
      evaluatorId,
      items: ordered.map((item, ratingIndex) => ({ ratingIndex, ...item })),
    };
  }

  const result = {
    version: RATING_ASSIGNMENT_VERSION,
    algorithmVersion: RATING_ASSIGNMENT_ALGORITHM,
    rosterVersion: String(seed),
    evaluatorIds,
    workIds,
    ...quotas,
    assignments,
    classAssignmentHash: null,
  };
  result.classAssignmentHash = hexHash(assignmentHashPayload(result));

  const errors = validateClassRatingAssignments({ works: cleanWorks, plans: cleanPlans, ratingAssignment: result });
  if (errors.length) throw new Error(`사후 평정 배정 검증 실패: ${errors.join(" / ")}`);
  return result;
}

export function validateClassRatingAssignments({ works, plans, ratingAssignment } = {}) {
  const errors = [];
  let normalized;
  try {
    normalized = normalizeInputs(works, plans);
  } catch (error) {
    return [error.message];
  }
  if (!ratingAssignment || typeof ratingAssignment !== "object") return ["사후 평정 배정이 없습니다."];

  let eligibility;
  try {
    eligibility = collectEligibility(normalized);
  } catch (error) {
    return [error.message];
  }
  const { cleanWorks, evaluatorIds } = normalized;
  const workIds = cleanWorks.map((work) => work.id);
  const workById = normalized.workById;
  const ownerByWork = new Map(cleanWorks.map((work) => [work.id, work.ownerId]));
  const expectedEvaluatorIds = evaluatorIds;
  const expectedWorkIds = workIds;
  if (stableStringify(ratingAssignment.evaluatorIds) !== stableStringify(expectedEvaluatorIds)) errors.push("평가자 명단 또는 정렬이 일치하지 않음");
  if (stableStringify(ratingAssignment.workIds) !== stableStringify(expectedWorkIds)) errors.push("작품 명단 또는 정렬이 일치하지 않음");
  if (ratingAssignment.version !== RATING_ASSIGNMENT_VERSION) errors.push("사후 평정 배정 버전 불일치");
  if (ratingAssignment.algorithmVersion !== RATING_ASSIGNMENT_ALGORITHM) errors.push("사후 평정 알고리즘 버전 불일치");

  const perEvaluator = Number(ratingAssignment.ratingsPerEvaluator);
  const contextTargets = ratingAssignment.ratingsPerContext || {};
  if (!Number.isInteger(perEvaluator) || perEvaluator < 1) errors.push("평가자별 평정 수 오류");
  for (const context of RATING_CONTEXTS) {
    if (!Number.isInteger(contextTargets[context]) || contextTargets[context] < 0) errors.push(`${context} 평가자별 평정 수 오류`);
  }
  if (RATING_CONTEXTS.every((context) => Number.isInteger(contextTargets[context]))
    && contextTargets.image_only + contextTargets.image_context !== perEvaluator) {
    errors.push("조건별 평가자 평정 수 합계 불일치");
  }

  const workCounts = Object.fromEntries(workIds.map((workId) => [workId, 0]));
  const workContextCounts = Object.fromEntries(workIds.map((workId) => [workId, { image_only: 0, image_context: 0 }]));
  const assignmentKeys = Object.keys(ratingAssignment.assignments || {}).sort(compareText);
  if (stableStringify(assignmentKeys) !== stableStringify(evaluatorIds)) errors.push("평가자별 사후 평정 계획의 키가 명단과 다름");

  for (const evaluatorId of evaluatorIds) {
    const evaluatorPlan = ratingAssignment.assignments && ratingAssignment.assignments[evaluatorId];
    if (!evaluatorPlan || !Array.isArray(evaluatorPlan.items)) {
      errors.push(`${evaluatorId}: 사후 평정 항목 배열 없음`);
      continue;
    }
    if (normalizedId(evaluatorPlan.evaluatorId) !== evaluatorId) errors.push(`${evaluatorId}: 사후 평정 계획의 평가자 id 불일치`);
    if (evaluatorPlan.items.length !== perEvaluator) errors.push(`${evaluatorId}: 평가자별 평정 수 불일치`);
    const seen = new Set();
    const contextCounts = { image_only: 0, image_context: 0 };
    evaluatorPlan.items.forEach((item, index) => {
      if (!item || typeof item !== "object") {
        errors.push(`${evaluatorId}: ${index + 1}번째 평정 항목 형식 오류`);
        return;
      }
      const workId = normalizedId(item.workId);
      if (item.ratingIndex !== index) errors.push(`${evaluatorId}: ratingIndex 불일치`);
      if (!workById.has(workId)) errors.push(`${evaluatorId}: 존재하지 않는 작품 배정 ${workId}`);
      if (seen.has(workId)) errors.push(`${evaluatorId}: 같은 작품 중복 평정 ${workId}`);
      seen.add(workId);
      if (ownerByWork.get(workId) === evaluatorId) errors.push(`${evaluatorId}: 자기 작품 평정 배정 ${workId}`);
      if (!RATING_CONTEXTS.includes(item.context)) {
        errors.push(`${evaluatorId}: 알 수 없는 맥락 조건`);
      } else {
        contextCounts[item.context] += 1;
        workContextCounts[workId] && (workContextCounts[workId][item.context] += 1);
      }
      if (eligibility.eligibleByEvaluator[evaluatorId][workId] !== item.context) {
        errors.push(`${evaluatorId}: 본 비교에서 해당 맥락으로 보지 않은 작품 배정 ${workId}`);
      }
      const expectedPayloadHash = eligibility.payloadHashByEvaluator[evaluatorId][workId]
        || (workById.has(workId) ? contextPayloadHash(workById.get(workId)) : null);
      if (String(item.contextPayloadHash || "") !== String(expectedPayloadHash || "")) {
        errors.push(`${evaluatorId}: 작품 ${workId}의 contextPayloadHash 불일치`);
      }
      if (Object.hasOwn(workCounts, workId)) workCounts[workId] += 1;
    });
    for (const context of RATING_CONTEXTS) {
      if (contextCounts[context] !== contextTargets[context]) errors.push(`${evaluatorId}: ${context} 평정 수 불일치`);
    }
  }

  for (const workId of workIds) {
    const declaredTotal = ratingAssignment.workQuotaById && ratingAssignment.workQuotaById[workId];
    const declaredContexts = ratingAssignment.workContextQuotaById && ratingAssignment.workContextQuotaById[workId];
    if (!Number.isInteger(declaredTotal) || declaredTotal < 0) errors.push(`${workId}: 작품 총 할당량 오류`);
    if (!declaredContexts || RATING_CONTEXTS.some((context) => !Number.isInteger(declaredContexts[context]) || declaredContexts[context] < 0)) {
      errors.push(`${workId}: 작품×조건 할당량 오류`);
      continue;
    }
    if (declaredTotal !== declaredContexts.image_only + declaredContexts.image_context) errors.push(`${workId}: 총 할당량과 조건별 합계 불일치`);
    if (workCounts[workId] !== declaredTotal) errors.push(`${workId}: 작품 평정 수 불일치`);
    for (const context of RATING_CONTEXTS) {
      if (workContextCounts[workId][context] !== declaredContexts[context]) errors.push(`${workId}: ${context} 작품 평정 수 불일치`);
    }
  }

  for (const context of RATING_CONTEXTS) {
    const assigned = workIds.reduce((sum, workId) => sum + workContextCounts[workId][context], 0);
    const required = evaluatorIds.length * Number(contextTargets[context] || 0);
    if (assigned !== required) errors.push(`${context}: 학급 전체 평정 수 불일치`);
  }
  const expectedHash = hexHash(assignmentHashPayload(ratingAssignment));
  if (ratingAssignment.classAssignmentHash !== expectedHash) errors.push("학급 사후 평정 배정 해시 불일치");
  return [...new Set(errors)];
}

export function summarizeClassRatingAssignments({ works, plans, ratingAssignment } = {}) {
  const normalized = normalizeInputs(works, plans);
  const workIds = normalized.cleanWorks.map((work) => work.id);
  const evaluatorIds = normalized.evaluatorIds;
  const perEvaluator = {};
  const perWork = Object.fromEntries(workIds.map((workId) => [workId, 0]));
  const perWorkContext = Object.fromEntries(workIds.map((workId) => [workId, { image_only: 0, image_context: 0 }]));
  let totalRatings = 0;
  for (const evaluatorId of evaluatorIds) {
    const items = ratingAssignment && ratingAssignment.assignments
      && ratingAssignment.assignments[evaluatorId] && ratingAssignment.assignments[evaluatorId].items;
    const contextCounts = { image_only: 0, image_context: 0 };
    for (const item of Array.isArray(items) ? items : []) {
      totalRatings += 1;
      if (Object.hasOwn(perWork, item.workId)) perWork[item.workId] += 1;
      if (perWorkContext[item.workId] && RATING_CONTEXTS.includes(item.context)) {
        perWorkContext[item.workId][item.context] += 1;
        contextCounts[item.context] += 1;
      }
    }
    perEvaluator[evaluatorId] = {
      total: Array.isArray(items) ? items.length : 0,
      ...contextCounts,
    };
  }
  const workValues = Object.values(perWork);
  const contextValues = Object.fromEntries(RATING_CONTEXTS.map((context) => [
    context,
    workIds.map((workId) => perWorkContext[workId][context]),
  ]));
  return {
    evaluators: evaluatorIds.length,
    works: workIds.length,
    totalRatings,
    perEvaluator,
    perWork,
    perWorkContext,
    workRatingRange: workValues.length ? Math.max(...workValues) - Math.min(...workValues) : 0,
    workContextRatingRange: Object.fromEntries(RATING_CONTEXTS.map((context) => [
      context,
      contextValues[context].length ? Math.max(...contextValues[context]) - Math.min(...contextValues[context]) : 0,
    ])),
    classAssignmentHash: ratingAssignment && ratingAssignment.classAssignmentHash,
    validationErrors: validateClassRatingAssignments({ works, plans, ratingAssignment }),
  };
}
