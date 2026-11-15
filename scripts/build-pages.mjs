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
  "settings.html",
  "admin.html",
  "community.html",
  "wrongbook.html",
  "app.html",
  "manifest.webmanifest",
  "app-version.json",
  "sw.js",
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

// 题库分片：把整包 questions.js 按科目拆成 dist/assets/questions/<科目>.js + manifest.json，
// 刷题页按需加载（见 assets/questions-loader.js）；dist 里不再保留整包，仓库里的源文件不动。
import { readFileSync, writeFileSync } from "node:fs";
const qSrc = readFileSync("dist/assets/questions.js", "utf-8");
const qMatch = qSrc.match(/window\.QUESTIONS\s*=\s*(\{[\s\S]*\});?\s*$/);
if (!qMatch) throw new Error("questions.js 格式无法识别，题库分片失败");
const qData = JSON.parse(qMatch[1]);
const bySubject = new Map();
for (const q of qData.items || []) {
  const s = q.subject || "other";
  if (!bySubject.has(s)) bySubject.set(s, []);
  bySubject.get(s).push(q);
}
mkdirSync("dist/assets/questions", { recursive: true });
const manifest = { total: (qData.items || []).length, subjects: {} };
for (const [subj, list] of bySubject) {
  writeFileSync(`dist/assets/questions/${subj}.js`, `AtlasQuestions._add(${JSON.stringify(subj)}, ${JSON.stringify(list)});\n`);
  manifest.subjects[subj] = list.length;
}
writeFileSync("dist/assets/questions/manifest.json", JSON.stringify(manifest));
rmSync("dist/assets/questions.js");
console.log(`questions split into ${bySubject.size} shards, ${manifest.total} items total`);
