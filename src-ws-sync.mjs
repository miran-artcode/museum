/* ============================================================
   기록지 칸 단위 저장과 다른 기기 기록 받기 (2026-09-17)
   ------------------------------------------------------------
   왜 바꿨나
     기록지는 worksheets/{학번} 문서 하나이고, 자동 저장이 문서를 통째로 덮어썼다.
     탭을 둘 열거나(읽기 자료 탭과 기록지 탭) 학교 PC와 집 폰을 오가면, 옛 사본을 든 탭이
     활동 시간 저장(2분 30초마다)이나 한 글자 입력으로 다른 탭이 쓴 내용 전체를 지웠다.
     2026-09-17 4반 기록에서 「활동 시간은 길고 편집 기록은 없는」 그 흔적이 여럿 나왔다.

   어떻게 바꿨나
     ① 저장은 바뀐 키만 updateDoc으로 보낸다 (fbStore.updateFields). 다른 탭이 쓴 키는 건드리지 않는다.
        키 이름에 점이 있어(l1.q1) FieldPath로 가리킨다. 문서가 아직 없을 때(첫 저장)만 통째로 만든다.
     ② 자기 기록지를 구독해(fbStore.watchDocMeta) 다른 기기가 쓴 값을 화면에 받는다.
        지금 이 탭이 고치는 중이거나 저장 중인 키는 서버 값으로 덮지 않는다.
     ③ 교사가 「기록 되돌리기」로 문서를 통째로 쓰면 학생 화면도 그 내용을 받는다.

   이 파일은 순수 함수만 둔다 (React·Firebase 없음). 테스트: src-ws-sync.test.mjs
   ============================================================ */

/* 고치는 중(dirty)과 저장 중(inflight)인 키를 따로 센다.
   take(): dirty → inflight (저장 시작)  done(): inflight 비움 (성공)  fail(): inflight → dirty (실패, 다시 저장) */
export function makeDirtyTracker() {
  const dirty = new Set();
  const inflight = new Set();
  return {
    mark(keys) { for (const k of keys || []) dirty.add(k); },
    take() { const out = [...dirty]; for (const k of out) { inflight.add(k); } dirty.clear(); return out; },
    done() { inflight.clear(); },
    fail() { for (const k of inflight) dirty.add(k); inflight.clear(); },
    has(k) { return dirty.has(k) || inflight.has(k); },
    all() { return new Set([...dirty, ...inflight]); },
    clear() { dirty.clear(); inflight.clear(); },
    get size() { return dirty.size; },
  };
}

/* 두 기록지 객체에서 값이 달라진 최상위 키 (참조가 다르면 다른 것으로 본다: setField는 바꾼 키에만 새 값을 넣는다) */
export function changedKeys(before, after) {
  const a = before || {}, b = after || {};
  const out = [];
  for (const k of Object.keys(b)) if (b[k] !== a[k]) out.push(k);
  for (const k of Object.keys(a)) if (!(k in b)) out.push(k);
  return out;
}

const same = (x, y) => {
  if (x === y) return true;
  if (x == null || y == null) return false;
  if (typeof x !== "object" || typeof y !== "object") return false;
  try { return JSON.stringify(x) === JSON.stringify(y); } catch (e) { return false; }
};

/* 서버 사본을 화면에 합친다. skip에 든 키(고치는 중·저장 중)는 이 탭의 값을 지킨다.
   바뀐 것이 없으면 같은 객체(local)를 그대로 돌려줘 다시 그리지 않게 한다.
   서버에 없는 키는 skip이 아니면 지운다 (교사가 옛 시점으로 되돌렸을 때 그 뒤에 생긴 칸도 함께 사라져야 맞다). */
export function mergeRemote(local, remote, skip) {
  const l = local || {}, r = remote || {};
  const keep = skip || new Set();
  const out = {};
  let changed = false;
  for (const k of Object.keys(r)) {
    if (keep.has(k)) { if (k in l) out[k] = l[k]; continue; }
    out[k] = r[k];
    if (!same(l[k], r[k])) changed = true;
  }
  for (const k of Object.keys(l)) {
    if (k in r) continue;
    if (keep.has(k)) { out[k] = l[k]; continue; }
    changed = true; // 서버에서 사라진 키
  }
  return changed ? out : l;
}

/* 저장할 조각: 고치던 키 + 저장 직전에 바뀐 보조 키(_act·_updatedAt·덜어 낸 _log 등).
   값이 undefined인 키는 지우라는 뜻 (fbStore.updateFields가 deleteField로 바꾼다) */
export function buildPatch(before, data, dirtyList) {
  const keys = new Set(dirtyList || []);
  for (const k of changedKeys(before, data)) keys.add(k);
  const patch = {};
  for (const k of keys) patch[k] = data[k];
  return patch;
}
