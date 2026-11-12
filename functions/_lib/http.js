// 统一的 JSON 响应与请求解析，供 functions/api/* 复用

export function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extra,
    },
  });
}

export const ok = (data = {}, status = 200, headers = {}) => json({ ok: true, ...data }, status, headers);

export const fail = (status, error, extra = {}) => json({ ok: false, error, ...extra }, status);

export async function readJson(request) {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? body : null;
  } catch {
    return null;
  }
}

export const PHONE_RE = /^1[3-9]\d{9}$/;
export const CODE_RE = /^\d{6}$/;

export function maskPhone(phone) {
  return phone.slice(0, 3) + "****" + phone.slice(-4);
}

export function publicUser(user) {
  return {
    id: user.id,
    nickname: user.nickname,
    phone: maskPhone(user.phone),
    createdAt: user.created_at || user.createdAt,
    lastLoginAt: user.last_login_at || user.lastLoginAt || null,
  };
}

export function clientIp(request) {
  return request.headers.get("CF-Connecting-IP") || request.headers.get("X-Real-IP") || "unknown";
}
