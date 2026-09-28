/* ============================================================
   3D 전시관과 AR 모델 — three.js·<model-viewer>를 쓰는 무거운 계층
   public/ar3d.js로 따로 묶어, 전시관을 열 때만 내려받는다 (npm run build의 두 번째 esbuild).
   React를 쓰지 않는다. 화면(src-ar.jsx)은 window.MuseumAR의 함수만 부른다.

     mountHall(el, { expo, reveal, getImage, onFocus, reducedMotion })  걸어 다니는 3D 전시관
     mountArViewer(el, { work, imgSrc, fixture, sectionTitle, reveal, arLabel, onStatus })
         작품 한 점을 실제 크기의 설비(액자·진열장·좌대)와 함께 GLB로 만들어 <model-viewer>에 싣는다.
         안드로이드 Chrome은 WebXR, iPhone Safari는 Quick Look(USDZ를 여기서 직접 만든다)으로 방에 놓는다.
     qrSvg(text)   QR 표지 인쇄용
     webglOk()

   평면(작품 위치·관람 시점)은 src-ar-expo.mjs planHall이 정한다. 여기서는 그대로 짓기만 한다.
   ============================================================ */

import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { USDZExporter } from "three/examples/jsm/exporters/USDZExporter.js";
import "@google/model-viewer";
import qrcode from "qrcode-generator";
import { planHall, plateRows, BASE_NOTICE, DEFAULT_NOTICE, isWallFixture, HALL } from "./src-ar-expo.mjs";

const FONT = '"Noto Sans KR","IBM Plex Sans KR","Malgun Gothic","Apple SD Gothic Neo",sans-serif';
const LATIN = '"Archivo","Noto Sans KR",sans-serif';
const C = { ink: "#111111", sub: "#6e6e6e", seal: "#B5382A", line: "#d9d9d9", paper: "#ffffff" };
const IS_IOS = typeof navigator !== "undefined" &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

/* ---------- 글꼴과 캔버스 글자 ---------- */

let fontP = null;
function fontsReady() {
  if (!fontP) {
    const f = typeof document !== "undefined" ? document.fonts : null;
    fontP = f && f.load
      ? Promise.race([
        Promise.all([f.load("400 24px " + FONT, "가A"), f.load("700 24px " + FONT, "가A"), f.load("900 24px " + FONT, "가A")]).catch(() => {}),
        new Promise((r) => setTimeout(r, 2500)),
      ])
      : Promise.resolve();
  }
  return fontP;
}

const mkCanvas = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
const pxOf = (font) => { const m = /(\d+)px/.exec(font); return m ? +m[1] : 20; };

/* 한국어는 어절(띄어쓰기) 단위로 줄을 바꾸고, 한 어절이 줄보다 길 때만 글자 단위로 자른다 (CSS keep-all과 같게) */
function wrapLines(ctx, text, maxW) {
  const out = [];
  String(text == null ? "" : text).split("\n").forEach((para) => {
    let line = "";
    const push = () => { out.push(line.replace(/\s+$/, "")); line = ""; };
    (para.match(/\S+\s*|\s+/g) || []).forEach((tok) => {
      if (ctx.measureText(line + tok.replace(/\s+$/, "")).width <= maxW) { line += tok; return; }
      if (line.trim()) push();
      if (ctx.measureText(tok.replace(/\s+$/, "")).width <= maxW) { line = tok.replace(/^\s+/, ""); return; }
      for (const ch of tok) {
        if (line && ctx.measureText(line + ch).width > maxW) push();
        line += ch;
      }
    });
    push();
  });
  return out;
}

/* 글줄을 먼저 쌓고 높이를 안 뒤 그린다 */
function layout(width, pad) {
  const ctx = mkCanvas(8, 8).getContext("2d");
  const ops = [];
  const L = {
    y: pad,
    text(str, o) {
      const x = o.x != null ? o.x : pad;
      const maxW = o.maxW != null ? o.maxW : width - pad - x;
      ctx.font = o.font;
      let lines = wrapLines(ctx, str, maxW);
      if (o.maxLines && lines.length > o.maxLines) {
        lines = lines.slice(0, o.maxLines);
        let last = lines[o.maxLines - 1];
        while (last && ctx.measureText(last + "…").width > maxW) last = last.slice(0, -1);
        lines[o.maxLines - 1] = last + "…";
      }
      const y0 = o.y != null ? o.y : L.y;
      const off = (o.lh - pxOf(o.font)) / 2;
      lines.forEach((ln, i) => ops.push({ t: "text", font: o.font, color: o.color || C.ink, text: ln, x, w: maxW, y: y0 + i * o.lh + off, align: o.align }));
      const h = lines.length * o.lh;
      if (o.y == null) L.y += h;
      return h;
    },
    rule(color = C.line, dash = null, gap = 22) { L.y += gap / 2; ops.push({ t: "rule", color, dash, y: L.y }); L.y += gap / 2; },
    box(x, y, w, h, color) { ops.push({ t: "box", x, y, w, h, color }); },
    gap(h) { L.y += h; },
    render(bg = C.paper, minH = 0) {
      const H = Math.ceil(Math.max(minH, L.y + pad));
      const cv = mkCanvas(width, H);
      const g = cv.getContext("2d");
      if (bg) { g.fillStyle = bg; g.fillRect(0, 0, width, H); }
      g.textBaseline = "top";
      ops.forEach((o) => {
        if (o.t === "text") {
          g.font = o.font; g.fillStyle = o.color; g.textAlign = o.align === "center" ? "center" : "left";
          g.fillText(o.text, o.align === "center" ? o.x + o.w / 2 : o.x, o.y);
        } else if (o.t === "rule") {
          g.strokeStyle = o.color; g.lineWidth = 2; g.setLineDash(o.dash || []);
          g.beginPath(); g.moveTo(pad, o.y); g.lineTo(width - pad, o.y); g.stroke(); g.setLineDash([]);
        } else if (o.t === "box") { g.fillStyle = o.color; g.fillRect(o.x, o.y, o.w, o.h); }
      });
      return cv;
    },
  };
  return L;
}

/* 작품 캡션 — 1차 관람은 번호와 가림 표시, 2차 관람은 전시장(Gallery)의 작품 캡션과 같은 줄 */
function plateCanvas(w, reveal, o = {}) {
  const W = 720, P = 40;
  const L = layout(W, P);
  L.text("작품 " + (w.no || ""), { font: "700 26px " + LATIN, color: C.seal, lh: 38 });
  if (!reveal) {
    L.gap(14);
    const top = L.y;
    L.box(P, top, W - 2 * P, 150, "#f1f1f1");
    L.text("작품 캡션 가림", { font: "700 30px " + FONT, color: C.sub, lh: 44, y: top + 34, align: "center" });
    L.text("2차 관람에서 공개합니다", { font: "400 23px " + FONT, color: C.sub, lh: 34, y: top + 84, align: "center" });
    L.y = top + 150;
    L.gap(18);
    L.text(BASE_NOTICE, { font: "400 21px " + FONT, color: C.seal, lh: 32 });
    return L.render();
  }
  L.gap(6);
  L.text("「" + (w.title || "무제") + "」", { font: "700 38px " + FONT, lh: 54, maxLines: 3 });
  L.rule();
  const DT = 150;
  plateRows(w).forEach(([label, val, k]) => {
    const y0 = L.y;
    L.text(label, { font: "400 21px " + FONT, color: C.sub, lh: 34, y: y0, maxW: DT - 12 });
    const h = L.text(val, { font: "400 23px " + FONT, lh: 34, x: P + DT, y: y0, maxLines: k === "context" ? (o.contextLines || 8) : 4 });
    L.y = y0 + Math.max(34, h) + 6;
  });
  L.rule(C.line, [6, 6]);
  L.text((w.plate && w.plate.notice) || DEFAULT_NOTICE, { font: "400 21px " + FONT, color: C.seal, lh: 32 });
  return L.render();
}

function noticeCanvas(text = BASE_NOTICE) {
  const W = 900, H = 64;
  const cv = mkCanvas(W, H);
  const g = cv.getContext("2d");
  g.font = "500 36px " + FONT; g.fillStyle = C.seal; g.textAlign = "center"; g.textBaseline = "middle";
  let t = text;
  while (t.length > 4 && g.measureText(t).width > W - 20) t = t.slice(0, -1);
  g.fillText(t, W / 2, H / 2 + 2);
  return cv;
}

function sectionCanvas(sec, n) {
  const L = layout(1000, 56);
  L.text(sec.title || sec.key, { font: "900 104px " + FONT, lh: 136, maxLines: 2 });
  if (sec.sub) L.text(sec.sub, { font: "400 40px " + FONT, color: C.sub, lh: 60, maxLines: 2 });
  L.gap(14);
  L.text("작품 " + n + "점", { font: "700 32px " + LATIN, color: C.seal, lh: 46 });
  return L.render(null);
}

function introCanvas(expo, n) {
  const L = layout(1200, 90);
  L.gap(24);
  L.text("EXCAVATED 2300 · EXHIBITED NOW", { font: "700 30px " + LATIN, color: C.seal, lh: 50 });
  L.gap(14);
  L.text(expo.title || "", { font: "900 82px " + FONT, lh: 108, maxLines: 2 });
  L.gap(26);
  L.text(expo.preface || "", { font: "400 34px " + FONT, lh: 58, maxLines: 8 });
  L.gap(24);
  L.rule(C.seal, null, 30);
  L.text("이 전시의 유물은 모두 생성형 AI로 만든, 실재한 적 없는 이미지입니다.", { font: "700 30px " + FONT, color: C.seal, lh: 48 });
  L.text("작품 " + n + "점", { font: "700 28px " + LATIN, color: C.sub, lh: 48 });
  return L.render("#ffffff", 1040);
}

function endCanvas(expo, plan) {
  const L = layout(1100, 80);
  L.text(expo.title || "", { font: "900 64px " + FONT, lh: 88, maxLines: 2 });
  L.gap(10);
  L.text(plan.sections.map((s) => (s.title || s.key) + " " + s.n + "점").join("  ·  ") || "작품 0점", { font: "400 30px " + FONT, color: C.sub, lh: 48, maxLines: 3 });
  L.rule(C.seal, null, 34);
  L.text("이 전시의 유물은 모두 생성형 AI로 만든, 실재한 적 없는 이미지입니다. 작품 캡션의 발굴 연도와 출토 맥락도 학생이 지은 허구입니다.", { font: "400 32px " + FONT, color: C.seal, lh: 52, maxLines: 4 });
  return L.render("#ffffff");
}

/* 오분류 진열장 안의 분류 카드 */
function classCardCanvas(sectionTitle, no) {
  const L = layout(480, 30);
  L.box(0, 0, 480, 10, C.seal);
  L.gap(6);
  L.text("분류", { font: "400 24px " + FONT, color: C.sub, lh: 34 });
  L.text(sectionTitle || "미분류", { font: "700 40px " + FONT, lh: 54, maxLines: 2 });
  L.text("No. " + (no || ""), { font: "700 26px " + LATIN, color: C.sub, lh: 38 });
  return L.render("#fbf8ef");
}

/* 복원 표시 좌대의 복원선 (투명 바탕에 점선) */
function restoreLineCanvas(aspect) {
  const W = 800, H = Math.max(200, Math.round(W / aspect));
  const cv = mkCanvas(W, H);
  const g = cv.getContext("2d");
  g.strokeStyle = C.seal; g.lineWidth = 6; g.setLineDash([22, 14]);
  g.strokeRect(10, 10, W - 20, H - 20);
  return cv;
}

function radialCanvas(inner, outer) {
  const cv = mkCanvas(256, 256);
  const g = cv.getContext("2d");
  const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, inner); gr.addColorStop(1, outer);
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  return cv;
}

function floorCanvas() {
  const cv = mkCanvas(512, 512);
  const g = cv.getContext("2d");
  g.fillStyle = "#d6d1c7"; g.fillRect(0, 0, 512, 512);
  let s = 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 5000; i++) {
    const v = 190 + Math.floor(rnd() * 40);
    g.fillStyle = "rgba(" + v + "," + (v - 4) + "," + (v - 12) + ",0.35)";
    g.fillRect(rnd() * 512, rnd() * 512, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  g.strokeStyle = "rgba(120,112,100,0.25)"; g.lineWidth = 2;
  g.strokeRect(0, 0, 512, 512);
  return cv;
}

/* ---------- 이미지 ---------- */

function loadImage(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.decoding = "async";
    im.onload = () => res(im);
    im.onerror = () => rej(new Error("이미지를 읽지 못했습니다"));
    im.src = src;
  });
}

function imageCanvas(im, max) {
  const w0 = im.naturalWidth || im.width, h0 = im.naturalHeight || im.height;
  const sc = Math.min(1, max / Math.max(w0, h0));
  const cv = mkCanvas(Math.max(1, Math.round(w0 * sc)), Math.max(1, Math.round(h0 * sc)));
  const g = cv.getContext("2d");
  g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height);
  g.drawImage(im, 0, 0, cv.width, cv.height);
  return cv;
}

function tex(cv, { jpeg = false, repeat = null } = {}) {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (jpeg) t.userData.mimeType = "image/jpeg"; // GLB 안의 사진을 PNG보다 작게
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

/* ---------- 재질 — 전시관은 가벼운 재질, AR은 USDZ가 받는 MeshStandardMaterial ---------- */

const hallMats = {
  image: (t) => new THREE.MeshBasicMaterial(t ? { map: t } : { color: 0xcfccc4 }),
  paper: (t, transparent = false) => new THREE.MeshBasicMaterial({ map: t, transparent, depthWrite: !transparent }),
  solid: (hex) => new THREE.MeshLambertMaterial({ color: hex }),
  glass: () => new THREE.MeshLambertMaterial({ color: 0xe4eded, transparent: true, opacity: 0.14, depthWrite: false }),
};
/* 사진·글자는 기본색을 낮추고 같은 그림을 발광으로 더해, 방 조명과 상관없이 원래 색에 가깝게 보이게 한다 */
const arMats = {
  image: (t) => new THREE.MeshStandardMaterial({ map: t, color: 0x6a6a6a, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.62, roughness: 0.9, metalness: 0 }),
  paper: (t, transparent = false) => new THREE.MeshStandardMaterial({ map: t, color: 0x707070, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.6, roughness: 0.95, metalness: 0, transparent }),
  solid: (hex, rough = 0.75) => new THREE.MeshStandardMaterial({ color: hex, roughness: rough, metalness: 0 }),
  glass: () => new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.16 }),
};

function addBox(parent, mat, w, h, d, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
function addPlane(parent, mat, w, h, x, y, z) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function disposeTree(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    ms.forEach((m) => { ["map", "emissiveMap", "alphaMap"].forEach((k) => { if (m[k]) m[k].dispose(); }); m.dispose(); });
  });
}

/* ---------- 설비 한 점 ----------
   모든 설비는 로컬 +z를 바라본다. 벽면 설비는 원점이 이미지 가운데·뒷면이 z=0(벽),
   바닥 설비는 원점이 바닥이다. 반환: { group, plate(작품 캡션 판), outer: [너비, 높이], top(시선 높이) }

   spec: { fixture, box:[최대너비, 최대높이], aspect, imgTex, plate(canvas), plateW, sectionTitle, no } */
function buildPiece(M, spec) {
  const g = new THREE.Group();
  const aspect = spec.aspect > 0 ? spec.aspect : 4 / 3;
  const fit = (bw, bh) => { const w = Math.min(bw, bh * aspect); return [w, w / aspect]; };
  const plateTex = tex(spec.plate);
  const pa = spec.plate.width / spec.plate.height;
  const pw = spec.plateW;
  const nt = tex(noticeCanvas());
  const noticeMat = M.paper(nt, true);
  let plate, outer, top;

  if (isWallFixture(spec.fixture)) {
    const [bw, bh] = spec.box;
    const [w, h] = fit(bw, bh);
    let front;
    if (spec.fixture === "wall") {
      /* 단독: 검은 액자와 흰 매트, 매트 아래 여백에 허구 고지 */
      const m = 0.09 * Math.max(w, h), f = 0.028, d = 0.04;
      outer = [w + 2 * m + 2 * f, h + 2 * m + 2 * f];
      addBox(g, M.solid(0x24221f, 0.6), outer[0], outer[1], d, 0, 0, d / 2);
      addPlane(g, M.solid(0xfbfaf7, 0.95), w + 2 * m, h + 2 * m, 0, 0, d + 0.001);
      front = d + 0.002;
      const nh = Math.min(m * 0.36, 0.028);
      addPlane(g, noticeMat, nh * 14, nh, 0, -(h / 2 + m / 2), front + 0.0005);
    } else {
      /* 계열: 액자 없이 얇은 판에 띄워 같은 높이로 */
      const d = 0.025;
      outer = [w, h];
      addBox(g, M.solid(0xdedbd3, 0.9), w, h, d, 0, 0, d / 2);
      front = d + 0.001;
      const nh = 0.02;
      addPlane(g, noticeMat, nh * 14, nh, 0, -(h / 2) - 0.03, 0.002);
    }
    addPlane(g, M.image(spec.imgTex), w, h, 0, 0, front).userData.role = "image";
    const ph = pw / pa;
    const pTop = Math.min(outer[1] / 2 - 0.05, -outer[1] / 2 + 0.36);
    plate = addPlane(g, M.paper(plateTex), pw, ph, outer[0] / 2 + 0.12 + pw / 2, pTop - ph / 2, 0.006);
    plate.userData.top = pTop;
    top = 0;
  } else if (spec.fixture === "table") {
    /* 평판 진열장: 몸체 위 검은 천, 기울인 받침에 눕힌 이미지, 유리 뚜껑 */
    const bw = 1.0, bh = 0.9, bd = 0.72;
    addBox(g, M.solid(0xeeede8, 0.8), bw, bh, bd, 0, bh / 2, 0);
    addBox(g, M.solid(0x3b3934, 0.95), bw - 0.06, 0.02, bd - 0.06, 0, bh + 0.01, 0);
    const [w, h] = fit(0.8, 0.52);
    const board = new THREE.Group();
    board.position.set(0, bh + 0.06, 0);
    board.rotation.x = -Math.PI / 2 + 0.2;
    addBox(board, M.solid(0x2e2c28, 0.9), w + 0.02, h + 0.02, 0.012, 0, 0, -0.006);
    addPlane(board, M.image(spec.imgTex), w, h, 0, 0, 0.001).userData.role = "image";
    g.add(board);
    addBox(g, M.glass(), bw, 0.26, bd, 0, bh + 0.13, 0);
    outer = [bw, bh + 0.26];
    plate = addPlane(g, M.paper(plateTex), pw, pw / pa, 0, bh - 0.08 - pw / pa / 2, bd / 2 + 0.002);
    plate.userData.top = bh - 0.08;
    addPlane(g, noticeMat, 0.5, 0.5 / 14, 0, 0.1, bd / 2 + 0.002);
    top = HALL.FLOOR_TOP.table;
  } else if (spec.fixture === "case") {
    /* 입식 진열장: 좌대 위 유리장, 세운 이미지와 분류 카드 */
    const s = 0.56, ph0 = 0.95, gh = 0.72;
    addBox(g, M.solid(0xf2f1ec, 0.8), s, ph0, s, 0, ph0 / 2, 0);
    addBox(g, M.solid(0xe2e0da, 0.9), s - 0.04, 0.01, s - 0.04, 0, ph0 + 0.005, 0);
    const [w, h] = fit(0.42, 0.5);
    const panel = new THREE.Group();
    panel.position.set(0, ph0 + 0.04 + h / 2, -0.06);
    panel.rotation.x = -0.08;
    addBox(panel, M.solid(0x2e2c28, 0.9), w + 0.016, h + 0.016, 0.012, 0, 0, -0.006);
    addPlane(panel, M.image(spec.imgTex), w, h, 0, 0, 0.001).userData.role = "image";
    g.add(panel);
    const ccv = classCardCanvas(spec.sectionTitle, spec.no);
    const card = addPlane(g, M.paper(tex(ccv)), 0.15, 0.15 * ccv.height / ccv.width, 0.12, ph0 + 0.06, 0.18);
    card.rotation.x = -1.05;
    addBox(g, M.glass(), s, gh, s, 0, ph0 + 0.01 + gh / 2, 0);
    outer = [s, ph0 + gh];
    plate = addPlane(g, M.paper(plateTex), pw, pw / pa, 0, 0.8 - pw / pa / 2, s / 2 + 0.002);
    plate.userData.top = 0.8;
    addPlane(g, noticeMat, 0.44, 0.44 / 14, 0, 0.1, s / 2 + 0.002);
    top = HALL.FLOOR_TOP.case;
  } else {
    /* 좌대(복원 표시): 기울인 판에 이미지, 둘레에 점선 복원선 */
    const s = 0.5, ph0 = 1.0;
    addBox(g, M.solid(0xf2f1ec, 0.8), s, ph0, s, 0, ph0 / 2, 0);
    const [w, h] = fit(0.5, 0.48);
    const panel = new THREE.Group();
    panel.position.set(0, ph0 + 0.02 + h / 2 * Math.cos(0.17), 0.02);
    panel.rotation.x = -0.17;
    addBox(panel, M.solid(0x2e2c28, 0.9), w + 0.02, h + 0.02, 0.02, 0, 0, -0.01);
    addPlane(panel, M.image(spec.imgTex), w, h, 0, 0, 0.001).userData.role = "image";
    addPlane(panel, M.paper(tex(restoreLineCanvas((w + 0.05) / (h + 0.05))), true), w + 0.05, h + 0.05, 0, 0, 0.003);
    g.add(panel);
    outer = [s, ph0 + h];
    plate = addPlane(g, M.paper(plateTex), pw, pw / pa, 0, 0.84 - pw / pa / 2, s / 2 + 0.002);
    plate.userData.top = 0.84;
    addPlane(g, noticeMat, 0.42, 0.42 / 14, 0, 0.1, s / 2 + 0.002);
    top = HALL.FLOOR_TOP.plinth;
  }
  plate.userData.role = "plate";
  plate.userData.pw = pw;
  return { group: g, plate, outer, top };
}

/* 작품 캡션 판만 바꾼다 (1차·2차 관람 전환) — 윗변을 고정하고 높이만 바꾼다 */
function swapPlate(plate, cv) {
  const old = plate.material.map;
  plate.material.map = tex(cv);
  if (plate.material.emissiveMap) plate.material.emissiveMap = plate.material.map;
  plate.material.needsUpdate = true;
  if (old) old.dispose();
  const pw = plate.userData.pw;
  const ph = pw / (cv.width / cv.height);
  plate.geometry.dispose();
  plate.geometry = new THREE.PlaneGeometry(pw, ph);
  plate.position.y = plate.userData.top - ph / 2;
}

/* ---------- 3D 전시관 ---------- */

export function webglOk() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch (e) { return false; }
}

const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function mountHall(container, opts) {
  const expo = opts.expo || { sections: [], works: [] };
  const plan = planHall(expo);
  const reduced = !!opts.reducedMotion;
  let reveal = !!opts.reveal;

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const cvs = renderer.domElement;
  cvs.style.cssText = "display:block;width:100%;height:100%;touch-action:none;outline:none;cursor:grab";
  cvs.tabIndex = 0;
  cvs.setAttribute("aria-label", "3D 전시관. 끌어서 둘러보고, 작품을 누르면 그 앞으로 갑니다. 방향키로 걷습니다.");
  container.appendChild(cvs);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe9e7e1);
  const cam = new THREE.PerspectiveCamera(60, 1, 0.05, 200);
  cam.rotation.order = "YXZ";
  /* three.js r155 이후 조명 단위는 물리량이라 흰 벽을 희게 보이려면 세기가 π 언저리여야 한다 */
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d2c6, 2.7));
  const sun = new THREE.DirectionalLight(0xffffff, 0.9);
  sun.position.set(2, 6, 3);
  scene.add(sun);

  const { W, H } = plan;
  const half = W / 2;
  const zF = plan.zFront, zB = plan.zBack, len = zF - zB, zMid = (zF + zB) / 2;
  const wallMat = hallMats.solid(0xf4f3ef);
  const picks = new Set();
  const tagTour = (obj, t) => { obj.traverse((o) => { if (o.isMesh) { o.userData.tour = t; picks.add(o); } }); };
  const untag = (obj) => { obj.traverse((o) => { picks.delete(o); }); };

  /* 바닥·천장·벽 */
  const floor = addPlane(scene, new THREE.MeshLambertMaterial({ map: tex(floorCanvas(), { repeat: [W / 2.4, len / 2.4] }) }), W, len, 0, 0, zMid);
  floor.rotation.x = -Math.PI / 2;
  floor.userData.floor = true;
  picks.add(floor);
  const ceil = addPlane(scene, new THREE.MeshBasicMaterial({ color: 0xe6e4df }), W, len, 0, H, zMid);
  ceil.rotation.x = Math.PI / 2;
  const lwall = addPlane(scene, wallMat, len, H, -half, H / 2, zMid); lwall.rotation.y = Math.PI / 2;
  const rwall = addPlane(scene, wallMat, len, H, half, H / 2, zMid); rwall.rotation.y = -Math.PI / 2;
  const back = addPlane(scene, wallMat, W, H, 0, H / 2, zF); back.rotation.y = Math.PI;
  const endWall = addPlane(scene, wallMat, W, H, 0, H / 2, zB);
  /* 누른 곳을 찾을 때 가리는 것들 — 칸막이 너머의 작품이 눌리지 않게 */
  const occluders = [lwall, rwall, back, endWall];
  const stripMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (let z = zF - 1.5; z > zB + 0.8; z -= 3.0) {
    addBox(scene, stripMat, 0.12, 0.02, 2.2, -1.8, H - 0.011, z);
    addBox(scene, stripMat, 0.12, 0.02, 2.2, 1.8, H - 0.011, z);
  }
  /* 바닥 걸레받이 — 벽과 바닥의 경계를 보이게 */
  const baseMat = hallMats.solid(0xd9d6cf);
  addBox(scene, baseMat, 0.012, 0.08, len, -half + 0.006, 0.04, zMid);
  addBox(scene, baseMat, 0.012, 0.08, len, half - 0.006, 0.04, zMid);

  const disposables = [];
  const blocks = []; // 걸어서 통과하지 못하는 곳 [x0,x1,z0,z1]

  /* 서문 벽 */
  const introG = new THREE.Group();
  addBox(introG, wallMat, plan.intro.w, plan.intro.h, 0.2, 0, plan.intro.h / 2, 0);
  introG.position.set(0, 0, plan.intro.z);
  scene.add(introG);
  tagTour(introG, 0);
  blocks.push([-plan.intro.w / 2, plan.intro.w / 2, plan.intro.z - 0.1, plan.intro.z + 0.1]);

  /* 칸막이와 구역 이름 */
  plan.sections.forEach((s, si) => {
    const wing = HALL.WING;
    [-1, 1].forEach((side) => {
      const x = side * (half - wing / 2);
      occluders.push(addBox(scene, wallMat, wing, H, 0.14, x, H / 2, s.z0));
      blocks.push([x - wing / 2, x + wing / 2, s.z0 - 0.07, s.z0 + 0.07]);
    });
  });

  /* 글자판(서문·구역 이름·맺음)은 글꼴이 온 뒤에 그린다. 먼저 그리면 대체 글꼴로 굳는다 */
  const drawTextPanels = () => {
    const icv = introCanvas(expo, plan.items.length);
    const ia = icv.width / icv.height;
    const iw = Math.min(plan.intro.w - 0.2, (plan.intro.h - 0.2) * ia);
    tagTour(addPlane(introG, hallMats.paper(tex(icv)), iw, iw / ia, 0, plan.intro.h / 2, 0.101), 0);
    plan.sections.forEach((s) => {
      const scv = sectionCanvas(s, s.n);
      const sa = scv.width / scv.height;
      const sw = HALL.WING - 0.2;
      addPlane(scene, hallMats.paper(tex(scv), true), sw, sw / sa, -half + HALL.WING / 2, 1.75, s.z0 + 0.071);
    });
    const ecv = endCanvas(expo, plan);
    const ea = ecv.width / ecv.height;
    tagTour(addPlane(scene, hallMats.paper(tex(ecv)), 2.6, 2.6 / ea, 0, 1.6, zB + 0.01), plan.tourLength - 1);
  };

  /* 작품 */
  const haloTex = tex(radialCanvas("rgba(255,244,222,0.95)", "rgba(255,244,222,0)"));
  const shadowTex = tex(radialCanvas("rgba(40,34,26,0.55)", "rgba(40,34,26,0)"));
  disposables.push(haloTex, shadowTex);
  const secTitle = (key) => { const s = plan.sections.find((x) => x.key === key); return s ? s.title || s.key : ""; };
  const slots = plan.items.map((it) => {
    const holder = new THREE.Group();
    holder.position.set(it.anchor[0] + it.normal[0] * 0.004, it.anchor[1], it.anchor[2]);
    holder.rotation.y = Math.atan2(it.normal[0], it.normal[2]);
    scene.add(holder);
    if (!it.wall) {
      const sh = addPlane(holder, new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }), 1.7, 1.4, 0, 0.003, 0);
      sh.rotation.x = -Math.PI / 2;
      const fp = it.fixture === "table" ? [0.5, 0.36] : it.fixture === "case" ? [0.28, 0.28] : [0.25, 0.25];
      blocks.push([it.anchor[0] - fp[0], it.anchor[0] + fp[0], it.anchor[2] - fp[1], it.anchor[2] + fp[1]]);
    }
    return { it, holder, piece: null, halo: null, aspect: it.work.imgW && it.work.imgH ? it.work.imgW / it.work.imgH : 0, imgTex: null };
  });

  const build = (slot) => {
    const { it } = slot;
    if (slot.piece) { untag(slot.piece.group); slot.holder.remove(slot.piece.group); disposeTree(slot.piece.group); }
    if (slot.halo) { slot.holder.remove(slot.halo); slot.halo.geometry.dispose(); slot.halo.material.dispose(); }
    const piece = buildPiece(hallMats, {
      fixture: it.fixture, box: it.box, aspect: slot.aspect, imgTex: slot.imgTex,
      plate: plateCanvas(it.work, reveal), plateW: 0.26, sectionTitle: secTitle(it.section), no: it.work.no,
    });
    /* 벽면 작품 위의 조명 번짐 */
    if (it.wall) {
      const hw = piece.outer[0] + 0.9, hh = piece.outer[1] + 0.8;
      slot.halo = addPlane(slot.holder, new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, opacity: it.fixture === "wall" ? 0.32 : 0.2, blending: THREE.AdditiveBlending, depthWrite: false }), hw, hh, 0.1, 0.1, 0.001);
    }
    slot.holder.add(piece.group);
    slot.piece = piece;
    tagTour(piece.group, it.idx + 1);
    dirty = true;
  };

  /* ---------- 카메라와 이동 ---------- */
  const pos = new THREE.Vector3(...plan.intro.view.pos);
  let yaw = plan.intro.view.yaw, pitch = plan.intro.view.pitch;
  let anim = null;
  let dirty = true;
  let paused = false;
  let tourAt = 0;

  const blocked = (x, z) => blocks.some((b) => x > b[0] - 0.3 && x < b[1] + 0.3 && z > b[2] - 0.3 && z < b[3] + 0.3);
  const clampX = (x) => Math.max(-half + 0.35, Math.min(half - 0.35, x));
  const clampZ = (z) => Math.max(zB + 0.4, Math.min(zF - 0.4, z));
  function tryMove(nx, nz) {
    nx = clampX(nx); nz = clampZ(nz);
    if (!blocked(nx, nz)) { pos.x = nx; pos.z = nz; }
    else if (!blocked(nx, pos.z)) pos.x = nx;
    else if (!blocked(pos.x, nz)) pos.z = nz;
    dirty = true;
  }

  function flyTo(p, y, pt, dur = 900, done) {
    const from = { p: pos.clone(), yaw, pitch };
    const dy = wrapAngle(y - yaw);
    if (reduced) { pos.copy(p); yaw = y; pitch = pt; dirty = true; if (done) done(); return; }
    anim = { t0: performance.now(), dur, from, to: { p: p.clone(), yaw: from.yaw + dy, pitch: pt }, done };
  }

  /* 관람 시점: 평면의 기본 시점 대신, 지금 화면의 화각에 작품과 작품 캡션이 꼭 들어오는 거리로 선다.
     세로로 긴 휴대폰에서는 가로 화각이 좁아 더 물러선다 */
  const fitDist = (w, h) => {
    const hv = THREE.MathUtils.degToRad(cam.fov) / 2;
    const hh = Math.atan(Math.tan(hv) * cam.aspect);
    return Math.max((h / 2) / Math.tan(hv), (w / 2) / Math.tan(hh)) * 1.1;
  };
  const clampN = (x, a, b) => Math.max(a, Math.min(b, x));
  const mkView = (pos, look) => { const dx = look[0] - pos[0], dy = look[1] - pos[1], dz = look[2] - pos[2]; return { pos, yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) }; };
  const viewOf = (t) => {
    if (t <= 0) {
      const d = clampN(fitDist(plan.intro.w + 0.2, plan.intro.h + 0.2), 2.0, zF - plan.intro.z - 0.5);
      return mkView([0, plan.EYE, plan.intro.z + 0.1 + d], [0, 1.4, plan.intro.z + 0.1]);
    }
    if (t >= plan.tourLength - 1) {
      const d = clampN(fitDist(2.9, 2.0), 2.4, 5.0);
      return mkView([0, plan.EYE, zB + d], [0, 1.55, zB]);
    }
    const slot = slots[t - 1];
    const it = slot.it, p = slot.piece;
    if (!p) return it.view;
    const a = it.anchor, n = it.normal;
    if (it.wall) {
      const ph = p.plate.geometry.parameters.height, pTop = p.plate.userData.top;
      const left = -p.outer[0] / 2, right = p.outer[0] / 2 + 0.12 + p.plate.userData.pw;
      const lo = Math.min(-p.outer[1] / 2, pTop - ph), hi = Math.max(p.outer[1] / 2, pTop);
      const cx = (left + right) / 2, cy = (lo + hi) / 2;
      /* 계열은 반복을 읽는 진열이라 양옆 작품이 함께 들어오도록 물러선다 */
      const spanW = it.fixture === "series" ? Math.max(right - left + 0.2, HALL.SLOT.series * 2.3) : right - left + 0.2;
      const d = clampN(fitDist(spanW, hi - lo + 0.2), 1.0, 2.8);
      /* 로컬 +x(작품 캡션 쪽)의 세계 방향: 벽 법선 n을 y축으로 −90° 돌린 것 */
      const rx = n[2], rz = -n[0];
      const look = [a[0] + rx * cx, a[1] + cy, a[2] + rz * cx];
      return mkView([look[0] + n[0] * d, look[1] + 0.08, look[2] + n[2] * d], look);
    }
    const fw = it.fixture === "table" ? 1.0 : it.fixture === "case" ? 0.56 : 0.5;
    const top = p.outer[1];
    if (it.fixture === "table") {
      const d = clampN(fitDist(fw + 0.3, 1.0), 1.1, 2.6);
      return mkView([a[0], 1.85, a[2] + d], [a[0], 0.8, a[2] + 0.05]);
    }
    const d = clampN(fitDist(fw + 0.4, top + 0.25), 1.2, 3.0);
    return mkView([a[0], Math.min(plan.EYE, top * 0.55 + 0.45), a[2] + d], [a[0], top * 0.55, a[2]]);
  };
  function goTo(t) {
    t = Math.max(0, Math.min(plan.tourLength - 1, t | 0));
    tourAt = t;
    const v = viewOf(t);
    if (opts.onFocus) opts.onFocus(t);
    flyTo(new THREE.Vector3(...v.pos), v.yaw, v.pitch);
  }

  /* 포인터: 끌면 둘러보기, 짧게 누르면 그 작품으로 이동, 바닥을 누르면 그곳으로 걷기, 두 손가락 벌리기는 앞뒤 */
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const ptrs = new Map();
  let down = null, pinch = null, hoverT = 0;
  function pickAt(cx, cy) {
    const r = cvs.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, cam);
    /* 가장 가까운 것 하나만 본다. 벽·칸막이가 먼저 맞으면 아무것도 누르지 않은 것으로 한다 */
    const hit = ray.intersectObjects([...picks, ...occluders], false)[0];
    return hit && (hit.object.userData.tour != null || hit.object.userData.floor) ? hit : null;
  }
  const onDown = (e) => {
    cvs.focus({ preventScroll: true });
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { cvs.setPointerCapture(e.pointerId); } catch (er) {}
    if (ptrs.size === 1) down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: 0 };
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); down = null; }
    anim = null;
    cvs.style.cursor = "grabbing";
  };
  const onMove = (e) => {
    if (!ptrs.has(e.pointerId)) {
      /* 마우스를 올린 곳이 작품이면 손 모양 */
      const now = performance.now();
      if (e.pointerType === "mouse" && now - hoverT > 90) {
        hoverT = now;
        const h = pickAt(e.clientX, e.clientY);
        cvs.style.cursor = h && h.object.userData.tour != null ? "pointer" : "grab";
      }
      return;
    }
    const p = ptrs.get(e.pointerId);
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 2 && pinch != null) {
      const [a, b] = [...ptrs.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const step = (d - pinch) * 0.012;
      pinch = d;
      tryMove(pos.x - Math.sin(yaw) * step, pos.z - Math.cos(yaw) * step);
      return;
    }
    if (down) down.moved += Math.abs(dx) + Math.abs(dy);
    yaw += dx * 0.0042;
    pitch = Math.max(-0.75, Math.min(0.6, pitch + dy * 0.0036));
    dirty = true;
  };
  const onUp = (e) => {
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    cvs.style.cursor = "grab";
    if (!down || ptrs.size) { if (!ptrs.size) down = null; return; }
    const tap = down.moved < 8 && performance.now() - down.t < 600;
    down = null;
    if (!tap) return;
    const h = pickAt(e.clientX, e.clientY);
    if (!h) return;
    if (h.object.userData.tour != null) { goTo(h.object.userData.tour); return; }
    /* 바닥: 누른 곳으로 걷는다 (막힌 곳이면 앞까지만) */
    const tgt = h.point;
    let nx = clampX(tgt.x), nz = clampZ(tgt.z);
    for (let i = 0; i < 12 && blocked(nx, nz); i++) { nx += (pos.x - nx) * 0.25; nz += (pos.z - nz) * 0.25; }
    if (blocked(nx, nz)) return;
    const dist = Math.hypot(nx - pos.x, nz - pos.z);
    flyTo(new THREE.Vector3(nx, plan.EYE, nz), yaw, Math.max(-0.2, Math.min(0.1, pitch)), Math.min(1400, 350 + dist * 260));
  };
  const onWheel = (e) => {
    e.preventDefault();
    anim = null;
    const step = Math.max(-0.8, Math.min(0.8, -e.deltaY * 0.004));
    tryMove(pos.x - Math.sin(yaw) * step, pos.z - Math.cos(yaw) * step);
  };
  cvs.addEventListener("pointerdown", onDown);
  cvs.addEventListener("pointermove", onMove);
  cvs.addEventListener("pointerup", onUp);
  cvs.addEventListener("pointercancel", onUp);
  cvs.addEventListener("wheel", onWheel, { passive: false });

  /* 키보드: ↑↓·W S 앞뒤, ←→ 돌기, A D 옆걸음 */
  const keys = new Set();
  const KEYMAP = { ArrowUp: "f", KeyW: "f", ArrowDown: "b", KeyS: "b", ArrowLeft: "tl", ArrowRight: "tr", KeyA: "sl", KeyD: "sr" };
  const onKey = (e) => {
    const k = KEYMAP[e.code];
    if (!k || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.type === "keydown") { keys.add(k); anim = null; e.preventDefault(); } else keys.delete(k);
  };
  const onBlur = () => keys.clear();
  cvs.addEventListener("keydown", onKey);
  cvs.addEventListener("keyup", onKey);
  cvs.addEventListener("blur", onBlur);

  /* 크기 */
  const resize = () => {
    const w = container.clientWidth || 1, h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    cam.aspect = w / h;
    cam.fov = cam.aspect < 0.8 ? 74 : 60;
    cam.updateProjectionMatrix();
    dirty = true;
  };
  const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(container); else window.addEventListener("resize", resize);
  resize();
  { const v0 = viewOf(0); pos.set(...v0.pos); yaw = v0.yaw; pitch = v0.pitch; }

  /* 그리기 — 움직일 때만 다시 그린다 */
  let raf = 0, last = performance.now();
  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (paused) return;
    if (anim) {
      const k = Math.min(1, (now - anim.t0) / anim.dur);
      const e = easeInOut(k);
      pos.lerpVectors(anim.from.p, anim.to.p, e);
      yaw = anim.from.yaw + (anim.to.yaw - anim.from.yaw) * e;
      pitch = anim.from.pitch + (anim.to.pitch - anim.from.pitch) * e;
      dirty = true;
      if (k >= 1) { const d = anim.done; anim = null; if (d) d(); }
    }
    if (keys.size) {
      const mv = 2.2 * dt, tr = 1.7 * dt;
      if (keys.has("tl")) yaw += tr;
      if (keys.has("tr")) yaw -= tr;
      let f = 0, s = 0;
      if (keys.has("f")) f += mv;
      if (keys.has("b")) f -= mv;
      if (keys.has("sl")) s -= mv;
      if (keys.has("sr")) s += mv;
      if (f || s) tryMove(pos.x - Math.sin(yaw) * f + Math.cos(yaw) * s, pos.z - Math.cos(yaw) * f - Math.sin(yaw) * s);
      dirty = true;
    }
    if (!dirty) return;
    dirty = false;
    cam.position.copy(pos);
    cam.rotation.set(pitch, yaw, 0);
    renderer.render(scene, cam);
  };
  raf = requestAnimationFrame(loop);

  /* 이미지 불러오기 — 네 점씩 차례로. 오기 전에는 회색 판 */
  let alive = true;
  (async () => {
    await fontsReady();
    if (!alive) return;
    drawTextPanels();
    slots.forEach(build);
    let next = 0;
    const worker = async () => {
      while (alive && next < slots.length) {
        const slot = slots[next++];
        try {
          const src = await opts.getImage(slot.it.work);
          if (!src || !alive) continue;
          const im = await loadImage(src);
          if (!alive) return;
          const cv = imageCanvas(im, 768);
          slot.aspect = cv.width / cv.height;
          slot.imgTex = tex(cv);
          disposables.push(slot.imgTex);
          build(slot);
        } catch (e) { /* 읽지 못한 이미지는 회색 판으로 둔다 */ }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
  })();

  if (opts.onFocus) opts.onFocus(0);

  return {
    plan,
    tourLength: plan.tourLength,
    goTo,
    next: () => goTo(tourAt + 1),
    prev: () => goTo(tourAt - 1),
    get at() { return tourAt; },
    setReveal(b) {
      reveal = !!b;
      slots.forEach((s) => { if (s.piece) swapPlate(s.piece.plate, plateCanvas(s.it.work, reveal)); });
      dirty = true;
    },
    pause(b) { paused = !!b; if (!paused) { dirty = true; resize(); } },
    focusCanvas() { cvs.focus({ preventScroll: true }); },
    dispose() {
      alive = false;
      cancelAnimationFrame(raf);
      if (ro) ro.disconnect(); else window.removeEventListener("resize", resize);
      cvs.removeEventListener("pointerdown", onDown);
      cvs.removeEventListener("pointermove", onMove);
      cvs.removeEventListener("pointerup", onUp);
      cvs.removeEventListener("pointercancel", onUp);
      cvs.removeEventListener("wheel", onWheel);
      cvs.removeEventListener("keydown", onKey);
      cvs.removeEventListener("keyup", onKey);
      cvs.removeEventListener("blur", onBlur);
      disposeTree(scene);
      disposables.forEach((t) => t.dispose());
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch (e) {}
      cvs.remove();
    },
  };
}

/* ---------- AR 모델 ---------- */

/* 실제 크기(m)의 설비 한 점. 벽면 설비는 AR에서 벽에 걸기 알맞게 전시관보다 작게 만든다 */
async function buildArGroup(work, imgSrc, { reveal, fixture, sectionTitle }) {
  await fontsReady();
  const im = await loadImage(imgSrc);
  const cv = imageCanvas(im, 1024);
  const t = tex(cv, { jpeg: true });
  const piece = buildPiece(arMats, {
    fixture, box: fixture === "series" ? [0.45, 0.45] : [0.7, 0.62], aspect: cv.width / cv.height, imgTex: t,
    plate: plateCanvas(work, reveal, { contextLines: 12 }), plateW: 0.2, sectionTitle, no: work.no,
  });
  const root = new THREE.Group();
  root.add(piece.group);
  root.updateMatrixWorld(true);
  /* 벽면 설비는 작품 캡션까지 포함한 전체 가운데가 원점에 오도록 옮긴다 (벽에 붙일 때 치우치지 않게) */
  if (isWallFixture(fixture)) {
    const box = new THREE.Box3().setFromObject(piece.group);
    piece.group.position.x -= (box.min.x + box.max.x) / 2;
  }
  root.updateMatrixWorld(true);
  return root;
}

async function toGlb(group) {
  const ab = await new GLTFExporter().parseAsync(group, { binary: true, maxTextureSize: 1024 });
  return new Blob([ab], { type: "model/gltf-binary" });
}

/* Quick Look은 <model-viewer>가 만드는 USDZ에 벽면 고정을 넣지 않는다. 여기서 직접 만들어 ios-src로 준다 */
async function toUsdz(group, vertical) {
  const ab = await new USDZExporter().parseAsync(group, {
    ar: { anchoring: { type: "plane" }, planeAnchoring: { alignment: vertical ? "vertical" : "horizontal" } },
    quickLookCompatible: true, maxTextureSize: 1024,
  });
  return new Blob([ab], { type: "model/vnd.usdz+zip" });
}

export function mountArViewer(container, o) {
  const wall = isWallFixture(o.fixture);
  const mv = document.createElement("model-viewer");
  mv.setAttribute("ar", "");
  mv.setAttribute("ar-modes", "webxr quick-look");
  mv.setAttribute("ar-scale", "fixed"); // 실제 크기 그대로. 손가락으로 키우지 못하게
  mv.setAttribute("ar-placement", wall ? "wall" : "floor");
  mv.setAttribute("camera-controls", "");
  mv.setAttribute("touch-action", "pan-y");
  mv.setAttribute("interaction-prompt", "none");
  mv.setAttribute("shadow-intensity", "0.9");
  mv.setAttribute("exposure", "1");
  mv.setAttribute("camera-orbit", wall ? "0deg 82deg auto" : "22deg 68deg auto");
  mv.setAttribute("alt", "작품 " + (o.work.no || "") + " 3D 모델");
  mv.style.cssText = "width:100%;height:100%;background-color:#efeee9;--progress-bar-color:#B5382A";
  const btn = document.createElement("button");
  btn.slot = "ar-button";
  btn.className = "arv-arbtn";
  btn.type = "button";
  btn.textContent = o.arLabel || "AR";
  mv.appendChild(btn);
  const bar = document.createElement("div"); // 기본 진행 막대 대신 화면의 「만드는 중」 문구를 쓴다
  bar.slot = "progress-bar";
  mv.appendChild(bar);
  container.appendChild(mv);

  let alive = true, seq = 0, urls = [];
  const status = (s) => { if (alive && o.onStatus) o.onStatus(s); };
  const report = () => status({ phase: "ready", canAR: !!mv.canActivateAR });

  async function load(reveal) {
    const my = ++seq;
    status({ phase: "building" });
    let group = null;
    try {
      group = await buildArGroup(o.work, o.imgSrc, { reveal, fixture: o.fixture, sectionTitle: o.sectionTitle });
      const glb = await toGlb(group);
      const usdz = IS_IOS ? await toUsdz(group, wall) : null;
      if (!alive || my !== seq) return;
      const old = urls;
      const u1 = URL.createObjectURL(glb);
      const u2 = usdz ? URL.createObjectURL(usdz) : null;
      urls = [u1, u2].filter(Boolean);
      if (u2) mv.setAttribute("ios-src", u2);
      mv.setAttribute("src", u1);
      setTimeout(() => old.forEach((u) => URL.revokeObjectURL(u)), 4000);
    } catch (e) {
      status({ phase: "error", message: String((e && e.message) || e) });
    } finally {
      if (group) disposeTree(group);
    }
  }
  const onLoad = () => { report(); setTimeout(report, 900); }; // canActivateAR는 WebXR 확인이 끝난 뒤에 바뀐다
  const onErr = () => status({ phase: "error", message: "모델을 불러오지 못했습니다" });
  const onAr = (e) => status({ phase: "ready", canAR: !!mv.canActivateAR, ar: e.detail && e.detail.status });
  mv.addEventListener("load", onLoad);
  mv.addEventListener("error", onErr);
  mv.addEventListener("ar-status", onAr);
  load(!!o.reveal);

  return {
    setReveal: (b) => load(!!b),
    dispose() {
      alive = false;
      mv.removeEventListener("load", onLoad);
      mv.removeEventListener("error", onErr);
      mv.removeEventListener("ar-status", onAr);
      mv.remove();
      urls.forEach((u) => URL.revokeObjectURL(u));
    },
  };
}

/* 시험·내려받기용: 작품 한 점의 GLB와 USDZ를 만든다 */
export async function exportArModel(work, imgSrc, { reveal = false, fixture = "wall", sectionTitle = "" } = {}) {
  const group = await buildArGroup(work, imgSrc, { reveal, fixture, sectionTitle });
  try {
    return { glb: await toGlb(group), usdz: await toUsdz(group, isWallFixture(fixture)) };
  } finally { disposeTree(group); }
}

/* ---------- QR ---------- */

export function qrSvg(text, { margin = 2, dark = "#111111" } = {}) {
  const qr = qrcode(0, "M");
  qr.addData(String(text));
  qr.make();
  const n = qr.getModuleCount(), s = n + margin * 2;
  let d = "";
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += "M" + (c + margin) + " " + (r + margin) + "h1v1h-1z";
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + s + " " + s + '" shape-rendering="crispEdges" role="img" aria-label="QR 코드">' +
    '<rect width="' + s + '" height="' + s + '" fill="#fff"/><path d="' + d + '" fill="' + dark + '"/></svg>';
}

/* ---------- 내보내기 ---------- */

if (typeof window !== "undefined" && !window.MuseumAR) {
  window.MuseumAR = { mountHall, mountArViewer, qrSvg, webglOk, exportArModel, version: "ar1" };
}
