/* 首页改版：左上角图标打开学习中心侧边栏（学习计划 + 学情速览 + 错题/收藏 + 目录），
 * 顶栏铃铛汇集意见反馈 / 公告 / 消息通知（未读红点），顶栏搜索直达知识点与功能。 */
(function () {
  'use strict';
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  /* ---------------- 侧边栏 ---------------- */
  var panel = $('sidePanel'), scrim = $('sideScrim');
  var planCard = $('planCard'), planSlot = $('planSlot');
  if (planCard && planSlot) planSlot.appendChild(planCard);
  var sheet = $('listSheet'), listSlot = $('listSlot');
  if (sheet && listSlot) listSlot.appendChild(sheet);
  var listBuilt = false;
  function ensureList() {
    if (listBuilt) { sheet.hidden = false; return; }
    var btn = $('listBtn');
    if (btn) { btn.click(); listBuilt = true; sheet.hidden = false; }
  }
  // atlas.js 在打开讲义/按 Esc 时会隐藏 listSheet；侧边栏打开期间保持可见
  if (sheet) new MutationObserver(function () {
    if (panel.classList.contains('open') && sheet.hidden) sheet.hidden = false;
  }).observe(sheet, { attributes: true, attributeFilter: ['hidden'] });

  function setSide(open) {
    panel.classList.toggle('open', open);
    scrim.hidden = !open;
    try { localStorage.setItem('atlasSideOpen', open ? '1' : '0'); } catch (e) {}
    if (open) { ensureList(); loadStudy(); }
  }
  var brand = $('brandBtn');
  if (brand) {
    brand.addEventListener('click', function () { setSide(!panel.classList.contains('open')); });
    brand.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSide(!panel.classList.contains('open')); } });
  }
  $('sideClose').addEventListener('click', function () { setSide(false); });
  scrim.addEventListener('click', function () { setSide(false); });
  try { if (localStorage.getItem('atlasSideOpen') === '1') setSide(true); } catch (e) {}

  /* ---------------- 学情速览 ---------------- */
  var SUBJ = { math: '数学一', math2: '数学二', english: '英语一', english2: '英语二', mechanics: '807 材料力学', politics: '政治' };
  var COLORS = { math: '#B8860B', math2: '#8A6BA8', english: '#4A6FA5', english2: '#3E8E8A', mechanics: '#A53B30', politics: '#3E7A4E' };
  function statsOf(a) {
    var g = 0, s = 0, m = 0;
    Object.keys(a.results || {}).forEach(function (qid) {
      var r = a.results[qid];
      if (r && r.status === 'graded') { g++; s += (+r.score || 0); m += (+r.maxScore || 0); }
    });
    return { graded: g, total: (a.questions || []).length, score: s, max: m, rate: m > 0 ? s / m : null };
  }
  function titleOf(a) {
    var q = (a.questions || [])[0] || {};
    if (a.mode === 'mock') return (SUBJ[a.subject] || a.subject) + ' · 全真模考';
    if (a.mode === 'diagnostic') return (SUBJ[a.subject] || a.subject) + ' · 能力自测';
    return q.chapterTitle || (SUBJ[a.subject] || a.subject) + ' · 套卷';
  }
  var studyLoaded = false;
  async function loadStudy() {
    if (studyLoaded || !window.AtlasUser) return;
    studyLoaded = true;
    var body = $('sideStudyBody');
    try {
      var data = await window.AtlasUser.json('/api/attempts');
      var list = (data.attempts || []).map(function (a) { return { a: a, st: statsOf(a) }; }).filter(function (x) { return x.st.graded > 0; });
      if (!list.length) { body.innerHTML = '<p class="side-muted">还没有已批改的套卷。做一套卷交卷批改后，这里会显示你的得分率与各科状态。</p>'; return; }
      var ts = 0, tm = 0;
      list.forEach(function (x) { ts += x.st.score; tm += x.st.max; });
      var overall = tm > 0 ? Math.round(ts / tm * 100) : 0;
      var bySubj = {};
      list.forEach(function (x) { (bySubj[x.a.subject] = bySubj[x.a.subject] || []).push(x); });
      var rows = Object.keys(bySubj).map(function (sid) {
        var arr = bySubj[sid].slice().sort(function (p, q) { return String(p.a.createdAt).localeCompare(String(q.a.createdAt)); });
        var last = arr[arr.length - 1], prev = arr[arr.length - 2];
        var rate = Math.round(last.st.rate * 100);
        var delta = '';
        if (prev && prev.st.rate != null && last.st.rate != null) {
          var d = Math.round((last.st.rate - prev.st.rate) * 100);
          if (d > 0) delta = ' <em class="up">↑' + d + '</em>';
          else if (d < 0) delta = ' <em class="dn">↓' + (-d) + '</em>';
        }
        return '<div class="ss-row"><span class="nm">' + esc(SUBJ[sid] || sid) + '</span>' +
          '<span class="ss-track"><i style="width:' + rate + '%;background:' + (COLORS[sid] || '#B8860B') + '"></i></span>' +
          '<span class="vl">' + rate + '%' + delta + '</span></div>';
      }).join('');
      var latest = list.slice().sort(function (p, q) { return String(q.a.createdAt).localeCompare(String(p.a.createdAt)); })[0];
      var d = new Date(latest.a.createdAt);
      body.innerHTML =
        '<div class="ss-big"><b>' + overall + '%</b><span>整体得分率 · ' + list.length + ' 套已批改</span></div>' +
        rows +
        '<div class="ss-last">最近一套：<b>' + esc(titleOf(latest.a)) + '</b> · ' + Math.round(latest.st.rate * 100) + '%（' + (d.getMonth() + 1) + '月' + d.getDate() + '日）</div>';
    } catch (e) { body.innerHTML = '<p class="side-muted">学情数据暂时加载失败，点「完整分析」查看。</p>'; }
  }

  /* ---------------- 铃铛 ---------------- */
  var bellBtn = $('bellBtn'), bellPanel = $('bellPanel'), bellDot = $('bellDot'), bellCount = $('bellCount');
  var UPDATES = [
    { d: '11月15日', t: '安卓 App v1.0 内测版发布：网页社区的发布帖与 GitHub 发布页可下载安装，与网页版共用账号和数据，欢迎反馈内测问题' },
    { d: '11月15日', t: '首页改版：点左上角「观」打开学习中心（学习计划、学情速览、目录都在里面）；「套卷分析」更名为「学情分析」；右上角铃铛汇集意见反馈、公告与消息通知' },
    { d: '11月15日', t: '学情分析升级：得分率改为同科目折线对比，能力雷达按科目六维展开，评分按科目采用不同指标' },
    { d: '11月15日', t: '全真模考上线：180 分钟倒计时与纯净模式；安卓 App 发布，支持 App 内检查更新' },
    { d: '11月15日', t: '批改可挂后台：交卷后离开刷题页也会继续批改，批完发消息通知，点消息直达评分页' }
  ];
  function fmtTime(ts) {
    var d = Date.now() - ts;
    if (d < 60000) return '刚刚';
    if (d < 3600000) return Math.floor(d / 60000) + ' 分钟前';
    if (d < 86400000) return Math.floor(d / 3600000) + ' 小时前';
    var dt = new Date(ts); return (dt.getMonth() + 1) + '月' + dt.getDate() + '日';
  }
  async function refreshBell() {
    if (!window.AtlasGradeBg) return;
    var msgs = await window.AtlasGradeBg.inbox();
    var unread = msgs.filter(function (m) { return !m.read; }).length;
    bellDot.hidden = unread === 0;
    bellCount.hidden = unread === 0;
    bellCount.textContent = unread;
    var pane = bellPanel.querySelector('[data-bpane="inbox"]');
    pane.innerHTML = msgs.length ? msgs.map(function (m) {
      return '<button type="button" class="bell-msg' + (m.read ? '' : ' unread') + '" data-att="' + esc(m.attemptId || '') + '"><b>' + (m.kind === 'grade' ? '批改完成' : '消息') + '：' + esc(m.title || '套卷') + '</b><span>' + fmtTime(m.at) + ' · 点此查看评分与解析</span></button>';
    }).join('') : '<div class="bell-empty">还没有消息。交卷后批改完成会在这里提醒你。</div>';
    pane.querySelectorAll('[data-att]').forEach(function (b) {
      b.addEventListener('click', function () { if (b.dataset.att) location.href = 'analytics.html?attempt=' + encodeURIComponent(b.dataset.att); });
    });
  }
  async function paintNotice() {
    var pane = bellPanel.querySelector('[data-bpane="notice"]');
    var ann = '';
    try {
      var r = await fetch('/api/announcement', { credentials: 'same-origin' });
      var j = await r.json();
      ann = (j && j.announcement) || '';
    } catch (e) {}
    var now = new Date();
    var html = '<div class="bell-month">' + now.getFullYear() + ' 年 ' + (now.getMonth() + 1) + ' 月</div><ul class="bell-tl">';
    if (ann) html += '<li class="pin"><span class="d">站长公告</span> · ' + esc(ann) + '</li>';
    html += UPDATES.map(function (u) { return '<li><span class="d">' + u.d + '更新</span> | ' + esc(u.t) + '</li>'; }).join('');
    html += '</ul>';
    pane.innerHTML = html;
  }
  function bellTab(name) {
    bellPanel.querySelectorAll('[data-btab]').forEach(function (b) { b.classList.toggle('on', b.dataset.btab === name); });
    bellPanel.querySelectorAll('[data-bpane]').forEach(function (p) { p.hidden = p.dataset.bpane !== name; });
    if (name === 'inbox' && window.AtlasGradeBg) window.AtlasGradeBg.markAllRead().then(function () { setTimeout(refreshBell, 300); });
  }
  bellPanel.querySelectorAll('[data-btab]').forEach(function (b) { b.addEventListener('click', function () { bellTab(b.dataset.btab); }); });
  bellBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    var open = bellPanel.hidden;
    bellPanel.hidden = !open;
    if (open) { refreshBell(); paintNotice(); }
  });
  document.addEventListener('click', function (e) { if (!bellPanel.hidden && !bellPanel.contains(e.target)) bellPanel.hidden = true; });
  $('bellFeedbackBtn').addEventListener('click', function () {
    bellPanel.hidden = true;
    var opener = document.querySelector('.atlas-tools button');
    if (opener) opener.click();
  });
  refreshBell();

  /* ---------------- 顶栏搜索 ---------------- */
  var FEATURES = [
    { n: '刷题练习', href: 'practice.html', k: '刷题 练习 做题 知识点 套卷' },
    { n: '全真模考', href: 'practice.html', k: '全真模考 模考 模拟考试 限时' },
    { n: '学情分析', href: 'analytics.html', k: '学情分析 成绩 得分率 雷达 复盘' },
    { n: '错题本', href: 'wrongbook.html', k: '错题本 错题 复盘 打印' },
    { n: '我的收藏', href: 'wrongbook.html?scope=fav', k: '收藏 收藏夹 星标' },
    { n: '资料上传 · 资料库', href: 'library.html', k: '资料 上传 资料库 文件 导入' },
    { n: '社区', href: 'community.html', k: '社区 交流 广场 分享' },
    { n: '每日单词', href: 'vocab.html', k: '单词 词汇 背单词 英语' },
    { n: '政治时间轴', href: 'timeline.html', k: '政治 时间轴 时政' },
    { n: '学习计划', act: 'side', k: '学习计划 计划 今日任务' },
    { n: '笔记库', act: 'notes', k: '笔记 笔记库 讲义笔记' },
    { n: '功能引导', act: 'tour', k: '功能引导 新手 教程 帮助' },
    { n: '我的档案', href: 'index.html#profile', k: '档案 目标院校 个人资料' }
  ];
  var input = $('topSearchInput'), results = $('topSearchResults');
  function closeResults() { results.hidden = true; }
  function doSearch(q) {
    q = (q || '').trim();
    if (!q) { closeResults(); return; }
    var items = [];
    FEATURES.forEach(function (f) {
      if (f.n.indexOf(q) >= 0 || f.k.toLowerCase().indexOf(q.toLowerCase()) >= 0) items.push({ tag: '功能', label: f.n, sub: '功能入口', f: f });
    });
    var A = window.ATLAS;
    if (A && A.subjects) {
      A.subjects.forEach(function (s) {
        s.chapters.forEach(function (ch) {
          if (ch.title.indexOf(q) >= 0) items.push({ tag: '章节', label: ch.title, sub: s.name, href: '#read=' + ch.id });
          (ch.kps || []).forEach(function (kp) {
            if (kp.name.indexOf(q) >= 0) items.push({ tag: '知识点', label: kp.name, sub: s.name + ' · ' + ch.title, href: '#read=' + ch.id + '&kp=' + kp.id });
          });
        });
      });
    }
    items = items.slice(0, 14);
    results.innerHTML = items.length ? items.map(function (it, i) {
      return '<button type="button" class="tsr-item" data-i="' + i + '"><span class="tsr-tag">' + it.tag + '</span><span>' + esc(it.label) + '</span><small>' + esc(it.sub) + '</small></button>';
    }).join('') : '<div class="tsr-empty">没有找到「' + esc(q) + '」相关的知识点或功能。</div>';
    results.hidden = false;
    results.querySelectorAll('.tsr-item').forEach(function (b) {
      b.addEventListener('click', function () {
        var it = items[+b.dataset.i];
        closeResults(); input.value = '';
        if (it.f && it.f.act === 'side') { setSide(true); return; }
        if (it.f && it.f.act === 'notes') { var lb = $('lazyBtn'); if (lb) lb.click(); return; }
        if (it.f && it.f.act === 'tour') { var tb = $('tourBtn'); if (tb) tb.click(); return; }
        if (it.f && it.f.href) { location.href = it.f.href; return; }
        if (it.href) { if (location.hash === it.href) location.reload(); else location.hash = it.href; }
      });
    });
  }
  if (input) {
    input.addEventListener('input', function () { doSearch(input.value); });
    input.addEventListener('focus', function () { if (input.value.trim()) doSearch(input.value); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeResults(); input.blur(); }
      if (e.key === 'Enter') { var first = results.querySelector('.tsr-item'); if (first) first.click(); }
    });
    document.addEventListener('click', function (e) { if (!results.hidden && !e.target.closest('.top-search')) closeResults(); });
  }
})();
