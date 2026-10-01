/* ============================================================
   교사 「학습 지원」 탭 카드 5: 설계 근거 (2026-09-29)
   전문은 다양한_학습자_지원_설계.md. 이 카드는 수업 중에 교사가 볼 요약이다.
   변수 사전·언어 목록·사용 종류는 src-access-core.mjs에서 읽어 코드와 어긋나지 않게 한다.
   ============================================================ */
import React from "react";
import { SUPPORT_CODEBOOK, ACCESS_LANGS, USE_KINDS, DEFAULT_ACCESS_CFG } from "./src-access-core.mjs";

function Sec({ title, children, open }) {
  return (
    <details className="reading axd-sec" open={open || undefined}>
      <summary>{title}</summary>
      <div className="reading-in">{children}</div>
    </details>
  );
}

function T({ head, rows }) {
  return (
    <div className="tbl-scroll"><table className="roster axd-t">
      <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
    </table></div>
  );
}

const UDL_ROWS = [
  ["1.1 정보 표시를 바꿀 기회", "글자 크기 100~200%, 간격, 고대비·어두운 화면, 움직임 줄이기, 버튼 크게, 링크 밑줄"],
  ["1.2 여러 방식으로 지각", "도판 작품 설명 149장, 읽어 주기, 실시간 자막, 녹음·영상 글 기록"],
  ["2.1 어휘·기호·언어 구조", "차시별 핵심 용어 14개(모두 112개), 쉬운 말 요약 65편"],
  ["2.3 언어 사이의 이해와 존중", "도움 언어 이중 표기, 내 언어 메모, 원문을 지우지 않는 번역"],
  ["3.1 선행 지식 잇기", "핵심 용어 미리 보기(사전 훈련), 쉬운 말 요약(선행 조직자)"],
  ["4.1·4.2 응답 방법·보조공학", "말로 입력, 스크린리더 이름표 잇기, 탭 화살표 이동, 페이지 번역 보호"],
  ["5.1·5.4 여러 매체, 표현 방식의 편향", "녹음·영상에 글 기록, 관찰 방법의 다른 감각 경로"],
  ["7.1 선택과 자율", "학생이 스스로 켜고 끄는 설정, 네 가지 시작 묶음, 교사는 추천만"],
  ["7.4 편향·위협 다루기", "장애 이름이 아닌 기능 이름, 누가 쓰는지 학급에 드러내지 않음"],
];

const EVIDENCE = [
  ["핵심 용어를 수업 전에", "사전 훈련 원리 d = 0.78(Mayer 2021), 시험 편의 가운데 용어 풀이가 가장 지지됨(Kieffer et al. 2009; Pennock-Román & Rivera 2011)"],
  ["쉬운 말은 바꾸지 않고 풀어 쓴다", "정교화한 글은 단순화한 글만큼 이해되고 학문 용어를 지킨다(Yano, Long & Ross 1994; 한국 고등학생 Oh 2001)"],
  ["글은 늘 보이고 읽어 주기는 덧붙인다", "학습자가 속도를 정하면 중복의 해가 사라진다(Ginns 2005). 제2언어 학습자에게는 글이 소리보다 낫다(Lee & Mayer 2018)"],
  ["읽어 주기", "읽기장애 학생 독해 g = 0.35(Wood et al. 2018). 시험 읽어 주기는 장애 학생에게 더 크게 돕는다(Li 2014; Buzick & Stone 2014)"],
  ["자막", "모두에게 이롭다(Gernsbacher 2015). 제2언어 어휘 g = 0.87(Montero Perez et al. 2013). 자동 자막은 문자통역·수어통역을 대신하지 못한다"],
  ["작품 설명", "설명과 해석을 나누고 설명을 먼저(Art Beyond Sight). 짧은 대체 글 + 층을 이룬 긴 설명(쿠퍼 휴잇 지침; Doore et al. 2024)"],
  ["모어의 자리", "개념은 언어를 넘어 옮겨 간다(Cummins 1979, 1980). 트랜스랭귀징(García & Li Wei 2014)은 질적 근거가 대부분"],
  ["선택권과 기본값", "선택은 동기를 높이나 학습 향상은 뚜렷하지 않다(Patall et al. 2008). 학습자는 선택형 도움을 잘 쓰지 않는다(Aleven et al. 2003): 가벼운 지원은 기본으로 보이고 교사가 추천한다"],
  ["UDL에 대한 비판", "정의가 느슨하고(Edyburn 2010) 근거 연구가 선택권·학습을 측정하지 않았다(Boysen 2024). 틀로만 쓰고 기능마다 근거를 따로 대며 사용을 직접 측정한다. 통제 비교 메타분석 g = 0.43(King-Sears et al. 2023)"],
];

export function AccessDesignCard() {
  return (
    <div className="card">
      <div className="card-head"><span className="card-code">학습 지원 5</span><span className="card-title">설계 근거</span><span className="card-sess">교사용</span></div>
      <div className="card-note">전문: 저장소의 다양한_학습자_지원_설계.md (참고문헌·한계·연구 설계 포함)</div>
      <div className="card-body">
        <Sec title="1. 원칙 네 가지" open>
          <ul className="axd-l">
            <li><b>모두에게 열린 지원, 학생이 고른다.</b> UDL 3.0(CAST 2024)의 목표인 학습자 주도성을 따른다. 교사는 추천만 하고 적용은 학생이 정한다.</li>
            <li><b>진단이 아니라 지원을 저장한다.</b> 장애 여부·출신 국적(개인정보 보호법 제23조와 시행령 제18조의 민감정보)은 묻지도 저장하지도 않는다. 학생이 켠 기능과 사용 횟수만 본인·교사가 읽는 기록지에 둔다.</li>
            <li><b>한국어 원문은 늘 화면에 둔다.</b> 번역·쉬운 말·자막 번역은 원문 아래에 덧붙는다.</li>
            <li><b>기본은 가볍게, 무거운 지원은 한 번 누르면.</b> 핵심 용어 상자와 용어 버튼은 기본으로 보이고, 쉬운 말 요약·읽어 주기·번역은 학생이 켠다.</li>
          </ul>
        </Sec>
        <Sec title="2. UDL 3.0 고려 사항과 기능">
          <T head={["고려 사항", "기능"]} rows={UDL_ROWS} />
        </Sec>
        <Sec title="3. 기능별 근거">
          <T head={["설계 결정", "근거"]} rows={EVIDENCE} />
        </Sec>
        <Sec title="4. 도움 언어">
          <p>
            2025년 다문화 학생 202,208명(전체의 4.0%, 고등학생이 가장 빠르게 늘어남). 부모 출신국은 베트남·중국·필리핀·중앙아시아·일본·러시아 순.
            미리 넣은 번역(화면 문구·입장 안내·핵심 용어)이 있는 언어: {ACCESS_LANGS.filter((l) => l.dict).map((l) => l.ko).join(", ")}.
            기기 안 번역만 되는 언어: {ACCESS_LANGS.filter((l) => !l.dict).map((l) => l.ko).join(", ")}(크롬 목록에 몽골어·우즈베크어·크메르어·필리핀어는 없다).
            번역은 초안이므로 이중언어강사의 검토를 권한다.
          </p>
        </Sec>
        <Sec title="5. 평가에서의 편의">
          <ul className="axd-l">
            <li>편의는 제시·응답·환경·시간을 바꾸되 학습 기대는 그대로 두고, 수정은 기대를 낮춘다(보기 절반 지우기 등). 수정한 응답은 표준 점수와 따로 기록한다(Thompson et al. 2005).</li>
            <li>쪽지시험 중에는 보기 설정과 자막만 적용된다. 시간 배수·이미지 제외는 「쪽지시험」 탭에서 학생별로.</li>
            <li>시험 안의 읽어 주기는 기기 안 목소리로만(온라인 목소리는 문항 글을 밖으로 보낸다). 외부 보조공학이 창 초점을 가져가면 이탈 경고가 잘못 뜰 수 있다.</li>
            <li>상호평가: 제출물마다 학생이 쓰는 작품 설명과, 판정마다 「설명으로 판정」 표시를 두는 방안은 8차시 전 상호평가 담당 작업에서 정한다.</li>
          </ul>
        </Sec>
        <Sec title="6. 연구 자료">
          <p>
            「연구」 탭의 「학습 지원 사용 자료」: 참여자 1명이 1행. 동의 항목 「학습 지원 사용」에 동의한 학생만. 도움 언어(pref_lang)는 출신을 짐작하게 할 수 있어 5명 미만 칸은 보고하지 않는다.
            사용 종류: {USE_KINDS.map((u) => u.label).join(", ")}. 2026-09-29부터 읽어 주기로 듣는 시간이 「살펴본 시간」에 들어간다.
          </p>
          <T head={["열", "내용"]} rows={SUPPORT_CODEBOOK} />
        </Sec>
        <Sec title="7. 학급 설정의 기본값">
          <T head={["설정", "기본값"]} rows={[
            ["기기 안 번역", DEFAULT_ACCESS_CFG.translate ? "켬" : "끔"],
            ["쉬운 말 요약", DEFAULT_ACCESS_CFG.easy ? "켬" : "끔"],
            ["핵심 용어", DEFAULT_ACCESS_CFG.gloss ? "켬" : "끔"],
            ["다른 감각 관찰", DEFAULT_ACCESS_CFG.alt ? "켬" : "끔"],
            ["말로 입력", (DEFAULT_ACCESS_CFG.dictation ? "켬" : "끔") + " (음성이 밖으로 나갈 수 있어 교사가 켠다)"],
          ]} />
        </Sec>
        <Sec title="8. 한계">
          <ul className="axd-l">
            <li>자동 자막은 고유명사·미술 용어를 자주 틀린다. 문자통역·수어통역을 대신하지 못한다.</li>
            <li>기기 안 번역은 크롬 138·엣지 148 이상 데스크톱에서만. 폰·태블릿에서는 미리 넣은 용어 번역만 보인다.</li>
            <li>번역·쉬운 말 요약·작품 설명은 모델이 만든 초안을 다른 검토자(모델)가 대조해 고친 것이다. 사람 검토가 남아 있다.</li>
            <li>강의 노트를 크게 고치면 맞지 않는 쉬운 말 요약은 숨겨진다. 다시 만들 목록: node scripts/access-check.mjs</li>
          </ul>
        </Sec>
      </div>
      <style>{`
.axd-sec{margin-bottom:8px}
.axd-t td{font-size:12.5px;vertical-align:top;line-height:1.6}
.axd-t td:first-child{white-space:nowrap;font-weight:700}
.axd-l{margin:0 0 0 18px;padding:0;line-height:1.8;font-size:13.5px}
`}</style>
    </div>
  );
}
