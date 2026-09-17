import React, { useState, useEffect } from "react";
import { fbStore } from "./src-fb.js";

/* ============================================================
   탐구 질문의 근거 자료 — 질문 바로 위에 “오늘 본 것”을 놓는다
   ------------------------------------------------------------
   탐구 질문은 “오늘 본 작품 두 점 고르기”, “오늘 생성한 화면 다시 보기”처럼
   앞에서 본 것을 근거로 삼는다. 그런데 강의 노트의 도판은 접힌 읽기 자료
   안에 있고 생성 회차 기록은 다른 카드에 있어서, 질문 앞에서는 아무것도
   보이지 않았다. 학생들이 “무슨 작품을 말하는 거냐”고 묻던 이유다.

   여기서는 세 가지를 질문 위에 끌어온다.
   ① 그 차시 강의 노트에 실린 도판 — 눌러서 크게 보고 출처로 갈 수 있다
   ② 5차시에는 학생 자신이 올린 생성 회차 화면 — 고른 것과 버린 것
   ③ 7·8차시에는 전시장으로 가는 길 — 학급 작품이 그 차시의 자료다
   자료는 LESSONS(교사가 고친 내용이 얹힌 것)에서 그때그때 읽어 오므로
   수업 편집 탭에서 도판을 바꾸면 이 자료도 함께 바뀐다.
   ============================================================ */

/* 교사가 올린 도판은 src가 "m:<ref>" 형태다 — src-content.jsx의 저장 규칙과 같다 */
const TEACHER_MEDIA = "media:teacher_";

function useFigureUrl(src) {
  const ref = typeof src === "string" && src.slice(0, 2) === "m:" ? src.slice(2) : null;
  const [data, setData] = useState(null);
  useEffect(() => {
    let live = true;
    if (!ref) { setData(null); return; }
    fbStore.get(TEACHER_MEDIA + ref).then((v) => { if (live) setData(v || null); });
    return () => { live = false; };
  }, [ref]);
  return ref ? data : src;
}

function AidImg({ img, alt }) {
  const url = useFigureUrl(img.src);
  if (!url) return <span className="iaid-load">그림 불러오는 중…</span>;
  return <img src={url} alt={alt} loading="lazy" />;
}

/* 캡션 첫 마디만 남겨 조각 이름표를 만든다 */
function shortLabel(cap) {
  let s = String(cap || "").replace(/\s+/g, " ").trim();
  if (!s) return "수업 자료";
  let cut = s.length;
  for (const m of [". ", " — "]) { const i = s.indexOf(m); if (i > 4 && i < cut) cut = i; }
  s = s.slice(0, cut);
  return s.length > 32 ? s.slice(0, 31) + "…" : s;
}

/* 도판 캡션의 「작품명」으로 그 차시 작품표의 행을 찾아 작가·연도를 붙인다.
   같은 작품의 사진이 여러 장이면(설치 전경과 부분, 기록 사진 둘) 한 작품으로 묶어
   조각 하나만 보이고, 크게 보기에서 사진을 모두 보여 준다. 묶는 열쇠는 캡션의
   첫 「작품명」이고, 작품명이 없는 자료(도표·현장 사진)는 파일 하나가 한 자료다. */
function workKey(im) {
  const q = ((String(im.cap || "").match(/「([^」]+)」/) || [])[1] || "").replace(/\s*[(（][^)）]*[)）]\s*/g, "").trim();
  return q ? "w:" + q : "s:" + im.src;
}

function buildItems(L) {
  if (!L || !Array.isArray(L.readings)) return [];
  const imgs = [], works = [];
  for (const rd of L.readings) {
    for (const im of (rd.images || [])) if (im && im.src) imgs.push(im);
    for (const w of (rd.works || [])) if (w) works.push(w);
  }
  const seenSrc = new Set(), byKey = {}, out = [];
  for (const im of imgs) {
    if (seenSrc.has(im.src)) continue;
    seenSrc.add(im.src);
    const key = workKey(im);
    if (byKey[key]) { byKey[key].imgs.push(im); continue; }
    const q = key.slice(0, 2) === "w:" ? key.slice(2) : "";
    const w = q ? works.find((x) => String(x.w).includes(q)) : null;
    let name = q ? "「" + q + "」" : shortLabel(im.cap);
    if (name.length > 24) name = name.slice(0, 23) + "…";
    const it = { key, imgs: [im], name, sub: w ? w.a + " · " + w.y : "" };
    byKey[key] = it;
    out.push(it);
  }
  return out;
}

/* ---------- ① 그 차시에 본 도판 ---------- */
function LessonStrip({ L }) {
  const items = buildItems(L);
  const [sel, setSel] = useState(-1);
  if (!items.length) return null;
  const cur = sel >= 0 ? items[sel] : null;
  return (
    <div className="iaid-block">
      <div className="iaid-t">
        <span className="iaid-acc">SOURCE</span>
        {L.n}차시에 본 작품·자료 {items.length}점
        <span className="iaid-sub"> (눌러서 크게 보고, 이 가운데 실제로 근거가 된 것을 답에 짚어 씁니다{items.length > 5 ? ". 옆으로 밀면 더 있습니다" : ""})</span>
      </div>
      <div className="iaid-row">
        {items.map((it, i) => (
          <button type="button" key={it.key} className={"iaid-tile " + (sel === i ? "on" : "")}
            aria-pressed={sel === i} onClick={() => setSel(sel === i ? -1 : i)}>
            <div className="iaid-th"><AidImg img={it.imgs[0]} alt={it.name} /></div>
            <div className="iaid-nm">{it.name}{it.imgs.length > 1 ? " · 사진 " + it.imgs.length + "장" : ""}</div>
            {it.sub && <div className="iaid-sb">{it.sub}</div>}
          </button>
        ))}
      </div>
      {cur && cur.imgs.map((im, j) => (
        <div className="iaid-detail" key={im.src}>
          <div className="iaid-big"><AidImg img={im} alt={cur.name + (cur.imgs.length > 1 ? " " + (j + 1) : "")} /></div>
          <div className="iaid-cap">
            {im.cap}
            {im.credit && <span className="iaid-cr">{im.credit}</span>}
            {im.link && <a href={im.link} target="_blank" rel="noopener noreferrer">원본 보기 ↗</a>}
            {im.srcPage && <a href={im.srcPage} target="_blank" rel="noopener noreferrer">파일 출처 ↗</a>}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- ② 5차시 — 내가 올린 생성 회차 화면 ---------- */
function RoundStrip({ ws, Thumb, owner }) {
  const rows = (ws && ws["s5b.rounds"]) || [];
  const shots = rows.map((r, i) => ({ ...(r || {}), i })).filter((r) => r.img);
  const selDigit = String((ws && ws["s5d.selNo"]) || "").replace(/[^0-9]/g, "");
  if (!shots.length) {
    return (
      <div className="iaid-block">
        <div className="iaid-t">
          <span className="iaid-acc">MY WORK</span>
          내가 생성한 화면
          <span className="iaid-sub"> (「생성 회차 기록」 카드에 결과 화면을 올리면 여기에 나란히 놓입니다)</span>
        </div>
        <div className="iaid-empty">아직 올린 화면이 없습니다. 위의 「생성 회차 기록」에서 회차마다 결과 화면을 올린 뒤 이 질문에 답하면, 고른 한 점과 버린 넉 점을 여기에서 나란히 보며 쓸 수 있습니다.</div>
      </div>
    );
  }
  return (
    <div className="iaid-block">
      <div className="iaid-t">
        <span className="iaid-acc">MY WORK</span>
        내가 생성한 화면 {shots.length}점
        <span className="iaid-sub"> (고른 한 점과 버린 것을 나란히 놓고 답을 씁니다)</span>
      </div>
      <div className="iaid-row">
        {shots.map((r) => {
          const picked = selDigit && String(r.i + 1) === selDigit;
          return (
            <div key={r.i} className={"iaid-tile mine " + (picked ? "picked" : "")}>
              <div className="iaid-th"><Thumb owner={owner} refId={r.img} alt={r.i + 1 + "회차 결과 화면"} size={110} /></div>
              <div className="iaid-nm">{r.i + 1}회차{r.no ? " · " + r.no : ""}{picked ? " · 고른 것" : ""}</div>
              {r.judge && <div className="iaid-sb">{r.judge}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* 6·7·8차시 — 내가 올린 화면 한두 장 (다듬기 전후, 출품 이미지) */
function imgRef(v) { return v && typeof v === "object" ? v.ref || "" : ""; }

function MyShots({ ws, Thumb, owner, n }) {
  const d = ws || {};
  const list = n === 6
    ? [
        { ref: imgRef(d["s6a.beforeImg"]), label: "다듬기 전 화면" },
        { ref: imgRef(d["s6a.afterImg"]), label: "다듬기 후 화면" },
      ]
    : [{ ref: imgRef(d["s7x.img"]), label: "내 출품작" + (d["s7x.no"] ? " · " + d["s7x.no"] : "") }];
  const shots = list.filter((x) => x.ref);
  if (!shots.length) return null;
  return (
    <div className="iaid-block">
      <div className="iaid-t">
        <span className="iaid-acc">MY WORK</span>
        내 화면
        <span className="iaid-sub"> ({n === 6 ? "고칠 곳과 그대로 둘 곳을 여기서 보며 씁니다" : "내 작품을 놓고 다른 작품과 견주어 씁니다"})</span>
      </div>
      <div className="iaid-row">
        {shots.map((x) => (
          <div key={x.ref} className="iaid-tile mine">
            <div className="iaid-th"><Thumb owner={owner} refId={x.ref} alt={x.label} size={110} /></div>
            <div className="iaid-nm">{x.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- ③ 7·8차시 — 학급 전시장 ---------- */
function GalleryLink({ n, onGallery }) {
  if (!onGallery) return null;
  return (
    <div className="iaid-block">
      <div className="iaid-t">
        <span className="iaid-acc">EXHIBITION</span>
        이 질문의 자료는 학급 전시장입니다
        <span className="iaid-sub"> ({n === 7 ? "내 작품 옆에 놓을 한 점을 전시장에서 고릅니다" : "관람에서 본 작품 두 점을 전시장에서 다시 확인합니다"})</span>
      </div>
      <button type="button" className="iaid-go" onClick={onGallery}>전시장 열기 →</button>
      <div className="iaid-empty" style={{ marginTop: 6 }}>전시장을 보고 돌아오면 쓰던 답은 그대로 남아 있습니다.</div>
    </div>
  );
}

export function InquirySource({ sec, ws, lessons, Thumb, owner, onGallery }) {
  const n = Number(sec && sec.code);
  if (!n) return null;
  const L = Array.isArray(lessons) ? lessons.find((x) => x.n === n) : null;
  const strip = L ? <LessonStrip L={L} /> : null;
  const mine = !Thumb ? null
    : n === 5 ? <RoundStrip ws={ws} Thumb={Thumb} owner={owner} />
    : (n >= 6 ? <MyShots ws={ws} Thumb={Thumb} owner={owner} n={n} /> : null);
  const gal = (n === 7 || n === 8) ? <GalleryLink n={n} onGallery={onGallery} /> : null;
  if (!strip && !mine && !gal) return null;
  return (
    <div className="iaid">
      <style>{`
.iaid{border:1px solid var(--line);border-left:3px solid var(--patina);background:var(--card2);padding:10px 12px;margin:0 0 14px}
.iaid-block + .iaid-block{margin-top:12px;border-top:1px dashed var(--line);padding-top:10px}
.iaid-t{font-size:12px;color:var(--ink);margin-bottom:7px;line-height:1.6}
.iaid-acc{font-family:var(--mono);font-size:10px;letter-spacing:.16em;color:var(--patina);border:1px solid var(--patina);padding:1px 5px;margin-right:7px}
.iaid-sub{color:var(--sub)}
.iaid-row{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;scrollbar-width:thin}
.iaid-tile{flex:0 0 132px;background:var(--card);border:1px solid var(--line2);padding:0 0 6px;text-align:left;cursor:pointer;font-family:var(--sans);color:var(--ink)}
.iaid-tile.mine{cursor:default}
.iaid-tile.on{border-color:var(--patina);box-shadow:inset 0 0 0 1px var(--patina)}
.iaid-tile.picked{border-color:var(--seal);box-shadow:inset 0 0 0 1px var(--seal)}
/* font-size:0 — 도판을 못 불러왔을 때 alt 글자가 조각을 밀어내지 않게 한다 */
.iaid-th{height:88px;background:var(--line2);display:flex;align-items:center;justify-content:center;overflow:hidden;font-size:0}
.iaid-th img{width:100%;height:100%;object-fit:cover;display:block;max-height:none}
.iaid-nm{font-size:11.5px;line-height:1.45;padding:5px 7px 0;word-break:keep-all}
.iaid-tile.picked .iaid-nm{color:var(--seal);font-weight:700}
.iaid-sb{font-family:var(--mono);font-size:10px;color:var(--sub);padding:2px 7px 0;line-height:1.4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.iaid-detail{margin-top:9px;background:var(--card);border:1px solid var(--line2);padding:9px}
/* 크게 보기가 화면을 다 먹으면 정작 답 쓰는 칸이 멀어진다 — 높이를 묶어 둔다 */
.iaid-big{display:flex;justify-content:center;background:var(--line2)}
.iaid-big img{max-width:100%;max-height:46vh;width:auto;height:auto;display:block}
.iaid-cap{font-size:11.5px;color:var(--sub);line-height:1.65;padding-top:6px}
.iaid-cr{display:block;font-family:var(--mono);font-size:10.5px;padding-top:3px}
.iaid-cap a{display:inline-block;margin-top:4px;margin-right:10px;color:var(--seal)}
.iaid-load{font-size:11px;color:var(--sub)}
.iaid-empty{font-size:11.5px;color:var(--sub);line-height:1.65}
.iaid-go{border:1px solid var(--patina);background:var(--patina-bg);color:var(--patina);font-family:var(--sans);font-size:12.5px;padding:6px 12px;cursor:pointer}
@media(max-width:640px){.iaid-tile{flex:0 0 116px}.iaid-th{height:76px}}
      `}</style>
      {strip}
      {mine}
      {gal}
    </div>
  );
}
