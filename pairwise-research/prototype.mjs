import {
  AI_CUE_OPTIONS,
  AI_RATING_ITEMS,
  CONFIDENCE_LABELS,
  PAIRWISE_DEFAULTS,
  PRE_SURVEY_GROUPS,
  PRE_SURVEY_ITEMS,
  SELF_ASSESSMENT_ITEMS,
  SELF_CHANGE_REASON_OPTIONS,
  SELF_SCORE_LABELS,
  STUDY_VERSION,
  classifySelfChange,
  emptyStudyRecord,
  makeClassAssignments,
  preSurveyComplete,
  ratingWorkPlan,
  selfAssessmentComplete,
} from "./research-spec.mjs";

/* 독립 검토용 프로토타입. Firebase나 기존 앱 상태를 사용하지 않는다. */

const STORAGE_KEY = "museum.pairwiseResearch.prototype.r3";
const EVALUATOR_ID = "S01";
const ROSTER_VERSION = "prototype-class-2026-09-r3";

const nowIso = () => new Date().toISOString();
const escapeHtml = (value) => String(value == null ? "" : value)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function artSvg(index) {
  const palettes = [
    ["#d7c3aa", "#6f5845", "#f3eee7"], ["#bdcbc7", "#315b5c", "#eef3f1"],
    ["#c6c0d3", "#514a6b", "#f0eef5"], ["#d8b9ae", "#7b403a", "#f6ece8"],
  ];
  const [base, ink, paper] = palettes[index % palettes.length];
  const n = index + 1;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600">
    <rect width="800" height="600" fill="${paper}"/>
    <rect x="34" y="34" width="732" height="532" fill="${base}" opacity=".34"/>
    <ellipse cx="400" cy="492" rx="225" ry="38" fill="#000" opacity=".12"/>
    <path d="M${210 + n * 3} 430 C245 335 265 205 355 165 C430 132 565 207 585 325 C598 407 530 455 420 462 C330 468 250 458 ${210 + n * 3} 430Z" fill="${ink}" opacity=".92"/>
    <path d="M300 392 C350 ${250 + n * 4} 470 ${238 - n * 2} 536 348" fill="none" stroke="${paper}" stroke-width="${18 + (n % 4) * 5}" opacity=".75"/>
    <circle cx="${310 + (n * 29) % 250}" cy="${250 + (n * 17) % 120}" r="${30 + (n % 5) * 8}" fill="${base}" stroke="${paper}" stroke-width="8"/>
    <path d="M165 510 H635" stroke="${ink}" stroke-width="4"/><path d="M190 494 V526 M610 494 V526" stroke="${ink}" stroke-width="4"/>
    <text x="400" y="552" text-anchor="middle" font-family="monospace" font-size="16" fill="${ink}">ARCHIVE OBJECT ${String(n).padStart(2, "0")}</text>
  </svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

const DEMO_WORKS = Array.from({ length: 14 }, (_, i) => ({
  id: "W" + String(i + 1).padStart(2, "0"),
  ownerId: "S" + String(i + 1).padStart(2, "0"),
  title: ["남은 손잡이", "수위선", "열쇠 37", "마지막 식판", "야간등", "빈 표지", "눌린 단추"][i % 7] + " " + (i + 1),
  relic: ["마모된 운반 기구 파편", "도장 박리 수납함 조각", "번호표가 달린 열쇠", "유약이 갈라진 식판", "빛이 새는 표시 장치"][i % 5],
  captionText: [
    "반복되었지만 기록되지 않은 노동의 흔적을, 손이 닿는 한 지점의 마모로 드러낸다.",
    "매년 같은 높이까지 차오른 물이 사물 표면에 남긴 선을 미래의 발굴 기록처럼 제시한다.",
    "사라진 장소를 사람의 얼굴 대신 오래 사용한 물건의 번호와 손상으로 기억한다.",
    "일상에서 너무 익숙해 보이지 않던 문제를 수집·분류·명명하는 전시 장치로 다시 보이게 한다.",
  ][i % 4],
  contextVersion: "demo-context-v1",
  image: artSvg(i),
}));
const DEMO_EVALUATORS = DEMO_WORKS.map((work) => work.ownerId);
const PLANS = makeClassAssignments({ works: DEMO_WORKS, evaluators: DEMO_EVALUATORS, k: PAIRWISE_DEFAULTS.mainTrials, seed: ROSTER_VERSION });
const PLAN = PLANS[EVALUATOR_ID];
const RATING_PLAN = ratingWorkPlan(PLAN, 6);
const WORK_BY_ID = new Map(DEMO_WORKS.map((work) => [work.id, work]));
const OWN_WORK = DEMO_WORKS.find((work) => work.ownerId === EVALUATOR_ID);

function loadRecord() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved && saved.studyVersion === STUDY_VERSION && saved.assignmentHash === PLAN.assignmentHash) {
      saved.resumedCount = (saved.resumedCount || 0) + 1;
      return saved;
    }
  } catch (_) {}
  const record = emptyStudyRecord({
    evaluatorCode: "P-DEMO-01",
    rosterVersion: ROSTER_VERSION,
    assignmentHash: PLAN.assignmentHash,
    configHash: "prototype-config-r3",
    sessionId: "preview-" + Date.now().toString(36),
    deviceStart: deviceSnapshot(),
  });
  record.prototypeMode = true;
  record.selfAssessment.ownWorkId = OWN_WORK.id;
  record.trialOrder = PLAN.trials.map((trial) => trial.trialId);
  record.aiRatingOrder = RATING_PLAN.map((item) => item.workId);
  record.startedAtClient = nowIso();
  return record;
}

let record = loadRecord();
const requestedStage = new URLSearchParams(location.search).get("stage");
if (["pre", "selfBefore", "intro", "pair", "selfAfter", "aiIntro", "ai", "done"].includes(requestedStage)) {
  record.status = requestedStage;
  record.prototypeNavigation = true;
  if (requestedStage === "selfBefore") record.selfAssessment.before.startedAt ||= nowIso();
  if (requestedStage === "pair") record.pairwise.startedAt ||= nowIso();
  if (requestedStage === "selfAfter") record.selfAssessment.after.startedAt ||= nowIso();
  if (requestedStage === "ai") record.aiRatings.startedAt ||= nowIso();
}
let observer = null;
let resizeTimer = null;

function saveRecord() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
  const status = document.querySelector("#save-status");
  if (status) status.textContent = "이 기기의 미리보기 저장소에 저장됨 · " + new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function addEvent(type, payload = {}) {
  record.events = [...(record.events || []), { type, at: nowIso(), ...payload }].slice(-1200);
}

function deviceSnapshot() {
  const vv = window.visualViewport;
  return {
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    visualViewportWidth: vv ? Math.round(vv.width) : null,
    visualViewportHeight: vv ? Math.round(vv.height) : null,
    orientation: screen.orientation ? screen.orientation.type : (window.innerWidth >= window.innerHeight ? "landscape" : "portrait"),
    devicePixelRatio: window.devicePixelRatio || 1,
    pointer: matchMedia("(pointer: coarse)").matches ? "coarse" : "fine",
  };
}

function layoutSnapshot(trial) {
  const axis = matchMedia("(max-width: 720px)").matches ? "y" : "x";
  const first = document.querySelector(`[data-work-id="${trial.leftWorkId}"]`);
  const second = document.querySelector(`[data-work-id="${trial.rightWorkId}"]`);
  const rect = (node) => {
    if (!node) return null;
    const r = node.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
  };
  return {
    axis,
    firstPhysical: axis === "x" ? "left" : "top",
    secondPhysical: axis === "x" ? "right" : "bottom",
    firstRect: rect(first),
    secondRect: rect(second),
    scrollY: Math.round(window.scrollY),
    ...deviceSnapshot(),
  };
}

function shell(content, { step = "", title = "쌍대비교 연구 화면" } = {}) {
  return `
    <header class="topbar">
      <div><span class="eyebrow">ISOLATED PROTOTYPE</span><strong>${escapeHtml(title)}</strong></div>
      <span id="save-status" role="status">기존 앱과 연결되지 않은 검토용 화면</span>
    </header>
    <aside class="preview-tools" aria-label="프로토타입 단계 이동">
      <b>검토 도구</b><span>실제 학생 화면에는 표시하지 않음</span>
      <button data-preview-stage="pre">사전설문</button>
      <button data-preview-stage="selfBefore">자기평가①</button>
      <button data-preview-stage="intro">비교 안내</button>
      <button data-preview-stage="selfAfter">자기평가②</button>
      <button data-preview-stage="aiIntro">AI다움</button>
      <button data-preview-stage="done">완료</button>
      <button data-preview-reset class="subtle">초기화</button>
    </aside>
    <main id="main" tabindex="-1">
      ${step ? `<div class="step-label">${escapeHtml(step)}</div>` : ""}
      ${content}
    </main>
  `;
}

function setHtml(html, focusSelector = "#main") {
  if (observer) { observer.disconnect(); observer = null; }
  document.querySelector("#app").innerHTML = html;
  bindPreviewTools();
  requestAnimationFrame(() => {
    const target = document.querySelector(focusSelector);
    if (target) target.focus({ preventScroll: true });
  });
}

function bindPreviewTools() {
  document.querySelectorAll("[data-preview-stage]").forEach((button) => {
    button.addEventListener("click", () => {
      record.status = button.dataset.previewStage;
      record.prototypeNavigation = true;
      if (record.status === "selfBefore") record.selfAssessment.before.startedAt ||= nowIso();
      if (record.status === "selfAfter") record.selfAssessment.after.startedAt ||= nowIso();
      if (record.status === "aiIntro" && !record.pairwise.submittedAt) record.pairwise.submittedAt = nowIso();
      addEvent("prototype_jump", { stage: record.status });
      saveRecord();
      render();
    });
  });
  const reset = document.querySelector("[data-preview-reset]");
  if (reset) reset.addEventListener("click", () => {
    if (!confirm("이 독립 프로토타입의 브라우저 저장 내용만 초기화할까요?")) return;
    localStorage.removeItem(STORAGE_KEY);
    record = loadRecord();
    render();
  });
}

function optionButtons(item, value) {
  const namedScale = !item.options && Array.isArray(item.scale && item.scale.labels);
  const options = item.options || (namedScale
    ? item.scale.labels
    : Array.from({ length: item.scale.max - item.scale.min + 1 }, (_, i) => String(item.scale.min + i)));
  return `<div class="answer-options ${item.scale && item.scale.max === 10 ? "ten" : ""} ${namedScale ? "named" : ""}" role="radiogroup" aria-label="${escapeHtml(item.text)}">
    ${options.map((label, i) => {
      const n = item.options ? i + 1 : item.scale.min + i;
      const endpoint = !item.options && (i === 0 ? item.scale.low : i === options.length - 1 ? item.scale.high : "");
      return `<button type="button" role="radio" aria-checked="${Number(value) === n}" class="${Number(value) === n ? "selected" : ""}"
        tabindex="${Number(value) === n || (!(Number(value) > 0) && i === 0) ? "0" : "-1"}"
        data-pre-item="${item.id}" data-value="${n}" title="${escapeHtml(item.options || namedScale ? label : endpoint || n + "점")}">
        <b>${item.options || namedScale ? escapeHtml(label) : n}</b>${!namedScale && endpoint ? `<small>${escapeHtml(endpoint)}</small>` : ""}
      </button>`;
    }).join("")}
  </div>`;
}

function bindRadioArrowKeys(groupSelector) {
  document.querySelectorAll(groupSelector).forEach((group) => {
    const buttons = [...group.querySelectorAll('[role="radio"]')];
    buttons.forEach((button, index) => button.addEventListener("keydown", (event) => {
      let nextIndex = null;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (index + 1) % buttons.length;
      else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (index - 1 + buttons.length) % buttons.length;
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = buttons.length - 1;
      if (nextIndex == null) return;
      event.preventDefault();
      buttons[nextIndex].click();
    }));
  });
}

function renderPre() {
  const answers = record.pre.answers || {};
  const answered = PRE_SURVEY_ITEMS.filter((item) => Number(answers[item.id]) > 0).length;
  const groups = PRE_SURVEY_GROUPS.map((group, groupIndex) => `
    <section class="survey-group" aria-labelledby="group-${group.id}">
      <h2 id="group-${group.id}">${groupIndex + 1}. ${escapeHtml(group.title)}</h2>
      <p class="help">${escapeHtml(group.note)}</p>
      ${group.items.map((base) => {
        const item = PRE_SURVEY_ITEMS.find((candidate) => candidate.id === base.id);
        const number = PRE_SURVEY_ITEMS.findIndex((candidate) => candidate.id === item.id) + 1;
        return `<fieldset class="survey-item" id="pre-${item.id}">
          <legend><span>${String(number).padStart(2, "0")}</span>${escapeHtml(item.text)}</legend>
          ${item.help ? `<p class="item-help">${escapeHtml(item.help)}</p>` : ""}
          ${optionButtons(item, answers[item.id])}
        </fieldset>`;
      }).join("")}
    </section>
  `).join("");

  setHtml(shell(`
    <section class="hero compact">
      <span class="eyebrow">단원 시작 전 · 약 6분</span>
      <h1 tabindex="-1">미술과 이미지 AI 사용 경험</h1>
      <p>성적과 관계없으며 정답이 없습니다. 지금까지의 경험과 현재 생각에 가장 가까운 답을 골라 주세요.</p>
    </section>
    <div class="progress-box" aria-label="설문 진행률"><span><i style="width:${answered / PRE_SURVEY_ITEMS.length * 100}%"></i></span><b>${answered}/${PRE_SURVEY_ITEMS.length}</b></div>
    <form id="pre-form" novalidate>${groups}
      <div class="action-bar"><button class="primary" type="submit">사전설문 제출</button><span>모든 문항에 답해야 제출할 수 있습니다.</span></div>
    </form>
  `, { step: "1 / 6 · 사전설문", title: "미술과 이미지 AI 사용 경험" }), "h1");

  document.querySelectorAll("[data-pre-item]").forEach((button) => button.addEventListener("click", () => {
    record.pre.startedAt ||= nowIso();
    record.pre.answers[button.dataset.preItem] = Number(button.dataset.value);
    addEvent("pre_answer", { itemId: button.dataset.preItem, value: Number(button.dataset.value) });
    saveRecord();
    renderPre();
    requestAnimationFrame(() => {
      const selected = document.querySelector(`[data-pre-item="${button.dataset.preItem}"][data-value="${button.dataset.value}"]`);
      if (selected) selected.focus({ preventScroll: true });
    });
  }));
  bindRadioArrowKeys(".answer-options");
  document.querySelector("#pre-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!preSurveyComplete(record.pre.answers)) {
      const missing = PRE_SURVEY_ITEMS.find((item) => !(Number(record.pre.answers[item.id]) > 0));
      const field = missing && document.querySelector("#pre-" + missing.id);
      if (field) { field.classList.add("error"); field.scrollIntoView({ behavior: "smooth", block: "center" }); }
      announce("아직 답하지 않은 문항이 있습니다.", true);
      return;
    }
    record.pre.submittedAt = nowIso();
    record.pre.durationMs = record.pre.startedAt ? Date.now() - new Date(record.pre.startedAt).getTime() : null;
    record.status = "selfBefore";
    record.selfAssessment.before.startedAt ||= nowIso();
    addEvent("pre_submit");
    saveRecord();
    render();
  });
}

function selfWorkCard() {
  return `<div class="single-work self-work">
    <span class="eyebrow">내가 제출한 최종 작품</span>
    <img src="${OWN_WORK.image}" alt="내가 제출한 최종 작품" />
    <div class="work-context"><b>「${escapeHtml(OWN_WORK.title)}」</b><small>${escapeHtml(OWN_WORK.relic)}</small><p>${escapeHtml(OWN_WORK.captionText)}</p></div>
  </div>`;
}

function selfScoreRows(assessment, phase) {
  return SELF_ASSESSMENT_ITEMS.map((item, index) => `<fieldset class="survey-item self-score-item" id="self-${phase}-${item.id}">
    <legend><span>${String(index + 1).padStart(2, "0")}</span><b>${escapeHtml(item.label)}</b> · ${escapeHtml(item.text)}</legend>
    <div class="answer-options self-score-options named" role="radiogroup" aria-label="${escapeHtml(item.label)} 자기평가">
      ${SELF_SCORE_LABELS.map((label, scoreIndex) => {
        const score = scoreIndex + 1;
        const selected = Number(assessment.scores[item.id]) === score;
        return `<button type="button" role="radio" aria-checked="${selected}" tabindex="${selected || (!assessment.scores[item.id] && scoreIndex === 0) ? "0" : "-1"}" class="${selected ? "selected" : ""}" data-self-phase="${phase}" data-self-item="${item.id}" data-value="${score}"><b>${score}</b><small>${escapeHtml(label)}</small></button>`;
      }).join("")}
    </div>
  </fieldset>`).join("");
}

function bindSelfScoreForm(phase, renderAgain) {
  const assessment = phase === "before" ? record.selfAssessment.before : record.selfAssessment.after;
  document.querySelectorAll("[data-self-item]").forEach((button) => button.addEventListener("click", () => {
    const itemId = button.dataset.selfItem;
    const value = Number(button.dataset.value);
    assessment.startedAt ||= nowIso();
    assessment.scores[itemId] = value;
    addEvent("self_score", { phase, itemId, value });
    saveRecord();
    renderAgain();
    requestAnimationFrame(() => document.querySelector(`[data-self-phase="${phase}"][data-self-item="${itemId}"][data-value="${value}"]`)?.focus({ preventScroll: true }));
  }));
  bindRadioArrowKeys(".self-score-options");
  const evidence = document.querySelector("#self-evidence");
  if (evidence) evidence.addEventListener("input", () => {
    assessment.evidence = evidence.value;
    saveRecord();
    const submit = document.querySelector("#self-submit");
    if (submit) submit.disabled = !selfAssessmentComplete(assessment);
    const count = document.querySelector("#self-evidence-count");
    if (count) count.textContent = assessment.evidence.trim().length + "/300 · 최소 15자";
  });
}

function renderSelfBefore() {
  const assessment = record.selfAssessment.before;
  if (assessment.submittedAt) {
    setHtml(shell(`
      <section class="hero compact">
        <span class="eyebrow">자기평가 ① 확정 완료</span>
        <h1 tabindex="-1">처음 자기평가는 수정할 수 없습니다</h1>
        <p>이전 판단이 뒤의 비교와 재채점에 맞춰 바뀌지 않도록 점수와 근거를 잠갔습니다.</p>
        <div class="notice neutral">실제 학생 화면에는 단계 이동 도구가 없으며, 배포 시에는 서버가 완료 상태와 수정 금지를 검증합니다.</div>
        <button id="continue-after-before" class="primary large">비교 안내로 이동</button>
      </section>
    `, { step: "2 / 6 · 자기평가 ①", title: "내 작품 자기평가" }), "h1");
    document.querySelector("#continue-after-before").addEventListener("click", () => {
      record.status = "intro";
      saveRecord();
      render();
    });
    return;
  }
  const complete = selfAssessmentComplete(assessment);
  setHtml(shell(`
    <section class="hero compact">
      <span class="eyebrow">자기평가 ① · 현재 판단</span>
      <h1 tabindex="-1">현재 기준으로 내 작품을 평가합니다</h1>
      <p>점수를 높게 주는 것이 목표가 아닙니다. 지금 자기 작품에서 확인되는 근거로만 판단하세요.</p>
    </section>
    <div class="notice neutral">실제 연구에서는 이 평가는 최종 작품 제출 시점에 받고, 동료 쌍대비교와 시간적으로 분리합니다. 아래 점수와 근거는 비교 화면에 다시 보여 주지 않습니다.</div>
    ${selfWorkCard()}
    <form id="self-form" class="survey-group" novalidate>
      <h2>내 작품만 1~5점으로 평가</h2>
      <p class="help">이 연구용 자기평가는 교사 성적 루브릭과 별도이며, 동료 작품의 점수나 성적을 뜻하지 않습니다.</p>
      ${selfScoreRows(assessment, "before")}
      <label class="reason-box">이번 점수를 정할 때 가장 중요하게 본 자기 작품의 구체적 특징이나 제시자료의 근거 한 가지를 적어 주세요.
        <textarea id="self-evidence" rows="3" maxlength="300" placeholder="자기 작품에서 직접 확인되는 근거를 한 문장으로 씁니다.">${escapeHtml(assessment.evidence)}</textarea>
        <small id="self-evidence-count">${assessment.evidence.trim().length}/300 · 최소 15자</small>
      </label>
      <div class="action-bar"><button id="self-submit" class="primary" type="submit" ${complete ? "" : "disabled"}>자기평가 ① 확정</button><span>확정 뒤 쌍대비교에서는 이 점수를 표시하지 않습니다.</span></div>
    </form>
  `, { step: "2 / 6 · 자기평가 ①", title: "내 작품 자기평가" }), "h1");

  bindSelfScoreForm("before", renderSelfBefore);
  document.querySelector("#self-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!selfAssessmentComplete(assessment)) {
      announce("다섯 항목과 현재 판단 근거를 모두 작성해 주세요.", true);
      return;
    }
    assessment.submittedAt = nowIso();
    record.status = "intro";
    addEvent("self_before_submit");
    saveRecord();
    render();
  });
}

function renderSelfAfter() {
  const assessment = record.selfAssessment.after;
  assessment.startedAt ||= nowIso();
  if (assessment.currentLockedAt) {
    const reasonCode = assessment.changeReasonCode;
    const validReasonCode = SELF_CHANGE_REASON_OPTIONS.some((option) => option.value === reasonCode);
    const reasonNeedsText = validReasonCode && reasonCode !== "unclear";
    const reasonReady = validReasonCode && (!reasonNeedsText || assessment.changeReason.trim().length >= 8);
    setHtml(shell(`
      <section class="hero compact">
        <span class="eyebrow">현재 점수와 근거 저장 완료</span>
        <h1 tabindex="-1">이번 판단을 그렇게 한 이유를 남깁니다</h1>
        <p>처음 점수보다 높아짐·낮아짐·같음은 모두 자연스러운 결과이며 어느 방향도 정답이 아닙니다.</p>
      </section>
      ${selfWorkCard()}
      <form id="change-form" class="survey-group" novalidate>
        <h2>변경 또는 유지 사유</h2>
        <p class="help">실제 배포에서는 현재 판단을 고정한 뒤 서버에서 이전 응답과 결합합니다. 이 화면에서는 이전 점수·숫자 차이·학급 순위를 보여 주지 않습니다.</p>
        <fieldset class="survey-item"><legend>이번 판단 과정이 처음 평가와 비교해 어떻게 느껴졌습니까?</legend>
          <div class="cue-options change-reason-options" role="radiogroup" aria-label="변경 또는 유지 사유 유형">${SELF_CHANGE_REASON_OPTIONS.map((option, index) => `<button type="button" role="radio" aria-checked="${reasonCode === option.value}" tabindex="${reasonCode === option.value || (!reasonCode && index === 0) ? "0" : "-1"}" class="${reasonCode === option.value ? "selected" : ""}" data-change-reason-code="${option.value}">${escapeHtml(option.label)}</button>`).join("")}</div>
        </fieldset>
        ${reasonNeedsText ? `<label class="reason-box">선택한 사유를 자기 작품에서 확인되는 구체적 근거와 연결해 적어 주세요.
          <textarea id="change-reason" rows="4" maxlength="500" placeholder="비교 활동 때문이라고 가정하지 말고 실제 생각이나 관찰을 적습니다.">${escapeHtml(assessment.changeReason)}</textarea>
          <small id="change-count">${assessment.changeReason.trim().length}/500 · 최소 8자</small>
        </label>` : reasonCode === "unclear" ? `<div class="notice neutral">‘이유가 분명하지 않거나 기억나지 않음’도 유효한 응답입니다. 억지로 이유를 만들어 쓰지 않아도 됩니다.</div>` : ""}
        <div class="action-bar"><button id="change-submit" class="primary" type="submit" ${reasonReady ? "" : "disabled"}>자기평가 ② 제출</button><span>이 사유는 점수의 높고 낮음이 아니라 판단 근거의 변화를 해석하는 자료입니다.</span></div>
      </form>
    `, { step: "4 / 6 · 자기평가 ②", title: "내 작품 재평가" }), "h1");
    document.querySelectorAll("[data-change-reason-code]").forEach((button) => button.addEventListener("click", () => {
      assessment.changeReasonCode = button.dataset.changeReasonCode;
      if (assessment.changeReasonCode === "unclear") assessment.changeReason = "";
      assessment.changeReasonAt = nowIso();
      addEvent("self_change_reason_code", { value: assessment.changeReasonCode });
      saveRecord();
      renderSelfAfter();
      requestAnimationFrame(() => document.querySelector(`[data-change-reason-code="${assessment.changeReasonCode}"]`)?.focus({ preventScroll: true }));
    }));
    bindRadioArrowKeys(".change-reason-options");
    const reason = document.querySelector("#change-reason");
    if (reason) reason.addEventListener("input", () => {
      assessment.changeReason = reason.value;
      assessment.changeReasonAt = nowIso();
      saveRecord();
      document.querySelector("#change-submit").disabled = assessment.changeReason.trim().length < 8;
      document.querySelector("#change-count").textContent = assessment.changeReason.trim().length + "/500 · 최소 8자";
    });
    document.querySelector("#change-form").addEventListener("submit", (event) => {
      event.preventDefault();
      if (!selfAssessmentComplete(assessment, { requireChangeReason: true })) return;
      assessment.submittedAt = nowIso();
      record.status = "aiIntro";
      addEvent("self_after_submit", { deltaClass: assessment.deltaClass, reasonCode: assessment.changeReasonCode });
      saveRecord();
      render();
    });
    return;
  }

  const complete = selfAssessmentComplete(assessment);
  setHtml(shell(`
    <section class="hero compact">
      <span class="eyebrow">자기평가 ② · 현재 판단</span>
      <h1 tabindex="-1">현재 기준으로 내 작품을 평가합니다</h1>
      <p>점수를 높게 주는 것이 목표가 아닙니다. 지금 자기 작품에서 확인되는 근거로만 판단하세요.</p>
    </section>
    <div class="notice neutral">현재 점수와 근거를 확정하기 전에는 다른 응답과 학급 결과를 표시하지 않습니다. 이 독립 프로토타입은 화면 순서만 재현하며, 실제 배포에서는 이전 응답을 이 화면에 보내지 않습니다.</div>
    ${selfWorkCard()}
    <form id="self-form" class="survey-group" novalidate>
      <h2>내 작품만 1~5점으로 평가</h2>
      <p class="help">이 연구용 자기평가는 교사 성적 루브릭과 별도이며, 동료 작품의 점수나 성적을 뜻하지 않습니다.</p>
      ${selfScoreRows(assessment, "after")}
      <label class="reason-box">이번 점수를 정할 때 가장 중요하게 본 자기 작품의 구체적 특징이나 제시자료의 근거 한 가지를 적어 주세요.
        <textarea id="self-evidence" rows="3" maxlength="300" placeholder="자기 작품에서 직접 확인되는 근거를 한 문장으로 씁니다.">${escapeHtml(assessment.evidence)}</textarea>
        <small id="self-evidence-count">${assessment.evidence.trim().length}/300 · 최소 15자</small>
      </label>
      <div class="action-bar"><button id="self-submit" class="primary" type="submit" ${complete ? "" : "disabled"}>현재 점수와 근거 확정</button><span>확정한 뒤 변경·유지 사유를 작성합니다.</span></div>
    </form>
  `, { step: "4 / 6 · 자기평가 ②", title: "내 작품 재평가" }), "h1");

  bindSelfScoreForm("after", renderSelfAfter);
  document.querySelector("#self-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!selfAssessmentComplete(assessment)) {
      announce("다섯 항목과 현재 판단 근거를 모두 작성해 주세요.", true);
      return;
    }
    assessment.currentLockedAt = nowIso();
    const change = classifySelfChange(record.selfAssessment.before.scores, assessment.scores);
    assessment.deltaByItem = change.deltaByItem;
    assessment.deltaClass = change.deltaClass;
    assessment.deltaCalculatedAt = nowIso();
    addEvent("self_after_current_lock", { deltaClass: change.deltaClass });
    saveRecord();
    renderSelfAfter();
  });
}

function renderIntro() {
  setHtml(shell(`
    <section class="hero">
      <span class="eyebrow">작품을 보기 전 안내</span>
      <h1 tabindex="-1">두 작품 가운데 한 점을 고릅니다</h1>
      <p class="lead">두 작품 중 이 수업의 질문인 <q>무엇이 이미지를 미술로 만드는가?</q>에 더 설득력 있게 응답하는 작품을 고르세요.</p>
      <div class="rule-grid">
        <article><b>한 가지 질문</b><p>매 비교에서 같은 질문으로 판단합니다.</p></article>
        <article><b>작가 추측 금지</b><p>이름·학급·도구·점수는 보이지 않습니다.</p></article>
        <article><b>총 12회 강제선택</b><p>매 화면에서 한 점을 고릅니다. 작품 점수는 입력하지 않습니다.</p></article>
        <article><b>판단 확신</b><p>선택 뒤 작품 점수가 아닌 판단의 확신만 말로 표시합니다.</p></article>
        <article><b>비공개 응답</b><p>선택은 성적·공개 순위에 사용하지 않습니다.</p></article>
      </div>
      <div class="notice neutral">실제 연구에서는 사전설문을 단원 시작 전에 마치고 이 화면은 8차시에 따로 엽니다. 지금은 화면 검토를 위해 이어서 진행합니다.</div>
      <button id="start-pairs" class="primary large">작품 비교 시작</button>
    </section>
  `, { step: "3 / 6 · 비교 안내", title: "학생 작품 쌍대비교" }), "h1");
  document.querySelector("#start-pairs").addEventListener("click", () => {
    record.status = "pair";
    record.pairwise.startedAt ||= nowIso();
    addEvent("pairwise_start");
    saveRecord();
    render();
  });
}

function workCard(work, slot, trial, draft) {
  const selected = draft.choiceWorkId === work.id;
  const showContext = trial.context === "image_context";
  return `<article class="work-card ${selected ? "chosen" : ""}" data-work-id="${work.id}">
    <button class="work-choice" type="button" data-choose-work="${work.id}" aria-pressed="${selected}">
      <span class="work-slot">작품 ${slot === "first" ? "A" : "B"}</span>
      <span class="work-image" data-seen-work="${work.id}"><img src="${work.image}" alt="익명 작품 ${slot === "first" ? "A" : "B"}" /></span>
      ${showContext ? `<span class="work-context"><b>「${escapeHtml(work.title)}」</b><small>${escapeHtml(work.relic)}</small><p>${escapeHtml(work.captionText)}</p></span>` : ""}
      <span class="choose-label">${selected ? "✓ 이 작품을 선택함" : "이 작품 선택"}</span>
    </button>
  </article>`;
}

function ensurePairDraft(trial) {
  const current = record.pairwise.draft;
  if (current && current.trialId === trial.trialId) return current;
  const draft = {
    trialId: trial.trialId,
    pairId: trial.pairId,
    renderedAt: nowIso(),
    renderedEpochMs: Date.now(),
    firstSeenAtByWork: {},
    bothSeenAt: null,
    choiceWorkId: null,
    choiceAt: null,
    choiceChanges: 0,
    confidence: null,
    confidenceAt: null,
    reasonText: "",
    reasonAt: null,
    layoutAtRender: null,
    layoutEvents: [],
  };
  record.pairwise.draft = draft;
  addEvent("trial_render", { trialId: trial.trialId, pairId: trial.pairId });
  saveRecord();
  return draft;
}

function bindVisibility(trial, draft) {
  if (!("IntersectionObserver" in window)) {
    const at = nowIso();
    draft.firstSeenAtByWork[trial.leftWorkId] ||= at;
    draft.firstSeenAtByWork[trial.rightWorkId] ||= at;
    draft.bothSeenAt ||= at;
    saveRecord();
    return;
  }
  observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting || entry.intersectionRatio < 0.6) continue;
      const workId = entry.target.dataset.seenWork;
      if (!draft.firstSeenAtByWork[workId]) {
        draft.firstSeenAtByWork[workId] = nowIso();
        addEvent("work_seen", { trialId: trial.trialId, workId, ratio: entry.intersectionRatio });
      }
    }
    if (!draft.bothSeenAt && draft.firstSeenAtByWork[trial.leftWorkId] && draft.firstSeenAtByWork[trial.rightWorkId]) {
      draft.bothSeenAt = nowIso();
      addEvent("both_seen", { trialId: trial.trialId });
    }
    saveRecord();
  }, { threshold: [0.6] });
  document.querySelectorAll("[data-seen-work]").forEach((image) => observer.observe(image));
}

function renderPair() {
  const completed = record.pairwise.trials.length;
  if (completed >= PLAN.trials.length) {
    record.pairwise.submittedAt ||= nowIso();
    record.pairwise.draft = null;
    record.status = "selfAfter";
    record.selfAssessment.after.startedAt ||= nowIso();
    addEvent("pairwise_submit", { mainTrials: PLAN.mainTrialCount, repeatTrials: PLAN.repeatTrialCount });
    saveRecord();
    render();
    return;
  }
  const trial = PLAN.trials[completed];
  const draft = ensurePairDraft(trial);
  const left = WORK_BY_ID.get(trial.leftWorkId);
  const right = WORK_BY_ID.get(trial.rightWorkId);
  const showConfidence = !!draft.choiceWorkId;
  const showReason = showConfidence && Number(draft.confidence) > 0 && trial.reasonPrompted;
  const ready = showConfidence && Number(draft.confidence) > 0 && (!trial.reasonPrompted || draft.reasonText.trim().length >= 8);

  setHtml(shell(`
    <section class="pair-head">
      <div><span class="eyebrow">작품 비교 ${completed + 1} / ${PLAN.trials.length}</span><h1 tabindex="-1">어느 작품이 더 설득력 있습니까?</h1></div>
      <div class="trial-progress"><i style="width:${completed / PLAN.trials.length * 100}%"></i></div>
    </section>
    <p class="pair-question">${escapeHtml(PAIRWISE_DEFAULTS.question)}</p>
    <p class="help center">작품의 유명함이나 작가 추측이 아니라, 화면과 현재 제시된 자료에서 확인되는 근거로 판단하세요. 좁은 화면에서는 아래 작품까지 확인한 뒤 선택하세요.</p>
    <div class="pair-grid">${workCard(left, "first", trial, draft)}${workCard(right, "second", trial, draft)}</div>
    <section class="response-panel" aria-labelledby="response-title">
      <h2 id="response-title" tabindex="-1">선택한 뒤 확신도를 표시하세요</h2>
      ${showConfidence ? `<fieldset class="confidence"><legend>이 항목은 작품 점수가 아니라, 방금 선택한 판단의 확신입니다.</legend>
        <div class="confidence-options" role="radiogroup" aria-label="작품 점수가 아닌 판단 확신">${CONFIDENCE_LABELS.map((label, i) => `<button type="button" role="radio" aria-checked="${draft.confidence === i + 1}" tabindex="${draft.confidence === i + 1 || (!draft.confidence && i === 0) ? "0" : "-1"}" class="${draft.confidence === i + 1 ? "selected" : ""}" data-confidence="${i + 1}"><span>${escapeHtml(label)}</span></button>`).join("")}</div>
      </fieldset>` : `<p class="muted">먼저 작품 A 또는 B를 선택하면 확신도 문항이 나타납니다.</p>`}
      ${showReason ? `<label class="reason-box">결정에 가장 큰 영향을 준 화면상의 특징 또는 제시자료의 근거를 한 문장으로 적어 주세요.
        <textarea id="reason" rows="3" maxlength="300" placeholder="눈에 보이거나 제시된 구체적인 근거를 적습니다.">${escapeHtml(draft.reasonText)}</textarea>
        <small>${draft.reasonText.trim().length}/300 · 최소 8자</small></label>` : ""}
      <div class="action-bar"><button id="commit-pair" class="primary" ${ready ? "" : "disabled"}>${completed + 1 >= PLAN.trials.length ? "작품 비교 마치기" : "이 판단 저장하고 다음 →"}</button><span>저장한 판단은 앞 화면으로 돌아가 고치지 않습니다.</span></div>
    </section>
  `, { step: "3 / 6 · 쌍대비교", title: "학생 작품 쌍대비교" }), "h1");

  requestAnimationFrame(() => {
    if (!draft.layoutAtRender) { draft.layoutAtRender = layoutSnapshot(trial); saveRecord(); }
    bindVisibility(trial, draft);
  });

  document.querySelectorAll("[data-choose-work]").forEach((button) => button.addEventListener("click", () => {
    if (!draft.bothSeenAt) {
      const unseenWorkId = [trial.leftWorkId, trial.rightWorkId].find((workId) => !draft.firstSeenAtByWork[workId]);
      addEvent("choice_blocked_before_both_seen", { trialId: trial.trialId, attemptedWorkId: button.dataset.chooseWork, unseenWorkId: unseenWorkId || null });
      saveRecord();
      announce("두 작품 이미지를 모두 확인한 뒤 선택해 주세요.", true);
      const unseenImage = unseenWorkId && document.querySelector(`[data-seen-work="${unseenWorkId}"]`);
      if (unseenImage) unseenImage.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
      return;
    }
    const next = button.dataset.chooseWork;
    if (draft.choiceWorkId && draft.choiceWorkId !== next) draft.choiceChanges += 1;
    draft.choiceWorkId = next;
    draft.choiceAt = nowIso();
    addEvent("choice", { trialId: trial.trialId, workId: next, changes: draft.choiceChanges });
    saveRecord();
    renderPair();
    requestAnimationFrame(() => document.querySelector("#response-title")?.focus());
  }));
  document.querySelectorAll("[data-confidence]").forEach((button) => button.addEventListener("click", () => {
    draft.confidence = Number(button.dataset.confidence);
    draft.confidenceAt = nowIso();
    addEvent("confidence", { trialId: trial.trialId, value: draft.confidence });
    saveRecord();
    renderPair();
    requestAnimationFrame(() => (document.querySelector("#reason") || document.querySelector("#commit-pair"))?.focus());
  }));
  bindRadioArrowKeys(".confidence-options");
  const reason = document.querySelector("#reason");
  if (reason) reason.addEventListener("input", () => {
    draft.reasonText = reason.value;
    draft.reasonAt = nowIso();
    saveRecord();
    const button = document.querySelector("#commit-pair");
    if (button) button.disabled = draft.reasonText.trim().length < 8;
  });
  document.querySelector("#commit-pair").addEventListener("click", () => commitPair(trial, draft));
}

function commitPair(trial, draft) {
  if (!draft.choiceWorkId || !draft.confidence) return;
  if (trial.reasonPrompted && draft.reasonText.trim().length < 8) return;
  const layout = layoutSnapshot(trial);
  const first = trial.leftWorkId;
  const chosenFirst = draft.choiceWorkId === first;
  const bothSeenMs = draft.bothSeenAt ? new Date(draft.bothSeenAt).getTime() : draft.renderedEpochMs;
  const choiceMs = draft.choiceAt ? new Date(draft.choiceAt).getTime() : Date.now();
  const committedAt = nowIso();
  const result = {
    trialId: trial.trialId,
    pairId: trial.pairId,
    displayIndex: trial.displayIndex,
    repeatOf: trial.repeatOf,
    logicalSlots: [
      { slot: "first", workId: trial.leftWorkId },
      { slot: "second", workId: trial.rightWorkId },
    ],
    contextCondition: trial.context,
    contextAssignmentUnit: trial.contextAssignmentUnit,
    contextPayloadHash: trial.contextPayloadHash,
    reasonPrompted: trial.reasonPrompted,
    reasonDraw: trial.reasonDraw,
    reasonAlgorithmVersion: trial.reasonAlgoVersion,
    renderedAt: draft.renderedAt,
    firstSeenAtByWork: draft.firstSeenAtByWork,
    bothSeenAt: draft.bothSeenAt,
    choiceWorkId: draft.choiceWorkId,
    choiceSlot: chosenFirst ? "first" : "second",
    choicePhysicalPosition: chosenFirst ? layout.firstPhysical : layout.secondPhysical,
    choiceAt: draft.choiceAt,
    choiceRtMs: Math.max(0, choiceMs - bothSeenMs),
    choiceChanges: draft.choiceChanges,
    confidence: draft.confidence,
    confidenceAt: draft.confidenceAt,
    reasonStatus: trial.reasonPrompted ? "collected" : "not_sampled",
    reasonText: trial.reasonPrompted ? draft.reasonText.trim() : null,
    reasonAt: trial.reasonPrompted ? draft.reasonAt : null,
    reasonCharCount: trial.reasonPrompted ? draft.reasonText.trim().length : 0,
    layoutAtRender: draft.layoutAtRender,
    layoutAtChoice: layout,
    layoutEvents: draft.layoutEvents,
    committedAt,
  };
  record.pairwise.trials.push(result);
  record.pairwise.draft = null;
  addEvent("trial_commit", { trialId: trial.trialId, choiceWorkId: draft.choiceWorkId });
  saveRecord();
  window.scrollTo({ top: 0, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  renderPair();
}

function renderAiIntro() {
  setHtml(shell(`
    <section class="hero">
      <span class="eyebrow">모든 작품 선택이 끝났습니다</span>
      <h1 tabindex="-1">이제 이미지의 인상을 따로 묻습니다</h1>
      <p class="lead">앞에서 무엇을 선택했는지는 보여 주지 않습니다. 작품을 한 점씩 보며 이미지가 어떻게 느껴지는지 1~7단계로 답합니다.</p>
      <div class="notice neutral">이것은 연구용 이미지 인상 문항이며 작품 점수나 성적 평가가 아닙니다. 자기 작품 재평가를 모두 확정한 뒤에만 제시합니다.</div>
      <button id="start-ai" class="primary large">이미지 인상 응답 시작</button>
    </section>
  `, { step: "5 / 6 · 연구용 이미지 인상", title: "이미지 인상 응답" }), "h1");
  document.querySelector("#start-ai").addEventListener("click", () => {
    record.status = "ai";
    record.aiRatings.startedAt ||= nowIso();
    addEvent("ai_rating_start");
    saveRecord();
    render();
  });
}

function ensureAiDraft(item) {
  if (record.aiRatings.draft && record.aiRatings.draft.workId === item.workId) return record.aiRatings.draft;
  record.aiRatings.draft = { workId: item.workId, answers: {}, cue: null, startedAt: nowIso() };
  saveRecord();
  return record.aiRatings.draft;
}

function renderAi() {
  const completed = record.aiRatings.items.length;
  if (completed >= RATING_PLAN.length) {
    record.aiRatings.submittedAt ||= nowIso();
    record.aiRatings.draft = null;
    record.status = "done";
    saveRecord();
    render();
    return;
  }
  const item = RATING_PLAN[completed];
  const work = WORK_BY_ID.get(item.workId);
  const draft = ensureAiDraft(item);
  const needsCue = Number(draft.answers.ai_like) >= 5 || Number(draft.answers.ai_trace) >= 5;
  const complete = AI_RATING_ITEMS.every((question) => Number(draft.answers[question.id]) >= 1) && (!needsCue || draft.cue);

  setHtml(shell(`
    <section class="single-head"><span class="eyebrow">개별 작품 ${completed + 1} / ${RATING_PLAN.length}</span><h1 tabindex="-1">한 작품의 인상</h1></section>
    <div class="notice neutral">아래 응답은 작품 점수나 성적이 아니라 연구용 이미지 인상 측정입니다.</div>
    <div class="single-work">
      <img src="${work.image}" alt="익명 작품 이미지" />
      ${item.context === "image_context" ? `<div class="work-context"><b>「${escapeHtml(work.title)}」</b><small>${escapeHtml(work.relic)}</small><p>${escapeHtml(work.captionText)}</p></div>` : ""}
    </div>
    <form id="ai-form">
      ${AI_RATING_ITEMS.map((question, index) => `<fieldset class="survey-item"><legend><span>${index + 1}</span>${escapeHtml(question.text)}</legend>
        <div class="answer-options seven" role="radiogroup" aria-label="${escapeHtml(question.text)}">${Array.from({ length: 7 }, (_, i) => `<button type="button" role="radio" aria-checked="${draft.answers[question.id] === i + 1}" tabindex="${draft.answers[question.id] === i + 1 || (!draft.answers[question.id] && i === 0) ? "0" : "-1"}" class="${draft.answers[question.id] === i + 1 ? "selected" : ""}" data-ai-item="${question.id}" data-value="${i + 1}"><b>${i + 1}</b>${i === 0 ? "<small>전혀 그렇지 않다</small>" : i === 6 ? "<small>매우 그렇다</small>" : ""}</button>`).join("")}</div>
      </fieldset>`).join("")}
      ${needsCue ? `<fieldset class="survey-item cue"><legend>그렇게 느낀 가장 큰 근거는 무엇입니까?</legend><div class="cue-options" role="radiogroup" aria-label="AI 이미지처럼 느낀 가장 큰 근거">${AI_CUE_OPTIONS.map((cue, index) => `<button type="button" role="radio" aria-checked="${draft.cue === cue.value}" tabindex="${draft.cue === cue.value || (!draft.cue && index === 0) ? "0" : "-1"}" class="${draft.cue === cue.value ? "selected" : ""}" data-cue="${cue.value}">${escapeHtml(cue.label)}</button>`).join("")}</div></fieldset>` : ""}
      <div class="action-bar"><button class="primary" type="submit" ${complete ? "" : "disabled"}>${completed + 1 >= RATING_PLAN.length ? "평가 마치기" : "저장하고 다음 작품 →"}</button><span>앞의 쌍대선택 결과는 표시되지 않습니다.</span></div>
    </form>
  `, { step: "5 / 6 · AI다움 사후 측정", title: "이미지 인상 응답" }), "h1");

  document.querySelectorAll("[data-ai-item]").forEach((button) => button.addEventListener("click", () => {
    const itemId = button.dataset.aiItem;
    const value = Number(button.dataset.value);
    draft.answers[itemId] = value;
    saveRecord();
    renderAi();
    requestAnimationFrame(() => document.querySelector(`[data-ai-item="${itemId}"][data-value="${value}"]`)?.focus({ preventScroll: true }));
  }));
  document.querySelectorAll("[data-cue]").forEach((button) => button.addEventListener("click", () => {
    const cueValue = button.dataset.cue;
    draft.cue = cueValue;
    saveRecord();
    renderAi();
    requestAnimationFrame(() => document.querySelector(`[data-cue="${cueValue}"]`)?.focus({ preventScroll: true }));
  }));
  bindRadioArrowKeys(".answer-options, .cue-options");
  document.querySelector("#ai-form").addEventListener("submit", (event) => {
    event.preventDefault();
    if (!complete) return;
    record.aiRatings.items.push({
      workId: item.workId,
      contextCondition: item.context,
      contextPayloadHash: PLAN.contextPayloadHashByWork[item.workId],
      answers: { ...draft.answers },
      cue: needsCue ? draft.cue : "not_required",
      startedAt: draft.startedAt,
      submittedAt: nowIso(),
    });
    record.aiRatings.draft = null;
    addEvent("ai_rating_commit", { workId: item.workId });
    saveRecord();
    window.scrollTo({ top: 0 });
    renderAi();
  });
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(record, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "pairwise-prototype-record.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

function renderDone() {
  setHtml(shell(`
    <section class="hero done">
      <span class="eyebrow">RECORD COMPLETE</span>
      <h1 tabindex="-1">모든 응답을 마쳤습니다</h1>
      <p class="lead">선택 결과나 개인 순위는 학생에게 보여 주지 않습니다. 이 프로토타입에서는 저장될 연구 로그 구조만 내려받아 확인할 수 있습니다.</p>
      <div class="summary-grid">
        <article><b>${record.pre.submittedAt ? PRE_SURVEY_ITEMS.length : 0}</b><span>사전설문 응답</span></article>
        <article><b>${Number(!!record.selfAssessment.before.submittedAt) + Number(!!record.selfAssessment.after.submittedAt)}</b><span>내 작품 자기평가</span></article>
        <article><b>${record.pairwise.trials.length}</b><span>저장된 비교판단</span></article>
        <article><b>${record.aiRatings.items.length}</b><span>연구용 이미지 인상</span></article>
        <article><b>${record.events.length}</b><span>과정 이벤트</span></article>
      </div>
      <button id="download-json" class="primary large">검토용 JSON 내려받기</button>
      <p class="help">학번·이름·별명은 포함하지 않은 가상 자료입니다.</p>
    </section>
  `, { step: "6 / 6 · 완료", title: "응답 완료" }), "h1");
  document.querySelector("#download-json").addEventListener("click", downloadJson);
}

function announce(message, error = false) {
  let node = document.querySelector("#live-message");
  if (!node) {
    node = document.createElement("div");
    node.id = "live-message";
    node.className = error ? "live error" : "live";
    node.setAttribute("role", error ? "alert" : "status");
    document.body.appendChild(node);
  }
  node.textContent = message;
  setTimeout(() => node.remove(), 3500);
}

function render() {
  const stage = record.status || "pre";
  if (stage === "pre") renderPre();
  else if (stage === "selfBefore") renderSelfBefore();
  else if (stage === "intro") renderIntro();
  else if (stage === "pair") renderPair();
  else if (stage === "selfAfter") renderSelfAfter();
  else if (stage === "aiIntro") renderAiIntro();
  else if (stage === "ai") renderAi();
  else renderDone();
}

window.addEventListener("resize", () => {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (record.status !== "pair" || !record.pairwise.draft) return;
    const trial = PLAN.trials[record.pairwise.trials.length];
    if (!trial) return;
    const snapshot = layoutSnapshot(trial);
    record.pairwise.draft.layoutEvents.push({ at: nowIso(), ...snapshot });
    addEvent("layout_change", { trialId: trial.trialId, axis: snapshot.axis });
    saveRecord();
  }, 180);
});

window.addEventListener("pagehide", saveRecord);
render();
