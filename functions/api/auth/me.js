// GET /api/auth/me
import { ok, publicUser } from "../../_lib/http.js";
import { currentSession, clearedCookie, isSecureRequest, normalizedSessionVersion } from "../../_lib/security.js";
import { getUser } from "../../_lib/db.js";

export async function onRequestGet({ request, env }) {
  let session = null;
  try { session = await currentSession(request, env); } catch { /* 损坏 Cookie 按未登录处理 */ }
  if (!session) return ok({ user: null });

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
  return ok({ user: publicUser(user) });
}
