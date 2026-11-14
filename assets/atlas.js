(function () {
  "use strict";

  const DATA = window.ATLAS;
  if (!DATA) return;
  const SUBJECTS = DATA.subjects;
  const stage = document.getElementById("stage");
  const nodesEl = document.getElementById("nodes");
  const linksEl = document.getElementById("links");
  const linkLayer = document.createElementNS("http://www.w3.org/2000/svg", "g");
  linksEl.appendChild(linkLayer);

  const X = { root: 64, subject: 320, chapter: 620, leaf: 1010 };
  const W = { root: 196, subject: 232, chapter: 302, leaf: 300 };
  const WORLD_W = 1360;
  const GAP = 26;

  const state = { subject: null, chapter: null, scale: 0.9, x: 40, y: 40 };
  let layout = null;

  /* ---------------- helpers ---------------- */
  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }
  function daysLeft() {
    const exam = new Date(DATA.examDate + "T00:00:00");
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.max(0, Math.round((exam - today) / 86400000));
  }
  function openPdf(pdf, page) {
    if (!pdf) return;
    const url = page ? pdf + "#page=" + page : pdf;
    const a = document.createElement("a");
    a.href = url; a.target = "_blank"; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
  }
  function apply() {
    const t = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`;
    nodesEl.style.transform = t;
    linkLayer.setAttribute("transform", `translate(${state.x},${state.y}) scale(${state.scale})`);
    const zl = document.getElementById("zoomLabel");
    if (zl) zl.textContent = Math.round(state.scale * 100) + "%";
  }

  /* ---------------- layout ---------------- */
  function computeLayout() {
    const list = state.subject ? SUBJECTS.filter(s => s.id === state.subject) : SUBJECTS;
    const blocks = list.map(s => {
      const open = state.subject === s.id;
      const h = open ? Math.max(110, s.chapters.length * 38 + 58) : 88;
      return { s, open, h };
    });
    let cursor = 0;
    blocks.forEach(b => {
      b.top = cursor;
      b.subjectY = b.open ? b.top + 20 : b.top;
      b.chapterTop = b.top + 45;
      cursor += b.h + GAP;
    });
    const total = cursor - GAP;
    const focus = blocks.find(b => b.open);
    const rootY = focus ? focus.subjectY + 44 : total / 2;
    return { blocks, total: Math.max(total, 360), rootY };
  }

  function leafItems(ch) {
    const items = [];
    ch.kps.forEach(kp => items.push({
      kind: "kp", id: kp.id, name: kp.name, page: kp.page, freq: kp.freq, tag: "",
    }));
    ch.topics.forEach(tp => items.push({
      kind: "topic", id: tp.id, name: tp.name, page: tp.page, freq: "", tag: "专题",
    }));
    if (ch.summaryPage) items.push({ kind: "summary", id: "summary", name: "本章收口 · 自测清单", page: ch.summaryPage, freq: "", tag: "收口" });
    return items;
  }

  /* ---------------- render ---------------- */
  function svgPath(x1, y1, x2, y2, color, width, opacity) {
    const dx = Math.max(28, (x2 - x1) * 0.48);
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`);
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", color);
    p.setAttribute("stroke-width", width);
    p.setAttribute("stroke-opacity", opacity);
    linkLayer.appendChild(p);
  }

  function render() {
    layout = computeLayout();
    nodesEl.innerHTML = "";
    linkLayer.innerHTML = "";

    // root
    const root = el("div", "node root", `
      <div class="r-kicker">2027 KAOYAN ATLAS</div>
      <div class="r-title">华南理工<br>085500 机械</div>
      <div class="r-sub">数学一 · 英语一 · 807 · 政治</div>
      <div class="r-days"><b>${daysLeft()}</b>天后初试</div>`);
    root.style.cssText = `left:${X.root}px;top:${layout.rootY - 52}px;width:${W.root}px`;
    nodesEl.appendChild(root);

    let selectedChapter = null;
    let selectedBlock = null;

    layout.blocks.forEach(b => {
      const s = b.s;
      const subjectNode = el("div", "node subject" + (b.open ? " open" : ""), `
        <div class="s-top"><span class="s-name">${esc(s.name)}</span><span class="s-count">${s.chapterCount} 章</span></div>
        <div class="s-en">${esc(s.en)}</div>
        <div class="s-meta"><b>${s.kpCount}</b> 考点 · <b>${s.examCount}</b> 题目</div>
        <div class="s-arrow">${b.open ? "收起 ↑" : "展开 →"}</div>`);
      subjectNode.style.cssText = `left:${X.subject}px;top:${b.subjectY}px;width:${W.subject}px;--accent:${s.accent};--soft:${s.soft}`;
      subjectNode.dataset.type = "subject";
      subjectNode.dataset.id = s.id;
      subjectNode.tabIndex = 0;
      subjectNode.setAttribute("role", "button");
      nodesEl.appendChild(subjectNode);
      svgPath(X.root + W.root, layout.rootY, X.subject, b.subjectY + 44, s.accent, 1.2, 0.38);

      if (!b.open) return;
      b.chapters = [];
      s.chapters.forEach((ch, i) => {
        const cy = b.chapterTop + i * 38;
        const chapNode = el("div", "node chapter" + (state.chapter === ch.id ? " selected" : ""), `
          <span class="c-no">${esc(ch.no)}</span>
          <span class="c-title">${esc(ch.title)}</span>
          ${ch.priority ? `<span class="c-pri" data-p="${esc(ch.priority)}">${esc(ch.priority)}</span>` : ""}
          ${window.LAZY_INDEX && window.LAZY_INDEX.groups[ch.id] ? `<span class="c-lazy" data-lazy="${esc(ch.id)}" title="打开 Lazy 笔记">笔记 ${window.LAZY_INDEX.groups[ch.id].count}</span>` : ""}
          <button class="c-expand" data-expand="1" aria-label="展开考点" title="展开考点">›</button>
          <span class="c-pdf" data-pdf="${esc(ch.pdf)}" data-page="1">PDF</span>`);
        chapNode.style.cssText = `left:${X.chapter}px;top:${cy}px;width:${W.chapter}px;--accent:${s.accent}`;
        chapNode.dataset.type = "chapter";
        chapNode.dataset.id = ch.id;
        chapNode.tabIndex = 0;
        chapNode.setAttribute("role", "button");
        nodesEl.appendChild(chapNode);
        svgPath(X.subject + W.subject, b.subjectY + 44, X.chapter, cy + 17, s.accent, 1, 0.28);
        b.chapters.push({ ch, y: cy });

        if (state.chapter === ch.id) {
          selectedChapter = { ch, y: cy, s };
          selectedBlock = b;
        }
      });
    });

    // leaves for selected chapter
    if (selectedChapter) {
      const { ch, y, s } = selectedChapter;
      const items = leafItems(ch);
      const spacing = 34;
      const height = items.length * spacing;
      let top = y + 19 - height / 2 + 15;
      top = Math.max(16, Math.min(top, layout.total - height - 16));
      items.forEach((it, i) => {
        const ly = top + i * spacing;
        const dotCls = it.freq === "必考" || it.freq === "高频" ? "hot" : it.freq ? "mid" : "";
        const leaf = el("div", "node leaf " + it.kind, `
          <span class="dot ${dotCls}"></span>
          <span class="l-name">${esc(it.name)}</span>
          ${it.tag ? `<span class="l-tag">${esc(it.tag)}</span>` : ""}`);
        leaf.style.cssText = `left:${X.leaf}px;top:${ly}px;width:${W.leaf}px;--accent:${s.accent}`;
        leaf.dataset.chapter = ch.id;
        leaf.dataset.kp = it.id || "";
        leaf.tabIndex = 0;
        leaf.setAttribute("role", "link");
        nodesEl.appendChild(leaf);
        svgPath(X.chapter + W.chapter, y + 17, X.leaf, ly + 15, s.accent, 0.8, 0.22);
      });
    }

    // right panel
    if (!state.subject) {
      const stats = DATA.stats;
      const panel = el("div", "panel intro", `
        <div class="kicker">SUBJECT ATLAS · 2027</div>
        <h2>四科一体，<br>以<em>真题</em>为纲。</h2>
        <p>数学一、英语一、807 材料力学、政治。每一章按「考点 → 真题 → 专题」组织，点开章节或考点即可在页内阅读，不再跳转 PDF。</p>
        <div class="row">
          <div><b>${stats.chapters}</b>章讲义</div>
          <div><b>${stats.kps}</b>个考点</div>
          <div><b>${stats.exams}</b>道题目</div>
          <div><b>${stats.topics}</b>个专题</div>
        </div>
        <div class="note">点击左侧科目展开章节；点章节或考点进入网页阅读，顶部可「返回图谱」或下载 PDF 原版。<br><b>真题标注</b>：年份·题号为原卷原题；「同型」为同考点真题风格改编。内容按 <b>2027 考研大纲</b>（2026-09 发布）校对；807 以华工官方 2026 版 11 条为准（2027 新版截至 2026-11 未见公开）。</div>`);
      panel.style.cssText = `left:720px;top:${Math.max(20, layout.rootY - 190)}px;width:500px`;
      nodesEl.appendChild(panel);
    } else if (!selectedChapter) {
      const s = SUBJECTS.find(x => x.id === state.subject);
      const b = layout.blocks.find(x => x.s.id === state.subject);
      const panel = el("div", "panel subject-panel", `
        <div class="kicker" style="color:${s.accent}">SUBJECT OVERVIEW</div>
        <h2>${esc(s.name)}</h2>
        <p>${esc(s.blurb || "查看本章考点与真题分布。")}</p>
        <div class="p-stats">
          <div><b>${s.chapterCount}</b>章</div>
          <div><b>${s.kpCount}</b>考点</div>
          <div><b>${s.examCount}</b>题目</div>
        </div>
        <div class="p-ctas">
          ${s.overview ? `<button class="cta" data-read="${esc(s.overview.id)}" style="background:${s.accent}">阅读学科总览 →</button>` : ""}
          ${s.id === "english" ? `<a class="cta ghost" href="vocab.html#test" style="--accent:${s.accent};border-color:${s.accent}">英语词汇 · 自测 →</a>` : ""}
          ${s.id === "politics" ? `<a class="cta ghost" href="timeline.html" style="--accent:${s.accent};border-color:${s.accent}">政治时间轴 →</a>` : ""}
        </div>
        <div class="tip">点击章节直接在页内阅读；章节右侧可展开考点或下载 PDF。</div>`);
      panel.style.cssText = `left:950px;top:${Math.max(16, b.top + 10)}px;width:370px`;
      nodesEl.appendChild(panel);
    }

    apply();
    syncNav();
  }

  /* ---------------- view controls ---------------- */
  function viewport() {
    return { vw: stage.clientWidth, vh: stage.clientHeight };
  }
  function fitAll() {
    const { vw, vh } = viewport();
    const worldH = Math.max(layout.total + 140, 520);
    const s = Math.min((vw - 70) / WORLD_W, (vh - 120) / worldH, 1.06);
    state.scale = Math.max(0.42, s);
    state.x = (vw - WORLD_W * state.scale) / 2;
    state.y = (vh - worldH * state.scale) / 2 + 26;
    apply();
  }
  function fitHeight(height, pad = 60, maxScale = 0.96, minScale = 0.84) {
    const { vw, vh } = viewport();
    const s = Math.min((vw - 80) / WORLD_W, (vh - pad) / Math.max(height, 1), maxScale);
    return Math.max(minScale, s);
  }
  function focusSubject(sid) {
    const { vh } = viewport();
    const needH = layout.total + 70;
    state.scale = fitHeight(needH);
    state.x = 40;
    state.y = Math.max(110, (vh - needH * state.scale) / 2);
    clampPan();
    apply();
  }
  function focusChapter(y) {
    const { vh } = viewport();
    const needH = Math.max(layout.total + 70, 520);
    state.scale = fitHeight(needH);
    state.x = 40;
    state.y = Math.max(110, vh / 2 - (y + 19) * state.scale);
    clampPan();
    apply();
  }
  function clampPan() {
    const { vw, vh } = viewport();
    const worldH = Math.max(layout.total + 140, 520) * state.scale;
    const worldW = WORLD_W * state.scale;
    const yA = 110, yB = vh - worldH - 40;
    state.y = Math.max(Math.min(yA, yB), Math.min(Math.max(yA, yB), state.y));
    const xA = 40, xB = vw - worldW - 40;
    state.x = Math.max(Math.min(xA, xB), Math.min(Math.max(xA, xB), state.x));
  }

  /* ---------------- events ---------------- */
  nodesEl.addEventListener("click", e => {
    const read = e.target.closest("[data-read]");
    if (read) {
      e.stopPropagation();
      openReader(read.dataset.read);
      return;
    }
    const pdf = e.target.closest("[data-pdf]");
    if (pdf) {
      e.stopPropagation();
      openPdf(pdf.dataset.pdf, pdf.dataset.page || 1);
      return;
    }
    const leaf = e.target.closest(".leaf");
    if (leaf) {
      openReader(leaf.dataset.chapter, leaf.dataset.kp || null);
      return;
    }
    const node = e.target.closest(".node");
    if (!node) return;
    if (node.dataset.type === "subject") {
      const sid = node.dataset.id;
      const wasOpen = state.subject === sid;
      state.subject = wasOpen ? null : sid;
      state.chapter = null;
      render();
      if (state.subject) focusSubject(sid); else fitAll();
      updateCrumb();
    } else if (node.dataset.type === "chapter") {
      const cid = node.dataset.id;
      if (e.target.closest("[data-lazy]")) {
        e.stopPropagation();
        if (window.AtlasLazy) window.AtlasLazy.open(cid);
        return;
      }
      if (e.target.closest("[data-expand]")) {
        state.chapter = state.chapter === cid ? null : cid;
        render();
        const targeted = [...nodesEl.querySelectorAll(".chapter")].find(n => n.dataset.id === cid);
        if (targeted) focusChapter(parseFloat(targeted.style.top));
        updateCrumb();
        return;
      }
      openReader(cid);
    }
  });

  nodesEl.addEventListener("keydown", e => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const node = e.target.closest(".node");
    if (!node) return;
    e.preventDefault();
    node.click();
  });

  // drag to pan
  let drag = null;
  stage.addEventListener("pointerdown", e => {
    if (e.target.closest(".node") || e.target.closest(".stage-bottom") || e.target.closest(".zoom")) return;
    drag = { x: e.clientX, y: e.clientY, ox: state.x, oy: state.y };
    stage.classList.add("dragging");
    stage.setPointerCapture(e.pointerId);
  });
  stage.addEventListener("pointermove", e => {
    if (!drag) return;
    state.x = drag.ox + (e.clientX - drag.x);
    state.y = drag.oy + (e.clientY - drag.y);
    clampPan();
    apply();
  });
  stage.addEventListener("pointerup", () => { drag = null; stage.classList.remove("dragging"); });
  stage.addEventListener("pointercancel", () => { drag = null; stage.classList.remove("dragging"); });

  stage.addEventListener("wheel", e => {
    e.preventDefault();
    const rect = stage.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const wx = (mx - state.x) / state.scale;
    const wy = (my - state.y) / state.scale;
    const factor = Math.exp(-e.deltaY * 0.0014);
    state.scale = Math.max(0.4, Math.min(1.8, state.scale * factor));
    state.x = mx - wx * state.scale;
    state.y = my - wy * state.scale;
    clampPan();
    apply();
  }, { passive: false });

  document.querySelectorAll("[data-zoom]").forEach(btn => {
    btn.addEventListener("click", () => {
      const { vw, vh } = viewport();
      const action = btn.dataset.zoom;
      if (action === "fit") { fitAll(); return; }
      const cx = vw / 2, cy = vh / 2;
      const wx = (cx - state.x) / state.scale, wy = (cy - state.y) / state.scale;
      state.scale = Math.max(0.4, Math.min(1.8, state.scale * (action === "in" ? 1.15 : 0.87)));
      state.x = cx - wx * state.scale;
      state.y = cy - wy * state.scale;
      clampPan();
      apply();
    });
  });

  // crumb
  function updateCrumb() {
    const crumb = document.getElementById("crumb");
    if (!state.subject) { crumb.innerHTML = ""; return; }
    const s = SUBJECTS.find(x => x.id === state.subject);
    let html = `<b>${esc(s.name)}</b>`;
    if (state.chapter) {
      const ch = s.chapters.find(c => c.id === state.chapter);
      if (ch) html += `<span class="sep">/</span><span>${esc(ch.no)} · ${esc(ch.title)}</span>`;
    }
    crumb.innerHTML = html;
  }

  /* ---------------- in-page reader ---------------- */
  const readerEl = document.getElementById("reader");
  const readerArticle = document.getElementById("readerArticle");
  const readerToc = document.getElementById("readerToc");
  const readerCrumb = document.getElementById("readerCrumb");
  const readerDownload = document.getElementById("readerDownload");
  const readerBar = document.getElementById("readerBar");
  const chPending = {};
  let readerChapter = null;
  let spySections = [];

  function ensureChapter(id, cb, fail) {
    if (window.ATLAS_CH && window.ATLAS_CH[id]) { cb(window.ATLAS_CH[id]); return; }
    if (chPending[id]) { chPending[id].push(cb); return; }
    chPending[id] = [cb];
    const sc = document.createElement("script");
    sc.src = "web/" + id + ".js";
    sc.onload = () => {
      const fns = chPending[id] || [];
      delete chPending[id];
      if (!window.ATLAS_CH || !window.ATLAS_CH[id]) { if (fail) fail(); return; }
      fns.forEach(fn => fn(window.ATLAS_CH[id]));
    };
    sc.onerror = () => { delete chPending[id]; if (fail) fail(); };
    document.head.appendChild(sc);
  }

  function renderMathIn(root) {
    if (!window.renderMathInElement) return;
    try {
      window.renderMathInElement(root, {
        delimiters: [
          { left: "\\(", right: "\\)", display: false },
          { left: "\\[", right: "\\]", display: true },
        ],
        throwOnError: false,
      });
    } catch (err) { /* leave raw text rather than break the page */ }
  }

  function readerNavHtml(ch) {
    const left = ch.prev
      ? `<a class="left" href="#read=${esc(ch.prev.id)}" data-read="${esc(ch.prev.id)}"><span>上一章</span><b>${esc(ch.prev.title)}</b></a>`
      : `<span class="empty"></span>`;
    const right = ch.next
      ? `<a class="right" href="#read=${esc(ch.next.id)}" data-read="${esc(ch.next.id)}"><span>下一章</span><b>${esc(ch.next.title)}</b></a>`
      : `<span class="empty"></span>`;
    return `<div class="reader-nav">${left}${right}</div>`;
  }

  function readerTocHtml(ch) {
    const parts = [`<div class="toc-label">本章考点 · ${ch.toc.length}</div>`];
    ch.toc.forEach(kp => {
      parts.push(`<a href="#" data-target="${esc(kp.id)}"><span class="n">${esc(kp.no)}</span><span>${esc(kp.name)}</span></a>`);
    });
    if (ch.topics && ch.topics.length) {
      parts.push(`<div class="toc-sub"><div class="toc-label">专题 · ${ch.topics.length}</div>`);
      ch.topics.forEach(tp => {
        parts.push(`<a href="#" data-target="${esc(tp.id)}"><span class="n">${esc(tp.no)}</span><span>${esc(tp.name)}</span></a>`);
      });
      parts.push("</div>");
    }
    if (ch.hasSummary) {
      parts.push(`<div class="toc-sub"><a href="#" data-target="summary"><span class="n">—</span><span>本章收口 · 自测清单</span></a></div>`);
    }
    const nav = [];
    if (ch.prev) nav.push(`<a href="#read=${esc(ch.prev.id)}" data-read="${esc(ch.prev.id)}"><span>上一章</span>${esc(ch.prev.title)}</a>`);
    if (ch.next) nav.push(`<a href="#read=${esc(ch.next.id)}" data-read="${esc(ch.next.id)}"><span>下一章</span>${esc(ch.next.title)}</a>`);
    parts.push(`<div class="toc-nav">${nav.join("")}</div>`);
    return parts.join("");
  }

  function wireBank() {
    const base = "practice.html";
    const links = [...readerArticle.querySelectorAll(".kp-bank")];
    if (!base) { links.forEach(a => a.remove()); return; }
    links.forEach(a => {
      const u = new URL(base, location.href);
      u.searchParams.set("subject", a.dataset.bankSubject || "");
      u.searchParams.set("chapter", a.dataset.bankChapter || "");
      u.searchParams.set("kp", a.dataset.bankKp || "");
      const difficulty = new URLSearchParams(location.search).get("difficulty");
      if (difficulty) u.searchParams.set("difficulty", difficulty);
      a.href = u.toString();
      a.removeAttribute("hidden");
    });
  }

  function showReader(ch, kpId, fromRoute) {
    readerChapter = ch;
    readerEl.style.setProperty("--accent", ch.accent);
    readerEl.style.setProperty("--soft", ch.soft);
    readerCrumb.innerHTML = `<b>${esc(ch.subjectName)}</b><span class="sep">/</span><span>${esc(ch.code)} · ${esc(ch.title)}</span>`;
    readerDownload.href = ch.pdf;
    readerDownload.setAttribute("download", ch.id + ".pdf");
    const vocabLink = document.getElementById("readerVocab");
    if (vocabLink) vocabLink.hidden = ch.subject !== "english";
    readerToc.innerHTML = readerTocHtml(ch);
    readerArticle.innerHTML = ch.html + readerNavHtml(ch);
    wireBank();
    if (/^english(?:2)?-0[5678]$/.test(ch.id) && window.AtlasCoach) {
      const coach = document.createElement("button"); coach.type = "button"; coach.textContent = "AI 写作与翻译指导";
      coach.addEventListener("click", () => window.AtlasCoach.open({subject:ch.subject, chapter:ch.id, title:ch.title}));
      readerArticle.prepend(coach);
    }
    readerEl.scrollTop = 0;
    readerEl.classList.add("open");
    readerEl.setAttribute("aria-hidden", "false");
    document.body.classList.add("reader-open");
    document.title = ch.title + " · 考研科目大观";
    history.replaceState(null, "", "#read=" + ch.id + (kpId ? "&kp=" + kpId : ""));
    renderMathIn(readerArticle);
    spySections = [...readerArticle.querySelectorAll("[id]")].filter(n => /^(kp|topic|summary)/.test(n.id));
    if (kpId) {
      const jump = () => {
        const t = document.getElementById(kpId);
        if (t) t.scrollIntoView({ block: "start" });
      };
      jump();
      setTimeout(() => { jump(); updateReaderChrome(); }, 160);
    }
    updateReaderChrome();
    try { document.getElementById("readerBack").focus({ preventScroll: true }); } catch (err) { /* ignore */ }
    if (fromRoute && state.chapter !== ch.id) {
      state.subject = ch.subject;
      state.chapter = ch.id;
      render();
      const target = [...nodesEl.querySelectorAll(".chapter")].find(n => n.dataset.id === ch.id);
      if (target) focusChapter(parseFloat(target.style.top));
      updateCrumb();
    }
  }

  function openReader(id, kpId, fromRoute) {
    if (!id) return;
    if (/^custom-.+-intro$/.test(id)) {
      const subject = SUBJECTS.find(s => id === s.id + "-intro");
      const name = subject ? subject.name : "自定义专业课";
      readerToc.innerHTML = "";
      readerCrumb.innerHTML = `<b>${esc(name)}</b><span class="sep">/</span><span>专业课</span>`;
      readerDownload.hidden = true;
      readerArticle.innerHTML = `<section class="cover"><div class="ekicker">PROFESSIONAL</div><h1>${esc(name)}</h1><p class="cover-sub">这门专业课的章节内容还没有录入。可以先把讲义或真题上传到资料库，用 AI 抽题后加入个人题库；录入章节后会自动出现在这里。</p><p><a class="btn" href="library.html">打开资料库</a> <a class="btn ghost" href="practice.html">去刷题</a></p></section>`;
      readerEl.scrollTop = 0;
      readerEl.classList.add("open");
      readerEl.setAttribute("aria-hidden", "false");
      document.body.classList.add("reader-open");
      document.title = name + " · 考研科目大观";
      history.replaceState(null, "", "#read=" + id);
      return;
    }
    ensureChapter(id, ch => showReader(ch, kpId || null, !!fromRoute), () => {
      readerToc.innerHTML = "";
      readerArticle.innerHTML = `<section class="cover"><h1>讲义加载失败</h1><p class="cover-sub">找不到 web/${esc(id)}.js，请重新运行 py src/build/build_web.py。</p></section>`;
      readerEl.classList.add("open");
      readerEl.setAttribute("aria-hidden", "false");
      document.body.classList.add("reader-open");
    });
  }

  function closeReader() {
    readerEl.classList.remove("open");
    readerEl.setAttribute("aria-hidden", "true");
    document.body.classList.remove("reader-open");
    readerToc.classList.remove("open");
    readerChapter = null;
    document.title = "考研科目大观 · 2027 · 华南理工 085500";
    if (location.hash.indexOf("#read=") === 0) {
      history.replaceState(null, "", location.pathname + location.search);
    }
  }

  function updateReaderChrome() {
    let active = null;
    spySections.forEach(node => {
      if (node.getBoundingClientRect().top <= 130) active = node.id;
    });
    readerToc.querySelectorAll("a[data-target]").forEach(a => {
      a.classList.toggle("active", a.dataset.target === active);
    });
    const max = readerEl.scrollHeight - readerEl.clientHeight;
    if (readerBar) readerBar.style.width = (max > 0 ? Math.min(100, readerEl.scrollTop / max * 100) : 0) + "%";
  }

  let spyLast = 0;
  readerEl.addEventListener("scroll", () => {
    const now = Date.now();
    if (now - spyLast < 60) return;
    spyLast = now;
    updateReaderChrome();
  }, { passive: true });

  readerToc.addEventListener("click", e => {
    const link = e.target.closest("a");
    if (!link) return;
    if (link.dataset.read) { e.preventDefault(); openReader(link.dataset.read); return; }
    if (link.dataset.target) {
      e.preventDefault();
      const t = document.getElementById(link.dataset.target);
      if (t) t.scrollIntoView({ block: "start", behavior: "smooth" });
      readerToc.classList.remove("open");
      setTimeout(updateReaderChrome, 520);
    }
  });

  readerArticle.addEventListener("click", e => {
    const link = e.target.closest("[data-read]");
    if (link) { e.preventDefault(); openReader(link.dataset.read); }
  });

  document.getElementById("readerBack").addEventListener("click", closeReader);
  const readerTocBtn = document.getElementById("readerTocBtn");
  if (readerTocBtn) readerTocBtn.addEventListener("click", () => readerToc.classList.toggle("open"));
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && readerEl.classList.contains("open")) closeReader();
  });

  function routeHash() {
    const h = location.hash || "";
    const m = h.match(/^#read=([A-Za-z0-9_-]+)(?:&kp=([A-Za-z0-9_-]+))?/);
    if (m) {
      if (!readerEl.classList.contains("open") || !readerChapter || readerChapter.id !== m[1]) {
        openReader(m[1], m[2] || null, true);
      }
    } else if (readerEl.classList.contains("open")) {
      closeReader();
    }
  }

  /* ---------------- search ---------------- */
  const searchItems = [];
  SUBJECTS.forEach(s => {
    (s.chapters || []).forEach(ch => {
      searchItems.push({ label: ch.title, sub: s.name + " · " + ch.no, color: s.accent, kind: "chapter", sid: s.id, cid: ch.id });
      ch.kps.forEach(kp => searchItems.push({ label: kp.name, sub: s.name + " / " + ch.title, color: s.accent, kind: "kp", cid: ch.id, kid: kp.id }));
      (ch.topics || []).forEach(tp => searchItems.push({ label: tp.name, sub: s.name + " / 专题 · " + ch.title, color: s.accent, kind: "topic", cid: ch.id, kid: tp.id }));
    });
  });

  const overlay = document.getElementById("searchOverlay");
  const input = document.getElementById("searchInput");
  const resultsEl = document.getElementById("searchResults");
  let searchHits = [], activeHit = 0;

  function openSearch() {
    overlay.hidden = false;
    input.value = "";
    renderSearch("");
    setTimeout(() => input.focus(), 20);
  }
  function closeSearch() { overlay.hidden = true; }

  function renderSearch(q) {
    const needle = q.trim().toLowerCase();
    searchHits = needle
      ? searchItems.filter(it => (it.label + " " + it.sub).toLowerCase().includes(needle)).slice(0, 60)
      : searchItems.filter(it => it.kind === "chapter").slice(0, 40);
    activeHit = 0;
    if (!searchHits.length) {
      resultsEl.innerHTML = '<div class="sr-empty">没有匹配的章节或考点。</div>';
      return;
    }
    resultsEl.innerHTML = searchHits.map((it, i) => `
      <button class="sr-item ${i === 0 ? "active" : ""}" data-i="${i}">
        <span class="sr-dot" style="background:${it.color}"></span>
        <span>${esc(it.label)}</span>
        <span class="sr-sub">${esc(it.sub)}</span>
      </button>`).join("");
  }

  function activateHit(i) {
    const it = searchHits[i];
    if (!it) return;
    closeSearch();
    openReader(it.cid, it.kid || null);
  }

  resultsEl.addEventListener("click", e => {
    const btn = e.target.closest(".sr-item");
    if (btn) activateHit(Number(btn.dataset.i));
  });
  input.addEventListener("input", () => renderSearch(input.value));
  input.addEventListener("keydown", e => {
    if (e.key === "Escape") { closeSearch(); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      activeHit = (activeHit + (e.key === "ArrowDown" ? 1 : -1) + searchHits.length) % Math.max(1, searchHits.length);
      [...resultsEl.querySelectorAll(".sr-item")].forEach((n, i) => n.classList.toggle("active", i === activeHit));
      const active = resultsEl.querySelector(".sr-item.active");
      if (active) active.scrollIntoView({ block: "nearest" });
      return;
    }
    if (e.key === "Enter") { e.preventDefault(); activateHit(activeHit); }
  });
  overlay.addEventListener("click", e => { if (e.target === overlay) closeSearch(); });
  document.getElementById("searchBtn").addEventListener("click", openSearch);
  document.addEventListener("keydown", e => {
    if (e.key === "/" && !/input|textarea/i.test(document.activeElement.tagName)) {
      e.preventDefault(); openSearch();
    }
    if (e.key === "Escape") closeSearch();
  });

  /* ---------------- list sheet ---------------- */
  const sheet = document.getElementById("listSheet");
  const listBody = document.getElementById("listBody");

  function buildList() {
    listBody.innerHTML = SUBJECTS.map(s => `
      <div class="ls-subject" style="color:${s.accent}"><b>${esc(s.name)}</b><span>${s.chapterCount} 章 · ${s.kpCount} 考点</span></div>
      ${s.overview ? `<div class="ls-top"><button class="ls-read" data-read="${esc(s.overview.id)}">阅读学科总览 →</button></div>` : ""}
      ${s.chapters.map(ch => `
        <div class="ls-chapter" data-cid="${esc(ch.id)}">
          <div class="ls-row" role="button" tabindex="0">
            <span class="n">${esc(ch.no)}</span>
            <span class="t">${esc(ch.title)}</span>
            ${ch.priority ? `<span class="p">${esc(ch.priority)}</span>` : ""}
            <button class="ls-read" data-read="${esc(ch.id)}" title="在页内阅读本章">阅读</button>
            <button class="ls-pdf" data-pdf="${esc(ch.pdf)}" data-page="1" title="下载整章 PDF">PDF</button>
          </div>
          <div class="ls-kps">
            ${ch.kps.map(kp => `<button class="ls-kp" data-read="${esc(ch.id)}" data-kp="${esc(kp.id)}"><span class="tag">${esc(kp.freq || "")}</span>${esc(kp.name)}</button>`).join("")}
            ${ch.topics.map(tp => `<button class="ls-kp" data-read="${esc(ch.id)}" data-kp="${esc(tp.id)}"><span class="tag">专题</span>${esc(tp.name)}</button>`).join("")}
          </div>
        </div>`).join("")}`).join("");
  }
  listBody.addEventListener("click", e => {
    const direct = e.target.closest(".ls-pdf");
    if (direct) { openPdf(direct.dataset.pdf, direct.dataset.page); return; }
    const read = e.target.closest("[data-read]");
    if (read) {
      sheet.hidden = true;
      openReader(read.dataset.read, read.dataset.kp || null);
      return;
    }
    const row = e.target.closest(".ls-row");
    if (row) { row.parentElement.classList.toggle("open"); }
  });
  listBody.addEventListener("keydown", e => {
    if ((e.key === "Enter" || e.key === " ") && e.target.classList.contains("ls-row")) {
      e.preventDefault(); e.target.parentElement.classList.toggle("open");
    }
  });
  document.getElementById("listBtn").addEventListener("click", () => {
    sheet.hidden = false;
    buildList();
  });
  document.getElementById("closeSheet").addEventListener("click", () => { sheet.hidden = true; });
  document.addEventListener("keydown", e => { if (e.key === "Escape") sheet.hidden = true; });

  /* ---------------- mobile ---------------- */
  function buildMobile() {
    const host = document.getElementById("mobileList");
    if (!host) return;
    host.innerHTML = SUBJECTS.map(s => `
      <section class="m-subject" style="--accent:${s.accent}">
        <div class="m-name">${esc(s.name)}</div>
        ${s.overview ? `<a class="m-overview" href="#read=${esc(s.overview.id)}" style="font-size:11px;color:${s.accent}">阅读学科总览 →</a>` : ""}
        ${s.id === "english" ? `<a class="m-vocab" href="vocab.html#test" style="color:${s.accent};border-color:${s.accent}">词汇自测 · 5529 大纲词 →</a>` : ""}
        ${s.chapters.map(ch => `<a class="m-chapter" href="#read=${esc(ch.id)}">${esc(ch.no)} · ${esc(ch.title)}<span>${ch.kps.length} 考点</span></a>`).join("")}
      </section>`).join("");
  }

  /* ---------------- boot ---------------- */
  function buildNav() {
    const nav = document.getElementById("subjectNav");
    if (!nav) return;
    nav.innerHTML = SUBJECTS.map(s =>
      `<button data-sid="${esc(s.id)}" style="--accent:${s.accent}">${esc(s.name)}</button>`).join("");
    nav.addEventListener("click", e => {
      const btn = e.target.closest("[data-sid]");
      if (!btn) return;
      const sid = btn.dataset.sid;
      if (state.subject === sid) {
        state.subject = null; state.chapter = null;
        render(); fitAll();
      } else {
        state.subject = sid; state.chapter = null;
        render(); focusSubject(sid);
      }
      updateCrumb();
    });
  }
  function syncNav() {
    document.querySelectorAll("#subjectNav button").forEach(b => {
      b.classList.toggle("active", b.dataset.sid === state.subject);
    });
  }

  function fillStats() {
    const st = DATA.stats;
    document.getElementById("stats").innerHTML = `
      <span class="stat"><b>${SUBJECTS.length}</b>科目</span>
      <span class="stat"><b>${st.chapters}</b>章</span>
      <span class="stat"><b>${st.kps}</b>考点</span>
      <span class="stat"><b>${st.exams}</b>章节题</span>
      <span class="stat"><b>${st.bank || 4662}</b>题库题</span>`;
    document.getElementById("legend").innerHTML = SUBJECTS.map(s =>
      `<span><i style="background:${s.accent}"></i>${esc(s.name)}</span>`).join("");
    const cd = document.getElementById("countdown");
    if (cd) cd.innerHTML = `距初试 <b>${daysLeft()}</b> 天 · 2026.12.19`;
  }

  const params = new URLSearchParams(location.search);
  const s0 = params.get("s"), c0 = params.get("c");
  if (s0 && SUBJECTS.some(x => x.id === s0)) {
    state.subject = s0;
    if (c0) state.chapter = c0;
  }

  buildNav();
  render();
  if (params.get("view") === "list") {
    sheet.hidden = false;
    buildList();
  }
  if (params.get("q")) {
    openSearch();
    input.value = params.get("q");
    renderSearch(params.get("q"));
  }
  if (state.subject) {
    const target = state.chapter && [...nodesEl.querySelectorAll(".chapter")].find(n => n.dataset.id === state.chapter);
    if (target) focusChapter(parseFloat(target.style.top)); else focusSubject(state.subject);
  } else {
    fitAll();
  }
  fillStats();
  buildMobile();
  updateCrumb();
  routeHash();
  window.addEventListener("hashchange", routeHash);
  window.addEventListener("resize", () => { render(); });
})();
