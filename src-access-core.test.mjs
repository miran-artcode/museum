import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_PREFS, normPrefs, prefsDiff, prefsAttrs, applyPreset, accessCfg, toolsNow,
  splitSpeech, pickVoice, findTerms, sldictUrl, plainOf, textSig, sigSim, SIG_K, SIG_MIN,
  capInit, capPush, capInterim, capShouldFlush, capDoc, capMerge, CAP_KEEP, CAP_MIN_GAP,
  bumpUse, mergeUse, useTotals, supportRow, supportCsv, supportCsvLong,
} from "./src-access-core.mjs";

test("normPrefs: 빈 값·이상한 값은 기본값으로, 가까운 단계로 맞춘다", () => {
  assert.deepEqual(normPrefs(null), { ...DEFAULT_PREFS });
  const p = normPrefs({ text: 160, rate: 1.4, contrast: "neon", lang: "xx", cap: "yes", voice: 3 });
  assert.equal(p.text, 150);
  assert.equal(p.rate, 1.5);
  assert.equal(p.contrast, "none");
  assert.equal(p.lang, "");
  assert.equal(p.cap, false);
  assert.equal(p.voice, "");
  assert.equal(normPrefs({ lang: "vi" }).lang, "vi");
});

test("prefsDiff·prefsAttrs: 기본값과 다른 것만, 켜진 것만 속성으로", () => {
  assert.deepEqual(prefsDiff({}), {});
  assert.deepEqual(prefsDiff({ text: 150, cap: true }), { text: 150, cap: true });
  const a = prefsAttrs({ text: 125, contrast: "dark", cap: true, capSize: "l" });
  assert.equal(a["data-ax-text"], "125");
  assert.equal(a["data-ax-contrast"], "dark");
  assert.equal(a["data-ax-cap"], "l");
  assert.equal(a["data-ax-spacing"], null);
});

test("applyPreset: 묶음은 켜기만 하고 다른 설정은 지킨다", () => {
  const p = applyPreset({ lang: "ru", text: 200 }, "listen");
  assert.equal(p.tts, true);
  assert.equal(p.lang, "ru");
  assert.equal(p.text, 200);
  assert.deepEqual(applyPreset({ text: 125 }, "없음"), normPrefs({ text: 125 }));
});

test("toolsNow: 학급 허용과 쪽지시험 중인지에 따라 도구를 거른다", () => {
  const p = { tts: true, lang: "vi", bilingual: true, gloss: true, easy: true, dict: true, alt: true, cap: true };
  const cfg = accessCfg({ access: { dictation: true } });
  const inLesson = toolsNow(p, cfg, "lesson");
  assert.equal(inLesson.tts, true);
  assert.equal(inLesson.bilingual, true);
  assert.equal(inLesson.dict, true);
  const inQuiz = toolsNow(p, cfg, "quiz");       // 시험 중에는 보기 설정과 자막만
  assert.equal(inQuiz.tts, false);
  assert.equal(inQuiz.translate, false);
  assert.equal(inQuiz.gloss, false);
  assert.equal(inQuiz.dict, false);
  assert.equal(inQuiz.cap, true);
  const noTr = toolsNow(p, accessCfg({ access: { translate: false } }), "lesson");
  assert.equal(noTr.translate, false);
  assert.equal(noTr.dict, false, "말로 입력은 교사가 켜야 한다(기본 꺼짐)");
});

test("splitSpeech: 문장 단위, 원문 위치 보존, 긴 문장은 쉼표·띄어쓰기에서 자른다", () => {
  const t = "레디메이드는 기성품입니다. 뒤샹은 왜 변기를 골랐을까요?\n「샘」을 봅시다!";
  const xs = splitSpeech(t);
  assert.deepEqual(xs.map((x) => x.text), ["레디메이드는 기성품입니다.", "뒤샹은 왜 변기를 골랐을까요?", "「샘」을 봅시다!"]);
  for (const x of xs) assert.equal(t.slice(x.start, x.end), x.text);
  const long = ("가나다라마바사 ".repeat(40)).trim() + ".";
  const ys = splitSpeech(long, 60);
  assert.ok(ys.length > 3);
  for (const y of ys) { assert.ok(y.text.length <= 60); assert.equal(long.slice(y.start, y.end), y.text); }
  assert.deepEqual(splitSpeech(""), []);
  assert.deepEqual(splitSpeech("마침표 없는 글").map((x) => x.text), ["마침표 없는 글"]);
});

test("pickVoice: 이름 → 같은 언어의 기기 안 목소리 → 같은 언어", () => {
  const vs = [
    { name: "Google 한국의", lang: "ko-KR", localService: false },
    { name: "Microsoft Heami", lang: "ko-KR", localService: true },
    { name: "Microsoft An", lang: "vi-VN", localService: true },
  ];
  assert.equal(pickVoice(vs, "ko-KR").name, "Microsoft Heami");
  assert.equal(pickVoice(vs, "ko-KR", "Google 한국의").name, "Google 한국의");
  assert.equal(pickVoice(vs, "vi").name, "Microsoft An");
  assert.equal(pickVoice(vs, "ru-RU"), null);
  assert.equal(pickVoice(null, "ko-KR"), null);
});

test("findTerms: 긴 용어 먼저, 겹치지 않게, 한 번만", () => {
  const terms = [{ t: "레디메이드" }, { t: "레디" }, { t: "아카이브", alias: ["archive"] }];
  const seen = new Set();
  const segs = findTerms("레디메이드와 아카이브. 다시 레디메이드.", terms, seen);
  const marked = segs.filter((s) => typeof s !== "string").map((s) => s.text);
  assert.deepEqual(marked, ["레디메이드", "아카이브"]);
  assert.equal(segs.map((s) => (typeof s === "string" ? s : s.text)).join(""), "레디메이드와 아카이브. 다시 레디메이드.");
  // 다음 문단에서는 이미 본 용어를 다시 표시하지 않는다
  const next = findTerms("레디메이드", terms, seen);
  assert.deepEqual(next, ["레디메이드"]);
  // 영문 별칭은 단어 경계에서만
  const en = findTerms("archives and archive", [{ t: "아카이브", alias: ["archive"] }], new Set());
  assert.equal(en.filter((s) => typeof s !== "string")[0].text, "archive");
  assert.equal(en[0], "archives and ");
});

test("plainOf: 문단 표시와 글 안 표시를 걷어 낸다", () => {
  assert.equal(plainOf("## 소제목"), "소제목");
  assert.equal(plainOf("> 인용 한 줄\n> 출처: 누구"), "인용 한 줄\n출처: 누구");
  assert.equal(plainOf("- 가\n- 나"), "가\n나");
  assert.equal(plainOf("1. 첫째\n2) 둘째"), "첫째\n둘째");
  assert.equal(plainOf("! 핵심 문장"), "핵심 문장");
  assert.equal(plainOf("**강조**와 [테이트](https://www.tate.org.uk/)"), "강조와 테이트");
  assert.equal(plainOf("그냥 문장입니다."), "그냥 문장입니다.");
  assert.equal(plainOf(null), "");
});

test("textSig·sigSim: 표시만 바뀐 글은 비슷하고, 다른 글은 다르다", () => {
  const a = "뒤샹은 1917년 뉴욕 독립미술가협회 전시에 R. Mutt라는 이름으로 소변기를 출품했습니다. 협회는 이를 전시하지 않았습니다.";
  const b = "## 출품\n**뒤샹**은 1917년 뉴욕 독립미술가협회 전시에 R. Mutt라는 이름으로 소변기를 출품했습니다.\n\n협회는 이를 전시하지 않았습니다.";
  const c = "사진의 지표성은 대상에서 반사된 빛이 감광면에 닿아 생긴 흔적이라는 성질을 말합니다. 퍼스의 기호 분류에서 왔습니다.";
  const sa = textSig(a), sb = textSig(b), sc = textSig(c);
  assert.equal(sa.length, SIG_K);
  assert.ok(sigSim(sa, sb) >= SIG_MIN, "표시만 다른 글: " + sigSim(sa, sb));
  assert.ok(sigSim(sa, sc) < SIG_MIN, "다른 글: " + sigSim(sa, sc));
  assert.equal(sigSim(sa, sa), 1);
  assert.equal(sigSim([], sa), 0);
  assert.deepEqual(textSig(""), []);
});

test("sldictUrl: 한국수어사전 검색 주소", () => {
  assert.equal(sldictUrl(" 전시 "), "https://sldict.korean.go.kr/front/search/searchAllList.do?searchKeyword=%EC%A0%84%EC%8B%9C");
});

test("자막: 줄 쌓기, 보관 한도, 쓰기 간격", () => {
  let st = capInit("r1");
  st = capPush(st, "  안녕하세요  여러분 ", 10);
  st = capPush(st, "   ", 11);
  assert.equal(st.lines.length, 1);
  assert.equal(st.lines[0].t, "안녕하세요 여러분");
  for (let i = 0; i < CAP_KEEP + 5; i++) st = capPush(st, "줄 " + i, 20 + i);
  assert.equal(st.lines.length, CAP_KEEP);
  assert.equal(st.lines[st.lines.length - 1].t, "줄 " + (CAP_KEEP + 4));
  st = capInterim(st, "지금 말하는 중");
  const sent = { ...st, sentAt: 1000 };
  assert.equal(capShouldFlush(sent, st, 1000 + CAP_MIN_GAP), false, "바뀐 것이 없으면 쓰지 않는다");
  const st2 = capInterim(st, "지금 말하는 중인 문장");
  assert.equal(capShouldFlush(sent, st2, 1000 + CAP_MIN_GAP - 1), false);
  assert.equal(capShouldFlush(sent, st2, 1000 + CAP_MIN_GAP), true);
  const st3 = capPush(st2, "새 문장", 99);
  assert.equal(capShouldFlush(sent, st3, 1000 + CAP_MIN_GAP / 2), true, "새 줄은 절반 간격이면 쓴다");
  const d = capDoc(st3, 5);
  assert.deepEqual(Object.keys(d).sort(), ["at", "interim", "lines", "on", "run"]);
});

test("capMerge: 새 줄만 붙이고, 방송이 바뀌면 새로 시작", () => {
  let h = capMerge(null, { run: "a", lines: [{ i: 1, t: "하나" }, { i: 2, t: "둘" }] });
  assert.deepEqual(h.lines.map((l) => l.t), ["하나", "둘"]);
  const same = capMerge(h, { run: "a", lines: [{ i: 1, t: "하나" }, { i: 2, t: "둘" }] });
  assert.equal(same, h, "새 줄이 없으면 같은 객체");
  h = capMerge(h, { run: "a", lines: [{ i: 2, t: "둘" }, { i: 3, t: "셋" }] });
  assert.deepEqual(h.lines.map((l) => l.t), ["하나", "둘", "셋"]);
  h = capMerge(h, { run: "b", lines: [{ i: 1, t: "새 수업" }] });
  assert.deepEqual(h.lines.map((l) => l.t), ["새 수업"]);
});

test("사용 기록: 알 수 없는 종류는 버리고, 증가분을 합친다", () => {
  let u = bumpUse({}, "1차시", "tts", 1, "t1");
  u = bumpUse(u, "1차시", "tts", 2, "t2");
  u = bumpUse(u, "1차시", "hack", 5, "t3");
  assert.deepEqual(u, { "1차시": { tts: 3, last: "t2" } });
  const merged = mergeUse(u, { "1차시": { trans: 1, last: "t4" }, "2차시": { cap: 1.5, last: "t5" } });
  assert.deepEqual(useTotals(merged), { tts: 3, trans: 1, cap: 1.5 });
});

test("supportRow·CSV: 학번 없이 pid로, 수식 문자 막기, 음수는 숫자로", () => {
  const ws = { _sup: { text: 150, lang: "vi", cap: true }, _supUse: { "1차시": { tts: 2, cap: 12 } } };
  const r = supportRow(ws);
  assert.deepEqual(r.on.sort(), ["cap", "lang", "text"]);
  assert.equal(r.anyUse, true);
  const csv = supportCsv([{ pid: "P01", ws }, { pid: "=cmd", ws: {} }]);
  const [head, a, b] = csv.split("\n");
  assert.ok(head.startsWith("pid,pref_text,"));
  assert.ok(a.startsWith("P01,150,"));
  assert.ok(b.startsWith("'=cmd,100,"));
  const long = supportCsvLong([{ pid: "P01", ws }]);
  assert.deepEqual(long.split("\n"), ["pid,session,kind,count", "P01,1차시,tts,2", "P01,1차시,cap,12"]);
});
