/* ============================================================
   학생 이미지 업로드 — 품질 규정과 변환 (src-app.jsx FieldEditor가 쓴다)

   저장소는 Firestore media 문서(base64 dataURL, 문서 1 MiB 하드 리밋)라서
   파일 그대로 올릴 수 없고 브라우저에서 줄여 JPEG로 굳힌다. 이 파일은
   ① 너무 작은(저품질) 원본을 막는 하한, ② 고품질을 유지하는 상한과 축소 방식,
   ③ 흐림 판정을 한곳에 모은다. 항목별 규정은 IMG_PRESETS 한 표만 고치면 된다.
   ============================================================ */

/* 항목별 규정.
   maxPx    저장할 긴 변 (원본이 더 작으면 늘리지 않는다)
   maxChars dataURL 글자 수 상한 — media 문서 한 개의 크기. 규칙 sizeOk(<1,000,000)와
            Firestore 1 MiB 안에 들도록 950,000을 넘기지 않는다 (글자 수 ≈ 바이트 수)
   minLong / minShort  원본 해상도 하한 — 미리보기·썸네일·작게 줄인 사본을 거른다 */
export const IMG_PRESETS = {
  // 관찰 사진·에스키스 사진·다듬기 전후·설치 사진 — 휴대전화 사진은 3000px 이상이라 하한이 넉넉하다
  photo: { maxPx: 1600, maxChars: 600000, minLong: 640, minShort: 320, name: "사진" },
  // 생성 회차 결과 화면 — 도구 화면을 잘라 낸 캡처라 하한을 낮춘다
  screen: { maxPx: 1200, maxChars: 400000, minLong: 480, minShort: 240, name: "결과 화면" },
  // 전시 대표 이미지 — 전시장과 상호평가 사본(긴 변 1000px)의 원본이므로 가장 크게 남긴다
  hero: { maxPx: 2000, maxChars: 950000, minLong: 1000, minShort: 500, name: "대표 이미지" },
};

export function imgPresetOf(fieldKey) {
  if (fieldKey === "s7x.img") return IMG_PRESETS.hero;
  if (fieldKey === "s5b.rounds") return IMG_PRESETS.screen;
  return IMG_PRESETS.photo;
}

const Q_START = 0.9;   // JPEG 품질 시작
const Q_MIN = 0.6;     // 이 아래로는 내리지 않고 대신 변을 15%씩 줄인다 — 뭉개진 큰 그림보다 선명한 작은 그림
const Q_STEP = 0.05;
export const BLUR_VAR = 12;   // 라플라시안 분산이 이보다 작으면 흐림 경고 (하드 차단이 아니라 확인 질문)

/* 파일 → 이미지 요소. 브라우저가 EXIF 회전을 적용한 크기가 naturalWidth/Height로 온다 */
function loadFile(file) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(err("decode", { type: file.type, name: file.name })); };
    img.src = url;
  });
}

function err(code, info) {
  const e = new Error(code);
  e.code = code;
  Object.assign(e, info || {});
  return e;
}

/* 고품질 축소 — 2배 넘게 줄일 때는 절반씩 단계적으로 줄인다 (한 번에 줄이면 계단·모아레).
   흰 바탕을 먼저 깔아 PNG의 투명 영역이 JPEG에서 검게 되지 않게 한다 */
function drawScaled(img, w, h) {
  let src = img, sw = img.naturalWidth || img.width, sh = img.naturalHeight || img.height;
  while (sw >= w * 2 && sh >= h * 2) {
    const c = document.createElement("canvas");
    c.width = Math.max(w, Math.round(sw / 2));
    c.height = Math.max(h, Math.round(sh / 2));
    const cx = c.getContext("2d");
    cx.imageSmoothingEnabled = true; cx.imageSmoothingQuality = "high";
    cx.drawImage(src, 0, 0, c.width, c.height);
    src = c; sw = c.width; sh = c.height;
  }
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const ctx = cv.getContext("2d");
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, w, h);
  return cv;
}

/* 선명도 — 긴 변 400px 회색조에서 라플라시안 분산. 초점이 나간 사진은 한 자리 수,
   글씨·윤곽이 있는 사진은 수십~수백. 값이 낮아도 안개·그러데이션 작품일 수 있어 경고만 한다 */
export function sharpness(source) {
  const sw = source.naturalWidth || source.width, sh = source.naturalHeight || source.height;
  const sc = Math.min(1, 400 / Math.max(sw, sh));
  const w = Math.max(3, Math.round(sw * sc)), h = Math.max(3, Math.round(sh * sc));
  const cv = drawScaled(source, w, h);
  let px;
  try { px = cv.getContext("2d").getImageData(0, 0, w, h).data; } catch (e) { return null; }
  const g = new Float32Array(w * h);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) g[j] = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  let sum = 0, sum2 = 0, n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const c = y * w + x;
      const lap = 4 * g[c] - g[c - 1] - g[c + 1] - g[c - w] - g[c + w];
      sum += lap; sum2 += lap * lap; n++;
    }
  }
  if (!n) return null;
  const mean = sum / n;
  return Math.max(0, sum2 / n - mean * mean);
}

/* 파일 하나를 규정에 맞춰 검사하고 줄인다.
   성공: { data, w, h, srcW, srcH, q, sharp, blurry }
   실패: Error.code = "type" | "decode" | "small" | "big"  (imgErrText로 문장을 만든다) */
export async function prepareImage(file, preset) {
  const p = preset || IMG_PRESETS.photo;
  // 확장자만 이상한 파일은 type이 비어 오므로 비어 있으면 일단 열어 본다
  if (file.type && !/^image\//.test(file.type)) throw err("type", { type: file.type, name: file.name });
  const img = await loadFile(file);
  const srcW = img.naturalWidth || img.width, srcH = img.naturalHeight || img.height;
  if (!srcW || !srcH) throw err("decode", { type: file.type, name: file.name });
  const long = Math.max(srcW, srcH), short = Math.min(srcW, srcH);
  if (long < p.minLong || short < p.minShort) throw err("small", { srcW, srcH, preset: p });

  const sharp = sharpness(img);
  const blurry = sharp != null && sharp < BLUR_VAR;

  let px = Math.min(p.maxPx, long);
  while (px >= p.minLong) {
    const sc = px / long;
    const w = Math.max(1, Math.round(srcW * sc)), h = Math.max(1, Math.round(srcH * sc));
    const cv = drawScaled(img, w, h);
    for (let q = Q_START; q >= Q_MIN - 1e-9; q -= Q_STEP) {
      const data = cv.toDataURL("image/jpeg", q);
      if (data.length <= p.maxChars) return { data, w, h, srcW, srcH, q: Math.round(q * 100) / 100, sharp, blurry };
    }
    px = Math.round(px * 0.85);
  }
  throw err("big", { srcW, srcH, preset: p });
}

/* 오류 → 학생에게 보이는 문장 */
export function imgErrText(e) {
  const code = e && e.code;
  if (code === "type") return "이미지 파일만 올릴 수 있습니다 (JPG·PNG·WebP).";
  if (code === "decode") {
    const heic = /heic|heif/i.test(String((e && e.type) || "") + String((e && e.name) || ""));
    return heic
      ? "아이폰 HEIC 사진은 이 브라우저에서 열 수 없습니다. 아이폰 설정 → 카메라 → 포맷을 「호환성 우선」으로 바꾸거나 JPG로 변환해 올려 주세요."
      : "이 파일을 열 수 없습니다. JPG나 PNG로 저장한 사진을 올려 주세요.";
  }
  if (code === "small") {
    const p = e.preset || IMG_PRESETS.photo;
    return `${p.name}이 너무 작습니다 (${e.srcW}×${e.srcH}px). 긴 변 ${p.minLong}px 이상인 원본을 올려 주세요 — 미리보기·썸네일이나 메신저로 받아 줄어든 사본이 아닌지 확인하세요.`;
  }
  if (code === "big") return "사진을 줄여도 저장 한도를 넘습니다. 다른 사진으로 시도해 주세요.";
  return "사진을 처리하지 못했습니다. 다른 파일로 다시 시도해 주세요.";
}

/* 입력칸 아래 안내 문장 */
export function imgHintText(preset) {
  const p = preset || IMG_PRESETS.photo;
  return `JPG·PNG·WebP, 긴 변 ${p.minLong}px 이상 원본 · 긴 변 ${p.maxPx}px까지 선명하게 줄여 저장합니다.`;
}

/* 흐림 경고 — 확인을 누르면 그대로 올린다 */
export const BLUR_CONFIRM = "사진이 흐릿해 보입니다. 초점이 맞았는지 확인하고, 그래도 이 사진을 올리려면 「확인」을 누르세요.";
