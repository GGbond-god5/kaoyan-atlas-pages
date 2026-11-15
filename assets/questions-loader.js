/* 题库分片加载器：题库按科目拆成 assets/questions/<科目>.js（构建时由 questions.js 切分），
   用到哪科加载哪科，不再首屏拉整包。分片文件调用 AtlasQuestions._add 注入题目。 */
(function () {
  'use strict';
  window.QUESTIONS = window.QUESTIONS || { items: [] };
  var SUBJECTS = ['math', 'math2', 'english', 'english2', 'mechanics', 'politics'];
  var loaded = {}, loading = {};
  function add(subject, items) {
    var have = new Set(window.QUESTIONS.items.map(function (q) { return q.id; }));
    var fresh = [];
    (items || []).forEach(function (q) {
      if (q && q.id && !have.has(q.id)) {
        have.add(q.id);
        window.QUESTIONS.items.push(q);
        fresh.push(q);
      }
    });
    loaded[subject] = true;
    if (window.AtlasQuestions._sink) window.AtlasQuestions._sink(fresh);
  }
  function load(subject) {
    if (!subject || subject === 'all') return Promise.all(SUBJECTS.map(load));
    if (loaded[subject]) return Promise.resolve();
    if (loading[subject]) return loading[subject];
    loading[subject] = new Promise(function (resolve, reject) {
      var sc = document.createElement('script');
      sc.src = 'assets/questions/' + encodeURIComponent(subject) + '.js?v=1';
      sc.onload = function () { loaded[subject] = true; resolve(); };
      sc.onerror = function () { delete loading[subject]; reject(new Error('题库分片加载失败：' + subject)); };
      document.head.appendChild(sc);
    });
    return loading[subject];
  }
  window.AtlasQuestions = {
    subjects: SUBJECTS,
    load: load,
    _add: add,
    _sink: null,
    isLoaded: function (s) { return !!loaded[s]; },
    manifest: fetch('assets/questions/manifest.json', { credentials: 'include' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .catch(function () { return null; }),
  };
})();
