/* src-csv.mjs 검증 — node --test src-csv.test.mjs */
import test from "node:test";
import assert from "node:assert/strict";
import { csvCell, toCSV } from "./src-csv.mjs";

/* R·pandas처럼 RFC 4180으로 읽는다 (따옴표 안의 쉼표·줄바꿈·겹따옴표) */
function parseCSV(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = []; let row = [], cur = "", q = false, quoted = false;
  const cells = []; let rowCells = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') { q = true; quoted = true; }
    else if (ch === ",") { row.push(cur); rowCells.push(quoted); cur = ""; quoted = false; }
    else if (ch === "\n") { row.push(cur); rowCells.push(quoted); rows.push(row); cells.push(rowCells); row = []; rowCells = []; cur = ""; quoted = false; }
    else cur += ch;
  }
  row.push(cur); rowCells.push(quoted); rows.push(row); cells.push(rowCells);
  return { rows, quoted: cells };
}

test("유한한 숫자는 따옴표 없이 그대로 — 음수도 숫자로 남는다", () => {
  assert.equal(csvCell(12), "12");
  assert.equal(csvCell(-12), "-12");
  assert.equal(csvCell(-0.25), "-0.25");
  assert.equal(csvCell(0), "0");
  assert.equal(csvCell(3.58), "3.58");
});

test("NaN·Infinity는 빈칸", () => {
  assert.equal(csvCell(NaN), "");
  assert.equal(csvCell(Infinity), "");
  assert.equal(csvCell(-Infinity), "");
});

test("글자에는 수식 주입 방지가 그대로 적용된다", () => {
  assert.equal(csvCell("=SUM(A1)"), '"\'=SUM(A1)"');
  assert.equal(csvCell("-"), '"\'-"');
  assert.equal(csvCell("-3도 낮아짐"), '"\'-3도 낮아짐"');   // 학생이 쓴 글은 글자다
  assert.equal(csvCell("+1"), '"\'+1"');
  assert.equal(csvCell("@me"), '"\'@me"');
});

test("null·undefined는 빈 글자, 쉼표·줄바꿈·따옴표는 감싼다", () => {
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell(undefined), '""');
  assert.equal(csvCell("텍스트, 쉼표"), '"텍스트, 쉼표"');
  assert.equal(csvCell('a"b'), '"a""b"');
  assert.equal(csvCell("줄1\n줄2"), '"줄1\n줄2"');
});

test("toCSV를 CSV 판독기로 읽으면 음수 평균이 보존된다", () => {
  const vals = [-20, -10, 5, 15];
  const csv = toCSV(["pid", "conc_gain"], vals.map((v, i) => ["P" + i, v]));
  assert.equal(csv.charCodeAt(0), 0xfeff);
  const { rows, quoted } = parseCSV(csv);
  const col = rows.slice(1).map((r) => r[1]);
  assert.deepEqual(col, ["-20", "-10", "5", "15"]);
  assert.ok(quoted.slice(1).every((q) => q[1] === false), "숫자 칸은 따옴표로 감싸지 않는다");
  const m = col.map(Number).reduce((a, b) => a + b, 0) / col.length;
  assert.equal(m, -2.5);
});
