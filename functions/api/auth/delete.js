// POST /api/auth/delete  { password } —— 注销账号：删除账号与全部个人数据，不可恢复
import { ok, fail, readJson } from "../../_lib/http.js";
import { getUser } from "../../_lib/db.js";
import {
  currentSession,
  hashPassword,
  safeEqual,
  clearedCookie,
  isSecureRequest,
} from "../../_lib/security.js";

const UID_TABLES = [
  "user_profiles",
  "user_notes",
  "platform_files",
  "platform_drafts",
  "platform_extractions",
  "platform_questions",
  "platform_state",
  "platform_attempts",
  "platform_results",
  "platform_coach",
  "platform_subjects",
  "platform_usage",
  "feedback",
];

export async function onRequestPost({ request, env }) {
  if (!env.SESSION_SECRET) return fail(500, "站点配置缺失：未设置 SESSION_SECRET");
  if (!env.DB) return fail(503, "数据库未就绪，请稍后再试");

  const session = await currentSession(request, env);
  if (!session) return fail(401, "请先登录");

  const body = await readJson(request);
  if (!body) return fail(400, "请求格式不正确");
  const password = String(body.password || "");

  const user = await getUser(env, session.phone).catch(() => null);
  if (!user) return fail(401, "账号不存在，请重新登录");

  const hash = await hashPassword(password, user.salt, user.iterations);
  if (!safeEqual(hash, user.hash)) return fail(403, "密码不正确，注销已取消");

  const uid = user.id;
  const db = env.DB;

  // 先删 R2 文件：资料库文件按 object_key，笔记附件按 uid 前缀
  if (env.LIBRARY_FILES) {
    try {
      const files = await db
        .prepare("SELECT object_key FROM platform_files WHERE uid = ?")
        .bind(uid)
        .all()
        .catch(() => ({ results: [] }));
      for (const f of files.results || []) {
        if (f.object_key) await env.LIBRARY_FILES.delete(f.object_key).catch(() => {});
      }
      let cursor;
      do {
        const listed = await env.LIBRARY_FILES.list({ prefix: `${uid}/`, cursor, limit: 100 });
        for (const obj of listed.objects || []) {
          await env.LIBRARY_FILES.delete(obj.key).catch(() => {});
        }
        cursor = listed.truncated ? listed.cursor : undefined;
      } while (cursor);
    } catch (err) {
      console.error("[auth] 注销时清理 R2 失败（继续删库）", err);
    }
  }

  for (const table of UID_TABLES) {
    await db
      .prepare(`DELETE FROM ${table} WHERE uid = ?`)
      .bind(uid)
      .run()
      .catch(() => {}); // 表不存在（从未用过对应功能）时跳过
  }
  await db.prepare("DELETE FROM codes WHERE phone = ?").bind(user.phone).run().catch(() => {});
  await db.prepare("DELETE FROM login_fail WHERE phone = ?").bind(user.phone).run().catch(() => {});
  await db.prepare("DELETE FROM sms_send WHERE phone = ?").bind(user.phone).run().catch(() => {});
  await db.prepare("DELETE FROM users WHERE phone = ?").bind(user.phone).run();

  // 中间件会按 users 表校验会话，用户行删除后旧令牌立即失效
  return ok({ deleted: true }, 200, { "Set-Cookie": clearedCookie(isSecureRequest(request)) });
}
