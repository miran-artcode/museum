/*
 * 쌍대비교 연구의 문항·배정·기록 규격.
 * 기존 앱에서 import하지 않는 독립 모듈이다.
 */

export const STUDY_VERSION = "pairwise-r3";
export const SELF_ASSESSMENT_VERSION = "artifact-rubric-v2";

export const PRE_SURVEY_GROUPS = [
  {
    id: "experience",
    title: "AI 이미지 경험과 미술 학습",
    note: "단원을 시작하기 전의 경험을 기준으로 답합니다.",
    items: [
      {
        id: "ai_count",
        text: "이 단원이 시작되기 전까지 직접 프롬프트를 입력하거나 수정하여 AI 이미지 작업을 몇 회 해 보았습니까?",
        options: ["0회", "1회", "2~5회", "6~10회", "11회 이상"],
        help: "한 번 앉아서 이어서 한 작업은 생성한 이미지 수와 관계없이 1회로 셉니다.",
      },
      {
        id: "ai_6m",
        text: "최근 6개월 동안 수업 밖에서 AI 이미지 도구를 사용한 빈도는 어느 정도입니까?",
        options: ["전혀 없음", "월 1회 미만", "월 1~3회", "주 1~2회", "주 3회 이상"],
      },
      {
        id: "ai_tools",
        text: "지금까지 직접 사용해 본 AI 이미지 도구는 몇 종류입니까?",
        options: ["0개", "1개", "2개", "3개", "4개 이상"],
      },
      {
        id: "ai_select",
        text: "여러 AI 결과물을 비교하여 하나를 선택하고, 선택 이유를 적어 본 경험은 몇 회입니까?",
        options: ["0회", "1회", "2~3회", "4~5회", "6회 이상"],
      },
      {
        id: "art_learning",
        text: "학교 정규 미술수업을 제외하고, 미술학원·개인지도 등에서 정기적으로 미술을 배운 기간을 모두 합치면 얼마나 됩니까?",
        options: ["없음", "1년 미만", "1년 이상~3년 미만", "3년 이상~5년 미만", "5년 이상"],
      },
    ],
  },
  {
    id: "art_interest",
    title: "미술에 대한 관심",
    note: "1점은 ‘전혀 그렇지 않다’, 7점은 ‘매우 그렇다’입니다.",
    scale: {
      min: 1,
      max: 7,
      low: "전혀 그렇지 않다",
      high: "매우 그렇다",
    },
    items: [
      { id: "vai_1", text: "나는 학교 미술수업을 즐기는 편이다." },
      { id: "vai_2", text: "나는 다른 사람과 미술에 관해 이야기하는 것을 좋아한다." },
      { id: "vai_3", text: "내 주변 사람들은 미술에 관심이 있는 편이다." },
      { id: "vai_4", text: "나는 미술에 관심이 많다." },
      { id: "vai_5", text: "나는 새롭거나 인상적인 미술 경험을 찾아보는 편이다." },
      { id: "vai_6", text: "나는 일상에서 미술 작품이나 시각적 대상을 자주 눈여겨본다." },
      { id: "vai_7", text: "우리 가족은 미술에 관심이 있는 편이다." },
    ],
  },
  {
    id: "art_exposure",
    title: "최근 12개월의 미술 경험",
    note: "1점은 ‘1년에 한 번 미만’, 7점은 ‘주 1회 이상’입니다.",
    scale: {
      min: 1,
      max: 7,
      low: "1년에 한 번 미만",
      high: "주 1회 이상",
      labels: ["1년에 한 번 미만", "연 1회", "반년에 1회", "3개월에 1회", "월 1회", "2주에 1회", "주 1회 이상"],
    },
    items: [
      { id: "vai_8", text: "미술관이나 갤러리 전시를 관람했다." },
      { id: "vai_9", text: "미술 관련 책·잡지·도록·긴 글을 읽었다." },
      { id: "vai_10", text: "관심 있는 작품이나 이미지를 스스로 찾아보았다." },
      { id: "vai_11", text: "미술 강연·도슨트·작품 해설을 들었다." },
    ],
  },
  {
    id: "ai_attitude",
    title: "AI에 대한 일반적인 생각",
    note: "1점은 ‘전혀 동의하지 않는다’, 10점은 ‘매우 동의한다’입니다. 미술 작품이 아니라 AI 전반에 대한 생각을 답합니다.",
    scale: {
      min: 1,
      max: 10,
      low: "전혀 동의하지 않는다",
      high: "매우 동의한다",
    },
    items: [
      { id: "aias_1", text: "AI는 나의 생활을 더 나아지게 할 수 있다." },
      { id: "aias_2", text: "AI는 나의 학습이나 작업을 향상할 수 있다." },
      { id: "aias_3", text: "나는 앞으로 AI 기술을 사용할 의향이 있다." },
      { id: "aias_4", text: "AI 기술은 전반적으로 인류에게 긍정적이라고 생각한다." },
    ],
  },
];

export const PRE_SURVEY_ITEMS = PRE_SURVEY_GROUPS.flatMap((group) =>
  group.items.map((item) => ({
    ...item,
    groupId: group.id,
    groupTitle: group.title,
    options: item.options || null,
    scale: group.scale || null,
  })),
);

export const PAIRWISE_DEFAULTS = Object.freeze({
  /* 학생에게 보이는 총 12화면 = 새로운 본 비교 11회 + 숨은 역순 반복 1회. */
  mainTrials: 11,
  reasonRate: 0.2,
  repeatRate: 0.1,
  ratingWorks: 6,
  question: "두 작품 중 이 수업의 질문인 ‘무엇이 이미지를 미술로 만드는가?’에 더 설득력 있게 응답하는 작품을 하나 고르세요.",
});

export const SELF_SCORE_LABELS = [
  "전혀 그렇지 않다",
  "그렇지 않은 편이다",
  "보통이다",
  "그런 편이다",
  "매우 그렇다",
];

/* 쌍대비교의 종합 질문과 직접 맞닿는 1개 문항을 주지표로 두고,
   기존 수업 설계의 4축은 점수 변화가 생긴 위치를 해석하는 진단값으로 둔다. */
export const SELF_ASSESSMENT_ITEMS = [
  {
    id: "overall",
    label: "종합 설득력",
    text: "이 작품은 수업의 질문 ‘무엇이 이미지를 미술로 만드는가?’에 설득력 있게 응답한다.",
  },
  {
    id: "veri",
    label: "이미지의 핍진성",
    text: "유물 기록 이미지의 형식인 배경·조명·스케일이 서로 어긋나지 않고 성립한다.",
  },
  {
    id: "cause",
    label: "흔적의 인과",
    text: "마모·파손·오염·수리의 위치와 모습이 이 물건의 쓰임과 구체적으로 이어진다.",
  },
  {
    id: "caption",
    label: "작품 캡션의 의미 구체화",
    text: "작품 캡션(제목·유물명·짧은 설명)을 읽으면 이미지가 무엇을 뜻하는지 더 구체적으로 이해할 수 있다.",
  },
  {
    id: "voice",
    label: "문제의 전달",
    text: "작품이 다루는 사회문제와 태도(고발·경고·공감·기록·질문)를 작품 안에서 읽을 수 있다.",
  },
];

export const SELF_CHANGE_REASON_OPTIONS = [
  { value: "new_or_shifted", label: "처음과 다르게 중요하게 본 기준이나 근거가 있음" },
  { value: "same_basis", label: "처음과 비슷한 기준과 근거로 판단함" },
  { value: "unclear", label: "이유가 분명하지 않거나 기억나지 않음" },
  { value: "other", label: "그 밖의 이유" },
];

export const CONFIDENCE_LABELS = [
  "전혀 확신하지 않음",
  "별로 확신하지 않음",
  "보통",
  "대체로 확신함",
  "매우 확신함",
];

export const AI_RATING_ITEMS = [
  { id: "ai_like", text: "이 이미지는 전형적인 생성형 AI 이미지처럼 느껴진다." },
  { id: "ai_trace", text: "이 이미지에서는 생성형 AI 특유의 이상한 흔적이 눈에 띈다." },
  { id: "future_form", text: "이 이미지의 사물 형태는 낯설거나 미래적으로 느껴진다." },
  { id: "agency", text: "이 작품에서는 만든 사람의 의도적인 선택과 통제가 느껴진다." },
  { id: "meaning", text: "이 작품이 무엇을 이야기하려는지 읽을 수 있다." },
  { id: "authenticity", text: "이 작품에는 단순 생성 이상의 진정성 있는 의도가 느껴진다." },
];

export const AI_CUE_OPTIONS = [
  { value: "structure", label: "형태·부품의 연결" },
  { value: "light", label: "빛과 그림자" },
  { value: "material", label: "재질·표면" },
  { value: "perspective", label: "크기·원근·초점" },
  { value: "text", label: "문자·세부 묘사" },
  { value: "smooth", label: "지나치게 매끈하거나 완벽함" },
  { value: "future", label: "낯설거나 미래적인 형태" },
  { value: "other", label: "기타" },
  { value: "none", label: "특별한 근거 없음" },
];

function stringHash(input) {
  let h = 2166136261;
  const s = String(input);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(values, random) {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function pairKey(a, b) {
  return [String(a), String(b)].sort().join("::");
}

const compareText = (a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);
const hexHash = (value) => stringHash(typeof value === "string" ? value : JSON.stringify(value)).toString(16).padStart(8, "0");
const CONTEXT_TEXT_MAX_LENGTH = 120;

function contextPayloadHash(work) {
  return hexHash({
    id: work.id,
    title: work.title || "",
    relic: work.relic || "",
    captionText: work.captionText || "",
    contextVersion: work.contextVersion || "",
  });
}

function allPairs(works) {
  const pairs = [];
  for (let i = 0; i < works.length; i += 1) {
    for (let j = i + 1; j < works.length; j += 1) {
      pairs.push([works[i], works[j]]);
    }
  }
  return pairs;
}

const countOf = (map, key) => map.get(key) || 0;
const bump = (map, key) => map.set(key, countOf(map, key) + 1);

const choose2 = (value) => value * (value - 1) / 2;

function normalizedId(value) {
  return String(value ?? "").trim();
}

function normalizeRosterForGeneration(works, evaluators) {
  if (!Array.isArray(works) || !works.length) throw new Error("작품 명단이 비어 있습니다.");
  if (!Array.isArray(evaluators) || !evaluators.length) throw new Error("평가자 명단이 비어 있습니다.");

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

  const rawPeople = evaluators.map(normalizedId);
  if (rawPeople.some((id) => !id)) throw new Error("평가자 id가 비어 있습니다.");
  if (new Set(rawPeople).size !== rawPeople.length) throw new Error("평가자 id가 중복되었습니다.");
  const people = [...rawPeople].sort(compareText);
  const peopleSet = new Set(people);
  for (const work of cleanWorks) {
    if (!peopleSet.has(work.ownerId)) throw new Error(`작품 ${work.id}의 ownerId가 평가자 명단에 없습니다: ${work.ownerId}`);
  }
  for (const evaluatorId of people) {
    if (!ownerIds.has(evaluatorId)) throw new Error(`평가자 ${evaluatorId}의 자기 작품이 정확히 1점 필요합니다.`);
  }
  if (new Set(cleanWorks.map((work) => work.contextVersion)).size !== 1) {
    throw new Error("학급 작품의 contextVersion이 서로 다릅니다.");
  }
  return { cleanWorks, people };
}

function contextTargets(k, evaluatorIndex, extraStart) {
  const low = Math.floor(k / 2);
  const high = Math.ceil(k / 2);
  if (low === high) return { image_only: low, image_context: low };
  return (evaluatorIndex + extraStart) % 2 === 0
    ? { image_only: high, image_context: low }
    : { image_only: low, image_context: high };
}

function contextWorkSplit(workCount, targets, preferOnlyExtra) {
  const feasible = [];
  for (let imageOnlyWorks = 0; imageOnlyWorks <= workCount; imageOnlyWorks += 1) {
    const contextWorks = workCount - imageOnlyWorks;
    if (choose2(imageOnlyWorks) < targets.image_only || choose2(contextWorks) < targets.image_context) continue;
    const desiredDirection = targets.image_only === targets.image_context
      ? (preferOnlyExtra ? -1 : 1)
      : (targets.image_only > targets.image_context ? -1 : 1);
    const actualDirection = imageOnlyWorks === contextWorks ? 0 : (imageOnlyWorks > contextWorks ? -1 : 1);
    feasible.push({
      imageOnlyWorks,
      balanceCost: Math.abs(imageOnlyWorks - contextWorks),
      directionCost: actualDirection === 0 || actualDirection === desiredDirection ? 0 : 1,
    });
  }
  feasible.sort((a, b) => a.balanceCost - b.balanceCost
    || a.directionCost - b.directionCost
    || (preferOnlyExtra ? b.imageOnlyWorks - a.imageOnlyWorks : a.imageOnlyWorks - b.imageOnlyWorks));
  return feasible.length ? feasible[0].imageOnlyWorks : null;
}

function makeContextSchedule(targets, startWithOnly) {
  const remaining = { ...targets };
  const schedule = [];
  let next = startWithOnly ? "image_only" : "image_context";
  while (remaining.image_only + remaining.image_context > 0) {
    if (!remaining[next]) next = next === "image_only" ? "image_context" : "image_only";
    schedule.push(next);
    remaining[next] -= 1;
    next = next === "image_only" ? "image_context" : "image_only";
  }
  return schedule;
}

function rebalancePlanContexts(plans, people, seed) {
  const planStats = people.map((evaluatorId) => {
    const plan = plans[evaluatorId];
    const contribution = new Map();
    let trialDifference = 0;
    for (const trial of plan.trials) {
      const direction = trial.context === "image_only" ? 1 : -1;
      trialDifference += direction;
      contribution.set(trial.leftWorkId, countOf(contribution, trial.leftWorkId) + direction);
      contribution.set(trial.rightWorkId, countOf(contribution, trial.rightWorkId) + direction);
    }
    return { evaluatorId, plan, contribution, trialDifference, flipped: false };
  });
  const workDifferences = new Map();
  let classTrialDifference = 0;
  for (const stat of planStats) {
    classTrialDifference += stat.trialDifference;
    for (const [workId, difference] of stat.contribution) {
      workDifferences.set(workId, countOf(workDifferences, workId) + difference);
    }
  }
  const quality = (differences) => {
    const absolute = [...differences.values()].map(Math.abs).sort((a, b) => b - a);
    return {
      maximum: absolute[0] || 0,
      sumSquares: absolute.reduce((sum, value) => sum + value * value, 0),
      sumAbsolute: absolute.reduce((sum, value) => sum + value, 0),
    };
  };
  const compareQuality = (a, b) => a.maximum - b.maximum
    || a.sumSquares - b.sumSquares
    || a.sumAbsolute - b.sumAbsolute;
  let currentQuality = quality(workDifferences);

  for (let iteration = 0; iteration < people.length * 4 && currentQuality.maximum > 1; iteration += 1) {
    let best = null;
    const operations = [];
    for (let i = 0; i < planStats.length; i += 1) {
      operations.push([planStats[i]]);
      for (let j = i + 1; j < planStats.length; j += 1) operations.push([planStats[i], planStats[j]]);
    }
    for (const operation of operations) {
      const nextClassDifference = classTrialDifference
        - 2 * operation.reduce((sum, stat) => sum + (stat.flipped ? -stat.trialDifference : stat.trialDifference), 0);
      if (Math.abs(nextClassDifference) > 1) continue;
      const nextDifferences = new Map(workDifferences);
      for (const stat of operation) {
        const sign = stat.flipped ? 1 : -1;
        for (const [workId, contribution] of stat.contribution) {
          nextDifferences.set(workId, countOf(nextDifferences, workId) + 2 * sign * contribution);
        }
      }
      const nextQuality = quality(nextDifferences);
      if (compareQuality(nextQuality, currentQuality) >= 0) continue;
      const tie = stringHash(`${seed}::context-plan-flip::${iteration}::${operation.map((stat) => stat.evaluatorId).join("::")}`);
      if (!best || compareQuality(nextQuality, best.quality) < 0
        || (compareQuality(nextQuality, best.quality) === 0 && tie < best.tie)) {
        best = { operation, nextClassDifference, nextDifferences, quality: nextQuality, tie };
      }
    }
    if (!best) break;
    for (const stat of best.operation) {
      stat.flipped = !stat.flipped;
      for (const workId of Object.keys(stat.plan.contextByWork)) {
        stat.plan.contextByWork[workId] = stat.plan.contextByWork[workId] === "image_only"
          ? "image_context"
          : "image_only";
      }
      for (const trial of stat.plan.trials) {
        trial.context = trial.context === "image_only" ? "image_context" : "image_only";
      }
    }
    classTrialDifference = best.nextClassDifference;
    workDifferences.clear();
    for (const [workId, difference] of best.nextDifferences) workDifferences.set(workId, difference);
    currentQuality = best.quality;
  }
}

/* 한 작품의 전체 위치와 조건별 위치를 동시에 맞추는 하한·상한 흐름.
   각 비교 간선은 두 끝점 중 정확히 한 곳에 '왼쪽' 1회를 보낸다.
   작품×조건과 작품 전체의 왼쪽 횟수를 각각 차수의 절반으로 제한하면
   두 종류의 좌·우 차이를 모두 1 이하로 만들 수 있다. */
function orientEdgesByContextBalanced(edges, seed, baseEdges = [], maxImbalance = 1) {
  if (!edges.length) return;

  const nodeIds = new Map();
  const graph = [];
  const demands = [];
  const node = (key) => {
    if (nodeIds.has(key)) return nodeIds.get(key);
    const index = graph.length;
    nodeIds.set(key, index);
    graph.push([]);
    demands.push(0);
    return index;
  };
  const addEdge = (from, to, capacity) => {
    const forward = { to, rev: graph[to].length, capacity, initialCapacity: capacity };
    const reverse = { to: from, rev: graph[from].length, capacity: 0, initialCapacity: 0 };
    graph[from].push(forward);
    graph[to].push(reverse);
    return forward;
  };
  const addBoundedEdge = (from, to, lower, upper) => {
    if (lower > upper) throw new Error("좌우 균형 흐름의 하한이 상한보다 큽니다.");
    const edge = addEdge(from, to, upper - lower);
    demands[from] -= lower;
    demands[to] += lower;
    return { edge, lower };
  };
  const maxFlow = (source, sink) => {
    let total = 0;
    for (;;) {
      const level = Array(graph.length).fill(-1);
      const queue = [source];
      level[source] = 0;
      for (let head = 0; head < queue.length; head += 1) {
        const current = queue[head];
        for (const edge of graph[current]) {
          if (edge.capacity <= 0 || level[edge.to] !== -1) continue;
          level[edge.to] = level[current] + 1;
          queue.push(edge.to);
        }
      }
      if (level[sink] === -1) return total;
      const nextEdge = Array(graph.length).fill(0);
      const send = (current, amount) => {
        if (current === sink) return amount;
        while (nextEdge[current] < graph[current].length) {
          const edge = graph[current][nextEdge[current]];
          if (edge.capacity > 0 && level[edge.to] === level[current] + 1) {
            const sent = send(edge.to, Math.min(amount, edge.capacity));
            if (sent > 0) {
              edge.capacity -= sent;
              graph[edge.to][edge.rev].capacity += sent;
              return sent;
            }
          }
          nextEdge[current] += 1;
        }
        return 0;
      };
      for (;;) {
        const sent = send(source, Number.MAX_SAFE_INTEGER);
        if (!sent) break;
        total += sent;
      }
    }
  };

  const source = node("source");
  const sink = node("sink");
  const totalDegree = new Map();
  const contextDegree = new Map();
  const variableTotalDegree = new Map();
  const variableContextDegree = new Map();
  const baseLeft = new Map();
  const baseContextLeft = new Map();
  for (const edge of baseEdges) {
    bump(totalDegree, edge.a);
    bump(totalDegree, edge.b);
    bump(contextDegree, `${edge.a}::${edge.trial.context}`);
    bump(contextDegree, `${edge.b}::${edge.trial.context}`);
    bump(baseLeft, edge.trial.leftWorkId);
    bump(baseContextLeft, `${edge.trial.leftWorkId}::${edge.trial.context}`);
  }
  for (const edge of edges) {
    bump(totalDegree, edge.a);
    bump(totalDegree, edge.b);
    bump(contextDegree, `${edge.a}::${edge.trial.context}`);
    bump(contextDegree, `${edge.b}::${edge.trial.context}`);
    bump(variableTotalDegree, edge.a);
    bump(variableTotalDegree, edge.b);
    bump(variableContextDegree, `${edge.a}::${edge.trial.context}`);
    bump(variableContextDegree, `${edge.b}::${edge.trial.context}`);
  }

  const choices = [];
  const orderedEdges = [...edges].sort((a, b) => {
    const ah = stringHash(`${seed}::flow-edge::${a.trial.trialId}`);
    const bh = stringHash(`${seed}::flow-edge::${b.trial.trialId}`);
    return ah - bh || compareText(a.trial.trialId, b.trial.trialId);
  });
  for (const [index, edge] of orderedEdges.entries()) {
    const edgeNode = node(`edge::${index}`);
    addBoundedEdge(source, edgeNode, 1, 1);
    const endpoints = [edge.a, edge.b].sort((a, b) => {
      const ah = stringHash(`${seed}::flow-side::${edge.trial.trialId}::${a}`);
      const bh = stringHash(`${seed}::flow-side::${edge.trial.trialId}::${b}`);
      return ah - bh || compareText(a, b);
    });
    const arcs = new Map();
    for (const endpoint of endpoints) {
      arcs.set(endpoint, addBoundedEdge(
        edgeNode,
        node(`work-context::${endpoint}::${edge.trial.context}`),
        0,
        1,
      ));
    }
    choices.push({ edge, arcs });
  }

  for (const [key, variableDegree] of [...variableContextDegree.entries()].sort(([a], [b]) => compareText(a, b))) {
    const separator = key.lastIndexOf("::");
    const workId = key.slice(0, separator);
    const degree = countOf(contextDegree, key);
    const fixedLeft = countOf(baseContextLeft, key);
    const targetLower = Math.ceil((degree - maxImbalance) / 2);
    const targetUpper = Math.floor((degree + maxImbalance) / 2);
    addBoundedEdge(
      node(`work-context::${key}`),
      node(`work::${workId}`),
      Math.max(0, targetLower - fixedLeft),
      Math.min(variableDegree, targetUpper - fixedLeft),
    );
  }
  for (const [workId, variableDegree] of [...variableTotalDegree.entries()].sort(([a], [b]) => compareText(a, b))) {
    const degree = countOf(totalDegree, workId);
    const fixedLeft = countOf(baseLeft, workId);
    const targetLower = Math.ceil((degree - maxImbalance) / 2);
    const targetUpper = Math.floor((degree + maxImbalance) / 2);
    addBoundedEdge(
      node(`work::${workId}`),
      sink,
      Math.max(0, targetLower - fixedLeft),
      Math.min(variableDegree, targetUpper - fixedLeft),
    );
  }

  addEdge(sink, source, Number.MAX_SAFE_INTEGER);
  const superSource = node("super-source");
  const superSink = node("super-sink");
  let required = 0;
  for (let index = 0; index < superSource; index += 1) {
    if (demands[index] > 0) {
      addEdge(superSource, index, demands[index]);
      required += demands[index];
    } else if (demands[index] < 0) {
      addEdge(index, superSink, -demands[index]);
    }
  }
  if (maxFlow(superSource, superSink) !== required) {
    throw new Error("작품 전체와 조건별 좌우 노출을 동시에 균형화할 수 없습니다.");
  }

  for (const { edge, arcs } of choices) {
    const selected = [...arcs.entries()].find(([, bounded]) => (
      bounded.lower + bounded.edge.initialCapacity - bounded.edge.capacity
    ) === 1);
    if (!selected) throw new Error(`좌우 균형 결과에 선택 끝점이 없습니다: ${edge.trial.trialId}`);
    const leftWorkId = selected[0];
    edge.trial.leftWorkId = leftWorkId;
    edge.trial.rightWorkId = leftWorkId === edge.a ? edge.b : edge.a;
  }
}

function trialPayloadHash(context, leftWorkId, rightWorkId, workById) {
  return hexHash([
    context,
    contextPayloadHash(workById.get(leftWorkId)),
    contextPayloadHash(workById.get(rightWorkId)),
  ].join("::"));
}

/* N_CR = 한 작품이 본 비교에 등장한 평균 횟수 = 2 × 전체 판정 / 작품 수.
   반복은 일관성 점검용이므로 순위 모형의 정보량 계산에서 제외한다. */
export function comparisonBudget({ workCount, evaluatorCount, mainTrials } = {}) {
  const representations = Number(workCount);
  const judges = Number(evaluatorCount);
  const decisionsPerJudge = Number(mainTrials);
  if (!Number.isInteger(representations) || representations < 2) throw new Error("workCount는 2 이상의 정수여야 합니다.");
  if (!Number.isInteger(judges) || judges < 1) throw new Error("evaluatorCount는 1 이상의 정수여야 합니다.");
  if (!Number.isInteger(decisionsPerJudge) || decisionsPerJudge < 1) throw new Error("mainTrials는 1 이상의 정수여야 합니다.");
  const totalMainDecisions = judges * decisionsPerJudge;
  const comparisonsPerWork = 2 * totalMainDecisions / representations;
  return {
    workCount: representations,
    evaluatorCount: judges,
    mainTrialsPerEvaluator: decisionsPerJudge,
    totalMainDecisions,
    comparisonsPerWork,
    /* 10: 2025 메타분석의 일반적 충분성 기준.
       20: 교육연구의 보수적 운영 목표.
       41: 특정 모의조건에서 SSR 추정 과대평가를 줄이기 위한 기준이며
           실제 신뢰도의 보편적 최소값은 아니다. */
    basicTarget: 10,
    meetsBasicTarget: comparisonsPerWork >= 10,
    minimumMainTrialsForBasicTarget: Math.ceil(5 * representations / judges),
    practicalTarget: 20,
    meetsPracticalTarget: comparisonsPerWork >= 20,
    minimumMainTrialsForPracticalTarget: Math.ceil(10 * representations / judges),
    conservativeTarget: 41,
    meetsConservativeTarget: comparisonsPerWork >= 41,
    minimumMainTrialsForConservativeTarget: Math.ceil(20.5 * representations / judges),
  };
}

/**
 * 학급 전체 배정을 한 번에 만든다. ownerId는 배정 계산에만 사용하며
 * 반환되는 학생용 trial에는 포함하지 않는다.
 */
export function makeClassAssignments({
  works,
  evaluators,
  k = PAIRWISE_DEFAULTS.mainTrials,
  seed = "pairwise-r3",
  reasonRate = PAIRWISE_DEFAULTS.reasonRate,
  includeRepeat = true,
  repeatRate = PAIRWISE_DEFAULTS.repeatRate,
  minRepeatGap = 3,
} = {}) {
  const { cleanWorks, people } = normalizeRosterForGeneration(works, evaluators);
  const requestedTrials = Number(k);
  const requestedReasonRate = Number(reasonRate);
  const requestedRepeatRate = Number(repeatRate);
  const requestedGap = Number(minRepeatGap);
  if (!Number.isInteger(requestedTrials) || requestedTrials < 1) throw new Error("k는 1 이상의 정수여야 합니다.");
  if (!Number.isFinite(requestedReasonRate) || requestedReasonRate < 0 || requestedReasonRate > 1) throw new Error("reasonRate는 0 이상 1 이하여야 합니다.");
  if (!Number.isFinite(requestedRepeatRate) || requestedRepeatRate < 0 || requestedRepeatRate > 1) throw new Error("repeatRate는 0 이상 1 이하여야 합니다.");
  if (!Number.isInteger(requestedGap) || requestedGap < 0) throw new Error("minRepeatGap은 0 이상의 정수여야 합니다.");

  const random = mulberry32(stringHash(seed));
  const workById = new Map(cleanWorks.map((work) => [work.id, work]));
  const workUse = new Map();
  const workContextUse = new Map();
  const pairUse = new Map();
  const plans = {};
  const classContextExtraStart = stringHash(`${seed}::class-context-extra`) % 2;

  for (let evaluatorIndex = 0; evaluatorIndex < people.length; evaluatorIndex += 1) {
    const evaluatorId = people[evaluatorIndex];
    const available = cleanWorks.filter((work) => work.ownerId !== evaluatorId);
    /* 한 학생이 같은 작품을 다시 만나도 처리조건이 바뀌지 않도록
       evaluator×work 단위에서 먼저 맥락조건을 고정한다. */
    const targets = contextTargets(requestedTrials, evaluatorIndex, classContextExtraStart);
    const contextStart = stringHash(seed + "::" + evaluatorId) % 2;
    const imageOnlyWorks = contextWorkSplit(available.length, targets, contextStart === 0);
    if (imageOnlyWorks == null) {
      throw new Error(`${evaluatorId}: 두 맥락조건에서 본 비교 ${requestedTrials}회를 만들 작품 수가 부족합니다.`);
    }
    /* 앞선 평가자들에서 image_only 노출이 상대적으로 부족했던 작품부터
       다음 평가자의 image_only 후보군에 둔다. 동률만 seed 해시로 깨서
       입력 순서와 무관한 결정론을 유지한다. */
    const contextOrder = available.map((work) => work.id).sort((a, b) => {
      const aDifference = countOf(workContextUse, `${a}::image_only`)
        - countOf(workContextUse, `${a}::image_context`);
      const bDifference = countOf(workContextUse, `${b}::image_only`)
        - countOf(workContextUse, `${b}::image_context`);
      const ah = stringHash(`${seed}::context-v2::${evaluatorId}::${a}`);
      const bh = stringHash(`${seed}::context-v2::${evaluatorId}::${b}`);
      return aDifference - bDifference || ah - bh || compareText(a, b);
    });
    const contextByWork = {};
    contextOrder.forEach((workId, index) => {
      contextByWork[workId] = index < imageOnlyWorks ? "image_only" : "image_context";
    });
    const candidates = shuffled(
      allPairs(available).filter(([a, b]) => contextByWork[a.id] === contextByWork[b.id]),
      random,
    );
    const personPair = new Set();
    const personWork = new Map();
    const personContext = { image_only: 0, image_context: 0 };
    const main = [];
    const schedule = makeContextSchedule(targets, contextStart === 0);

    for (let round = 0; round < requestedTrials; round += 1) {
      const desiredContext = schedule[round];
      let bestScore = Infinity;
      let best = null;
      for (const candidate of candidates) {
        const [a, b] = candidate;
        const pk = pairKey(a.id, b.id);
        if (personPair.has(pk)) continue;
        if (contextByWork[a.id] !== desiredContext) continue;
        const pa = countOf(personWork, a.id);
        const pb = countOf(personWork, b.id);
        const otherContext = desiredContext === "image_only" ? "image_context" : "image_only";
        const aAfterDifference = countOf(workContextUse, `${a.id}::${desiredContext}`) + 1
          - countOf(workContextUse, `${a.id}::${otherContext}`);
        const bAfterDifference = countOf(workContextUse, `${b.id}::${desiredContext}`) + 1
          - countOf(workContextUse, `${b.id}::${otherContext}`);
        const score =
          (Math.abs(aAfterDifference) + Math.abs(bAfterDifference)) * 100000
          + (aAfterDifference * aAfterDifference + bAfterDifference * bAfterDifference) * 10000
          + (pa * pa + pb * pb) * 1000
          + (countOf(workUse, a.id) + countOf(workUse, b.id)) * 12
          + countOf(pairUse, pk) * 6
          + random();
        if (score < bestScore) {
          bestScore = score;
          best = candidate;
        }
      }
      if (!best) throw new Error(`${evaluatorId}: ${desiredContext} 조건의 본 비교 ${requestedTrials}회를 채울 수 없습니다.`);

      const [a, b] = best;
      const pk = pairKey(a.id, b.id);
      const context = contextByWork[a.id];

      const trial = {
        trialId: evaluatorId + "-T" + String(round + 1).padStart(2, "0"),
        pairId: pk,
        trialIndex: round,
        leftWorkId: a.id,
        rightWorkId: b.id,
        context,
        contextAssignmentUnit: "evaluator_work",
        contextPayloadHash: null,
        reasonPrompted: false,
        repeatOf: null,
      };
      main.push(trial);
      personPair.add(pk);
      bump(personWork, a.id);
      bump(personWork, b.id);
      bump(workUse, a.id);
      bump(workUse, b.id);
      bump(workContextUse, `${a.id}::${context}`);
      bump(workContextUse, `${b.id}::${context}`);
      bump(pairUse, pk);
      personContext[context] += 1;
    }

    /* 계획 자체에는 소유자 정보를 넣지 않는다. */
    const publicContextByWork = Object.fromEntries(Object.entries(contextByWork).sort(([a], [b]) => compareText(a, b)));
    const payloadHashByWork = Object.fromEntries(available.map((work) => [work.id, contextPayloadHash(work)]));

    plans[evaluatorId] = {
      version: STUDY_VERSION,
      algorithmVersion: "balanced-class-v4",
      rosterVersion: String(seed),
      evaluatorId,
      contextAssignmentUnit: "evaluator_work",
      contextByWork: publicContextByWork,
      contextPayloadHashByWork: payloadHashByWork,
      requestedMainTrialCount: requestedTrials,
      mainTrialCount: main.length,
      requestedRepeatTrialCount: 0,
      repeatTrialCount: 0,
      repeatRateNominal: requestedRepeatRate,
      minRepeatGap: requestedGap,
      trials: main,
    };
  }

  /* 평가자 단위 처치 일관성을 깨지 않는 범위에서 계획 전체의 조건을
     뒤집어, 특정 작품이 한 조건에만 몰리는 잔여 불균형을 줄인다. */
  rebalancePlanContexts(plans, people, seed);

  /* 반복 원본의 조건을 학급 전체에서 함께 정한다. 학생별 최종 화면의
     조건 차이도 1 이하인 선택지만 남기고, 전체 화면 조건 수도 맞춘다. */
  const repeatDescriptors = [];
  const mainContextTotals = { image_only: 0, image_context: 0 };
  let totalRepeats = 0;
  for (const evaluatorId of people) {
    const plan = plans[evaluatorId];
    const main = plan.trials;
    for (const trial of main) mainContextTotals[trial.context] += 1;
    const repeatN = includeRepeat && requestedRepeatRate > 0
      ? Math.round(main.length * requestedRepeatRate)
      : 0;
    const eligible = main.filter((trial) => trial.trialIndex <= main.length - requestedGap - 1);
    if (repeatN > eligible.length) throw new Error(`${evaluatorId}: 반복 ${repeatN}회와 화면 간격 ${requestedGap}회를 함께 배치할 수 없습니다.`);
    const eligibleOnly = eligible.filter((trial) => trial.context === "image_only");
    const eligibleContext = eligible.filter((trial) => trial.context === "image_context");
    const mainOnly = main.filter((trial) => trial.context === "image_only").length;
    const mainContext = main.length - mainOnly;
    const possibleOnlyCounts = [];
    for (let onlyRepeats = 0; onlyRepeats <= repeatN; onlyRepeats += 1) {
      if (onlyRepeats > eligibleOnly.length || repeatN - onlyRepeats > eligibleContext.length) continue;
      const finalOnly = mainOnly + onlyRepeats;
      const finalContext = mainContext + repeatN - onlyRepeats;
      if (Math.abs(finalOnly - finalContext) <= 1) possibleOnlyCounts.push(onlyRepeats);
    }
    if (!possibleOnlyCounts.length) throw new Error(`${evaluatorId}: 반복을 포함한 학생별 맥락조건 균형을 만들 수 없습니다.`);
    if (stringHash(`${seed}::repeat-option::${evaluatorId}`) % 2) possibleOnlyCounts.reverse();
    repeatDescriptors.push({ evaluatorId, plan, repeatN, eligibleOnly, eligibleContext, possibleOnlyCounts });
    totalRepeats += repeatN;
  }

  let states = new Map([[0, []]]);
  for (const descriptor of repeatDescriptors) {
    const nextStates = new Map();
    for (const [sum, choices] of states) {
      for (const choice of descriptor.possibleOnlyCounts) {
        if (!nextStates.has(sum + choice)) nextStates.set(sum + choice, [...choices, choice]);
      }
    }
    states = nextStates;
  }
  const totalScreens = people.length * requestedTrials + totalRepeats;
  const desiredOnlyTotals = [...new Set([Math.floor(totalScreens / 2), Math.ceil(totalScreens / 2)])];
  if (stringHash(`${seed}::screen-context-total`) % 2) desiredOnlyTotals.reverse();
  let repeatOnlyChoices = null;
  for (const desiredOnly of desiredOnlyTotals) {
    const needed = desiredOnly - mainContextTotals.image_only;
    if (states.has(needed)) {
      repeatOnlyChoices = states.get(needed);
      break;
    }
  }
  if (!repeatOnlyChoices) throw new Error("반복을 포함한 학급 전체 맥락조건 수를 1 이내로 맞출 수 없습니다.");

  const displayExposure = new Map();
  for (const plan of Object.values(plans)) {
    for (const trial of plan.trials) {
      bump(displayExposure, trial.leftWorkId);
      bump(displayExposure, trial.rightWorkId);
    }
  }
  const selectedByEvaluator = new Map();
  const repeatedTrialIds = new Set();
  const chooseRepeatSources = (pool, count, evaluatorId) => {
    const remaining = [...pool];
    const selected = [];
    while (selected.length < count) {
      remaining.sort((a, b) => {
        const aMax = Math.max(countOf(displayExposure, a.leftWorkId), countOf(displayExposure, a.rightWorkId));
        const bMax = Math.max(countOf(displayExposure, b.leftWorkId), countOf(displayExposure, b.rightWorkId));
        const aSum = countOf(displayExposure, a.leftWorkId) + countOf(displayExposure, a.rightWorkId);
        const bSum = countOf(displayExposure, b.leftWorkId) + countOf(displayExposure, b.rightWorkId);
        const ah = stringHash(`${seed}::repeat-source::${evaluatorId}::${a.trialId}`);
        const bh = stringHash(`${seed}::repeat-source::${evaluatorId}::${b.trialId}`);
        return aMax - bMax || aSum - bSum || ah - bh || compareText(a.trialId, b.trialId);
      });
      const source = remaining.shift();
      if (!source) throw new Error(`${evaluatorId}: 반복 원본 선택 실패`);
      selected.push(source);
      bump(displayExposure, source.leftWorkId);
      bump(displayExposure, source.rightWorkId);
    }
    return selected;
  };
  repeatDescriptors.forEach((descriptor, index) => {
    const onlyCount = repeatOnlyChoices[index];
    const selected = [
      ...chooseRepeatSources(descriptor.eligibleOnly, onlyCount, descriptor.evaluatorId),
      ...chooseRepeatSources(descriptor.eligibleContext, descriptor.repeatN - onlyCount, descriptor.evaluatorId),
    ].sort((a, b) => {
      const ah = stringHash(`${seed}::repeat-order::${descriptor.evaluatorId}::${a.trialId}`);
      const bh = stringHash(`${seed}::repeat-order::${descriptor.evaluatorId}::${b.trialId}`);
      return ah - bh || compareText(a.trialId, b.trialId);
    });
    selectedByEvaluator.set(descriptor.evaluatorId, selected);
    for (const source of selected) repeatedTrialIds.add(source.trialId);
    descriptor.plan.requestedRepeatTrialCount = descriptor.repeatN;
  });

  /* 반복 원본+역순 반복은 화면 전체에서는 좌우 기여가 상쇄된다.
     먼저 나머지 본 비교의 전체·조건별 위치를 맞춘 뒤, 반복 원본도
     그 결과를 기준으로 방향화해 본 비교 자체의 위치까지 맞춘다. */
  const nonRepeatedEdges = [];
  const repeatedEdges = [];
  for (const plan of Object.values(plans)) {
    for (const trial of plan.trials) {
      const a = trial.leftWorkId;
      const b = trial.rightWorkId;
      if (repeatedTrialIds.has(trial.trialId)) {
        repeatedEdges.push({ a, b, trial });
      } else {
        nonRepeatedEdges.push({ a, b, trial });
      }
    }
  }
  orientEdgesByContextBalanced(nonRepeatedEdges, seed);
  orientEdgesByContextBalanced(repeatedEdges, `${seed}::repeat`, nonRepeatedEdges, 2);

  for (const evaluatorId of people) {
    const plan = plans[evaluatorId];
    const main = plan.trials;
    for (const trial of main) {
      trial.contextPayloadHash = trialPayloadHash(trial.context, trial.leftWorkId, trial.rightWorkId, workById);
    }
    const repeatSources = selectedByEvaluator.get(evaluatorId) || [];
    const trials = [...main];
    repeatSources.forEach((source, repeatIndex) => {
      const sourcePosition = trials.findIndex((trial) => trial.trialId === source.trialId);
      const desiredPosition = Math.floor((repeatIndex + 1) * (main.length + repeatSources.length) / (repeatSources.length + 1));
      const insertAt = Math.min(trials.length, Math.max(sourcePosition + requestedGap + 1, desiredPosition));
      if (insertAt - sourcePosition - 1 < requestedGap) throw new Error(`${evaluatorId}: 반복 사이 화면 수 계산 실패`);
      const repeat = {
        ...source,
        trialId: evaluatorId + "-R" + String(repeatIndex + 1).padStart(2, "0"),
        trialIndex: main.length + repeatIndex,
        leftWorkId: source.rightWorkId,
        rightWorkId: source.leftWorkId,
        contextPayloadHash: trialPayloadHash(source.context, source.rightWorkId, source.leftWorkId, workById),
        reasonPrompted: false,
        reasonDraw: null,
        reasonAlgoVersion: "class-hash-v1",
        repeatOf: source.trialId,
      };
      trials.splice(insertAt, 0, repeat);
    });
    trials.forEach((trial, displayIndex) => { trial.displayIndex = displayIndex; });
    plan.trials = trials;
    plan.repeatTrialCount = repeatSources.length;
  }

  /* 이유 문항은 재접속 때 다시 뽑지 않는다. 학급 전체 본 판정의 해시값이
     낮은 순서부터 정확히 목표 개수만 표시해 표본 전체 비율을 맞춘다. */
  const reasonPool = [];
  for (const [evaluatorId, plan] of Object.entries(plans)) {
    for (const trial of plan.trials) {
      if (trial.repeatOf) continue;
      const draw = stringHash([seed, evaluatorId, trial.pairId, trial.trialIndex, STUDY_VERSION].join("::")) / 4294967296;
      trial.reasonDraw = draw;
      trial.reasonAlgoVersion = "class-hash-v1";
      reasonPool.push(trial);
    }
  }
  reasonPool.sort((a, b) => a.reasonDraw - b.reasonDraw || compareText(a.trialId, b.trialId));
  const reasonTarget = Math.round(reasonPool.length * requestedReasonRate);
  reasonPool.forEach((trial, index) => { trial.reasonPrompted = index < reasonTarget; });
  for (const plan of Object.values(plans)) {
    plan.reasonRateNominal = requestedReasonRate;
    plan.reasonPromptCount = plan.trials.filter((trial) => !trial.repeatOf && trial.reasonPrompted).length;
    plan.assignmentHash = hexHash({
      version: plan.version,
      algorithmVersion: plan.algorithmVersion,
      rosterVersion: plan.rosterVersion,
      contextByWork: plan.contextByWork,
      trials: plan.trials,
    });
  }

  const validationErrors = validateAssignments({ works: cleanWorks, plans });
  if (validationErrors.length) throw new Error("배정 검증 실패: " + validationErrors.join(" / "));

  return plans;
}

export function ratingWorkPlan(plan, count = PAIRWISE_DEFAULTS.ratingWorks) {
  const trials = ((plan && plan.trials) || []).filter((trial) => !trial.repeatOf);
  const seen = new Map();
  for (const trial of trials) {
    if (!seen.has(trial.leftWorkId)) seen.set(trial.leftWorkId, (plan.contextByWork || {})[trial.leftWorkId] || trial.context);
    if (!seen.has(trial.rightWorkId)) seen.set(trial.rightWorkId, (plan.contextByWork || {})[trial.rightWorkId] || trial.context);
  }
  const ordered = [...seen.entries()].sort((a, b) => {
    const ah = stringHash(String(plan && plan.rosterVersion) + "::" + String(plan && plan.evaluatorId) + "::" + a[0]);
    const bh = stringHash(String(plan && plan.rosterVersion) + "::" + String(plan && plan.evaluatorId) + "::" + b[0]);
    return ah - bh;
  });
  return ordered.slice(0, Math.min(count, ordered.length)).map(([workId, context], index) => ({
    ratingIndex: index,
    workId,
    context,
  }));
}

export function preSurveyComplete(answers) {
  const source = answers || {};
  return PRE_SURVEY_ITEMS.every((item) => {
    const value = Number(source[item.id]);
    if (!Number.isFinite(value)) return false;
    if (item.options) return value >= 1 && value <= item.options.length;
    return value >= item.scale.min && value <= item.scale.max;
  });
}

function mean(source, ids, minimum = ids.length) {
  const values = ids.map((id) => Number(source[id])).filter(Number.isFinite);
  return values.length >= minimum ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

export function scorePreSurvey(answers) {
  const source = answers || {};
  return {
    art_interest: mean(source, ["vai_1", "vai_2", "vai_3", "vai_4", "vai_5", "vai_6", "vai_7"], 5),
    art_exposure: mean(source, ["vai_8", "vai_9", "vai_10", "vai_11"]),
    ai_attitude: mean(source, ["aias_1", "aias_2", "aias_3", "aias_4"]),
    ai_count: source.ai_count || null,
    ai_6m: source.ai_6m || null,
    ai_tools: source.ai_tools || null,
    ai_select: source.ai_select || null,
    art_learning: source.art_learning || null,
  };
}

export function selfAssessmentComplete(assessment, { requireChangeReason = false } = {}) {
  const source = assessment || {};
  const scores = source.scores || {};
  const scoresComplete = SELF_ASSESSMENT_ITEMS.every((item) => {
    const value = Number(scores[item.id]);
    return Number.isInteger(value) && value >= 1 && value <= SELF_SCORE_LABELS.length;
  });
  if (!scoresComplete || String(source.evidence || "").trim().length < 15) return false;
  if (requireChangeReason) {
    const reasonCode = String(source.changeReasonCode || "");
    if (!SELF_CHANGE_REASON_OPTIONS.some((option) => option.value === reasonCode)) return false;
    if (reasonCode !== "unclear" && String(source.changeReason || "").trim().length < 8) return false;
  }
  return true;
}

export function classifySelfChange(beforeScores, afterScores) {
  const deltaByItem = Object.fromEntries(SELF_ASSESSMENT_ITEMS.map((item) => {
    const before = Number(beforeScores && beforeScores[item.id]);
    const after = Number(afterScores && afterScores[item.id]);
    return [item.id, Number.isFinite(before) && Number.isFinite(after) ? after - before : null];
  }));
  const deltas = Object.values(deltaByItem).filter(Number.isFinite);
  let deltaClass = "unavailable";
  if (deltas.length === SELF_ASSESSMENT_ITEMS.length) {
    const positive = deltas.some((value) => value > 0);
    const negative = deltas.some((value) => value < 0);
    deltaClass = positive && negative ? "mixed" : positive ? "higher" : negative ? "lower" : "same";
  }
  return { deltaByItem, deltaClass };
}

export function validateAssignments({ works, plans }) {
  const errors = [];
  const byId = new Map();
  const ownerCount = new Map();
  const contextVersions = new Set();
  for (const [index, work] of (Array.isArray(works) ? works : []).entries()) {
    if (!work || typeof work !== "object") {
      errors.push(`작품 ${index + 1}: 자료 형식 오류`);
      continue;
    }
    const id = normalizedId(work.id);
    const ownerId = normalizedId(work.ownerId);
    if (!id) {
      errors.push(`작품 ${index + 1}: id 없음`);
      continue;
    }
    if (!ownerId) errors.push(`${id}: ownerId 없음`);
    const title = normalizedId(work.title);
    const relic = normalizedId(work.relic);
    const captionText = normalizedId(work.captionText);
    const contextVersion = normalizedId(work.contextVersion);
    for (const [field, value] of [["title", title], ["relic", relic], ["captionText", captionText]]) {
      if (!value) errors.push(`${id}: ${field} 없음`);
      else if (value.length > CONTEXT_TEXT_MAX_LENGTH) errors.push(`${id}: ${field} ${CONTEXT_TEXT_MAX_LENGTH}자 초과`);
    }
    if (!contextVersion) errors.push(`${id}: contextVersion 없음`);
    else contextVersions.add(contextVersion);
    if (byId.has(id)) errors.push(`중복 작품 id: ${id}`);
    else byId.set(id, { ...work, id, ownerId, title, relic, captionText, contextVersion });
    if (ownerId) ownerCount.set(ownerId, countOf(ownerCount, ownerId) + 1);
  }
  if (contextVersions.size > 1) errors.push("학급 작품의 contextVersion 불일치");

  const planEntries = Object.entries(plans || {});
  const evaluatorIds = new Set(planEntries.map(([id]) => normalizedId(id)));
  for (const [ownerId, count] of ownerCount) {
    if (count !== 1) errors.push(`${ownerId}: 자기 작품이 ${count}점 연결됨`);
    if (!evaluatorIds.has(ownerId)) errors.push(`${ownerId}: 작품 소유자의 평가 계획 없음`);
  }

  let requestedMainTotal = 0;
  const reasonRates = new Set();
  for (const [evaluatorId, plan] of Object.entries(plans || {})) {
    const normalizedEvaluatorId = normalizedId(evaluatorId);
    if (countOf(ownerCount, normalizedEvaluatorId) !== 1) errors.push(`${normalizedEvaluatorId}: 자기 작품이 정확히 1점이 아님`);
    if (!plan || !Array.isArray(plan.trials)) {
      errors.push(evaluatorId + ": 시행 배열 없음");
      continue;
    }
    if (normalizedId(plan.evaluatorId) !== normalizedEvaluatorId) errors.push(evaluatorId + ": 계획의 평가자 id 불일치");
    const mainPairs = new Set();
    const main = plan.trials.filter((trial) => !trial.repeatOf);
    const repeats = plan.trials.filter((trial) => trial.repeatOf);
    const mainContexts = { image_only: 0, image_context: 0 };
    const screenContexts = { image_only: 0, image_context: 0 };
    const trialIds = new Set();
    const requestedMain = Number(plan.requestedMainTrialCount);
    const requestedRepeat = Number(plan.requestedRepeatTrialCount);
    if (!Number.isInteger(requestedMain) || requestedMain < 1) errors.push(evaluatorId + ": 요청 본 비교 수 없음 또는 오류");
    else {
      requestedMainTotal += requestedMain;
      if (main.length !== requestedMain) errors.push(evaluatorId + `: 요청한 본 비교 ${requestedMain}회를 채우지 못함`);
    }
    if (!Number.isInteger(requestedRepeat) || requestedRepeat < 0) errors.push(evaluatorId + ": 요청 반복 수 없음 또는 오류");
    else if (repeats.length !== requestedRepeat) errors.push(evaluatorId + `: 요청한 반복 ${requestedRepeat}회를 채우지 못함`);
    if (main.length !== plan.mainTrialCount) errors.push(evaluatorId + ": 본 비교 수 불일치");
    if (repeats.length !== plan.repeatTrialCount) errors.push(evaluatorId + ": 반복 비교 수 불일치");
    if (!Number.isInteger(plan.minRepeatGap) || plan.minRepeatGap < 0) errors.push(evaluatorId + ": 반복 간격 설정 오류");
    const nominalReasonRate = Number(plan.reasonRateNominal);
    if (!Number.isFinite(nominalReasonRate) || nominalReasonRate < 0 || nominalReasonRate > 1) errors.push(evaluatorId + ": 이유 문항 비율 오류");
    else reasonRates.add(nominalReasonRate);

    plan.trials.forEach((trial, displayIndex) => {
      if (trial.displayIndex !== displayIndex) errors.push(evaluatorId + ": 화면 순서 번호 불일치");
      if (!trial || !trial.trialId) errors.push(evaluatorId + ": 시행 id 없음");
      else if (trialIds.has(trial.trialId)) errors.push(evaluatorId + ": 시행 id 중복");
      else trialIds.add(trial.trialId);
      const leftId = normalizedId(trial && trial.leftWorkId);
      const rightId = normalizedId(trial && trial.rightWorkId);
      const left = byId.get(leftId);
      const right = byId.get(rightId);
      if (!left || !right) errors.push(evaluatorId + ": 존재하지 않는 작품");
      if (leftId === rightId) errors.push(evaluatorId + ": 같은 작품끼리 비교");
      if ((left && left.ownerId === normalizedEvaluatorId) || (right && right.ownerId === normalizedEvaluatorId)) errors.push(evaluatorId + ": 자기 작품 포함");
      if (trial && pairKey(leftId, rightId) !== trial.pairId) errors.push(evaluatorId + ": pairId 불일치");
      if (left && (plan.contextPayloadHashByWork || {})[leftId] !== contextPayloadHash(left)) {
        errors.push(evaluatorId + ": 왼쪽 작품 캡션 payload hash 불일치");
      }
      if (right && (plan.contextPayloadHashByWork || {})[rightId] !== contextPayloadHash(right)) {
        errors.push(evaluatorId + ": 오른쪽 작품 캡션 payload hash 불일치");
      }
      if (left && right && trial.contextPayloadHash !== trialPayloadHash(trial.context, leftId, rightId, byId)) {
        errors.push(evaluatorId + ": 시행 캡션 payload hash 불일치");
      }
      if (trial && screenContexts[trial.context] == null) errors.push(evaluatorId + ": 알 수 없는 맥락 조건");
      else if (trial) screenContexts[trial.context] += 1;
      if (trial && ((plan.contextByWork || {})[leftId] !== trial.context
        || (plan.contextByWork || {})[rightId] !== trial.context)) {
        errors.push(evaluatorId + ": 작품별 맥락 조건 불일치");
      }
    });

    for (const trial of main) {
      if (mainPairs.has(trial.pairId)) errors.push(evaluatorId + ": 본 비교 쌍 중복");
      mainPairs.add(trial.pairId);
      if (mainContexts[trial.context] != null) mainContexts[trial.context] += 1;
    }
    if (Math.abs(mainContexts.image_only - mainContexts.image_context) > 1) errors.push(evaluatorId + ": 본 비교 맥락 조건 불균형");
    if (Math.abs(screenContexts.image_only - screenContexts.image_context) > 1) errors.push(evaluatorId + ": 반복 포함 맥락 조건 불균형");

    const originals = new Map(main.map((trial) => [trial.trialId, trial]));
    const repeatedSources = new Set();
    for (const repeat of repeats) {
      const original = originals.get(repeat.repeatOf);
      if (!original) errors.push(evaluatorId + ": 반복 원본 없음");
      else {
        if (repeatedSources.has(original.trialId)) errors.push(evaluatorId + ": 같은 원본을 두 번 반복");
        repeatedSources.add(original.trialId);
        if (repeat.leftWorkId !== original.rightWorkId || repeat.rightWorkId !== original.leftWorkId) errors.push(evaluatorId + ": 반복 쌍 좌우 미반전");
        if (repeat.context !== original.context) errors.push(evaluatorId + ": 반복 쌍 맥락 변경");
        if (repeat.pairId !== original.pairId) errors.push(evaluatorId + ": 반복 pairId 변경");
        if (repeat.reasonPrompted) errors.push(evaluatorId + ": 반복 시행에 이유 문항 표시");
        const sourcePosition = plan.trials.indexOf(original);
        const repeatPosition = plan.trials.indexOf(repeat);
        if (repeatPosition <= sourcePosition) errors.push(evaluatorId + ": 반복이 원본보다 먼저 제시됨");
        if (repeatPosition - sourcePosition - 1 < plan.minRepeatGap) errors.push(evaluatorId + ": 반복 사이 화면 수 부족");
      }
    }
  }
  const diagnostics = summarizeAssignments({ works, plans });
  if (!diagnostics.mainTrials) errors.push("학급 본 비교가 0회임");
  if (diagnostics.mainTrials !== requestedMainTotal) errors.push("학급 요청 본 비교 합계 불일치");
  if (diagnostics.works > 1 && diagnostics.connectedComponents !== 1) errors.push("학급 비교 그래프가 " + diagnostics.connectedComponents + "개로 끊어짐");
  if (Math.abs(diagnostics.mainContexts.image_only - diagnostics.mainContexts.image_context) > 1) errors.push("학급 본 비교 맥락 조건 불균형");
  if (Math.abs(diagnostics.contexts.image_only - diagnostics.contexts.image_context) > 1) errors.push("학급 반복 포함 맥락 조건 불균형");
  if (diagnostics.maxMainContextExposureImbalance > 1) errors.push("작품별 본 비교 맥락 조건 노출 불균형");
  if (diagnostics.maxMainContextPositionImbalance > 2) errors.push("작품·맥락조건별 본 비교 좌우 위치 불균형");
  if (diagnostics.maxPositionImbalance > 1) errors.push("학급 반복 포함 좌우 위치 불균형");
  if (reasonRates.size > 1) errors.push("계획별 이유 문항 비율 불일치");
  if (diagnostics.reasonPromptCount !== Math.round(diagnostics.mainTrials * diagnostics.reasonRateNominal)) errors.push("학급 이유 문항 표집 수 불일치");
  return errors;
}

export function summarizeAssignments({ works, plans }) {
  const workIds = [...new Set((works || []).map((work) => normalizedId(work && work.id)).filter(Boolean))].sort(compareText);
  const exposure = Object.fromEntries(workIds.map((id) => [id, 0]));
  const left = Object.fromEntries(workIds.map((id) => [id, 0]));
  const right = Object.fromEntries(workIds.map((id) => [id, 0]));
  const contexts = { image_only: 0, image_context: 0 };
  const mainExposure = Object.fromEntries(workIds.map((id) => [id, 0]));
  const mainLeft = Object.fromEntries(workIds.map((id) => [id, 0]));
  const mainRight = Object.fromEntries(workIds.map((id) => [id, 0]));
  const mainContextExposure = Object.fromEntries(workIds.map((id) => [id, { image_only: 0, image_context: 0 }]));
  const mainContextLeft = Object.fromEntries(workIds.map((id) => [id, { image_only: 0, image_context: 0 }]));
  const mainContextRight = Object.fromEntries(workIds.map((id) => [id, { image_only: 0, image_context: 0 }]));
  const mainContexts = { image_only: 0, image_context: 0 };
  const pairUse = {};
  const adjacency = new Map(workIds.map((id) => [id, new Set()]));
  let screenTrials = 0;
  let mainTrials = 0;
  let repeatTrials = 0;
  let reasonPromptCount = 0;
  let reasonRateNominal = null;

  for (const plan of Object.values(plans || {})) {
    if (reasonRateNominal == null && Number.isFinite(Number(plan.reasonRateNominal))) reasonRateNominal = Number(plan.reasonRateNominal);
    for (const trial of plan.trials || []) {
      screenTrials += 1;
      if (exposure[trial.leftWorkId] != null) exposure[trial.leftWorkId] += 1;
      if (exposure[trial.rightWorkId] != null) exposure[trial.rightWorkId] += 1;
      if (left[trial.leftWorkId] != null) left[trial.leftWorkId] += 1;
      if (right[trial.rightWorkId] != null) right[trial.rightWorkId] += 1;
      if (contexts[trial.context] != null) contexts[trial.context] += 1;
      if (trial.repeatOf) {
        repeatTrials += 1;
        continue;
      }
      mainTrials += 1;
      if (trial.reasonPrompted) reasonPromptCount += 1;
      if (mainExposure[trial.leftWorkId] != null) mainExposure[trial.leftWorkId] += 1;
      if (mainExposure[trial.rightWorkId] != null) mainExposure[trial.rightWorkId] += 1;
      if (mainLeft[trial.leftWorkId] != null) mainLeft[trial.leftWorkId] += 1;
      if (mainRight[trial.rightWorkId] != null) mainRight[trial.rightWorkId] += 1;
      if (mainContextExposure[trial.leftWorkId]?.[trial.context] != null) mainContextExposure[trial.leftWorkId][trial.context] += 1;
      if (mainContextExposure[trial.rightWorkId]?.[trial.context] != null) mainContextExposure[trial.rightWorkId][trial.context] += 1;
      if (mainContextLeft[trial.leftWorkId]?.[trial.context] != null) mainContextLeft[trial.leftWorkId][trial.context] += 1;
      if (mainContextRight[trial.rightWorkId]?.[trial.context] != null) mainContextRight[trial.rightWorkId][trial.context] += 1;
      if (mainContexts[trial.context] != null) mainContexts[trial.context] += 1;
      pairUse[trial.pairId] = (pairUse[trial.pairId] || 0) + 1;
      if (adjacency.has(trial.leftWorkId) && adjacency.has(trial.rightWorkId)) {
        adjacency.get(trial.leftWorkId).add(trial.rightWorkId);
        adjacency.get(trial.rightWorkId).add(trial.leftWorkId);
      }
    }
  }

  let connectedComponents = 0;
  const unseen = new Set(workIds.filter((id) => mainExposure[id] > 0));
  while (unseen.size) {
    connectedComponents += 1;
    const stack = [unseen.values().next().value];
    while (stack.length) {
      const id = stack.pop();
      if (!unseen.delete(id)) continue;
      for (const next of adjacency.get(id) || []) if (unseen.has(next)) stack.push(next);
    }
  }
  connectedComponents += workIds.filter((id) => mainExposure[id] === 0).length;
  const exposureValues = Object.values(exposure);
  const mainExposureValues = Object.values(mainExposure);
  const positionImbalance = Object.fromEntries(workIds.map((id) => [id, Math.abs(left[id] - right[id])]));
  const mainPositionImbalance = Object.fromEntries(workIds.map((id) => [id, Math.abs(mainLeft[id] - mainRight[id])]));
  const mainContextExposureImbalance = Object.fromEntries(workIds.map((id) => [
    id,
    Math.abs(mainContextExposure[id].image_only - mainContextExposure[id].image_context),
  ]));
  const mainContextPositionImbalance = Object.fromEntries(workIds.map((id) => [id, {
    image_only: Math.abs(mainContextLeft[id].image_only - mainContextRight[id].image_only),
    image_context: Math.abs(mainContextLeft[id].image_context - mainContextRight[id].image_context),
  }]));
  return {
    evaluators: Object.keys(plans || {}).length,
    works: workIds.length,
    screenTrials,
    mainTrials,
    repeatTrials,
    reasonPromptCount,
    reasonRateNominal: reasonRateNominal == null ? 0 : reasonRateNominal,
    reasonRateActual: mainTrials ? reasonPromptCount / mainTrials : 0,
    exposure,
    exposureRange: exposureValues.length ? Math.max(...exposureValues) - Math.min(...exposureValues) : 0,
    left,
    right,
    positionImbalance,
    maxPositionImbalance: Math.max(0, ...Object.values(positionImbalance)),
    contexts,
    mainExposure,
    mainExposureRange: mainExposureValues.length ? Math.max(...mainExposureValues) - Math.min(...mainExposureValues) : 0,
    mainLeft,
    mainRight,
    mainPositionImbalance,
    maxMainPositionImbalance: Math.max(0, ...Object.values(mainPositionImbalance)),
    mainContextExposure,
    mainContextExposureImbalance,
    maxMainContextExposureImbalance: Math.max(0, ...Object.values(mainContextExposureImbalance)),
    mainContextLeft,
    mainContextRight,
    mainContextPositionImbalance,
    maxMainContextPositionImbalance: Math.max(
      0,
      ...Object.values(mainContextPositionImbalance).flatMap((byContext) => Object.values(byContext)),
    ),
    mainContexts,
    pairUse,
    connectedComponents,
  };
}

export function emptyStudyRecord({
  evaluatorCode,
  rosterVersion,
  assignmentHash = null,
  configHash = null,
  sessionId = null,
  buildCommit = null,
  deviceStart = null,
} = {}) {
  return {
    studyVersion: STUDY_VERSION,
    protocolVersion: STUDY_VERSION,
    buildCommit,
    configHash,
    assignmentHash,
    sessionId,
    evaluatorCode,
    rosterVersion,
    contextAssignmentUnit: "evaluator_work",
    status: "pre",
    startedAtClient: null,
    resumedCount: 0,
    deviceStart,
    trialOrder: [],
    aiRatingOrder: [],
    events: [],
    pre: { answers: {}, startedAt: null, submittedAt: null, durationMs: null },
    selfAssessment: {
      ownWorkId: null,
      rubricVersion: SELF_ASSESSMENT_VERSION,
      scaleVersion: "self-score-5-v2",
      before: { scores: {}, evidence: "", startedAt: null, submittedAt: null },
      after: {
        scores: {},
        evidence: "",
        currentLockedAt: null,
        changeReasonCode: null,
        changeReason: "",
        changeReasonAt: null,
        deltaByItem: null,
        deltaClass: null,
        deltaCalculatedAt: null,
        startedAt: null,
        submittedAt: null,
      },
    },
    pairwise: { startedAt: null, submittedAt: null, trials: [] },
    aiRatings: { startedAt: null, submittedAt: null, items: [] },
  };
}
