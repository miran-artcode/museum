/* photo.js only (esbuild --alias:react): the React of app.js. Hooks work only with the one React instance that renders them. */
const h = typeof window !== "undefined" ? window.__museumPhotoHost : undefined;
if (!h || !h.React) throw new Error("photo.js: app.js React is missing");
module.exports = h.React;
