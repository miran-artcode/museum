/* ============================================================
   쪽지시험 학생별 조정 — 구독과 쓰기 (계산과 이유는 src-quiz-acc.mjs 머리 주석)
   · 교사: quizAcc 컬렉션 전체를 구독하고(useQuizAccAll), 한 학생 값을 쓰며(saveQuizAcc),
           탭이 열리면 설정의 옛 맵을 옮기고 비운다(useQuizAccMigrate).
   · 학생: 자기 문서 하나만 구독하고(useQuizAccMine), 시작 순간에는 서버 값을 다시 읽는다(readQuizAcc).
   규칙(firestore.rules /quizAcc)이 본인과 교사만 읽게 하므로 보기 전용 계정과 다른 학생은 구독하지 않는다.
   ============================================================ */

import { useState, useEffect, useRef } from "react";
import { fbStore, isViewerNow } from "./src-fb.js";
import { accKey, normAcc, migrateEntries, accWrite } from "./src-quiz-acc.mjs";

export { withAcc, legacyHas } from "./src-quiz-acc.mjs";

/* 교사: { map: { 학번: { timeMult, noImage } }, got: 첫 응답을 받았는가 } */
export function useQuizAccAll(enabled) {
  const [st, setSt] = useState({ map: {}, got: false });
  useEffect(() => {
    if (!enabled || isViewerNow() || typeof fbStore.watchCollection !== "function") return undefined;
    const off = fbStore.watchCollection("quizAcc", (m) => {
      const map = {};
      Object.keys(m || {}).forEach((id) => { map[id] = normAcc(m[id]); });
      setSt({ map, got: true });
    }, () => {});
    return () => { try { if (typeof off === "function") off(); } catch (e) {} };
  }, [enabled]);
  return st;
}

/* 학생: 자기 문서가 있으면 { [학번]: 값 }, 없으면 {} */
export function useQuizAccMine(sid, enabled) {
  const [m, setM] = useState({});
  useEffect(() => {
    if (!enabled || !sid) return undefined;
    const off = fbStore.watchDoc(accKey(sid), (v) => setM(v ? { [sid]: normAcc(v) } : {}));
    return () => { try { if (typeof off === "function") off(); } catch (e) {} };
  }, [sid, enabled]);
  return m;
}

/* 시작 순간의 서버 값. 문서가 없으면 {}, 읽지 못하면 null (부른 쪽은 구독 값으로 진행한다) */
export async function readQuizAcc(sid) {
  if (typeof fbStore.getSafe !== "function") return null;
  const r = await fbStore.getSafe(accKey(sid));
  if (!r || !r.ok) return null;
  return r.data ? { [sid]: normAcc(r.data) } : {};
}

/* 교사가 한 학생의 값을 바꾼다. 성공하면 true */
export async function saveQuizAcc(sid, cur, patch, legacy) {
  const w = accWrite(cur, patch, legacy);
  const ok = w.op === "remove" ? await fbStore.remove(accKey(sid)) : await fbStore.set(accKey(sid), w.value);
  return ok !== false;
}

/* 교사 화면: 설정의 옛 맵(cfgRaw.timeMult·noImage)에 키가 있으면 quizAcc 로 옮기고 두 맵을 비운다.
   quizAcc 구독의 첫 응답을 받은 뒤에 한다(이미 있는 문서를 옛 값으로 덮지 않도록). 실패하면 다음 변화 때 다시 한다 */
export function useQuizAccMigrate({ enabled, cfgRaw, acc, onNote }) {
  const busy = useRef(false);
  const noteRef = useRef(onNote);
  noteRef.current = onNote;
  const tm = (cfgRaw && cfgRaw.timeMult) || {};
  const ni = (cfgRaw && cfgRaw.noImage) || {};
  const sig = JSON.stringify([tm, ni]);
  useEffect(() => {
    if (!enabled || isViewerNow() || !acc || !acc.got || busy.current) return;
    const { write, clear } = migrateEntries({ timeMult: tm, noImage: ni }, acc.map);
    if (!clear) return;
    busy.current = true;
    (async () => {
      const ids = Object.keys(write);
      const res = await Promise.all(ids.map((id) => fbStore.set(accKey(id), write[id])));
      const cleared = res.every((x) => x !== false)
        ? await fbStore.updatePaths("config", [[["quiz", "timeMult"], {}], [["quiz", "noImage"], {}]])
        : false;
      busy.current = false;
      if (noteRef.current) {
        noteRef.current(cleared === true
          ? { kind: "ok", text: "학생별 시간 배수·이미지 제외" + (ids.length ? " " + ids.length + "명의 값" : "") + "을 학생끼리 볼 수 없는 저장 위치로 옮겼습니다." }
          : { kind: "warn", text: "학생별 시간 배수·이미지 제외를 학생끼리 볼 수 없는 저장 위치로 옮기지 못했습니다. 연결을 확인하고 이 탭을 다시 여세요." });
      }
    })();
  }, [enabled, acc && acc.got, acc && acc.map, sig]);
}
