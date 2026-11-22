// 全站登录门禁：除登录/注册页及其必要资源外，未登录一律拦下。
// 账号体系启用后不再使用 Basic Auth，避免两层密码。
//
// 【参赛开放期，2026-11-22 站长指令】Qoder 高校创造力大赛以主站参赛，评审期间临时撤除门禁
// （GATE_OPEN=true），评委免登录直达全站页面与静态资源；比赛结束、评审过关后把 GATE_OPEN
// 改回 false 即恢复原门禁。开放仅限「看」：/admin 与 /api/admin 仍走原会话校验，各 /api
// 接口自身的会话校验不变，游客的写操作仍会被接口层拦下；已登录用户行为不受影响。
// 内部资料屏蔽（2026-11-22 站长指令）：开放期内，第三方版权资料路径（SHIELDED_PATHS，与
// 参赛版剔除清单同口径）不走开放捷径，仍按原门禁校验——游客挡住、登录用户照常使用。
// 版权分级（2026-11-22 深夜定版）：SHIELDED_PATHS 进一步收紧为「内测版专属」——不论开放期
// 是否结束，游客与普通版账号一律挡住（普通版 403 并提示兑换内测码），只有内测版账号
// （users.edition='beta'）与管理员能访问；普通版题库只下发真题分片（questions-guest）。
// 套卷清单 /assets/papers.js 同口径：非内测请求由中间件把 mock 清单过滤掉再下发。
import { currentSession, normalizedSessionVersion } from "./_lib/security.js";
import { getUser } from "./_lib/db.js";
import { ensureLayer1, isBetaUser } from "./_lib/layer1.js";

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

function editionRequired() {
  return new Response("该资料为内测版内容：普通版只含真题，在头像菜单兑换内测码升级内测版后可访问", {
    status: 403,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** 回查会话用户（封禁/注销/会话版本实时生效）；DB 异常返回 unavailable 标记，调用方 fail-closed */
async function sessionUser(request, env) {
  let session = null;
  try {
    session = await currentSession(request, env);
  } catch {
    // 损坏或伪造的 Cookie 按未登录处理，不能把异常泄漏为 500。
  }
  if (!session) return { user: null };
  if (!env.DB) return { unavailable: true };
  let user;
  try {
    await ensureLayer1(env).catch(() => {}); // users.edition 列幂等补齐，失败按 normal 处理
    user = await getUser(env, session.phone);
  } catch (err) {
    console.error("[middleware] 会话校验失败", err);
    return { unavailable: true };
  }
  const tokenVersion = normalizedSessionVersion(session.sv);
  const userVersion = normalizedSessionVersion(user && user.session_version);
  if (!user || user.banned || tokenVersion !== userVersion) return { user: null };
  return { user };
}

/** 普通版套卷清单：把 papers.js 里的模拟卷清单清空，只留真题卷（格式异常时原样返回） */
function publicPapers(text) {
  const m = String(text).match(/window\.PAPERS\s*=\s*(\{[\s\S]*\});?\s*$/);
  if (!m) return text;
  try {
    const data = JSON.parse(m[1]);
    data.mock = [];
    return `window.PAPERS=${JSON.stringify(data)};\n`;
  } catch {
    return text;
  }
}

export async function onRequest({ request, env, next }) {
  const url = new URL(request.url);
  if (isPublic(url.pathname)) return next();
  const shielded = SHIELDED_PATHS.some((re) => re.test(url.pathname));

  // 套卷清单按版本分发：内测版/管理员拿全量（含模拟卷），其余（游客/普通版）只给真题卷。
  // 判定失败（未登录、DB 异常）一律按普通版过滤，宁可少给不可多给。
  if (url.pathname === "/assets/papers.js") {
    const { user } = await sessionUser(request, env);
    if (user && isBetaUser(env, user)) return next();
    const res = await next();
    if (!res.ok) return res;
    return new Response(publicPapers(await res.text()), {
      status: 200,
      headers: { "Content-Type": "application/javascript; charset=utf-8", "Cache-Control": "private, no-store" },
    });
  }

  if (GATE_OPEN && !ADMIN_PATHS.some((re) => re.test(url.pathname)) && !shielded) return next();

  const { user, unavailable: dbDown } = await sessionUser(request, env);
  if (dbDown) return unavailable();
  if (user) {
    if (shielded && !isBetaUser(env, user)) return editionRequired();
    return next();
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
