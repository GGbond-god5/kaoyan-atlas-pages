// Optional site-wide Basic Auth: active only when SITE_PASS is configured.
export async function onRequest(context) {
  const { request, env, next } = context;
  const pass = env.SITE_PASS || "";
  if (!pass) return next();

  const header = request.headers.get("Authorization") || "";
  if (header.startsWith("Basic ")) {
    try {
      const decoded = atob(header.slice(6));
      const idx = decoded.indexOf(":");
      const user = decoded.slice(0, idx);
      const pwd = decoded.slice(idx + 1);
      if (user === (env.SITE_USER || "kaoyan") && pwd === pass) return next();
    } catch (e) {
      /* fall through */
    }
  }
  return new Response("需要登录后访问", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="kaoyan-atlas", charset="UTF-8"' },
  });
}
