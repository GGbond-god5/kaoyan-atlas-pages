// 第一层「内测地基」共享设施：新表、users 补列、AI 配额与记账、邀请码、站点元数据。
// 设计原则：全部 CREATE/ALTER 幂等且逐条 try/catch，任何一张表失败都不拖垮主流程；
// 配额检查失败（表异常）时放行而不是锁死全站，记账失败只记日志。
import { getDb } from "./db.js";

let ensured = false;

export async function ensureLayer1(env) {
  if (ensured) return;
  const db = await getDb(env);
  if (!db) return;
  const stmts = [
    `CREATE TABLE IF NOT EXISTS platform_usage (
       uid TEXT NOT NULL, day TEXT NOT NULL, kind TEXT NOT NULL,
       calls INTEGER NOT NULL DEFAULT 0, tokens INTEGER NOT NULL DEFAULT 0,
       PRIMARY KEY (uid, day, kind))`,
    `CREATE TABLE IF NOT EXISTS platform_invites (
       code TEXT PRIMARY KEY, note TEXT NOT NULL DEFAULT '',
       used_by TEXT, used_at TEXT, created_at TEXT NOT NULL)`,
    `CREATE TABLE IF NOT EXISTS platform_meta (
       key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
    `ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'`,
  ];
  for (const sql of stmts) {
    try {
      await db.prepare(sql).run();
    } catch {
      // 列已存在等情况忽略
    }
  }
  ensured = true;
}

/** 北京时间 YYYY-MM-DD */
export function dayCN(now = Date.now()) {
  const t = new Date(now + 8 * 3600 * 1000);
  const m = String(t.getUTCMonth() + 1).padStart(2, "0");
  const d = String(t.getUTCDate()).padStart(2, "0");
  return `${t.getUTCFullYear()}-${m}-${d}`;
}

/* ---------------- 管理员判定 ---------------- */

export function isAdminUser(env, user) {
  if (!user) return false;
  if (user.role === "admin") return true;
  const list = String(env?.ADMIN_PHONES || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.includes(user.phone);
}

/* ---------------- AI 配额与记账 ---------------- */

export const QUOTA_KINDS = ["grade", "coach", "extract"];

export function quotaLimit(env, kind) {
  const defaults = { grade: 30, coach: 60, extract: 20 };
  const envKey = { grade: "AI_GRADE_DAILY", coach: "AI_COACH_DAILY", extract: "AI_EXTRACT_DAILY" }[kind];
  const n = Number(env?.[envKey]);
  return Number.isFinite(n) && n > 0 ? n : defaults[kind] || 30;
}

export async function usageToday(env, uid, kind) {
  try {
    const db = await getDb(env);
    if (!db) return 0;
    const row = await db
      .prepare("SELECT calls FROM platform_usage WHERE uid = ? AND day = ? AND kind = ?")
      .bind(uid, dayCN(), kind)
      .first();
    return row?.calls || 0;
  } catch {
    return 0;
  }
}

/** 返回 null 表示放行；返回字符串表示拒绝原因（给用户看的中文提示） */
export async function checkQuota(env, user, kind) {
  if (!user || isAdminUser(env, user)) return null;
  try {
    await ensureLayer1(env);
    const used = await usageToday(env, user.id, kind);
    const limit = quotaLimit(env, kind);
    if (used >= limit) {
      const label = { grade: "AI 批改", coach: "AI 教练", extract: "AI 抽题" }[kind] || "AI 功能";
      return `今日${label}次数已达上限（${limit} 次），明天再来吧`;
    }
  } catch (err) {
    console.error("[layer1] 配额检查失败，放行", err);
  }
  return null;
}

export async function noteUsage(env, uid, kind, tokens = 0) {
  try {
    await ensureLayer1(env);
    const db = await getDb(env);
    if (!db) return;
    await db
      .prepare(
        `INSERT INTO platform_usage (uid, day, kind, calls, tokens) VALUES (?, ?, ?, 1, ?)
         ON CONFLICT(uid, day, kind) DO UPDATE SET calls = calls + 1, tokens = tokens + excluded.tokens`
      )
      .bind(uid, dayCN(), kind, Math.max(0, Math.floor(tokens) || 0))
      .run();
  } catch (err) {
    console.error("[layer1] 用量记账失败", err);
  }
}

/* ---------------- 邀请码 ---------------- */

const INVITE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // 去掉易混字符

export function newInviteCode() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let s = "";
  for (const b of bytes) s += INVITE_ALPHABET[b % INVITE_ALPHABET.length];
  return `KY-${s.slice(0, 4)}-${s.slice(4)}`;
}

export async function getInvite(env, code) {
  const db = await getDb(env);
  if (!db) return null;
  return db.prepare("SELECT * FROM platform_invites WHERE code = ?").bind(code).first();
}

export async function markInviteUsed(env, code, phone) {
  const db = await getDb(env);
  if (!db) return;
  await db
    .prepare("UPDATE platform_invites SET used_by = ?, used_at = ? WHERE code = ? AND used_by IS NULL")
    .bind(phone, new Date().toISOString(), code)
    .run();
}

/* ---------------- 站点元数据（公告等） ---------------- */

export async function getMeta(env, key) {
  try {
    await ensureLayer1(env);
    const db = await getDb(env);
    if (!db) return "";
    const row = await db.prepare("SELECT value FROM platform_meta WHERE key = ?").bind(key).first();
    return row?.value || "";
  } catch {
    return "";
  }
}

export async function setMeta(env, key, value) {
  await ensureLayer1(env);
  const db = await getDb(env);
  if (!db) return;
  await db
    .prepare(
      `INSERT INTO platform_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    )
    .bind(key, String(value || ""))
    .run();
}
