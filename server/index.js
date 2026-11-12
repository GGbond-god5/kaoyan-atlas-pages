'use strict';
/**
 * 考研科目大观 · 站点服务
 *
 *   npm install && npm start        →  http://127.0.0.1:3000
 *
 * 一套进程同时负责：
 *   1. 托管整个静态站点（替代 serve.py，顺带保留 /api/grade AI 评卷）
 *   2. 短信验证码发送  /api/sms/send
 *   3. 注册 / 登录 / 退出 / 当前用户
 */
const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const { loadEnv } = require('./lib/env');

const ROOT = path.resolve(__dirname, '..');
loadEnv(path.join(__dirname, '.env'));

// 注意：以下三个模块在 require 时会读取环境变量，必须放在 loadEnv 之后
const store = require('./lib/store');
const authLib = require('./lib/auth');
const sms = require('./lib/sms');
const { grade } = require('./lib/grade');

const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);

/* ---------------- 常量与工具 ---------------- */

const PHONE_RE = /^1[3-9]\d{9}$/;
const CODE_RE = /^\d{6}$/;

const LIMITS = {
  resendSeconds: 60,
  phoneDaily: Number(process.env.SMS_PHONE_DAILY_LIMIT || 10),
  ipDaily: Number(process.env.SMS_IP_DAILY_LIMIT || 20),
  maxCodeAttempts: 5,
  authPerMinute: 30,
};

const PUBLIC_MODE = process.env.NODE_ENV === 'production' || process.env.ATLAS_PUBLIC === '1';

function clientIp(req) {
  return String(req.ip || req.socket?.remoteAddress || '').replace(/^::ffff:/, '') || 'unknown';
}

function fail(res, status, error, extra) {
  res.status(status).json({ ok: false, error, ...(extra || {}) });
}

function ok(res, data) {
  res.json({ ok: true, ...(data || {}) });
}

function maskPhone(phone) {
  return phone.slice(0, 3) + '****' + phone.slice(-4);
}

function publicUser(user) {
  return {
    id: user.id,
    nickname: user.nickname,
    phone: maskPhone(user.phone),
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  };
}

/* ---------------- 简易限流（内存） ---------------- */

const buckets = new Map();
function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const hit = buckets.get(key);
  if (!hit || now - hit.start > windowMs) {
    buckets.set(key, { start: now, n: 1 });
    return { ok: true };
  }
  hit.n += 1;
  if (hit.n > limit) return { ok: false, retryAfter: Math.ceil((windowMs - (now - hit.start)) / 1000) };
  return { ok: true };
}
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of buckets) if (now - v.start > 10 * 60 * 1000) buckets.delete(k);
}, 60 * 1000).unref();

/** 最近一次发码时间，用于 60 秒重发间隔 */
const lastSend = new Map();

/** 口令错误锁定：5 次错误锁定 10 分钟 */
const loginFails = new Map();
function locked(phone) {
  const rec = loginFails.get(phone);
  if (!rec) return 0;
  if (rec.until > Date.now()) return Math.ceil((rec.until - Date.now()) / 60000);
  loginFails.delete(phone);
  return 0;
}
function noteFail(phone) {
  const rec = loginFails.get(phone) || { n: 0, until: 0 };
  rec.n += 1;
  if (rec.n >= 5) {
    rec.n = 0;
    rec.until = Date.now() + 10 * 60 * 1000;
  }
  loginFails.set(phone, rec);
}

/* ---------------- 验证码校验 ---------------- */

function safeEqualHex(a, b) {
  try {
    const x = Buffer.from(String(a), 'hex');
    const y = Buffer.from(String(b), 'hex');
    return x.length === y.length && crypto.timingSafeEqual(x, y);
  } catch {
    return false;
  }
}

/**
 * 校验验证码。成功返回 null，失败返回 { status, error }
 * pnvs 通道交给阿里云核验，dysms / mock 通道在本地比对哈希。
 */
async function checkCode(phone, code) {
  const rec = store.getCode(phone);
  if (!rec) return { status: 400, error: '验证码已过期，请重新获取' };
  if (rec.attempts >= LIMITS.maxCodeAttempts) {
    store.clearCode(phone);
    return { status: 429, error: '验证码错误次数过多，请重新获取' };
  }

  let passed;
  if (rec.provider === 'pnvs') {
    try {
      const r = await sms.verifyCode({ phone, code, outId: rec.outId });
      passed = r.ok;
    } catch (err) {
      console.error('[sms] 核验失败：', err.detail || err.message);
      return { status: 502, error: err.userMessage || '验证码校验服务暂时不可用，请稍后再试' };
    }
  } else {
    passed = safeEqualHex(rec.hash, store.hashCode(phone, code));
  }

  if (!passed) {
    store.bumpAttempt(phone);
    const left = LIMITS.maxCodeAttempts - store.getCode(phone).attempts;
    return { status: 400, error: `验证码不正确，还可以试 ${Math.max(left, 0)} 次` };
  }
  return null;
}

/* ---------------- 全局中间件 ---------------- */

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

if (process.env.CORS_ALLOW_ORIGIN) {
  // 前端在 Cloudflare Pages、接口在 ECS 时用得上：
  // CORS_ALLOW_ORIGIN=https://kaoyan-atlas.pages.dev
  app.use('/api', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ALLOW_ORIGIN);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Max-Age', '600');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });
}

app.use(express.json({ limit: '1mb' }));

app.use('/api', (req, res, next) => {
  const t = Date.now();
  res.on('finish', () => {
    if (req.path !== '/health') {
      console.log(`[api] ${req.method} ${req.originalUrl} → ${res.statusCode} ${Date.now() - t}ms`);
    }
  });
  next();
});

/* ---------------- 健康检查 ---------------- */

app.get('/api/health', (req, res) => {
  const mode = sms.mode();
  ok(res, {
    service: 'kaoyan-atlas',
    time: new Date().toISOString(),
    smsMode: mode,
    smsConfigured: sms.isConfigured(mode),
    smsMissing: sms.missing(mode),
    public: PUBLIC_MODE,
  });
});

/* ---------------- 发送验证码 ---------------- */

app.post('/api/sms/send', async (req, res) => {
  const phone = String(req.body?.phone || '').trim();
  const scene = req.body?.scene === 'login' ? 'login' : 'register';

  if (!PHONE_RE.test(phone)) return fail(res, 400, '请输入正确的 11 位手机号');

  const user = store.getUser(phone);
  if (scene === 'register' && user) return fail(res, 409, '该手机号已注册，请直接登录');
  if (scene === 'login' && !user) return fail(res, 404, '该手机号还没有注册，请先注册');

  // 每个 IP 每分钟最多 20 次请求，挡住脚本刷接口
  const ip = clientIp(req);
  if (!rateLimit(`send:${ip}`, 20, 60 * 1000).ok) {
    return fail(res, 429, '请求过于频繁，请稍后再试');
  }

  // 同一号码 60 秒内只能发一次
  const last = lastSend.get(phone) || 0;
  const wait = LIMITS.resendSeconds - Math.floor((Date.now() - last) / 1000);
  if (wait > 0) return fail(res, 429, `请 ${wait} 秒后再获取验证码`, { retryAfter: wait });

  // 同一个号码每天上限（阿里云侧也有默认 10 条/天）
  if (!store.takeQuota(`phone:${phone}`, LIMITS.phoneDaily).ok) {
    return fail(res, 429, '该手机号今日获取验证码次数已达上限，请明天再试');
  }
  if (!store.takeQuota(`ip:${ip}`, LIMITS.ipDaily).ok) {
    return fail(res, 429, '当前网络今日获取验证码次数已达上限，请明天再试');
  }

  lastSend.set(phone, Date.now());

  try {
    const sent = await sms.sendCode(phone);
    store.setCode(phone, sent.code || '', scene, {
      provider: sent.provider,
      outId: sent.outId || '',
    });
    const body = { ttl: Math.floor(store.CODE_TTL_MS / 1000), mode: sent.provider };
    // 只有 mock 模式才把验证码回给前端，方便本地演示；生产环境绝不返回
    if (sent.provider === 'mock' && process.env.NODE_ENV !== 'production') body.devCode = sent.code;
    console.log(`[sms] ${phone} 验证码已发送（${sent.provider}）`);
    ok(res, body);
  } catch (err) {
    store.clearCode(phone);
    lastSend.delete(phone);
    console.error('[sms] 发送失败：', err.detail || err.message);
    fail(res, 502, err.userMessage || '短信发送失败，请稍后再试');
  }
});

/* ---------------- 注册 ---------------- */

app.post('/api/auth/register', async (req, res) => {
  const phone = String(req.body?.phone || '').trim();
  const code = String(req.body?.code || '').trim();
  const nickname = String(req.body?.nickname || '').trim();
  const password = String(req.body?.password || '');

  if (!PHONE_RE.test(phone)) return fail(res, 400, '请输入正确的 11 位手机号');
  if (!CODE_RE.test(code)) return fail(res, 400, '请输入 6 位数字验证码');
  if (nickname.length < 2 || nickname.length > 16) return fail(res, 400, '昵称长度需为 2–16 个字符');
  if (/[\u0000-\u001f\u007f]/.test(nickname)) return fail(res, 400, '昵称包含非法字符');
  if (password.length < 8 || password.length > 32) return fail(res, 400, '密码长度需为 8–32 位');
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return fail(res, 400, '密码需同时包含字母和数字');
  }
  if (store.getUser(phone)) return fail(res, 409, '该手机号已注册，请直接登录');

  const ip = clientIp(req);
  if (!rateLimit(`auth:${ip}`, LIMITS.authPerMinute, 60 * 1000).ok) {
    return fail(res, 429, '操作过于频繁，请稍后再试');
  }

  const bad = await checkCode(phone, code);
  if (bad) return fail(res, bad.status, bad.error);

  try {
    const { salt, hash } = authLib.hashPassword(password);
    const user = store.createUser({ phone, nickname, salt, hash });
    store.clearCode(phone);
    const token = authLib.signToken({ uid: user.id, phone: user.phone });
    authLib.setSessionCookie(res, token);
    console.log(`[auth] 新用户注册：${maskPhone(phone)} / ${nickname}`);
    ok(res, { user: publicUser(user), token });
  } catch (err) {
    console.error('[auth] 注册失败', err);
    fail(res, 500, '注册失败，请稍后再试');
  }
});

/* ---------------- 登录 ---------------- */

app.post('/api/auth/login', async (req, res) => {
  const phone = String(req.body?.phone || '').trim();
  const password = String(req.body?.password || '');
  const code = String(req.body?.code || '').trim();
  const useCode = Boolean(code) && !password;

  if (!PHONE_RE.test(phone)) return fail(res, 400, '请输入正确的 11 位手机号');

  const ip = clientIp(req);
  if (!rateLimit(`auth:${ip}`, LIMITS.authPerMinute, 60 * 1000).ok) {
    return fail(res, 429, '操作过于频繁，请稍后再试');
  }

  const mins = locked(phone);
  if (mins > 0) return fail(res, 429, `密码错误次数过多，请 ${mins} 分钟后再试`);

  const user = store.getUser(phone);
  if (!user) return fail(res, 404, '该手机号还没有注册，请先注册');

  if (useCode) {
    if (!CODE_RE.test(code)) return fail(res, 400, '请输入 6 位数字验证码');
    const bad = await checkCode(phone, code);
    if (bad) return fail(res, bad.status, bad.error);
    store.clearCode(phone);
  } else {
    if (!password) return fail(res, 400, '请输入密码');
    if (!authLib.verifyPassword(password, user.salt, user.hash)) {
      noteFail(phone);
      const lockedFor = locked(phone);
      if (lockedFor > 0) return fail(res, 429, `密码错误次数过多，请 ${lockedFor} 分钟后再试`);
      const left = 5 - ((loginFails.get(phone)?.n) || 0);
      return fail(res, 401, `手机号或密码不正确，还可以试 ${left} 次`);
    }
    loginFails.delete(phone);
  }

  store.touchLogin(phone);
  const token = authLib.signToken({ uid: user.id, phone: user.phone });
  authLib.setSessionCookie(res, token);
  console.log(`[auth] 登录成功：${maskPhone(phone)}（${useCode ? '验证码' : '密码'}）`);
  ok(res, { user: publicUser(store.getUser(phone)), token });
});

/* ---------------- 退出 / 当前用户 ---------------- */

app.post('/api/auth/logout', (req, res) => {
  authLib.clearSessionCookie(res);
  ok(res, {});
});

app.get('/api/auth/me', (req, res) => {
  const session = authLib.currentSession(req);
  if (!session) return ok(res, { user: null });
  const user = store.getUser(session.phone);
  if (!user || user.id !== session.uid) {
    authLib.clearSessionCookie(res);
    return ok(res, { user: null });
  }
  ok(res, { user: publicUser(user) });
});

/* ---------------- AI 评卷（保留原有能力） ---------------- */

app.post('/api/grade', async (req, res) => {
  const ip = clientIp(req);
  if (!rateLimit(`grade:${ip}`, 20, 60 * 1000).ok) {
    return fail(res, 429, '评卷请求过于频繁，请稍后再试');
  }
  try {
    const [status, body] = await grade(req.body || {});
    res.status(status).json(body);
  } catch (err) {
    console.error('[grade] 失败', err);
    fail(res, 500, '评卷服务异常');
  }
});

/* ---------------- 静态站点 ---------------- */

const BLOCKED = [
  /^\/server(\/|$)/i,
  /^\/data(\/|$)/i,
  /^\/src(\/|$)/i,
  /^\/content(\/|$)/i,
  /^\/functions(\/|$)/i,
  /^\/bank(\.html|\/|$)/i,
  /^\/serve\.py$/i,
  /^\/package(-lock)?\.json$/i,
  /^\/\.(claude|tmp|git)(\/|$)/i,
];

app.use((req, res, next) => {
  if (PUBLIC_MODE && BLOCKED.some((re) => re.test(req.path))) {
    return fail(res, 403, 'forbidden');
  }
  next();
});

app.use(
  express.static(ROOT, {
    index: 'index.html',
    extensions: ['html'],
    dotfiles: 'ignore',
    maxAge: 0,
  })
);

/* ---------------- 兜底 ---------------- */

app.use('/api', (req, res) => fail(res, 404, '接口不存在'));

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  console.error('[server]', err);
  if (err?.type === 'entity.too.large') return fail(res, 413, '请求体过大');
  if (err instanceof SyntaxError) return fail(res, 400, '请求格式不是合法 JSON');
  fail(res, 500, '服务器内部错误');
});

/* ---------------- 启动 ---------------- */

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';

const server = app.listen(PORT, HOST, () => {
  const mode = sms.mode();
  const lines = [
    '',
    '  考研科目大观 · 站点服务已启动',
    `  地址      http://${HOST === '0.0.0.0' ? '127.0.0.1' : HOST}:${PORT}`,
    `  模式      ${PUBLIC_MODE ? 'PUBLIC（私有目录已屏蔽）' : 'LOCAL（本地调试）'}`,
    `  短信      ${mode}${mode === 'mock' ? '  ← 验证码打印在本控制台，不会真发短信' : ''}`,
    `  数据      ${store.DB_FILE}`,
    '',
  ];
  console.log(lines.join('\n'));
  if (mode === 'mock') {
    console.log('  提示：填入阿里云 AK 与赠送签名、SMS_PROVIDER=pnvs 后即可真实发短信。');
    console.log('  自检：http://127.0.0.1:' + PORT + '/api/health\n');
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  端口 ${PORT} 已被占用。换一个：PORT=3001 npm start\n`);
    process.exit(1);
  }
  throw err;
});
