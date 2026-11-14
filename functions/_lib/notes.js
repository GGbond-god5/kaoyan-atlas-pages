// 用户个人笔记：按章节挂在笔记库里，与内置笔记分开存储。
const SCHEMA = `CREATE TABLE IF NOT EXISTS user_notes (
  uid TEXT NOT NULL,
  id TEXT NOT NULL,
  chapter_id TEXT NOT NULL,
  title TEXT NOT NULL,
  type TEXT NOT NULL,
  markdown TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (uid, id)
)`;

let ready = false;
async function db(env) {
  if (!env.DB) throw new Error('数据库未配置');
  if (!ready) {
    await env.DB.prepare(SCHEMA).run();
    ready = true;
  }
  return env.DB;
}

const str = v => String(v == null ? '' : v);
const pub = row => ({
  id: row.id,
  chapter: row.chapter_id,
  title: row.title,
  type: row.type,
  updatedAt: row.updated_at,
});

export function normalizeNote(input) {
  const value = input && typeof input === 'object' ? input : {};
  const title = str(value.title).trim().slice(0, 80);
  const type = str(value.type).trim().slice(0, 20) || '笔记';
  const chapter = str(value.chapter).trim().slice(0, 40);
  const markdown = str(value.markdown).slice(0, 100000);
  if (!title) throw new Error('请填写笔记标题');
  if (!/^[a-z0-9-]{2,40}$/i.test(chapter)) throw new Error('章节无效');
  if (!markdown.trim()) throw new Error('笔记内容不能为空');
  return { title, type, chapter, markdown };
}

export async function listNotes(env, uid, chapter) {
  const database = await db(env);
  const rows = chapter
    ? await database.prepare('SELECT id, chapter_id, title, type, updated_at FROM user_notes WHERE uid = ? AND chapter_id = ? ORDER BY updated_at DESC').bind(uid, chapter).all()
    : await database.prepare('SELECT id, chapter_id, title, type, updated_at FROM user_notes WHERE uid = ? ORDER BY updated_at DESC').bind(uid).all();
  return (rows.results || []).map(pub);
}

export async function getNote(env, uid, id) {
  const database = await db(env);
  const row = await database.prepare('SELECT * FROM user_notes WHERE uid = ? AND id = ?').bind(uid, id).first();
  return row ? { ...pub(row), markdown: row.markdown } : null;
}

export async function createNote(env, uid, input) {
  const note = normalizeNote(input);
  const database = await db(env);
  const count = await database.prepare('SELECT COUNT(*) AS n FROM user_notes WHERE uid = ?').bind(uid).first();
  if ((count?.n || 0) >= 300) throw new Error('个人笔记数量已达上限（300 篇）');
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await database.prepare('INSERT INTO user_notes (uid, id, chapter_id, title, type, markdown, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(uid, id, note.chapter, note.title, note.type, note.markdown, now, now).run();
  return { id, ...note, updatedAt: now };
}

export async function updateNote(env, uid, id, input) {
  const note = normalizeNote(input);
  const database = await db(env);
  const now = new Date().toISOString();
  const result = await database.prepare('UPDATE user_notes SET chapter_id = ?, title = ?, type = ?, markdown = ?, updated_at = ? WHERE uid = ? AND id = ?')
    .bind(note.chapter, note.title, note.type, note.markdown, now, uid, id).run();
  if (!result.meta?.changes) return null;
  return { id, ...note, updatedAt: now };
}

export async function deleteNote(env, uid, id) {
  const database = await db(env);
  const result = await database.prepare('DELETE FROM user_notes WHERE uid = ? AND id = ?').bind(uid, id).run();
  return Boolean(result.meta?.changes);
}
