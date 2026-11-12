'use strict';
/**
 * 用户与验证码存储。
 *
 * 为了让学生项目「clone 下来就能跑」，这里用单个 JSON 文件做持久化，
 * 写入采用「临时文件 + rename」保证原子性。用户量上千以内完全够用。
 * 之后要换 MySQL / SQLite，只要保持下面导出的函数签名不变即可。
 */
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const CODE_TTL_MS = 5 * 60 * 1000; // 验证码 5 分钟有效

function blank() {
  return { version: 1, users: {}, codes: {}, quotas: {} };
}

let db = null;

function load() {
  if (db) return db;
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    db.users ||= {};
    db.codes ||= {};
    db.quotas ||= {};
  } catch {
    db = blank();
  }
  pruneCodes();
  return db;
}

function save() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = DB_FILE + '.' + process.pid + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

/** 中国时区的「今天」，用于每日配额 */
function dayKey(ts = Date.now()) {
  return new Date(ts + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function pruneCodes() {
  const now = Date.now();
  for (const [phone, rec] of Object.entries(db.codes)) {
    if (!rec || rec.expiresAt < now) delete db.codes[phone];
  }
}

/* ---------------- 用户 ---------------- */

function getUser(phone) {
  load();
  return db.users[phone] || null;
}

function createUser({ phone, nickname, salt, hash }) {
  load();
  if (db.users[phone]) throw new Error('USER_EXISTS');
  const user = {
    id: crypto.randomUUID(),
    phone,
    nickname,
    salt,
    hash,
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
  };
  db.users[phone] = user;
  save();
  return user;
}

function touchLogin(phone) {
  load();
  const user = db.users[phone];
  if (!user) return null;
  user.lastLoginAt = new Date().toISOString();
  save();
  return user;
}

/* ---------------- 验证码 ---------------- */

/** 只存哈希，不落明文验证码 */
function hashCode(phone, code) {
  return crypto
    .createHash('sha256')
    .update(`${phone}:${code}:${process.env.SESSION_SECRET || 'atlas'}`)
    .digest('hex');
}

function setCode(phone, code, scene, extra) {
  load();
  db.codes[phone] = {
    // pnvs 通道的验证码由阿里云生成，本地不存哈希，只存 OutId
    hash: code ? hashCode(phone, code) : '',
    provider: 'mock',
    outId: '',
    scene,
    sentAt: Date.now(),
    expiresAt: Date.now() + CODE_TTL_MS,
    attempts: 0,
    ...(extra || {}),
  };
  save();
  return db.codes[phone];
}

function getCode(phone) {
  load();
  const rec = db.codes[phone];
  if (!rec) return null;
  if (rec.expiresAt < Date.now()) {
    delete db.codes[phone];
    save();
    return null;
  }
  return rec;
}

function bumpAttempt(phone) {
  load();
  const rec = db.codes[phone];
  if (rec) {
    rec.attempts += 1;
    save();
  }
}

function clearCode(phone) {
  load();
  delete db.codes[phone];
  save();
}

/* ---------------- 配额 ---------------- */

/**
 * 计数并返回是否超限。key 形如 `phone:13800000000` 或 `ip:1.2.3.4`。
 */
function takeQuota(key, limit, windowMs = 0) {
  load();
  const today = dayKey();
  const rec = db.quotas[key];
  if (windowMs > 0) {
    // 短窗口（如 60 秒一次）
    if (rec && rec.lastAt && Date.now() - rec.lastAt < windowMs) {
      return { ok: false, retryAfter: Math.ceil((windowMs - (Date.now() - rec.lastAt)) / 1000) };
    }
  }
  if (!rec || rec.day !== today) {
    db.quotas[key] = { day: today, count: 1, lastAt: Date.now() };
  } else {
    if (rec.count >= limit) {
      return { ok: false, retryAfter: 0, dailyLimit: true };
    }
    rec.count += 1;
    rec.lastAt = Date.now();
  }
  save();
  return { ok: true };
}

function getQuota(key) {
  load();
  const rec = db.quotas[key];
  if (!rec || rec.day !== dayKey()) return 0;
  return rec.count;
}

module.exports = {
  DATA_DIR,
  DB_FILE,
  CODE_TTL_MS,
  getUser,
  createUser,
  touchLogin,
  setCode,
  getCode,
  bumpAttempt,
  clearCode,
  hashCode,
  takeQuota,
  getQuota,
};
