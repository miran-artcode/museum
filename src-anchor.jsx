/* ============================================================
   앵커 쌍 — 고지 라벨만 바꿔 붙인 네 쌍의 판정

   왜 필요한가(평가자_성향_설문_설계.md §2.1):
   학생 작품으로 만든 쌍대비교에서는 작품 고정효과 θ가 D(고지된 AI 개입 폭)를 통째로
   흡수해 버려서 "고지가 평균 몇 점을 깎는가"(β_0)가 식별되지 않는다. 판정자별 편차
   β_j만 남는다. 그래서 학급 밖 작품 네 쌍을 따로 두고, **같은 이미지에 붙는
   「AI 활용 범위」 문구를 판정자마다 무작위로 뒤바꾼다.** 라벨이 무작위 배정되므로
   두 조건의 선택률 차이는 인과적으로 해석되는 학급 평균 감점이 된다.

   배정 규칙 — 조건은 학번 끝자리의 홀짝, 라벨이 붙는 쪽은 쌍마다 뒤집는다.
     hiSide(sid, i) = ((끝자리 + i) % 2 === 0) ? "a" : "b"
   이렇게 하면 한 판정자가 「AI 전면」 라벨을 왼쪽에서 두 번, 오른쪽에서 두 번 보고,
   한 쌍을 놓고 보면 학급의 절반은 A에 절반은 B에 그 라벨이 붙는다.
   위치 편향과 작품 편향이 라벨 효과에 섞이지 않는다.

   개인 지표 anchorScore = 네 쌍에서 「AI 전면」 쪽을 고른 횟수(0~4).
   낮을수록 고지를 크게 깎은 것이다. 이 값을 성향 설문(src-stance.jsx) 점수로 예측한다.

   저장은 surveys/{학번} 문서의 anchor 블록에 둔다. 상호평가(assess 컬렉션)가
   아직 없어서 임시로 여기 얹는다 — 그때가 되면 옮기고 보안 규칙을 따로 준다.
   ============================================================ */

import React, { useState, useEffect, useRef } from "react";

export const ANCHOR_VER = "a2";

/* 두 문구만 다르다. 이미지·제목·작품 캡션은 두 조건이 완전히 같다 */
export const LABEL_HI = "이미지 전체를 생성형 AI로 제작";
export const LABEL_LO = "직접 촬영·합성, AI는 배경 보정에만 사용";

/* 판정 뒤에 고르는 결정적 축 — 상호평가 설계서의 4축과 같은 말을 쓴다 */
export const ANCHOR_TAGS = [
  { k: "veri", label: "핍진성", desc: "진짜 기록 사진처럼 보이는가" },
  { k: "cause", label: "흔적과 쓰임", desc: "닳고 부서진 자리가 쓰던 방식과 이어지는가" },
  { k: "plate", label: "작품 캡션", desc: "읽고 나서 이미지가 달라 보이는가" },
  { k: "voice", label: "문제가 전해지는가", desc: "어떤 문제가 어떤 태도로 읽히는가" },
];

export const ANCHOR_QUESTION =
  "두 작품 가운데, 실재한 적 없는 유물을 더 그럴듯하게 만들어 낸 쪽은 어느 쪽인가요?";

export const ANCHOR_MIN_SEC = 5;   // 이보다 빨리 고르면 한 번 더 보게 한다
export const ANCHOR_MIN_WHY = 15;  // 이유 문장의 최소 길이

/* 작품 캡션의 「AI 활용 범위」를 견줄 수 있게 만드는 4단계 (평가자_성향_설문_설계.md §2.1).
   자유 서술은 그대로 두고 이 값을 함께 받는다. 학생 자신의 선언이므로
   작품의 실제 AI 개입도가 아니라 **고지된 개입도**다 — 논문에서 이 구분을 흐리지 않는다. */
export const AI_LEVELS = [
  "촬영·수집한 이미지가 중심, AI는 손질만",
  "일부 요소를 AI로 생성해 합쳤다",
  "AI로 생성한 이미지를 여러 번 고쳐 썼다",
  "AI가 생성한 이미지를 거의 그대로 썼다",
];
/* 0~3의 수치로. 답하지 않았으면 null */
export const aiLevelNum = (v) => {
  const i = AI_LEVELS.indexOf(v);
  return i >= 0 ? i : null;
};

/* 기본 네 쌍 — 교사가 「상호평가」 화면에서 이미지 경로와 문안을 고칠 수 있다.
   img는 public/ 아래 상대 경로("img/anchor/a1.jpg")나 절대 주소를 쓴다.
   이미지가 하나라도 비어 있으면 학생에게 열 수 없다(비교가 성립하지 않는다). */
export const DEFAULT_ANCHOR = {
  open: false,
  ver: ANCHOR_VER,
  pairs: [
    {
      id: "AN-1",
      a: { img: "", title: "오른손", relic: "손잡이 파편", era: "21세기 중반", mat: "알루미늄·수지", ctx: "급식실 배식대 아래층에서 다른 조리 기구와 함께 수습" },
      b: { img: "", title: "이름을 지운 사람", relic: "이름표가 떨어진 안전모", era: "21세기 초", mat: "폴리카보네이트", ctx: "공사장 가설 울타리 안쪽, 흙에 반쯤 묻힌 채 발견" },
    },
    {
      id: "AN-2",
      a: { img: "", title: "삼십 분", relic: "열에 변형된 배달 가방", era: "21세기 중반", mat: "폴리에스터·발포 단열재", ctx: "지하 주차장 오토바이 거치대 옆에서 수습" },
      b: { img: "", title: "출입", relic: "인쇄가 벗겨진 출입증", era: "21세기 초", mat: "PVC·자성 띠", ctx: "사무동 철거 잔해의 사물함 칸에서 수습" },
    },
    {
      id: "AN-3",
      a: { img: "", title: "다음 봄", relic: "봉인된 종자 보관함", era: "21세기 후반", mat: "강화 유리·실리콘", ctx: "옥상 텃밭 창고 선반 맨 아래에서 봉인된 상태로 발견" },
      b: { img: "", title: "개지 않은 날", relic: "펴진 채 굳은 우산", era: "21세기 중반", mat: "나일론·강선", ctx: "버스 정류장 배수구에 끼인 채 수습" },
    },
    {
      id: "AN-4",
      a: { img: "", title: "발이 판 자리", relic: "닳아 얇아진 계단코", era: "20세기 말~21세기", mat: "황동·화강암", ctx: "학교 본관 2층 계단참에서 절단 수습" },
      b: { img: "", title: "엉킨 밤", relic: "충전기 뭉치", era: "21세기 초", mat: "구리·염화비닐", ctx: "학생회실 사물함 뒤편에서 한 덩어리로 굳은 채 발견" },
    },
  ],
};

export const anchorReady = (cfg) => {
  const c = cfg || DEFAULT_ANCHOR;
  return Array.isArray(c.pairs) && c.pairs.length === 4
    && c.pairs.every((p) => p && p.a && p.b && String(p.a.img || "").trim() && String(p.b.img || "").trim());
};
export const anchorOpen = (cfg) => !!(cfg && cfg.open) && anchorReady(cfg);
export const anchorDone = (block) => !!(block && block.submittedAt);

/* 조건(0·1)은 학번 끝자리의 홀짝, 「AI 전면」 라벨이 붙는 쪽은 쌍마다 뒤집는다 */
export const condOf = (sid) => {
  const d = String(sid || "").replace(/\D/g, "");
  return d ? Number(d[d.length - 1]) % 2 : 0;
};
export const hiSideOf = (sid, i) => ((condOf(sid) + i) % 2 === 0 ? "a" : "b");

/* 네 쌍에서 「AI 전면」 쪽을 고른 횟수 (0~4). 낮을수록 고지를 크게 깎았다 */
export function anchorScore(block) {
  const items = (block && block.items) || [];
  if (!items.length) return null;
  return items.filter((x) => x && x.win && x.win === x.hi).length;
}
/* 작품 캡션을 펼쳐 본 비율 — 무엇을 보고 판단했는가 */
export function anchorPlateRate(block) {
  const items = (block && block.items) || [];
  if (!items.length) return null;
  return items.filter((x) => x && x.plateOpened).length / items.length;
}
export function anchorTagCount(block, tag) {
  const items = (block && block.items) || [];
  return items.filter((x) => x && x.tag === tag).length;
}

/* ---------- 학생 화면 ---------- */

export function AnchorCard({ me, cfg, block, onChange, onSubmit, busy }) {
  const conf = cfg || DEFAULT_ANCHOR;
  const pairs = conf.pairs || [];
  const sv = block || {};
  const items = sv.items || [];
  const [win, setWin] = useState(null);
  const [why, setWhy] = useState("");
  const [tag, setTag] = useState(null);
  const [openPlate, setOpenPlate] = useState(false);
  const [warn, setWarn] = useState("");
  const startRef = useRef(Date.now());

  /* 쌍이 넘어갈 때마다 판정 시간을 다시 재고 작품 캡션을 도로 접는다 */
  useEffect(() => { startRef.current = Date.now(); setOpenPlate(false); setWarn(""); }, [items.length]);

  if (anchorDone(sv)) {
    return <div className="ok-note">예시 유물 판정을 마쳤습니다 — 네 쌍 모두 기록되었습니다. 고맙습니다.</div>;
  }
  if (!pairs.length) return null;

  const doneN = items.length;
  const cur = pairs[Math.min(doneN, pairs.length - 1)];
  const i = Math.min(doneN, pairs.length - 1);
  const hi = hiSideOf(me && me.sid, i);
  const labelOf = (side) => (side === hi ? LABEL_HI : LABEL_LO);

  const save = () => {
    const ms = Date.now() - startRef.current;
    if (!win) { setWarn("어느 쪽이 더 그럴듯한지 먼저 고르세요."); return; }
    if (why.trim().length < ANCHOR_MIN_WHY) { setWarn("고른 이유를 " + ANCHOR_MIN_WHY + "자 이상 써 주세요."); return; }
    if (!tag) { setWarn("무엇이 결정적이었는지 하나 고르세요."); return; }
    if (ms < ANCHOR_MIN_SEC * 1000) { setWarn("두 작품을 한 번 더 보고 골라 주세요."); startRef.current = Date.now() - ANCHOR_MIN_SEC * 1000; return; }
    const rec = { i, id: cur.id, hi, win, why: why.trim(), tag, ms, plateOpened: openPlate, at: new Date().toISOString() };
    const next = { ...sv, ver: ANCHOR_VER, cond: condOf(me && me.sid), startedAt: sv.startedAt || new Date().toISOString(), items: items.concat(rec) };
    onChange(next);
    setWin(null); setWhy(""); setTag(null); setWarn("");
    if (doneN + 1 >= pairs.length) onSubmit(next);
  };

  /* 컴포넌트가 아니라 조각을 돌려주는 함수다 — 컴포넌트로 두면 이유를 한 글자 칠 때마다
     새 타입이 되어 두 작품이 통째로 다시 붙고 이미지가 깜빡인다 */
  const work = (side) => {
    const w = cur[side];
    return (
      <div className={"an-work" + (win === side ? " on" : "")}>
        <div className="an-img">
          {w.img ? <img src={w.img} alt={w.title} /> : <span className="ph">이미지 없음</span>}
        </div>
        <div className="an-title">「{w.title}」</div>
        {openPlate ? (
          <dl className="an-plate">
            <dt>유물 명칭</dt><dd>{w.relic}</dd>
            <dt>추정 연대</dt><dd>{w.era}</dd>
            <dt>재질</dt><dd>{w.mat}</dd>
            <dt>출토 맥락</dt><dd>{w.ctx}</dd>
            <dt>AI 활용 범위</dt><dd className="an-ai">{labelOf(side)}</dd>
          </dl>
        ) : <div className="an-plate-hidden">작품 캡션 접힘</div>}
        <button type="button" className={"btn small " + (win === side ? "" : "ghost")} onClick={() => { setWin(side); setWarn(""); }}>
          {win === side ? "고름" : "이쪽"}
        </button>
      </div>
    );
  };

  return (
    <div className="card an-card">
      <div className="card-head">
        <span className="card-code">예시 판정</span>
        <span className="card-title">두 유물 가운데 어느 쪽이 더 성립하는가</span>
        <span className="card-sess">{doneN} / {pairs.length}</span>
      </div>
      <div className="card-note">
        우리 반 작품이 아니라 <b>선생님이 준비한 예시 유물</b>입니다. 성적과 관계없습니다.
        네 쌍을 차례로 보고, 매번 한 쪽을 고르고 그 이유를 한 문장으로 써 주세요.
      </div>
      <div className="card-body">
        <div className="an-q">{ANCHOR_QUESTION}</div>
        <div className="an-pair">
          {work("a")}{work("b")}
        </div>
        <div className="an-tools">
          <button type="button" className="btn small ghost" onClick={() => setOpenPlate((v) => !v)}>
            {openPlate ? "작품 캡션 접기" : "작품 캡션 보기"}
          </button>
          <span className="hint">먼저 이미지만 보고 판단해도 되고, 작품 캡션을 펼쳐 보고 판단해도 됩니다.</span>
        </div>

        <div className="field">
          <label>고른 이유를 한 문장으로 ({ANCHOR_MIN_WHY}자 이상)</label>
          <input value={why} maxLength={200} onChange={(e) => { setWhy(e.target.value); setWarn(""); }}
            placeholder="예: 손잡이 안쪽만 닳아 있어서 실제로 쥐고 쓴 물건처럼 보였다" />
        </div>
        <div className="field">
          <label>무엇이 결정적이었나요?</label>
          <div className="an-tags">
            {ANCHOR_TAGS.map((t) => (
              <button type="button" key={t.k} className={tag === t.k ? "on" : ""} title={t.desc}
                onClick={() => { setTag(t.k); setWarn(""); }}>{t.label}</button>
            ))}
          </div>
        </div>

        {warn && <div className="warn-note">{warn}</div>}
        <div className="sv-foot">
          <button className="btn" disabled={busy} onClick={save}>
            {busy ? "저장 중…" : doneN + 1 >= pairs.length ? "마지막 쌍 — 제출하기" : "다음 쌍 →"}
          </button>
          <span className="hint">고른 것은 되돌릴 수 없습니다. 한 쌍에 1분 남짓 걸립니다.</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- 교사 화면 ---------- */

export function AnchorPanel({ ids, roster, surveyMap, cfg, onSave, sampleMode }) {
  const conf = cfg || DEFAULT_ANCHOR;
  const pairs = conf.pairs || DEFAULT_ANCHOR.pairs;
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState(null);   // 편집 중인 쌍 — 키 입력마다 서버에 쓰지 않고 로컬에 들고 있다가 0.8초 쉬면 저장
  const [saveSt, setSaveSt] = useState(null); // null | saving | saved | err
  const saveT = useRef(null);
  const livePairs = draft || pairs;
  const ready = anchorReady({ ...conf, pairs: livePairs });

  const blocks = ids.map((id) => ({ id, nick: (roster[id] || {}).nick || "", an: (surveyMap[id] || {}).anchor || null }))
    .filter((r) => r.an && (r.an.items || []).length);
  const doneRows = blocks.filter((r) => anchorDone(r.an));

  /* 조건별 「AI 전면」 선택률 — 라벨이 무작위 배정되므로 두 조건의 차이가 곧 라벨 효과 */
  const flat = [];
  doneRows.forEach((r) => (r.an.items || []).forEach((x) => flat.push(x)));
  const chose = flat.filter((x) => x.win === x.hi).length;
  const rate = flat.length ? chose / flat.length : null;
  const mean = doneRows.length
    ? doneRows.reduce((a, r) => a + (anchorScore(r.an) || 0), 0) / doneRows.length : null;
  const plateRate = flat.length ? flat.filter((x) => x.plateOpened).length / flat.length : null;
  const tagN = ANCHOR_TAGS.map((t) => ({ t, n: flat.filter((x) => x.tag === t.k).length }));

  const pendingRef = useRef(null); // 아직 서버로 나가지 않은 pairs — 언마운트·열림 토글 때 잃지 않기 위해
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const setPair = (i, side, key, val) => {
    const next = livePairs.map((p, j) => (j === i ? { ...p, [side]: { ...p[side], [key]: val } } : p));
    setDraft(next);
    pendingRef.current = next;
    setSaveSt("saving");
    if (saveT.current) clearTimeout(saveT.current);
    saveT.current = setTimeout(async () => {
      saveT.current = null;
      pendingRef.current = null;
      // pairs만 부분 저장한다 — 열림 상태(open)까지 함께 보내면 키 입력 시점에 캡처된
      // 옛 open이 0.8초 뒤 도착해, 그 사이 누른 열림/잠김을 도로 뒤집는다.
      const ok = await onSaveRef.current({ ver: ANCHOR_VER, pairs: next });
      setSaveSt(ok === false ? "err" : "saved");
      // 더 새 편집이 없으면 draft를 접어 서버 상태(cfg)를 다시 따라간다 —
      // 계속 들고 있으면 다른 세션이 고친 쌍이 이 화면에 영영 나타나지 않는다.
      if (ok !== false && !saveT.current) setDraft(null);
    }, 800);
  };
  // 언마운트가 예약된 저장을 버리면 배지가 "저장 중…"이라 말한 편집이 조용히 사라진다 — 즉시 밀어 보낸다
  useEffect(() => () => {
    if (saveT.current) clearTimeout(saveT.current);
    if (pendingRef.current) onSaveRef.current({ ver: ANCHOR_VER, pairs: pendingRef.current });
  }, []);
  const toggleOpen = async () => {
    if (!ready && !conf.open) return;
    setBusy(true);
    // 예약된 쌍 저장이 있으면 함께 실어 보낸다 — 방금 채운 이미지 없이 열리는 일이 없도록
    const hadPending = !!pendingRef.current;
    if (saveT.current) { clearTimeout(saveT.current); saveT.current = null; }
    pendingRef.current = null;
    const patch = hadPending
      ? { ver: ANCHOR_VER, open: !conf.open, pairs: livePairs }
      : { ver: ANCHOR_VER, open: !conf.open };
    const ok = await onSave(patch);
    if (hadPending) setSaveSt(ok === false ? "err" : "saved");
    if (ok !== false && !saveT.current) setDraft(null);
    setBusy(false);
  };

  const exportCSV = () => {
    const head = ["학번", "별명", "조건", "제출시각", "anchorScore(0~4)", "작품 캡션 펼침 비율"];
    pairs.forEach((p, i) => head.push(p.id + ":고지높은쪽", p.id + ":선택", p.id + ":AI전면고름", p.id + ":축", p.id + ":초", p.id + ":이유"));
    const rows = ids.map((id) => {
      const an = (surveyMap[id] || {}).anchor;
      const its = (an && an.items) || [];
      const r = [id, (roster[id] || {}).nick || "", an ? an.cond : "", an && an.submittedAt ? an.submittedAt : "",
        an ? (anchorScore(an) != null ? anchorScore(an) : "") : "",
        an && anchorPlateRate(an) != null ? Math.round(anchorPlateRate(an) * 100) / 100 : ""];
      pairs.forEach((p, i) => {
        const x = its.find((y) => y.i === i);
        r.push(x ? x.hi : "", x ? x.win : "", x ? (x.win === x.hi ? 1 : 0) : "", x ? x.tag : "",
          x ? Math.round(x.ms / 1000) : "", x ? x.why : "");
      });
      return r;
    });
    const esc = (c) => { let s = String(c == null ? "" : c); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
    const csv = "﻿" + [head, ...rows].map((r) => r.map(esc).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "앵커판정_학번포함_" + new Date().toISOString().slice(2, 10).replace(/-/g, "") + ".csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const pct = (v) => (v == null ? "-" : Math.round(v * 100) + "%");

  return (
    <div className="card">
      <div className="card-head"><span className="card-code">앵커</span><span className="card-title">고지 라벨을 바꿔 붙인 네 쌍</span></div>
      <div className="card-note">
        같은 이미지에 <b>「AI 활용 범위」 문구만 다르게</b> 붙여 학생마다 무작위로 보여 줍니다.
        라벨이 무작위 배정되므로 두 조건의 선택률 차이가 곧 <b>고지가 깎는 양</b>입니다.
        학급 밖 예시 유물이라 어떤 학생도 이 조작 때문에 손해 보지 않습니다.
      </div>
      <div className="card-body">
        <div className="an-admin">
          <div className="seg">
            <button className={conf.open ? "on-ok" : ""} disabled={busy || sampleMode || !ready} onClick={() => { if (!conf.open) toggleOpen(); }}>열림</button>
            <button className={!conf.open ? "on-no" : ""} disabled={busy || sampleMode} onClick={() => { if (conf.open) toggleOpen(); }}>잠김</button>
          </div>
          <span className="hint">
            {ready ? "네 쌍의 이미지가 모두 채워졌습니다. 열면 학생 화면에 나타납니다."
              : "이미지가 비어 있는 칸이 있어 아직 열 수 없습니다 — 여덟 칸을 모두 채우세요."}
          </span>
        </div>

        <div className="sv-block-t">쌍 설정
          {saveSt && <span className="hint" role="status" aria-live="polite" style={{ marginLeft: 8, fontWeight: 400, color: saveSt === "err" ? "var(--seal)" : "var(--sub)" }}>
            {saveSt === "saving" ? "저장 중…" : saveSt === "err" ? "저장 실패 — 잠시 뒤 다시 입력해 보세요" : "저장됨"}
          </span>}
        </div>
        <p className="hint" style={{ marginBottom: 8 }}>
          이미지는 <code>public/img/anchor/</code>에 넣고 <code>img/anchor/a1.jpg</code>처럼 적거나, 인터넷 주소를 그대로 붙여 넣습니다.
          두 조건이 <b>완전히 같은 이미지</b>를 봐야 하므로 이미지는 쌍마다 하나씩만 정하면 됩니다.
        </p>
        {livePairs.map((p, i) => (
          <div className="an-edit" key={p.id}>
            <div className="an-edit-h">{p.id}</div>
            {["a", "b"].map((side) => (
              <div className="an-edit-row" key={side}>
                <span className="an-side">{side.toUpperCase()}</span>
                <input placeholder="이미지 경로 또는 주소" value={p[side].img || ""} disabled={sampleMode}
                  onChange={(e) => setPair(i, side, "img", e.target.value)} />
                <input placeholder="작품 제목" value={p[side].title || ""} disabled={sampleMode}
                  onChange={(e) => setPair(i, side, "title", e.target.value)} />
                <input placeholder="유물 명칭" value={p[side].relic || ""} disabled={sampleMode}
                  onChange={(e) => setPair(i, side, "relic", e.target.value)} />
              </div>
            ))}
          </div>
        ))}

        <div className="sv-block-t">결과</div>
        <div className="kpis">
          <div className="kpi"><b>{doneRows.length}</b><span>제출 (총 {ids.length}명)</span></div>
          <div className="kpi"><b>{pct(rate)}</b><span>「AI 전면」 쪽을 고른 비율</span></div>
          <div className="kpi"><b>{mean == null ? "-" : Math.round(mean * 100) / 100}</b><span>1인 평균 (0~4)</span></div>
          <div className="kpi"><b>{pct(plateRate)}</b><span>작품 캡션을 펼쳐 본 비율</span></div>
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          「AI 전면」 선택률이 <b>50%보다 낮을수록</b> 학급이 고지를 깎은 것입니다. 정확히 50%면 라벨이 판정을 바꾸지 않았다는 뜻입니다.
          축 분포 — {tagN.map((x) => x.t.label + " " + x.n).join(" · ")}
        </p>
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
          <button className="btn" onClick={exportCSV} disabled={!doneRows.length}>앵커 판정 CSV 내려받기</button>
          <span className="hint">성향 설문 점수와 학번으로 이어 붙여 분석합니다. <b>이 파일에는 학번·별명이 들어갑니다</b> — 「연구」 탭의 익명 자료와 섞이지 않게 보관하세요.</span>
        </div>
        <div className="warn-note" style={{ marginTop: 12 }}>
          <b>판정이 끝나면 반드시 알려 주세요.</b> 같은 이미지에 서로 다른 고지 문구를 붙였다는 사실을 밝히고,
          누가 어느 쪽을 골랐는지 비교하는 것이 8차시 윤리 토의의 재료입니다. 밝히지 않고 끝내면 속인 것이 됩니다.
        </div>
      </div>
    </div>
  );
}

/* ---------- 스타일 ---------- */

const ANCHOR_CSS = `
.an-card{border-top:3px solid var(--amber)}
.an-q{font-family:var(--serif);font-size:15px;font-weight:700;line-height:1.5;margin-bottom:12px}
.an-pair{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.an-work{border:1px solid var(--line);background:#fff;padding:10px;display:flex;flex-direction:column;gap:8px}
.an-work.on{border-color:var(--amber);box-shadow:0 0 0 2px var(--amber) inset}
.an-img{background:var(--card2,#f2f2f2);aspect-ratio:4/3;display:flex;align-items:center;justify-content:center;overflow:hidden}
.an-img img{width:100%;height:100%;object-fit:cover}
.an-img .ph{font-family:var(--mono);font-size:11px;color:var(--sub);letter-spacing:.15em}
.an-title{font-family:var(--serif);font-size:15px;font-weight:700}
.an-plate{display:grid;grid-template-columns:70px 1fr;gap:3px 8px;font-size:11.5px;border-top:1px dashed var(--line);padding-top:8px}
.an-plate dt{color:var(--sub)}
.an-plate dd{margin:0}
.an-plate .an-ai{color:var(--seal)}
.an-plate-hidden{font-family:var(--mono);font-size:11px;color:var(--sub);letter-spacing:.12em;
  background:var(--card2);border:1px solid var(--line2);text-align:center;padding:10px}
.an-tools{display:flex;align-items:center;gap:10px;margin:12px 0;flex-wrap:wrap}
.an-tags{display:flex;gap:6px;flex-wrap:wrap}
.an-tags button{padding:7px 12px;border:1px solid var(--line);background:#fff;font-family:var(--sans);font-size:12.5px;cursor:pointer}
.an-tags button.on{background:var(--amber);border-color:var(--amber);color:#fff}
.an-admin{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:6px}
.an-edit{border:1px solid var(--line2);padding:8px 10px;margin-bottom:8px;background:var(--card2)}
.an-edit-h{font-family:var(--mono);font-size:11px;color:var(--amber);letter-spacing:.1em;margin-bottom:6px}
.an-edit-row{display:flex;gap:6px;align-items:center;margin-bottom:5px}
.an-edit-row input{flex:1;min-width:0;padding:5px 8px;border:1px solid var(--line);background:#fff;font-family:var(--sans);font-size:12px}
.an-side{font-family:var(--mono);font-size:11px;color:var(--sub);width:14px;flex:0 0 auto}
@media(max-width:640px){
  .an-pair{grid-template-columns:1fr}
  .an-edit-row{flex-wrap:wrap}
  .an-edit-row input{flex:1 1 100%}
}
`;

export function AnchorStyle() { return <style>{ANCHOR_CSS}</style>; }
