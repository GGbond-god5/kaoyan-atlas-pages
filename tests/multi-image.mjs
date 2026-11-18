/* 作答照片多图自测（本地已备、待推送）：
 * 1) 多图 attempt 提交/读取：images 数组原样保序存回，image 同步为第一张；
 * 2) 校验：超过 6 张、坏格式、合计超上限均 400；
 * 3) 批改组装：转写与评分两次 AI 请求都按页序带全部图片（转写有看不清处时评分附图）；
 * 4) 老数据兼容：只有 image 单字符串的 attempt 读取不报错、批改只带 1 张；
 * 5) /api/grade 直连带 images 数组同样按序带图；answerImages 双读单元断言。
 * 跑法：node tests/multi-image.mjs */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { signSession } from '../functions/_lib/security.js';
import { handle, answerImages } from '../functions/_lib/platform.js';
import { onRequestPost as legacyGrade } from '../functions/api/grade.js';

const sql = new DatabaseSync(':memory:');
sql.exec('CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, phone TEXT)'); /* 生产 D1 里 users 由账号模块建表；内存 shim 需手动补，否则 attemptGrade 的 me() 会抛错（现有 platform-api.mjs 同因此预存失败，与本功能无关） */
const db = { prepare(query) { let values = []; return { bind(...v) { values = v; return this; }, async first() { return sql.prepare(query).get(...values) || null; }, async all() { return { results: sql.prepare(query).all(...values) }; }, async run() { return { meta: { changes: Number(sql.prepare(query).run(...values).changes) } }; } }; }, async batch(stmts) { return Promise.all(stmts.map(s => s.run())); } };
const env = { DB: db, SESSION_SECRET: 'test-only-secret', AI_API_KEY: 'test-only-key' };

const calls = [];
globalThis.fetch = async (url, init) => {
  const payload = JSON.parse(init.body);
  calls.push(payload);
  const sys = payload.messages?.[0]?.content || '';
  const data = String(sys).includes('转写员')
    ? { transcript: '第一页内容\n第二页内容', illegible: ['第 2 页第 3 行看不清'] }
    : { score: 4, comments: 'ok', dimensions: {} };
  return Response.json({ choices: [{ message: { content: JSON.stringify(data) } }] });
};
const imgUrlsOf = payload => {
  const out = [];
  for (const m of payload.messages || []) {
    if (Array.isArray(m.content)) for (const part of m.content) if (part.type === 'image_url') out.push(part.image_url.url);
  }
  return out;
};
const isTranscribe = payload => String(payload.messages?.[0]?.content || '').includes('转写员');

const token = await signSession({ uid: 'a', phone: '1' }, env.SESSION_SECRET);
async function req(action, method = 'GET', data, params = {}) {
  const h = { Authorization: `Bearer ${token}` };
  if (data) h['Content-Type'] = 'application/json';
  const request = new Request('https://example.test/api/test', { method, headers: h, ...(data ? { body: JSON.stringify(data) } : {}) });
  const response = await handle(request, env, action, params);
  const result = response.headers.get('Content-Type')?.includes('json') ? await response.json() : await response.text();
  return { status: response.status, ...result };
}

const img = n => 'data:image/jpeg;base64,' + Buffer.from('page-' + n).toString('base64');
const [i1, i2, i3] = [img(1), img(2), img(3)];
const q = { id: 'q1', subject: 'math', text: '计算题题干', answer: '42', kind: '计算题', steps: ['步骤一'], maxScore: 10 };

/* answerImages 双读单元断言 */
assert.deepEqual(answerImages({ image: i1 }), [i1]);
assert.deepEqual(answerImages({ images: [i1, i2], image: i1 }), [i1, i2]);
assert.deepEqual(answerImages({ images: [], image: i2 }), [i2]);
assert.deepEqual(answerImages({}), []);
assert.deepEqual(answerImages(null), []);

/* 1) 多图提交与读取 */
const created = await req('attempts', 'POST', { id: 'multi', subject: 'math', mode: 'test', questions: [q], answers: { q1: { work: '', selected: [], image: i1, images: [i1, i2] } } });
assert.equal(created.status, 201);
const got = await req('attempt', 'GET', null, { id: 'multi' });
assert.deepEqual(got.attempt.answers.q1.images, [i1, i2]);
assert.equal(got.attempt.answers.q1.image, i1);

/* 2) 校验拦截 */
assert.equal((await req('attempts', 'POST', { id: 'toomany', subject: 'math', mode: 'test', questions: [q], answers: { q1: { images: [i1, i2, i3, img(4), img(5), img(6), img(7)] } } })).status, 400);
assert.equal((await req('attempts', 'POST', { id: 'badfmt', subject: 'math', mode: 'test', questions: [q], answers: { q1: { images: [i1, 'https://example.com/x.png'] } } })).status, 400);
const big = 'data:image/jpeg;base64,' + 'A'.repeat(7000000);
assert.equal((await req('attempts', 'POST', { id: 'toobig', subject: 'math', mode: 'test', questions: [q], answers: { q1: { images: [big, big, big] } } })).status, 400);

/* 3) 多图批改：转写与评分都按页序带 2 张图 */
let before = calls.length;
const graded = await req('attemptGrade', 'POST', { questionId: 'q1' }, { id: 'multi' });
assert.equal(graded.status, 200);
assert.equal(graded.result.status, 'graded');
const mcalls = calls.slice(before);
assert.equal(mcalls.length, 2);
assert.ok(isTranscribe(mcalls[0]));
assert.deepEqual(imgUrlsOf(mcalls[0]), [i1, i2]);
assert.deepEqual(imgUrlsOf(mcalls[1]), [i1, i2]);

/* 4) 老单图数据：读取不报错、批改只带 1 张 */
const legacy = await req('attempts', 'POST', { id: 'legacy', subject: 'math', mode: 'test', questions: [q], answers: { q1: { work: '', selected: [], image: i2 } } });
assert.equal(legacy.status, 201);
const gotLegacy = await req('attempt', 'GET', null, { id: 'legacy' });
assert.equal(gotLegacy.attempt.answers.q1.image, i2);
before = calls.length;
const gradedLegacy = await req('attemptGrade', 'POST', { questionId: 'q1' }, { id: 'legacy' });
assert.equal(gradedLegacy.status, 200);
const lcalls = calls.slice(before);
assert.equal(lcalls.length, 2);
assert.deepEqual(imgUrlsOf(lcalls[0]), [i2]);
assert.deepEqual(imgUrlsOf(lcalls[1]), [i2]);

/* 5) /api/grade 直连：images 数组按给定顺序带图；无图纯文字批改不带图 */
async function directGrade(payload) {
  const b = calls.length;
  const res = await legacyGrade({ request: new Request('https://x/', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }), env });
  assert.equal(res.status, 200);
  return calls.slice(b);
}
const dcalls = await directGrade({ subject: 'math', kind: '计算题', question: '题干', answer: '42', steps: [], maxScore: 10, images: [i2, i1] });
assert.deepEqual(imgUrlsOf(dcalls[0]), [i2, i1]);
const tcalls = await directGrade({ subject: 'math', kind: '计算题', question: '题干', answer: '42', steps: [], maxScore: 10, work: '手写步骤略，已写在纸上' });
assert.equal(imgUrlsOf(tcalls[0]).length, 0);

console.log('multi-image checks passed');
