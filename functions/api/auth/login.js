// POST /api/auth/login  { phone, password } 或 { phone, code }
import { ok, fail, readJson, PHONE_RE, CODE_RE, publicUser } from "../../_lib/http.js";
import { getUser, touchLogin, lockedMinutes, noteLoginFail, clearLoginFail } from "../../_lib/db.js";
import { consumeCode } from "../../_lib/verify.js";
import { hashPassword, signSession, sessionCookie, safeEqual, isSecureRequest } from "../../_lib/security.js";

export async function onRequestPost({ request, env }) {
  if (!env.SESSION_SECRET) return fail(500, "站点配置缺失：未设置 SESSION_SECRET");

  const body = await readJson(request);
  if (!body) return fail(400, "请求格式不正确");

  const phone = String(body.phone || "").trim();
  const password = String(body.password || "");
  const code = String(body.code || "").trim();
  const useCode = Boolean(code) && !password;

  if (!PHONE_RE.test(phone)) return fail(400, "请输入正确的 11 位手机号");

  let user;
  try {
    user = await getUser(env, phone);
  } catch {
    return fail(503, "数据库未就绪，请检查 Pages 的 D1 绑定（变量名应为 DB）");
  }
  if (!user) return fail(404, "该手机号还没有注册，请先注册");

  if (useCode) {
    if (!CODE_RE.test(code)) return fail(400, "请输入 6 位数字验证码");
    const bad = await consumeCode(env, phone, code);
    if (bad) return fail(bad.status, bad.error);
  } else {
    if (!password) return fail(400, "请输入密码");
    const locked = await lockedMinutes(env, phone);
    if (locked > 0) return fail(429, `密码错误次数过多，请 ${locked} 分钟后再试`);

    const calc = await hashPassword(password, user.salt, user.iterations || 20000);
    if (!safeEqual(calc, user.hash)) {
      const left = await noteLoginFail(env, phone);
      if (left === 0) return fail(429, "密码错误次数过多，已锁定 10 分钟");
      return fail(401, `手机号或密码不正确，还可以试 ${left} 次`);
    }
    await clearLoginFail(env, phone);
  }

  await touchLogin(env, phone);
  const token = await signSession({ uid: user.id, phone }, env.SESSION_SECRET);
  const fresh = await getUser(env, phone);
  return ok(
    { user: publicUser(fresh || user), token },
    200,
    { "Set-Cookie": sessionCookie(token, isSecureRequest(request)) }
  );
}
