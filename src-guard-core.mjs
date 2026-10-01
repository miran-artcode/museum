/* ============================================================
   수업 자료 보호: 순수 계산 (npm test: src-guard-core.test.mjs)
   화면 쪽(이벤트·가림막·워터마크·교사 카드)은 src-guard.jsx.

   설정: meta/config.v.guard = { copy, shield, mark }
     copy   복사·저장 막기 (글 고르기·복사·오른쪽 버튼 메뉴·끌어 놓기·인쇄·페이지 저장·개발자 도구 단축키)
     shield 캡처 순간 가리기 (캡처 단축키를 누르기 시작하면 화면을 가림, 쪽지시험 중에는 창을 벗어난 동안 가림)
     mark   학번 워터마크
   값이 없거나 true가 아니어도 false로 끄지 않은 항목은 켠 것으로 본다(교사가 끄지 않으면 보호한다).
   guardUpdated: 마지막으로 바꾼 시각, guardHist: [{ at, k, on }] 켜고 끈 기록(연구 절차 기술용, 60건까지)
   ============================================================ */

export const GUARD_KEYS = ["copy", "shield", "mark"];
export const GUARD_HIST_MAX = 60;

export function guardOf(cfg) {
  const g = cfg && cfg.guard && typeof cfg.guard === "object" ? cfg.guard : {};
  return { copy: g.copy !== false, shield: g.shield !== false, mark: g.mark !== false };
}

/* 한 항목을 바꾼 설정. 지금 값과 같으면 null(쓰지 않는다).
   write: 설정 문서에 merge로 쓸 조각. guard에는 바꾼 항목 하나만 담는다(Firestore merge는 맵을 깊게 합치므로,
          다른 창에서 그 사이 바꾼 항목을 이 창의 옛 값으로 되돌리지 않는다).
   next: 이 화면의 설정 사본에 얹을 값 */
export function guardPatch(cfg, k, on, at) {
  if (!GUARD_KEYS.includes(k)) throw new Error("unknown guard key: " + k);
  const cur = guardOf(cfg);
  if (cur[k] === !!on) return null;
  const prev = cfg && Array.isArray(cfg.guardHist) ? cfg.guardHist : [];
  const guardHist = [...prev, { at, k, on: !!on }].slice(-GUARD_HIST_MAX);
  const raw = cfg && cfg.guard && typeof cfg.guard === "object" ? cfg.guard : {};
  return {
    write: { guard: { [k]: !!on }, guardUpdated: at, guardHist },
    next: { guard: { ...raw, [k]: !!on }, guardUpdated: at, guardHist },
  };
}

/* ---------- 워터마크 ---------- */

const pad2 = (n) => String(n).padStart(2, "0");

/* 학번과 분 단위 시각: 찍힌 사진이 언제 누구 화면이었는지 알 수 있게 */
export function markText(sid, when) {
  const d = when instanceof Date ? when : new Date(when);
  const t = Number.isNaN(d.getTime()) ? "" : " · " + pad2(d.getMonth() + 1) + "/" + pad2(d.getDate()) + " " + pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  return String(sid == null ? "" : sid) + t;
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/* 비스듬한 글 두 개를 엇갈려 놓은 무늬 한 칸(320×220). 학번 8자리 + 시각까지 칸 경계에서 잘리지 않는 자리다.
   CSS 배경으로 쓰는 SVG는 페이지 웹 글꼴을 못 쓰므로 운영체제 글꼴을 차례로 적는다(숫자·기호만 쓴다) */
export const MARK_W = 320, MARK_H = 220;
export function markSvg(text) {
  const t = esc(text);
  const one = (x, y) => `<text x="${x}" y="${y}" transform="rotate(-24 ${x} ${y})" text-anchor="middle" dominant-baseline="middle">${t}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${MARK_W}" height="${MARK_H}" viewBox="0 0 ${MARK_W} ${MARK_H}">` +
    `<g font-family="Segoe UI,Malgun Gothic,Apple SD Gothic Neo,Noto Sans KR,Arial,sans-serif" font-size="14" font-weight="700" fill="#000">` +
    one(80, 60) + one(240, 165) + `</g></svg>`;
}
export const markUrl = (text) => `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(markSvg(text))}")`;

/* ---------- 키 판정 ---------- */

/* 키 이름: 한글 입력 상태에서는 e.key가 「ㄴ」처럼 오므로 자판 위치(e.code)를 먼저 본다 */
export function letterOf(e) {
  const code = String((e && e.code) || "");
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  const k = String((e && e.key) || "");
  return /^[a-z]$/i.test(k) ? k.toUpperCase() : "";
}

/* 캡처를 시작하는 키 입력인가. 페이지가 받을 수 있는 키만 본다.
   - "prt": PrintScreen. 운영체제가 먼저 찍으므로 막지 못하고, 뒤처리(가림·클립보드 덮어쓰기)만 한다.
   - "key": Windows 키(Win+Shift+S·Win+PrtSc·게임 바 Win+Alt+PrtSc·Win+G), macOS는 ⌘+Shift(⌘+Shift+3/4/5).
            Windows 키는 누르는 순간 페이지에 오고 뒤의 S·PrtSc는 운영체제가 가져가므로, 이때 가리면 빈 화면이 찍힌다.
   - "combo": Ctrl+Shift(엣지 웹 캡처 Ctrl+Shift+S, 알캡처 Ctrl+Shift+A/C/D/W, 크롬북 Ctrl+Shift+창 보기).
            마지막 키는 프로그램이 가져가므로, 그 키보다 먼저 가림막이 뜨게 한다(찍히는 시점은 프로그램마다 다르다).
            글을 고칠 때도 쓰는 조합이라 초점이 입력칸·편집기 안이면(free) 보지 않는다.
   opt: { mac, free } */
export function captureIntent(e, opt) {
  const o = opt || {};
  const k = String((e && e.key) || "");
  if (k === "PrintScreen" || (e && e.code === "PrintScreen")) return "prt";
  if (o.mac) return e.metaKey && e.shiftKey ? "key" : null;
  if (k === "Meta" || k === "OS" || e.metaKey) return "key";
  if (e.ctrlKey && e.shiftKey && !e.altKey && !o.free) return "combo";
  return null;
}

/* 막을 단축키. 대상이 편집기(data-guard="off") 안이면 부르지 않는다(편집기가 같은 단축키를 쓸 수 있다).
   - "devtools": F12, Ctrl+Shift+I/J/C, Ctrl+U(소스 보기), macOS ⌘+⌥+I/J/C/U
   - "save": Ctrl+S(페이지 저장 대화 상자. 기록은 자동 저장된다)
   - "print": Ctrl+P, Ctrl+Shift+P
   - "capture": Ctrl+Shift+S, Ctrl+Shift+X(브라우저 캡처·웹 선택 단축키). 글 편집에는 쓰지 않는 조합이라 입력칸 안에서도 막는다.
     키를 페이지에 먼저 넘기는 브라우저에서만 효과가 있다. 엣지는 이 둘을 페이지보다 먼저 가져가므로(헤드리스 Edge로 확인)
     막지 못하고, 그 앞의 Ctrl+Shift에서 뜨는 가림막(captureIntent "combo")에 맡긴다.
   opt: { mac } */
export function blockedShortcut(e, opt) {
  const o = opt || {};
  const k = String((e && e.key) || "");
  if (k === "F12" || (e && e.code === "F12")) return "devtools";
  const L = letterOf(e);
  if (!L) return null;
  const mod = o.mac ? !!e.metaKey : !!e.ctrlKey;
  if (!mod) return null;
  if (o.mac && e.altKey && "IJCU".includes(L)) return "devtools";
  if (e.altKey) return null;
  if (e.shiftKey) {
    if (L === "I" || L === "J" || L === "C") return "devtools";
    if (L === "P") return "print";
    if (L === "S" || L === "X") return "capture";
    return null;
  }
  if (L === "U") return "devtools";
  if (L === "S") return "save";
  if (L === "P") return "print";
  return null;
}

/* 학생 화면 알림 문구 (CLAUDE.md 문장 규칙) */
export const GUARD_SAY = {
  copy: "수업 자료는 복사하거나 저장할 수 없습니다.",
  save: "기록은 자동으로 저장됩니다.",
  print: "수업 자료는 인쇄할 수 없습니다.",
  capture: "수업 자료는 캡처할 수 없습니다.",
};
/* PrintScreen 뒤 클립보드에 덮어쓸 글. 붙여넣기 기록 하한(PASTE_MIN 20자)보다 짧아 학습지에 붙여도 연구 자료에 들어가지 않는다 */
export const WIPE_TEXT = "수업 자료 보호";
