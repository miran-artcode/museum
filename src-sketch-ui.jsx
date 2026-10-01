/* 디지털 에스키스 화면의 공용 부품: 아이콘, 아이콘 버튼, 고르기 묶음, 슬라이더 줄.
   모양(CSS)은 src-sketch.jsx의 SKETCH_CSS에 있다(.skx-ib · .skx-seg · .skx-opt · .skx-num · .skx-chip). */
import React from "react";

export const ICONS = {
  pencil: <><path d="M4 16l.7-3.2L14.2 3.3a1.6 1.6 0 0 1 2.3 0l.2.2a1.6 1.6 0 0 1 0 2.3L7.2 15.3z" /><path d="M12.6 4.9l2.5 2.5" /></>,
  pen: <><path d="M10 2.5l4.5 6.5L10 17.5 5.5 9z" /><circle cx="10" cy="9.5" r="1.2" /><path d="M10 10.7v6.8" /></>,
  brush: <><path d="M16.8 3.2c-2.2 1.2-5.6 4.4-7.3 6.6l1.7 1.7c2.2-1.7 5.4-5.1 6.6-7.3z" /><path d="M9.3 10.1c-1.8-.2-3.3 1-3.5 2.7-.2 1.5-1 2.6-2.3 3.4 3.2.7 6.8-.4 7.4-3.7" /></>,
  marker: <><path d="M12.5 3.5l4 4-7.5 7.5H5v-4z" /><path d="M10.5 5.5l4 4" /><path d="M3 17.5h7" /></>,
  flat: <><path d="M6 3h8v6H6z" /><path d="M6 9l1 3h6l1-3" /><path d="M8 12v5M10 12v5M12 12v5" /></>,
  water: <><path d="M10 2.8c2.6 3.4 4.6 6 4.6 8.6a4.6 4.6 0 0 1-9.2 0c0-2.6 2-5.2 4.6-8.6z" /><path d="M7.6 11.8a2.5 2.5 0 0 0 2 2.4" /></>,
  charcoal: <><path d="M6.2 16.8L3.2 13.8 12 5l3 3z" /><path d="M12 5l1.6-1.6a1.4 1.4 0 0 1 2 0l1 1a1.4 1.4 0 0 1 0 2L15 8" /><path d="M3 18.2h1.2M5.5 18.2h1" /></>,
  pastel: <><rect x="4" y="6.5" width="12" height="7" rx="1" transform="rotate(-25 10 10)" /><path d="M8.2 7.2l2.9 6.2" /></>,
  air: <><circle cx="6" cy="10" r="3.5" /><path d="M9.5 10h4" /><circle cx="15.5" cy="7" r=".7" /><circle cx="17" cy="10" r=".7" /><circle cx="15.5" cy="13" r=".7" /><circle cx="17.8" cy="5.5" r=".5" /><circle cx="17.8" cy="14.5" r=".5" /></>,
  spray: <><rect x="4" y="8" width="6" height="9" rx="1" /><path d="M5.5 8V6h3v2M7 6V4.5" /><circle cx="12.5" cy="4" r=".6" /><circle cx="15" cy="3" r=".6" /><circle cx="14.5" cy="6" r=".6" /><circle cx="17" cy="5" r=".6" /><circle cx="16.5" cy="8" r=".6" /></>,
  eraser: <><path d="M3.5 12.5l7.2-7.2a1.5 1.5 0 0 1 2.1 0l3.9 3.9a1.5 1.5 0 0 1 0 2.1L11 17H7.5z" /><path d="M7.8 8.2l6 6" /><path d="M11 17h6" /></>,
  smudge: <><path d="M8 17c-2-.6-3.5-2.6-3.5-5V8.2a1.2 1.2 0 0 1 2.4 0V11M6.9 9V4.4a1.2 1.2 0 0 1 2.4 0V9M9.3 8.5V5.6a1.2 1.2 0 0 1 2.4 0v4M11.7 9.2a1.2 1.2 0 0 1 2.4 0v2.3c0 3-1.7 5.2-4.4 5.5" /></>,
  fill: <><path d="M9 3l6.5 6.5-5.6 5.6a1.5 1.5 0 0 1-2.1 0L3.9 11.2a1.5 1.5 0 0 1 0-2.1z" /><path d="M4 10.5h10.5" /><path d="M16.5 13.2c.9 1.2 1.4 2 1.4 2.7a1.4 1.4 0 0 1-2.8 0c0-.7.5-1.5 1.4-2.7z" /></>,
  shape: <><rect x="2.8" y="2.8" width="8.4" height="8.4" /><circle cx="13" cy="13" r="4.3" /></>,
  text: <><path d="M4 5V3.5h12V5" /><path d="M10 3.5v13" /><path d="M7.5 16.5h5" /></>,
  picker: <><path d="M12.6 3.9a2.1 2.1 0 0 1 3 3l-1.8 1.8-3-3z" /><path d="M10.8 5.7l-6.5 6.5-.6 3.6 3.6-.6 6.5-6.5" /></>,
  hand: <><path d="M7 10.5V5.2a1.1 1.1 0 0 1 2.2 0v4.3M9.2 9.5V3.9a1.1 1.1 0 0 1 2.2 0v5.6M11.4 9.5V5.1a1.1 1.1 0 0 1 2.2 0v5.4M13.6 10.3V7.6a1.1 1.1 0 0 1 2.2 0v4.9c0 3-2.3 5.3-5.3 5.3-2.1 0-3.4-.9-4.6-2.6L3.6 12a1.1 1.1 0 0 1 1.8-1.3L7 12.4" /></>,
  select: <><path d="M3 5V3h2M8 3h4M15 3h2v2M17 8v4M17 15v2h-2M12 17H8M5 17H3v-2M3 12V8" /></>,
  transform: <><path d="M4 3l5.2 13 1.9-5.6 5.6-1.9z" /></>,
  adjust: <><path d="M4 5h6M14 5h2M4 10h2M10 10h6M4 15h8M16 15h0" /><circle cx="12" cy="5" r="1.8" /><circle cx="8" cy="10" r="1.8" /><circle cx="14" cy="15" r="1.8" /></>,
  actions: <><path d="M12.2 3.2a4 4 0 0 0-3.7 5.5L3.4 13.8a1.6 1.6 0 0 0 2.3 2.3l5.1-5.1a4 4 0 0 0 5.5-3.7l-2.3 2.3-2.3-.6-.6-2.3z" /></>,
  history: <><circle cx="10" cy="10" r="6.8" /><path d="M10 6v4.2l2.8 1.8" /></>,
  undo: <><path d="M7.5 4.5L3.5 8.5l4 4" /><path d="M3.5 8.5h8.5a4.5 4.5 0 0 1 0 9H9" /></>,
  redo: <><path d="M12.5 4.5l4 4-4 4" /><path d="M16.5 8.5H8a4.5 4.5 0 0 0 0 9h3" /></>,
  zoomOut: <><circle cx="8.5" cy="8.5" r="5.5" /><path d="M12.5 12.5l5 5M6 8.5h5" /></>,
  zoomIn: <><circle cx="8.5" cy="8.5" r="5.5" /><path d="M12.5 12.5l5 5M6 8.5h5M8.5 6v5" /></>,
  flip: <><path d="M10 2.5v15" strokeDasharray="2 2" /><path d="M7.5 5.5L2.5 14h5z" /><path d="M12.5 5.5l5 8.5h-5z" /></>,
  flipV: <><path d="M2.5 10h15" strokeDasharray="2 2" /><path d="M5.5 7.5L14 2.5v5z" /><path d="M5.5 12.5l8.5 5v-5z" /></>,
  layers: <><path d="M10 3l7.5 4-7.5 4-7.5-4z" /><path d="M2.5 11l7.5 4 7.5-4" /></>,
  full: <><path d="M3 7.5V3h4.5M12.5 3H17v4.5M17 12.5V17h-4.5M7.5 17H3v-4.5" /></>,
  unfull: <><path d="M7.5 3v4.5H3M17 7.5h-4.5V3M12.5 17v-4.5H17M3 12.5h4.5V17" /></>,
  rotL: <><path d="M4.5 9a6 6 0 1 1 1.6 5" /><path d="M4 4.5V9h4.5" /></>,
  rotR: <><path d="M15.5 9a6 6 0 1 0-1.6 5" /><path d="M16 4.5V9h-4.5" /></>,
  eye: <><path d="M1.8 10S5 4.5 10 4.5 18.2 10 18.2 10 15 15.5 10 15.5 1.8 10 1.8 10z" /><circle cx="10" cy="10" r="2.6" /></>,
  eyeOff: <><path d="M3 3l14 14" /><path d="M8 5a8.6 8.6 0 0 1 2-.5c5 0 8.2 5.5 8.2 5.5a14 14 0 0 1-2.4 3M5.4 6.6A13.5 13.5 0 0 0 1.8 10S5 15.5 10 15.5a8 8 0 0 0 3.5-.8" /></>,
  up: <path d="M5 12.5l5-5 5 5" />,
  down: <path d="M5 7.5l5 5 5-5" />,
  trash: <><path d="M3.5 5.5h13M8 5.5V3.5h4v2M5.5 5.5l.8 11h7.4l.8-11" /></>,
  plus: <path d="M10 4v12M4 10h12" />,
  close: <path d="M5 5l10 10M15 5L5 15" />,
  check: <path d="M4 10.5l4 4 8-9" />,
  lock: <><rect x="4.5" y="9" width="11" height="8" rx="1" /><path d="M7 9V6.5a3 3 0 0 1 6 0V9" /></>,
  unlock: <><rect x="4.5" y="9" width="11" height="8" rx="1" /><path d="M7 9V6.5a3 3 0 0 1 5.7-1.3" /></>,
  alpha: <><rect x="3" y="3" width="14" height="14" /><path d="M3 10h14M10 3v14" /><path d="M3 3h7v7H3zM10 10h7v7h-7z" fill="currentColor" stroke="none" opacity=".45" /></>,
  copy: <><rect x="6.5" y="6.5" width="10" height="10" /><path d="M13.5 6.5v-3h-10v10h3" /></>,
  merge: <><path d="M10 3v9M6.5 8.5L10 12l3.5-3.5" /><path d="M3.5 16.5h13" /></>,
  flatten: <><path d="M3.5 6h13M3.5 10h13" /><path d="M3 14.5h14v2H3z" fill="currentColor" stroke="none" /></>,
  play: <path d="M6 4l10 6-10 6z" fill="currentColor" />,
  pause: <path d="M6 4v12M14 4v12" strokeWidth="2.6" />,
  restart: <><path d="M5 4v12" /><path d="M16 4l-8 6 8 6z" fill="currentColor" /></>,
  download: <><path d="M10 3v10M6 9.5l4 4 4-4" /><path d="M3.5 16.5h13" /></>,
  image: <><rect x="3" y="4" width="14" height="12" /><path d="M3 13l4-4 4 4 2.5-2.5L17 14" /><circle cx="13" cy="7.5" r="1.2" /></>,
  grid: <><path d="M3 3h14v14H3zM3 7.7h14M3 12.3h14M7.7 3v14M12.3 3v14" /></>,
  persp: <><path d="M2.5 15.5l7.5-11 7.5 11z" /><path d="M10 4.5v11M6.2 10h7.6" /></>,
  sym: <><path d="M10 2.5v15" strokeDasharray="2 2" /><path d="M7.5 6C4 7 4 13 7.5 14M12.5 6c3.5 1 3.5 7 0 8" /></>,
  more: <><circle cx="4.5" cy="10" r="1.2" fill="currentColor" /><circle cx="10" cy="10" r="1.2" fill="currentColor" /><circle cx="15.5" cy="10" r="1.2" fill="currentColor" /></>,
  save: <><path d="M4 3.5h10l2.5 2.5v10.5H4z" /><path d="M7 3.5v4h6v-4M7 16.5v-5h6v5" /></>,
  version: <><rect x="3" y="6" width="11" height="11" /><path d="M6 6V3h11v11h-3" /></>,
  sliders: <><path d="M5 3v14M10 3v14M15 3v14" /><rect x="3.5" y="5" width="3" height="3" fill="currentColor" /><rect x="8.5" y="11" width="3" height="3" fill="currentColor" /><rect x="13.5" y="7" width="3" height="3" fill="currentColor" /></>,
  wand: <><path d="M4 16L13 7" strokeWidth="2" /><path d="M14.5 2.5v3M13 4h3M17 8v2M16 9h2M9.5 2.5v2M8.5 3.5h2" /></>,
  lasso: <><path d="M10 3.5c4 0 7 2 7 4.5s-3 4.500-7 4.500S3 10.500 3 8s3-4.500 7-4.500z" /><path d="M6 12c-1 1-1 2.500.500 2.500S8 13 6.500 12.500M6 15c0 1.500 1 2.500 2.500 2.500" /></>,
  invertSel: <><rect x="3" y="3" width="14" height="14" /><rect x="7" y="7" width="6" height="6" fill="currentColor" /></>,
};

export const Icon = ({ k, size = 20 }) => (
  <svg viewBox="0 0 20 20" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{ICONS[k]}</svg>
);

/* 글자 없는 아이콘 버튼. on을 주면 눌린 상태(aria-pressed)를 가진 토글 */
export function IconBtn({ k, label, onClick, on, disabled, className = "" }) {
  return (
    <button type="button" className={"skx-ib" + (on ? " on" : "") + (className ? " " + className : "")} title={label} aria-label={label}
      aria-pressed={on === undefined ? undefined : !!on} disabled={disabled} onClick={onClick}><Icon k={k} /></button>
  );
}

/* 여럿 가운데 하나 고르기. items: [[값, 이름], ...] */
export function Seg({ items, value, onPick, label }) {
  return (
    <span className="skx-seg" role="group" aria-label={label}>
      {items.map(([k, name]) => <button key={k} type="button" className={value === k ? "on" : ""} aria-pressed={value === k} onClick={() => onPick(k)}>{name}</button>)}
    </span>
  );
}

/* 이름 + 슬라이더 + 값. fmt(v) → 보일 글자 */
export function Range({ label, min, max, step = 1, value, onChange, fmt, wide }) {
  return (
    <span className={"skx-opt" + (wide ? " wide" : "")}>
      <b>{label}</b>
      <input type="range" min={min} max={max} step={step} value={value} aria-label={label} onChange={(e) => onChange(+e.target.value)} />
      <span className="skx-num">{fmt ? fmt(value) : value}</span>
    </span>
  );
}

/* 떠 있는 창의 제목 줄: 제목 + (가운데 버튼들) + 닫기 */
export function PanelHead({ title, onClose, children }) {
  return (
    <div className="skx-phead">
      <b>{title}</b>
      {children}
      {onClose && <IconBtn k="close" label={title + " 창 닫기"} onClick={onClose} />}
    </div>
  );
}
