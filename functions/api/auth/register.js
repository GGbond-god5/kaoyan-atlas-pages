// POST /api/auth/register  { phone, code, nickname, password }
import { ok, fail, readJson, PHONE_RE, CODE_RE, publicUser } from "../../_lib/http.js";
import { getUser, createUser } from "../../_lib/db.js";
import { consumeCode } from "../../_lib/verify.js";
import {
  hashPassword,
  randomHex,
  iterations as pbkdf2Rounds,
  signSession,
  sessionCookie,
  isSecureRequest,
} from "../../_lib/security.js";
import { ensureLayer1, getInvite, markInviteUsed } from "../../_lib/layer1.js";

export async function onRequestPost({ request, env }) {
  if (!env.SESSION_SECRET) return fail(500, "站点配置缺失：未设置 SESSION_SECRET");

  const body = await readJson(request);
  if (!body) return fail(400, "请求格式不正确");

  const phone = String(body.phone || "").trim();
  const code = String(body.code || "").trim();
  const nickname = String(body.nickname || "").trim();
  const password = String(body.password || "");

  if (!PHONE_RE.test(phone)) return fail(400, "请输入正确的 11 位手机号");
  if (!CODE_RE.test(code)) return fail(400, "请输入 6 位数字验证码");
  if (nickname.length < 2 || nickname.length > 16) return fail(400, "昵称长度需为 2–16 个字符");
  if (/[\u0000-\u001f\u007f]/.test(nickname)) return fail(400, "昵称包含非法字符");
  if (password.length < 8 || password.length > 32) return fail(400, "密码长度需为 8–32 位");
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return fail(400, "密码需同时包含字母和数字");

  let existing;
  try {
    existing = await getUser(env, phone);
  } catch {
    return fail(503, "数据库未就绪，请检查 Pages 的 D1 绑定（变量名应为 DB）");
  }
  if (existing) return fail(409, "该手机号已注册，请直接登录");

  const bad = await consumeCode(env, phone, code);
  if (bad) return fail(bad.status, bad.error);

  // 邀请制（内测）：环境变量 INVITE_REQUIRED=1 时，注册必须持未使用的邀请码
  let inviteCode = "";
  if (env.INVITE_REQUIRED === "1") {
    inviteCode = String(body.invite || "").trim().toUpperCase();
    if (!inviteCode) return fail(400, "内测期间注册需要邀请码，请向管理员索取");
    try {
      await ensureLayer1(env);
      const inv = await getInvite(env, inviteCode);
      if (!inv || inv.used_by) return fail(403, "邀请码无效或已被使用");
    } catch {
      return fail(503, "邀请码校验失败，请稍后再试");
    }
  }

  const salt = randomHex(16);
  const rounds = pbkdf2Rounds(env);
  const hash = await hashPassword(password, salt, rounds);

  let user;
  try {
    user = await createUser(env, { phone, nickname, salt, hash, iterations: rounds });
  } catch (err) {
    // 并发注册同一号码时，主键冲突
    if (String(err.message || err).includes("UNIQUE")) return fail(409, "该手机号已注册，请直接登录");
    console.error("[auth] 注册失败", err);
    return fail(500, "注册失败，请稍后再试");
  }

  if (inviteCode) {
    try {
      await markInviteUsed(env, inviteCode, phone);
    } catch {
      // 标记失败不回滚注册，管理员可在后台核对邀请码列表
      console.error("[auth] 邀请码标记已用失败", inviteCode);
    }
  }

  const token = await signSession({ uid: user.id, phone }, env.SESSION_SECRET);
  return ok(
    { user: publicUser(user), token },
    200,
    { "Set-Cookie": sessionCookie(token, isSecureRequest(request)) }
  );
}
