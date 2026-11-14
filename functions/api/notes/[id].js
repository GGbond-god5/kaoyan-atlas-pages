// GET /api/notes/:id  PUT /api/notes/:id  DELETE /api/notes/:id
import { ok, fail, readJson } from '../../_lib/http.js';
import { currentSession } from '../../_lib/security.js';
import { getNote, updateNote, deleteNote } from '../../_lib/notes.js';

async function uid(request, env) {
  const session = await currentSession(request, env);
  return session && typeof session.uid === 'string' ? session.uid : null;
}

export async function onRequestGet({ request, env, params }) {
  const id = await uid(request, env);
  if (!id) return fail(401, '请先登录');
  const note = await getNote(env, id, params.id);
  return note ? ok({ note }) : fail(404, '笔记不存在');
}

export async function onRequestPut({ request, env, params }) {
  const id = await uid(request, env);
  if (!id) return fail(401, '请先登录');
  const body = await readJson(request);
  if (!body) return fail(400, '请求格式不正确');
  try {
    const note = await updateNote(env, id, params.id, body);
    return note ? ok({ note }) : fail(404, '笔记不存在');
  } catch (e) {
    const msg = e.message || '保存失败';
    return fail(/标题|内容|章节/.test(msg) ? 400 : 503, msg);
  }
}

export async function onRequestDelete({ request, env, params }) {
  const id = await uid(request, env);
  if (!id) return fail(401, '请先登录');
  const removed = await deleteNote(env, id, params.id);
  return removed ? ok({}) : fail(404, '笔记不存在');
}
