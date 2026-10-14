/* PhotoCraft로 다듬기 (6차시 「다듬기 기록」 s6a.pc)
   PhotoCraft(storytold/photocraft 웹판, MIT/Apache-2.0)를 같은 출처의 /photocraft/에 두고 전체 화면 창(iframe)으로 연다.
   - 불러오기: 학생이 4·5·6차시에 올린 이미지 가운데 하나를 골라 PhotoCraft 캔버스에 끌어다 놓은 것처럼 연다(src-pc-bridge.js).
   - 저장: 「기록지에 저장」이 PhotoCraft의 빠른 내보내기(PNG)를 부르고, 그 PNG를 사진 규정(photo)대로 줄여 「다듬기 후 화면」에 넣는다.
     「다듬기 전 화면」이 비어 있으면 고른 원본을 함께 넣는다. 학생이 메뉴에서 PNG·JPG로 내보내도 같은 길로 저장한다.
   - 옆 패널: 다듬기에서 고칠 것(6차시 3회차, 5차시 이중 점검표의 불성립 항목, 다듬기 기록 글)과 메뉴 찾기.
   - s6a.pc 값: { src: 고른 이미지 id, at, n: 저장 횟수, after: 마지막으로 저장한 ref }. ref 키를 쓰지 않아 미디어 정리 대상이 아니다.
   PhotoCraft 웹판은 화면 메뉴에 한글 글꼴을 쓰지 못해(글자 레이어에만 쓴다) 메뉴는 영어로 두고(src-pc-bridge.js) 메뉴 찾기 표를 붙인다. */
import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export const PC_URL = "/photocraft/index.html";
const SAVE_WAIT_MS = 20000;
const START_WAIT_MS = 90000;

const ROUND_KEYS = [["ra", 1], ["rb", 2], ["rc", 3]];
const HM = ["", "부분 수정", "화면 편집", "손으로 고치기", "그대로 두기"];
const NO = "불성립";

const hasRef = (x) => x && typeof x === "object" && typeof x.ref === "string" && x.ref;
const str = (v) => (typeof v === "string" ? v.trim() : "");

/** 학생 기록지에서 PhotoCraft로 불러올 수 있는 이미지 → [{ id, group, label, ref }] (화면 순서) */
export function pcSources(ws) {
  const d = ws || {};
  const out = [];
  const add = (group, label, ref, id) => { if (ref && !out.some((x) => x.ref === ref)) out.push({ id: id || ref, group, label, ref }); };
  const st = d["s6f.steps"] && typeof d["s6f.steps"] === "object" ? d["s6f.steps"] : {};
  ROUND_KEYS.forEach(([k, n]) => {
    const r = st[k] && typeof st[k] === "object" ? st[k] : null;
    const im = r && Array.isArray(r.im) ? r.im : [];
    im.forEach((x, i) => { if (hasRef(x)) add("6차시 생성", im.length > 1 ? `${n}회차 ${i + 1}` + (r.ci === i ? " (고른 것)" : "") : `${n}회차`, x.ref, `s6f.${k}.${i}`); });
  });
  const ed = d["s6f.edit"] && typeof d["s6f.edit"] === "object" ? d["s6f.edit"] : null;
  if (ed && ed.m && hasRef(ed.m.out)) add("6차시 다듬기", "이미지 다듬기 결과", ed.m.out.ref, "s6f.out");
  if (hasRef(d["s6a.afterImg"])) add("6차시 다듬기", "다듬기 후 화면", d["s6a.afterImg"].ref, "s6a.afterImg");
  if (hasRef(d["s6a.beforeImg"])) add("6차시 다듬기", "다듬기 전 화면", d["s6a.beforeImg"].ref, "s6a.beforeImg");
  (Array.isArray(d["s5b.rounds"]) ? d["s5b.rounds"] : []).forEach((r, i) => { if (r && typeof r.img === "string" && r.img) add("5차시 생성", `${i + 1}회차 결과`, r.img, `s5b.${i}`); });
  if (hasRef(d["s4c.sketchpad"])) add("4차시 에스키스", "디지털 에스키스", d["s4c.sketchpad"].ref, "s4c.pad");
  (Array.isArray(d["s4c.eskisImg"]) ? d["s4c.eskisImg"] : []).forEach((x, i) => { if (hasRef(x)) add("4차시 에스키스", `에스키스 사진 ${i + 1}`, x.ref, `s4c.e${i}`); });
  return out;
}

/** 처음 고를 이미지: 지난번에 고른 것 → 3·2·1회차에서 고른 이미지 → 첫 이미지 */
function defaultPick(list, v) {
  const prev = v && typeof v === "object" ? v.src : "";
  if (prev && list.some((x) => x.id === prev)) return prev;
  for (const k of ["rc", "rb", "ra"]) {
    const xs = list.filter((x) => x.id.startsWith(`s6f.${k}.`));
    const chosen = xs.find((x) => /고른 것/.test(x.label)) || xs[0];
    if (chosen) return chosen.id;
  }
  return list[0] ? list[0].id : "";
}

/** 다듬기에서 고칠 것 → [{ from, text }] */
export function pcPlan(ws, inspectItems) {
  const d = ws || {};
  const out = [];
  const st = d["s6f.steps"] && typeof d["s6f.steps"] === "object" ? d["s6f.steps"] : {};
  const rc = st.rc && typeof st.rc === "object" ? st.rc : {};
  if (str(rc.nx) || rc.hm) out.push({ from: "6차시 3회차", text: (rc.hm && HM[rc.hm] ? HM[rc.hm] + ": " : "") + str(rc.nx) });
  const insp = d["s5c.inspect"] && typeof d["s5c.inspect"] === "object" ? d["s5c.inspect"] : {};
  (inspectItems || []).forEach((it) => {
    const row = insp[it.k];
    if (!row || row.status !== NO) return;
    const fix = str(row.fix), note = str(row.note);
    out.push({ from: "이중 점검표", text: it.label + (fix ? ": " + fix : note ? ": " + note : "") });
  });
  [["s6a.partial", "부분 수정"], ["s6a.edit", "화면 편집"]].forEach(([k, l]) => { if (str(d[k])) out.push({ from: "다듬기 기록", text: l + ": " + str(d[k]) }); });
  return out;
}

/* 메뉴 찾기: 할 일 → PhotoCraft 메뉴(영어). 단축키는 Windows·크롬북 기준(Mac은 Ctrl 대신 ⌘) */
export const PC_MENU = [
  ["밝기·대비", "Image › Adjustments › Brightness/Contrast"],
  ["레벨", "Image › Adjustments › Levels (Ctrl+L)"],
  ["곡선", "Image › Adjustments › Curves (Ctrl+M)"],
  ["색조·채도", "Image › Adjustments › Hue/Saturation (Ctrl+U)"],
  ["색상 균형", "Image › Adjustments › Color Balance (Ctrl+B)"],
  ["원본을 두고 조정", "Layer › New Adjustment Layer"],
  ["자르기", "Crop 도구 (C)"],
  ["작은 흠 지우기", "Spot Healing Brush (J)"],
  ["다른 곳을 복제해 덮기", "Clone Stamp (S)"],
  ["부분 밝게·어둡게", "Dodge · Burn (O)"],
  ["흐리게·선명하게", "Filter › Blur, Filter › Sharpen"],
  ["범위 선택", "Marquee (M), Lasso (L), Quick Selection (W)"],
  ["글자 넣기", "Type (T)"],
  ["되돌리기·작업 내역", "Ctrl+Z, Window › History"],
];

const CSS = `
.pcf .pcf-grid{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 10px}
.pcf .pcf-grp{flex:1 1 100%;font-size:13px;color:var(--sub);margin-top:4px}
.pcf .pcf-pick{display:flex;flex-direction:column;align-items:center;gap:4px;padding:4px;border:2px solid var(--line);background:var(--card);cursor:pointer;font:inherit;font-size:12px;color:var(--ink)}
.pcf .pcf-pick[aria-pressed="true"]{border-color:var(--seal);background:var(--seal-bg)}
.pcf .pcf-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.pcw{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;background:#1e1e1e;color:#e6e6e6;font-family:var(--sans)}
.pcw-bar{display:flex;align-items:center;gap:8px;padding:6px 10px;background:#141414;border-bottom:1px solid #333;flex-wrap:wrap}
.pcw-bar .t{font-size:14px;flex:1 1 auto;min-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pcw-bar button{font:inherit;font-size:14px;padding:7px 14px;border:1px solid #555;background:#2b2b2b;color:#eee;cursor:pointer}
.pcw-bar button.pri{background:#3b6fd8;border-color:#3b6fd8;color:#fff}
.pcw-bar button:disabled{opacity:.5;cursor:default}
.pcw-msg{font-size:13px;color:#cfd8ff}
.pcw-msg.err{color:#ffb4a8}
.pcw-body{flex:1 1 auto;display:flex;min-height:0}
.pcw-body iframe{flex:1 1 auto;border:0;min-width:0;background:#262626}
.pcw-side{width:300px;flex:0 0 auto;overflow:auto;background:#181818;border-left:1px solid #333;padding:10px 12px;font-size:13px;line-height:1.55}
.pcw-side h3{font-size:13px;margin:10px 0 6px;color:#fff}
.pcw-side ul{margin:0;padding-left:18px}
.pcw-side li{margin-bottom:6px}
.pcw-side .from{color:#9aa4c4;font-size:12px}
.pcw-side table{border-collapse:collapse;width:100%}
.pcw-side td{border-top:1px solid #2c2c2c;padding:4px 2px;vertical-align:top}
.pcw-side td:first-child{color:#bbb;width:38%;padding-right:6px}
.pcw-wait{position:absolute;inset:auto 0 0 0;top:48px;display:flex;align-items:center;justify-content:center;pointer-events:none;color:#bbb;font-size:14px}
@media (max-width:820px){.pcw-side{position:absolute;right:0;top:48px;bottom:0;width:min(300px,86vw);z-index:2}}
`;

async function dataToBuf(data) {
  const r = await fetch(data);
  const b = await r.blob();
  return { buf: await b.arrayBuffer(), mime: b.type || "image/jpeg" };
}

/** 기록지 편집 칸 */
export function PcPad({ f, fieldKey, v, setField, ws, owner, store, MediaThumb, prepareImage, imgPresetOf, imgErrText, inspectItems }) {
  const list = pcSources(ws);
  const [pick, setPick] = useState(() => defaultPick(list, v));
  const [open, setOpen] = useState(false);
  const cur = list.find((x) => x.id === pick) || null;
  const val = v && typeof v === "object" ? v : null;
  const groups = [];
  list.forEach((x) => { if (!groups.includes(x.group)) groups.push(x.group); });
  return (
    <div className="field span2 pcf">
      <style>{CSS}</style>
      <label>{f.label}</label>
      {list.length ? (
        <div className="pcf-grid" role="group" aria-label="불러올 작품">
          {groups.map((g) => (
            <React.Fragment key={g}>
              <div className="pcf-grp">{g}</div>
              {list.filter((x) => x.group === g).map((x) => (
                <button type="button" key={x.id} className="pcf-pick" aria-pressed={x.id === pick} onClick={() => setPick(x.id)}>
                  <MediaThumb owner={owner} refId={x.ref} alt={x.label} size={90} />
                  <span>{x.label}</span>
                </button>
              ))}
            </React.Fragment>
          ))}
        </div>
      ) : <span className="hint">불러올 이미지가 없습니다. PhotoCraft에서 기기의 이미지 파일을 열 수 있습니다.</span>}
      <div className="pcf-row">
        <button type="button" className="btn" onClick={() => setOpen(true)}>{cur ? "PhotoCraft에서 열기" : "PhotoCraft 열기"}</button>
        {val && val.n ? <span className="hint">저장 {val.n}회 · 마지막 {fmtAt(val.at)}</span> : null}
      </div>
      {open ? (
        <PcWindow src={cur} owner={owner} store={store} ws={ws} v={val} fieldKey={fieldKey} setField={setField}
          prepareImage={prepareImage} imgPresetOf={imgPresetOf} imgErrText={imgErrText} inspectItems={inspectItems}
          onClose={() => setOpen(false)} />
      ) : null}
    </div>
  );
}

function fmtAt(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 전체 화면 PhotoCraft 창 */
function PcWindow({ src, owner, store, ws, v, fieldKey, setField, prepareImage, imgPresetOf, imgErrText, inspectItems, onClose }) {
  const frame = useRef(null);
  const st = useRef({ ready: false, opened: false, saving: null, savedSince: false, edited: false });
  const wsRef = useRef(ws);
  wsRef.current = ws;
  const [phase, setPhase] = useState("load");      // load | ready | fail
  const [msg, setMsg] = useState({ t: "PhotoCraft를 불러오는 중입니다. 처음 열 때는 시간이 걸립니다.", err: false });
  const [side, setSide] = useState(() => typeof window === "undefined" || window.innerWidth > 820);
  const [busy, setBusy] = useState(false);
  const plan = pcPlan(ws, inspectItems);

  const post = (m, tr) => { const w = frame.current && frame.current.contentWindow; if (w) w.postMessage({ pc: 1, ...m }, location.origin, tr || []); };

  /* 내보낸 이미지 → 「다듬기 후 화면」(필요하면 「다듬기 전 화면」도) */
  const saveExport = async (m) => {
    const s = st.current;
    if (s.saving && s.saving.timer) clearTimeout(s.saving.timer);
    s.saving = null;
    setBusy(true);
    setMsg({ t: "기록지에 저장하는 중입니다.", err: false });
    try {
      const w0 = wsRef.current || {};
      const old = hasRef(w0["s6a.afterImg"]) ? w0["s6a.afterImg"] : null;
      if (old && !(v && v.after === old.ref) && !s.savedSince && !window.confirm("「다듬기 후 화면」에 올린 이미지를 PhotoCraft에서 다듬은 이미지로 바꿀까요?")) {
        setMsg({ t: "저장하지 않았습니다.", err: false });
        return;
      }
      const file = new File([m.buf], m.name || "photocraft.png", { type: m.mime || "image/png" });
      const r = await prepareImage(file, imgPresetOf("s6a.afterImg"));
      const at = new Date().toISOString();
      const ref = "s6a.afterImg." + Date.now();
      if (!(await store.putT(owner, ref, r.data))) throw Object.assign(new Error("net"), { net: true });
      setField("s6a.afterImg", { ref, at, w: r.w, h: r.h }, { upload: true });
      if (old && old.ref !== ref) store.remove(owner, old.ref);   // 아무도 가리키지 않는 옛 사진 (실패해도 새 사진에는 지장 없음)
      // 다듬기 전 화면이 비어 있으면 고른 원본을 함께 저장한다
      if (!hasRef(w0["s6a.beforeImg"]) && src) {
        try {
          const data = await store.get(owner, src.ref);
          if (typeof data === "string" && /^data:image\//.test(data)) {
            const b = await dataToBuf(data);
            const r0 = await prepareImage(new File([b.buf], "before.jpg", { type: b.mime }), imgPresetOf("s6a.beforeImg"));
            const ref0 = "s6a.beforeImg." + Date.now();
            if (await store.putT(owner, ref0, r0.data)) setField("s6a.beforeImg", { ref: ref0, at, w: r0.w, h: r0.h }, { upload: true });
          }
        } catch (e) { /* 원본 사본은 덤: 실패해도 다듬은 이미지는 저장됨 */ }
      }
      setField(fieldKey, (p) => {
        const q = p && typeof p === "object" ? p : {};
        return { src: src ? src.id : "", at, n: Math.min(999, (q.n || 0) + 1), after: ref };
      }, { upload: true });
      s.savedSince = true;
      setMsg({ t: `저장했습니다 (${fmtAt(at)}). 「다듬기 후 화면」에서 확인할 수 있습니다.`, err: false });
    } catch (e) {
      setMsg({ t: e && e.net ? "저장에 실패했습니다. 인터넷 연결을 확인하고 다시 눌러 주세요." : imgErrText(e), err: true });
    } finally { setBusy(false); }
  };
  const saveRef = useRef(saveExport);
  saveRef.current = saveExport;

  useEffect(() => {
    const s = st.current;
    const onMsg = (e) => {
      const m = e.data;
      if (e.origin !== location.origin || !frame.current || e.source !== frame.current.contentWindow || !m || m.pc !== 1) return;
      if (m.type === "ready") {
        s.ready = true;
        setPhase("ready");
        if (!src) { setMsg({ t: "File › Open으로 기기의 이미지를 열 수 있습니다.", err: false }); return; }
        setMsg({ t: `「${src.label}」을 여는 중입니다.`, err: false });
        store.get(owner, src.ref).then(async (data) => {
          if (typeof data !== "string" || !/^data:image\//.test(data)) throw new Error("no data");
          const b = await dataToBuf(data);
          const ext = /png/.test(b.mime) ? "png" : "jpg";
          post({ type: "open", name: `${src.id.replace(/[^a-z0-9]+/gi, "-")}.${ext}`, mime: b.mime, buf: b.buf }, [b.buf]);
        }).catch(() => setMsg({ t: "이미지를 가져오지 못했습니다. 인터넷 연결을 확인하고 창을 다시 열어 주세요.", err: true }));
      } else if (m.type === "opened") {
        s.opened = true;
        setMsg({ t: `「${src ? src.label : "이미지"}」을 열었습니다.`, err: false });
      } else if (m.type === "fail") {
        if (m.where === "start") { setPhase("fail"); setMsg({ t: "이 기기에서는 PhotoCraft를 열 수 없습니다. WebGL2를 지원하는 최신 크롬·엣지·사파리에서 다시 열어 주세요.", err: true }); }
        else if (m.where === "open") setMsg({ t: "이미지를 열지 못했습니다. 창을 닫고 다시 열어 주세요.", err: true });
        else if (m.where === "export") setMsg({ t: "내보내기를 받지 못했습니다. 다시 눌러 주세요.", err: true });
      } else if (m.type === "export") {
        saveRef.current(m);
      } else if (m.type === "download") {
        setMsg({ t: `작업 파일 「${m.name}」을 기기에 내려받았습니다. 기록지에는 PNG·JPG만 저장됩니다.`, err: false });
      }
    };
    window.addEventListener("message", onMsg);
    const t = setTimeout(() => { if (!s.ready) setMsg({ t: "PhotoCraft가 열리지 않습니다. 인터넷 연결을 확인하고 창을 닫았다가 다시 열어 주세요.", err: true }); }, START_WAIT_MS);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("message", onMsg); clearTimeout(t); if (s.saving && s.saving.timer) clearTimeout(s.saving.timer); document.body.style.overflow = prevOverflow; };
  }, []);

  const save = () => {
    const s = st.current;
    if (!s.ready || busy) return;
    setMsg({ t: "PhotoCraft에서 이미지를 내보내는 중입니다.", err: false });
    s.saving = { timer: setTimeout(() => { s.saving = null; setMsg({ t: "내보낸 이미지가 오지 않았습니다. 열린 이미지가 있는지 확인하고, File › Export › Quick Export as PNG를 눌러도 됩니다.", err: true }); }, SAVE_WAIT_MS) };
    post({ type: "save" });
  };
  const close = () => {
    if (st.current.opened && !st.current.savedSince && !window.confirm("기록지에 저장하지 않고 닫을까요? PhotoCraft에서 작업한 내용은 사라집니다.")) return;
    onClose();
  };

  return createPortal(
    <div className="pcw" data-guard="off" role="dialog" aria-modal="true" aria-label="PhotoCraft로 다듬기">
      <style>{CSS}</style>
      <div className="pcw-bar">
        <span className="t">PhotoCraft{src ? " · " + src.label : ""}</span>
        <span className={"pcw-msg" + (msg.err ? " err" : "")} role="status" aria-live="polite">{msg.t}</span>
        <button type="button" className="pri" disabled={phase !== "ready" || busy} onClick={save}>기록지에 저장</button>
        <button type="button" aria-pressed={side} onClick={() => setSide(!side)}>안내</button>
        <button type="button" onClick={close}>닫기</button>
      </div>
      <div className="pcw-body">
        <iframe ref={frame} src={PC_URL} title="PhotoCraft 편집기" allow="clipboard-read; clipboard-write" />
        {side ? (
          <aside className="pcw-side" aria-label="안내">
            <h3>다듬기에서 고칠 것</h3>
            {plan.length ? (
              <ul>{plan.map((p, i) => <li key={i}><span className="from">{p.from}</span><br />{p.text}</li>)}</ul>
            ) : <p>6차시 포트폴리오 3회차의 「다음에 고칠 한 가지」를 쓰면 여기에 보입니다.</p>}
            <h3>메뉴 찾기</h3>
            <table><tbody>{PC_MENU.map(([a, b]) => <tr key={a}><td>{a}</td><td>{b}</td></tr>)}</tbody></table>
            <h3>저장</h3>
            <p>「기록지에 저장」은 지금 화면을 한 장의 이미지로 저장합니다. 레이어까지 보관하려면 File › Save As로 작업 파일을 기기에 내려받습니다.</p>
          </aside>
        ) : null}
      </div>
      {phase === "load" ? <div className="pcw-wait" aria-hidden="true" /> : null}
    </div>,
    document.body
  );
}

/** 읽기 화면(교사·미리 보기): 저장 횟수와 시각만 보인다. 이미지는 「다듬기 전·후 화면」 칸에 있다 */
export function PcRead({ f, v }) {
  const val = v && typeof v === "object" ? v : null;
  if (!val || !val.n) return null;
  return (
    <div className="read-block">
      <div className="rl">{f.label}</div>
      <div className="rv">PhotoCraft에서 저장 {val.n}회 · 마지막 {fmtAt(val.at)}</div>
    </div>
  );
}
