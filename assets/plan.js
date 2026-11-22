/* 学习计划生成器：按档案（初试日期 / 每日时长 / 科目）与近期套卷表现，
 * 生成 7 天滚动计划并存入 state 'plan'；首页计划卡展示今日任务，可勾选完成。 */
(function () {
  'use strict';
  var card = document.getElementById('planCard');
  if (!card || !window.AtlasUser) return;
  var SUBJECT_NAMES = { math: '数学一', math2: '数学二', math3: '数学三', english: '英语一', english2: '英语二', mechanics: '807 材料力学', politics: '政治' };
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
  var settings = null;
  var profileCache = null;
  /* 右侧停靠小卡片（桌面端）：planCard 在宽屏时移入 stage 右侧的 planDock，
     默认收成小卡片（阶段 + 今日进度），点击展开全量计划；窄屏（App）留在左下 homeCards 原位、保持全量。 */
  var inDock = false;
  function planCollapsed() {
    if (!inDock) return false;
    try { return localStorage.getItem('atlas.plan.collapsed') !== '0'; } catch (e) { return true; }
  }
  function setPlanCollapsed(on) {
    try { localStorage.setItem('atlas.plan.collapsed', on ? '1' : '0'); } catch (e) {}
    render();
  }

  /* 计划设置：用户可自行调整，存 plan.settings，两端（网页/App）规则一致 */
  function normSettings(raw) {
    raw = raw || {};
    return {
      hours: Math.max(0, Math.min(24, Number(raw.hours) || 0)),
      paperEvery: [0, 2, 3, 4, 5, 99].indexOf(Number(raw.paperEvery)) >= 0 ? Number(raw.paperEvery) : 0,
      newSharePct: Math.max(0, Math.min(90, Number(raw.newSharePct) || 0)),
      includeReview: raw.includeReview !== false,
      includeVocab: raw.includeVocab !== false,
      restWeekday: Number(raw.restWeekday) >= -1 && Number(raw.restWeekday) <= 6 ? Number(raw.restWeekday) : -1,
      focus: Array.isArray(raw.focus) ? raw.focus.filter(function (x) { return SUBJECT_NAMES[x]; }) : [],
    };
  }
  function fmtH(min) {
    var h = Math.round((Number(min) || 0) / 60 * 10) / 10;
    return String(h).replace(/\.0$/, '') + ' 小时';
  }

  async function fetchProfile() {
    if (window.ATLAS_CONTEST) { // 参赛版无后端：用演示档案（profile-boot 提供），否则计划卡在游客模式不生成
      try { var pc = window.ATLAS_PROFILE || (window.__profilePromise ? (await window.__profilePromise).profile : null); if (pc) return pc; } catch (e) {}
    }
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

  function generate(profile, weakness, due, stRaw) {
    var st = normSettings(stRaw);
    var subjects = (profile.subjects || []).filter(function (s) { return SUBJECT_NAMES[s]; });
    if (!subjects.length) subjects = ['math', 'english', 'mechanics', 'politics'];
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var exam = profile.examDate ? new Date(profile.examDate + 'T00:00:00') : addDays(today, 40);
    var daysLeft = Math.round((exam - today) / 86400000);
    var phase = phaseOf(daysLeft);
    var daily = st.hours > 0 ? Math.max(60, Math.round(st.hours * 60)) : Math.max(60, Number(profile.dailyMinutes) || 240);
    var paperEvery = st.paperEvery || phase.paperEvery;
    var newShare = st.newSharePct > 0 ? st.newSharePct / 100 : phase.newShare;
    var weights = subjects.map(function (s) {
      var w = 0.7 + (weakness[s] != null ? weakness[s] : 0.3);
      if (st.focus.indexOf(s) >= 0) w *= 1.5;
      return w;
    });
    var wsum = weights.reduce(function (a, b) { return a + b; }, 0);
    var days = {};
    for (var i = 0; i < 7; i++) {
      var date = addDays(today, i);
      var key = dayKey(date);
      if (st.restWeekday >= 0 && date.getDay() === st.restWeekday) {
        days[key] = { tasks: [{ id: 'rest', kind: 'rest', label: '休息日', detail: '按你的设置今天不安排任务，自由活动或补觉' }], done: {} };
        continue;
      }
      var tasks = [];
      if (st.includeReview) tasks.push({
        id: 'review', kind: 'review', label: '错题复习',
        detail: i === 0 && due.review ? due.review + ' 道到期错题（艾宾浩斯回流）' : '清掉当天到期的错题，没有到期就跳过',
        href: 'practice.html?review=1',
      });
      var paperSubject = (paperEvery !== 99 && i % paperEvery === paperEvery - 1)
        ? subjects[Math.floor(i / paperEvery) % subjects.length] : null;
      subjects.forEach(function (s, si) {
        if (paperSubject === s) {
          tasks.push({
            id: 'paper-' + s, kind: 'paper', subject: s, label: SUBJECT_NAMES[s] + ' · 套卷日',
            detail: '做一整套卷，限时完成，交卷后看学情分析', mins: Math.round(daily * 0.45),
            href: 'practice.html?subject=' + s,
          });
        } else {
          var mins = Math.round(daily * newShare * weights[si] / wsum / 5) * 5;
          if (mins >= 20) tasks.push({
            id: 'new-' + s, kind: 'new', subject: s, label: SUBJECT_NAMES[s] + ' · 新题推进',
            detail: '优先练薄弱章节与高频考点', mins: mins, href: 'practice.html?subject=' + s,
          });
        }
      });
      if (st.includeVocab && (subjects.indexOf('english') >= 0 || subjects.indexOf('english2') >= 0)) {
        tasks.push({
          id: 'vocab', kind: 'vocab', label: '单词复习',
          detail: i === 0 && due.vocab ? due.vocab + ' 个单词到期' : '按遗忘曲线复习到期单词', mins: 20, href: 'vocab.html',
        });
      }
      days[key] = { tasks: tasks, done: {} };
    }
    return {
      generatedAt: new Date().toISOString(), examDate: profile.examDate || '',
      daysLeft: daysLeft, phase: phase.name, dailyMinutes: daily, days: days, settings: st,
    };
  }

  async function regenerate() {
    var profile = await fetchProfile();
    if (!profile) return null;
    profileCache = profile;
    var subjects = (profile.subjects || []).filter(function (s) { return SUBJECT_NAMES[s]; });
    var weakness = await fetchWeakness(subjects);
    var due = await dueCounts();
    plan = generate(profile, weakness, due, settings);
    settings = plan.settings;
    try { await window.AtlasUser.save('plan', plan); } catch (e) {}
    return plan;
  }

  function renderSettings() {
    var st = normSettings(settings);
    var subjects = ((profileCache && profileCache.subjects) || []).filter(function (x) { return SUBJECT_NAMES[x]; });
    if (!subjects.length) subjects = ['math', 'english', 'mechanics', 'politics'];
    var profileHours = Math.round(((profileCache && profileCache.dailyMinutes) || 240) / 60 * 10) / 10;
    function opts(list, cur) {
      return list.map(function (o) { return '<option value="' + o[0] + '"' + (String(o[0]) === String(cur) ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('');
    }
    card.innerHTML = '<div class="phead"><b>计划设置</b><button type="button" id="planSetClose" aria-label="关闭">×</button></div>' +
      '<div class="pset-row"><span>每日学习时长</span><span class="pset-ctrl"><input type="number" id="psHours" min="0" max="24" step="0.5" value="' + (st.hours || '') + '" placeholder="' + profileHours + '"> 小时<em>留空用档案的 ' + profileHours + ' 小时</em></span></div>' +
      '<div class="pset-row"><span>套卷频率</span><select id="psPaper">' + opts([[0, '自动（按阶段）'], [2, '每 2 天一套'], [3, '每 3 天一套'], [4, '每 4 天一套'], [5, '每 5 天一套'], [99, '不安排套卷']], st.paperEvery) + '</select></div>' +
      '<div class="pset-row"><span>新题推进占比</span><select id="psShare">' + opts([[0, '自动（按阶段）'], [30, '30%'], [45, '45%'], [60, '60%'], [75, '75%'], [90, '90%']], st.newSharePct) + '</select></div>' +
      '<div class="pset-row"><span>每周休息日</span><select id="psRest">' + opts([[-1, '不休息'], [1, '周一'], [2, '周二'], [3, '周三'], [4, '周四'], [5, '周五'], [6, '周六'], [0, '周日']], st.restWeekday) + '</select></div>' +
      '<div class="pset-row"><span>任务包含</span><span class="pset-ctrl"><label><input type="checkbox" id="psReview"' + (st.includeReview ? ' checked' : '') + '> 错题复习</label> <label><input type="checkbox" id="psVocab"' + (st.includeVocab ? ' checked' : '') + '> 单词复习</label></span></div>' +
      '<div class="pset-row"><span>重点科目</span><span class="pset-ctrl">' + subjects.map(function (x) {
        return '<label><input type="checkbox" class="psFocus" value="' + x + '"' + (st.focus.indexOf(x) >= 0 ? ' checked' : '') + '> ' + SUBJECT_NAMES[x] + '</label>';
      }).join(' ') + '<em>勾选的科目多排时间</em></span></div>' +
      '<div class="pfoot"><button type="button" class="pbtn" id="psSave">保存并重新生成</button>' +
      '<button type="button" class="pbtn pbtn-ghost" id="psCancel">取消</button></div>';
    card.hidden = false;
    document.getElementById('planSetClose').addEventListener('click', render);
    document.getElementById('psCancel').addEventListener('click', render);
    document.getElementById('psSave').addEventListener('click', async function () {
      settings = normSettings({
        hours: Number(document.getElementById('psHours').value) || 0,
        paperEvery: Number(document.getElementById('psPaper').value),
        newSharePct: Number(document.getElementById('psShare').value),
        restWeekday: Number(document.getElementById('psRest').value),
        includeReview: document.getElementById('psReview').checked,
        includeVocab: document.getElementById('psVocab').checked,
        focus: Array.prototype.map.call(card.querySelectorAll('.psFocus:checked'), function (c) { return c.value; }),
      });
      this.disabled = true; this.textContent = '生成中…';
      await regenerate();
      render();
    });
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
    var weekNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    var week = Object.keys(plan.days).sort().map(function (k) {
      var d = plan.days[k];
      var dt = new Date(k + 'T12:00:00');
      var dDone = d.tasks.filter(function (t) { return d.done[t.id]; }).length;
      var title = (k === todayK ? '今天' : weekNames[dt.getDay()]) + ' · ' + (dt.getMonth() + 1) + '月' + dt.getDate() + '日';
      var trows = d.tasks.map(function (t) {
        var done = !!d.done[t.id];
        return '<div class="prow' + (done ? ' done' : '') + '">' +
          '<label class="pcheck"><input type="checkbox" data-day="' + k + '" data-task="' + esc(t.id) + '"' + (done ? ' checked' : '') + '></label>' +
          '<div class="pmeta"><span class="plabel">' + esc(t.label) + (t.mins ? ' <span class="pmins">约 ' + t.mins + ' 分钟</span>' : '') + '</span>' +
          '<span class="pdetail">' + esc(t.detail) + '</span></div>' +
          (t.href ? '<a class="pgo" href="' + esc(t.href) + '">去做 →</a>' : '') + '</div>';
      }).join('');
      return '<div class="pday' + (k === todayK ? ' today' : '') + '"><div class="pday-head"><b>' + title + '</b><span>' + dDone + ' / ' + d.tasks.length + ' 项</span></div>' + trows + '</div>';
    }).join('');
    var tmr = '<div class="pweek"><div class="pweek-title">本周计划 · 7 天全览</div>' + week + '</div>';
    if (planCollapsed()) {
      card.classList.add('mini');
      card.innerHTML = '<div class="phead"><b>学习计划 · ' + esc(plan.phase) + '</b>' +
        '<span class="pdays">距初试 ' + plan.daysLeft + ' 天</span>' +
        '<button type="button" class="ptext-btn" id="planExpand">展开 ›</button></div>' +
        '<div class="pprogress">今日已完成 ' + doneN + ' / ' + day.tasks.length + ' 项 · 每日 ' + fmtH(plan.dailyMinutes) + ' · 点击展开本周计划</div>';
      card.hidden = false;
      card.onclick = function () { setPlanCollapsed(false); };
      return;
    }
    card.classList.remove('mini');
    card.onclick = null;
    card.innerHTML = '<div class="phead"><b>学习计划 · ' + esc(plan.phase) + '</b>' +
      '<span class="pdays">距初试 ' + plan.daysLeft + ' 天</span>' +
      '<button type="button" class="ptext-btn" id="planClose" aria-label="收起">收起</button></div>' +
      '<div class="pprogress">今日已完成 ' + doneN + ' / ' + day.tasks.length + ' 项（按每日 ' + fmtH(plan.dailyMinutes) + ' 生成）</div>' +
      tmr +
      '<div class="pfoot"><button type="button" class="pbtn" id="planRegen">重新生成本周计划</button>' +
      '<button type="button" class="pbtn pbtn-ghost" id="planSettingsBtn">计划设置</button>' +
      '<span class="pnote">依据档案与最近套卷表现自动排定</span></div>';
    card.hidden = false;
    card.querySelectorAll('[data-task]').forEach(function (cb) {
      cb.addEventListener('change', async function () {
        var dk = cb.getAttribute('data-day') || todayK;
        var dd = plan.days[dk];
        if (dd) dd.done[cb.getAttribute('data-task')] = cb.checked;
        try { await window.AtlasUser.save('plan', plan); } catch (e) {}
        render();
      });
    });
    document.getElementById('planSettingsBtn').addEventListener('click', function () {
      if (profileCache) renderSettings();
      else fetchProfile().then(function (p) { profileCache = p; renderSettings(); });
    });
    document.getElementById('planRegen').addEventListener('click', async function () {
      this.disabled = true; this.textContent = '生成中…';
      await regenerate();
      render();
    });
    document.getElementById('planClose').addEventListener('click', function (e) {
      if (e) e.stopPropagation(); /* 收起会把卡片重渲染为小卡并给整卡绑点击展开；同一次点击若继续冒泡到卡片，会刚收起就被重新展开（表现为点收起没反应） */
      if (inDock) { setPlanCollapsed(true); return; }
      card.hidden = true;
      try { localStorage.setItem('atlas.plan.dismissed', todayK); } catch (e) {}
    });
  }

  async function init() {
    var railEl = document.getElementById('atlasRail');
    if (railEl) railEl.addEventListener('wheel', function (e) { e.stopPropagation(); }, { passive: true }); /* 栏内滚轮只滚边栏，不触发图谱缩放 */
    var dock = document.getElementById('planDock');
    var home = document.getElementById('homeCards');
    var mq = window.matchMedia('(min-width: 761px)');
    function place() {
      inDock = !!(mq.matches && dock);
      var slot = document.getElementById('planSlot');
      var parent = inDock ? dock : (slot || home);
      if (parent && card.parentElement !== parent) parent.appendChild(card);
    }
    place();
    if (mq.addEventListener) mq.addEventListener('change', function () { place(); if (plan) render(); });
    try { if (localStorage.getItem('atlas.plan.dismissed') === dayKey(new Date())) return; } catch (e) {}
    await window.AtlasUser.ready.catch(() => null);
    try { plan = await window.AtlasUser.load('plan', null); } catch (e) { plan = null; }
    if (plan && plan.settings) settings = normSettings(plan.settings);
    if (!profileCache) { try { profileCache = await fetchProfile(); } catch (e) {} }
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
