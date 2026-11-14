// GET /api/profile 当前用户档案；PUT /api/profile 保存档案
import { ok, fail, readJson } from '../../_lib/http.js';
import { currentSession } from '../../_lib/security.js';
import { getProfile, saveProfile } from '../../_lib/profile.js';

async function uid(request, env) {
  const session = await currentSession(request, env);
  return session && typeof session.uid === 'string' ? session.uid : null;
}

export async function onRequestGet({ request, env }) {
  const id = await uid(request, env);
  if (!id) return fail(401, '请先登录');
  try {
    return ok({ profile: await getProfile(env, id) });
  } catch (e) {
    return fail(503, '档案服务暂不可用');
  }
}

export async function onRequestPut({ request, env }) {
  const id = await uid(request, env);
  if (!id) return fail(401, '请先登录');
  const body = await readJson(request);
  if (!body) return fail(400, '请求格式不正确');
  try {
    return ok({ profile: await saveProfile(env, id, body) });
  } catch (e) {
    return fail(503, '档案保存失败，请稍后再试');
  }
}
