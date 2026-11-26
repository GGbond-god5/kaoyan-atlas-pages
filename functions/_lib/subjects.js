// 学科隔离与特色能力注册表：各科批分口径与特色工具互不污染，公共能力统一复用
export const SUBJECT_PROFILES = Object.freeze({
  math: {
    family: 'math',
    totalScore: 150,
    objectiveKinds: ['选择题', '填空题'],
    strongTierKinds: ['解答题', '计算题', '证明题'],
    features: ['katex', 'stepGrading', 'mockPapers'],
  },
  math2: {
    family: 'math',
    totalScore: 150,
    objectiveKinds: ['选择题', '填空题'],
    strongTierKinds: ['解答题', '计算题', '证明题'],
    features: ['katex', 'stepGrading'],
  },
  math3: {
    family: 'math',
    totalScore: 150,
    objectiveKinds: ['选择题', '填空题'],
    strongTierKinds: ['解答题', '计算题', '证明题'],
    features: ['katex', 'stepGrading'],
  },
  mechanics: {
    family: 'mechanics',
    totalScore: 150,
    objectiveKinds: ['选择题', '填空题'],
    strongTierKinds: ['计算题', '证明题', '简答题'],
    features: ['katex', 'stepGrading', 'diagramSupport'],
  },
  english: {
    family: 'english',
    totalScore: 100,
    objectiveKinds: ['完形', '阅读', '新题型', '选择题'],
    strongTierKinds: ['大作文', '翻译'],
    features: ['vocab', 'wordLookup', 'essayRubric'],
  },
  english2: {
    family: 'english',
    totalScore: 100,
    objectiveKinds: ['完形', '阅读', '新题型', '选择题'],
    strongTierKinds: ['大作文', '翻译'],
    features: ['vocab', 'wordLookup', 'essayRubric'],
  },
  politics: {
    family: 'politics',
    totalScore: 100,
    objectiveKinds: ['单选题', '多选题', '选择题'],
    strongTierKinds: ['分析题', '材料分析题', '论述题'],
    features: ['timeline', 'strictMultiChoice', 'pointRubric'],
  },
});

const DEFAULT_OBJECTIVE = new Set(['选择题', '单选题', '多选题', '阅读', '完形', '新题型']);
const DEFAULT_STRONG = new Set(['解答题', '证明题', '综合题', '计算题', '论述题', '材料分析题', '大作文']);

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
