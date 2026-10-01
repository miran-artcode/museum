/* 디지털 에스키스: 레이어 창
   src-sketch.jsx가 떠 있는 창 안에 넣는다. 창의 위치·테두리·그림자·스크롤은 부모가 정한다.
   - 레이어를 바꾸는 일은 모두 엔진(src-sketch-engine.mjs)의 레이어 작업으로 하고, 끝나면 onChange()를 부른다.
     작업은 전부 되돌리기 기록에 들어가므로 확인 창을 띄우지 않는다.
   - 레이어 고르기는 onSelect(id)로 부모에게 맡긴다(부모가 eng.activeId를 바꾸고 eng.mount()를 한다).
   - 미리보기는 L.ver(픽셀이 바뀔 때마다 올라가는 수)가 바뀔 때만 다시 그린다.
   - 잠근 레이어는 비우기·아래와 합치기·지우기를 막는다(잠금을 풀면 된다).
   - 획을 긋는 중(eng.live)에는 아무것도 바꾸지 않는다(펜으로 긋는 동안 손가락이 창에 닿는 경우).
   CSS는 SKETCH_LAYERS_CSS(접두사 skl-). */
import React, { useState, useEffect, useRef } from "react";
import { MAX_LAYERS, BLENDS, paperColor } from "./src-sketch-engine.mjs";
import { Icon, IconBtn, Range, PanelHead } from "./src-sketch-ui.jsx";

const THUMB = 40;      // 미리보기의 긴 변(px)
const NAME_MAX = 20;   // 레이어 이름 글자 수
const BLEND_NAME = Object.fromEntries(BLENDS);

/* 레이어 한 장의 작은 미리보기: 종이 색 위에 레이어 그림 */
function Thumb({ L, paper }) {
  const ref = useRef(null);
  const W = L.cv.width, H = L.cv.height;
  const k = THUMB / Math.max(W, H, 1);
  const cw = Math.max(1, Math.round(W * k)), ch = Math.max(1, Math.round(H * k));
  const dpr = typeof window !== "undefined" ? Math.min(2, Math.max(1, window.devicePixelRatio || 1)) : 1;
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const x = c.getContext("2d");
    x.globalAlpha = 1; x.globalCompositeOperation = "source-over";
    x.fillStyle = paper; x.fillRect(0, 0, c.width, c.height);
    if (!L.cv.width || !L.cv.height) return;
    x.imageSmoothingQuality = "high";
    try { x.drawImage(L.cv, 0, 0, c.width, c.height); } catch (e) {}
  }, [L.cv, L.ver, paper, cw, ch, dpr]);
  return <canvas ref={ref} className="skl-thumb" width={Math.round(cw * dpr)} height={Math.round(ch * dpr)} style={{ width: cw, height: ch }} aria-hidden="true" />;
}

/* 이름 입력칸. 치는 동안에는 친 글자를 그대로 보이고, 빈 이름은 엔진에 넘기지 않는다.
   칸을 벗어나면 엔진에 적힌 이름으로 돌아간다 */
function NameInput({ name, onCommit }) {
  const [draft, setDraft] = useState(null);
  return (
    <input type="text" value={draft == null ? name : draft} maxLength={NAME_MAX} aria-label="레이어 이름" autoComplete="off" spellCheck={false} enterKeyHint="done"
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        const v = e.target.value;
        setDraft(v);
        const t = v.trim().slice(0, NAME_MAX).trim();
        if (t && t !== name) onCommit(t);
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={(e) => {
        if (e.nativeEvent && e.nativeEvent.isComposing) { e.stopPropagation(); return; }
        if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); e.stopPropagation(); e.currentTarget.blur(); }
        else if (!e.ctrlKey && !e.metaKey) e.stopPropagation();   // 그리기 단축키가 듣지 않게
      }} />
  );
}

const Act = ({ k, name, onClick, disabled, title }) => (
  <button type="button" className="skx-lbtn" onClick={onClick} disabled={disabled} title={title}><Icon k={k} size={16} />{name}</button>
);

export function LayersPanel({ eng, tick, onChange, onSelect, flash, onClose }) {
  const layers = (eng && eng.layers) || [];
  const n = layers.length;
  const full = n >= MAX_LAYERS;
  const A = n ? eng.layer(eng.activeId) || eng.active() : null;
  const ai = A ? layers.indexOf(A) : -1;
  const below = ai > 0 ? layers[ai - 1] : null;
  const paper = paperColor(eng ? eng.paper : "white");
  const fullMsg = `레이어는 ${MAX_LAYERS}장까지 만들 수 있습니다.`;
  const lockMsg = "잠금을 풀면 쓸 수 있습니다.";

  /* 획을 긋는 중에는 레이어를 바꾸지 않는다(엔진의 되돌리기도 같은 조건에서 멈춘다) */
  const idle = () => !!eng && !eng.live;
  /* fn이 참을 돌려줄 때(엔진이 실제로 바꿨을 때)만 부모에게 알린다 */
  const run = (fn, msg) => {
    if (!idle() || !fn()) return;
    if (onChange) onChange();
    if (msg && flash) flash(msg);
  };
  const set = (L, patch) => run(() => { eng.setLayer(L.id, patch); return true; });

  return (
    <div className="skl">
      <PanelHead title="레이어" onClose={onClose}>
        <button type="button" className="skx-lbtn skl-hb" disabled={!eng || full} title={full ? fullMsg : `새 레이어 (${n}/${MAX_LAYERS})`}
          onClick={() => run(() => eng.addLayer())}><Icon k="plus" size={16} />새 레이어</button>
        <button type="button" className="skx-lbtn skl-hb" disabled={n <= 1} title="보이는 레이어를 한 장으로 합칩니다"
          onClick={() => run(() => eng.flatten(), "레이어를 모두 합쳤습니다.")}><Icon k="flatten" size={16} />모두 합치기</button>
      </PanelHead>

      <ul className="skl-list" role="list" aria-label="레이어 목록">
        {[...layers].reverse().map((L) => {
          const on = !!A && L.id === A.id;
          const meta = [];
          if (L.op < 1) meta.push(Math.round(L.op * 100) + "%");
          if (L.blend && L.blend !== "normal") meta.push(BLEND_NAME[L.blend] || L.blend);
          const say = [L.name, ...meta];
          if (L.alock) say.push("알파 잠금");
          if (L.lock) say.push("잠금");
          if (!L.vis) say.push("숨김");
          return (
            <li key={L.id} className={"skl-row" + (on ? " on" : "") + (L.vis ? "" : " hid")}>
              <IconBtn k={L.vis ? "eye" : "eyeOff"} label={L.name + (L.vis ? " 숨기기" : " 보이기")} onClick={() => set(L, { vis: !L.vis })} />
              <button type="button" className="skl-pick" aria-pressed={on} aria-label={say.join(", ")} onClick={() => { if (onSelect && idle()) onSelect(L.id); }}>
                <span className="skl-th"><Thumb L={L} paper={paper} /></span>
                <span className="skl-txt">
                  <span className="skl-name">{L.name}</span>
                  {meta.length > 0 && <span className="skl-meta">{meta.join(" · ")}</span>}
                </span>
                {(L.alock || L.lock) && (
                  <span className="skl-flags">
                    {L.alock && <span title="알파 잠금"><Icon k="alpha" size={15} /></span>}
                    {L.lock && <span title="잠금"><Icon k="lock" size={15} /></span>}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {A && (
        <div className="skl-set" role="group" aria-label={A.name + " 레이어 설정"}>
          <label className="skl-f"><b>이름</b>
            <NameInput key={A.id} name={A.name} onCommit={(name) => set(A, { name })} />
          </label>
          <Range label="불투명도" min={0} max={100} value={Math.round(A.op * 100)} onChange={(v) => set(A, { op: v / 100 })} fmt={(v) => v + "%"} wide />
          <label className="skl-f"><b>혼합 모드</b>
            <select value={A.blend || "normal"} aria-label="혼합 모드" onChange={(e) => set(A, { blend: e.target.value })}
              onKeyDown={(e) => { if (!e.ctrlKey && !e.metaKey) e.stopPropagation(); }}>
              {BLENDS.map(([k, name]) => <option key={k} value={k}>{name}</option>)}
            </select>
          </label>
          <div className="skl-tg">
            <button type="button" className={"skx-chip" + (A.alock ? " on" : "")} aria-pressed={!!A.alock} title="이미 칠한 곳에만 그려집니다"
              onClick={() => set(A, { alock: !A.alock })}><Icon k="alpha" size={15} />알파 잠금</button>
            <button type="button" className={"skx-chip" + (A.lock ? " on" : "")} aria-pressed={!!A.lock} title="이 레이어에 그릴 수 없습니다"
              onClick={() => set(A, { lock: !A.lock })}><Icon k={A.lock ? "lock" : "unlock"} size={15} />잠금</button>
          </div>
          {A.lock ? <p className="hint">잠근 레이어는 그리기·비우기·합치기·지우기를 할 수 없습니다.</p>
            : A.alock ? <p className="hint">이미 칠한 곳에만 그려집니다.</p> : null}
          <div className="skl-acts">
            <Act k="copy" name="복제" disabled={full} title={full ? fullMsg : undefined}
              onClick={() => run(() => eng.dupLayer(A.id))} />
            <Act k="merge" name="아래와 합치기" disabled={!below || A.lock || below.lock} title={below && (A.lock || below.lock) ? lockMsg : undefined}
              onClick={() => run(() => eng.mergeDown(A.id), "아래 레이어와 합쳤습니다.")} />
            <Act k="up" name="위로" disabled={ai >= n - 1}
              onClick={() => run(() => eng.moveLayer(A.id, 1))} />
            <Act k="down" name="아래로" disabled={ai <= 0}
              onClick={() => run(() => eng.moveLayer(A.id, -1))} />
            <Act k="eraser" name="비우기" disabled={A.lock || !eng.layerHasContent(A)} title={A.lock ? lockMsg : undefined}
              onClick={() => run(() => eng.commit({ kind: "clear", layers: [A.id] }), "레이어를 비웠습니다.")} />
            <Act k="trash" name="지우기" disabled={n <= 1 || A.lock} title={n > 1 && A.lock ? lockMsg : undefined}
              onClick={() => run(() => eng.removeLayer(A.id), "레이어를 지웠습니다. 되돌리기로 복구할 수 있습니다.")} />
          </div>
          {full && <p className="hint">{fullMsg}</p>}
        </div>
      )}
    </div>
  );
}

export const SKETCH_LAYERS_CSS = `
.skl{box-sizing:border-box;width:100%;min-width:0;background:#fff;color:var(--ink);font-family:var(--sans);font-size:13px;line-height:1.4;text-align:left;container-type:inline-size}
.skl *,.skl *::before,.skl *::after{box-sizing:border-box}
.skl button{margin:0;border-radius:0}
.skl button:disabled{opacity:.4;cursor:default}
.skl button:focus-visible,.skl input:focus-visible,.skl select:focus-visible{outline:2px solid var(--ink);outline-offset:1px}
.skl .hint{margin:0}
/* 제목 줄의 버튼: 창이 좁으면 글자만, 넓으면 아이콘도.
   앱 전체가 border-box라 300px 창의 안쪽 폭은 298px, 260px 창은 258px이다 */
.skl .skx-phead>b{min-width:0;overflow:hidden;white-space:nowrap}
.skl .skx-phead .skl-hb{flex:0 0 auto;padding:0 8px;white-space:nowrap}
.skl .skl-hb svg{display:none}
@container (min-width:296px){
  .skl .skx-phead .skl-hb{padding:0 8px 0 4px}
  .skl .skl-hb svg{display:block}
}
@container (max-width:268px){
  .skl .skx-phead{gap:4px;padding-left:8px}
  .skl .skx-phead .skl-hb{padding:0 6px}
}
.skl-list{list-style:none;margin:0;padding:4px 0;border-bottom:1px solid var(--line2)}
.skl-row{display:flex;align-items:center;gap:2px;padding:1px 4px}
.skl-row.on{background:#efefef;box-shadow:inset 3px 0 0 var(--seal)}
.skl-row .skx-ib{flex:0 0 auto}
.skl-row .skx-ib svg{width:18px;height:18px}
.skl-row.hid .skx-ib{color:var(--sub)}
.skl-pick{flex:1;min-width:0;display:flex;align-items:center;gap:8px;min-height:46px;padding:2px 6px 2px 2px;border:0;background:transparent;font-family:var(--sans);font-size:13px;line-height:1.35;color:var(--ink);text-align:left;cursor:pointer}
.skl-row:not(.on) .skl-pick:hover{background:#f4f4f4}
.skl .skl-pick:focus-visible{outline-offset:-2px}
.skl-th{flex:0 0 42px;display:flex;align-items:center;justify-content:center;height:42px}
.skl-thumb{display:block;border:1px solid var(--line)}
.skl-row.hid .skl-thumb{opacity:.4}
.skl-txt{flex:1;min-width:0;display:flex;flex-direction:column}
.skl-name,.skl-meta{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.skl-row.on .skl-name{font-weight:700}
.skl-row.hid .skl-name{color:var(--sub)}
.skl-meta{font-size:11.5px;color:var(--sub);font-variant-numeric:tabular-nums}
.skl-flags{flex:0 0 auto;display:inline-flex;align-items:center;gap:4px;color:var(--sub)}
.skl-flags span{display:inline-flex}
/* 고른 레이어의 설정 */
.skl-set{display:flex;flex-direction:column;gap:8px;padding:10px}
.skl .skl-f{display:flex;align-items:center;gap:7px;min-width:0;margin:0;font-size:13px;color:var(--ink)}
.skl .skl-f>b,.skl .skl-set .skx-opt>b{flex:0 0 64px;font-weight:500;font-size:12.5px;color:var(--sub);white-space:nowrap}
.skl .skl-f input[type=text],.skl .skl-f select{flex:1;min-width:0;width:auto;height:32px;margin:0;padding:4px 8px;border:1px solid #9a9a9a;border-radius:0;background:#fff;font-family:var(--sans);font-size:13px;color:var(--ink)}
.skl .skl-f select{padding:4px;cursor:pointer}
.skl .skl-set .skx-opt{display:flex;flex-wrap:nowrap;align-items:center;gap:7px;width:100%;min-width:0}
.skl .skl-set .skx-opt input[type=range]{flex:1;width:auto;min-width:0;height:30px;margin:0;padding:0;border:0}
.skl .skl-set .skx-num{flex:0 0 auto;min-width:38px;text-align:right}
.skl-tg{display:flex;flex-wrap:wrap;gap:6px}
.skl .skl-tg .skx-chip{display:inline-flex;align-items:center;gap:5px;min-height:32px;padding:0 11px 0 8px;white-space:nowrap}
.skl-acts{display:grid;grid-template-columns:1fr 1fr;gap:4px}
.skl .skl-acts .skx-lbtn{min-width:0;white-space:nowrap}
@media (pointer:coarse){
  .skl .skl-f input[type=text],.skl .skl-f select{height:38px;font-size:16px}
  .skl .skl-set .skx-opt input[type=range]{height:34px}
  .skl .skl-tg .skx-chip,.skl .skl-acts .skx-lbtn,.skl .skx-phead .skl-hb{min-height:36px}
}
`;
