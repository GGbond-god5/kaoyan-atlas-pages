/* 套卷分析：数据全部来自 /api/attempts（套卷/模考的作答与批改结果），在本页内聚合，不新增后端接口。
 * 口径：得分率 = score/maxScore；满分=1，未满分<1，低分<0.5。只统计 status 为 graded 的题。 */
(function () {
  'use strict';
  var SUBJECT_NAMES = { math: '数学一', math2: '数学二', mechanics: '807 材料力学', english: '英语一', english2: '英语二', politics: '政治' };
  function subjectName(id, attempts) { if (SUBJECT_NAMES[id]) return SUBJECT_NAMES[id]; for (var i = 0; i < (attempts || []).length; i++) { var qs = attempts[i].questions || []; for (var j = 0; j < qs.length; j++) if (qs[j].subject === id && qs[j].subjectName) return qs[j].subjectName; } return id; }
  var state = { subject: 'all', attempts: [], targets: {} };
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var pct = function (x) { return Math.round(x * 100) + '%'; };

  function rate(r) { return r && r.status === 'graded' && Number(r.maxScore) > 0 ? Number(r.score) / Number(r.maxScore) : null; }

  function paperTitle(a) {
    if (a.mode === 'mock') return subjectName(a.subject, [a]) + ' · 全真模考';
    if (a.mode === 'diagnostic') return subjectName(a.subject, [a]) + ' · 能力自测';
    var q0 = (a.questions || [])[0] || {};
    return q0.chapterTitle || subjectName(a.subject, [a]) + ' · 套卷';
  }

  function paperStats(a) {
    var qs = a.questions || [], graded = 0, score = 0, max = 0, wrong = [];
    qs.forEach(function (q, i) {
      var r = (a.results || {})[q.id], rt = rate(r);
      if (rt === null) return;
      graded++; score += Number(r.score); max += Number(r.maxScore);
      if (rt < 1) wrong.push({ no: i + 1, id: q.id, kp: q.kp || '', kpName: q.kpName || '', chapter: q.chapter || '', chapterTitle: q.chapterTitle || '', kind: q.kind || '', rate: rt });
    });
    return { id: a.id, title: paperTitle(a), subject: a.subject, mode: a.mode, total: qs.length, graded: graded, score: score, max: max, rate: max > 0 ? score / max : null, wrong: wrong };
  }

  function aggregate(papers, keyOf, labelOf) {
    var map = {};
    papers.forEach(function (p) {
      var a = p._attempt;
      (a.questions || []).forEach(function (q) {
        var rt = rate((a.results || {})[q.id]);
        if (rt === null) return;
        var k = keyOf(q, a);
        if (!k) return;
        var e = map[k] || (map[k] = { key: k, label: labelOf(q, a), subject: q.subject || a.subject, chapter: q.chapter || '', kp: q.kp || '', n: 0, full: 0, zero: 0, sum: 0 });
        e.n++; e.sum += rt; if (rt >= 1) e.full++; if (rt <= 0) e.zero++;
      });
    });
    return Object.values(map).map(function (e) { e.avg = e.sum / e.n; e.missRate = (e.n - e.full) / e.n; return e; });
  }

  function bankLink(e) {
    var base = (window.ATLAS_CONFIG && window.ATLAS_CONFIG.bankBase) || 'bank.html';
    if (!e.kp) return '';
    return ' <a href="' + esc(base) + '?subject=' + encodeURIComponent(e.subject) + '&chapter=' + encodeURIComponent(e.chapter) + '&kp=' + encodeURIComponent(e.kp) + '">去题库练这个考点 ↗</a>';
  }

  function buildAdvice(papers, kps, kinds) {
    var out = [];
    var weak = kps.filter(function (e) { return e.n >= 2 && e.missRate >= 0.5; }).sort(function (x, y) { return y.missRate - x.missRate || y.n - x.n; });
    weak.slice(0, 3).forEach(function (e) {
      out.push('优先攻克「' + esc(e.label) + '」：' + e.n + ' 道题里 ' + (e.n - e.full) + ' 道没拿满分，未满分率 ' + pct(e.missRate) + '，平均得分率 ' + pct(e.avg) + '。' + bankLink(e));
    });
    /* 连续两套（含最近）都未满分的考点 */
    if (papers.length >= 2) {
      var recent = [papers[papers.length - 1], papers[papers.length - 2]];
      var both = {};
      recent[0].wrong.forEach(function (w) { if (w.kpName) both[w.kpName] = true; });
      var again = recent[1].wrong.filter(function (w) { return w.kpName && both[w.kpName]; }).map(function (w) { return w.kpName; });
      again = Array.from(new Set(again)).slice(0, 3);
      if (again.length) out.push('反复错的考点（最近两套都丢分）：' + again.map(esc).join('、') + '。这类题先回看解析、隔 2–3 天再重做错题，比刷新题有效。');
    }
    var latest = papers[papers.length - 1];
    if (latest && latest.wrong.length) {
      var byChapter = {};
      latest.wrong.forEach(function (w) { if (w.chapterTitle) byChapter[w.chapterTitle] = (byChapter[w.chapterTitle] || 0) + 1; });
      var top = Object.entries(byChapter).sort(function (x, y) { return y[1] - x[1]; })[0];
      if (top && top[1] >= 2) out.push('最近一套的错题集中在「' + esc(top[0]) + '」（' + top[1] + ' 道），先把这一章的错题逐道订正，再做下一套。');
    }
    var worstKind = kinds.filter(function (e) { return e.n >= 3; }).sort(function (x, y) { return x.avg - y.avg; })[0];
    if (worstKind && worstKind.avg < 0.7) out.push('题型短板是「' + esc(worstKind.label) + '」：平均得分率只有 ' + pct(worstKind.avg) + '，建议用按知识点模式做该题型的专项练习。');
    if (papers.length >= 3) {
      var rs = papers.map(function (p) { return p.rate; }).filter(function (x) { return x !== null; });
      var prevAvg = rs.slice(0, -1).reduce(function (s, x) { return s + x; }, 0) / (rs.length - 1);
      var last = rs[rs.length - 1];
      if (last < prevAvg - 0.05) out.push('最近一套得分率 ' + pct(last) + '，低于此前平均 ' + pct(prevAvg) + '，先复盘这套的错题号再继续刷新卷。');
      else if (last > prevAvg + 0.05) out.push('最近一套得分率 ' + pct(last) + '，高于此前平均 ' + pct(prevAvg) + '，走势在往上走，保持当前节奏。');
    }
    if (!out.length) out.push('暂时没有突出的薄弱点：样本还少或得分比较稳。继续按套卷推进，错题号会同步累积到这里。');
    return out;
  }

  function summaryText(papers, kps, kinds, adviceCount) {
    var lines = ['这是我的套卷作答数据统计（' + papers.length + ' 套）：'];
    papers.forEach(function (p, i) {
      lines.push('第' + (i + 1) + '套 ' + p.title + '：得分率 ' + (p.rate === null ? '未批改完' : pct(p.rate)) + '，错题号 ' + (p.wrong.map(function (w) { return '第' + w.no + '题'; }).join('、') || '无'));
    });
    var weak = kps.filter(function (e) { return e.n >= 2; }).sort(function (x, y) { return y.missRate - x.missRate; }).slice(0, 5);
    if (weak.length) lines.push('薄弱知识点：' + weak.map(function (e) { return e.label + '（' + e.n + '题，未满分率' + pct(e.missRate) + '）'; }).join('；'));
    lines.push('请基于这些数据给我一份简短的提升建议：先指出最该优先处理的 1–2 个问题，再给接下来一周的具体练法。不要编造数据里没有的错题或分数。');
    return lines.join('\n');
  }

  function render() {
    var papers = state.attempts
      .filter(function (a) { return state.subject === 'all' || a.subject === state.subject; })
      .map(function (a) { var s = paperStats(a); s._attempt = a; return s; })
      .filter(function (p) { return p.graded > 0; });
    var has = papers.length > 0;
    ['#overview', '#trendCard', '#gapCard', '#kpCard', '#kindCard', '#papersCard', '#adviceCard'].forEach(function (s) { $(s).hidden = !has; });
    $('#emptyCard').hidden = has;
    if (!has) return;

    var totQ = papers.reduce(function (s, p) { return s + p.graded; }, 0);
    var totRate = papers.reduce(function (s, p) { return s + (p.rate || 0) * p.graded; }, 0) / Math.max(1, totQ);
    var wrongCount = papers.reduce(function (s, p) { return s + p.wrong.length; }, 0);
    $('#overview').innerHTML = [
      ['已分析套卷', papers.length + ' 套'],
      ['已批改题量', totQ + ' 题'],
      ['整体得分率', pct(totRate)],
      ['未满分题', wrongCount + ' 题'],
      ['最近一套得分率', papers[papers.length - 1].rate === null ? '—' : pct(papers[papers.length - 1].rate)],
    ].map(function (x) { return '<div class="stat"><b>' + esc(x[1]) + '</b><span>' + esc(x[0]) + '</span></div>'; }).join('');

    $('#trend').innerHTML = papers.map(function (p) {
      var h = Math.max(4, Math.round((p.rate || 0) * 100));
      return '<div class="tbar"><em>' + pct(p.rate || 0) + '</em><i style="height:' + h + '%"></i><small title="' + esc(p.title) + '">' + esc(p.title) + '</small></div>';
    }).join('');

    /* 目标差距：每科取最近一套的得分率，折算到满分后与自设目标分对比 */
    var FULL = { math: 150, math2: 150, mechanics: 150, english: 100, english2: 100, politics: 100 };
    var bySubject = {};
    papers.forEach(function (p) { bySubject[p.subject] = p; });
    var gapRows = [], estSum = 0, tgtSum = 0, allTgt = true;
    Object.keys(bySubject).forEach(function (sid) {
      var p = bySubject[sid], full = FULL[sid] || 100;
      var est = p.rate === null ? null : Math.round(p.rate * full * 10) / 10;
      if (est !== null) estSum += est;
      var tgt = state.targets[sid];
      if (tgt == null || tgt === '') allTgt = false; else tgtSum += Number(tgt) || 0;
      gapRows.push({ sid: sid, name: subjectName(sid, state.attempts), rate: p.rate, est: est, full: full, tgt: tgt });
    });
    if (!gapRows.length) allTgt = false;
    $('#gapList').innerHTML = gapRows.map(function (r) {
      var gap = (r.tgt != null && r.tgt !== '' && r.est !== null) ? Math.round((Number(r.tgt) - r.est) * 10) / 10 : null;
      var gapTxt = gap === null ? '未设目标' : (gap > 0 ? '还差 ' + gap + ' 分' : '已超过目标 ' + Math.abs(gap) + ' 分');
      return '<div class="row"><div class="rhead"><b>' + esc(r.name) + '</b><span>最近得分率 ' + (r.rate === null ? '—' : pct(r.rate)) + ' · 折算 ' + (r.est === null ? '—' : r.est) + ' / ' + r.full + '</span></div>' +
        '<div class="rmeta">目标 <input type="number" min="0" max="' + r.full + '" step="1" value="' + (r.tgt == null ? '' : esc(r.tgt)) + '" data-target="' + esc(r.sid) + '" style="width:76px;padding:2px 6px"> 分 · ' + gapTxt + '</div>' +
        '<div class="bar"><i style="width:' + Math.round((r.est || 0) / r.full * 100) + '%"></i></div></div>';
    }).join('') || '<p class="sub">暂无数据。</p>';
    $('#gapTotal').textContent = gapRows.length
      ? '预估总分（已做科目按最近一套折算）约 ' + (Math.round(estSum * 10) / 10) + ' 分' +
        (allTgt ? ' · 目标总分 ' + tgtSum + ' 分 · ' + (tgtSum - estSum > 0 ? '还差 ' + (Math.round((tgtSum - estSum) * 10) / 10) + ' 分' : '已达到目标总分') : ' · 把各科目标都设上后，这里会显示总分差距')
      : '';
    $('#gapList').querySelectorAll('input[data-target]').forEach(function (inp) {
      inp.addEventListener('change', function () {
        var sid = inp.getAttribute('data-target');
        if (inp.value === '') delete state.targets[sid];
        else state.targets[sid] = Math.max(0, Number(inp.value) || 0);
        window.AtlasUser.save('goals', { targets: state.targets }).then(function () { render(); }).catch(function () {});
      });
    });

    var kps = aggregate(papers, function (q) { return q.kp || q.kpName ? (q.subject + '|' + (q.kp || q.kpName)) : ''; }, function (q) { return q.kpName || q.kp || '未标注考点'; })
      .sort(function (x, y) { return y.missRate - x.missRate || y.n - x.n; });
    $('#kpList').innerHTML = kps.slice(0, 12).map(function (e) {
      return '<div class="row"><div class="rhead"><b>' + esc(e.label) + '</b><span>未满分率 ' + pct(e.missRate) + ' · 平均得分率 ' + pct(e.avg) + '</span></div>' +
        '<div class="rmeta">' + e.n + ' 道已批改 · 满分 ' + e.full + ' 道 · 零分 ' + e.zero + ' 道' + bankLink(e) + '</div>' +
        '<div class="bar"><i style="width:' + Math.round(e.avg * 100) + '%"></i></div></div>';
    }).join('') || '<p class="sub">暂无数据。</p>';

    var kinds = aggregate(papers, function (q) { return q.kind || ''; }, function (q) { return q.kind || '未标注题型'; })
      .sort(function (x, y) { return x.avg - y.avg; });
    $('#kindList').innerHTML = kinds.map(function (e) {
      return '<div class="row"><div class="rhead"><b>' + esc(e.label) + '</b><span>平均得分率 ' + pct(e.avg) + '</span></div>' +
        '<div class="rmeta">' + e.n + ' 道已批改</div><div class="bar good"><i style="width:' + Math.round(e.avg * 100) + '%"></i></div></div>';
    }).join('') || '<p class="sub">暂无数据。</p>';

    $('#paperList').innerHTML = papers.slice().reverse().map(function (p) {
      var chips = p.wrong.length ? p.wrong.map(function (w) {
        return '<span class="chip' + (w.rate > 0 ? ' part' : '') + '" title="' + esc(w.kpName || w.kind) + '">第' + w.no + '题' + (w.kpName ? ' · ' + esc(w.kpName) : '') + (w.rate > 0 ? '（部分分）' : '') + '</span>';
      }).join('') : '<span class="chip" style="border-color:#BFD8C6;color:#3E7A4E;background:#EDF5EF">全部满分</span>';
      return '<div class="paper"><h3><button type="button" class="paper-open" data-open-paper="' + esc(p.id || '') + '">' + esc(p.title) + '</button></h3><div class="pmeta">' +
        (p.mode === 'mock' ? '全真模考 · ' : p.mode === 'diagnostic' ? '能力自测 · ' : '套卷 · ') + '已批改 ' + p.graded + '/' + p.total + ' 题 · 得分 ' + p.score + '/' + p.max + '（' + (p.rate === null ? '—' : pct(p.rate)) + '）</div>' +
        '<div class="bar ' + (p.rate === null ? '' : p.rate >= 0.8 ? 'good' : p.rate >= 0.5 ? 'mid' : 'low') + '" style="margin-top:8px"><i style="width:' + Math.round((p.rate || 0) * 100) + '%"></i></div>' +
        '<div class="chips">' + chips + '</div>' +
        '<div style="margin-top:10px"><button type="button" class="btn ghost danger" data-reset-paper="' + esc(p.id || '') + '">重置这套（删除记录，二刷用）</button></div></div>';
    }).join('');
    document.querySelectorAll('#paperList [data-open-paper]').forEach(function (b) {
      b.addEventListener('click', function () { if (b.dataset.openPaper) openPaperDetail(b.dataset.openPaper); });
    });
    document.querySelectorAll('#paperList [data-reset-paper]').forEach(function (b) {
      b.addEventListener('click', async function () {
        if (!b.dataset.resetPaper) return;
        if (!confirm('确定重置这套卷吗？这一次的作答与批改记录会被删除，套卷分析、错题统计会同步更新；按知识点练习的记录不受影响。删了不能恢复。')) return;
        b.disabled = true;
        try {
          await window.AtlasUser.json('/api/attempts', 'DELETE', { ids: [b.dataset.resetPaper] });
          location.reload();
        } catch (err) { alert('重置失败：' + err.message); b.disabled = false; }
      });
    });

    var advice = buildAdvice(papers, kps, kinds);
    $('#adviceList').innerHTML = advice.map(function (t) { return '<div class="advice">' + t + '</div>'; }).join('');

    var btn = $('#coachBtn');
    btn.onclick = async function () {
      btn.disabled = true; btn.textContent = '教练思考中…';
      var box = $('#coachReply'); box.hidden = false; box.textContent = '';
      try {
        var data = await window.AtlasUser.json('/api/coach', 'POST', {
          context: { source: 'paper-analytics', subject: state.subject },
          messages: [{ role: 'user', content: summaryText(papers, kps, kinds, advice.length) }],
        });
        box.textContent = (window.AtlasPlain ? window.AtlasPlain.clean(data.reply) : (data.reply || '')) || '教练没有返回内容，请重试。';
      } catch (err) {
        box.textContent = '教练暂时不可用：' + err.message;
      }
      btn.disabled = false; btn.textContent = '让 AI 教练结合数据再总结一份';
    };
  }

  function renderTabs(subjects) {
    var box = $('#subjectTabs');
    var mk = function (v, label) { return '<button role="tab" data-s="' + esc(v) + '" class="' + (state.subject === v ? 'on' : '') + '">' + esc(label) + '</button>'; };
    box.innerHTML = mk('all', '全部科目') + subjects.map(function (s) { return mk(s, subjectName(s, state.attempts)); }).join('');
    box.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () { state.subject = b.getAttribute('data-s'); renderTabs(subjects); render(); });
    });
  }

  async function init() {
    try {
      await window.AtlasUser.ready;
      var data = await window.AtlasUser.json('/api/attempts', 'GET');
      state.attempts = (data.attempts || []).filter(function (a) { return a && (a.mode === 'paper' || a.mode === 'diagnostic' || a.mode === 'mock') && Array.isArray(a.questions); });
      var subjects = Array.from(new Set(state.attempts.map(function (a) { return a.subject; })));
      try { var g = await window.AtlasUser.load('goals', { targets: {} }); state.targets = (g && g.targets) || {}; } catch (e) {}
      renderTabs(subjects);
      render();
    } catch (err) {
      $('#alert').textContent = '加载失败：' + err.message + '（请确认已登录）';
      $('#emptyCard').hidden = false;
    }
  }
  async function openPaperDetail(id) {
    var main = document.querySelector('main') || document.body;
    var sec = document.getElementById('paperDetail');
    if (!sec) {
      sec = document.createElement('section');
      sec.id = 'paperDetail';
      sec.className = 'card';
      main.appendChild(sec);
    }
    sec.hidden = false;
    sec.innerHTML = '<h2>做题详情</h2><p class="sub">正在加载…</p>';
    sec.scrollIntoView({ behavior: 'smooth' });
    try {
      var data = await window.AtlasUser.json('/api/attempts/' + encodeURIComponent(id));
      var a = data.attempt;
      if (!a) throw new Error('记录不存在');
      if (window.AtlasQuestions) { try { await window.AtlasQuestions.load(a.subject); } catch (e) {} }
      var byId = {};
      ((window.QUESTIONS && window.QUESTIONS.items) || []).forEach(function (it) { byId[it.id] = it; });
      var clean = function (x) { return window.AtlasPlain ? window.AtlasPlain.clean(String(x == null ? '' : x)) : String(x == null ? '' : x); };
      function rateCls(rt) { return rt === null ? 'sc-none' : rt >= 1 ? 'sc-full' : rt >= 0.8 ? 'sc-good' : rt >= 0.5 ? 'sc-mid' : 'sc-low'; }
      var sumGraded = 0, sumScore = 0, sumMax = 0;
      (a.questions || []).forEach(function (q) { var rr = (a.results || {})[q.id] || {}; if (rr.status === 'graded' && Number(rr.maxScore) > 0) { sumGraded++; sumScore += Number(rr.score); sumMax += Number(rr.maxScore); } });
      var sumRate = sumMax > 0 ? sumScore / sumMax : null;
      var strip = (a.questions || []).map(function (q, idx) {
        var rr = (a.results || {})[q.id] || {};
        var rt = rate(rr);
        return '<button type="button" class="ad-cell ' + rateCls(rt) + '" data-goto="' + idx + '" title="第 ' + (idx + 1) + ' 题' + (q.kpName ? ' · ' + esc(q.kpName) : '') + (rt === null ? ' · 待批改' : ' · ' + Math.round(Number(rr.score) * 10) / 10 + '/' + Math.round(Number(rr.maxScore) * 10) / 10) + '">' + (idx + 1) + '</button>';
      }).join('');
      var cards = (a.questions || []).map(function (q, idx) {
        var r = (a.results || {})[q.id] || {};
        var it = byId[q.id] || {};
        var graded = r.status === 'graded';
        var rt = rate(r);
        var open = !(graded && rt >= 1);
        var html = '<div class="ad-card" id="adCard' + idx + '"><div class="ad-head" data-toggle="' + idx + '"><b>第 ' + (idx + 1) + ' 题</b><span>' + esc(q.kind || '') + (q.kpName ? ' · ' + esc(q.kpName) : '') + '</span>' +
          '<b class="ad-score ' + rateCls(rt) + '">' + (graded ? (Math.round(Number(r.score) * 10) / 10) + ' / ' + (Math.round(Number(r.maxScore) * 10) / 10) : '待批改') + '</b><span class="ad-caret">' + (open ? '▾' : '▸') + '</span></div><div class="ad-body"' + (open ? '' : ' hidden') + '>';
        if (it.text) html += '<div class="ad-sec"><span>题干</span><p>' + esc(clean(it.text)) + '</p></div>';
        if (it.answer) html += '<div class="ad-sec"><span>参考答案</span><p>' + esc(clean(it.answer)) + '</p></div>';
        if (it.steps && it.steps.length) html += '<div class="ad-sec"><span>解析</span>' + it.steps.map(function (st) { return '<p>' + esc(clean(st)) + '</p>'; }).join('') + '</div>';
        if (r.level) html += '<div class="ad-sec"><span>等级</span><p>' + esc(r.level) + '</p></div>';
        if (r.comments) html += '<div class="ad-sec"><span>AI 总评</span><p>' + esc(clean(r.comments)) + '</p></div>';
        if (Array.isArray(r.breakdown) && r.breakdown.length) html += '<div class="ad-sec"><span>得分点</span>' + r.breakdown.map(function (b) {
          var bpct = (b.max != null && Number(b.max) > 0 && b.score != null) ? Math.max(0, Math.min(100, Math.round(Number(b.score) / Number(b.max) * 100))) : 0;
          return '<div class="bd-row"><span class="bd-point">' + esc(b.point || '') + '</span><span class="bd-track"><i style="width:' + bpct + '%"></i></span><b>' + (b.score == null ? '' : Math.round(Number(b.score) * 10) / 10) + (b.max == null ? '' : ' / ' + Math.round(Number(b.max) * 10) / 10) + '</b></div>' + (b.comment ? '<p class="bd-comment">' + esc(clean(b.comment)) + '</p>' : '');
        }).join('') + '</div>';
        if (r.dimensions && Object.keys(r.dimensions).length) html += '<div class="ad-sec"><span>维度评分</span>' + Object.keys(r.dimensions).map(function (k) {
          var v = r.dimensions[k], frac = null, txt = '';
          if (v && typeof v === 'object') { if (v.max != null && Number(v.max) > 0 && v.score != null) frac = Number(v.score) / Number(v.max); txt = (v.score != null ? v.score : '') + (v.max != null ? ' / ' + v.max : ''); }
          else if (typeof v === 'string' && /^\s*[\d.]+\s*\/\s*[\d.]+\s*$/.test(v)) { var pp = v.split('/'); frac = Number(pp[0]) / Number(pp[1]); txt = v.trim(); }
          else if (typeof v === 'number') { frac = v > 1 ? null : v; txt = v > 1 ? String(v) : Math.round(v * 100) + '%'; }
          else txt = String(v == null ? '' : v);
          return '<div class="bd-row"><span class="bd-point">' + esc(k) + '</span>' + (frac !== null ? '<span class="bd-track"><i style="width:' + Math.round(Math.max(0, Math.min(1, frac)) * 100) + '%"></i></span>' : '<span class="bd-track"></span>') + '<b>' + esc(txt) + '</b></div>';
        }).join('') + '</div>';
        if (r.missing) html += '<div class="ad-sec"><span>缺失要点</span><p>' + esc(clean(r.missing)) + '</p></div>';
        if (r.suggestions) html += '<div class="ad-sec"><span>改进建议</span><p>' + esc(clean(r.suggestions)) + '</p></div>';
        if (r.revised) html += '<div class="ad-sec"><span>作文指导 · 修改稿</span><p>' + esc(clean(r.revised)) + '</p></div>';
        if (Array.isArray(r.grammar) && r.grammar.length) html += '<div class="ad-sec"><span>作文指导 · 语法与表达</span>' + r.grammar.map(function (g) { return '<p>' + esc(clean(typeof g === 'string' ? g : (g.issue || g.text || g.comment || ''))) + '</p>'; }).join('') + '</div>';
        html += '<div class="ad-actions"><button type="button" class="mark-btn" data-mark-fav="' + esc(q.id) + '">☆ 收藏</button><button type="button" class="mark-btn" data-mark-wb="' + esc(q.id) + '">＋ 加入错题本</button></div>';
        return html + '</div></div>';
      }).join('');
      sec.innerHTML = '<h2>' + esc(paperTitle(a)) + ' · 做题详情</h2>' +
        '<div class="ad-sum"><div class="ad-sum-rate"><b>' + (sumRate === null ? '—' : pct(sumRate)) + '</b><span>得分率</span></div>' +
        '<div class="ad-sum-main"><div class="ad-sum-line">得分 <b>' + (Math.round(sumScore * 10) / 10) + ' / ' + (Math.round(sumMax * 10) / 10) + '</b> · 已批改 ' + sumGraded + ' / ' + (a.questions || []).length + ' 题</div>' +
        '<div class="bar ' + (sumRate === null ? '' : sumRate >= 0.8 ? 'good' : sumRate >= 0.5 ? 'mid' : 'low') + '"><i style="width:' + Math.round((sumRate || 0) * 100) + '%"></i></div>' +
        '<div class="ad-strip">' + strip + '</div><p class="sub" style="margin:6px 0 0">逐题得分条：点任意题号跳到该题；满分题默认折叠，丢分题自动展开。</p></div></div>' +
        '<div class="ad-analysis-bar"><button type="button" class="btn ghost" id="adAnalysisBtn">AI 教学分析</button><span class="sub">按考点归组丢分、错因分类，并给出复盘动作与下一阶段安排。</span></div>' +
        '<div id="adAnalysis" class="ad-analysis" hidden></div>' + cards +
        '<button type="button" class="btn ghost" id="paperDetailClose">收起详情</button>';
      sec.querySelector('#paperDetailClose').addEventListener('click', function () { sec.hidden = true; });
      sec.querySelectorAll('[data-toggle]').forEach(function (h) {
        h.addEventListener('click', function () {
          var card = document.getElementById('adCard' + h.dataset.toggle);
          if (!card) return;
          var body = card.querySelector('.ad-body');
          var caret = h.querySelector('.ad-caret');
          if (body) { body.hidden = !body.hidden; if (caret) caret.textContent = body.hidden ? '▸' : '▾'; }
        });
      });
      sec.querySelectorAll('[data-goto]').forEach(function (c) {
        c.addEventListener('click', function () {
          var card = document.getElementById('adCard' + c.dataset.goto);
          if (!card) return;
          var body = card.querySelector('.ad-body');
          if (body && body.hidden) { body.hidden = false; var ct = card.querySelector('.ad-caret'); if (ct) ct.textContent = '▾'; }
          card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
      var anaBtn = sec.querySelector('#adAnalysisBtn');
      if (anaBtn) anaBtn.addEventListener('click', function () {
        var box = sec.querySelector('#adAnalysis');
        box.hidden = false;
        box.innerHTML = '<p class="sub">正在生成教学分析…</p>';
        anaBtn.disabled = true;
        var lines = ['科目：' + (a.subject || '') + '，共 ' + (a.questions || []).length + ' 题。'];
        (a.questions || []).forEach(function (q, i) {
          var r = (a.results || {})[q.id] || {};
          lines.push('第' + (i + 1) + '题 考点：' + (q.kpName || q.kp || '未知') + '，题型：' + (q.kind || '') + '，' + (r.status === 'graded' ? ('得分 ' + r.score + '/' + r.maxScore + (r.level ? '，等级 ' + r.level : '') + (r.missing ? '，缺失要点：' + r.missing : '')) : '未批改'));
        });
        window.AtlasUser.json('/api/coach', 'POST', { context: { source: 'attempt-analysis', attemptId: a.id }, messages: [{ role: 'user', content: lines.join('\n') }] }).then(function (r) {
          box.innerHTML = '<div class="ad-sec"><span>AI 教学分析</span><p>' + esc(clean(r.reply || '')) + '</p></div>';
          if (window.AtlasKatex) window.AtlasKatex.render(box);
        }).catch(function (e) {
          box.innerHTML = '<p class="sub">分析生成失败：' + esc(e.message) + '</p>';
        }).then(function () { anaBtn.disabled = false; });
      });
      if (window.AtlasMarks) window.AtlasMarks.wire(sec);
      if (window.AtlasKatex) window.AtlasKatex.render(sec);
    } catch (err) {
      sec.innerHTML = '<h2>做题详情</h2><p class="sub">加载失败：' + esc(err.message) + '</p>';
    }
  }

  init();
})();
