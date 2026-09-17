import React, { useState } from "react";

/* ============================================================
   자료집 예시 작품 A·B·C — 전시장에 예시로 거는 읽기 전용 벽면
   출처: 과정안 2 부록 「예시 작품 자료집」 (가상의 사례, 실제 학생 작품 아님)
   이미지: public/img/examples/ex-a.jpg · ex-b.jpg · ex-c.jpg 파일을 두면
   그 도판을 우선 사용하고, 없으면 아래 SVG 임시 도판으로 대체한다.
   벽면 맨 위의 전시 진열 예시 사진은 exhibit-wall.jpg (과정안 부록 6 A-④ 전시 진열 컷,
   ver05 원고에서 추출, 440×250).
   ============================================================ */

export const EXHIBIT_SAMPLES = [
  {
    id: "ex-a",
    no: "예시 A",
    title: "오른손",
    relic: "합성고무 그립 마모 손수레 손잡이 파편",
    year: "2300년",
    era: "2020년대 전반",
    mat: "강철 파이프, 합성고무 그립, 직물 테이프",
    size: "길이 24cm, 지름 3.2cm",
    context:
      "물류 창고 하역장 터로 추정되는 지층에서 파이프가 절단된 상태로 수습되었다. 함께 나온 파편 가운데 오른쪽 그립만 고무가 벗겨져 금속이 드러나 있고, 왼쪽 그립은 표면이 온전하다. 벗겨진 부분에는 직물 테이프를 여러 겹 감아 수리한 흔적이 남아 있으며, 테이프 아래 금속면은 손의 압력이 닿는 폭만큼 광택이 났다. 같은 형태의 도구가 다수 발굴되었으나 모두 오른쪽에만 마모가 집중되어 있다.",
    coll: "○○고등학교 2학년 ○반 가상 컬렉션 / 작가 ○○○",
    aiScope: "이미지 생성 및 부분 수정, 화면 편집. 작품 캡션 문구와 작가 노트는 학생이 작성함.",
    notice: "이 이미지는 생성형 AI로 제작한, 실재한 적 없는 유물입니다.",
    problem: "새벽 배송 노동",
    attitude: "기록",
    display: "단독 진열",
    note:
      "우리 집 문 앞에는 매일 새벽 상자가 놓인다. 나는 그것을 놓고 가는 사람을 한 번도 본 적이 없다. 얼굴을 모르는 사람의 노동이 매일 우리 집 현관에 도착한다는 사실이 이상하게 느껴졌다.\n그 사람을 그리려다 그만두었다. 본 적이 없는 얼굴을 상상해서 그리면 내가 만드는 것은 내 짐작이 된다. 대신 그 사람이 쥐었을 물건을 만들기로 했다. 배송 기사들이 쓰는 손수레 영상과 사진을 찾아보니 손잡이가 한쪽만 심하게 닳아 있는 경우가 많았다. 무거운 짐을 실은 손수레를 한 손으로 기울여 끌기 때문이라고 한다.\n그래서 오른쪽만 닳게 만들었다. 벗겨진 고무 아래 금속이 드러나고, 그 위에 테이프를 감아 계속 쓰다가, 테이프도 닳아 다시 금속이 보이는 부분까지 화면에 넣었다. 이 물건을 300년 뒤에 발굴한 사람은 이 시대에 한 손으로 무언가를 오래 끌던 사람들이 있었다는 것을 알게 될 것이다. 나는 그 사람을 지금도 보지 못한다.",
  },
  {
    id: "ex-b",
    no: "예시 B",
    title: "수위선 1.2m",
    relic: "도장 합판 수평 물때 교실 사물함 문짝",
    year: "2300년",
    era: "2020년대 후반",
    mat: "도장 합판, 알루미늄 손잡이, 종이 스티커 잔편",
    size: "가로 30cm, 세로 45cm, 두께 1.5cm",
    context:
      "학교 건물로 추정되는 구조물의 1층 바닥면에서 다수의 문짝이 겹쳐 쌓인 채 발견되었다. 문짝마다 아랫면에서 같은 높이에 갈색 띠가 수평으로 남아 있고, 띠 아래쪽은 도장이 부풀어 벗겨진 반면 위쪽은 비교적 온전하다. 여러 문짝의 띠 높이가 일치하며, 바닥에서 띠까지의 높이는 약 1.2m다. 문짝 상단에 붙어 있던 이름표 스티커는 대부분 삭아 없어졌고 일부만 종잇조각으로 남았다.",
    coll: "○○고등학교 2학년 ○반 가상 컬렉션 / 작가 ○○○",
    aiScope: "이미지 생성 및 부분 수정, 화면 편집. 작품 캡션 문구와 작가 노트는 학생이 작성함.",
    notice: "이 이미지는 생성형 AI로 제작한, 실재한 적 없는 유물입니다.",
    problem: "기후 재난",
    attitude: "경고",
    display: "계열 진열",
    note:
      "작년 여름에 우리 동네 지하 상가가 잠겼다. 뉴스로 볼 때는 먼 일 같았는데, 며칠 뒤 그 앞을 지나가다 벽에 남은 갈색 선을 봤다. 물이 어디까지 찼는지가 선 하나로 남아 있었다.\n그 선을 우리 교실에 옮겨 놓기로 했다. 사물함은 우리가 매일 여닫는 물건이고, 누구 사물함인지 이름표가 붙어 있는 물건이다. 그 문짝에 물 자국이 남는다면 그 높이는 우리 허리쯤일 것이다.\n침수 사진들을 찾아보니 물이 닿았던 부분은 도장이 부풀어 일어나고 아래쪽에 흙 섞인 갈색 띠가 남아 있었다. 그래서 띠 아래는 부풀리고 위는 멀쩡하게 두었다. 손잡이만 유독 깨끗한데, 물이 빠진 뒤 누군가 이 문을 한 번 더 열어 보았기 때문이라고 생각하며 만들었다.",
  },
  {
    id: "ex-c",
    no: "예시 C",
    title: "37번 열쇠",
    relic: "황동 열쇠와 알루미늄 번호표, 고무줄 결손",
    year: "2300년",
    era: "2020년대 전반",
    mat: "황동 열쇠, 알루미늄 번호표, 삭은 고무줄",
    size: "열쇠 길이 5.5cm, 번호표 지름 3cm",
    context:
      "목욕 시설로 추정되는 건물의 탈의 공간 터에서 여러 개가 흩어진 채 수습되었다. 번호표에 새겨진 숫자는 1번부터 60번까지 확인되며, 그 가운데 30번대 번호표의 표면 마모가 가장 심하다. 출입구에서 가까운 위치의 신발장이 먼저 사용되었기 때문으로 보인다. 열쇠와 번호표를 잇던 고무줄은 대부분 삭아 끊어졌고, 번호표 가장자리에는 손톱으로 반복해 긁힌 자국이 남아 있다. 손이 자주 닿은 면은 새겨진 숫자의 획이 얕아져 읽기 어려운 상태다.",
    coll: "○○고등학교 2학년 ○반 가상 컬렉션 / 작가 ○○○",
    aiScope: "이미지 생성 및 부분 수정, 화면 편집. 작품 캡션 문구와 작가 노트는 학생이 작성함.",
    notice: "이 이미지는 생성형 AI로 제작한, 실재한 적 없는 유물입니다.",
    problem: "사라지는 동네",
    attitude: "기록",
    display: "파편 진열",
    note:
      "우리 동네 목욕탕이 작년에 문을 닫았다. 어릴 때 할머니 손을 잡고 가던 곳이다. 지금은 셔터가 내려가 있고 앞에 부동산 스티커가 붙어 있다.\n그 안에 있던 물건 중에 신발장 열쇠가 생각났다. 들어갈 때 받아서 손목에 차고 있다가 나올 때 돌려주는 물건. 수십 년 동안 매일 수백 명의 손을 거쳤을 텐데, 문을 닫으면 아무도 찾지 않는 물건이 된다.\n번호를 37번으로 정한 이유는 출입구에서 가까운 곳이 먼저 닳는다는 이야기를 목욕탕을 하시던 분께 들었기 때문이다. 그래서 30번대가 가장 닳은 것으로 설정하고, 숫자 획이 얕아져 잘 안 보이도록 했다. 화면에서는 숫자가 결국 읽히지 않는다. 작품 캡션에만 37번이라고 적혀 있다. 관람자가 화면을 믿을지 작품 캡션을 믿을지 잠깐 망설이는 그 순간이 이 작품에서 내가 만들고 싶었던 것이다.",
  },
];

/* ---------- 임시 SVG 도판 (생성 이미지 파일이 없을 때) ---------- */

const TempNote = () => (
  <text x="12" y="290" fontSize="10" fill="#8B887F" fontFamily="monospace">임시 도판 (생성 이미지로 교체 예정)</text>
);

const ScaleBar = ({ x = 250, y = 256, seg = 16, n = 6, vertical = false }) => (
  <g stroke="#55524C" strokeWidth="1">
    {Array.from({ length: n }, (_, i) =>
      vertical
        ? <rect key={i} x={x} y={y + i * seg} width="8" height={seg} fill={i % 2 ? "#FFFFFF" : "#2B2925"} />
        : <rect key={i} x={x + i * seg} y={y} width={seg} height="8" fill={i % 2 ? "#FFFFFF" : "#2B2925"} />)}
  </g>
);

/* A — 손수레 손잡이 파편: 왼쪽 그립 온전, 오른쪽 금속 노출과 직물 테이프 수리 */
const SvgA = () => (
  <svg viewBox="0 0 400 300" width="100%" height="100%" role="img" aria-label="예시 A 오른손, 손수레 손잡이 파편 임시 도판">
    <rect width="400" height="300" fill="#D8D6D0" />
    <ellipse cx="200" cy="178" rx="152" ry="12" fill="#000" opacity=".08" />
    <rect x="140" y="138" width="170" height="26" fill="#A9ABAB" />
    <rect x="140" y="141" width="170" height="5" fill="#C9CBCB" />
    <rect x="196" y="138" width="34" height="26" fill="#D6D8D8" />
    <circle cx="248" cy="158" r="2.4" fill="#7A5B43" />
    <circle cx="188" cy="144" r="1.8" fill="#7A5B43" />
    <circle cx="305" cy="150" r="2" fill="#6E523C" />
    <rect x="54" y="131" width="92" height="40" rx="18" fill="#2B2925" />
    <rect x="63" y="138" width="74" height="7" rx="3.5" fill="#48443D" />
    <path d="M310 132 l7 6 -5 7 6 6 -5 7 5 7 -8 4 v-37 z" fill="#332F29" />
    <rect x="312" y="131" width="36" height="40" rx="16" fill="#332F29" />
    <g fill="#B3A488" stroke="#8F8266" strokeWidth=".8">
      <rect x="252" y="129" width="13" height="44" transform="rotate(-8 258 151)" />
      <rect x="265" y="128" width="13" height="46" transform="rotate(6 271 151)" />
      <rect x="278" y="129" width="13" height="44" transform="rotate(-5 284 151)" />
    </g>
    <ScaleBar />
    <TempNote />
  </svg>
);

/* B — 교실 사물함 문짝: 1.2m 높이의 수평 물때 띠, 띠 아래 도장 들뜸 */
const SvgB = () => (
  <svg viewBox="0 0 400 300" width="100%" height="100%" role="img" aria-label="예시 B 수위선 1.2m, 교실 사물함 문짝 임시 도판">
    <rect width="400" height="300" fill="#D8D6D0" />
    <ellipse cx="200" cy="282" rx="90" ry="8" fill="#000" opacity=".08" />
    <rect x="146" y="24" width="112" height="254" fill="#9AA6A8" stroke="#7C898B" strokeWidth="2" />
    <rect x="170" y="42" width="42" height="20" fill="#D9D4C4" opacity=".85" />
    <path d="M170 62 l10 -5 8 5 z" fill="#9AA6A8" />
    <rect x="238" y="118" width="9" height="36" rx="4" fill="#CDD0D2" stroke="#9AA2A4" strokeWidth="1" />
    <rect x="146" y="166" width="112" height="4" fill="#85674C" opacity=".45" />
    <rect x="146" y="172" width="112" height="9" fill="#85674C" opacity=".8" />
    <rect x="146" y="183" width="112" height="3" fill="#6E523C" opacity=".5" />
    <g fill="#BFB8A3">
      <ellipse cx="172" cy="205" rx="10" ry="6" />
      <ellipse cx="205" cy="224" rx="13" ry="7" />
      <ellipse cx="182" cy="248" rx="9" ry="6" />
      <ellipse cx="228" cy="252" rx="11" ry="6" />
      <ellipse cx="230" cy="200" rx="7" ry="5" />
    </g>
    <g fill="#786A54" opacity=".6">
      <circle cx="192" cy="236" r="2" />
      <circle cx="216" cy="208" r="1.7" />
      <circle cx="164" cy="228" r="1.7" />
      <circle cx="240" cy="232" r="2" />
    </g>
    <ScaleBar x={300} y={130} vertical />
    <TempNote />
  </svg>
);

/* C — 황동 열쇠와 번호표: 삭아 끊어진 고무줄, 획이 얕아진 숫자 37 */
const SvgC = () => (
  <svg viewBox="0 0 400 300" width="100%" height="100%" role="img" aria-label="예시 C 37번 열쇠, 신발장 열쇠와 번호표 임시 도판">
    <rect width="400" height="300" fill="#D8D6D0" />
    <ellipse cx="200" cy="196" rx="150" ry="12" fill="#000" opacity=".08" />
    <path d="M120 150 C 150 96, 210 92, 236 118" stroke="#6B4F3E" strokeWidth="5" fill="none" strokeLinecap="round" />
    <path d="M252 116 C 268 112, 276 118, 280 128" stroke="#6B4F3E" strokeWidth="5" fill="none" strokeLinecap="round" />
    <circle cx="110" cy="152" r="27" fill="#8F7434" stroke="#6E5826" strokeWidth="2" />
    <circle cx="110" cy="152" r="10" fill="#D8D6D0" />
    <rect x="134" y="146" width="74" height="12" fill="#8F7434" stroke="#6E5826" strokeWidth="1.5" />
    <path d="M208 146 h10 v22 h-7 v-8 h-5 v8 h-6 v-10 h8 z" fill="#8F7434" stroke="#6E5826" strokeWidth="1.5" />
    <path d="M96 138 a20 20 0 0 1 26 -4" stroke="#B29552" strokeWidth="3" fill="none" opacity=".7" />
    <rect x="248" y="112" width="104" height="78" rx="36" fill="#B7BABA" stroke="#96999A" strokeWidth="2" />
    <circle cx="266" cy="151" r="7" fill="#D8D6D0" stroke="#96999A" strokeWidth="1.5" />
    <text x="308" y="168" fontSize="46" fontFamily="Georgia, serif" fill="#9A9E9F" opacity=".65" textAnchor="middle">37</text>
    <path d="M340 122 a34 34 0 0 1 10 52" stroke="#E4E6E6" strokeWidth="4" fill="none" opacity=".8" />
    <ScaleBar x={240} y={252} />
    <TempNote />
  </svg>
);

const TEMP_SVG = { "ex-a": <SvgA />, "ex-b": <SvgB />, "ex-c": <SvgC /> };

/* /img/examples/{id}.jpg 가 있으면 그 도판을, 없으면 임시 SVG를 보여 준다 */
function SampleImg({ id, alt }) {
  const [missing, setMissing] = useState(false);
  if (missing) return TEMP_SVG[id];
  return <img src={"/img/examples/" + id + ".jpg"} alt={alt} onError={() => setMissing(true)} />;
}

/* ---------- 전시장 예시 벽면 ---------- */

export function ExhibitSamples({ showPlate }) {
  return (
    <div className="exs">
      <style>{`
.exs{margin:0 0 36px}
.exs-head{text-align:center;margin-bottom:16px}
.exs-head .exs-acc{font-family:var(--mono);font-size:11px;letter-spacing:.25em;color:var(--seal)}
.exs-head h2{font-family:var(--serif);font-size:19px;font-weight:700;margin:8px 0 6px}
.exs-head p{color:var(--sub);font-size:12.5px;max-width:620px;margin:0 auto}
.work.exs-work{border-top:3px solid var(--seal)}
.work.exs-work .work-img{aspect-ratio:1024/559}
.exs-mark{display:inline-block;margin:8px 14px 0;border:1px solid var(--seal);color:var(--seal);font-size:11px;font-weight:700;padding:2px 8px;letter-spacing:.04em}
.exs-meta{margin:0 14px 10px;font-size:11.5px;color:var(--sub);font-family:var(--mono)}
.exs-tail{margin:22px auto 0;border-top:1px dashed var(--line);max-width:620px;padding-top:10px;text-align:center;color:var(--sub);font-size:12px}
.exs-wall{max-width:760px;margin:0 auto 26px}
.exs-wall img{display:block;width:100%;height:auto;border:1px solid var(--line);background:#DBD9D2}
.exs-wall figcaption{margin-top:8px;text-align:center;color:var(--sub);font-size:12px;line-height:1.6}
.exs-wall figcaption b{font-weight:700;color:var(--ink,inherit)}
      `}</style>
      <figure className="exs-wall">
        <img src="/img/examples/exhibit-wall.jpg" alt="교실 벽면에 유물 기록 사진 세 점이 검은 액자에 걸려 있고, 각 액자 아래에 작은 작품 캡션이 붙어 있는 전시 진열 예시" />
        <figcaption>
          <b>전시 진열 예시</b> · 유물 기록 사진과 작품 캡션, 허구 고지가 한 진열을 이루는 형식입니다.
          생성형 AI로 제작한 예시 이미지이며, 실제 학생 작품이 아닙니다.
        </figcaption>
      </figure>
      <div className="exs-head">
        <div className="exs-acc">SPECIMEN WORKS · 예시 작품 자료집</div>
        <h2>예시 작품 세 점</h2>
        <p>
          아래 세 점은 예시 작품 자료집에 수록된 가상의 예시이며, 실제 학생 작품이 아닙니다.
          예시는 도달점의 한 가지 모습일 뿐, 같은 문제라도 다른 사물과 다른 태도로 풀 수 있습니다.
          관람 방식은 학생 작품과 같습니다. 1차에는 작품 캡션을 가리고 보고, 2차에는 작품 캡션을 펼쳐 봅니다.
        </p>
      </div>
      <div className="gal-grid">
        {EXHIBIT_SAMPLES.map((w) => (
          <div className="work exs-work" key={w.id}>
            <div className="work-img"><SampleImg id={w.id} alt={"예시 작품 " + w.no} /></div>
            <div><span className="exs-mark">예시 (실제 학생 작품 아님)</span></div>
            <div className="work-no">{w.no}</div>
            <div className="work-title">{showPlate ? "「" + w.title + "」" : "무제 (2차 관람에서 공개)"}</div>
            {showPlate ? (
              <>
                <div className="exs-meta">다루는 문제: {w.problem} · 태도: {w.attitude} · {w.display}</div>
                <div className="plate">
                  <dl>
                    <dt>유물 명칭</dt><dd>{w.relic}</dd>
                    <dt>발굴 연도</dt><dd>{w.year}</dd>
                    <dt>추정 연대</dt><dd>{w.era}</dd>
                    <dt>재질</dt><dd>{w.mat}</dd>
                    <dt>크기</dt><dd>{w.size}</dd>
                    <dt>출토 맥락</dt><dd>{w.context}</dd>
                    <dt>소장</dt><dd>{w.coll}</dd>
                    <dt>AI 활용 범위</dt><dd>{w.aiScope}</dd>
                    <dd className="notice">{w.notice}</dd>
                  </dl>
                </div>
                {w.note && <div className="work-note">{w.note}</div>}
              </>
            ) : (
              <div className="plate hidden-plate">1차 관람 · 작품 캡션 가림</div>
            )}
          </div>
        ))}
      </div>
      <div className="exs-tail">여기부터는 학급의 출품작이 걸립니다.</div>
    </div>
  );
}
