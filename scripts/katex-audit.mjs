// 公式渲染审计：用仓库自带的 KaTeX（assets/katex）逐条渲染题库全部公式，
// 找出会显示成乱码的公式（定界符不配对、非法命令、本版 KaTeX 不支持的行距写法 \\[2pt] 等）。
// 用法：node scripts/katex-audit.mjs（或 npm run check:katex）。发现问题以非零码退出。
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const require = createRequire(import.meta.url);
const katex = require("../assets/katex/katex.min.js");

const walk = (dir, out = []) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".json")) out.push(p);
  }
  return out;
};
const itemsOf = (d) => {
  if (Array.isArray(d)) return d;
  if (d.items) return d.items;
  const out = [];
  for (const kp of d.kps || []) out.push(...(kp.exams || []));
  return out;
};
function* formulas(s) {
  let i = 0;
  while (i < s.length - 1) {
    const two = s.substr(i, 2);
    if (two === "\\(" || two === "\\[") {
      const close = two === "\\(" ? "\\)" : "\\]";
      const j = s.indexOf(close, i + 2);
      if (j < 0) { yield { bad: "定界符未闭合", frag: s.slice(i, i + 60) }; return; }
      yield { tex: s.slice(i + 2, j), disp: two === "\\[" };
      i = j + 2;
    } else i++;
  }
}

let total = 0, bad = 0;
const report = [];
for (const f of [...walk("src/bank"), ...walk("src/chapters")]) {
  let d;
  try { d = JSON.parse(readFileSync(f, "utf8")); } catch { continue; }
  for (const q of itemsOf(d)) {
    const fields = [["text", q.text], ["answer", q.answer], ...(q.steps || []).map((s, i) => ["steps" + i, s])];
    for (const [field, s] of fields) {
      if (typeof s !== "string") continue;
      for (const fo of formulas(s)) {
        if (fo.bad) { bad++; report.push(`${q.id} ${field}: ${fo.bad}「${fo.frag}」`); continue; }
        total++;
        try { katex.renderToString(fo.tex, { throwOnError: true, displayMode: !!fo.disp }); }
        catch (e) { bad++; report.push(`${q.id} ${field}: ${e.message.slice(0, 60)}「${fo.tex.slice(0, 60)}」`); }
      }
    }
  }
}
console.log(`公式审计：共 ${total} 条，失败 ${bad} 条`);
for (const line of report.slice(0, 50)) console.log("✗", line);
process.exit(bad ? 1 : 0);
