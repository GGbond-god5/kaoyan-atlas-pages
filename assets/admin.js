/* 管理后台：概览、用户与封禁、邀请码、公告 */
(function () {
  'use strict';
  var A = window.AtlasAuth;
  var alertEl = document.getElementById('alert');

  function say(msg, ok) {
    A.alertBox(alertEl, msg, ok ? 'ok' : '');
  }

  async function get(action) {
    var headers = {};
    var t = A.getToken();
    if (A.apiBase && t) headers.Authorization = 'Bearer ' + t;
    var res = await fetch(A.apiBase + '/api/admin?action=' + action, { headers: headers, credentials: 'include' });
    var data = {};
    try { data = await res.json(); } catch (e) { /* 忽略 */ }
    if (!res.ok || data.ok === false) {
      var err = new Error(data.error || '请求失败（HTTP ' + res.status + '）');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  async function loadStats() {
    var d = await get('stats');
    var s = d.stats;
    var ai = s.aiToday || {};
    function aiText(kind) {
      var v = ai[kind];
      return v ? v.calls + ' 次' : '0 次';
    }
    document.getElementById('stats').innerHTML =
      '<div class="stat"><b>' + s.users + '</b><span>注册用户</span></div>' +
      '<div class="stat"><b>' + s.newUsersToday + '</b><span>今日新增</span></div>' +
      '<div class="stat"><b>' + aiText('grade') + '</b><span>今日批改</span></div>' +
      '<div class="stat"><b>' + aiText('coach') + '</b><span>今日教练</span></div>' +
      '<div class="stat"><b>' + aiText('extract') + '</b><span>今日抽题</span></div>' +
      '<div class="stat"><b>' + s.smsToday + '</b><span>今日短信</span></div>';
  }

  async function loadUsers() {
    var d = await get('users');
    var tb = document.querySelector('#usersTbl tbody');
    tb.innerHTML = d.users.map(function (u) {
      var state = u.banned ? '<span class="tag bad">已封禁</span>' : (u.role === 'admin' ? '<span class="tag">管理员</span>' : '<span class="tag ok">正常</span>');
      if (!u.banned && u.role !== 'admin' && u.edition === 'beta') state += ' <span class="tag">内测版</span>';
      var btn = u.role === 'admin' ? '' :
        '<button class="btn small" data-ban="' + esc(u.phoneFull) + '" data-on="' + (u.banned ? '0' : '1') + '">' + (u.banned ? '解封' : '封禁') + '</button>';
      return '<tr><td>' + esc(u.nickname) + '<br><small>' + esc(u.phone) + '</small></td>' +
        '<td>' + esc(A.fmtDate(u.createdAt)) + '</td>' +
        '<td>' + esc(u.lastLoginAt ? A.fmtTime(u.lastLoginAt) : '—') + '</td>' +
        '<td>' + u.aiCallsToday + ' 次</td><td>' + state + '</td><td>' + btn + '</td></tr>';
    }).join('');
    tb.querySelectorAll('[data-ban]').forEach(function (b) {
      b.addEventListener('click', async function () {
        var phone = b.getAttribute('data-ban');
        var on = b.getAttribute('data-on') === '1';
        if (on && !window.confirm('确定封禁该用户？封禁后其登录立即失效。')) return;
        try {
          await A.post('/api/admin', { action: on ? 'ban' : 'unban', phone: phone });
          say(on ? '已封禁' : '已解封', true);
          loadUsers();
        } catch (err) { say(err.message); }
      });
    });
  }

  async function loadInvites() {
    var d = await get('invites');
    var tb = document.querySelector('#invTbl tbody');
    tb.innerHTML = d.invites.map(function (v) {
      var state = v.usedBy ? '已被 ' + esc(v.usedBy) + ' 使用' : '<span class="tag ok">未使用</span>';
      return '<tr><td><code>' + esc(v.code) + '</code></td><td>' + esc(v.note) + '</td><td>' + state + '</td><td>' + esc(A.fmtDate(v.createdAt)) + '</td></tr>';
    }).join('') || '<tr><td colspan="4">还没有邀请码</td></tr>';
  }

  async function loadBetaCodes() {
    var d = await get('betaCodes');
    var tb = document.querySelector('#betaTbl tbody');
    tb.innerHTML = d.betaCodes.map(function (v) {
      var state = v.usedBy ? '已被 ' + esc(v.usedBy) + ' 兑换' : '<span class="tag ok">未使用</span>';
      return '<tr><td><code>' + esc(v.code) + '</code></td><td>' + esc(v.note) + '</td><td>' + state + '</td><td>' + esc(A.fmtDate(v.createdAt)) + '</td></tr>';
    }).join('') || '<tr><td colspan="4">还没有内测码</td></tr>';
  }

  async function loadAnnouncement() {
    var d = await get('announcement');
    document.getElementById('annText').value = d.announcement || '';
  }

  async function loadWorkerToken() {
    var d = await get('workerToken');
    document.getElementById('workerTokenState').textContent = d.set ? '令牌已设置，ECS 批改服务可领卷。' : '令牌尚未设置，服务器批改未启用。';
  }

  document.getElementById('invForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    try {
      var d = await A.post('/api/admin', {
        action: 'invites.create',
        count: Number(document.getElementById('invCount').value) || 5,
        note: document.getElementById('invNote').value.trim(),
      });
      document.getElementById('invNew').innerHTML = '新生成：<code>' + d.codes.map(esc).join('</code>、<code>') + '</code>';
      loadInvites();
    } catch (err) { say(err.message); }
  });

  document.getElementById('betaForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    try {
      var d = await A.post('/api/admin', {
        action: 'betaCodes.create',
        count: Number(document.getElementById('betaCount').value) || 5,
        note: document.getElementById('betaNote').value.trim(),
      });
      document.getElementById('betaNew').innerHTML = '新生成：<code>' + d.codes.map(esc).join('</code>、<code>') + '</code>';
      loadBetaCodes();
    } catch (err) { say(err.message); }
  });

  document.getElementById('workerForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    try {
      await A.post('/api/admin', { action: 'workerToken.set', token: document.getElementById('workerToken').value.trim() });
      document.getElementById('workerToken').value = '';
      say('worker 令牌已保存', true);
      loadWorkerToken();
    } catch (err) { say(err.message); }
  });

  document.getElementById('annForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    try {
      await A.post('/api/admin', { action: 'announcement.set', text: document.getElementById('annText').value.trim() });
      say('公告已保存', true);
    } catch (err) { say(err.message); }
  });

  (async function init() {
    try {
      await get('stats');
    } catch (err) {
      if (err.status === 403) {
        document.getElementById('denied').hidden = false;
        return;
      }
      if (err.status === 401) {
        location.href = 'login.html';
        return;
      }
      say(err.message);
      return;
    }
    document.getElementById('adminBody').hidden = false;
    loadStats();
    loadUsers();
    loadInvites();
    loadBetaCodes();
    loadAnnouncement();
    loadWorkerToken();
  })();
})();
