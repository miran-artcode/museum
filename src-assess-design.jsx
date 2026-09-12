/* ============================================================
   상호평가(쌍대비교) — 교사 화면 「상호평가 6 · 연구 설계」 카드

   위 다섯 카드가 무엇을 재고 왜 그렇게 정했는지를 논문의 방법 절 순서로 적는다:
   연구 질문과 위치 → 흐름과 자료 구조 → 확정 파라미터 → 배정 규칙 → 측정 도구 →
   추정 모형 → 신뢰도·품질 판정 도구 → 보정 지표와 분석 계획 → CSV 변수 사전 →
   윤리 → 한계 → 핵심 문헌.

   숫자·문항·열 이름은 src-assess-core.mjs의 상수와 CSV 머리글을 그대로 읽어 온다.
   그래서 코드가 바뀌면 이 카드도 같이 바뀌고, 설명이 없는 열은 「(설명 없음)」으로 드러난다.
   문장 근거는 쌍대비교_구현_근거.md(문헌 144편 서지 검증)이며, 이 파일은 그 문서를
   화면에 옮긴 것이지 새 결정을 내리지 않는다. 계산도 하지 않는다.

   src-app.jsx를 import하지 않는다(순환). 스타일은 이 파일 안의 <style>로 나간다.
   ============================================================ */

import React, { useState, useRef, useEffect } from "react";
import {
  CRITERIA, SELF_ITEMS, SELF_LABELS, CONF_LABELS, CHANGE_CODES, TAG_OPTIONS, PEER_QUESTION,
  DEFAULT_PEER, K_FLOOR, MIN_WHY_CHANGE, REASON_MAX, FAST_MS, DUP_SIM, AGAINST_GAP, INFIT_BAND, SHORT_WHY, QUALITY_MIN,
  csvSubmissions, csvJudgements, csvSelf, csvScores, csvJudges,
} from "./src-assess-core.mjs";

const FAST_SEC = Math.round(FAST_MS / 1000);

/* 학생 화면(src-assess.jsx)의 학급 공통 배너 문구 — 여기서는 인용만 한다 */
const AI_BANNER = "이 반의 모든 작품은 AI 이미지 도구로 만들었고, 작품 캡션은 학생이 썼습니다. 각 작품의 AI 활용 범위는 비교가 끝난 뒤 전시장에서 공개됩니다.";

/* CSV 머리글을 core에서 그대로 얻는다 — 빈 자료로 부르면 head만 돌아온다 */
const noPid = () => "";
function heads() {
  try {
    return {
      submissions: csvSubmissions({ roster: null, subMap: {}, pidOf: noPid }).head,
      judgements: csvJudgements({ roster: null, assessMap: {}, pidOf: noPid }).head,
      self: csvSelf({ roster: null, assessMap: {}, pidOf: noPid }).head,
      scores: csvScores({ agg: null, pidOf: noPid }).head,
      judges: csvJudges({ agg: null, pidOf: noPid }).head,
    };
  } catch (e) { return { submissions: [], judgements: [], self: [], scores: [], judges: [] }; }
}

/* 열 설명. 열 이름은 core가 정하고 설명만 여기 둔다 — 새 열이 생기면 「(설명 없음)」으로 보인다 */
const COL = {
  submissions: {
    pid: "작품 소유자의 익명 번호. 학번 정렬 순 P01…(「연구」 탭과 같은 규칙)",
    work_no: "작품 번호. 비교 명단의 정렬 키",
    in_roster: "확정 명단에 든 작품이면 1",
    title: "제목",
    relic: "작품 캡션의 유물명", year: "작품 캡션의 연대", era: "작품 캡션의 시대", mat: "작품 캡션의 재질", size: "작품 캡션의 크기",
    context_len: "작품 캡션 「맥락」의 글자 수(본문은 내보내지 않음)",
    coll: "소장처(가상)",
    ai_level: "AI 활용 단계(aiLevel). 자유 서술 aiScope는 스냅샷에 담지 않음",
    note_len: "작가 노트 글자 수",
    has_img: "대표 이미지가 있으면 1",
    submitted_at: "제출 확정 시각(ISO 8601)",
  },
  judgements: {
    pid: "판정자의 익명 번호",
    roster_ver: "판정이 속한 명단의 확정 시각(fixedAt)",
    valid: "현재 명단의 배정표와 화면 순번·쌍·좌우·반복까지 대조해 받아들인 판정이면 1. 옛 명단·중복·변조·자기 작품 포함은 0",
    screen_i: "화면 순번(0부터)",
    work_a: "배정된 첫째 작품 번호", work_b: "배정된 둘째 작품 번호",
    left: "먼저 놓인 쪽(왼쪽·위)이 a인지 b인지",
    rep_of: "숨은 역순 반복이면 원본 화면 순번. 본 판정이면 빈칸",
    win: "고른 쪽(a/b)", win_no: "고른 작품 번호",
    chosen_first: "먼저 놓인 쪽을 골랐으면 1(위치 편향 분석용)",
    axis: "실제 배치 축. x = 좌우, y = 위아래(좁은 화면)",
    vw: "판정 때 화면 폭(px)",
    conf: "확신도 1~5. 설정이 꺼져 있으면 빈칸",
    hard: "「판단이 어려웠다」 표시면 1",
    know_author: "「누구 작품인지 알 것 같다」 표시면 1",
    tag: "결정적 축 태그(" + TAG_OPTIONS.map((t) => t.k).join("·") + ")",
    ms: "판정 소요 시간(밀리초). 경고 뒤에도 시계를 되감지 않은 실제 경과",
    fast_override: "최소 시간 경고를 보고 그대로 넘겼으면 1",
    plate_opened: "작품 캡션을 한 번이라도 펼쳤으면 1",
    why_len: "이유 문장 글자 수", why: "이유 문장 전문",
    at: "저장 시각(ISO 8601)",
  },
  self: {
    pid: "학생의 익명 번호",
    phase: "자기평가 회차. s1 = 자기평가 ①, s2 = 자기평가 ②(평가자 성향 설문의 버전 키 s1과는 무관)",
    overall: "종합 설득력(1~5)", veri: "이미지의 핍진성(1~5)", cause: "흔적의 인과(1~5)", plate: "작품 캡션의 작동(1~5)", voice: "문제의 전달(1~5)",
    why: "근거 한 문장",
    pred_rank: "예측 등수(1 = 가장 높음)",
    n: "예측 때의 학급 작품 수(분모)",
    pred_pct: "예측 백분위 = (n − pred_rank) / (n − 1)",
    started_at: "시작 시각", submitted_at: "제출 시각", dur_sec: "소요 초",
    locked_at: "②에서 「현재 점수 확정」을 누른 시각. ①은 빈칸",
    change_code: "②의 변화 사유 코드(" + CHANGE_CODES.map((c) => c.k).join("/") + ")",
    change_why: "변화 사유 서술(" + MIN_WHY_CHANGE + "자 이상). unclear는 서술 없이 유효",
  },
  scores: {
    pid: "작품 소유자의 익명 번호", work_no: "작품 번호",
    theta: "브래들리–테리 능력값 θ(logit, 학급 평균 0)",
    se: "θ의 표준오차(관측 정보 행렬 대각 근사)",
    rank: "순위. 동점은 공동 순위, 비교 0회 작품은 빈칸",
    n: "확정 명단의 작품 수(비교 0회 작품 포함)",
    pct: "실제 백분위 = (m − rank) / (m − 1). m = 비교된 적 있는 작품 수(plays > 0인 행 수. 비교 0회 작품이 없으면 n과 같음)",
    band: "밴드. 상위 ⅓ 「상」, 하위 ⅓ 「하」, 나머지 「중」",
    plays: "본 판정에서의 노출 수", wins: "본 판정에서의 승수",
    left_rate: "이 작품이 먼저 놓인 쪽에 나온 비율",
    pred_pct1: "자기 예측 백분위 ①", pred_pct2: "자기 예측 백분위 ②(확정 시점 값)",
    bias1: "예측① − 실제(+면 과대평가)", bias2: "예측② − 실제",
    calib: "|bias1| − |bias2|(+면 보정됨). 주 결과 변수",
    n_received: "이 작품을 두고 쓴 이유 문장 수",
  },
  judges: {
    pid: "판정자의 익명 번호",
    n: "본 판정 수(반복 제외)",
    infit: "정보 가중 잔차 평균제곱", outfit: "비가중 잔차 평균제곱",
    flag: "infit이 " + INFIT_BAND[0] + "~" + INFIT_BAND[1] + " 밖이거나 학급 평균+2SD 위면 1(제외 근거 아님)",
    against: "θ 차 ≥ " + AGAINST_GAP + "인 쌍에서 반대로 고른 수", n_gap: "θ 차 ≥ " + AGAINST_GAP + "인 쌍 수", against_rate: "역방향률 = against / n_gap",
    left_rate: "먼저 놓인 쪽을 고른 비율",
    median_ms: "판정 시간 중앙값(밀리초)",
    fast_n: FAST_SEC + "초 미만 판정 수",
    dup_why_n: "앞선 자기 이유 문장과 2-gram 자카드 ≥ " + DUP_SIM + "인 문장 수",
    short_why_n: SHORT_WHY + "자 미만 이유 수",
    conf_mean: "확신도 평균(설정이 꺼져 있으면 빈칸)",
    plate_open_rate: "캡션 펼침 비율",
    hard_n: "「판단이 어려웠다」 수", know_n: "「누구 작품인지 알 것 같다」 수",
  },
};

/* ---------- 작은 부품 ---------- */

function Sec({ id, title, open, children }) {
  return (
    <details className="reading ad-sec" open={open}>
      <summary><span className="rd-i">{id}</span>{title}</summary>
      <div className="reading-in ad-in">{children}</div>
    </details>
  );
}
function T({ head, rows }) {
  return (
    <div className="tbl-scroll ad-scroll">
      <table className="ad-t">
        <thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}
const F = ({ children }) => <pre className="ad-f">{children}</pre>;
const M = ({ children }) => <span className="mono">{children}</span>;
const Ref = ({ children }) => <span className="ad-ref">({children})</span>;

function ColTable({ kind, head }) {
  const d = COL[kind] || {};
  return <T head={["열", "뜻"]} rows={head.map((c) => [<M key="c">{c}</M>, d[c] || <span className="ad-miss">(설명 없음. core에 새로 생긴 열)</span>])} />;
}

/* ============================================================ 카드 */

export function AssessDesignCard({ kMax = 30, splitReps = 25 }) {
  const H = useRef(null);
  if (!H.current) H.current = heads();
  const bodyRef = useRef(null);
  const [sweep, setSweep] = useState({ open: null, n: 0 });   // open: null이면 첫 절만 펼침
  const [copied, setCopied] = useState("");
  const copyReq = useRef(false);
  // 「본문 복사」는 접힌 절의 글자가 innerText에 없으므로 먼저 모두 펼친 뒤(remount) 복사한다
  useEffect(() => {
    if (!copyReq.current) return;
    copyReq.current = false;
    const txt = bodyRef.current ? bodyRef.current.innerText : "";
    const done = (ok) => setCopied(ok ? "본문을 복사했습니다. 논문 원고에 붙여 넣은 뒤 다듬으세요." : "복사하지 못했습니다. 드래그해서 복사하세요.");
    if (typeof navigator !== "undefined" && navigator.clipboard && txt) navigator.clipboard.writeText(txt).then(() => done(true), () => done(false));
    else done(false);
  }, [sweep]);
  const doCopy = () => { copyReq.current = true; setSweep((s) => ({ open: true, n: s.n + 1 })); };
  const isOpen = (dflt) => (sweep.open == null ? dflt : sweep.open);
  const k = DEFAULT_PEER.k, twoK = 2 * k;

  return (
    <div className="card at-card ad-card">
      <style>{ASSESS_DESIGN_CSS}</style>
      <div className="card-head"><span className="card-code">상호평가 6</span><span className="card-title">연구 설계: 구조·도구·근거</span>
        <span className="card-sess">교사용</span></div>
      <div className="card-note">
        위 다섯 카드가 <b>무엇을 재고 왜 그렇게 정했는지</b>를 논문 방법 절의 순서로 적었습니다. 숫자·문항·CSV 열 이름은 계산 계층(src-assess-core.mjs)의 값을 그대로 읽어 오므로 화면과 문서가 어긋나지 않습니다.
        원본 문서: 쌍대비교_구현_근거.md(문헌 144편 서지 검증) · 최종작품_상호평가_설계.md · pairwise-research/research-design.md · 평가자_성향_설문_설계.md.
      </div>
      <div className="card-body">
        <div className="at-row">
          <button type="button" className="btn small ghost" onClick={() => setSweep((s) => ({ open: true, n: s.n + 1 }))}>모두 펼치기</button>
          <button type="button" className="btn small ghost" onClick={() => setSweep((s) => ({ open: false, n: s.n + 1 }))}>모두 접기</button>
          <button type="button" className="btn small ghost" onClick={doCopy}>본문 복사</button>
          {copied && <span className="hint" role="status">{copied}</span>}
        </div>

        <div ref={bodyRef} key={sweep.n}>

          {/* ------------------------------------------------ 1 */}
          <Sec id="1" title="연구 질문과 연구의 위치" open={isOpen(true)}>
            <p><b>이 척도가 재는 것.</b> 동료 판정으로 만든 브래들리–테리 θ는 「실재한 적 없는 유물을 더 설득력 있게 성립시킨 쪽」에 대한 <b>학급의 합의</b>입니다. 창의성 점수가 아니라 <b>유물로서의 설득력</b>이며, little-c 틀 <Ref>Kaufman &amp; Beghetto 2009</Ref>에서 학급 기준으로 재는 산물 평가입니다. 교사가 AI 고지를 가린 채 매기는 평정은 합의평가법(CAT) <Ref>Amabile 1982</Ref>에 해당하는 전문가 기준으로, 동료 척도의 수렴 타당도를 확인하는 데 씁니다.</p>
            <p><b>연구의 위치.</b> 통제집단이 없는 단일집단 관찰입니다. 「전유 촉진 장치의 효과 검증」이 아니라 <b>그 장치가 적용된 조건에서의 기술적 관찰 연구</b>로 두고 인과를 주장하지 않습니다. 표본은 2학년 약 140명(5~6개 학급)이며, 학급은 더미 고정효과로 통제합니다(학급 수가 적어 다층모형의 집단 분산을 안정적으로 추정할 수 없습니다). 다중비교는 FDR로 보정합니다.</p>
            <p><b>묻는 것</b>(분석 계획을 질문 형태로 옮긴 것).</p>
            <ol className="ad-ol">
              <li><b>신뢰도·타당도.</b> 고등학생 동료 쌍대비교 척도가 학급 안에서 SSR ≥ {QUALITY_MIN.ssrAdopt}에 이르는가. 교사가 AI 고지를 가린 채 매긴 평정(2인 또는 교사의 부분 쌍대비교)과 r ≈ .6 수준으로 수렴하는가 <Ref>Li 외 2016; Jones &amp; Alcock 2014; 초·중등 메타분석 r = .68: Sanchez 외 2017</Ref>. 창의성 6축 행동지표와는 어떻게 상관하는가.</li>
              <li><b>자기평가의 보정.</b> 동료 작품 k쌍을 근거를 대며 비교한 뒤 자기평가 편향의 절대값이 줄어드는가(calib &gt; 0, 양측 검정). 그 크기가 실제 위치(θ 삼분위)에 따라 다른가 <Ref>Kruger &amp; Dunning 1999의 예측 하나만 사전 지정</Ref>.</li>
              <li><b>판단의 근거.</b> 학급은 무엇으로 작품을 가르는가: 결정적 축 태그 분포, 이유 문장 코딩, 작품 캡션 펼침률.</li>
              <li><b>판정의 품질.</b> 청소년 판정자에서 위치 편향·역순 반복 일치율·잔차 적합도·판정 시간이 어떤 분포를 보이는가(기존 기준값은 모두 성인 판정자의 것).</li>
              <li><b>(별도 실험) AI 고지 감점.</b> 같은 이미지에 라벨만 바꿔 붙인 앵커 4쌍(src-anchor.jsx)과 1차시 평가자 성향 설문(s1, 42문항)으로 잽니다. 이 모듈의 θ에는 들어가지 않습니다.</li>
            </ol>
            <p><b>선행 연구 공백.</b> 청소년이 AI 생성 이미지와 허구 캡션을 쌍대비교로 판정한 연구는 찾지 못했습니다. 국내 K-12 미술 비교판단 연구도 찾지 못했으며, KCI·RISS 재검색으로 부재를 확인한 뒤에만 「국내 첫」을 주장합니다. 동료 쌍대비교가 전문가 순위와 높은 상관을 얻는다는 보고는 대학 <Ref>Jones &amp; Alcock 2014</Ref>, 중등 설계 교과 <Ref>Bartholomew 외 2019; Seery 외 2012</Ref>, 12~15세 <Ref>Jones &amp; Wheadon 2015</Ref>에 있습니다.</p>
          </Sec>

          {/* ------------------------------------------------ 2 */}
          <Sec id="2" title="흐름과 자료 구조: 단계마다 무엇이 어디에 남는가" open={isOpen(false)}>
            <p>평가의 단위는 점수가 아니라 <b>비교</b>입니다. 자기평가를 같은 문항으로 두 번 하고 그 사이에 동료 비교를 넣어, 두 자기평가의 차이를 핵심 자료로 삼습니다. 모든 문서는 기존 규약({"{ v: 값, updatedAt }"}, 학번이 문서 id)을 따릅니다.</p>
            <T head={["단계", "학생이 하는 것", "저장 위치", "잠금·규칙"]} rows={[
              ["제출", "기록지의 최종 작품(번호·제목·작품 캡션·aiLevel·대표 이미지)을 확인하고 제출 확정. 비교 중에 원본이 바뀌어도 판정자마다 같은 작품을 보도록 스냅샷으로 고정", <M key="a">submissions/{"{학번}"}</M>, "확정 시 잠김. 명단에 든 작품은 교사도 풀지 않음"],
              ["자기평가 ①", "5문항 1~5점 + 근거 한 문장 + 학급 안 등수 예측", <M key="b">assess/{"{학번}"}.self.s1</M>, "제출 시 잠김"],
              ["동료 비교", "배정된 k쌍 + 숨은 역순 반복 1쌍. 쌍마다 승자·이유·결정적 축 태그·표시(어려움·작성자 짐작)", <M key="c">assess/{"{학번}"}.judge.p1</M>, "쌍 단위 저장, 되돌리기 없음. 명단을 다시 확정하면 judge.r_<배정표 해시>_<확정 시각 해시>에 새로 쌓이고 옛 블록은 남음"],
              ["자기평가 ②", "①을 보지 않은 채 같은 5문항·근거·등수 예측에 답해 「현재 점수 확정」(lockedAt). 그다음 화면에서 ①과 나란히 보고 변화 사유", <M key="d">assess/{"{학번}"}.self.s2</M>, "확정 시 점수·예측이 고정됨. 변화 사유 전에 끊겨도 확정값은 자료"],
              ["결과", "받은 이유 문장·태그 먼저, 자리(밴드)는 「자리 보기」를 눌러야", <M key="e">assess/{"{학번}"}.result</M>, "교사만 씀(보안 규칙). 학생은 자기 것만 읽음"],
              ["명단·배정표", "교사가 「비교 명단 확정」할 때 한 번 고정: fixedAt·seed·k·repeat·works·judges·plan·hash·stats", <M key="f">meta/peerRoster</M>, "교사만 씀, 로그인하면 읽음. works에 작품 번호와 소유자 학번({no, sid})이 함께 들어 있어 학생도 대응표를 읽을 수 있음. 표시상 익명·저장상 준익명(§10)"],
              ["설정", "단계 스위치와 k·반복·최소 시간·이유 하한·확신도·공개 범위·종합 질문", <M key="g">config.peer</M>, "k·반복은 명단 확정 순간 배정표에 고정됨"],
            ]} />
            <p>명단을 문서 하나로 고정하는 것이 이 설계의 가장 중요한 한 줄입니다. 명단이 실시간으로 바뀌면 학생마다 다른 쌍을 보게 되어 노출 균형이 깨지고 점수를 견줄 수 없습니다 <Ref>research-design §7: 학생 기기에서 즉석 난수를 쓰지 않는다</Ref>. 집계는 학생 문서의 판정을 배정표와 화면 순번·쌍·좌우·반복까지 대조해 맞지 않는 것을 버립니다. 학생이 자기 문서에 쓸 수 있는 구조에서 자기 작품을 끼워 넣은 판정이 점수를 움직이면 안 되기 때문입니다.</p>
            <p className="ad-h">2.1 8차시 운영표와 판정 순서(100분, 24명 기준)</p>
            <p>자기평가 ①·동료 비교·자기평가 ②는 모두 8차시 한 차시 안에서 이 순서로 합니다. 수업 전에 최종 작품 제출을 마감하고 교사가 「비교 명단 확정」을 누릅니다(seed·k·반복이 이때 배정표에 고정됨).</p>
            <T head={["시간", "하는 일", "규칙"]} rows={[
              ["0~5분", "오늘 하는 일·종합 질문·학급 공통 배너 공지, 예시 한 쌍을 함께 판정(시연)", "연습용 예시는 학급 작품이 아닌 중립 쌍으로 하고 앵커 쌍과 겹치지 않게 함"],
              ["5~12분", "자기평가 ①(5문항·근거·등수 예측)", "제출 직후의 첫 평가. 제출 시 잠김"],
              ["12~30분", "본 판정 k쌍 + 숨은 역순 반복 1쌍(쌍당 60~90초)", "반복은 맨 뒤에 놓이고 원본은 앞 k − 2화면 가운데서 고르므로 원본과 반복 사이에 다른 화면이 최소 2개 있음(연구 설계서의 요구는 3개. 이 차이는 한계로 적음)"],
              ["본 판정 뒤", "앵커 4쌍(설정을 켠 학급) → 같은 차시에 교사가 라벨 조작을 직접 밝힘", "화면이 순서를 강제하지 않으므로 교사가 본 판정이 끝난 뒤에 엶"],
              ["30~33분", "교사 집계 실행, 품질 타일 확인", "기준 미달이면 미완료 학생의 판정을 받은 뒤 다시 집계"],
              ["33~45분", "교사가 기준 예시 한 쌍을 함께 짚은 뒤 자기평가 ②(①을 보지 않고 답해 「현재 점수 확정」 → ①과 나란히 보고 변화 사유)", "하위권의 과대평가는 동료 작품을 보는 것만으로 저절로 교정되지 않음(Kruger &amp; Dunning 1999; Nederhand 외 2019)"],
              ["45~60분", "결과 공개(이유·태그 먼저, 자리는 학생이 눌러야)와 토의: 예측과 실제가 가장 어긋난 지점, 축 태그 분포", "공개 전에 교사가 받은 이유 문장을 훑어봄(앱 안의 검토 단계는 없음)"],
              ["이후", "8차시 기록 P·Q(비평과 성찰), 받은 문장의 반영 여부(peerBack)", ""],
            ]} />
            <p>①과 비교 사이, 비교와 ② 사이의 간격이 몇 분에 불과하므로 보정량(calib)은 「같은 시간 안에서 동료 비교가 자기 기준을 얼마나 움직였는가」이지 지속 효과가 아닙니다. 이 점은 §11의 한계에 적습니다.</p>
          </Sec>

          {/* ------------------------------------------------ 3 */}
          <Sec id="3" title="확정 파라미터: 값과 근거" open={isOpen(false)}>
            <p>값은 계산 계층의 상수를 그대로 읽은 것입니다. 교사가 바꿀 수 있는 것(k·반복·최소 시간·이유 하한·확신도·공개 범위·질문)은 카드 1에 있고, 나머지는 코드에 고정돼 있습니다.</p>
            <p><b>도구 버전의 고정.</b> 명단 확정 문서(meta/peerRoster)에 고정되는 것은 k·반복·seed·배정표·hash이고, 종합 질문 문구·최소 시간·이유 하한·확신도 스위치·공개 범위는 config.peer에 남아 판정 CSV에 실리지 않습니다. 그래서 운영 규칙으로 (1) 첫 학급의 명단 확정 전에 질문 문구와 설정을 확정하고 자료 수집 기간 동안 바꾸지 않으며, (2) 논문에는 사용한 종합 질문 전문, 설정값(k·반복·minSec·minWhy·askConf·reveal), 앱 빌드의 커밋 해시, 문항 상수의 버전 키(ASSESS_VER·ROSTER_VER·STANCE_VER·ANCHOR_VER)를 표로 적습니다. 학급 간에 설정이 달랐다면 그 학급은 분석에서 분리합니다(학급 더미는 문구 차이를 흡수하지 못합니다).</p>
            <T head={["항목", "값", "어디에", "근거"]} rows={[
              ["판정 방식", "강제선택(동점 없음), 두 작품 동시 제시", "학생 화면", "Thurstone 1927; Bramley 2007; Kinnear 외 2025; Mantiuk 외 2012"],
              ["1인당 본 판정 k", "기본 " + k + ", 하한 " + K_FLOOR + ", 상한 " + kMax + ". 작품이 적으면 n−1로 자름", <M key="k">DEFAULT_PEER.k · K_FLOOR</M>, "Verhavert 외 2019; Kinnear 외 2025; Crompvoets 외 2020"],
              ["작품당 노출", "정확히 2k(판정자 수 = 작품 수일 때). k=" + k + "·24명이면 작품당 " + twoK + "회", <M key="p">makePlan</M>, "작품당 20회 이상이면 SSR .80이 일반적(메타분석)"],
              ["배정", "비적응·균형 고정, seed로 결정론, 명단 확정 시 문서로 고정", <M key="r">meta/peerRoster</M>, "Bramley 2015; Bramley & Vitello 2019; Crompvoets 외 2020"],
              ["좌우 위치", "회차 안에서 작품마다 왼쪽·오른쪽 한 번씩, 판정자별 균형. 실제 배치 축(x/y)·화면 폭 기록", <M key="s">balanceSides · axis</M>, "Davidson & Beaver 1977; Day 1969; Bar-Hillel 2015"],
              ["숨은 반복", "기본 " + DEFAULT_PEER.repeat + "쌍, 좌우 뒤집어 맨 뒤, 점수 계산 제외, 일치율만 보고", <M key="rep">repeat · repeatAgreement</M>, "Kendall & Babington Smith 1940; Pavlichenko & Ustalov 2021"],
              ["최소 판정 시간", "기본 " + DEFAULT_PEER.minSec + "초. 미만이면 한 번 경고, 시계는 되감지 않음. " + FAST_SEC + "초 미만은 표시(삭제 없음)", <M key="f">minSec · FAST_MS</M>, "Bramley & Vitello 2019(1초/판정 제외); Pavlichenko & Ustalov 2021(4초 하한)"],
              ["이유 문장", "모든 쌍. 하한 " + DEFAULT_PEER.minWhy + "자(차단), " + SHORT_WHY + "자 미만은 표시만, 상한 " + REASON_MAX + "자. 직전 3쌍과 2-gram 자카드 ≥ " + DUP_SIM + "이면 한 번 경고 뒤 통과", <M key="w">minWhy · SHORT_WHY · DUP_SIM</M>, "Nicol 2021; Lesterhuis 외 2022; van Daal 외 2019. 15자에는 문헌 근거가 없어 표시로만"],
              ["확신도", "기본 " + (DEFAULT_PEER.askConf ? "켬" : "끔") + ". 대신 「판단이 어려웠다」·「누구 작품인지 알 것 같다」 표시를 늘 둠", <M key="c">askConf · hard · knowAuthor</M>, "Mantiuk 외 2012(등급 응답은 시간만 늘림); van Daal 외 2017(판단 난이도는 의미 있는 변수)"],
              ["결정적 축 태그", "선택 뒤에 묻는 " + TAG_OPTIONS.length + "보기: " + TAG_OPTIONS.map((t) => t.label).join("·") + ". 「노력」 없음", <M key="t">TAG_OPTIONS</M>, "Leech & Chambers 2022; Bellaiche 외 2023; Magni 외 2023"],
              ["작품 캡션", "접힌 채 시작, 펼침 여부(한 번이라도) 기록", "학생 화면", "조건 실험(이미지 단독/캡션 포함)은 단일 학급에서 검정력이 없어 후속"],
              ["AI 고지", "비교 화면에서 개별 고지 숨김, 학급 공통 배너로 대체(정책적 고지)", "학생 화면", "Bellaiche 외 2023; Horton 외 2023; Jacobs 외 2025; Schilke & Reimann 2025"],
              ["자기평가", SELF_ITEMS.length + "문항(종합 + 4축) + 근거 + 등수 예측. ②는 ①을 보지 않고 답해 확정한 뒤 나란히 봄", <M key="se">SELF_ITEMS</M>, "Schraw 2009; Nederhand 외 2019(앵커링 회피)"],
              ["점수", "Bradley–Terry, Hunter의 MM 반복, 가상 기준 작품 0.5승 사전, 학급 평균 0", <M key="bt">bradleyTerry</M>, "Bradley & Terry 1952; Hunter 2004; Caron & Doucet 2012; Hamilton & Tawn 2024"],
              ["신뢰도 기준", "SSR ≥ " + QUALITY_MIN.ssrAdopt + " 공개, " + QUALITY_MIN.ssr + "~" + QUALITY_MIN.ssrAdopt + " 주의 공개, < " + QUALITY_MIN.ssr + " 보류 권고. 작품당 비교 < " + QUALITY_MIN.perWork + "회는 보류. 반분(" + splitReps + "회 중앙값, 기준 " + QUALITY_MIN.splitHalf + ")은 보고 지표", <M key="q">QUALITY_MIN</M>, "Kinnear 외 2025; Verhavert 외 2018; Bramley 2015"],
              ["판정자 적합도", "infit " + INFIT_BAND[0] + "~" + INFIT_BAND[1] + " 밖 또는 학급 평균+2SD 위면 표시(제외 없음). θ 차 ≥ " + AGAINST_GAP + " 쌍의 역방향률, 빠른 판정, 중복 이유 함께", <M key="j">judgeFit · INFIT_BAND · AGAINST_GAP</M>, "Andrich 1978; Bramley 2007; Linacre 2002; Wu 외 2022; van Daal 외 2017"],
              ["결과 공개", "이유·태그 먼저, 자리는 학생이 눌러야. 기본 " + DEFAULT_PEER.reveal + "(상·중·하). 학급 평균·순위표 없음", <M key="rv">reveal</M>, "Butler 1988; Kluger & DeNisi 1996; Goulas & Megalokonomou 2021; Fang 외 2018"],
              ["익명·동의", "작품 번호만 표시(저장상 준익명). 6항목 분리 동의. 교사만 result 쓰기", <M key="rl">firestore.rules</M>, "안부영 2014; Panadero & Alqassab 2019; 개인정보 보호법 제22조·제28조의2"],
            ]} />
          </Sec>

          {/* ------------------------------------------------ 4 */}
          <Sec id="4" title="배정 규칙: 작품마다 정확히 2k회" open={isOpen(false)}>
            <p>서버 없이도 학급 전체의 노출이 고르게 되도록, 명단의 작품 수를 n, 판정자 색인을 j(작품이 있는 판정자는 자기 작품의 명단 순서. 작품 없는 판정자는 이 규칙 대신 아래의 탐욕 배정을 받고, 명단 확정 뒤에 들어온 판정자는 seed 해시로 정한 0~n−1 안의 가상 자리를 받음), 회차를 r = 1…k라 할 때 판정자 j의 r회차 쌍은 다음과 같습니다.</p>
            <F>{"A = (j + r) mod n\nB = (j + r + d_r) mod n"}</F>
            <p>A = j + r은 회차 r을 고정하면 판정자가 학급을 한 바퀴 도는 동안 모든 작품을 정확히 한 번 덮고, d_r이 회차 안에서 상수이므로 B도 그렇습니다. 따라서 모두가 k회차를 마치면 <b>작품마다 정확히 2k회</b> 노출됩니다. 간격열 d_1…d_k는 깊이 우선 탐색으로 고릅니다. 조건은 네 가지입니다.</p>
            <ol className="ad-ol">
              <li>B ≠ 판정자 자신: (r + d_r) mod n ≠ 0.</li>
              <li>앞 회차와 같은 무순서쌍을 만들지 않음: d_r + d_r′ ≡ 0이고 d_r′ ≡ r − r′이면 같은 쌍이 두 번 나옵니다.</li>
              <li>거리 급 min(d, n − d)을 되도록 다르게 써서 학급 전체 쌍의 종류를 늘림.</li>
              <li>gcd(n, d_1, …, d_k) = 1: 순환 그래프가 하나로 이어지는 조건 <Ref>Ford 1957</Ref>.</li>
            </ol>
            <p>n = 4~40에서 k = 10과 12(작품이 적으면 n − 1)로 seed 20개씩, 그리고 (n, k) = (4, 3)과 (30, 4)에서 seed 200개씩 돌린 회귀 검사(<M>npm test</M>)에서 예외 없이 해가 있고 그래프가 이어집니다. 쌍 목록은 명단 확정 때 seed로 한 번 계산해 <M>meta/peerRoster</M>에 저장하고, 명단 확정 뒤에 들어온 판정자만 (명단, 학번, seed)로 결정론적으로 계산하므로 앱을 껐다 켜도 같은 순서가 나옵니다.</p>
            <p><b>좌우 위치.</b> 회차 안의 순환 성분(x → x − d)마다 색을 하나로 두면 작품마다 왼쪽·오른쪽 한 번씩이 되고, 성분을 통째로 뒤집는 자유도로 판정자별 좌우 횟수를 맞춥니다. 작품 없는 판정자는 노출이 적은 작품부터 탐욕으로 짝짓고, 반복 화면의 원본은 좌우 누적 편차가 줄어드는 쌍으로 고릅니다. 좁은 화면에서는 「왼쪽」이 곧 「위」이므로 실제 배치 축(x/y)과 화면 폭을 판정마다 기록합니다.</p>
            <p><b>적응적 배정(ACJ)은 쓰지 않습니다.</b> 적응은 SSR을 부풀리고 <Ref>Bramley 2015: 무작위 판정에서도 SSR .89; Bramley &amp; Vitello 2019: .97이 보정 후 .84</Ref>, 순위 정확도는 더 얻지 못하며 <Ref>Crompvoets 외 2020</Ref>, 학생 화면이 다른 학생의 판정을 실시간으로 읽어야 해서 보안 규칙을 크게 열어야 합니다. 학급 규모(20~30명)에서는 균형 배정만으로 충분합니다.</p>
            <p><b>예외.</b> n &lt; 4면 비교 불가(자기평가만). 명단 확정 뒤 들어온 제출은 판정에는 참여하되 자기 작품은 다음 확정 때 편입. 명단을 다시 확정하면 옛 판정은 지우지 않고 새 블록에 쌓습니다. 결석·중도 이탈은 판정 수가 적어도 점수를 산출하되 교사 화면에 미완료자를 표시합니다.</p>
          </Sec>

          {/* ------------------------------------------------ 5 */}
          <Sec id="5" title="측정 도구: 화면·문항·기록 필드" open={isOpen(false)}>
            <p className="ad-h">5.1 쌍대비교 화면</p>
            <p>종합 질문 하나만 묻습니다(교사가 카드 1에서 고칠 수 있음). 축을 쌍마다 여러 번 물으면 판정 시간이 늘고 피로가 신뢰도를 깎습니다. 또한 판정 중에 축을 나열하면 총체적 판단이 분석적으로 바뀝니다 <Ref>Leech &amp; Chambers 2022; Jones &amp; Wheadon 2015</Ref>.</p>
            <F>{PEER_QUESTION}</F>
            <ul className="ad-ul">
              <li>두 작품을 같은 상자(4:3, object-fit: contain, 중립 배경)에 동시에 놓고 작품 번호만 보입니다. 작가명·학급·프롬프트·생성 횟수·이전 점수는 없습니다.</li>
              <li>두 이미지가 모두 화면에 60% 이상 들어와야(IntersectionObserver) 고를 수 있고, 이미지를 불러오지 못한 쌍은 고를 수 없습니다.</li>
              <li>강제선택입니다. 동점 허용 모형 <Ref>Rao &amp; Kupper 1967; Davidson 1970</Ref>은 모수가 늘어 학급당 300건 안팎으로는 지탱할 수 없고, 강제선택이 가장 빠르고 민감했습니다 <Ref>Mantiuk 외 2012</Ref>.</li>
              <li>선택 뒤에 이유 한 문장(하한 {DEFAULT_PEER.minWhy}자, 상한 {REASON_MAX}자)과 결정적 축 태그를 받습니다. 비교를 글로 옮기는 것이 내적 피드백을 만드는 기제이고 <Ref>Nicol 2021</Ref>, 이 문장들이 8차시 성찰(받은 문장의 반영 여부)의 재료가 됩니다.</li>
              <li>「판단이 어려웠다」(경험된 복잡성 <Ref>van Daal 외 2017</Ref>)와 「누구 작품인지 알 것 같다」(익명성 민감도 분석용)를 늘 둡니다. 확신도 5단계({CONF_LABELS[0]} … {CONF_LABELS[4]})는 교사가 「묻기」로 활성화했을 때만 묻습니다(기본은 묻지 않음).</li>
              <li>최소 시간 경고는 시계를 되감지 않습니다. 경고 뒤 그대로 넘긴 판정은 <M>fastOverride</M>로 남아 「극단적으로 빠른 판단」 변수가 보존됩니다.</li>
              <li>작품 캡션은 접힌 채 시작하며 한 번이라도 펼쳤는지를 기록합니다. 개별 AI 고지는 비교 화면에 없고 학급 공통 배너만 있습니다: 「{AI_BANNER}」. AI 라벨은 같은 작품의 평가를 전 항목에서 낮추고 <Ref>Bellaiche 외 2023</Ref> 강제선택 쌍 설계가 라벨에 가장 민감하므로 <Ref>Jacobs 외 2025</Ref> 작품마다 다른 고지가 보이면 그 차이가 θ에 그대로 실립니다. 숨겼다가 들키는 것이 밝히는 것보다 나쁘므로 <Ref>Schilke &amp; Reimann 2025</Ref> 이 규칙은 판정 전에 학급에 공지하는 정책적 고지입니다.</li>
              <li>자기 작품은 절대 나오지 않고, 고른 것은 되돌릴 수 없습니다.</li>
            </ul>

            <p className="ad-h">5.2 평가 4축(자기평가와 결정적 축 태그가 같은 말을 씀)</p>
            <T head={["키", "축", "묻는 것"]} rows={CRITERIA.map((c) => [<M key="k">{c.k}</M>, c.label, c.desc])} />

            <p className="ad-h">5.3 자기평가 ①·② (같은 문항, 같은 척도)</p>
            <T head={["키", "항목", "학생 문항"]} rows={SELF_ITEMS.map((s) => [<M key="k">{s.k}</M>, s.label, s.text])} />
            <p>척도: {SELF_LABELS.map((l, i) => (i + 1) + " " + l).join(" · ")}. 종합 문항(overall)이 쌍대비교의 질문과 직접 맞닿는 주지표이고 네 세부 축은 변화 위치를 해석하는 진단값입니다. 교사 루브릭과 같은 척도가 아니므로 원점수를 직접 대조하지 않습니다.</p>
            <ul className="ad-ul">
              <li><b>근거 문항(필수):</b> 이번 점수를 정할 때 가장 중요하게 본 내 작품의 구체적인 특징이나 근거 한 가지(학생 화면의 문구 그대로).</li>
              <li><b>등수 예측:</b> 「우리 반 n점 가운데 내 작품은 몇 번째쯤일까요?」 슬라이더(1이 가장 앞). 저장은 등수와 백분위 둘 다.</li>
              <li><b>②의 절차:</b> ①의 답·학급 결과·순위를 보여 주지 않은 채 답하게 하고 「현재 점수 확정」을 누른 뒤, 그다음 화면에서 ①과 나란히 놓고 변화 사유를 받습니다. 「다시·향상」처럼 점수가 달라져야 한다는 암시를 쓰지 않고, 비교 활동 때문이라고 가정하지 말라고 안내합니다 <Ref>앵커링 회피: Schraw 2009; Nederhand 외 2019</Ref>.</li>
              <li><b>변화 사유:</b> {CHANGE_CODES.map((c) => "「" + c.label + "」").join(" · ")}. 「{CHANGE_CODES.find((c) => c.k === "unclear").label}」을 뺀 보기에서만 {MIN_WHY_CHANGE}자 이상의 짧은 서술을 받습니다.</li>
            </ul>
            <F>{"predPct = (n − predRank) / (n − 1)        n = 예측 때의 학급 작품 수, 1등이면 1, 꼴찌면 0"}</F>

            <p className="ad-h">5.4 판정 1건에 남는 필드</p>
            <T head={["필드", "뜻"]} rows={[
              [<M key="1">i · a · b · left · rep</M>, "화면 순번, 배정된 두 작품, 먼저 놓인 쪽, 반복이면 원본 순번. 집계 때 배정표와 대조하는 열쇠"],
              [<M key="2">win</M>, "고른 쪽(a/b). 강제선택"],
              [<M key="3">why · tag</M>, "이유 문장, 결정적 축 태그(" + TAG_OPTIONS.map((t) => t.k).join("·") + ")"],
              [<M key="4">ms · fastOverride</M>, "실제 경과 밀리초, 최소 시간 경고를 넘긴 표시"],
              [<M key="5">plateOpened</M>, "작품 캡션을 한 번이라도 펼쳤는가"],
              [<M key="6">hard · knowAuthor</M>, "「판단이 어려웠다」, 「누구 작품인지 알 것 같다」"],
              [<M key="7">conf</M>, "확신도 1~5(교사가 「묻기」로 활성화했을 때만)"],
              [<M key="8">axis · vw · at</M>, "실제 배치 축(x/y), 화면 폭, 저장 시각"],
            ]} />
            <p><b>판정 시간의 정의.</b> ms의 시작은 화면이 뜬 시각이 아니라 두 작품 이미지가 모두 불러와진 시각이며(하나라도 불러오지 못하면 화면이 뜬 시각), 끝은 「다음」을 눌러 저장한 시각입니다. 따라서 ms는 선택 반응시간이 아니라 <b>보기·고르기·이유 쓰기·태그 고르기를 합친 한 쌍의 처리 시간</b>이고, 최소 시간 {DEFAULT_PEER.minSec}초와 {FAST_SEC}초 표시도 그 시간에 적용됩니다. 선택 시각과 이유 작성 시간을 따로 남기지 않는 것은 이 구현의 한계이며, 연구 설계서가 요구한 「두 이미지가 각각 60% 이상 보인 시각의 최댓값」 대신 불러오기 완료를 쓰므로 스크롤이 필요한 좁은 화면(axis = y)에서는 시간이 길게 잡힐 수 있어 축별로 나눠 봅니다. 논문에서는 이 변수를 「판정 처리 시간」으로 부르고 반응시간 문헌의 절단값과 직접 견주지 않습니다.</p>

            <p className="ad-h">5.5 함께 쓰는 다른 도구</p>
            <ul className="ad-ul">
              <li><b>평가자 성향 설문 s1</b>(42문항, 1차시 사전, <M>surveys/{"{학번}"}.stance</M>, 자체 버전 키 STANCE_VER): AI 사용량·AI 태도와 감정·예술 태도. 8차시 직전에 물으면 AI를 판정 기준으로 떠올리게 만드는 요구특성이 생기므로 반드시 사전에 받습니다. 설계: 평가자_성향_설문_설계.md.</li>
              <li><b>앵커 4쌍</b>(src-anchor.jsx): 본 판정에서 고지 감점을 모형화하면 logit P(a 승) = (θ_a − θ_b) + (β_0 + β_j)(D_a − D_b)인데, 고지 수준 D(aiLevel 0~3)는 작품에 고정된 속성이라 작품 효과 θ에 흡수되어 학급 평균 감점 β_0은 식별되지 않고 판정자별 편차 β_j만 남습니다. 게다가 이 설계의 비교 화면에는 개별 고지가 보이지 않으므로 본 판정에서는 D 자체가 판정자에게 보이지 않습니다. 그래서 학급 밖 작품 네 쌍에 같은 이미지·다른 「AI 활용 범위」 라벨을 붙이되, 조건은 학번 끝자리의 홀짝으로 나누고 「AI 전면」 라벨이 붙는 쪽은 쌍마다 뒤집습니다(학번에 따른 교대 배정이며 무작위 추첨은 아님). 두 조건의 선택률 차이를 학급 평균 감점의 추정치로, 개인 수준에서는 anchorScore(0~4)를 씁니다. 학생 화면에 따로 뜨는 카드라 화면이 순서를 강제하지 않으므로 교사가 본 판정이 끝난 뒤에 열어야 하며(config.anchor.open), 연습 쌍·황금 통제 항목 역할과 겹치지 않게 합니다. 끝나면 같은 차시에 교사가 직접 밝힙니다(디브리핑). aiLevel은 학생 자신의 선언이므로 논문에서는 「실제 AI 개입도」가 아니라 「고지된 개입도」로만 부릅니다.</li>
              <li><b>창의성 설문 v1</b>(24문항 5점, 사전·사후)과 <b>행동지표 6축</b>, <b>교사 루브릭</b>(AI 고지 가린 채, 2인 또는 부분 쌍대비교): 「연구」·「창의성」 탭. 동료 θ와의 상관이 수렴 타당도의 증거입니다.</li>
            </ul>
            <p className="ad-h">5.6 도구 점검(본 수집 전)</p>
            <p>본 수집 전에 학생 5~8명에게 자기평가 5문항·종합 질문·결정적 축 태그 5보기·변화 사유 4보기·결과 화면 문구의 이해와 화면 사용(캡션 펼침, 등수 슬라이더, 「현재 점수 확정」)을 묻는 인지면담을 합니다. 고친 문항은 버전 키(ASSESS_VER)를 올려 기록해 학급 간 동일성을 지킵니다. 결과 화면(밴드·「자리의 폭이 넓다」 문구)은 한 학급에서 먼저 시험합니다. 인지면담 대상 학생과 파일럿 학급의 자료는 본 분석에서 분리해 보고하며, 파일럿의 분산·결측·판정자 군집은 다음 수집의 k를 정하는 모의검정의 입력으로만 씁니다.</p>
          </Sec>

          {/* ------------------------------------------------ 6 */}
          <Sec id="6" title="추정 모형: 브래들리–테리" open={isOpen(false)}>
            <p>승률만 쓰면 센 상대와 붙어 진 작품이 부당하게 밀립니다. 두 대상의 우열 판단은 절대 평정보다 훨씬 일관된다는 것이 Thurstone(1927)의 비교판단 법칙이고, 그 판단을 확률 모형으로 척도화한 것이 Bradley–Terry(1952) 모형입니다 <Ref>Zermelo 1929가 선행</Ref>.</p>
            <F>{"P(i가 j를 이김) = 1 / (1 + exp(−(θ_i − θ_j)))\n\nHunter(2004)의 MM 반복:   p_i ← W_i / Σ_j n_ij / (p_i + p_j)      θ_i = ln p_i\n표준오차:                  SE_i = [ Σ_j n_ij · p_i p_j / (p_i + p_j)² ]^(−1/2)"}</F>
            <ul className="ad-ul">
              <li><b>가상 기준 작품 사전.</b> p = 1로 고정한 기준 작품과 각 작품이 1회 비교해 0.5승을 거둔 것으로 두어 전승·전패 작품도 유한한 값에 머뭅니다 <Ref>Caron &amp; Doucet 2012의 MAP 형태; 무작위 배정에서는 가상 비교·더미 항목·Firth 벌점이 사실상 동등: Hamilton &amp; Tawn 2024</Ref>. 최종 θ는 학급 평균 0으로 옮깁니다 <Ref>Wu·Junker·Niezink 2022</Ref>.</li>
              <li><b>수렴.</b> 허용오차 1e−7, 최대 5,000회. MM은 선형 수렴이라 900회 안팎이 예사이며 30작품이면 수 밀리초입니다. 서버 코드를 두지 않는 구조라 교사 브라우저가 집계를 돌립니다.</li>
              <li><b>표준오차</b>는 관측 정보 행렬의 대각 성분만 쓴 점근 근사입니다 <Ref>Simons &amp; Yao 1999</Ref>. 논문에서는 내려받은 판정 CSV를 BradleyTerry2 <Ref>Turner &amp; Firth 2012</Ref>로 다시 적합해 완전 정보행렬 표준오차와 좌우 순서 항까지 넣고, 클라이언트 값과의 상관(r &gt; .99 기대)을 보고합니다.</li>
              <li><b>순위·백분위·밴드.</b> 동점은 공동 순위(1 + 자기보다 확실히 높은 작품 수), pct = (n − rank)/(n − 1), 밴드는 상위 ⌈n/3⌉ 「상」·하위 ⌊n/3⌋ 「하」. 비교된 적 없는 작품은 순위를 매기지 않고 분모에서도 뺍니다(판정 도중에 집계해도 「하」가 붙지 않도록).</li>
              <li><b>척도는 학급 안에서만</b> 비교됩니다. 학급을 잇는 공통 작품이 없으므로 학급 간 θ를 한 척도에 놓지 않습니다. 효과는 logit 대신 밴드·순위 이동으로 표현하고 부트스트랩 구간을 붙입니다 <Ref>Crompvoets 외 2021</Ref>.</li>
            </ul>
          </Sec>

          {/* ------------------------------------------------ 7 */}
          <Sec id="7" title="신뢰도와 품질 판정 도구: 무엇을 어떤 기준으로 보는가" open={isOpen(false)}>
            <p>카드 4의 품질 타일과 판정자 표는 아래 지표를 그대로 보여 줍니다. 두 층의 기준을 구분합니다: <b>공개 보류 권고</b>(수업 운영)와 <b>논문 채택 기준</b>(분석). 어떤 지표도 판정자를 자동으로 제외하는 근거가 아닙니다 <Ref>Wu·Niezink·Junker 2022: 조사하되 지우지 않는다</Ref>.</p>
            <T head={["지표", "계산", "기준", "근거"]} rows={[
              ["SSR(척도분리신뢰도)", "(관측 분산(θ) − 평균 SE²) / 관측 분산(θ). Rasch 분리 신뢰도와 같은 식", "채택 ≥ " + QUALITY_MIN.ssrAdopt + " · 주의 " + QUALITY_MIN.ssr + "~" + QUALITY_MIN.ssrAdopt + " · 보류 < " + QUALITY_MIN.ssr, "Verhavert 외 2018(판정자 간 일치도로 읽을 것); Kinnear 외 2025(SSR이 반분보다 체계적으로 높으므로 .80을 권고, 그때 반분 신뢰도 > .70인 자료가 약 9할)"],
              ["판정자 반분 신뢰도", "판정자를 무작위로 반으로 갈라 각각 적합, θ 상관 r을 스피어만–브라운 2r/(1+r)로 보정. " + splitReps + "회 중앙값(보정 전 r도 표시). 논문은 1,000회", "보고 지표(기준 " + QUALITY_MIN.splitHalf + "). 반쪽 자료는 작품당 노출이 절반이라 SSR .80일 때 .58~.68에 머무는 것이 보통", "Kinnear 외 2025의 회귀. 판정자 단위 분할이 판정 단위보다 보수적"],
              ["작품당 평균 비교 수", "N_CR = 2 × 본 판정 수 / 작품 수(반복 제외)", "보류 < " + QUALITY_MIN.perWork + " · 보수적 목표 20 · SSR 정밀도 보수안 42", "Kinnear 외 2025(10회); 교육연구 관행(20회); Crompvoets 외 2021(N=30에서 25회 미만은 과대 추정)"],
              ["비교 그래프 연결성", "무방향 그래프의 성분 수(배정에서 보장), 승→패 방향 그래프의 강연결(전승·전패 없음)", "단절이면 보류. 강연결이 아니면 일반 최대우도 순위를 그대로 확정하지 않음", "Ford 1957"],
              ["배정 밖 판정 제외", "학생 문서의 항목을 배정표와 화면 순번·쌍·좌우·반복·자기 작품까지 대조", "1건이라도 있으면 보류 사유로 표시(누가 그랬는지 함께)", "학생이 자기 문서에 쓸 수 있는 구조의 방어"],
              ["위치 편향", "먼저 놓인 쪽(왼쪽·위) 선택률과 Wilson 95% 구간, 축(x/y)별로", "구간이 .50을 포함하면 통과. 대규모 자료의 기대치 50~51%", "Bar-Hillel 2015; Day 1969; Pavlichenko & Ustalov 2021. 위아래 배치의 위치 효과를 검정한 연구는 없어 경험적 점검 항목"],
              ["역순 반복 일치율", "숨은 반복 쌍에서 원본과 같은 작품을 고른 비율, Wilson 95% 구간", "기술적 품질 지표. 개인·학급의 합격 기준으로 쓰지 않음(24명이면 반복 24쌍뿐)", "Kendall & Babington Smith 1940; van Daal 외 2017·Marcoci 외 2024(합의와 어긋나는 판정 20% 안팎이 정상)"],
              ["infit · outfit", "판정마다 P = 모형이 예측한 승자 확률, x ∈ {0,1}. infit = Σ(x − P)² / ΣP(1 − P), outfit = 평균 z²", INFIT_BAND[0] + "~" + INFIT_BAND[1] + " 밖 또는 학급 평균+2SD 위면 표시. " + INFIT_BAND[0] + " 미만(지나치게 예측 가능)은 SSR을 부풀릴 수 있어 수를 보고", "Andrich 1978(Thurstone/Rasch 동치); Bramley 2007; Linacre 2002; Pollitt 2012(+2SD 관행). 판정 12건이면 표준오차가 커서 참고만"],
              ["역방향률", "θ 차 ≥ " + AGAINST_GAP + "인 쌍에서 합의와 반대로 고른 비율", "> 40%면 표시", "van Daal 외 2017의 decision accuracy 변형. 12쌍의 logit 척도는 잡음이 커서 이 규칙은 흔들림"],
              ["빠른 판정", FAST_SEC + "초 미만 판정 수, 경고 뒤 그대로 넘긴 수(fastOverride)", "3건 이상이면 표시. 문헌에 검증된 절단값은 없음", "Bramley & Vitello 2019; Pavlichenko & Ustalov 2021"],
              ["이유 문장 품질", "앞선 자기 문장과 2-gram 자카드 ≥ " + DUP_SIM + "인 중복 수, " + SHORT_WHY + "자 미만 수", "표시만", "Lesterhuis 외 2022; van Daal 외 2019"],
              ["캡션 펼침률 · 어려움 · 작성자 짐작", "판정 가운데 plateOpened · hard · knowAuthor 비율", "작성자 짐작 ≥ 20%면 주의(익명성 민감도 분석)", "Panadero & Alqassab 2019; van Daal 외 2017"],
              ["결정적 축 태그 분포", "5보기의 건수", "기술 통계. 판정 근거 코딩과 나란히 봄", "Leech & Chambers 2022"],
            ]} />
            <p className="ad-h">공개 판정 규칙(카드 4가 그대로 따르는 것)</p>
            <ul className="ad-ul">
              <li><b>보류 사유</b>(하나라도 있으면 「기준 미달」, 교사가 알고도 공개하려면 확인란): 판정 없음 · 작품당 비교 &lt; {QUALITY_MIN.perWork}회 · 비교 그래프 단절 · 배정 밖 판정 존재 · SSR &lt; {QUALITY_MIN.ssr}.</li>
              <li><b>주의 사유</b>(공개는 되지만 학생 결과 화면에 「자리의 폭이 넓다」 문구가 표시됨): SSR {QUALITY_MIN.ssr}~{QUALITY_MIN.ssrAdopt} · 반분 중앙값 &lt; {QUALITY_MIN.splitHalf} 또는 미산출 · 「누구 작품인지 알 것 같다」 ≥ 20%.</li>
              <li>같은 자료에 즉석 적응쌍을 덧붙이지 않습니다. 기준에 못 미치면 미완료 학생의 판정을 받은 뒤 다시 집계하고, 그래도 부족하면 파일럿의 분산·결측·판정자 군집과 목표 N_CR을 넣은 모의검정으로 다음 수집의 고정 k를 정해 사전등록합니다(후보: k = 16, SSR 정밀도가 중요하면 21).</li>
              <li>논문의 주 분석은 전원을 포함하고, 표시된 판정자를 뺀 재적합을 민감도 분석으로 보고합니다.</li>
            </ul>
          </Sec>

          {/* ------------------------------------------------ 8 */}
          <Sec id="8" title="보정 지표와 분석 계획" open={isOpen(false)}>
            <p>보정 지표는 Schraw(2009)의 구분을 따릅니다.</p>
            <F>{"bias   = 예측 백분위 − 실제(BT) 백분위      (+면 과대평가. 예측 ①·②마다 bias1·bias2)\n|bias| = 절대 정확도\ncalib  = |bias1| − |bias2|                 (+면 보정됨)   ← 주 결과 변수"}</F>
            <T head={["변수", "계산", "뜻"]} rows={[
              [<M key="1">bias1 · bias2</M>, "predPct − pct", "자기평가 편향(+면 과대평가)"],
              [<M key="2">calib</M>, "|bias1| − |bias2|", "보정량. 이 설계의 주 결과 변수"],
              [<M key="3">selfShift</M>, "5문항 평정의 ①→② 변화", "자기 기준의 이동 방향(overall이 주지표)"],
              [<M key="4">peerScore</M>, "브래들리–테리 θ·pct·band", "동료 판단으로 정해진 작품의 위치"],
              [<M key="5">tagDist</M>, "결정적 축 태그 분포", "학급이 무엇으로 작품을 가르는가"],
              [<M key="6">whyConc</M>, "이유 문장의 구체성(기존 concreteness 재사용)", "판단 근거가 관찰 가능한 말로 쓰였는가"],
              [<M key="7">judgeFit</M>, "infit·역방향률·판정 시간", "평가 기준의 내면화 정도(성적 아님)"],
              [<M key="8">plateOpen · hardRate</M>, "캡션 펼침 비율, 「판단이 어려웠다」 비율", "맥락 참조율, 경험된 복잡성"],
              [<M key="9">uptake</M>, "8차시 성찰의 받은 문장 반영 여부(peerBack)", "받은 문장이 실제 수정으로 이어졌는가"],
              [<M key="10">tagVoice · tagVeri</M>, "(plate + voice 태그 수) / 전체 판정, (veri + cause 태그 수) / 전체 판정", "의미 중심·기법 중심 판정 비율(성향 설문 H6의 결과 변수, 이항 회귀)"],
              [<M key="11">msMed</M>, "판정 처리 시간 중앙값(로그 변환)", "판정 숙고 시간(성향 설문 H5)"],
              [<M key="12">whyAI</M>, "이유 문장에 AI·인공지능·생성·프롬프트가 나온 비율", "판정 근거로 AI를 떠올렸는가"],
            ]} />
            <p className="ad-h">가설과 다중비교 가족</p>
            <p>이 모듈 안의 가설은 둘입니다. <b>H-a</b> calib &gt; 0(양측 검정, 예측 방향은 +). <b>H-b</b> bias1은 θ 하위 삼분위에서 양(+)이고 크다(Kruger &amp; Dunning 1999의 예측. 사전 지정 상호작용 하나). 평가자 성향 설문(s1)의 가설 가운데 이 모듈의 변수를 결과로 쓰는 것: <b>H5</b> 예술 관심·지식(ain·akn)이 높을수록 캡션 펼침률·판정 시간·판정 일관성·이유 문장의 구체성이 높다. <b>H6</b> 미적 개방성·의미 지향(aop·afn)이 높을수록 tagVoice가 높다. <b>H7</b> ain·aop가 높을수록 calib이 크다(탐색적). 다중비교는 가설 묶음 안에서 FDR로 보정합니다: 이 모듈의 H-a·H-b가 한 묶음, 성향 설문의 가설은 그 문서의 묶음(H1~H4 / H5~H8)대로. 학급별 기술 통계와 신뢰도 지표는 검정이 아니므로 보정하지 않습니다.</p>
            <p className="ad-h">분석 계획(요약)</p>
            <ol className="ad-ol">
              <li><b>학급별 기술.</b> SSR, 반분(보정 전·후 중앙값·IQR), 판정 수, 작품당 노출, θ 분산, |z| &gt; 2 판정 비율, infit 분포, 먼저 놓인 쪽 선택률(축별), 반복 일치율, 「판단이 어려웠다」 비율, 캡션 펼침률, 배정 밖 판정 제외 건수. 학급의 문장 동질화 지표(「연구」 탭)를 신뢰도와 나란히 보고합니다. 이미지 동질화 지표는 앱에 없으므로 보고하려면 앱 밖에서 따로 산출합니다. 생성형 AI로 만든 작품은 학급 전체의 다양성이 줄 수 있고 <Ref>Doshi &amp; Hauser 2024; Zhou &amp; Lee 2024</Ref> 진점수 분산이 줄면 판정 품질과 무관하게 SSR이 낮아지기 때문입니다.</li>
              <li><b>타당도.</b> 동료 θ ↔ 교사 루브릭(AI 고지 가린 채) 상관, 기준치 r ≈ .6 <Ref>Li 외 2016; Jones &amp; Alcock 2014; Sanchez 외 2017</Ref>. 단일 교사 평정의 신뢰도가 알려져 있지 않으므로 교사 2인 평정 또는 교사의 부분 쌍대비교를 필수로 둡니다 <Ref>박주용·박정애 2018</Ref>. 창의성 6축과의 상관.</li>
              <li><b>보정.</b> calib을 주 결과로 ANCOVA(학급 더미), 양측. θ 삼분위와의 상호작용은 사전 지정 하나만. 사분위 막대 대신 연속 회귀(선형+이차)와 Glejser 이분산 검정 <Ref>Gignac &amp; Zajenkowski 2020</Ref>. 중등 학생은 과소평가하는 경우도 있어 <Ref>Nederhand 외 2020</Ref> 양측 검정. 기준(BT 백분위) 자체가 신뢰도 .80 안팎의 학급 내 척도이므로 ①→② 변화에는 평균 회귀와 기준 자체의 측정 오차가 섞입니다. 기준 신뢰도를 함께 보고하고 해석을 제한합니다 <Ref>Brown, Andrade &amp; Chen 2015</Ref>. n ≈ 140·학급 5~6개에서는 탐색적입니다.</li>
              <li><b>순서 효과.</b> BradleyTerry2의 order 항 우도비 검정, 축(x/y)별로 <Ref>Davidson &amp; Beaver 1977</Ref>.</li>
              <li><b>민감도.</b> 표시된 판정자 제외 재적합 · fastOverride 제외 · 「누구 작품인지 알 것 같다」 제외.</li>
              <li><b>판정 단위 결과</b>(판정 시간·「판단이 어려웠다」·척도와의 일치)는 판정이 판정자 안에 겹쳐 있으므로 판정자 무작위 절편을 둔 혼합모형으로 분석하고, 학급은 다른 분석과 같이 더미 고정효과로 통제합니다(학급이 5~6개뿐이라 학급 수준 분산은 추정하지 않음). 앵커 쌍의 검정력은 같은 구조(판정자 무작위 절편)의 혼합 로지스틱을 simr로 모의해 산출합니다 <Ref>Green &amp; MacLeod 2016</Ref>(d ≈ 0.24를 잡을 검정력으로 설계).</li>
              <li><b>결측·중도 이탈.</b> 판정 결측은 대체하지 않습니다. 브래들리–테리는 관측된 비교만 쓰므로 미완료 판정자의 유효 판정(valid = 1)도 모두 점수에 넣되, 학급별로 미완료 판정자 수·판정 완료율(본 판정 수 / k)·작품당 노출의 최솟값을 보고합니다. 판정이 0건인 학생은 판정자 표에서 빠지고 작품으로만 남습니다. calib은 ①과 ②의 확정값이 모두 있는 학생만의 완전사례 분석이며, ②의 변화 사유 결측은 제외 사유가 아닙니다. ①·② 가운데 하나라도 없는 학생 수와 그들의 θ 밴드 분포를 함께 보고해 결측이 위치와 관련되는지(하위권 이탈) 확인합니다. 배정표 대조에서 탈락한 판정(valid = 0)은 결측이 아니라 제외 건수로 따로 셉니다. 연구 설계서는 「한 명이라도 본 비교 수를 채우지 못하면 배정 생성 중단」을 요구했으나, 수업 운영에서는 결석이 불가피하므로 배정은 확정하고 결측을 보고하는 쪽을 택했습니다.</li>
              <li><b>검정력.</b> n ≈ 140, α = .05 양측, 검정력 .80에서 탐지 가능한 상관은 r ≈ .24이고, 대응 평균차(H-a)는 d ≈ 0.24(완전사례 120명이면 ≈ 0.26)입니다. 삼원 상호작용은 잡지 못하므로 상호작용은 사전 지정한 것(이 모듈의 θ 삼분위 하나, 성향 설문의 사용량 × 위협감·노력 귀속 × 고지 수준 둘)에 한정합니다. 학급 수준(5~6개)의 효과는 검정력이 없어 학급은 더미로 통제만 합니다. 판정자별 편차(판정 12건에서 나온 β_j 등)는 측정 오차가 크므로 축소 추정값을 쓰고 감쇠 보정은 하지 않으며 한계로 적습니다.</li>
              <li><b>이유 문장·태그 코딩</b>은 코딩 틀·제2 코더·일치도(κ)를 사전 등록합니다 <Ref>Lesterhuis 외 2022; van Daal 외 2019</Ref>.</li>
            </ol>
            <p className="ad-h">사전 등록 항목</p>
            <ul className="ad-ul">
              <li>채택 기준: 전체 자료 SSR ≥ {QUALITY_MIN.ssrAdopt}. 판정자 반분 1,000회 중앙값과 절반 자료의 그래프 단절로 계산되지 않은 비율을 함께 보고.</li>
              <li>무방향 비교그래프의 연결과 승패 방향그래프의 강연결 확인. 판정자 단위 군집 부트스트랩 1,000회로 작품 척도와 효과의 신뢰구간.</li>
              <li>역순 반복의 학급 전체 일치율과 Wilson 95% 구간(개인 제외 기준으로 쓰지 않음).</li>
              <li>주 결과 calib, 사전 지정 상호작용 하나, 민감도 분석 셋, 「누구 작품인지 알 것 같다」 표시율.</li>
              <li>12회에서 기준에 못 미쳐도 같은 자료에 임의의 적응쌍을 즉석 추가하지 않음.</li>
            </ul>
          </Sec>

          {/* ------------------------------------------------ 9 */}
          <Sec id="9" title="CSV 변수 사전: 카드 5의 다섯 파일" open={isOpen(false)}>
            <p>열 이름은 계산 계층의 CSV 머리글을 그대로 읽은 것입니다. 학번 대신 익명 번호 pid(학번 정렬 순 P01…)를 쓰며, 파일 이름은 <M>상호평가_&lt;종류&gt;_&lt;yymmdd&gt;.csv</M>입니다. 셀 앞의 <M>'</M>는 수식 주입을 막는 표시입니다. 현재 동의 대장이 꺼져 있어(CONSENT_ON = false) 다섯 파일에는 학급 전원이 들어갑니다. 논문용 집계에서는 「연구」 탭의 동의 대장을 기준으로 동의하지 않은 학생의 P 번호를 빼고 씁니다.</p>
            <p className="ad-h">제출(작품 단위) · {H.current.submissions.length}열</p>
            <ColTable kind="submissions" head={H.current.submissions} />
            <p className="ad-h">판정(판정 단위) · {H.current.judgements.length}열</p>
            <p>현재 명단의 판정은 배정표 대조를 거친 것(valid = 1)만 점수에 쓰이고, 옛 명단·대조 탈락 항목은 valid = 0으로 함께 내보내 재현할 수 있게 합니다. 숨은 반복은 rep_of가 채워진 행이며 점수 계산에서 빠집니다.</p>
            <ColTable kind="judgements" head={H.current.judgements} />
            <p className="ad-h">자기평가(학생 × 단계) · {H.current.self.length}열</p>
            <ColTable kind="self" head={H.current.self} />
            <p className="ad-h">집계(작품 점수) · {H.current.scores.length}열</p>
            <ColTable kind="scores" head={H.current.scores} />
            <p className="ad-h">판정자(적합도·위치 편향·시간) · {H.current.judges.length}열</p>
            <ColTable kind="judges" head={H.current.judges} />
          </Sec>

          {/* ------------------------------------------------ 10 */}
          <Sec id="10" title="윤리: 익명·동의·정책·디브리핑" open={isOpen(false)}>
            <ul className="ad-ul">
              <li><b>익명성의 한계를 솔직하게.</b> 화면에는 작품 번호만 나오지만 submissions 문서 id가 학번이고 이미지가 media/{"{학번}"}_…에 있으며, 로그인한 학생이 읽을 수 있는 meta/peerRoster의 works에도 작품 번호와 학번의 대응이 들어 있어 개발자 도구를 열면 소유자를 알 수 있습니다. <b>표시상 익명·저장상 준익명</b>이며 완전 익명은 서버에서 소유자를 지운 사본을 만들어야 가능합니다(후속 과제). 피평가자 이름 노출은 국내 K-12 동료평가 점수를 부풀리고 평가자 익명은 별 영향이 없었으며 <Ref>안부영 2014</Ref>, 익명은 더 비판적인 피드백과 안전감을 주고 11학년에게 비계로 작동했습니다 <Ref>Panadero &amp; Alqassab 2019; Rotsaert 외 2018</Ref>. 「누구 작품인지 알 것 같다」 표시율을 사전 등록하고 그 판정을 뺀 민감도 분석을 보고합니다.</li>
              <li><b>동의.</b> 기존 「연구」 탭의 6항목 분리 동의(개인정보 보호법 제22조 제1항)를 그대로 씁니다. 판정·자기평가는 수업 활동이므로 전원이 하되, 논문용 집계에서는 동의하지 않은 학생의 P 번호를 뺍니다. 앱이 내보내는 CSV 다섯 파일에는 학급 전원이 들어가며(§9), 제외는 「연구」 탭의 동의 대장을 기준으로 분석 단계에서 합니다. 동의 대장을 켜면 CSV 단계의 제외와 「연구」 탭과 맞춘 pid 규칙을 구현해야 합니다(미구현). 동의 거부가 수행평가 점수에 영향 없음을 명시합니다. 학급은 무작위 코드(C1~C6)로 가명처리해 제28조의2(과학적 연구 목적 가명정보 처리)로 정당화합니다.</li>
              <li><b>IRB·보호자 동의.</b> 고1·고2는 만 14세 이상이라 개인정보 동의는 본인이 하지만, 라벨 조작(앵커 쌍)과 논문 게재는 연구이므로 미성년자 IRB 심의와 보호자 서면 동의가 필요합니다(생명윤리법 제16조). 앵커 쌍의 라벨 조작은 기만이므로 「가치가 있고 기만 없는 대안이 없으며 가능한 한 빨리 설명한다」는 정당화(APA 윤리강령 8.07)를 명시합니다.</li>
              <li><b>저작권.</b> 학생 이미지·캡션을 논문·발표·공개 전시에 싣는 것은 저작권법 제11조(공표권)·제46조(이용허락)에 따라 별도 항목으로 동의받습니다.</li>
              <li><b>정책.</b> 교육부(2025-12-23)의 수행평가 AI 활용 표기 의무는 기록지(6차시 작품 캡션의 aiScope·aiLevel)·전시장·교사 채점에서 충족됩니다. 비교 화면의 공통 배너는 판정 전에 학급에 공지하는 정책적 고지입니다. 동료 밴드와 자기평가는 수행평가 점수에 반영되지 않음을 화면과 동의서에 명시합니다.</li>
              <li><b>디브리핑.</b> 앵커 쌍이 끝나면 같은 이미지에 다른 고지를 붙였음을 같은 차시에 교사가 직접 밝힙니다 <Ref>향상된 디브리핑: Greenspan &amp; Loftus 2022; 서면 디브리핑은 약함: Miketta &amp; Friese 2019</Ref>.</li>
              <li><b>받은 문장의 검토.</b> 이유 문장은 이름 필터 없이 그대로 학생에게 보이므로 결과 공개 전에 교사가 훑어보는 절차를 운영표에 넣습니다(앱 안의 검토 단계는 아직 없음).</li>
            </ul>
          </Sec>

          {/* ------------------------------------------------ 11 */}
          <Sec id="11" title="한계와 열린 문제" open={isOpen(false)}>
            <ul className="ad-ul">
              <li>청소년이 AI 생성 이미지·허구 캡션을 쌍대비교로 판정한 선행연구가 없습니다. 기대 SSR .80~.85(작품당 {twoK}회)는 계획치이며, .80에 못 미친 학급은 기술 통계 분석으로 돌립니다. 작품당 24회에서 SSR 점추정은 .80 근처에 걸리기 쉬우므로 <Ref>Crompvoets 외 2021</Ref> 시간이 허락하면 k = 15(작품당 30회, 약 24분)를 검토합니다.</li>
              <li>12쌍의 logit 척도는 잡음이 커서 θ 차 ≥ {AGAINST_GAP} 규칙과 AI 감점의 logit 표현이 흔들립니다. 일부 학급에서 2차 12쌍 회기를 검토합니다.</li>
              <li>판정자 적합도 관행({INFIT_BAND[0]}~{INFIT_BAND[1]}, +2SD)은 성인 판정자에서 나온 값입니다. 청소년의 infit 분포는 더 넓을 수 있습니다. {FAST_SEC}초와 {SHORT_WHY}자는 문헌에 검증된 절단값이 없어 표시일 뿐입니다.</li>
              <li>위아래 배치의 위치 효과, 밴드 공개의 정서적 효과 <Ref>과대평가를 깨닫는 정서적 비용: Pinedo 외 2026</Ref>, 확신도 없는 「판단이 어려웠다」 표시의 타당도는 이 자료가 처음 제공합니다. 밴드 대 순위 공개를 학교에서 직접 비교한 연구가 없으므로 결과 화면 문구는 한 학급에서 먼저 시험합니다.</li>
              <li>「협업」 문구·기술적 기준 제시가 AI 감점을 줄이는지는 문헌이 엇갈립니다 <Ref>Horton 외 2023·Heimstad 외 2025 대 Raj 외 2026; Zhang 외 2026 대 Raj 외 2026</Ref>.</li>
              <li>판정자는 곧 경쟁자입니다. 동료 작품을 보는 것만으로 하위권의 과대평가가 저절로 교정되지는 않으므로 <Ref>Kruger &amp; Dunning 1999; Ehrlinger 외 2008</Ref> 교사가 ② 전에 기준 예시 한 쌍을 함께 짚는 것이 운영표에 들어 있습니다 <Ref>Nederhand 외 2019</Ref>.</li>
              <li>반복 쌍은 옆자리 학생이 알아챌 수 있으므로 「숨김」을 기대하지 않고 기술 통계 지표로만 씁니다. 앵커 쌍은 연습 쌍·황금 통제 항목 역할과 겹쳐 맡길 수 없습니다.</li>
              <li>Verhavert 외(2019)·Jones &amp; Davies(2023)·Pollitt(2012)의 원문은 확보하지 못했습니다. 「무작위 쌍에서 17회 → .80」, 「+2SD 규칙」은 2차 문헌 인용입니다. 인용 전에 원문을 봅니다.</li>
              <li>little-c 틀을 K-12에서 조작화한 측정 문헌, 전유·리믹스·파라픽션의 미술교육 문헌, 한국어 DB(RISS·KCI·DBpia) 탐색은 아직 비어 있습니다.</li>
            </ul>
          </Sec>

          {/* ------------------------------------------------ 12 */}
          <Sec id="12" title="핵심 근거 문헌(전체 목록은 쌍대비교_구현_근거.md 참고문헌 절)" open={isOpen(false)}>
            <p>아래는 결정에 직접 쓰인 문헌만 추린 것입니다. 전체 목록(서지 검증 표시, DOI)은 쌍대비교_구현_근거.md 참고문헌 절에 있습니다.</p>
            <p className="ad-h">비교판단·신뢰도</p>
            <ul className="ad-ref-l">
              <li>Thurstone, L. L. (1927). A law of comparative judgment. <i>Psychological Review, 34</i>(4), 273–286.</li>
              <li>Bradley, R. A., &amp; Terry, M. E. (1952). Rank analysis of incomplete block designs: I. The method of paired comparisons. <i>Biometrika, 39</i>(3/4), 324–345.</li>
              <li>Pollitt, A. (2012). The method of Adaptive Comparative Judgement. <i>Assessment in Education, 19</i>(3), 281–300.</li>
              <li>Bramley, T. (2007). Paired comparison methods. In <i>Techniques for monitoring the comparability of examination standards</i> (Ch. 7). QCA.</li>
              <li>Bramley, T. (2015). <i>Investigating the reliability of Adaptive Comparative Judgment</i>. Cambridge Assessment.</li>
              <li>Bramley, T., &amp; Vitello, S. (2019). The effect of adaptivity on the reliability coefficient in adaptive comparative judgement. <i>Assessment in Education, 26</i>(1), 43–58.</li>
              <li>Verhavert, S., De Maeyer, S., Donche, V., &amp; Coertjens, L. (2018). Scale Separation Reliability: What does it mean in the context of comparative judgment? <i>Applied Psychological Measurement, 42</i>(6), 428–445.</li>
              <li>Verhavert, S., Bouwer, R., Donche, V., &amp; De Maeyer, S. (2019). A meta-analysis on the reliability of comparative judgement. <i>Assessment in Education, 26</i>(5), 541–562.</li>
              <li>Kinnear, G., Jones, I., &amp; Davies, B. (2025). Comparative judgement as a research tool: A meta-analysis of application and reliability. <i>Behavior Research Methods, 57</i>, 222.</li>
              <li>Crompvoets, E. A. V., Béguin, A. A., &amp; Sijtsma, K. (2020). Adaptive pairwise comparison for educational measurement. <i>JEBS, 45</i>(3), 316–338. / (2021). On the bias and stability of the results of comparative judgment. <i>Frontiers in Education, 6</i>, 788202.</li>
            </ul>
            <p className="ad-h">추정·적합도·위치</p>
            <ul className="ad-ref-l">
              <li>Hunter, D. R. (2004). MM algorithms for generalized Bradley–Terry models. <i>Annals of Statistics, 32</i>(1), 384–406.</li>
              <li>Ford, L. R., Jr. (1957). Solution of a ranking problem from binary comparisons. <i>American Mathematical Monthly, 64</i>(8), 28–33.</li>
              <li>Caron, F., &amp; Doucet, A. (2012). Efficient Bayesian inference for generalized Bradley–Terry models. <i>JCGS, 21</i>(1), 174–196.</li>
              <li>Hamilton, I., &amp; Tawn, N. (2024). Parameter estimation methods in Comparative Judgement. arXiv:2405.12694.</li>
              <li>Turner, H., &amp; Firth, D. (2012). Bradley–Terry models in R: The BradleyTerry2 package. <i>Journal of Statistical Software, 48</i>(9).</li>
              <li>Simons, G., &amp; Yao, Y.-C. (1999). Asymptotics when the number of parameters tends to infinity in the Bradley–Terry model. <i>Annals of Statistics, 27</i>(3), 1041–1060.</li>
              <li>Wu, W., Junker, B., &amp; Niezink, N. (2022). Asymptotic comparison of identifying constraints for Bradley–Terry models. arXiv:2205.04341.</li>
              <li>Wu, W., Niezink, N., &amp; Junker, B. (2022). A diagnostic framework for the Bradley–Terry model. <i>JRSS-A, 185</i>(S2), S461–S484.</li>
              <li>Andrich, D. (1978). Relationships between the Thurstone and Rasch approaches to item scaling. <i>Applied Psychological Measurement, 2</i>(3), 451–462.</li>
              <li>Linacre, J. M. (2002). What do infit and outfit, mean-square and standardized mean? <i>Rasch Measurement Transactions, 16</i>(2), 878.</li>
              <li>Davidson, R. R., &amp; Beaver, R. J. (1977). On extending the Bradley–Terry model to incorporate within-pair order effects. <i>Biometrics, 33</i>(4), 693–702.</li>
              <li>Kendall, M. G., &amp; Babington Smith, B. (1940). On the method of paired comparisons. <i>Biometrika, 31</i>(3–4), 324–345.</li>
              <li>Mantiuk, R. K., Tomaszewska, A., &amp; Mantiuk, R. (2012). Comparison of four subjective methods for image quality assessment. <i>Computer Graphics Forum, 31</i>(8), 2478–2491.</li>
              <li>Bar-Hillel, M. (2015). Position effects in choice from simultaneous displays. <i>Perspectives on Psychological Science, 10</i>(4), 419–433.</li>
              <li>van Daal, T., Lesterhuis, M., Coertjens, L., van de Kamp, M.-T., Donche, V., &amp; De Maeyer, S. (2017). The complexity of assessing student work using comparative judgment. <i>Frontiers in Education, 2</i>, 44.</li>
              <li>van Daal, T., Lesterhuis, M., Coertjens, L., Donche, V., &amp; De Maeyer, S. (2019). Validity of comparative judgement to assess academic writing. <i>Assessment in Education, 26</i>(1), 59–74.</li>
              <li>Lesterhuis, M., Bouwer, R., van Daal, T., Donche, V., &amp; De Maeyer, S. (2022). Validity of comparative judgment scores. <i>Frontiers in Education, 7</i>, 823895.</li>
              <li>Green, P., &amp; MacLeod, C. J. (2016). SIMR: an R package for power analysis of generalized linear mixed models by simulation. <i>Methods in Ecology and Evolution, 7</i>(4), 493–498.</li>
              <li>Leech, T., &amp; Chambers, L. (2022). How do judges in Comparative Judgement exercises make their judgements? <i>Research Matters, 33</i>, 31–47.</li>
            </ul>
            <p className="ad-h">동료·자기평가·피드백</p>
            <ul className="ad-ref-l">
              <li>Jones, I., &amp; Alcock, L. (2014). Peer assessment without assessment criteria. <i>Studies in Higher Education, 39</i>(10), 1774–1787.</li>
              <li>Jones, I., &amp; Wheadon, C. (2015). Peer assessment using comparative and absolute judgement. <i>Studies in Educational Evaluation, 47</i>, 93–101.</li>
              <li>Bartholomew, S. R., Strimel, G. J., &amp; Yoshikawa, E. (2019). Using adaptive comparative judgment for student formative feedback and learning during a middle school design project. <i>IJTDE, 29</i>(2), 363–385.</li>
              <li>Nicol, D. (2021). The power of internal feedback: exploiting natural comparison processes. <i>AEHE, 46</i>(5), 756–778.</li>
              <li>Schraw, G. (2009). A conceptual analysis of five measures of metacognitive monitoring. <i>Metacognition and Learning, 4</i>(1), 33–45.</li>
              <li>Gignac, G. E., &amp; Zajenkowski, M. (2020). The Dunning–Kruger effect is (mostly) a statistical artefact. <i>Intelligence, 80</i>, 101449.</li>
              <li>Kruger, J., &amp; Dunning, D. (1999). Unskilled and unaware of it. <i>JPSP, 77</i>(6), 1121–1134.</li>
              <li>Nederhand, M. L., Tabbers, H. K., &amp; Rikers, R. M. J. P. (2019). Learning to calibrate. <i>Applied Cognitive Psychology, 33</i>(6), 1068–1079. / Nederhand 외 (2020). Reflection on exam grades to improve calibration of secondary school students. <i>Metacognition and Learning, 15</i>, 291–317.</li>
              <li>Brown, G. T. L., Andrade, H. L., &amp; Chen, F. (2015). Accuracy in student self-assessment: Directions and cautions for research. <i>Assessment in Education, 22</i>(4), 444–457.</li>
              <li>Hattie, J., &amp; Timperley, H. (2007). The power of feedback. <i>Review of Educational Research, 77</i>(1), 81–112.</li>
              <li>Kluger, A. N., &amp; DeNisi, A. (1996). The effects of feedback interventions on performance. <i>Psychological Bulletin, 119</i>(2), 254–284.</li>
              <li>Butler, R. (1988). Enhancing and undermining intrinsic motivation. <i>British Journal of Educational Psychology, 58</i>(1), 1–14.</li>
              <li>Goulas, S., &amp; Megalokonomou, R. (2021). Knowing who you actually are: The effect of feedback on short- and longer-term outcomes. <i>JEBO, 183</i>, 589–615.</li>
              <li>Fang, J., 외 (2018). The Big-Fish-Little-Pond Effect on academic self-concept: A meta-analysis. <i>Frontiers in Psychology, 9</i>, 1569.</li>
              <li>Li, H., 외 (2016). Peer assessment in the digital age: a meta-analysis comparing peer and teacher ratings. <i>AEHE, 41</i>(2), 245–264.</li>
              <li>Sanchez, C. E., 외 (2017). Self-grading and peer-grading for formative and summative assessments in 3rd through 12th grade classrooms: A meta-analysis. <i>Journal of Educational Psychology, 109</i>(8), 1049–1066.</li>
              <li>Panadero, E., &amp; Alqassab, M. (2019). An empirical review of anonymity effects in peer assessment. <i>AEHE, 44</i>(8), 1253–1278.</li>
              <li>Pinedo, L., 외 (2026). The affective cost of miscalibration. <i>European Journal of Psychology of Education, 41</i>, 67.</li>
            </ul>
            <p className="ad-h">AI 고지·평가 편향</p>
            <ul className="ad-ref-l">
              <li>Bellaiche, L., 외 (2023). Humans versus AI: whether and why we prefer human-created compared to AI-created artwork. <i>Cognitive Research: Principles and Implications, 8</i>, 42.</li>
              <li>Horton, C. B., Jr., White, M. W., &amp; Iyengar, S. S. (2023). Bias against AI art can enhance perceptions of human creativity. <i>Scientific Reports, 13</i>, 19001.</li>
              <li>Jacobs, O., 외 (2025). Comparative designs reveal preferences for human-generated rather than AI-generated art. <i>Empirical Studies of the Arts</i>.</li>
              <li>Magni, F., Park, J., &amp; Chao, M. M. (2023). Humans as creativity gatekeepers: Are we biased against AI creativity? <i>Journal of Business and Psychology</i>.</li>
              <li>Raj, M., Berg, J. M., &amp; Seamans, R. (2026). The artificial intelligence disclosure penalty. <i>JEP: General, 155</i>(4), 896–915.</li>
              <li>Schilke, O., &amp; Reimann, M. (2025). The transparency dilemma: How AI disclosure erodes trust. <i>OBHDP, 188</i>, 104405.</li>
              <li>Doshi, A. R., &amp; Hauser, O. P. (2024). Generative AI enhances individual creativity but reduces the collective diversity of novel content. <i>Science Advances, 10</i>(28).</li>
              <li>Zhou, E., &amp; Lee, D. (2024). Generative artificial intelligence, human creativity, and art. <i>PNAS Nexus, 3</i>(3), pgae052.</li>
            </ul>
            <p className="ad-h">이론틀·국내·정책</p>
            <ul className="ad-ref-l">
              <li>Kaufman, J. C., &amp; Beghetto, R. A. (2009). Beyond big and little: The Four C model of creativity. <i>Review of General Psychology, 13</i>(1), 1–12.</li>
              <li>Amabile, T. M. (1982). Social psychology of creativity: A consensual assessment technique. <i>JPSP, 43</i>(5), 997–1013.</li>
              <li>안부영 (2014). 평가자와 피평가자의 친밀 정도가 쓰기의 동료 평가 신뢰성에 미치는 영향 분석. <i>청람어문교육, 52</i>, 143–163.</li>
              <li>박주용, 박정애 (2018). 동료평가의 현황과 전망. <i>인지과학, 29</i>(2), 85–104.</li>
              <li>홍소영 (2018). 학생 자기평가의 학습효과에 관한 메타분석. <i>교육평가연구, 31</i>(1), 309–331.</li>
              <li>교육부·시도교육청 (2025-12-23). 수행평가 시 인공지능(AI) 활용 관리 방안(보도자료).</li>
              <li>개인정보 보호법 제22조·제28조의2~7 · 생명윤리 및 안전에 관한 법률 제16조 · 저작권법 제11조·제46조 · APA 윤리강령 8.07.</li>
            </ul>
          </Sec>

        </div>
      </div>
    </div>
  );
}

/* ---------- 스타일 ---------- */

const ASSESS_DESIGN_CSS = `
.ad-card .reading{margin-bottom:8px}
.ad-card .reading summary{font-size:13.5px}
.ad-in{font-size:13px;line-height:1.75;word-break:keep-all}
.ad-in p{margin:0 0 10px}
.ad-h{font-family:var(--serif);font-weight:700;font-size:13px;margin:14px 0 6px!important;padding-top:8px;border-top:1px dashed var(--line2)}
.ad-ol,.ad-ul{margin:0 0 10px 20px;padding:0}
.ad-ol li,.ad-ul li{margin:0 0 5px}
.ad-f{font-family:var(--mono);font-size:12px;line-height:1.6;background:var(--card2);border:1px solid var(--line2);padding:8px 10px;margin:0 0 10px;white-space:pre-wrap;word-break:keep-all;overflow-x:auto}
.ad-ref{color:var(--sub);font-size:12px}
.ad-scroll{margin:0 0 12px}
.ad-t{width:100%;border-collapse:collapse;font-size:12.5px;background:var(--card);min-width:520px}
.ad-t th,.ad-t td{border:1px solid var(--line2);padding:5px 8px;vertical-align:top;text-align:left;line-height:1.55}
.ad-t th{background:var(--card2);font-weight:600;white-space:nowrap}
.ad-t td:first-child{white-space:nowrap}
.ad-miss{color:var(--seal)}
.ad-ref-l{margin:0 0 8px 18px;padding:0;font-size:12px;line-height:1.6;color:var(--sub)}
.ad-ref-l li{margin:0 0 3px}
@media(max-width:640px){
  .ad-t{min-width:420px}
  .ad-t td:first-child{white-space:normal}
}
`;
