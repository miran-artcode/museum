/* ============================================================
   적응형 쪽지시험(미술사·미술이론 선택형) 핵심 계산 계층 — 화면과 Firebase에 기대지 않는 순수 함수

   무엇을 하는가
     · 라우팅(5문항 블록, 4/3/2 대칭 규칙)과 점수표(최종급 F + 총 정답 c)
     · 학생별 결정론 추출 — seed(학번·seedSalt)로 (급, 영역) 칸을 섞고 AREA_MIX 순서로 뽑는다.
       같은 seed·같은 served 이면 교사 화면이 같은 추출을 재현해 기록과 대조한다(불일치 표시)
     · 채점 — 학생 브라우저 가채점(keyHash)과 교사 재계산(정답 키·정정) 두 갈래가 같은 함수를 쓴다
     · 사후 통계(문항·쌍둥이·급 단조성·신뢰도 기술 통계), 응시 기록표, 연구용 CSV, 은행 검증·분리, 표본 자료

   측정 규칙의 원본과 구현 계약은 쪽지시험_구현_근거.md(§1~§4 규칙, §8.2 재현 계약)이다.
   이 파일의 상수는 그 문서의 결정을 그대로 옮긴 것이다. 문구는 CLAUDE.md 한국어 규칙(줄표 금지)을 따른다.
   ============================================================ */

export const QUIZ_VER = "q1";
export const LEVELS = [1, 2, 3, 4, 5];
export const START_LEVEL = 3;
export const BLOCKS = 4;
export const BLOCK_SIZE = 5;
export const LEVEL_NAMES = { 1: "용어 인지", 2: "사실 연결", 3: "개념 이해", 4: "익숙한 사례 적용", 5: "처음 보는 사례 적용" };
export const LEVEL_WORDS = { 1: "가장 낮은 단계", 2: "낮은 단계", 3: "가운데 단계", 4: "높은 단계", 5: "가장 어려운 단계" };
export const AREAS = { 1: "미술사의 흐름", 2: "사물·흔적·환유", 3: "이미지와 증거", 4: "관찰·사회·전시·비평" };
/* 급별 블록 안 영역 ①②③④ 문항 수 (쪽지시험_구현_근거.md §5.2). 5급은 ④를 빼고 ②③을 두 배로 둔다 */
export const AREA_MIX = { 1: [2, 1, 1, 1], 2: [2, 1, 1, 1], 3: [2, 1, 1, 1], 4: [2, 1, 1, 1], 5: [1, 2, 2, 0] };
/* 반(half)당 칸 최소 문항 수 (쪽지시험_구현_근거.md §5.3): 급별 최대 방문 블록 수 × 블록당 영역 문항 수 이상이면 어떤 경로에도 반복이 없다 */
export const CELL_MIN = { 1: [4, 2, 2, 2], 2: [7, 3, 3, 3], 3: [9, 4, 4, 4], 4: [7, 3, 3, 3], 5: [2, 5, 5, 0] };
export const LEVEL_SEC = { 1: 40, 2: 50, 3: 70, 4: 90, 5: 120 };   // 문항당 권장 초
export const BLOCK_END_MIN = [7, 15, 25, 35];                       // 블록별 권장 종료 (시작 후 분)
export const ROUTE_UP = 4, ROUTE_DOWN = 2;                          // 정답 4 이상 상승, 2 이하 하강, 3 유지
export const MIN_ANSWERED = 10;                                     // 이보다 적게 응답하면 E 2점
export const STEM_MAX = { 1: 60, 2: 80, 3: 120, 4: 160, 5: 220 };  // 문두 글자 상한
export const CASE_MAX_5 = 140;                                      // 5급 사례 서술 상한(문항 필드 caseLen 로 검사)
export const MAX_EVENTS = 300;
export const IMAGE_MAX = 12;           // 은행 전체 이미지 문항 상한(§5.6, 8%)
/* 급별 설계 목표 정답률과 사후 통계의 기대 범위 (쪽지시험_구현_근거.md §2.2, §6.1) */
export const LEVEL_TARGET_P = { 1: 0.85, 2: 0.75, 3: 0.60, 4: 0.50, 5: 0.40 };
export const LEVEL_P_RANGE = { 1: [0.75, 0.95], 2: [0.65, 0.90], 3: [0.50, 0.80], 4: [0.40, 0.70], 5: [0.30, 0.60] };
export const ITEM_STAT_MIN_N = 5;      // 노출이 이보다 적으면 회색(해석 보류)
export const ITEM_FLAG_MIN_N = 8;      // 판정 표시는 이 이상에서만
export const TWIN_DIFF = 0.30;         // 쌍둥이 정답률 차가 이 이상이면 표시
export const SHORT_BLUR_N = 5;         // 2초 미만 이탈이 이 횟수 이상이면 「짧은 이탈 반복」

/* 학생·학부모에게 그대로 보여 줄 다섯 문장 (쪽지시험_구현_근거.md §1) */
export const RULE_SENTENCES = [
  "5문항씩 4블록, 모두 20문항을 40분 안에 풉니다. 모든 학생이 가운데 급인 3급에서 시작합니다.",
  "한 블록에서 4개 이상 맞히면 다음 블록은 한 급 어려워지고, 3개면 그대로, 2개 이하면 한 급 쉬워집니다(가장 쉬운 1급과 가장 어려운 5급이 끝입니다).",
  "마지막 블록에서 어느 급에 있었는지가 등급(A~E)을 정합니다. 단, 마지막 블록에서 2개 이하를 맞히면 한 급 내려간 급이 최종급이고, 풀어 보지 않은 급으로 올려 주지는 않습니다.",
  "20문항 중 맞힌 수가 등급 안의 점수를 정합니다. 빈칸은 오답과 같고 감점은 없으니 모르는 문항도 반드시 답하세요.",
  "시험 중에는 현재 급과 정답 여부를 보여 주지 않고, 시험이 끝나면 급 경로·블록별 정답 수·점수표의 내 행·화면 이탈 기록을 모두 공개합니다. 다른 창으로 나가면 기록되고, 세 번째에는 시험이 잠겨 선생님이 풀어 줍니다.",
];

/* 경고 한도가 3이 아닐 때의 다섯 문장. 다섯째 문장의 「세 번째」만 한도에 맞춘다 */
const ORDINAL = { 2: "두 번째", 3: "세 번째", 4: "네 번째", 5: "다섯 번째" };
export function ruleSentences(warnLimit) {
  const lim = Number(warnLimit) || 3;
  if (lim === 3) return RULE_SENTENCES;
  return RULE_SENTENCES.map((t, i) => (i === 4 ? t.replace("세 번째에는", (ORDINAL[lim] || lim + "번째") + "에는") : t));
}

/* 이탈 기록의 종류를 학생·교사 화면에 우리말로 보인다 (쪽지시험_구현_근거.md §7.2) */
export const EVENT_LABELS = {
  blur: "창 전환", blur_short: "짧은 창 전환", fs_exit: "전체화면 벗어남", devtools_key: "개발자 도구 단축키", blocked_key: "막힌 단축키",
  blocked_action: "막힌 동작", mouseleave: "마우스 이탈", resize: "창 크기 변화", dup: "중복 접속", reconnect: "다시 접속", lock: "잠금",
};
export const eventLabel = (type) => EVENT_LABELS[type] || String(type || "");

/* 산출표 (쪽지시험_구현_근거.md §4.2). 위에서부터 F가 같고 c >= cMin 인 첫 행이 점수다 */
export const SCORE_ROWS = [
  { F: 5, cMin: 18, score: 10, band: "A" },
  { F: 5, cMin: 16, score: 9, band: "A" },
  { F: 5, cMin: 14, score: 8, band: "A" },
  { F: 4, cMin: 14, score: 7, band: "B" },
  { F: 4, cMin: 0, score: 6, band: "B" },
  { F: 3, cMin: 0, score: 5, band: "C" },
  { F: 2, cMin: 0, score: 4, band: "D" },
  { F: 1, cMin: 9, score: 3, band: "E" },
  { F: 1, cMin: 0, score: 2, band: "E" },
];
/* 경계 ①: c가 자기 행의 경계(F=5: 18·16·14, F=4: 14, F=1: 9)에서 ±1 */
export const SCORE_BOUNDS = { 5: [18, 16, 14], 4: [14], 3: [], 2: [], 1: [9] };
/* 결과 표시(flags)의 고정 순서 (쪽지시험_구현_근거.md §6.2) */
export const FLAG_ORDER = ["boundary1", "boundary2", "boundary3", "pathSensitive", "mismatch", "incomplete", "dup", "shortBlur"];
export const FLAG_LABELS = {
  boundary1: "경계 ① 점수", boundary2: "경계 ② 라우팅", boundary3: "경계 ③ 미응답", pathSensitive: "경로 민감",
  mismatch: "불일치", incomplete: "미완료", dup: "중복 접속", shortBlur: "짧은 이탈 반복",
};

/* 신뢰도 화면 고정 문구 (쪽지시험_구현_근거.md §6.4 6번) */
export const RELIABILITY_NOTE =
  "한 학급 25명의 결과로는 문항 난이도를 확정할 수 없다(정답률 표준오차 약 .10, 상관 표준오차 약 ±.2). " +
  "이 통계는 다음 해 문항을 고치는 데 쓰며 이 학급의 점수를 바꾸는 근거가 아니다. " +
  "5문항 블록 하나의 이동 판정은 오차가 크며(p=.7일 때 정답 수 표준편차 1.02), 등급 판정에는 ±1등급 오차가 있을 수 있다.";

/* 기본 설정 (쪽지시험_구현_근거.md §8.1). 제한 시간 40분은 화면에서 고정 표시하고 설정으로 바꾸지 않는다 */
export const DEFAULT_QUIZ = {
  stage: "closed",        // "closed" | "open" | "ended" | "published"
  openedAtMs: 0,          // stage를 open으로 바꾼 교사 브라우저 시각 Date.now() (규칙이 시작 마감 계산에 씀)
  startDeadlineSec: 900,  // 열린 뒤 이 시간 안에만 새로 시작할 수 있다
  durationSec: 2400,      // 개인 제한 시간 (40분)
  warnLimit: 3,           // 이 횟수의 경고에 잠금
  paused: false, pausedAtMs: 0, pausedAccumSec: 0,   // 전체 일시정지
  timeMult: {},           // { [학번]: 1.5 | 2 }  없으면 1
  noImage: {},            // { [학번]: true }  이미지 문항 제외
  disabled: [],           // 비활성 문항 id 목록
  seatGrid: "",           // 좌석표 텍스트. 줄 = 행, 칸은 공백/쉼표 구분, 빈자리는 "-"
  bankVer: "",            // 올린 은행 버전 (quizBank/v1.ver 와 같아야 함)
  title: "미술사와 미술이론 쪽지시험",
  updatedAt: "",
};
export const quizCfg = (cfgAll) => ({ ...DEFAULT_QUIZ, ...((cfgAll && cfgAll.quiz) || {}) });
export const QUIZ_STAGES = [
  { k: "closed", label: "닫힘" }, { k: "open", label: "열기" }, { k: "ended", label: "시작 마감" }, { k: "published", label: "결과 공개" },
];

/* ---------- 난수·해시·seed ---------- */

/* FNV-1a 32비트. src-assess-core의 stableHash와 같은 알고리즘이지만 모듈끼리 import하지 않는다(독립 배포) */
export function hash32(str) {
  let h = 2166136261;
  const s = String(str);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
/* cyrb53: 32비트 곱셈 해시 둘을 결합해 53비트 정수를 만든다. 문자열은 UTF-16 코드 단위로 처리한다 */
export function hash53(str, seed = 0) {
  const s = String(str);
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* 학생 seed. seedSalt는 은행 문서에 있어 stage가 closed일 때는 읽을 수 없다. 계산된 seed는 응시 문서에 기록한다 */
export const deriveSeed = (sid, seedSalt) => hash32(String(sid) + "|" + String(seedSalt == null ? "" : seedSalt));
/* 정답 해시. 보기가 4개뿐이라 네 번 해시하면 알아낼 수 있으므로 비밀이 아니다(문서에 정직하게 적는다).
   채점의 권위는 교사 재계산(quizKeys)에 있고 학생 화면의 점수는 가채점이다 */
export const keyHashOf = (itemId, optId, seedSalt) => hash53(String(itemId) + "|" + String(optId) + "|" + String(seedSalt == null ? "" : seedSalt)).toString(36);
export const isCorrect = (item, optId, seedSalt) => !!(item && optId != null && item.keyHash != null && keyHashOf(item.id, optId, seedSalt) === item.keyHash);
export function shuffled(arr, rng) {
  const out = [...(arr || [])];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
/* 보기 표시 순서: 문항 id를 seed에 섞어 파생하므로 같은 학생은 재접속해도 같은 순서를 본다 */
export const optionOrder = (seed, item) => shuffled(((item && item.options) || []).map((o) => o.id), mulberry32(((seed >>> 0) ^ hash32("opt|" + (item && item.id))) >>> 0));

/* ---------- 잡동사니 ---------- */

const cmp = (a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);
const trimStr = (v) => (typeof v === "string" ? v.trim() : "");
const pad2 = (n) => String(n).padStart(2, "0");
const isPick = (x) => x != null && x !== "";
const mean = (xs) => { const v = xs.filter((x) => Number.isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const median = (xs) => {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const r3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : "");
const cell = (v) => (v == null ? "" : v);
const pidFn = (pidOf) => (typeof pidOf === "function" ? pidOf : pidOf && typeof pidOf.get === "function" ? (sid) => pidOf.get(sid) : (sid) => (pidOf || {})[sid]);
/* 블록 맵은 Firestore에 "1"~"4" 문자열 키로 저장되지만 테스트·표본은 숫자 키를 쓸 수 있어 둘 다 받는다 */
const blockAt = (blocks, k) => (blocks ? (blocks[String(k)] != null ? blocks[String(k)] : blocks[k]) : null) || null;
const forEachBlock = (blocks, fn) => { for (let k = 1; k <= BLOCKS; k += 1) { const b = blockAt(blocks, k); if (b) fn(k, b); } };
const bankIndex = (bank) => { const m = new Map(); ((bank && bank.items) || []).forEach((it) => { if (it && it.id != null) m.set(String(it.id), it); }); return m; };
const toSet = (x) => (x instanceof Set ? x : new Set(Array.isArray(x) ? x.map(String) : x && typeof x === "object" ? Object.keys(x).filter((k) => x[k]) : []));
/* 정답 키: 평면 맵 { id: "a" } 또는 quizKeys 문서 { items: { id: { answer } } } 둘 다 받는다 */
function keyMapOf(keys) {
  if (!keys || typeof keys !== "object") return {};
  if (keys.items && typeof keys.items === "object" && !Array.isArray(keys.items)) {
    const m = {};
    Object.keys(keys.items).forEach((id) => { const e = keys.items[id]; m[id] = e && typeof e === "object" ? e.answer : e; });
    return m;
  }
  return keys;
}
/* 정정 목록: Set, 문자열 배열, [{ itemId, allCorrect }] 배열, quizKeys 문서(.corrections) 모두 받는다 */
function correctionSetOf(x) {
  if (!x) return new Set();
  if (x instanceof Set) return x;
  const list = Array.isArray(x) ? x : Array.isArray(x.corrections) ? x.corrections : [];
  const out = new Set();
  list.forEach((c) => {
    if (typeof c === "string") out.add(c);
    else if (c && c.itemId != null && c.allCorrect !== false) out.add(String(c.itemId));
  });
  return out;
}
/* 점이연 상관은 피어슨 상관과 같다(한쪽이 0/1) */
function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i += 1) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  if (!sxx || !syy) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/* 윌슨 95% 신뢰구간. p는 비율(0~1), n은 분모. 노출 3~10인 문항 정답률에 정규근사 대신 쓴다 */
export function wilson(p, n, z = 1.96) {
  if (!n || !Number.isFinite(p)) return [0, 1];
  const z2 = z * z;
  const c = (p + z2 / (2 * n)) / (1 + z2 / n);
  const h = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

export function fmtMMSS(sec) {
  const s = Math.max(0, Math.floor(Number.isFinite(sec) ? sec : 0));
  return pad2(Math.floor(s / 60)) + ":" + pad2(s % 60);
}

/* ---------- 좌석·반 ---------- */

/* 좌석표: 줄 = 행, 칸은 공백·쉼표·탭 구분, "-"·빈칸은 빈자리. 같은 학번이 두 번 나오면 dup에 적고 첫 자리를 쓴다 */
export function parseSeatGrid(text) {
  const grid = [], pos = {}, dup = [];
  String(text || "").split(/\r?\n/).forEach((line) => {
    if (!line.trim()) return;
    const row = line.trim().split(/[\s,]+/).map((t) => (t === "-" || t === "" ? "" : t));
    const r = grid.length;
    grid.push(row);
    row.forEach((sid, c) => {
      if (!sid) return;
      if (pos[sid]) { if (!dup.includes(sid)) dup.push(sid); return; }
      pos[sid] = { r, c };
    });
  });
  return { grid, pos, dup };
}
/* 반 = (행 + 열) mod 2, 0이면 A. 좌석표에 없으면 학번 마지막 숫자 홀짝(짝수 A)으로 대신하되 known:false 로 알린다
   (앞뒤좌우 이웃과 문항이 겹치지 않는다는 보장이 없어진다) */
export function halfOf(sid, cfg) {
  const { pos } = parseSeatGrid(cfg && cfg.seatGrid);
  const p = pos[String(sid)];
  if (p) return { half: (p.r + p.c) % 2 === 0 ? "A" : "B", known: true };
  const m = String(sid == null ? "" : sid).match(/\d(?!.*\d)/);
  const d = m ? Number(m[0]) : 0;
  return { half: d % 2 === 0 ? "A" : "B", known: false };
}

/* ---------- 라우팅·추출 ---------- */

export const routeNext = (level, correct) => (correct >= ROUTE_UP ? Math.min(5, level + 1) : correct <= ROUTE_DOWN ? Math.max(1, level - 1) : level);
/* 이동 부호: +1 상승, 0 유지, -1 하강 (끝 급에서 잘린 경우도 실제 결과로 센다) */
export const moveOf = (level, correct) => routeNext(level, correct) - level;
/* 마지막 블록의 최종급: 2개 이하면 한 급 내려가되 1급 아래로는 가지 않고, 위로는 올리지 않는다 */
export const finalLevelOf = (level, correct) => (correct <= ROUTE_DOWN ? Math.max(1, level - 1) : level);

/* 그 반의 문항을 (급, 영역) 칸으로 나눈다. 칸 안은 id 정렬이라 은행 파일의 순서와 무관하게 결정론이다 */
export function bankCells(bank, half) {
  const cells = {};
  ((bank && bank.items) || []).forEach((it) => {
    if (!it || it.half !== half) return;
    const key = it.level + "-" + it.area;
    (cells[key] = cells[key] || []).push(it);
  });
  Object.keys(cells).forEach((k) => cells[k].sort((a, b) => cmp(a.id, b.id)));
  return cells;
}
export const cellOrder = (seed, level, area, cell) => shuffled(cell || [], mulberry32(((seed >>> 0) ^ hash32("cell|" + level + "|" + area)) >>> 0));

/* 블록 추출. 칸을 ③ → ① → ② → ④ 순서(AREA_DRAW_ORDER)로 훑으며 used·disabled가 아닌 첫 항목들을 고른다.
   ③을 ①보다 먼저 훑는 까닭: CELL_MIN에서 2~4급 ③ 칸은 예비가 없고(방문 수 × 1) ① 칸은 예비가 하나 있다.
   ①을 먼저 훑어 이미지가 블록에 들어가면 ③의 이미지 문항이 건너뛰어져 마지막 방문에서 ③ 칸이 바닥나 반을 넘기게 되므로,
   예비가 없는 ③을 먼저 채워 이미지 건너뜀이 예비가 있는 ①에 떨어지게 한다(정상 경로에서 crossHalf가 나지 않는다).
   포인터 대신 used 집합을 쓰므로 급이 바뀌었다 돌아와도 이미 본 문항은 다시 나오지 않는다.
   이미지 규칙: 블록에 이미지 문항이 이미 하나 있거나 noImage면 이미지 문항은 소비하지 않고 건너뛴다(skipped).
   칸이 바닥나면 반대 반의 같은 칸(같은 seed 순서)에서 채우고 crossHalf:true. 그래도 모자라면 있는 만큼 돌려준다. */
export const AREA_DRAW_ORDER = [3, 1, 2, 4];
export function drawBlock({ bank, half, seed, level, used, disabled, noImage, k }) {
  const usedSet = toSet(used), disSet = toSet(disabled);
  const other = half === "A" ? "B" : "A";
  const mine = bankCells(bank, half), theirs = bankCells(bank, other);
  const mix = AREA_MIX[level] || AREA_MIX[START_LEVEL];
  const picked = [], skipped = [];
  let hasImage = false, crossHalf = false;
  const take = (cells, area, need) => {
    let got = 0;
    const order = cellOrder(seed, level, area, cells[level + "-" + area]);
    for (let i = 0; i < order.length && got < need; i += 1) {
      const it = order[i];
      const id = String(it.id);
      if (usedSet.has(id) || disSet.has(id) || picked.some((p) => p.id === id)) continue;
      if (it.image && (noImage || hasImage)) { skipped.push(id); continue; }
      picked.push(it); got += 1;
      if (it.image) hasImage = true;
    }
    return got;
  };
  for (const area of AREA_DRAW_ORDER) {
    const need = mix[area - 1];
    if (!need) continue;
    const got = take(mine, area, need);
    if (got < need) {
      const more = take(theirs, area, need - got);
      if (more > 0) crossHalf = true;
    }
  }
  const order = shuffled(picked, mulberry32(((seed >>> 0) ^ hash32("blk|" + k)) >>> 0));
  return { itemIds: order.map((it) => String(it.id)), crossHalf, skipped };
}
export function usedOf(served) {
  const s = new Set();
  Object.keys(served || {}).forEach((k) => { const b = served[k]; ((b && b.itemIds) || []).forEach((id) => s.add(String(id))); });
  return s;
}
const sameSet = (a, b) => { const A = new Set((a || []).map(String)), B = new Set((b || []).map(String)); if (A.size !== B.size) return false; for (const x of A) if (!B.has(x)) return false; return true; };

/* 교사 재현: path(급 경로)를 따라 블록마다 drawBlock을 돌려 served[k].itemIds와 집합으로 비교한다(표시 순서는 무시).
   used는 실제 served 기록을 누적한다. 어느 블록 하나가 어긋나도 뒤 블록은 독립으로 대조되어 어긋난 자리가 드러난다.
   비활성 목록은 재계산 시점의 것이라 추출 뒤에 비활성화한 문항이 served에 들어 있을 수 있다(served에는 당시 목록이 남지 않는다).
   그래서 블록마다 served[k]에 실제로 들어 있는 id는 비활성 목록에서 빼고 재현한다. 학생은 cfg.disabled에 id를 넣을 수 없으므로
   대조가 약해지지 않는다. 그런 블록이 집합까지 맞으면 warnings에 적어 둔다(불일치가 아니라 참고).
   추출 당시에는 비활성이었다가 뒤에 다시 활성화한 문항은 여전히 불일치로 잡힌다(알려진 한계) */
export function replayServed({ bank, half, seed, path, served, disabled, noImage }) {
  const expected = {}, mismatches = [], warnings = [];
  const disAll = toSet(disabled);
  const used = new Set();
  for (let k = 1; k <= BLOCKS; k += 1) {
    const s = blockAt(served, k);
    if (!s) break;
    const level = (path && path[k - 1]) || (Number.isInteger(s.level) ? s.level : START_LEVEL);
    const actual = (s.itemIds || []).map(String);
    const disabledServed = actual.filter((id) => disAll.has(id));
    const dis = disabledServed.length ? [...disAll].filter((id) => !disabledServed.includes(id)) : disAll;
    const d = drawBlock({ bank, half, seed, level, used, disabled: dis, noImage, k });
    expected[k] = d.itemIds;
    if (!sameSet(d.itemIds, actual) || (Number.isInteger(s.level) && s.level !== level)) {
      mismatches.push({ k, expected: d.itemIds, actual, level: { expected: level, actual: s.level } });
    } else if (disabledServed.length) {
      warnings.push({ k, disabledServed });
    }
    actual.forEach((id) => used.add(id));
  }
  return { ok: mismatches.length === 0, expected, mismatches, warnings };
}

/* ---------- 채점 ---------- */

const judgeOf = (keys, corrections) => {
  const km = keyMapOf(keys), cs = correctionSetOf(corrections);
  return (itemId, pick) => cs.has(String(itemId)) || (isPick(pick) && km[String(itemId)] != null && km[String(itemId)] === pick);
};
/* 블록 정답 수. answers[i] == null 은 오답. 정정(allCorrect) 문항은 답과 무관하게 정답 */
export function correctCount(block, keys, corrections) {
  const ok = judgeOf(keys, corrections);
  const ids = (block && block.itemIds) || [], ans = (block && block.answers) || [];
  let c = 0;
  ids.forEach((id, i) => { if (ok(id, ans[i])) c += 1; });
  return c;
}
/* 산출표: n < 10 이면 무조건 E 2점, 그 밖에는 F 행 안에서 c 로 점수.
   F=5 인데 c < 14 인 조합은 구조상 나오지 않는다(쪽지시험_구현_근거.md §4.3). 조작된 기록으로만 가능하므로 그 F의 가장 낮은 행으로 둔다 */
export function scoreOf(F, c, n) {
  if (!(n >= MIN_ANSWERED)) return { score: 2, band: "E" };
  const row = SCORE_ROWS.find((r) => r.F === F && c >= r.cMin);
  if (row) return { score: row.score, band: row.band };
  const low = SCORE_ROWS.filter((r) => r.F === F).pop();
  return low ? { score: low.score, band: low.band } : { score: 2, band: "E" };
}
export const scoreRowIndex = (F, c, n) => (!(n >= MIN_ANSWERED) ? -1 : SCORE_ROWS.findIndex((r) => r.F === F && c >= r.cMin));

/* 공통 채점기. path[k]는 블록 k의 급: 기록된 블록은 기록된 급, 없는 블록은 규칙(routeNext)대로 이어 정답 0으로 채운다.
   따라서 블록이 하나도 없으면 path=[3,2,1,1], F=1, c=0, n=0 이다 */
function scoreBlocks(blocks, isRight) {
  const path = [], blockCorrect = [], answered = [];
  let level = START_LEVEL, prev = 0;
  for (let k = 1; k <= BLOCKS; k += 1) {
    const b = blockAt(blocks, k);
    if (k > 1) level = b && Number.isInteger(b.level) ? b.level : routeNext(level, prev);
    else level = b && Number.isInteger(b.level) ? b.level : START_LEVEL;
    let c = 0, a = 0;
    if (b) {
      const ids = b.itemIds || [], ans = b.answers || [];
      ids.forEach((id, i) => { const pick = ans[i]; if (isPick(pick)) a += 1; if (isRight(id, pick)) c += 1; });
    }
    path.push(level); blockCorrect.push(c); answered.push(a); prev = c;
  }
  const c = blockCorrect.reduce((x, y) => x + y, 0), n = answered.reduce((x, y) => x + y, 0);
  const F = finalLevelOf(path[BLOCKS - 1], blockCorrect[BLOCKS - 1]);
  return { path, blockCorrect, F, c, n, ...scoreOf(F, c, n), answered };
}
export const scoreAttempt = ({ blocks, keys, corrections }) => scoreBlocks(blocks, judgeOf(keys, corrections));
/* 학생 브라우저 가채점: keyHash 로 정오를 센다 */
export function clientScoreOf({ blocks, bank }) {
  const idx = bankIndex(bank), salt = bank && bank.seedSalt;
  return scoreBlocks(blocks, (id, pick) => isCorrect(idx.get(String(id)), pick, salt));
}

/* 학생별 표시 (쪽지시험_구현_근거.md §6.2). 표시는 표시일 뿐 점수를 바꾸지 않는다 */
export function flagsOf(res, blocks, v) {
  const out = new Set();
  const bounds = SCORE_BOUNDS[res.F] || [];
  if (bounds.some((b) => Math.abs(res.c - b) <= 1)) out.add("boundary1");
  const edge = (res.blockCorrect || []).filter((x) => x === 3 || x === 4).length;
  if (edge >= 1) out.add("boundary2");
  if (res.n < BLOCKS * BLOCK_SIZE) out.add("boundary3");
  if (edge >= 2) out.add("pathSensitive");
  if (res.n < MIN_ANSWERED) out.add("incomplete");
  const events = (v && Array.isArray(v.events) ? v.events : []).filter(Boolean);
  if (events.filter((e) => e.type === "blur_short").length >= SHORT_BLUR_N) out.add("shortBlur");
  if (events.some((e) => e.type === "dup")) out.add("dup");
  if (Array.isArray(res.flags) && res.flags.includes("mismatch")) out.add("mismatch");
  return FLAG_ORDER.filter((f) => out.has(f));
}

/* 교사 재계산. 실제로 받은 문항과 실제 경로는 바꾸지 않고 c·F만 다시 센다(쪽지시험_구현_근거.md §4.6).
   정정(allCorrect)으로 블록 1~3 어느 곳에서든 이동이 원래보다 유리해졌으면(하강→유지, 유지→상승) F에 한 급을 더한다(최대 5).
   블록 4의 변화는 F 규칙에 이미 반영되므로 따로 더하지 않는다.
   불일치: seed로 재현한 추출이 served와 다르거나, blocks의 문항·급이 served·규칙과 다르거나, 가채점과 F·c·점수가 다르면 표시.
   가채점 대조는 정정 전 값(base)으로 한다. 학생 브라우저는 quizKeys(정정)를 읽지 못하고 keyHash로만 세므로 정정 뒤 값과 비교하면
   정정이 있는 학급에서는 대조를 꺼야 했고, 그러면 고쳐 쓴 가채점을 놓친다.
   notes: 불일치는 아니지만 교사가 알아 둘 참고(추출 뒤 비활성화한 문항이 든 블록 등) */
export function recompute({ attempt, bank, keys, corrections, disabled, cfg, now }) {
  const v = attempt || {};
  const blocks = v.blocks || {};
  const corr = corrections != null ? correctionSetOf(corrections) : correctionSetOf(keys);
  const base = scoreAttempt({ blocks, keys, corrections: null });
  const res = scoreAttempt({ blocks, keys, corrections: corr });
  let bonus = false;
  for (let k = 1; k <= BLOCKS - 1; k += 1) {
    if (!blockAt(blocks, k)) continue;
    if (routeNext(res.path[k - 1], res.blockCorrect[k - 1]) > routeNext(base.path[k - 1], base.blockCorrect[k - 1])) bonus = true;
  }
  if (bonus) {
    res.F = Math.min(5, res.F + 1);
    Object.assign(res, scoreOf(res.F, res.c, res.n));
  }
  const dis = disabled != null ? disabled : (cfg && cfg.disabled) || [];
  const noImage = v.noImage != null ? !!v.noImage : !!(cfg && cfg.noImage && cfg.noImage[v.sid]);
  const detail = [], notes = [];
  let servedBad = false, scoreBad = false;
  if (bank && v.served) {
    const rep = replayServed({ bank, half: v.half, seed: v.seed, path: res.path, served: v.served, disabled: dis, noImage });
    if (!rep.ok) { servedBad = true; rep.mismatches.forEach((m) => detail.push("블록 " + m.k + " 추출 불일치")); }
    (rep.warnings || []).forEach((w) => notes.push("블록 " + w.k + " 현재 비활성 문항 포함(추출 당시 활성): " + w.disabledServed.join(", ")));
  }
  // 급 대조는 정정 전 정답 수(base)로 한다. 학생이 실제로 밟은 경로는 정정 전 수로 정해졌으므로
  // 정정 뒤 수로 대조하면 정정 자체가 불일치로 잡힌다
  let level = START_LEVEL, prev = 0;
  forEachBlock(blocks, (k, b) => {
    const s = blockAt(v.served, k);
    if (s && !sameSet(s.itemIds, b.itemIds)) { servedBad = true; detail.push("블록 " + k + " 문항이 served와 다름"); }
    const expLevel = k === 1 ? START_LEVEL : routeNext(level, prev);
    if (Number.isInteger(b.level) && b.level !== expLevel) { servedBad = true; detail.push("블록 " + k + " 급 불일치(기록 " + b.level + ", 규칙 " + expLevel + ")"); }
    if (s && Number.isInteger(s.level) && s.level !== b.level) { servedBad = true; detail.push("블록 " + k + " 급이 served와 다름"); }
    level = base.path[k - 1]; prev = base.blockCorrect[k - 1];
  });
  const cs = v.clientScore;
  // 추출·문항 기록이 이미 어긋났다면 그 결과로 생긴 가채점 차이는 별도 변조로 세지 않는다.
  // served가 정상일 때만 clientScore 자체의 변조 여부를 독립적으로 판정한다.
  if (!servedBad && cs && (cs.F !== base.F || cs.c !== base.c || cs.score !== base.score)) {
    scoreBad = true;
    detail.push("가채점 불일치(학생 F" + cs.F + " c" + cs.c + " " + cs.score + "점, 정정 전 재계산 F" + base.F + " c" + base.c + " " + base.score + "점)");
  }
  const mismatch = servedBad || scoreBad ? { served: servedBad, score: scoreBad, detail: detail.join("; ") } : null;
  const flags = flagsOf({ ...res, flags: mismatch ? ["mismatch"] : [] }, blocks, v);
  return {
    path: res.path, blockCorrect: res.blockCorrect, F: res.F, c: res.c, n: res.n, score: res.score, band: res.band, answered: res.answered,
    flags, mismatch, notes, bonus, fBase: base.F, correctedIds: [...corr].filter((id) => Object.values(blocks).some((b) => b && (b.itemIds || []).map(String).includes(id))).sort(cmp),
    keyVer: (keys && keys.ver) || "", computedAt: now || new Date().toISOString(),
    warnCount: Number(v.warn) || 0, lockCount: (v.lock && Number(v.lock.count)) || 0,
  };
}

/* 공개용 문항 사본. 미시작 블록은 아무것도 넣지 않는다. 보기는 학생이 본 표시 순서(optionOrder) */
export function resultItems({ attempt, bank, keysDoc, seed }) {
  const v = attempt || {};
  const idx = bankIndex(bank);
  const km = keyMapOf(keysDoc), corr = correctionSetOf(keysDoc);
  const sd = seed != null ? seed : v.seed;
  const out = [];
  forEachBlock(v.blocks, (k, b) => {
    const ids = b.itemIds || [], ans = b.answers || [];
    ids.forEach((id, i) => {
      const it = idx.get(String(id)) || {};
      const opts = it.options || [];
      const byId = new Map(opts.map((o) => [o.id, o]));
      const order = optionOrder(sd, it.id != null ? it : { id, options: opts });
      const answer = km[String(id)] != null ? km[String(id)] : null;
      const pick = isPick(ans[i]) ? ans[i] : null;
      const kd = (keysDoc && keysDoc.items && keysDoc.items[id]) || {};
      out.push({
        k, id: String(id), level: it.level != null ? it.level : b.level, area: it.area != null ? it.area : null, stem: it.stem || "", image: it.image || null,
        options: order.map((oid) => { const o = byId.get(oid) || { id: oid, text: "" }; return { id: o.id, text: o.text }; }),
        pick, answer, correct: corr.has(String(id)) || (pick != null && answer != null && pick === answer), expl: kd.expl || "",
        corrected: corr.has(String(id)),
      });
    });
  });
  return out;
}

/* ---------- 사후 통계 ---------- */

/* 학생×문항 응답 평면 목록. 정오는 정정 없이 원래 정답 키로 센다(통계는 문항의 실제 작동을 보는 것이 목적).
   ms는 기록 그대로의 pickMs(블록 시작부터 마지막으로 답을 고른 시각까지의 누적 ms).
   gapMs는 문항별 응답 시간 근사: 블록 안의 pickMs를 오름차순으로 세워 앞 문항과의 간격(첫 문항은 pickMs 자체)이다.
   pickMs가 없는 문항은 null. 문항 통계의 중앙 초는 gapMs로 낸다(쪽지시험_구현_근거.md §6.1 「pickMs의 간격으로 근사」) */
function responsesOf(attempts, keys) {
  const km = keyMapOf(keys);
  const rows = [];
  Object.keys(attempts || {}).sort(cmp).forEach((sid) => {
    const v = attempts[sid] || {};
    const mine = [];
    forEachBlock(v.blocks, (k, b) => {
      const ids = b.itemIds || [], ans = b.answers || [], ms = b.pickMs || [];
      const order = ids.map((_, i) => i).filter((i) => Number.isFinite(ms[i])).sort((a, c) => ms[a] - ms[c]);
      const gap = {};
      let prev = 0;
      // Date.now() 해상도 안에서 연속 선택하면 두 기록이 같은 값일 수 있다. 응답한 문항의
      // 소요 시간이 0으로 오인되지 않도록 최소 관측 간격 1ms를 둔다.
      order.forEach((i) => { gap[i] = Math.max(1, ms[i] - prev); prev = ms[i]; });
      ids.forEach((id, i) => {
        const pick = isPick(ans[i]) ? ans[i] : null;
        mine.push({ sid, k, i, level: b.level, id: String(id), pick, correct: pick != null && km[String(id)] != null && km[String(id)] === pick,
          ms: Number.isFinite(ms[i]) ? ms[i] : null, gapMs: gap[i] != null ? gap[i] : null, auto: !!b.auto });
      });
    });
    const total = mine.filter((r) => r.correct).length;
    mine.forEach((r) => rows.push({ ...r, total }));
  });
  return rows;
}

/* 문항 통계 (쪽지시험_구현_근거.md §6.1). n<5 는 회색(few), 판정 표시는 n>=8 에서만 */
export function itemStats({ attempts, keysDoc, bank }) {
  const idx = bankIndex(bank);
  const per = {};
  responsesOf(attempts, keysDoc).forEach((r) => { (per[r.id] = per[r.id] || []).push(r); });
  const ids = new Set([...idx.keys(), ...Object.keys(per)]);
  return [...ids].sort(cmp).map((id) => {
    const it = idx.get(id) || {};
    const kd = (keysDoc && keysDoc.items && keysDoc.items[id]) || {};
    const level = it.level != null ? it.level : kd.level, area = it.area != null ? it.area : kd.area;
    const rows = per[id] || [];
    const n = rows.length;
    const nc = rows.filter((r) => r.correct).length;
    const p = n ? nc / n : null;
    const ci = n ? wilson(p, n) : [0, 1];
    const rpb = n >= 2 ? pearson(rows.map((r) => (r.correct ? 1 : 0)), rows.map((r) => r.total - (r.correct ? 1 : 0))) : null;
    const optIds = (it.options || []).length ? it.options.map((o) => o.id) : ["a", "b", "c", "d"];
    const answer = kd.answer != null ? kd.answer : null;
    const optShare = {};
    optIds.forEach((o) => { optShare[o] = n ? rows.filter((r) => r.pick === o).length / n : 0; });
    const blank = n ? rows.filter((r) => r.pick == null).length / n : 0;
    let topHalfWrong = null;
    if (n) {
      const top = rows.slice().sort((a, b) => b.total - a.total).slice(0, Math.ceil(n / 2));
      optIds.filter((o) => o !== answer).forEach((o) => {
        if (topHalfWrong == null && top.filter((r) => r.pick === o).length / top.length >= 0.5) topHalfWrong = o;
      });
    }
    const medianMs = median(rows.map((r) => r.gapMs));   // 누적 pickMs가 아니라 문항별 간격의 중앙값
    const flags = [];
    if (n < ITEM_STAT_MIN_N) flags.push("few");
    if (n >= ITEM_FLAG_MIN_N) {
      const range = LEVEL_P_RANGE[level];
      if (range && (p < range[0] || p > range[1])) flags.push("levelCheck");
      if (rpb != null && rpb < 0.10) flags.push("lowDisc");
      if ((rpb != null && rpb < 0) || topHalfWrong != null) flags.push("keyCheck");
      if (optIds.some((o) => o !== answer && optShare[o] < 0.05)) flags.push("deadOption");
      if (medianMs != null && LEVEL_SEC[level] && medianMs > 2 * LEVEL_SEC[level] * 1000) flags.push("longTime");
    }
    return { id, level, area, half: it.half != null ? it.half : kd.half, spec: it.spec != null ? it.spec : kd.spec, n, p, ci, rpb, optShare, blank, answer, topHalfWrong, flags, medianMs };
  });
}

/* 쌍둥이(같은 spec의 A·B) 정답률 차. 둘 다 n>=5 이고 차 >= .30 이면 표시 */
export function twinStats(stats) {
  const bySpec = {};
  (stats || []).forEach((s) => { if (s.spec == null) return; (bySpec[s.spec] = bySpec[s.spec] || {})[s.half] = s; });
  return Object.keys(bySpec).sort(cmp).map((spec) => {
    const a = bySpec[spec].A || null, b = bySpec[spec].B || null;
    const pk = (s) => (s ? { id: s.id, p: s.p, n: s.n } : null);
    const diff = a && b && a.p != null && b.p != null ? Math.abs(a.p - b.p) : null;
    const flag = !!(a && b && a.n >= ITEM_STAT_MIN_N && b.n >= ITEM_STAT_MIN_N && diff != null && diff >= TWIN_DIFF);
    return { spec, a: pk(a), b: pk(b), diff, flag };
  });
}

/* 급 단조성: 급별 평균 정답률(노출 가중)이 1 > 2 > 3 > 4 > 5 인지. 어긋나는 인접 급 쌍을 돌려준다 */
export function levelMonotonic(stats) {
  const sum = {}, cnt = {};
  (stats || []).forEach((s) => { if (!s.n || s.level == null) return; sum[s.level] = (sum[s.level] || 0) + s.p * s.n; cnt[s.level] = (cnt[s.level] || 0) + s.n; });
  const means = {};
  LEVELS.forEach((l) => { means[l] = cnt[l] ? sum[l] / cnt[l] : null; });
  const violations = [];
  for (let l = 1; l < 5; l += 1) if (means[l] != null && means[l + 1] != null && means[l] <= means[l + 1]) violations.push([l, l + 1]);
  return { means, violations };
}

/* 신뢰도 기술 통계 (쪽지시험_구현_근거.md §6.4). 계수 하나로 요약할 수 없는 적응형·25명 자료라 참고값만 낸다.
   block1.kr20: 블록 1(전원 3급)에서 문항별 정답률(노출 기준)로 Σpq 를 근사한 KR-20. 문항이 학생마다 달라 참고값이다.
   routingConsistent: 블록 4 규칙을 한 번 더 적용한 급이 F와 같은 비율.
   boundarySensitive: 문항 하나가 뒤집히면 점수가 바뀌는 학생 비율(같은 F에서 c±1, 마지막 블록 2·3, 앞 블록 3·4). */
export function reliabilityStats({ attempts, keys, corrections, results }) {
  const sids = Object.keys(attempts || {}).sort(cmp);
  const resOf = (sid) => (results && results[sid]) || scoreAttempt({ blocks: (attempts[sid] || {}).blocks, keys, corrections });
  const rs = responsesOf(attempts, keys).filter((r) => r.k === 1);
  const itemN = {}, itemC = {};
  rs.forEach((r) => { itemN[r.id] = (itemN[r.id] || 0) + 1; if (r.correct) itemC[r.id] = (itemC[r.id] || 0) + 1; });
  const b1 = {};
  rs.forEach((r) => { b1[r.sid] = b1[r.sid] || { score: 0, pq: 0 }; if (r.correct) b1[r.sid].score += 1; const p = (itemC[r.id] || 0) / itemN[r.id]; b1[r.sid].pq += p * (1 - p); });
  const b1s = Object.values(b1);
  const scores = b1s.map((x) => x.score);
  const mu = mean(scores);
  const varX = scores.length >= 2 ? scores.reduce((a, x) => a + (x - mu) ** 2, 0) / scores.length : 0;
  const kr20Raw = scores.length >= 2 && varX > 0 ? (BLOCK_SIZE / (BLOCK_SIZE - 1)) * (1 - mean(b1s.map((x) => x.pq)) / varX) : null;
  // 문항이 학생마다 다른 근삿값이라 음수는 가능하다. 다만 부동소수점 극한에서 생기는
  // 비유한값은 보고하지 않고, 이론상 상한인 1을 넘는 미세 오차는 1로 제한한다.
  const kr20 = Number.isFinite(kr20Raw) ? Math.min(1, kr20Raw) : null;
  const block1 = { n: b1s.length, mean: mu == null ? null : mu / BLOCK_SIZE, kr20 };
  let nR = 0, okR = 0, nB = 0, okB = 0;
  const halves = { A: { n: 0, sum: 0 }, B: { n: 0, sum: 0 } };
  sids.forEach((sid) => {
    const v = attempts[sid] || {};
    if (!v.blocks || !blockAt(v.blocks, 1)) return;
    const r = resOf(sid);
    nR += 1; if (routeNext(r.path[3], r.blockCorrect[3]) === r.F) okR += 1;
    nB += 1;
    const sameF = (c) => scoreOf(r.F, c, r.n).score !== r.score;
    const last = r.blockCorrect[3];
    const early = r.blockCorrect.slice(0, 3).some((x) => x === 3 || x === 4);
    if (sameF(r.c + 1) || sameF(r.c - 1) || last === 2 || last === 3 || early) okB += 1;
    const h = v.half === "B" ? "B" : "A";
    halves[h].n += 1; halves[h].sum += r.score;
  });
  const hA = { n: halves.A.n, mean: halves.A.n ? halves.A.sum / halves.A.n : null };
  const hB = { n: halves.B.n, mean: halves.B.n ? halves.B.sum / halves.B.n : null };
  const diff = hA.mean != null && hB.mean != null ? Math.abs(hA.mean - hB.mean) : null;
  return {
    block1,
    routingConsistent: { n: nR, rate: nR ? okR / nR : null },
    boundarySensitive: { n: nB, rate: nB ? okB / nB : null },
    halves: { A: hA, B: hB, diff, flag: diff != null && diff >= 1 },
    note: RELIABILITY_NOTE,
  };
}

/* 응시 기록표 (쪽지시험_구현_근거.md §6.3): 이의 답변의 유일한 자료. 문항 표·블록 표·요약·이탈 기록(오탐 표시 포함) */
export function recordSheet({ attempt, result, keysDoc, bank }) {
  const v = attempt || {};
  const idx = bankIndex(bank);
  const km = keyMapOf(keysDoc), corr = correctionSetOf(keysDoc);
  const res = result || scoreAttempt({ blocks: v.blocks, keys: km, corrections: corr });
  const rows = [], blocks = [];
  forEachBlock(v.blocks, (k, b) => {
    const ids = b.itemIds || [], ans = b.answers || [], ms = b.pickMs || [];
    ids.forEach((id, i) => {
      const it = idx.get(String(id)) || {};
      const pick = isPick(ans[i]) ? ans[i] : null;
      const answer = km[String(id)] != null ? km[String(id)] : null;
      rows.push({ k, i, level: it.level != null ? it.level : b.level, area: it.area != null ? it.area : null, id: String(id), pick, answer,
        correct: corr.has(String(id)) || (pick != null && answer != null && pick === answer), corrected: corr.has(String(id)), pickMs: Number.isFinite(ms[i]) ? ms[i] : null });
    });
    const level = res.path[k - 1], c = res.blockCorrect[k - 1];
    // 마지막 블록도 moveOf와 같이 실제 결과로 센다: 1급에서 2개 이하면 F는 그대로 1이므로 「유지」
    const mv = k === BLOCKS ? (finalLevelOf(level, c) < level ? "down" : "stay") : moveOf(level, c) > 0 ? "up" : moveOf(level, c) < 0 ? "down" : "stay";
    blocks.push({ k, level, correct: c, answered: res.answered ? res.answered[k - 1] : null, move: mv, auto: !!b.auto, at: b.at || null, blockMs: b.blockMs != null ? b.blockMs : null });
  });
  const fp = new Set((Array.isArray(v.falsePos) ? v.falsePos : []).map(Number));
  const events = (Array.isArray(v.events) ? v.events : []).map((e, i) => ({ i, ...(e || {}), falsePos: fp.has(i) }));
  const summary = {
    F: res.F, c: res.c, n: res.n, score: res.score, band: res.band, path: res.path, blockCorrect: res.blockCorrect, row: scoreRowIndex(res.F, res.c, res.n),
    flags: res.flags || [], half: v.half || null, seed: v.seed != null ? v.seed : null, timeMult: v.timeMult != null ? v.timeMult : 1, noImage: !!v.noImage,
    warn: Number(v.warn) || 0, lockCount: (v.lock && Number(v.lock.count)) || 0, pausedTotalSec: Number(v.pausedTotalSec) || 0,
    extraSec: Number(v.extraSec) || 0, extraReason: v.extraReason || "", finishedAt: v.finishedAt || null, status: v.status || null, note: v.note || "",
    reconnects: events.filter((e) => e.type === "reconnect").length,
  };
  return { rows, blocks, summary, events };
}

/* ---------- CSV (BOM·따옴표는 화면 쪽 downloadCsv가 붙인다) ---------- */

export function csvAttempts(attempts, results, pidOf) {
  const pid = pidFn(pidOf);
  // seed 는 학번과 은행 salt 의 해시라 익명 번호를 되돌릴 수 있으므로 연구 CSV 에 넣지 않는다
  const head = ["pid", "half", "status", "time_mult", "no_image", "finished_at", "path", "b1", "b2", "b3", "b4", "F", "c", "n", "score", "band", "flags",
    "warn", "lock_count", "paused_total_sec", "extra_sec", "n_events", "n_blur_short", "mismatch", "client_F", "client_c", "client_score", "bonus"];
  const rows = Object.keys(attempts || {}).sort(cmp).map((sid) => {
    const v = attempts[sid] || {}, r = (results && results[sid]) || null, cs = v.clientScore || {};
    const ev = Array.isArray(v.events) ? v.events.filter(Boolean) : [];
    const bc = (r && r.blockCorrect) || [];
    return [pid(sid), v.half, v.status, v.timeMult != null ? v.timeMult : 1, v.noImage ? 1 : 0, v.finishedAt,
      r ? (r.path || []).join(">") : "", bc[0], bc[1], bc[2], bc[3], r && r.F, r && r.c, r && r.n, r && r.score, r && r.band, r ? (r.flags || []).join("|") : "",
      Number(v.warn) || 0, (v.lock && v.lock.count) || 0, Number(v.pausedTotalSec) || 0, Number(v.extraSec) || 0, ev.length, ev.filter((e) => e.type === "blur_short").length,
      r && r.mismatch ? 1 : 0, cs.F, cs.c, cs.score, r && r.bonus ? 1 : 0].map(cell);
  });
  return { head, rows };
}
/* 한 행 = 학생×문항 */
export function csvResponses(attempts, keysDoc, pidOf) {
  const pid = pidFn(pidOf);
  const corr = correctionSetOf(keysDoc);
  const head = ["pid", "block", "level", "slot", "item_id", "area", "half", "spec", "pick", "answer", "correct", "corrected", "pick_ms", "auto"];
  const rows = responsesOf(attempts, keysDoc).map((r) => {
    const kd = (keysDoc && keysDoc.items && keysDoc.items[r.id]) || {};
    return [pid(r.sid), r.k, r.level, r.i, r.id, kd.area, kd.half, kd.spec, r.pick, kd.answer, r.correct ? 1 : 0, corr.has(r.id) ? 1 : 0, r.ms, r.auto ? 1 : 0].map(cell);
  });
  return { head, rows };
}
export function csvEvents(attempts, pidOf) {
  const pid = pidFn(pidOf);
  const head = ["pid", "i", "t", "type", "ms", "block", "item", "key", "action", "warn", "prep", "mlb", "false_pos"];
  const rows = [];
  Object.keys(attempts || {}).sort(cmp).forEach((sid) => {
    const v = attempts[sid] || {};
    const fp = new Set((Array.isArray(v.falsePos) ? v.falsePos : []).map(Number));
    (Array.isArray(v.events) ? v.events : []).forEach((e, i) => {
      if (!e) return;
      rows.push([pid(sid), i, e.t, e.type, e.ms, e.block, e.item, e.key, e.action, e.warn, e.prep ? 1 : 0, e.mlb ? 1 : 0, fp.has(i) ? 1 : 0].map(cell));
    });
  });
  return { head, rows };
}
export function csvItems(stats) {
  const head = ["item_id", "level", "area", "half", "spec", "n", "p", "ci_lo", "ci_hi", "rpb", "share_a", "share_b", "share_c", "share_d", "blank", "top_half_wrong", "flags", "median_ms"];
  const rows = (stats || []).map((s) => [s.id, s.level, s.area, s.half, s.spec, s.n, r3(s.p), r3(s.ci[0]), r3(s.ci[1]), r3(s.rpb),
    r3(s.optShare.a), r3(s.optShare.b), r3(s.optShare.c), r3(s.optShare.d), r3(s.blank), s.topHalfWrong, (s.flags || []).join("|"), s.medianMs].map(cell));
  return { head, rows };
}

/* ---------- 은행 검증·분리 ---------- */

const ID_RE = /^Q([1-5])([1-4])([AB])(\d{2})$/;
const OPT_IDS = ["a", "b", "c", "d"];

/* 은행 원본(quiz-bank/bank.json)을 검사한다. 오류(errors)가 있으면 올리지 않는다.
   문두 길이·쌍둥이 짝·부정 문두 급·5급 사례 길이는 작성 규칙이라 경고(warnings)로만 알린다.
   칸 부족은 최악 경로에서 문항이 반복될 수 있으므로 오류다 */
export function validateBank(bank) {
  const errors = [], warnings = [];
  const cells = { A: {}, B: {} };
  LEVELS.forEach((l) => [1, 2, 3, 4].forEach((a) => { cells.A[l + "-" + a] = 0; cells.B[l + "-" + a] = 0; }));
  if (!bank || typeof bank !== "object") return { ok: false, errors: ["은행 파일이 객체가 아닙니다"], warnings, cells };
  if (!trimStr(bank.ver)) errors.push("ver(은행 버전)가 없습니다");
  if (!trimStr(bank.seedSalt)) errors.push("seedSalt가 없습니다");
  const items = Array.isArray(bank.items) ? bank.items : [];
  if (!Array.isArray(bank.items) || !items.length) errors.push("items 배열이 없거나 비어 있습니다");
  const practice = Array.isArray(bank.practice) ? bank.practice : [];
  if (practice.length !== 2) errors.push("연습 문항은 2개여야 합니다(지금 " + practice.length + "개)");
  practice.forEach((p, i) => {
    const opts = Array.isArray(p && p.options) ? p.options : [];
    if (!p || !trimStr(p.id) || !trimStr(p.stem) || opts.length !== 4 || !opts.some((o) => o && o.id === p.answer)) errors.push("연습 문항 " + (i + 1) + ": id·문두·보기 4개·정답이 갖춰져야 합니다");
  });
  const seen = new Set(), specs = {}, imgCells = {};
  let imgTotal = 0;
  items.forEach((it, i) => {
    const tag = "문항 " + (it && it.id != null ? it.id : "#" + (i + 1));
    if (!it || typeof it !== "object") { errors.push(tag + ": 객체가 아닙니다"); return; }
    const id = trimStr(it.id);
    if (!id) { errors.push(tag + ": id가 없습니다"); return; }
    if (seen.has(id)) errors.push(tag + ": id가 겹칩니다");
    seen.add(id);
    const m = ID_RE.exec(id);
    if (!m) errors.push(tag + ": id 형식은 Q{급}{영역}{A|B}{두 자리}여야 합니다");
    if (!LEVELS.includes(it.level)) errors.push(tag + ": level은 1~5여야 합니다");
    if (![1, 2, 3, 4].includes(it.area)) errors.push(tag + ": area는 1~4여야 합니다");
    if (it.half !== "A" && it.half !== "B") errors.push(tag + ": half는 A 또는 B여야 합니다");
    if (m && (Number(m[1]) !== it.level || Number(m[2]) !== it.area || m[3] !== it.half)) errors.push(tag + ": id의 급·영역·반이 필드와 다릅니다");
    const opts = Array.isArray(it.options) ? it.options : [];
    if (opts.length !== 4) errors.push(tag + ": 보기는 4개여야 합니다");
    else {
      const ids = opts.map((o) => o && o.id);
      if (ids.join(",") !== OPT_IDS.join(",")) errors.push(tag + ": 보기 id는 a~d 순서여야 합니다");
      if (opts.some((o) => !o || !trimStr(o.text))) errors.push(tag + ": 빈 보기가 있습니다");
    }
    if (!opts.some((o) => o && o.id === it.answer)) errors.push(tag + ": answer가 보기에 없습니다");
    const stem = trimStr(it.stem);
    if (!stem) errors.push(tag + ": 문두가 비어 있습니다");
    else if (STEM_MAX[it.level] && stem.length > STEM_MAX[it.level]) warnings.push(tag + ": 문두가 " + STEM_MAX[it.level] + "자를 넘습니다(" + stem.length + "자)");
    if (it.image) {
      if (it.level === 5 || it.level === 1) errors.push(tag + ": " + it.level + "급에는 이미지를 둘 수 없습니다");
      if (!it.image.src || !String(it.image.src).startsWith("/img/lessons/")) errors.push(tag + ": 이미지 src는 /img/lessons/ 로 시작해야 합니다");
      if (!trimStr(it.image.alt)) warnings.push(tag + ": 이미지 대체 텍스트가 없습니다");
      if (it.area !== 1 && it.area !== 3) warnings.push(tag + ": 이미지는 ①③ 칸에만 둡니다");
    }
    if (it.level === 5 && it.area === 4) errors.push(tag + ": 5급에는 영역 ④를 두지 않습니다");
    if (it.neg && it.level < 3) warnings.push(tag + ": 부정 문두는 3급 이상에서만 씁니다");
    if (it.level === 5 && Number.isFinite(it.caseLen) && it.caseLen > CASE_MAX_5) warnings.push(tag + ": 5급 사례 서술이 " + CASE_MAX_5 + "자를 넘습니다(" + it.caseLen + "자)");
    if (it.half === "A" || it.half === "B") {
      const key = it.level + "-" + it.area;
      if (cells[it.half][key] != null) cells[it.half][key] += 1;
      if (it.image) { imgCells[it.half + ":" + key] = (imgCells[it.half + ":" + key] || 0) + 1; imgTotal += 1; }
    }
    if (trimStr(it.spec)) { const s = (specs[it.spec] = specs[it.spec] || { A: 0, B: 0 }); if (s[it.half] != null) s[it.half] += 1; }
    else warnings.push(tag + ": spec(쌍둥이 명세)이 없습니다");
  });
  Object.keys(specs).sort(cmp).forEach((sp) => {
    if (specs[sp].A !== 1 || specs[sp].B !== 1) warnings.push("명세 " + sp + ": A·B 각 1문항이어야 합니다(A " + specs[sp].A + ", B " + specs[sp].B + ")");
  });
  /* 이미지 문항 상한(쪽지시험_구현_근거.md §5.6): 반당 칸마다 최대 1개, 은행 전체 최대 IMAGE_MAX 개. 블록당 1개 규칙(drawBlock)이
     이미지 문항을 건너뛰므로 한 칸에 이미지가 둘이면 최악 경로에서 칸이 바닥나 반을 넘길 수 있다 */
  Object.keys(imgCells).sort(cmp).forEach((k) => { if (imgCells[k] > 1) warnings.push(k.replace(":", "반 ") + " 칸에 이미지 문항이 " + imgCells[k] + "개입니다(반당 칸마다 최대 1개)"); });
  if (imgTotal > IMAGE_MAX) warnings.push("이미지 문항이 " + imgTotal + "개입니다(은행 전체 최대 " + IMAGE_MAX + "개)");
  ["A", "B"].forEach((h) => LEVELS.forEach((l) => [1, 2, 3, 4].forEach((a) => {
    const need = CELL_MIN[l][a - 1], have = cells[h][l + "-" + a];
    if (have < need) errors.push(h + "반 " + l + "급 영역 " + a + " 칸이 모자랍니다(" + have + "/" + need + ")");
  })));
  return { ok: errors.length === 0, errors, warnings, cells };
}

/* 은행 원본을 공개부(quizBank/v1)와 정답부(quizKeys/v1)로 나눈다. 공개부에는 정답·해설·출처가 없다 */
export function splitBank(bankFile) {
  const b = bankFile || {};
  const salt = b.seedSalt == null ? "" : String(b.seedSalt);
  const items = Array.isArray(b.items) ? b.items : [];
  const pub = {
    ver: b.ver || "", seedSalt: salt, itemCount: items.length,
    practice: (Array.isArray(b.practice) ? b.practice : []).map((p) => ({ id: p.id, level: p.level, stem: p.stem, options: (p.options || []).map((o) => ({ id: o.id, text: o.text })), answer: p.answer, expl: p.expl || "" })),
    items: items.map((it) => ({
      id: it.id, level: it.level, area: it.area, half: it.half, spec: it.spec || "", stem: it.stem,
      options: (it.options || []).map((o) => ({ id: o.id, text: o.text })),
      keyHash: keyHashOf(it.id, it.answer, salt), image: it.image ? { src: it.image.src, alt: it.image.alt || "" } : null, neg: !!it.neg,
    })),
  };
  const keys = { ver: b.ver || "", seedSalt: salt, items: {}, corrections: [] };
  items.forEach((it) => {
    keys.items[it.id] = { answer: it.answer, expl: it.expl || "", src: it.src || null, level: it.level, area: it.area, half: it.half, spec: it.spec || "", tags: Array.isArray(it.tags) ? it.tags : [] };
  });
  return { pub, keys };
}

/* 남은 초 = durationSec × 배수 + pausedTotalSec + extraSec + pausedAccumSec − 경과.
   배수는 설정(cfg.timeMult)이 응시 문서보다 우선한다(교사가 시험 중에 배수를 줄 수 있고 규칙도 설정을 본다).
   잠금·전체 정지 중에는 호출자가 잠긴 시점 값을 고정 표시한다 */
export function remainingSec({ nowMs, startedAtMs, cfg, v, sid }) {
  const c = cfg || DEFAULT_QUIZ, d = v || {};
  const id = sid != null ? sid : d.sid;
  const cm = c.timeMult && id != null ? c.timeMult[id] : null;
  const mult = Number.isFinite(cm) && cm > 0 ? cm : Number.isFinite(d.timeMult) && d.timeMult > 0 ? d.timeMult : 1;
  const total = (Number(c.durationSec) || DEFAULT_QUIZ.durationSec) * mult + (Number(d.pausedTotalSec) || 0) + (Number(d.extraSec) || 0) + (Number(c.pausedAccumSec) || 0);
  const elapsed = Number.isFinite(nowMs) && Number.isFinite(startedAtMs) ? (nowMs - startedAtMs) / 1000 : 0;
  return Math.floor(total - elapsed);
}

/* ---------- 표본 (교사 화면 sampleMode · 테스트) ---------- */

/* 칸 크기표(sizes)대로 가짜 은행 원본을 만든다. 정답은 (급+영역+번호) mod 4 로 퍼뜨린다.
   images:true 면 2~4급 ①③ 칸의 첫 문항이 이미지 문항이다(설계의 반당 칸마다 최대 1개) */
export function makeSyntheticBank({ ver = "synthetic-v1", seedSalt = "synthetic-salt", sizes = CELL_MIN, images = false } = {}) {
  const items = [];
  LEVELS.forEach((level) => [1, 2, 3, 4].forEach((area) => ["A", "B"].forEach((half) => {
    const count = (sizes[level] || [0, 0, 0, 0])[area - 1] || 0;
    for (let nn = 1; nn <= count; nn += 1) {
      const id = "Q" + level + area + half + pad2(nn);
      const answer = OPT_IDS[(level + area + nn) % 4];
      const img = images && level >= 2 && level <= 4 && (area === 1 || area === 3) && nn === 1;
      items.push({
        id, level, area, half, spec: "S" + level + "-" + area + "-" + pad2(nn),
        stem: "[표본] " + level + "급 " + AREAS[area] + " " + half + "반 " + nn + "번 문항입니다. 가장 알맞은 것은?",
        options: OPT_IDS.map((o) => ({ id: o, text: "보기 " + o + (o === answer ? " (표본 정답)" : "") })),
        answer, image: img ? { src: "/img/lessons/sample.jpg", alt: "표본 도판" } : null, neg: false,
        expl: "표본 해설입니다.", src: { lesson: area, h: "표본", quote: "" }, tags: [],
      });
    }
  })));
  return {
    ver, seedSalt,
    practice: [
      { id: "P1", level: 1, stem: "연습 1: 「레디메이드」의 뜻으로 가장 알맞은 것은?", options: OPT_IDS.map((o) => ({ id: o, text: "연습 보기 " + o })), answer: "a", expl: "연습 해설입니다." },
      { id: "P2", level: 3, stem: "연습 2: 사진이 그림과 달리 「증거」로 읽히는 까닭의 핵심은?", options: OPT_IDS.map((o) => ({ id: o, text: "연습 보기 " + o })), answer: "a", expl: "연습 해설입니다." },
    ],
    items,
  };
}

/* 화면 구조를 보여 주기 위한 가상 학급. 급별 참 정답률 프로파일(쪽지시험_구현_근거.md §4.7)로 답을 뽑으므로
   결과표·문항 통계·신뢰도가 그럴듯한 값으로 채워진다. 같은 ids면 늘 같은 결과다 */
export function buildSampleQuiz(ids) {
  const sids = (ids || []).slice().sort(cmp);
  const { pub: bank, keys: keysDoc } = splitBank(makeSyntheticBank({ ver: "sample-2026", seedSalt: "sample-salt" }));
  const seatRows = [];
  for (let i = 0; i < sids.length; i += 5) seatRows.push(sids.slice(i, i + 5).join(" "));
  const T0 = Date.parse("2026-09-15T01:06:00.000Z");
  const cfg = { ...DEFAULT_QUIZ, stage: "published", openedAtMs: T0, bankVer: bank.ver, seatGrid: seatRows.join("\n"), updatedAt: "2026-09-15T02:00:00.000Z" };
  const PROFILES = [
    { 1: 0.97, 2: 0.95, 3: 0.92, 4: 0.88, 5: 0.80 }, { 1: 0.95, 2: 0.90, 3: 0.82, 4: 0.68, 5: 0.50 }, { 1: 0.90, 2: 0.80, 3: 0.62, 4: 0.45, 5: 0.35 },
    { 1: 0.85, 2: 0.65, 3: 0.45, 4: 0.35, 5: 0.28 }, { 1: 0.65, 2: 0.45, 3: 0.33, 4: 0.28, 5: 0.25 }, { 1: 0.95, 2: 0.92, 3: 0.88, 4: 0.80, 5: 0.70 },
  ];
  const km = keyMapOf(keysDoc);
  const attempts = {}, meta = {}, results = {};
  const iso = (ms) => new Date(ms).toISOString();
  sids.forEach((sid, si) => {
    const rnd = mulberry32(hash32("sample-quiz|" + sid));
    const prof = PROFILES[si % PROFILES.length];
    const half = halfOf(sid, cfg).half;
    const seed = deriveSeed(sid, bank.seedSalt);
    const startedAtMs = T0 + 30000 + si * 7000;
    const served = {}, blocks = {}, events = [];
    let level = START_LEVEL, t = startedAtMs, cur = 1, warn = 0, status = "running";
    const incomplete = si === sids.length - 1 && sids.length >= 3;   // 마지막 학생은 블록 3에서 시간 종료
    const locked = si === 2;                                         // 셋째 학생은 경고 3회로 잠겼다가 해제됨
    for (let k = 1; k <= BLOCKS; k += 1) {
      const d = drawBlock({ bank, half, seed, level, used: usedOf(served), disabled: cfg.disabled, noImage: false, k });
      served[String(k)] = { level, itemIds: d.itemIds, at: iso(t) };
      cur = k;
      const auto = incomplete && k === 3;
      const answers = [], pickMs = [];
      let c = 0, acc = 0;   // pickMs는 학생 화면과 같이 블록 시작부터의 누적 시각이다
      d.itemIds.forEach((id, i) => {
        if (auto && i >= 2) { answers.push(null); pickMs.push(null); return; }
        const right = rnd() < prof[level];
        const pick = right ? km[id] : OPT_IDS.filter((o) => o !== km[id])[Math.floor(rnd() * 3)];
        acc += Math.round(LEVEL_SEC[level] * 1000 * (0.5 + rnd()));
        answers.push(pick); pickMs.push(acc);
        if (pick === km[id]) c += 1;
      });
      const blockMs = acc + 15000;
      if (locked && k === 2) {
        [1, 2, 3].forEach((w) => events.push({ t: iso(t + 20000 * w), type: "blur", ms: 3000 + 500 * w, block: k, item: w, warn: w }));
        warn = 3;
        events.push({ t: iso(t + 70000), type: "lock", block: k, item: 3, warn: 3 });
      }
      if (si % 4 === 1 && k === 3) events.push({ t: iso(t + 9000), type: "blur_short", ms: 900, block: k, item: 2, warn });
      blocks[String(k)] = { level, itemIds: d.itemIds, answers, at: iso(t + blockMs), auto, blockMs, pickMs, correct: c };
      t += blockMs;
      if (auto) { status = "done"; break; }
      level = routeNext(level, c);
    }
    if (!incomplete) status = "done";
    const v = {
      ver: QUIZ_VER, sid, half, seed, bankVer: bank.ver, timeMult: 1, noImage: false, sess: "s" + pad2(si) + "smpl", status, cur,
      served, draft: {}, blocks, events, warn, lock: { count: locked ? 1 : 0, at: locked ? events[events.length - 1].t : null },
      finishedAt: iso(t), clientScore: null, client: { ua: "sample", w: 1366, h: 768 },
      pausedTotalSec: locked ? 90 : 0, extraSec: 0, extraReason: "", falsePos: [], note: "", resumeOk: false,
    };
    v.clientScore = clientScoreOf({ blocks, bank });
    attempts[sid] = v;
    meta[sid] = { startedAtMs, hbMs: t, lockedAtMs: null };
    const r = recompute({ attempt: v, bank, keys: keysDoc, cfg, now: "2026-09-15T09:00:00.000Z" });
    results[sid] = { ...r, published: true, publishedAt: "2026-09-15T09:05:00.000Z", items: resultItems({ attempt: v, bank, keysDoc, seed }) };
    v.result = results[sid];
  });
  return { attempts, bank, keysDoc, cfg, results, meta };
}
