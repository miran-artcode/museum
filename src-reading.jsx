/* ============================================================
   강의 노트 읽기 자료 조판 — 글·작품 도판·도식을 한 흐름으로 짠다

   읽기 자료(readings[i])는 예전 모양 { stage, h, p[], asks[], images[], works[] }를
   그대로 쓰고, 아래 선택 필드가 있으면 본문 사이사이에 끼워 넣는다.
   필드가 없으면 예전처럼 본문 → 그림 → 질문 → 작품 순서로 그린다.

   p[] 문단 표시 (교사 「수업 편집」의 본문 칸에서도 그대로 쓸 수 있다)
     "## 소제목"                  → 읽기 자료 안의 작은 제목
     "> 인용문\n> 출처: …"         → 인용 상자 (마지막 줄이 「출처:」·「원문:」이면 출처 줄)
     "- 항목\n- 항목"              → 점 목록 (앞에 목록이 아닌 줄이 있으면 목록 머리글)
     "1. 항목\n2. 항목"            → 번호 목록
     "! 문장"                      → 핵심 상자
     글 안: **강조**, [글자](https://주소)

   images[k].at   = j  → p[j] 다음에 놓는다(-1이면 맨 위, 없으면 본문 끝)
   images[k].size = "full" | "side" | "half" | "thumb"
                    같은 at의 그림은 한 줄로 묶인다. side는 넓은 화면에서 다음 문단 옆에 뜬다.
   viz[]          = { at, type, title, ... } 도식 (종류는 VIZ 표 참고)
   works[j].links[m].k = "원문" 이면 원문 링크로 따로 표시한다.
   ============================================================ */

import React, { useState, useEffect, useRef } from "react";
import { fbStore } from "./src-fb.js";
import { AccessReadingBar, AccessPara, figAlt, FigureDesc } from "./src-access.jsx";

const isArr = Array.isArray;
const arr = (x) => (isArr(x) ? x : []);
const TEACHER = "teacher";

/* ---------- 글 안의 표시 ---------- */

const INLINE_RE = /\*\*(.+?)\*\*|\[([^\]\n]+)\]\((https?:\/\/(?:[^\s()]|\([^\s()]*\))+)\)/g;

export function inline(s, pre = "") {
  const str = String(s == null ? "" : s);
  const out = [];
  const re = new RegExp(INLINE_RE.source, "g");
  let last = 0, m, k = 0;
  while ((m = re.exec(str))) {
    if (m.index > last) out.push(str.slice(last, m.index));
    if (m[1] != null) out.push(<strong key={pre + k++} className="rd-em">{inline(m[1], pre + k + ".")}</strong>);
    else out.push(<a key={pre + k++} className="rd-a" href={m[3]} target="_blank" rel="noopener noreferrer">{m[2]}</a>);
    last = re.lastIndex;
  }
  if (last < str.length) out.push(str.slice(last));
  return out;
}

/* 표시를 걷어 낸 글 (그림 대체 글·요약용) */
export function plain(s) {
  return String(s == null ? "" : s)
    .replace(new RegExp(INLINE_RE.source, "g"), (all, b, t) => (b != null ? b : t))
    .replace(/^(##\s+|>\s?|!\s+|[-•]\s+|\d+[.)]\s+)/gm, "");
}

const LIST_UL = /^[-•]\s+/;
const LIST_OL = /^\d+[.)]\s+/;

function parseBlock(raw) {
  const t = String(raw == null ? "" : raw).trim();
  if (!t) return null;
  if (/^##\s+/.test(t)) return { k: "h", text: t.replace(/^##\s+/, "") };
  const lines = t.split("\n").map((x) => x.trim()).filter(Boolean);
  if (lines.every((l) => l.startsWith(">"))) {
    const ls = lines.map((l) => l.replace(/^>\s?/, ""));
    const cite = ls.length > 1 && /^(출처|원문)\s*[:：]/.test(ls[ls.length - 1]) ? ls.pop() : null;
    return { k: "q", lines: ls, cite };
  }
  if (/^!\s+/.test(t)) return { k: "key", text: t.replace(/^!\s+/, "") };
  // 목록: 앞쪽 몇 줄은 머리글이어도 되고, 목록이 시작되면 끝까지 목록이어야 한다
  const first = lines.findIndex((l) => LIST_UL.test(l) || LIST_OL.test(l));
  if (first >= 0) {
    const rest = lines.slice(first);
    const ol = rest.every((l) => LIST_OL.test(l));
    const ul = rest.every((l) => LIST_UL.test(l));
    if (ol || ul) {
      return {
        k: ol ? "ol" : "ul",
        lead: lines.slice(0, first).join(" "),
        items: rest.map((l) => l.replace(ol ? LIST_OL : LIST_UL, "")),
      };
    }
  }
  return { k: "p", text: lines.join(" ") };
}

function Block({ b, lead }) {
  if (b.k === "h") return <h4 className="rd-h">{inline(b.text)}</h4>;
  if (b.k === "q") {
    return (
      <blockquote className="rd-q">
        {b.lines.map((l, i) => <p key={i}>{inline(l)}</p>)}
        {b.cite && <cite>{inline(b.cite)}</cite>}
      </blockquote>
    );
  }
  if (b.k === "key") {
    return (
      <div className="rd-key">
        <span className="rd-key-t">핵심</span>
        <p>{inline(b.text)}</p>
      </div>
    );
  }
  if (b.k === "ol" || b.k === "ul") {
    const L = b.k === "ol" ? "ol" : "ul";
    return (
      <div className="rd-lw">
        {b.lead && <p className="rd-p">{inline(b.lead)}</p>}
        <L className={"rd-list " + b.k}>{b.items.map((x, i) => <li key={i}>{inline(x)}</li>)}</L>
      </div>
    );
  }
  return <p className={"rd-p" + (lead ? " lead" : "")}>{inline(b.text)}</p>;
}

/* ---------- 도판 ---------- */

/* 주소로 넣은 그림과 교사가 올린 그림(m: 시작) 둘 다 처리한다 */
function useImgUrl(src) {
  const ref = typeof src === "string" && src.slice(0, 2) === "m:" ? src.slice(2) : null;
  const [data, setData] = useState(null);
  useEffect(() => {
    let live = true;
    if (!ref) { setData(null); return; }
    fbStore.get("media:" + TEACHER + "_" + ref).then((v) => { if (live) setData(v || null); });
    return () => { live = false; };
  }, [ref]);
  return ref ? data : src;
}

/* 캡션의 첫 문장(작가, 「작품」(연도))을 제목으로, 나머지를 설명으로 나눈다 */
export function capParts(cap) {
  const s = String(cap || "").trim();
  if (!s) return { title: "", desc: "" };
  const i = s.indexOf(". ");
  if (i > 4 && i <= 120) return { title: s.slice(0, i), desc: s.slice(i + 2).trim() };
  if (s.length <= 120) return { title: s.replace(/\.$/, ""), desc: "" };
  return { title: "", desc: s };
}

function FigMeta({ img }) {
  if (!img.credit && !img.link && !img.srcPage) return null;
  return (
    <span className="rd-fig-m">
      {img.credit && <span className="rd-fig-cr">{img.credit}</span>}
      {img.link && <a href={img.link} target="_blank" rel="noopener noreferrer">원본 보기 ↗</a>}
      {img.srcPage && <a href={img.srcPage} target="_blank" rel="noopener noreferrer">파일 출처 ↗</a>}
    </span>
  );
}

function Fig({ img, compact, clamp, onOpen }) {
  const url = useImgUrl(img.src);
  const { title, desc } = capParts(img.cap);
  return (
    <figure className="rd-fig">
      <button type="button" className="rd-fig-btn" onClick={() => onOpen(img)}
        aria-label={(title || "그림") + " 크게 보기"}>
        {url
          ? <img src={url} alt={figAlt(img, title || plain(img.cap))} loading="lazy" decoding="async" />
          : <span className="lz-load">그림 불러오는 중…</span>}
        <span className="rd-zoom" aria-hidden="true">크게 보기</span>
      </button>
      {(title || desc || img.credit) && (
        <figcaption>
          {title && <b className="rd-fig-t">{title}</b>}
          {desc && !compact && <span className={"rd-fig-d" + (clamp ? " clamp" : "")}>{desc}</span>}
          <FigMeta img={img} />
        </figcaption>
      )}
      <FigureDesc src={img.src} />
    </figure>
  );
}

const SIZES = ["full", "side", "half", "thumb"];
const SIDE_ROOM = 480; // side 그림 곁에 필요한 글자 수(다음 그림·도식·소제목·인용·핵심 상자 전까지)

function FigGroup({ imgs, onOpen, room }) {
  const n = imgs.length;
  let size = SIZES.includes(imgs[0].size) ? imgs[0].size : "full";
  // 옆에 띄운 그림 곁에 글이 모자라면 빈자리가 크게 생기므로 가운데 놓는다
  if (size === "side" && room < SIDE_ROOM) size = "half";
  let cls;
  if (n === 1) cls = size === "side" ? "side" : size === "half" ? "c1 half" : size === "thumb" ? "c1 small" : "c1";
  else if (n === 2 && size !== "thumb") cls = "c2";
  else if (n === 3 && size !== "thumb") cls = "c3";
  else cls = "c4";
  const compact = cls === "c4" || cls === "c3";
  const clamp = cls === "side";
  return (
    <div className={"rd-figs " + cls}>
      {imgs.map((img, i) => <Fig key={img.src + i} img={img} compact={compact} clamp={clamp} onOpen={onOpen} />)}
    </div>
  );
}

/* 크게 보기 — Esc로 닫고, 좌우 화살표로 같은 읽기 자료의 그림을 넘긴다 */
function Lightbox({ list, idx, onIdx, onClose }) {
  const img = list[idx];
  const url = useImgUrl(img && img.src);
  const closeRef = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    if (closeRef.current) closeRef.current.focus();
    const h = (e) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" && list.length > 1) onIdx((idx + 1) % list.length);
      else if (e.key === "ArrowLeft" && list.length > 1) onIdx((idx - 1 + list.length) % list.length);
    };
    window.addEventListener("keydown", h);
    return () => { window.removeEventListener("keydown", h); if (prev && prev.focus) prev.focus(); };
  }, [idx, list.length]);
  if (!img) return null;
  const { title, desc } = capParts(img.cap);
  return (
    <div className="rd-box" role="dialog" aria-modal="true" aria-label={title || "그림 크게 보기"} onClick={onClose}>
      <div className="rd-box-in" onClick={(e) => e.stopPropagation()}>
        <div className="rd-box-bar">
          {list.length > 1 && <span className="rd-box-n">{idx + 1} / {list.length}</span>}
          {list.length > 1 && <button type="button" onClick={() => onIdx((idx - 1 + list.length) % list.length)} aria-label="이전 그림">←</button>}
          {list.length > 1 && <button type="button" onClick={() => onIdx((idx + 1) % list.length)} aria-label="다음 그림">→</button>}
          <button type="button" ref={closeRef} onClick={onClose}>닫기 ✕</button>
        </div>
        {url ? <img src={url} alt={title || plain(img.cap)} /> : <span className="lz-load">그림 불러오는 중…</span>}
        <div className="rd-box-cap">
          {title && <b>{title}</b>}
          {desc && <p>{desc}</p>}
          <FigMeta img={img} />
        </div>
      </div>
    </div>
  );
}

/* ---------- 도식 ---------- */

function Thumb({ src, alt }) {
  const url = useImgUrl(src);
  if (!url) return null;
  return <img className="vz-img" src={url} alt={alt || ""} loading="lazy" />;
}

function VzTimeline({ v }) {
  return (
    <ol className={"vz-tl" + (v.h ? " h" : "")}>
      {arr(v.items).map((it, i) => (
        <li key={i}>
          <span className="vz-tl-y">{it.y}</span>
          <div className="vz-tl-b">
            {it.img && <Thumb src={it.img} alt={plain(it.t)} />}
            <b>{inline(it.t)}</b>
            {it.d && <p>{inline(it.d)}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}

function VzFlow({ v }) {
  return (
    <ol className={"vz-flow" + (v.loop ? " loop" : "")}>
      {arr(v.steps).map((s, i) => (
        <li key={i}>
          <span className="vz-flow-n">{String(i + 1).padStart(2, "0")}</span>
          <b>{inline(s.t)}</b>
          {s.d && <p>{inline(s.d)}</p>}
        </li>
      ))}
      {v.loop && <li className="vz-flow-back" aria-hidden="true">↺ 처음으로</li>}
    </ol>
  );
}

function VzCompare({ v }) {
  const cols = arr(v.cols);
  if (isArr(v.rows) && v.rows.length) {
    return (
      <div className="vz-scroll">
        <table className="vz-cmp-t">
          <thead><tr><th />{cols.map((c, i) => <th key={i}>{c.img && <Thumb src={c.img} alt={plain(c.h)} />}{inline(c.h)}{c.sub && <small>{inline(c.sub)}</small>}</th>)}</tr></thead>
          <tbody>
            {v.rows.map((r, j) => (
              <tr key={j}><th scope="row">{inline(r)}</th>{cols.map((c, i) => <td key={i}>{inline(arr(c.points)[j] || "")}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return (
    <div className={"vz-cmp n" + cols.length}>
      {cols.map((c, i) => (
        <div className="vz-cmp-c" key={i}>
          {c.img && <Thumb src={c.img} alt={plain(c.h)} />}
          <b className="vz-cmp-h">{inline(c.h)}</b>
          {c.sub && <span className="vz-cmp-s">{inline(c.sub)}</span>}
          <ul>{arr(c.points).map((p, j) => <li key={j}>{inline(p)}</li>)}</ul>
        </div>
      ))}
    </div>
  );
}

function VzCards({ v }) {
  return (
    <div className="vz-cards">
      {arr(v.items).map((it, i) => (
        <div className="vz-card" key={i}>
          {it.img && <Thumb src={it.img} alt={plain(it.t)} />}
          {it.k && <span className="vz-card-k">{it.k}</span>}
          <b>{inline(it.t)}</b>
          {it.d && <p>{inline(it.d)}</p>}
        </div>
      ))}
    </div>
  );
}

function VzStats({ v }) {
  return (
    <div className="vz-stats">
      {arr(v.items).map((it, i) => (
        <div className="vz-stat" key={i}>
          <span className="vz-stat-n">{it.n}</span>
          <span className="vz-stat-t">{inline(it.t)}</span>
        </div>
      ))}
    </div>
  );
}

function VzTerms({ v }) {
  return (
    <dl className="vz-terms">
      {arr(v.items).map((it, i) => (
        <div key={i}>
          <dt>{inline(it.t)}{it.en && <small>{it.en}</small>}</dt>
          <dd>{inline(it.d)}</dd>
        </div>
      ))}
    </dl>
  );
}

function host(u) { try { return new URL(u).hostname.replace(/^www\./, ""); } catch (e) { return ""; } }

function VzSources({ v }) {
  return (
    <ul className="vz-src">
      {arr(v.items).filter((it) => it && it.u).map((it, i) => (
        <li key={i}>
          <a href={it.u} target="_blank" rel="noopener noreferrer">
            <span className="vz-src-t">{it.t}</span>
            <span className="vz-src-u">{host(it.u)} ↗</span>
          </a>
          {it.note && <p>{inline(it.note)}</p>}
        </li>
      ))}
    </ul>
  );
}

function VzSpectrum({ v }) {
  return (
    <div className="vz-sp">
      <div className="vz-sp-poles"><span>{inline(v.left)}</span><span>{inline(v.right)}</span></div>
      <ul>
        {arr(v.items).map((it, i) => {
          const pos = Math.max(0, Math.min(100, Number(it.pos) || 0));
          return (
            <li key={i}>
              <div className="vz-sp-l"><b>{inline(it.t)}</b>{it.d && <span>{inline(it.d)}</span>}</div>
              <div className="vz-sp-track" role="img" aria-label={plain(v.left) + " 쪽에서 " + pos + "%"}>
                <i style={{ left: pos + "%" }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function VzTable({ v }) {
  return (
    <div className="vz-scroll">
      <table className="vz-tbl">
        {isArr(v.heads) && <thead><tr>{v.heads.map((h, i) => <th key={i}>{inline(h)}</th>)}</tr></thead>}
        <tbody>
          {arr(v.rows).map((r, j) => <tr key={j}>{arr(r).map((c, i) => (i === 0 ? <th key={i} scope="row">{inline(c)}</th> : <td key={i}>{inline(c)}</td>))}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

function VzQuote({ v }) {
  return (
    <figure className="vz-quote">
      <blockquote>{String(v.q || "").split("\n").map((l, i) => <p key={i}>{inline(l)}</p>)}</blockquote>
      {(v.by || v.u) && (
        <figcaption>
          {v.by && <span>{inline(v.by)}</span>}
          {v.u && <a href={v.u} target="_blank" rel="noopener noreferrer">원문 보기 ↗</a>}
        </figcaption>
      )}
    </figure>
  );
}

/* 도식 종류: 이름표와 그리는 함수 */
export const VIZ = {
  timeline: ["연표", VzTimeline],
  flow: ["흐름", VzFlow],
  compare: ["비교", VzCompare],
  cards: ["한눈에 보기", VzCards],
  stats: ["숫자로 보기", VzStats],
  terms: ["용어", VzTerms],
  sources: ["원문 읽기", VzSources],
  spectrum: ["비교 축", VzSpectrum],
  table: ["표", VzTable],
  quote: ["인용", VzQuote],
};

function Viz({ v }) {
  const def = VIZ[v && v.type];
  if (!def) return null;
  const [tag, Body] = def;
  return (
    <section className={"vz vz--" + v.type} aria-label={(v.tag || tag) + (v.title ? ": " + plain(v.title) : "")}>
      <div className="vz-head">
        <span className="vz-tag">{v.tag || tag}</span>
        {v.title && <span className="vz-title">{inline(v.title)}</span>}
      </div>
      <Body v={v} />
      {v.note && <p className="vz-note">{inline(v.note)}</p>}
    </section>
  );
}

/* ---------- 작품·문헌 ---------- */

const nameOf = (s) => ((String(s || "").match(/「([^」]+)」/) || [])[1] || "").trim();

function WorkCard({ w, img, onOpen }) {
  const links = arr(w.links).filter((l) => l && l.u);
  const src = links.filter((l) => l.k === "원문");
  const rest = links.filter((l) => l.k !== "원문");
  const url = useImgUrl(img && img.src);
  return (
    <article className={"rd-wk" + (img ? " has-img" : "")}>
      {img && url && (
        <button type="button" className="rd-wk-img" onClick={() => onOpen(img)} aria-label={(nameOf(w.w) || "작품") + " 도판 크게 보기"}>
          <img src={url} alt={plain(w.w)} loading="lazy" />
        </button>
      )}
      <div className="rd-wk-b">
        <span className="rd-wk-a">{w.a}{w.y ? " · " + w.y : ""}</span>
        <b className="rd-wk-w">{inline(w.w)}</b>
        {w.d && <p>{inline(w.d)}</p>}
        {(src.length > 0 || rest.length > 0) && (
          <div className="wk-links">
            {src.map((l, i) => (
              <a key={"s" + i} className="wk-link src" href={l.u} target="_blank" rel="noopener noreferrer">
                <em>원문</em>{l.t || l.u}<span aria-hidden="true"> ↗</span>
              </a>
            ))}
            {rest.map((l, i) => (
              <a key={i} className="wk-link" href={l.u} target="_blank" rel="noopener noreferrer">
                {l.t || l.u}<span aria-hidden="true"> ↗</span>
              </a>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}

/* ---------- 읽기 자료 본문 ---------- */

const atOf = (x, n) => {
  if (!x || x.at == null || x.at === "") return null;
  const a = Math.round(Number(x.at));
  if (!isFinite(a)) return null;
  return Math.max(-1, Math.min(n - 1, a));
};

export function ReadingBody({ rd, L, extra }) {
  const [box, setBox] = useState(-1);
  const paras = arr(rd.p);
  const blocks = paras.map(parseBlock);
  const n = paras.length;
  const imgs = arr(rd.images).filter((x) => x && x.src);
  const viz = arr(rd.viz).filter((v) => v && VIZ[v.type]);
  const open = (img) => setBox(Math.max(0, imgs.indexOf(img)));

  // 문단 j 다음 자리에 놓을 것들: 그림 묶음(같은 at·연속)과 도식
  const slots = {};
  const put = (j, item) => { (slots[j] = slots[j] || []).push(item); };
  let group = null;
  imgs.forEach((img) => {
    const a = atOf(img, n);
    const j = a == null ? "end" : a;
    if (group && group.j === j && group.size === (img.size || "full") && group.imgs.length < 4) { group.imgs.push(img); return; }
    group = { k: "figs", j, size: img.size || "full", imgs: [img] };
    put(j, group);
  });
  viz.forEach((v) => { const a = atOf(v, n); put(a == null ? "end" : a, { k: "viz", v }); });

  // 자리 j 뒤로 다음 끊김(그림·도식·소제목·인용·핵심)까지 이어지는 글자 수
  const roomAfter = (j) => {
    let c = 0;
    for (let k = (j === "end" ? n : j + 1); k < n; k++) {
      const b = blocks[k];
      if (!b) continue;
      if (b.k === "h" || b.k === "q" || b.k === "key") break;
      c += plain(b.k === "p" ? b.text : (b.lead || "") + b.items.join(" ")).length;
      if (slots[k] && slots[k].length) break;
    }
    return c;
  };
  const renderSlot = (j) => (slots[j] || []).map((it, i) => (
    it.k === "figs"
      ? <FigGroup key={"f" + j + "-" + i} imgs={it.imgs} onOpen={open} room={i === (slots[j] || []).length - 1 ? roomAfter(j) : 0} />
      : <Viz key={"v" + j + "-" + i} v={it.v} />
  ));

  // 앞 사진을 뒤 사진으로 덮어쓰는 일은 없지만, 교사가 문단을 지워 같은 작품이
  // 두 번 나오지 않도록 작품 카드 도판은 이 읽기 자료와 차시 전체 도판에서 이름으로 찾는다
  const allImgs = L ? arr(L.readings).flatMap((r) => arr(r.images)).filter((x) => x && x.src) : imgs;
  const imgFor = (w) => {
    const q = nameOf(w.w);
    if (!q) return null;
    return imgs.find((x) => nameOf(x.cap) === q) || allImgs.find((x) => nameOf(x.cap) === q) || null;
  };
  const works = arr(rd.works).filter((w) => w && (w.w || w.a));
  const asks = arr(rd.asks).filter((a) => a && String(a).trim());
  const firstPlain = blocks.findIndex((b) => b && b.k === "p");

  return (
    <div className="rd">
      <AccessReadingBar L={L} rd={rd} />
      {renderSlot(-1)}
      {blocks.map((b, j) => (
        <React.Fragment key={j}>
          {b && <Block b={b} lead={j === firstPlain && j === 0 && plain(b.text).length <= 240} />}
          {b && <AccessPara L={L} rd={rd} j={j} raw={paras[j]} />}
          {renderSlot(j)}
        </React.Fragment>
      ))}
      {renderSlot("end")}
      {extra}
      {asks.length > 0 && (
        <div className="rd-asks">
          <div className="rd-asks-h">생각해 볼 질문</div>
          <ol>{asks.map((a, i) => <li key={i}>{inline(a)}</li>)}</ol>
        </div>
      )}
      {works.length > 0 && (
        <section className="rd-works">
          <div className="rd-works-h">작품·문헌 더 알아보기 <span>{works.length}</span></div>
          <div className="rd-wk-grid">
            {works.map((w, i) => {
              const img = imgFor(w);
              return <WorkCard key={i} w={w} img={img} onOpen={(x) => { const k = imgs.indexOf(x); if (k >= 0) setBox(k); else setBox(-2 - allImgs.indexOf(x)); }} />;
            })}
          </div>
        </section>
      )}
      {box >= 0 && imgs[box] && <Lightbox list={imgs} idx={box} onIdx={setBox} onClose={() => setBox(-1)} />}
      {box <= -2 && allImgs[-2 - box] && <Lightbox list={[allImgs[-2 - box]]} idx={0} onIdx={() => {}} onClose={() => setBox(-1)} />}
    </div>
  );
}

/* 접힌 제목 줄에 보이는 작은 도판 */
function SumThumb({ src }) {
  const url = useImgUrl(src);
  if (!url) return null;
  return <img src={url} alt="" loading="lazy" />;
}

/* 읽기 자료 한 편 (접었다 펴는 카드) */
export function ReadingCard({ rd, i, count, L, seen, onToggle, extra }) {
  const thumbs = arr(rd.images).filter((x) => x && x.src).slice(0, 3);
  const nViz = arr(rd.viz).filter((v) => v && VIZ[v.type]).length;
  return (
    <details className="reading rd-card" data-rd={i} id={"rd-" + (L ? L.n : 0) + "-" + i} onToggle={onToggle}>
      <summary className="rd-sum">
        <span className="stage-tag">{rd.stage}</span>
        <span className="rd-i">{i + 1}/{count}</span>
        <span className="rd-sum-t">{rd.h}</span>
        {(thumbs.length > 0 || nViz > 0) && (
          <span className="rd-sum-x" aria-hidden="true">
            {thumbs.map((x, k) => <SumThumb key={k} src={x.src} />)}
            {nViz > 0 && <span className="rd-sum-v">도식 {nViz}</span>}
          </span>
        )}
        {seen && <span className="rd-seen" aria-label="펼쳐 본 자료">✓</span>}
      </summary>
      <ReadingBody rd={rd} L={L} extra={extra} />
    </details>
  );
}

/* ---------- 차시 맨 위: 흐름과 오늘 만나는 작품 ---------- */

function StripThumb({ it, onClick }) {
  const url = useImgUrl(it.img.src);
  const { title } = capParts(it.img.cap);
  const label = nameOf(it.img.cap) ? "「" + nameOf(it.img.cap) + "」" : (title || "").slice(0, 18);
  return (
    <button type="button" className="lz-strip-i" onClick={onClick} title={title}>
      {url ? <img src={url} alt="" loading="lazy" /> : <span className="lz-strip-ph" />}
      <span>{label}</span>
    </button>
  );
}

export function LessonMap({ L, bodyRef }) {
  const rds = arr(L && L.readings);
  if (rds.length < 2) return <ReadingStyle />;
  // 이어지는 같은 단계는 한 칸으로 묶는다
  const stages = [];
  rds.forEach((rd, i) => {
    const last = stages[stages.length - 1];
    if (last && last.stage === rd.stage) last.items.push(i);
    else stages.push({ stage: rd.stage, items: [i] });
  });
  const seenSrc = new Set(), seenKey = new Set(), strip = [];
  rds.forEach((rd, i) => arr(rd.images).forEach((img) => {
    if (!img || !img.src || seenSrc.has(img.src)) return;
    seenSrc.add(img.src);
    const key = nameOf(img.cap) || img.src;
    if (seenKey.has(key)) return;
    seenKey.add(key);
    strip.push({ img, i });
  }));
  const jump = (i, src) => {
    const root = bodyRef && bodyRef.current;
    if (!root) return;
    const d = root.querySelector('details.reading[data-rd="' + i + '"]');
    if (!d) return;
    if (!d.open) d.open = true;
    requestAnimationFrame(() => {
      let el = d;
      if (src) {
        const im = [...d.querySelectorAll(".rd-fig img")].find((x) => x.getAttribute("src") === src);
        if (im) el = im.closest(".rd-fig") || im;
      }
      el.scrollIntoView({ behavior: "smooth", block: src ? "center" : "start" });
    });
  };
  return (
    <div className="lz-map">
      <ReadingStyle />
      <div className="lz-map-h">이번 차시 흐름 <span>읽기 자료 {rds.length}편</span></div>
      <ol className="lz-steps">
        {stages.map((s, k) => (
          <li key={k}>
            <span className="lz-step-n">{String(k + 1).padStart(2, "0")}</span>
            <b>{s.stage}</b>
            {s.items.map((i) => (
              <button type="button" key={i} onClick={() => jump(i)}>{rds[i].h}</button>
            ))}
          </li>
        ))}
      </ol>
      {strip.length > 0 && (
        <>
          <div className="lz-map-h">이번 차시에 보는 작품·자료 <span>{strip.length}점</span></div>
          <div className="lz-strip">
            {strip.map((it, k) => <StripThumb key={k} it={it} onClick={() => jump(it.i, it.img.src)} />)}
          </div>
        </>
      )}
    </div>
  );
}

/* ============================================================
   모양
   ============================================================ */

export const READING_CSS = `
/* 차시 흐름 */
.lz-map{border:1px solid var(--line);border-top:2px solid var(--ink);background:#fff;margin:0 0 16px;padding:12px 0 4px}
.lz-map-h{display:flex;align-items:baseline;gap:8px;padding:0 16px;font-size:13px;font-weight:700;color:var(--ink)}
.lz-map-h span{font-size:11.5px;font-weight:500;color:var(--sub)}
.lz-steps{list-style:none;margin:0;padding:10px 16px 14px;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px 0}
.lz-steps li{position:relative;padding:22px 12px 0 0;border-top:2px solid var(--line2);display:flex;flex-direction:column;align-items:flex-start;gap:3px;min-width:0}
.lz-steps li::before{content:"";position:absolute;top:-6px;left:0;width:10px;height:10px;border-radius:50%;background:var(--seal)}
.lz-step-n{position:absolute;top:4px;left:0;font:700 11px/1 'Archivo',sans-serif;color:var(--seal)}
.lz-steps b{font-size:13px;line-height:1.35}
.lz-steps button{all:unset;cursor:pointer;font-size:12px;line-height:1.45;color:var(--sub);word-break:keep-all;border-bottom:1px solid transparent}
.lz-steps button:hover,.lz-steps button:focus-visible{color:var(--seal);border-bottom-color:var(--seal)}
.lz-steps button:focus-visible{outline:2px solid var(--seal);outline-offset:2px}
.lz-strip{display:flex;gap:8px;overflow-x:auto;padding:10px 16px 12px;scroll-snap-type:x proximity}
.lz-strip-i{all:unset;cursor:pointer;flex:0 0 96px;width:96px;scroll-snap-align:start;display:flex;flex-direction:column;gap:4px}
.lz-strip-i img,.lz-strip-ph{display:block;width:96px;height:96px;object-fit:cover;background:#f2f2f0;border:1px solid var(--line2)}
.lz-strip-i span{font-size:11px;line-height:1.35;color:var(--sub);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;word-break:keep-all}
.lz-strip-i:hover img,.lz-strip-i:focus-visible img{outline:2px solid var(--seal);outline-offset:-2px}
.lz-strip-i:focus-visible{outline:2px solid var(--seal);outline-offset:2px}
@media(max-width:560px){.lz-steps{grid-template-columns:1fr;gap:0}.lz-steps li{border-top:0;border-left:2px solid var(--line2);padding:0 0 12px 18px}
  .lz-steps li::before{top:2px;left:-6px}.lz-step-n{position:static;margin-bottom:1px}}

/* 읽기 자료 카드 */
.reading.rd-card{margin-bottom:12px}
.reading.rd-card>summary.rd-sum{padding:13px 16px;font-size:15px;line-height:1.45;align-items:center}
.rd-sum .rd-sum-t{flex:1 1 auto;min-width:0;word-break:keep-all}
.rd-sum .rd-sum-x{display:flex;align-items:center;gap:4px;flex:0 0 auto}
.rd-sum .rd-sum-x img{width:34px;height:34px;object-fit:cover;border:1px solid var(--line2);background:#f2f2f0}
.rd-sum .rd-sum-v{font-size:10.5px;font-weight:500;color:var(--patina);border:1px solid var(--patina);padding:1px 5px;margin-left:2px;white-space:nowrap}
.rd-sum .rd-seen{margin-left:4px}
.reading.rd-card[open]>summary.rd-sum{border-bottom:1px solid var(--line2)}
.reading.rd-card[open]>summary .rd-sum-x{display:none}
@media(max-width:560px){.rd-sum .rd-sum-x img:nth-child(n+2){display:none}}

/* 본문 */
.rd{padding:20px 22px 22px;color:#1f1f1f;min-width:0;overflow-wrap:break-word}
.rd img{max-width:100%}
.rd::after{content:"";display:block;clear:both}
.rd .rd-p{font-size:15px;line-height:1.9;margin:0 0 15px;max-width:46em;word-break:keep-all;overflow-wrap:break-word;text-align:left}
.rd .rd-p.lead{font-size:16.5px;line-height:1.85;font-weight:500;color:var(--ink)}
.rd-em{font-weight:700;color:var(--ink);background:linear-gradient(transparent 60%,#F6DCD7 60%)}
.rd-a{color:var(--seal);text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:3px;overflow-wrap:anywhere}
.rd-a::after{content:"↗";font-size:.78em;margin-left:1px;text-decoration:none;display:inline-block}
.rd-a:hover{background:var(--seal-bg)}
.rd-h{clear:both;font-size:17px;font-weight:700;line-height:1.45;margin:30px 0 12px;max-width:46em;word-break:keep-all;color:var(--ink)}
.rd-h::before{content:"";display:block;width:28px;height:3px;background:var(--seal);margin-bottom:9px}
.rd>.rd-h:first-child{margin-top:4px}
.rd-q{clear:both;margin:22px 0 24px;padding:4px 0 4px 22px;border-left:3px solid var(--seal);max-width:44em;position:relative}
.rd-q p{font-size:16.5px;line-height:1.8;font-weight:500;color:var(--ink);margin:0 0 6px;word-break:keep-all}
.rd-q cite{display:block;font-style:normal;font-size:12.5px;line-height:1.6;color:var(--sub);margin-top:6px}
.rd-key{clear:both;display:flex;gap:14px;align-items:flex-start;background:var(--ink);color:#fff;padding:16px 18px;margin:22px 0;max-width:46em}
.rd-key-t{flex:0 0 auto;font-size:11px;font-weight:700;border:1px solid rgba(255,255,255,.7);padding:2px 7px;margin-top:3px}
.rd-key p{margin:0;font-size:15.5px;line-height:1.8;font-weight:500;word-break:keep-all}
.rd-key .rd-em{color:#fff;background:linear-gradient(transparent 62%,rgba(181,56,42,.85) 62%)}
.rd-key .rd-a{color:#fff}
.rd-lw{max-width:46em;margin:0 0 16px}
.rd-lw .rd-p{margin-bottom:8px}
.rd-list{list-style:none;margin:0;padding:0;counter-reset:rdl}
.rd-list li{position:relative;padding:9px 0 9px 38px;border-top:1px solid var(--line2);font-size:15px;line-height:1.8;word-break:keep-all}
.rd-list li:last-child{border-bottom:1px solid var(--line2)}
.rd-list.ol li::before{counter-increment:rdl;content:counter(rdl);position:absolute;left:0;top:10px;width:25px;height:25px;border-radius:50%;background:var(--seal);color:#fff;font:700 12px/25px 'Archivo',sans-serif;text-align:center}
.rd-list.ul li::before{content:"";position:absolute;left:9px;top:21px;width:7px;height:7px;background:var(--ink)}

/* 도판 */
.rd-figs{clear:both;display:grid;gap:16px;margin:22px 0 26px}
.rd-figs.c2{grid-template-columns:1fr 1fr}
.rd-figs.c3{grid-template-columns:repeat(3,1fr)}
.rd-figs.c4{grid-template-columns:repeat(4,1fr);gap:12px}
.rd-fig{margin:0;min-width:0}
.rd-fig-btn{position:relative;display:block;width:100%;padding:0;border:0;background:#f3f3f1;cursor:zoom-in;overflow:hidden}
.rd-fig-btn img{display:block;width:100%;height:100%;object-fit:contain}
.rd-figs.c1 .rd-fig-btn{background:none;text-align:center}
.rd-figs.c1 .rd-fig-btn img{width:auto;max-width:100%;height:auto;max-height:560px;margin:0 auto;background:#f3f3f1}
.rd-figs.c1.half{max-width:62%;margin-left:auto;margin-right:auto}
.rd-figs.c1.small{max-width:40%}
.rd-figs.c2 .rd-fig-btn{aspect-ratio:4/3}
.rd-figs.c3 .rd-fig-btn,.rd-figs.c4 .rd-fig-btn{aspect-ratio:1/1}
.rd-figs.side .rd-fig-btn img{height:auto;max-height:380px}
.rd-fig-btn:focus-visible{outline:3px solid var(--seal);outline-offset:2px}
.rd-zoom{position:absolute;right:8px;bottom:8px;font-size:11px;font-weight:500;color:#fff;background:rgba(17,17,17,.72);padding:3px 8px;opacity:0;transition:opacity .15s}
.rd-fig-btn:hover .rd-zoom,.rd-fig-btn:focus-visible .rd-zoom{opacity:1}
.rd-fig figcaption{padding-top:9px;font-size:12.5px;line-height:1.65;color:var(--sub);word-break:keep-all;max-width:46em}
.rd-figs.c1 figcaption{margin:0 auto}
.rd-fig-t{display:block;color:var(--ink);font-weight:700;font-size:13px;line-height:1.5;margin-bottom:2px}
.rd-figs.c3 .rd-fig-t,.rd-figs.c4 .rd-fig-t{font-size:12px}
.rd-fig-d{display:block}
.rd-fig-d.clamp{display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.rd-fig-m{display:flex;flex-wrap:wrap;align-items:baseline;gap:3px 10px;margin-top:5px;font-size:11px;line-height:1.5}
.rd-fig-cr{color:#8a8a8a}
.rd-fig-m a{color:var(--seal);text-decoration:none;border-bottom:1px solid rgba(181,56,42,.4);white-space:nowrap}
.rd-fig-m a:hover{border-bottom-color:var(--seal)}
.rd-figs.c4 .rd-fig-cr,.rd-figs.c3 .rd-fig-cr{display:block;width:100%}
@media(min-width:760px){
  .rd-figs.side{float:right;clear:right;width:38%;margin:6px 0 16px 26px}
}
@media(max-width:640px){
  .rd{padding:16px 14px 18px}
  .rd-figs.c3,.rd-figs.c4{grid-template-columns:1fr 1fr}
  .rd-figs.c1.half,.rd-figs.c1.small{max-width:100%}
  .rd .rd-p{font-size:15px}
  .rd .rd-p.lead{font-size:16px}
}
@media(max-width:420px){.rd-figs.c2{grid-template-columns:1fr}.rd-figs.c2 .rd-fig-btn{aspect-ratio:auto}.rd-figs.c2 .rd-fig-btn img{height:auto;max-height:420px}}

/* 크게 보기 */
.rd-box{position:fixed;inset:0;z-index:1000;background:rgba(12,12,12,.94);display:flex;align-items:center;justify-content:center;padding:16px}
.rd-box-in{width:100%;max-width:1120px;max-height:100%;display:flex;flex-direction:column;gap:12px;color:#eee;overflow:auto}
.rd-box-bar{display:flex;justify-content:flex-end;align-items:center;gap:6px}
.rd-box-bar button{font:500 13px var(--sans);color:#fff;background:transparent;border:1px solid rgba(255,255,255,.55);padding:6px 12px;cursor:pointer;min-height:36px}
.rd-box-bar button:hover,.rd-box-bar button:focus-visible{background:#fff;color:#111}
.rd-box-n{font:500 12px 'Archivo',sans-serif;color:#bbb;margin-right:auto}
.rd-box-in>img{display:block;max-width:100%;max-height:70vh;object-fit:contain;margin:0 auto}
.rd-box-cap{max-width:780px;margin:0 auto;font-size:13px;line-height:1.75;word-break:keep-all}
.rd-box-cap b{display:block;font-size:14.5px;color:#fff;margin-bottom:4px}
.rd-box-cap p{margin:0 0 6px;color:#d6d6d6}
.rd-box-cap .rd-fig-cr{color:#aaa}
.rd-box-cap .rd-fig-m a{color:#ffb4a8;border-bottom-color:rgba(255,180,168,.5)}

/* 도식 공통 */
.vz{clear:both;margin:24px 0 28px;border:1px solid var(--line);background:#fff;padding:16px 18px 18px}
.vz-head{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:14px}
.vz-tag{font-size:11px;font-weight:700;color:#fff;background:var(--patina);padding:2px 8px}
.vz-title{font-size:15px;font-weight:700;color:var(--ink);line-height:1.45;word-break:keep-all}
.vz-note{margin:12px 0 0;font-size:12.5px;line-height:1.65;color:var(--sub)}
.vz p{margin:0}
.vz-img{display:block;width:100%;height:110px;object-fit:cover;background:#f3f3f1;border:1px solid var(--line2);margin-bottom:8px}
.vz-scroll{overflow-x:auto}

/* 연표 */
.vz-tl{list-style:none;margin:0;padding:0 0 0 4px}
.vz-tl li{position:relative;display:grid;grid-template-columns:108px 1fr;gap:14px;padding:0 0 16px}
.vz-tl li::before{content:"";position:absolute;left:113px;top:8px;bottom:-8px;width:2px;background:var(--line2)}
.vz-tl li:last-child::before{display:none}
.vz-tl li::after{content:"";position:absolute;left:108px;top:4px;width:12px;height:12px;border-radius:50%;background:#fff;border:3px solid var(--seal);box-sizing:border-box}
.vz-tl-y{font:700 14px/1.35 'Archivo','Noto Sans KR',sans-serif;word-break:keep-all;color:var(--seal);text-align:right;padding-right:14px}
.vz-tl-b{padding-left:14px;min-width:0}
.vz-tl-b b{display:block;font-size:14.5px;line-height:1.5;color:var(--ink)}
.vz-tl-b p{font-size:13.5px;line-height:1.7;color:#444;margin-top:2px}
.vz-tl-b .vz-img{height:auto;max-height:150px;width:auto;max-width:220px;object-fit:contain}
@media(min-width:760px){
  .vz-tl.h{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:0;padding:0}
  .vz-tl.h li{display:block;padding:34px 14px 0 0;border-top:0}
  .vz-tl.h li::before{left:0;right:0;top:9px;bottom:auto;width:auto;height:2px}
  .vz-tl.h li:last-child::before{display:block;right:50%}
  .vz-tl.h li::after{left:0;top:4px}
  .vz-tl.h .vz-tl-y{display:block;text-align:left;padding:0 0 4px}
  .vz-tl.h .vz-tl-b{padding-left:0}
}
@media(max-width:520px){.vz-tl li{grid-template-columns:64px 1fr;gap:10px}.vz-tl li::before{left:69px}.vz-tl li::after{left:64px}.vz-tl-y{font-size:13px}}

/* 흐름 */
.vz-flow{list-style:none;margin:0;padding:0;display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);gap:26px}
.vz-flow li{position:relative;background:var(--card2);border-top:3px solid var(--ink);padding:12px 12px 14px;min-width:0}
.vz-flow li:not(:last-child)::after{content:"→";position:absolute;right:-21px;top:50%;transform:translateY(-50%);font:700 16px 'Archivo',sans-serif;color:var(--seal)}
.vz-flow-n{display:block;font:700 12px/1 'Archivo',sans-serif;color:var(--seal);margin-bottom:6px}
.vz-flow b{display:block;font-size:14px;line-height:1.45;color:var(--ink);word-break:keep-all}
.vz-flow p{font-size:12.5px;line-height:1.65;color:#444;margin-top:4px;word-break:keep-all}
.vz-flow li.vz-flow-back{background:none;border-top:3px dashed var(--line);display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--sub)}
@media(max-width:700px){
  .vz-flow{grid-auto-flow:row;grid-auto-columns:auto;gap:22px}
  .vz-flow li:not(:last-child)::after{content:"↓";right:auto;left:50%;top:auto;bottom:-22px;transform:translateX(-50%)}
}

/* 비교 */
.vz-cmp{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px}
.vz-cmp-c{border:1px solid var(--line2);border-top:3px solid var(--ink);padding:12px 14px 12px;min-width:0}
.vz-cmp-c:nth-child(2){border-top-color:var(--seal)}
.vz-cmp-c:nth-child(3){border-top-color:var(--patina)}
.vz-cmp-h{display:block;font-size:15px;line-height:1.45;color:var(--ink)}
.vz-cmp-s{display:block;font-size:12px;color:var(--sub);margin-top:1px}
.vz-cmp ul{margin:8px 0 0;padding:0;list-style:none}
.vz-cmp li{font-size:13.5px;line-height:1.7;padding:5px 0 5px 14px;border-top:1px dotted var(--line);position:relative;word-break:keep-all}
.vz-cmp li::before{content:"";position:absolute;left:0;top:14px;width:6px;height:2px;background:var(--sub)}
.vz-cmp-t{width:100%;border-collapse:collapse;font-size:13.5px;line-height:1.65;min-width:520px}
.vz-cmp-t th,.vz-cmp-t td{border-bottom:1px solid var(--line2);padding:9px 10px;text-align:left;vertical-align:top;word-break:keep-all}
.vz-cmp-t thead th{border-bottom:2px solid var(--ink);font-size:14px;color:var(--ink)}
.vz-cmp-t thead th small{display:block;font-size:11.5px;font-weight:400;color:var(--sub)}
.vz-cmp-t thead th .vz-img{height:90px;width:100%;object-fit:cover}
.vz-cmp-t tbody th{font-size:12.5px;color:var(--sub);font-weight:700;width:18%;white-space:normal}

/* 한눈에 보기 */
.vz-cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.vz-card{border:1px solid var(--line2);background:var(--card2);padding:12px 13px 13px;min-width:0}
.vz-card-k{display:block;font:900 22px/1.1 'Archivo','Noto Sans KR',sans-serif;color:var(--seal);margin-bottom:6px;word-break:keep-all}
.vz-card b{display:block;font-size:14px;line-height:1.45;color:var(--ink);word-break:keep-all}
.vz-card p{font-size:12.5px;line-height:1.65;color:#444;margin-top:4px;word-break:keep-all}

/* 숫자로 보기 */
.vz-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:0 12px;border-top:2px solid var(--ink)}
@media(max-width:560px){.vz-stat-n{font-size:25px}}
.vz-stat{padding:12px 14px 4px 0;min-width:0}
.vz-stat-n{display:block;font:900 30px/1.1 'Archivo','Noto Sans KR',sans-serif;color:var(--seal);letter-spacing:-.01em;word-break:keep-all}
.vz-stat-t{display:block;font-size:12.5px;line-height:1.6;color:#444;margin-top:6px;word-break:keep-all}

/* 용어 */
.vz-terms{margin:0;display:grid;gap:0}
.vz-terms>div{display:grid;grid-template-columns:minmax(120px,26%) 1fr;gap:14px;padding:10px 0;border-top:1px solid var(--line2)}
.vz-terms>div:first-child{border-top:0;padding-top:0}
.vz-terms dt{font-size:14.5px;font-weight:700;color:var(--ink);line-height:1.5;word-break:keep-all}
.vz-terms dt small{display:block;font:500 11.5px 'Archivo',sans-serif;color:var(--sub);margin-top:1px}
.vz-terms dd{margin:0;font-size:13.5px;line-height:1.75;color:#333;word-break:keep-all}
@media(max-width:520px){.vz-terms>div{grid-template-columns:1fr;gap:3px}}

/* 원문 읽기 */
.vz--sources{border-color:var(--ink)}
.vz--sources .vz-tag{background:var(--ink)}
.vz-src{list-style:none;margin:0;padding:0}
.vz-src li{border-top:1px solid var(--line2);padding:9px 0}
.vz-src li:first-child{border-top:0;padding-top:0}
.vz-src a{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;text-decoration:none;color:var(--ink)}
.vz-src-t{font-size:14px;font-weight:700;line-height:1.5;border-bottom:1px solid var(--line);word-break:keep-all}
.vz-src a:hover .vz-src-t{color:var(--seal);border-bottom-color:var(--seal)}
.vz-src-u{font:500 11.5px 'Archivo',sans-serif;color:var(--seal)}
.vz-src p{font-size:12.5px;line-height:1.65;color:var(--sub);margin-top:3px;word-break:keep-all}

/* 비교 축 */
.vz-sp-poles{display:flex;justify-content:space-between;gap:12px;font-size:12.5px;font-weight:700;color:var(--ink);padding-bottom:8px;border-bottom:2px solid var(--ink);margin-left:calc(38% + 12px)}
.vz-sp-poles span:last-child{text-align:right}
.vz-sp ul{list-style:none;margin:0;padding:0}
.vz-sp li{display:grid;grid-template-columns:38% 1fr;gap:12px;align-items:center;padding:9px 0;border-bottom:1px solid var(--line2)}
.vz-sp-l b{display:block;font-size:13.5px;line-height:1.45;color:var(--ink);word-break:keep-all}
.vz-sp-l span{display:block;font-size:12px;line-height:1.55;color:var(--sub);word-break:keep-all}
.vz-sp-track{position:relative;height:10px;background:linear-gradient(90deg,var(--line2),var(--line2)) center/100% 2px no-repeat}
.vz-sp-track i{position:absolute;top:50%;width:14px;height:14px;border-radius:50%;background:var(--seal);transform:translate(-50%,-50%);box-shadow:0 0 0 3px #fff}
@media(max-width:560px){.vz-sp-poles{margin-left:0}.vz-sp li{grid-template-columns:1fr;gap:6px}}

/* 표 */
.vz-tbl{width:100%;border-collapse:collapse;font-size:13.5px;line-height:1.65;min-width:480px}
.vz-tbl th,.vz-tbl td{border-bottom:1px solid var(--line2);padding:8px 10px;text-align:left;vertical-align:top;word-break:keep-all}
.vz-tbl thead th{border-bottom:2px solid var(--ink);color:var(--ink);font-size:13px}
.vz-tbl tbody th{color:var(--ink);font-weight:700}

/* 인용 */
.vz--quote{border:0;border-top:2px solid var(--ink);border-bottom:1px solid var(--line);padding:16px 4px 14px;background:none}
.vz--quote .vz-head{margin-bottom:8px}
.vz-quote{margin:0}
.vz-quote blockquote{margin:0}
.vz-quote blockquote p{font-size:19px;line-height:1.7;font-weight:500;color:var(--ink);word-break:keep-all;margin:0 0 6px}
.vz-quote blockquote p:first-child::before{content:"“";font:900 40px/0 'Archivo',serif;color:var(--seal);vertical-align:-14px;margin-right:4px}
.vz-quote figcaption{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:12.5px;color:var(--sub);margin-top:8px}
.vz-quote figcaption a{color:var(--seal);text-decoration:none;border-bottom:1px solid currentColor}

/* 생각해 볼 질문 */
.rd-asks{clear:both;border-left:3px solid var(--patina);background:var(--patina-bg);padding:14px 18px 12px;margin:26px 0 18px}
.rd-asks-h{font-size:12px;font-weight:700;color:var(--patina);margin-bottom:6px}
.rd-asks ol{margin:0;padding:0;list-style:none;counter-reset:rq}
.rd-asks li{position:relative;padding:5px 0 5px 34px;font-size:14.5px;line-height:1.75;word-break:keep-all}
.rd-asks li::before{counter-increment:rq;content:"Q" counter(rq);position:absolute;left:0;top:7px;font:700 12px/1.4 'Archivo',sans-serif;color:var(--patina)}

/* 작품·문헌 */
.rd-works{clear:both;margin-top:24px;border-top:2px solid var(--ink);padding-top:12px}
.rd-works-h{font-size:13px;font-weight:700;color:var(--ink);margin-bottom:12px}
.rd-works-h span{font:700 11px 'Archivo',sans-serif;color:#fff;background:var(--seal);padding:1px 6px;margin-left:4px;vertical-align:1px}
.rd-wk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
.rd-wk{display:flex;flex-direction:column;border:1px solid var(--line2);background:#fff;min-width:0}
.rd-wk-img{all:unset;cursor:zoom-in;display:block;aspect-ratio:16/10;background:#f3f3f1;overflow:hidden}
.rd-wk-img img{display:block;width:100%;height:100%;object-fit:cover}
.rd-wk-img:focus-visible{outline:3px solid var(--seal);outline-offset:-3px}
.rd-wk-b{padding:10px 12px 12px;display:flex;flex-direction:column;gap:3px;flex:1 1 auto}
.rd-wk-a{font-size:11.5px;color:var(--sub);line-height:1.4}
.rd-wk-w{font-size:14.5px;line-height:1.45;color:var(--ink);word-break:keep-all}
.rd-wk-b p{margin:2px 0 0;font-size:12.5px;line-height:1.65;color:#444;word-break:keep-all}
.rd-wk .wk-links{margin-top:auto;padding-top:8px}
.rd .wk-link{white-space:normal;overflow-wrap:anywhere;max-width:100%}
@media(max-width:560px){.rd-wk-grid{grid-template-columns:1fr}}
.wk-link.src{border-color:var(--ink);color:var(--ink);font-weight:500}
.wk-link.src em{font-style:normal;font-size:10px;font-weight:700;color:#fff;background:var(--ink);padding:0 4px;margin-right:5px;vertical-align:1px}
.wk-link.src:hover{background:var(--card2)}
`;

export function ReadingStyle() { return <style>{READING_CSS}</style>; }
