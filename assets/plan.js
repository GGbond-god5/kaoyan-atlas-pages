/* 学习计划生成器：按档案（初试日期 / 每日时长 / 科目）与近期套卷表现，
 * 生成 7 天滚动计划并存入 state 'plan'；首页计划卡展示今日任务，可勾选完成。 */
(function () {
  'use strict';
  var card = document.getElementById('planCard');
  if (!card || !window.AtlasUser) return;
  var SUBJECT_NAMES = { math: '数学一', math2: '数学二', english: '英语一', english2: '英语二', mechanics: '807 材料力学', politics: '政治' };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function dayKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function phaseOf(daysLeft) {
    if (daysLeft > 45) return { name: '强化推进期', paperEvery: 4, newShare: 0.75 };
    if (daysLeft >= 20) return { name: '真题强化期', paperEvery: 3, newShare: 0.65 };
    if (daysLeft >= 8) return { name: '套卷冲刺期', paperEvery: 2, newShare: 0.45 };
    if (daysLeft >= 0) return { name: '考前复盘期', paperEvery: 2, newShare: 0.3 };
    return { name: '初试已结束', paperEvery: 3, newShare: 0.5 };
  }

  var plan = null;

  async function fetchProfile() {
    try {
      var r = await fetch('/api/profile', { credentials: 'include' });
      var j = await r.json();
      return j.profile || null;
    } catch (e) { return null; }
  }
  async function fetchWeakness(subjects) {
    var w = {};
    try {
      var data = await window.AtlasUser.json('/api/attempts', 'GET');
      var latest = {};
      (data.attempts || []).forEach(function (a) {
        if (!a || !a.subject || !a.createdAt) return;
        if (!latest[a.subject] || String(a.createdAt) > String(latest[a.subject].createdAt)) latest[a.subject] = a;
      });
      subjects.forEach(function (s) {
        var a = latest[s];
        if (!a) return;
        var rate = typeof a.rate === 'number' ? a.rate : (a.maxScore ? a.score / a.maxScore : null);
        if (rate != null && isFinite(rate)) w[s] = Math.min(0.85, Math.max(0.05, 1 - rate));
      });
    } catch (e) { /* 没有套卷记录时用均权 */ }
    return w;
  }
  async function dueCounts() {
    var out = { review: 0, vocab: 0 };
    if (window.AtlasReview) { try { out.review = (await window.AtlasReview.due()).length; } catch (e) {} }
    try {
      var v = await window.AtlasUser.load('vocab', { rec: {} });
      var rec = (v && v.rec) || {}, now = Date.now();
      Object.keys(rec).forEach(function (wd) { var r = rec[wd]; if (r && (r.d || 0) <= now && (r.l || 0) < 5) out.vocab++; });
    } catch (e) {}
    return out;
  }

  function generate(profile, weakness, due) {
    var subjects = (profile.subjects || []).filter(function (s) { return SUBJECT_NAMES[s]; });
    if (!subjects.length) subjects = ['math', 'english', 'mechanics', 'politics'];
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var exam = profile.examDate ? new Date(profile.examDate + 'T00:00:00') : addDays(today, 40);
    var daysLeft = Math.round((exam - today) / 86400000);
    var phase = phaseOf(daysLeft);
    var daily = Math.max(60, Number(profile.dailyMinutes) || 240);
    var weights = subjects.map(function (s) { return 0.7 + (weakness[s] != null ? weakness[s] : 0.3); });
    var wsum = weights.reduce(function (a, b) { return a + b; }, 0);
    var days = {};
    for (var i = 0; i < 7; i++) {
      var key = dayKey(addDays(today, i));
      var tasks = [];
      tasks.push({
        id: 'review', kind: 'review', label: '错题复习',
        detail: i === 0 && due.review ? due.review + ' 道到期错题（艾宾浩斯回流）' : '清掉当天到期的错题，没有到期就跳过',
        href: 'practice.html?review=1',
      });
      var paperSubject = (i % phase.paperEvery === phase.paperEvery - 1)
        ? subjects[Math.floor(i / phase.paperEvery) % subjects.length] : null;
      subjects.forEach(function (s, si) {
        if (paperSubject === s) {
          tasks.push({
            id: 'paper-' + s, kind: 'paper', subject: s, label: SUBJECT_NAMES[s] + ' · 套卷日',
            detail: '做一整套卷，限时完成，交卷后看套卷分析', mins: Math.round(daily * 0.45),
            href: 'practice.html?subject=' + s,
          });
        } else {
          var mins = Math.round(daily * phase.newShare * weights[si] / wsum / 5) * 5;
          if (mins >= 20) tasks.push({
            id: 'new-' + s, kind: 'new', subject: s, label: SUBJECT_NAMES[s] + ' · 新题推进',
            detail: '优先练薄弱章节与高频考点', mins: mins, href: 'practice.html?subject=' + s,
          });
        }
      });
      if (subjects.indexOf('english') >= 0 || subjects.indexOf('english2') >= 0) {
        tasks.push({
          id: 'vocab', kind: 'vocab', label: '单词复习',
          detail: i === 0 && due.vocab ? due.vocab + ' 个单词到期' : '按遗忘曲线复习到期单词', mins: 20, href: 'vocab.html',
        });
      }
      days[key] = { tasks: tasks, done: {} };
    }
    return {
      generatedAt: new Date().toISOString(), examDate: profile.examDate || '',
      daysLeft: daysLeft, phase: phase.name, dailyMinutes: daily, days: days,
    };
  }

  async function regenerate() {
    var profile = await fetchProfile();
    if (!profile) return null;
    var subjects = (profile.subjects || []).filter(function (s) { return SUBJECT_NAMES[s]; });
    var weakness = await fetchWeakness(subjects);
    var due = await dueCounts();
    plan = generate(profile, weakness, due);
    try { await window.AtlasUser.save('plan', plan); } catch (e) {}
    return plan;
  }

  function render() {
    if (!plan) return;
    var todayK = dayKey(new Date());
    var day = plan.days[todayK];
    if (!day) { regenerate().then(render); return; }
    var doneN = day.tasks.filter(function (t) { return day.done[t.id]; }).length;
    var rows = day.tasks.map(function (t) {
      var done = !!day.done[t.id];
      return '<div class="prow' + (done ? ' done' : '') + '">' +
        '<label class="pcheck"><input type="checkbox" data-task="' + esc(t.id) + '"' + (done ? ' checked' : '') + '></label>' +
        '<div class="pmeta"><span class="plabel">' + esc(t.label) + (t.mins ? ' <span class="pmins">约 ' + t.mins + ' 分钟</span>' : '') + '</span>' +
        '<span class="pdetail">' + esc(t.detail) + '</span></div>' +
        (t.href ? '<a class="pgo" href="' + esc(t.href) + '">去做 →</a>' : '') + '</div>';
    }).join('');
    var tomorrow = plan.days[dayKey(addDays(new Date(), 1))];
    var tmr = tomorrow ? '<div class="ptomorrow">明日预告：' + tomorrow.tasks.slice(0, 3).map(function (t) { return esc(t.label); }).join(' · ') + '</div>' : '';
    card.innerHTML = '<div class="phead"><b>学习计划 · ' + esc(plan.phase) + '</b>' +
      '<span class="pdays">距初试 ' + plan.daysLeft + ' 天</span>' +
      '<button type="button" id="planClose" aria-label="关闭">×</button></div>' +
      '<div class="pprogress">今日已完成 ' + doneN + ' / ' + day.tasks.length + ' 项（按每日 ' + plan.dailyMinutes + ' 分钟生成）</div>' +
      rows + tmr +
      '<div class="pfoot"><button type="button" class="pbtn" id="planRegen">重新生成本周计划</button>' +
      '<span class="pnote">依据档案与最近套卷表现自动排定</span></div>';
    card.hidden = false;
    card.querySelectorAll('[data-task]').forEach(function (cb) {
      cb.addEventListener('change', async function () {
        day.done[cb.getAttribute('data-task')] = cb.checked;
        try { await window.AtlasUser.save('plan', plan); } catch (e) {}
        render();
      });
    });
    document.getElementById('planRegen').addEventListener('click', async function () {
      this.disabled = true; this.textContent = '生成中…';
      await regenerate();
      render();
    });
    document.getElementById('planClose').addEventListener('click', function () {
      card.hidden = true;
      try { localStorage.setItem('atlas.plan.dismissed', todayK); } catch (e) {}
    });
  }

  async function init() {
    try { if (localStorage.getItem('atlas.plan.dismissed') === dayKey(new Date())) return; } catch (e) {}
    await window.AtlasUser.ready;
    try { plan = await window.AtlasUser.load('plan', null); } catch (e) { plan = null; }
    var todayK = dayKey(new Date());
    if (!plan || !plan.days || !plan.days[todayK]) {
      plan = await regenerate();
      if (!plan) {
        card.innerHTML = '<div class="phead"><b>学习计划</b></div><p class="pdetail">先在档案里填好初试日期、每日学习时长和科目，再回来生成你的专属计划。</p>';
        card.hidden = false;
        return;
      }
    }
    render();
  }
  init().catch(function () {});
})();
