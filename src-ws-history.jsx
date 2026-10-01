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

   되돌린 뒤 학생 화면
     학생 화면은 자기 기록지를 구독하므로(src-ws-sync.mjs) 접속 중이어도 되돌린 내용을 바로 받는다.
     그 순간 학생이 고치고 있던 칸(저장 대기·저장 중)만 학생 쪽 값이 남는다.
     더 오래된 시점은 scripts/restore-worksheet.mjs(PITR·PC 백업)로 되돌린다 (README §10.1).
   ============================================================ */

const GAP_MS = 120000;

/* 값 안의 media 참조(문자열 ref)를 모은다. 사진·녹음·스케치·영상 칸과 생성 회차의 그림이 여기에 해당한다 */
function refsIn(v, out = []) {
  if (!v) return out;
  if (Array.isArray(v)) { v.forEach((x) => refsIn(x, out)); return out; }
  if (typeof v === "object") { if (typeof v.ref === "string" && v.ref) out.push(v.ref); Object.values(v).forEach((x) => refsIn(x, out)); }
  return out;
}
/* 되돌릴 기록 만들기: 사본(snap)을 쓰되, 사본이 가리키는 media 문서가 지금 없는 칸은 현재 값(cur)을 둔다.
   사진·녹음·스케치는 새로 올릴 때 옛 문서를 지우므로(스케치는 자동 저장으로 몇 분마다 바뀐다), 옛 사본의 참조를 그대로 쓰면
   없는 문서를 가리켜 학생 화면에서 열리지 않고 지금의 문서는 가리키는 곳 없이 남는다. exists(ref) → 문서가 있으면 true */
export async function mergeRestore(snap, cur, exists) {
  const next = { ...(snap || {}) };
  const kept = [];
  for (const k of Object.keys(next)) {
    if (k.charAt(0) === "_") continue;
    const refs = refsIn(next[k]);
    if (!refs.length) continue;
    const oks = await Promise.all(refs.map((r) => exists(r)));
    if (oks.every(Boolean)) continue;
    kept.push(k);
    if (cur && cur[k] !== undefined) next[k] = cur[k]; else delete next[k];
  }
  // 사본에는 없고 지금만 있는 media 칸(사본 뒤에 올린 사진·스케치)은 그대로 둔다
  for (const k of Object.keys(cur || {})) {
    if (k.charAt(0) === "_" || k in next || kept.includes(k)) continue;
    if (refsIn(cur[k]).length) { next[k] = cur[k]; kept.push(k); }
  }
  return { next, kept };
}
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
  /* 서버의 지금 기록지. 화면을 연 때의 ws를 「되돌리기 전」 사본으로 남기면 그 뒤 학생이 쓴 것이 사본에서 빠져
     되돌리기를 되돌려도 돌아오지 않는다. 확인 창의 수치도 서버 기준이어야 한다. */
  const readLive = async () => {
    const r = await fbStore.getSafe("ws:" + sid);
    if (!r.ok || r.fromCache) { setMsg && setMsg("지금 기록지를 서버에서 읽지 못해 중단했습니다. 연결을 확인하고 다시 시도하세요."); return null; }
    return { data: r.data };
  };
  const restore = async (row) => {
    setWorking(true);
    const first = await readLive();
    if (!first) { setWorking(false); return; }
    const c = summarize(first.data), s = summarize(row.ws);
    const changed = ((first.data && first.data._updatedAt) || "") !== ((ws && ws._updatedAt) || "");
    const msg = sid + " 학생의 기록지를 " + fmt(row.at) + " 상태로 되돌립니다.\n" +
      (changed ? "(화면을 연 뒤 학생이 기록을 고쳤습니다. 아래 「지금」은 서버의 최신 기록입니다.)\n" : "") +
      "지금: 채운 칸 " + c.fields + "개 · " + c.chars.toLocaleString() + "자 → 되돌린 뒤: 채운 칸 " + s.fields + "개 · " + s.chars.toLocaleString() + "자\n\n" +
      "되돌리기 직전 상태도 사본으로 남기므로 다시 되돌릴 수 있습니다.\n학생이 접속 중이면 학생 화면도 되돌린 내용을 바로 받습니다. 학생이 그 순간 고치고 있던 칸만 학생 쪽 값이 남습니다.\n진행할까요?";
    if (!window.confirm(msg)) { setWorking(false); return; }
    // 확인 창이 떠 있던 사이의 저장까지 사본에 담기 위해 한 번 더 읽는다
    const live = await readLive();
    if (!live) { setWorking(false); return; }
    const cur0 = live.data;
    const nowIso = new Date().toISOString();
    // ① 현재 상태를 먼저 사본으로 남긴다 (실패하면 되돌리지 않는다). 기록지가 없으면 남길 것이 없다
    const backupOk = !cur0 || await fbStore.setT("wsh:" + sid + "_r" + Date.now(), { sid, bucket: "되돌리기 전", at: nowIso, ws: cur0 });
    if (!backupOk) { setWorking(false); setMsg && setMsg("되돌리기 전 사본 저장에 실패해 중단했습니다. 연결을 확인하고 다시 시도하세요."); return; }
    // ② 사본을 본 문서에 쓴다. 되돌린 사실은 _restored에 남긴다.
    //    사진·녹음·스케치 칸은 사본이 가리키는 파일이 아직 있을 때만 되돌리고, 없으면 지금 값을 둔다(mergeRestore)
    const exists = async (ref) => { const r = await fbStore.getSafe("media:" + sid + "_" + ref); return !!(r && r.ok && r.data != null); };
    const merged = await mergeRestore(row.ws, cur0, exists);
    const next = { ...merged.next, _updatedAt: nowIso, _restored: [...(Array.isArray(cur0 && cur0._restored) ? cur0._restored : []), { from: row.at, at: nowIso }].slice(-20) };
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
        <p className="hint" style={{ marginTop: 8 }}>되돌리기 직전 상태는 「되돌리기 전」 사본으로 저장되어 다시 되돌릴 수 있습니다. 사진·음성·스케치는 그 시점의 파일이 아직 있을 때만 되돌리고, 없으면 지금 것을 그대로 둡니다.</p>
      </div>
    </div>
  );
}
