// 作答图片 D1 -> R2 兼容迁移层：写入时外置到 R2，读取时按需回填 data URL，R2 不可用或失败时自动回退 base64

const DATA_URL_RE = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/;

function decodeBase64(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function encodeBase64(bytes) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function attemptImageKey(uid, attemptId, questionId, index, ext) {
  const safeQ = String(questionId || 'q').replace(/[^A-Za-z0-9_.-]/g, '_');
  const safeExt = ext === 'png' ? 'png' : ext === 'jpeg' ? 'jpg' : 'webp';
  return `attempts/${uid}/${attemptId}/${safeQ}/${index}.${safeExt}`;
}

export async function offloadAttemptImages(env, uid, attemptId, answers) {
  const bucket = env && env.LIBRARY_FILES;
  if (!bucket || !answers || typeof answers !== 'object') return answers;
  const out = {};
  for (const [qid, rawAns] of Object.entries(answers)) {
    if (!rawAns || typeof rawAns !== 'object' || Array.isArray(rawAns)) { out[qid] = rawAns; continue; }
    const ans = { ...rawAns };
    const imgs = Array.isArray(ans.images) && ans.images.length
      ? ans.images
      : (typeof ans.image === 'string' && ans.image ? [ans.image] : []);
    if (!imgs.length) { out[qid] = ans; continue; }

    const refs = [];
    let allOffloaded = true;
    for (let i = 0; i < imgs.length; i++) {
      const s = imgs[i];
      if (typeof s !== 'string') { allOffloaded = false; break; }
      const m = DATA_URL_RE.exec(s);
      if (!m) { allOffloaded = false; break; }
      const mime = `image/${m[1]}`;
      const bytes = decodeBase64(m[2]);
      const key = attemptImageKey(uid, attemptId, qid, i, m[1]);
      try {
        await bucket.put(key, bytes, { httpMetadata: { contentType: mime } });
        refs.push({ key, mime, size: bytes.byteLength });
      } catch {
        allOffloaded = false;
        break;
      }
    }
    if (allOffloaded && refs.length) {
      ans.imageRefs = refs;
      delete ans.image;
      delete ans.images;
    }
    out[qid] = ans;
  }
  return out;
}

export async function hydrateAttemptImages(env, answers) {
  const bucket = env && env.LIBRARY_FILES;
  if (!bucket || !answers || typeof answers !== 'object') return answers;
  for (const ans of Object.values(answers)) {
    if (!ans || typeof ans !== 'object' || Array.isArray(ans)) continue;
    if (!Array.isArray(ans.imageRefs) || !ans.imageRefs.length) continue;
    if (Array.isArray(ans.images) && ans.images.length) continue;
    const urls = [];
    for (const ref of ans.imageRefs) {
      if (!ref || !ref.key) continue;
      try {
        const obj = await bucket.get(ref.key);
        if (!obj) continue;
        const buf = new Uint8Array(await obj.arrayBuffer());
        const mime = ref.mime || obj.httpMetadata?.contentType || 'image/webp';
        urls.push(`data:${mime};base64,${encodeBase64(buf)}`);
      } catch { /* 单张读取失败不阻断整体读取 */ }
    }
    if (urls.length) {
      ans.images = urls;
      ans.image = urls[0];
    }
  }
  return answers;
}

export async function purgeAttemptImages(env, answers) {
  const bucket = env && env.LIBRARY_FILES;
  if (!bucket || !answers || typeof answers !== 'object') return;
  const keys = [];
  for (const ans of Object.values(answers)) {
    if (ans && Array.isArray(ans.imageRefs)) {
      for (const ref of ans.imageRefs) if (ref && ref.key) keys.push(ref.key);
    }
  }
  if (!keys.length) return;
  try { await bucket.delete(keys); } catch {}
}
