/* ============================================================
   photo.js 쪽 연결 모듈: app.js가 넘긴 하나뿐인 모듈 값을 편집기 파일에 이름으로 내보낸다
   · 편집기 파일(src-photo.jsx, src-photo-panels.jsx)은 상태가 있는 모듈(src-photo-io.mjs, src-folio-ui.jsx, src-ws-lock.jsx)과
     src-media-img.js를 직접 import하지 않고 여기서 가져온다. 직접 가져오면 photo.js에 두 번째 사본이 생겨
     저장기 목록·초안·스크롤 잠금·Context가 갈라진다(src-photo-split.test.mjs가 막는다).
   · React·ReactDOM·react/jsx-runtime은 빌드의 --alias가 src-photo-host-react.cjs 등으로 돌린다.
   · app.js가 넣어 둔 window.__museumPhotoHost가 없거나 약속 번호가 다르면 여기서 멈춘다(photo.js는 등록되지 않는다).
   ============================================================ */
import { PHOTO_API, PHOTO_SHARED } from "./src-photo-api.mjs";

const H = typeof window !== "undefined" ? window.__museumPhotoHost : undefined;
const S = H && H.api === PHOTO_API ? H.shared : null;
const gone = S ? PHOTO_SHARED.filter((k) => S[k] == null) : PHOTO_SHARED;
if (!S || gone.length) {
  // src-photo-load.jsx reads this after the script ran: another api → 「새 버전」 notice, otherwise a load error
  if (typeof window !== "undefined") window.__museumPhotoFail = { api: PHOTO_API, host: H ? H.api : null, gone: S ? gone : [] };
  throw new Error("photo.js: app.js host " + (S ? "lacks " + gone.join(", ") : "is missing or of another version"));
}

export const {
  WsLockCtx, WsSavedCtx,
  lockScroll, NoteField, PfViewer, ProcessSlides,
  getSaver, devId, mediaCache, decodeImage, decodeBlob, drafts, tabLock, mediaLoader, imageDims,
  prepareImage, imgErrText,
} = S;
