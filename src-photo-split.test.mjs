// 이미지 다듬기 편집기 분리 번들(public/photo.js) 시험: node --test src-photo-split.test.mjs
// · package.json "build"의 photo.js 명령을 그대로(출력 경로만 바꿔) 돌려, photo.js에 React와 상태가 있는 모듈이
//   들어가지 않았는지 본다. 들어가면 훅이 깨지거나(React 두 벌) 저장기 목록·초안·스크롤 잠금·Context가 둘로 갈라진다.
// · app.js 쪽 import 그래프에 편집기 파일이 없는지 본다. 있으면 src-photo-host.mjs가 시작할 때 멈춰 앱 전체가 뜨지 않는다.
// · PHOTO_SHARED(src-photo-api.mjs), 넘기는 쪽(src-photo-load.jsx), 받는 쪽(src-photo-host.mjs)의 이름 목록이 같은지 본다.
// 환경 변수 PHOTO_SPLIT_PKG로 다른 package.json(편집 스크립트를 적용한 사본)을 읽게 할 수 있다.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { PHOTO_API, PHOTO_SHARED } from "./src-photo-api.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = (f) => fs.readFileSync(path.join(here, f), "utf8");

/** files that hold module-level state or a React Context and must exist once per page (in app.js) */
const HOST_ONLY = ["src-photo-io.mjs", "src-folio-ui.jsx", "src-ws-lock.jsx", "src-media-img.js", "src-fb.js", "src-portfolio.jsx", "src-app.jsx", "src-photo-load.jsx"];
/** files that only photo.js may contain */
const EDITOR_ONLY = ["src-photo.jsx", "src-photo-panels.jsx", "src-photo-doc.mjs", "src-photo-render.mjs", "src-photo-brush.mjs", "src-photo-marks.mjs",
  "src-photo-text.mjs", "src-photo-entry.jsx", "src-photo-host.mjs", "src-photo-host-react.cjs", "src-photo-host-dom.cjs", "src-photo-host-jsx.cjs"];

function photoCmd() {
  const pkgPath = process.env.PHOTO_SPLIT_PKG || path.join(here, "package.json");
  const build = JSON.parse(fs.readFileSync(pkgPath, "utf8")).scripts.build;
  const cmd = build.split("&&").map((s) => s.trim()).find((s) => /^esbuild\s+src-photo-entry\.jsx\s/.test(s));
  assert.ok(cmd, "package.json scripts.build has no `esbuild src-photo-entry.jsx …` (apply .tmpbuild/followup/edit-lazy-pkg.mjs)");
  return cmd;
}

test("photo.js: the package.json command bundles the editor without React or any app.js singleton", () => {
  const cmd = photoCmd();
  assert.match(cmd, /--outfile=public\/photo\.js(\s|$)/);
  for (const a of ["--alias:react=", "--alias:react-dom=", "--alias:react/jsx-runtime=", "--format=iife", "--bundle", "--jsx=automatic"]) assert.ok(cmd.includes(a), "missing " + a);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "photo-split-"));
  try {
    const out = path.join(tmp, "photo.js"), meta = path.join(tmp, "meta.json");
    const run = cmd.replace(/--outfile=\S+/, `--outfile="${out}"`) + ` --metafile="${meta}" --log-level=warning`;
    const bin = path.join(here, "node_modules", ".bin");
    execSync(run, { cwd: here, stdio: "pipe", env: { ...process.env, PATH: bin + path.delimiter + (process.env.PATH || process.env.Path || "") } });
    const inputs = Object.keys(JSON.parse(fs.readFileSync(meta, "utf8")).inputs).map((p) => p.split("\\").join("/"));
    const base = inputs.map((p) => p.split("/").pop());
    assert.deepEqual(inputs.filter((p) => /(^|\/)node_modules\//.test(p)), [], "photo.js bundles an npm package (React must come from app.js)");
    assert.deepEqual(HOST_ONLY.filter((f) => base.includes(f)), [], "photo.js bundles a module that must exist once (app.js)");
    for (const f of ["src-photo.jsx", "src-photo-panels.jsx", "src-photo-host.mjs", "src-photo-host-react.cjs", "src-photo-host-jsx.cjs", "src-photo-api.mjs"]) assert.ok(base.includes(f), "photo.js lacks " + f);
    const js = fs.readFileSync(out, "utf8");
    assert.ok(js.includes("__museumPhoto") && js.includes("__museumPhotoHost"), "registration or host read missing");
    assert.ok(!js.includes("firestore.googleapis.com"), "Firebase in photo.js");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

/** local import graph from an entry: import / export … from "./x" and import "./x" */
function graph(entry) {
  const seen = new Set(), stack = [entry];
  while (stack.length) {
    const f = stack.pop();
    if (seen.has(f) || !fs.existsSync(path.join(here, f))) continue;
    seen.add(f);
    const code = src(f);
    for (const m of code.matchAll(/^\s*(?:import|export)\b[^;]*?\bfrom\s+"(\.\/[^"]+)"|^\s*import\s+"(\.\/[^"]+)"/gm)) stack.push((m[1] || m[2]).slice(2));
  }
  return seen;
}

test("app.js: no editor file is reachable from src-app.jsx (photo.js holds them)", () => {
  const g = graph("src-app.jsx");
  assert.ok(g.has("src-portfolio.jsx") && g.has("src-photo-load.jsx") && g.has("src-photo-io.mjs"), "the card and the loader are in app.js");
  assert.deepEqual(EDITOR_ONLY.filter((f) => g.has(f)), [], "an editor file is imported by app.js");
});

test("photo.js: the editor files reach app.js modules only through src-photo-host.mjs", () => {
  const g = graph("src-photo-entry.jsx");
  assert.deepEqual(HOST_ONLY.filter((f) => g.has(f)), []);
  assert.ok(g.has("src-photo-host.mjs"));
});

test("contract: PHOTO_SHARED = the names src-photo-load.jsx passes = the names src-photo-host.mjs exports", () => {
  assert.equal(typeof PHOTO_API, "number");
  const want = [...PHOTO_SHARED].sort();
  assert.equal(new Set(want).size, want.length);
  const names = (block) => block.replace(/\/\/[^\n]*/g, "").split(/[\s,]+/).filter(Boolean).sort();
  const host = src("src-photo-host.mjs").match(/export const \{([^}]*)\} = S;/);
  assert.ok(host, "src-photo-host.mjs: export const { … } = S;");
  assert.deepEqual(names(host[1]), want);
  const load = src("src-photo-load.jsx").match(/const shared = \{([^}]*)\};/);
  assert.ok(load, "src-photo-load.jsx: const shared = { … };");
  assert.deepEqual(names(load[1]), want);
});

test("source: no Hangul outside comments in the split files (text lives in src-portfolio-text.mjs)", () => {
  for (const f of ["src-photo-api.mjs", "src-photo-host.mjs", "src-photo-entry.jsx", "src-photo-load.jsx", "src-photo-host-react.cjs", "src-photo-host-dom.cjs", "src-photo-host-jsx.cjs"]) {
    const code = src(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    assert.equal(code.match(/[ㄱ-ㆎ가-힣]+/), null, f);
  }
});
