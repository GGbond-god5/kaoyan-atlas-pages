// POST /api/auth/logout
import { ok } from "../../_lib/http.js";
import { clearedCookie, isSecureRequest } from "../../_lib/security.js";

export async function onRequestPost({ request }) {
  return ok({}, 200, { "Set-Cookie": clearedCookie(isSecureRequest(request)) });
}
