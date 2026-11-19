/* 错题本：从 practice state 的 rec（wrong>0）汇总错题，join 题库后渲染成可打印的册子。
 * 题库走分片加载器全量加载；个人题从 /api/personal/questions 合并。 */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var SUBJECT_NAMES = { math: '数学一', math2: '数学二', math3: '数学三', english: '英语一', english2: '英语二', mechanics: '807 材料力学', politics: '政治' };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  var state = { items: new Map(), wrong: [], favs: [], due: new Set(), subject: 'all', scope: 'all', mode: 'answers' };

  function questionHTML(q) {
    var stem = [], opts = [];
    String(q.text || '').split('\n').forEach(function (ln) {
      var m = /^([A-H])[.．、]\s*(.*)$/.exec(ln.trim());
      if (m) opts.push({ l: m[1], t: m[2] });
      else if (ln.trim()) stem.push(ln);
    });
    var html = stem.map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('');
    if (opts.length) {
      html += '<div class="wb-opts">' + opts.map(function (o) {
        return '<div class="wb-opt"><b>' + o.l + '.</b> ' + esc(o.t) + '</div>';
      }).join('') + '</div>';
    }
    return html;
  }
  function mathAll() {
    if (window.AtlasKatex && window.AtlasKatex.render) { window.AtlasKatex.render(document.getElementById('wbList')); return; }
    if (window.renderMathInElement) {
      try {
        window.renderMathInElement(document.getElementById('wbList'), {
          delimiters: [
            { left: '\\(', right: '\\)', display: false },
            { left: '\\[', right: '\\]', display: true },
          ],
          throwOnError: false,
        });
      } catch (e) {}
    }
  }
  function fmtDate(ts) {
    if (!ts) return '';
    var d = new Date(ts);
    return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate();
  }

  function render() {
    var isFav = state.scope === 'fav';
    var list = (isFav ? state.favs : state.wrong).filter(function (w) {
      if (state.subject !== 'all' && w.q.subject !== state.subject) return false;
      if (state.scope === 'due' && !state.due.has(w.q.id)) return false;
      return true;
    });
    $('#wbSummary').textContent = list.length
      ? '共 ' + list.length + (isFav ? ' 道收藏题' : ' 道错题') + (state.mode === 'blank' ? '（自测版式：不含答案，打印后先做再回刷题页核对）' : '（带答案解析版式）')
      : (isFav ? '当前筛选下没有收藏题。在学情分析的做题详情里点「☆ 收藏」就能把题目收进来。' : '当前筛选下没有错题。');
    $('#wbList').innerHTML = list.map(function (w, i) {
      var q = w.q, r = w.rec;
      var meta = [SUBJECT_NAMES[q.subject] || q.subjectName || q.subject, q.chapterTitle || '', q.kpName || '']
        .filter(Boolean).join(' · ');
      var ans = '';
      if (state.mode === 'answers') {
        var steps = Array.isArray(q.steps) ? q.steps : (q.steps ? [q.steps] : []);
        ans = '<div class="wb-answer"><div class="wb-ans-line"><b>参考答案</b> ' + esc(q.answer || '（暂无）') + '</div>' +
          (steps.length ? '<div class="wb-steps">' + steps.map(function (s) { return '<p>' + esc(s) + '</p>'; }).join('') + '</div>' : '') +
          '</div>';
      }
      return '<article class="wb-item">' +
        '<div class="wb-meta"><span class="wb-no">第 ' + (i + 1) + ' 题</span><span>' + esc(meta) + '</span>' +
        (r.manual
          ? '<span class="wb-wrong">手动加入' + (r.last ? ' · ' + fmtDate(r.last) : '') + '</span></div>'
          : '<span class="wb-wrong">错 ' + (r.wrong || 0) + ' 次' + (r.last ? ' · 最近 ' + fmtDate(r.last) : '') + '</span></div>') +
        '<div class="wb-body">' + questionHTML(q) + '</div>' + ans + '</article>';
    }).join('');
    mathAll();
  }

  async function init() {
    await window.AtlasUser.ready;
    var store = await window.AtlasUser.load('practice', { rec: {} });
    var rec = (store && store.rec) || {};
    await window.AtlasQuestions.load('all');
    (window.QUESTIONS.items || []).forEach(function (q) { state.items.set(q.id, q); });
    try {
      var data = await window.AtlasUser.json('/api/personal/questions', 'GET');
      (data.items || []).forEach(function (q) { state.items.set(q.id, q); });
    } catch (e) {}
    if (window.AtlasReview) { try { state.due = new Set(await window.AtlasReview.due()); } catch (e) {} }
    var missing = 0;
    Object.keys(rec).forEach(function (id) {
      var r = rec[id];
      if (!r || !(r.wrong > 0)) return;
      var q = state.items.get(id);
      if (!q) { missing++; return; }
      state.wrong.push({ q: q, rec: r });
    });
    state.wrong.sort(function (a, b) {
      return (b.rec.wrong || 0) - (a.rec.wrong || 0) || (b.rec.last || 0) - (a.rec.last || 0);
    });
    if (window.AtlasMarks) {
      try {
        var marks = await window.AtlasMarks.load();
        Object.keys(marks.wb || {}).forEach(function (id) {
          var q = state.items.get(id);
          if (q && !state.wrong.some(function (w) { return w.q.id === id; })) {
            state.wrong.push({ q: q, rec: { wrong: 0, manual: true, last: marks.wb[id] } });
          }
        });
        Object.keys(marks.fav || {}).forEach(function (id) {
          var q = state.items.get(id);
          if (q) state.favs.push({ q: q, rec: { wrong: 0, last: marks.fav[id] } });
        });
      } catch (e) {}
    }
    var sel = $('#wbSubject');
    var subjects = [];
    state.wrong.forEach(function (w) { if (!subjects.includes(w.q.subject)) subjects.push(w.q.subject); });
    subjects.forEach(function (s) {
      var o = document.createElement('option');
      o.value = s;
      o.textContent = (SUBJECT_NAMES[s] || s) + '（' + state.wrong.filter(function (w) { return w.q.subject === s; }).length + '）';
      sel.appendChild(o);
    });
    if (!state.wrong.length && !state.favs.length) {
      $('#wbSummary').textContent = '你还没有错题记录，先去刷题页练一组，错题会自动收进这里。';
      return;
    }
    if (missing) $('#wbSummary').textContent = '有 ' + missing + ' 道错题的题目已不在题库中（可能来自已删除的个人资料），未列出。';
    render();
  }

  $('#wbSubject').addEventListener('change', function () { state.subject = this.value; render(); });
  try { var q = new URLSearchParams(location.search); if (q.get('scope') === 'fav') { state.scope = 'fav'; $('#wbScope').value = 'fav'; } } catch (e) {}
  $('#wbScope').addEventListener('change', function () { state.scope = this.value; render(); });
  $('#wbMode').addEventListener('change', function () { state.mode = this.value; render(); });
  $('#wbPrint').addEventListener('click', function () { window.print(); });
  init().catch(function (err) { $('#wbSummary').textContent = '加载失败：' + err.message; });
})();
