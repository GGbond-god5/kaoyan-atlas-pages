#!/usr/bin/env node
/* ============================================================
 * 点词查义词典补全数据生成器（不随站点构建自动运行，手动执行）
 *
 * 数据源：ECDICT（https://github.com/skywind3000/ECDICT，MIT License，
 *         Copyright (c) Linwei）——开源英汉词典库，含音标、英/汉释义、
 *         词形变化（exchange）、考试标注（tag，含考研 ky）、牛津核心标记。
 *         注意：这是开源词典数据，不是牛津词典原版数据。
 *
 * 用法：
 *   node scripts/build-dict.mjs <ecdict.csv 路径> [eng-wordfreq.json 路径]
 *   - ecdict.csv 需自行从 ECDICT 仓库下载（约 66MB，不要提交进本仓库）。
 *   - eng-wordfreq.json 为真题词频审计产物（~/workspace/kaoyan-audit/），
 *     提供「真题出现过的词」选词口径与新词条的真题频次；缺省则跳过该口径。
 *
 * 产物：assets/dict-data.js（window.DICTDB），由 assets/english-words.js
 *       懒加载后与 assets/vocab-data.js（大纲 5529 词，词汇学习页专用，
 *       本脚本不改它）在运行时合并：大纲词条的等级/频次/例句以 vocab 为准，
 *       ECDICT 只补音标、完整释义、英文释义、词形；词典独有词条单独成条。
 *
 * 选词口径（并集去重）：
 *   ① 大纲 5529 词全部补全；② 真题词频表出现过的词及其规则还原原形；
 *   ③ ECDICT tag 含 ky（考研）的词；④ ECDICT oxford 标记（牛津核心）的词；
 *   ⑤ ECDICT frq（COCA 词频排名）前 12000 的常见词，兜真题/模拟原文的长尾常见词；
 *   ⑥ 题库原文直抽：src/bank 英语一/二导入文件的 text/passage/options/answer
 *      全部英文文本，用与前端点词相同的切词正则抽 token 并按 candidates 入口
 *      口径归一化。审计词频表（②）覆盖不全（如 acrylamide、neurological 都不在
 *      表内），⑥ 是真题词来源的兜底全量口径，与 ② 合并计数后共用同一套
 *      选词/频次/变形映射逻辑。
 * 词形映射 f{}：只收真题词频（含题库直抽）里出现、且 ECDICT 以「0:原形」标注的变形词，
 *       供点词在规则还原落空时兜底（went 类已由 english-words.js 内置表覆盖）。
 * ============================================================ */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const ECDICT_CSV = process.argv[2];
const WORDFREQ_JSON = process.argv[3] || "";
if (!ECDICT_CSV) {
  console.error("用法: node scripts/build-dict.mjs <ecdict.csv> [eng-wordfreq.json]");
  process.exit(1);
}
const require = createRequire(import.meta.url);

/* ---------- 加载 vocab-data.js 与 english-words.js 的纯函数 ---------- */
function loadWithWindowStub(file, extra) {
  const sandbox = Object.assign(
    { window: {}, document: { addEventListener() {} }, console },
    extra || {}
  );
  sandbox.window.document = sandbox.document;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(file, "utf8"), sandbox, { filename: file });
  return sandbox.window;
}
const vocabWin = loadWithWindowStub(new URL("../assets/vocab-data.js", import.meta.url).pathname);
const VOCAB = vocabWin.VOCAB;
if (!VOCAB || !Array.isArray(VOCAB.words)) throw new Error("vocab-data.js 解析失败");
const ewWin = loadWithWindowStub(new URL("../assets/english-words.js", import.meta.url).pathname);
const candidatesOf = ewWin.EnglishWords._test.candidates;
if (typeof candidatesOf !== "function") throw new Error("english-words.js _test.candidates 不可用");

const vocabSet = new Set(VOCAB.words.map((e) => String(e.w).toLowerCase()));

/* ---------- 真题词频（可选） ---------- */
let freqTokens = new Map(); // token -> count
if (WORDFREQ_JSON) {
  const arr = JSON.parse(readFileSync(WORDFREQ_JSON, "utf8"));
  for (const r of arr) if (r && r.word) freqTokens.set(String(r.word).toLowerCase(), r.count || 0);
}
/* ---------- 题库原文直抽（选词口径 ⑥，兜底全量真题词） ----------
 * 审计词频表覆盖不全，改为直接从题库源文件的英文文本字段抽 token：
 * 切词正则与 assets/english-words.js 的 WORD_RE 一致（点词实际能点到的词），
 * 归一化与 candidates 入口一致（小写、’→'、去尾 '）。steps 是中文解析不抽。 */
const BANK_WORD_RE = /[A-Za-z]+(?:['’][A-Za-z]+)?/g;
function normalizeToken(t) {
  return String(t).toLowerCase().replace(/’/g, "'").replace(/'+$/, "");
}
const bankTokens = new Map(); // token -> count
{
  const bankDir = new URL("../src/bank/", import.meta.url).pathname;
  if (existsSync(bankDir)) {
    const files = readdirSync(bankDir).filter((f) => /^imported-eng2?-\d{4}\.json$/.test(f));
    let nItems = 0;
    for (const f of files) {
      const data = JSON.parse(readFileSync(bankDir + f, "utf8"));
      for (const it of data.items || []) {
        nItems++;
        for (const key of ["text", "passage", "options", "answer"]) {
          const v = it[key];
          if (typeof v !== "string") continue;
          for (const m of v.matchAll(BANK_WORD_RE)) {
            const tok = normalizeToken(m[0]);
            if (tok) bankTokens.set(tok, (bankTokens.get(tok) || 0) + 1);
          }
        }
      }
    }
    console.log(`题库原文直抽: ${files.length} 个文件 / ${nItems} 题 / ${bankTokens.size} 个 token`);
  } else {
    console.log("题库原文直抽: 未找到 src/bank，跳过口径 ⑥");
  }
}
const bankSet = new Set(bankTokens.keys());
// 与审计词频表合并计数：②⑥ 共用同一套选词、lemmaFreq、forms 口径
for (const [t, n] of bankTokens) freqTokens.set(t, (freqTokens.get(t) || 0) + n);

const tokenSet = new Set(freqTokens.keys());
const lemmaCandSet = new Set();
for (const t of tokenSet) for (const c of candidatesOf(t)) lemmaCandSet.add(c);
// 原形 -> 真题词族频次（token 自身命中优先，其次汇总可还原到它的 token）
const lemmaFreq = new Map();
for (const [t, n] of freqTokens) {
  const cs = candidatesOf(t);
  const hit = cs.find((c) => vocabSet.has(c)) || cs[0];
  if (hit) lemmaFreq.set(hit, (lemmaFreq.get(hit) || 0) + n);
}

/* ---------- 流式解析 ECDICT CSV（处理引号/逗号/字段内换行） ---------- */
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQ = false;
      } else field += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); field = ""; rows.push(row); row = []; }
    else if (ch !== "\r") field += ch;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

console.log("读取 ECDICT:", ECDICT_CSV);
const rows = parseCSV(readFileSync(ECDICT_CSV, "utf8"));
const header = rows[0];
const COL = {};
header.forEach((h, i) => (COL[h.trim()] = i));
console.log("ECDICT 总词条:", rows.length - 1);

/* ---------- 第一遍：选词 ---------- */
const TAG_LEVEL = [
  ["ky", "考研"], ["toefl", "托福"], ["ielts", "雅思"], ["gre", "GRE"],
  ["cet6", "六级"], ["cet4", "四级"], ["gk", "高考"], ["zk", "中考"]
];
function levelOf(tag) {
  const tags = String(tag || "").split(/\s+/);
  for (const [k, label] of TAG_LEVEL) if (tags.includes(k)) return label;
  return "";
}
function parseExchange(x) {
  const out = {};
  for (const part of String(x || "").split("/")) {
    const i = part.indexOf(":");
    if (i > 0) out[part.slice(0, i)] = part.slice(i + 1);
  }
  return out;
}

const selected = new Set();
const forms = {}; // 变形 -> 原形（仅真题出现过的变形）
let nVocab = 0, nFreq = 0, nKy = 0, nOx = 0, nCommon = 0, nBank = 0;
for (let r = 1; r < rows.length; r++) {
  const row = rows[r];
  if (row.length < 11) continue;
  const word = String(row[COL.word] || "").trim().toLowerCase();
  if (!word) continue;
  const tag = row[COL.tag] || "";
  const isVocab = vocabSet.has(word);
  const isBank = bankSet.has(word);
  const isFreq = tokenSet.has(word) || lemmaCandSet.has(word);
  const isKy = String(tag).split(/\s+/).includes("ky");
  const isOx = String(row[COL.oxford] || "").trim() === "1";
  const frq = parseInt(row[COL.frq], 10) || 0;
  const isCommon = frq > 0 && frq <= 12000;
  if (isVocab) nVocab++;
  if (isBank) nBank++;
  if (isFreq) nFreq++;
  if (isKy) nKy++;
  if (isOx) nOx++;
  if (isCommon) nCommon++;
  if (isVocab || isFreq || isKy || isOx || isCommon) selected.add(word);
  // 变形词条：ECDICT 用 exchange 的 0: 标注原形
  if (tokenSet.has(word)) {
    const ex = parseExchange(row[COL.exchange]);
    if (ex["0"] && ex["0"].toLowerCase() !== word) forms[word] = ex["0"].toLowerCase();
  }
}
// forms 指向的原形必须在选中集合内（或大纲内），否则补选
for (const f of Object.values(forms)) if (!selected.has(f) && !vocabSet.has(f)) selected.add(f);
console.log(`选词命中计数（有重叠）: 大纲 ${nVocab} / 真题 ${nFreq}（其中题库直抽 ${nBank}） / 考研tag ${nKy} / 牛津核心 ${nOx} / 常见词frq前12000 ${nCommon}`);
console.log("并集词条数:", selected.size, " 变形映射:", Object.keys(forms).length);

/* ---------- 第二遍：组装补全数据 ---------- */
function cleanPhonetic(p) {
  return String(p || "").trim().replace(/^\.+/, "").trim();
}
function cleanTranslation(t) {
  let s = String(t || "").replace(/\\n/g, "\n");
  // [网络] 网络释义噪声大：有正式释义时整段去掉；若全条只有网络释义
  // （如 Brexit、professionalisation），则保留其内容、仅剥掉 [网络] 前缀，
  // 否则这类词会因释义清空被误杀。学科标注如 [医] [有化] 保留。
  const lines = s.split("\n");
  const nonWeb = lines.filter((line) => !/^\s*\[网络\]/.test(line));
  if (nonWeb.join("").trim()) {
    s = nonWeb.join("\n").replace(/\s*\[网络\][^\n]*/g, "");
  } else {
    s = lines.map((line) => line.replace(/^\s*\[网络\]\s*/, "")).join("\n");
  }
  s = s.replace(/\n{2,}/g, "\n").trim();
  if (s.length > 300) {
    let cut = s.slice(0, 300);
    const b = Math.max(cut.lastIndexOf("\n"), cut.lastIndexOf("；"));
    if (b > 120) cut = cut.slice(0, b);
    s = cut.trim();
  }
  return s;
}
function cleanDefinition(d) {
  let s = String(d || "").replace(/\\n/g, "\n").split("\n")[0].trim();
  if (s.length > 160) s = s.slice(0, 160).trim();
  return s;
}

const W = {};
let emitted = 0, vocabCovered = 0;
for (let r = 1; r < rows.length; r++) {
  const row = rows[r];
  if (row.length < 11) continue;
  const word = String(row[COL.word] || "").trim().toLowerCase();
  if (!word || !selected.has(word) || W[word]) continue;
  // 只收单次词元字符集内的词（短语/含空格条目对逐词点查无用，省体积）
  if (!/^[a-z][a-z'\-]*$/.test(word) && !vocabSet.has(word)) continue;
  const trans = cleanTranslation(row[COL.translation]);
  const phon = cleanPhonetic(row[COL.phonetic]);
  if (!trans && !phon) continue;
  const def = cleanDefinition(row[COL.definition]);
  const ex = String(row[COL.exchange] || "").trim();
  const arr = [phon, trans, def, ex];
  if (!vocabSet.has(word)) {
    // 词典独有词条才需要频次与考试等级标注；大纲词条以 vocab-data 为准
    const f = lemmaFreq.get(word) || freqTokens.get(word) || 0;
    const lv = levelOf(row[COL.tag]);
    arr.push(f || "", lv);
  }
  while (arr.length && (arr[arr.length - 1] === "" || arr[arr.length - 1] === 0)) arr.pop();
  W[word] = arr;
  emitted++;
  if (vocabSet.has(word)) vocabCovered++;
}
console.log(`大纲词条被 ECDICT 覆盖: ${vocabCovered} / ${vocabSet.size}`);
console.log("最终补全词条数:", emitted);

/* ---------- 输出 ---------- */
const out = {
  meta: {
    count: emitted,
    source: "ECDICT 开源英汉词典（github.com/skywind3000/ECDICT）",
    license: "MIT",
    note: "开源英汉词典数据（音标/释义/词形/考研标注），非牛津词典原版数据；牛津核心仅指 ECDICT 的 oxford 标记口径",
    built: "2026-11-18",
    fields: "w[word]=[音标, 中文释义, 英文释义, 词形exchange, 真题频次(仅词典独有词), 考试等级(仅词典独有词)]"
  },
  w: W,
  f: forms
};
const headerComment =
  "/* 点词查义词典补全数据：由 scripts/build-dict.mjs 从 ECDICT（MIT 开源英汉词典）生成，勿手改。\n" +
  " * 与 assets/vocab-data.js 配合：大纲词条的等级/频次/例句以 vocab-data 为准，本文件补音标、完整释义、英文释义、词形，并新增考研/真题/牛津核心词条。 */\n";
const js = headerComment + "window.DICTDB=" + JSON.stringify(out) + ";\n";
const outPath = new URL("../assets/dict-data.js", import.meta.url).pathname;
writeFileSync(outPath, js);
console.log("已写出:", outPath, (Buffer.byteLength(js) / 1024).toFixed(0) + " KB");
