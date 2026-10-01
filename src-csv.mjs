/* CSV 셀 하나를 만드는 공용 규칙 (「연구」 탭·설문·앵커·학급 기록 내보내기가 함께 쓴다).

   - 유한한 숫자는 따옴표 없이 그대로 쓴다. 음수(-12, -0.25)를 문자열로 다루면
     아래 수식 주입 방지가 앞에 ' 를 붙여 R·pandas·SPSS가 그 칸을 글자로 읽고,
     평균·회귀에서 음수만 조용히 빠진다(구체성 변화량·성향 afn 등).
   - NaN·Infinity는 빈칸으로 쓴다. 계산 불가를 "NaN"이라는 글자로 내보내면 결측이 아니라 값이 된다.
   - 글자는 =·+·-·@·탭·CR로 시작하면 ' 를 앞에 붙여 스프레드시트 수식으로 실행되지 않게 하고,
     따옴표로 감싸 쉼표·줄바꿈이 열을 깨지 않게 한다.
   숫자는 이 함수에 닿을 때까지 숫자로 둔다. 미리 String()으로 바꾸면 이 구분이 사라진다. */

export function csvCell(c) {
  if (typeof c === "number") return Number.isFinite(c) ? String(c) : "";
  let s = c == null ? "" : String(c);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;   // 스프레드시트 수식 주입 방지 (글자에만)
  return '"' + s.replace(/"/g, '""') + '"';
}

/* 머리글과 행으로 CSV 한 파일. 엑셀이 한글을 깨뜨리지 않게 BOM을 붙인다 */
export const toCSV = (head, rows) => "﻿" + [head, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
