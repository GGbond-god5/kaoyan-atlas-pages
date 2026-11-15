/* 自带 API 配置：模式（系统内置 / 我的 API）、接口地址、模型、密钥。
 * 密钥只存本机浏览器 localStorage，调用时通过请求头即时发送，服务器只转发不存储。
 * 本文件会给 /api/grade、/api/coach、/api/attempts/<id>/grade、/api/ai/test 的请求自动附上配置头。 */
(function () {
  'use strict';
  var KEY = 'atlasAiCfg.v1';
  var PRESETS = [
    { name: '自定义', base: '', model: '' },
    { name: '通义千问（阿里云百炼）', base: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen3-vl-plus' },
    { name: 'DeepSeek', base: 'https://api.deepseek.com', model: 'deepseek-chat' },
    { name: 'OpenAI', base: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    { name: '月之暗面 Kimi', base: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
    { name: '智谱 GLM', base: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
    { name: '硅基流动', base: 'https://api.siliconflow.cn/v1', model: 'Qwen/Qwen2.5-72B-Instruct' }
  ];
  function get() {
    try {
      var c = JSON.parse(localStorage.getItem(KEY) || '{}');
      return { mode: c.mode === 'user' ? 'user' : 'builtin', base: c.base || '', model: c.model || '', key: c.key || '' };
    } catch (_) { return { mode: 'builtin', base: '', model: '', key: '' }; }
  }
  function set(c) { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (_) {} }
  function headers() {
    var c = get();
    if (c.mode !== 'user' || !c.base || !c.key || !c.model) return null;
    return { 'x-ai-mode': 'user', 'x-ai-base': c.base, 'x-ai-key': c.key, 'x-ai-model': c.model };
  }
  var origFetch = window.fetch;
  if (origFetch && !window.__atlasAiPatched) {
    window.__atlasAiPatched = true;
    window.fetch = function (input, init) {
      try {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        if (/\/api\/(grade|coach|ai\/test)/.test(url) || /\/api\/attempts\/[^/]+\/grade/.test(url)) {
          var h = headers();
          if (h) {
            init = init || {};
            var hd = new Headers(init.headers || (typeof input !== 'string' && input.headers) || {});
            Object.keys(h).forEach(function (k) { hd.set(k, h[k]); });
            init = Object.assign({}, init, { headers: hd });
          }
        }
      } catch (_) {}
      return origFetch.call(this, input, init);
    };
  }
  function ensureStyle() {
    if (document.getElementById('atlasAiCfgStyle')) return;
    var st = document.createElement('style');
    st.id = 'atlasAiCfgStyle';
    st.textContent = '.aicfg{border:1px solid #E7DFC9;border-radius:12px;padding:14px;margin-top:14px;background:#FFFDF6}' +
      '.aicfg h4{margin:0 0 4px;font-size:15px}.aicfg .aicfg-note{font-size:12.5px;color:#8A8172;line-height:1.6;margin:6px 0}' +
      '.aicfg-modes{display:flex;gap:8px;margin:10px 0}.aicfg-mode{flex:1;border:1px solid #D9CFB4;background:#fff;border-radius:10px;padding:9px;cursor:pointer;font-size:14px}' +
      '.aicfg-mode.on{background:#B8860B;border-color:#B8860B;color:#fff;font-weight:700}' +
      '.aicfg label{display:block;font-size:12.5px;color:#8A8172;margin:10px 0 4px}' +
      '.aicfg input,.aicfg select{width:100%;box-sizing:border-box;border:1px solid #D9CFB4;border-radius:9px;padding:9px 10px;font-size:14px;background:#fff}' +
      '.aicfg-btns{display:flex;gap:8px;margin-top:12px}.aicfg-btns button{flex:1;border-radius:9px;padding:9px;cursor:pointer;font-size:14px}' +
      '.aicfg-save{background:#B8860B;border:1px solid #B8860B;color:#fff;font-weight:700}.aicfg-test{background:#fff;border:1px solid #D9CFB4}' +
      '.aicfg-status{font-size:13px;margin-top:10px;line-height:1.6}.aicfg-user-fields.hidden{display:none}';
    document.head.appendChild(st);
  }
  function renderSettings(root) {
    if (!root) return;
    ensureStyle();
    var c = get();
    root.innerHTML = '<div class="aicfg"><h4>AI 接口</h4>' +
      '<p class="aicfg-note">批改、小观和教学分析用的 AI。可以继续用系统内置的，也可以换成你自己的 API（OpenAI 兼容接口都支持）。用自己的 API 不消耗站内每日额度。</p>' +
      '<div class="aicfg-modes"><button type="button" class="aicfg-mode" data-aicfg-mode="builtin">系统内置</button>' +
      '<button type="button" class="aicfg-mode" data-aicfg-mode="user">我的 API</button></div>' +
      '<div class="aicfg-user-fields">' +
      '<label>服务商预设</label><select class="aicfg-preset">' + PRESETS.map(function (p, i) { return '<option value="' + i + '">' + p.name + '</option>'; }).join('') + '</select>' +
      '<label>接口地址（Base URL）</label><input class="aicfg-base" type="url" placeholder="https://…/v1" autocomplete="off">' +
      '<label>模型名称</label><input class="aicfg-model" type="text" placeholder="如 qwen3-vl-plus" autocomplete="off">' +
      '<label>API 密钥（Key）</label><input class="aicfg-key" type="password" placeholder="sk-…" autocomplete="off">' +
      '<p class="aicfg-note">密钥只保存在这台设备的浏览器里，不会上传到服务器存储；每次调用时随请求即时转发，用完不留存。换设备需要重新填。批改照片需要支持图片的模型（如 qwen3-vl-plus、gpt-4o 系列）；纯文本模型只能批改手写文字转录之外的文本作答与咨询。</p>' +
      '</div>' +
      '<div class="aicfg-btns"><button type="button" class="aicfg-save">保存设置</button><button type="button" class="aicfg-test">测试连接</button></div>' +
      '<div class="aicfg-status"></div></div>';
    var mode = c.mode;
    var modeBtns = root.querySelectorAll('[data-aicfg-mode]');
    var fields = root.querySelector('.aicfg-user-fields');
    var baseIn = root.querySelector('.aicfg-base'), modelIn = root.querySelector('.aicfg-model'), keyIn = root.querySelector('.aicfg-key');
    var presetSel = root.querySelector('.aicfg-preset'), status = root.querySelector('.aicfg-status');
    baseIn.value = c.base; modelIn.value = c.model; keyIn.value = c.key;
    function paintMode() {
      modeBtns.forEach(function (b) { b.classList.toggle('on', b.dataset.aicfgMode === mode); });
      fields.classList.toggle('hidden', mode !== 'user');
    }
    modeBtns.forEach(function (b) { b.addEventListener('click', function () { mode = b.dataset.aicfgMode; paintMode(); }); });
    presetSel.addEventListener('change', function () {
      var p = PRESETS[Number(presetSel.value) || 0];
      if (p.base) { baseIn.value = p.base; modelIn.value = p.model; }
    });
    function collect() { return { mode: mode, base: baseIn.value.trim(), model: modelIn.value.trim(), key: keyIn.value.trim() }; }
    root.querySelector('.aicfg-save').addEventListener('click', function () {
      var v = collect();
      if (v.mode === 'user' && (!v.base || !v.model || !v.key)) { status.textContent = '用自己的 API 需要把接口地址、模型和密钥都填好。'; return; }
      set(v);
      status.textContent = v.mode === 'user' ? '已保存：后续批改与咨询走你的 API（' + v.model + '）。' : '已保存：使用系统内置 API。';
    });
    root.querySelector('.aicfg-test').addEventListener('click', function () {
      var v = collect();
      if (v.mode === 'user' && (!v.base || !v.model || !v.key)) { status.textContent = '先把接口地址、模型和密钥填好再测试。'; return; }
      set(v);
      status.textContent = '正在测试连接…';
      fetch('/api/ai/test', { method: 'POST', credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (d) {
        if (d && d.ok !== false && (d.reply || d.model)) status.textContent = '连接正常：' + (d.custom ? '你的 API' : '系统内置') + ' · 模型 ' + (d.model || '') + (d.ms ? ' · ' + d.ms + ' ms' : '') + (d.reply ? ' · 回复「' + d.reply + '」' : '');
        else status.textContent = '测试失败：' + ((d && d.error) || '未知错误');
      }).catch(function (e) { status.textContent = '测试失败：' + e.message; });
    });
    paintMode();
  }
  window.AtlasAiCfg = { get: get, set: set, headers: headers, renderSettings: renderSettings, presets: PRESETS };
})();
