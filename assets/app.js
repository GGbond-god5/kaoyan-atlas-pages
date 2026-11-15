/* 考研科目大观 · App（移动端独立结构）
 * 五栏：首页 / 题库 / 刷题 / 错题 / 我的。与网页版共用账号、题库与后端接口，
 * 结构独立：首页只放今日任务与入口，目录收进题库逐级展开。
 * 数据：AtlasUser（/api/state、/api/profile、/api/attempts）+ AtlasQuestions 分片。 */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var SUBJECT_NAMES = { math: '数学一', math2: '数学二', english: '英语一', english2: '英语二', mechanics: '807 材料力学', politics: '政治' };
  var SUBJECT_ORDER = ['math', 'math2', 'english', 'english2', 'mechanics', 'politics'];
  var MODE_LABELS = { paper: '套卷', mock: '全真模考', diagnostic: '能力自测', knowledge: '知识点练习' };

  var state = { user: null, profile: null, practiceRec: {}, bankItems: {} };

  function toast(msg) {
    var t = $('#appToast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.hidden = true; }, 2200);
  }

  /* ---------- 视图切换 ---------- */
  var VIEWS = ['home', 'bank', 'practice', 'wrong', 'me'];
  function switchView(name) {
    if (VIEWS.indexOf(name) < 0) name = 'home';
    VIEWS.forEach(function (v) { $('#view-' + v).hidden = v !== name; });
    $$('#appTabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === name); });
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
    window.scrollTo(0, 0);
    if (name === 'bank') renderBankSubjects();
    if (name === 'wrong') renderWrong();
  }
  $$('#appTabs button').forEach(function (b) {
    b.addEventListener('click', function () { switchView(b.dataset.tab); });
  });
  $('#topAvatar').addEventListener('click', function () { switchView('me'); });

  /* ---------- 首页 ---------- */
  function daysLeft(examDate) {
    if (!examDate) return null;
    var d = new Date(examDate);
    if (isNaN(d)) return null;
    var today = new Date(); today.setHours(0, 0, 0, 0);
    d.setHours(0, 0, 0, 0);
    return Math.round((d - today) / 86400000);
  }

  function renderHero() {
    var p = state.profile || {};
    var user = state.user || {};
    var nick = p.nickname || user.nickname || '考研人';
    $('#heroHello').textContent = '你好，' + nick;
    if (p.motto) $('#heroMotto').textContent = p.motto;
    var left = daysLeft(p.examDate);
    $('#heroDays').textContent = left == null ? '--' : Math.max(0, left);
    var target = [p.school || p.university, p.code || p.programCode, p.major || p.majorName].filter(Boolean).join(' · ');
    $('#heroTarget').textContent = target ? '目标：' + target : '';
    // 我的页
    $('#meName').textContent = nick;
    $('#meMotto').textContent = p.motto || '';
    $('#meTarget').textContent = target ? '目标：' + target : '尚未填写目标院校';
    var ch = nick.charAt(0) || '观';
    $('#topAvatarChar').textContent = ch;
    $('#meAvatarChar').textContent = ch;
    // 头像图片（失败则回退到文字）
    [['#topAvatarImg', '#topAvatarChar'], ['#meAvatarImg', '#meAvatarChar']].forEach(function (pair) {
      var img = $(pair[0]);
      if (!img) return;
      img.onload = function () { img.hidden = false; $(pair[1]).hidden = true; };
      img.onerror = function () { img.hidden = true; };
      img.src = '/api/profile/avatar';
    });
  }

  function summarizeAttempt(a) {
    var qs = a.questions || [], graded = 0, score = 0, max = 0;
    qs.forEach(function (q) {
      var r = (a.results || {})[q.id];
      if (r && r.status === 'graded' && Number(r.maxScore) > 0) {
        graded++; score += Number(r.score); max += Number(r.maxScore);
      }
    });
    return { graded: graded, rate: max > 0 ? score / max : null };
  }
  function attemptTitle(a) {
    var subj = SUBJECT_NAMES[a.subject] || a.subject || '套卷';
    return subj + ' · ' + (MODE_LABELS[a.mode] || '套卷');
  }
  function attemptDate(a) {
    var v = a.createdAt || a.created_at || a.ts || a.time;
    if (!v) return '';
    var d = new Date(v);
    if (isNaN(d)) return '';
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  }

  function renderRecent(attempts) {
    var list = (attempts || []).filter(function (a) {
      return a.mode === 'paper' || a.mode === 'mock' || a.mode === 'diagnostic';
    }).slice(-3).reverse();
    var box = $('#recentList');
    if (!list.length) {
      $('#recentEmpty').textContent = '还没有套卷或模考成绩，去刷题页做一套吧。';
      return;
    }
    $('#recentEmpty').hidden = true;
    $('#recentMore').hidden = false;
    box.innerHTML = list.map(function (a) {
      var s = summarizeAttempt(a);
      var rate = s.rate == null ? '待批改' : Math.round(s.rate * 100) + '%';
      var cls = s.rate == null ? 'mid' : s.rate >= 0.8 ? 'good' : s.rate >= 0.5 ? 'mid' : 'low';
      return '<div class="recent-row"><span class="recent-title">' + esc(attemptTitle(a)) + '</span>' +
        '<span class="recent-rate ' + cls + '">' + rate + '</span>' +
        '<span class="recent-date">' + esc(attemptDate(a)) + '</span></div>';
    }).join('');
  }

  function renderToday() {
    var shown = 0;
    // 错题复习：优先读 review 排程的到期数，读不到则用错题总数
    var reviewDue = null;
    try {
      var rev = state.reviewState || {};
      var now = Date.now(), n = 0, has = false;
      Object.keys(rev).forEach(function (k) {
        var e = rev[k];
        if (e && typeof e === 'object' && typeof e.due === 'number') { has = true; if (e.due <= now) n++; }
      });
      if (has) reviewDue = n;
    } catch (_) { /* 忽略 */ }
    var wrongTotal = Object.keys(state.practiceRec).filter(function (id) {
      var r = state.practiceRec[id]; return r && r.wrong > 0;
    }).length;
    var reviewRow = $('#todayReview');
    if (reviewDue != null && reviewDue > 0) {
      reviewRow.querySelector('.today-text').textContent = '有 ' + reviewDue + ' 道错题到期复习';
      reviewRow.hidden = false; shown++;
    } else if (wrongTotal > 0) {
      reviewRow.querySelector('.today-text').textContent = '错题本里有 ' + wrongTotal + ' 道错题待巩固';
      reviewRow.hidden = false; shown++;
    }
    // 到期单词
    var vocabDue = 0;
    try {
      var vrec = (state.vocabState && state.vocabState.rec) || {};
      var now2 = Date.now();
      Object.keys(vrec).forEach(function (w) {
        var e = vrec[w];
        if (e && e.d <= now2 && e.l < 5) vocabDue++;
      });
    } catch (_) { /* 忽略 */ }
    if (vocabDue > 0) {
      var vr = $('#todayVocab');
      vr.querySelector('.today-text').textContent = '有 ' + vocabDue + ' 个单词到期复习';
      vr.hidden = false; shown++;
    }
    // 今日计划（结构防御性读取）
    try {
      var plan = state.planState || {};
      var days = plan.days || plan.list || [];
      if (Array.isArray(days) && days.length) {
        var t = new Date();
        var key = t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
        var day = null;
        days.forEach(function (d) { if (d && (d.date === key || d.day === key)) day = d; });
        if (!day) day = days[0];
        var tasks = (day && (day.tasks || day.items)) || [];
        if (tasks.length) {
          var done = tasks.filter(function (x) { return x && (x.done || x.completed || x.checked); }).length;
          var pr = $('#todayPlan');
          pr.querySelector('.today-text').textContent = '今日计划已完成 ' + done + ' / ' + tasks.length + ' 项';
          pr.hidden = false; shown++;
        }
      }
    } catch (_) { /* 忽略 */ }
    $('#todayEmpty').hidden = shown > 0;
    if (!shown) $('#todayEmpty').textContent = '今天没有到期任务，去刷题页开一套新卷吧。';
  }

  /* ---------- 题库 ---------- */
  var bankRendered = false;
  function renderBankSubjects() {
    if (bankRendered) return;
    bankRendered = true;
    AtlasQuestions.manifest.then(function (m) {
      var box = $('#subjectList');
      var subjects = (m && m.subjects) || {};
      var rows = SUBJECT_ORDER.filter(function (s) { return subjects[s] > 0; }).map(function (s) {
        return '<button type="button" class="subject-row" data-subject="' + s + '">' +
          '<span class="subject-name">' + SUBJECT_NAMES[s] + '</span>' +
          '<span class="subject-count">' + subjects[s] + ' 题</span>' +
          '<span class="subject-arrow">›</span></button>';
      }).join('');
      box.innerHTML = rows || '<div class="today-empty">题库清单加载失败，下拉刷新重试。</div>';
      $$('.subject-row', box).forEach(function (b) {
        b.addEventListener('click', function () { openSubject(b.dataset.subject); });
      });
    });
  }

  function openSubject(subject) {
    $('#bankSubjects').hidden = true;
    var detail = $('#bankDetail');
    detail.hidden = false;
    $('#bankDetailTitle').textContent = SUBJECT_NAMES[subject] + ' · 章节考点';
    var box = $('#chapterList');
    box.innerHTML = '<div class="today-empty">正在加载这一科的题库…</div>';
    window.scrollTo(0, 0);
    AtlasQuestions.load(subject).then(function () {
      var items = (window.QUESTIONS.items || []).filter(function (i) { return i.subject === subject; });
      // 个人题库一并计入（与刷题页口径一致）
      renderChapters(subject, items, box);
    }).catch(function () {
      box.innerHTML = '<div class="today-empty">题库加载失败，检查网络后重试。</div>';
    });
  }

  function renderChapters(subject, items, box) {
    var chapters = {}, order = [];
    items.forEach(function (i) {
      var ck = i.topicChapter || i.chapter || '';
      if (!ck) return;
      if (!chapters[ck]) {
        chapters[ck] = { key: ck, title: i.topicTitle || i.chapterTitle || ck, kps: {}, kpOrder: [], count: 0 };
        order.push(ck);
      }
      var ch = chapters[ck];
      ch.count++;
      var kp = i.kp || '';
      if (kp) {
        if (!ch.kps[kp]) { ch.kps[kp] = { id: kp, name: i.kpName || kp, count: 0 }; ch.kpOrder.push(kp); }
        ch.kps[kp].count++;
      }
    });
    if (!order.length) {
      box.innerHTML = '<div class="today-empty">这一科暂无章节数据。</div>';
      return;
    }
    box.innerHTML = order.map(function (ck, idx) {
      var ch = chapters[ck];
      var kps = ch.kpOrder.map(function (kid) {
        var k = ch.kps[kid];
        var href = 'practice.html?subject=' + encodeURIComponent(subject) +
          '&chapter=' + encodeURIComponent(ck) + '&kp=' + encodeURIComponent(kid);
        return '<div class="kp-row"><span class="kp-name">' + esc(k.name) + '</span>' +
          '<span class="kp-count">' + k.count + ' 题</span>' +
          '<a class="kp-go" href="' + href + '">练这个考点</a></div>';
      }).join('');
      var allHref = 'practice.html?subject=' + encodeURIComponent(subject) + '&chapter=' + encodeURIComponent(ck);
      return '<div class="chapter-block"><button type="button" class="chapter-head" data-ch="' + idx + '">' +
        '<span class="chapter-name">' + esc(ch.title) + '</span>' +
        '<span class="chapter-meta">' + ch.kpOrder.length + ' 考点 · ' + ch.count + ' 题</span>' +
        '<span class="chapter-chev">›</span></button>' +
        '<div class="chapter-kps">' + kps + '<a class="chapter-all" href="' + allHref + '">练整章 →</a></div></div>';
    }).join('');
    $$('.chapter-head', box).forEach(function (h) {
      h.addEventListener('click', function () { h.parentElement.classList.toggle('open'); });
    });
  }
  $('#bankBack').addEventListener('click', function () {
    $('#bankDetail').hidden = true;
    $('#bankSubjects').hidden = false;
    window.scrollTo(0, 0);
  });

  /* ---------- 错题 ---------- */
  function renderWrong() {
    var rec = state.practiceRec || {};
    var seen = 0, ok = 0, wrong = 0;
    Object.keys(rec).forEach(function (id) {
      var r = rec[id] || {};
      seen += r.seen || 0;
      ok += r.ok || 0;
      if (r.wrong > 0) wrong++;
    });
    $('#statWrong').textContent = wrong;
    $('#statSeen').textContent = seen;
    $('#statRate').textContent = seen > 0 ? Math.round(ok / seen * 100) + '%' : '--';
  }

  /* ---------- 退出登录 ---------- */
  $('#logoutBtn').addEventListener('click', function () {
    AtlasUser.json('/api/auth/logout', 'POST').catch(function () {}).then(function () {
      location.replace('login.html');
    });
  });

  /* ---------- 启动 ---------- */
  function boot() {
    AtlasUser.ready.then(function (user) {
      state.user = user;
      switchView((location.hash || '#home').slice(1));
      AtlasUser.json('/api/profile').then(function (r) {
        state.profile = r.profile || {};
        renderHero();
        // 管理员入口
        AtlasUser.json('/api/admin').then(function () { $('#adminEntry').hidden = false; }).catch(function () {});
      }).catch(function () { renderHero(); });
      AtlasUser.load('practice', { rec: {} }).then(function (d) {
        state.practiceRec = (d && d.rec) || {};
        renderToday();
        renderWrong();
      }).catch(function () { renderToday(); });
      AtlasUser.load('vocab', { rec: {} }).then(function (d) { state.vocabState = d || {}; renderToday(); }).catch(function () {});
      AtlasUser.load('review', {}).then(function (d) { state.reviewState = d || {}; renderToday(); }).catch(function () {});
      AtlasUser.load('plan', {}).then(function (d) { state.planState = d || {}; renderToday(); }).catch(function () {});
      AtlasUser.json('/api/attempts').then(function (r) {
        renderRecent(r.attempts || r || []);
      }).catch(function () {
        $('#recentEmpty').textContent = '成绩加载失败，稍后重试。';
      });
    }).catch(function () {
      location.replace('login.html');
    });
  }
  boot();
})();
