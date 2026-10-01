import React, { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { fbStore, authApi } from "./src-fb.js";
import { ATTITUDES, ATTITUDE_HINTS } from "./src-ladder.jsx";
import { EXHIBIT_SAMPLES } from "./src-exhibit-samples.jsx";
import { ConfirmButton } from "./src-ux.jsx";
import { prefersReducedMotion } from "./src-survey-ui.jsx";
import {
  EXPO_KEY, FIXTURES, fixtureInfo, isWallFixture, defaultSections, buildCandidates, draftExpo, publishDoc,
  visibleWorks, findWorkByNo, moveWork, moveSection, plateRows, arLink, DEFAULT_PREFACE, DEFAULT_TITLE,
} from "./src-ar-expo.mjs";
import { peerCfg } from "./src-assess-core.mjs";

/* 상호평가 동료 비교가 끝나기 전 단계. 이때 게시하면 학생이 비교할 작품의 작가 노트·허구 고지를 먼저 본다
   (비교 화면은 판정이 흔들리지 않도록 이 둘을 숨긴다: src-assess.jsx PLATE_ROWS) */
const PEER_OPEN = ["submit", "self1", "peer"];

/* ============================================================
   3D·AR 전시관 — 화면 계층 (메인 번들)
   three.js와 <model-viewer>는 public/ar3d.js에 따로 묶어 전시관을 열 때만 내려받는다.

   누가 무엇을 보는가
     · 교사: 「전시 구성」에서 학생 기록(태도·진열 방식·공개 선택)으로 초안을 만들고 고쳐 게시한다. QR 표지를 인쇄한다
     · 로그인한 학생: 교사가 게시한 전시를 3D 전시관·작품 목록·AR로 본다
     · 로그인하지 않은 사람: 자료집 예시 작품 세 점으로 꾸민 예시 전시만 본다
       (기록지·제출·사진은 로그인한 사람만 읽는다. 공개 인터넷 전시는 규칙을 바꾸어야 해서 여기서는 하지 않는다)
   QR 주소 /?ar=작품번호 로 들어오면 그 작품의 AR 화면을 바로 연다. /?expo 는 전시관을 연다.
   ============================================================ */

const AR3D_SRC = "/ar3d.js?v=ar1";
let ar3dP = null;
export function loadAr3d() {
  if (typeof window !== "undefined" && window.MuseumAR) return Promise.resolve(window.MuseumAR);
  if (!ar3dP) {
    ar3dP = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = AR3D_SRC;
      s.async = true;
      s.onload = () => (window.MuseumAR ? res(window.MuseumAR) : rej(new Error("no api")));
      s.onerror = () => { ar3dP = null; s.remove(); rej(new Error("load fail")); };
      document.head.appendChild(s);
    });
  }
  return ar3dP;
}

/* 이미지: 학생 작품은 media 문서(dataURL), 예시 작품은 파일 주소. 같은 작품은 한 번만 읽는다 */
const imgCache = new Map();
function getImage(w) {
  const im = w && w.img;
  if (!im) return Promise.resolve(null);
  if (im.url) return Promise.resolve(im.url);
  if (!im.owner || !im.ref) return Promise.resolve(null);
  const key = im.owner + "_" + im.ref;
  if (!imgCache.has(key)) {
    imgCache.set(key, fbStore.get("media:" + key).then((v) => {
      const ok = typeof v === "string" && v.length > 0;
      if (!ok) imgCache.delete(key);
      return ok ? v : null;
    }).catch(() => { imgCache.delete(key); return null; }));
  }
  return imgCache.get(key);
}

function roleOf(u) {
  if (!u) return "guest";
  const id = u.email ? String(u.email).split("@")[0] : "";
  return id === "teacher" ? "teacher" : id === "viewer" ? "viewer" : "student";
}

/* 자료집 예시 A·B·C로 꾸민 예시 전시 */
const SAMPLE_FIX = { "단독 진열": "wall", "계열 진열": "series", "파편 진열": "table" };
export function sampleExpo() {
  return {
    ver: 1, open: true, sample: true, title: DEFAULT_TITLE, preface: DEFAULT_PREFACE,
    sections: defaultSections(ATTITUDES, ATTITUDE_HINTS),
    off: [],
    works: EXHIBIT_SAMPLES.map((s) => ({
      sid: s.id, no: s.no, title: s.title,
      plate: { relic: s.relic, year: s.year, era: s.era, mat: s.mat, size: s.size, context: s.context, coll: s.coll, notice: s.notice },
      aiScope: s.aiScope, note: s.note, img: { url: "/img/examples/" + s.id + ".jpg" },
      section: s.attitude, fixture: SAMPLE_FIX[s.display] || "wall",
    })),
  };
}

const secTitleOf = (expo, key) => {
  const s = ((expo && expo.sections) || []).find((x) => x.key === key);
  return s ? s.title || s.key : key || "";
};
const isTouch = () => typeof window !== "undefined" && window.matchMedia && window.matchMedia("(pointer: coarse)").matches;

/* ---------- 입구 버튼 (전시장 상단) ---------- */

export function ArExpoEntry() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn arx-entry" onClick={() => setOpen(true)}>3D·AR 전시관 들어가기</button>
      {open && <ArExpo onClose={() => setOpen(false)} />}
    </>
  );
}

/* ---------- QR로 들어온 경우 ---------- */

const PENDING = "museum:arPending";
const readPending = () => { try { const s = sessionStorage.getItem(PENDING); return s ? JSON.parse(s) : null; } catch (e) { return null; } };
const clearPending = () => { try { sessionStorage.removeItem(PENDING); } catch (e) {} };

export function ArDeepLink() {
  const [req, setReq] = useState(null);
  const [uid, setUid] = useState("");
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    let r = null;
    if (q.get("ar")) r = { kind: "ar", no: q.get("ar").slice(0, 40) };
    else if (q.has("expo")) r = { kind: "hall" };
    if (r) {
      try { sessionStorage.setItem(PENDING, JSON.stringify(r)); } catch (e) {}
      try { window.history.replaceState(null, "", window.location.pathname + window.location.hash); } catch (e) {}
    }
    /* 로그인하지 않은 채 들어왔다가 로그인하면 그 작품을 다시 연다 */
    const un = authApi.watch((u) => {
      setUid(u && u.email ? u.email : "");
      const p = readPending();
      if (p) setReq(p);
    });
    return un;
  }, []);
  if (!req) return null;
  return <ArExpo key={uid || "guest"} initial={req}
    onClose={(keep) => { if (!keep) clearPending(); setReq(null); }} />;
}

/* ============================================================
   전시관 본체 (화면 전체를 덮는 창)
   ============================================================ */

export function ArExpo({ onClose, initial }) {
  const role = roleOf(authApi.current());
  const staff = role === "teacher" || role === "viewer";
  const [api, setApi] = useState(null);
  const [apiErr, setApiErr] = useState(false);
  const [state, setState] = useState({ phase: "loading" }); // { phase, expo, kind: published|sample|preview, draftExists }
  const [tab, setTab] = useState(initial && initial.kind === "ar" ? "list" : "hall");
  const [reveal, setReveal] = useState(false);
  const [arWork, setArWork] = useState(null);
  const [notFound, setNotFound] = useState("");
  const [gl, setGl] = useState(true);

  useEffect(() => {
    loadAr3d().then((a) => { setApi(a); setGl(a.webglOk()); }).catch(() => setApiErr(true));
  }, []);

  const loadPublished = async () => {
    if (role === "guest") { setState({ phase: "ok", expo: sampleExpo(), kind: "sample" }); return; }
    const doc = await fbStore.get(EXPO_KEY);
    if (doc && doc.open && Array.isArray(doc.works)) setState({ phase: "ok", expo: doc, kind: "published" });
    else setState({ phase: "ok", expo: sampleExpo(), kind: "sample", unpublished: true });
  };
  useEffect(() => { loadPublished(); }, []);

  /* QR 작품 번호 → AR 화면 */
  useEffect(() => {
    if (!initial || initial.kind !== "ar" || state.phase !== "ok") return;
    const w = findWorkByNo(state.expo, initial.no);
    if (w) setArWork(w);
    else setNotFound(initial.no);
  }, [state.phase]);

  /* 창이 열린 동안 뒤 화면이 스크롤되지 않게 */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") { if (arWork) setArWork(null); else onClose(false); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [arWork]);

  const expo = state.expo;
  const works = useMemo(() => visibleWorks(expo), [expo]);
  const hallRef = useRef(null);
  const [focus, setFocus] = useState(0);
  const goHallWork = (w) => {
    const i = works.indexOf(w);
    setTab("hall");
    /* 전시관 순서는 평면(구역·벽면 순)이 정하므로 번호로 찾는다 */
    setTimeout(() => {
      const h = hallRef.current;
      if (!h) return;
      const t = h.plan.items.findIndex((it) => it.work === w || it.work.sid === w.sid);
      if (t >= 0) h.goTo(t + 1); else if (i >= 0) h.goTo(i + 1);
    }, 60);
  };

  const tabs = [["hall", "전시관"], ["list", "작품 목록"]].concat(staff ? [["build", "전시 구성"], ["qr", "QR 표지"]] : []);

  return (
    <div className="arx" role="dialog" aria-modal="true" aria-label="3D·AR 전시관">
      <div className="arx-top">
        <div className="arx-brand">3D·AR 전시관<small>FICTIVE ARCHIVE · AR EXHIBITION</small></div>
        <div className="arx-tabs" role="tablist">
          {tabs.map(([k, label]) => (
            <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{label}</button>
          ))}
        </div>
        <div className="toggle-row arx-reveal" role="group" aria-label="관람 단계">
          <button className={!reveal ? "on" : ""} aria-pressed={!reveal} onClick={() => setReveal(false)}>1차 관람</button>
          <button className={reveal ? "on" : ""} aria-pressed={reveal} onClick={() => setReveal(true)}>2차 관람</button>
        </div>
        <button className="btn small ghost arx-close" onClick={() => onClose(false)}>닫기</button>
      </div>

      {state.phase === "ok" && state.kind !== "published" && (
        <div className="arx-banner">
          {state.kind === "preview" ? <>게시 전 미리 보기입니다. 학생 화면에는 아직 보이지 않습니다.</>
            : role === "guest" ? <>예시 작품 세 점으로 꾸민 전시관입니다. 학급 작품은 로그인하면 볼 수 있습니다.</>
              : staff ? <>아직 게시한 전시가 없어 예시 작품 세 점을 보여 줍니다. 「전시 구성」에서 학급 전시를 게시합니다.</>
                : <>아직 학급 전시가 열리지 않아 예시 작품 세 점을 보여 줍니다.</>}
          {state.kind === "preview" && <button className="btn small ghost" onClick={loadPublished}>미리 보기 끝내기</button>}
        </div>
      )}
      {notFound && (
        <div className="arx-banner warn" role="alert">
          작품 번호 「{notFound}」에 맞는 작품이 없습니다.{role === "guest" ? " 학급 작품은 로그인한 뒤 볼 수 있습니다." : " 번호를 확인하거나 작품 목록에서 골라 주세요."}
          {role === "guest" && <button className="btn small" onClick={() => onClose(true)}>로그인하러 가기</button>}
          <button className="btn small ghost" onClick={() => setNotFound("")}>확인</button>
        </div>
      )}

      <div className="arx-body">
        {apiErr ? (
          <div className="arx-msg">전시관 파일을 내려받지 못했습니다. 연결을 확인하고 다시 열어 주세요.</div>
        ) : state.phase !== "ok" || !api ? (
          <div className="arx-msg">전시관을 여는 중…</div>
        ) : tab === "hall" ? (
          gl ? (
            <HallView api={api} expo={expo} works={works} reveal={reveal} hallRef={hallRef}
              paused={!!arWork} focus={focus} setFocus={setFocus} onAr={setArWork} />
          ) : (
            <div className="arx-msg">이 기기에서는 3D 화면을 열 수 없습니다. 「작품 목록」에서 작품을 보고 AR로 볼 수 있습니다.</div>
          )
        ) : tab === "list" ? (
          <WorkList expo={expo} works={works} reveal={reveal} onAr={setArWork} onHall={gl ? goHallWork : null} />
        ) : tab === "build" ? (
          <ExpoBuilder role={role} onPreview={(doc) => { setState({ phase: "ok", expo: doc, kind: "preview" }); setTab("hall"); }}
            onPublished={() => { loadPublished(); }} />
        ) : (
          <QrSheet api={api} expo={expo} works={works} sample={state.kind === "sample"} />
        )}
      </div>

      {arWork && api && (
        <ArViewer api={api} work={arWork} expo={expo} reveal={reveal} setReveal={setReveal} onClose={() => setArWork(null)} />
      )}
    </div>
  );
}

/* ---------- 3D 전시관 ---------- */

function HallView({ api, expo, works, reveal, hallRef, paused, focus, setFocus, onAr }) {
  const el = useRef(null);
  const [fold, setFold] = useState(false);
  const [err, setErr] = useState("");
  const [, setMounted] = useState(0); // 전시관 객체가 생긴 뒤 한 번 더 그려 버튼이 그 객체를 쓰게 한다
  useEffect(() => {
    let h = null;
    try {
      h = api.mountHall(el.current, { expo, reveal, getImage, onFocus: (t) => setFocus(t), reducedMotion: prefersReducedMotion() });
    } catch (e) { setErr("3D 화면을 열지 못했습니다. 「작품 목록」에서 볼 수 있습니다."); return undefined; }
    hallRef.current = h;
    setMounted((x) => x + 1);
    h.focusCanvas();
    return () => { h.dispose(); hallRef.current = null; };
  }, [api, expo]);
  useEffect(() => { if (hallRef.current) hallRef.current.setReveal(reveal); }, [reveal]);
  useEffect(() => { if (hallRef.current) hallRef.current.pause(paused); }, [paused]);

  const h = hallRef.current;
  const go = (f) => () => { const x = hallRef.current; if (x) f(x); };
  const n = h ? h.tourLength : works.length + 2;
  const item = h && focus >= 1 && focus <= n - 2 ? h.plan.items[focus - 1] : null;
  const w = item ? item.work : null;

  return (
    <div className={"arx-hall" + (fold ? " fold" : "")}>
      <div className="arx-stage" ref={el}>
        {err && <div className="arx-msg">{err}</div>}
        <div className="arx-hint" aria-hidden="true">
          {isTouch() ? "끌어서 둘러보기 · 작품을 누르면 그 앞으로 이동 · 두 손가락으로 앞뒤 이동" : "끌어서 둘러보기 · 작품을 누르면 그 앞으로 이동 · 방향키로 걷기"}
        </div>
      </div>
      <div className="arx-panel" aria-live="polite">
        <div className="arx-nav">
          <button className="btn small ghost" onClick={go((x) => x.prev())} disabled={focus <= 0}>이전</button>
          <span className="arx-count">{focus <= 0 ? "서문" : focus >= n - 1 ? "끝" : focus + " / " + (n - 2)}</span>
          <button className="btn small ghost" onClick={go((x) => x.next())} disabled={focus >= n - 1}>다음</button>
          <button className="btn small ghost arx-fold" onClick={() => setFold((f) => !f)} aria-expanded={!fold}>{fold ? "캡션 펴기" : "캡션 접기"}</button>
        </div>
        {!fold && (
          <div className="arx-panel-in">
            {focus <= 0 ? (
              <>
                <div className="arx-acc">EXCAVATED 2300 · EXHIBITED NOW</div>
                <h2 className="arx-h">{expo.title}</h2>
                <p className="arx-p">{expo.preface}</p>
                <p className="arx-notice">이 전시의 유물은 모두 생성형 AI로 만든, 실재한 적 없는 이미지입니다.</p>
                {n > 2 && <button className="btn small" onClick={go((x) => x.next())}>관람 시작</button>}
              </>
            ) : w ? (
              <WorkCaption w={w} expo={expo} reveal={reveal} fixture={item.fixture}>
                <button className="btn small" onClick={() => onAr(w)}>AR로 보기</button>
              </WorkCaption>
            ) : (
              <>
                <h2 className="arx-h">관람을 마쳤습니다</h2>
                <p className="arx-notice">작품 캡션의 발굴 연도와 출토 맥락도 학생이 지은 허구입니다.</p>
                <button className="btn small ghost" onClick={go((x) => x.goTo(0))}>처음으로</button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function WorkCaption({ w, expo, reveal, fixture, children }) {
  const [note, setNote] = useState(false);
  return (
    <div className="arx-cap">
      <div className="arx-no">작품 {w.no}<span>{secTitleOf(expo, w.section)} · {fixtureInfo(fixture || w.fixture).label}</span></div>
      {reveal ? (
        <>
          <h2 className="arx-h">「{w.title || "무제"}」</h2>
          <dl className="arx-dl">
            {plateRows(w).map(([label, val]) => <React.Fragment key={label}><dt>{label}</dt><dd>{val}</dd></React.Fragment>)}
          </dl>
          <p className="arx-notice">{(w.plate && w.plate.notice) || ""}</p>
          {w.note && (
            <div className="arx-note">
              <button className="arx-link" onClick={() => setNote((x) => !x)} aria-expanded={note}>{note ? "작가 노트 접기" : "작가 노트 읽기"}</button>
              {note && <p>{w.note}</p>}
            </div>
          )}
        </>
      ) : (
        <p className="arx-hidden">1차 관람 · 작품 캡션 가림</p>
      )}
      <div className="arx-actions">{children}</div>
    </div>
  );
}

/* ---------- 작품 목록 (3D가 안 되는 기기에서도 쓰는 기본 화면) ---------- */

function Thumb({ w }) {
  const [src, setSrc] = useState(undefined);
  useEffect(() => { let live = true; getImage(w).then((s) => { if (live) setSrc(s || null); }); return () => { live = false; }; }, [w]);
  return src ? <img src={src} alt={"작품 " + w.no} loading="lazy" /> : <span className="ph">{src === null ? "이미지 없음" : "불러오는 중…"}</span>;
}

function WorkList({ expo, works, reveal, onAr, onHall }) {
  if (!works.length) return <div className="arx-msg">전시된 작품이 없습니다.</div>;
  const secs = (expo.sections || []).filter((s) => works.some((w) => w.section === s.key));
  const orphan = works.filter((w) => !secs.some((s) => s.key === w.section));
  const groups = secs.map((s) => [s.title || s.key, s.sub, works.filter((w) => w.section === s.key)]);
  if (orphan.length) groups.push(["분류되지 않은 유물", "", orphan]);
  return (
    <div className="arx-list">
      {groups.map(([title, sub, ws]) => (
        <section key={title}>
          <h3 className="arx-sec">{title}{sub && <small>{sub}</small>}</h3>
          <div className="arx-grid">
            {ws.map((w) => (
              <div className="arx-card" key={w.sid}>
                <div className="arx-thumb"><Thumb w={w} /></div>
                <WorkCaption w={w} expo={expo} reveal={reveal}>
                  <button className="btn small" onClick={() => onAr(w)}>AR로 보기</button>
                  {onHall && <button className="btn small ghost" onClick={() => onHall(w)}>전시관에서 보기</button>}
                </WorkCaption>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/* ---------- AR 보기 ---------- */

function ArViewer({ api, work, expo, reveal, setReveal, onClose }) {
  const el = useRef(null);
  const ref = useRef(null);
  const [st, setSt] = useState({ phase: "image" });
  const wall = isWallFixture(work.fixture);
  useEffect(() => {
    let live = true, v = null;
    getImage(work).then((src) => {
      if (!live) return;
      if (!src) { setSt({ phase: "error", message: "작품 이미지를 읽지 못했습니다." }); return; }
      v = api.mountArViewer(el.current, {
        work, imgSrc: src, fixture: work.fixture, sectionTitle: secTitleOf(expo, work.section), reveal,
        arLabel: wall ? "AR로 벽에 걸기" : "AR로 바닥에 놓기", onStatus: (s) => { if (live) setSt(s); },
      });
      ref.current = v;
    });
    return () => { live = false; if (v) v.dispose(); ref.current = null; };
  }, [work]);
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } if (ref.current) ref.current.setReveal(reveal); }, [reveal]);

  const link = arLink(window.location.origin, work.no);
  const qr = useMemo(() => { try { return api.qrSvg(link); } catch (e) { return ""; } }, [link]);
  const fx = fixtureInfo(work.fixture);

  return (
    <div className="arv" role="dialog" aria-modal="true" aria-label={"작품 " + work.no + " AR 보기"}>
      <div className="arv-top">
        <div className="arv-t">작품 {work.no}<small>{fx.label} · 실제 크기</small></div>
        <button className="btn small ghost" onClick={onClose}>닫기</button>
      </div>
      <div className="arv-stage" ref={el}>
        {(st.phase === "image" || st.phase === "building") && <div className="arv-load">3D 모델을 만드는 중…</div>}
      </div>
      <div className="arv-foot" aria-live="polite">
        {st.phase === "error" ? (
          <p className="arv-err">{st.message || "모델을 만들지 못했습니다."}</p>
        ) : st.phase === "ready" && st.canAR ? (
          <p className="arv-p">{wall ? "버튼을 누른 뒤 휴대폰으로 빈 벽을 천천히 비추세요." : "버튼을 누른 뒤 휴대폰으로 바닥을 천천히 비추세요."} 작품은 실제 크기로 놓입니다.</p>
        ) : st.phase === "ready" ? (
          <div className="arv-noar">
            <p className="arv-p">이 기기에서는 AR을 쓸 수 없어 모델을 돌려 보기만 합니다. 안드로이드 Chrome이나 iPhone Safari에서 이 QR을 찍으면 AR로 볼 수 있습니다.</p>
            {qr && <div className="arv-qr" dangerouslySetInnerHTML={{ __html: qr }} />}
          </div>
        ) : null}
        {st.ar === "failed" && <p className="arv-err">AR을 시작하지 못했습니다. 밝은 곳에서 무늬가 있는 바닥이나 벽을 비추고 다시 눌러 주세요.</p>}
        <div className="toggle-row arv-reveal" role="group" aria-label="작품 캡션">
          <button className={!reveal ? "on" : ""} aria-pressed={!reveal} onClick={() => setReveal(false)}>작품 캡션 가림</button>
          <button className={reveal ? "on" : ""} aria-pressed={reveal} onClick={() => setReveal(true)}>작품 캡션 공개</button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   교사: 전시 구성
   ============================================================ */

function ExpoBuilder({ role, onPreview, onPublished }) {
  const canWrite = role === "teacher";
  const [cands, setCands] = useState(null);
  const [prev, setPrev] = useState(null);
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [peerStage, setPeerStage] = useState("");

  const load = async () => {
    setCands(null); setMsg("");
    const [roster, subsR, doc, cfg] = await Promise.all([fbStore.get("roster"), fbStore.allOfSafe("submissions"), fbStore.get(EXPO_KEY), fbStore.get("config")]);
    setPeerStage(peerCfg(cfg || {}).stage);
    const subMap = subsR && subsR.ok ? subsR.data || {} : {};
    const ids = [...new Set([...Object.keys(roster || {}), ...Object.keys(subMap)])];
    const wsMap = {};
    await Promise.all(ids.map(async (id) => { wsMap[id] = await fbStore.get("ws:" + id); }));
    const cs = buildCandidates({ roster: roster || {}, wsMap, subMap, attitudes: ATTITUDES });
    setCands(cs);
    setPrev(doc || null);
    setD(draftExpo({ cands: cs, attitudes: ATTITUDES, hints: ATTITUDE_HINTS, prev: doc }));
    if (subsR && !subsR.ok) setMsg("최종 제출을 읽지 못해 기록지 초안으로 만들었습니다. 다시 불러오면 제출본으로 바뀝니다.");
  };
  useEffect(() => { load(); }, []);

  if (!cands || !d) return <div className="arx-msg">학생 기록을 읽는 중…</div>;

  const byId = new Map(cands.map((c) => [c.sid, c]));
  const off = new Set(d.off || []);
  const bad = cands.filter((c) => !c.ok || c.dup);
  const setW = (sid, patch) => setD((x) => ({ ...x, works: x.works.map((w) => (w.sid === sid ? { ...w, ...patch } : w)) }));
  const setSec = (key, patch) => setD((x) => ({ ...x, sections: x.sections.map((s) => (s.key === key ? { ...s, ...patch } : s)) }));
  const toggleOff = (sid) => setD((x) => { const o = new Set(x.off || []); if (o.has(sid)) o.delete(sid); else o.add(sid); return { ...x, off: [...o] }; });
  const shown = d.works.filter((w) => !off.has(w.sid)).length;

  const save = async (open) => {
    setBusy(true); setMsg("");
    const doc = JSON.parse(JSON.stringify(publishDoc(d, { open })));
    if (JSON.stringify(doc).length > 900000) { setBusy(false); setMsg("전시 문서가 너무 커서 저장할 수 없습니다. 작가 노트가 매우 긴 작품이 있는지 확인해 주세요."); return; }
    const ok = await fbStore.setT(EXPO_KEY, doc);
    setBusy(false);
    if (!ok) { setMsg("저장하지 못했습니다. 연결을 확인하고 다시 눌러 주세요."); return; }
    setPrev(doc);
    setD((x) => ({ ...x, open }));
    setMsg(open ? "게시했습니다. 로그인한 학생이 3D·AR 전시관에서 볼 수 있습니다." : "게시를 내렸습니다. 학생 화면에는 예시 전시만 보입니다.");
    onPublished();
  };

  return (
    <div className="arx-build">
      <div className="arx-bhead">
        <div>
          <b>걸 작품 {shown}점</b> · 걸 수 없는 작품 {bad.length}점 · {prev && prev.open ? "게시 중 (" + fmtT(prev.publishedAt) + ")" : "게시 전"}
        </div>
        <div className="arx-bbtn">
          <button className="btn small ghost" onClick={load} disabled={busy}>학생 기록 다시 읽기</button>
          <button className="btn small ghost" onClick={() => onPreview({ ...publishDoc(d, { open: true }) })}>3D로 미리 보기</button>
          {prev && prev.open && canWrite && (
            <ConfirmButton className="btn small ghost" disabled={busy} label="게시 내리기" yes="내리기"
              ask="게시를 내리면 학생 화면에서 학급 전시가 사라집니다. 내릴까요?" onConfirm={() => save(false)} />
          )}
          <ConfirmButton className="btn small" disabled={busy || !canWrite || !shown} label={busy ? "저장 중…" : prev && prev.open ? "고친 내용 게시" : "전시 게시"} yes="게시"
            ask={"작품 " + shown + "점을 게시합니다. 로그인한 학급 전체가 작품 캡션과 이미지를 볼 수 있습니다. 게시할까요?"} onConfirm={() => save(true)} />
        </div>
      </div>
      {!canWrite && <div className="arx-banner warn">보기 전용 계정은 게시할 수 없습니다.</div>}
      {PEER_OPEN.includes(peerStage) && (
        <div className="arx-banner warn">
          상호평가 동료 비교가 아직 끝나지 않았습니다. 지금 게시하면 학생이 비교할 작품의 작가 노트와 허구 고지를 비교 전에 보게 됩니다. 자기평가 ② 단계 이후에 게시하기를 권합니다.
        </div>
      )}
      {msg && <div className="arx-banner" role="status">{msg}</div>}

      <div className="arx-bfields">
        <label>전시 제목<input value={d.title} maxLength={60} onChange={(e) => setD({ ...d, title: e.target.value })} /></label>
        <label>전시 서문 <span className="hint">7차시에 학급이 함께 쓴 서문을 넣습니다. 전시관 입구 벽에 걸립니다.</span>
          <textarea rows={4} maxLength={600} value={d.preface} onChange={(e) => setD({ ...d, preface: e.target.value })} /></label>
      </div>

      <p className="hint arx-bguide">
        구역은 학생이 3차시에 고른 말하는 태도, 진열 형식은 7차시에 고른 진열 방식에서 가져왔습니다.
        {" "}{FIXTURES.map((f) => f.label + ": " + f.desc).join(". ")}.
      </p>

      {d.sections.map((s, si) => {
        const ws = d.works.filter((w) => w.section === s.key);
        return (
          <div className="arx-bsec" key={s.key}>
            <div className="arx-bsec-h">
              <input className="t" value={s.title} maxLength={24} onChange={(e) => setSec(s.key, { title: e.target.value })} aria-label="구역 이름" />
              <input className="s" value={s.sub} maxLength={40} placeholder="부제" onChange={(e) => setSec(s.key, { sub: e.target.value })} aria-label="구역 부제" />
              <span className="n">{ws.filter((w) => !off.has(w.sid)).length}점</span>
              <button className="btn small ghost" disabled={si === 0} onClick={() => setD((x) => moveSection(x, s.key, -1))} aria-label="구역을 앞으로">↑</button>
              <button className="btn small ghost" disabled={si === d.sections.length - 1} onClick={() => setD((x) => moveSection(x, s.key, 1))} aria-label="구역을 뒤로">↓</button>
            </div>
            {ws.length === 0 ? <p className="hint arx-bempty">이 구역에 작품이 없습니다. 작품이 없는 구역은 전시관에 만들지 않습니다.</p> : (
              <table className="arx-btbl">
                <thead><tr><th>순서</th><th>작품</th><th>구역</th><th>진열 형식</th><th>걸기</th></tr></thead>
                <tbody>
                  {ws.map((w, wi) => {
                    const c = byId.get(w.sid) || {};
                    return (
                      <tr key={w.sid} className={off.has(w.sid) ? "off" : ""}>
                        <td className="ord">
                          <button className="btn small ghost" disabled={wi === 0} onClick={() => setD((x) => moveWork(x, w.sid, -1))} aria-label="앞으로">↑</button>
                          <button className="btn small ghost" disabled={wi === ws.length - 1} onClick={() => setD((x) => moveWork(x, w.sid, 1))} aria-label="뒤로">↓</button>
                        </td>
                        <td>
                          <b>{w.no}</b> 「{w.title || "무제"}」
                          <div className="hint">
                            {c.src === "sub" ? "최종 제출본" : "기록지 초안(최종 제출 전)"} · 학생이 고른 진열 방식: {c.mode || "없음"}{c.modeWhy ? " · 이유: " + c.modeWhy : ""}
                          </div>
                        </td>
                        <td>
                          <select value={w.section} onChange={(e) => setW(w.sid, { section: e.target.value })} aria-label="구역">
                            {d.sections.map((x) => <option key={x.key} value={x.key}>{x.title || x.key}</option>)}
                          </select>
                        </td>
                        <td>
                          <select value={w.fixture} onChange={(e) => setW(w.sid, { fixture: e.target.value })} aria-label="진열 형식">
                            {FIXTURES.map((f) => <option key={f.k} value={f.k}>{f.label}</option>)}
                          </select>
                        </td>
                        <td><input type="checkbox" checked={!off.has(w.sid)} onChange={() => toggleOff(w.sid)} aria-label={"작품 " + w.no + " 걸기"} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        );
      })}

      {bad.length > 0 && (
        <details className="arx-bbad">
          <summary>걸 수 없는 작품 {bad.length}점</summary>
          <table className="arx-btbl">
            <thead><tr><th>학번</th><th>작품 번호</th><th>이유</th></tr></thead>
            <tbody>
              {bad.map((c) => (
                <tr key={c.sid}><td>{c.sid}</td><td>{c.work.no || "-"}</td><td>{c.dup ? "작품 번호가 " + c.dup + " 학생과 같음" : c.reason}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="hint">학생이 7차시 「전시 출품」에서 전시 공개를 고르고 작품 번호와 대표 이미지를 올리면 다시 읽을 때 들어옵니다.</p>
        </details>
      )}
    </div>
  );
}

const fmtT = (iso) => {
  if (!iso) return "-";
  const t = new Date(iso);
  return (t.getMonth() + 1) + "/" + t.getDate() + " " + String(t.getHours()).padStart(2, "0") + ":" + String(t.getMinutes()).padStart(2, "0");
};

/* ============================================================
   교사: QR 표지 — 교실 벽·복도에 붙이면 그곳에서 AR로 작품을 불러낸다
   ============================================================ */

function QrSheet({ api, expo, works, sample }) {
  const origin = window.location.origin;
  const cards = useMemo(() => [{ key: "_hall", no: "", label: "3D 전시관", link: origin + "/?expo" }]
    .concat(works.map((w) => ({ key: w.sid, no: w.no, label: "작품 " + w.no, link: arLink(origin, w.no), wall: isWallFixture(w.fixture) })))
    .map((c) => ({ ...c, svg: api.qrSvg(c.link) })), [works, origin]);
  const [printing, setPrinting] = useState(false);
  const doPrint = () => {
    setPrinting(true);
    document.body.classList.add("arx-printing");
    setTimeout(() => {
      window.print();
      document.body.classList.remove("arx-printing");
      setPrinting(false);
    }, 120);
  };
  const sheet = (
    <div className="arq-sheet">
      {cards.map((c) => (
        <div className="arq-card" key={c.key}>
          <div className="arq-qr" dangerouslySetInnerHTML={{ __html: c.svg }} />
          <div className="arq-txt">
            <div className="arq-no">{c.label}</div>
            <div className="arq-title">{expo.title}</div>
            <div className="arq-how">{c.no ? "휴대폰 카메라로 QR을 찍으면 이 작품을 AR로 볼 수 있습니다." : "휴대폰 카메라로 QR을 찍으면 3D 전시관이 열립니다."}</div>
            <div className="arq-notice">생성형 AI로 만든, 실재한 적 없는 유물</div>
          </div>
        </div>
      ))}
    </div>
  );
  return (
    <div className="arx-qrtab">
      <div className="arx-bhead">
        <div><b>QR 표지 {cards.length}장</b> · 한 장에 여덟 개씩 인쇄합니다. 작품 번호만 담고, 로그인한 학생만 작품을 열 수 있습니다.</div>
        <button className="btn small" onClick={doPrint} disabled={printing}>인쇄</button>
      </div>
      {sample && <div className="arx-banner warn">게시한 학급 전시가 없어 예시 작품의 표지를 보여 줍니다.</div>}
      <div className="arq-preview">{sheet}</div>
      {createPortal(<div className="arq-print-root">{sheet}</div>, document.body)}
    </div>
  );
}

/* ============================================================
   스타일
   ============================================================ */

const AR_CSS = `
.arx-entry{margin-top:14px}
.arx{position:fixed;inset:0;z-index:900;background:#efeee9;display:flex;flex-direction:column;color:var(--ink);word-break:keep-all;overflow-wrap:anywhere}
.arx-top{display:flex;align-items:center;gap:8px 12px;flex-wrap:wrap;padding:8px 12px;background:#fff;border-bottom:1px solid var(--line)}
.arx-brand{font-weight:900;font-size:15px;margin-right:auto;display:flex;flex-direction:column;line-height:1.2}
.arx-brand small{font-family:'Archivo',sans-serif;font-weight:700;font-size:9px;letter-spacing:.14em;color:#666}
.arx-tabs{display:flex;gap:4px;flex-wrap:wrap}
.arx-tabs button{padding:6px 11px;border:1px solid var(--line);background:#fff;font-family:var(--sans);font-size:13px;cursor:pointer}
.arx-tabs button.on{background:var(--ink);border-color:var(--ink);color:#fff}
.arx-reveal button{padding:6px 10px;font-size:12.5px}
.arx-banner{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:7px 12px;font-size:12.5px;background:var(--patina-bg);border-bottom:1px solid var(--line2);color:var(--ink)}
.arx-banner.warn{background:var(--seal-bg)}
.arx-body{flex:1;min-height:0;position:relative;overflow:auto}
.arx-msg{padding:48px 16px;text-align:center;color:var(--sub);font-size:13.5px}
.arx-hall{position:absolute;inset:0;display:flex}
.arx-stage{flex:1;min-width:0;min-height:0;position:relative;overflow:hidden;background:#e9e7e1}
.arx-stage canvas{position:absolute;inset:0}
.arx-hint{position:absolute;left:10px;bottom:10px;font-size:11.5px;color:#fff;background:rgba(17,17,17,.55);padding:4px 8px;pointer-events:none;max-width:calc(100% - 20px)}
.arx-panel{width:360px;flex:none;background:#fff;border-left:1px solid var(--line);display:flex;flex-direction:column;min-height:0}
.arx-nav{display:flex;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid var(--line2)}
.arx-count{font-family:'Archivo',var(--sans);font-size:12px;color:var(--sub);min-width:54px;text-align:center}
.arx-fold{margin-left:auto}
.arx-panel-in{padding:12px 14px 16px;overflow:auto;flex:1;min-height:0}
.arx-acc{font-family:'Archivo',sans-serif;font-weight:700;font-size:10px;letter-spacing:.2em;color:var(--seal);margin-bottom:6px}
.arx-h{font-size:18px;font-weight:700;line-height:1.4;margin:2px 0 8px}
.arx-p{font-size:13.5px;line-height:1.75;margin:0 0 10px;white-space:pre-wrap}
.arx-notice{font-size:12px;color:var(--seal);border-top:1px dashed var(--line);padding-top:7px;margin:8px 0 10px}
.arx-no{font-family:'Archivo',var(--sans);font-size:12px;color:var(--seal);letter-spacing:.06em;display:flex;flex-direction:column;gap:2px}
.arx-no span{font-family:var(--sans);color:var(--sub);letter-spacing:0;font-size:11.5px}
.arx-dl{display:grid;grid-template-columns:78px 1fr;gap:4px 8px;font-size:12.5px;margin:0}
.arx-dl dt{color:var(--sub)}
.arx-dl dd{margin:0;line-height:1.6}
.arx-hidden{background:var(--card2);color:var(--sub);text-align:center;font-size:12px;padding:14px;margin:8px 0}
.arx-note p{font-size:12.5px;line-height:1.7;white-space:pre-wrap;border-left:2px solid var(--line);padding-left:9px;margin:6px 0 0}
.arx-link{background:none;border:none;padding:0;color:var(--patina);text-decoration:underline;font-family:var(--sans);font-size:12.5px;cursor:pointer}
.arx-actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
@media(max-width:760px){
  .arx-hall{flex-direction:column}
  .arx-panel{width:auto;border-left:none;border-top:1px solid var(--line);max-height:46%}
  .arx-hall.fold .arx-panel{max-height:none}
  .arx-brand small{display:none}
  .arx-top{padding:6px 8px}
}
.arx-list{padding:14px 16px 40px;max-width:1180px;margin:0 auto}
.arx-sec{font-size:17px;font-weight:900;margin:18px 0 10px;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.arx-sec small{font-size:12.5px;font-weight:400;color:var(--sub)}
.arx-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}
.arx-card{background:#fff;border:1px solid var(--line)}
.arx-card .arx-cap{padding:10px 12px 12px}
.arx-thumb{aspect-ratio:4/3;background:#dbd9d2;display:flex;align-items:center;justify-content:center;overflow:hidden}
.arx-thumb img{width:100%;height:100%;object-fit:cover}
.arx-thumb .ph{font-size:11.5px;color:var(--sub)}
.arv{position:fixed;inset:0;z-index:950;background:#efeee9;display:flex;flex-direction:column;word-break:keep-all;overflow-wrap:anywhere}
.arv-top{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 12px;background:#fff;border-bottom:1px solid var(--line)}
.arv-t{font-family:'Archivo',var(--sans);font-weight:700;font-size:14px;color:var(--seal);display:flex;flex-direction:column}
.arv-t small{font-family:var(--sans);font-weight:400;font-size:11.5px;color:var(--sub)}
.arv-stage{flex:1;min-height:0;position:relative}
.arv-load{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:var(--sub);font-size:13px}
.arv-foot{background:#fff;border-top:1px solid var(--line);padding:10px 14px 14px;max-height:45%;overflow:auto}
.arv-p{font-size:13px;line-height:1.65;margin:0 0 8px}
.arv-err{font-size:13px;color:var(--seal);margin:0 0 8px}
.arv-noar{display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.arv-noar .arv-p{flex:1;min-width:200px}
.arv-qr{width:120px;height:120px;flex:none}
.arv-qr svg{width:100%;height:100%;display:block}
.arv-arbtn{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);padding:12px 20px;background:var(--seal);color:#fff;border:none;font-family:var(--sans);font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.25)}
.arx-build,.arx-qrtab{padding:12px 16px 40px;max-width:1100px;margin:0 auto}
.arx-bhead{display:flex;gap:8px 14px;align-items:center;justify-content:space-between;flex-wrap:wrap;font-size:13px;padding:8px 0 12px;border-bottom:1px solid var(--line2);margin-bottom:12px}
.arx-bbtn{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.arx-bfields{display:grid;gap:10px;margin-bottom:12px}
.arx-bfields label{display:flex;flex-direction:column;gap:4px;font-size:12.5px;color:var(--sub)}
.arx-bfields input,.arx-bfields textarea{font-family:var(--sans);font-size:14px;padding:7px 9px;border:1px solid var(--line);color:var(--ink);background:#fff}
.arx-bguide{font-size:12px;line-height:1.7;margin:0 0 12px}
.arx-bsec{background:#fff;border:1px solid var(--line);margin-bottom:12px}
.arx-bsec-h{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:8px 10px;background:var(--card2);border-bottom:1px solid var(--line2)}
.arx-bsec-h input{font-family:var(--sans);border:1px solid var(--line);padding:5px 7px;font-size:13px;background:#fff}
.arx-bsec-h input.t{font-weight:700;width:150px}
.arx-bsec-h input.s{flex:1;min-width:140px}
.arx-bsec-h .n{font-size:12px;color:var(--sub);min-width:32px}
.arx-bempty{padding:8px 10px;margin:0;font-size:12px}
.arx-btbl{width:100%;border-collapse:collapse;font-size:13px}
.arx-btbl th{font-size:11px;color:var(--sub);text-align:left;font-weight:500;padding:5px 8px;border-bottom:1px solid var(--line2)}
.arx-btbl td{padding:6px 8px;border-bottom:1px solid var(--line2);vertical-align:top}
.arx-btbl td.ord{white-space:nowrap;width:1%}
.arx-btbl td .hint{font-size:11.5px;color:var(--sub);margin-top:2px;line-height:1.5}
.arx-btbl select{font-family:var(--sans);font-size:12.5px;padding:4px;border:1px solid var(--line);background:#fff;max-width:150px}
.arx-btbl tr.off td{opacity:.45}
.arx-bbad{margin-top:14px;font-size:13px}
.arx-bbad summary{cursor:pointer;color:var(--sub)}
@media(max-width:640px){.arx-btbl thead{display:none}.arx-btbl tr{display:grid;grid-template-columns:auto 1fr;gap:4px 8px;padding:6px 0;border-bottom:1px solid var(--line2)}.arx-btbl td{border:none;padding:2px 6px}.arx-btbl td.ord{grid-row:span 3}}
.arq-preview{background:#fff;border:1px solid var(--line);padding:12px;overflow:auto}
.arq-sheet{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.arq-card{display:flex;gap:12px;align-items:center;border:1px dashed #999;padding:10px;break-inside:avoid;page-break-inside:avoid;background:#fff}
.arq-qr{width:110px;height:110px;flex:none}
.arq-qr svg{width:100%;height:100%;display:block}
.arq-no{font-family:'Archivo','Noto Sans KR',sans-serif;font-weight:900;font-size:20px;color:#111}
.arq-title{font-size:11px;color:#666;margin-top:2px}
.arq-how{font-size:11.5px;color:#111;margin-top:6px;line-height:1.5}
.arq-notice{font-size:10.5px;color:#B5382A;margin-top:5px}
.arq-print-root{display:none}
@media print{
  body.arx-printing > *:not(.arq-print-root){display:none!important}
  body.arx-printing .arq-print-root{display:block!important}
  body.arx-printing{overflow:visible!important;background:#fff}
  .arq-print-root .arq-sheet{grid-template-columns:repeat(2,1fr);gap:6mm}
  .arq-print-root .arq-card{height:62mm;padding:4mm;gap:5mm}
  .arq-print-root .arq-qr{width:40mm;height:40mm}
  @page{size:A4;margin:10mm}
}
`;

export function ArStyle() {
  return <style>{AR_CSS}</style>;
}
