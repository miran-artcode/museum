/* ============================================================
   다양한 학습자를 위한 학습 지원: 학생 화면 (2026-09-28)
   ------------------------------------------------------------
   학생이 상단의 「학습 지원」을 눌러 스스로 고르는 지원들. 설계와 근거: 다양한_학습자_지원_설계.md
     · 보기: 글자 크기·간격·고대비·어두운 화면·움직임 줄이기·버튼 크게·링크 밑줄 (<html> data 속성 + ACCESS_CSS)
     · 듣기: 읽기 자료와 작품 설명 읽어 주기(읽는 문장 강조), 고른 글 읽기
     · 언어: 도움 언어로 입장 안내·화면 용어·핵심 용어 보기, 기기 안 번역을 원문 아래에 함께 보기, 내 언어 메모
     · 글로 보기: 교사 목소리의 실시간 자막, 쉬운 말 요약, 핵심 용어, 녹음·영상의 글 기록, 다른 감각 관찰
     · 입력: 말로 입력(교사가 허용할 때)
   저장: 설정은 기록지의 _sup, 사용 횟수는 _supUse (src-access-core.mjs). 진단명은 어디에도 저장하지 않는다.
   설정 저장은 입력 잠금(src-ws-lock.jsx)과 무관하다: 잠금 중에도 글자 크기는 바꿀 수 있어야 한다.
   그래서 setField 대신 fbStore.updateFields로 _sup·_supUse 키만 직접 쓴다(학생 화면의 구독이 받아 합친다).
   교사 화면·미리 보기처럼 AccessProvider 밖에서 그려지면 모든 부품이 원래 모양 그대로 그린다.
   ============================================================ */
import React, { useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { fbStore } from "./src-fb.js";
import {
  ACCESS_LANGS, langOf, TEXT_STEPS, RATE_STEPS, CAP_SIZES, PRESETS,
  normPrefs, prefsAttrs, applyPreset, accessCfg, toolsNow, findTerms, sldictUrl, plainOf,
  textSig, sigSim, SIG_MIN, readingText,
  capMerge, bumpUse, mergeUse, DEFAULT_PREFS,
} from "./src-access-core.mjs";
import {
  installTranslateGuard, ttsSupported, loadVoices, voicesFor, speak, stopSpeaking, rangeIn, highlightRange,
  sttSupported, sttLocalStatus, listen, insertIntoField, translatorApi, translateStatus, getTranslator, translate,
} from "./src-access-speech.mjs";
import { GATE_HELP, label, UI_WORDS } from "./src-access-i18n.mjs";
import { LEXICON } from "./src-access-lexicon.mjs";
import { describeOf } from "./src-access-describe.mjs";
import { OBS_ALT } from "./src-access-obs.mjs";

/* 이 파일을 불러오는 순간 설치한다: 첫 화면(입장)부터 페이지 번역을 켜도 멈추지 않게 */
installTranslateGuard();

const nowIso = () => new Date().toISOString();
export const AccessCtx = React.createContext(null);
export const useAccess = () => useContext(AccessCtx);

/* ---------- <html> 속성 ---------- */
const ATTR_KEYS = Object.keys(prefsAttrs({}));
function applyAttrs(p) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const a = prefsAttrs(p);
  for (const k of ATTR_KEYS) {
    if (a[k] == null || (k === "data-ax-text" && a[k] === "100")) root.removeAttribute(k);
    else root.setAttribute(k, a[k]);
  }
}
/* 공용 컴퓨터: 나가기·입장 화면에서 앞 학생의 보기 설정을 걷어 낸다 */
export function resetAccess() {
  applyAttrs(DEFAULT_PREFS);
  stopSpeaking();
  highlightRange(null);
}

/* 움직임 줄이기: 앱의 부드러운 스크롤은 운영체제 설정(prefers-reduced-motion)만 보므로, 이 설정도 따르게 한다 */
let scrollPatched = false;
function patchScroll() {
  if (scrollPatched || typeof Element === "undefined") return;
  scrollPatched = true;
  const orig = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = function (arg) {
    if (document.documentElement.hasAttribute("data-ax-motion") && arg && typeof arg === "object") arg = { ...arg, behavior: "auto" };
    return orig.call(this, arg);
  };
}

/* 입장 화면에서 고른 도움 언어(같은 탭 안에서만): 처음 들어온 학생의 설정 씨앗 */
const GATE_LANG_KEY = "museum:gateLang";
const gateLang = {
  save(v) { try { sessionStorage.setItem(GATE_LANG_KEY, v); } catch (e) {} },
  read() { try { return sessionStorage.getItem(GATE_LANG_KEY) || ""; } catch (e) { return ""; } },
};

/* ============================================================
   Provider: StudentApp 전체를 감싼다
   props: sid, ws(기록지), setField, cfgAll, session(지금 차시), where("lesson"|"quiz"|"assess")
   ============================================================ */
export function AccessProvider({ sid, ws, setField, cfgAll, session, where, loaded, children }) {
  const w = ws || {};
  const remote = w._sup;
  const [prefs, setPrefsState] = useState(() => normPrefs(remote));
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const pendingRef = useRef(null);   // 아직 서버에 못 보낸 설정
  const writeTimer = useRef(null);
  const seeded = useRef(false);

  /* 다른 기기·교사 되돌리기로 _sup이 바뀌면 받는다. 이 탭이 보내는 중이면 이 탭의 값을 지킨다 */
  const remoteKey = JSON.stringify(remote || null);
  useEffect(() => {
    if (!loaded) return;
    if (pendingRef.current) return;
    if (remote) { setPrefsState(normPrefs(remote)); return; }
    // 처음 들어온 학생: 입장 화면에서 고른 언어가 있으면 그 언어로 시작한다
    if (!seeded.current) {
      seeded.current = true;
      const g = gateLang.read();
      if (g && langOf(g)) setPrefs((p) => ({ ...p, lang: g, bilingual: true }));
    }
  }, [remoteKey, loaded]);

  useLayoutEffect(() => { applyAttrs(prefs); if (prefs.motion) patchScroll(); }, [prefs]);

  const flushPrefs = async () => {
    clearTimeout(writeTimer.current);
    const p = pendingRef.current;
    if (!p || !sid) return;
    const r = await fbStore.updateFields("ws:" + sid, { _sup: { ...p, at: nowIso() } });
    if (r === true) { if (pendingRef.current === p) pendingRef.current = null; }
    else writeTimer.current = setTimeout(flushPrefs, 8000); // 문서가 아직 없거나(첫 저장 전) 연결이 끊김: 잠시 뒤 다시
  };
  const setPrefs = (next) => {
    const cur = prefsRef.current;
    const n = normPrefs(typeof next === "function" ? next(cur) : next);
    prefsRef.current = n;
    setPrefsState(n);
    pendingRef.current = n;
    clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(flushPrefs, 700);
  };

  /* 사용 횟수: 모아 두었다가 30초마다, 그리고 창을 가릴 때 한 번에 쓴다 */
  const useAcc = useRef({});
  const useTimer = useRef(null);
  const useRefV = useRef(w._supUse);
  useRefV.current = w._supUse;
  const lastUseWrite = useRef({ at: 0, v: null });
  const flushUse = async () => {
    clearTimeout(useTimer.current);
    useTimer.current = null;
    const acc = useAcc.current;
    if (!sid || !Object.keys(acc).length) return;
    useAcc.current = {};
    // 방금 쓴 값이 구독으로 아직 돌아오지 않았으면 그 값을 바탕으로 더한다
    const base = Date.now() - lastUseWrite.current.at < 15000 && lastUseWrite.current.v ? lastUseWrite.current.v : useRefV.current;
    const merged = mergeUse(base, acc);
    const r = await fbStore.updateFields("ws:" + sid, { _supUse: merged });
    if (r === true) lastUseWrite.current = { at: Date.now(), v: merged };
    else useAcc.current = mergeUse(useAcc.current, acc); // 실패: 다음에 다시
  };
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const logUse = (kind, n) => {
    useAcc.current = bumpUse(useAcc.current, sessionRef.current || "기타", kind, n == null ? 1 : n, nowIso());
    if (!useTimer.current) useTimer.current = setTimeout(flushUse, 30000);
  };
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === "hidden") { flushUse(); flushPrefs(); } };
    document.addEventListener("visibilitychange", onHide);
    return () => { document.removeEventListener("visibilitychange", onHide); flushUse(); flushPrefs(); };
  }, [sid]);

  const cfg = accessCfg(cfgAll);
  const tools = toolsNow(prefs, cfg, where);
  const lang = langOf(prefs.lang);
  // 교사 추천을 적용했거나 넘겼다는 표시. 입력 잠금 중에도 되도록 setField가 아니라 직접 쓴다
  const markRec = () => {
    const r = w._supRec;
    if (sid && r) fbStore.updateFields("ws:" + sid, { _supRec: { ...r, done: nowIso() } });
  };
  const value = {
    sid, prefs, setPrefs, cfg, tools, lang, logUse, session, where,
    ws: w, setField, rec: w._supRec || null, markRec,
  };
  return (
    <AccessCtx.Provider value={value}>
      {children}
      <AccessFloat />
      <CaptionBar />
    </AccessCtx.Provider>
  );
}

/* 이중 표기 이름표: 한국어 + 도움 언어 */
function Lb({ k, lang }) {
  const l = label(k, lang && lang.code);
  return (
    <span className="ax-lb">
      <span>{l.ko}</span>
      {l.tr && <small lang={lang.bcp} translate="no">{l.tr}</small>}
    </span>
  );
}

/* ============================================================
   상단 버튼과 설정 창
   ============================================================ */
export function AccessButton() {
  const ax = useAccess();
  const [open, setOpen] = useState(false);
  if (!ax) return null;
  const hasRec = ax.rec && ax.rec.set && !ax.rec.done;
  return (
    <>
      <button type="button" className="btn small ghost ax-open" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>
        학습 지원{hasRec ? " ●" : ""}
        {ax.lang && <small lang={ax.lang.bcp} translate="no" className="ax-open-l2">{label("panel", ax.lang.code).tr}</small>}
      </button>
      {open && <AccessPanel onClose={() => setOpen(false)} />}
    </>
  );
}

function Toggle({ on, onChange, k, lang, disabled, note }) {
  return (
    <label className={"ax-tg" + (disabled ? " off" : "")}>
      <input type="checkbox" checked={!!on && !disabled} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <Lb k={k} lang={lang} />
      {note && <span className="ax-note">{note}</span>}
    </label>
  );
}

function Seg({ value, options, onChange, name }) {
  return (
    <div className="seg ax-seg" role="group" aria-label={name}>
      {options.map((o) => (
        <button type="button" key={String(o.v)} aria-pressed={value === o.v} className={value === o.v ? "on" : ""} onClick={() => onChange(o.v)}>
          {o.t}
        </button>
      ))}
    </div>
  );
}

export function AccessPanel({ onClose }) {
  const ax = useAccess();
  const ref = useRef(null);
  const [voices, setVoices] = useState([]);
  const [trState, setTrState] = useState("");
  const [dl, setDl] = useState(null);
  const p = ax.prefs;
  const lang = ax.lang;
  const set = (patch) => ax.setPrefs((cur) => ({ ...cur, ...patch }));

  useEffect(() => {
    const d = ref.current;
    if (d && d.showModal && !d.open) { try { d.showModal(); } catch (e) { d.setAttribute("open", ""); } }
    loadVoices().then(() => setVoices(voicesFor("ko")));
  }, []);
  useEffect(() => {
    let live = true;
    if (!p.lang) { setTrState(""); return; }
    translateStatus(p.lang).then((s) => { if (live) setTrState(s); });
    return () => { live = false; };
  }, [p.lang]);

  const close = () => { try { ref.current && ref.current.close(); } catch (e) {} onClose(); };
  const prepare = async () => {
    // 내려받기는 이 클릭 안에서 시작해야 한다(사용자 활성화)
    setDl(0);
    const t = await getTranslator(p.lang, (x) => setDl(x));
    setDl(null);
    setTrState(t ? "available" : "unavailable");
  };
  const test = () => {
    speak([{ text: "읽어 주기 목소리를 확인합니다. 이 빠르기로 읽습니다." }], { lang: "ko-KR", rate: p.rate, voice: p.voice });
  };
  const rec = ax.rec && ax.rec.set && !ax.rec.done ? ax.rec : null;
  const applyRec = () => {
    ax.setPrefs((cur) => ({ ...cur, ...rec.set }));
    ax.markRec();
  };
  const trNote = !p.lang ? "" :
    trState === "available" ? "이 기기에서 번역합니다." :
    trState === "downloadable" || trState === "downloading" ? "처음 한 번 번역 모델을 내려받습니다." :
    trState === "no-api" ? "이 브라우저에서는 번역을 함께 볼 수 없습니다. 용어 풀이는 볼 수 있습니다." :
    trState === "unavailable" ? "이 언어는 이 기기에서 번역할 수 없습니다. 용어 풀이는 볼 수 있습니다." : "";

  return (
    <dialog ref={ref} className="ax-panel" aria-labelledby="ax-panel-h" onClose={onClose} onCancel={() => onClose()}>
      <div className="ax-panel-in">
        <div className="ax-panel-head">
          <h2 id="ax-panel-h"><Lb k="panel" lang={lang} /></h2>
          <button type="button" className="btn small ghost" onClick={close}><Lb k="close" lang={lang} /></button>
        </div>

        {rec && (
          <div className="ax-rec" role="status">
            <b><Lb k="rec" lang={lang} /></b>
            <span>{recText(rec.set)}</span>
            <button type="button" className="btn small" onClick={applyRec}><Lb k="apply" lang={lang} /></button>
          </div>
        )}

        <section className="ax-sec">
          <h3><Lb k="presets" lang={lang} /></h3>
          <div className="ax-presets">
            {PRESETS.map((x) => (
              <button type="button" key={x.k} className="ax-preset" onClick={() => ax.setPrefs((cur) => applyPreset(cur, x.k))}>
                <b>{x.label}</b><span>{x.sub}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="ax-sec">
          <h3><Lb k="lang" lang={lang} /></h3>
          <label className="ax-row">
            <Lb k="helpLang" lang={lang} />
            <select value={p.lang} onChange={(e) => set({ lang: e.target.value })}>
              <option value="">쓰지 않음</option>
              {ACCESS_LANGS.map((l) => <option key={l.code} value={l.code} lang={l.bcp}>{l.native} ({l.ko}{l.dict ? "" : ", 번역 기능이 있는 브라우저에서만"})</option>)}
            </select>
          </label>
          {p.lang && (
            <>
              <Toggle k="bilingual" lang={lang} on={p.bilingual} onChange={(v) => set({ bilingual: v })}
                disabled={!ax.cfg.translate} note={!ax.cfg.translate ? "선생님이 번역을 꺼 두었습니다." : trNote} />
              {ax.cfg.translate && (trState === "downloadable" || trState === "downloading") && (
                <button type="button" className="btn small ghost" onClick={prepare} disabled={dl != null}>
                  {dl != null ? "내려받는 중 " + Math.round(dl * 100) + "%" : "번역 준비하기"}
                </button>
              )}
              <details className="ax-words">
                <summary><Lb k="uiWords" lang={lang} /></summary>
                <dl>
                  {UI_WORDS.map(([ko, tr]) => (
                    <div key={ko}><dt>{ko}</dt><dd lang={lang.bcp} translate="no">{tr[lang.code] || ""}</dd></div>
                  ))}
                </dl>
              </details>
            </>
          )}
        </section>

        <section className="ax-sec">
          <h3><Lb k="view" lang={lang} /></h3>
          <div className="ax-row"><Lb k="text" lang={lang} />
            <Seg name="글자 크기" value={p.text} onChange={(v) => set({ text: v })} options={TEXT_STEPS.map((v) => ({ v, t: v + "%" }))} />
          </div>
          <div className="ax-row"><Lb k="contrast" lang={lang} />
            <Seg name="대비" value={p.contrast} onChange={(v) => set({ contrast: v })}
              options={[{ v: "none", t: label("cNone").ko }, { v: "high", t: label("cHigh").ko }, { v: "dark", t: label("cDark").ko }]} />
          </div>
          <Toggle k="spacing" lang={lang} on={p.spacing} onChange={(v) => set({ spacing: v })} />
          <Toggle k="targets" lang={lang} on={p.targets} onChange={(v) => set({ targets: v })} />
          <Toggle k="underline" lang={lang} on={p.underline} onChange={(v) => set({ underline: v })} />
          <Toggle k="motion" lang={lang} on={p.motion} onChange={(v) => set({ motion: v })} />
        </section>

        <section className="ax-sec">
          <h3><Lb k="listen" lang={lang} /></h3>
          <Toggle k="tts" lang={lang} on={p.tts} onChange={(v) => set({ tts: v })}
            disabled={!ttsSupported()} note={!ttsSupported() ? "이 브라우저는 읽어 주기를 지원하지 않습니다." : ""} />
          {p.tts && ttsSupported() && (
            <>
              <div className="ax-row"><Lb k="rate" lang={lang} />
                <Seg name="읽는 빠르기" value={p.rate} onChange={(v) => set({ rate: v })} options={RATE_STEPS.map((v) => ({ v, t: "×" + v }))} />
              </div>
              {voices.length > 1 && (
                <label className="ax-row"><Lb k="voice" lang={lang} />
                  <select value={p.voice} onChange={(e) => set({ voice: e.target.value })}>
                    <option value="">자동</option>
                    {voices.map((v) => <option key={v.name} value={v.name}>{v.name}{v.localService ? "" : " (온라인)"}</option>)}
                  </select>
                </label>
              )}
              <button type="button" className="btn small ghost" onClick={test}><Lb k="test" lang={lang} /></button>
            </>
          )}
          <Toggle k="descOpen" lang={lang} on={p.desc} onChange={(v) => set({ desc: v })} />
        </section>

        <section className="ax-sec">
          <h3><Lb k="words" lang={lang} /></h3>
          <Toggle k="cap" lang={lang} on={p.cap} onChange={(v) => set({ cap: v })} />
          {p.cap && (
            <div className="ax-row"><Lb k="capSize" lang={lang} />
              <Seg name="자막 크기" value={p.capSize} onChange={(v) => set({ capSize: v })} options={CAP_SIZES.map((v) => ({ v, t: { m: "보통", l: "크게", xl: "아주 크게" }[v] }))} />
            </div>
          )}
          <Toggle k="easy" lang={lang} on={p.easy} onChange={(v) => set({ easy: v })} disabled={!ax.cfg.easy} />
          <Toggle k="gloss" lang={lang} on={p.gloss} onChange={(v) => set({ gloss: v })} disabled={!ax.cfg.gloss} />
          <Toggle k="alt" lang={lang} on={p.alt} onChange={(v) => set({ alt: v })} disabled={!ax.cfg.alt} />
        </section>

        <section className="ax-sec">
          <h3><Lb k="input" lang={lang} /></h3>
          <Toggle k="dict" lang={lang} on={p.dict} onChange={(v) => set({ dict: v })}
            disabled={!ax.cfg.dictation || !sttSupported()}
            note={!sttSupported() ? "이 브라우저는 말로 입력을 지원하지 않습니다." : !ax.cfg.dictation ? "선생님이 켜면 쓸 수 있습니다." : "기기 안 인식이 안 되는 브라우저에서는 말한 소리가 브라우저 회사의 서버로 갑니다."} />
        </section>

        <div className="ax-panel-foot">
          <button type="button" className="btn small ghost" onClick={() => ax.setPrefs({ ...DEFAULT_PREFS, lang: p.lang })}><Lb k="reset" lang={lang} /></button>
          <button type="button" className="btn small" onClick={close}><Lb k="close" lang={lang} /></button>
        </div>
      </div>
    </dialog>
  );
}

/* 교사 추천을 한 줄로 */
const REC_NAMES = {
  text: (v) => "글자 " + v + "%", spacing: () => "간격 넓게", contrast: (v) => (v === "dark" ? "어두운 화면" : v === "high" ? "고대비" : ""),
  motion: () => "움직임 줄이기", targets: () => "버튼 크게", underline: () => "링크 밑줄", tts: () => "읽어 주기",
  lang: (v) => (langOf(v) ? "도움 언어 " + langOf(v).native : ""), bilingual: () => "번역 함께 보기", gloss: () => "핵심 용어",
  easy: () => "쉬운 말 요약", desc: () => "작품 설명 펼치기", cap: () => "실시간 자막", dict: () => "말로 입력", alt: () => "다른 감각 관찰",
};
export function recText(set) {
  return Object.keys(set || {}).map((k) => (REC_NAMES[k] ? REC_NAMES[k](set[k]) : "")).filter(Boolean).join(", ");
}

/* ============================================================
   읽기 자료 (src-reading.jsx의 ReadingBody 안에 두 부품을 둔다)
   · AccessReadingBar: 읽기 자료 맨 위. 읽어 주기, 번역 함께 보기, 쉬운 말 요약, 이 자료의 핵심 용어
   · AccessPara: 문단(블록) j 바로 뒤. 번역을 켠 학생에게만 그 문단의 번역을 붙인다
   두 부품은 읽기 자료마다(차시 번호 + 제목) 모듈 안의 작은 상태를 나눠 쓴다: 부모를 감쌀 필요가 없다.
   읽어 주기는 화면에 그려진 글(.rd-p·인용·핵심·목록·소제목)을 그대로 읽으므로 본문 표시 방식이 바뀌어도 맞는다.
   Provider가 없으면(교사 수업 안내·예시 기록지) 둘 다 아무것도 그리지 않는다.
   ============================================================ */
const lexOf = (n) => (LEXICON && LEXICON[n]) || null;
/* 쉬운 말 요약: 요약을 만들 때의 읽기 자료와 제목이 같고 본문 지문이 비슷할 때만 쓴다.
   교사가 수업 편집에서 고치거나 본문을 다시 짜서 내용이 크게 달라지면 요약이 맞지 않으므로 숨긴다
   (다시 만들 목록: node scripts/access-check.mjs) */
const easyCache = new Map();
function easyOf(L, rd) {
  const lx = lexOf(L && L.n);
  if (!lx || !rd) return null;
  const e = (lx.easy || []).find((x) => x.h === rd.h);
  if (!e) return null;
  if (!e.sig || !e.sig.length) return e.s;
  const text = readingText(rd);
  const ck = [L.n, rd.h, text.length, text.slice(0, 80)].join("|");
  if (!easyCache.has(ck)) easyCache.set(ck, sigSim(e.sig, textSig(text)) >= SIG_MIN);
  return easyCache.get(ck) ? e.s : null;
}

/* 읽기 자료 한 편의 공유 상태 */
const rdStates = new Map();
const rdSubs = new Set();
let rdVer = 0;
const rdKey = (L, rd) => (L ? L.n : 0) + ":" + (rd ? rd.h : "");
function rdGet(key) {
  if (!rdStates.has(key)) rdStates.set(key, { showTr: false, lang: "", tr: {}, speakJ: -1 });
  return rdStates.get(key);
}
function rdSet(key, patch) {
  rdStates.set(key, { ...rdGet(key), ...patch });
  rdVer++;
  rdSubs.forEach((f) => f());
}
const rdSub = (f) => { rdSubs.add(f); return () => rdSubs.delete(f); };
const useRd = (key) => { useSyncExternalStore(rdSub, () => rdVer); return rdGet(key); };

/* 읽기 자료는 접힌 <details> 안에 늘 그려져 있다. 펼쳤을 때만 번역·사용 기록을 하려고 열림 상태를 따라간다 */
function useDetailsOpen(elRef) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const d = elRef.current && elRef.current.closest && elRef.current.closest("details");
    if (!d) { setOpen(true); return; }
    const on = () => setOpen(d.open);
    on();
    d.addEventListener("toggle", on);
    return () => d.removeEventListener("toggle", on);
  }, []);
  return open;
}

/* 화면에 그려진 읽기 자료의 글 덩어리를 차례로. 학습 지원이 덧붙인 것(.ax-*)은 뺀다.
   도식(section.vz: 연표·흐름·비교·용어 등)은 통째로 innerText로 읽는다(글 순서가 맞다). 도식은 문장 강조를 하지 않는다 */
const READ_SEL = ".rd-h, .rd-p, .rd-q p, .rd-q cite, .rd-key p, .rd-list li, section.vz, .rd-fig-t, .rd-asks-h, .rd-asks li:not(.rd-ask), .rd-ask-q";
function textBlocks(root) {
  if (!root) return [];
  return Array.from(root.querySelectorAll(READ_SEL))
    .filter((el) => !el.closest("[class^='ax-'], [class*=' ax-']") && !(el.parentElement && el.parentElement.closest("section.vz")) && (el.textContent || "").trim())
    .map((el) => (el.matches("section.vz")
      ? { el, text: (el.innerText || el.textContent || "").replace(/\s*\n\s*/g, ". "), noHl: true }
      : { el, text: el.textContent }));
}

export function AccessReadingBar({ L, rd }) {
  const ax = useAccess();
  const anchor = useRef(null);
  const open = useDetailsOpen(anchor);
  const key = rdKey(L, rd);
  const st = useRd(key);
  const [speaking, setSpeaking] = useState(false);
  const speakingRef = useRef(false);
  speakingRef.current = speaking;
  const [trErr, setTrErr] = useState("");
  const [term, setTerm] = useState(null);
  const tools = ax ? ax.tools : {};
  const prefs = ax ? ax.prefs : {};
  const easy = ax && tools.easy ? easyOf(L, rd) : null;
  const paras = (rd && rd.p) || [];
  const allTerms = ax && tools.gloss ? ((lexOf(L && L.n) || {}).terms || []) : [];
  // 이 읽기 자료에 실제로 나오는 용어만(나온 순서대로)
  const here = useMemo(() => {
    if (!allTerms.length) return [];
    const segs = findTerms(paras.map(plainOf).join("\n"), allTerms, new Set());
    return segs.filter((x) => typeof x !== "string").map((x) => x.term);
  }, [paras, allTerms]);

  const runTr = async () => {
    setTrErr("");
    const code = prefs.lang;
    const t = await getTranslator(code);
    if (!t) { setTrErr("이 기기에서는 번역할 수 없습니다."); rdSet(key, { showTr: false }); return; }
    paras.forEach((raw, j) => {
      const text = plainOf(raw);
      if (!text) return;
      translate(code, text).then((out) => {
        const cur = rdGet(key);
        rdSet(key, { tr: { ...cur.tr, [code + ":" + j]: out == null ? "" : out } });
      });
    });
  };
  const toggleTr = () => {
    const next = !st.showTr;
    rdSet(key, { showTr: next, lang: prefs.lang });
    if (next) { ax.logUse("trans"); runTr(); }
  };
  // 「번역 함께 보기」를 켜 두면 읽기 자료를 펼칠 때 바로 번역한다(모델을 이미 받아 둔 경우. 내려받기는 버튼 클릭이 있어야 한다)
  useEffect(() => {
    if (!ax || !open || !tools.bilingual || st.showTr || !translatorApi()) return;
    let live = true;
    translateStatus(prefs.lang).then((s) => { if (live && s === "available") { rdSet(key, { showTr: true, lang: prefs.lang }); runTr(); } });
    return () => { live = false; };
  }, [open, tools.bilingual, prefs.lang]);
  useEffect(() => { if (ax && open && easy) ax.logUse("easy"); }, [open, !!easy]);
  // 접으면 읽기를 멈춘다
  useEffect(() => { if (!open && speakingRef.current) stopSpeaking(); }, [open]);
  useEffect(() => () => { if (speakingRef.current) stopSpeaking(); }, []);

  if (!ax) return null;
  const hasBar = tools.tts || tools.translate || here.length > 0;
  if (!hasBar && !easy) return <span ref={anchor} hidden />;
  const lang = ax.lang;

  const read = () => {
    if (speaking) { stopSpeaking(); return; }
    const root = anchor.current && anchor.current.closest(".rd");
    const items = textBlocks(root);
    if (!items.length) return;
    ax.logUse("tts");
    setSpeaking(true);
    speak(items, {
      lang: "ko-KR", rate: prefs.rate, voice: prefs.voice,
      onChunk: ({ item, chunk }) => {
        listening();
        highlightRange(item.noHl ? null : rangeIn(item.el, chunk.start, chunk.end));
        const r = item.el.getBoundingClientRect ? item.el.getBoundingClientRect() : null;
        if (r && (r.bottom > window.innerHeight || r.top < 0)) item.el.scrollIntoView({ block: "center", behavior: prefs.motion ? "auto" : "smooth" });
      },
      onEnd: () => { highlightRange(null); setSpeaking(false); },
    });
  };

  return (
    <div className="ax-rtop">
      <span ref={anchor} hidden />
      {hasBar && (
        <div className="ax-rbar" role="group" aria-label="읽기 자료 도구">
          {tools.tts && (
            <button type="button" className={"btn small " + (speaking ? "" : "ghost")} aria-pressed={speaking} onClick={read}>
              {speaking ? "■ " + label("stop").ko : "▶ " + label("read").ko}
            </button>
          )}
          {tools.translate && (
            <button type="button" className={"btn small " + (st.showTr ? "" : "ghost")} aria-pressed={st.showTr} onClick={toggleTr}>
              <Lb k={st.showTr ? "trOff" : "trOn"} lang={lang} />
            </button>
          )}
          {here.length > 0 && (
            <span className="ax-chips" role="group" aria-label="이 자료의 핵심 용어">
              <span className="ax-chips-l">용어</span>
              {here.map((t) => (
                <button type="button" key={t.t} className={"ax-chip" + (term === t.t ? " on" : "")} aria-expanded={term === t.t}
                  onClick={() => { const same = term === t.t; setTerm(same ? null : t.t); if (!same) ax.logUse("gloss"); }}>
                  {t.t}
                </button>
              ))}
            </span>
          )}
          {trErr && <span className="hint" role="status">{trErr}</span>}
        </div>
      )}
      {term && <TermCard term={here.find((x) => x.t === term)} lang={lang} onClose={() => setTerm(null)} />}
      {easy && (
        <div className="ax-easy" role="note" aria-label="쉬운 말로 먼저 보기">
          <b><Lb k="easyT" lang={lang} /></b>
          <ul>{easy.map((s, k) => <li key={k}>{s}</li>)}</ul>
          {tools.tts && (
            <button type="button" className="btn small ghost" onClick={() => { ax.logUse("tts"); speak([{ text: easy.join(" ") }], { lang: "ko-KR", rate: prefs.rate, voice: prefs.voice, onChunk: listening }); }}>
              ▶ {label("read").ko}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* 문단 j의 번역. 「번역 함께 보기」를 켠 읽기 자료에서만 그린다 */
export function AccessPara({ L, rd, j, raw }) {
  const ax = useAccess();
  const st = useRd(rdKey(L, rd));
  if (!ax || !ax.tools.translate || !st.showTr) return null;
  if (!plainOf(raw)) return null;
  const code = st.lang || ax.prefs.lang;
  const v = st.tr[code + ":" + j];
  const lang = langOf(code);
  return (
    <p className="ax-tr" lang={lang ? lang.bcp : undefined} translate="no">
      {v == null ? "번역 중…" : v || "(번역하지 못했습니다)"}
    </p>
  );
}

/* 읽어 주기로 듣는 동안은 「살펴본 시간」으로 센다(src-dwell.js의 museum:listening) */
function listening() {
  try { window.dispatchEvent(new Event("museum:listening")); } catch (e) {}
}

function TermCard({ term, lang, onClose }) {
  const ax = useAccess();
  if (!term) return null;
  const l2 = lang && term.tr && term.tr[lang.code];
  return (
    <div className="ax-def" role="note" aria-label={"용어 풀이: " + term.t}>
      <div className="ax-def-h">
        <b>{term.t}</b>
        {l2 && <span lang={lang.bcp} translate="no" className="ax-def-l2">{l2.t}</span>}
        {onClose && <button type="button" className="btn small ghost" onClick={onClose}>닫기</button>}
      </div>
      <p>{term.easy}</p>
      {term.ex && <p className="ax-def-ex">예: {term.ex}</p>}
      {l2 && l2.d && <p lang={lang.bcp} translate="no" className="ax-def-l2d">{l2.d}</p>}
      <div className="ax-def-tools">
        {ax && ax.tools.tts && (
          <button type="button" className="btn small ghost" onClick={() => { ax.logUse("tts"); speak([{ text: term.t + ". " + term.easy }], { lang: "ko-KR", rate: ax.prefs.rate, voice: ax.prefs.voice }); }}>▶ 읽어 주기</button>
        )}
        <a className="wk-link" href={sldictUrl(term.sign || term.t)} target="_blank" rel="noopener noreferrer">한국수어사전에서 찾기 ↗</a>
      </div>
    </div>
  );
}

/* 강의 노트 머리의 「이번 차시 핵심 용어」 (학습 목표 아래). 접힌 상자라 필요한 학생만 펼친다 */
export function AccessLessonTerms({ L }) {
  const ax = useAccess();
  if (!ax) return null;
  const lx = lexOf(L.n);
  const terms = (lx && lx.terms) || [];
  // 사전 훈련 원리(Mayer 2021, 중앙값 d = 0.78): 수업 전에 핵심 용어를 먼저 본다. 학급 설정이 켜져 있으면 모든 학생에게 접힌 상자로 보인다
  const want = ax.cfg.gloss && ax.where !== "quiz";
  if (!want || !terms.length) return null;
  const lang = ax.lang;
  return (
    <details className="ax-terms" onToggle={(e) => { if (e.target.open) ax.logUse("gloss"); }}>
      <summary><Lb k="terms" lang={lang} /> <span className="ax-count">{terms.length}</span></summary>
      <dl>
        {terms.map((t) => {
          const l2 = lang && t.tr && t.tr[lang.code];
          return (
            <div key={t.t} className="ax-term-row">
              <dt>{t.t}{l2 && <span lang={lang.bcp} translate="no"> · {l2.t}</span>}</dt>
              <dd>
                {t.easy}
                {l2 && l2.d && <span className="ax-def-l2d" lang={lang.bcp} translate="no">{l2.d}</span>}
                <a className="wk-link" href={sldictUrl(t.sign || t.t)} target="_blank" rel="noopener noreferrer">수어 ↗</a>
              </dd>
            </div>
          );
        })}
      </dl>
    </details>
  );
}

/* 강의 노트 끝의 「내 언어 메모」: 도움 언어를 고른 학생이 어떤 언어로든 생각을 먼저 적는 곳(트랜스랭귀징).
   학습지 칸과 따로 저장해(_supMemo) 창의성·연구 지표에 섞이지 않는다 */
export function AccessMemo({ L }) {
  const ax = useAccess();
  if (!ax || !ax.lang || !ax.setField) return null;
  const memo = ax.ws._supMemo || {};
  const v = memo[L.n] || "";
  return (
    <details className="ax-memo" open={!!v}>
      <summary><Lb k="memo" lang={ax.lang} /></summary>
      <textarea rows={4} value={v} aria-label="내 언어 메모" lang={v ? undefined : ax.lang.bcp}
        onChange={(e) => {
          if (!v) ax.logUse("memo");
          ax.setField("_supMemo", { ...memo, [L.n]: e.target.value.slice(0, 4000) });
        }} />
    </details>
  );
}

/* ============================================================
   그림: 대체 글과 작품 설명 (src-content.jsx의 LessonFigure가 부른다)
   ============================================================ */
/* 그림의 대체 글: 작품 설명이 있으면 보이는 것 위주의 짧은 글, 없으면 부른 쪽이 준 글(캡션 제목) */
export function figAlt(img, fallback) {
  const d = img && describeOf(img.src);
  return (d && d.alt) || fallback || (img && img.cap) || "수업 자료 그림";
}

export function FigureDesc({ src }) {
  const ax = useAccess();
  const d = describeOf(src);
  const [speaking, setSpeaking] = useState(false);
  if (!d || !d.desc || !d.desc.length) return null;
  const open = !!(ax && ax.tools.descOpen);
  const all = [...d.desc, d.touch].filter(Boolean);
  return (
    <details className="ax-desc" open={open || undefined} onToggle={(e) => { if (e.target.open && ax) ax.logUse("desc"); }}>
      <summary>작품 설명</summary>
      <div className="ax-desc-in">
        {d.desc.map((s, k) => <p key={k}>{s}</p>)}
        {d.touch && <p className="ax-touch">{d.touch}</p>}
        {ax && ax.tools.tts && (
          <button type="button" className="btn small ghost" aria-pressed={speaking}
            onClick={() => {
              if (speaking) { stopSpeaking(); return; }
              ax.logUse("descTts");
              setSpeaking(true);
              speak([{ text: all.join(" ") }], { lang: "ko-KR", rate: ax.prefs.rate, voice: ax.prefs.voice, onEnd: () => setSpeaking(false) });
            }}>{speaking ? "■ 멈추기" : "▶ 설명 듣기"}</button>
        )}
      </div>
    </details>
  );
}

/* ============================================================
   녹음·영상 칸 아래: 글로도 적기 (_tx[칸 키])
   청각장애 학생·관람자가 녹음과 영상의 내용을 글로 읽을 수 있게 하고, 소리 산책의 기록을 글로도 남긴다
   ============================================================ */
export function MediaText({ fieldKey, kind, v }) {
  const ax = useAccess();
  if (!ax || !ax.setField) return null;
  const tx = ax.ws._tx || {};
  const val = tx[fieldKey] || "";
  if (!v && !val) return null; // 녹음·영상이 있을 때만
  return (
    <div className="ax-mtext">
      <label>
        <span>{kind === "video" ? "영상 내용을 글로도 적기 (선택)" : "녹음 내용을 글로도 적기 (선택)"}</span>
        <textarea rows={2} value={val} onChange={(e) => ax.setField("_tx", { ...tx, [fieldKey]: e.target.value.slice(0, 2000) })} />
      </label>
    </div>
  );
}
/* 교사 화면·전시장에서 녹음 아래에 보인다 */
export function MediaTextRead({ ws, fieldKey }) {
  const t = ws && ws._tx && ws._tx[fieldKey];
  if (!t) return null;
  return <p className="ax-mtext-r"><b>글 기록</b> {t}</p>;
}

/* ============================================================
   관찰 방법: 다른 감각으로 하는 방법 (src-access-obs.mjs의 OBS_ALT)
   ============================================================ */
export function ObsAlt({ k }) {
  const ax = useAccess();
  if (!ax || !ax.tools.alt) return null;
  const a = OBS_ALT[k];
  if (!a) return null;
  return (
    <details className="ax-obs" onToggle={(e) => { if (e.target.open) ax.logUse("alt"); }}>
      <summary>다른 감각으로 하기</summary>
      <ul>{a.map((x, i) => <li key={i}><b>{x.h}</b> {x.t}</li>)}</ul>
    </details>
  );
}

/* ============================================================
   떠 있는 도구: 고른 글 읽기 · 말로 입력
   ============================================================ */
function editable(el) {
  if (!el || !el.tagName) return false;
  if (el.disabled || el.readOnly) return false;
  if (el.tagName === "TEXTAREA") return true;
  return el.tagName === "INPUT" && /^(text|search|)$/i.test(el.type || "");
}

function AccessFloat() {
  const ax = useAccess();
  const lastField = useRef(null);
  const [dict, setDict] = useState(null); // 듣는 중인 인식기
  const [interim, setInterim] = useState("");
  const [dictLang, setDictLang] = useState("ko");
  const [msg, setMsg] = useState("");
  useEffect(() => {
    const onFocus = (e) => { if (editable(e.target)) lastField.current = e.target; };
    document.addEventListener("focusin", onFocus);
    return () => document.removeEventListener("focusin", onFocus);
  }, []);
  useEffect(() => () => { dict && dict.stop(); }, [dict]);
  if (!ax || (!ax.tools.tts && !ax.tools.dict)) return null;
  return <AccessFloatBar ax={ax} lastField={lastField} dict={dict} setDict={setDict} interim={interim} setInterim={setInterim}
    dictLang={dictLang} setDictLang={setDictLang} msg={msg} setMsg={setMsg} />;
}

/* 떠 있는 도구가 보이는 동안 초점이 가려지지 않게 아래 여백을 준다(WCAG 2.4.11) */
function AccessFloatBar({ ax, lastField, dict, setDict, interim, setInterim, dictLang, setDictLang, msg, setMsg }) {
  useEffect(() => {
    document.documentElement.setAttribute("data-ax-float", "1");
    return () => document.documentElement.removeAttribute("data-ax-float");
  }, []);
  const { tools, prefs } = ax;

  const readSel = () => {
    const s = String((window.getSelection && window.getSelection()) || "").trim();
    if (!s) { setMsg("읽을 글을 먼저 끌어서 고르세요."); setTimeout(() => setMsg(""), 2500); return; }
    ax.logUse("tts");
    speak([{ text: s.slice(0, 3000) }], { lang: "ko-KR", rate: prefs.rate, voice: prefs.voice });
  };
  const toggleDict = async () => {
    if (dict) { dict.stop(); setDict(null); setInterim(""); return; }
    const el = lastField.current;
    if (!el || !document.body.contains(el) || !editable(el)) { setMsg("글을 쓸 칸을 먼저 누르세요."); setTimeout(() => setMsg(""), 2500); return; }
    ax.logUse("dict");
    const bcp = dictLang === "ko" ? "ko-KR" : (ax.lang ? ax.lang.bcp : "ko-KR");
    const local = (await sttLocalStatus(bcp)) === "available"; // 되면 소리를 밖으로 보내지 않는다
    const h = listen({
      lang: bcp,
      local,
      onFinal: (t) => { const f = lastField.current; if (f && document.body.contains(f)) insertIntoField(f, t); },
      onInterim: setInterim,
      onState: (s, code) => {
        if (s === "err") setMsg(code === "not-allowed" ? "마이크 권한을 허용해야 합니다." : "말로 입력을 시작하지 못했습니다.");
        if (s !== "on") { setDict(null); setInterim(""); }
      },
    });
    setDict(h);
    try { el.focus({ preventScroll: true }); } catch (e) {}
  };
  const keep = (e) => e.preventDefault(); // 버튼을 눌러도 글칸의 커서가 그대로 있게

  return (
    <div className="ax-float" role="group" aria-label="학습 지원 도구">
      {msg && <span className="ax-float-msg" role="status">{msg}</span>}
      {dict && interim && <span className="ax-float-msg" aria-live="off">{interim}</span>}
      {tools.tts && <button type="button" className="btn small ghost" onMouseDown={keep} onClick={readSel}>▶ {label("sel").ko}</button>}
      {tools.dict && (
        <>
          {ax.lang && (
            <select aria-label="말로 입력 언어" value={dictLang} onChange={(e) => setDictLang(e.target.value)}>
              <option value="ko">한국어</option>
              <option value={ax.lang.code}>{ax.lang.native}</option>
            </select>
          )}
          <button type="button" className={"btn small " + (dict ? "seal" : "ghost")} aria-pressed={!!dict} onMouseDown={keep} onClick={toggleDict}>
            {dict ? "● " + label("dictOff").ko : "🎤 " + label("dictOn").ko}
          </button>
        </>
      )}
    </div>
  );
}

/* ============================================================
   실시간 자막 표시줄 (교사가 방송할 때, 자막을 켠 학생만 구독)
   ============================================================ */
const CAP_KEY = "liveCaption";

function CaptionBar() {
  const ax = useAccess();
  const on = !!(ax && ax.prefs.cap);
  const [doc, setDoc] = useState(null);
  const [hist, setHist] = useState(null);
  const [showHist, setShowHist] = useState(false);
  const [small, setSmall] = useState(false);
  const [trLines, setTrLines] = useState({});
  useEffect(() => {
    if (!on) { setDoc(null); return; }
    const un = fbStore.watchDoc(CAP_KEY, (v) => {
      setDoc(v || null);
      setHist((h) => capMerge(h, v || {}));
    });
    return () => un && un();
  }, [on]);
  // 자막을 받은 시간(분): 방송이 켜져 있고 표시줄이 보이는 동안
  const live = on && doc && doc.on;
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => ax.logUse("cap", 1), 60000);
    return () => clearInterval(t);
  }, [live]);
  // 도움 언어가 있으면 새 줄을 기기 안에서 번역해 아래에 함께 보인다
  const lang = ax && ax.tools.translate ? ax.prefs.lang : "";
  const lines = (doc && doc.lines) || [];
  const lastTwo = lines.slice(-2);
  const lastKey = lastTwo.map((l) => l.i).join(",");
  useEffect(() => {
    if (!lang || !lastTwo.length) return;
    lastTwo.forEach((l) => {
      if (trLines[l.i] != null) return;
      translate(lang, l.t).then((out) => setTrLines((m) => ({ ...m, [l.i]: out || "" })));
    });
  }, [lang, lastKey]);
  if (!on) return null;
  if (!live) {
    return <div className="ax-cap ax-cap-wait" role="status">자막: 선생님이 방송을 시작하면 여기에 보입니다.</div>;
  }
  return (
    <>
      <div className={"ax-cap" + (small ? " ax-cap-small" : "")} role="region" aria-label="실시간 자막">
        <div className="ax-cap-lines" aria-live="off">
          {lastTwo.map((l) => (
            <div key={l.i}>
              <span>{l.t}</span>
              {lang && trLines[l.i] && <span className="ax-cap-tr" lang={ax.lang.bcp} translate="no">{trLines[l.i]}</span>}
            </div>
          ))}
          {doc.interim && <div className="ax-cap-int">{doc.interim}</div>}
        </div>
        <div className="ax-cap-tools">
          <button type="button" className="btn small ghost" onClick={() => setShowHist(true)}>{label("capHist").ko}</button>
          <button type="button" className="btn small ghost" aria-pressed={small} onClick={() => setSmall(!small)}>{small ? "펼치기" : "줄이기"}</button>
        </div>
      </div>
      {showHist && <CaptionHistory hist={hist} onClose={() => setShowHist(false)} />}
    </>
  );
}

function CaptionHistory({ hist, onClose }) {
  const ref = useRef(null);
  useEffect(() => { const d = ref.current; if (d && d.showModal && !d.open) { try { d.showModal(); } catch (e) {} } }, []);
  const lines = (hist && hist.lines) || [];
  const fmt = (ms) => { const d = new Date(ms || 0); return isNaN(d) || !ms ? "" : String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); };
  return (
    <dialog ref={ref} className="ax-panel ax-hist" aria-labelledby="ax-hist-h" onClose={onClose} onCancel={onClose}>
      <div className="ax-panel-in">
        <div className="ax-panel-head">
          <h2 id="ax-hist-h">자막 기록</h2>
          <button type="button" className="btn small ghost" onClick={() => { try { ref.current.close(); } catch (e) {} onClose(); }}>닫기</button>
        </div>
        {lines.length ? (
          <ol className="ax-hist-list">{lines.map((l) => <li key={l.i}><time>{fmt(l.at)}</time> {l.t}</li>)}</ol>
        ) : <p className="hint">자막을 켠 뒤로 받은 자막이 없습니다.</p>}
      </div>
    </dialog>
  );
}

/* ============================================================
   입장 화면: 도움 언어로 입장 방법 보기
   ============================================================ */
export function GateLangHelp() {
  const [code, setCode] = useState("");
  useEffect(() => { resetAccess(); }, []); // 입장 화면: 앞 학생의 보기 설정을 걷어 낸다
  const h = code && GATE_HELP[code];
  const l = langOf(code);
  return (
    <div className="ax-gate" translate="no">
      <div className="ax-gate-langs" role="group" aria-label="Language · 언어">
        <span className="ax-gate-l">Language</span>
        {Object.keys(GATE_HELP).map((c) => (
          <button type="button" key={c} lang={langOf(c).bcp} aria-pressed={code === c} className={code === c ? "on" : ""}
            onClick={() => { const next = code === c ? "" : c; setCode(next); gateLang.save(next); }}>
            {GATE_HELP[c].btn}
          </button>
        ))}
      </div>
      {h && (
        <div className="ax-gate-help" lang={l.bcp} role="region" aria-label={h.title}>
          <b>{h.title}</b>
          <ol>{h.steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
          <p>{h.forgot}</p>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   스타일
   ============================================================ */
export const ACCESS_CSS = `
/* ---------- 글자 크기: 화면 전체를 비율로 키운다(브라우저 확대와 같은 방식) ---------- */
html[data-ax-text="125"]{--ax-zoom:1.25}
html[data-ax-text="150"]{--ax-zoom:1.5}
html[data-ax-text="175"]{--ax-zoom:1.75}
html[data-ax-text="200"]{--ax-zoom:2}
html[data-ax-text] body{zoom:var(--ax-zoom,1)}

/* ---------- 줄·글자 간격 (WCAG 1.4.12). 자간은 조금만: 넓은 자간은 저시력 독자의 읽기를 늦춘다(Chung 2002) ---------- */
html[data-ax-spacing] body :is(p,li,dd,dt,td,th,label,summary,.hint,.card-note,.reading-in,textarea,input,.ax-easy){line-height:1.9!important;letter-spacing:.02em!important;word-spacing:.16em!important}
html[data-ax-spacing] body p{margin-bottom:1.1em}

/* ---------- 고대비: 흰 바탕에 검은 글자, 회색 글자를 짙게, 선을 굵게 ---------- */
html[data-ax-contrast="high"]{--ink:#000;--sub:#2b2b2b;--line:#4a4a4a;--line2:#6a6a6a;--seal:#8e1b10;--patina:#1d4a35;--amber:#4d3a14;--card2:#f2f2f2}
html[data-ax-contrast="high"] body{color:#000}
html[data-ax-contrast="high"] :is(.card,.lesson,.btn,.field input,.field textarea,.field select,.sess-tab,.reading){border-color:#000!important}
html[data-ax-contrast="high"] ::placeholder{color:#4a4a4a;opacity:1}
html[data-ax-contrast="high"] a{text-decoration:underline}

/* ---------- 어두운 화면: 색을 뒤집고 사진·영상·그림은 다시 뒤집어 원래 색으로 ---------- */
html[data-ax-contrast="dark"]{filter:invert(1) hue-rotate(180deg);background:#fff}
html[data-ax-contrast="dark"] :is(img,video,canvas,picture,iframe,model-viewer,.ax-keep){filter:invert(1) hue-rotate(180deg)}

/* ---------- 움직임 줄이기 ---------- */
html[data-ax-motion] *,html[data-ax-motion] *::before,html[data-ax-motion] *::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;scroll-behavior:auto!important}

/* ---------- 버튼·입력칸 크게 (WCAG 2.5.8보다 넉넉한 44px) ---------- */
html[data-ax-targets] :is(button,.btn,select,summary,[role=tab],.sess-tab){min-height:44px}
html[data-ax-targets] :is(input:not([type=checkbox]):not([type=radio]):not([type=file]),select){min-height:44px;font-size:16px}
html[data-ax-targets] :is(input[type=checkbox],input[type=radio]){width:22px;height:22px}
html[data-ax-targets] .btn.small{padding:10px 14px;font-size:14px}

/* ---------- 링크 밑줄 ---------- */
html[data-ax-underline] a{text-decoration:underline!important;text-underline-offset:3px}

/* ---------- 이중 표기 이름표 ---------- */
.ax-lb{display:inline-flex;flex-direction:column;line-height:1.3}
.ax-lb small{font-size:.8em;color:var(--sub);font-weight:400}
.ax-open{display:inline-flex;flex-direction:column;align-items:center;line-height:1.2}
.ax-open-l2{font-size:10px;color:var(--sub)}

/* ---------- 설정 창 ---------- */
dialog.ax-panel{border:1px solid #111;padding:0;max-width:min(560px,calc((100vw - 16px) / var(--ax-zoom,1)));width:100%;max-height:calc(88vh / var(--ax-zoom,1));margin:auto;background:var(--card,#fff);color:var(--ink,#111)}
dialog.ax-panel::backdrop{background:rgba(0,0,0,.45)}
.ax-panel-in{padding:18px 18px 16px;overflow:auto;max-height:inherit;box-sizing:border-box}
.ax-panel-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px}
.ax-panel-head h2{font-size:18px;margin:0}
.ax-sec{border-top:1px solid var(--line);padding:12px 0 6px}
.ax-sec h3{font-size:14px;margin:0 0 8px}
.ax-row{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;justify-content:space-between;margin:6px 0 10px;font-size:14px}
.ax-row select{font-size:14px;padding:6px 8px;max-width:100%}
.ax-seg button{min-width:44px}
.ax-tg{display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;margin:8px 0;font-size:14px;cursor:pointer}
.ax-tg input{width:18px;height:18px;flex:none}
.ax-tg.off{color:var(--sub);cursor:default}
.ax-note{flex:1 1 100%;font-size:12px;color:var(--sub);padding-left:28px}
.ax-presets{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px}
.ax-preset{display:flex;flex-direction:column;gap:3px;text-align:left;border:1px solid var(--line);background:var(--card2);padding:10px 12px;cursor:pointer;font:inherit;color:inherit}
.ax-preset b{font-size:14px}
.ax-preset span{font-size:12px;color:var(--sub)}
.ax-preset:hover{border-color:var(--ink)}
.ax-rec{display:flex;flex-wrap:wrap;gap:8px 12px;align-items:center;border:1px solid var(--patina);background:var(--patina-bg);padding:10px 12px;margin-bottom:10px;font-size:13px}
.ax-words dl{display:grid;grid-template-columns:1fr;gap:4px;margin:8px 0 0;font-size:13px}
.ax-words dl div{display:flex;gap:10px;border-bottom:1px dashed var(--line2);padding:3px 0}
.ax-words dt{min-width:9em;font-weight:700}
.ax-words dd{margin:0}
.ax-panel-foot{display:flex;justify-content:space-between;gap:8px;border-top:1px solid var(--line);padding-top:12px;margin-top:6px}
@media(max-width:560px){dialog.ax-panel{max-width:calc(100vw / var(--ax-zoom,1));max-height:calc(100dvh / var(--ax-zoom,1));height:calc(100dvh / var(--ax-zoom,1));margin:0}}

/* ---------- 읽기 자료 도구·쉬운 말·번역·용어 ---------- */
.ax-rbar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:0 0 10px}
.ax-easy{border:1px solid var(--line);border-left:3px solid var(--patina);background:var(--patina-bg);padding:10px 12px;margin:0 0 14px;font-size:14px}
.ax-easy ul{margin:6px 0 6px 18px;padding:0}
.ax-easy li{margin:3px 0;line-height:1.7}
.ax-tr{border-left:3px solid var(--amber-fill,#96712F);background:var(--card2);padding:6px 10px;margin:-6px 0 14px;font-size:.95em;color:var(--ink)}
.ax-term{all:unset;cursor:pointer;border-bottom:2px dotted var(--patina);color:inherit}
.ax-term[aria-expanded="true"]{background:var(--patina-bg)}
.ax-term:focus-visible{outline:3px solid #1f5fbf;outline-offset:1px}
.ax-def{border:1px solid var(--patina);background:#fff;padding:10px 12px;margin:-4px 0 14px;font-size:14px}
.ax-def p{margin:4px 0!important;font-size:14px}
.ax-def-h{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ax-def-h .btn{margin-left:auto}
.ax-chips{display:inline-flex;flex-wrap:wrap;gap:4px;align-items:center}
.ax-chips-l{font-size:12px;color:var(--sub);margin-right:2px}
.ax-chip{border:1px solid var(--patina);background:#fff;color:var(--patina);font:inherit;font-size:12.5px;line-height:1.4;padding:3px 9px;border-radius:12px;cursor:pointer}
.ax-chip.on{background:var(--patina);color:#fff}
.ax-def-l2{color:var(--patina);font-weight:700}
.ax-def-l2d{display:block;color:var(--sub);margin-top:4px}
.ax-def-ex{color:var(--sub)}
.ax-def-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:6px}
.ax-terms{border:1px solid var(--line);margin:0 0 14px;background:var(--card)}
.ax-terms>summary{cursor:pointer;padding:9px 12px;font-size:14px;font-weight:700}
.ax-terms dl{margin:0;padding:0 12px 10px}
.ax-term-row{border-top:1px dashed var(--line2);padding:7px 0}
.ax-term-row dt{font-weight:700;font-size:14px}
.ax-term-row dd{margin:2px 0 0;font-size:13px;line-height:1.6}
.ax-term-row .wk-link{margin-left:6px}
.ax-count{font-weight:400;color:var(--sub);font-size:12px}
.ax-memo{border:1px dashed var(--line);padding:8px 12px;margin:12px 0 0}
.ax-memo>summary{cursor:pointer;font-size:13px}
.ax-memo textarea{width:100%;box-sizing:border-box;margin-top:8px;font:inherit;font-size:14px;padding:8px;border:1px solid #9a9a9a}
::highlight(ax-speak){background-color:#ffe066;color:#000}

/* ---------- 작품 설명 ---------- */
.ax-desc{margin:6px 0 0;font-size:13px}
.ax-desc>summary{cursor:pointer;color:var(--sub);font-size:13px}
/* 강의 노트 읽기 자료(details.reading) 안에 놓이면 읽기 자료 제목 줄 모양(.reading summary의 14px 굵게·flex·「＋/－」)을
   자손 선택자로 물려받는다. 학습 지원의 접이 상자는 그 모양을 쓰지 않고 작은 ▸/▾ 표시를 단다 */
html .reading :is(.ax-desc,.ax-obs,.ax-memo)>summary{display:block;padding:0;margin:0;font-family:var(--sans);font-size:13px;line-height:1.6;font-weight:400;color:var(--sub);gap:0;list-style:none}
html .reading .ax-obs>summary{color:var(--patina);font-weight:700}
html .reading :is(.ax-desc,.ax-obs,.ax-memo)>summary::-webkit-details-marker{display:none}
html .reading :is(.ax-desc,.ax-obs,.ax-memo)>summary::before{content:"▸ " / "";font-family:var(--sans);color:inherit;font-weight:400}
html .reading :is(.ax-desc,.ax-obs,.ax-memo)[open]>summary::before{content:"▾ " / ""}
.ax-desc-in{border-left:3px solid var(--line);padding:4px 0 4px 10px;margin-top:6px}
.ax-desc-in p{margin:4px 0!important;font-size:13.5px!important;line-height:1.7}
.ax-touch{color:var(--sub)}

/* ---------- 녹음·영상의 글 기록 ---------- */
.ax-mtext{flex:1 1 100%;margin-top:8px}
.ax-mtext label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--sub)}
.ax-mtext textarea{font:inherit;font-size:14px;padding:6px 8px;border:1px solid #9a9a9a;color:var(--ink)}
.ax-mtext-r{font-size:13px;margin:6px 0 0}
.ax-mtext-r b{font-size:12px;color:var(--sub);margin-right:6px}

/* ---------- 다른 감각 관찰 ---------- */
.ax-obs{margin:8px 0;border:1px dashed var(--patina);padding:6px 10px;font-size:13px}
.ax-obs>summary{cursor:pointer;color:var(--patina);font-weight:700}
.ax-obs ul{margin:6px 0 2px 16px;padding:0}
.ax-obs li{margin:4px 0;line-height:1.6}

/* ---------- 떠 있는 도구 ---------- */
html[data-ax-float]{scroll-padding-bottom:calc(72px + var(--ax-cap-h,0px))}
.ax-float{position:fixed;right:12px;bottom:calc(12px + var(--ax-cap-h,0px));z-index:880;display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px;align-items:center;max-width:min(520px,calc(100vw - 24px))}
.ax-float .btn{background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.18)}
.ax-float .btn.seal{background:var(--seal);color:#fff}
.ax-float select{font-size:13px;padding:6px}
.ax-float-msg{flex:1 1 100%;text-align:right;font-size:13px;background:#111;color:#fff;padding:6px 10px}

/* ---------- 실시간 자막 ---------- */
html[data-ax-cap]{--ax-cap-h:96px}
html[data-ax-cap] body{padding-bottom:112px}
html[data-ax-cap="l"]{--ax-cap-h:120px}
html[data-ax-cap="l"] body{padding-bottom:136px}
html[data-ax-cap="xl"]{--ax-cap-h:150px}
html[data-ax-cap="xl"] body{padding-bottom:166px}
.ax-cap{position:fixed;left:0;right:0;bottom:0;z-index:890;background:#111;color:#fff;display:flex;gap:12px;align-items:flex-end;padding:10px 16px;box-sizing:border-box;max-height:calc(40vh / var(--ax-zoom,1));overflow:hidden;font-size:18px;line-height:1.5}
html[data-ax-cap="l"] .ax-cap{font-size:22px}
html[data-ax-cap="xl"] .ax-cap{font-size:27px}
.ax-cap-lines{flex:1;min-width:0}
.ax-cap-lines>div{margin:2px 0}
.ax-cap-tr{display:block;font-size:.8em;color:#ffe9a8}
.ax-cap-int{color:#bdbdbd}
.ax-cap-tools{display:flex;flex-direction:column;gap:6px}
.ax-cap-tools .btn{background:#111;color:#fff;border-color:#fff}
.ax-cap-small{font-size:14px!important;padding:6px 12px}
.ax-cap-wait{font-size:13px!important;color:#ddd;padding:8px 16px}
.ax-hist-list{margin:0;padding:0 0 0 20px;font-size:14px;line-height:1.7}
.ax-hist-list time{color:var(--sub);font-size:12px;margin-right:6px}

/* ---------- 입장 화면의 언어 안내 ---------- */
.ax-gate{margin:0 0 12px;font-size:13px}
.ax-gate-langs{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.ax-gate-l{font-family:'Archivo',sans-serif;font-weight:700;font-size:11px;letter-spacing:.08em;color:#666;margin-right:2px}
.ax-gate-langs button{border:1px solid #9a9a9a;background:#fff;padding:4px 9px;font-size:13px;cursor:pointer;color:#111}
.ax-gate-langs button.on{background:#111;color:#fff;border-color:#111}
.ax-gate-help{border:1px solid #111;background:#fafafa;padding:10px 12px;margin-top:8px;line-height:1.6}
.ax-gate-help ol{margin:6px 0 6px 18px;padding:0}
.ax-gate-help p{margin:0;color:#444}
`;

export function AccessStyle() { return <style>{ACCESS_CSS}</style>; }
