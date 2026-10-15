/* ============================================================
   전체 디자인·UX·UI 검토 반영 계층 (2026-10-15)
   네 영역(입장·전시장·예시, 학생 1~4차시, 학생 5~8차시·평가, 교사 13탭) 점검 보고서
   (.tmpbuild/uxui-1015/review-*.md)에서 CSS만으로 고칠 수 있는 항목을 모았다.
   App이 NavStyle 뒤 마지막 <style>로 얹으므로 같은 특이도의 규칙은 이 파일이 이긴다.
   원칙:
   · 글자 바닥선 12px, 클릭 대상 바닥선 24px, 본문 대비 4.5:1
   · 의미색 분리: 오류·부정은 --err(붉은 갈색), 강조는 --seal(남색), 완료는 --patina(녹색), 경고는 --amber
   · 한 화면에 채운(검정) 버튼은 하나. 안내 띠·표 안·자료 카드의 버튼은 윤곽선
   · 폰(599px 이하)에서 위계가 내려가지 않게: 종류 이름 유지, 표의 행동 열 고정, 머리 두 줄
   ============================================================ */
import React from "react";

export const POLISH_CSS = `
/* ---------- 토큰: 오류·부정 색을 강조색에서 분리 ---------- */
:root{--err:#9A382F;--err-bg:#F6E8E6}
.err{background:var(--err-bg);border-color:var(--err);color:var(--err)}
.save-pill.err{border-color:var(--err);color:var(--err)}
.seg button.on-no{background:var(--err);border-color:var(--err);color:#fff}
.think-meter.warn{color:var(--amber)}
.sess-tab.on .dot-check{color:var(--card)}

/* ---------- 글자 바닥선 12px ---------- */
.card-code,.todo-head,.todo-n,.todo-sub,.todo-foot,.card-sess,.stage-tag,.q-type,.sn-l,.sn-pct,.brand small,
.conc-chip,.stmt-vers .v .n,.carry .cr .l,.rd-i,.rd-sum-v,.lz-step-n,.vz-tag,.vz-src-u,.rd-wk-a,.wk-link,.rd-fig-cr,.rd-fig-m a,.rd-zoom,
.stat-tbl th,.t-group-l,.lesson-min,.g4-cr,.g4-sess,.g4-en,.gal-when,.pc-tag,.tl-at,.prev-l,.pair-dim,.pair-where,.ld-step .k,.lm-now,.stmt-tpl small,
.lz-notice-tag,.lz-asks-h,.iaid-acc,.lcmp-acc,.exs .exs-acc,.exs .exs-meta,.role-n,.hbar .v,.funnel .fr .v,.funnel .fr .lb small{font-size:12px}
.sn-toc .sn-code,.sn-toc-l{font-size:12px}
.hint{font-size:12px}
.ok-note .hint,.warn-note .hint{color:inherit;opacity:.9}
.reading summary .rd-i{font-size:12px}
.iaid-sb{font-family:var(--sans);letter-spacing:0;font-size:12px}
.iaid-acc,.lcmp-acc{font-family:var(--sans);letter-spacing:.02em}

/* ---------- 대비 ---------- */
.rd-fig-cr,.rd-box-cap .rd-fig-cr{color:#6e6e6e}
.rd-asks-tip,.carry .cr .l,.sum-box .foot,.sum-box .row .l{color:#5f5f5f}
.rv.empty,.pair-text.empty{color:var(--sub)}
@media (hover:none){.rd-zoom{opacity:1}}

/* ---------- 클릭 대상 바닥선 24px ---------- */
.rd-fig-m a,.wk-link{display:inline-block;padding:4px 8px;min-height:24px;line-height:16px}
.lz-steps button{min-height:24px;padding-top:3px;padding-bottom:3px}
.sv-scale-jump{min-height:24px;padding:4px 10px}
.linkish{min-height:24px;padding:4px 2px}
.roster input[type=checkbox],.qt-panel input[type=checkbox],.tbl input[type=checkbox]{width:20px;height:20px;margin:2px;accent-color:var(--seal)}
.likert{gap:6px}
@media(pointer:coarse){.likert button{width:44px;height:44px}}

/* ---------- 제목 위계: 카드 제목 > 읽기 소제목 ---------- */
.card-title{font-size:18px}
.lesson-title{font-size:20px}
.rd-h{font-size:16px}

/* ---------- 카드 종류를 색 띠로: 읽기(강의 노트)는 검정, 배움 확인 녹색, 탐구 질문 남색, 기록·단계 검정 ---------- */
.lesson{border-left:3px solid var(--ink)}
.card[data-kind="learn"]{border-left:3px solid var(--patina)}
.card[data-kind="inquiry"]{border-left:3px solid var(--seal)}
.card[data-kind="ladder"],.card[data-kind="record"]{border-left:3px solid var(--ink)}
.lesson-guide{background:var(--card2);border-top:2px solid var(--ink);font-size:13px;color:var(--ink)}

/* ---------- 완료 도장이 차시 표시·제목과 겹치지 않게 ---------- */
.card:has(> .stamp) .card-sess{visibility:hidden}
@media (max-width:599px){.stamp{position:static;display:inline-block;margin:8px 12px 0;transform:none}}

/* ---------- 이동 안내 띠: 사이드바·탭 줄에 같은 목적지가 있으면 숨기고, 남는 곳에서는 윤곽선 버튼 ---------- */
.stage-open .btn{background:transparent;color:var(--ink);border:1px solid var(--ink)}
.stage-open.sv-note{background:var(--card2);border-color:var(--line);color:var(--ink)}
@media (min-width:600px){.stage-open.stage-nav{display:none}}

/* ---------- 오늘 할 일(폰): 종류 이름을 제목 위 줄에 남긴다 ---------- */
@media (max-width:599px){
  .todo-row{grid-template-columns:22px 1fr auto;grid-template-areas:"n head sub" "n title sub";padding:7px 12px;row-gap:1px}
  .todo-n{grid-area:n}
  .todo-head{grid-area:head;display:block;font-size:12px}
  .todo-title{grid-area:title}
  .todo-sub{grid-area:sub;align-self:center}
}

/* ---------- 사전·사후 설문: 고정 막대가 있으면 범례는 한 번만 ---------- */
.sv-card:has(.sv-stickybar) .sv-legend{display:none}

/* ---------- 선택 보기 버튼: 단어 중간에서 꺾이지 않게 ---------- */
.toggle-row{flex-wrap:wrap}
.toggle-row button{word-break:keep-all;line-height:1.4;text-align:left}
@media (max-width:640px){.toggle-row.col,.toggle-row.long{flex-direction:column;align-items:stretch}}
.toggle-row button.on{background:var(--ink);border-color:var(--ink);color:#fff}

/* ---------- 표 안 입력칸이 입력칸으로 보이게 ---------- */
.tbl input:not([type=checkbox]):not([type=file]),.tbl textarea,.tbl select{border:1px solid var(--line2);background:#fff;padding:5px 6px}
.tbl input::placeholder,.tbl textarea::placeholder{color:#9a9a9a}
.tbl th{word-break:keep-all}

/* ---------- 폰에서 표형 칸(생성 회차·이중 점검·상호평가 활동지)을 카드형으로 ---------- */
@media (max-width:640px){
  .tbl-scroll:has(> .tbl.stack){overflow:visible}
  .tbl.stack{min-width:0;display:block}
  .tbl.stack thead{display:none}
  .tbl.stack tbody,.tbl.stack tr{display:block}
  .tbl.stack tr{border:1px solid var(--line);margin-bottom:10px;padding:8px 10px;background:#fff}
  .tbl.stack td{display:grid;grid-template-columns:92px 1fr;gap:4px 8px;border:none;padding:4px 0;align-items:start}
  .tbl.stack td::before{content:attr(data-th);font-size:12px;color:var(--sub);padding-top:5px}
  .tbl.stack td:not([data-th])::before{content:none}
  .tbl.stack td:not([data-th]){grid-template-columns:1fr}
  .tbl.stack td.rn{grid-template-columns:1fr;font-weight:700;text-align:left;background:none;width:auto}
  .tbl.stack td.rn::before{content:"회차 ";display:inline}
  .tbl-scroll:has(> .tbl.stack)::after{content:none}
}

/* ---------- 교사 표(폰): 마지막 열(열림·잠김, 열람, 조치)을 오른쪽에 고정 ---------- */
@media (max-width:599px){
  .tbl-scroll .roster th:last-child,.tbl-scroll .roster td:last-child{position:sticky;right:0;background:var(--card);box-shadow:-8px 0 8px -8px rgba(0,0,0,.25)}
  .tbl-scroll .roster th:last-child{background:var(--card2)}
}
/* 표 안·자료 카드의 버튼은 윤곽선: 한 화면에 채운 버튼이 여럿 서지 않게 */
.roster td .btn:not(.ghost):not(.seal),.res-card .btn:not(.ghost){background:transparent;color:var(--ink);border:1px solid var(--ink)}
.back-link{border:1px solid var(--line);padding:6px 10px;text-decoration:none;color:var(--ink);font-size:13px}
.back-link:hover{border-color:var(--ink)}
/* 고정 폭 수치 칸이 꺾이지 않게 */
.hbar .v,.funnel .fr .v{width:auto;min-width:40px;white-space:nowrap;word-break:keep-all}
/* 기술통계 표 첫 열 */
.stat-tbl td:first-child,.stat-tbl th:first-child{white-space:nowrap;word-break:keep-all}
@media (max-width:599px){.stat-tbl{display:block;overflow-x:auto;max-width:100%}.stat-tbl td,.stat-tbl th{white-space:nowrap}}
/* 그래프 안 글자는 화면 글꼴로 */
.slope text,.card-body svg text{font-family:var(--sans)}
/* 교사 탭(폰): 한 줄 가로 스크롤 */
@media (max-width:599px){
  .t-groups{flex-wrap:nowrap;overflow-x:auto;gap:12px;margin:10px 0;padding-bottom:4px;scrollbar-width:none}
  .t-groups::-webkit-scrollbar{display:none}
  .t-group{flex:0 0 auto;flex-wrap:nowrap;border-left:0;padding-left:0}
  .t-group-l{display:none}
  /* 수업 편집 고정 바: 상단 바가 숨은 뒤 화면 중간에 뜨지 않게 */
  html.nav-hide .ed-bar{top:0}
  .ed-bar{padding:6px 10px;gap:6px}
  .at-settings{grid-template-columns:1fr}
}
/* 폰 자료 카드(연구 탭)는 제목·파일명·버튼만 */
@media (max-width:599px){.res-card p{display:none}.res-card{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.res-card h4{flex:1;margin:0;min-width:120px}}

.save-mini{display:none}
/* ---------- 상단 바(폰): 제목과 부제를 한 줄, 버튼 줄은 가로 스크롤 한 줄 ---------- */
@media (max-width:599px){
  .brand{font-size:15px;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
  .brand small{display:inline;margin-top:0}
  .top-right{width:100%;justify-content:flex-start;gap:6px;flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}
  .top-right::-webkit-scrollbar{display:none}
  .top-right .btn.small,.save-pill{white-space:nowrap;flex:0 0 auto}
  /* 상단 바가 숨은 동안 저장 상태만 작은 띠로 남긴다 */
  .save-mini{position:fixed;right:10px;bottom:12px;z-index:21;font-size:12px;padding:3px 9px;border:1px solid var(--line);background:#fff;color:var(--sub);box-shadow:0 1px 4px rgba(0,0,0,.15)}
  html.nav-hide .save-mini:not(:empty){display:block}
  .save-mini.dirty{border-color:var(--amber);color:var(--amber)}
  .save-mini.err{border-color:var(--err);color:var(--err)}
}

/* ---------- 차시 탭 줄(폰): 오른쪽 끝 흐림으로 더 있음을 알린다 ---------- */
@media (max-width:599px){
  .sess-tabs{mask-image:linear-gradient(90deg,#000 calc(100% - 28px),transparent);-webkit-mask-image:linear-gradient(90deg,#000 calc(100% - 28px),transparent)}
  .sess-tabs::after{content:"";flex:0 0 24px}
}

/* ---------- 3차시 발상 단계 표시줄(폰): 한 줄 가로 스크롤, 한 줄 이동은 두 줄로 ---------- */
@media (max-width:599px){
  .ladder{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:thin}
  .ld-step{flex:0 0 112px}
  .ld-step.now{box-shadow:inset 0 3px 0 var(--seal),inset 0 0 0 1px var(--seal)}
  .lm-row{flex-wrap:wrap}
  .lm-now{order:-1;flex-basis:100%;text-align:center;margin-bottom:4px}
  .lm-nav{flex:1 1 45%}
  .lm-nav:last-child{text-align:right}
}

/* ---------- 문장 틀: 자동 저장이 기본이므로 따로 저장 버튼은 윤곽선 ---------- */
.stmt-row .btn.small{background:transparent;color:var(--ink);border:1px solid var(--ink)}

/* ---------- 「내 생각 쓰기」(선택 활동)와 「도움말 보기」는 글자 버튼으로 ---------- */
.rd-ask-btn{background:none;border:0;padding:2px 0;font:500 13px/1.4 var(--sans);color:var(--patina);text-decoration:underline;text-underline-offset:3px}
.rd-ask-btn::before{content:"+ "}
.rd-ask-btn:hover{background:none;color:var(--ink)}
.think-steps{background:none;border-left:0;padding:0 0 4px}
.think-steps .ts-t{display:inline-block;font-weight:500;text-decoration:underline;text-underline-offset:3px}

/* ---------- 사이드바 「이 화면 차례」를 촘촘히 (3차시에서 잘리던 문제) ---------- */
.sn-toc .sn-item{padding:3px 10px 3px 12px}
.sn-tw{flex-direction:row;gap:6px;flex-wrap:wrap;align-items:baseline}

/* ---------- 사진 올리기: 파일 입력을 버튼 모양으로 ---------- */
.up-btn{position:relative;cursor:pointer;display:inline-block}
.up-btn input[type=file]{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}
.up-btn.busy{opacity:.6;cursor:progress}
.up-btn:focus-within{outline:2px solid var(--ink);outline-offset:2px}

/* ---------- 포트폴리오: 회차 시작 전 올리기 버튼은 비활성으로 보이게 ---------- */
.pf-form.off .pf-up{background:var(--card2);color:var(--sub);border:1px dashed var(--line);cursor:not-allowed}

/* ---------- 최종 평가 단계 띠(폰): 한 줄 가로 스크롤 ---------- */
@media (max-width:640px){.as-strip{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:thin;padding-bottom:4px}.as-step{flex:0 0 auto;white-space:nowrap}}

/* ---------- 쪽지시험·불러오기 상태 ---------- */
.ld-spin{display:inline-block;width:14px;height:14px;border:2px solid var(--line);border-top-color:var(--ink);border-radius:50%;animation:ldspin .9s linear infinite;vertical-align:-2px;margin-right:6px}
@keyframes ldspin{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.ld-spin{animation:none}}

/* ---------- 공유 링크 칸: 번호 열 ---------- */
.link-row{grid-template-columns:22px 2fr 1fr;align-items:center}
.link-n{font-family:var(--mono);font-size:12px;color:var(--sub);text-align:center}
@media(max-width:640px){.link-row{grid-template-columns:22px 1fr}.link-row .link-n{grid-row:span 2}}

/* ---------- 전시장 ---------- */
.gal-hero .btn.arx-entry{background:transparent;color:var(--ink);border:1px solid var(--ink)}
.gal-find:disabled{background:#f6f6f6;color:#999}
.gal-find-l{font-size:12px;color:var(--sub);margin-right:6px}
@media(max-width:560px){.gal-hero p{text-align:left}}

/* ---------- 예시 기록지: 답은 입력칸이 아니라 읽는 글로 ---------- */
.demo .read-block .rv{background:var(--card2);border:0;border-left:2px solid var(--line);padding:8px 12px}
.demo .read-block .rl::before{content:"예시 답 · ";color:var(--seal);font-weight:700}
.topbar.demo-bar{border-bottom:3px solid var(--seal)}

/* ---------- 입장 화면 ---------- */
/* GateStyle은 Gate 안에서 찍혀 이 계층보다 뒤에 오므로 .g4 접두어로 덮는다 */
.g4 .g4-logo span:not(.g4-logo-kr){font-size:clamp(26px,3.4vw,36px)}
.g4 .g4-logo .g4-logo-kr{font-size:12px;letter-spacing:0}
.g4 .g4-no{font-size:clamp(30px,3vw,40px)}
.g4 .g4-cr{min-height:4.5em;font-size:12px}
.g4 .g4-col-txt p{font-size:13.5px}
.g4 .ticket h2{font-family:var(--sans);font-size:18px;font-weight:900;margin-bottom:2px}
.g4 .ticket .sub{font-size:12px;color:#666;margin-bottom:14px}
.g4 .ax-gate{margin:14px 0 0;padding-top:12px;border-top:1px solid #e6e6e6;font-size:13px}
.g4 .ax-gate-langs{gap:4px}
.g4 .ax-gate-l{margin-right:6px}
.g4 .ax-gate-langs button{padding:3px 7px;font-size:12px}
.g4-units-foot{display:flex;gap:14px;align-items:center;padding:8px 0 24px;font-size:12.5px;color:#666;flex-wrap:wrap}
@media(min-width:1101px){.g4-units-foot{display:none}}
@media(min-width:1101px){.g4-main .g4-units{grid-column:1;grid-row:1}.g4-main .g4-enter{grid-column:2;grid-row:1}}

/* ---------- 컴포넌트 안에서 <style>을 찍는 모듈(강의 노트·탐구 근거·캡션 비교·내 생각 쓰기·최종 평가·포트폴리오)은
   DOM 순서상 이 계층보다 뒤에 오므로 .app 접두어로 특이도를 한 단계 올려 덮는다 ---------- */
.app .rd-fig-m,.app .rd-key-t,.app .rd-sum .rd-sum-v,.app .rd-wk-a,.app .rd-zoom,.app .vz-tag,.app .wk-link,.app .lz-cr,.app .lz-load,.app .lz-strip-i span,.app .lz-fig figcaption,.app .lz-map-h span,
.app .iaid-acc,.app .iaid-cap,.app .iaid-cr,.app .iaid-empty,.app .iaid-load,.app .iaid-nm,.app .iaid-sb,
.app .inq-acc,.app .inq-l,.app .inq-link,.app .inq-stems,.app .inq-sub,.app .inq-tv b,
.app .lcmp-acc,.app .lcmp-cap,.app .lcmp-fold,.app .lcmp-read b,.app .lcmp-tbl td.k,.app .lcmp-tbl thead th,.app .lcmp-tbl td.a:before,.app .lcmp-tbl td.b:before,
.app .ask-c-rev,.app .ask-r-note,.app .ld-intro small,.app .ld-note,.app .lt.stack td::before,
.app .as-count,.app .as-lab,.app .as-lv-n small,.app .as-mine-notice,.app .as-plate dl,.app .as-plate-hidden,.app .as-qi-g,.app .as-step i,.app .as-tag,.app .as-ticks span,.app .as-work-h,.app .as-cmp .as-sc-w,.app .as-mine-img .ph,.app .as-sub-img .ph,.app .as-img .ph,
.app .pf-arrow-chip,.app .pf-chip,.app .pf-flag b,.app .pf-img-wait,.app .pf-img-bad,.app .pf-img-none,.app .pf-seg-note,.app .pf-tab-st,
.app .qz-path-k,.app .qz-tag,.app .sv-prog-count i,.app .sv-scale-ok,.app .sym-warn,.app .toggle-row.col button small,.app .vz-cmp-t thead th small,
.app .vz-tbl td[data-label]:not([data-label=""])::before,.app .vz-cmp-t td[data-label]:not([data-label=""])::before,
.app .think-steps .ts-t,.app .think-meter,.app .lesson-n,.app .stamp,.app .dot-check,.app .hw-chip,.app .lt .rn,.app .tbl .rn,.app .pcard .pc-s,.app .ed-num,.app .ed-fld-h .mono,
.app .carry .cr .l,.app .sum-box .foot,.app .sum-box .h,.app .sum-box .row .l,.app .sum-edit,.app .stmt-prev b,.app .tf .tf-l,.app .tf-sub,.app .ax-open-l2,.app .ax-gate-l,
.app .stage-tag,.app .ld-step .k,.app .carry b,.app .stmt-tpl small,.app .stmt-vers .v .n,.app .conc-chip,.app .pc-tag,.app .risk-echo b,.app .obs-echo b,.app .lz-notice-tag,.app .lz-asks-h,.app .sess-tab .lock,.app .ld-step .hw,
.app .sv-scale-ticks span,.app .wk-link.src em{font-size:12px}
.app .rd-fig-cr,.app .rd-box-cap .rd-fig-cr{color:#6e6e6e;font-size:12px}
.app .rd-zoom{font-size:12px}
@media (hover:none){.app .rd-zoom{opacity:1}}
.app .rd-fig-m a,.app .wk-link{display:inline-block;padding:4px 8px;min-height:24px;line-height:16px}
.app .lz-steps button{min-height:24px;padding-top:3px;padding-bottom:3px}
.app .rd-ask-btn{padding:4px 0;min-height:24px}
.app .reading-in li > a,.app .rd-src a{display:inline-block;padding:3px 0;min-height:24px}
.app .sv-scale-jump{min-height:24px;padding:4px 10px}
.app .tbl.rounds{min-width:940px}
@media (max-width:640px){.app .tbl.rounds.stack{min-width:0}}
`;

export function PolishStyle() { return <style>{POLISH_CSS}</style>; }
