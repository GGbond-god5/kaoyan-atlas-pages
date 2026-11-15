import * as pdfjs from './pdfjs/pdf.min.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = new URL('./pdfjs/pdf.worker.min.mjs', import.meta.url).href;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let selected = null, drafts = [];
let importedIds = new Set();
let mySubjects = {}; // id -> name（自建科目）
let allFiles = [];
const BUILTIN_SUBJECTS = {math:'数学一', math2:'数学二', english:'英语一', english2:'英语二', mechanics:'材料力学', politics:'政治'};
const subjectLabel = v => mySubjects[v] || BUILTIN_SUBJECTS[v] || v;
const message = s => { $('#status').textContent = s; };
async function refresh() {
  const [files, questions] = await Promise.all([AtlasUser.json('/api/library'), AtlasUser.json('/api/personal/questions')]);
  allFiles = files.files;
  const cats = [...new Set(allFiles.map(f => f.category).filter(Boolean))];
  const dl = $('#categoryList'); if (dl) dl.innerHTML = cats.map(c => `<option value="${esc(c)}">`).join('');
  const ff = $('#fileFilter'); if (ff) { const cur = ff.value; ff.innerHTML = '<option value="">全部分类</option>' + cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('') + '<option value="__none">未分类</option>'; ff.value = cur; }
  renderFiles();
  function renderFiles() {
    const want = ff ? ff.value : '';
    const list = allFiles.filter(f => !want || (want === '__none' ? !f.category : f.category === want));
    $('#files').innerHTML = list.length ? list.map(f => `<div class="file"><strong>${esc(f.name)}</strong><small>${esc(subjectLabel(f.subject))}${f.category ? ' · ' + esc(f.category) : ''} · ${(f.size/1048576).toFixed(2)} MiB · ${esc(f.status || '')}</small><div><a href="/api/library/${encodeURIComponent(f.id)}" target="_blank" rel="noopener">查看原文件</a><button data-pick="${esc(f.id)}">选择并抽题</button><button data-del="${esc(f.id)}">删除资料</button></div></div>`).join('') : '<p>该分类下还没有资料。</p>';
    bindFileButtons();
  }
  if (ff) ff.onchange = renderFiles;
  function bindFileButtons() {
  $('#files').querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', async () => { selected = allFiles.find(f => String(f.id) === b.dataset.pick); drafts = []; renderDrafts(); $('#extract').hidden = false; $('#selected').textContent = selected.name; $('#progress').textContent = '正在加载已保存草稿…'; $('#extract').scrollIntoView({behavior:'smooth'}); try { const out = await AtlasUser.json('/api/library/' + encodeURIComponent(selected.id) + '/extract'); drafts = out.items; importedIds = new Set(out.importedIds || []); renderDrafts(); $('#progress').textContent = `已加载 ${drafts.length} 道已保存草稿。`; } catch (err) { $('#progress').textContent = '草稿加载失败：' + err.message; } }));
  $('#files').querySelectorAll('[data-del]').forEach(b => b.addEventListener('click', async () => { const f = allFiles.find(x => String(x.id) === b.dataset.del); if (!f) return; if (!confirm(`删除资料「${f.name}」？它抽出的草稿和已导入的题目会一并删除，无法恢复。`)) return; b.disabled = true; try { const out = await AtlasUser.json('/api/library/' + encodeURIComponent(f.id), 'DELETE'); if (selected && String(selected.id) === String(f.id)) { selected = null; drafts = []; importedIds = new Set(); renderDrafts(); $('#extract').hidden = true; } await refresh(); message(`已删除资料${out.questions ? `，连同 ${out.questions} 道已导入题目` : ''}。`); } catch (err) { message('删除失败：' + err.message); b.disabled = false; } }));
  }
  $('#questions').innerHTML = questions.items.length ? questions.items.map(q => `<div class="question"><strong>${esc(q.subjectName || subjectLabel(q.subject || ''))} · ${esc(q.kpName || q.chapterTitle || '个人题目')}</strong><p>${esc(q.text || '')}</p><small>来源页 ${esc(q.sourcePage || '待核')} · ${esc(q.reviewStatus || '待核')}</small><div><button data-qdel="${esc(q.draftId || '')}">从题库删除</button></div></div>`).join('') : '<p>还没有导入题目。</p>';
  $('#questions').querySelectorAll('[data-qdel]').forEach(b => b.addEventListener('click', async () => { if (!b.dataset.qdel) return; if (!confirm('把这道题从个人题库删除？')) return; b.disabled = true; try { await AtlasUser.json('/api/personal/questions', 'DELETE', {draftId: b.dataset.qdel}); await refresh(); message('已从个人题库删除。'); } catch (err) { message('删除失败：' + err.message); b.disabled = false; } }));
}
$('#upload').addEventListener('submit', async e => {
  e.preventDefault(); const form = e.currentTarget, file = form.elements.file.files[0];
  if (!file) { message('先选择一个文件。'); return; }
  if (file.size > 20 * 1024 * 1024) { message('这个文件有 ' + (file.size / 1048576).toFixed(1) + ' MiB，超过 20 MiB 上限。扫描版 PDF 可以先用压缩工具压到 20 MiB 以内，或按科目拆成几份再传。'); return; }
  if (!/\.(pdf|png|jpe?g|webp|txt|md|markdown|json)$/i.test(file.name)) { message('不支持该文件类型。'); return; }
  const data = new FormData(form); if (!data.get('name').trim()) data.set('name', file.name);
  if (data.get('subject') === '__new') {
    const nm = (data.get('newSubject') || '').trim(); if (!nm) { message('请填写新科目名称。'); return; }
    try { const out = await AtlasUser.json('/api/subjects', 'POST', {name: nm}); mySubjects[out.subject.id] = out.subject.name; addSubjectOption(out.subject); data.set('subject', out.subject.id); }
    catch (err) { message('新建科目失败：' + err.message); return; }
  }
  data.delete('newSubject');
  const button = form.querySelector('button'); button.disabled = true; message('正在上传…');
  try { const r = await fetch('/api/library', {method:'POST',credentials:'include',body:data}); const j = await r.json().catch(() => null); if (!r.ok || !j || j.ok === false) throw Error((j && j.error) || ('上传失败（' + r.status + '）')); form.reset(); await refresh(); message('上传完成。'); } catch (err) { message(err instanceof TypeError ? '上传中断，没有连上服务器：多为网络不稳，或文件较大（' + (file.size / 1048576).toFixed(1) + ' MiB）上传超时。换个稳定的网络重试；还不行就把 PDF 压到 10 MiB 以内再传。' : err.message); } finally { button.disabled = false; }
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
  $('#drafts').innerHTML = drafts.map((d,i) => `<div class="draft"><label><input type="checkbox" ${importedIds.has(d.draftId) ? '' : 'checked'} data-check="${i}"> 第 ${esc(d.sourcePage || '?')} 页 · 草稿 ${i+1}${importedIds.has(d.draftId) ? ' · 已导入题库' : ''}</label><label>题目<textarea data-field="text" data-index="${i}">${esc(d.text || '')}</textarea></label><label>答案<textarea data-field="answer" data-index="${i}">${esc(d.answer || '')}</textarea></label><label>解析步骤（每行一步）<textarea data-field="steps" data-index="${i}">${esc((d.steps || []).join('\n'))}</textarea></label><label><input type="checkbox" data-verified="${i}"> 我已核对题目和答案</label><small>未核对的答案会保留待核标记。</small><div><button data-ddel="${i}">删除这条草稿</button></div></div>`).join('');
  $('#drafts').querySelectorAll('[data-ddel]').forEach(b => b.addEventListener('click', async () => { const i = +b.dataset.ddel, d = drafts[i]; if (!d) return; if (!confirm('删除这条草稿？删除后重新打开资料也不会再出现。')) return; try { if (selected && d.draftId) await AtlasUser.json('/api/library/' + encodeURIComponent(selected.id) + '/extract', 'DELETE', {draftId: d.draftId}); drafts.splice(i, 1); renderDrafts(); } catch (err) { message('删除草稿失败：' + err.message); } }));
}
$('#start').addEventListener('click', async () => {
  if (!selected) return; const button = $('#start'); button.disabled = true; let skippedTotal = 0;
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
      for (const chunk of chunks) { const out = await AtlasUser.json('/api/library/' + encodeURIComponent(selected.id) + '/extract', 'POST', {pages:[chunk]}); drafts.push(...out.items); skippedTotal += out.skipped || 0; renderDrafts(); }
    }
    $('#progress').textContent = `处理完成，共 ${drafts.length} 道草稿。` + (skippedTotal ? `另有 ${skippedTotal} 条因结构不完整被跳过。` : '');
  } catch (err) { $('#progress').textContent = '处理中断：' + err.message + '。已取得的草稿仍可审阅。'; } finally { button.disabled = false; }
});
$('#import').addEventListener('click', async () => {
  const button = $('#import'); let items;
  try { items = [...$('#drafts').querySelectorAll('[data-check]:checked')].map(c => { const i = c.dataset.check, item = {...drafts[i]}; for (const field of ['text','answer','steps']) { const value = $('#drafts').querySelector(`[data-field="${field}"][data-index="${i}"]`).value; item[field] = field === 'steps' ? value.split(/\r?\n/).filter(Boolean) : value; } item.userVerified = $('#drafts').querySelector(`[data-verified="${i}"]`).checked; if (!item.text.trim()) throw Error('题目内容不能为空。'); return item; }); if (!items.length) throw Error('请至少选择一道题目。'); } catch (err) { message('草稿无法导入：' + err.message); return; }
  button.disabled = true;
  try { const out = await AtlasUser.json('/api/library/' + encodeURIComponent(selected.id) + '/import', 'POST', {items});
    (out.items || []).forEach(q => importedIds.add(q.draftId)); renderDrafts();
    let note = `导入完成：新增 ${out.imported} 道。`;
    if (out.skipped) note += ` ${out.skipped} 道此前已导入，已跳过。`;
    if (out.errors && out.errors.length) note += ` ${out.errors.length} 道未导入：${out.errors[0].error}。`;
    message(note); await refresh(); } catch (err) { message('导入失败：' + err.message); } finally { button.disabled = false; }
});
function addSubjectOption(sub) {
  const sel = document.querySelector('#upload select[name="subject"]'); if (!sel || sel.querySelector(`option[value="${sub.id}"]`)) return;
  const opt = document.createElement('option'); opt.value = sub.id; opt.textContent = sub.name;
  sel.insertBefore(opt, sel.querySelector('option[value="__new"]'));
}
document.querySelector('#upload select[name="subject"]').addEventListener('change', e => { $('#newSubjectRow').hidden = e.target.value !== '__new'; });
try { await AtlasUser.ready; try { const out = await AtlasUser.json('/api/subjects'); (out.subjects || []).forEach(sub => { mySubjects[sub.id] = sub.name; addSubjectOption(sub); }); } catch (_) {}
  await refresh(); } catch (err) { message(err.message); }
