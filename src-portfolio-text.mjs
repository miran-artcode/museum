/* ============================================================
   생성과 다듬기 포트폴리오: 카드·core·교사 화면의 한국어 문구 (spec Appendix B, §3, §6.12, §7)
   · 학생·교사 화면에 보이는 고정 문구는 모두 여기(T와 표들)에 둔다. 편집기에만 보이는 문구는 src-photo-text.mjs.
   · 저장소 CLAUDE.md의 한국어 문장 규칙을 따른다. lintKo가 규칙을 검사하고 단위 시험이 allStrings() 전체를 돌린다.
   · 템플릿의 {이름}은 fmt(s, {이름: 값})로 채운다. 조사는 josa(단어, "을/를")로 붙인다.
   ============================================================ */
import { PRESETS } from "./src-folio-schema.mjs";

/** fill {name} slots of a template; missing values become "" */
export function fmt(s, vars = {}) {
  return String(s).replace(/\{(\w+)\}/g, (m, k) => (vars[k] == null ? "" : String(vars[k])));
}

/* ---------- 고정 문구 ---------- */
export const T = {
  // 카드 머리와 표시줄 (§1.1, §3.1)
  title: "생성과 다듬기 포트폴리오",
  note: "세 번의 생성과 다듬기를 이미지와 함께 기록합니다.",
  fieldSteps: "세 번의 생성",
  fieldEdit: "이미지 다듬기",
  fieldNotes: "다듬기 과정 기록",
  fieldTrash: "정리할 이미지 목록",
  stripLabel: "생성과 다듬기",
  tabRef: "기준 화면",
  tabRound: "{n}회차",
  tabReflect: "돌아보기",
  tabRefine: "다듬기",
  stateDone: "기록됨",
  statePart: "쓰는 중",
  stateEmpty: "비어 있음",
  stateSkip: "생성하지 않음",
  chipDirection: "방향 바꾸기",
  chipConfirmed: "확정됨",
  todoCount: "할 일 {n}",

  // 기준 화면 (§3.2)
  refInspect: "5차시 이중 점검표에서 「안 맞음」으로 표시한 항목",
  refChosen: "5차시에 고른 결과 화면",
  refFinal: "4차시 최종 장면 메모",
  refSketch: "에스키스",
  refTrace: "흔적 설계",
  refEmpty: "4·5차시 기록이 없습니다.",
  refOther: "포트폴리오에 넣지 않은 회차",
  refOld: "바꾸기 전 이미지",
  more: "더 보기",
  less: "접기",

  // 회차 패널 (§3.3)
  roundStart: "{n}회차 시작",
  roundInherited: "{n}회차의 프롬프트와 도구, 다음에 고칠 한 가지를 불러왔습니다.",
  roundSeeded: "5차시 회차 기록에서 프롬프트와 도구를 불러왔습니다.",
  nextTab: "다음: {name}",
  lbAim: "이번에 노린 것",
  lbExp: "예상",
  optional: "(선택)",
  chipAfterImg: "이미지를 본 뒤 씀",
  chipBeforeImg: "이미지를 올리기 전에 씀",
  lbTool: "사용한 도구",
  lbPrompt: "프롬프트",
  lbPo: "그 밖에",
  chipSame: "앞 회차와 같음",
  chipFromPrev: "앞 회차에서 가져옴",
  chipChanged: "바뀜",
  copyPrompt: "프롬프트 복사",
  copied: "프롬프트를 복사했습니다.",
  copyFail: "복사하지 못했습니다. 글을 직접 선택해 복사하세요.",
  lbImages: "생성 이미지",
  upload: "이미지 올리기",
  chosenImg: "고른 이미지",
  replaceImg: "바꾸기",
  removeImg: "지우기",
  removeAsk: "{n}회차 이미지를 지울까요?",
  replaceAsk: "이 이미지를 새 이미지로 바꿀까요? 원래 이미지는 지우고 작은 미리 보기만 보관합니다.",
  tilePick: "{n}회차 이미지 {i} 고르기",
  tileReplace: "{n}회차 이미지 {i} 바꾸기",
  tileRemove: "{n}회차 이미지 {i} 지우기",
  lbCheck: "기준과 맞는가",
  checkOk: "맞음",
  checkNo: "안 맞음",
  lbSeen: "보이는 것",
  lbUk: "시키지 않았는데 나온 것",
  lbReason: "이유",
  lbPw: "지난 회차에 고친 한 가지가 예상대로 작동했습니까?",
  lbJd: "판단과 근거",
  lbCause: "원인",
  lbNr: "노린 것에 가까운 정도",
  lbNx: "다음에 고칠 한 가지",
  lbNl: "고칠 줄",
  lbNw: "방향을 바꾸는 이유",
  lbHm: "다듬기에서 고칠 것",
  skipToggle: "이 회차는 생성하지 않았습니다",
  lbSk: "생성하지 않은 이유",
  help: "도움 보기",
  helpHide: "도움 접기",
  mismatchTitle: "어긋나는 방식 다섯 가지와 고칠 줄",
  expLocked: "이미지를 올린 뒤에는 예상을 고칠 수 없습니다.",
  promptClipped: "프롬프트가 길어 일부만 저장했습니다.",
  promptSpread: "프롬프트를 줄마다 나누어 넣었습니다.",
  changedHint: "바뀐 줄이 {w} 곳입니다.",
  dupImage: "{n}회차와 같은 이미지로 보입니다.",
  fromImport: "5차시 {n}회차에서 가져옴",
  almostFull: "글자 수가 거의 다 찼습니다",
  imgLockedByConfirm: "다듬기를 확정한 뒤에는 이 이미지를 바꿀 수 없습니다. 「확정 풀기」를 먼저 누르세요.",
  imgRoundFull: "한 회차에는 이미지를 네 장까지 올릴 수 있습니다.",
  imgWsFail: "기록지를 불러오지 못해 저장하지 못했습니다. 화면을 새로 고친 뒤 다시 올려 주세요.",
  imgSmallBase: "이 이미지는 작게 저장되어 있습니다. 더 선명하게 다듬으려면 「바꾸기」로 원본을 다시 올리세요.",

  // 5차시에서 가져오기 (§3.6)
  impTitle: "5차시 회차 기록에서 가져오기",
  impRow: "{n}회차에 넣을 기록",
  impNone: "가져오지 않음",
  impOption: "5차시 {n}회차: {tool} · {judge}",
  impImages: "이미지도 함께 가져오기",
  impFill: "채울 칸: {list}",
  impNothing: "채울 칸이 없습니다.",
  impCellTool: "도구",
  impCellPrompt: "프롬프트",
  impCellJudge: "판단과 근거",
  impCellAim: "노린 것",
  impCellNext: "다음에 고칠 한 가지",
  impCellImage: "이미지",
  impBtn: "가져오기",
  impProgress: "이미지를 가져오는 중입니다 ({i}/{n})",
  impDone: "5차시 기록으로 {n}개 회차를 채웠습니다. 이미 쓴 칸은 그대로 두었습니다.",
  impClipped: "프롬프트가 길어 일부만 가져왔습니다.",
  impImgFail: "{n}회차 이미지를 불러오지 못했습니다.",

  // 세 회차 돌아보기 (§3.7)
  rvTitle: "세 회차 돌아보기",
  rvGroupNear: "가장 가까운 회차와 가장 먼 회차",
  rvNear: "가장 가까운 회차",
  rvFar: "가장 먼 회차",
  rvLook: "판단의 근거가 된 이미지의 위치",
  rvImages: "세 회차에 고른 이미지",
  rvGroupSrc: "결정의 출처",
  rvDPr: "내가 프롬프트로 정한 것",
  rvDAi: "요구하지 않았는데 AI가 정한 것",
  rvDHand: "다듬기에서 손으로 고칠 것",
  rvGroupBig: "가장 크게 바꾼 수정",
  // 검토 C3: 두 칸이 함께 [WSD] §5의 문장을 이룬다
  rvBig: "세 회차 동안 고친 것 가운데 결과를 가장 크게 바꾼 것은 무엇입니까?",
  rvUse: "다음 작업에서 그 방법을 어떻게 쓰겠습니까?",
  rvGroupDrift: "처음 노린 것의 변화 (선택)",
  rvDrift: "처음 노린 것이 바뀌었다면 무엇이 왜 바뀌었습니까?",
  rvStuck: "첫 이미지에서 벗어나지 못한 부분",
  rvGroupBase: "다듬기에 쓸 이미지",
  rvDefault: "기본",
  rvBaseWhy: "이 회차를 고른 이유",

  // 다듬기 탭 (§3.8)
  refineBefore: "다듬기 전",
  refineAfter: "다듬기 후",
  notExported: "아직 내보내지 않았습니다",
  editStart: "이미지 다듬기 시작",
  editContinue: "이어서 다듬기",
  editView: "다듬은 결과 보기",
  editNeedBase: "생성 이미지를 고르면 다듬기를 시작할 수 있습니다.",
  editBaseOf: "다듬을 이미지: {n}회차",
  editChangeBase: "다른 회차로 바꾸기",
  compare: "전후 비교",
  processView: "다듬기 과정 보기",
  original: "원본",
  prev: "이전",
  next: "다음",
  skippedStages: "건너뛴 과정: {list}",
  editLog: "수정 기록",
  phraseLater: "표기 문장은 ‘비교와 확정’에서 정합니다.",
  baseChanged: "다듬기에 쓴 이미지가 바뀌었습니다.",
  rebase: "새 이미지로 다시 시작",
  keepEdit: "다듬던 이미지 그대로 두기",
  rebaseBusy: "저장이 끝난 뒤에 다시 시작할 수 있습니다.",
  openBusy: "저장이 끝난 뒤에 열 수 있습니다.",
  rebaseAsk: "다듬은 레이어를 지우고 새 이미지에서 다시 시작합니다. 과정 기록 글은 그대로 둡니다. 다시 시작할까요?",
  rebaseAskDraft: "다듬은 레이어를 지우고 새 이미지에서 다시 시작합니다. 이 기기에만 임시 저장된 편집은 반영하지 않습니다. 과정 기록 글은 그대로 둡니다. 다시 시작할까요?",
  structWarn: "구조 문제는 다시 생성해서 고칩니다. 다시 생성한 이미지를 회차에 올리고 다듬을 이미지로 고른 뒤 다듬습니다.",
  hiddenStage: "이 과정은 아직 열리지 않았습니다",
  autoDraft: "자동 초안",
  copyBtn: "복사",
  phraseCopied: "표기 문장을 복사했습니다.",
  confirmLabel: "다듬기 확정",
  confirmYes: "확정",
  confirmAsk: "확정하면 「확정 풀기」를 누르기 전까지 이미지를 고칠 수 없습니다. 확정할까요?",
  needDraft: "이 기기에만 임시 저장된 편집이 있습니다. 「이어서 다듬기」로 열어 저장한 뒤 확정하세요.",
  confirmedAt: "확정됨 {time}",
  release: "확정 풀기",
  releaseAsk: "확정을 풀면 다시 고칠 수 있습니다. 확정을 푼 기록은 선생님 화면에 보입니다. 풀까요?",
  yes: "확인",
  no: "취소",
  wipeLabel: "전후 비교 위치",
  wipeValue: "다듬기 전 {a}%, 다듬기 후 {b}%",
  viewerClose: "닫기",
  slideOf: "{i}/{n}",
  wideView: "나란히",
  wipeView: "슬라이더",
  cardFail: "이 카드를 불러오지 못했습니다. 화면을 새로 고쳐 주세요.",

  // 보내기 (§1.4)
  sendS6a: "다듬기 기록 칸 채우기",
  sendS6b: "작품 캡션의 AI 활용 범위에 넣기",
  sendS7x: "전시 대표 이미지로 쓰기",
  sendFill: "채울 칸: {list}",
  sendNone: "이미 쓴 칸이 있어 채우지 않습니다.",
  sendDone: "다듬기 기록 칸 {n}개를 채웠습니다.",
  sendKept: "이미 쓴 칸 {n}개는 그대로 두었습니다.",
  sendScopeDone: "작품 캡션의 AI 활용 범위를 채웠습니다.",
  sendHeroDone: "전시 대표 이미지를 채웠습니다.",
  sendLost: "다른 기기에서 먼저 채운 칸이 있어 그대로 두었습니다.",

  // 확정 전 점검 (§3.10)
  needExport: "마지막으로 바꾼 뒤 「내보내기」를 다시 누르세요.",
  needFinal: "수정 전후의 차이와 이유를 쓰세요.",
  // {itemObj} = josa("‘" + ITEM_LABEL[k] + "’", "을/를"), {methodRo} = josa(METHOD_LABEL[m], "으로/로")
  needMethod: "‘{item}’의 고칠 방법을 고르세요.",
  needKeepReason: "{itemObj} 그대로 두는 이유를 쓰세요.",
  needNoChange: "{itemObj} {methodRo} 고친다고 정했지만 바꾼 것이 없습니다. 그대로 두기로 했다면 이유를 쓰세요.",
  needHiddenNote: "‘{stage}’ 기록을 쓰세요.",
  needRm: "반영한 방식을 고르세요.",
  needRf: "반영한 부분을 쓰세요.",
  needPhScope: "AI 활용 범위 문장을 쓰거나 자동 초안을 고르세요.",
  needPhMaking: "제작 과정 문장을 쓰거나 자동 초안을 고르세요.",
  needSaved: "저장하지 않은 변경이 있습니다. 저장한 뒤 확정하세요.",
  needUploads: "이미지를 저장하는 중입니다. 저장이 끝난 뒤 확정하세요.",
  staleDraft: "이미지를 고쳐 자동 초안이 달라졌습니다.",

  // 저장 상태와 알림 (§6.12)
  stUploading: "이미지를 저장하는 중입니다 ({i}/{n})",
  stSlow: "저장이 늦어지고 있습니다. 창을 닫지 말고 기다려 주세요.",
  stConfirming: "저장을 확인하는 중입니다",
  stSaved: "저장했습니다 ({time})",
  stUnsaved: "저장하지 않은 변경이 있습니다",
  stDraft: "이 기기에 임시 저장됨",
  stFailed: "저장하지 못했습니다",
  errRejected: "이미지를 저장하지 못했습니다. 다시 저장해도 같으면 선생님께 알려 주세요.",
  errTimeout: "저장하지 못했습니다. 인터넷 연결을 확인하고 「다시 저장」 버튼을 누르세요. 편집한 내용은 이 기기에 임시 저장되어 있습니다.",
  stOffline: "인터넷 연결이 끊겼습니다. 연결되면 다시 저장합니다.",
  errWs: "기록지를 불러오지 못해 저장하지 못했습니다. 화면을 새로 고친 뒤 다시 저장하세요.",
  stLocked: "선생님이 학습지 입력을 잠갔습니다. 편집한 내용은 이 기기에 임시 저장되어 있습니다.",
  lockedUpload: "선생님이 학습지 입력을 잠갔습니다.",
  errSize: "수정 기록이 너무 길어 저장할 수 없습니다. 레이어를 합치거나 지운 뒤 다시 저장하세요.",
  preview: "예시 화면입니다. 여기서는 아무것도 저장되지 않습니다.",
  readOnlyVersion: "앱의 새 버전에서 저장한 기록입니다. 화면을 새로 고친 뒤 다시 여세요.",
  gateMove: "다듬은 이미지를 저장하지 못했습니다. 지금 이동하면 편집한 내용은 이 기기에만 보관되고 다른 기기에서는 보이지 않습니다. 이동할까요?",
  gateLeave: "다듬은 이미지를 저장하지 못했습니다. 인터넷 연결을 확인해 주세요.\n지금 나가면 이 기기에 보관한 편집 내용도 지워집니다. 그래도 나갈까요?",

  // 교사 화면 (§7.6)
  missing: "미기록",
  imgUnreadable: "이미지를 불러오지 못했습니다",
  mGen: "생성 {n}회",
  mLayers: "레이어 {n}개",
  mHandArea: "손질 면적 {area}",
  mTraceArea: "흔적 {area}",
  mAiArea: "AI 부분 수정 {area}",
  mMaxLevel: "최고 개입 {n}({name})",
  mMinutes: "다듬기 {n}분",
  mConfirmed: "확정 {time}",
  mReleased: "(확정 풀기 {n}회)",
  mNotConfirmed: "확정 안 함",
  indExpFirst: "예상을 이미지보다 먼저 씀",
  indExpAfter: "이미지를 본 뒤 씀",
  indChanged: "바뀐 줄 {n}개",
  indCarried: "앞 회차의 다음 수정을 이어받음",
  indCauseLine: "원인을 줄 번호로 짚음",
  indHelp: "도움 보기 {n}번",
  indFirstTimes: "시작 뒤 첫 입력까지",
  changedLinesList: "바뀐 줄: {list}",
  fromS5: "5차시에서 가져옴",
  gradeTitle: "채점 (교사용)",
  gradeObs: "관찰의 구체성",
  gradeJudge: "판단의 근거",
  gradeLink: "다음 수정과의 연결",
  gradeSrc: "결정의 출처",
  gradeSave: "채점 저장",
  gradeNote: "이미지 완성도와 학생 자기 평점은 점수에 넣지 않습니다.",
  gradeRubric: "채점 기준: {list}",
  openEditor: "다듬기 화면 열어 보기",
  diagItem: "점검 항목",
  diagS5: "5차시 판정",
  diagNow: "다듬기 판정",
  diagMethod: "방법",
  diagUsed: "실제로 쓴 과정",
  diagWhy: "근거",
  stageNotes: "과정 기록",
  stageTime: "{n}분",
  logHead: "과정 · 작업 · 횟수 · 면적 · 매개변수 · 시각",
  events: "확정 기록",
  evDone: "확정",
  evUnlock: "확정 풀기",
  evRebase: "새 이미지로 다시 시작",
  phraseCompare: "표기 문장 비교",
  phDraftAsIs: "자동 초안 그대로",
  phDraftEdited: "초안을 고쳐 씀",
  phOwn: "직접 씀",
  aiLevelNote: "작품 캡션 문구의 AI 활용 정도: {v}",

  // 교사 화면 표시 (§7.6 item 10)
  flagStructNoRegen: "구조를 안 맞음으로 판정했지만 다시 생성한 기록이 없습니다.",
  flagPinTouched: "흔적 위치로 표시한 곳을 손질했습니다 ({n}곳).",
  flagTraceWide: "흔적을 넓게 그려 넣었습니다 ({area}).",
  flagWideRemove: "넓은 면적을 지우거나 복제했습니다 ({area}).",
  flagScaleMismatch: "스케일 바 기준 치수와 작품 캡션의 크기가 다릅니다.",
  flagPhraseGap: "표기 문장에 빠진 항목이 있습니다: {list}.",
  flagMultiLine: "한 번에 두 줄 이상 바꾼 회차가 있습니다 ({list}).",
  flagDupImage: "같은 이미지가 두 회차에 들어 있습니다.",
  flagSkipped: "생성하지 않은 회차가 있습니다 ({list}).",
  flagExpAfter: "예상을 이미지를 본 뒤 쓴 회차가 있습니다 ({list}).",
  flagShortNotes: "짧은 과정 기록: {list}",
  flagNotConfirmed: "다듬기를 확정하지 않았습니다.",
  flagReleased: "확정을 {n}회 풀었습니다.",
  flagKeptReasons: "그대로 둔 오류와 이유를 기록했습니다 ({n}건).",
  traceOverlapLine: "흔적 위치로 표시한 곳을 고쳤습니다. 사용 흔적을 지우지 않았는지 확인하세요.",

  // 개입 단계와 보도사진 기준 (§7.2)
  levelTag: "개입 {n}",
  wppTag: "보도사진 기준: {w}",

  // 면적과 크기 (fmtArea, fmtPrint)
  areaAbout: "화면의 약 {n}%",
  areaUnder1: "화면의 1% 미만",
  areaExact: "화면의 {n}%",
  printSize: "{w}×{h}px, 인쇄하면 약 {cw}×{ch}cm",
  listSep: ", ",

  // 카드 화면 덧붙임 (WP1/WP6 card, contract-log U10)
  loading: "불러오는 중",
  viewLarge: "{what} 크게 보기",
  imgAlt: "{n}회차 이미지 {i}",
  s5Round: "5차시 {n}회차",
  refSketchPad: "디지털 에스키스",
  ckSummary: "맞음 {ok} · 안 맞음 {no}",
  cmpMode: "비교 방식",
  noSlides: "아직 저장한 과정 이미지가 없습니다.",
  phraseTitle: "표기 문장",
  phrasePreview: "작품 표기 미리 보기",
  confirmTitle: "다듬기 확정",
  sendTitle: "다른 기록 칸 채우기",
  flagsTitle: "살펴볼 점",
  rubricRows: "[12미02-03] 표현 매체의 조합·응용·확장으로 표현 효과 탐색하기, [12미02-04] 표현 의도·과정·결과를 종합적으로 검토하기",
  gradeTotal: "합계 {n}점 (20점 만점)",
  sumTitle: "최종 이미지에 들어 있는 수정",
  logLevel: "개입",
  logWpp: "보도사진 기준",
};

/* ---------- 칸과 선택지 이름 (index = 저장 코드) ---------- */
export const LINE_LABEL = ["① 무엇인가", "② 사용 흔적", "③ 매몰 흔적", "④ 어떤 사진인가", "⑤ 어떻게 놓였는가", "⑥ 금지 조건"];
export const LINE_MARK = ["①", "②", "③", "④", "⑤", "⑥"];
export const CHECK_LABEL = ["구조·재질", "시점·스케일", "빛·배경", "마모·파손·수리 흔적의 위치"];
export const CAUSE_LABEL = ["", "①", "②", "③", "④", "⑤", "⑥", "도구의 한계나 우연", "알 수 없음"];
export const PW_LABEL = ["", "그렇다", "일부", "아니다", "우연일 수 있음"];
export const NR_LABEL = ["", "멀다", "조금 가깝다", "가깝다", "아주 가깝다"];
export const NL_LABEL = ["", "①", "②", "③", "④", "⑤", "⑥", "방향 바꾸기"];
export const RM_LABEL = ["", "그대로 활용", "일부 수정", "참고만"];
export const CELL_LABEL = ["없음", "마모", "파손", "수리", "오염"];
/** s5c FIX_OPTS plus 손으로 고치기 and 그대로 두기; routeInit matches s5c fix strings against this table */
export const METHOD_LABEL = ["", "재생성", "부분 수정", "화면 편집", "손으로 고치기", "작품 캡션 조정", "그대로 두기"];
export const HM_LABEL = ["", "부분 수정", "화면 편집", "손으로 고치기", "그대로 두기"];
export const UK_LABEL = ["", "없음", "살림", "버림"];
export const ROUND_LABEL = ["1회차", "2회차", "3회차"];
/** short names of the first-input slots (schema TI_ROUND) for the teacher's indicator line */
export const TI_LABEL = {
  aim: "노린 것", exp: "예상", tool: "도구", pa: "①", pb: "②", pc: "③", pd: "④", pe: "⑤", pf: "⑥", po: "그 밖에",
  im: "이미지", ck: "기준 확인", seen: "보이는 것", un: "살림·버림 이유", jd: "판단과 근거", cz: "원인", pw: "지난 수정",
  nr: "가까운 정도", nx: "다음 수정", sk: "생성하지 않은 이유",
};
/** copy of src-app.jsx INSPECT_ITEMS labels (core needs them for check and flag lines; a unit test compares them) */
export const ITEM_LABEL = {
  structure: "구조가 맞는가", cause: "흔적과 쓰임이 맞는가", light: "빛과 그림자", scale: "크기 짐작",
  text: "글자와 표시", label: "작품 캡션과 화면", misread: "엉뚱하게 읽힐 여지", exhibit: "전시했을 때의 화면",
};
export const ITEM_NOUN = { text: "뭉개진 글자", light: "두 번째 그림자", cause: "흔적 부위", structure: "어긋난 부분", misread: "다르게 읽히는 부분" };
export const LEVEL_LABEL = ["", "촬영 각도", "밝기와 대비", "피사체 옮기기", "요소를 지우거나 더하기", "장면 생성"];
export const FLAG_LEVEL = { warn: "확인 필요", info: "참고", good: "잘한 점" };
/** target keys of the send buttons, with the s6a/s6b/s7x field names as the student sees them */
export const SEND_KEY_LABEL = {
  "s6a.regen": "재생성", "s6a.partial": "부분 수정", "s6a.edit": "화면 편집", "s6a.diff": "수정 전후의 차이와 이유",
  "s6a.beforeImg": "다듬기 전 화면", "s6a.afterImg": "다듬기 후 화면", "s6b.aiScope": "AI 활용 범위", "s7x.img": "대표 이미지",
};
/** the fifth field of a src-media-img.js preset (shown in its error messages) */
export const PRESET_NAME = { full: "생성 이미지", cand: "생성 이미지", patch: "부분 수정 결과" };
/** the complete prepareImage preset: {...PRESETS[k], name} (schema PRESETS hold no Hangul) */
export function imgPreset(k) {
  return { ...PRESETS[k], name: PRESET_NAME[k] };
}

/* ---------- 과정 이름 (§4.1) ---------- */
export const STAGE_TEXT = {
  check: { name: "점검", sub: "안 맞는 항목마다 고칠 방법을 고릅니다.", note: "고칠 곳과 그대로 둘 곳, 그렇게 정한 근거" },
  patch: { name: "부분 수정", sub: "다른 도구에서 다시 그린 결과를 불러와 맞춥니다.", note: "다시 그리게 한 부위와 그 결과가 설계 카드와 맞는지" },
  crop: { name: "자르기", sub: "구도와 여백을 정합니다.", note: "잘라 낸 부분과 여백을 정한 이유" },
  tone: { name: "빛과 톤", sub: "밝기·색·배경을 맞춥니다.", note: "밝기·색·배경을 얼마나, 왜 바꿨는지" },
  fix: { name: "손으로 고치기", sub: "여기부터는 화면 안의 요소를 지우거나 더합니다.", note: "지우거나 더한 것과 그 부위, 그대로 둔 오류와 이유" },
  mark: { name: "스케일 바와 표식", sub: "치수에 맞춘 스케일 바를 넣습니다.", note: "스케일 바 길이의 근거가 된 치수와 덧붙인 표식" },
  final: { name: "비교와 확정", sub: "전후를 비교하고 표기 문장을 정합니다.", note: "수정 전후의 차이와 이유" },
};
/** labels of the notes keys that are not stage notes (부분 수정 panel, 비교와 확정 panel, 길이 맞추기) */
export const NOTE_LABEL = {
  aiTool: "사용한 도구", aiRegion: "다시 그리게 한 부위", aiPrompt: "그 부위에 넣은 프롬프트",
  rm: "반영한 방식", rf: "반영한 부분", calWhat: "무엇의 길이",
  phScope: "AI 활용 범위 문장", phMaking: "제작 과정 문장", kp: "그대로 두는 이유",
};

/* ---------- 작업·조정·효과·표식 이름 (편집기와 함께 쓴다, §4.6–§4.11, §7.2) ---------- */
export const ADJ_TEXT = {
  bc: "밝기·대비", lv: "레벨", cv: "곡선", ex: "노출", hs: "색조·채도·명도", vb: "활기", cb: "색상 균형", pf: "포토 필터",
  gp: "회색 맞추기", bw: "흑백",
};
export const FLT_TEXT = { usm: "선명하게", gb: "흐림", nz: "노이즈·결", vg: "가장자리 밝기", shd: "그림자 밝히기" };
export const MARK_TEXT = { sb: "스케일 바", gs: "회색 기준표", cc: "색 기준표", tg: "유물번호표", txt: "글자" };
export const OP_TEXT = {
  crop: "자르기", strt: "수평 맞추기", rot: "이미지 회전", ext: "여백 넓히기",
  ...ADJ_TEXT, ...FLT_TEXT,
  spot: "먼지와 긁힘 지우기", heal: "복구 브러시", clone: "복제 도장", dodge: "밝게·어둡게 칠하기", sponge: "스펀지",
  bsb: "흐리게 칠하기", shb: "선명하게 칠하기", trace: "흔적 그리기", patch: "AI 부분 수정",
  ...MARK_TEXT,
  align: "자동 맞추기", mask: "마스크", erase: "지우개", route: "점검표", pin: "점검 표시", light: "빛 방향 선",
  measure: "길이 맞추기", out: "내보내기",
};
/** index = WPP code */
export const WPP_LABEL = ["허용", "예외로 허용", "허용 안 됨(지우기)", "허용 안 됨(더하기)", "허용 안 됨(재배치)", "허용 안 됨(반전)",
  "허용 안 됨(왜곡)", "허용 안 됨(내용 변경)", "생성", "해당 없음"];
/** layer kind badges (index = KINDS order) */
export const KIND_LABEL = { base: "생성 원본", ai: "AI", px: "손질", tr: "흔적", db: "밝게·어둡게", adj: "조정", flt: "효과", ov: "표식", txt: "글자" };

/* ---------- 한 줄 질문 (§3.3, §3.7; [WSD] §2, §3 그대로) ---------- */
export const HELP = {
  round: {
    aim: "기준 화면에서 이번 회차에 맞추려는 것은 무엇입니까?",
    exp: "무엇이 어떻게 나올 것이라고 예상합니까?",
    seen: "노린 것과 다르게 나왔거나 빠진 것을 이미지의 위치와 함께 적습니다.",
    uk: "프롬프트에 없는데 나온 것이 있습니까? 살릴지 버릴지와 이유를 적습니다.",
    jd: "노린 것과 비교하면 어떻습니까? 어디를 보고 그렇게 판단했습니까?",
    nx: "무엇을 어떻게 고칩니까? 어느 관찰 때문입니까?",
    hm: "다듬기에서 무엇을 어떤 방법으로 고칩니까?",
  },
  reflect: {
    near: "세 이미지 가운데 노린 것에 가장 가까운 회차와 가장 먼 회차는 어느 회차입니까?",
    look: "이미지의 어디를 보고 그렇게 판단했습니까?",
    src: "내가 프롬프트로 정한 것, 요구하지 않았는데 AI가 정한 것, 다듬기에서 손으로 고칠 것을 나누어 적습니다.",
    big: "세 회차 동안 고친 것 가운데 결과를 가장 크게 바꾼 것은 무엇입니까? 다음 작업에서 그 방법을 어떻게 쓰겠습니까?",
    drift: "처음 노린 것이 바뀌었다면 무엇이 왜 바뀌었습니까? 첫 이미지에서 벗어나지 못한 부분은 어디입니까?",
  },
};

/* src-lessons.jsx 「어긋나는 방식 다섯 가지와 고칠 줄」 표를 그대로 옮긴다 (단위 시험이 원문과 대조한다) */
export const MISMATCH = {
  heads: ["결과가 이렇게 나오면", "원인", "이렇게 고칩니다"],
  rows: [
    ["새 물건처럼 번들거림", "③ 매몰 줄이 없거나 약함", "변색·경화·압착 가운데 두 가지를 명시"],
    ["게임 아이템처럼 보임", "⑥ 금지 조건이 빠져 도구가 빈자리를 장식으로 채움", "발광·문양·후광 없음을 씀"],
    ["흔적이 엉뚱한 곳에 있음", "②의 부위 지정이 모호함", "왼쪽·오른쪽·위·아래·몇 분의 몇을 씀"],
    ["부품이 떠 있거나 구조가 틀림", "①의 형태 기술이 부족함", "어디에 무엇이 어떻게 붙어 있는지 씀"],
    ["사진이 아니라 그림처럼 보임", "④⑤가 빠짐", "공통 줄을 그대로 붙임"],
  ],
};

/* ---------- 표기 문장 조각 (§7.2, §7.4) ---------- */
export const PHRASE = {
  titleFallback: "작품명",
  nameSlot: "(이름)",
  ym: "{y}년 {m}월",
  genTool: "{tool} 생성",
  patchArea: "{aiTool} 부분 수정({aiRegion}, 화면의 약 {n}%)",
  patchNoArea: "{aiTool} 부분 수정({aiRegion})",
  noHand: "손질 없음",
  more: "외 {n}건",
  screen: "화면 게시",
  printA4: "인쇄(A4)",
  printA5: "인쇄(A5)",
  bw: ", 흑백",
  sizePx: "{w}×{h}px",
  sizeCm: "약 {w}×{h}cm",
  a: "「{title}」·(이름)·{ym}·{tools} 이미지에 {hand}, {output}, {size}",
  b: "{tools} 이미지에 {hand}",
  c: "프롬프트 여섯 줄을 작성하고 생성 {n}회 가운데 1점을 고른 뒤, {clauses}.",
  cKeep: "{topic} 생성 결과 그대로 둠.",   // {topic} = josa(대상, "은/는")
  // 수작업 내용 조각 (§7.2 Part in)
  crop: "여백 자름",
  cropPct: "원래 화면의 {n}%로 자름",
  strt: "{n}° 기울기 바로잡음",
  rot: "90° 돌림",
  extTb: "위아래 여백 넓힘",
  ext: "여백 넓힘",
  tone: "밝기·대비 조정(평균 밝기 {n}%)",
  color: "색 조정",
  gp: "회색 맞춤",
  gpBg: "배경 회색 맞춤(배경 면적 {n}%)",
  bwPart: "흑백으로 바꿈",
  usm: "선명도 조정",
  gb: "흐리게 함",
  gbLocal: "부분 흐리게 함(화면의 {a}%)",
  nz: "노이즈 더함",
  nzLocal: "결 더함(화면의 {a}%)",
  vg: "가장자리 밝기 조정",
  shd: "그림자 밝힘",
  spotDust: "사진의 먼지 {n}곳 지움",
  removeTarget: "{target} {n}곳 지움(화면의 {a}%)",
  remove: "{n}곳 지움(화면의 {a}%)",
  dodge: "부분 밝기 조정(화면의 {a}%)",
  dodgeTarget: "{target} 밝기 바꿈(화면의 {a}%)",
  bsb: "부분 흐리게 함(화면의 {a}%)",
  shb: "부분 선명도 조정",
  trace: "{cell} 흔적 그려 넣음(화면의 {a}%)",
  traceNoCell: "흔적 그려 넣음(화면의 {a}%)",
  sb: "스케일 바({cm}cm) 덧붙임",
  gs: "회색 기준표 덧붙임",
  cc: "색 기준표 덧붙임",
  tg: "유물번호표 덧붙임",
  txt: "글자 덧붙임",
  // 제작 과정 문장 (c)의 절: [이어지는 꼴, 끝맺는 꼴]. {obj}는 josa(…, "을/를")를 붙인 말
  clausePatch: ["{obj} 부분 수정하고", "{obj} 부분 수정함"],
  clauseRemove: ["{obj} 지우고", "{obj} 지움"],
  clauseTrace: ["{cell} 흔적을 그려 넣고", "{cell} 흔적을 그려 넣음"],
  clauseTraceNoCell: ["흔적을 그려 넣고", "흔적을 그려 넣음"],
  clauseAdd: ["{obj} 덧붙이고", "{obj} 덧붙임"],
  clauseTone: ["{obj} 조정하고", "{obj} 조정함"],
  toneWords: { tone: "밝기", color: "색", crop: "여백", strt: "기울기" },
  clauseJoin: " ",
};
/** keywords that phraseGaps looks for in the effective (b) phrase, per summary category (§7.5) */
export const GAP_WORDS = {
  remove: { show: "지움", find: ["지움", "지웠"] },
  add: { show: "덧붙임", find: ["덧붙", "더함"] },
  trace: { show: "그려 넣음", find: ["그려 넣"] },
  crop: { show: "자름", find: ["자름", "자르"] },
  tone: { show: "조정", find: ["조정", "밝기"] },
  patch: { show: "부분 수정", find: ["부분 수정"] },
  bw: { show: "흑백", find: ["흑백"] },
};

/* ---------- 질적 자료 내보내기 단위 이름 (§7.7, folioUnits) ---------- */
export const UNIT = {
  aim: "{n}회차 노린 것",
  exp: "{n}회차 예상",
  expAfter: "(이미지를 본 뒤 씀)",
  tool: "{n}회차 도구",
  prompt: "{n}회차 프롬프트",
  seen: "{n}회차 보이는 것",
  uk: "{n}회차 시키지 않았는데 나온 것",
  ukNothing: "없음",
  ukKeep: "살림: {t}",
  ukDrop: "버림: {t}",
  pw: "{n}회차 지난 수정",
  jd: "{n}회차 판단과 근거",
  cause: "원인: {c}",
  nx: "{n}회차 다음에 고칠 한 가지",
  nl: "고칠 줄 {c}",
  nw: "방향 바꾸기: {t}",
  hm: "3회차 다듬기에서 고칠 것",
  sk: "{n}회차 생성하지 않은 이유",
  copied: "(5차시에서 가져옴)",
  rvNearFar: "가장 가까운 회차·가장 먼 회차",
  rvNearFarText: "{near} / {far}: {look}",
  rvDPr: "결정의 출처: 프롬프트",
  rvDAi: "결정의 출처: AI",
  rvDHand: "결정의 출처: 다듬기",
  rvBig: "가장 크게 바꾼 수정",
  rvUse: "다음 작업에서 쓸 방법",
  rvDrift: "바뀐 것",
  rvStuck: "벗어나지 못한 부분",
  rvBaseWhy: "다듬기 이미지를 고른 이유",
  stCheck: "점검 기록",
  stPatch: "부분 수정 기록",
  stCrop: "자르기 기록",
  stTone: "빛과 톤 기록",
  stFix: "손으로 고치기 기록",
  stMark: "스케일 바와 표식 기록",
  stFinal: "수정 전후의 차이와 이유",
  kp: "그대로 두는 이유: {item}",
  aiTool: "부분 수정 도구",
  aiRegion: "부분 수정 부위",
  aiPrompt: "부분 수정 프롬프트",
  rmRf: "반영한 방식·부분",
  calWhat: "길이 맞추기 기준",
  phScope: "AI 활용 범위 문장",
  phMaking: "제작 과정 문장",
  draftAsIs: "자동 초안 그대로 씀",
  draftCopied: "자동 초안을 옮겨 씀",
  txt: "화면 속 글자",
};

/* ---------- core가 쓰는 조각 (src-portfolio-core.mjs; contract-log 「WP1 core (A-core)」) ---------- */
export const CORE_TEXT = {
  // s5c.inspect의 status 값 (src-app.jsx 이중 점검표가 저장하는 문자열 그대로; routeInit이 대조한다)
  s5cOk: "성립",
  s5cNo: "불성립",
  // 흔적 그리기 종류 (LayerRec tr p.pr = index; src-photo-text.mjs OPT_TEXT.trace*와 같은 이름)
  trace: ["", "마모 광택", "녹", "얼룩", "긁힘"],
  // 표기 문장 (§7.4): 부위나 도구 이름이 비었을 때의 꼴, 손질이 없을 때의 (c)
  patchAreaOnly: "{aiTool} 부분 수정(화면의 약 {n}%)",
  patchBare: "{aiTool} 부분 수정",
  toneBare: "밝기·대비 조정",
  cNoHand: "프롬프트 여섯 줄을 작성하고 생성 {n}회 가운데 1점을 고름.",
  objDust: "사진의 먼지",
  objRemove: "필요 없는 부분",
  objPatch: "화면 일부",
  nameJoin: "·",
  // 수정 기록 줄 (opLines, §7.1)
  times: "{n}번",
  groups: "{n}곳",
  link: "연결 항목: {item}",
  cell: "설계 카드: {cell}",
  lv: "입력 {ib}/{iw}, 감마 {g}",
  bc: "밝기 {b}, 대비 {c}",
  mean: "평균 밝기 {n}%",
  sep: " · ",
  // 보내기 (§1.4): 「{n}회차: {고칠 줄} {nx}」
  sendRegen: "{round}: {line} {nx}",
  // josa(word, pair)의 조사 쌍 (core는 한글을 직접 쓰지 않는다)
  josaObj: "을/를",
  josaTopic: "은/는",
  josaSubj: "이/가",
  josaRo: "으로/로",
  // 검토 r3 반영 (K8): 학생 화면의 수정 기록 줄에는 보도사진 판정 대신 이 표시만 붙인다(개입 4 이상). 교사 화면은 단계 이름까지 쓴다
  discloseTag: "표기 문장에 밝힐 수정",
  levelNamed: "개입 {n}({name})",
  // 검토 r3 반영 (K19, K20, K24): core만 쓰는 문구의 고친 꼴
  gapLine: "수정 기록에 있는 {wSubj} AI 활용 범위 문장에는 없습니다.",
  needStageNote: "‘{stage}’에서 바꾼 내용을 기록하세요.",
  genToolK: "{tool} 생성({k}회)",
  // 검토 r4 F7: 전시 대표 이미지는 s7x.img 업로드 규정(src-media-img.js IMG_PRESETS.hero)의 긴 변·짧은 변 하한을 모두 따른다
  heroLong: "긴 변이 {n}px보다 작아 대표 이미지로 쓸 수 없습니다.",
  heroShort: "짧은 변이 {n}px보다 작아 대표 이미지로 쓸 수 없습니다.",
};

/* ---------- 조사와 수 ---------- */
// 받침 판정: 마지막 한글 음절, 숫자는 읽는 소리, 따옴표·괄호 같은 닫는 기호는 건너뛴다
const DIGIT_JONG = [21, 8, 0, 16, 0, 0, 1, 8, 8, 0];   // 영 일 이 삼 사 오 육 칠 팔 구: 받침 코드 (ㄹ = 8)
function jong(word) {
  const s = String(word == null ? "" : word);
  for (let i = s.length - 1; i >= 0; i--) {
    const c = s.charCodeAt(i);
    if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28;
    if (c >= 48 && c <= 57) return DIGIT_JONG[c - 48];
    if (/(cm|mm)$/i.test(s.slice(0, i + 1))) return 0;   // 센티미터, 밀리미터
    if (/px$/i.test(s.slice(0, i + 1))) return 8;        // 픽셀
    if (/[A-Za-z]/.test(s[i])) return /[lmnLMN]/.test(s[i]) ? (/[lL]/.test(s[i]) ? 8 : 4) : 0;
    if (s[i] === "%") return 0;
    if (/[\s'"’”」』)\]}·.,!?]/.test(s[i])) continue;
    return 0;
  }
  return 0;
}
/** @param {"을/를"|"은/는"|"이/가"|"과/와"|"으로/로"} pair @returns {string} word + particle */
export function josa(word, pair) {
  const j = jong(word);
  const [withB, without] = String(pair).split("/");
  if (pair === "으로/로") return String(word) + (j === 0 || j === 8 ? "로" : "으로");
  return String(word) + (j ? withB : without);
}
/** @returns {string} "두"…"여섯" (1 "한"; other numbers as digits) */
export function countWord(n) {
  return ["", "한", "두", "세", "네", "다섯", "여섯"][n] || String(n);
}

/* ---------- 문장 규칙 검사 (spec Appendix A; CLAUDE.md) ---------- */
const LINT_RULES = [
  ["줄표", new RegExp(String.fromCharCode(0x2014))],   // U+2014 em dash
  ["단추", /단추/],
  ["손잡이", /손잡이/, /(손수레 손잡이|문손잡이)/g],
  ["켜집니다·켜기·끄기", /켜집니다|켜기|끄기/],
  ["띠", /(^|[^가-힣])띠([^가-힣]|$)|머리띠/],
  ["화면 낭독기", /화면 낭독기/],
  ["다녀간", /다녀간/],
  ["굳히·굳은·굳다", /굳히|굳은|굳다/],
  ["잔가지", /잔가지/],
  ["자리", /자리/, /(가장자리|빈자리)/g],
  ["남기·남는", /남기|남긴|남는|남은|남깁/],
  ["물음", /물음/],
  ["낱말", /낱말/],
  ["되묻기", /되묻/],
  ["네가·네 답", /(^|[^가-힣])네가|네 답/],
  ["이중 피동", /보여지|잊혀지|잊혀진|쓰여지|쓰여진|불리우/],
  ["번역투", /에 의한|에 의해|로 인한|하게 됩니다|을 가진다|의 형태로/],
  ["보정", /보정/],
  ["단계 n", /단계 ?\d/],
  ["AI 문구", /AI로 만들었습니다|AI의 도움을 받았습니다/],
  ["비유·구어", /찌르|무너지|붙들|밀어 보|이라고 치면/],
];
const PRAISE = /아름다운|강렬한|신비로운/;
/** @returns {string[]} rule violations (Appendix A); [] when clean. opts.phrase adds the praise-adjective rule of generated phrases */
export function lintKo(s, opts = {}) {
  const str = String(s == null ? "" : s);
  const out = [];
  for (const [name, re, allow] of LINT_RULES) {
    const t = allow ? str.replace(allow, "") : str;
    if (re.test(t)) out.push(name);
  }
  if (opts.phrase && PRAISE.test(str)) out.push("칭찬 형용사");
  return out;
}

/* ---------- 모든 문자열 (lint 시험용) ---------- */
function collect(x, out) {
  if (typeof x === "string") out.push(x);
  else if (Array.isArray(x)) x.forEach((y) => collect(y, out));
  else if (x && typeof x === "object") Object.values(x).forEach((y) => collect(y, out));
  return out;
}
/** @returns {string[]} every string in every exported table */
export function allStrings() {
  return collect([T, LINE_LABEL, LINE_MARK, CHECK_LABEL, CAUSE_LABEL, PW_LABEL, NR_LABEL, NL_LABEL, RM_LABEL, CELL_LABEL,
    METHOD_LABEL, HM_LABEL, UK_LABEL, ROUND_LABEL, TI_LABEL, ITEM_LABEL, ITEM_NOUN, LEVEL_LABEL, FLAG_LEVEL, SEND_KEY_LABEL, PRESET_NAME,
    STAGE_TEXT, NOTE_LABEL, ADJ_TEXT, FLT_TEXT, MARK_TEXT, OP_TEXT, WPP_LABEL, KIND_LABEL, HELP, MISMATCH, PHRASE, GAP_WORDS, UNIT, CORE_TEXT], []);
}
