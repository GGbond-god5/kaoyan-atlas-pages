// 头像：POST 上传（原始图片字节，客户端已压缩裁剪），GET 查看（自己或社区里他人的），DELETE 移除。
// 图片存 R2 avatars/<uid>，元数据（更新时间/类型）记在档案 JSON 里用于缓存刷新与存在判断。
import { ok, fail } from '../../_lib/http.js';
import { currentSession } from '../../_lib/security.js';
import { getProfile, setAvatarMeta } from '../../_lib/profile.js';

const TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const MAX_BYTES = 2 * 1024 * 1024;

async function uid(request, env) {
  const session = await currentSession(request, env);
  return session && typeof session.uid === 'string' ? session.uid : null;
}

export async function onRequestPost({ request, env }) {
  const id = await uid(request, env);
  if (!id) return fail(401, '请先登录');
  if (!env.LIBRARY_FILES) return fail(503, '头像存储未配置');
  const type = String(request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
  if (!TYPES.has(type)) return fail(400, '只支持 PNG / JPG / WebP 图片');
  const buf = await request.arrayBuffer();
  if (!buf.byteLength || buf.byteLength > MAX_BYTES) return fail(400, '图片大小需在 2MB 以内');
  await env.LIBRARY_FILES.put(`avatars/${id}`, buf, { httpMetadata: { contentType: type } });
  const at = Date.now();
  await setAvatarMeta(env, id, at, type);
  return ok({ avatarAt: at });
}

export async function onRequestGet({ request, env }) {
  const id = await uid(request, env);
  if (!id) return fail(401, '请先登录');
  if (!env.LIBRARY_FILES) return fail(503, '头像存储未配置');
  const target = new URL(request.url).searchParams.get('uid') || id;
  const profile = await getProfile(env, target);
  if (!profile.avatarAt) return fail(404, '没有头像');
  const obj = await env.LIBRARY_FILES.get(`avatars/${target}`);
  if (!obj) return fail(404, '没有头像');
  return new Response(obj.body, {
    headers: {
      'Content-Type': profile.avatarType || obj.httpMetadata?.contentType || 'image/jpeg',
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function onRequestDelete({ request, env }) {
  const id = await uid(request, env);
  if (!id) return fail(401, '请先登录');
  if (env.LIBRARY_FILES) { try { await env.LIBRARY_FILES.delete(`avatars/${id}`); } catch (_) { /* 已不存在 */ } }
  await setAvatarMeta(env, id, 0, '');
  return ok({ deleted: true });
}
