// 题目分值分配：卷面标注优先，没有标注时按科目与题型排分。
// 套卷会尝试把整卷配到官方总分（数学/专业课 150，英语/政治 100）。
// allocatePaper 保持原有“返回分数数组”的契约；allocatePaperDetailed 供后端校验使用。

const TOTALS = { math: 150, math2: 150, math3: 150, mechanics: 150, english: 100, english2: 100, politics: 100 };
const PAPER_MODES = new Set(["paper", "diagnostic", "mock"]);

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
  const weights = items.map((x) => x.weight);
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
      if (next !== values[i]) {
        values[i] = next;
        diff = roundScore(diff - delta, step);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return values;
}

/**
 * 分配分值并返回诊断信息。issues[].fatal=true 时调用方应拒绝保存该卷。
 * 返回的 scores 与 questions 等长，保持旧接口可直接使用。
 */
export function allocatePaperDetailed(subject, questions, mode) {
  const list = Array.isArray(questions) ? questions : [];
  const total = TOTALS[subject] || null;
  const isPaper = PAPER_MODES.has(mode);
  const scores = list.map((q) => explicit(q));
  const missing = list.map((q, i) => scores[i] == null ? i : -1).filter((i) => i >= 0);
  const issues = [];

  if (!missing.length) {
    for (let i = 0; i < scores.length; i++) {
      if (scores[i] == null) scores[i] = questionScore(subject, list[i] && list[i].kind);
    }
    return finish(scores, subject, list, total, isPaper, missing, issues);
  }

  const table = STANDARD[subject] || STANDARD.math;
  for (const i of missing) {
    scores[i] = table[list[i].kind] != null
      ? table[list[i].kind]
      : (OBJECTIVE.has(list[i].kind) ? 2 : 10);
  }

  if (!isPaper || !total) {
    return finish(scores, subject, list, total, isPaper, missing, issues);
  }

  const fixed = scores.reduce((sum, s, i) => sum + (missing.includes(i) ? 0 : s), 0);
  if (fixed > total + 0.001) {
    issues.push({
      code: "explicit_scores_exceed_total",
      fatal: true,
      message: `卷面已标注分值合计 ${fixed} 分，超过该科目总分 ${total} 分`,
    });
    return finish(scores, subject, list, total, isPaper, missing, issues);
  }

  const target = roundScore(total - fixed);
  if (target <= 0) return finish(scores, subject, list, total, isPaper, missing, issues);

  if (subject === "mechanics") {
    const items = missing.map((i) => ({ index: i, weight: difficultyWeight(list[i]) }));
    if (target >= 15 * items.length && target <= 25 * items.length) {
      const values = distribute(target, items, 15, 25, 1);
      items.forEach((x, k) => { scores[x.index] = values[k]; });
    } else {
      issues.push({ code: "mechanics_target_out_of_range", fatal: false, message: "材料力学剩余分值无法按 15–25 分/题配平" });
    }
    return finish(scores, subject, list, total, isPaper, missing, issues);
  }

  if (subject === "math" || subject === "math2" || subject === "math3") {
    const objective = missing.filter((i) => OBJECTIVE.has(list[i].kind));
    const subjective = missing.filter((i) => !OBJECTIVE.has(list[i].kind));
    const objectiveSum = objective.reduce((sum) => sum + 5, 0);
    const subTarget = roundScore(target - objectiveSum);
    const subHi = subjective.length <= 6 ? 15 : 12;
    if (subjective.length && subTarget >= 10 * subjective.length && subTarget <= subHi * subjective.length) {
      objective.forEach((i) => { scores[i] = 5; });
      const items = subjective.map((i) => ({ index: i, weight: difficultyWeight(list[i]) }));
      const values = distribute(subTarget, items, 10, subHi, 1);
      items.forEach((x, k) => { scores[x.index] = values[k]; });
    } else {
      issues.push({ code: "math_target_out_of_range", fatal: false, message: "数学剩余分值无法按选填 5 分、解答 10–15 分配平" });
    }
    return finish(scores, subject, list, total, isPaper, missing, issues);
  }

  // 英语、政治：按现行试卷结构逐题给分，整卷自然接近 100 分。
  return finish(scores, subject, list, total, isPaper, missing, issues);
}

function finish(scores, subject, questions, total, isPaper, missing, issues) {
  const assigned = scores.reduce((sum, n) => sum + (Number.isFinite(n) ? n : 0), 0);
  if (total && isPaper && assigned > total + 0.001) {
    if (!issues.some((issue) => issue.code === "explicit_scores_exceed_total")) {
      issues.push({
        code: "explicit_scores_exceed_total",
        fatal: true,
        message: `卷面分值合计 ${assigned} 分，超过该科目总分 ${total} 分`,
      });
    }
  } else if (total && isPaper && Math.abs(assigned - total) > 0.001) {
    issues.push({
      code: "paper_total_mismatch",
      fatal: false,
      message: `当前题型结构合计 ${assigned} 分，与科目总分 ${total} 分不一致`,
    });
  }
  return { scores: scores.slice(), subject, total, assigned, missing: missing.slice(), issues };
}

/** 兼容旧调用方：只返回与 questions 等长的分值数组。 */
export function allocatePaper(subject, questions, mode) {
  return allocatePaperDetailed(subject, questions, mode).scores;
}
