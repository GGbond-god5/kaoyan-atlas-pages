// 把 lazy-src 下的 Obsidian 笔记转换成站点可直接加载的 JSON。
// 输入：lazy-src/数一、lazy-src/英一
// 输出：assets/lazy-index.js、assets/lazy/<chapter>.json、assets/lazy-figs/*
import {
  readFileSync, writeFileSync, mkdirSync, rmSync, copyFileSync,
  readdirSync, statSync, existsSync,
} from "node:fs";
import { join, dirname, basename, relative, extname } from "node:path";
import { createHash } from "node:crypto";
import vm from "node:vm";

const ROOT = process.cwd();
const SRC = join(ROOT, "lazy-src");
const ASSETS = join(ROOT, "assets");
const OUT_LAZY = join(ASSETS, "lazy");
const OUT_FIGS = join(ASSETS, "lazy-figs");

const DIR_MAP = {
  "数一/1 高数/1 函数 极限与连续": "math-01",
  "数一/1 高数/2 一元函数微分学及其应用": "math-02",
  "数一/1 高数/3 微分中值定理": "math-02",
  "数一/1 高数/4 一元函数积分学及其应用": "math-03",
  "数一/1 高数/5 空间解析几何与场论": "math-04",
  "数一/1 高数/6 多元函数微分学及其应用": "math-05",
  "数一/1 高数/7 二重积分及其应用": "math-06",
  "数一/1 高数/8 微分方程": "math-08",
  "数一/1 高数/9 无穷级数": "math-07",
  "数一/1 高数/10 线面积分": "math-06",
  "数一/1 高数/0 汇总": "math-methods",
  "数一/2 线代/1 行列式": "math-09",
  "数一/2 线代/2 矩阵": "math-10",
  "数一/2 线代/3 向量组": "math-11",
  "数一/2 线代/4 线性方程组": "math-11",
  "数一/2 线代/5 特征值与特征向量": "math-12",
  "数一/2 线代/6 二次型": "math-13",
  "数一/3 概率论/1 随机事件与概率": "math-14",
  "数一/3 概率论/2 一维随机变量及其分布": "math-15",
  "数一/3 概率论/3 二维随机变量及其分布": "math-16",
  "数一/3 概率论/4 随机变量的数字特征": "math-17",
  "数一/3 概率论/5 大数定律和中心极限定理": "math-18",
  "数一/3 概率论/6 数理统计的基本概念": "math-19",
  "数一/3 概率论/7 参数估计": "math-20",
  "数一/3 概率论/8 假设检验": "math-20",
};

const FILE_MAP = {
  "英一/小作文模版.md": "english-06",
  "英一/大作文模板最终版.md": "english-07",
  "英一/2026英一大小作文预测与检验.md": "english-08",
  "英一/2027小作文模板.md": "english-06",
  "英一/2027大作文模板.md": "english-07",
  "英一/2027英一大小作文预测与检验.md": "english-08",
  "英一/作文句式速查库.md": "english-08",
  "英一/石雷鹏小作文背诵10篇.md": "english-06",
  "英一/石雷鹏大作文背诵10篇.md": "english-07",
  "英一/石雷鹏写作必背功能句汇总.md": "english-08",
  "英一/石雷鹏写作高频词汇和表达.md": "english-08",
  "英一/石雷鹏大纲模拟样题解析.md": "english-08",
};

// 政治笔记按学科目录整体映射到章节，子目录沿用同一章
const PREFIX_MAP = {
  "政治/马原": "pol-01",
  "政治/马原/b 马克思主义哲学": "pol-01",
  "政治/马原/c 马克思主义政治经济学": "pol-02",
  "政治/马原/d 科学社会主义": "pol-02",
  "政治/毛中特": "pol-03",
  "政治/新思想": "pol-04",
  "政治/史纲": "pol-05",
  "政治/思修": "pol-06",
};

function matchPrefix(dirRel) {
  let best = null;
  for (const key of Object.keys(PREFIX_MAP)) {
    if (dirRel === key || dirRel.startsWith(`${key}/`)) {
      if (!best || key.length > best.length) best = key;
    }
  }
  return best ? PREFIX_MAP[best] : null;
}

const TYPE_ORDER = ["思维导图", "作文模板", "基础知识", "方法", "公式", "补充理解", "补充", "补充知识", "总结", "题目", "错题", "同类题目"];

const esc = s => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

function loadAtlas() {
  const code = readFileSync(join(ROOT, "assets/data.js"), "utf8");
  const ctx = { window: {} };
  vm.runInNewContext(code, ctx);
  return ctx.window.ATLAS;
}

function slug(text, len = 10) {
  return createHash("sha1").update(text).digest("hex").slice(0, len);
}

function parseFrontmatter(raw) {
  const meta = {};
  let body = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  if (body.startsWith("---\n")) {
    const end = body.indexOf("\n---", 4);
    if (end > 0) {
      const head = body.slice(4, end);
      body = body.slice(end + 4).replace(/^\n/, "");
      let current = null;
      for (const line of head.split("\n")) {
        const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
        if (m) {
          current = m[1];
          meta[current] = m[2].replace(/^["']|["']$/g, "");
        } else if (/^\s+-\s+/.test(line) && current === "tags") {
          meta.tags = meta.tags && meta.tags !== "" ? `${meta.tags}, ${line.trim().slice(2)}` : line.trim().slice(2);
        }
      }
    }
  }
  return { meta, body };
}

function cleanTitle(meta, file) {
  let t = meta.title || basename(file, ".md");
  t = t.replace(/^\[\[|\]\]$/g, "").replace(/\|.*$/, "").trim();
  return t || basename(file, ".md");
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (st.isFile() && name.toLowerCase().endsWith(".md")) out.push(full);
  }
  return out;
}

function joinParagraph(lines) {
  let out = "";
  for (const line of lines) {
    const text = line.trim();
    if (!out) { out = text; continue; }
    const a = out[out.length - 1], b = text[0] || "";
    const ascii = /[A-Za-z0-9]$/.test(a) && /^[A-Za-z0-9]/.test(b);
    out += (ascii ? " " : "") + text;
  }
  return out;
}

function mathPlaceholders(text) {
  const stash = [];
  let out = "", buf = "", state = "none", i = 0;
  const push = kind => {
    if (!buf.trim()) { buf = ""; return; }
    stash.push(kind === "display" ? `\\[${esc(buf.trim())}\\]` : `\\(${esc(buf.trim())}\\)`);
    out += `\u0000M${stash.length - 1}\u0000`;
    buf = "";
  };
  while (i < text.length) {
    if (text[i] !== "$") {
      if (state === "none") out += text[i];
      else buf += text[i];
      i++;
      continue;
    }
    let j = i;
    while (j < text.length && text[j] === "$") j++;
    let run = j - i;
    while (run > 0) {
      if (state === "none") {
        if (run >= 2) { state = "display"; run -= 2; }
        else { state = "inline"; run -= 1; }
      } else if (state === "display") {
        if (run >= 2) { push("display"); state = "none"; run -= 2; }
        else { buf += "$"; run -= 1; }
      } else {
        push("inline"); state = "none"; run -= 1;
      }
    }
    i = j;
  }
  if (state === "inline") out += `$${buf}`;
  else if (state === "display") out += `$$${buf}`;
  return { text: out, stash };
}

function restore(text, stash) {
  return text.replace(/\u0000M(\d+)\u0000/g, (_, i) => stash[Number(i)] || "");
}

function makeImageResolver(noteDir, noteId, copied) {
  return (target) => {
    const clean = target.split("|")[0].split("#")[0].trim();
    if (!/\.(png|jpe?g|webp|gif|svg)$/i.test(clean)) return null;
    const candidates = [
      join(noteDir, clean),
      join(noteDir, "fig", basename(clean)),
      join(SRC, clean),
      join(SRC, "fig", basename(clean)),
    ];
    const found = candidates.find(p => existsSync(p));
    if (!found) return null;
    const outName = `${noteId}-${basename(found).replace(/[^\w.\u4e00-\u9fa5-]+/g, "_")}`;
    copyFileSync(found, join(OUT_FIGS, outName));
    copied.add(outName);
    return `assets/lazy-figs/${outName}`;
  };
}

function inline(text, ctx) {
  let s = text;
  const code = [];
  s = s.replace(/`([^`]+)`/g, (_, c) => {
    code.push(`<code>${esc(c)}</code>`);
    return `\u0000C${code.length - 1}\u0000`;
  });

  s = s.replace(/!\[\[([^\]]+)\]\]/g, (_, raw) => {
    const [target, size] = raw.split("|");
    const src = ctx.image(target);
    if (src) {
      const width = size && /^\d+/.test(size) ? ` style="max-width:${parseInt(size, 10)}px"` : "";
      return `<img class="lazy-img" src="${src}" alt=""${width}>`;
    }
    return `<span class="note-ref">↪ ${esc(target.split("#")[0])}</span>`;
  });

  s = s.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, src) => {
    if (/^https?:/i.test(src)) return `<img class="lazy-img" src="${esc(src)}" alt="${esc(alt)}">`;
    const local = ctx.image(src);
    return local ? `<img class="lazy-img" src="${local}" alt="${esc(alt)}">` : "";
  });

  s = s.replace(/\[\[([^\]]+)\]\]/g, (_, raw) => {
    const [target, label] = raw.split("|");
    return `<span class="note-ref" data-target="${esc(target.split("#")[0])}">${esc((label || target).split("#")[0])}</span>`;
  });

  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    if (/^https?:/i.test(href)) return `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}</a>`;
    return `<span class="note-ref">${esc(label)}</span>`;
  });

  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/__([^_]+)__/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/==([^=]+)==/g, "<mark>$1</mark>");
  s = s.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  s = s.replace(/\s*\^[a-z0-9]{4,8}\s*$/gi, "");

  s = s.replace(/\u0000C(\d+)\u0000/g, (_, i) => code[Number(i)] || "");
  return s;
}

function renderList(items, ctx) {
  let html = "";
  const stack = [];
  for (const it of items) {
    while (stack.length && it.indent < stack[stack.length - 1].indent) {
      html += `</li></${stack.pop().tag}>`;
    }
    const tag = /^\d+[.)]$/.test(it.marker) ? "ol" : "ul";
    if (!stack.length || it.indent > stack[stack.length - 1].indent) {
      html += `<${tag}>`;
      stack.push({ indent: it.indent, tag });
    } else {
      html += "</li>";
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(it.text);
    html += `<li>${heading ? `<strong class="li-head">${inline(heading[2], ctx)}</strong>` : inline(it.text, ctx)}`;
  }
  while (stack.length) html += `</li></${stack.pop().tag}>`;
  return html;
}

function markdownToHtml(md, ctx, mathState) {
  const raw = md.replace(/\r\n/g, "\n");
  const math = mathState || mathPlaceholders(raw);
  const lines = (mathState ? raw : math.text).split("\n");
  const out = [];
  let i = 0;
  const isBlockStart = line =>
    /^#{1,6}\s+/.test(line) || /^```/.test(line) || /^\s*>\s?/.test(line) ||
    /^(\s*)([-*+]|\d+[.)])\s+/.test(line) || /^\|/.test(line) || /^(-{3,}|\*{3,})$/.test(line.trim());

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    if (/^```/.test(line)) {
      const lang = line.replace(/^```/, "").trim();
      const buf = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++;
      out.push(`<pre class="lazy-code"><code${lang ? ` data-lang="${esc(lang)}"` : ""}>${esc(buf.join("\n"))}</code></pre>`);
      continue;
    }

    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      const level = Math.min(6, h[1].length + 1);
      out.push(`<h${level}>${inline(h[2], ctx)}</h${level}>`);
      i++;
      continue;
    }

    if (/^(-{3,}|\*{3,})$/.test(line.trim())) { out.push("<hr>"); i++; continue; }

    if (/^\s*>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^\s*>\s?/, ""));
      const first = buf[0] || "";
      const call = /^\[!([A-Za-z]+)\]\s*(.*)$/.exec(first);
      if (call) {
        const type = call[1].toLowerCase();
        const title = call[2] || call[1];
        const body = markdownToHtml(buf.slice(1).join("\n"), ctx, math);
        out.push(`<div class="callout callout-${esc(type)}"><div class="callout-title">${inline(title, ctx)}</div><div class="callout-body">${body}</div></div>`);
      } else {
        out.push(`<blockquote>${markdownToHtml(buf.join("\n"), ctx, math)}</blockquote>`);
      }
      continue;
    }

    if (/^\|/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      if (rows.length >= 2 && /^\|[\s:|-]+\|?$/.test(rows[1].trim())) {
        const split = row => row.replace(/^\||\|$/g, "").split("|").map(c => c.trim());
        const head = split(rows[0]);
        const body = rows.slice(2).map(split);
        out.push(`<table class="lazy-table"><thead><tr>${head.map(c => `<th>${inline(c, ctx)}</th>`).join("")}</tr></thead><tbody>${body.map(r => `<tr>${r.map(c => `<td>${inline(c, ctx)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
      } else {
        out.push(`<p>${inline(joinParagraph(rows), ctx)}</p>`);
      }
      continue;
    }

    if (/^(\s*)([-*+]|\d+[.)])\s+/.test(line)) {
      const listItems = [];
      let last = null;
      while (i < lines.length) {
        const cur = lines[i];
        const m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(cur);
        if (m) {
          last = { indent: m[1].replace(/\t/g, "  ").length, marker: m[2], text: m[3] };
          listItems.push(last);
          i++;
        } else if (cur.trim() && /^\s{2,}/.test(cur) && last) {
          last.text += `<br>${cur.trim()}`;
          i++;
        } else break;
      }
      out.push(renderList(listItems, ctx));
      continue;
    }

    const para = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) para.push(lines[i++]);
    out.push(`<p>${inline(joinParagraph(para), ctx)}</p>`);
  }

  return restore(out.join("\n"), math.stash);
}

function main() {
  const atlas = loadAtlas();
  const chapterMeta = {};
  const order = [];
  for (const subject of atlas.subjects) {
    for (const ch of subject.chapters) {
      chapterMeta[ch.id] = { subject: subject.name, title: ch.title };
      order.push(ch.id);
    }
  }
  chapterMeta["math-methods"] = { subject: "数学一", title: "方法与思维" };
  const methodsAt = order.indexOf("math-20");
  order.splice(methodsAt >= 0 ? methodsAt + 1 : order.length, 0, "math-methods");

  rmSync(OUT_LAZY, { recursive: true, force: true });
  rmSync(OUT_FIGS, { recursive: true, force: true });
  mkdirSync(OUT_LAZY, { recursive: true });
  mkdirSync(OUT_FIGS, { recursive: true });

  const groups = {};
  for (const file of walk(SRC)) {
    const rel = relative(SRC, file).split("\\").join("/");
    const dirRel = dirname(rel);
    const groupId = FILE_MAP[rel] || DIR_MAP[dirRel] || matchPrefix(dirRel) || (dirRel.startsWith("数一/1 高数/0 汇总") ? "math-methods" : null);
    if (!groupId) continue;
    const { meta, body } = parseFrontmatter(readFileSync(file, "utf8"));
    const title = cleanTitle(meta, file);
    const noteId = slug(rel);
    const copied = new Set();
    const ctx = { image: makeImageResolver(dirname(file), noteId, copied) };
    const html = markdownToHtml(body, ctx);
    const type = meta.type || "笔记";
    // 版本分级标记（2026-11-22）：frontmatter 写 tier: beta 的笔记标为内测，其余默认公开。
    // 目前只是标记机制：笔记按章节打包成一个 JSON，同一文件里可混两种 tier，
    // 按 tier 拆分分发（内测笔记单独成包 + 中间件门禁）需等确有 beta 笔记后再做，不要在此猜来源。
    const tier = meta.tier === "beta" ? "beta" : "public";
    (groups[groupId] ||= { notes: [] }).notes.push({
      id: noteId, title, type, tier, tags: meta.tags ? meta.tags.split(/,\s*/).filter(Boolean) : [], html,
    });
  }

  const index = { generated: new Date().toISOString().slice(0, 10), order: [], groups: {} };
  for (const id of order) {
    const g = groups[id];
    if (!g || !g.notes.length) continue;
    g.notes.sort((a, b) => {
      const ta = TYPE_ORDER.indexOf(a.type), tb = TYPE_ORDER.indexOf(b.type);
      return (ta < 0 ? 99 : ta) - (tb < 0 ? 99 : tb) || a.title.localeCompare(b.title, "zh");
    });
    const meta = chapterMeta[id] || { subject: "", title: id };
    writeFileSync(join(OUT_LAZY, `${id}.json`), JSON.stringify({
      id, subject: meta.subject, title: meta.title, notes: g.notes,
    }));
    index.order.push(id);
    index.groups[id] = {
      subject: meta.subject, title: meta.title, count: g.notes.length,
      notes: g.notes.map(n => ({ id: n.id, title: n.title, type: n.type, tier: n.tier })),
    };
  }
  for (const id of Object.keys(groups)) {
    if (index.groups[id]) continue;
    const meta = chapterMeta[id] || { subject: "", title: id };
    const g = groups[id];
    g.notes.sort((a, b) => a.title.localeCompare(b.title, "zh"));
    writeFileSync(join(OUT_LAZY, `${id}.json`), JSON.stringify({ id, subject: meta.subject, title: meta.title, notes: g.notes }));
    index.order.push(id);
    index.groups[id] = {
      subject: meta.subject, title: meta.title, count: g.notes.length,
      notes: g.notes.map(n => ({ id: n.id, title: n.title, type: n.type, tier: n.tier })),
    };
  }

  writeFileSync(join(ASSETS, "lazy-index.js"),
    `window.LAZY_INDEX = ${JSON.stringify(index)};\n`);
  const total = Object.values(index.groups).reduce((n, g) => n + g.count, 0);
  console.log(`lazy notes: ${total} notes in ${index.order.length} groups`);
}

main();
