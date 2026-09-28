/* 체험용 도식 도판 — 사진이 없는 예시 작품 9점을 캔버스로 그린다(1024×559, 예시 A·B·C 도판과 같은 비율).
   강한 작품은 유물 기록 사진의 형식(중립 회색 배경·고른 조명·접지 그림자·눈금자)을 따르고,
   약한 작품은 형식을 일부러 어긴다(어두운 거리·공상 과학 조명·광고 사진 배경). 판정할 때 「이미지의 핍진성」을 가를 수 있게 하려는 것이다. */

const W = 1024, H = 559;

function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function grain(ctx, amt, R) {
  const img = ctx.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (R() - 0.5) * amt;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function archBg(ctx) {
  const g = ctx.createRadialGradient(W * 0.42, H * 0.38, 40, W * 0.5, H * 0.5, W * 0.72);
  g.addColorStop(0, "#b3b2ae"); g.addColorStop(0.6, "#a3a29e"); g.addColorStop(1, "#8b8a86");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

/* 고고학 눈금자 — 위쪽 절반은 눈금, 아래쪽 절반은 흑백 칸 */
function scaleBar(ctx, x, y, len = 250, h = 30, vertical = false) {
  ctx.save();
  ctx.translate(x, y);
  if (vertical) ctx.rotate(-Math.PI / 2);
  ctx.shadowColor = "rgba(0,0,0,.25)"; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
  ctx.fillStyle = "#f4f3ef"; ctx.fillRect(0, 0, len, h);
  ctx.shadowColor = "transparent";
  ctx.strokeStyle = "#2a2a28"; ctx.lineWidth = 1.2; ctx.strokeRect(0.5, 0.5, len - 1, h - 1);
  const seg = (len - 8) / 6;
  for (let i = 0; i < 6; i += 1) { ctx.fillStyle = i % 2 ? "#f4f3ef" : "#1d1d1b"; ctx.fillRect(4 + i * seg, h / 2, seg, h / 2 - 4); }
  ctx.strokeStyle = "#1d1d1b"; ctx.lineWidth = 1;
  for (let t = 0; t <= 40; t += 1) {
    const tx = 4 + (seg * 2) * (t / 40);
    ctx.beginPath(); ctx.moveTo(tx, 4); ctx.lineTo(tx, t % 5 ? 9 : 13); ctx.stroke();
  }
  ctx.restore();
}

function label(ctx, dark) {
  ctx.save();
  ctx.font = "500 22px 'Noto Sans KR', sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = dark ? "rgba(255,255,255,.85)" : "rgba(20,20,20,.82)";
  ctx.fillText("체험용 도식 도판", W / 2, H - 22);
  ctx.restore();
}

function withShadow(ctx, blur, oy, alpha, fn) {
  ctx.save(); ctx.shadowColor = "rgba(0,0,0," + alpha + ")"; ctx.shadowBlur = blur; ctx.shadowOffsetY = oy; ctx.shadowOffsetX = oy * 0.4; fn(); ctx.restore();
}

function scratches(ctx, R, x0, y0, w, h, n, color, maxLen = 26, width = 1.2) {
  ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = "round";
  for (let i = 0; i < n; i += 1) {
    const x = x0 + R() * w, y = y0 + R() * h, a = (R() - 0.5) * 1.2, l = 4 + R() * maxLen;
    ctx.globalAlpha = 0.3 + R() * 0.6;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
  }
  ctx.restore();
}

/* ---------- 이름표를 뗀 안전모 ---------- */
function helmet(ctx, R) {
  archBg(ctx);
  const shell = () => {
    ctx.beginPath(); ctx.moveTo(318, 336);
    ctx.bezierCurveTo(318, 190, 410, 128, 522, 126);
    ctx.bezierCurveTo(640, 124, 716, 196, 720, 336);
    ctx.closePath();
  };
  withShadow(ctx, 34, 16, 0.38, () => { ctx.fillStyle = "#e8e6df"; ctx.beginPath(); ctx.ellipse(520, 340, 238, 26, 0, 0, Math.PI * 2); ctx.fill(); });
  ctx.fillStyle = "#dedcd4"; ctx.beginPath(); ctx.ellipse(520, 340, 238, 26, 0, 0, Math.PI * 2); ctx.fill();
  const g = ctx.createLinearGradient(330, 130, 700, 340);
  g.addColorStop(0, "#fbfaf5"); g.addColorStop(0.45, "#ecebe4"); g.addColorStop(1, "#c3c1b8");
  withShadow(ctx, 20, 8, 0.25, () => { ctx.fillStyle = g; shell(); ctx.fill(); });
  ctx.save(); shell(); ctx.clip();
  ctx.fillStyle = "rgba(255,255,255,.55)"; ctx.beginPath(); ctx.ellipse(470, 190, 110, 40, -0.35, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(120,118,110,.55)"; ctx.lineWidth = 3;
  [[-40, 0], [0, 0], [40, 0]].forEach(([dx]) => { ctx.beginPath(); ctx.moveTo(522 + dx * 1.4, 128); ctx.bezierCurveTo(520 + dx * 2.2, 200, 518 + dx * 2.6, 280, 516 + dx * 2.8, 336); ctx.stroke(); });
  /* 왼쪽 면에 몰린 긁힘과 깨짐 */
  scratches(ctx, R, 322, 190, 140, 150, 170, "rgba(70,68,62,.9)", 22, 1.3);
  for (let i = 0; i < 9; i += 1) {
    const x = 330 + R() * 110, y = 230 + R() * 100, r = 4 + R() * 9;
    ctx.fillStyle = "rgba(96,92,82,.85)"; ctx.beginPath();
    for (let k = 0; k < 7; k += 1) { const a = (k / 7) * Math.PI * 2, rr = r * (0.6 + R() * 0.6); ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.fill();
  }
  /* 시멘트 먼지 */
  for (let i = 0; i < 380; i += 1) { ctx.fillStyle = "rgba(120,116,104," + (0.2 + R() * 0.4) + ")"; ctx.fillRect(330 + R() * 380, 300 + R() * 36, 1.6, 1.6); }
  ctx.restore();
  /* 이름표 뗀 자국 */
  ctx.save(); ctx.translate(600, 250); ctx.rotate(0.12);
  ctx.fillStyle = "rgba(205,190,146,.85)"; ctx.fillRect(-46, -17, 92, 34);
  ctx.strokeStyle = "rgba(160,140,96,.9)"; ctx.lineWidth = 1; ctx.strokeRect(-46, -17, 92, 34);
  ctx.strokeStyle = "rgba(250,248,240,.9)"; ctx.lineWidth = 1.4;
  for (let i = 0; i < 26; i += 1) { const x = -44 + R() * 88, y = -15 + R() * 30; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (R() - 0.5) * 14, y + (R() - 0.5) * 6); ctx.stroke(); }
  ctx.restore();
  /* 올이 풀린 턱끈 */
  ctx.strokeStyle = "#3d3c38"; ctx.lineWidth = 9; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(380, 346); ctx.bezierCurveTo(390, 440, 520, 460, 610, 420); ctx.stroke();
  ctx.strokeStyle = "#57554f"; ctx.lineWidth = 1.2;
  for (let i = 0; i < 12; i += 1) { ctx.beginPath(); ctx.moveTo(610, 420); ctx.lineTo(612 + R() * 22, 412 + R() * 22); ctx.stroke(); }
  scaleBar(ctx, 720, 440);
}

/* ---------- 모서리가 닳은 배달 가방 ---------- */
function bag(ctx, R) {
  archBg(ctx);
  const front = [[318, 196], [628, 214], [628, 452], [318, 440]];
  const side = [[628, 214], [748, 172], [744, 402], [628, 452]];
  const top = [[318, 196], [440, 156], [748, 172], [628, 214]];
  const poly = (p) => { ctx.beginPath(); p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); };
  withShadow(ctx, 36, 18, 0.45, () => { ctx.fillStyle = "#2f3033"; poly([[318, 196], [440, 156], [748, 172], [744, 402], [628, 452], [318, 440]]); ctx.fill(); });
  const gf = ctx.createLinearGradient(318, 200, 628, 450); gf.addColorStop(0, "#3c3d41"); gf.addColorStop(1, "#27282b");
  ctx.fillStyle = gf; poly(front); ctx.fill();
  const gs = ctx.createLinearGradient(628, 180, 748, 440); gs.addColorStop(0, "#4a4843"); gs.addColorStop(1, "#353430");
  ctx.fillStyle = gs; ctx.beginPath(); ctx.moveTo(628, 214); ctx.lineTo(748, 172);
  ctx.bezierCurveTo(760, 250, 736, 300, 750, 402); ctx.lineTo(628, 452); ctx.closePath(); ctx.fill();
  /* 열에 우그러진 옆면의 변색 */
  ctx.fillStyle = "rgba(120,86,48,.35)"; ctx.beginPath(); ctx.ellipse(700, 300, 38, 70, 0.1, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#4d4e52"; poly(top); ctx.fill();
  /* 겉감 짜임 */
  ctx.save(); poly(front); ctx.clip();
  ctx.strokeStyle = "rgba(255,255,255,.05)"; ctx.lineWidth = 1;
  for (let y = 190; y < 460; y += 4) { ctx.beginPath(); ctx.moveTo(310, y); ctx.lineTo(640, y + 18); ctx.stroke(); }
  /* 반쯤 벗겨진 반사띠 */
  const gr = ctx.createLinearGradient(318, 300, 628, 330); gr.addColorStop(0, "#d9dbdc"); gr.addColorStop(0.5, "#aeb2b4"); gr.addColorStop(1, "#d0d2d3");
  ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(318, 302); ctx.lineTo(470, 311); ctx.lineTo(470, 331); ctx.lineTo(318, 322); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "rgba(210,212,214,.35)"; ctx.fillRect(470, 312, 158, 19);
  /* 짐받이에 쓸려 뚫린 아래 모서리 — 노란 단열재 */
  [[318, 404, 52, 38], [578, 414, 50, 38]].forEach(([x, y, w, h]) => {
    ctx.fillStyle = "#d9b64a"; ctx.beginPath(); ctx.ellipse(x + w / 2, y + h / 2 + 6, w / 2, h / 2, 0, 0, Math.PI * 2); ctx.fill();
    for (let i = 0; i < 90; i += 1) { ctx.fillStyle = "rgba(150,118,30," + R() * 0.6 + ")"; ctx.fillRect(x + R() * w, y + 6 + R() * h, 2, 2); }
    ctx.strokeStyle = "rgba(20,20,20,.8)"; ctx.lineWidth = 1.4;
    for (let i = 0; i < 14; i += 1) { const a = R() * Math.PI * 2; ctx.beginPath(); ctx.moveTo(x + w / 2 + Math.cos(a) * w * 0.45, y + h / 2 + 6 + Math.sin(a) * h * 0.45); ctx.lineTo(x + w / 2 + Math.cos(a) * w * 0.62, y + h / 2 + 6 + Math.sin(a) * h * 0.62); ctx.stroke(); }
  });
  ctx.restore();
  /* 들린 반사띠 끝 */
  ctx.fillStyle = "#c5c8ca"; ctx.beginPath(); ctx.moveTo(470, 311); ctx.quadraticCurveTo(500, 290, 512, 262); ctx.lineTo(522, 268); ctx.quadraticCurveTo(508, 300, 470, 331); ctx.closePath(); ctx.fill();
  /* 지퍼와 케이블 타이 */
  ctx.strokeStyle = "#1c1c1c"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(328, 198); ctx.lineTo(620, 216); ctx.stroke();
  ctx.strokeStyle = "#111"; ctx.lineWidth = 4; ctx.beginPath(); ctx.ellipse(588, 226, 10, 16, 0.2, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(592, 240); ctx.lineTo(600, 262); ctx.stroke();
  scratches(ctx, R, 330, 360, 280, 80, 60, "rgba(160,160,160,.5)", 18, 1);
  scaleBar(ctx, 772, 470, 210, 26);
}

/* ---------- 사진 부분이 닳은 출입증 ---------- */
function card(ctx, R) {
  archBg(ctx);
  /* 올이 풀린 목걸이 줄 */
  ctx.strokeStyle = "#39495e"; ctx.lineWidth = 16; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(450, 184); ctx.bezierCurveTo(360, 60, 180, 110, 150, 250); ctx.bezierCurveTo(130, 360, 240, 430, 330, 420); ctx.stroke();
  ctx.strokeStyle = "rgba(200,210,225,.35)"; ctx.lineWidth = 1;
  for (let i = 0; i < 70; i += 1) { const t = R(); const x = 150 + (R() - 0.5) * 10 + t * 20, y = 160 + t * 220; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (R() - 0.5) * 18, y + R() * 10); ctx.stroke(); }
  /* 케이스 */
  withShadow(ctx, 26, 12, 0.35, () => { ctx.fillStyle = "rgba(235,238,240,.95)"; ctx.beginPath(); ctx.roundRect(356, 176, 340, 232, 14); ctx.fill(); });
  ctx.strokeStyle = "rgba(90,96,100,.6)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(356, 176, 340, 232, 14); ctx.stroke();
  ctx.fillStyle = "#8b8d90"; ctx.beginPath(); ctx.roundRect(502, 186, 48, 12, 6); ctx.fill();
  /* 클립 구멍 옆 금 */
  ctx.strokeStyle = "rgba(60,60,60,.8)"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(552, 192); ctx.lineTo(566, 206); ctx.lineTo(561, 222); ctx.lineTo(575, 238); ctx.stroke();
  /* 카드 인쇄 */
  ctx.save(); ctx.beginPath(); ctx.roundRect(372, 210, 308, 186, 10); ctx.clip();
  ctx.fillStyle = "#f7f7f5"; ctx.fillRect(372, 210, 308, 186);
  ctx.fillStyle = "#2d5f9e"; ctx.fillRect(372, 210, 308, 40); ctx.fillRect(372, 372, 308, 24);
  ctx.fillStyle = "#e7eef7"; for (let i = 0; i < 8; i += 1) ctx.fillRect(560 + (i % 4) * 28, 262 + Math.floor(i / 4) * 26, 18, 14);
  ctx.fillStyle = "#b7c3d2"; ctx.fillRect(392, 262, 88, 100);
  ctx.fillStyle = "#6b7684"; ctx.fillRect(492, 276, 140, 12); ctx.fillRect(492, 300, 96, 10); ctx.fillRect(492, 322, 120, 10);
  ctx.fillStyle = "#fff"; ctx.font = "700 18px 'Archivo', sans-serif"; ctx.fillText("ACCESS", 390, 237);
  /* 엄지가 닿는 자리만 둥글게 닳음 */
  const gw = ctx.createRadialGradient(470, 305, 10, 470, 305, 92);
  gw.addColorStop(0, "rgba(250,250,248,1)"); gw.addColorStop(0.72, "rgba(248,248,246,.92)"); gw.addColorStop(1, "rgba(248,248,246,0)");
  ctx.fillStyle = gw; ctx.beginPath(); ctx.ellipse(470, 305, 100, 72, -0.2, 0, Math.PI * 2); ctx.fill();
  scratches(ctx, R, 400, 250, 150, 110, 40, "rgba(150,150,150,.35)", 14, 1);
  ctx.restore();
  /* 접힌 모서리 */
  ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.beginPath(); ctx.moveTo(680, 372); ctx.lineTo(680, 396); ctx.lineTo(656, 396); ctx.closePath(); ctx.fill();
  scaleBar(ctx, 740, 462, 220, 26);
}

/* ---------- 가운데만 닳은 계단 미끄럼막이 ---------- */
function nosing(ctx, R) {
  archBg(ctx);
  const x0 = 150, x1 = 874, yt = 214, yb = 296, yf = 330;
  /* 콘크리트 잔편 */
  for (let i = 0; i < 7; i += 1) {
    const cx = x0 + 60 + R() * (x1 - x0 - 120), cy = yf + 16 + R() * 20, r = 16 + R() * 22;
    withShadow(ctx, 10, 5, 0.3, () => { ctx.fillStyle = "#8f8b83"; ctx.beginPath(); for (let k = 0; k < 8; k += 1) { const a = (k / 8) * Math.PI * 2, rr = r * (0.6 + R() * 0.5); ctx.lineTo(cx + Math.cos(a) * rr * 1.4, cy + Math.sin(a) * rr * 0.7); } ctx.fill(); });
    for (let k = 0; k < 40; k += 1) { ctx.fillStyle = "rgba(60,58,54," + R() * 0.6 + ")"; ctx.fillRect(cx + (R() - 0.5) * r * 2, cy + (R() - 0.5) * r * 0.9, 2, 2); }
  }
  withShadow(ctx, 30, 16, 0.42, () => { ctx.fillStyle = "#9da0a2"; ctx.fillRect(x0, yt, x1 - x0, yf - yt); });
  const gtop = ctx.createLinearGradient(0, yt, 0, yb); gtop.addColorStop(0, "#b9bcbe"); gtop.addColorStop(1, "#8e9295");
  ctx.fillStyle = gtop; ctx.fillRect(x0, yt, x1 - x0, yb - yt);
  const gfr = ctx.createLinearGradient(0, yb, 0, yf); gfr.addColorStop(0, "#7c8083"); gfr.addColorStop(1, "#5d6164");
  ctx.fillStyle = gfr; ctx.fillRect(x0, yb, x1 - x0, yf - yb);
  /* 홈 — 양 끝은 선명, 가운데 25cm 폭은 평평하게 닳아 광택 */
  const m0 = 330, m1 = 690;
  for (let y = yt + 6; y < yb - 2; y += 7) {
    ctx.strokeStyle = "rgba(40,42,44,.75)"; ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(x0 + 6, y); ctx.lineTo(m0 - 20, y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(m1 + 20, y); ctx.lineTo(x1 - 6, y); ctx.stroke();
    ctx.strokeStyle = "rgba(40,42,44,.18)"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(m0 - 20, y); ctx.lineTo(m1 + 20, y); ctx.stroke();
  }
  const gp = ctx.createLinearGradient(m0 - 30, 0, m1 + 30, 0);
  gp.addColorStop(0, "rgba(230,232,234,0)"); gp.addColorStop(0.2, "rgba(236,238,240,.8)"); gp.addColorStop(0.5, "rgba(250,251,252,.95)"); gp.addColorStop(0.8, "rgba(236,238,240,.8)"); gp.addColorStop(1, "rgba(230,232,234,0)");
  ctx.fillStyle = gp; ctx.fillRect(m0 - 30, yt + 3, m1 - m0 + 60, yb - yt - 6);
  scratches(ctx, R, m0, yt + 6, m1 - m0, yb - yt - 12, 120, "rgba(120,124,128,.45)", 30, 1);
  /* 뜯긴 나사 구멍 */
  [[x0 + 80, 255], [x1 - 80, 255]].forEach(([x, y]) => {
    ctx.fillStyle = "#2a2b2c"; ctx.beginPath(); ctx.ellipse(x, y, 11, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#cfd2d4"; ctx.lineWidth = 1.2; for (let k = 0; k < 8; k += 1) { const a = R() * Math.PI * 2; ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 11, y + Math.sin(a) * 8); ctx.lineTo(x + Math.cos(a) * 17, y + Math.sin(a) * 12); ctx.stroke(); }
  });
  scaleBar(ctx, 700, 440, 250, 28);
}

/* ---------- 피복이 갈라진 충전기 뭉치 ---------- */
function cables(ctx, R) {
  archBg(ctx);
  const paths = [
    [[210, 300], [330, 120], [520, 470], [640, 200], [780, 330], [840, 250]],
    [[260, 420], [380, 200], [470, 140], [600, 420], [700, 460], [820, 400]],
    [[300, 180], [440, 400], [560, 260], [520, 150], [680, 180], [760, 150]],
  ];
  const draw = (p, w, c) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); for (let i = 1; i + 2 < p.length + 1; i += 2) { const c1 = p[i], e = p[i + 1] || p[i]; ctx.quadraticCurveTo(c1[0], c1[1], e[0], e[1]); } ctx.stroke(); };
  paths.forEach((p) => { withShadow(ctx, 12, 6, 0.35, () => draw(p, 11, "#cfcdc6")); });
  paths.forEach((p) => { draw(p, 11, "#8e8c85"); draw(p, 8, "#f3f2ec"); });
  /* 플러그와 그 옆의 누렇게 갈라진 피복 */
  const plug = (x, y, a, usb) => {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    withShadow(ctx, 8, 4, 0.35, () => { ctx.fillStyle = "#f0efe9"; ctx.beginPath(); ctx.roundRect(-14, -12, 46, 24, 6); ctx.fill(); });
    ctx.fillStyle = "#b9bcbe"; ctx.fillRect(32, usb ? -9 : -5, usb ? 26 : 16, usb ? 18 : 10);
    ctx.fillStyle = "#d8c27a"; ctx.fillRect(-40, -5, 26, 10);
    ctx.fillStyle = "#b87333"; ctx.fillRect(-30, -2, 7, 4);
    ctx.strokeStyle = "rgba(90,70,30,.8)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-38, -5); ctx.lineTo(-24, 5); ctx.stroke();
    ctx.restore();
  };
  plug(862, 244, -0.4, true); plug(842, 398, -0.2, false); plug(782, 146, -0.1, true);
  /* 전기 테이프 */
  ctx.save(); ctx.translate(372, 250); ctx.rotate(0.9); ctx.fillStyle = "#151515"; ctx.fillRect(-16, -8, 32, 16);
  ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.lineWidth = 1; for (let i = -12; i < 16; i += 5) { ctx.beginPath(); ctx.moveTo(i, -8); ctx.lineTo(i + 3, 8); ctx.stroke(); } ctx.restore();
  scaleBar(ctx, 90, 470, 210, 26);
}

/* ---------- 밥 칸만 긁힌 급식 식판 ---------- */
function tray(ctx, R) {
  archBg(ctx);
  const x = 250, y = 96, w = 524, h = 372;
  const steel = (x0, y0, x1, y1, a, b) => { const g = ctx.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, a); g.addColorStop(1, b); return g; };
  withShadow(ctx, 34, 16, 0.4, () => { ctx.fillStyle = steel(x, y, x + w, y + h, "#d6d9db", "#9da2a5"); ctx.beginPath(); ctx.roundRect(x, y, w, h, 34); ctx.fill(); });
  ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, w, h, 34); ctx.clip();
  ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.lineWidth = 1; for (let i = 0; i < 90; i += 1) { const yy = y + R() * h; ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy + (R() - 0.5) * 6); ctx.stroke(); }
  ctx.restore();
  const well = (wx, wy, ww, wh, r) => {
    ctx.fillStyle = steel(wx, wy, wx + ww, wy + wh, "#8f9497", "#c7cacc"); ctx.beginPath(); ctx.roundRect(wx, wy, ww, wh, r); ctx.fill();
    ctx.strokeStyle = "rgba(60,64,66,.55)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(wx, wy, ww, wh, r); ctx.stroke();
  };
  well(282, 126, 140, 118, 16); well(442, 126, 140, 118, 16); well(602, 126, 140, 118, 16);
  well(282, 266, 250, 176, 22); well(552, 266, 190, 176, 22);
  /* 밥 칸(왼쪽 아래)만 숟가락 자국이 촘촘 */
  ctx.save(); ctx.beginPath(); ctx.roundRect(282, 266, 250, 176, 22); ctx.clip();
  ctx.strokeStyle = "rgba(245,247,248,.55)"; ctx.lineWidth = 1;
  for (let i = 0; i < 260; i += 1) { const cx = 300 + R() * 214, cy = 280 + R() * 150, r = 10 + R() * 34, a = R() * Math.PI * 2; ctx.beginPath(); ctx.arc(cx, cy, r, a, a + 0.6 + R() * 1.2); ctx.stroke(); }
  ctx.strokeStyle = "rgba(60,62,64,.35)";
  for (let i = 0; i < 120; i += 1) { const cx = 300 + R() * 214, cy = 280 + R() * 150, r = 10 + R() * 30, a = R() * Math.PI * 2; ctx.beginPath(); ctx.arc(cx, cy, r, a, a + 0.4 + R()); ctx.stroke(); }
  ctx.restore();
  scratches(ctx, R, 560, 280, 170, 150, 10, "rgba(240,240,240,.4)", 14, 1);
  /* 눌린 모서리와 물 얼룩 */
  ctx.fillStyle = "rgba(70,72,74,.35)"; ctx.beginPath(); ctx.ellipse(752, 112, 30, 18, 0.7, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(230,232,224,.45)"; ctx.lineWidth = 2; [[640, 180, 26], [700, 360, 18], [360, 170, 22]].forEach(([cx, cy, r]) => { ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.7, 0.3, 0, Math.PI * 2); ctx.stroke(); });
  scaleBar(ctx, 802, 470, 190, 26);
}

/* ---------- 약한 작품: 형식을 어긴 도판 ---------- */
function umbrella(ctx, R) {
  const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#0a1020"); g.addColorStop(1, "#1a2638");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 26; i += 1) { const x = R() * W, y = R() * H * 0.7, r = 10 + R() * 40; ctx.fillStyle = (R() < 0.5 ? "rgba(255,150,60," : "rgba(80,160,255,") + (0.08 + R() * 0.16) + ")"; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
  ctx.strokeStyle = "rgba(200,220,255,.35)"; ctx.lineWidth = 1;
  for (let i = 0; i < 260; i += 1) { const x = R() * W, y = R() * H, l = 10 + R() * 26; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - l * 0.25, y + l); ctx.stroke(); }
  const gg = ctx.createLinearGradient(0, 400, 0, H); gg.addColorStop(0, "rgba(60,90,140,.0)"); gg.addColorStop(1, "rgba(90,130,200,.35)"); ctx.fillStyle = gg; ctx.fillRect(0, 400, W, H - 400);
  ctx.save(); ctx.translate(512, 250);
  ctx.fillStyle = "#07090d"; ctx.beginPath(); ctx.moveTo(-230, 20);
  ctx.quadraticCurveTo(-200, -170, 0, -180); ctx.quadraticCurveTo(200, -170, 230, 20);
  for (let k = 0; k < 6; k += 1) { const x0 = 230 - (k + 1) * (460 / 6); ctx.quadraticCurveTo(x0 + 460 / 12, -10, x0, 20); }
  ctx.fill();
  ctx.strokeStyle = "rgba(90,200,255,.9)"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-228, 16); ctx.quadraticCurveTo(-198, -166, 0, -178); ctx.stroke();
  ctx.strokeStyle = "rgba(255,150,70,.85)"; ctx.beginPath(); ctx.moveTo(0, -178); ctx.quadraticCurveTo(198, -166, 228, 16); ctx.stroke();
  ctx.strokeStyle = "#0b0d10"; ctx.lineWidth = 8; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(0, -180); ctx.lineTo(0, 200); ctx.arc(-24, 200, 24, 0, Math.PI); ctx.stroke();
  ctx.restore();
}

function capsule(ctx, R) {
  const g = ctx.createRadialGradient(512, 260, 30, 512, 280, 620); g.addColorStop(0, "#14304a"); g.addColorStop(1, "#02060c");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(60,200,255,.18)"; ctx.beginPath(); ctx.ellipse(512, 440, 200, 30, 0, 0, Math.PI * 2); ctx.fill();
  const body = (y0, a) => {
    const gb = ctx.createLinearGradient(430, 0, 594, 0); gb.addColorStop(0, "rgba(160,170,180," + a + ")"); gb.addColorStop(0.35, "rgba(250,252,255," + a + ")"); gb.addColorStop(1, "rgba(120,130,140," + a + ")");
    ctx.fillStyle = gb; ctx.beginPath(); ctx.roundRect(430, y0, 164, 280, 82); ctx.fill();
  };
  withShadow(ctx, 60, 0, 0.0, () => body(110, 1));
  ctx.save(); ctx.shadowColor = "rgba(60,220,255,1)"; ctx.shadowBlur = 24; ctx.strokeStyle = "#7ef3ff"; ctx.lineWidth = 4;
  [180, 250, 320].forEach((y) => { ctx.beginPath(); ctx.moveTo(438, y); ctx.lineTo(586, y); ctx.stroke(); });
  ctx.beginPath(); ctx.moveTo(512, 120); ctx.lineTo(512, 380); ctx.stroke(); ctx.restore();
  ctx.save(); ctx.globalAlpha = 0.22; ctx.translate(0, 900); ctx.scale(1, -1); body(110, 1); ctx.restore();
  for (let i = 0; i < 80; i += 1) { ctx.fillStyle = "rgba(160,230,255," + R() * 0.6 + ")"; ctx.fillRect(R() * W, R() * H, 1.5, 1.5); }
}

function chair(ctx) {
  ctx.fillStyle = "#f4c20d"; ctx.fillRect(0, 0, W, H);
  const drawChair = (dx, dy, col, leg) => {
    ctx.save(); ctx.translate(dx, dy);
    ctx.strokeStyle = leg; ctx.lineWidth = 12; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(430, 300); ctx.lineTo(400, 470); ctx.moveTo(600, 300); ctx.lineTo(630, 470); ctx.moveTo(450, 300); ctx.lineTo(470, 450); ctx.moveTo(580, 300); ctx.lineTo(560, 450); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(585, 290); ctx.lineTo(600, 110); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(410, 270, 220, 40, 16); ctx.fill();
    ctx.beginPath(); ctx.roundRect(560, 90, 90, 130, 22); ctx.fill();
    ctx.restore();
  };
  drawChair(46, 18, "rgba(120,90,0,.55)", "rgba(120,90,0,.55)");
  const gs = ctx.createLinearGradient(410, 270, 630, 310); gs.addColorStop(0, "#3b7cf0"); gs.addColorStop(1, "#1d4fbf");
  const gl = ctx.createLinearGradient(0, 300, 0, 470); gl.addColorStop(0, "#f2f4f6"); gl.addColorStop(1, "#8b9096");
  drawChair(0, 0, gs, gl);
  ctx.fillStyle = "rgba(255,255,255,.6)"; ctx.beginPath(); ctx.roundRect(424, 276, 150, 8, 4); ctx.fill(); ctx.beginPath(); ctx.roundRect(572, 100, 12, 90, 6); ctx.fill();
}

const DRAW = { helmet, bag, card, nosing, cables, tray, umbrella, capsule, chair };
const DARK = { umbrella: true, capsule: true };

/* 이름 → JPEG dataURL. 문서가 캔버스를 못 쓰면 null */
export function drawRelic(name, seed = 7) {
  if (typeof document === "undefined" || !DRAW[name]) return null;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  if (!ctx) return null;
  const R = rng(seed + name.length * 131);
  DRAW[name](ctx, R);
  grain(ctx, name === "chair" ? 6 : 14, R);
  label(ctx, !!DARK[name]);
  return cv.toDataURL("image/jpeg", 0.86);
}
