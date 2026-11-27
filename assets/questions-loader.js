/* 题库分片加载器：题库按科目拆成 assets/questions/<科目>.js（构建时由 questions.js 切分），
   用到哪科加载哪科，不再首屏拉整包。分片文件调用 AtlasQuestions._add 注入题目。 */
(function () {
  'use strict';
  window.QUESTIONS = window.QUESTIONS || { items: [] };
  var SUBJECTS = ['math', 'math2', 'math3', 'english', 'english2', 'mechanics', 'politics'];
  var loaded = {}, loading = {};
  var haveIds = new Set((window.QUESTIONS.items || []).map(function (q) { return q && q.id; }).filter(Boolean));
  /* 分片目录（2026-11-22 定版）：公开包 questions-guest 只含真题，全量包 questions 含全部资料。
     版权分级后按账号版本选包：内测版账号（me.edition='beta'，含管理员）走全量，
     普通版账号与游客只走公开包——与中间件对全量分片的内测门禁同口径，前端选错包也会被服务端挡下。
     静态内测包（ATLAS_BETA）满血走全量；参赛版（ATLAS_CONTEST）走公开包；正式站按 /api/auth/me 判定。 */
  var dirPromise = null;
  function shardDir() {
    if (dirPromise) return dirPromise;
    if (window.ATLAS_BETA) dirPromise = Promise.resolve('assets/questions/');
    else if (window.ATLAS_CONTEST) dirPromise = Promise.resolve('assets/questions-guest/');
    else dirPromise = fetch('/api/auth/me', { credentials: 'include' })
      .then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (d) { return (d && d.user && d.user.edition === 'beta') ? 'assets/questions/' : 'assets/questions-guest/'; }) // me 接口对游客也回 200（user 为 null），必须看 user.edition 不能看状态码
      .catch(function () { return 'assets/questions-guest/'; });
    return dirPromise;
  }
  function add(subject, items) {
    var fresh = [];
    (items || []).forEach(function (q) {
      if (q && q.id && !haveIds.has(q.id)) {
        haveIds.add(q.id);
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
    loading[subject] = shardDir().then(function (dir) {
      return new Promise(function (resolve, reject) {
        var sc = document.createElement('script');
        sc.src = dir + encodeURIComponent(subject) + '.js?v=1';
        sc.onload = function () { loaded[subject] = true; resolve(); };
        sc.onerror = function () { delete loading[subject]; reject(new Error('题库分片加载失败：' + subject)); };
        document.head.appendChild(sc);
      });
    });
    return loading[subject];
  }
  /* 题目 id 前缀 -> 科目分片。错题本、到期复盘等场景只需要少数科目的题目，
     先按 id 前缀推断要加载的分片，避免无条件把 7 个分片（约 15MB）全部下载解析。
     前缀对不上的 id 视为 unknown，调用方必须回退全量加载，保证不漏题。 */
  var ID_PREFIX_SUBJECT = {
    math: 'math', math2: 'math2', math3: 'math3',
    eng: 'english', english: 'english', eng2: 'english2',
    '807': 'mechanics', mech: 'mechanics',
    pol: 'politics', x1000: 'politics',
  };
  function subjectOfId(id) {
    if (!id || typeof id !== 'string') return null;
    return ID_PREFIX_SUBJECT[id.split('-')[0]] || null;
  }
  function subjectsForIds(ids) {
    var subjects = [], seen = {}, unknown = false;
    (ids || []).forEach(function (id) {
      var s = subjectOfId(id);
      if (!s) { unknown = true; return; }
      if (!seen[s]) { seen[s] = true; subjects.push(s); }
    });
    return { subjects: subjects, unknown: unknown };
  }
  /* 只加载 ids 涉及科目的分片；出现无法推断的 id、或分片加载后仍缺题（前缀表与题库不一致）时回退全量。 */
  function loadForIds(ids) {
    ids = ids || [];
    if (!ids.length) return Promise.resolve();
    var need = subjectsForIds(ids);
    if (need.unknown || !need.subjects.length) return load('all');
    return Promise.all(need.subjects.map(load)).then(function () {
      var have = {};
      window.QUESTIONS.items.forEach(function (q) { have[q.id] = true; });
      var missing = ids.some(function (id) { return subjectOfId(id) && !have[id]; });
      if (missing) return load('all');
    });
  }
  window.AtlasQuestions = {
    subjects: SUBJECTS,
    load: load,
    loadForIds: loadForIds,
    subjectOfId: subjectOfId,
    subjectsForIds: subjectsForIds,
    _add: add,
    _sink: null,
    isLoaded: function (s) { return !!loaded[s]; },
    manifest: shardDir().then(function (dir) {
      return fetch(dir + 'manifest.json', { credentials: 'include' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });
    }),
  };
})();
