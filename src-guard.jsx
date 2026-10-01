/* ============================================================
   수업 자료 보호 (2026-10-01)
   학생 화면의 수업 자료(강의 노트 글·도판·도식, 카드 도판, 쪽지시험 문항, 최종 평가의 다른 학생 작품)를
   복사·저장·인쇄하기 어렵게 하고, 캡처 단축키를 누르기 시작하는 순간 화면을 가리며,
   그래도 찍힌 화면에는 학번과 시각이 함께 찍히게(워터마크) 한다. 판정 함수는 src-guard-core.mjs(npm test).

   · 설정: meta/config.v.guard = { copy, shield, mark } (false로 끄지 않은 항목은 켬), guardUpdated, guardHist.
     교사 「차시 공개」 탭의 GuardCard에서 바꾸고, 접속 중인 학생 화면에 바로 반영된다.
   · 학생 화면: StudentApp이 <ContentGuard>를 늘 같은 자리에 한 번 그린다. 감싸는 요소가 아니라 형제 요소라
     켜고 끌 때 학습지 칸이 다시 마운트되지 않는다(저장 전 스케치 획 보존). 교사 화면·전시장·입장 화면에는 걸리지 않는다.
   · 막지 않는 것: 입력칸(input·textarea·select·contenteditable)과 편집기(data-guard="off", 디지털 에스키스 .skx 등) 안의
     복사·잘라내기·오른쪽 버튼 메뉴·끌기. paste 이벤트에는 리스너를 달지 않는다. 붙여넣기는 막지 않고 기록하는 것이
     연구 설계이고(src-app.jsx _paste, 생각해 볼 질문 ask_paste_n), 그 기록은 document 캡처 단계 리스너다.
     이 모듈은 어떤 이벤트도 stopPropagation 하지 않는다.
   · 글 고르기: 보호 중에는 body에 user-select:none, 입력칸·편집기에는 user-select:text를 명시한다(iOS 사파리 입력 보존).
     학습 지원의 떠 있는 도구(「고른 글 읽기」)가 보이면(html[data-ax-float]) 글 고르기를 되살린다. 복사는 계속 막는다.
   · 캡처 가림: 페이지가 받을 수 있는 키만 쓴다(src-guard-core.mjs captureIntent). 가림막은 React 렌더를 거치지 않고
     classList로 바로 붙여, 단축키의 마지막 키(S·PrtSc)를 누르기 전에 그려지게 한다. 창이 포커스를 잃은 동안에는
     걷지 않는다(캡처 도구 화면이 떠 있는 동안). 쪽지시험 중에는 창을 벗어나 있는 동안 문항을 가린다.
   · 막지 못하는 것: 휴대전화 촬영, 화면 녹화, 마우스로 연 캡처 도구, PrintScreen 단독(운영체제가 먼저 찍음),
     브라우저 메뉴로 연 개발자 도구, 확장 프로그램, 로그인 없이 열리는 도판 파일 주소. 그래서 워터마크를 둔다.
   ============================================================ */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { fbStore } from "./src-fb.js";
import { guardOf, guardPatch, markText, markUrl, captureIntent, blockedShortcut, GUARD_SAY, WIPE_TEXT } from "./src-guard-core.mjs";

const IS_MAC = typeof navigator !== "undefined" &&
  /mac|iphone|ipad|ipod/i.test((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "");

/* 글을 쓰는 칸만 센다(체크 상자·라디오·버튼에 초점이 있다고 본문 복사를 풀지 않게) */
const EDIT_SEL = 'textarea,input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=reset]):not([type=range]):not([type=color]):not([type=file]):not([type=image]),[contenteditable]:not([contenteditable="false"])';
/* 편집기: 자체 단축키(Ctrl+S·Ctrl+Shift+Z 등)와 클립보드를 쓰는 곳. 새 편집기는 루트에 data-guard="off"를 단다 */
const OPT_SEL = '[data-guard="off"],.skx,.skh-rp,.skr-win';
const elOf = (n) => (n && n.nodeType === 1 ? n : n && n.parentElement) || null;
const inSel = (n, sel) => { const el = elOf(n); return !!(el && el.closest && el.closest(sel)); };
const editable = (n) => inSel(n, EDIT_SEL);
const optOut = (n) => inSel(n, OPT_SEL);
const free = (n) => editable(n) || optOut(n);
/* 창이 포커스를 잃었거나 가려졌는가 */
const away = () => (typeof document !== "undefined") &&
  (document.visibilityState === "hidden" || (typeof document.hasFocus === "function" && !document.hasFocus()));

const SHIELD_KEYUP_MS = 180;   // 수정 키를 모두 뗀 뒤 가림막을 걷기까지
const SHIELD_FOCUS_MS = 250;   // 창으로 돌아온 뒤
const SHIELD_PRT_MS = 1500;    // PrintScreen 뒤(캡처 도구가 화면을 얼리는 시점까지 버틴다)
const SHIELD_MIN_MS = 600;     // 이보다 일찍은 마우스 움직임으로 걷지 않는다
const SHIELD_HOVER_MS = 2500;  // 창 밖에 포커스가 있을 때는 이만큼 지난 뒤 이 창 위의 마우스 움직임으로만 걷는다
const PRT_REFOCUS_MS = 15000;  // PrintScreen → 캡처 도구 → 돌아오기까지 이 안이면 클립보드를 한 번 더 덮어쓴다
const TOAST_MS = 2200;

/* ---------- 학생 화면 ---------- */

function Watermark({ sid, quiz }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 20000); return () => clearInterval(t); }, []);
  const text = markText(sid, now);
  const bg = useMemo(() => markUrl(text), [text]);
  return <div className={"gd-mark" + (quiz ? " gd-mark-qz" : "")} aria-hidden="true" style={{ backgroundImage: bg }} />;
}

export function ContentGuard({ sid, cfgAll, quiz }) {
  const g = guardOf(cfgAll);
  const shieldRef = useRef(null);
  const stRef = useRef(null);
  const [toast, setToast] = useState("");
  const live = useRef({});
  live.current = { g, quiz: !!quiz };

  /* CSS가 읽는 표시. 학생 화면이 내려가면(나가기·전시장) 지운다 */
  useEffect(() => {
    const root = document.documentElement;
    if (g.copy) root.setAttribute("data-gd-copy", "");
    else root.removeAttribute("data-gd-copy");
    return () => root.removeAttribute("data-gd-copy");
  }, [g.copy]);

  useEffect(() => {
    const st = { up: false, why: null, at: 0, timer: null, prtAt: 0, blurAt: 0, said: {}, toastTimer: null };
    stRef.current = st;
    const now = () => Date.now();

    const say = (key) => {
      if (live.current.quiz) return; // 쪽지시험은 자체 규칙대로 조용히 막고 응시 기록에 적는다
      const text = GUARD_SAY[key];
      if (!text || (st.said[key] && now() - st.said[key] < 1500)) return;
      st.said[key] = now();
      setToast(text);
      if (st.toastTimer) clearTimeout(st.toastTimer);
      st.toastTimer = setTimeout(() => { st.toastTimer = null; setToast(""); }, TOAST_MS);
    };

    /* 가림막: React 상태를 거치지 않고 바로 붙이고 뗀다 */
    const paint = (on) => { const el = shieldRef.current; if (el) el.classList.toggle("on", on); };
    const raise = (why) => {
      st.why = why; st.at = now();
      if (st.timer) { clearTimeout(st.timer); st.timer = null; }
      if (!st.up) { st.up = true; paint(true); }
    };
    /* force: 창이 포커스를 잃은 상태여도 걷는다(마우스가 이 창 위로 돌아온 경우) */
    const lower = (ms, force) => {
      if (!st.up) return;
      if (st.timer) clearTimeout(st.timer);
      st.timer = setTimeout(() => {
        st.timer = null;
        if (!force && away()) return; // 캡처 도구·시작 메뉴가 떠 있거나 쪽지시험 창을 벗어난 동안은 걷지 않는다. 돌아오면 다시 부른다
        st.up = false; st.why = null; paint(false);
      }, ms || 0);
    };
    st.drop = () => { if (st.timer) clearTimeout(st.timer); st.timer = null; st.up = false; st.why = null; paint(false); };

    const wipe = () => {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText && document.hasFocus()) navigator.clipboard.writeText(WIPE_TEXT).catch(() => {});
      } catch (e) {}
    };

    /* 복사·잘라내기: 입력칸·편집기 안의 글이면 그대로 둔다 */
    const selState = () => {
      const a = document.activeElement;
      if (a && editable(a)) return "free";
      const s = document.getSelection ? document.getSelection() : null;
      if (!s || !s.rangeCount || s.isCollapsed) return "none";
      for (let i = 0; i < s.rangeCount; i++) if (!free(s.getRangeAt(i).commonAncestorContainer)) return "guarded";
      return "free";
    };
    const onCopy = (e) => {
      if (!live.current.g.copy || free(e.target)) return;
      const s = selState();
      if (s === "free") return;
      e.preventDefault();
      if (s === "guarded") say("copy");
    };
    const onMenu = (e) => {
      if (!live.current.g.copy || free(e.target)) return;
      e.preventDefault();
      say("copy");
    };
    const onDrag = (e) => {
      if (!live.current.g.copy || free(e.target)) return;
      e.preventDefault();
    };

    const onKeyDown = (e) => {
      const L = live.current;
      const t = e.target, a = document.activeElement;
      if (L.g.shield) {
        const why = captureIntent(e, { mac: IS_MAC, free: free(t) || free(a) });
        if (why) raise(why);
        else if (st.up && !e.metaKey && !e.ctrlKey) lower(0); // 수정 키를 뗀 keyup을 놓쳤을 때
      }
      const b = blockedShortcut(e, { mac: IS_MAC });
      if (!b || optOut(t) || optOut(a)) return;
      if (b === "capture" ? !(L.g.shield || L.g.copy) : !L.g.copy) return;
      e.preventDefault();
      if (b !== "devtools") say(b);
    };
    const onKeyUp = (e) => {
      if (!live.current.g.shield) return;
      if (e.key === "PrintScreen" || e.code === "PrintScreen") {
        // 운영체제가 이미 찍었다. 클립보드의 캡처를 글자로 덮고, 캡처 도구가 화면을 얼리기 전이면 가린 화면이 찍히게 한다
        raise("prt");
        st.prtAt = now();
        wipe();
        lower(SHIELD_PRT_MS);
        return;
      }
      if (st.up && st.why !== "prt" && !e.metaKey && !e.ctrlKey) lower(SHIELD_KEYUP_MS);
    };
    /* 키를 놓친 뒤의 복구. 창이 포커스를 잃은 채라도 마우스가 이 창 위에서 움직이면(캡처 도구 화면은 덮여 있으면
       이 창에 마우스 이벤트가 오지 않는다) 잠시 뒤 걷는다. Windows 키로 시작 메뉴를 열었다가 옆 창으로 옮긴 학생이
       나란히 띄운 강의 노트를 다시 볼 수 있게. 쪽지시험의 창 이탈 가림은 돌아올 때까지 그대로 둔다 */
    const onPointer = (e) => {
      if (!st.up || e.metaKey || e.ctrlKey) return;
      const age = now() - st.at;
      if (age < SHIELD_MIN_MS) return;
      if (!away()) { lower(0); return; }
      if (st.why !== "away" && age >= SHIELD_HOVER_MS) lower(0, true);
    };

    const onBlur = () => {
      st.blurAt = now();
      const L = live.current;
      if (L.quiz && L.g.shield) raise("away");
    };
    const onFocus = () => {
      // Windows 11은 PrintScreen이 캡처 도구를 연다. 그 창에서 고른 캡처는 돌아온 뒤에 클립보드에 있다
      if (st.prtAt && st.blurAt - st.prtAt >= 0 && st.blurAt - st.prtAt < SHIELD_PRT_MS && now() - st.prtAt < PRT_REFOCUS_MS) wipe();
      st.prtAt = 0;
      if (st.up) lower(st.why === "prt" ? SHIELD_PRT_MS : SHIELD_FOCUS_MS);
    };
    const onVis = () => { if (document.visibilityState === "hidden") onBlur(); else if (!away()) onFocus(); };

    const cap = true, capPassive = { capture: true, passive: true };
    document.addEventListener("copy", onCopy, cap);
    document.addEventListener("cut", onCopy, cap);
    document.addEventListener("contextmenu", onMenu, cap);
    document.addEventListener("dragstart", onDrag, cap);
    document.addEventListener("keydown", onKeyDown, cap);
    document.addEventListener("keyup", onKeyUp, cap);
    document.addEventListener("pointerdown", onPointer, capPassive);
    document.addEventListener("pointermove", onPointer, capPassive);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    if (live.current.quiz && live.current.g.shield && away()) raise("away");
    return () => {
      document.removeEventListener("copy", onCopy, cap);
      document.removeEventListener("cut", onCopy, cap);
      document.removeEventListener("contextmenu", onMenu, cap);
      document.removeEventListener("dragstart", onDrag, cap);
      document.removeEventListener("keydown", onKeyDown, cap);
      document.removeEventListener("keyup", onKeyUp, cap);
      document.removeEventListener("pointerdown", onPointer, capPassive);
      document.removeEventListener("pointermove", onPointer, capPassive);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
      if (st.timer) clearTimeout(st.timer);
      if (st.toastTimer) clearTimeout(st.toastTimer);
      stRef.current = null;
    };
  }, []);

  /* 교사가 캡처 가림을 끄면 떠 있던 가림막도 걷는다 */
  useEffect(() => { if (!g.shield && stRef.current) stRef.current.drop(); }, [g.shield]);

  return (
    <>
      {g.mark && <Watermark sid={sid} quiz={!!quiz} />}
      <div ref={shieldRef} className="gd-shield" aria-hidden="true">
        <b>수업 자료 보호</b>
        <span>{sid}</span>
      </div>
      <div className={"gd-toast" + (toast ? " on" : "")} role="status">{toast}</div>
    </>
  );
}

/* 강의 노트 맨 아래의 저작권 경고 문구(저작권법 시행령 제9조 제2호). 학생 화면 문구는 한 문장씩 짧게 */
export function GuardNotice() {
  return (
    <div className="gd-note">
      이 강의 노트의 작품 사진과 인용문은 저작권법 제25조에 따라 수업 목적으로만 이용할 수 있습니다. 복사하거나 캡처해 다른 곳에 올리지 마세요.
    </div>
  );
}

/* ---------- 교사 「차시 공개」 탭의 카드 ---------- */

const ROWS = [
  {
    k: "copy", name: "복사·저장 막기",
    desc: "강의 노트·도판·쪽지시험 문항·다른 학생 작품의 글을 고를 수 없고, 복사·오른쪽 버튼 메뉴·끌어 놓기·인쇄·페이지 저장·개발자 도구 단축키가 막힙니다. 학습 지원의 읽기 도구를 켠 학생은 글을 고를 수 있지만 복사는 막힙니다.",
  },
  {
    k: "shield", name: "캡처 순간 가리기",
    desc: "Windows 키, 입력칸 밖의 Ctrl+Shift, ⌘+Shift를 누르는 순간 화면을 가립니다. Win+Shift+S처럼 마지막 키를 누를 때 찍는 캡처에는 가린 화면이 찍힙니다. PrintScreen을 누르면 클립보드의 캡처를 지웁니다. 쪽지시험 중에는 창을 벗어나 있는 동안 문항을 가립니다.",
  },
  {
    k: "mark", name: "학번 워터마크",
    desc: "화면 전체에 학번과 시각이 옅게 표시됩니다. 휴대전화로 찍은 사진이나 막지 못한 캡처에도 학번이 함께 찍혀 누구 화면인지 알 수 있습니다.",
  },
];
const NAME = Object.fromEntries(ROWS.map((r) => [r.k, r.name]));

const fmtAt = (iso) => {
  const d = new Date(iso || "");
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return (d.getMonth() + 1) + "월 " + d.getDate() + "일 " + p(d.getHours()) + ":" + p(d.getMinutes());
};

export function GuardCard({ cfgAll, setCfgAll, setMsg }) {
  const g = guardOf(cfgAll);
  const hist = cfgAll && Array.isArray(cfgAll.guardHist) ? cfgAll.guardHist : [];
  const [busy, setBusy] = useState(false);
  const set = async (k, on) => {
    const patch = guardPatch(cfgAll, k, on, new Date().toISOString());
    if (!patch || busy) return;
    setBusy(true);
    const ok = await fbStore.setT("config", patch.write, { merge: true });
    setBusy(false);
    if (ok) {
      setCfgAll({ ...(cfgAll || {}), ...patch.next });
      setMsg("「" + NAME[k] + "」를 " + (on ? "켰습니다." : "껐습니다.") + " 접속 중인 학생 화면에 바로 반영됩니다.");
    } else setMsg("설정 저장에 실패했습니다.");
  };
  return (
    <div className="card">
      <div className="card-head"><span className="card-code">보호</span><span className="card-title">수업 자료 보호</span></div>
      <div className="card-body">
        <p style={{ fontSize: 13, marginBottom: 12 }}>
          학생 화면의 수업 자료를 복사하거나 캡처하기 어렵게 합니다. <b>학생이 쓰는 입력칸과 붙여넣기는 막지 않으며</b>, 붙여넣기 기록은 그대로 수집됩니다.
          교사 화면·전시장·입장 화면에는 적용되지 않습니다.
        </p>
        <div className="tbl-scroll"><table className="roster">
          <thead><tr><th>보호</th><th>학생 화면에서 일어나는 일</th><th style={{ width: 110 }}>상태</th></tr></thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={r.k}>
                <td style={{ whiteSpace: "nowrap" }}>{r.name}</td>
                <td style={{ fontSize: 12 }}>{r.desc}</td>
                <td>
                  <div className="seg">
                    <button className={g[r.k] ? "on-ok" : ""} disabled={busy} onClick={() => set(r.k, true)}>켬</button>
                    <button className={!g[r.k] ? "on-no" : ""} disabled={busy} onClick={() => set(r.k, false)}>끔</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <p className="hint" style={{ marginTop: 10 }}>
          브라우저 안에서 할 수 있는 보호입니다. 휴대전화 촬영, 화면 녹화, 마우스로 연 캡처 도구, Windows 11에서 PrintScreen으로 바로 저장되는 캡처 파일,
          브라우저 메뉴로 연 개발자 도구, 확장 프로그램은 막지 못합니다. 이런 경우에 누구 화면인지 알 수 있도록 학번 워터마크를 함께 켜 둡니다.
        </p>
        <p className="hint" style={{ marginTop: 6 }}>
          화면 돋보기(Windows 키와 더하기)를 쓰는 학생은 Windows 키를 누르는 동안 화면이 가려집니다. 불편하면 「캡처 순간 가리기」를 끕니다.
        </p>
        <p className="hint" style={{ marginTop: 6 }}>
          저작권법 제25조 제12항과 시행령 제9조는 학교가 수업 자료를 온라인으로 보낼 때 접근 제한, 복제방지조치, 저작권 경고 문구를 요구합니다.
          경고 문구는 학생 강의 노트 맨 아래에 늘 표시됩니다. 도판 파일 주소(public/img/lessons)는 로그인 없이도 열리므로 접근 제한은 따로 해결해야 합니다.
        </p>
        <p className="hint" style={{ marginTop: 6 }}>
          켜고 끈 시각은 설정 문서(guardHist)에 기록됩니다. 강의 노트 문장을 복사해 붙여넣는 일은 「복사·저장 막기」를 켠 뒤부터 줄어들 수 있으므로,
          붙여넣기 지표를 시기별로 비교할 때 이 시각을 함께 봅니다. 이 기능을 올리기 전부터 열어 둔 학생 화면에는 적용되지 않으니 처음에는 새로고침을 안내합니다.
        </p>
        {hist.length > 0 && (
          <p className="hint" style={{ marginTop: 6 }}>
            최근 변경: {hist.slice(-5).reverse().map((h) => fmtAt(h.at) + " " + (NAME[h.k] || h.k) + " " + (h.on ? "켬" : "끔")).join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}

/* ---------- 스타일 ---------- */

export const GUARD_CSS = `
/* 글 고르기: 수업 자료는 막고, 입력칸과 편집기는 명시적으로 되살린다(iOS 사파리는 조상이 none이면 입력칸도 못 고른다) */
html[data-gd-copy] body{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none}
html[data-gd-copy] :is(input,textarea,[contenteditable]:not([contenteditable="false"]),[data-guard="off"]){-webkit-user-select:text;user-select:text;-webkit-touch-callout:default}
html[data-gd-copy][data-ax-float] body{-webkit-user-select:text;user-select:text}
html[data-gd-copy] img{-webkit-user-drag:none}
/* 학번 워터마크: 화면 위에 덮되 누르기는 통과시킨다. 쪽지시험 화면(z 9999)보다 위 */
.gd-mark{position:fixed;inset:0;z-index:2147482000;pointer-events:none;background-repeat:repeat;opacity:.055}
.gd-mark.gd-mark-qz{opacity:.08}
html[data-ax-contrast="high"] .gd-mark{opacity:.04}
/* 캡처 순간 가림막: 모든 것보다 위, 불투명 */
.gd-shield{position:fixed;inset:0;z-index:2147483000;display:none;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:#fff;color:#111;font-family:var(--sans);pointer-events:none}
.gd-shield.on{display:flex}
.gd-shield b{font-size:18px;font-weight:700}
.gd-shield span{font-size:13px;color:#6e6e6e}
/* 알림 한 줄 */
.gd-toast{position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:2147482500;max-width:calc(100% - 32px);padding:8px 14px;background:#111;color:#fff;font-family:var(--sans);font-size:13px;line-height:1.5;pointer-events:none;opacity:0;visibility:hidden}
.gd-toast.on{opacity:1;visibility:visible}
/* 강의 노트 맨 아래 저작권 경고 문구 */
.gd-note{font-size:12px;color:var(--sub);line-height:1.6;padding:8px 18px 10px;border-top:1px dashed var(--line2)}
/* 인쇄: 학생 화면을 빼고 안내 한 줄만 */
@media print{
  html[data-gd-copy] #root{display:none!important}
  html[data-gd-copy] body::before{content:"수업 자료는 인쇄할 수 없습니다.";display:block;padding:40px 16px;text-align:center;font:700 16px sans-serif;color:#000}
  .gd-mark,.gd-shield,.gd-toast{display:none!important}
}
`;

export function GuardStyle() {
  return <style>{GUARD_CSS}</style>;
}
