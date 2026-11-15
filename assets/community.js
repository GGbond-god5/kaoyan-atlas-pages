/* 社区共享页：广场（搜索/筛选/导入/点赞/评论）、我的资料（分享/取消分享）。接口 /api/community。 */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var SUBJECTS = { math: '数学一', math2: '数学二', english: '英语一', english2: '英语二', mechanics: '807 材料力学', politics: '政治' };
  function subjectLabel(s) { return SUBJECTS[s] || s || '其他'; }
  function alertBox(msg, ok) {
    var a = $('#alert');
    a.textContent = msg || '';
    a.className = 'alert' + (msg ? ' show ' + (ok ? 'ok' : 'bad') : '');
  }
  var api = function (method, body, query) {
    return window.AtlasUser.json('/api/community' + (query || ''), method, body);
  };
  function timeText(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function avatarHtml(uid, avatarAt, name, size) {
    size = size || 34;
    if (avatarAt) {
      return '<img class="cm-avatar" src="/api/profile/avatar?uid=' + encodeURIComponent(uid) + '&v=' + avatarAt + '" alt="" style="width:' + size + 'px;height:' + size + 'px">';
    }
    var ch = esc(String(name || '同').slice(0, 1));
    return '<span class="cm-avatar cm-avatar-fallback" style="width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.42) + 'px">' + ch + '</span>';
  }

  var state = { shares: [], myFiles: [], q: '', subject: '' };
  var shareForm = document.querySelector('#shareDialog form');
  if (shareForm) shareForm.addEventListener('submit', function (e) { e.preventDefault(); });

  /* ---------- 通用确认框（替代 window.confirm） ---------- */
  var confirmResolve = null;
  function askConfirm(message) {
    $('#confirmText').textContent = message;
    var d = $('#confirmDialog');
    d.showModal();
    return new Promise(function (resolve) { confirmResolve = resolve; });
  }
  $('#confirmOk').addEventListener('click', function () { $('#confirmDialog').close(); if (confirmResolve) confirmResolve(true); });
  $('#confirmCancel').addEventListener('click', function () { $('#confirmDialog').close(); if (confirmResolve) confirmResolve(false); });

  /* ---------- 分享弹窗（替代 window.prompt） ---------- */
  var shareFileId = null;
  function openShareDialog(file) {
    shareFileId = file.id;
    $('#shareTitle').value = file.name || '';
    $('#shareNote').value = '';
    $('#shareDialog').showModal();
    setTimeout(function () { $('#shareTitle').focus(); $('#shareTitle').select(); }, 30);
  }
  $('#shareCancel').addEventListener('click', function () { $('#shareDialog').close(); });
  $('#shareSubmit').addEventListener('click', async function () {
    var title = $('#shareTitle').value.trim();
    var note = $('#shareNote').value.trim();
    if (!title) { $('#shareTitle').focus(); return; }
    var btn = this;
    btn.disabled = true; btn.textContent = '分享中…';
    try {
      await api('POST', { action: 'share', fileId: shareFileId, title: title, note: note });
      $('#shareDialog').close();
      alertBox('已分享到广场。', true);
      load();
    } catch (err) {
      alertBox('分享失败：' + err.message);
    } finally {
      btn.disabled = false; btn.textContent = '分享到广场';
    }
  });

  /* ---------- 广场 ---------- */
  function renderChips() {
    var seen = [];
    state.shares.forEach(function (s) { var k = s.subject || ''; if (seen.indexOf(k) < 0) seen.push(k); });
    var box = $('#subjectChips');
    var html = '<button type="button" class="cm-chip' + (state.subject === '' ? ' on' : '') + '" data-subject="">全部</button>';
    seen.forEach(function (k) {
      html += '<button type="button" class="cm-chip' + (state.subject === k ? ' on' : '') + '" data-subject="' + esc(k) + '">' + esc(subjectLabel(k)) + '</button>';
    });
    box.innerHTML = html;
    box.querySelectorAll('[data-subject]').forEach(function (b) {
      b.addEventListener('click', function () { state.subject = b.getAttribute('data-subject'); renderChips(); renderShares(); });
    });
  }

  function renderShares() {
    var box = $('#shareList');
    var list = state.shares.filter(function (s) {
      if (state.subject && (s.subject || '') !== state.subject) return false;
      if (state.q) {
        var hay = (s.title + ' ' + (s.note || '') + ' ' + s.owner + ' ' + subjectLabel(s.subject)).toLowerCase();
        if (hay.indexOf(state.q.toLowerCase()) < 0) return false;
      }
      return true;
    });
    if (!state.shares.length) { box.innerHTML = '<p class="note">广场还空着，来做第一个分享的人吧。</p>'; return; }
    if (!list.length) { box.innerHTML = '<p class="note">没有符合筛选的分享，换个关键词或科目试试。</p>'; return; }
    box.innerHTML = list.map(function (s) {
      var meta = [subjectLabel(s.subject), s.questions ? s.questions + ' 道题' : '暂无题目', '已被导入 ' + (s.imports || 0) + ' 次', timeText(s.createdAt)].filter(Boolean).join(' · ');
      var btn = s.mine
        ? '<span class="tag">我的分享</span>'
        : (s.imported
          ? '<span class="tag">已导入</span>'
          : '<button class="btn" data-import="' + esc(s.id) + '">导入到我的账号</button>');
      return '<article class="cm-card" data-card="' + esc(s.id) + '">' +
        '<div class="cm-head">' + avatarHtml(s.ownerUid, s.ownerAvatarAt, s.owner) +
          '<div class="cm-owner"><b>' + esc(s.owner) + '</b>' +
          (s.ownerMotto ? '<span>「' + esc(s.ownerMotto) + '」</span>' : '') + '</div>' +
          '<div class="cm-side">' + btn + '</div></div>' +
        '<h3 class="cm-title">' + esc(s.title) + '</h3>' +
        (s.note ? '<p class="cm-note">' + esc(s.note) + '</p>' : '') +
        '<div class="note">' + esc(meta) + '</div>' +
        '<div class="cm-actions">' +
          '<button type="button" class="cm-act' + (s.liked ? ' on' : '') + '" data-like="' + esc(s.id) + '">' + (s.liked ? '♥' : '♡') + ' <span data-like-count>' + (s.likeCount || 0) + '</span></button>' +
          '<button type="button" class="cm-act" data-comments="' + esc(s.id) + '">评论 <span data-comment-count>' + (s.commentCount || 0) + '</span></button>' +
        '</div>' +
        '<div class="cm-comments" hidden>' +
          '<div class="cm-comment-list"><p class="note">正在加载评论…</p></div>' +
          '<form class="cm-comment-form"><input maxlength="300" placeholder="写一句鼓励或提问…" autocomplete="off"><button class="btn" type="submit">发送</button></form>' +
        '</div>' +
      '</article>';
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
    box.querySelectorAll('button[data-like]').forEach(function (b) {
      b.addEventListener('click', async function () {
        var id = b.getAttribute('data-like');
        try {
          var out = await api('POST', { action: 'like', id: id });
          var s = state.shares.find(function (x) { return x.id === id; });
          if (s) { s.liked = out.liked; s.likeCount = out.likeCount; }
          b.classList.toggle('on', !!out.liked);
          b.innerHTML = (out.liked ? '♥' : '♡') + ' <span data-like-count>' + (out.likeCount || 0) + '</span>';
        } catch (err) { alertBox('点赞失败：' + err.message); }
      });
    });
    box.querySelectorAll('button[data-comments]').forEach(function (b) {
      b.addEventListener('click', function () {
        var card = b.closest('.cm-card');
        var zone = card.querySelector('.cm-comments');
        var open = zone.hidden;
        zone.hidden = !open;
        if (open) loadComments(card, b.getAttribute('data-comments'));
      });
    });
    box.querySelectorAll('.cm-comment-form').forEach(function (f) {
      f.addEventListener('submit', async function (ev) {
        ev.preventDefault();
        var card = f.closest('.cm-card');
        var id = card.getAttribute('data-card');
        var input = f.querySelector('input');
        var text = input.value.trim();
        if (!text) return;
        try {
          var out = await api('POST', { action: 'comment', id: id, text: text });
          input.value = '';
          var s = state.shares.find(function (x) { return x.id === id; });
          if (s) { s.commentCount = (s.commentCount || 0) + 1; var cc = card.querySelector('[data-comment-count]'); if (cc) cc.textContent = s.commentCount; }
          appendComment(card, out.comment);
        } catch (err) { alertBox('评论失败：' + err.message); }
      });
    });
  }

  function commentHtml(c) {
    return '<div class="cm-comment" data-comment="' + esc(c.id) + '">' +
      avatarHtml(c.authorUid, c.authorAvatarAt, c.author, 24) +
      '<div class="cm-comment-body"><b>' + esc(c.author) + '</b><span class="cm-comment-time">' + esc(timeText(c.createdAt)) + '</span>' +
      '<p>' + esc(c.text) + '</p></div>' +
      (c.mine ? '<button type="button" class="cm-del" data-del="' + esc(c.id) + '">删除</button>' : '') +
    '</div>';
  }
  function appendComment(card, c) {
    var list = card.querySelector('.cm-comment-list');
    var empty = list.querySelector('.note');
    if (empty && list.children.length === 1) list.innerHTML = '';
    list.insertAdjacentHTML('beforeend', commentHtml(c));
    wireCommentDelete(card);
  }
  function wireCommentDelete(card) {
    card.querySelectorAll('[data-del]').forEach(function (b) {
      if (b.dataset.wired) return;
      b.dataset.wired = '1';
      b.addEventListener('click', async function () {
        if (!(await askConfirm('删除这条评论？'))) return;
        try {
          await api('POST', { action: 'uncomment', commentId: b.getAttribute('data-del') });
          var row = b.closest('.cm-comment');
          var cardEl = b.closest('.cm-card');
          var id = cardEl.getAttribute('data-card');
          var s = state.shares.find(function (x) { return x.id === id; });
          if (s && s.commentCount > 0) { s.commentCount -= 1; var cc = cardEl.querySelector('[data-comment-count]'); if (cc) cc.textContent = s.commentCount; }
          row.remove();
        } catch (err) { alertBox('删除失败：' + err.message); }
      });
    });
  }
  async function loadComments(card, shareId) {
    var list = card.querySelector('.cm-comment-list');
    try {
      var data = await api('GET', null, '?comments=' + encodeURIComponent(shareId));
      var comments = data.comments || [];
      list.innerHTML = comments.length ? comments.map(commentHtml).join('') : '<p class="note">还没有评论，来做第一个留言的人吧。</p>';
      wireCommentDelete(card);
    } catch (err) {
      list.innerHTML = '<p class="note">评论加载失败：' + esc(err.message) + '</p>';
    }
  }

  /* ---------- 我的资料 ---------- */
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
      b.addEventListener('click', function () {
        var f = files.find(function (x) { return String(x.id) === b.getAttribute('data-share'); });
        if (f) openShareDialog(f);
      });
    });
    box.querySelectorAll('button[data-unshare]').forEach(function (b) {
      b.addEventListener('click', async function () {
        if (!(await askConfirm('取消分享？已导入到别人账号的副本不会被收回。'))) return;
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

  var searchTimer = null;
  $('#shareSearch').addEventListener('input', function () {
    clearTimeout(searchTimer);
    var v = this.value;
    searchTimer = setTimeout(function () { state.q = v.trim(); renderShares(); }, 160);
  });

  async function load() {
    try {
      var data = await api('GET');
      state.shares = data.shares || [];
      state.myFiles = data.myFiles || [];
      renderChips();
      renderShares();
      renderMine(state.myFiles);
    } catch (err) {
      alertBox('加载失败：' + err.message + '（请确认已登录）');
    }
  }

  window.AtlasUser.ready.then(load).catch(function () { alertBox('请先登录'); });
})();
