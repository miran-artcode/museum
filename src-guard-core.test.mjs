import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GUARD_KEYS, GUARD_HIST_MAX, guardOf, guardPatch, markText, markSvg, markUrl, letterOf,
  captureIntent, blockedShortcut, GUARD_SAY, WIPE_TEXT,
} from "./src-guard-core.mjs";

const key = (k, o = {}) => ({ key: k, code: o.code || "", ctrlKey: !!o.ctrl, shiftKey: !!o.shift, altKey: !!o.alt, metaKey: !!o.meta });
const letter = (L, o = {}) => key(o.key || L.toLowerCase(), { ...o, code: "Key" + L });

test("guardOf: 끄지 않은 항목은 켠 것으로 본다", () => {
  assert.deepEqual(guardOf(null), { copy: true, shield: true, mark: true });
  assert.deepEqual(guardOf({}), { copy: true, shield: true, mark: true });
  assert.deepEqual(guardOf({ guard: "on" }), { copy: true, shield: true, mark: true }, "객체가 아니면 기본값");
  assert.deepEqual(guardOf({ guard: { copy: false } }), { copy: false, shield: true, mark: true });
  assert.deepEqual(guardOf({ guard: { copy: false, shield: false, mark: false } }), { copy: false, shield: false, mark: false });
  assert.deepEqual(guardOf({ guard: { mark: null, shield: 0 } }), { copy: true, shield: true, mark: true }, "false만 끈다");
});

test("guardPatch: 바뀐 항목만 쓰고, 기록은 60건까지", () => {
  assert.equal(guardPatch({}, "copy", true, "t0"), null, "이미 켬이면 쓰지 않는다");
  const p = guardPatch({ guard: { mark: false }, guardHist: [{ at: "t0", k: "mark", on: false }] }, "copy", false, "t1");
  assert.deepEqual(p.write.guard, { copy: false }, "쓰는 조각에는 바꾼 항목 하나만(다른 창의 변경을 덮지 않게)");
  assert.deepEqual(p.next.guard, { mark: false, copy: false }, "화면 사본은 기존 값에 얹는다");
  assert.deepEqual(guardOf(p.next), { copy: false, shield: true, mark: false });
  assert.equal(p.write.guardUpdated, "t1");
  assert.deepEqual(p.write.guardHist, [{ at: "t0", k: "mark", on: false }, { at: "t1", k: "copy", on: false }]);
  assert.deepEqual(p.next.guardHist, p.write.guardHist);
  const many = Array.from({ length: GUARD_HIST_MAX }, (_, i) => ({ at: "h" + i, k: "copy", on: i % 2 === 0 }));
  const q = guardPatch({ guard: { shield: false }, guardHist: many }, "shield", true, "last");
  assert.equal(q.write.guardHist.length, GUARD_HIST_MAX);
  assert.equal(q.write.guardHist[0].at, "h1");
  assert.deepEqual(q.write.guardHist[GUARD_HIST_MAX - 1], { at: "last", k: "shield", on: true });
  assert.throws(() => guardPatch({}, "paste", false, "t"));
  assert.deepEqual(GUARD_KEYS, ["copy", "shield", "mark"]);
});

test("워터마크 글과 무늬", () => {
  assert.equal(markText("20999", new Date(2026, 9, 1, 9, 5)), "20999 · 10/01 09:05");
  assert.equal(markText("20999", "잘못된 시각"), "20999");
  const svg = markSvg(`<a&"'>`);
  assert.ok(svg.includes("&lt;a&amp;&quot;&#39;&gt;"), "글을 이스케이프한다");
  assert.equal((svg.match(/<text /g) || []).length, 2, "엇갈린 글 두 개");
  assert.ok(!svg.includes("<a&"));
  const url = markUrl("20999 · 10/01 09:05");
  assert.ok(url.startsWith('url("data:image/svg+xml;charset=utf-8,%3Csvg'));
  assert.ok(!/["\s]/.test(url.slice(5, -2)), "url() 안에 따옴표·공백이 없다");
});

test("letterOf: 한글 입력 상태에서도 자판 위치로 읽는다", () => {
  assert.equal(letterOf({ key: "ㄴ", code: "KeyS" }), "S");
  assert.equal(letterOf({ key: "s" }), "S");
  assert.equal(letterOf({ key: "ˆ", code: "KeyI" }), "I", "macOS ⌥ 조합");
  assert.equal(letterOf({ key: "Shift", code: "ShiftLeft" }), "");
  assert.equal(letterOf({ key: "4", code: "Digit4" }), "");
});

test("captureIntent: Windows", () => {
  const W = { mac: false, free: false };
  assert.equal(captureIntent(key("Meta", { meta: true, code: "MetaLeft" }), W), "key", "Windows 키를 누르는 순간");
  assert.equal(captureIntent(key("OS"), W), "key", "옛 파이어폭스 이름");
  assert.equal(captureIntent(key("Shift", { meta: true, shift: true }), W), "key", "Win을 누른 채 Shift");
  assert.equal(captureIntent(key("Shift", { ctrl: true, shift: true }), W), "combo", "Ctrl+Shift(엣지 웹 캡처·알캡처)");
  assert.equal(captureIntent(key("Shift", { ctrl: true, shift: true }), { mac: false, free: true }), null, "입력칸 안의 Ctrl+Shift는 글 편집");
  assert.equal(captureIntent(key("Shift", { ctrl: true, shift: true, alt: true }), W), null, "AltGr 조합은 아님");
  assert.equal(captureIntent(key("PrintScreen", { code: "PrintScreen" }), W), "prt");
  assert.equal(captureIntent(key("Unidentified", { code: "PrintScreen" }), W), "prt");
  assert.equal(captureIntent(key("a"), W), null);
  assert.equal(captureIntent(key("Control", { ctrl: true }), W), null, "Ctrl 하나만은 아님");
  assert.equal(captureIntent(key("Alt", { alt: true }), W), null, "한/영 키가 Alt로 오는 자판이 있어 Alt는 보지 않는다");
});

test("captureIntent: macOS는 ⌘+Shift만", () => {
  const M = { mac: true, free: false };
  assert.equal(captureIntent(key("Meta", { meta: true }), M), null, "⌘ 하나는 복사·붙여넣기에도 쓴다");
  assert.equal(captureIntent(key("Shift", { meta: true, shift: true }), M), "key");
  assert.equal(captureIntent(key("4", { meta: true, shift: true, code: "Digit4" }), M), "key");
  assert.equal(captureIntent(key("Shift", { ctrl: true, shift: true }), M), null);
});

test("blockedShortcut: Windows", () => {
  const W = { mac: false };
  assert.equal(blockedShortcut(key("F12", { code: "F12" }), W), "devtools");
  for (const L of ["I", "J", "C"]) assert.equal(blockedShortcut(letter(L, { ctrl: true, shift: true }), W), "devtools", "Ctrl+Shift+" + L);
  assert.equal(blockedShortcut(letter("U", { ctrl: true }), W), "devtools");
  assert.equal(blockedShortcut(letter("S", { ctrl: true }), W), "save");
  assert.equal(blockedShortcut(letter("S", { ctrl: true, key: "ㄴ" }), W), "save", "한글 입력 상태");
  assert.equal(blockedShortcut(letter("P", { ctrl: true }), W), "print");
  assert.equal(blockedShortcut(letter("P", { ctrl: true, shift: true }), W), "print");
  assert.equal(blockedShortcut(letter("S", { ctrl: true, shift: true }), W), "capture", "엣지 웹 캡처");
  assert.equal(blockedShortcut(letter("X", { ctrl: true, shift: true }), W), "capture", "엣지 웹 선택");
  // 막지 않는 것: 복사·붙여넣기·되돌리기는 copy 이벤트와 입력칸 몫
  for (const L of ["C", "V", "X", "Z", "A", "F"]) assert.equal(blockedShortcut(letter(L, { ctrl: true }), W), null, "Ctrl+" + L);
  assert.equal(blockedShortcut(letter("Z", { ctrl: true, shift: true }), W), null, "다시 실행");
  assert.equal(blockedShortcut(letter("S", { ctrl: true, alt: true }), W), null);
  assert.equal(blockedShortcut(letter("S", { meta: true }), W), null, "Windows 키+S는 검색");
  assert.equal(blockedShortcut(letter("S"), W), null);
});

test("blockedShortcut: macOS는 ⌘ 기준", () => {
  const M = { mac: true };
  assert.equal(blockedShortcut(letter("S", { meta: true }), M), "save");
  assert.equal(blockedShortcut(letter("P", { meta: true }), M), "print");
  assert.equal(blockedShortcut(letter("U", { meta: true }), M), "devtools");
  for (const L of ["I", "J", "C", "U"]) assert.equal(blockedShortcut(letter(L, { meta: true, alt: true, key: "ˆ" }), M), "devtools", "⌘+⌥+" + L);
  assert.equal(blockedShortcut(letter("S", { ctrl: true }), M), null, "macOS의 Ctrl+S는 저장이 아님");
  assert.equal(blockedShortcut(letter("C", { meta: true }), M), null);
});

test("학생 화면 문구와 클립보드 덮어쓰기 글", () => {
  for (const k of ["copy", "save", "print", "capture"]) assert.ok(GUARD_SAY[k] && !GUARD_SAY[k].includes("—"), k);
  assert.ok(WIPE_TEXT.trim().length > 0 && WIPE_TEXT.trim().length < 20, "붙여넣기 기록 하한(20자)보다 짧다");
});
