// 题目分值分配：卷面标注优先，没有标注时按科目与题型排分。
// 套卷会尝试把整卷配到官方总分（数学/专业课 150，英语/政治 100）。

const TOTALS = { math: 150, math2: 150, math3: 150, mechanics: 150, english: 100, english2: 100, politics: 100 };

const STANDARD = {
  math: { 选择题: 5, 单选题: 5, 多选题: 5, 填空题: 5, 计算题: 12, 证明题: 12, 简答题: 10, 概念题: 10 },
  math2: { 选择题: 5, 单选题: 5, 多选题: 5, 填空题: 5, 计算题: 12, 证明题: 12, 简答题: 10, 概念题: 10 },
  math3: { 选择题: 5, 单选题: 5, 多选题: 5, 填空题: 5, 计算题: 12, 证明题: 12, 简答题: 10, 概念题: 10 },
  mechanics: { 计算题: 20, 证明题: 20, 简答题: 15, 概念题: 15 },
  english: { 完形: 0.5, 阅读: 2, 新题型: 2, 翻译: 2, 小作文: 10, 大作文: 20, 词汇: 0.5, 句式: 5 },
  english2: { 完形: 0.5, 阅读: 2, 新题型: 2, 翻译: 3, 小作文: 10, 大作文: 15, 词汇: 0.5, 句式: 5 },
  politics: { 选择题: 1, 单选题: 1, 多选题: 2, 分析题: 10, 简答题: 10, 概念题: 10 },
};

const OBJECTIVE = new Set(["选择题", "单选题", "多选题", "填空题", "阅读", "完形", "新题型"]);

function roundScore(n, step = 0.5) {
  return Math.round(n / step) * step;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function explicit(q) {
  const n = Number(q && q.maxScore);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function difficultyWeight(q) {
  if (!q) return 1;
  if (q.difficulty === "易") return 0.85;
  if (q.difficulty === "难") return 1.2;
  return 1;
}

/** 单题默认分：用于按知识点刷题或单独评分 */
export function questionScore(subject, kind, difficulty) {
  if (subject === "mechanics") {
    if (difficulty === "易") return 15;
    if (difficulty === "难") return 25;
    return 20;
  }
  if (subject === "math" || subject === "math2" || subject === "math3") {
    if (!OBJECTIVE.has(kind)) return difficulty === "易" ? 10 : 12;
  }
  const table = STANDARD[subject] || STANDARD.math;
  if (table[kind] != null) return table[kind];
  return OBJECTIVE.has(kind) ? 2 : 10;
}

function distribute(target, items, lo, hi, step = 0.5) {
  // items: [{index, weight}]；按权重分配并把总和精确调到 target
  const weights = items.map(x => x.weight);
  const weightSum = weights.reduce((a, b) => a + b, 0) || items.length;
  const values = items.map((x, i) => roundScore(target * weights[i] / weightSum, step));
  for (let i = 0; i < values.length; i++) values[i] = clamp(values[i], lo, hi);
  let diff = roundScore(target - values.reduce((a, b) => a + b, 0), step);
  let guard = 0;
  while (Math.abs(diff) >= step / 2 && guard++ < 200) {
    const delta = diff > 0 ? step : -step;
    let changed = false;
    for (let i = 0; i < values.length && Math.abs(diff) >= step / 2; i++) {
      const next = clamp(values[i] + delta, lo, hi);
      if (next !== values[i]) { values[i] = next; diff = roundScore(diff - delta, step); changed = true; }
    }
    if (!changed) break;
  }
  return values;
}

/**
 * 给一份卷子分配每题分值，返回与 questions 等长的数组。
 * 卷面已有 maxScore 的一律保留；没有的按题型基准与整卷总分排布。
 */
export function allocatePaper(subject, questions, mode) {
  const list = Array.isArray(questions) ? questions : [];
  const total = TOTALS[subject] || null;
  const scores = list.map(q => explicit(q));
  const missing = list.map((q, i) => scores[i] == null ? i : -1).filter(i => i >= 0);
  if (!missing.length) return scores.map(s => s == null ? questionScore(subject, list[0] && list[0].kind) : s);

  const table = STANDARD[subject] || STANDARD.math;
  for (const i of missing) scores[i] = table[list[i].kind] != null ? table[list[i].kind] : (OBJECTIVE.has(list[i].kind) ? 2 : 10);

  const isPaper = mode === "paper" || mode === "diagnostic" || mode === "mock";
  if (!isPaper || !total) return scores;

  const fixed = scores.reduce((sum, s, i) => sum + (missing.includes(i) ? 0 : s), 0);
  const target = roundScore(total - fixed);
  if (target <= 0) return scores;

  if (subject === "mechanics") {
    const items = missing.map(i => ({ index: i, weight: difficultyWeight(list[i]) }));
    if (target >= 15 * items.length && target <= 25 * items.length) {
      const values = distribute(target, items, 15, 25, 1);
      items.forEach((x, k) => { scores[x.index] = values[k]; });
    }
    return scores;
  }

  if (subject === "math" || subject === "math2" || subject === "math3") {
    const objective = missing.filter(i => OBJECTIVE.has(list[i].kind));
    const subjective = missing.filter(i => !OBJECTIVE.has(list[i].kind));
    const objectiveSum = objective.reduce((sum, i) => sum + 5, 0);
    const subTarget = roundScore(target - objectiveSum);
    const subHi = subjective.length <= 6 ? 15 : 12; // 现行结构：解答题 6 题共 70 分，含 15 分题；题多时回到 10–12 区间
    if (subjective.length && subTarget >= 10 * subjective.length && subTarget <= subHi * subjective.length) {
      objective.forEach(i => { scores[i] = 5; });
      const items = subjective.map(i => ({ index: i, weight: difficultyWeight(list[i]) }));
      const values = distribute(subTarget, items, 10, subHi, 1);
      items.forEach((x, k) => { scores[x.index] = values[k]; });
    }
    return scores;
  }

  // 英语、政治：按现行试卷结构逐题给分，整卷自然接近 100 分
  return scores;
}
