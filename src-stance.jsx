/* ============================================================
   평가자 성향 설문 (s1) — AI 사용량 · AI에 대한 태도와 감정 · 예술에 대한 태도

   무엇을 위한 것인가: 8차시 상호평가에서 학생이 동료 작품을 어떻게 판정하는지
   (특히 명제표에 고지된 AI 활용 범위를 얼마나 깎는지)를 설명할 개인차를 잰다.
   설계 근거와 문항 출처는 평가자_성향_설문_설계.md에 있다.

   창의성 설문 v1(SURVEY_VER)과 독립이다 — 같은 surveys/{학번} 문서 안의
   stance 블록에 따로 저장하고, 문항을 고치면 STANCE_VER만 올린다.
   v1의 문항·채점은 건드리지 않으므로 사전·사후 비교의 동일성이 유지된다.

   화면 원칙(고2 대상, 42문항 한 번에 훑는 긴 설문):
   - 머리띠를 고정해 지금 어느 묶음에 있고 몇 문항 했는지 늘 보이게 한다.
   - 숫자 보기의 뜻(1이 무엇, 5가 무엇)이 스크롤로 사라지지 않게 한다.
   - 묶음 이름은 학생의 말로 적는다. 척도 이름("인간중심 창의성 신념" 같은)은
     보여 주지 않는다 — 무엇을 재는지 알려 주면 답이 그쪽으로 쏠린다.
   ============================================================ */

import React, { useState, useEffect, useRef } from "react";

export const STANCE_VER = "s1";

const LIK5 = ["전혀 그렇지 않다", "그렇지 않다", "보통이다", "그렇다", "매우 그렇다"];
const FREQ6 = ["전혀 안 쓴다", "한 달에 한두 번", "일주일에 한두 번", "일주일에 서너 번", "거의 매일", "하루에 여러 번"];
const FREQ4 = ["없다", "한두 번", "서너 번", "다섯 번 이상"];
const KNOW4 = ["처음 본다", "들어는 봤다", "뜻을 안다", "설명할 수 있다"];
const EMO4 = ["전혀 없다", "조금", "꽤", "많이"];
const EMO_WORDS = ["설렘", "호기심", "감탄", "불안", "거부감", "허탈함", "부러움", "아무 느낌 없음"];
const ART_WORDS = ["콜라주", "레디메이드", "아카이브", "큐레이팅", "미니멀리즘", "파라픽션"];
const NONE_OPT = "쓴 적 없다";

/* 학생에게 보이는 묶음 이름 — 재는 구성개념이 아니라 묻는 내용으로 적는다 */
export const STANCE_BLOCKS = [
  { k: "use", t: "AI를 얼마나, 어떻게 쓰는가", d: "잘 쓰는지 묻는 것이 아닙니다. 요즘 실제로 쓰는 모습 그대로 고르세요." },
  { k: "att", t: "AI에 대한 생각", d: "좋다·싫다 하나를 고르는 것이 아니라, 문장마다 얼마나 동의하는지 답합니다." },
  { k: "emo", t: "AI에 대한 느낌", d: "생각과 느낌은 다를 수 있습니다. 지금 드는 느낌 그대로 고르세요." },
  { k: "blf", t: "무엇이 작품을 좋게 만드는가", d: "정답이 없는 질문입니다. 내 기준에 가까운 쪽을 고르세요." },
  { k: "art", t: "예술에 대한 나의 태도", d: "미술을 잘하는지 묻는 것이 아니라, 미술을 어떻게 대하는지 묻습니다." },
];

/* 채점 척도 — 학생 화면에는 나오지 않고 교사 화면과 CSV에만 쓴다 */
export const STANCE_SCALES = [
  { k: "atp", name: "AI 긍정 태도", src: "Schepman & Rodway(2020·2026) GAAIS 축약 번안" },
  { k: "atn", name: "AI 우려", src: "GAAIS 부정 하위척도 축약 번안" },
  { k: "thr", name: "AI 위협감", src: "AI 불안 척도 · Zhang 외(2026) 존재적 위협 기반" },
  { k: "exc", name: "AI 흥미", src: "자체 개발" },
  { k: "ant", name: "인간중심 창의성 신념", src: "Millet 외(2023) 번안" },
  { k: "eff", name: "노력 귀속", src: "Magni 외(2023) · Bellaiche 외(2023) 기반 자체 개발" },
  { k: "aut", name: "진정성·작가성", src: "Messer(2024) 기반 자체 개발" },
  { k: "aop", name: "미적 개방성", src: "Silvia(2013) 기반 자체 개발" },
  { k: "asi", name: "미술 자기정체성", src: "Grassini 외(2024) 창의적 자기정체성 참조" },
];

/* t 없는 문항은 5점 리커트. one=하나 고르기, many=모두 고르기, grid=낱말표
   rev=역문항(6-x로 뒤집어 채점, 학생 화면에는 표시하지 않는다)
   short=시간이 부족할 때 남기는 단축형 23문항 */
export const STANCE_ITEMS = [
  // 묶음 1 — AI를 얼마나, 어떻게 쓰는가
  { k: "u1", b: "use", t: "one", o: ["써 본 적 없다", "최근 6개월 안", "1년쯤 전", "2년쯤 전", "3년 이상 전"], text: "생성형 AI(챗GPT·클로드·이미지 생성 도구 등)를 처음 써 본 것은 언제인가요?" },
  { k: "u2", b: "use", t: "one", o: FREQ6, short: 1, text: "요즘 한 달을 기준으로, 생성형 AI를 얼마나 자주 쓰나요?" },
  { k: "u3", b: "use", t: "one", o: FREQ6, short: 1, text: "그림이나 이미지를 만들어 주는 AI는 얼마나 자주 쓰나요?" },
  { k: "u4", b: "use", t: "many", short: 1, none: NONE_OPT, text: "최근 한 달 동안 AI를 어떤 일에 써 봤나요? (해당하는 것 모두)", o: ["숙제·수행평가의 답 찾기", "글쓰기(초안이나 다듬기)", "모르는 것 물어보고 설명 듣기", "번역", "그림·이미지 만들기", "영상·음악 만들기", "코딩", "고민 상담이나 그냥 대화", "재미로 이것저것", NONE_OPT] },
  { k: "u5", b: "use", t: "one", short: 1, o: ["처음 나온 결과를 거의 그대로 쓴다", "한두 번 고친다", "서너 번 고친다", "대여섯 번 고친다", "원하는 것이 나올 때까지 계속 고친다"], text: "AI에게 무언가를 시킬 때, 보통 몇 번쯤 고쳐 가며 다시 시키나요?" },
  { k: "u6", b: "use", t: "one", o: ["없다", "한두 번", "여러 번", "자주"], note: "성적과 관계없고, 누가 어떻게 답했는지 따로 확인하지 않습니다.", text: "AI가 만들어 준 것을 거의 고치지 않고 그대로 낸 적이 있나요?" },
  { k: "u7", b: "use", t: "one", o: ["남에게 보인 적이 없다", "거의 밝히지 않는다", "물어보면 밝힌다", "대체로 먼저 밝힌다", "항상 먼저 밝힌다"], text: "AI로 만든 것을 남에게 보일 때, AI를 썼다는 사실을 밝히는 편인가요?" },
  { k: "b1", b: "use", s: "aie", text: "나는 AI 도구를 내가 원하는 대로 다룰 줄 안다." },

  // 묶음 2 — AI에 대한 생각
  { k: "b2", b: "att", s: "atp", short: 1, text: "AI는 앞으로 사람들의 삶을 더 낫게 만들 것이다." },
  { k: "b3", b: "att", s: "atp", short: 1, text: "AI 덕분에 내가 할 수 있는 일이 늘어난다." },
  { k: "b4", b: "att", s: "atp", text: "학교 공부나 작업에 AI를 쓰는 것은 바람직한 일이다." },
  { k: "b5", b: "att", s: "atp", text: "앞으로는 AI를 다룰 줄 아는 것이 중요한 능력이 될 것이다." },
  { k: "b6", b: "att", s: "atn", short: 1, text: "AI가 만든 것을 사람들이 지나치게 믿는 것이 걱정된다." },
  { k: "b7", b: "att", s: "atn", short: 1, text: "AI가 널리 쓰이면 사람이 스스로 생각하는 힘이 줄어들 것이다." },
  { k: "b8", b: "att", s: "atn", text: "AI를 만드는 회사들이 다른 사람의 작업물을 함부로 가져다 쓴다고 생각한다." },
  { k: "b9", b: "att", s: "atn", text: "AI 때문에 사라지는 일자리가 늘어날 것이다." },

  // 묶음 3 — AI에 대한 느낌
  { k: "b10", b: "emo", s: "thr", short: 1, text: "AI가 사람보다 잘하는 일이 늘어나는 것을 생각하면 불안하다." },
  { k: "b11", b: "emo", s: "thr", short: 1, text: "AI가 그림을 잘 그릴수록, 사람이 그리는 일의 가치는 줄어드는 것 같다." },
  { k: "b12", b: "emo", s: "thr", text: "내가 시간을 들여 만든 것이 AI 앞에서 초라해 보일 때가 있다." },
  { k: "b13", b: "emo", s: "exc", short: 1, text: "새로운 AI 도구가 나오면 어떤 것인지 써 보고 싶다." },
  { k: "b14", b: "emo", s: "exc", text: "AI가 뜻밖의 결과를 내놓으면 재미있다." },
  { k: "b15", b: "emo", t: "grid", w: EMO_WORDS, o: EMO4, base: 0, short: 1, text: "AI가 만든 그림을 볼 때, 다음과 같은 느낌이 얼마나 드나요?" },

  // 묶음 4 — 무엇이 작품을 좋게 만드는가
  { k: "b16", b: "blf", s: "ant", short: 1, text: "창의성은 사람만이 가질 수 있는 것이다." },
  { k: "b17", b: "blf", s: "ant", short: 1, rev: true, text: "사람이 만들었든 AI가 만들었든, 결과가 좋으면 창의적이라고 할 수 있다." },
  { k: "b18", b: "blf", s: "ant", text: "AI가 만든 것은 아무리 그럴듯해도 진짜 창작이라고 하기는 어렵다." },
  { k: "b19", b: "blf", s: "eff", short: 1, text: "작품의 값어치는 만든 사람이 들인 시간과 노력에 달려 있다." },
  { k: "b20", b: "blf", s: "eff", text: "쉽고 빠르게 만든 것은 그만큼 덜 인정받는 것이 맞다." },
  { k: "b21", b: "blf", s: "aut", text: "좋은 작품에는 만든 사람이 진짜 하고 싶은 말이 담겨 있어야 한다." },
  { k: "b22", b: "blf", s: "aut", text: "누가 어떻게 만들었는지 알고 나면, 같은 작품도 달라 보인다." },
  { k: "b23", b: "blf", s: "dis", short: 1, text: "작품에 AI를 썼다면 그 사실을 반드시 밝혀야 한다." },
  { k: "b24", b: "blf", s: "dis", short: 1, text: "AI를 썼다고 밝힌 작품이 그렇지 않은 작품보다 낮게 평가받는 것은 어쩔 수 없는 일이다." },

  // 묶음 5 — 예술에 대한 나의 태도
  { k: "u8", b: "art", t: "one", o: FREQ4, short: 1, text: "최근 1년 동안 미술관이나 전시를 보러 간 적 (학교 단체 관람은 빼고)" },
  { k: "u9", b: "art", t: "one", o: FREQ4, text: "최근 1년 동안 작품이나 작가를 내가 찾아본 적 (인터넷·책·영상 모두 포함)" },
  { k: "u10", b: "art", t: "one", o: FREQ4, text: "최근 1년 동안 그림·사진·영상 같은 것을 내가 만들어 본 적 (수행평가는 빼고)" },
  { k: "b25", b: "art", s: "aop", short: 1, rev: true, text: "예쁘거나 잘 그린 작품이 좋은 작품이다." },
  { k: "b26", b: "art", s: "aop", short: 1, text: "무슨 뜻인지 바로 알기 어려운 작품도 볼 만하다고 생각한다." },
  { k: "b27", b: "art", s: "aop", text: "처음에는 이상해 보이던 작품이 설명을 듣고 다시 보니 달라 보인 적이 있다." },
  { k: "b28", b: "art", s: "afn", short: 1, text: "예술은 세상의 문제를 드러내고 질문을 던지는 일이기도 하다." },
  { k: "b29", b: "art", s: "afn", text: "예술이 하는 가장 중요한 일은 아름다운 것을 만드는 일이다." },
  { k: "b30", b: "art", s: "asi", short: 1, rev: true, text: "미술은 나와 별로 상관없는 과목이다." },
  { k: "b31", b: "art", s: "asi", text: "미술 시간에 하는 일은 나에게 의미가 있다." },
  { k: "b32", b: "art", t: "grid", w: ART_WORDS, o: KNOW4, base: 1, short: 1, text: "다음 말을 어느 정도 알고 있나요?" },
];

/* 사후에 다시 묻는 문항 — 태도·느낌·신념(b2~b24)과 낱말표.
   예술 관심(u8~u10)은 "최근 1년" 기준이라 8주 만에 다시 물을 수 없어 뺀다. */
export const STANCE_POST_KEYS = STANCE_ITEMS
  .map((it) => it.k)
  .filter((k) => /^b([2-9]|1[0-9]|2[0-4])$/.test(k))
  .concat("b32");

export const stanceItemsFor = (phase) =>
  phase === "post" ? STANCE_ITEMS.filter((it) => STANCE_POST_KEYS.indexOf(it.k) >= 0) : STANCE_ITEMS;

export const stanceDone = (block) => !!(block && block.submittedAt);

/* 한 문항이 답해졌는가 — 격자는 낱말이 모두 차야 하고, 느낌표는 0도 답이다 */
export function itemAnswered(it, v) {
  if (it.t === "grid") return !!v && it.w.every((w) => typeof v[w] === "number");
  if (it.t === "many") return Array.isArray(v) && v.length > 0;
  return typeof v === "number" && v >= 1;
}

export const stanceCount = (ans, items) =>
  items.filter((it) => itemAnswered(it, (ans || {})[it.k])).length;

/* 응답 → 척도별 점수. 리커트는 1~5 평균(rev는 6-x), 나머지는 규칙대로 파생 */
export function stanceScores(ans) {
  const a = ans || {};
  const out = {};
  for (const sc of STANCE_SCALES) {
    const vals = STANCE_ITEMS.filter((it) => it.s === sc.k)
      .map((it) => { const v = a[it.k]; return v >= 1 && v <= 5 ? (it.rev ? 6 - v : v) : null; })
      .filter((v) => v != null);
    out[sc.k] = vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null;
  }
  const g = (k, w) => (a[k] && typeof a[k][w] === "number" ? a[k][w] : null);
  const mean = (xs) => { const v = xs.filter((x) => x != null); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };
  out.emoP = mean(["설렘", "호기심", "감탄"].map((w) => g("b15", w)));
  out.emoN = mean(["불안", "거부감", "허탈함"].map((w) => g("b15", w)));
  out.emoEnv = g("b15", "부러움");
  out.emoZ = g("b15", "아무 느낌 없음");
  out.akn = mean(ART_WORDS.map((w) => g("b32", w)));
  out.aknX = mean(ART_WORDS.filter((w) => w !== "파라픽션").map((w) => g("b32", w))); // 수업에서 배우는 말 제외
  out.ain = mean(["u8", "u9", "u10"].map((k) => (a[k] >= 1 ? a[k] : null)));
  out.afn = (a.b28 >= 1 && a.b29 >= 1) ? a.b28 - a.b29 : null;
  out.dis1 = a.b23 >= 1 ? a.b23 : null; // 밝혀야 한다
  out.dis2 = a.b24 >= 1 ? a.b24 : null; // 감점은 어쩔 수 없다 — 합치지 않는다
  out.useFreq = a.u2 >= 1 ? a.u2 : null;
  out.useImg = a.u3 >= 1 ? a.u3 : null;
  out.useBreadth = Array.isArray(a.u4) ? a.u4.filter((x) => x !== NONE_OPT).length : null;
  out.useDepth = a.u5 >= 1 ? a.u5 : null;
  out.useRaw = a.u6 >= 1 ? a.u6 : null;
  out.useDisc = a.u7 >= 2 ? a.u7 : null; // 1번(해당 없음)은 결측
  out.aie = a.b1 >= 1 ? a.b1 : null;
  return out;
}

/* CSV 열 이름 — 「연구」 탭에서 쓴다 */
export const STANCE_DERIVED = [
  "atp", "atn", "thr", "exc", "emoP", "emoN", "emoEnv", "emoZ", "ant", "eff", "aut",
  "dis1", "dis2", "aop", "afn", "asi", "ain", "akn", "aknX",
  "useFreq", "useImg", "useBreadth", "useDepth", "useRaw", "useDisc", "aie",
];

/* 문항 하나를 CSV 한 칸으로 — 격자는 낱말별로 펼친다 */
export function stanceFlatCols() {
  const cols = [];
  STANCE_ITEMS.forEach((it) => {
    if (it.t === "grid") it.w.forEach((w) => cols.push(it.k + "." + w));
    else cols.push(it.k + (it.rev ? "(역)" : ""));
  });
  return cols;
}
export function stanceFlatRow(ans) {
  const a = ans || {};
  const row = [];
  STANCE_ITEMS.forEach((it) => {
    if (it.t === "grid") it.w.forEach((w) => row.push(a[it.k] && typeof a[it.k][w] === "number" ? a[it.k][w] : ""));
    else if (it.t === "many") row.push(Array.isArray(a[it.k]) ? a[it.k].join("|") : "");
    else row.push(a[it.k] != null ? a[it.k] : "");
  });
  return row;
}

/* ---------- 학생 화면 ---------- */

export function StanceCard({ phase, block, onChange, onSubmit, busy }) {
  const sv = block || {};
  const ans = sv.ans || {};
  const isPost = phase === "post";
  const items = stanceItemsFor(phase);
  const total = items.length;
  const done = stanceCount(ans, items);
  const blocks = STANCE_BLOCKS.filter((b) => items.some((it) => it.b === b.k));

  const [act, setAct] = useState(0);      // 지금 보고 있는 묶음
  const [topH, setTopH] = useState(56);   // 상단 띠 높이 — 그 아래에 머리띠를 붙인다
  const [miss, setMiss] = useState(false); // 남은 문항 표시 켜기
  const barRef = useRef(null);
  const secRefs = useRef([]);
  const cardRef = useRef(null);

  /* 상단 띠 높이는 화면 폭에 따라 바뀐다 — 재서 붙인다 */
  useEffect(() => {
    const measure = () => {
      const tb = document.querySelector(".topbar");
      setTopH(tb ? Math.round(tb.getBoundingClientRect().height) : 56);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  /* 스크롤에 따라 머리띠의 묶음 이름을 바꾼다 */
  useEffect(() => {
    if (stanceDone(sv)) return undefined;
    const onScroll = () => {
      const bar = barRef.current;
      const line = (bar ? bar.getBoundingClientRect().bottom : topH) + 12;
      let cur = 0;
      secRefs.current.forEach((el, i) => { if (el && el.getBoundingClientRect().top <= line) cur = i; });
      setAct((p) => (p === cur ? p : cur));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [topH, blocks.length, sv.submittedAt]);

  if (stanceDone(sv)) {
    return (
      <div className="ok-note">
        {isPost ? "사후" : "사전"} 성향 설문을 제출했습니다 · {fmtT(sv.submittedAt)} — 솔직하게 답해 주어 고맙습니다.
      </div>
    );
  }

  const touch = (next) => onChange({ ...sv, startedAt: sv.startedAt || nowISO(), ans: next });
  const setOne = (k, n) => touch({ ...ans, [k]: n });
  const setGrid = (k, w, n) => touch({ ...ans, [k]: { ...(ans[k] || {}), [w]: n } });
  const toggleMany = (it, opt) => {
    const cur = Array.isArray(ans[it.k]) ? ans[it.k] : [];
    let next;
    if (opt === it.none) next = cur.indexOf(opt) >= 0 ? [] : [opt];            // "쓴 적 없다"는 혼자만 선택된다
    else next = cur.indexOf(opt) >= 0 ? cur.filter((x) => x !== opt) : cur.filter((x) => x !== it.none).concat(opt);
    touch({ ...ans, [it.k]: next });
  };

  const goMissing = () => {
    setMiss(true);
    const first = items.find((it) => !itemAnswered(it, ans[it.k]));
    if (!first) return;
    const el = cardRef.current && cardRef.current.querySelector('[data-sk="' + first.k + '"]');
    if (!el) return;
    const y = window.pageYOffset + el.getBoundingClientRect().top - (topH + 118);
    window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
  };

  const b = blocks[act] || blocks[0];
  const likertHere = items.some((it) => it.b === b.k && !it.t);
  const pct = Math.round((done / total) * 100);

  return (
    <div className="card st-card" ref={cardRef}>
      <div className="card-head">
        <span className="card-code">{isPost ? "사후 설문 2" : "사전 설문 2"}</span>
        <span className="card-title">작품을 보는 나의 눈</span>
        <span className="card-sess">{total}문항 · 약 {isPost ? 5 : 8}분</span>
      </div>
      <div className="card-note">
        정답이 없고 성적과도 관계없는 설문입니다. 여러분이 작품을 어떤 눈으로 보는지 알아보려는 것이고, 개인의 답을 따로 확인하지 않습니다.
        {isPost ? " 단원을 모두 마친 지금의 생각으로 답합니다. 사전에 무엇이라 답했는지 기억해 맞출 필요는 없습니다." : " 잘 보이려는 답 말고 지금의 나에게 가장 가까운 답을 고르세요."}
      </div>

      <div className="card-body">
        {/* 고정 머리띠 — 어디에 있고 얼마나 했고 숫자가 무슨 뜻인지 */}
        <div className="st-sticky" ref={barRef} style={{ top: topH }}>
          <div className="st-row1">
            <span className="st-bno">{act + 1}/{blocks.length}</span>
            <span className="st-bt">{b.t}</span>
            <span className="st-count"><b>{done}</b> / {total}</span>
          </div>
          <div className="st-prog" aria-hidden="true"><i style={{ width: pct + "%" }} /></div>
          <div className="st-bd">{b.d}</div>
          {likertHere ? (
            <div className="st-legend">
              {LIK5.map((l, i) => <span key={i}><b>{i + 1}</b>{l}</span>)}
            </div>
          ) : (
            <div className="st-legend st-legend-alt">문항마다 보기가 다릅니다 — 보기를 읽고 하나를 고르세요.</div>
          )}
        </div>

        {blocks.map((bl, bi) => {
          const list = items.filter((it) => it.b === bl.k);
          return (
            <section className="st-sec" key={bl.k} ref={(el) => { secRefs.current[bi] = el; }}>
              <div className="st-sec-h">
                <span className="st-sec-n">묶음 {bi + 1}</span>
                <h4>{bl.t}</h4>
                <p>{bl.d}</p>
              </div>
              {list.map((it) => {
                const v = ans[it.k];
                const bad = miss && !itemAnswered(it, v);
                const no = String(items.indexOf(it) + 1).padStart(2, "0");
                return (
                  <div className={"st-item" + (bad ? " st-bad" : "") + (it.t ? " st-wide" : "")} key={it.k} data-sk={it.k}>
                    <div className="sv-q">
                      <span className="sv-n">{no}</span>{it.text}
                      {it.note && <em className="st-note">{it.note}</em>}
                    </div>

                    {!it.t && (
                      <div className="likert" role="radiogroup" aria-label={it.text}>
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button key={n} className={v === n ? "on" : ""} role="radio" aria-checked={v === n}
                            title={LIK5[n - 1]} onClick={() => setOne(it.k, n)}>{n}</button>
                        ))}
                      </div>
                    )}

                    {it.t === "one" && (
                      <div className="st-opts" role="radiogroup" aria-label={it.text}>
                        {it.o.map((o, i) => (
                          <button key={o} className={v === i + 1 ? "on" : ""} role="radio" aria-checked={v === i + 1}
                            onClick={() => setOne(it.k, i + 1)}>{o}</button>
                        ))}
                      </div>
                    )}

                    {it.t === "many" && (
                      <div className="st-opts st-many" role="group" aria-label={it.text}>
                        {it.o.map((o) => {
                          const on = Array.isArray(v) && v.indexOf(o) >= 0;
                          return (
                            <button key={o} className={on ? "on" : ""} aria-pressed={on}
                              onClick={() => toggleMany(it, o)}>{on ? "✓ " : ""}{o}</button>
                          );
                        })}
                      </div>
                    )}

                    {it.t === "grid" && (
                      <div className="st-grid">
                        <div className="st-grid-key">
                          {it.o.map((l, i) => <span key={l}><b>{i + it.base}</b>{l}</span>)}
                        </div>
                        {it.w.map((w) => {
                          const gv = v && typeof v[w] === "number" ? v[w] : null;
                          return (
                            <div className="st-grow" key={w}>
                              <span className="st-gw">{w}</span>
                              <div className="likert" role="radiogroup" aria-label={it.text + " " + w}>
                                {it.o.map((l, i) => {
                                  const n = i + it.base;
                                  return (
                                    <button key={n} className={gv === n ? "on" : ""} role="radio" aria-checked={gv === n}
                                      title={l} onClick={() => setGrid(it.k, w, n)}>{n}</button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </section>
          );
        })}

        <div className="sv-foot">
          <button className="btn" disabled={done < total || busy} onClick={onSubmit}>
            {busy ? "제출 중…" : done < total ? "아직 " + (total - done) + "문항 남았습니다" : "제출하기"}
          </button>
          {done < total && (
            <button className="st-jump" onClick={goMissing}>남은 문항으로 가기 →</button>
          )}
          <span className="hint">답은 고르는 즉시 저장됩니다. 모두 답하면 제출 단추가 켜지고, 제출한 뒤에는 고칠 수 없습니다.</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- 교사 화면 조각 ---------- */

/* 학생 한 명의 성향 요약 — 학생 상세에 붙인다 */
export function StanceMini({ st }) {
  const pre = stanceDone(st && st.pre) ? stanceScores(st.pre.ans) : null;
  const post = stanceDone(st && st.post) ? stanceScores(st.post.ans) : null;
  if (!pre && !post) return null;
  const rows = STANCE_SCALES.concat([
    { k: "dis1", name: "고지해야 한다" }, { k: "dis2", name: "감점은 어쩔 수 없다" },
    { k: "emoP", name: "AI 그림 · 긍정 느낌" }, { k: "emoN", name: "AI 그림 · 부정 느낌" },
    { k: "ain", name: "예술 관심" }, { k: "akn", name: "예술 지식" },
  ]);
  const f = (v) => (v == null ? "-" : Math.round(v * 100) / 100);
  return (
    <div className="st-mini">
      <table className="roster">
        <thead><tr><th>척도</th><th>사전</th><th>사후</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.k}>
              <td>{r.name}</td>
              <td className="mono">{f(pre && pre[r.k])}</td>
              <td className="mono">{f(post && post[r.k])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">사용 빈도 {f(pre && pre.useFreq)} · 이미지 AI {f(pre && pre.useImg)} · 용도 수 {f(pre && pre.useBreadth)} · 고쳐 시키는 깊이 {f(pre && pre.useDepth)}</p>
    </div>
  );
}

/* ---------- 잔가지 ---------- */

const nowISO = () => new Date().toISOString();
const fmtT = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return p(d.getMonth() + 1) + "/" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
};

/* ---------- 화면 스타일 ----------
   거대한 CSS 상수를 건드리지 않도록 여기서 따로 내보낸다 (src-content.jsx와 같은 방식). */

const STANCE_CSS = `
.st-card{border-top:3px solid var(--patina)}
.st-card .card-body{padding-top:0}

/* 고정 머리띠 */
.st-sticky{position:sticky;z-index:15;margin:0 -18px 4px;padding:9px 18px 8px;
  background:var(--card);border-bottom:1px solid var(--line);box-shadow:0 6px 10px -8px rgba(36,38,31,.28)}
.st-row1{display:flex;align-items:baseline;gap:9px}
.st-bno{font-family:var(--mono);font-size:10px;letter-spacing:.14em;color:var(--patina);
  border:1px solid var(--patina);padding:1px 5px;flex:0 0 auto}
.st-bt{font-family:var(--serif);font-size:14px;font-weight:700;line-height:1.35;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.st-count{margin-left:auto;font-family:var(--mono);font-size:12px;color:var(--sub);
  font-variant-numeric:tabular-nums;flex:0 0 auto}
.st-count b{font-size:16px;color:var(--ink)}
.st-prog{height:4px;background:var(--line2);margin-top:7px;position:relative}
.st-prog i{position:absolute;left:0;top:0;bottom:0;background:var(--patina);transition:width .18s ease}
.st-bd{font-size:11px;color:var(--sub);margin-top:6px;line-height:1.5}
.st-legend{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:11px;color:var(--sub);margin-top:6px}
.st-legend b{font-family:var(--mono);color:var(--ink);margin-right:3px}
.st-legend-alt{color:var(--sub)}

/* 묶음 */
.st-sec{padding-top:6px}
.st-sec-h{margin:16px 0 2px;padding-top:12px;border-top:1px solid var(--line2)}
.st-sec-h .st-sec-n{font-family:var(--mono);font-size:10px;letter-spacing:.2em;color:var(--patina)}
.st-sec-h h4{font-family:var(--serif);font-size:15px;font-weight:700;margin-top:2px}
.st-sec-h p{font-size:12px;color:var(--sub);margin-top:3px;line-height:1.6}

/* 문항 */
.st-item{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;
  padding:9px 0;border-bottom:1px dashed var(--line2);scroll-margin-top:180px}
.st-item:last-of-type{border-bottom:none}
.st-item.st-wide{flex-direction:column;gap:8px}
.st-item .sv-q{font-size:13px;line-height:1.6;flex:1}
.st-item.st-bad{background:var(--seal-bg);box-shadow:0 0 0 6px var(--seal-bg)}
.st-item.st-bad .sv-n{color:var(--seal)}
.st-note{display:block;font-style:normal;font-size:11px;color:var(--sub);margin-top:4px}

/* 보기 고르기 */
.st-opts{display:flex;flex-wrap:wrap;gap:6px;width:100%}
.st-opts button{flex:0 1 auto;padding:8px 12px;border:1px solid var(--line);background:#fff;
  font-family:var(--sans);font-size:12.5px;color:var(--ink);cursor:pointer;text-align:left;line-height:1.4}
.st-opts button:hover{border-color:var(--ink)}
.st-opts button.on{background:var(--patina);border-color:var(--patina);color:#fff}
.st-many button.on{background:var(--patina-bg);border-color:var(--patina);color:var(--patina)}

/* 낱말표 */
.st-grid{width:100%;border:1px solid var(--line2);background:var(--card2);padding:10px 12px}
.st-grid-key{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:11px;color:var(--sub);
  padding-bottom:8px;margin-bottom:4px;border-bottom:1px dashed var(--line)}
.st-grid-key b{font-family:var(--mono);color:var(--ink);margin-right:3px}
.st-grow{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:5px 0}
.st-gw{font-size:13px}
.st-grid .likert button{width:30px;height:30px;font-size:12px}

/* 제출 */
.st-jump{background:none;border:none;color:var(--patina);font-family:var(--sans);font-size:12px;
  text-decoration:underline;cursor:pointer;padding:0}
.st-mini{margin-top:12px}

@media(max-width:560px){
  .st-bd{display:none}
  .st-legend span:nth-child(2),.st-legend span:nth-child(3),.st-legend span:nth-child(4){display:none}
  .st-item{flex-direction:column;gap:8px}
  .st-item .likert{align-self:flex-end}
  .st-opts button{flex:1 1 100%}
  .st-grow{gap:6px}
  .st-gw{font-size:12px}
}
`;

export function StanceStyle() { return <style>{STANCE_CSS}</style>; }
