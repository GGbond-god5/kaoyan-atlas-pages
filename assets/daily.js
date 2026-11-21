/* 首页两件小事：考试节点轴 + 每日一题。
 * 节点轴：2027 届考研关键节点（初试 2026-12-19 为确切日期，出分/国家线/复试/录取为历年惯例月份，标注「约」）。
 * 每日一题：题池 assets/daily-data.js（scripts/build-daily.py 从题库抽独立客观单选题生成），
 * 按日期在用户档案科目内轮换；答错自动加入错题本（AtlasMarks wb），当日结果存 localStorage。
 * 英语/807 暂无独立客观题（阅读/作文/大题形态不适合一题卡），轮换只在数学一二三与政治间进行。 */
(function () {
  'use strict';
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------------- 考试节点轴 ---------------- */
  var MILESTONES = [
    { name: '初试', date: '2026-12-19', label: '12月19日' },
    { name: '出分', date: '2027-02-24', label: '2月下旬 · 约' },
    { name: '国家线', date: '2027-03-15', label: '3月中旬 · 约' },
    { name: '复试调剂', date: '2027-03-28', label: '3月下旬–4月 · 约' },
    { name: '录取', date: '2027-05-15', label: '4–5月 · 约' }
  ];
  function renderAxis() {
    var box = document.getElementById('examAxis');
    if (!box) return;
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var nowIdx = MILESTONES.length - 1;
    for (var i = 0; i < MILESTONES.length; i++) {
      if (today < new Date(MILESTONES[i].date + 'T00:00:00')) { nowIdx = i; break; }
    }
    box.innerHTML = '<div class="ax-title">2027 考研 · 考试节点</div><div class="ax-track">' +
      MILESTONES.map(function (m, i) {
        var cls = i < nowIdx ? 'done' : i === nowIdx ? 'now' : '';
        return '<div class="ax-node ' + cls + '"><span class="ax-dot"></span>' +
          '<div class="ax-name">' + esc(m.name) + '</div><div class="ax-date">' + esc(m.label) + '</div></div>';
      }).join('') + '</div>';
  }

  /* ---------------- 每日一题 ---------------- */
  var SUBJECT_NAMES = { math: '数学一', math2: '数学二', math3: '数学三', politics: '政治' };
  var ROTATION = ['math', 'math2', 'math3', 'politics'];
  function dayIndex() { return Math.floor(Date.now() / 86400000); }
  function dayKey() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }

  function loadPool() {
    return new Promise(function (res) {
      if (window.DAILY_POOL) return res(window.DAILY_POOL);
      var sc = document.createElement('script');
      sc.src = 'assets/daily-data.js?v=1';
      sc.onload = function () { res(window.DAILY_POOL || {}); };
      sc.onerror = function () { res({}); };
      document.head.appendChild(sc);
    });
  }

  async function renderDaily() {
    var card = document.getElementById('dailyCard');
    if (!card) return;
    var pool = await loadPool();
    var avail = ROTATION.filter(function (s) { return pool[s] && pool[s].length; });
    if (!avail.length) return;
    var subjects = avail;
    try {
      if (window.AtlasUser) {
        await window.AtlasUser.ready;
        var prof = await window.AtlasUser.load('profile', {});
        var vars = (prof && prof.variants) || {};
        var poolIds = [];
        ((prof && prof.subjects) || []).forEach(function (s) {
          if (s === 'math') poolIds.push(vars.math === 'math2' ? 'math2' : vars.math === 'math3' ? 'math3' : 'math');
          else if (s === 'politics') poolIds.push('politics');
        });
        var mine = poolIds.filter(function (s) { return avail.includes(s); });
        if (mine.length) subjects = ROTATION.filter(function (s) { return mine.includes(s); });
      }
    } catch (e) {}
    var di = dayIndex();
    var subject = subjects[di % subjects.length];
    var q = pool[subject][di % pool[subject].length];
    if (!q) return;

    var storeKey = 'atlas.daily.' + dayKey();
    var done = null;
    try { done = JSON.parse(localStorage.getItem(storeKey) || 'null'); } catch (e) {}
    if (done && done.id !== q.id) done = null;

    card.hidden = false;
    card.innerHTML =
      '<div class="d-head"><span class="d-title">每日一题</span>' +
      '<span class="d-sub">' + esc(SUBJECT_NAMES[subject] || subject) + (q.year ? ' · ' + esc(q.year) + ' 真题' : '') +
      (q.kp ? ' · ' + esc(q.kp) : '') + '</span></div>' +
      '<div class="d-stem">' + esc(q.stem) + '</div>' +
      '<div class="d-opts">' + q.options.map(function (op, i) {
        var L = 'ABCD'[i];
        return '<button type="button" class="d-opt" data-l="' + L + '">' + L + '. ' + esc(op) + '</button>';
      }).join('') + '</div><div class="d-exp" hidden></div>';

    if (window.renderMathInElement) { try { window.renderMathInElement(card, { delimiters: [{ left: '\\(', right: '\\)', display: false }, { left: '\\[', right: '\\]', display: true }], throwOnError: false }); } catch (e) {} }

    var exp = card.querySelector('.d-exp');
    function paint(picked) {
      card.querySelectorAll('.d-opt').forEach(function (b) {
        b.disabled = true;
        if (b.dataset.l === q.answer) b.classList.add('right');
        else if (b.dataset.l === picked) b.classList.add('wrong');
      });
      exp.hidden = false;
      exp.innerHTML = '<b>' + (picked === q.answer ? '答对了 ✓' : '答错了，正确答案 ' + q.answer) + '</b><br>' +
        q.steps.map(esc).join('<br>') +
        (picked !== q.answer ? '<div class="d-note">已自动加入错题本，记得去复盘。</div>' : '');
      if (window.renderMathInElement) { try { window.renderMathInElement(exp, { delimiters: [{ left: '\\(', right: '\\)', display: false }, { left: '\\[', right: '\\]', display: true }], throwOnError: false }); } catch (e) {} }
    }
    if (done) { paint(done.picked); return; }
    card.querySelectorAll('.d-opt').forEach(function (b) {
      b.addEventListener('click', function () {
        var picked = b.dataset.l;
        try { localStorage.setItem(storeKey, JSON.stringify({ id: q.id, picked: picked })); } catch (e) {}
        if (picked !== q.answer && window.AtlasMarks) {
          window.AtlasMarks.load().then(function (m) {
            if (!m.wb || !m.wb[q.id]) return window.AtlasMarks.toggle('wb', q.id);
          }).catch(function () {});
        }
        paint(picked);
      });
    });
  }

  renderAxis();
  renderDaily();
})();
