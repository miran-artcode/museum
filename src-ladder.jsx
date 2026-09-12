/* ============================================================
   번역 사다리 (3차시 학습지): 데이터 정의와 스타일

   「번역」은 눈에 안 보이는 사회문제를 그 자리에 실제로 있는 물건에 남은
   자국으로 옮겨 적는 일이다. 사다리는 그 일을 일곱 계단으로 나눈다.

     계단 1 어떻게 볼까      (2차시 끝, 교실에서 고름)   s3o
     계단 2 무엇을 봤나      (한 주 과제)                s3a
     계단 3 문제 정하기      (3차시 수업)                s3p → 값은 s3a.problem·contact·why
     계단 4 안 보이는 것 찾기                            s3t1
     계단 5 물건 고르기                                  s3t2
     계단 6 흔적 정하기                                  s3t3
     계단 7 짝에게 읽히고 고쳐 쓰기                      s3t4
     돌아보기 (계단이 아님): 태도·가까운 방법            s3c (+ s3e.mode·why)

   계단 사이 논리: 방법(1) → 그 방법으로 본 장면(2) → 장면이 가리키는 문제(3)
   → 문제에서 안 보이는 것과 그 까닭(4) → 까닭이 정해 준 곳에서 몸이 닿는 물건(5)
   → 물건에 남는 자국과 그것을 만든 되풀이(6) → 남이 읽는지 확인하고 고쳐 마지막 문장(7).

   저장 키는 2026-08 설계(아홉 계단)의 것을 그대로 쓴다. 이미 쌓인 학생 기록이
   깨지지 않게 하기 위해서다. 없앤 칸(s3e.sub 등)은 화면에서만 사라지고 저장은 남는다.
   필드에 `key`가 있으면 그 키에 저장한다(계단 3 카드가 s3a.* 에 쓰는 장치).

   2026-09 개정: 계단 9 → 7. 옛 T 코드 대응: T1→T1, T2→T2, T3→T3, T4(드러내는 방법)→돌아보기,
   T5→T4, T6→T5, T7→T6, T8·T9→T7.
   ============================================================ */

import React from "react";

/* 말하는 태도 (돌아보기). 4차시 캡션의 말투와 7차시 진열의 기준이 된다 */
export const ATTITUDES = ["고발", "경고", "공감", "기록", "질문"];
export const ATTITUDE_HINTS = {
  "고발": "잘못을 드러낸다",
  "경고": "앞으로 올 일을 알린다",
  "공감": "그 사람의 자리에 서 보게 한다",
  "기록": "사라질 것을 남긴다",
  "질문": "보는 사람이 스스로 묻게 한다",
};

/* 계단 1·3 카드 위에 한 번씩 뜨는 「번역 사다리란」 상자의 본문 */
export const LADDER_INTRO = "눈에 안 보이는 사회문제를, 그 자리에 실제로 있는 물건에 남은 자국으로 옮겨 적는 일입니다. 예: 새벽 배송 노동의 시간 → 손수레 오른쪽 손잡이만 닳고 테이프를 감은 자국. 사람은 화면에 넣지 않고, 눈물·사슬 같은 상징도 쓰지 않습니다.";

/* 일곱 계단. keys는 그 계단에 속한 저장 키. 대시보드·연구 자료 내보내기가 이 표를 그대로 쓴다.
   학생 화면은 key(T1~T7)를 찍지 않고 n·name만 쓴다. */
export const TRANSLATE_STAGES = [
  { key: "T1", n: 1, hw: true, session: "2차시", sec: "s3o", name: "어떻게 볼까", full: "관찰 방법을 정한다",
    keys: ["s3o.method", "s3o.methodWhy"],
    ask: "한 주 동안 나는 동네를 어떤 방법으로 볼까?",
    out: "방법 하나, 고른 까닭 한 줄",
    look: "까닭이 보려는 것의 성격과 이어지는지" },
  { key: "T2", n: 2, hw: true, session: "2차시", sec: "s3a", name: "무엇을 봤나", full: "장면을 모은다",
    keys: ["s3a.scenes"],
    ask: "그 방법대로 다니며 무엇이 눈에 걸렸나?",
    out: "장면 세 줄(언제·어디서·무엇을)",
    look: "풀이가 아니라 본 것을 적었는지" },
  { key: "T3", n: 3, session: "3차시", sec: "s3p", name: "문제 정하기", full: "문제를 정한다",
    keys: ["s3a.problem", "s3a.contact", "s3a.why"],
    ask: "장면 셋이 가리키는 문제는 무엇이고, 나는 그것을 어디서 직접 만나나?",
    out: "문제 한 마디, 만나는 때와 곳, 뺀 문제와 견준 까닭",
    look: "만나는 때와 곳이 실제 동선에 있는지" },
  { key: "T4", n: 4, session: "3차시", sec: "s3t1", name: "안 보이는 것 찾기", full: "안 보이는 것과 까닭을 찾는다",
    keys: ["s3t1.list", "s3t1.pick", "s3t1.pickWhy"],
    ask: "이 문제에서 사진에 안 찍히는 것은 무엇이고, 왜 안 보이나?",
    out: "안 보이는 것 2~3개와 까닭, 고른 하나, 까닭 한 줄",
    look: "까닭이 여러 개로 나뉘는지, 고른 까닭에 자국 가능성이 나오는지" },
  { key: "T5", n: 5, session: "3차시", sec: "s3t2", name: "물건 고르기", full: "물건을 고른다",
    keys: ["s3t2.cands", "s3t2.dropWhy"],
    ask: "그 자리에 실제로 있는 물건 중 사람 몸이 닿는 것은?",
    out: "물건 2~3개(어디에·누가 어떻게), 고른 하나, 뺀 까닭",
    look: "누가 어떻게 만지는지 적었는지, 뺀 까닭이 있는지" },
  { key: "T6", n: 6, session: "3차시", sec: "s3t3", name: "흔적 정하기", full: "흔적으로 옮긴다",
    keys: ["s3t3.traces", "s3t3.stmt1"],
    ask: "그 물건 어느 자리에 어떤 자국이 남고, 어떤 동작을 얼마나 되풀이해야 생기나?",
    out: "흔적 네 칸, 번역 문장(첫 번째)",
    look: "자리·자국이 사진에 찍히는 말인지, 되풀이에 횟수와 기간이 있는지" },
  { key: "T7", n: 7, session: "3차시", sec: "s3t4", name: "짝에게 읽히고 고쳐 쓰기", full: "읽히고 고쳐 마지막 문장을 쓴다",
    keys: ["s3t4.reverse", "s3t4.stmt2"],
    ask: "자국만 듣고 남이 내 문제를 읽어 내나? 못 읽으면 어디로 돌아가 고치나?",
    out: "짝이 읽은 것, 맞은 정도, 돌아간 계단과 고친 것, 마지막 문장",
    look: "다르게 읽혔을 때 돌아가 고쳤는지, 큰 말이 찍히는 말로 바뀌었는지" },
];

/* 돌아보기는 계단이 아니라 사다리 밖의 카드. 연구 자료는 이 네 키를 따로 읽는다 */
export const REFLECT_KEYS = ["s3c.attitude", "s3c.attWhy", "s3e.mode", "s3e.why"];

/* 돌아보기(계단 6·7)에서 자동 요약(s3b.*)을 다시 계산하게 하는 저장 키 */
export const DERIVE_KEYS = ["s3t1.list", "s3t1.pick", "s3t2.cands", "s3t3.traces"];

/* 옛 기록의 「되돌아간 계단」 문자열 → 새 코드. 옛 T4(드러내는 방법)는 가장 가까운 앞 계단(계단 3)으로 집계한다 */
export const LEGACY_BACK = {
  "돌아가지 않음": "none",
  "T1 관찰 방법": "T1", "T2 장면 모으기": "T2", "T3 좁히기": "T3",
  "T4 드러내는 방법": "T3", "T5 나누기": "T4", "T6 사물 찾기": "T5", "T7 흔적 옮기기": "T6",
};
const OLD_T_TO_NEW = { 1: "T1", 2: "T2", 3: "T3", 4: "T3", 5: "T4", 6: "T5", 7: "T6", 8: "T7", 9: "T7" };

export function normBack(v) {
  if (v == null) return "none";
  const s = String(v).trim();
  if (!s || s === "none") return "none";
  if (LEGACY_BACK[s]) return LEGACY_BACK[s];
  if (/^T[1-7]$/.test(s)) return s;
  const m = s.match(/^T([1-9])(\s|$)/);          // 「T7 흔적 옮기기」처럼 옛 코드가 앞에 붙은 값
  if (m) return OLD_T_TO_NEW[Number(m[1])] || "none";
  return "none";
}

/* 학생·교사 화면에 보이는 되돌아간 계단 이름. 코드(T3)는 저장값에만 쓴다 */
export function backLabel(v) {
  const k = normBack(v);
  if (k === "none") return "안 돌아감";
  const st = TRANSLATE_STAGES.find((s) => s.key === k);
  return st ? "계단 " + st.n + " " + st.name : String(v);
}

/* 흔적 칸에 들어오면 「사진에 안 찍힙니다」라고 알려 주는 말들. 막지는 않는다 */
export const SYMBOL_WORDS = ["눈물", "사슬", "마음", "슬픔", "고통", "아픔", "희망", "상징", "의미", "시든 꽃", "외로움", "그리움"];
export function findSymbol(text) {
  const s = String(text || "");
  if (!s) return "";
  return SYMBOL_WORDS.find((w) => s.includes(w)) || "";
}

/* 「수업 편집」의 덮어쓰기 층은 2026-08 문항(〔T1〕 표기 등)을 담고 있을 수 있다.
   개정 섹션은 rev가 같은 덮어쓰기만 받아들여 옛 문항이 새 문안을 가리지 않게 한다. */
export const SCHEMA_REV = 2;
export const REV_SECTIONS = ["s3o", "s3a", "s3p", "s3t1", "s3t2", "s3t3", "s3t4", "s3c"];

/* ---------- 학습지 카드 ----------
   tag: 학생 화면 카드 머리에 찍는 이름(「계단 3」). code는 교사 화면·CSV 전용.
   hw: 한 주 과제 표시. intro: 「번역 사다리란」 상자. summary: 「내 번역 한눈에」 상자.
   필드의 max는 글자 수 상한, def는 예시(placeholder). key는 저장 키 재지정. */

export const LADDER_HW_SECTIONS = [
  {
    id: "s3o", session: "2차시", code: "B1", tag: "계단 1", hw: true, ladder: true, intro: true, title: "어떻게 볼까",
    note: "한 주 동안 우리 동네를 어떤 방법으로 볼지 하나 고릅니다. 방법마다 잘 보이는 것과 놓치는 것이 다릅니다. 고른 방법대로 본 것은 다음 카드(계단 2)에 적습니다.",
    fields: [
      { k: "method", t: "cards", src: "obs", label: "이번 한 주 동안 쓸 관찰 방법 (하나를 고릅니다)" },
      { k: "methodWhy", t: "text", max: 120, label: "이 방법을 고른 까닭 한 줄", def: "새벽에 오가는 사람을 볼 수 없으니, 내가 다니는 길을 그려 놓고 상자가 놓이는 자리부터 표시해 보려고" },
      { k: "blind", t: "text", max: 120, opt: true, label: "이 방법으로는 놓칠 것 같은 것 하나 (선택)", def: "새벽에 오는 사람은 내 동선에 없어서 지도에 안 잡힌다" },
    ],
  },
  {
    id: "s3a", session: "2차시", code: "B2", tag: "계단 2", hw: true, ladder: true, title: "무엇을 봤나",
    note: "고른 방법대로 다니며 눈에 걸린 장면을 세 개 적습니다. 느낌이 아니라 본 것만 씁니다. 문제를 정하는 일은 다음 수업에서 합니다.",
    fields: [
      {
        k: "scenes", t: "scenes", label: "본 것 세 가지: 언제 · 어디서 · 무엇을",
        steps: ["고른 방법의 「이렇게 합니다」 순서를 그대로 따릅니다", "‘힘들어 보였다’가 아니라 ‘손잡이에 테이프가 감겨 있었다’처럼, 눈에 보인 것만 적습니다"],
      },
      { k: "photos", t: "images", opt: true, mm: true, label: "그 자리 사진 (있으면 · 최대 3장 · 사람 얼굴이 나오지 않게)" },
      { k: "sound", t: "audio", max: 30, opt: true, mm: true, label: "그 자리 소리 (있으면 · 30초 · 사람 목소리가 담기지 않게)" },
    ],
  },
];

export const LADDER_CLASS_SECTIONS = [
  {
    id: "s3p", session: "3차시", code: "B3", tag: "계단 3", ladder: true, intro: true, title: "문제 정하기",
    note: "모아 온 장면 셋이 가리키는 사회문제를 한 마디로 적고, 그 문제를 내가 어디서 직접 만나는지 씁니다. 뉴스에서 큰 문제보다 내가 실제로 지나는 자리에서 만나는 문제가 좋습니다.",
    fields: [
      { k: "problem", key: "s3a.problem", t: "text", max: 40, label: "내 문제 (한 마디로)", def: "새벽 배송 노동" },
      { k: "contact", key: "s3a.contact", t: "text", max: 80, label: "이 문제를 내가 직접 만나는 때와 곳 (장면에 나온 자리를 적습니다. 직접 본 것이 없으면 문제를 바꿉니다)", def: "밤 11시 아파트 분리수거장, 그리고 매일 아침 우리 집 현관 앞" },
      { k: "why", key: "s3a.why", t: "text", max: 120, label: "떠올렸다가 뺀 다른 문제 하나와, 그 대신 이 문제를 고른 까닭 한 줄", def: "교실 분리수거도 떠올렸지만 그건 다 보이는 일이라 뺐다. 이 일은 내 집 앞에서 벌어지는데 내가 자는 시간에 일어난다" },
    ],
  },
  {
    id: "s3t1", session: "3차시", code: "B4", tag: "계단 4", ladder: true, title: "안 보이는 것 찾기",
    note: "이 문제에서 사진에 찍히지 않는 것을 두세 가지 적고, 왜 안 보이는지 까닭을 하나씩 고릅니다. 고른 까닭이 다음 계단에서 물건을 찾을 곳을 정해 줍니다.",
    fields: [
      {
        k: "list", t: "invis", label: "사진에 찍히지 않는 것과, 안 보이는 까닭",
        steps: ["장면 속에 있었지만 사진에는 안 찍히는 것: 사람의 시간, 되풀이, 숫자, 벽 뒤의 일, 이미 없어진 것", "까닭 버튼을 누르면 그 까닭에 맞는 ‘찾을 곳’이 아래에 뜹니다. 까닭이 서로 다르면 더 좋습니다"],
      },
      { k: "pick", t: "pickinv", label: "이 가운데 내 물건이 자국으로 대신 말해 줄 것 하나" },
      { k: "pickWhy", t: "text", max: 100, label: "고른 까닭 한 줄 (그것은 물건에 자국으로 남을 수 있나요?)", def: "상자 수는 숫자라 자국이 없지만, 몸과 시간은 손잡이에 닳음으로 남는다" },
    ],
  },
  {
    id: "s3t2", session: "3차시", code: "B5", tag: "계단 5", ladder: true, title: "물건 고르기",
    note: "그 자리에 실제로 있는 물건을 두세 개 적고, 어디에 있고 누가 어떻게 만지는지 씁니다. 몸이 닿지 않는 물건에는 자국이 남지 않습니다.",
    fields: [
      {
        k: "cands", t: "cands", label: "물건 후보와, 어디에 있고 누가 어떻게 만지는지",
        steps: ["머릿속 물건이 아니라, 계단 2의 장면에 실제로 나온 물건이나 계단 3의 ‘만나는 곳’에 놓여 있는 물건을 적습니다", "‘누가 어떻게 만지나’를 못 쓰는 물건부터 뺍니다. 하나만 「고름」"],
      },
      { k: "dropWhy", t: "text", max: 100, label: "뺀 물건 하나와 뺀 까닭 한 줄", def: "종이 상자: 며칠이면 버려져서 몇 년치 자국이 쌓이지 않는다" },
    ],
  },
  {
    id: "s3t3", session: "3차시", code: "B6", tag: "계단 6", ladder: true, title: "흔적 정하기",
    note: "고른 물건의 어느 자리에 어떤 자국이 남는지, 그 자국이 생기려면 어떤 동작을 얼마나 되풀이해야 하는지 씁니다. 사진에 찍히는 것만 씁니다.",
    fields: [
      {
        k: "traces", t: "traces", label: "흔적 네 칸",
        steps: ["자리는 한 군데만. 손잡이 전체가 아니라 손바닥이 닿는 쪽", "마음·의미·상징(눈물·사슬)은 안 됩니다. 사진으로 찍으면 무엇이 찍히는지만 씁니다"],
      },
      { k: "stmt1", t: "stmt", stage: "T6", label: "번역 문장 (첫 번째)" },
    ],
  },
  {
    id: "s3t4", session: "3차시", code: "B7", tag: "계단 7", ladder: true, title: "짝에게 읽히고 고쳐 쓰기",
    note: "문제 이름은 말하지 말고 물건과 자국만 짝에게 읽어 준 뒤, 짝이 무엇으로 읽었는지 그대로 적습니다. 다르게 읽혔다면 어느 계단으로 돌아가 고치고, 마지막 문장을 씁니다.",
    fields: [
      {
        k: "reverse", t: "reverse", label: "짝 한 명에게 읽히기",
        steps: ["짝에게는 위 「읽어 줄 것」만 읽어 줍니다. 문제 이름과 ‘노동’ 같은 큰 말은 말하지 않습니다", "다르게 읽혔다면 실패가 아닙니다. 어디로 돌아가 무엇을 고쳤는지가 가장 중요한 기록입니다"],
      },
      { k: "stmt2", t: "stmt", stage: "T7", prev: "s3t3.stmt1", label: "번역 문장 (마지막)" },
    ],
  },
  {
    id: "s3c", session: "3차시", code: "D", tag: "돌아보기", summary: true, title: "사다리 끝에서: 태도와 가까운 방법",
    note: "번역이 끝났습니다. 이 자국으로 보는 사람에게 무엇을 하려는지, 그리고 내 작업이 오늘 본 여덟 방법 중 어디에 가장 가까운지 짚어 둡니다. 4차시 캡션의 말투가 여기서 정해집니다.",
    fields: [
      { k: "attitude", t: "select", opts: ATTITUDES, hints: ATTITUDE_HINTS, label: "이 자국으로 나는 보는 사람에게 무엇을 하려 하나 (하나)" },
      { k: "attWhy", t: "text", max: 100, label: "그렇게 정한 까닭 한 줄", def: "고발보다 먼저, 이 일이 있었다는 사실을 남기고 싶다" },
      { k: "mode", key: "s3e.mode", t: "cards", src: "engage", label: "오늘 본 여덟 방법 중 내 작업과 가장 가까운 것 하나" },
      { k: "modeWhy", key: "s3e.why", t: "text", max: 120, label: "그 방법이 내 문제와 맞는 까닭 한 줄", def: "그 사람을 만날 수 없으니, 그 사람이 쓴 물건이 대신 말하게 하고 싶어서" },
      { k: "source", t: "text", max: 120, opt: true, label: "이 자국이 정말 그렇게 생기는지 확인한 자료 하나 (선택 · 4차시 전까지 채워도 됩니다)", def: "손수레 쓰는 영상 2건, 물류 아르바이트를 해 본 사촌의 말" },
    ],
  },
];

/* 카드 머리에 찍을 이름. 학생 화면만 tag를 쓰고, 교사 화면·CSV는 code를 쓴다 */
export function sectionHead(sec) {
  if (sec.tag) return sec.tag;
  const prefix = sec.kind === "learn" ? "배움 확인" : sec.kind === "inquiry" ? "탐구 질문" : "기록";
  return prefix + " " + sec.code;
}

const CSS = `
/* 번역 사다리 (2026-09 개정) */
.ld-intro{border:1px solid var(--line);border-left:3px solid var(--seal);background:var(--card2);padding:9px 12px;margin:0 0 10px;font-size:12.5px;line-height:1.65}
.ld-intro b{color:var(--seal);margin-right:4px}
.ld-intro small{display:block;color:var(--sub);margin-top:4px;font-size:11.5px}
.ld-step.later{opacity:.45}
.ld-step .hw{display:block;font-size:9px;color:var(--amber);font-family:var(--mono);letter-spacing:.08em;margin-top:2px}
.ld-note{font-size:11.5px;color:var(--seal);margin:-8px 0 10px;line-height:1.5}
.hw-chip{font-family:var(--mono);font-size:10px;border:1px solid var(--amber);color:var(--amber);padding:1px 6px;margin-left:8px;letter-spacing:.06em;white-space:nowrap}
.carry .cr{display:flex;gap:8px;align-items:baseline;padding:1px 0}
.carry .cr .l{flex:none;width:92px;font-family:var(--mono);font-size:10px;color:var(--sub);letter-spacing:.04em}
.carry .cr .v{flex:1}
.carry .cr.strong{margin-top:6px;padding-top:6px;border-top:1px dotted var(--patina);font-weight:700}
.carry .cr.strong .l{color:var(--patina)}

/* 표: 폰(640px 이하)에서는 행이 세로 블록으로 쌓인다 */
@media(max-width:640px){
  .lt.stack thead{display:none}
  .lt.stack tr{display:block;border:1px solid var(--line);margin-bottom:8px;background:var(--card)}
  .lt.stack td{display:block;border:0;border-top:1px solid var(--line2);padding:5px 7px}
  .lt.stack td::before{content:attr(data-th);display:block;font-family:var(--mono);font-size:10px;color:var(--sub);margin-bottom:2px;letter-spacing:.04em}
  .lt.stack td.rn{display:inline-block;background:transparent;border:0;width:auto;padding:4px 7px 0}
  .lt.stack td.rn::before{content:none}
  .tbl-scroll:has(.lt.stack)::after{content:none}
}

/* 흔적 네 칸·짝 읽기 네 칸: 표 대신 세로 칸 격자 */
.trace-form,.reverse-form{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px}
@media(max-width:640px){.trace-form,.reverse-form{grid-template-columns:1fr}}
.tf{border:1px solid var(--line);background:var(--card);padding:6px 8px;display:flex;flex-direction:column;gap:2px}
.tf.wide{grid-column:1/-1}
.tf .tf-l{font-family:var(--mono);font-size:10px;letter-spacing:.06em;color:var(--sub)}
.tf input,.tf textarea,.tf select{width:100%;border:0;background:transparent;font-family:var(--sans);font-size:13px;padding:3px 2px;resize:vertical}
.tf input:focus,.tf textarea:focus,.tf select:focus{outline:1px solid var(--seal);background:#fff}
.tf .seg{margin-top:3px;flex-wrap:wrap}
.tf-more{margin:0 0 8px}
.tf-sub{font-family:var(--mono);font-size:10px;color:var(--sub);letter-spacing:.06em;margin:6px 0 4px}
.sym-warn{display:block;color:var(--seal);font-size:11.5px;margin-top:2px}

/* 태도 고르기: 낱말 옆에 뜻을 붙인 세로 버튼 */
.toggle-row.col{flex-direction:column;align-items:stretch}
.toggle-row.col button{text-align:left}
.toggle-row.col button small{color:var(--sub);font-weight:400;margin-left:8px;font-size:11.5px}
.toggle-row.col button.on small{color:rgba(255,255,255,.85)}

/* 「내 번역 한눈에」 */
.sum-box{border:1px solid var(--line);border-left:3px solid var(--patina);background:var(--patina-bg);padding:10px 12px;margin:0 0 12px;font-size:12.5px;line-height:1.65}
.sum-box .h{font-family:var(--mono);font-size:10px;letter-spacing:.06em;color:var(--patina);display:block;margin-bottom:4px}
.sum-box .row{display:flex;gap:8px;align-items:baseline;padding:2px 0;flex-wrap:wrap}
.sum-box .row .l{flex:none;width:86px;font-size:11px;color:var(--sub)}
.sum-box .row .v{flex:1 1 200px;min-width:0}
.sum-box .row .v.empty{color:var(--sub)}
.sum-edit{font-family:var(--mono);font-size:10px;color:var(--amber);margin-left:6px;white-space:nowrap}
.sum-box textarea{width:100%;font-family:var(--sans);font-size:13px;border:1px solid var(--line);padding:6px;margin-top:4px;resize:vertical}
.sum-box .foot{font-size:11.5px;color:var(--sub);margin-top:6px}
.stmt-prev{border-left:3px solid var(--amber);background:var(--card2);padding:8px 10px;margin:0 0 10px;font-size:12.5px;line-height:1.6}
.stmt-prev b{font-family:var(--mono);font-size:10px;letter-spacing:.06em;color:var(--amber);display:block;margin-bottom:3px}
@media(pointer:coarse){
  .tf input,.tf textarea,.tf select{font-size:16px}
  .toggle-row.col button{padding:10px 14px}
}
`;

export function LadderStyle() {
  return <style>{CSS}</style>;
}
