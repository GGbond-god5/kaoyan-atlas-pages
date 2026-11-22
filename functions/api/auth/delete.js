// POST /api/auth/delete  { password } —— 注销账号：删除账号与全部个人数据，不可恢复
import { ok, fail, readJson } from "../../_lib/http.js";
import { getUser } from "../../_lib/db.js";
import { ownsUserObjectKey } from "../../_lib/object-keys.js";
import {
  currentSession,
  hashPassword,
  safeEqual,
  clearedCookie,
  isSecureRequest,
  normalizedSessionVersion,
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
  "platform_grading_claims",
  "platform_coach",
  "platform_subjects",
  "platform_usage",
  "platform_shares",
  "platform_wrongbook_exports",
  "platform_posts",
  "feedback",
];

async function rowsOf(db, sql, ...args) {
  try {
    return (await db.prepare(sql).bind(...args).all()).results || [];
  } catch {
    return [];
  }
}

async function exec(db, sql, ...args) {
  try {
    await db.prepare(sql).bind(...args).run();
  } catch {
    // 表不存在（从未用过对应功能）时跳过。
  }
}


async function deleteOwnedRelations(db, uid) {
  // 先按“我发布的内容”清理楼中楼，再按 uid 清理我自己的点赞与评论。
  const shares = await rowsOf(db, "SELECT id FROM platform_shares WHERE uid = ?", uid);
  for (const share of shares) {
    await exec(db, "DELETE FROM platform_share_likes WHERE share_id = ?", share.id);
    await exec(db, "DELETE FROM platform_share_comments WHERE share_id = ?", share.id);
  }
  await exec(db, "DELETE FROM platform_share_likes WHERE uid = ?", uid);
  await exec(db, "DELETE FROM platform_share_comments WHERE uid = ?", uid);

  const posts = await rowsOf(db, "SELECT id FROM platform_posts WHERE uid = ?", uid);
  for (const post of posts) {
    await exec(db, "DELETE FROM platform_post_likes WHERE post_id = ?", post.id);
    await exec(db, "DELETE FROM platform_post_comments WHERE post_id = ?", post.id);
  }
  await exec(db, "DELETE FROM platform_post_likes WHERE uid = ?", uid);
  await exec(db, "DELETE FROM platform_post_comments WHERE uid = ?", uid);
}

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
  if (user.id !== session.uid || user.banned || normalizedSessionVersion(session.sv) !== normalizedSessionVersion(user.session_version)) {
    return fail(401, "登录状态已失效，请重新登录");
  }

  const hash = await hashPassword(password, user.salt, user.iterations);
  if (!safeEqual(hash, user.hash)) return fail(403, "密码不正确，注销已取消");

  const uid = user.id;
  const db = env.DB;

  // 先删 R2：只删除本人拥有的对象。社区导入文件指向分享者的同一个 R2 对象，
  // 不能因为导入者注销就误删原分享者的资料。
  if (env.LIBRARY_FILES) {
    try {
      const files = await rowsOf(db, "SELECT object_key FROM platform_files WHERE uid = ?", uid);
      for (const f of files) {
        if (ownsUserObjectKey(uid, f.object_key)) {
          await env.LIBRARY_FILES.delete(f.object_key).catch(() => {});
        }
      }

      const avatarKey = `avatars/${uid}`;
      await env.LIBRARY_FILES.delete(avatarKey).catch(() => {});

      const prefixes = [`library/${uid}/`, `${uid}/`, `${uid}-`];
      const deleted = new Set();
      for (const prefix of prefixes) {
        let cursor;
        do {
          const listed = await env.LIBRARY_FILES.list({ prefix, cursor, limit: 100 });
          for (const obj of listed.objects || []) {
            if (deleted.has(obj.key) || !ownsUserObjectKey(uid, obj.key)) continue;
            deleted.add(obj.key);
            await env.LIBRARY_FILES.delete(obj.key).catch(() => {});
          }
          cursor = listed.truncated ? listed.cursor : undefined;
        } while (cursor);
      }
    } catch (err) {
      console.error("[auth] 注销时清理 R2 失败（继续删库）", err);
    }
  }

  await deleteOwnedRelations(db, uid);

  for (const table of UID_TABLES) {
    await exec(db, `DELETE FROM ${table} WHERE uid = ?`, uid);
  }
  await exec(db, "DELETE FROM codes WHERE phone = ?", user.phone);
  await exec(db, "DELETE FROM login_fail WHERE phone = ?", user.phone);
  await exec(db, "DELETE FROM sms_send WHERE phone = ?", user.phone);
  // 保留邀请码“已使用”的审计状态，但不继续保存注销用户的手机号。
  await exec(db, "UPDATE platform_invites SET used_by = '' WHERE used_by = ?", user.phone);
  await db.prepare("DELETE FROM users WHERE phone = ?").bind(user.phone).run();

  // 中间件会按 users 表校验会话，用户行删除后旧令牌立即失效。
  return ok({ deleted: true }, 200, { "Set-Cookie": clearedCookie(isSecureRequest(request)) });
}
