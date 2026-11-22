// 全站登录门禁：除登录/注册页及其必要资源外，未登录一律拦下。
// 账号体系启用后不再使用 Basic Auth，避免两层密码。
//
// 【参赛开放期，2026-11-22 站长指令】Qoder 高校创造力大赛以主站参赛，评审期间临时撤除门禁
// （GATE_OPEN=true），评委免登录直达全站页面与静态资源；比赛结束、评审过关后把 GATE_OPEN
// 改回 false 即恢复原门禁。开放仅限「看」：/admin 与 /api/admin 仍走原会话校验，各 /api
// 接口自身的会话校验不变，游客的写操作仍会被接口层拦下；已登录用户行为不受影响。
// 内部资料屏蔽（2026-11-22 站长指令）：开放期内，第三方版权资料路径（SHIELDED_PATHS，与
// 参赛版剔除清单同口径）不走开放捷径，仍按原门禁校验——游客挡住、登录用户照常使用。
import { currentSession, normalizedSessionVersion } from "./_lib/security.js";
import { getUser } from "./_lib/db.js";

const PUBLIC = [
  /^\/login(\.html)?$/,
  /^\/register(\.html)?$/,
  /^\/api\/auth\/(login|register|logout|me|demo)$/,
  /^\/api\/sms\/send$/,
  /^\/api\/health$/,
  /^\/api\/worker$/,

  /^\/assets\/(auth\.(js|css)|config\.js|theme\.css|transitions\.css)$/,
  /^\/assets\/remotion\//,
  /^\/assets\/icons\//,
  /^\/sw\.js$/,
  /^\/manifest\.webmanifest$/,
  /^\/favicon\.ico$/,
  /^\/app-version\.json$/,
  /^\/assets\/app\//,
];

function isPublic(pathname) {
  return PUBLIC.some((re) => re.test(pathname));
}

function wantsHtml(request) {
  return (request.headers.get("Accept") || "").includes("text/html");
}

const GATE_OPEN = true; // 参赛开放期开关，见文件头说明；恢复门禁改回 false
const ADMIN_PATHS = [/^\/admin(\.html)?$/, /^\/api\/admin\//];
const SHIELDED_PATHS = [
  /^\/content\/x1000-pages(\/|$)/,
  /^\/content\/math-pages\/(mock|_tmp_crop)/,
  /^\/content\/_((mock|zy|ll|yl|cy|lyf|ocr)[^/]*|vocab_[^/]*)$/,
  /^\/pdf\/(vocab-|aliyun-)/,
  /^\/assets\/questions\//, // 全量题库分片：游客走 questions-guest（只真题），登录用户照常
];

function unavailable() {
  return new Response("服务暂不可用，请稍后再试", {
    status: 503,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "Retry-After": "5",
    },
  });
}

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  if (isPublic(url.pathname)) return next();
  if (GATE_OPEN && !ADMIN_PATHS.some((re) => re.test(url.pathname)) && !SHIELDED_PATHS.some((re) => re.test(url.pathname))) return next();

  let session = null;
  try {
    session = await currentSession(request, env);
  } catch {
    // 损坏或伪造的 Cookie 按未登录处理，不能把异常泄漏为 500。
  }

  if (session) {
    // 封禁与注销实时生效：会话令牌是无状态的，必须回查 users 表。
    // 私有路径采用 fail-closed：数据库异常时返回 503，不能绕过登录门禁。
    if (!env.DB) return unavailable();
    let user;
    try {
      user = await getUser(env, session.phone);
    } catch (err) {
      console.error("[middleware] 会话校验失败", err);
      return unavailable();
    }
    const tokenVersion = normalizedSessionVersion(session.sv);
    const userVersion = normalizedSessionVersion(user && user.session_version);
    if (user && !user.banned && tokenVersion === userVersion) return next();
  }

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
