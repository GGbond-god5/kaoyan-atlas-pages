// 全仓自检（无第三方依赖）：
// 1) functions/ 与 assets/ 下所有 .js 做语法检查（node --check）；
// 2) src/bank/ 下所有 .json 做 JSON 合法性检查，并统计各科题目数与缺答案/缺解析数；
// 3) 根目录每个 .html 必须登记在 scripts/build-pages.mjs 的 FILES 里（防"新页面没部署"）。
// 用法：node scripts/check.mjs（或 npm run check）。任一项失败以非零码退出。
import { readdirSync, readFileSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

let failed = 0;
const walk = (dir, ext, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, ext, out);
    else if (name.endsWith(ext)) out.push(p);
  }
  return out;
};

// 1) JS 语法
const jsFiles = [...walk("functions", ".js"), ...walk("assets", ".js")];
for (const f of jsFiles) {
  try { execFileSync(process.execPath, ["--check", f], { stdio: "pipe" }); }
  catch (e) { failed++; console.log(`✗ 语法错误 ${f}\n${e.stderr?.toString() || e.message}`); }
}
console.log(`JS 语法检查：${jsFiles.length} 个文件`);

// 2) 题库 JSON
let total = 0, noAnswer = 0, noSteps = 0;
for (const f of walk("src/bank", ".json")) {
  let d;
  try { d = JSON.parse(readFileSync(f, "utf8")); }
  catch (e) { failed++; console.log(`✗ JSON 无法解析 ${f}: ${e.message}`); continue; }
  for (const q of d.items || []) {
    total++;
    if (!String(q.answer || "").trim()) noAnswer++;
    if (!(q.steps || []).some((s) => String(s).trim())) noSteps++;
  }
}
console.log(`题库：共 ${total} 题，缺答案 ${noAnswer}，缺解析 ${noSteps}`);

// 3) 页面登记
const buildSrc = readFileSync("scripts/build-pages.mjs", "utf8");
const listed = new Set([...buildSrc.matchAll(/"([a-z0-9-]+\.html)"/gi)].map((m) => m[1]));
for (const f of readdirSync(".").filter((x) => x.endsWith(".html"))) {
  if (!listed.has(f)) { failed++; console.log(`✗ 页面 ${f} 未登记进 build-pages.mjs 的 FILES，不会部署`); }
}
console.log(failed ? `\n自检未通过（${failed} 项）` : "\n自检通过 ✓");
process.exit(failed ? 1 : 0);
