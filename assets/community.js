/* 社区共享页：广场列表（导入）、我的资料（分享/取消分享）。接口 /api/community。 */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var SUBJECTS = { math: '数学一', math2: '数学二', english: '英语一', english2: '英语二', mechanics: '807 材料力学', politics: '政治' };
  function subjectLabel(s) { return SUBJECTS[s] || s || ''; }
  function alertBox(msg, ok) {
    var a = $('#alert');
    a.textContent = msg || '';
    a.className = 'alert' + (msg ? ' show ' + (ok ? 'ok' : 'bad') : '');
  }
  var api = function (method, body) { return window.AtlasUser.json('/api/community', method, body); };

  function renderShares(shares) {
    var box = $('#shareList');
    if (!shares.length) { box.innerHTML = '<p class="note">广场还空着，来做第一个分享的人吧。</p>'; return; }
    box.innerHTML = shares.map(function (s) {
      var meta = [subjectLabel(s.subject), s.questions ? s.questions + ' 道题' : '暂无题目', '已被导入 ' + (s.imports || 0) + ' 次', '来自 ' + esc(s.owner)]
        .filter(Boolean).join(' · ');
      var btn = s.mine
        ? '<span class="tag">我的分享</span>'
        : (s.imported
          ? '<span class="tag">已导入</span>'
          : '<button class="btn" data-import="' + esc(s.id) + '">导入到我的账号</button>');
      var avatar = s.ownerAvatarAt
        ? '<img src="/api/profile/avatar?uid=' + encodeURIComponent(s.ownerUid) + '&v=' + s.ownerAvatarAt + '" alt="" style="width:34px;height:34px;border-radius:50%;object-fit:cover;flex:none;border:2px solid #E4DCCB">'
        : '';
      return '<div class="row" style="justify-content:space-between;align-items:flex-start;gap:12px;padding:10px 0;border-top:1px dashed rgba(120,96,40,.25)">' +
        avatar +
        '<div style="min-width:0;flex:1"><b>' + esc(s.title) + '</b>' +
        (s.note ? '<div class="note">' + esc(s.note) + '</div>' : '') +
        (s.ownerMotto ? '<div class="note">「' + esc(s.ownerMotto) + '」</div>' : '') +
        '<div class="note">' + esc(meta) + '</div></div>' +
        '<div style="flex:none">' + btn + '</div></div>';
    }).join('');
    box.querySelectorAll('button[data-import]').forEach(function (b) {
      b.addEventListener('click', async function () {
        b.disabled = true; b.textContent = '导入中…';
        try {
          var out = await api('POST', { action: 'import', id: b.getAttribute('data-import') });
          alertBox('导入完成：' + (out.imported || 0) + ' 道题已进入你的个人题库，资料在「我的资料」里。', true);
          load();
        } catch (err) {
          alertBox('导入失败：' + err.message);
          b.disabled = false; b.textContent = '导入到我的账号';
        }
      });
    });
  }

  function renderMine(files) {
    var box = $('#myFiles');
    if (!files.length) { box.innerHTML = '<p class="note">你还没有上传过资料。先去<a href="library.html">我的资料</a>上传一份，再回来分享。</p>'; return; }
    box.innerHTML = files.map(function (f) {
      var meta = [subjectLabel(f.subject), f.questions ? '含 ' + f.questions + ' 道已导入题' : '暂无已导入题', (f.size / 1048576).toFixed(2) + ' MiB'].filter(Boolean).join(' · ');
      var btn = f.shareId
        ? '<button class="btn danger-btn" data-unshare="' + esc(f.shareId) + '">取消分享</button>'
        : '<button class="btn" data-share="' + esc(f.id) + '">分享到广场</button>';
      return '<div class="row" style="justify-content:space-between;align-items:flex-start;gap:12px;padding:10px 0;border-top:1px dashed rgba(120,96,40,.25)">' +
        '<div style="min-width:0"><b>' + esc(f.name) + '</b><div class="note">' + esc(meta) + '</div></div>' +
        '<div style="flex:none">' + btn + '</div></div>';
    }).join('');
    box.querySelectorAll('button[data-share]').forEach(function (b) {
      b.addEventListener('click', async function () {
        var f = files.find(function (x) { return String(x.id) === b.getAttribute('data-share'); });
        var title = window.prompt('分享标题（可改）', f ? f.name : '');
        if (title === null) return;
        var note = window.prompt('一句话说明（可留空，比如适用科目/来源）', '') || '';
        b.disabled = true;
        try {
          await api('POST', { action: 'share', fileId: b.getAttribute('data-share'), title: title, note: note });
          alertBox('已分享到广场。', true);
          load();
        } catch (err) {
          alertBox('分享失败：' + err.message);
          b.disabled = false;
        }
      });
    });
    box.querySelectorAll('button[data-unshare]').forEach(function (b) {
      b.addEventListener('click', async function () {
        if (!window.confirm('取消分享？已导入到别人账号的副本不会被收回。')) return;
        b.disabled = true;
        try {
          await api('POST', { action: 'unshare', id: b.getAttribute('data-unshare') });
          alertBox('已取消分享。', true);
          load();
        } catch (err) {
          alertBox('取消失败：' + err.message);
          b.disabled = false;
        }
      });
    });
  }

  async function load() {
    try {
      var data = await api('GET');
      renderShares(data.shares || []);
      renderMine(data.myFiles || []);
    } catch (err) {
      alertBox('加载失败：' + err.message + '（请确认已登录）');
    }
  }

  window.AtlasUser.ready.then(load).catch(function () { alertBox('请先登录'); });
})();
