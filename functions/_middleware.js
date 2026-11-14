// 全站登录门禁：除登录/注册页及其必要资源外，未登录一律拦下。
// 账号体系启用后不再使用 Basic Auth，避免两层密码。
import { currentSession } from "./_lib/security.js";

const PUBLIC = [
  /^\/login(\.html)?$/,
  /^\/register(\.html)?$/,
  /^\/api\/auth\/(login|register|logout|me)$/,
  /^\/api\/sms\/send$/,
  /^\/api\/health$/,
  /^\/assets\/(auth\.(js|css)|config\.js)$/,
  /^\/assets\/remotion\//,
  /^\/favicon\.ico$/,
];

function isPublic(pathname) {
  return PUBLIC.some((re) => re.test(pathname));
}

function wantsHtml(request) {
  return (request.headers.get("Accept") || "").includes("text/html");
}

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  if (isPublic(url.pathname)) return next();

  const session = await currentSession(request, env);
  if (session) return next();

  if (request.method === "GET" && wantsHtml(request)) {
    const target = url.pathname + url.search;
    const login = new URL("/login", url);
    login.searchParams.set("next", target);
    return Response.redirect(login.toString(), 302);
  }

  return new Response("请先登录", {
    status: 401,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
