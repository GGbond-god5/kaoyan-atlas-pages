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
  const rows = await db
    .prepare(
      `SELECT u.phone, u.nickname, u.created_at, u.last_login_at, u.banned, u.role,
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
    banned: Boolean(r.banned),
    role: r.role || "user",
    aiCallsToday: r.ai_calls_today || 0,
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
    if (action === "invites") return ok({ invites: await invitesList(env) });
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
