/* ============================================================
   다양한 학습자를 위한 학습 지원: 순수 계산 (2026-09-28)
   ------------------------------------------------------------
   학생이 고르는 지원 설정(_sup)과 사용 기록(_supUse), 학급 설정(config.access),
   읽어 주기용 문장 나누기, 핵심 용어 찾기, 실시간 자막 버퍼, 연구용 집계를 둔다.
   화면(React)과 브라우저 음성·번역 기능은 src-access.jsx, 교사 화면은 src-access-teacher.jsx.

   설계 원칙 (설계서: 다양한_학습자_지원_설계.md)
   · 진단명이 아니라 지원을 저장한다. 「청각장애」 같은 표지는 어디에도 쓰지 않고,
     학생이 켠 기능(글자 크기, 자막, 번역 언어 등)만 기록지의 _sup에 둔다(개인정보 보호법 제23조 민감정보 최소화).
   · 모든 지원은 모든 학생에게 열려 있다(UDL). 교사는 추천할 수 있지만 켜고 끄는 것은 학생이 정한다.
   · 한국어 원문은 늘 화면에 남긴다. 번역·쉬운 말은 원문 아래에 덧붙는 것이지 원문을 바꾸지 않는다.

   이 파일은 React·Firebase·DOM 없이 돈다. 테스트: src-access-core.test.mjs (npm test)
   ============================================================ */

/* ---------- 도움 언어 ----------
   dict: 화면 용어·입장 안내·핵심 용어 번역을 이 저장소에 미리 넣어 둔 언어(src-access-i18n.mjs, src-access-lexicon.mjs).
   나머지는 브라우저의 기기 안 번역(Chrome Translator API)이 될 때만 읽기 자료 번역을 보여 준다.
   순서: 교육부 다문화 학생 현황의 부모 출신국 비중과 중도입국 학생의 주요 언어를 따랐다(설계서 §2.3). */
export const ACCESS_LANGS = [
  { code: "en", bcp: "en-US", native: "English", ko: "영어", dict: true },
  { code: "zh", bcp: "zh-CN", native: "中文(简体)", ko: "중국어", dict: true },
  { code: "vi", bcp: "vi-VN", native: "Tiếng Việt", ko: "베트남어", dict: true },
  { code: "ru", bcp: "ru-RU", native: "Русский", ko: "러시아어", dict: true },
  { code: "ja", bcp: "ja-JP", native: "日本語", ko: "일본어", dict: true },
  { code: "mn", bcp: "mn-MN", native: "Монгол", ko: "몽골어", dict: false },
  { code: "uz", bcp: "uz-UZ", native: "Oʻzbekcha", ko: "우즈베크어", dict: false },
  { code: "th", bcp: "th-TH", native: "ไทย", ko: "태국어", dict: false },
  { code: "fil", bcp: "fil-PH", native: "Filipino", ko: "필리핀어", dict: false },
  { code: "km", bcp: "km-KH", native: "ខ្មែរ", ko: "크메르어", dict: false },
];
export const langOf = (code) => ACCESS_LANGS.find((l) => l.code === code) || null;

/* ---------- 학생 설정 ---------- */
export const TEXT_STEPS = [100, 125, 150, 175, 200];
export const RATE_STEPS = [0.8, 1, 1.2, 1.5];
export const CONTRAST = ["none", "high", "dark"];
export const CAP_SIZES = ["m", "l", "xl"];

export const DEFAULT_PREFS = Object.freeze({
  v: 1,
  text: 100,        // 글자 크기(%)
  spacing: false,   // 줄·글자 간격 넓게 (WCAG 1.4.12 값)
  contrast: "none", // none | high(흰 바탕 고대비) | dark(검은 바탕 고대비)
  motion: false,    // 움직임 줄이기
  targets: false,   // 버튼·입력칸을 크게 (최소 44px)
  underline: false, // 링크에 밑줄
  tts: false,       // 읽어 주기 도구를 보인다
  rate: 1,          // 읽는 빠르기
  voice: "",        // 고른 한국어 목소리 이름 (빈 값이면 자동)
  lang: "",         // 도움 언어 (빈 값이면 쓰지 않음)
  bilingual: false, // 읽기 자료를 펼치면 번역을 바로 함께 보인다
  gloss: true,      // 이번 차시 핵심 용어 상자와 본문의 용어 표시
  easy: false,      // 읽기 자료마다 쉬운 말 요약을 먼저 보인다
  desc: false,      // 작품 설명을 늘 펼쳐 둔다
  cap: false,       // 실시간 자막을 받는다
  capSize: "m",
  dict: false,      // 말로 입력 버튼을 보인다
  alt: false,       // 관찰 방법마다 다른 감각으로 하는 방법을 보인다
});

const pickOf = (xs, v, d) => (xs.includes(v) ? v : d);
const bool = (v, d) => (typeof v === "boolean" ? v : d);
const nearest = (xs, v, d) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return d;
  return xs.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a), xs[0]);
};

/* 저장값을 믿지 않는다: 옛 버전·교사 추천·다른 기기의 값이 섞여도 늘 온전한 설정을 돌려준다 */
export function normPrefs(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  const d = DEFAULT_PREFS;
  return {
    v: 1,
    text: nearest(TEXT_STEPS, r.text, d.text),
    spacing: bool(r.spacing, d.spacing),
    contrast: pickOf(CONTRAST, r.contrast, d.contrast),
    motion: bool(r.motion, d.motion),
    targets: bool(r.targets, d.targets),
    underline: bool(r.underline, d.underline),
    tts: bool(r.tts, d.tts),
    rate: nearest(RATE_STEPS, r.rate, d.rate),
    voice: typeof r.voice === "string" ? r.voice.slice(0, 120) : "",
    lang: langOf(r.lang) ? r.lang : "",
    bilingual: bool(r.bilingual, d.bilingual),
    gloss: bool(r.gloss, d.gloss),
    easy: bool(r.easy, d.easy),
    desc: bool(r.desc, d.desc),
    cap: bool(r.cap, d.cap),
    capSize: pickOf(CAP_SIZES, r.capSize, d.capSize),
    dict: bool(r.dict, d.dict),
    alt: bool(r.alt, d.alt),
  };
}

/* 기본값과 다른 항목만 (교사 표·연구 집계·저장 크기 줄이기) */
export function prefsDiff(p) {
  const n = normPrefs(p);
  const out = {};
  for (const k of Object.keys(DEFAULT_PREFS)) if (k !== "v" && n[k] !== DEFAULT_PREFS[k]) out[k] = n[k];
  return out;
}

/* <html>에 거는 data 속성. CSS(src-access.jsx의 ACCESS_CSS)가 이 속성으로 화면을 바꾼다 */
export function prefsAttrs(p) {
  const n = normPrefs(p);
  return {
    "data-ax-text": String(n.text),
    "data-ax-spacing": n.spacing ? "1" : null,
    "data-ax-contrast": n.contrast === "none" ? null : n.contrast,
    "data-ax-motion": n.motion ? "reduce" : null,
    "data-ax-targets": n.targets ? "1" : null,
    "data-ax-underline": n.underline ? "1" : null,
    "data-ax-cap": n.cap ? n.capSize : null,
  };
}

/* 시작 묶음. 장애 이름이 아니라 하는 일로 부른다 (누구나 고를 수 있다) */
export const PRESETS = [
  { k: "see", label: "크게 보기", sub: "글자 150%, 간격 넓게, 고대비, 버튼 크게", set: { text: 150, spacing: true, contrast: "high", targets: true, underline: true } },
  { k: "listen", label: "들으며 읽기", sub: "읽어 주기 도구, 작품 설명 펼치기, 말로 입력", set: { tts: true, desc: true, dict: true } },
  { k: "words", label: "글로 보기", sub: "실시간 자막, 쉬운 말 요약, 핵심 용어, 다른 감각 관찰", set: { cap: true, easy: true, gloss: true, alt: true } },
  { k: "lang", label: "두 언어로 보기", sub: "도움 언어를 고르면 번역을 원문 아래에 함께 보입니다", set: { bilingual: true, gloss: true, easy: true, tts: true } },
];

export function applyPreset(p, key) {
  const ps = PRESETS.find((x) => x.k === key);
  return ps ? normPrefs({ ...normPrefs(p), ...ps.set }) : normPrefs(p);
}

/* ---------- 학급 설정 (meta/config.v.access) ---------- */
export const DEFAULT_ACCESS_CFG = Object.freeze({
  translate: true,  // 기기 안 번역으로 읽기 자료를 함께 보이게 허용
  dictation: false, // 말로 입력 허용 (크롬 음성 인식은 소리를 외부 서버로 보낸다: 교사가 켠다)
  easy: true,       // 쉬운 말 요약 제공
  gloss: true,      // 핵심 용어 제공
  alt: true,        // 다른 감각으로 하는 관찰 방법 제공
});

export function accessCfg(cfgAll) {
  const a = (cfgAll && cfgAll.access) || {};
  const d = DEFAULT_ACCESS_CFG;
  return {
    translate: bool(a.translate, d.translate),
    dictation: bool(a.dictation, d.dictation),
    easy: bool(a.easy, d.easy),
    gloss: bool(a.gloss, d.gloss),
    alt: bool(a.alt, d.alt),
  };
}

/* 지금 화면에서 켤 수 있는 도구. 학생 설정 × 학급 허용 × 화면 종류(쪽지시험 중인가)
   쪽지시험은 전체 화면 시험 창이 따로 떠서 이 도구들이 닿지 않고, 번역·용어 풀이는 문항이 묻는 개념을 알려 줄 수 있다.
   그래서 시험 중에는 보기 설정(글자 크기·대비 등)과 자막만 남긴다. 시험 안의 읽어 주기는 시험 모듈이 기기 안 목소리로만
   따로 해야 한다(온라인 목소리는 문항 글을 목소리 회사로 보낸다: 설계서 §6.2) */
export function toolsNow(prefs, cfg, where) {
  const p = normPrefs(prefs);
  const c = cfg || DEFAULT_ACCESS_CFG;
  const quiz = where === "quiz";
  return {
    tts: p.tts && !quiz,
    translate: !!p.lang && c.translate && !quiz,
    bilingual: !!p.lang && p.bilingual && c.translate && !quiz,
    gloss: p.gloss && c.gloss && !quiz,
    easy: p.easy && c.easy && !quiz,
    desc: true,
    descOpen: p.desc,
    cap: p.cap,
    dict: p.dict && c.dictation && !quiz,
    alt: p.alt && c.alt && !quiz,
  };
}

/* ---------- 읽어 주기: 문장 나누기 ----------
   크롬의 온라인 목소리는 한 발화가 길면(약 15초) 중간에 멈추는 오래된 문제가 있고,
   문장 단위로 끊어야 읽는 문장을 강조하고 앞뒤로 옮겨 다닐 수 있다.
   돌려주는 조각: { text, start, end } (원문 안의 위치, 강조에 쓴다) */
export function splitSpeech(text, max = 140) {
  const s = String(text || "");
  const out = [];
  const re = /[^.?!。？！\n]*(?:[.?!。？！]+["'」』)\]]*|\n+|$)/g;
  let m;
  while ((m = re.exec(s)) && m[0] !== "") {
    const seg = m[0];
    const start = m.index;
    pushChunk(out, s, start, start + seg.length, max);
    if (re.lastIndex >= s.length) break;
  }
  return out;
}

function pushChunk(out, s, a, b, max) {
  // 앞뒤 공백을 걷어 낸 위치
  while (a < b && /\s/.test(s[a])) a++;
  while (b > a && /\s/.test(s[b - 1])) b--;
  if (b <= a) return;
  if (b - a <= max) { out.push({ text: s.slice(a, b), start: a, end: b }); return; }
  // 긴 문장은 쉼표 → 띄어쓰기 순으로 max 안쪽에서 자른다
  const lim = a + max;
  let cut = -1;
  for (let i = lim; i > a + max / 2; i--) if (/[,，、;:]/.test(s[i])) { cut = i + 1; break; }
  if (cut < 0) for (let i = lim; i > a + max / 2; i--) if (/\s/.test(s[i])) { cut = i; break; }
  if (cut < 0) cut = lim;
  pushChunk(out, s, a, cut, max);
  pushChunk(out, s, cut, b, max);
}

/* 목소리 고르기: 이름이 맞으면 그것, 아니면 언어가 맞는 것 가운데 기기 안 목소리(localService)를 먼저.
   기기 안 목소리는 인터넷이 없어도 되고 긴 글에서 멈추는 문제가 적다 */
export function pickVoice(voices, bcp, name) {
  const vs = Array.isArray(voices) ? voices : [];
  if (name) { const hit = vs.find((v) => v && v.name === name); if (hit) return hit; }
  const want = String(bcp || "ko-KR").toLowerCase();
  const base = want.split("-")[0];
  const same = vs.filter((v) => v && String(v.lang || "").toLowerCase().replace("_", "-") === want);
  const near = vs.filter((v) => v && String(v.lang || "").toLowerCase().split(/[-_]/)[0] === base);
  const pool = same.length ? same : near;
  return pool.find((v) => v.localService) || pool[0] || null;
}

/* ---------- 핵심 용어 찾기 ----------
   terms: [{ t: "레디메이드", alias: ["기성품"] }, ...]
   본문을 [문자열 | {term, text}] 조각으로 나눈다. 긴 용어를 먼저 맞추고, 겹치지 않게 한다.
   seen(Set): 이미 표시한 용어. 한 읽기 자료에서 같은 용어는 처음 한 번만 표시한다(신호 원리: 표시가 많으면 신호가 아니다) */
export function findTerms(text, terms, seen) {
  const s = String(text || "");
  const list = [];
  for (const term of terms || []) {
    if (!term || !term.t) continue;
    for (const form of [term.t, ...(term.alias || [])]) if (form && form.length >= 2) list.push({ form, term });
  }
  list.sort((a, b) => b.form.length - a.form.length);
  const marks = [];
  // 긴 용어가 나온 곳(표시했든 이미 봐서 건너뛰었든)은 짧은 용어가 끼어들지 못한다: 「레디메이드」 안의 「레디」
  const taken = [];
  const used = seen || new Set();
  const hit = (i, j) => taken.some((m) => i < m.end && j > m.start);
  for (const { form, term } of list) {
    const latin = /^[A-Za-z]/.test(form);
    let from = 0;
    while (from < s.length) {
      const i = s.indexOf(form, from);
      if (i < 0) break;
      const j = i + form.length;
      from = i + 1;
      // 영문 용어는 단어 경계에서만 (예: "art"가 "article" 안에 맞지 않게)
      if (latin && ((i > 0 && /[A-Za-z]/.test(s[i - 1])) || (j < s.length && /[A-Za-z]/.test(s[j])))) continue;
      if (hit(i, j)) continue;
      taken.push({ start: i, end: j });
      if (!used.has(term.t)) { marks.push({ start: i, end: j, term }); used.add(term.t); }
    }
  }
  marks.sort((a, b) => a.start - b.start);
  const out = [];
  let at = 0;
  for (const m of marks) {
    if (m.start > at) out.push(s.slice(at, m.start));
    out.push({ term: m.term, text: s.slice(m.start, m.end) });
    at = m.end;
  }
  if (at < s.length) out.push(s.slice(at));
  return out;
}

/* ---------- 읽기 자료 글에서 표시 걷어 내기 ----------
   src-reading.jsx의 문단 표시(「## 소제목」「> 인용」「- 목록」「1. 목록」「! 핵심」, 글 안 **강조**·[글자](주소))를 지우고
   읽을 글만 남긴다. 번역·읽어 주기·용어 찾기·지문이 쓴다 */
export function plainOf(raw) {
  return String(raw || "")
    .split("\n")
    .map((l) => l.replace(/^\s*(#{1,6}\s+|>\s?|[-*•]\s+|\d+[.)]\s+|!\s+)/, "").trim())
    .filter(Boolean)
    .join("\n")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\((?:https?:)?[^)\s]*\)/g, "$1")
    .trim();
}

/* ---------- 글 지문 ----------
   쉬운 말 요약은 만들 때의 본문 지문을 함께 둔다. 교사가 고치거나 본문을 다시 짜서 내용이 크게 달라지면
   (글자 세 개 묶음의 겹침 추정값이 SIG_MIN 아래) 요약을 숨긴다. 표시를 바꾸거나 문단을 나눈 정도로는 숨지 않는다.
   MinHash: 해시 함수 SIG_K개의 최솟값 열. 두 지문에서 같은 자리가 같은 비율 ≈ 두 글의 3글자 묶음 자카드 계수 */
export const SIG_K = 48;
export const SIG_MIN = 0.5;
const fnv = (s, seed) => {
  let h = (2166136261 ^ seed) >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
};
export function textSig(text) {
  const t = plainOf(text).replace(/\s+/g, "");
  const grams = new Set();
  for (let i = 0; i + 3 <= t.length; i++) grams.add(t.slice(i, i + 3));
  const sig = new Array(SIG_K).fill(0xffffffff);
  for (const g of grams) for (let k = 0; k < SIG_K; k++) { const h = fnv(g, k * 0x9e3779b1); if (h < sig[k]) sig[k] = h; }
  return grams.size ? sig : [];
}
export function sigSim(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.length !== b.length) return 0;
  let same = 0;
  for (let k = 0; k < a.length; k++) if (a[k] === b[k]) same++;
  return same / a.length;
}
/* 읽기 자료 한 편의 글(제목 제외, 본문 문단 전체) */
export const readingText = (rd) => ((rd && rd.p) || []).map(plainOf).join("\n");

/* 국립국어원 한국수어사전 검색 주소 */
export const sldictUrl = (q) =>
  "https://sldict.korean.go.kr/front/search/searchAllList.do?searchKeyword=" + encodeURIComponent(String(q || "").trim());

/* ---------- 실시간 자막 ----------
   교사 기기가 음성 인식 결과를 misc/liveCaption 문서에 쓰고, 자막을 켠 학생만 구독한다.
   문서: { on, run(방송 번호), lines:[{i, t, at}], interim, at }
   lines는 최근 CAP_KEEP줄만 둔다. 학생 화면은 구독하는 동안 받은 줄을 따로 모아 수업 전체 자막 기록을 만든다. */
export const CAP_KEEP = 40;
export const CAP_MIN_GAP = 1200; // 쓰기 사이 최소 간격(ms): 학생 25명 구독 × 초당 쓰기 수가 읽기 비용이다

export function capInit(run) {
  return { on: true, run: run || "", lines: [], interim: "", seq: 0, at: 0 };
}

/* 확정된 문장 하나를 더한다. 빈 문장은 무시한다 */
export function capPush(st, text, at) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return { ...st, interim: "" };
  const seq = (st.seq || 0) + 1;
  const lines = [...(st.lines || []), { i: seq, t: t.slice(0, 400), at: at || 0 }].slice(-CAP_KEEP);
  return { ...st, lines, seq, interim: "", at: at || st.at };
}

export function capInterim(st, text) {
  return { ...st, interim: String(text || "").replace(/\s+/g, " ").trim().slice(0, 300) };
}

/* 지금 써야 하나: 바뀐 것이 있고 마지막 쓰기에서 CAP_MIN_GAP이 지났을 때.
   확정 줄이 새로 생겼으면 간격을 절반만 기다린다(자막이 늦게 뜨는 것이 더 문제) */
export function capShouldFlush(sent, cur, nowMs) {
  if (!cur) return false;
  const changed = !sent || sent.seq !== cur.seq || sent.interim !== cur.interim || sent.on !== cur.on;
  if (!changed) return false;
  const gap = nowMs - ((sent && sent.sentAt) || 0);
  const newLine = !sent || sent.seq !== cur.seq;
  return gap >= (newLine ? CAP_MIN_GAP / 2 : CAP_MIN_GAP);
}

/* 문서로 보낼 모양 (seq는 문서에 두지 않아도 lines의 i로 알 수 있다) */
export function capDoc(st, nowMs) {
  return { on: !!st.on, run: st.run || "", lines: st.lines || [], interim: st.interim || "", at: nowMs };
}

/* 학생 쪽: 받은 문서에서 새 줄만 골라 기록에 붙인다. 방송 번호가 바뀌면 기록을 새로 시작한다 */
export function capMerge(hist, docV) {
  const h = hist && typeof hist === "object" ? hist : { run: "", lines: [] };
  const d = docV || {};
  const run = String(d.run || "");
  const base = h.run === run ? h.lines : [];
  const last = base.length ? base[base.length - 1].i : 0;
  const add = (d.lines || []).filter((l) => l && l.i > last);
  if (h.run === run && !add.length) return h;
  return { run, lines: [...base, ...add].slice(-2000) };
}

/* ---------- 사용 기록 ----------
   _supUse: { "1차시": { tts: 3, trans: 1, ... , last: ISO } }
   어떤 지원을 몇 번 썼는지만 센다. 무엇을 읽었는지·번역한 글은 남기지 않는다 */
export const USE_KINDS = [
  { k: "tts", label: "읽어 주기" },
  { k: "trans", label: "번역 함께 보기" },
  { k: "gloss", label: "핵심 용어 열기" },
  { k: "easy", label: "쉬운 말 요약 보기" },
  { k: "desc", label: "작품 설명 열기" },
  { k: "descTts", label: "작품 설명 듣기" },
  { k: "cap", label: "자막 받은 분" },
  { k: "dict", label: "말로 입력" },
  { k: "alt", label: "다른 감각 관찰 보기" },
  { k: "memo", label: "내 언어 메모" },
];
const USE_SET = new Set(USE_KINDS.map((x) => x.k));

export function bumpUse(use, session, kind, n, at) {
  if (!USE_SET.has(kind) || !session) return use || {};
  const u = use && typeof use === "object" ? use : {};
  const s = u[session] || {};
  const add = Number.isFinite(n) ? n : 1;
  return { ...u, [session]: { ...s, [kind]: Math.round(((s[kind] || 0) + add) * 100) / 100, last: at || s.last || "" } };
}

/* 쌓아 둔 증가분(acc)을 저장값(use)에 더한다 */
export function mergeUse(use, acc) {
  let out = use && typeof use === "object" ? use : {};
  for (const s of Object.keys(acc || {})) {
    for (const k of Object.keys(acc[s] || {})) {
      if (k === "last") continue;
      out = bumpUse(out, s, k, acc[s][k], acc[s].last);
    }
  }
  return out;
}

export function useTotals(use) {
  const t = {};
  for (const s of Object.keys(use || {})) for (const k of Object.keys(use[s] || {})) if (USE_SET.has(k)) t[k] = (t[k] || 0) + (use[s][k] || 0);
  return t;
}

/* 교사 표·연구 CSV의 한 줄. pid는 연구 탭의 익명 번호를 부른 쪽이 넣는다 */
export function supportRow(ws) {
  const w = ws || {};
  const p = normPrefs(w._sup);
  const diff = prefsDiff(w._sup);
  const tot = useTotals(w._supUse);
  return {
    on: Object.keys(diff),
    lang: p.lang,
    text: p.text,
    contrast: p.contrast,
    used: tot,
    anyUse: Object.values(tot).some((x) => x > 0),
  };
}

const csvCell = (v) => {
  let s = v == null ? "" : String(v);
  // 스프레드시트가 수식으로 읽는 첫 글자(=,+,-,@)를 막는다. 음수는 숫자 그대로 둔다
  if (/^[=+@]/.test(s) || (/^-/.test(s) && !/^-?\d+(\.\d+)?$/.test(s))) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

/* 연구용 CSV. rows: [{ pid, session?, ws }] (학번은 넣지 않는다) */
export function supportCsv(rows) {
  const prefKeys = Object.keys(DEFAULT_PREFS).filter((k) => k !== "v");
  const head = ["pid", ...prefKeys.map((k) => "pref_" + k), ...USE_KINDS.map((x) => "use_" + x.k)];
  const lines = [head.join(",")];
  for (const r of rows || []) {
    const p = normPrefs((r.ws || {})._sup);
    const t = useTotals((r.ws || {})._supUse);
    lines.push([r.pid, ...prefKeys.map((k) => (typeof p[k] === "boolean" ? (p[k] ? 1 : 0) : p[k])), ...USE_KINDS.map((x) => t[x.k] || 0)].map(csvCell).join(","));
  }
  return lines.join("\n");
}

/* 차시별 긴 표 (학생 × 차시 × 지원 종류) */
export function supportCsvLong(rows) {
  const lines = ["pid,session,kind,count"];
  for (const r of rows || []) {
    const u = (r.ws || {})._supUse || {};
    for (const s of Object.keys(u).sort()) for (const x of USE_KINDS) if (u[s][x.k]) lines.push([r.pid, s, x.k, u[s][x.k]].map(csvCell).join(","));
  }
  return lines.join("\n");
}

export const SUPPORT_CODEBOOK = [
  ["pid", "연구 탭과 같은 익명 참여자 번호"],
  ["pref_text", "글자 크기(%). 100·125·150·175·200"],
  ["pref_spacing", "줄·글자 간격 넓게 (1=켬)"],
  ["pref_contrast", "none·high(흰 바탕 고대비)·dark(검은 바탕 고대비)"],
  ["pref_motion", "움직임 줄이기"],
  ["pref_targets", "버튼·입력칸 크게"],
  ["pref_underline", "링크 밑줄"],
  ["pref_tts", "읽어 주기 도구 보이기"],
  ["pref_rate", "읽는 빠르기 배수"],
  ["pref_voice", "고른 목소리 이름(빈 값=자동)"],
  ["pref_lang", "도움 언어 코드(빈 값=쓰지 않음). 출신을 짐작하게 할 수 있어 5명 미만 칸은 보고하지 않는다"],
  ["pref_bilingual", "읽기 자료 번역 바로 함께 보기"],
  ["pref_gloss", "핵심 용어 표시"],
  ["pref_easy", "쉬운 말 요약 먼저 보기"],
  ["pref_desc", "작품 설명 늘 펼치기"],
  ["pref_cap", "실시간 자막 받기"],
  ["pref_capSize", "자막 글자 크기 m·l·xl"],
  ["pref_dict", "말로 입력 버튼 보이기"],
  ["pref_alt", "다른 감각 관찰 방법 보이기"],
  ...USE_KINDS.map((x) => ["use_" + x.k, x.label + " 횟수 (전 차시 합계" + (x.k === "cap" ? ", 단위: 분" : "") + ")"]),
  ["(긴 표) session·kind·count", "차시별·지원 종류별 횟수"],
];
