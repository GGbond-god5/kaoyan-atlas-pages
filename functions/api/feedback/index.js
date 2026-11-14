// POST /api/feedback 用户意见反馈：存 D1，并在配置了 RESEND_API_KEY 时直接发到站主邮箱。
import { ok, fail, readJson, clientIp } from "../../_lib/http.js";
import { getDb } from "../../_lib/db.js";
import { currentSession } from "../../_lib/security.js";
import { sendMail } from "../../_lib/smtp.js";

const TYPES = new Set(["功能建议", "内容勘误", "使用问题", "其他"]);
const MAX_MESSAGE = 4000;
const MAX_PER_HOUR = 5;
const DEFAULT_TO = "15398831795@163.com";

async function rateLimited(env, ip) {
  const db = await getDb(env);
  if (!db) return false;
  const since = Date.now() - 3600 * 1000;
  const row = await db
    .prepare("SELECT COUNT(*) AS n FROM feedback WHERE ip = ? AND created_at > ?")
    .bind(ip, since)
    .first();
  return (row?.n || 0) >= MAX_PER_HOUR;
}

async function deliver(env, { type, message, contact, uid, ip, at }) {
  const lines = [
    `类型：${type}`,
    `内容：${message}`,
    `联系方式：${contact || "未填写"}`,
    uid ? `用户：${uid}` : "用户：未登录",
    `来源 IP：${ip}`,
    `时间：${new Date(at).toISOString()}`,
  ];
  const subject = `考研大观反馈：${type}`;
  const text = lines.join("\n");
  const to = env.FEEDBACK_TO || DEFAULT_TO;

  // 首选：用自己的邮箱 SMTP 直发（163 授权码），和 KPL 项目同一套做法
  if (env.SMTP_USER && env.SMTP_PASS) {
    try {
      await sendMail({
        host: env.SMTP_HOST || "smtp.163.com",
        port: Number(env.SMTP_PORT || 465),
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
        from: env.SMTP_FROM || env.SMTP_USER,
        to,
        subject,
        text,
      });
      return { mailed: true };
    } catch (err) {
      console.error("[feedback] SMTP 发送失败", err && err.message);
      return { mailed: false, reason: "邮件发送失败" };
    }
  }

  // 次选：HTTP 发信服务
  const key = env.RESEND_API_KEY;
  if (!key) return { mailed: false, reason: "未配置发信服务" };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.FEEDBACK_FROM || "考研大观 <onboarding@resend.dev>",
        to: [to],
        subject,
        text,
      }),
    });
    if (!res.ok) {
      console.error("[feedback] 发信失败", res.status, (await res.text()).slice(0, 200));
      return { mailed: false, reason: "邮件服务返回错误" };
    }
    return { mailed: true };
  } catch (err) {
    console.error("[feedback] 发信异常", err);
    return { mailed: false, reason: "邮件服务暂不可用" };
  }
}

export async function onRequestPost({ request, env }) {
  const body = await readJson(request);
  if (!body) return fail(400, "请求格式不正确");

  const type = TYPES.has(body.type) ? body.type : "其他";
  const message = String(body.message || "").trim();
  const contact = String(body.contact || "").trim().slice(0, 120);
  if (message.length < 2) return fail(400, "请先写点内容");
  if (message.length > MAX_MESSAGE) return fail(400, `内容请控制在 ${MAX_MESSAGE} 字以内`);

  const ip = clientIp(request);
  const session = await currentSession(request, env).catch(() => null);
  const uid = session && typeof session.uid === "string" ? session.uid : null;

  try {
    if (await rateLimited(env, ip)) return fail(429, "反馈太频繁了，请稍后再试");
  } catch (e) {
    // 限流查询失败不应该挡住反馈，继续投递
  }

  const at = Date.now();
  const result = await deliver(env, { type, message, contact, uid, ip, at });

  try {
    const db = await getDb(env);
    if (db) {
      await db
        .prepare(
          "INSERT INTO feedback (uid, type, message, contact, ip, mailed, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(uid, type, message, contact, ip, result.mailed ? 1 : 0, at)
        .run();
    }
  } catch (err) {
    console.error("[feedback] 写入失败", err);
    if (!result.mailed) return fail(503, "反馈暂存失败，请稍后再试");
  }

  return ok({ mailed: !!result.mailed, hint: result.mailed ? null : result.reason || null });
}
