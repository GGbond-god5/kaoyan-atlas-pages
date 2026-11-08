(function () {
  "use strict";
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const SUBJECTS = (window.ATLAS && window.ATLAS.subjects) || [];
  const FILES = window.BANK_FILES || {};
  const DONE_KEY = "atlas.bank.done";

  const SOURCES = [
    { id: "pol-xiao1000", subject: "politics", name: "肖秀荣 1000 题", kind: "选择题", coverage: "马原 / 毛中特 / 史纲 / 思修 / 新思想", note: "一刷按章，二刷只做错题；错题回看解析的“为什么错”。" },
    { id: "pol-xiao8", subject: "politics", name: "肖八（8 套卷）", kind: "套卷", coverage: "选择 + 分析题", note: "选择题限时 50 分钟，分析题只看设问与答案结构。" },
    { id: "pol-xiao4", subject: "politics", name: "肖四（4 套卷）", kind: "押题卷", coverage: "分析题为主", note: "分析题按“点—析—结”背，不逐字背整段。" },
    { id: "pol-zhenti", subject: "politics", name: "政治历年真题", kind: "真题", coverage: "2010–2026", note: "选择题用来校准命题口径；分析题看近三年。" },

    { id: "math-zhenti", subject: "math", name: "数学一历年真题", kind: "真题", coverage: "2005–2026", note: "2016 年后重点；限时 180 分钟整套做。" },
    { id: "math-lin6", subject: "math", name: "李林 6 套卷", kind: "模拟卷", coverage: "6 套", note: "计算量与综合度接近真题，适合冲刺期限时。" },
    { id: "math-zhang4", subject: "math", name: "张宇四套卷", kind: "模拟卷", coverage: "4 套", note: "难度偏高，用来查概念漏洞，不用来估分。" },
    { id: "math-hefei", subject: "math", name: "合工大超越", kind: "模拟卷", coverage: "仅取最近两年", note: "选填与计算题质量高；只做近两年，避免陈旧题型。" },

    { id: "eng-zhenti", subject: "english", name: "英语一历年真题", kind: "真题", coverage: "2010–2026", note: "阅读二刷只做错题与犹豫题；留最近 3 套模考。" },
    { id: "eng-writing", subject: "english", name: "作文句式库", kind: "积累", coverage: "功能句 + 话题词", note: "先背功能句，再用真题题目成稿；不要背整篇模板。" },

    { id: "mech-zhenti", subject: "mechanics", name: "807 历年真题与解析", kind: "真题", coverage: "1995–2026（2020 前代码 801）", note: "重点 2024–2026；超静定、能量法、稳定、组合变形按题型归类。" },
    { id: "mech-zhang", subject: "mechanics", name: "张晓晴教材与学习指导", kind: "教材题", coverage: "例题 + 课后题", note: "华工本科教材，真题多由此改编；课后题至少两遍。" },
    { id: "mech-330", subject: "mechanics", name: "瞌睡哥 220 / 330 题", kind: "强化题", coverage: "基础 + 强化", note: "220 打底，330 强化；图乘法、超静定、稳定优先。" }
  ];

  const SUBJECT_META = {
    politics: { name: "政治", color: "#A02C2C" },
    math: { name: "数学一", color: "#1F3A5F" },
    english: { name: "英语一", color: "#5B3A6B" },
    mechanics: { name: "807 材料力学", color: "#8A4B2A" }
  };

  function doneSet() {
    try { return new Set(JSON.parse(localStorage.getItem(DONE_KEY) || "[]")); } catch (e) { return new Set(); }
  }
  function saveDone(set) { try { localStorage.setItem(DONE_KEY, JSON.stringify([...set])); } catch (e) { /* ignore */ } }

  function findContext() {
    const p = new URLSearchParams(location.search);
    const cid = p.get("chapter"), kid = p.get("kp");
    if (!cid) return null;
    for (const s of SUBJECTS) {
      const ch = (s.chapters || []).find(c => c.id === cid);
      if (!ch) continue;
      const kp = (ch.kps || []).find(k => k.id === kid) || (ch.topics || []).find(t => t.id === kid);
      return { subject: s, chapter: ch, kp: kp || null };
    }
    return null;
  }

  function renderContext(ctx) {
    const box = $("#bcontext");
    if (!ctx) { box.innerHTML = ""; return; }
    const read = `index.html#read=${encodeURIComponent(ctx.chapter.id)}${ctx.kp ? "&kp=" + encodeURIComponent(ctx.kp.id) : ""}`;
    box.innerHTML = `<span>当前考点</span><b>${esc(ctx.subject.name)} · ${esc(ctx.chapter.title)}${ctx.kp ? " / " + esc(ctx.kp.name) : ""}</b>
      <span class="bctxlinks"><a href="${read}" target="_blank" rel="noopener">去读考点 ↗</a><a href="index.html#read=${encodeURIComponent(ctx.chapter.id)}" target="_blank" rel="noopener">整章讲义 ↗</a></span>`;
  }

  function fileLinks(id) {
    const list = FILES[id] || [];
    if (!list.length) return "";
    return `<div class="bfiles">${list.slice(0, 6).map(f => `<a href="${esc(f)}" target="_blank" rel="noopener">${esc(f.split("/").pop())} ↗</a>`).join("")}</div>`;
  }

  function renderSources(ctx) {
    const done = doneSet();
    const groups = {};
    SOURCES.forEach(s => (groups[s.subject] = groups[s.subject] || []).push(s));
    $("#bsources").innerHTML = Object.keys(SUBJECT_META).map(sid => {
      const meta = SUBJECT_META[sid];
      const cards = groups[sid].map(s => `
        <div class="bcard" data-id="${s.id}" style="border-top:2px solid ${meta.color}">
          <button class="bdone ${done.has(s.id) ? "on" : ""}" data-done="${s.id}">${done.has(s.id) ? "已过一轮" : "标记一轮"}</button>
          <div class="bk">${esc(s.kind)}</div>
          <h4>${esc(s.name)}</h4>
          <div class="bmeta">${esc(s.coverage)}</div>
          <p>${esc(s.note)}</p>
          ${fileLinks(s.id) || '<div class="bempty">未发现本地文件。把资料放进 <code>bank/' + s.id + '/</code> 后运行 <code>py src/build/build_bank.py</code>。</div>'}
        </div>`).join("");
      return `<section class="bsubject"><h3><i style="background:${meta.color}"></i>${esc(meta.name)}</h3><div class="bsources">${cards}</div></section>`;
    }).join("");
  }

  function renderSearch(q) {
    const items = [];
    SUBJECTS.forEach(s => (s.chapters || []).forEach(ch => {
      (ch.kps || []).forEach(kp => items.push({ s, ch, kp, label: kp.name, sub: s.name + " / " + ch.title }));
      (ch.topics || []).forEach(tp => items.push({ s, ch, kp: tp, label: tp.name, sub: s.name + " / 专题 · " + ch.title }));
    }));
    const needle = (q || "").trim().toLowerCase();
    const hits = (needle ? items.filter(x => (x.label + " " + x.sub).toLowerCase().includes(needle)) : items).slice(0, 60);
    $("#bresults").innerHTML = hits.length ? hits.map(x => `
      <div class="brow" data-cid="${esc(x.ch.id)}" data-kid="${esc(x.kp.id)}">
        <span class="bno">${esc(x.s.name)}</span>
        <span><span class="bt">${esc(x.label)}</span><br><span class="bs">${esc(x.sub)}</span></span>
        <a class="bact" target="_blank" rel="noopener" href="index.html#read=${encodeURIComponent(x.ch.id)}&kp=${encodeURIComponent(x.kp.id)}">读考点 ↗</a>
      </div>`).join("") : '<div class="bempty">没有匹配的考点。</div>';
  }

  const CAT = window.BANK_CATALOG || [];
  const catState = { type: "all", subject: "all", q: "", limit: 60 };

  function renderCatStats() {
    const types = {};
    const subs = {};
    CAT.forEach(x => { types[x.type] = (types[x.type] || 0) + 1; subs[x.subject] = (subs[x.subject] || 0) + 1; });
    const pages = CAT.reduce((n, x) => n + (x.pages || 0), 0);
    $("#bcatStats").innerHTML = `<span><b>${CAT.length}</b>份 PDF</span><span><b>${pages.toLocaleString()}</b>页</span>` +
      Object.entries(types).map(([k, v]) => `<span>${esc(k)} <b>${v}</b></span>`).join("");
    const tSel = $("#bcatType"), sSel = $("#bcatSubject");
    tSel.innerHTML = `<option value="all">全部类型</option>` + Object.keys(types).map(k => `<option value="${esc(k)}">${esc(k)}（${types[k]}）</option>`).join("");
    sSel.innerHTML = `<option value="all">全部科目</option>` + Object.keys(subs).map(k => `<option value="${esc(k)}">${esc(k)}（${subs[k]}）</option>`).join("");
  }

  function catFiltered() {
    const q = catState.q.trim().toLowerCase();
    return CAT.filter(x => {
      if (catState.type !== "all" && x.type !== catState.type) return false;
      if (catState.subject !== "all" && x.subject !== catState.subject) return false;
      if (q && !(x.path + " " + x.source + " " + (x.title || "")).toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function renderCatList() {
    const rows = catFiltered();
    const show = rows.slice(0, catState.limit);
    $("#bcatList").innerHTML = show.length ? show.map(x => `
      <div class="bcat-row">
        <span class="ck ${x.type === "真题" ? "real" : ""}">${esc(x.type)}</span>
        <a href="${encodeURI("bank/" + x.view)}" target="_blank" rel="noopener" title="${esc(x.path)}">${esc(x.path.split("/").pop())}</a>
        <span class="cs">${esc(x.source)}</span>
        <span class="cp">${x.pages}p</span>
        <span class="cp">${x.kind === "text" ? "文字版" : "扫描"}</span>
      </div>`).join("") : '<div class="bempty">没有匹配的资料。</div>';
    $("#bcatMore").hidden = show.length >= rows.length;
    $("#bcatMore").textContent = `加载更多（已显示 ${show.length} / ${rows.length}）`;
  }

  $("#bcatType").addEventListener("change", e => { catState.type = e.target.value; catState.limit = 60; renderCatList(); });
  $("#bcatSubject").addEventListener("change", e => { catState.subject = e.target.value; catState.limit = 60; renderCatList(); });
  let catTimer = null;
  $("#bcatSearch").addEventListener("input", e => {
    clearTimeout(catTimer);
    catTimer = setTimeout(() => { catState.q = e.target.value; catState.limit = 60; renderCatList(); }, 120);
  });
  $("#bcatMore").addEventListener("click", () => { catState.limit += 60; renderCatList(); });

  const IMPORT = window.IMPORT_LIST || { items: [] };
  const IMPORT_KEY = "atlas.bank.imported";

  function importedSet() {
    try { return new Set(JSON.parse(localStorage.getItem(IMPORT_KEY) || "[]")); } catch (e) { return new Set(); }
  }
  function saveImported(set) { try { localStorage.setItem(IMPORT_KEY, JSON.stringify([...set])); } catch (e) { /* ignore */ } }

  function renderImport() {
    const items = IMPORT.items || [];
    const done = importedSet();
    if (!items.length) { $("#bimport").innerHTML = ""; return; }
    const groups = {};
    items.forEach(i => { (groups[i.target] = groups[i.target] || []).push(i); });
    const total = items.length;
    const parts = [`<div class="bimp-head"><span>已导入 <b>${done.size}</b> / ${total} · 约 ${Math.round(items.reduce((n, i) => n + i.size, 0))} MB</span>
      <button id="copyImport">复制完整清单</button></div>`];
    Object.keys(groups).forEach(target => {
      parts.push(`<div class="bimp-group"><h3>${esc(target)}</h3>`);
      groups[target].forEach(i => {
        const on = done.has(i.id);
        const short = i.path.split("/").slice(-2).join("/");
        parts.push(`<div class="bimp-row ${on ? "done" : ""}">
          <input type="checkbox" data-imp="${esc(i.id)}" ${on ? "checked" : ""}>
          <span class="bname"><b>${esc(i.name)}</b><span class="bpath" title="${esc(i.path)}">${esc(short)}</span></span>
          <span class="bsize">${i.size} MB</span>
          <span class="btarget">${esc(i.target)}</span>
          <button class="bcopy" title="复制完整路径" data-copy="${esc(i.path)}">⧉</button>
        </div>`);
      });
      parts.push("</div>");
    });
    parts.push('<p class="bimp-note">夸克分享的下载/转存需要登录；请在夸克网页或 App 里按上面路径下载，再放进对应 <code>bank/</code> 子目录，最后运行 <code>py src/build/build_bank.py</code>。清单会记住已导入项。</p>');
    $("#bimport").innerHTML = parts.join("");
  }

  $("#bimport").addEventListener("change", e => {
    const box = e.target.closest("[data-imp]");
    if (!box) return;
    const set = importedSet();
    if (box.checked) set.add(box.dataset.imp); else set.delete(box.dataset.imp);
    saveImported(set);
    box.closest(".bimp-row")?.classList.toggle("done", box.checked);
    const count = $("#bimport .bimp-head b");
    if (count) count.textContent = set.size;
  });

  $("#bimport").addEventListener("click", e => {
    const cp = e.target.closest("[data-copy]");
    if (cp) {
      const text = cp.dataset.copy;
      const done = () => { cp.textContent = "✓"; setTimeout(() => cp.textContent = "⧉", 900); };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done).catch(() => {});
      return;
    }
    if (e.target.closest("#copyImport")) {
      const text = (IMPORT.items || []).map(i => `${i.name}\t${i.target}\t${i.path}`).join("\n");
      if (navigator.clipboard) navigator.clipboard.writeText(text);
      const b = e.target.closest("#copyImport");
      b.textContent = "已复制";
      setTimeout(() => b.textContent = "复制完整清单", 1200);
    }
  });

  function renderFiles() {
    const ids = Object.keys(FILES).filter(k => (FILES[k] || []).length);
    if (!ids.length) {
      $("#bfiles").innerHTML = '<div class="bempty">还没有本地题库文件。把 PDF/图片放进 <code>bank/&lt;来源ID&gt;/</code>，再运行 <code>py src/build/build_bank.py</code>；来源 ID 见上方卡片（如 <code>pol-xiao1000</code>、<code>math-zhenti</code>、<code>mech-zhenti</code>）。</div>';
      return;
    }
    $("#bfiles").innerHTML = `<div class="bfiles-list">${ids.flatMap(id => FILES[id].map(f => `<a href="${esc(f)}" target="_blank" rel="noopener">${esc(id)} / ${esc(f.split("/").pop())} ↗</a>`)).join("")}</div>`;
  }

  document.addEventListener("click", e => {
    const done = e.target.closest("[data-done]");
    if (done) {
      const set = doneSet();
      const id = done.dataset.done;
      if (set.has(id)) set.delete(id); else set.add(id);
      saveDone(set);
      done.classList.toggle("on", set.has(id));
      done.textContent = set.has(id) ? "已过一轮" : "标记一轮";
      return;
    }
    const row = e.target.closest(".brow");
    if (row && !e.target.closest("a")) {
      const p = new URLSearchParams(location.search);
      p.set("chapter", row.dataset.cid); p.set("kp", row.dataset.kid);
      history.replaceState(null, "", "?" + p.toString());
      renderContext(findContext());
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  });

  let timer = null;
  $("#bsearch").addEventListener("input", e => {
    clearTimeout(timer);
    timer = setTimeout(() => renderSearch(e.target.value), 120);
  });

  renderContext(findContext());
  renderSources();
  renderSearch("");
  renderCatStats();
  renderCatList();
  renderImport();
  renderFiles();
})();
