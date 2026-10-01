/* ============================================================
   생성과 다듬기 포트폴리오: 카드와 편집기가 함께 쓰는 작은 부품 (spec §5.4 src-folio-ui.jsx, §3.9, §4.12)
   NoteField · PfConfirm · Seg · PfNav · PfViewer · WipeSlider · CompareView · ProcessSlides · IconBtn · Range · Status
   (덧붙임, contract-log U7–U9: PfImg · loadMedia · useAutoGrow)
   · 화면 문구는 src-portfolio-text.mjs의 T에서 가져온다(이 파일에 한글 문자열을 두지 않는다).
   · PfNav와 PfViewer는 입력 잠금(fieldset disabled)과 상관없이 보기용으로 늘 작동한다.
     PfViewer는 document.body에 portal로 그리므로 잠긴 fieldset 밖에 있고, 그 안의 슬라이더·이전·다음 버튼이 그대로 움직인다.
   · 끌기가 있는 곳(슬라이더, 비교 화면)은 user-select:none을 다시 건다. src-guard.jsx가 data-guard="off" 안에서
     글자 선택을 되살리기 때문이다.
   ============================================================ */
import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { T, fmt, STAGE_TEXT } from "./src-portfolio-text.mjs";
import { clipJson, utf8Len } from "./src-portfolio-core.mjs";
import { STAGES } from "./src-folio-schema.mjs";

const usedBytes = (s) => utf8Len(JSON.stringify(String(s || ""))) - 2;

/* ---------- 미디어 읽기 (ref는 바뀌지 않으므로 ref별로 기억해 둔다) ---------- */
// owner|ref → Promise<{ ok, data, missing }>. 실패는 기억하지 않는다(다음에 다시 읽는다).
const mediaMem = new Map();
const MEM_MAX = 28, MEM_CHARS = 14e6;
let memChars = 0;
function trimMem() {
  while (mediaMem.size > MEM_MAX || memChars > MEM_CHARS) {
    const k = mediaMem.keys().next().value;
    const e = mediaMem.get(k);
    mediaMem.delete(k);
    memChars -= (e && e.n) || 0;
    if (mediaMem.size === 0) { memChars = 0; break; }
  }
}
/** → Promise<{ ok:boolean, data:string|null, missing:boolean }> through store.getSafe (store.get as a fallback); cached per ref */
export function loadMedia(store, owner, ref) {
  if (!ref || !store) return Promise.resolve({ ok: false, data: null, missing: false });
  const k = String(owner) + "|" + ref;
  const hit = mediaMem.get(k);
  if (hit) { mediaMem.delete(k); mediaMem.set(k, hit); return hit.p; }
  const p = (async () => {
    try {
      if (typeof store.getSafe === "function") {
        const r = await store.getSafe(owner, ref);
        if (!r || !r.ok) return { ok: false, data: null, missing: false };
        const d = typeof r.data === "string" && /^data:image\//.test(r.data) ? r.data : null;
        return { ok: !!d, data: d, missing: !r.data };
      }
      const d = await store.get(owner, ref);
      return { ok: typeof d === "string" && /^data:image\//.test(d), data: typeof d === "string" ? d : null, missing: !d };
    } catch (e) { return { ok: false, data: null, missing: false }; }
  })();
  const entry = { p, n: 0 };
  mediaMem.set(k, entry);
  p.then((r) => {
    if (!r.ok) { if (mediaMem.get(k) === entry) mediaMem.delete(k); return; }
    entry.n = r.data.length; memChars += entry.n; trimMem();
  });
  return p;
}
/** forget every remembered image (sign-out on a shared PC) */
export function clearMedia() { mediaMem.clear(); memChars = 0; }
/** remember a data URL we just uploaded (so the card shows it without reading it back) */
export function primeMedia(owner, ref, data) {
  if (!ref || typeof data !== "string") return;
  const k = String(owner) + "|" + ref;
  if (mediaMem.has(k)) return;
  mediaMem.set(k, { p: Promise.resolve({ ok: true, data, missing: false }), n: data.length });
  memChars += data.length; trimMem();
}

function useMedia(store, owner, ref) {
  const [st, setSt] = useState({ ref: null, ok: false, data: null, done: false });
  useEffect(() => {
    let live = true;
    if (!ref) { setSt({ ref: null, ok: false, data: null, done: true }); return undefined; }
    setSt((s) => (s.ref === ref ? s : { ref, ok: false, data: null, done: false }));
    loadMedia(store, owner, ref).then((r) => { if (live) setSt({ ref, ok: r.ok, data: r.data, done: true }); });
    return () => { live = false; };
  }, [store, owner, ref]);
  return st.ref === ref ? st : { ref, ok: false, data: null, done: !ref };
}

/** an image from the media store: 「불러오는 중」 while loading, a grey box with 「이미지를 불러오지 못했습니다」 when it cannot be read */
export function PfImg({ store, owner, refId, alt, className, style, fit = "contain" }) {
  const m = useMedia(store, owner, refId);
  const cls = "pf-img" + (className ? " " + className : "");
  if (!refId) return <span className={cls + " pf-img-none"} style={style} aria-hidden="true" />;
  if (!m.done) return <span className={cls + " pf-img-wait"} style={style}><span>{T.loading}</span></span>;
  if (!m.ok) return <span className={cls + " pf-img-bad"} style={style} role="img" aria-label={alt ? alt + ": " + T.imgUnreadable : T.imgUnreadable}><span>{T.imgUnreadable}</span></span>;
  return <img className={cls} style={{ objectFit: fit, ...(style || {}) }} src={m.data} alt={alt || ""} draggable={false} />;
}

/** auto height for a textarea that grows with its text (field-sizing:content where supported) */
export function useAutoGrow(ref, value) {
  useLayoutEffect(() => {
    const t = ref.current;
    if (!t || (typeof CSS !== "undefined" && CSS.supports && CSS.supports("field-sizing", "content"))) return;
    t.style.height = "auto";
    if (t.scrollHeight > 0) t.style.height = t.scrollHeight + 2 + "px";
  }, [ref, value]);
}

/* ---------- 글 칸 ---------- */
/** controlled textarea bound to ws; maxLength = maxB; clips with clipJson; counter 「거의 다 찼습니다」 at 85 %; no placeholder.
 *  readOnly renders the text (no textarea), so only one editable instance of a note exists at a time. */
export function NoteField({ id, label, value, maxB, onChange, readOnly, dataFk, rows = 2, hint }) {
  const auto = useId();
  const fid = id || "pf-n" + auto.replace(/[^a-zA-Z0-9]/g, "");
  const v = typeof value === "string" ? value : "";
  const near = maxB > 0 && usedBytes(v) >= 0.85 * maxB;
  const ta = useRef(null);
  useAutoGrow(ta, v);
  const desc = [hint ? fid + "-q" : "", near && !readOnly ? fid + "-c" : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className="pf-note" data-fk={dataFk || undefined}>
      {readOnly
        ? <span className="pf-lb" id={fid + "-l"}>{label}</span>
        : <label className="pf-lb" htmlFor={fid}>{label}</label>}
      {hint ? <span className="pf-q" id={fid + "-q"}>{hint}</span> : null}
      {readOnly
        ? <div className={"pf-ro" + (v ? "" : " empty")} id={fid} aria-labelledby={fid + "-l"}>{v || T.missing}</div>
        : <textarea ref={ta} id={fid} className="pf-ta" rows={rows} value={v} maxLength={maxB || undefined} aria-describedby={desc}
            onChange={(e) => onChange && onChange(maxB ? clipJson(e.target.value, maxB) : e.target.value)} />}
      {near && !readOnly ? <span className="pf-full" id={fid + "-c"}>{T.almostFull}</span> : null}
    </div>
  );
}

/* ---------- 두 번 누르는 확인 버튼 (src-ux.jsx ConfirmButton과 같은 사용법) ---------- */
/** local copy of the ConfirmButton API: label, ask, onConfirm, precheck, disabled, className, yes, no.
 *  Armed: focus moves to 「yes」; Esc or 「no」 disarms and returns focus; leaving the group disarms. */
export function PfConfirm({ label, ask, onConfirm, precheck, disabled, className = "btn", yes = T.yes, no = T.no, describedBy, ariaLabel }) {
  const [armed, setArmed] = useState(false);
  const back = useRef(false);
  const btn = useRef(null), yesRef = useRef(null), grp = useRef(null);
  useEffect(() => {
    if (armed && yesRef.current) yesRef.current.focus();
    if (!armed && back.current && btn.current) { back.current = false; btn.current.focus(); }
  }, [armed]);
  if (armed && !disabled) {
    const off = (focusBack) => { back.current = !!focusBack; setArmed(false); };
    return (
      <span className="pf-cfm" role="group" aria-label={ask} ref={grp}
        onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); off(true); } }}
        onBlur={(e) => { if (grp.current && e.relatedTarget && !grp.current.contains(e.relatedTarget)) off(false); }}>
        <span className="pf-cfm-q">{ask}</span>
        <button type="button" ref={yesRef} className="btn small seal" onClick={() => { off(true); onConfirm && onConfirm(); }}>{yes}</button>
        <button type="button" className="btn small ghost" onClick={() => off(true)}>{no}</button>
      </span>
    );
  }
  return (
    <button type="button" ref={btn} className={className} disabled={disabled} aria-describedby={describedBy} aria-label={ariaLabel}
      onClick={() => { if (precheck && precheck() === false) return; setArmed(true); }}>{label}</button>
  );
}

/* ---------- 고르기 ---------- */
/** role="group" + aria-pressed; option i has code i + base; pressing the selected option writes `none`.
 *  Additions (contract-log U8): optDisabled[i], optNote[i] (a small mark such as 「기본」), id, describedBy. */
export function Seg({ label, options, value, onChange, disabled, clearable = true, base = 1, none = 0, optDisabled, optNote, id, describedBy }) {
  return (
    <div className="seg pf-seg" role="group" aria-label={label} id={id} aria-describedby={describedBy}>
      {(options || []).map((o, i) => {
        const code = i + base, on = value === code;
        const dis = !!disabled || !!(optDisabled && optDisabled[i]);
        return (
          <button key={i} type="button" aria-pressed={on} disabled={dis} className={on ? "on" : undefined}
            onClick={() => { if (!onChange) return; if (on) { if (clearable) onChange(none); } else onChange(code); }}>
            {o}{optNote && optNote[i] ? <span className="pf-seg-note">{optNote[i]}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- 보기 전용 조작 ---------- */
/** <div role tabIndex=0> with Enter/Space; not disabled by a disabled fieldset; for view-only controls (§3.9).
 *  Additions (contract-log U8): className, id, tabIndex, title, describedBy. */
export function PfNav({ role = "button", label, onActivate, pressed, expanded, selected, controls, children, className, id, tabIndex, title, describedBy }) {
  return (
    <div className={"pf-nav" + (className ? " " + className : "")} id={id} role={role} tabIndex={tabIndex == null ? 0 : tabIndex}
      aria-label={label} title={title} aria-pressed={pressed} aria-expanded={expanded} aria-selected={selected} aria-controls={controls}
      aria-describedby={describedBy}
      onClick={(e) => { if (onActivate) onActivate(e); }}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (onActivate) onActivate(e); }
      }}>
      {children}
    </div>
  );
}

/* ---------- 페이지 스크롤 잠금 (검토 r4 F1) ----------
   편집기 덧창과 크게 보기 창이 겹쳐 열리고 닫히는 순서가 바뀌어도 body 스크롤이 돌아오도록 횟수를 센다.
   처음 잠글 때의 overflow를 기억했다가 마지막 잠금이 풀릴 때 되돌린다. */
let scrollLocks = 0, scrollSaved = "";
/** reference-counted body scroll lock shared by PfViewer and the editor overlay → unlock() (idempotent) */
export function lockScroll() {
  if (typeof document === "undefined" || !document.body) return () => {};
  if (scrollLocks === 0) { scrollSaved = document.body.style.overflow; document.body.style.overflow = "hidden"; }
  scrollLocks++;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    scrollLocks = Math.max(0, scrollLocks - 1);
    if (scrollLocks === 0 && document.body) document.body.style.overflow = scrollSaved;
  };
}

/* ---------- 크게 보기 창 ---------- */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
/** createPortal into document.body: <div role="dialog" aria-modal="true" data-guard="off">, focus trap, Esc closes, focus returns */
export function PfViewer({ open, onClose, label, openerRef, children }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return undefined;
    const opener = (openerRef && openerRef.current) || (typeof document !== "undefined" ? document.activeElement : null);
    const unlock = lockScroll();
    const t = setTimeout(() => { const c = ref.current && ref.current.querySelector(".pf-vw-close"); if (c) c.focus(); else if (ref.current) ref.current.focus(); }, 0);
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (closeRef.current) closeRef.current(); return; }
      if (e.key !== "Tab" || !ref.current) return;
      const extra = [...document.querySelectorAll(".ax-float, .paste-ask")].flatMap((x) => [...x.querySelectorAll(FOCUSABLE)]);
      const list = [...ref.current.querySelectorAll(FOCUSABLE), ...extra].filter((x) => x.offsetParent !== null || x === document.activeElement);
      if (!list.length) { e.preventDefault(); return; }
      const i = list.indexOf(document.activeElement);
      const j = e.shiftKey ? (i <= 0 ? list.length - 1 : i - 1) : (i < 0 || i >= list.length - 1 ? 0 : i + 1);
      e.preventDefault();
      list[j].focus();
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey, true);
      unlock();
      if (opener && opener.focus && opener.isConnected) { try { opener.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    };
  }, [open]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="pf-vw pf-viewer" role="dialog" aria-modal="true" aria-label={label} data-guard="off" tabIndex={-1} ref={ref}
      onMouseDown={(e) => { if (e.target === e.currentTarget && closeRef.current) closeRef.current(); }}>
      <div className="pf-vw-box">
        <div className="pf-vw-top">
          <span className="pf-vw-t">{label}</span>
          <button type="button" className="btn small ghost pf-vw-close" onClick={() => closeRef.current && closeRef.current()}>{T.viewerClose}</button>
        </div>
        <div className="pf-vw-body">{children}</div>
      </div>
    </div>,
    document.body);
}

/* ---------- 전후 비교 ---------- */
/** the native range of §4.12, shared with ComparePanel. 「다듬기 전」 is on the left: value = the divider position from the left
 *  = the share of 「다듬기 전」 (0..100); 「다듬기 후」 shows 100 − value (contract-log U25, D24) */
export function WipeSlider({ value, onChange, label = T.wipeLabel }) {
  const v = Math.max(0, Math.min(100, Math.round(Number(value) || 0)));
  return <input type="range" className="pf-wipe pe-range" min={0} max={100} step={1} value={v} aria-label={label}
    aria-valuetext={fmt(T.wipeValue, { a: v, b: 100 - v })} onChange={(e) => onChange && onChange(Number(e.target.value))}
    onInput={(e) => onChange && onChange(Number(e.target.value))} />;
}

/** a {ref} from the store or a {canvas} drawn as a copy */
function Pic({ src, store, owner, alt, className }) {
  const cv = useRef(null);
  const canvas = src && src.canvas;
  useEffect(() => {
    if (!canvas || !cv.current) return;
    const c = cv.current;
    c.width = canvas.width; c.height = canvas.height;
    const x = c.getContext("2d");
    if (x) { x.clearRect(0, 0, c.width, c.height); x.drawImage(canvas, 0, 0); }
  }, [canvas]);
  if (canvas) return <canvas ref={cv} className={"pf-img " + (className || "")} role="img" aria-label={alt} />;
  return <PfImg store={store} owner={owner} refId={src && src.ref} alt={alt} className={className} />;
}

/** image-only 슬라이더 and 나란히; before/after {ref}|{canvas}; mode "wipe" | "side" (the student can switch) */
export function CompareView({ before, after, store, owner, mode }) {
  const [m, setM] = useState(mode === "side" ? "side" : "wipe");
  const [pos, setPos] = useState(50);
  useEffect(() => { if (mode === "side" || mode === "wipe") setM(mode); }, [mode]);
  if (!after || (!after.ref && !after.canvas)) {
    return (
      <div className="pf-cmp">
        <figure className="pf-cmp-fig"><Pic src={before} store={store} owner={owner} alt={T.refineBefore} className="pf-cmp-img" />
          <figcaption>{T.refineBefore}</figcaption></figure>
        <p className="pf-cmp-none">{T.notExported}</p>
      </div>
    );
  }
  return (
    <div className="pf-cmp" data-mode={m}>
      <div className="seg pf-seg pf-cmp-mode" role="group" aria-label={T.cmpMode}>
        <button type="button" aria-pressed={m === "wipe"} className={m === "wipe" ? "on" : undefined} onClick={() => setM("wipe")}>{T.wipeView}</button>
        <button type="button" aria-pressed={m === "side"} className={m === "side" ? "on" : undefined} onClick={() => setM("side")}>{T.wideView}</button>
      </div>
      {m === "wipe" ? (
        <div className="pf-cmp-wipe">
          <div className="pf-cmp-stage">
            <Pic src={before} store={store} owner={owner} alt={T.refineBefore} className="pf-cmp-img" />
            <div className="pf-cmp-top" style={{ clipPath: "inset(0 0 0 " + pos + "%)" }}>
              <Pic src={after} store={store} owner={owner} alt={T.refineAfter} className="pf-cmp-img" />
            </div>
            <span className="pf-cmp-line" style={{ left: pos + "%" }} aria-hidden="true" />
            <span className="pf-cmp-tag l" aria-hidden="true">{T.refineBefore}</span>
            <span className="pf-cmp-tag r" aria-hidden="true">{T.refineAfter}</span>
          </div>
          <WipeSlider value={pos} onChange={setPos} />
        </div>
      ) : (
        <div className="pf-cmp-side">
          <figure className="pf-cmp-fig"><Pic src={before} store={store} owner={owner} alt={T.refineBefore} className="pf-cmp-img" /><figcaption>{T.refineBefore}</figcaption></figure>
          <figure className="pf-cmp-fig"><Pic src={after} store={store} owner={owner} alt={T.refineAfter} className="pf-cmp-img" /><figcaption>{T.refineAfter}</figcaption></figure>
        </div>
      )}
    </div>
  );
}

/** 「원본」 then each stage snapshot in stage order, captioned with the stage name; 이전/다음 buttons, no autoplay */
export function ProcessSlides({ base, snaps, store, owner }) {
  const list = [];
  if (base && base.ref) list.push({ ref: base.ref, cap: T.original });
  (Array.isArray(snaps) ? snaps : []).filter((s) => s && s.ref && STAGES[s.s])
    .slice().sort((a, b) => a.s - b.s)
    .forEach((s) => list.push({ ref: s.ref, cap: STAGE_TEXT[STAGES[s.s]].name }));
  const [i, setI] = useState(0);
  const n = list.length;
  const k = Math.min(i, Math.max(0, n - 1));
  if (!n) return <p className="pf-cmp-none">{T.noSlides}</p>;
  const cur = list[k];
  return (
    <div className="pf-slides">
      <figure className="pf-slide">
        <PfImg store={store} owner={owner} refId={cur.ref} alt={cur.cap} className="pf-slide-img" />
        <figcaption><span className="pf-slide-n">{fmt(T.slideOf, { i: k + 1, n })}</span> {cur.cap}</figcaption>
      </figure>
      <div className="pf-slide-nav">
        <button type="button" className="btn small ghost" disabled={k <= 0} onClick={() => setI(k - 1)}>{T.prev}</button>
        <span className="ax-sr" aria-live="polite">{fmt(T.slideOf, { i: k + 1, n }) + " " + cur.cap}</span>
        <button type="button" className="btn small ghost" disabled={k >= n - 1} onClick={() => setI(k + 1)}>{T.next}</button>
      </div>
    </div>
  );
}

/* ---------- 작은 부품 ---------- */
/** title = aria-label; SVG aria-hidden */
export function IconBtn({ icon, label, onClick, pressed, disabled }) {
  return (
    <button type="button" className="pf-icon" aria-label={label} title={label} aria-pressed={pressed} disabled={disabled} onClick={onClick}>
      {icon ? <span aria-hidden="true" className="pf-icon-g">{icon}</span> : null}
    </button>
  );
}

/** commit on pointerup/keyup only (onInput fires while dragging) */
export function Range({ label, min, max, step, value, onInput, onCommit, valueText, disabled, id }) {
  return <input type="range" className="pf-range pe-range" id={id} min={min} max={max} step={step} value={value} disabled={disabled}
    aria-label={label} aria-valuetext={valueText}
    onChange={(e) => onInput && onInput(Number(e.target.value))}
    onPointerUp={(e) => onCommit && onCommit(Number(e.currentTarget.value))}
    onKeyUp={(e) => onCommit && onCommit(Number(e.currentTarget.value))} />;
}

/** pill translate="no" + .ax-sr role status/alert. Both live regions stay mounted so a change is announced. */
export function Status({ text, err }) {
  return (
    <div className="pf-status-w">
      <span className="ax-sr" role="status">{text && !err ? text : ""}</span>
      <span className="ax-sr" role="alert">{text && err ? text : ""}</span>
      {text ? <p className={"pf-status" + (err ? " err" : "")}><span className="pf-pill" translate="no" aria-hidden="true">{text}</span></p> : null}
    </div>
  );
}

export const FOLIO_UI_CSS = `
.pf-note{display:flex;flex-direction:column;gap:3px;margin:0 0 12px}
.pf-lb{display:block;font-size:14px;font-weight:600;color:var(--ink)}
.pf-q{display:block;font-size:13px;color:var(--sub);line-height:1.55}
.pf-ta,.pf-in{width:100%;box-sizing:border-box;padding:8px 10px;border:1px solid var(--line);background:#fff;font-family:var(--sans);font-size:14px;line-height:1.6;color:var(--ink);border-radius:0;resize:vertical;field-sizing:content;min-height:2.6em}
.pf-in{min-height:0}
.pf-ta:focus,.pf-in:focus{outline:2px solid var(--ink);outline-offset:-1px}
.pf-ta[readonly],.pf-in[readonly]{background:var(--card2);color:var(--ink);border-style:solid}
.pf-ro{padding:6px 10px;border-left:2px solid var(--line);background:var(--card2);font-size:14px;white-space:pre-wrap;word-break:keep-all;overflow-wrap:anywhere}
.pf-ro.empty{color:var(--sub)}
.pf-full{font-size:12px;color:var(--seal)}
.pf-seg{display:flex;flex-wrap:wrap;gap:4px}
.pf-seg button{padding:5px 10px;border:1px solid var(--line);background:#fff;font-size:13px;cursor:pointer;font-family:var(--sans);color:var(--ink);line-height:1.4;min-height:32px}
.pf-seg button[aria-pressed="true"]{background:var(--ink);border-color:var(--ink);color:var(--card)}
.pf-seg button:disabled{cursor:not-allowed;opacity:.55;border-style:dashed}
.pf-seg-note{font-size:11px;margin-left:4px;padding:0 4px;border:1px solid currentColor}
.pf-nav{cursor:pointer}
.pf-nav:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
.pf-cfm{display:inline-flex;flex-wrap:wrap;align-items:center;gap:6px;padding:6px 8px;border:1px solid var(--seal);background:var(--seal-bg)}
.pf-cfm-q{font-size:13px;flex:1 1 220px}
.pf-img{display:block;max-width:100%;background:var(--card2)}
.pf-img-wait,.pf-img-bad,.pf-img-none{display:flex;align-items:center;justify-content:center;font-size:11.5px;color:var(--sub);background:var(--card2);text-align:center;line-height:1.35;padding:4px}
.pf-img-none{border:1px dashed var(--line);background:transparent}
.pf-vw{position:fixed;inset:0;z-index:5020;background:rgba(20,20,16,.82);display:flex;align-items:center;justify-content:center;padding:12px;font-family:var(--sans);color:var(--ink)}
.pf-vw-box{background:var(--card);width:min(1100px,100%);max-height:100%;display:flex;flex-direction:column;border:1px solid var(--line)}
.pf-vw-top{display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid var(--line)}
.pf-vw-t{font-weight:600;font-size:15px;flex:1}
.pf-vw-body{padding:12px;overflow:auto}
.pf-vw-body > .pf-img{margin:0 auto;max-height:calc(100dvh - 140px);width:auto}
.pf-wipe,.pf-range{width:100%;accent-color:var(--ink)}
.pf-cmp{display:flex;flex-direction:column;gap:10px}
.pf-cmp-mode{align-self:flex-start}
.pf-cmp-wipe{display:flex;flex-direction:column;gap:8px;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
.pf-cmp-stage{position:relative;width:100%;height:min(62dvh,620px);background:#1d1d1a;overflow:hidden}
.pf-cmp-stage .pf-cmp-img,.pf-cmp-top{position:absolute;inset:0;width:100%;height:100%}
.pf-cmp-stage .pf-cmp-img{object-fit:contain;background:transparent}
.pf-cmp-line{position:absolute;top:0;bottom:0;width:2px;margin-left:-1px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.4)}
.pf-cmp-tag{position:absolute;top:6px;font-size:12px;padding:1px 6px;background:rgba(0,0,0,.6);color:#fff}
.pf-cmp-tag.l{left:6px}.pf-cmp-tag.r{right:6px}
.pf-cmp-side{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.pf-cmp-fig{margin:0;display:flex;flex-direction:column;gap:4px}
.pf-cmp-fig .pf-cmp-img{width:100%;height:auto;max-height:60dvh;object-fit:contain}
.pf-cmp-fig figcaption,.pf-slide figcaption{font-size:13px;color:var(--sub)}
.pf-cmp-none{font-size:13px;color:var(--sub)}
.pf-slides{display:flex;flex-direction:column;gap:8px}
.pf-slide{margin:0;display:flex;flex-direction:column;gap:6px}
.pf-slide-img{width:100%;height:min(60dvh,600px);object-fit:contain;background:#1d1d1a}
.pf-slide-n{font-family:var(--mono);font-size:12px;margin-right:4px}
.pf-slide-nav{display:flex;justify-content:space-between;align-items:center;gap:8px}
.pf-icon{display:inline-flex;align-items:center;justify-content:center;min-width:32px;min-height:32px;border:1px solid var(--line);background:#fff;cursor:pointer;color:var(--ink)}
.pf-icon[aria-pressed="true"]{background:var(--ink);color:var(--card)}
.pf-status-w{min-height:0}
.pf-status{margin:8px 0 0;font-size:13px}
.pf-pill{display:inline-block;padding:3px 10px;border:1px solid var(--line);background:var(--card2);color:var(--sub)}
.pf-status.err .pf-pill{border-color:var(--seal);color:var(--seal);background:var(--seal-bg)}
@media (max-width:640px){.pf-cmp-side{grid-template-columns:1fr}.pf-cmp-stage{height:52dvh}}
@media (pointer:coarse){.pf-ta,.pf-in{font-size:16px}.pf-seg button{min-height:44px;padding:6px 12px}.pf-icon{min-width:44px;min-height:44px}}
`;
