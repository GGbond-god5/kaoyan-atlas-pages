// GET /api/auth/me
import { ok, publicUser } from "../../_lib/http.js";
import { currentSession, clearedCookie, isSecureRequest } from "../../_lib/security.js";
import { getUser } from "../../_lib/db.js";

export async function onRequestGet({ request, env }) {
  const session = await currentSession(request, env);
  if (!session) return ok({ user: null });

  let user = null;
  try {
    user = await getUser(env, session.phone);
  } catch {
    return ok({ user: null });
  }
  if (!user || user.id !== session.uid) {
    return ok({ user: null }, 200, { "Set-Cookie": clearedCookie(isSecureRequest(request)) });
  }
  return ok({ user: publicUser(user) });
}
