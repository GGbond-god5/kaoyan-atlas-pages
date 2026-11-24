/* 管理后台：概览、用户与封禁、邀请码、公告 */
(function () {
  'use strict';
  var A = window.AtlasAuth;
  var alertEl = document.getElementById('alert');

  function say(msg, ok) {
    A.alertBox(alertEl, msg, ok ? 'ok' : '');
  }

  async function get(action, extra) {
    var headers = {};
    var t = A.getToken();
    if (A.apiBase && t) headers.Authorization = 'Bearer ' + t;
    var res = await fetch(A.apiBase + '/api/admin?action=' + action + (extra || ''), { headers: headers, credentials: 'include' });
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

  function relTime(iso) {
    if (!iso) return '未记录';
    var diff = Date.now() - new Date(iso).getTime();
    if (isNaN(diff)) return '未记录';
    if (diff < 60 * 1000) return '刚刚';
    if (diff < 3600 * 1000) return Math.floor(diff / 60000) + ' 分钟前';
    if (diff < 86400 * 1000) return Math.floor(diff / 3600000) + ' 小时前';
    return Math.floor(diff / 86400000) + ' 天前';
  }

  function presence(u) {
    if (!u.lastActiveAt) return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#9a97a3;margin-right:6px"></span>未记录';
    var diff = Date.now() - new Date(u.lastActiveAt).getTime();
    var color = '#9a97a3', label = '离线';
    if (diff <= 10 * 60 * 1000) { color = '#2fbf71'; label = '在线'; }
    else if (diff <= 86400 * 1000) { color = '#e8a13a'; label = '今日活跃'; }
    return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + color + ';margin-right:6px"></span>' + label +
      '<br><small>' + relTime(u.lastActiveAt) + '</small>';
  }

  async function loadUsers() {
    var d = await get('users');
    var tb = document.querySelector('#usersTbl tbody');
    tb.innerHTML = d.users.map(function (u) {
      var state = u.banned ? '<span class="tag bad">已封禁</span>' : (u.role === 'admin' ? '<span class="tag">管理员</span>' : '<span class="tag ok">正常</span>');
      if (!u.banned && u.role !== 'admin' && u.edition === 'beta') state += ' <span class="tag">内测版</span>';
      var btn = u.role === 'admin' ? '' :
        '<button class="btn small" data-ban="' + esc(u.phoneFull) + '" data-on="' + (u.banned ? '0' : '1') + '">' + (u.banned ? '解封' : '封禁') + '</button>';
      var detailBtn = '<button class="btn small ghost" data-detail="' + esc(u.phoneFull) + '">使用记录</button>';
      var attempts = u.attemptsTotal ? u.attemptsTotal + ' 套' + (u.lastAttemptAt ? '<br><small>最近 ' + esc(A.fmtDate(u.lastAttemptAt)) + '</small>' : '') : '—';
      return '<tr><td>' + esc(u.nickname) + '<br><small>' + esc(u.phone) + '</small></td>' +
        '<td>' + esc(A.fmtDate(u.createdAt)) + '</td>' +
        '<td>' + esc(u.lastLoginAt ? A.fmtTime(u.lastLoginAt) : '—') + '</td>' +
        '<td>' + presence(u) + '</td>' +
        '<td>' + attempts + '</td>' +
        '<td>今日 ' + u.aiCallsToday + ' 次<br><small>7 日 ' + (u.aiCalls7d || 0) + ' 次</small></td>' +
        '<td>' + state + '</td><td>' + detailBtn + (btn ? ' ' + btn : '') + '</td></tr>';
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
    tb.querySelectorAll('[data-detail]').forEach(function (b) {
      b.addEventListener('click', function () { loadUserDetail(b.getAttribute('data-detail')); });
    });
  }

  var SUBJECT_LABEL = { math: '数学', english: '英语', politics: '政治', mechanics: '专业课' };
  var KIND_LABEL = { grade: '批改', coach: '教练', extract: '抽题' };

  async function loadUserDetail(phone) {
    var card = document.getElementById('userDetailCard');
    var body = document.getElementById('udBody');
    card.hidden = false;
    body.innerHTML = '<p class="note">加载中…</p>';
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      var d = await get('userDetail', '&phone=' + encodeURIComponent(phone));
      var v = d.detail;
      var a = v.account;
      document.getElementById('udTitle').textContent = (a.nickname || '') + '（' + a.phone + '）';
      var attRows = v.attempts.recent.map(function (r) {
        var name = r.title || (SUBJECT_LABEL[r.subject] || r.subject || '套卷');
        var score = r.gradedQuestions > 0 && r.score != null ? r.score + (r.maxScore ? ' / ' + r.maxScore : '') : '—';
        var st = r.gradedQuestions === 0 ? '未批改' :
          (r.totalQuestions && r.gradedQuestions >= r.totalQuestions ? '已批改' : '部分批改 ' + r.gradedQuestions + '/' + r.totalQuestions + ' 题');
        return '<tr><td>' + esc(r.createdAt ? A.fmtTime(r.createdAt) : '—') + '</td><td>' + esc(name) + '</td><td>' + st + '</td><td>' + score + '</td></tr>';
      }).join('');
      var aiRows = v.aiUsage.map(function (r) {
        return '<tr><td>' + esc(r.day) + '</td><td>' + esc(KIND_LABEL[r.kind] || r.kind) + '</td><td>' + r.calls + ' 次</td><td>' + r.tokens + '</td></tr>';
      }).join('');
      var fileRows = v.files.recent.map(function (f) {
        return '<tr><td>' + esc(f.name) + '</td><td>' + esc(f.createdAt ? A.fmtDate(f.createdAt) : '—') + '</td></tr>';
      }).join('');
      body.innerHTML =
        '<p class="note">注册 ' + esc(A.fmtDate(a.createdAt)) + ' · 最近登录 ' + esc(a.lastLoginAt ? A.fmtTime(a.lastLoginAt) : '—') +
        ' · 最后活跃 ' + esc(relTime(a.lastActiveAt)) + ' · 版本 ' + (a.edition === 'beta' ? '内测版' : '普通版') +
        (a.banned ? ' · <b>已封禁</b>' : '') + '</p>' +
        '<h3>套卷（共 ' + v.attempts.total + ' 套，已批改 ' + v.attempts.graded + ' 套）</h3>' +
        (attRows ? '<div class="table-wrap"><table class="tbl"><thead><tr><th>时间</th><th>套卷</th><th>状态</th><th>得分</th></tr></thead><tbody>' + attRows + '</tbody></table></div>' : '<p class="note">暂无做题记录</p>') +
        '<h3>AI 用量（近 14 天）</h3>' +
        (aiRows ? '<div class="table-wrap"><table class="tbl"><thead><tr><th>日期</th><th>类型</th><th>次数</th><th>Tokens</th></tr></thead><tbody>' + aiRows + '</tbody></table></div>' : '<p class="note">暂无 AI 用量</p>') +
        '<h3>资料库（共 ' + v.files.total + ' 个） · 教练对话 ' + v.coachCount + ' 段</h3>' +
        (fileRows ? '<div class="table-wrap"><table class="tbl"><thead><tr><th>最近文件</th><th>上传时间</th></tr></thead><tbody>' + fileRows + '</tbody></table></div>' : '<p class="note">暂无上传文件</p>');
    } catch (err) {
      body.innerHTML = '<p class="note">' + esc(err.message) + '</p>';
    }
  }

  document.getElementById('udClose').addEventListener('click', function () {
    document.getElementById('userDetailCard').hidden = true;
  });

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
