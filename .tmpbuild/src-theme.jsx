/* ============================================================
   전 화면 공통 테마 계층 — 흰 배경 에디토리얼 (게이트 디자인의 연장)
   src-app.jsx의 CSS 상수와 Content/Survey/Stance 스타일은 모두
   :root 변수로 색·글꼴을 받으므로, 이 파일을 마지막 <style>로 얹어
   변수와 몇몇 하드코딩 표면만 재정의하면 로그인 이후 화면
   (학생 기록실·교사 대시보드·전시장·예시 기록지)이 함께 바뀐다.
   ============================================================ */
import React from "react";

export const THEME_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;900&family=Noto+Sans+KR:wght@400;500;700;900&display=swap');

/* ---------- 팔레트·글꼴 재정의 — 베이지 유물 톤 → 흰 배경 흑백 ---------- */
:root{
  --bg:#fff; --card:#fff; --card2:#f6f6f6;
  --ink:#111; --sub:#767676;
  --line:#ddd; --line2:#ebebeb;
  --seal:#B5382A; --seal-bg:#F8ECEA;
  --patina:#31684F; --patina-bg:#EAF1ED;
  --amber:#96712F;
  --serif:'Noto Sans KR','IBM Plex Sans KR',sans-serif;
  --sans:'Noto Sans KR','IBM Plex Sans KR',sans-serif;
}
body{background:#fff}

/* ---------- 상단 바 — 게이트 마스트헤드의 축약형 ---------- */
.topbar{background:#fff;border-bottom:1px solid #111}
.topbar-in{padding:14px 20px}
.brand{font-family:'Noto Sans KR',sans-serif;font-weight:900;font-size:16px;letter-spacing:-.01em}
.brand small{font-family:'Archivo',sans-serif;font-weight:700;font-size:9px;letter-spacing:.22em;color:#999;margin-top:3px}
.btn.ghost{border-color:#111}
.save-pill{background:#fff;border-color:#ddd}

/* ---------- 제목 위계 — 산세리프 중량으로 ---------- */
.gal-hero h1{font-weight:900;font-size:30px;letter-spacing:-.01em}
.gal-hero .acc,.gate-head .acc{font-family:'Archivo',sans-serif;font-weight:700;letter-spacing:.24em;color:#999}
.card-title,.lesson-title,.work-title,.pair-label{font-weight:700}
.kpi .n,.metric .mv{font-family:'Archivo','Noto Sans KR',sans-serif;font-weight:900}

/* ---------- 하드코딩돼 있던 베이지 표면 ---------- */
.work-img{background:#f2f2f2}
.rv.empty,.pair-text.empty{color:#bbb}
.sample-banner{background:#FBF6E9}
.tbl input:focus,.tbl textarea:focus,.tbl select:focus{outline-color:#111}

/* ---------- 카드·탭의 마감선을 게이트와 같은 문법으로 ---------- */
.card,.lesson,.pair,.work{border-color:#e2e2e2}
.card{border-top:1px solid #111}
.lesson{border-left-width:3px}
.sess-tab{border-color:#ddd}
.sess-tab.on{border-color:#111}
.ticket{background:#fff;border-color:#ddd}
`;

export function ThemeStyle() { return <style>{THEME_CSS}</style>; }
