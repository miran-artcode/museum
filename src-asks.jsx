import React, { createContext, useContext, useMemo, useState } from "react";
import {
  ASK_MAX, REV_PER_ANSWER, REV_BYTES, normQ, askKey, isAskKey, askLessonOf, rememberQ,
  lessonAsks, resolveAsks, askAnswerRows, askStats, askIndex, gramSet, jaccard,
} from "./src-asks-core.mjs";

/* ============================================================
   생각해 볼 질문: 학생이 골라서 답을 쓰는 화면과 교사 화면 (2026-10-01)
   ------------------------------------------------------------
   학생: 강의 노트 읽기 자료의 「생각해 볼 질문」마다 「내 생각 쓰기」 버튼이 있고, 누르면 답 칸이 열린다.
         쓰지 않아도 되는 선택 활동이다. 쓴 답은 다음에 열어도 펼쳐져 보인다.
         입력은 기록지 setField로 들어가 자동 저장·붙여넣기 기록·입력 잠금이 그대로 적용된다.
         질문 사본·입력 시각·수정 이력은 setField 안에서 askTrace가 쓴다 (src-asks-core.mjs).
   교사: 학생 상세 「기록 열람」의 차시마다 답 카드(AskReader), 「기록 현황」의 질문별 모아 보기(AskClassCard).
   연구: 참여자 단위 변수(ASK_RESEARCH_VARS)와 답 단위 CSV(askResearchFile).

   학생 화면은 StudentApp이 AskScope로 기록지와 setField를 내려 줄 때만 입력칸을 그린다.
   교사 「수업 안내」·수업 편집 미리 보기·예시 기록지는 AskScope가 없어 예전처럼 질문만 보인다.
   ============================================================ */

export const AskCtx = createContext(null);

export function AskScope({ ws, setField, locked, save, children }) {
  return <AskCtx.Provider value={{ ws: ws || {}, setField, locked: !!locked, save }}>{children}</AskCtx.Provider>;
}

const p2 = (n) => String(n).padStart(2, "0");
function fmtAt(iso) {
  const d = new Date(iso || "");
  if (isNaN(d)) return "-";
  return (d.getMonth() + 1) + "월 " + d.getDate() + "일 " + p2(d.getHours()) + ":" + p2(d.getMinutes());
}

/* 답 칸 높이: 줄 수에 맞춰 3~12줄 */
function rowsFor(v) {
  const lines = String(v || "").split("\n").reduce((a, l) => a + Math.max(1, Math.ceil(l.length / 36)), 0);
  return Math.min(12, Math.max(3, lines + 1));
}

/* 화면 위쪽 저장 표시와 같은 말 */
const SAVE_LABEL = {
  dirty: "입력 중…",
  saving: "저장 중…",
  saved: "저장됨",
  queued: "연결 대기(기기에 담아 둠)",
  err: "저장 실패, 5초 뒤 재시도",
};

/* 읽기 자료 끝의 질문 상자. fmt는 강의 노트의 글 안 표시(**강조**·링크)를 그리는 함수 (src-reading.jsx의 inline) */
export function AskBox({ L, rd, asks, fmt }) {
  const ctx = useContext(AskCtx);
  const list = (Array.isArray(asks) ? asks : []).filter((a) => a && String(a).trim());
  const show = typeof fmt === "function" ? fmt : (s) => s;
  if (!list.length) return null;
  if (!ctx || !L) {
    return (
      <div className="rd-asks">
        <div className="rd-asks-h">생각해 볼 질문</div>
        <ol>{list.map((a, i) => <li key={i}>{show(a)}</li>)}</ol>
      </div>
    );
  }
  return <AskWrite ctx={ctx} L={L} rd={rd} list={list} show={show} />;
}

function AskWrite({ ctx, L, rd, list, show }) {
  const { ws, setField, locked, save } = ctx;
  const res = useMemo(() => resolveAsks(L, ws), [L, ws]);
  const [opened, setOpened] = useState(() => new Set());
  const [focusK, setFocusK] = useState("");
  const [lastK, setLastK] = useState("");
  const readings = Array.isArray(L.readings) ? L.readings : [];
  const ri = readings.indexOf(rd);
  // 질문이 바뀌어 잇지 못한 답은 이 차시의 마지막 질문 상자 아래에 읽기 전용으로 보인다
  const lastRi = useMemo(() => {
    let r = -1;
    readings.forEach((x, i) => { if (x && Array.isArray(x.asks) && x.asks.some((a) => a && String(a).trim())) r = i; });
    return r;
  }, [L]);

  const items = list.map((a, i) => {
    const q = normQ(a);
    const own = askKey(L.n, q);
    const slot = res.slots.find((s) => s.key === own && s.ri === ri) || res.slots.find((s) => s.key === own);
    const k = slot ? slot.ansKey : own;
    rememberQ(k, q);
    return { a, i, k, val: typeof ws[k] === "string" ? ws[k] : "" };
  });

  const idOf = (i) => "askq-" + L.n + "-" + ri + "-" + i;
  return (
    <div className="rd-asks rd-asks-w">
      <div className="rd-asks-h">생각해 볼 질문</div>
      {!locked && <p className="rd-asks-tip">원하는 질문을 골라 내 생각을 써 봅시다.</p>}
      <ol>
        {items.map(({ a, i, k, val }) => {
          const open = val.trim() !== "" || opened.has(k);
          const n = val.length;
          return (
            <li key={i} className="rd-ask">
              <div className="rd-ask-q" id={idOf(i)}>{show(a)}</div>
              {open ? (
                <div className="rd-ask-a" data-fk={k}>
                  <textarea value={val} maxLength={ASK_MAX} rows={rowsFor(val)} disabled={locked}
                    aria-labelledby={idOf(i)} autoFocus={focusK === k}
                    onChange={(e) => { setLastK(k); setField(k, e.target.value); }} />
                  <div className="rd-ask-foot">
                    {lastK === k && SAVE_LABEL[save] && <span className="rd-ask-st">{SAVE_LABEL[save]}</span>}
                    {n >= ASK_MAX * 0.8 && <span className={"rd-ask-n" + (n >= ASK_MAX ? " full" : "")}>{n} / {ASK_MAX}자</span>}
                  </div>
                </div>
              ) : !locked ? (
                <button type="button" className="rd-ask-btn" aria-describedby={idOf(i)}
                  onClick={() => { setOpened((s) => new Set(s).add(k)); setFocusK(k); }}>
                  내 생각 쓰기
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>
      {ri === lastRi && res.orphans.length > 0 && (
        <div className="rd-ask-old">
          <div className="rd-ask-old-h">질문이 바뀌기 전에 쓴 답</div>
          {res.orphans.map((o) => (
            <div key={o.key}>
              {o.q && <p className="rd-ask-old-q">{o.q}</p>}
              <p className="rd-ask-old-a">{o.a}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- 교사: 학생 상세 「기록 열람」의 차시 카드 ---------- */

const HOW_NOTE = {
  moved: "질문 문장이 바뀌기 전에 쓴 답",
  orphan: "지금 강의 노트에 없는 질문",
};
const WHY_LABEL = {
  cut: "한 번에 지우거나 바꿈",
  resume: "5분 넘게 둔 뒤 다시 고침",
};

function AskRow({ r }) {
  const seen = r.qSeen && r.qSeen !== r.q ? r.qSeen : "";
  return (
    <div className="ask-r">
      <div className="ask-r-q">
        {r.stage && <span className="ask-r-tag">{r.stage}</span>}
        {r.q || "(질문 문장 없음)"}
        {HOW_NOTE[r.how] && <span className="ask-r-note">{HOW_NOTE[r.how]}</span>}
      </div>
      {seen && <div className="ask-r-seen">답할 때 본 질문: {seen}</div>}
      <div className="ask-r-a">{r.a.trim() ? r.a : <span className="hint">(지금은 비어 있음)</span>}</div>
      <div className="ask-r-m">
        {r.chars}자 · 처음 입력 {fmtAt(r.first)} · 마지막 입력 {fmtAt(r.last)} · 입력 {r.inputN}회
        {r.pasteN > 0 && " · 붙여넣기 " + r.pasteN + "건(" + r.pasteChars + "자)"}
        {r.revs.length > 0 && " · 수정 이력 " + r.revs.length + "건"}
      </div>
      {r.revs.length > 0 && (
        <details className="ask-r-revs">
          <summary>수정 이력 보기 (고치기 전 글)</summary>
          <ol>
            {r.revs.map((e, i) => (
              <li key={i}>
                <span className="ask-r-when">{fmtAt(e.at)} · {WHY_LABEL[e.why] || e.why}</span>
                <p>{e.prev}</p>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

export function AskReader({ ws, session, lessons }) {
  const Ls = useMemo(() => (lessons || []).filter((L) => L && L.session === session), [lessons, session]);
  const rows = useMemo(() => askAnswerRows(ws, Ls), [ws, Ls]);
  if (!rows.length) return null;
  const total = Ls.reduce((a, L) => a + lessonAsks(L).length, 0);
  const answered = rows.filter((r) => r.a.trim()).length;
  return (
    <div className="card">
      <div className="card-head">
        <span className="card-code">강의 노트</span>
        <span className="card-title">생각해 볼 질문에 쓴 답</span>
        <span className="card-sess">{session} · {answered}/{total}</span>
      </div>
      <div className="card-body">
        {rows.map((r) => <AskRow key={r.key} r={r} />)}
      </div>
    </div>
  );
}

/* ---------- 교사: 「기록 현황」의 질문별 모아 보기 ---------- */

export function AskClassCard({ ids, roster, wsMap, lessons, onSel, code }) {
  const sessions = useMemo(() => {
    const out = [];
    for (const L of lessons || []) if (lessonAsks(L).length && !out.includes(L.session)) out.push(L.session);
    return out;
  }, [lessons]);
  // 학생마다 답 목록. 질문 자리는 (차시, 읽기 자료 번호, 질문 번호)로 묶는다 (답 키는 학생마다 다를 수 있다: 질문이 바뀐 앞뒤)
  const data = useMemo(() => {
    const bySlot = new Map();
    let students = 0, answers = 0, orphans = 0;
    for (const id of ids || []) {
      const rows = askAnswerRows((wsMap || {})[id], lessons).filter((r) => r.a.trim());
      if (rows.length) students++;
      answers += rows.length;
      for (const r of rows) {
        if (r.how === "orphan") { orphans++; continue; }
        const sk = r.n + "|" + r.ri + "|" + r.qi;
        if (!bySlot.has(sk)) bySlot.set(sk, []);
        bySlot.get(sk).push({ id, a: r.a, how: r.how, revN: r.revs.length });
      }
    }
    return { bySlot, students, answers, orphans };
  }, [ids, wsMap, lessons]);
  const firstWithAns = sessions.find((s) => (lessons || []).some((L) => L.session === s && lessonAsks(L).some((q) => data.bySlot.has(q.n + "|" + q.ri + "|" + q.qi))));
  const [pick, setPick] = useState("");
  const sess = pick || firstWithAns || sessions[0] || "";
  const qs = (lessons || []).filter((L) => L.session === sess).flatMap((L) => lessonAsks(L));
  const nick = (id) => ((roster || {})[id] || {}).nick || "";

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-code">{code || "기록"}</span>
        <span className="card-title">생각해 볼 질문 답 (선택 활동)</span>
      </div>
      <div className="card-body">
        <p className="hint" style={{ marginTop: 0 }}>
          답을 하나 이상 쓴 학생 {data.students}명 / {(ids || []).length}명, 답 {data.answers}개.
          질문을 누르면 그 질문에 쓴 답이 모두 보입니다. 학번을 누르면 그 학생의 기록 열람으로 갑니다.
        </p>
        {sessions.length > 1 && (
          <div className="t-tabs" style={{ margin: "6px 0 8px" }}>
            {sessions.map((s) => (
              <button key={s} className={"btn small " + (s === sess ? "" : "ghost")} onClick={() => setPick(s)}>{s}</button>
            ))}
          </div>
        )}
        {qs.map((q) => {
          const list = data.bySlot.get(q.n + "|" + q.ri + "|" + q.qi) || [];
          return (
            <details className="ask-c" key={q.n + "-" + q.ri + "-" + q.qi}>
              <summary>
                {q.stage && <span className="ask-r-tag">{q.stage}</span>}
                {q.q}
                <span className="ask-c-n">{list.length}명</span>
              </summary>
              {list.length ? (
                <ul>
                  {list.map((x) => (
                    <li key={x.id}>
                      <button type="button" className="ask-c-who" onClick={() => onSel && onSel(x.id)}>{x.id}{nick(x.id) ? " · " + nick(x.id) : ""}</button>
                      {x.revN > 0 && <span className="ask-c-rev">수정 이력 {x.revN}건</span>}
                      <p>{x.a}</p>
                    </li>
                  ))}
                </ul>
              ) : <p className="hint">아직 답이 없습니다.</p>}
            </details>
          );
        })}
        {data.orphans > 0 && (
          <p className="hint" style={{ marginTop: 8 }}>
            질문 문장이 크게 바뀌거나 지워져 지금 질문에 잇지 못한 답이 {data.orphans}개 있습니다. 학생 상세의 기록 열람에서 볼 수 있습니다.
          </p>
        )}
      </div>
    </div>
  );
}

/* ---------- 붙여넣기 표 같은 곳에서 답 키를 읽는 이름으로 (src-app.jsx fieldMeta) ---------- */
export function askFieldMeta(key, lessons) {
  if (!isAskKey(key)) return null;
  const n = askLessonOf(key);
  const L = (lessons || []).find((x) => x && x.n === n);
  const s = askIndex(lessons).get(key);
  return {
    secId: "ask" + n, fieldKey: key.slice(key.indexOf(".") + 1),
    session: L ? L.session : n + "차시", code: L ? L.session : n + "차시",
    kind: "생각해 볼 질문", secTitle: s ? s.h : "",
    label: s ? s.q : "질문 문장이 바뀐 답",
  };
}

/* ---------- 연구 자료 ---------- */

/* askStats는 변수마다 부르므로 기록지 객체별로 한 번만 계산한다 */
const STATS = new WeakMap();
function statsOf(ws) {
  if (!ws || typeof ws !== "object") return askStats(ws);
  if (!STATS.has(ws)) STATS.set(ws, askStats(ws));
  return STATS.get(ws);
}

/* 참여자 단위 자료(연구자료_참여자단위.csv)의 열. src-app.jsx RESEARCH_VARS에 덧붙는다 */
export const ASK_RESEARCH_VARS = [
  { k: "ask_n", name: "생각해 볼 질문 답 수", unit: "개", def: "강의 노트 「생각해 볼 질문」(골라서 쓰는 선택 활동) 가운데 답이 있는 질문의 수", get: (c) => statsOf(c.ws).n },
  { k: "ask_lessons", name: "답을 쓴 차시 수", unit: "개", def: "생각해 볼 질문에 답을 하나 이상 쓴 차시의 수", get: (c) => statsOf(c.ws).lessons },
  { k: "ask_chars", name: "생각해 볼 질문 글자 수", unit: "자", def: "생각해 볼 질문 답의 글자 수 합(앞뒤 공백 제외). 이 답도 기록지의 글이므로 written_bytes·src_ratio·approp의 분모에 들어간다", get: (c) => statsOf(c.ws).chars },
  { k: "ask_input_n", name: "답 입력 횟수", unit: "회", def: "생각해 볼 질문 답 칸의 입력 이벤트 수 합", get: (c) => statsOf(c.ws).inputN },
  { k: "ask_rev_n", name: "답 수정 이력", unit: "건", def: "생각해 볼 질문 답의 수정 이력 건수. 한 번에 9자 넘게 지우거나 바꾼 때(같은 답은 2분에 한 번, edit_n과 같은 기준)와 5분 넘게 둔 답을 다시 고치기 시작한 때 고치기 전 글을 기록한다. edit_n(_log)에는 들어가지 않는다", get: (c) => statsOf(c.ws).revN },
  { k: "ask_rev_ans_n", name: "수정 이력이 있는 답 수", unit: "개", def: "수정 이력이 한 건 이상 있는 생각해 볼 질문 답의 수", get: (c) => statsOf(c.ws).revAnsN },
  { k: "ask_paste_n", name: "답에 붙여넣은 건수", unit: "건", def: "생각해 볼 질문 답에 20자 이상 붙여넣은 횟수 (paste_n에도 들어 있다)", get: (c) => statsOf(c.ws).pasteN },
  { k: "ask_pruned", name: "덜어 낸 답 수정 이력", unit: "건", def: "답 수정 이력이 상한(답 하나 " + REV_PER_ANSWER + "건, 전체 " + Math.round(REV_BYTES / 1000) + "KB)에 닿아 오래된 순으로 덜어 낸 건수. 0이 아니면 그 참여자의 답 수정 이력은 완전하지 않다", get: (c) => statsOf(c.ws).pruned },
];
/* 동의 항목: 입력 횟수·수정 이력은 활동 흔적(log), 붙여넣기는 paste. 나머지는 기록지 서술(rec) */
export const ASK_VAR_NEED = { ask_input_n: "log", ask_rev_n: "log", ask_rev_ans_n: "log", ask_pruned: "log", ask_paste_n: "paste" };

/* 답 단위 자료 (참여자 × 답이 1행). src-app.jsx 연구 탭의 FILES 목록에 들어간다.
   cases는 개수 표시에만 쓰고, 내려받을 행은 exportCases()로 받는다: 다른 연구 파일과 같이
   가명 번호(pid)·학급 코드가 붙고 pid 순으로 정렬된 행이다 (학번 순서가 파일에 남지 않게) */
export function askResearchFile({ cases, exportCases, tag, stamp, download, toCSV, agreed, lessons }) {
  const fn = "연구자료_생각해볼질문" + tag + "_" + stamp + ".csv";
  const total = (cases || []).reduce((a, c) => a + statsOf(c.ws).n, 0);
  const ok = (c, k) => (typeof agreed === "function" ? agreed(c.consent, k) : true);
  const go = async () => {
    const xs = await exportCases(); if (!xs) return;
    const head = ["pid", "class", "session", "lesson", "reading_stage", "reading_title", "ask_key", "match", "question", "question_seen",
      "answer", "chars", "first_at", "last_at", "input_n", "rev_n", "rev_resume_n", "earliest_prev_text", "rev_texts",
      "earliest_final_overlap", "paste_n", "paste_chars"];
    const rows = [];
    xs.forEach((c) => {
      const log = ok(c, "log"), paste = ok(c, "paste");
      askAnswerRows(c.ws, lessons).forEach((r) => {
        const first = r.revs.length ? r.revs[0].prev : "";
        rows.push([c.pid, c.ccode, r.session, r.n, r.stage, r.h, r.key, r.how, r.q, r.qSeen, r.a, r.chars,
          log ? r.first : "", log ? r.last : "", log ? r.inputN : "",
          log ? r.revs.length : "", log ? r.revs.filter((e) => e.why === "resume").length : "",
          log ? first : "", log ? r.revs.map((e) => e.at + " " + e.prev).join(" ‖ ") : "",
          log && first && r.a.trim() ? Math.round(jaccard(gramSet(first), gramSet(r.a)) * 100) : "",
          paste ? r.pasteN : "", paste ? r.pasteChars : ""]);
      });
    });
    download(fn, toCSV(head, rows), "text/csv");
  };
  return {
    k: "asks", h: "생각해 볼 질문 답 단위 자료", fn,
    p: "참여자 × 답을 쓴 질문이 1행. 강의 노트 「생각해 볼 질문」에 골라 쓴 답과 질문 문장(답할 때 본 문장 포함), 처음·마지막 입력 시각, 입력 횟수, 수정 이력(고치기 전 글 전문), 가장 이른 이전 글과 최종 답의 글자 3-gram 겹침, 붙여넣기 건수를 담습니다. match 열은 same(같은 질문)·moved(질문 문장이 다듬어진 뒤 이음)·orphan(지금 강의 노트에 없는 질문)입니다. 지금 " + total + "개.",
    go,
  };
}

/* ---------- 스타일 ---------- */
const ASK_CSS = `
.rd-asks-tip{margin:-2px 0 6px;font-size:12.5px;line-height:1.5;color:var(--sub)}
.rd-asks-w li.rd-ask{padding-bottom:10px}
.rd-asks-w li.rd-ask + li.rd-ask{border-top:1px dotted var(--line2);padding-top:9px}
.rd-asks-w li.rd-ask + li.rd-ask::before{top:11px}
.rd-ask-btn{display:inline-block;margin-top:6px;font:600 13px/1.4 var(--sans);color:var(--patina);background:#fff;border:1px solid var(--patina);padding:5px 12px;cursor:pointer;border-radius:0}
.rd-ask-btn:hover{background:var(--patina);color:#fff}
.rd-ask-btn:focus-visible{outline:3px solid var(--ink);outline-offset:2px}
.rd-ask-a{margin-top:6px}
.rd-ask-a textarea{display:block;width:100%;box-sizing:border-box;font-family:var(--sans);font-size:15px;line-height:1.7;letter-spacing:normal;color:var(--ink);padding:9px 11px;border:1px solid var(--line);border-radius:0;background:#fff;resize:vertical;min-height:84px;word-break:keep-all}
.rd-ask-a textarea:focus{outline:2px solid var(--ink);outline-offset:-1px}
.rd-ask-a textarea:disabled{background:#f6f6f4;color:#555}
.rd-ask-foot{display:flex;gap:12px;justify-content:flex-end;min-height:18px;margin-top:2px;font-size:12px;line-height:1.5;color:var(--sub)}
.rd-ask-n.full{color:var(--seal);font-weight:700}
.rd-ask-old{margin-top:12px;border-top:1px solid var(--line2);padding-top:8px}
.rd-ask-old-h{font-size:12px;font-weight:700;color:var(--sub);margin-bottom:2px}
.rd-ask-old-q{margin:8px 0 3px;font-size:13px;line-height:1.6;color:var(--sub);word-break:keep-all}
.rd-ask-old-a{margin:0;font-size:14px;line-height:1.7;white-space:pre-wrap;word-break:keep-all;background:#fff;border:1px solid var(--line2);padding:8px 10px}
@media(max-width:560px){.rd-ask-a textarea{font-size:16px}}

.ask-r{padding:12px 0;border-top:1px solid var(--line2)}
.ask-r:first-child{border-top:0;padding-top:0}
.ask-r-q{font-size:13px;line-height:1.6;color:var(--sub);word-break:keep-all}
.ask-r-tag{display:inline-block;font:700 11px/1.5 var(--sans);color:var(--patina);border:1px solid var(--patina);padding:0 5px;margin-right:6px;vertical-align:1px}
.ask-r-note{margin-left:6px;font-size:11.5px;color:var(--seal)}
.ask-r-seen{margin-top:2px;font-size:12px;line-height:1.5;color:var(--sub);word-break:keep-all}
.ask-r-a{margin-top:4px;font-size:14.5px;line-height:1.7;white-space:pre-wrap;word-break:keep-all;color:var(--ink)}
.ask-r-m{margin-top:4px;font-size:12px;line-height:1.5;color:var(--sub)}
.ask-r-revs{margin-top:6px;font-size:12.5px}
.ask-r-revs summary{cursor:pointer;color:var(--ink)}
.ask-r-revs ol{margin:6px 0 0;padding-left:20px}
.ask-r-when{font-size:12px;color:var(--sub)}
.ask-r-revs p{margin:2px 0 8px;white-space:pre-wrap;word-break:keep-all;color:#444}
.ask-c{border-top:1px solid var(--line2);padding:8px 0}
.ask-c summary{cursor:pointer;font-size:13.5px;line-height:1.6;word-break:keep-all}
.ask-c-n{margin-left:8px;font-weight:700;color:var(--ink);white-space:nowrap}
.ask-c ul{list-style:none;margin:8px 0 0;padding:0 0 0 4px}
.ask-c li{padding:7px 0;border-top:1px dotted var(--line2)}
.ask-c-who{all:unset;cursor:pointer;font-size:12px;font-weight:700;color:var(--seal);border-bottom:1px solid currentColor}
.ask-c-who:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
.ask-c-rev{margin-left:8px;font-size:11.5px;color:var(--sub)}
.ask-c li p{margin:3px 0 0;font-size:14px;line-height:1.65;white-space:pre-wrap;word-break:keep-all}
`;

export function AskStyle() { return <style>{ASK_CSS}</style>; }
