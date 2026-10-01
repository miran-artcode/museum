/* ============================================================
   쪽지시험 학생별 조정(시간 배수·이미지 문항 제외)의 저장 위치
   ------------------------------------------------------------
   왜 옮겼나 (2026-10-01)
     처음에는 학급 설정 meta/config 의 quiz.timeMult·quiz.noImage 에 { 학번: 값 } 맵으로 두었다.
     그 문서는 학급 구성원 모두가 읽으므로(규칙 member()) 학생이 누가 시간 1.5·2배나 이미지 문항 제외를
     받는지 볼 수 있었다. 이런 조정은 장애나 학습 지원 여부를 짐작하게 하는 정보다.
     그래서 학생마다 문서 하나 quizAcc/{학번} = { v: { timeMult, noImage } } 로 옮겼다.
     규칙상 본인과 교사만 읽고 교사만 쓴다.

   이행
     · 화면은 설정의 옛 맵 위에 quizAcc 를 덮어 읽는다(withAcc, quizAcc 가 우선).
     · 교사 「쪽지시험」 탭이 열리면 옛 맵의 값을 quizAcc 로 옮긴 뒤 설정의 두 맵을 비운다(migrateEntries).
     · 규칙의 제한 시간 계산(quizWithinTime)도 quizAcc 를 먼저 읽고, 없으면 옛 맵을 읽는다.
     · 응시 문서 v.timeMult·v.noImage(시작 때 고정)와 src-quiz-core.mjs 의 계산은 그대로다.

   이 파일은 계산만 한다(React·Firebase 없음). 구독과 쓰기는 src-quiz-acc.jsx 에 있다.
   ============================================================ */

export const ACC_MULTS = [1, 1.5, 2];   // src-quiz-teacher.jsx MULTS 와 같은 값

export const accKey = (sid) => "quizAcc:" + String(sid);

const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);

/* 값 하나를 정리한다. 허용되지 않는 배수는 1, 제외는 참·거짓 */
export function normAcc(x) {
  const t = Number(x && x.timeMult);
  return { timeMult: ACC_MULTS.includes(t) ? t : 1, noImage: !!(x && x.noImage) };
}

export const isDefaultAcc = (a) => {
  const n = normAcc(a);
  return n.timeMult === 1 && !n.noImage;
};

/* 설정의 옛 맵에 그 학번 키가 있는가 */
export const legacyHas = (cfg, sid) => own(cfg && cfg.timeMult, sid) || own(cfg && cfg.noImage, sid);

/* accMap = { 학번: { timeMult, noImage } } 을 cfg 의 옛 맵 위에 덮어쓴 새 cfg 를 돌려준다(원본은 그대로).
   quizAcc 에 문서가 있는 학번은 그 값이 이긴다. 문서가 없는 학번은 옛 맵 값을 그대로 둔다 */
export function withAcc(cfg, accMap) {
  const c = cfg || {};
  const ids = Object.keys(accMap || {});
  if (!ids.length) return c;
  const timeMult = { ...(c.timeMult || {}) };
  const noImage = { ...(c.noImage || {}) };
  ids.forEach((id) => {
    const a = normAcc(accMap[id]);
    timeMult[id] = a.timeMult;
    noImage[id] = a.noImage;
  });
  return { ...c, timeMult, noImage };
}

/* 설정의 옛 맵에서 quizAcc 로 옮길 항목.
   · 이미 quizAcc 에 문서가 있는 학번은 건드리지 않는다(나중에 고친 값이 우선).
   · 기본값(배수 1·제외 아님)뿐인 학번은 옮기지 않는다.
   · clear: 옛 맵에 키가 하나라도 있으면 참. 값이 1·false 여도 키가 남아 있으면 「한때 조정을 받은 학번」이 드러나므로 비운다 */
export function migrateEntries(cfg, accMap) {
  const c = cfg || {};
  const tm = c.timeMult || {};
  const ni = c.noImage || {};
  const ids = [...new Set([...Object.keys(tm), ...Object.keys(ni)])].sort();
  const write = {};
  ids.forEach((id) => {
    if (own(accMap, id)) return;
    const a = normAcc({ timeMult: tm[id], noImage: ni[id] });
    if (!isDefaultAcc(a)) write[id] = a;
  });
  return { write, clear: ids.length > 0 };
}

/* 교사가 한 학생의 값을 바꿀 때 할 일.
   cur: 지금 보이는 값, patch: 바꾼 값, legacy: 설정의 옛 맵에 그 학번 키가 남아 있는가.
   기본값으로 돌아가면 문서를 지운다. 단 옛 맵에 키가 남아 있으면(이행 전) 지우면 옛 값이 다시 살아나므로 기본값을 그대로 쓴다 */
export function accWrite(cur, patch, legacy) {
  const value = normAcc({ ...normAcc(cur), ...(patch || {}) });
  return { op: isDefaultAcc(value) && !legacy ? "remove" : "set", value };
}
