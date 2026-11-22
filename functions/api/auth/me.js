// GET /api/auth/me
import { ok, publicUser } from "../../_lib/http.js";
import { currentSession, clearedCookie, isSecureRequest, normalizedSessionVersion } from "../../_lib/security.js";
import { getUser } from "../../_lib/db.js";
import { ensureLayer1, effectiveEdition } from "../../_lib/layer1.js";

export async function onRequestGet({ request, env }) {
  let session = null;
  try { session = await currentSession(request, env); } catch { /* 损坏 Cookie 按未登录处理 */ }
  if (!session) return ok({ user: null });

  // edition 是题库分片选包与内部资料门禁的统一口径，前端从这里读（见 questions-loader）。
  // users.edition 列由 layer1 幂等补列，必须在读用户前先跑；补列失败按 normal 回退，不锁死 me。
  await ensureLayer1(env).catch(() => {});
  let user = null;
  try {
    user = await getUser(env, session.phone);
  } catch {
    return ok({ user: null });
  }
  const tokenVersion = normalizedSessionVersion(session.sv);
  const userVersion = normalizedSessionVersion(user && user.session_version);
  if (!user || user.id !== session.uid || user.banned || tokenVersion !== userVersion) {
    return ok({ user: null }, 200, { "Set-Cookie": clearedCookie(isSecureRequest(request)) });
  }
  return ok({ user: publicUser(user, effectiveEdition(env, user)) });
}
