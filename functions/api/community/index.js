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

async function ensureSocial(env) {
  const db = await getDb(env);
  if (!db) return;
  await db.prepare("CREATE TABLE IF NOT EXISTS platform_share_likes (share_id TEXT NOT NULL, uid TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (share_id, uid))").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS platform_share_comments (id TEXT PRIMARY KEY, share_id TEXT NOT NULL, uid TEXT NOT NULL, text TEXT NOT NULL, created_at TEXT NOT NULL)").run();
}

async function ensurePosts(env) {
  const db = await getDb(env);
  if (!db) return;
  await db.prepare("CREATE TABLE IF NOT EXISTS platform_posts (id TEXT PRIMARY KEY, uid TEXT NOT NULL, text TEXT NOT NULL, subject TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL)").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS platform_post_likes (post_id TEXT NOT NULL, uid TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (post_id, uid))").run();
  await db.prepare("CREATE TABLE IF NOT EXISTS platform_post_comments (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, uid TEXT NOT NULL, parent_id TEXT NOT NULL DEFAULT '', text TEXT NOT NULL, created_at TEXT NOT NULL)").run();
}

async function avatarMap(db, uids) {
  const map = new Map();
  const ids = [...new Set(uids.filter(Boolean))];
  if (!ids.length) return map;
  try {
    const rows = await db
      .prepare(`SELECT uid, data FROM user_profiles WHERE uid IN (${ids.map(() => "?").join(",")})`)
      .bind(...ids)
      .all();
    for (const r of rows.results || []) {
      try { const p = JSON.parse(r.data); map.set(r.uid, { motto: p.motto || "", avatarAt: p.avatarAt || 0 }); } catch (_) { /* 忽略损坏档案 */ }
    }
  } catch (_) { /* user_profiles 尚未创建时忽略 */ }
  return map;
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
  await ensureSocial(env);
  const qs = new URL(request.url).searchParams;
  if (qs.get("feed")) {
    try {
      await ensurePosts(env);
      const rows = await db
        .prepare("SELECT p.*, u.nickname AS author FROM platform_posts p JOIN users u ON u.id = p.uid ORDER BY p.created_at DESC LIMIT 60")
        .all();
      const list = rows.results || [];
      const profs = await avatarMap(db, list.map((r) => r.uid));
      const likeRows = await db.prepare("SELECT post_id, COUNT(*) AS n FROM platform_post_likes GROUP BY post_id").all();
      const likeMap = new Map((likeRows.results || []).map((r) => [r.post_id, r.n]));
      const myLikeRows = await db.prepare("SELECT post_id FROM platform_post_likes WHERE uid=?").bind(uid).all();
      const myLikes = new Set((myLikeRows.results || []).map((r) => r.post_id));
      const ccRows = await db.prepare("SELECT post_id, COUNT(*) AS n FROM platform_post_comments GROUP BY post_id").all();
      const ccMap = new Map((ccRows.results || []).map((r) => [r.post_id, r.n]));
      return ok({
        posts: list.map((p) => ({
          id: p.id, text: p.text, subject: p.subject || "", createdAt: p.created_at,
          author: p.author || "同学", authorUid: p.uid,
          authorAvatarAt: (profs.get(p.uid) || {}).avatarAt || 0,
          mine: p.uid === uid, likeCount: likeMap.get(p.id) || 0, liked: myLikes.has(p.id),
          commentCount: ccMap.get(p.id) || 0,
        })),
      });
    } catch (err) {
      console.error("[community] 动态读取失败", err);
      return fail(500, "动态读取失败");
    }
  }
  const wantPostComments = qs.get("postComments");
  if (wantPostComments) {
    try {
      await ensurePosts(env);
      const rows = await db
        .prepare("SELECT c.*, u.nickname AS author FROM platform_post_comments c JOIN users u ON u.id = c.uid WHERE c.post_id=? ORDER BY c.created_at ASC LIMIT 300")
        .bind(wantPostComments)
        .all();
      const list = rows.results || [];
      const byId = new Map(list.map((c) => [c.id, c]));
      const profs = await avatarMap(db, list.map((r) => r.uid));
      return ok({
        comments: list.map((c) => ({
          id: c.id, text: c.text, createdAt: c.created_at, parentId: c.parent_id || "",
          parentAuthor: c.parent_id && byId.get(c.parent_id) ? (byId.get(c.parent_id).author || "同学") : "",
          author: c.author || "同学", authorUid: c.uid,
          authorAvatarAt: (profs.get(c.uid) || {}).avatarAt || 0, mine: c.uid === uid,
        })),
      });
    } catch (err) {
      console.error("[community] 动态评论读取失败", err);
      return fail(500, "评论读取失败");
    }
  }
  const wantComments = new URL(request.url).searchParams.get("comments");
  if (wantComments) {
    try {
      const rows = await db
        .prepare("SELECT c.*, u.nickname AS author FROM platform_share_comments c JOIN users u ON u.id = c.uid WHERE c.share_id=? ORDER BY c.created_at ASC LIMIT 200")
        .bind(wantComments)
        .all();
      const profs = await avatarMap(db, (rows.results || []).map((r) => r.uid));
      return ok({
        comments: (rows.results || []).map((c) => ({
          id: c.id, text: c.text, createdAt: c.created_at, author: c.author || "同学",
          authorUid: c.uid, authorAvatarAt: (profs.get(c.uid) || {}).avatarAt || 0, mine: c.uid === uid,
        })),
      });
    } catch (err) {
      console.error("[community] 评论读取失败", err);
      return fail(500, "评论读取失败");
    }
  }
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
    const ownerIds = [...new Set((shareRows.results || []).map((s) => s.uid))];
    const profileMap = new Map();
    if (ownerIds.length) {
      try {
        const profRows = await db
          .prepare(`SELECT uid, data FROM user_profiles WHERE uid IN (${ownerIds.map(() => "?").join(",")})`)
          .bind(...ownerIds)
          .all();
        for (const r of profRows.results || []) {
          try { const p = JSON.parse(r.data); profileMap.set(r.uid, { motto: p.motto || "", avatarAt: p.avatarAt || 0 }); } catch (_) { /* 档案损坏时忽略 */ }
        }
      } catch (_) { /* user_profiles 尚未创建时忽略 */ }
    }
    const likeRows = await db.prepare("SELECT share_id, COUNT(*) AS n FROM platform_share_likes GROUP BY share_id").all();
    const likeMap = new Map((likeRows.results || []).map((r) => [r.share_id, r.n]));
    const myLikeRows = await db.prepare("SELECT share_id FROM platform_share_likes WHERE uid=?").bind(uid).all();
    const myLikes = new Set((myLikeRows.results || []).map((r) => r.share_id));
    const ccRows = await db.prepare("SELECT share_id, COUNT(*) AS n FROM platform_share_comments GROUP BY share_id").all();
    const ccMap = new Map((ccRows.results || []).map((r) => [r.share_id, r.n]));
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
        ownerUid: s.uid,
        ownerMotto: (profileMap.get(s.uid) || {}).motto || "",
        ownerAvatarAt: (profileMap.get(s.uid) || {}).avatarAt || 0,
        mine: s.uid === uid,
        likeCount: likeMap.get(s.id) || 0,
        liked: myLikes.has(s.id),
        commentCount: ccMap.get(s.id) || 0,
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
  await ensureSocial(env);
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
    if (action === "like") {
      const id = String(body.id || "");
      const share = await db.prepare("SELECT id FROM platform_shares WHERE id=?").bind(id).first();
      if (!share) return fail(404, "分享不存在或已取消");
      const had = await db.prepare("SELECT share_id FROM platform_share_likes WHERE share_id=? AND uid=?").bind(id, uid).first();
      if (had) {
        await db.prepare("DELETE FROM platform_share_likes WHERE share_id=? AND uid=?").bind(id, uid).run();
      } else {
        await db.prepare("INSERT INTO platform_share_likes (share_id, uid, created_at) VALUES (?,?,?)").bind(id, uid, new Date().toISOString()).run();
      }
      const cnt = await db.prepare("SELECT COUNT(*) AS n FROM platform_share_likes WHERE share_id=?").bind(id).first();
      return ok({ liked: !had, likeCount: cnt?.n || 0 });
    }
    if (action === "comment") {
      const id = String(body.id || "");
      const text = String(body.text || "").trim().slice(0, 300);
      if (!text) return fail(400, "评论不能为空");
      const share = await db.prepare("SELECT id FROM platform_shares WHERE id=?").bind(id).first();
      if (!share) return fail(404, "分享不存在或已取消");
      const cid = crypto.randomUUID();
      const now = new Date().toISOString();
      await db.prepare("INSERT INTO platform_share_comments (id, share_id, uid, text, created_at) VALUES (?,?,?,?,?)").bind(cid, id, uid, text, now).run();
      return ok({ comment: { id: cid, text, createdAt: now, author: gate.user.nickname || "同学", authorUid: uid, authorAvatarAt: 0, mine: true } }, 201);
    }
    if (action === "uncomment") {
      const cid = String(body.commentId || "");
      await db.prepare("DELETE FROM platform_share_comments WHERE id=? AND uid=?").bind(cid, uid).run();
      return ok({});
    }
    if (action === "post") {
      await ensurePosts(env);
      const text = String(body.text || "").trim().slice(0, 500);
      if (!text) return fail(400, "动态内容不能为空");
      const subject = String(body.subject || "").trim().slice(0, 20);
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      await db.prepare("INSERT INTO platform_posts (id, uid, text, subject, created_at) VALUES (?,?,?,?,?)").bind(id, uid, text, subject, now).run();
      return ok({ post: { id, text, subject, createdAt: now, author: gate.user.nickname || "同学", authorUid: uid, authorAvatarAt: 0, mine: true, likeCount: 0, liked: false, commentCount: 0 } }, 201);
    }
    if (action === "postDelete") {
      await ensurePosts(env);
      const id = String(body.id || "");
      const own = await db.prepare("SELECT id FROM platform_posts WHERE id=? AND uid=?").bind(id, uid).first();
      if (!own) return fail(404, "动态不存在或不是你的");
      await db.prepare("DELETE FROM platform_posts WHERE id=?").bind(id).run();
      await db.prepare("DELETE FROM platform_post_likes WHERE post_id=?").bind(id).run();
      await db.prepare("DELETE FROM platform_post_comments WHERE post_id=?").bind(id).run();
      return ok({});
    }
    if (action === "postLike") {
      await ensurePosts(env);
      const id = String(body.id || "");
      const post = await db.prepare("SELECT id FROM platform_posts WHERE id=?").bind(id).first();
      if (!post) return fail(404, "动态不存在或已删除");
      const had = await db.prepare("SELECT post_id FROM platform_post_likes WHERE post_id=? AND uid=?").bind(id, uid).first();
      if (had) await db.prepare("DELETE FROM platform_post_likes WHERE post_id=? AND uid=?").bind(id, uid).run();
      else await db.prepare("INSERT INTO platform_post_likes (post_id, uid, created_at) VALUES (?,?,?)").bind(id, uid, new Date().toISOString()).run();
      const cnt = await db.prepare("SELECT COUNT(*) AS n FROM platform_post_likes WHERE post_id=?").bind(id).first();
      return ok({ liked: !had, likeCount: cnt?.n || 0 });
    }
    if (action === "postComment") {
      await ensurePosts(env);
      const id = String(body.id || "");
      const text = String(body.text || "").trim().slice(0, 300);
      if (!text) return fail(400, "评论不能为空");
      const post = await db.prepare("SELECT id FROM platform_posts WHERE id=?").bind(id).first();
      if (!post) return fail(404, "动态不存在或已删除");
      let parentId = String(body.parentId || "");
      if (parentId) {
        const parent = await db.prepare("SELECT id FROM platform_post_comments WHERE id=? AND post_id=?").bind(parentId, id).first();
        if (!parent) parentId = "";
      }
      const cid = crypto.randomUUID();
      const now = new Date().toISOString();
      await db.prepare("INSERT INTO platform_post_comments (id, post_id, uid, parent_id, text, created_at) VALUES (?,?,?,?,?,?)").bind(cid, id, uid, parentId, text, now).run();
      return ok({ comment: { id: cid, text, createdAt: now, parentId, parentAuthor: "", author: gate.user.nickname || "同学", authorUid: uid, authorAvatarAt: 0, mine: true } }, 201);
    }
    if (action === "postUncomment") {
      await ensurePosts(env);
      const cid = String(body.commentId || "");
      await db.prepare("DELETE FROM platform_post_comments WHERE id=? AND uid=?").bind(cid, uid).run();
      return ok({});
    }
    return fail(400, "未知 action");
  } catch (err) {
    console.error("[community] 操作失败", err);
    return fail(500, "操作失败，请稍后再试");
  }
}
