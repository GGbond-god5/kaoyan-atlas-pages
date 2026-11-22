import * as pdfjs from './pdfjs/pdf.min.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = new URL('./pdfjs/pdf.worker.min.mjs', import.meta.url).href;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const KINDS = ['选择题','单选题','多选题','填空题','计算题','证明题','简答题','分析题','完形','阅读','新题型','翻译','小作文','大作文'];
const BUILTIN_SUBJECTS = {math:'数学一', math2:'数学二', math3:'数学三', english:'英语一', english2:'英语二', mechanics:'材料力学', politics:'政治'};
let mySubjects = {};
const subjectLabel = v => mySubjects[v] || BUILTIN_SUBJECTS[v] || v;
const message = s => { $('#status').textContent = s; };
const normKey = t => String(t || '').replace(/\s+/g, '').toLowerCase();

let selected = null, allFiles = [], allQuestions = [];
let pool = [], poolFilter = 'all', poolQuery = '';
const checkedSet = new Set(), verifiedSet = new Set(), expandedSet = new Set();
const seenDraftIds = new Set();
const saveTimers = {}, saveState = {};

/* ---------------- 资料列表 ---------------- */
async function refresh() {
  const [files, questions] = await Promise.all([AtlasUser.json('/api/library'), AtlasUser.json('/api/personal/questions')]);
  allFiles = files.files;
  allQuestions = questions.items;
  const cats = [...new Set(allFiles.map(f => f.category).filter(Boolean))];
  const dl = $('#categoryList'); if (dl) dl.innerHTML = cats.map(c => `<option value="${esc(c)}">`).join('');
  const ff = $('#fileFilter'); if (ff) { const cur = ff.value; ff.innerHTML = '<option value="">全部分类</option>' + cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('') + '<option value="__none">未分类</option>'; ff.value = cur; }
  renderFiles();
  renderQuestions();
  await loadPool();
}
function renderFiles() {
  const ff = $('#fileFilter'); const want = ff ? ff.value : '';
  const list = allFiles.filter(f => !want || (want === '__none' ? !f.category : f.category === want));
  $('#files').innerHTML = list.length ? list.map(f => `<div class="file"><strong>${esc(f.name)}</strong><small>${esc(subjectLabel(f.subject))}${f.category ? ' · ' + esc(f.category) : ''} · ${(f.size/1048576).toFixed(2)} MiB · ${esc(f.status || '')}</small><div><a href="/api/library/${encodeURIComponent(f.id)}" target="_blank" rel="noopener">查看原文件</a><button data-pick="${esc(f.id)}">选择并抽题</button><button data-del="${esc(f.id)}">删除资料</button></div></div>`).join('') : '<p>该分类下还没有资料。</p>';
  $('#files').querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => { const f = allFiles.find(x => String(x.id) === b.dataset.pick); if (f) selectFile(f); }));
  $('#files').querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => { const f = allFiles.find(x => String(x.id) === b.dataset.del); if (!f) return; if (!confirm(`删除资料「${f.name}」？它抽出的草稿和已导入的题目会一并删除，无法恢复。`)) return; b.disabled = true; try { const out = await AtlasUser.json('/api/library/' + encodeURIComponent(f.id), 'DELETE'); if (selected && String(selected.id) === String(f.id)) { selected = null; $('#extract').hidden = true; } await refresh(); message(`已删除资料${out.questions ? `，连同 ${out.questions} 道已导入题目` : ''}。`); } catch (err) { message('删除失败：' + err.message); b.disabled = false; } }));
}
const fileFilterEl = $('#fileFilter'); if (fileFilterEl) fileFilterEl.addEventListener('change', renderFiles);

/* ---------------- 添加资料（文件 / 粘贴文本共用一条上传通道） ---------------- */
async function ensureSubject(selEl, newNameEl) {
  if (selEl.value !== '__new') return selEl.value;
  const nm = (newNameEl.value || '').trim(); if (!nm) throw Error('请填写新科目名称。');
  const out = await AtlasUser.json('/api/subjects', 'POST', {name: nm});
  mySubjects[out.subject.id] = out.subject.name; addSubjectOption(out.subject);
  return out.subject.id;
}
const LIBRARY_MAX_BYTES = 20 * 1024 * 1024; /* 与服务端 LIBRARY_MAX_BYTES 对齐，全站只此一处口径 */
const CHUNK_BYTES = 4 * 1024 * 1024; /* 与服务端 LIBRARY_CHUNK_BYTES 对齐 */
const UPLOAD_STORE_KEY = 'atlas-upload-resume';
const sleepMs = ms => new Promise(r => setTimeout(r, ms));

async function sha256Of(blob) {
  const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}

/* XHR 版 JSON 请求：fetch 拿不到上传进度，直传与分片都走它。
 * 失败时抛出的 Error 带 status 与 data（409 的 duplicates 等），供上层决定重试或强传。 */
function xhrJson(url, { method = 'GET', body = null, contentType = null, onProgress = null } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.withCredentials = true;
    if (contentType) xhr.setRequestHeader('Content-Type', contentType);
    if (onProgress && xhr.upload) xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(e.loaded, e.total); };
    xhr.onload = () => {
      let j = null; try { j = JSON.parse(xhr.responseText); } catch (_) {}
      if (xhr.status >= 200 && xhr.status < 300 && j && j.ok !== false) return resolve(j);
      const err = Error((j && j.error) || ('请求失败（' + xhr.status + '）'));
      err.status = xhr.status; err.data = j;
      reject(err);
    };
    xhr.onerror = () => { const err = Error('网络中断，没有连上服务器'); err.status = 0; reject(err); };
    xhr.send(body);
  });
}

/* 只对网络错误与 5xx 自动重试（指数退避）；4xx 是业务结论，重试没用。 */
async function withRetry(fn) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await fn(); }
    catch (err) {
      lastErr = err;
      if (err.status && err.status < 500) throw err;
      if (attempt < 2) await sleepMs(800 * 2 ** attempt);
    }
  }
  throw lastErr;
}

/* 断点续传记录：浏览器拿不到上次的 File 句柄，只能按内容哈希认领——
 * 刷新后重新选择同一文件，哈希对上就接着没传完的分片继续。 */
function getResume(sha) { try { return JSON.parse(localStorage.getItem(UPLOAD_STORE_KEY) || '{}')[sha] || null; } catch (_) { return null; } }
function putResume(rec) { try { const s = JSON.parse(localStorage.getItem(UPLOAD_STORE_KEY) || '{}'); s[rec.sha256] = rec; localStorage.setItem(UPLOAD_STORE_KEY, JSON.stringify(s)); } catch (_) {} }
function dropResume(sha) { try { const s = JSON.parse(localStorage.getItem(UPLOAD_STORE_KEY) || '{}'); delete s[sha]; localStorage.setItem(UPLOAD_STORE_KEY, JSON.stringify(s)); } catch (_) {} }

async function uploadBlob(blob, name, subject, category, opts = {}) {
  const onProgress = opts.onProgress || null;
  if (blob.size > CHUNK_BYTES) return uploadChunked(blob, name, subject, category, opts);
  const data = new FormData();
  data.set('file', blob, name); data.set('name', name); data.set('subject', subject); if (category) data.set('category', category);
  if (opts.force) data.set('force', '1');
  const j = await withRetry(() => xhrJson('/api/library', { method: 'POST', body: data, onProgress: onProgress ? (l, t) => onProgress(l / t) : null }));
  return j.file;
}

async function uploadChunked(blob, name, subject, category, opts = {}) {
  const onProgress = opts.onProgress || null;
  const sha = await sha256Of(blob);
  let rec = getResume(sha);
  if (rec && (rec.size !== blob.size || rec.name !== name)) rec = null;
  let session = null;
  if (rec) {
    try { const out = await xhrJson('/api/uploads'); session = (out.uploads || []).find(u => u.id === rec.uploadId) || null; } catch (_) {}
    if (!session) { dropResume(sha); rec = null; }
  }
  if (!session) {
    const out = await withRetry(() => xhrJson('/api/uploads', { method: 'POST', contentType: 'application/json', body: JSON.stringify({ name, subject, category, size: blob.size, sha256: sha, force: !!opts.force }) }));
    session = { id: out.upload.id, chunk: out.upload.chunk, total: out.upload.total, parts: [] };
    putResume({ sha256: sha, uploadId: session.id, name, size: blob.size });
  }
  const chunk = session.chunk || CHUNK_BYTES, total = session.total || Math.ceil(blob.size / chunk);
  const done = new Set(session.parts || []);
  for (let n = 1; n <= total; n++) {
    if (done.has(n)) continue;
    const part = blob.slice((n - 1) * chunk, Math.min(n * chunk, blob.size));
    await withRetry(() => xhrJson(`/api/uploads/${encodeURIComponent(session.id)}/parts/${n}`, {
      method: 'PUT', body: part, contentType: 'application/octet-stream',
      onProgress: onProgress ? (l, t) => onProgress(((n - 1) + (t ? l / t : 0)) / total) : null,
    }));
    done.add(n);
  }
  const out = await withRetry(() => xhrJson(`/api/uploads/${encodeURIComponent(session.id)}/complete`, { method: 'POST', contentType: 'application/json', body: '{}' }));
  dropResume(sha);
  return out.file;
}

/* 内容重复（409）时先让用户确认，再带 force 强传一次。 */
async function uploadWithConfirm(blob, name, subject, category, onProgress) {
  try { return await uploadBlob(blob, name, subject, category, { onProgress }); }
  catch (err) {
    if (err.status === 409 && confirm((err.message || '这份内容已上传过。') + '\n\n仍然重复上传吗？')) {
      return uploadBlob(blob, name, subject, category, { onProgress, force: true });
    }
    throw err;
  }
}
$('#upload').addEventListener('submit', async e => {
  e.preventDefault(); const form = e.currentTarget, file = form.elements.file.files[0];
  if (!file) { message('先选择一个文件。'); return; }
  if (file.size > LIBRARY_MAX_BYTES) { message('这个文件有 ' + (file.size / 1048576).toFixed(1) + ' MiB，超过 20 MiB 上限。扫描版 PDF 可以先压缩，或按科目拆成几份再传。'); return; }
  if (!/\.(pdf|png|jpe?g|webp|txt|md|markdown|json)$/i.test(file.name)) { message('不支持该文件类型。'); return; }
  const button = form.querySelector('button'); button.disabled = true; message('正在上传…');
  try {
    const subject = await ensureSubject(form.elements.subject, form.elements.newSubject);
    const name = form.elements.name.value.trim() || file.name;
    const created = await uploadWithConfirm(file, name, subject, form.elements.category.value.trim(), frac => message('正在上传… ' + Math.round(frac * 100) + '%（大文件自动分片，断网后重新选择同一文件可续传）'));
    form.reset(); $('#newSubjectRow').hidden = true;
    await refresh();
    const f = allFiles.find(x => String(x.id) === String(created.id)); if (f) selectFile(f);
    message('上传完成，已为你选中这份资料，可以直接抽题。');
  } catch (err) { message(err instanceof TypeError ? '上传中断，没有连上服务器：多为网络不稳或文件较大。换个稳定的网络重试；还不行就把 PDF 压到 10 MiB 以内再传。' : err.message); }
  finally { button.disabled = false; }
});
$('#pasteForm').addEventListener('submit', async e => {
  e.preventDefault();
  const text = $('#pasteText').value.trim(); if (!text) { message('先粘贴题目文本。'); return; }
  const button = e.currentTarget.querySelector('button'); button.disabled = true; message('正在生成文本资料…');
  try {
    const subject = await ensureSubject($('#pasteSubject'), $('#pasteNewSubject'));
    const name = $('#pasteName').value.trim() || ('粘贴文本 ' + new Date().toLocaleDateString('zh-CN'));
    const blob = new Blob([text], {type:'text/plain'});
    const created = await uploadWithConfirm(blob, name.endsWith('.txt') ? name : name + '.txt', subject, '', null);
    $('#pasteText').value = ''; $('#pasteName').value = '';
    await refresh();
    const f = allFiles.find(x => String(x.id) === String(created.id)); if (f) selectFile(f);
    message('文本资料已生成并选中，点「开始抽题」即可提取题目。');
  } catch (err) { message(err.message); }
  finally { button.disabled = false; }
});
function addSubjectOption(sub) {
  for (const sel of [document.querySelector('#upload select[name="subject"]'), $('#pasteSubject')]) {
    if (!sel || sel.querySelector(`option[value="${sub.id}"]`)) continue;
    const opt = document.createElement('option'); opt.value = sub.id; opt.textContent = sub.name;
    sel.insertBefore(opt, sel.querySelector('option[value="__new"]'));
  }
}
document.querySelector('#upload select[name="subject"]').addEventListener('change', e => { $('#newSubjectRow').hidden = e.target.value !== '__new'; });
$('#pasteSubject').addEventListener('change', e => { $('#pasteNewSubjectRow').hidden = e.target.value !== '__new'; });

/* ---------------- 抽题 ---------------- */
function parsePages(value, total) {
  const out = new Set();
  for (const part of value.split(',')) { const m = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/); if (!m) throw Error('页码格式应为 1-3,5。'); const a = +m[1], b = +(m[2] || a); if (a < 1 || b < a || b > total) throw Error(`页码须在 1–${total} 之间。`); for (let n = a; n <= b; n++) out.add(n); }
  return [...out].sort((a,b) => a-b);
}
async function pdfPage(pdf, n) {
  const page = await pdf.getPage(n), content = await page.getTextContent();
  const text = content.items.map(x => x.str || '').join(' ').trim();
  if (text.length >= 20) return {page:n,text};
  const viewport = page.getViewport({scale:1.5}), canvas = document.createElement('canvas'); canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
  await page.render({canvasContext:canvas.getContext('2d'),viewport}).promise;
  return {page:n,text,image:canvas.toDataURL('image/jpeg', .8)};
}
let selectedBlob = null, selectedPdf = null, selectedTotal = 1;
async function selectFile(f) {
  selected = f; selectedBlob = null; selectedPdf = null; selectedTotal = 1;
  $('#extract').hidden = false; $('#selected').textContent = f.name + '（正在读取页数…）';
  $('#extract').scrollIntoView({behavior:'smooth'});
  try {
    const r = await fetch('/api/library/' + encodeURIComponent(f.id), {credentials:'include'}); if (!r.ok) throw Error('原文件读取失败');
    selectedBlob = await r.blob();
    const name = f.name.toLowerCase();
    if (name.endsWith('.pdf') || selectedBlob.type === 'application/pdf') {
      selectedPdf = await pdfjs.getDocument({data:await selectedBlob.arrayBuffer(), cMapUrl:new URL('./pdfjs/cmaps/',import.meta.url).href, cMapPacked:true, standardFontDataUrl:new URL('./pdfjs/standard_fonts/',import.meta.url).href}).promise;
      selectedTotal = selectedPdf.numPages;
    }
    $('#pages').value = selectedTotal > 1 ? `1-${selectedTotal}` : '1';
    $('#selected').textContent = `${f.name}（共 ${selectedTotal} 页）`;
  } catch (err) { $('#selected').textContent = f.name + '（读取失败：' + err.message + '）'; }
}
$('#start').addEventListener('click', async () => {
  if (!selected || !selectedBlob) { message('先在资料列表里选一份资料。'); return; }
  const button = $('#start'); button.disabled = true;
  try {
    const pages = parsePages($('#pages').value, selectedTotal);
    const name = selected.name.toLowerCase();
    const payloads = [];
    for (const n of pages) {
      $('#progress').textContent = `正在准备第 ${n} 页（共 ${pages.length} 页）…`;
      if (selectedPdf) payloads.push(await pdfPage(selectedPdf, n));
      else if (selectedBlob.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(name)) { const bitmap = await createImageBitmap(selectedBlob); const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height)); const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale)); canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close(); payloads.push({page:n, text:'', image:canvas.toDataURL('image/jpeg', .8)}); }
      else { const t = await selectedBlob.text(); for (const chunk of (t.length > 100000 ? t.match(/[\s\S]{1,100000}/g) : [t])) payloads.push({page:n, text:chunk}); }
    }
    let got = 0, skipped = 0, cut = 0;
    for (let i = 0; i < payloads.length; i += 8) {
      const chunk = payloads.slice(i, i + 8);
      $('#progress').textContent = `正在提取第 ${chunk[0].page}–${chunk[chunk.length-1].page} 页（${Math.min(i+8, payloads.length)}/${payloads.length} 页）…`;
      const out = await AtlasUser.json('/api/library/' + encodeURIComponent(selected.id) + '/extract', 'POST', {pages:chunk});
      got += (out.items || []).length; skipped += out.skipped || 0; cut += out.incomplete || 0;
    }
    $('#progress').textContent = `提取完成，本次得到 ${got} 道草稿（已在下方草稿池）。` + (skipped ? `另有 ${skipped} 条因结构不完整被跳过。` : '') + (cut ? `其中 ${cut} 道疑似被页边界截断，已在草稿池标为「疑似截断」，补全后可撤下标记。` : '');
    await loadPool();
    document.getElementById('poolSec').scrollIntoView({behavior:'smooth'});
  } catch (err) { $('#progress').textContent = '处理中断：' + err.message + '。已取得的草稿仍在草稿池里。'; await loadPool(); }
  finally { button.disabled = false; }
});

/* ---------------- 草稿池 ---------------- */
function dupMap() {
  const bankKeys = new Set(allQuestions.map(q => normKey(q.text)).filter(Boolean));
  const seen = new Set(), dup = new Set();
  for (const d of pool) {
    const k = normKey(d.text); if (!k) continue;
    if (!d.imported && (bankKeys.has(k) || seen.has(k))) dup.add(d.draftId);
    seen.add(k);
  }
  return dup;
}
async function loadPool() {
  try {
    const out = await AtlasUser.json('/api/drafts');
    pool = out.items || [];
    const dup = dupMap();
    for (const d of pool) {
      if (d.imported) { checkedSet.delete(d.draftId); if (d.qReviewStatus === 'user_verified') verifiedSet.add(d.draftId); }
      else if (!seenDraftIds.has(d.draftId)) { if (!dup.has(d.draftId)) checkedSet.add(d.draftId); }
      if (dup.has(d.draftId) && !d.imported) checkedSet.delete(d.draftId);
      seenDraftIds.add(d.draftId);
    }
    renderPool();
  } catch (err) { $('#pool').innerHTML = '<p>草稿池加载失败：' + esc(err.message) + '</p>'; }
}
const pagesOf = d => (Array.isArray(d.sourcePages) && d.sourcePages.length) ? d.sourcePages : (d.sourcePage ? [d.sourcePage] : []);
const pagesText = d => { const ps = pagesOf(d); return ps.length > 1 ? `第 ${ps[0]}–${ps[ps.length - 1]} 页` : `第 ${ps[0] || '?'} 页`; };
function poolVisible() {
  const dup = dupMap();
  return pool.filter(d => {
    if (poolFilter === 'fresh' && d.imported) return false;
    if (poolFilter === 'review' && !(d.imported ? d.qReviewStatus !== 'user_verified' : true)) return false;
    if (poolFilter === 'noanswer' && String(d.answer || '').trim()) return false;
    if (poolFilter === 'cut' && !d.incomplete) return false;
    if (poolFilter === 'imported' && !d.imported) return false;
    if (poolQuery) { const hay = (d.text || '') + ' ' + (d.kpName || '') + ' ' + (d.fileName || ''); if (!hay.includes(poolQuery)) return false; }
    return true;
  }).map(d => ({ d, dup: dup.has(d.draftId) }));
}
/* 审阅预览：题干/答案/解析里的公式走站内 KaTeX 通道渲染，不再只给纯文本原文。 */
function fillPreviews() {
  document.querySelectorAll('#pool [data-prev]').forEach(el => {
    if (el.closest('.deditor') && el.closest('.deditor').hidden) return; /* 只渲染展开的卡片，池子大时不浪费 */
    const card = el.closest('.dcard'); const d = pool.find(x => x.draftId === card.dataset.card); if (!d) return;
    const steps = (d.steps || []).filter(s => String(s).trim()).map(s => `<li>${esc(s)}</li>`).join('');
    el.innerHTML = `<div class="dpv-t">${esc(d.text || '')}</div>` + (d.answer ? `<div class="dpv-a">答案：${esc(d.answer)}</div>` : '') + (steps ? `<ol class="dpv-s">${steps}</ol>` : '');
    if (window.AtlasKatex) AtlasKatex.render(el);
  });
}
function renderPool() {
  const chips = [['all','全部'],['fresh','未导入'],['review','待核'],['noanswer','缺答案'],['cut','疑似截断'],['imported','已导入']];
  $('#poolChips').innerHTML = chips.map(([k, label]) => `<button type="button" class="chip${poolFilter === k ? ' on' : ''}" data-chip="${k}">${label}</button>`).join('');
  $('#poolChips').querySelectorAll('[data-chip]').forEach(b => b.addEventListener('click', () => { poolFilter = b.dataset.chip; renderPool(); }));
  const bk = $('#batchKind'); if (bk && bk.options.length <= 1) bk.innerHTML = '<option value="">不改</option>' + KINDS.map(k => `<option value="${k}">${k}</option>`).join('');
  const vis = poolVisible();
  const checkedCount = pool.filter(d => checkedSet.has(d.draftId) && !d.imported).length;
  $('#poolCount').textContent = `共 ${pool.length} 条草稿，当前显示 ${vis.length} 条，已勾选待导入 ${checkedCount} 条`;
  if (!pool.length) { $('#pool').innerHTML = '<p>草稿池还是空的。选一份资料抽题，草稿就会攒到这里。</p>'; return; }
  $('#pool').innerHTML = vis.length ? vis.map(({d, dup}) => {
    const open = expandedSet.has(d.draftId);
    const badges = [d.imported ? '<span class="bdg ok">已导入</span>' : '<span class="bdg">未导入</span>',
      dup ? '<span class="bdg warn">疑似重复</span>' : '',
      !String(d.answer || '').trim() ? '<span class="bdg warn">缺答案</span>' : '',
      pagesOf(d).length > 1 ? `<span class="bdg">跨 ${pagesOf(d).length} 页</span>` : '',
      d.incomplete ? '<span class="bdg warn">疑似截断</span>' : '',
      (d.imported ? d.qReviewStatus !== 'user_verified' : true) ? '<span class="bdg">待核</span>' : '<span class="bdg ok">已核对</span>'].join('');
    return `<div class="dcard" data-card="${esc(d.draftId)}">
      <div class="dhead"><input type="checkbox" data-pick-d="${esc(d.draftId)}" ${checkedSet.has(d.draftId) && !d.imported ? 'checked' : ''} ${d.imported ? 'disabled' : ''}>
      <span class="dmeta-line"><b>${esc(d.kind || '题型待补')}</b> · ${esc(d.difficulty || '未标')}${d.kpName ? ' · ' + esc(d.kpName) : ''} · ${esc(d.fileName || '')} ${esc(pagesText(d))}</span>${badges}
      <button type="button" class="ghosty" data-expand="${esc(d.draftId)}">${open ? '收起' : '展开编辑'}</button></div>
      <p class="dsum">${esc((d.text || '').slice(0, 150))}</p>
      <div class="deditor" ${open ? '' : 'hidden'}>
        <div class="dprev" data-prev></div>
        ${d.incomplete ? `<p class="dmiss">疑似截断：${esc(d.missing || '这道题在原页被切断，内容不完整。')}<label><input type="checkbox" data-f="fixIncomplete"> 我已补全，撤下截断标记</label></p>` : ''}
        <label>题目<textarea data-f="text">${esc(d.text || '')}</textarea></label>
        <label>答案<textarea data-f="answer">${esc(d.answer || '')}</textarea></label>
        <label>解析步骤（每行一步）<textarea data-f="steps">${esc((d.steps || []).join('\n'))}</textarea></label>
        <div class="dmeta"><label>题型 <select data-f="kind">${KINDS.map(k => `<option value="${k}"${d.kind === k ? ' selected' : ''}>${k}</option>`).join('')}</select></label><label>难度 <select data-f="difficulty">${['易','中','难'].map(k => `<option value="${k}"${d.difficulty === k ? ' selected' : ''}>${k}</option>`).join('')}</select></label><label>分值 <input type="number" min="0" step="0.5" data-f="maxScore" placeholder="自动" value="${d.maxScore != null ? esc(d.maxScore) : ''}"></label><label>知识点 <input data-f="kpName" value="${esc(d.kpName || '')}" placeholder="如：定积分的应用"></label></div>
        <label><input type="checkbox" data-f="verified" ${verifiedSet.has(d.draftId) ? 'checked' : ''}> 我已核对题目和答案</label>
        <div><span class="savestate" data-save-state></span><button type="button" class="dangery" data-ddel="${esc(d.draftId)}">删除这条草稿</button></div>
      </div></div>`;
  }).join('') : '<p>当前筛选下没有草稿。</p>';
  $('#pool').querySelectorAll('[data-pick-d]').forEach(c => c.addEventListener('change', () => { if (c.checked) checkedSet.add(c.dataset.pickD); else checkedSet.delete(c.dataset.pickD); renderPoolCountOnly(); }));
  $('#pool').querySelectorAll('[data-expand]').forEach(b => b.addEventListener('click', () => { const idv = b.dataset.expand; if (expandedSet.has(idv)) expandedSet.delete(idv); else expandedSet.add(idv); renderPool(); }));
  $('#pool').querySelectorAll('[data-ddel]').forEach(b => b.addEventListener('click', async () => { const d = pool.find(x => x.draftId === b.dataset.ddel); if (!d) return; if (!confirm('删除这条草稿？若已导入题库，题目会保留，只删草稿。')) return; try { await AtlasUser.json('/api/library/' + encodeURIComponent(d.fileId) + '/extract', 'DELETE', {draftId: d.draftId}); checkedSet.delete(d.draftId); expandedSet.delete(d.draftId); await loadPool(); } catch (err) { message('删除草稿失败：' + err.message); } }));
  $('#pool').querySelectorAll('.dcard').forEach(card => {
    card.querySelectorAll('[data-f]').forEach(el => el.addEventListener('input', () => scheduleSave(card)));
    card.querySelectorAll('select[data-f]').forEach(el => el.addEventListener('change', () => scheduleSave(card)));
  });
  fillPreviews();
}
function renderPoolCountOnly() { const n = pool.filter(d => checkedSet.has(d.draftId) && !d.imported).length; const el = $('#poolCount'); if (el) el.textContent = el.textContent.replace(/已勾选待导入 \d+ 条/, `已勾选待导入 ${n} 条`); }
function cardFields(card) {
  const get = f => card.querySelector(`[data-f="${f}"]`);
  const sc = parseFloat(get('maxScore').value);
  const fields = { text: get('text').value, answer: get('answer').value, steps: get('steps').value.split(/\r?\n/).filter(Boolean), kind: get('kind').value, difficulty: get('difficulty').value, kpName: get('kpName').value.trim(), maxScore: Number.isFinite(sc) && sc > 0 ? sc : null };
  const fix = get('fixIncomplete');
  if (fix && fix.checked) { fields.incomplete = false; fields.missing = ''; }
  return fields;
}
function scheduleSave(card) {
  const draftId = card.dataset.card; const d = pool.find(x => x.draftId === draftId); if (!d) return;
  const vEl = card.querySelector('[data-f="verified"]'); if (vEl) { if (vEl.checked) verifiedSet.add(draftId); else verifiedSet.delete(draftId); }
  const st = card.querySelector('[data-save-state]'); if (st) st.textContent = '有改动，正在保存…';
  clearTimeout(saveTimers[draftId]);
  saveTimers[draftId] = setTimeout(async () => {
    try {
      const out = await AtlasUser.json('/api/library/' + encodeURIComponent(d.fileId) + '/extract', 'PUT', { draftId, ...cardFields(card) });
      Object.assign(d, out.draft || {});
      fillPreviews();
      const st2 = card.querySelector('[data-save-state]'); if (st2) st2.textContent = '已自动保存 ' + new Date().toLocaleTimeString('zh-CN', {hour12:false});
    } catch (err) { const st2 = card.querySelector('[data-save-state]'); if (st2) st2.textContent = '保存失败：' + err.message; }
  }, 900);
}
$('#poolSearch').addEventListener('input', e => { poolQuery = e.target.value.trim(); renderPool(); });
$('#poolSelectAll').addEventListener('click', () => { poolVisible().forEach(({d}) => { if (!d.imported) checkedSet.add(d.draftId); }); renderPool(); });
$('#poolSelectNone').addEventListener('click', () => { checkedSet.clear(); renderPool(); });
$('#batchApply').addEventListener('click', async () => {
  const kind = $('#batchKind').value, kp = $('#batchKp').value.trim();
  if (!kind && !kp) { message('批量设置先选一个题型或填一个知识点。'); return; }
  const targets = pool.filter(d => checkedSet.has(d.draftId));
  if (!targets.length) { message('先勾选要批量设置的草稿。'); return; }
  const btn = $('#batchApply'); btn.disabled = true; let okN = 0;
  for (const d of targets) { try { const patch = { draftId: d.draftId }; if (kind) patch.kind = kind; if (kp) patch.kpName = kp; const out = await AtlasUser.json('/api/library/' + encodeURIComponent(d.fileId) + '/extract', 'PUT', patch); Object.assign(d, out.draft || {}); okN++; } catch (e) {} }
  btn.disabled = false; message(`批量设置完成：${okN}/${targets.length} 条已更新。`); renderPool();
});
$('#importBtn').addEventListener('click', async () => {
  const targets = pool.filter(d => checkedSet.has(d.draftId) && !d.imported);
  if (!targets.length) { $('#importNote').textContent = '先勾选要导入的草稿。'; return; }
  const btn = $('#importBtn'); btn.disabled = true; $('#importNote').textContent = '正在导入…';
  const byFile = {};
  for (const d of targets) (byFile[d.fileId] = byFile[d.fileId] || []).push(d);
  let imported = 0, skipped = 0, dupN = 0; const errs = [];
  for (const [fid, items] of Object.entries(byFile)) {
    try {
      const payload = items.map(d => ({ ...d, userVerified: verifiedSet.has(d.draftId) }));
      const out = await AtlasUser.json('/api/library/' + encodeURIComponent(fid) + '/import', 'POST', { items: payload });
      imported += out.imported || 0; skipped += out.skipped || 0; dupN += (out.duplicates || []).length; (out.errors || []).forEach(e => errs.push(e.error));
    } catch (err) { errs.push(err.message); }
  }
  let note = `导入完成：新增 ${imported} 道。`;
  if (dupN) note += ` ${dupN} 道与已有题目重复（题干相同），已跳过。`;
  if (skipped) note += ` ${skipped} 道此前已导入，已跳过。`;
  if (errs.length) note += ` ${errs.length} 道未导入：${errs[0]}。`;
  $('#importNote').textContent = note;
  btn.disabled = false;
  await refresh();
});

/* ---------------- 个人题库（可再编辑） ---------------- */
function renderQuestions() {
  $('#questions').innerHTML = allQuestions.length ? allQuestions.map(q => `<div class="question" data-qrow="${esc(q.draftId || '')}"><strong>${esc(q.subjectName || subjectLabel(q.subject || ''))} · ${esc(q.kpName || q.chapterTitle || '个人题目')}</strong><p>${esc(q.text || '')}</p><small>${esc(q.kind || '题型待补')} · 难度 ${esc(q.difficulty || '未标')} · ${q.maxScore != null ? esc(q.maxScore) + ' 分 · ' : ''}来源页 ${esc(q.sourcePage || '待核')} · ${esc(q.reviewStatus || '待核')}</small><div><button data-qedit="${esc(q.draftId || '')}">编辑</button><button data-qdel="${esc(q.draftId || '')}">从题库删除</button></div><div class="qeditor" hidden>
    <label>题目<textarea data-qf="text">${esc(q.text || '')}</textarea></label>
    <label>答案<textarea data-qf="answer">${esc(q.answer || '')}</textarea></label>
    <label>解析步骤（每行一步）<textarea data-qf="steps">${esc((q.steps || []).join('\n'))}</textarea></label>
    <div class="dmeta"><label>题型 <select data-qf="kind">${KINDS.map(k => `<option value="${k}"${q.kind === k ? ' selected' : ''}>${k}</option>`).join('')}</select></label><label>难度 <select data-qf="difficulty">${['易','中','难'].map(k => `<option value="${k}"${q.difficulty === k ? ' selected' : ''}>${k}</option>`).join('')}</select></label><label>分值 <input type="number" min="0" step="0.5" data-qf="maxScore" placeholder="自动" value="${q.maxScore != null ? esc(q.maxScore) : ''}"></label><label>知识点 <input data-qf="kpName" value="${esc(q.kpName || '')}"></label></div>
    <label><input type="checkbox" data-qf="verified" ${q.reviewStatus === 'user_verified' ? 'checked' : ''}> 标记为已核对</label>
    <div><button data-qsave="${esc(q.draftId || '')}">保存修改</button><span class="savestate" data-qstate></span></div></div></div>`).join('') : '<p>还没有导入题目。</p>';
  $('#questions').querySelectorAll('[data-qedit]').forEach(b => b.addEventListener('click', () => { const row = b.closest('.question'); const ed = row.querySelector('.qeditor'); ed.hidden = !ed.hidden; }));
  $('#questions').querySelectorAll('[data-qdel]').forEach(b => b.addEventListener('click', async () => { if (!b.dataset.qdel) return; if (!confirm('把这道题从个人题库删除？')) return; b.disabled = true; try { await AtlasUser.json('/api/personal/questions', 'DELETE', {draftId: b.dataset.qdel}); await refresh(); message('已从个人题库删除。'); } catch (err) { message('删除失败：' + err.message); b.disabled = false; } }));
  $('#questions').querySelectorAll('[data-qsave]').forEach(b => b.addEventListener('click', async () => {
    const row = b.closest('.question'); const get = f => row.querySelector(`[data-qf="${f}"]`);
    const sc = parseFloat(get('maxScore').value);
    const payload = { draftId: b.dataset.qsave, text: get('text').value, answer: get('answer').value, steps: get('steps').value.split(/\r?\n/).filter(Boolean), kind: get('kind').value, difficulty: get('difficulty').value, kpName: get('kpName').value.trim(), maxScore: Number.isFinite(sc) && sc > 0 ? sc : null, userVerified: get('verified').checked };
    const st = row.querySelector('[data-qstate]'); st.textContent = '正在保存…'; b.disabled = true;
    try { await AtlasUser.json('/api/personal/questions', 'PUT', payload); st.textContent = '已保存'; await refresh(); message('题目已更新。'); }
    catch (err) { st.textContent = '保存失败：' + err.message; b.disabled = false; }
  }));
  if (window.AtlasKatex) AtlasKatex.render($('#questions'));
}

/* ---------------- 初始化 ---------------- */
try { await AtlasUser.ready; try { const out = await AtlasUser.json('/api/subjects'); (out.subjects || []).forEach(sub => { mySubjects[sub.id] = sub.name; addSubjectOption(sub); }); } catch (_) {}
  await refresh(); } catch (err) { message(err.message); }
