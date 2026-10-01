/* ============================================================
   3D·AR 전시 — 화면과 Firebase에 기대지 않는 순수 함수

   무엇을 하는가
     · 전시 후보 만들기: 명부·기록지·최종 제출에서 걸 수 있는 작품과 걸 수 없는 이유를 가른다
       (학생이 「전시 공개」를 고른 작품만, 확정 제출이 있으면 그 사본을, 없으면 기록지 초안을 쓴다)
     · 전시 초안: 말하는 태도(고발·경고·공감·기록·질문)를 구역으로, 7차시 진열 방식을 진열 형식으로 옮긴다.
       이미 게시한 전시가 있으면 교사가 고친 구역·형식·순서·제외를 그대로 이어받는다
     · 전시관 평면: 구역별로 벽면·진열장 위치와 관람 시점을 계산한다 (src-ar3d.js가 이 평면을 그대로 짓는다)

   전시 문서(misc/arExpo)는 로그인한 사람이 읽고 교사만 쓴다. 학생 화면은 기록지를 읽지 못하므로
   교사가 게시할 때 작품 캡션을 이 문서에 복사해 둔다.
   ============================================================ */

import { submissionFromWs } from "./src-assess-core.mjs";

export const EXPO_VER = 1;
export const EXPO_KEY = "arExpo";
export const DEFAULT_NOTICE = "이 이미지는 생성형 AI로 제작한, 실재한 적 없는 유물입니다.";
/* 1차 관람과 AR 모델 받침에 늘 붙는 고지. 학생이 쓴 고지 문구는 2차 관람에서 보인다 */
export const BASE_NOTICE = "생성형 AI로 만든, 실재한 적 없는 유물";

/* 진열 형식 — 7차시 진열 방식 다섯 가지를 전시관의 설비로 옮긴 것 */
export const FIXTURES = [
  { k: "wall", label: "벽면 단독", place: "wall", desc: "한 점에 시선을 모은다. 넓은 여백과 조명" },
  { k: "series", label: "벽면 계열", place: "wall", desc: "같은 높이·같은 간격으로 나란히 걸어 반복에서 구조를 읽게 한다" },
  { k: "table", label: "평판 진열장", place: "floor", desc: "발굴 파편처럼 유리 아래 눕혀 잃어버린 전체를 상상하게 한다" },
  { k: "case", label: "입식 진열장", place: "floor", desc: "분류표와 함께 유리장 안에 세워 분류 행위 자체를 보이게 한다" },
  { k: "plinth", label: "좌대", place: "floor", desc: "복원선을 둘러 손질의 경계를 공개한다" },
];
export const FIXTURE_KEYS = FIXTURES.map((f) => f.k);
export const fixtureInfo = (k) => FIXTURES.find((f) => f.k === k) || FIXTURES[0];
export const MODE_TO_FIXTURE = { "단독": "wall", "계열": "series", "파편": "table", "오분류": "case", "복원 표시": "plinth" };
export const fixtureOfMode = (mode) => MODE_TO_FIXTURE[String(mode || "").trim()] || "wall";
export const isWallFixture = (k) => fixtureInfo(k).place === "wall";

export const UNSORTED = "미분류";

const trimStr = (v) => (v == null ? "" : String(v).trim());

/* 작품 번호 비교용 — QR 주소의 번호와 전시 문서의 번호를 대소문자·공백 차이 없이 맞춘다 */
export const noKey = (no) => trimStr(no).toUpperCase().replace(/\s+/g, "");

/* 기본 전시 서문. 학급이 7차시에 쓴 서문으로 바꿔 넣는다 */
export const DEFAULT_TITLE = "실재한 적 없는 유물들";
export const DEFAULT_PREFACE =
  "2300년, 이 학교가 있던 지층에서 사물들이 발굴되었습니다. 이 전시장의 유물은 모두 학생들이 생성형 AI로 만든, 실재한 적 없는 이미지입니다. " +
  "사물에 드러난 사용 흔적을 따라가며, 그 시대 사람들이 무엇을 반복하고 무엇을 견뎠는지 읽어 보세요.";

/* ---------- 전시 후보 ---------- */

/* roster: {학번: {...}} · wsMap: {학번: 기록지} · subMap: {학번: 제출}
   반환: [{ sid, ok, reason, src, work, attitude, mode, modeWhy }] (작품 번호 순) */
export function buildCandidates({ roster, wsMap, subMap, attitudes }) {
  const ids = new Set([...Object.keys(roster || {}), ...Object.keys(subMap || {})]);
  const out = [];
  ids.forEach((sid) => {
    const ws = (wsMap && wsMap[sid]) || null;
    const sub = subMap && subMap[sid] && typeof subMap[sid] === "object" ? subMap[sid] : null;
    const locked = !!(sub && sub.locked && sub.img && sub.img.ref);
    const d = ws || {};
    const draft = submissionFromWs(d, sid);
    const base = locked
      ? { no: trimStr(sub.no), title: trimStr(sub.title), plate: { ...(sub.plate || {}) }, note: trimStr(sub.note), img: sub.img, imgW: sub.imgW || 0, imgH: sub.imgH || 0 }
      : { no: draft.no, title: draft.title, plate: { ...draft.plate }, note: draft.note, img: draft.img, imgW: 0, imgH: 0 };
    base.plate.notice = trimStr(base.plate.notice) || DEFAULT_NOTICE;
    const work = { ...base, aiScope: trimStr(d["s6b.aiScope"]) };
    const att = trimStr(d["s3c.attitude"]);
    const c = {
      sid, src: locked ? "sub" : "ws", work,
      attitude: (attitudes || []).includes(att) ? att : UNSORTED,
      mode: trimStr(d["s7.mode"]), modeWhy: trimStr(d["s7.modeWhy"]),
      ok: true, reason: "",
    };
    /* 학생의 공개 선택이 먼저다. 기록지를 읽지 못했으면 공개 여부를 모르므로 걸지 않는다 */
    if (!ws) { c.ok = false; c.reason = "기록지를 읽지 못함"; }
    else if (d["s7x.show"] !== "공개") { c.ok = false; c.reason = "전시 공개를 선택하지 않음"; }
    else if (!work.img || !work.img.ref) { c.ok = false; c.reason = "대표 이미지 없음"; }
    else if (!work.no) { c.ok = false; c.reason = "작품 번호 없음"; }
    if (!ws && !sub) return; // 명부에만 있고 아무것도 하지 않은 학번은 목록에 넣지 않는다
    out.push(c);
  });
  out.sort((a, b) => (a.work.no || "~").localeCompare(b.work.no || "~", "ko", { numeric: true }) || a.sid.localeCompare(b.sid));
  /* 번호가 겹치면 QR과 번호 찾기가 한 작품만 가리키므로 뒤의 것에 표시한다 */
  const seen = new Map();
  out.forEach((c) => {
    if (!c.ok) return;
    const k = noKey(c.work.no);
    if (seen.has(k)) { c.dup = seen.get(k); } else seen.set(k, c.sid);
  });
  return out;
}

/* ---------- 전시 초안 ---------- */

export function defaultSections(attitudes, hints) {
  return (attitudes || []).map((a) => ({ key: a, title: a, sub: (hints && hints[a]) || "" }))
    .concat([{ key: UNSORTED, title: "분류되지 않은 유물", sub: "" }]);
}

/* cands에서 전시 문서 초안을 만든다. prev(이미 게시한 문서)의 구역 이름·순서, 작품별 구역·형식·순서·제외를 이어받는다. */
export function draftExpo({ cands, attitudes, hints, prev }) {
  const p = prev && typeof prev === "object" ? prev : null;
  const prevWork = new Map(((p && p.works) || []).map((w, i) => [w.sid, { ...w, _i: i }]));
  const prevOff = new Set((p && p.off) || []);
  const secs = defaultSections(attitudes, hints);
  let sections = secs;
  if (p && Array.isArray(p.sections) && p.sections.length) {
    const known = new Map(p.sections.map((s) => [s.key, s]));
    const kept = p.sections.filter((s) => secs.some((d) => d.key === s.key)).map((s) => ({ ...secs.find((d) => d.key === s.key), title: trimStr(s.title) || s.key, sub: trimStr(s.sub) }));
    sections = kept.concat(secs.filter((d) => !known.has(d.key)));
  }
  const works = [];
  (cands || []).filter((c) => c.ok && !c.dup).forEach((c) => {
    const pw = prevWork.get(c.sid);
    works.push({
      sid: c.sid, no: c.work.no, title: c.work.title, plate: c.work.plate, aiScope: c.work.aiScope, note: c.work.note,
      img: c.work.img, imgW: c.work.imgW || 0, imgH: c.work.imgH || 0,
      section: pw && sections.some((s) => s.key === pw.section) ? pw.section : c.attitude,
      fixture: pw && FIXTURE_KEYS.includes(pw.fixture) ? pw.fixture : fixtureOfMode(c.mode),
      _i: pw ? pw._i : 1e6 + works.length,
    });
  });
  works.sort((a, b) => a._i - b._i);
  works.forEach((w) => { delete w._i; });
  const off = (cands || []).filter((c) => c.ok && !c.dup && prevOff.has(c.sid)).map((c) => c.sid);
  return {
    ver: EXPO_VER, open: !!(p && p.open),
    title: trimStr(p && p.title) || DEFAULT_TITLE,
    preface: trimStr(p && p.preface) || DEFAULT_PREFACE,
    sections, works, off,
  };
}

/* 게시할 문서: 제외(off)한 작품을 빼지 않고 off 목록으로 둔다 — 다시 넣을 때 구역·형식이 그대로 있도록 */
export function publishDoc(draft, { open = true, at = new Date().toISOString() } = {}) {
  return { ...draft, ver: EXPO_VER, open, publishedAt: at };
}

/* 관람자에게 보이는 작품: 제외를 빼고, 구역 순서대로, 구역 안에서는 문서 순서대로 */
export function visibleWorks(expo) {
  if (!expo || !Array.isArray(expo.works)) return [];
  const off = new Set(expo.off || []);
  const secs = (expo.sections || []).map((s) => s.key);
  const rank = (k) => { const i = secs.indexOf(k); return i < 0 ? secs.length : i; };
  return expo.works.filter((w) => !off.has(w.sid))
    .map((w, i) => ({ w, i }))
    .sort((a, b) => rank(a.w.section) - rank(b.w.section) || a.i - b.i)
    .map((x) => x.w);
}

export const findWorkByNo = (expo, no) => {
  const k = noKey(no);
  if (!k) return null;
  return visibleWorks(expo).find((w) => noKey(w.no) === k) || null;
};

/* 구역 안 순서 옮기기 (교사 화면의 위·아래 버튼) */
export function moveWork(expo, sid, dir) {
  const works = expo.works.slice();
  const i = works.findIndex((w) => w.sid === sid);
  if (i < 0) return expo;
  const sec = works[i].section;
  let j = i + dir;
  while (j >= 0 && j < works.length && works[j].section !== sec) j += dir;
  if (j < 0 || j >= works.length) return expo;
  const t = works[i]; works[i] = works[j]; works[j] = t;
  return { ...expo, works };
}

export function moveSection(expo, key, dir) {
  const s = expo.sections.slice();
  const i = s.findIndex((x) => x.key === key);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= s.length) return expo;
  const t = s[i]; s[i] = s[j]; s[j] = t;
  return { ...expo, sections: s };
}

/* ---------- 전시관 평면 ----------
   좌표: x 가로(왼쪽 벽 −W/2, 오른쪽 벽 +W/2), y 위, z 깊이(관람자는 −z로 걸어 들어간다). 단위 m.
   입구(z>0)에 전시 서문 벽을 세우고, 구역마다 칸막이를 두고, 끝에 맺음 벽을 둔다. */

export const HALL = {
  W: 7.2, H: 3.4, EYE: 1.6,
  ENTRY: 4.2,          // 입구 구역 깊이 (서문 벽 앞 관람 공간)
  INTRO_Z: 0.9,        // 서문 벽 위치
  HEAD: 1.5,           // 칸막이에서 첫 작품까지
  TAIL: 0.9,
  MIN_SEC: 5.0,
  WING: 1.6,           // 칸막이 날개 길이
  SLOT: { wall: 3.2, series: 1.45, floor: 3.0 },
  SERIES_PAD: 0.45,
  BOX: { wall: [1.3, 1.15], series: [0.8, 0.8] }, // 벽면 이미지 최대 너비·높이
  CENTER_Y: { wall: 1.55, series: 1.5 },
  FLOOR_TOP: { table: 0.95, case: 1.3, plinth: 1.3 }, // 바닥 설비를 볼 때 시선이 닿는 높이
};

const r3 = (x) => Math.round(x * 1000) / 1000;

/* 시점: look을 바라보도록 pos에서의 yaw·pitch (three.js 카메라 기본 방향은 −z) */
export function viewAngles(pos, look) {
  const dx = look[0] - pos[0], dy = look[1] - pos[1], dz = look[2] - pos[2];
  const h = Math.hypot(dx, dz) || 1e-6;
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, h) };
}

/* 한 구역의 벽면 배치 — 계열 작품은 한 덩어리로 묶어 한 벽에 나란히, 단독은 짧은 벽부터 채운다 */
function wallUnits(items) {
  const units = [];
  let series = null;
  items.forEach((it) => {
    if (it.fixture === "series") {
      if (!series) { series = { kind: "series", items: [] }; units.push(series); }
      series.items.push(it);
    } else units.push({ kind: "wall", items: [it] });
  });
  return units;
}

export function planHall(expo, opt = {}) {
  const H = { ...HALL, ...(opt.hall || {}) };
  const works = visibleWorks(expo);
  const secDefs = (expo && expo.sections) || [];
  const secs = secDefs.map((s) => ({ ...s, works: works.filter((w) => w.section === s.key) })).filter((s) => s.works.length);
  /* 문서에 없는 구역 키를 가진 작품도 버리지 않는다 */
  const orphan = works.filter((w) => !secDefs.some((s) => s.key === w.section));
  if (orphan.length) secs.push({ key: "_orphan", title: "분류되지 않은 유물", sub: "", works: orphan });

  const half = H.W / 2;
  const items = [];
  const sections = [];
  const partitions = [];
  let z = H.INTRO_Z - 1.9; // 첫 칸막이

  secs.forEach((s) => {
    const z0 = z;
    const wallIts = [], floorIts = [];
    s.works.forEach((w) => {
      const fixture = FIXTURE_KEYS.includes(w.fixture) ? w.fixture : "wall";
      const it = { work: w, fixture, section: s.key };
      (isWallFixture(fixture) ? wallIts : floorIts).push(it);
    });
    /* 벽면: 짧은 쪽 벽에 다음 덩어리를 건다 */
    const len = { L: 0, R: 0 };
    wallUnits(wallIts).forEach((u) => {
      const side = len.L <= len.R ? "L" : "R";
      const x = side === "L" ? -half : half;
      const n = side === "L" ? [1, 0, 0] : [-1, 0, 0];
      if (u.kind === "series") {
        len[side] += H.SERIES_PAD;
        u.items.forEach((it) => {
          const zc = z0 - H.HEAD - len[side] - H.SLOT.series / 2;
          Object.assign(it, { wall: side, anchor: [x, H.CENTER_Y.series, zc], normal: n, box: H.BOX.series.slice() });
          len[side] += H.SLOT.series;
        });
        len[side] += H.SERIES_PAD;
      } else {
        const it = u.items[0];
        const zc = z0 - H.HEAD - len[side] - H.SLOT.wall / 2;
        Object.assign(it, { wall: side, anchor: [x, H.CENTER_Y.wall, zc], normal: n, box: H.BOX.wall.slice() });
        len[side] += H.SLOT.wall;
      }
    });
    /* 바닥: 가운데 줄에 차례로 */
    let lf = 0;
    floorIts.forEach((it) => {
      const zc = z0 - H.HEAD - lf - H.SLOT.floor / 2;
      Object.assign(it, { wall: null, anchor: [0, 0, zc], normal: [0, 0, 1], box: null });
      lf += H.SLOT.floor;
    });
    const secLen = Math.max(H.MIN_SEC, H.HEAD + Math.max(len.L, len.R, lf) + H.TAIL);
    partitions.push({ z: z0, wing: H.WING });
    sections.push({ key: s.key, title: s.title, sub: s.sub || "", z0: r3(z0), z1: r3(z0 - secLen), n: s.works.length });
    /* 관람 순서: 왼쪽 벽 → 가운데 → 오른쪽 벽이 아니라, 입구에서 가까운 것부터(z가 큰 것부터) */
    const secItems = wallIts.concat(floorIts).sort((a, b) => b.anchor[2] - a.anchor[2] || (a.wall === "L" ? -1 : 1));
    secItems.forEach((it) => items.push(it));
    z = z0 - secLen;
  });

  const endZ = z - 1.6;
  items.forEach((it, i) => {
    it.idx = i;
    it.view = itemView(it, H);
    it.anchor = it.anchor.map(r3);
  });
  const introLook = [0, 1.5, H.INTRO_Z + 0.1];
  const introPos = [0, H.EYE, H.ENTRY - 0.8];
  const endLook = [0, 1.55, endZ];
  const endPos = [0, H.EYE, endZ + 3.2];
  return {
    W: H.W, H: H.H, EYE: H.EYE,
    zFront: H.ENTRY, zBack: r3(endZ),
    intro: { z: H.INTRO_Z, w: 3.0, h: 2.6, view: { pos: introPos, look: introLook, ...viewAngles(introPos, introLook) } },
    end: { z: r3(endZ), view: { pos: endPos, look: endLook, ...viewAngles(endPos, endLook) } },
    sections, partitions, items,
    tourLength: items.length + 2, // 0 서문 · 1..n 작품 · n+1 맺음
  };
}

function itemView(it, H) {
  if (it.wall) {
    const [bw, bh] = it.box;
    const d = Math.min(2.6, Math.max(1.7, 1.2 * Math.max(bw, bh) + 0.7));
    /* 작품 캡션이 이미지 오른쪽에 있으므로 시선을 캡션 쪽으로 조금 옮긴다.
       벽을 바라보는 관람자의 오른쪽은 (−n) × 위: 왼쪽 벽(n=+x)이면 −z, 오른쪽 벽(n=−x)이면 +z */
    const rightZ = -it.normal[0];
    const look = [it.anchor[0], it.anchor[1] - 0.05, it.anchor[2] + rightZ * 0.28];
    const pos = [it.anchor[0] + it.normal[0] * d, H.EYE, look[2]];
    return { pos: pos.map(r3), look: look.map(r3), ...viewAngles(pos, look) };
  }
  const top = H.FLOOR_TOP[it.fixture] || 1.0;
  const look = [0, top - 0.15, it.anchor[2]];
  const pos = [0, H.EYE + 0.05, it.anchor[2] + (it.fixture === "table" ? 1.55 : 1.85)];
  return { pos: pos.map(r3), look: look.map(r3), ...viewAngles(pos, look) };
}

/* ---------- 작품 캡션 줄 ----------
   전시장(src-app.jsx Gallery)의 2차 관람과 같은 순서. AI 활용 범위는 전시 캡션에 들어간다 */
export const PLATE_LINES = [
  ["relic", "유물 명칭"], ["year", "발굴 연도"], ["era", "추정 연대"], ["mat", "재질"], ["size", "크기"],
  ["context", "출토 맥락"], ["coll", "소장"],
];
export function plateRows(w) {
  const p = (w && w.plate) || {};
  const rows = PLATE_LINES.filter(([k]) => trimStr(p[k])).map(([k, label]) => [label, trimStr(p[k]), k]);
  if (trimStr(w && w.aiScope)) rows.push(["AI 활용 범위", trimStr(w.aiScope), "aiScope"]);
  return rows;
}

/* QR 주소 — 번호만 담는다. 번호를 아는 사람도 로그인해야 작품을 읽는다 */
export const arLink = (origin, no) => String(origin || "").replace(/\/+$/, "") + "/?ar=" + encodeURIComponent(trimStr(no));
