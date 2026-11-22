import { auth, grade, userAiConfig } from '../_lib/platform.js';
import { ok, fail, readJson } from '../_lib/http.js';
import { checkQuota, noteUsage } from '../_lib/layer1.js';

export async function onRequestPost({request,env}) {
  const uid = await auth(request,env);
  if (!uid) return fail(401,'请先登录');
  const payload = await readJson(request);
  if (!payload) return fail(400,'请求解析失败');
  let user = null;
  try { user = await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(uid).first(); } catch { /* 查不到用户时配额放行 */ }
  let userCfg = null;
  try { userCfg = userAiConfig(request, env); } catch (e) { return fail(400, e.message); }
  if (!userCfg) {
    const blocked = await checkQuota(env, user, 'grade');
    if (blocked) return fail(429, blocked);
  }
  try {
    const result = await grade(env,payload,userCfg);
    if (!userCfg) await noteUsage(env, uid, 'grade');
    return ok({...result,model:userCfg ? userCfg.model : (env.AI_MODEL || 'qwen3-vl-plus')});
  } catch (e) {
    const status = e.message === 'AI 服务未配置' ? 503 : /请先作答|照片格式|缺少题目|满分必须/.test(e.message) ? 400 : 502;
    return fail(status,e.message);
  }
}
