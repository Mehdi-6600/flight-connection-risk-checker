import { cp, mkdir, rm, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

for (const file of ["index.html"]) {
  await cp(path.join(root, file), path.join(output, file));
}
for (const directory of ["src", "data"]) {
  await cp(path.join(root, directory), path.join(output, directory), { recursive: true });
}
await cp(path.join(root, "public"), output, { recursive: true });

const requiredFiles = [
  "index.html",
  "src/main.js",
  "src/styles.css",
  "src/lib/risk-engine/engine.js",
  "data/airports.js",
  "manifest.webmanifest",
  "sw.js",
  "icons/icon-192.png",
  "icons/icon-512.png",
];
for (const file of requiredFiles) {
  const info = await stat(path.join(output, file));
  if (!info.isFile() || info.size === 0) throw new Error(`خروجی ساخت ناقص است: ${file}`);
}

console.log(`Build آماده شد: ${path.relative(root, output)} (${requiredFiles.length} فایل اصلی بررسی شد).`);
