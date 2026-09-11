/* ============================================================
   상호평가(쌍대비교) 핵심 계산 계층 — 화면과 Firebase에 기대지 않는 순수 함수

   무엇을 하는가
     · 최종 작품 제출 초안 만들기 (기록지 → 스냅샷)
     · 학급 전체 비교 배정표 만들기 — 결정론(같은 명단·seed면 같은 표), 자기 작품 제외,
       작품별 노출 균형, 좌우 위치 균형, 판정자 안 무순서쌍 중복 없음, 숨은 역순 반복 1회
     · Bradley–Terry(1952) 능력값 — Hunter(2004)의 MM 반복, 전승·전패 발산을 막는 가상 기준 작품 사전
     · 신뢰도 — 척도분리신뢰도(SSR, Pollitt 2012)와 판정자 반분(split-half) + 스피어만–브라운
     · 판정자 적합도 — infit/outfit 평균제곱(Rasch 계열), 역방향 판정률, 위치 편향, 판정 시간, 이유 중복
     · 결과 되돌려주기 — 순위·백분위·밴드, 자기예측과의 편향(bias)과 보정량(calib)
     · 연구용 CSV 행, 교사 화면 표본 자료

   왜 클라이언트에서 계산하는가
     서버 코드(Cloud Functions)를 두지 않는 구조라 교사 브라우저가 집계를 돌린다.
     작품 30점·판정 400건이면 MM 반복은 수 ms, 반분 25회도 1초 안이다.

   근거 문헌은 쌍대비교_구현_근거.md 에 정리한다. 이 파일의 상수는 그 문서의 결정을 그대로 옮긴 것이다.
   ============================================================ */

export const ASSESS_VER = "v1";
export const ROSTER_VER = "r1";

/* 평가 4축 — 자기평가와 결정적 축 태그가 같은 말을 쓴다 (src-anchor.jsx의 ANCHOR_TAGS와 동일한 키) */
export const CRITERIA = [
  { k: "veri", label: "이미지의 핍진성", desc: "유물 기록 사진의 형식(배경·조명·스케일)이 성립하는가" },
  { k: "cause", label: "흔적의 인과", desc: "닳고 부서지고 수리된 자리가 그 물건의 쓰임과 이어지는가" },
  { k: "plate", label: "작품 캡션의 작동", desc: "작품 캡션을 읽은 뒤 이미지의 읽기가 실제로 달라지는가" },
  { k: "voice", label: "문제의 전달", desc: "어떤 사회문제가 어떤 태도(고발·경고·공감·기록·질문)로 읽히는가" },
];

/* 자기평가 5문항 — 종합 1 + 4축. 종합 문항이 쌍대비교의 질문과 직접 맞닿는 주지표다 */
export const SELF_ITEMS = [
  { k: "overall", label: "종합 설득력", text: "이 작품은 실재한 적 없는 유물을 설득력 있게 성립시킨다 (이미지·작품 캡션·허구 고지가 함께 작동해서)." },
  { k: "veri", label: "이미지의 핍진성", text: "유물 기록 이미지의 형식인 배경·조명·스케일이 서로 어긋나지 않고 성립한다." },
  { k: "cause", label: "흔적의 인과", text: "마모·파손·오염·수리의 위치와 모습이 이 물건의 쓰임과 구체적으로 이어진다." },
  { k: "plate", label: "작품 캡션의 작동", text: "작품 캡션을 읽고 나면 이미지가 무엇을 뜻하는지 더 구체적으로 읽힌다." },
  { k: "voice", label: "문제의 전달", text: "작품이 다루는 사회문제와 태도(고발·경고·공감·기록·질문)를 작품 안에서 읽을 수 있다." },
];
export const SELF_LABELS = ["전혀 그렇지 않다", "그렇지 않은 편이다", "보통이다", "그런 편이다", "매우 그렇다"];
export const CONF_LABELS = ["전혀 확신하지 않음", "별로 확신하지 않음", "보통", "대체로 확신함", "매우 확신함"];
export const CHANGE_CODES = [
  { k: "shifted", label: "처음과 다르게 중요하게 본 기준이나 근거가 있음" },
  { k: "same", label: "처음과 비슷한 기준과 근거로 판단함" },
  { k: "unclear", label: "이유가 분명하지 않거나 기억나지 않음" },
  { k: "other", label: "그 밖의 이유" },
];

/* 결정적 축 태그 — 4축 + 「전체 인상」. 고른 뒤에 묻는 태그이므로 총체적 판단(Leech & Chambers 2022)을 억지로
   한 축에 끼워 넣지 않게 다섯째 보기를 둔다. 「노력」은 두지 않는다(AI 고지 감점의 통로가 노력 지각이다 — Bellaiche 2023·Magni 2023) */
export const TAG_OPTIONS = CRITERIA.concat([{ k: "whole", label: "전체 인상", desc: "어느 한 축이 아니라 전체가 그렇게 보였다" }]);

export const PEER_QUESTION =
  "두 작품 가운데, 실재한 적 없는 유물을 더 설득력 있게 성립시킨 쪽은 어디인가요? (이미지 · 작품 캡션 · 허구 고지가 함께 작동해서)";

export const STAGES = [
  { k: "closed", label: "닫힘" },
  { k: "submit", label: "제출" },
  { k: "self1", label: "자기평가 ①" },
  { k: "peer", label: "동료 비교" },
  { k: "self2", label: "자기평가 ②" },
  { k: "result", label: "결과 공개" },
];
export const STAGE_ORDER = STAGES.map((s) => s.k);
export const stageAtLeast = (stage, target) => STAGE_ORDER.indexOf(stage) >= STAGE_ORDER.indexOf(target);

/* 기본 설정. k=12·반복 1은 24~30명 학급에서 작품당 24회 노출을 만든다 — 작품당 20회 이상이면 SSR .80이
   일반적이라는 메타분석(Kinnear 외 2025; Verhavert 외 2019; Crompvoets 외 2020)에 맞춘 값이다. 교사는 10 아래로 내리지 않는다.
   확신도 버튼은 기본으로 끈다 — 강제선택에 등급 응답을 더하면 시간만 늘고 정확도는 늘지 않았다(Mantiuk 외 2012);
   대신 「판단이 어려웠다」 표시 하나를 늘 둔다. 이유 문장의 하한 10자는 빈칸·자리표시를 막는 선이고, 15자 미만은 표시(flag)로만 센다. */
export const DEFAULT_PEER = {
  stage: "closed", k: 12, repeat: 1, minSec: 5, minWhy: 10, askConf: false, reveal: "band", question: PEER_QUESTION,
};
export const K_FLOOR = 10;             // 교사 화면의 k 하한 (작품이 그보다 적으면 n−1로 잘린다)
export const peerCfg = (cfgAll) => ({ ...DEFAULT_PEER, ...((cfgAll && cfgAll.peer) || {}) });
export const MIN_WHY_CHANGE = 8;
export const REASON_MAX = 200;
export const FAST_MS = 5000;           // 이보다 빠른 판정은 「빠른 판정」으로 센다 (삭제하지 않는다)
export const DUP_SIM = 0.8;            // 이유 문장 2-gram 자카드가 이 이상이면 중복으로 본다
export const AGAINST_GAP = 0.5;        // θ 차가 이 이상인 쌍에서 반대로 고르면 역방향 판정
export const INFIT_BAND = [0.5, 1.5];  // Rasch 관행의 infit 허용 구간(Linacre) — 밖이면 표시. 판정 12건이면 표준오차가 커서 참고만 한다
export const INFIT_FLAG = 1.5;         // (호환) 위 구간의 상한
export const SHORT_WHY = 15;           // 이유 문장이 이보다 짧으면 표시(flag) — 문헌 근거가 없는 값이라 차단 기준으로는 쓰지 않는다
/* 공개 기준. SSR .80 이상이면 밴드 공개, .70~.80은 주의 문구와 함께, .70 미만이면 보류 권고(Kinnear 외 2025: SSR .80일 때
   판정자 반분 신뢰도가 .70을 넘는 자료가 9할). 반분 신뢰도는 반쪽 자료의 작품당 노출이 12회뿐이라 낮게 나오는 것이 정상이므로
   합격 기준이 아니라 보고 지표다. 작품당 10회 미만은 어떤 기준으로도 부족하다. */
export const QUALITY_MIN = { ssr: 0.7, ssrAdopt: 0.8, splitHalf: 0.7, perWork: 10 };

/* ---------- 잡동사니 ---------- */

export function stableHash(str) {
  let h = 2166136261;
  const s = String(str);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffled(arr, rnd) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
const cmp = (a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0);
const pairKey = (a, b) => (cmp(a, b) <= 0 ? a + "::" + b : b + "::" + a);
export const fmtNum = (x, d = 2) => (x == null || !Number.isFinite(x) ? "-" : (Math.round(x * 10 ** d) / 10 ** d).toFixed(d));
const median = (xs) => {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const mean = (xs) => { const v = xs.filter((x) => Number.isFinite(x)); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const trimStr = (v) => (typeof v === "string" ? v.trim() : "");

/* 2-gram 자카드 — 같은 이유 문장을 복사해 붙이는지 본다 (src-app.jsx의 simText와 같은 발상) */
export function simText(a, b) {
  const g = (t) => {
    const s = String(t || "").replace(/\s+/g, "");
    const set = new Set();
    for (let i = 0; i < s.length - 1; i += 1) set.add(s.slice(i, i + 2));
    return set;
  };
  const A = g(a), B = g(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach((x) => { if (B.has(x)) inter += 1; });
  return inter / (A.size + B.size - inter);
}

/* 윌슨 95% 신뢰구간 — 표본이 24개뿐인 반복 일치율·위치 편향에 정규근사 대신 쓴다 */
export function wilson(k, n, z = 1.96) {
  if (!n) return [0, 1];
  const p = k / n, z2 = z * z;
  const c = (p + z2 / (2 * n)) / (1 + z2 / n);
  const h = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return [Math.max(0, c - h), Math.min(1, c + h)];
}
export const predPctOf = (predRank, n) => (n > 1 && predRank >= 1 ? (n - predRank) / (n - 1) : null);

/* ---------- 제출 초안 ---------- */

/* 기록지에서 제출 스냅샷 초안을 만든다. AI 활용 범위 자유 서술(aiScope)은 넣지 않는다 —
   비교 화면에서 AI 고지가 판정을 깎는 것(Bellaiche 외 2023)을 이 연구에서는 별도 앵커 쌍으로 잰다. */
export function submissionFromWs(ws, sid) {
  const d = ws || {};
  const img = d["s7x.img"] && d["s7x.img"].ref ? { owner: sid, ref: d["s7x.img"].ref } : null;
  return {
    no: trimStr(d["s7x.no"]),
    title: trimStr(d["s6b.title"]),
    plate: {
      relic: trimStr(d["s6b.relic"]), year: trimStr(d["s6b.year"]) || "2300년", era: trimStr(d["s6b.era"]),
      mat: trimStr(d["s6b.mat"]), size: trimStr(d["s6b.size"]), context: trimStr(d["s6b.context"]),
      coll: trimStr(d["s6b.coll"]) || "학급 가상 컬렉션",
      notice: trimStr(d["s6b.notice"]) || "이 이미지는 생성형 AI로 제작한, 실재한 적 없는 유물입니다.",
    },
    aiLevel: trimStr(d["s6b.aiLevel"]),
    note: trimStr(d["s7.note"]),
    img,
  };
}
export const subReady = (sub) => !!(sub && sub.locked && trimStr(sub.no) && sub.img && sub.img.ref);

/* ---------- 배정 ---------- */

/* 회차별 간격 d_r — 판정자 j의 r회차 쌍은 {j+r, j+r+d_r} (mod n).
   A = j+r는 판정자가 학급을 한 바퀴 돌 때 모든 작품을 정확히 한 번 덮고, d_r이 회차 안에서
   상수이므로 B도 그렇다 → 작품마다 회차당 2회, k회차면 정확히 2k회 노출된다.
   조건: d ≠ 0 (A≠B), (r+d) mod n ≠ 0 (B≠j), 앞 회차와 같은 무순서쌍을 만들지 않음
   (d_r + d_r' ≡ 0 이고 d_r' ≡ r − r' 이면 판정자마다 같은 쌍이 두 번 나온다).
   되도록 서로 다른 거리 급(d, n−d)을 써서 학급 전체 쌍의 종류를 늘린다. */
export function dSequence(n, k, seed) {
  const rnd = mulberry32(stableHash(seed + "::d"));
  const cands = shuffled(Array.from({ length: n - 1 }, (_, i) => i + 1), rnd);
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const ds = [];
  const usedClass = new Map();   // 거리 급 → 쓴 횟수
  const okAt = (r, d) => {
    if ((r + d) % n === 0) return false;
    for (let q = 1; q < r; q += 1) {
      const dq = ds[q - 1];
      if ((d + dq) % n === 0 && ((r - q) % n + n) % n === dq % n) return false;
    }
    return true;
  };
  // 깊이 우선 탐색 — 안 쓴 거리 급을 먼저 시도하고, 다 채운 뒤에는 n과 d들의 최대공약수가 1이어야
  // (순환 그래프가 하나로 이어지는 조건) 받아들인다. 실패하면 되돌아가 다른 d를 시도한다.
  let budget = 200000;
  const dfs = (r, g) => {
    if (budget-- <= 0) return false;
    if (r > k) return g === 1;
    const order = [...cands].sort((x, y) => (usedClass.get(Math.min(x, n - x)) || 0) - (usedClass.get(Math.min(y, n - y)) || 0));
    for (const d of order) {
      if (!okAt(r, d)) continue;
      const cls = Math.min(d, n - d);
      ds.push(d); usedClass.set(cls, (usedClass.get(cls) || 0) + 1);
      if (dfs(r + 1, gcd(g, d))) return true;
      ds.pop(); usedClass.set(cls, usedClass.get(cls) - 1);
    }
    return false;
  };
  return dfs(1, n) ? ds : null;
}

function normalizeWorks(works) {
  const errors = [];
  const list = (works || []).map((w) => ({ no: trimStr(w && w.no), sid: trimStr(w && w.sid) }))
    .filter((w) => w.no && w.sid)
    .sort((a, b) => cmp(a.no, b.no));
  const nos = new Set(), sids = new Set();
  list.forEach((w) => {
    if (nos.has(w.no)) errors.push("작품 번호가 겹칩니다: " + w.no);
    if (sids.has(w.sid)) errors.push("한 학생에게 작품이 둘 이상 연결됐습니다: " + w.sid);
    nos.add(w.no); sids.add(w.sid);
  });
  return { list, errors };
}

/* 좌우 배치.
   순환 규칙에서 회차 r의 작품 w는 판정자 x=w−r의 화면에 A로, 판정자 x−d의 화면에 B로 나온다.
   판정자 x의 화면에서 "A가 왼쪽"을 색 0, "B가 왼쪽"을 색 1이라 하면, w가 회차 안에서 왼쪽·오른쪽
   한 번씩이 되는 조건은 색(x) = 색(x−d) 이다 (같은 색이면 x에서 왼쪽·x−d에서 오른쪽, 혹은 그 반대).
   따라서 x → x−d 로 이어지는 순환 성분 안에서는 색이 하나여야 하고, 성분마다 색을 고를 자유가 있다.
   그 자유도로 판정자별 왼쪽 횟수를 맞춘다 — k회차면 판정자마다 색 0과 1을 반씩 받게 된다.
   작품 없는 판정자의 화면은 그 뒤에 탐욕으로 채운다. */
function balanceSides(raw, seed, n, ds) {
  const g = (m, k) => m[k] || 0;
  const jl = {}, jr = {}, wl = {}, wr = {};
  const noteSide = (it) => {
    const L = it.left === "a" ? it.a : it.b, R = it.left === "a" ? it.b : it.a;
    jl[it.judge] = g(jl, it.judge) + (it.left === "a" ? 1 : 0);
    jr[it.judge] = g(jr, it.judge) + (it.left === "a" ? 0 : 1);
    wl[L] = g(wl, L) + 1; wr[R] = g(wr, R) + 1;
  };
  const byRound = {};
  raw.forEach((it) => { (byRound[it.r] = byRound[it.r] || []).push(it); });
  const comps = [];   // 성분 목록 — 뒤의 보정 패스가 성분 단위로 색을 뒤집는다 (작품 균형은 그대로 유지된다)
  Object.keys(byRound).map(Number).sort((x, y) => x - y).forEach((r) => {
    const items = byRound[r];
    const byX = {};
    items.forEach((it) => { if (it.x != null) byX[it.x] = it; });
    const d = ds[r - 1];
    const visited = new Set();
    for (let x0 = 0; x0 < n; x0 += 1) {
      if (visited.has(x0)) continue;
      const comp = [];
      let x = x0;
      while (!visited.has(x)) { visited.add(x); comp.push(x); x = ((x - d) % n + n) % n; }
      const present = comp.map((y) => byX[y]).filter(Boolean);
      if (!present.length) continue;
      // 성분 전체의 색 — 판정자 좌우 누적 편차의 제곱합이 작은 쪽. 동률이면 seed로 결정
      const cost = (color) => present.reduce((acc, it) => {
        const l = g(jl, it.judge) + (color === 0 ? 1 : 0), rr = g(jr, it.judge) + (color === 0 ? 0 : 1);
        return acc + (l - rr) ** 2;
      }, 0);
      const c0 = cost(0), c1 = cost(1);
      const color = c0 < c1 ? 0 : c1 < c0 ? 1 : stableHash(seed + "::flip::" + r + "::" + x0) % 2;
      present.forEach((it) => { it.left = color === 0 ? "a" : "b"; noteSide(it); });
      comps.push(present);
    }
    items.filter((it) => it.x == null).forEach((it, idx) => {
      const costA = Math.abs(g(jl, it.judge) + 1 - g(jr, it.judge)) + 2 * (Math.abs(g(wl, it.a) + 1 - g(wr, it.a)) + Math.abs(g(wr, it.b) + 1 - g(wl, it.b)));
      const costB = Math.abs(g(jr, it.judge) + 1 - g(jl, it.judge)) + 2 * (Math.abs(g(wr, it.a) + 1 - g(wl, it.a)) + Math.abs(g(wl, it.b) + 1 - g(wr, it.b)));
      it.left = costA < costB ? "a" : costB < costA ? "b" : stableHash(seed + "::side::" + r + "::" + idx) % 2 === 0 ? "a" : "b";
      noteSide(it);
    });
  });
  // 보정 패스 — 회차에 성분이 둘 이상이면 탐욕이 판정자 편차 2를 남길 수 있다.
  // 성분 하나를 통째로 뒤집어 판정자 편차 제곱합이 줄면 받아들인다. 작품 균형은 성분 뒤집기에 영향받지 않는다.
  for (let pass = 0; pass < 40; pass += 1) {
    let improved = false;
    comps.forEach((present) => {
      let before = 0, after = 0;
      present.forEach((it) => {
        const l = g(jl, it.judge), rr = g(jr, it.judge);
        const dl = it.left === "a" ? -1 : 1;       // 뒤집으면 a→b는 왼쪽 −1, b→a는 왼쪽 +1
        before += (l - rr) ** 2; after += ((l + dl) - (rr - dl)) ** 2;
      });
      if (after < before) {
        improved = true;
        present.forEach((it) => {
          const dl = it.left === "a" ? -1 : 1;
          jl[it.judge] = g(jl, it.judge) + dl; jr[it.judge] = g(jr, it.judge) - dl;
          it.left = it.left === "a" ? "b" : "a";
        });
      }
    });
    if (!improved) break;
  }
}

/* 판정자 한 사람의 화면 순서 — 회차 순서를 seed로 섞고, 반복은 맨 뒤에 붙인다.
   반복의 원본은 화면 0~k−3(k−2개) 가운데서 고른다(사이에 화면이 3개 이상 들어가야 한다). 여러 후보 가운데
   좌우를 뒤집었을 때 학급 전체의 작품별 좌우 편차 제곱합이 가장 줄어드는 것을 택한다(sideCount는 학급 누적).
   판정자를 차례로 처리하므로 뒤 판정자가 앞 판정자의 선택을 되돌릴 수 없다 — makePlan이 뒤에 재선택 패스를 돈다. */
function finishJudge(items, sid, seed, repeat, sideCount) {
  const rnd = mulberry32(stableHash(seed + "::order::" + sid));
  const ordered = shuffled(items, rnd).map((it, i) => ({ i, a: it.a, b: it.b, left: it.left, rep: null }));
  const reps = Math.max(0, Math.min(2, repeat | 0));
  const k = ordered.length;
  const sc = sideCount || { l: {}, r: {} };
  const g = (m, key) => m[key] || 0;
  const used = new Set();
  for (let q = 0; q < reps && k >= 4; q += 1) {
    let best = null, bestCost = Infinity;
    for (let c = 0; c <= k - 3; c += 1) {
      if (used.has(c)) continue;
      const o = ordered[c];
      const L = o.left === "a" ? o.b : o.a, R = o.left === "a" ? o.a : o.b;   // 뒤집은 뒤의 왼쪽·오른쪽
      const cost = (g(sc.l, L) + 1 - g(sc.r, L)) ** 2 + (g(sc.r, R) + 1 - g(sc.l, R)) ** 2
        + (stableHash(seed + "::rep::" + sid + "::" + c) % 97) / 1e5;
      if (cost < bestCost) { bestCost = cost; best = c; }
    }
    if (best == null) break;
    used.add(best);
    const o = ordered[best];
    const rep = { i: ordered.length, a: o.a, b: o.b, left: o.left === "a" ? "b" : "a", rep: o.i };
    ordered.push(rep);
    const L = rep.left === "a" ? rep.a : rep.b, R = rep.left === "a" ? rep.b : rep.a;
    sc.l[L] = g(sc.l, L) + 1; sc.r[R] = g(sc.r, R) + 1;
  }
  return ordered;
}

export function makePlan({ works, judges, k, repeat = 1, seed }) {
  const { list, errors } = normalizeWorks(works);
  const n = list.length;
  const judgeIds = Array.from(new Set((judges || []).map(trimStr).filter(Boolean))).sort(cmp);
  if (n < 4) errors.push("비교할 작품이 4점 미만입니다 (지금 " + n + "점).");
  if (!judgeIds.length) errors.push("판정자 명단이 비어 있습니다.");
  if (errors.length) return { plan: {}, hash: "", stats: { n, nJudges: judgeIds.length }, errors, kEff: 0 };
  const kEff = Math.max(1, Math.min(k | 0 || 1, n - 1));
  const nos = list.map((w) => w.no);
  const idxOfSid = {};
  list.forEach((w, i) => { idxOfSid[w.sid] = i; });
  const ds = dSequence(n, kEff, seed);
  if (!ds) {
    errors.push("배정을 만들지 못했습니다 (작품 " + n + "점 · k " + kEff + "). 판정 수 k를 바꾸거나 다시 확정하세요.");
    return { plan: {}, hash: "", stats: { n, nJudges: judgeIds.length }, errors, kEff };
  }
  const raw = [];                 // { judge, a, b, r }
  const exposure = {};
  const pairUse = {};
  const bump = (m, key) => { m[key] = (m[key] || 0) + 1; };

  // 1) 작품이 있는 판정자 — 순환 규칙
  const owners = judgeIds.filter((s) => idxOfSid[s] != null);
  for (let r = 1; r <= kEff; r += 1) {
    owners.forEach((sid) => {
      const j = idxOfSid[sid];
      const a = nos[(j + r) % n], b = nos[(j + r + ds[r - 1]) % n];
      raw.push({ judge: sid, a, b, r, x: j });
      bump(exposure, a); bump(exposure, b); bump(pairUse, pairKey(a, b));
    });
  }
  // 2) 작품이 없는 판정자 — 노출이 적은 작품부터 짝지어 채운다 (자기 작품이 없으므로 제외 조건 없음)
  const extras = judgeIds.filter((s) => idxOfSid[s] == null);
  extras.forEach((sid) => {
    const seen = new Set();
    for (let r = 1; r <= kEff; r += 1) {
      let best = null, bestScore = Infinity;
      for (let x = 0; x < n; x += 1) {
        for (let y = x + 1; y < n; y += 1) {
          const key = pairKey(nos[x], nos[y]);
          if (seen.has(key)) continue;
          const score = (exposure[nos[x]] || 0) + (exposure[nos[y]] || 0) + (pairUse[key] || 0) * 0.5
            + (stableHash(seed + "::x::" + sid + "::" + r + "::" + key) % 1000) / 1e6;
          if (score < bestScore) { bestScore = score; best = [nos[x], nos[y], key]; }
        }
      }
      if (!best) break;
      seen.add(best[2]);
      raw.push({ judge: sid, a: best[0], b: best[1], r, x: null });
      bump(exposure, best[0]); bump(exposure, best[1]); bump(pairUse, best[2]);
    }
  });

  // 3) 좌우 — 회차 안에서 작품마다 왼쪽·오른쪽 한 번씩, 성분 뒤집기로 판정자 균형
  raw.sort((x, y) => x.r - y.r || cmp(x.judge, y.judge));
  balanceSides(raw, seed, n, ds);

  // 4) 판정자별 순서와 반복 — 반복의 좌우가 학급 전체 작품 균형을 해치지 않도록 누적을 넘긴다
  const sideCount = { l: {}, r: {} };
  raw.forEach((it) => {
    const L = it.left === "a" ? it.a : it.b, R = it.left === "a" ? it.b : it.a;
    sideCount.l[L] = (sideCount.l[L] || 0) + 1; sideCount.r[R] = (sideCount.r[R] || 0) + 1;
  });
  const plan = {};
  judgeIds.forEach((sid) => {
    plan[sid] = finishJudge(raw.filter((it) => it.judge === sid), sid, seed, repeat, sideCount);
  });
  // 반복 원본 재선택 패스 — 판정자 순서 때문에 남은 좌우 편차를 줄인다 (작품 좌우 균형은 반복만 바꾸므로 유지)
  for (let pass = 0; pass < 10; pass += 1) {
    let changed = false;
    judgeIds.forEach((sid) => {
      const items = plan[sid];
      const reps = items.filter((it) => it.rep != null);
      if (!reps.length) return;
      const k = items.length - reps.length;
      reps.forEach((rp) => {
        const L0 = rp.left === "a" ? rp.a : rp.b, R0 = rp.left === "a" ? rp.b : rp.a;
        sideCount.l[L0] -= 1; sideCount.r[R0] -= 1;
        let best = rp.rep, bestCost = Infinity;
        for (let c = 0; c <= k - 3; c += 1) {
          if (reps.some((o) => o !== rp && o.rep === c)) continue;
          const o = items[c];
          const L = o.left === "a" ? o.b : o.a, R = o.left === "a" ? o.a : o.b;
          const g = (m, key) => m[key] || 0;
          const cost = (g(sideCount.l, L) + 1 - g(sideCount.r, L)) ** 2 + (g(sideCount.r, R) + 1 - g(sideCount.l, R)) ** 2 + (c === rp.rep ? 0 : 1e-6);
          if (cost < bestCost) { bestCost = cost; best = c; }
        }
        if (best !== rp.rep) {
          const o = items[best];
          rp.rep = best; rp.a = o.a; rp.b = o.b; rp.left = o.left === "a" ? "b" : "a";
          changed = true;
        }
        const L1 = rp.left === "a" ? rp.a : rp.b, R1 = rp.left === "a" ? rp.b : rp.a;
        sideCount.l[L1] = (sideCount.l[L1] || 0) + 1; sideCount.r[R1] = (sideCount.r[R1] || 0) + 1;
      });
    });
    if (!changed) break;
  }

  const stats = planStats(plan, nos, judgeIds);
  const hash = planHash(plan);
  const errs = validatePlan({ plan, works: list, judges: judgeIds, k: kEff, repeat });
  if (!stats.connected) errs.push("비교 그래프가 하나로 이어지지 않습니다. k를 올리거나 다시 확정하세요.");
  return { plan, hash, stats: { ...stats, kEff, ds }, errors: errs, kEff };
}

function planStats(plan, nos, judgeIds) {
  const exposure = {}, leftN = {}, pairs = new Set();
  const adj = {};
  const leftAll = {}, expAll = {};
  nos.forEach((no) => { exposure[no] = 0; leftN[no] = 0; leftAll[no] = 0; expAll[no] = 0; adj[no] = new Set(); });
  let judgeDev = 0;
  judgeIds.forEach((sid) => {
    let l = 0, r = 0;
    (plan[sid] || []).forEach((it) => {
      const Lx = it.left === "a" ? it.a : it.b;
      if (leftAll[Lx] != null) leftAll[Lx] += 1;
      if (expAll[it.a] != null) expAll[it.a] += 1;
      if (expAll[it.b] != null) expAll[it.b] += 1;
      if (it.rep != null) return;
      exposure[it.a] = (exposure[it.a] || 0) + 1; exposure[it.b] = (exposure[it.b] || 0) + 1;
      const L = it.left === "a" ? it.a : it.b;
      leftN[L] = (leftN[L] || 0) + 1;
      pairs.add(pairKey(it.a, it.b));
      if (adj[it.a]) adj[it.a].add(it.b); if (adj[it.b]) adj[it.b].add(it.a);
      if (it.left === "a") l += 1; else r += 1;
    });
    judgeDev = Math.max(judgeDev, Math.abs(l - r));
  });
  const ex = nos.map((no) => exposure[no]);
  const sideDev = Math.max(0, ...nos.map((no) => Math.abs(2 * leftN[no] - exposure[no])));
  const sideDevRep = Math.max(0, ...nos.map((no) => Math.abs(2 * leftAll[no] - expAll[no])));
  // 연결성 — 비교 그래프가 하나로 이어져야 능력값을 한 척도에 놓을 수 있다 (Ford 1957)
  const seen = new Set();
  const stack = nos.length ? [nos[0]] : [];
  while (stack.length) {
    const x = stack.pop();
    if (seen.has(x)) continue;
    seen.add(x);
    adj[x].forEach((y) => { if (!seen.has(y)) stack.push(y); });
  }
  return {
    n: nos.length, nJudges: judgeIds.length,
    exposureMin: ex.length ? Math.min(...ex) : 0, exposureMax: ex.length ? Math.max(...ex) : 0,
    distinctPairs: pairs.size, connected: seen.size === nos.length,
    sideDevMax: sideDev, sideDevMaxRep: sideDevRep, judgeSideDevMax: judgeDev,
  };
}

export function planHash(plan) {
  const sids = Object.keys(plan || {}).sort(cmp);
  const s = sids.map((sid) => sid + "=" + (plan[sid] || []).map((it) => [it.i, it.a, it.b, it.left, it.rep == null ? "" : it.rep].join(",")).join(";")).join("|");
  return stableHash(s).toString(16).padStart(8, "0");
}

export function validatePlan({ plan, works, judges, k, repeat }) {
  const errors = [];
  const { list } = normalizeWorks(works);
  const nos = new Set(list.map((w) => w.no));
  const own = {};
  list.forEach((w) => { own[w.sid] = w.no; });
  (judges || []).forEach((sid) => {
    const items = (plan || {})[sid];
    if (!Array.isArray(items) || !items.length) { errors.push(sid + ": 배정이 없습니다."); return; }
    const main = items.filter((it) => it.rep == null);
    if (k && main.length !== k) errors.push(sid + ": 본 판정이 " + main.length + "개입니다 (기대 " + k + ").");
    const keys = new Set();
    items.forEach((it, idx) => {
      if (it.i !== idx) errors.push(sid + ": 화면 번호가 어긋납니다 (" + idx + ").");
      if (!nos.has(it.a) || !nos.has(it.b)) errors.push(sid + ": 명단에 없는 작품 " + it.a + "/" + it.b);
      if (it.a === it.b) errors.push(sid + ": 같은 작품끼리 짝지어졌습니다.");
      if (own[sid] && (it.a === own[sid] || it.b === own[sid])) errors.push(sid + ": 자기 작품이 들어 있습니다.");
      if (it.left !== "a" && it.left !== "b") errors.push(sid + ": 좌우 표시가 없습니다.");
      if (it.rep == null) {
        const key = pairKey(it.a, it.b);
        if (keys.has(key)) errors.push(sid + ": 같은 쌍이 두 번 나옵니다 " + key);
        keys.add(key);
      } else {
        const o = items[it.rep];
        if (!o || o.rep != null || pairKey(o.a, o.b) !== pairKey(it.a, it.b)) errors.push(sid + ": 반복 화면이 원본과 다릅니다.");
        else if (o.left === it.left) errors.push(sid + ": 반복 화면의 좌우가 뒤집히지 않았습니다.");
        else if (idx - it.rep < 3) errors.push(sid + ": 반복이 원본과 너무 가깝습니다.");
      }
    });
  });
  return errors;
}

/* 명단 확정 뒤 들어온 판정자 — 같은 d 수열로 가상 자리에서 순환 규칙을 돈다. 자기 작품이 명단에 없으니 제외 조건은 없다 */
export function pairsForLateJudge({ works, sid, k, repeat = 1, seed }) {
  const { list } = normalizeWorks(works);
  const n = list.length;
  if (n < 2) return [];
  const kEff = Math.max(1, Math.min(k | 0 || 1, n - 1));
  const nos = list.map((w) => w.no);
  const ds = dSequence(n, kEff, seed);
  if (!ds) return [];
  const own = (list.find((w) => w.sid === trimStr(sid)) || {}).no || null;
  const j = stableHash(seed + "::late::" + sid) % n;
  const raw = [];
  for (let r = 1; r <= kEff; r += 1) {
    const a = nos[(j + r) % n], b = nos[(j + r + ds[r - 1]) % n];
    if (a === own || b === own) continue;   // 배정표에 빠진 채 작품은 있는 드문 경우 — 자기 작품은 어떤 경로로도 나오지 않는다
    raw.push({ judge: sid, a, b, r, left: (r + (stableHash(seed + "::lside::" + sid) % 2)) % 2 === 0 ? "a" : "b" });
  }
  return finishJudge(raw, sid, seed, repeat);
}

export function myPairs(roster, sid) {
  if (!roster || !Array.isArray(roster.works) || !roster.works.length) return [];
  if (roster.plan && Array.isArray(roster.plan[sid]) && roster.plan[sid].length) return roster.plan[sid];
  return pairsForLateJudge({ works: roster.works, sid, k: roster.k, repeat: roster.repeat, seed: roster.seed || roster.fixedAt || "" });
}

/* ---------- 판정 자료 펼치기 ---------- */

/* 명단(회차)에 맞는 판정 블록. 첫 명단은 judge.p1, 명단을 다시 확정하면 judge["r_<해시>"]에 새로 쌓는다 —
   옛 판정을 덮어쓰지 않기 위해서다(설계 §5 「명단 재확정」). rosterVer와 planHash가 모두 맞아야 이 명단의 것이다.
   돌려주는 key는 학생 화면이 쓸 자리, block은 이미 쌓인 기록(없으면 null). */
export function judgeBlockOf(doc, roster) {
  const judge = (doc && doc.judge) || {};
  const ver = (roster && roster.fixedAt) || null, hash = (roster && roster.hash) || null;
  const matches = (b) => !!b && (b.rosterVer || null) === ver && (b.planHash || null) === hash;
  if (matches(judge.p1)) return { key: "p1", block: judge.p1 };
  const alt = "r_" + (hash || "0") + "_" + stableHash(String(ver || "")).toString(16);   // 해시가 우연히 같아도(작품 4점 학급) 옛 블록을 덮지 않도록 명단 시각을 섞는다
  if (matches(judge[alt])) return { key: alt, block: judge[alt] };
  const other = Object.keys(judge).find((k) => k !== "p1" && matches(judge[k]));
  if (other) return { key: other, block: judge[other] };
  return { key: judge.p1 && (judge.p1.rosterVer || judge.p1.planHash) ? alt : "p1", block: null };
}

/* 이 명단의 판정만 펼친다. 배정표(myPairs)와 자리·쌍·좌우·반복이 정확히 맞는 항목만 받는다 —
   학생이 자기 문서에 쓸 수 있으므로 배정에 없는 판정(자기 작품을 넣은 것 등)이 점수를 움직이면 안 된다.
   opts.stats에 걸러 낸 수(dropped)를 적어 준다. */
export function collectJudgements(assessMap, roster, opts) {
  const out = [];
  const stats = (opts && opts.stats) || {};
  stats.dropped = 0; stats.droppedJudges = [];
  if (!roster) return out;
  const ownNo = {};
  (roster.works || []).forEach((w) => { if (w && w.sid) ownNo[trimStr(w.sid)] = trimStr(w.no); });
  Object.keys(assessMap || {}).sort(cmp).forEach((sid) => {
    const { block: p } = judgeBlockOf(assessMap[sid], roster);
    if (!p || !Array.isArray(p.items)) return;
    const expected = myPairs(roster, sid);
    const mine = ownNo[trimStr(sid)] || null;
    const seenI = new Set();
    let dropped = 0;
    p.items.forEach((it) => {
      if (!it || (it.win !== "a" && it.win !== "b") || !it.a || !it.b) { dropped += 1; return; }
      const e = Number.isInteger(it.i) ? expected[it.i] : null;
      const repOk = e && ((e.rep == null && it.rep == null) || (e.rep != null && it.rep != null && e.rep === it.rep));
      if (!e || seenI.has(it.i) || e.a !== it.a || e.b !== it.b || e.left !== it.left || !repOk || (mine && (it.a === mine || it.b === mine))) { dropped += 1; return; }
      seenI.add(it.i);
      const winNo = it.win === "a" ? it.a : it.b;
      out.push({
        judge: sid, i: it.i, a: it.a, b: it.b, left: it.left, win: it.win, winNo, loseNo: it.win === "a" ? it.b : it.a,
        chosenLeft: it.win === it.left,
        conf: Number.isFinite(it.conf) ? it.conf : null, why: trimStr(it.why), tag: it.tag || "",
        ms: Number.isFinite(it.ms) ? it.ms : null, plateOpened: !!it.plateOpened, fastOverride: !!it.fastOverride,
        hard: !!it.hard, knowAuthor: !!it.knowAuthor,
        axis: it.axis === "y" ? "y" : it.axis === "x" ? "x" : null, vw: Number.isFinite(it.vw) ? it.vw : null,
        rep: it.rep == null ? null : it.rep, at: it.at || "",
      });
    });
    if (dropped) { stats.dropped += dropped; stats.droppedJudges.push(sid); }
  });
  return out;
}

/* ---------- Bradley–Terry ---------- */

/* Hunter(2004)의 MM: p_i ← W_i / Σ_j n_ij/(p_i+p_j). 가상 기준 작품(p=1 고정)과 각 작품이
   1회 비교해 prior(0.5)승을 거둔 것으로 두면 전승·전패 작품도 유한한 값에 머문다 —
   그 값은 정확히 "기준보다 얼마나 나은가"라 비교 척도의 원점이 된다. 최종 θ는 학급 평균 0으로 옮긴다.
   표준오차는 관측 정보 행렬의 대각 성분 Σ_j n_ij p_i p_j/(p_i+p_j)² 의 역제곱근(비대각 무시한 근사). */
export function bradleyTerry(judgements, workNos, opts = {}) {
  const prior = opts.prior == null ? 0.5 : opts.prior;
  const maxIter = opts.maxIter || 5000, tol = opts.tol || 1e-7;   // MM은 선형 수렴이라 900회 안팎이 예사다 — 30작품이면 수 ms
  const nos = Array.from(new Set(workNos || []));
  const m = nos.length;
  const idx = {};
  nos.forEach((no, i) => { idx[no] = i; });
  const N = Array.from({ length: m + 1 }, () => new Float64Array(m + 1));
  const W = new Float64Array(m + 1);
  const plays = new Float64Array(m), wins = new Float64Array(m);
  (judgements || []).forEach((J) => {
    if (J.rep != null) return;
    const a = idx[J.a], b = idx[J.b];
    if (a == null || b == null || a === b) return;
    N[a][b] += 1; N[b][a] += 1;
    W[J.win === "a" ? a : b] += 1;
    plays[a] += 1; plays[b] += 1;
    wins[J.win === "a" ? a : b] += 1;
  });
  for (let i = 0; i < m; i += 1) { N[i][m] += 1; N[m][i] += 1; W[i] += prior; }
  let p = new Float64Array(m + 1).fill(1);
  let iterations = 0, converged = false;
  for (; iterations < maxIter; iterations += 1) {
    const q = new Float64Array(m + 1);
    q[m] = 1;
    let delta = 0;
    for (let i = 0; i < m; i += 1) {
      let denom = 0;
      for (let j = 0; j <= m; j += 1) if (N[i][j]) denom += N[i][j] / (p[i] + p[j]);
      q[i] = denom > 0 ? W[i] / denom : 1;
      delta = Math.max(delta, Math.abs(Math.log(q[i]) - Math.log(p[i])));
    }
    p = q;
    if (delta < tol) { converged = true; iterations += 1; break; }
  }
  const theta = {}, se = {}, playsO = {}, winsO = {};
  const logs = nos.map((_, i) => Math.log(p[i]));
  const center = mean(logs) || 0;
  nos.forEach((no, i) => {
    let info = 0;
    for (let j = 0; j <= m; j += 1) if (N[i][j]) info += (N[i][j] * p[i] * p[j]) / ((p[i] + p[j]) ** 2);
    theta[no] = logs[i] - center;
    se[no] = info > 0 ? 1 / Math.sqrt(info) : null;
    playsO[no] = plays[i]; winsO[no] = wins[i];
  });
  return { theta, se, plays: playsO, wins: winsO, iterations, converged };
}

/* 척도분리신뢰도(SSR) = (관측 분산 − 평균 오차분산) / 관측 분산 — Rasch의 분리 신뢰도와 같은 식.
   작은 표본에서 실제 안정성을 과대평가할 수 있으므로 반분과 나란히 본다 */
export function scaleSeparation(theta, se) {
  const nos = Object.keys(theta || {}).filter((no) => Number.isFinite(theta[no]) && Number.isFinite(se && se[no]));
  if (nos.length < 3) return null;
  const t = nos.map((no) => theta[no]);
  const mu = mean(t);
  const varObs = t.reduce((a, x) => a + (x - mu) ** 2, 0) / (t.length - 1);
  const mse = mean(nos.map((no) => se[no] ** 2));
  if (!(varObs > 0)) return null;   // 판정이 없거나 모두 같은 값 — 계산되지 않은 것이지 0이 아니다
  return Math.max(0, Math.min(1, (varObs - mse) / varObs));
}

function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = mean(xs), my = mean(ys);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i += 1) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  if (!(sxx > 0) || !(syy > 0)) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/* 반분 신뢰도 — 판정자를 무작위로 반으로 갈라 각각 BT를 풀고 θ의 상관을 스피어만–브라운으로 보정.
   판정자 단위로 가르는 것이 판정 단위보다 보수적이다(같은 판정자의 판정은 서로 독립이 아니다). */
export function splitHalf(judgements, workNos, opts = {}) {
  const by = opts.by || "judges", reps = opts.reps || 25, seed = opts.seed || "split";
  const main = (judgements || []).filter((J) => J.rep == null);
  const values = [], raw = [];
  let failed = 0;
  const fitPair = (h1, h2) => {
    const b1 = bradleyTerry(h1, workNos), b2 = bradleyTerry(h2, workNos);
    const common = workNos.filter((no) => b1.plays[no] > 0 && b2.plays[no] > 0);
    if (common.length < 3) return null;
    const r = pearson(common.map((no) => b1.theta[no]), common.map((no) => b2.theta[no]));
    if (r == null) return null;
    raw.push(r);
    return (2 * r) / (1 + r);
  };
  if (by === "judges") {
    const judges = Array.from(new Set(main.map((J) => J.judge))).sort(cmp);
    if (judges.length < 4) return { median: null, medianRaw: null, values, raw, failed: reps, n: 0 };
    for (let rep = 0; rep < reps; rep += 1) {
      const order = shuffled(judges, mulberry32(stableHash(seed + "::" + rep)));
      const half = new Set(order.slice(0, Math.floor(order.length / 2)));
      const v = fitPair(main.filter((J) => half.has(J.judge)), main.filter((J) => !half.has(J.judge)));
      if (v == null) failed += 1; else values.push(v);
    }
  } else {
    for (let rep = 0; rep < reps; rep += 1) {
      const order = shuffled(main, mulberry32(stableHash(seed + "::i::" + rep)));
      const v = fitPair(order.filter((_, i) => i % 2 === 0), order.filter((_, i) => i % 2 === 1));
      if (v == null) failed += 1; else values.push(v);
    }
  }
  // median: 스피어만–브라운 보정값(전체 길이 추정), medianRaw: 문헌이 보고하는 반쪽끼리의 상관 그대로
  return { median: median(values), medianRaw: median(raw), values, raw, failed, n: values.length };
}

/* 판정자 적합도 — 성적이 아니라 수업 자료. 제외 근거로 쓰지 않는다 */
export function judgeFit(judgements, theta) {
  const byJudge = {};
  (judgements || []).forEach((J) => { (byJudge[J.judge] = byJudge[J.judge] || []).push(J); });
  const out = {};
  Object.keys(byJudge).sort(cmp).forEach((sid) => {
    const items = byJudge[sid].filter((J) => J.rep == null);
    let sumRes = 0, sumVar = 0, sumZ2 = 0, nFit = 0, against = 0, nGap = 0;
    const whys = [];
    let dup = 0, shortN = 0;
    items.forEach((J) => {
      const ta = theta && theta[J.a], tb = theta && theta[J.b];
      if (Number.isFinite(ta) && Number.isFinite(tb)) {
        const P = sigmoid(ta - tb);
        const y = J.win === "a" ? 1 : 0;
        const v = P * (1 - P);
        sumRes += (y - P) ** 2; sumVar += v; sumZ2 += v > 0 ? (y - P) ** 2 / v : 0; nFit += 1;
        if (Math.abs(ta - tb) >= AGAINST_GAP) { nGap += 1; if ((ta > tb) !== (y === 1)) against += 1; }
      }
      if (J.why) {
        if (J.why.length < SHORT_WHY) shortN += 1;
        if (whys.some((w) => simText(w, J.why) >= DUP_SIM)) dup += 1;
        whys.push(J.why);
      }
    });
    const msList = items.map((J) => J.ms).filter((x) => Number.isFinite(x));
    out[sid] = {
      n: items.length,
      infit: sumVar > 0 ? sumRes / sumVar : null,
      outfit: nFit ? sumZ2 / nFit : null,
      against, nGap, againstRate: nGap ? against / nGap : null,
      leftRate: items.length ? items.filter((J) => J.chosenLeft).length / items.length : null,
      medianMs: median(msList), fastN: msList.filter((x) => x < FAST_MS).length,
      dupWhyN: dup, shortWhyN: shortN,
      confMean: mean(items.map((J) => J.conf)),
      plateOpenRate: items.length ? items.filter((J) => J.plateOpened).length / items.length : null,
      hardN: items.filter((J) => J.hard).length,
      knowN: items.filter((J) => J.knowAuthor).length,
    };
  });
  // 상대 기준 — 학급 평균 + 2SD 위의 infit도 표시한다 (Pollitt 2012의 ACJ 관행)
  const infits = Object.values(out).map((f) => f.infit).filter((x) => Number.isFinite(x));
  const mu = mean(infits);
  const sd = infits.length > 1 ? Math.sqrt(infits.reduce((a, x) => a + (x - mu) ** 2, 0) / (infits.length - 1)) : 0;
  Object.values(out).forEach((f) => {
    f.flag = Number.isFinite(f.infit) && (f.infit < INFIT_BAND[0] || f.infit > INFIT_BAND[1] || (sd > 0 && f.infit > mu + 2 * sd));
  });
  return out;
}

/* 위치 편향 — 화면이 좌우(x)였는지 위아래(y, 좁은 화면)였는지를 나눠 센다.
   전체 값은 축을 모르는 옛 기록까지 포함한 「먼저 놓인 쪽(왼쪽·위)」 선택률이다 */
export function positionBias(judgements) {
  const main = (judgements || []).filter((J) => J.rep == null && (J.left === "a" || J.left === "b"));
  const one = (arr) => {
    const first = arr.filter((J) => J.chosenLeft).length;
    return { n: arr.length, left: first, first, leftRate: arr.length ? first / arr.length : null, rate: arr.length ? first / arr.length : null, wilson: wilson(first, arr.length) };
  };
  const all = one(main);
  return {
    ...all,
    byAxis: {
      x: one(main.filter((J) => J.axis === "x")),
      y: one(main.filter((J) => J.axis === "y")),
      unknown: one(main.filter((J) => !J.axis)),
    },
  };
}

/* 연결성 — 무방향 그래프가 하나로 이어지는가, 승→패 방향 그래프가 강하게 이어지는가(전승·전패가 없는가) */
export function connectivity(judgements, workNos) {
  const nos = Array.from(new Set(workNos || []));
  const adj = {}, out = {};
  nos.forEach((no) => { adj[no] = new Set(); out[no] = new Set(); });
  (judgements || []).forEach((J) => {
    if (J.rep != null || !adj[J.a] || !adj[J.b]) return;
    adj[J.a].add(J.b); adj[J.b].add(J.a);
    out[J.winNo].add(J.loseNo);
  });
  const seen = new Set();
  let components = 0;
  nos.forEach((s) => {
    if (seen.has(s)) return;
    components += 1;
    const stack = [s];
    while (stack.length) {
      const x = stack.pop();
      if (seen.has(x)) continue;
      seen.add(x);
      adj[x].forEach((y) => { if (!seen.has(y)) stack.push(y); });
    }
  });
  // 강연결: 아무 정점에서 모든 정점으로 갈 수 있고(순방향), 역방향으로도 그러하면 된다
  const reach = (start, edges) => {
    const vis = new Set([start]);
    const st = [start];
    while (st.length) { const x = st.pop(); edges[x].forEach((y) => { if (!vis.has(y)) { vis.add(y); st.push(y); } }); }
    return vis;
  };
  let strongly = false;
  if (nos.length) {
    const rev = {};
    nos.forEach((no) => { rev[no] = new Set(); });
    nos.forEach((x) => out[x].forEach((y) => rev[y].add(x)));
    strongly = reach(nos[0], out).size === nos.length && reach(nos[0], rev).size === nos.length;
  }
  return { connected: components === 1 && nos.length > 0, components, strongly };
}

export function repeatAgreement(judgements) {
  const byJudge = {};
  (judgements || []).forEach((J) => { (byJudge[J.judge] = byJudge[J.judge] || {})[J.i] = J; });
  let n = 0, agree = 0;
  Object.keys(byJudge).forEach((sid) => {
    Object.values(byJudge[sid]).forEach((J) => {
      if (J.rep == null) return;
      const o = byJudge[sid][J.rep];
      if (!o) return;
      n += 1;
      if (o.winNo === J.winNo) agree += 1;
    });
  });
  return { n, agree, rate: n ? agree / n : null, wilson: wilson(agree, n) };
}

/* 순위·백분위·밴드. 동점은 공동 순위(1 + 자기보다 확실히 높은 작품 수)로 같은 밴드를 받고,
   비교가 한 번도 없었던 작품은 순위를 매기지 않는다(null) — 판정 중간에 집계해도 「하」가 붙지 않도록 */
export function ranksAndBands(theta, plays) {
  const all = Object.keys(theta || {}).filter((no) => Number.isFinite(theta[no]));
  const nos = plays ? all.filter((no) => plays[no] > 0) : all;   // 비교된 적 없는 작품은 분모에서도 뺀다
  const n = nos.length;
  const rank = {}, pct = {}, band = {};
  const top = Math.ceil(n / 3), bottomFrom = n - Math.floor(n / 3);
  all.forEach((no) => { if (plays && !(plays[no] > 0)) { rank[no] = null; pct[no] = null; band[no] = null; } });
  nos.forEach((no) => {
    const above = nos.filter((o) => theta[o] > theta[no] + 1e-9).length;
    const r = above + 1;
    rank[no] = r;
    pct[no] = n > 1 ? (n - r) / (n - 1) : 0.5;
    band[no] = r <= top ? "상" : r > bottomFrom ? "하" : "중";
  });
  return { rank, pct, band };
}

/* ---------- 집계 ---------- */

export function aggregate({ roster, assessMap, subMap, cfg, splitReps = 25 }) {
  const conf = { ...DEFAULT_PEER, ...(cfg || {}) };
  const reasons = [];
  if (!roster || !Array.isArray(roster.works) || roster.works.length < 4) {
    return { works: [], quality: {}, results: {}, ok: false, reasons: ["비교 명단이 확정되지 않았습니다."] };
  }
  const workNos = roster.works.map((w) => w.no);
  const sidByNo = {};
  roster.works.forEach((w) => { sidByNo[w.no] = w.sid; });
  const cstats = {};
  const J = collectJudgements(assessMap, roster, { stats: cstats });
  const main = J.filter((x) => x.rep == null);
  const bt = bradleyTerry(main, workNos);
  const rb = ranksAndBands(bt.theta, bt.plays);
  const judgesDone = Object.keys(assessMap || {}).filter((sid) => {
    const { block: p } = judgeBlockOf(assessMap[sid], roster);
    return !!(p && p.submittedAt);
  }).length;
  const n = workNos.length;
  const quality = {
    nJudgements: main.length,
    nJudges: new Set(main.map((x) => x.judge)).size,
    nJudgesDone: judgesDone,
    perWorkMean: n ? (2 * main.length) / n : 0,
    ssr: scaleSeparation(bt.theta, bt.se),
    splitHalf: splitHalf(main, workNos, { by: "judges", reps: splitReps, seed: roster.seed || "split" }),
    position: positionBias(main),
    repeat: repeatAgreement(J),
    connectivity: connectivity(main, workNos),
    judges: judgeFit(main, bt.theta),
    medianMs: median(main.map((x) => x.ms)),
    fastN: main.filter((x) => Number.isFinite(x.ms) && x.ms < FAST_MS).length,
    fastOverrideN: main.filter((x) => x.fastOverride).length,
    hardRate: main.length ? main.filter((x) => x.hard).length / main.length : null,
    knowRate: main.length ? main.filter((x) => x.knowAuthor).length / main.length : null,
    droppedN: cstats.dropped || 0, droppedJudges: cstats.droppedJudges || [],
    dupWhyN: 0,
    tagDist: {}, plateOpenRate: main.length ? main.filter((x) => x.plateOpened).length / main.length : null,
    confMean: mean(main.map((x) => x.conf)),
    converged: bt.converged, iterations: bt.iterations,
  };
  TAG_OPTIONS.forEach((c) => { quality.tagDist[c.k] = main.filter((x) => x.tag === c.k).length; });
  Object.values(quality.judges).forEach((f) => { quality.dupWhyN += f.dupWhyN; });

  const aggAt = new Date().toISOString();
  const works = [], results = {};
  workNos.forEach((no) => {
    const sid = sidByNo[no];
    const doc = (assessMap || {})[sid] || {};
    const s1 = doc.self && doc.self.s1, s2 = doc.self && doc.self.s2;
    const pctA = rb.pct[no];
    // ②는 「현재 점수 확정」(lockedAt) 시점의 값이 확정 자료다 — 변화 사유 제출 전이라도 예측은 굳었다
    const pp = (s, key) => (s && s[key] ? (Number.isFinite(s.predPct) ? s.predPct : predPctOf(s.predRank, s.n)) : null);
    const predPct1 = pp(s1, "submittedAt");
    const predPct2 = pp(s2, "lockedAt") != null ? pp(s2, "lockedAt") : pp(s2, "submittedAt");
    const bias1 = predPct1 == null || pctA == null ? null : predPct1 - pctA;
    const bias2 = predPct2 == null || pctA == null ? null : predPct2 - pctA;
    const calib = bias1 == null || bias2 == null ? null : Math.abs(bias1) - Math.abs(bias2);
    const mine = main.filter((x) => x.a === no || x.b === no);
    const shownLeft = mine.filter((x) => (x.left === "a" ? x.a : x.b) === no).length;
    const received = mine.filter((x) => x.why).map((x) => ({ why: x.why, tag: x.tag, won: x.winNo === no, conf: x.conf }));
    const row = {
      no, sid, theta: bt.theta[no], se: bt.se[no], rank: rb.rank[no], n, pct: pctA, band: rb.band[no],
      plays: bt.plays[no], wins: bt.wins[no], leftRate: mine.length ? shownLeft / mine.length : null,
      received, predPct1, predPct2, bias1, bias2, calib,
    };
    works.push(row);
    results[sid] = { ...row, aggAt, rosterVer: roster.fixedAt || "", reveal: conf.reveal };
  });
  works.sort((x, y) => (x.rank == null) - (y.rank == null) || (x.rank - y.rank) || cmp(x.no, y.no));

  const cautions = [];
  if (!main.length) reasons.push("판정이 아직 없습니다.");
  if (quality.perWorkMean < QUALITY_MIN.perWork) reasons.push("작품당 평균 비교 수가 " + fmtNum(quality.perWorkMean, 1) + "회로 " + QUALITY_MIN.perWork + "회에 못 미칩니다.");
  if (!quality.connectivity.connected) reasons.push("비교 그래프가 하나로 이어지지 않습니다. 아직 판정하지 않은 학생이 있으면 기다리고, 모두 마쳤는데도 그렇다면 명단을 다시 확정해야 합니다.");
  if (quality.droppedN) reasons.push("배정표와 맞지 않는 판정 " + quality.droppedN + "건을 제외했습니다 (" + quality.droppedJudges.join(", ") + ").");
  if (quality.ssr != null && quality.ssr < QUALITY_MIN.ssr) reasons.push("척도분리신뢰도(SSR)가 " + fmtNum(quality.ssr) + "로 " + QUALITY_MIN.ssr + " 아래입니다.");
  else if (quality.ssr != null && quality.ssr < QUALITY_MIN.ssrAdopt) cautions.push("SSR " + fmtNum(quality.ssr) + "은(는) 논문 채택 기준 " + QUALITY_MIN.ssrAdopt + "에는 못 미칩니다. 공개는 되지만 결과 화면의 주의 문구가 켜지고, 판정을 더 받으면 나아집니다.");
  if (quality.splitHalf.median != null && quality.splitHalf.median < QUALITY_MIN.splitHalf) cautions.push("판정자 반분 신뢰도 중앙값 " + fmtNum(quality.splitHalf.median) + "(보정 전 " + fmtNum(quality.splitHalf.medianRaw) + ")은 반쪽 자료의 작품당 노출이 절반이라 낮게 나오는 것이 보통이므로 보고 지표로만 둡니다.");
  if (quality.splitHalf.median == null && main.length) cautions.push("반분 신뢰도를 계산할 만큼 판정자가 모이지 않았습니다.");
  if (quality.knowRate != null && quality.knowRate >= 0.2) cautions.push("판정의 " + Math.round(quality.knowRate * 100) + "%에서 「누구 작품인지 알 것 같다」가 표시됐습니다. 익명성 민감도 분석이 필요합니다.");
  const caution = reasons.length === 0 && cautions.length > 0;
  // 학생 화면의 주의 문구는 보류 사유가 있는데도 교사가 알고 공개한 경우에도 켜져야 한다
  Object.keys(results).forEach((sid) => { results[sid].caution = cautions.length > 0 || reasons.length > 0; results[sid].ssr = quality.ssr; });
  return { works, quality, results, ok: reasons.length === 0, caution, reasons, cautions, aggAt };
}

/* ---------- CSV ---------- */

const pidFn = (pidOf) => (typeof pidOf === "function" ? pidOf : pidOf && typeof pidOf.get === "function" ? (sid) => pidOf.get(sid) : (sid) => (pidOf || {})[sid]);
const cell = (v) => (v == null ? "" : v);
const r3 = (x) => (Number.isFinite(x) ? Math.round(x * 1000) / 1000 : "");

export function csvSubmissions({ roster, subMap, pidOf }) {
  const pid = pidFn(pidOf);
  const inRoster = new Set(((roster && roster.works) || []).map((w) => w.sid));
  const head = ["pid", "work_no", "in_roster", "title", "relic", "year", "era", "mat", "size", "context_len", "coll", "ai_level", "note_len", "has_img", "submitted_at"];
  const rows = Object.keys(subMap || {}).sort(cmp).filter((sid) => subMap[sid] && subMap[sid].locked).map((sid) => {
    const s = subMap[sid], p = s.plate || {};
    return [pid(sid), s.no, inRoster.has(sid) ? 1 : 0, s.title, p.relic, p.year, p.era, p.mat, p.size, trimStr(p.context).length, p.coll,
      s.aiLevel, trimStr(s.note).length, s.img && s.img.ref ? 1 : 0, s.submittedAt].map(cell);
  });
  return { head, rows };
}

/* 판정 단위 CSV — 이 명단의 판정은 배정표 대조를 거친 것(valid=1)만, 옛 명단·대조 탈락 항목은 valid=0으로 함께 */
export function csvJudgements({ roster, assessMap, pidOf }) {
  const pid = pidFn(pidOf);
  const head = ["pid", "roster_ver", "valid", "screen_i", "work_a", "work_b", "left", "rep_of", "win", "win_no", "chosen_first", "axis", "vw", "conf", "hard", "know_author", "tag", "ms", "fast_override", "plate_opened", "why_len", "why", "at"];
  const rows = [];
  const J = collectJudgements(assessMap, roster);
  J.forEach((x) => rows.push([pid(x.judge), roster && roster.fixedAt, 1, x.i, x.a, x.b, x.left, x.rep == null ? "" : x.rep, x.win, x.winNo, x.chosenLeft ? 1 : 0,
    x.axis || "", x.vw, x.conf, x.hard ? 1 : 0, x.knowAuthor ? 1 : 0, x.tag, x.ms, x.fastOverride ? 1 : 0, x.plateOpened ? 1 : 0, x.why.length, x.why, x.at].map(cell)));
  const ownNo = {};
  ((roster && roster.works) || []).forEach((w) => { if (w && w.sid) ownNo[trimStr(w.sid)] = trimStr(w.no); });
  Object.keys(assessMap || {}).sort(cmp).forEach((sid) => {
    const judge = (assessMap[sid] && assessMap[sid].judge) || {};
    const expected = roster ? myPairs(roster, sid) : [];
    const mine = ownNo[trimStr(sid)] || null;
    Object.keys(judge).sort(cmp).forEach((key) => {
      const b = judge[key];
      if (!b || !Array.isArray(b.items)) return;
      const isCur = roster && (b.rosterVer || null) === (roster.fixedAt || null) && (b.planHash || null) === (roster.hash || null);
      const seenI = new Set();
      b.items.forEach((it) => {
        if (!it || (it.win !== "a" && it.win !== "b")) return;
        if (isCur) {
          // collectJudgements와 같은 규칙으로 "받아들여진 첫 항목"만 건너뛴다 — 같은 i의 중복·변조는 valid=0으로 남긴다
          const e = Number.isInteger(it.i) ? expected[it.i] : null;
          const repOk = e && ((e.rep == null && it.rep == null) || (e.rep != null && it.rep != null && e.rep === it.rep));
          const accepted = !!(e && !seenI.has(it.i) && e.a === it.a && e.b === it.b && e.left === it.left && repOk && !(mine && (it.a === mine || it.b === mine)));
          if (accepted) { seenI.add(it.i); return; }
        }
        rows.push([pid(sid), b.rosterVer || "", 0, it.i, it.a, it.b, it.left, it.rep == null ? "" : it.rep, it.win, it.win === "a" ? it.a : it.b, it.win === it.left ? 1 : 0,
          it.axis || "", it.vw, it.conf, it.hard ? 1 : 0, it.knowAuthor ? 1 : 0, it.tag, it.ms, it.fastOverride ? 1 : 0, it.plateOpened ? 1 : 0, trimStr(it.why).length, trimStr(it.why), it.at].map(cell));
      });
    });
  });
  return { head, rows };
}

/* 판정자 단위 CSV — 적합도·역방향률·위치·시간·이유 품질 (설계 §7 judgeFit) */
export function csvJudges({ agg, pidOf }) {
  const pid = pidFn(pidOf);
  const head = ["pid", "n", "infit", "outfit", "flag", "against", "n_gap", "against_rate", "left_rate", "median_ms", "fast_n", "dup_why_n", "short_why_n", "conf_mean", "plate_open_rate", "hard_n", "know_n"];
  const judges = (agg && agg.quality && agg.quality.judges) || {};
  const rows = Object.keys(judges).sort(cmp).map((sid) => {
    const f = judges[sid];
    return [pid(sid), f.n, r3(f.infit), r3(f.outfit), f.flag ? 1 : 0, f.against, f.nGap, r3(f.againstRate), r3(f.leftRate), f.medianMs, f.fastN, f.dupWhyN, f.shortWhyN, r3(f.confMean), r3(f.plateOpenRate), f.hardN, f.knowN].map(cell);
  });
  return { head, rows };
}

export function csvSelf({ roster, assessMap, pidOf }) {
  const pid = pidFn(pidOf);
  const head = ["pid", "phase", "overall", "veri", "cause", "plate", "voice", "why", "pred_rank", "n", "pred_pct", "started_at", "submitted_at", "dur_sec", "locked_at", "change_code", "change_why"];
  const rows = [];
  Object.keys(assessMap || {}).sort(cmp).forEach((sid) => {
    const self = (assessMap[sid] && assessMap[sid].self) || {};
    ["s1", "s2"].forEach((ph) => {
      const s = self[ph];
      if (!s || !(s.submittedAt || (ph === "s2" && s.lockedAt))) return;
      const sc = s.scores || {};
      rows.push([pid(sid), ph, sc.overall, sc.veri, sc.cause, sc.plate, sc.voice, s.why, s.predRank, s.n,
        r3(Number.isFinite(s.predPct) ? s.predPct : predPctOf(s.predRank, s.n)), s.startedAt, s.submittedAt, s.durSec, s.lockedAt, s.changeCode, s.changeWhy].map(cell));
    });
  });
  return { head, rows };
}

export function csvScores({ agg, pidOf }) {
  const pid = pidFn(pidOf);
  const head = ["pid", "work_no", "theta", "se", "rank", "n", "pct", "band", "plays", "wins", "left_rate", "pred_pct1", "pred_pct2", "bias1", "bias2", "calib", "n_received"];
  const rows = ((agg && agg.works) || []).map((w) => [pid(w.sid), w.no, r3(w.theta), r3(w.se), w.rank, w.n, r3(w.pct), w.band, w.plays, w.wins,
    r3(w.leftRate), r3(w.predPct1), r3(w.predPct2), r3(w.bias1), r3(w.bias2), r3(w.calib), (w.received || []).length].map(cell));
  return { head, rows };
}

/* ---------- 표본 (교사 화면 sampleMode) ---------- */

/* 화면 구조를 보여 주기 위한 가상 자료. 진짜 능력값을 정해 두고 그 차이로 승패를 뽑으므로
   집계표·신뢰도·적합도가 그럴듯한 값으로 채워진다. 같은 ids면 늘 같은 결과다 */
export function buildSampleAssess(ids) {
  const sids = (ids || []).slice().sort(cmp);
  const seed = "sample-2026";
  const rnd = mulberry32(stableHash(seed));
  const TITLES = ["오른손", "이름을 지운 사람", "삼십 분", "출입", "다음 봄", "개지 않은 날", "발이 판 자리", "엉킨 밤", "수위선", "마지막 식판"];
  const RELICS = ["손잡이 파편", "이름표가 떨어진 안전모", "열에 변형된 배달 가방", "인쇄가 벗겨진 출입증", "봉인된 종자 보관함", "펴진 채 굳은 우산", "닳아 얇아진 계단코", "충전기 뭉치", "도장 박리 수납함 조각", "유약이 갈라진 식판"];
  const subMap = {};
  const works = [];
  sids.forEach((sid, i) => {
    if (i >= TITLES.length) return;
    const no = "A-" + String(i + 1).padStart(2, "0");
    subMap[sid] = {
      ver: ASSESS_VER, no, title: TITLES[i],
      plate: { relic: RELICS[i], year: "2300년", era: "21세기 초", mat: "복합 재질", size: "길이 20cm 안팎", context: "학교 주변에서 수습된 것으로 기록됨", coll: "학급 가상 컬렉션", notice: "이 이미지는 생성형 AI로 제작한, 실재한 적 없는 유물입니다." },
      aiLevel: "", note: "", img: null, submittedAt: "2026-04-02T05:0" + (i % 10) + ":00.000Z", locked: true,
    };
    works.push({ no, sid });
  });
  const fixedAt = "2026-04-02T05:20:00.000Z";
  const cfg = { ...DEFAULT_PEER, stage: "result", k: Math.min(12, Math.max(3, works.length - 1)) };
  const made = makePlan({ works, judges: sids, k: cfg.k, repeat: cfg.repeat, seed: fixedAt });
  if (made.errors.length) return { roster: null, subMap, assessMap: {}, cfg };   // 표본이 4명 미만이면 명단을 만들 수 없다
  const roster = { ver: ROSTER_VER, fixedAt, seed: fixedAt, k: made.kEff, repeat: cfg.repeat, works, judges: sids, plan: made.plan, hash: made.hash, stats: made.stats };
  const truth = {};
  works.forEach((w, i) => { truth[w.no] = ((stableHash(seed + w.no) % 1000) / 1000 - 0.5) * 3; });
  const n = works.length;
  const rankTrue = ranksAndBands(truth).rank;
  const assessMap = {};
  const WHY = ["손잡이 안쪽만 닳아 있어서 실제로 쥐고 쓴 물건처럼 보였다", "빛 방향이 하나로 맞아 기록 사진의 형식이 성립한다", "작품 캡션을 읽고 나니 파손 자리가 쓰임과 이어져 읽혔다", "어떤 문제를 고발하는지 이미지만으로도 읽혔다", "배경과 그림자가 어긋나 합성처럼 보여 덜 설득됐다"];
  sids.forEach((sid, si) => {
    const items = (roster.plan[sid] || []).map((it) => {
      const P = sigmoid(truth[it.a] - truth[it.b] + (rnd() - 0.5) * 1.2);
      const win = rnd() < P ? "a" : "b";
      return { ...it, win, conf: null, hard: rnd() < 0.25, knowAuthor: rnd() < 0.05, why: WHY[(si + it.i) % WHY.length], tag: TAG_OPTIONS[(si + it.i) % TAG_OPTIONS.length].k,
        ms: 9000 + Math.floor(rnd() * 40000), plateOpened: rnd() < 0.6, at: "2026-04-02T05:3" + (it.i % 10) + ":00.000Z" };
    });
    const own = works.find((w) => w.sid === sid);
    const sc = (bias) => { const o = {}; SELF_ITEMS.forEach((it, j) => { o[it.k] = Math.max(1, Math.min(5, 3 + bias + ((si + j) % 3) - 1)); }); return o; };
    const pr1 = own ? Math.max(1, Math.min(n, rankTrue[own.no] - 3 + (si % 4))) : null;
    const pr2 = own ? Math.max(1, Math.min(n, rankTrue[own.no] - 1 + (si % 3))) : null;
    assessMap[sid] = {
      ver: ASSESS_VER,
      self: own ? {
        s1: { scores: sc(1), why: "손잡이의 마모가 쓰임과 이어져 보인다", predRank: pr1, n, predPct: predPctOf(pr1, n), startedAt: "2026-04-02T05:05:00.000Z", submittedAt: "2026-04-02T05:10:00.000Z", durSec: 300 },
        s2: { scores: sc(0), why: "다른 작품과 견주니 배경 처리가 약해 보인다", predRank: pr2, n, predPct: predPctOf(pr2, n), lockedAt: "2026-04-02T06:00:00.000Z", changeCode: si % 2 ? "shifted" : "same", changeWhy: "비교하며 조명 방향을 보게 됐다", startedAt: "2026-04-02T05:55:00.000Z", submittedAt: "2026-04-02T06:03:00.000Z", durSec: 480 },
      } : {},
      judge: { p1: { rosterVer: fixedAt, planHash: made.hash, k: made.kEff, repeat: cfg.repeat, items, startedAt: "2026-04-02T05:12:00.000Z", submittedAt: "2026-04-02T05:40:00.000Z" } },
    };
  });
  return { roster, subMap, assessMap, cfg };
}
