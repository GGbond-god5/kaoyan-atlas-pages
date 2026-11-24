// /api/admin —— 管理后台接口（仅管理员）
// 管理员判定：users.role = 'admin'，或手机号在环境变量 ADMIN_PHONES（逗号分隔）里。
// 引导：站长在 Cloudflare D1 控制台执行一次
//   UPDATE users SET role='admin' WHERE phone='站长手机号';
import { ok, fail, readJson, maskPhone } from "../../_lib/http.js";
import { getUser } from "../../_lib/db.js";
import { currentSession } from "../../_lib/security.js";
import {
  ensureLayer1,
  isAdminUser,
  dayCN,
  newInviteCode,
  newBetaCode,
  getMeta,
  setMeta,
} from "../../_lib/layer1.js";

async function requireAdmin(request, env) {
  if (!env.SESSION_SECRET) return { error: fail(500, "站点配置缺失：未设置 SESSION_SECRET") };
  const session = await currentSession(request, env);
  if (!session) return { error: fail(401, "请先登录") };
  await ensureLayer1(env);
  const user = await getUser(env, session.phone).catch(() => null);
  if (!user) return { error: fail(401, "账号不存在，请重新登录") };
  if (user.banned) return { error: fail(403, "账号已被封禁") };
  if (!isAdminUser(env, user)) return { error: fail(403, "无管理员权限") };
  return { user };
}

async function stats(env) {
  const db = env.DB;
  const day = dayCN();
  const total = await db.prepare("SELECT COUNT(*) AS n FROM users").first();
  const todayUsers = await db
    .prepare("SELECT COUNT(*) AS n FROM users WHERE created_at >= ?")
    .bind(`${day}T00:00:00`)
    .first()
    .catch(() => ({ n: 0 }));
  const usage = await db
    .prepare(
      "SELECT kind, COALESCE(SUM(calls),0) AS calls, COALESCE(SUM(tokens),0) AS tokens FROM platform_usage WHERE day = ? GROUP BY kind"
    )
    .bind(day)
    .all()
    .catch(() => ({ results: [] }));
  const dayStart = (() => {
    const offset = 8 * 3600 * 1000;
    return Math.floor((Date.now() + offset) / 86400000) * 86400000 - offset;
  })();
  const sms = await db
    .prepare("SELECT COUNT(*) AS n FROM sms_send WHERE created_at > ?")
    .bind(dayStart)
    .first()
    .catch(() => ({ n: 0 }));
  return {
    users: total?.n || 0,
    newUsersToday: todayUsers?.n || 0,
    aiToday: Object.fromEntries((usage.results || []).map((r) => [r.kind, { calls: r.calls, tokens: r.tokens }])),
    smsToday: sms?.n || 0,
  };
}

async function users(env) {
  const db = env.DB;
  const day = dayCN();
  const day7 = dayCN(Date.now() - 6 * 86400000);
  try {
    const rows = await db
      .prepare(
        `SELECT u.phone, u.nickname, u.created_at, u.last_login_at, u.last_active_at, u.banned, u.role, u.edition,
                COALESCE(SUM(p.calls),0) AS ai_calls_today,
                (SELECT COALESCE(SUM(calls),0) FROM platform_usage WHERE uid = u.id AND day >= ?) AS ai_calls_7d,
                (SELECT COUNT(*) FROM platform_attempts WHERE uid = u.id) AS attempts_total,
                (SELECT MAX(json_extract(data, '$.createdAt')) FROM platform_attempts WHERE uid = u.id) AS last_attempt_at
         FROM users u
         LEFT JOIN platform_usage p ON p.uid = u.id AND p.day = ?
         GROUP BY u.phone
         ORDER BY u.created_at DESC
         LIMIT 200`
      )
      .bind(day7, day)
      .all();
    return (rows.results || []).map((r) => ({
      phone: maskPhone(r.phone),
      phoneFull: r.phone,
      nickname: r.nickname,
      createdAt: r.created_at,
      lastLoginAt: r.last_login_at,
      lastActiveAt: r.last_active_at || null,
      banned: Boolean(r.banned),
      role: r.role || "user",
      edition: r.edition || "normal",
      aiCallsToday: r.ai_calls_today || 0,
      aiCalls7d: r.ai_calls_7d || 0,
      attemptsTotal: r.attempts_total || 0,
      lastAttemptAt: r.last_attempt_at || null,
    }));
  } catch {
    // platform_attempts 等表尚未创建（全新部署）时退回基础字段，保证用户列表可用
    const rows = await db
      .prepare(
        `SELECT u.phone, u.nickname, u.created_at, u.last_login_at, u.last_active_at, u.banned, u.role, u.edition,
                COALESCE(SUM(p.calls),0) AS ai_calls_today
         FROM users u
         LEFT JOIN platform_usage p ON p.uid = u.id AND p.day = ?
         GROUP BY u.phone
         ORDER BY u.created_at DESC
         LIMIT 200`
      )
      .bind(day)
      .all();
    return (rows.results || []).map((r) => ({
      phone: maskPhone(r.phone),
      phoneFull: r.phone,
      nickname: r.nickname,
      createdAt: r.created_at,
      lastLoginAt: r.last_login_at,
      lastActiveAt: r.last_active_at || null,
      banned: Boolean(r.banned),
      role: r.role || "user",
      edition: r.edition || "normal",
      aiCallsToday: r.ai_calls_today || 0,
      aiCalls7d: 0,
      attemptsTotal: 0,
      lastAttemptAt: null,
    }));
  }
}

/** 单个用户的使用记录：账号状态 + 最近套卷 + 近 14 天 AI 用量 + 资料/教练计数 */
async function userDetail(env, phone) {
  const db = env.DB;
  if (!phone) return null;
  const u = await db
    .prepare(
      "SELECT id, phone, nickname, created_at, last_login_at, last_active_at, banned, role, edition FROM users WHERE phone = ?"
    )
    .bind(phone)
    .first()
    .catch(() => null);
  if (!u) return null;
  const uid = u.id;
  // 套卷的批改状态与得分以 results 逐题结果为准（与学情分析同一口径）：
  // 存储 blob 里的 status/score 字段可能滞后，读时按 results 重算。
  const attRows = await db
    .prepare("SELECT id, data FROM platform_attempts WHERE uid = ?")
    .bind(uid)
    .all()
    .catch(() => ({ results: [] }));
  const parsed = [];
  let gradedPapers = 0;
  for (const r of attRows.results || []) {
    let obj = null;
    try { obj = JSON.parse(r.data); } catch { obj = null; }
    if (!obj) continue;
    const results = Object.values(obj.results || {}).filter((x) => x && typeof x === "object");
    const gradedQs = results.filter((x) => x.status === "graded");
    if (gradedQs.length) gradedPapers++;
    parsed.push({
      id: obj.id || r.id,
      createdAt: obj.createdAt || null,
      subject: obj.subject || "",
      mode: obj.mode || "",
      title: obj.questions?.[0]?.chapterTitle || "",
      totalQuestions: Array.isArray(obj.questions) ? obj.questions.length : 0,
      gradedQuestions: gradedQs.length,
      score: gradedQs.length ? gradedQs.reduce((s, x) => s + (Number(x.score) || 0), 0) : null,
      maxScore: gradedQs.length ? gradedQs.reduce((s, x) => s + (Number(x.maxScore) || 0), 0) : null,
    });
  }
  parsed.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const usage = await db
    .prepare("SELECT day, kind, calls, tokens FROM platform_usage WHERE uid = ? AND day >= ? ORDER BY day DESC, kind")
    .bind(uid, dayCN(Date.now() - 13 * 86400000))
    .all()
    .catch(() => ({ results: [] }));
  const filesTotal = await db
    .prepare("SELECT COUNT(*) AS n FROM platform_files WHERE uid = ?")
    .bind(uid)
    .first()
    .catch(() => ({ n: 0 }));
  const filesRecent = await db
    .prepare("SELECT name, subject, size, status, created_at FROM platform_files WHERE uid = ? ORDER BY created_at DESC LIMIT 5")
    .bind(uid)
    .all()
    .catch(() => ({ results: [] }));
  const coach = await db
    .prepare("SELECT COUNT(*) AS n FROM platform_coach WHERE uid = ?")
    .bind(uid)
    .first()
    .catch(() => ({ n: 0 }));
  return {
    account: {
      phone: maskPhone(u.phone),
      phoneFull: u.phone,
      nickname: u.nickname,
      createdAt: u.created_at,
      lastLoginAt: u.last_login_at,
      lastActiveAt: u.last_active_at || null,
      banned: Boolean(u.banned),
      role: u.role || "user",
      edition: u.edition || "normal",
    },
    attempts: {
      total: parsed.length,
      graded: gradedPapers,
      recent: parsed.slice(0, 12),
    },
    aiUsage: (usage.results || []).map((r) => ({ day: r.day, kind: r.kind, calls: r.calls || 0, tokens: r.tokens || 0 })),
    files: {
      total: filesTotal?.n || 0,
      recent: (filesRecent.results || []).map((r) => ({
        name: r.name,
        subject: r.subject || "",
        size: r.size || 0,
        status: r.status || "",
        createdAt: r.created_at,
      })),
    },
    coachCount: coach?.n || 0,
  };
}

async function betaCodesList(env) {
  const rows = await env.DB.prepare(
    "SELECT code, note, used_by, used_at, created_at FROM platform_beta_codes ORDER BY created_at DESC LIMIT 200"
  ).all();
  return (rows.results || []).map((r) => ({
    code: r.code,
    note: r.note || "",
    usedBy: r.used_by ? maskPhone(r.used_by) : null,
    usedAt: r.used_at,
    createdAt: r.created_at,
  }));
}

async function invitesList(env) {
  const rows = await env.DB.prepare(
    "SELECT code, note, used_by, used_at, created_at FROM platform_invites ORDER BY created_at DESC LIMIT 200"
  ).all();
  return (rows.results || []).map((r) => ({
    code: r.code,
    note: r.note || "",
    usedBy: r.used_by ? maskPhone(r.used_by) : null,
    usedAt: r.used_at,
    createdAt: r.created_at,
  }));
}

export async function onRequestGet({ request, env }) {
  const gate = await requireAdmin(request, env);
  if (gate.error) return gate.error;
  const action = new URL(request.url).searchParams.get("action") || "stats";
  try {
    if (action === "stats") return ok({ stats: await stats(env) });
    if (action === "users") return ok({ users: await users(env) });
    if (action === "userDetail") {
      const detail = await userDetail(env, new URL(request.url).searchParams.get("phone") || "");
      if (!detail) return fail(404, "用户不存在");
      return ok({ detail });
    }
    if (action === "invites") return ok({ invites: await invitesList(env) });
    if (action === "betaCodes") return ok({ betaCodes: await betaCodesList(env) });
    if (action === "announcement") return ok({ announcement: await getMeta(env, "announcement") });
    if (action === "workerToken") return ok({ set: !!(await getMeta(env, "worker_token")) || !!env.WORKER_TOKEN });
    return fail(400, "未知 action");
  } catch (err) {
    console.error("[admin] 查询失败", err);
    return fail(500, "查询失败，请稍后再试");
  }
}

export async function onRequestPost({ request, env }) {
  const gate = await requireAdmin(request, env);
  if (gate.error) return gate.error;
  const body = await readJson(request);
  if (!body) return fail(400, "请求格式不正确");
  const action = String(body.action || "");
  const db = env.DB;
  try {
    if (action === "ban" || action === "unban") {
      const phone = String(body.phone || "").trim();
      const target = await getUser(env, phone);
      if (!target) return fail(404, "用户不存在");
      if (target.phone === gate.user.phone) return fail(400, "不能对自己执行此操作");
      await db
        .prepare("UPDATE users SET banned = ? WHERE phone = ?")
        .bind(action === "ban" ? 1 : 0, phone)
        .run();
      return ok({ banned: action === "ban" });
    }
    if (action === "invites.create") {
      const count = Math.min(50, Math.max(1, Math.floor(Number(body.count) || 5)));
      const note = String(body.note || "").trim().slice(0, 40);
      const now = new Date().toISOString();
      const codes = [];
      for (let i = 0; i < count; i++) {
        const code = newInviteCode();
        await db
          .prepare("INSERT INTO platform_invites (code, note, created_at) VALUES (?, ?, ?)")
          .bind(code, note, now)
          .run();
        codes.push(code);
      }
      return ok({ codes });
    }
    if (action === "betaCodes.create") {
      const count = Math.min(50, Math.max(1, Math.floor(Number(body.count) || 5)));
      const note = String(body.note || "").trim().slice(0, 40);
      const now = new Date().toISOString();
      const codes = [];
      for (let i = 0; i < count; i++) {
        const code = newBetaCode();
        await db
          .prepare("INSERT INTO platform_beta_codes (code, note, created_at) VALUES (?, ?, ?)")
          .bind(code, note, now)
          .run();
        codes.push(code);
      }
      return ok({ codes });
    }
    if (action === "workerToken.set") {
      const token = String(body.token || "").trim();
      if (token.length < 24) return fail(400, "令牌至少 24 个字符");
      await setMeta(env, "worker_token", token);
      return ok({ set: true });
    }
    if (action === "announcement.set") {
      const text = String(body.text || "").trim().slice(0, 200);
      await setMeta(env, "announcement", text);
      return ok({ announcement: text });
    }
    return fail(400, "未知 action");
  } catch (err) {
    console.error("[admin] 操作失败", err);
    return fail(500, "操作失败，请稍后再试");
  }
}
