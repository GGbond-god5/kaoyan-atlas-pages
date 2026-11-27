// 学科隔离与特色能力注册表：各科批分口径与特色工具互不污染，公共能力统一复用
export const SUBJECT_PROFILES = Object.freeze({
  math: {
    family: 'math',
    totalScore: 150,
    objectiveKinds: ['选择题', '填空题'],
    strongTierKinds: ['解答题', '计算题', '证明题'],
    features: ['katex', 'stepGrading', 'mockPapers'],
    paperQuota: { 选择题: 10, 填空题: 6, 解答题: 6 },
    rubricHint: '选填每题 5 分；解答题按步给分（0.5 分步长），含高数/线代/概率。',
  },
  math2: {
    family: 'math',
    totalScore: 150,
    objectiveKinds: ['选择题', '填空题'],
    strongTierKinds: ['解答题', '计算题', '证明题'],
    features: ['katex', 'stepGrading', 'mockPapers'],
    paperQuota: { 选择题: 10, 填空题: 6, 解答题: 6 },
    rubricHint: '数二考纲（不含级数与概率）：选填 5 分，解答题按步给分（0.5 分步长）。',
  },
  math3: {
    family: 'math',
    totalScore: 150,
    objectiveKinds: ['选择题', '填空题'],
    strongTierKinds: ['解答题', '计算题', '证明题'],
    features: ['katex', 'stepGrading', 'mockPapers'],
    paperQuota: { 选择题: 10, 填空题: 6, 解答题: 6 },
    rubricHint: '数三考纲（含经济应用与差分方程）：选填 5 分，解答题按步给分（0.5 分步长）。',
  },
  mechanics: {
    family: 'mechanics',
    totalScore: 150,
    objectiveKinds: ['选择题', '填空题'],
    strongTierKinds: ['计算题', '证明题', '简答题'],
    features: ['katex', 'stepGrading', 'diagramSupport'],
    paperQuota: { 计算题: 6, 简答题: 2 },
    rubricHint: '807 材料力学：按平衡方程、变形协调、物理关系与单位量纲分步给分。',
  },
  english: {
    family: 'english',
    totalScore: 100,
    objectiveKinds: ['完形', '阅读', '新题型', '选择题'],
    strongTierKinds: ['大作文', '翻译'],
    features: ['vocab', 'wordLookup', 'essayRubric'],
    paperQuota: { 完形: 20, 阅读: 20, 新题型: 5, 翻译: 5, 小作文: 1, 大作文: 1 },
    rubricHint: '英一：完形 0.5 分/题、阅读与新题型 2 分/题、翻译 10 分、小作文 10 分、大作文 20 分。',
  },
  english2: {
    family: 'english',
    totalScore: 100,
    objectiveKinds: ['完形', '阅读', '新题型', '选择题'],
    strongTierKinds: ['大作文', '翻译'],
    features: ['vocab', 'wordLookup', 'essayRubric'],
    paperQuota: { 完形: 20, 阅读: 20, 新题型: 5, 翻译: 1, 小作文: 1, 大作文: 1 },
    rubricHint: '英二：完形 0.5 分/题、阅读与新题型 2 分/题、段落翻译 15 分、小作文 10 分、大作文 15 分。',
  },
  politics: {
    family: 'politics',
    totalScore: 100,
    objectiveKinds: ['单选题', '多选题', '选择题'],
    strongTierKinds: ['分析题', '材料分析题', '论述题'],
    features: ['timeline', 'strictMultiChoice', 'pointRubric'],
    paperQuota: { 单选题: 16, 多选题: 17, 分析题: 5 },
    rubricHint: '政治：单选 1 分/题，多选 2 分/题（全对才得分），分析题 10 分/题采点结合材料。',
  },
});

const DEFAULT_OBJECTIVE = new Set(['选择题', '单选题', '多选题', '阅读', '完形', '新题型']);
const DEFAULT_STRONG = new Set(['解答题', '证明题', '综合题', '计算题', '论述题', '材料分析题', '大作文']);

export function normalizeSubject(subject) {
  const s = String(subject || '').trim();
  return SUBJECT_PROFILES[s] ? s : '';
}

export function assertSubjectScope(expected, actual) {
  const e = normalizeSubject(expected);
  const a = normalizeSubject(actual);
  return Boolean(e && a && e === a);
}

export function getSubjectProfile(subject) {
  return SUBJECT_PROFILES[String(subject || '').trim()] || null;
}

export function isObjectiveKind(subject, kind) {
  const prof = getSubjectProfile(subject);
  if (prof) return prof.objectiveKinds.includes(kind);
  return DEFAULT_OBJECTIVE.has(kind);
}

export function selectGradeTier(subject, kind, maxScore) {
  const prof = getSubjectProfile(subject);
  if (prof) {
    if (prof.strongTierKinds.includes(kind) || (maxScore != null && maxScore >= 15)) return 'strong';
    if (prof.objectiveKinds.includes(kind)) return 'cheap';
    return 'mid';
  }
  if (DEFAULT_STRONG.has(kind) || (maxScore != null && maxScore >= 15)) return 'strong';
  if (DEFAULT_OBJECTIVE.has(kind)) return 'cheap';
  return 'mid';
}
