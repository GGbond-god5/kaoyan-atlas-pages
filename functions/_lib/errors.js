// 统一错误码与脱敏日志辅助（禁止记录 API Key、完整手机号、Cookie、作答图片 data URL）
export const ERROR_CODES = Object.freeze({
  AI_NOT_CONFIGURED: 'AI_NOT_CONFIGURED',
  AI_SCHEMA_INVALID: 'AI_SCHEMA_INVALID',
  GRADE_CLAIMED: 'GRADE_CLAIMED',
  PAPER_SCORE_EXCEEDED: 'PAPER_SCORE_EXCEEDED',
  DB_UNAVAILABLE: 'DB_UNAVAILABLE',
  IMAGE_TOO_LARGE: 'IMAGE_TOO_LARGE',
});

export function maskUid(uid) {
  const s = String(uid || '');
  return s.length <= 6 ? s : `${s.slice(0, 4)}…${s.slice(-2)}`;
}

export function safeLog(action, fields = {}) {
  const out = { action, ts: new Date().toISOString() };
  for (const [k, v] of Object.entries(fields)) {
    if (v == null) continue;
    if (/key|secret|token|cookie|password|authorization/i.test(k)) continue;
    const sv = String(v);
    if (sv.startsWith('data:image/')) { out[k] = '[redacted-image]'; continue; }
    out[k] = k === 'uid' ? maskUid(sv) : sv.slice(0, 200);
  }
  try { console.log(JSON.stringify(out)); } catch {}
}
