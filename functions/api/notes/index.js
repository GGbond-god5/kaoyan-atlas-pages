// GET /api/notes?chapter=   POST /api/notes
import { ok, fail, readJson } from '../../_lib/http.js';
import { currentSession } from '../../_lib/security.js';
import { listNotes, createNote } from '../../_lib/notes.js';

async function uid(request, env) {
  const session = await currentSession(request, env);
  return session && typeof session.uid === 'string' ? session.uid : null;
}

export async function onRequestGet({ request, env }) {
  const id = await uid(request, env);
  if (!id) return fail(401, '请先登录');
  const chapter = new URL(request.url).searchParams.get('chapter') || '';
  try {
    return ok({ notes: await listNotes(env, id, chapter) });
  } catch (e) {
    return fail(503, '笔记服务暂不可用');
  }
}

export async function onRequestPost({ request, env }) {
  const id = await uid(request, env);
  if (!id) return fail(401, '请先登录');
  const body = await readJson(request);
  if (!body) return fail(400, '请求格式不正确');
  try {
    return ok({ note: await createNote(env, id, body) }, 201);
  } catch (e) {
    const msg = e.message || '保存失败';
    return fail(/标题|内容|章节|上限/.test(msg) ? 400 : 503, msg);
  }
}
