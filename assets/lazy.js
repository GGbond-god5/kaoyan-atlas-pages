(function () {
  "use strict";

  const IDX = window.LAZY_INDEX;
  if (!IDX || !IDX.groups) return;

  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const CACHE = {};
  let overlay, groupsEl, notesEl, contentEl, crumbEl, searchEl, currentGroup = null, currentNote = null;
  const USER = {};
  let userLoaded = false, editorEl = null, editingId = null;

  function ensure() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.className = "lazy-overlay";
    overlay.id = "lazyOverlay";
    overlay.hidden = true;
    overlay.innerHTML = `<div class="lazy-panel" role="dialog" aria-modal="true" aria-label="Lazy 笔记库">
      <header class="lazy-head">
        <div class="lazy-head-title"><b>Lazy 笔记</b><span id="lazyCrumb"></span></div>
        <button class="lazy-new" id="lazyNew" type="button">+ 新建笔记</button>
        <button class="lazy-close" id="lazyClose" type="button" aria-label="关闭">×</button>
      </header>
      <div class="lazy-body">
        <aside class="lazy-side">
          <input id="lazySearch" class="lazy-search" type="search" placeholder="搜索笔记标题…" aria-label="搜索笔记">
          <div class="lazy-groups" id="lazyGroups"></div>
          <div class="lazy-notes" id="lazyNotes"></div>
        </aside>
        <main class="lazy-main"><article class="lazy-content" id="lazyContent"><p class="lazy-empty">选择左侧的章节与笔记开始阅读。</p></article></main>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    groupsEl = overlay.querySelector("#lazyGroups");
    notesEl = overlay.querySelector("#lazyNotes");
    contentEl = overlay.querySelector("#lazyContent");
    crumbEl = overlay.querySelector("#lazyCrumb");
    searchEl = overlay.querySelector("#lazySearch");
    overlay.querySelector("#lazyClose").onclick = close;
    overlay.querySelector("#lazyNew").onclick = () => openEditor(null, currentGroup);
    overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !overlay.hidden) close(); });
    groupsEl.addEventListener("click", e => {
      const b = e.target.closest("[data-group]");
      if (!b) return;
      selectGroup(b.dataset.group);
    });
    notesEl.addEventListener("click", e => {
      const b = e.target.closest("[data-note]");
      if (!b) return;
      if (b.dataset.user === "1") openUserNote(b.dataset.group, b.dataset.note);
      else openNote(b.dataset.group, b.dataset.note);
    });
    contentEl.addEventListener("click", e => {
      const ref = e.target.closest(".note-ref[data-target]");
      if (!ref) return;
      jumpTo(ref.dataset.target);
    });
    searchEl.addEventListener("input", () => search(searchEl.value.trim()));
  }

  function groupMeta(id) { return IDX.groups[id] || null; }

  function renderGroups() {
    let html = "", lastSubject = "";
    for (const id of IDX.order) {
      const g = groupMeta(id);
      if (!g) continue;
      if (g.subject !== lastSubject) {
        html += `<div class="lazy-subject">${esc(g.subject)}</div>`;
        lastSubject = g.subject;
      }
      html += `<button type="button" class="lazy-group${id === currentGroup ? " on" : ""}" data-group="${esc(id)}">
        <span>${esc(g.title)}</span><b>${g.count}${(USER[id] || []).length ? ` + ${USER[id].length}` : ""}</b></button>`;
    }
    groupsEl.innerHTML = html;
    const active = groupsEl.querySelector(".lazy-group.on");
    if (active) requestAnimationFrame(() => active.scrollIntoView({ block: "nearest" }));
  }

  function renderNotes(groupId, filter) {
    const g = groupMeta(groupId);
    if (!g) return;
    const match = n => !filter || n.title.includes(filter) || (n.type && n.type.includes(filter));
    const builtin = g.notes.filter(match).map(n => ({ ...n, user: false }));
    const mine = (USER[groupId] || []).filter(match).map(n => ({ ...n, user: true }));
    const notes = builtin.concat(mine);
    notesEl.innerHTML = notes.length
      ? notes.map(n => `<button type="button" class="lazy-note-item${n.id === currentNote ? " on" : ""}${n.user ? " mine" : ""}" data-group="${esc(groupId)}" data-note="${esc(n.id)}" data-user="${n.user ? 1 : 0}"><span>${esc(n.title)}</span><em>${n.user ? "我的 · " : ""}${esc(n.type)}</em></button>`).join("")
      : `<p class="lazy-empty">没有匹配的笔记。</p>`;
  }

  async function loadGroup(id) {
    if (CACHE[id]) return CACHE[id];
    const res = await fetch(`assets/lazy/${encodeURIComponent(id)}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    CACHE[id] = await res.json();
    return CACHE[id];
  }

  async function loadUserNotes(force) {
    if (userLoaded && !force) return;
    try {
      const res = await fetch("/api/notes", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      for (const key of Object.keys(USER)) delete USER[key];
      for (const note of data.notes || []) (USER[note.chapter] || (USER[note.chapter] = [])).push(note);
      userLoaded = true;
    } catch (e) { /* 离线时只展示内置笔记 */ }
  }

  function mdToHtml(md) {
    const stash = [];
    let s = String(md || "").replace(/\r\n/g, "\n");
    s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_, m) => {
      stash.push(`\\[${esc(m.trim())}\\]`);
      return `\u0000M${stash.length - 1}\u0000`;
    });
    s = s.replace(/(^|[^\\$])\$([^$\n]+?)\$(?!\$)/g, (_, pre, m) => {
      stash.push(`\\(${esc(m.trim())}\\)`);
      return `${pre}\u0000M${stash.length - 1}\u0000`;
    });
    const inline = t => esc(t)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
      .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    const lines = s.split("\n"), out = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (!line.trim()) { i++; continue; }
      if (/^```/.test(line)) {
        const buf = []; i++;
        while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
        i++; out.push(`<pre class="lazy-code"><code>${esc(buf.join("\n"))}</code></pre>`); continue;
      }
      const h = /^(#{1,6})\s+(.*)$/.exec(line);
      if (h) { const lv = Math.min(6, h[1].length + 1); out.push(`<h${lv}>${inline(h[2])}</h${lv}>`); i++; continue; }
      if (/^>\s?/.test(line)) {
        const buf = []; while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
        out.push(`<blockquote>${inline(buf.join("<br>"))}</blockquote>`); continue;
      }
      if (/^\s*([-*+]|\d+[.)])\s+/.test(line)) {
        const items = []; const ordered = /^\s*\d/.test(line);
        while (i < lines.length && /^\s*([-*+]|\d+[.)])\s+/.test(lines[i])) items.push(inline(lines[i++].replace(/^\s*([-*+]|\d+[.)])\s+/, "")));
        const tag = ordered ? "ol" : "ul";
        out.push(`<${tag}>${items.map(x => `<li>${x}</li>`).join("")}</${tag}>`); continue;
      }
      const para = []; while (i < lines.length && lines[i].trim() && !/^(#{1,6}\s|>|\s*([-*+]|\d+[.)])\s|```)/.test(lines[i])) para.push(lines[i++]);
      out.push(`<p>${inline(para.join("<br>"))}</p>`);
    }
    return out.join("\n").replace(/\u0000M(\d+)\u0000/g, (_, n) => stash[Number(n)] || "");
  }

  async function openUserNote(groupId, noteId) {
    const meta = groupMeta(groupId);
    if (!meta) return;
    currentGroup = groupId; currentNote = noteId;
    renderGroups(); renderNotes(groupId);
    crumbEl.textContent = `${meta.subject} · ${meta.title}`;
    try {
      const res = await fetch(`/api/notes/${encodeURIComponent(noteId)}`, { credentials: "include" });
      const data = await res.json();
      if (!res.ok || !data.note) throw new Error(data.error || `HTTP ${res.status}`);
      const note = data.note;
      contentEl.innerHTML = `<div class="lazy-note-meta"><span>我的 · ${esc(note.type)}</span><b>${esc(note.title)}</b><span class="lazy-actions"><button type="button" data-edit>编辑</button><button type="button" data-del>删除</button></span></div>${mdToHtml(note.markdown)}`;
      renderMath(contentEl);
      contentEl.parentElement.scrollTop = 0;
      contentEl.querySelector("[data-edit]").onclick = () => openEditor(note, groupId);
      contentEl.querySelector("[data-del]").onclick = () => deleteUserNote(note.id, groupId);
    } catch (err) {
      contentEl.innerHTML = `<p class="lazy-empty">笔记加载失败：${esc(err.message)}</p>`;
    }
  }

  function ensureEditor() {
    if (editorEl) return;
    editorEl = document.createElement("dialog");
    editorEl.className = "note-editor";
    editorEl.id = "noteEditor";
    editorEl.innerHTML = `<form class="note-editor-card">
      <header class="ne-head"><b>我的笔记</b><button type="button" class="ne-close" data-close aria-label="关闭">×</button></header>
      <div class="ne-body">
        <div class="ne-row">
          <label>章节<select id="neChapter"></select></label>
          <label>类型<select id="neType"><option>笔记</option><option>基础知识</option><option>方法</option><option>公式</option><option>错题</option><option>作文模板</option></select></label>
        </div>
        <label>标题<input id="neTitle" maxlength="80" placeholder="例如：我的极限计算错题"></label>
        <div class="ne-tabs"><button type="button" data-pane="write" class="on">编辑</button><button type="button" data-pane="preview">预览</button></div>
        <textarea id="neBody" placeholder="支持 Markdown：## 标题、- 列表、**加粗**、$公式$、> 引用"></textarea>
        <div id="nePreview" class="ne-preview" hidden></div>
        <p class="ne-error" id="neError"></p>
      </div>
      <footer class="ne-foot"><button type="button" class="ne-delete" data-del hidden>删除</button><span></span><button type="button" class="btn ghost" data-close>取消</button><button type="submit" class="btn">保存</button></footer>
    </form>`;
    document.body.appendChild(editorEl);
    editorEl.querySelectorAll("[data-close]").forEach(b => b.onclick = () => editorEl.close());
    editorEl.querySelector("#neBody").addEventListener("input", () => {
      const preview = editorEl.querySelector("#nePreview");
      if (!preview.hidden) { preview.innerHTML = mdToHtml(editorEl.querySelector("#neBody").value); renderMath(preview); }
    });
    editorEl.querySelectorAll("[data-pane]").forEach(b => b.onclick = () => {
      editorEl.querySelectorAll("[data-pane]").forEach(x => x.classList.toggle("on", x === b));
      const preview = b.dataset.pane === "preview";
      editorEl.querySelector("#neBody").hidden = preview;
      const pane = editorEl.querySelector("#nePreview");
      pane.hidden = !preview;
      if (preview) { pane.innerHTML = mdToHtml(editorEl.querySelector("#neBody").value); renderMath(pane); }
    });
    editorEl.querySelector("form").addEventListener("submit", saveNote);
  }

  function openEditor(note, groupId) {
    ensureEditor();
    editingId = note ? note.id : null;
    const select = editorEl.querySelector("#neChapter");
    select.innerHTML = IDX.order.map(id => {
      const g = IDX.groups[id];
      return `<option value="${esc(id)}">${esc(g.subject)} · ${esc(g.title)}</option>`;
    }).join("");
    select.value = note ? note.chapter : (groupId || IDX.order[0]);
    editorEl.querySelector("#neTitle").value = note ? note.title : "";
    editorEl.querySelector("#neType").value = note ? note.type : "笔记";
    editorEl.querySelector("#neBody").value = note ? note.markdown : "";
    editorEl.querySelector("#nePreview").hidden = true;
    editorEl.querySelector("#neBody").hidden = false;
    editorEl.querySelectorAll("[data-pane]").forEach(x => x.classList.toggle("on", x.dataset.pane === "write"));
    editorEl.querySelector("#neError").textContent = "";
    const del = editorEl.querySelector(".ne-delete");
    del.hidden = !note;
    del.onclick = note ? () => deleteUserNote(note.id, note.chapter) : null;
    if (!editorEl.open) editorEl.showModal();
    editorEl.querySelector("#neTitle").focus();
  }

  async function saveNote(event) {
    event.preventDefault();
    const err = editorEl.querySelector("#neError");
    const payload = {
      chapter: editorEl.querySelector("#neChapter").value,
      title: editorEl.querySelector("#neTitle").value,
      type: editorEl.querySelector("#neType").value,
      markdown: editorEl.querySelector("#neBody").value,
    };
    if (!payload.title.trim() || !payload.markdown.trim()) { err.textContent = "标题和内容不能为空"; return; }
    const url = editingId ? `/api/notes/${encodeURIComponent(editingId)}` : "/api/notes";
    try {
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      editorEl.close();
      userLoaded = false;
      await loadUserNotes(true);
      currentGroup = data.note.chapter;
      renderGroups();
      await openUserNote(data.note.chapter, data.note.id);
    } catch (e) { err.textContent = `保存失败：${e.message}`; }
  }

  async function deleteUserNote(id, groupId) {
    if (!window.confirm("删除这篇个人笔记？此操作不可撤销。")) return;
    try {
      const res = await fetch(`/api/notes/${encodeURIComponent(id)}`, { method: "DELETE", credentials: "include" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || `HTTP ${res.status}`);
      if (editorEl && editorEl.open) editorEl.close();
      userLoaded = false;
      await loadUserNotes(true);
      selectGroup(groupId);
    } catch (e) { window.alert(`删除失败：${e.message}`); }
  }

  function renderMath(el) {
    if (!window.renderMathInElement) return;
    try {
      window.renderMathInElement(el, {
        delimiters: [{ left: "\\(", right: "\\)", display: false }, { left: "\\[", right: "\\]", display: true }],
        throwOnError: false,
      });
    } catch (e) { /* ignore */ }
  }

  async function openNote(groupId, noteId) {
    const meta = groupMeta(groupId);
    if (!meta) return;
    currentGroup = groupId;
    currentNote = noteId;
    renderGroups();
    renderNotes(groupId);
    crumbEl.textContent = `${meta.subject} · ${meta.title}`;
    const list = notesEl.querySelector(`[data-note="${noteId}"]`);
    if (list) list.classList.add("on");
    try {
      const data = await loadGroup(groupId);
      const note = data.notes.find(n => n.id === noteId);
      if (!note) return;
      contentEl.innerHTML = `<div class="lazy-note-meta"><span>${esc(note.type)}</span><b>${esc(note.title)}</b></div>${note.html}`;
      renderMath(contentEl);
      contentEl.parentElement.scrollTop = 0;
    } catch (err) {
      contentEl.innerHTML = `<p class="lazy-empty">笔记加载失败：${esc(err.message)}</p>`;
    }
  }

  function selectGroup(groupId) {
    currentGroup = groupId;
    currentNote = null;
    renderGroups();
    renderNotes(groupId);
    crumbEl.textContent = `${groupMeta(groupId).subject} · ${groupMeta(groupId).title}`;
    if (searchEl.value.trim()) searchEl.value = "";
    const first = groupMeta(groupId).notes[0];
    const firstUser = (USER[groupId] || [])[0];
    if (first) openNote(groupId, first.id);
    else if (firstUser) openUserNote(groupId, firstUser.id);
    else contentEl.innerHTML = `<p class="lazy-empty">这个章节还没有笔记，点右上角「新建笔记」写一篇。</p>`;
  }

  function search(query) {
    if (!query) { renderNotes(currentGroup); return; }
    const hits = [];
    for (const id of IDX.order) {
      const g = IDX.groups[id];
      if (!g) continue;
      for (const n of g.notes) {
        if (n.title.includes(query) || (n.type && n.type.includes(query))) hits.push({ ...n, group: id, subject: g.subject, chapter: g.title, user: false });
        if (hits.length >= 120) break;
      }
      for (const n of USER[id] || []) {
        if (n.title.includes(query) || (n.type && n.type.includes(query))) hits.push({ ...n, group: id, subject: g.subject, chapter: g.title, user: true });
        if (hits.length >= 120) break;
      }
      if (hits.length >= 120) break;
    }
    crumbEl.textContent = `搜索：${query}`;
    notesEl.innerHTML = hits.length
      ? hits.map(h => `<button type="button" class="lazy-note-item${h.user ? " mine" : ""}" data-group="${esc(h.group)}" data-note="${esc(h.id)}" data-user="${h.user ? 1 : 0}"><span>${esc(h.title)}</span><em>${h.user ? "我的 · " : ""}${esc(h.chapter)}</em></button>`).join("")
      : `<p class="lazy-empty">没有找到「${esc(query)}」。</p>`;
  }

  function jumpTo(target) {
    const clean = String(target || "").replace(/^#/, "");
    if (!clean) return;
    const inGroup = currentGroup && IDX.groups[currentGroup].notes.find(n => n.title === clean || n.title.includes(clean) || clean.includes(n.title));
    if (inGroup) return openNote(currentGroup, inGroup.id);
    for (const id of IDX.order) {
      const g = IDX.groups[id];
      const hit = g && g.notes.find(n => n.title === clean || n.title.includes(clean) || clean.includes(n.title));
      if (hit) return openNote(id, hit.id);
    }
  }

  function close() {
    if (overlay) overlay.hidden = true;
    document.body.classList.remove("lazy-open");
  }

  async function open(groupId) {
    ensure();
    overlay.hidden = false;
    document.body.classList.add("lazy-open");
    await loadUserNotes();
    if (groupId && groupMeta(groupId)) {
      selectGroup(groupId);
    } else {
      currentGroup = null;
      renderGroups();
      notesEl.innerHTML = `<p class="lazy-empty">选择左侧章节，或直接搜索笔记标题。</p>`;
      crumbEl.textContent = `共 ${Object.values(IDX.groups).reduce((n, g) => n + g.count, 0)} 篇内置笔记`;
      contentEl.innerHTML = `<p class="lazy-empty">选择左侧的章节与笔记开始阅读。</p>`;
    }
  }

  window.AtlasLazy = { open, close };

  const btn = document.getElementById("lazyBtn");
  if (btn) btn.addEventListener("click", e => { e.preventDefault(); open(null); });
})();
