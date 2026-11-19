/* 学情分析学科定制配置（站长铁律，2026-11-18）：学情分析的聚合口径、能力雷达维度、
* AI 教学分析侧重点与详情专属栏目一律按学科分别定义，严禁跨学科串扰
*（数学里出现作文指导、力学里出现政治分析这类错误零容忍）。
*
* 取数口径：
* - 雷达六维是「内容维度」（数学按章组、英语按题型、政治按板块、807 按力学模块），
* 每道已批改题归入一维、以整题得分计入；归入顺序：批改维度评分中可映射的键
* （dimKeys，目前仅 807 的「受力分析与平衡方程」）→ 题型（kinds）→ 章节（chapters/titles）。
* - 批改 rubric 的能力维度评分（数学的概念/方法/计算、英语的定位/推理等）是另一套
* 过程指标，仍在逐题详情的「维度评分」里展示，不混入内容雷达。
* - 政治真题没有独立的板块标签字段、kp 为空：雷达按 topicChapter 章节归入板块，
* 主观题按题型单列一维，不使用考点数据（见 politics 的 radarNote）。
* - 807 真题 kp 为空：雷达按章节模块归组，「受力分析」维优先取批改维度评分，
* 不假装有考点级数据（见 mechanics 的 radarNote）。
* 本文件只提供配置与纯函数，不碰 DOM；供 analytics.js / assessment.js / app.js 共用。
* 没有配置的科目一律回退调用方原逻辑，不得借用其他科目的维度。 */
(function () {
'use strict';

var ENGLISH = {
groupBy: 'kind',
groupTitle: '薄弱题型',
radarNote: '雷达按题型取数：每道已批改题按题型归入六维，以整题得分率计入；批改的能力维度评分（定位与理解、推理与排除等）仍在逐题详情中展示，不混入本雷达。',
aiFocus: '侧重点：按题型（完形、阅读理解、新题型、翻译、小作文、大作文）归组丢分；阅读与完形错因优先看原文定位、推理排除与长难句，翻译按意群切分与句法处理看，作文结合语法纠错与句子提升看；复盘动作落到具体题号、原文段落与生词回炉。',
columns: ['作文提升指导', '参考译文', '修改稿', '语法与表达', '句子升级', '语法纠错', '句子提升'],
radar: [
{ name: '完形', short: '完形', kinds: ['完形', '完形填空'], chapters: ['english-02'], titles: ['完形填空']},
{ name: '阅读理解', short: '阅读', kinds: ['阅读', '阅读理解'], chapters: ['english-03'], titles: ['阅读理解 Part A', '阅读理解']},
{ name: '新题型', short: '新题型', kinds: ['新题型'], chapters: ['english-04'], titles: ['新题型 Part B', '新题型']},
{ name: '翻译', short: '翻译', kinds: ['翻译'], chapters: ['english-05'], titles: ['翻译 Part C', '翻译'], dimKeys: ['意群理解', '句法处理', '词义准确', '表达通顺']},
{ name: '小作文', short: '小作文', kinds: ['小作文'], chapters: ['english-06'], titles: ['小作文']},
{ name: '大作文', short: '大作文', kinds: ['大作文'], chapters: ['english-07'], titles: ['大作文']}
]
};

var CONFIG = {
math: {
name: '数学一',
groupBy: 'chapter',
groupTitle: '薄弱知识点（按章组归并）',
radarNote: '雷达按内容章组取数：每道已批改题按其章节归入六个模块，以整题得分率计入；批改的能力维度评分（概念、方法、计算等）仍在逐题详情中展示，不混入本雷达。向量代数与空间解析几何（math-04）归入多元微积分。',
aiFocus: '侧重点：按考点章组归组丢分，错因优先从概念不清、方法不会、计算失误、审题偏差、步骤不规范五类里定位，只说数据能支撑的类别；复盘动作落到具体题号、关键步骤的默写与重算，以及同考点变式题。',
columns: [],
radar: [
{ name: '极限与连续', short: '极限', chapters: ['math-01'], titles: ['函数、极限与连续']},
{ name: '一元微积分', short: '一元', chapters: ['math-02', 'math-03'], titles: ['一元函数微分学', '一元函数积分学']},
{ name: '多元微积分', short: '多元', chapters: ['math-05', 'math-06', 'math-04'], titles: ['多元函数微分学', '多元函数积分学', '向量代数与空间解析几何']},
{ name: '级数与微分方程', short: '级数', chapters: ['math-07', 'math-08'], titles: ['无穷级数', '常微分方程']},
{ name: '线性代数', short: '线代', chapters: ['math-09', 'math-10', 'math-11', 'math-12', 'math-13'], titles: ['行列式', '矩阵及其运算', '向量组与线性方程组', '特征值与特征向量', '二次型']},
{ name: '概率统计', short: '概率', chapters: ['math-14', 'math-15', 'math-16', 'math-17', 'math-18', 'math-19', 'math-20'], titles: ['随机事件与概率', '一维随机变量及其分布', '多维随机变量及其分布', '随机变量的数字特征', '大数定律与中心极限定理', '数理统计基本概念与抽样分布', '参数估计与假设检验']}
]
},
math2: {
name: '数学二',
groupBy: 'chapter',
groupTitle: '薄弱知识点（按章组归并）',
radarNote: '雷达按内容章组取数：每道已批改题按其章节归入六个模块，以整题得分率计入；数学二不考无穷级数与概率统计，故无此两维，微分方程单列一维。向量代数与空间解析几何（math-04）归入多元微积分；批改的能力维度评分仍在逐题详情中展示，不混入本雷达。',
aiFocus: '侧重点：按考点章组归组丢分，错因优先从概念不清、方法不会、计算失误、审题偏差、步骤不规范五类里定位，只说数据能支撑的类别；复盘动作落到具体题号、关键步骤的默写与重算。数学二不考无穷级数与概率统计，分析中不得出现这两块内容。',
columns: [],
radar: [
{ name: '极限与连续', short: '极限', chapters: ['math-01'], titles: ['函数、极限与连续']},
{ name: '一元微分', short: '微分', chapters: ['math-02'], titles: ['一元函数微分学']},
{ name: '一元积分', short: '积分', chapters: ['math-03'], titles: ['一元函数积分学']},
{ name: '多元微积分', short: '多元', chapters: ['math-05', 'math-06', 'math-04'], titles: ['多元函数微分学', '多元函数积分学', '向量代数与空间解析几何']},
{ name: '微分方程', short: '方程', chapters: ['math-08'], titles: ['常微分方程']},
{ name: '线性代数', short: '线代', chapters: ['math-09', 'math-10', 'math-11', 'math-12', 'math-13'], titles: ['行列式', '矩阵及其运算', '向量组与线性方程组', '特征值与特征向量', '二次型']}
]
},
math3: {
name: '数学三',
groupBy: 'chapter',
groupTitle: '薄弱知识点（按章组归并）',
radarNote: '雷达按内容章组取数：每道已批改题按其章节归入六个模块，以整题得分率计入；批改的能力维度评分（概念、方法、计算等）仍在逐题详情中展示，不混入本雷达。数学三不考向量代数与空间解析几何、三重积分与曲线曲面积分，多元微积分只含 math-05、math-06 中的二重积分部分。',
aiFocus: '侧重点：按考点章组归组丢分，错因优先从概念不清、方法不会、计算失误、审题偏差、步骤不规范五类里定位，只说数据能支撑的类别；复盘动作落到具体题号、关键步骤的默写与重算，以及同考点变式题。数学三不考空间解析几何、三重积分、曲线曲面积分与傅里叶级数，分析中不得出现这些内容。',
columns: [],
radar: [
{ name: '极限与连续', short: '极限', chapters: ['math-01'], titles: ['函数、极限与连续']},
{ name: '一元微积分', short: '一元', chapters: ['math-02', 'math-03'], titles: ['一元函数微分学', '一元函数积分学']},
{ name: '多元微积分', short: '多元', chapters: ['math-05', 'math-06'], titles: ['多元函数微分学', '多元函数积分学']},
{ name: '级数与微分方程', short: '级数', chapters: ['math-07', 'math-08'], titles: ['无穷级数', '常微分方程']},
{ name: '线性代数', short: '线代', chapters: ['math-09', 'math-10', 'math-11', 'math-12', 'math-13'], titles: ['行列式', '矩阵及其运算', '向量组与线性方程组', '特征值与特征向量', '二次型']},
{ name: '概率统计', short: '概率', chapters: ['math-14', 'math-15', 'math-16', 'math-17', 'math-18', 'math-19', 'math-20'], titles: ['随机事件与概率', '一维随机变量及其分布', '多维随机变量及其分布', '随机变量的数字特征', '大数定律与中心极限定理', '数理统计基本概念与抽样分布', '参数估计与假设检验']}
]
},
english: Object.assign({ name: '英语一'}, ENGLISH),
english2: Object.assign({ name: '英语二'}, ENGLISH),
politics: {
name: '政治',
groupBy: 'chapter',
groupTitle: '薄弱板块',
radarNote: '政治真题没有独立的板块标签字段、kp 考点为空：雷达按题目的章节归属归入五大板块，主观题按题型单列一维，不使用考点数据。批改的能力维度评分（知识点定位、采分点覆盖、材料结合等）仍在逐题详情中展示，不混入本雷达。',
aiFocus: '侧重点：按板块（马原、毛中特、史纲、思修法基、形策当代）归组丢分；单选题重知识点定位，多选题重概念辨析与常见陷阱，主观题重采分点覆盖、材料结合与条理；复盘动作落到具体题号与对应知识点，先补成组丢分的板块。',
columns: [],
radar: [
{ name: '马原', short: '马原', chapters: ['pol-01', 'pol-02'], titles: ['马克思主义基本原理（哲学）', '马克思主义政治经济学与科学社会主义']},
{ name: '毛中特', short: '毛中特', chapters: ['pol-03', 'pol-04'], titles: ['毛泽东思想和中国特色社会主义理论体系', '习近平新时代中国特色社会主义思想']},
{ name: '史纲', short: '史纲', chapters: ['pol-05'], titles: ['中国近现代史纲要']},
{ name: '思修法基', short: '思修', chapters: ['pol-06'], titles: ['思想道德与法治']},
{ name: '形策当代', short: '形策', chapters: ['pol-07'], titles: ['形势与政策及当代世界经济与政治']},
{ name: '主观题', short: '主观题', kinds: ['分析题', '材料分析题', '论述题', '简答题', '辨析题']}
]
},
mechanics: {
name: '807 材料力学',
groupBy: 'chapter',
groupTitle: '薄弱模块',
radarNote: '807 真题 kp 考点为空：雷达按章节模块归组取数，「受力分析」一维优先取批改维度评分中的「受力分析与平衡方程」，不假装有考点级数据。平面图形的几何性质归入弯曲，动载荷与冲击归入压杆稳定与能量法，电测应力分析归入应力状态与强度理论，提高与拓展章（mech-15）不计入雷达。',
aiFocus: '侧重点：按力学模块（受力分析、拉压与扭转、弯曲、应力状态与强度理论、组合变形、压杆稳定与能量法）归组丢分；错因优先看研究对象与受力图、平衡方程与变形协调、公式适用条件、单位与量级；复盘动作落到具体题号与建模步骤，先画图再列方程。',
columns: [],
radar: [
{ name: '受力分析', short: '受力', chapters: ['mech-01'], titles: ['绪论与力学简图'], dimKeys: ['受力分析与平衡方程']},
{ name: '拉压与扭转', short: '拉压扭转', chapters: ['mech-02', 'mech-03', 'mech-13'], titles: ['轴向拉压', '扭转', '连接件的剪切与挤压']},
{ name: '弯曲', short: '弯曲', chapters: ['mech-04', 'mech-05', 'mech-06', 'mech-12'], titles: ['弯曲内力', '弯曲应力', '弯曲变形', '平面图形的几何性质']},
{ name: '应力状态与强度理论', short: '应力状态', chapters: ['mech-07', 'mech-14'], titles: ['应力状态与强度理论', '电测应力分析与实验']},
{ name: '组合变形', short: '组合', chapters: ['mech-08'], titles: ['组合变形']},
{ name: '压杆稳定与能量法', short: '压杆能量', chapters: ['mech-09', 'mech-10', 'mech-11'], titles: ['压杆稳定', '能量法', '动载荷与冲击']}
]
}
};

function config(subject) { return CONFIG[subject] || null;}

/* 维度查找表（按科目缓存）：kind/chapter/title/dimKey → 维度名 */
var lookups = {};
function lookup(subject) {
if (lookups[subject]) return lookups[subject];
var cfg = CONFIG[subject];
var lk = { kind: {}, chapter: {}, title: {}, dimKey: {}};
if (cfg) cfg.radar.forEach(function (d) {
(d.kinds || []).forEach(function (k) { lk.kind[k] = d.name;});
(d.chapters || []).forEach(function (c) { lk.chapter[c] = d.name;});
(d.titles || []).forEach(function (t) { lk.title[t] = d.name;});
(d.dimKeys || []).forEach(function (k) { lk.dimKey[k] = d.name;});
});
lookups[subject] = lk;
return lk;
}

/* 一道题归入哪个雷达维度：题型优先（英语按题型、政治主观题单列），其次章节/章节名。
* 批改维度评分的 dimKeys 映射由调用方先行处理（见 assessment.js），这里不碰 result。 */
function radarDimFor(subject, q) {
var cfg = CONFIG[subject];
if (!cfg ||!q) return '';
var lk = lookup(subject);
if (q.kind && lk.kind[q.kind]) return lk.kind[q.kind];
if (q.topicChapter && lk.chapter[q.topicChapter]) return lk.chapter[q.topicChapter];
if (q.topicTitle && lk.title[q.topicTitle]) return lk.title[q.topicTitle];
if (q.chapterTitle && lk.title[q.chapterTitle]) return lk.title[q.chapterTitle];
return '';
}

function dimKeyMap(subject) { return lookup(subject).dimKey;}

/* 薄弱归组：按本科目 groupBy 口径把题归组，返回 {key,label,chapter,kp}；归不进的返回 null（调用方回退原逻辑）。
* chapter 口径（数学/政治/807）：按章节归入维度（章组/板块/模块），政治主观题在归组时仍按板块算，不进「主观题」维。
* kind 口径（英语）：按题型归入维度。 */
function groupOf(subject, q) {
var cfg = CONFIG[subject];
if (!cfg ||!q) return null;
var lk = lookup(subject);
var dim = '';
if (cfg.groupBy === 'kind') {
dim = (q.kind && lk.kind[q.kind]) || (q.topicChapter && lk.chapter[q.topicChapter]) || (q.topicTitle && lk.title[q.topicTitle]) || '';
} else {
dim = (q.topicChapter && lk.chapter[q.topicChapter]) || (q.topicTitle && lk.title[q.topicTitle]) || '';
}
if (!dim) return null;
return { key: dim, label: dim, chapter: q.topicChapter || '', kp: q.kp || ''};
}

function aiFocus(subject) {
var cfg = CONFIG[subject];
return cfg? cfg.aiFocus: '';
}

/* 学科隔离硬性守卫句：措辞不点名其他科目的题型/栏目/概念（避免守卫句本身串科）。 */
function guardLine(subject) {
var cfg = CONFIG[subject];
if (!cfg) return '';
return '【学科隔离】本次只分析「' + cfg.name + '」一科：只能使用本科目的题型、分组口径与概念，只能谈本科目允许出现的栏目；其他任何科目的题型、栏目与概念一律不得提及、不得类比、不得套用。';
}

/* 详情专属栏目白名单：只有配置里列出的专属栏目才允许在该科详情出现；
* 通用栏目（得分点、维度评分、总评、缺失要点、改进建议、订正要点、参考答案、解析）不在白名单管辖内。 */
function columnAllowed(subject, col) {
var cfg = CONFIG[subject];
return!!cfg && cfg.columns.indexOf(col) >= 0;
}

window.SUBJECT_ANALYTICS = CONFIG;
window.AtlasSubjectAnalytics = {
config: config,
radarDimFor: radarDimFor,
dimKeyMap: dimKeyMap,
groupOf: groupOf,
aiFocus: aiFocus,
guardLine: guardLine,
columnAllowed: columnAllowed
};
})();
