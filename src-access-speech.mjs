/* ============================================================
   학습 지원: 브라우저 음성·번역 기능 감싸기 (2026-09-28)
   ------------------------------------------------------------
   · 읽어 주기: Web Speech API speechSynthesis. 문장 조각을 하나씩 말하고(splitSpeech),
     조각이 바뀔 때마다 알려 화면이 그 문장을 강조한다. 크롬 온라인 목소리가 긴 발화에서 멈추는
     문제와 목소리 목록이 늦게 오는 문제를 여기서 처리한다.
   · 말로 입력: Web Speech API SpeechRecognition(크롬·엣지는 webkit 접두어).
     크롬은 인식이 조용하면 스스로 끝나므로, 켜 둔 동안은 다시 시작한다.
     크롬·엣지의 음성 인식은 소리를 브라우저 회사의 서버로 보내 글자로 바꾼다. 그래서 학급 설정에서
     교사가 켜야 쓸 수 있고(accessCfg.dictation), 교사 기기의 실시간 자막도 같은 엔진을 쓴다.
   · 기기 안 번역: Chrome Translator API(크롬 138부터). 글을 밖으로 보내지 않고 이 기기에서 번역한다.
     언어 모델을 처음 내려받을 때는 사용자의 클릭 안에서 create()를 불러야 한다.
     API가 없으면 번역 기능은 조용히 빠지고, 화면에는 용어 사전(미리 넣은 번역)만 남는다.
   · 구글 번역(브라우저 페이지 번역)과 React 충돌 막기: installTranslateGuard.
   이 파일은 React를 쓰지 않는다. 화면은 src-access.jsx.
   ============================================================ */
import { splitSpeech, pickVoice } from "./src-access-core.mjs";

const W = typeof window !== "undefined" ? window : null;

/* ---------- 구글 번역과 React ----------
   브라우저의 페이지 번역은 글자 노드를 <font>로 바꿔 끼운다. React가 원래 노드를 지우거나 그 앞에 끼우려 할 때
   "removeChild/insertBefore: 다른 부모" 오류로 화면 전체가 멈춘다(facebook/react#11538).
   다문화 학생이 페이지 번역을 켜고 기록지를 쓰다 화면이 멈추면 쓰던 내용을 잃을 수 있으므로,
   널리 쓰이는 보호 코드(같은 이슈의 gaearon 제안)로 오류 대신 조용히 넘긴다.
   번역된 부분의 글자는 React가 바꿔도 화면에 늦게 반영될 수 있다: 자주 바뀌는 글(저장 상태)에는 translate="no"를 단다. */
let guarded = false;
export function installTranslateGuard() {
  if (guarded || typeof Node !== "function" || !Node.prototype) return;
  guarded = true;
  const rm = Node.prototype.removeChild;
  // 오류로 멈추는 대신 경고만 남긴다(진짜 버그를 가리지 않게 콘솔에는 기록한다)
  Node.prototype.removeChild = function (child) {
    if (child && child.parentNode !== this) { try { console.warn("[학습 지원] 페이지 번역이 바꾼 노드를 지우지 않고 넘김", child); } catch (e) {} return child; }
    return rm.apply(this, arguments);
  };
  const ins = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function (node, ref) {
    if (ref && ref.parentNode !== this) { try { console.warn("[학습 지원] 페이지 번역이 바꾼 노드 앞에 끼우지 않고 넘김", ref); } catch (e) {} return node; }
    return ins.apply(this, arguments);
  };
}

/* ---------- 읽어 주기 ---------- */
export const ttsSupported = () => !!(W && W.speechSynthesis && W.SpeechSynthesisUtterance);

let voiceCache = [];
export function loadVoices() {
  if (!ttsSupported()) return Promise.resolve([]);
  const now = W.speechSynthesis.getVoices();
  if (now && now.length) { voiceCache = now; return Promise.resolve(now); }
  return new Promise((res) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      voiceCache = W.speechSynthesis.getVoices() || [];
      res(voiceCache);
    };
    W.speechSynthesis.addEventListener("voiceschanged", finish, { once: true });
    setTimeout(finish, 1500); // 사파리·일부 안드로이드는 이 이벤트를 보내지 않는다
  });
}
export const voicesFor = (bcp) => {
  const base = String(bcp || "ko").toLowerCase().split("-")[0];
  return voiceCache.filter((v) => String(v.lang || "").toLowerCase().replace("_", "-").split("-")[0] === base);
};

/* 지금 읽고 있는 것은 화면 전체에 하나뿐이다. 새로 읽기를 시작하면 앞의 것은 멈춘다 */
let current = null;

/* items: [{ text, key }] 읽을 덩어리(문단 등). 덩어리마다 문장 조각으로 나눠 차례로 말한다.
   opts: { lang(bcp), rate, voice(이름), onChunk({item, chunk, idx}), onEnd(finished) }
   돌려주는 것: { stop() } */
export function speak(items, opts) {
  stopSpeaking();
  if (!ttsSupported()) { opts && opts.onEnd && opts.onEnd(false); return { stop() {} }; }
  const o = opts || {};
  const synth = W.speechSynthesis;
  const queue = [];
  (items || []).forEach((it, idx) => {
    for (const c of splitSpeech(it.text)) queue.push({ item: it, chunk: c, idx });
  });
  const voice = pickVoice(voiceCache.length ? voiceCache : synth.getVoices(), o.lang || "ko-KR", o.voice);
  let i = 0;
  let alive = true;
  let keepAlive = null;
  const me = {
    stop() {
      if (!alive) return;
      alive = false;
      clearInterval(keepAlive);
      try { synth.cancel(); } catch (e) {}
      if (current === me) current = null;
      o.onEnd && o.onEnd(false);
    },
  };
  const next = () => {
    if (!alive) return;
    if (i >= queue.length) {
      alive = false;
      clearInterval(keepAlive);
      if (current === me) current = null;
      o.onEnd && o.onEnd(true);
      return;
    }
    const q = queue[i++];
    o.onChunk && o.onChunk(q);
    const u = new W.SpeechSynthesisUtterance(q.chunk.text);
    u.lang = (voice && voice.lang) || o.lang || "ko-KR";
    if (voice) u.voice = voice;
    u.rate = o.rate || 1;
    u.onend = () => next();
    u.onerror = (e) => {
      // 다른 읽기가 끊은 것(interrupted·canceled)은 오류가 아니다
      if (e && (e.error === "interrupted" || e.error === "canceled")) return;
      next();
    };
    synth.speak(u);
  };
  current = me;
  // 크롬: 멈춰 있던 합성기가 새 발화를 받지 않는 일이 있어 한 번 깨운다
  try { synth.cancel(); synth.resume(); } catch (e) {}
  // 크롬 온라인 목소리는 약 15초 넘게 말하면 조용히 멈춘다. 말하는 동안 가끔 pause/resume으로 깨운다(기기 안 목소리는 필요 없다)
  if (voice && voice.localService === false) {
    keepAlive = setInterval(() => {
      if (!alive) return;
      if (synth.speaking && !synth.paused) { try { synth.pause(); synth.resume(); } catch (e) {} }
    }, 10000);
  }
  setTimeout(next, 0);
  return me;
}

export function stopSpeaking() {
  if (current) current.stop();
  else if (ttsSupported()) { try { W.speechSynthesis.cancel(); } catch (e) {} }
}
export const isSpeaking = () => !!current;

/* 문단 요소 안에서 글자 위치(start~end)를 Range로 바꾼다. 용어 표시 버튼처럼 안에 요소가 섞여 있어도
   글자 노드를 차례로 세어 찾는다. DOM을 바꾸지 않으므로 React와 부딪히지 않는다 */
export function rangeIn(el, start, end) {
  if (!el || typeof document === "undefined") return null;
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let pos = 0, n, sNode = null, sOff = 0, eNode = null, eOff = 0;
  while ((n = walker.nextNode())) {
    const len = n.nodeValue.length;
    if (!sNode && start <= pos + len) { sNode = n; sOff = Math.max(0, start - pos); }
    if (sNode && end <= pos + len) { eNode = n; eOff = Math.max(0, end - pos); break; }
    pos += len;
  }
  if (!sNode || !eNode) return null;
  try {
    const r = document.createRange();
    r.setStart(sNode, sOff);
    r.setEnd(eNode, eOff);
    return r;
  } catch (e) { return null; }
}

/* CSS Custom Highlight API로 읽는 문장을 칠한다(크롬 105+, 사파리 17.2+, 파이어폭스 140+). 없으면 아무것도 하지 않는다 */
const HL = "ax-speak";
export function highlightRange(r) {
  try {
    if (!W || !W.CSS || !CSS.highlights || typeof Highlight !== "function") return;
    if (!r) { CSS.highlights.delete(HL); return; }
    CSS.highlights.set(HL, new Highlight(r));
  } catch (e) {}
}

/* ---------- 말로 입력 ---------- */
const SR = W ? (W.SpeechRecognition || W.webkitSpeechRecognition) : null;
export const sttSupported = () => !!SR;

/* 기기 안 음성 인식(크롬 139부터 SpeechRecognition.available/install, processLocally).
   되면 소리를 밖으로 보내지 않는다. "available" | "downloadable" | "downloading" | "unavailable" | "no-api"
   install()은 사용자 클릭 안에서 부른다 */
export async function sttLocalStatus(lang) {
  if (!SR || typeof SR.available !== "function") return "no-api";
  try { return await SR.available({ langs: [lang || "ko-KR"], processLocally: true }); } catch (e) { return "unavailable"; }
}
export async function sttLocalInstall(lang) {
  if (!SR || typeof SR.install !== "function") return false;
  try { return !!(await SR.install({ langs: [lang || "ko-KR"], processLocally: true })); } catch (e) { return false; }
}

/* opts: { lang, persist, onFinal(text), onInterim(text), onState("on"|"off"|"err", msg) }
   persist: 조용한 구간이 길어도 끄지 않는다(교사 자막). 학생의 말로 입력은 조용한 채 다섯 번 끝나면 스스로 꺼진다.
   돌려주는 것: { stop() } */
export function listen(opts) {
  const o = opts || {};
  if (!SR) { o.onState && o.onState("err", "unsupported"); return { stop() {} }; }
  let want = true;
  let rec = null;
  let fails = 0;
  const start = () => {
    rec = new SR();
    rec.lang = o.lang || "ko-KR";
    rec.continuous = true;
    rec.interimResults = true;
    if (o.local && "processLocally" in rec) rec.processLocally = true; // 기기 안 인식이 준비된 경우(sttLocalStatus)
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) { const t = r[0].transcript; if (t && t.trim()) o.onFinal && o.onFinal(t.trim()); }
        else interim += r[0].transcript;
      }
      fails = 0;
      o.onInterim && o.onInterim(interim);
    };
    rec.onerror = (e) => {
      const code = e && e.error;
      // 마이크 권한 거부·서비스 막힘은 다시 시도해도 같다
      if (code === "not-allowed" || code === "service-not-allowed" || code === "audio-capture") {
        want = false;
        o.onState && o.onState("err", code);
      }
      // no-speech·network·aborted는 onend에서 다시 시작한다
    };
    rec.onend = () => {
      o.onInterim && o.onInterim("");
      if (want && (o.persist || fails < 5)) {
        fails++;
        setTimeout(() => { if (want) { try { start(); } catch (e) {} } }, Math.min(2000, 250 * fails));
      }
      else { want = false; o.onState && o.onState("off"); }
    };
    try { rec.start(); o.onState && o.onState("on"); }
    catch (e) { want = false; o.onState && o.onState("err", "start"); }
  };
  start();
  return {
    stop() { want = false; try { rec && rec.stop(); } catch (e) {} },
  };
}

/* 입력칸에 글을 끼운다. React가 관리하는 칸도 값 setter + input 이벤트로 바꾸면 onChange가 불린다 */
export function insertIntoField(el, text) {
  if (!el || !text) return false;
  const tag = el.tagName;
  if (tag !== "TEXTAREA" && !(tag === "INPUT" && /^(text|search|)$/i.test(el.type || ""))) return false;
  if (el.disabled || el.readOnly) return false;
  if (el.closest && el.closest("fieldset:disabled")) return false; // 입력 잠금(src-ws-lock.jsx) 중
  const v = el.value || "";
  const a = typeof el.selectionStart === "number" ? el.selectionStart : v.length;
  const b = typeof el.selectionEnd === "number" ? el.selectionEnd : v.length;
  const before = v.slice(0, a);
  const glue = before && !/\s$/.test(before) ? " " : "";
  // 값을 직접 넣으면 maxLength가 걸리지 않으므로 칸의 글자 수 한도 안으로 자른다
  const room = el.maxLength > 0 ? Math.max(0, el.maxLength - (v.length - (b - a)) - glue.length) : Infinity;
  if (room <= 0) return false;
  text = String(text).slice(0, room);
  const next = before + glue + text + v.slice(b);
  const proto = tag === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
  setter.call(el, next);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  const caret = (before + glue + text).length;
  try { el.setSelectionRange(caret, caret); } catch (e) {}
  return true;
}

/* ---------- 기기 안 번역 ---------- */
const hasTranslator = () => !!(W && "Translator" in W && W.Translator && typeof W.Translator.create === "function");
export const translatorApi = hasTranslator;

/* "available" | "downloadable" | "downloading" | "unavailable" | "no-api"
   기본은 한국어 → 도움 언어. 교사 화면은 학생의 메모를 도움 언어 → 한국어로 읽는다(source를 준다) */
export async function translateStatus(target, source) {
  if (!hasTranslator()) return "no-api";
  try { return await W.Translator.availability({ sourceLanguage: source || "ko", targetLanguage: target }); }
  catch (e) { return "unavailable"; }
}

const translators = new Map();
const pending = new Map();
/* 번역기 만들기. 내려받기가 필요하면 사용자 클릭 안에서 불러야 한다. onProgress(0~1) */
export function getTranslator(target, onProgress, source) {
  if (!hasTranslator()) return Promise.resolve(null);
  const src = source || "ko";
  const key = src + ">" + target;
  if (translators.has(key)) return Promise.resolve(translators.get(key));
  if (pending.has(key)) return pending.get(key);
  const p = W.Translator.create({
    sourceLanguage: src,
    targetLanguage: target,
    monitor(m) { try { m.addEventListener("downloadprogress", (e) => onProgress && onProgress(e.loaded)); } catch (e) {} },
  }).then((t) => { translators.set(key, t); pending.delete(key); return t; })
    .catch(() => { pending.delete(key); return null; });
  pending.set(key, p);
  return p;
}

const cache = new Map(); // "ko>vi\n원문" → 번역
export async function translate(target, text, source) {
  const s = String(text || "").trim();
  if (!s) return "";
  const src = source || "ko";
  const key = src + ">" + target + "\n" + s;
  if (cache.has(key)) return cache.get(key);
  const t = await getTranslator(target, null, src);
  if (!t) return null;
  try {
    const out = await t.translate(s);
    if (cache.size > 500) cache.clear();
    cache.set(key, out);
    return out;
  } catch (e) { return null; }
}
