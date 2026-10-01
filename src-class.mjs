/* 학번에서 학급을 뽑는 공용 규칙 (상호평가 명단·연구 지표·CSV의 학급 열이 함께 쓴다).
   다섯 자리 학번(학년 1자리 + 반 2자리 + 번호 2자리)이면 가운데 두 자리가 반이다: 29901 → "99".
   그 밖의 형식(시험 계정·오입력: 000, 2023, 840909 등)은 UNKNOWN_CLASS 한 묶음으로 둔다.
   교사가 설정(config.classMap = { 학번: "04" })에 반을 지정하면 그 값이 먼저다. */

export const UNKNOWN_CLASS = "?";

export function classOf(sid, classMap) {
  const s = String(sid == null ? "" : sid).trim();
  const o = classMap && classMap[s];
  if (o != null && String(o).trim()) return String(o).trim().padStart(2, "0");
  return /^\d{5}$/.test(s) ? s.slice(1, 3) : UNKNOWN_CLASS;
}

/* 학번 목록을 { 반: [학번…] }으로 묶는다. 반 안의 순서는 입력 순서를 따른다 */
export function groupByClass(ids, classMap) {
  const out = {};
  (ids || []).forEach((id) => {
    const c = classOf(id, classMap);
    (out[c] = out[c] || []).push(id);
  });
  return out;
}

/* 반 목록을 정렬해 돌려준다 (미상은 맨 뒤) */
export function classList(ids, classMap) {
  return Object.keys(groupByClass(ids, classMap)).sort((a, b) => {
    if (a === UNKNOWN_CLASS) return 1;
    if (b === UNKNOWN_CLASS) return -1;
    return a.localeCompare(b, "ko", { numeric: true });
  });
}

/* 화면 표기: "04" → "4반", 미상 → "학급 미상" */
export function classLabel(cls) {
  if (cls === UNKNOWN_CLASS || cls == null || cls === "") return "학급 미상";
  const n = Number(cls);
  return Number.isFinite(n) ? n + "반" : String(cls) + "반";
}
