// GET /api/notes/file/:file  读取当前用户上传的笔记附件
import { fail } from '../../../_lib/http.js';
import { currentSession } from '../../../_lib/security.js';

export async function onRequestGet({ request, env, params }) {
  const session = await currentSession(request, env);
  const uid = session && typeof session.uid === 'string' ? session.uid : null;
  if (!uid) return fail(401, '请先登录');
  if (!env.LIBRARY_FILES) return fail(503, '文件存储未配置');

  const key = decodeURIComponent(params.file || '');
  if (!key.startsWith(`${uid}-`)) return fail(403, '无权访问该文件');
  const object = await env.LIBRARY_FILES.get(key);
  if (!object) return fail(404, '文件不存在');

  const type = object.httpMetadata?.contentType || 'application/octet-stream';
  return new Response(object.body, {
    headers: {
      'Content-Type': type,
      'Cache-Control': 'private, max-age=3600',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(key)}`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
