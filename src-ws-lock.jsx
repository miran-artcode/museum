/* ============================================================
   학습지 입력 잠금 (2026-09-28)
   이론 평가를 앞두고 교사가 켜면 학생 화면의 학습지 입력칸이 모두 잠긴다.
   강의 노트·수업 자료·이미 쓴 기록은 그대로 보이고, 강의 노트를 읽은 시간(_act)도 계속 쌓인다.

   · 설정: meta/config.v.wsLock (true면 잠금), wsLockUpdated (마지막으로 켜거나 끈 시각)
   · 학생 화면: StudentApp이 WsLockCtx로 값을 내리고, SectionCard가 입력 부분을 LockSet(fieldset)으로 감싼다.
     fieldset disabled는 안쪽의 input·textarea·select·button을 한꺼번에 막으므로 칸 종류가 늘어도 따로 손댈 일이 없다.
     폼 요소가 아닌 스케치 캔버스는 CSS로 포인터를 막는다. setField도 잠금 중에는 아무것도 쓰지 않는다(이중 장치).
   · LockSet은 잠금과 상관없이 늘 fieldset을 그린다. 잠글 때 요소 종류가 바뀌면 안쪽 칸이 다시 마운트되어
     저장 전 스케치 획처럼 칸 안에만 있던 상태가 사라진다.
   · 카드 밖에 그리는 수업 자료(탐구 질문 자료 묶음·단계 표시줄·앞 차시에서 가져온 것)는 감싸지 않는다.
     칸 안에 붙은 자료(캡션 두 장 비교)는 펼친 채로 보이고 접기 버튼만 잠긴다. 「처음 쓴 답 보기」도 함께 잠긴다.
   · 설문·최종 평가·쪽지시험은 각자의 열기·닫기 설정을 따르며 이 잠금과 무관하다. 쪽지시험은 잠근 채로 치른다.
   · 서버 규칙으로는 막지 않는다. 학생 저장마다 설정 문서를 한 번 더 읽어야 하고, 규칙을 에뮬레이터로 시험할 수 없어
     수업 중 저장 전체를 막는 사고의 위험이 더 크다. 대신 교사 카드가 잠근 뒤에 칸을 고친 학번(_t 시각)을 보여 준다.
   ============================================================ */
import React, { useContext, useLayoutEffect, useRef } from "react";
import { fbStore } from "./src-fb.js";

const now = () => new Date().toISOString();

export const wsLockOn = (cfg) => !!(cfg && cfg.wsLock === true);

/* 학생 화면 전체에 잠금 여부를 내린다. 기본값 false: 교사 화면의 미리 보기 같은 다른 곳은 잠기지 않는다 */
export const WsLockCtx = React.createContext(false);
/* 기록지가 서버에 저장된 상태인가(StudentApp이 내린다). 디지털 에스키스가 앞 저장본의 그림 문서를 지울 때를 정한다:
   새 값이 서버에 저장되기 전에 옛 문서를 지우면, 그 사이 창이 닫혔을 때 서버의 값이 없는 문서를 가리킨다.
   기본값 true: 기록지 저장과 무관한 곳(교사 미리 보기 등)에서는 바로 지운다 */
export const WsSavedCtx = React.createContext(true);

/* field-sizing을 지원하지 않는 브라우저(파이어폭스·옛 사파리)에서는 잠긴 글상자를 글 길이만큼 늘린다.
   잠긴 글상자는 스크롤이 되지 않는 브라우저가 있어 긴 답의 뒷부분을 못 읽는다 */
const FIT_BY_CSS = typeof CSS !== "undefined" && !!CSS.supports && CSS.supports("field-sizing", "content");

export function LockSet({ tag, children }) {
  const locked = useContext(WsLockCtx);
  const ref = useRef(null);
  useLayoutEffect(() => {
    if (FIT_BY_CSS || !ref.current) return;
    ref.current.querySelectorAll("textarea").forEach((t) => {
      if (locked) {
        t.style.height = "auto";
        if (t.scrollHeight > 0) { t.style.height = t.scrollHeight + 2 + "px"; t.dataset.wsFit = "1"; }
        else t.style.height = "";
      } else if (t.dataset.wsFit) {
        t.style.height = "";
        delete t.dataset.wsFit;
      }
    });
  });
  return (
    <fieldset ref={ref} className="ws-lockset" disabled={locked}>
      {locked && tag && <legend className="ws-lock-tag">입력 잠김</legend>}
      {children}
    </fieldset>
  );
}

/* 학생 화면 맨 위의 안내. 학생 화면에는 긴 안내문을 두지 않는다 */
export function WsLockNote() {
  return (
    <div className="ok-note ws-lock-note" role="status">
      <b>입력 잠금</b> 선생님이 학습지 입력을 잠갔습니다. 강의 노트와 내가 쓴 기록은 볼 수 있습니다.
    </div>
  );
}

/* 잠근 뒤에 칸을 고친 학번. 칸을 고칠 때마다 쓰는 _t[섹션].last(학생 기기 시각)를 잠근 시각과 견준다.
   잠금이 들어 있지 않은 옛 화면(새 버전을 올리기 전부터 열어 둔 창)으로 고친 경우를 잡으려는 것이다.
   학생 기기 시계가 조금 빠를 수 있어 2분의 여유를 둔다 */
export function editedSince(ids, wsMap, sinceIso) {
  const t0 = Date.parse(sinceIso || "");
  if (!Number.isFinite(t0)) return [];
  return ids.filter((id) => {
    const t = ((wsMap && wsMap[id]) || {})._t || {};
    return Object.keys(t).some((k) => t[k] && Date.parse(t[k].last) > t0 + 120000);
  });
}

const fmtAt = (iso) => {
  const d = new Date(iso || "");
  if (isNaN(d)) return "";
  const p = (n) => String(n).padStart(2, "0");
  return (d.getMonth() + 1) + "월 " + d.getDate() + "일 " + p(d.getHours()) + ":" + p(d.getMinutes());
};

/* 교사 「차시 공개」 탭의 카드 */
export function WsLockCard({ cfgAll, setCfgAll, setMsg, ids, roster, wsMap, sampleMode }) {
  const on = wsLockOn(cfgAll);
  const at = cfgAll && cfgAll.wsLockUpdated;
  const toggle = async () => {
    const next = !on;
    const stamp = now();
    const ok = await fbStore.setT("config", { wsLock: next, wsLockUpdated: stamp }, { merge: true });
    if (ok) {
      setCfgAll({ ...(cfgAll || {}), wsLock: next, wsLockUpdated: stamp });
      setMsg(next
        ? "학습지 입력을 잠갔습니다. 접속 중인 학생 화면에 바로 반영됩니다."
        : "학습지 입력 잠금을 풀었습니다. 학생이 다시 쓸 수 있습니다.");
    } else setMsg("설정 저장에 실패했습니다.");
  };
  const late = on && !sampleMode ? editedSince(ids || [], wsMap, at) : [];
  return (
    <div className="card">
      <div className="card-head"><span className="card-code">잠금</span><span className="card-title">학습지 입력 잠금</span></div>
      <div className="card-body">
        <p style={{ fontSize: 13, marginBottom: 12 }}>
          켜면 모든 차시의 학습지 입력칸이 잠깁니다. 학생은 열린 차시의 <b>강의 노트와 수업 자료, 이미 쓴 기록을 볼 수 있지만</b> 고치거나 새로 쓸 수 없습니다.
          이론 평가를 앞두고 복습하는 기간에 켜 둡니다.
        </p>
        <div className="tbl-scroll"><table className="roster">
          <thead><tr><th>설정</th><th>학생이 보는 것</th><th style={{ width: 110 }}>상태</th></tr></thead>
          <tbody>
            <tr>
              <td>입력 잠금</td>
              <td style={{ fontSize: 12 }}>
                화면 위에 「선생님이 학습지 입력을 잠갔습니다」 안내가 뜨고, 학습지 카드마다 「입력 잠김」 표시와 함께 입력칸과 버튼이 비활성화됩니다.
              </td>
              <td>
                <div className="seg">
                  <button className={on ? "on-ok" : ""} onClick={() => { if (!on) toggle(); }}>켬</button>
                  <button className={!on ? "on-no" : ""} onClick={() => { if (on) toggle(); }}>끔</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table></div>
        {on && at && (
          <p className={late.length ? "warn-note" : "hint"} style={{ marginTop: 10 }}>
            {fmtAt(at)}부터 잠겨 있습니다.{" "}
            {late.length
              ? "그 뒤에 학습지를 고친 기록이 있는 학생 " + late.length + "명: " +
                late.map((id) => id + (roster && roster[id] && roster[id].nick ? "(" + roster[id].nick + ")" : "")).join(", ") +
                ". 잠그기 전부터 열어 둔 화면일 수 있으니 새로고침을 안내합니다."
              : "그 뒤에 학습지를 고친 학생은 없습니다."}
          </p>
        )}
        <p className="hint" style={{ marginTop: 10 }}>
          닫힌 차시는 잠금과 상관없이 보이지 않습니다. 지난 차시를 모두 복습하게 하려면 위의 「모두 열기」를 함께 누릅니다.
        </p>
        <p className="hint" style={{ marginTop: 6 }}>
          잠그는 순간 학생이 쓰던 내용은 저장된 뒤 잠깁니다. 강의 노트를 읽은 시간은 잠긴 동안에도 계속 기록됩니다.
          설문·최종 평가·쪽지시험은 각자의 열기와 닫기를 따르므로, 쪽지시험은 잠금을 켠 채로 치를 수 있습니다.
        </p>
        <p className="hint" style={{ marginTop: 6 }}>
          학생 화면에서 막는 잠금입니다. 이 기능을 올리기 전부터 켜 둔 창에는 적용되지 않으므로, 처음 켤 때는 학생에게 새로고침을 안내합니다.
        </p>
      </div>
    </div>
  );
}

export const WS_LOCK_CSS = `
.ws-lockset{border:0;margin:0;padding:0;min-width:0}
.ws-lockset>legend.ws-lock-tag{float:none;display:inline-block;margin:0 0 10px;padding:2px 8px;border:1px dashed var(--line);background:var(--card2);color:var(--sub);font-family:var(--sans);font-size:12px;font-weight:700;letter-spacing:0}
.ws-lockset:disabled input,.ws-lockset:disabled textarea,.ws-lockset:disabled select{background:var(--card2);color:var(--ink);-webkit-text-fill-color:var(--ink);opacity:1;cursor:not-allowed}
.ws-lockset:disabled ::placeholder{color:transparent;-webkit-text-fill-color:transparent}
.ws-lockset:disabled textarea{field-sizing:content;min-height:2.6em;resize:none}
.ws-lockset:disabled button{cursor:not-allowed}
.ws-lockset:disabled button:not(.on):not(.on-ok):not(.on-no):not(.on-mid){opacity:.6}
.ws-lockset:disabled canvas{pointer-events:none}
.ws-lock-note{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;margin:14px 0 0}
.ws-lock-note b{white-space:nowrap}
`;

export function WsLockStyle() {
  return <style>{WS_LOCK_CSS}</style>;
}
