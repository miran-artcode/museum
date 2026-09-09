import { copyFile, mkdir, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const dist = join(root, "dist");
const publicFiles = ["index.html", "prototype.css", "prototype.bundle.js"];

await mkdir(dist, { recursive: true });

const unexpected = (await readdir(dist)).filter((name) => !publicFiles.includes(name));
if (unexpected.length) {
  throw new Error(`배포 폴더에 허용되지 않은 파일이 있습니다: ${unexpected.join(", ")}`);
}

await Promise.all(publicFiles.map((name) => copyFile(join(root, name), join(dist, name))));
console.log(`배포 파일 ${publicFiles.length}개 준비: ${publicFiles.join(", ")}`);

