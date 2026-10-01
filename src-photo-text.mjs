/* ============================================================
   이미지 다듬기 편집기: 편집기에만 보이는 한국어 문구 (spec §4, §5.11, §6.12, Appendix B)
   · 도구 이름과 Photoshop 이름(도움말), 옵션·패널 이름, 혼합 모드, 단축키, 작업 내역 이름, lastError 코드의 문장.
   · 카드와 함께 쓰는 과정·작업·조정·효과·표식 이름은 src-portfolio-text.mjs에서 가져온다.
   · src-photo-doc/brush/render/io는 한글을 쓰지 않고 lk(작업 내역 키)와 오류 코드만 내보낸다. 여기서 문장으로 바꾼다.
   · WP0 골격: 담당 D가 문구를 보탠다. 규칙은 CLAUDE.md, 검사는 lintKo(photoStrings()).
   ============================================================ */
import { BLENDS } from "./src-folio-schema.mjs";
import { ADJ_TEXT, FLT_TEXT, MARK_TEXT, STAGE_TEXT, fmt } from "./src-portfolio-text.mjs";

/* ---------- 도구 (§4.6). name은 화면 이름, key는 단축키 표시, ps는 Photoshop 이름 ---------- */
export const TOOL_TEXT = {
  move: { name: "이동", key: "V", ps: "이동 도구", hint: "표식·글자·AI 레이어를 끌어 옮깁니다. 화살표 1px, Shift+화살표 10px", hintTouch: "표식·글자·AI 레이어를 끌어 옮깁니다." },
  hand: { name: "손", key: "H", ps: "손 도구", hint: "화면을 끌어 옮깁니다. 다른 도구를 쓰는 중에는 Space를 누른 채 끌어 옮깁니다.", hintTouch: "한 손가락으로 끌어 옮기고, 두 손가락을 벌리면 확대합니다." },
  zoom: { name: "돋보기", key: "Z", ps: "돋보기 도구", hint: "누르면 확대합니다. Alt를 누른 채 누르면 축소합니다.", hintTouch: "누르면 확대합니다. 「축소」를 고르면 누를 때마다 축소합니다." },
  eyedrop: { name: "스포이트", key: "I", ps: "스포이드 도구", hint: "누른 곳의 색을 정보 패널에 보여 줍니다." },
  pin: { name: "점검 표시", key: "P", ps: "메모 도구", hint: "내보낸 이미지에는 들어가지 않습니다." },
  light: { name: "빛 방향 선", key: "", ps: "눈금자 도구" },
  patchLoad: { name: "결과 불러오기", key: "", ps: "가져오기" },
  patchAlign: { name: "자동 맞추기", key: "", ps: "레이어 자동 정렬" },
  maskBrush: { name: "마스크 칠하기", key: "B", ps: "브러시 도구, 마스크" },
  crop: { name: "자르기", key: "C", ps: "자르기 도구", hint: "모서리를 끌어 범위를 정한 뒤 「적용」을 누릅니다(Enter).", hintTouch: "모서리를 끌어 범위를 정한 뒤 「적용」을 누릅니다." },
  straighten: { name: "수평 맞추기", key: "", ps: "똑바르게 하기" },
  fitObj: { name: "사물에 맞춰 자르기", key: "", ps: "" },
  rotate90: { name: "이미지 회전", key: "", ps: "이미지 회전" },
  selRect: { name: "사각형 선택", key: "M", ps: "사각형 선택 윤곽 도구" },
  selLasso: { name: "올가미", key: "L", ps: "올가미 도구" },
  selWand: { name: "자동 선택", key: "W", ps: "자동 선택 도구" },
  spot: { name: "먼지와 긁힘 지우기", key: "J", ps: "스팟 복구 브러시", hint: "사진의 먼지와 긁힘만 지웁니다. 사물에 묻은 때는 흔적입니다." },
  heal: { name: "복구 브러시", key: "Shift+J", ps: "복구 브러시 도구" },
  clone: { name: "복제 도장", key: "S", ps: "복제 도장 도구" },
  dodge: { name: "밝게·어둡게 칠하기", key: "O", ps: "닷지 도구 · 번 도구" },
  trace: { name: "흔적 그리기", key: "K", ps: "", hint: "흔적은 손이나 물건이 닿는 부분에만 그립니다." },
  sponge: { name: "스펀지", key: "", ps: "스펀지 도구" },
  blurB: { name: "흐리게 칠하기", key: "", ps: "흐림 효과 도구" },
  sharpB: { name: "선명하게 칠하기", key: "", ps: "선명 효과 도구" },
  erase: { name: "지우개", key: "E", ps: "지우개 도구" },
  measure: { name: "길이 맞추기", key: "", ps: "눈금자 도구, 측정 비율 설정", hint: "치수를 아는 부분을 따라 선을 긋습니다." },
  scaleBar: { name: MARK_TEXT.sb, key: "", ps: "축척 표시자" },
  grayCard: { name: MARK_TEXT.gs, key: "", ps: "" },
  text: { name: MARK_TEXT.txt, key: "T", ps: "수평 문자 도구", hint: "허구 표기는 이미지가 아니라 작품 캡션에 씁니다." },
  colorCard: { name: "색 기준표 (24색)", key: "", ps: "" },
  tag: { name: MARK_TEXT.tg, key: "", ps: "", hint: "작품 캡션의 번호와 같게 씁니다." },
  compare: { name: "전후 비교", key: "\\", ps: "" },
};

/* ---------- 옵션 표시줄의 이름 (§4.6, §4.8, §4.9, §4.11) ---------- */
export const OPT_TEXT = {
  size: "크기", hardness: "경도", opacity: "불투명도", flow: "흐름", aligned: "정렬",
  sample: "원본 샘플 범위", sampleBelow: "현재 및 아래", sampleAll: "모든 레이어", setSource: "원본 지정",
  pressure: "필압", pressSize: "크기", pressFlow: "흐름", pressOff: "사용 안 함", smooth: "손떨림 줄이기",
  range: "범위", shadows: "어두운 영역", mids: "중간 영역", highs: "밝은 영역", exposure: "노출", protect: "색조 보호",
  dodgeMode: "밝게", burnMode: "어둡게", spongeDown: "채도 낮추기", spongeUp: "채도 높이기", vibranceOpt: "활기",
  strength: "세기", kind: "종류", traceWear: "마모 광택", traceRust: "녹", traceStain: "얼룩", traceScratch: "긁힘",
  cell: "설계 카드 칸", traceMeter: "흔적 더한 면적: {area}",
  ratio: "비율", ratioOrig: "원본 비율", ratioFree: "자유", ratioA4: "A4 세로",
  guides: "안내선", guideThirds: "삼등분", guideGrid: "격자", guideCenter: "가운데와 여백", guideNone: "없음",
  extend: "여백 넓히기", fillColor: "채울 색", fillEdge: "가장자리 색", fillPick: "스포이트",
  angle: "각도", byLine: "선으로 맞추기", margin: "여백", rotLeft: "왼쪽으로 90°", rotRight: "오른쪽으로 90°", reset: "원래대로",
  numX: "x", numY: "y", numW: "너비", numH: "높이",
  selNew: "새 선택", selAdd: "더하기", selSub: "빼기", selAnd: "교차", feather: "가장자리 부드럽게",
  grow: "넓히기", shrink: "좁히기", tolerance: "허용치", contiguous: "인접한 곳만", allLayers: "모든 레이어 기준",
  sampleSize: "표본", sample1: "1px", sample3: "3×3", sample5: "5×5",
  font: "글꼴", gothic: "고딕", serif: "명조", color: "색", black: "검정", white: "흰색", pickColor: "직접 고르기",
  weight: "굵기", normal: "보통", bold: "굵게", align: "정렬", alignLeft: "왼쪽", alignCenter: "가운데", alignRight: "오른쪽",
  length: "길이", auto: "자동", dir: "방향", horizontal: "가로", vertical: "세로", position: "위치",
  bottomCenter: "아래 가운데", bottomLeft: "아래 왼쪽", bottomRight: "아래 오른쪽", rightVertical: "오른쪽 세로",
  bottom: "아래", left: "왼쪽", mmTicks: "첫 칸 mm 눈금", labelsAll: "눈금 숫자 모두", labelsEnds: "양 끝", barHeight: "막대 높이",
  realLen: "실제 길이 (cm)", whatLen: "무엇의 길이", oblique: "비스듬히 찍은 화면입니다", useLong: "사물의 긴 변으로 맞추기",
  startXY: "시작 x·y", endXY: "끝 x·y", startX: "시작점 x", startY: "시작점 y", endX: "끝점 x", endY: "끝점 y", tagNo: "번호", tagHint: "형식: 2300-KR-000 · 작품 번호 {no}",
  pinKind: "종류", pinTrace: "흔적 위치", pinKeep: "그대로 둘 곳", pinFix: "고칠 곳", pinItem: "연결 항목", pinCell: "설계 카드 칸",
  alignRange: "범위", maskPaint: "칠하기", maskErase: "지우기", zoomOut: "축소",
  // 조정 (§4.8)
  brightness: "밝기", contrast: "대비", legacy: "이전 방식", channel: "채널", chRgb: "RGB", chRed: "빨강", chGreen: "녹색", chBlue: "파랑",
  inBlack: "입력 검정", gamma: "감마", inWhite: "입력 흰색", outBlack: "출력 검정", outWhite: "출력 흰색", levelsAuto: "자동",
  hue: "색조", saturation: "채도", lightness: "명도", colorize: "색상화",
  hsAll: "전체", hsRed: "빨강", hsYellow: "노랑", hsGreen: "녹색", hsCyan: "청록", hsBlue: "파랑", hsMagenta: "자홍",
  tint: "색 입히기", curveMode: "방식", curveSmooth: "부드럽게", curveBasic: "기본",
  exposureStops: "노출", offset: "오프셋", vibrance: "활기",
  cbShadows: "어두운 영역", cbMids: "중간 영역", cbHighs: "밝은 영역", cbCyanRed: "녹청·빨강", cbMagentaGreen: "자홍·녹색",
  cbYellowBlue: "노랑·파랑", keepLum: "광도 유지",
  pfWarm85: "따뜻하게 (85)", pfWarm81: "따뜻하게 (81)", pfCool80: "차갑게 (80)", pfCool82: "차갑게 (82)", pfCustom: "직접 고르기",
  density: "농도", gpTarget: "목표 밝기", gpKeep: "그대로", gpGrey: "18% 회색 (118)", gpStrength: "세기",
  // 효과 (§4.9)
  amount: "양", radius: "반경", threshold: "한계값", grainSize: "크기", mono: "단색", midpoint: "중간점",
  shdShadows: "어두운 영역", shdHighs: "밝은 영역", seed: "무늬 번호",
};

/* ---------- 패널·표시줄·알림 (Appendix B 편집기, §4.3–§4.14, §6.8–§6.12) ---------- */
export const PANEL_TEXT = {
  title: "이미지 다듬기", close: "닫기", undo: "되돌리기", redo: "다시 실행", adv: "도구 더 보기", all: "모든 도구", keys: "단축키", save: "저장",
  secProcess: "과정", secProps: "속성", secLayers: "레이어", secHistory: "작업 내역", secHist: "히스토그램 · 정보", secInfo: "정보",
  stageStrip: "다듬기 과정", todo: "할 일", todoMark: "할 일 ●", optional: "선택", changed: "바꿈", now: "지금", skipped: "건너뜀",
  divider: STAGE_TEXT.fix.sub, nextStage: "다음: {stage}", stageLog: "이 과정의 수정 기록", skipStage: "이 과정 건너뛰기",
  backToStage: "이 과정을 시작할 때로 되돌리기", backEvicted: "작업 내역이 길어 이 과정의 처음으로 되돌릴 수 없습니다.",
  fit: "화면에 맞추기", actual: "100%", zoomIn: "확대", zoomOutCmd: "축소", zoom: "확대 {n}%",
  flipView: "좌우 반전해서 보기", holdOrig: "원본 보기(누르고 있기)", setSource: "원본 지정", fingerPaint: "손가락으로 칠하기",
  baseLayer: "생성 원본", missing: "불러오지 못함", reload: "다시 불러오기", computing: "계산 중", previewBadge: "미리 보기",
  useDraft: "이 초안 쓰기", rewrite: "고쳐 쓰기", toDraft: "초안으로 바꾸기", toDraftAsk: "지금 쓴 문장을 지우고 초안을 씁니다. 바꿀까요?",
  useLong: "사물의 긴 변으로 맞추기", bgMean: "배경 평균으로 맞추기", addText: "글자 추가", addPin: "표시 추가", addLine: "선 추가",
  addPoint: "조절점 추가", selNumeric: "선택 영역을 숫자로 정하기", handle: "조절점",
  txtMax: "글자 레이어는 두 개까지 만들 수 있습니다.", curveMax: "곡선의 조절점은 모두 16개까지 넣을 수 있습니다.",
  hsMax: "색 범위는 다섯 개까지 바꿀 수 있습니다.",
  outsideTool: "{toolTopic} ‘{stage}’의 도구입니다. 여기서 쓴 내용도 수정 기록에 들어갑니다.",
  layerMade: "‘{name}’ 레이어를 만들었습니다.", pinTouched: "흔적 위치로 표시한 곳을 고쳤습니다.",
  baseProtect: "생성 원본은 바꿀 수 없습니다. 새 레이어나 마스크에서 작업하세요.",
  needCal: "먼저 「길이 맞추기」로 기준 치수를 정하세요.", obliqueHint: "비스듬히 찍힌 화면에서는 스케일 바가 정확하지 않습니다.",
  sizeMismatch: "작품 캡션의 크기({size})와 스케일 바 기준 치수({cm}cm)가 다릅니다.",
  bgNotFound: "배경을 찾지 못했습니다. 자동 선택으로 직접 고르세요.",
  vgWarn: "가장자리를 어둡게 하면 고른 빛과 맞지 않을 수 있습니다.",
  bgReadout: "배경: 평균 R·G·B {r}·{g}·{b}, 무채색 차이 {s}", bgTarget: "목표: 무채색 차이 {n} 이하",
  lightMeet: "한 점에서 만남", lightOff: "어긋남 {n}°",
  planLine: "3회차에서 정한 다듬기 계획", inspectTable: "점검표", pairSaw: "짝이 읽은 내용", keepReason: "그대로 두는 이유",
  routedChip: "{stage}에서 고침", fixedItem: "고친 항목", keepPlace: "그대로 둘 곳 표시", newRetouch: "새 손질 레이어",
  aiTool: "사용한 도구", aiRegion: "다시 그리게 한 부위", aiPrompt: "그 부위에 넣은 프롬프트", tries: "시도 횟수",
  acceptRange: "맞출 범위", changedView: "바뀐 곳 보기", nudge1: "위치 1px 옮기기", scaleNudge: "크기 ±0.5%",
  maskSoft: "마스크 가장자리 부드럽게", maskInvert: "마스크 반전", grain: "결 맞추기",
  applyScope: "적용 범위", scopeAll: "전체", scopeBg: "배경만", scopeSel: "선택 영역", bgOnly: "배경만 고르기",
  selAll: "모두 선택", deselect: "선택 해제", invertSel: "선택 반전",
  panelAdjust: "조정", panelEffect: "효과", autoTone: "자동 톤", autoContrast: "자동 대비", autoColor: "자동 색상",
  outputMode: "출력 방식", screenPost: "화면 게시", print: "인쇄", paperA4: "A4", paperA5: "A5", printBw: "흑백",
  exportBtn: "내보내기", phraseA: "표기 문장", phraseB: "AI 활용 범위 문장", phraseC: "제작 과정 문장",
  checklist: "확정 전 점검",
  hide: "{name} 숨기기", show: "{name} 보이기", maskBadge: "마스크", lockLayer: "레이어 잠금", blend: "혼합 모드",
  addMask: "마스크 추가", maskAll: "모두 보이기", maskSel: "선택 영역에서", delMask: "마스크 삭제", invMask: "마스크 반전",
  clearLayer: "레이어 비우기", delLayer: "삭제", rename: "이름 바꾸기", up: "위로", down: "아래로",
  dupLayer: "레이어 복제", mergeDown: "아래 레이어와 합치기", layerLimit: "레이어를 더 만들 수 없습니다. 레이어를 합치거나 지운 뒤 다시 시도하세요.",
  histChannel: "채널", histLum: "광도", histRgb: "RGB", histRed: "빨강", histGreen: "녹색", histBlue: "파랑",
  histMean: "평균", histSd: "표준 편차", histMedian: "중간값", clipLo: "어두운 쪽 잘림 {n}%", clipHi: "밝은 쪽 잘림 {n}%",
  infoPos: "위치", infoRgb: "R·G·B", infoBright: "밝기", infoNeutral: "무채색 차이", docSize: "{w}×{h}px",
  printInfo: "{w}×{h}px · 인쇄하면 약 {cw}×{ch}cm ({ppi}ppi)", selSize: "선택 영역 {w}×{h}px",
  cmpNone: "비교 안 함", cmpWipe: "슬라이더", cmpSide: "나란히", cmpMarks: "손질한 곳 보기",
  cmpWipeLabel: "전후 비교 위치", cmpWipeValue: "다듬기 전 {a}%, 다듬기 후 {b}%", origLayout: "원래 구도로 보기",
  layerCompare: "레이어 보이기·숨기기로 비교",
  legendAi: "AI 부분 수정: {area}", legendHand: "손질: {area}", legendTrace: "흔적: {area}", legendLocal: "부분 조정: {area}",
  canvasLabel: "다듬는 화면: {summary}", canvasLayers: "레이어 {n}개", canvasCrop: "{ratio}로 자름",
  closeBar: "저장하지 않은 변경이 있습니다.", saveClose: "저장하고 닫기", closeNoSave: "저장하지 않고 닫기", cancel: "취소",
  retrySave: "다시 저장", closeAnyway: "그대로 닫기",
  draftOffer: "이 기기에만 임시 저장된 편집이 있습니다 ({time}). 이어서 할까요?", resume: "이어서 하기", startSaved: "저장된 내용으로 시작",
  draftNewer: "다른 기기에서 그 뒤에 저장한 내용이 있습니다. 이어서 하면 그 내용을 덮어씁니다.",
  otherDevice: "다른 기기에서 이 작품을 저장했습니다.", loadOther: "그 내용 불러오기",
  loadOtherAsk: "지금 이 기기에서 편집한 내용은 지워집니다. 불러올까요?", keepMine: "이 기기 내용으로 계속",
  otherLoaded: "다른 기기에서 저장한 다듬기를 불러왔습니다.",
  waitSave: "앞서 하던 저장을 마치는 중입니다. 끝나면 이미지를 불러옵니다.",
  prevSaved: "앞서 하던 저장이 방금 끝났습니다.",
  memTrimmed: "메모리가 부족해 오래된 되돌리기 기록을 비웠습니다.",
  conflictHeld: "편집 내용은 이 기기에 임시 저장했습니다. 어느 내용으로 할지 고르면 저장합니다.",
  memTrimFail: "오래된 되돌리기 기록을 비웠지만 메모리가 모자랍니다. 저장한 뒤 다듬기 화면을 닫았다가 다시 여세요.", prevLoaded: "앞서 저장한 내용을 불러왔습니다.", keepMineSame: "지금 편집한 내용으로 계속",
  secondTab: "다듬기 화면이 다른 탭에서 이미 열려 있습니다. 그 탭에서 이어서 하세요.",
  phoneMode: "가벼운 편집", phoneOnly: "이 과정은 화면이 넓은 기기(태블릿·컴퓨터)에서 할 수 있습니다.",
  baseMissing: "다듬을 이미지를 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 다시 여세요.",
  missingLayers: "일부 레이어를 불러오지 못했습니다. 불러온 레이어만 보입니다.",
  memClose: "이 기기의 메모리가 부족합니다. 다른 탭을 닫고 다시 열어 주세요.",
  // WP4/WP5 (D): 껍데기와 패널에서 더 쓰는 문구
  loading: "이미지를 불러오는 중입니다", noBase: "생성 이미지를 고르면 다듬기를 시작할 수 있습니다.",
  toolsLabel: "도구", optsLabel: "도구 옵션", viewLabel: "다듬는 화면", sideLabel: "패널", bottomLabel: "보기",
  apply: "적용", applyKey: "적용 (Enter)", cancelKey: "취소 (Esc)", viewOnly: "보기만 할 수 있는 화면입니다.",
  confirmedRO: "다듬기를 확정했습니다. 다시 고치려면 ‘비교와 확정’에서 「확정 풀기」를 누르세요.",
  undoDone: "되돌리기: {name}", redoDone: "다시 실행: {name}", nothingUndo: "되돌릴 작업이 없습니다.",
  stageMarkSr: { changed: " (바꿈)", now: " (지금)", todo: " (할 일)", optional: " (선택)", skipped: " (건너뜀)", hidden: " (아직 열리지 않음)" },
  stageGroup: "{stage} 도구", outsideGroup: "다른 과정의 도구", toolStageOf: "‘{stage}’ 도구",
  sourceArm: "원본으로 쓸 곳을 누르세요.", sourceSet: "원본을 지정했습니다.", needSource: "먼저 「원본 지정」으로 원본을 고르세요.",
  needMask: "이 레이어에는 마스크가 없습니다. 먼저 「마스크 추가」를 누르세요.", needLayer: "레이어를 먼저 고르세요.",
  noSelection: "선택 영역이 없습니다. 먼저 선택 도구로 범위를 고르세요.", selMade: "선택 영역: {w}×{h}px",
  gpArm: "회색이어야 할 곳을 누르세요.", gpDone: "회색 맞추기 기준을 정했습니다.", pickedColor: "색을 골랐습니다: R·G·B {r}·{g}·{b}",
  cropSize: "자른 크기 {w}×{h}px", lineHint: "기울어진 선을 따라 끌어 놓으면 그 선이 수평이 되도록 맞춥니다.",
  rotateLeft: "왼쪽으로 90° 돌리기", rotateRight: "오른쪽으로 90° 돌리기", fitMargin: "여백 {n}%",
  method: "방법", result: "판정", undecided: "미정", noPlan: "3회차 다듬기 계획이 없습니다.",
  pinLabel: "점검 표시 {n}: {kind}", delPin: "표시 지우기", lineLabel: "빛 방향 선 {n}", delLine: "선 지우기",
  lineEndA: "그림자 끝", lineEndB: "사물 쪽 점", pinsCount: "점검 표시 {n}개", linesNone: "빛 방향 선이 없습니다.",
  calApply: "기준 치수 정하기", calNow: "기준 치수: {cm}cm ({px}px)", calNone: "기준 치수가 없습니다.", calCleared: "기준 치수를 지웠습니다.",
  addBar: "스케일 바 넣기", addGray: "회색 기준표 넣기", addChart: "색 기준표 넣기", addTag: "유물번호표 넣기",
  editMark: "{name} 고르기", textBox: "글자 내용", textDone: "글자 확정 (Ctrl+Enter)", textEdit: "글자 고치기",
  textEmpty: "글자를 쓴 뒤 확정하세요.", markLimit: "표식과 글자는 모두 네 개까지 넣을 수 있습니다.",
  exported: "내보낸 이미지: {w}×{h}px", exportNeed: "아직 내보내지 않았습니다.", exporting: "내보내는 중입니다",
  checkTitle: "확정하기 전에 고칠 것", checkGo: "‘{stage}’ 과정으로 가기", checkOk: "확정할 준비가 되었습니다.",
  draftBox: "자동 초안", ownText: "직접 쓴 문장", phraseNone: "아직 만들 초안이 없습니다.",
  layerName: "레이어 이름", selLayer: "고른 레이어", lockedGlyph: "잠김", layersList: "레이어 목록", layerSelect: "{name} 고르기",
  propsEmpty: "조정·효과·표식 레이어를 고르면 여기서 값을 바꿉니다.", propsOf: "{name} 속성", numField: "{name} 값",
  histFirst: "열었을 때", histList: "작업 내역 목록", histGoto: "되돌아가기: {target}",
  meter: "{name}: {area}", cellText: "설계 카드: {text}", cellEmpty: "설계 카드 칸이 비어 있습니다.",
  nudgeUp: "위로 1px", nudgeDown: "아래로 1px", nudgeLeft: "왼쪽으로 1px", nudgeRight: "오른쪽으로 1px",
  scaleUp: "0.5% 크게", scaleDown: "0.5% 작게", patchFile: "부분 수정 결과 이미지 파일", patchLoaded: "부분 수정 결과를 불러왔습니다.",
  alignDone: "위치를 맞췄습니다: {dx}, {dy}px, 크기 {sc}%", noAiLayer: "불러온 부분 수정 결과가 없습니다.",
  wideOnly: "넓은 화면에서 쓰는 도구입니다.", fingerPaintOn: "손가락으로 칠하기", penSeen: "펜이 감지되어 손가락으로는 화면 이동과 확대만 합니다.",
  sheetTabs: "패널 고르기", sheetGrow: "패널 크게", sheetShrink: "패널 작게", phoneSave: "저장", dialogKeys: "단축키와 손동작", gestures: "두 손가락 탭: 되돌리기 · 세 손가락 탭: 다시 실행 · 두 손가락으로 벌리기: 확대",
  bgSelected: "배경을 골랐습니다 ({area}).", maskShown: "적용 범위를 빨간색으로 잠깐 보여 줍니다.",
  fromS5c: "5차시 점검표에서 가져옴", fromPlan: "3회차 계획에서 가져옴",
  layerHidden: "숨긴 레이어에는 칠할 수 없습니다. 먼저 레이어를 보이게 하세요.",
  // 검토 r3 반영 (D)
  delLayerAsk: "‘{name}’ 레이어를 삭제할까요?",
  phoneTraceOnly: "이 기기에서는 흔적 그리기만 쓸 수 있습니다. 다른 손질 도구는 태블릿·컴퓨터에서 씁니다.",
  bgMet: "맞음", bgNotMet: "아직 맞지 않음", jumpLabel: "패널 바로 가기", psTitle: "{name} · Photoshop: {ps}",
};

/** blend mode names (index = BLENDS index) */
export const BLEND_LABEL = ["표준", "어둡게 하기", "곱하기", "색상 번", "밝게 하기", "스크린", "색상 닷지", "선형 닷지(추가)", "오버레이",
  "소프트 라이트", "하드 라이트", "차이", "제외", "색조", "채도", "색상", "광도"];
if (BLEND_LABEL.length !== BLENDS.length) throw new Error("BLEND_LABEL and BLENDS differ in length");

/* ---------- 단축키 표 (§4.7). 「단축키」 대화상자가 이 표로 만든다 ---------- */
export const SHORTCUT_TEXT = [
  ["V M L W C I J S O K T H Z P B E", "도구 고르기"],
  ["Shift+J", "복구 브러시"],
  ["Shift+O", "어둡게 칠하기"],
  ["[ ]", "크기 줄이기·키우기"],
  ["Shift+[ Shift+]", "경도 줄이기·높이기"],
  ["1 … 9, 0", "불투명도 10%~90%, 100%"],
  ["Space (누르고 있기)", "손"],
  ["Alt+클릭", "원본 지정"],
  ["\\ (누르고 있기)", "원본 보기"],
  ["Enter / Esc", "적용 / 취소"],
  ["Delete, Backspace", "선택 영역 지우기"],
  ["화살표 (Shift: 10px)", "고른 표식·글자·표시 옮기기"],
  ["Ctrl+Z", "되돌리기"],
  ["Ctrl+Y, Ctrl+Shift+Z", "다시 실행"],
  ["Ctrl+S", "저장"],
  ["Ctrl+0 / Ctrl+1", "화면에 맞추기 / 100%"],
  ["Ctrl+= / Ctrl+-", "확대 / 축소"],
  ["Ctrl+A / Ctrl+D", "모두 선택 / 선택 해제"],
  ["Ctrl+J / Ctrl+E", "레이어 복제 / 아래 레이어와 합치기"],
  ["Ctrl+L / Ctrl+M / Ctrl+U", "새 레벨 / 새 곡선 / 새 색조·채도·명도"],
];

/* ---------- 작업 내역 이름 (§5.11). 명령은 lk만 들고 다니고 여기서 이름을 붙인다. {n}은 명령의 ln ---------- */
export const HIST_TEXT = {
  open: "열었을 때",
  spot: "먼지와 긁힘 지우기", heal: "복구 브러시", clone: "복제 도장", dodge: "밝게 칠하기", burn: "어둡게 칠하기",
  sponge: "스펀지", bsb: "흐리게 칠하기", shb: "선명하게 칠하기", trace: "흔적 그리기", erase: "지우개", maskPaint: "마스크 칠하기",
  strokes: "{name} 획 {n}개",
  layerNew: "새 레이어", layerDel: "레이어 삭제", layerDup: "레이어 복제", layerMerge: "아래 레이어와 합치기", layerMove: "레이어 순서 바꾸기",
  layerClear: "레이어 비우기", layerVis: "보이기·숨기기", layerOp: "불투명도 바꾸기", layerBlend: "혼합 모드 바꾸기",
  layerLock: "레이어 잠금", layerRename: "이름 바꾸기", layerLink: "연결 항목 바꾸기",
  maskAdd: "마스크 추가", maskDel: "마스크 삭제", maskInv: "마스크 반전", maskFeather: "마스크 가장자리 부드럽게",
  adjNew: "{name} {n} 만들기", adjEdit: "{name} {n} 수정",
  selRect: "사각형 선택", selLasso: "올가미", selWand: "자동 선택", selBg: "배경만 고르기", selAll: "모두 선택",
  deselect: "선택 해제", selInvert: "선택 반전", selFeather: "가장자리 부드럽게", selGrow: "선택 영역 넓히기", selShrink: "선택 영역 좁히기",
  selNumeric: "선택 영역을 숫자로 정하기",
  crop: "자르기", straighten: "수평 맞추기", rotate: "이미지 회전", extend: "여백 넓히기", fill: "채울 색 바꾸기",
  measure: "길이 맞추기", pin: "점검 표시", pinMove: "점검 표시 옮기기", pinDel: "점검 표시 지우기", line: "빛 방향 선",
  route: "점검표 바꾸기", patch: "결과 불러오기", align: "자동 맞추기",
  textNew: "글자 추가", textEdit: "글자 수정", markNew: "{name} 덧붙이기", markEdit: "{name} 수정", markMove: "{name} 옮기기",
  layerAiMove: "AI 레이어 옮기기",
};

/* ---------- lastError 코드와 저장 오류의 문장 (§6.12) ---------- */
export const ERR_TEXT = {
  limit: "레이어를 더 만들 수 없습니다. 레이어를 합치거나 지운 뒤 다시 시도하세요.",
  memory: "기기 메모리가 부족합니다. 저장한 뒤 다듬기 화면을 닫았다가 다시 여세요.",
  locked: "선생님이 학습지 입력을 잠갔습니다.",
  aspect: "이미지의 가로세로 비율이 달라 맞출 수 없습니다. 같은 비율로 다시 받아 오세요.",
  base: "생성 원본은 바꿀 수 없습니다. 새 레이어나 마스크에서 작업하세요.",
  missing: "일부 레이어를 불러오지 못했습니다. 불러온 레이어만 보입니다.",
  size: "수정 기록이 너무 길어 저장할 수 없습니다. 레이어를 합치거나 지운 뒤 다시 저장하세요.",
  patchPx: "이 기기에서는 긴 변이 2048px 이하인 이미지만 불러올 수 있습니다.",
};

/* ---------- 도우미 ---------- */
const NAME_OF = { ...ADJ_TEXT, ...FLT_TEXT, ...MARK_TEXT };
/** @returns {string} 「{name} ({key}) · Photoshop: {ps}」; the key part or the Photoshop part is left out when the tool has none */
export function tooltip(toolId) {
  const t = TOOL_TEXT[toolId];
  if (!t) return String(toolId);
  return t.name + (t.key ? " (" + t.key + ")" : "") + (t.ps ? " · Photoshop: " + t.ps : "");
}
/** @returns {string} the 작업 내역 row text of a command or an undo/redo result {lk, ln}. lk "adjNew:lv" names the adjustment.
 *  Unknown keys come back as the key itself (WP0 stub rule). */
export function histLabel(c) {
  if (!c) return "";
  const lk = String(c.lk || "");
  const [k, sub] = lk.split(":");
  const tpl = HIST_TEXT[k];
  if (!tpl) return lk;
  return fmt(tpl, { n: c.ln == null ? "" : c.ln, name: NAME_OF[sub] || HIST_TEXT[sub] || sub || "" }).trim();
}
function collect(x, out) {
  if (typeof x === "string") out.push(x);
  else if (Array.isArray(x)) x.forEach((y) => collect(y, out));
  else if (x && typeof x === "object") Object.values(x).forEach((y) => collect(y, out));
  return out;
}
/** @returns {string[]} every string in every exported table */
export function photoStrings() {
  return collect([TOOL_TEXT, OPT_TEXT, PANEL_TEXT, BLEND_LABEL, SHORTCUT_TEXT, HIST_TEXT, ERR_TEXT, ADJ_PS], []);
}

/* ---------- 조정·효과 타일의 Photoshop 메뉴 이름 (검토 r3 E4; 타일 title = PANEL_TEXT.psTitle) ---------- */
export const ADJ_PS = {
  bc: "명도/대비", lv: "레벨", cv: "곡선", ex: "노출", hs: "색조/채도", vb: "활기", cb: "색상 균형", pf: "포토 필터",
  gp: "레벨: 회색 점 설정", bw: "흑백", usm: "언샵 마스크", gb: "가우시안 흐림 효과", nz: "노이즈 추가", vg: "렌즈 교정: 비네팅",
  shd: "어두운 영역/밝은 영역",
};
