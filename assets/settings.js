/* 账号设置页：改密码、数据导出、注销账号 */
(function () {
  'use strict';
  var A = window.AtlasAuth;
  var alertEl = document.getElementById('alert');

  function say(msg, ok) {
    A.alertBox(alertEl, msg, ok ? 'ok' : '');
    if (msg) window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  A.me().then(function (u) {
    if (!u) {
      location.href = 'login.html';
      return;
    }
    document.getElementById('accNick').textContent = u.nickname || '—';
    document.getElementById('accPhone').textContent = u.phone || '—';
    document.getElementById('accCreated').textContent = u.createdAt ? A.fmtDate(u.createdAt) : '—';
  });

  /* 修改密码 */
  var pwForm = document.getElementById('pwForm');
  pwForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var oldPw = document.getElementById('oldPw').value;
    var newPw = document.getElementById('newPw').value;
    var newPw2 = document.getElementById('newPw2').value;
    if (!oldPw) return say('请输入旧密码');
    if (!(newPw.length >= 8 && newPw.length <= 32)) return say('新密码长度需为 8–32 位');
    if (!/[A-Za-z]/.test(newPw) || !/\d/.test(newPw)) return say('新密码需同时包含字母和数字');
    if (newPw !== newPw2) return say('两次输入的新密码不一致');
    var btn = document.getElementById('pwBtn');
    btn.disabled = true;
    try {
      await A.post('/api/auth/password', { oldPassword: oldPw, newPassword: newPw });
      pwForm.reset();
      say('密码已更新', true);
    } catch (err) {
      say(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  /* 数据导出：走 fetch 以便跨域模式带 Bearer 令牌 */
  document.getElementById('exportBtn').addEventListener('click', async function () {
    var btn = this;
    btn.disabled = true;
    try {
      var headers = {};
      var t = A.getToken();
      if (A.apiBase && t) headers.Authorization = 'Bearer ' + t;
      var res = await fetch(A.apiBase + '/api/auth/export', { headers: headers, credentials: 'include' });
      if (!res.ok) throw new Error('导出失败（HTTP ' + res.status + '）');
      var blob = await res.blob();
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'kaoyan-atlas-export.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
      say('已开始下载导出文件', true);
    } catch (err) {
      say(err.message);
    } finally {
      btn.disabled = false;
    }
  });

  /* 注销账号 */
  var delForm = document.getElementById('delForm');
  delForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    var pw = document.getElementById('delPw').value;
    if (!pw) return say('请输入密码以确认注销');
    if (!window.confirm('确定要永久注销账号吗？全部学习数据将被删除且不可恢复。')) return;
    if (!window.confirm('最后确认一次：真的要注销并删除全部数据吗？')) return;
    var btn = document.getElementById('delBtn');
    btn.disabled = true;
    try {
      await A.post('/api/auth/delete', { password: pw });
      A.setToken('');
      alert('账号已注销，感谢使用。');
      location.href = 'register.html';
    } catch (err) {
      say(err.message);
      btn.disabled = false;
    }
  });
})();
