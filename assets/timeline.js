(function () {
  "use strict";
  const T = window.TIMELINE;
  if (!T) return;
  const EVENTS = T.events.slice().sort((a, b) => a.year - b.year || a.date.localeCompare(b.date));
  const ERAS = T.eras;
  const eraMap = Object.fromEntries(ERAS.map(e => [e.id, e]));
  // 毛中特关联（assets/timeline-links.js）：按挂钩事件 id 分组，组内按条目自身日期排序
  const REL_TYPES = { work: "著作", meeting: "会议", thought: "思想" };
  const relMap = {};
  (window.TIMELINE_LINKS || []).forEach(r => {
    (relMap[r.event] = relMap[r.event] || []).push(r);
  });
  Object.values(relMap).forEach(list => list.sort((a, b) => a.date.localeCompare(b.date)));
  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  let activeEra = "all";
  let query = "";

  function filtered() {
    const q = query.trim().toLowerCase();
    return EVENTS.filter(e => {
      if (activeEra !== "all" && e.era !== activeEra) return false;
      if (!q) return true;
      const relText = (relMap[e.id] || []).map(r => r.name + " " + r.note).join(" ");
      return (e.title + " " + e.summary + " " + e.date + " " + relText).toLowerCase().includes(q);
    });
  }

  function renderChips() {
    $("#teras").innerHTML = `<button data-era="all" class="on">全部</button>` +
      ERAS.map(e => `<button data-era="${e.id}">${esc(e.name)}</button>`).join("");
    $("#tlegend").innerHTML = ERAS.map(e =>
      `<span style="--era:${e.color}"><i style="background:${e.color}"></i>${esc(e.name)} · ${esc(e.range)}</span>`).join("");
  }

  function renderStats() {
    $("#tstats").innerHTML = `
      <div><b>${EVENTS.length}</b>个节点</div>
      <div><b>${ERAS.length}</b>个阶段</div>
      <div><b>1840–2026</b>时间跨度</div>`;
  }

  function render() {
    const list = filtered();
    if (!list.length) {
      $("#tline").innerHTML = '<div class="tempty">没有匹配的事件。</div>';
      return;
    }
    const parts = [];
    ERAS.forEach(era => {
      const items = list.filter(e => e.era === era.id);
      if (!items.length) return;
      parts.push(`<section class="tera" style="--era:${era.color}"><h2>${esc(era.name)}</h2><span>${esc(era.range)}</span></section>`);
      items.forEach(e => {
        const [y, md] = e.date.split(".");
        const links = (e.links || []).map(l =>
          `<a href="index.html#read=${esc(l.chapter)}&kp=${esc(l.kp)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join("");
        const bank = `<a class="bank" href="bank.html?subject=politics&chapter=${encodeURIComponent(e.links?.[0]?.chapter || "pol-05")}&kp=${encodeURIComponent(e.links?.[0]?.kp || "kp-01")}" target="_blank" rel="noopener">题库练习 ↗</a>`;
        const rels = relMap[e.id] || [];
        const relBlock = rels.length ? `<div class="trels">
            <button class="trels-btn" data-rels="${esc(e.id)}" aria-expanded="false">毛中特关联 · ${rels.length}</button>
            <div class="trels-list" hidden>${rels.map(r => `<div class="trel">
              <span class="trel-badge t-${esc(r.type)}">${esc(REL_TYPES[r.type] || "")}</span>
              <div class="trel-body"><b>${esc(r.name)}</b><span class="trel-date">${esc(r.date)}</span>
              <p>${esc(r.note)}</p>
              <a href="index.html#read=${esc(r.chapter)}&kp=${esc(r.kp)}" target="_blank" rel="noopener">${esc(r.label)} ↗</a></div>
            </div>`).join("")}</div>
          </div>` : "";
        parts.push(`<article class="tevent" style="--era:${era.color}" data-id="${esc(e.id)}">
          <div class="tdate"><b>${esc(y)}</b>${md ? "." + esc(md) : ""}</div>
          <div class="tcard">
            <h3>${esc(e.title)}</h3>
            <p>${esc(e.summary)}</p>
            <div class="tlinks">${links}${bank}</div>
            ${relBlock}
          </div>
        </article>`);
      });
    });
    $("#tline").innerHTML = parts.join("");
  }

  $("#teras").addEventListener("click", e => {
    const b = e.target.closest("[data-era]");
    if (!b) return;
    activeEra = b.dataset.era;
    [...$("#teras").children].forEach(x => x.classList.toggle("on", x === b));
    history.replaceState(null, "", activeEra === "all" ? "#all" : "#era=" + activeEra);
    render();
  });

  $("#tline").addEventListener("click", e => {
    const b = e.target.closest("[data-rels]");
    if (!b) return;
    const list = b.parentElement.querySelector(".trels-list");
    if (!list) return;
    const open = list.hidden;
    list.hidden = !open;
    b.classList.toggle("open", open);
    b.setAttribute("aria-expanded", String(open));
  });

  let timer = null;
  $("#tsearch").addEventListener("input", e => {
    clearTimeout(timer);
    timer = setTimeout(() => { query = e.target.value; render(); }, 120);
  });

  renderChips();
  renderStats();
  const h = location.hash || "";
  const m = h.match(/#era=([a-z]+)/);
  if (m && eraMap[m[1]]) {
    activeEra = m[1];
    [...$("#teras").children].forEach(x => x.classList.toggle("on", x.dataset.era === activeEra));
  }
  render();
})();
