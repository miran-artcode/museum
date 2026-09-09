import React, { useState } from "react";

/* ============================================================
   작품 캡션(명제표) 두 장 비교 자료 — 2차시 탐구 질문 안에 붙는 예시
   2차시 도입 활동(같은 사진에 캡션만 바꿔 다는 실험)을 학생 화면에서
   다시 볼 수 있게 만든 카드. 수업에 결석했거나 도입을 놓친 학생이
   "두 장 비교가 뭐냐"고 묻지 않도록, 질문 바로 위에 자료를 둔다.
   사진은 예시 작품 A와 같은 도판(public/img/examples/ex-a.jpg)을 쓴다.
   ============================================================ */

/* 다섯 줄은 탐구 질문의 보기(제목·연대·재질·용도·출처)와 순서를 맞춘다 */
const ROWS = [
  {
    k: "제목",
    a: "금속 파이프 파편",
    b: "오른손",
  },
  {
    k: "연대",
    a: "연대 미상",
    b: "2020년대 전반 (2300년 발굴)",
  },
  {
    k: "재질",
    a: "금속",
    b: "강철 파이프, 합성고무 그립, 직물 테이프",
  },
  {
    k: "용도",
    a: "용도 미상",
    b: "한 손으로 기울여 끌던 운반 수레의 손잡이",
  },
  {
    k: "출처",
    a: "수습 경위 기록 없음",
    b: "물류 창고 하역장 자리 지층에서 수습. 같은 형태가 여러 점 나왔고 모두 오른쪽만 닳아 있음",
  },
];

const READ_A = "낡은 쇠 토막 하나. 어디가 닳았는지는 굳이 들여다보지 않게 된다.";
const READ_B = "오른쪽 그립이 벗겨진 자리가 먼저 눈에 들어온다. 그 자리를 한 손으로 오래 쥐고 끌던 사람이 떠오른다.";

/* 도판이 없을 때를 대비한 임시 그림 — 사진이 빠져도 자료가 성립하게 한다 */
const FallbackImg = () => (
  <svg viewBox="0 0 1024 559" role="img" aria-label="한쪽 그립이 벗겨진 금속 파이프 손잡이 파편 (임시 도판)">
    <rect width="1024" height="559" fill="#EFEDE6" />
    <rect x="150" y="255" width="724" height="52" rx="26" fill="#8C8B82" />
    <rect x="150" y="255" width="230" height="52" rx="26" fill="#3A3A34" />
    <rect x="640" y="255" width="234" height="52" rx="26" fill="#3A3A34" />
    <rect x="640" y="255" width="120" height="52" rx="26" fill="#9A6B4F" />
    <text x="512" y="380" textAnchor="middle" fontSize="22" fill="#6E6C62" fontFamily="sans-serif">
      도판을 불러오지 못했습니다 — 한쪽 그립만 벗겨진 파이프 손잡이 파편
    </text>
  </svg>
);

function CompareImg() {
  const [missing, setMissing] = useState(false);
  if (missing) return <FallbackImg />;
  return (
    <img
      src="/img/examples/ex-a.jpg"
      alt="한쪽 그립만 벗겨진 금속 파이프 손잡이 파편의 기록 사진. 아래 두 캡션이 가리키는 대상은 이 사진 한 장이다."
      onError={() => setMissing(true)}
    />
  );
}

/* full — 탐구 질문(개념)용. compact — 기록 A의 한 줄 쓰기 칸용 */
export function LabelCompare({ compact }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="lcmp">
      <style>{`
.lcmp{border:1px solid var(--line);border-top:3px solid var(--seal);background:var(--card);margin:10px 0 12px}
.lcmp-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;padding:11px 13px 0}
.lcmp-acc{font-family:var(--mono);font-size:10.5px;letter-spacing:.2em;color:var(--seal)}
.lcmp-head h4{font-family:var(--serif);font-size:14.5px;font-weight:700;margin:0}
.lcmp-fold{margin-left:auto;border:1px solid var(--line);background:var(--card2);color:var(--sub);font-family:var(--sans);font-size:11.5px;padding:3px 9px;cursor:pointer}
.lcmp-lead{padding:7px 13px 0;font-size:12.5px;color:var(--sub);line-height:1.65}
.lcmp-body{padding:11px 13px 13px}
.lcmp-img{border:1px solid var(--line2);background:var(--card2);aspect-ratio:1024/559;overflow:hidden;display:flex;align-items:center;justify-content:center}
.lcmp-img img,.lcmp-img svg{width:100%;height:100%;object-fit:cover;display:block}
.lcmp-cap{font-family:var(--mono);font-size:11px;color:var(--sub);margin:5px 0 12px;text-align:center}
.lcmp-tbl{width:100%;border-collapse:collapse;font-size:12.5px;line-height:1.55}
.lcmp-tbl th,.lcmp-tbl td{border:1px solid var(--line2);padding:6px 8px;vertical-align:top;text-align:left}
.lcmp-tbl thead th{background:var(--card2);font-family:var(--mono);font-size:11px;letter-spacing:.06em;font-weight:400;color:var(--sub)}
.lcmp-tbl thead th.a{color:var(--ink)}
.lcmp-tbl thead th.b{color:var(--seal)}
.lcmp-tbl td.k{width:64px;white-space:nowrap;background:var(--card2);font-family:var(--mono);font-size:11.5px;color:var(--sub)}
.lcmp-reads{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:11px}
.lcmp-read{border:1px solid var(--line2);background:var(--card2);padding:8px 10px;font-size:12.5px;line-height:1.6}
.lcmp-read b{display:block;font-family:var(--mono);font-size:10.5px;letter-spacing:.08em;color:var(--sub);margin-bottom:3px;font-weight:400}
.lcmp-read.b{border-color:var(--seal);background:var(--seal-bg)}
.lcmp-read.b b{color:var(--seal)}
.lcmp-how{margin-top:11px;border-top:1px dashed var(--line);padding-top:9px;font-size:12.5px;line-height:1.7;color:var(--sub)}
.lcmp-how b{color:var(--ink)}
.lcmp-how ol{margin:5px 0 0;padding-left:18px}
.lcmp-how li{margin-bottom:3px}
.lcmp-demo{margin-top:7px;border-left:2px solid var(--amber);padding:2px 0 2px 9px;color:var(--amber);font-size:12px;line-height:1.65}
@media(max-width:640px){
  .lcmp-reads{grid-template-columns:1fr}
  .lcmp-tbl,.lcmp-tbl thead,.lcmp-tbl tbody,.lcmp-tbl tr,.lcmp-tbl th,.lcmp-tbl td{display:block}
  .lcmp-tbl thead{display:none}
  .lcmp-tbl tr{margin-bottom:9px;border:1px solid var(--line2)}
  .lcmp-tbl td{border:none;border-top:1px solid var(--line2)}
  .lcmp-tbl td.k{width:auto}
  .lcmp-tbl td.a:before{content:"캡션 A — ";font-family:var(--mono);font-size:11px;color:var(--sub)}
  .lcmp-tbl td.b:before{content:"캡션 B — ";font-family:var(--mono);font-size:11px;color:var(--seal)}
}
      `}</style>
      <div className="lcmp-head">
        <span className="lcmp-acc">LABEL A / LABEL B</span>
        <h4>자료 — 작품 캡션(명제표) 두 장 비교</h4>
        <button type="button" className="lcmp-fold" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "접기" : "펼치기"}
        </button>
      </div>
      <div className="lcmp-lead">
        작품 캡션(명제표)은 전시장에서 작품 옆 벽에 붙는 작은 설명 카드입니다.
        아래 사진은 <b>한 장뿐</b>입니다. 사진은 그대로 두고 옆에 붙인 캡션만 A에서 B로 바꿔 달았습니다.
        {compact ? " 2차시 도입에서 함께 본 자료입니다." : ""}
      </div>
      {open && (
        <div className="lcmp-body">
          <div className="lcmp-img"><CompareImg /></div>
          <div className="lcmp-cap">사진은 한 장 — 픽셀은 하나도 바뀌지 않았습니다</div>
          <table className="lcmp-tbl">
            <thead>
              <tr><th /><th className="a">캡션 A</th><th className="b">캡션 B</th></tr>
            </thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.k}>
                  <td className="k">{r.k}</td>
                  <td className="a">{r.a}</td>
                  <td className="b">{r.b}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="lcmp-reads">
            <div className="lcmp-read">
              <b>캡션 A를 읽고 본 사람</b>
              {READ_A}
            </div>
            <div className="lcmp-read b">
              <b>캡션 B를 읽고 본 사람</b>
              {READ_B}
            </div>
          </div>
          {!compact && (
            <div className="lcmp-how">
              <b>이 자료를 보는 법</b>
              <ol>
                <li>다섯 줄(제목 · 연대 · 재질 · 용도 · 출처)을 A와 B로 한 줄씩 나란히 읽습니다.</li>
                <li>한 줄씩 손으로 가려 봅니다. 그 줄이 없었다면 내 읽기가 얼마나 되돌아가는지 봅니다.</li>
                <li>가렸을 때 읽기가 가장 많이 무너지는 줄, 그 한 줄이 답의 후보입니다.</li>
              </ol>
              <div className="lcmp-demo">
                답의 모양은 이렇습니다 — “<b>재질</b>이 ‘금속’에서 ‘강철 파이프, 합성고무 그립, 직물 테이프’로 나뉘자,
                감아 놓은 테이프가 장식이 아니라 <b>고쳐 쓴 흔적</b>으로 보였다.”
                이것은 형식을 보여 주는 예일 뿐이니 그대로 쓰지 말고, 다섯 줄을 직접 가려 보고 내 눈이 가장 크게 움직인 줄을 고르세요.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
