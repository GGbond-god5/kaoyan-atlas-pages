// /api/community —— 社区共享（第三层：内容共建）
// 用户把自己的一份资料（platform_files）分享到广场；分享连带该资料已导入的个人题目。
// 导入不复制文件本体：给导入者建一条指向同一 R2 对象的资料记录（id = share-<分享id>）；
// 题目逐条复制并换新 draftId / id，避免与导入者已有题目冲突。分享者删原资料后，导入的题目仍在，
// 但原文件记录会因对象缺失而打不开（file 接口会 404），广场条目也会在读取时被过滤。
import { ok, fail, readJson } from "../../_lib/http.js";
import { getDb, getUser } from "../../_lib/db.js";
import { currentSession } from "../../_lib/security.js";
import { ensureLayer1 } from "../../_lib/layer1.js";

async function requireUser(request, env) {
  if (!env.SESSION_SECRET) return { error: fail(500, "站点配置缺失：未设置 SESSION_SECRET") };
  const session = await currentSession(request, env);
  if (!session) return { error: fail(401, "请先登录") };
  await ensureLayer1(env);
  const user = await getUser(env, session.phone).catch(() => null);
  if (!user) return { error: fail(401, "账号不存在，请重新登录") };
  if (user.banned) return { error: fail(403, "账号已被封禁") };
  return { user };
}

function parseJson(s) {
  try { return JSON.parse(s); } catch { return null; }
}

const fileOut = (f) => ({
  id: f.id, name: f.name, subject: f.subject, category: f.category || "",
  size: f.size, status: f.status, createdAt: f.created_at,
});

export async function onRequestGet({ request, env }) {
  const gate = await requireUser(request, env);
  if (gate.error) return gate.error;
  const db = await getDb(env);
  if (!db) return fail(503, "数据库未配置");
  const uid = gate.user.id;
  try {
    const shareRows = await db
      .prepare("SELECT s.*, u.nickname AS owner_name FROM platform_shares s JOIN users u ON u.id = s.uid ORDER BY s.created_at DESC LIMIT 100")
      .all();
    const counts = await db
      .prepare("SELECT uid, file_id, COUNT(*) AS n FROM platform_questions GROUP BY uid, file_id")
      .all();
    const countMap = new Map((counts.results || []).map((r) => [`${r.uid}|${r.file_id}`, r.n]));
    const myFileRows = await db
      .prepare("SELECT * FROM platform_files WHERE uid=? ORDER BY created_at DESC")
      .bind(uid)
      .all();
    const myFiles = (myFileRows.results || []).map(fileOut);
    const myImported = new Set(myFiles.filter((f) => f.id.startsWith("share-")).map((f) => f.id.slice(6)));
    const shareByFile = new Map();
    const shares = [];
    for (const s of shareRows.results || []) {
      if (s.uid === uid) shareByFile.set(s.file_id, s.id);
      shares.push({
        id: s.id,
        title: s.title,
        subject: s.subject || "",
        note: s.note || "",
        imports: s.imports || 0,
        createdAt: s.created_at,
        owner: s.owner_name || "同学",
        mine: s.uid === uid,
        questions: countMap.get(`${s.uid}|${s.file_id}`) || 0,
        imported: myImported.has(s.id),
      });
    }
    return ok({
      shares,
      myFiles: myFiles
        .filter((f) => !f.id.startsWith("share-"))
        .map((f) => ({ ...f, shareId: shareByFile.get(f.id) || null, questions: countMap.get(`${uid}|${f.id}`) || 0 })),
    });
  } catch (err) {
    console.error("[community] 读取失败", err);
    return fail(500, "读取失败，请稍后再试");
  }
}

export async function onRequestPost({ request, env }) {
  const gate = await requireUser(request, env);
  if (gate.error) return gate.error;
  const db = await getDb(env);
  if (!db) return fail(503, "数据库未配置");
  const uid = gate.user.id;
  const body = await readJson(request).catch(() => null);
  const action = String(body?.action || "");
  try {
    if (action === "share") {
      const fileId = String(body.fileId || "");
      const file = await db.prepare("SELECT * FROM platform_files WHERE uid=? AND id=?").bind(uid, fileId).first();
      if (!file) return fail(404, "资料不存在");
      const existing = await db.prepare("SELECT id FROM platform_shares WHERE uid=? AND file_id=?").bind(uid, fileId).first();
      if (existing) return ok({ shareId: existing.id, already: true });
      const id = crypto.randomUUID();
      const title = String(body.title || file.name).trim().slice(0, 120) || file.name;
      const note = String(body.note || "").trim().slice(0, 200);
      await db
        .prepare("INSERT INTO platform_shares (id, uid, file_id, title, subject, note, imports, created_at) VALUES (?,?,?,?,?,?,0,?)")
        .bind(id, uid, fileId, title, file.subject || "", note, new Date().toISOString())
        .run();
      return ok({ shareId: id }, 201);
    }
    if (action === "unshare") {
      const id = String(body.id || "");
      await db.prepare("DELETE FROM platform_shares WHERE id=? AND uid=?").bind(id, uid).run();
      return ok({});
    }
    if (action === "import") {
      const id = String(body.id || "");
      const share = await db.prepare("SELECT * FROM platform_shares WHERE id=?").bind(id).first();
      if (!share) return fail(404, "分享不存在或已取消");
      if (share.uid === uid) return fail(400, "这是你自己的分享");
      const myFileId = `share-${share.id}`;
      const dup = await db.prepare("SELECT id FROM platform_files WHERE uid=? AND id=?").bind(uid, myFileId).first();
      if (dup) return fail(409, "已经导入过了，去资料页查看");
      const src = await db.prepare("SELECT * FROM platform_files WHERE uid=? AND id=?").bind(share.uid, share.file_id).first();
      if (!src) return fail(404, "分享者已删除原资料，无法导入");
      const now = new Date().toISOString();
      await db
        .prepare("INSERT INTO platform_files VALUES (?,?,?,?,?,?,?,?,?,?)")
        .bind(myFileId, uid, src.name, src.subject, src.size, src.mime, src.object_key, "shared", now, src.category || "")
        .run();
      const qrows = await db.prepare("SELECT draft_id, data FROM platform_questions WHERE uid=? AND file_id=?").bind(share.uid, share.file_id).all();
      let imported = 0;
      for (const r of qrows.results || []) {
        const q = parseJson(r.data);
        if (!q) continue;
        const newDraft = `${r.draft_id}-sh-${share.id.slice(0, 8)}`;
        q.draftId = newDraft;
        q.id = `personal-${newDraft}`;
        q.sharedFrom = share.title;
        const res = await db
          .prepare("INSERT OR IGNORE INTO platform_questions VALUES (?,?,?,?)")
          .bind(uid, myFileId, newDraft, JSON.stringify(q))
          .run();
        imported += res.meta?.changes ? 1 : 0;
      }
      await db.prepare("UPDATE platform_shares SET imports=imports+1 WHERE id=?").bind(share.id).run();
      return ok({ imported, fileId: myFileId });
    }
    return fail(400, "未知 action");
  } catch (err) {
    console.error("[community] 操作失败", err);
    return fail(500, "操作失败，请稍后再试");
  }
}
