// GET /api/auth/export —— 导出当前账号的全部个人数据（JSON 下载）
import { fail, publicUser } from "../../_lib/http.js";
import { getUser } from "../../_lib/db.js";
import { currentSession } from "../../_lib/security.js";

async function rows(env, sql, ...binds) {
  try {
    const r = await env.DB.prepare(sql).bind(...binds).all();
    return r.results || [];
  } catch {
    return []; // 表还没建（从未用过对应功能）时按空处理
  }
}

function parse(v) {
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
}

export async function onRequestGet({ request, env }) {
  if (!env.SESSION_SECRET) return fail(500, "站点配置缺失：未设置 SESSION_SECRET");
  if (!env.DB) return fail(503, "数据库未就绪，请稍后再试");

  const session = await currentSession(request, env);
  if (!session) return fail(401, "请先登录");

  const user = await getUser(env, session.phone).catch(() => null);
  if (!user) return fail(401, "账号不存在，请重新登录");
  const uid = user.id;

  const [profile, states, attempts, results, questions, subjects, files, notes, coach] =
    await Promise.all([
      rows(env, "SELECT data, updated_at FROM user_profiles WHERE uid = ?", uid),
      rows(env, "SELECT namespace, data, revision FROM platform_state WHERE uid = ?", uid),
      rows(env, "SELECT id, data FROM platform_attempts WHERE uid = ?", uid),
      rows(env, "SELECT attempt_id, question_id, data FROM platform_results WHERE uid = ?", uid),
      rows(env, "SELECT file_id, draft_id, data FROM platform_questions WHERE uid = ?", uid),
      rows(env, "SELECT id, name, created_at FROM platform_subjects WHERE uid = ?", uid),
      rows(
        env,
        "SELECT id, name, subject, size, mime, status, created_at FROM platform_files WHERE uid = ?",
        uid
      ),
      rows(env, "SELECT id, chapter_id, title, type, markdown, created_at, updated_at FROM user_notes WHERE uid = ?", uid),
      rows(env, "SELECT id, data FROM platform_coach WHERE uid = ?", uid),
    ]);

  const data = {
    exportedAt: new Date().toISOString(),
    account: publicUser(user),
    profile: profile.length ? parse(profile[0].data) : null,
    state: Object.fromEntries(states.map((s) => [s.namespace, parse(s.data)])),
    attempts: attempts.map((a) => ({ id: a.id, ...parse(a.data) })),
    results: results.map((r) => ({ attemptId: r.attempt_id, questionId: r.question_id, ...parse(r.data) })),
    personalQuestions: questions.map((q) => parse(q.data)),
    customSubjects: subjects,
    libraryFiles: files,
    notes,
    coachHistory: coach.map((c) => parse(c.data)),
  };

  return new Response(JSON.stringify(data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": `attachment; filename="kaoyan-atlas-export-${uid.slice(0, 8)}.json"`,
    },
  });
}
