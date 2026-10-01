/* ============================================================
   수업 내용 편집 계층 — 관리자 교사가 차시별 내용을 고치는 자리

   고칠 수 있는 것
     · 차시 제목 · 학습 목표 · 성취기준
     · 오늘의 발문 (학생 화면 강의 노트 맨 위에 뜨는 안내)
     · 120분 수업 흐름 (단계 · 시간 · 활동)
     · 읽기 자료(이론) — 소제목, 본문, 단계별 발문, 그림, 작품·자료 표
     · 작품·자료마다 붙는 설명 사이트 링크
     · 학습지 발문 (배움 확인의 질문과 생각 단계 · 탐구 질문의 질문과 되묻기)
     · 설계 근거(교사용)

   저장 방식
     코드에 있는 원본(LESSONS_DEF · SCHEMA_DEF)은 건드리지 않는다.
     교사가 고친 것만 Firestore 문서 misc/lessonEdits 에 덮어쓰기 층으로 쌓고,
     화면에 그릴 때 원본 위에 얹어 합친다. 「원래대로」를 누르면 그 층만 지워지고
     원본이 다시 보이므로 잘못 고쳐도 되돌릴 수 있다.
   ============================================================ */

import React, { useState, useEffect, useRef } from "react";
import { fbStore } from "./src-fb.js";
import { figAlt, FigureDesc } from "./src-access.jsx";
import { useTopbarHeight } from "./src-survey-ui.jsx";
import { SCHEMA_REV, REV_SECTIONS } from "./src-ladder.jsx";

export const CONTENT_KEY = "lessonEdits";
const TEACHER = "teacher";
const isArr = Array.isArray;
const pick = (o, k, d) => (o && o[k] != null ? o[k] : d);

const emptyContent = () => ({ lessons: {}, secs: {}, fields: {} });

/* 유물 발상 단계 카드(REV_SECTIONS)는 2026-09에 문항이 통째로 바뀌었다.
   그 전에 저장된 덮어쓰기(rev가 다른 것)는 새 문안을 가리므로 읽을 때 버린다.
   교사가 다시 고치면 setSec·setFld가 지금 rev를 붙여 저장한다. */
function dropStale(obj, secOf) {
  const out = {};
  Object.keys(obj || {}).forEach((k) => {
    const v = obj[k];
    if (REV_SECTIONS.includes(secOf(k)) && !(v && v.rev === SCHEMA_REV)) return;
    out[k] = v;
  });
  return out;
}

function normalize(c) {
  if (!c || typeof c !== "object") return emptyContent();
  return {
    lessons: c.lessons && typeof c.lessons === "object" ? c.lessons : {},
    secs: dropStale(c.secs && typeof c.secs === "object" ? c.secs : {}, (k) => k),
    fields: dropStale(c.fields && typeof c.fields === "object" ? c.fields : {}, (k) => String(k).split(".")[0]),
    updatedAt: c.updatedAt || "",
  };
}

/* ---------- 지금 적용 중인 편집 내용 ---------- */

let CONTENT = emptyContent();
const subs = new Set();

export function getContent() { return CONTENT; }

export function setContent(c) {
  CONTENT = normalize(c);
  // 등록 순서대로 부른다. 원본을 다시 합치는 일이 먼저, 화면 갱신이 나중.
  subs.forEach((f) => { try { f(); } catch (e) { console.error("content sub", e); } });
}

/* 원본 배열을 다시 합치는 함수를 맨 앞자리에 등록한다 (앱 시작 때 한 번) */
export function onContentChange(fn) {
  subs.add(fn);
  fn();
  return () => { subs.delete(fn); };
}

/* 편집 내용이 바뀌면 이 화면을 다시 그린다 */
export function useContent() {
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((x) => x + 1);
    subs.add(f);
    return () => { subs.delete(f); };
  }, []);
  return CONTENT;
}

/* 실시간 구독 — 교사가 저장하면 학생 화면에도 바로 반영된다 */
let unwatch = null, watchers = 0;
export function watchContent() {
  watchers += 1;
  if (!unwatch) unwatch = fbStore.watchDoc(CONTENT_KEY, (v) => setContent(v));
  return () => {
    watchers -= 1;
    if (watchers <= 0) { if (unwatch) unwatch(); unwatch = null; watchers = 0; }
  };
}

/* ---------- 원본 + 편집 내용 합치기 ---------- */

/* 원본 지문 (_base)
   편집을 저장할 때 그 칸이 기댄 코드 원본의 짧은 지문을 _base[칸]에 함께 남긴다.
   얹을 때 지금 코드 원본의 지문과 다르면 그 사이 원본이 바뀐 것이므로(그림 교체·용어 정정 등) 옛 편집을 얹지 않고
   원본을 보여 준다. 읽기 자료 하나만 고쳐도 readings 배열 전체가 저장되므로, 이것이 없으면 뒤의 코드 수정이 영영 가려진다.
   지문이 없는 옛 편집(이 장치 이전에 저장한 것)도 무엇에 기대었는지 알 수 없어 얹지 않는다.
   교사는 편집 화면의 「원본이 바뀌어 적용하지 않은 편집」 카드에서 「원래대로」 또는 「그래도 적용」을 고른다. */
export function fingerprint(v) {
  const s = JSON.stringify(v === undefined ? null : v);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36) + "." + s.length.toString(36);
}
const LESSON_PROPS = ["title", "notice", "goals", "stds", "flow", "readings", "pedagogy"];
const SEC_PROPS = ["title", "note"];
const FIELD_PROPS = ["label", "steps", "probes"];
const lessonDef = (L, p) => (p === "notice" ? L.notice || "" : L[p]);
/* 덮어쓰기 o의 p 칸 상태: none(편집 없음) · ok(적용) · changed(원본이 바뀜) · legacy(지문 없는 옛 편집) */
export function propState(o, p, defVal) {
  if (!o || o[p] == null) return "none";
  const b = o._base && o._base[p];
  if (!b) return "legacy";
  return b === fingerprint(defVal) ? "ok" : "changed";
}
/* 지금 얹을 수 있는 칸만 남긴 덮어쓰기 */
function applicable(o, defOf, props) {
  if (!o) return null;
  const out = {};
  let any = false;
  props.forEach((p) => { if (propState(o, p, defOf(p)) === "ok") { out[p] = o[p]; any = true; } });
  return any ? out : null;
}
const baseOf = (o, patch, defOf) => {
  const b = { ...((o && o._base) || {}) };
  Object.keys(patch).forEach((p) => { b[p] = fingerprint(defOf(p)); });
  return b;
};

/* 얹지 않은 편집 목록 (교사 화면 안내용) */
export function staleEdits(content, lessonDefs, schemaDefs) {
  const out = [];
  const c = content || emptyContent();
  lessonDefs.forEach((L) => {
    const o = c.lessons[String(L.n)];
    LESSON_PROPS.forEach((p) => { const st = propState(o, p, lessonDef(L, p)); if (st === "changed" || st === "legacy") out.push({ kind: "lessons", id: String(L.n), p, st, n: L.n, where: L.n + "차시 · " + (LESSON_NAMES[p] || p), val: o[p] }); });
  });
  schemaDefs.forEach((sec) => {
    const L = lessonDefs.find((x) => x.session === sec.session);
    const s = c.secs[sec.id];
    SEC_PROPS.forEach((p) => { const st = propState(s, p, sec[p]); if (st === "changed" || st === "legacy") out.push({ kind: "secs", id: sec.id, p, st, n: L && L.n, where: sec.session + " · " + sec.id + " " + (p === "title" ? "구간 제목" : "구간 안내문"), val: s[p] }); });
    sec.fields.forEach((f) => {
      const key = sec.id + "." + f.k, o = c.fields[key];
      FIELD_PROPS.forEach((p) => { const st = propState(o, p, f[p]); if (st === "changed" || st === "legacy") out.push({ kind: "fields", id: key, p, st, n: L && L.n, where: sec.session + " · " + key + " " + (p === "label" ? "발문" : p === "steps" ? "생각 단계" : "되묻기"), val: o[p] }); });
    });
  });
  return out;
}
const LESSON_NAMES = { title: "차시 제목", notice: "오늘의 발문", goals: "학습 목표", stds: "성취기준", flow: "수업 흐름", readings: "읽기 자료", pedagogy: "설계 근거" };

function mergeOne(L, o0) {
  const o = applicable(o0, (p) => lessonDef(L, p), LESSON_PROPS);
  if (!o) return L;
  return {
    ...L,
    title: pick(o, "title", L.title),
    notice: pick(o, "notice", L.notice || ""),
    goals: isArr(o.goals) ? o.goals : L.goals,
    stds: isArr(o.stds) ? o.stds : L.stds,
    flow: isArr(o.flow) ? o.flow : L.flow,
    readings: isArr(o.readings) ? o.readings : L.readings,
    pedagogy: o.pedagogy && isArr(o.pedagogy.p) ? o.pedagogy : L.pedagogy,
  };
}

export function mergeLessons(defs) {
  const ov = CONTENT.lessons;
  if (!ov || !Object.keys(ov).length) return defs;
  return defs.map((L) => mergeOne(L, ov[String(L.n)]));
}

export function mergeSchema(defs) {
  const so = CONTENT.secs, fo = CONTENT.fields;
  if ((!so || !Object.keys(so).length) && (!fo || !Object.keys(fo).length)) return defs;
  return defs.map((sec) => {
    const s = applicable(so[sec.id], (p) => sec[p], SEC_PROPS);
    let touched = !!s;
    const fields = sec.fields.map((f) => {
      const o = applicable(fo[sec.id + "." + f.k], (p) => f[p], FIELD_PROPS);
      if (!o) return f;
      touched = true;
      const steps = isArr(o.steps) ? (o.steps.length ? o.steps : undefined) : f.steps;
      // 탐구 질문의 되묻기(src-inquiry.jsx) — 생각 단계와 같은 규칙으로 얹는다
      const probes = isArr(o.probes) ? (o.probes.length ? o.probes : undefined) : f.probes;
      return { ...f, label: pick(o, "label", f.label), steps, probes };
    });
    if (!touched) return sec;
    return { ...sec, title: pick(s, "title", sec.title), note: pick(s, "note", sec.note), fields };
  });
}

/* ============================================================
   학생·교사 화면에 그리는 조각들
   ============================================================ */

/* 작품·자료에 붙는 설명 사이트 링크 */
export function WorkLinks({ links }) {
  if (!isArr(links)) return null;
  const ls = links.filter((l) => l && l.u);
  if (!ls.length) return null;
  return (
    <div className="wk-links">
      {ls.map((l, i) => (
        <a key={i} className="wk-link" href={l.u} target="_blank" rel="noopener noreferrer">
          {l.t || l.u}<span aria-hidden="true"> ↗</span>
        </a>
      ))}
    </div>
  );
}

/* 그림 한 장 — 주소로 넣은 것과 교사가 올린 것(m: 시작) 둘 다 처리한다 */
function LessonFigure({ img }) {
  const [data, setData] = useState(null);
  const ref = img && typeof img.src === "string" && img.src.slice(0, 2) === "m:" ? img.src.slice(2) : null;
  useEffect(() => {
    let live = true;
    if (!ref) { setData(null); return; }
    fbStore.get("media:" + TEACHER + "_" + ref).then((v) => { if (live) setData(v || null); });
    return () => { live = false; };
  }, [ref]);
  const url = ref ? data : (img && img.src);
  if (!url) return ref ? <span className="lz-load">그림 불러오는 중…</span> : null;
  const pic = <img className="lz-img" src={url} alt={figAlt(img, img.cap)} loading="lazy" />;
  const cap = img.cap || img.credit || img.link;
  return (
    <figure className="lz-fig">
      {img.link ? <a href={img.link} target="_blank" rel="noopener noreferrer">{pic}</a> : pic}
      {cap && (
        <figcaption>
          {img.cap}
          {img.credit && <span className="lz-cr">{img.credit}</span>}
          {img.link && <a className="wk-link" href={img.link} target="_blank" rel="noopener noreferrer">원본 보기 ↗</a>}
          {img.srcPage && <a className="wk-link" href={img.srcPage} target="_blank" rel="noopener noreferrer">파일 출처 ↗</a>}
        </figcaption>
      )}
      <FigureDesc src={img.src} />
    </figure>
  );
}

export function LessonImages({ images }) {
  if (!isArr(images)) return null;
  const xs = images.filter((x) => x && x.src);
  if (!xs.length) return null;
  return <div className="lz-figs">{xs.map((img, i) => <LessonFigure key={i} img={img} />)}</div>;
}

/* 이 단계에서 던지는 발문 */
export function LessonAsks({ asks }) {
  if (!isArr(asks)) return null;
  const xs = asks.filter((a) => a && String(a).trim());
  if (!xs.length) return null;
  return (
    <div className="lz-asks">
      <div className="lz-asks-h">생각해 볼 질문</div>
      <ul>{xs.map((a, i) => <li key={i}>{a}</li>)}</ul>
    </div>
  );
}

/* 차시 맨 위에 뜨는 오늘의 발문·안내 */
export function LessonNotice({ text }) {
  if (!text || !String(text).trim()) return null;
  const lines = String(text).split("\n").filter((l) => l.trim());
  return (
    <div className="lz-notice">
      <span className="lz-notice-tag">오늘의 질문</span>
      {lines.map((l, i) => <p key={i}>{l}</p>)}
    </div>
  );
}

/* ============================================================
   편집 화면
   ============================================================ */

const linesToArr = (s) => String(s || "").split("\n").map((x) => x.trim()).filter(Boolean);
const arrToLines = (a) => (isArr(a) ? a.join("\n") : "");
const parasToArr = (s) => String(s || "").split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean);
const arrToParas = (a) => (isArr(a) ? a.join("\n\n") : "");
const growRows = (s, min, max) => Math.min(max, Math.max(min, String(s || "").split("\n").length + 1));

/* Firestore 문서 한도(1MB)는 바이트 기준이고 한글은 한 글자가 3바이트다 */
function utf8Bytes(s) {
  try { return new TextEncoder().encode(s).length; }
  catch (e) { return unescape(encodeURIComponent(String(s))).length; }
}

/* 사진을 화면 크기로 줄여 base64로 만든다 (문서 1MB 한도 안에 들어가게) */
function compressImage(file, maxPx, maxBytes) {
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const cv = document.createElement("canvas");
      cv.width = Math.round(img.width * scale);
      cv.height = Math.round(img.height * scale);
      const g = cv.getContext("2d");
      // JPEG에는 투명이 없어 칠하지 않은 곳이 검게 나온다 (투명 PNG 도식). 흰 바탕을 먼저 칠한다
      g.fillStyle = "#fff";
      g.fillRect(0, 0, cv.width, cv.height);
      g.drawImage(img, 0, 0, cv.width, cv.height);
      let q = 0.82, data = cv.toDataURL("image/jpeg", q);
      while (data.length > maxBytes && q > 0.3) { q -= 0.08; data = cv.toDataURL("image/jpeg", q); }
      URL.revokeObjectURL(url);
      data.length > maxBytes ? rej(new Error("too big")) : res(data);
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error("read fail")); };
    img.src = url;
  });
}

function EdText({ label, hint, value, onChange, ph, mono }) {
  return (
    <div className="ed-f">
      {label && <label>{label}</label>}
      <input className={mono ? "mono" : ""} value={value == null ? "" : value} placeholder={ph || ""}
        onChange={(e) => onChange(e.target.value)} />
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

function EdArea({ label, hint, value, onChange, ph, min = 3, max = 22 }) {
  const v = value == null ? "" : value;
  return (
    <div className="ed-f">
      {label && <label>{label}</label>}
      <textarea rows={growRows(v, min, max)} value={v} placeholder={ph || ""} onChange={(e) => onChange(e.target.value)} />
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

/* 설명 링크 목록 편집 */
function LinkEditor({ links, onChange }) {
  const ls = isArr(links) ? links : [];
  const up = (i, patch) => onChange(ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <div className="ed-links">
      {ls.map((l, i) => (
        <div className="ed-link-row" key={i}>
          <input value={l.t || ""} placeholder="링크 이름 (예: 마르셀 뒤샹)" onChange={(e) => up(i, { t: e.target.value })} />
          <input className="mono" value={l.u || ""} placeholder="https://..." onChange={(e) => up(i, { u: e.target.value })} />
          <label className="ed-src-k" title="원 텍스트·원본 기록·소장처 작품 기록이면 표시합니다. 학생 화면 작품 카드에 「원문」으로 따로 보입니다.">
            <input type="checkbox" checked={l.k === "원문"} onChange={(e) => up(i, { k: e.target.checked ? "원문" : null })} /> 원문
          </label>
          {l.u && <a className="wk-link" href={l.u} target="_blank" rel="noopener noreferrer">열기 ↗</a>}
          <button className="btn small ghost" onClick={() => onChange(ls.filter((_, j) => j !== i))}>삭제</button>
        </div>
      ))}
      <button className="btn small ghost" onClick={() => onChange([...ls, { t: "", u: "" }])}>＋ 설명 링크 추가</button>
    </div>
  );
}

/* 그림 목록 편집 — 파일 올리기와 주소 붙여넣기 둘 다 된다 */
function ImageEditor({ images, onChange, slot, onUploaded }) {
  const xs = isArr(images) ? images : [];
  const [busy, setBusy] = useState(false);
  const [urlIn, setUrlIn] = useState("");
  const fileRef = useRef(null);

  const up = (i, patch) => onChange(xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const addFile = async (file) => {
    if (!file) return;
    setBusy(true);
    try {
      const data = await compressImage(file, 1400, 700000);
      const ref = slot + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const ok = await fbStore.set("media:" + TEACHER + "_" + ref, data);
      if (!ok) throw new Error("save fail");
      if (onUploaded) onUploaded(ref);
      onChange([...xs, { src: "m:" + ref, cap: "", credit: "", link: "" }]);
    } catch (e) {
      window.alert("그림을 올리지 못했습니다. 파일이 너무 크면 화면을 캡처해 작게 만든 뒤 다시 시도하세요.");
    }
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  const addUrl = () => {
    const u = urlIn.trim();
    if (!u) return;
    if (!/^https?:\/\//i.test(u)) return window.alert("그림 주소는 http:// 또는 https:// 로 시작해야 합니다.");
    onChange([...xs, { src: u, cap: "", credit: "", link: "" }]);
    setUrlIn("");
  };

  const del = (i) => {
    const x = xs[i];
    if (!window.confirm("이 그림을 뺄까요?")) return;
    // 파일은 여기서 지우지 않는다. 원고를 저장하지 않고 떠나면 그림이 원고에 그대로 남으므로, 저장이 확인된 뒤 ContentEditor가 지운다
    onChange(xs.filter((_, j) => j !== i));
  };

  return (
    <div className="ed-imgs">
      {xs.map((x, i) => (
        <div className="ed-img-row" key={i}>
          <div className="ed-img-prev"><LessonFigure img={{ src: x.src }} /></div>
          <div className="ed-img-fields">
            <EdText label="그림 설명 (학생에게 보이는 글)" value={x.cap} onChange={(v) => up(i, { cap: v })} ph="예: 뒤샹 「샘」, 1917 (1964년 복제)" />
            <EdText label="출처 표기" value={x.credit} onChange={(v) => up(i, { credit: v })} ph="예: Tate 소장 / 촬영 ○○○" />
            <EdText label="눌렀을 때 열릴 설명 사이트 주소" mono value={x.link} onChange={(v) => up(i, { link: v })} ph="https://..." />
            {/* 본문 속 위치와 크기: src-reading.jsx가 at 문단 뒤에 size 모양으로 놓는다 */}
            <div className="ed-grid2">
              <div className="ed-f"><label>본문 속 위치</label>
                <input type="number" min="0" value={x.at == null ? "" : x.at + 1} placeholder="비우면 본문 끝"
                  onChange={(e) => { const v = e.target.value.trim(); const k = Math.round(Number(v)); up(i, { at: v === "" || !isFinite(k) ? null : Math.max(-1, k - 1) }); }} />
                <span className="hint">몇 번째 문단 뒤에 놓을지 적습니다. 0이면 맨 위, 비우면 본문 끝입니다.</span></div>
              <div className="ed-f"><label>크기</label>
                <select value={x.size || "full"} onChange={(e) => up(i, { size: e.target.value })}>
                  <option value="full">크게 한 장</option>
                  <option value="half">중간(위치가 같은 두 장은 나란히)</option>
                  <option value="side">넓은 화면에서 글 옆에</option>
                  <option value="thumb">작게(위치가 같은 3~4장을 한 줄로)</option>
                </select></div>
            </div>
            <button className="btn small ghost" onClick={() => del(i)}>이 그림 빼기</button>
          </div>
        </div>
      ))}
      <div className="ed-img-add">
        <label className="btn small ghost" style={{ cursor: "pointer" }}>
          {busy ? "올리는 중…" : "＋ 그림 파일 올리기"}
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} disabled={busy}
            onChange={(e) => addFile(e.target.files && e.target.files[0])} />
        </label>
        <input className="mono" value={urlIn} placeholder="또는 그림 주소 붙여넣기 (https://...)" onChange={(e) => setUrlIn(e.target.value)} />
        <button className="btn small ghost" onClick={addUrl}>주소로 추가</button>
      </div>
      <p className="hint">
        올린 파일은 학급 서버에 저장되어 학생 화면에 바로 보입니다(한 장당 약 0.7MB까지 자동으로 줄임).
        남의 사진·그림을 쓸 때는 수업 목적의 인용 범위를 지키고 출처 표기 칸을 반드시 채우세요.
        미술관 소장품처럼 링크만 걸어도 되는 자료는 파일을 올리는 대신 아래 「설명 링크」로 연결하는 편이 안전합니다.
      </p>
    </div>
  );
}

/* 작품·자료 표 편집 */
function WorksEditor({ works, onChange }) {
  const ws = isArr(works) ? works : [];
  const up = (i, patch) => onChange(ws.map((w, j) => (j === i ? { ...w, ...patch } : w)));
  const move = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= ws.length) return;
    const next = ws.slice();
    next[i] = ws[j]; next[j] = ws[i];
    onChange(next);
  };
  return (
    <div className="ed-works">
      {ws.map((w, i) => (
        <div className="ed-work" key={i}>
          <div className="ed-work-head">
            <span className="ed-num">{i + 1}</span>
            <button className="btn small ghost" onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
            <button className="btn small ghost" onClick={() => move(i, 1)} disabled={i === ws.length - 1}>↓</button>
            <button className="btn small ghost" onClick={() => { if (window.confirm("이 줄을 지울까요?")) onChange(ws.filter((_, j) => j !== i)); }}>삭제</button>
          </div>
          <div className="ed-grid2">
            <EdText label="작가·구분" value={w.a} onChange={(v) => up(i, { a: v })} ph="예: 마르셀 뒤샹 / 문헌 / 개념" />
            <EdText label="연도" value={w.y} onChange={(v) => up(i, { y: v })} ph="예: 1917" />
          </div>
          <EdText label="작품·자료" value={w.w} onChange={(v) => up(i, { w: v })} ph="예: 「샘」" />
          <EdArea label="보는 이유" value={w.d} onChange={(v) => up(i, { d: v })} min={2} max={6} />
          <div className="ed-f"><label>설명 링크 (누르면 새 창에서 열립니다)</label>
            <LinkEditor links={w.links} onChange={(v) => up(i, { links: v })} /></div>
        </div>
      ))}
      <button className="btn small ghost" onClick={() => onChange([...ws, { a: "", w: "", y: "", d: "", links: [] }])}>＋ 작품·자료 줄 추가</button>
    </div>
  );
}

/* 읽기 자료(이론) 하나 */
function ReadingEditor({ rd, i, count, n, onPatch, onMove, onDel, onUploaded }) {
  return (
    <details className="ed-block" open={i === 0}>
      <summary><span className="stage-tag">{rd.stage || "단계"}</span>{rd.h || "(제목 없음)"}</summary>
      <div className="ed-block-in">
        <div className="ed-block-bar">
          <button className="btn small ghost" onClick={() => onMove(i, -1)} disabled={i === 0}>↑ 위로</button>
          <button className="btn small ghost" onClick={() => onMove(i, 1)} disabled={i === count - 1}>↓ 아래로</button>
          <button className="btn small ghost" onClick={() => onDel(i)}>이 읽기 자료 삭제</button>
        </div>
        <div className="ed-grid2">
          <EdText label="단계 이름" value={rd.stage} onChange={(v) => onPatch(i, { stage: v })} ph="예: 감상 1" />
          <EdText label="소제목" value={rd.h} onChange={(v) => onPatch(i, { h: v })} ph="예: 1917년 뉴욕, 출품과 거부와 소실" />
        </div>
        <EdArea label="이론·설명 본문" hint="빈 줄 하나로 문단을 나눕니다. 문단 맨 앞에 「## 」를 쓰면 소제목, 「> 」는 인용(마지막 줄을 「> 출처: …」로), 「- 」나 「1. 」은 목록, 「! 」는 핵심 상자가 됩니다. 글 안의 **글자**는 강조, [글자](https://주소)는 링크입니다." min={6} max={40}
          value={arrToParas(rd.p)} onChange={(v) => onPatch(i, { p: parasToArr(v) })} />
        <EdArea label="이 단계에서 던질 발문" hint="한 줄에 하나씩. 학생 화면에 「생각해 볼 질문」 상자로 보입니다. 비워 두면 상자가 나타나지 않습니다." min={2} max={12}
          value={arrToLines(rd.asks)} onChange={(v) => onPatch(i, { asks: linesToArr(v) })} />
        {Array.isArray(rd.viz) && rd.viz.length > 0 && (
          <p className="hint">이 읽기 자료에는 도식(연표·비교·용어 정리 등)이 {rd.viz.length}개 있습니다. 도식은 이 화면에서 고칠 수 없고 본문을 고쳐도 그대로 유지됩니다. 문단 수를 바꾸면 도식과 그림의 위치가 달라질 수 있으니 미리 보기로 확인하세요.</p>
        )}
        <div className="ed-f"><label>그림·사진</label>
          <ImageEditor images={rd.images} slot={"L" + n + "r" + i} onUploaded={onUploaded} onChange={(v) => onPatch(i, { images: v })} /></div>
        <div className="ed-f"><label>작품·자료 표</label>
          <WorksEditor works={rd.works} onChange={(v) => onPatch(i, { works: v })} /></div>
      </div>
    </details>
  );
}

/* 원고 안에서 교사가 올린 그림(src가 m:로 시작)의 참조를 모두 모은다 */
function teacherRefs(c) {
  const out = new Set();
  const walk = (v) => {
    if (isArr(v)) return v.forEach(walk);
    if (v && typeof v === "object") {
      if (typeof v.src === "string" && v.src.slice(0, 2) === "m:") out.add(v.src.slice(2));
      Object.values(v).forEach(walk);
    }
  };
  walk(c);
  return out;
}

export function ContentEditor({ lessonDefs, schemaDefs, LessonPanel, onDirty }) {
  const [draft, setDraft] = useState(null);
  const [n, setN] = useState(lessonDefs[0] ? lessonDefs[0].n : 1);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState(false);
  useTopbarHeight(); // 편집 바(.ed-bar)의 sticky top이 상단바 실제 높이를 따라가게 한다

  /* 원고는 서버에서 확실히 읽었을 때만 연다. get은 실패해도 null(=편집 없음)을 주므로, 그 빈 원고를 저장하면
     여덟 차시의 편집이 모두 지워진다. 캐시 사본도 다른 기기가 저장한 최신 편집보다 오래됐을 수 있어 받지 않는다 */
  const [loadErr, setLoadErr] = useState(false);
  const [loadTry, setLoadTry] = useState(0);
  const savedRef = useRef(null);     // 마지막으로 읽거나 저장한 원고: 저장 뒤 더는 쓰지 않는 그림을 가려내는 기준
  const uploadedRef = useRef(new Set()); // 이 화면에서 올린 그림 (저장 전에 뺀 것도 저장 때 정리한다)
  useEffect(() => {
    let live = true;
    setLoadErr(false);
    fbStore.getSafe(CONTENT_KEY).then((r) => {
      if (!live) return;
      if (!r.ok || r.fromCache) { setLoadErr(true); return; }
      const d = normalize(r.data);
      savedRef.current = d;
      setDraft(d);
    });
    return () => { live = false; };
  }, [loadTry]);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(""), 6000);
    return () => clearTimeout(t);
  }, [msg]);

  // 저장하지 않고 창을 닫으려 하면 붙잡는다
  useEffect(() => {
    if (!dirty) return;
    const h = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // 탭 이동(언마운트)으로도 원고가 사라지므로, 부모(교사 화면)가 이동을 막을 수 있게 dirty를 올린다
  useEffect(() => {
    if (onDirty) onDirty(dirty);
    return () => { if (onDirty) onDirty(false); };
  }, [dirty]);

  if (!draft && loadErr) return (
    <div className="card"><div className="card-body" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ flex: 1, minWidth: 220, color: "var(--seal)", fontSize: 13 }}>
        저장된 수업 편집을 서버에서 읽지 못했습니다. 이 상태로 고쳐 저장하면 다른 차시의 편집이 모두 지워질 수 있어 편집을 잠갔습니다. 연결을 확인한 뒤 다시 불러오세요.
      </span>
      <button className="btn small" onClick={() => setLoadTry((x) => x + 1)}>다시 불러오기</button>
    </div></div>
  );
  if (!draft) return <div className="card"><div className="card-body" style={{ color: "var(--sub)" }}>수업 내용을 불러오는 중…</div></div>;

  const L0 = lessonDefs.find((x) => x.n === n) || lessonDefs[0];
  const ovL = draft.lessons[String(n)] || null;
  const cur = mergeOne(L0, ovL);
  const secs = schemaDefs.filter((s) => s.session === L0.session);
  const edited = !!ovL || secs.some((s) => draft.secs[s.id] || s.fields.some((f) => draft.fields[s.id + "." + f.k]));

  const touch = (fn) => { setDraft(fn); setDirty(true); };
  // 고친 칸마다 그 칸이 기댄 원본의 지문(_base)을 함께 남긴다
  const secDef = (id) => schemaDefs.find((s) => s.id === id) || { fields: [] };
  const setL = (patch) => touch((d) => {
    const o = d.lessons[String(n)] || {};
    return { ...d, lessons: { ...d.lessons, [String(n)]: { ...o, ...patch, _base: baseOf(o, patch, (p) => lessonDef(L0, p)) } } };
  });
  const setSec = (id, patch) => touch((d) => {
    const o = d.secs[id] || {}, sd = secDef(id);
    return { ...d, secs: { ...d.secs, [id]: { ...o, ...patch, rev: SCHEMA_REV, _base: baseOf(o, patch, (p) => sd[p]) } } };
  });
  const setFld = (id, k, patch) => touch((d) => {
    const key = id + "." + k, o = d.fields[key] || {}, fd = secDef(id).fields.find((f) => f.k === k) || {};
    return { ...d, fields: { ...d.fields, [key]: { ...o, ...patch, rev: SCHEMA_REV, _base: baseOf(o, patch, (p) => fd[p]) } } };
  });

  /* 원본이 바뀌어 얹지 않은 편집: 「원래대로」는 그 칸의 편집을 버리고, 「그래도 적용」은 지금 원본에 기댄 것으로 표시한다 */
  const stale = staleEdits(draft, lessonDefs, schemaDefs);
  const defOfStale = (e) => {
    if (e.kind === "lessons") return lessonDef(lessonDefs.find((x) => String(x.n) === e.id) || {}, e.p);
    const [sid, fk] = e.id.split(".");
    const sd = secDef(e.kind === "secs" ? e.id : sid);
    return e.kind === "secs" ? sd[e.p] : (sd.fields.find((f) => f.k === fk) || {})[e.p];
  };
  const resolveStale = (list, keep) => touch((d) => {
    const nd = { ...d, lessons: { ...d.lessons }, secs: { ...d.secs }, fields: { ...d.fields } };
    list.forEach((e) => {
      const o = { ...(nd[e.kind][e.id] || {}) };
      const b = { ...(o._base || {}) };
      if (keep) b[e.p] = fingerprint(defOfStale(e));
      else { delete o[e.p]; delete b[e.p]; }
      o._base = b;
      const left = Object.keys(o).filter((k) => k !== "_base" && k !== "rev");
      if (left.length) nd[e.kind][e.id] = o; else delete nd[e.kind][e.id];
    });
    return nd;
  });
  const clip = (v) => { const s = typeof v === "string" ? v : isArr(v) ? (v.length + "개 항목") : "편집 내용"; return s.length > 60 ? s.slice(0, 60) + "…" : s; };

  const rds = isArr(cur.readings) ? cur.readings : [];
  const patchRd = (i, patch) => setL({ readings: rds.map((r, j) => (j === i ? { ...r, ...patch } : r)) });
  const moveRd = (i, d) => {
    const j = i + d;
    if (j < 0 || j >= rds.length) return;
    const next = rds.slice();
    next[i] = rds[j]; next[j] = rds[i];
    setL({ readings: next });
  };
  const delRd = (i) => { if (window.confirm("이 읽기 자료를 통째로 지울까요? 저장하기 전에는 「원래대로」로 되돌릴 수 있습니다.")) setL({ readings: rds.filter((_, j) => j !== i) }); };
  const addRd = () => setL({ readings: [...rds, { stage: "새 단계", h: "새 읽기 자료", p: [""], asks: [], images: [], works: [] }] });

  const flow = isArr(cur.flow) ? cur.flow : [];
  const patchFlow = (i, k, v) => setL({ flow: flow.map((r, j) => (j === i ? (k === 1 ? [r[0], Number(v) || 0, r[2]] : k === 0 ? [v, r[1], r[2]] : [r[0], r[1], v]) : r)) });

  const save = async () => {
    setBusy(true);
    const payload = { ...draft, updatedAt: new Date().toISOString() };
    // 문서 한도는 1MB인데 한글은 한 글자가 3바이트라 글자 수가 아니라 바이트로 잰다
    const size = utf8Bytes(JSON.stringify(payload));
    if (size > 800000) {
      setBusy(false);
      return setMsg("내용이 너무 많아 저장할 수 없습니다(지금 약 "
        + Math.round(size / 1024) + "KB, 한도 1MB). 그림은 파일 올리기 대신 주소 링크로 바꿔 주세요.");
    }
    if (!savedRef.current) { setBusy(false); return setMsg("원고를 서버에서 읽지 못해 저장하지 않습니다."); }
    const ok = await fbStore.setT(CONTENT_KEY, payload);
    setBusy(false);
    if (ok) {
      // 저장이 확인된 뒤에만, 이제 아무 데서도 쓰지 않는 그림 파일을 지운다 (「이 그림 빼기」·읽기 자료 삭제·원래대로)
      const now = teacherRefs(payload);
      const gone = new Set([...teacherRefs(savedRef.current), ...uploadedRef.current].filter((r) => !now.has(r)));
      gone.forEach((r) => { fbStore.remove("media:" + TEACHER + "_" + r); });
      savedRef.current = payload; uploadedRef.current = new Set();
      setContent(payload); setDirty(false); setMsg("저장했습니다. 학생 화면에 바로 반영됩니다.");
    }
    else setMsg("저장하지 못했습니다. 인터넷 연결을 확인하고 다시 눌러 주세요.");
  };

  const resetLesson = () => {
    if (!window.confirm(n + "차시의 편집 내용을 모두 지우고 원래 자료로 되돌릴까요? (저장을 눌러야 확정됩니다)")) return;
    touch((d) => {
      const lessons = { ...d.lessons }, ss = { ...d.secs }, ff = { ...d.fields };
      delete lessons[String(n)];
      secs.forEach((s) => { delete ss[s.id]; s.fields.forEach((f) => { delete ff[s.id + "." + f.k]; }); });
      return { ...d, lessons, secs: ss, fields: ff };
    });
    setMsg(n + "차시를 원래 자료로 되돌렸습니다. 저장을 눌러야 확정됩니다.");
  };

  return (
    <div className="ed-root">
      <div className="card">
        <div className="card-body" style={{ fontSize: 13, color: "var(--sub)" }}>
          차시별 발문·질문·이론 본문·그림·참고 링크를 여기서 고칩니다. 고친 내용은 <b>학생 화면의 강의 노트와 학습지에 그대로 반영</b>되고,
          「원래대로」를 누르면 처음 자료로 돌아갑니다. 원본은 지워지지 않으므로 마음껏 고쳐도 됩니다.
        </div>
      </div>

      <div className="t-tabs">
        {lessonDefs.map((L) => {
          const has = !!draft.lessons[String(L.n)] ||
            schemaDefs.filter((s) => s.session === L.session).some((s) => draft.secs[s.id] || s.fields.some((f) => draft.fields[s.id + "." + f.k]));
          return (
            <button key={L.n} className={"btn small " + (n === L.n ? "" : "ghost")} onClick={() => setN(L.n)}>
              {L.n}차시{has && <span className="ed-dot" title="고친 내용이 있음" />}
            </button>
          );
        })}
      </div>

      <div className={"ed-bar " + (dirty ? "on" : "")}>
        <span className="ed-state">{dirty ? "저장하지 않은 변경이 있습니다" : edited ? "저장됨 · 이 차시에 고친 내용이 있습니다" : "저장됨 · 원래 자료 그대로입니다"}</span>
        <button className="btn small ghost" onClick={() => setPreview((p) => !p)}>{preview ? "편집으로" : "학생 화면 미리보기"}</button>
        <button className="btn small ghost" onClick={resetLesson} disabled={!edited}>{n}차시 원래대로</button>
        <button className="btn small" onClick={save} disabled={busy}>{busy ? "저장 중…" : "저장"}</button>
      </div>
      {msg && <div className="ok-note">{msg}</div>}
      {stale.length > 0 && (
        <div className="card" style={{ borderColor: "var(--seal)" }}>
          <div className="card-head"><span className="card-code" style={{ color: "var(--seal)" }}>확인</span><span className="card-title">원본이 바뀌어 적용하지 않은 편집 {stale.length}건</span></div>
          <div className="card-body">
            <p style={{ fontSize: 13, marginBottom: 10 }}>
              아래 편집은 저장한 뒤 코드의 원본 자료가 바뀌었거나(그림 교체·용어 정정 등), 어느 원본을 고친 것인지 기록이 없는 옛 편집입니다.
              학생 화면에는 지금 원본이 보입니다. 편집을 다시 쓰려면 「그래도 적용」, 버리려면 「원래대로」를 누른 뒤 저장하세요.
            </p>
            <div className="tbl-scroll"><table className="roster">
              <thead><tr><th>위치</th><th>상태</th><th>편집 내용</th><th style={{ width: 170 }}></th></tr></thead>
              <tbody>
                {stale.map((e) => (
                  <tr key={e.kind + e.id + e.p}>
                    <td style={{ fontSize: 12 }}>{e.where}</td>
                    <td style={{ fontSize: 12 }}>{e.st === "changed" ? "원본이 바뀜" : "기준 기록 없음(옛 편집)"}</td>
                    <td style={{ fontSize: 12, color: "var(--sub)" }}>{clip(e.val)}</td>
                    <td>
                      <button className="btn small ghost" onClick={() => resolveStale([e], false)}>원래대로</button>{" "}
                      <button className="btn small ghost" onClick={() => resolveStale([e], true)}>그래도 적용</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button className="btn small ghost" onClick={() => { if (window.confirm(stale.length + "건을 모두 버리고 원본으로 둘까요? (저장을 눌러야 확정됩니다)")) resolveStale(stale, false); }}>모두 원래대로</button>
              <button className="btn small ghost" onClick={() => { if (window.confirm(stale.length + "건을 모두 지금 원본 위에 적용할까요? (저장을 눌러야 확정됩니다)")) resolveStale(stale, true); }}>모두 그래도 적용</button>
            </div>
          </div>
        </div>
      )}

      {preview ? (
        <div className="ed-preview">
          <p className="hint" style={{ marginBottom: 8 }}>학생에게 보이는 모습입니다(저장 전 내용 포함). 교사용 항목은 나타나지 않습니다.</p>
          {LessonPanel ? <LessonPanel L={cur} /> : null}
        </div>
      ) : (
        <div>
          <div className="card">
            <div className="card-head"><span className="card-code">기본</span><span className="card-title">차시 제목과 학습 목표</span></div>
            <div className="card-body">
              <EdText label="차시 제목" value={cur.title} onChange={(v) => setL({ title: v })} />
              <EdArea label="학습 목표" hint="한 줄에 하나씩." min={2} max={10}
                value={arrToLines(cur.goals)} onChange={(v) => setL({ goals: linesToArr(v) })} />
              <EdArea label="성취기준 (교사 화면에만 보임)" hint="한 줄에 하나씩." min={2} max={8}
                value={arrToLines(cur.stds)} onChange={(v) => setL({ stds: linesToArr(v) })} />
            </div>
          </div>

          <div className="card">
            <div className="card-head"><span className="card-code">발문</span><span className="card-title">오늘의 발문 · 안내</span></div>
            <div className="card-body">
              <EdArea label="학생 화면 강의 노트 맨 위에 띄울 글" min={3} max={12}
                hint="한 줄에 하나씩. 수업을 여는 발문이나 그날의 안내를 적습니다. 비워 두면 상자가 나타나지 않습니다."
                value={cur.notice} onChange={(v) => setL({ notice: v })}
                ph={"예: 이 그릇을 귀한 물건으로 보이게 만든 것은 무엇일까?\n예: 오늘은 모둠별로 다섯 후보의 순위를 정합니다."} />
            </div>
          </div>

          <div className="card">
            <div className="card-head"><span className="card-code">흐름</span><span className="card-title">120분 수업 흐름 (교사 화면에만 보임)</span></div>
            <div className="card-body">
              <table className="ed-flow">
                <thead><tr><th style={{ width: 110 }}>단계</th><th style={{ width: 70 }}>시간(분)</th><th>활동 · 발문</th><th style={{ width: 118 }}></th></tr></thead>
                <tbody>
                  {flow.map((r, i) => (
                    <tr key={i}>
                      <td><input value={r[0] || ""} onChange={(e) => patchFlow(i, 0, e.target.value)} /></td>
                      <td><input className="mono" value={r[1] == null ? "" : r[1]} onChange={(e) => patchFlow(i, 1, e.target.value)} /></td>
                      <td><textarea rows={growRows(r[2], 2, 8)} value={r[2] || ""} onChange={(e) => patchFlow(i, 2, e.target.value)} /></td>
                      <td className="ed-rowbtn">
                        <button className="btn small ghost" onClick={() => { if (i > 0) { const nx = flow.slice(); nx[i] = flow[i - 1]; nx[i - 1] = flow[i]; setL({ flow: nx }); } }} disabled={i === 0}>↑</button>
                        <button className="btn small ghost" onClick={() => { if (i < flow.length - 1) { const nx = flow.slice(); nx[i] = flow[i + 1]; nx[i + 1] = flow[i]; setL({ flow: nx }); } }} disabled={i === flow.length - 1}>↓</button>
                        <button className="btn small ghost" onClick={() => { if (window.confirm("이 단계를 지울까요?")) setL({ flow: flow.filter((_, j) => j !== i) }); }}>삭제</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="btn small ghost" onClick={() => setL({ flow: [...flow, ["새 단계", 10, ""]] })}>＋ 단계 추가</button>
              <p className="hint" style={{ marginTop: 8 }}>합계 {flow.reduce((a, r) => a + (Number(r[1]) || 0), 0)}분</p>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><span className="card-code">이론</span><span className="card-title">읽기 자료 · 그림 · 작품 링크</span></div>
            <div className="card-body">
              {rds.map((rd, i) => (
                <ReadingEditor key={i} rd={rd} i={i} count={rds.length} n={n} onPatch={patchRd} onMove={moveRd} onDel={delRd} onUploaded={(r) => uploadedRef.current.add(r)} />
              ))}
              <button className="btn small ghost" onClick={addRd}>＋ 읽기 자료 추가</button>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><span className="card-code">학습지</span><span className="card-title">학생이 답할 발문과 생각 단계·되묻기</span></div>
            <div className="card-body">
              {secs.length === 0 && <p className="hint">이 차시에는 학습지 항목이 없습니다.</p>}
              {secs.map((sec) => {
                const so = applicable(draft.secs[sec.id], (p) => sec[p], SEC_PROPS) || {};
                return (
                  <details className="ed-block" key={sec.id}>
                    <summary>
                      <span className="stage-tag">{sec.kind === "learn" ? "배움 확인" : sec.kind === "inquiry" ? "탐구 질문" : "기록"} {sec.code}</span>
                      {so.title != null ? so.title : sec.title}
                    </summary>
                    <div className="ed-block-in">
                      <EdText label="구간 제목" value={so.title != null ? so.title : sec.title} onChange={(v) => setSec(sec.id, { title: v })} />
                      <EdText label="구간 안내문" value={so.note != null ? so.note : (sec.note || "")} onChange={(v) => setSec(sec.id, { note: v })}
                        ph="비워 두면 안내문이 나타나지 않습니다." />
                      {sec.fields.map((f) => {
                        const fo = applicable(draft.fields[sec.id + "." + f.k], (p) => f[p], FIELD_PROPS) || {};
                        const label = fo.label != null ? fo.label : f.label;
                        const steps = isArr(fo.steps) ? fo.steps : (f.steps || []);
                        const probes = isArr(fo.probes) ? fo.probes : (f.probes || []);
                        const isInq = sec.kind === "inquiry" && f.t === "area";
                        return (
                          <div className="ed-fld" key={f.k}>
                            <div className="ed-fld-h"><span className="mono">{sec.id}.{f.k}{f.key ? " → 저장 " + f.key : ""}</span>{f.qtype && <span className="ed-qtype">{f.qtype}</span>}</div>
                            <EdArea label="발문 (학생에게 보이는 질문)" min={2} max={8} value={label} onChange={(v) => setFld(sec.id, f.k, { label: v })} />
                            {isInq ? (
                              /* 탐구 질문은 생각 계단 대신 되묻기를 쓴다 — 첫 답을 굳힌 뒤 학생마다 다른 줄이 배정된다 */
                              <EdArea label="되묻기 (첫 답을 확정한 뒤 배정되는 질문, 한 줄에 하나씩)"
                                hint="답의 보기를 나열하지 말고, 학생이 쓴 것을 가리키는 한 문장으로 씁니다. 학생마다 다른 줄이 배정되므로 다섯 줄쯤 둡니다. 비워 두면 원본으로 돌아갑니다."
                                min={3} max={10} value={arrToLines(probes)} onChange={(v) => setFld(sec.id, f.k, { probes: linesToArr(v) })} />
                            ) : (
                              <EdArea label="생각 단계 (학생 화면에는 「도움말」 상자로 보입니다)" hint="한 줄에 하나씩. 비워 두면 도우미 상자가 사라집니다." min={2} max={10}
                                value={arrToLines(steps)} onChange={(v) => setFld(sec.id, f.k, { steps: linesToArr(v) })} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </details>
                );
              })}
              <p className="hint">항목 이름(l1.q1 같은 것)은 기록이 저장되는 위치라 바뀌지 않습니다. 질문만 고쳐도 이미 저장된 학생 답은 그대로 남습니다. 화살표가 붙은 항목(유물 발상 단계 단계 3)은 오른쪽 키에 저장됩니다.</p>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><span className="card-code">근거</span><span className="card-title">설계 근거 (교사 화면에만 보임)</span></div>
            <div className="card-body">
              <EdText label="제목" value={(cur.pedagogy && cur.pedagogy.title) || ""}
                onChange={(v) => setL({ pedagogy: { title: v, p: (cur.pedagogy && cur.pedagogy.p) || [] } })} />
              <EdArea label="본문" hint="빈 줄 하나로 문단을 나눕니다." min={5} max={30}
                value={arrToParas(cur.pedagogy && cur.pedagogy.p)}
                onChange={(v) => setL({ pedagogy: { title: (cur.pedagogy && cur.pedagogy.title) || "", p: parasToArr(v) } })} />
            </div>
          </div>
        </div>
      )}

      <div className="ed-bar bottom">
        <span className="ed-state">{dirty ? "저장하지 않은 변경이 있습니다" : "저장됨"}</span>
        <button className="btn small" onClick={save} disabled={busy}>{busy ? "저장 중…" : "저장"}</button>
      </div>
    </div>
  );
}

/* ============================================================
   이 계층이 쓰는 모양
   ============================================================ */

export const CONTENT_CSS = `
/* 학생·교사 화면에 나타나는 것 */
.lz-notice{border:1px solid var(--seal);background:var(--seal-bg);padding:10px 14px;margin:0 0 12px}
.lz-notice-tag{display:inline-block;font-family:var(--mono);font-size:9px;letter-spacing:.14em;color:#fff;background:var(--seal);padding:2px 7px;margin-bottom:6px}
.lz-notice p{font-size:13.5px;line-height:1.75;margin:2px 0}
.lz-figs{display:flex;flex-wrap:wrap;gap:14px;margin:4px 0 14px}
.lz-fig{flex:1 1 260px;max-width:100%;margin:0}
.lz-img{display:block;width:100%;height:auto;border:1px solid var(--line);background:#fff}
.lz-fig figcaption{font-size:11.5px;color:var(--sub);line-height:1.6;padding-top:5px}
.lz-cr{display:block;font-family:var(--mono);font-size:11px;color:var(--sub)}
.lz-load{display:inline-block;font-size:11px;color:var(--sub);padding:6px 0}
.lz-asks{border-left:3px solid var(--patina);background:var(--patina-bg);padding:9px 14px;margin:4px 0 14px}
.lz-asks-h{font-family:var(--mono);font-size:9px;letter-spacing:.14em;color:var(--patina);margin-bottom:5px}
.lz-asks ul{margin:0;padding-left:18px}
.lz-asks li{font-size:13px;line-height:1.75;margin-bottom:3px}
.wk-links{display:flex;flex-wrap:wrap;gap:5px;margin-top:5px}
.wk-link{display:inline-block;font-size:11px;line-height:1.4;color:var(--seal);text-decoration:none;border:1px solid var(--line);background:#fff;padding:2px 7px;white-space:nowrap}
.wk-link:hover{background:var(--seal-bg);border-color:var(--seal)}

/* 편집 화면 */
.ed-root{padding-bottom:20px}
.ed-dot{display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--seal);margin-left:5px;vertical-align:middle}
.ed-bar{position:sticky;top:var(--sv-top,52px);z-index:15;display:flex;align-items:center;gap:8px;flex-wrap:wrap;
  background:var(--card);border:1px solid var(--line);padding:8px 12px;margin-bottom:14px}
.ed-bar.on{border-color:var(--seal);background:var(--seal-bg)}
.ed-bar.bottom{position:static;margin-top:6px}
.ed-state{font-size:12px;color:var(--sub);margin-right:auto}
.ed-f{margin-bottom:12px}
.ed-f label{display:block;font-size:12px;color:var(--sub);margin-bottom:5px}
.ed-f input,.ed-f textarea{width:100%;padding:8px 10px;border:1px solid var(--line);background:#fff;
  font-family:var(--sans);font-size:13.5px;line-height:1.7;color:var(--ink);border-radius:0}
.ed-f input.mono,.ed-link-row input.mono,.ed-img-add input.mono{font-family:var(--mono);font-size:12px}
.ed-f select{width:100%;padding:8px 10px;border:1px solid var(--line);background:#fff;font-family:var(--sans);font-size:13.5px;color:var(--ink);border-radius:0}
.ed-f input:focus,.ed-f textarea:focus{outline:2px solid var(--ink);outline-offset:-1px}
.ed-f .hint{display:block;margin-top:4px}
.ed-grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media(max-width:640px){.ed-grid2{grid-template-columns:1fr}}
.ed-block{border:1px solid var(--line);background:#fff;margin-bottom:10px}
.ed-block>summary{cursor:pointer;padding:9px 13px;font-family:var(--serif);font-size:13.5px;font-weight:700;
  list-style:none;display:flex;align-items:center;gap:7px}
.ed-block>summary::before{content:"＋";font-family:var(--mono);color:var(--seal);font-weight:400}
.ed-block[open]>summary::before{content:"－"}
.ed-block-in{padding:4px 14px 14px;border-top:1px solid var(--line2)}
.ed-block-bar{display:flex;gap:6px;flex-wrap:wrap;padding:10px 0}
.ed-flow{width:100%;border-collapse:collapse;font-size:12px}
.ed-flow th{background:var(--card2);border:1px solid var(--line2);padding:5px 8px;font-weight:500;color:var(--sub);text-align:left}
.ed-flow td{border:1px solid var(--line2);padding:4px 6px;vertical-align:top}
.ed-flow input,.ed-flow textarea{width:100%;padding:5px 6px;border:1px solid var(--line);background:#fff;
  font-family:var(--sans);font-size:12.5px;line-height:1.6;color:var(--ink);border-radius:0}
.ed-flow .mono{font-family:var(--mono);text-align:right}
.ed-rowbtn{white-space:nowrap}
.ed-rowbtn .btn{margin-right:3px}
.ed-links{display:flex;flex-direction:column;gap:6px}
.ed-link-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.ed-src-k{display:inline-flex;align-items:center;gap:4px;font-size:12px;color:var(--sub);white-space:nowrap}
.ed-link-row input{flex:1 1 160px;padding:6px 8px;border:1px solid var(--line);background:#fff;
  font-family:var(--sans);font-size:12.5px;color:var(--ink);border-radius:0}
.ed-imgs{display:flex;flex-direction:column;gap:12px}
.ed-img-row{display:flex;gap:12px;align-items:flex-start;border:1px solid var(--line2);background:var(--card2);padding:10px}
.ed-img-prev{flex:0 0 150px;max-width:150px}
.ed-img-prev .lz-fig{flex:1 1 auto}
.ed-img-fields{flex:1 1 240px;min-width:0}
.ed-img-fields .ed-f{margin-bottom:8px}
.ed-img-add{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.ed-img-add input{flex:1 1 220px;padding:6px 8px;border:1px solid var(--line);background:#fff;color:var(--ink);border-radius:0}
@media(max-width:640px){.ed-img-row{flex-direction:column}.ed-img-prev{flex:0 0 auto;max-width:100%}}
.ed-works{display:flex;flex-direction:column;gap:10px}
.ed-work{border:1px solid var(--line2);background:var(--card2);padding:10px 12px}
.ed-work-head{display:flex;align-items:center;gap:5px;margin-bottom:8px}
.ed-num{font-family:var(--mono);font-size:11px;color:var(--sub);margin-right:auto}
.ed-fld{border-top:1px dashed var(--line2);padding-top:10px;margin-top:10px}
.ed-fld-h{display:flex;align-items:center;gap:7px;margin-bottom:6px}
.ed-fld-h .mono{font-size:10px;color:var(--seal);letter-spacing:.06em}
.ed-qtype{font-family:var(--mono);font-size:9px;letter-spacing:.1em;background:var(--ink);color:var(--card);padding:1px 6px}
.ed-preview{border:1px dashed var(--line);padding:12px;background:var(--card2)}
`;

export function ContentStyle() { return <style>{CONTENT_CSS}</style>; }
