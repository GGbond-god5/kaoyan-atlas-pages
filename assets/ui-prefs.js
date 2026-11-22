/* 首页扩展功能开关：学习计划 / 每日一题 / 顶栏搜索。（考试节点轴是首页固定组成部分，不设开关。）
 * 这些都是不影响基本功能的扩展项，开关在头像菜单「账号设置 → 功能开关」里，
 * 状态存 localStorage（atlas.uiprefs），通过一段注入的 CSS 控制显隐，
 * 与各卡片自身的渲染时机无关（元素出现即按开关状态显示或隐藏）。 */
(function () {
  'use strict';
  var KEY = 'atlas.uiprefs';
  var SELECTORS = {
    plan: '#planCard, #planSlot',
    daily: '#dailyCard, #dailyTab',
    search: '.top-search'
  };
  function get() {
    var p = { plan: 1, daily: 1, search: 1 };
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || '{}');
      Object.keys(p).forEach(function (k) { if (raw[k] === 0) p[k] = 0; });
    } catch (e) {}
    return p;
  }
  function apply() {
    var p = get();
    var css = Object.keys(SELECTORS).filter(function (k) { return !p[k]; })
      .map(function (k) { return SELECTORS[k] + ' { display: none !important; }'; }).join('\n');
    var st = document.getElementById('uiprefsStyle');
    if (!st) {
      st = document.createElement('style');
      st.id = 'uiprefsStyle';
      document.head.appendChild(st);
    }
    st.textContent = css;
  }
  function set(key, on) {
    if (!SELECTORS[key]) return;
    var p = get();
    p[key] = on ? 1 : 0;
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) {}
    apply();
  }
  window.AtlasUiPrefs = { get: get, set: set, apply: apply, KEYS: Object.keys(SELECTORS) };
  apply();
})();
