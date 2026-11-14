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
  "analytics.html",
  "_headers",
];

// 防漏：根目录下任何 .html 页面若没登记进 FILES，就不会被复制到 dist、线上会 404。
// 新增页面时必须同步登记；构建时在这里直接失败，好过上线后才发现。
import { readdirSync } from "node:fs";
const unlisted = readdirSync(".").filter((f) => f.endsWith(".html") && !FILES.includes(f));
if (unlisted.length) {
  throw new Error(`以下页面未登记到 build-pages.mjs 的 FILES，不会部署：${unlisted.join(", ")}`);
}

const DIRS = ["assets", "web", "content", "pdf"];

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

for (const file of FILES) cpSync(file, `dist/${file}`);
for (const dir of DIRS) cpSync(dir, `dist/${dir}`, { recursive: true });

console.log(`staged ${FILES.length} pages and ${DIRS.length} asset directories into dist/`);
