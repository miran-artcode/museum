// PhotoCraft 웹판을 public/photocraft/에 설치한다 (npm run build 마지막 단계).
// - 바이너리(wasm 24 MB)는 저장소에 넣지 않는다. 고정 버전의 릴리스 zip과 한글 글꼴을 받아 SHA-256을 확인하고
//   node_modules/.cache/photocraft/에 보관한다(배포용 임시 트리는 node_modules를 정션으로 잇으므로 캐시를 함께 쓴다).
// - zip을 풀고, index.html에 연결 스크립트(src-pc-bridge.js → pc-bridge.js)를 wasm보다 먼저 넣고,
//   한글 화면용 글꼴 목록(fonts/manifest.txt)을 쓴다. PhotoCraft 웹판에는 한글 글꼴이 없어 이것이 없으면 메뉴가 네모로 보인다.
// 사용: node scripts/photocraft-fetch.mjs [--force]
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(root, "public", "photocraft");
const CACHE = path.join(root, "node_modules", ".cache", "photocraft");

export const PC_VERSION = "0.8.2";
const ZIP = {
  url: `https://github.com/storytold/photocraft/releases/download/v${PC_VERSION}/photocraft-web-${PC_VERSION}.zip`,
  file: `photocraft-web-${PC_VERSION}.zip`,
  sha256: "490e4f3c242f2eee42f58446db8e7d468ac7abae3548b31a477e7fd43a7e92f4",
};
// 나눔고딕(OFL-1.1), google/fonts 고정 커밋
const FONT_BASE = "https://raw.githubusercontent.com/google/fonts/133ccbee9a8b408eb71f31a36ccb9116f5c695ad/ofl/nanumgothic/";
const FONTS = [
  { file: "NanumGothic-Regular.ttf", style: "Regular", sha256: "76f45ef4a6bcff344c837c95a7dcc26e017e38b5846d5ae0cdcb5b86be2e2d31" },
  { file: "NanumGothic-Bold.ttf", style: "Bold", sha256: "f96298f9fb18e364d2370f4c3ce948ac67a2b61af992d7234bc15c42b033c674" },
  { file: "OFL.txt", sha256: "eeacf16032901d0ed0456876ec77b8f0fda6b3fecec7d972f8543eb602e6c30f" },
];
// 릴리스 zip 가운데 사이트에 올릴 것(README·HOSTING·서버 설정 예시는 뺀다)
const KEEP = (name) => /\.(wasm|js)$/.test(name) || name === "index.html" || /^LICENSE-/.test(name);

const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

async function cached({ url, file, sha256 }) {
  const p = path.join(CACHE, file);
  if (fs.existsSync(p) && sha(fs.readFileSync(p)) === sha256) return fs.readFileSync(p);
  fs.mkdirSync(CACHE, { recursive: true });
  process.stdout.write(`photocraft: 받는 중 ${file} ... `);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const got = sha(buf);
  if (got !== sha256) throw new Error(`${file}: SHA-256 불일치 (${got})`);
  fs.writeFileSync(p, buf);
  console.log(`${(buf.length / 1048576).toFixed(1)} MB`);
  return buf;
}

/** 작은 zip 해제기(저장·deflate만). 중앙 디렉터리에서 항목을 읽는다 */
function unzip(buf) {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("zip: 끝 레코드 없음");
  const n = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let k = 0; k < n; k++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("zip: 중앙 디렉터리 손상");
    const method = buf.readUInt16LE(p + 10), csize = buf.readUInt32LE(p + 20);
    const nl = buf.readUInt16LE(p + 28), xl = buf.readUInt16LE(p + 30), cl = buf.readUInt16LE(p + 32);
    const lho = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nl);
    p += 46 + nl + xl + cl;
    if (name.endsWith("/")) continue;
    const ds = lho + 30 + buf.readUInt16LE(lho + 26) + buf.readUInt16LE(lho + 28);
    const raw = buf.subarray(ds, ds + csize);
    out.push({ name, data: method === 0 ? raw : method === 8 ? zlib.inflateRawSync(raw) : null });
  }
  return out;
}

export function bridgeTag() {
  const b = fs.readFileSync(path.join(root, "src-pc-bridge.js"));
  return { buf: b, v: sha(b).slice(0, 10) };
}

async function main() {
  const force = process.argv.includes("--force");
  const stampP = path.join(OUT, ".stamp");
  const stamp = `${PC_VERSION}`;
  const have = !force && fs.existsSync(stampP) && fs.readFileSync(stampP, "utf8") === stamp;
  if (!have) {
    const zip = await cached(ZIP);
    const fonts = [];
    for (const f of FONTS) fonts.push({ ...f, buf: await cached({ url: FONT_BASE + f.file, file: f.file, sha256: f.sha256 }) });
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.mkdirSync(path.join(OUT, "fonts", "nanum"), { recursive: true });
    for (const e of unzip(zip)) {
      const base = e.name.split("/").pop();
      if (!KEEP(base)) continue;
      if (!e.data) throw new Error("zip: 지원하지 않는 압축 " + e.name);
      fs.writeFileSync(path.join(OUT, base), e.data);
    }
    for (const f of fonts) fs.writeFileSync(path.join(OUT, "fonts", "nanum", f.file), f.buf);
    // family | style | file | scripts | licence | licence file | sha256 | source (craft-fonts 형식)
    const rows = fonts.filter((f) => f.style).map((f) =>
      `NanumGothic | ${f.style} | fonts/nanum/${f.file} | Kore,Latn | OFL-1.1 | fonts/nanum/OFL.txt | ${f.sha256} | ${FONT_BASE}`);
    fs.writeFileSync(path.join(OUT, "fonts", "manifest.txt"), "# family | style | file | scripts | licence | licence file | sha256 | source\n" + rows.join("\n") + "\n");
    fs.writeFileSync(path.join(OUT, ".index.src.html"), fs.readFileSync(path.join(OUT, "index.html")));
    fs.writeFileSync(stampP, stamp);
  }
  // 연결 스크립트는 매번 새로 넣는다(파일 이름에 내용 해시를 붙여 캐시가 옛 것을 주지 않게)
  for (const f of fs.readdirSync(OUT)) if (/^pc-bridge\..*\.js$/.test(f)) fs.rmSync(path.join(OUT, f));
  const { buf, v } = bridgeTag();
  const bridgeName = `pc-bridge.${v}.js`;
  fs.writeFileSync(path.join(OUT, bridgeName), buf);
  let html = fs.readFileSync(path.join(OUT, ".index.src.html"), "utf8");
  const at = html.indexOf('<script type="module">');
  if (at < 0) throw new Error("photocraft index.html: 모듈 스크립트 자리를 찾지 못함");
  html = html.slice(0, at) + `<script src="./${bridgeName}"></script>\n` + html.slice(at);
  html = html.replace('<html lang="en">', '<html lang="ko">');
  fs.writeFileSync(path.join(OUT, "index.html"), html);
  console.log(`photocraft: public/photocraft (v${PC_VERSION}, bridge ${v})`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error("photocraft:", e.message); process.exit(1); });
}
