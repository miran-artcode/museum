/* ============================================================
   최종 작품 상호평가 — 학생 화면
   제출 · 자기평가 ① · 동료 비교(쌍대비교) · 자기평가 ② · 결과

   설계 근거: 최종작품_상호평가_설계.md §2·§3, pairwise-research/research-design.md §4.
   계약: ASSESS_CONTRACT.md §1~§3 — 여기서는 src-assess-core.mjs의 상수·순수 함수와
   src-fb.js의 fbStore, src-survey-ui.jsx의 LikertRow만 가져다 쓴다(src-app.jsx는 순환이라 금지).

   화면 원칙
   - 학생은 "지금 할 일" 하나만 본다. 단계는 교사 설정(config.peer.stage)과 학생 자신의
     완료 상태를 함께 보고 정한다 — 앞 단계를 빠뜨린 학생은 교사가 뒤 단계를 열어도 앞 단계부터.
   - 비교 화면의 두 작품은 같은 크기(4:3, object-fit: contain)로, 작품 번호만 보인다.
     작품 캡션은 접힌 채 시작하고, AI 활용 범위·허구 고지·aiLevel·작가 학번·작가 노트는
     어느 화면에도 내지 않는다.
   - 자기평가 ②는 ①의 답을 보지 않은 채 답하고 먼저 굳힌 뒤에야 ①과 나란히 본다.
     점수가 달라져야 한다는 암시("다시·향상·발전")를 쓰지 않는다.
   - 저장 실패는 alert가 아니라 카드 안 warn-note와 「다시 저장」으로 알린다.
   ============================================================ */

import React, { useState, useEffect, useRef, useMemo } from "react";
import { fbStore } from "./src-fb.js";
import { LikertRow } from "./src-survey-ui.jsx";
import {
  ASSESS_VER, CRITERIA, SELF_ITEMS, SELF_LABELS, CONF_LABELS, CHANGE_CODES,
  stageAtLeast, peerCfg, MIN_WHY_CHANGE, REASON_MAX, DUP_SIM,
  submissionFromWs, myPairs, simText, predPctOf, judgeBlockOf,
} from "./src-assess-core.mjs";

/* ---------- 잔가지 ---------- */

const nowISO = () => new Date().toISOString();
const fmtT = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, "0");
  return p(d.getMonth() + 1) + "/" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
};
const durOf = (from, to) => Math.max(0, Math.round((new Date(to) - new Date(from)) / 1000));

const SELF_MIN_WHY = 15;        // 자기평가 근거 최소 글자 수 (계약 §3)
const SELF_WHY_MAX = 300;
const SUB_MAX_PX = 1000;        // 제출 사본의 긴 변
const SUB_MAX_CHARS = 300000;   // dataURL 글자 수 상한 — 규칙의 문서 크기 상한 안에 넉넉히
const RANK_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);   // 슬라이더를 실제로 움직이는 키만
const PAIR_STACK_PX = 640;      // 이 폭 이하에서는 두 작품이 위아래로 놓인다 (CSS의 640px와 같아야 한다)

const STEPS = [
  { k: "submit", label: "제출" }, { k: "self1", label: "자기평가 ①" }, { k: "peer", label: "동료 비교" },
  { k: "self2", label: "자기평가 ②" }, { k: "result", label: "결과" },
];

/* 펼쳤을 때 보이는 작품 캡션 줄 — aiScope·notice는 일부러 없다 (고지가 판정을 물들이지 않도록) */
const PLATE_ROWS = [
  ["relic", "유물 명칭"], ["year", "발굴 연도"], ["era", "추정 연대"], ["mat", "재질"],
  ["size", "크기"], ["context", "출토 맥락"], ["coll", "소장"],
];

/* 이미지 캐시 — 같은 작품을 두 번 보면 한 번만 읽는다. 실패(null)는 담아 두지 않아 다음에 다시 읽는다 */
const imgCache = new Map();
function loadImg(owner, ref) {
  const key = owner + "_" + ref;
  if (!imgCache.has(key)) {
    imgCache.set(key, fbStore.get("media:" + key).then((v) => {
      const ok = typeof v === "string" && v.length > 0;
      if (!ok) imgCache.delete(key);
      return ok ? v : null;
    }).catch(() => { imgCache.delete(key); return null; }));
  }
  return imgCache.get(key);
}

/* 학급 제출 전체. 읽기 실패는 빈 지도가 아니라 null로 돌려준다 — 빈 지도로 오인하면
   등수 예측의 분모가 0이 되어 그 문항이 조용히 사라지고, 제출 뒤에는 되돌릴 수 없다 */
const allSubs = () => {
  if (typeof fbStore.allOfSafe === "function") {
    return fbStore.allOfSafe("submissions").then((r) => (r && r.ok && r.data && typeof r.data === "object" ? r.data : null)).catch(() => null);
  }
  if (typeof fbStore.allOf === "function") return fbStore.allOf("submissions").then((m) => (m && typeof m === "object" ? m : null)).catch(() => null);
  return Promise.resolve(null);
};

/* 제출 사본 만들기 — 긴 변 SUB_MAX_PX, JPEG 품질을 낮춰 가며 SUB_MAX_CHARS 안에 넣는다.
   그래도 크면 한 단계 작은 변으로 다시 시도한다. 비교가 도는 동안 원본이 바뀌어도
   모든 판정자가 같은 사본을 보게 하려고 따로 저장한다 */
function reencode(dataURL) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
      if (!w0 || !h0) { rej(new Error("empty")); return; }
      for (const px of [SUB_MAX_PX, 800, 640]) {
        const sc = Math.min(1, px / Math.max(w0, h0));
        const cv = document.createElement("canvas");
        cv.width = Math.max(1, Math.round(w0 * sc));
        cv.height = Math.max(1, Math.round(h0 * sc));
        const ctx = cv.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, cv.width, cv.height); // PNG의 투명 영역이 JPEG에서 검게 되지 않도록
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        for (let q = 0.85; q >= 0.3; q -= 0.1) {
          const d = cv.toDataURL("image/jpeg", q);
          if (d.length <= SUB_MAX_CHARS) { res({ data: d, w: cv.width, h: cv.height }); return; }
        }
      }
      rej(new Error("too big"));
    };
    img.onerror = () => rej(new Error("decode fail"));
    img.src = dataURL;
  });
}

/* 지금 할 일이 없을 때의 안내 — 교사 단계별로 무엇을 기다리는지 말해 준다 */
function waitNote({ stage, roster, pairs, s2Done, noWork }) {
  if (stage === "submit") return "제출을 마쳤습니다. 자기평가는 선생님이 열면 이 자리에 나타납니다.";
  if (stage === "self1") return noWork ? "제출을 건너뛰었습니다. 동료 비교는 선생님이 열면 이 자리에 나타납니다." : "자기평가 ①을 제출했습니다. 동료 비교는 선생님이 열면 이 자리에 나타납니다.";
  if (stage === "peer") {
    if (!roster) return "비교 명단이 아직 확정되지 않았습니다. 선생님이 명단을 확정하면 비교할 쌍이 여기에 나타납니다.";
    if (!pairs.length) return "이번 회차에 배정된 비교 쌍이 없습니다. 선생님께 알려 주세요.";
    return noWork ? "동료 비교를 마쳤습니다. 제출한 작품이 없어 자기평가와 내 작품 결과는 없습니다." : "동료 비교를 마쳤습니다. 자기평가 ②는 선생님이 열면 이 자리에 나타납니다.";
  }
  if (stage === "self2") return noWork ? "동료 비교를 마쳤습니다. 제출한 작품이 없어 자기평가와 내 작품 결과는 없습니다." : s2Done ? "자기평가 ②를 제출했습니다. 결과는 선생님이 공개하면 이 자리에 나타납니다." : "지금 할 일이 없습니다.";
  if (stage === "result") return noWork ? "제출한 작품이 없어 내 작품 결과는 없습니다. 판정에 참여해 주어 고맙습니다." : "공개된 결과가 아직 없습니다. 선생님이 집계를 마치고 공개하면 이 자리에 나타납니다.";
  return "지금 할 일이 없습니다. 다음 단계는 선생님이 열면 나타납니다.";
}

/* ============================================================
   탭 본체 — 구독·단계 결정·진행 띠
   ============================================================ */

export function AssessTab({ me, ws, cfgAll, sampleMode }) {
  const sid = me && me.sid ? String(me.sid) : "";
  const cfg = peerCfg(cfgAll);
  const stage = cfg.stage;
  const [roster, setRoster] = useState(null);
  const [assess, setAssess] = useState(null);
  const [sub, setSub] = useState(null);
  const [got, setGot] = useState({ assess: false, sub: false });
  const [slow, setSlow] = useState(false);
  /* 제출 없이 판정에만 참여 — 이 브라우저 탭이 살아 있는 동안 기억한다 (아무것도 저장하지 않는다) */
  const [skipSub, setSkipSubState] = useState(() => { try { return sessionStorage.getItem("as-skip:" + sid) === "1"; } catch (e) { return false; } });
  const setSkipSub = (v) => { setSkipSubState(v); try { if (v) sessionStorage.setItem("as-skip:" + sid, "1"); else sessionStorage.removeItem("as-skip:" + sid); } catch (e) {} };
  const [subMap, setSubMap] = useState(null);
  const subReq = useRef(null);

  useEffect(() => {
    if (!sid) return undefined;
    if (sampleMode) { setGot({ assess: true, sub: true }); return undefined; }
    const u1 = fbStore.watchDoc("peerRoster", (v) => setRoster(v && typeof v === "object" ? v : null));
    const u2 = fbStore.watchDoc("assess:" + sid, (v) => { setAssess(v && typeof v === "object" ? v : null); setGot((g) => (g.assess ? g : { ...g, assess: true })); });
    const u3 = fbStore.watchDoc("sub:" + sid, (v) => { setSub(v && typeof v === "object" ? v : null); setGot((g) => (g.sub ? g : { ...g, sub: true })); });
    const t = setTimeout(() => setSlow(true), 8000);
    return () => { u1(); u2(); u3(); clearTimeout(t); };
  }, [sid, sampleMode]);

  /* 학급 제출 지도 — 명단이 확정·재확정될 때마다 다시 읽는다(확정 직전에 들어온 제출이 빠지지 않도록).
     실패(null)는 기억하지 않아 다음 호출이 다시 읽고, 이미 있는 지도는 다시 읽는 동안 지우지 않는다 */
  const [subFail, setSubFail] = useState(false);
  const subVer = useRef(null);
  const fetchSubs = () => {
    subReq.current = allSubs().then((m) => {
      if (m) { setSubMap(m); setSubFail(false); } else { setSubFail(true); subReq.current = null; }
      return m;
    });
    return subReq.current;
  };
  const loadSubs = () => {
    if (sampleMode) return Promise.resolve({});
    const ver = (roster && roster.fixedAt) || "";
    if (subReq.current && subVer.current === ver) return subReq.current;
    subVer.current = ver;
    return fetchSubs();
  };
  const reloadSubs = () => (sampleMode ? Promise.resolve({}) : fetchSubs());
  const rosterVer = (roster && roster.fixedAt) || "";
  useEffect(() => { if (sid && stageAtLeast(stage, "self1")) loadSubs(); }, [sid, stage, rosterVer]); // eslint-disable-line
  // 연결이 돌아오면 실패한 읽기를 다시 시도한다
  useEffect(() => {
    if (!subFail) return undefined;
    const again = () => { if (sid && stageAtLeast(stage, "self1")) reloadSubs(); };
    window.addEventListener("online", again);
    const t = setTimeout(again, 6000);
    return () => { window.removeEventListener("online", again); clearTimeout(t); };
  }, [subFail]); // eslint-disable-line

  const pairs = useMemo(() => {
    if (!roster || !sid) return [];
    try { return myPairs(roster, sid) || []; } catch (e) { return []; }
  }, [roster, sid]);

  if (!sid || stage === "closed") return null;

  const self = (assess && assess.self) || {};
  /* 판정 블록은 명단(회차)마다 따로다 — 명단이 다시 확정되면 새 자리에 쌓고 옛 판정은 그대로 남긴다 */
  const jb = roster ? judgeBlockOf(assess, roster) : { key: "p1", block: null };
  const p1 = jb.block, jkey = jb.key;
  const subDone = !!(sub && sub.locked);
  const noWork = skipSub && !subDone;      // 제출하지 않고 판정에만 참여하는 학생
  const s1Done = !!(self.s1 && self.s1.submittedAt);
  const p1Done = !!(p1 && p1.submittedAt);
  const s2Done = !!(self.s2 && self.s2.submittedAt);
  const resultOk = !!(assess && assess.result) && (!roster || !assess.result.rosterVer || assess.result.rosterVer === roster.fixedAt);
  const hasResult = stage === "result" && resultOk && cfg.reveal !== "none";

  /* 자기평가는 제출한 작품이 있어야 한다 — 없는 작품에 점수를 매기게 하면 지어낸 값이 자료에 섞인다 */
  const avail = {
    submit: true,
    self1: stageAtLeast(stage, "self1") && subDone,
    peer: stageAtLeast(stage, "peer") && !!roster && pairs.length > 0,
    self2: stageAtLeast(stage, "self2") && subDone,
    result: hasResult,
  };
  const done = { submit: subDone || skipSub, self1: s1Done, peer: p1Done, self2: s2Done, result: false };
  const cur = STEPS.map((s) => s.k).find((k) => avail[k] && !done[k]) || null;

  /* 등수 예측의 분모 — 명단이 굳었으면 명단 크기, 아니면 잠긴 제출 수. null이면 아직 모른다 */
  const n = roster && roster.fixedAt
    ? (roster.works || []).length
    : subMap ? Object.keys(subMap).filter((k) => subMap[k] && subMap[k].locked).length : null;
  const subsNote = subFail && !subMap ? (
    <div className="warn-note" role="alert" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ flex: 1, minWidth: 200 }}>우리 반 작품 목록을 불러오지 못했습니다. 인터넷 연결을 확인해 주세요 — 연결되면 다시 시도합니다.</span>
      <button type="button" className="btn small" onClick={reloadSubs}>다시 불러오기</button>
    </div>
  ) : null;

  let screen;
  if (!got.assess || !got.sub) {
    screen = (
      <div className="card as-card"><div className="card-body" style={{ color: "var(--sub)", fontSize: 13 }}>
        평가 기록을 불러오는 중… 잠시만 기다려 주세요.
        {slow && <div className="warn-note" style={{ marginTop: 10 }}>연결이 느립니다. 인터넷 연결을 확인해 주세요 — 연결되면 자동으로 이어집니다.</div>}
      </div></div>
    );
  } else if (cur === "submit" || (stage === "submit" && subDone)) {
    screen = <SubmitScreen sid={sid} ws={ws} sub={sub} roster={roster} stage={stage} sampleMode={sampleMode} onSkip={() => setSkipSub(true)} />;
  } else if (cur === "self1") {
    screen = <SelfScreen key="s1" sid={sid} phase="s1" block={self.s1} prev={null} n={n} subFail={subFail} reloadSubs={reloadSubs} sampleMode={sampleMode} />;
  } else if (cur === "peer") {
    screen = <PeerScreen key={"p-" + (roster.fixedAt || "") + "-" + (roster.hash || "")} sid={sid} cfg={cfg} roster={roster} jkey={jkey}
      pairs={pairs} block={p1} subMap={subMap} subFail={subFail} reloadSubs={reloadSubs} sampleMode={sampleMode} />;
  } else if (cur === "self2") {
    screen = <SelfScreen key="s2" sid={sid} phase="s2" block={self.s2} prev={self.s1 || null} n={n} subFail={subFail} reloadSubs={reloadSubs} sampleMode={sampleMode} />;
  } else if (cur === "result") {
    screen = <ResultScreen cfg={cfg} result={assess.result} self={self} />;
  } else {
    screen = <div className="card as-card"><div className="card-body"><div className="ok-note" role="status">{waitNote({ stage, roster, pairs, s2Done, noWork })}</div></div></div>;
  }

  return (
    <div className="as-tab">
      <ol className="as-strip" aria-label="최종 평가 진행">
        {STEPS.map((s) => {
          const skipped = noWork && (s.k === "submit" || s.k === "self1" || s.k === "self2");
          const st = s.k === cur ? "cur" : skipped ? "skip" : done[s.k] ? "done" : avail[s.k] ? "open" : "lock";
          const mark = st === "done" ? "✓" : st === "cur" ? "●" : st === "skip" ? "–" : "○";
          const say = st === "done" ? " (마침)" : st === "cur" ? " (지금)" : st === "skip" ? " (건너뜀)" : st === "lock" ? " (아직 열리지 않음)" : "";
          return (
            <li key={s.k} className={"as-step " + st} aria-current={st === "cur" ? "step" : undefined}>
              <i aria-hidden="true">{mark}</i>{s.label}<span className="as-sr">{say}</span>
            </li>
          );
        })}
      </ol>
      {sampleMode && <div className="warn-note">예시 화면입니다 — 여기서는 아무것도 저장되지 않습니다.</div>}
      {subsNote}
      {screen}
    </div>
  );
}

/* ============================================================
   1. 제출 — 기록지의 초안을 확인·수정하고 확정한다
   ============================================================ */

function SubmitScreen({ sid, ws, sub, roster, stage, sampleMode, onSkip }) {
  const draft = useMemo(() => { try { return submissionFromWs(ws || {}, sid) || {}; } catch (e) { return {}; } }, [ws, sid]);
  const [d, setD] = useState(() => ({ no: draft.no || "", title: draft.title || "", plate: { ...(draft.plate || {}) }, note: draft.note || "" }));
  const [img, setImg] = useState(undefined);   // undefined 읽는 중 · null 없음/실패 · 문자열 dataURL
  const [busy, setBusy] = useState(false);
  const [warn, setWarn] = useState("");
  const locked = !!(sub && sub.locked);
  /* 잠긴 제출은 굳힌 사본(sub.img)을, 초안은 기록지의 대표 이미지를 보여 준다 */
  const src = locked && sub.img ? sub.img : draft.img;
  const owner = src && src.owner ? String(src.owner) : sid;
  const ref = src && src.ref ? String(src.ref) : "";

  useEffect(() => {
    let live = true;
    if (!ref) { setImg(null); return undefined; }
    setImg(undefined);
    loadImg(owner, ref).then((v) => { if (live) setImg(v || null); });
    return () => { live = false; };
  }, [owner, ref]);

  const plateRows = (plate) => PLATE_ROWS.filter(([k]) => plate && String(plate[k] || "").trim())
    .map(([k, label]) => <React.Fragment key={k}><dt>{label}</dt><dd>{plate[k]}</dd></React.Fragment>);

  if (locked) {
    return (
      <div className="card as-card">
        <div className="card-head">
          <span className="card-code">제출</span><span className="card-title">최종 작품 제출</span>
          <span className="card-sess">{fmtT(sub.submittedAt)} 확정</span>
        </div>
        <div className="card-body">
          <div className="ok-note">제출이 확정되어 잠겼습니다. 고치려면 선생님께 해제를 요청하세요.</div>
          <div className="as-sub-grid">
            <div className="as-sub-img">
              {img ? <img src={img} alt="제출한 대표 이미지" /> : <span className="ph">{img === undefined ? "불러오는 중…" : "이미지 없음"}</span>}
            </div>
            <div>
              <div className="as-work-h">작품 {sub.no}</div>
              <div className="as-title">「{sub.title || "무제"}」</div>
              <dl className="as-dl">{plateRows(sub.plate)}</dl>
            </div>
          </div>
          {stage === "submit" && <p className="hint" style={{ marginTop: 12 }}>자기평가는 선생님이 열면 이 자리에 나타납니다.</p>}
        </div>
      </div>
    );
  }

  const setP = (k, v) => { setD((x) => ({ ...x, plate: { ...x.plate, [k]: v } })); setWarn(""); };
  const notInRoster = !!(roster && roster.fixedAt && !(roster.works || []).some((w) => w && String(w.sid) === sid));
  const canSkip = stageAtLeast(stage, "self1");

  const submit = async () => {
    if (sampleMode) { setWarn("예시 화면에서는 저장되지 않습니다."); return; }
    if (!d.no.trim()) { setWarn("작품 번호가 비어 있습니다. 7차시 「전시 출품」에서 받은 번호를 적어 주세요."); return; }
    if (!d.title.trim()) { setWarn("작품 제목을 적어 주세요."); return; }
    if (img === undefined) { setWarn("대표 이미지를 아직 읽는 중입니다. 잠시 뒤 다시 눌러 주세요."); return; }
    if (!img) { setWarn("대표 이미지가 없어 제출할 수 없습니다. 7차시 「전시 출품」에서 대표 이미지를 먼저 올린 뒤 이 화면으로 돌아오세요."); return; }
    if (!window.confirm("제출을 확정하면 이 내용이 그대로 굳어 우리 반의 비교 대상이 됩니다. 고치려면 선생님께 해제를 요청해야 합니다. 지금 확정할까요?")) return;
    setBusy(true); setWarn("");
    let enc;
    try { enc = await reencode(img); }
    catch (e) { setWarn("이미지를 줄이는 데 실패했습니다. 7차시 「전시 출품」에서 대표 이미지를 다시 올린 뒤 시도해 주세요."); setBusy(false); return; }
    const refId = "asm." + Date.now();
    const ok1 = await fbStore.setT("media:" + sid + "_" + refId, enc.data, { timeout: 15000 });
    if (!ok1) { setWarn("이미지를 저장하지 못했습니다. 연결을 확인하고 다시 눌러 주세요."); setBusy(false); return; }
    const plate = {};
    PLATE_ROWS.forEach(([k]) => { plate[k] = String(d.plate[k] || "").trim(); });
    plate.notice = String(d.plate.notice || "").trim();
    const doc = {
      ver: ASSESS_VER, no: d.no.trim(), title: d.title.trim(), plate,
      aiLevel: draft.aiLevel || "", note: String(d.note || "").trim(),
      img: { owner: sid, ref: refId }, imgW: enc.w, imgH: enc.h,
      submittedAt: nowISO(), locked: true,
    };
    const ok2 = await fbStore.setT("sub:" + sid, doc);
    setBusy(false);
    if (!ok2) setWarn("제출을 저장하지 못했습니다. 연결을 확인하고 「제출 확정」을 다시 눌러 주세요. 적은 내용은 이 화면에 그대로 남아 있습니다.");
  };

  return (
    <div className="card as-card">
      <div className="card-head"><span className="card-code">제출</span><span className="card-title">최종 작품 제출</span></div>
      <div className="card-note">
        7차시까지 쓴 제목·작품 캡션·대표 이미지를 그대로 가져왔습니다. 여기서 고친 뒤 「제출 확정」을 누르면
        이 내용이 그대로 굳어 우리 반의 비교 대상이 됩니다. 비교 화면에는 작품 번호와 이미지, 펼쳤을 때의 작품 캡션만 보입니다.
      </div>
      <div className="card-body">
        {notInRoster && (
          <div className="warn-note">비교 명단이 이미 확정되어 이번 회차에서는 내 작품이 비교되지 않습니다. 제출은 기록으로 남고, 판정에는 그대로 참여합니다.</div>
        )}
        <div className="as-sub-grid">
          <div>
            <div className="as-sub-img">
              {img ? <img src={img} alt="대표 이미지" /> : <span className="ph">{img === undefined ? "불러오는 중…" : "이미지 없음"}</span>}
            </div>
            {img === null && (
              <div className="warn-note" style={{ marginTop: 8 }}>대표 이미지가 없거나 불러오지 못했습니다. 7차시 「전시 출품」에서 대표 이미지를 먼저 올려 주세요.</div>
            )}
          </div>
          <div className="as-grid2">
            <div className="field"><label>작품 번호</label>
              <input value={d.no} maxLength={20} onChange={(e) => { setD((x) => ({ ...x, no: e.target.value })); setWarn(""); }} placeholder="예: A-03" /></div>
            <div className="field"><label>작품 제목</label>
              <input value={d.title} maxLength={60} onChange={(e) => { setD((x) => ({ ...x, title: e.target.value })); setWarn(""); }} /></div>
            {PLATE_ROWS.map(([k, label]) => (
              <div className={"field" + (k === "context" ? " span2" : "")} key={k}><label>{label}</label>
                {k === "context"
                  ? <textarea rows={2} maxLength={300} value={d.plate[k] || ""} onChange={(e) => setP(k, e.target.value)} />
                  : <input value={d.plate[k] || ""} maxLength={80} onChange={(e) => setP(k, e.target.value)} />}
              </div>
            ))}
            <div className="field span2"><label>허구 고지 문구 <span className="hint">— 비교 화면에는 보이지 않고, 전시와 결과에만 쓰입니다</span></label>
              <input value={d.plate.notice || ""} maxLength={120} onChange={(e) => setP("notice", e.target.value)} /></div>
          </div>
        </div>
        <div className="field" style={{ marginTop: 6 }}>
          <label>작가 노트 <span className="hint">— 7차시 기록에서 가져옴. 비교 화면에는 보이지 않습니다</span></label>
          <textarea rows={3} maxLength={1200} value={d.note} onChange={(e) => { setD((x) => ({ ...x, note: e.target.value })); setWarn(""); }} />
        </div>
        {warn && <div className="warn-note" role="alert">{warn}</div>}
        <div className="sv-foot">
          <button className="btn" disabled={busy || sampleMode} onClick={submit}>{busy ? "저장 중…" : "제출 확정"}</button>
          {canSkip && <button type="button" className="btn ghost" disabled={busy || sampleMode} onClick={onSkip}>제출하지 않고 다음 단계로</button>}
          <span className="hint">확정하면 고칠 수 없습니다. 이미지는 긴 변 {SUB_MAX_PX}px로 줄인 사본을 따로 저장합니다.{canSkip ? " 제출하지 않아도 판정에는 참여합니다." : ""}</span>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   2·4. 자기평가 ①·② — 같은 다섯 문항, 근거 한 문장, 등수 예측
   ②는 ①을 보지 않고 답한 뒤 「현재 점수 확정」으로 굳히고, 그다음에야 ①과 나란히 본다
   ============================================================ */

function SelfScreen({ sid, phase, block, prev, n, subFail, reloadSubs, sampleMode }) {
  const isS2 = phase === "s2";
  const b = block || {};
  const locked = isS2 && !!b.lockedAt;
  const [scores, setScores] = useState({});
  const [why, setWhy] = useState("");
  const [rank, setRank] = useState(null);          // null = 아직 손잡이를 잡지 않음
  const [code, setCode] = useState(null);
  const [cwhy, setCwhy] = useState("");
  const [busy, setBusy] = useState(false);
  const [warn, setWarn] = useState("");
  const startRef = useRef(b.startedAt || nowISO());
  const nOk = typeof n === "number" && n >= 2;
  const rankShown = nOk ? Math.min(n, Math.max(1, rank == null ? Math.ceil(n / 2) : rank)) : null;
  const answered = SELF_ITEMS.every((it) => scores[it.k] >= 1);

  const check = () => {
    if (sampleMode) return "예시 화면에서는 저장되지 않습니다.";
    if (!answered) return "다섯 문항에 모두 답해 주세요.";
    if (why.trim().length < SELF_MIN_WHY) return "근거를 " + SELF_MIN_WHY + "자 이상 적어 주세요.";
    if (n == null) return subFail ? "우리 반 작품 목록을 불러오지 못해 등수 예측을 받을 수 없습니다. 「다시 불러오기」를 눌러 주세요." : "우리 반 작품 수를 세는 중입니다. 잠시 뒤 다시 눌러 주세요.";
    if (nOk && rank == null) return "등수 예측 손잡이를 움직여 자리를 정해 주세요.";
    return "";
  };
  const body = () => ({
    scores: { ...scores }, why: why.trim(),
    predRank: nOk ? rankShown : null, n: nOk ? n : (n || 0),
    predPct: nOk ? predPctOf(rankShown, n) : null,
    startedAt: startRef.current,
  });
  /* 바꾸는 블록만 merge로 보낸다 — self.s1 / self.s2 */
  const save = async (v) => {
    setBusy(true); setWarn("");
    const ok = await fbStore.setT("assess:" + sid, { ver: ASSESS_VER, self: { [phase]: v } }, { merge: true });
    setBusy(false);
    if (!ok) setWarn("저장하지 못했습니다. 연결을 확인하고 다시 눌러 주세요 — 적은 내용은 이 화면에 그대로 남아 있습니다.");
    return ok;
  };
  const submit1 = async () => {
    const e = check(); if (e) { setWarn(e); return; }
    if (!window.confirm("제출하면 답을 고칠 수 없습니다. 지금 제출할까요?")) return;
    const p = body(); const at = nowISO();
    await save({ ...p, submittedAt: at, durSec: durOf(p.startedAt, at) });
  };
  const lock2 = async () => {
    const e = check(); if (e) { setWarn(e); return; }
    if (!window.confirm("확정하면 점수와 근거를 고칠 수 없습니다. 지금 확정할까요?")) return;
    const p = body();
    await save({ ...p, lockedAt: nowISO(), submittedAt: null });
  };
  const submit2 = async () => {
    if (sampleMode) { setWarn("예시 화면에서는 저장되지 않습니다."); return; }
    if (!code) { setWarn("네 가지 가운데 하나를 골라 주세요."); return; }
    const needWhy = code !== "unclear";
    if (needWhy && cwhy.trim().length < MIN_WHY_CHANGE) { setWarn("고른 사유를 내 작품의 구체적인 근거와 이어 " + MIN_WHY_CHANGE + "자 이상 적어 주세요."); return; }
    const at = nowISO();
    await save({ changeCode: code, changeWhy: needWhy ? cwhy.trim() : "", submittedAt: at, durSec: durOf(b.startedAt || startRef.current, at) });
  };

  /* ---- ② 확정 뒤: ①과 나란히 보고 변화 사유를 고른다 ---- */
  if (locked) {
    const pv = prev || null;
    const sc = (blk, k) => (blk && blk.scores && blk.scores[k] >= 1 ? blk.scores[k] : "–");
    const rk = (blk) => (blk && blk.predRank ? blk.predRank + "번째쯤" : "–");
    return (
      <div className="card as-card">
        <div className="card-head"><span className="card-code">자기평가 ②</span><span className="card-title">처음 평가와 나란히 보기</span></div>
        <div className="card-note">
          점수와 근거는 확정되었습니다. 아래에 처음 평가(①)와 이번 평가(②)를 나란히 놓았습니다.
          달라졌든 같든 어느 쪽이 더 낫거나 못한 것이 아닙니다 — 이번 판단이 처음과 견주어 어떻게 느껴졌는지만 답해 주세요.
        </div>
        <div className="card-body">
          <table className="as-cmp">
            <thead><tr><th>문항</th><th className="as-sc">①</th><th className="as-sc" aria-hidden="true" /><th className="as-sc">②</th></tr></thead>
            <tbody>
              {SELF_ITEMS.map((it) => (
                <tr key={it.k}><td>{it.label}</td><td className="as-sc">{sc(pv, it.k)}</td><td className="as-sc as-arrow" aria-hidden="true">→</td><td className="as-sc">{sc(b, it.k)}</td></tr>
              ))}
              <tr><td>등수 예측{b.n ? " (" + b.n + "점 가운데)" : ""}</td><td className="as-sc">{rk(pv)}</td><td className="as-sc as-arrow" aria-hidden="true">→</td><td className="as-sc">{rk(b)}</td></tr>
            </tbody>
          </table>
          <div className="as-why2">
            <div><span className="as-lab">① 근거</span>{pv && pv.why ? pv.why : "기록 없음"}</div>
            <div><span className="as-lab">② 근거</span>{b.why || ""}</div>
          </div>
          <div className="field" style={{ marginTop: 14 }}>
            <label>이번 판단 과정이 처음 평가와 견주어 어떻게 느껴졌나요?</label>
            <div className="as-opts as-col" role="radiogroup" aria-label="처음 평가와 견준 느낌">
              {CHANGE_CODES.map((c) => (
                <button type="button" key={c.k} role="radio" aria-checked={code === c.k} className={code === c.k ? "on" : ""}
                  onClick={() => { setCode(c.k); setWarn(""); }}>{c.label}</button>
              ))}
            </div>
            <span className="hint">비교 활동 때문이라고 미리 가정하지 마세요. 어느 답도 더 낫거나 못한 답이 아닙니다.</span>
          </div>
          {code && code !== "unclear" && (
            <div className="field">
              <label>고른 사유를 내 작품에서 확인되는 구체적인 근거와 이어서 적어 주세요 ({MIN_WHY_CHANGE}자 이상)</label>
              <textarea rows={2} maxLength={SELF_WHY_MAX} value={cwhy} onChange={(e) => { setCwhy(e.target.value); setWarn(""); }} />
              <span className={"as-count" + (cwhy.trim().length < MIN_WHY_CHANGE ? " low" : "")}>{cwhy.trim().length} / {SELF_WHY_MAX}</span>
            </div>
          )}
          {warn && <div className="warn-note" role="alert">{warn}</div>}
          <div className="sv-foot">
            <button className="btn" disabled={busy || sampleMode} onClick={submit2}>{busy ? "저장 중…" : "제출"}</button>
            <span className="hint">제출하면 고칠 수 없습니다.</span>
          </div>
        </div>
      </div>
    );
  }

  /* ---- ①, 또는 ②의 눈가림 응답 — 화면 구성이 완전히 같다. ①의 값은 어디에도 내지 않는다 ---- */
  return (
    <div className="card as-card">
      <div className="card-head">
        <span className="card-code">{isS2 ? "자기평가 ②" : "자기평가 ①"}</span>
        <span className="card-title">내 작품을 다섯 문항으로 보기</span>
        <span className="card-sess">5문항 · 약 5분</span>
      </div>
      <div className="card-note">
        정답이 없고 성적과 관계없습니다. 지금 보는 내 작품을 기준으로, 문장마다 얼마나 그런지 고르세요.
        {isS2 ? " 처음 평가와 같은 문항입니다. 처음에 무엇이라 답했는지 기억해 맞출 필요는 없습니다." : ""}
      </div>
      <div className="card-body">
        <div className="sv-legend">{SELF_LABELS.map((l, i) => <span key={l}><b>{i + 1}</b>{l}</span>)}</div>
        {SELF_ITEMS.map((it, i) => (
          <div className="sv-item as-item" key={it.k}>
            <div className="sv-q">
              <span className="sv-n">{String(i + 1).padStart(2, "0")}</span><b>{it.label}</b>
              <span className="as-qt">{it.text}</span>
            </div>
            <LikertRow value={scores[it.k]} onPick={(v) => { setScores((s) => ({ ...s, [it.k]: v })); setWarn(""); }}
              label={it.label + " — " + it.text} labels={SELF_LABELS} />
          </div>
        ))}
        <div className="field" style={{ marginTop: 14 }}>
          <label>이번 점수를 정할 때 가장 중요하게 본 내 작품의 구체적인 특징이나 근거 한 가지 ({SELF_MIN_WHY}자 이상)</label>
          <textarea rows={2} maxLength={SELF_WHY_MAX} value={why} onChange={(e) => { setWhy(e.target.value); setWarn(""); }}
            placeholder="예: 손잡이 안쪽만 닳아 있어서 쥐고 쓴 방향이 읽힌다" />
          <span className={"as-count" + (why.trim().length < SELF_MIN_WHY ? " low" : "")}>{why.trim().length} / {SELF_WHY_MAX}</span>
        </div>
        {n == null ? (
          <p className="hint">{subFail ? "우리 반 작품 목록을 불러오지 못했습니다. " : "우리 반 작품 수를 세는 중… "}
            {subFail && reloadSubs && <button type="button" className="btn small ghost" onClick={reloadSubs}>다시 불러오기</button>}
          </p>
        ) : nOk && (
          <div className="field">
            <label>우리 반 {n}점 가운데 내 작품은 몇 번째쯤일까요? <span className="hint">— 1이 가장 앞</span></label>
            <div className="as-range">
              <span className="as-rv">1</span>
              <input type="range" min={1} max={n} step={1} value={rankShown} aria-label="등수 예측" aria-valuetext={rankShown + "번째쯤"}
                onChange={(e) => { setRank(Number(e.target.value)); setWarn(""); }}
                onPointerUp={() => setRank((r) => (r == null ? rankShown : r))}
                onKeyUp={(e) => { if (!RANK_KEYS.has(e.key)) return; setRank((r) => (r == null ? rankShown : r)); }} />
              <span className="as-rv">{n}</span>
            </div>
            <div className={"as-rank-txt" + (rank == null ? " dim" : "")} aria-live="polite">
              {rank == null ? "손잡이를 움직여 자리를 정하세요" : "우리 반 " + n + "점 가운데 " + rankShown + "번째쯤"}
            </div>
          </div>
        )}
        {warn && <div className="warn-note" role="alert">{warn}</div>}
        <div className="sv-foot">
          <button className="btn" disabled={busy || sampleMode} onClick={isS2 ? lock2 : submit1}>
            {busy ? "저장 중…" : isS2 ? "현재 점수 확정" : "제출하기"}
          </button>
          <span className="hint">{isS2 ? "확정하면 점수와 근거를 고칠 수 없습니다. 확정한 뒤에 처음 평가와 나란히 봅니다." : "제출하면 고칠 수 없습니다."}</span>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   3. 동료 비교 — 배정된 쌍을 차례로 판정한다
   ============================================================ */

function PeerScreen({ sid, cfg, roster, jkey, pairs, block, subMap, subFail, reloadSubs, sampleMode }) {
  const N = pairs.length;
  const [items, setItems] = useState(() => (block && Array.isArray(block.items) ? block.items : []));
  const itemsRef = useRef(items);
  itemsRef.current = items;
  /* 다른 기기에서 더 진행한 기록이 오면 그것을 따른다. 적으면(저장 실패 뒤) 이 화면의 것을 지킨다 */
  useEffect(() => {
    const r = block && Array.isArray(block.items) ? block.items : [];
    if (r.length > itemsRef.current.length) setItems(r);
  }, [block]);
  const startedAtRef = useRef((block && block.startedAt) || nowISO());
  const [win, setWin] = useState(null);
  const [conf, setConf] = useState(null);
  const [why, setWhy] = useState("");
  const [tag, setTag] = useState(null);
  const [openPlate, setOpenPlate] = useState(false);
  const [warn, setWarn] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveErr, setSaveErr] = useState(false);
  const [dupOk, setDupOk] = useState(false);      // 중복 이유 경고를 한 번 봤다
  const [fastOk, setFastOk] = useState(false);    // 「한 번 더 보고」 경고를 한 번 봤다 — 시간은 그대로 재고 표시만 남긴다
  const everOpened = useRef(false);               // 이 쌍에서 작품 캡션을 한 번이라도 펼쳤는가 (도로 접어도 남는다)
  const [seen, setSeen] = useState({ a: false, b: false });
  const [imgs, setImgs] = useState({});           // 작품 번호 → dataURL | null(없음) | undefined(읽는 중)
  const startRef = useRef(Date.now());
  const loadedRef = useRef({ a: false, b: false });
  const boxA = useRef(null), boxB = useRef(null);

  const doneN = Math.min(items.length, N);
  const finished = N > 0 && items.length >= N;
  const cur = finished ? null : pairs[doneN];
  const curKey = cur ? cur.i + ":" + cur.a + ":" + cur.b : "done";

  const workOf = (no) => {
    const w = (roster.works || []).find((x) => x && x.no === no);
    const s = w && subMap ? subMap[w.sid] : null;
    return { no, sid: w ? String(w.sid) : null, sub: s && typeof s === "object" ? s : null };
  };

  /* 쌍이 바뀔 때마다 — 시간을 다시 재고, 작품 캡션을 도로 접고, 입력을 비운다 */
  useEffect(() => {
    startRef.current = Date.now();
    loadedRef.current = { a: false, b: false };
    setWin(null); setConf(null); setWhy(""); setTag(null); setOpenPlate(false);
    setWarn(""); setDupOk(false); setFastOk(false); setSeen({ a: false, b: false });
    everOpened.current = false;
  }, [curKey]);

  /* 지금 쌍과 다음 쌍의 이미지를 미리 읽는다 */
  useEffect(() => {
    if (!subMap || !cur) return undefined;
    let live = true;
    const nxt = pairs[doneN + 1];
    const wants = nxt ? [cur.a, cur.b, nxt.a, nxt.b] : [cur.a, cur.b];
    wants.forEach((no) => {
      const w = workOf(no);
      const im = w.sub && w.sub.img;
      if (!im || !im.ref) { setImgs((m) => (m[no] === null ? m : { ...m, [no]: null })); return; }
      loadImg(im.owner ? String(im.owner) : w.sid, String(im.ref)).then((v) => {
        if (live) setImgs((m) => (m[no] === (v || null) ? m : { ...m, [no]: v || null }));
      });
    });
    return () => { live = false; };
  }, [subMap, curKey]); // eslint-disable-line

  /* 배정된 작품이 지도에 없으면(확정 직전 제출 등) 한 번 다시 읽는다 */
  const missing = !!(subMap && cur) && (!workOf(cur.a).sub || !workOf(cur.b).sub);
  const reloadedRef = useRef("");
  useEffect(() => {
    if (missing && reloadedRef.current !== curKey) { reloadedRef.current = curKey; reloadSubs(); }
  }, [missing, curKey]); // eslint-disable-line

  /* 두 작품을 모두 본 뒤에야 고를 수 있다 — 세로 배치(모바일)에서 아래 작품을 안 보고 고르는 일을 막는다.
     이미지 칸의 60%가 화면에 들어오면 본 것으로 친다. 칸이 화면보다 크면 걸치기만 해도 인정.
     subMap이 늦게 도착하면 칸이 그때 생기므로 그때 다시 붙인다 */
  useEffect(() => {
    if (!cur || !subMap) return undefined;
    if (typeof IntersectionObserver === "undefined") { setSeen({ a: true, b: true }); return undefined; }
    const io = new IntersectionObserver((ents) => {
      ents.forEach((e) => {
        const tall = e.rootBounds && e.boundingClientRect.height > e.rootBounds.height * 0.9;
        if (e.intersectionRatio >= 0.6 || (tall && e.isIntersecting)) {
          const side = e.target.getAttribute("data-side");
          setSeen((s) => (s[side] ? s : { ...s, [side]: true }));
        }
      });
    }, { threshold: [0, 0.6] });
    if (boxA.current) io.observe(boxA.current);
    if (boxB.current) io.observe(boxB.current);
    return () => io.disconnect();
  }, [curKey, !!subMap]); // eslint-disable-line

  /* 판정 시간은 두 이미지가 다 뜬 순간부터 잰다. 하나라도 없으면 화면이 뜬 시각이 기준 */
  const onImgLoad = (side) => {
    loadedRef.current[side] = true;
    if (loadedRef.current.a && loadedRef.current.b) startRef.current = Date.now();
  };

  /* 쌍마다 이 명단의 판정 블록(judge[jkey])을 통째로 merge — items는 매번 전체를 다시 쓴다.
     첫 명단은 p1, 명단이 다시 확정되면 다른 키에 쌓여 옛 판정이 남는다.
     submittedAt은 끝나기 전엔 null로 명시한다: merge라서 안 보내면 이어 쓰기 전 값이 남는다 */
  const persist = async (list, last) => {
    if (sampleMode) return false;
    const payload = {
      ver: ASSESS_VER,
      judge: { [jkey || "p1"]: {
        rosterVer: roster.fixedAt || null, planHash: roster.hash || null,
        k: roster.k != null ? roster.k : cfg.k, repeat: roster.repeat != null ? roster.repeat : cfg.repeat,
        items: list, startedAt: startedAtRef.current, submittedAt: last ? nowISO() : null,
      } },
    };
    return fbStore.setT("assess:" + sid, payload, { merge: true });
  };

  const next = async () => {
    if (busy || !cur) return;
    if (sampleMode) { setWarn("예시 화면에서는 저장되지 않습니다."); return; }
    const ms = Date.now() - startRef.current;
    const w = why.trim();
    if (!win) { setWarn("어느 쪽이 더 성립하는지 먼저 고르세요."); return; }
    if (cfg.askConf && !conf) { setWarn("이 판단을 얼마나 확신하는지 골라 주세요."); return; }
    if (w.length < cfg.minWhy) { setWarn("고른 이유를 " + cfg.minWhy + "자 이상 써 주세요."); return; }
    if (!tag) { setWarn("무엇이 결정적이었는지 하나 고르세요."); return; }
    if (!fastOk && ms < cfg.minSec * 1000) { setWarn("두 작품을 한 번 더 보고 골라 주세요. 충분히 봤다면 한 번 더 누르세요."); setFastOk(true); return; }
    if (!bothShown) { setWarn("두 작품의 이미지가 모두 보여야 고를 수 있습니다. 「작품 다시 불러오기」를 눌러 주세요."); return; }
    const prev3 = items.slice(-3).map((x) => (x && x.why) || "").filter(Boolean);
    if (!dupOk && prev3.some((p) => simText(p, w) >= DUP_SIM)) {
      setWarn("직전에 쓴 이유와 거의 같은 문장입니다. 이 쌍에서 본 것을 적어 주세요. 그래도 넘기려면 한 번 더 누르세요.");
      setDupOk(true); return;
    }
    /* 실제 배치 축 — 좌우(x)였는지 위아래(y)였는지. 좁은 화면에서는 「왼쪽」이 곧 「위」다 */
    const ra = boxA.current && boxA.current.getBoundingClientRect(), rb = boxB.current && boxB.current.getBoundingClientRect();
    const axis = ra && rb && ra.width > 0 ? (Math.abs(ra.left - rb.left) < 2 ? "y" : "x")
      : (typeof window !== "undefined" && window.innerWidth <= PAIR_STACK_PX ? "y" : "x");
    const rec = {
      i: cur.i != null ? cur.i : doneN, a: cur.a, b: cur.b, left: cur.left || "a", rep: cur.rep == null ? null : cur.rep,
      win, conf: cfg.askConf ? conf : null, why: w, tag, ms, fastOverride: fastOk && ms < cfg.minSec * 1000,
      plateOpened: everOpened.current || openPlate, axis, vw: typeof window !== "undefined" ? window.innerWidth : null, at: nowISO(),
    };
    const list = items.concat(rec);
    setItems(list); setBusy(true); setWarn("");
    const ok = await persist(list, list.length >= N);
    setBusy(false); setSaveErr(!ok);
  };
  const retry = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await persist(itemsRef.current, itemsRef.current.length >= N);
    setBusy(false); setSaveErr(!ok);
  };

  if (!subMap) {
    return (
      <div className="card as-card"><div className="card-body" style={{ color: "var(--sub)", fontSize: 13 }}>우리 반 작품을 불러오는 중… 잠시만 기다려 주세요.</div></div>
    );
  }

  const bothShown = !!cur && !!imgs[cur.a] && !!imgs[cur.b];
  const canPick = seen.a && seen.b && bothShown && !busy;
  const pct = N ? Math.round((doneN / N) * 100) : 0;
  const whyLen = why.trim().length;
  const order = cur && cur.left === "b" ? ["b", "a"] : ["a", "b"];
  const imgMissing = !!cur && (imgs[cur.a] === null || imgs[cur.b] === null);

  /* 컴포넌트가 아니라 조각을 돌려주는 함수다 — 컴포넌트로 두면 이유를 한 글자 칠 때마다
     새 타입이 되어 두 작품이 통째로 다시 붙고 이미지가 깜빡인다 */
  const work = (side) => {
    const no = cur[side];
    const w = workOf(no);
    const src = imgs[no];
    const on = win === side;
    const plate = w.sub && w.sub.plate;
    return (
      <div className={"as-work" + (on ? " on" : "")} key={side}>
        <div className="as-work-h">작품 {no}</div>
        <div className="as-img" ref={side === "a" ? boxA : boxB} data-side={side}>
          {src ? <img src={src} alt={"작품 " + no + "의 이미지"} onLoad={() => onImgLoad(side)} />
            : <span className="ph">{src === undefined ? "불러오는 중…" : "이미지 없음"}</span>}
        </div>
        {openPlate ? (
          w.sub ? (
            <div className="as-plate">
              <div className="as-title">「{w.sub.title || "무제"}」</div>
              <dl>
                {PLATE_ROWS.filter(([k]) => plate && String(plate[k] || "").trim()).map(([k, label]) => (
                  <React.Fragment key={k}><dt>{label}</dt><dd>{plate[k]}</dd></React.Fragment>
                ))}
              </dl>
            </div>
          ) : <div className="as-plate-hidden">작품 캡션 없음</div>
        ) : <div className="as-plate-hidden">작품 캡션 접힘</div>}
        <button type="button" role="radio" aria-checked={on} className={"btn small " + (on ? "" : "ghost")} disabled={!canPick}
          onClick={() => { setWin(side); setWarn(""); }}>{on ? "고름" : "이쪽"}</button>
      </div>
    );
  };

  return (
    <div className="card as-card">
      <div className="card-head">
        <span className="card-code">동료 비교</span>
        <span className="card-title">두 작품 가운데 어느 쪽이 더 성립하는가</span>
        <span className="card-sess" role="status" aria-live="polite">
          {busy ? "저장 중…" : saveErr ? "저장 실패" : doneN > 0 ? "저장됨 · " + doneN + "/" + N : N + "쌍"}
        </span>
      </div>
      <div className="card-note">
        우리 반 작품을 두 점씩 견줍니다. 작품 번호만 보이고 누구의 작품인지는 나오지 않습니다.
        매번 한 쪽을 고르고 그 이유를 한 문장으로 써 주세요. 고른 것은 되돌릴 수 없습니다.
      </div>
      <div className="card-body">
        <div className="as-prog">
          <span className="as-n">{doneN} / {N} 쌍</span>
          <span className="as-bar" role="progressbar" aria-valuenow={doneN} aria-valuemin={0} aria-valuemax={N} aria-label={"판정한 쌍 " + doneN + ", 전체 " + N}>
            <i style={{ width: pct + "%" }} />
          </span>
        </div>
        {saveErr && (
          <div className="warn-note" role="alert" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ flex: 1, minWidth: 200 }}>판정을 저장하지 못했습니다. 판정은 이 화면에 남아 있으니 연결을 확인하고 「다시 저장」을 눌러 주세요. 저장되기 전에 창을 닫으면 사라집니다.</span>
            <button className="btn small" disabled={busy} onClick={retry}>{busy ? "저장 중…" : "다시 저장"}</button>
          </div>
        )}
        {finished ? (
          <div className="ok-note" role="status">동료 비교를 마쳤습니다 — {N}쌍 모두 기록되었습니다. 고맙습니다.</div>
        ) : (
          <>
            <div className="as-q">{cfg.question}</div>
            <div className="as-pair" role="radiogroup" aria-label="더 성립하는 작품 고르기">{order.map(work)}</div>
            <div className="as-tools">
              <button type="button" className="btn small ghost" aria-expanded={openPlate} onClick={() => setOpenPlate((v) => { if (!v) everOpened.current = true; return !v; })}>
                {openPlate ? "작품 캡션 접기" : "작품 캡션 보기"}
              </button>
              {(missing || imgMissing) && <button type="button" className="btn small ghost" onClick={() => { setImgs((m) => { const c = { ...m }; delete c[cur.a]; delete c[cur.b]; return c; }); reloadSubs(); }}>작품 다시 불러오기</button>}
              <span className="hint">{canPick || busy ? "먼저 이미지만 보고 판단해도 되고, 작품 캡션을 펼쳐 보고 판단해도 됩니다."
                : (missing || imgMissing) ? "작품 이미지를 불러오지 못했습니다. 이미지가 없으면 비교할 수 없습니다 — 다시 불러온 뒤에도 안 보이면 선생님께 알려 주세요."
                  : "두 작품을 모두 본 뒤에 고를 수 있습니다."}</span>
            </div>

            {cfg.askConf && (
              <div className="field">
                <label>이 판단을 얼마나 확신하나요? <span className="hint">— 작품의 점수가 아니라 판단이 얼마나 확실한지 묻습니다. 성적과 관계없습니다.</span></label>
                <div className="as-opts" role="radiogroup" aria-label="판단 확신도">
                  {CONF_LABELS.map((l, i) => (
                    <button type="button" key={l} role="radio" aria-checked={conf === i + 1} className={conf === i + 1 ? "on" : ""}
                      onClick={() => { setConf(i + 1); setWarn(""); }}>{l}</button>
                  ))}
                </div>
              </div>
            )}
            <div className="field">
              <label>고른 이유를 한 문장으로 ({cfg.minWhy}자 이상) — 결정에 가장 큰 영향을 준 화면의 특징이나 작품 캡션의 근거</label>
              <textarea rows={2} maxLength={REASON_MAX} value={why} onChange={(e) => { setWhy(e.target.value); setWarn(""); }}
                placeholder="예: 손잡이 안쪽만 닳아 있어서 실제로 쥐고 쓴 물건처럼 보였다" />
              <span className={"as-count" + (whyLen < cfg.minWhy ? " low" : "")}>{whyLen} / {REASON_MAX}</span>
            </div>
            <div className="field">
              <label>무엇이 결정적이었나요?</label>
              <div className="as-opts" role="radiogroup" aria-label="결정적이었던 것">
                {CRITERIA.map((t) => (
                  <button type="button" key={t.k} role="radio" aria-checked={tag === t.k} className={tag === t.k ? "on" : ""} title={t.desc}
                    onClick={() => { setTag(t.k); setWarn(""); }}>{t.label}</button>
                ))}
              </div>
            </div>

            {warn && <div className="warn-note" role="alert">{warn}</div>}
            <div className="sv-foot">
              <button className="btn" disabled={busy} onClick={next}>
                {busy ? "저장 중…" : doneN + 1 >= N ? "마지막 쌍 — 제출하기" : "다음 쌍 →"}
              </button>
              <span className="hint">고른 것은 되돌릴 수 없습니다. 한 쌍에 1분 남짓 걸립니다.</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ============================================================
   5. 결과 — reveal 범위만큼만, 숫자보다 말로
   ============================================================ */

function ResultScreen({ cfg, result, self }) {
  const r = result || {};
  const reveal = cfg.reveal;
  const n = r.n || 0;
  let pos = null;
  if (r.rank == null || r.band == null) {
    pos = null;   // 비교된 적이 없는 작품 — 자리를 말할 수 없다
  } else if (reveal === "band") {
    pos = r.band === "상" ? "우리 반에서 위쪽 1/3에 놓였습니다."
      : r.band === "하" ? "우리 반에서 아래쪽 1/3에 놓였습니다."
        : "우리 반에서 가운데에 놓였습니다.";
  } else if (reveal === "pct" && typeof r.pct === "number") {
    pos = "우리 반 작품 가운데 약 " + Math.round(r.pct * 100) + "%의 작품보다 앞에 놓였습니다.";
  } else if (reveal === "rank" && r.rank) {
    pos = "우리 반 " + n + "점 가운데 " + r.rank + "번째에 놓였습니다.";
  }
  const received = Array.isArray(r.received) ? r.received : [];
  const won = received.filter((x) => x && x.won);
  const lost = received.filter((x) => x && !x.won);
  const tagLabel = (k) => { const t = CRITERIA.find((c) => c.k === k); return t ? t.label : ""; };
  /* 예측과 실제의 차이는 방향만 말한다 — 숫자를 크게 보이면 등수표처럼 읽힌다 */
  const predWord = (pp) => {
    if (typeof pp !== "number" || typeof r.pct !== "number") return null;
    const d = pp - r.pct;
    return Math.abs(d) < 0.15 ? "예측과 비슷한 자리" : d > 0 ? "예측보다 아래쪽" : "예측보다 위쪽";
  };
  const pp1 = typeof r.predPct1 === "number" ? r.predPct1 : self && self.s1 ? self.s1.predPct : null;
  const pp2 = typeof r.predPct2 === "number" ? r.predPct2 : self && self.s2 ? self.s2.predPct : null;
  const w1 = predWord(pp1), w2 = predWord(pp2);
  const list = (arr) => (
    <ul className="as-recv">
      {arr.map((x, i) => (
        <li key={i}>{x.tag && <span className="as-tag">{tagLabel(x.tag)}</span>}{x.why}</li>
      ))}
    </ul>
  );

  return (
    <div className="card as-card">
      <div className="card-head"><span className="card-code">결과</span><span className="card-title">내 작품 {r.no ? "(" + r.no + ")" : ""}이 놓인 자리</span>
        <span className="card-sess">{fmtT(r.aggAt)} 집계</span></div>
      <div className="card-note">같은 반 친구들이 두 작품씩 견주며 남긴 판단을 모은 것입니다. 누가 어떻게 판정했는지는 나오지 않습니다.</div>
      <div className="card-body">
        {pos ? <div className="as-pos">{pos}</div> : <div className="hint" style={{ marginBottom: 8 }}>이 작품은 아직 비교된 적이 없어 자리를 말할 수 없습니다.</div>}
        <p className="as-plays">
          이 작품은 {typeof r.plays === "number" ? r.plays + "번" : "여러 번"} 비교되었고,
          {typeof r.wins === "number" ? " 그 가운데 " + r.wins + "번" : " 그 가운데 몇 번"} 더 성립하는 쪽으로 골라졌습니다.
        </p>
        {(w1 || w2) && (
          <p className="as-plays">
            내 예측과 견주면 {w1 ? "자기평가 ①의 " + w1 : ""}{w1 && w2 ? ", " : ""}{w2 ? "자기평가 ②의 " + w2 : ""}입니다.
          </p>
        )}
        <div className="as-h">이 작품을 고른 판정의 이유 ({won.length})</div>
        {won.length ? list(won) : <p className="hint">기록된 문장이 없습니다.</p>}
        <div className="as-h">다른 작품을 고른 판정의 이유 ({lost.length})</div>
        {lost.length ? list(lost) : <p className="hint">기록된 문장이 없습니다.</p>}
        <div className="as-fixed">
          이 결과는 성적이 아닙니다. 비교 횟수가 많지 않아 자리는 넉넉한 폭으로 읽어야 하고,
          한 판정자의 문장보다 여러 문장이 겹치는 지점이 내 작품을 다시 보는 실마리입니다.
        </div>
      </div>
    </div>
  );
}

/* ---------- 스타일 ---------- */

const ASSESS_CSS = `
.as-card{border-top:3px solid var(--ink)}
.as-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}

/* 진행 띠 — 제출 · 자기평가① · 동료 비교 · 자기평가② · 결과 */
.as-strip{display:flex;gap:6px;flex-wrap:wrap;list-style:none;margin:0 0 14px;padding:0}
.as-step{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--sub);border:1px solid var(--line);background:var(--card);padding:5px 10px;font-family:var(--sans)}
.as-step i{font-style:normal;font-family:var(--mono);font-size:11px}
.as-step.done{color:var(--patina);border-color:var(--patina)}
.as-step.cur{color:var(--card);background:var(--ink);border-color:var(--ink)}
.as-step.lock{border-style:dashed;background:var(--card2)}
.as-step.skip{border-style:dashed}

/* 공통 조각 */
.as-q{font-family:var(--serif);font-size:15px;font-weight:700;line-height:1.5;margin-bottom:12px}
.as-work-h{font-family:var(--mono);font-size:11px;letter-spacing:.12em;color:var(--sub)}
.as-title{font-family:var(--serif);font-size:15px;font-weight:700}
.as-h{font-family:var(--serif);font-size:14px;font-weight:700;margin:16px 0 6px;padding-top:12px;border-top:1px solid var(--line2)}
.as-count{display:block;text-align:right;font-family:var(--mono);font-size:11px;color:var(--sub);margin-top:3px}
.as-count.low{color:var(--seal)}
.as-qt{display:block;font-size:12.5px;color:var(--sub);margin-top:2px;line-height:1.55}
.as-item .sv-q b{font-weight:700}

/* 보기 단추 — 확신도 · 결정적 축 · 변화 사유 */
.as-opts{display:flex;gap:6px;flex-wrap:wrap}
.as-opts button{padding:8px 12px;border:1px solid var(--line);background:#fff;font-family:var(--sans);font-size:12.5px;color:var(--ink);cursor:pointer;line-height:1.4;text-align:left}
.as-opts button:hover{border-color:var(--ink)}
.as-opts button:focus-visible{outline:2px solid var(--ink);outline-offset:1px}
.as-opts button.on{background:var(--ink);border-color:var(--ink);color:#fff}
.as-opts button:disabled{opacity:.5;cursor:not-allowed}
.as-opts.as-col{flex-direction:column;align-items:stretch}

/* 이미지 칸 — 제출 미리보기와 비교 화면이 같은 규칙(4:3 · contain · 중립 배경)을 쓴다 */
.as-sub-img,.as-img{background:var(--card2);aspect-ratio:4/3;display:flex;align-items:center;justify-content:center;overflow:hidden}
.as-sub-img{border:1px solid var(--line)}
.as-sub-img img,.as-img img{width:100%;height:100%;object-fit:contain;display:block}
.as-sub-img .ph,.as-img .ph{font-family:var(--mono);font-size:11px;color:var(--sub);letter-spacing:.15em}
.as-dl,.as-plate dl{display:grid;grid-template-columns:70px 1fr;gap:3px 8px;font-size:12px;margin:8px 0 0}
.as-plate dl{font-size:11.5px;border-top:1px dashed var(--line);padding-top:8px;margin-top:6px}
.as-dl dt,.as-plate dt{color:var(--sub)}
.as-dl dd,.as-plate dd{margin:0}

/* 제출 */
.as-sub-grid{display:grid;grid-template-columns:220px 1fr;gap:14px;align-items:start}
.as-grid2{display:grid;grid-template-columns:1fr 1fr;gap:0 14px}
.as-grid2 .span2{grid-column:1/-1}

/* 자기평가 */
.as-range{display:flex;align-items:center;gap:12px}
.as-range input[type=range]{flex:1;min-width:0;accent-color:var(--ink);height:28px}
.as-rv{font-family:var(--mono);font-size:12px;color:var(--sub);white-space:nowrap}
.as-rank-txt{font-size:13px;margin-top:4px;font-variant-numeric:tabular-nums}
.as-rank-txt.dim{color:var(--sub)}
.as-cmp{width:100%;border-collapse:collapse;font-size:13px;margin-bottom:12px}
.as-cmp th{font-weight:500;color:var(--sub);font-size:12px;text-align:left;border-bottom:1px solid var(--line2);padding:6px 8px}
.as-cmp td{padding:6px 8px;border-bottom:1px dashed var(--line2);vertical-align:top}
.as-cmp .as-sc{font-family:var(--mono);text-align:center;white-space:nowrap;width:48px}
.as-cmp .as-arrow{color:var(--sub);width:28px}
.as-why2{display:grid;grid-template-columns:1fr 1fr;gap:10px;font-size:13px;line-height:1.6}
.as-why2>div{border:1px solid var(--line2);background:var(--card2);padding:8px 10px}
.as-lab{display:block;font-family:var(--mono);font-size:10px;letter-spacing:.12em;color:var(--sub);margin-bottom:3px}

/* 동료 비교 */
.as-prog{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.as-n{font-family:var(--mono);font-size:12px;color:var(--sub);white-space:nowrap;font-variant-numeric:tabular-nums}
.as-bar{flex:1;height:3px;background:var(--line2);position:relative;display:block}
.as-bar i{position:absolute;left:0;top:0;bottom:0;background:var(--ink);transition:width .25s ease}
.as-pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.as-work{border:1px solid var(--line);background:#fff;padding:10px;display:flex;flex-direction:column;gap:8px}
.as-work.on{border-color:var(--ink);box-shadow:0 0 0 2px var(--ink) inset}
.as-plate-hidden{font-family:var(--mono);font-size:11px;color:var(--sub);letter-spacing:.12em;background:var(--card2);border:1px solid var(--line2);text-align:center;padding:10px}
.as-work .btn{align-self:stretch;text-align:center}
.as-work .btn:disabled{opacity:.45;cursor:not-allowed}
.as-tools{display:flex;align-items:center;gap:10px;margin:12px 0;flex-wrap:wrap}

/* 결과 */
.as-pos{font-family:var(--serif);font-size:17px;font-weight:700;line-height:1.5;margin-bottom:8px}
.as-plays{font-size:13px;line-height:1.7;margin:0 0 6px}
.as-recv{list-style:none;padding:0;margin:0 0 4px}
.as-recv li{border:1px solid var(--line2);background:var(--card2);padding:8px 10px;margin-bottom:6px;font-size:13px;line-height:1.6}
.as-tag{font-family:var(--mono);font-size:10px;letter-spacing:.1em;color:var(--sub);border:1px solid var(--line);padding:1px 5px;margin-right:6px;white-space:nowrap}
.as-fixed{font-size:12px;color:var(--sub);border-top:1px solid var(--line2);padding-top:10px;margin-top:14px;line-height:1.7}

/* 손가락 입력에서는 단추를 40px 이상으로 · 움직임 줄이기 · 640px 이하에서는 두 작품을 세로로 */
@media (pointer:coarse){.as-opts button,.as-work .btn,.as-tools .btn,.as-step{min-height:40px}}
@media (prefers-reduced-motion:reduce){.as-bar i{transition:none}}
@media (max-width:640px){
  .as-pair,.as-sub-grid,.as-grid2,.as-why2{grid-template-columns:1fr}
  .as-opts button{flex:1 1 100%}
  .as-item{flex-direction:column;gap:6px}
  .as-item .likert{align-self:flex-end}
}
`;


export function AssessStyle() { return <style>{ASSESS_CSS}</style>; }
