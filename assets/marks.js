/* 题目收藏 + 手动加入错题本：state 命名空间 marks = { fav: {qid: ts}, wb: {qid: ts} }，跨端同步。 */
(function () {
  'use strict';
  var cache = null, loading = null;
  function load() {
    if (cache) return Promise.resolve(cache);
    if (loading) return loading;
    if (!window.AtlasUser) return Promise.resolve({ fav: {}, wb: {} });
    loading = window.AtlasUser.load('marks', { fav: {}, wb: {} }).then(function (m) {
      cache = { fav: (m && m.fav) || {}, wb: (m && m.wb) || {} };
      loading = null;
      return cache;
    }).catch(function () { loading = null; return { fav: {}, wb: {} }; });
    return loading;
  }
  function save() {
    if (!window.AtlasUser || !cache) return Promise.resolve();
    return window.AtlasUser.save('marks', cache).catch(function () {});
  }
  function has(kind, qid) { return !!(cache && cache[kind] && cache[kind][qid]); }
  function toggle(kind, qid) {
    return load().then(function (m) {
      if (m[kind][qid]) delete m[kind][qid]; else m[kind][qid] = Date.now();
      return save().then(function () { return m; });
    });
  }
  function paintBtn(b, m) {
    var kind = b.hasAttribute('data-mark-fav') ? 'fav' : 'wb';
    var qid = b.getAttribute('data-mark-fav') || b.getAttribute('data-mark-wb');
    var on = !!(m && m[kind] && m[kind][qid]);
    b.classList.toggle('on', on);
    b.textContent = kind === 'fav' ? (on ? '★ 已收藏' : '☆ 收藏') : (on ? '✓ 已在错题本' : '＋ 加入错题本');
  }
  function wire(root) {
    if (!root || root.dataset.marksWired) return;
    root.dataset.marksWired = '1';
    root.addEventListener('click', function (ev) {
      var b = ev.target && ev.target.closest ? ev.target.closest('[data-mark-fav],[data-mark-wb]') : null;
      if (!b || !root.contains(b)) return;
      var kind = b.hasAttribute('data-mark-fav') ? 'fav' : 'wb';
      var qid = b.getAttribute('data-mark-fav') || b.getAttribute('data-mark-wb');
      if (!qid) return;
      toggle(kind, qid).then(function (m) {
        root.querySelectorAll('[data-mark-fav],[data-mark-wb]').forEach(function (x) { paintBtn(x, m); });
      });
    });
    load().then(function (m) {
      root.querySelectorAll('[data-mark-fav],[data-mark-wb]').forEach(function (x) { paintBtn(x, m); });
    });
  }
  window.AtlasMarks = { load: load, toggle: toggle, has: has, wire: wire };
})();
