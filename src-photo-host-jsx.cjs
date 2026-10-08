/* photo.js only (esbuild --alias:react/jsx-runtime, used by --jsx=automatic): the jsx runtime of app.js. */
const h = typeof window !== "undefined" ? window.__museumPhotoHost : undefined;
if (!h || !h.jsxRuntime) throw new Error("photo.js: app.js jsx runtime is missing");
module.exports = h.jsxRuntime;
