// GET /api/announcement —— 当前站点公告（登录后可读，中间件已拦未登录）
import { ok } from "../_lib/http.js";
import { getMeta } from "../_lib/layer1.js";

export async function onRequestGet({ env }) {
  const text = await getMeta(env, "announcement");
  return ok({ announcement: text || "" }, 200, { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" });
}
