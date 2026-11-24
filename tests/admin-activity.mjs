// 管理台活跃与使用记录（2026-11-24）：last_active_at 补列与 touchActivity 节流打点、
// /api/admin 用户列表的活跃/做题/AI 7 日聚合、userDetail 使用记录与权限边界。
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { signSession } from '../functions/_lib/security.js';
import { touchActivity, dayCN } from '../functions/_lib/layer1.js';
import { onRequestGet as adminGet } from '../functions/api/admin/index.js';

// users 表故意不建 last_active_at / edition 列，验证 layer1 幂等补列（线上老库形态）
const sql = new DatabaseSync(':memory:');
sql.exec(`CREATE TABLE users (
  phone TEXT PRIMARY KEY, id TEXT NOT NULL, nickname TEXT NOT NULL, salt TEXT NOT NULL,
  hash TEXT NOT NULL, iterations INTEGER NOT NULL DEFAULT 20000, created_at TEXT NOT NULL,
  last_login_at TEXT, banned INTEGER NOT NULL DEFAULT 0, role TEXT NOT NULL DEFAULT 'user',
  session_version INTEGER NOT NULL DEFAULT 0
)`);
sql.exec(`CREATE TABLE platform_attempts (uid TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(uid,id))`);
sql.exec(`CREATE TABLE platform_results (uid TEXT NOT NULL, attempt_id TEXT NOT NULL, question_id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(uid,attempt_id,question_id))`);
sql.exec(`CREATE TABLE platform_files (id TEXT PRIMARY KEY, uid TEXT NOT NULL, name TEXT NOT NULL, subject TEXT NOT NULL, size INTEGER NOT NULL, mime TEXT NOT NULL, object_key TEXT NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL)`);
sql.exec(`CREATE TABLE platform_coach (uid TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(uid,id))`);

const now = new Date().toISOString();
sql.prepare('INSERT INTO users (phone,id,nickname,salt,hash,iterations,created_at,role) VALUES (?,?,?,?,?,?,?,?)')
  .run('13800000009', 'admin1', '站长', 's', 'h', 1000, now, 'admin');
sql.prepare('INSERT INTO users (phone,id,nickname,salt,hash,iterations,created_at) VALUES (?,?,?,?,?,?,?)')
  .run('13800000001', 'u1', '普通同学', 's', 'h', 1000, now);

// blob 顶层与 blob 内 results 故意放误导值：真实批改结果只在 platform_results 表，
// attempt() 读取时整表覆盖 blob 的 results——详情必须同样处理。
const att1 = { id: 'a1', createdAt: '2026-11-20T08:00:00.000Z', subject: 'math', mode: 'paper', status: 'pending', score: 82, knownMaxScore: 100, questions: [{ id: 'q1', chapterTitle: '数学一 2021' }, { id: 'q2', chapterTitle: '数学一 2021' }], results: { q1: { status: 'graded', score: 999, maxScore: 999 } } };
const att2 = { id: 'a2', createdAt: '2026-11-22T09:30:00.000Z', subject: 'english', mode: 'paper', status: 'pending', questions: [{ id: 'q1', chapterTitle: '英语一 2020' }, { id: 'q2', chapterTitle: '英语一 2020' }], results: {} };
sql.prepare('INSERT INTO platform_attempts VALUES (?,?,?)').run('u1', 'a1', JSON.stringify(att1));
sql.prepare('INSERT INTO platform_attempts VALUES (?,?,?)').run('u1', 'a2', JSON.stringify(att2));
sql.prepare('INSERT INTO platform_results VALUES (?,?,?,?)').run('u1', 'a1', 'q1', JSON.stringify({ status: 'graded', score: 10, maxScore: 12 }));
sql.prepare('INSERT INTO platform_results VALUES (?,?,?,?)').run('u1', 'a1', 'q2', JSON.stringify({ status: 'graded', score: 20, maxScore: 28 }));
sql.prepare('INSERT INTO platform_results VALUES (?,?,?,?)').run('u1', 'a2', 'q1', JSON.stringify({ status: 'graded', score: 5, maxScore: 10 }));
sql.prepare('INSERT INTO platform_results VALUES (?,?,?,?)').run('u1', 'a2', 'q2', JSON.stringify({ status: 'pending', score: null, maxScore: 10 }));
sql.prepare('INSERT INTO platform_files VALUES (?,?,?,?,?,?,?,?,?)').run('f1', 'u1', '讲义.pdf', 'math', 1234, 'application/pdf', 'u1/f1', 'ready', '2026-11-21T10:00:00.000Z');
sql.prepare('INSERT INTO platform_coach VALUES (?,?,?)').run('u1', 'c1', '{}');

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
const env = { DB: db, SESSION_SECRET: 'test-only-secret' };

async function tokenFor(uid, phone) { return signSession({ uid, phone, sessionVersion: 0 }, env.SESSION_SECRET); }
async function call(url, token) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await adminGet({ request: new Request(url, { headers }), env });
  return { status: res.status, ...(await res.json()) };
}
const adminToken = await tokenFor('admin1', '13800000009');
const u1Token = await tokenFor('u1', '13800000001');

/* ---------------- touchActivity：补列 + 节流 ---------------- */
await touchActivity(env, 'u1');
const row1 = sql.prepare('SELECT last_active_at FROM users WHERE id = ?').get('u1');
assert.ok(row1.last_active_at, 'touchActivity 应写入 last_active_at（并自动补列）');
await touchActivity(env, 'u1');
const row2 = sql.prepare('SELECT last_active_at FROM users WHERE id = ?').get('u1');
assert.equal(row2.last_active_at, row1.last_active_at, '5 分钟内重复打点应被节流跳过');
const staleIso = new Date(Date.now() - 10 * 60000).toISOString();
sql.prepare('UPDATE users SET last_active_at = ? WHERE id = ?').run(staleIso, 'u1');
await touchActivity(env, 'u1');
const row3 = sql.prepare('SELECT last_active_at FROM users WHERE id = ?').get('u1');
assert.ok(row3.last_active_at > staleIso, '超过节流窗口后应把活跃时间刷新到当前');
assert.ok(row3.last_active_at >= row2.last_active_at, '刷新后的活跃时间不应早于此前记录');
await touchActivity(env, ''); // 空 uid 不应抛错

/* ---------------- AI 用量种子（platform_usage 由 ensureLayer1 已建） ---------------- */
const today = dayCN();
const yday = dayCN(Date.now() - 86400000);
sql.prepare('INSERT INTO platform_usage (uid, day, kind, calls, tokens) VALUES (?,?,?,?,?)').run('u1', today, 'grade', 3, 900);
sql.prepare('INSERT INTO platform_usage (uid, day, kind, calls, tokens) VALUES (?,?,?,?,?)').run('u1', yday, 'coach', 2, 300);

/* ---------------- 用户列表聚合 ---------------- */
const list = await call('https://example.test/api/admin?action=users', adminToken);
assert.equal(list.status, 200);
const u1 = list.users.find((x) => x.phoneFull === '13800000001');
assert.ok(u1, '列表应含测试用户');
assert.equal(u1.attemptsTotal, 2, '做题总数应聚合 platform_attempts');
assert.equal(u1.lastAttemptAt, '2026-11-22T09:30:00.000Z', '最近做题时间取 attempt.createdAt 最大值');
assert.equal(u1.aiCallsToday, 3, '今日 AI 次数');
assert.equal(u1.aiCalls7d, 5, '7 日 AI 次数应含昨日');
assert.ok(u1.lastActiveAt, '列表应带最后活跃时间');

/* ---------------- 使用记录详情 ---------------- */
const detail = await call('https://example.test/api/admin?action=userDetail&phone=13800000001', adminToken);
assert.equal(detail.status, 200);
assert.equal(detail.detail.attempts.total, 2);
assert.equal(detail.detail.attempts.graded, 2, '已批改套数按「至少 1 题已批改」统计（与学情分析同口径）');
assert.equal(detail.detail.attempts.recent[0].id, 'a2', '最近套卷按 createdAt 倒序');
assert.equal(detail.detail.attempts.recent[0].gradedQuestions, 1, '部分批改按 platform_results 逐题计数');
assert.equal(detail.detail.attempts.recent[1].title, '数学一 2021', '标题取首题 chapterTitle');
assert.equal(detail.detail.attempts.recent[1].score, 30, '得分按 platform_results 求和（10+20），不取 blob 内的误导值');
assert.equal(detail.detail.attempts.recent[1].maxScore, 40);
assert.equal(detail.detail.aiUsage.length, 2, '近 14 天 AI 用量两行');
assert.equal(detail.detail.files.total, 1);
assert.equal(detail.detail.files.recent[0].name, '讲义.pdf');
assert.equal(detail.detail.coachCount, 1);

/* ---------------- 权限边界 ---------------- */
const denied = await call('https://example.test/api/admin?action=userDetail&phone=13800000001', u1Token);
assert.equal(denied.status, 403, '普通用户不得查看使用记录');
const missing = await call('https://example.test/api/admin?action=userDetail&phone=13999999999', adminToken);
assert.equal(missing.status, 404, '不存在的用户应 404');

console.log('admin-activity: ok');
