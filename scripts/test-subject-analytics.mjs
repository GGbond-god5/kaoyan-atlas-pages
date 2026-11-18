// 学情分析学科隔离自检：node scripts/test-subject-analytics.mjs
// 断言：各科雷达维度与定版一致且集合互不相同；各科配置/专属指令/服务端学科指令不含他科标志词；
// 模拟 attempt 走归组与雷达取数时维度只属于本科目；专属栏目白名单只有英语放行。
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { ANALYSIS_SUBJECT_GUIDE } from "../functions/_lib/prompts.js";

const src = readFileSync(new URL("../assets/subject-analytics.js", import.meta.url), "utf8");
const sandbox = { window: {} };
vm.createContext(sandbox);
vm.runInContext(src, sandbox);
const SA = sandbox.window.AtlasSubjectAnalytics;
const CONFIG = sandbox.window.SUBJECT_ANALYTICS;
if (!SA || !CONFIG) { console.error("✗ subject-analytics.js 未导出配置"); process.exit(1); }

let failed = 0;
const ok = (cond, msg) => { if (cond) console.log("✓ " + msg); else { failed++; console.error("✗ " + msg); } };
const setEq = (a, b) => a.length === b.length && a.every(x => b.includes(x));

// 1) 维度定版：每科六维与定版集合完全一致
const EXPECTED = {
  math: ["极限与连续", "一元微积分", "多元微积分", "级数与微分方程", "线性代数", "概率统计"],
  math2: ["极限与连续", "一元微分", "一元积分", "多元微积分", "微分方程", "线性代数"],
  english: ["完形", "阅读理解", "新题型", "翻译", "小作文", "大作文"],
  english2: ["完形", "阅读理解", "新题型", "翻译", "小作文", "大作文"],
  politics: ["马原", "毛中特", "史纲", "思修法基", "形策当代", "主观题"],
  mechanics: ["受力分析", "拉压与扭转", "弯曲", "应力状态与强度理论", "组合变形", "压杆稳定与能量法"]
};
const SUBJECTS = Object.keys(EXPECTED);
for (const s of SUBJECTS) {
  const dims = (CONFIG[s] && CONFIG[s].radar || []).map(d => d.name);
  ok(dims.length === 6 && setEq(dims, EXPECTED[s]), `${s} 雷达六维与定版一致`);
}
// 2) 维度集合互不相同（任两科集合不相等；英一/英二题型体系相同是同一学科的两个卷种，维度同名属预期，单独校验其余组合）
for (let i = 0; i < SUBJECTS.length; i++) for (let j = i + 1; j < SUBJECTS.length; j++) {
  const a = SUBJECTS[i], b = SUBJECTS[j];
  if ((a === "english" && b === "english2")) continue;
  ok(!setEq(EXPECTED[a], EXPECTED[b]), `${a} 与 ${b} 维度集合不相同`);
}
ok(setEq(EXPECTED.english, EXPECTED.english2), "英语一/英语二同属英语学科，题型六维一致（卷种差异不串科）");

// 3) 串科词检查：配置 JSON + aiFocus + guardLine + 服务端学科指令
const FORBIDDEN = {
  math: ["作文", "翻译", "板块"],
  math2: ["作文", "翻译", "板块"],
  politics: ["作文", "积分", "应力"],
  mechanics: ["作文", "阅读", "史纲"],
  english: ["积分", "应力", "马原"],
  english2: ["积分", "应力", "马原"]
};
for (const s of SUBJECTS) {
  const text = JSON.stringify(CONFIG[s]) + SA.aiFocus(s) + SA.guardLine(s) + (ANALYSIS_SUBJECT_GUIDE[s] || "");
  ok(!!ANALYSIS_SUBJECT_GUIDE[s], `${s} 服务端学科指令存在`);
  for (const w of FORBIDDEN[s]) ok(!text.includes(w), `${s} 配置与提示词不含他科词「${w}」`);
  ok(SA.aiFocus(s).length > 0 && SA.guardLine(s).includes("学科隔离"), `${s} aiFocus 与隔离守卫齐备`);
}

// 4) 模拟 attempt：归组与雷达取数只出本科目维度
function checkAttempt(subject, questions, expectedDims) {
  const got = questions.map(q => SA.radarDimFor(subject, q));
  ok(got.every((d, i) => d === expectedDims[i] && EXPECTED[subject].includes(d)),
    `${subject} 模拟 attempt 雷达取数全属本科目：${got.join("、")}`);
  const groups = questions.map(q => SA.groupOf(subject, q)).filter(Boolean).map(g => g.label);
  ok(groups.every(g => EXPECTED[subject].includes(g)), `${subject} 薄弱归组全属本科目：${groups.join("、")}`);
}
checkAttempt("math", [
  { subject: "math", kind: "解答题", topicChapter: "math-07", topicTitle: "无穷级数" },
  { subject: "math", kind: "选择题", topicChapter: "math-12", topicTitle: "特征值与特征向量" },
  { subject: "math", kind: "填空题", topicChapter: "math-01", topicTitle: "函数、极限与连续" },
  { subject: "math", kind: "解答题", topicChapter: "math-17", topicTitle: "随机变量的数字特征" }
], ["级数与微分方程", "线性代数", "极限与连续", "概率统计"]);
checkAttempt("math2", [
  { subject: "math2", kind: "解答题", topicChapter: "math-08", topicTitle: "常微分方程" },
  { subject: "math2", kind: "填空题", topicChapter: "math-03", topicTitle: "一元函数积分学" }
], ["微分方程", "一元积分"]);
checkAttempt("english", [
  { subject: "english", kind: "阅读", topicChapter: "english-03" },
  { subject: "english", kind: "大作文", topicChapter: "english-07" },
  { subject: "english", kind: "翻译", topicChapter: "english-05" }
], ["阅读理解", "大作文", "翻译"]);
checkAttempt("politics", [
  { subject: "politics", kind: "分析题", topicChapter: "pol-01" },
  { subject: "politics", kind: "单选题", topicChapter: "pol-05" },
  { subject: "politics", kind: "多选题", topicChapter: "pol-03" }
], ["主观题", "史纲", "毛中特"]);
// 政治归组按板块：分析题归组进马原板块而不是「主观题」维
ok(SA.groupOf("politics", { subject: "politics", kind: "分析题", topicChapter: "pol-01" }).label === "马原", "政治分析题薄弱归组按板块（马原）");
checkAttempt("mechanics", [
  { subject: "mechanics", kind: "计算题", topicChapter: "mech-05", topicTitle: "弯曲应力" },
  { subject: "mechanics", kind: "计算题", topicChapter: "mech-09", topicTitle: "压杆稳定" }
], ["弯曲", "压杆稳定与能量法"]);
ok(SA.dimKeyMap("mechanics")["受力分析与平衡方程"] === "受力分析", "807 批改维度「受力分析与平衡方程」映射到受力分析维");
// 跨科题目喂给数学配置：归不进任何数学维度（回退原逻辑），绝不借用他科维度
ok(SA.radarDimFor("math", { subject: "english", kind: "大作文" }) === "", "英语作文题在数学配置下无维度（不串科）");
ok(SA.radarDimFor("mechanics", { subject: "politics", kind: "分析题", topicChapter: "pol-01" }) === "", "政治分析题在 807 配置下无维度（不串科）");

// 5) 专属栏目白名单：只有英语放行作文提升指导/参考译文
ok(SA.columnAllowed("english", "作文提升指导") && SA.columnAllowed("english2", "参考译文"), "英语放行作文提升指导/参考译文");
for (const s of ["math", "math2", "politics", "mechanics"]) {
  ok(!SA.columnAllowed(s, "作文提升指导") && !SA.columnAllowed(s, "参考译文"), `${s} 不放行英语专属栏目`);
}
ok(!SA.columnAllowed("unknown-subject", "作文提升指导") && !SA.config("unknown-subject"), "无配置科目回退且不放行专属栏目");

console.log(failed ? `\n自检未通过（${failed} 项）` : "\n学科隔离自检全部通过 ✓");
process.exit(failed ? 1 : 0);
