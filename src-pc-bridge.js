/* PhotoCraft 연결 스크립트 (public/photocraft/pc-bridge.js로 복사되어 PhotoCraft index.html의 wasm보다 먼저 실행된다).
   PhotoCraft 웹판(storytold/photocraft, MIT/Apache-2.0)은 손대지 않고, 같은 출처의 부모 창(src-pc.jsx)과 postMessage로만 주고받는다.
   - 부모 → PhotoCraft: { pc: 1, type: "open", name, mime, buf }  학생 이미지를 캔버스에 끌어다 놓은 것처럼 연다.
                        { pc: 1, type: "key", key, code, ctrl, shift, alt }  단축키를 보낸다(빠른 내보내기 등).
   - PhotoCraft → 부모: { pc: 1, type: "ready" | "fail" | "export" | "download" | "dirty" }
   PhotoCraft는 저장·내보내기를 <a download> 클릭으로 한다. 이미지 형식(png·jpg·webp)이면 내려받지 않고 부모에게 넘기고,
   작업 파일(.pcraft·.psd 등)은 그대로 내려받게 둔다. 부모 창 없이 열면(새 탭) 아무것도 바꾸지 않는다. */
(function () {
  "use strict";
  if (window.parent === window) return;
  var ORIGIN = location.origin;
  var IMG = /\.(png|jpe?g|webp)$/i;
  var SAVE_KEY = { pref: "Cmd+Alt+Shift+F10", key: "F10", code: "F10", ctrl: true, alt: true, shift: true };
  function post(m, tr) { try { window.parent.postMessage(m, ORIGIN, tr || []); } catch (e) { /* 부모가 닫힘 */ } }

  /* 0. 환경설정: 화면 언어는 영어로 고정한다. 웹판(0.8.2)은 메뉴 글자에 한글 글꼴을 쓰지 못해(fonts/manifest.txt의 글꼴은
     글자 레이어에만 쓰인다) 한국어를 고르면 메뉴가 네모로 보인다. 빠른 내보내기(PNG)에는 단축키를 붙인다
     (부모 창의 「기록지에 저장」 버튼이 이 단축키를 보낸다). 나머지 환경설정은 학생이 바꾼 값을 둔다. */
  var PREFS = "photocraft.preferences";
  try {
    var pr = {};
    try { pr = JSON.parse(localStorage.getItem(PREFS) || "{}") || {}; } catch (e) { pr = {}; }
    pr.interface = pr.interface || {};
    pr.interface.language = "en";
    pr.shortcuts = pr.shortcuts || {};
    pr.shortcuts["file.export.quickExportAsPng"] = SAVE_KEY.pref;
    localStorage.setItem(PREFS, JSON.stringify(pr));
  } catch (e) { /* 저장소가 막힌 브라우저: 영어 화면, 저장은 메뉴로 */ }

  /* 1. 내보내기 가로채기 */
  var click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    var name = this.getAttribute("download") || "";
    var href = this.href || "";
    if (name && href.indexOf("blob:") === 0 && IMG.test(name)) {
      fetch(href).then(function (r) { return r.blob(); }).then(function (b) {
        return b.arrayBuffer().then(function (buf) { post({ pc: 1, type: "export", name: name, mime: b.type, buf: buf }, [buf]); });
      }).catch(function (e) { post({ pc: 1, type: "fail", where: "export", msg: String(e && e.message || e) }); });
      return;
    }
    if (name) post({ pc: 1, type: "download", name: name });
    return click.call(this);
  };

  /* 2. 부모가 보낸 이미지 열기·단축키 */
  function canvas() { return document.getElementById("photocraft_canvas"); }
  function drop(name, mime, buf) {
    var c = canvas();
    if (!c) return false;
    var dt = new DataTransfer();
    dt.items.add(new File([buf], name, { type: mime || "image/png" }));
    var r = c.getBoundingClientRect();
    var at = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
    ["dragenter", "dragover", "drop"].forEach(function (t) {
      c.dispatchEvent(new DragEvent(t, { dataTransfer: dt, bubbles: true, cancelable: true, clientX: at.clientX, clientY: at.clientY }));
    });
    return true;
  }
  /* eframe는 캔버스에서 키를 듣고, 캔버스가 포커스를 받은 뒤에만 받아들인다 */
  function key(m) {
    var c = canvas();
    if (!c) return;
    c.focus();
    c.dispatchEvent(new FocusEvent("focus"));
    var o = { key: m.key, code: m.code, ctrlKey: !!m.ctrl, metaKey: !!m.meta, shiftKey: !!m.shift, altKey: !!m.alt, bubbles: true, cancelable: true };
    c.dispatchEvent(new KeyboardEvent("keydown", o));
    c.dispatchEvent(new KeyboardEvent("keyup", o));
  }
  window.addEventListener("message", function (e) {
    var m = e.data;
    if (e.origin !== ORIGIN || e.source !== window.parent || !m || m.pc !== 1) return;
    if (m.type === "open") post({ pc: 1, type: drop(String(m.name || "image.png"), m.mime, m.buf) ? "opened" : "fail", where: "open" });
    else if (m.type === "key") key(m);
    else if (m.type === "save") key(SAVE_KEY);
  });

  /* 3. 시작 알림: PhotoCraft는 실행되면 #photocraft_loading을 지우고, 실패하면 그 안에 오류 문장을 쓴다 */
  function watch() {
    var done = false;
    var check = function () {
      if (done) return;
      var el = document.getElementById("photocraft_loading");
      if (!el) { done = true; post({ pc: 1, type: "ready" }); return; }
      if (/failed to start/i.test(el.textContent || "")) { done = true; post({ pc: 1, type: "fail", where: "start", msg: (el.textContent || "").trim().slice(0, 300) }); }
    };
    new MutationObserver(check).observe(document.body, { childList: true, subtree: true, characterData: true });
    check();
  }
  if (document.body) watch(); else document.addEventListener("DOMContentLoaded", watch);
  window.addEventListener("error", function (e) { post({ pc: 1, type: "fail", where: "script", msg: String(e && e.message || "") }); });
})();
