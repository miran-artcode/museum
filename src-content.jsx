/* ============================================================
   수업 내용 편집 계층 — 관리자 교사가 차시별 내용을 고치는 자리

   고칠 수 있는 것
     · 차시 제목 · 학습 목표 · 성취기준
     · 오늘의 발문 (학생 화면 강의 노트 맨 위에 뜨는 안내)
     · 120분 수업 흐름 (단계 · 시간 · 활동)
     · 읽기 자료(이론) — 소제목, 본문, 단계별 발문, 그림, 작품·자료 표
     · 작품·자료마다 붙는 설명 사이트 링크
     · 학습지 발문 (배움 확인 · 탐구 질문의 물음과 생각 단계)
     · 설계 근거(교사용)

   저장 방식
     코드에 있는 원본(LESSONS_DEF · SCHEMA_DEF)은 건드리지 않는다.
     교사가 고친 것만 Firestore 문서 misc/lessonEdits 에 덮어쓰기 층으로 쌓고,
     화면에 그릴 때 원본 위에 얹어 합친다. 「원래대로」를 누르면 그 층만 지워지고
     원본이 다시 보이므로 잘못 고쳐도 되돌릴 수 있다.
   ============================================================ */

import React, { useState, useEffect, useRef } from "react";
import { fbStore } from "./src-fb.js";

export const CONTENT_KEY = "lessonEdits";
const TEACHER = "teacher";
const isArr = Array.isArray;
const pick = (o, k, d) => (o && o[k] != null ? o[k] : d);

const emptyContent = () => ({ lessons: {}, secs: {}, fields: {} });

function normalize(c) {
  if (!c || typeof c !== "object") return emptyContent();
  return {
    lessons: c.lessons && typeof c.lessons === "object" ? c.lessons : {},
    secs: c.secs && typeof c.secs === "object" ? c.secs : {},
    fields: c.fields && typeof c.fields === "object" ? c.fields : {},
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

function mergeOne(L, o) {
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
    const s = so[sec.id];
    let touched = !!s;
    const fields = sec.fields.map((f) => {
      const o = fo[sec.id + "." + f.k];
      if (!o) return f;
      touched = true;
      const steps = isArr(o.steps) ? (o.steps.length ? o.steps : undefined) : f.steps;
      return { ...f, label: pick(o, "label", f.label), steps };
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
  const pic = <img className="lz-img" src={url} alt={img.cap || "수업 자료 그림"} loading="lazy" />;
  const cap = img.cap || img.credit || img.link;
  return (
    <figure className="lz-fig">
      {img.link ? <a href={img.link} target="_blank" rel="noopener noreferrer">{pic}</a> : pic}
      {cap && (
        <figcaption>
          {img.cap}
          {img.credit && <span className="lz-cr">{img.credit}</span>}
          {img.link && <a className="wk-link" href={img.link} target="_blank" rel="noopener noreferrer">원본 보기 ↗</a>}
        </figcaption>
      )}
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
      <div className="lz-asks-h">생각해 볼 물음</div>
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
      <span className="lz-notice-tag">오늘의 발문</span>
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
      cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
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
          {l.u && <a className="wk-link" href={l.u} target="_blank" rel="noopener noreferrer">열기 ↗</a>}
          <button className="btn small ghost" onClick={() => onChange(ls.filter((_, j) => j !== i))}>삭제</button>
        </div>
      ))}
      <button className="btn small ghost" onClick={() => onChange([...ls, { t: "", u: "" }])}>＋ 설명 링크 추가</button>
    </div>
  );
}

/* 그림 목록 편집 — 파일 올리기와 주소 붙여넣기 둘 다 된다 */
function ImageEditor({ images, onChange, slot }) {
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
    if (x && typeof x.src === "string" && x.src.slice(0, 2) === "m:") fbStore.remove("media:" + TEACHER + "_" + x.src.slice(2));
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
function ReadingEditor({ rd, i, count, n, onPatch, onMove, onDel }) {
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
        <EdArea label="이론·설명 본문" hint="빈 줄 하나로 문단을 나눕니다." min={6} max={40}
          value={arrToParas(rd.p)} onChange={(v) => onPatch(i, { p: parasToArr(v) })} />
        <EdArea label="이 단계에서 던질 발문" hint="한 줄에 하나씩. 학생 화면에 「생각해 볼 물음」 상자로 보입니다. 비워 두면 상자가 나타나지 않습니다." min={2} max={12}
          value={arrToLines(rd.asks)} onChange={(v) => onPatch(i, { asks: linesToArr(v) })} />
        <div className="ed-f"><label>그림·사진</label>
          <ImageEditor images={rd.images} slot={"L" + n + "r" + i} onChange={(v) => onPatch(i, { images: v })} /></div>
        <div className="ed-f"><label>작품·자료 표</label>
          <WorksEditor works={rd.works} onChange={(v) => onPatch(i, { works: v })} /></div>
      </div>
    </details>
  );
}

export function ContentEditor({ lessonDefs, schemaDefs, LessonPanel }) {
  const [draft, setDraft] = useState(null);
  const [n, setN] = useState(lessonDefs[0] ? lessonDefs[0].n : 1);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    let live = true;
    fbStore.get(CONTENT_KEY).then((v) => { if (live) setDraft(normalize(v)); });
    return () => { live = false; };
  }, []);

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

  if (!draft) return <div className="card"><div className="card-body" style={{ color: "var(--sub)" }}>수업 내용을 불러오는 중…</div></div>;

  const L0 = lessonDefs.find((x) => x.n === n) || lessonDefs[0];
  const ovL = draft.lessons[String(n)] || null;
  const cur = mergeOne(L0, ovL);
  const secs = schemaDefs.filter((s) => s.session === L0.session);
  const edited = !!ovL || secs.some((s) => draft.secs[s.id] || s.fields.some((f) => draft.fields[s.id + "." + f.k]));

  const touch = (fn) => { setDraft(fn); setDirty(true); };
  const setL = (patch) => touch((d) => ({ ...d, lessons: { ...d.lessons, [String(n)]: { ...(d.lessons[String(n)] || {}), ...patch } } }));
  const setSec = (id, patch) => touch((d) => ({ ...d, secs: { ...d.secs, [id]: { ...(d.secs[id] || {}), ...patch } } }));
  const setFld = (id, k, patch) => touch((d) => ({ ...d, fields: { ...d.fields, [id + "." + k]: { ...(d.fields[id + "." + k] || {}), ...patch } } }));

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
    const ok = await fbStore.set(CONTENT_KEY, payload);
    setBusy(false);
    if (ok) { setContent(payload); setDirty(false); setMsg("저장했습니다. 학생 화면에 바로 반영됩니다."); }
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
                <ReadingEditor key={i} rd={rd} i={i} count={rds.length} n={n} onPatch={patchRd} onMove={moveRd} onDel={delRd} />
              ))}
              <button className="btn small ghost" onClick={addRd}>＋ 읽기 자료 추가</button>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><span className="card-code">학습지</span><span className="card-title">학생이 답할 발문과 생각 단계</span></div>
            <div className="card-body">
              {secs.length === 0 && <p className="hint">이 차시에는 학습지 항목이 없습니다.</p>}
              {secs.map((sec) => {
                const so = draft.secs[sec.id] || {};
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
                        const fo = draft.fields[sec.id + "." + f.k] || {};
                        const label = fo.label != null ? fo.label : f.label;
                        const steps = isArr(fo.steps) ? fo.steps : (f.steps || []);
                        return (
                          <div className="ed-fld" key={f.k}>
                            <div className="ed-fld-h"><span className="mono">{sec.id}.{f.k}</span>{f.qtype && <span className="ed-qtype">{f.qtype}</span>}</div>
                            <EdArea label="발문 (학생에게 보이는 물음)" min={2} max={8} value={label} onChange={(v) => setFld(sec.id, f.k, { label: v })} />
                            <EdArea label="생각 단계 도우미" hint="한 줄에 하나씩. 비워 두면 도우미 상자가 사라집니다." min={2} max={10}
                              value={arrToLines(steps)} onChange={(v) => setFld(sec.id, f.k, { steps: linesToArr(v) })} />
                          </div>
                        );
                      })}
                    </div>
                  </details>
                );
              })}
              <p className="hint">항목 이름(l1.q1 같은 것)은 기록이 저장되는 자리라 바뀌지 않습니다. 물음만 고쳐도 이미 저장된 학생 답은 그대로 남습니다.</p>
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
.lz-cr{display:block;font-family:var(--mono);font-size:10px;color:var(--sub);opacity:.85}
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
.ed-bar{position:sticky;top:52px;z-index:15;display:flex;align-items:center;gap:8px;flex-wrap:wrap;
  background:var(--card);border:1px solid var(--line);padding:8px 12px;margin-bottom:14px}
.ed-bar.on{border-color:var(--seal);background:var(--seal-bg)}
.ed-bar.bottom{position:static;margin-top:6px}
.ed-state{font-size:12px;color:var(--sub);margin-right:auto}
.ed-f{margin-bottom:12px}
.ed-f label{display:block;font-size:12px;color:var(--sub);margin-bottom:5px}
.ed-f input,.ed-f textarea{width:100%;padding:8px 10px;border:1px solid var(--line);background:#fff;
  font-family:var(--sans);font-size:13.5px;line-height:1.7;color:var(--ink);border-radius:0}
.ed-f input.mono,.ed-link-row input.mono,.ed-img-add input.mono{font-family:var(--mono);font-size:12px}
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
