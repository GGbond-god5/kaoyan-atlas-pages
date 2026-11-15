/* 后台批改续跑 + 消息中心（全站共享）
 * 交卷后批改进度存 localStorage：用户离开刷题页去用其他功能时，
 * 任意页面打开都会接着把没批完的题批完；全部完成时写入站内消息（inbox 状态）
 * 并发系统通知。批改结果本来就存服务器，套卷分析下次打开即是最新数据。 */
(function () {
  if (!window.AtlasUser) return;
  var KEY = 'atlasGradeQueue.v1';
  function read() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function write(rec) { try { if (rec) localStorage.setItem(KEY, JSON.stringify(rec)); else localStorage.removeItem(KEY); } catch (e) {} }
  function relTime(ts) {
    var d = Date.now() - ts;
    if (d < 60000) return '刚刚';
    if (d < 3600000) return Math.floor(d / 60000) + ' 分钟前';
    if (d < 86400000) return Math.floor(d / 3600000) + ' 小时前';
    var dt = new Date(ts); return (dt.getMonth() + 1) + '月' + dt.getDate() + '日';
  }
  async function inboxAdd(msg) {
    try {
      var cur = await window.AtlasUser.load('inbox', { messages: [] });
      var list = (cur && cur.messages) || [];
      list.unshift(msg);
      await window.AtlasUser.save('inbox', { messages: list.slice(0, 30) });
    } catch (e) { /* 消息写不进不影响批改 */ }
  }
  function sysNotify(title, body) {
    try {
      if (window.AtlasApp && window.AtlasApp.notify) { window.AtlasApp.notify(title, body); return; }
    } catch (e) {}
    try {
      if ('Notification' in window && Notification.permission === 'granted') new Notification(title, { body: body });
    } catch (e) {}
  }
  var pill = null;
  var lastDoneId = null;
  function showPill(text, sticky) {
    if (!pill) {
      pill = document.createElement('button');
      pill.type = 'button';
      pill.id = 'gradeBgPill';
      var st = document.createElement('style');
      st.textContent = '#gradeBgPill{position:fixed;left:50%;transform:translateX(-50%);bottom:' + (window.AtlasApp ? '88px' : '18px') + ';z-index:200;background:#17161A;color:#F7F2E7;border:0;border-radius:999px;padding:10px 18px;font-size:13.5px;box-shadow:0 8px 24px rgba(0,0,0,.28);cursor:pointer;max-width:92vw}';
      document.head.appendChild(st);
      pill.addEventListener('click', function () { location.href = 'analytics.html' + (lastDoneId ? '?attempt=' + encodeURIComponent(lastDoneId) : ''); });
      document.body.appendChild(pill);
    }
    pill.textContent = text;
    pill.hidden = false;
    if (!sticky) setTimeout(function () { if (pill) pill.hidden = true; }, 8000);
  }
  function hidePill() { if (pill) pill.hidden = true; }

  async function finish(rec) {
    write(null); hidePill();
    if (!rec.notified) {
      rec.notified = true;
      await inboxAdd({ id: 'g' + rec.attemptId, kind: 'grade', attemptId: rec.attemptId, title: rec.title || '套卷', at: Date.now(), read: false });
      sysNotify('批改完成', '「' + (rec.title || '套卷') + '」已全部批改，去套卷分析看成绩和解析');
    }
    lastDoneId = rec.attemptId;
    showPill('✓ 批改完成，点此看这套的评分与解析');
  }

  var running = false;
  async function resume() {
    if (running) return;
    var rec = read();
    if (!rec || !rec.pending || !rec.pending.length) { if (rec && rec.pending && !rec.pending.length) finish(rec); return; }
    if (/practice\.html/.test(location.pathname)) return; // 刷题页自己驱动
    running = true;
    var total = rec.total || rec.pending.length;
    var doneBase = total - rec.pending.length;
    showPill('后台批改中 ' + doneBase + '/' + total + ' · 点此看进度', true);
    var queue = rec.pending.slice();
    var cursor = 0;
    async function worker() {
      while (cursor < queue.length) {
        var qid = queue[cursor++];
        var cur = read(); if (!cur || cur.attemptId !== rec.attemptId) return;
        try {
          await window.AtlasUser.json('/api/attempts/' + encodeURIComponent(rec.attemptId) + '/grade', 'POST', { questionId: qid });
          cur = read(); if (!cur) return;
          cur.pending = cur.pending.filter(function (x) { return x !== qid; });
          write(cur);
          showPill('后台批改中 ' + (total - cur.pending.length) + '/' + total + ' · 点此看进度', true);
        } catch (e) {
          cur = read(); if (!cur) return;
          cur.tries = cur.tries || {};
          cur.tries[qid] = (cur.tries[qid] || 0) + 1;
          if (cur.tries[qid] >= 5) cur.pending = cur.pending.filter(function (x) { return x !== qid; });
          write(cur);
        }
      }
    }
    await Promise.all([worker(), worker()]);
    running = false;
    var end = read();
    if (end && end.attemptId === rec.attemptId && !end.pending.length) finish(end);
    else if (end && end.pending.length) showPill('批改未完成，下次打开任意页面会继续');
  }

  window.AtlasGradeBg = {
    save: function (rec) {
      if (!rec || !rec.attemptId) return;
      write({ attemptId: rec.attemptId, title: rec.title || '', pending: (rec.pending || []).slice(), total: rec.total || (rec.pending || []).length, tries: {}, notified: false, at: Date.now() });
    },
    done: function (qid) {
      var rec = read(); if (!rec) return;
      rec.pending = rec.pending.filter(function (x) { return x !== qid; });
      write(rec);
    },
    fail: function (qid) {
      var rec = read(); if (!rec) return;
      rec.tries = rec.tries || {};
      rec.tries[qid] = (rec.tries[qid] || 0) + 1;
      if (rec.tries[qid] >= 5) rec.pending = rec.pending.filter(function (x) { return x !== qid; });
      write(rec);
    },
    complete: function (attemptId) {
      var rec = read();
      if (rec && rec.attemptId === attemptId) { rec.pending = []; finish(rec); }
    },
    inbox: async function () {
      try {
        var cur = await window.AtlasUser.load('inbox', { messages: [] });
        return (cur && cur.messages) || [];
      } catch (e) { return []; }
    },
    markAllRead: async function () {
      try {
        var cur = await window.AtlasUser.load('inbox', { messages: [] });
        var list = ((cur && cur.messages) || []).map(function (m) { return Object.assign({}, m, { read: true }); });
        await window.AtlasUser.save('inbox', { messages: list });
        return list;
      } catch (e) { return []; }
    },
    relTime: relTime,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(resume, 600); });
  else setTimeout(resume, 600);
})();
