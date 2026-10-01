/* ============================================================
   다양한 학습자를 위한 학습 지원: 교사 화면 「학습 지원」 탭 (2026-09-28)
   ------------------------------------------------------------
   카드 1 학급 설정: 번역·말로 입력·쉬운 말·핵심 용어·다른 감각 관찰, 쪽지시험 중 도구 (config.access)
   카드 2 실시간 자막 방송: 교사 기기의 음성 인식 → misc/liveCaption → 자막을 켠 학생 화면
   카드 3 학생별 지원: 학생이 켠 지원·사용 횟수·쪽지시험 조정·내 언어 메모·녹음 글 기록, 추천 보내기
   카드 4 수업 전 점검
   카드 5 설계 근거 (src-access-design.jsx)
   · 자막 엔진은 모듈 안에 하나만 둔다. 탭을 옮겨도 방송이 이어지고, 교사 화면 위의 CaptionOnAir가
     「방송 중」을 늘 보여 주며 교사 화면을 떠나면 방송을 멈춘다(마이크가 켜져 있는 줄 모르는 일이 없게).
   · 학생별 지원 내역은 건강 정보를 짐작하게 할 수 있어 보기 전용 계정(viewer)에는 합계만 보인다.
   ============================================================ */
import React, { useEffect, useState, useSyncExternalStore } from "react";
import { fbStore, authApi } from "./src-fb.js";
import { useQuizAccAll, withAcc } from "./src-quiz-acc.jsx";
import {
  accessCfg, PRESETS, normPrefs, prefsDiff, useTotals, USE_KINDS, langOf, ACCESS_LANGS,
  capInit, capPush, capInterim, capShouldFlush, capDoc, applyPreset, DEFAULT_PREFS,
} from "./src-access-core.mjs";
import { listen, sttSupported, sttLocalStatus, sttLocalInstall, translate, translateStatus, getTranslator } from "./src-access-speech.mjs";
import { recText } from "./src-access.jsx";
import { AccessDesignCard } from "./src-access-design.jsx";

const nowIso = () => new Date().toISOString();
const CAP_KEY = "liveCaption";

/* ============================================================
   자막 엔진 (모듈 하나에 하나)
   ============================================================ */
const cap = { st: null, sent: null, h: null, state: "off", err: "", timer: null, ver: 0, subs: new Set(), fails: 0 };
const emit = () => { cap.ver++; cap.subs.forEach((f) => f()); };
const capSub = (f) => { cap.subs.add(f); return () => cap.subs.delete(f); };
const capVer = () => cap.ver;
export const useCaption = () => { useSyncExternalStore(capSub, capVer); return cap; };

async function capFlush(force) {
  if (!cap.st) return;
  const t = Date.now();
  if (!force && !capShouldFlush(cap.sent, cap.st, t)) return;
  const snap = cap.st;
  cap.sent = { ...snap, sentAt: t };
  // setT가 아니라 set: 기다리는 동안 음성 인식이 멈추면 안 된다. 실패는 세어서 알린다
  const ok = await fbStore.set(CAP_KEY, capDoc(snap, t));
  cap.fails = ok ? 0 : cap.fails + 1;
  emit();
}

function capBegin() {
  if (!cap.st || !cap.st.on) {
    const d = new Date();
    cap.st = capInit(d.toISOString().slice(0, 16));
  }
  if (!cap.timer) cap.timer = setInterval(() => capFlush(false), 400);
}

/* local: 기기 안 인식이 준비됐으면 true (소리를 밖으로 보내지 않는다) */
export function capStartMic(local) {
  if (cap.h || authApi.isViewer()) return;
  capBegin();
  cap.err = "";
  cap.local = local === true;
  cap.h = listen({
    lang: "ko-KR",
    local: cap.local,
    persist: true,
    onFinal: (t) => { cap.st = capPush(cap.st, t, Date.now()); emit(); },
    onInterim: (t) => { if (cap.st) { cap.st = capInterim(cap.st, t); emit(); } },
    onState: (s, code) => {
      cap.state = s;
      if (s === "err") { cap.err = code || "err"; cap.h = null; }
      if (s === "off") cap.h = null;
      emit();
    },
  });
  emit();
}

export function capStopMic() {
  if (cap.h) { cap.h.stop(); cap.h = null; }
  cap.state = "off";
  if (cap.st) cap.st = capInterim(cap.st, "");
  emit();
}

/* 교사가 친 글을 자막 한 줄로 보낸다(인식 오류 바로잡기, 「5분 뒤 모둠 활동」 같은 알림) */
export function capType(text) {
  if (authApi.isViewer()) return;
  capBegin();
  cap.st = capPush(cap.st, text, Date.now());
  emit();
  capFlush(true);
}

/* 방송 끝: 마이크를 끄고, 학생 화면에서 자막 줄을 걷는다(학급 서버에 수업 발화가 남지 않게 줄을 비운다) */
export async function capEnd() {
  capStopMic();
  clearInterval(cap.timer);
  cap.timer = null;
  const run = (cap.st && cap.st.run) || "";
  cap.st = null;
  cap.sent = null;
  emit();
  await fbStore.set(CAP_KEY, { on: false, run, lines: [], interim: "", at: Date.now() });
}

const capLive = () => !!(cap.st && cap.st.on);

/* 교사 화면 위에 늘 떠 있는 방송 표시. 교사 화면을 떠나면(전시장·나가기) 방송을 끝낸다 */
export function CaptionOnAir() {
  const c = useCaption();
  useEffect(() => () => { if (capLive()) capEnd(); }, []);
  useEffect(() => {
    const onHide = () => { if (capLive()) capFlush(true); };
    window.addEventListener("pagehide", onHide);
    return () => window.removeEventListener("pagehide", onHide);
  }, []);
  if (!capLive()) return null;
  const last = c.st.lines.length ? c.st.lines[c.st.lines.length - 1].t : "";
  return (
    <div className="axt-onair" role="status">
      <b>{c.h ? "● 자막 방송 중 (마이크 켜짐" + (c.local ? ", 이 기기 안에서 인식)" : ", 브라우저 서버 인식)") : "● 자막 방송 중 (글 입력만)"}</b>
      <span className="axt-onair-last">{c.st.interim || last || "말을 기다리는 중…"}</span>
      {c.fails > 2 && <span className="axt-onair-err">자막을 보내지 못하고 있습니다. 연결을 확인하세요.</span>}
      <button type="button" className="btn small ghost" onClick={() => capEnd()}>방송 끝내기</button>
    </div>
  );
}

/* ============================================================
   탭 본문
   ============================================================ */
export function AccessTeacherPanel({ ids, roster, wsMap, cfgAll, setCfgAll, setMsg, sampleMode, onSel }) {
  return (
    <div className="axt">
      <AccessCfgCard cfgAll={cfgAll} setCfgAll={setCfgAll} setMsg={setMsg} />
      <CaptionCard />
      <SupportTableCard ids={ids} roster={roster} wsMap={wsMap} cfgAll={cfgAll} setMsg={setMsg} sampleMode={sampleMode} onSel={onSel} />
      <ChecklistCard />
      <AccessDesignCard />
    </div>
  );
}

/* ---------- 카드 1: 학급 설정 ---------- */
const CFG_ROWS = [
  { k: "translate", name: "기기 안 번역", what: "도움 언어를 고른 학생에게 읽기 자료·자막의 번역을 한국어 원문 아래에 함께 보입니다. 번역은 학생 기기 안에서 하고 글을 밖으로 보내지 않습니다(크롬 138·엣지 148 이상 데스크톱, 폰·태블릿은 지원하지 않음). 지원하지 않는 기기에서는 미리 넣은 핵심 용어 번역만 보입니다." },
  { k: "easy", name: "쉬운 말 요약", what: "읽기 자료마다 핵심을 짧은 문장으로 정리한 요약을 원문 위에 보입니다(학생이 켤 때). 교사가 읽기 자료의 제목이나 내용을 크게 고치면 맞지 않는 요약은 숨겨집니다." },
  { k: "gloss", name: "핵심 용어", what: "강의 노트 머리에 이번 차시 핵심 용어(쉬운 풀이, 도움 언어 번역, 한국수어사전 검색)를 보이고, 학생이 켜면 읽기 자료마다 나오는 용어를 눌러 풀이를 봅니다. 한국수어사전에는 미술 분야 전문용어 수어가 따로 없어 가까운 일상어로 찾습니다." },
  { k: "alt", name: "다른 감각 관찰", what: "관찰 방법 다섯 가지마다 소리 대신 눈·진동으로, 보는 대신 소리·촉각으로 하는 방법을 보입니다(학생이 켤 때)." },
  { k: "dictation", name: "말로 입력", what: "학생이 글칸에 말로 입력합니다. 기기 안 인식(크롬 139 이상)이 되면 소리를 밖으로 보내지 않고, 안 되는 브라우저에서는 소리를 브라우저 회사의 서버로 보내 글자로 바꾸므로 켜기 전에 학생과 보호자에게 알립니다." },
];

function AccessCfgCard({ cfgAll, setCfgAll, setMsg }) {
  const c = accessCfg(cfgAll);
  const viewer = authApi.isViewer();
  const save = async (patch) => {
    const next = { ...c, ...patch };
    const ok = await fbStore.setT("config", { access: next, accessUpdated: nowIso() }, { merge: true });
    if (ok) { setCfgAll((prev) => ({ ...(prev || {}), access: next })); setMsg("학습 지원 설정을 저장했습니다. 접속 중인 학생 화면에 바로 반영됩니다."); }
    else setMsg("설정 저장에 실패했습니다.");
  };
  return (
    <div className="card">
      <div className="card-head"><span className="card-code">학습 지원 1</span><span className="card-title">학급 설정</span></div>
      <div className="card-body">
        <p style={{ fontSize: 13, marginBottom: 12 }}>
          글자 크기·고대비·읽어 주기·실시간 자막·작품 설명은 언제나 모든 학생이 켤 수 있습니다. 아래는 교사가 허용 여부를 정하는 지원입니다.
          학생은 상단의 「학습 지원」에서 필요한 것을 스스로 켭니다.
        </p>
        <div className="tbl-scroll"><table className="roster">
          <thead><tr><th style={{ width: 120 }}>지원</th><th>학생이 보는 것</th><th style={{ width: 110 }}>허용</th></tr></thead>
          <tbody>
            {CFG_ROWS.map((r) => (
              <tr key={r.k}>
                <td>{r.name}</td>
                <td style={{ fontSize: 12 }}>{r.what}</td>
                <td>
                  <div className="seg">
                    <button disabled={viewer} className={c[r.k] ? "on-ok" : ""} onClick={() => { if (!c[r.k]) save({ [r.k]: true }); }}>켬</button>
                    <button disabled={viewer} className={!c[r.k] ? "on-no" : ""} onClick={() => { if (c[r.k]) save({ [r.k]: false }); }}>끔</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <p className="hint" style={{ marginTop: 10 }}>
          쪽지시험 중에는 보기 설정(글자 크기·대비 등)과 자막만 적용되고 읽어 주기·번역·용어 풀이는 꺼집니다. 시간 배수·이미지 제외는 「쪽지시험」 탭에서 학생별로 정합니다.
          이 기능을 올리기 전부터 켜 둔 학생 창에는 적용되지 않으므로 처음에는 새로고침을 안내합니다.
        </p>
      </div>
    </div>
  );
}

/* ---------- 카드 2: 실시간 자막 ---------- */
function CaptionCard() {
  const c = useCaption();
  const [txt, setTxt] = useState("");
  // 기기 안 음성 인식(크롬 139+): 되면 교사 목소리를 밖으로 보내지 않는다
  const [local, setLocal] = useState("");
  const [inst, setInst] = useState(false);
  useEffect(() => { let live = true; sttLocalStatus("ko-KR").then((s) => { if (live) setLocal(s); }); return () => { live = false; }; }, []);
  const prepLocal = async () => { setInst(true); const ok = await sttLocalInstall("ko-KR"); setInst(false); setLocal(ok ? "available" : await sttLocalStatus("ko-KR")); };
  const viewer = authApi.isViewer();
  const live = capLive();
  const errText = c.err === "not-allowed" ? "마이크 권한이 거부되었습니다. 주소창 왼쪽의 사이트 설정에서 마이크를 허용하세요."
    : c.err === "audio-capture" ? "마이크를 찾지 못했습니다." : c.err ? "음성 인식을 시작하지 못했습니다(" + c.err + ")." : "";
  return (
    <div className="card">
      <div className="card-head"><span className="card-code">학습 지원 2</span><span className="card-title">실시간 자막 방송</span></div>
      <div className="card-body">
        <p style={{ fontSize: 13, marginBottom: 10 }}>
          교사 기기의 마이크로 말을 받아 적어, 「실시간 자막 받기」를 켠 학생 화면 아래 표시줄에 보냅니다. 청각장애 학생뿐 아니라 한국어를 배우는 학생도
          자막과 번역을 함께 봅니다. 교사가 글을 쳐서 보내면 인식 오류를 바로잡거나 활동 안내를 글로 알릴 수 있습니다.
        </p>
        {!sttSupported() && <p className="warn-note">이 브라우저는 음성 인식을 지원하지 않습니다. 크롬이나 엣지에서 여세요. 글로 보내기는 쓸 수 있습니다.</p>}
        <div className="axt-cap-ctl">
          {c.h ? (
            <button type="button" className="btn small" onClick={capStopMic}>마이크 끄기</button>
          ) : (
            <button type="button" className="btn small seal" disabled={viewer || !sttSupported()} onClick={() => capStartMic(local === "available")}>마이크로 자막 시작</button>
          )}
          {live && <button type="button" className="btn small ghost" onClick={() => capEnd()}>방송 끝내기(자막 지우기)</button>}
        </div>
        {sttSupported() && (
          <p className="hint" style={{ marginTop: 8 }}>
            {local === "available" ? "이 기기 안에서 음성을 인식합니다. 소리가 밖으로 나가지 않습니다."
              : local === "downloadable" || local === "downloading" ? "기기 안 인식 모델을 받으면 소리를 밖으로 보내지 않고 인식합니다."
              : "이 브라우저는 소리를 브라우저 회사의 서버로 보내 인식합니다."}
            {(local === "downloadable" || local === "downloading") && !c.h && (
              <button type="button" className="btn small ghost" style={{ marginLeft: 8 }} disabled={inst || viewer} onClick={prepLocal}>{inst ? "받는 중…" : "기기 안 인식 준비하기"}</button>
            )}
          </p>
        )}
        {errText && <p className="warn-note" role="alert" style={{ marginTop: 8 }}>{errText}</p>}
        <form className="axt-cap-type" onSubmit={(e) => { e.preventDefault(); const t = txt.trim(); if (!t) return; capType(t); setTxt(""); }}>
          <input value={txt} onChange={(e) => setTxt(e.target.value)} maxLength={300} placeholder="글로 보내기: 예) 10분 동안 모둠 토의를 합니다" aria-label="자막으로 보낼 글" disabled={viewer} />
          <button type="submit" className="btn small" disabled={viewer || !txt.trim()}>보내기</button>
        </form>
        {live && (
          <ol className="axt-cap-lines" aria-label="보낸 자막">
            {c.st.lines.slice(-8).map((l) => <li key={l.i}>{l.t}</li>)}
            {c.st.interim && <li className="axt-int">{c.st.interim}</li>}
          </ol>
        )}
        <details className="axt-more">
          <summary>쓰기 전에 알아 둘 것</summary>
          <ul>
            <li>기기 안 인식을 쓸 수 없으면 크롬·엣지의 음성 인식은 소리를 브라우저 회사의 서버로 보내 글자로 바꿉니다. 교실의 학생 목소리도 함께 들어갈 수 있으므로 수업 첫 시간에 알리고, 학생 발표 때는 마이크를 끕니다.</li>
            <li>자동 인식은 고유명사·미술 용어(작가 이름, 파라픽션 등)를 자주 틀립니다. 중요한 말은 「글로 보내기」로 바로잡습니다. 자동 자막은 수어통역이나 속기(문자통역)를 대신하지 못합니다. 청각장애 학생이 있다면 특수교육지원센터를 통해 통역·속기 지원을 함께 요청합니다.</li>
            <li>학생 화면에는 최근 두 줄이 보이고, 「자막 기록」에서 켠 뒤로 받은 자막 전체를 다시 읽습니다. 방송을 끝내면 서버의 자막 줄은 지워집니다(학생 기기의 기록은 창을 닫을 때 사라집니다).</li>
            <li>교사 화면에서 다른 탭으로 옮겨도 방송은 이어지고, 화면 위에 「자막 방송 중」이 떠 있습니다. 전시장으로 가거나 나가면 방송이 끝납니다.</li>
          </ul>
        </details>
      </div>
    </div>
  );
}

/* ---------- 카드 3: 학생별 지원 ---------- */
const ON_NAMES = {
  text: "글자", spacing: "간격", contrast: "대비", motion: "움직임", targets: "버튼 크게", underline: "밑줄", tts: "읽어 주기", rate: "빠르기",
  voice: "목소리", lang: "도움 언어", bilingual: "번역", gloss: "용어", easy: "쉬운 말", desc: "작품 설명", cap: "자막", capSize: "자막 크기", dict: "말로 입력", alt: "다른 감각",
};
const USE_SHORT = { tts: "읽기", trans: "번역", gloss: "용어", easy: "쉬운 말", desc: "설명", descTts: "설명 듣기", cap: "자막(분)", dict: "말로", alt: "감각", memo: "메모" };

/* 표본 학급(학생이 아직 없을 때)의 지원 기록: 학번 순서로 정해지는 가짜 값 */
function sampleSupport(ids) {
  const sets = [
    { _sup: { text: 150, contrast: "high", spacing: true }, _supUse: { "1차시": { desc: 4 }, "2차시": { desc: 6 } } },
    { _sup: { lang: "vi", bilingual: true, gloss: true, easy: true }, _supUse: { "1차시": { trans: 7, gloss: 5, easy: 6 }, "2차시": { trans: 9, memo: 1 } }, _supMemo: { 1: "Đồ làm sẵn là đồ vật có sẵn được chọn làm tác phẩm." } },
    { _sup: { cap: true, easy: true, alt: true }, _supUse: { "1차시": { cap: 48, easy: 4 }, "2차시": { cap: 52, alt: 2 } } },
    { _sup: { tts: true, desc: true, dict: true }, _supUse: { "1차시": { tts: 12, descTts: 5, dict: 3 } } },
  ];
  const out = {};
  ids.forEach((id, i) => { if (i < sets.length) out[id] = sets[i]; });
  return out;
}

function SupportTableCard({ ids, roster, wsMap, cfgAll, setMsg, sampleMode, onSel }) {
  const viewer = authApi.isViewer();
  const [open, setOpen] = useState(null);
  const [recFor, setRecFor] = useState(null);
  const sample = sampleMode ? sampleSupport(ids || []) : null;
  const wsOf = (id) => (sample ? { ...(wsMap[id] || {}), ...(sample[id] || {}) } : wsMap[id] || {});
  /* 쪽지시험 학생별 조정은 quizAcc/{학번}에 있다(학급 설정의 옛 맵 위에 덮어 읽는다, src-quiz-acc.mjs) */
  const accAll = useQuizAccAll(!sampleMode && !viewer);
  const q = withAcc((cfgAll && cfgAll.quiz) || {}, accAll.map);
  const tm = q.timeMult || {};
  const noImg = q.noImage || {};
  const rows = (ids || []).map((id) => {
    const w = wsOf(id);
    const diff = prefsDiff(w._sup);
    const tot = useTotals(w._supUse);
    const memoN = Object.values(w._supMemo || {}).filter((x) => x && String(x).trim()).length;
    const txN = Object.values(w._tx || {}).filter((x) => x && String(x).trim()).length;
    const rec = w._supRec || null;
    const quizAdj = [tm[id] && tm[id] !== 1 ? "시간 ×" + tm[id] : "", noImg[id] ? "이미지 제외" : ""].filter(Boolean).join(", ");
    return { id, w, diff, tot, memoN, txN, rec, quizAdj, any: Object.keys(diff).length > 0 || Object.values(tot).some((x) => x > 0) || !!quizAdj };
  });
  const using = rows.filter((r) => r.any);
  const totals = {};
  rows.forEach((r) => { for (const k in r.tot) totals[k] = (totals[k] || 0) + r.tot[k]; });
  const langs = {};
  rows.forEach((r) => { const l = r.diff.lang; if (l) langs[l] = (langs[l] || 0) + 1; });

  return (
    <div className="card">
      <div className="card-head"><span className="card-code">학습 지원 3</span><span className="card-title">학생별 지원</span>{sampleMode && <span className="card-sess">표본</span>}</div>
      <div className="card-body">
        <p style={{ fontSize: 13, marginBottom: 10 }}>
          학생이 켠 지원과 사용 횟수입니다. 진단명이나 장애 여부는 묻지도 저장하지도 않습니다. 추천을 보내면 학생 화면의 「학습 지원」에 표시가 뜨고, 적용은 학생이 정합니다.
        </p>
        <div className="axt-sum">
          <span>지원을 쓰는 학생 <b>{using.length}</b> / {rows.length}명</span>
          {Object.keys(langs).length > 0 && <span>도움 언어 {Object.keys(langs).map((l) => (langOf(l) ? langOf(l).ko : l) + " " + langs[l]).join(", ")}</span>}
          {USE_KINDS.filter((u) => totals[u.k]).map((u) => <span key={u.k}>{u.label} {Math.round(totals[u.k])}</span>)}
        </div>
        {viewer ? (
          <p className="hint">보기 전용 계정에는 학생별 지원 내역을 보이지 않습니다(건강 정보를 짐작하게 할 수 있음).</p>
        ) : !using.length ? (
          <p className="hint">아직 지원을 켠 학생이 없습니다.</p>
        ) : (
          <div className="tbl-scroll"><table className="roster axt-tbl">
            <thead><tr><th>학생</th><th>켠 지원</th><th>사용 횟수</th><th>쪽지시험 조정</th><th>기록</th><th></th></tr></thead>
            <tbody>
              {using.map((r) => (
                <React.Fragment key={r.id}>
                  <tr>
                    <td><button type="button" className="linkish" onClick={() => onSel && onSel(r.id)}>{r.id}</button> {roster[r.id] && roster[r.id].nick}</td>
                    <td className="axt-chips">
                      {Object.keys(r.diff).filter((k) => k !== "rate" && k !== "voice" && k !== "capSize").map((k) => (
                        <span key={k} className="axt-chip">{ON_NAMES[k]}{k === "text" ? " " + r.diff.text + "%" : k === "lang" ? " " + (langOf(r.diff.lang) || {}).native : k === "contrast" ? " " + (r.diff.contrast === "dark" ? "어둡게" : "높게") : ""}</span>
                      ))}
                    </td>
                    <td style={{ fontSize: 12 }}>{Object.keys(r.tot).filter((k) => r.tot[k]).map((k) => USE_SHORT[k] + " " + Math.round(r.tot[k])).join(" · ") || "없음"}</td>
                    <td style={{ fontSize: 12 }}>{r.quizAdj || ""}</td>
                    <td style={{ fontSize: 12 }}>
                      {r.memoN > 0 && <button type="button" className="btn small ghost" onClick={() => setOpen(open === r.id ? null : r.id)}>메모 {r.memoN}</button>}
                      {r.txN > 0 && <span> 녹음 글 {r.txN}</span>}
                    </td>
                    <td>
                      {r.rec && !r.rec.done && <span className="hint">추천 보냄 </span>}
                      <button type="button" className="btn small ghost" disabled={sampleMode} onClick={() => setRecFor(recFor === r.id ? null : r.id)}>추천</button>
                    </td>
                  </tr>
                  {open === r.id && <tr><td colSpan={6}><MemoView w={r.w} /></td></tr>}
                  {recFor === r.id && <tr><td colSpan={6}><RecForm sid={r.id} w={r.w} setMsg={setMsg} onDone={() => setRecFor(null)} /></td></tr>}
                </React.Fragment>
              ))}
            </tbody>
          </table></div>
        )}
        {!viewer && !sampleMode && (
          <details className="axt-more">
            <summary>지원을 켜지 않은 학생에게 추천 보내기</summary>
            <div className="axt-rec-pick">
              {rows.filter((r) => !r.any).map((r) => (
                <button type="button" key={r.id} className="btn small ghost" onClick={() => setRecFor(r.id)}>{r.id} {roster[r.id] && roster[r.id].nick}</button>
              ))}
            </div>
            {recFor && !using.some((r) => r.id === recFor) && <RecForm sid={recFor} w={wsOf(recFor)} setMsg={setMsg} onDone={() => setRecFor(null)} />}
          </details>
        )}
      </div>
    </div>
  );
}

function RecForm({ sid, w, setMsg, onDone }) {
  const [preset, setPreset] = useState("");
  const [lang, setLang] = useState("");
  const base = normPrefs(DEFAULT_PREFS);
  const set = { ...(preset ? prefsDiff(applyPreset(base, preset)) : {}), ...(lang ? { lang, bilingual: true } : {}) };
  const send = async () => {
    if (!Object.keys(set).length) return;
    const ok = await fbStore.updateFields("ws:" + sid, { _supRec: { set, at: nowIso(), done: null } });
    setMsg(ok === true ? sid + " 학생에게 추천을 보냈습니다: " + recText(set) : ok === "missing" ? "이 학생은 아직 기록지가 없습니다. 첫 입장 뒤에 보냅니다." : "추천을 보내지 못했습니다.");
    if (ok === true) onDone();
  };
  return (
    <div className="axt-rec">
      <b>{sid}에게 추천</b>
      <select value={preset} onChange={(e) => setPreset(e.target.value)} aria-label="추천 묶음">
        <option value="">묶음 고르기</option>
        {PRESETS.map((p) => <option key={p.k} value={p.k}>{p.label}: {p.sub}</option>)}
      </select>
      <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label="도움 언어">
        <option value="">도움 언어 없음</option>
        {ACCESS_LANGS.map((l) => <option key={l.code} value={l.code}>{l.native} ({l.ko}{l.dict ? "" : ", 용어 사전 없음"})</option>)}
      </select>
      <span className="hint">{recText(set)}</span>
      <button type="button" className="btn small" disabled={!Object.keys(set).length} onClick={send}>보내기</button>
      <button type="button" className="btn small ghost" onClick={onDone}>취소</button>
    </div>
  );
}

/* 내 언어 메모 보기: 교사 기기 안에서 한국어로 번역해 본다 */
function MemoView({ w }) {
  const memo = w._supMemo || {};
  const src = (normPrefs(w._sup).lang) || "";
  const [tr, setTr] = useState({});
  const [note, setNote] = useState("");
  const run = async () => {
    if (!src) { setNote("학생의 도움 언어가 정해져 있지 않아 번역할 언어를 알 수 없습니다."); return; }
    const st = await translateStatus("ko", src);
    if (st === "no-api") { setNote("이 브라우저는 기기 안 번역을 지원하지 않습니다(크롬 138 이상 데스크톱)."); return; }
    const t = await getTranslator("ko", null, src);
    if (!t) { setNote("이 언어는 이 기기에서 번역할 수 없습니다."); return; }
    setNote("");
    for (const n of Object.keys(memo)) translate("ko", memo[n], src).then((out) => setTr((m) => ({ ...m, [n]: out || "" })));
  };
  return (
    <div className="axt-memo">
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <b>내 언어 메모</b>
        <button type="button" className="btn small ghost" onClick={run}>한국어로 번역해 보기(이 기기 안에서)</button>
        {note && <span className="hint">{note}</span>}
      </div>
      {Object.keys(memo).sort((a, b) => a - b).map((n) => memo[n] && (
        <div key={n} className="axt-memo-row">
          <span className="axt-chip">{n}차시</span>
          <p lang={src ? (langOf(src) || {}).bcp : undefined}>{memo[n]}</p>
          {tr[n] && <p className="axt-memo-tr">{tr[n]}</p>}
        </div>
      ))}
      <p className="hint">기계 번역은 뜻을 짐작하는 데만 씁니다. 평가에 쓸 때는 이중언어강사나 학생에게 확인합니다.</p>
    </div>
  );
}

/* ---------- 카드 4: 수업 전 점검 ---------- */
const CHECK = [
  { h: "소리를 듣기 어려운 학생", xs: [
    "수업 전에 그 차시 강의 노트를 열어 두어 미리 읽게 합니다(말보다 글이 먼저 도착하도록).",
    "교사의 얼굴과 입이 보이는 쪽에 앉게 하고, 판서·화면과 교사가 같은 방향에 오게 합니다. 화면을 볼 때와 말할 때를 나눕니다.",
    "자막 방송을 켜고, 작가 이름·용어는 「글로 보내기」로 바로잡습니다. 모둠 토의 때는 발언을 글로 남기는 방식을 함께 씁니다.",
    "소리 산책을 고른 학생에게는 「다른 감각으로 하기」(진동·빛·사람의 반응 관찰)를 안내합니다. 소리를 시각으로 다룬 작가(예: 크리스틴 선 킴)의 작업은 대안이 아니라 하나의 관점입니다.",
    "수어를 쓰는 학생이면 특수교육지원센터에 수어통역·문자통역 지원을 요청합니다. 자동 자막은 통역을 대신하지 못합니다.",
  ] },
  { h: "보기 어려운 학생", xs: [
    "강의 노트의 모든 도판에 「작품 설명」이 붙어 있습니다. 스크린리더를 쓰는 학생에게는 설명이 늘 펼쳐지도록 「작품 설명 늘 펼치기」를 추천합니다.",
    "주요 작품은 촉각 자료(입체 복사, 3D 출력, 실물 재료 견본)를 준비하면 설명과 함께 쓸 수 있습니다.",
    "상호평가(쌍대비교)는 작품 캡션과 작품 설명을 근거로 판정하게 하거나, 판정 대신 캡션 비평을 맡기는 방식을 미리 정합니다(설계서 §6).",
    "스케치 칸은 말이나 글로 된 에스키스(구성 설명)로 대신할 수 있게 합니다.",
  ] },
  { h: "한국어를 배우는 학생", xs: [
    "도움 언어를 확인해 추천을 보내고, 「이번 차시 핵심 용어」를 수업 전에 먼저 보게 합니다.",
    "생각은 먼저 모국어로 적어도 된다고 알립니다(내 언어 메모). 학습지 답은 한국어로 옮기되, 짧은 문장도 인정합니다.",
    "학교의 이중언어강사가 있으면 핵심 용어 번역을 검토받습니다. 번역은 초안입니다.",
    "쪽지시험에서 번역·용어 풀이를 허용할지는 문항이 묻는 것(개념 이해인지 용어 자체인지)에 따라 정합니다.",
  ] },
  { h: "모든 학생", xs: [
    "수업 첫 시간에 「학습 지원」을 함께 열어 보고, 누구나 쓰는 도구라고 소개합니다(특정 학생을 지목하지 않습니다).",
    "지원 사용 기록을 연구에 쓰려면 동의 항목 「학습 지원 사용」에 따로 동의를 받습니다.",
  ] },
];

function ChecklistCard() {
  return (
    <div className="card">
      <div className="card-head"><span className="card-code">학습 지원 4</span><span className="card-title">수업 전 점검</span></div>
      <div className="card-body axt-check">
        {CHECK.map((g) => (
          <details key={g.h} className="reading">
            <summary>{g.h}</summary>
            <div className="reading-in"><ul>{g.xs.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
          </details>
        ))}
      </div>
    </div>
  );
}

export const ACCESS_TEACHER_CSS = `
.axt-onair{position:sticky;top:0;z-index:50;display:flex;flex-wrap:wrap;gap:8px 14px;align-items:center;background:#111;color:#fff;padding:8px 14px;margin:0 0 12px;font-size:13px}
.axt-onair b{color:#ff8a7a;white-space:nowrap}
.axt-onair-last{flex:1;min-width:160px;color:#ddd;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.axt-onair-err{flex:1 1 100%;color:#ffd27a}
.axt-onair .btn{background:#111;color:#fff;border-color:#fff}
.axt-cap-ctl{display:flex;gap:8px;flex-wrap:wrap}
.axt-cap-type{display:flex;gap:8px;margin-top:10px}
.axt-cap-type input{flex:1;min-width:0;font-size:14px;padding:6px 8px;border:1px solid #9a9a9a}
.axt-cap-lines{margin:10px 0 0;padding:8px 8px 8px 28px;background:#111;color:#fff;font-size:14px;line-height:1.6;max-height:220px;overflow:auto}
.axt-int{color:#aaa}
.axt-more{margin-top:10px;font-size:12.5px}
.axt-more>summary{cursor:pointer;color:var(--sub)}
.axt-more ul{margin:6px 0 0 18px;padding:0;line-height:1.7}
.axt-sum{display:flex;flex-wrap:wrap;gap:6px 14px;font-size:13px;margin:0 0 10px;padding:8px 10px;background:var(--card2)}
.axt-tbl td{vertical-align:top}
.axt-chips{max-width:280px}
.axt-chip{display:inline-block;border:1px solid var(--line);padding:1px 6px;margin:0 4px 4px 0;font-size:11.5px;background:#fff}
.axt-rec{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:6px 0}
.axt-rec select{font-size:13px;padding:4px 6px;max-width:100%}
.axt-rec-pick{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0}
.axt-memo{padding:6px 0}
.axt-memo-row{border-top:1px dashed var(--line2);padding:6px 0}
.axt-memo-row p{margin:4px 0;font-size:13px}
.axt-memo-tr{color:var(--patina)}
.axt-check ul{margin:0 0 0 18px;padding:0;line-height:1.8;font-size:13.5px}
.linkish{all:unset;cursor:pointer;text-decoration:underline;color:inherit}
.linkish:focus-visible{outline:3px solid #1f5fbf}
`;

export function AccessTeacherStyle() { return <style>{ACCESS_TEACHER_CSS}</style>; }
