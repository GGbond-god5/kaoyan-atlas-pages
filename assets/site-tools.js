(function () {
  'use strict';
  const FEEDBACK_EMAIL = '15398831795@163.com';
  const header = document.querySelector('header');
  if (!header) return;
  const group = document.createElement('div'); group.className = 'atlas-tools';
  group.innerHTML = '<a href="library.html">我的资料</a><button type="button">意见反馈</button>';
  (header.querySelector('.actions') || header).appendChild(group);
  const modal = document.createElement('div'); modal.className = 'atlas-feedback'; modal.hidden = true;
  modal.innerHTML = `<div class="atlas-feedback-box" role="dialog" aria-modal="true" aria-labelledby="feedbackTitle"><h2 id="feedbackTitle">意见反馈</h2><p>填写后将在你的邮件应用中生成草稿，由你决定是否发送。</p><form><label>类型<select name="type"><option>功能建议</option><option>内容勘误</option><option>使用问题</option><option>其他</option></select></label><label>反馈内容<textarea name="message" required rows="6"></textarea></label><label>联系方式（选填）<input name="contact"></label><div class="atlas-feedback-actions"><button type="button" data-close>取消</button><button type="submit">打开邮件草稿</button></div></form><p class="atlas-feedback-alt">设备上没有邮件应用也可以直接写信到 <a href="mailto:${FEEDBACK_EMAIL}">${FEEDBACK_EMAIL}</a> <button type="button" data-copy>复制地址</button></p></div>`;
  document.body.appendChild(modal);
  const opener = group.querySelector('button'), form = modal.querySelector('form');
  const copyBtn = modal.querySelector('[data-copy]');
  function flashCopy(text) {
    if (!copyBtn) return;
    if (!copyBtn.dataset.label) copyBtn.dataset.label = copyBtn.textContent;
    copyBtn.textContent = text;
    setTimeout(() => { copyBtn.textContent = copyBtn.dataset.label; }, 1600);
  }
  function fallbackCopy() {
    const box = document.createElement('textarea');
    box.value = FEEDBACK_EMAIL;
    box.setAttribute('readonly', '');
    box.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(box);
    box.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    box.remove();
    flashCopy(ok ? '已复制' : '请手动复制');
  }
  copyBtn && copyBtn.addEventListener('click', () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(FEEDBACK_EMAIL).then(() => flashCopy('已复制'), fallbackCopy);
    } else fallbackCopy();
  });
  function close() { modal.hidden = true; opener.focus(); }
  opener.addEventListener('click', () => { modal.hidden = false; form.elements.type.focus(); });
  modal.addEventListener('click', e => { if (e.target === modal || e.target.closest('[data-close]')) close(); });
  modal.addEventListener('keydown', e => {
    if (e.key === 'Escape') { close(); return; }
    if (e.key !== 'Tab') return;
    const nodes = [...modal.querySelectorAll('select,textarea,input,button')];
    if (e.shiftKey && document.activeElement === nodes[0]) { e.preventDefault(); nodes[nodes.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === nodes[nodes.length - 1]) { e.preventDefault(); nodes[0].focus(); }
  });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const subject = '考研大观反馈：' + form.elements.type.value;
    const body = form.elements.message.value + '\n\n联系方式：' + (form.elements.contact.value || '未填写');
    location.href = 'mailto:' + FEEDBACK_EMAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    close();
  });
})();
