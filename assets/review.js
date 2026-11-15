/* 错题艾宾浩斯回流：调度表存服务端 state 命名空间 review（{ sched: { 题id: { s: 阶段, due: 到期时间戳 } } }）。
 * 规则：做错 → 入表，1 天后到期；复习答对 → 阶段 +1，间隔依次 1/2/4/7/15/30 天，全部走完移出表（已掌握）；
 * 答错 → 回到第 1 天；自评「模糊」→ 阶段不变，改到明天再来。
 * 历史错题（practice.rec 里 wrong>0 但还没入表）首次加载时按最后作答时间 +1 天自动入表，老错题也能回流。 */
(function () {
  'use strict';
  var INTERVALS = [1, 2, 4, 7, 15, 30];
  var DAY = 86400000;
  var sched = null, loading = null, saveTimer = null;

  function persist() {
    if (saveTimer) return;
    saveTimer = setTimeout(function () {
      saveTimer = null;
      if (sched) window.AtlasUser.save('review', { sched: sched }).catch(function () {});
    }, 600);
  }

  function load() {
    if (sched) return Promise.resolve(sched);
    if (loading) return loading;
    loading = Promise.all([
      window.AtlasUser.load('review', { sched: {} }).catch(function () { return { sched: {} }; }),
      window.AtlasUser.load('practice', { rec: {} }).catch(function () { return { rec: {} }; }),
    ]).then(function (rs) {
      sched = (rs[0] && rs[0].sched) || {};
      var rec = (rs[1] && rs[1].rec) || {};
      var changed = false;
      Object.keys(rec).forEach(function (id) {
        var r = rec[id];
        if (r && r.wrong > 0 && !sched[id]) {
          sched[id] = { s: 0, due: (r.last || Date.now()) + INTERVALS[0] * DAY };
          changed = true;
        }
      });
      if (changed) persist();
      return sched;
    });
    return loading;
  }

  function note(id, kind) {
    load().then(function (s) {
      var now = Date.now();
      if (kind === 'wrong') {
        s[id] = { s: 0, due: now + INTERVALS[0] * DAY };
        persist();
      } else if (kind === 'fuzzy') {
        if (s[id]) { s[id].due = now + DAY; persist(); }
      } else if (kind === 'ok' && s[id]) {
        var e = s[id];
        e.s = (e.s || 0) + 1;
        if (e.s >= INTERVALS.length) delete s[id];
        else e.due = now + INTERVALS[e.s] * DAY;
        persist();
      }
    }).catch(function () {});
  }

  function due() {
    return load().then(function (s) {
      var now = Date.now();
      return Object.keys(s).filter(function (id) { return (s[id].due || 0) <= now; });
    });
  }

  window.AtlasReview = { note: note, due: due, load: load, intervals: INTERVALS };
})();
