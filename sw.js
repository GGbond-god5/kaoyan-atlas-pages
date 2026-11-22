/* 科目大观 Service Worker：页面与静态资源离线缓存；/api 一律走网络、从不缓存。
 * 导航：network-first，失败回缓存；/assets/：stale-while-revalidate（题库 questions.js 首次加载后可离线刷题）。
 * 只缓存 200 且未被重定向的响应，避免把未登录跳转到登录页的响应存进缓存冒充页面。 */
const VERSION = 'atlas-sw-v2';
const CORE = ['/login.html', '/assets/auth.css', '/assets/transitions.css', '/assets/config.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(CORE)).catch(() => {}).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function putIfCacheable(request, response) {
  if (response && response.ok && !response.redirected) {
    const copy = response.clone();
    caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => {});
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // 接口永远走网络

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => { putIfCacheable(request, response); return response; })
        .catch(() => caches.match(request).then((hit) => hit || caches.match('/index.html')))
    );
    return;
  }

  if (url.pathname === '/assets/papers.js') {
    // 套卷清单内容随账号版本（普通版/内测版）由服务端过滤，禁止 SWR 旧缓存冒充：
    // 网络优先，失败才回缓存（缓存里是该用户上次在线时自己版本的那一份）。
    event.respondWith(
      fetch(request)
        .then((response) => { putIfCacheable(request, response); return response; })
        .catch(() => caches.match(request))
    );
    return;
  }

  if (url.pathname.startsWith('/assets/') || url.pathname === '/manifest.webmanifest') {
    event.respondWith(
      caches.match(request).then((hit) => {
        const network = fetch(request)
          .then((response) => { putIfCacheable(request, response); return response; })
          .catch(() => hit);
        return hit || network;
      })
    );
  }
});
