/* PWA：注册 Service Worker（离线缓存页面与题库）。注册失败不影响正常使用。 */
(function () {
  if (!('serviceWorker' in navigator)) return;
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('/sw.js').catch(function () {});
  });
})();
