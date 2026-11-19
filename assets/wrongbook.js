/* 错题本：从 practice state 的 rec（wrong>0）汇总错题，join 题库后渲染成可打印的册子。
 * 题库走分片加载器按错题/收藏涉及的科目按需加载（推断不出时回退全量）；个人题从 /api/personal/questions 合并。
 * 2026-11-20：改为按科目选项卡隔离展示（每科一页、带计数，不再混排）；
 * 每题可「移出错题本」（错次清零 + 清艾宾浩斯排期 + 摘手动标记，保留做过/对题统计）
 * 或在收藏夹范围里「取消收藏」，均走现有 marks / state 数据层，两下确认（点一次变确认、再点执行）；
 * 新增「下载文件」：把当前选项卡的册子经 /api/wrongbook/export 以附件下载，
 * 供 App（WebView 内 window.print 无反应）保存错题，网页端仍用打印 / 存 PDF。 */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var SUBJECT_NAMES = { math: '数学一', math2: '数学二', math3: '数学三', english: '英语一', english2: '英语二', mechanics: '807 材料力学', politics: '政治' };
  var SUBJECT_ORDER = Object.keys(SUBJECT_NAMES);
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  var state = { items: new Map(), wrong: [], favs: [], due: new Set(), subject: null, scope: 'all', mode: 'answers', marks: { fav: {}, wb: {} }, missing: 0 };

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

  function collection() { return state.scope === 'fav' ? state.favs : state.wrong; }
  function subjectsOf(list) {
    var seen = [];
    list.forEach(function (w) { if (!seen.includes(w.q.subject)) seen.push(w.q.subject); });
    return seen.sort(function (a, b) {
      var ia = SUBJECT_ORDER.indexOf(a), ib = SUBJECT_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }
  function currentList() {
    return collection().filter(function (w) {
      if (state.subject && w.q.subject !== state.subject) return false;
      if (state.scope === 'due' && !state.due.has(w.q.id)) return false;
      return true;
    });
  }

  /* 科目选项卡：一科一页，标签带本范围内的题数；当前科目在该范围里没有题时自动落到第一科 */
  function buildTabs() {
    var list = collection();
    var subjects = subjectsOf(list);
    if (!subjects.includes(state.subject)) state.subject = subjects[0] || null;
    var box = $('#wbSubjectTabs');
    if (!box) return;
    box.innerHTML = subjects.map(function (s) {
      var n = list.filter(function (w) { return w.q.subject === s; }).length;
      return '<button type="button" role="tab" class="wb-tab' + (s === state.subject ? ' on' : '') +
        '" data-subject="' + esc(s) + '">' + esc(SUBJECT_NAMES[s] || s) + ' <span class="wb-tab-n">' + n + '</span></button>';
    }).join('');
    box.querySelectorAll('[data-subject]').forEach(function (b) {
      b.addEventListener('click', function () {
        state.subject = b.getAttribute('data-subject');
        buildTabs();
        render();
      });
    });
  }

  function itemHTML(w, i) {
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
    var act = state.scope === 'fav'
      ? '<div class="wb-actions"><button type="button" class="wb-act" data-unfav="' + esc(q.id) + '">取消收藏</button></div>'
      : '<div class="wb-actions"><button type="button" class="wb-act" data-remove="' + esc(q.id) + '">移出错题本</button></div>';
    return '<article class="wb-item">' +
      '<div class="wb-meta"><span class="wb-no">第 ' + (i + 1) + ' 题</span><span>' + esc(meta) + '</span>' +
      (r.manual
        ? '<span class="wb-wrong">手动加入' + (r.last ? ' · ' + fmtDate(r.last) : '') + '</span></div>'
        : '<span class="wb-wrong">错 ' + (r.wrong || 0) + ' 次' + (r.last ? ' · 最近 ' + fmtDate(r.last) : '') + '</span></div>') +
      '<div class="wb-body">' + questionHTML(q) + '</div>' + ans + act + '</article>';
  }

  function render() {
    var isFav = state.scope === 'fav';
    var list = currentList();
    var subjName = state.subject ? (SUBJECT_NAMES[state.subject] || state.subject) : '';
    $('#wbSummary').textContent = list.length
      ? '共 ' + list.length + (isFav ? ' 道收藏题' : ' 道错题') + (subjName ? '（' + subjName + '）' : '') + (state.mode === 'blank' ? '（自测版式：不含答案，打印后先做再回刷题页核对）' : '（带答案解析版式）')
      : (isFav ? '当前科目下没有收藏题。在学情分析的做题详情里点「☆ 收藏」就能把题目收进来。' : '当前科目下没有错题。');
    $('#wbList').innerHTML = list.map(itemHTML).join('');
    mathAll();
  }

  /* 两下确认：第一次点只把按钮变成「确认…？」，2.6 秒内再点才真正执行（WebView 里 confirm() 可能被壳吞掉，不用它） */
  function armButton(btn, label, fn) {
    if (btn.dataset.armed) { fn(); return; }
    btn.dataset.armed = '1';
    btn.classList.add('armed');
    var old = btn.textContent;
    btn.textContent = '确认' + label + '？';
    setTimeout(function () {
      if (btn.isConnected && btn.dataset.armed) { delete btn.dataset.armed; btn.classList.remove('armed'); btn.textContent = old; }
    }, 2600);
  }

  async function removeWrong(id) {
    if (state.marks.wb[id] && window.AtlasMarks) {
      try { await window.AtlasMarks.toggle('wb', id); } catch (e) {}
      delete state.marks.wb[id];
    }
    /* 与学情分析「重置这套」同一做法：现读现存——错次清零（seen/ok 保留，学情口径不变），排期删除 */
    try {
      var st = await window.AtlasUser.load('practice', { rec: {} });
      if (st && st.rec && st.rec[id] && st.rec[id].wrong > 0) {
        st.rec[id].wrong = 0;
        await window.AtlasUser.save('practice', st);
      }
    } catch (e) {}
    try {
      var rv = await window.AtlasUser.load('review', { sched: {} });
      if (rv && rv.sched && rv.sched[id]) {
        delete rv.sched[id];
        await window.AtlasUser.save('review', rv);
      }
    } catch (e) {}
    state.due.delete(id);
    state.wrong = state.wrong.filter(function (w) { return w.q.id !== id; });
    buildTabs();
    render();
  }

  async function removeFav(id) {
    if (window.AtlasMarks) { try { await window.AtlasMarks.toggle('fav', id); } catch (e) {} }
    delete state.marks.fav[id];
    state.favs = state.favs.filter(function (w) { return w.q.id !== id; });
    buildTabs();
    render();
  }

  /* ---------- 导出下载（App 兜底）：当前选项卡的册子 → 服务端附件 ---------- */
  var EXPORT_CSS = [
    'body{font-family:"Noto Sans CJK SC","PingFang SC","Microsoft YaHei",sans-serif;color:#2a2620;margin:24px;line-height:1.7}',
    'h1{font-size:20px;margin:0 0 4px}.sub{color:#6d6250;font-size:12px;margin-bottom:16px}',
    '.wb-item{border:1px solid #cbbfa5;border-radius:12px;padding:14px 16px;margin-top:12px;page-break-inside:avoid}',
    '.wb-meta{display:flex;gap:14px;font-size:12px;color:#6d6250;margin-bottom:8px}.wb-no{font-weight:700;color:#7a5b12}',
    '.wb-wrong{margin-left:auto;color:#a33b2e;font-weight:600}',
    '.wb-body p{margin:4px 0}.wb-opts{margin:6px 0 2px}.wb-opt{line-height:1.6}',
    '.wb-answer{margin-top:10px;padding-top:10px;border-top:1px dashed #c9b995}.wb-steps p{margin:3px 0;color:#3d382e}',
    '.katex{font-family:KaTeX_Main,"Times New Roman",serif}',
    '.katex-mathml{position:absolute;clip:rect(1px,1px,1px,1px);padding:0;border:0;height:1px;width:1px;overflow:hidden}',
    '#wbPrintBtn{padding:8px 18px;font-size:14px;margin-bottom:8px}@media print{#wbPrintBtn{display:none}}',
  ].join('\n');
  function exportHTML() {
    var clone = $('#wbList').cloneNode(true);
    clone.querySelectorAll('.wb-actions').forEach(function (n) { n.remove(); });
    var subjName = state.subject ? (SUBJECT_NAMES[state.subject] || state.subject) : '';
    var title = '错题本' + (state.scope === 'fav' ? ' · 收藏夹' : '') + (subjName ? ' · ' + subjName : '') +
      (state.mode === 'blank' ? ' · 自测版' : ' · 带答案解析');
    return '<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>' + esc(title) + ' · 考研科目大观</title><style>' + EXPORT_CSS + '</style></head><body>' +
      '<button id="wbPrintBtn" onclick="window.print()">打印 / 存 PDF</button>' +
      '<h1>' + esc(title) + '</h1><div class="sub">考研科目大观 · 导出于 ' + fmtDate(Date.now()) + ' · 共 ' + currentList().length + ' 题</div>' +
      clone.innerHTML + '</body></html>';
  }
  async function downloadExport() {
    var btn = $('#wbDownload');
    if (!currentList().length) { $('#wbSummary').textContent = '当前科目下没有可下载的题目。'; return; }
    btn.disabled = true;
    var old = btn.textContent;
    btn.textContent = '正在生成…';
    try {
      var subjName = state.subject ? (SUBJECT_NAMES[state.subject] || state.subject) : '全部';
      var data = await window.AtlasUser.json('/api/wrongbook/export', 'POST', {
        name: '错题本-' + subjName + (state.scope === 'fav' ? '-收藏夹' : '') + (state.mode === 'blank' ? '-自测版' : '') + '.html',
        html: exportHTML(),
      });
      if (!data || !data.url) throw new Error('服务端没有返回下载地址');
      window.location.href = data.url;
    } catch (e) {
      $('#wbSummary').textContent = '下载生成失败：' + e.message + '。网页端可改用「打印 / 存 PDF」。';
    }
    btn.disabled = false;
    btn.textContent = old;
  }

  async function init() {
    await window.AtlasUser.ready;
    var store = await window.AtlasUser.load('practice', { rec: {} });
    var rec = (store && store.rec) || {};
    var marks = { wb: {}, fav: {} };
    if (window.AtlasMarks) { try { marks = await window.AtlasMarks.load(); } catch (e) {} }
    /* 只加载错题/收藏涉及科目的题库分片（原先无条件全量加载约 15MB，是打开错题本慢的主因）；
       loadForIds 内部对无法推断或缺题的情况回退全量，最终题目集合与全量加载一致。 */
    var needIds = [];
    Object.keys(rec).forEach(function (id) { if (rec[id] && rec[id].wrong > 0) needIds.push(id); });
    Object.keys(marks.wb || {}).forEach(function (id) { needIds.push(id); });
    Object.keys(marks.fav || {}).forEach(function (id) { needIds.push(id); });
    if (window.AtlasQuestions) {
      if (window.AtlasQuestions.loadForIds) await window.AtlasQuestions.loadForIds(needIds);
      else await window.AtlasQuestions.load('all');
    }
    (window.QUESTIONS.items || []).forEach(function (q) { state.items.set(q.id, q); });
    try {
      var data = await window.AtlasUser.json('/api/personal/questions', 'GET');
      (data.items || []).forEach(function (q) { state.items.set(q.id, q); });
    } catch (e) {}
    if (window.AtlasReview) { try { state.due = new Set(await window.AtlasReview.due()); } catch (e) {} }
    Object.keys(rec).forEach(function (id) {
      var r = rec[id];
      if (!r || !(r.wrong > 0)) return;
      var q = state.items.get(id);
      if (!q) { state.missing++; return; }
      state.wrong.push({ q: q, rec: r });
    });
    state.wrong.sort(function (a, b) {
      return (b.rec.wrong || 0) - (a.rec.wrong || 0) || (b.rec.last || 0) - (a.rec.last || 0);
    });
    if (window.AtlasMarks) {
      try {
        state.marks = { fav: marks.fav || {}, wb: marks.wb || {} };
        Object.keys(state.marks.wb).forEach(function (id) {
          var q = state.items.get(id);
          if (q && !state.wrong.some(function (w) { return w.q.id === id; })) {
            state.wrong.push({ q: q, rec: { wrong: 0, manual: true, last: state.marks.wb[id] } });
          }
        });
        Object.keys(state.marks.fav).forEach(function (id) {
          var q = state.items.get(id);
          if (q) state.favs.push({ q: q, rec: { wrong: 0, last: state.marks.fav[id] } });
        });
      } catch (e) {}
    }
    buildTabs();

    if (!state.wrong.length && !state.favs.length) {
      $('#wbSummary').textContent = '你还没有错题记录，先去刷题页练一组，错题会自动收进这里。';
      return;
    }
    render();
    if (state.missing) $('#wbSummary').textContent += '（另有 ' + state.missing + ' 道错题的题目已不在题库中，未列出）';
  }

  $('#wbList').addEventListener('click', function (ev) {
    var rm = ev.target.closest ? ev.target.closest('[data-remove]') : null;
    if (rm) { armButton(rm, '移出', function () { removeWrong(rm.getAttribute('data-remove')); }); return; }
    var uf = ev.target.closest ? ev.target.closest('[data-unfav]') : null;
    if (uf) { armButton(uf, '取消收藏', function () { removeFav(uf.getAttribute('data-unfav')); }); }
  });
  $('#wbScope').addEventListener('change', function () { state.scope = this.value; buildTabs(); render(); });
  try { var q = new URLSearchParams(location.search); if (q.get('scope') === 'fav') { state.scope = 'fav'; $('#wbScope').value = 'fav'; } } catch (e) {}
  $('#wbMode').addEventListener('change', function () { state.mode = this.value; render(); });
  $('#wbPrint').addEventListener('click', function () { window.print(); });
  $('#wbDownload').addEventListener('click', downloadExport);
  init().catch(function (err) { $('#wbSummary').textContent = '加载失败：' + err.message; });
})();
