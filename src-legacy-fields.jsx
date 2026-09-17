import React from "react";

/* ============================================================
   개정 전 기록 표시 (읽기 전용)
   ------------------------------------------------------------
   2026-09-12 유물 발상 단계 개정(4dcd7c3)에서 옛 T4 「드러내는 방법」의 칸 다섯(s3e.sub·dropMode·
   dropWhy·risk·form)과 T1의 「함께 쓴 방법」(s3o.second)이 화면에서 빠졌다. 저장 키는 그대로라
   기록은 남아 있지만 어디에도 보이지 않아 학생에게는 지워진 것처럼 보였다 (2026-09-17 확인:
   글을 쓴 학생 1명, 선택값만 남은 학생 9명). 3차시 돌아보기 카드 아래에 그 값을 읽기 전용으로 보인다.
   값이 하나도 없으면 아무것도 그리지 않는다.
   ============================================================ */

const LEGACY = [
  { k: "s3o.second", label: "함께 쓴 관찰 방법 (옛 단계 1)", names: "obs" },
  { k: "s3e.sub", label: "함께 쓸 드러내는 방법 (옛 T4)", names: "engage" },
  { k: "s3e.dropMode", label: "비교했다가 제외한 방법 (옛 T4)", names: "engage" },
  { k: "s3e.dropWhy", label: "그 방법을 제외한 이유 (옛 T4)" },
  { k: "s3e.risk", label: "고른 방법의 위험을 내 작업에서 어떻게 다룰 것인가 (옛 T4)" },
  { k: "s3e.form", label: "이 단원의 형식으로 어떻게 실현할 것인가 (옛 T4)" },
];

/* obs·engage: 코드 → 이름 표 ({ k, label }[]) */
export function LegacyEcho({ ws, obs, engage }) {
  const d = ws || {};
  const nameOf = (list, code) => { const hit = (list || []).find((x) => x.k === code); return hit ? hit.label : code; };
  const rows = LEGACY.map((f) => {
    const raw = d[f.k];
    if (typeof raw !== "string" || !raw.trim()) return null;
    const text = f.names ? nameOf(f.names === "obs" ? obs : engage, raw.trim()) : raw;
    return { ...f, text };
  }).filter(Boolean);
  if (!rows.length) return null;
  return (
    <div className="obs-echo legacy-echo">
      <b>개정 전 화면에서 쓴 기록</b>
      <p className="hint" style={{ margin: "4px 0 8px" }}>2026년 9월 12일 이전 화면의 칸에 쓴 내용입니다. 지금 화면에는 이 칸이 없어 고칠 수는 없지만 기록은 그대로 저장되어 있고 교사 화면에서도 보입니다.</p>
      <dl style={{ margin: 0 }}>
        {rows.map((r) => (
          <React.Fragment key={r.k}>
            <dt style={{ fontWeight: 700, marginTop: 6 }}>{r.label}</dt>
            <dd style={{ margin: "2px 0 0", whiteSpace: "pre-wrap" }}>{r.text}</dd>
          </React.Fragment>
        ))}
      </dl>
    </div>
  );
}
