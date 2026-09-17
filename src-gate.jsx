/* ============================================================
   입장 화면(게이트) 디자인 계층 — 흰 배경 에디토리얼 레이아웃
   · 헤더: 산세리프 대형 로고 + 상단 유틸리티 스트립 (뮤지엄 사이트 형식)
   · 본문: 8차시를 네 장(章)으로 묶은 4열 그리드 (01–04 번호 + 도판 + 소개)
   로그인 폼과 인증 로직은 src-app.jsx의 Gate가 그대로 가지고 있고,
   이 파일은 그 둘레의 화면 구성과 스타일만 내보낸다.
   ============================================================ */
import React from "react";

/* 8차시 → 4개 장 구성. 도판은 public/img/lessons의 수업 자료에서 고른다. */
export const GATE_SECTIONS = [
  {
    no: "01",
    sess: "1–2차시",
    en: "QUESTION",
    title: "무엇이 미술이 되는가",
    body: "레디메이드·개념미술·극사실주의 감상, 나의 미술 정의문 쓰기",
    img: "/img/lessons/L1_w_lewitt.jpg",
    alt: "솔 르윗의 흑백 줄무늬 벽화가 걸린 전시장",
  },
  {
    no: "02",
    sess: "3–4차시",
    en: "DESIGN",
    title: "문제 관찰과 유물 설계",
    body: "사회참여 미술 감상과 문제 관찰, 허구 유물의 세계관·화면 설계",
    img: "/img/lessons/L2_w_maebyeong.jpg",
    alt: "학 무늬가 상감된 청자 매병",
  },
  {
    no: "03",
    sess: "5–6차시",
    en: "GENERATE",
    title: "생성과 다듬기",
    body: "프롬프트 작성과 AI 이미지 생성·선별, 다듬기와 작품 캡션 문구",
    img: "/img/lessons/L6_w_kintsugi.jpg",
    alt: "금으로 이어 붙인 킨츠기 찻사발",
  },
  {
    no: "04",
    sess: "7–8차시",
    en: "EXHIBIT",
    title: "전시와 비평",
    body: "작품화와 전시 구성, 두 번의 관람과 상호 비평, 단원 성찰",
    img: "/img/lessons/L3_w_realpictures.jpg",
    alt: "어두운 전시장 바닥에서 빛을 받은 검은 인쇄물 더미",
  },
];

/* 상단 헤더 — 유틸리티 스트립 + 대형 로고 + 주 내비게이션 */
export function GateHeader({ onEnter, onUnits, onTeacher, onGallery, onDemo }) {
  return (
    <header className="g4-header">
      <div className="g4-strip">
        <nav className="g4-strip-nav">
          <button onClick={onUnits}>ABOUT</button>
          <button onClick={onGallery}>GALLERY</button>
          <button onClick={onDemo}>DEMO</button>
          <button onClick={onTeacher}>FOR TEACHERS</button>
          <button className="g4-strip-join" onClick={onEnter}>JOIN</button>
        </nav>
      </div>
      <div className="g4-masthead">
        <button className="g4-logo" onClick={onUnits} aria-label="허구의 아카이브 수업 소개로 이동">
          <span>FICTIVE</span>
          <span>ARCHIVE</span>
          <span className="g4-logo-kr">허구의 아카이브 · 창작 과정 기록실</span>
        </button>
        <nav className="g4-mainnav">
          <button onClick={onUnits}>수업</button>
          <button onClick={onEnter}>기록실 입장</button>
          <button onClick={onGallery}>전시장</button>
          <button onClick={onDemo}>예시 기록지</button>
        </nav>
      </div>
    </header>
  );
}

/* 본문 — 네 개의 장을 나란히 세운 4열 그리드 */
export function GateSections({ onEnter }) {
  return (
    <section className="g4-units" id="g4-units">
      <div className="g4-units-cap">
        <span>고2 미술 · 8차시 · 2026</span>
        <span>실재한 적 없는 유물 이미지로 구성한 허구의 아카이브 전시</span>
        <span>FOUR CHAPTERS</span>
      </div>
      <div className="g4-grid">
        {GATE_SECTIONS.map((s) => (
          <article className="g4-col" key={s.no}>
            <div className="g4-col-img">
              <img src={s.img} alt={s.alt} loading="lazy" />
            </div>
            <div className="g4-col-txt">
              <div className="g4-no">{s.no}</div>
              <div className="g4-col-meta">
                <span className="g4-sess">{s.sess}</span>
                <span className="g4-en">{s.en}</span>
              </div>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
              <button className="g4-arrow" onClick={onEnter} aria-label={s.title + " 기록실 입장으로 이동"}>입장 →</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export const GATE_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;900&family=Noto+Sans+KR:wght@400;500;700;900&display=swap');

/* ---------- 게이트 전용 — 흰 배경 에디토리얼 ---------- */
.g4{min-height:100vh;background:#fff;color:#111;
  font-family:'Noto Sans KR','IBM Plex Sans KR',sans-serif}
.g4 button{font-family:inherit}

/* 상단 유틸리티 스트립 */
.g4-strip{border-bottom:1px solid #e6e6e6}
.g4-strip-nav{max-width:1280px;margin:0 auto;padding:8px 20px;display:flex;justify-content:flex-end;gap:22px}
.g4-strip-nav button{background:none;border:none;cursor:pointer;color:#555;
  font-family:'Archivo','Noto Sans KR',sans-serif;font-size:11px;font-weight:700;letter-spacing:.14em;padding:8px 0}
.g4-strip-nav button:hover{color:#000}
.g4-strip-join{color:#000 !important;border-bottom:2px solid #000 !important}

/* 마스트헤드 — 대형 산세리프 로고 + 주 내비게이션 */
.g4-masthead{max-width:1280px;margin:0 auto;padding:26px 20px 22px;
  display:flex;align-items:flex-end;justify-content:space-between;gap:24px;flex-wrap:wrap}
.g4-logo{background:none;border:none;cursor:pointer;text-align:left;color:#000;padding:0}
.g4-logo span{display:block;font-family:'Archivo','Noto Sans KR',sans-serif;
  font-size:clamp(30px,4.6vw,46px);font-weight:900;line-height:.95;letter-spacing:-.01em;text-transform:uppercase}
.g4-logo .g4-logo-kr{font-size:11px;font-weight:700;letter-spacing:.12em;line-height:1;
  margin-top:10px;color:#666;text-transform:none;font-family:'Noto Sans KR',sans-serif}
.g4-mainnav{display:flex;gap:26px;flex-wrap:wrap;padding-bottom:6px}
.g4-mainnav button{background:none;border:none;cursor:pointer;color:#111;
  font-size:15px;font-weight:500;letter-spacing:.01em;padding:8px 0;border-bottom:2px solid transparent}
.g4-mainnav button:hover{border-bottom-color:#000}

/* 본문 2단 — 왼쪽 네 개의 장, 오른쪽 입장 패널 (데스크톱) */
.g4-main{max-width:1280px;margin:0 auto;padding:0 20px;
  display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:0 34px;align-items:start}
@media(max-width:1100px){
  .g4-main{grid-template-columns:1fr;display:flex;flex-direction:column}
  .g4-main .g4-enter{order:-1} /* 폰에서 도판 4장을 다 지나야 입장칸이 나오던 문제 — 입장 패널을 맨 위로 */
}

/* 장 구분 캡션 줄 */
.g4-units-cap{padding:10px 0;
  display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;
  border-top:1px solid #e6e6e6;border-bottom:1px solid #e6e6e6;
  font-family:'Archivo','Noto Sans KR',sans-serif;font-size:11px;font-weight:500;letter-spacing:.14em;color:#666}

/* 4열 그리드 */
.g4-grid{padding:22px 0 10px;
  display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:18px}
.g4-col-img{aspect-ratio:3/4.4;overflow:hidden;background:#f2f2f2}
.g4-col-img img{width:100%;height:100%;object-fit:cover;display:block;
  transition:transform .6s ease}
.g4-col:hover .g4-col-img img{transform:scale(1.04)}
.g4-col-txt{padding:16px 2px 26px;border-top:1px solid #111;margin-top:14px;position:relative}
.g4-no{font-family:'Archivo',sans-serif;font-size:clamp(40px,4.5vw,56px);font-weight:900;line-height:1;letter-spacing:-.02em}
.g4-col-meta{display:flex;gap:10px;align-items:baseline;margin:10px 0 6px}
.g4-sess{font-size:11px;font-weight:700;color:#111;background:#f0f0f0;padding:2px 7px}
.g4-en{font-family:'Archivo',sans-serif;font-size:11px;font-weight:700;letter-spacing:.16em;color:#666}
.g4-col-txt h3{font-size:17px;font-weight:700;line-height:1.35;margin-bottom:6px}
.g4-col-txt p{font-size:12.5px;line-height:1.75;color:#555}
.g4-arrow{position:absolute;right:0;bottom:0;background:none;border:none;cursor:pointer;
  font-size:14px;font-weight:700;line-height:1;color:#111;padding:8px 2px;transition:transform .25s ease}
.g4-arrow:hover{transform:translateX(5px)}
@media(max-width:540px){.g4-grid{grid-template-columns:1fr}.g4-col-img{aspect-ratio:4/3}}

/* 입장 패널 — 데스크톱에서는 오른쪽에 붙박이, 좁은 화면에서는 그리드 아래 */
.g4-enter{position:sticky;top:18px;padding:22px 0 30px;scroll-margin-top:24px}
@media(max-width:1100px){.g4-enter{position:static;max-width:460px;margin:0 auto;padding:20px 0 30px}}
.g4 .ticket{background:#fff;border:1px solid #ddd;border-top:3px solid #111}
.g4 .tab-switch{border-color:#ddd}
.g4 .tab-switch button{background:#f6f6f6;color:#666}
.g4 .tab-switch button.on{background:#111;color:#fff}
.g4 .field input,.g4 .field textarea{border-color:#ddd;background:#fff;color:#111}
.g4 .field input:focus,.g4 .field textarea:focus{outline-color:#111}
.g4 .field label{color:#666}
.g4 .btn{background:#111;color:#fff}
.g4 .btn.ghost{background:transparent;color:#111;border:1px solid #111}
.g4 .gate-note{color:#666}

/* 바닥글 */
.g4-foot{border-top:1px solid #e6e6e6;margin-top:30px}
.g4-foot-in{max-width:1280px;margin:0 auto;padding:22px 20px 40px;
  display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;align-items:flex-start}
.g4-foot-logo{font-family:'Archivo',sans-serif;font-size:15px;font-weight:900;letter-spacing:.02em}
.g4-foot-copy{font-size:11px;color:#666;margin-top:8px;line-height:1.8}
.g4-foot-note{font-size:11px;color:#666;line-height:1.8;text-align:right}
@media(max-width:540px){.g4-foot-note{text-align:left}}
`;

export function GateStyle() { return <style>{GATE_CSS}</style>; }
