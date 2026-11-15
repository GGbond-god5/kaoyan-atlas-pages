// POST /api/auth/password  { oldPassword, newPassword } —— 登录状态下修改密码
import { ok, fail, readJson } from "../../_lib/http.js";
import { getUser } from "../../_lib/db.js";
import {
  currentSession,
  hashPassword,
  randomHex,
  iterations as pbkdf2Rounds,
  safeEqual,
} from "../../_lib/security.js";

export async function onRequestPost({ request, env }) {
  if (!env.SESSION_SECRET) return fail(500, "站点配置缺失：未设置 SESSION_SECRET");

  const session = await currentSession(request, env);
  if (!session) return fail(401, "请先登录");

  const body = await readJson(request);
  if (!body) return fail(400, "请求格式不正确");

  const oldPassword = String(body.oldPassword || "");
  const newPassword = String(body.newPassword || "");
  if (newPassword.length < 8 || newPassword.length > 32) return fail(400, "新密码长度需为 8–32 位");
  if (!/[A-Za-z]/.test(newPassword) || !/\d/.test(newPassword)) return fail(400, "新密码需同时包含字母和数字");
  if (newPassword === oldPassword) return fail(400, "新密码不能与旧密码相同");

  let user;
  try {
    user = await getUser(env, session.phone);
  } catch {
    return fail(503, "数据库未就绪，请稍后再试");
  }
  if (!user) return fail(401, "账号不存在，请重新登录");

  const oldHash = await hashPassword(oldPassword, user.salt, user.iterations);
  if (!safeEqual(oldHash, user.hash)) return fail(403, "旧密码不正确");

  const salt = randomHex(16);
  const rounds = pbkdf2Rounds(env);
  const hash = await hashPassword(newPassword, salt, rounds);
  const db = env.DB;
  await db
    .prepare("UPDATE users SET salt = ?, hash = ?, iterations = ? WHERE phone = ?")
    .bind(salt, hash, rounds, user.phone)
    .run();

  // 会话是无状态令牌，改密后已登录设备仍保持登录；如需强制下线请在各设备退出登录。
  return ok({ changed: true });
}
