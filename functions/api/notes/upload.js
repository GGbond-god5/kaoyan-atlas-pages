// POST /api/notes/upload  图片/PDF/文本上传到 R2，返回可插入笔记的地址
import { ok, fail } from '../../_lib/http.js';
import { currentSession } from '../../_lib/security.js';

const MAX = 20 * 1024 * 1024;
const TYPES = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  pdf: 'application/pdf', md: 'text/markdown', markdown: 'text/markdown', txt: 'text/plain',
};

export async function onRequestPost({ request, env }) {
  const session = await currentSession(request, env);
  const uid = session && typeof session.uid === 'string' ? session.uid : null;
  if (!uid) return fail(401, '请先登录');
  if (!env.LIBRARY_FILES) return fail(503, '文件存储未配置');

  let form;
  try { form = await request.formData(); } catch { return fail(400, '上传格式无效'); }
  const file = form.get('file');
  if (!file || typeof file.arrayBuffer !== 'function' || !file.size) return fail(400, '请选择文件');
  if (file.size > MAX) return fail(413, '文件不能超过 20MB');
  const ext = String(file.name || '').split('.').pop().toLowerCase();
  const type = TYPES[ext];
  if (!type) return fail(400, '只支持图片、PDF、Markdown 或文本文件');

  const key = `${uid}-${crypto.randomUUID()}.${ext}`;
  try {
    await env.LIBRARY_FILES.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: type } });
  } catch (e) {
    return fail(502, '文件上传失败，请稍后再试');
  }
  return ok({
    url: `/api/notes/file/${encodeURIComponent(key)}`,
    name: String(file.name || `note.${ext}`).slice(0, 120),
    type,
    size: file.size,
  });
}
