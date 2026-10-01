/* 디지털 에스키스 읽기 블록: 교사가 학생 기록을 읽는 화면과 학생의 읽기 전용 화면에 들어간다.
   합친 그림, 저장 정보, 과정 요약(stats), 저장 버전(versions), 과정 다시 보기(log)를 보인다.
   옛 값({ ref, at })은 그림과 저장 시각만 보인다. 모양(CSS)은 SKETCH_READ_CSS. */
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { fetchLog, prepareLog } from "./src-sketch-engine.mjs";
import { Icon } from "./src-sketch-ui.jsx";
import { ReplayPlayer } from "./src-sketch-history.jsx";

const num = (x) => (typeof x === "number" && isFinite(x) ? x : 0);
const IDLE = { key: "", state: "idle", ops: null, open: false }; // state: idle · loading · ready · error

/* 저장 버전을 오래된 것부터. 모두 n(버전 번호)이 있으면 그 순서, 아니면 저장 시각 순서 */
function sortVersions(list) {
  const rows = (Array.isArray(list) ? list : []).filter((x) => x && x.ref);
  const byN = rows.every((x) => num(x.n) > 0);
  const key = (x) => (byN ? x.n : typeof x.at === "number" ? x.at : Date.parse(x.at) || 0);
  return rows.map((x, i) => ({ x, i })).sort((a, b) => key(a.x) - key(b.x) || a.i - b.i).map((o) => o.x);
}

function minutesText(ms) {
  const m = Math.round(num(ms) / 60000);
  return m < 1 ? "1분 미만" : "약 " + m + "분";
}

/* 과정 다시 보기 창. <dialog>를 모달로 띄우므로 조상의 transform·overflow·z-index와 무관하게 맨 위에 놓이고
   포커스가 창 안에 머문다. Esc와 바깥 누르기로 닫고, 닫히면 연 버튼(opener)으로 포커스를 돌려준다 */
function ReplayWindow({ ops, title, onClose, opener }) {
  const box = useRef(null);
  useLayoutEffect(() => {
    const d = box.current;
    if (!d) return undefined;
    if (!d.open) {
      if (d.showModal) { try { d.showModal(); } catch (e) { d.setAttribute("open", ""); } }
      else d.setAttribute("open", "");
    }
    if (!d.contains(document.activeElement)) { try { d.focus(); } catch (e) {} }
    return () => {
      try { if (d.open && d.close) d.close(); } catch (e) {}
      const b = opener && opener.current;
      if (b && b.focus) { try { b.focus(); } catch (e) {} }
    };
  }, []);
  return (
    <dialog className="skr-win" aria-label={title} tabIndex={-1} ref={box}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClose={() => { if (!box.current || !box.current.open) onClose(); }}
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); onClose(); } }}
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="skr-win-in">
        <ReplayPlayer ops={ops} title={title} onClose={onClose} />
      </div>
    </dialog>
  );
}

export function SketchRead({ f, v, owner, store, MediaThumb, fmtTime }) {
  const cur = v && typeof v === "object" && v.ref ? v : null;
  const log = cur && cur.log && Array.isArray(cur.log.parts) && cur.log.parts.length ? cur.log : null;
  /* 같은 ref에 다시 저장해도 기록이 바뀐 줄 알도록 저장 시각과 작업 수를 함께 본다 */
  const logKey = log ? [owner, cur.at, log.n, log.parts.map((p) => p && p.ref).join(",")].join("|") : "";

  const [playRaw, setPlay] = useState(IDLE);
  const [verOpen, setVerOpen] = useState(false);
  const ticket = useRef(0);
  const btn = useRef(null);

  /* 화면에서 빠진 뒤에 도착한 읽기 결과는 버린다 */
  useEffect(() => () => { ticket.current++; }, []);

  /* 다른 학생·다른 저장본으로 바뀌면 읽어 둔 기록은 쓰지 않는다 */
  const play = playRaw.key === logKey ? playRaw : IDLE;

  if (!cur) {
    return (
      <div className="read-block skr">
        <div className="rl">{f.label}</div>
        <div className="rv empty">스케치 없음</div>
      </div>
    );
  }

  const openReplay = async () => {
    if (!log || play.state === "loading") return;
    const key = logKey;
    if (play.state === "ready" && play.ops) { setPlay({ ...play, open: true }); return; }
    const my = ++ticket.current;
    setPlay({ key, state: "loading", ops: null, open: false });
    let ops = [];
    try {
      ops = await fetchLog(store, owner, log);
      if (!Array.isArray(ops)) ops = [];
      if (ops.length) await prepareLog(ops);
    } catch (e) { ops = []; }
    if (my !== ticket.current) return;
    setPlay(ops.length ? { key, state: "ready", ops, open: true } : { key, state: "error", ops: null, open: false });
  };

  const info = [];
  if (cur.at) info.push("저장 " + fmtTime(cur.at));
  if (num(cur.w) && num(cur.h)) info.push("캔버스 " + cur.w + "×" + cur.h);
  if (Array.isArray(cur.layers) && cur.layers.length) info.push("레이어 " + cur.layers.length + "장");

  const st = cur.stats && typeof cur.stats === "object" ? cur.stats : null;
  const tools = st && st.tools && typeof st.tools === "object"
    ? Object.entries(st.tools).filter(([, c]) => num(c) > 0).sort((a, b) => b[1] - a[1]).slice(0, 6)
    : [];
  const versions = sortVersions(cur.versions);
  const loading = play.state === "loading";

  return (
    <div className="read-block skr">
      <div className="rl">{f.label}</div>
      <MediaThumb owner={owner} refId={cur.ref} alt={f.label} size={260} />
      {info.length > 0 && <div className="skr-info">{info.join(" · ")}</div>}

      {st && (
        <div className="skr-stats">
          <div><b>과정 요약</b>작업 {num(st.n)}개 · 획 {num(st.strokes)}개 · 그린 시간 {minutesText(st.ms)}</div>
          {tools.length > 0 && <div><b>사용한 도구</b>{tools.map(([name, c]) => name + " " + c).join(" · ")}</div>}
        </div>
      )}

      {versions.length > 0 && (
        <details className="skr-vers" onToggle={(e) => { if (e.currentTarget.open) setVerOpen(true); }}>
          <summary>저장 버전 {versions.length}개</summary>
          {verOpen && (
            <ol className="skr-strip" tabIndex={0} aria-label={f.label + " 저장 버전, 오래된 것부터"}>
              {versions.map((x, i) => (
                <li key={x.ref + ":" + i}>
                  <MediaThumb owner={owner} refId={x.ref} alt={f.label + " 저장 버전 " + (num(x.n) || i + 1)} size={84} />
                  <span className="skr-cap">v{num(x.n) || i + 1}{x.at ? " " + fmtTime(x.at) : ""}</span>
                </li>
              ))}
            </ol>
          )}
        </details>
      )}

      {log && (
        <div className="skr-act">
          {/* 읽는 동안에도 포커스가 버튼에 머물도록 disabled 대신 aria-disabled를 쓴다 */}
          <button type="button" className="skx-lbtn" ref={btn} onClick={openReplay} aria-disabled={loading || undefined} aria-haspopup="dialog">
            <Icon k="play" size={16} />과정 다시 보기
          </button>
          <span className="skr-msg" role="status" aria-live="polite">
            {loading ? "불러오는 중…" : play.state === "error" ? "과정 기록을 읽지 못했습니다." : ""}
          </span>
        </div>
      )}

      {log && play.open && play.ops && (
        <ReplayWindow ops={play.ops} title="과정 다시 보기" opener={btn}
          onClose={() => setPlay((p) => (p.open ? { ...p, open: false } : p))} />
      )}
    </div>
  );
}

export const SKETCH_READ_CSS = `
.skr{min-width:0}
.skr .mm-thumb{max-width:100%;height:auto}
.skr-info{margin-top:5px;font-family:var(--sans);font-size:11px;color:var(--sub);line-height:1.6;word-break:keep-all}
.skr-stats{margin-top:8px;padding:7px 9px;border:1px solid var(--line2);background:var(--card2);font-size:12.5px;line-height:1.7;word-break:keep-all;overflow-wrap:anywhere}
.skr-stats b{display:inline-block;min-width:78px;margin-right:6px;font-weight:500;font-size:11px;color:var(--sub)}
.skr-vers{margin-top:8px;border:1px solid var(--line2);background:#fff}
.skr-vers summary{box-sizing:border-box;min-height:32px;padding:6px 9px;font-family:var(--sans);font-size:12.5px;cursor:pointer}
.skr-vers summary:hover{background:#f3f3f3}
.skr-vers summary:focus-visible,.skr-strip:focus-visible{outline:2px solid var(--ink);outline-offset:-2px}
.skr-strip{display:flex;gap:8px;margin:0;padding:8px 9px 10px;list-style:none;overflow-x:auto;border-top:1px solid var(--line2)}
.skr-strip li{flex:0 0 auto;display:flex;flex-direction:column;gap:3px;align-items:flex-start}
.skr-strip .mm-thumb{max-width:none}
.skr-cap{font-family:var(--mono);font-size:10.5px;color:var(--sub);white-space:nowrap}
.skr-act{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:8px}
.skr-act .skx-lbtn[aria-disabled=true]{opacity:.4;cursor:default}
.skr-msg{font-size:12px;color:var(--sub)}
dialog.skr-win{position:fixed;inset:0;z-index:5200;box-sizing:border-box;margin:auto;padding:0;width:720px;max-width:calc((100vw - 24px) / var(--ax-zoom,1));height:fit-content;max-height:calc((100vh - 24px) / var(--ax-zoom,1));max-height:calc((100dvh - 24px) / var(--ax-zoom,1));overflow:hidden;background:#fff;border:1px solid var(--ink);box-shadow:0 8px 32px rgba(0,0,0,.28);outline:none;font-family:var(--sans);font-size:13px;color:var(--ink);text-align:left}
dialog.skr-win[open]{display:flex;flex-direction:column}
dialog.skr-win::backdrop{background:rgba(17,17,17,.45)}
.skr-win-in{flex:1 1 auto;min-width:0;min-height:0;overflow:auto;overscroll-behavior:contain}
:where(.skr-win) input[type=range]{width:120px;height:26px;padding:0;margin:0;border:0;background:transparent;accent-color:var(--ink);cursor:pointer}
@media (max-width:640px){
  dialog.skr-win{margin:0;width:calc(100vw / var(--ax-zoom,1));max-width:none;height:calc(100vh / var(--ax-zoom,1));height:calc(100dvh / var(--ax-zoom,1));max-height:none;border-width:1px 0}
}
@media print{.skr-act,dialog.skr-win,dialog.skr-win[open]{display:none}}
`;
