/* ============================================================
   상호평가(쌍대비교) — 교사 「학생 화면 미리 보기」

   학생 「최종 평가」 탭의 다섯 화면(제출·자기평가 ①·동료 비교·자기평가 ②·결과)을 표본 자료로 그려,
   교사가 단계를 열기 전에 학생이 무엇을 보게 되는지 확인한다. 화면 조각은 src-assess.jsx의 것을
   그대로 쓰므로 학생 화면과 어긋나지 않고, sampleMode라 어느 단추를 눌러도 저장되지 않는다.

   - 표본은 src-assess-core.mjs의 buildSampleAssess(결정론적 학급 10명·작품 10점)이고, 그림은 여기서 만든
     SVG 자리표시를 이미지 캐시에 미리 넣어 서버를 읽지 않는다(seedImgCache).
   - 질문·최소 글자 수·판정 시간·확신도·공개 범위는 교사 화면의 현재 설정값(저장 전 편집 포함)을 따른다.
     k와 반복 수는 표본 명단의 것이다(작품이 10점이라 k는 9로 잘린다).
   - src-app.jsx를 import하지 않는다(순환).
   ============================================================ */

import React, { useState, useMemo } from "react";
import { STAGES, buildSampleAssess, aggregate, myPairs } from "./src-assess-core.mjs";
import { StepStrip, SubmitScreen, SelfScreen, PeerScreen, ResultScreen, waitNote, seedImgCache } from "./src-assess.jsx";

/* 표본 학번 열 개 — 표본 작품이 열 점이라 그 이상은 판정자로만 들어간다. 보는 자리는 셋째 학생(작품 A-03) */
const PREVIEW_IDS = Array.from({ length: 10 }, (_, i) => "203" + String(i + 1).padStart(2, "0"));
const ME = PREVIEW_IDS[2];
const IMG_W = 800, IMG_H = 600;

const VIEWS = [
  { k: "submit", label: "제출", stage: "submit",
    tip: "7차시까지 쓴 제목·작품 캡션·대표 이미지를 가져와 확인하고 「제출 확정」을 누르는 화면입니다. 확정하면 학생이 고칠 수 없습니다." },
  { k: "locked", label: "제출 확정 뒤", stage: "submit",
    tip: "확정한 뒤에는 잠긴 제출만 보이고, 자기평가는 선생님이 「자기평가 ①」 단계를 열 때까지 나타나지 않습니다." },
  { k: "self1", label: "자기평가 ①", stage: "self1",
    tip: "다섯 문항 평정 · 근거 한 문장 · 우리 반 등수 예측. 제출하면 고칠 수 없습니다. 제출한 작품이 없는 학생에게는 이 화면이 없습니다." },
  { k: "peer", label: "동료 비교", stage: "peer",
    tip: "배정된 쌍을 차례로 판정합니다. 작품 번호만 보이고 작품 캡션은 접힌 채 시작하며, 두 작품을 모두 본 뒤에야 고를 수 있습니다. 질문 · 이유 최소 글자 수 · 최소 판정 시간 · 확신도는 지금 설정값입니다." },
  { k: "peerDone", label: "비교 마침", stage: "peer",
    tip: "배정된 쌍을 모두 판정한 학생은 자기평가 ②가 열릴 때까지 이 안내를 봅니다." },
  { k: "self2", label: "자기평가 ②", stage: "self2",
    tip: "①의 답을 보지 않은 채 같은 문항에 다시 답하고 「현재 점수 확정」을 눌러 고정합니다. 점수가 달라져야 한다는 암시는 어디에도 없습니다." },
  { k: "self2cmp", label: "② 나란히 보기", stage: "self2",
    tip: "확정한 뒤에야 ①과 ②를 나란히 보고, 이번 판단이 처음과 견주어 어떻게 느껴졌는지 고릅니다." },
  { k: "result", label: "결과", stage: "result",
    tip: "심사자들이 고른 결정적 축과 받은 이유 문장을 먼저 읽고, 「자리 보기」를 눌러야 자리가 보입니다. 자리의 표현(밴드·백분위·등수·보이지 않음)은 지금 「공개 범위」 설정값입니다." },
];

/* 자리표시 그림 — 유물 기록 사진의 형식(중립 배경·그림자·눈금자)만 흉내 낸 SVG. 작품마다 모양과 기울기가 다르다 */
function placeholderSVG(no, i) {
  const shapes = [
    '<rect x="260" y="200" width="280" height="200" rx="26"/><path d="M300 250 q40 -18 80 0" fill="none"/><path d="M420 350 l40 -6" fill="none" stroke-dasharray="6 5"/>',
    '<ellipse cx="400" cy="300" rx="170" ry="110"/><path d="M260 300 q140 -40 280 0" fill="none" stroke-dasharray="4 6"/>',
    '<path d="M300 220 L500 200 L520 380 L280 400 Z"/><path d="M330 260 l150 -12" fill="none"/><path d="M340 330 l40 8" fill="none" stroke-dasharray="5 4"/>',
    '<rect x="230" y="250" width="340" height="100" rx="50"/><circle cx="290" cy="300" r="18" fill="none"/><path d="M420 280 l60 40" fill="none" stroke-dasharray="3 5"/>',
    '<circle cx="400" cy="300" r="130"/><circle cx="400" cy="300" r="46" fill="none"/><path d="M330 240 l30 20" fill="none" stroke-dasharray="4 4"/>',
  ];
  const rot = ((i * 37) % 21) - 10;   // -10~10도
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + IMG_W + '" height="' + IMG_H + '" viewBox="0 0 ' + IMG_W + ' ' + IMG_H + '">'
    + '<rect width="' + IMG_W + '" height="' + IMG_H + '" fill="#ECE8E0"/>'
    + '<ellipse cx="400" cy="440" rx="230" ry="26" fill="#000" opacity=".07"/>'
    + '<g transform="rotate(' + rot + ' 400 300)" fill="#D8D1C4" stroke="#24261F" stroke-width="2" stroke-linecap="round">' + shapes[i % shapes.length] + '</g>'
    + '<g stroke="#24261F" stroke-width="2"><line x1="560" y1="540" x2="720" y2="540"/><line x1="560" y1="532" x2="560" y2="548"/><line x1="640" y1="535" x2="640" y2="545"/><line x1="720" y1="532" x2="720" y2="548"/></g>'
    + '<text x="640" y="568" font-family="monospace" font-size="15" text-anchor="middle" fill="#6E6C62">5 cm</text>'
    + '<text x="40" y="568" font-family="monospace" font-size="15" fill="#6E6C62" letter-spacing="2">표본 이미지 · 작품 ' + no + '</text>'
    + '</svg>';
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

/* 표본 학급 한 벌 — 명단·제출·판정·집계. 모듈이 사는 동안 한 번만 만든다 */
let cache = null;
function previewData() {
  if (cache) return cache;
  const sample = buildSampleAssess(PREVIEW_IDS);
  const roster = sample.roster;
  const subMap = {};
  Object.keys(sample.subMap).forEach((sid, i) => {
    const s = sample.subMap[sid];
    const ref = "asm.preview." + s.no;
    seedImgCache(sid, ref, placeholderSVG(s.no, i));
    subMap[sid] = { ...s, img: { owner: sid, ref }, imgW: IMG_W, imgH: IMG_H };
  });
  const assessMap = sample.assessMap;
  let agg = null;
  try { agg = roster ? aggregate({ roster, assessMap, subMap, cfg: sample.cfg, splitReps: 3 }) : null; }
  catch (e) { console.error("preview aggregate fail", e); }
  const me = subMap[ME];
  /* 제출 전 화면은 기록지 초안에서 출발한다 — 제출 스냅샷과 같은 값을 기록지 항목 이름으로 되돌려 놓는다 */
  const ws = me ? {
    "s7x.no": me.no, "s6b.title": me.title, "s6b.relic": me.plate.relic, "s6b.year": me.plate.year, "s6b.era": me.plate.era,
    "s6b.mat": me.plate.mat, "s6b.size": me.plate.size, "s6b.context": me.plate.context, "s6b.coll": me.plate.coll, "s6b.notice": me.plate.notice,
    "s7x.img": { ref: me.img.ref }, "s7.note": "손잡이 안쪽의 마모가 먼저 보이도록 빛을 왼쪽 위에서 주었다. 배경은 기록 사진의 회색 천을 흉내 냈다.",
  } : {};
  cache = { roster, subMap, assessMap, agg, ws };
  return cache;
}

const noop = () => Promise.resolve({});
const WaitCard = ({ text }) => (
  <div className="card as-card"><div className="card-body"><div className="ok-note" role="status">{text}</div></div></div>
);

/* ============================================================ 미리 보기 페이지 */

export function AssessPreviewPage({ cfg, onBack }) {
  const [view, setView] = useState("peer");
  const data = useMemo(previewData, []);
  const { roster, subMap, assessMap, agg, ws } = data;
  const v = VIEWS.find((x) => x.k === view) || VIEWS[0];
  const stageLabel = (STAGES.find((s) => s.k === v.stage) || {}).label || v.stage;

  const sub = subMap[ME] || null;
  const self = (assessMap[ME] && assessMap[ME].self) || {};
  const judge = (assessMap[ME] && assessMap[ME].judge && assessMap[ME].judge.p1) || { items: [] };
  const pairs = roster ? myPairs(roster, ME) : [];
  const n = roster ? (roster.works || []).length : 0;
  const result = agg && agg.results ? agg.results[ME] : null;
  const revealOff = cfg.reveal === "none";

  /* 진행 띠와 화면 — src-assess.jsx AssessTab이 단계·완료 상태로 정하는 것과 같은 규칙을 화면별로 고정해 둔다 */
  let done, avail, cur, screen;
  const D = (...ks) => Object.fromEntries(ks.map((k) => [k, true]));
  switch (v.k) {
    case "submit":
      done = {}; avail = D("submit"); cur = "submit";
      screen = <SubmitScreen key="submit" sid={ME} ws={ws} sub={null} roster={null} stage="submit" sampleMode onSkip={() => {}} />;
      break;
    case "locked":
      done = D("submit"); avail = D("submit"); cur = null;
      screen = <SubmitScreen key="locked" sid={ME} ws={ws} sub={sub} roster={null} stage="submit" sampleMode onSkip={() => {}} />;
      break;
    case "self1":
      done = D("submit"); avail = D("submit", "self1"); cur = "self1";
      screen = <SelfScreen key="self1" sid={ME} phase="s1" block={null} prev={null} n={n} subFail={false} reloadSubs={noop} sampleMode />;
      break;
    case "peer": {
      done = D("submit", "self1"); avail = D("submit", "self1", "peer"); cur = "peer";
      const partial = { ...judge, items: (judge.items || []).slice(0, Math.min(3, Math.max(0, pairs.length - 1))), submittedAt: null };
      screen = roster ? (
        <PeerScreen key="peer" sid={ME} cfg={cfg} roster={roster} jkey="p1" pairs={pairs} block={partial} subMap={subMap} subFail={false} reloadSubs={noop} sampleMode />
      ) : <WaitCard text={waitNote({ stage: "peer", roster: null, pairs: [], s2Done: false, noWork: false })} />;
      break;
    }
    case "peerDone":
      done = D("submit", "self1", "peer"); avail = D("submit", "self1", "peer"); cur = null;
      screen = <WaitCard text={waitNote({ stage: "peer", roster, pairs, s2Done: false, noWork: false })} />;
      break;
    case "self2":
      done = D("submit", "self1", "peer"); avail = D("submit", "self1", "peer", "self2"); cur = "self2";
      screen = <SelfScreen key="self2" sid={ME} phase="s2" block={null} prev={self.s1 || null} n={n} subFail={false} reloadSubs={noop} sampleMode />;
      break;
    case "self2cmp": {
      done = D("submit", "self1", "peer"); avail = D("submit", "self1", "peer", "self2"); cur = "self2";
      const locked = self.s2 ? { ...self.s2, submittedAt: null, changeCode: undefined, changeWhy: undefined } : { lockedAt: "2026-04-02T06:00:00.000Z", scores: {}, why: "" };
      screen = <SelfScreen key="self2cmp" sid={ME} phase="s2" block={locked} prev={self.s1 || null} n={n} subFail={false} reloadSubs={noop} sampleMode />;
      break;
    }
    default: {
      const off = revealOff || !result;
      done = D("submit", "self1", "peer", "self2");
      avail = off ? D("submit", "self1", "peer", "self2") : D("submit", "self1", "peer", "self2", "result");
      cur = off ? null : "result";
      screen = off
        ? <WaitCard text={waitNote({ stage: "result", roster, pairs, s2Done: true, noWork: false })} />
        : <ResultScreen key={"result-" + cfg.reveal} cfg={cfg} result={result} self={self} />;
    }
  }

  return (
    <div className="ap-page">
      <AssessPreviewStyle />
      <div className="ap-bar">
        <div className="ap-bar-l">
          <div className="ap-t">학생 화면 미리 보기</div>
          <div className="hint">
            표본 학급(학번 {PREVIEW_IDS[0]}~{PREVIEW_IDS[PREVIEW_IDS.length - 1]}, 작품 10점)의 학생 <span className="mono">{ME}</span>(작품 {sub ? sub.no : "-"}) 자리에서 봅니다.
            질문 · 이유 최소 글자 수 · 최소 판정 시간 · 확신도 · 공개 범위는 지금 「상호평가 1」의 설정값(저장 전 편집 포함)을 따르고, 여기서는 아무것도 저장되지 않습니다.
            「닫힘」 단계에서는 학생 화면에 「최종 평가」 탭 자체가 나타나지 않습니다.
          </div>
        </div>
        <button type="button" className="btn small" onClick={onBack}>교사 화면으로</button>
      </div>

      <div className="ap-views" role="tablist" aria-label="미리 볼 화면">
        {VIEWS.map((x) => (
          <button key={x.k} type="button" role="tab" aria-selected={x.k === view} className={x.k === view ? "on" : ""} onClick={() => setView(x.k)}>{x.label}</button>
        ))}
      </div>
      <p className="hint ap-tip"><b>단계 「{stageLabel}」</b> · {v.tip}</p>

      <div className="ap-frame">
        <div className="ap-frame-h">
          <span className="ap-chip">학생 화면</span>
          <span className="ap-tabs" aria-hidden="true">
            {["1차시", "…", "8차시"].map((t) => <span key={t} className="ap-tab">{t}</span>)}
            <span className="ap-tab on">● 최종 평가</span>
          </span>
        </div>
        <div className="as-tab">
          <StepStrip cur={cur} done={done} avail={avail} noWork={false} />
          {screen}
        </div>
      </div>
      <p className="hint" style={{ marginTop: 10 }}>
        비교 화면의 두 작품은 폭 640px 이하(휴대전화)에서 위아래로 놓입니다. 창을 좁혀 보면 그 배치도 확인할 수 있습니다.
        그림은 표본용 자리표시이고, 실제 화면에는 학생이 제출한 대표 이미지(긴 변 1000px 사본)가 같은 칸(4:3)에 들어갑니다.
      </p>
    </div>
  );
}

/* ---------- 스타일 ---------- */

const ASSESS_PREVIEW_CSS = `
.ap-page{margin-bottom:24px}
.ap-bar{display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap;border:1px solid var(--line);background:var(--card);padding:12px 16px;margin-bottom:12px}
.ap-bar-l{flex:1 1 320px;min-width:0}
.ap-t{font-family:var(--serif);font-size:15px;font-weight:700;margin-bottom:4px}
.ap-views{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px}
.ap-views button{padding:6px 12px;border:1px solid var(--line);background:#fff;font-family:var(--sans);font-size:12.5px;color:var(--ink);cursor:pointer}
.ap-views button:hover{border-color:var(--ink)}
.ap-views button.on{background:var(--ink);border-color:var(--ink);color:#fff}
.ap-views button:focus-visible{outline:2px solid var(--ink);outline-offset:1px}
.ap-tip{margin-bottom:12px;font-size:12px}
.ap-frame{max-width:880px;margin:0 auto;border:1px dashed var(--line);background:var(--bg);padding:0 16px 24px}
.ap-frame-h{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 16px;margin:0 -16px 14px;border-bottom:1px solid var(--line);background:var(--card)}
.ap-chip{font-family:var(--mono);font-size:10px;letter-spacing:.15em;color:var(--sub);border:1px solid var(--line);padding:2px 7px}
.ap-tabs{display:flex;gap:4px;flex-wrap:wrap}
.ap-tab{font-size:11px;color:var(--sub);border:1px solid var(--line2);padding:2px 8px;background:var(--card2)}
.ap-tab.on{color:var(--card);background:var(--ink);border-color:var(--ink)}
@media(max-width:640px){.ap-views button{flex:1 1 40%}}
`;

export function AssessPreviewStyle() { return <style>{ASSESS_PREVIEW_CSS}</style>; }
