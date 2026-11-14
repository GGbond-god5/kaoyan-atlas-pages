(function () {
  "use strict";

  const IDX = window.LAZY_INDEX;
  if (!IDX || !IDX.groups) return;

  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const CACHE = {};
  let overlay, groupsEl, notesEl, contentEl, crumbEl, searchEl, currentGroup = null, currentNote = null;

  function ensure() {
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.className = "lazy-overlay";
    overlay.id = "lazyOverlay";
    overlay.hidden = true;
    overlay.innerHTML = `<div class="lazy-panel" role="dialog" aria-modal="true" aria-label="Lazy 笔记库">
      <header class="lazy-head">
        <div class="lazy-head-title"><b>Lazy 笔记</b><span id="lazyCrumb"></span></div>
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
    overlay.addEventListener("click", e => { if (e.target === overlay) close(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape" && !overlay.hidden) close(); });
    groupsEl.addEventListener("click", e => {
      const b = e.target.closest("[data-group]");
      if (!b) return;
      selectGroup(b.dataset.group);
    });
    notesEl.addEventListener("click", e => {
      const b = e.target.closest("[data-note]");
      if (b) openNote(b.dataset.group, b.dataset.note);
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
        <span>${esc(g.title)}</span><b>${g.count}</b></button>`;
    }
    groupsEl.innerHTML = html;
    const active = groupsEl.querySelector(".lazy-group.on");
    if (active) requestAnimationFrame(() => active.scrollIntoView({ block: "nearest" }));
  }

  function renderNotes(groupId, filter) {
    const g = groupMeta(groupId);
    if (!g) return;
    const notes = filter ? g.notes.filter(n => n.title.includes(filter) || n.type.includes(filter)) : g.notes;
    notesEl.innerHTML = notes.length
      ? notes.map(n => `<button type="button" class="lazy-note-item${n.id === currentNote ? " on" : ""}" data-group="${esc(groupId)}" data-note="${esc(n.id)}"><span>${esc(n.title)}</span><em>${esc(n.type)}</em></button>`).join("")
      : `<p class="lazy-empty">没有匹配的笔记。</p>`;
  }

  async function loadGroup(id) {
    if (CACHE[id]) return CACHE[id];
    const res = await fetch(`assets/lazy/${encodeURIComponent(id)}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    CACHE[id] = await res.json();
    return CACHE[id];
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
    if (first) openNote(groupId, first.id);
    else contentEl.innerHTML = `<p class="lazy-empty">这个章节还没有笔记。</p>`;
  }

  function search(query) {
    if (!query) { renderNotes(currentGroup); return; }
    const hits = [];
    for (const id of IDX.order) {
      const g = IDX.groups[id];
      if (!g) continue;
      for (const n of g.notes) {
        if (n.title.includes(query) || (n.type && n.type.includes(query))) hits.push({ ...n, group: id, subject: g.subject, chapter: g.title });
        if (hits.length >= 120) break;
      }
      if (hits.length >= 120) break;
    }
    crumbEl.textContent = `搜索：${query}`;
    notesEl.innerHTML = hits.length
      ? hits.map(h => `<button type="button" class="lazy-note-item" data-group="${esc(h.group)}" data-note="${esc(h.id)}"><span>${esc(h.title)}</span><em>${esc(h.chapter)}</em></button>`).join("")
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

  function open(groupId) {
    ensure();
    overlay.hidden = false;
    document.body.classList.add("lazy-open");
    if (groupId && groupMeta(groupId)) {
      selectGroup(groupId);
    } else {
      currentGroup = null;
      renderGroups();
      notesEl.innerHTML = `<p class="lazy-empty">选择左侧章节，或直接搜索笔记标题。</p>`;
      crumbEl.textContent = `共 ${Object.values(IDX.groups).reduce((n, g) => n + g.count, 0)} 篇笔记`;
      contentEl.innerHTML = `<p class="lazy-empty">选择左侧的章节与笔记开始阅读。</p>`;
    }
  }

  window.AtlasLazy = { open, close };

  const btn = document.getElementById("lazyBtn");
  if (btn) btn.addEventListener("click", e => { e.preventDefault(); open(null); });
})();
