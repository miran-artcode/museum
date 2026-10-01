import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCandidates, draftExpo, publishDoc, visibleWorks, planHall, findWorkByNo, moveWork, moveSection,
  fixtureOfMode, noKey, plateRows, arLink, HALL, UNSORTED, DEFAULT_NOTICE,
} from "./src-ar-expo.mjs";

const ATT = ["고발", "경고", "공감", "기록", "질문"];
const HINTS = { "기록": "사라질 것을 기록한다" };

const ws = (o = {}) => ({
  "s7x.show": "공개", "s7x.no": "A-01", "s7x.img": { ref: "s7x.img.1" },
  "s6b.title": "오른손", "s6b.relic": "손잡이 파편", "s6b.aiScope": "이미지 생성",
  "s3c.attitude": "기록", "s7.mode": "단독", ...o,
});

test("학생이 전시 공개를 고른 작품만 후보가 되고, 이유를 붙인다", () => {
  const c = buildCandidates({
    roster: { a: {}, b: {}, c: {}, d: {}, e: {} },
    wsMap: {
      a: ws(),
      b: ws({ "s7x.show": "비공개", "s7x.no": "A-02" }),
      c: ws({ "s7x.img": null, "s7x.no": "A-03" }),
      d: ws({ "s7x.no": "" }),
    },
    subMap: {}, attitudes: ATT,
  });
  const by = Object.fromEntries(c.map((x) => [x.sid, x]));
  assert.equal(by.a.ok, true);
  assert.equal(by.b.reason, "전시 공개를 선택하지 않음");
  assert.equal(by.c.reason, "대표 이미지 없음");
  assert.equal(by.d.reason, "작품 번호 없음");
  assert.equal(by.e, undefined, "기록지도 제출도 없는 학번은 목록에 넣지 않는다");
});

test("확정 제출이 있으면 제출 사본을, 없으면 기록지 초안을 쓴다", () => {
  const c = buildCandidates({
    roster: { a: {}, b: {} },
    wsMap: { a: ws(), b: ws({ "s7x.no": "B-01", "s6b.notice": "" }) },
    subMap: { a: { locked: true, no: "A-01", title: "제출 제목", plate: { relic: "제출 명칭" }, img: { owner: "a", ref: "asm.1" }, imgW: 1000, imgH: 750 } },
    attitudes: ATT,
  });
  const a = c.find((x) => x.sid === "a"), b = c.find((x) => x.sid === "b");
  assert.equal(a.src, "sub");
  assert.equal(a.work.title, "제출 제목");
  assert.equal(a.work.img.ref, "asm.1");
  assert.equal(a.work.aiScope, "이미지 생성", "AI 활용 범위는 기록지에서 가져온다");
  assert.equal(a.work.plate.notice, DEFAULT_NOTICE);
  assert.equal(b.src, "ws");
  assert.deepEqual(b.work.img, { owner: "b", ref: "s7x.img.1" });
});

test("공개 여부를 모르는(기록지를 못 읽은) 제출은 걸지 않는다", () => {
  const c = buildCandidates({ roster: {}, wsMap: {}, subMap: { z: { locked: true, no: "Z-1", img: { owner: "z", ref: "r" } } }, attitudes: ATT });
  assert.equal(c[0].ok, false);
  assert.equal(c[0].reason, "기록지를 읽지 못함");
});

test("작품 번호가 겹치면 뒤의 작품에 표시하고 초안에서 뺀다", () => {
  const c = buildCandidates({ roster: { a: {}, b: {} }, wsMap: { a: ws(), b: ws({ "s7x.no": "a-01 " }) }, subMap: {}, attitudes: ATT });
  assert.equal(c.filter((x) => x.dup).length, 1);
  const d = draftExpo({ cands: c, attitudes: ATT, hints: HINTS });
  assert.equal(d.works.length, 1);
});

test("태도는 구역, 진열 방식은 진열 형식이 된다", () => {
  assert.equal(fixtureOfMode("단독"), "wall");
  assert.equal(fixtureOfMode("계열"), "series");
  assert.equal(fixtureOfMode("파편"), "table");
  assert.equal(fixtureOfMode("오분류"), "case");
  assert.equal(fixtureOfMode("복원 표시"), "plinth");
  assert.equal(fixtureOfMode(""), "wall");
  const c = buildCandidates({ roster: { a: {}, b: {} }, wsMap: { a: ws({ "s7.mode": "파편" }), b: ws({ "s7x.no": "B-1", "s3c.attitude": "" }) }, subMap: {}, attitudes: ATT });
  const d = draftExpo({ cands: c, attitudes: ATT, hints: HINTS });
  assert.equal(d.works.find((w) => w.sid === "a").fixture, "table");
  assert.equal(d.works.find((w) => w.sid === "a").section, "기록");
  assert.equal(d.works.find((w) => w.sid === "b").section, UNSORTED);
  assert.equal(d.sections.find((s) => s.key === "기록").sub, "사라질 것을 기록한다");
});

test("다시 만든 초안은 교사가 고친 구역·형식·순서·제외·구역 이름을 이어받는다", () => {
  const cands = buildCandidates({
    roster: { a: {}, b: {}, c: {} },
    wsMap: { a: ws(), b: ws({ "s7x.no": "A-02" }), c: ws({ "s7x.no": "A-03" }) }, subMap: {}, attitudes: ATT,
  });
  let d = draftExpo({ cands, attitudes: ATT, hints: HINTS });
  d.works.find((w) => w.sid === "a").section = "질문";
  d.works.find((w) => w.sid === "b").fixture = "plinth";
  d = moveWork(d, "c", -1); // 같은 구역(기록) 안에서 c를 b 앞으로
  d = moveSection(d, "기록", -1);
  d.sections.find((s) => s.key === "기록").title = "기록하는 유물";
  d.off = ["c"];
  const pub = publishDoc(d, { at: "2026-09-28T00:00:00Z" });
  const again = draftExpo({ cands, attitudes: ATT, hints: HINTS, prev: pub });
  assert.equal(again.works.find((w) => w.sid === "a").section, "질문");
  assert.equal(again.works.find((w) => w.sid === "b").fixture, "plinth");
  assert.deepEqual(again.works.filter((w) => w.section === "기록").map((w) => w.sid), ["c", "b"]);
  assert.equal(again.sections.find((s) => s.key === "기록").title, "기록하는 유물");
  assert.ok(again.sections.findIndex((s) => s.key === "기록") < again.sections.findIndex((s) => s.key === "공감"));
  assert.deepEqual(again.off, ["c"]);
  assert.equal(again.open, true);
  assert.deepEqual(visibleWorks(again).map((w) => w.sid).includes("c"), false);
});

test("QR 번호 찾기는 대소문자·공백을 가리지 않고, 제외한 작품은 찾지 않는다", () => {
  const expo = { sections: [{ key: "기록" }], works: [{ sid: "a", no: "A-01", section: "기록" }, { sid: "b", no: "B 02", section: "기록" }], off: ["b"] };
  assert.equal(findWorkByNo(expo, " a-01").sid, "a");
  assert.equal(findWorkByNo(expo, "b02"), null);
  assert.equal(noKey(" b 02 "), "B02");
  assert.equal(arLink("https://x.web.app/", "A-01"), "https://x.web.app/?ar=A-01");
});

test("작품 캡션 줄은 빈 칸을 빼고 AI 활용 범위를 끝에 붙인다", () => {
  const rows = plateRows({ plate: { relic: "열쇠", year: "2300년", era: "" }, aiScope: "이미지 생성" });
  assert.deepEqual(rows.map((r) => r[0]), ["유물 명칭", "발굴 연도", "AI 활용 범위"]);
});

/* ---------- 평면 ---------- */

function bigExpo() {
  const modes = ["wall", "series", "series", "table", "wall", "series", "case", "plinth", "wall", "wall", "series", "table"];
  const works = modes.map((f, i) => ({ sid: "s" + i, no: "A-" + String(i + 1).padStart(2, "0"), section: i < 7 ? "기록" : "경고", fixture: f }));
  return { sections: [{ key: "경고", title: "경고" }, { key: "기록", title: "기록" }, { key: "질문", title: "질문" }], works, off: [] };
}

test("평면: 모든 작품이 한 번씩, 구역 순서대로, 전시관 안에 놓인다", () => {
  const plan = planHall(bigExpo());
  assert.equal(plan.items.length, 12);
  assert.equal(plan.tourLength, 14);
  assert.deepEqual(plan.sections.map((s) => s.key), ["경고", "기록"], "작품이 없는 구역은 짓지 않는다");
  const half = HALL.W / 2;
  plan.items.forEach((it) => {
    const s = plan.sections.find((x) => x.key === it.section);
    assert.ok(it.anchor[2] < s.z0 && it.anchor[2] > s.z1, "작품이 자기 구역 안에 있다 " + it.work.no);
    assert.ok(Math.abs(it.anchor[0]) <= half + 1e-9);
    const [x, , z] = it.view.pos;
    assert.ok(Math.abs(x) < half - 0.3, "시점이 벽 안쪽 " + it.work.no);
    assert.ok(z < plan.zFront && z > plan.zBack, "시점이 전시관 안 " + it.work.no);
  });
  const secIdx = plan.items.map((it) => plan.sections.findIndex((s) => s.key === it.section));
  assert.deepEqual(secIdx, secIdx.slice().sort((a, b) => a - b), "관람 순서가 구역 순서를 따른다");
});

test("평면: 같은 벽의 작품 칸이 서로 겹치지 않는다", () => {
  const plan = planHall(bigExpo());
  ["L", "R"].forEach((side) => {
    const spans = plan.items.filter((it) => it.wall === side)
      .map((it) => { const hw = (it.fixture === "series" ? HALL.SLOT.series : HALL.SLOT.wall) / 2; return [it.anchor[2] - hw, it.anchor[2] + hw]; })
      .sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < spans.length; i++) assert.ok(spans[i][0] >= spans[i - 1][1] - 1e-6, side + " 벽 겹침");
  });
  const floor = plan.items.filter((it) => !it.wall).map((it) => it.anchor[2]).sort((a, b) => a - b);
  for (let i = 1; i < floor.length; i++) assert.ok(floor[i] - floor[i - 1] >= HALL.SLOT.floor - 1e-6);
});

test("평면: 한 구역의 계열 작품은 한 벽에 같은 높이·같은 간격으로 이어 걸린다", () => {
  const plan = planHall(bigExpo());
  const ser = plan.items.filter((it) => it.section === "기록" && it.fixture === "series");
  assert.equal(ser.length, 3);
  assert.equal(new Set(ser.map((it) => it.wall)).size, 1);
  assert.equal(new Set(ser.map((it) => it.anchor[1])).size, 1);
  const zs = ser.map((it) => it.anchor[2]).sort((a, b) => b - a);
  assert.ok(Math.abs((zs[0] - zs[1]) - HALL.SLOT.series) < 1e-6 && Math.abs((zs[1] - zs[2]) - HALL.SLOT.series) < 1e-6);
});

test("평면: 벽면 작품의 시점은 벽을 바라본다", () => {
  const plan = planHall(bigExpo());
  plan.items.filter((it) => it.wall).forEach((it) => {
    const dir = [-Math.sin(it.view.yaw), -Math.cos(it.view.yaw)];
    assert.ok(dir[0] * -it.normal[0] > 0.9, "시선이 벽 쪽 " + it.work.no);
  });
  plan.items.filter((it) => !it.wall).forEach((it) => {
    assert.ok(it.view.pitch < 0, "바닥 설비는 내려다본다");
    assert.ok(Math.abs(it.view.yaw) < 1e-9);
  });
});

test("평면: 작품이 없으면 서문과 맺음만 있다", () => {
  const plan = planHall({ sections: [], works: [] });
  assert.equal(plan.items.length, 0);
  assert.equal(plan.tourLength, 2);
  assert.ok(plan.zBack < plan.intro.z);
});

test("평면: 문서에 없는 구역의 작품도 버리지 않는다", () => {
  const plan = planHall({ sections: [{ key: "기록" }], works: [{ sid: "a", no: "1", section: "사라진 구역", fixture: "wall" }] });
  assert.equal(plan.items.length, 1);
});
