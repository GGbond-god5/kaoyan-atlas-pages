/* 点词查义单测（纯 Node，无需浏览器）：
 * 用 vm 桩加载真实 assets/english-words.js + vocab-data.js + dict-data.js，
 * 验证合并口径、三级查词（规则还原 → ECDICT 变形映射 → 派生剥离词根）与指定用例。
 * 运行：node tests/dict-lookup.mjs */
import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const sandbox = { window: {}, document: { addEventListener() {} }, console };
vm.createContext(sandbox);
function load(file) {
  vm.runInContext(readFileSync(new URL("../" + file, import.meta.url), "utf8"), sandbox, { filename: file });
}
load("assets/vocab-data.js");
load("assets/dict-data.js");
load("assets/english-words.js");
const W = sandbox.window;
const T = W.EnglishWords._test;
const VOCAB = W.VOCAB, DICTDB = W.DICTDB;
assert.ok(VOCAB && Array.isArray(VOCAB.words), "vocab-data 加载失败");
assert.ok(DICTDB && DICTDB.w, "dict-data 加载失败");

const { dict, forms } = T.mergeDicts(VOCAB.words, DICTDB);
const total = Object.keys(dict).length;
console.log("合并后词条总数:", total, " 变形映射:", Object.keys(forms).length);
assert.ok(total >= 15000, "合并词条数应 ≥15000（含大纲 5529）");

// 大纲词条不丢失、骨架字段不被覆盖：以 abandon 为例
const ab = dict["abandon"];
assert.ok(ab, "abandon 应在合并词典中");
const abRaw = VOCAB.words.find((e) => e.w === "abandon");
assert.equal(ab.m, abRaw.m, "大纲简释 m 不应被覆盖");
assert.equal(ab.e, abRaw.e, "大纲等级 e 不应被覆盖");
assert.ok(ab.p && ab.p.includes("bænd"), "abandon 应补上音标");
assert.ok(ab.dm && ab.dm.length > ab.m.length, "abandon 应补上更完整的 ECDICT 释义");
assert.ok(ab.x && ab.x.includes("abandoned"), "abandon 应补上词形 exchange");

// 指定用例：neurological 必须有音标 + 中文释义（站长实测缺口，英语一 2020 完形）
const neuro = T.lookupFull("neurological", dict, forms);
assert.ok(neuro, "neurological 必须命中");
assert.ok(neuro.entry.p, "neurological 必须有音标");
assert.ok((neuro.entry.dm || neuro.entry.m).includes("神经"), "neurological 必须有中文释义");
console.log("neurological:", neuro.entry.p, "|", neuro.entry.dm || neuro.entry.m);

// 词典独有词条：neurology 带考研标注
const neurology = dict["neurology"];
assert.ok(neurology && neurology.tag === "考研", "neurology 应为词典独有词条且标注考研");
assert.ok(neurology.p, "neurology 应有音标");

// 规则还原与不规则表（既有逻辑不回归）
assert.equal(T.lookupFull("went", dict, forms).lemma, "go");
assert.equal(T.lookupFull("children", dict, forms).lemma, "child");
assert.equal(T.lookupFull("studies", dict, forms).lemma, "study");
assert.equal(T.lookupFull("stopped", dict, forms).lemma, "stop");
assert.equal(T.lookupFull("teeth", dict, forms).lemma, "tooth");
// better 本身是大纲词条（A2），旧行为即命中自身，不跳 good
assert.equal(T.lookupFull("better", dict, forms).lemma, "better");

// neurologically 由既有 -ly 规则还原到 neurological（已收录，带音标），不走兜底
const adv = T.lookupFull("neurologically", dict, forms);
assert.ok(adv && adv.lemma === "neurological" && adv.entry.p, "neurologically 应命中 neurological");
// 派生剥离兜底：mindfulness 规则还原落空时回退词根 mindful 并标注 root
const viaRoot = T.lookupFull("mindfulness", dict, forms);
assert.ok(viaRoot && viaRoot.root === true, "mindfulness 应走派生剥离兜底");
assert.equal(viaRoot.lemma, "mindful");
assert.ok(T.deriveRoots("neurologically").includes("neurology"));
assert.ok(T.deriveRoots("globalization").includes("globalize"));
assert.ok(T.deriveRoots("globalisation").includes("globalise"));
// 只有网络释义的词不能被清洗误杀（ECDICT 中 Brexit 仅 [网络] 段）
const brexit = T.lookupFull("brexit", dict, forms);
assert.ok(brexit && (brexit.entry.dm || brexit.entry.m).includes("英国退出欧盟"), "brexit 应命中且有中文释义");

// 词形文本
assert.ok(T.formsText("p:went/d:gone/i:going").includes("过去式 went"));
assert.equal(T.formsText(""), "");

// 真题长尾学术词抽测（来自 eng-wordfreq 低频段，应命中）
for (const w of ["postgraduates", "groundless", "childless", "worthless", "skeptical"]) {
  const hit = T.lookupFull(w, dict, forms);
  assert.ok(hit, "长尾词应命中: " + w);
  console.log("长尾命中:", w, "→", hit.lemma, hit.root ? "(词根)" : "");
}

console.log("dict-lookup: 全部断言通过");
