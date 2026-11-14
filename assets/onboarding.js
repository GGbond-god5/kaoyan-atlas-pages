/* 新手功能引导：登录后首次进入首页强制走一遍（状态存服务端 state/onboarding，按账号走，换设备不重复；新注册账号必然是新状态）。每一步都提供「我是老手，跳过教程」。首页「功能引导」按钮或 ?tour=1 可重看。 */
(function () {
  'use strict';
  var STEPS = [
    { t: '欢迎来到考研科目大观', b: '这里按<b>你的目标院校与专业</b>组织真题、考点和复习进度。花一分钟，认识六个你每天都会用到的地方。' },
    { t: '第一步：先定档案', b: '点右上角<b>「档案」</b>，搜学校 + 专业代码（例如华南理工 085500），考试科目、倒计时会自动对齐。目录里没有的专业课，可以在档案里<b>自建科目</b>。' },
    { t: '图谱：按考点学', b: '首页图谱按<b>科目 → 章节 → 考点</b>组织，点任意考点就能直达题库里对应的题目，学练不脱节。' },
    { t: '刷题：三种模式 + AI 批改', b: '<b>按知识点练、整套卷、诊断测</b>三种模式。主观题可以<b>拍照上传</b>，AI 按步骤给分，告诉你分丢在哪一步、怎么改。' },
    { t: '套卷分析：看清薄弱点', b: '做完套卷来<b>「套卷分析」</b>：每套的错题号、薄弱知识点榜、题型得分率和提升建议一目了然，还能让 AI 教练结合你的数据再总结。' },
    { t: '资料库：用你自己的资料', b: '点<b>「笔记库 / 资料」</b>上传讲义、真题 PDF，按页抽题进你的个人题库；资料可以<b>打分类</b>，专业课资料记得选你的自建科目。' },
    { t: '单词与错题：跟着账号走', b: '词汇按遗忘曲线复习，错题会回流到练习里。所有进度都绑定你的<b>手机号账号</b>，换设备登录也不会丢。拿不准时，点右下角<b>「AI 向导」</b>直接问它，还能拍照发题让它讲。开始吧！' }
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
