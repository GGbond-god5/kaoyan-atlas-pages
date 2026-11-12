// POST /api/sms/send  { phone, scene: 'register' | 'login' }
import { ok, fail, readJson, PHONE_RE, clientIp } from "../../_lib/http.js";
import { getUser, lastSendAt, countPhoneSends, countIpSends, noteSend, putCodeState, pruneSends } from "../../_lib/db.js";
import { sendVerifyCode, smsMode } from "../../_lib/sms.js";
import { sha256Hex } from "../../_lib/security.js";

const RESEND_SECONDS = 60;
const TTL_MS = 5 * 60 * 1000;

/** 北京时间当天 0 点的时间戳 */
function startOfDayCN() {
  const now = Date.now();
  const offset = 8 * 3600 * 1000;
  return Math.floor((now + offset) / 86400000) * 86400000 - offset;
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return fail(503, "数据库未就绪，请检查 Pages 的 D1 绑定（变量名应为 DB）");

  const body = await readJson(request);
  if (!body) return fail(400, "请求格式不正确");

  const phone = String(body.phone || "").trim();
  const scene = body.scene === "login" ? "login" : "register";
  if (!PHONE_RE.test(phone)) return fail(400, "请输入正确的 11 位手机号");

  let user;
  try {
    user = await getUser(env, phone);
  } catch {
    return fail(503, "数据库未就绪，请检查 Pages 的 D1 绑定（变量名应为 DB）");
  }
  if (scene === "register" && user) return fail(409, "该手机号已注册，请直接登录");
  if (scene === "login" && !user) return fail(404, "该手机号还没有注册，请先注册");

  // 同一号码 60 秒一条
  const last = await lastSendAt(env, phone);
  const wait = RESEND_SECONDS - Math.floor((Date.now() - last) / 1000);
  if (last && wait > 0) return fail(429, `请 ${wait} 秒后再获取验证码`, { retryAfter: wait });

  // 每日上限：单号码 10 条、单 IP 20 条（阿里云侧也有默认限制）
  const phoneDaily = Number(env.SMS_PHONE_DAILY_LIMIT || 10);
  const ipDaily = Number(env.SMS_IP_DAILY_LIMIT || 20);
  const dayStart = startOfDayCN();
  if ((await countPhoneSends(env, phone, dayStart)) >= phoneDaily) {
    return fail(429, "该手机号今日获取验证码次数已达上限，请明天再试");
  }
  const ip = clientIp(request);
  if ((await countIpSends(env, ip, dayStart)) >= ipDaily) {
    return fail(429, "当前网络今日获取验证码次数已达上限，请明天再试");
  }

  let sent;
  try {
    sent = await sendVerifyCode(env, phone);
  } catch (err) {
    console.error("[sms] 发送失败", err.detail || err.message);
    return fail(502, err.userMessage || "短信发送失败，请稍后再试");
  }

  const hash =
    sent.mode === "mock"
      ? await sha256Hex(`${phone}:${sent.code}:${env.SESSION_SECRET || "atlas"}`)
      : "";

  try {
    await putCodeState(env, phone, { hash, scene, ttlMs: TTL_MS });
    await noteSend(env, { phone, ip, scene });
    if (Math.random() < 0.05) await pruneSends(env); // 5% 概率顺手清理旧记录
  } catch (err) {
    console.error("[db] 写入失败", err);
    return fail(503, "数据库写入失败，请稍后再试");
  }

  const payload = { ttl: Math.floor(TTL_MS / 1000), mode: sent.mode };
  // 只有显式打开 SMS_DEV_CODE=1 才把验证码回给前端，线上默认关闭
  if (sent.mode === "mock" && env.SMS_DEV_CODE === "1") payload.devCode = sent.code;

  return ok(payload);
}
