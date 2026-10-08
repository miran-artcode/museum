/* ============================================================
   public/photo.js의 입구 (npm run build의 세 번째 esbuild, --alias로 react·react-dom·react/jsx-runtime을 app.js 것으로 돌린다)
   이미지 다듬기 편집기(src-photo.jsx·src-photo-panels.jsx)와 그것만 쓰는 문서·합성·붓·표식·픽셀 모듈을 묶는다.
   학생이 다듬기 화면을 처음 열 때 src-photo-load.jsx가 이 파일을 내려받는다(src-ar.jsx의 ar3d.js와 같은 방식).
   · 상태가 있는 모듈은 묶지 않는다: src-photo-host.mjs가 app.js의 것을 받아 넘긴다(src-photo-api.mjs PHOTO_SHARED).
   · 상태가 없는 모듈(schema·text·core·px 일부)은 app.js와 이 파일에 한 벌씩 들어간다.
   · 같은 파일이 두 번 실행되어도 처음 등록한 것만 쓴다(편집기 모듈의 ATT 같은 값이 둘로 갈라지지 않게).
   ============================================================ */
import { PHOTO_API } from "./src-photo-api.mjs";
import { PhotoEditor, PE_CSS } from "./src-photo.jsx";
import { PE_PANELS_CSS } from "./src-photo-panels.jsx";

if (typeof window !== "undefined" && !window.__museumPhoto) {
  window.__museumPhoto = Object.freeze({ api: PHOTO_API, PhotoEditor, css: PE_CSS + PE_PANELS_CSS });
}
