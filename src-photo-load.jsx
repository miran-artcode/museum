/* ============================================================
   이미지 다듬기 편집기 지연 불러오기 (app.js 쪽)
   편집기(src-photo.jsx·src-photo-panels.jsx와 그것만 쓰는 문서·합성·붓·표식·픽셀 모듈)는 public/photo.js에 따로 묶고
   다듬기 화면을 처음 열 때 내려받는다. src-ar.jsx가 ar3d.js를 싣는 방식과 같다(스크립트 태그, ?v= 캐시 태그, 실패하면 다시).

   하나만 있어야 하는 것은 app.js의 것을 window.__museumPhotoHost로 넘기고, photo.js는 새로 만들지 않는다
   (이름 목록: src-photo-api.mjs PHOTO_SHARED, 받는 쪽: src-photo-host.mjs):
     · React·ReactDOM·react/jsx-runtime: 훅은 화면을 그리는 React가 하나일 때만 작동한다
     · src-ws-lock.jsx WsLockCtx·WsSavedCtx: Context는 같은 객체여야 값이 전달된다
     · src-folio-ui.jsx lockScroll(스크롤 잠금 횟수)와 그것·미디어 기억을 쓰는 NoteField·PfViewer·ProcessSlides
     · src-photo-io.mjs 저장기 목록(getSaver), 초안(IndexedDB), mediaCache, 올리기 줄, 탭 잠금(tabLock), 기기 번호(devId)
     · src-media-img.js prepareImage·imgErrText (상태는 없지만 app.js에 이미 있으므로 넘긴다)
   편집기 모듈의 상태(src-photo.jsx ATT, src-photo-doc.mjs cmdSeq, src-photo-panels.jsx uid, 표식 글꼴)는 photo.js에만 있다.
   편집기 CSS(PE_CSS·PE_PANELS_CSS)도 photo.js에 있고, 불러온 뒤 PortfolioStyle이 예전과 같은 자리에 덧붙인다(usePhotoCss).
   ============================================================ */
import React, { useEffect, useRef, useSyncExternalStore } from "react";
import ReactDOM from "react-dom";
import jsxRuntime from "react/jsx-runtime";
import { WsLockCtx, WsSavedCtx } from "./src-ws-lock.jsx";
import { lockScroll, NoteField, PfViewer, ProcessSlides } from "./src-folio-ui.jsx";
import { getSaver, devId, mediaCache, decodeImage, decodeBlob, drafts, tabLock, mediaLoader, imageDims } from "./src-photo-io.mjs";
import { prepareImage, imgErrText } from "./src-media-img.js";
import { PHOTO_API, PHOTO_SHARED } from "./src-photo-api.mjs";
import { T } from "./src-portfolio-text.mjs";

/* ---------- 주소와 캐시 태그 ----------
   ar3d.js처럼 ?v=로 캐시를 넘긴다. 태그는 PHOTO_TAG에 index.html이 app.js에 붙인 ?v=를 이어 붙여 만든다:
   app.js 태그를 올려 배포할 때마다 photo.js도 새로 받으므로, 함께 빌드한 두 파일이 짝을 이룬다. */
const PHOTO_TAG = "ph1";
const APP_V = (() => {
  try {
    const s = typeof document !== "undefined" ? document.currentScript : null;   // app.js를 실행하는 동안만 있다
    const v = s && s.src ? new URL(s.src, location.href).searchParams.get("v") : "";
    return v && /^[\w.-]{1,40}$/.test(v) ? v : "";
  } catch (e) { return ""; }
})();
export const PHOTO_SRC = "/photo.js?v=" + PHOTO_TAG + (APP_V ? "-" + APP_V : "");
const LOAD_MS = 45000;   // 이보다 오래 걸리면 실패로 보고 「다시 시도」를 보인다

/* ---------- 불러오기 상태 (useSyncExternalStore) ---------- */
// err: "" | "load"(내려받지 못함) | "timeout" | "api"(app.js와 약속 번호가 다름) | "init"(실행 중 오류) | "host"
let snap = { mod: null, err: "" };
let pend = null, fails = 0;
const subs = new Set();
const setSnap = (next) => { snap = next; subs.forEach((f) => { try { f(); } catch (e) { /* ignore */ } }); };
const subscribe = (f) => { subs.add(f); return () => { subs.delete(f); }; };
const getSnap = () => snap;
const getCss = () => (snap.mod ? snap.mod.css : "");
const okMod = (m) => !!m && m.api === PHOTO_API && typeof m.PhotoEditor === "function" && typeof m.css === "string";

function installHost() {
  const shared = {
    WsLockCtx, WsSavedCtx,
    lockScroll, NoteField, PfViewer, ProcessSlides,
    getSaver, devId, mediaCache, decodeImage, decodeBlob, drafts, tabLock, mediaLoader, imageDims,
    prepareImage, imgErrText,
  };
  const gone = PHOTO_SHARED.filter((k) => shared[k] == null);
  if (gone.length) throw new Error("photo host lacks " + gone.join(", "));
  const cur = window.__museumPhotoHost;
  if (cur && cur.api === PHOTO_API && cur.React === React && cur.shared && cur.shared.getSaver === getSaver) return;
  window.__museumPhotoHost = Object.freeze({ api: PHOTO_API, React, ReactDOM, jsxRuntime, shared: Object.freeze(shared) });
}
const forget = (k) => { try { delete window[k]; } catch (e) { window[k] = undefined; } };

/** → Promise<{ api, PhotoEditor, css }>; one load at a time; a load after a failure asks past the HTTP cache */
export function loadPhoto() {
  if (snap.mod) return Promise.resolve(snap.mod);
  if (pend) return pend;
  if (snap.err) setSnap({ mod: null, err: "" });
  pend = new Promise((resolve, reject) => {
    let over = false, timer = 0;
    const finish = (err, m) => {
      if (over) return;
      over = true; clearTimeout(timer); pend = null;
      if (m) { fails = 0; setSnap({ mod: m, err: "" }); resolve(m); return; }
      fails++; setSnap({ mod: null, err }); reject(Object.assign(new Error("photo.js " + err), { code: err }));
    };
    if (typeof document === "undefined") { finish("load"); return; }
    try { installHost(); } catch (e) { finish("host"); return; }
    const have = window.__museumPhoto;
    if (okMod(have)) { finish(null, have); return; }
    if (have) forget("__museumPhoto");   // 예전 photo.js가 등록한 것: 새로 받은 것이 등록하게 비운다
    forget("__museumPhotoFail");
    const t = globalThis.__PHX_TEST__;
    const base = (t && typeof t.photoSrc === "string" && t.photoSrc) || PHOTO_SRC;
    const s = document.createElement("script");
    s.src = fails ? base + (base.includes("?") ? "&" : "?") + "r=" + Date.now() : base;
    s.async = true;
    s.onload = () => {
      const m = window.__museumPhoto;
      if (okMod(m)) { finish(null, m); return; }
      const f = window.__museumPhotoFail;   // src-photo-host.mjs가 멈추며 적은 이유
      if (m) forget("__museumPhoto");
      finish(m || (f && f.api !== PHOTO_API) ? "api" : "init");
    };
    s.onerror = () => { s.remove(); finish("load"); };
    timer = setTimeout(() => finish("timeout"), LOAD_MS);
    document.head.appendChild(s);
  });
  return pend;
}

/** PortfolioStyle: the editor CSS once photo.js is in, "" before */
export function usePhotoCss() {
  return useSyncExternalStore(subscribe, getCss, getCss);
}

/** the editor once photo.js is in; until then a full-screen 「불러오는 중」 with 「닫기」, and on failure 「다시 시도」 (same props as PhotoEditor) */
export function LazyPhotoEditor(props) {
  const s = useSyncExternalStore(subscribe, getSnap, getSnap);
  useEffect(() => { if (!getSnap().mod) loadPhoto().catch(() => {}); }, []);
  if (s.mod) { const Editor = s.mod.PhotoEditor; return <Editor {...props} />; }
  return <PhotoWait err={s.err} openerRef={props.openerRef}
    onRetry={() => loadPhoto().catch(() => {})} onClose={() => { if (props.onClose) props.onClose("user"); }} />;
}

function PhotoWait({ err, onRetry, onClose, openerRef }) {
  const box = useRef(null), retry = useRef(null);
  useEffect(() => {
    const opener = (openerRef && openerRef.current) || document.activeElement;
    const unlock = lockScroll();
    return () => {
      unlock();
      // 닫으면 연 버튼으로 돌아간다. 편집기로 바뀔 때는 편집기가 곧이어 제목으로 초점을 옮긴다(편집기의 effect가 뒤에 돈다)
      if (opener && opener.focus && opener.isConnected) { try { opener.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    };
  }, []);
  useEffect(() => {
    const el = err ? retry.current : box.current;
    if (el) { try { el.focus({ preventScroll: true }); } catch (e) { el.focus(); } }
  }, [err]);
  const onKeyDown = (e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); return; }
    if (e.key !== "Tab" || !box.current) return;
    const list = [...box.current.querySelectorAll("button:not([disabled])")];
    e.preventDefault();
    if (!list.length) return;
    const i = list.indexOf(document.activeElement);
    list[i < 0 ? 0 : (i + (e.shiftKey ? list.length - 1 : 1)) % list.length].focus();
  };
  const msg = err ? (err === "api" ? T.editLoadOld : T.editLoadFail) : T.editLoading;
  return (
    <div className="pf-pel" role="dialog" aria-modal="true" aria-labelledby="pf-pel-h" aria-describedby="pf-pel-m" aria-busy={!err}
      tabIndex={-1} ref={box} onKeyDown={onKeyDown}>
      <header className="pf-pel-top">
        <button type="button" className="btn small ghost" onClick={onClose}>{T.viewerClose}</button>
        <h2 id="pf-pel-h">{T.fieldEdit}</h2>
      </header>
      <div className="pf-pel-body">
        <p id="pf-pel-m" role={err ? "alert" : "status"}>{msg}</p>
        {err ? <button type="button" ref={retry} className="btn small" onClick={onRetry}>{T.editRetry}</button> : null}
      </div>
    </div>
  );
}

/* the editor shell look (.pe.pe-full in src-photo.jsx) so the switch to the editor does not flash */
export const PHOTO_WAIT_CSS = `
.pf-pel{position:fixed;inset:0;z-index:5000;height:calc(100vh / var(--ax-zoom,1));height:calc(100dvh / var(--ax-zoom,1));display:flex;flex-direction:column;
  padding:env(safe-area-inset-top,0) env(safe-area-inset-right,0) env(safe-area-inset-bottom,0) env(safe-area-inset-left,0);
  box-sizing:border-box;background:#fff;color:var(--ink,#111);font-family:var(--sans);font-size:15px;line-height:1.6;text-align:left}
html[data-ax-cap] .pf-pel{bottom:var(--ax-cap-h,0px);height:auto}
html:has(.pf-pel) .ax-float, html:has(.pf-pel) .paste-ask{z-index:5010}
.pf-pel:focus{outline:none}
.pf-pel-top{display:flex;align-items:center;gap:8px;padding:6px 10px;border-bottom:1px solid #ddd;min-height:48px;flex:0 0 auto}
.pf-pel-top h2{font-size:16px;margin:0;font-weight:700}
.pf-pel-body{flex:1 1 auto;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:16px;text-align:center;background:#f6f6f6}
.pf-pel-body p{margin:0;max-width:34em;word-break:keep-all;overflow-wrap:anywhere}
`;
