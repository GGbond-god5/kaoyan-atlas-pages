'use strict';
/**
 * 口令哈希、会话令牌、Cookie 工具。
 * 全部基于 Node 内置 crypto，不用 bcrypt / jsonwebtoken。
 */
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', 'data');

const COOKIE_NAME = 'atlas_session';
const SESSION_DAYS = 7;

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/* ---------------- 会话密钥 ---------------- */

let cachedSecret = null;

function secret() {
  if (cachedSecret) return cachedSecret;
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) {
    cachedSecret = process.env.SESSION_SECRET;
    return cachedSecret;
  }
  const file = path.join(DATA_DIR, 'secret.key');
  try {
    cachedSecret = fs.readFileSync(file, 'utf8').trim();
  } catch {
    cachedSecret = crypto.randomBytes(32).toString('hex');
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(file, cachedSecret, { encoding: 'utf8', mode: 0o600 });
    console.log(`[auth] 已生成会话密钥 ${file}（换服务器记得一起带走，否则所有人会被登出）`);
  }
  return cachedSecret;
}

/* ---------------- 口令 ---------------- */

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64, SCRYPT).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, salt, hash) {
  try {
    const calc = crypto.scryptSync(password, salt, 64, SCRYPT);
    const saved = Buffer.from(hash, 'hex');
    if (calc.length !== saved.length) return false;
    return crypto.timingSafeEqual(calc, saved);
  } catch {
    return false;
  }
}

/* ---------------- 会话令牌 ---------------- */

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(str) {
  return Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

/** 无状态令牌：payload 里带 uid + 过期时间，服务端只需要一把密钥即可验证 */
function signToken({ uid, phone }) {
  const payload = {
    uid,
    phone,
    exp: Date.now() + SESSION_DAYS * 24 * 3600 * 1000,
  };
  const body = b64url(JSON.stringify(payload));
  const mac = b64url(crypto.createHmac('sha256', secret()).update(body).digest());
  return `${body}.${mac}`;
}

function verifyToken(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const expect = b64url(crypto.createHmac('sha256', secret()).update(body).digest());
  const a = Buffer.from(mac);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(unb64url(body).toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload.exp !== 'number' || payload.exp < Date.now()) return null;
  return payload;
}

/* ---------------- Cookie ---------------- */

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function setSessionCookie(res, token) {
  const secure = process.env.COOKIE_SECURE === '1' || process.env.NODE_ENV === 'production';
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_DAYS * 24 * 3600}`,
  ];
  if (secure) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(res) {
  const secure = process.env.COOKIE_SECURE === '1' || process.env.NODE_ENV === 'production';
  const parts = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (secure) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

/** 从请求里取出会话令牌：优先 Authorization: Bearer，其次 Cookie */
function tokenFromRequest(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  const cookies = parseCookies(req.headers.cookie);
  return cookies[COOKIE_NAME] || '';
}

/** 取出当前会话（没有就返回 null） */
function currentSession(req) {
  return verifyToken(tokenFromRequest(req));
}

module.exports = {
  COOKIE_NAME,
  SESSION_DAYS,
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  parseCookies,
  setSessionCookie,
  clearSessionCookie,
  tokenFromRequest,
  currentSession,
};
