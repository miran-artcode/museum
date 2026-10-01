/* 디지털 에스키스: 브러시 창. 위는 보관함(붓 고르기), 아래는 고른 붓의 설정.
   주 화면(src-sketch.jsx)이 떠 있는 창 안에 넣는다. 창의 위치·테두리·스크롤은 부모가 준다.
   모양(CSS)은 파일 끝의 SKETCH_BRUSH_CSS. 공용 클래스(.skx-opt · .skx-num · .skx-phead · .btn.small)는 주 화면 것 그대로. */
import React, { useEffect, useRef } from "react";
import { BRUSHES, BRUSH, BRUSH_PARAMS, brushPreview } from "./src-sketch-engine.mjs";
import { Icon, PanelHead } from "./src-sketch-ui.jsx";

const GROUPS = [
  ["draw", "그리기", BRUSHES.filter((b) => b.k !== "eraser" && b.k !== "smudge")],
  ["erase", "지우기", BRUSHES.filter((b) => b.k === "eraser")],
  ["smudge", "번짐", BRUSHES.filter((b) => b.k === "smudge")],
];
const LIB_W = 200, LIB_H = 40, BIG_W = 260, BIG_H = 72;
const BIG_CAP = BIG_H * 0.55;   // brushPreview가 미리보기 굵기를 높이의 55%로 막는다

const clampN = (v, a, b) => Math.min(b, Math.max(a, v));
const okHex = (c) => (/^#[0-9a-f]{6}$/i.test(c || "") ? c : "#111111");
/* 밝은 색은 흰 바탕에서 안 보이므로 미리보기 바탕만 회색으로 바꾼다 */
const isLight = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255 > 0.88;
};

/* 굵기: 슬라이더 0~1000 ↔ min * (max/min)^(v/1000). 10 미만은 0.5 단위, 그 이상은 정수 */
const snapSize = (s, T) => clampN(s < 10 ? Math.round(s * 2) / 2 : Math.round(s), T.min, T.max);
const sizeToV = (s, T) => Math.round((1000 * Math.log(clampN(s, T.min, T.max) / T.min)) / Math.log(T.max / T.min));
const vToSize = (v, T) => snapSize(T.min * Math.pow(T.max / T.min, v / 1000), T);
const sizeText = (s) => (s % 1 ? s.toFixed(1) : String(s)) + "px";

/* 붓으로 그은 미리보기 획. 설정·색이 바뀔 때만 다시 그린다(sig 비교).
   lazy(보관함 줄): 처음에는 줄 순서대로 조금씩 늦춰 그리고, 그 뒤로는 슬라이더를 멈춘 다음에 한 번 그린다
   (색이 바뀌면 모든 줄이 함께 바뀌므로 이때도 줄 순서대로 나눠 그린다).
   lazy가 아니면(큰 미리보기) 바뀔 때마다 requestAnimationFrame으로 한 번씩 */
function Preview({ tool, params, color, w, h, className, lazy, order = 0 }) {
  const ref = useRef(null);
  const drawn = useRef(false);
  const T = BRUSH[tool];
  const sig = tool + "|" + JSON.stringify(params) + "|" + (T && T.erase ? "" : color);
  useEffect(() => {
    let raf = 0, timer = 0;
    const draw = () => {
      const cv = ref.current;
      if (!cv || !T) return;
      try {
        const pv = brushPreview(tool, params, w, h, color);
        const c = cv.getContext("2d");
        c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
        c.fillStyle = !T.erase && isLight(color) ? "#777777" : "#FFFFFF";
        c.fillRect(0, 0, w, h);
        c.drawImage(pv, 0, 0);
        pv.width = 0;
        drawn.current = true;
      } catch (e) { /* 캔버스를 못 쓰는 환경: 빈 칸으로 둔다 */ }
    };
    if (!lazy) raf = requestAnimationFrame(draw);
    else timer = setTimeout(draw, (drawn.current ? 140 : 20) + order * 14);
    return () => { if (raf) cancelAnimationFrame(raf); if (timer) clearTimeout(timer); };
  }, [sig, w, h]);
  return <canvas ref={ref} width={w} height={h} className={className} aria-hidden="true" />;
}

const NAV = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);
/* 슬라이더에 포커스가 있을 때 방향키가 주 화면의 단축키로 넘어가지 않게 */
const keepKeys = (e) => { if (NAV.has(e.key)) e.stopPropagation(); };

/* 이름 + 값(윗줄), 슬라이더(아랫줄) */
function Row({ label, min, max, step, value, text, onChange, onKeyDown }) {
  return (
    <span className="skx-opt">
      <b>{label}</b>
      <input type="range" min={min} max={max} step={step} value={value} aria-label={label} aria-valuetext={text}
        onChange={(e) => onChange(+e.target.value)} onKeyDown={onKeyDown || keepKeys} />
      <span className="skx-num">{text}</span>
    </span>
  );
}

export function BrushPanel({ tool, prefs, color, onPick, onParam, onReset, onClose }) {
  const libRef = useRef(null);
  const col = okHex(color);
  const T = BRUSH[tool];
  const paramsOf = (b) => ({ ...b.d, ...((prefs && prefs[b.k]) || {}) });
  const cur = T ? paramsOf(T) : null;

  /* 고른 붓이 보관함의 보이는 범위 밖이면 보관함만 스크롤한다(페이지는 움직이지 않는다) */
  useEffect(() => {
    const box = libRef.current, el = box && box.querySelector(".skb-row.on");
    if (!el) return;
    const r = el.getBoundingClientRect(), b = box.getBoundingClientRect();
    if (r.top < b.top) box.scrollTop -= b.top - r.top;
    else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom;
  }, [tool]);

  let order = 0;
  const setParam = (patch) => { if (onParam) onParam(tool, patch); };
  const size = cur ? snapSize(cur.size, T) : 0;
  const setSize = (n) => { n = snapSize(n, T); if (n !== cur.size) setParam({ size: n }); };
  /* 굵기 슬라이더는 로그 눈금이라 한 칸 움직여도 반올림한 값이 그대로일 수 있다. 방향키는 굵기 단위로 움직인다 */
  const sizeKey = (e) => {
    if (!NAV.has(e.key)) return;
    e.preventDefault(); e.stopPropagation();
    const k = e.key;
    if (k === "Home") setSize(T.min);
    else if (k === "End") setSize(T.max);
    else if (k === "PageUp") setSize(Math.max(size * 1.25, size + 0.5));
    else if (k === "PageDown") setSize(Math.min(size / 1.25, size - 0.5));
    else if (k === "ArrowRight" || k === "ArrowUp") setSize(size + (size < 10 ? 0.5 : 1));
    else setSize(size - (size <= 10 ? 0.5 : 1));
  };
  const isDefault = !cur || Object.keys(T.d).every((k) => cur[k] === T.d[k]);
  const opPct = cur ? clampN(Math.round((cur.op == null ? 1 : cur.op) * 100), 5, 100) : 100;

  return (
    <div className="skb">
      <PanelHead title="브러시" onClose={onClose} />

      <div className="skb-h" aria-hidden="true">보관함</div>
      <div className="skb-lib" ref={libRef} role="group" aria-label="보관함">
        {GROUPS.map(([gk, gname, list]) => (
          <div key={gk} role="group" aria-label={gname}>
            <div className="skb-gh" aria-hidden="true">{gname}</div>
            {list.map((b) => {
              const on = b.k === tool, K = (b.key || "").toUpperCase();
              return (
                <button key={b.k} type="button" className={"skb-row" + (on ? " on" : "")} aria-pressed={on}
                  aria-keyshortcuts={K || undefined} title={K ? b.name + " (단축키 " + K + ")" : b.name} onClick={() => onPick && onPick(b.k)}>
                  <Icon k={b.k} />
                  <span className="skb-meta">
                    <span className="skb-name">{b.name}</span>
                    {K && <kbd className="skb-key" aria-hidden="true">{K}</kbd>}
                  </span>
                  <span className="skb-pv"><Preview tool={b.k} params={paramsOf(b)} color={col} w={LIB_W} h={LIB_H} lazy order={order++} /></span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {T && (
        <div className="skb-set" role="group" aria-label={"브러시 설정: " + T.name}>
          <div className="skb-h skb-h2" aria-hidden="true">브러시 설정: {T.name}</div>
          <div className="skb-bigbox">
            <Preview tool={tool} params={cur} color={col} w={BIG_W} h={BIG_H} className="skb-big" />
            {size > BIG_CAP && <span className="hint skb-note">실제 굵기보다 가늘게 표시됩니다.</span>}
          </div>
          <Row label="굵기" min={0} max={1000} step={1} value={sizeToV(size, T)} text={sizeText(size)}
            onChange={(v) => setSize(vToSize(v, T))} onKeyDown={sizeKey} />
          {T.eng !== "smudge" && (
            <Row label="불투명도" min={5} max={100} step={1} value={opPct} text={opPct + "%"}
              onChange={(v) => setParam({ op: v / 100 })} />
          )}
          {T.adj.map((k) => {
            const P = BRUSH_PARAMS[k];
            if (!P) return null;
            const [name, min, max, mul, suffix] = P;
            const v = clampN(cur[k] == null ? min : cur[k], min, max);
            return (
              <Row key={k} label={name} min={min} max={max} step={1 / mul} value={v} text={Math.round(v * mul) + suffix}
                onChange={(x) => setParam({ [k]: clampN(Math.round(x * mul) / mul, min, max) })} />
            );
          })}
          <div className="skb-foot">
            <button type="button" className="btn small ghost" disabled={isDefault || !onReset} onClick={() => onReset(tool)}>기본값으로</button>
          </div>
        </div>
      )}
    </div>
  );
}

export const SKETCH_BRUSH_CSS = `
.skb{min-width:0;font-family:var(--sans);font-size:13px;color:var(--ink);background:#fff}
.skb-h{padding:8px 10px 5px;font-size:12px;font-weight:700;color:var(--sub)}
.skb-lib{max-height:40vh;overflow:auto;border-top:1px solid var(--line2);border-bottom:1px solid var(--line2)}
.skb-gh{padding:6px 10px 2px;font-size:11px;color:var(--sub)}
.skb-row{display:flex;align-items:center;gap:8px;width:100%;min-height:42px;margin:0;padding:4px 8px 4px 10px;border:0;background:transparent;border-radius:0;-webkit-appearance:none;appearance:none;font-family:var(--sans);font-size:13px;line-height:1.25;color:var(--ink);text-align:left;cursor:pointer}
.skb-row:hover{background:#f3f3f3}
.skb-row.on{background:#efefef;box-shadow:inset 3px 0 0 var(--seal)}
.skb-row:focus-visible{outline:2px solid var(--ink);outline-offset:-2px}
.skb-row>svg{flex:0 0 auto}
.skb-meta{flex:0 0 66px;min-width:0;display:flex;flex-direction:column;align-items:flex-start;gap:2px}
.skb-name{max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.skb-row.on .skb-name{font-weight:700}
.skb-key{min-width:16px;padding:0 3px;border:1px solid var(--line);background:#fff;font-family:var(--sans);font-size:10.5px;line-height:14px;text-align:center;color:var(--sub)}
.skb-pv{flex:1 1 0;min-width:0}
.skb-pv canvas{display:block;width:100%;height:auto;border:1px solid var(--line2);background:#fff}
.skb-row.on .skb-pv canvas{border-color:var(--line)}
.skb-set{padding:0 10px 10px}
.skb-h2{padding-left:0;padding-right:0}
.skb-big{display:block;width:100%;height:auto;border:1px solid var(--line);background:#fff}
.skb-bigbox{position:relative}
.skb .skb-note{position:absolute;right:1px;bottom:1px;max-width:calc(100% - 2px);margin:0;padding:1px 5px;background:rgba(255,255,255,.9);pointer-events:none}
.skb .skx-opt{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:0 8px;margin-top:8px;white-space:normal}
.skb .skx-opt>b{grid-area:1/1}
.skb .skx-opt>.skx-num{grid-area:1/2;min-width:0;text-align:right}
.skb .skx-opt>input[type=range]{grid-area:2/1/3/3;width:100%;height:30px;padding:0;margin:0;border:0;background:transparent;accent-color:var(--ink);cursor:pointer}
.skb-foot{display:flex;justify-content:flex-end;margin-top:10px}
.skb-foot .btn.small{min-height:32px}
.skb-foot .btn:disabled{opacity:.4;cursor:default}
`;
