/* 顶栏右上角的账号入口：有会话时显示昵称，没有时显示「登录」
 * 兼容同域（Cookie）与跨域（Bearer 令牌）两种部署。
 */
(function () {
  'use strict';

  var chip = document.getElementById('authChip');
  if (!chip) return;

  var CONFIG = window.ATLAS_CONFIG || {};
  var API_BASE = String(CONFIG.apiBase || '').replace(/\/+$/, '');
  // 同域靠 HttpOnly Cookie，带 Authorization 会覆盖站点的 Basic Auth
  var USE_BEARER = Boolean(API_BASE);

  function token() {
    try {
      return localStorage.getItem('atlas_token') || '';
    } catch {
      return '';
    }
  }

  function paint(user) {
    if (user) {
      chip.textContent = user.nickname;
      chip.title = '已登录 ' + user.phone + '，点击查看账号';
      chip.classList.add('signed');
    } else {
      chip.textContent = '登录';
      chip.title = '登录 / 注册';
      chip.classList.remove('signed');
    }
  }

  paint(null);

  var t = USE_BEARER ? token() : '';
  fetch(API_BASE + '/api/auth/me', {
    headers: t ? { Authorization: 'Bearer ' + t } : {},
    credentials: 'include',
  })
    .then(function (r) {
      return r.ok ? r.json() : null;
    })
    .then(function (d) {
      paint(d && d.user ? d.user : null);
    })
    .catch(function () {
      /* 纯静态托管（Cloudflare Pages 未接接口）或 serve.py 时没有接口，保持「登录」即可 */
    });
})();
