/* ============================================================
   이미지 다듬기 편집기 분리 번들의 약속 (app.js와 public/photo.js가 함께 읽는 작은 상수 모듈, 상태 없음)
   · app.js(src-photo-load.jsx)는 photo.js를 넣기 전에 window.__museumPhotoHost = { api, React, ReactDOM, jsxRuntime, shared }를 둔다.
   · photo.js(src-photo-entry.jsx)는 window.__museumPhoto = { api, PhotoEditor, css }를 등록한다.
   · shared는 아래 PHOTO_SHARED의 이름을 모두 담는다. 모두 app.js에 하나만 있어야 하는 것이다:
       React Context(WsLockCtx·WsSavedCtx), 스크롤 잠금 횟수와 미디어 기억(src-folio-ui.jsx),
       저장기 목록·초안(IndexedDB)·mediaCache·올리기 줄·탭 잠금·기기 번호(src-photo-io.mjs), 사진 올리기 규정(src-media-img.js).
   · 이름을 더하거나 빼거나, 넘기는 함수의 쓰임이 바뀌면 PHOTO_API를 올린다.
     (예전 app.js가 열려 있는 탭은 새 photo.js를 받으면 「새로 고침」 안내를 본다)
   ============================================================ */
export const PHOTO_API = 1;

export const PHOTO_SHARED = Object.freeze([
  // src-ws-lock.jsx
  "WsLockCtx", "WsSavedCtx",
  // src-folio-ui.jsx
  "lockScroll", "NoteField", "PfViewer", "ProcessSlides",
  // src-photo-io.mjs
  "getSaver", "devId", "mediaCache", "decodeImage", "decodeBlob", "drafts", "tabLock", "mediaLoader", "imageDims",
  // src-media-img.js
  "prepareImage", "imgErrText",
]);
