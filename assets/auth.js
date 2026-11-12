/* 账号页公共逻辑：接口调用、令牌、验证码倒计时、提示条
 *
 * 部署形态有两种，靠 assets/config.js 的 apiBase 切换：
 *   1) 同域：Node 服务同时托管网页和接口 → apiBase 留空，用 Cookie 会话
 *   2) 跨域：网页在 Cloudflare Pages、接口在阿里云 ECS
 *      → apiBase 填 https://api.你的域名，用 Authorization: Bearer 令牌
 *      （跨站 Cookie 会被浏览器拦，所以跨域时走令牌）
 */
(function () {
  'use strict';

  var CONFIG = window.ATLAS_CONFIG || {};
  var API_BASE = String(CONFIG.apiBase || '').replace(/\/+$/, '');
  // 同域部署走 HttpOnly Cookie；只有跨域（网页在 Pages、接口在别的域名）才用 Bearer。
  // 同域还带 Authorization 会覆盖浏览器自动附带的 Basic Auth，导致站点保护下接口 401。
  var USE_BEARER = Boolean(API_BASE);
  var TOKEN_KEY = 'atlas_token';

  function getToken() {
    try {
      return localStorage.getItem(TOKEN_KEY) || '';
    } catch {
      return '';
    }
  }

  function setToken(token) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* 隐私模式下 localStorage 可能不可用，降级为 Cookie 会话 */
    }
  }

  function headers(json) {
    var h = {};
    if (json) h['Content-Type'] = 'application/json';
    if (USE_BEARER) {
      var t = getToken();
      if (t) h.Authorization = 'Bearer ' + t;
    }
    return h;
  }

  /** 统一 POST 请求：失败时抛出带中文提示的 Error */
  async function post(path, body) {
    var res;
    try {
      res = await fetch(API_BASE + path, {
        method: 'POST',
        headers: headers(true),
        credentials: 'include',
        body: JSON.stringify(body || {}),
      });
    } catch (err) {
      throw new Error('无法连接服务器，请确认后端已启动、且 config.js 的 apiBase 填写正确');
    }
    var data = {};
    try {
      data = await res.json();
    } catch {
      /* 忽略非 JSON 响应 */
    }
    if (!res.ok || data.ok === false) {
      var e = new Error(data.error || '请求失败（HTTP ' + res.status + '）');
      e.status = res.status;
      e.data = data;
      throw e;
    }
    if (data.token && USE_BEARER) setToken(data.token);
    return data;
  }

  async function me() {
    try {
      var r = await fetch(API_BASE + '/api/auth/me', {
        headers: headers(false),
        credentials: 'include',
      });
      if (!r.ok) return null;
      var d = await r.json();
      return d.user || null;
    } catch {
      return null;
    }
  }

  async function logout() {
    try {
      await post('/api/auth/logout', {});
    } catch {
      /* 网络失败也照样清本地令牌 */
    }
    setToken('');
  }

  function alertBox(el, message, kind) {
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('show', Boolean(message));
    el.classList.toggle('ok', kind === 'ok');
  }

  function shake(input) {
    if (!input) return;
    input.classList.add('bad');
    clearTimeout(input._t);
    input._t = setTimeout(function () {
      input.classList.remove('bad');
    }, 1600);
  }

  /**
   * 绑定「获取验证码」按钮：倒计时 + 调后端
   * @param {object} opt { btn, phone, scene, onSent }
   */
  function bindSendCode(opt) {
    var btn = opt.btn;
    var phone = opt.phone;
    var scene = opt.scene;
    var onSent = opt.onSent;
    var timer = null;
    var left = 0;

    function paint() {
      if (left > 0) {
        btn.disabled = true;
        btn.classList.add('counting');
        btn.textContent = '重新获取 ' + left + 's';
      } else {
        btn.disabled = false;
        btn.classList.remove('counting');
        btn.textContent = '获取验证码';
      }
    }

    function start(sec) {
      left = sec;
      paint();
      clearInterval(timer);
      timer = setInterval(function () {
        left -= 1;
        if (left <= 0) {
          clearInterval(timer);
          left = 0;
        }
        paint();
      }, 1000);
    }

    btn.addEventListener('click', async function () {
      var value = (phone.value || '').trim();
      if (!/^1[3-9]\d{9}$/.test(value)) {
        shake(phone);
        phone.focus();
        if (onSent) onSent({ error: '请输入正确的 11 位手机号' });
        return;
      }
      btn.disabled = true;
      btn.textContent = '发送中…';
      try {
        var data = await post('/api/sms/send', { phone: value, scene: scene });
        start(60);
        if (onSent) onSent({ ok: true, data: data });
      } catch (err) {
        btn.disabled = false;
        btn.textContent = '获取验证码';
        if (err.status === 429 && err.data && err.data.retryAfter) start(err.data.retryAfter);
        if (onSent) onSent({ error: err.message, status: err.status });
      }
    });

    return { start: start };
  }

  /** 距离下一次考研初试的天数（2027 届为 2026-12-26） */
  function examDays() {
    var now = new Date();
    var year = now.getFullYear();
    if (now.getMonth() === 11 && now.getDate() > 26) year += 1;
    var exam = new Date(year, 11, 26);
    var diff = Math.ceil((exam - now) / 86400000);
    return diff > 0 ? diff : 0;
  }

  /** ISO 时间转本地时区，避免直接截取 UTC 字符串导致差 8 小时 */
  function fmtTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso).replace('T', ' ').slice(0, 16);
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function fmtDate(iso) {
    return fmtTime(iso).slice(0, 10);
  }

  window.AtlasAuth = {
    apiBase: API_BASE,
    post: post,
    me: me,
    logout: logout,
    getToken: getToken,
    setToken: setToken,
    alertBox: alertBox,
    shake: shake,
    bindSendCode: bindSendCode,
    examDays: examDays,
    fmtTime: fmtTime,
    fmtDate: fmtDate,
  };
})();
