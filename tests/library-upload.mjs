// 资料上传链路：跨页成组抽取、断点续传分片上传、文件头校验与重复内容拦截。
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { signSession } from '../functions/_lib/security.js';
import { handle, sniffLibraryType } from '../functions/_lib/platform.js';

const sql = new DatabaseSync(':memory:');
sql.exec(`CREATE TABLE users (
  phone TEXT PRIMARY KEY, id TEXT NOT NULL, nickname TEXT NOT NULL, salt TEXT NOT NULL,
  hash TEXT NOT NULL, iterations INTEGER NOT NULL DEFAULT 20000, created_at TEXT NOT NULL,
  last_login_at TEXT, banned INTEGER NOT NULL DEFAULT 0, role TEXT NOT NULL DEFAULT 'user',
  session_version INTEGER NOT NULL DEFAULT 0
)`);
sql.prepare('INSERT INTO users (phone,id,nickname,salt,hash,iterations,created_at) VALUES (?,?,?,?,?,?,?)')
  .run('13800000001', 'u1', '上传测试', 's', 'h', 1000, new Date().toISOString());

const db = {
  prepare(query) {
    let values = [];
    return {
      bind(...v) { values = v; return this; },
      async first() { return sql.prepare(query).get(...values) || null; },
      async all() { return { results: sql.prepare(query).all(...values) }; },
      async run() { return { meta: { changes: Number(sql.prepare(query).run(...values).changes) } }; },
    };
  },
  async batch(stmts) { return Promise.all(stmts.map(s => s.run())); },
};

const objects = new Map();
const r2 = {
  async put(k, v) { objects.set(k, v instanceof Uint8Array ? v : new Uint8Array(v)); return { key: k }; },
  async get(k) {
    if (!objects.has(k)) return null;
    const bytes = objects.get(k);
    return { key: k, size: bytes.length, body: bytes, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  },
  async delete(k) { objects.delete(k); },
  async list({ prefix = '', cursor, limit = 100 } = {}) {
    const keys = [...objects.keys()].filter(k => k.startsWith(prefix)).sort();
    const start = cursor ? Number(cursor) : 0;
    const page = keys.slice(start, start + limit);
    return { objects: page.map(key => ({ key })), truncated: start + limit < keys.length, cursor: String(start + limit) };
  },
};

const env = { DB: db, SESSION_SECRET: 'test-only-secret', AI_API_KEY: 'test-key', LIBRARY_FILES: r2, AI_EXTRACT_DAILY: '50' };
const token = await signSession({ uid: 'u1', phone: '13800000001', sessionVersion: 0 }, env.SESSION_SECRET);
const authHeaders = { Authorization: `Bearer ${token}` };

async function call(action, method = 'GET', body, params = {}, raw) {
  const headers = raw != null ? { ...authHeaders, 'Content-Type': 'application/octet-stream' } : (body == null ? { ...authHeaders } : { ...authHeaders, 'Content-Type': 'application/json' });
  const request = new Request('https://example.test/api/test', { method, headers, ...(raw != null ? { body: raw } : (body != null ? { body: JSON.stringify(body) } : {})) });
  const response = await handle(request, env, action, params);
  const type = response.headers.get('Content-Type') || '';
  return { status: response.status, ...(type.includes('json') ? await response.json() : { text: await response.text() }) };
}

/* ---------------- 文件头校验 ---------------- */
const PDF = new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n%%EOF\n');
assert.equal(sniffLibraryType(PDF, '真题.pdf'), 'pdf', '真 PDF 应通过');
assert.equal(sniffLibraryType(new TextEncoder().encode('MZ\x90\x03 fake'), '真题.pdf'), null, '伪装成 pdf 的二进制应拒绝');
assert.equal(sniffLibraryType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]), '页.png'), 'png');
assert.equal(sniffLibraryType(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]), '页.jpg'), 'jpg');
assert.equal(sniffLibraryType(new TextEncoder().encode('{"items":[]}'), '题.json'), 'json');
assert.equal(sniffLibraryType(new TextEncoder().encode('{"broken"'), '题.json'), null, '坏 JSON 应拒绝');
assert.equal(sniffLibraryType(new TextEncoder().encode('第 1 题\n设 lim x→0'), '笔记.md'), 'md');

/* ---------------- 直传：类型、大小与重复内容 ---------------- */
const uploadForm = (bytes, name, extra = {}) => {
  const form = new FormData();
  form.set('file', new File([bytes], name, { type: 'application/octet-stream' }));
  form.set('name', name); form.set('subject', 'math');
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  return form;
};
async function postForm(body) {
  const response = await handle(new Request('https://example.test/api/library', { method: 'POST', headers: authHeaders, body }), env, 'library', {});
  return { status: response.status, ...(await response.json()) };
}
assert.equal((await postForm(uploadForm(new TextEncoder().encode('not a pdf at all'), '坏文件.pdf'))).status, 400, '扩展名与内容不符须拦下');
const first = await postForm(uploadForm(PDF, '真题.pdf'));
assert.equal(first.status, 201, first.error);
const fileId = first.file.id;
const dup = await postForm(uploadForm(PDF, '真题副本.pdf'));
assert.equal(dup.status, 409, '同内容重复上传要先提示');
assert.match(dup.error, /已上传过/);
assert.equal(dup.duplicates[0].name, '真题.pdf');
const forced = await postForm(uploadForm(PDF, '真题副本.pdf', { force: '1' }));
assert.equal(forced.status, 201, '确认重复上传后应放行');

/* ---------------- 跨页成组抽取 ---------------- */
let aiCalls = [];
let aiReply = { items: [] };
globalThis.fetch = async (_url, init) => {
  const payload = JSON.parse(init.body);
  aiCalls.push(payload.messages[1].content);
  assert.ok(payload.max_tokens >= 3000, '组页调用应带 token 预算');
  return Response.json({ choices: [{ message: { content: JSON.stringify(aiReply) } }] });
};
const mkItem = (over = {}) => ({
  text: '设 lim(x→0) (tan x − sin x)/x^3 =', answer: '1/2', pages: [1], incomplete: false, missing: '',
  steps: ['考点：等价无穷小；方法：先通分'], kind: '计算题', difficulty: '中',
  chapter: 'math-01', chapterTitle: '函数、极限与连续', kp: 'kp-03', kpName: '无穷小比较', topicChapter: '', passage: '', maxScore: null, ...over,
});

// 连续三页只调一次模型；跨页题带着两页的页码回来
aiCalls = [];
aiReply = { items: [mkItem({ pages: [1, 2], text: '第 1 题（题干在第 1 页、选项在第 2 页）\nA. 1\nB. 2\nC. 3\nD. 4' }), mkItem({ pages: [3], answer: '', incomplete: true, missing: '缺 D 选项，应在第 4 页' })] };
const grouped = await call('extract', 'POST', { pages: [
  { page: 1, text: '一、选择题 1. 设函数……（选项见下页）', image: '' },
  { page: 2, text: 'A. 1  B. 2  C. 3  D. 4  2. 下一条题干', image: '' },
  { page: 3, text: '3. 本题选项为 A. 1 B. 2 C. 3', image: '' },
] }, { id: fileId });
assert.equal(grouped.status, 200, JSON.stringify(grouped));
assert.equal(aiCalls.length, 1, '连续页应合成一次模型调用，而不是逐页调用');
assert.equal(grouped.items.length, 2);
const cross = grouped.items.find(x => x.sourcePage === 1);
assert.deepEqual(cross.sourcePages, [1, 2], '跨页题要记下全部来源页');
assert.match(cross.text, /题干在第 1 页、选项在第 2 页/);
const cut = grouped.items.find(x => x.incomplete);
assert.equal(cut.missing, '缺 D 选项，应在第 4 页');
assert.equal(grouped.incomplete, 1, '响应要给出本次被截断的题数');

// 越界页码退回整组页，不信任模型乱填
aiCalls = [];
aiReply = { items: [mkItem({ pages: [99] })] };
const stray = await call('extract', 'POST', { pages: [{ page: 4, text: '4. 题干', image: '' }] }, { id: fileId });
assert.deepEqual(stray.items[0].sourcePages, [4]);

// 不连续页各自成组；重复抽同一组页复用草稿、不再烧额度
aiCalls = [];
aiReply = { items: [mkItem()] };
const split = await call('extract', 'POST', { pages: [{ page: 5, text: '5. 题干', image: '' }, { page: 7, text: '7. 题干', image: '' }] }, { id: fileId });
assert.equal(aiCalls.length, 2, '非连续页不能塞进同一次调用');
assert.equal(split.items.length, 2);
const reused = await call('extract', 'POST', { pages: [{ page: 5, text: '5. 题干', image: '' }, { page: 7, text: '7. 题干', image: '' }] }, { id: fileId });
assert.equal(aiCalls.length, 2, '同组页重复抽取应命中已存草稿');
assert.equal(reused.items.length, 2);

// 手工补全后可以撤下截断标记
const edited = await call('extract', 'PUT', { draftId: cut.draftId, incomplete: false, missing: '' }, { id: fileId });
assert.equal(edited.draft.incomplete, false);
assert.equal(edited.draft.missing, '');

// 单请求页数与图片总量有上限
assert.equal((await call('extract', 'POST', { pages: Array.from({ length: 9 }, (_, i) => ({ page: i + 1, text: '题干', image: '' })) }, { id: fileId })).status, 400);
assert.equal((await call('extract', 'POST', { pages: [{ page: 1, text: '', image: 'data:image/png;base64,' + 'A'.repeat(20_000_001) }] }, { id: fileId })).status, 400);

/* ---------------- 分片断点续传 ---------------- */
const hash = await crypto.subtle.digest('SHA-256', PDF);
const sha = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
const created = await call('uploads', 'POST', { name: '十年真题.pdf', subject: 'math', size: PDF.length, sha256: sha, force: true });
assert.equal(created.status, 201, JSON.stringify(created));
const up = created.upload;
assert.equal(up.total, 1);
assert.equal(up.chunk, 4 * 1024 * 1024);

// 少传分片要指出缺哪几片
const early = await call('uploadsComplete', 'POST', {}, { id: up.id });
assert.equal(early.status, 400);
assert.deepEqual(early.missing, [1]);

// 传第 1 片 → 列表能读出已传进度（刷新后续传）
const partOut = await call('uploadPart', 'PUT', null, { id: up.id, n: '1' }, PDF);
assert.deepEqual(partOut.uploaded, [1]);
assert.equal(partOut.remaining.length, up.total - 1);
const listed = await call('uploads', 'GET');
assert.equal(listed.uploads.find(x => x.id === up.id).parts.length, 1, '续传清单要能恢复进度');

// 分片序号越界、空分片都要拦
assert.equal((await call('uploadPart', 'PUT', null, { id: up.id, n: String(up.total + 5) }, PDF)).status, 400);
assert.equal((await call('uploadPart', 'PUT', null, { id: up.id, n: '1' }, new Uint8Array(0))).status, 400);

const done = await call('uploadsComplete', 'POST', {}, { id: up.id });
assert.equal(done.status, 201, JSON.stringify(done));
assert.equal(done.file.size, PDF.length);
const stored = sql.prepare('SELECT object_key, sha256, mime FROM platform_files WHERE id=?').get(done.file.id);
assert.ok(objects.has(stored.object_key), '合并后的文件要落到正式前缀下');
assert.equal(stored.sha256, sha);
assert.equal(stored.mime, 'application/pdf');
assert.ok(!objects.has(`library-tmp/u1/${up.id}/1`), '合并成功后要清掉临时分片');
assert.equal((await call('uploads', 'GET')).uploads.length, 0);

// 哈希不一致（传输损坏）直接拒收，不落半个文件
const badHash = await call('uploads', 'POST', { name: '损坏.pdf', subject: 'math', size: PDF.length, sha256: '0'.repeat(64) });
assert.equal(badHash.status, 201);
await call('uploadPart', 'PUT', null, { id: badHash.upload.id, n: '1' }, PDF);
const corrupted = await call('uploadsComplete', 'POST', {}, { id: badHash.upload.id });
assert.equal(corrupted.status, 400);
assert.match(corrupted.error, /校验不一致/);

// 同内容分片上传也要撞重复提示；force 可跳过
const dupUp = await call('uploads', 'POST', { name: '又一份.pdf', subject: 'math', size: PDF.length, sha256: sha });
assert.equal(dupUp.status, 409);
assert.match(dupUp.error, /已上传过/);
const forcedUp = await call('uploads', 'POST', { name: '又一份.pdf', subject: 'math', size: PDF.length, sha256: sha, force: true });
assert.equal(forcedUp.status, 201);
assert.equal((await call('uploads', 'DELETE', { id: forcedUp.upload.id })).deleted, true);
assert.equal((await call('uploads', 'GET')).uploads.length, 1, '主动取消只清自己那一条（损坏会话仍在）');

// 声明大小超限、参数缺失都要拦；不存在的会话 404
assert.equal((await call('uploads', 'POST', { name: 'x.pdf', subject: 'math', size: 21 * 1024 * 1024, sha256: sha })).status, 400);
assert.equal((await call('uploads', 'POST', { name: 'x.pdf', subject: 'math', size: 10, sha256: 'zz' })).status, 400);
assert.equal((await call('uploadPart', 'PUT', null, { id: 'nope', n: '1' }, PDF)).status, 404);
assert.equal((await call('uploads', 'GET', null, {}, null)).status, 200);

console.log('library upload and cross-page extraction checks passed');
