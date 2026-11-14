// 只把线上需要的静态文件复制到 dist/，避免把 server/、docs/、src/ 暴露出去
import { cpSync, mkdirSync, rmSync } from "node:fs";
import "./build-import-skill.mjs";
import "./build-lazy-notes.mjs";

const FILES = [
  "index.html",
  "vocab.html",
  "timeline.html",
  "practice.html",
  "bank.html",
  "login.html",
  "register.html",
  "library.html",
  "_headers",
];

const DIRS = ["assets", "web", "content", "pdf"];

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

for (const file of FILES) cpSync(file, `dist/${file}`);
for (const dir of DIRS) cpSync(dir, `dist/${dir}`, { recursive: true });

console.log(`staged ${FILES.length} pages and ${DIRS.length} asset directories into dist/`);
