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

  var state = { user: null, profile: null, practiceRec: {}, bankItems: {}, attempts: null };

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
    if (name === 'me') refreshInboxBadge();
    if (window.AtlasApp && window.AtlasApp.setTab) { try { window.AtlasApp.setTab(name); } catch (e) {} }
  }
  window.__atlasSwitch = switchView;
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
    box.innerHTML = list.map(function (a) {
      var s = summarizeAttempt(a);
      var rate = s.rate == null ? '待批改' : Math.round(s.rate * 100) + '%';
      var cls = s.rate == null ? 'mid' : s.rate >= 0.8 ? 'good' : s.rate >= 0.5 ? 'mid' : 'low';
      return '<div class="recent-row"' + (a.id ? ' data-att="' + esc(a.id) + '"' : '') + '><span class="recent-title">' + esc(attemptTitle(a)) + '</span>' +
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

  /* ---------- 知识库 ----------
   * 定位与刷题分开：这里只做知识的查与读——科目 → 章节讲义 → 考点，
   * 全部来自图谱数据（assets/data.js），点章节进小说式阅读器精读，
   * 点考点直达讲义对应位置；练题入口留在讲义内与刷题页，不在这里重复。 */
  var bankRendered = false;
  function renderBankSubjects() {
    if (bankRendered) return;
    bankRendered = true;
    wireKbSearch();
    ensureAtlas().then(function (data) {
      var box = $('#subjectList');
      if (!data || !data.subjects) { box.innerHTML = '<div class="today-empty">知识库加载失败，下拉刷新重试。</div>'; return; }
      box.innerHTML = data.subjects.map(function (sub) {
        var kpCount = (sub.chapters || []).reduce(function (n, c) { return n + ((c.kps || []).length); }, 0);
        return '<button type="button" class="subject-row" data-subject="' + esc(sub.id) + '">' +
          '<span class="subject-name">' + esc(sub.name) + '</span>' +
          '<span class="subject-count">' + (sub.chapters || []).length + ' 章 · ' + kpCount + ' 考点</span>' +
          '<span class="subject-arrow">›</span></button>';
      }).join('');
      $$('.subject-row', box).forEach(function (b) {
        b.addEventListener('click', function () { openSubject(b.dataset.subject); });
      });
    }).catch(function () {
      $('#subjectList').innerHTML = '<div class="today-empty">知识库加载失败，检查网络后重试。</div>';
    });
  }

  function wireKbSearch() {
    var inp = document.getElementById('kbSearch');
    if (!inp || inp.dataset.wired) return;
    inp.dataset.wired = '1';
    var timer = null;
    inp.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { paintKbResults(inp.value.trim()); }, 250);
    });
  }
  function paintKbResults(q) {
    var box = document.getElementById('kbResults');
    if (!box) return;
    if (!q) { box.innerHTML = ''; return; }
    if (!atlasData) { box.innerHTML = '<div class="today-empty">知识库还在加载，稍等一下再搜。</div>'; return; }
    var hits = [];
    (atlasData.subjects || []).forEach(function (sub) {
      (sub.chapters || []).forEach(function (ch) {
        if (ch.title && ch.title.indexOf(q) >= 0) hits.push({ sub: sub, ch: ch, kp: null });
        (ch.kps || []).forEach(function (kp) {
          if (kp.name && kp.name.indexOf(q) >= 0) hits.push({ sub: sub, ch: ch, kp: kp });
        });
      });
    });
    if (!hits.length) { box.innerHTML = '<div class="today-empty">没找到「' + esc(q) + '」相关的考点，换个关键词试试。</div>'; return; }
    box.innerHTML = '<div class="card" style="margin-top:10px">' + hits.slice(0, 30).map(function (h2) {
      return '<div class="list-row"><button type="button" class="kp-name-btn" data-kb-go="' + esc(h2.sub.id) + '|' + esc(h2.ch.id) + '|' + esc(h2.kp ? h2.kp.id : '') + '">' + esc(h2.kp ? h2.kp.name : h2.ch.title) + '</button>' +
        '<div class="row-meta">' + esc(h2.sub.name) + ' · ' + esc(h2.ch.title) + (h2.kp ? '' : ' · 整章') + '</div></div>';
    }).join('') + (hits.length > 30 ? '<p class="view-note">只显示前 30 条，换个更具体的词试试。</p>' : '') + '</div>';
    $$('[data-kb-go]', box).forEach(function (b) {
      b.addEventListener('click', function () {
        var parts = b.dataset.kbGo.split('|');
        var meta = resolveChapterMeta(parts[0], parts[1], '');
        openReader(parts[0], parts[1], meta ? meta.chapter.title : '', parts[2] || null);
      });
    });
  }

  function openSubject(subjectId) {
    ensureAtlas().then(function (data) {
      var subj = data && (data.subjects || []).filter(function (x) { return x.id === subjectId; })[0];
      if (!subj) return;
      $('#bankSubjects').hidden = true;
      var detail = $('#bankDetail');
      detail.hidden = false;
      $('#bankDetailTitle').textContent = subj.name + ' · 章节讲义';
      window.scrollTo(0, 0);
      var box = $('#chapterList');
      box.innerHTML = (subj.chapters || []).map(function (ch, idx) {
        var kps = (ch.kps || []).map(function (kp) {
          var tags = [kp.freq, kp.level].filter(Boolean).join(' · ');
          return '<div class="kp-row"><button type="button" class="kp-name-btn" data-read-kp="' + esc(kp.id) + '" data-chapter="' + esc(ch.id) + '" data-title="' + esc(ch.title) + '">' + esc(kp.name) + '</button>' +
            (tags ? '<span class="kp-count">' + esc(tags) + '</span>' : '') + '</div>';
        }).join('');
        var meta = [ch.priority, (ch.kps || []).length + ' 考点', ch.meta].filter(Boolean).join(' · ');
        return '<div class="chapter-block"><button type="button" class="chapter-head" data-ch="' + idx + '">' +
          '<span class="chapter-name">' + esc(ch.title) + '</span>' +
          '<span class="chapter-meta">' + esc(meta) + '</span>' +
          '<span class="chapter-chev">›</span></button>' +
          '<div class="chapter-kps"><div class="chapter-actions"><button type="button" class="kp-read-btn" data-read-chapter="' + esc(ch.id) + '" data-title="' + esc(ch.title) + '">阅读本章讲义</button>' +
          '<a class="kp-practice-btn" href="practice.html?subject=' + esc(subjectId) + '&chapter=' + esc(ch.id) + '&autostart=1">刷本章题 →</a></div>' + kps + '</div></div>';
      }).join('') || '<div class="today-empty">这一科暂无讲义章节。</div>';
      $$('.chapter-head', box).forEach(function (hd) {
        hd.addEventListener('click', function () { hd.parentElement.classList.toggle('open'); });
      });
      $$('[data-read-chapter]', box).forEach(function (b) {
        b.addEventListener('click', function () { openReader(subjectId, b.dataset.readChapter, b.dataset.title, null); });
      });
      $$('[data-read-kp]', box).forEach(function (b) {
        b.addEventListener('click', function () { openReader(subjectId, b.dataset.chapter, b.dataset.title, b.dataset.readKp); });
      });
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

  /* ---------- 小观 AI 向导（App 形态）----------
   * 位置逻辑（参考 LobeChat / Dify 等成熟产品的移动端形态）：
   * 首页一级入口卡（不做悬浮球，不遮挡内容）→ 全屏对话页（底部输入栏 + 图片附件）；
   * 场景入口：阅读器顶栏「问小观」带本章上下文。对话走 /api/coach（home-guide），
   * 与网页版同一位小观、同一套讲题口径。 */
  var gMsgs = [], gCid = null, gImage = null, gBusy = false;
  var gScene = { type: 'home', title: '' };
  var HOME_CHIPS = ['怎么上传自己的资料？', '套卷分析在哪看？', '按我的进度，今天先复习什么？', '错题复习是怎么安排的？'];
  var GREETING = '你好，我是小观。可以问我站内功能怎么用（比如上传资料、看套卷分析），也可以直接发题目——打字或点「图片」拍照，我按步骤给你讲。';

  function gFmt(s) { return esc(window.AtlasPlain ? window.AtlasPlain.clean(s) : s); }
  function gMath(el) {
    if (window.AtlasKatex && window.AtlasKatex.render) { window.AtlasKatex.render(el); return; }
    if (window.renderMathInElement) {
      try {
        window.renderMathInElement(el, { delimiters: [{ left: '\\(', right: '\\)', display: false }, { left: '\\[', right: '\\]', display: true }], throwOnError: false });
      } catch (_) { /* 忽略 */ }
    }
  }
  function gAddMsg(role, text, img) {
    var box = $('#guideMsgs');
    var d = document.createElement('div');
    d.className = 'g-msg ' + (role === 'user' ? 'u' : 'a');
    d.innerHTML = gFmt(text || '') + (img ? '<img alt="题目照片" src="' + img + '">' : '');
    box.appendChild(d);
    gMath(d);
    box.scrollTop = box.scrollHeight;
    return d;
  }
  function gCompress(file, cb) {
    var url = URL.createObjectURL(file), im = new Image();
    im.onload = function () {
      URL.revokeObjectURL(url);
      var scale = Math.min(1, 1280 / Math.max(im.width, im.height));
      var c = document.createElement('canvas');
      c.width = Math.round(im.width * scale); c.height = Math.round(im.height * scale);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      cb(c.toDataURL('image/jpeg', 0.82));
    };
    im.onerror = function () { URL.revokeObjectURL(url); cb(null); };
    im.src = url;
  }
  function gRenderChips() {
    var chips = gScene.type === 'reader'
      ? ['讲讲本章的重点和难点', '本章最容易考什么题型？', '帮我总结本章要点']
      : HOME_CHIPS;
    $('#guideChips').innerHTML = chips.map(function (c) {
      return '<button type="button" class="guide-chip">' + esc(c) + '</button>';
    }).join('');
    $$('#guideChips .guide-chip').forEach(function (b) {
      b.addEventListener('click', function () {
        var q = b.textContent;
        if (gScene.type === 'reader' && gScene.title) q = '我正在读《' + gScene.title + '》这一章。' + q;
        gSend(q);
      });
    });
  }
  function openGuide(scene) {
    gScene = scene || { type: 'home', title: '' };
    $('#guideScene').textContent = gScene.type === 'reader'
      ? '正在读《' + (gScene.title || '本章') + '》 · 随问随答'
      : '功能引导 · 解题答疑';
    gRenderChips();
    $('#guideView').hidden = false;
    document.body.style.overflow = 'hidden';
    if (!gMsgs.length && !$('#guideMsgs').children.length) gAddMsg('assistant', GREETING);
  }
  function closeGuide() {
    $('#guideView').hidden = true;
    if ($('#readerView').hidden) document.body.style.overflow = '';
  }
  function gSend(text) {
    text = (text != null ? text : $('#guideInput').value).trim();
    if (gBusy || (!text && !gImage)) return;
    var myImage = gImage;
    gAddMsg('user', text, myImage);
    gMsgs.push({ role: 'user', content: text || '请看这张题目照片，帮我解这道题。', images: myImage ? [myImage] : undefined });
    gImage = null; $('#guidePreview').hidden = true; $('#guideInput').value = '';
    gBusy = true; $('#guideSend').disabled = true;
    var think = gAddMsg('assistant', '小观思考中…');
    think.classList.add('think');
    AtlasUser.json('/api/coach', 'POST', {
      conversationId: gCid || undefined,
      context: { source: 'home-guide', scene: gScene.type, chapterTitle: gScene.title || undefined },
      messages: gMsgs.slice(-20)
    }).then(function (r) {
      gCid = r.conversationId || gCid;
      think.remove();
      gAddMsg('assistant', r.reply || '（没有收到回复，请再试一次）');
      gMsgs.push({ role: 'assistant', content: r.reply || '' });
    }).catch(function (e) {
      think.remove();
      gAddMsg('assistant', '刚才没连上：' + (e.message || '请稍后再试') + '。可以检查网络后再发一次。');
      gMsgs.pop();
    }).finally(function () {
      gBusy = false; $('#guideSend').disabled = false;
    });
  }
  $('#guideCard').addEventListener('click', function (e) {
    if (e.target.closest('[data-guide-chip]')) return;
    openGuide({ type: 'home', title: '' });
  });
  $$('#guideCard [data-guide-chip]').forEach(function (b) {
    b.addEventListener('click', function () {
      openGuide({ type: 'home', title: '' });
      gSend(b.dataset.guideChip);
    });
  });
  $('#guideBack').addEventListener('click', closeGuide);
  $('#guideNew').addEventListener('click', function () {
    gMsgs = []; gCid = null; gImage = null;
    $('#guideMsgs').innerHTML = '';
    $('#guidePreview').hidden = true;
    gAddMsg('assistant', GREETING);
  });
  /* ---------- 小观对话历史：查看 / 继续 / 删除 / 清空 ---------- */
  function fmtHistTime(ts) {
    if (!ts) return '';
    var d = new Date(ts), now = new Date();
    var hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    if (d.toDateString() === now.toDateString()) return '今天 ' + hm;
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hm;
  }
  function closeHistory() { $('#historyView').hidden = true; }
  function resetGuideChat() {
    gCid = null; gMsgs = []; gImage = null;
    $('#guideMsgs').innerHTML = '';
    $('#guidePreview').hidden = true;
    gAddMsg('assistant', GREETING);
  }
  function openHistory() {
    $('#historyView').hidden = false;
    var box = $('#historyList');
    box.innerHTML = '<div class="sub-loading">正在加载历史…</div>';
    AtlasUser.json('/api/coach/list').then(function (r) {
      var list = r.conversations || [];
      if (!list.length) { box.innerHTML = '<div class="sub-loading">还没有历史对话。和 小观 聊过的内容会自动存到这里。</div>'; return; }
      box.innerHTML = list.map(function (c) {
        return '<div class="hist-row" data-hist="' + esc(c.id) + '"><div class="hist-main"><div class="hist-title">' + esc(c.title || '对话') + '</div>' +
          '<div class="hist-meta">' + c.count + ' 条消息' + (c.updatedAt ? ' · ' + fmtHistTime(c.updatedAt) : '') + (c.id === gCid ? ' · 当前对话' : '') + '</div></div>' +
          '<button type="button" class="btn-sub hist-del" data-hist-del="' + esc(c.id) + '">删除</button></div>';
      }).join('');
    }).catch(function (e) { box.innerHTML = '<div class="sub-loading">历史加载失败：' + esc(e.message || '') + '</div>'; });
  }
  function loadConversation(id) {
    AtlasUser.json('/api/coach/' + encodeURIComponent(id)).then(function (d) {
      var msgs = (d && d.messages) || [];
      gCid = id; gMsgs = []; gImage = null;
      $('#guideMsgs').innerHTML = '';
      $('#guidePreview').hidden = true;
      msgs.forEach(function (m) {
        if (!m || (m.role !== 'user' && m.role !== 'assistant')) return;
        gMsgs.push({ role: m.role, content: m.content || '', images: m.images });
        gAddMsg(m.role, m.content || '', m.images && m.images[0]);
      });
      if (!gMsgs.length) gAddMsg('assistant', GREETING);
      closeHistory();
      toast('已打开这条对话，可以继续聊');
    }).catch(function (e) { toast('打开失败：' + e.message); });
  }
  $('#guideHistoryBtn').addEventListener('click', openHistory);
  $('#historyBack').addEventListener('click', closeHistory);
  $('#historyList').addEventListener('click', function (e) {
    var del = e.target.closest('[data-hist-del]');
    if (del) {
      e.stopPropagation();
      var id = del.dataset.histDel;
      showConfirm({ title: '删除这条对话？', text: '删除后无法恢复。', okText: '删除' }).then(function (okDel) {
        if (!okDel) return;
        AtlasUser.json('/api/coach/' + encodeURIComponent(id), 'DELETE').then(function () {
          if (id === gCid) resetGuideChat();
          openHistory();
          toast('已删除');
        }).catch(function (err) { toast('删除失败：' + err.message); });
      });
      return;
    }
    var row = e.target.closest('[data-hist]');
    if (row) loadConversation(row.dataset.hist);
  });
  $('#historyClear').addEventListener('click', function () {
    AtlasUser.json('/api/coach/list').then(function (r) {
      var list = r.conversations || [];
      if (!list.length) { toast('没有可清空的历史'); return; }
      showConfirm({ title: '清空全部对话历史？', text: '共 ' + list.length + ' 条，删除后无法恢复。', okText: '全部删除' }).then(function (okAll) {
        if (!okAll) return;
        Promise.all(list.map(function (c) { return AtlasUser.json('/api/coach/' + encodeURIComponent(c.id), 'DELETE').catch(function () {}); })).then(function () {
          resetGuideChat();
          openHistory();
          toast('历史已清空');
        });
      });
    }).catch(function (e) { toast('操作失败：' + e.message); });
  });
  $('#guideSend').addEventListener('click', function () { gSend(); });
  $('#guideInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); gSend(); }
  });
  $('#guidePhoto').addEventListener('click', function () { $('#guideFile').click(); });
  $('#guideFile').addEventListener('change', function () {
    var f = $('#guideFile').files && $('#guideFile').files[0];
    $('#guideFile').value = '';
    if (!f) return;
    gCompress(f, function (d) {
      if (!d) { gAddMsg('assistant', '这张图片没读出来，换一张试试。'); return; }
      gImage = d;
      $('#guidePreviewImg').src = d;
      $('#guidePreview').hidden = false;
    });
  });
  $('#guidePreviewRm').addEventListener('click', function () {
    gImage = null;
    $('#guidePreview').hidden = true;
  });
  $('#readerGuideBtn').addEventListener('click', function () {
    var title = (reader.content && reader.content.title) || (reader.meta && reader.meta.title) || '';
    openGuide({ type: 'reader', title: title });
  });


  /* ---------- App 内功能框架 ----------
   * 首页与「我的」的入口不再跳网页版页面：分析 / 单词 / 错题本 / 资料库 /
   * 社区 / 计划 / 档案 / 设置都在 App 自己的子页面框架里运行，共用同一套
   * 后端接口与状态（与网页版实时同步）。做题引擎与图谱仍是站内页面。 */
  var FULL_SCORES = { math: 150, math2: 150, english: 100, english2: 100, mechanics: 150, politics: 100 };
  var subRenderers = {};
  var subCurrent = null;
  function openSub(name) {
    var r = subRenderers[name];
    if (!r) return;
    subCurrent = name;
    subBackHook = null;
    $('#subTitle').textContent = r.title;
    var body = $('#subBody');
    body.innerHTML = '<div class="sub-loading">正在加载…</div>';
    $('#subView').hidden = false;
    document.body.style.overflow = 'hidden';
    body.scrollTop = 0;
    try { r.render(body); } catch (e) { body.innerHTML = '<div class="sub-loading">打开失败：' + esc(e.message || '') + '</div>'; }
  }
  function closeSub() {
    $('#subView').hidden = true;
    subCurrent = null;
    subBackHook = null;
    if ($('#readerView').hidden && $('#guideView').hidden) document.body.style.overflow = '';
  }
  var subBackHook = null;
  $('#subBack').addEventListener('click', function () {
    var h = subBackHook; subBackHook = null;
    if (h) { try { if (h()) { reportLayer(); return; } } catch (e) { /* 钩子异常时直接关 */ } }
    closeSub();
  });
  /* 浮层（子页面/阅读器/向导/弹窗）状态上报原生壳：系统返回键先关最上层浮层，而不是跳页 */
  function anyLayerOpen() {
    return !$('#modalScrim').hidden || !$('#historyView').hidden || !$('#guideView').hidden || !$('#readerView').hidden || !$('#subView').hidden;
  }
  function reportLayer() {
    if (window.AtlasApp && window.AtlasApp.setLayerOpen) { try { window.AtlasApp.setLayerOpen(anyLayerOpen()); } catch (e) {} }
  }
  window.__atlasBack = function () {
    try {
      if (!$('#modalScrim').hidden) closeModal(null);
      else if (!$('#historyView').hidden) closeHistory();
      else if (!$('#guideView').hidden) closeGuide();
      else if (!$('#readerView').hidden) { $('#readerView').hidden = true; document.body.style.overflow = ''; }
      else if (!$('#subView').hidden) { document.getElementById('subBack').click(); return true; }
      else return false;
      reportLayer();
      return true;
    } catch (e) { return false; }
  };
  if (window.MutationObserver) {
    var layerObserver = new MutationObserver(function () { reportLayer(); });
    ['subView', 'readerView', 'guideView', 'modalScrim', 'historyView'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) layerObserver.observe(el, { attributes: true, attributeFilter: ['hidden'] });
    });
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-sub]');
    if (!t) return;
    e.preventDefault();
    openSub(t.dataset.sub);
  });
  var quickGuideEl = document.getElementById('quickGuide');
  if (quickGuideEl) quickGuideEl.addEventListener('click', function (e) { e.preventDefault(); openGuide({ type: 'home', title: '' }); });

  /* 通用弹窗（确认 / 表单），替代原生 confirm/prompt */
  var modalResolve = null;
  function closeModal(v) {
    $('#modalScrim').hidden = true;
    if (modalResolve) { var r = modalResolve; modalResolve = null; r(v); }
  }
  $('#modalCancel').addEventListener('click', function () { closeModal(null); });
  $('#modalScrim').addEventListener('click', function (e) { if (e.target === this) closeModal(null); });
  function showConfirm(opts) {
    return new Promise(function (resolve) {
      modalResolve = resolve;
      $('#modalTitle').textContent = opts.title || '请确认';
      $('#modalText').textContent = opts.text || '';
      $('#modalFields').innerHTML = '';
      var ok = $('#modalOk');
      ok.textContent = opts.okText || '确定';
      ok.className = 'modal-btn ' + (opts.danger ? 'danger' : 'primary');
      ok.onclick = function () { closeModal(true); };
      $('#modalScrim').hidden = false;
    });
  }
  function showForm(opts) {
    return new Promise(function (resolve) {
      modalResolve = resolve;
      $('#modalTitle').textContent = opts.title || '填写';
      $('#modalText').textContent = opts.text || '';
      $('#modalFields').innerHTML = (opts.fields || []).map(function (f) {
        return '<div><label>' + esc(f.label) + '</label><input class="f-input" id="mf-' + f.id + '" type="' + (f.type || 'text') + '" value="' + esc(f.value || '') + '" placeholder="' + esc(f.placeholder || '') + '" maxlength="' + (f.maxlength || 120) + '"></div>';
      }).join('');
      var ok = $('#modalOk');
      ok.textContent = opts.okText || '确定';
      ok.className = 'modal-btn primary';
      ok.onclick = function () {
        var out = {};
        (opts.fields || []).forEach(function (f) { var el = document.getElementById('mf-' + f.id); out[f.id] = el ? el.value.trim() : ''; });
        closeModal(out);
      };
      $('#modalScrim').hidden = false;
    });
  }
  function plainTextOf(html) {
    var d = document.createElement('div');
    d.innerHTML = String(html || '');
    return (d.textContent || '').replace(/\s+/g, ' ').trim();
  }
async function clearPaperRecordsApp(qids) {
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

  function texClean(t) {
    // 列表摘要专用：把 LaTeX 源码转成可读纯文本（公式在摘要里不渲染，避免露出 \sum\limits 这类源码）。
    var s = String(t == null ? '' : t);
    var SYM = { alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'θ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ', tau: 'τ', phi: 'φ', varphi: 'φ', omega: 'ω', Delta: 'Δ', Gamma: 'Γ', Theta: 'Θ', Lambda: 'Λ', Sigma: 'Σ', Phi: 'Φ', Omega: 'Ω', infty: '∞', sum: '∑', int: '∫', iint: '∬', prod: '∏', le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠', approx: '≈', sim: '∼', to: '→', rightarrow: '→', leftarrow: '←', Rightarrow: '⇒', Leftrightarrow: '⇔', cdot: '·', times: '×', div: '÷', pm: '±', partial: '∂', in: '∈', notin: '∉', subset: '⊂', cup: '∪', cap: '∩', ldots: '…', cdots: '⋯' };
    s = s.replace(/\\\(|\\\)|\\\[|\\\]/g, ' ');
    s = s.replace(/\\[dt]?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1/$2');
    s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, '√($1)');
    s = s.replace(/\\(varepsilon|vartheta|varphi|alpha|beta|gamma|delta|epsilon|zeta|eta|theta|lambda|mu|nu|xi|pi|rho|sigma|tau|phi|omega|Delta|Gamma|Theta|Lambda|Sigma|Phi|Omega|infty|sum|int|iint|prod|leq|geq|neq|le|ge|ne|approx|sim|to|rightarrow|leftarrow|Rightarrow|Leftrightarrow|cdot|times|div|pm|partial|in|notin|subset|cup|cap|ldots|cdots)\b/g, function (m, k) { return SYM[k] || m; });
    s = s.replace(/\\limits/g, '').replace(/\\left|\\right/g, '').replace(/\\[,;:!]/g, ' ').replace(/\\\\/g, ' ');
    s = s.replace(/\^\{([^{}]*)\}/g, '^($1)').replace(/_\{([^{}]*)\}/g, '_($1)');
    s = s.replace(/\\[a-zA-Z]+/g, '');
    s = s.replace(/[{}]/g, '');
    return s;
  }
  function snippet(text, n) {
    var t = plainTextOf(texClean(text));
    return t.length > n ? t.slice(0, n) + '…' : t;
  }

  /* ---------- 套卷分析（App 内） ---------- */
  subRenderers.analytics = { title: '套卷分析', render: function (body) { renderAnalytics(body); } };
  function paperAttempts() {
    return (state.attempts || []).filter(function (a) { return a.mode === 'paper' || a.mode === 'mock' || a.mode === 'diagnostic'; })
      .slice().sort(function (x, y) { return String(y.createdAt || '') > String(x.createdAt || '') ? 1 : -1; });
  }
  function renderAnalytics(body) {
    var list = paperAttempts();
    var rates = list.map(function (a) { return summarizeAttempt(a).rate; }).filter(function (r) { return r != null; });
    var avg = rates.length ? Math.round(rates.reduce(function (a, b) { return a + b; }, 0) / rates.length * 100) : null;
    var gradedQ = 0;
    list.forEach(function (a) { gradedQ += summarizeAttempt(a).graded; });
    var html = '<div class="card stats-strip">' +
      '<div class="stat"><b>' + list.length + '</b><span>套卷 / 模考</span></div>' +
      '<div class="stat"><b>' + (avg == null ? '--' : avg + '%') + '</b><span>平均得分率</span></div>' +
      '<div class="stat"><b>' + gradedQ + '</b><span>已批改题数</span></div></div>';
    html += '<h2 class="sec-title">目标差距（最近一套折算）</h2><div class="card" id="gapCard"><div class="today-empty">正在加载目标…</div></div>';
    html += '<h2 class="sec-title">成绩明细</h2><div class="card">' + (list.length ? list.map(function (a) {
      var sm = summarizeAttempt(a);
      var rate = sm.rate == null ? '待批改' : Math.round(sm.rate * 100) + '%';
      var cls = sm.rate == null ? 'mid' : sm.rate >= 0.8 ? 'good' : sm.rate >= 0.5 ? 'mid' : 'low';
      return '<div class="recent-row"' + (a.id ? ' data-att="' + esc(a.id) + '"' : '') + '><span class="recent-title">' + esc(attemptTitle(a)) + '</span><span class="recent-rate ' + cls + '">' + rate + '</span><span class="recent-date">' + esc(attemptDate(a)) + '</span></div>';
    }).join('') : '<div class="today-empty">还没有套卷或模考成绩。</div>') + '</div>';
    body.innerHTML = html;
    AtlasUser.load('goals', { targets: {} }).then(function (g) {
      var targets = (g && g.targets) || {};
      var latest = {};
      list.forEach(function (a) { if (!latest[a.subject]) latest[a.subject] = a; });
      var sids = Object.keys(latest);
      var card = document.getElementById('gapCard');
      if (!card) return;
      if (!sids.length) { card.innerHTML = '<div class="today-empty">做完一套卷后，这里会对比你的目标分。</div>'; return; }
      card.innerHTML = sids.map(function (sid) {
        var sm = summarizeAttempt(latest[sid]);
        var full = FULL_SCORES[sid] || 100;
        var est = sm.rate == null ? null : Math.round(sm.rate * full * 10) / 10;
        var tgt = targets[sid];
        var gapTxt = est == null ? '待批改' : (tgt == null || tgt === '' ? '未设目标' : (est >= tgt ? '已达目标 ✓' : '还差 ' + (Math.round((tgt - est) * 10) / 10) + ' 分'));
        return '<div class="gap-row"><div class="gap-head"><b>' + esc(SUBJECT_NAMES[sid] || sid) + '</b><span>最近得分率 ' + (sm.rate == null ? '—' : Math.round(sm.rate * 100) + '%') + ' · 折算 ' + (est == null ? '—' : est) + ' / ' + full + '</span></div>' +
          '<div class="bar-track"><div class="bar-fill" style="width:' + (est == null ? 0 : Math.min(100, Math.round(est / full * 100))) + '%"></div></div>' +
          '<div class="gap-target">目标 <input type="number" min="0" max="' + full + '" value="' + (tgt == null ? '' : esc(tgt)) + '" data-tgt="' + esc(sid) + '"> 分 · ' + esc(gapTxt) + '</div></div>';
      }).join('') + '<p class="view-note">目标分是你的自设目标，修改后自动保存；不是官方复试线。</p>';
      $$('#gapCard [data-tgt]').forEach(function (inp) {
        inp.addEventListener('change', function () {
          var v = inp.value === '' ? null : Number(inp.value);
          if (v == null) delete targets[inp.dataset.tgt]; else targets[inp.dataset.tgt] = v;
          AtlasUser.save('goals', { targets: targets }).then(function () { toast('目标已保存'); renderAnalytics(body); }).catch(function (e) { toast('保存失败：' + e.message); });
        });
      });
    }).catch(function () { var c = document.getElementById('gapCard'); if (c) c.innerHTML = '<div class="today-empty">目标加载失败。</div>'; });
  }

  /* ---------- 做题详情：点最近成绩/成绩明细进入 ---------- */
  var attemptDetailId = '';
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-att]');
    if (!t) return;
    attemptDetailId = t.dataset.att;
    openSub('attemptDetail');
  });
  subRenderers.attemptDetail = { title: '做题详情', render: function (body) { renderAttemptDetail(body); } };
  function attemptFullTime(a) {
    var d = new Date(a.createdAt || a.time || 0);
    if (isNaN(d)) return '';
    return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function cleanText(x) { var t = String(x == null ? '' : x); return window.AtlasPlain ? window.AtlasPlain.clean(t) : t; }
  function renderAttemptDetail(body) {
    var id = attemptDetailId;
    body.innerHTML = '<div class="sub-loading">正在加载详情…</div>';
    var cached = (state.attempts || []).filter(function (x) { return x.id === id; })[0] || null;
    AtlasUser.json('/api/attempts/' + encodeURIComponent(id)).then(function (r) {
      paintAttemptDetail(body, (r && r.attempt) || cached);
    }).catch(function () { paintAttemptDetail(body, cached); });
  }
  function paintAttemptDetail(body, a) {
    if (!a) { body.innerHTML = '<div class="sub-loading">这条成绩找不到了。</div>'; return; }
    var sm = summarizeAttempt(a);
    var qs = a.questions || [];
    var score = 0, max = 0;
    qs.forEach(function (q) {
      var r = (a.results || {})[q.id];
      if (r && r.status === 'graded' && Number(r.maxScore) > 0) { score += Number(r.score); max += Number(r.maxScore); }
    });
    var rate = sm.rate == null ? '待批改' : Math.round(sm.rate * 100) + '%';
    var head = '<div class="card"><div class="row-title">' + esc(attemptTitle(a)) + '</div>' +
      '<div class="row-meta">' + esc(attemptFullTime(a)) + ' · 共 ' + qs.length + ' 题 · 已批改 ' + sm.graded + ' 题</div>' +
      '<div class="qd-score"><b>' + rate + '</b><span>' + (max > 0 ? '得分 ' + (Math.round(score * 10) / 10) + ' / ' + (Math.round(max * 10) / 10) + ' 分' : '等待 AI 批改') + '</span></div>' +
      '<div class="row-actions"><button type="button" class="btn-sub" id="qdAnalysisBtn">AI 教学分析</button></div>' +
      '<div class="qd-analysis" id="qdAnalysis" hidden></div></div>';
    body.innerHTML = head + '<div id="qdList">' + qs.map(function (q, idx) {
      var r = (a.results || {})[q.id];
      var graded = r && r.status === 'graded';
      var chip = graded
        ? '<span class="recent-rate ' + (Number(r.maxScore) > 0 && Number(r.score) >= Number(r.maxScore) ? 'good' : Number(r.score) > 0 ? 'mid' : 'low') + '">' + (Math.round(Number(r.score) * 10) / 10) + ' / ' + (Math.round(Number(r.maxScore) * 10) / 10) + '</span>'
        : '<span class="recent-rate mid">待批改</span>';
      return '<div class="card qd-card"><div class="qd-head" data-qd="' + idx + '"><b>第 ' + (idx + 1) + ' 题</b>' +
        '<span class="qd-kp">' + esc(q.kind || '') + (q.kpName ? ' · ' + esc(q.kpName) : '') + '</span>' + chip + '<span class="qd-arrow">▾</span></div>' +
        '<div class="qd-body" id="qdBody' + idx + '" hidden><div class="sub-loading">加载题目…</div></div></div>';
    }).join('') + '</div>' +
    '<div class="card"><div class="row-title">数据管理</div><p class="view-note">重置后这套卷的作答与批改记录会被删除，套卷分析、错题统计同步更新，可以干净地二刷；按知识点练习的记录不受影响。删除后不能恢复。</p>' +
    '<button type="button" class="btn-sub danger" id="qdReset">重置这套（删除记录）</button></div>';
    var anaBtn = document.getElementById('qdAnalysisBtn');
    if (anaBtn) anaBtn.addEventListener('click', function () {
      var box = document.getElementById('qdAnalysis');
      if (!box) return;
      box.hidden = false;
      box.innerHTML = '<div class="sub-loading">正在生成教学分析…</div>';
      anaBtn.disabled = true;
      var lines = ['科目：' + (SUBJECT_NAMES[a.subject] || a.subject || '') + '，共 ' + qs.length + ' 题，已批改 ' + sm.graded + ' 题，总得分率 ' + rate + '。'];
      qs.forEach(function (q, i) {
        var r = (a.results || {})[q.id] || {};
        lines.push('第' + (i + 1) + '题 考点：' + (q.kpName || q.kp || '未知') + '，题型：' + (q.kind || '') + '，' + (r.status === 'graded' ? ('得分 ' + r.score + '/' + r.maxScore + (r.level ? '，等级 ' + r.level : '') + (r.missing ? '，缺失要点：' + r.missing : '')) : '未批改'));
      });
      AtlasUser.json('/api/coach', 'POST', { context: { source: 'attempt-analysis', attemptId: a.id }, messages: [{ role: 'user', content: lines.join('\n') }] }).then(function (r) {
        box.innerHTML = '<div class="qd-sec"><span>AI 教学分析</span><p>' + esc(cleanText(r.reply || '')) + '</p></div>';
        gMath(box);
      }).catch(function (e) {
        box.innerHTML = '<div class="sub-loading">分析生成失败：' + esc(e.message || '') + '</div>';
      }).then(function () { anaBtn.disabled = false; });
    });
    var resetBtn = document.getElementById('qdReset');
    if (resetBtn) resetBtn.addEventListener('click', function () {
      showConfirm({ title: '重置这套卷', text: '确定删除这套卷的作答与批改记录吗？这套题目的做题记录（做过/错题次数、复盘排期）也会一并清除，可以干净二刷；收藏保留。删除后不能恢复。', okText: '删除重置' }).then(function (yes) {
        if (!yes) return;
        AtlasUser.json('/api/attempts', 'DELETE', { ids: [a.id] }).then(async function () {
          await clearPaperRecordsApp((a.questions || []).map(function (q) { return q.id; }));
          state.attempts = (state.attempts || []).filter(function (x) { return x.id !== a.id; });
          toast('已重置，可以二刷了');
          closeSub();
        }).catch(function (e) { toast('重置失败：' + (e.message || '')); });
      });
    });
    $$('[data-qd]', body).forEach(function (h) {
      h.addEventListener('click', function () {
        var box = document.getElementById('qdBody' + h.dataset.qd);
        if (box) box.hidden = !box.hidden;
      });
    });
    var subjects = [];
    qs.forEach(function (q) { if (q.subject && subjects.indexOf(q.subject) < 0) subjects.push(q.subject); });
    Promise.all(subjects.map(function (sj) { return AtlasQuestions.load(sj).catch(function () {}); })).then(function () {
      var byId = {};
      ((window.QUESTIONS && window.QUESTIONS.items) || []).forEach(function (it) { byId[it.id] = it; });
      qs.forEach(function (q, idx) {
        var box = document.getElementById('qdBody' + idx);
        if (!box) return;
        var r = (a.results || {})[q.id] || {};
        var it = byId[q.id];
        var html = '';
        if (it && it.text) html += '<div class="qd-sec"><span>题干</span><p>' + esc(cleanText(it.text)) + '</p></div>';
        if (it && it.answer) html += '<div class="qd-sec"><span>参考答案</span><p>' + esc(cleanText(it.answer)) + '</p></div>';
        if (it && it.steps && it.steps.length) html += '<div class="qd-sec"><span>解析</span>' + it.steps.map(function (st) { return '<p>' + esc(cleanText(st)) + '</p>'; }).join('') + '</div>';
        if (r.level) html += '<div class="qd-sec"><span>等级</span><p>' + esc(r.level) + '</p></div>';
        if (r.comments) html += '<div class="qd-sec"><span>AI 总评</span><p>' + esc(cleanText(r.comments)) + '</p></div>';
        if (Array.isArray(r.breakdown) && r.breakdown.length) {
          html += '<div class="qd-sec"><span>得分点</span>' + r.breakdown.map(function (b) {
            return '<div class="bd-row"><span>' + esc(b.point || '') + '</span><b>' +
              (b.score == null ? '' : Math.round(Number(b.score) * 10) / 10) + (b.max == null ? '' : ' / ' + Math.round(Number(b.max) * 10) / 10) + '</b></div>' +
              (b.comment ? '<p class="bd-comment">' + esc(cleanText(b.comment)) + '</p>' : '');
          }).join('') + '</div>';
        }
        if (r.dimensions && Object.keys(r.dimensions).length) {
          html += '<div class="qd-sec"><span>维度评分</span><p>' + Object.keys(r.dimensions).map(function (k) {
            var v = r.dimensions[k];
            return esc(k) + ' ' + (typeof v === 'object' ? esc(v.score != null ? v.score : JSON.stringify(v)) : esc(v));
          }).join(' · ') + '</p></div>';
        }
        if (r.missing) html += '<div class="qd-sec"><span>缺失要点</span><p>' + esc(cleanText(r.missing)) + '</p></div>';
        if (r.suggestions) html += '<div class="qd-sec"><span>改进建议</span><p>' + esc(cleanText(r.suggestions)) + '</p></div>';
        if (r.revised) html += '<div class="qd-sec"><span>作文指导 · 修改稿</span><p>' + esc(cleanText(r.revised)) + '</p></div>';
        if (Array.isArray(r.grammar) && r.grammar.length) html += '<div class="qd-sec"><span>作文指导 · 语法与表达</span>' + r.grammar.map(function (g) { return '<p>' + esc(cleanText(typeof g === 'string' ? g : (g.issue || g.text || g.comment || ''))) + '</p>'; }).join('') + '</div>';
        html += '<div class="qd-actions"><button type="button" class="btn-sub" data-mark-fav="' + q.id + '">☆ 收藏</button><button type="button" class="btn-sub" data-mark-wb="' + q.id + '">＋ 加入错题本</button></div>';
        box.innerHTML = html || '<div class="sub-loading">这道题暂无更多详情。</div>';
        if (window.AtlasMarks) window.AtlasMarks.wire(document.getElementById('subBody'));
        if (window.AtlasKatex) AtlasKatex.render(box);
      });
    });
  }

  /* ---------- 每日单词（App 内，规则与网页版一致） ---------- */
  var vState = null, vWords = null, vQueue = [], vIdx = 0;
  subRenderers.vocab = { title: '每日单词', render: function (body) { renderVocabHome(body); } };
  function todayKey() { var t = new Date(); return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); }
  function shuffleArr(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function vocabDueCount() {
    if (!vState) return 0;
    var now = Date.now(), n = 0, rec = vState.rec || {};
    Object.keys(rec).forEach(function (w) { var r = rec[w]; if (r && (r.d || 0) <= now && (r.l || 0) < 5) n++; });
    return n;
  }
  function renderVocabHome(body) {
    Promise.all([
      AtlasUser.load('vocab', { rec: {}, star: {}, days: {} }),
      vWords ? Promise.resolve() : loadScript('assets/vocab-data.js?v=2').then(function () { vWords = (window.VOCAB && window.VOCAB.words) || {}; })
    ]).then(function (res) {
      if (subCurrent !== 'vocab') return;
      vState = res[0] || { rec: {}, star: {}, days: {} };
      if (!vState.rec) vState.rec = {};
      if (!vState.star) vState.star = {};
      if (!vState.days) vState.days = {};
      state.vocabState = vState;
      var rec = vState.rec, keys = Object.keys(rec);
      var mastered = keys.filter(function (w) { return (rec[w].l || 0) >= 5; }).length;
      var quota = vState.dailyNew || 20;
      var log = (vState.dayLog && vState.dayLog[todayKey()]) || { new: 0, review: 0 };
      var dueN = vocabDueCount();
      var newDone = Math.min(log.new || 0, quota);
      var taskDone = dueN === 0 && (log.new || 0) >= quota;
      body.innerHTML =
        '<div class="card"><div style="display:flex;align-items:center;justify-content:space-between;gap:10px">' +
        '<div class="row-title">每日学习任务</div><button type="button" class="btn-sub" id="vocabSetBtn">设置任务量</button></div>' +
        '<div class="row-meta" style="margin-top:6px">新词 ' + (log.new || 0) + ' / ' + quota + ' · 待复习 ' + dueN + ' 词' + (taskDone ? ' · 今日任务已完成 ✓' : '') + '</div>' +
        '<div class="bar-track"><div class="bar-fill" style="width:' + Math.round(newDone / quota * 100) + '%"></div></div>' +
        '<div class="row-meta">复习按遗忘曲线到期自动排入，先复习再学新词。</div></div>' +
        '<div class="card stats-strip">' +
        '<div class="stat"><b>' + dueN + '</b><span>到期复习</span></div>' +
        '<div class="stat"><b>' + (vState.days[todayKey()] || 0) + '</b><span>今日已学</span></div>' +
        '<div class="stat"><b>' + mastered + '</b><span>已掌握</span></div></div>' +
        '<div class="card"><div class="row-title">大纲词汇共 ' + Object.keys(vWords || {}).length + ' 词 · 已学 ' + keys.length + ' · 收藏 ' + Object.keys(vState.star).length + '</div>' +
        '<p class="view-note">点卡片看释义，再按掌握程度选择；进度与网页版实时同步。</p></div>' +
        '<button class="btn-main" id="vocabStart" type="button">' + (taskDone ? '今日任务已完成 · 超额再学一组' : '开始今日任务') + '</button>';
      document.getElementById('vocabStart').addEventListener('click', function () { startVocabSession(body, taskDone); });
      document.getElementById('vocabSetBtn').addEventListener('click', function () { renderVocabSettings(body); });
    }).catch(function (e) {
      body.innerHTML = '<div class="sub-loading">单词加载失败：' + esc(e.message || '') + '</div>';
    });
  }
  function buildVocabQueue(n) {
    var now = Date.now(), rec = vState.rec, due = [], fresh = [], later = [];
    Object.keys(vWords).forEach(function (w) {
      var r = rec[w.toLowerCase()];
      if (r && (r.d || 0) <= now && (r.l || 0) < 5) due.push(w);
      else if (!r) fresh.push(w);
      else later.push(w);
    });
    return shuffleArr(due).concat(shuffleArr(fresh), shuffleArr(later)).slice(0, n);
  }
  function buildTaskQueue() {
    var now = Date.now(), rec = vState.rec, due = [], fresh = [];
    Object.keys(vWords).forEach(function (w) {
      var r = rec[w.toLowerCase()];
      if (r && (r.d || 0) <= now && (r.l || 0) < 5) due.push(w);
      else if (!r) fresh.push(w);
    });
    var quota = vState.dailyNew || 20;
    var log = (vState.dayLog && vState.dayLog[todayKey()]) || { new: 0, review: 0 };
    var newLeft = Math.max(0, quota - (log.new || 0));
    var reviewCap = Math.max(20, quota * 3 + 10);
    return shuffleArr(due).slice(0, reviewCap).concat(shuffleArr(fresh).slice(0, newLeft));
  }
  function startVocabSession(body, extra) {
    vQueue = extra ? buildVocabQueue(20) : buildTaskQueue();
    vIdx = 0;
    if (!vQueue.length) {
      body.innerHTML = '<div class="card" style="text-align:center;padding:28px 18px"><div class="row-title">今日任务已完成</div><p class="view-note" style="text-align:center">到期复习和今日新词都学完了。</p></div>' +
        '<button class="btn-main" id="vocabExtra" type="button">超额再学一组</button>' +
        '<button class="btn-sub" id="vocabBack" type="button" style="width:100%;height:46px;margin-top:10px">回单词首页</button>';
      document.getElementById('vocabExtra').addEventListener('click', function () { startVocabSession(body, true); });
      document.getElementById('vocabBack').addEventListener('click', function () { renderVocabHome(body); });
      return;
    }
    paintVocabCard(body);
  }
  /* 每日任务量设置（扇贝式）：每日新词量 + 按剩余词数算预计完成日期 */
  function renderVocabSettings(body) {
    subBackHook = function () { renderVocabHome(body); return true; };
    var cur = vState.dailyNew || 20;
    var total = Object.keys(vWords || {}).length;
    var learned = Object.keys(vState.rec || {}).length;
    var presets = [10, 20, 30, 50, 80, 100, 150];
    function estimate(n) {
      var left = Math.max(0, total - learned);
      if (!n || n <= 0) return '—';
      var days = Math.ceil(left / n);
      var d = new Date(); d.setDate(d.getDate() + days);
      return '剩余 ' + left + ' 词 · 约 ' + days + ' 天学完 · 预计 ' + d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
    }
    body.innerHTML =
      '<div class="card"><div class="row-title">每日新词量</div>' +
      '<p class="view-note">复习词按遗忘曲线到期自动排入（通常约为新词的 2–3 倍），不占新词额度。</p>' +
      '<div class="filter-chips" style="padding-top:6px">' + presets.map(function (n) {
        return '<button type="button" class="f-chip' + (n === cur ? ' on' : '') + '" data-vq="' + n + '">' + n + ' 词/天</button>';
      }).join('') + '</div>' +
      '<label class="f-label">自定义（词/天）</label><input class="f-input" id="vqCustom" type="number" min="1" max="500" value="' + cur + '">' +
      '<div class="row-meta" id="vqEstimate" style="margin-top:10px">' + esc(estimate(cur)) + '</div></div>' +
      '<button class="btn-main" id="vqSave" type="button">保存任务量</button>';
    var picked = cur;
    function paintEst() { document.getElementById('vqEstimate').textContent = estimate(picked); }
    $$('[data-vq]', body).forEach(function (b) {
      b.addEventListener('click', function () {
        picked = Number(b.dataset.vq);
        document.getElementById('vqCustom').value = picked;
        $$('[data-vq]', body).forEach(function (x) { x.classList.toggle('on', Number(x.dataset.vq) === picked); });
        paintEst();
      });
    });
    document.getElementById('vqCustom').addEventListener('input', function () {
      picked = Number(this.value) || 0;
      $$('[data-vq]', body).forEach(function (x) { x.classList.toggle('on', Number(x.dataset.vq) === picked); });
      paintEst();
    });
    document.getElementById('vqSave').addEventListener('click', function () {
      if (!picked || picked < 1) { toast('请填写有效的每日新词量'); return; }
      vState.dailyNew = picked;
      AtlasUser.save('vocab', vState).then(function () { toast('任务量已保存'); renderVocabHome(body); })
        .catch(function (e) { toast('保存失败：' + e.message); });
    });
  }
  function paintVocabCard(body) {
    if (vIdx >= vQueue.length) {
      body.innerHTML = '<div class="card" style="text-align:center;padding:28px 18px"><div class="row-title">这一组完成了</div><p class="view-note" style="text-align:center">共学了 ' + vQueue.length + ' 个词，进度已同步。</p></div>' +
        '<button class="btn-main" id="vocabAgain" type="button">再来一组</button>' +
        '<button class="btn-sub" id="vocabDone" type="button" style="width:100%;height:46px;margin-top:10px">回单词首页</button>';
      document.getElementById('vocabAgain').addEventListener('click', function () { startVocabSession(body, true); });
      document.getElementById('vocabDone').addEventListener('click', function () { renderVocabHome(body); });
      return;
    }
    var w = vQueue[vIdx], entry = vWords[w] || {};
    var starred = !!vState.star[w.toLowerCase()];
    body.innerHTML =
      '<p class="view-note" style="margin:0 0 10px">第 ' + (vIdx + 1) + ' / ' + vQueue.length + ' 个</p>' +
      '<div class="bar-track" style="margin:0 0 14px"><div class="bar-fill" style="width:' + Math.round(vIdx / vQueue.length * 100) + '%"></div></div>' +
      '<div class="flash-card" id="flashCard">' +
        '<button class="flash-star' + (starred ? ' on' : '') + '" id="flashStar" type="button">' + (starred ? '★' : '☆') + '</button>' +
        '<div class="flash-word">' + esc(entry.w || w) + '</div>' +
        '<div class="flash-meaning" id="flashMeaning" hidden>' + esc(entry.m || '') + '</div>' +
        '<div class="flash-hint" id="flashHint">点卡片显示释义</div>' +
      '</div>' +
      '<div class="grade-btns">' +
        '<button class="grade-btn bad" data-grade="unknown" type="button">不认识</button>' +
        '<button class="grade-btn mid" data-grade="fuzzy" type="button">模糊</button>' +
        '<button class="grade-btn good" data-grade="known" type="button">认识</button>' +
      '</div>';
    document.getElementById('flashCard').addEventListener('click', function (e) {
      if (e.target.id === 'flashStar') return;
      var m = document.getElementById('flashMeaning'), h = document.getElementById('flashHint');
      if (m) m.hidden = false;
      if (h) h.hidden = true;
    });
    document.getElementById('flashStar').addEventListener('click', function () {
      var k = w.toLowerCase();
      if (vState.star[k]) delete vState.star[k]; else vState.star[k] = 1;
      AtlasUser.save('vocab', vState).catch(function () {});
      paintVocabCard(body);
    });
    $$('.grade-btn', body).forEach(function (b) {
      b.addEventListener('click', function () { gradeVocab(w, b.dataset.grade); vIdx++; paintVocabCard(body); });
    });
  }
  function gradeVocab(word, level) {
    var k = word.toLowerCase();
    var isNew = !vState.rec[k];
    var r = vState.rec[k] || { l: 0, d: 0, seen: 0, ok: 0, w: 0 };
    r.seen = (r.seen || 0) + 1;
    if (level === 'known') { r.ok = (r.ok || 0) + 1; r.l = Math.min(5, (r.l || 0) + 1); }
    else if (level === 'fuzzy') { r.l = Math.max(1, r.l || 0); }
    else { r.l = 0; r.w = (r.w || 0) + 1; }
    var days = [0, 1, 2, 4, 7, 15][r.l] || 15;
    r.d = Date.now() + days * 86400000;
    vState.rec[k] = r;
    vState.days[todayKey()] = (vState.days[todayKey()] || 0) + 1;
    if (!vState.dayLog) vState.dayLog = {};
    var dl = vState.dayLog[todayKey()] || { new: 0, review: 0 };
    if (isNew) dl.new += 1; else dl.review += 1;
    vState.dayLog[todayKey()] = dl;
    state.vocabState = vState;
    AtlasUser.save('vocab', vState).catch(function (e) { toast('同步失败：' + e.message); });
  }

  /* ---------- 错题本（App 内） ---------- */
  var wbCache = null;
  subRenderers.wrongbook = { title: '错题本', render: function (body) { renderWrongbook(body, 'all'); } };
  function renderWrongbook(body, filter) {
    var marksP = window.AtlasMarks ? window.AtlasMarks.load() : Promise.resolve({ fav: {}, wb: {} });
    var load = wbCache ? Promise.resolve(wbCache) : Promise.all([
      AtlasQuestions.load('all'),
      AtlasUser.json('/api/personal/questions').catch(function () { return { questions: [] }; }),
      AtlasUser.load('practice', { rec: {} }),
      marksP
    ]).then(function (res) {
      var map = {};
      (window.QUESTIONS.items || []).forEach(function (q) { map[q.id] = q; });
      ((res[1] && res[1].questions) || []).forEach(function (q) { if (q && q.id) map[q.id] = q; });
      state.practiceRec = (res[2] && res[2].rec) || state.practiceRec || {};
      wbCache = { map: map, marks: res[3] || { fav: {}, wb: {} } };
      return wbCache;
    });
    body.innerHTML = '<div class="sub-loading">正在整理错题…</div>';
    load.then(function (data) {
      if (subCurrent !== 'wrongbook') return;
      var rows = Object.keys(state.practiceRec).filter(function (id) {
        var r = state.practiceRec[id]; return r && r.wrong > 0 && data.map[id];
      }).map(function (id) { return { q: data.map[id], r: state.practiceRec[id] }; });
      Object.keys((data.marks && data.marks.wb) || {}).forEach(function (id) {
        if (data.map[id] && !rows.some(function (x) { return x.q.id === id; })) {
          rows.push({ q: data.map[id], r: { wrong: 0, seen: 0, manual: true, last: data.marks.wb[id] } });
        }
      });
      rows.sort(function (a, b) { return (b.r.wrong - a.r.wrong) || ((b.r.last || 0) - (a.r.last || 0)); });
      var favRows = Object.keys((data.marks && data.marks.fav) || {}).filter(function (id) { return data.map[id]; })
        .map(function (id) { return data.map[id]; });
      var subjects = [];
      rows.forEach(function (x) { if (subjects.indexOf(x.q.subject) < 0) subjects.push(x.q.subject); });
      var shown = filter === 'all' ? rows : rows.filter(function (x) { return x.q.subject === filter; });
      var chips = '<div class="filter-chips"><button type="button" class="f-chip' + (filter === 'all' ? ' on' : '') + '" data-wf="all">全部 ' + rows.length + '</button>' +
        subjects.map(function (sid) {
          var n = rows.filter(function (x) { return x.q.subject === sid; }).length;
          return '<button type="button" class="f-chip' + (filter === sid ? ' on' : '') + '" data-wf="' + esc(sid) + '">' + esc(SUBJECT_NAMES[sid] || sid) + ' ' + n + '</button>';
        }).join('') + '</div>';
      body.innerHTML = chips +
        '<a class="btn-main" href="practice.html?review=1" style="margin-bottom:10px">开始今日复盘（到期错题）</a>' +
        '<a class="btn-main" href="practice.html?wrongbook=1" style="margin-bottom:10px">刷错题本（全部重练）</a>' +
        '<a class="btn-sub" href="wrongbook.html" style="display:block;text-align:center;margin-bottom:12px">错题本打印版（可存 PDF）</a>' +
        '<div class="card">' + (shown.length ? shown.map(function (x, i) {
          var q = x.q;
          return '<div class="list-row"><div class="row-title">' + esc(snippet(q.text, 110)) + '</div>' +
            '<div class="row-meta">' + esc(SUBJECT_NAMES[q.subject] || q.subject || '') + (q.kpName ? ' · ' + esc(q.kpName) : '') + (x.r.manual ? ' · 手动加入错题本' : ' · 错 ' + x.r.wrong + ' 次 · 做过 ' + (x.r.seen || 0) + ' 次') + '</div>' +
            '<div class="row-actions"><button type="button" class="btn-sub" data-wrong-toggle="' + i + '">看答案与解析</button></div>' +
            '<div class="wrong-detail" id="wd-' + i + '" hidden><b>参考答案：</b>' + esc(q.answer || '暂无') +
            ((q.steps && q.steps.length) ? '<ol>' + q.steps.map(function (st) { return '<li>' + esc(st) + '</li>'; }).join('') + '</ol>' : '') + '</div></div>';
        }).join('') : '<div class="today-empty">这个分类下暂无错题。</div>') + '</div>';
      $$('[data-wf]', body).forEach(function (b) { b.addEventListener('click', function () { renderWrongbook(body, b.dataset.wf); }); });
      $$('[data-wrong-toggle]', body).forEach(function (b) {
        b.addEventListener('click', function () {
          var d = document.getElementById('wd-' + b.dataset.wrongToggle);
          if (d) { d.hidden = !d.hidden; if (!d.hidden) gMath(d); }
        });
      });
      if (favRows.length) {
        var favCard = document.createElement('div');
        favCard.className = 'card';
        favCard.style.marginTop = '12px';
        favCard.innerHTML = '<div class="row-title" style="margin-bottom:8px">我的收藏 · ' + favRows.length + ' 题</div>' + favRows.map(function (q, i) {
          return '<div class="list-row"><div class="row-title">' + esc(snippet(q.text, 110)) + '</div>' +
            '<div class="row-meta">' + esc(SUBJECT_NAMES[q.subject] || q.subject || '') + (q.kpName ? ' · ' + esc(q.kpName) : '') + '</div>' +
            '<div class="row-actions"><button type="button" class="btn-sub" data-fav-toggle="' + i + '">看答案与解析</button> <button type="button" class="btn-sub" data-mark-fav="' + q.id + '">★ 已收藏</button></div>' +
            '<div class="wrong-detail" id="fd-' + i + '" hidden><b>参考答案：</b>' + esc(q.answer || '暂无') +
            ((q.steps && q.steps.length) ? '<ol>' + q.steps.map(function (st) { return '<li>' + esc(st) + '</li>'; }).join('') + '</ol>' : '') + '</div></div>';
        }).join('');
        body.appendChild(favCard);
        $$('[data-fav-toggle]', favCard).forEach(function (b) {
          b.addEventListener('click', function () {
            var d = document.getElementById('fd-' + b.dataset.favToggle);
            if (d) { d.hidden = !d.hidden; if (!d.hidden) gMath(d); }
          });
        });
        if (window.AtlasMarks) window.AtlasMarks.wire(favCard);
      }
    }).catch(function (e) { body.innerHTML = '<div class="sub-loading">错题加载失败：' + esc(e.message || '') + '</div>'; });
  }


  /* ---------- 资料库（App 内） ---------- */
  subRenderers.library = { title: '资料库', render: function (body) { renderLibrary(body); } };
  function subjectLabelOf(sid, customs) {
    if (SUBJECT_NAMES[sid]) return SUBJECT_NAMES[sid];
    var c = (customs || []).filter(function (x) { return x.id === sid; })[0];
    return c ? c.name : (sid || '未分类');
  }
  function renderLibrary(body) {
    body.innerHTML = '<div class="sub-loading">正在加载资料库…</div>';
    Promise.all([
      AtlasUser.json('/api/library'),
      AtlasUser.json('/api/personal/questions').catch(function () { return { questions: [] }; }),
      AtlasUser.json('/api/subjects').catch(function () { return { subjects: [] }; })
    ]).then(function (res) {
      if (subCurrent !== 'library') return;
      var files = (res[0] && res[0].files) || [];
      var questions = (res[1] && res[1].questions) || [];
      var customs = (res[2] && res[2].subjects) || [];
      var opts = SUBJECT_ORDER.map(function (sid) { return '<option value="' + sid + '">' + SUBJECT_NAMES[sid] + '</option>'; }).join('') +
        customs.map(function (c) { return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>'; }).join('');
      var html = '<div class="card"><div class="row-title">上传资料</div>' +
        '<label class="f-label">选择文件（PDF / 图片 / 文本，≤20 MiB）</label>' +
        '<input class="f-input" type="file" id="libFile">' +
        '<label class="f-label">科目</label><select class="f-select" id="libSubject">' + opts + '</select>' +
        '<button class="btn-sub" id="libAddSubject" type="button" style="margin-top:8px">＋ 新增科目</button>' +
        '<label class="f-label">分类（可选，如「真题」「讲义」）</label><input class="f-input" id="libCat" maxlength="30" placeholder="可不填">' +
        '<button class="btn-main" id="libUpload" type="button" style="margin-top:14px">上传</button>' +
        '<p class="view-note">上传后可在网页版资料库对文件抽题导入个人题库；抽出的题目会自动出现在刷题里。</p></div>';
      html += '<h2 class="sec-title">我的资料（' + files.length + '）</h2><div class="card">' + (files.length ? files.map(function (f) {
        var meta = [subjectLabelOf(f.subject, customs), f.category || '', (f.size / 1048576).toFixed(2) + ' MiB', f.status || ''].filter(Boolean).join(' · ');
        return '<div class="list-row"><div class="row-title">' + esc(f.name) + '</div><div class="row-meta">' + esc(meta) + '</div>' +
          '<div class="row-actions"><a class="btn-sub" href="/api/library/' + encodeURIComponent(f.id) + '" target="_blank" rel="noopener">查看原文件</a>' +
          '<a class="btn-sub" href="library.html">抽题导入</a>' +
          '<button type="button" class="btn-sub danger" data-lib-del="' + esc(f.id) + '" data-lib-name="' + esc(f.name) + '">删除</button></div></div>';
      }).join('') : '<div class="today-empty">还没有资料，上传第一份吧。</div>') + '</div>';
      html += '<h2 class="sec-title">个人题库（' + questions.length + ' 道）</h2><div class="card">' + (questions.length ? questions.slice(0, 60).map(function (q) {
        return '<div class="list-row"><div class="row-title" style="font-weight:500">' + esc(snippet(q.text, 90)) + '</div>' +
          '<div class="row-meta">' + esc(subjectLabelOf(q.subject, customs)) + (q.kpName ? ' · ' + esc(q.kpName) : '') + '</div>' +
          '<div class="row-actions"><button type="button" class="btn-sub danger" data-q-del="' + esc(q.draftId || String(q.id || '').replace(/^personal-/, '')) + '">删除这道题</button></div></div>';
      }).join('') + (questions.length > 60 ? '<p class="view-note">仅显示前 60 道，全部题目在刷题时可用。</p>' : '') : '<div class="today-empty">个人题库还是空的，抽题导入后会出现在这里。</div>') + '</div>';
      body.innerHTML = html;
      document.getElementById('libAddSubject').addEventListener('click', function () {
        showForm({ title: '新增科目', okText: '添加', fields: [
          { id: 'name', label: '科目名称（1–30 字）', value: '', placeholder: '如：材料科学基础、808 自命题', maxlength: 30 }
        ] }).then(function (v) {
          if (!v || !v.name) return;
          AtlasUser.json('/api/subjects', 'POST', { name: v.name }).then(function (r) {
            if (r && r.subject) {
              var sel = document.getElementById('libSubject');
              var o = document.createElement('option');
              o.value = r.subject.id; o.textContent = r.subject.name;
              sel.appendChild(o); sel.value = r.subject.id;
              customs.push(r.subject);
              toast('已添加并选中「' + r.subject.name + '」');
            }
          }).catch(function (e) { toast('添加失败：' + e.message); });
        });
      });
      document.getElementById('libUpload').addEventListener('click', function () {
        var fi = document.getElementById('libFile');
        var file = fi.files && fi.files[0];
        if (!file) { toast('先选择一个文件'); return; }
        if (file.size > 20 * 1024 * 1024) { toast('这个文件有 ' + (file.size / 1048576).toFixed(1) + ' MiB，超过 20 MiB 上限，请压缩或拆分后再传'); return; }
        var btn = this;
        btn.disabled = true; btn.textContent = '上传中…';
        var fd = new FormData();
        fd.append('file', file);
        fd.append('subject', document.getElementById('libSubject').value);
        fd.append('category', document.getElementById('libCat').value.trim());
        fetch('/api/library', { method: 'POST', credentials: 'include', body: fd }).then(function (r) { return r.json(); }).then(function (j) {
          if (!j || j.ok === false) throw new Error((j && j.error) || '上传失败');
          toast('上传完成');
          renderLibrary(body);
        }).catch(function (e) { toast(e instanceof TypeError ? '上传中断，没有连上服务器：换个稳定的网络重试，扫描版 PDF 较大时先压到 10 MiB 以内' : '上传失败：' + e.message); btn.disabled = false; btn.textContent = '上传'; });
      });
      $$('[data-lib-del]', body).forEach(function (b) {
        b.addEventListener('click', function () {
          showConfirm({ title: '删除资料？', text: '删除「' + b.dataset.libName + '」？它抽出的草稿和已导入的题目会一并删除，无法恢复。', okText: '删除', danger: true }).then(function (ok) {
            if (!ok) return;
            AtlasUser.json('/api/library/' + encodeURIComponent(b.dataset.libDel), 'DELETE').then(function (out) {
              toast('已删除' + (out && out.questions ? '，连同 ' + out.questions + ' 道已导入题目' : ''));
              wbCache = null;
              renderLibrary(body);
            }).catch(function (e) { toast('删除失败：' + e.message); });
          });
        });
      });
      $$('[data-q-del]', body).forEach(function (b) {
        b.addEventListener('click', function () {
          showConfirm({ title: '删除这道题？', text: '把这道题从个人题库删除？', okText: '删除', danger: true }).then(function (ok) {
            if (!ok) return;
            AtlasUser.json('/api/personal/questions', 'DELETE', { draftId: b.dataset.qDel }).then(function () {
              toast('已从个人题库删除');
              wbCache = null;
              renderLibrary(body);
            }).catch(function (e) { toast('删除失败：' + e.message); });
          });
        });
      });
    }).catch(function (e) { body.innerHTML = '<div class="sub-loading">资料库加载失败：' + esc(e.message || '') + '</div>'; });
  }

  /* ---------- 社区（App 内） ---------- */
  var cmState = { shares: [], myFiles: [], q: '', subject: '', posts: [], openPost: '', postComments: {}, replyTo: null, postSubject: '' };
  subRenderers.community = { title: '社区', render: function (body) { renderCommunity(body); } };
  subRenderers.inbox = { title: '消息通知', render: function (body) { renderInbox(body); } };
  function refreshInboxBadge() {
    var badge = document.getElementById('inboxBadge');
    if (!badge || !window.AtlasGradeBg) return;
    window.AtlasGradeBg.inbox().then(function (list) {
      var n = list.filter(function (m) { return !m.read; }).length;
      badge.hidden = !n;
      badge.textContent = n > 99 ? '99+' : String(n);
    }).catch(function () {});
  }
  function renderInbox(body) {
    body.innerHTML = '<div class="sub-loading">正在加载消息…</div>';
    if (!window.AtlasGradeBg) { body.innerHTML = '<div class="sub-loading">消息功能不可用。</div>'; return; }
    window.AtlasGradeBg.inbox().then(function (list) {
      if (subCurrent !== 'inbox') return;
      body.innerHTML = list.length ? list.map(function (m) {
        return '<div class="card"><div class="row-title">' + (m.kind === 'grade' ? '批改完成' : '消息') + (m.read ? '' : ' <span class="inbox-dot">新</span>') + '</div>' +
          '<div class="row-meta">' + esc(m.title || '') + ' · ' + esc(window.AtlasGradeBg.relTime(m.at || Date.now())) + '</div>' +
          (m.attemptId ? '<div class="row-actions"><button type="button" class="btn-sub" data-inbox-open="' + esc(m.attemptId) + '">看这套的解析</button></div>' : '') + '</div>';
      }).join('') : '<div class="card"><div class="today-empty">还没有消息。交卷后批改完成会在这里提醒你。</div></div>';
      $$('[data-inbox-open]', body).forEach(function (b) {
        b.addEventListener('click', function () { attemptDetailId = b.dataset.inboxOpen; openSub('attemptDetail'); });
      });
      window.AtlasGradeBg.markAllRead().then(function () { refreshInboxBadge(); });
    }).catch(function () { body.innerHTML = '<div class="sub-loading">消息加载失败。</div>'; });
  }
  function cmApi(method, bodyObj, query) { return AtlasUser.json('/api/community' + (query || ''), method, bodyObj); }
  function cmAvatar(uid, at, name, size) {
    if (at) return '<img class="cm-avatar" src="/api/profile/avatar?uid=' + encodeURIComponent(uid) + '&v=' + at + '" style="width:' + size + 'px;height:' + size + 'px" alt="">';
    return '<span class="cm-avatar cm-avatar-fb" style="width:' + size + 'px;height:' + size + 'px;font-size:' + Math.round(size * 0.42) + 'px">' + esc(String(name || '同').slice(0, 1)) + '</span>';
  }
  function cmDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return isNaN(d) ? '' : d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function cmCardHtml(x) {
    var meta = [SUBJECT_NAMES[x.subject] || x.subject || '', x.questions ? x.questions + ' 道题' : '暂无题目', '已被导入 ' + (x.imports || 0) + ' 次', cmDate(x.createdAt)].filter(Boolean).join(' · ');
    var side = x.mine ? '<span class="tag-chip">我的分享</span>' : (x.imported ? '<span class="tag-chip">已导入</span>' : '<button type="button" class="btn-sub" data-cm-import="' + esc(x.id) + '">导入到我的账号</button>');
    return '<article class="cm-card" data-cm-card="' + esc(x.id) + '">' +
      '<div class="cm-head">' + cmAvatar(x.ownerUid, x.ownerAvatarAt, x.owner, 36) +
      '<div class="cm-owner"><b>' + esc(x.owner || '同学') + '</b>' + (x.ownerMotto ? '<span>「' + esc(x.ownerMotto) + '」</span>' : '') + '</div>' +
      '<div>' + side + '</div></div>' +
      '<h3 class="cm-title">' + esc(x.title || '') + '</h3>' +
      (x.note ? '<p class="cm-note">' + esc(x.note) + '</p>' : '') +
      '<div class="row-meta">' + esc(meta) + '</div>' +
      '<div class="cm-actions">' +
      '<button type="button" class="cm-act' + (x.liked ? ' on' : '') + '" data-cm-like="' + esc(x.id) + '">' + (x.liked ? '♥' : '♡') + ' <span>' + (x.likeCount || 0) + '</span></button>' +
      '<button type="button" class="cm-act" data-cm-comments="' + esc(x.id) + '">评论 <span>' + (x.commentCount || 0) + '</span></button>' +
      '</div>' +
      '<div class="cm-comments" data-cm-zone="' + esc(x.id) + '" hidden>' +
      '<div data-cm-list><p class="row-meta">正在加载评论…</p></div>' +
      '<form class="cm-form" data-cm-form="' + esc(x.id) + '"><input maxlength="300" placeholder="写一句鼓励或提问…" autocomplete="off"><button class="btn-sub" type="submit">发送</button></form>' +
      '</div></article>';
  }
  function fmtRel(iso) {
    var t = new Date(iso).getTime();
    if (isNaN(t)) return '';
    var d = Date.now() - t;
    if (d < 60000) return '刚刚';
    if (d < 3600000) return Math.floor(d / 60000) + ' 分钟前';
    if (d < 86400000) return Math.floor(d / 3600000) + ' 小时前';
    if (d < 604800000) return Math.floor(d / 86400000) + ' 天前';
    var dt = new Date(t);
    return (dt.getMonth() + 1) + '月' + dt.getDate() + '日';
  }
  function avatarHtml2(uid, avatarAt, name) {
    if (avatarAt) return '<img class="post-ava" src="/api/profile/avatar?uid=' + encodeURIComponent(uid) + '" alt="">';
    return '<span class="post-ava post-ava-txt">' + esc(String(name || '同').slice(0, 1)) + '</span>';
  }
  function cmPostHtml(p) {
    var open = cmState.openPost === p.id;
    var comments = cmState.postComments[p.id];
    return '<div class="card post-card"><div class="post-head">' + avatarHtml2(p.authorUid, p.authorAvatarAt, p.author) +
      '<div class="post-who"><b>' + esc(p.author) + '</b><span>' + esc(fmtRel(p.createdAt)) + (p.subject ? ' · ' + esc(SUBJECT_NAMES[p.subject] || p.subject) : '') + '</span></div>' +
      (p.mine ? '<button type="button" class="btn-sub danger" data-post-del="' + esc(p.id) + '">删除</button>' : '') + '</div>' +
      '<p class="post-text">' + esc(p.text) + '</p>' +
      '<div class="post-actions">' +
      '<button type="button" class="post-act' + (p.liked ? ' on' : '') + '" data-post-like="' + esc(p.id) + '">' + (p.liked ? '♥' : '♡') + ' ' + (p.likeCount || 0) + '</button>' +
      '<button type="button" class="post-act" data-post-toggle="' + esc(p.id) + '">评论 ' + (p.commentCount || 0) + '</button></div>' +
      (open ? '<div class="post-comments">' +
        (comments == null ? '<div class="sub-loading">加载评论…</div>' : (comments.length ? comments.map(function (c) { return cmCommentHtml(p, c); }).join('') : '<div class="today-empty">还没有评论。</div>')) +
        (cmState.replyTo && cmState.replyTo.postId === p.id ? '<div class="reply-hint">回复 @' + esc(cmState.replyTo.author) + ' <button type="button" data-reply-cancel>取消</button></div>' : '') +
        '<div class="comment-row"><input class="f-input" data-post-input="' + esc(p.id) + '" maxlength="300" placeholder="' + (cmState.replyTo && cmState.replyTo.postId === p.id ? '写下你的回复…' : '写评论…') + '"><button type="button" class="btn-sub" data-post-send="' + esc(p.id) + '">发送</button></div>' +
        '</div>' : '') +
      '</div>';
  }
  function cmCommentHtml(p, c) {
    return '<div class="pcomment"><div class="pcomment-main"><b>' + esc(c.author) + '</b>' +
      (c.parentAuthor ? '<span class="pcomment-re">回复 @' + esc(c.parentAuthor) + '</span>' : '') +
      '<span class="pcomment-time">' + esc(fmtRel(c.createdAt)) + '</span></div>' +
      '<p>' + esc(c.text) + '</p>' +
      '<div class="pcomment-acts"><button type="button" data-reply="' + esc(p.id) + '|' + esc(c.id) + '|' + esc(c.author) + '">回复</button>' +
      (c.mine ? '<button type="button" data-pcomment-del="' + esc(p.id) + '|' + esc(c.id) + '">删除</button>' : '') + '</div></div>';
  }
  function repaintFeed(body) {
    var feed = document.getElementById('cmFeed');
    if (feed) feed.innerHTML = cmState.posts.length ? cmState.posts.map(cmPostHtml).join('') : '<div class="card"><div class="today-empty">还没有动态，来发第一条吧。</div></div>';
    wireFeedCards(body);
  }
  function loadPostComments(body, postId) {
    cmApi('GET', null, '?postComments=' + encodeURIComponent(postId)).then(function (d) {
      cmState.postComments[postId] = (d && d.comments) || [];
      if (cmState.openPost === postId) repaintFeed(body);
    }).catch(function () { cmState.postComments[postId] = []; if (cmState.openPost === postId) repaintFeed(body); });
  }
  function wireFeed(body) {
    $$('[data-cm-psubject]', body).forEach(function (b) { b.addEventListener('click', function () { cmState.postSubject = b.dataset.cmPsubject; paintCommunity(body); }); });
    var btn = document.getElementById('cmPostBtn');
    if (btn) btn.addEventListener('click', function () {
      var ta = document.getElementById('cmPostText');
      var text = (ta.value || '').trim();
      if (!text) { toast('先写点内容吧'); return; }
      btn.disabled = true;
      cmApi('POST', { action: 'post', text: text, subject: cmState.postSubject }).then(function (r) {
        if (r && r.post) cmState.posts.unshift(r.post);
        toast('已发布');
        paintCommunity(body);
      }).catch(function (e) { toast('发布失败：' + (e.message || '')); btn.disabled = false; });
    });
    wireFeedCards(body);
  }
  function wireFeedCards(body) {
    $$('[data-post-like]', body).forEach(function (b) { b.addEventListener('click', function () {
      var id = b.dataset.postLike;
      cmApi('POST', { action: 'postLike', id: id }).then(function (r) {
        var p = cmState.posts.filter(function (x) { return x.id === id; })[0];
        if (p && r) { p.liked = r.liked; p.likeCount = r.likeCount; }
        repaintFeed(body);
      }).catch(function (e) { toast(e.message || '操作失败'); });
    }); });
    $$('[data-post-toggle]', body).forEach(function (b) { b.addEventListener('click', function () {
      var id = b.dataset.postToggle;
      if (cmState.openPost === id) { cmState.openPost = ''; cmState.replyTo = null; repaintFeed(body); return; }
      cmState.openPost = id; cmState.replyTo = null;
      repaintFeed(body);
      if (cmState.postComments[id] == null) loadPostComments(body, id);
    }); });
    $$('[data-post-del]', body).forEach(function (b) { b.addEventListener('click', function () {
      var id = b.dataset.postDel;
      showConfirm({ title: '删除动态', text: '这条动态和它的评论、点赞会一并删除，确定吗？', okText: '删除' }).then(function (yes) {
        if (!yes) return;
        cmApi('POST', { action: 'postDelete', id: id }).then(function () {
          cmState.posts = cmState.posts.filter(function (x) { return x.id !== id; });
          toast('已删除'); repaintFeed(body);
        }).catch(function (e) { toast(e.message || '删除失败'); });
      });
    }); });
    $$('[data-reply]', body).forEach(function (b) { b.addEventListener('click', function () {
      var parts = b.dataset.reply.split('|');
      cmState.replyTo = { postId: parts[0], commentId: parts[1], author: parts[2] };
      repaintFeed(body);
      var inp = document.querySelector('[data-post-input="' + parts[0] + '"]');
      if (inp) inp.focus();
    }); });
    var cancel = body.querySelector('[data-reply-cancel]');
    if (cancel) cancel.addEventListener('click', function () { cmState.replyTo = null; repaintFeed(body); });
    $$('[data-pcomment-del]', body).forEach(function (b) { b.addEventListener('click', function () {
      var parts = b.dataset.pcommentDel.split('|');
      cmApi('POST', { action: 'postUncomment', commentId: parts[1] }).then(function () {
        var list = cmState.postComments[parts[0]] || [];
        cmState.postComments[parts[0]] = list.filter(function (c) { return c.id !== parts[1]; });
        var p = cmState.posts.filter(function (x) { return x.id === parts[0]; })[0];
        if (p) p.commentCount = Math.max(0, (p.commentCount || 1) - 1);
        repaintFeed(body);
      }).catch(function (e) { toast(e.message || '删除失败'); });
    }); });
    $$('[data-post-send]', body).forEach(function (b) { b.addEventListener('click', function () {
      var id = b.dataset.postSend;
      var inp = document.querySelector('[data-post-input="' + id + '"]');
      var text = inp ? inp.value.trim() : '';
      if (!text) return;
      var parentId = cmState.replyTo && cmState.replyTo.postId === id ? cmState.replyTo.commentId : '';
      var parentAuthor = cmState.replyTo && cmState.replyTo.postId === id ? cmState.replyTo.author : '';
      cmApi('POST', { action: 'postComment', id: id, text: text, parentId: parentId }).then(function (r) {
        if (r && r.comment) {
          r.comment.parentAuthor = parentAuthor;
          (cmState.postComments[id] = cmState.postComments[id] || []).push(r.comment);
          var p = cmState.posts.filter(function (x) { return x.id === id; })[0];
          if (p) p.commentCount = (p.commentCount || 0) + 1;
        }
        cmState.replyTo = null;
        repaintFeed(body);
      }).catch(function (e) { toast(e.message || '评论失败'); });
    }); });
  }

  function renderCommunity(body) {
    body.innerHTML = '<div class="sub-loading">正在加载社区…</div>';
    cmApi('GET').then(function (data) {
      if (subCurrent !== 'community') return;
      cmState.shares = data.shares || [];
      cmState.myFiles = data.myFiles || [];
      return cmApi('GET', null, '?feed=1').then(function (fd) { cmState.posts = (fd && fd.posts) || []; }).catch(function () { cmState.posts = []; });
    }).then(function () {
      if (subCurrent === 'community') paintCommunity(body);
    }).catch(function (e) { body.innerHTML = '<div class="sub-loading">社区加载失败：' + esc(e.message || '') + '</div>'; });
  }
  function paintCommunity(body) {
    var q = cmState.q.toLowerCase();
    var list = cmState.shares.filter(function (x) {
      if (cmState.subject && (x.subject || '') !== cmState.subject) return false;
      if (q && (x.title + ' ' + (x.note || '') + ' ' + (x.owner || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    var subjChips = [''].concat(SUBJECT_ORDER.filter(function (sid) { return cmState.shares.some(function (x) { return x.subject === sid; }); }));
    body.innerHTML =
      '<div class="card post-composer"><textarea class="f-input post-input" id="cmPostText" rows="3" maxlength="500" placeholder="说点什么：备考心得、问题、资料情报……"></textarea>' +
      '<div class="filter-chips" style="margin-top:8px">' + [''].concat(SUBJECT_ORDER).map(function (sid) {
        return '<button type="button" class="f-chip' + (cmState.postSubject === sid ? ' on' : '') + '" data-cm-psubject="' + esc(sid) + '">' + (sid ? (SUBJECT_NAMES[sid] || sid) : '不限科目') + '</button>';
      }).join('') + '</div>' +
      '<button class="btn-main" id="cmPostBtn" type="button">发布动态</button></div>' +
      '<div id="cmFeed">' + (cmState.posts.length ? cmState.posts.map(cmPostHtml).join('') : '<div class="card"><div class="today-empty">还没有动态，来发第一条吧。</div></div>') + '</div>' +
      '<h2 class="sec-title">资料广场</h2>' +
      '<input class="f-input" id="cmSearch" placeholder="搜索分享标题、说明或作者" value="' + esc(cmState.q) + '">' +
      '<div class="filter-chips" style="margin-top:10px">' + subjChips.map(function (sid) {
        return '<button type="button" class="f-chip' + (cmState.subject === sid ? ' on' : '') + '" data-cm-subject="' + esc(sid) + '">' + (sid ? (SUBJECT_NAMES[sid] || sid) : '全部') + '</button>';
      }).join('') + '</div>' +
      '<div id="cmList">' + (list.length ? list.map(cmCardHtml).join('') : '<div class="card"><div class="today-empty">' + (cmState.shares.length ? '没有符合筛选的分享，换个关键词试试。' : '广场还空着，来做第一个分享的人吧。') + '</div></div>') + '</div>' +
      '<h2 class="sec-title">我的资料（分享到广场）</h2><div class="card">' + (cmState.myFiles.length ? cmState.myFiles.map(function (f) {
        var meta = [SUBJECT_NAMES[f.subject] || f.subject || '', f.questions ? '含 ' + f.questions + ' 道已导入题' : '暂无已导入题', (f.size / 1048576).toFixed(2) + ' MiB'].filter(Boolean).join(' · ');
        return '<div class="list-row"><div class="row-title">' + esc(f.name) + '</div><div class="row-meta">' + esc(meta) + '</div>' +
          '<div class="row-actions">' + (f.shareId
            ? '<button type="button" class="btn-sub danger" data-cm-unshare="' + esc(f.shareId) + '">取消分享</button>'
            : '<button type="button" class="btn-sub" data-cm-share="' + esc(f.id) + '" data-cm-name="' + esc(f.name) + '">分享到广场</button>') + '</div></div>';
      }).join('') : '<div class="today-empty">你还没有上传过资料，先到资料库上传一份。</div>') + '</div>';
    var search = document.getElementById('cmSearch');
    var timer = null;
    search.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { cmState.q = search.value.trim(); paintCommunity(body); var s2 = document.getElementById('cmSearch'); if (s2) { s2.focus(); s2.setSelectionRange(s2.value.length, s2.value.length); } }, 350);
    });
    $$('[data-cm-subject]', body).forEach(function (b) { b.addEventListener('click', function () { cmState.subject = b.dataset.cmSubject; paintCommunity(body); }); });
    wireCommunityList(body);
    wireFeed(body);
    $$('[data-cm-share]', body).forEach(function (b) {
      b.addEventListener('click', function () {
        showForm({ title: '分享到广场', okText: '发布分享', fields: [
          { id: 'title', label: '标题', value: b.dataset.cmName, maxlength: 60 },
          { id: 'note', label: '说明（可选）', value: '', placeholder: '这份资料适合谁、怎么用', maxlength: 200 }
        ] }).then(function (v) {
          if (!v || !v.title) return;
          cmApi('POST', { action: 'share', fileId: b.dataset.cmShare, title: v.title, note: v.note }).then(function () {
            toast('已分享到广场');
            renderCommunity(body);
          }).catch(function (e) { toast('分享失败：' + e.message); });
        });
      });
    });
    $$('[data-cm-unshare]', body).forEach(function (b) {
      b.addEventListener('click', function () {
        showConfirm({ title: '取消分享？', text: '已导入到别人账号的副本不会被收回。', okText: '取消分享', danger: true }).then(function (ok) {
          if (!ok) return;
          cmApi('POST', { action: 'unshare', id: b.dataset.cmUnshare }).then(function () { toast('已取消分享'); renderCommunity(body); })
            .catch(function (e) { toast('取消失败：' + e.message); });
        });
      });
    });
  }
  function wireCommunityList(scope) {
    $$('[data-cm-like]', scope).forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.dataset.cmLike;
        cmApi('POST', { action: 'like', id: id }).then(function (out) {
          var x = cmState.shares.filter(function (s2) { return String(s2.id) === String(id); })[0];
          if (x) { x.liked = out.liked; x.likeCount = out.likeCount; }
          b.classList.toggle('on', !!out.liked);
          b.innerHTML = (out.liked ? '♥' : '♡') + ' <span>' + (out.likeCount || 0) + '</span>';
        }).catch(function (e) { toast('点赞失败：' + e.message); });
      });
    });
    $$('[data-cm-import]', scope).forEach(function (b) {
      b.addEventListener('click', function () {
        b.disabled = true; b.textContent = '导入中…';
        cmApi('POST', { action: 'import', id: b.dataset.cmImport }).then(function (out) {
          toast('导入完成：' + (out.imported || 0) + ' 道题已进入你的个人题库');
          wbCache = null;
          renderCommunity(document.getElementById('subBody'));
        }).catch(function (e) { toast('导入失败：' + e.message); b.disabled = false; b.textContent = '导入到我的账号'; });
      });
    });
    $$('[data-cm-comments]', scope).forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.dataset.cmComments;
        var zone = document.querySelector('[data-cm-zone="' + CSS.escape(id) + '"]');
        if (!zone) return;
        zone.hidden = !zone.hidden;
        if (!zone.hidden) loadCmComments(id);
      });
    });
    $$('[data-cm-form]', scope).forEach(function (f) {
      f.addEventListener('submit', function (e) {
        e.preventDefault();
        var id = f.dataset.cmForm;
        var input = f.querySelector('input');
        var text = input.value.trim();
        if (!text) return;
        cmApi('POST', { action: 'comment', id: id, text: text }).then(function () {
          input.value = '';
          loadCmComments(id);
        }).catch(function (err) { toast('评论失败：' + err.message); });
      });
    });
  }
  function loadCmComments(id) {
    var zone = document.querySelector('[data-cm-zone="' + CSS.escape(id) + '"]');
    if (!zone) return;
    var list = zone.querySelector('[data-cm-list]');
    cmApi('GET', null, '?comments=' + encodeURIComponent(id)).then(function (data) {
      var comments = data.comments || [];
      list.innerHTML = comments.length ? comments.map(function (c) {
        return '<div class="cm-comment">' + cmAvatar(c.authorUid, c.authorAvatarAt, c.author, 24) +
          '<div style="flex:1;min-width:0"><b>' + esc(c.author || '同学') + '</b> <span class="row-meta">' + esc(cmDate(c.createdAt)) + '</span><div>' + esc(c.text || '') + '</div></div>' +
          (c.mine ? '<button type="button" class="del" data-cm-delcomment="' + esc(c.id) + '" data-cm-shareid="' + esc(id) + '">删除</button>' : '') + '</div>';
      }).join('') : '<p class="row-meta">还没有评论，来做第一个留言的人吧。</p>';
      $$('[data-cm-delcomment]', list).forEach(function (b) {
        b.addEventListener('click', function () {
          cmApi('POST', { action: 'uncomment', commentId: b.dataset.cmDelcomment }).then(function () { loadCmComments(b.dataset.cmShareid); })
            .catch(function (e) { toast('删除失败：' + e.message); });
        });
      });
    }).catch(function (e) { list.innerHTML = '<p class="row-meta">评论加载失败：' + esc(e.message || '') + '</p>'; });
  }

  /* ---------- 学习计划（App 内） ---------- */
  subRenderers.plan = { title: '学习计划', render: function (body) { renderPlan(body); } };

  /* ---------- 刷题直达：App 内先选科目/章节/难度/套卷，进作答页自动开始 ---------- */
  var startSel = { mode: 'knowledge', subject: '', chapter: 'all', kp: '', diff: 'all', paper: '' };
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-start-mode]');
    if (!t) return;
    e.preventDefault();
    startSel = { mode: t.dataset.startMode, subject: '', chapter: 'all', kp: '', diff: 'all', paper: '' };
    var subs = ((state.profile || {}).subjects || []).filter(function (x) { return SUBJECT_NAMES[x]; });
    if (subs.length) startSel.subject = subs[0];
    openSub('start');
  });
  subRenderers.start = { title: '开始刷题', render: function (body) { renderStartPicker(body); } };
  function startUrl() {
    var q = ['mode=' + startSel.mode, 'subject=' + encodeURIComponent(startSel.subject), 'autostart=1'];
    if (startSel.mode === 'knowledge') {
      if (startSel.chapter && startSel.chapter !== 'all') q.push('chapter=' + encodeURIComponent(startSel.chapter));
      if (startSel.kp) q.push('kp=' + encodeURIComponent(startSel.kp));
      if (startSel.diff && startSel.diff !== 'all') q.push('difficulty=' + encodeURIComponent(startSel.diff));
    }
    if (startSel.mode === 'paper') q.push('paper=' + encodeURIComponent(startSel.paper));
    return 'practice.html?' + q.join('&');
  }
  function renderStartPicker(body) {
    var modes = [['knowledge', '按知识点'], ['paper', '按套卷'], ['mock', '全真模考']];
    var profSubs = ((state.profile || {}).subjects || []).filter(function (x) { return SUBJECT_NAMES[x]; });
    var ordered = profSubs.concat(Object.keys(SUBJECT_NAMES).filter(function (x) { return profSubs.indexOf(x) < 0; }));
    if (!startSel.subject || !SUBJECT_NAMES[startSel.subject]) startSel.subject = ordered[0];
    body.innerHTML =
      '<div class="filter-chips" style="padding-top:2px">' + modes.map(function (m) {
        return '<button type="button" class="f-chip' + (startSel.mode === m[0] ? ' on' : '') + '" data-sm="' + m[0] + '">' + m[1] + '</button>';
      }).join('') + '</div>' +
      '<label class="f-label">科目</label><div class="filter-chips">' + ordered.map(function (x) {
        return '<button type="button" class="f-chip' + (startSel.subject === x ? ' on' : '') + '" data-ss="' + x + '">' + SUBJECT_NAMES[x] + '</button>';
      }).join('') + '</div>' +
      '<div id="startExtra"><div class="sub-loading">正在加载题库…</div></div>' +
      '<button class="btn-main" id="startGo" type="button" disabled>' + (startSel.mode === 'mock' ? '开始全真模考' : '开始刷题') + '</button>' +
      '<p class="view-note">在 App 里选好，进作答页自动开始，不用再到网页里二次选择。</p>';
    $$('[data-sm]', body).forEach(function (b) { b.addEventListener('click', function () { startSel.mode = b.dataset.sm; startSel.paper = ''; renderStartPicker(body); }); });
    $$('[data-ss]', body).forEach(function (b) { b.addEventListener('click', function () { startSel.subject = b.dataset.ss; startSel.chapter = 'all'; startSel.kp = ''; startSel.paper = ''; renderStartPicker(body); }); });
    document.getElementById('startGo').addEventListener('click', function () { location.href = startUrl(); });
    var wantSubject = startSel.subject;
    AtlasQuestions.load(wantSubject).then(function () {
      if (subCurrent !== 'start' || startSel.subject !== wantSubject) return;
      paintStartExtra(body, ((window.QUESTIONS && window.QUESTIONS.items) || []).filter(function (i) { return i.subject === wantSubject; }));
    }).catch(function () {
      var ex = document.getElementById('startExtra');
      if (ex) ex.innerHTML = '<div class="sub-loading">题库加载失败，检查网络后重试。</div>';
    });
  }
  function paintStartExtra(body, items) {
    var ex = document.getElementById('startExtra');
    var go = document.getElementById('startGo');
    if (!ex || !go) return;
    if (startSel.mode === 'mock') {
      ex.innerHTML = '<div class="card"><div class="row-title">' + esc(SUBJECT_NAMES[startSel.subject]) + ' · 全真模考</div>' +
        '<div class="row-meta">按正式考试结构组卷 · 限时 180 分钟 · 到时自动交卷。点开始后先确认考试须知。</div></div>';
      go.disabled = false;
      return;
    }
    if (startSel.mode === 'paper') {
      var byChapter = {};
      items.forEach(function (i) {
        var c = byChapter[i.chapter] || (byChapter[i.chapter] = { id: i.chapter, title: i.chapterTitle || i.chapter, count: 0, year: 0, mock: false });
        c.count++; if (i.isMock) c.mock = true;
        var y = Number(i.year) || (String(c.title).match(/(19|20)\d{2}/) || [0])[0];
        c.year = Math.max(c.year, Number(y) || 0);
      });
      var papers = Object.keys(byChapter).map(function (k) { return byChapter[k]; })
        .sort(function (a, b) { return b.year - a.year || b.count - a.count; });
      if (!papers.length) { ex.innerHTML = '<div class="sub-loading">这个科目暂时没有成套卷。</div>'; go.disabled = true; return; }
      ex.innerHTML = '<label class="f-label">选择套卷</label>' + papers.map(function (p) {
        return '<div class="hist-row" data-paper="' + esc(p.id) + '"><div class="hist-main"><div class="hist-title">' + esc(p.title) + '</div>' +
          '<div class="hist-meta">' + p.count + ' 题' + (p.mock ? ' · 模拟卷' : ' · 真题') + '</div></div>' +
          (startSel.paper === p.id ? '<span class="tag-chip">已选</span>' : '') + '</div>';
      }).join('');
      $$('[data-paper]', ex).forEach(function (row) {
        row.addEventListener('click', function () { startSel.paper = row.dataset.paper; paintStartExtra(body, items); });
      });
      go.disabled = !startSel.paper;
      return;
    }
    /* knowledge：章节 → 知识点 → 难度 */
    var byTopic = {};
    items.forEach(function (i) {
      var key = i.topicChapter || i.chapter;
      var c = byTopic[key] || (byTopic[key] = { id: key, title: i.topicTitle || i.chapterTitle || key, count: 0 });
      c.count++;
    });
    var chapters = Object.keys(byTopic).map(function (k) { return byTopic[k]; });
    var html = '<label class="f-label">章节</label><div class="filter-chips">' +
      '<button type="button" class="f-chip' + (startSel.chapter === 'all' ? ' on' : '') + '" data-sc="all">全部章节</button>' +
      chapters.map(function (c) {
        return '<button type="button" class="f-chip' + (startSel.chapter === c.id ? ' on' : '') + '" data-sc="' + esc(c.id) + '">' + esc(c.title) + ' · ' + c.count + '</button>';
      }).join('') + '</div>';
    if (startSel.chapter !== 'all') {
      var kps = {};
      items.forEach(function (i) {
        if ((i.topicChapter || i.chapter) !== startSel.chapter || !i.kp) return;
        var k = kps[i.kp] || (kps[i.kp] = { id: i.kp, name: i.kpName || i.kp, count: 0 });
        k.count++;
      });
      var kpList = Object.keys(kps).map(function (k) { return kps[k]; });
      if (kpList.length) {
        html += '<label class="f-label">知识点</label><div class="filter-chips">' +
          '<button type="button" class="f-chip' + (!startSel.kp ? ' on' : '') + '" data-sk="">整个章节</button>' +
          kpList.map(function (k) {
            return '<button type="button" class="f-chip' + (startSel.kp === k.id ? ' on' : '') + '" data-sk="' + esc(k.id) + '">' + esc(k.name) + ' · ' + k.count + '</button>';
          }).join('') + '</div>';
      }
    }
    html += '<label class="f-label">难度</label><div class="filter-chips">' +
      [['all', '全部难度'], ['易', '易'], ['中', '中'], ['难', '难']].map(function (d) {
        return '<button type="button" class="f-chip' + (startSel.diff === d[0] ? ' on' : '') + '" data-sd="' + d[0] + '">' + d[1] + '</button>';
      }).join('') + '</div>';
    ex.innerHTML = html;
    $$('[data-sc]', ex).forEach(function (b) { b.addEventListener('click', function () { startSel.chapter = b.dataset.sc; startSel.kp = ''; paintStartExtra(body, items); }); });
    $$('[data-sk]', ex).forEach(function (b) { b.addEventListener('click', function () { startSel.kp = b.dataset.sk; paintStartExtra(body, items); }); });
    $$('[data-sd]', ex).forEach(function (b) { b.addEventListener('click', function () { startSel.diff = b.dataset.sd; paintStartExtra(body, items); }); });
    go.disabled = false;
  }
  function dayKeyOf(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function phaseOf(daysLeft) {
    if (daysLeft > 45) return { name: '强化推进期', paperEvery: 4, newShare: 0.75 };
    if (daysLeft >= 20) return { name: '真题强化期', paperEvery: 3, newShare: 0.65 };
    if (daysLeft >= 8) return { name: '套卷冲刺期', paperEvery: 2, newShare: 0.45 };
    if (daysLeft >= 0) return { name: '考前复盘期', paperEvery: 2, newShare: 0.3 };
    return { name: '初试已结束', paperEvery: 3, newShare: 0.5 };
  }
  function renderPlan(body) {
    AtlasUser.load('plan', {}).then(function (plan) {
      if (subCurrent !== 'plan') return;
      state.planState = plan || {};
      paintPlan(body, state.planState);
    }).catch(function () { body.innerHTML = '<div class="sub-loading">计划加载失败。</div>'; });
  }
  function paintPlan(body, plan) {
    var key = dayKeyOf(new Date());
    var day = plan && plan.days ? plan.days[key] : null;
    if (!day || !day.tasks) {
      body.innerHTML = '<div class="card"><div class="row-title">还没有本周计划</div><p class="view-note">按你的目标科目、每日时长与最近成绩薄弱点，生成 7 天滚动计划：错题复习打头，套卷日与新题推进交替，英语带单词复习。</p></div>' +
        '<button class="btn-main" id="planGen" type="button">生成本周计划</button>';
      document.getElementById('planGen').addEventListener('click', function () {
        var btn = this;
        btn.disabled = true; btn.textContent = '生成中…';
        generatePlan().then(function (p) { state.planState = p; paintPlan(body, p); toast('计划已生成'); renderToday(); })
          .catch(function (e) { toast('生成失败：' + e.message); btn.disabled = false; btn.textContent = '生成本周计划'; });
      });
      return;
    }
    var doneN = day.tasks.filter(function (t) { return day.done && day.done[t.id]; }).length;
    var tmr = new Date(); tmr.setDate(tmr.getDate() + 1);
    var tDay = plan.days[dayKeyOf(tmr)];
    body.innerHTML =
      '<div class="card"><div class="row-title">' + esc(plan.phase || '') + ' · 每日 ' + fmtHMin(plan.dailyMinutes) + '</div>' +
      '<div class="row-meta">今日已完成 ' + doneN + ' / ' + day.tasks.length + ' 项</div>' +
      '<div class="bar-track"><div class="bar-fill" style="width:' + (day.tasks.length ? Math.round(doneN / day.tasks.length * 100) : 0) + '%"></div></div></div>' +
      '<div class="card">' + day.tasks.map(function (t) {
        var done = !!(day.done && day.done[t.id]);
        return '<div class="plan-task' + (done ? ' done' : '') + '"><button type="button" class="plan-check' + (done ? ' done' : '') + '" data-plan-toggle="' + esc(t.id) + '">' + (done ? '✓' : '') + '</button>' +
          '<div class="plan-task-main"><div class="row-title">' + esc(t.label) + (t.mins ? ' <span class="tag-chip">' + t.mins + ' 分钟</span>' : '') + '</div>' +
          '<div class="row-meta">' + esc(t.detail || '') + '</div>' +
          '<div class="row-actions">' + (t.kind === 'vocab' ? '<button type="button" class="btn-sub" data-sub="vocab">去完成</button>' : (t.href ? '<a class="btn-sub" href="' + esc(t.href) + '">去完成</a>' : '')) + '</div></div></div>';
      }).join('') + '</div>' +
      (tDay && tDay.tasks ? '<p class="view-note">明日预告：' + tDay.tasks.slice(0, 3).map(function (t) { return esc(t.label); }).join(' · ') + '</p>' : '') +
      '<div style="display:flex;gap:10px"><button class="btn-sub" id="planSettings" type="button" style="flex:1">计划设置</button>' +
      '<button class="btn-sub" id="planRegen" type="button" style="flex:1">重新生成本周计划</button></div>';
    $$('[data-plan-toggle]', body).forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.dataset.planToggle;
        day.done = day.done || {};
        if (day.done[id]) delete day.done[id]; else day.done[id] = true;
        AtlasUser.save('plan', plan).then(function () { state.planState = plan; paintPlan(body, plan); renderToday(); }).catch(function (e) { toast('保存失败：' + e.message); });
      });
    });
    document.getElementById('planSettings').addEventListener('click', function () { renderPlanSettings(body); });
    document.getElementById('planRegen').addEventListener('click', function () {
      showConfirm({ title: '重新生成计划？', text: '会覆盖当前 7 天计划与勾选进度。', okText: '重新生成' }).then(function (ok) {
        if (!ok) return;
        generatePlan().then(function (p) { state.planState = p; paintPlan(body, p); toast('计划已更新'); renderToday(); });
      });
    });
  }
  /* 计划设置：与网页版 plan.js 规则一致，存 plan.settings */
  function psetNorm(raw) {
    raw = raw || {};
    return {
      hours: Math.max(0, Math.min(24, Number(raw.hours) || 0)),
      paperEvery: [0, 2, 3, 4, 5, 99].indexOf(Number(raw.paperEvery)) >= 0 ? Number(raw.paperEvery) : 0,
      newSharePct: Math.max(0, Math.min(90, Number(raw.newSharePct) || 0)),
      includeReview: raw.includeReview !== false,
      includeVocab: raw.includeVocab !== false,
      restWeekday: Number(raw.restWeekday) >= -1 && Number(raw.restWeekday) <= 6 ? Number(raw.restWeekday) : -1,
      focus: Array.isArray(raw.focus) ? raw.focus.filter(function (x) { return SUBJECT_NAMES[x]; }) : []
    };
  }
  function fmtHMin(min) {
    var h = Math.round((Number(min) || 0) / 60 * 10) / 10;
    return String(h).replace(/\.0$/, '') + ' 小时';
  }
  function generatePlan(stRaw) {
    var st = psetNorm(stRaw != null ? stRaw : (state.planState && state.planState.settings));
    var profile = state.profile || {};
    var subjects = (profile.subjects || []).filter(function (x) { return SUBJECT_NAMES[x]; });
    if (!subjects.length) subjects = ['math', 'english', 'mechanics', 'politics'];
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var exam = profile.examDate ? new Date(profile.examDate + 'T00:00:00') : new Date(today.getTime() + 40 * 86400000);
    var daysLeft = Math.round((exam - today) / 86400000);
    var phase = phaseOf(daysLeft);
    var daily = st.hours > 0 ? Math.max(60, Math.round(st.hours * 60)) : Math.max(60, Number(profile.dailyMinutes) || 240);
    var paperEvery = st.paperEvery || phase.paperEvery;
    var newShare = st.newSharePct > 0 ? st.newSharePct / 100 : phase.newShare;
    var latest = {};
    paperAttempts().forEach(function (a) { if (!latest[a.subject]) latest[a.subject] = a; });
    var weights = subjects.map(function (x) {
      var a = latest[x];
      var rate = a ? summarizeAttempt(a).rate : null;
      var weak = rate == null ? 0.3 : Math.min(0.85, Math.max(0.05, 1 - rate));
      var w = 0.7 + weak;
      if (st.focus.indexOf(x) >= 0) w *= 1.5;
      return w;
    });
    var wsum = weights.reduce(function (a, b) { return a + b; }, 0);
    var reviewDue = 0;
    try {
      var rev = state.reviewState || {}, now = Date.now();
      Object.keys(rev).forEach(function (k) { var e = rev[k]; if (e && typeof e.due === 'number' && e.due <= now) reviewDue++; });
      if (!reviewDue) reviewDue = Object.keys(state.practiceRec || {}).filter(function (id) { return state.practiceRec[id].wrong > 0; }).length;
    } catch (_) { /* 忽略 */ }
    var vocabDue = 0;
    try {
      var vr = (state.vocabState && state.vocabState.rec) || {}, n2 = Date.now();
      Object.keys(vr).forEach(function (w) { var e = vr[w]; if (e && e.d <= n2 && e.l < 5) vocabDue++; });
    } catch (_) { /* 忽略 */ }
    var days = {};
    for (var i = 0; i < 7; i++) {
      var date = new Date(today.getTime() + i * 86400000);
      var key = dayKeyOf(date);
      if (st.restWeekday >= 0 && date.getDay() === st.restWeekday) {
        days[key] = { tasks: [{ id: 'rest', kind: 'rest', label: '休息日', detail: '按你的设置今天不安排任务，自由活动或补觉' }], done: {} };
        continue;
      }
      var tasks = [];
      if (st.includeReview) tasks.push({ id: 'review', kind: 'review', label: '错题复习', detail: i === 0 && reviewDue ? reviewDue + ' 道到期错题（艾宾浩斯回流）' : '清掉当天到期的错题，没有到期就跳过', href: 'practice.html?review=1' });
      var paperSubject = (paperEvery !== 99 && i % paperEvery === paperEvery - 1) ? subjects[Math.floor(i / paperEvery) % subjects.length] : null;
      subjects.forEach(function (x, si) {
        if (paperSubject === x) {
          tasks.push({ id: 'paper-' + x, kind: 'paper', subject: x, label: SUBJECT_NAMES[x] + ' · 套卷日', detail: '做一整套卷，限时完成，交卷后看套卷分析', mins: Math.round(daily * 0.45), href: 'practice.html?subject=' + x });
        } else {
          var mins = Math.round(daily * newShare * weights[si] / wsum / 5) * 5;
          if (mins >= 20) tasks.push({ id: 'new-' + x, kind: 'new', subject: x, label: SUBJECT_NAMES[x] + ' · 新题推进', detail: '优先练薄弱章节与高频考点', mins: mins, href: 'practice.html?subject=' + x });
        }
      });
      if (st.includeVocab && (subjects.indexOf('english') >= 0 || subjects.indexOf('english2') >= 0)) {
        tasks.push({ id: 'vocab', kind: 'vocab', label: '单词复习', detail: i === 0 && vocabDue ? vocabDue + ' 个单词到期' : '按遗忘曲线复习到期单词', mins: 20, href: 'vocab.html' });
      }
      days[key] = { tasks: tasks, done: {} };
    }
    var plan = { generatedAt: new Date().toISOString(), examDate: profile.examDate || '', daysLeft: daysLeft, phase: phase.name, dailyMinutes: daily, days: days, settings: st };
    return AtlasUser.save('plan', plan).then(function () { return plan; });
  }
  /* 计划设置页（App 内） */
  function renderPlanSettings(body) {
    subBackHook = function () { paintPlan(body, state.planState); return true; };
    var st = psetNorm(state.planState && state.planState.settings);
    var profile = state.profile || {};
    var subjects = (profile.subjects || []).filter(function (x) { return SUBJECT_NAMES[x]; });
    if (!subjects.length) subjects = ['math', 'english', 'mechanics', 'politics'];
    var profileHours = Math.round(((profile.dailyMinutes || 240) / 60) * 10) / 10;
    function opts(list, cur) {
      return list.map(function (o) { return '<option value="' + o[0] + '"' + (String(o[0]) === String(cur) ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('');
    }
    body.innerHTML =
      '<div class="card"><div class="row-title">计划设置</div>' +
      '<label class="f-label">每日学习时长（小时，留空用档案的 ' + profileHours + ' 小时）</label>' +
      '<input class="f-input" id="pstHours" type="number" min="0" max="24" step="0.5" value="' + (st.hours || '') + '" placeholder="' + profileHours + '">' +
      '<label class="f-label">套卷频率</label><select class="f-input" id="pstPaper">' + opts([[0, '自动（按阶段）'], [2, '每 2 天一套'], [3, '每 3 天一套'], [4, '每 4 天一套'], [5, '每 5 天一套'], [99, '不安排套卷']], st.paperEvery) + '</select>' +
      '<label class="f-label">新题推进占比</label><select class="f-input" id="pstShare">' + opts([[0, '自动（按阶段）'], [30, '30%'], [45, '45%'], [60, '60%'], [75, '75%'], [90, '90%']], st.newSharePct) + '</select>' +
      '<label class="f-label">每周休息日</label><select class="f-input" id="pstRest">' + opts([[-1, '不休息'], [1, '周一'], [2, '周二'], [3, '周三'], [4, '周四'], [5, '周五'], [6, '周六'], [0, '周日']], st.restWeekday) + '</select>' +
      '<label class="f-label">任务包含</label><div class="filter-chips">' +
      '<button type="button" class="f-chip' + (st.includeReview ? ' on' : '') + '" id="pstReview">错题复习</button>' +
      '<button type="button" class="f-chip' + (st.includeVocab ? ' on' : '') + '" id="pstVocab">单词复习</button></div>' +
      '<label class="f-label">重点科目（多排时间）</label><div class="filter-chips">' + subjects.map(function (x) {
        return '<button type="button" class="f-chip pst-focus' + (st.focus.indexOf(x) >= 0 ? ' on' : '') + '" data-fs="' + x + '">' + SUBJECT_NAMES[x] + '</button>';
      }).join('') + '</div></div>' +
      '<button class="btn-main" id="pstSave" type="button">保存并重新生成</button>';
    [['pstReview'], ['pstVocab']].forEach(function (pair) {
      var el = document.getElementById(pair[0]);
      el.addEventListener('click', function () { el.classList.toggle('on'); });
    });
    $$('.pst-focus', body).forEach(function (b) { b.addEventListener('click', function () { b.classList.toggle('on'); }); });
    document.getElementById('pstSave').addEventListener('click', function () {
      var next = psetNorm({
        hours: Number(document.getElementById('pstHours').value) || 0,
        paperEvery: Number(document.getElementById('pstPaper').value),
        newSharePct: Number(document.getElementById('pstShare').value),
        restWeekday: Number(document.getElementById('pstRest').value),
        includeReview: document.getElementById('pstReview').classList.contains('on'),
        includeVocab: document.getElementById('pstVocab').classList.contains('on'),
        focus: $$('.pst-focus.on', body).map(function (b) { return b.dataset.fs; })
      });
      var btn = this; btn.disabled = true; btn.textContent = '生成中…';
      generatePlan(next).then(function (p) { state.planState = p; subBackHook = null; paintPlan(body, p); toast('计划设置已保存'); renderToday(); })
        .catch(function (e) { toast('保存失败：' + e.message); btn.disabled = false; btn.textContent = '保存并重新生成'; });
    });
  }

  /* ---------- 档案（App 内基础编辑） ---------- */
  subRenderers.profile = { title: '档案设置', render: function (body) { renderProfileEdit(body); } };
  function cropAvatarBlob(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function () {
        URL.revokeObjectURL(url);
        var side = Math.min(im.width, im.height);
        var c = document.createElement('canvas');
        c.width = 256; c.height = 256;
        c.getContext('2d').drawImage(im, (im.width - side) / 2, (im.height - side) / 2, side, side, 0, 0, 256, 256);
        c.toBlob(function (b) { if (b) resolve(b); else reject(new Error('图片处理失败')); }, 'image/jpeg', 0.88);
      };
      im.onerror = function () { URL.revokeObjectURL(url); reject(new Error('图片读取失败')); };
      im.src = url;
    });
  }
  function renderProfileEdit(body) {
    AtlasUser.json('/api/profile').then(function (r) {
      if (subCurrent !== 'profile') return;
      var p = r.profile || {};
      state.profile = p;
      var target = [p.school || p.university, p.code || p.programCode, p.major || p.majorName].filter(Boolean).join(' · ');
      var avatarHtml = p.avatarAt
        ? '<img src="/api/profile/avatar?v=' + p.avatarAt + '" alt="">'
        : '<span class="profile-avatar-fb">' + esc((p.nickname || '观').charAt(0)) + '</span>';
      body.innerHTML =
        '<div class="card"><div class="profile-avatar-row">' + avatarHtml +
          '<div><button class="btn-sub" id="pfAvatarBtn" type="button">更换头像</button>' +
          '<p class="view-note" style="margin:6px 0 0">正方形裁剪后上传，与社区、名片同步。</p></div></div>' +
          '<input type="file" id="pfAvatarFile" accept="image/*" hidden></div>' +
        '<div class="card">' +
          '<label class="f-label">昵称</label><input class="f-input" id="pfNick" maxlength="24" value="' + esc(p.nickname || '') + '">' +
          '<label class="f-label">座右铭（60 字内）</label><input class="f-input" id="pfMotto" maxlength="60" value="' + esc(p.motto || '') + '">' +
          '<label class="f-label">初试日期</label><input class="f-input" id="pfExam" type="date" value="' + esc(p.examDate || '') + '">' +
          '<label class="f-label">每日学习时长（小时）</label><input class="f-input" id="pfDaily" type="number" min="0.5" max="24" step="0.5" value="' + esc(Math.round(((p.dailyMinutes || 240) / 60) * 10) / 10) + '">' +
          '<label class="f-label">目标院校专业</label><div class="row-title" style="font-weight:500">' + esc(target || '尚未选择') + '</div>' +
          '<p class="view-note">院校专业（全国 2027 目录）选择在网页版档案里完成：<a href="index.html#profile" style="color:var(--gold);font-weight:700">打开网页版档案</a></p>' +
        '</div>' +
        '<button class="btn-main" id="pfSave" type="button">保存档案</button>';
      document.getElementById('pfAvatarBtn').addEventListener('click', function () { document.getElementById('pfAvatarFile').click(); });
      document.getElementById('pfAvatarFile').addEventListener('change', function () {
        var f = this.files && this.files[0];
        this.value = '';
        if (!f) return;
        cropAvatarBlob(f).then(function (blob) {
          return fetch('/api/profile/avatar', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
        }).then(function (res) { return res.json(); }).then(function (d) {
          if (!d.ok) throw new Error(d.error || '上传失败');
          toast('头像已更新');
          renderProfileEdit(body);
          AtlasUser.json('/api/profile').then(function (r2) { state.profile = r2.profile || state.profile; renderHero(); }).catch(function () {});
        }).catch(function (e) { toast('头像上传失败：' + e.message); });
      });
      document.getElementById('pfSave').addEventListener('click', function () {
        var btn = this;
        var merged = Object.assign({}, p, {
          nickname: document.getElementById('pfNick').value.trim(),
          motto: document.getElementById('pfMotto').value.trim(),
          examDate: document.getElementById('pfExam').value || p.examDate,
          dailyMinutes: Math.max(30, Math.min(1440, Math.round((Number(document.getElementById('pfDaily').value) || 4) * 60)))
        });
        btn.disabled = true;
        AtlasUser.json('/api/profile', 'PUT', merged).then(function () {
          state.profile = merged;
          renderHero();
          toast('档案已保存');
          btn.disabled = false;
        }).catch(function (e) { toast('保存失败：' + e.message); btn.disabled = false; });
      });
    }).catch(function (e) { body.innerHTML = '<div class="sub-loading">档案加载失败：' + esc(e.message || '') + '</div>'; });
  }

  /* ---------- 账号设置（App 内） ---------- */
  subRenderers.settings = { title: '账号设置', render: function (body) { renderSettings(body); } };
  function renderSettings(body) {
    var u = state.user || {};
    body.innerHTML =
      '<div class="card"><div class="row-title">我的账号</div>' +
      '<div class="row-meta">昵称：' + esc(u.nickname || '—') + '<br>手机号：' + esc(u.phone || '—') + (u.createdAt ? '<br>注册时间：' + esc(String(u.createdAt).slice(0, 10)) : '') + '</div></div>' +
      '<div class="card"><div class="row-title">修改密码</div>' +
      '<label class="f-label">旧密码</label><input class="f-input" id="stOld" type="password" maxlength="32" autocomplete="current-password">' +
      '<label class="f-label">新密码（8–32 位，需含字母和数字）</label><input class="f-input" id="stNew" type="password" maxlength="32" autocomplete="new-password">' +
      '<label class="f-label">确认新密码</label><input class="f-input" id="stNew2" type="password" maxlength="32" autocomplete="new-password">' +
      '<button class="btn-main" id="stPwBtn" type="button" style="margin-top:14px">保存新密码</button></div>' +
      '<div class="card"><div class="row-title">我的数据</div><p class="view-note" style="margin:6px 0 12px">导出账号全部个人数据（档案、刷题与批改记录、个人题库、笔记、教练对话）为 JSON 文件。资料库原文件请在资料库中单独下载。</p>' +
      '<a class="btn-sub" href="/api/auth/export" style="display:block;text-align:center;height:44px;line-height:44px;padding:0">导出我的数据</a></div>' +
      '<div class="card"><div class="row-title" style="color:var(--ver)">注销账号</div><p class="view-note" style="margin:6px 0 0">注销将永久删除账号及全部个人数据，不可恢复。如只是暂时不用，无需注销。</p>' +
      '<label class="f-label">输入密码确认</label><input class="f-input" id="stDelPw" type="password" maxlength="32" autocomplete="current-password">' +
      '<button class="btn-main" id="stDelBtn" type="button" style="margin-top:12px;background:var(--ver)">永久注销账号</button></div>' +
      '<div id="aiCfgMount"></div>';
    if (window.AtlasAiCfg) window.AtlasAiCfg.renderSettings(document.getElementById('aiCfgMount'));
    document.getElementById('stPwBtn').addEventListener('click', function () {
      var btn = this;
      var oldPw = document.getElementById('stOld').value, nw = document.getElementById('stNew').value, nw2 = document.getElementById('stNew2').value;
      if (!oldPw || !nw) { toast('请填写完整'); return; }
      if (nw !== nw2) { toast('两次新密码不一致'); return; }
      btn.disabled = true;
      AtlasUser.json('/api/auth/password', 'POST', { oldPassword: oldPw, newPassword: nw }).then(function () {
        toast('密码已修改');
        document.getElementById('stOld').value = '';
        document.getElementById('stNew').value = '';
        document.getElementById('stNew2').value = '';
        btn.disabled = false;
      }).catch(function (e) { toast('改密失败：' + e.message); btn.disabled = false; });
    });
    document.getElementById('stDelBtn').addEventListener('click', function () {
      var pw = document.getElementById('stDelPw').value;
      if (!pw) { toast('请输入密码确认'); return; }
      showConfirm({ title: '永久注销账号？', text: '账号及全部个人数据将被永久删除，不可恢复。', okText: '确认注销', danger: true }).then(function (ok) {
        if (!ok) return;
        AtlasUser.json('/api/auth/delete', 'POST', { password: pw }).then(function () { location.replace('login.html'); })
          .catch(function (e) { toast('注销失败：' + e.message); });
      });
    });
  }

  /* ---------- 版本更新入口（原生桥） ---------- */
  if (window.AtlasApp && window.AtlasApp.versionName) {
    try {
      var vEntry = document.getElementById('versionEntry');
      if (vEntry) {
        vEntry.hidden = false;
        document.getElementById('versionText').textContent = '当前 v' + window.AtlasApp.versionName();
        vEntry.addEventListener('click', function (e) { e.preventDefault(); window.AtlasApp.checkUpdate(); });
      }
    } catch (_) { /* 忽略 */ }
  }


  /* ---------- 笔记库（App 内阅读） ----------
   * 替代网页版 Lazy 笔记浮层：列表 → 分章 → 全屏单栏阅读，内容不再被
   * 浮层与列表遮挡。内置笔记为预渲染 HTML（assets/lazy/<章节>.json），
   * 我的笔记走 /api/notes（Markdown，公式按 KaTeX 渲染）。 */
  var notesState = { index: null, groupCache: {}, userNotes: [], view: 'home', groupId: null, query: '' };
  subRenderers.notes = { title: '笔记库', render: function (body) { renderNotesHome(body); } };
  function notesGroupList() {
    var idx = notesState.index;
    if (!idx) return [];
    return (idx.order || []).map(function (gid) {
      var g = idx.groups[gid];
      return g ? { id: gid, subject: g.subject, title: g.title, count: g.count, notes: g.notes || [] } : null;
    }).filter(Boolean);
  }
  function loadNotesIndex() {
    if (notesState.index) return Promise.resolve(notesState.index);
    return loadScript('assets/lazy-index.js').then(function () {
      notesState.index = window.LAZY_INDEX || { order: [], groups: {} };
      return notesState.index;
    });
  }
  function loadUserNotesList() {
    return AtlasUser.json('/api/notes').then(function (d) { notesState.userNotes = d.notes || []; })
      .catch(function () { notesState.userNotes = []; });
  }
  function loadGroupJson(gid) {
    if (notesState.groupCache[gid]) return Promise.resolve(notesState.groupCache[gid]);
    return fetch('assets/lazy/' + encodeURIComponent(gid) + '.json', { credentials: 'include' })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) { notesState.groupCache[gid] = d; return d; });
  }
  function renderNotesHome(body) {
    subBackHook = null;
    notesState.view = 'home';
    body.innerHTML = '<div class="sub-loading">正在加载笔记…</div>';
    Promise.all([loadNotesIndex(), loadUserNotesList()]).then(function () {
      if (subCurrent !== 'notes') return;
      paintNotesHome(body);
    }).catch(function (e) { body.innerHTML = '<div class="sub-loading">笔记加载失败：' + esc(e.message || '') + '</div>'; });
  }
  function noteRowHtml(n, gid, mine) {
    return '<div class="list-row"><button type="button" class="note-link" data-note-open="' + esc(n.id) + '" data-note-group="' + esc(gid || '') + '" data-note-mine="' + (mine ? '1' : '') + '">' + esc(n.title) + '</button>' +
      '<div class="row-meta">' + (mine ? '我的 · ' : '内置 · ') + esc(n.type || '笔记') + '</div></div>';
  }
  function paintNotesHome(body) {
    var q = notesState.query.trim().toLowerCase();
    var html = '<input class="f-input" id="notesSearch" placeholder="搜索笔记标题…" value="' + esc(notesState.query) + '">';
    if (q) {
      var hits = [];
      notesGroupList().forEach(function (g) { g.notes.forEach(function (n) { if (n.title.toLowerCase().indexOf(q) >= 0) hits.push({ g: g, n: n, mine: false }); }); });
      notesState.userNotes.forEach(function (n) { if ((n.title || '').toLowerCase().indexOf(q) >= 0) hits.push({ g: null, n: n, mine: true }); });
      html += '<div class="card" style="margin-top:12px">' + (hits.length ? hits.map(function (h) {
        return '<div class="list-row"><button type="button" class="note-link" data-note-open="' + esc(h.n.id) + '" data-note-group="' + esc(h.g ? h.g.id : (h.n.chapter || '')) + '" data-note-mine="' + (h.mine ? '1' : '') + '">' + esc(h.n.title) + '</button>' +
          '<div class="row-meta">' + (h.mine ? '我的 · ' : '内置 · ') + esc(h.n.type || '笔记') + (h.g ? ' · ' + esc(h.g.subject + ' ' + h.g.title) : '') + '</div></div>';
      }).join('') : '<div class="today-empty">没有匹配的笔记。</div>') + '</div>';
      body.innerHTML = html;
      wireNotesHome(body);
      return;
    }
    html += '<div style="display:flex;align-items:center;justify-content:space-between;margin:16px 2px 8px"><h2 class="sec-title" style="margin:0">我的笔记</h2><button type="button" class="btn-sub" id="noteNew">＋ 新建笔记</button></div>';
    html += '<div class="card">' + (notesState.userNotes.length ? notesState.userNotes.map(function (n) {
      var g = notesState.index && notesState.index.groups[n.chapter];
      return '<div class="list-row"><button type="button" class="note-link" data-note-open="' + esc(n.id) + '" data-note-group="' + esc(n.chapter || '') + '" data-note-mine="1">' + esc(n.title) + '</button>' +
        '<div class="row-meta">我的 · ' + esc(n.type || '笔记') + (g ? ' · ' + esc(g.subject + ' ' + g.title) : '') + '</div></div>';
    }).join('') : '<div class="today-empty">还没有自己的笔记，点右上角新建一篇。</div>') + '</div>';
    var bySubject = {};
    notesGroupList().forEach(function (g) { (bySubject[g.subject] = bySubject[g.subject] || []).push(g); });
    Object.keys(bySubject).forEach(function (subj) {
      html += '<h2 class="sec-title">' + esc(subj) + '</h2><div class="card">' + bySubject[subj].map(function (g) {
        var mineN = notesState.userNotes.filter(function (n) { return n.chapter === g.id; }).length;
        return '<button type="button" class="note-group-row" data-note-group-open="' + esc(g.id) + '"><span class="note-group-title">' + esc(g.title) + '</span><span class="note-group-count">' + (g.count + mineN) + '</span></button>';
      }).join('') + '</div>';
    });
    body.innerHTML = html;
    wireNotesHome(body);
  }
  function wireNotesHome(body) {
    var search = document.getElementById('notesSearch');
    if (search) {
      var t = null;
      search.addEventListener('input', function () {
        clearTimeout(t);
        t = setTimeout(function () {
          notesState.query = search.value;
          paintNotesHome(body);
          var s2 = document.getElementById('notesSearch');
          if (s2) { s2.focus(); s2.setSelectionRange(s2.value.length, s2.value.length); }
        }, 300);
      });
    }
    var nb = document.getElementById('noteNew');
    if (nb) nb.addEventListener('click', function () { openNoteEditor(body, null, null); });
    $$('[data-note-group-open]', body).forEach(function (b) { b.addEventListener('click', function () { renderNotesGroup(body, b.dataset.noteGroupOpen); }); });
    wireNoteOpenButtons(body);
  }
  function wireNoteOpenButtons(body) {
    $$('[data-note-open]', body).forEach(function (b) {
      b.addEventListener('click', function () { openNoteReader(body, b.dataset.noteGroup, b.dataset.noteOpen, b.dataset.noteMine === '1'); });
    });
  }
  function renderNotesGroup(body, gid) {
    var g = notesState.index && notesState.index.groups[gid];
    if (!g) { renderNotesHome(body); return; }
    notesState.view = 'group';
    notesState.groupId = gid;
    subBackHook = function () { renderNotesHome(body); return true; };
    var mine = notesState.userNotes.filter(function (n) { return n.chapter === gid; });
    body.innerHTML = '<div class="sub-loading">正在加载本章笔记…</div>';
    loadGroupJson(gid).then(function (data) {
      if (subCurrent !== 'notes') return;
      var notes = (data && data.notes) || [];
      body.innerHTML = '<p class="view-note" style="margin:0 0 8px">' + esc(g.subject + ' · ' + g.title) + '</p>' +
        '<div class="card">' +
        mine.map(function (n) { return noteRowHtml(n, gid, true); }).join('') +
        (notes.length ? notes.map(function (n) { return noteRowHtml(n, gid, false); }).join('') : (mine.length ? '' : '<div class="today-empty">本章暂无笔记。</div>')) +
        '</div>' +
        '<button class="btn-sub" id="noteNewInGroup" type="button" style="width:100%;height:46px">＋ 在本章新建笔记</button>';
      wireNoteOpenButtons(body);
      document.getElementById('noteNewInGroup').addEventListener('click', function () { openNoteEditor(body, null, gid); });
    }).catch(function (e) { body.innerHTML = '<div class="sub-loading">本章笔记加载失败：' + esc(e.message || '') + '</div>'; });
  }
  function openNoteReader(body, gid, noteId, mine) {
    notesState.view = 'read';
    subBackHook = function () {
      if (!notesState.query && gid && notesState.index && notesState.index.groups[gid]) renderNotesGroup(body, gid);
      else renderNotesHome(body);
      return true;
    };
    if (mine) {
      body.innerHTML = '<div class="sub-loading">正在打开笔记…</div>';
      AtlasUser.json('/api/notes/' + encodeURIComponent(noteId)).then(function (d) {
        if (subCurrent !== 'notes') return;
        var n = d.note;
        if (!n) throw new Error('笔记不存在');
        paintNoteReader(body, gid, { id: n.id, title: n.title, type: n.type, mine: true, html: mdToHtmlLite(n.markdown || '') });
      }).catch(function (e) { body.innerHTML = '<div class="sub-loading">笔记加载失败：' + esc(e.message || '') + '</div>'; });
      return;
    }
    loadGroupJson(gid).then(function (data) {
      if (subCurrent !== 'notes') return;
      var n = ((data && data.notes) || []).filter(function (x) { return String(x.id) === String(noteId); })[0];
      if (!n) throw new Error('笔记不存在');
      paintNoteReader(body, gid, { id: n.id, title: n.title, type: n.type, mine: false, html: n.html || '' });
    }).catch(function (e) { body.innerHTML = '<div class="sub-loading">笔记加载失败：' + esc(e.message || '') + '</div>'; });
  }
  function paintNoteReader(body, gid, note) {
    var prev = null, next = null;
    if (!note.mine && gid && notesState.groupCache[gid]) {
      var arr = notesState.groupCache[gid].notes || [];
      var i = arr.findIndex(function (x) { return String(x.id) === String(note.id); });
      if (i > 0) prev = arr[i - 1];
      if (i >= 0 && i < arr.length - 1) next = arr[i + 1];
    }
    body.innerHTML =
      '<div class="note-meta-line">' + esc(note.type || '笔记') + (note.mine ? ' · 我的笔记' : ' · 内置') + '</div>' +
      '<h1 class="note-h1">' + esc(note.title) + '</h1>' +
      (note.mine ? '<div class="row-actions" style="margin-bottom:12px"><button type="button" class="btn-sub" id="noteEdit">编辑</button><button type="button" class="btn-sub danger" id="noteDel">删除</button></div>' : '') +
      '<article class="note-article" id="noteArticle">' + note.html + '</article>' +
      ((prev || next) ? '<div class="reader-bottom in-sub">' +
        '<button type="button" class="reader-nav-btn" id="notePrev"' + (prev ? '' : ' disabled') + '>← 上一篇</button>' +
        '<button type="button" class="reader-nav-btn" id="noteNext"' + (next ? '' : ' disabled') + '>下一篇 →</button></div>' : '');
    var art = document.getElementById('noteArticle');
    if (art) renderReaderMath(art);
    body.scrollTop = 0;
    if (prev) document.getElementById('notePrev').addEventListener('click', function () { openNoteReader(body, gid, prev.id, false); });
    if (next) document.getElementById('noteNext').addEventListener('click', function () { openNoteReader(body, gid, next.id, false); });
    if (note.mine) {
      document.getElementById('noteEdit').addEventListener('click', function () {
        AtlasUser.json('/api/notes/' + encodeURIComponent(note.id)).then(function (d) { openNoteEditor(body, d.note, null); })
          .catch(function (e) { toast('打开编辑失败：' + e.message); });
      });
      document.getElementById('noteDel').addEventListener('click', function () {
        showConfirm({ title: '删除这篇笔记？', text: '删除后无法恢复。', okText: '删除', danger: true }).then(function (ok) {
          if (!ok) return;
          AtlasUser.json('/api/notes/' + encodeURIComponent(note.id), 'DELETE').then(function () {
            toast('已删除');
            loadUserNotesList().then(function () { renderNotesHome(body); });
          }).catch(function (e) { toast('删除失败：' + e.message); });
        });
      });
    }
  }
  function openNoteEditor(body, note, presetGroup) {
    notesState.view = 'edit';
    subBackHook = function () { renderNotesHome(body); return true; };
    var groups = notesGroupList();
    var curGroup = note ? note.chapter : (presetGroup || (groups[0] && groups[0].id) || '');
    var types = ['笔记', '基础知识', '方法', '公式', '错题', '作文模板'];
    body.innerHTML =
      '<label class="f-label">章节</label><select class="f-select" id="neChapter">' + groups.map(function (g) { return '<option value="' + esc(g.id) + '"' + (g.id === curGroup ? ' selected' : '') + '>' + esc(g.subject + ' · ' + g.title) + '</option>'; }).join('') + '</select>' +
      '<label class="f-label">类型</label><select class="f-select" id="neType">' + types.map(function (t) { return '<option' + (note && note.type === t ? ' selected' : '') + '>' + t + '</option>'; }).join('') + '</select>' +
      '<label class="f-label">标题</label><input class="f-input" id="neTitle" maxlength="80" placeholder="例如：我的极限计算错题" value="' + esc(note ? note.title : '') + '">' +
      '<label class="f-label">内容（Markdown，公式用 $...$ 或 $$...$$）</label><textarea class="f-input f-textarea" id="neBody" placeholder="写下你的笔记…">' + esc(note ? (note.markdown || '') : '') + '</textarea>' +
      '<button class="btn-main" id="neSave" type="button" style="margin-top:14px">保存笔记</button>';
    document.getElementById('neSave').addEventListener('click', function () {
      var payload = {
        chapter: document.getElementById('neChapter').value,
        type: document.getElementById('neType').value,
        title: document.getElementById('neTitle').value.trim(),
        markdown: document.getElementById('neBody').value
      };
      if (!payload.title || !payload.markdown.trim()) { toast('标题和内容不能为空'); return; }
      var btn = this;
      btn.disabled = true;
      var req = note ? AtlasUser.json('/api/notes/' + encodeURIComponent(note.id), 'PUT', payload) : AtlasUser.json('/api/notes', 'POST', payload);
      req.then(function (d) {
        toast('已保存');
        loadUserNotesList().then(function () {
          var saved = d && d.note;
          if (saved && saved.id) openNoteReader(body, saved.chapter, saved.id, true);
          else renderNotesHome(body);
        });
      }).catch(function (e) { toast('保存失败：' + e.message); btn.disabled = false; });
    });
  }
  /* 轻量 Markdown 渲染（我的笔记用）：标题/列表/引用/代码/粗斜体/链接/图片 + 公式占位保护 */
  function mdToHtmlLite(md) {
    var stash = [];
    var s = String(md || '').replace(/\r\n/g, '\n');
    s = s.replace(/\$\$([\s\S]+?)\$\$/g, function (_, m) { stash.push('\\[' + esc(m.trim()) + '\\]'); return '\u0000M' + (stash.length - 1) + '\u0000'; });
    s = s.replace(/\$([^$\n]+?)\$/g, function (_, m) { stash.push('\\(' + esc(m.trim()) + '\\)'); return '\u0000M' + (stash.length - 1) + '\u0000'; });
    function inline(t) {
      t = esc(t);
      t = t.replace(/`([^`]+)`/g, '<code>$1</code>');
      t = t.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
      t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
      t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2">');
      t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
      return t;
    }
    var out = [], inUl = false, inOl = false, inCode = false, codeBuf = [];
    function closeLists() { if (inUl) { out.push('</ul>'); inUl = false; } if (inOl) { out.push('</ol>'); inOl = false; } }
    s.split('\n').forEach(function (ln) {
      if (/^```/.test(ln)) {
        if (inCode) { out.push('<pre><code>' + esc(codeBuf.join('\n')) + '</code></pre>'); codeBuf = []; inCode = false; }
        else { closeLists(); inCode = true; }
        return;
      }
      if (inCode) { codeBuf.push(ln); return; }
      var m;
      if ((m = /^(#{1,4})\s+(.*)$/.exec(ln))) { closeLists(); var lv = Math.min(4, m[1].length + 1); out.push('<h' + lv + '>' + inline(m[2]) + '</h' + lv + '>'); return; }
      if (/^\s*(-{3,}|\*{3,})\s*$/.test(ln)) { closeLists(); out.push('<hr>'); return; }
      if ((m = /^>\s?(.*)$/.exec(ln))) { closeLists(); out.push('<blockquote>' + inline(m[1]) + '</blockquote>'); return; }
      if ((m = /^\s*[-*·]\s+(.*)$/.exec(ln))) { if (!inUl) { closeLists(); out.push('<ul>'); inUl = true; } out.push('<li>' + inline(m[1]) + '</li>'); return; }
      if ((m = /^\s*\d+[.、]\s+(.*)$/.exec(ln))) { if (!inOl) { closeLists(); out.push('<ol>'); inOl = true; } out.push('<li>' + inline(m[1]) + '</li>'); return; }
      if (!ln.trim()) { closeLists(); return; }
      closeLists();
      out.push('<p>' + inline(ln) + '</p>');
    });
    if (inCode) out.push('<pre><code>' + esc(codeBuf.join('\n')) + '</code></pre>');
    closeLists();
    return out.join('\n').replace(/\u0000M(\d+)\u0000/g, function (_, i) { return stash[+i]; });
  }

  /* ---------- 小说式阅读器 ----------
   * 结构来自 assets/data.js（window.ATLAS），正文按章懒加载 web/<章节id>.js
   * （window.ATLAS_CH，与网页版阅读器同一份讲义）。全屏沉浸阅读：
   * 左侧抽屉目录（章 + 当前章考点锚点）、底部上一章/下一章、字号三档、阅读进度。 */
  var scriptCache = {};
  function loadScript(src) {
    if (scriptCache[src]) return scriptCache[src];
    scriptCache[src] = new Promise(function (resolve, reject) {
      var sc = document.createElement('script');
      sc.src = src;
      sc.onload = resolve;
      sc.onerror = reject;
      document.head.appendChild(sc);
    });
    return scriptCache[src];
  }
  var atlasData = null;
  function ensureAtlas() {
    if (atlasData) return Promise.resolve(atlasData);
    return loadScript('assets/data.js').then(function () {
      atlasData = window.ATLAS || null;
      return atlasData;
    });
  }
  var chPending = {};
  function ensureChapterContent(id) {
    if (window.ATLAS_CH && window.ATLAS_CH[id]) return Promise.resolve(window.ATLAS_CH[id]);
    if (chPending[id]) return chPending[id];
    chPending[id] = loadScript('web/' + encodeURIComponent(id) + '.js').then(function () {
      var ch = (window.ATLAS_CH || {})[id];
      delete chPending[id];
      if (!ch) throw new Error('讲义加载失败');
      return ch;
    }).catch(function (e) { delete chPending[id]; throw e; });
    return chPending[id];
  }
  function resolveChapterMeta(subjectId, key, title) {
    if (!atlasData) return null;
    var subj = (atlasData.subjects || []).filter(function (s) { return s.id === subjectId; })[0];
    if (!subj) return null;
    var chs = subj.chapters || [];
    var found = chs.filter(function (c) { return c.id === key; })[0]
      || chs.filter(function (c) { return c.title === title; })[0]
      || chs.filter(function (c) { return title && (c.title.indexOf(title) >= 0 || title.indexOf(c.title) >= 0); })[0];
    return found ? { subject: subj, chapter: found } : null;
  }

  var reader = { subject: null, meta: null, content: null, fontIdx: 1 };
  var FONT_SIZES = [16, 17.5, 19];
  var FONT_LABELS = ['字号·小', '字号·标准', '字号·大'];
  try {
    var savedFont = parseInt(localStorage.getItem('atlas.app.readerFont') || '1', 10);
    if (!isNaN(savedFont)) reader.fontIdx = Math.min(2, Math.max(0, savedFont));
  } catch (_) { /* 忽略 */ }
  function applyFont() {
    $('#readerArticle').style.fontSize = FONT_SIZES[reader.fontIdx] + 'px';
    $('#readerFontBtn').textContent = FONT_LABELS[reader.fontIdx];
  }
  $('#readerFontBtn').addEventListener('click', function () {
    reader.fontIdx = (reader.fontIdx + 1) % FONT_SIZES.length;
    try { localStorage.setItem('atlas.app.readerFont', String(reader.fontIdx)); } catch (_) { /* 忽略 */ }
    applyFont();
  });

  function wireReaderBank(article) {
    // 逐考点按钮取消：阅读器只保留底部「练本章题」（章级）。
    $$('.kp-bank', article).forEach(function (x) { x.remove(); });
  }
  function renderReaderMath(article) {
    try {
      if (window.AtlasKatex && window.AtlasKatex.render) { window.AtlasKatex.render(article); return; }
      if (window.renderMathInElement) {
        window.renderMathInElement(article, {
          delimiters: [
            { left: '\\(', right: '\\)', display: false },
            { left: '\\[', right: '\\]', display: true }
          ],
          throwOnError: false
        });
      }
    } catch (_) { /* 公式渲染失败时保留原文 */ }
  }
  function jumpToKp(kpId) {
    if (!kpId) return;
    var t = document.getElementById(kpId);
    if (!t) {
      t = $$('#readerArticle [id]').filter(function (n) {
        return n.id && n.id.slice(-kpId.length) === kpId;
      })[0] || null;
    }
    if (t) setTimeout(function () { t.scrollIntoView({ block: 'start' }); }, 80);
  }
  function openReader(subjectId, chapterKey, chapterTitle, kpId) {
    $('#readerView').hidden = false;
    document.body.style.overflow = 'hidden';
    $('#readerArticle').innerHTML = '<div class="reader-loading">正在打开讲义…</div>';
    $('#readerTitle').textContent = chapterTitle || '章节阅读';
    closeDrawer();
    ensureAtlas().then(function () {
      var resolved = resolveChapterMeta(subjectId, chapterKey, chapterTitle);
      if (!resolved) throw new Error('未找到这一章');
      reader.subject = resolved.subject;
      reader.meta = resolved.chapter;
      return ensureChapterContent(resolved.chapter.id);
    }).then(function (content) {
      reader.content = content;
      paintReader(kpId);
    }).catch(function () {
      $('#readerArticle').innerHTML = '<div class="reader-loading">讲义加载失败，检查网络后重试。</div>';
    });
  }
  function paintReader(kpId) {
    var ch = reader.content, meta = reader.meta;
    $('#readerTitle').textContent = (ch.subjectName || (reader.subject && reader.subject.name) || '') + ' · ' + (ch.title || (meta && meta.title) || '');
    var article = $('#readerArticle');
    article.innerHTML = ch.html || '<div class="reader-loading">这一章暂无讲义内容。</div>';
    wireReaderBank(article);
    renderReaderMath(article);
    applyFont();
    paintNavBtn($('#readerPrev'), ch.prev, '上一章');
    paintNavBtn($('#readerNext'), ch.next, '下一章');
    var pr = $('#readerPractice');
    var pSub = (reader.subject && reader.subject.id) || ch.subject || '';
    var pCh = (meta && meta.id) || ch.id || '';
    if (pSub && pCh) { pr.href = 'practice.html?subject=' + encodeURIComponent(pSub) + '&chapter=' + encodeURIComponent(pCh); pr.hidden = false; }
    else pr.hidden = true;
    $('#readerBody').scrollTop = 0;
    $('#readerProgressBar').style.width = '0%';
    buildDrawer();
    if (kpId) jumpToKp(kpId);
  }
  function paintNavBtn(btn, target, label) {
    if (target && target.id) {
      btn.disabled = false;
      btn.textContent = label + ' · ' + (target.title || '');
      btn.onclick = function () { openReader(reader.subject.id, target.id, target.title, null); };
    } else {
      btn.disabled = true;
      btn.textContent = '没有' + label;
      btn.onclick = null;
    }
  }
  function buildDrawer() {
    if (!reader.subject || !reader.meta) return;
    $('#drawerHead').textContent = (reader.subject.name || '') + ' · 目录';
    var cur = reader.meta.id;
    $('#drawerList').innerHTML = (reader.subject.chapters || []).map(function (c) {
      var on = c.id === cur;
      var kps = '';
      if (on && c.kps && c.kps.length) {
        kps = '<div class="drawer-kps">' + c.kps.map(function (k) {
          return '<button type="button" class="drawer-kp" data-kp="' + esc(k.id) + '">' + esc(k.name) + '</button>';
        }).join('') + '</div>';
      }
      return '<button type="button" class="drawer-ch' + (on ? ' on' : '') + '" data-ch="' + esc(c.id) + '" data-title="' + esc(c.title) + '"><span class="no">' + esc(c.no || '') + '</span><span>' + esc(c.title) + '</span></button>' + kps;
    }).join('');
    $$('#drawerList [data-ch]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.dataset.ch === cur) { closeDrawer(); return; }
        openReader(reader.subject.id, b.dataset.ch, b.dataset.title, null);
      });
    });
    $$('#drawerList [data-kp]').forEach(function (b) {
      b.addEventListener('click', function () { closeDrawer(); jumpToKp(b.dataset.kp); });
    });
  }
  function openDrawer() { $('#readerDrawer').classList.add('open'); $('#readerScrim').hidden = false; }
  function closeDrawer() {
    var d = $('#readerDrawer');
    if (d) d.classList.remove('open');
    var sc = $('#readerScrim');
    if (sc) sc.hidden = true;
  }
  $('#readerTocBtn').addEventListener('click', openDrawer);
  $('#readerScrim').addEventListener('click', closeDrawer);
  $('#readerBack').addEventListener('click', function () {
    $('#readerView').hidden = true;
    document.body.style.overflow = '';
  });
  $('#readerBody').addEventListener('scroll', function () {
    var b = $('#readerBody');
    var max = b.scrollHeight - b.clientHeight;
    $('#readerProgressBar').style.width = (max > 0 ? Math.min(100, Math.round(b.scrollTop / max * 100)) : 0) + '%';
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
        state.attempts = r.attempts || r || [];
        renderRecent(state.attempts);
      }).catch(function () {
        $('#recentEmpty').textContent = '成绩加载失败，稍后重试。';
      });
    }).catch(function () {
      location.replace('login.html');
    });
  }
  boot();
})();
