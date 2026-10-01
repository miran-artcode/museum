/* ============================================================
   전시장 출품 문서 (exhibit/{학번})
   전시장이 학생 기록지 전체를 30초마다 읽던 방식을 바꾼다: 학생은 남의 기록지를 읽을 권한이 없어
   새로고침마다 권한 오류가 학급 수만큼 났고, 프로젝터는 매번 학급 기록지를 통째로 내려받았다.
   이제 학생 화면이 「전시 공개」인 동안 작품 캡션에 필요한 칸만 exhibit/{학번}에 올리고,
   전시장은 그 컬렉션 하나를 실시간 구독한다. 공개를 풀면 문서를 지운다.
   ============================================================ */
import { useEffect, useRef, useState } from "react";
import { fbStore, authApi } from "./src-fb.js";

const KEY = (sid) => "exhibit:" + sid;
const str = (x) => (typeof x === "string" ? x : "");

/* 기록지 → 출품 문서의 v. 공개가 아니면 null */
export function exhibitOf(sid, ws) {
  if (!ws || ws["s7x.show"] !== "공개") return null;
  const im = ws["s7x.img"];
  const img = im && typeof im === "object" && im.ref ? { ref: String(im.ref), w: im.w || 0, h: im.h || 0 }
    : typeof im === "string" && im.length < 900000 ? im : "";
  return {
    owner: String(sid), no: str(ws["s7x.no"]).slice(0, 20), img,
    title: str(ws["s6b.title"]), relic: str(ws["s6b.relic"]), year: str(ws["s6b.year"]), era: str(ws["s6b.era"]),
    mat: str(ws["s6b.mat"]), size: str(ws["s6b.size"]), context: str(ws["s6b.context"]), coll: str(ws["s6b.coll"]),
    aiScope: str(ws["s6b.aiScope"]), notice: str(ws["s6b.notice"]), note: str(ws["s7.note"]),
  };
}

/* 키 순서와 무관한 비교용 문자열 (서버가 돌려준 맵은 키 순서가 다를 수 있다) */
function canon(x) {
  if (x === null || typeof x !== "object") return JSON.stringify(x);
  return "{" + Object.keys(x).sort().map((k) => JSON.stringify(k) + ":" + canon(x[k])).join(",") + "}";
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(() => r(false), ms))]);

/* 학생 화면에 한 줄로 붙인다. ws가 null이면(아직 로드 전·읽기 실패) 아무것도 하지 않는다.
   처음 한 번은 서버 문서를 읽어 기준으로 삼는다: 공개를 푼 직후 탭을 닫아 지우지 못한 문서도 다음 입장에서 정리되고,
   바뀐 것이 없으면 입장할 때마다 다시 쓰지 않는다. */
export function useExhibitPublisher(sid, ws) {
  const lastRef = useRef(undefined); // 서버에 있다고 아는 상태: undefined(모름) · "off"(없음) · canon(v)
  const timer = useRef(null);
  const v = ws ? exhibitOf(sid, ws) : null;
  const want = ws ? (v ? canon(v) : "off") : null;
  const wantRef = useRef(want);
  wantRef.current = want;

  useEffect(() => {
    if (want == null || !sid) return;
    let alive = true;
    const run = async () => {
      if (lastRef.current === undefined) {
        const r = await fbStore.getSafe(KEY(sid));
        if (!r.ok) return; // 읽지 못하면 이번에는 건너뛴다 (다음 변경 때 다시)
        lastRef.current = r.data ? canon(r.data) : "off";
      }
      const w = wantRef.current;
      if (w == null || w === lastRef.current) return;
      const ok = w === "off"
        ? await withTimeout(fbStore.remove(KEY(sid)), 8000)
        : await fbStore.setT(KEY(sid), JSON.parse(w));
      if (ok) lastRef.current = w;
    };
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { if (alive) run(); }, 1500);
    return () => { alive = false; clearTimeout(timer.current); };
  }, [sid, want]);
}

/* 전시장 구독. status: loading · signedOut(로그인 전) · viewer(보기 전용) · ok · error */
export function useExhibits() {
  const [st, setSt] = useState({ status: "loading", docs: {} });
  useEffect(() => {
    let un = null;
    const stop = authApi.watch((u) => {
      if (un) { un(); un = null; }
      if (!u) { setSt({ status: "signedOut", docs: {} }); return; }
      // 보기 전용 계정은 규칙이 학번이 드러나는 문서를 막는다: 구독하지 않고 예시만 보여 준다
      if (authApi.isViewer()) { setSt({ status: "viewer", docs: {} }); return; }
      un = fbStore.watchCollection("exhibit", (docs) => setSt({ status: "ok", docs }),
        () => setSt({ status: "error", docs: {} }));
    });
    return () => { stop(); if (un) un(); };
  }, []);
  return st;
}
