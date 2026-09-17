/* ============================================================
   UI/UX 보정 계층 (2026-09-17 검토 반영)
   · 학습지 질문(라벨)의 위계, 11px 이하 글자, 한글에 걸린 모노스페이스·자간 정리
   · 차시 탭 줄의 가로 스크롤 단서, 전시장 폰 화면의 고정 제어 줄 축소
   · 되돌릴 수 없는 제출·확정에 쓰는 두 단계 버튼(ConfirmButton) — window.confirm 대체
   · 같은 탭에서 새로고침·뒤로 가기 했을 때 화면을 되살리는 sessionStorage 표
   · 교사 탭 12개를 네 묶음으로 나눠 그리는 TeacherTabs
   App이 마지막 <style>로 얹으므로 같은 특이도의 규칙은 이 파일이 이긴다.
   컴포넌트 안에서 <style>을 찍는 모듈(전시 예시·게이트)은 특이도를 한 단계 올려 덮는다.
   ============================================================ */
import React, { useState } from "react";

export const UX_CSS = `
/* ---------- 학습지 질문은 라벨이 아니라 본문이다 ---------- */
.card-body .field > label,.q-head label{font-size:14px;color:var(--ink);line-height:1.6}
.card-body .field > label{margin-bottom:6px}

/* ---------- 11px 이하 글자를 폰에서 읽히는 크기로 ---------- */
.hint{font-size:12px}
.card-note{font-size:13px}
.gate-note,.lesson-guide,.read-block .rl,.debate-l{font-size:12px}
.reading-in p{font-size:14px}
.save-pill,.prog-num{font-size:12px}
.stage-tag{font-size:11px;padding:2px 7px}

/* ---------- 한글이 들어가는 자리에서 모노스페이스 글꼴과 자간을 뺀다 ----------
   IBM Plex Mono에 한글이 없어 대체 글꼴로 떨어지고, 자간 .1em이 그대로 걸려
   「배 움  확 인  1」처럼 벌어져 보였다. 숫자·영문만 있는 자리(시각, 비율, 코드)는 그대로 둔다. */
.card-code,.card-sess,.lesson-n,.prog-num,.sess-tab .lock,.save-pill,.q-type,.prev-l,.mm-load,
.think-steps .ts-t,.pair-dim,.pair-where,.std-chip,.works-tbl caption,.stage-tag,
.gal-when,.work-img .ph,.work-no,.plate.hidden-plate,.grade-row .g-std,
.ld-step .k,.ld-step .hw,.carry b,.carry .cr .l,.hw-chip,.tf .tf-l,.tf-sub,.sum-box .h,.stmt-prev b,
.stmt-tpl small,.stmt-vers .v .n,.conc-chip,.pc-tag,.pc-from,.risk-echo b,.obs-echo b,
.inq-acc,.inq-tv b,.as-work-h,.as-lab,.as-plate-hidden,.as-tag,
.qz-item-n,.qz-cover-k,.qz-path-k,.qz-tag,.st-sec-n,.an-plate-hidden,
.lz-notice-tag,.lz-asks-h,.ed-qtype,.exs .exs-head .exs-acc,.exs .exs-meta{font-family:var(--sans);letter-spacing:0}
.card-sess,.q-type,.prev-l,.think-steps .ts-t,.pair-dim,.pair-where,.std-chip,.works-tbl caption,
.ld-step .k,.carry b,.hw-chip,.stmt-tpl small,.stmt-vers .v .n,.conc-chip,.pc-tag,.risk-echo b,.obs-echo b{font-size:11px}
.card-code,.lesson-n,.pair-dim,.carry b,.q-type,.prev-l,.think-steps .ts-t,.risk-echo b,.obs-echo b,
.sum-box .h,.stmt-prev b,.tf .tf-l,.tf-sub,.lz-notice-tag,.lz-asks-h,.inq-acc,.as-lab,.qz-item-n,.work-no{font-weight:700}
.plate.hidden-plate,.as-plate-hidden,.an-plate-hidden{font-size:12px}

/* ---------- 차시 탭 줄: 폰에서는 스크롤바를 보여 밀 수 있음을 알린다 ---------- */
@media(pointer:coarse){
  .sess-tabs{scrollbar-width:thin;scrollbar-color:#bbb transparent;padding-bottom:12px}
  .sess-tabs::-webkit-scrollbar{display:block;height:3px}
  .sess-tabs::-webkit-scrollbar-thumb{background:#bbb}
}
/* 최종 평가·쪽지시험이 열렸을 때 탭 줄 위에 뜨는 이동 안내 */
.stage-open{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:14px 0 0}
.stage-open span{flex:1;min-width:180px}

/* ---------- 강의 노트의 「모두 펼치기」가 두 줄로 꺾이지 않게 ---------- */
.lesson-body .btn.small{white-space:nowrap}

/* ---------- 전시장: 폰에서는 고정 제어 줄을 두 줄로 줄인다 (30초마다 자동 갱신되므로 갱신 시각은 접는다) ---------- */
@media(max-width:560px){
  .gal-when{display:none}
  .gal-controls{margin:12px 0 18px;padding:6px 0;gap:6px}
  .gal-controls .toggle-row{width:100%}
  .gal-controls .toggle-row button{flex:1;padding:8px 6px;font-size:12.5px}
  .gal-tools,.gal-find{width:100%}
}
/* 학급 작품이 있을 때 예시 구간을 접어 두는 상자 */
.gal-samples{border:1px dashed var(--line);margin-bottom:22px}
.gal-samples > summary{cursor:pointer;padding:10px 14px;font-size:13px;color:var(--sub);list-style:none;display:flex;gap:8px;align-items:center}
.gal-samples > summary::before{content:"＋";color:var(--seal)}
.gal-samples[open] > summary::before{content:"－"}
.gal-samples[open] > summary{border-bottom:1px dashed var(--line);margin-bottom:18px}
.gal-samples .exs{padding:0 14px}

/* ---------- 입장 화면: 폰에서는 영문 스트립을 접는다 (주 내비게이션과 목적지가 같다) ---------- */
@media(max-width:700px){.g4 .g4-strip{display:none}}

/* ---------- 두 단계 확인 버튼 ---------- */
.cfm{display:inline-flex;gap:8px;align-items:center;flex-wrap:wrap;border:1px solid var(--seal);background:var(--seal-bg);padding:8px 10px;max-width:100%}
.cfm-q{font-size:13px;color:var(--ink);line-height:1.5}

/* ---------- 교사 탭 묶음 ---------- */
.t-groups{gap:10px 18px;align-items:flex-start}
.t-group{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:6px 0 6px 10px;border-left:2px solid var(--line)}
.t-group-l{font-size:11px;color:var(--sub);white-space:nowrap;margin-right:2px}
`;

export function UxStyle() { return <style>{UX_CSS}</style>; }

/* 되돌릴 수 없는 제출·확정에 쓴다. 첫 클릭에 그 자리에서 한 번 더 묻고, 두 번째 클릭에 실행한다.
   window.confirm은 폰에서 맥락을 가리고, 브라우저가 「추가 대화 상자 차단」을 걸면 이후 확인이 자동 취소되어 흐름이 막힌다.
   precheck: 묻기 전에 검사할 함수. false를 돌려주면 묻지 않는다(빈 칸 안내는 호출 쪽이 띄운다). */
export function ConfirmButton({ label, ask, onConfirm, precheck, disabled, className = "btn", yes = "확인", no = "취소" }) {
  const [armed, setArmed] = useState(false);
  if (armed && !disabled) {
    return (
      <span className="cfm" role="group" aria-label={ask}>
        <span className="cfm-q">{ask}</span>
        <button type="button" className="btn small seal" onClick={() => { setArmed(false); onConfirm(); }}>{yes}</button>
        <button type="button" className="btn small ghost" onClick={() => setArmed(false)}>{no}</button>
      </span>
    );
  }
  return (
    <button type="button" className={className} disabled={disabled}
      onClick={() => { if (precheck && precheck() === false) return; setArmed(true); }}>{label}</button>
  );
}

/* 같은 탭 안의 새로고침·뒤로 가기에서 화면을 되살리는 표.
   sessionStorage라 탭을 닫으면 사라진다: 공용 컴퓨터에서 다음 학생이 앞 학생의 기록지로 들어가는 일은 생기지 않는다.
   되살릴 때는 Firebase 인증의 현재 계정과 학번이 맞는지 App에서 대조한다. */
const SESSION_KEY = "museum:session";
export const session = {
  save(v) { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(v)); } catch (e) {} },
  read() { try { const s = sessionStorage.getItem(SESSION_KEY); return s ? JSON.parse(s) : null; } catch (e) { return null; } },
  clear() { try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {} },
};

/* 교사 화면 탭. 이름은 TeacherApp의 분기 문자열과 같아야 한다. */
export const TEACHER_TAB_GROUPS = [
  { name: "수업 운영", tabs: ["현황", "차시 공개", "수업 안내", "수업 편집"] },
  { name: "학생 기록", tabs: ["기록 현황", "사고 과정", "창의성", "설문"] },
  { name: "평가", tabs: ["상호평가", "쪽지시험"] },
  { name: "연구·설정", tabs: ["연구", "설정"] },
];

export function TeacherTabs({ tab, onSwitch, dirty }) {
  return (
    <div className="t-tabs t-groups">
      {TEACHER_TAB_GROUPS.map((g) => (
        <div className="t-group" key={g.name}>
          <span className="t-group-l">{g.name}</span>
          {g.tabs.map((t) => (
            <button key={t} className={"btn small " + (tab === t ? "" : "ghost")} aria-pressed={tab === t} onClick={() => onSwitch(t)}>
              {t}{t === "수업 편집" && dirty ? " ●" : ""}
            </button>
          ))}
        </div>
      ))}
    </div>
  );
}
