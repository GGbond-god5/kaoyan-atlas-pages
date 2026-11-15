/* 首页 AI 向导「小观」：功能引导 + 解题答疑，支持上传题目照片。走 /api/coach（context.source = 'home-guide'），后端使用 GUIDE_SYSTEM 并以真实多轮消息调用视觉模型。 */
(function () {
  'use strict';
  var msgs = [], cid = null, image = null, busy = false, els = {};

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(s) { return esc(window.AtlasPlain ? window.AtlasPlain.clean(s) : s); }
  function math(el) { if (window.AtlasKatex && window.AtlasKatex.render) { window.AtlasKatex.render(el); return; } if (window.renderMathInElement) { try { window.renderMathInElement(el, { delimiters: [{ left: '\\(', right: '\\)', display: false }, { left: '\\[', right: '\\]', display: true }] }); } catch (e) {} } }
  function addMsg(role, text, img) {
    var d = document.createElement('div');
    d.className = 'gd-msg ' + (role === 'user' ? 'u' : 'a');
    d.innerHTML = fmt(text || '') + (img ? '<img alt="题目照片" src="' + img + '">' : '');
    els.msgs.appendChild(d); math(d);
    els.msgs.scrollTop = els.msgs.scrollHeight;
    return d;
  }
  function compress(file, cb) {
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
  function send(text) {
    text = (text != null ? text : els.input.value).trim();
    if (busy || (!text && !image)) return;
    var myImage = image;
    addMsg('user', text, myImage);
    msgs.push({ role: 'user', content: text || '请看这张题目照片，帮我解这道题。', images: myImage ? [myImage] : undefined });
    image = null; els.preview.style.display = 'none'; els.input.value = '';
    busy = true; els.send.disabled = true;
    var think = addMsg('assistant', '小观思考中…'); think.classList.add('think');
    AtlasUser.json('/api/coach', 'POST', { conversationId: cid || undefined, context: { source: 'home-guide' }, messages: msgs.slice(-20) })
      .then(function (r) {
        cid = r.conversationId || cid;
        think.remove();
        addMsg('assistant', r.reply || '（没有收到回复，请再试一次）');
        msgs.push({ role: 'assistant', content: r.reply || '' });
      })
      .catch(function (e) {
        think.remove();
        addMsg('assistant', '刚才没连上：' + (e.message || '请稍后再试') + '。可以检查网络后再发一次。');
        msgs.pop();
      })
      .finally(function () { busy = false; els.send.disabled = false; els.input.focus(); });
  }
  function build() {
    var fab = document.createElement('button');
    fab.className = 'gd-fab'; fab.type = 'button';
    fab.innerHTML = '<span class="m">观</span>AI 向导';
    document.body.appendChild(fab);
    var p = document.createElement('section');
    p.className = 'gd-panel'; p.style.display = 'none';
    p.setAttribute('aria-label', 'AI 向导');
    p.innerHTML = '<div class="gd-head"><span class="m">观</span><div><b>小观 · AI 向导</b><small>功能引导 · 解题答疑</small></div><button type="button" class="gd-close" aria-label="关闭">✕</button></div>'
      + '<div class="gd-msgs"></div>'
      + '<div class="gd-chips"><button type="button" class="gd-chip">怎么上传自己的资料？</button><button type="button" class="gd-chip">套卷分析在哪看？</button><button type="button" class="gd-chip">拍照发题给我，我来解</button></div>'
      + '<div class="gd-input"><div class="gd-preview"><img alt="待发送图片预览"><button type="button">移除图片</button></div>'
      + '<div class="gd-row"><button type="button" class="gd-icon" title="上传题目照片">图片</button><textarea rows="1" placeholder="问功能，或把题目打出来 / 拍照发我…"></textarea><button type="button" class="gd-send">发送</button></div>'
      + '<input type="file" accept="image/*" hidden></div>';
    document.body.appendChild(p);
    els = { panel: p, msgs: p.querySelector('.gd-msgs'), input: p.querySelector('textarea'), send: p.querySelector('.gd-send'), preview: p.querySelector('.gd-preview'), file: p.querySelector('input[type=file]') };
    fab.addEventListener('click', function () {
      p.style.display = 'flex'; fab.style.display = 'none';
      if (!msgs.length) addMsg('assistant', '你好，我是小观。可以问我站内功能怎么用（比如上传资料、看套卷分析），也可以直接发题目——打字或点「图片」拍照，我按步骤给你讲。');
      els.input.focus();
    });
    p.querySelector('.gd-close').addEventListener('click', function () { p.style.display = 'none'; fab.style.display = 'inline-flex'; });
    p.querySelectorAll('.gd-chip').forEach(function (ch) { ch.addEventListener('click', function () { send(ch.textContent.replace('拍照发题给我，我来解', '我想拍照发题，你会怎么帮我？')); }); });
    els.send.addEventListener('click', function () { send(); });
    els.input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
    p.querySelector('.gd-icon').addEventListener('click', function () { els.file.click(); });
    els.file.addEventListener('change', function () {
      var f = els.file.files && els.file.files[0]; els.file.value = '';
      if (!f) return;
      compress(f, function (d) {
        if (!d) { addMsg('assistant', '这张图片没读出来，换一张试试。'); return; }
        image = d;
        els.preview.querySelector('img').src = d;
        els.preview.style.display = 'flex';
      });
    });
    els.preview.querySelector('button').addEventListener('click', function () { image = null; els.preview.style.display = 'none'; });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
