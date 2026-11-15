/* 新手功能引导：登录后首次进入首页强制走一遍（状态存服务端 state/onboarding，按账号走，换设备不重复；新注册账号必然是新状态）。每一步都提供「我是老手，跳过教程」。首页「功能引导」按钮或 ?tour=1 可重看。 */
(function () {
  'use strict';
  var STEPS = [
    { t: '欢迎来到考研科目大观', b: '这里按<b>你的目标院校与专业</b>组织真题、讲义和复习进度。先记住三个入口：点左上角<b>「观」图标</b>打开<b>学习中心侧边栏</b>（学习计划、学情、目录都在里面）；顶栏<b>搜索框</b>能直达知识点和功能；顶栏<b>铃铛</b>汇集意见反馈、公告和消息通知，有新消息会亮红点。' },
    { t: '第一步：先定档案', b: '点右上角<b>头像</b>打开账号面板，在<b>「编辑档案」</b>里搜学校 + 专业代码（例如华南理工 085500），考试科目与倒计时会自动对齐；目录里没有的专业课可以<b>自建科目</b>。头像就是你的账号入口，设置都在里面。' },
    { t: '知识库：读讲义，按章练题', b: '首页图谱与侧边栏<b>目录</b>按<b>科目 → 章节 → 考点</b>组织，点章节读讲义；每个知识点不再单独设入口，读完一章用章末的<b>「刷本章题」</b>整章练。顶栏搜索框输入考点名也能直达讲义对应位置。' },
    { t: '刷题：三种模式 + AI 批改', b: '<b>按知识点练、整套卷、全真模考</b>三种模式（模考 180 分钟倒计时、纯净模式防打扰）。主观题<b>拍照上传</b>，AI 按考研改卷规范逐步给分；交卷后可以离开页面，<b>批改在后台继续</b>，改完会在消息里提醒你，点消息直达那套卷的评分。交卷结果页还有<b>分科能力雷达图</b>：六个指标按科目区分（数学是概念、方法、计算、审题、规范、综合；807 是平衡、协调、公式、边界、量纲、校核），弱在哪项一目了然。' },
    { t: '学情分析：详情、教学分析与收藏', b: '在<b>「学情分析」</b>（侧边栏有学情速览，点「完整分析」进入）先看<b>得分率折线走势图</b>（同一科目内对比）和<b>各科对比柱状图</b>，再点任意一套进入<b>做题详情</b>：逐题看参考答案、解析、得分点和作文指导；点<b>「AI 教学分析」</b>按考点归组错因、给复盘动作；值得回头的题可以<b>☆收藏</b>或<b>＋加入错题本</b>，每套卷还能一键重置二刷。' },
    { t: '错题本：复盘与重练两条路', b: '错题按<b>遗忘曲线</b>到期提醒复盘；错题本里可以<b>全部重练</b>，也能<b>下载打印</b>（带答案版或自测版），收藏的题单独成册。' },
    { t: '学习计划与单词：按你的节奏', b: '侧边栏最上方的<b>学习计划</b>是 7 天全览：每日时长、套卷频率、新题占比、每周休息日、重点科目都能在<b>「计划设置」</b>里自己调；<b>每日单词</b>可设每日新词量，像扇贝一样每天一份任务。' },
    { t: '资料、社区与自己的 API', b: '<b>资料库</b>上传讲义真题抽题进个人题库（可新增科目、在线看原文件）；<b>社区</b>可以发帖交流、共享资料。想用自己的模型？头像 → 账号设置 → <b>「AI 接口」</b>可切换自有 API。所有进度绑定<b>手机号账号</b>，换设备不丢；拿不准时点右下角<b>「AI 向导」</b>问小观。开始吧！' }
  ];
  var done = false, idx = 0, mask = null;

  function finish(skipped) {
    done = true;
    if (mask) { mask.remove(); mask = null; }
    try { localStorage.setItem('atlas_tour_done', '1'); } catch (e) {}
    if (window.AtlasUser && AtlasUser.save) {
      AtlasUser.save('onboarding', { done: true, skipped: !!skipped, at: new Date().toISOString() }).catch(function () {});
    }
  }
  function render() {
    var s = STEPS[idx];
    mask.querySelector('.ob-title').textContent = s.t;
    mask.querySelector('.ob-body').innerHTML = s.b;
    mask.querySelector('.ob-step').textContent = (idx + 1) + ' / ' + STEPS.length;
    mask.querySelector('.ob-prev').style.visibility = idx === 0 ? 'hidden' : 'visible';
    mask.querySelector('.ob-next').textContent = idx === STEPS.length - 1 ? '开始使用' : '下一步';
    var dots = mask.querySelectorAll('.ob-dots i');
    for (var i = 0; i < dots.length; i++) dots[i].className = i <= idx ? 'on' : '';
  }
  function show() {
    if (mask) return;
    mask = document.createElement('div');
    mask.className = 'ob-mask';
    mask.innerHTML = '<div class="ob-card" role="dialog" aria-modal="true" aria-label="功能引导">'
      + '<div class="ob-kicker">功能引导 · ONBOARDING</div>'
      + '<h2 class="ob-title"></h2><p class="ob-body"></p>'
      + '<div class="ob-dots">' + STEPS.map(function () { return '<i></i>'; }).join('') + '</div>'
      + '<div class="ob-foot"><button type="button" class="ob-skip">我是老手，跳过教程</button>'
      + '<span class="ob-step"></span>'
      + '<button type="button" class="ob-btn ghost ob-prev">上一步</button>'
      + '<button type="button" class="ob-btn ob-next">下一步</button></div></div>';
    document.body.appendChild(mask);
    mask.querySelector('.ob-skip').addEventListener('click', function () { finish(true); });
    mask.querySelector('.ob-prev').addEventListener('click', function () { if (idx > 0) { idx--; render(); } });
    mask.querySelector('.ob-next').addEventListener('click', function () {
      if (idx === STEPS.length - 1) finish(false); else { idx++; render(); }
    });
    idx = 0; render();
  }
  window.AtlasTour = { show: show };

  var btn = document.getElementById('tourBtn');
  if (btn) btn.addEventListener('click', show);
  function maybeAuto() {
    var forced = /[?&]tour=1/.test(location.search);
    if (!window.AtlasUser || !AtlasUser.ready) return;
    AtlasUser.ready.then(function () {
      if (forced) { show(); return; }
      AtlasUser.load('onboarding', {}).then(function (st) {
        if (!st || !st.done) show();
      }).catch(function () {
        var local = null;
        try { local = localStorage.getItem('atlas_tour_done'); } catch (e) {}
        if (!local) show();
      });
    }).catch(function () {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', maybeAuto);
  else maybeAuto();
})();
