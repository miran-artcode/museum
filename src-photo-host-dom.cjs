/* photo.js only (esbuild --alias:react-dom): the ReactDOM of app.js (createPortal and flushSync must use the same renderer). */
const h = typeof window !== "undefined" ? window.__museumPhotoHost : undefined;
if (!h || !h.ReactDOM) throw new Error("photo.js: app.js ReactDOM is missing");
module.exports = h.ReactDOM;
