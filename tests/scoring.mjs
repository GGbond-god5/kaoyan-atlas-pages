import assert from 'node:assert/strict';
import { allocatePaper, allocatePaperDetailed } from '../functions/_lib/scoring.js';

const q = (kind, maxScore) => ({ kind, difficulty: '中', ...(maxScore == null ? {} : { maxScore }) });
const sum = (xs) => xs.reduce((a, b) => a + b, 0);

const math = [
  ...Array.from({ length: 10 }, () => q('选择题')),
  ...Array.from({ length: 6 }, () => q('填空题')),
  ...Array.from({ length: 6 }, () => q('计算题')),
];
const mathResult = allocatePaperDetailed('math', math, 'mock');
assert.equal(mathResult.assigned, 150);
assert.equal(sum(allocatePaper('math', math, 'mock')), 150);
assert.equal(mathResult.issues.length, 0);

const mechanics = Array.from({ length: 8 }, () => q('计算题'));
const mechResult = allocatePaperDetailed('mechanics', mechanics, 'paper');
assert.equal(mechResult.assigned, 150);
assert.equal(mechResult.issues.length, 0);

const english = [
  ...Array.from({ length: 20 }, () => q('阅读')),
  ...Array.from({ length: 20 }, () => q('完形')),
  ...Array.from({ length: 5 }, () => q('新题型')),
  ...Array.from({ length: 5 }, () => q('翻译')),
  q('小作文'), q('大作文'),
];
const englishResult = allocatePaperDetailed('english', english, 'paper');
assert.equal(englishResult.assigned, 100);
assert.equal(englishResult.issues.length, 0);

const politics = [
  ...Array.from({ length: 16 }, () => q('单选题')),
  ...Array.from({ length: 17 }, () => q('多选题')),
  ...Array.from({ length: 5 }, () => q('分析题')),
];
const politicsResult = allocatePaperDetailed('politics', politics, 'paper');
assert.equal(politicsResult.assigned, 100);
assert.equal(politicsResult.issues.length, 0);

const over = Array.from({ length: 6 }, () => q('计算题', 30));
const overResult = allocatePaperDetailed('math', over, 'mock');
assert.equal(overResult.assigned, 180);
assert.ok(overResult.issues.some((issue) => issue.code === 'explicit_scores_exceed_total' && issue.fatal));
assert.deepEqual(allocatePaper('math', over, 'mock'), [30, 30, 30, 30, 30, 30]);

const mismatch = allocatePaperDetailed('english', [q('阅读')], 'paper');
assert.ok(mismatch.issues.some((issue) => issue.code === 'paper_total_mismatch' && !issue.fatal));

console.log('scoring invariants passed');
