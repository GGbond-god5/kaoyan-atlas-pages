// 内测码分级（2026-11-22）：edition 列迁移、管理台发码、兑换全流程、/api/auth/me 版本口径、
// 中间件对全量题库分片/内部资料路径的内测门禁、套卷清单 papers.js 按版本过滤。
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { signSession } from '../functions/_lib/security.js';
import { newBetaCode } from '../functions/_lib/layer1.js';
import { onRequestPost as adminPost, onRequestGet as adminGet } from '../functions/api/admin/index.js';
import { onRequestPost as betaPost, onRequestGet as betaGet } from '../functions/api/auth/beta.js';
import { onRequestGet as authMe } from '../functions/api/auth/me.js';
import { onRequest as middleware } from '../functions/_middleware.js';

// 注意：users 表故意不建 edition 列，验证 layer1 的幂等补列（线上老库就是这个形态）
const sql = new DatabaseSync(':memory:');
sql.exec(`CREATE TABLE users (
  phone TEXT PRIMARY KEY, id TEXT NOT NULL, nickname TEXT NOT NULL, salt TEXT NOT NULL,
  hash TEXT NOT NULL, iterations INTEGER NOT NULL DEFAULT 20000, created_at TEXT NOT NULL,
  last_login_at TEXT, banned INTEGER NOT NULL DEFAULT 0, role TEXT NOT NULL DEFAULT 'user',
  session_version INTEGER NOT NULL DEFAULT 0
)`);
const now = new Date().toISOString();
sql.prepare('INSERT INTO users (phone,id,nickname,salt,hash,iterations,created_at,role) VALUES (?,?,?,?,?,?,?,?)')
  .run('13800000009', 'admin1', '站长', 's', 'h', 1000, now, 'admin');
sql.prepare('INSERT INTO users (phone,id,nickname,salt,hash,iterations,created_at) VALUES (?,?,?,?,?,?,?)')
  .run('13800000001', 'u1', '普通同学', 's', 'h', 1000, now);
sql.prepare('INSERT INTO users (phone,id,nickname,salt,hash,iterations,created_at) VALUES (?,?,?,?,?,?,?)')
  .run('13800000002', 'u2', '另一位同学', 's', 'h', 1000, now);

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

async function tokenFor(uid, phone) {
  return signSession({ uid, phone, sessionVersion: 0 }, env.SESSION_SECRET);
}
async function call(handler, { method = 'GET', url = 'https://example.test/', token, body } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body != null) headers['Content-Type'] = 'application/json';
  const request = new Request(url, { method, headers, ...(body != null ? { body: JSON.stringify(body) } : {}) });
  const response = await handler({ request, env });
  const type = response.headers.get('Content-Type') || '';
  return { status: response.status, ...(type.includes('json') ? await response.json() : { text: await response.text() }) };
}

const adminToken = await tokenFor('admin1', '13800000009');
const u1Token = await tokenFor('u1', '13800000001');
const u2Token = await tokenFor('u2', '13800000002');

/* ---------------- 码格式 ---------------- */
for (let i = 0; i < 20; i++) {
  const code = newBetaCode();
  assert.match(code, /^ATLAS-[A-Z0-9]{6}-[A-Z0-9]{6}$/, '内测码格式应为 ATLAS-XXXXXX-XXXXXX');
  assert.ok(!/[01IOL]/.test(code.slice(6)), '码面不应含易混字符 0/1/I/O/L');
}

/* ---------------- 管理台发码 ---------------- */
const denied = await call(adminPost, { method: 'POST', token: u1Token, body: { action: 'betaCodes.create', count: 2 } });
assert.equal(denied.status, 403, '普通用户不能发码');
const created = await call(adminPost, { method: 'POST', token: adminToken, body: { action: 'betaCodes.create', count: 3, note: '第一批内测' } });
assert.equal(created.status, 200, JSON.stringify(created));
assert.equal(created.codes.length, 3);
const [codeA, codeB] = created.codes;
const list = await call(adminGet, { url: 'https://example.test/api/admin?action=betaCodes', token: adminToken });
assert.equal(list.betaCodes.length, 3);
assert.equal(list.betaCodes.find(c => c.code === codeA).usedBy, null, '新码应为未使用');

/* ---------------- 兑换前：me 口径 ---------------- */
const meBefore = await call(authMe, { token: u1Token });
assert.equal(meBefore.user.edition, 'normal', '未兑换账号应为普通版');
const meAdmin = await call(authMe, { token: adminToken });
assert.equal(meAdmin.user.edition, 'beta', '管理员按内测版口径');

/* ---------------- 兑换：错码 / 无效码 ---------------- */
const badFormat = await call(betaPost, { method: 'POST', token: u1Token, body: { code: 'ATLAS-123' } });
assert.equal(badFormat.status, 400);
assert.match(badFormat.error, /格式不正确/);
const notFound = await call(betaPost, { method: 'POST', token: u1Token, body: { code: 'ATLAS-ZZZZZZ-ZZZZZZ' } });
assert.equal(notFound.status, 400);
assert.match(notFound.error, /无效/);
const noLogin = await call(betaPost, { method: 'POST', body: { code: codeA } });
assert.equal(noLogin.status, 401, '未登录不能兑换');

/* ---------------- 兑换：成功后 edition 翻转 ---------------- */
const redeemed = await call(betaPost, { method: 'POST', token: u1Token, body: { code: codeA.toLowerCase() } }); // 大小写不敏感
assert.equal(redeemed.status, 200, JSON.stringify(redeemed));
assert.equal(redeemed.edition, 'beta');
const u1Row = sql.prepare('SELECT edition FROM users WHERE phone=?').get('13800000001');
assert.equal(u1Row.edition, 'beta', '兑换成功后 users.edition 应落库为 beta');
const codeRow = sql.prepare('SELECT used_by FROM platform_beta_codes WHERE code=?').get(codeA);
assert.equal(codeRow.used_by, '13800000001', '码应标记为被兑换者占用');
const meAfter = await call(authMe, { token: u1Token });
assert.equal(meAfter.user.edition, 'beta', '兑换后 me 应返回内测版');
const betaState = await call(betaGet, { token: u1Token });
assert.equal(betaState.edition, 'beta');

/* ---------------- 兑换：已用码与幂等 ---------------- */
const stolen = await call(betaPost, { method: 'POST', token: u2Token, body: { code: codeA } });
assert.equal(stolen.status, 400);
assert.match(stolen.error, /已被使用/, '别人用过的码不能再兑');
const again = await call(betaPost, { method: 'POST', token: u1Token, body: { code: codeA } });
assert.equal(again.status, 200, '本人重复提交同一码应幂等成功');
assert.equal(again.already, true);
const second = await call(betaPost, { method: 'POST', token: u2Token, body: { code: codeB } });
assert.equal(second.status, 200, '第二个码可由另一账号正常兑换');

/* ---------------- 中间件门禁 ---------------- */
const ASSET = 'window.QUESTIONS_ASSET';
const PAPERS = 'window.PAPERS={"real":[{"title":"2009 数学一 真题"}],"mock":[{"title":"2026 李林六套卷（数一）"}]};\n';
async function gate(path, token) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  const request = new Request('https://example.test' + path, { headers });
  const response = await middleware({ request, env, next: async () => new Response(path === '/assets/papers.js' ? PAPERS : ASSET, { status: 200 }) });
  return { status: response.status, text: await response.text() };
}

// 全量题库分片：游客 401、普通版 403、内测/管理员放行
assert.equal((await gate('/assets/questions/math.js', null)).status, 401, '游客不能拿全量分片');
assert.equal((await gate('/assets/questions/math.js', u2Token)).status, 200, 'u2 已兑换内测应放行'); // u2 在上面已兑换 codeB
const u3Token = await (async () => {
  sql.prepare('INSERT INTO users (phone,id,nickname,salt,hash,iterations,created_at) VALUES (?,?,?,?,?,?,?)')
    .run('13800000003', 'u3', '纯普通版', 's', 'h', 1000, now);
  return tokenFor('u3', '13800000003');
})();
assert.equal((await gate('/assets/questions/math.js', u3Token)).status, 403, '普通版不能拿全量分片');
assert.equal((await gate('/assets/questions/math.js', adminToken)).status, 200, '管理员可拿全量分片');
// 公开分片（只真题）：登录用户照常，开放期游客也可达
assert.equal((await gate('/assets/questions-guest/math.js', u3Token)).status, 200);
assert.equal((await gate('/assets/questions-guest/math.js', null)).status, 200);
// 内部资料路径（肖1000 原页）：普通版 403、内测放行
assert.equal((await gate('/content/x1000-pages/p1.png', u3Token)).status, 403);
assert.equal((await gate('/content/x1000-pages/p1.png', u1Token)).status, 200);
// 套卷清单：普通版拿到的是过滤版（mock 清空），内测拿全量
const papersNormal = await gate('/assets/papers.js', u3Token);
assert.equal(papersNormal.status, 200);
const parsedNormal = JSON.parse(papersNormal.text.match(/window\.PAPERS=(\{[\s\S]*\});?\s*$/)[1]);
assert.equal(parsedNormal.mock.length, 0, '普通版套卷清单不应含模拟卷');
assert.equal(parsedNormal.real.length, 1, '真题卷清单保留');
const papersBeta = await gate('/assets/papers.js', u1Token);
assert.match(papersBeta.text, /李林六套卷/, '内测版套卷清单保留模拟卷');
const papersGuest = await gate('/assets/papers.js', null);
assert.ok(!papersGuest.text.includes('李林'), '游客套卷清单同样过滤模拟卷');

console.log('beta edition gating and redemption checks passed');
