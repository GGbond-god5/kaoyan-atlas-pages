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
    if (CONTEST && file === "bank.html") { // 参赛版资料库文案只讲真题（原稿提到模拟卷/肖1000/807，与参赛包内容不符且涉第三方版权）
      html = html.replace(/<p>这里可以直接刷大观自带的[\s\S]*?勘误。<\/p>/, "<p>这里可以直接刷大观自带的 3,290 道公共课真题：题干、题图、完整解答与自评判分都在网页里完成。数学一/二/三 2009–2025 年真题、英语一/二历年真题、政治 2017–2026 年真题已全部逐题入库，并按知识点章节打标签，可直接在「按知识点刷」里按章节筛选；其余年份可在套卷模式打开原卷与解析 PDF。</p>");
      html = html.replace("开始刷题（4662 题）→", "开始刷题（3290 题）→");
      html = html.replace(/<p class="bnote">来源说明：[\s\S]*?<\/p>/, '<p class="bnote">来源说明：历年真题版权归原作者/出版社所有；本页仅提供索引与跳转，不存储、不转载题目内容。</p>');
    }
    wf(`${OUT}/${file}`, html);
  }
  console.log((BETA ? "beta" : "contest") + " build: ATLAS_CONTEST injected" + (BETA ? " + ATLAS_BETA" : ""));
}

console.log(`staged ${FILES.length} pages and ${DIRS.length} asset directories into ${OUT}/`);

// 参赛版科目收口（2026-11-22 站长定版）：只放公共课——题库数一/二/三、英一/二、政治；
// 知识库只留数学/英语/政治三系。章节总数据剔除力学科目、删力学讲义文件、套卷目录清空模拟卷。
if (CONTEST) {
  const atlasPath = `${OUT}/assets/data.js`;
  const atlasData = JSON.parse(readFileSync(atlasPath, "utf-8").replace(/^window\.ATLAS\s*=\s*/, "").replace(/;\s*$/, ""));
  atlasData.subjects = atlasData.subjects.filter((x) => x.id !== "mechanics");
  let atlasJson = JSON.stringify(atlasData)
    .replaceAll("年度具体事件以肖四、腿姐冲刺手册为准", "年度具体事件以最新时政材料为准")
    .replaceAll("再用肖八肖四收口", "再用冲刺卷收口"); // 章节文案里的博主产品名在参赛版中性化
  writeFileSync(atlasPath, `window.ATLAS = ${atlasJson};\n`);
  const bankCatPath = `${OUT}/assets/bank-catalog.js`; // 资料目录只留真题条目（模拟题/讲义等第三方资料不进参赛包）
  const bankCat = JSON.parse(readFileSync(bankCatPath, "utf-8").replace(/^window\.BANK_CATALOG\s*=\s*/, "").replace(/;\s*$/, ""));
  writeFileSync(bankCatPath, `window.BANK_CATALOG=${JSON.stringify(bankCat.filter((e) => e.type === "真题"))};\n`);
  const bankJsPath = `${OUT}/assets/bank.js`; // 资料种子清单里的第三方条目整行剔除（文件层面也不留）
  const bankJs = readFileSync(bankJsPath, "utf-8").split("\n")
    .filter((line) => !/id: "(pol-xiao1000|pol-xiao8|pol-xiao4|math-lin6|math-zhang4|math-hefei|mech-zhang|mech-330)"/.test(line))
    .join("\n");
  writeFileSync(bankJsPath, bankJs);
  const importPath = `${OUT}/assets/import-list.js`; // 导入来源清单是内部 sourcing 记录，参赛版清空
  const importList = JSON.parse(readFileSync(importPath, "utf-8").replace(/^window\.IMPORT_LIST\s*=\s*/, "").replace(/;\s*$/, ""));
  importList.items = []; importList.share = "";
  writeFileSync(importPath, `window.IMPORT_LIST=${JSON.stringify(importList)};\n`);
  for (const f of readdirSync(`${OUT}/web`)) if (f.startsWith("mech-")) rmSync(`${OUT}/web/${f}`);
  const papersPath = `${OUT}/assets/papers.js`;
  const papers = JSON.parse(readFileSync(papersPath, "utf-8").replace(/^window\.PAPERS\s*=\s*/, "").replace(/;\s*$/, ""));
  papers.mock = [];
  writeFileSync(papersPath, `window.PAPERS=${JSON.stringify(papers)};\n`);
  console.log("contest scope: public subjects only (no mechanics, no mock papers)");
}

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
const manifest = { total: 0, subjects: {} };
if (!CONTEST) { // 参赛版不带全量分片（含肖1000/模拟卷数据），只发游客分片
  mkdirSync(`${OUT}/assets/questions`, { recursive: true });
  for (const [subj, list] of bySubject) {
    writeFileSync(`${OUT}/assets/questions/${subj}.js`, `AtlasQuestions._add(${JSON.stringify(subj)}, ${JSON.stringify(list)});\n`);
    manifest.subjects[subj] = list.length;
    manifest.total += list.length;
  }
  writeFileSync(`${OUT}/assets/questions/manifest.json`, JSON.stringify(manifest));
}
// 游客分片（2026-11-22）：只含真题（isReal），供未登录游客与参赛版使用；全量分片由中间件对游客屏蔽。
mkdirSync(`${OUT}/assets/questions-guest`, { recursive: true });
const gManifest = { total: 0, subjects: {} };
for (const [subj, list] of bySubject) {
  if (CONTEST && subj === "mechanics") continue; // 参赛版只放公共课：无 807
  const real = list.filter((q) => q.isReal === true);
  let guestShard = `AtlasQuestions._add(${JSON.stringify(subj)}, ${JSON.stringify(real)});\n`;
  if (CONTEST) guestShard = guestShard // 真题解析批注里引用过的出版解析名在参赛版中性化（仅参赛包，不动源数据）
    .replaceAll("（如张宇、李永乐版）", "（如通行解析版）")
    .replaceAll("（如张宇、李永乐）", "（如通行解析）")
    .replaceAll("（如李永乐《复习全书》", "（如通行解析");
  writeFileSync(`${OUT}/assets/questions-guest/${subj}.js`, guestShard);
  gManifest.subjects[subj] = real.length;
  gManifest.total += real.length;
}
writeFileSync(`${OUT}/assets/questions-guest/manifest.json`, JSON.stringify(gManifest));
console.log(`guest shards: ${gManifest.total} real-only items`);
rmSync(`${OUT}/assets/questions.js`);
console.log(`questions split into ${bySubject.size} shards, ${manifest.total} items total`);
