// D1（Cloudflare 的 SQLite）数据访问层
//
// 为什么用 D1 而不是 KV：KV 是最终一致的，注册完立刻刷新页面可能读不到刚写的用户，
// 表现为「注册成功后顶栏还是显示登录」。D1 是强一致的 SQLite，读写立即可见。
//
// 绑定名：DB。在 Cloudflare 控制台 Pages 项目 → Settings → Bindings → D1 database
// 里添加，或者在 wrangler.toml 里配置（见 docs/短信登录接入指南.md）。

let schemaReady = false;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
     phone TEXT PRIMARY KEY,
     id TEXT NOT NULL,
     nickname TEXT NOT NULL,
     salt TEXT NOT NULL,
     hash TEXT NOT NULL,
     iterations INTEGER NOT NULL DEFAULT 20000,
     created_at TEXT NOT NULL,
     last_login_at TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS sms_send (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     phone TEXT NOT NULL,
     ip TEXT,
     scene TEXT,
     created_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_sms_phone ON sms_send(phone, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_sms_ip ON sms_send(ip, created_at)`,
  // 验证码状态：pnvs 通道只用来记错误次数；mock 通道额外存哈希
  `CREATE TABLE IF NOT EXISTS codes (
     phone TEXT PRIMARY KEY,
     hash TEXT,
     scene TEXT,
     attempts INTEGER NOT NULL DEFAULT 0,
     expires_at INTEGER NOT NULL
   )`,
  // 密码错误次数，用于锁定 10 分钟
  `CREATE TABLE IF NOT EXISTS login_fail (
     phone TEXT PRIMARY KEY,
     n INTEGER NOT NULL DEFAULT 0,
     until INTEGER NOT NULL DEFAULT 0
   )`,
  // 意见反馈：即使发信服务不可用也留底
  `CREATE TABLE IF NOT EXISTS feedback (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     uid TEXT,
     type TEXT,
     message TEXT NOT NULL,
     contact TEXT,
     ip TEXT,
     mailed INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_feedback_ip ON feedback(ip, created_at)`,
];

/** 拿到 D1；没绑定返回 null 而不是抛错，方便 /api/health 里报告 */
export async function getDb(env) {
  const db = env?.DB;
  if (!db) return null;
  if (!schemaReady) {
    try {
      await db.batch(SCHEMA.map((sql) => db.prepare(sql)));
      schemaReady = true;
    } catch (err) {
      // 建表失败通常是权限或绑定问题，交给上层报告
      console.error("[db] 初始化表结构失败", err);
      throw err;
    }
  }
  return db;
}

/* ---------------- 用户 ---------------- */

export async function getUser(env, phone) {
  const db = await getDb(env);
  if (!db) return null;
  return db.prepare("SELECT * FROM users WHERE phone = ?").bind(phone).first();
}

export async function createUser(env, { phone, nickname, salt, hash, iterations }) {
  const db = await getDb(env);
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await db
    .prepare(
      "INSERT INTO users (phone, id, nickname, salt, hash, iterations, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(phone, id, nickname, salt, hash, iterations, createdAt)
    .run();
  return { phone, id, nickname, salt, hash, iterations, created_at: createdAt, last_login_at: null };
}

export async function touchLogin(env, phone) {
  const db = await getDb(env);
  if (!db) return;
  await db.prepare("UPDATE users SET last_login_at = ? WHERE phone = ?").bind(new Date().toISOString(), phone).run();
}

/* ---------------- 发送记录 / 限流 ---------------- */

export async function noteSend(env, { phone, ip, scene }) {
  const db = await getDb(env);
  if (!db) return;
  await db
    .prepare("INSERT INTO sms_send (phone, ip, scene, created_at) VALUES (?, ?, ?, ?)")
    .bind(phone, ip, scene, Date.now())
    .run();
}

export async function lastSendAt(env, phone) {
  const db = await getDb(env);
  if (!db) return 0;
  const row = await db
    .prepare("SELECT created_at FROM sms_send WHERE phone = ? ORDER BY created_at DESC LIMIT 1")
    .bind(phone)
    .first();
  return row?.created_at || 0;
}

export async function countPhoneSends(env, phone, sinceMs) {
  const db = await getDb(env);
  if (!db) return 0;
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM sms_send WHERE phone = ? AND created_at > ?")
    .bind(phone, sinceMs)
    .first();
  return row?.n || 0;
}

export async function countIpSends(env, ip, sinceMs) {
  const db = await getDb(env);
  if (!db) return 0;
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM sms_send WHERE ip = ? AND created_at > ?")
    .bind(ip, sinceMs)
    .first();
  return row?.n || 0;
}

/** 顺手清理 7 天前的发送记录，避免表无限增长 */
export async function pruneSends(env) {
  const db = await getDb(env);
  if (!db) return;
  await db.prepare("DELETE FROM sms_send WHERE created_at < ?").bind(Date.now() - 7 * 86400000).run();
  await db.prepare("DELETE FROM codes WHERE expires_at < ?").bind(Date.now()).run();
}

/* ---------------- 验证码状态 ---------------- */

export async function getCodeState(env, phone) {
  const db = await getDb(env);
  if (!db) return null;
  const row = await db.prepare("SELECT * FROM codes WHERE phone = ?").bind(phone).first();
  if (!row) return null;
  if (row.expires_at < Date.now()) {
    await db.prepare("DELETE FROM codes WHERE phone = ?").bind(phone).run();
    return null;
  }
  return row;
}

export async function putCodeState(env, phone, { hash = "", scene, ttlMs }) {
  const db = await getDb(env);
  if (!db) return;
  await db
    .prepare(
      `INSERT INTO codes (phone, hash, scene, attempts, expires_at) VALUES (?, ?, ?, 0, ?)
       ON CONFLICT(phone) DO UPDATE SET hash = excluded.hash, scene = excluded.scene,
         attempts = 0, expires_at = excluded.expires_at`
    )
    .bind(phone, hash, scene, Date.now() + ttlMs)
    .run();
}

export async function bumpCodeAttempt(env, phone) {
  const db = await getDb(env);
  if (!db) return 0;
  await db.prepare("UPDATE codes SET attempts = attempts + 1 WHERE phone = ?").bind(phone).run();
  const row = await db.prepare("SELECT attempts FROM codes WHERE phone = ?").bind(phone).first();
  return row?.attempts || 0;
}

export async function clearCodeState(env, phone) {
  const db = await getDb(env);
  if (!db) return;
  await db.prepare("DELETE FROM codes WHERE phone = ?").bind(phone).run();
}

/* ---------------- 登录失败锁定 ---------------- */

const LOCK_MS = 10 * 60 * 1000;
const MAX_FAILS = 5;

/** 返回还需锁定几分钟，0 表示没锁 */
export async function lockedMinutes(env, phone) {
  const db = await getDb(env);
  if (!db) return 0;
  const row = await db.prepare("SELECT until FROM login_fail WHERE phone = ?").bind(phone).first();
  if (!row || row.until < Date.now()) return 0;
  return Math.ceil((row.until - Date.now()) / 60000);
}

/** 记一次失败，返回剩余可尝试次数；返回 0 表示刚刚被锁定 */
export async function noteLoginFail(env, phone) {
  const db = await getDb(env);
  if (!db) return MAX_FAILS;
  const row = await db.prepare("SELECT n, until FROM login_fail WHERE phone = ?").bind(phone).first();
  // until=0 表示从未锁定，不能当成「锁定期已过」清零，否则失败次数永远停在 1
  let n = row && row.until > 0 && row.until < Date.now() ? 0 : row?.n || 0;
  n += 1;
  const until = n >= MAX_FAILS ? Date.now() + LOCK_MS : 0;
  if (n >= MAX_FAILS) n = 0;
  await db
    .prepare(
      `INSERT INTO login_fail (phone, n, until) VALUES (?, ?, ?)
       ON CONFLICT(phone) DO UPDATE SET n = excluded.n, until = excluded.until`
    )
    .bind(phone, n, until)
    .run();
  return n >= MAX_FAILS || until ? 0 : MAX_FAILS - n;
}

export async function clearLoginFail(env, phone) {
  const db = await getDb(env);
  if (!db) return;
  await db.prepare("DELETE FROM login_fail WHERE phone = ?").bind(phone).run();
}
