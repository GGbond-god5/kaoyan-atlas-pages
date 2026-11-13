import * as pdfjs from './pdfjs/pdf.min.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = new URL('./pdfjs/pdf.worker.min.mjs', import.meta.url).href;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let selected = null, drafts = [];
const message = s => { $('#status').textContent = s; };
async function refresh() {
  const [files, questions] = await Promise.all([AtlasUser.json('/api/library'), AtlasUser.json('/api/personal/questions')]);
  $('#files').innerHTML = files.files.length ? files.files.map(f => `<div class="file"><strong>${esc(f.name)}</strong><small>${esc(f.subject)} · ${(f.size/1048576).toFixed(2)} MiB · ${esc(f.status || '')}</small><div><a href="/api/library/${encodeURIComponent(f.id)}" target="_blank" rel="noopener">查看原文件</a><button data-id="${esc(f.id)}">选择并抽题</button></div></div>`).join('') : '<p>还没有上传资料。</p>';
  $('#files').querySelectorAll('button').forEach(b => b.addEventListener('click', async () => { selected = files.files.find(f => String(f.id) === b.dataset.id); drafts = []; renderDrafts(); $('#extract').hidden = false; $('#selected').textContent = selected.name; $('#progress').textContent = '正在加载已保存草稿…'; $('#extract').scrollIntoView({behavior:'smooth'}); try { const out = await AtlasUser.json('/api/library/' + encodeURIComponent(selected.id) + '/extract'); drafts = out.items; renderDrafts(); $('#progress').textContent = `已加载 ${drafts.length} 道已保存草稿。`; } catch (err) { $('#progress').textContent = '草稿加载失败：' + err.message; } }));
  $('#questions').innerHTML = questions.items.length ? questions.items.map(q => `<div class="question"><strong>${esc(q.subject || '')} · ${esc(q.kpName || q.chapterTitle || '个人题目')}</strong><p>${esc(q.text || '')}</p><small>来源页 ${esc(q.sourcePage || '待核')} · ${esc(q.reviewStatus || '待核')}</small></div>`).join('') : '<p>还没有导入题目。</p>';
}
$('#upload').addEventListener('submit', async e => {
  e.preventDefault(); const form = e.currentTarget, file = form.elements.file.files[0];
  if (!file || file.size > 20 * 1024 * 1024) { message('请选择不超过 20 MiB 的文件。'); return; }
  if (!/\.(pdf|png|jpe?g|webp|txt|md|markdown|json)$/i.test(file.name)) { message('不支持该文件类型。'); return; }
  const data = new FormData(form); if (!data.get('name').trim()) data.set('name', file.name);
  const button = form.querySelector('button'); button.disabled = true; message('正在上传…');
  try { const r = await fetch('/api/library', {method:'POST',credentials:'include',body:data}); const j = await r.json(); if (!r.ok || j.ok === false) throw Error(j.error || '上传失败'); form.reset(); await refresh(); message('上传完成。'); } catch (err) { message(err.message); } finally { button.disabled = false; }
});
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
function renderDrafts() {
  $('#review').hidden = !drafts.length;
  $('#drafts').innerHTML = drafts.map((d,i) => `<div class="draft"><label><input type="checkbox" checked data-check="${i}"> 第 ${esc(d.sourcePage || '?')} 页 · 草稿 ${i+1}</label><label>题目<textarea data-field="text" data-index="${i}">${esc(d.text || '')}</textarea></label><label>答案<textarea data-field="answer" data-index="${i}">${esc(d.answer || '')}</textarea></label><label>解析步骤（每行一步）<textarea data-field="steps" data-index="${i}">${esc((d.steps || []).join('\n'))}</textarea></label><label><input type="checkbox" data-verified="${i}"> 我已核对题目和答案</label><small>未核对的答案会保留待核标记。</small></div>`).join('');
}
$('#start').addEventListener('click', async () => {
  if (!selected) return; const button = $('#start'); button.disabled = true;
  try {
    $('#progress').textContent = '正在读取原文件…';
    const r = await fetch('/api/library/' + encodeURIComponent(selected.id), {credentials:'include'}); if (!r.ok) throw Error('原文件读取失败（' + r.status + '）');
    const blob = await r.blob(), name = selected.name.toLowerCase(); let pdf, total = 1;
    if (name.endsWith('.pdf') || blob.type === 'application/pdf') { pdf = await pdfjs.getDocument({data:await blob.arrayBuffer(),cMapUrl:new URL('./pdfjs/cmaps/',import.meta.url).href,cMapPacked:true,standardFontDataUrl:new URL('./pdfjs/standard_fonts/',import.meta.url).href}).promise; total = pdf.numPages; }
    const pages = parsePages($('#pages').value, total);
    for (let i = 0; i < pages.length; i++) {
      const n = pages[i]; $('#progress').textContent = `正在处理第 ${n} 页（${i+1}/${pages.length}）…`;
      let page;
      if (pdf) page = await pdfPage(pdf,n);
      else if (blob.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(name)) { const bitmap = await createImageBitmap(blob); const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height)); const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale)); canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close(); page = {page:n,text:'',image:canvas.toDataURL('image/jpeg', .8)}; }
      else page = {page:n,text:await blob.text()};
      const chunks = page.text.length > 100000 ? page.text.match(/[\s\S]{1,100000}/g).map(text => ({page:n,text})) : [page];
      for (const chunk of chunks) { const out = await AtlasUser.json('/api/library/' + encodeURIComponent(selected.id) + '/extract', 'POST', {pages:[chunk]}); drafts.push(...out.items); renderDrafts(); }
    }
    $('#progress').textContent = `处理完成，共 ${drafts.length} 道草稿。`;
  } catch (err) { $('#progress').textContent = '处理中断：' + err.message + '。已取得的草稿仍可审阅。'; } finally { button.disabled = false; }
});
$('#import').addEventListener('click', async () => {
  const button = $('#import'); let items;
  try { items = [...$('#drafts').querySelectorAll('[data-check]:checked')].map(c => { const i = c.dataset.check, item = {...drafts[i]}; for (const field of ['text','answer','steps']) { const value = $('#drafts').querySelector(`[data-field="${field}"][data-index="${i}"]`).value; item[field] = field === 'steps' ? value.split(/\r?\n/).filter(Boolean) : value; } item.userVerified = $('#drafts').querySelector(`[data-verified="${i}"]`).checked; if (!item.text.trim()) throw Error('题目内容不能为空。'); return item; }); if (!items.length) throw Error('请至少选择一道题目。'); } catch (err) { message('草稿无法导入：' + err.message); return; }
  button.disabled = true;
  try { const out = await AtlasUser.json('/api/library/' + encodeURIComponent(selected.id) + '/import', 'POST', {items}); message(`导入完成：${out.imported} 道。`); await refresh(); } catch (err) { message(err.message); } finally { button.disabled = false; }
});
try { await AtlasUser.ready; await refresh(); } catch (err) { message(err.message); }
