/* 学情分析：数据全部来自 /api/attempts（套卷/模考的作答与批改结果），在本页内聚合，不新增后端接口。
 * 口径：得分率 = score/maxScore；满分=1，未满分<1，低分<0.5。只统计 status 为 graded 的题。 */
(function () {
  'use strict';
  var SUBJECT_NAMES = { math: '数学一', math2: '数学二', math3: '数学三', mechanics: '807 材料力学', english: '英语一', english2: '英语二', politics: '政治' };
  function subjectName(id, attempts) { if (SUBJECT_NAMES[id]) return SUBJECT_NAMES[id]; for (var i = 0; i < (attempts || []).length; i++) { var qs = attempts[i].questions || []; for (var j = 0; j < qs.length; j++) if (qs[j].subject === id && qs[j].subjectName) return qs[j].subjectName; } return id; }
  var state = { subject: 'all', attempts: [], targets: {} };
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var pct = function (x) { return Math.round(x * 100) + '%'; };
  /* 两级结构：详情打开时主视图隐藏，返回时恢复并回到原滚动位置 */
  var detailOpen = false, savedScrollY = 0;
  function fmtDate(a) {
    var v = a && (a.createdAt || a.created_at || a.ts || a.time);
    if (!v) return '';
    var d = new Date(v);
    return isNaN(d) ? '' : (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  function rate(r) { return r && r.status === 'graded' && Number(r.maxScore) > 0 ? Number(r.score) / Number(r.maxScore) : null; }

  function paperTitle(a) {
    if (a.mode === 'mock' || a.mode === 'ability') return subjectName(a.subject, [a]) + ' · 能力测试';
    if (a.mode === 'exampaper') { var q0e = (a.questions || [])[0] || {}; return (q0e.chapterTitle || subjectName(a.subject, [a])) + ' · 真题模拟'; }
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
    /* 学科定制：单科时注入本科目侧重点与隔离守卫；全部科目时明确要求按科分别小结，不许串科。 */
    var SA0 = window.AtlasSubjectAnalytics || null;
    if (SA0 && state.subject !== 'all' && SA0.config(state.subject)) {
      lines.push('科目：' + SA0.config(state.subject).name + '。' + SA0.aiFocus(state.subject));
      lines.push(SA0.guardLine(state.subject));
    } else {
      lines.push('以下包含多个科目的数据：请按科目分别小结，不得把任何一科的题型、栏目或概念套用到另一科。');
    }
    papers.forEach(function (p, i) {
      lines.push('第' + (i + 1) + '套 ' + p.title + '：得分率 ' + (p.rate === null ? '未批改完' : pct(p.rate)) + '，错题号 ' + (p.wrong.map(function (w) { return '第' + w.no + '题'; }).join('、') || '无'));
    });
    var weak = kps.filter(function (e) { return e.n >= 2; }).sort(function (x, y) { return y.missRate - x.missRate; }).slice(0, 5);
    if (weak.length) lines.push('薄弱知识点：' + weak.map(function (e) { return e.label + '（' + e.n + '题，未满分率' + pct(e.missRate) + '）'; }).join('；'));
    lines.push('请基于这些数据给我一份简短的提升建议：先指出最该优先处理的 1–2 个问题，再给接下来一周的具体练法。不要编造数据里没有的错题或分数。');
    return lines.join('\n');
  }

  async function resetPaper(id, btn) {
    // 重置这套：删本次作答/批改记录 + 连带清做题记录与复盘排期（clearPaperRecords），收藏与手动错题本保留。
    if (!id) return;
    if (!confirm('确定重置这套卷吗？这一次的作答与批改记录会被删除，这套题目的做题记录（做过/错题次数、复盘排期）也会一并清除，可以干净二刷；收藏与手动加入错题本的题保留。删了不能恢复。')) return;
    if (btn) btn.disabled = true;
    try {
      var att = (state.attempts || []).filter(function (x) { return x.id === id; })[0];
      var qids = att && att.questions ? att.questions.map(function (q) { return q.id; }) : [];
      await window.AtlasUser.json('/api/attempts', 'DELETE', { ids: [id] });
      await clearPaperRecords(qids);
      location.reload();
    } catch (err) { alert('重置失败：' + err.message); if (btn) btn.disabled = false; }
  }

async function clearPaperRecords(qids) {
  // 重置二刷：连带清除这套题目的做题记录（practice rec）与复盘排期（review sched），收藏与手动加入错题本保留。
  try {
    var store = await window.AtlasUser.load('practice', { rec: {} });
    var rec = (store && store.rec) || {}; var changed = false;
    (qids || []).forEach(function (id) { if (rec[id]) { delete rec[id]; changed = true; } });
    if (changed) await window.AtlasUser.save('practice', Object.assign({}, store, { rec: rec }));
  } catch (e) {}
  try {
    var rv = await window.AtlasUser.load('review', { sched: {} });
    var sched = (rv && rv.sched) || {}; var ch2 = false;
    (qids || []).forEach(function (id) { if (sched[id]) { delete sched[id]; ch2 = true; } });
    if (ch2) await window.AtlasUser.save('review', Object.assign({}, rv, { sched: sched }));
  } catch (e) {}
}

  function lineChart() {
    // 折线只做同科比较：每科一条线，横轴是该科的第 N 套；选了科目页签就只画那一科。
    var COLORS = { math: '#B8860B', math2: '#8A6BA8', math3: '#9C6644', english: '#4A6FA5', english2: '#3E8E8A', mechanics: '#A53B30', politics: '#3E7A4E' };
    var all = state.attempts.map(function (a) { return paperStats(a); }).filter(function (p) { return p.graded > 0 && p.rate !== null; });
    var bySub = {};
    all.forEach(function (p) { (bySub[p.subject] = bySub[p.subject] || []).push(p); });
    var sids = Object.keys(bySub).filter(function (sid) { return state.subject === 'all' || state.subject === sid; });
    if (!sids.length) return '<p class="sub">暂无数据。</p>';
    var maxN = Math.max.apply(null, sids.map(function (sid) { return bySub[sid].length; }));
    var W = 680, H = 240, L = 46, R = 18, T = 16, B = 40, iw = W - L - R, ih = H - T - B;
    var X = function (i) { return maxN === 1 ? L + iw / 2 : L + iw * i / (maxN - 1); };
    var Y = function (v) { return T + ih * (1 - v); };
    var legend = sids.map(function (sid) {
      var ps = bySub[sid];
      return '<span class="lg-item"><i style="background:' + (COLORS[sid] || '#888') + '"></i>' + esc(subjectName(sid, state.attempts)) + '（最近 ' + pct(ps[ps.length - 1].rate) + '）</span>';
    }).join('');
    var out = '<div class="chart-legend">' + legend + '</div><svg class="chart-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="各科得分率折线图">';
    [0, 0.25, 0.5, 0.75, 1].forEach(function (g) {
      out += '<line x1="' + L + '" y1="' + Y(g) + '" x2="' + (W - R) + '" y2="' + Y(g) + '" stroke="#E7DFC9" stroke-width="1"/>' +
        '<text x="' + (L - 6) + '" y="' + (Y(g) + 4) + '" text-anchor="end" font-size="11" fill="#8A8172">' + Math.round(g * 100) + '%</text>';
    });
    for (var xi = 0; xi < maxN; xi++) {
      out += '<text x="' + X(xi) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="10.5" fill="#8A8172">第 ' + (xi + 1) + ' 套</text>';
    }
    /* 同一横坐标上可能挤着多科的点（各科都只有一套卷时），标签按得分率从低到高向上错开，避免数值叠字 */
    var clusters = {}, labelY = {};
    sids.forEach(function (sid) {
      bySub[sid].forEach(function (p, i) {
        var key = X(i).toFixed(0);
        (clusters[key] = clusters[key] || []).push({ key: sid + '|' + i, y: Y(p.rate) - 9 });
      });
    });
    Object.keys(clusters).forEach(function (k) {
      var arr = clusters[k].sort(function (a, b) { return b.y - a.y; });
      arr.forEach(function (it, j) {
        if (j && it.y > arr[j - 1].y - 16) it.y = arr[j - 1].y - 16;
        if (it.y < 14) it.y = 14;
        labelY[it.key] = it.y;
      });
    });
    sids.forEach(function (sid) {
      var ps = bySub[sid], color = COLORS[sid] || '#888';
      if (ps.length > 1) out += '<polyline fill="none" stroke="' + color + '" stroke-width="2.2" points="' + ps.map(function (p, i) { return X(i).toFixed(1) + ',' + Y(p.rate).toFixed(1); }).join(' ') + '"/>';
      ps.forEach(function (p, i) {
        var lx = X(i), anchor = 'middle';
        if (maxN > 1 && i === 0) { lx += 7; anchor = 'start'; }
        else if (maxN > 1 && i === maxN - 1) { lx -= 7; anchor = 'end'; }
        out += '<circle cx="' + X(i) + '" cy="' + Y(p.rate) + '" r="4" fill="' + color + '" stroke="#fff" stroke-width="1.6"><title>' + esc(p.title) + '：' + pct(p.rate) + '</title></circle>' +
          '<text x="' + lx + '" y="' + (labelY[sid + '|' + i] || (Y(p.rate) - 9)) + '" text-anchor="' + anchor + '" font-size="11" font-weight="700" fill="#4A4436">' + pct(p.rate) + '</text>';
      });
    });
    return out + '</svg>';
  }

  function subjectChart() {
    var all = state.attempts.map(function (a) { var st = paperStats(a); st._attempt = a; return st; }).filter(function (p) { return p.graded > 0 && p.rate !== null; });
    var bySub = {};
    all.forEach(function (p) { (bySub[p.subject] = bySub[p.subject] || []).push(p); });
    var sids = Object.keys(bySub);
    if (!sids.length) return '<p class="sub">暂无数据。</p>';
    var rowH = 46, W = 680, L = 76, R = 56, iw = W - L - R, H = sids.length * rowH + 30;
    var out = '<svg class="chart-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="各科得分率柱状图">';
    [0, 0.5, 1].forEach(function (g) {
      var x = L + iw * g;
      out += '<line x1="' + x + '" y1="4" x2="' + x + '" y2="' + (H - 22) + '" stroke="#EFE9D8" stroke-width="1"/>' +
        '<text x="' + x + '" y="' + (H - 6) + '" text-anchor="middle" font-size="10.5" fill="#8A8172">' + Math.round(g * 100) + '%</text>';
    });
    sids.forEach(function (sid, ri) {
      var ps = bySub[sid], latest = ps[ps.length - 1];
      var wsum = ps.reduce(function (sm, p) { return sm + p.graded; }, 0);
      var avg = ps.reduce(function (sm, p) { return sm + p.rate * p.graded; }, 0) / Math.max(1, wsum);
      var y = 8 + ri * rowH;
      out += '<text x="' + (L - 8) + '" y="' + (y + 15) + '" text-anchor="end" font-size="12.5" font-weight="700" fill="#4A4436">' + esc(subjectName(sid, state.attempts)) + '</text>' +
        '<rect x="' + L + '" y="' + y + '" width="' + Math.max(2, iw * latest.rate) + '" height="11" rx="3" fill="#B8860B"/>' +
        '<text x="' + (L + Math.max(2, iw * latest.rate) + 6) + '" y="' + (y + 10) + '" font-size="11" fill="#4A4436">最近 ' + pct(latest.rate) + '</text>' +
        '<rect x="' + L + '" y="' + (y + 15) + '" width="' + Math.max(2, iw * avg) + '" height="11" rx="3" fill="#7A8BA0"/>' +
        '<text x="' + (L + Math.max(2, iw * avg) + 6) + '" y="' + (y + 25) + '" font-size="11" fill="#4A4436">平均 ' + pct(avg) + '</text>';
    });
    return out + '</svg>';
  }

  function render() {
    var papers = state.attempts
      .filter(function (a) { return state.subject === 'all' || a.subject === state.subject; })
      .map(function (a) { var s = paperStats(a); s._attempt = a; return s; })
      .filter(function (p) { return p.graded > 0; });
    var has = papers.length > 0;
    ['#overview', '#trendCard', '#subjectCard', '#gapCard', '#kpCard', '#kindCard', '#papersCard', '#adviceCard'].forEach(function (s) { $(s).hidden = !has; });
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

    $('#trend').innerHTML = lineChart();
    $('#subjectChart').innerHTML = subjectChart();

    /* 目标差距：每科取最近一套的得分率，折算到满分后与自设目标分对比 */
    var FULL = { math: 150, math2: 150, math3: 150, mechanics: 150, english: 100, english2: 100, politics: 100 };
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

    /* 薄弱归组按学科定制（assets/subject-analytics.js）：选了单科且该科有配置时按本科目口径归组
     * （数学按章组、英语按题型、政治按板块、807 按模块）；全部科目或无配置时回退原 kp 口径，
     * 回退时条目 key 带科目前缀，不跨科合并、更不借用其他科目的分组。 */
    var SA = window.AtlasSubjectAnalytics || null;
    var subjCfg = SA && state.subject !== 'all' ? SA.config(state.subject) : null;
    var kpTitle = document.querySelector('#kpCard h2');
    if (kpTitle) kpTitle.textContent = subjCfg ? subjCfg.groupTitle : '薄弱知识点';
    var groupMeta = {};
    var kps;
    if (subjCfg) {
      kps = aggregate(papers, function (q) {
        var g = SA.groupOf(state.subject, q);
        if (!g) return '';
        groupMeta[state.subject + '|' + g.key] = g;
        return state.subject + '|' + g.key;
      }, function (q) {
        var g = SA.groupOf(state.subject, q);
        return g ? g.label : '未归组';
      }).sort(function (x, y) { return y.missRate - x.missRate || y.n - x.n; });
      kps.forEach(function (e) { var g = groupMeta[e.key]; if (g) { e.chapter = g.chapter; e.kp = g.kp; } });
    } else {
      kps = aggregate(papers, function (q) { return q.kp || q.kpName ? (q.subject + '|' + (q.kp || q.kpName)) : ''; }, function (q) { return q.kpName || q.kp || '未标注考点'; })
        .sort(function (x, y) { return y.missRate - x.missRate || y.n - x.n; });
    }
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

    /* 套卷记录：App「成绩明细」式紧凑列表——一行一套（标题 / 已批改与得分 / 得分率 / 日期），点整行进详情；错题号保留在行下，点它直达详情对应题。 */
    $('#paperList').innerHTML = papers.slice().reverse().map(function (p) {
      var chips = p.wrong.length ? p.wrong.map(function (w) {
        return '<span class="chip' + (w.rate > 0 ? ' part' : '') + '" role="button" tabindex="0" data-open-paper="' + esc(p.id || '') + '" data-goto="' + (w.no - 1) + '" title="' + esc(w.kpName || w.kind) + '">第' + w.no + '题' + (w.kpName ? ' · ' + esc(w.kpName) : '') + (w.rate > 0 ? '（部分分）' : '') + '</span>';
      }).join('') : '<span class="chip" style="border-color:#BFD8C6;color:#3E7A4E;background:#EDF5EF">全部满分</span>';
      var date = fmtDate(p._attempt);
      var rateCls = p.rate === null ? 'mid' : p.rate >= 0.8 ? 'good' : p.rate >= 0.5 ? 'mid' : 'low';
      return '<div class="paper-row" role="button" tabindex="0" data-open-paper="' + esc(p.id || '') + '" title="进入做题详情">' +
        '<span class="pr-title">' + esc(p.title) + '</span>' +
        '<span class="pr-meta">已批改 ' + p.graded + '/' + p.total + ' 题 · 得分 ' + p.score + '/' + p.max + '</span>' +
        '<span class="pr-rate ' + rateCls + '">' + (p.rate === null ? '待批改' : pct(p.rate)) + '</span>' +
        (date ? '<span class="pr-date">' + esc(date) + '</span>' : '') + '</div>' +
        '<div class="chips pr-chips">' + chips + '</div>';
    }).join('');
    document.querySelectorAll('#paperList [data-open-paper]').forEach(function (b) {
      var go = function () { if (b.dataset.openPaper) openPaperDetail(b.dataset.openPaper, b.dataset.goto != null && b.dataset.goto !== '' ? Number(b.dataset.goto) : null); };
      b.addEventListener('click', go);
      b.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
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
      state.attempts = (data.attempts || []).filter(function (a) { return a && (a.mode === 'paper' || a.mode === 'diagnostic' || a.mode === 'mock' || a.mode === 'ability') && Array.isArray(a.questions); });
      var subjects = Array.from(new Set(state.attempts.map(function (a) { return a.subject; })));
      try { var g = await window.AtlasUser.load('goals', { targets: {} }); state.targets = (g && g.targets) || {}; } catch (e) {}
      renderTabs(subjects);
      render();
      var want = new URLSearchParams(location.search).get('attempt');
      if (want) openPaperDetail(want);
    } catch (err) {
      $('#alert').textContent = '加载失败：' + err.message + '（请确认已登录）';
      $('#emptyCard').hidden = false;
    }
  }
  /* 详情独立视图：进入时隐藏主视图各区，返回时恢复并回到进入前的滚动位置 */
  var MAIN_VIEW_SELS = ['.ahero', '#subjectTabs', '#overview', '#trendCard', '#subjectCard', '#gapCard', '#kpCard', '#kindCard', '#papersCard', '#adviceCard', '#emptyCard'];
  function showDetailView() {
    if (!detailOpen) { savedScrollY = window.scrollY || window.pageYOffset || 0; detailOpen = true; }
    MAIN_VIEW_SELS.forEach(function (s) { var el = $(s); if (el) el.hidden = true; });
  }
  function closePaperDetail() {
    var sec = document.getElementById('paperDetail');
    if (sec) sec.hidden = true;
    detailOpen = false;
    var hero = $('.ahero'); if (hero) hero.hidden = false;
    var tabs = $('#subjectTabs'); if (tabs) tabs.hidden = false;
    render();
    window.scrollTo(0, savedScrollY);
  }
  function bindDetailBack(sec) {
    sec.querySelectorAll('[data-back]').forEach(function (b) { b.addEventListener('click', closePaperDetail); });
  }

  async function openPaperDetail(id, focusIdx) {
    var main = document.querySelector('main') || document.body;
    var sec = document.getElementById('paperDetail');
    if (!sec) {
      sec = document.createElement('section');
      sec.id = 'paperDetail';
      sec.className = 'card';
      main.appendChild(sec);
    }
    showDetailView();
    sec.hidden = false;
    sec.innerHTML = '<button type="button" class="btn ghost pd-back" data-back>← 返回学情分析</button><h2>做题详情</h2><p class="sub">正在加载…</p>';
    bindDetailBack(sec);
    window.scrollTo(0, 0);
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
      var isEnglish = ['english', 'english2'].indexOf(a.subject || '') >= 0;
      /* 专属栏目白名单（学科定制双保险）：作文提升指导、参考译文等专属栏目只有本科目配置允许时才渲染，
       * 即使批改结果里混入了其他科目的栏目数据也不会显示；配置模块缺失时回退原 isEnglish 判定。 */
      var SA = window.AtlasSubjectAnalytics || null;
      var anaCfg = SA ? SA.config(a.subject) : null;
      var colOk = function (col) { return !SA || SA.columnAllowed(a.subject, col); };
      var cards = (a.questions || []).map(function (q, idx) {
        var r = (a.results || {})[q.id] || {};
        var it = byId[q.id] || {};
        var graded = r.status === 'graded';
        var rt = rate(r);
        var open = !(graded && rt >= 1);
        /* 英语作文提升指导：仅英语科目 + 作文题 + 已有批改结果（总评/语法纠错/句子提升任一）时出现 */
        var isEssay = isEnglish && /作文/.test(q.kind || '');
        var hasGuide = isEssay && graded && colOk('作文提升指导') && !!(r.comments || (Array.isArray(r.grammar) && r.grammar.length) || (Array.isArray(r.upgrades) && r.upgrades.length));
        var ans = (a.answers || {})[q.id] || {};
        var myAnswer = '';
        var sel = Array.isArray(ans.selected) ? ans.selected.filter(Boolean) : [];
        if (sel.length) myAnswer += '<div class="ad-sec"><span>我的选择</span><p>' + esc(sel.join('、')) + '</p></div>';
        var work = String(ans.work || '').trim();
        if (work) {
          var workLabel = '我的作答';
          if (isEnglish && q.kind === '翻译') workLabel = '我的译文';
          else if (isEnglish && /作文/.test(q.kind || '')) workLabel = '我的作文';
          myAnswer += '<div class="ad-sec"><span>' + workLabel + '</span><p>' + esc(clean(work)) + '</p></div>';
        }
        var ansImgs = Array.isArray(ans.images) && ans.images.length ? ans.images : (ans.image ? [ans.image] : []);
        if (ansImgs.length) myAnswer += '<div class="ad-sec"><span>作答照片' + (ansImgs.length > 1 ? '（共 ' + ansImgs.length + ' 页）' : '') + '</span>' + ansImgs.map(function (u, i) { return (ansImgs.length > 1 ? '<p class="ad-pagelabel">第 ' + (i + 1) + ' 页</p>' : '') + '<img class="ad-photo" loading="lazy" decoding="async" src="' + u + '" alt="作答照片第 ' + (i + 1) + ' 页">'; }).join('') + '</div>';
        var html = '<div class="ad-card" id="adCard' + idx + '"><div class="ad-head" data-toggle="' + idx + '"><b>第 ' + (idx + 1) + ' 题</b><span>' + esc(q.kind || '') + (q.kpName ? ' · ' + esc(q.kpName) : '') + '</span>' +
          '<b class="ad-score ' + rateCls(rt) + '">' + (graded ? (Math.round(Number(r.score) * 10) / 10) + ' / ' + (Math.round(Number(r.maxScore) * 10) / 10) : '待批改') + '</b><span class="ad-caret">' + (open ? '▾' : '▸') + '</span></div><div class="ad-body"' + (open ? '' : ' hidden') + '>';
        var stemText = it.text || q.text || '';
        if (stemText) html += '<div class="ad-sec"><span>题干</span><p>' + esc(clean(stemText)) + '</p></div>';
        html += myAnswer;
        if (hasGuide) {
          /* 复用批改界面的呈现口径：分数点评 + 语法纠错（原句 → 改后＋原因）+ 句子提升（原句 → 升级句＋说明），纯文本 */
          var guide = '<div class="ad-sec essay-guide"><span>作文提升指导</span>' +
            '<p class="eg-score">分数点评：' + (Math.round(Number(r.score) * 10) / 10) + ' / ' + (Math.round(Number(r.maxScore) * 10) / 10) + (r.level ? ' · ' + esc(r.level) : '') + '</p>';
          if (r.comments) guide += '<p>' + esc(clean(r.comments)) + '</p>';
          if (Array.isArray(r.grammar) && r.grammar.length) guide += '<p class="eg-sub">语法纠错</p>' + r.grammar.map(function (g) {
            if (typeof g === 'string') return '<p>' + esc(clean(g)) + '</p>';
            return '<p>' + esc(clean((g.original || '') + (g.corrected ? ' → ' + g.corrected : '') + (g.reason ? '（' + g.reason + '）' : ''))) + '</p>';
          }).join('');
          if (Array.isArray(r.upgrades) && r.upgrades.length) guide += '<p class="eg-sub">句子提升</p>' + r.upgrades.map(function (u) {
            if (typeof u === 'string') return '<p>' + esc(clean(u)) + '</p>';
            return '<p>' + esc(clean((u.original || '') + (u.upgraded ? ' → ' + u.upgraded : '') + (u.note ? '（' + u.note + '）' : ''))) + '</p>';
          }).join('');
          html += guide + '</div>';
        }
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
        if (isEnglish && !hasGuide && colOk('语法与表达') && Array.isArray(r.grammar) && r.grammar.length) html += '<div class="ad-sec"><span>语法与表达</span>' + r.grammar.map(function (g) {
          if (typeof g === 'string') return '<p>' + esc(clean(g)) + '</p>';
          return '<p>' + esc(clean((g.original || '') + (g.corrected ? ' → ' + g.corrected : '') + (g.reason ? '（' + g.reason + '）' : ''))) + '</p>';
        }).join('') + '</div>';
        if (isEnglish && !hasGuide && colOk('句子升级') && Array.isArray(r.upgrades) && r.upgrades.length) html += '<div class="ad-sec"><span>句子升级</span>' + r.upgrades.map(function (u) {
          if (typeof u === 'string') return '<p>' + esc(clean(u)) + '</p>';
          return '<p>' + esc(clean((u.original || '') + (u.upgraded ? ' → ' + u.upgraded : '') + (u.note ? '（' + u.note + '）' : ''))) + '</p>';
        }).join('') + '</div>';
        var revisedLabel = '订正要点';
        if (isEnglish) revisedLabel = (q.kind === '翻译' && colOk('参考译文')) ? '参考译文' : (colOk('修改稿') ? '修改稿' : '订正要点');
        if (r.revised) html += '<div class="ad-sec"><span>' + revisedLabel + '</span><p>' + esc(clean(r.revised)) + '</p></div>';
        var refAns = it.answer || q.answer || '';
        if (refAns) html += '<div class="ad-sec"><span>参考答案</span><p>' + esc(clean(refAns)) + '</p></div>';
        var steps = (it.steps && it.steps.length) ? it.steps : (Array.isArray(q.steps) ? q.steps : []);
        if (steps.length) html += '<div class="ad-sec"><span>解析</span>' + steps.map(function (st) { return '<p>' + esc(clean(st)) + '</p>'; }).join('') + '</div>';
        if (r.deepExplain) html += '<div class="ad-sec"><span>AI 深度解析（强模型）</span><p>' + esc(clean(r.deepExplain)) + '</p></div>';
        html += '<div class="ad-actions"><button type="button" class="mark-btn" data-mark-fav="' + esc(q.id) + '">☆ 收藏</button><button type="button" class="mark-btn" data-mark-wb="' + esc(q.id) + '">＋ 加入错题本</button>' +
          (graded ? '<button type="button" class="mark-btn" data-explain="' + esc(q.id) + '" data-explain-idx="' + idx + '">' + (r.deepExplain ? '重新生成深度解析' : 'AI 深度解析') + '</button>' : '') + '</div>' +
          '<div class="ad-deep" id="adDeep' + idx + '" hidden></div>';
        return html + '</div></div>';
      }).join('');
      sec.innerHTML = '<button type="button" class="btn ghost pd-back" data-back>← 返回学情分析</button><h2>' + esc(paperTitle(a)) + ' · 做题详情</h2>' +
        '<div class="ad-sum"><div class="ad-sum-rate"><b>' + (sumRate === null ? '—' : pct(sumRate)) + '</b><span>得分率</span></div>' +
        '<div class="ad-sum-main"><div class="ad-sum-line">得分 <b>' + (Math.round(sumScore * 10) / 10) + ' / ' + (Math.round(sumMax * 10) / 10) + '</b> · 已批改 ' + sumGraded + ' / ' + (a.questions || []).length + ' 题</div>' +
        '<div class="bar ' + (sumRate === null ? '' : sumRate >= 0.8 ? 'good' : sumRate >= 0.5 ? 'mid' : 'low') + '"><i style="width:' + Math.round((sumRate || 0) * 100) + '%"></i></div>' +
        '<div class="ad-strip">' + strip + '</div><p class="sub" style="margin:6px 0 0">逐题得分条：点任意题号跳到该题；满分题默认折叠，丢分题自动展开。</p></div></div>' +
        '<div id="adMastery"></div>' +
        '<div class="ad-analysis-bar"><button type="button" class="btn ghost" id="adAnalysisBtn">AI 教学分析</button><span class="sub">' + (anaCfg ? '按本科目口径（' + esc(anaCfg.groupTitle) + '）归组丢分、错因分类，并给出复盘动作与下一阶段安排；只分析' + esc(anaCfg.name) + '，不串科。' : '按考点归组丢分、错因分类，并给出复盘动作与下一阶段安排。') + '</span></div>' +
        '<div id="adAnalysis" class="ad-analysis" hidden></div>' + cards +
        '<div class="ad-detail-foot"><button type="button" class="btn ghost" data-back>← 返回学情分析</button><button type="button" class="btn ghost danger" id="paperDetailReset">重置这套（删除记录，二刷用）</button></div>';
      /* 公式按卡懒渲染：整卷一次性对全页跑 renderMathInElement，会把几百个公式的排版压成一个长任务，
       * 是大题量详情页卡顿的主因之一。改为卡片进入视口或被展开时才渲染该卡，渲染结果与整页渲染一致。 */
      var mathDone = new WeakSet();
      function renderCardMath(card) {
        if (!card || mathDone.has(card) || !window.AtlasKatex) return;
        var body = card.querySelector('.ad-body');
        if (body && body.hidden) return;
        mathDone.add(card);
        window.AtlasKatex.render(card);
      }
      bindDetailBack(sec);
      var resetBtn = sec.querySelector('#paperDetailReset');
      if (resetBtn) resetBtn.addEventListener('click', function () { resetPaper(a.id, resetBtn); });
      sec.querySelectorAll('[data-toggle]').forEach(function (h) {
        h.addEventListener('click', function () {
          var card = document.getElementById('adCard' + h.dataset.toggle);
          if (!card) return;
          var body = card.querySelector('.ad-body');
          var caret = h.querySelector('.ad-caret');
          if (body) { body.hidden = !body.hidden; if (caret) caret.textContent = body.hidden ? '▸' : '▾'; if (!body.hidden) renderCardMath(card); }
        });
      });
      sec.querySelectorAll('[data-goto]').forEach(function (c) {
        c.addEventListener('click', function () {
          var card = document.getElementById('adCard' + c.dataset.goto);
          if (!card) return;
          var body = card.querySelector('.ad-body');
          if (body && body.hidden) { body.hidden = false; var ct = card.querySelector('.ad-caret'); if (ct) ct.textContent = '▾'; }
          renderCardMath(card);
          card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
      var anaBtn = sec.querySelector('#adAnalysisBtn');
      if (anaBtn) anaBtn.addEventListener('click', function () {
        var box = sec.querySelector('#adAnalysis');
        box.hidden = false;
        box.innerHTML = '<p class="sub">正在生成教学分析…</p>';
        anaBtn.disabled = true;
        var lines = ['科目：' + subjectName(a.subject, [a]) + '，共 ' + (a.questions || []).length + ' 题。'];
        /* 学科定制：注入本科目教学分析侧重点与隔离守卫，服务端也会按 context.subject 再拼一份（双保险）。 */
        if (anaCfg) { lines.push(SA.aiFocus(a.subject)); lines.push(SA.guardLine(a.subject)); }
        (a.questions || []).forEach(function (q, i) {
          var r = (a.results || {})[q.id] || {};
          var grp = anaCfg ? SA.groupOf(a.subject, q) : null;
          lines.push('第' + (i + 1) + '题 ' + (grp ? '归组：' + grp.label + '，' : '') + '考点：' + (q.kpName || q.kp || '未知') + '，题型：' + (q.kind || '') + '，' + (r.status === 'graded' ? ('得分 ' + r.score + '/' + r.maxScore + (r.level ? '，等级 ' + r.level : '') + (r.missing ? '，缺失要点：' + r.missing : '')) : '未批改'));
        });
        window.AtlasUser.json('/api/coach', 'POST', { context: { source: 'attempt-analysis', attemptId: a.id, subject: a.subject }, messages: [{ role: 'user', content: lines.join('\n') }] }).then(function (r) {
          box.innerHTML = '<div class="ad-sec"><span>AI 教学分析</span><p>' + esc(clean(r.reply || '')) + '</p></div>';
          if (window.AtlasKatex) window.AtlasKatex.render(box);
        }).catch(function (e) {
          box.innerHTML = '<p class="sub">分析生成失败：' + esc(e.message) + '</p>';
        }).then(function () { anaBtn.disabled = false; });
      });
      sec.querySelectorAll('[data-explain]').forEach(function (b) {
        b.addEventListener('click', async function () {
          var box = document.getElementById('adDeep' + b.dataset.explainIdx);
          if (!box) return;
          box.hidden = false; box.innerHTML = '<p class="sub">强模型正在生成深度解析，稍等…</p>';
          b.disabled = true;
          try {
            var out = await window.AtlasUser.json('/api/attempts/' + encodeURIComponent(a.id) + '/explain', 'POST', { questionId: b.dataset.explain, force: true });
            box.innerHTML = '<div class="ad-sec"><span>AI 深度解析（强模型）</span><p>' + esc(clean(out.deepExplain || '')) + '</p></div>';
            if (window.AtlasKatex) window.AtlasKatex.render(box);
            b.textContent = '重新生成深度解析';
          } catch (e) { box.innerHTML = '<p class="sub">生成失败：' + esc(e.message) + '</p>'; }
          b.disabled = false;
        });
      });
      if (window.AtlasMarks) window.AtlasMarks.wire(sec);
      var mh = sec.querySelector('#adMastery');
      if (mh && window.AtlasAssessment) { try { window.AtlasAssessment.renderMastery(mh, a.questions || [], a.results || {}, { subjectAnalytics: true, subject: a.subject }); } catch (e) {} }
      if (mh && window.AtlasKatex) window.AtlasKatex.render(mh);
      if (focusIdx != null) {
        var fc = document.getElementById('adCard' + focusIdx);
        if (fc) {
          var fb = fc.querySelector('.ad-body');
          if (fb && fb.hidden) { fb.hidden = false; var fct = fc.querySelector('.ad-caret'); if (fct) fct.textContent = '▾'; }
          renderCardMath(fc);
          setTimeout(function () { fc.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
        }
      }
      /* 逐卡懒渲染公式（替代原先对整页的一次性渲染）；无 IntersectionObserver 时回退整页渲染，行为不变。 */
      if ('IntersectionObserver' in window) {
        if (sec._mathIO) sec._mathIO.disconnect();
        var mathIO = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) {
            if (!en.isIntersecting) return;
            var bd = en.target.querySelector('.ad-body');
            if (bd && bd.hidden) return;
            renderCardMath(en.target);
            mathIO.unobserve(en.target);
          });
        }, { rootMargin: '600px 0px' });
        sec._mathIO = mathIO;
        sec.querySelectorAll('.ad-card').forEach(function (c) { mathIO.observe(c); });
      } else if (window.AtlasKatex) {
        window.AtlasKatex.render(sec);
      }
    } catch (err) {
      sec.innerHTML = '<button type="button" class="btn ghost pd-back" data-back>← 返回学情分析</button><h2>做题详情</h2><p class="sub">加载失败：' + esc(err.message) + '</p>';
      bindDetailBack(sec);
    }
  }

  init();
})();
