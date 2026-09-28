/* ============================================================
   쌍대비교 체험실 — 8차시 상호평가를 예시 학급 12점으로 미리 해 보는 교사용 페이지

   · 「직접 해 보기」의 학생 화면은 앱의 src-assess.jsx(AssessTab)를 그대로 돌린다. 저장소만 mock-fb.js로 바꿔 끼워
     모든 기록이 이 페이지의 메모리에만 남는다. 선생님 단계 스위치·명단 확정·집계는 교사 화면과 같은 core 함수를 부른다.
   · 반 친구 11명의 판정은 sim.js가 예시 작품의 숨은 품질로 만든다.
   · 빌드: node pairwise-research/lab/build.mjs → pairwise-research/lab/dist/쌍대비교_체험실.html
   ============================================================ */
import React, { useState, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { createRoot } from "react-dom/client";
import { AssessTab } from "../../src-assess.jsx";
import {
  makePlan, aggregate, validatePlan, collectJudgements, PEER_QUESTION, DEFAULT_PEER, QUALITY_MIN, INFIT_BAND,
  TAG_OPTIONS, ROSTER_VER, fmtNum, wilson,
} from "../../src-assess-core.mjs";
import { labStore } from "./mock-fb.js";
import { WORKS, SIDS, workOfSid, sidOfNo, workByNo } from "./works.js";
import { drawRelic } from "./relics-draw.js";
import { simulateJudges, expectedRepeatAgreement, qOf, sigmoid } from "./sim.js";
import STUDENT_CSS from "virtual:student-css";
import SIM from "../assess-sim-results.json";

/* ---------- 저장소 구독 ---------- */
let storeVer = 0;
labStore.subscribe(() => { storeVer += 1; });
const useStoreVer = () => useSyncExternalStore((cb) => labStore.subscribe(cb), () => storeVer);

const DEFAULT_ME = sidOfNo("A-03");
const PEER0 = { ...DEFAULT_PEER, stage: "submit", k: 11, repeat: 1, askConf: false, reveal: "band", question: PEER_QUESTION };
const K_OPTIONS = [[6, "6쌍 (빠르게)"], [8, "8쌍"], [11, "11쌍 (실제에 가깝게)"]];
const TAG_LABEL = Object.fromEntries(TAG_OPTIONS.map((t) => [t.k, t.label]));
const short = (no) => String(no || "").replace(/^A-/, "");
const pct = (x) => (x == null || !Number.isFinite(x) ? "-" : Math.round(x * 100) + "%");
const T_SEED = "2026-11-02T01:00:00.000Z";

let IMG = {};   // 작품 번호 → dataURL (boot에서 채운다)

function seedClass(meSid) {
  labStore.reset();
  SIDS.forEach((sid) => {
    const w = workOfSid(sid);
    if (sid === meSid) { labStore.write("media:" + sid + "_s7x.img.1", IMG[w.no]); return; }
    labStore.write("media:" + sid + "_asm.seed", IMG[w.no]);
    labStore.write("sub:" + sid, {
      ver: "v1", no: w.no, title: w.title,
      plate: { relic: w.relic, year: w.year, era: w.era, mat: w.mat, size: w.size, context: w.context, coll: w.coll, notice: w.notice },
      aiLevel: "", note: w.note, img: { owner: sid, ref: "asm.seed" }, imgW: 1024, imgH: 559, submittedAt: T_SEED, locked: true,
    });
  });
}
function wsOf(meSid) {
  const w = workOfSid(meSid);
  return {
    "s7x.no": w.no, "s6b.title": w.title, "s6b.relic": w.relic, "s6b.year": w.year, "s6b.era": w.era, "s6b.mat": w.mat,
    "s6b.size": w.size, "s6b.context": w.context, "s6b.coll": w.coll, "s6b.notice": w.notice, "s6b.aiLevel": "", "s7.note": w.note,
    "s7x.img": { ref: "s7x.img.1" },
  };
}
function rosterFrom({ k, seed, allSubmitted }) {
  const subs = labStore.collection("submissions");
  const works = (allSubmitted ? SIDS.map((sid) => ({ no: workOfSid(sid).no, sid }))
    : Object.keys(subs).filter((sid) => subs[sid] && subs[sid].locked && subs[sid].img).map((sid) => ({ no: subs[sid].no, sid })))
    .sort((a, b) => (a.no < b.no ? -1 : 1));
  const made = makePlan({ works, judges: SIDS.slice(), k, repeat: 1, seed });
  return { made, doc: { ver: ROSTER_VER, fixedAt: seed, seed, k: made.kEff, repeat: 1, works, judges: SIDS.slice(), plan: made.plan, hash: made.hash, stats: made.stats } };
}

/* ---------- 학생 화면: 그림자 DOM 안에서 앱 CSS 그대로 ---------- */
function StudentHost({ sid, ws, cfgAll, epoch }) {
  const hostRef = useRef(null);
  const rootRef = useRef(null);
  useEffect(() => {
    const host = hostRef.current;
    const shadow = host.shadowRoot || host.attachShadow({ mode: "open" });
    shadow.innerHTML = "";
    const style = document.createElement("style");
    style.textContent = STUDENT_CSS;
    const mount = document.createElement("div");
    shadow.appendChild(style); shadow.appendChild(mount);
    rootRef.current = createRoot(mount);
    return () => { const r = rootRef.current; rootRef.current = null; setTimeout(() => r && r.unmount(), 0); };
  }, []);
  useEffect(() => {
    if (!rootRef.current) return;
    rootRef.current.render(
      <div className="app"><div className="wrap lab-wrap"><AssessTab key={sid + "-" + epoch} me={{ sid }} ws={ws} cfgAll={cfgAll} /></div></div>,
    );
  });
  return <div ref={hostRef} className="student-host" />;
}

/* ---------- 작은 조각 ---------- */
const Status = ({ kind, children }) => (
  <span className={"status " + kind}><span aria-hidden="true" className="status-i">{kind === "ok" ? "✓" : kind === "warn" ? "!" : "✕"}</span>{children}</span>
);
const ssrKind = (s) => (s == null ? "hold" : s >= QUALITY_MIN.ssrAdopt ? "ok" : s >= QUALITY_MIN.ssr ? "warn" : "hold");
const ssrWord = (s) => (s == null ? "계산 안 됨" : s >= QUALITY_MIN.ssrAdopt ? "채택" : s >= QUALITY_MIN.ssr ? "주의 공개" : "보류 권고");
const Thumb = ({ no, size = 44 }) => <img className="thumb" src={IMG[no]} alt="" width={size} height={Math.round(size * 559 / 1024)} />;
const Key = ({ children }) => <code className="key">{children}</code>;

function JsonBox({ value }) {
  const text = useMemo(() => JSON.stringify(value, (k, v) => {
    if (typeof v === "string" && v.startsWith("data:image")) return "(이미지 " + Math.round(v.length / 1024) + "KB)";
    if (k === "plan" && v && typeof v === "object") return "(학생 12명의 배정표: 「배정표」 탭에서 보기)";
    return v;
  }, 1), [value]);
  return <pre className="json">{value == null ? "(아직 없음)" : text}</pre>;
}

/* ============================================================
   탭 1 · 직접 해 보기
   ============================================================ */
const STEPS = [
  { k: "submit", label: "제출" }, { k: "self1", label: "자기평가 ①" }, { k: "peer", label: "동료 비교" },
  { k: "self2", label: "자기평가 ②" }, { k: "agg", label: "집계" }, { k: "result", label: "결과 공개" },
];

function TryTab({ meSid, setMe, peer, setPeer, epoch, reset, agg, setAgg, simSeed, goTab }) {
  useStoreVer();
  const roster = labStore.read("peerRoster");
  const mySub = labStore.read("sub:" + meSid);
  const myAssess = labStore.read("assess:" + meSid);
  const ws = useMemo(() => wsOf(meSid), [meSid]);
  const cfgAll = useMemo(() => ({ peer }), [peer]);
  const [note, setNote] = useState("");
  const my = workOfSid(meSid);
  const subDone = !!(mySub && mySub.locked);
  const s1Done = !!(myAssess && myAssess.self && myAssess.self.s1 && myAssess.self.s1.submittedAt);
  const block = myAssess && myAssess.judge && myAssess.judge.p1;
  const myItems = (block && block.items) || [];
  const myTotal = roster && roster.plan && roster.plan[meSid] ? roster.plan[meSid].length : 0;
  const s2Locked = !!(myAssess && myAssess.self && myAssess.self.s2 && myAssess.self.s2.lockedAt);
  const stage = peer.stage;
  const cur = agg && stage === "self2" ? "agg" : stage;
  const idx = STEPS.findIndex((s) => s.k === cur);

  const fix = () => {
    if (!subDone) { setNote("학생 화면에서 먼저 「제출 확정」을 눌러 주세요. 확정한 작품만 명단에 들어갑니다."); return; }
    const { made, doc } = rosterFrom({ k: peer.k, seed: new Date().toISOString() });
    if (made.errors.length) { setNote(made.errors.join(" ")); return; }
    labStore.write("peerRoster", doc);
    setNote("");
  };
  const open = (s) => { setPeer({ ...peer, stage: s }); setNote(""); };
  const runAgg = () => {
    if (!roster) return;
    const others = simulateJudges({ roster, sids: SIDS.filter((s) => s !== meSid), seed: simSeed });
    Object.keys(others).forEach((sid) => labStore.write("assess:" + sid, others[sid]));
    const assessMap = labStore.collection("assess");
    const res = aggregate({ roster, assessMap, subMap: labStore.collection("submissions"), cfg: peer, splitReps: 25 });
    Object.keys(res.results).forEach((sid) => labStore.write("assess:" + sid, { result: res.results[sid] }, true));
    setAgg({ res, assessMap: labStore.collection("assess"), roster, mult: 1, source: "try" });
  };

  const pairs = roster && roster.plan && roster.plan[meSid] ? roster.plan[meSid] : [];
  const q = agg && agg.res && agg.res.quality;

  return (
    <div className="try">
      <section className="student-col" aria-label="학생 화면">
        <div className="frame-head">
          <span className="eyebrow">학생 화면 · 「최종 평가」 탭</span>
          <span className="frame-who">가상 학번 {meSid} · 내 작품 {my.no} 「{my.title}」</span>
        </div>
        <StudentHost sid={meSid} ws={ws} cfgAll={cfgAll} epoch={epoch} />
      </section>

      <aside className="teacher-col" aria-label="선생님 화면과 설계 해설">
        <div className="panel">
          <div className="panel-h">
            <span className="eyebrow">선생님 화면 · 단계 스위치</span>
            <button type="button" className="btn-s ghost" onClick={() => reset(meSid)}>처음부터 다시</button>
          </div>
          <ol className="steps" aria-label="진행 단계">
            {STEPS.map((s, i) => <li key={s.k} className={i < idx ? "done" : i === idx ? "now" : ""}>{s.label}</li>)}
          </ol>

          {stage === "submit" && !roster && (
            <div className="stage-box">
              <h3>1. 제출과 명단 확정</h3>
              <p>왼쪽 학생 화면에서 「제출 확정」을 눌러 보세요. 반 친구 11명은 이미 제출했다고 가정합니다.</p>
              <p className="why"><b>왜 사본으로 고정하나.</b> 비교가 도는 동안 작가가 원본을 고치면 먼저 판정한 학생과 나중에 판정한 학생이 서로 다른 작품을 본 셈이 됩니다. 그래서 확정하는 순간 이미지(긴 변 1000px)와 작품 캡션을 <Key>submissions/학번</Key>에 사본으로 둡니다.</p>
              <div className="field-row">
                <label htmlFor="k-sel">1인당 비교 쌍 수</label>
                <select id="k-sel" value={peer.k} onChange={(e) => setPeer({ ...peer, k: Number(e.target.value) })}>
                  {K_OPTIONS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                </select>
              </div>
              <p className="hint">실제 학급(27~30명)은 12쌍이라 작품마다 24번 비교됩니다. 예시 학급은 12점이라 최대 11쌍입니다.</p>
              <div className="field-row">
                <span className="lbl">확신도 묻기</span>
                <span className="seg">
                  <button type="button" aria-pressed={!peer.askConf} onClick={() => setPeer({ ...peer, askConf: false })}>묻지 않기(설계 기본값)</button>
                  <button type="button" aria-pressed={peer.askConf} onClick={() => setPeer({ ...peer, askConf: true })}>묻기</button>
                </span>
              </div>
              <button type="button" className="btn-p" onClick={fix} disabled={!subDone}>제출 마감하고 비교 명단 확정</button>
              {!subDone && <p className="hint">학생 화면에서 제출을 확정하면 버튼이 활성화됩니다.</p>}
            </div>
          )}

          {stage === "submit" && roster && (
            <div className="stage-box">
              <h3>명단이 확정되었습니다</h3>
              <p>작품 {roster.works.length}점 · 판정자 {roster.judges.length}명 · 1인당 {roster.k}쌍과 숨은 반복 1쌍 · 작품마다 정확히 {2 * roster.k}번 비교됩니다.</p>
              <p className="why"><b>왜 문서 하나로 고정하나.</b> 배정을 학생 기기에서 그때그때 만들면 학생마다 다른 쌍을 보게 되어 노출 균형이 깨집니다. 명단·seed·k·배정표가 <Key>meta/peerRoster</Key> 한 문서에 고정되고, 집계는 학생 기록을 이 배정표와 대조해 맞지 않는 판정을 버립니다.</p>
              <button type="button" className="btn-s" onClick={() => goTab("roster")}>배정표 보기</button>
              <button type="button" className="btn-p" onClick={() => open("self1")}>자기평가 ① 열기</button>
            </div>
          )}

          {stage === "self1" && (
            <div className="stage-box">
              <h3>2. 자기평가 ①</h3>
              <p>다섯 문항(종합 설득력과 네 축)에 1~5점, 근거 한 문장, 「우리 반에서 몇 번째쯤일까」 등수 예측을 합니다.</p>
              <p className="why"><b>왜 비교 전에 하나.</b> 동료 작품을 보기 전의 기준을 기록해 두어야 비교 뒤에 달라진 정도를 잴 수 있습니다. 등수 예측은 백분위로 바꿔 저장합니다: (n − 예측 등수) ÷ (n − 1).</p>
              {!s1Done && <p className="hint">학생 화면에서 자기평가 ①을 제출한 뒤 다음 단계를 여는 것이 자연스럽습니다.</p>}
              <button type="button" className="btn-p" onClick={() => open("peer")}>동료 비교 열기</button>
            </div>
          )}

          {stage === "peer" && (
            <div className="stage-box">
              <h3>3. 동료 비교</h3>
              <p>내 판정 <b className="num">{myItems.length} / {myTotal}</b>. 한 쌍마다 더 성립한 쪽을 고르고, 이유 한 문장(10자 이상)과 결정적이었던 축 하나를 고릅니다.</p>
              <ul className="why-list">
                <li>작품 번호만 보이고, 작품 캡션은 접힌 채 시작합니다. 펼쳤는지는 기록됩니다.</li>
                <li>두 이미지가 모두 화면에 60% 이상 보여야 고를 수 있고, 5초 안에 고르면 한 번 더 보라는 안내가 뜹니다(실제 경과 시간은 그대로 기록).</li>
                <li>AI 활용 범위는 숨기고 학급 공통 안내 한 줄만 보입니다. 작품마다 다른 고지가 보이면 그 차이가 점수에 그대로 실리기 때문입니다.</li>
                <li>마지막 화면은 앞에서 본 쌍을 좌우만 바꿔 다시 보여 주는 반복 쌍입니다. 학생에게는 알리지 않고, 점수 계산에서는 뺍니다.</li>
              </ul>
              <details className="mini">
                <summary>내게 배정된 쌍 {pairs.length}개</summary>
                <ol className="pairs">
                  {pairs.map((it) => {
                    const L = it.left === "a" ? it.a : it.b, R = it.left === "a" ? it.b : it.a;
                    const done = myItems.some((x) => x.i === it.i);
                    return <li key={it.i} className={done ? "done" : ""}><span className="num">{L}</span> · <span className="num">{R}</span>{it.rep != null ? <em> 반복(화면 {it.rep + 1}의 좌우 바꿈)</em> : null}{done ? " ✓" : ""}</li>;
                  })}
                </ol>
              </details>
              <button type="button" className="btn-p" onClick={() => open("self2")}>자기평가 ② 열기</button>
            </div>
          )}

          {stage === "self2" && !agg && (
            <div className="stage-box">
              <h3>4. 자기평가 ②</h3>
              <p>①의 답을 보여 주지 않은 채 같은 문항과 등수 예측에 다시 답하고 「현재 점수 확정」을 누릅니다. 확정한 뒤에야 ①과 나란히 보고 변화 사유를 고릅니다.</p>
              <p className="why"><b>왜 ①을 가리나.</b> ①이 보이면 그 값에 끌려가 비교가 기준을 얼마나 움직였는지 알 수 없습니다. 실제 수업에서는 ② 전에 선생님이 기준 예시 한 쌍을 함께 짚습니다(하위권의 과대평가는 동료 작품을 보는 것만으로 저절로 고쳐지지 않습니다).</p>
              {!s2Locked && <p className="hint">학생 화면에서 「현재 점수 확정」까지 해 두면 결과 화면에서 예측과 실제의 차이를 볼 수 있습니다.</p>}
              <button type="button" className="btn-p" onClick={runAgg}>집계 실행</button>
              <p className="hint">반 친구 11명의 판정을 예시 작품의 숨은 품질로 만든 뒤, 내 판정과 합쳐 계산합니다.</p>
            </div>
          )}

          {stage === "self2" && agg && q && (
            <div className="stage-box">
              <h3>5. 집계 결과</h3>
              <div className="tiles2">
                <div className="tile"><span className="t-l">척도분리신뢰도(SSR)</span><span className="t-v num">{fmtNum(q.ssr)}</span><Status kind={ssrKind(q.ssr)}>{ssrWord(q.ssr)}</Status></div>
                <div className="tile"><span className="t-l">작품당 평균 비교</span><span className="t-v num">{fmtNum(q.perWorkMean, 1)}회</span><span className="t-s">판정 {q.nJudgements}건</span></div>
              </div>
              {agg.res.reasons.length > 0 && <ul className="reason-list hold">{agg.res.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
              {agg.res.cautions.length > 0 && <ul className="reason-list warn">{agg.res.cautions.map((r) => <li key={r}>{r}</li>)}</ul>}
              <p className="why"><b>무엇을 계산했나.</b> 모든 판정을 브래들리–테리 모형으로 풀어 작품마다 θ(로짓 척도)를 구했습니다. SSR이 .80 이상이면 그대로, .70~.80이면 주의 문구와 함께 공개하고, .70 아래면 공개를 보류하도록 권고합니다.</p>
              <button type="button" className="btn-s" onClick={() => goTab("agg")}>집계와 품질 자세히 보기</button>
              <button type="button" className="btn-p" onClick={() => open("result")}>결과 공개</button>
            </div>
          )}

          {stage === "result" && (
            <div className="stage-box">
              <h3>6. 결과 공개</h3>
              <p>학생 화면에는 받은 이유 문장과 결정적 축이 먼저 나오고, 위치는 학생이 「자리 보기」를 눌러야 보입니다.</p>
              <div className="field-row">
                <label htmlFor="rv-sel">공개 범위</label>
                <select id="rv-sel" value={peer.reveal} onChange={(e) => setPeer({ ...peer, reveal: e.target.value })}>
                  <option value="band">밴드(상·중·하, 설계 기본값)</option><option value="pct">백분위</option><option value="rank">등수</option><option value="none">보이지 않음</option>
                </select>
              </div>
              <p className="why"><b>왜 밴드인가.</b> 정확한 등수는 하위권의 동기를 꺾고, 점수는 함께 준 논평의 효과를 지웁니다. 시뮬레이션에서 이 규모의 밴드는 네 명 중 한 명꼴로 진짜 위치와 어긋나므로 성긴 표현이 오히려 정직합니다.</p>
              <MyCalib meSid={meSid} />
              <button type="button" className="btn-s" onClick={() => goTab("agg")}>집계와 품질 보기</button>
            </div>
          )}
          {note && <div className="note-warn" role="alert">{note}</div>}
        </div>

        <div className="panel">
          <div className="field-row">
            <label htmlFor="me-sel">체험할 학생(내 작품)</label>
            <select id="me-sel" value={meSid} onChange={(e) => setMe(e.target.value)}>
              {SIDS.map((sid) => { const w = workOfSid(sid); return <option key={sid} value={sid}>{w.no} 「{w.title}」</option>; })}
            </select>
          </div>
          <p className="hint">바꾸면 처음부터 다시 시작합니다. 내 작품은 비교에 나오지 않습니다.</p>
        </div>

        <details className="panel data">
          <summary>저장된 기록 보기</summary>
          <p className="hint">앱에서는 Firestore의 같은 이름 문서에 저장됩니다. 여기서는 이 페이지의 메모리에만 있습니다.</p>
          <h4><Key>submissions/{meSid}</Key></h4><JsonBox value={mySub} />
          <h4><Key>assess/{meSid}</Key></h4><JsonBox value={myAssess} />
          <h4><Key>meta/peerRoster</Key></h4><JsonBox value={roster} />
        </details>
      </aside>
    </div>
  );
}

function MyCalib({ meSid }) {
  useStoreVer();
  const a = labStore.read("assess:" + meSid);
  const r = a && a.result;
  if (!r) return null;
  return (
    <table className="tbl small">
      <tbody>
        <tr><th scope="row">실제 백분위(동료 판정)</th><td className="num">{pct(r.pct)} · {r.band || "-"}</td></tr>
        <tr><th scope="row">예측 ① → 편향</th><td className="num">{pct(r.predPct1)} → {r.bias1 == null ? "-" : (r.bias1 > 0 ? "+" : "") + fmtNum(r.bias1)}</td></tr>
        <tr><th scope="row">예측 ② → 편향</th><td className="num">{pct(r.predPct2)} → {r.bias2 == null ? "-" : (r.bias2 > 0 ? "+" : "") + fmtNum(r.bias2)}</td></tr>
        <tr><th scope="row">보정량 |①| − |②|</th><td className="num">{r.calib == null ? "-" : fmtNum(r.calib)}</td></tr>
      </tbody>
    </table>
  );
}

/* ============================================================
   탭 2 · 예시 학급
   ============================================================ */
function GalleryTab({ meSid }) {
  const [showQ, setShowQ] = useState(false);
  const sorted = WORKS.slice().sort((a, b) => (a.no < b.no ? -1 : 1));
  return (
    <div>
      <div className="intro">
        <p>2학년 한 반을 12명으로 줄인 예시 학급입니다. 예시 A·B·C(「오른손」·「수위선 1.2m」·「37번 열쇠」)는 앱의 자료집 예시 작품과 같은 글과 도판이고, 나머지 9점은 이 체험을 위해 쓴 가상의 작품이며 도판은 기록 사진 형식만 흉내 낸 도식입니다. 강한 작품부터 약한 작품까지 고르게 섞었습니다.</p>
        <label className="check"><input id="show-q" type="checkbox" checked={showQ} onChange={(e) => setShowQ(e.target.checked)} /> 반 친구 판정을 흉내 낼 때 쓴 숨은 품질 보기 (체험 전에는 가려 두는 편이 좋습니다)</label>
      </div>
      <div className="gallery">
        {sorted.map((w) => (
          <article key={w.no} className={"work-card" + (sidOfNo(w.no) === meSid ? " mine" : "")}>
            <img src={IMG[w.no]} alt={"작품 " + w.no + " 「" + w.title + "」 도판"} />
            <div className="wc-body">
              <div className="wc-h"><span className="num">{w.no}</span><b>「{w.title}」</b>{sidOfNo(w.no) === meSid && <span className="pill">내 작품</span>}</div>
              <p className="wc-meta">{w.problem} · {w.attitude} · {w.draw ? "도식 도판" : "자료집 예시 도판"}</p>
              <details>
                <summary>작품 캡션</summary>
                <dl className="plate">
                  <dt>유물 명칭</dt><dd>{w.relic}</dd><dt>발굴 연도</dt><dd>{w.year}</dd><dt>추정 연대</dt><dd>{w.era}</dd>
                  <dt>재질</dt><dd>{w.mat}</dd><dt>크기</dt><dd>{w.size}</dd><dt>출토 맥락</dt><dd>{w.context}</dd><dt>소장</dt><dd>{w.coll}</dd>
                </dl>
              </details>
              <details><summary>작가 노트</summary><p className="note-text">{w.note}</p></details>
              {showQ && (
                <div className="qbox"><span className="num">숨은 품질 {qOf(w.no) > 0 ? "+" : ""}{fmtNum(qOf(w.no))}</span><p>{w.why}</p></div>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

/* ============================================================
   탭 3 · 배정표
   ============================================================ */
function RosterTab({ peer }) {
  useStoreVer();
  const live = labStore.read("peerRoster");
  const preview = useMemo(() => (live ? null : rosterFrom({ k: peer.k, seed: "preview-" + peer.k, allSubmitted: true }).doc), [live, peer.k]);
  const roster = live || preview;
  const [view, setView] = useState("round");
  const [sel, setSel] = useState(null);
  const n = roster.works.length, k = roster.k;
  const nos = roster.works.map((w) => w.no);
  const ds = (roster.stats && roster.stats.ds) || [];
  const errors = validatePlan({ plan: roster.plan, works: roster.works, judges: roster.judges, k, repeat: 1 });
  const st = roster.stats || {};

  const rows = roster.works.map((w, j) => {
    const items = roster.plan[w.sid] || [];
    const byRound = [];
    for (let r = 1; r <= k; r += 1) {
      const a = nos[(j + r) % n], b = nos[(j + r + ds[r - 1]) % n];
      const it = items.find((x) => x.rep == null && ((x.a === a && x.b === b) || (x.a === b && x.b === a)));
      byRound.push(it || null);
    }
    return { w, j, items, byRound, rep: items.find((x) => x.rep != null) };
  });
  const cellOf = (it) => {
    if (!it) return { L: "?", R: "?" };
    return { L: it.left === "a" ? it.a : it.b, R: it.left === "a" ? it.b : it.a };
  };
  const has = (it) => sel && it && (it.a === sel || it.b === sel);
  const expo = {};
  nos.forEach((no) => { expo[no] = { n: 0, L: 0, R: 0, opp: new Set() }; });
  roster.works.forEach((w) => (roster.plan[w.sid] || []).forEach((it) => {
    if (it.rep != null) return;
    const { L, R } = cellOf(it);
    expo[L].n += 1; expo[L].L += 1; expo[R].n += 1; expo[R].R += 1;
    expo[it.a].opp.add(it.b); expo[it.b].opp.add(it.a);
  }));

  return (
    <div>
      <div className="intro">
        <p>{live ? "체험에서 확정한 명단의 배정표입니다." : "아직 명단을 확정하지 않아, 지금 설정(1인당 " + peer.k + "쌍)으로 만든 미리 보기입니다. 「직접 해 보기」에서 명단을 확정하면 그 배정표로 바뀝니다."} 교사 화면의 「비교 명단 확정」과 같은 함수(<Key>makePlan</Key>)로 만들었습니다.</p>
      </div>
      <div className="facts">
        <div><span className="t-l">작품 · 판정자</span><span className="t-v num">{n} · {roster.judges.length}</span></div>
        <div><span className="t-l">1인당</span><span className="t-v num">{k}쌍 + 반복 1</span></div>
        <div><span className="t-l">작품당 비교</span><span className="t-v num">{st.exposureMin === st.exposureMax ? st.exposureMin : st.exposureMin + "~" + st.exposureMax}회</span></div>
        <div><span className="t-l">서로 다른 쌍</span><span className="t-v num">{st.distinctPairs} / {n * (n - 1) / 2}</span></div>
      </div>
      <div className="rule-box">
        <h3>순환 규칙</h3>
        <p>작품을 번호순으로 0~{n - 1}에 놓고, 작품 j를 낸 학생의 r회차 쌍을 <b className="num">{"{ j + r, j + r + d_r } (mod " + n + ")"}</b>로 정합니다. 한 회차 안에서 학생들이 한 바퀴 돌면 앞자리 j + r이 모든 작품을 정확히 한 번 덮고, d_r이 회차 안에서 같으므로 뒷자리도 그렇습니다. 그래서 k회차를 마치면 작품마다 정확히 2k번 비교됩니다. r ≥ 1이라 자기 작품은 앞자리에 오지 않고, d_r은 뒷자리가 자기 작품이 되지 않도록 고릅니다.</p>
        <p className="num ds">d_r = {ds.join(", ")}</p>
        <ul className="checks">
          <li><Status kind={errors.length ? "hold" : "ok"}>{errors.length ? "검사 오류 " + errors.length + "건" : "자기 작품 없음 · 한 학생 안에서 같은 쌍 없음 · 반복 쌍 좌우 뒤집힘"}</Status></li>
          <li><Status kind={st.exposureMin === st.exposureMax ? "ok" : "warn"}>{st.exposureMin === st.exposureMax ? "작품마다 정확히 " + st.exposureMin + "회 비교" : "작품마다 비교 " + st.exposureMin + "~" + st.exposureMax + "회"}</Status></li>
          <li><Status kind={st.sideDevMax <= 1 ? "ok" : "warn"}>작품별 왼쪽·오른쪽 차이 최대 {st.sideDevMax} (반복 포함 {st.sideDevMaxRep})</Status></li>
          <li><Status kind={st.judgeSideDevMax <= 1 ? "ok" : "warn"}>학생별 왼쪽·오른쪽 차이 최대 {st.judgeSideDevMax}</Status></li>
          <li><Status kind={st.connected ? "ok" : "hold"}>{st.connected ? "비교 그래프가 하나로 이어짐" : "비교 그래프가 끊김"}</Status></li>
        </ul>
      </div>

      <div className="tbl-tools">
        <span className="seg">
          <button type="button" aria-pressed={view === "round"} onClick={() => setView("round")}>회차 구조로 보기</button>
          <button type="button" aria-pressed={view === "screen"} onClick={() => setView("screen")}>학생이 보는 순서로 보기</button>
        </span>
        <span className="hint">작품 번호를 누르면 그 작품이 나오는 칸이 모두 표시됩니다. 칸은 「왼쪽 · 오른쪽」입니다.</span>
      </div>
      <div className="chips">
        {nos.map((no) => (
          <button type="button" key={no} className={"chip" + (sel === no ? " on" : "")} aria-pressed={sel === no} onClick={() => setSel(sel === no ? null : no)}>{no}</button>
        ))}
      </div>
      {sel && <p className="sel-note">{sel} 「{workByNo(sel).title}」: 본 판정에서 <b className="num">{expo[sel].n}회</b> (왼쪽 {expo[sel].L} · 오른쪽 {expo[sel].R}), 서로 다른 상대 {expo[sel].opp.size}점. 이 작품을 낸 학생의 줄에는 한 번도 나오지 않습니다.</p>}
      <div className="scroll-x">
        <table className="tbl matrix">
          <thead>
            <tr>
              <th scope="col">학생(내는 작품)</th>
              {view === "round"
                ? Array.from({ length: k }, (_, r) => <th key={r} scope="col" className="num">{r + 1}회차<br /><small>d={ds[r]}</small></th>)
                : Array.from({ length: k }, (_, i) => <th key={i} scope="col" className="num">화면 {i + 1}</th>)}
              <th scope="col">반복</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ w, items, byRound, rep }) => {
              const main = view === "round" ? byRound : items.filter((x) => x.rep == null);
              const mine = sel && w.no === sel;
              return (
                <tr key={w.sid} className={mine ? "own" : ""}>
                  <th scope="row"><span className="num">{w.sid}</span> <span className="num sub">({w.no})</span></th>
                  {main.map((it, c) => { const { L, R } = cellOf(it); return <td key={c} className={"num" + (has(it) ? " hit" : "")} title={L + " (왼쪽) · " + R + " (오른쪽)"}>{short(L)}·{short(R)}</td>; })}
                  <td className={"num rep" + (has(rep) ? " hit" : "")} title={rep ? "화면 " + (rep.rep + 1) + "의 쌍을 좌우만 바꿔 맨 뒤에" : ""}>{rep ? short(cellOf(rep).L) + "·" + short(cellOf(rep).R) : "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">회차 구조에서는 줄이 한 칸 내려갈 때마다 앞자리가 한 번호씩 밀리는 대각선이 보입니다. 학생이 보는 순서는 회차를 섞은 것이고, 반복 쌍은 앞 {k - 2}화면 가운데 하나를 골라 맨 뒤에 좌우를 바꿔 둡니다(원본과 반복 사이에 다른 화면이 둘 이상 들어갑니다).</p>

      <h3 className="h3">작품별 노출</h3>
      <div className="scroll-x">
        <table className="tbl">
          <thead><tr><th scope="col">작품</th><th scope="col">비교 횟수</th><th scope="col" className="bar-col">왼쪽 · 오른쪽</th><th scope="col">서로 다른 상대</th></tr></thead>
          <tbody>
            {nos.map((no) => {
              const e = expo[no];
              return (
                <tr key={no}>
                  <th scope="row"><Thumb no={no} size={40} /> <span className="num">{no}</span></th>
                  <td className="num">{e.n}</td>
                  <td className="bar-col">
                    <span className="lr" role="img" aria-label={"왼쪽 " + e.L + "회, 오른쪽 " + e.R + "회"}>
                      <i className="l" style={{ flexGrow: e.L }} title={"왼쪽 " + e.L + "회"}>{e.L}</i><i className="r" style={{ flexGrow: e.R }} title={"오른쪽 " + e.R + "회"}>{e.R}</i>
                    </span>
                  </td>
                  <td className="num">{e.opp.size}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ============================================================
   탭 4 · 집계와 품질
   ============================================================ */
function Scatter({ rows, mult }) {
  const W = 440, H = 300, ml = 44, mr = 16, mt = 14, mb = 40;
  const xs = rows.map((r) => qOf(r.no, mult)), ys = rows.map((r) => r.theta);
  const lim = Math.ceil(Math.max(2, ...xs.map(Math.abs), ...ys.map(Math.abs)));
  const sx = (x) => ml + ((x + lim) / (2 * lim)) * (W - ml - mr);
  const sy = (y) => mt + ((lim - y) / (2 * lim)) * (H - mt - mb);
  const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
  let sxy = 0, sxx = 0, syy = 0; xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; syy += (ys[i] - my) ** 2; });
  const r = sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null;
  const ticks = []; for (let t = -lim; t <= lim; t += 1) ticks.push(t);
  return (
    <figure className="fig">
      <svg viewBox={"0 0 " + W + " " + H} role="img" aria-label={"숨은 품질과 추정 θ의 상관 r = " + fmtNum(r)}>
        {ticks.map((t) => <line key={"gx" + t} x1={sx(t)} x2={sx(t)} y1={mt} y2={H - mb} className="grid" />)}
        {ticks.map((t) => <line key={"gy" + t} y1={sy(t)} y2={sy(t)} x1={ml} x2={W - mr} className="grid" />)}
        <line x1={sx(-lim)} y1={sy(-lim)} x2={sx(lim)} y2={sy(lim)} className="diag" />
        {ticks.map((t) => <text key={"tx" + t} x={sx(t)} y={H - mb + 16} className="tick" textAnchor="middle">{t}</text>)}
        {ticks.map((t) => <text key={"ty" + t} x={ml - 8} y={sy(t) + 4} className="tick" textAnchor="end">{t}</text>)}
        <text x={(ml + W - mr) / 2} y={H - 6} className="axis" textAnchor="middle">숨은 품질(흉내 낸 판정자의 기준)</text>
        <text x={12} y={(mt + H - mb) / 2} className="axis" textAnchor="middle" transform={"rotate(-90 12 " + (mt + H - mb) / 2 + ")"}>추정 θ</text>
        {rows.map((row, i) => (
          <g key={row.no} className="pt">
            <circle cx={sx(xs[i])} cy={sy(ys[i])} r={12} className="hit-area"><title>{row.no} 「{workByNo(row.no).title}」 · 숨은 품질 {fmtNum(xs[i])} · θ {fmtNum(ys[i])}</title></circle>
            <circle cx={sx(xs[i])} cy={sy(ys[i])} r={5} className="dot" />
            <text x={sx(xs[i]) + 8} y={sy(ys[i]) - 7} className="dl">{short(row.no)}</text>
          </g>
        ))}
      </svg>
      <figcaption>점 하나가 작품 하나입니다. 대각선에 가까울수록 동료 판정이 기준을 잘 복원한 것입니다. 상관 <b className="num">r = {fmtNum(r)}</b></figcaption>
    </figure>
  );
}

function AggTab({ meSid, peer, agg: tryAgg }) {
  useStoreVer();
  const liveRoster = labStore.read("peerRoster");
  const [source, setSource] = useState(tryAgg ? "try" : "sim");
  const [mult, setMult] = useState(1);
  const [kSim, setKSim] = useState(11);
  const [seed, setSeed] = useState(null);   // null이면 체험에서 「집계 실행」한 결과를 그대로 보인다
  useEffect(() => { if (tryAgg) { setSource("try"); setSeed(null); setMult(1); } }, [tryAgg]);

  const data = useMemo(() => {
    if (source === "try" && tryAgg && seed == null && mult === 1 && liveRoster && tryAgg.roster.hash === liveRoster.hash) {
      const mine = labStore.read("assess:" + meSid) || {};
      const assessMap = { ...tryAgg.assessMap, [meSid]: mine };
      return { roster: tryAgg.roster, assessMap, res: aggregate({ roster: tryAgg.roster, assessMap, subMap: {}, cfg: peer, splitReps: 25 }), same: true };
    }
    if (source === "try" && liveRoster) {
      const others = simulateJudges({ roster: liveRoster, sids: SIDS.filter((s) => s !== meSid), seed: seed == null ? 1 : seed, mult });
      const mine = labStore.read("assess:" + meSid) || {};
      const assessMap = { ...others, [meSid]: mine };
      return { roster: liveRoster, assessMap, res: aggregate({ roster: liveRoster, assessMap, subMap: {}, cfg: peer, splitReps: 25 }) };
    }
    const { doc } = rosterFrom({ k: kSim, seed: "sim-" + kSim, allSubmitted: true });
    const assessMap = simulateJudges({ roster: doc, sids: SIDS, seed: seed == null ? 3 : seed, mult });
    return { roster: doc, assessMap, res: aggregate({ roster: doc, assessMap, subMap: {}, cfg: peer, splitReps: 25 }) };
  }, [source, liveRoster && liveRoster.hash, mult, kSim, seed, meSid, storeVer, tryAgg]); // eslint-disable-line

  const { res, roster, assessMap } = data;
  const q = res.quality;
  const J = useMemo(() => collectJudgements(assessMap, roster), [assessMap, roster]);
  const theta = {}; res.works.forEach((w) => { theta[w.no] = w.theta; });
  const expRep = expectedRepeatAgreement(J, theta);
  const mineJ = source === "try" ? J.filter((x) => x.judge === meSid && x.rep == null) : [];
  const sh = q.splitHalf || {};
  const pos = q.position || {};
  const rep = q.repeat || {};
  const judges = Object.entries(q.judges || {}).sort((a, b) => (a[0] < b[0] ? -1 : 1));

  return (
    <div>
      <div className="intro">
        <p>교사 화면의 「집계 실행」과 같은 함수(<Key>aggregate</Key>)의 결과입니다. 반 친구 판정은 예시 작품의 숨은 품질로 만든 것이므로, 숨은 품질과 추정 θ를 나란히 놓고 동료 판정이 기준을 얼마나 되찾는지 볼 수 있습니다.</p>
      </div>
      <div className="controls">
        <div className="field-row">
          <span className="lbl">판정 자료</span>
          <span className="seg">
            <button type="button" aria-pressed={source === "try"} disabled={!liveRoster} onClick={() => setSource("try")}>내 체험 판정 + 반 친구 11명</button>
            <button type="button" aria-pressed={source === "sim"} onClick={() => setSource("sim")}>12명 모두 예시 판정자</button>
          </span>
        </div>
        {!liveRoster && <p className="hint">「직접 해 보기」에서 명단을 확정하면 내 판정을 넣어 계산할 수 있습니다.</p>}
        <div className="field-row">
          <span className="lbl">학급 작품의 다양성</span>
          <span className="seg">
            {[[0.5, "비슷함(×0.5)"], [1, "기본"], [1.5, "뚜렷함(×1.5)"]].map(([v, t]) => <button key={v} type="button" aria-pressed={mult === v} onClick={() => setMult(v)}>{t}</button>)}
          </span>
        </div>
        {source === "sim" && (
          <div className="field-row">
            <label htmlFor="ks">1인당 쌍 수</label>
            <select id="ks" value={kSim} onChange={(e) => setKSim(Number(e.target.value))}>{K_OPTIONS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}</select>
          </div>
        )}
        <button type="button" className="btn-s" onClick={() => setSeed((seed == null ? 3 : seed) + 1)}>반 친구 판정 다시 뽑기</button>
        <span className="hint">{data.same ? "지금 숫자는 「직접 해 보기」에서 집계한 결과와 같습니다. " : ""}같은 학급이라도 판정을 다시 받으면 SSR이 달라집니다. 몇 번 눌러 흔들림의 폭을 보세요.</span>
      </div>

      <div className="tiles">
        <div className="tile"><span className="t-l">척도분리신뢰도(SSR)</span><span className="t-v num">{fmtNum(q.ssr)}</span><Status kind={ssrKind(q.ssr)}>{ssrWord(q.ssr)}</Status></div>
        <div className="tile"><span className="t-l">판정자 반분 신뢰도</span><span className="t-v num">{fmtNum(sh.median)}</span><span className="t-s">보정 전 r {fmtNum(sh.medianRaw)} · 25회 중앙값</span></div>
        <div className="tile"><span className="t-l">작품당 평균 비교</span><span className="t-v num">{fmtNum(q.perWorkMean, 1)}회</span><span className="t-s">판정 {q.nJudgements}건 · 판정자 {q.nJudges}명</span></div>
        <div className="tile"><span className="t-l">먼저 놓인 쪽 선택률</span><span className="t-v num">{pct(pos.rate)}</span><span className="t-s">95% 구간 {pct(pos.wilson && pos.wilson[0])}~{pct(pos.wilson && pos.wilson[1])}</span></div>
        <div className="tile"><span className="t-l">반복 쌍 일치율</span><span className="t-v num">{pct(rep.rate)}</span><span className="t-s">{rep.agree}/{rep.n}쌍 · 모형 기대치 {pct(expRep)}</span></div>
        <div className="tile"><span className="t-l">「판단이 어려웠다」</span><span className="t-v num">{pct(q.hardRate)}</span><span className="t-s">캡션 펼침 {pct(q.plateOpenRate)}</span></div>
      </div>
      {(res.reasons.length > 0 || res.cautions.length > 0) && (
        <div className="reasons">
          {res.reasons.map((r) => <p key={r}><Status kind="hold">보류 사유</Status> {r}</p>)}
          {res.cautions.map((r) => <p key={r}><Status kind="warn">주의</Status> {r}</p>)}
        </div>
      )}

      <div className="two">
        <Scatter rows={res.works.filter((w) => w.rank != null)} mult={mult} />
        <div>
          <h3 className="h3">읽는 법</h3>
          <dl className="gloss">
            <dt>θ(세타)</dt><dd>브래들리–테리 모형의 작품 위치. 두 작품의 θ 차가 1이면 판정자 약 73%가 앞선 쪽을 고른다고 봅니다. 학급 평균이 0입니다.</dd>
            <dt>SSR</dt><dd>(θ의 분산 − 평균 오차 분산) ÷ θ의 분산. 판정자들이 얼마나 같은 순서를 가리키는가입니다. .80 이상 채택, .70~.80 주의, .70 미만 보류.</dd>
            <dt>반분 신뢰도</dt><dd>판정자를 반으로 갈라 두 번 계산한 θ의 상관. 반쪽은 비교 횟수가 절반이라 낮게 나오는 것이 정상이어서 보고 지표로만 씁니다.</dd>
            <dt>반복 쌍 일치율</dt><dd>같은 쌍을 좌우만 바꿔 다시 보여 줬을 때 같은 작품을 고른 비율. 성실한 판정자도 비슷한 두 작품에서는 갈리므로 모형 기대치와 견줘 읽습니다.</dd>
            <dt>작품 다양성</dt><dd>작품들이 서로 비슷하면 판정을 늘려도 SSR이 잘 오르지 않습니다. 위의 「비슷함」을 눌러 확인해 보세요.</dd>
          </dl>
        </div>
      </div>

      <h3 className="h3">작품 순위</h3>
      <div className="scroll-x">
        <table className="tbl">
          <thead><tr><th scope="col">순위</th><th scope="col">작품</th><th scope="col">θ ± 표준오차</th><th scope="col">이긴 횟수 / 비교</th><th scope="col">밴드</th><th scope="col">숨은 품질</th></tr></thead>
          <tbody>
            {res.works.map((w) => (
              <tr key={w.no} className={w.sid === meSid ? "mine" : ""}>
                <td className="num">{w.rank == null ? "-" : w.rank}</td>
                <th scope="row"><Thumb no={w.no} /> <span className="num">{w.no}</span> 「{workByNo(w.no).title}」{w.sid === meSid && <span className="pill">내 작품</span>}</th>
                <td className="num">{fmtNum(w.theta)} ± {fmtNum(w.se)}</td>
                <td className="num">{w.wins} / {w.plays}</td>
                <td>{w.band || "-"}</td>
                <td className="num">{fmtNum(qOf(w.no, mult))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="h3">판정자 적합도</h3>
      <p className="hint">표시는 수업 자료일 뿐 누구도 자동으로 빼지 않습니다. 판정 {roster.k}건으로 계산한 infit은 흔들림이 커서, 시뮬레이션에서는 성실한 판정자도 5~20%가 표시되었습니다.</p>
      <div className="scroll-x">
        <table className="tbl">
          <thead><tr><th scope="col">판정자</th><th scope="col">판정</th><th scope="col">infit</th><th scope="col">표시</th><th scope="col">합의와 반대(θ 차 ≥ 0.5)</th><th scope="col">먼저 놓인 쪽</th><th scope="col">판정 시간 중앙값</th></tr></thead>
          <tbody>
            {judges.map(([sid, f]) => (
              <tr key={sid} className={sid === meSid && source === "try" ? "mine" : ""}>
                <th scope="row"><span className="num">{sid}</span>{sid === meSid && source === "try" && <span className="pill">나</span>}</th>
                <td className="num">{f.n}</td>
                <td className="num">{fmtNum(f.infit)}</td>
                <td>{f.flag ? <Status kind="warn">{INFIT_BAND[0]}~{INFIT_BAND[1]} 밖 또는 +2SD</Status> : <span className="sub">-</span>}</td>
                <td className="num">{f.nGap ? f.against + "/" + f.nGap : "-"}</td>
                <td className="num">{pct(f.leftRate)}</td>
                <td className="num">{f.medianMs == null ? "-" : Math.round(f.medianMs / 1000) + "초"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {mineJ.length > 0 && (
        <>
          <h3 className="h3">내 판정과 학급 합의</h3>
          <div className="scroll-x">
            <table className="tbl">
              <thead><tr><th scope="col">쌍(왼쪽 · 오른쪽)</th><th scope="col">내가 고른 쪽</th><th scope="col">θ가 높은 쪽</th><th scope="col">내 이유 · 결정적 축</th></tr></thead>
              <tbody>
                {mineJ.map((x) => {
                  const L = x.left === "a" ? x.a : x.b, R = x.left === "a" ? x.b : x.a;
                  const hi = theta[x.a] >= theta[x.b] ? x.a : x.b;
                  const agree = hi === x.winNo;
                  return (
                    <tr key={x.i}>
                      <td className="num">{L} · {R}</td>
                      <td className="num">{x.winNo}</td>
                      <td>{agree ? <Status kind="ok">같음</Status> : <Status kind="warn">{hi}</Status>} <span className="sub num">P = {pct(sigmoid(Math.abs(theta[x.a] - theta[x.b])))}</span></td>
                      <td>{x.why} <span className="sub">· {TAG_LABEL[x.tag] || "-"}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="hint">P는 모형이 본 앞선 쪽의 승률입니다. P가 60% 안팎인 쌍에서 합의와 다르게 고르는 것은 흔한 일이고, 판정의 약 20%가 합의와 어긋나는 것이 정상입니다.</p>
        </>
      )}
    </div>
  );
}

/* ============================================================
   탭 5 · 설계 요점
   ============================================================ */
const DECISIONS = [
  ["점수 대신 둘 중 하나를 고른다", "고2 판정자가 「5점 만점에 3점」을 일관되게 매기기는 어렵고 친분이 점수에 실립니다. 두 작품의 우열 판단은 훨씬 일관되고, 거친 판정을 여럿 모아도 확률 모형으로 순위 척도를 되찾을 수 있습니다. 훈련받지 않은 동료 판정이 전문가 순위와 높은 상관을 보인다는 보고가 대학과 중등에서 이어졌습니다.", "Thurstone 1927; Bradley & Terry 1952; Jones & Alcock 2014; Jones & Wheadon 2015"],
  ["1인당 12쌍, 작품마다 정확히 24회", "신뢰도는 판정자 수가 아니라 작품당 비교 횟수가 정합니다. 학생 한 명이 작품 하나를 내므로 판정자 수가 곧 작품 수이고, 순환 규칙을 쓰면 작품마다 정확히 2k번 비교됩니다.", "Kinnear 외 2025; Verhavert 외 2019"],
  ["명단 확정 순간 배정표를 한 문서에 고정한다", "점수가 비슷한 작품끼리 붙이는 적응 배정은 신뢰도 수치를 부풀리고 순위 정확도는 더 얻지 못하며, 학생 화면이 남의 판정을 실시간으로 읽어야 합니다. 비적응 균형 배정을 명단 확정 때 한 번 만듭니다.", "Bramley 2015; Bramley & Vitello 2019; Crompvoets 외 2020"],
  ["좌우를 맞추고 숨은 반복 쌍을 하나 둔다", "먼저 놓인 쪽으로 끌리는 경향은 방향이 상황마다 달라 균형 배치로 상쇄합니다. 반복 쌍은 학급의 일관성을 보는 기술 통계일 뿐 개인을 빼는 기준이 아닙니다.", "Bar-Hillel 2015; Kendall & Babington Smith 1940"],
  ["이유 한 문장은 모든 쌍에서, 결정적 축은 고른 뒤에", "비교를 글로 옮기는 것 자체가 학습이고, 받은 문장이 8차시 성찰의 재료가 됩니다. 판정 중에 기준을 나열하면 전체를 보는 판단이 항목별 판단으로 바뀌므로 축은 고른 뒤에 하나만 고릅니다. 「노력」 항목은 두지 않습니다.", "Nicol 2021; Leech & Chambers 2022; Bellaiche 외 2023"],
  ["확신도 대신 「판단이 어려웠다」 표시", "강제선택에 확신도를 더하면 시간만 늘고 정확도는 오르지 않습니다. 판단의 어려움은 의미 있는 변수라 선택 표시로 남깁니다. 배포된 설정은 현재 확신도 묻기가 켜져 있으니 8차시 전에 의도를 확인하세요.", "Mantiuk 외 2012; van Daal 외 2017"],
  ["AI 활용 범위는 비교 화면에서 숨긴다", "AI 라벨 하나로 같은 작품의 평가가 내려가므로 작품마다 다른 고지가 보이면 그 차이가 θ에 그대로 실립니다. 대신 학급 공통 안내 한 줄을 두고, 고지의 효과는 별도의 앵커 쌍으로 잽니다.", "Bellaiche 외 2023; Horton 외 2023; Raj 외 2026"],
  ["자기평가 ②는 ①을 보지 않고 먼저 확정한다", "①이 보이면 그 값에 끌려가 보정량이 진짜 재평가가 아니게 됩니다. 확정한 뒤에 나란히 보고 변화 사유를 고릅니다. 주 결과는 보정량 |편향①| − |편향②|입니다.", "Schraw 2009; Nederhand 외 2019"],
  ["결과는 이유 먼저, 위치는 밴드로, 눌러야 보이게", "정확한 등수는 하위권에 해롭고 점수는 함께 준 논평의 효과를 지웁니다. 받은 이유와 결정적 축을 먼저 보여 주고 위치는 상·중·하로만 알립니다.", "Hattie & Timperley 2007; Butler 1988; Goulas & Megalokonomou 2021"],
  ["품질 표시는 하되 아무도 자동으로 빼지 않는다", "판정 12건의 적합도 지수는 흔들림이 커서 개인 판단에 쓸 수 없습니다. 주 분석은 전원을 넣고, 표시된 판정자를 뺀 계산은 민감도 분석으로만 보고합니다.", "Wu, Niezink & Junker 2022; Linacre 2002"],
];

function DesignTab() {
  const rows = [0.5, 0.75, 1, 1.5];
  const ks = [10, 12, 15, 21];
  const cell = (sigma, k) => (SIM.A || []).find((r) => r.n === 28 && r.k === k && r.sigma === sigma);
  const shade = (v) => { const t = Math.max(0, Math.min(1, (v - 0.45) / 0.5)); const a = [234, 241, 237], b = [49, 104, 79]; return "rgb(" + a.map((x, i) => Math.round(x + (b[i] - x) * t)).join(",") + ")"; };
  return (
    <div>
      <div className="intro"><p>설계서(<Key>쌍대비교_구현_근거.md</Key>)의 결정 가운데 학생 화면과 교사 화면에서 바로 보이는 열 가지입니다. 전체 근거와 참고문헌은 그 문서와 논문 초안(<Key>쌍대비교_설계_타당성_논문.md</Key>)에 있습니다.</p></div>
      <ol className="decisions">
        {DECISIONS.map(([h, b, ref]) => <li key={h}><h3>{h}</h3><p>{b}</p><p className="ref">{ref}</p></li>)}
      </ol>
      <h3 className="h3">몇 번 비교해야 믿을 만한가: 시뮬레이션 결과(학급 28명, 반복 200회)</h3>
      <p className="hint">배포된 계산 코드를 그대로 돌린 몬테카를로 결과입니다(<Key>scripts/assess-sim.mjs</Key>). 칸마다 SSR 평균, 아래는 SSR .80 이상이 나온 비율입니다. σ는 학급 안 작품 품질의 흩어짐(logit)입니다.</p>
      <div className="scroll-x">
        <table className="tbl heat">
          <thead><tr><th scope="col">작품 다양성 σ</th>{ks.map((k) => <th key={k} scope="col" className="num">1인당 {k}쌍<br /><small>작품당 {2 * k}회</small></th>)}</tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s}>
                <th scope="row" className="num">{s}</th>
                {ks.map((k) => { const c = cell(s, k); if (!c) return <td key={k}>-</td>; const dark = c.ssrMean > 0.8; return (
                  <td key={k} className="num" style={{ background: shade(c.ssrMean), color: dark ? "#fff" : "#111" }} title={"σ " + s + " · " + k + "쌍: SSR 평균 " + c.ssrMean + ", 10~90 백분위 " + c.ssrP10 + "~" + c.ssrP90 + ", 채택률 " + Math.round(c.pAdopt * 100) + "%"}>
                    <b>{fmtNum(c.ssrMean)}</b><br /><small>채택 {Math.round(c.pAdopt * 100)}%</small>
                  </td>
                ); })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">작품당 24회(12쌍)에서 SSR .80은 작품 다양성이 1 logit 안팎일 때 절반쯤만 나옵니다. 작품들이 서로 비슷한 학급에서는 판정을 두 배로 받아도 .80에 이르기 어렵습니다. 그래서 첫 학급의 θ 표준편차를 먼저 보고 남은 학급의 쌍 수를 정합니다.</p>
    </div>
  );
}

/* ============================================================
   껍데기
   ============================================================ */
const TABS = [["try", "직접 해 보기"], ["gallery", "예시 학급 12점"], ["roster", "배정표"], ["agg", "집계와 품질"], ["design", "설계 요점"]];
const FLOW = [
  ["제출", "대표 이미지·제목·작품 캡션을 사본으로 고정", "submissions/학번"],
  ["자기평가 ①", "5문항 1~5점 · 근거 · 등수 예측", "assess/학번.self.s1"],
  ["동료 비교", "k쌍 + 숨은 반복 1쌍 · 승자 · 이유 · 결정적 축", "assess/학번.judge.p1"],
  ["자기평가 ②", "①을 가린 채 다시 답하고 확정 → 나란히 보기", "assess/학번.self.s2"],
  ["결과", "받은 이유 먼저 · 위치는 밴드로", "assess/학번.result"],
];

function App() {
  const [tab, setTabState] = useState(() => { const h = (typeof location !== "undefined" && location.hash || "").slice(1); return TABS.some(([k]) => k === h) ? h : "try"; });
  const setTab = (t) => { setTabState(t); try { history.replaceState(null, "", "#" + t); } catch (e) {} if (typeof window !== "undefined") window.scrollTo({ top: 0 }); };
  const [meSid, setMeSid] = useState(DEFAULT_ME);
  const [peer, setPeer] = useState(PEER0);
  const [epoch, setEpoch] = useState(0);
  const [agg, setAgg] = useState(null);
  const [simSeed, setSimSeed] = useState(1);
  const reset = (sid) => { seedClass(sid); setPeer((p) => ({ ...PEER0, k: p.k, askConf: p.askConf })); setAgg(null); setSimSeed((s) => s + 1); setEpoch((e) => e + 1); };
  const setMe = (sid) => { setMeSid(sid); reset(sid); };
  useEffect(() => { seedClass(DEFAULT_ME); setEpoch(1); }, []);

  return (
    <div className="page">
      <header className="mast">
        <p className="eyebrow">허구의 아카이브 · 8차시 상호평가 · 교사용</p>
        <h1>쌍대비교 체험실</h1>
        <p className="lead">예시 학급 12점으로 학생 화면을 직접 해 보고, 선생님 단계 스위치를 넘기며 배정·집계·품질 판정이 어떻게 돌아가는지 확인합니다. 학생 화면은 앱의 실제 코드를 그대로 돌리고, 기록은 이 페이지 안에만 남습니다.</p>
      </header>
      <ol className="flow" aria-label="상호평가 흐름">
        {FLOW.map(([h, d, key], i) => (
          <li key={h}><span className="flow-n num">{i + 1}</span><b>{h}</b><span>{d}</span><Key>{key}</Key></li>
        ))}
      </ol>
      <nav className="tabs" role="tablist" aria-label="보기">
        {TABS.map(([k, t]) => <button key={k} role="tab" type="button" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{t}</button>)}
      </nav>
      <main>
        <div hidden={tab !== "try"}>
          {epoch > 0 && <TryTab meSid={meSid} setMe={setMe} peer={peer} setPeer={setPeer} epoch={epoch} reset={reset} agg={agg} setAgg={setAgg} simSeed={simSeed} goTab={setTab} />}
        </div>
        {tab === "gallery" && <GalleryTab meSid={meSid} />}
        {tab === "roster" && epoch > 0 && <RosterTab peer={peer} />}
        {tab === "agg" && epoch > 0 && <AggTab meSid={meSid} peer={peer} agg={agg} />}
        {tab === "design" && <DesignTab />}
      </main>
      <footer className="foot">
        <p>학생 화면: <Key>src-assess.jsx</Key> · 계산: <Key>src-assess-core.mjs</Key> · 예시 학급과 판정 흉내: <Key>pairwise-research/lab/</Key>. 예시 A·B·C 외 도판 9점은 체험용 도식이며 실제 학생 작품이 아닙니다.</p>
      </footer>
    </div>
  );
}

/* ---------- 시작 ---------- */
async function boot() {
  try { await Promise.race([document.fonts && document.fonts.load("500 22px 'Noto Sans KR'"), new Promise((r) => setTimeout(r, 1500))]); } catch (e) {}
  const out = {};
  WORKS.forEach((w) => { out[w.no] = w.img || drawRelic(w.draw); });
  IMG = out;
  createRoot(document.getElementById("root")).render(<App />);
}
boot();
