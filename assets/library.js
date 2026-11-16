import * as pdfjs from './pdfjs/pdf.min.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = new URL('./pdfjs/pdf.worker.min.mjs', import.meta.url).href;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let selected = null, drafts = [];
let importedIds = new Set();
let allQuestions = [];
const KINDS = ['选择题','单选题','多选题','填空题','计算题','证明题','简答题','分析题','完形','阅读','新题型','翻译','小作文','大作文'];
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
  allQuestions = questions.items;
  $('#questions').innerHTML = questions.items.length ? questions.items.map(q => `<div class="question"><strong>${esc(q.subjectName || subjectLabel(q.subject || ''))} · ${esc(q.kpName || q.chapterTitle || '个人题目')}</strong><p>${esc(q.text || '')}</p><small>${esc(q.kind || '题型待补')} · 难度 ${esc(q.difficulty || '未标')} · ${q.maxScore != null ? esc(q.maxScore) + ' 分 · ' : ''}来源页 ${esc(q.sourcePage || '待核')} · ${esc(q.reviewStatus || '待核')}</small><div><button data-add-q="${esc(q.id || '')}">＋ 加入试题篮</button><button data-qdel="${esc(q.draftId || '')}">从题库删除</button></div></div>`).join('') : '<p>还没有导入题目。</p>';
  bindAddButtons($('#questions'));
  renderPick();
  renderBasket();
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
  $('#drafts').innerHTML = drafts.map((d,i) => `<div class="draft"><label><input type="checkbox" ${importedIds.has(d.draftId) ? '' : 'checked'} data-check="${i}"> 第 ${esc(d.sourcePage || '?')} 页 · 草稿 ${i+1}${importedIds.has(d.draftId) ? ' · 已导入题库' : ''}</label><label>题目<textarea data-field="text" data-index="${i}">${esc(d.text || '')}</textarea></label><label>答案<textarea data-field="answer" data-index="${i}">${esc(d.answer || '')}</textarea></label><label>解析步骤（每行一步）<textarea data-field="steps" data-index="${i}">${esc((d.steps || []).join('\n'))}</textarea></label><div class="dmeta"><label>题型 <select data-kind="${i}">${KINDS.map(k => `<option value="${k}"${d.kind === k ? ' selected' : ''}>${k}</option>`).join('')}</select></label><label>难度 <select data-diff="${i}">${['易','中','难'].map(k => `<option value="${k}"${d.difficulty === k ? ' selected' : ''}>${k}</option>`).join('')}</select></label><label>分值 <input type="number" min="0" step="0.5" data-score="${i}" placeholder="自动" value="${d.maxScore != null ? esc(d.maxScore) : ''}"></label><label>知识点 <input data-kp="${i}" value="${esc(d.kpName || '')}" placeholder="如：定积分的应用"></label></div><label><input type="checkbox" data-verified="${i}"> 我已核对题目和答案</label><small>未核对的答案会保留待核标记。</small><div><button data-ddel="${i}">删除这条草稿</button></div></div>`).join('');
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
  try { items = [...$('#drafts').querySelectorAll('[data-check]:checked')].map(c => { const i = c.dataset.check, item = {...drafts[i]}; for (const field of ['text','answer','steps']) { const value = $('#drafts').querySelector(`[data-field="${field}"][data-index="${i}"]`).value; item[field] = field === 'steps' ? value.split(/\r?\n/).filter(Boolean) : value; } const kindEl = $('#drafts').querySelector(`[data-kind="${i}"]`); if (kindEl) item.kind = kindEl.value; const diffEl = $('#drafts').querySelector(`[data-diff="${i}"]`); if (diffEl) item.difficulty = diffEl.value; const kpEl = $('#drafts').querySelector(`[data-kp="${i}"]`); if (kpEl) item.kpName = kpEl.value.trim(); const scEl = $('#drafts').querySelector(`[data-score="${i}"]`); const scVal = scEl ? parseFloat(scEl.value) : NaN; if (Number.isFinite(scVal) && scVal > 0) item.maxScore = scVal; item.userVerified = $('#drafts').querySelector(`[data-verified="${i}"]`).checked; if (!item.text.trim()) throw Error('题目内容不能为空。'); return item; }); if (!items.length) throw Error('请至少选择一道题目。'); } catch (err) { message('草稿无法导入：' + err.message); return; }
  button.disabled = true;
  try { const out = await AtlasUser.json('/api/library/' + encodeURIComponent(selected.id) + '/import', 'POST', {items});
    (out.items || []).forEach(q => importedIds.add(q.draftId)); renderDrafts();
    let note = `导入完成：新增 ${out.imported} 道。`;
    if (out.skipped) note += ` ${out.skipped} 道此前已导入，已跳过。`;
    if (out.errors && out.errors.length) note += ` ${out.errors.length} 道未导入：${out.errors[0].error}。`;
    message(note); await refresh(); } catch (err) { message('导入失败：' + err.message); } finally { button.disabled = false; }
});

/* ---------------- 组卷中心：试题篮 ---------------- */
let basket = { subject: '', items: [] };
const qById = id => allQuestions.find(q => q.id === id);
const inBasket = id => basket.items.some(b => b.id === id);
const effScore = (bi, q) => { const s = Number(bi.score); if (Number.isFinite(s) && s > 0) return s; const m = Number(q && q.maxScore); return Number.isFinite(m) && m > 0 ? m : null; };
function bindAddButtons(root) {
  if (!root) return;
  root.querySelectorAll('[data-add-q]').forEach(b => b.addEventListener('click', () => {
    const q = qById(b.dataset.addQ); if (!q) return;
    if (inBasket(q.id)) { message('这道题已经在试题篮里了。'); return; }
    if (basket.subject && q.subject !== basket.subject) { message(`试题篮里已经是「${subjectLabel(basket.subject)}」的题，一篮只组同一科；先组完或清空试题篮再换科目。`); return; }
    if (!basket.subject) basket.subject = q.subject || '';
    basket.items.push({ id: q.id, score: q.maxScore != null ? q.maxScore : '' });
    saveBasket(); renderBasket(); renderPick();
    message('已加入试题篮。');
  }));
}
function saveBasket() { AtlasUser.save('basket', basket).catch(() => {}); }
async function loadBasket() {
  try { const b = await AtlasUser.load('basket', { subject: '', items: [] }); if (b && Array.isArray(b.items)) basket = { subject: b.subject || '', items: b.items.filter(x => x && x.id) }; } catch (e) {}
  renderBasket(); renderPick();
}
function renderPick() {
  const box = $('#qPick'); if (!box) return;
  const sSel = $('#qSubject'), kSel = $('#qKind'), qIn = $('#qSearch');
  const subs = [...new Set(allQuestions.map(q => q.subject).filter(Boolean))];
  const kinds = [...new Set(allQuestions.map(q => q.kind).filter(Boolean))];
  if (sSel) { const cur = sSel.value; sSel.innerHTML = '<option value="">全部科目</option>' + subs.map(x => `<option value="${esc(x)}">${esc(subjectLabel(x))}</option>`).join(''); sSel.value = cur; }
  if (kSel) { const cur = kSel.value; kSel.innerHTML = '<option value="">全部题型</option>' + kinds.map(x => `<option value="${esc(x)}">${esc(x)}</option>`).join(''); kSel.value = cur; }
  const fs = sSel ? sSel.value : '', fk = kSel ? kSel.value : '', kw = qIn ? qIn.value.trim() : '';
  const list = allQuestions.filter(q => (!fs || q.subject === fs) && (!fk || q.kind === fk) && (!kw || (q.text || '').includes(kw) || (q.kpName || '').includes(kw)));
  box.innerHTML = list.length ? list.slice(0, 200).map(q => `<div class="pick"><strong>${esc(subjectLabel(q.subject || ''))} · ${esc(q.kind || '题型待补')}</strong> <small>难度 ${esc(q.difficulty || '未标')}${q.maxScore != null ? ' · ' + esc(q.maxScore) + ' 分' : ''}${q.kpName ? ' · ' + esc(q.kpName) : ''} · 来源页 ${esc(q.sourcePage || '待核')}</small><p>${esc((q.text || '').slice(0, 160))}</p><div>${inBasket(q.id) ? '<button class="ghosty" disabled>已在试题篮</button>' : `<button data-add-q="${esc(q.id)}">＋ 加入试题篮</button>`}</div></div>`).join('') : '<p>没有符合条件的题目。先在上面上传资料、抽题导入个人题库。</p>';
  bindAddButtons(box);
}
function renderBasket() {
  const box = $('#basketBox'); if (!box) return;
  if (!basket.items.length) { box.innerHTML = '<p>试题篮还是空的。从下方个人题库里选题加入；也可以在「个人题库」列表里直接点「＋ 加入试题篮」。</p>'; return; }
  const rows = [];
  let lastKind = null;
  basket.items.forEach((bi, i) => {
    const q = qById(bi.id); if (!q) return;
    const kind = q.kind || '未分类';
    if (kind !== lastKind) { rows.push(`<div class="bgroup">${esc(kind)}（${basket.items.filter(x => { const qq = qById(x.id); return qq && (qq.kind || '未分类') === kind; }).length} 题）</div>`); lastKind = kind; }
    rows.push(`<div class="brow"><strong>第 ${i + 1} 题</strong> <small>${esc(q.difficulty || '未标')}${q.kpName ? ' · ' + esc(q.kpName) : ''} · 来源页 ${esc(q.sourcePage || '待核')}</small><p>${esc((q.text || '').slice(0, 140))}</p><div>分值 <input type="number" min="0" step="0.5" data-bscore="${i}" value="${bi.score !== '' && bi.score != null ? esc(bi.score) : (q.maxScore != null ? esc(q.maxScore) : '')}" placeholder="待定"> <button class="ghosty" data-bup="${i}">↑ 上移</button><button class="ghosty" data-bdown="${i}">↓ 下移</button><button class="ghosty" data-bswap="${i}">换一题</button><button class="dangery" data-bdel="${i}">移除</button></div></div>`);
  });
  const qs = basket.items.map(bi => ({ bi, q: qById(bi.id) })).filter(x => x.q);
  let scoreSum = 0, scoreMissing = 0; const byKind = {}, byDiff = {}; const kps = new Set(); let noAnswer = 0, pending = 0;
  qs.forEach(({ bi, q }) => { const sc = effScore(bi, q); if (sc == null) scoreMissing++; else scoreSum += sc; byKind[q.kind || '未分类'] = (byKind[q.kind || '未分类'] || 0) + 1; byDiff[q.difficulty || '未标'] = (byDiff[q.difficulty || '未标'] || 0) + 1; if (q.kpName) kps.add(q.kpName); if (!String(q.answer || '').trim()) noAnswer++; if (q.reviewStatus === 'pending') pending++; });
  const fmt = m => Object.entries(m).map(([k, v]) => `${k} ${v} 题`).join(' · ');
  const warn = [noAnswer ? `${noAnswer} 题还没有答案（批改会受限）` : '', pending ? `${pending} 题还是待核状态` : '', scoreMissing ? `${scoreMissing} 题分值待定` : ''].filter(Boolean).join('；');
  box.innerHTML = `<div><strong>${esc(subjectLabel(basket.subject))} · 共 ${qs.length} 题</strong></div>` + rows.join('') +
    `<div class="banalysis"><b>试卷分析</b><br>总分 ${scoreSum} 分${scoreMissing ? `（另有 ${scoreMissing} 题分值待定）` : ''} · 题型分布：${fmt(byKind)}<br>难度分布：${fmt(byDiff)} · 覆盖知识点 ${kps.size} 个${kps.size ? '：' + [...kps].slice(0, 12).join('、') : ''}${warn ? `<br>提醒：${warn}` : ''}</div>` +
    `<div><button id="bSort">按题型+难度整理排序</button> <button id="bStart">开始做这套卷 →</button> <button class="ghosty" id="bClear">清空试题篮</button></div>`;
  box.querySelectorAll('[data-bscore]').forEach(inp => inp.addEventListener('change', () => { const i = +inp.dataset.bscore; const v = parseFloat(inp.value); basket.items[i].score = Number.isFinite(v) && v > 0 ? v : ''; saveBasket(); renderBasket(); }));
  box.querySelectorAll('[data-bdel]').forEach(b => b.addEventListener('click', () => { basket.items.splice(+b.dataset.bdel, 1); if (!basket.items.length) basket.subject = ''; saveBasket(); renderBasket(); renderPick(); }));
  const move = (i, d) => { const j = i + d; if (j < 0 || j >= basket.items.length) return; [basket.items[i], basket.items[j]] = [basket.items[j], basket.items[i]]; saveBasket(); renderBasket(); };
  box.querySelectorAll('[data-bup]').forEach(b => b.addEventListener('click', () => move(+b.dataset.bup, -1)));
  box.querySelectorAll('[data-bdown]').forEach(b => b.addEventListener('click', () => move(+b.dataset.bdown, 1)));
  box.querySelectorAll('[data-bswap]').forEach(b => b.addEventListener('click', () => {
    const i = +b.dataset.bswap, cur = qById(basket.items[i].id); if (!cur) return;
    const cands = allQuestions.filter(q => q.subject === basket.subject && (q.kind || '') === (cur.kind || '') && !inBasket(q.id));
    if (!cands.length) { message('没有可换的同题型题目了。'); return; }
    const pick = cands[Math.floor(Math.random() * cands.length)];
    basket.items[i] = { id: pick.id, score: basket.items[i].score !== '' ? basket.items[i].score : (pick.maxScore != null ? pick.maxScore : '') };
    saveBasket(); renderBasket(); renderPick(); message('已换一题。');
  }));
  const sortBtn = $('#bSort'); if (sortBtn) sortBtn.addEventListener('click', () => {
    const rank = { '易': 0, '中': 1, '难': 2 };
    basket.items.sort((x, y) => { const qx = qById(x.id) || {}, qy = qById(y.id) || {}; const kx = KINDS.indexOf(qx.kind), ky = KINDS.indexOf(qy.kind); if (kx !== ky) return (kx < 0 ? 99 : kx) - (ky < 0 ? 99 : ky); return (rank[qx.difficulty] ?? 1) - (rank[qy.difficulty] ?? 1); });
    saveBasket(); renderBasket(); message('已按题型、难度整理。');
  });
  const clearBtn = $('#bClear'); if (clearBtn) clearBtn.addEventListener('click', () => { if (!confirm('清空试题篮？题目本身不会被删除。')) return; basket = { subject: '', items: [] }; saveBasket(); renderBasket(); renderPick(); });
  const startBtn = $('#bStart'); if (startBtn) startBtn.addEventListener('click', () => {
    const items = basket.items.filter(bi => qById(bi.id)).map(bi => ({ id: bi.id, score: bi.score === '' ? null : Number(bi.score) }));
    if (!items.length) { message('试题篮是空的。'); return; }
    try { localStorage.setItem('atlas.custompaper.v1', JSON.stringify({ title: `自组卷 · ${subjectLabel(basket.subject)}`, subject: basket.subject, items, ts: Date.now() })); } catch (e) { message('组卷信息保存失败：' + e.message); return; }
    location.href = 'practice.html?custom=1';
  });
}
['qSubject', 'qKind', 'qSearch'].forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener('input', renderPick); });

function addSubjectOption(sub) {
  const sel = document.querySelector('#upload select[name="subject"]'); if (!sel || sel.querySelector(`option[value="${sub.id}"]`)) return;
  const opt = document.createElement('option'); opt.value = sub.id; opt.textContent = sub.name;
  sel.insertBefore(opt, sel.querySelector('option[value="__new"]'));
}
document.querySelector('#upload select[name="subject"]').addEventListener('change', e => { $('#newSubjectRow').hidden = e.target.value !== '__new'; });
try { await AtlasUser.ready; try { const out = await AtlasUser.json('/api/subjects'); (out.subjects || []).forEach(sub => { mySubjects[sub.id] = sub.name; addSubjectOption(sub); }); } catch (_) {}
  await refresh(); await loadBasket(); } catch (err) { message(err.message); }
