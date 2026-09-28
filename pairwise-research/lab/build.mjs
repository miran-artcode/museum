/* 쌍대비교 체험실 빌드 — node pairwise-research/lab/build.mjs
   · src-assess.jsx가 부르는 ./src-fb.js를 mock-fb.js로 바꿔 끼운다(Firebase를 묶지 않고, 아무것도 서버로 나가지 않음).
   · 앱의 CSS(src-app.jsx의 CSS, 설문·상호평가·테마·UX 계층)를 뽑아 학생 화면의 그림자 DOM 안에만 넣는다.
     :root는 :host로, body는 .app으로 바꾸고 글꼴 @import는 뺀다(글꼴은 페이지 머리에서 한 번 불러온다).
   · 결과: dist/쌍대비교_체험실.html 한 파일 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const OUT = path.join(HERE, "dist");

function cssConst(file, name) {
  const src = fs.readFileSync(path.join(ROOT, file), "utf8");
  const m = src.match(new RegExp("const\\s+" + name + "\\s*=\\s*`"));
  if (!m) throw new Error(file + "에서 " + name + "을 찾지 못했습니다");
  const start = m.index + m[0].length;
  const end = src.indexOf("\n`;", start);
  if (end < 0) throw new Error(file + "의 " + name + " 끝을 찾지 못했습니다");
  const css = src.slice(start, end);
  if (css.includes("${")) throw new Error(file + "의 " + name + "에 보간이 있습니다");
  return css;
}
const scope = (css) => css
  .split("\n").filter((l) => !/^\s*@import/.test(l)).join("\n")
  .replace(/:root\b/g, ":host")
  .replace(/(^|[\s,}])body(?=\s*[{,:.[])/g, "$1.app");

const studentCss = [
  scope(cssConst("src-app.jsx", "CSS")),
  scope(cssConst("src-survey-ui.jsx", "SURVEY_UI_CSS")),
  scope(cssConst("src-assess.jsx", "ASSESS_CSS")),
  scope(cssConst("src-theme.jsx", "THEME_CSS")),
  scope(cssConst("src-ux.jsx", "UX_CSS")),
  ":host{display:block}\n.app{min-height:0;background:#fff}\n.lab-wrap{max-width:none;padding:0 0 12px}",
].join("\n");

const labPlugin = {
  name: "lab",
  setup(build) {
    build.onResolve({ filter: /(^|\/)src-fb\.js$/ }, () => ({ path: path.join(HERE, "mock-fb.js") }));
    build.onResolve({ filter: /^virtual:student-css$/ }, () => ({ path: "student-css", namespace: "lab" }));
    build.onLoad({ filter: /.*/, namespace: "lab" }, () => ({ contents: "export default " + JSON.stringify(studentCss) + ";", loader: "js" }));
  },
};

const res = await esbuild.build({
  entryPoints: [path.join(HERE, "lab.jsx")],
  bundle: true, write: false, minify: true, format: "iife", target: ["es2020"],
  jsx: "automatic", loader: { ".jsx": "jsx", ".js": "jsx", ".jpg": "dataurl", ".json": "json" },
  define: { "process.env.NODE_ENV": '"production"' },
  nodePaths: [path.join(ROOT, "node_modules")],
  plugins: [labPlugin],
  logLevel: "warning",
});
let js = res.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
const pageCss = fs.readFileSync(path.join(HERE, "lab.css"), "utf8");
const html = [
  "<title>쌍대비교 체험실</title>",
  '<link rel="preconnect" href="https://fonts.googleapis.com">',
  '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;700;900&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans+KR:wght@400;500;700&family=Noto+Sans+KR:wght@400;500;700;900&display=swap">',
  "<style>" + pageCss + "</style>",
  '<div id="root"><p style="padding:24px;font-family:sans-serif">체험실을 여는 중…</p></div>',
  "<script>" + js + "</script>",
].join("\n");
fs.mkdirSync(OUT, { recursive: true });
const file = path.join(OUT, "쌍대비교_체험실.html");
fs.writeFileSync(file, html);
console.log("빌드:", path.relative(ROOT, file), Math.round(html.length / 1024) + "KB", "(학생 CSS " + Math.round(studentCss.length / 1024) + "KB)");
