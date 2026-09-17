import React, { useState, useEffect } from "react";
import { fbStore } from "./src-fb.js";

/* ============================================================
   기록지 시점 사본 — 학생별로 1시간 단위 사본을 남기고, 교사가 그 시점으로 되돌린다
   ------------------------------------------------------------
   왜 필요한가
     학생 기록지는 문서 하나(worksheets/{학번})를 통째로 덮어쓰며 자동 저장된다.
     빈 화면으로 열린 뒤 한 글자만 쳐도 기존 기록이 사라지는 사고를 getSafe로 막았지만,
     학생이 실수로 지우거나 두 기기에서 번갈아 써서 옛 사본이 새 기록을 덮는 경우는 남는다.
     그때 「어제 3시쯤 상태」로 되돌릴 길이 없었다.

   어떻게 남기나
     자동 저장이 성공할 때마다 makeSnapshotter가 wsHistory/{학번}_{YYYYMMDDHH} 문서에
     같은 내용을 한 번 더 쓴다. 문서 이름이 시간대(1시간)라 그 시간대 안에서는 같은 문서를
     덮어쓰므로, 시간대마다 「그 시간의 마지막 상태」 하나가 남는다. 같은 시간대 안에서는
     2분에 한 번만 써서 쓰기 횟수를 줄인다 (마지막 2분 안의 타자는 다음 사본이나 본 문서에 있다).
     되돌리기 직전의 현재 상태도 {학번}_r{시각} 이름으로 남겨 되돌리기 자체를 되돌릴 수 있다.

   접근 규칙 (firestore.rules /wsHistory)
     문서 이름 앞부분이 학번이라 본인이 만들고, 읽기·되돌리기는 교사가 한다.
   ============================================================ */

const GAP_MS = 120000;
const pad = (n) => String(n).padStart(2, "0");

/* 시간대 이름: 기기의 현지 시각으로 YYYYMMDDHH */
export function bucketOf(ms) {
  const d = new Date(ms);
  return "" + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + pad(d.getHours());
}
const bucketLabel = (b) => (/^\d{10}$/.test(b) ? b.slice(0, 4) + "-" + b.slice(4, 6) + "-" + b.slice(6, 8) + " " + b.slice(8, 10) + "시" : b);

/* 학생 화면용. 자동 저장이 성공할 때마다 부른다. 실패해도 본 저장에는 영향이 없다. */
export function makeSnapshotter(sid) {
  let lastAt = 0, lastBucket = "";
  return (data) => {
    const t = Date.now();
    const b = bucketOf(t);
    if (b === lastBucket && t - lastAt < GAP_MS) return;
    lastAt = t; lastBucket = b;
    fbStore.set("wsh:" + sid + "_" + b, { sid, bucket: b, at: new Date(t).toISOString(), ws: data }).catch(() => {});
  };
}

/* 사본의 요약: 채운 칸 수와 글자 수 (밑줄 키는 보조 기록이라 빼고 센다) */
function summarize(ws) {
  let fields = 0, chars = 0;
  const walk = (v) => {
    if (typeof v === "string") { chars += v.trim().length; return v.trim().length > 0; }
    if (Array.isArray(v)) { let any = false; v.forEach((x) => { if (walk(x)) any = true; }); return any; }
    if (v && typeof v === "object") { let any = false; Object.keys(v).forEach((k) => { if (walk(v[k])) any = true; }); return any; }
    return v != null && v !== "";
  };
  for (const k of Object.keys(ws || {})) { if (k.charAt(0) === "_") continue; if (walk(ws[k])) fields++; }
  return { fields, chars };
}

const fmt = (iso) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.getMonth() + 1 + "/" + d.getDate() + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
};

/* 교사 화면 학생 상세 「관리」 탭의 카드 */
export function WsHistoryCard({ sid, ws, busy, onRestored, setMsg }) {
  const [rows, setRows] = useState(null); // null 불러오는 중 · [] 없음
  const [err, setErr] = useState(false);
  const [working, setWorking] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setRows(null); setErr(false);
    fbStore.listWsHistory(sid).then((r) => {
      if (!live) return;
      if (!r.ok) { setErr(true); setRows([]); return; }
      setRows(r.data.sort((a, b) => (b.at || "").localeCompare(a.at || "")));
    });
    return () => { live = false; };
  }, [sid, tick]);

  const cur = summarize(ws);
  const restore = async (row) => {
    const s = summarize(row.ws);
    const msg = sid + " 학생의 기록지를 " + fmt(row.at) + " 상태로 되돌립니다.\n" +
      "지금: 채운 칸 " + cur.fields + "개 · " + cur.chars.toLocaleString() + "자 → 되돌린 뒤: 채운 칸 " + s.fields + "개 · " + s.chars.toLocaleString() + "자\n\n" +
      "되돌리기 직전 상태도 사본으로 남기므로 다시 되돌릴 수 있습니다.\n학생이 접속 중이면 학생 화면의 자동 저장이 되돌린 기록을 다시 덮을 수 있으니, 접속 중이 아닐 때 실행하세요.\n진행할까요?";
    if (!window.confirm(msg)) return;
    setWorking(true);
    const nowIso = new Date().toISOString();
    // ① 현재 상태를 먼저 사본으로 남긴다 (실패하면 되돌리지 않는다)
    const backupOk = await fbStore.setT("wsh:" + sid + "_r" + Date.now(), { sid, bucket: "되돌리기 전", at: nowIso, ws });
    if (!backupOk) { setWorking(false); setMsg && setMsg("되돌리기 전 사본 저장에 실패해 중단했습니다. 연결을 확인하고 다시 시도하세요."); return; }
    // ② 사본을 본 문서에 쓴다. 되돌린 사실은 _restored에 남긴다
    const next = { ...row.ws, _updatedAt: nowIso, _restored: [...(Array.isArray(ws && ws._restored) ? ws._restored : []), { from: row.at, at: nowIso }].slice(-20) };
    const ok = await fbStore.setT("ws:" + sid, next);
    setWorking(false);
    if (!ok) { setMsg && setMsg("되돌리기에 실패했습니다. 다시 시도하세요."); return; }
    setMsg && setMsg(fmt(row.at) + " 상태로 되돌렸습니다.");
    onRestored && onRestored(next);
    setTick((t) => t + 1);
  };

  return (
    <div className="card">
      <div className="card-head"><span className="card-code">관리 0</span><span className="card-title">기록 되돌리기</span></div>
      <div className="card-body">
        <p style={{ fontSize: 13, marginBottom: 10 }}>
          학생 기록지는 자동 저장될 때마다 1시간 단위 사본이 남습니다(시간대마다 마지막 상태 하나). 잘못 지웠거나 옛 기기의 사본이 새 기록을 덮었을 때 그 시점으로 되돌립니다.
          지금 기록: 채운 칸 <b>{cur.fields}</b>개 · <b>{cur.chars.toLocaleString()}</b>자.
        </p>
        {rows === null ? <p className="hint">사본을 불러오는 중…</p>
          : err ? <p className="hint" style={{ color: "var(--seal)" }}>사본 목록을 읽지 못했습니다. <button type="button" className="inq-link" onClick={() => setTick((t) => t + 1)}>다시 시도</button></p>
          : rows.length === 0 ? <p className="hint">아직 사본이 없습니다. 학생이 이 기능이 배포된 뒤에 기록지를 고치면 그때부터 쌓입니다.</p>
          : (
            <div className="tbl-scroll"><table className="roster">
              <thead><tr><th>시간대</th><th>마지막 저장</th><th>채운 칸</th><th>글자 수</th><th style={{ width: 150 }}></th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const s = summarize(r.ws);
                  return (
                    <tr key={r.id}>
                      <td>{bucketLabel(r.bucket || "")}</td>
                      <td>{fmt(r.at)}</td>
                      <td>{s.fields}</td>
                      <td>{s.chars.toLocaleString()}</td>
                      <td><button type="button" className="btn small ghost" disabled={busy || working} onClick={() => restore(r)}>{working ? "처리 중…" : "이 시점으로 되돌리기"}</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          )}
        <p className="hint" style={{ marginTop: 8 }}>되돌리기 직전 상태는 「되돌리기 전」 사본으로 남아 다시 되돌릴 수 있습니다. 사진·음성·스케치 파일은 별도 저장이라 되돌리기와 무관하게 남습니다.</p>
      </div>
    </div>
  );
}
