// POST /api/auth/demo —— 一键进入评委体验账号
// 每次进入都会把体验数据重置为一份完整档案；受 DEMO_LOGIN 开关与每 IP 小时限流保护。
import { ok, fail, publicUser, clientIp } from '../../_lib/http.js';
import { demoVisitAllowed, seedDemoAccount, DEMO_PHONE } from '../../_lib/demo.js';
import { signSession, sessionCookie, isSecureRequest } from '../../_lib/security.js';
import { getUser, touchLogin } from '../../_lib/db.js';

export async function onRequestPost({ request, env }) {
  if (!env.SESSION_SECRET) return fail(500, '站点配置缺失：未设置 SESSION_SECRET');
  if (String(env.DEMO_LOGIN ?? '1') === '0' || String(env.DEMO_LOGIN).toLowerCase() === 'false') {
    return fail(403, '体验账号已关闭');
  }

  const visit = await demoVisitAllowed(env, clientIp(request));
  if (!visit.ok) {
    return fail(visit.status, visit.error, visit.retryAfter ? { retryAfter: visit.retryAfter } : {});
  }

  let user;
  try {
    user = await seedDemoAccount(env);
  } catch (err) {
    console.error('[demo] 初始化失败', err);
    return fail(500, err.message || '体验账号初始化失败，请稍后再试');
  }

  await touchLogin(env, DEMO_PHONE);
  const token = await signSession({ uid: user.id, phone: user.phone }, env.SESSION_SECRET);
  const fresh = await getUser(env, DEMO_PHONE);
  return ok(
    { user: publicUser(fresh || user), token, demo: true },
    200,
    { 'Set-Cookie': sessionCookie(token, isSecureRequest(request)) }
  );
}