import { auth, grade } from '../_lib/platform.js';
import { ok, fail, readJson } from '../_lib/http.js';

export async function onRequestPost({request,env}) {
  if (!await auth(request,env)) return fail(401,'请先登录');
  const payload = await readJson(request);
  if (!payload) return fail(400,'请求解析失败');
  try {
    const result = await grade(env,payload);
    return ok({...result,model:env.AI_MODEL || 'qwen3-vl-plus'});
  } catch (e) {
    const status = e.message === 'AI 服务未配置' ? 503 : /请先作答|照片格式|缺少题目|满分必须/.test(e.message) ? 400 : 502;
    return fail(status,e.message);
  }
}
