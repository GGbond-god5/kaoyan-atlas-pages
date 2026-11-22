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

// 参赛版构建：node scripts/build-pages.mjs --contest → dist-contest/
// 同一套代码产出可纯静态托管的游客版：注入 ATLAS_CONTEST 标记与 contest.js，
// 前端在该标记下走无后端降级（演示档案、localStorage 状态、批改样例）。正式版构建不受影响。
const CONTEST = process.argv.includes("--contest") || process.env.ATLAS_CONTEST === "1";
// 内测版构建：node scripts/build-pages.mjs --beta → dist-beta/
// 与参赛版同一套无后端游客模式（复用 ATLAS_CONTEST 注入），区别在资料范围：
// 内测版保留全部内部资料（含第三方版权资料：肖1000 原页、模拟卷页图、大纲词汇），参赛版只放真题。
// 另注入 ATLAS_BETA 标记，左下胶囊显示「内测版 · 含内部资料」以免与参赛版混淆。
const BETA = process.argv.includes("--beta") || process.env.ATLAS_BETA === "1";
const OUT = BETA ? "dist-beta" : CONTEST ? "dist-contest" : "dist";

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

for (const file of FILES) cpSync(file, `${OUT}/${file}`);
// 参赛版资料收口（2026-11-22 站长指令）：参赛包的资料目录只放真题与本站自编内容，
// 第三方版权资料不进包——肖1000 原页扫描、模拟卷（张宇/李林/超越等）页图、大纲词汇 PDF。
// 正式版构建不走此过滤，主站资料库不受影响。
const CONTEST_EXCLUDE = [
  /^content\/x1000-pages(\/|$)/,
  /^content\/math-pages\/(mock|_tmp_crop)/,
  /^content\/_((mock|zy|ll|yl|cy|lyf|ocr)[^/]*|vocab_[^/]*)$/,
  /^pdf\/(vocab-|aliyun-)/,
];
const contestFilter = (src) => {
  const rel = src.replace(/\\/g, "/");
  return !CONTEST_EXCLUDE.some((re) => re.test(rel));
};
for (const dir of DIRS) cpSync(dir, `${OUT}/${dir}`, { recursive: true, filter: CONTEST && !BETA ? contestFilter : undefined });

if (CONTEST || BETA) {
  const { readFileSync: rf, writeFileSync: wf } = await import("node:fs");
  for (const file of FILES) {
    if (!file.endsWith(".html")) continue;
    let html = rf(`${OUT}/${file}`, "utf-8");
    html = html.replace(/<head[^>]*>/, "$&\n<script>window.ATLAS_CONTEST=true;" + (BETA ? "window.ATLAS_BETA=true;document.documentElement.classList.add('beta-locked');" : "") + "try{localStorage.setItem('atlas_tour_done','1');}catch(e){}</script>"); // 参赛/内测版跳过新手引导：打开直达内容
    html = html.replace("</body>", '<script src="assets/contest-sample.js"></script><script src="assets/contest.js"></script>' + (BETA ? '<script src="assets/beta-gate.js"></script>' : '') + '</body>');
    if (BETA) html = html.replace(/<head[^>]*>/, "$&\n<style>html.beta-locked body{visibility:hidden!important}</style>"); // 内测码通过前不露内容
    wf(`${OUT}/${file}`, html);
  }
  console.log((BETA ? "beta" : "contest") + " build: ATLAS_CONTEST injected" + (BETA ? " + ATLAS_BETA" : ""));
}

console.log(`staged ${FILES.length} pages and ${DIRS.length} asset directories into ${OUT}/`);

// 题库分片：把整包 questions.js 按科目拆成 dist/assets/questions/<科目>.js + manifest.json，
// 刷题页按需加载（见 assets/questions-loader.js）；dist 里不再保留整包，仓库里的源文件不动。
import { readFileSync, writeFileSync } from "node:fs";
const qSrc = readFileSync(`${OUT}/assets/questions.js`, "utf-8");
const qMatch = qSrc.match(/window\.QUESTIONS\s*=\s*(\{[\s\S]*\});?\s*$/);
if (!qMatch) throw new Error("questions.js 格式无法识别，题库分片失败");
const qData = JSON.parse(qMatch[1]);
const bySubject = new Map();
for (const q of qData.items || []) {
  const s = q.subject || "other";
  if (!bySubject.has(s)) bySubject.set(s, []);
  bySubject.get(s).push(q);
}
mkdirSync(`${OUT}/assets/questions`, { recursive: true });
const manifest = { total: (qData.items || []).length, subjects: {} };
for (const [subj, list] of bySubject) {
  writeFileSync(`${OUT}/assets/questions/${subj}.js`, `AtlasQuestions._add(${JSON.stringify(subj)}, ${JSON.stringify(list)});\n`);
  manifest.subjects[subj] = list.length;
}
writeFileSync(`${OUT}/assets/questions/manifest.json`, JSON.stringify(manifest));
// 游客分片（2026-11-22）：只含真题（isReal），供未登录游客与参赛版使用；全量分片由中间件对游客屏蔽。
mkdirSync(`${OUT}/assets/questions-guest`, { recursive: true });
const gManifest = { total: 0, subjects: {} };
for (const [subj, list] of bySubject) {
  const real = list.filter((q) => q.isReal === true);
  writeFileSync(`${OUT}/assets/questions-guest/${subj}.js`, `AtlasQuestions._add(${JSON.stringify(subj)}, ${JSON.stringify(real)});\n`);
  gManifest.subjects[subj] = real.length;
  gManifest.total += real.length;
}
writeFileSync(`${OUT}/assets/questions-guest/manifest.json`, JSON.stringify(gManifest));
console.log(`guest shards: ${gManifest.total} real-only items`);
rmSync(`${OUT}/assets/questions.js`);
console.log(`questions split into ${bySubject.size} shards, ${manifest.total} items total`);
