/* 디지털 에스키스: 색 고르기 패널
   src-sketch.jsx의 그리기 도구에 붙이는 색 패널이다. 탭은 사각(채도·명도 사각형 + 색상 슬라이더),
   슬라이더(HSB·RGB·16진수), 조화(보색·유사색·삼색·분할 보색·사색), 팔레트(기본 + 내 팔레트) 네 개.
   - 색 계산은 src-sketch-core.mjs에서 가져온다.
   - 내부에서 HSV를 따로 들고 있다. 명도 0이나 채도 0에서 색상이 0으로 튀지 않게 하려는 것이다.
     밖에서 color가 바뀌면 이 패널이 방금 낸 값과 다를 때만 내부 상태를 맞춘다.
   - 패널의 위치·그림자·스크롤은 부모가 정한다. CSS는 SKETCH_COLOR_CSS(접두사 skc-). */
import React, { useState, useEffect, useRef, useId } from "react";
import { hexToRgb, rgbToHex, rgbToHsv, hsvToRgb, harmony, luminance, clamp } from "./src-sketch-core.mjs";

const MAX_COLORS = 30;   // 한 팔레트에 담는 색 수
const MAX_PALETTES = 8;  // 내 팔레트 수

const TABS = [["box", "사각"], ["sliders", "슬라이더"], ["harmony", "조화"], ["palette", "팔레트"]];
const HARMONIES = [["complement", "보색"], ["analogous", "유사색"], ["triad", "삼색"], ["split", "분할 보색"], ["tetrad", "사색"]];
const NAV_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"];
const HUE_STOPS = [0, 60, 120, 180, 240, 300, 360];

/* ---------- 색 보조 함수 ---------- */

const HEX6 = /^#?([0-9a-f]{6})$/i;
function normHex(x) {
  const m = typeof x === "string" ? HEX6.exec(x.trim()) : null;
  return m ? "#" + m[1].toUpperCase() : null;
}
const byte = (x) => clamp(Math.round(Number(x) || 0), 0, 255);
function rgbOf(hex) {
  const a = hexToRgb(hex) || [0, 0, 0];
  return [byte(a[0]), byte(a[1]), byte(a[2])];
}
function hexOfRgb(r, g, b) {
  return normHex(rgbToHex(byte(r), byte(g), byte(b))) || "#000000";
}
function hexOfHsv(h, s, v) {
  const a = hsvToRgb(((h % 360) + 360) % 360, clamp(s, 0, 1), clamp(v, 0, 1));
  return hexOfRgb(a[0], a[1], a[2]);
}
/* 16진수 → HSV. 무채색이면 색상을, 검정이면 색상과 채도를 직전 값(prev)으로 유지한다. */
function hsvOf(hex, prev) {
  const [r, g, b] = rgbOf(hex);
  const a = rgbToHsv(r, g, b) || [0, 0, 0];
  let h = Number.isFinite(a[0]) ? clamp(a[0], 0, 360) : 0;
  let s = Number.isFinite(a[1]) ? clamp(a[1], 0, 1) : 0;
  const v = Number.isFinite(a[2]) ? clamp(a[2], 0, 1) : 0;
  if (prev) {
    if (v < 0.001) { h = prev.h; s = prev.s; }
    else if (s < 0.001) h = prev.h;
  }
  return { h, s, v };
}
const grad = (stops) => "linear-gradient(to right," + stops.join(",") + ")";
const markOf = (hex) => (luminance(hex) > 0.5 ? "#111" : "#fff");

/* ---------- 작은 부품 ---------- */

function Sw({ hex, name, label, on, del, onClick }) {
  const said = label || name || hex;
  const tip = name ? name + " " + hex : label || hex;
  return (
    <button type="button" className={"skc-sw" + (on ? " on" : "") + (del ? " del" : "")}
      style={{ background: hex, "--skc-on": markOf(hex) }}
      title={del ? tip + " 지우기" : tip} aria-label={del ? said + " 지우기" : said}
      aria-pressed={del ? undefined : !!on} onClick={onClick} />
  );
}

/* 숫자 입력칸. 입력 중인 글자는 따로 들고 있다가, 값이 다른 경로로 바뀌면 버린다. */
function NumIn({ value, min, max, label, onCommit }) {
  const [draft, setDraft] = useState(null);
  const shown = draft && draft.v === value ? draft.t : String(value);
  return (
    <input type="number" className="skc-numin" inputMode="numeric" min={min} max={max} step={1} aria-label={label}
      value={shown}
      onChange={(e) => {
        const t = e.target.value;
        const n = Number(t);
        if (t.trim() !== "" && Number.isFinite(n)) {
          const c = clamp(Math.round(n), min, max);
          setDraft({ t, v: c });
          onCommit(c);
        } else setDraft({ t, v: value });
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={(e) => { if (e.key === "Enter") setDraft(null); }} />
  );
}

/* 16진수 입력칸. 올바른 #RRGGBB가 되는 순간 반영한다. */
function HexIn({ value, id, onCommit }) {
  const [draft, setDraft] = useState(null);
  const shown = draft && draft.v === value ? draft.t : value;
  return (
    <input id={id} type="text" className="skc-hexin" value={shown} maxLength={7} spellCheck={false}
      autoComplete="off" autoCapitalize="characters" autoCorrect="off" placeholder="#RRGGBB"
      onChange={(e) => {
        const t = e.target.value;
        const n = normHex(t);
        if (n) { setDraft({ t, v: n }); onCommit(n); }
        else setDraft({ t, v: value });
      }}
      onBlur={() => setDraft(null)}
      onKeyDown={(e) => { if (e.key === "Enter") setDraft(null); }} />
  );
}

/* 팔레트 이름 입력칸. 칸을 벗어나거나 Enter를 누르면 반영한다. */
function NameIn({ value, onCommit }) {
  const [draft, setDraft] = useState(null);
  const commit = () => {
    if (draft === null) return;
    const t = draft.trim();
    setDraft(null);
    if (t && t !== value) onCommit(t);
  };
  return (
    <input type="text" className="skc-namein" value={draft === null ? value : draft} maxLength={16} aria-label="팔레트 이름"
      onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); } }} />
  );
}

/* 채널 한 줄: 이름, 슬라이더, 숫자 */
function Chan({ id, name, letter, unit, min, max, value, track, onSet }) {
  return (
    <div className="skc-row">
      <label htmlFor={id} title={name + " (" + letter + ")"}>{name}</label>
      <input id={id} type="range" className="skc-range" min={min} max={max} step={1} value={value}
        aria-valuetext={value + unit} style={{ "--skc-track": track }}
        onChange={(e) => onSet(Number(e.target.value))} />
      <NumIn value={value} min={min} max={max} label={name + " 값"} onCommit={onSet} />
    </div>
  );
}

/* ---------- 패널 ---------- */

export function ColorPanel({ color, onChange, recent = [], basePalette = [], palettes = [], onPalettes, onClose, defaultTab = "box" }) {
  const uid = useId();
  const start = normHex(color) || "#000000";
  const [first] = useState(start);                 // 처음 열었을 때의 색
  /* h 0..360, s·v 0..1, hex: 지금 색, base: 조화 탭의 기준 색 */
  const [st, setSt] = useState(() => ({ ...hsvOf(start, null), hex: start, base: start }));
  const stRef = useRef(st);
  const known = useRef(start);                     // 부모와 마지막으로 주고받은 색
  const dragId = useRef(null);                     // 사각형을 끄는 포인터
  const svRef = useRef(null);
  const [tab, setTab] = useState(TABS.some((t) => t[0] === defaultTab) ? defaultTab : "box");
  const [edit, setEdit] = useState(false);
  const [ask, setAsk] = useState(-1);              // 지울지 확인 중인 팔레트 번호

  /* 밖에서 바뀐 색 맞추기. 내가 방금 낸 값이면 건너뛴다(끄는 중에도 건너뜀). */
  useEffect(() => {
    const n = normHex(color);
    if (!n || dragId.current !== null || n === known.current) return;
    known.current = n;
    const next = { ...hsvOf(n, stRef.current), hex: n, base: n };
    stRef.current = next;
    setSt(next);
  }, [color]);

  const apply = (next) => {
    stRef.current = next;
    setSt(next);
    if (next.hex !== known.current) {
      known.current = next.hex;
      if (onChange) onChange(next.hex);
    }
  };
  const setHSV = (h, s, v) => {
    const hex = hexOfHsv(h, s, v);
    apply({ h, s, v, hex, base: hex });
  };
  /* 16진수로 고르기. keepBase: 조화 탭에서 고를 때는 기준 색을 그대로 둔다. */
  const pick = (raw, keepBase) => {
    const n = normHex(raw);
    if (!n) return;
    const cur = stRef.current;
    apply({ ...hsvOf(n, cur), hex: n, base: keepBase ? cur.base : n });
  };
  const setRGB = (r, g, b) => pick(hexOfRgb(r, g, b));

  /* 채도·명도 사각형 */
  const svAt = (e) => {
    const el = svRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const s = clamp((e.clientX - r.left) / r.width, 0, 1);
    const v = 1 - clamp((e.clientY - r.top) / r.height, 0, 1);
    setHSV(stRef.current.h, s, v);
  };
  const svDown = (e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragId.current = e.pointerId;                  // 다른 포인터가 끌던 중이면 새 포인터가 이어받는다
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 이미 끝난 포인터 */ }
    svAt(e);
  };
  const svMove = (e) => { if (dragId.current === e.pointerId) svAt(e); };
  const svEnd = (e) => { if (dragId.current === e.pointerId) dragId.current = null; };
  const svKey = (e) => {
    const d = e.shiftKey ? 10 : 1;
    const c = stRef.current;
    let s = Math.round(c.s * 100), v = Math.round(c.v * 100);
    if (e.key === "ArrowLeft") s -= d;
    else if (e.key === "ArrowRight") s += d;
    else if (e.key === "ArrowUp") v += d;
    else if (e.key === "ArrowDown") v -= d;
    else return;
    e.preventDefault();
    e.stopPropagation();
    setHSV(c.h, clamp(s, 0, 100) / 100, clamp(v, 0, 100) / 100);
  };

  /* 입력칸에서 누른 글자와 슬라이더의 방향키가 부모의 단축키로 넘어가지 않게 한다. Esc는 부모가 처리한다. */
  const rootKey = (e) => {
    if (e.key === "Escape") return;
    const t = e.target;
    if (!t || t.tagName !== "INPUT") return;
    if (t.type !== "range" || NAV_KEYS.includes(e.key)) e.stopPropagation();
  };
  const tabKey = (e, i) => {
    const n = TABS.length;
    let j;
    if (e.key === "ArrowRight") j = (i + 1) % n;
    else if (e.key === "ArrowLeft") j = (i - 1 + n) % n;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = n - 1;
    else return;
    e.preventDefault();
    e.stopPropagation();
    setTab(TABS[j][0]);
    const el = document.getElementById(uid + "-t-" + TABS[j][0]);
    if (el) el.focus();
  };

  /* 내 팔레트 (불변 갱신) */
  const pals = Array.isArray(palettes) ? palettes : [];
  const canEdit = typeof onPalettes === "function";
  const editing = canEdit && edit;
  const colorsOf = (p) => (p && Array.isArray(p.colors) ? p.colors : []);
  const putPal = (i, patch) => onPalettes(pals.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  const hasNow = (p) => colorsOf(p).some((c) => normHex(c) === st.hex);
  const addColor = (i) => {
    const cs = colorsOf(pals[i]);
    if (cs.length >= MAX_COLORS || hasNow(pals[i])) return;
    putPal(i, { colors: [...cs, st.hex] });
  };
  const delColor = (i, ci) => putPal(i, { colors: colorsOf(pals[i]).filter((_, k) => k !== ci) });
  const delPal = (i) => {
    setAsk(-1);
    if (pals.length <= 1) setEdit(false);
    onPalettes(pals.filter((_, k) => k !== i));
  };
  const newPal = () => {
    if (pals.length >= MAX_PALETTES) return;
    const names = new Set(pals.map((p) => p && p.name));
    let n = 1;
    while (names.has("팔레트 " + n)) n++;
    onPalettes([...pals, { name: "팔레트 " + n, colors: [] }]);
  };

  const { h, s, v, hex } = st;
  const [r, g, b] = rgbOf(hex);
  const H = Math.round(h), S = Math.round(s * 100), V = Math.round(v * 100);
  const pure = hexOfHsv(h, 1, 1);
  const recents = (Array.isArray(recent) ? recent : []).map(normHex).filter(Boolean);
  const base = (Array.isArray(basePalette) ? basePalette : [])
    .map((x) => (Array.isArray(x) ? [normHex(x[0]), x[1]] : [normHex(x), ""]))
    .filter((x) => x[0]);
  const tid = (k) => uid + "-t-" + k;
  const pid = (k) => uid + "-p-" + k;

  return (
    <div className="skc" role="group" aria-label="색 고르기" onKeyDown={rootKey}>
      <div className="skc-head">
        <div className="skc-pair">
          <span className="skc-now" role="img" style={{ background: hex }} title={"지금 색 " + hex} aria-label={"지금 색 " + hex} />
          <button type="button" className="skc-prev" style={{ background: first }}
            title={"이전 색 " + first + " 다시 고르기"} aria-label={"이전 색 " + first + " 다시 고르기"}
            onClick={() => pick(first)} />
        </div>
        <div className="skc-headtxt">
          <b>지금 {hex}</b>
          <span>이전 {first}</span>
        </div>
        {onClose && (
          <button type="button" className="skc-x" title="닫기" aria-label="색 패널 닫기" onClick={onClose}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>
          </button>
        )}
      </div>

      {recents.length > 0 && (
        <div className="skc-sec" role="group" aria-label="최근 쓴 색">
          <div className="skc-cap">최근 쓴 색</div>
          <div className="skc-recent">
            {recents.slice(0, 8).map((c, i) => <Sw key={c + i} hex={c} label={"최근 색 " + c} on={c === hex} onClick={() => pick(c)} />)}
          </div>
        </div>
      )}

      <div className="skc-tabs" role="tablist" aria-label="색 고르는 방법">
        {TABS.map(([k, name], i) => (
          <button key={k} type="button" role="tab" id={tid(k)} className="skc-tab" aria-selected={tab === k} aria-controls={pid(k)}
            tabIndex={tab === k ? 0 : -1} onClick={() => setTab(k)} onKeyDown={(e) => tabKey(e, i)}>{name}</button>
        ))}
      </div>

      <div className="skc-body" role="tabpanel" id={pid(tab)} aria-labelledby={tid(tab)}>
        {tab === "box" && (
          <>
            <div ref={svRef} className="skc-sv" tabIndex={0} role="slider" aria-label="채도와 명도"
              aria-valuemin={0} aria-valuemax={100} aria-valuenow={S} aria-valuetext={"채도 " + S + "%, 명도 " + V + "%"}
              style={{ background: "linear-gradient(to top,#000,rgba(0,0,0,0)),linear-gradient(to right,#fff," + pure + ")" }}
              onPointerDown={svDown} onPointerMove={svMove} onPointerUp={svEnd} onPointerCancel={svEnd} onLostPointerCapture={svEnd}
              onKeyDown={svKey}>
              <i style={{ left: s * 100 + "%", top: (1 - v) * 100 + "%", background: hex }} />
            </div>
            <input type="range" className="skc-range skc-hue" min={0} max={360} step={1} value={H} aria-label="색상" aria-valuetext={H + "도"}
              style={{ "--skc-track": grad(HUE_STOPS.map((d) => hexOfHsv(d, 1, 1))) }}
              onChange={(e) => setHSV(Number(e.target.value), stRef.current.s, stRef.current.v)} />
          </>
        )}

        {tab === "sliders" && (
          <>
            <Chan id={uid + "-h"} name="색상" letter="H" unit="도" min={0} max={360} value={H}
              track={grad(HUE_STOPS.map((d) => hexOfHsv(d, Math.max(s, 0.35), Math.max(v, 0.35))))} onSet={(x) => setHSV(x, stRef.current.s, stRef.current.v)} />
            <Chan id={uid + "-s"} name="채도" letter="S" unit="%" min={0} max={100} value={S}
              track={grad([hexOfHsv(h, 0, v), hexOfHsv(h, 1, v)])} onSet={(x) => setHSV(stRef.current.h, x / 100, stRef.current.v)} />
            <Chan id={uid + "-v"} name="명도" letter="B" unit="%" min={0} max={100} value={V}
              track={grad(["#000000", hexOfHsv(h, s, 1)])} onSet={(x) => setHSV(stRef.current.h, stRef.current.s, x / 100)} />
            <div className="skc-rule" />
            <Chan id={uid + "-r"} name="빨강" letter="R" unit="" min={0} max={255} value={r}
              track={grad([hexOfRgb(0, g, b), hexOfRgb(255, g, b)])} onSet={(x) => setRGB(x, g, b)} />
            <Chan id={uid + "-g"} name="초록" letter="G" unit="" min={0} max={255} value={g}
              track={grad([hexOfRgb(r, 0, b), hexOfRgb(r, 255, b)])} onSet={(x) => setRGB(r, x, b)} />
            <Chan id={uid + "-b"} name="파랑" letter="B" unit="" min={0} max={255} value={b}
              track={grad([hexOfRgb(r, g, 0), hexOfRgb(r, g, 255)])} onSet={(x) => setRGB(r, g, x)} />
            <div className="skc-rule" />
            <div className="skc-row hex">
              <label htmlFor={uid + "-x"}>16진수</label>
              <HexIn id={uid + "-x"} value={hex} onCommit={(n) => pick(n)} />
            </div>
          </>
        )}

        {tab === "harmony" && (
          <>
            <div className="skc-hrow" role="group" aria-label="기준 색">
              <b>기준 색</b>
              <span className="skc-hsw"><Sw hex={st.base} label={"기준 색 " + st.base} on={st.base === hex} onClick={() => pick(st.base, true)} /></span>
            </div>
            {HARMONIES.map(([k, name]) => {
              const out = harmony(st.base, k);
              const list = (Array.isArray(out) ? out : []).map(normHex).filter(Boolean);
              return (
                <div className="skc-hrow" key={k} role="group" aria-label={name}>
                  <b>{name}</b>
                  <span className="skc-hsw">
                    {list.map((c, i) => <Sw key={i} hex={c} label={name + " " + c} on={c === hex} onClick={() => pick(c, true)} />)}
                  </span>
                </div>
              );
            })}
          </>
        )}

        {tab === "palette" && (
          <>
            {base.length > 0 && (
              <div className="skc-pal" role="group" aria-label="기본 팔레트">
                <div className="skc-cap">기본 팔레트</div>
                <div className="skc-grid">
                  {base.map(([c, name], i) => <Sw key={c + i} hex={c} name={name} on={c === hex} onClick={() => pick(c)} />)}
                </div>
              </div>
            )}
            {(canEdit || pals.length > 0) && (
              <div className={"skc-mine" + (base.length > 0 ? " ruled" : "")}>
                <div className="skc-minehead">
                  <b>내 팔레트</b>
                  {canEdit && pals.length > 0 && (
                    <button type="button" className={"skc-btn" + (editing ? " on" : "")} aria-pressed={editing}
                      onClick={() => { setEdit(!edit); setAsk(-1); }}>편집</button>
                  )}
                  {canEdit && (
                    <button type="button" className="skc-btn" disabled={pals.length >= MAX_PALETTES}
                      title={pals.length >= MAX_PALETTES ? "팔레트는 " + MAX_PALETTES + "개까지 만들 수 있습니다" : undefined}
                      onClick={newPal}>새 팔레트</button>
                  )}
                </div>
                {pals.length === 0 && <div className="skc-empty">아직 만든 팔레트가 없습니다.</div>}
                {pals.map((p, i) => {
                  const cs = colorsOf(p);
                  const pname = (p && typeof p.name === "string" && p.name) || "팔레트 " + (i + 1);
                  const full = cs.length >= MAX_COLORS;
                  const dup = hasNow(p);
                  return (
                    <div className="skc-pal" key={i} role="group" aria-label={pname}>
                      {editing && ask === i ? (
                        <div className="skc-palhead">
                          <span className="skc-palname">지울까요?</span>
                          <button type="button" className="skc-btn warn" onClick={() => delPal(i)}>지우기</button>
                          <button type="button" className="skc-btn" onClick={() => setAsk(-1)}>취소</button>
                        </div>
                      ) : editing ? (
                        <div className="skc-palhead">
                          <NameIn value={pname} onCommit={(name) => putPal(i, { name })} />
                          <button type="button" className="skc-btn warn" onClick={() => setAsk(i)}>팔레트 지우기</button>
                        </div>
                      ) : (
                        <div className="skc-palhead">
                          <span className="skc-palname">{pname}<small>{cs.length}/{MAX_COLORS}</small></span>
                          {canEdit && (
                            <button type="button" className="skc-btn" disabled={full || dup}
                              title={full ? "한 팔레트에 " + MAX_COLORS + "색까지 담을 수 있습니다" : dup ? "이미 있는 색입니다" : undefined}
                              aria-label={pname + "에 지금 색 추가"} onClick={() => addColor(i)}>지금 색 추가</button>
                          )}
                        </div>
                      )}
                      {cs.length === 0
                        ? <div className="skc-empty">색이 없습니다.</div>
                        : (
                          <div className="skc-grid">
                            {cs.map((c, ci) => {
                              const n = normHex(c);
                              if (!n) return null;
                              return editing
                                ? <Sw key={ci} hex={n} del onClick={() => delColor(i, ci)} />
                                : <Sw key={ci} hex={n} on={n === hex} onClick={() => pick(n)} />;
                            })}
                          </div>
                        )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- 스타일 ---------- */

export const SKETCH_COLOR_CSS = `
.skc{box-sizing:border-box;width:100%;min-width:0;background:#fff;color:var(--ink);font-family:var(--sans);font-size:13px;line-height:1.4;text-align:left}
.skc *,.skc *::before,.skc *::after{box-sizing:border-box}
.skc button{margin:0;border-radius:0;font-family:var(--sans);color:var(--ink);cursor:pointer}
.skc button:disabled{opacity:.4;cursor:default}
.skc button:focus-visible,.skc .skc-sv:focus-visible,.skc input:focus-visible{outline:2px solid var(--ink);outline-offset:1px}
.skc-head{display:flex;align-items:center;gap:8px;padding:8px 8px 8px 10px;border-bottom:1px solid var(--line2)}
.skc-pair{display:flex;flex:0 0 auto;border:1px solid #9a9a9a}
.skc-now,.skc .skc-prev{display:block;width:36px;height:36px;padding:0;border:0;forced-color-adjust:none}
.skc .skc-prev{border-left:1px solid rgba(0,0,0,.22)}
.skc-headtxt{flex:1;min-width:0;display:flex;flex-direction:column;font-size:12px;line-height:1.4;font-variant-numeric:tabular-nums;white-space:nowrap}
.skc-headtxt b{font-weight:700;font-size:13px}
.skc-headtxt span{color:var(--sub)}
.skc-x{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;padding:0;border:1px solid transparent;background:transparent}
.skc-x:hover{background:#ececec}
.skc-x svg{width:16px;height:16px}
.skc-sec{padding:6px 10px 8px;border-bottom:1px solid var(--line2)}
.skc-cap{margin:0 0 4px;font-size:12px;font-weight:500;color:var(--sub)}
.skc-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(30px,1fr));gap:4px}
.skc-sw{position:relative;display:block;width:100%;min-width:30px;height:30px;padding:0;border:1px solid rgba(0,0,0,.22);forced-color-adjust:none}
.skc-sw.on{outline:2px solid var(--seal);outline-offset:1px;box-shadow:inset 0 0 0 2px #fff}
.skc-recent{display:flex;gap:4px}
.skc-recent .skc-sw{flex:1 1 0;min-width:0;max-width:44px}
.skc-recent .skc-sw:nth-child(n+8){display:none}
.skc-sw.del::after{content:"×";position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:18px;line-height:1;color:var(--skc-on,#fff)}
.skc-tabs{display:flex;border-bottom:1px solid var(--ink)}
.skc-tab{flex:1 1 0;min-width:0;height:32px;padding:0 2px;border:0;border-left:1px solid var(--line2);background:#fff;font-size:12.5px;white-space:nowrap}
.skc-tab:first-child{border-left:0}
.skc-tab:hover{background:#ececec}
.skc-tab[aria-selected=true]{background:var(--ink);color:#fff}
.skc .skc-tab:focus-visible{outline-offset:-3px}
.skc .skc-tab[aria-selected=true]:focus-visible{outline-color:#fff}
.skc-body{padding:10px}
.skc-sv{position:relative;width:100%;height:150px;border:1px solid rgba(0,0,0,.3);outline:none;cursor:crosshair;touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;forced-color-adjust:none}
.skc-sv i{position:absolute;width:16px;height:16px;margin:-8px 0 0 -8px;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 1px rgba(0,0,0,.75);pointer-events:none}
.skc input[type=range].skc-range{-webkit-appearance:none;appearance:none;display:block;flex:1 1 auto;width:100%;min-width:0;height:30px;margin:0;padding:0;border:0;border-radius:0;background:transparent;cursor:pointer;forced-color-adjust:none}
.skc input[type=range].skc-hue{margin-top:8px}
.skc input[type=range].skc-range::-webkit-slider-runnable-track{box-sizing:border-box;height:14px;border:1px solid rgba(0,0,0,.3);background:var(--skc-track,#ddd)}
.skc input[type=range].skc-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;box-sizing:border-box;width:18px;height:18px;margin-top:-3px;border:2px solid var(--ink);border-radius:50%;background:#fff;box-shadow:0 0 0 1px rgba(255,255,255,.9)}
.skc input[type=range].skc-range::-moz-range-track{box-sizing:border-box;height:14px;border:1px solid rgba(0,0,0,.3);background:var(--skc-track,#ddd)}
.skc input[type=range].skc-range::-moz-range-thumb{box-sizing:border-box;width:18px;height:18px;border:2px solid var(--ink);border-radius:50%;background:#fff;box-shadow:0 0 0 1px rgba(255,255,255,.9)}
.skc-row{display:flex;align-items:center;gap:6px;min-height:32px}
.skc-row>label{flex:0 0 28px;margin:0;font-size:12px;font-weight:500;color:var(--sub);white-space:nowrap}
.skc-row.hex>label{flex-basis:auto;margin-right:2px}
.skc-rule{height:1px;margin:6px 0;background:var(--line2)}
.skc input[type=number].skc-numin{flex:0 0 52px;width:52px;height:30px;margin:0;padding:2px 3px 2px 4px;border:1px solid var(--line);border-radius:0;background:#fff;font-family:var(--sans);font-size:12.5px;font-variant-numeric:tabular-nums;color:var(--ink);text-align:right}
.skc input[type=text].skc-hexin{flex:0 0 96px;width:96px;height:30px;margin:0;padding:2px 6px;border:1px solid var(--line);border-radius:0;background:#fff;font-family:var(--sans);font-size:12.5px;font-variant-numeric:tabular-nums;color:var(--ink);text-transform:uppercase}
.skc input[type=text].skc-namein{flex:1 1 auto;width:auto;min-width:0;height:30px;margin:0;padding:2px 6px;border:1px solid var(--line);border-radius:0;background:#fff;font-family:var(--sans);font-size:12.5px;color:var(--ink)}
.skc-hrow{display:flex;align-items:center;gap:6px;min-height:38px}
.skc-hrow>b{flex:0 0 58px;font-size:12.5px;font-weight:500;color:var(--sub);white-space:nowrap}
.skc-hsw{display:flex;flex:1 1 auto;flex-wrap:wrap;gap:4px;min-width:0}
.skc-hsw .skc-sw{flex:0 0 34px;width:34px}
.skc-pal+.skc-pal{margin-top:10px}
.skc-mine.ruled{margin-top:12px;padding-top:8px;border-top:1px solid var(--line2)}
.skc-minehead{display:flex;align-items:center;gap:6px;min-height:30px;margin-bottom:6px}
.skc-minehead b{flex:1;min-width:0;font-size:12.5px;font-weight:700}
.skc-palhead{display:flex;align-items:center;gap:6px;min-height:30px;margin-bottom:4px}
.skc-palname{flex:1;min-width:0;font-size:12.5px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.skc-palname small{margin-left:6px;font-size:11.5px;font-weight:400;color:var(--sub);font-variant-numeric:tabular-nums}
.skc-btn{flex:0 0 auto;min-height:30px;padding:0 9px;border:1px solid #9a9a9a;background:#fff;font-size:12.5px;white-space:nowrap}
.skc-btn:hover:not(:disabled){background:#ececec}
.skc-btn.on,.skc-btn.on:hover:not(:disabled){background:var(--ink);border-color:var(--ink);color:#fff}
.skc-btn.warn{border-color:var(--seal);color:var(--seal)}
.skc-empty{padding:5px 0;font-size:12px;color:var(--sub)}
@media (pointer:coarse){
  .skc-grid{grid-template-columns:repeat(auto-fill,minmax(36px,1fr))}
  .skc-sw{min-width:36px;height:36px}
  .skc-recent .skc-sw:nth-child(n+7){display:none}
  .skc-hsw .skc-sw{flex-basis:36px;width:36px}
  .skc-now,.skc .skc-prev{width:40px;height:40px}
  .skc-x{width:36px;height:36px}
  .skc-tab{height:38px}
  .skc-btn{min-height:36px}
  .skc-row{min-height:40px}
  .skc-hrow{min-height:42px}
  .skc-minehead,.skc-palhead{min-height:36px}
  .skc input[type=range].skc-range{height:36px}
  .skc input[type=range].skc-range::-webkit-slider-thumb{width:24px;height:24px;margin-top:-6px}
  .skc input[type=range].skc-range::-moz-range-thumb{width:24px;height:24px}
  .skc input[type=number].skc-numin,.skc input[type=text].skc-hexin,.skc input[type=text].skc-namein{height:36px}
}
`;

export function SketchColorStyle() {
  return <style>{SKETCH_COLOR_CSS}</style>;
}
