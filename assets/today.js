/* 首页今日任务卡：汇总错题到期复习、单词到期复习与最近套卷进度，一屏直达。
 * 数据全部来自既有接口（state 命名空间 + /api/attempts），不新增后端。 */
(function () {
  'use strict';
  var card = document.getElementById('todayCard');
  if (!card) return;
  function dayKey() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  try { if (localStorage.getItem('atlas.today.dismissed') === dayKey()) return; } catch (e) {}
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function row(label, value, href, cta) {
    return '<div class="trow"><div class="tmeta"><span class="tlabel">' + esc(label) + '</span>' +
      '<span class="tvalue">' + esc(value) + '</span></div>' +
      (href ? '<a class="tgo" href="' + href + '">' + esc(cta || '去完成') + ' →</a>' : '') + '</div>';
  }
  async function init() {
    if (!window.AtlasUser) return;
    await window.AtlasUser.ready;
    var rows = [];
    if (window.AtlasReview) {
      try {
        var due = await window.AtlasReview.due();
        rows.push(row('错题复习', due.length ? due.length + ' 道已到期（艾宾浩斯回流）' : '暂无到期错题', 'practice.html?review=1', due.length ? '开始复习' : '去刷题'));
      } catch (e) {}
    }
    try {
      var v = await window.AtlasUser.load('vocab', { rec: {} });
      var rec = (v && v.rec) || {}, now = Date.now(), n = 0;
      Object.keys(rec).forEach(function (w) { var r = rec[w]; if (r && (r.d || 0) <= now && (r.l || 0) < 5) n++; });
      rows.push(row('单词复习', n ? n + ' 个单词到期' : '暂无到期单词', 'vocab.html', '去背单词'));
    } catch (e) {}
    try {
      var data = await window.AtlasUser.json('/api/attempts', 'GET');
      var list = (data.attempts || []).filter(function (a) { return a && a.createdAt; })
        .sort(function (a, b) { return String(a.createdAt).localeCompare(String(b.createdAt)); });
      if (!list.length) {
        rows.push(row('套卷 / 自测', '还没做过整套卷', 'practice.html', '去做一套'));
      } else {
        var last = list[list.length - 1], d = new Date(last.createdAt);
        var today = new Date().toDateString() === d.toDateString();
        rows.push(row('套卷 / 自测',
          (today ? '今日已完成一套' : '上次是 ' + (d.getMonth() + 1) + '月' + d.getDate() + '日') + '，共 ' + list.length + ' 套',
          today ? 'analytics.html' : 'practice.html', today ? '看分析' : '再做一套'));
      }
    } catch (e) {}
    if (!rows.length) return;
    card.innerHTML = '<div class="thead"><b>今日任务</b><button type="button" id="todayClose" aria-label="关闭">×</button></div>' + rows.join('');
    card.hidden = false;
    document.getElementById('todayClose').addEventListener('click', function () {
      card.hidden = true;
      try { localStorage.setItem('atlas.today.dismissed', dayKey()); } catch (e) {}
    });
  }
  init().catch(function () {});
})();
