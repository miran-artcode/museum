/* 디지털 에스키스의 「기록」 창과 「과정 다시 보기」 창.
   - HistoryPanel: 되돌릴 수 있는 작업 목록(누르면 그 지점으로)과 저장 버전 목록. 창의 위치·테두리·스크롤은 부모가 정한다.
   - ReplayPlayer: 과정 기록을 화면 밖 엔진으로 처음부터 실행해 보여 주는 전체 화면 창. 영상 파일로도 내려받는다.
   모양은 SKETCH_HISTORY_CSS(접두사 skh-). ReplayPlayer는 .skx 밖(교사 화면 등)에서도 쓸 수 있게 skh- 클래스만 쓴다. */
import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Engine, opLabel, logStats, prepareLog, paperColor } from "./src-sketch-engine.mjs";
import { Icon, PanelHead } from "./src-sketch-ui.jsx";

const p2 = (n) => String(n).padStart(2, "0");
/* 작업 시각 → HH:MM:SS */
function clock(t) {
  if (!t) return "";
  const d = new Date(t);
  return isNaN(d.getTime()) ? "" : p2(d.getHours()) + ":" + p2(d.getMinutes()) + ":" + p2(d.getSeconds());
}
/* 그린 시간: 1분 미만이면 초, 60분을 넘으면 시간과 분 */
function dur(ms) {
  if (!(ms > 0)) return "0초";
  if (ms < 60000) return Math.max(1, Math.round(ms / 1000)) + "초";
  const m = Math.round(ms / 60000);
  return m < 60 ? m + "분" : Math.floor(m / 60) + "시간" + (m % 60 ? " " + (m % 60) + "분" : "");
}
const statText = (st) => "획 " + st.strokes + "개 · 그린 시간 " + dur(st.ms);
/* 같은 묶음(grp)은 엔진이 한 번에 되돌리므로, 묶음 안의 줄을 눌러도 묶음 끝으로 간다 */
function jumpTarget(seq, k) {
  let n = k + 1;
  const g = seq[k] && seq[k].grp;
  if (g) while (n < seq.length && seq[n].grp === g) n++;
  return n;
}

const TABS = [["ops", "작업 내역"], ["vers", "저장 버전"]];

export function HistoryPanel({ eng, tick, versions = [], cur, owner, MediaThumb, fmtTime, busy, onJump, onRestore, onSaveVersion, onReplay, onClose }) {
  const [tab, setTab] = useState("ops");
  const uid = useId();
  const curRow = useRef(null);
  const listRef = useRef(null);
  const tabsRef = useRef(null);
  const shownTab = useRef("");

  const hist = (eng && eng.hist) || [], redo = (eng && eng.redo) || [], past = (eng && eng.past) || [];
  const seq = hist.concat(redo.slice().reverse());
  const at = hist.length;
  const last = seq[seq.length - 1];
  /* 지금 상태인 줄이 보이게: 창을 열 때와 목록이 바뀔 때만(다른 일로 다시 그려질 때는 스크롤을 건드리지 않는다) */
  const scrollKey = tab + "|" + at + "|" + seq.length + "|" + ((last && last.t) || 0);
  useEffect(() => {
    const row = curRow.current, box = listRef.current;
    const opened = shownTab.current !== tab;
    shownTab.current = tab;
    if (tab !== "ops" || !row || !box) return;
    /* scrollIntoView 는 페이지까지 스크롤한다. 창을 열거나 탭을 바꾼 직후에만 쓰고,
       그리는 동안(작업이 하나씩 늘 때)에는 목록 안에서만 움직여 캔버스가 밀리지 않게 한다 */
    if (opened) { try { row.scrollIntoView({ block: "nearest" }); } catch (e) {} return; }
    const top = row.offsetParent === box ? row.offsetTop : row.offsetTop - box.offsetTop, bottom = top + row.offsetHeight;
    if (top < box.scrollTop) box.scrollTop = top;
    else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight;
  }, [scrollKey]);

  /* 새 캔버스·불러온 그림은 작업 수에서 뺀다(기록 전용 줄) */
  const sealed = past.reduce((n, op) => n + (op && op.kind !== "new" && op.kind !== "base" ? 1 : 0), 0);
  const stats = useMemo(() => logStats(eng ? eng.log() : []), [eng, tick, hist.length, redo.length, past.length]);
  const vers = (Array.isArray(versions) ? versions : []).filter((v) => v && v.ref);
  const time = (iso) => (iso && fmtTime ? fmtTime(iso) : "");
  /* 저장본 한 줄. 지금 저장된 그림과 저장 버전이 같은 모양을 쓴다(부모의 onRestore 는 ref 와 at 만 본다) */
  const verRow = (v, key, name, sub, alt) => (
    <div className="skh-ver" key={key}>
      <div className="skh-verpic">{MediaThumb ? <MediaThumb owner={owner} refId={v.ref} alt={alt} size={72} /> : null}</div>
      <div className="skh-vermeta"><b>{name}</b>{sub ? <span>{sub}</span> : null}</div>
      <div className="skh-veract">
        <button type="button" className="btn small ghost" disabled={!!busy} aria-label={"새 레이어로 불러오기, " + name}
          onClick={() => onRestore(v, "layer")}>새 레이어로 불러오기</button>
        <button type="button" className="btn small ghost" disabled={!!busy} aria-label={"이 버전으로 바꾸기, " + name}
          onClick={() => onRestore(v, "replace")}>이 버전으로 바꾸기</button>
      </div>
    </div>
  );

  const tid = (k) => uid + "-t-" + k, pid = (k) => uid + "-p-" + k;
  const tabKey = (e, i) => {
    let j = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") j = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") j = (i + TABS.length - 1) % TABS.length;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = TABS.length - 1;
    if (j < 0) return;
    e.preventDefault(); e.stopPropagation();
    setTab(TABS[j][0]);
    const b = tabsRef.current && tabsRef.current.children[j];
    if (b) b.focus();
  };

  return (
    <div className="skh">
      <PanelHead title="기록" onClose={onClose} />
      <div className="skh-tabs" role="tablist" aria-label="기록 종류" ref={tabsRef}>
        {TABS.map(([k, name], i) => (
          <button key={k} type="button" role="tab" id={tid(k)} className="skh-tab" aria-selected={tab === k} aria-controls={tab === k ? pid(k) : undefined}
            tabIndex={tab === k ? 0 : -1} onClick={() => setTab(k)} onKeyDown={(e) => tabKey(e, i)}>{name}</button>
        ))}
      </div>

      <div role="tabpanel" id={pid(tab)} aria-labelledby={tid(tab)}>
        {tab === "ops" && (
          <>
            <ol className="skh-ops" role="list" aria-label="작업 내역" ref={listRef}>
              <li>
                <button type="button" ref={at === 0 ? curRow : null} className={"skh-op" + (at === 0 ? " cur" : "")} aria-current={at === 0 ? "step" : undefined}
                  onClick={() => onJump(0)}>
                  <span className="skh-opname">처음 상태</span>
                  {at === 0 && <span className="skh-now">지금</span>}
                </button>
              </li>
              {seq.map((op, k) => {
                const isCur = k === at - 1, undone = k >= at;
                const name = opLabel(op), tm = clock(op.t);
                return (
                  <li key={k + ":" + (op.t || 0)}>
                    <button type="button" ref={isCur ? curRow : null} className={"skh-op" + (isCur ? " cur" : "") + (undone ? " undone" : "")}
                      aria-current={isCur ? "step" : undefined}
                      aria-label={name + (tm ? ", " + tm : "") + (isCur ? ", 지금 상태" : undone ? ", 되돌린 작업" : "")}
                      onClick={() => onJump(jumpTarget(seq, k))}>
                      <span className="skh-opname">{name}</span>
                      {isCur && <span className="skh-now">지금</span>}
                      <span className="skh-optime">{tm}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <p className="hint skh-note">
              되돌릴 수 있는 작업 {hist.length}개
              {redo.length > 0 && " · 다시 실행할 수 있는 작업 " + redo.length + "개"}
              {sealed > 0 && " · 그보다 앞선 작업 " + sealed + "개는 확정됨"}
            </p>
          </>
        )}

        {tab === "vers" && (
          <div className="skh-vers">
            <button type="button" className="skx-lbtn skh-save" disabled={!!busy} onClick={() => onSaveVersion()}>
              <Icon k="version" />지금 상태를 버전으로 저장
            </button>
            {cur && cur.ref && verRow(cur, "cur", "지금 저장된 그림", time(cur.at), "지금 저장된 그림")}
            {/* 버전 이름은 저장 시각으로 한다. 오래된 버전이 목록에서 빠지면 순번은 밀리기 때문이다 */}
            {vers.slice().reverse().map((v) => verRow(v, v.ref + ":" + (v.at || ""), time(v.at) ? time(v.at) + " 저장" : "저장 버전",
              typeof v.n === "number" && isFinite(v.n) ? "작업 " + v.n + "개" : "", "저장 버전"))}
            {vers.length === 0 && <p className="skh-empty">아직 저장한 버전이 없습니다.</p>}
          </div>
        )}
      </div>

      <div className="skh-foot">
        <button type="button" className="skx-lbtn" onClick={() => onReplay()}><Icon k="play" />과정 다시 보기</button>
        <span className="skh-stat">{statText(stats)}</span>
      </div>
    </div>
  );
}

/* ============================================================
   과정 다시 보기
   ============================================================ */

const SPEEDS = [[6, "1배"], [12, "2배"], [24, "4배"], [48, "8배"]];
const CHUNK = 200;       // 위치를 옮길 때 한 번에 실행하는 작업 수
const REC_RATE = 24;     // 녹화할 때의 빠르기(4배)
const VIEW_MAX = 1000;   // 보이는 캔버스의 긴 변

function recType() {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return "";
  for (const t of ["video/mp4;codecs=avc1.640028", "video/mp4;codecs=avc1.4D4028", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]) {
    try { if (MediaRecorder.isTypeSupported(t)) return t; } catch (e) {}
  }
  return "";
}
const canRecord = () => typeof MediaRecorder !== "undefined" && typeof HTMLCanvasElement !== "undefined" && typeof HTMLCanvasElement.prototype.captureStream === "function";

export function ReplayPlayer({ ops, title = "과정 다시 보기", onClose }) {
  const list = Array.isArray(ops) ? ops : [];
  const N = list.length;
  /* 부모가 다시 그려질 때마다 배열을 새로 만들어 넘겨도 처음부터 다시 시작하지 않게, 길이와 양 끝 시각으로 같은 기록인지 본다 */
  const sig = N + ":" + ((list[0] && list[0].t) || 0) + ":" + ((list[N - 1] && list[N - 1].t) || 0);

  const rootRef = useRef(null), closeRef = useRef(null), cvRef = useRef(null);
  const S = useRef(null);
  if (!S.current) S.current = { eng: null, ops: list, pos: 0, want: null, mode: "idle", speed: 12, next: 0, timer: 0, rec: null, dead: false };

  const [ready, setReady] = useState(false);
  const [pos, setPos] = useState(0);
  const [want, setWant] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState(12);
  const [rec, setRec] = useState(false);
  const [msg, setMsg] = useState("");
  const [recOk] = useState(canRecord);

  /* 아래 함수들은 S.current(ref)와 setState만 쓰므로 타이머가 옛 렌더의 함수를 불러도 같은 일을 한다 */
  const restart = () => {
    const st = S.current, e = st.eng, first = st.ops[0];
    if (!e) return;
    for (const L of e.layers) { L.cv.width = 0; if (L.base) L.base.width = 0; }
    /* 첫 작업이 새 캔버스·불러온 그림이면 그 크기의 빈 종이를 먼저 보인다(그 작업을 실행하면 엔진이 다시 맞춘다) */
    const lead = first && (first.kind === "new" || first.kind === "base") ? first : null;
    e.reset((lead && lead.w) || 1500, (lead && lead.h) || 1000, null);
    e.paper = (lead && lead.paper) || "white";
    st.pos = 0;
  };
  const runOne = () => {
    const st = S.current, op = st.ops[st.pos];
    st.pos++;
    try { st.eng.runLog(op); } catch (e) {}
  };
  const draw = () => {
    const e = S.current.eng, cv = cvRef.current;
    if (!e || !cv) return;
    const s = Math.min(1, VIEW_MAX / Math.max(e.W, e.H));
    /* 영상 인코더가 홀수 크기를 받지 않는 일이 있어 짝수로 맞춘다 */
    const w = Math.max(2, Math.round((e.W * s) / 2) * 2), h = Math.max(2, Math.round((e.H * s) / 2) * 2);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    try { e.compositeInto(cv, paperColor(e.paper)); } catch (err) {}
  };
  const finish = () => {
    const st = S.current;
    if (st.mode === "rec") return endRec();
    st.mode = "idle";
    setPlaying(false);
  };
  const pump = () => {
    const st = S.current;
    st.timer = 0;
    if (!st.eng) return;
    const total = st.ops.length;
    if (st.want != null) {
      if (st.want < st.pos) restart();
      const end = Math.min(st.want, st.pos + CHUNK);
      while (st.pos < end) runOne();
      draw(); setPos(st.pos);
      if (st.pos >= st.want) { st.want = null; setWant(null); st.next = 0; }
      if (st.want != null || st.mode !== "idle") st.timer = setTimeout(pump, 0);
      return;
    }
    if (st.mode === "idle") return;
    if (st.pos >= total) return finish();
    const now = performance.now(), iv = 1000 / (st.mode === "rec" ? REC_RATE : st.speed);
    if (!st.next || now - st.next > 400) st.next = now;   // 오래 밀렸으면 따라잡지 않는다
    let k = 0;
    while (st.pos < total && st.next <= now && k < 6) { runOne(); st.next += iv; k++; }
    if (k) { draw(); setPos(st.pos); }
    if (st.pos >= total) return finish();
    st.timer = setTimeout(pump, Math.max(0, st.next - performance.now()));
  };
  const kick = (delay = 0) => {
    const st = S.current;
    clearTimeout(st.timer);
    st.timer = setTimeout(pump, delay);
  };
  const seek = (v) => {
    const st = S.current;
    if (!st.eng || st.mode === "rec") return;
    v = Math.max(0, Math.min(st.ops.length, Math.round(+v) || 0));
    st.want = v; setWant(v);
    kick();
  };
  const play = () => {
    const st = S.current;
    if (!st.eng || st.mode === "rec") return;
    if (st.want == null && st.pos >= st.ops.length) { st.want = 0; setWant(0); }
    st.mode = "play"; st.next = 0;
    setPlaying(true); setMsg("");
    kick();
  };
  const pause = () => {
    const st = S.current;
    if (st.mode !== "play") return;
    st.mode = "idle";
    setPlaying(false);
    if (st.want == null) { clearTimeout(st.timer); st.timer = 0; }
  };
  const toggle = () => (S.current.mode === "play" ? pause() : play());
  const setSpeed = (v) => { S.current.speed = v; S.current.next = 0; setSpeedState(v); };

  /* ---------- 영상으로 저장 ---------- */

  const stopRec = (cancel) => {
    const st = S.current, R = st.rec;
    if (!R) return;
    st.rec = null;
    R.cancel = !!cancel;
    clearTimeout(st.timer); st.timer = 0;
    st.mode = "idle";
    let stopped = false;
    try { if (R.mr.state !== "inactive") { R.mr.stop(); stopped = true; } } catch (e) {}
    if (!stopped) R.stream.getTracks().forEach((t) => t.stop());
    if (!st.dead) setRec(false);
  };
  function endRec() {
    const st = S.current, R = st.rec;
    if (!R) return;
    /* 마지막 장면을 잠깐 더 담는다. 캔버스에 다시 그려야 새 장면으로 잡힌다 */
    let k = 0;
    const hold = () => {
      st.timer = 0;
      if (st.rec !== R) return;
      draw();
      if (++k < 8) st.timer = setTimeout(hold, 120); else stopRec(false);
    };
    hold();
  }
  const startRec = () => {
    const st = S.current, cv = cvRef.current;
    if (!st.eng || !cv || st.mode === "rec") return;
    const type = recType();
    let stream = null, mr = null;
    try {
      stream = cv.captureStream(30);
      mr = new MediaRecorder(stream, type ? { mimeType: type, videoBitsPerSecond: 5000000 } : { videoBitsPerSecond: 5000000 });
    } catch (e) {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      setMsg("이 브라우저에서는 영상을 만들 수 없습니다.");
      return;
    }
    clearTimeout(st.timer); st.timer = 0;
    st.want = null; setWant(null);
    restart(); draw(); setPos(0);
    const R = { mr, stream, chunks: [], cancel: false };
    mr.ondataavailable = (e) => { if (e.data && e.data.size) R.chunks.push(e.data); };
    mr.onerror = () => { if (st.rec === R) { stopRec(true); if (!st.dead) setMsg("영상을 만들지 못했습니다."); } };
    mr.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (R.cancel) return;
      const mime = mr.mimeType || type || "video/webm";
      const blob = new Blob(R.chunks, { type: mime });
      if (!blob.size) { if (!st.dead) setMsg("영상을 만들지 못했습니다."); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "에스키스_과정." + (/mp4/i.test(mime) ? "mp4" : "webm");
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      if (!st.dead) setMsg("영상 파일을 내려받았습니다.");
    };
    st.rec = R; st.mode = "rec"; st.next = 0;
    setRec(true); setPlaying(false); setMsg("");
    try { mr.start(); } catch (e) { stopRec(true); setMsg("이 브라우저에서는 영상을 만들 수 없습니다."); return; }
    draw();
    st.timer = setTimeout(pump, 300);
  };

  /* ---------- 열기·닫기 ---------- */

  /* 열릴 때 닫기 버튼에 포커스, 닫힐 때 원래 있던 곳으로 */
  useEffect(() => {
    const st = S.current, root = rootRef.current;
    st.dead = false;
    const before = typeof document !== "undefined" ? document.activeElement : null;
    if (closeRef.current) closeRef.current.focus();
    /* 창 위에서 휠을 굴려도 뒤 화면이 스크롤되지 않게 한다(React 의 wheel 은 passive 라 직접 건다. Ctrl+휠 확대는 둔다) */
    const onWheel = (e) => { if (!e.ctrlKey) e.preventDefault(); };
    if (root) root.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      st.dead = true;
      if (root) root.removeEventListener("wheel", onWheel);
      try { if (before && before.focus && document.contains(before)) before.focus(); } catch (e) {}
    };
  }, []);
  /* 포커스가 있던 버튼이 사라지거나 비활성화되면(영상으로 저장·녹화 취소, 닫기 버튼이 잠긴 화면 안에 있을 때)
     포커스가 창 밖으로 빠져 Esc 가 듣지 않고 뒤 화면의 단축키가 눌린다. 그때는 창으로 포커스를 옮긴다 */
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof document === "undefined") return;
    const a = document.activeElement;
    if (!a || !root.contains(a) || a.disabled) { try { root.focus({ preventScroll: true }); } catch (e) {} }
  }, [rec, ready]);

  useEffect(() => {
    const st = S.current;
    st.ops = list; st.pos = 0; st.want = null; st.mode = "idle"; st.next = 0;
    setReady(false); setPos(0); setWant(null); setPlaying(false); setMsg("");
    if (!list.length) return;
    const eng = new Engine();
    st.eng = eng;
    let live = true;
    (async () => {
      try { await prepareLog(list); } catch (e) {}
      if (!live) return;
      restart(); draw();
      setReady(true);
      let still = false;
      try { still = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}
      if (still) seek(list.length); else play();   // 움직임 줄이기를 켠 기기에서는 완성된 그림부터 보인다
    })();
    return () => {
      live = false;
      stopRec(true);
      clearTimeout(st.timer); st.timer = 0;
      st.mode = "idle"; st.want = null;
      st.eng = null;
      eng.dispose();
    };
  }, [sig]);

  const onKey = (e) => {
    e.stopPropagation();   // 뒤에 있는 그리기 화면의 단축키가 눌리지 않게
    if (e.key === "Escape") { e.preventDefault(); if (onClose) onClose(); return; }
    if (e.key === " " && e.target === e.currentTarget && ready && !rec) { e.preventDefault(); toggle(); return; }
    /* 창 바탕에 포커스가 있을 때 화살표·Page 키로 뒤 화면이 스크롤되지 않게 */
    if (e.target === e.currentTarget && /^(Arrow(Up|Down)|Page(Up|Down)|Home|End| )$/.test(e.key)) { e.preventDefault(); return; }
    if (e.key === "Tab") {
      const root = rootRef.current;
      const els = root ? Array.from(root.querySelectorAll("button:not(:disabled), input:not(:disabled)")) : [];
      if (!els.length) { e.preventDefault(); return; }
      const first = els[0], lastEl = els[els.length - 1], a = document.activeElement;
      if (e.shiftKey && (a === first || a === root)) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && a === lastEl) { e.preventDefault(); first.focus(); }
    }
  };
  const stop = (e) => e.stopPropagation();

  const stats = useMemo(() => logStats(list), [sig]);
  const tools = Object.entries(stats.tools).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => k + " " + n + "회").join(" · ");
  const shown = want != null ? want : pos;
  const nowOp = pos > 0 ? list[pos - 1] : null;
  const off = !ready || rec;

  return (
    <div ref={rootRef} className="skh-rp" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
      onKeyDown={onKey} onKeyUp={stop} onPointerDown={stop} onWheel={stop}>
      <div className="skh-rphead">
        <b>{title}</b>
        <span className="skh-rpstat">{N > 0 && <>{statText(stats)}{tools && <span className="skh-rptools"> · {tools}</span>}</>}</span>
        <button ref={closeRef} type="button" className="skh-rx" aria-label={title + " 창 닫기"} title="닫기" onClick={() => { if (onClose) onClose(); }}><Icon k="close" /></button>
      </div>

      {N === 0 ? (
        <div className="skh-rpstage"><p className="skh-rpmsg">과정 기록이 없습니다.</p></div>
      ) : (
        <>
          <div className="skh-rpstage">
            <canvas ref={cvRef} role="img" aria-label={"그리는 과정 " + pos + " / " + N} style={{ visibility: ready ? "visible" : "hidden" }} />
            {!ready && <p className="skh-rpmsg">불러오는 중…</p>}
          </div>
          <div className="skh-rpbar">
            <div className="skh-rprow">
              <input type="range" className="skh-pos" min={0} max={N} step={1} value={shown} disabled={off}
                aria-label="위치" aria-valuetext={shown + " / " + N}
                onChange={(e) => seek(e.target.value)} />
              <span className="skh-rpcount">{pos} / {N} · {nowOp ? opLabel(nowOp) : "처음 상태"}</span>
            </div>
            <div className="skh-rprow">
              <button type="button" className="skh-rb" disabled={off} onClick={toggle}>
                <Icon k={playing ? "pause" : "play"} size={18} />{playing ? "멈춤" : "재생"}
              </button>
              <button type="button" className="skh-rb" disabled={off} onClick={() => seek(0)}>
                <Icon k="restart" size={18} />처음부터
              </button>
              <span className="skh-rpspeed" role="group" aria-label="빠르기">
                {SPEEDS.map(([v, name]) => (
                  <button key={v} type="button" className={speed === v ? "on" : ""} aria-pressed={speed === v} disabled={off} onClick={() => setSpeed(v)}>{name}</button>
                ))}
              </span>
              <span className="skh-rpgap" />
              {msg && !rec && <span className="skh-rpnote" role="status">{msg}</span>}
              {recOk && !rec && (
                <button type="button" className="skh-rb" disabled={!ready} onClick={startRec}>
                  <Icon k="download" size={18} />영상 파일로 내려받기
                </button>
              )}
              {rec && (
                <>
                  <span className="skh-rprec" role="status"><i aria-hidden="true" />녹화 중…</span>
                  <button type="button" className="skh-rb" onClick={() => { stopRec(true); setMsg("녹화를 취소했습니다."); }}>녹화 취소</button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export const SKETCH_HISTORY_CSS = `
.skh{box-sizing:border-box;width:100%;min-width:0;background:#fff;color:var(--ink);font-family:var(--sans);font-size:13px;line-height:1.4;text-align:left}
.skh *,.skh *::before,.skh *::after{box-sizing:border-box}
.skh button{margin:0;border-radius:0;font-family:var(--sans);cursor:pointer}
.skh button:disabled{cursor:default}
.skh button:focus-visible{outline:2px solid var(--ink);outline-offset:1px}
.skh-tabs{display:flex;border-bottom:1px solid var(--line2)}
.skh-tab{flex:1 1 0;min-width:0;height:34px;padding:0 4px;border:0;border-left:1px solid var(--line2);background:#fff;color:var(--ink);font-size:12.5px;white-space:nowrap}
.skh-tab:first-child{border-left:0}
.skh-tab:hover{background:#ececec}
.skh-tab[aria-selected=true]{background:var(--ink);color:#fff}
.skh .skh-tab:focus-visible{outline-offset:-3px}
.skh .skh-tab[aria-selected=true]:focus-visible{outline-color:#fff}
.skh-ops{position:relative;list-style:none;margin:0;padding:0;max-height:min(46vh,340px);overflow-y:auto;border-bottom:1px solid var(--line2)}
.skh-ops li{margin:0;padding:0;border-top:1px solid var(--line2)}
.skh-ops li:first-child{border-top:0}
.skh-op{display:flex;align-items:center;gap:8px;width:100%;min-height:32px;padding:4px 10px 4px 7px;border:0;border-left:3px solid transparent;background:#fff;color:var(--ink);font-size:12.5px;line-height:1.3;text-align:left}
.skh-op:hover{background:#ececec}
.skh .skh-op:focus-visible{outline-offset:-2px}
.skh-op.undone{color:#767676}
.skh-op.cur{border-left-color:var(--ink);background:var(--card2);font-weight:700}
.skh-opname{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.skh-optime{flex:0 0 auto;font-size:11.5px;font-weight:400;font-variant-numeric:tabular-nums;color:var(--sub)}
.skh-op.undone .skh-optime{color:#767676}
.skh-now{flex:0 0 auto;padding:0 5px;border:1px solid var(--ink);font-size:11px;font-weight:500;line-height:16px}
.skh .skh-note{margin:0;padding:7px 10px}
.skh-vers{padding:10px}
.skh .skh-save{display:flex;width:100%;justify-content:center}
.skh-ver{display:grid;grid-template-columns:auto minmax(0,1fr);gap:6px 10px;align-items:start;margin-top:10px;padding-top:10px;border-top:1px solid var(--line2)}
.skh-verpic{min-width:48px;font-size:11.5px;color:var(--sub)}
.skh-verpic .mm-thumb{width:auto;max-width:108px;height:auto}
.skh-vermeta{min-width:0;font-size:12.5px}
.skh-vermeta b{display:block;font-weight:700}
.skh-vermeta span{display:block;font-size:12px;color:var(--sub);font-variant-numeric:tabular-nums}
.skh-veract{grid-column:1 / -1;display:flex;flex-wrap:wrap;gap:6px}
.skh .skh-veract .btn.small{min-height:30px;white-space:nowrap}
.skh .skh-veract .btn.small:disabled{opacity:.4}
.skh .skh-empty{margin:12px 0 2px;font-size:12.5px;color:var(--sub)}
.skh-foot{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;padding:8px 10px;border-top:1px solid var(--line2)}
.skh-stat{font-size:12px;color:var(--sub);font-variant-numeric:tabular-nums}

.skh-rp{position:fixed;inset:0;z-index:6000;display:flex;flex-direction:column;box-sizing:border-box;padding:env(safe-area-inset-top,0) env(safe-area-inset-right,0) env(safe-area-inset-bottom,0) env(safe-area-inset-left,0);background:rgba(17,17,17,.95);color:#fff;font-family:var(--sans,sans-serif);font-size:13px;line-height:1.4;text-align:left;outline:none}
html[data-ax-cap] .skh-rp{bottom:var(--ax-cap-h,0px)}
.skh-rp *,.skh-rp *::before,.skh-rp *::after{box-sizing:border-box}
.skh-rp button{margin:0;border-radius:0;font-family:inherit;cursor:pointer}
.skh-rp button:disabled{cursor:default}
.skh-rphead{display:flex;flex:0 0 auto;align-items:center;gap:10px;min-height:48px;padding:6px 8px 6px 14px}
.skh-rphead b{flex:0 0 auto;font-size:14px;font-weight:700}
.skh-rpstat{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:12px;color:#d0d0d0;font-variant-numeric:tabular-nums}
.skh-rx{display:inline-flex;flex:0 0 auto;align-items:center;justify-content:center;width:36px;height:36px;padding:0;border:1px solid transparent;background:transparent;color:#fff}
.skh-rx:hover{border-color:#fff}
.skh-rp .skh-rx:focus-visible{outline:2px solid #fff;outline-offset:1px}
.skh-rpstage{position:relative;flex:1 1 auto;min-height:0;margin:0 12px;touch-action:pinch-zoom}
.skh-rpstage canvas{position:absolute;inset:0;margin:auto;max-width:100%;max-height:100%;background:#fff;box-shadow:0 0 0 1px rgba(255,255,255,.28)}
.skh-rp .skh-rpmsg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;margin:0;font-size:14px;color:#e6e6e6}
.skh-rpbar{flex:0 0 auto;margin:10px 12px 12px;padding:6px 10px 8px;border:1px solid var(--line,#bdbdbd);background:#fff;color:var(--ink,#111)}
.skh-rprow{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;min-height:36px}
.skh-rp input[type=range].skh-pos{flex:1 1 180px;width:auto;min-width:120px;height:30px;margin:0;padding:0;border:0;border-radius:0;background:transparent;accent-color:var(--ink,#111);cursor:pointer}
.skh-rp input[type=range].skh-pos:disabled{cursor:default;opacity:.5}
.skh-rpcount{flex:0 1 auto;min-width:132px;font-size:12.5px;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.skh-rb{display:inline-flex;align-items:center;justify-content:center;gap:4px;height:36px;padding:0 11px 0 8px;border:1px solid #9a9a9a;background:#fff;color:var(--ink,#111);font-size:12.5px;white-space:nowrap}
.skh-rb:hover:not(:disabled){background:#ececec}
.skh-rb:disabled{opacity:.4}
.skh-rpspeed{display:inline-flex;border:1px solid #9a9a9a}
.skh-rpspeed button{min-width:40px;height:34px;padding:0 8px;border:0;border-left:1px solid #ddd;background:#fff;color:var(--ink,#111);font-size:12.5px;white-space:nowrap}
.skh-rpspeed button:first-child{border-left:0}
.skh-rpspeed button.on{background:var(--ink,#111);color:#fff}
.skh-rpspeed button:disabled{opacity:.5}
.skh-rpbar button:focus-visible,.skh-rpbar input:focus-visible{outline:2px solid var(--ink,#111);outline-offset:1px}
.skh-rpgap{flex:1 1 0}
.skh-rpnote{font-size:12.5px;color:var(--sub,#555)}
.skh-rprec{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;color:var(--seal,#b5462f)}
.skh-rprec i{width:10px;height:10px;border-radius:50%;background:var(--seal,#b5462f)}
@media (max-width:560px){
  .skh-rptools{display:none}
  .skh-rpstage{margin:0 6px}
  .skh-rpbar{margin:8px 6px 8px}
  .skh-rpgap{display:none}
}
@media (pointer:coarse){
  .skh-tab{height:40px}
  .skh-op{min-height:40px}
  .skh .skh-veract .btn.small{min-height:36px}
  .skh-rb{height:40px}
  .skh-rpspeed button{height:38px;min-width:44px}
  .skh-rp input[type=range].skh-pos{height:36px}
  .skh-rx{width:44px;height:44px}
}
`;

export function SketchHistoryStyle() {
  return <style>{SKETCH_HISTORY_CSS}</style>;
}
