import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { signSession, hashPassword, randomHex } from '../functions/_lib/security.js';
import { onRequest as middleware } from '../functions/_middleware.js';
import { handle, handleWorker } from '../functions/_lib/platform.js';
import { onRequestPost as deleteAccount } from '../functions/api/auth/delete.js';
import { onRequestGet as authMe } from '../functions/api/auth/me.js';
import { onRequestPost as changePassword } from '../functions/api/auth/password.js';
import { onRequestPost as communityPost } from '../functions/api/community/index.js';

const sql = new DatabaseSync(':memory:');
sql.exec(`CREATE TABLE users (
  phone TEXT PRIMARY KEY, id TEXT NOT NULL, nickname TEXT NOT NULL, salt TEXT NOT NULL,
  hash TEXT NOT NULL, iterations INTEGER NOT NULL DEFAULT 20000, created_at TEXT NOT NULL,
  last_login_at TEXT, banned INTEGER NOT NULL DEFAULT 0, role TEXT NOT NULL DEFAULT 'user',
  session_version INTEGER NOT NULL DEFAULT 0
)`);
sql.exec("CREATE TABLE user_profiles (uid TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at TEXT NOT NULL)");
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
  async batch(stmts) { return Promise.all(stmts.map((s) => s.run())); },
};

const objects = new Map();
const r2 = {
  async put(k, v) { objects.set(k, v); },
  async get(k) { return objects.has(k) ? { body: objects.get(k) } : null; },
  async delete(k) { objects.delete(k); },
  async list({ prefix = '', cursor, limit = 100 } = {}) {
    const keys = [...objects.keys()].filter((k) => k.startsWith(prefix)).sort();
    const start = cursor ? Number(cursor) : 0;
    const page = keys.slice(start, start + limit);
    return { objects: page.map((key) => ({ key })), truncated: start + limit < keys.length, cursor: String(start + limit) };
  },
};
const env = { DB: db, SESSION_SECRET: 'test-only-secret', WORKER_TOKEN: 'worker-secret', AI_API_KEY: 'test-key', PBKDF2_ITERATIONS: '1000', LIBRARY_FILES: r2 };

const salt = randomHex(16);
let password = 'Pass1234';
const hash = await hashPassword(password, salt, 1000);
sql.prepare("INSERT INTO users (phone,id,nickname,salt,hash,iterations,created_at,session_version) VALUES (?,?,?,?,?,?,?,?)")
  .run('13800000000', 'u1', '测试用户', salt, hash, 1000, new Date().toISOString(), 0);
let token = await signSession({ uid: 'u1', phone: '13800000000', sessionVersion: 0 }, env.SESSION_SECRET);
let authHeaders = { Authorization: `Bearer ${token}` };

async function call(action, method = 'GET', body, params = {}, headers = authHeaders) {
  const request = new Request('https://example.test/api/test', {
    method,
    headers: body == null ? headers : { ...headers, 'Content-Type': 'application/json' },
    ...(body == null ? {} : { body: JSON.stringify(body) }),
  });
  const response = await handle(request, env, action, params);
  return { status: response.status, data: await response.json() };
}

async function worker(body) {
  const request = new Request('https://example.test/api/worker', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-worker-token': env.WORKER_TOKEN },
    body: JSON.stringify(body),
  });
  const response = await handleWorker(request, env);
  return { status: response.status, data: await response.json() };
}

// 公开登录页资源放行；私有资源在数据库故障时 fail-closed。
const publicTheme = await middleware({
  request: new Request('https://example.test/assets/theme.css', { headers: { Accept: 'text/css' } }),
  env: {},
  next: () => new Response('ok'),
});
assert.equal(publicTheme.status, 200);
// 参赛开放期（_middleware.js GATE_OPEN=true）普通页面也放行，故用始终受门禁的 /api/admin/* 验证 fail-closed。
const malformedCookie = await middleware({
  request: new Request('https://example.test/api/admin/users', { headers: { Cookie: 'atlas_session=%E0%A4%A', Accept: 'application/json' } }),
  env,
  next: () => new Response('ok'),
});
assert.equal(malformedCookie.status, 401);
await middleware({
  request: new Request('https://example.test/api/admin/users', { headers: { ...authHeaders, Accept: 'application/json' } }),
  env,
  next: () => new Response('ok'),
});
const down = { DB: { prepare() { throw new Error('db down'); } }, SESSION_SECRET: env.SESSION_SECRET };
const realConsoleError = console.error;
console.error = () => {};
let closed;
try {
  closed = await middleware({
    request: new Request('https://example.test/api/admin/users', { headers: { ...authHeaders, Accept: 'application/json' } }),
    env: down,
    next: () => new Response('bypass'),
  });
} finally {
  console.error = realConsoleError;
}
assert.equal(closed.status, 503);

// 改密后的 session_version 会让旧令牌失效；当前设备收到新令牌，/me 也不会接受旧令牌。
const oldHeaders = authHeaders;
const passwordChanged = await changePassword({
  request: new Request('https://example.test/api/auth/password', {
    method: 'POST', headers: { ...oldHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ oldPassword: password, newPassword: 'NewPass1234' }),
  }),
  env,
});
assert.equal(passwordChanged.status, 200);
const changedBody = await passwordChanged.json();
assert.ok(changedBody.token);
password = 'NewPass1234';
token = changedBody.token;
authHeaders = { Authorization: `Bearer ${token}` };
assert.equal(sql.prepare("SELECT session_version FROM users WHERE id='u1'").get().session_version, 1);

const staleMe = await authMe({ request: new Request('https://example.test/api/auth/me', { headers: oldHeaders }), env });
assert.equal((await staleMe.json()).user, null);
assert.match(staleMe.headers.get('Set-Cookie') || '', /Max-Age=0/);
const freshMe = await authMe({ request: new Request('https://example.test/api/auth/me', { headers: authHeaders }), env });
assert.equal((await freshMe.json()).user.id, 'u1');

const oldToken = await middleware({
  request: new Request('https://example.test/api/admin/users', { headers: { ...oldHeaders, Accept: 'application/json' } }),
  env,
  next: () => new Response('ok'),
});
assert.equal(oldToken.status, 401);
const versioned = await middleware({
  request: new Request('https://example.test/api/admin/users', { headers: { ...authHeaders, Accept: 'application/json' } }),
  env,
  next: () => new Response('ok'),
});
assert.equal(versioned.status, 200);

// 卷面显式分值超过科目总分时，接口拒绝保存，而不是静默写坏数据。
const overQuestions = Array.from({ length: 6 }, (_, i) => ({
  id: `over-${i + 1}`, subject: 'math', text: '题目', answer: '42', steps: [], kind: '计算题', maxScore: 30,
}));
const oversized = await call('attempts', 'POST', {
  subject: 'math', mode: 'mock', questions: overQuestions, answers: {}, serverGrade: true,
});
assert.equal(oversized.status, 400);

// 自选 AI 地址不能把后端变成内网 SSRF 跳板。
for (const base of ['https://127.0.0.1/v1', 'https://10.0.0.1/v1', 'https://169.254.169.254/latest', 'https://localhost/v1']) {
  const privateAi = await call('attempts', 'GET', null, {}, {
    ...authHeaders, 'x-ai-mode': 'user', 'x-ai-base': base,
    'x-ai-key': '12345678', 'x-ai-model': 'vision-model',
  });
  assert.equal(privateAi.status, 400, `${base} 应被内网 SSRF 防护拦截`);
}

// 自带 AI 配置只在交卷暂存，响应不回显密钥；过期后 claim 自动清除。
const question = {
  id: 'q1', subject: 'math', text: '计算 1+1', answer: '2', steps: ['2'], kind: '计算题', difficulty: '中', reviewStatus: 'user_verified',
};
const created = await call('attempts', 'POST', {
  id: 'ttl-attempt', subject: 'math', mode: 'test', questions: [question],
  answers: { q1: { work: '2' } }, serverGrade: true,
  aiCfg: { base: 'https://api.example.com/v1', key: '12345678', model: 'vision-model' },
});
assert.equal(created.status, 201);
assert.equal('aiCfg' in created.data.attempt, false);
assert.equal('aiCfgAt' in created.data.attempt, false);

sql.prepare("UPDATE platform_attempts SET data=json_set(data,'$.aiCfgAt',?) WHERE id='ttl-attempt'")
  .run(Date.now() - 25 * 3600 * 1000);
const ttlClaim = await worker({ action: 'claim' });
assert.equal(ttlClaim.status, 200);
assert.equal(ttlClaim.data.job.attemptId, 'ttl-attempt');
const ttlRow = sql.prepare("SELECT data FROM platform_attempts WHERE id='ttl-attempt'").get();
assert.equal(JSON.parse(ttlRow.data).aiCfg, undefined);

// 两个 worker 同时 claim 同一道待批卷，只能有一个拿到 job。
sql.prepare("UPDATE platform_attempts SET data=json_remove(data,'$.workerLease') WHERE id='ttl-attempt'").run();
const [claimA, claimB] = await Promise.all([worker({ action: 'claim' }), worker({ action: 'claim' })]);
const jobs = [claimA.data.job, claimB.data.job].filter(Boolean);
assert.equal(jobs.length, 1);

// 浏览器和 worker 同时批同一题时，单题租约保证只调用一次 AI。
let aiCalls = 0;
globalThis.fetch = async () => {
  aiCalls++;
  await new Promise((resolve) => setTimeout(resolve, 30));
  return Response.json({ choices: [{ message: { content: JSON.stringify({ score: 5, comments: 'ok', dimensions: {} }) } }] });
};
const gradeHeaders = {
  ...authHeaders,
  'x-ai-mode': 'user',
  'x-ai-base': 'https://api.example.com/v1',
  'x-ai-key': '12345678',
  'x-ai-model': 'vision-model',
};
const gradedAttempt = await call('attempts', 'POST', {
  id: 'grade-once', subject: 'math', mode: 'test',
  questions: [{ ...question, id: 'g1', maxScore: 10 }], answers: { g1: { work: '2' } }, serverGrade: true,
}, {}, gradeHeaders);
assert.equal(gradedAttempt.status, 201);
const gradeRequests = Array.from({ length: 2 }, () => call(
  'attemptGrade', 'POST', { questionId: 'g1' }, { id: 'grade-once' }, gradeHeaders
));
const graded = await Promise.all(gradeRequests);
assert.deepEqual(graded.map((r) => r.status), [200, 200]);
assert.equal(aiCalls, 1);

// 浏览器与 ECS worker 跨通道竞争同一道题，AI 仍只调用一次。
const crossAttempt = await call('attempts', 'POST', {
  id: 'cross-grade', subject: 'math', mode: 'test',
  questions: [{ ...question, id: 'g2', maxScore: 10 }], answers: { g2: { work: '2' } }, serverGrade: true,
  aiCfg: { base: 'https://api.example.com/v1', key: '12345678', model: 'vision-model' },
}, {}, gradeHeaders);
assert.equal(crossAttempt.status, 201);
const beforeCross = aiCalls;
const [browserGrade, workerGrade] = await Promise.all([
  call('attemptGrade', 'POST', { questionId: 'g2' }, { id: 'cross-grade' }, gradeHeaders),
  worker({ action: 'grade', uid: 'u1', attemptId: 'cross-grade', questionId: 'g2' }),
]);
assert.equal(browserGrade.status, 200);
assert.equal(workerGrade.status, 200);
assert.equal(aiCalls - beforeCross, 1);
const crossResult = sql.prepare("SELECT data FROM platform_results WHERE uid='u1' AND attempt_id='cross-grade' AND question_id='g2'").get();
assert.equal(JSON.parse(crossResult.data).status, 'graded');

// 注销补全社区关系，并只删除本人 R2 对象，不误删别人分享的同一对象。
sql.exec("CREATE TABLE IF NOT EXISTS platform_files (id TEXT PRIMARY KEY, uid TEXT NOT NULL, name TEXT NOT NULL, subject TEXT NOT NULL, size INTEGER NOT NULL, mime TEXT NOT NULL, object_key TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL)");
sql.exec("CREATE TABLE IF NOT EXISTS platform_shares (id TEXT PRIMARY KEY, uid TEXT NOT NULL, file_id TEXT NOT NULL, title TEXT NOT NULL, subject TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '', imports INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL)");
sql.exec("CREATE TABLE IF NOT EXISTS platform_share_likes (share_id TEXT NOT NULL, uid TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(share_id,uid))");
sql.exec("CREATE TABLE IF NOT EXISTS platform_share_comments (id TEXT PRIMARY KEY, share_id TEXT NOT NULL, uid TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL)");
sql.exec("CREATE TABLE IF NOT EXISTS platform_posts (id TEXT PRIMARY KEY, uid TEXT NOT NULL, text TEXT NOT NULL, subject TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL)");
sql.exec("CREATE TABLE IF NOT EXISTS platform_post_likes (post_id TEXT NOT NULL, uid TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(post_id,uid))");
sql.exec("CREATE TABLE IF NOT EXISTS platform_post_comments (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, uid TEXT NOT NULL, parent_id TEXT NOT NULL DEFAULT '', text TEXT NOT NULL, created_at TEXT NOT NULL)");
sql.exec("CREATE TABLE IF NOT EXISTS platform_invites (code TEXT PRIMARY KEY, note TEXT NOT NULL DEFAULT '', used_by TEXT, used_at TEXT, created_at TEXT NOT NULL)");
const now = new Date().toISOString();
sql.prepare("INSERT INTO platform_invites (code,note,used_by,used_at,created_at) VALUES (?,?,?,?,?)").run('invite-u1', '测试邀请码', '13800000000', now, now);
sql.prepare("INSERT INTO platform_files (id,uid,name,subject,size,mime,object_key,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)").run('f-own', 'u1', 'own.pdf', 'math', 1, 'application/pdf', 'library/u1/own', 'uploaded', now);
sql.prepare("INSERT INTO platform_files (id,uid,name,subject,size,mime,object_key,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)").run('f-shared', 'u1', 'shared.pdf', 'math', 1, 'application/pdf', 'library/u2/shared', 'shared', now);
sql.prepare("INSERT INTO platform_files (id,uid,name,subject,size,mime,object_key,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)").run('f-import-delete', 'u1', 'imported.pdf', 'math', 1, 'application/pdf', 'library/u2/imported', 'shared', now);
objects.set('library/u2/imported', 'imported');
const importedDelete = await call('file', 'DELETE', null, { id: 'f-import-delete' });
assert.equal(importedDelete.status, 200);
assert.equal(objects.has('library/u2/imported'), true);
assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM platform_files WHERE id='f-import-delete'").get().n, 0);
sql.prepare("INSERT INTO platform_shares (id,uid,file_id,title,created_at) VALUES (?,?,?,?,?)").run('s-own', 'u1', 'f-own', '自己的分享', now);
sql.prepare("INSERT INTO platform_shares (id,uid,file_id,title,created_at) VALUES (?,?,?,?,?)").run('s-other', 'u2', 'f-other', '别人的分享', now);
sql.prepare("INSERT INTO platform_share_likes VALUES (?,?,?)").run('s-own', 'u1', now);
sql.prepare("INSERT INTO platform_share_likes VALUES (?,?,?)").run('s-other', 'u1', now);
sql.prepare("INSERT INTO platform_share_comments VALUES (?,?,?,?,?)").run('sc-own', 's-own', 'u2', '评论', now);
sql.prepare("INSERT INTO platform_share_comments VALUES (?,?,?,?,?)").run('sc-mine', 's-other', 'u1', '我的评论', now);
sql.prepare("INSERT INTO platform_posts (id,uid,text,created_at) VALUES (?,?,?,?)").run('p-own', 'u1', '自己的动态', now);
sql.prepare("INSERT INTO platform_posts (id,uid,text,created_at) VALUES (?,?,?,?)").run('p-other', 'u2', '别人的动态', now);
sql.prepare("INSERT INTO platform_post_likes VALUES (?,?,?)").run('p-own', 'u1', now);
sql.prepare("INSERT INTO platform_post_likes VALUES (?,?,?)").run('p-other', 'u1', now);
sql.prepare("INSERT INTO platform_post_comments VALUES (?,?,?,?,?,?)").run('pc-own', 'p-own', 'u2', '', '评论', now);
sql.prepare("INSERT INTO platform_post_comments VALUES (?,?,?,?,?,?)").run('pc-mine', 'p-other', 'u1', '', '我的评论', now);
const unshared = await communityPost({
  request: new Request('https://example.test/api/community', {
    method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'unshare', id: 's-own' }),
  }),
  env,
});
assert.equal(unshared.status, 200);
assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM platform_shares WHERE id='s-own'").get().n, 0);
assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM platform_share_likes WHERE share_id='s-own'").get().n, 0);
assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM platform_share_comments WHERE share_id='s-own'").get().n, 0);
objects.set('library/u1/own', 'own');
objects.set('library/u2/shared', 'shared');
objects.set('avatars/u1', 'avatar');
objects.set('u1-note.png', 'note');
objects.set('u1/legacy.pdf', 'legacy');
const deleted = await deleteAccount({
  request: new Request('https://example.test/api/auth/delete', {
    method: 'POST', headers: { ...authHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify({ password }),
  }),
  env,
});
assert.equal(deleted.status, 200);
assert.equal(objects.has('library/u1/own'), false);
assert.equal(objects.has('u1-note.png'), false);
assert.equal(objects.has('u1/legacy.pdf'), false);
assert.equal(objects.has('library/u2/shared'), true);
assert.equal(objects.has('avatars/u1'), false);
for (const [table, where] of [
  ['platform_shares', "uid='u1'"], ['platform_posts', "uid='u1'"],
  ['platform_share_likes', "uid='u1' OR share_id='s-own'"],
  ['platform_share_comments', "uid='u1' OR share_id='s-own'"],
  ['platform_post_likes', "uid='u1' OR post_id='p-own'"],
  ['platform_post_comments', "uid='u1' OR post_id='p-own'"],
]) {
  const count = sql.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`).get().n;
  assert.equal(count, 0, `${table} 未清理干净`);
}
assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM users WHERE id='u1'").get().n, 0);
const invite = sql.prepare("SELECT used_by,used_at FROM platform_invites WHERE code='invite-u1'").get();
assert.equal(invite.used_by, '');
assert.equal(invite.used_at, now);

// 封禁账号即使持有有效版本令牌，也不能通过直连接口注销。
const bannedSalt = randomHex(16);
const bannedHash = await hashPassword('Banned1234', bannedSalt, 1000);
sql.prepare("INSERT INTO users (phone,id,nickname,salt,hash,iterations,created_at,session_version,banned) VALUES (?,?,?,?,?,?,?,?,?)")
  .run('13900000000', 'u2', '封禁用户', bannedSalt, bannedHash, 1000, new Date().toISOString(), 0, 1);
const bannedToken = await signSession({ uid: 'u2', phone: '13900000000', sessionVersion: 0 }, env.SESSION_SECRET);
const bannedDelete = await deleteAccount({
  request: new Request('https://example.test/api/auth/delete', {
    method: 'POST', headers: { Authorization: `Bearer ${bannedToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'Banned1234' }),
  }),
  env,
});
assert.equal(bannedDelete.status, 401);
assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM users WHERE id='u2'").get().n, 1);

console.log('backend hardening checks passed');
