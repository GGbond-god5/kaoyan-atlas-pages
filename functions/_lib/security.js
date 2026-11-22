// 口令哈希、会话令牌、Cookie —— 全部基于 Web Crypto，无需任何依赖
//
// 关于 PBKDF2 迭代次数：Cloudflare Pages Functions 免费版每个请求只有 10ms CPU，
// 而 PBKDF2 是吃 CPU 的，迭代太高会直接 1102 报错。默认 20000 次，
// 想更强可以设置环境变量 PBKDF2_ITERATIONS（付费版可以到 100000 以上）。
// 线上还有「连续 5 次密码错误锁 10 分钟」兜底，挡住在线爆破。

const enc = new TextEncoder();
const DEFAULT_ITERATIONS = 20000;

export const COOKIE_NAME = "atlas_session";
export const SESSION_DAYS = 7;

export function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function fromHex(hexStr) {
  const out = new Uint8Array(hexStr.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hexStr.substr(i * 2, 2), 16);
  return out;
}

export function randomHex(bytes = 16) {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return toHex(buf);
}

export function iterations(env) {
  const n = Number(env?.PBKDF2_ITERATIONS || DEFAULT_ITERATIONS);
  return Number.isFinite(n) && n >= 1000 ? Math.min(n, 200000) : DEFAULT_ITERATIONS;
}

export async function hashPassword(password, saltHex, rounds) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: fromHex(saltHex), iterations: rounds, hash: "SHA-256" },
    key,
    256
  );
  return toHex(bits);
}

/** 用于 mock 模式下对验证码做不可逆摘要（不存明文） */
export async function sha256Hex(str) {
  return toHex(await crypto.subtle.digest("SHA-256", enc.encode(str)));
}

/** 定长比较，避免时序侧信道 */
export function safeEqual(a, b) {
  const x = String(a);
  const y = String(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

/* ---------------- 会话令牌 ---------------- */

function b64url(bytes) {
  let bin = "";
  const arr = new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(str) {
  const s = str.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacBytes(secret, data) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", key, enc.encode(data));
}

export function normalizedSessionVersion(value) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

export async function signSession({ uid, phone, sessionVersion = 0 }, secret) {
  const sv = normalizedSessionVersion(sessionVersion);
  const payload = { uid, phone, sv, exp: Date.now() + SESSION_DAYS * 24 * 3600 * 1000 };
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const mac = b64url(await hmacBytes(secret, body));
  return `${body}.${mac}`;
}

export async function verifySession(token, secret) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expect = b64url(await hmacBytes(secret, body));
  if (!safeEqual(mac, expect)) return null;
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(unb64url(body)));
  } catch {
    return null;
  }
  if (!payload || typeof payload.exp !== "number" || payload.exp < Date.now()) return null;
  return payload;
}

/** 优先 Authorization: Bearer，其次 Cookie */
export function tokenFromRequest(request) {
  const header = request.headers.get("Authorization") || "";
  if (header.startsWith("Bearer ")) return header.slice(7).trim();
  const cookies = parseCookies(request.headers.get("Cookie"));
  return cookies[COOKIE_NAME] || "";
}

export async function currentSession(request, env) {
  const secret = env?.SESSION_SECRET;
  if (!secret) return null;
  return verifySession(tokenFromRequest(request), secret);
}

/* ---------------- Cookie ---------------- */

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) continue;
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      // 单个损坏 Cookie 不应让公开接口抛 500；按未设置处理。
    }
  }
  return out;
}

export function isSecureRequest(request) {
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return true;
  }
}

export function sessionCookie(token, secure = true) {
  return [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    ...(secure ? ["Secure"] : []),
    "SameSite=Lax",
    `Max-Age=${SESSION_DAYS * 24 * 3600}`,
  ].join("; ");
}

export function clearedCookie(secure = true) {
  return [
    `${COOKIE_NAME}=`,
    "Path=/",
    "HttpOnly",
    ...(secure ? ["Secure"] : []),
    "SameSite=Lax",
    "Max-Age=0",
  ].join("; ");
}
