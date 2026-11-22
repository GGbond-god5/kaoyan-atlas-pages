import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { signSession } from '../functions/_lib/security.js';
import { handle } from '../functions/_lib/platform.js';

/* GET /api/attempts 摘要模式（?summary=1）：学情分析主页只取轻字段。
 * 断言：默认全量形状逐字段不变；摘要剥离题面/解析/作答照片/逐题长评语，
 * 轻字段与顶层 status/score/knownMaxScore 与全量完全一致；并打印两种模式的字节数对比。 */
const sql = new DatabaseSync(':memory:');
sql.exec("CREATE TABLE users (phone TEXT PRIMARY KEY, id TEXT NOT NULL, nickname TEXT NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL, iterations INTEGER NOT NULL DEFAULT 20000, created_at TEXT NOT NULL, last_login_at TEXT, banned INTEGER NOT NULL DEFAULT 0, role TEXT NOT NULL DEFAULT 'user', session_version INTEGER NOT NULL DEFAULT 0)");
const db = { prepare(query) { let values = []; return { bind(...v) { values = v; return this; }, async first() { return sql.prepare(query).get(...values) || null; }, async all() { return { results: sql.prepare(query).all(...values) }; }, async run() { return { meta: { changes: Number(sql.prepare(query).run(...values).changes) } }; } }; }, async batch(stmts) { return Promise.all(stmts.map(s => s.run())); } };
const env = { DB: db, SESSION_SECRET: 'test-only-secret', AI_API_KEY: 'test-only-key' };
const token = await signSession({ uid: 'a', phone: '1' }, env.SESSION_SECRET);
async function req(url, method = 'GET', data) {
  const h = { Authorization: `Bearer ${token}` };
  if (data) h['Content-Type'] = 'application/json';
  const response = await handle(new Request(url, { method, headers: h, ...(data ? { body: JSON.stringify(data) } : {}) }), env, 'attempts', {});
  return { status: response.status, body: await response.json() };
}

const longText = '题面长文本'.repeat(600);            // 约 3.6KB/题
const longSteps = Array.from({ length: 12 }, (_, i) => `第${i + 1}步解析`.repeat(60));
const fakePhoto = 'data:image/jpeg;base64,' + 'A'.repeat(300000); // 约 300KB 假作答照片
const fatQuestion = (n, extra = {}) => ({
  id: `fq${n}`, subject: 'math', subjectName: '数学一', kind: '解答题',
  kp: `kp-0${n}`, kpName: `考点${n}`, chapter: 'math-01', chapterTitle: '函数、极限与连续',
  topicChapter: 'math-01', topicTitle: '函数、极限与连续',
  text: longText, steps: longSteps, options: ['A 选项长文本'.repeat(50), 'B', 'C', 'D'], answer: '参考答案'.repeat(300),
  difficulty: '难', maxScore: 10, ...extra,
});
const fatResult = (score, maxScore) => ({
  status: 'graded', score, maxScore, level: '良好',
  dimensions: { '概念与定理理解': { score: score - 1, max: maxScore }, '推导与计算准确': '7/10' },
  comments: '总评长文本'.repeat(400),
  breakdown: [{ point: '得分点一', score, max: maxScore, comment: '点评'.repeat(300) }],
  missing: '缺失要点'.repeat(100), suggestions: '改进建议'.repeat(100), revised: '订正要点'.repeat(200),
  grammar: [{ original: '原句'.repeat(50), corrected: '改后', reason: '原因' }],
  upgrades: [{ original: '原句', upgraded: '升级句'.repeat(50), note: '说明' }],
  deepExplain: '深度解析'.repeat(500),
});

const questions = [fatQuestion(1), fatQuestion(2), fatQuestion(3, { kind: '填空题', maxScore: 5 })];
const answers = {
  fq1: { selected: ['A'] },
  fq2: { work: '我的手写作答转写'.repeat(200), image: fakePhoto, images: [fakePhoto, fakePhoto] },
  fq3: { work: '填空作答', image: fakePhoto },
};
const created = await req('https://example.test/api/attempts', 'POST', { id: 'fatpaper', subject: 'math', mode: 'paper', questions, answers });
assert.equal(created.status, 201);
/* 直接播种批改结果（模拟批改完成后的 platform_results 行） */
const seed = sql.prepare('INSERT INTO platform_results VALUES (?,?,?,?)');
seed.run('a', 'fatpaper', 'fq1', JSON.stringify(fatResult(8, 10)));
seed.run('a', 'fatpaper', 'fq2', JSON.stringify(fatResult(6, 10)));
seed.run('a', 'fatpaper', 'fq3', JSON.stringify({ status: 'pending', score: null, maxScore: 5 }));

const full = await req('https://example.test/api/attempts');
assert.equal(full.status, 200);
const fa = full.body.attempts.find(a => a.id === 'fatpaper');
assert.ok(fa, '全量列表应含 fatpaper');
/* 默认模式形状不变：重字段都在 */
assert.equal(fa.questions[0].text, longText);
assert.deepEqual(fa.questions[0].steps, longSteps);
assert.equal(fa.answers.fq2.image, fakePhoto);
assert.equal(fa.answers.fq2.images.length, 2);
assert.equal(fa.results.fq1.comments, fatResult(8, 10).comments);
assert.equal(fa.results.fq1.breakdown.length, 1);
assert.equal(fa.results.fq1.revised, fatResult(8, 10).revised);
/* 顶层口径基线：2 题 graded → status=pending（未全批完）、score=14、knownMaxScore=20 */
assert.equal(fa.status, 'pending');
assert.equal(fa.score, 14);
assert.equal(fa.knownMaxScore, 20);

const summ = await req('https://example.test/api/attempts?summary=1');
assert.equal(summ.status, 200);
const sa = summ.body.attempts.find(a => a.id === 'fatpaper');
assert.ok(sa, '摘要列表应含 fatpaper');
/* 顶层与全量完全一致 */
assert.equal(sa.status, fa.status);
assert.equal(sa.score, fa.score);
assert.equal(sa.knownMaxScore, fa.knownMaxScore);
assert.equal(sa.subject, fa.subject);
assert.equal(sa.mode, fa.mode);
assert.equal(sa.createdAt, fa.createdAt);
/* 题目：重字段剥离、轻字段保留 */
for (const q of sa.questions) {
  assert.equal(q.text, undefined, '摘要题目不应含 text');
  assert.equal(q.steps, undefined, '摘要题目不应含 steps');
  assert.equal(q.options, undefined, '摘要题目不应含 options');
  assert.equal(q.answer, undefined, '摘要题目不应含 answer');
  assert.equal(q.difficulty, undefined, '摘要题目不应含 difficulty');
  assert.ok(q.id && q.subject === 'math' && q.subjectName === '数学一' && q.kind && q.kp && q.kpName && q.chapter && q.chapterTitle && q.topicChapter && q.topicTitle, '摘要题目轻字段应齐全');
  assert.equal(typeof q.maxScore, 'number');
}
assert.equal(sa.questions[0].maxScore, fa.questions[0].maxScore);
/* 作答：照片剥离、轻量信息保留 */
assert.equal(sa.answers.fq2.image, undefined, '摘要作答不应含 image');
assert.equal(sa.answers.fq2.images, undefined, '摘要作答不应含 images');
assert.equal(sa.answers.fq3.image, undefined);
assert.equal(sa.answers.fq2.work, answers.fq2.work);
assert.deepEqual(sa.answers.fq1.selected, ['A']);
/* 批改结果：长文本剥离、聚合字段保留 */
const sr = sa.results.fq1;
assert.equal(sr.status, 'graded');
assert.equal(sr.score, 8);
assert.equal(sr.maxScore, 10);
assert.equal(sr.level, '良好');
assert.deepEqual(sr.dimensions, fatResult(8, 10).dimensions);
for (const k of ['comments', 'breakdown', 'missing', 'suggestions', 'revised', 'grammar', 'upgrades', 'deepExplain']) assert.equal(sr[k], undefined, `摘要结果不应含 ${k}`);
assert.equal(sa.results.fq3.status, 'pending');

/* ?summary=0 与无参数同为默认全量 */
const zero = await req('https://example.test/api/attempts?summary=0');
const za = zero.body.attempts.find(a => a.id === 'fatpaper');
assert.equal(za.questions[0].text, longText);
assert.equal(za.answers.fq2.image, fakePhoto);

const fullBytes = Buffer.byteLength(JSON.stringify(full.body));
const summaryBytes = Buffer.byteLength(JSON.stringify(summ.body));
console.log(`attempts list bytes: full=${fullBytes} summary=${summaryBytes} ratio=${(summaryBytes / fullBytes * 100).toFixed(1)}%`);
assert.ok(summaryBytes < fullBytes / 3, '摘要体积应显著小于全量');
console.log('attempts summary mode checks passed');
