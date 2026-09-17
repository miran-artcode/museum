import React, { useState } from "react";
import { fbStore } from "./src-fb.js";

/* ============================================================
   탐구 질문 — 먼저 쓰고, 되묻고, 고친다
   ------------------------------------------------------------
   왜 바꾸었나
     처음 설계는 질문 아래에 「고르기 → 찾기 → 정리」 세 단계를 미리 놓았다.
     단계 안에는 답의 보기(선택·명명·전시 / 빛·초점·질감…)까지 들어 있었다.
     학생은 단계를 그대로 실행했고, 그 결과 답이 모두 세 문장·같은 순서·
     같은 단어로 닮아 갔다. 발판이 사고의 순서와 답의 형태까지 정해 준 탓이다.

   무엇으로 바꾸었나
     ① 먼저 쓴다 — 질문만 보고 쓴다. 틀려도 된다. 보기는 없다.
        (문제를 먼저 붙들게 한 뒤 도움을 주는 편이 배움이 깊다는 ‘생산적 실패’의 순서)
     ② 첫 답을 굳힌다 — 그 순간의 글이 첫 답으로 따로 남는다.
     ③ 되묻는다 — 답의 내용을 주지 않고 학생 자신의 문장을 찌르는 질문이 온다.
        질문별 되묻기(그 질문에만 맞는 것)와 공통 되묻기(개념·설계에 두루 쓰는 것)를
        학번+질문으로 정한 순서로 배정하므로 옆 사람과 다른 되묻기를 받는다.
     ④ 같은 칸에서 고친다 — 덧붙여도, 지워도, 뒤집어도 된다. 첫 답과 고친 답이 나란히 남는다.

   발판은 차시가 갈수록 물러난다 (fading)
     전부(1·2차시)  되묻기 둘 자동
     되묻기·스스로(3~5차시)  되묻기 하나 자동 + 스스로 묻는 질문 하나
     스스로(6~8차시)  스스로 묻는 질문 먼저, 되묻기는 요청할 때만
   출발점(사례에서·반례에서…) 칩은 2026-09-17에 학생 화면에서 뺐다. 학생에게 무엇을 고르라는 것인지
   전해지지 않았고 질문 위에 낯선 단어만 늘어놓았다. 옛 기록의 route 값은 교사 열람에만 남는다.
     교사는 「차시 공개」 탭에서 차시별로 수준을 바꿀 수 있다 (config.inqAid).

   되묻기를 쓸 때 지킨 규칙
     · 답의 후보를 나열하지 않는다 (“빛·초점·질감 가운데”처럼 고르게 하지 않는다)
     · 학생이 쓴 것을 가리킨다 (“네가 쓴 …”, “네 답의 기준으로”)
     · 반례·조건·경계·귀결·누구의 자리 — 다섯 방향으로만 찌른다
     · 한 문장. 답을 요구하되 형식을 요구하지 않는다

   기록되는 것 (worksheets/{학번}._inq[필드키])
     route 출발점(옛 기록만) · v1 첫 답 · v1At · v1Level 그때의 지원 수준 · probes 받은 되묻기(id·문장·시각)
     selfQ 스스로 쓴 질문 · revAt 첫 답 뒤 마지막으로 고친 시각
     밑줄 키라 붙여넣기 분모·미디어 참조·코딩 시트 순회에서 자동으로 빠진다.
     연구 CSV 「탐구 되묻기 단위」와 교사 기록 열람의 「되묻기 흔적」이 이 값을 읽는다.
   ============================================================ */

const now = () => new Date().toISOString();
const filled = (v) => typeof v === "string" && v.trim().length > 0;
const MIN_V1 = 30;          // 첫 답을 굳힐 수 있는 최소 글자 수 — 한 구절로는 되물을 것이 없다
const REV_GAP_MS = 30000;   // 고친 시각은 30초에 한 번만 갱신 (매 타자마다 문서를 바꾸지 않기 위해)

/* ---------- 지원 수준 ---------- */
export const INQ_LEVELS = [
  { k: "full", label: "전부", sub: "답을 저장하면 추가 질문 둘(문항별 하나 + 공통 하나)이 바로 옴" },
  { k: "probe", label: "되묻기·스스로", sub: "추가 질문 하나 + 학생이 만드는 질문 하나" },
  { k: "self", label: "스스로", sub: "학생이 만드는 질문 먼저, 추가 질문은 요청할 때만" },
];
/* 기본 일정 — 앞에서는 앱이 묻고 뒤로 갈수록 학생이 묻는다 */
export const INQ_SUPPORT = { 1: "full", 2: "full", 3: "probe", 4: "probe", 5: "probe", 6: "self", 7: "self", 8: "self" };
export function inqLevel(cfg, code) {
  const c = String(code);
  const o = cfg && cfg.inqAid && typeof cfg.inqAid === "object" ? cfg.inqAid[c] : "";
  if (o && INQ_LEVELS.some((l) => l.k === o)) return o;
  return INQ_SUPPORT[c] || "probe";
}
const levelLabel = (k) => ((INQ_LEVELS.find((l) => l.k === k) || {}).label || k);

/* ---------- 출발점 — 학생 화면에서는 뺐고, 옛 기록(_inq.route)의 이름 풀이에만 쓴다 ---------- */
export const INQ_ROUTES = [
  { k: "case", label: "사례에서", sub: "오늘 본 것 하나에서 시작합니다", ph: "…을 보면 …" },
  { k: "counter", label: "반례에서", sub: "이 질문이 맞지 않는 경우부터 찾습니다", ph: "…인 경우에는 그렇지 않다. 그렇다면 …" },
  { k: "exp", label: "내 경험에서", sub: "내가 겪은 일에서 출발합니다", ph: "내가 …했을 때 …" },
  { k: "word", label: "단어를 따지며", sub: "질문 속 단어 하나의 뜻을 먼저 정합니다", ph: "여기서 ‘…’은 …을 뜻한다고 가정하면 …" },
  { k: "push", label: "극단까지 가정해서", sub: "질문을 극단적인 경우까지 가정해 봅니다", ph: "만약 …이 전부라면 …" },
];

/* ---------- 공통 되묻기 — 개념·설계에 두루 쓰는 것 ---------- */
export const INQ_GENERIC = {
  "개념": [
    "내 답이 맞지 않는 경우를 하나 생각해 보면, 답을 어떻게 고쳐야 하는가",
    "내 답에서 가장 중요한 단어 하나를 골라 다른 말로 바꾸면 무엇이 달라지는가",
    "이 답은 오늘 본 작품이 없어도 쓸 수 있는 답인가. 아니라면 어느 부분이 오늘 본 작품에서 나왔는가",
    "이 답에 가장 반대할 사람은 누구이며, 어떤 점을 지적할 것 같은가",
    "이 답이 맞다면 그다음에 무엇이 따라 나오는가. 그 가운데 받아들이기 어려운 것이 있는가",
    "내 답은 ‘항상’ 맞는가, ‘대체로’ 맞는가, ‘가끔’ 맞는가. 범위를 좁히거나 넓히면 무엇이 달라지는가",
    "내 답을 다른 사람에게 말로 설명한다면 어디에서 ‘예를 들면’이 필요한가",
  ],
  "설계": [
    "그렇게 정하면 관람자가 볼 수 없게 되는 것은 무엇인가",
    "내가 정한 것을 반대로 하면 무엇이 문제가 되는가. 문제가 없다면 왜 그렇게 정했는가",
    "이 결정을 실제로 하려면 무엇이 더 필요한가. 시간·장소·재료·허락 가운데 무엇이 문제가 되는가",
    "다음 차시의 내가 이 결정을 다시 본다면 무엇을 물어볼 것 같은가",
    "관람자가 아니라 다른 작가가 이 결정을 본다면 무엇을 먼저 지적할 것 같은가",
    "내 답에는 ‘왜’와 ‘어떻게’ 가운데 어느 쪽이 부족한가",
  ],
};

/* ---------- 질문 줄기 — 스스로 질문을 쓸 때 참고하는 뼈대 (내용 없음) ---------- */
export const INQ_STEMS = [
  "…이 아닌 경우는 없는가",
  "…와 …는 어떻게 다른가",
  "…이 맞다면 그다음에는 무엇이 따라오는가",
  "누구의 입장에서 보면 달라지는가",
  "…를 반대로 하면 무엇이 문제가 되는가",
  "내 답에서 가장 약한 부분은 어디인가",
  "이 답은 어디까지 맞는가(항상인가, 대체로인가)",
];

/* ---------- 탐구 질문 정의 — SCHEMA_DEF의 q1~q8 자리에 들어간다 ----------
   필드 키(concept·design·debate·reflect)는 저장 자리라 바꾸지 않는다.
   steps 대신 probes(질문별 되묻기)를 둔다. 교사가 「수업 편집」에서 고칠 수 있다. */
/* 구간 안내문은 두지 않는다 (2026-09-17). 질문 자체가 안내이고, 절차 설명은 칸 아래 한 줄이면 된다. */
const inqSec = (n, fields) => ({ id: "q" + n, session: n + "차시", code: String(n), kind: "inquiry", title: "탐구 질문", fields });
const concept = (label, probes) => ({ k: "concept", t: "area", qtype: "개념", label, probes });
const design = (label, probes) => ({ k: "design", t: "area", qtype: "설계", pair: true, label, probes });
const debate = (label) => ({ k: "debate", t: "debate", qtype: "논쟁", label });

export const INQUIRY_SECTIONS = {
  q1: inqSec(1, [
    concept("작가가 손대지 않은 사물이 작품이 되려면 그 전에 무슨 일이 있어야 하는가. 그 일은 꼭 작가가 해야 하는가", [
      "내가 말한 ‘그 일’이 교탁 위 청소용 밀대에 일어난다면 밀대도 작품이 되는가. 안 된다면 내 답에 무엇이 빠져 있는가",
      "그 일이 일어났는데도 작품이 되지 못한 사물을 하나 떠올릴 수 있는가",
      "그 일을 작가가 아닌 사람(관람자·미술관·우연)이 해도 되는가. 된다면 ‘작가’는 무엇을 하는 사람인가",
      "「샘」이 전시에서 거부당했을 때 그것은 작품이었는가. 내 답의 기준으로 판단하면 어느 쪽인가",
      "오늘 본 작품 가운데 내 답으로 설명하기 가장 어려운 것은 무엇인가",
    ]),
    design("오늘 본 작품 하나를 우리 교실에 들여온다면 어디에 어떻게 놓겠는가. 그 장소에서 그것은 여전히 작품인가", [
      "아침에 교실에 들어온 사람은 그것을 무엇으로 볼까. 그 오해까지 내 계획에 들어 있는가",
      "높이를 30cm 낮추거나 다른 벽으로 옮기면 무엇이 달라지는가. 달라지는 것이 없다면 그 위치를 정한 이유는 무엇인가",
      "작품 캡션이나 안내문 없이 두겠는가. 그렇다면 무엇이 그것을 작품으로 보이게 하는가",
      "교실의 어떤 물건이 그 작품과 헷갈릴 수 있는가. 헷갈리게 두겠는가, 막겠는가",
      "일주일 뒤에도 그 위치가 맞을까. 청소·수업·이동 가운데 무엇이 계획을 흔드는가",
    ]),
    debate("미술인지 아닌지를 정하는 권한은 작가·미술계·관람자에게 각각 얼마씩 있는가"),
  ]),
  q2: inqSec(2, [
    concept("작품 캡션의 어떤 정보가 이미지를 읽는 방식을 가장 크게 바꾸는가. 그 정보를 지우면 이미지에는 무엇이 남는가", [
      "내가 고른 정보가 거짓이라는 것을 관람자가 알게 되면 이미지는 원래대로 읽히는가",
      "같은 정보를 캡션이 아니라 옆 사람의 말로 들었다면 효과가 같았을까. 다르다면 효과를 만든 것은 무엇인가",
      "A와 B 가운데 내 눈이 더 오래 머문 쪽은 어디였고, 그것은 정보 때문이었나 문장 때문이었나",
      "캡션의 정보 가운데 읽기를 거의 바꾸지 못한 것도 있는가. 그것은 왜 효과가 없었는가",
      "내 답이 한 가지 정보로 끝난다면, 그 정보가 없는 유물 사진은 읽을 수 없는 것인가",
    ]),
    design("내가 만들 유물의 작품 캡션에서 관람자가 첫 줄로 읽었으면 하는 정보는 무엇인가. 그 줄을 읽은 관람자가 이미지에서 무엇을 찾기 시작하기를 바라는가", [
      "첫 줄에 놓은 정보를 맨 아래로 내리면 관람자는 어디를 먼저 보게 되는가",
      "그 첫 줄은 허구 고지보다 먼저 읽혀야 하는가, 나중이어야 하는가",
      "관람자가 그 첫 줄을 믿지 않는다면 나머지 캡션은 무슨 역할을 할 수 있는가",
      "첫 줄에 담고 싶은 정보가 아직 유물에 없다면 유물을 고칠 것인가, 첫 줄을 고칠 것인가",
      "이 첫 줄은 관람자를 위한 것인가, 나를 위한 것인가",
    ]),
    debate("허구임을 미리 밝히면 파라픽션의 효과는 커지는가, 줄어드는가"),
  ]),
  q3: inqSec(3, [
    concept("유물(사물)에 드러난 사용 흔적이 사람에 대해 말할 수 있는 것과 끝내 말할 수 없는 것은 무엇인가", [
      "‘말할 수 없다’고 쓴 것도 흔적 두 개를 함께 보면 말할 수 있게 되는가",
      "흔적을 읽는 사람이 바뀌면(가족·경찰·고고학자) 흔적이 말하는 내용도 바뀌는가. 그렇다면 말하는 쪽은 흔적인가, 읽는 사람인가",
      "흔적이 사람 대신 말하게 두는 것이 그 사람에게 더 공정한가, 덜 공정한가",
      "「르완다 프로젝트」의 눈은 흔적인가 얼굴인가. 내 답의 기준으로 판단하면 어느 쪽인가",
      "흔적이 거짓말을 할 수 있는가. 있다면 ‘말할 수 있는 것’에 무엇을 덧붙여야 하는가",
    ]),
    design("내가 고른 문제에서 카메라가 찍을 수 있는 것과 찍지 못하는 것은 무엇이며, 찍지 못하는 것 가운데 내 유물이 맡을 것은 무엇인가", [
      "‘찍지 못한다’고 쓴 것이 정말 못 찍는 것인가, 찍으면 안 되는 것인가, 찍어도 안 보이는 것인가",
      "찍을 수 있는 것만으로 이 문제를 전달한다면 무엇이 빠지는가. 그 빠진 부분이 곧 내 유물이 맡을 역할인가",
      "내 유물이 맡은 것을 관람자는 유물의 어느 부분에서 읽어 낼 수 있는가",
      "찍을 수 없는 것을 유물로 옮기면서 내가 덧붙인 추측은 무엇인가",
      "당사자가 내가 나눈 것을 본다면 어느 줄에 동의하지 않을까",
    ]),
    debate("당사자가 아닌 사람이 그 문제를 작품으로 다루는 일은 어디까지 정당한가"),
  ]),
  q4: inqSec(4, [
    concept("흔적이 그 위치에 생기려면 어떤 사용이 얼마나 반복되어야 하는가", [
      "그 횟수를 절반으로 줄이면 흔적은 어떻게 달라지는가. 옅어지는가, 위치가 바뀌는가, 아예 안 생기는가",
      "같은 흔적이 다른 이유로도 생길 수 있는가. 있다면 관람자가 내가 생각한 이유로 읽게 하려면 무엇이 더 있어야 하는가",
      "내가 생각한 사용자가 왼손잡이였다면, 키가 20cm 작았다면 흔적은 어디로 옮겨 가는가",
      "흔적이 생기는 데 걸린 시간과 유물이 버려지기까지의 시간은 맞아떨어지는가",
      "너무 정확한 흔적은 오히려 가짜처럼 보일 수 있는가",
    ]),
    design("내 유물에서 관람자가 가장 먼저 볼 곳은 어디이며, 그렇게 만들려면 화면을 어떻게 짜야 하는가", [
      "관람자가 그곳을 먼저 보지 않고 다른 곳을 먼저 본다면 작품은 실패하는가. 아니라면 왜 그곳이어야 하는가",
      "그곳으로 시선을 모으는 장치 때문에 유물의 ‘기록 사진’답지 않게 보일 위험은 없는가",
      "가장 먼저 볼 곳과 가장 오래 볼 곳은 같은 곳인가",
      "박물관 기록 사진은 보통 시선을 한곳에 모으지 않는다. 내 화면은 그 관례를 따를 것인가, 어길 것인가",
      "시선이 닿기를 바라는 곳에 흔적이 있는가, 아니면 흔적이 있는 곳으로 시선을 끌려는 것인가",
    ]),
    debate("유물이 말하는 것은 만든 사람의 뜻인가, 쓴 사람의 습관인가, 발굴한 사람의 해석인가"),
  ]),
  q5: inqSec(5, [
    concept("사진처럼 보이게 만드는 요소 가운데 우리 눈이 가장 먼저 믿는 것은 무엇인가", [
      "그 요소를 일부러 망가뜨린 화면을 상상하면, 나머지만으로도 사진처럼 보이는가",
      "내가 먼저 믿은 것은 사진의 성질인가, 카메라의 습관인가",
      "그 요소는 진짜 사진에도 항상 있는가. 그것이 없는 진짜 사진을 하나 떠올릴 수 있는가",
      "눈이 먼저 믿는 것과 나중에 의심하는 것이 같은 요소일 수 있는가",
      "이 답을 내 생성 회차 화면 전부에 적용해 보면 예외가 있는가",
    ]),
    design("내가 고른 한 점과 버린 것들의 차이는 어디에 있는가. 그 차이를 말로 다 설명하고 나서도 설명되지 않는 것이 있는가", [
      "버린 것 가운데 하나를 오늘 다시 본다면 같은 판단을 할까. 아니라면 그때의 판단을 만든 것은 무엇인가",
      "차이를 설명한 말이 전부 화면에서 확인되는가. 확인되지 않는 말이 있다면 그것은 무엇을 가리키는가",
      "고른 것은 계획에 가장 가까운 것인가, 계획에서 벗어났지만 더 나은 것인가",
      "남의 눈에는 버린 것이 더 낫게 보일 수 있는가. 그래도 고른 이유는 무엇인가",
      "고른 이유를 도구가 한 일과 내가 한 일로 나누면 어느 쪽이 더 큰가",
    ]),
    debate("도구가 만든 우연한 결과를 내 의도로 받아들이는 것은 발견인가, 자기합리화인가"),
    { k: "reflect", t: "reflect", qtype: "성찰", label: "왜 우리는 어떤 이미지를 증거처럼 믿는가. 지금 시점의 내 답을 쓰기 (8차시에 이 답을 다시 봅니다)" },
  ]),
  q6: inqSec(6, [
    concept("낡음을 늘렸는데 오히려 의심이 커지는 화면에는 무엇이 빠져 있는가", [
      "내가 ‘빠졌다’고 쓴 것을 넣으면 의심이 정말 사라지는가, 아니면 다른 의심이 생기는가",
      "낡음을 줄였는데 오히려 믿음이 커지는 경우도 있는가. 있다면 내 답은 어떻게 되는가",
      "진짜 유물 가운데 ‘너무 낡아서 의심스러운’ 것을 본 적이 있는가",
      "의심하는 쪽은 눈인가, 머리인가. 내 답은 어느 쪽을 설득하려는 것인가",
      "내 화면에 그 ‘빠진 것’이 있는가. 없다면 넣을 것인가, 빠진 채로 둘 것인가",
    ]),
    design("내 화면에서 고치지 않기로 한 부분은 무엇이며 왜 그대로 두는가", [
      "고치지 않은 부분을 관람자가 결함으로 본다면 내 결정은 흔들리는가",
      "‘고치면 무엇이 사라지는가’에 답할 수 없다면 그것은 결정인가, 미룬 것인가",
      "그대로 두는 이유를 작품 캡션에 적을 것인가, 관람자가 스스로 찾게 둘 것인가",
      "짝이 그 부분을 실수라고 부른다면 무엇이라고 답하겠는가",
      "다듬기 세 방법 가운데 어느 것도 이 부분에 쓰지 않은 이유는 방법이 없어서인가, 쓰지 않으려 해서인가",
    ]),
    debate("결함을 남기는 작업과 지우는 작업 가운데 어느 쪽이 더 정직한가"),
  ]),
  q7: inqSec(7, [
    concept("같은 작품을 교실 벽과 미술관 벽에 걸었을 때 무엇이 달라지는가", [
      "달라지는 것 가운데 작품 자체에 속한 것이 하나라도 있는가",
      "교실 벽에 걸어도 미술관처럼 읽히게 만드는 방법이 있는가. 있다면 그것이 곧 ‘미술관’의 정체인가",
      "미술관 벽에서 오히려 잃는 것은 무엇인가",
      "우리 반 전시장(화면)은 교실 벽에 가까운가, 미술관 벽에 가까운가. 어느 쪽 규칙이 작동하고 있는가",
      "‘벽’을 ‘관람자’로 바꿔 읽어도 내 답은 성립하는가",
    ]),
    design("내 작품 옆에 놓일 다른 작품 한 점을 내가 고른다면 무엇이며 왜인가", [
      "그 작품을 반대쪽 벽으로 옮기면 무엇이 사라지는가",
      "옆에 놓인 뒤 내 작품이 더 잘 읽히는가, 그 작품이 더 잘 읽히는가. 둘 다 아니라면 왜 고른 것인가",
      "가장 놓고 싶지 않은 작품은 무엇이며, 그 이유가 고른 이유를 더 잘 설명하지는 않는가",
      "그 작품의 작가가 거절한다면 어떻게 설득하겠는가",
      "두 작품 사이의 거리는 몇 걸음이어야 하는가",
    ]),
    debate("배치를 정한 사람도 그 작품의 작가에 포함되는가"),
  ]),
  q8: inqSec(8, [
    concept("이미지·명칭·작품 캡션·진열 가운데 이 학급의 작품들이 의미를 만든 방법은 어느 쪽에 몰려 있는가", [
      "몰린 쪽이 있다면 그것은 우리 반이 잘한 것인가, 도구가 시킨 것인가, 수업이 시킨 것인가",
      "내가 고른 작품과 반대되는 증거가 되는 작품은 없는가. 있다면 경향을 다시 어떻게 말해야 하는가",
      "내 작품은 그 경향 안에 있는가, 밖에 있는가",
      "네 가지 가운데 우리 반이 거의 쓰지 않은 방법이 있다면, 쓰기 어려워서인가 필요 없어서인가",
      "1차시의 다섯 후보(기술·선택·명명·전시·관념)로 같은 질문을 다시 한다면 답이 달라지는가",
    ]),
    design("관람자가 내 의도와 다르게 읽었을 때 나는 무엇을 고치고 무엇을 그대로 두겠는가", [
      "다르게 읽은 관람자가 틀린 것인가, 내 작품이 그렇게 읽히게 되어 있었던 것인가",
      "그대로 두겠다고 한 부분을 여러 사람이 똑같이 다르게 읽는다면, 그래도 두겠는가",
      "고치겠다고 한 것을 고치면 원래 의도는 그대로인가, 의도도 조금 바뀌는가",
      "다르게 읽힌 것 가운데 내 의도보다 더 나은 읽기는 없었는가",
      "이 결정을 작품 캡션의 한 줄로 바꾼다면 무엇이라고 쓰겠는가",
    ]),
    debate("허구를 밝힌 이미지와 밝히지 않은 이미지를 나누는 기준은 고지인가, 의도인가, 결과인가"),
    { k: "reflect", t: "reflect", qtype: "성찰", label: "5차시의 내 답과 지금의 답 사이에서 무엇이 달라졌으며, 무엇 때문에 달라졌는가", showPrev: "q5.reflect.pos" },
  ]),
};

/* ---------- 배정 — 학번+질문으로 순서를 정해 옆 사람과 다른 되묻기를 받게 한다 ---------- */
function hash32(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function seededOrder(n, seed) {
  const idx = Array.from({ length: n }, (_, i) => i);
  let x = hash32(seed) || 1;
  for (let i = n - 1; i > 0; i--) {
    x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    const j = x % (i + 1);
    const t = idx[i]; idx[i] = idx[j]; idx[j] = t;
  }
  return idx;
}

/* 첫 답과 고친 답의 겹침 — 글자 2그램 자카드. 앱의 어절 자카드와 다른 간이 계산이며
   교사 화면의 표지와 CSV의 sim 열에만 쓴다. */
function grams(s) {
  const t = String(s || "").replace(/\s+/g, "");
  const out = new Set();
  for (let i = 0; i + 1 < t.length; i++) out.add(t.slice(i, i + 2));
  return out;
}
export function textSim(a, b) {
  const A = grams(a), B = grams(b);
  if (!A.size && !B.size) return 1;
  let inter = 0;
  A.forEach((g) => { if (B.has(g)) inter++; });
  return inter / (A.size + B.size - inter);
}

/* ---------- 학생 화면 ---------- */

function SelfQ({ value, onChange, level }) {
  const [stems, setStems] = useState(level !== "self");
  return (
    <div className="inq-selfq">
      <label className="inq-l">내가 만드는 질문 하나 (위 답에서 아직 답하지 않은 것)</label>
      <input value={value || ""} maxLength={200} placeholder="예: ‘…이 아닌 경우는?’처럼 내 답을 다시 살펴보게 하는 질문"
        onChange={(e) => onChange(e.target.value)} />
      <div className="inq-stems">
        <button type="button" className="inq-link" onClick={() => setStems(!stems)}>{stems ? "질문 예시 접기" : "질문 예시 보기"}</button>
        {stems && <span> {INQ_STEMS.join(" · ")}</span>}
      </div>
    </div>
  );
}

export function InquiryField({ sec, f, ws, setField, sid, cfg, echo }) {
  const key = sec.id + "." + f.k;
  const text = typeof ws[key] === "string" ? ws[key] : "";
  const all = (ws && ws._inq && typeof ws._inq === "object") ? ws._inq : {};
  const tr = all[key] || {};
  const level = inqLevel(cfg, sec.code);
  const seed = String(sid || "") + "|" + key;
  const specific = Array.isArray(f.probes) ? f.probes.filter(filled) : [];
  const generic = INQ_GENERIC[f.qtype] || INQ_GENERIC["개념"];
  const [showV1, setShowV1] = useState(false);

  const setTr = (patch) => setField("_inq", { ...all, [key]: { ...tr, ...patch } });
  const sOrder = seededOrder(specific.length, seed + "|s");
  const gOrder = seededOrder(generic.length, seed + "|g");
  const drawn = tr.drawn || { s: 0, g: 0 };
  const probes = Array.isArray(tr.probes) ? tr.probes : [];
  const maxProbes = level === "full" ? 4 : 2;

  const nextProbe = (kind, at) => {
    if (kind === "s" && drawn.s < specific.length) { const i = sOrder[drawn.s]; return { id: "s" + i, t: specific[i], at }; }
    if (drawn.g < generic.length) { const i = gOrder[drawn.g]; return { id: "g" + i, t: generic[i], at }; }
    if (drawn.s < specific.length) { const i = sOrder[drawn.s]; return { id: "s" + i, t: specific[i], at }; }
    return null;
  };
  const draw = (kind) => {
    if (probes.length >= maxProbes) return;
    const at = now();
    const p = nextProbe(kind, at);
    if (!p) return;
    const d = { ...drawn, [p.id[0]]: drawn[p.id[0]] + 1 };
    setTr({ probes: [...probes, p], drawn: d });
  };
  /* 첫 답 굳히기 — 지금 글을 v1로 남기고 수준에 맞는 되묻기를 뽑는다 */
  const freeze = () => {
    if (text.trim().length < MIN_V1 || tr.v1) return;
    const at = now();
    const list = [];
    const d = { s: 0, g: 0 };
    const take = (kind) => {
      const i = kind === "s" ? sOrder[d.s] : gOrder[d.g];
      const pool = kind === "s" ? specific : generic;
      if (i == null) return;
      list.push({ id: kind + i, t: pool[i], at });
      d[kind] += 1;
    };
    if (level === "full") { take("s"); take("g"); }
    else if (level === "probe") { take("s"); }
    setTr({ v1: text, v1At: at, v1Level: level, probes: list, drawn: d });
  };
  const onText = (val) => {
    setField(key, val);
    if (tr.v1 && (!tr.revAt || Date.now() - new Date(tr.revAt).getTime() > REV_GAP_MS)) setTr({ revAt: now() });
  };

  const ph = "내 생각을 씁니다. 틀려도 괜찮습니다.";
  const changed = tr.v1 ? textSim(tr.v1, text) < 0.9 || Math.abs(text.trim().length - tr.v1.trim().length) > 8 : false;

  return (
    <div className="field span2 inq">
      <div className="q-head">
        <span className={"q-type " + (f.qtype === "설계" ? "design" : "concept")}>{f.qtype}</span>
        <label style={{ margin: 0 }}>{f.label}</label>
      </div>
      {echo}
      <textarea rows={f.rows || 4} value={text} maxLength={4000} placeholder={ph} onChange={(e) => onText(e.target.value)} />
      {!tr.v1 ? (
        <div className="inq-foot">
          {text.trim().length >= MIN_V1 ? (
            <button type="button" className="btn small" onClick={freeze}>
              {level === "self" ? "답 저장하고 내 질문 쓰기" : "답 저장하고 추가 질문 받기"}
            </button>
          ) : null}
          <span className="hint">
            {!text.trim() ? "다 쓰면 아래에 「답 저장」 버튼이 나타납니다."
              : text.trim().length < MIN_V1 ? MIN_V1 + "자 이상 쓰면 「답 저장」 버튼이 나타납니다."
              : "저장하면 지금 쓴 답이 처음 쓴 답으로 기록되고, 추가 질문을 받습니다."}
          </span>
        </div>
      ) : (
        <div className="inq-probe">
          <div className="inq-pt">
            <span className="inq-acc">추가 질문</span>
            아래 질문에 답하면서 <b>위 칸의 글을 고칩니다</b>. 처음 쓴 답은 따로 저장되어 있습니다.
          </div>
          {level === "self" && <SelfQ level={level} value={tr.selfQ} onChange={(v) => setTr({ selfQ: v, selfQAt: now() })} />}
          {probes.length > 0 && (
            <ol className="inq-list">
              {probes.map((p) => <li key={p.id}>{p.t}</li>)}
            </ol>
          )}
          {level === "probe" && <SelfQ level={level} value={tr.selfQ} onChange={(v) => setTr({ selfQ: v, selfQAt: now() })} />}
          <div className="inq-row">
            {probes.length < maxProbes && (
              <button type="button" className="btn small ghost" onClick={() => draw(drawn.s <= drawn.g ? "s" : "g")}>
                {level === "self" ? "추가 질문 받기" : "다른 질문 받기"}
              </button>
            )}
            <button type="button" className="inq-link" onClick={() => setShowV1(!showV1)}>{showV1 ? "처음 쓴 답 접기" : "처음 쓴 답 보기"}</button>
            <span className="hint">{changed ? "처음 쓴 답에서 달라졌습니다." : "아직 처음 쓴 답 그대로입니다."}</span>
          </div>
          {showV1 && <div className="inq-v1"><div className="inq-l">처음 쓴 답 · {fmtShort(tr.v1At)}</div>{tr.v1}</div>}
        </div>
      )}
    </div>
  );
}

function fmtShort(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return d.getMonth() + 1 + "/" + d.getDate() + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}

/* ---------- 교사 기록 열람 — 첫 답과 고친 답, 받은 되묻기 ---------- */
export function InquiryTrace({ sec, f, ws }) {
  const key = sec.id + "." + f.k;
  const tr = ((ws && ws._inq) || {})[key];
  if (!tr || (!tr.v1 && !tr.route && !tr.selfQ)) return null;
  const fin = typeof ws[key] === "string" ? ws[key] : "";
  const sim = tr.v1 ? Math.round(textSim(tr.v1, fin) * 100) : null;
  const route = INQ_ROUTES.find((r) => r.k === tr.route);
  const gap = tr.v1At && tr.revAt ? Math.round((new Date(tr.revAt) - new Date(tr.v1At)) / 1000) : null;
  return (
    <div className="inq-trace">
      <div className="inq-tl">
        <span className="inq-acc">되묻기 흔적</span>
        {tr.v1Level ? "수준 " + levelLabel(tr.v1Level) : "확정 전"}
        {route ? " · 출발점 " + route.label : ""}
        {tr.v1 ? " · 첫 답 " + tr.v1.trim().length + "자 → 지금 " + fin.trim().length + "자 · 겹침 " + sim + "%" : ""}
        {gap != null && gap > 0 ? " · 확정 뒤 " + (gap >= 60 ? Math.round(gap / 60) + "분" : gap + "초") + " 더 고침" : ""}
      </div>
      {tr.v1 && <div className="inq-tv"><b>첫 답</b>{tr.v1}</div>}
      {Array.isArray(tr.probes) && tr.probes.length > 0 && (
        <div className="inq-tv"><b>받은 되묻기</b>{tr.probes.map((p, i) => <div key={p.id + i}>{i + 1}. {p.t}</div>)}</div>
      )}
      {filled(tr.selfQ) && <div className="inq-tv"><b>스스로 쓴 질문</b>{tr.selfQ}</div>}
    </div>
  );
}

/* ---------- 교사 설정 — 차시별 지원 수준 (config.inqAid) ---------- */
export function InquiryAidConfig({ cfgAll, setCfgAll, setMsg }) {
  const cur = (cfgAll && cfgAll.inqAid && typeof cfgAll.inqAid === "object") ? cfgAll.inqAid : {};
  const save = async (code, k) => {
    const next = { ...cur };
    if (k) next[code] = k; else delete next[code];
    const ok = await fbStore.setT("config", { inqAid: next, inqAidUpdated: now() }, { merge: true });
    if (ok) {
      setCfgAll({ ...(cfgAll || {}), inqAid: next });
      setMsg(code + "차시 되묻기 수준을 " + (k ? "「" + levelLabel(k) + "」로 바꿨습니다." : "기본값으로 되돌렸습니다.") + " 접속 중인 학생 화면에 바로 반영됩니다.");
    } else setMsg("설정 저장에 실패했습니다.");
  };
  return (
    <div className="card">
      <div className="card-head"><span className="card-code">되묻기</span><span className="card-title">탐구 질문의 지원 수준</span></div>
      <div className="card-body">
        <p style={{ fontSize: 13, marginBottom: 12 }}>
          탐구 질문은 <b>먼저 쓰고 → 첫 답을 확정하고 → 되묻기를 받아 → 같은 칸에서 고치는</b> 순서로 진행됩니다.
          기본값은 앞 차시에서 앱이 많이 묻고 뒤로 갈수록 학생이 스스로 묻도록 줄어드는 일정입니다.
          학급의 형편에 따라 차시별로 바꿀 수 있습니다. 이미 첫 답을 확정한 학생의 기록은 그때의 수준이 그대로 남습니다.
        </p>
        <div className="tbl-scroll"><table className="roster">
          <thead><tr><th style={{ width: 70 }}>차시</th><th>지원 수준</th><th style={{ width: 90 }}>기본값</th></tr></thead>
          <tbody>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => {
              const code = String(n);
              const eff = inqLevel(cfgAll, code);
              const overridden = !!cur[code];
              return (
                <tr key={n}>
                  <td className="mono">{n}</td>
                  <td>
                    <div className="seg">
                      {INQ_LEVELS.map((l) => (
                        <button key={l.k} className={eff === l.k ? "on-ok" : ""} title={l.sub}
                          onClick={() => { if (eff !== l.k) save(code, l.k); }}>{l.label}</button>
                      ))}
                    </div>
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {overridden
                      ? <button type="button" className="inq-link" onClick={() => save(code, "")}>기본값({levelLabel(INQ_SUPPORT[code])})으로</button>
                      : <span className="hint">{levelLabel(INQ_SUPPORT[code])}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table></div>
        <ul className="hint" style={{ marginTop: 10, paddingLeft: 16, lineHeight: 1.7 }}>
          {INQ_LEVELS.map((l) => <li key={l.k}><b>{l.label}</b>: {l.sub}</li>)}
        </ul>
        <p className="hint" style={{ marginTop: 6 }}>
          되묻기 문장은 「수업 편집」 탭의 탐구 질문 항목에서 고칩니다. 답의 보기를 나열하지 않고, 학생이 쓴 것을 가리키는 한 문장으로 씁니다.
          공통 되묻기(개념 {INQ_GENERIC["개념"].length}개 · 설계 {INQ_GENERIC["설계"].length}개)는 코드에 있습니다.
        </p>
      </div>
    </div>
  );
}

/* ---------- 연구 자료 — 참여자 × 탐구 질문 칸 ---------- */
export function inquiryTraceRows(ws, schema) {
  const rows = [];
  const all = (ws && ws._inq) || {};
  for (const sec of schema) {
    if (sec.kind !== "inquiry") continue;
    for (const f of sec.fields) {
      if (f.t !== "area") continue;
      const key = sec.id + "." + f.k;
      const tr = all[key] || {};
      const fin = typeof ws[key] === "string" ? ws[key] : "";
      if (!tr.v1 && !tr.route && !filled(fin)) continue;
      rows.push({
        key, session: sec.session, code: sec.code, qtype: f.qtype || "", label: String(f.label || ""),
        level: tr.v1Level || "", route: tr.route || "", v1: tr.v1 || "", final: fin,
        v1At: tr.v1At || "", revAt: tr.revAt || "",
        probes: Array.isArray(tr.probes) ? tr.probes : [], selfQ: tr.selfQ || "", selfQAt: tr.selfQAt || "",
        sim: tr.v1 ? Math.round(textSim(tr.v1, fin) * 1000) / 1000 : null,
      });
    }
  }
  return rows;
}

export function InquiryStyle() {
  return (
    <style>{`
.inq-acc{font-family:var(--mono);font-size:10px;letter-spacing:.16em;color:var(--patina);border:1px solid var(--patina);padding:1px 5px;margin-right:7px;vertical-align:middle}
.inq-start{border-left:3px solid var(--line);background:var(--card2);padding:7px 10px;margin-bottom:8px;font-size:12px;line-height:1.6}
.inq-sub{color:var(--sub);font-size:11.5px}
.inq-routes{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
.inq-chip{border:1px solid var(--line);background:#fff;font-family:var(--sans);font-size:12px;padding:4px 10px;cursor:pointer;color:var(--ink)}
.inq-chip.on{border-color:var(--ink);background:var(--ink);color:#fff}
.inq-link{border:none;background:none;padding:0;font-family:var(--sans);font-size:11.5px;color:var(--seal);cursor:pointer;text-decoration:underline}
.inq-foot{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:6px}
.inq-probe{border-left:3px solid var(--patina);background:var(--patina-bg);padding:9px 12px;margin-top:8px;font-size:12.5px;line-height:1.65}
.inq-pt{margin-bottom:6px}
.inq-list{margin:4px 0 6px;padding-left:20px;display:flex;flex-direction:column;gap:5px}
.inq-list li{font-size:13px;color:var(--ink)}
.inq-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:6px}
.inq-selfq{margin:8px 0 4px}
.inq-l{display:block;font-size:11.5px;color:var(--sub);margin-bottom:4px}
.inq-selfq input{width:100%;padding:8px 10px;border:1px solid var(--line);background:#fff;font-family:var(--sans);font-size:13px;color:var(--ink)}
.inq-stems{font-size:11px;color:var(--sub);margin-top:4px;line-height:1.6}
.inq-v1{margin-top:8px;background:#fff;border:1px solid var(--line2);padding:8px 10px;white-space:pre-wrap;font-size:12.5px;color:var(--sub)}
.inq-trace{border:1px dashed var(--line);background:var(--card2);padding:7px 10px;margin-top:4px;font-size:12px;line-height:1.6}
.inq-tl{color:var(--sub);margin-bottom:4px}
.inq-tv{white-space:pre-wrap;background:#fff;border:1px solid var(--line2);padding:6px 9px;margin-top:4px;font-size:12.5px}
.inq-tv b{display:block;font-size:10.5px;color:var(--patina);font-family:var(--mono);letter-spacing:.08em;margin-bottom:2px}
    `}</style>
  );
}
